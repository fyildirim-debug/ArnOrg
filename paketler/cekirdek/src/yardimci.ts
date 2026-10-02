// Küçük ortak yardımcılar
import { randomUUID, randomBytes } from "node:crypto";

export function kimlik(): string {
  return randomUUID();
}

export function rastgeleAnahtar(bayt = 24): string {
  return randomBytes(bayt).toString("base64url");
}

export function simdi(): string {
  return new Date().toISOString();
}

/** Yerel saate göre YYYY-AA-GG */
export function bugun(tarih = new Date()): string {
  const y = tarih.getFullYear();
  const a = String(tarih.getMonth() + 1).padStart(2, "0");
  const g = String(tarih.getDate()).padStart(2, "0");
  return `${y}-${a}-${g}`;
}

/** Türkçe karakterleri sadeleştirip dosya/dal adına uygun hale getirir */
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

export function bulunamadi(ne: string): ArnorgHatasi {
  return new ArnorgHatasi(`${ne} bulunamadı.`, 404);
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
