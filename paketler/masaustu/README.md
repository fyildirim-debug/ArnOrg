# ArnOrg masaüstü uygulaması

Electron kabuğu: çekirdeği (arnorg-server) arka planda başlatır, Stüdyo arayüzünü bir pencerede açar, Windows ve Linux için kurulum paketlerini üretir.

## Nasıl çalışır

```
Electron ana süreci (dist/ana.js)
├─ açılış/hata penceresi (dist/durum.html)        çekirdek başlarken ya da durunca
├─ çekirdek süreci: utilityProcess(dist/cekirdek-giris.js)
│    └─ import(cekirdek) → baslat({ port: 0, host: "127.0.0.1", veriDizini, studyoDizini })
│         → { adres, erisimAnahtari } ana sürece iletilir
└─ ana pencere → ${adres}/#anahtar=${erisimAnahtari}
```

- **Tek örnek:** ikinci kez açılınca var olan pencere öne gelir.
- **Çekirdek süreci:** Electron'un `utilityProcess`'i (Node ortamı, Electron ile aynı ikili). Çıktısı `logs/cekirdek.log` dosyasına yazılır. 60 sn içinde hazır olmazsa ya da beklenmedik biçimde durursa kaydın son satırları ve **Yeniden başlat** düğmesiyle hata sayfası açılır.
- **Kapanış:** çekirdeğe `kapat` mesajı gider (`sunucu.kapat()`), 5 sn içinde çıkmazsa süreç sonlandırılır.
- **Güvenlik:** `contextIsolation`, `sandbox`, `webSecurity` açık, `nodeIntegration` kapalı. Pencere yalnız çekirdeğin kökünde gezinebilir; başka http(s) adresleri sistem tarayıcısında açılır, diğer her şey engellenir. Yeni pencere, `<webview>` ve izinler (pano, bildirim, tam ekran dışında) kapalı; yazım denetimi sözlük indirmesin diye kapalı.
- **Köprü:** Stüdyo'ya yalnız `window.arnorg = { platform, surum, disaridaAc(url), klasorSec(), dikkatCek(), oneGetir(), guncelleme: { durum(), dinle(f), kur() }, tarayici: { git, geri, ileri, yenile, durdur, yerlestir, secici, secimiBirak, kare, durum, dinle } }` açılır (`src/onyukleme.ts`). `disaridaAc` yalnız http/https adreslerini sistem tarayıcısında açar; `klasorSec` sistemin klasör seçicisini açar (proje açarken yol yazılmaz); `dikkatCek` pencere arkadayken görev çubuğunda yanıp söner (önemli an bildirimi), `oneGetir` pencereyi öne alır (masaüstü bildirimine tıklanınca); `guncelleme` otomatik güncellemenin durumunu verir, değişince haber verir ve indirilen sürümü kurup uygulamayı yeniden başlatır. `tarayici` uygulama içi tarayıcıyı yönetir (aşağıda). Hepsi yalnız çekirdek kökünden yüklenmiş ana pencereden çağrılabilir.
- **Uygulama içi tarayıcı** (`src/tarayici.ts`, `src/tarayici-guvenlik.ts`, kararlar `src/tarayici-denetimleri.ts`): Stüdyo'nun Tarayıcı ekranındaki sayfa, ana pencereye eklenen ve ana süreçte yönetilen bir `WebContentsView`'dır; `<webview>` kullanılmaz (ana pencerede `webviewTag` kapalı kalır, `will-attach-webview` her içerikte reddedilir). Yerini Stüdyo verir (`yerlestir`); Stüdyo'nun bir katmanı (pencere, menü, çekmece) görünümün üstüne gelecekse görünüm gizlenir, yerine son karesi (`kare`) konur. Güvenlik modeli:
  - Ayrı ve kalıcı oturum bölümü `persist:arnorg-tarayici`: çerezler ve depolama ana uygulamanınkinden ayrıdır. Kullanıcı aracısında Electron ve uygulama adı görünmez.
  - `sandbox`, `contextIsolation` açık, `nodeIntegration` (alt çerçeveler ve işçiler dahil) kapalı, `webviewTag` kapalı. Yalnız `dist/tarayici-onyukleme.cjs` yüklenir; sayfanın dünyasına hiçbir şey açmaz (`contextBridge` yok), yalnız öğe seçiciyi kurar ve seçimi ana sürece iletir.
  - Ana çerçeve yalnız `http`, `https` ve `about:blank`'e gider; iframe'ler `file:`, `chrome:`, `devtools:` gibi yerel ve iç protokollere gidemez. `window.open` ve `target=_blank` http(s) ise aynı görünümde açılır, değilse reddedilir; yeni pencere açılmaz.
  - İzin istekleri ve denetimleri (kamera, mikrofon, konum, bildirim, pano, tam ekran, MIDI, USB/HID/seri aygıt, ekran paylaşımı, yerel ağ) reddedilir. İndirme kaydetme penceresiyle kullanıcıya sorulur; vazgeçilirse iptal edilir.
  - Stüdyo'dan gelen komutlar doğrulanır ve yalnız ana pencereden kabul edilir; sayfadan gelen seçim yalnız görünümün ana çerçevesinden kabul edilir, metinleri sınırlanır. Öğe görüntüsü öğenin kutusu ve 16 px payla `capturePage` ile alınır (en uzun kenar 1600 px, en çok 3 MB PNG).
  - Kısayollar sayfa odaktayken de çalışır (`before-input-event`): Ctrl/Cmd+L adres çubuğu, Ctrl/Cmd+Shift+C öğe seç; Esc seçiciden çıkar.
- **Güncelleme:** paketlenmiş uygulama açılışta ve açık kaldıkça 6 saatte bir GitHub sürümlerini denetler, yeni sürümü arka planda indirir (`src/guncelleme.ts`). Sistem bildirimi gönderilmez; Stüdyo indirilen sürüm için üst çubuğun altında "yeniden başlatınca kurulur" şeridi gösterir. **Yeniden başlat** hemen kurar (`quitAndInstall`); kurulmazsa güncelleme uygulama kapanırken kurulur.
- **Pencere:** konum ve boyut `pencere-durumu.json` dosyasında hatırlanır; menü Türkçedir (Dosya, Düzen, Görünüm, Pencere, Yardım), Windows ve Linux'ta Alt ile görünür.

### Çekirdek sözleşmesi

`paketler/cekirdek` derlemesi (`dist/index.js`, ESM) şunu dışa aktarmalıdır:

```ts
export async function baslat(s: {
  port?: number; host?: string; veriDizini: string; studyoDizini?: string;
  erisimAnahtari?: string; claudeYolu?: string | null;
}): Promise<{ adres: string; port: number; erisimAnahtari: string; kapat(): Promise<void> }>;
```

Çekirdeğin bulunduğu yer:

| Durum | Çekirdek | Bağımlılıkları | Stüdyo |
|---|---|---|---|
| Geliştirme | `paketler/cekirdek/dist/index.js` | kök `node_modules` | `paketler/studyo/dist` |
| `ARNORG_SAHTE_CEKIRDEK=1` | `gelistirme/sahte-cekirdek.mjs` | kök `node_modules` | aynı |
| Paketli | `resources/app.asar.unpacked/cekirdek/index.js` | `resources/app.asar.unpacked/node_modules` | `resources/studyo` |

## Geliştirme

```bash
npm install            # kökte
npm run build          # Stüdyo + çekirdek derlemesi
npm run masaustu       # kabuğu derler ve Electron'u açar
```

Çekirdek henüz yoksa ya da yalnız kabukla uğraşıyorsanız sahte çekirdek kullanın. Sahte çekirdek gerçek sözleşmeyi taklit eder ve çekirdeğin yerel bağımlılıklarını (better-sqlite3, node-pty, fastify, Claude Agent SDK ve `claude` ikilisi) Electron içinde dener:

```bash
ARNORG_SAHTE_CEKIRDEK=1 npm run masaustu
```

| Ortam değişkeni | Etkisi |
|---|---|
| `ARNORG_SAHTE_CEKIRDEK=1` | `gelistirme/sahte-cekirdek.mjs` kullanılır |
| `ARNORG_SAHTE_COKME=<sn>` / `baslarken` | sahte çekirdek bir süre sonra çöker / hiç başlamaz (hata sayfasını denemek için) |
| `ARNORG_SAHTE_GECIKME=<sn>` | sahte çekirdek geç başlar (açılış penceresini görmek için) |
| `ARNORG_KULLANICI_DIZINI=<dizin>` | kullanıcı verisi dizinini değiştirir |
| `ARNORG_DENEME_EKRAN_GORUNTUSU=<png>` | ana pencere (ya da hata sayfası) yüklenince ekran görüntüsü alınır ve uygulama kapanır; çekirdek durduysa çıkış kodu 1 |
| `ARNORG_CEKIRDEK_PORT=<port>` | çekirdek rastgele port yerine bu portta açılır (denemeler) |
| `ARNORG_GUNCELLEME=kapali` | otomatik güncelleme denetimini kapatır |
| `ARNORG_SAHTE_GUNCELLEME=<sürüm>` | yalnız paketsiz uygulamada: güncelleme indirmesi taklit edilir, Stüdyo'da güncelleme şeridi çıkar; **Yeniden başlat** bir şey kurmadan uygulamayı yeniden açar |

Root olarak çalışılan konteynerlerde ve GitHub koşucularında Chromium sandbox'ı kurulamaz; `--no-sandbox` verin (`npx electron paketler/masaustu --no-sandbox`). Ekransız makinede: `xvfb-run -a ...`.

Birim testleri kökteki `npm test` ile çalışır (`src/denetimler.test.ts`, tarayıcının kuralları `src/tarayici-denetimleri.test.ts`, öğe seçici `src/arayuz/secim.test.ts`). Tip denetimi: `npm run typecheck -w @arnorg/masaustu`.

## Veri ve kayıtlar

| | Windows | Linux |
|---|---|---|
| Kullanıcı verisi | `%APPDATA%\ArnOrg` | `~/.config/ArnOrg` |
| Çekirdek verisi | `%APPDATA%\ArnOrg\veri` | `~/.config/ArnOrg/veri` |
| Kayıt | `%APPDATA%\ArnOrg\logs\cekirdek.log` | `~/.config/ArnOrg/logs/cekirdek.log` |
| Pencere durumu | `%APPDATA%\ArnOrg\pencere-durumu.json` | `~/.config/ArnOrg/pencere-durumu.json` |

Geliştirme sürümü aynı yerlerde `ArnOrg-gelistirme` dizinini kullanır; paketli uygulamanın verisine dokunmaz. Kayıt 5 MB'ı aşınca açılışta `cekirdek.1.log` olur. Menüde **Dosya → Veri klasörünü aç / Kayıt klasörünü aç** vardır. Kaldırma, kullanıcı verisini silmez.

## Paketleme

```bash
npm run build                                             # Stüdyo + çekirdek
npm run paketle -w @arnorg/masaustu -- --linux --x64 --publish never
npm run paketle -w @arnorg/masaustu -- --win --x64 --publish never      # Windows makinesinde
```

Çıktılar `paketler/masaustu/cikti/` altındadır:

| Platform | Dosyalar |
|---|---|
| Windows | `ArnOrg-Kurulum-<sürüm>-x64.exe` (NSIS, Türkçe, kurulum dizini seçilebilir), `ArnOrg-<sürüm>-x64.msi`, `latest.yml` |
| Linux | `ArnOrg-<sürüm>-x86_64.AppImage`, `ArnOrg-<sürüm>-amd64.deb`, `ArnOrg-<sürüm>-x86_64.rpm`, `latest-linux.yml` (arm64: `-arm64` / `aarch64`) |

Paketin düzeni (`electron-builder.yml`):

```
resources/app.asar                         kabuk (dist/, kaynaklar/simge.png, package.json)
resources/app.asar.unpacked/node_modules/  çekirdeğin çalışma zamanı bağımlılıkları
resources/app.asar.unpacked/cekirdek/      çekirdek derlemesi + {"type":"module"} paket dosyası
resources/studyo/                          Stüdyo derlemesi
```

Neden böyle:

- Çekirdeğin çalışma zamanı bağımlılıkları (`fastify`, `better-sqlite3`, `@lydell/node-pty`, `@anthropic-ai/claude-agent-sdk` …) bu paketin `dependencies` alanında, çekirdekteki sürümlerle aynıdır. electron-builder bunları üretim bağımlılığı olarak toplar ve tamamı `asarUnpack` ile asar dışına çıkar.
- Çekirdek ESM'dir; ESM içe aktarmaları `NODE_PATH`'e bakmaz. Çekirdek, `extraResources` ile bağımlılıklarının yanına (`app.asar.unpacked/cekirdek`) konduğu için `import "fastify"` Node'un olağan `node_modules` aramasıyla çözülür. Çekirdeğin çalıştırdığı yardımcı betikler ve iş parçacıkları da aynı aramayı kullanır.
- Asar dışındaki her dosyanın gerçek yolu vardır: `claude` ikilisi, node-pty'nin `conpty.dll`/`OpenConsole.exe` dosyaları ve yerel modüller doğrudan çalıştırılabilir.
- better-sqlite3 13 ve @lydell/node-pty N-API hazır derlemeleriyle gelir; Electron için yeniden derleme gerekmez, geliştirmede de aynı dosyalar Node ve Electron'da çalışır. `npmRebuild: true` yeni bir yerel modül eklenirse güvence olarak açıktır.
- Gereksiz dosyalar paketlenmez: musl `claude` ikilileri, better-sqlite3 kaynak kodu ve diğer platformların hazır derlemeleri.
- npm yalnız çalışılan makinenin platform paketlerini kurar (`@lydell/node-pty-<platform>-<mimari>`, `@anthropic-ai/claude-agent-sdk-<platform>-<mimari>`). Bu yüzden **her platform ve mimari kendi makinesinde paketlenir**. `betikler/paket-oncesi.cjs` paketlemeden önce çekirdek/Stüdyo derlemelerini ve bu paketleri denetler, eksikse Türkçe hatayla durdurur.
- rpm için Linux'ta `rpmbuild` gerekir (`sudo apt-get install rpm`). AppImage ve deb için ek araç gerekmez; electron-builder araçlarını kendisi indirir.

### Sahte çekirdekle paket denemesi

Gerçek çekirdek hazır değilken paket düzenini denemek için (bu dosyalar `.gitignore`'dadır, commit edilmez):

```bash
mkdir -p paketler/cekirdek/dist paketler/studyo/dist
cp paketler/masaustu/gelistirme/sahte-cekirdek.mjs paketler/cekirdek/dist/index.js
echo '<!doctype html><title>ArnOrg</title>' > paketler/studyo/dist/index.html
npm run paketle -w @arnorg/masaustu -- --linux dir --x64 --publish never
ARNORG_DENEME_EKRAN_GORUNTUSU=/tmp/arnorg.png paketler/masaustu/cikti/linux-unpacked/arnorg
```

### Simge

`kaynaklar/simge.png` (512×512) ve `kaynaklar/simge.ico` (16–256) `npm run simge -w @arnorg/masaustu` ile üretilir (`betikler/simge-uret.mjs`, yalnız `node:zlib`).

### İmzalama

Depoya sertifika ya da anahtar konmaz. Haziran 2023'ten beri kod imzalama anahtarlarının (OV ve EV) donanım güvenlik modülünde (HSM) durması zorunlu olduğundan CI'da imza bulut HSM hizmetiyle atılır. Windows'ta `betikler/imzala.cjs` (`win.signtoolOptions.sign`) imzalanacak her dosya için çağrılır: uygulama, kaldırıcı, kurulum sihirbazı ve MSI. Sağlayıcıyı `ARNORG_IMZA` ortam değişkeni seçer; boşsa kanca bir şey yapmaz ve paketler imzasız çıkar. Pakette zaten geçerli imzası olan başka yayıncıların ikilileri (Claude Code'un `claude.exe`'si, node-pty'nin `OpenConsole.exe`'si) kendi imzasıyla kalır. Her imzadan sonra Authenticode imzası doğrulanır (bazı araçlar başarısızlıkta da 0 koduyla çıkar); imza tutmazsa paketleme durur, imzalı olması beklenen sürüm imzasız yayınlanmaz.

Sürüm iş akışında açmak için GitHub'da **Settings → Secrets and variables → Actions**:

| Sağlayıcı | Değişken (Variables) | Sırlar (Secrets) |
|---|---|---|
| SSL.com eSigner (EV ya da OV) | `WIN_IMZA` = `sslcom`; isteğe bağlı `CODESIGNTOOL_SURUMU` (varsayılan `v1.3.2`) | `ES_USERNAME`, `ES_PASSWORD`, `ES_CREDENTIAL_ID`, `ES_TOTP_SECRET` |
| DigiCert KeyLocker | `WIN_IMZA` = `digicert` | `SM_HOST`, `SM_API_KEY`, `SM_CLIENT_CERT_FILE_B64` (istemci .p12 dosyasının base64'ü), `SM_CLIENT_CERT_PASSWORD`, `SM_KEYPAIR_ALIAS` |
| Başka bir araç (Azure Key Vault + AzureSignTool, donanım anahtarlı kendi koşucunuz…) | `WIN_IMZA` = `komut`, `WIN_IMZA_KOMUTU` = PowerShell komutu; `{dosya}` imzalanacak dosyanın tırnaklı yoluyla değişir | aracın istediği sırlar; `surum.yml`'deki **Paketle (Windows)** adımına eklenir |

İş akışı sağlayıcının aracını kurar (CodeSignTool ya da DigiCert KeyLocker araçları), sırları yalnız Windows paketleme adımına verir ve **İmza denetimi (Windows)** adımında yayından önce bütün `.exe` ve `.msi` dosyalarının imzasını yeniden doğrular. `WIN_IMZA` boşsa yalnız "imzasız" notu düşer. Yerelde aynı ortam değişkenleriyle (`ARNORG_IMZA`, sağlayıcının değişkenleri, sslcom için `CODESIGNTOOL_DIZINI`) `npm run paketle` imzalı paket üretir.

SmartScreen için bilinmesi gerekenler ([Microsoft: SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)):

- EV sertifikası SmartScreen'i artık atlatmaz: EV ile OV ilk indirmede aynı "tanınmayan uygulama" uyarısını verir. EV'nin farkı kurumsal satın alma gibi durumlarda kalır.
- İmzalı dosyada uyarıda yayıncı adı görünür ve itibar sertifikada birikir; aynı sertifikayla imzalanan yeni sürümler zamanla uyarısız açılır. İmzasız her sürüm itibara sıfırdan başlar.
- Windows 11'de Akıllı Uygulama Denetimi (Smart App Control) açıksa itibarı olmayan imzasız dosyalar hiç çalışmaz.
- EV yalnız kurumlara verilir (tüzel kişilik ya da resmî sicile kayıtlı işletme, CA'nın kurum doğrulamasıyla); bireysel geliştirici OV/IV sertifikası alabilir. Azure Artifact Signing (eski Trusted Signing) Türkiye'den başvuruya açık değildir; uyarısız tek yol Microsoft Store'dur.

Linux: AppImage imzasızdır; deb/rpm için GPG imzası henüz yok.

### Otomatik güncelleme

`electron-builder.yml` → `publish` bu açık kaynak deposunun GitHub sürümlerini (fyildirim-debug/ArnOrg) gösterir. Paketleme `latest*.yml` ve `.blockmap` dosyalarını üretir, sürüm iş akışı bunları sürüme ekler. Paketli uygulama açılışta ve 6 saatte bir yeni sürümü denetler, indirir ve kapanırken kurar (`src/guncelleme.ts`, `electron-updater`). NSIS, AppImage, deb ve rpm desteklenir; MSI desteklenmez. 0.0.1–0.0.4 güncellemeyi zaten bu depoda arar; 0.0.5 hiç kurulmamış ayrı bir sürüm deposuna baktığından bir kez elle 0.0.6'ya güncellenmelidir. Güncelleme denetlenemezse uygulama etkilenmez, yalnız kayda bir satır yazılır.

## Windows notları

- **SmartScreen:** imzasız kurulum dosyası "Windows kişisel bilgisayarınızı korudu" uyarısı verir: **Ek bilgi → Yine de çalıştır**. İmzalı sürümlerde uyarıda yayıncı adı görünür ve uyarı, sertifika itibar kazandıkça kalkar (bkz. İmzalama).
- **Git for Windows önerilir:** Claude Code'un Bash aracı Windows'ta Git Bash ile çalışır. Git for Windows kurulu değilse ajanlar kabuk komutu çalıştıramaz. Kurulum yeri standart dışıysa `CLAUDE_CODE_GIT_BASH_PATH` ile `bash.exe` gösterilir.
- Uzun yollar için: `git config --global core.longpaths true`.
- NSIS varsayılan olarak kullanıcıya kurar (`%LOCALAPPDATA%\Programs\ArnOrg`); kurulumda tüm kullanıcılar ve dizin seçilebilir. MSI kurumsal dağıtım içindir.

## Linux notları

- AppImage için FUSE 2 gerekir (Ubuntu 24.04: `sudo apt install libfuse2t64`). Ubuntu 24.04 kullanıcı ad alanlarını kısıtladığından AppImage masaüstü kısayolu `--no-sandbox` ile açılır; deb kurulumu sandbox'ı AppArmor profili ya da SUID `chrome-sandbox` ile açık tutar.
- AppImage'dan çalışırken `PATH`, `LD_LIBRARY_PATH`, `XDG_DATA_DIRS` başına AppImage dizini eklenir; çekirdek ajan ve terminal süreçlerine bu girdileri temizlenmiş ortam vermelidir.
- deb paketi `git` önerir.

## CI

- `.github/workflows/ci.yml`: main'e gönderim ve çekme isteklerinde Ubuntu ve Windows'ta `npm ci`, `npm run typecheck`, `npm test`, `npm run build` ve kabuk derlemesi; Linux'ta sahte çekirdekle Electron duman testi (ekran görüntüsü yapıt olarak yüklenir).
- `.github/workflows/surum.yml`: `v*` etiketinde (ya da elle çalıştırmada `surum` girdisiyle) önce `betikler/surum.mjs --denetle` etiketin paket sürümleriyle ve `docs/surumler/<etiket>.md` notlarıyla uyuştuğunu denetler; sonra Windows x64 (NSIS + MSI), Linux x64 ve arm64 (AppImage + deb + rpm) paketlenir ve dosyalar, notlar gövde olmak üzere yayınlanan GitHub sürümüne eklenir. `WIN_IMZA` değişkeni ve sağlayıcının sırları tanımlıysa Windows paketleri imzalanır ve imzaları yayından önce doğrulanır (bkz. İmzalama). `surum` boş elle çalıştırma yalnız paketleri yapıt olarak üretir.

## Sürüm çıkarma

Sürüm kökteki `package.json`'dan gelir; tüm paketler, kilit dosyası ve `ARNORG_SURUMU` aynı sürümü taşır (`paketler/cekirdek/src/surum.test.ts` denetler).

```bash
npm run surum -- 0.0.2                 # sürümü her yerde günceller
# docs/surumler/v0.0.2.md: sürüm notları (sürüm sayfasının gövdesi)
git add -A && git commit -m "Sürüm 0.0.2"
git tag -a v0.0.2 -m "ArnOrg 0.0.2"
git push origin main v0.0.2
```

Etiket gönderilemiyorsa (ör. yalnız dal gönderimine izin veren ortamlar): **Actions → Sürüm → Run workflow**, `surum` alanına `v0.0.2`. İş akışı aynı denetimi yapar, etiketi seçilen dalın son commit'ine sürümle birlikte koyar.
