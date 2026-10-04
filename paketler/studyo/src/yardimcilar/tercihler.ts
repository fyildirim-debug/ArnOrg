// Yalnız bu tarayıcıda tutulan görünüm tercihleri
import { create } from "zustand";

const SIRKET_ADI = "arnorg.sirketAdi";

function oku(): string {
  try {
    return localStorage.getItem(SIRKET_ADI) ?? "";
  } catch {
    return "";
  }
}

interface Tercihler {
  /** Çekirdek API'sinde şirket adı yok; üst çubukta gösterilen ad burada tutulur */
  sirketAdi: string;
}

export const useTercihler = create<Tercihler>()(() => ({ sirketAdi: oku() }));

export function sirketAdiAyarla(ad: string) {
  const temiz = ad.trim();
  try {
    if (temiz) localStorage.setItem(SIRKET_ADI, temiz);
    else localStorage.removeItem(SIRKET_ADI);
  } catch {
    // depolama kapalı
  }
  useTercihler.setState({ sirketAdi: temiz });
}

// ---------------------------------------------------------------------------
// Tarayıcı: proje başına son ziyaret edilen adres ve görünüm genişliği (yalnız bu tarayıcıda)
// ---------------------------------------------------------------------------

const SON_ADRES = "arnorg.tarayici.sonAdres.";
const GORUNUM_GENISLIGI = "arnorg.tarayici.genislik";

/** Projede tarayıcıda en son açılan adres; yoksa null */
export function sonAdres(projeId: string): string | null {
  try {
    return localStorage.getItem(SON_ADRES + projeId);
  } catch {
    return null;
  }
}

export function sonAdresiYaz(projeId: string, adres: string): void {
  try {
    localStorage.setItem(SON_ADRES + projeId, adres);
  } catch {
    // depolama kapalı: adres yalnız bu oturumda kalır
  }
}

/** Tarayıcının görünüm genişliği: 0 masaüstü (tam genişlik), 768 tablet, 390 telefon */
export function gorunumGenisligi(): number {
  try {
    const n = Number(localStorage.getItem(GORUNUM_GENISLIGI));
    return n === 768 || n === 390 ? n : 0;
  } catch {
    return 0;
  }
}

export function gorunumGenisliginiYaz(genislik: number): void {
  try {
    localStorage.setItem(GORUNUM_GENISLIGI, String(genislik));
  } catch {
    // depolama kapalı
  }
}
