# ArnOrg

Claude Code ajanlarından kurulan bir yazılım şirketi. Projeyi siz açarsınız; CEO ajanı planı yazar, ekibi işe alır, işi dağıtır ve size rapor verir. Her ajanın her araç çağrısı ArnOrg'un denetiminden geçer.

- Windows ve Linux'ta çalışan masaüstü uygulaması + sunucu modu
- Proje başına notlar, kararlar ve ekip kimlikleri; repo içinde `.arnorg/` altında sürümlü
- Her ajan kendi git çalışma alanında; main'e yalnız kurulun onayladığı iş girer
- Kanallar, `@anma` ile uyandırma, görev panosu, bütçe ve onay kapıları
- Canlı denetim: politika (yıkıcı komut, gizli dosya, alan dışı yazma, dışarı push), araya girme, kesme
- Yerleşik kod editörü ve terminal

## Durum

Faz 0–2 çalışıyor: çekirdek, canlı denetim, CEO döngüsü (brief → işe alım teklifi → onay → görev → çalışan → inceleme → birleştirme onayı → main). Stüdyo arayüzü ve Electron kabuğu geliştiriliyor.

## Çalıştırma

Gerekenler: Node.js 22+, git, makinede çalışan bir Claude Code girişi (abonelik ya da API anahtarı). Windows'ta Git for Windows önerilir.

```bash
npm install
npm run build          # Stüdyo + çekirdek
npm run serve          # http://127.0.0.1:47820 — terminale erişim anahtarlı bağlantı yazılır
```

Geliştirme:

```bash
npm run dev            # çekirdek, değişiklikte yeniden başlar
npm run dev:studyo     # arayüz (Vite), /api ve /ws çekirdeğe yönlenir
npm test               # birim ve entegrasyon testleri (Claude çağırmaz)
```

Sunucu modu: `node paketler/cekirdek/dist/cli.js serve --host 0.0.0.0 --izinli-host arnorg.ornek.com --veri /var/lib/arnorg`. Dışarıya açarken önüne Cloudflare Access gibi bir kimlik katmanı koyun.

Deneme için tüm ajanları ucuz modelle çalıştırmak: `ARNORG_MODEL_ZORLA=haiku npm run serve`.

## Belgeler

- Plan: [`docs/ONIZLEME.md`](docs/ONIZLEME.md)
- API sözleşmesi: [`docs/API.md`](docs/API.md)
- Claude Code protokolleri ve denetim: [`docs/PROTOKOLLER.md`](docs/PROTOKOLLER.md)
- Gözcü denemesi: [`deneyler/gozcu`](deneyler/gozcu)
- Tıklanabilir maket: [`docs/onizleme.html`](docs/onizleme.html)

## Yapı

```
paketler/
  ortak/      Çekirdek ile Stüdyo arasındaki tipler
  cekirdek/   arnorg-server: ajan oturumları (Agent SDK), denetim kapısı, şirket, API
  studyo/     React arayüzü
  masaustu/   Electron kabuğu ve paketleme
```
