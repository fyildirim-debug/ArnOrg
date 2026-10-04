// Model kataloğu: çekirdeğin GET /api/modeller listesi (Claude Code'un sunduğu modeller, sürümlü adlarıyla) ilk
// kullanımda bir kez yüklenip saklanır; "modeller.guncellendi" olayıyla tazelenir. Model görünen her yer sürümlü adı
// buradan alır (Fable 5.1, Opus 5.5). Bilinen modellerin kısa açıklaması sözlükten gelir; bilinmeyende katalogdaki
// (İngilizce) metin olduğu gibi gösterilir. Katalog gelmeden bilinen takma adlar sürümsüz adla görünür.
import type { ModelBilgisi, ModelKatalogu } from "@arnorg/ortak";
import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../api/uclar";
import { sozluk, type Sozluk } from "../dil";

export const useModeller = create<{ katalog: ModelKatalogu | null }>()(() => ({ katalog: null }));

/** Model zinciri, güçlüden hafife (çekirdekteki MODEL_ZINCIRI): seçim listeleri bu sırayla, rol modeli bu zincirle seçilir */
const ZINCIR = ["fable", "opus", "sonnet", "haiku"] as const;
type Takma = (typeof ZINCIR)[number];
const AILE_ADLARI: Record<Takma, string> = { fable: "Fable", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };
const takmaMi = (m: string): m is Takma => (ZINCIR as readonly string[]).includes(m);

let denendi = false;
let suren: Promise<void> | null = null;

/** Kataloğu yükler; bir kez denenir (eski çekirdekte uç yoksa yeniden istenmez), zorla yeniden ister */
export function modelleriYukle(zorla = false): Promise<void> {
  if (suren) return suren;
  if (denendi && !zorla) return Promise.resolve();
  denendi = true;
  suren = api
    .modeller()
    .then((katalog) => useModeller.setState({ katalog }))
    .catch(() => undefined)
    .finally(() => {
      suren = null;
    });
  return suren;
}

/** Olayla gelen yeni katalog */
export function modelKataloguUygula(katalog: ModelKatalogu) {
  useModeller.setState({ katalog });
}

/** Bileşenlerde katalog: ilk kullanımda yüklenir, değişince bileşen yeniden çizilir */
export function useModelKatalogu(): ModelKatalogu | null {
  const katalog = useModeller((d) => d.katalog);
  useEffect(() => {
    void modelleriYukle();
  }, []);
  return katalog;
}

/** Modelin katalogdaki satırı: değer ya da tam kimlik eşleşmesi */
export function modelBilgisi(model: string, katalog: ModelKatalogu | null = useModeller.getState().katalog): ModelBilgisi | null {
  const m = model.trim().toLowerCase();
  return katalog?.modeller.find((x) => x.deger.toLowerCase() === m || x.kimlik?.toLowerCase() === m) ?? null;
}

/** Tam kimlikten okunur ad: claude-opus-4-1-20250805 → "Opus 4.1"; tanınmazsa null */
export function kimliktenAd(kimlik: string): string | null {
  const x = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/i.exec(kimlik.trim());
  if (!x) return null;
  const aile = x[1]!.toLowerCase();
  const ad = takmaMi(aile) ? AILE_ADLARI[aile] : aile.charAt(0).toUpperCase() + aile.slice(1);
  return `${ad} ${x[3] ? `${x[2]}.${x[3]}` : x[2]}`;
}

/** Modelin görünen adı: katalogdaki sürümlü ad (Opus 5.5); katalogda yoksa tam kimlikten ya da takma addan */
export function modelAdi(model: string, katalog: ModelKatalogu | null = useModeller.getState().katalog): string {
  const b = modelBilgisi(model, katalog);
  if (b) return b.ad;
  const m = model.trim().toLowerCase();
  return kimliktenAd(model) ?? (takmaMi(m) ? AILE_ADLARI[m] : model);
}

/** Seçeneklerdeki kısa açıklama: bilinen takma adlarda sözlükten, bilinmeyen modelde katalogdaki metin */
export function modelAciklamasi(b: ModelBilgisi, s: Sozluk = sozluk()): string {
  const m = b.deger.toLowerCase();
  return takmaMi(m) ? s.modeller.aciklamalar[m] : b.aciklama;
}

/** Seçim listesindeki metin: "Fable 5.1 — En zor ve uzun işler için" */
export function modelSecenegi(b: ModelBilgisi, s: Sozluk = sozluk()): string {
  const aciklama = modelAciklamasi(b, s);
  return aciklama ? `${b.ad} — ${aciklama}` : b.ad;
}

/** Seçilebilir modeller güçlüden hafife (bilinmeyenler sonda); katalog gelmeden bilinen takma adlar */
export function modelSecenekleri(katalog: ModelKatalogu | null): ModelBilgisi[] {
  const liste = katalog?.modeller.length ? katalog.modeller : ZINCIR.map((m) => ({ deger: m, ad: AILE_ADLARI[m], kimlik: null, aciklama: "" }));
  const sira = (b: ModelBilgisi) => {
    const i = (ZINCIR as readonly string[]).indexOf(b.deger.toLowerCase());
    return i < 0 ? ZINCIR.length : i;
  };
  return [...liste].sort((a, b) => sira(a) - sira(b));
}

/** Rolün varsayılan modeli katalogda yoksa zincirde bir sonraki (çekirdekteki kuralla aynı; CEO: fable yoksa opus) */
export function rolModeli(varsayilan: string, katalog: ModelKatalogu | null = useModeller.getState().katalog): string {
  const i = (ZINCIR as readonly string[]).indexOf(varsayilan.trim().toLowerCase());
  if (i < 0 || !katalog?.modeller.length) return varsayilan;
  const varMi = (m: string) =>
    katalog.modeller.some((x) => {
      const deger = x.deger.toLowerCase();
      return deger === m || deger.startsWith(`claude-${m}-`) || !!x.kimlik?.toLowerCase().startsWith(`claude-${m}-`);
    });
  return ZINCIR.slice(i).find(varMi) ?? varsayilan;
}
