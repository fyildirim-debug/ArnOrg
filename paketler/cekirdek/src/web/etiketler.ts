// Web araçlarının akışta ve denetimde okunur görünümü: ajanın "ne yapıyor" açıklaması ve denetim kapısının
// gördüğü girdi (web_oku adresi url kuralına ve denetim kaydına adres olarak düşer)
import { iki } from "../dil.js";
import { kisalt } from "../yardimci.js";

/** Şemasız adresin de alan adı: "ornek.com/x" → ornek.com */
function alan(adres: unknown): string {
  const s = String(adres ?? "").trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "") || s;
  } catch {
    return kisalt(s, 50);
  }
}

/** Ajanın iş açıklaması (isAciklamasi): "Web araması: <sorgu>", "Okunuyor: <alan adı>" */
export const WEB_ARAC_ACIKLAMALARI: Record<string, (g: Record<string, unknown>) => string> = {
  mcp__arnorg__web_ara: (g) => `${iki("Web araması", "Web search")}: ${kisalt(String(g.sorgu ?? ""), 40)}`,
  mcp__arnorg__web_oku: (g) => `${iki("Okunuyor", "Reading")}: ${alan(g.adres)}`,
  mcp__arnorg__arastirma_kaydet: (g) => `${iki("Araştırma notu", "Research note")}: ${kisalt(String(g.baslik ?? ""), 40)}`,
  mcp__arnorg__paket_bilgisi: (g) => `${iki("Paket bilgisi", "Package info")}: ${kisalt(String(g.ad ?? ""), 40)}`,
  mcp__arnorg__github_ara: (g) => `${iki("GitHub araması", "GitHub search")}: ${kisalt(String(g.sorgu ?? ""), 40)}`,
};

/**
 * Web aracının denetim kapısındaki görünümü; web aracı değilse null. web_oku adresi url alanına girer (politikanın
 * url kuralları uygulanır, denetim kaydında adres görünür); diğerlerinin özeti pattern alanından okunur.
 */
export function webDenetimGirdisi(arac: string, girdi: Record<string, unknown>): Record<string, unknown> | null {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (arac) {
    case "mcp__arnorg__web_ara":
      return { pattern: `${s(girdi.sorgu)}${girdi.kategori ? ` [${s(girdi.kategori)}]` : ""}` };
    case "mcp__arnorg__web_oku":
      return { url: s(girdi.adres) };
    case "mcp__arnorg__arastirma_kaydet":
      return { pattern: s(girdi.baslik) };
    case "mcp__arnorg__paket_bilgisi":
      return { pattern: `${s(girdi.ekosistem) || "npm"}: ${s(girdi.ad)}` };
    case "mcp__arnorg__github_ara":
      return { pattern: `${s(girdi.tur) || "repo"}: ${s(girdi.sorgu)}` };
    default:
      return null;
  }
}
