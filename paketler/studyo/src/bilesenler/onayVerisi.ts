// Yeni onay türlerinin verisi: sözleşme `veri` alanını tiplemiyor; bilinen alanlar burada güvenle okunur.
// teslim: {baslik, ozet, testAdimlari[], calistir|null, adres|null, dal}
// anayasa: {maddeler: [{no, baslik, metin, kural|null}], gerekce}
// isten_cikarma: {ajanId, ad, devralanId|null, gerekce}
import type { AnayasaKurali, AnayasaMaddesi } from "@arnorg/ortak";
import { guvenliAdres } from "../yardimcilar/zenginMetin";

type Kayit = Record<string, unknown>;

function kayit(v: unknown): Kayit {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Kayit) : {};
}

function dize(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function dizeler(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : [];
}

export interface TeslimVerisi {
  baslik: string | null;
  ozet: string | null;
  testAdimlari: string[];
  /** Ana repoda çalıştırılacak komut */
  calistir: string | null;
  /** Yalnız http(s); geçersiz adres null */
  adres: string | null;
  dal: string | null;
}

export function teslimVerisi(veri: unknown): TeslimVerisi {
  const v = kayit(veri);
  const adres = dize(v.adres);
  return {
    baslik: dize(v.baslik),
    ozet: dize(v.ozet),
    testAdimlari: dizeler(v.testAdimlari),
    calistir: dize(v.calistir),
    adres: adres ? guvenliAdres(adres) : null,
    dal: dize(v.dal),
  };
}

/** Teslim verisinde ayrıca gösterilen alanlar (ham alan listesine düşmez) */
export const TESLIM_ALANLARI = ["baslik", "ozet", "testAdimlari", "calistir", "adres", "dal"];

function anayasaKurali(v: unknown): AnayasaKurali | null {
  const k = kayit(v);
  const hedef = k.hedef;
  const karar = k.karar;
  if (hedef !== "komut" && hedef !== "yol" && hedef !== "url" && hedef !== "arac") return null;
  if (karar !== "ret" && karar !== "sor") return null;
  const desenler = dizeler(k.desenler);
  if (!desenler.length) return null;
  return { hedef, karar, desenler };
}

export interface AnayasaOnerisi {
  maddeler: AnayasaMaddesi[];
  gerekce: string | null;
}

export function anayasaVerisi(veri: unknown): AnayasaOnerisi {
  const v = kayit(veri);
  const ham = Array.isArray(v.maddeler) ? v.maddeler : [];
  const maddeler: AnayasaMaddesi[] = [];
  for (const m of ham) {
    const k = kayit(m);
    const baslik = dize(k.baslik);
    const metin = dize(k.metin);
    if (!baslik && !metin) continue;
    const no = typeof k.no === "number" && Number.isFinite(k.no) ? k.no : maddeler.length + 1;
    maddeler.push({ no, baslik: baslik ?? "", metin: metin ?? "", kural: anayasaKurali(k.kural) });
  }
  return { maddeler, gerekce: dize(v.gerekce) };
}

export interface IstenCikarmaVerisi {
  ajanId: string | null;
  ad: string | null;
  /** Açık işleri ve bilgiyi devralacak çalışan; null ise yöneticisi */
  devralanId: string | null;
  gerekce: string | null;
}

export function istenCikarmaVerisi(veri: unknown): IstenCikarmaVerisi {
  const v = kayit(veri);
  return { ajanId: dize(v.ajanId), ad: dize(v.ad), devralanId: dize(v.devralanId), gerekce: dize(v.gerekce) };
}

/**
 * Ayrıntı metninin ilk paragrafı; sunucu ayrıntıya madde listesini de yazdığında listeden önceki açıklama.
 * İlk paragraf zaten numaralı bir listeyse null.
 */
export function ilkParagraf(metin: string | null | undefined): string | null {
  if (!metin) return null;
  const ilk = metin.replace(/\r\n/g, "\n").split(/\n\s*\n/)[0]?.trim() ?? "";
  if (!ilk || /^\s*\d+[.)]\s/.test(ilk)) return null;
  return ilk;
}
