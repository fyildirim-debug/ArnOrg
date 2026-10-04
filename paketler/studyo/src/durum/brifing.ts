// Karargâh'taki "Brifing ver" isteklerinin durumu, proje başına. Ekran değişse de korunur: düğme yeniden çizilince
// "Hazırlanıyor…" sürer. İstek, CEO brifingi #yonetim'e yazınca, "yazıyor" göstergesi görülüp bitince ya da süre
// dolunca biter (yardimcilar/brifing.ts brifingBittiMi).
import { create } from "zustand";
import type { BrifingIstegi } from "../yardimcilar/brifing";

export const useBrifingIstekleri = create<{ istekler: Record<string, BrifingIstegi> }>()(() => ({ istekler: {} }));

/** İstek kabul edildi (istendi ya da zaten hazırlanıyor) */
export function brifingIstendi(pid: string, sonMesajId: string | null) {
  useBrifingIstekleri.setState((d) => ({ istekler: { ...d.istekler, [pid]: { zaman: Date.now(), sonMesajId, yaziyorGoruldu: false } } }));
}

/** CEO'nun "yazıyor" göstergesi görüldü */
export function brifingYaziyorGoruldu(pid: string) {
  useBrifingIstekleri.setState((d) => {
    const i = d.istekler[pid];
    return i && !i.yaziyorGoruldu ? { istekler: { ...d.istekler, [pid]: { ...i, yaziyorGoruldu: true } } } : {};
  });
}

export function brifingBitti(pid: string) {
  useBrifingIstekleri.setState((d) => {
    if (!d.istekler[pid]) return {};
    const { [pid]: _, ...kalan } = d.istekler;
    return { istekler: kalan };
  });
}
