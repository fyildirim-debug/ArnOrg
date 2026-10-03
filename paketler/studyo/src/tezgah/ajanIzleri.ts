// Tezgâhın ajan farkındalığı için ortak durum: hangi dosyayı hangi ajan düzenliyor ve değiştirdi.
// Dosya sistemi sağlayıcısı (stat yanıtları) ve canlı olaylar doldurur; ArnOrg eklentisi (rozetler,
// durum çubuğu, "Duraklat ve düzenle") okur. Anahtarlar arnorg: adres yollarıdır (/proje/alan/yol).
import type { Ajan } from "@arnorg/ortak";
import { useVeri } from "../durum/veri";

type Dinleyici = (yollar: string[]) => void;

/** Adres yolu → şu an düzenleyen ajan (çekirdeğin stat yanıtına göre) */
const duzenleyenler = new Map<string, string>();
/** Adres yolu → dosyayı son değiştiren ajan (bu oturumda canlı olaylardan) */
const degistirenler = new Map<string, string>();
const dinleyiciler = new Set<Dinleyici>();

function bildir(yollar: string[]) {
  if (yollar.length) for (const d of dinleyiciler) d(yollar);
}

export const ajanIzleri = {
  ajan(id: string | null | undefined): Ajan | undefined {
    return id ? useVeri.getState().ajanlar.find((a) => a.id === id) : undefined;
  },
  duzenleyen(yol: string): string | null {
    return duzenleyenler.get(yol) ?? null;
  },
  degistiren(yol: string): string | null {
    return degistirenler.get(yol) ?? null;
  },
  /** stat yanıtıyla düzenleyen bilgisini günceller */
  duzenleyenAyarla(yol: string, ajanId: string | null) {
    const once = duzenleyenler.get(yol) ?? null;
    if (once === ajanId) return;
    if (ajanId) duzenleyenler.set(yol, ajanId);
    else duzenleyenler.delete(yol);
    bildir([yol]);
  },
  degistirenAyarla(yol: string, ajanId: string) {
    if (degistirenler.get(yol) === ajanId) return;
    degistirenler.set(yol, ajanId);
    bildir([yol]);
  },
  /** Ajanın düzenlemekte olduğu bilinen dosyalar (ajan durunca yeniden stat edilir) */
  ajaninDuzenledikleri(ajanId: string): string[] {
    return [...duzenleyenler].filter(([, a]) => a === ajanId).map(([y]) => y);
  },
  /** Proje değişince bu oturumun izleri temizlenir */
  temizle() {
    const yollar = [...new Set([...duzenleyenler.keys(), ...degistirenler.keys()])];
    duzenleyenler.clear();
    degistirenler.clear();
    bildir(yollar);
  },
  dinle(d: Dinleyici): () => void {
    dinleyiciler.add(d);
    return () => dinleyiciler.delete(d);
  },
};
