// Açılış/hata penceresinin ön yükleme betiği (sandbox'lı, CJS olarak derlenir).
// Sayfaya window.arnorgDurum = { al, dinle, eylem } köprüsünü açar.

import { contextBridge, ipcRenderer } from "electron";
import { DURUM_EYLEMLERI, DURUM_KANALLARI, type DurumBilgisi, type DurumEylemi } from "./kopru.js";

contextBridge.exposeInMainWorld("arnorgDurum", {
  al: (): Promise<DurumBilgisi> => ipcRenderer.invoke(DURUM_KANALLARI.al),
  dinle: (geriCagri: (durum: DurumBilgisi) => void): void => {
    ipcRenderer.on(DURUM_KANALLARI.guncelle, (_olay, durum: DurumBilgisi) => geriCagri(durum));
  },
  eylem: (ad: DurumEylemi): void => {
    if (DURUM_EYLEMLERI.includes(ad)) ipcRenderer.send(DURUM_KANALLARI.eylem, ad);
  },
});
