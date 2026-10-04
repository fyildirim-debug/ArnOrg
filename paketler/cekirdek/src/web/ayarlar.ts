// Web ve araştırma ayarları (Ayarlar.web): varsayılanlar, doğrulama ve eksik alanların tamamlanması
import type { WebAyarlari } from "@arnorg/ortak";
import { z } from "zod";
import { iki } from "../dil.js";
import { ArnorgHatasi } from "../yardimci.js";

export const VARSAYILAN_WEB_AYARLARI: WebAyarlari = { searxngAdresi: null, disOkuyucu: true, kapaliMotorlar: [] };

/** PUT /api/ayarlar gövdesindeki web bloğu: verilen alanlar değişir */
export const webAyarSemasi = z.object({
  searxngAdresi: z.string().max(500).nullable().optional(),
  disOkuyucu: z.boolean().optional(),
  kapaliMotorlar: z.array(z.string().min(1).max(40)).max(40).optional(),
});

/** Dosyadan okunan (eksik ya da bozuk olabilen) web ayarını tam biçime getirir */
export function webAyarlari(ham: unknown): WebAyarlari {
  const a = (ham && typeof ham === "object" ? ham : {}) as Partial<Record<keyof WebAyarlari, unknown>>;
  return {
    searxngAdresi: typeof a.searxngAdresi === "string" && a.searxngAdresi.trim() ? a.searxngAdresi.trim() : null,
    disOkuyucu: typeof a.disOkuyucu === "boolean" ? a.disOkuyucu : VARSAYILAN_WEB_AYARLARI.disOkuyucu,
    kapaliMotorlar: Array.isArray(a.kapaliMotorlar) ? [...new Set(a.kapaliMotorlar.filter((m): m is string => typeof m === "string" && !!m.trim()))] : [],
  };
}

/** SearXNG adresi: boş metin kaldırır; http(s) olmalı, sondaki / ve /search atılır */
export function searxngAdresiDogrula(ham: string | null | undefined): string | null {
  const t = ham?.trim() ?? "";
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    throw new ArnorgHatasi(iki(`Geçersiz SearXNG adresi: ${t}`, `Invalid SearXNG address: ${t}`));
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ArnorgHatasi(iki("SearXNG adresi http ya da https olmalı.", "The SearXNG address must be http or https."));
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/search\/?$/, "").replace(/\/+$/, "");
}

/** Ayar güncellemesi: verilmeyen alan eski değerinde kalır; motor kimlikleri bilinen motorlarla süzülür */
export function webAyarlariniGuncelle(eski: WebAyarlari, yeni: Partial<WebAyarlari>, bilinenMotorlar: readonly string[]): WebAyarlari {
  const sonuc = webAyarlari(eski);
  if (yeni.searxngAdresi !== undefined) sonuc.searxngAdresi = searxngAdresiDogrula(yeni.searxngAdresi);
  if (typeof yeni.disOkuyucu === "boolean") sonuc.disOkuyucu = yeni.disOkuyucu;
  if (Array.isArray(yeni.kapaliMotorlar)) sonuc.kapaliMotorlar = [...new Set(yeni.kapaliMotorlar.filter((m) => bilinenMotorlar.includes(m)))];
  return sonuc;
}
