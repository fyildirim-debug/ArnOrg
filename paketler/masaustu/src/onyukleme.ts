// Ana pencerenin ön yükleme betiği (sandbox'lı, CJS olarak derlenir).
// Stüdyo'ya yalnız küçük bir köprü açılır: window.arnorg = { platform, surum, disaridaAc(url) }.
// Node ya da Electron API'lerinin kendisi sayfaya hiç verilmez.

import { contextBridge, ipcRenderer } from "electron";
import { DISARIDA_AC_KANALI } from "./kopru.js";

declare const __ARNORG_SURUMU__: string;

contextBridge.exposeInMainWorld("arnorg", {
  /** "win32" | "linux" | "darwin" */
  platform: process.platform,
  /** Masaüstü uygulamasının sürümü */
  surum: __ARNORG_SURUMU__,
  /** http/https adresini sistem tarayıcısında açar; başka protokoller reddedilir. */
  disaridaAc: (url: string): Promise<boolean> => ipcRenderer.invoke(DISARIDA_AC_KANALI, String(url)),
});
