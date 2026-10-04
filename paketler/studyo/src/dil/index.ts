// Arayüz dili: Türkçe ve İngilizce sözlükler.
// Dil çekirdek ayarından gelir (ajanlar da aynı dilde konuşur); ilk çizimde bu tarayıcıda son kullanılan dil,
// o da yoksa tarayıcı dili kullanılır. Bileşenler useSozluk(), bileşen dışı kod sozluk() ile okur.
import type { Dil } from "@arnorg/ortak";
import { create } from "zustand";
import { en } from "./en";
import { tr, type Sozluk } from "./tr";

export type { Sozluk };

const SOZLUKLER: Record<Dil, Sozluk> = { tr, en };
const DIL_ANAHTARI = "arnorg.dil";

function ilkDil(): Dil {
  try {
    const kayitli = localStorage.getItem(DIL_ANAHTARI);
    if (kayitli === "tr" || kayitli === "en") return kayitli;
  } catch {
    // depolama kapalı
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export const useDilDurumu = create<{ dil: Dil }>()(() => ({ dil: ilkDil() }));

/** Arayüz dilini değiştirir; çekirdek ayarına yazmak çağıranın işidir */
export function diliAyarla(dil: Dil) {
  try {
    localStorage.setItem(DIL_ANAHTARI, dil);
  } catch {
    // depolama kapalı
  }
  if (typeof document !== "undefined") document.documentElement.lang = dil;
  if (useDilDurumu.getState().dil !== dil) useDilDurumu.setState({ dil });
}

/** Bileşenlerde: const s = useSozluk(); s.genel.kaydet */
export function useSozluk(): Sozluk {
  return SOZLUKLER[useDilDurumu((d) => d.dil)];
}

/** Bileşen dışında (bildirim, olay işleyici) geçerli sözlük */
export function sozluk(): Sozluk {
  return SOZLUKLER[useDilDurumu.getState().dil];
}

export function useDil(): Dil {
  return useDilDurumu((d) => d.dil);
}
