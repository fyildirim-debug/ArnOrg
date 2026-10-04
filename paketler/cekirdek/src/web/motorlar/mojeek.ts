// Mojeek (HTML): ul.results-standard > li; başlık h2 a.title, özet p.s. Otomatik sorgu şüphesinde 403 döner.
import { parseHTML } from "linkedom";
import { iki } from "../../dil.js";
import { metneCevir, tarayiciBasliklari } from "../http.js";
import { durumuDenetle, gecerliAdres, kirp, MotorHatasi, sadeMetin, type Motor, type MotorIstegi, type MotorSonucu } from "./ortak.js";

export function mojeekIstegi(i: MotorIstegi): { adres: string; basliklar: Record<string, string> } {
  const p = new URLSearchParams({ q: i.sorgu, lb: i.dil });
  if (i.sayfa > 1) p.set("s", String((i.sayfa - 1) * 10 + 1));
  return { adres: `https://www.mojeek.com/search?${p}`, basliklar: tarayiciBasliklari(i.dil) };
}

export function mojeekAyristir(html: string): MotorSonucu[] {
  if (/sending automated queries/i.test(html)) throw new MotorHatasi("engel", iki("Mojeek otomatik sorgu sandı (403)", "Mojeek flagged automated queries (403)"), 403);
  const { document } = parseHTML(html);
  const sonuclar: MotorSonucu[] = [];
  for (const li of document.querySelectorAll("ul.results-standard > li")) {
    const a = li.querySelector("h2 a.title") ?? li.querySelector("h2 a") ?? li.querySelector("a.ob");
    const adres = a?.getAttribute("href");
    if (!a || !gecerliAdres(adres)) continue;
    sonuclar.push({ baslik: sadeMetin(a.textContent), adres, ozet: kirp(sadeMetin(li.querySelector("p.s")?.textContent), 400) });
  }
  return sonuclar;
}

export const mojeek: Motor = {
  kimlik: "mojeek",
  ad: "Mojeek",
  tur: "genel",
  kategoriler: ["genel", "kod"],
  agirlik: 0.7,
  alakaDenetimi: true,
  async ara(i, o) {
    const { adres, basliklar } = mojeekIstegi(i);
    const y = await o.getir(adres, { basliklar, zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "Mojeek");
    return mojeekAyristir(metneCevir(y));
  },
};
