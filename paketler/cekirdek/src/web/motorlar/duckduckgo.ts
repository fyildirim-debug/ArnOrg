// DuckDuckGo (html.duckduckgo.com/html, POST). Bot şüphesinde 202 ya da "anomaly" sayfası döner: CAPTCHA sayılır.
// İkinci sayfa önceki yanıtın belirtecini (vqd) ister; yalnız ilk sayfa sorgulanır.
import { parseHTML } from "linkedom";
import { iki } from "../../dil.js";
import { metneCevir, tarayiciBasliklari } from "../http.js";
import { durumuDenetle, gecerliAdres, kirp, MotorHatasi, sadeMetin, type Motor, type MotorIstegi, type MotorSonucu } from "./ortak.js";

export function duckduckgoIstegi(i: MotorIstegi): { adres: string; govde: string; basliklar: Record<string, string> } {
  const govde = new URLSearchParams({ q: i.sorgu, b: "", kl: i.dil === "tr" ? "tr-tr" : "us-en" }).toString();
  return {
    adres: "https://html.duckduckgo.com/html/",
    govde,
    basliklar: { ...tarayiciBasliklari(i.dil), "Content-Type": "application/x-www-form-urlencoded", Origin: "https://html.duckduckgo.com", Referer: "https://html.duckduckgo.com/" },
  };
}

/** //duckduckgo.com/l/?uddg=<adres> yönlendirmesini çözer */
export function duckduckgoAdresiCoz(href: string): string {
  try {
    const u = new URL(href, "https://duckduckgo.com/");
    if (/(^|\.)duckduckgo\.com$/i.test(u.hostname) && u.pathname.startsWith("/l/")) return u.searchParams.get("uddg") ?? u.toString();
    return u.toString();
  } catch {
    return href;
  }
}

/** Bot sayfası: anomali penceresi ya da doğrulama formu */
export function duckduckgoAnomaliMi(html: string): boolean {
  return /anomaly-modal|anomaly\.js|id=["']challenge-form["']|bots use DuckDuckGo too/i.test(html);
}

export function duckduckgoAyristir(html: string): MotorSonucu[] {
  if (duckduckgoAnomaliMi(html)) throw new MotorHatasi("captcha", iki("DuckDuckGo bot doğrulaması (anomaly) istedi", "DuckDuckGo asked for bot verification (anomaly)"));
  const { document } = parseHTML(html);
  const sonuclar: MotorSonucu[] = [];
  for (const d of document.querySelectorAll("div.result")) {
    const sinif = d.getAttribute("class") ?? "";
    if (/result--ad|result--no-result/.test(sinif)) continue;
    const a = d.querySelector("a.result__a") ?? d.querySelector("h2 a");
    const href = a?.getAttribute("href");
    if (!a || !href) continue;
    const adres = duckduckgoAdresiCoz(href);
    if (!gecerliAdres(adres) || /^https?:\/\/(www\.)?duckduckgo\.com\/y\.js/i.test(adres)) continue;
    sonuclar.push({ baslik: sadeMetin(a.textContent), adres, ozet: kirp(sadeMetin(d.querySelector(".result__snippet")?.textContent), 400) });
  }
  return sonuclar;
}

export const duckduckgo: Motor = {
  kimlik: "duckduckgo",
  ad: "DuckDuckGo",
  tur: "genel",
  kategoriler: ["genel", "kod", "bilim"],
  agirlik: 1,
  alakaDenetimi: true,
  async ara(i, o) {
    if (i.sayfa > 1) return [];
    const { adres, govde, basliklar } = duckduckgoIstegi(i);
    const y = await o.getir(adres, { yontem: "POST", govde, basliklar, zamanAsimiMs: o.zamanAsimiMs });
    const metin = metneCevir(y);
    if (y.durum === 202 || duckduckgoAnomaliMi(metin)) throw new MotorHatasi("captcha", iki("DuckDuckGo bot doğrulaması (anomaly) istedi", "DuckDuckGo asked for bot verification (anomaly)"), y.durum);
    durumuDenetle(y, "DuckDuckGo");
    return duckduckgoAyristir(metin);
  },
};
