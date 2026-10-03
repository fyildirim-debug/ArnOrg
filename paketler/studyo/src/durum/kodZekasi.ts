// Kod zekâsı: çalışma alanlarının dizin durumu (canlı kod.dizin olaylarıyla güncel) ve ekranda seçili alan
import type { KodDizinDurumu } from "@arnorg/ortak";
import { create } from "zustand";
import { api } from "../api/uclar";

interface KodZekasiDurumu {
  projeId: string | null;
  /** Alan ("ana" ya da ajan kimliği) → dizin durumu */
  durumlar: Record<string, KodDizinDurumu>;
  /** Ekranda seçili alan */
  alan: string;
}

export const useKodZekasi = create<KodZekasiDurumu>()(() => ({ projeId: null, durumlar: {}, alan: "ana" }));

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

/** Dizinleme sürüyor mu (tarama, model indirme ya da gömme) */
export function dizinSuruyor(d: KodDizinDurumu | undefined): boolean {
  return Boolean(d && (d.durum === "taraniyor" || d.durum === "model-indiriliyor" || d.durum === "gomuluyor"));
}
