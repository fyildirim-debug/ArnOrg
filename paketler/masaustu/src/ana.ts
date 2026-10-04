// ArnOrg masaüstü uygulaması: Electron ana süreci.
//
// 1. Tek örnek kilidi alınır, açılış penceresi gösterilir.
// 2. Çekirdek (arnorg-server) utilityProcess içinde port 0 ile başlatılır.
// 3. Çekirdek hazır olunca ana pencere ${adres}/#anahtar=${erisimAnahtari} adresini açar.
// 4. Çekirdek durursa kayıt kuyruğuyla hata sayfası ve "Yeniden başlat" düğmesi gösterilir.
// 5. Kapanışta çekirdekten kapanması istenir; 5 sn içinde çıkmazsa sonlandırılır.
//
// Deneme ve tanı için ortam değişkenleri:
//   ARNORG_SAHTE_CEKIRDEK=1             gelistirme/sahte-cekirdek.mjs kullanılır (yalnız geliştirme)
//   ARNORG_KULLANICI_DIZINI=<dizin>     userData dizinini değiştirir (taşınabilir kullanım, denemeler)
//   ARNORG_DENEME_EKRAN_GORUNTUSU=<png> ana pencere (ya da hata sayfası) yüklenince ekran görüntüsü
//                                       alınır ve uygulama kapanır; çekirdek durduysa çıkış kodu 1 olur

import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, shell } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CekirdekSureci, type CekirdekBaglantisi } from "./cekirdek-sureci.js";
import { ayniKokMu } from "./denetimler.js";
import { guncellemeyiDenetle } from "./guncelleme.js";
import { disaridaAc, guvenligiKur, oturumAyarlariniKur } from "./guvenlik.js";
import { Kayit } from "./kayit.js";
import { DISARIDA_AC_KANALI, DURUM_EYLEMLERI, DURUM_KANALLARI, KLASOR_SEC_KANALI, type DurumBilgisi, type DurumEylemi } from "./kopru.js";
import { menuyuKur } from "./menu.js";
import { pencereDurumunuOku, pencereDurumunuYaz } from "./pencere-durumu.js";
import { yollariBul } from "./yollar.js";

declare const __ARNORG_SURUMU__: string;

const SURUM = __ARNORG_SURUMU__;
const MUREKKEP = "#0a0a0b";

// ---------------------------------------------------------------------------
// Erken ayarlar (app hazır olmadan önce)
// ---------------------------------------------------------------------------

app.setName("ArnOrg");
// Geliştirme sürümü kullanıcı verisini paketlenmiş uygulamanınkinden ayrı tutar.
app.setPath(
  "userData",
  process.env.ARNORG_KULLANICI_DIZINI || join(app.getPath("appData"), app.isPackaged ? "ArnOrg" : "ArnOrg-gelistirme"),
);
if (process.platform === "win32") app.setAppUserModelId("com.arnexlab.arnorg");
// Tüm görüntü süreçleri sandbox'lı çalışır. --no-sandbox yalnız root olarak çalışılan konteyner/CI
// denemeleri içindir; o durumda Chromium sandbox'ı kuramayacağından zorlanmaz.
if (!app.commandLine.hasSwitch("no-sandbox")) app.enableSandbox();
// Deneme kipinde (ekransız CI) GPU yok; yazılım çizimi ekran görüntüsünü güvenilir kılar (UnknownVizError)
if (process.env.ARNORG_DENEME_EKRAN_GORUNTUSU) app.disableHardwareAcceleration();
oturumAyarlariniKur();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  basla();
}

function basla(): void {
  const yollar = yollariBul();
  mkdirSync(yollar.veri, { recursive: true });
  const kayit = new Kayit(yollar.kayitlar, !app.isPackaged);
  const pencereDurumuDosyasi = join(yollar.kullaniciVerisi, "pencere-durumu.json");
  const denemeGoruntusu = process.env.ARNORG_DENEME_EKRAN_GORUNTUSU || null;
  const simge = existsSync(yollar.simge) ? nativeImage.createFromPath(yollar.simge) : undefined;

  kayit.kabuk(
    `ArnOrg ${SURUM} açılıyor (Electron ${process.versions.electron}, Node ${process.versions.node}, ` +
      `${process.platform}-${process.arch}, ${app.isPackaged ? "paketli" : "geliştirme"})`,
  );
  if (yollar.sahteCekirdek) kayit.kabuk("ARNORG_SAHTE_CEKIRDEK=1: sahte çekirdek kullanılıyor");

  let durumPenceresi: BrowserWindow | null = null;
  let anaPencere: BrowserWindow | null = null;
  let cekirdekKoku: string | null = null;
  let cikiliyor = false;
  let cikisKodu = 0;
  let guncellemeDenetlendi = false;

  const baslatiliyor = (): DurumBilgisi => ({
    asama: "baslatiliyor",
    baslik: "Çekirdek başlatılıyor",
    aciklama: "Ajan çalışma alanları, veritabanı ve sunucu hazırlanıyor.",
    kayitKuyrugu: "",
    kayitDosyasi: kayit.dosya,
    surum: SURUM,
  });
  let durum = baslatiliyor();

  let studyoDizini: string | undefined = yollar.studyo;
  if (!existsSync(yollar.studyo)) {
    kayit.kabuk(`Stüdyo derlemesi bulunamadı: ${yollar.studyo} (çekirdek arayüzsüz başlatılıyor)`);
    studyoDizini = undefined;
  }

  const cekirdek = new CekirdekSureci({
    girisYolu: yollar.cekirdekGiris,
    cekirdekYolu: yollar.cekirdek,
    secenekler: { port: 0, host: "127.0.0.1", veriDizini: yollar.veri, studyoDizini },
    kayit,
    hazir: (b) => anaPencereyiAc(b),
    durdu: (aciklama) => hatayiGoster(aciklama),
  });

  // -------------------------------------------------------------------------
  // Açılış / hata penceresi
  // -------------------------------------------------------------------------

  function durumuGonder(): void {
    if (!durumPenceresi || durumPenceresi.isDestroyed()) return;
    const hata = durum.asama === "hata";
    durumPenceresi.setResizable(hata);
    if (hata) {
      durumPenceresi.setMinimumSize(640, 440);
      durumPenceresi.setSize(880, 620);
    } else {
      durumPenceresi.setMinimumSize(560, 340);
      durumPenceresi.setSize(560, 340);
    }
    durumPenceresi.center();
    durumPenceresi.webContents.send(DURUM_KANALLARI.guncelle, durum);
  }

  function durumPenceresiniGoster(): void {
    if (durumPenceresi && !durumPenceresi.isDestroyed()) {
      durumuGonder();
      durumPenceresi.show();
      durumPenceresi.focus();
      return;
    }
    const pencere = new BrowserWindow({
      width: 560,
      height: 340,
      frame: false,
      resizable: false,
      show: false,
      title: "ArnOrg",
      backgroundColor: MUREKKEP,
      icon: simge,
      webPreferences: {
        preload: yollar.durumOnyukleme,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
      },
    });
    durumPenceresi = pencere;
    pencere.on("closed", () => {
      if (durumPenceresi === pencere) durumPenceresi = null;
    });
    pencere.once("ready-to-show", () => {
      durumuGonder();
      pencere.show();
    });
    void pencere.loadFile(yollar.durumSayfasi);
  }

  function durumPenceresiniKapat(): void {
    if (durumPenceresi && !durumPenceresi.isDestroyed()) durumPenceresi.close();
    durumPenceresi = null;
  }

  function hatayiGoster(aciklama: string): void {
    if (cikiliyor) return;
    kayit.kabuk(`Hata sayfası gösteriliyor: ${aciklama.split("\n")[0]}`);
    durum = {
      ...baslatiliyor(),
      asama: "hata",
      baslik: "Çekirdek durdu",
      aciklama,
      kayitKuyrugu: kayit.kuyruk(),
    };
    // Önce hata penceresi açılır, sonra ana pencere kapanır (aksi halde tüm pencereler kapanıp uygulama çıkar).
    durumPenceresiniGoster();
    if (anaPencere && !anaPencere.isDestroyed()) {
      pencereDurumunuYaz(pencereDurumuDosyasi, anaPencere);
      anaPencere.destroy();
    }
    anaPencere = null;
    cekirdekKoku = null;
    denemeyiTetikle();
  }

  async function yenidenBaslat(): Promise<void> {
    if (durum.asama !== "hata") return; // çift tıklama
    kayit.kabuk("Kullanıcı çekirdeği yeniden başlatıyor");
    durum = baslatiliyor();
    durumuGonder();
    await cekirdek.yenidenBaslat();
  }

  // -------------------------------------------------------------------------
  // Ana pencere
  // -------------------------------------------------------------------------

  function anaPencereyiAc(b: CekirdekBaglantisi): void {
    if (cikiliyor) return;
    const adres = new URL("/", b.adres);
    cekirdekKoku = adres.origin;
    adres.hash = `anahtar=${encodeURIComponent(b.erisimAnahtari)}`;

    const pd = pencereDurumunuOku(pencereDurumuDosyasi);
    const pencere = new BrowserWindow({
      x: pd.x,
      y: pd.y,
      width: pd.width,
      height: pd.height,
      minWidth: 960,
      minHeight: 600,
      show: false,
      title: "ArnOrg",
      backgroundColor: MUREKKEP,
      autoHideMenuBar: true,
      icon: simge,
      webPreferences: {
        preload: yollar.onyukleme,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
      },
    });
    anaPencere = pencere;

    pencere.once("ready-to-show", () => {
      if (pd.buyutulmus) pencere.maximize();
      pencere.show();
      durumPenceresiniKapat();
    });
    pencere.on("close", () => pencereDurumunuYaz(pencereDurumuDosyasi, pencere));
    pencere.on("closed", () => {
      if (anaPencere === pencere) anaPencere = null;
    });

    const icerik = pencere.webContents;
    icerik.on("did-fail-load", (_o, kod, aciklama, url, anaCerceve) => {
      if (anaCerceve) kayit.kabuk(`Arayüz yüklenemedi (${kod} ${aciklama}): ${url.split("#")[0]}`);
    });
    icerik.on("did-finish-load", () => {
      kayit.kabuk(`Arayüz yüklendi: ${icerik.getURL().split("#")[0]}`);
      denemeyiTetikle();
    });
    let sonCokme = 0;
    icerik.on("render-process-gone", (_o, ayrinti) => {
      kayit.kabuk(`Arayüz süreci durdu: ${ayrinti.reason} (çıkış kodu ${ayrinti.exitCode})`);
      // Art arda çökmede yeniden yükleme döngüsüne girme
      if (ayrinti.reason !== "clean-exit" && Date.now() - sonCokme > 10_000) {
        sonCokme = Date.now();
        icerik.reload();
      }
    });

    void pencere.loadURL(adres.toString());
    if (!guncellemeDenetlendi) {
      guncellemeDenetlendi = true;
      void guncellemeyiDenetle(kayit);
    }
  }

  // -------------------------------------------------------------------------
  // Deneme: ekran görüntüsü alıp çık
  // -------------------------------------------------------------------------

  let denemeBasladi = false;
  /** Ana pencere yüklenince ya da hata gösterilince 2 sn bekler, öndeki pencerenin görüntüsünü yazar ve çıkar. */
  function denemeyiTetikle(): void {
    if (!denemeGoruntusu || denemeBasladi) return;
    denemeBasladi = true;
    setTimeout(async () => {
      const pencere = anaPencere && !anaPencere.isDestroyed() ? anaPencere : durumPenceresi;
      let yazildi = false;
      for (let deneme = 1; pencere && !pencere.isDestroyed() && !yazildi && deneme <= 3; deneme++) {
        try {
          const goruntu = await pencere.webContents.capturePage();
          writeFileSync(denemeGoruntusu, goruntu.toPNG());
          yazildi = true;
          kayit.kabuk(`Deneme: ekran görüntüsü yazıldı ${denemeGoruntusu} (${pencere.webContents.getURL().split("#")[0]})`);
        } catch (hata) {
          kayit.kabuk(`Deneme: ekran görüntüsü alınamadı (${deneme}/3): ${hata instanceof Error ? hata.message : String(hata)}`);
          await new Promise((coz) => setTimeout(coz, 1000));
        }
      }
      // Asılı kalmak yerine her durumda kapanır; görüntü yoksa ya da çekirdek durduysa çıkış kodu 1
      cikisKodu = durum.asama === "hata" || !yazildi ? 1 : 0;
      app.quit();
    }, 2000);
  }

  // -------------------------------------------------------------------------
  // IPC
  // -------------------------------------------------------------------------

  ipcMain.handle(DURUM_KANALLARI.al, (olay) => {
    if (olay.sender !== durumPenceresi?.webContents) throw new Error("izin yok");
    return durum;
  });
  ipcMain.on(DURUM_KANALLARI.eylem, (olay, eylem: DurumEylemi) => {
    if (olay.sender !== durumPenceresi?.webContents || !DURUM_EYLEMLERI.includes(eylem)) return;
    if (eylem === "yeniden-baslat") void yenidenBaslat();
    else if (eylem === "kayitlari-ac") shell.showItemInFolder(kayit.dosya);
    else app.quit();
  });
  ipcMain.handle(KLASOR_SEC_KANALI, async (olay, secenek: unknown) => {
    // Sistemin klasör seçicisi; yalnız çekirdek kökünden yüklenmiş ana pencere isteyebilir
    const cerceve = olay.senderFrame?.url ?? "";
    if (olay.sender !== anaPencere?.webContents || !cekirdekKoku || !ayniKokMu(cerceve, cekirdekKoku) || !anaPencere) return null;
    const s = (secenek && typeof secenek === "object" ? secenek : {}) as { baslik?: unknown; varsayilan?: unknown };
    const sonuc = await dialog.showOpenDialog(anaPencere, {
      title: typeof s.baslik === "string" ? s.baslik.slice(0, 120) : "Klasör seç",
      defaultPath: typeof s.varsayilan === "string" && s.varsayilan ? s.varsayilan : app.getPath("home"),
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    return sonuc.canceled ? null : (sonuc.filePaths[0] ?? null);
  });
  ipcMain.handle(DISARIDA_AC_KANALI, (olay, url: unknown) => {
    // Yalnız çekirdek kökünden yüklenmiş ana pencere isteyebilir
    const cerceve = olay.senderFrame?.url ?? "";
    if (olay.sender !== anaPencere?.webContents || !cekirdekKoku || !ayniKokMu(cerceve, cekirdekKoku)) return false;
    return typeof url === "string" && disaridaAc(url);
  });

  // -------------------------------------------------------------------------
  // Uygulama yaşam döngüsü
  // -------------------------------------------------------------------------

  app.on("second-instance", () => {
    const p = anaPencere ?? durumPenceresi;
    if (!p || p.isDestroyed()) return;
    if (p.isMinimized()) p.restore();
    p.show();
    p.focus();
  });

  app.on("window-all-closed", () => app.quit());

  let kapanisBasladi = false;
  let kapanisBitti = false;
  app.on("before-quit", (olay) => {
    cikiliyor = true;
    if (kapanisBitti) return;
    olay.preventDefault();
    if (kapanisBasladi) return;
    kapanisBasladi = true;
    void (async () => {
      if (anaPencere && !anaPencere.isDestroyed()) pencereDurumunuYaz(pencereDurumuDosyasi, anaPencere);
      await cekirdek.durdur();
      kayit.kabuk("ArnOrg kapandı");
      await kayit.kapat();
      kapanisBitti = true;
      app.exit(cikisKodu);
    })();
  });
  for (const sinyal of ["SIGINT", "SIGTERM"] as const) process.on(sinyal, () => app.quit());

  void app.whenReady().then(() => {
    nativeTheme.themeSource = "dark";
    guvenligiKur(() => cekirdekKoku);
    menuyuKur({
      veriKlasorunuAc: () => void shell.openPath(yollar.veri),
      kayitKlasorunuAc: () => shell.showItemInFolder(kayit.dosya),
      hakkinda: () =>
        void dialog
          .showMessageBox({
            type: "info",
            title: "ArnOrg hakkında",
            message: `ArnOrg ${SURUM}`,
            detail:
              "Claude Code ajanlarından kurulan yazılım şirketi.\n\n" +
              `Electron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode.js ${process.versions.node}\n` +
              `${process.platform}-${process.arch}\n\nFurkan YILDIRIM · furkanyildirim.com\n© 2026`,
            buttons: ["Tamam", "furkanyildirim.com"],
            defaultId: 0,
            cancelId: 0,
            icon: simge,
          })
          .then((r) => {
            if (r.response === 1) void shell.openExternal("https://furkanyildirim.com");
          }),
    });
    durumPenceresiniGoster();
    cekirdek.baslat();
  });
}
