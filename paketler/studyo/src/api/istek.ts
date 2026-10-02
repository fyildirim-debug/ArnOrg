// Çekirdek HTTP API'si için fetch sarmalayıcısı
import type { ApiHatasi as ApiHataGovdesi } from "@arnorg/ortak";
import { anahtar, anahtarAyarla } from "./anahtar";

export class ApiHatasi extends Error {
  readonly durum: number;
  constructor(mesaj: string, durum: number) {
    super(mesaj);
    this.name = "ApiHatasi";
    this.durum = durum;
  }
}

export interface IstekSecenekleri {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  govde?: unknown;
  sinyal?: AbortSignal;
}

const DURUM_METINLERI: Record<number, string> = {
  400: "Geçersiz istek.",
  401: "Erişim anahtarı geçersiz.",
  404: "Bulunamadı.",
  409: "İşlem şu an yapılamıyor.",
  413: "Dosya çok büyük.",
  500: "Çekirdekte bir hata oluştu.",
};

export async function istek<T>(yol: string, secenek: IstekSecenekleri = {}): Promise<T> {
  const { method = "GET", govde, sinyal } = secenek;
  const basliklar: Record<string, string> = { Accept: "application/json" };
  const a = anahtar();
  if (a) basliklar.Authorization = `Bearer ${a}`;
  if (govde !== undefined) basliklar["Content-Type"] = "application/json";

  let yanit: Response;
  try {
    yanit = await fetch(yol, {
      method,
      headers: basliklar,
      body: govde !== undefined ? JSON.stringify(govde) : undefined,
      signal: sinyal,
    });
  } catch (hata) {
    if (hata instanceof DOMException && hata.name === "AbortError") throw hata;
    throw new ApiHatasi("Çekirdeğe ulaşılamadı. Bağlantıyı denetleyin.", 0);
  }

  if (!yanit.ok) {
    let mesaj = DURUM_METINLERI[yanit.status] ?? `Beklenmeyen yanıt (${yanit.status}).`;
    try {
      const j = (await yanit.json()) as Partial<ApiHataGovdesi>;
      if (j && typeof j.hata === "string" && j.hata) mesaj = j.hata;
    } catch {
      // Gövde JSON değil; durum metni kalır
    }
    if (yanit.status === 401) anahtarAyarla(null);
    throw new ApiHatasi(mesaj, yanit.status);
  }

  if (yanit.status === 204) return undefined as T;
  const metin = await yanit.text();
  return (metin ? JSON.parse(metin) : undefined) as T;
}

/** Hata nesnesinden kullanıcıya gösterilecek metni çıkarır */
export function hataMetni(hata: unknown): string {
  if (hata instanceof Error) return hata.message;
  return "Bilinmeyen bir hata oluştu.";
}

/** Sorgu dizesi kurar; boş değerleri atlar */
export function sorgu(parametreler: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parametreler)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
