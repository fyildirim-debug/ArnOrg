// Stack Overflow (api.stackexchange.com 2.3, search/advanced). Kısıtlama aşılınca API 400 + throttle_violation döner.
import { iki } from "../../dil.js";
import { apiBasliklari, jsonCevir } from "../http.js";
import { etiketsiz, kirp, MotorHatasi, unixZaman, varlikCoz, type Motor, type MotorIstegi, type MotorSonucu } from "./ortak.js";

const SAYFA_BOYU = 8;

export function stackoverflowIstegi(i: MotorIstegi): { adres: string; basliklar: Record<string, string> } {
  const p = new URLSearchParams({
    order: "desc",
    sort: "relevance",
    q: i.sorgu,
    site: "stackoverflow",
    pagesize: String(SAYFA_BOYU),
    page: String(i.sayfa),
    filter: "withbody",
  });
  return { adres: `https://api.stackexchange.com/2.3/search/advanced?${p}`, basliklar: apiBasliklari() };
}

interface SoOgesi {
  title: string;
  link: string;
  body?: string;
  tags?: string[];
  score?: number;
  answer_count?: number;
  is_answered?: boolean;
  accepted_answer_id?: number;
  creation_date?: number;
  last_activity_date?: number;
}

interface SoYanit {
  items?: SoOgesi[];
  error_id?: number;
  error_name?: string;
  error_message?: string;
}

export function stackoverflowAyristir(govde: SoYanit | null): MotorSonucu[] {
  if (!govde) throw new MotorHatasi("cozumleme", iki("Stack Overflow yanıtı okunamadı", "Could not read the Stack Overflow response"));
  if (govde.error_id) {
    const tur = govde.error_name === "throttle_violation" ? "cok_istek" : govde.error_id === 403 ? "engel" : "http";
    throw new MotorHatasi(tur, `Stack Overflow: ${govde.error_name ?? govde.error_id} ${govde.error_message ?? ""}`.trim(), govde.error_id);
  }
  return (govde.items ?? []).map((s) => {
    const bilgi = [
      iki(`skor ${s.score ?? 0}`, `score ${s.score ?? 0}`),
      iki(`${s.answer_count ?? 0} yanıt`, `${s.answer_count ?? 0} answers`),
      s.accepted_answer_id ? iki("kabul edilmiş yanıt var", "has an accepted answer") : "",
      s.tags?.length ? `[${s.tags.slice(0, 5).join(", ")}]` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      baslik: varlikCoz(s.title),
      adres: s.link,
      ozet: kirp(`${bilgi} — ${etiketsiz(s.body)}`, 400),
      tarih: unixZaman(s.last_activity_date ?? s.creation_date),
    };
  });
}

export const stackoverflow: Motor = {
  kimlik: "stackoverflow",
  ad: "Stack Overflow",
  tur: "teknik",
  kategoriler: ["kod"],
  agirlik: 1.2,
  async ara(i, o) {
    const { adres, basliklar } = stackoverflowIstegi(i);
    const y = await o.getir(adres, { basliklar, zamanAsimiMs: o.zamanAsimiMs });
    const govde = jsonCevir<SoYanit>(y);
    // Hata gövdesi 400 ile gelir; önce gövdedeki hata türü okunur
    if (y.durum === 429) throw new MotorHatasi("cok_istek", iki("Stack Overflow çok fazla istek dedi (429)", "Stack Overflow said too many requests (429)"), 429);
    if (govde?.error_id || (y.durum >= 200 && y.durum < 300)) return stackoverflowAyristir(govde);
    throw new MotorHatasi(y.durum === 403 ? "engel" : "http", iki(`Stack Overflow ${y.durum} döndürdü`, `Stack Overflow returned ${y.durum}`), y.durum);
  },
};
