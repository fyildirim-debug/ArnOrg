// Kurulum durumu: Claude Code, git ve GitHub CLI; giriş ve kurulum işlemleri canlı çıktıyla ("kurulum.islem" olayı)
import type { KurulumDurumu, KurulumIslemi, KurulumIslemTuru } from "@arnorg/ortak";
import { create } from "zustand";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import type { Yukleme } from "./veri";

interface KurulumDeposu {
  durum: KurulumDurumu | null;
  yukleme: Yukleme;
  hata: string | null;
  /** Kimliğe göre son bilinen işlemler */
  islemler: Record<string, KurulumIslemi>;
}

export const useKurulum = create<KurulumDeposu>()(() => ({ durum: null, yukleme: "bos", hata: null, islemler: {} }));

const ayarla = useKurulum.setState;

/** Claude, git ve gh durumunu okur; tazele=true çekirdeğin önbelleğini atlar */
export async function kurulumuYukle(tazele = false): Promise<KurulumDurumu | null> {
  if (useKurulum.getState().yukleme !== "hazir") ayarla({ yukleme: "yukleniyor" });
  try {
    const durum = await api.kurulum(tazele);
    ayarla({ durum, yukleme: "hazir", hata: null });
    return durum;
  } catch (e) {
    ayarla({ yukleme: "hata", hata: hataMetni(e) });
    return null;
  }
}

export function kurulumDurumuUygula(durum: KurulumDurumu) {
  ayarla({ durum, yukleme: "hazir", hata: null });
}

export function islemUygula(islem: KurulumIslemi) {
  ayarla((d) => ({ islemler: { ...d.islemler, [islem.id]: islem } }));
}

/** İşlemi başlatır (API çağrısı) ve depoya yazar; süren aynı türde işlem varsa çekirdek onu döndürür */
export async function islemBaslat(baslat: () => Promise<KurulumIslemi>): Promise<KurulumIslemi> {
  const islem = await baslat();
  islemUygula(islem);
  return islem;
}

/** Türün en son işlemi (ekranlar bunu gösterir) */
export function sonIslem(islemler: Record<string, KurulumIslemi>, tur: KurulumIslemTuru): KurulumIslemi | undefined {
  let son: KurulumIslemi | undefined;
  for (const i of Object.values(islemler)) if (i.tur === tur && (!son || i.baslangic > son.baslangic)) son = i;
  return son;
}

/** Bileşende: const islem = useSonIslem("claude_giris") */
export function useSonIslem(tur: KurulumIslemTuru): KurulumIslemi | undefined {
  return useKurulum((d) => sonIslem(d.islemler, tur));
}
