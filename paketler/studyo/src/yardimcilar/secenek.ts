// Seçenekli sorular: CEO sohbetinde düz metinden "Seçerek yanıtla" önerisi, kurula sorunun (kurula_sor, genel onay)
// seçenekleri ve kurulun yanıt notundan seçilen seçenek. Liste bulma ortak'taki metindekiSecenekler'dedir (çekirdekle aynı).
import { ARNORG_GONDEREN, KURUL, metindekiSecenekler, type Mesaj, type Onay } from "@arnorg/ortak";

/** "Seçerek yanıtla" yalnız CEO sohbetinde (#yonetim) ajanın kendi yazdığı, seçeneği olmayan mesajda aranır */
export function duzMetinAdayi(mesaj: Mesaj): boolean {
  return !mesaj.secim && mesaj.kanal === "yonetim" && mesaj.gonderenId !== KURUL && mesaj.gonderenId !== ARNORG_GONDEREN;
}

/** Düz metindeki seçenekler; aday olmayan mesajda null */
export function duzMetinSecenekleri(mesaj: Mesaj): string[] | null {
  return duzMetinAdayi(mesaj) ? metindekiSecenekler(mesaj.metin) : null;
}

/** Kurul bu mesajdan sonra kanala yazdı mı (yazdıysa düz metin listesi artık önerilmez) */
export function kurulSonraYazdi(mesaj: Mesaj, kanaldakiler: readonly Mesaj[] | undefined): boolean {
  if (!kanaldakiler) return false;
  const i = kanaldakiler.findIndex((m) => m.id === mesaj.id);
  return i >= 0 && kanaldakiler.slice(i + 1).some((m) => m.gonderenId === KURUL);
}

type Kayit = Record<string, unknown>;
const kayit = (v: unknown): Kayit => (v && typeof v === "object" && !Array.isArray(v) ? (v as Kayit) : {});

/** Kurula sorunun seçenekleri (genel onay, veri.secenekler); seçeneksiz soruda ve başka türde boş */
export function onaySecenekleri(onay: Onay): string[] {
  if (onay.tur !== "genel") return [];
  const s = kayit(onay.veri).secenekler;
  return Array.isArray(s) ? s.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : [];
}

/** Kurula sorunun kendisi (veri.soru); yoksa null */
export function onaySorusu(onay: Onay): string | null {
  const s = kayit(onay.veri).soru;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

/** Sonuçlanan soruda seçilen seçenek: kurulun notu "2) Seçenek · Not: …" biçimindeyse 2; değilse null */
export function onaySecilen(onay: Onay, secenekler: readonly string[]): number | null {
  const not = onay.not ?? "";
  const m = /^(\d{1,2})\) /.exec(not);
  if (!m) return null;
  const n = Number(m[1]);
  const metin = secenekler[n - 1];
  return metin !== undefined && not.slice(m[0].length).startsWith(metin) ? n : null;
}
