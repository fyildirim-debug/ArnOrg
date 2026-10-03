// Proje hafızası ve ajanlar arası sorular: ekran açılınca yüklenir, canlı olaylarla güncel kalır
import type { AjanSorusu, HafizaKaydi } from "@arnorg/ortak";
import { create } from "zustand";
import { api } from "../api/uclar";
import { hataMetni } from "../api/istek";

type Yukleme = "bos" | "yukleniyor" | "hazir" | "hata";

interface HafizaDurumu {
  projeId: string | null;
  /** Eskimiş kayıtlar dahil; ekran süzer */
  kayitlar: HafizaKaydi[];
  sorular: AjanSorusu[];
  yukleme: Yukleme;
  hata: string | null;
}

export const useHafiza = create<HafizaDurumu>()(() => ({ projeId: null, kayitlar: [], sorular: [], yukleme: "bos", hata: null }));

/** Önem, sonra tazelik */
function sirala(k: HafizaKaydi[]): HafizaKaydi[] {
  return [...k].sort((a, b) => b.onem - a.onem || b.guncelleme.localeCompare(a.guncelleme));
}

export async function hafizayiYukle(projeId: string, sessiz = false): Promise<void> {
  const once = useHafiza.getState();
  if (!sessiz || once.projeId !== projeId) useHafiza.setState({ projeId, yukleme: "yukleniyor", hata: null, ...(once.projeId !== projeId ? { kayitlar: [], sorular: [] } : {}) });
  try {
    const [kayitlar, sorular] = await Promise.all([api.hafiza(projeId, { eskiler: true }), api.sorular(projeId)]);
    if (useHafiza.getState().projeId !== projeId) return;
    useHafiza.setState({ kayitlar: sirala(kayitlar), sorular, yukleme: "hazir", hata: null });
  } catch (e) {
    if (useHafiza.getState().projeId !== projeId) return;
    useHafiza.setState({ yukleme: "hata", hata: hataMetni(e) });
  }
}

export function hafizaKaydiUygula(k: HafizaKaydi): void {
  useHafiza.setState((d) => {
    if (d.projeId !== k.projeId) return {};
    const var_ = d.kayitlar.some((x) => x.id === k.id);
    return { kayitlar: sirala(var_ ? d.kayitlar.map((x) => (x.id === k.id ? k : x)) : [k, ...d.kayitlar]) };
  });
}

export function hafizaKaydiKaldir(projeId: string, id: string): void {
  useHafiza.setState((d) => (d.projeId === projeId ? { kayitlar: d.kayitlar.filter((x) => x.id !== id) } : {}));
}

export function soruUygula(s: AjanSorusu): void {
  useHafiza.setState((d) => {
    if (d.projeId !== s.projeId) return {};
    const var_ = d.sorular.some((x) => x.id === s.id);
    return { sorular: var_ ? d.sorular.map((x) => (x.id === s.id ? s : x)) : [s, ...d.sorular] };
  });
}
