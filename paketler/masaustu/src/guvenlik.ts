// Tüm pencerelere uygulanan güvenlik kuralları:
// - Pencere yalnız çekirdeğin kökünde (http://127.0.0.1:<port>) gezinebilir; başka http(s) adresleri
//   sistem tarayıcısında açılır, diğer her şey engellenir.
// - Yeni pencere açılmaz (window.open, target=_blank): http(s) ise sistem tarayıcısına gider.
// - <webview> eklenemez (uygulama içi tarayıcı da webview değil, ana süreçteki WebContentsView'dır).
// - İzinler (pano, bildirim, tam ekran) yalnız çekirdek kökünden gelen isteklere verilir.
// - Uygulama içi tarayıcının içeriği (kendi oturumu) bu kurallar yerine tarayici-guvenlik.ts'tekilere uyar.

import { app, session, shell } from "electron";
import { anaPencereIzniMi, ayniKokMu, disaridaAcilabilirMi } from "./denetimler.js";
import { tarayiciIcerigiMi, tarayiciIceriginiKoru } from "./tarayici-guvenlik.js";
import { webviewEklemeKarari } from "./tarayici-denetimleri.js";

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
    icerik.on("will-attach-webview", (olay) => {
      if (webviewEklemeKarari() === "ret") olay.preventDefault();
    });
    if (tarayiciIcerigiMi(icerik)) {
      tarayiciIceriginiKoru(icerik);
      return;
    }
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
    geriCagri(anaPencereIzniMi(izin, ayrinti.requestingUrl, cekirdekKoku()));
  });
  oturum.setPermissionCheckHandler((_icerik, izin, istekKoku) => anaPencereIzniMi(izin, istekKoku, cekirdekKoku()));
}
