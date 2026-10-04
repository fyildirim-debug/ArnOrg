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

`Ayarlar` içinde 0.0.2 ile gelenler: `dil` (`tr` | `en`; arayüz, ajan talimatları, ArnOrg'un kanal mesajları ve hata metinleri bu dilde), `projeKoku` (yeni projelerin ve klonların varsayılan yeri; boşsa `~/ArnOrg`), `ghYolu` (GitHub CLI; boşsa ArnOrg'un indirdiği ya da PATH'teki `gh`), `kurulumTamam` (ilk açılış sihirbazı bitti mi). 0.0.4 ile gelen: `denetimSaklamaGun` (0–3650 tam gün, varsayılan 90, 0 süresiz; bkz. "Denetim ve onaylar").

## Kurulum: Claude Code, git, GitHub CLI

İlk açılış sihirbazı ve Ayarlar bu uçları kullanır. Uzun süren işler (giriş, indirme, kurulum) arka planda bir **kurulum işlemi** olarak yürür; durumu `kurulum.islem` olayıyla gelir, bitince `kurulum.durum` yeni `KurulumDurumu`'nu taşır.

**Her ekranda Claude Code asistanı (0.0.3).** `KurulumDurumu.claude` eksikse (kurulu değil, giriş yok ya da abonelik dışı giriş) Stüdyo her ekranda üst çubuğun altında bir uyarı şeridi gösterir; düğmesi sihirbazdaki Claude Code adımını çekmecede açar. Bir ajan oturumu giriş ya da abonelik hatası alınca (SDK'nın asistan mesajındaki `authentication_failed`, `oauth_org_not_allowed`, `verification_required`, `account_on_hold`, `billing_error` hata alanı ya da çöken sürecin hata metni):

- oturum kapanır, konuşma kimliği saklanır; ajan `duraklatildi` durumuna "Claude Code girişi bekleniyor" açıklamasıyla geçer;
- `kurulum.durum` tazelenip yayınlanır; kurula en çok 10 dakikada bir `eylem: "claude_giris"` taşıyan `kurul.bildirimi` gider;
- ajanlar beklerken çekirdek durumu dakikada bir okur. Girişsizden hazıra geçişte (ArnOrg'dan ya da terminalden giriş) ve ArnOrg'dan yapılan her başarılı girişte bekleyen ajanlar aynı konuşmayı sürdürerek kaldıkları yerden devam eder.

**Güncelleme şeridi (masaüstü, 0.0.4).** Paketlenmiş masaüstü uygulaması açılışta ve açık kaldıkça 6 saatte bir GitHub sürümlerini denetler (electron-updater `checkForUpdates`; sistem bildirimi gönderilmez) ve yeni sürümü arka planda indirir. Durum ön yükleme köprüsünden gelir: `window.arnorg.guncelleme = { durum(), dinle(f), kur() }` (`MasaustuGuncellemesi`, `MasaustuGuncellemeDurumu`; aşamalar `yok`, `denetleniyor`, `iniyor`, `hazir`, `hata`). Sürüm indirilince (`hazir`) Stüdyo üst çubuğun altında "ArnOrg <sürüm> hazır; yeniden başlatınca kurulur." şeridini gösterir: **Yeniden başlat** hemen kurar ve uygulamayı yeniden açar (`quitAndInstall`); **Sonra** şeridi o sürüm için pencere oturumu boyunca gizler, güncelleme uygulama kapanırken yine kurulur. Tarayıcıda köprü olmadığından şerit hiç görünmez.

Şeritler (Claude Code uyarısı ve güncelleme) üst çubuğun altındaki tek kapta (`.seritler`, kabuk ızgarasının 2. satırı) alt alta durur. Kabın toplam yüksekliği `--serit-yukseklik` CSS değişkenine yazılır; kurula açılır pencereler ve dar ekranda kayan ray ikisi birden açıkken de şeritlerin altından başlar.

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
| DELETE | `/api/ajanlar/:aid?devralan=<aid>` | — | `{tamam:true}` (kurulun işten çıkarması: oturum kapanır, açık görevleri, sözleri ve defteri devralana, verilmezse yöneticisine geçer; kimlik dosyası silinir, çalışma alanı aşağıdaki kurala göre kaldırılır) |
| POST | `/api/ajanlar/:aid/baslat` | `AjanBaslatIstegi` | `Ajan` |
| POST | `/api/ajanlar/:aid/mesaj` | `AjanMesajIstegi` | `{tamam:true}` (oturum kapalıysa açılır) |
| POST | `/api/ajanlar/:aid/kes` | — | `{tamam:true}` |
| POST | `/api/ajanlar/:aid/durdur` | — | `Ajan` (oturumu kapatır, oturum kimliği saklanır) |
| POST | `/api/ajanlar/:aid/mod` | `{mod: IzinModu}` | `Ajan` |
| POST | `/api/ajanlar/:aid/model` | `{model: ModelAdi}` | `Ajan` |
| GET | `/api/ajanlar/:aid/akis?sinir=300` | — | `AkisOgesi[]` (eskiden yeniye) |

Ajan oturumu kurallarla açılır: temiz ortam, kendi worktree'si (`arnorg/<ajan>` dalı), Claude Code sistem talimatı + rol metni, `PreToolUse` denetim kapısı, ArnOrg MCP araçları (`mcp__arnorg__*`).

**Çalışma alanı temizliği (0.0.4).** Ajan işten çıkarılınca worktree'si `git worktree remove` ile kaldırılır; `arnorg/<ajan>` dalı ve commit'leri kalır. Commit'lenmemiş değişiklik (izlenmeyen dosya dahil, yok sayılanlar hariç) varsa ya da kaldırma başarısız olursa alana dokunulmaz; #genel'e ArnOrg adıyla ve kurula `bildirim` (uyarı) olarak kısa not düşülür. Repoya kayıtlı olmayan klasöre hiç dokunulmaz. Çekirdek açılırken, proje bağlanırken ve bir worktree açılmadan önce `git worktree prune` ile klasörü elle silinmiş bayat kayıtlar temizlenir.

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
| POST | `/api/projeler/:pid/kanallar` | `KanalOlusturIstegi` `{ad, aciklama?, uyeler}` | `Kanal`; aynı ad ya da ArnOrg'un kanal adı 409, geçersiz ad ya da üye 400 |
| PATCH | `/api/projeler/:pid/kanallar/:kanal` | `KanalGuncelleIstegi` `{aciklama?, uyeler?}` | `Kanal` |
| DELETE | `/api/projeler/:pid/kanallar/:kanal` | — | `{tamam}`; kanal mesajlarıyla silinir |
| POST | `/api/projeler/:pid/kanallar/:kanal/konusma` | `KonusmaIstegi` `{islem: "baslat" \| "durdur", konu?}` | `Kanal`; iki üyeden az 409, abonelik sınırında 429 |

Kurul mesajında `@Ad` ile anılan ajan uyanır ve mesajı alır. `#genel` kanalına anma olmadan yazılan mesaj CEO'ya gider. Varsayılan kanallar: `genel`, `muhendislik`. Stüdyo `#yonetim`'i (kurul ile CEO'nun bire bir sohbeti) Kanallar ekranında göstermez; o sohbet Karargâh'tadır.

**Kurulun kanalları (0.0.5).** Kurul kanal kurar (`ozel: true`), çalışanları üye yapar. Ad mesaj gönderirken geçerli olan desene uyar (küçük harf, `^[\p{L}\p{N}_-]{1,40}$`; boşluklar tireye döner); sistem kanallarının kimlikleri ve İngilizce görünen adları (`general`, `ceo`, `engineering`, `meetings`) alınamaz. Üyeler yalnız o projenin ajanlarıdır; işten çıkarılan ajan üyeliklerden düşer. Düzenleme ve silme yalnız kurulun kanallarında yapılır (diğerleri 409). `Kanal` bu kanallarda ayrıca `uyeler`, `konusma` (`suruyor` | `durdu`), `konu`, `konusmaBaslangic` ve `olusturma` taşır. Değişiklikler `kanal.guncellendi` ve `kanal.silindi` olaylarıyla yayınlanır.

**Serbest konuşma.** Konuşma tek konuşmacılıdır: her mesajdan sonra sıradaki **tek** üye 1,5–3 sn beklemeyle uyandırılır (bu sırada kanalda "yazıyor" görünür); kanalda aynı anda en çok bir bekleyen konuşmacı olur.

- Sıradaki üye: mesajda `@` ile anılan üye (gönderen hariç); anılan yoksa üye listesinde gönderenden sonraki üye (döngüsel). Üye olmayan ajan da kanala yazabilir ama sıra yalnız üyeler arasında döner.
- Kurul kanala yazınca anılan üyeler, anılan yoksa son konuşan üyeden sonraki üye yanıt verir. Konuşma `durdu` ise yalnız bu yanıt gelir; `suruyor` ise her üye mesajından sonra sıradaki üye uyandırılır, tur sınırı yoktur ve kurul durdurana dek sürer.
- `baslat`'ta konu verilirse kanala kurulun mesajı olarak yazılır ve ilk konuşmacıyı uyandırır; konu yoksa son mesajlardan devam edilir. `durdur` bekleyen uyandırmayı iptal eder; o an yanıt yazan üye mesajını bitirir ama zincir sürmez.
- Uyandırma metni kanalı, konuyu, üyeleri ve son 10 mesajı verir; yanıtın `mesaj_gonder` ile o kanala yazılmasını, söz vermek için yalnız kanalın üyelerinin `@Ad` ile anılmasını, işi olan üyenin işine dönmeden önce yalnız bir mesaj yazmasını, işi olmayanın yanıtından sonra durmasını ister. Konuşma turu ArnOrg kaynaklıdır: döngü korumasına takılmaz, eşzamanlı ajan tavanına uyar (tavan doluysa konuşmacı sıraya girer ve beklenir); kurulun mesajına yanıt kurul kaynaklıdır.
- Üye uyanamazsa, oturumu hata verirse ya da 4 dk içinde kanala yazmazsa sıradakine geçilir; turu kanala yazmadan biterse (kuyrukta başka turu yoksa) 15 sn sonra geçilir. Üyelerin hepsi art arda yanıt vermezse, iki üyeden aza düşülürse ya da abonelik sınırına gelinirse konuşma kendiliğinden durur ve kanala kısa bir ArnOrg duyurusu düşer.
- Mesaiyi durdur, projenin silinmesi ve ArnOrg'un kapanması konuşmaları durdurur; açılışta bütün konuşmalar `durdu` başlar.

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
| GET | `/api/projeler/:pid/denetim/disa-aktar?karar=&ajan=&q=` | — | JSONL (`application/x-ndjson`): satır başına bir `DenetimKaydi`, eskiden yeniye; `Content-Disposition: attachment; filename="arnorg-denetim-<proje>-<YYYY-AA-GG>.jsonl"`. Süzgeç Denetim ekranınınkiyle aynıdır: `karar` (`izin` \| `ret` \| `sor` \| `degisti`), `ajan` (ajan kimliği), `q` (araç, girdi, kural ve nedende Türkçe harf duyarsız arama). Tablodaki bütün kayıtlara uygulanır, ekranda yüklü 300 kayıtla sınırlı değildir. Geçersiz `karar` 400 |
| GET | `/api/projeler/:pid/politika` | — | `PolitikaKurali[]` |
| PUT | `/api/projeler/:pid/politika` | `PolitikaKurali[]` | `PolitikaKurali[]` |
| GET | `/api/projeler/:pid/onaylar?durum=bekliyor` | — | `Onay[]` (yeniden eskiye) |
| POST | `/api/onaylar/:oid` | `OnayKararIstegi` | `Onay` |

`arac` türündeki onay, bir ajanın araç çağrısını bekletir; süre dolarsa `zaman_asimi` olur ve çağrı reddedilir. `ise_alim` onayı CEO'nun teklifidir; onaylanınca ajan oluşturulur.

**Saklama ve arşiv (0.0.4).** `Ayarlar.denetimSaklamaGun` günden (varsayılan 90) eski denetim kayıtları, bütün projeler için, veri dizinindeki `arsiv/denetim-<yıl>-<ay>.jsonl` dosyalarına (kaydın UTC ayına göre, dışa aktarımla aynı biçimde) eklenir ve tablodan silinir. Çekirdek açılışta (birkaç saniye sonra) ve sonra günde bir arşivler; süre ayarı değişince sıradaki bakışta (en geç 15 dakika) arşivler. Önce dosyaya yazılır, sonra silinir; dosya yazılamazsa kayıt tabloda kalır. `0` süresiz demektir, hiçbir kayıt taşınmaz. Dışa aktarım ucu yalnız tablodakileri verir; arşivdekiler bu dosyalardadır.

`DenetimKaydi.altAjan` (0.0.4): çağrıyı ajanın Agent (Task) aracıyla açtığı bir alt ajan yaptıysa Claude Code'un verdiği alt ajan kimliği (`PreToolUse` kancasında `agent_id`, izin sorusunda `agentID`); ana ajanın kendi çağrısında ve 0.0.4 öncesi kayıtlarda `null`. Stüdyo bu kayıtları ajan adının yanında "alt ajan" etiketiyle gösterir.

## Kalite kapısı ve birleştirme kuyruğu

Onaylanan birleştirme (kurulun ya da otomatik onayın verdiği) hemen ana dala girmez, projenin birleştirme kuyruğuna girer. Kuyruk proje başına sıralıdır (FIFO); aynı anda tek birleştirme işlenir. Kodu `paketler/cekirdek/src/birlestirme-kuyrugu.ts` ve `kalite-kapisi.ts`.

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/projeler/:pid/kalite-onerisi` | — | `KaliteOnerisi`: proje kökündeki `package.json`'da gerçek bir `test` betiği varsa `npm test`, hazırlık için `npm ci` (kilit dosyası yoksa `npm install`); npm init'in "no test specified" betiği sayılmaz. Stüdyo tek tıkla doldurur, kendiliğinden yazmaz |
| POST | `/api/onaylar/:oid/birlestir` | `{testsiz: boolean}` | `Onay`: yalnız son sonuç `test_basarisiz`, `zaman_asimi` ya da `hata` iken; `testsiz: true` testsiz birleştirir, `false` kapıdan yeniden geçirir. Başka durumda 409 |
| GET | `/api/onaylar/:oid/fark` | — | `FarkSonucu`: dalın hedefe göre farkı (kuyruğa giren commit'in ortak atadan bu yana değişiklikleri; birleştikten sonra birleşmeden önceki hedefe göre) |

**Proje alanları** (`Proje`; `PATCH /api/projeler/:pid` ile değişir): `testKomutu` (null ise yalnız birleşebilirlik denetlenir), `hazirlikKomutu` (testten önce koşar, ör. `npm ci`), `testZamanAsimiDk` (1–240, varsayılan 20; hazırlık ve testin toplamı). Komut tek satırdır, boş metin kaldırır. Komut değişince #genel'e duyurulur; ajan talimatı ve `birlestirme_iste` açıklaması test komutunu anar.

**Akış:**

1. Proje başına kalıcı bir kalite çalışma alanı (git worktree, `<veri>/kalite/<proje kimliği>`) hedef dalın (`varsayilanDal`) son commit'ine ayrık (detached) getirilir, `git reset --hard` ve `git clean -fd` ile temizlenir; yoksayılan dosyalar (node_modules) korunur.
2. Dal, kuyruğa girdiği andaki commit'iyle `git merge --no-ff --no-commit` ile denenir. Çakışmada geri alınır, sonuç `cakisma` olur ve dal sahibine çakışma mesajı gider.
3. Hazırlık ve test komutu kabukla, ajanlarınkiyle aynı temiz ortamla (API anahtarları geçmez; `CI=true`, renksiz), kalite alanında, `testZamanAsimiDk` sınırıyla koşar. Zaman aşımında süreç ağacı öldürülür (Windows'ta `taskkill /T /F`, Linux ve macOS'ta süreç grubu). Çıktının son 300 satırı (en çok 64 KB) saklanır.
4. Geçerse birleştirme ana repoda bugünkü denetimlerle yapılır (ana repo hedef dalda ve temiz olmalı). Test sürerken hedef dal ArnOrg kayıtları (`.arnorg/`) dışında ilerlediyse iş yeniden test edilir (en çok 3 deneme).
5. Test başarısız olur ya da zaman aşımına uğrarsa birleştirilmez: dal sahibine (yoksa isteyene) çıktının sonuyla "düzelt ve yeniden birlestirme_iste" mesajı gider, #genel'e yazılır, kurula `bildirim` (uyarı) gelir. Kurul kartta "Yine de birleştir" (ikinci adımda onaylatılır) ya da "Yeniden dene" seçebilir.

**Durum** onayın `veri.kalite` alanında (`BirlestirmeKalitesi`) tutulur: `durum` (`kuyrukta` → `hazirlik` → `test` → `birlesti`; ya da `cakisma`, `test_basarisiz`, `zaman_asimi`, `hata`), kuyruktayken `sira` (işlenen iş 1. sıradadır), `dalCommit`, `hedefCommit`, `komut`, `deneme`, `baslangic`, `adimBaslangic`, `bitis`, `sureMs`, `cikti`, `mesaj`, `testYok`, `testsiz`. Her adımda, test sürerken en sık 2 saniyede bir çıktıyla, aynı onay `onay.sonuc` olayıyla yeniden yayınlanır. Uygulama yeniden açılınca `kuyrukta`, `hazirlik` ya da `test` durumunda kalan işler sırasıyla yeniden kuyruğa girer. Gözetmen, kalite kapısında işi süren dalın sahibini dürtmez.

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

**Okuma sıklığı (0.0.4).** Kullanım dönemsel olarak yalnız gerektiğinde okunur: en az bir Stüdyo WebSocket istemcisi (`/ws`) bağlıyken, açık bir ajan oturumu varken ya da abonelik sınırında bekleyen ajan varken; sınır aşıkken 2, değilken 5 dakikada bir. Kimse beklemese de aşılan sınırın sıfırlanma anı geçince bir kez okunur (an bilinmiyorsa sınır sürdükçe), eski sınır işleri boşuna durdurmasın. Stüdyo bağlanınca son okuma bayatsa hemen okunur. Stüdyo kapalıyken ve ajan çalışmıyorken Claude Code süreci açılmaz. `GET /api/hesap?tazele=1` her zaman okur.

Eski sürümden gelen veritabanında token sayıları `kullanim` tablosuna taşınır; API kipine ait tutar, bütçe ve bütçe onayı kayıtları silinir. Ayarlar dosyasındaki eski `girisYontemi` ve `gunlukButceUsd` alanları okunmaz, ilk kayıtta dosyadan düşer.

Token: sonuç mesajındaki `modelUsage` toplamı (girdi + çıktı + önbellek yazımı; önbellekten okuma hariç). Sürdürülen oturumda Claude Code toplamı önceki turlardan devam ettirdiği için oturum başına son toplam saklanır, yalnız fark sayılır.

## Çalışma düzeni: eşzamanlı tavan, açılışta sürdürme, görev ve tur tavanı

0.0.4 ile `Ayarlar`'a gelenler (Stüdyo'da Ayarlar › Çalışma düzeni):

| Alan | Varsayılan | Anlamı |
|---|---|---|
| `esZamanliAjan` | 3 | Bütün projelerde aynı anda tur işleyen en çok ajan; 0 sınırsız (0–50) |
| `acilistaSurdur` | `true` | ArnOrg yeniden açılınca yarım kalan ajanlar kaldıkları yerden sürer |
| `gorevTokenTavani` | 2000000 | Bir görevin işleyebileceği token; aşılınca ajan durur, kurula sorulur. 0 kapalı |

| Yöntem | Yol | Yanıt |
|---|---|---|
| POST | `/api/projeler/:pid/durdur` | `{tamam:true}`: Mesaiyi durdur. Projenin bütün oturumları kapanır, sıradaki mesajlar düşer, durdurulan ajanlar açılışta uyanmaz |

- **Eşzamanlı tavan ve sıra:** durumu `calisiyor` ya da `karar_bekliyor` olan ajan çalışan sayılır. Turu sürmeyen ajana mesaj gelince çalışan sayısı tavandaysa (ya da önünde bekleyen varsa) mesaj sıraya girer (FIFO); çağıran hata almaz. Ajanın `isAciklamasi` "Sırada: aynı anda en çok N ajan çalışır" olur ve `proje.guncellendi` yayınlanır. Bir ajan çalışan durumdan çıkınca (`bosta`, `kapali`, `hata`, `duraklatildi`) sıradakiler tavan izin verdikçe teslim edilir; aynı ajanın mesajları geliş sırasıyla birlikte gider. Turu süren ajana gelen mesaj doğrudan iletilir. Kurulun mesajı ve yanıt bekleyen sorunun sorulan ajanı (`ajana_sor`, toplantı) muaftır: soran beklerken çalışan sayılır, sorulan sırada kalsa ikisi kilitlenirdi. Teslim anında abonelik sınırı varsa mesaj sınırda bekleyenlere eklenir. Tıkanma koruması sıradaki ajanı dürtmez.
- **Açılışta mesaiye dönüş:** çekirdek kapanırken (oturumlar kapanmadan önce) çalışan ajanları, sıradakileri, abonelik ve giriş bekleyenleri anahtar-değer kaydına yazar; kurulun durdurduğu oturum yazılmaz. Çökmede kayıt güncellenmez ama veritabanında çalışan durumda kalan ajanlar durumlar sıfırlanmadan okunur; açılış kümesi ikisinin birleşimidir. `acilistaSurdur` açıksa açılıştan ~30 sn sonra bu ajanlar eşzamanlı tavana uyarak "ArnOrg yeniden başlatıldı; yarım kalan işine kaldığın yerden devam et" mesajıyla uyandırılır; saklı oturum kimliğiyle aynı konuşma sürer. Abonelik sınırındaysa sessizce sınırda bekleyenlere eklenir. Mesaiyi durdur ve ajanın tek tek durdurulması kaydı temizler.
- **Görev token tavanı:** ajanın işlediği token (`kullanim` ile aynı ölçü) o anki görevine (`Ajan.gorevId`, ajana atanmış ve bitmemiş görev) eklenir; tur sürerken asistan mesajlarındaki kullanımla da denetlenir. Toplam görevin tavanını (kurulun yükselttiği tavan, yoksa `gorevTokenTavani`) aşınca tur kesilir, ajan `duraklatildi` ("Görev token tavanı aşıldı") olur ve kurula `genel` onay açılır: başlık "T-12 görevi token tavanını aştı (2,1 M / 2 M). Sürsün mü?", veri `GorevTavaniOnayVerisi` (`altTur: "gorev_token_tavani"`, `gorevId`, `gorevKodu`, `toplam`, `tavan`, `yeniTavan`). Karar beklerken denetim kapısı iş araçlarını "Görev token tavanı" kuralıyla reddeder (ArnOrg araçları açık), ajana gelen mesajlar tutulur; kurulun mesajı ve soru yanıtı geçer. Onaylanırsa görevin tavanı bir kat artar (2 M → 4 M) ve ajan tutulan mesajlarla kaldığı yerden sürer; reddedilirse ajan durur, yöneticisine (yoksa CEO'ya) görevi bölmesi ya da yeniden planlaması için sistem mesajı gider.
- **Tur tavanı ve yedek model:** oturum `maxTurns: 200` ile açılır. Claude Code akış kipinde bu sayaç her kullanıcı turunda sıfırlanır (tek turdaki API gidiş-dönüşü), uzun yaşayan oturumu durdurmaz. `error_max_turns` sonucunda ajan boşa çıkar, akışa not düşülür, yöneticisine sistem mesajı gider. `fallbackModel` birincil model aşırı yüklü ya da erişilemezken kullanılır: fable → opus, opus → sonnet, sonnet → haiku, haiku için yok (tam kimlikte, ör. `claude-fable-5-1`, aile adına bakılır); `ARNORG_MODEL_ZORLA` ile zorlanan model birincil sayılır (SDK yedeğin birincille aynı olmasını kabul etmez).

## Model kataloğu (0.0.5)

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/api/modeller` | `ModelKatalogu`: `modeller` (`ModelBilgisi`: `deger` takma ad, sürümlü `ad` ör. "Fable 5.1", tam `kimlik` ör. `claude-fable-5-1`, kısa `aciklama`), `kaynak` (`claude`, `onbellek` ya da `yedek`), `guncelleme` |

- Çekirdek açılıştan birkaç saniye sonra ve Claude Code'un kurulumu ya da girişi değişince (`kurulum.durum`, `hesap.guncellendi`) desteklenen modelleri Claude Code'a mesaj göndermeden sorar (SDK `supportedModels()`; token harcanmaz, 30 sn zaman aşımı, hata yutulur). `default` satırı atılır. Sonuç anahtar-değer kaydında (`model-katalogu`) saklanır ve sonraki açılışta önce o gösterilir; hiç okunamadıysa sabit yedek liste döner. Katalog değişince projesiz `modeller.guncellendi` olayı (`katalog`) her istemciye gider.
- `ModelAdi`: `fable`, `opus`, `sonnet`, `haiku` ya da tam model kimliği. CEO'nun varsayılan modeli `fable`. İşe alımda (ilk kurulumdaki CEO dahil) model verilmemişse rolün modeli kullanılır; hesabın kataloğunda yoksa zincirde bir sonrakine düşülür: fable → opus → sonnet → haiku. Var olan ajanların modeli kendiliğinden değişmez. `ARNORG_MODEL_ZORLA` oturumları zorlanan modelle açar, kayıtlı model değişmez.

## CEO brifingi (0.0.5)

| Yöntem | Yol | Yanıt |
|---|---|---|
| POST | `/api/projeler/:pid/brifing` | `BrifingYaniti`: `{durum: "istendi"}`; CEO önceki brifingi henüz yazmadıysa `{durum: "hazirlaniyor"}` |

- Çekirdek son brifingden bu yana olanları (ilk brifingde son 7 gün) depodan derler, model çağırmaz: biten görevler (kod, başlık, kim), sürenler (kim, ne kadar zamandır), bekleyen ve bloklu görevler, kurulun kararını bekleyen onaylar (tür, başlık), birleşen dallar ve kalite kapısı sonuçları, ekipteki değişiklikler, abonelik pencereleri. CEO bu veriyle kurul kaynağıyla uyandırılır (eşzamanlı tavandan muaf) ve brifingi `mesaj_gonder` ile #yonetim'e dört bölümle yazar: Yaptıklarımız / Şu an / Sıradaki / Kararınızı bekleyen (`BRIFING_BOLUMLERI`). Beklerken #yonetim'de CEO için `kanal.yaziyor` yayınlanır.
- Projede CEO yoksa 409. CEO brifingi yazana dek (dört bölümden en az üçünü başlık satırı olarak taşıyan mesaj) ya da, boştayken uyandırıldıysa, o tur bitene dek, en çok 5 dakika, aynı projedeki yeni istek CEO'yu yeniden uyandırmaz, `hazirlaniyor` döner. CEO başka bir turun ortasındayken yazdığı ilgisiz mesaj isteği kapatmaz. CEO uyandırılamazsa (ör. oturumsuz kipte 503) hata döner, yazıyor göstergesi biter ve veri aralığı ilerlemez.
- **Günlük brifing:** `Ayarlar.gunlukBrifing: {acik, saat}`, varsayılan `{acik: true, saat: "09:00"}` (yerel saat, `SS:DD`; geçersiz saat 400). Çekirdek dakikada bir bakar: saat geçtiyse ve o gün verilmediyse her uygun projede CEO'dan "günlük brifing" ister; ArnOrg o saatte kapalıysa açılınca aynı gün içinde verir. Son brifingden bu yana görev, onay ya da mesaj hareketi yoksa (ArnOrg duyuruları ve önceki brifingin kendisi sayılmaz) o gün atlanır. CEO'suz, hazırlık görüşmesi süren ya da o günün saatinden sonra açılan projede o gün istenmez; klasörüne erişilemeyen proje ve abonelik sınırı aşıkken beklenir. CEO uyandırılamazsa kurula uyarı `bildirim`i gider, aynı gün yeniden denenmez.

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

## Web ve araştırma (0.0.5)

Ajanların web araması ve sayfa okuyucusu çekirdeğin içinde çalışır; ayrı sunucu ya da API anahtarı gerekmez.

| Yöntem | Yol | Gövde | Yanıt |
|---|---|---|---|
| GET | `/api/yetenekler` | — | `Yetenek[]` (katalog: kimlik, ad, açıklama, açtığı araçlar) |
| GET | `/api/yetenekler/roller` | — | `Record<rol, YetenekKimligi[]>` (rol varsayılanları) |
| GET | `/api/web/durum` | — | `WebDurumu` (motor başına etkin, askıda, son hata, başarı ve hata sayısı; SearXNG adresi; önbellek) |
| POST | `/api/web/ara` | `WebAramaIstegi` (`sorgu`, `kategori?`: `genel` \| `kod` \| `haber` \| `bilim`, `sayfa?`, `dil?`) | `WebAramaYaniti` |
| POST | `/api/web/oku` | `WebOkumaIstegi` (`adres`, `baslangic?`, `uzunluk?`, `baglantilar?`) | `WebOkumaSonucu` |
| POST | `/api/web/askilari-kaldir` | — | `WebDurumu` (askıdaki motorlar bir sonraki aramada yeniden denenir) |

- **Ajanın yetenekleri:** `Ajan.yetenekler` (`YetenekKimligi[]`), `PATCH /api/ajanlar/:aid` gövdesinde `yetenekler` ile değişir (bilinmeyen kimlik 400). `web_arama` → `web_ara`, `web_okuma` → `web_oku`, `arastirma` → `arastirma_kaydet`, `paket_bilgisi` → `paket_bilgisi`, `github_arastirma` → `github_ara`, `claude_web` → Claude Code'un `WebSearch` ve `WebFetch` araçları. İşe alınan ajan rolünün varsayılanlarını alır (`web_arama` ve `web_okuma` herkeste); var olan ajanlara geçişte rol varsayılanları yazılır. Araç listesi ve talimat oturum açılırken kurulur: kapatılan yeteneğin aracı açık oturumda da denetim kapısında hemen reddedilir (`kural: "Yetenek kapalı"`), açılan yeteneğin araçları ajanın bir sonraki oturumunda gelir.
- **Ayarlar:** `Ayarlar.web` = `{searxngAdresi, disOkuyucu, kapaliMotorlar}`, `PUT /api/ayarlar` ile kısmi verilebilir. `searxngAdresi` doluysa `<adres>/search?format=json` de sorgulanır (SearXNG'de json biçimi açık olmalı). `disOkuyucu` (varsayılan açık) r.jina.ai yedeğini açar. `kapaliMotorlar`: `bing`, `duckduckgo`, `brave`, `mojeek`, `wikipedia`, `bing_haber`, `stackoverflow`, `github`, `npm`, `mdn`, `hackernews`, `arxiv`, `searxng`.
- **Arama:** kategorinin motorları paralel sorgulanır (motor başına 6 sn). Puan Σ ağırlık/sıra; aynı adres (izleme parametreleri, `www` ve sondaki `/` atılarak) birleşir ve hangi motorlardan geldiği yazılır. `kod` teknik kaynaklarla genel motorları, `haber` Bing Haberler ve Hacker News'i, `bilim` arXiv, Wikipedia ve genel motorları sorgular. Genel motorların sorguyla ilgisiz sonuçları ayıklanır. 429 alan motor 10 dakika, 403, CAPTCHA ya da bot doğrulaması dönen motor 1 saat sorgulanmaz; zaman aşımı ve ağ hatasında kısa geri çekilme olur. Bir motorun düşmesi aramayı bozmaz. Sonuçlar 10 dakika önbellekte kalır; aynı anda gelen aynı arama bir kez yapılır. GitHub, `gh` girişi varsa onun belirteciyle sorgulanır.
- **Okuma:** yalnız `http` ve `https` (`file:`, `data:` reddedilir; localhost ve yerel ağ okunur). Yönlendirmeler izlenir; 15 sn ve 5 MB sınırı (PDF 20 MB). HTML Readability ile ayıklanıp Markdown'a çevrilir (tablo ve kod blokları korunur); PDF sayfa sayfa metin, JSON biçimlenmiş, düz metin ve Markdown olduğu gibi gelir, görselden yalnız bilgi döner. GitHub `blob` adresi ham dosyaya, depo kökü README'ye, npm paket sayfası kayıt defterindeki README'ye çevrilir. Uzun içerik `baslangic` ve `uzunluk` (varsayılan 12000) ile parça parça gelir (`toplam`, `devamVar`, `sonraki`). Yerelde 500 karakterden az metin çıkarsa ya da site 401, 403, 429 veya 503 dönerse ve `disOkuyucu` açıksa r.jina.ai denenir (`kaynak: "jina"`); yerel ağ adresleri hiç gönderilmez. Sayfalar 30 dakika önbellekte kalır.

Ajan araçları (`mcp__arnorg__*`, her çağrı denetim kaydına düşer):

| Araç | Ne yapar |
|---|---|
| `web_ara` | `{sorgu, kategori?, sayfa?, dil?}` meta arama |
| `web_oku` | `{adres, baslangic?, uzunluk?, baglantilar?}` sayfayı, PDF'i ya da JSON'u Markdown olarak okur |
| `arastirma_kaydet` | `{baslik, ozet, bulgular, kaynaklar: [{adres, baslik}]}` notu `notlar/arastirma/<tarih>-<slug>.md` olarak yazar, özetini proje hafızasına ekler ve yolu döner |
| `paket_bilgisi` | `{ad, ekosistem: npm \| pypi \| crates}` son sürüm, lisans, indirme sayısı, depo |
| `github_ara` | `{sorgu, tur: repo \| issue \| kod, sayfa?}` GitHub araması (kod araması `gh` girişi ister) |

Rol `arastirmaci` (Araştırmacı, varsayılan model sonnet) bütün web yetenekleriyle başlar; kod yazmaz, kaynaklı araştırma notu yazar.

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

- **Otomatik onay:** projede `otomatikOnay.etkin` açıkken türü `otomatikOnay.turler` içinde olan onaylar bekletilmeden verilir ve "Otomatik onay" notuyla kaydedilir; açıldığı anda bekleyen uygun onaylar da verilir. Varsayılan türler: `arac`, `ise_alim`, `anayasa`, `isten_cikarma` (`birlestirme`, `genel` ve `teslim` kurulun kendisine kalır). 0.0.4'te `birlestirme` varsayılandan çıktı; projede kaydedilmiş bir seçim varsa olduğu gibi kalır.
- **İşten çıkarma:** CEO ya da CTO `isten_cikar_teklif` ile gerekçe ve devralanla önerir; kurul onaylarsa işler, sözler ve defter devralana geçer.
- **Teslim:** CEO `teslim_et` ile test adımlarını, çalıştırma komutunu ve adresi verir (`teslim` türünde onay). Kurul test edip kabul eder ya da geri bildirim yazar; geri bildirim CEO'ya iş olarak döner.
- **Kurula bildirim:** yeni onay, CEO önerisi, istek, yetki ve teslim `kurul.bildirimi` olayıyla gelir; Stüdyo her ekranda açılır pencere, pencere arkadaysa masaüstü bildirimi gösterir. `KurulBildirimi.eylem` doluysa pencerede ona özel bir düğme çıkar: `claude_giris` Claude Code giriş asistanını açar.
- **Kanal olayları:** `kanal.yaziyor` (ajan bir kanala yazarken ya da serbest konuşmada sırası geldiğinde; yazıyor göstergesi), `kanal.guncellendi` (`{projeId, kanal}`: kurulun kanalı kuruldu, üyeleri ya da konuşma durumu değişti), `kanal.silindi` (`{projeId, kanal}`).

## Rapor ve tıkanma koruması

| Yöntem | Yol | Yanıt |
|---|---|---|
| GET | `/api/projeler/:pid/rapor?gun=7` | `{baslik, yol, baslangic, markdown}` dönem raporu (1–90 gün) |
| POST | `/api/projeler/:pid/rapor?gun=7` | Aynı rapor; ayrıca notlara `raporlar/AAAA-AA-GG.md` olarak yazılır |

Çekirdek dakikada bir süren ve incelemedeki görevlere bakar. Sorumlusu `Ayarlar.tikanmaDakika` (varsayılan 20, 0 kapalı) boyunca hareketsiz kalan görevde önce sorumlu iki kez hatırlatılır, sonra yöneticisi (yoksa CEO) uyandırılır, en son #genel'e ArnOrg adıyla yazılır ve `bildirim` (uyarı) yayınlanır. Çalışan, karar bekleyen ya da duraklatılan ajan ve kurul onayındaki birleştirme dürtülmez; abonelik sınırındayken kimse dürtülmez. Görev güncellenince sayaç sıfırlanır.

## Canlı olaylar

`WS /ws?anahtar=<anahtar>`: sunucu `SunucuOlayi` JSON'ları gönderir. İstemci `{"tur":"abone","projeId":"…"}` gönderince yalnız o projenin olaylarını alır (`proje.guncellendi`, `hesap.guncellendi` ve projesiz `bildirim` her zaman gelir). Bağlantı açılınca ilk mesaj `{"tur":"merhaba"}`.
