// Ana pencerenin ön yükleme betiği (sandbox'lı, CJS olarak derlenir).
// Stüdyo'ya yalnız küçük bir köprü açılır: window.arnorg = { platform, surum, disaridaAc(url), klasorSec(),
// dikkatCek(), oneGetir(), guncelleme: { durum(), dinle(f), kur() } }.
// Node ya da Electron API'lerinin kendisi (ipcRenderer, olay nesneleri) sayfaya hiç verilmez.

import { contextBridge, ipcRenderer } from "electron";
import { DIKKAT_KANALI, DISARIDA_AC_KANALI, GUNCELLEME_KANALLARI, KLASOR_SEC_KANALI, type DikkatIstegi, type GuncellemeDurumu } from "./kopru.js";

declare const __ARNORG_SURUMU__: string;

contextBridge.exposeInMainWorld("arnorg", {
  /** "win32" | "linux" | "darwin" */
  platform: process.platform,
  /** Masaüstü uygulamasının sürümü */
  surum: __ARNORG_SURUMU__,
  /** http/https adresini sistem tarayıcısında açar; başka protokoller reddedilir. */
  disaridaAc: (url: string): Promise<boolean> => ipcRenderer.invoke(DISARIDA_AC_KANALI, String(url)),
  /** Sistemin klasör seçicisi; vazgeçilirse null */
  klasorSec: (secenek?: { baslik?: string; varsayilan?: string }): Promise<string | null> =>
    ipcRenderer.invoke(KLASOR_SEC_KANALI, { baslik: secenek?.baslik, varsayilan: secenek?.varsayilan }),
  /** Pencere arkadaysa görev çubuğunda dikkat çeker (Windows'ta yanıp söner); pencereye dönülünce durur */
  dikkatCek: (): void => ipcRenderer.send(DIKKAT_KANALI, "cek" satisfies DikkatIstegi),
  /** Pencereyi öne getirir (simge durumundaysa açar); masaüstü bildirimine tıklanınca */
  oneGetir: (): void => ipcRenderer.send(DIKKAT_KANALI, "one-getir" satisfies DikkatIstegi),
  /** Otomatik güncelleme: anlık durum, değişiklik dinleyicisi, indirilen sürümü kurup yeniden başlatma */
  guncelleme: {
    durum: (): Promise<GuncellemeDurumu | null> => ipcRenderer.invoke(GUNCELLEME_KANALLARI.al),
    /** Durum değişince dinleyici yalnız durumla çağrılır; dönen işlev dinlemeyi bırakır */
    dinle: (dinleyici: (durum: GuncellemeDurumu) => void): (() => void) => {
      const aktar = (_olay: unknown, durum: GuncellemeDurumu) => dinleyici(durum);
      ipcRenderer.on(GUNCELLEME_KANALLARI.durum, aktar);
      return () => {
        ipcRenderer.removeListener(GUNCELLEME_KANALLARI.durum, aktar);
      };
    },
    /** İndirilen güncellemeyi kurar ve uygulamayı yeniden başlatır; indirilmiş sürüm yoksa false */
    kur: (): Promise<boolean> => ipcRenderer.invoke(GUNCELLEME_KANALLARI.kur),
  },
});
