// Çekirdek HTTP API'si için fetch sarmalayıcısı
import type { ApiHatasi as ApiHataGovdesi } from "@arnorg/ortak";
import { sozluk } from "../dil";
import { dosyaAdiOku } from "../yardimcilar/indirme";
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

/** Çekirdek hata metni göndermezse durum koduna göre gösterilen metin (hata anındaki dilde) */
function durumMetni(durum: number): string {
  const m = sozluk().bildirim.api;
  switch (durum) {
    case 400:
      return m.gecersizIstek;
    case 401:
      return m.anahtarGecersiz;
    case 404:
      return m.bulunamadi;
    case 409:
      return m.yapilamiyor;
    case 413:
      return m.cokBuyuk;
    case 500:
      return m.cekirdekHatasi;
    default:
      return m.beklenmeyen(durum);
  }
}

export async function istek<T>(yol: string, secenek: IstekSecenekleri = {}): Promise<T> {
  const yanit = await yanitAl(yol, secenek, "application/json");
  if (yanit.status === 204) return undefined as T;
  const metin = await yanit.text();
  return (metin ? JSON.parse(metin) : undefined) as T;
}

/** Çekirdekten dosya indirir (JSON yerine ham gövde); dosya adı Content-Disposition başlığından okunur */
export async function indir(yol: string, sinyal?: AbortSignal): Promise<{ veri: Blob; dosyaAdi: string | null }> {
  const yanit = await yanitAl(yol, { sinyal }, "*/*");
  return { veri: await yanit.blob(), dosyaAdi: dosyaAdiOku(yanit.headers.get("Content-Disposition")) };
}

/** İsteği anahtarla gönderir; başarısız yanıtı çekirdeğin hata metniyle ApiHatasi'na çevirir */
async function yanitAl(yol: string, secenek: IstekSecenekleri, kabul: string): Promise<Response> {
  const { method = "GET", govde, sinyal } = secenek;
  const basliklar: Record<string, string> = { Accept: kabul };
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
    throw new ApiHatasi(sozluk().bildirim.api.ulasilamadi, 0);
  }

  if (!yanit.ok) {
    let mesaj = durumMetni(yanit.status);
    try {
      const j = (await yanit.json()) as Partial<ApiHataGovdesi>;
      if (j && typeof j.hata === "string" && j.hata) mesaj = j.hata;
    } catch {
      // Gövde JSON değil; durum metni kalır
    }
    if (yanit.status === 401) anahtarAyarla(null);
    throw new ApiHatasi(mesaj, yanit.status);
  }
  return yanit;
}

/** Hata nesnesinden kullanıcıya gösterilecek metni çıkarır */
export function hataMetni(hata: unknown): string {
  if (hata instanceof Error) return hata.message;
  return sozluk().bildirim.api.bilinmeyen;
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
