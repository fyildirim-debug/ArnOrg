# ArnOrg çekirdek API'si

Çekirdek (`paketler/cekirdek`, arnorg-server) ile Stüdyo (`paketler/studyo`) arasındaki sözleşme. Tipler [`paketler/ortak/src/index.ts`](../paketler/ortak/src/index.ts) dosyasındadır; bu belge uç noktaları ve davranışı anlatır.

## Bağlantı ve güvenlik

- Varsayılan adres `http://127.0.0.1:47820`. Sunucu modunda `--host 0.0.0.0` verilebilir.
- **Her istek erişim anahtarı ister.** Anahtar çekirdek ilk açılışta üretir ve veri dizinine yazar (`<veri>/erisim-anahtari`).
  - HTTP: `Authorization: Bearer <anahtar>` başlığı.
  - WebSocket: `?anahtar=<anahtar>` sorgu parametresi.
  - Stüdyo anahtarı ilk açılışta adres parçasından alır (`/#anahtar=<anahtar>`), `sessionStorage`'a yazar ve adres çubuğundan siler. Electron kabuğu pencereyi bu adresle açar; sunucu modunda çekirdek açılışta bağlantıyı terminale yazar.
- `Host` başlığı yalnız `127.0.0.1:<port>`, `localhost:<port>` ya da `--izinli-host` ile verilen adlar olabilir (DNS yeniden bağlama koruması). Tarayıcıdan gelen istekte `Origin` aynı kökten olmalıdır.
- Gövdeler JSON. Hata yanıtı: `{"hata": "<açıklama>"}` (ayardaki dilde: Türkçe ya da İngilizce) ve uygun durum kodu (400 geçersiz istek, 401 anahtar yok/yanlış, 404 bulunamadı, 409 geçersiz durum geçişi, 500 iç hata).
- `GET /` ve statik dosyalar (Stüdyo derlemesi) anahtar istemez; API ve WebSocket ister.

## Genel

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/saglik` | — | `Saglik` |
| GET | `/api/ayarlar` | — | `Ayarlar` |
| PUT | `/api/ayarlar` | `Partial<Ayarlar>` | `Ayarlar` |
| GET | `/api/hesap?tazele=1` | — | `HesapDurumu`: Claude Code'un fiili girişi (plan, e-posta, kaynak), abonelik pencereleri (5 saatlik, haftalık, model başına yüzde ve sıfırlanma), ayardaki sınır aşıldıysa `sinir`, Claude Code abonelik dışı bir girişle (API anahtarı, bulut sağlayıcı) çalışıyorsa `uyari`. `tazele=1` Claude Code'a yeniden sorar (açık bir ajan oturumu varsa onun üzerinden, yoksa mesaj göndermeyen kısa bir yoklamayla; token harcanmaz) |
| GET | `/api/roller` | — | `Rol[]` |

`Ayarlar` içinde 0.0.2 ile gelenler: `dil` (`tr` | `en`; arayüz, ajan talimatları, ArnOrg'un kanal mesajları ve hata metinleri bu dilde), `projeKoku` (yeni projelerin ve klonların varsayılan yeri; boşsa `~/ArnOrg`), `ghYolu` (GitHub CLI; boşsa ArnOrg'un indirdiği ya da PATH'teki `gh`), `kurulumTamam` (ilk açılış sihirbazı bitti mi).

## Kurulum: Claude Code, git, GitHub CLI

İlk açılış sihirbazı ve Ayarlar bu uçları kullanır. Uzun süren işler (giriş, indirme, kurulum) arka planda bir **kurulum işlemi** olarak yürür; durumu `kurulum.islem` olayıyla gelir, bitince `kurulum.durum` yeni `KurulumDurumu`'nu taşır.

**Her ekranda Claude Code asistanı (0.0.3).** `KurulumDurumu.claude` eksikse (kurulu değil, giriş yok ya da abonelik dışı giriş) Stüdyo her ekranda üst çubuğun altında bir uyarı şeridi gösterir; düğmesi sihirbazdaki Claude Code adımını çekmecede açar. Bir ajan oturumu giriş ya da abonelik hatası alınca (SDK'nın asistan mesajındaki `authentication_failed`, `oauth_org_not_allowed`, `verification_required`, `account_on_hold`, `billing_error` hata alanı ya da çöken sürecin hata metni):

- oturum kapanır, konuşma kimliği saklanır; ajan `duraklatildi` durumuna "Claude Code girişi bekleniyor" açıklamasıyla geçer;
- `kurulum.durum` tazelenip yayınlanır; kurula en çok 10 dakikada bir `eylem: "claude_giris"` taşıyan `kurul.bildirimi` gider;
- ajanlar beklerken çekirdek durumu dakikada bir okur. Girişsizden hazıra geçişte (ArnOrg'dan ya da terminalden giriş) ve ArnOrg'dan yapılan her başarılı girişte bekleyen ajanlar aynı konuşmayı sürdürerek kaldıkları yerden devam eder.

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/kurulum?tazele=1` | — | `KurulumDurumu`: Claude Code (kurulu mu, sürüm, giriş, abonelik), git (sürüm, kimlik), GitHub CLI (sürüm, giriş yapan hesap, git yardımcısı), platform. `tazele=1` önbelleği atlar |
| GET | `/api/kurulum/islemler` | — | `KurulumIslemi[]` |
| GET | `/api/kurulum/islemler/:id` | — | `KurulumIslemi` |
| POST | `/api/kurulum/islemler/:id/girdi` | `{metin}` | `KurulumIslemi` (girdi bekleyen işleme; Claude girişinde tarayıcıdaki kod) |
| DELETE | `/api/kurulum/islemler/:id` | — | `KurulumIslemi` (iptal) |
| POST | `/api/kurulum/claude/giris` | — | `KurulumIslemi`: `claude auth login --claudeai` bir sözde uçbirimde açılır; giriş adresi `adres` alanında gelir, kod istenirse `girdiBekliyor` olur |
| POST | `/api/kurulum/claude/kur` | — | `KurulumIslemi`: elde bir Claude Code kopyası varsa onunla `claude install`; hiç yoksa Anthropic'in resmî kurulum betiği (`curl -fsSL https://claude.ai/install.sh \| bash`, Windows'ta `irm https://claude.ai/install.ps1 \| iex`). İkisi de kullanıcı dizinine kurar, yönetici izni gerekmez |
| POST | `/api/kurulum/gh/kur` | — | `KurulumIslemi`: GitHub CLI'ın son sürümü GitHub'dan indirilip ArnOrg'un araç dizinine açılır |
| POST | `/api/kurulum/gh/giris` | — | `KurulumIslemi`: `gh auth login --web`; tek kullanımlık kod `kod`, adres `adres` alanında. Bitince git kimlik yardımcısı ayarlanır |
| POST | `/api/kurulum/gh/git-yardimcisi` | — | `KurulumIslemi` (`gh auth setup-git`) |
| POST | `/api/kurulum/git/kur` | — | `KurulumIslemi` (Windows'ta winget, macOS'ta Xcode araçları; Linux'ta kurulacak komutu bildirir) |
| PUT | `/api/kurulum/git/kimlik` | `{ad, eposta}` | `GitKurulumu` (`git config --global user.name/user.email`) |

## GitHub ve klasör seçimi

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/github/hesap` | — | `GithubHesabi` (giriş yapan hesap ve kuruluşları) |
| GET | `/api/github/depolar?q=` | — | `GithubDeposu[]` (hesabın ve kuruluşlarının depoları; `q` ada göre süzer) |
| GET | `/api/github/dallar?depo=sahip/ad` | — | `GithubDali[]` (varsayılan dal işaretli) |
| POST | `/api/github/klonla` | `KlonlaIstegi` | `KurulumIslemi`: klonlama arka planda; bitince proje açılır (`proje.guncellendi`) ve işlemin `sonuc` alanı `projeId` taşır |
| GET | `/api/dizinler?yol=` | — | `DizinListesi` (tarayıcıdaki Stüdyo için klasör gezgini; kısayollar ve git deposu işaretleri) |
| POST | `/api/dizinler` | `{ust, ad}` | `{yol}` (yeni klasör) |

Masaüstü uygulamasında klasör seçimi sistemin penceresiyle yapılır (`window.arnorg.klasorSec`); dizin gezgini sunucu modunda ve tarayıcıda kullanılır.

## Projeler

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler` | — | `ProjeOzeti[]` |
| POST | `/api/projeler` | `ProjeOlusturIstegi` | `ProjeOzeti` (yol verilmezse `~/ArnOrg/<ad>`; `dal` çalışma dalı; `github` verilirse GitHub'da depo da açılır) |
| GET | `/api/projeler/:pid` | — | `ProjeOzeti` |
| PATCH | `/api/projeler/:pid` | `ProjeGuncelleIstegi` | `ProjeOzeti` (ad, açıklama, çalışma dalı, otomatik gönderim, hazırlık, otomatik onay) |
| GET | `/api/projeler/:pid/dallar` | — | `ProjeDallari` (yerel ve uzak dallar, çalışma dalı) |
| POST | `/api/projeler/:pid/esitle` | `{gonder?}` | `EsitlemeSonucu` (uzaktan getirir; ağaç temizse ileri sarar, `gonder` ya da otomatik gönderimde yerel commit'leri gönderir; ayrışmada dokunmaz) |
| POST | `/api/projeler/:pid/github` | `{ozel, sahip?}` | `ProjeOzeti` (GitHub'da depo açar, `origin` yapar ve gönderir) |
| POST | `/api/projeler/:pid/hazirlik` | `{islem: "baslat" \| "atla"}` | `ProjeOzeti` (CEO ile hazırlık görüşmesi #yonetim'de başlar ya da atlanır) |
| DELETE | `/api/projeler/:pid` | — | `{tamam:true}` (yalnız ArnOrg listesinden çıkarır, dosyalara dokunmaz) |

Proje açılınca `.arnorg/` iskeleti yoksa oluşturulur: `proje.yaml`, `ekip/`, `notlar/vizyon.md`, `notlar/mimari.md`, `notlar/kararlar/`, `hafiza/`. Yeni projede ayrıca `git init`, `CLAUDE.md` ve ilk commit yapılır. Her projede bir CEO ajanı otomatik işe alınır (kapalı durumda). Sistem kanalları: `genel`, `muhendislik`, `yonetim` (kurul ile CEO'nun bire bir sohbeti; başka ajan yazamaz), toplantıda `toplanti`. İngilizce arayüzde görünen adları `#general`, `#engineering`, `#ceo`, `#meetings`; kimlikleri değişmez.

Uzak deposu olan projeler 10 dakikada bir eşitlenir (`EsitlemeSonucu`; ayrışma ya da hata olursa `bildirim`).

## Ekip ve ajan oturumları

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/ajanlar` | — | `Ajan[]` |
| POST | `/api/projeler/:pid/ajanlar` | `AjanIseAlIstegi` | `Ajan` (kurulun doğrudan işe alımı) |
| PATCH | `/api/ajanlar/:aid` | `AjanGuncelleIstegi` | `Ajan` |
| DELETE | `/api/ajanlar/:aid?devralan=<aid>` | — | `{tamam:true}` (kurulun işten çıkarması: oturum kapanır, açık görevleri, sözleri ve defteri devralana, verilmezse yöneticisine geçer; kimlik dosyası ve worktree kalır) |
| POST | `/api/ajanlar/:aid/baslat` | `AjanBaslatIstegi` | `Ajan` |
| POST | `/api/ajanlar/:aid/mesaj` | `AjanMesajIstegi` | `{tamam:true}` (oturum kapalıysa açılır) |
| POST | `/api/ajanlar/:aid/kes` | — | `{tamam:true}` |
| POST | `/api/ajanlar/:aid/durdur` | — | `Ajan` (oturumu kapatır, oturum kimliği saklanır) |
| POST | `/api/ajanlar/:aid/mod` | `{mod: IzinModu}` | `Ajan` |
| POST | `/api/ajanlar/:aid/model` | `{model: ModelAdi}` | `Ajan` |
| GET | `/api/ajanlar/:aid/akis?sinir=300` | — | `AkisOgesi[]` (eskiden yeniye) |

Ajan oturumu kurallarla açılır: temiz ortam, kendi worktree'si (`arnorg/<ajan>` dalı), Claude Code sistem talimatı + rol metni, `PreToolUse` denetim kapısı, ArnOrg MCP araçları (`mcp__arnorg__*`).

## Görevler

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/gorevler` | — | `Gorev[]` |
| POST | `/api/projeler/:pid/gorevler` | `GorevOlusturIstegi` | `Gorev` |
| PATCH | `/api/gorevler/:gid` | `GorevGuncelleIstegi` | `Gorev`; geçersiz durum geçişi 409 |

Durum geçişleri `GOREV_GECISLERI` tablosuna uyar. Bağımlılığı bitmemiş görev `calisiliyor` durumuna geçemez (409). Atanmış görev `calisiliyor` olunca ajan kapalıysa başlatılır.

## Kanallar

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/kanallar` | — | `Kanal[]` |
| GET | `/api/projeler/:pid/kanallar/:kanal/mesajlar?sinir=200` | — | `Mesaj[]` (eskiden yeniye) |
| POST | `/api/projeler/:pid/kanallar/:kanal/mesajlar` | `{metin}` | `Mesaj` |

Kurul mesajında `@Ad` ile anılan ajan uyanır ve mesajı alır. `#genel` kanalına anma olmadan yazılan mesaj CEO'ya gider. Varsayılan kanallar: `genel`, `muhendislik`.

## Notlar

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/notlar` | — | `NotDosyasi[]` |
| GET | `/api/projeler/:pid/not?yol=<göreli yol>` | — | `NotIcerigi` |
| PUT | `/api/projeler/:pid/not` | `NotIcerigi` | `NotDosyasi` |

Yollar `.arnorg/notlar/` köküne göredir; `..` içeren yol 400 döner.

## Denetim ve onaylar

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/denetim?sinir=300` | — | `DenetimKaydi[]` (yeniden eskiye) |
| GET | `/api/projeler/:pid/politika` | — | `PolitikaKurali[]` |
| PUT | `/api/projeler/:pid/politika` | `PolitikaKurali[]` | `PolitikaKurali[]` |
| GET | `/api/projeler/:pid/onaylar?durum=bekliyor` | — | `Onay[]` (yeniden eskiye) |
| POST | `/api/onaylar/:oid` | `OnayKararIstegi` | `Onay` |

`arac` türündeki onay, bir ajanın araç çağrısını bekletir; süre dolarsa `zaman_asimi` olur ve çağrı reddedilir. `ise_alim` onayı CEO'nun teklifidir; onaylanınca ajan oluşturulur.

## Kod

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/calisma-alanlari` | — | `CalismaAlani[]` (ilk öğe ana repo, kimlik `ana`) |
| GET | `/api/projeler/:pid/dosyalar?alan=<kimlik>` | — | `DosyaDugumu` (kök; `.git` ve `node_modules` hariç) |
| GET | `/api/projeler/:pid/dosya?alan=&yol=` | — | `DosyaIcerigi` (2 MB üstü 413) |
| PUT | `/api/projeler/:pid/dosya` | `DosyaYazIstegi` | `{tamam:true}`; dosya bir ajanca düzenleniyorsa 409 |
| GET | `/api/projeler/:pid/fark?alan=&yol=` | — | `FarkSonucu` (çalışma alanı ile varsayılan dal arası) |
| GET | `/api/projeler/:pid/ara?alan=&q=` | — | `AramaSonucu[]` (en çok 500) |
| POST | `/api/projeler/:pid/disarida-ac` | `{alan, yol?}` | `{tamam:true}` (ayarlardaki dış editörle açar) |

## Kod düzenleyici (VS Code tezgâhı)

Stüdyo'nun Kod ekranı bu uçları `arnorg:` şemalı bir dosya sistemi sağlayıcısına bağlar: `arnorg:/<projeId>/<alan>/<yol>`. `alan` `ana` ya da ajan kimliğidir (çalışma alanı listesindeki `kimlik`). Kodu `paketler/cekirdek/src/fs-api.ts` ve `kod-arama.ts`, tipleri `@arnorg/ortak` ("Kod düzenleyici" bölümü).

- Tüm yollar alan köküne göredir, `..` içeren yol 400 döner; sembolik bağlantı çözüldüğünde alanın dışını gösteriyorsa 403.
- `.git` içine yazma, silme ve taşıma 403. Kök (`yol` boş) silinemez, taşınamaz.
- Bir ajanın son 5 dakikada yazdığı ve hâlâ çalışan (ya da karar bekleyen) ajanın dosyası `saltOkunur` ve `duzenleyenAjanId` ile döner; yazma, silme ve taşıma 409.
- Kullanıcının yazdığı dosya 30 sn ajanlara kilitlenir (denetim kapısı reddeder); dosya bir ajanın alanındaysa ajana "yeniden oku" notu gider; `dosya.degisti` (ajanId `null`) yayınlanır.
- `yoksa=bos`: düzenleyici olmayan ayar dosyalarını (`.vscode/settings.json` …) sürekli yoklar; bu bayrakla olmayan yol 404 yerine `stat`'ta `200 null`, `icerik`'te `204` döner (tarayıcı konsolu 404'leri hata olarak yazar).

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/fs/stat?alan=&yol=&yoksa=bos` | — | `FsDurumu` |
| GET | `/api/projeler/:pid/fs/liste?alan=&yol=` | — | `FsGirdisi[]` |
| GET | `/api/projeler/:pid/fs/icerik?alan=&yol=&yoksa=bos` | — | ham bayt (`application/octet-stream`, en çok 50 MB; üstü 413, klasör 400) |
| PUT | `/api/projeler/:pid/fs/icerik?alan=&yol=&olustur=1&ustune=1` | ham bayt (`application/octet-stream`) | `FsDurumu`; yoksa ve `olustur` değilse 404, varsa ve `ustune` değilse 409 |
| POST | `/api/projeler/:pid/fs/klasor` | `FsKlasorIstegi` | `{tamam:true}`; varsa 409 |
| DELETE | `/api/projeler/:pid/fs?alan=&yol=&ozyinelemeli=1` | — | `{tamam:true}`; boş olmayan klasör `ozyinelemeli` olmadan 409 |
| POST | `/api/projeler/:pid/fs/tasi` | `FsTasiIstegi` | `{tamam:true}`; hedef varsa ve `ustune` değilse 409 (yalnız aynı alanda) |
| GET | `/api/projeler/:pid/fs/dosyalar?alan=` | — | `string[]` hızlı açma listesi (`git ls-files -co --exclude-standard`; git deposu değilse dolaşma) |
| POST | `/api/projeler/:pid/fs/ara` | `MetinAramaIstegi` | `MetinAramaSonucu` (JavaScript düzenli ifadesi, büyük/küçük harf, Unicode tam sözcük, dahil/hariç glob; varsayılan sınır 2000, en çok 20000) |
| GET | `/api/projeler/:pid/git/durum?alan=` | — | `GitDurumu` (porcelain; ajan alanında `temeleGore`: temel dalla ortak ataya göre tüm değişiklikler) |
| GET | `/api/projeler/:pid/git/icerik?alan=&yol=&ref=HEAD\|indeks\|temel&yoksa=bos` | — | ham bayt; o sürümde dosya yoksa 404 (`yoksa=bos` ile 204) |
| POST | `/api/projeler/:pid/git/hazirla` | `GitYollarIstegi` | `{tamam:true}` (`git add -A`) |
| POST | `/api/projeler/:pid/git/hazirlamayi-geri-al` | `GitYollarIstegi` | `{tamam:true}` (`git reset HEAD`) |
| POST | `/api/projeler/:pid/git/degisiklikleri-at` | `GitYollarIstegi` | `{tamam:true}` (izlenen dosya indekse döner, izlenmeyen silinir) |
| POST | `/api/projeler/:pid/git/commit` | `GitCommitIstegi` | `GitCommitSonucu`; aşamada değişiklik yoksa 409 (`tumu` önce hepsini aşamaya alır) |

Git yazma işlemleri yalnız ana repoda yapılır; ajan alanlarında 403. Commit kimliği makinedeki git yapılandırmasından gelir, mesaja imza ya da `Co-Authored-By` eklenmez.

Stüdyo sayfası (API ve WebSocket dışındaki yanıtlar) `Cross-Origin-Opener-Policy: same-origin` ve `Cross-Origin-Embedder-Policy: credentialless` ile sunulur: tezgâhtaki TypeScript dil sunucusu proje çapında IntelliSense için `SharedArrayBuffer` ister. `credentialless` dış kaynakları (Open VSX simgeleri gibi) kimliksiz yükler, engellemez.

## Terminal

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| POST | `/api/projeler/:pid/terminaller` | `TerminalAcIstegi` | `{id}` |
| DELETE | `/api/terminaller/:tid` | — | `{tamam:true}` |
| WS | `/ws/terminal/:tid?anahtar=` | — | Sunucudan ham metin; istemciden `TerminalIstemciMesaji` JSON'u |

## Kullanım

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/api/projeler/:pid/kullanim` | `KullanimOzeti` (bugünkü ve toplam token, ajan başına, son abonelik penceresi olayı) |

### Yalnız Claude aboneliği

ArnOrg yalnız Claude aboneliğiyle çalışır. Ajanlar makinedeki Claude Code girişiyle (claude.ai Pro, Max ya da Team) çalışır. `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` ve bulut sağlayıcı değişkenleri (`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`) ajan ortamına hiçbir zaman verilmez. Claude Code makinede API anahtarıyla giriş yapmışsa `HesapDurumu.uyari` `/login` ile claude.ai hesabına geçmeyi söyler. Kullanım yalnız token ve plan penceresi yüzdesiyle izlenir; tutar, bütçe ya da `maxBudgetUsd` yoktur.

Sınır planın pencereleridir: ajanlar `besSaatlikSinirYuzde` (varsayılan 90) ya da `haftalikSinirYuzde` (varsayılan 95) aşılınca durdurulur. Bu sürede denetim kapısı araç çağrılarını "Kullanım sınırı" kuralıyla reddeder, ajanlara gelen mesajlar saklanır. Pencere açılınca ajanlar saklanan mesajlarla uyanır. Arayüz token ve pencere yüzdesi gösterir.

Eski sürümden gelen veritabanında token sayıları `kullanim` tablosuna taşınır; API kipine ait tutar, bütçe ve bütçe onayı kayıtları silinir. Ayarlar dosyasındaki eski `girisYontemi` ve `gunlukButceUsd` alanları okunmaz, ilk kayıtta dosyadan düşer.

Token: sonuç mesajındaki `modelUsage` toplamı (girdi + çıktı + önbellek yazımı; önbellekten okuma hariç). Sürdürülen oturumda Claude Code toplamı önceki turlardan devam ettirdiği için oturum başına son toplam saklanır, yalnız fark sayılır.

## Proje hafızası ve ajanlar arası sorular

Her projenin kendi kalıcı hafızası vardır; başka projelerle karışmaz. Kayıtlar veritabanında aranır, ayrıca repo içinde `.arnorg/hafiza/hafiza.md` (okunur), `.arnorg/hafiza/kayitlar.json` (geri yükleme) ve `.arnorg/hafiza/ajanlar/<ad>.md` (ajan defterleri) olarak tutulur. Var olan bir repo başka makinede bağlanınca hafıza ve defterler geri yüklenir. ArnOrg kendi `.arnorg/` değişikliklerini 90 sn gecikmeyle ve birleştirmeden hemen önce yalnız o yolu kapsayan bir commit'le kaydeder; kullanıcının diğer değişikliklerine dokunmaz.

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/hafiza?q=&tur=&eskiler=1` | — | `HafizaKaydi[]` (q varsa Türkçe harf duyarsız tam metin arama, önem ve tazelikle sıralı) |
| POST | `/api/projeler/:pid/hafiza` | `HafizaYazIstegi` | `HafizaKaydi` (kurul adına; aynı tür ve başlık güncellenir) |
| PATCH | `/api/hafiza/:hid` | tür, başlık, metin, etiketler, önem | `HafizaKaydi` |
| DELETE | `/api/hafiza/:hid` | — | `{tamam:true}` |
| GET | `/api/projeler/:pid/sorular` | — | `AjanSorusu[]` |
| GET / PUT | `/api/ajanlar/:aid/defter` | `{icerik}` | `{icerik, guncelleme}` |

Ajan araçları: `hafiza_kaydet`, `hafiza_ara` (hafıza + notlar), `hafiza_listele`, `defter_yaz`, `defter_oku`, `ajana_sor` (yanıtı en çok 30 dk bekler; karşılıklı bekleme reddedilir), `soruyu_yanitla`. Her oturumun talimatına kurul tercihleri, kararlar, öğrenilenler, olgular, uzmanlıklar, son özetler, ajanın defteri ve ona sorulmuş bekleyen sorular eklenir; görev verilirken görevle ilgili hafıza kayıtları mesaja eklenir. Çok iş yapıp defterini yazmadan duran ajana bir kez hatırlatılır. Görev bitişi, birleştirme ve işe alım hafızaya kendiliğinden yazılır. Olaylar: `hafiza.yeni`, `soru.guncellendi`.

Hafıza, ajan çalışırken de doğru anda önüne gelir (Claude Code kancalarıyla; aynı kayıt bir oturumda aynı amaçla bir kez):

| An | Kanca | Ajana eklenen |
|---|---|---|
| Yeni mesaj | `UserPromptSubmit` | Başka ajanların son turundan beri yazdığı kayıtlar ve mesajla ilgili kayıtlar. Kurul "bundan sonra", "asla", "her zaman" gibi kalıcı bir tercih bildirirse kaydetme hatırlatması |
| Komut hatası | `PostToolUseFailure` | Aynı hataya dair öğrenilen kayıt; yoksa (oturumda bir kez) çözümü `ogrenilen` olarak kaydetme ipucu |
| Dosyaya dokunma | `PostToolUse` | O dosyayı yoluyla ya da adıyla anan kayıtlar; aynı dosyayı son 6 saatte başka bir ajan kendi dalında değiştirdiyse çakışma uyarısı (kişi başına bir kez) |
| Bağlam sıkıştırma | `SessionStart` (compact) | Defter, oturum boyunca ekipten gelen kayıtlar, yanıt bekleyen sorular |

`ajana_sor` hedefsiz çağrılabilir: ArnOrg hafızadaki uzmanlık ve iş kayıtlarına, üzerinde çalışılan görevlere, benzer soruları kimin yanıtladığına ve rollere bakıp uzmanı seçer; işaret yoksa soranın yöneticisine, o da yoksa CEO'ya gider. Aynı soru son 30 günde yanıtlandıysa meslektaş uyandırılmaz, önceki yanıt hemen döner (`yeniden: true` zorlar). `hafiza_ara` yanıtlanmış soruları da arar.

Hafıza bakımı: `GET /api/projeler/:pid/hafiza/benzerler` aynı türde birbirini tekrar eden geçerli kayıt çiftlerini döner (`HafizaBenzerCifti[]`, benzerlik 0–1). `POST /api/hafiza/:hid/birlestir` `{ eskiyen, metin? }` tutulan kaydı (isteğe bağlı birleşik metinle) günceller, ötekini eskimiş sayar. `POST /api/projeler/:pid/hafiza/ayri` `{ a, b }` çifti bir daha önermez. Ajan araçları: `hafiza_bakim`, `hafiza_birlestir`; CEO dönem raporunda bakım yapar. Silme `hafiza.silindi` olayını yayınlar. `toplanti_yap` (gündem, isteğe bağlı katılımcılar, bekle_dk): katılımcıların görüşü ajanlar arası soru olarak paralel toplanır, konuşma `#toplanti` kanalına yazılır, özet hafızaya `ozet` olarak düşer; katılımcı verilmezse ArnOrg konuya en yakın en çok üç çalışanı seçer. Kararı çağıran verir ve `karar` olarak kaydeder. Görev başka bir çalışana geçerse yeni sahibin görev mesajına önceki sahibin defteri, göreve bağlı hafıza kayıtları ve görev kodunun geçtiği yanıtlanmış sorular eklenir.

## Kod zekâsı

Her projenin kodu, proje başına bir SQLite dizininde tutulur (`<veri dizini>/kod-dizini/<projeId>.db`). Dizinde dosyalar, semboller, içe aktarmalar ve arama parçaları vardır:
- Semboller: fonksiyon, sınıf, metot, arayüz, tür, sabit, Markdown başlığı, CSS seçicisi…
- Arama parçaları: sembole dayalı, ~40–80 satır.

Gömmeler metin özetiyle saklanır. Ajan worktree'lerinde ana repoyla aynı olan parçaların vektörü yeniden hesaplanmaz.

Arama hibrittir; üç yöntem Reciprocal Rank Fusion ile birleşir:
- anlamsal (kosinüs);
- anahtar sözcük (FTS5 bm25): tanımlayıcılar camelCase ve snake_case parçalarına bölünür, Türkçe harfler sadeleşir;
- sembol adı.

Hangi dosyalar dizine girer:
- Kaynak: `git ls-files` listesindeki izlenen ve yok sayılmayan dosyalar.
- 512 KB üstü dosya girmez; JSON, YAML gibi veri dosyalarında sınır 128 KB.
- İkili, kilit ve küçültülmüş dosyalar girmez.
- Üretilmiş klasörler girmez: `dist`, `build`, `node_modules`, `.arnorg`…
- Politikadaki "Gizli dosyalar" kuralına uyanlar girmez: `.env`, özel anahtarlar, `credentials.json`…

Model, `Ayarlar.kodZekasiModeli` ile seçilir:

| Seçim | Model | Boyut |
|---|---|---|
| `kaliteli` (varsayılan) | EmbeddingGemma 300M, q8 | 768 boyut, ~310 MB |
| `hizli` | multilingual-e5-small, q8 | 384 boyut, ~130 MB |
| `kapali` | yalnız anahtar sözcük | — |

- **Ölçüm** (4 çekirdekli CPU, bu repo: 197 dosya, 1607 parça):

  | Adım | EmbeddingGemma | e5-small |
  |---|---|---|
  | Tarama (sembol, içe aktarma, parça ve FTS) | ~3 sn | ~3 sn |
  | İlk gömme | 835 sn | 153 sn |
  | Sorgu (sorgu vektörü dahil) | ~0,25 sn | ~0,02–0,06 sn |

  İlk gömmede çok içe aktarılan kaynak dosyalar önce, testler ve belgeler sona kalır; bu sırada anahtar sözcük araması çalışır. Sonraki taramalarda yalnız değişen parçalar gömülür. Model değişince eski vektörler silinmez; geri dönüş anında olur.
- **Kurulum:** Model ilk kullanımda veri dizinindeki `modeller/` altına iner. Yeri `ARNORG_MODEL_DIZINI` ile değiştirilebilir. Çıkarım CPU'da, ayrı bir iş parçacığında çalışır; ana olay döngüsünü kilitlemez.
- **Ne zaman dizinlenir:** `Ayarlar.kodZekasiOtomatik` varsayılan olarak açıktır. Açıkken sunucu açılınca ve proje eklenince ana repo arka planda dizinlenir. Değişen dosyalar 3 sn gecikmeyle artımlı işlenir. Ajan worktree'leri ilk sorguda dizinlenir.

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/kod-zekasi/modeller` | — | `KodZekasiModelBilgisi[]` (indirildi mi, diskteki boyut) |
| GET | `/api/projeler/:pid/kod-zekasi?alan=` | — | `KodDizinDurumu[]` (alan verilmezse projenin tüm alanları, "ana" önce) |
| POST | `/api/projeler/:pid/kod-zekasi/dizinle` | `{alan?, sifirdan?}` | `KodDizinDurumu` (iş arka planda sürer) |
| GET | `/api/projeler/:pid/kod-zekasi/ara?alan=&q=&sinir=&yol=` | — | `KodAramaYaniti` (yol: klasör ya da glob, ör. `src/**/*.tsx`) |
| GET | `/api/projeler/:pid/kod-zekasi/semboller?alan=&q=&tur=&sinir=` | — | `KodSembolu[]` (tam ad, önek, içerme; q boşsa öne çıkanlar) |
| GET | `/api/projeler/:pid/kod-zekasi/harita?alan=&yol=` | — | `KodHaritaDugumu` (klasör ağacı: dil, satır, öne çıkan semboller) |
| GET | `/api/projeler/:pid/kod-zekasi/bagimliliklar?alan=&yol=` | — | `KodBagimliliklari` (içe aktardıkları ve onu içe aktaranlar) |
| GET | `/api/projeler/:pid/kod-zekasi/grafik?alan=&duzey=` | — | `KodGrafigi` (`duzey`: `klasor` ya da `dosya`) |
| GET | `/api/projeler/:pid/kod-zekasi/benzer?alan=&yol=&satir=&sinir=` | — | `KodAramaYaniti` (satırı içeren parçaya en çok benzeyenler) |

- **`alan`:** `ana` (varsayılan) ya da ajan kimliği. Hiç dizinlenmemiş alanda ilk sorgu taramayı başlatır ve en çok 20 sn bekler.
- **Olay `kod.dizin`:** `KodDizinDurumu` taşır. Alan başına saniyede en çok iki kez yayınlanır; son durum her zaman gelir.

Ajan araçları ajanın kendi çalışma alanında çalışır:

| Araç | Ne yapar |
|---|---|
| `kod_ara` | Kodda arar |
| `sembol_bul` | Sembolü adıyla bulur |
| `kod_haritasi` | ~4000 karakterlik harita verir; en çok kullanılan dosyalar (içe aktarma grafiğinde PageRank) önce gelir |
| `bagimliliklar` | İçe aktardıklarını ve onu içe aktaranları listeler |
| `benzer_kod` | Satırı içeren parçaya en çok benzeyenleri bulur |

Görev verilirken dizin hazırsa görev başlığı ve açıklamasıyla arama yapılır. Bulunan en çok beş konum, görev mesajına "İlgili kod" olarak eklenir. Arama en çok ~1,5 sn sürer; dizin hazır değilse atlanır.

## Ana yasa ve ajan zekâsı

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/anayasa` | — | `Anayasa` (`.arnorg/anayasa.json`; sürüm, maddeler, onaylayan) |
| PUT | `/api/projeler/:pid/anayasa` | `{maddeler: AnayasaMaddesi[]}` | `Anayasa` (kurulun doğrudan düzenlemesi; sürüm artar, `anayasa.md` yeniden yazılır, `anayasa.guncellendi`) |
| GET | `/api/projeler/:pid/sozler?durum=acik\|tutuldu\|iptal` | — | `Soz[]` |
| GET | `/api/projeler/:pid/beceriler` | — | `Beceri[]` (`.arnorg/beceriler/*.md`) |
| GET | `/api/projeler/:pid/beceriler/:ad` | — | `BeceriIcerigi` |
| GET | `/api/ajanlar/:aid/zeka` | — | `AjanZekasi` (kişisel hafıza ve doluluğu, defter, verdiği ve aldığı sözler, beceriler, ekip bağları) |
| POST | `/api/ajanlar/:aid/aktar` | `{kime, sozler?, not?}` | `{mesaj}` (kişisel hafıza ve defter alana aktarılır; `sozler` ile açık sözler de devredilir) |

- **Ana yasa:** CEO `anayasa_oner` ile önerir, kurul onaylar (`anayasa` türünde onay) ya da kurul doğrudan düzenler. Her ajanın talimatının en başına girer. `kural` alanı olan maddeler (`PolitikaKurali` biçiminde) denetim kapısında proje politikasından önce uygulanır. Sürüm değişince her ajana bir sonraki turunda hatırlatılır.
- **Kişisel hafıza:** ajan başına en çok 2200 karakter. Oturum başında donmuş bir anlık görüntü olarak talimata girer, oturum içindeki değişiklik sonraki oturumda görünür.
- **Hatırlatma kancaları:** her 25 araç çağrısında ya da 30 dakikada bir ve bağlam sıkıştırılınca kimlik, rol, açık işler, sözler ve ana yasanın kısası hatırlatılır. Ekipten haberler (tutulan söz, biten bağımlı görev, devir) bir sonraki turun başına eklenir.
- **Ajan araçları:** `kendime_not`, `soz_ver`, `soz_tut`, `beceri_listele`, `beceri_oku`, `beceri_yaz`, `gecmiste_ara`, `hafiza_aktar`, `anayasa_oku`, `anayasa_oner`, `kuresel_kural_oner`, `kuresel_kural_degerlendir`, `kurula_bildir`, `teslim_et`, `isten_cikar_teklif`, `hazirlik_tamam`.
- **Olaylar:** `anayasa.guncellendi`, `soz.guncellendi`.

## Global zekâ

Projelerden bağımsız, sürekli öğrenen kural deposu (`<veri>/arnorg.db`; okunur kopyası `<veri>/zeka/kurallar.md`).

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/zeka` | — | `ZekaDurumu` (kurallar, sayılar, son günlük kayıtları) |
| POST | `/api/zeka/kurallar` | `{metin, kapsam?}` | `KureselKural` (kurulun yazdığı kural; doğrudan etkin) |
| PATCH | `/api/zeka/kurallar/:id` | `{metin?, kapsam?, durum?}` | `KureselKural` (`durum`: `aday`, `etkin`, `emekli`; emekliye ayırmak kapatmaktır) |
| POST | `/api/zeka/kurallar/:id/geri-bildirim` | `{sonuc: "ise_yaradi" \| "yanlis" \| "ihlal", not?}` | `KureselKural` (güveni artırır ya da düşürür) |
| DELETE | `/api/zeka/kurallar/:id` | — | `{tamam:true}` |

- **Gözlem:** kurulun önemli tercihleri ve yazdığı kayıtlar, ajanların dersleri, kurulun gerekçeli retleri (düzeltme), kurulun kalıcı tercih bildiren mesajları ve ajan önerileri (`kuresel_kural_oner`). Projeye özgü olan (yol, sürüm, proje adı) elenir.
- **Öğrenme:** benzer gözlemler aynı kuralı güçlendirir. Aday kural güveni 0,65'i geçince ya da iki ayrı projede görülünce etkin olur. Bakımda çok benzeyen kurallar birleşir, zayıflar emekliye ayrılır; en çok 60 etkin kural tutulur.
- **Kapsam:** `hepsi`, `yonetici`, `gelistirici` ya da rol kimliği. Her ajanın talimatına yalnız kapsamına uyan etkin kurallar girer; kullanıldıkça ve geri bildirimle güven değişir.
- **Olay:** `zeka.guncellendi`.

## Onay türleri ve kurula bildirim

`OnayTuru`: `arac`, `ise_alim`, `birlestirme`, `genel`, `anayasa`, `isten_cikarma`, `teslim`.

- **Otomatik onay:** projede `otomatikOnay.etkin` açıkken türü `otomatikOnay.turler` içinde olan onaylar bekletilmeden verilir ve "Otomatik onay" notuyla kaydedilir; açıldığı anda bekleyen uygun onaylar da verilir. Varsayılan türler: `arac`, `ise_alim`, `birlestirme`, `anayasa`, `isten_cikarma` (`genel` ve `teslim` kurulun kendisine kalır).
- **İşten çıkarma:** CEO ya da CTO `isten_cikar_teklif` ile gerekçe ve devralanla önerir; kurul onaylarsa işler, sözler ve defter devralana geçer.
- **Teslim:** CEO `teslim_et` ile test adımlarını, çalıştırma komutunu ve adresi verir (`teslim` türünde onay). Kurul test edip kabul eder ya da geri bildirim yazar; geri bildirim CEO'ya iş olarak döner.
- **Kurula bildirim:** yeni onay, CEO önerisi, istek, yetki ve teslim `kurul.bildirimi` olayıyla gelir; Stüdyo her ekranda açılır pencere, pencere arkadaysa masaüstü bildirimi gösterir. `KurulBildirimi.eylem` doluysa pencerede ona özel bir düğme çıkar: `claude_giris` Claude Code giriş asistanını açar.
- **Kanal olayları:** `kanal.yaziyor` (ajan bir kanala yazarken; yazıyor göstergesi).

## Rapor ve tıkanma koruması

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/api/projeler/:pid/rapor?gun=7` | `{baslik, yol, baslangic, markdown}` dönem raporu (1–90 gün) |
| POST | `/api/projeler/:pid/rapor?gun=7` | Aynı rapor; ayrıca notlara `raporlar/AAAA-AA-GG.md` olarak yazılır |

Çekirdek dakikada bir süren ve incelemedeki görevlere bakar. Sorumlusu `Ayarlar.tikanmaDakika` (varsayılan 20, 0 kapalı) boyunca hareketsiz kalan görevde önce sorumlu iki kez hatırlatılır, sonra yöneticisi (yoksa CEO) uyandırılır, en son #genel'e ArnOrg adıyla yazılır ve `bildirim` (uyarı) yayınlanır. Çalışan, karar bekleyen ya da duraklatılan ajan ve kurul onayındaki birleştirme dürtülmez; abonelik sınırındayken kimse dürtülmez. Görev güncellenince sayaç sıfırlanır.

## Canlı olaylar

`WS /ws?anahtar=<anahtar>`: sunucu `SunucuOlayi` JSON'ları gönderir. İstemci `{"tur":"abone","projeId":"…"}` gönderince yalnız o projenin olaylarını alır (`proje.guncellendi`, `hesap.guncellendi` ve projesiz `bildirim` her zaman gelir). Bağlantı açılınca ilk mesaj `{"tur":"merhaba"}`.
