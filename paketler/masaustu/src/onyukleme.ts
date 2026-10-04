// Ana pencerenin ön yükleme betiği (sandbox'lı, CJS olarak derlenir).
// Stüdyo'ya yalnız küçük bir köprü açılır: window.arnorg = { platform, surum, disaridaAc(url), klasorSec(),
// dikkatCek(), oneGetir(), guncelleme: { durum(), dinle(f), kur() }, tarayici: { git, geri, ileri, yenile, durdur,
// yerlestir, secici, secimiBirak, kare, durum, dinle } }.
// Node ya da Electron API'lerinin kendisi (ipcRenderer, olay nesneleri) sayfaya hiç verilmez.

import { contextBridge, ipcRenderer } from "electron";
import {
  DIKKAT_KANALI,
  DISARIDA_AC_KANALI,
  GUNCELLEME_KANALLARI,
  KLASOR_SEC_KANALI,
  TARAYICI_KANALLARI,
  type DikkatIstegi,
  type GuncellemeDurumu,
  type TarayiciDurumu,
  type TarayiciKomutu,
  type TarayiciOlayi,
  type TarayiciSiniri,
} from "./kopru.js";

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
  /** Uygulama içi tarayıcı (ana süreçteki WebContentsView): gezinme, yer, öğe seçici, kare, durum ve olaylar */
  tarayici: {
    git: (adres: string): Promise<boolean> => tarayiciKomutu({ tur: "git", adres: String(adres) }).then((s) => s === true),
    geri: (): void => void tarayiciKomutu({ tur: "geri" }),
    ileri: (): void => void tarayiciKomutu({ tur: "ileri" }),
    yenile: (): void => void tarayiciKomutu({ tur: "yenile" }),
    durdur: (): void => void tarayiciKomutu({ tur: "durdur" }),
    /** Görünümün yeri (CSS piksel); null gizler */
    yerlestir: (sinir: TarayiciSiniri | null): void =>
      void tarayiciKomutu({
        tur: "yerlestir",
        sinir: sinir ? { x: Number(sinir.x), y: Number(sinir.y), genislik: Number(sinir.genislik), yukseklik: Number(sinir.yukseklik) } : null,
      }),
    secici: (acik: boolean, ipucu?: string): void => void tarayiciKomutu({ tur: "secici", acik: acik === true, ipucu: typeof ipucu === "string" ? ipucu : "" }),
    secimiBirak: (): void => void tarayiciKomutu({ tur: "secimiBirak" }),
    kare: (): Promise<string | null> => tarayiciKomutu({ tur: "kare" }).then((s) => (typeof s === "string" ? s : null)),
    durum: (): Promise<TarayiciDurumu | null> => tarayiciKomutu({ tur: "durum" }) as Promise<TarayiciDurumu | null>,
    /** Olay gelince dinleyici yalnız olayla çağrılır; dönen işlev dinlemeyi bırakır */
    dinle: (dinleyici: (olay: TarayiciOlayi) => void): (() => void) => {
      const aktar = (_olay: unknown, olay: TarayiciOlayi) => dinleyici(olay);
      ipcRenderer.on(TARAYICI_KANALLARI.olay, aktar);
      return () => {
        ipcRenderer.removeListener(TARAYICI_KANALLARI.olay, aktar);
      };
    },
  },
});

/** Tarayıcı komutu; ana süreç reddederse (yanlış pencere, bozuk komut) null döner, hata fırlatmaz */
function tarayiciKomutu(komut: TarayiciKomutu): Promise<unknown> {
  return ipcRenderer.invoke(TARAYICI_KANALLARI.komut, komut).catch(() => null);
}
