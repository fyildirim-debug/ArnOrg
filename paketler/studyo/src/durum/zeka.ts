// Global zekâ: projelerden bağımsız, kendi kendine öğrenen standart kurallar ve öğrenme günlüğü
import type { KureselKural, ZekaDurumu, ZekaGunlukKaydi } from "@arnorg/ortak";
import { create } from "zustand";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import type { Yukleme } from "./veri";

interface ZekaDeposu {
  durum: ZekaDurumu | null;
  yukleme: Yukleme;
  hata: string | null;
}

export const useZeka = create<ZekaDeposu>()(() => ({ durum: null, yukleme: "bos", hata: null }));

export async function zekaYukle(): Promise<void> {
  if (useZeka.getState().yukleme !== "hazir") useZeka.setState({ yukleme: "yukleniyor" });
  try {
    useZeka.setState({ durum: await api.zeka(), yukleme: "hazir", hata: null });
  } catch (e) {
    useZeka.setState({ yukleme: "hata", hata: hataMetni(e) });
  }
}

function sayilar(kurallar: KureselKural[]): ZekaDurumu["sayilar"] {
  const s = { aday: 0, etkin: 0, emekli: 0 };
  for (const k of kurallar) s[k.durum]++;
  return s;
}

/** "zeka.guncellendi" olayı ya da API yanıtı: kural güncellenir, günlüğe satır eklenir */
export function zekaOlayiUygula(kural: KureselKural | null, gunluk: ZekaGunlukKaydi | null, silinenId?: string) {
  useZeka.setState((d) => {
    if (!d.durum) return {};
    let kurallar = d.durum.kurallar;
    if (kural) {
      const i = kurallar.findIndex((k) => k.id === kural.id);
      kurallar = i === -1 ? [kural, ...kurallar] : kurallar.map((k) => (k.id === kural.id ? kural : k));
    }
    if (silinenId) kurallar = kurallar.filter((k) => k.id !== silinenId);
    const gunlukListe = gunluk && !d.durum.gunluk.some((g) => g.id === gunluk.id) ? [gunluk, ...d.durum.gunluk].slice(0, 200) : d.durum.gunluk;
    return { durum: { kurallar, gunluk: gunlukListe, sayilar: sayilar(kurallar) } };
  });
}
