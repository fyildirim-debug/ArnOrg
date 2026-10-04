// Uygulama içi tarayıcı: ana pencereye eklenen, ana süreçte yönetilen bir WebContentsView.
//
// Neden <webview> değil: görünümün bütün ayarlarını (ön yükleme, oturum, sandbox) yalnız ana süreç belirler; ana
// pencerede webviewTag kapalı kalır ve <webview> her içerikte engellenmeye devam eder. Bedeli: görünüm Stüdyo'nun
// üstünde ayrı bir katmandır; yeri Stüdyo'dan gelir (yerlestir) ve Stüdyo'nun açılır katmanı görünümü örtecekse
// Stüdyo görünümü gizleyip yerine son karesini (kare) koyar.
//
// Güvenlik (oturum ve gezinme kuralları tarayici-guvenlik.ts'te, her içerikte web-contents-created anında):
// - Ayrı oturum bölümü (persist:arnorg-tarayici); sandbox ve contextIsolation açık, Node yok; yalnız
//   tarayici-onyukleme.cjs yüklenir ve sayfanın kendi dünyasına hiçbir şey açmaz.
// - Stüdyo'nun komutları yalnız çekirdek kökünden yüklenmiş ana pencereden kabul edilir ve doğrulanır;
//   sayfadan gelen seçim yalnız görünümün ana çerçevesinden kabul edilir ve sınırlanır.

import { BrowserWindow, ipcMain, WebContentsView, type IpcMainEvent, type IpcMainInvokeEvent, type NativeImage, type WebContents } from "electron";
import type { Kayit } from "./kayit.js";
import { TARAYICI_KANALLARI as K, type SayfaKomutu, type SayfaSecimi, type TarayiciDurumu, type TarayiciKomutu, type TarayiciOlayi, type TarayiciSiniri } from "./kopru.js";
import {
  gorunumDikdortgeni,
  kirpmaAlani,
  kisayolKarari,
  secimAyristir,
  TARAYICI_BOLUMU,
  tarayiciAdresiMi,
  tarayiciKomutunuAyristir,
} from "./tarayici-denetimleri.js";

/** Öğe görüntüsünde kutunun çevresine bırakılan pay (CSS piksel) */
const GORUNTU_PAYI = 16;
/** Öğe görüntüsünün en uzun kenarı ve en büyük PNG boyutu (çekirdeğin sınırı 4 MB) */
const GORUNTU_KENARI = 1600;
const GORUNTU_SINIRI = 3 * 1024 * 1024;

export interface TarayiciAyarlari {
  /** dist/tarayici-onyukleme.cjs */
  onyukleme: string;
  kayit: Kayit;
  /** IPC isteği çekirdek kökünden yüklenmiş ana pencereden mi */
  anaPenceredenMi(olay: IpcMainEvent | IpcMainInvokeEvent): boolean;
}

export class Tarayici {
  private pencere: BrowserWindow | null = null;
  private gorunum: WebContentsView | null = null;
  /** Stüdyo'nun verdiği son yer (CSS piksel); null: gizli */
  private sinir: TarayiciSiniri | null = null;
  private secici = false;
  private hata: string | null = null;

  constructor(private readonly ayar: TarayiciAyarlari) {}

  /** IPC kanallarını kurar (bir kez) */
  kur(): void {
    ipcMain.handle(K.komut, async (olay, veri: unknown) => {
      if (!this.ayar.anaPenceredenMi(olay)) return null;
      const komut = tarayiciKomutunuAyristir(veri);
      if (!komut) return null;
      try {
        return await this.komut(komut);
      } catch (hata) {
        this.ayar.kayit.kabuk(`Tarayıcı komutu başarısız (${komut.tur}): ${hata instanceof Error ? hata.message : String(hata)}`);
        return null;
      }
    });
    ipcMain.on(K.sayfaSecim, (olay, veri: unknown) => {
      if (this.sayfadanMi(olay)) void this.secimGeldi(veri);
    });
    ipcMain.on(K.sayfaCikis, (olay) => {
      if (!this.sayfadanMi(olay)) return;
      this.secici = false;
      this.durumGonder();
    });
  }

  /** Ana pencere açılınca bağlanır; önceki pencerenin görünümü kapanır */
  pencereyeBagla(p: BrowserWindow): void {
    this.kapat();
    this.pencere = p;
    p.on("closed", () => {
      if (this.pencere !== p) return;
      this.kapat();
      this.pencere = null;
    });
    // Stüdyo yeniden yüklenirse ya da çökerse görünüm gizlenir; Tarayıcı ekranı açılınca yeniden yerleştirir
    p.webContents.on("did-start-navigation", (olay) => {
      if (olay.isMainFrame && !olay.isSameDocument) this.yerlestir(null);
    });
    p.webContents.on("render-process-gone", () => this.yerlestir(null));
  }

  /** Görünümü kapatır (sayfa ve geçmişi gider; oturumun çerezleri diskte kalır) */
  kapat(): void {
    const g = this.gorunum;
    this.gorunum = null;
    this.secici = false;
    this.hata = null;
    if (!g) return;
    try {
      if (this.pencere && !this.pencere.isDestroyed()) this.pencere.contentView.removeChildView(g);
    } catch {
      // pencere kapanıyor
    }
    if (!g.webContents.isDestroyed()) g.webContents.close();
  }

  private get icerik(): WebContents | null {
    const g = this.gorunum;
    return g && !g.webContents.isDestroyed() ? g.webContents : null;
  }

  /** IPC sayfadan mı: görünümün ana çerçevesindeki ön yükleme betiği */
  private sayfadanMi(olay: IpcMainEvent): boolean {
    const icerik = this.icerik;
    return !!icerik && olay.sender === icerik && !!olay.senderFrame && olay.senderFrame.parent === null;
  }

  private gorunumAl(): WebContentsView {
    const mevcut = this.gorunum;
    if (mevcut && !mevcut.webContents.isDestroyed()) return mevcut;
    const p = this.pencere;
    if (!p || p.isDestroyed()) throw new Error("ana pencere yok");
    const g = new WebContentsView({
      webPreferences: {
        preload: this.ayar.onyukleme,
        partition: TARAYICI_BOLUMU,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        experimentalFeatures: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
        spellcheck: false,
        autoplayPolicy: "document-user-activation-required",
      },
    });
    g.setBackgroundColor("#ffffff");
    g.setVisible(false);
    p.contentView.addChildView(g);
    this.gorunum = g;
    this.olaylariKur(g.webContents);
    this.ayar.kayit.kabuk("Uygulama içi tarayıcı açıldı");
    if (this.sinir) this.yerlestir(this.sinir);
    return g;
  }

  /** Durum olayları, kısayollar ve çökme */
  private olaylariKur(icerik: WebContents): void {
    const durum = () => this.durumGonder();
    icerik.on("did-start-loading", () => {
      this.hata = null;
      durum();
    });
    icerik.on("did-stop-loading", durum);
    icerik.on("page-title-updated", durum);
    icerik.on("did-navigate", () => {
      // Yeni belge: sayfadaki seçici yeniden kuruldu, kapalı başlar
      this.secici = false;
      durum();
    });
    icerik.on("did-navigate-in-page", (_olay, _adres, anaCerceve) => {
      if (anaCerceve) durum();
    });
    icerik.on("did-fail-load", (_olay, kod, aciklama, adres, anaCerceve) => {
      // -3: iptal (durdur ya da başka adrese geçiş)
      if (!anaCerceve || kod === -3) return;
      this.hata = `${aciklama || "ERR"} (${kod}) · ${adres}`;
      durum();
    });
    icerik.on("render-process-gone", (_olay, ayrinti) => {
      this.secici = false;
      this.hata = `render-process-gone: ${ayrinti.reason}`;
      this.ayar.kayit.kabuk(`Tarayıcının sayfa süreci durdu: ${ayrinti.reason}`);
      durum();
    });
    icerik.on("before-input-event", (olay, girdi) => {
      const kisayol = kisayolKarari(girdi, process.platform);
      if (!kisayol) return;
      olay.preventDefault();
      // Adres çubuğuna geçerken odak Stüdyo'ya döner
      if (kisayol === "adres" && this.pencere && !this.pencere.isDestroyed()) this.pencere.webContents.focus();
      this.gonder({ tur: "kisayol", kisayol });
    });
    icerik.on("destroyed", () => {
      if (this.gorunum?.webContents !== icerik) return;
      this.gorunum = null;
      this.secici = false;
      durum();
    });
  }

  private async komut(k: TarayiciKomutu): Promise<unknown> {
    const icerik = this.icerik;
    switch (k.tur) {
      case "git": {
        const adres = k.adres.trim();
        if (!tarayiciAdresiMi(adres)) return false;
        const g = this.gorunumAl();
        this.hata = null;
        // Yükleme hatası did-fail-load ile gelir
        g.webContents.loadURL(adres).catch(() => undefined);
        return true;
      }
      case "geri":
        if (icerik?.navigationHistory.canGoBack()) icerik.navigationHistory.goBack();
        return true;
      case "ileri":
        if (icerik?.navigationHistory.canGoForward()) icerik.navigationHistory.goForward();
        return true;
      case "yenile":
        this.hata = null;
        icerik?.reload();
        return true;
      case "durdur":
        icerik?.stop();
        return true;
      case "yerlestir":
        this.yerlestir(k.sinir);
        return true;
      case "secici": {
        if (!icerik) return false;
        this.secici = k.acik;
        this.sayfayaGonder(k.acik ? { tur: "ac", ipucu: k.ipucu } : { tur: "kapat" });
        // Esc ve tıklama sayfaya gitsin
        if (k.acik) icerik.focus();
        this.durumGonder();
        return true;
      }
      case "secimiBirak":
        this.sayfayaGonder({ tur: "birak" });
        return true;
      case "kare":
        return this.kare();
      case "durum":
        return this.durumAl();
    }
  }

  /** Görünümü Stüdyo'nun verdiği yere koyar (CSS piksel → Stüdyo'nun yakınlaştırmasıyla DIP); null gizler */
  private yerlestir(sinir: TarayiciSiniri | null): void {
    this.sinir = sinir;
    const g = this.gorunum;
    const p = this.pencere;
    if (!g || g.webContents.isDestroyed() || !p || p.isDestroyed()) return;
    if (!sinir || sinir.genislik < 1 || sinir.yukseklik < 1) {
      g.setVisible(false);
      // Gizliyken (başka ekranda) sayfanın sesi duyulmaz
      g.webContents.setAudioMuted(true);
      return;
    }
    g.setBounds(gorunumDikdortgeni(sinir, p.webContents.getZoomFactor()));
    g.setVisible(true);
    g.webContents.setAudioMuted(false);
  }

  /** Görünümün o anki karesi (JPEG data adresi) */
  private async kare(): Promise<string | null> {
    const g = this.gorunum;
    if (!g || g.webContents.isDestroyed() || !g.getVisible()) return null;
    const goruntu = await g.webContents.capturePage();
    if (goruntu.isEmpty()) return null;
    return `data:image/jpeg;base64,${goruntu.toJPEG(84).toString("base64")}`;
  }

  /** Sayfadan seçim: doğrulanır, öğenin ekran görüntüsü eklenir, Stüdyo'ya gider */
  private async secimGeldi(veri: unknown): Promise<void> {
    const secim = secimAyristir(veri);
    const icerik = this.icerik;
    if (!secim || !icerik) return;
    this.secici = false;
    this.durumGonder();
    let gorsel: string | null = null;
    try {
      gorsel = await this.ogeGoruntusu(icerik, secim);
    } catch (hata) {
      this.ayar.kayit.kabuk(`Tarayıcı: öğe görüntüsü alınamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
    }
    this.gonder({ tur: "secim", secim: { ...secim, gorsel } });
  }

  /** Öğenin kutusu ve çevresi (PNG data adresi); çok büyükse küçültülür */
  private async ogeGoruntusu(icerik: WebContents, secim: SayfaSecimi): Promise<string | null> {
    const alan = kirpmaAlani(secim.kutu, secim.gorunum, GORUNTU_PAYI, icerik.getZoomFactor());
    if (!alan) return null;
    let goruntu: NativeImage = await icerik.capturePage(alan);
    if (goruntu.isEmpty()) return null;
    const boyut = goruntu.getSize();
    const kenar = Math.max(boyut.width, boyut.height);
    if (kenar > GORUNTU_KENARI) {
      const oran = GORUNTU_KENARI / kenar;
      goruntu = goruntu.resize({ width: Math.max(1, Math.round(boyut.width * oran)), height: Math.max(1, Math.round(boyut.height * oran)), quality: "good" });
    }
    let png = goruntu.toPNG();
    for (let i = 0; png.length > GORUNTU_SINIRI && i < 4; i++) {
      const b = goruntu.getSize();
      goruntu = goruntu.resize({ width: Math.max(1, Math.round(b.width * 0.7)), height: Math.max(1, Math.round(b.height * 0.7)), quality: "good" });
      png = goruntu.toPNG();
    }
    return png.length > GORUNTU_SINIRI ? null : `data:image/png;base64,${png.toString("base64")}`;
  }

  private durumAl(): TarayiciDurumu {
    const icerik = this.icerik;
    if (!icerik) return { adres: "", baslik: "", yukleniyor: false, geriGidebilir: false, ileriGidebilir: false, secici: false, hata: this.hata };
    const adres = icerik.getURL();
    return {
      adres: adres === "about:blank" ? "" : adres,
      baslik: icerik.getTitle(),
      yukleniyor: icerik.isLoading(),
      geriGidebilir: icerik.navigationHistory.canGoBack(),
      ileriGidebilir: icerik.navigationHistory.canGoForward(),
      secici: this.secici,
      hata: this.hata,
    };
  }

  private durumGonder(): void {
    this.gonder({ tur: "durum", durum: this.durumAl() });
  }

  private gonder(olay: TarayiciOlayi): void {
    const p = this.pencere;
    if (p && !p.isDestroyed() && !p.webContents.isDestroyed()) p.webContents.send(K.olay, olay);
  }

  private sayfayaGonder(komut: SayfaKomutu): void {
    this.icerik?.send(K.sayfaKomut, komut);
  }
}
