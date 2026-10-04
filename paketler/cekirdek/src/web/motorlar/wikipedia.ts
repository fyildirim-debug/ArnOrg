// Wikipedia (MediaWiki API, list=search); arayüz diline göre tr ya da en Vikipedi. Wikimedia açıklayıcı
// User-Agent ister (Api-User-Agent da gönderilir).
import { apiBasliklari, ARNORG_UA, jsonCevir } from "../http.js";
import { durumuDenetle, etiketsiz, isoZaman, kirp, MotorHatasi, sadeMetin, type Motor, type MotorIstegi, type MotorSonucu } from "./ortak.js";
import { iki } from "../../dil.js";

const SAYFA_BOYU = 5;

export function wikipediaIstegi(i: MotorIstegi): { adres: string; basliklar: Record<string, string> } {
  const p = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: i.sorgu,
    format: "json",
    utf8: "1",
    srlimit: String(SAYFA_BOYU),
    srprop: "snippet|timestamp",
  });
  if (i.sayfa > 1) p.set("sroffset", String((i.sayfa - 1) * SAYFA_BOYU));
  return { adres: `https://${i.dil}.wikipedia.org/w/api.php?${p}`, basliklar: apiBasliklari({ "Api-User-Agent": ARNORG_UA }) };
}

/** Makale adresi: boşluklar alt çizgi, / ve : okunur kalır */
export function wikipediaAdresi(dil: string, baslik: string): string {
  const yol = encodeURIComponent(baslik.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":");
  return `https://${dil}.wikipedia.org/wiki/${yol}`;
}

interface WikiYanit {
  query?: { search?: { title: string; snippet?: string; timestamp?: string }[] };
  error?: { code?: string; info?: string };
}

export function wikipediaAyristir(govde: WikiYanit | null, dil: string): MotorSonucu[] {
  if (!govde) throw new MotorHatasi("cozumleme", iki("Wikipedia yanıtı okunamadı", "Could not read the Wikipedia response"));
  if (govde.error) throw new MotorHatasi(govde.error.code === "ratelimited" ? "cok_istek" : "http", `Wikipedia: ${govde.error.info ?? govde.error.code ?? ""}`);
  return (govde.query?.search ?? []).map((s) => ({
    baslik: sadeMetin(s.title),
    adres: wikipediaAdresi(dil, s.title),
    ozet: kirp(etiketsiz(s.snippet), 400),
    tarih: isoZaman(s.timestamp),
  }));
}

export const wikipedia: Motor = {
  kimlik: "wikipedia",
  ad: "Wikipedia",
  tur: "genel",
  kategoriler: ["genel", "bilim"],
  agirlik: 0.8,
  async ara(i, o) {
    const { adres, basliklar } = wikipediaIstegi(i);
    const y = await o.getir(adres, { basliklar, zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "Wikipedia");
    return wikipediaAyristir(jsonCevir<WikiYanit>(y), i.dil);
  },
};
