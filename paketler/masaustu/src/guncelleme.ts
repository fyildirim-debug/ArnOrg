// Otomatik güncelleme (GitHub sürümleri, electron-builder.yml → publish).
//
// Paketlenmiş uygulama açılışta yeni sürümü denetler, indirir ve uygulama kapanırken kurar.
// electron-updater bulunamazsa bu adım sessizce atlanır. Desteklenen biçimler: NSIS, AppImage, deb, rpm (MSI desteklenmez).
// Kapatmak için: ARNORG_GUNCELLEME=kapali

import { app } from "electron";
import type { Kayit } from "./kayit.js";

interface Guncelleyici {
  logger: unknown;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdatesAndNotify(): Promise<unknown>;
}

export async function guncellemeyiDenetle(kayit: Kayit): Promise<void> {
  if (!app.isPackaged || process.env.ARNORG_GUNCELLEME === "kapali") return;

  // Değişkenle içe aktarma: derleyici paketi aramaz, paket yoksa yalnız bu blok atlanır.
  const modulAdi = "electron-updater";
  let guncelleyici: Guncelleyici | undefined;
  try {
    const modul = (await import(modulAdi)) as { autoUpdater?: Guncelleyici; default?: { autoUpdater?: Guncelleyici } };
    guncelleyici = modul.autoUpdater ?? modul.default?.autoUpdater;
  } catch {
    kayit.kabuk("electron-updater kurulu değil; otomatik güncelleme kapalı");
    return;
  }
  if (!guncelleyici) return;

  guncelleyici.logger = {
    info: (m: unknown) => kayit.kabuk(`güncelleme: ${String(m)}`),
    warn: (m: unknown) => kayit.kabuk(`güncelleme uyarısı: ${String(m)}`),
    error: (m: unknown) => kayit.kabuk(`güncelleme hatası: ${String(m)}`),
    debug: () => {},
  };
  guncelleyici.autoDownload = true;
  guncelleyici.autoInstallOnAppQuit = true;
  try {
    await guncelleyici.checkForUpdatesAndNotify();
  } catch (hata) {
    kayit.kabuk(`güncelleme denetlenemedi: ${hata instanceof Error ? hata.message : String(hata)}`);
  }
}
