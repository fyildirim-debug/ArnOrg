// Bing (HTML) ve Bing Haberler (RSS). Bağlantılar bing.com/ck/a?…&u=a1<base64url> biçiminde gelebilir; çözülür.
// Pazar ve dil SearXNG'deki gibi _EDGE_CD ve _EDGE_S çerezleriyle verilir.
import { DOMParser, parseHTML } from "linkedom";
import type { Dil } from "@arnorg/ortak";
import { iki } from "../../dil.js";
import { metneCevir, tarayiciBasliklari } from "../http.js";
import { durumuDenetle, gecerliAdres, isoZaman, kirp, MotorHatasi, sadeMetin, type Motor, type MotorIstegi, type MotorSonucu } from "./ortak.js";

function pazar(dil: Dil): string {
  return dil === "tr" ? "tr-TR" : "en-US";
}

function cerezler(dil: Dil): string {
  const p = pazar(dil);
  return `_EDGE_CD=m=${p}&u=${dil}; _EDGE_S=mkt=${p}&ui=${dil}`;
}

export function bingIstegi(i: MotorIstegi): { adres: string; basliklar: Record<string, string> } {
  const p = new URLSearchParams({ q: i.sorgu, pq: i.sorgu });
  // İkinci sayfadan sonra first ve FORM birlikte gider (FORM=PERE, PERE1, PERE2…)
  if (i.sayfa > 1) {
    p.set("first", String((i.sayfa - 1) * 10 + 1));
    p.set("FORM", i.sayfa === 2 ? "PERE" : `PERE${i.sayfa - 2}`);
  }
  return { adres: `https://www.bing.com/search?${p}`, basliklar: { ...tarayiciBasliklari(i.dil), Cookie: cerezler(i.dil) } };
}

/** bing.com/ck/a?…&u=a1<base64url> yönlendirmesini gerçek adrese çevirir; başka adres olduğu gibi döner */
export function bingAdresiCoz(href: string): string {
  try {
    const u = new URL(href, "https://www.bing.com/");
    if (/(^|\.)bing\.com$/i.test(u.hostname) && u.pathname === "/ck/a") {
      const ham = u.searchParams.get("u");
      if (ham && ham.startsWith("a1")) {
        const b64 = ham.slice(2).replace(/-/g, "+").replace(/_/g, "/");
        const dolgulu = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const cozulen = Buffer.from(dolgulu, "base64").toString("utf8");
        if (/^https?:\/\//i.test(cozulen)) return cozulen;
      }
    }
    return u.toString();
  } catch {
    return href;
  }
}

/** Bing sonuç sayfası: ol#b_results > li.b_algo; başlık h2 a, özet p */
export function bingAyristir(html: string): MotorSonucu[] {
  const { document } = parseHTML(html);
  const sonuclar: MotorSonucu[] = [];
  for (const li of document.querySelectorAll("li.b_algo")) {
    const a = li.querySelector("h2 a");
    const href = a?.getAttribute("href");
    if (!a || !href) continue;
    const adres = bingAdresiCoz(href);
    if (!gecerliAdres(adres) || /^https?:\/\/(www\.)?bing\.com\//i.test(adres)) continue;
    // Özet: açıklama paragrafı; "Web" gibi kaynak etiketleri atılır
    for (const e of li.querySelectorAll(".algoSlug_icon, .news_dt")) e.remove();
    const p = li.querySelector(".b_caption p, p.b_lineclamp1, p.b_lineclamp2, p.b_lineclamp3, p.b_lineclamp4, p.b_paractl, p") ?? li.querySelector(".b_caption");
    sonuclar.push({ baslik: sadeMetin(a.textContent), adres, ozet: kirp(sadeMetin(p?.textContent), 400) });
  }
  if (!sonuclar.length && /b_captcha|\/challenge\/|captcha/i.test(html) && !document.querySelector("#b_results")) {
    throw new MotorHatasi("captcha", iki("Bing CAPTCHA sordu", "Bing asked for a CAPTCHA"));
  }
  return sonuclar;
}

export const bing: Motor = {
  kimlik: "bing",
  ad: "Bing",
  tur: "genel",
  kategoriler: ["genel", "kod", "bilim"],
  agirlik: 1,
  alakaDenetimi: true,
  async ara(i, o) {
    const { adres, basliklar } = bingIstegi(i);
    const y = await o.getir(adres, { basliklar, zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "Bing");
    return bingAyristir(metneCevir(y));
  },
};

// ---------------------------------------------------------------------------
// Bing Haberler (RSS): bağlantılar bing.com/news/apiclick.aspx?…&url=<adres> biçimindedir
// ---------------------------------------------------------------------------

export function bingHaberIstegi(i: MotorIstegi): { adres: string; basliklar: Record<string, string> } {
  const p = new URLSearchParams({ q: i.sorgu, format: "rss", setlang: i.dil, cc: i.dil === "tr" ? "TR" : "US" });
  if (i.sayfa > 1) p.set("first", String((i.sayfa - 1) * 10 + 1));
  return { adres: `https://www.bing.com/news/search?${p}`, basliklar: { ...tarayiciBasliklari(i.dil), Cookie: cerezler(i.dil) } };
}

function haberAdresi(link: string): string {
  try {
    const u = new URL(link);
    if (/(^|\.)bing\.com$/i.test(u.hostname) && /apiclick/i.test(u.pathname)) return u.searchParams.get("url") ?? link;
  } catch {
    // olduğu gibi
  }
  return link;
}

export function bingHaberAyristir(xml: string): MotorSonucu[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const sonuclar: MotorSonucu[] = [];
  for (const oge of doc.getElementsByTagName("item")) {
    const al = (ad: string) => sadeMetin(oge.getElementsByTagName(ad)[0]?.textContent);
    const adres = haberAdresi(al("link"));
    if (!gecerliAdres(adres)) continue;
    const kaynak = al("News:Source");
    const aciklama = al("description");
    sonuclar.push({ baslik: al("title"), adres, ozet: kirp([kaynak, aciklama].filter(Boolean).join(" · "), 400), tarih: isoZaman(al("pubDate")) });
  }
  return sonuclar;
}

export const bingHaber: Motor = {
  kimlik: "bing_haber",
  ad: "Bing Haberler",
  tur: "genel",
  kategoriler: ["haber"],
  agirlik: 1,
  async ara(i, o) {
    const { adres, basliklar } = bingHaberIstegi(i);
    const y = await o.getir(adres, { basliklar, zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "Bing");
    return bingHaberAyristir(metneCevir(y));
  },
};
