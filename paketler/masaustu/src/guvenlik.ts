// Tüm pencerelere uygulanan güvenlik kuralları:
// - Pencere yalnız çekirdeğin kökünde (http://127.0.0.1:<port>) gezinebilir; başka http(s) adresleri
//   sistem tarayıcısında açılır, diğer her şey engellenir.
// - Yeni pencere açılmaz (window.open, target=_blank): http(s) ise sistem tarayıcısına gider.
// - <webview> eklenemez.
// - İzinler (pano, bildirim, tam ekran) yalnız çekirdek kökünden gelen isteklere verilir.

import { app, session, shell } from "electron";
import { ayniKokMu, disaridaAcilabilirMi } from "./denetimler.js";

const IZINLI_IZINLER = new Set(["clipboard-read", "clipboard-sanitized-write", "fullscreen", "notifications"]);

export function disaridaAc(url: string): boolean {
  if (!disaridaAcilabilirMi(url)) return false;
  void shell.openExternal(url);
  return true;
}

/** Uygulama hazır olmadan çağrılır: oturum açılır açılmaz yazım denetimini kapatır
 * (açıkken Chromium sözlükleri Google sunucularından indirir). */
export function oturumAyarlariniKur(): void {
  app.on("session-created", (oturum) => {
    oturum.setSpellCheckerEnabled(false);
    oturum.setSpellCheckerLanguages([]);
  });
}

export function guvenligiKur(cekirdekKoku: () => string | null): void {
  const kokten = (url: string) => {
    const kok = cekirdekKoku();
    return kok !== null && ayniKokMu(url, kok);
  };

  app.on("web-contents-created", (_olay, icerik) => {
    icerik.on("will-attach-webview", (olay) => olay.preventDefault());
    icerik.setWindowOpenHandler(({ url }) => {
      disaridaAc(url);
      return { action: "deny" };
    });
    const gezinmeyiDenetle = (olay: Electron.Event, url: string) => {
      if (kokten(url)) return;
      olay.preventDefault();
      disaridaAc(url);
    };
    icerik.on("will-navigate", gezinmeyiDenetle);
    icerik.on("will-redirect", (olay, url, _yerinde, anaCerceve) => {
      if (anaCerceve) gezinmeyiDenetle(olay, url);
    });
  });

  const oturum = session.defaultSession;
  oturum.setPermissionRequestHandler((_icerik, izin, geriCagri, ayrinti) => {
    geriCagri(IZINLI_IZINLER.has(izin) && kokten(ayrinti.requestingUrl));
  });
  oturum.setPermissionCheckHandler((_icerik, izin, istekKoku) => IZINLI_IZINLER.has(izin) && kokten(istekKoku));
}
