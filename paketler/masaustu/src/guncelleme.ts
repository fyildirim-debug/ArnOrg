// Otomatik güncelleme (GitHub sürümleri, electron-builder.yml → publish).
//
// Paketlenmiş uygulama açılışta ve açık kaldıkça 6 saatte bir yeni sürümü denetler, bulursa arka planda indirir.
// electron-updater olayları (bulundu, indiriliyor, indirildi, hata) güncelleme durumuna çevrilir ve ana pencereye IPC ile
// iletilir (kopru.ts → GUNCELLEME_KANALLARI). Sistem bildirimi gönderilmez: Stüdyo indirilen sürüm için üst çubuğun
// altında "yeniden başlatınca kurulur" şeridini gösterir. Kurul "Yeniden başlat" derse hemen kurulur (quitAndInstall),
// demezse uygulama kapanırken kurulur. electron-updater bulunamazsa bu adım sessizce atlanır.
// Desteklenen biçimler: NSIS, AppImage, deb, rpm (MSI desteklenmez).
//
// Kapatmak için: ARNORG_GUNCELLEME=kapali
// Geliştirmede şeridi denemek için: ARNORG_SAHTE_GUNCELLEME=<sürüm> (yalnız paketsiz uygulamada; indirme taklit edilir,
// "Yeniden başlat" bir şey kurmadan uygulamayı yeniden açar)

import { app } from "electron";
import type { Kayit } from "./kayit.js";
import type { GuncellemeDurumu } from "./kopru.js";

/** Uygulama açık kaldıkça yeni sürüm bu aralıkla yeniden denetlenir */
export const DENETIM_ARALIGI_MS = 6 * 60 * 60_000;

interface Guncelleyici {
  logger: unknown;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(olay: string, dinleyici: (...argumanlar: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(sessiz?: boolean, sonraCalistir?: boolean): void;
}

const hataMetni = (hata: unknown) => (hata instanceof Error ? hata.message : String(hata));

export class Guncelleme {
  private son: GuncellemeDurumu = { asama: "yok", surum: null, yuzde: null, hata: null };
  private guncelleyici: Guncelleyici | null = null;
  private sahte = false;
  private zamanlayici: NodeJS.Timeout | null = null;
  private basladi = false;

  constructor(
    private readonly kayit: Kayit,
    /** Durum değişince çağrılır (ana pencereye iletir) */
    private readonly yayinla: (durum: GuncellemeDurumu) => void,
  ) {}

  /** Anlık durum (ön yükleme köprüsünün durum() çağrısı) */
  get durum(): GuncellemeDurumu {
    return { ...this.son };
  }

  private degistir(yeni: Partial<GuncellemeDurumu>): void {
    const onceki = this.son;
    this.son = { ...this.son, ...yeni };
    if (JSON.stringify(onceki) !== JSON.stringify(this.son)) this.yayinla(this.durum);
  }

  /** Güncelleyiciyi kurar, hemen denetler, sonra DENETIM_ARALIGI_MS'de bir yeniden denetler; bir kez çalışır */
  async baslat(): Promise<void> {
    if (this.basladi) return;
    this.basladi = true;
    if (!app.isPackaged) {
      const surum = process.env.ARNORG_SAHTE_GUNCELLEME?.trim();
      if (surum) this.sahteIndir(surum);
      return;
    }
    if (process.env.ARNORG_GUNCELLEME === "kapali") return;

    // Değişkenle içe aktarma: derleyici paketi aramaz, paket yoksa yalnız bu blok atlanır.
    const modulAdi = "electron-updater";
    let g: Guncelleyici | undefined;
    try {
      const modul = (await import(modulAdi)) as { autoUpdater?: Guncelleyici; default?: { autoUpdater?: Guncelleyici } };
      g = modul.autoUpdater ?? modul.default?.autoUpdater;
    } catch {
      this.kayit.kabuk("electron-updater kurulu değil; otomatik güncelleme kapalı");
      return;
    }
    if (!g) return;

    g.logger = {
      info: (m: unknown) => this.kayit.kabuk(`güncelleme: ${String(m)}`),
      warn: (m: unknown) => this.kayit.kabuk(`güncelleme uyarısı: ${String(m)}`),
      error: (m: unknown) => this.kayit.kabuk(`güncelleme hatası: ${String(m)}`),
      debug: () => {},
    };
    g.autoDownload = true;
    g.autoInstallOnAppQuit = true;
    // İndirilmiş sürüm yeniden denetimde (aynı sürüm) şeridi söndürmesin: "hazir" yalnız daha yeni bir sürümle değişir
    const hazirdaAyni = (surum: string | undefined) => this.son.asama === "hazir" && (!surum || surum === this.son.surum);
    g.on("checking-for-update", () => {
      if (this.son.asama !== "hazir") this.degistir({ asama: "denetleniyor", hata: null });
    });
    g.on("update-available", (bilgi: { version?: string }) => {
      if (hazirdaAyni(bilgi?.version)) return;
      this.degistir({ asama: "iniyor", surum: bilgi?.version ?? null, yuzde: 0, hata: null });
    });
    g.on("update-not-available", () => {
      if (this.son.asama !== "hazir") this.degistir({ asama: "yok", yuzde: null, hata: null });
    });
    g.on("download-progress", (ilerleme: { percent?: number }) => {
      if (this.son.asama === "hazir") return;
      const yuzde = typeof ilerleme?.percent === "number" ? Math.max(0, Math.min(100, Math.round(ilerleme.percent))) : null;
      this.degistir({ asama: "iniyor", yuzde });
    });
    g.on("update-downloaded", (bilgi: { version?: string }) => {
      this.kayit.kabuk(`güncelleme indirildi: ${bilgi?.version ?? "?"} (yeniden başlatınca kurulur)`);
      this.degistir({ asama: "hazir", surum: bilgi?.version ?? this.son.surum, yuzde: 100, hata: null });
    });
    g.on("error", (hata: unknown) => {
      if (this.son.asama !== "hazir") this.degistir({ asama: "hata", yuzde: null, hata: hataMetni(hata) });
    });
    this.guncelleyici = g;
    this.zamanlayici = setInterval(() => void this.denetle(), DENETIM_ARALIGI_MS);
    this.zamanlayici.unref();
    await this.denetle();
  }

  private async denetle(): Promise<void> {
    try {
      await this.guncelleyici?.checkForUpdates();
    } catch (hata) {
      this.kayit.kabuk(`güncelleme denetlenemedi: ${hataMetni(hata)}`);
    }
  }

  /** İndirilen güncellemeyi kurar ve uygulamayı yeniden başlatır (quitAndInstall); indirilmiş sürüm yoksa false */
  kur(): boolean {
    if (this.son.asama !== "hazir") return false;
    if (this.sahte) {
      this.kayit.kabuk(`sahte güncelleme ${this.son.surum}: kurulmadan yeniden başlatılıyor`);
      app.relaunch();
      app.quit();
      return true;
    }
    if (!this.guncelleyici) return false;
    this.kayit.kabuk(`güncelleme kuruluyor: ${this.son.surum}; uygulama yeniden başlayacak`);
    this.guncelleyici.quitAndInstall();
    return true;
  }

  durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
  }

  /** Geliştirme: denetim ve indirme taklit edilir, birkaç saniyede "hazir" olur */
  private sahteIndir(surum: string): void {
    this.sahte = true;
    this.kayit.kabuk(`ARNORG_SAHTE_GUNCELLEME=${surum}: güncelleme indirmesi taklit ediliyor`);
    const adimlar: Partial<GuncellemeDurumu>[] = [
      { asama: "denetleniyor" },
      { asama: "iniyor", surum, yuzde: 0 },
      { yuzde: 40 },
      { yuzde: 85 },
      { asama: "hazir", yuzde: 100 },
    ];
    adimlar.forEach((adim, i) => setTimeout(() => this.degistir(adim), 300 + i * 250).unref());
  }
}
