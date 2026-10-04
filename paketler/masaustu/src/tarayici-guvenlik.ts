// Uygulama içi tarayıcının güvenlik kuralları (Electron'a bağlı kısım; kararlar tarayici-denetimleri.ts'te).
//
// Oturum (persist:arnorg-tarayici): ana uygulamanın çerezlerinden ve depolamasından ayrı. İzin istekleri ve
// denetimleri reddedilir, aygıt (USB/HID/seri) izni verilmez, ekran paylaşımı isteği varsayılan olarak reddedilir,
// indirme kaydetme penceresiyle kullanıcıya sorulur (vazgeçerse iner değil), kullanıcı aracısında Electron görünmez.
// İçerik: ana çerçeve yalnız http/https/about:blank'e gider, iframe yerel ve iç protokollere gidemez, açılır
// pencere aynı görünümde açılır (http/https değilse reddedilir), sayfanın "ayrılmayın" engeli yok sayılır.
// Bu kurallar oturumdaki her içeriğe web-contents-created anında uygulanır (guvenlik.ts).

import { app, BrowserWindow, dialog, session, type Session, type WebContents } from "electron";
import { join } from "node:path";
import {
  cerceveAdresiMi,
  indirmeAdi,
  TARAYICI_BOLUMU,
  tarayiciAdresiMi,
  tarayiciIzniVerilirMi,
  tarayiciKullaniciAjani,
  tarayiciYeniPencereKarari,
} from "./tarayici-denetimleri.js";

let oturum: Session | null = null;

const ingilizce = () => !app.getLocale().toLowerCase().startsWith("tr");

/** Tarayıcının oturumu: ilk istekte açılır, kuralları bir kez kurulur */
export function tarayiciOturumu(): Session {
  if (oturum) return oturum;
  const o = session.fromPartition(TARAYICI_BOLUMU);
  o.setPermissionRequestHandler((_icerik, izin, geriCagri) => geriCagri(tarayiciIzniVerilirMi(izin)));
  o.setPermissionCheckHandler((_icerik, izin) => tarayiciIzniVerilirMi(izin));
  o.setDevicePermissionHandler(() => false);
  o.setUserAgent(tarayiciKullaniciAjani(o.getUserAgent()));
  o.on("will-download", (olay, oge, icerik) => {
    // Kullanıcıya sorulmadan inmez: kaydetme penceresi; vazgeçilirse indirme iptal
    const ad = indirmeAdi(oge.getFilename());
    const secenek = {
      title: ingilizce() ? `Download: ${ad}` : `İndir: ${ad}`,
      defaultPath: join(app.getPath("downloads"), ad),
      buttonLabel: ingilizce() ? "Save" : "Kaydet",
    };
    const ebeveyn = BrowserWindow.getFocusedWindow() ?? BrowserWindow.fromWebContents(icerik);
    const yol = ebeveyn ? dialog.showSaveDialogSync(ebeveyn, secenek) : dialog.showSaveDialogSync(secenek);
    if (!yol) {
      olay.preventDefault();
      return;
    }
    oge.setSavePath(yol);
  });
  oturum = o;
  return o;
}

/** İçerik tarayıcının oturumunda mı (uygulama içi tarayıcının görünümü) */
export function tarayiciIcerigiMi(icerik: WebContents): boolean {
  const o = icerik.session;
  if (o === session.defaultSession) return false;
  const t = tarayiciOturumu();
  return o === t || (o.storagePath !== null && o.storagePath === t.storagePath);
}

/** Tarayıcı içeriğinin gezinme ve pencere kuralları */
export function tarayiciIceriginiKoru(icerik: WebContents): void {
  // Oturumun kullanıcı aracısı yeni içeriklere geçer; bu içerik oturumdan önce doğmuş olabilir
  icerik.setUserAgent(tarayiciKullaniciAjani(icerik.getUserAgent()));
  icerik.setWindowOpenHandler(({ url }) => {
    const karar = tarayiciYeniPencereKarari(url);
    if (karar.tur === "ayni-gorunum") {
      setImmediate(() => {
        if (!icerik.isDestroyed()) icerik.loadURL(karar.adres).catch(() => undefined);
      });
    }
    return { action: "deny" };
  });
  icerik.on("will-navigate", (olay) => {
    if (!tarayiciAdresiMi(olay.url)) olay.preventDefault();
  });
  icerik.on("will-redirect", (olay) => {
    if (olay.isMainFrame ? !tarayiciAdresiMi(olay.url) : !cerceveAdresiMi(olay.url)) olay.preventDefault();
  });
  icerik.on("will-frame-navigate", (olay) => {
    if (olay.isMainFrame ? !tarayiciAdresiMi(olay.url) : !cerceveAdresiMi(olay.url)) olay.preventDefault();
  });
  // "Sayfadan ayrılmak istiyor musunuz?" engeli: kurulun yazdığı adrese gitmesini durdurmasın
  icerik.on("will-prevent-unload", (olay) => olay.preventDefault());
}
