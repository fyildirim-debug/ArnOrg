// Küçük ortak yardımcılar
import { randomUUID, randomBytes } from "node:crypto";
import { iki } from "./dil.js";

export function kimlik(): string {
  return randomUUID();
}

export function rastgeleAnahtar(bayt = 24): string {
  return randomBytes(bayt).toString("base64url");
}

export function simdi(): string {
  return new Date().toISOString();
}

/** Emoji dizileri (bayrak, ten rengi, ZWJ birleşimleri dahil); © ® gibi eski simgeler korunur */
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}][\u{FE0F}\u{1F3FB}-\u{1F3FF}]?(?:\u200D[\p{Extended_Pictographic}][\u{FE0F}]?)*[ \t]?/gu;

/** Ajan mesajlarından emojiyi ayıklar (FY tasarım dili: süsleme simgesi yok) */
export function emojiAyikla(metin: string): string {
  if (!/\p{Extended_Pictographic}/u.test(metin)) return metin;
  return metin.replace(EMOJI, (m) => (m.codePointAt(0)! < 0x2000 ? m : "")).replace(/[ \t]+$/gm, "");
}

/** Yerel saate göre YYYY-AA-GG */
export function bugun(tarih = new Date()): string {
  const y = tarih.getFullYear();
  const a = String(tarih.getMonth() + 1).padStart(2, "0");
  const g = String(tarih.getDate()).padStart(2, "0");
  return `${y}-${a}-${g}`;
}

/** Türkçe karakterleri sadeleştirip dosya/dal adına uygun hale getirir */
/** Arama için Türkçe harfleri sadeleştirir ve küçültür: "Veritabanı Göçü" → "veritabani gocu" */
export function aramaMetni(metin: string): string {
  const harita: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u", â: "a", î: "i", û: "u" };
  return metin.replace(/[çğıİöşüÇĞÖŞÜâîû]/g, (h) => harita[h] ?? h).toLowerCase();
}

export function sadelestir(metin: string): string {
  const harita: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  return metin
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (h) => harita[h] ?? h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "ajan";
}

export function kisalt(metin: string, uzunluk: number): string {
  const tek = metin.replace(/\s+/g, " ").trim();
  return tek.length > uzunluk ? tek.slice(0, uzunluk - 1) + "…" : tek;
}

export function jsonOku<T>(metin: string | null | undefined, varsayilan: T): T {
  if (!metin) return varsayilan;
  try {
    return JSON.parse(metin) as T;
  } catch {
    return varsayilan;
  }
}

export function bekle(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Kontrol edilmiş hata: API katmanı durum koduyla döndürür */
export class ArnorgHatasi extends Error {
  constructor(
    message: string,
    public readonly durumKodu = 400,
  ) {
    super(message);
  }
}

/** "Görev bulunamadı." / "Task not found." */
export function bulunamadi(ne: string, en: string): ArnorgHatasi {
  return new ArnorgHatasi(iki(`${ne} bulunamadı.`, `${en} not found.`), 404);
}

/** Sonu gelmeyen, beklenebilir kuyruk (ajan girdi akışı için) */
export class AkanKuyruk<T> implements AsyncIterable<T> {
  private ogeler: T[] = [];
  private bekleyenler: ((s: IteratorResult<T>) => void)[] = [];
  private kapali = false;

  ekle(oge: T): void {
    if (this.kapali) return;
    const b = this.bekleyenler.shift();
    if (b) b({ value: oge, done: false });
    else this.ogeler.push(oge);
  }

  kapat(): void {
    this.kapali = true;
    for (const b of this.bekleyenler.splice(0)) b({ value: undefined as never, done: true });
  }

  get kapandi(): boolean {
    return this.kapali;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const oge = this.ogeler.shift();
        if (oge !== undefined) return Promise.resolve({ value: oge, done: false });
        if (this.kapali) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((r) => this.bekleyenler.push(r));
      },
      return: () => {
        this.kapat();
        return Promise.resolve({ value: undefined as never, done: true });
      },
    };
  }
}

/** Aramada anlam taşımayan sözcükler (Türkçe harfleri sadeleştirilmiş, İngilizce hata metinleri dahil) */
const DURAK = new Set(
  (
    "ve veya ile icin bu su o bir ne mi mu nasil neden niye hangi gibi daha en de da ki ama ya olarak olan var yok misin musun " +
    "sen ben biz siz onu bunu sunu icin kadar sonra once simdi her hep hic cok az bana sana ona bize size mesela yani sey " +
    "nedir midir mudur olur olmaz olsun ederim edebilir yapar yapilir yap the an of to in is and or for on with it this that be are was " +
    "error errors failed fail failure cannot could not found such file directory exit code line at from command warning warn err " +
    "hata hatasi komut dosya dizin satir kod uyari bulunamadi basarisiz"
  ).split(/\s+/),
);

/** Metnin ayırt edici sözcükleri; sıra korunur, tekrar atılır */
export function anlamliSozcukler(metin: string, sinir = 12): string[] {
  const goruldu = new Set<string>();
  for (const s of aramaMetni(metin).split(/[^a-z0-9]+/)) {
    if (s.length < 3 || DURAK.has(s) || /^\d+$/.test(s) || goruldu.has(s)) continue;
    goruldu.add(s);
    if (goruldu.size >= sinir) break;
  }
  return [...goruldu];
}
