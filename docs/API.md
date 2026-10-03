# ArnOrg çekirdek API'si

Çekirdek (`paketler/cekirdek`, arnorg-server) ile Stüdyo (`paketler/studyo`) arasındaki sözleşme. Tipler [`paketler/ortak/src/index.ts`](../paketler/ortak/src/index.ts) dosyasındadır; bu belge uç noktaları ve davranışı anlatır.

## Bağlantı ve güvenlik

- Varsayılan adres `http://127.0.0.1:47820`. Sunucu modunda `--host 0.0.0.0` verilebilir.
- **Her istek erişim anahtarı ister.** Anahtar çekirdek ilk açılışta üretir ve veri dizinine yazar (`<veri>/erisim-anahtari`).
  - HTTP: `Authorization: Bearer <anahtar>` başlığı.
  - WebSocket: `?anahtar=<anahtar>` sorgu parametresi.
  - Stüdyo anahtarı ilk açılışta adres parçasından alır (`/#anahtar=<anahtar>`), `sessionStorage`'a yazar ve adres çubuğundan siler. Electron kabuğu pencereyi bu adresle açar; sunucu modunda çekirdek açılışta bağlantıyı terminale yazar.
- `Host` başlığı yalnız `127.0.0.1:<port>`, `localhost:<port>` ya da `--izinli-host` ile verilen adlar olabilir (DNS yeniden bağlama koruması). Tarayıcıdan gelen istekte `Origin` aynı kökten olmalıdır.
- Gövdeler JSON. Hata yanıtı: `{"hata": "<Türkçe açıklama>"}` ve uygun durum kodu (400 geçersiz istek, 401 anahtar yok/yanlış, 404 bulunamadı, 409 geçersiz durum geçişi, 500 iç hata).
- `GET /` ve statik dosyalar (Stüdyo derlemesi) anahtar istemez; API ve WebSocket ister.

## Genel

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/saglik` | — | `Saglik` |
| GET | `/api/ayarlar` | — | `Ayarlar` |
| PUT | `/api/ayarlar` | `Partial<Ayarlar>` | `Ayarlar` |
| GET | `/api/hesap?tazele=1` | — | `HesapDurumu`: Claude Code'un fiili girişi (plan, e-posta, kaynak), abonelik pencereleri (5 saatlik, haftalık, model başına yüzde ve sıfırlanma), ayardaki sınır aşıldıysa `sinir`, ayar ile giriş uyuşmuyorsa `uyari`. `tazele=1` Claude Code'a yeniden sorar (açık bir ajan oturumu varsa onun üzerinden, yoksa mesaj göndermeyen kısa bir yoklamayla; token harcanmaz) |
| GET | `/api/roller` | — | `Rol[]` |

## Projeler

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler` | — | `ProjeOzeti[]` |
| POST | `/api/projeler` | `ProjeOlusturIstegi` | `ProjeOzeti` |
| GET | `/api/projeler/:pid` | — | `ProjeOzeti` |
| DELETE | `/api/projeler/:pid` | — | `{tamam:true}` (yalnız ArnOrg listesinden çıkarır, dosyalara dokunmaz) |

Proje açılınca `.arnorg/` iskeleti yoksa oluşturulur: `proje.yaml`, `ekip/`, `notlar/vizyon.md`, `notlar/mimari.md`, `notlar/kararlar/`, `hafiza/`. Yeni projede ayrıca `git init`, `CLAUDE.md` ve ilk commit yapılır. Her projede bir CEO ajanı otomatik işe alınır (kapalı durumda).

## Ekip ve ajan oturumları

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/ajanlar` | — | `Ajan[]` |
| POST | `/api/projeler/:pid/ajanlar` | `AjanIseAlIstegi` | `Ajan` (kurulun doğrudan işe alımı) |
| PATCH | `/api/ajanlar/:aid` | `AjanGuncelleIstegi` | `Ajan` |
| DELETE | `/api/ajanlar/:aid` | — | `{tamam:true}` (oturum kapanır; kimlik dosyası ve worktree kalır) |
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

## Maliyet

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/api/projeler/:pid/maliyet` | `MaliyetOzeti` (giriş yöntemi, bugünkü ve toplam token, API karşılığı tahmini dolar, ajan başına) |

### Abonelik ve API girişi

`Ayarlar.girisYontemi`:

- `abonelik` (varsayılan): ajanlar makinedeki Claude Code girişiyle (claude.ai Pro/Max/Team) çalışır. `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` ve bulut sağlayıcı değişkenleri ajan ortamına verilmez. Ücret alınmaz; dolar bütçeleri uygulanmaz, `maxBudgetUsd` geçilmez. Asıl sınır planın pencereleridir: ajanlar `besSaatlikSinirYuzde` (varsayılan 90) ya da `haftalikSinirYuzde` (varsayılan 95) aşılınca durdurulur. Bu sürede denetim kapısı araç çağrılarını "Kullanım sınırı" kuralıyla reddeder, ajanlara gelen mesajlar saklanır. Pencere açılınca ajanlar saklanan mesajlarla uyanır. Arayüz token ve pencere yüzdesi gösterir.
- `api`: ajanlar API anahtarıyla çalışır; ajan ve şirket günlük dolar bütçeleri uygulanır.

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
| Dosyaya dokunma | `PostToolUse` | O dosyayı yoluyla ya da adıyla anan kayıtlar |
| Bağlam sıkıştırma | `SessionStart` (compact) | Defter, oturum boyunca ekipten gelen kayıtlar, yanıt bekleyen sorular |

`ajana_sor` hedefsiz çağrılabilir: ArnOrg hafızadaki uzmanlık ve iş kayıtlarına, üzerinde çalışılan görevlere, benzer soruları kimin yanıtladığına ve rollere bakıp uzmanı seçer; işaret yoksa soranın yöneticisine, o da yoksa CEO'ya gider. Aynı soru son 30 günde yanıtlandıysa meslektaş uyandırılmaz, önceki yanıt hemen döner (`yeniden: true` zorlar). `hafiza_ara` yanıtlanmış soruları da arar.

## Rapor ve tıkanma koruması

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/api/projeler/:pid/rapor?gun=7` | `{baslik, yol, baslangic, markdown}` dönem raporu (1–90 gün) |
| POST | `/api/projeler/:pid/rapor?gun=7` | Aynı rapor; ayrıca notlara `raporlar/AAAA-AA-GG.md` olarak yazılır |

Çekirdek dakikada bir süren ve incelemedeki görevlere bakar. Sorumlusu `Ayarlar.tikanmaDakika` (varsayılan 20, 0 kapalı) boyunca hareketsiz kalan görevde önce sorumlu iki kez hatırlatılır, sonra yöneticisi (yoksa CEO) uyandırılır, en son #genel'e ArnOrg adıyla yazılır ve `bildirim` (uyarı) yayınlanır. Çalışan, karar bekleyen, duraklatılan ya da bütçesi biten ajan ve kurul onayındaki birleştirme dürtülmez; görev güncellenince sayaç sıfırlanır.

## Canlı olaylar

`WS /ws?anahtar=<anahtar>`: sunucu `SunucuOlayi` JSON'ları gönderir. İstemci `{"tur":"abone","projeId":"…"}` gönderince yalnız o projenin olaylarını alır (`proje.guncellendi`, `hesap.guncellendi` ve projesiz `bildirim` her zaman gelir). Bağlantı açılınca ilk mesaj `{"tur":"merhaba"}`.
