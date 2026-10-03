# ArnOrg Stüdyo

ArnOrg'un React arayüzü. Çekirdeğe (`paketler/cekirdek`) [`docs/API.md`](../../docs/API.md) sözleşmesiyle bağlanır; tipler `@arnorg/ortak` paketinden gelir. Electron penceresinde ya da tarayıcıda (sunucu modu) çalışır, çevrimdışı çalışır: yazı tipleri ve Kod ekranındaki VS Code tezgâhı (`@codingame/monaco-vscode-api`) yerel paketlerden yüklenir; yalnız eklenti galerisi (Open VSX) ağ ister.

## Çalıştırma

```sh
npm install                          # depo kökünde, bir kez

# Sahte çekirdek: bütün uçlar bellekte, örnek veri "Arnex Yazılım · Sipariş Paneli"
npm run sahte -w @arnorg/studyo      # http://127.0.0.1:47820/#anahtar=gelistirme

# Geliştirme sunucusu (Vite), /api ve /ws çekirdeğe vekillenir
npm run dev -w @arnorg/studyo        # http://localhost:5173/#anahtar=gelistirme

# Derleme: dist/ (sahte çekirdek ve gerçek çekirdek bu klasörü kökten sunar)
npm run build -w @arnorg/studyo
npm run typecheck -w @arnorg/studyo
```

- Sahte çekirdeğin portu ve anahtarı: `PORT=47820 ARNORG_ANAHTAR=gelistirme`.
- Vite vekilinin hedefi: `ARNORG_CEKIRDEK=http://127.0.0.1:47820`.
- Sahte çekirdek bağımlılıksızdır (`node:http` ve kendi WebSocket el sıkışması). Ajanlar kendi kendine çalışır: araç çağrıları, denetim kayıtları, kanal mesajları, Ece'nin liste ekranını canlı düzenlemesi ve süreli onay bekleyen araç çağrıları gelir. Terminal sahte bir kabuktur (`help`).

## Bağlantı

- Anahtar ilk açılışta adres parçasından (`#anahtar=…`) okunur, `sessionStorage`'a (`arnorg.anahtar`) yazılır ve adresten silinir. Anahtar yoksa ya da 401 dönerse "Bağlantı anahtarı gerekli" ekranı açılır.
- HTTP: `src/api/istek.ts` (`Authorization: Bearer`, `{hata}` metnini taşıyan `ApiHatasi`), uçlar `src/api/uclar.ts`.
- Canlı olaylar: `src/api/canli.ts`; üstel beklemeli yeniden bağlanma, projeye abonelik, yeniden bağlanınca veri tazelenir.
- Terminal: `POST terminaller` + `WS /ws/terminal/:id`, istemciden `{tur:"girdi"}` ve `{tur:"boyut"}` (`src/api/terminal.ts`; Kod ekranındaki VS Code terminal paneli bunu kullanır).
- Kod düzenleyici: `/fs` ve `/git` uçları `src/tezgah/kodApi.ts`.

## Yapı

```
src/
  api/          bağlantı katmanı
  durum/        zustand depoları: veri (projeler, etkin proje), arayüz (ekran, bildirim), olaylar (WS uygulayıcı)
  gorunumler/   ekranlar: Projeler, Karargah, Ekip, AjanOturumu, Pano, Kanallar, Notlar, Kod, Denetim, Onaylar, Ayarlar
  bilesenler/   paylaşılan bileşenler; ajan/, pano/, denetim/ alt klasörleri
  tezgah/       Kod ekranının VS Code tezgâhı: kurulum, arnorg: dosya sistemi, terminal, yerel ArnOrg eklentisi, FY teması
  stiller/      düz CSS: tokenlar, temel, kabuk, gorunumler, oturum, kod
  yardimcilar/  biçimler (para, saat, Türkçe ad ekleri), araç özetleri, kancalar
gelistirme/     sahte çekirdek ve örnek veri
```

## Kararlar

- Yönlendirici yok: ekran zustand'da tutulur ve `localStorage`'da hatırlanır; etkin proje de öyle.
- Kod ekranı VS Code'un kendi çalışma tezgâhıdır (`@codingame/monaco-vscode-api` 37.3.3; bütün `@codingame/monaco-vscode-*` paketleri aynı sürümde olmalı, `npm ls @codingame/monaco-vscode-api` tek sürüm göstermeli). İlk açılışta tembel yüklenir (ana paket küçük kalır), sayfa başına bir kez kurulur; başka ekrana geçince DOM'dan atılmaz, gizlenir ve son boyutunda dondurulur. Yerleşim ve açık düzenleyiciler IndexedDB'de kalıcıdır; proje değişince eski projenin düzenleyicileri hatırlanıp kapatılır, geri dönünce açılır.
- Tezgâh bir gölge kökte çalışır: Stüdyo'nun CSS'i tezgâha, tezgâhınki Stüdyo'ya karışmaz. VS Code CSS'leri Vite'ta `?inline` metin olarak alınır (`vite.config.ts`); yerleşik eklentilerin kaynak eşlemleri (~60 MB) pakete alınmaz.
- Türkçe dil paketi tezgâhın hiçbir modülünden önce yüklenir (`tezgah/index.ts` önce dil paketini, sonra `kurulum.ts`'i içe aktarır).
- Dosyalar `arnorg:/<projeId>/<alan>/<yol>` adresleriyle çekirdekten okunur (`tezgah/dosyaSistemi.ts`); her çalışma alanı (ana repo, her ajan worktree'si) bir köktür ve liste canlı güncellenir (`tezgah/calismaAlani.ts`). Çekirdeğin `dosya.degisti` olayları açık düzenleyiciyi yeniler; kaydedilmemiş değişiklik varsa VS Code'un kendi "diskteki dosya daha yeni" akışı çalışır.
- Ajanın düzenlediği dosya salt okunur gelir; durum çubuğunda "… düzenliyor", düzenleyici başlığında "Duraklat ve düzenle" görünür (`tezgah/eklenti.ts`, yerel ArnOrg eklentisi). Kaynak denetimi, hızlı açma ve "Dosyalarda bul" sağlayıcıları da bu eklentidedir; arama tarayıcıda dosya dolaşmaz, çekirdekte yapılır.
- VS Code kısayolları window üzerinde dinler; tezgâh gizliyken ya da odak Stüdyo'nun bir giriş alanındayken tuşlar tezgâha gitmez (`tezgah/klavye.ts`).
- TypeScript dil sunucusu proje çapında çalışır: sayfa çapraz köken yalıtımlıdır (COOP/COEP; çekirdek, sahte çekirdek ve Vite aynı başlıkları gönderir).
- Koyu renk düzeni (`color-scheme: dark`) kökte değil gövdededir: Chromium kökle uyuşmayan webview iframe'lerinin (Markdown önizleme) arkasını beyaz boyar.
- Dar ekranda (760 px altı) tezgâh yerine kısa bir not ve salt okunur dosya listesi gösterilir.
- Şirket adı API'de yok; üst çubuktaki ad Ayarlar > Bu tarayıcı'dan ayarlanır ve yalnız tarayıcıda saklanır.
