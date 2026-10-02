# ArnOrg Stüdyo

ArnOrg'un React arayüzü. Çekirdeğe (`paketler/cekirdek`) [`docs/API.md`](../../docs/API.md) sözleşmesiyle bağlanır; tipler `@arnorg/ortak` paketinden gelir. Electron penceresinde ya da tarayıcıda (sunucu modu) çalışır, çevrimdışı çalışır: yazı tipleri, Monaco ve xterm yerel paketlerden yüklenir.

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
- Terminal: `POST terminaller` + `WS /ws/terminal/:id`, istemciden `{tur:"girdi"}` ve `{tur:"boyut"}`.

## Yapı

```
src/
  api/          bağlantı katmanı
  durum/        zustand depoları: veri (projeler, etkin proje), arayüz (ekran, bildirim), olaylar (WS uygulayıcı)
  gorunumler/   ekranlar: Projeler, Karargah, Ekip, AjanOturumu, Pano, Kanallar, Notlar, Kod, Denetim, Onaylar, Ayarlar
  bilesenler/   paylaşılan bileşenler; ajan/, pano/, denetim/, kod/ alt klasörleri
  stiller/      düz CSS: tokenlar, temel, kabuk, gorunumler, oturum, kod
  yardimcilar/  biçimler (para, saat, Türkçe ad ekleri), araç özetleri, kancalar
gelistirme/     sahte çekirdek ve örnek veri
```

## Kararlar

- Yönlendirici yok: ekran zustand'da tutulur ve `localStorage`'da hatırlanır; etkin proje de öyle.
- Kod ekranı (Monaco + xterm) tembel yüklenir; ana paket küçük kalır.
- Monaco'da proje bağlamı (tsconfig, node_modules) olmadığından TypeScript anlamsal tanılaması kapalı, sözdizimi denetimi açık.
- "main ile fark" Monaco DiffEditor kullanmaz: çekirdek dosyanın main'deki tamamını değil, birleşik farkı verir. Fark ayrıştırılıp satır numaralı, vurgulu bir görünümde çizilir (`bilesenler/kod/fark.ts`).
- Ajan bir dosyayı değiştirince açık sekme kirli değilse yalnız değişen bölüm uygulanır (imleç yerinde kalır) ve satırlar ajanın adıyla kısa süre parlar; kirliyse çakışma uyarısı çıkar.
- Şirket adı API'de yok; üst çubuktaki ad Ayarlar > Bu tarayıcı'dan ayarlanır ve yalnız tarayıcıda saklanır.
