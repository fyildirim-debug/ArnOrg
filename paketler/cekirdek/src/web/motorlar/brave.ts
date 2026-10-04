// Brave Search (HTML). Sınıf adları sık değiştiği için birkaç seçici denenir (SearXNG'nin brave motoru gibi):
// sonuç kutusu "snippet", bağlantı ilk http(s) a, başlık .title, özet .snippet-description ya da .content
import { parseHTML } from "linkedom";
import { iki } from "../../dil.js";
import { metneCevir, tarayiciBasliklari } from "../http.js";
import { durumuDenetle, gecerliAdres, kirp, MotorHatasi, sadeMetin, type Motor, type MotorIstegi, type MotorSonucu } from "./ortak.js";

export function braveIstegi(i: MotorIstegi): { adres: string; basliklar: Record<string, string> } {
  const p = new URLSearchParams({ q: i.sorgu, source: "web" });
  if (i.sayfa > 1) p.set("offset", String(i.sayfa - 1));
  const ulke = i.dil === "tr" ? "tr" : "us";
  return {
    adres: `https://search.brave.com/search?${p}`,
    basliklar: { ...tarayiciBasliklari(i.dil), Cookie: `country=${ulke}; useLocation=0; summarizer=0; safesearch=moderate; ui_lang=${i.dil === "tr" ? "tr-tr" : "en-us"}` },
  };
}

export function braveAyristir(html: string): MotorSonucu[] {
  const { document } = parseHTML(html);
  const kutular = [...document.querySelectorAll("div[data-type='web'], div.snippet")].filter((d, i, l) => l.indexOf(d) === i);
  const sonuclar: MotorSonucu[] = [];
  const gorulen = new Set<string>();
  for (const d of kutular) {
    const tur = d.getAttribute("data-type");
    if (tur && tur !== "web") continue;
    const a = [...d.querySelectorAll("a[href]")].find((x) => /^https?:\/\//i.test(x.getAttribute("href") ?? "") && !/(^|\.)brave\.com\//i.test(x.getAttribute("href") ?? ""));
    const adres = a?.getAttribute("href");
    const baslik = sadeMetin((d.querySelector(".title, .snippet-title, .search-snippet-title") ?? a)?.textContent);
    if (!gecerliAdres(adres) || !baslik || gorulen.has(adres)) continue;
    gorulen.add(adres);
    const ozet = sadeMetin(d.querySelector(".snippet-description, .generic-snippet .content, .content, .snippet-content")?.textContent);
    sonuclar.push({ baslik, adres, ozet: kirp(ozet, 400) });
  }
  if (!sonuclar.length && /captcha|\/search\/challenge/i.test(html)) throw new MotorHatasi("captcha", iki("Brave CAPTCHA sordu", "Brave asked for a CAPTCHA"));
  return sonuclar;
}

export const brave: Motor = {
  kimlik: "brave",
  ad: "Brave",
  tur: "genel",
  kategoriler: ["genel", "kod", "bilim"],
  agirlik: 1,
  alakaDenetimi: true,
  async ara(i, o) {
    const { adres, basliklar } = braveIstegi(i);
    const y = await o.getir(adres, { basliklar, zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "Brave");
    return braveAyristir(metneCevir(y));
  },
};
