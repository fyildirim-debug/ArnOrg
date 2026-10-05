// Kod zekâsı: çalışma alanlarının dizin durumu (canlı kod.dizin olaylarıyla güncel) ve ekranda seçili alan
import type { KodDizinDurumu } from "@arnorg/ortak";
import { create } from "zustand";
import { api } from "../api/uclar";

/** Grafik tercihleri: düzey (null: dizin küçükse dosyalar, büyükse klasörler) ve gösterilen bağ türleri */
export interface GrafikTercihi {
  duzey: "klasor" | "dosya" | null;
  ithal: boolean;
  anlam: boolean;
}

interface KodZekasiDurumu {
  projeId: string | null;
  /** Alan ("ana" ya da ajan kimliği) → dizin durumu */
  durumlar: Record<string, KodDizinDurumu>;
  /** Ekranda seçili alan */
  alan: string;
  /** Sekme değişince de korunur */
  grafik: GrafikTercihi;
}

export const useKodZekasi = create<KodZekasiDurumu>()(() => ({ projeId: null, durumlar: {}, alan: "ana", grafik: { duzey: null, ithal: true, anlam: true } }));

export async function kodDurumlariniYukle(projeId: string): Promise<void> {
  if (useKodZekasi.getState().projeId !== projeId) useKodZekasi.setState({ projeId, durumlar: {}, alan: "ana" });
  const liste = await api.kodDurumlari(projeId);
  if (useKodZekasi.getState().projeId !== projeId) return;
  useKodZekasi.setState((d) => ({ durumlar: { ...d.durumlar, ...Object.fromEntries(liste.map((x) => [x.alan, x])) } }));
}

export function kodDurumuUygula(projeId: string, durum: KodDizinDurumu): void {
  useKodZekasi.setState((d) => (d.projeId === projeId ? { durumlar: { ...d.durumlar, [durum.alan]: durum } } : {}));
}

export function kodAlaniSec(alan: string): void {
  useKodZekasi.setState({ alan });
}

export function grafikTercihi(t: Partial<GrafikTercihi>): void {
  useKodZekasi.setState((d) => ({ grafik: { ...d.grafik, ...t } }));
}

/** Dosya düzeyinin varsayılan olduğu en büyük dizin: küçük projede klasör düzeyi aynı klasördeki bağları yutar */
export const DOSYA_DUZEYI_SINIRI = 250;

/** Dizinleme sürüyor mu (tarama, model indirme ya da gömme) */
export function dizinSuruyor(d: KodDizinDurumu | undefined): boolean {
  return Boolean(d && (d.durum === "taraniyor" || d.durum === "model-indiriliyor" || d.durum === "gomuluyor"));
}
