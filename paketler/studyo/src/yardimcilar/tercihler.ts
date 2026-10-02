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
