// Uygulama içi tarayıcının sayfaya yüklenen betiği (sandbox'lı, yalıtılmış dünya, CJS olarak derlenir).
// Sayfaya hiçbir şey açmaz (contextBridge yok): yalnız ana süreçten "seçici aç/kapat/bırak" iletisini alır,
// seçilen öğenin bilgisini ana sürece gönderir. Seçim katmanı: secici-katmani.ts, öğe bilgisi: secim.ts.

import { ipcRenderer } from "electron";
import { TARAYICI_KANALLARI, type SayfaKomutu, type SayfaSecimi } from "../kopru.js";
import { SeciciKatmani } from "./secici-katmani.js";

const katman = new SeciciKatmani(
  (secim: SayfaSecimi) => ipcRenderer.send(TARAYICI_KANALLARI.sayfaSecim, secim),
  () => ipcRenderer.send(TARAYICI_KANALLARI.sayfaCikis),
);

ipcRenderer.on(TARAYICI_KANALLARI.sayfaKomut, (_olay, komut: SayfaKomutu | undefined) => {
  if (!komut || typeof komut !== "object") return;
  if (komut.tur === "ac") katman.ac(typeof komut.ipucu === "string" ? komut.ipucu.slice(0, 160) : "");
  else if (komut.tur === "kapat") katman.kapat();
  else if (komut.tur === "birak") katman.birak();
});
