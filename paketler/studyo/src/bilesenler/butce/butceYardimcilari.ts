// Kullanım seviyesi ve bütçe arayüzünün saf yardımcıları (0.0.10): girdideki milyon ↔ token, açılış ve ayar
// formlarının değeri, tahmini bitişe kalan süre, rolün seviyedeki modeli. Seviyenin kuralları ortak sözleşmededir
// (SEVIYE_MODELLERI, seviyeGorevTavani, seviyeTempoSiniri); burada yalnız arayüzün ihtiyacı.
import { rolKademesi, SEVIYE_MODELLERI, VARSAYILAN_SEVIYE, type KullanimSeviyesi, type ModelKatalogu, type ProjeButcesi } from "@arnorg/ortak";
import { rolModeli } from "../../durum/modeller";

export const MILYON = 1_000_000;

/** Girdideki milyon değeri tokena: boş ya da 0 sınırsız (null); geçersizse undefined. Virgül de ondalık ayracıdır */
export function milyondanToken(metin: string): number | null | undefined {
  const t = metin.trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n > 1_000_000) return undefined;
  return n === 0 ? null : Math.max(1, Math.round(n * MILYON));
}

/** Token girdideki milyon metnine: sınırsız boş; en çok iki ondalık */
export function tokendenMilyon(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  return String(Math.round((n / MILYON) * 100) / 100);
}

/** Bütçe formunun değeri: girdiler metin olarak tutulur, gönderirken çevrilir */
export interface ButceGirdisi {
  toplam: string;
  gunluk: string;
}

export function butceGirdisi(b: ProjeButcesi | null | undefined): ButceGirdisi {
  return { toplam: tokendenMilyon(b?.toplam), gunluk: tokendenMilyon(b?.gunluk) };
}

/** Girdiden bütçe; bir alan geçersizse null ve hatalı alanlar */
export function girdidenButce(g: ButceGirdisi): { butce: ProjeButcesi | null; hatali: { toplam: boolean; gunluk: boolean } } {
  const toplam = milyondanToken(g.toplam);
  const gunluk = milyondanToken(g.gunluk);
  const hatali = { toplam: toplam === undefined, gunluk: gunluk === undefined };
  return { butce: hatali.toplam || hatali.gunluk ? null : { toplam: toplam ?? null, gunluk: gunluk ?? null }, hatali };
}

/** İki bütçe aynı mı */
export function ayniButce(a: ProjeButcesi, b: ProjeButcesi): boolean {
  return (a.toplam ?? null) === (b.toplam ?? null) && (a.gunluk ?? null) === (b.gunluk ?? null);
}

/** Proje açılışındaki kullanım ve bütçe seçimi */
export interface AcilisKullanimi {
  seviye: KullanimSeviyesi;
  butce: ButceGirdisi;
  otomatikKademe: boolean;
}

export const VARSAYILAN_ACILIS: AcilisKullanimi = { seviye: VARSAYILAN_SEVIYE, butce: { toplam: "", gunluk: "" }, otomatikKademe: true };

/** Açılış isteğinin alanları; bütçe geçersizse null */
export function acilisAlanlari(a: AcilisKullanimi): { butce: ProjeButcesi; seviye: KullanimSeviyesi; otomatikKademe: boolean } | null {
  const { butce } = girdidenButce(a.butce);
  return butce ? { butce, seviye: a.seviye, otomatikKademe: a.otomatikKademe } : null;
}

/** Bütçeyi artırmanın hazır adımları: sınırın yüzde 25'i, 50'si ve iki katı (yuvarlak milyonlara) */
export function artirmaAdimlari(sinir: number, harcanan: number): number[] {
  const yuvarla = (n: number) => Math.max(MILYON, Math.ceil(n / (MILYON / 2)) * (MILYON / 2));
  const taban = Math.max(sinir, harcanan);
  return [...new Set([yuvarla(taban * 1.25), yuvarla(taban * 1.5), yuvarla(taban * 2)])].filter((x) => x > taban);
}

/** Bitişe kalan süre parçaları (ms): en büyük iki birim; 1 dakikadan azsa dakika 0 */
export function kalanParcalar(ms: number): { gun: number; saat: number; dakika: number } {
  const dk = Math.max(0, Math.round(ms / 60_000));
  const gun = Math.floor(dk / 1440);
  const saat = Math.floor((dk % 1440) / 60);
  const dakika = dk % 60;
  return gun ? { gun, saat, dakika: 0 } : { gun: 0, saat, dakika };
}

/** Rolün seviyedeki modeli (çekirdekteki kuralla aynı: kademenin modeli, katalogda yoksa zincirde bir sonraki) */
export function seviyeModeli(seviye: KullanimSeviyesi, rol: string, katalog: ModelKatalogu | null): string {
  return rolModeli(SEVIYE_MODELLERI[seviye][rolKademesi(rol)], katalog);
}
