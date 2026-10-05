// Sahte çekirdeğin 0.0.7 "tanıtım" davranışları: Tanıtım alanı (GET /api/projeler/:pid/tanitim), kurulun güncelleme
// isteği (POST .../tanitim/guncelle), Tanıtım uzmanı rolü (rol kataloğu, yetenekler) ve ekipte Defne.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır (surum-005-*.mjs deseni)
//
// Sipariş Paneli'nin kök README.md'si gerçekçi bir vitrin sayfasıdır (repodaki ekran görüntüsüyle); Defne'nin
// çalışma alanında henüz birleşmemiş bir taslağı vardır. Arnex Web Sitesi'nde README ve uzman yoktur (boş durum).
// İstek Defne'ye gider: Defne stüdyoda birkaç saniye yazar, taslağı güncellenir, tanitim.degisti yayınlanır.
// Uzmanı olmayan projede istek #yonetim'e kurulun mesajı olarak yazılır; CEO bir Tanıtım uzmanı için işe alım
// teklifi açar (kurul kipinde Onaylar'dan onaylanınca, tam otonomda CEO'nun kendi kararıyla hemen ekibe katılır;
// surum-007-otonom.mjs). Kurul README.md'yi Kod ekranında kaydedince de olay gider.

import { ceviri } from "./dil.mjs";
import { V } from "./tohum.mjs";

const OFIS = "siparis-paneli";
const DOSYA = "README.md";
const GORSEL = "docs/ekran-siparisler.svg";
const UZMAN = "defne";
/** Çekirdekteki TANITIM_NOT_SINIRI */
const NOT_SINIRI = 2000;
/** Uzmanın taslağı yazma süresi (sahne) */
const YAZMA_MS = 4500;
/** CEO'nun yanıt süresi (sahne) */
const CEO_MS = 2500;

const ROL = {
  kimlik: "tanitim",
  ad: ceviri("Tanıtım uzmanı", "Product marketer"),
  aciklama: ceviri(
    "Projenin kök README.md'sini, kurulun Tanıtım alanında okuduğu vitrin sayfasını yazar; teslimlerden sonra güncel tutar. Kod yazmaz.",
    "Writes the project's root README.md, the showcase page the board reads in the Showcase area, and keeps it current after deliveries. Does not write code.",
  ),
  varsayilanModel: "sonnet",
  talimat: "",
  yonetici: false,
};
/** Çekirdekteki ROL_YETENEKLERI.tanitim (temel yetenekler dahil) */
const YETENEKLER = ["web_arama", "web_okuma", "github_arastirma", "claude_web"];

// ---------------------------------------------------------------------------
// Sipariş Paneli: README, taslak ve ekran görüntüsü
// ---------------------------------------------------------------------------

const YAYINDA = ceviri(
  `# Sipariş Paneli

Küçük işletmeler için sipariş, stok ve kargo takibini tek ekranda toplayan web paneli.

![Sipariş listesi ekranı](${GORSEL})

## Ne yapar, kimin için

Siparişi telefonla, e-postayla ya da pazar yerinden alıp takibini tablolarla yürüten küçük işletmeler için. Panel siparişi alındığı andan teslime kadar izler: kim verdi, ne durumda, hangi kargoda.

## Öne çıkanlar

- **Sipariş listesi:** durum rozetleri, imleçle sayfalama, boş ve hata durumları.
- **Sipariş API'si:** \`GET /siparisler\`, \`POST /siparisler\`, \`PATCH /siparisler/:id/durum\`; doğrulama hataları 422 döner.
- **Oturum açma:** e-posta ve parolayla giriş, kısa ömürlü erişim jetonu, tek kullanımlık yenileme jetonu.
- **Ürün kataloğu API'si:** \`GET /urunler\`, ofset sayfalama.

> Sipariş durum makinesi ve kargo entegrasyonu sırada; aşağıdaki [yol haritasına](#yol-haritası) bakın.

## Kurulum

Node.js 22 ya da üstü gerekir.

\`\`\`sh
npm install
npm run dev
\`\`\`

İstemci (Vite + React) ve API (Fastify) birlikte açılır. Testler vitest ile koşar:

\`\`\`sh
npm test
\`\`\`

## Yol haritası

- [x] Proje iskeleti, veritabanı şeması ve CI hattı (Windows ve Linux)
- [x] Tasarım sistemi: tablo, rozet, düğme ve form bileşenleri
- [ ] Sipariş API uç noktaları ve sipariş listesi ekranı (Sprint 3, sürüyor)
- [ ] Sipariş durum makinesi ve uçtan uca testler
- [ ] Kargo firması entegrasyonu ve bildirim e-postaları

## Katkı

Her iş kendi dalında yürür (\`arnorg/<ajan>/<görev>\`); \`main\`'e yalnız kurul onayıyla birleşir. Kurallar [CLAUDE.md](CLAUDE.md) dosyasında; \`npm test\` her zaman yeşil kalır.
`,
  `# Order Panel

A web panel that brings order, stock and shipping tracking for small businesses onto a single screen.

![The order list screen](${GORSEL})

## What it does, and for whom

For small businesses that take orders by phone, email or marketplace and track them in spreadsheets. The panel follows an order from the moment it arrives until delivery: who placed it, where it stands, which carrier has it.

## Highlights

- **Order list:** status badges, cursor pagination, empty and error states.
- **Orders API:** \`GET /siparisler\`, \`POST /siparisler\`, \`PATCH /siparisler/:id/durum\`; validation errors return 422.
- **Sign-in:** email and password, a short-lived access token and a single-use refresh token.
- **Product catalog API:** \`GET /urunler\` with offset pagination.

> The order status machine and the carrier integration are next; see the [roadmap](#roadmap) below.

## Setup

Requires Node.js 22 or later.

\`\`\`sh
npm install
npm run dev
\`\`\`

The client (Vite + React) and the API (Fastify) start together. Tests run on vitest:

\`\`\`sh
npm test
\`\`\`

## Roadmap

- [x] Project scaffold, database schema and CI (Windows and Linux)
- [x] Design system: table, badge, button and form components
- [ ] Order API endpoints and the order list screen (Sprint 3, in progress)
- [ ] Order status machine and end-to-end tests
- [ ] Carrier integration and notification emails

## Contributing

Every piece of work lives on its own branch (\`arnorg/<agent>/<task>\`) and reaches \`main\` only with board approval. The rules are in [CLAUDE.md](CLAUDE.md); \`npm test\` always stays green.
`,
);

/** Defne'nin taslağı: sipariş akışı bölümü eklendi, tanıtım cümlesi keskinleşti */
const TASLAK = ceviri(
  YAYINDA.replace(
    "Küçük işletmeler için sipariş, stok ve kargo takibini tek ekranda toplayan web paneli.",
    "Küçük işletmeler için sipariş, stok ve kargo takibi: siparişi aldığınız andan teslime kadar tek ekranda.",
  ).replace(
    "## Kurulum",
    `## Sipariş akışı

1. Sipariş oluşturulur: \`POST /siparisler\` müşteriyi, ürünleri ve tutarı alır.
2. Listede **Beklemede** rozetiyle görünür; liste imleçle sayfalanır.
3. Durum değişir: \`PATCH /siparisler/:id/durum\` ile Hazırlanıyor, Kargoda, Teslim edildi.

Durum geçişlerinin kuralları sipariş durum makinesiyle (T-25) gelecek; şimdilik geçişler API'de doğrulanır.

## Kurulum`,
  ),
  YAYINDA.replace(
    "A web panel that brings order, stock and shipping tracking for small businesses onto a single screen.",
    "Order, stock and shipping tracking for small businesses: from the moment an order arrives until delivery, on one screen.",
  ).replace(
    "## Setup",
    `## Order flow

1. An order is created: \`POST /siparisler\` takes the customer, the items and the amount.
2. It shows up in the list with a **Pending** badge; the list pages with a cursor.
3. Its status changes: \`PATCH /siparisler/:id/durum\` moves it to Preparing, Shipped, Delivered.

The rules for status transitions arrive with the order status machine (T-25); for now the API validates each transition.

## Setup`,
  ),
);

/** İkinci istekten sonra: sık sorulanlar eklenir */
const TASLAK_EKI = ceviri(
  `
## Sık sorulanlar

**Birden çok depo destekleniyor mu?** Henüz değil; ilk sürüm tek depo içindir.

**Kargo takibi nasıl çalışacak?** İlk aşamada tek kargo firmasıyla: gönderi kodu ve takip bağlantısı siparişe eklenir.
`,
  `
## FAQ

**Are multiple warehouses supported?** Not yet; the first release is for a single warehouse.

**How will shipment tracking work?** At first with a single carrier: the shipment code and tracking link are added to the order.
`,
);

/** Uzmanı sonradan işe alınan projenin (Arnex Web Sitesi) ilk taslağı */
const ILK_TASLAK = ceviri(
  `# Arnex Web Sitesi

Arnex'i anlatan, hızlı ve sade bir tanıtım sitesi.

## Ne var

- Astro ile statik sayfalar ve içerik koleksiyonları.
- Vizyon ve mimari notları \`.arnorg/notlar/\` altında.

## Kurulum

\`\`\`sh
npm install
npm run dev
\`\`\`

## Yol haritası

- [ ] Site iskeleti ve içerik yapısı (T-1)
`,
  `# Arnex Website

A fast, simple website that tells the Arnex story.

## What's there

- Static pages and content collections with Astro.
- Vision and architecture notes under \`.arnorg/notlar/\`.

## Setup

\`\`\`sh
npm install
npm run dev
\`\`\`

## Roadmap

- [ ] Site scaffold and content structure (T-1)
`,
);

/** Sipariş listesi ekranının görüntüsü (ürünün kendi açık teması) */
function ekranGoruntusu() {
  const m = ceviri(
    {
      urun: "Sipariş Paneli",
      menu: ["Siparişler", "Ürünler", "Müşteriler", "Kargo"],
      baslik: "Siparişler",
      alt: "Son 7 gün · 6 sipariş",
      sutunlar: ["No", "Müşteri", "Durum", "Tutar"],
      durumlar: { b: "Beklemede", h: "Hazırlanıyor", k: "Kargoda", t: "Teslim edildi" },
      satirlar: [
        ["#1048", "Ayşe Demir", "b", "₺1.240,00"],
        ["#1047", "Kuzey Kırtasiye", "h", "₺3.860,50"],
        ["#1046", "Mert Aksoy", "k", "₺749,90"],
        ["#1045", "Bahar Çiçekçilik", "t", "₺2.115,00"],
        ["#1044", "Can Yılmaz", "k", "₺389,00"],
        ["#1043", "Deniz Fırın", "t", "₺1.560,00"],
      ],
      sonraki: "Sonraki sayfa",
      yeni: "Yeni sipariş",
    },
    {
      urun: "Order Panel",
      menu: ["Orders", "Products", "Customers", "Shipping"],
      baslik: "Orders",
      alt: "Last 7 days · 6 orders",
      sutunlar: ["No.", "Customer", "Status", "Amount"],
      durumlar: { b: "Pending", h: "Preparing", k: "Shipped", t: "Delivered" },
      satirlar: [
        ["#1048", "Ayse Demir", "b", "₺1,240.00"],
        ["#1047", "Kuzey Stationery", "h", "₺3,860.50"],
        ["#1046", "Mert Aksoy", "k", "₺749.90"],
        ["#1045", "Bahar Florist", "t", "₺2,115.00"],
        ["#1044", "Can Yilmaz", "k", "₺389.00"],
        ["#1043", "Deniz Bakery", "t", "₺1,560.00"],
      ],
      sonraki: "Next page",
      yeni: "New order",
    },
  );
  const RENK = { b: ["#9a6a12", "#fbf0d9"], h: ["#2a5f9e", "#e6eef9"], k: ["#5b45a8", "#eeeafa"], t: ["#2c7a51", "#e4f3ea"] };
  const kac = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const satirlar = m.satirlar
    .map(([no, kim, d, tutar], i) => {
      const y = 214 + i * 52;
      const [renk, zemin] = RENK[d];
      const etiket = m.durumlar[d];
      const gen = 18 + etiket.length * 7.4;
      return [
        `<line x1="232" y1="${y + 26}" x2="928" y2="${y + 26}" stroke="#ebe8e2"/>`,
        `<text x="248" y="${y + 6}" font-size="14" fill="#6f6a63" font-family="IBM Plex Mono, Menlo, monospace">${no}</text>`,
        `<text x="352" y="${y + 6}" font-size="15" fill="#1d1c1f">${kac(kim)}</text>`,
        `<rect x="612" y="${y - 10}" width="${gen.toFixed(1)}" height="24" rx="12" fill="${zemin}"/>`,
        `<text x="${(612 + 9).toFixed(1)}" y="${y + 6}" font-size="13" font-weight="600" fill="${renk}">${kac(etiket)}</text>`,
        `<text x="912" y="${y + 6}" font-size="15" fill="#1d1c1f" text-anchor="end" font-family="IBM Plex Mono, Menlo, monospace">${tutar}</text>`,
      ].join("");
    })
    .join("\n  ");
  const menu = m.menu
    .map((ad, i) => (i === 0 ? `<rect x="12" y="${84 + i * 40}" width="176" height="32" rx="6" fill="#ecebe7"/><text x="28" y="${105 + i * 40}" font-size="14" font-weight="600" fill="#1d1c1f">${ad}</text>` : `<text x="28" y="${105 + i * 40}" font-size="14" fill="#5e5a54">${ad}</text>`))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 560" width="960" height="560" font-family="IBM Plex Sans, Segoe UI, Helvetica, Arial, sans-serif">
  <rect width="960" height="560" fill="#f7f6f3"/>
  <rect width="960" height="56" fill="#ffffff"/>
  <line x1="0" y1="56.5" x2="960" y2="56.5" stroke="#e3e0da"/>
  <rect x="24" y="18" width="20" height="20" rx="5" fill="#1d1c1f"/>
  <text x="54" y="34" font-size="16" font-weight="600" fill="#1d1c1f">${kac(m.urun)}</text>
  <circle cx="920" cy="28" r="14" fill="#e7e4de"/>
  <rect x="0" y="57" width="200" height="503" fill="#fbfaf8"/>
  <line x1="200.5" y1="57" x2="200.5" y2="560" stroke="#e3e0da"/>
  ${menu}
  <text x="232" y="106" font-size="24" font-weight="600" fill="#1d1c1f">${kac(m.baslik)}</text>
  <text x="232" y="130" font-size="13" fill="#77726b">${kac(m.alt)}</text>
  <rect x="800" y="86" width="128" height="36" rx="6" fill="#1d1c1f"/>
  <text x="864" y="109" font-size="14" font-weight="600" fill="#ffffff" text-anchor="middle">${kac(m.yeni)}</text>
  <rect x="232" y="150" width="696" height="352" rx="8" fill="#ffffff" stroke="#e3e0da"/>
  <text x="248" y="180" font-size="12" fill="#8a857e">${kac(m.sutunlar[0])}</text>
  <text x="352" y="180" font-size="12" fill="#8a857e">${kac(m.sutunlar[1])}</text>
  <text x="612" y="180" font-size="12" fill="#8a857e">${kac(m.sutunlar[2])}</text>
  <text x="912" y="180" font-size="12" fill="#8a857e" text-anchor="end">${kac(m.sutunlar[3])}</text>
  <line x1="232" y1="192" x2="928" y2="192" stroke="#e3e0da"/>
  ${satirlar}
  <text x="928" y="530" font-size="14" fill="#1d1c1f" text-anchor="end">${kac(m.sonraki)} →</text>
</svg>
`;
}

// ---------------------------------------------------------------------------
// Metinler (çekirdekteki tanitim.ts ile aynı)
// ---------------------------------------------------------------------------

function uzmanaIstek(not) {
  return ceviri(
    [
      "Kurul Tanıtım alanındaki README.md'nin güncellenmesini istiyor.",
      ...(not ? [`Kurulun notu: ${not}`] : []),
      "README.md'yi projenin bugünkü hâline göre gözden geçir: son teslimleri, birleşen işleri, görevleri ve git geçmişini oku; yalnız gerçekte var olanı yaz, eskiyen yeri düzelt. Bitince commit'le ve birlestirme_iste ile kısa bir özetle birleştirme iste.",
    ].join("\n"),
    [
      "The board wants the README.md in the Showcase area updated.",
      ...(not ? [`The board's note: ${not}`] : []),
      "Review README.md against the project as it is today: read the latest deliveries, merged work, tasks and git history; write only what really exists and fix whatever has gone stale. When done, commit and ask for the merge with birlestirme_iste and a short summary.",
    ].join("\n"),
  );
}

function ceoyaIstek(not) {
  return ceviri(
    `Tanıtım alanında projenin README.md'sini görmek istiyorum. Ekipte tanıtım uzmanı yok: ise_al_teklif ile bir Tanıtım uzmanı (rol: tanitim) işe almayı öner; işe alınınca README.md'yi yazmasını ve birleştirme istemesini sağla.${not ? `\n\nNotum: ${not}` : ""}`,
    `I want to see the project's README.md in the Showcase area. There is no product marketer on the team: propose hiring a Product marketer (role: tanitim) with ise_al_teklif; once hired, have them write README.md and ask for the merge.${not ? `\n\nMy note: ${not}` : ""}`,
  );
}

export function kur(c) {
  const { rota, rotalar, db, yay, mesajEkle, akisEkle, ajanBul, projeAjanlari, projeGerekli, projeYay, Hata, simdi, yeniKimlik } = c;
  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
  const degisti = (pid) => yay({ tur: "tanitim.degisti", projeId: pid }, pid);
  const uzmanBul = (pid) => projeAjanlari(pid).find((a) => a.rol === ROL.kimlik) ?? null;

  // -------------------------------------------------------------------------
  // Rol kataloğu (çekirdekte son eleman), yetenekler ve ekipte Defne
  // -------------------------------------------------------------------------
  if (!V.roller.some((r) => r.kimlik === ROL.kimlik)) V.roller.push(ROL);

  const yetenekRolleri = rotalar.find((r) => r.yontem === "GET" && r.desen.test("/api/yetenekler/roller"));
  if (yetenekRolleri) {
    const asil = yetenekRolleri.isleyici;
    yetenekRolleri.isleyici = (i) => ({ ...asil(i), tanitim: YETENEKLER });
  }
  // İşe alınan tanıtım uzmanı rolünün yeteneklerini alır (0.0.5 sarmalayıcısı bilinmeyen rolde temelleri verir)
  const iseAl = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler/x/ajanlar"));
  if (iseAl) {
    const asil = iseAl.isleyici;
    iseAl.isleyici = (i) => {
      const a = asil(i);
      const kayit = ajanBul(a.id);
      if (kayit?.rol === ROL.kimlik) {
        kayit.yetenekler = [...YETENEKLER];
        ajanYay(kayit);
        degisti(kayit.projeId);
      }
      return kayit ?? a;
    };
  }

  if (!ajanBul(UZMAN)) {
    db.ajanlar.push({
      id: UZMAN,
      projeId: OFIS,
      ad: "Defne",
      rol: ROL.kimlik,
      rolAdi: ROL.ad,
      model: "sonnet",
      yoneticiId: "ada",
      durum: "calisiyor",
      isAciklamasi: ceviri("README.md: sipariş akışı bölümü", "README.md: order flow section"),
      gorevId: null,
      oturumId: "oturum-defne-7f3a",
      calismaAlani: `${V.CALISMA_KOKU}/${UZMAN}`,
      dal: `arnorg/${UZMAN}`,
      izinModu: "bypassPermissions",
      talimatEki: "",
      karakter: null,
      bugunToken: 41_000,
      toplamToken: 188_000,
      olusturma: V.once(60 * 24 * 2),
      yetenekler: [...YETENEKLER],
    });
    db.akislar[UZMAN] = [];
  }

  // README ve ekran görüntüsü ana repoda; taslak Defne'nin çalışma alanında
  const tanitimYok = process.env.ARNORG_TANITIM === "yok";
  if (!tanitimYok) db.ana[DOSYA] = YAYINDA;
  else delete db.ana[DOSYA];
  db.ana[GORSEL] = ekranGoruntusu();
  if (db.anaHead) {
    if (!tanitimYok) db.anaHead[DOSYA] = YAYINDA;
    db.anaHead[GORSEL] = db.ana[GORSEL];
  }
  if (db.indeks) {
    if (!tanitimYok) db.indeks[DOSYA] = YAYINDA;
    db.indeks[GORSEL] = db.ana[GORSEL];
  }
  if (!tanitimYok) (db.katmanlar[UZMAN] ??= {})[DOSYA] = TASLAK;

  /** Son commit: README'nin main'deki son değişikliği */
  const son = {
    commit: "8f3a1c94e27b6d05a9c3e1f2b4d6a8c0e2f4a6b8",
    yazar: "Furkan YILDIRIM",
    zaman: V.once(60 * 5 + 12),
    mesaj: ceviri("README: sipariş akışı ve kurulum", "README: order flow and setup"),
  };
  let taslakZamani = V.once(18);
  /** Proje → kurulun son isteği */
  const istekler = new Map();

  rota("GET", "/api/projeler/:pid/tanitim", ({ p }) => {
    const pr = projeGerekli(p.pid);
    // Sahte repo tek: README yalnız Sipariş Paneli'ne aittir
    const icerik = pr.id === OFIS ? (db.ana[DOSYA] ?? null) : null;
    const uzman = uzmanBul(pr.id);
    const alanda = uzman ? db.katmanlar[uzman.id]?.[DOSYA] : undefined;
    const taslak = uzman && typeof alanda === "string" && alanda !== icerik ? { ajanId: uzman.id, ajanAd: uzman.ad, icerik: alanda, zaman: taslakZamani } : null;
    return {
      dosya: DOSYA,
      var: icerik !== null,
      icerik,
      son: icerik !== null ? son : null,
      taslak,
      uzman: uzman ? { id: uzman.id, ad: uzman.ad, durum: uzman.durum } : null,
      guncellemeIstendi: istekler.get(pr.id) ?? null,
    };
  });

  rota("POST", "/api/projeler/:pid/tanitim/guncelle", ({ p, govde }) => {
    const pr = projeGerekli(p.pid);
    const not = typeof govde?.not === "string" ? govde.not.trim() : "";
    if (not.length > NOT_SINIRI) throw new Hata(400, ceviri("Geçersiz istek: not — en çok 2000 karakter.", "Invalid request: not — at most 2000 characters."));
    const uzman = uzmanBul(pr.id);
    if (uzman) {
      istekler.set(pr.id, simdi());
      uzmanYazar(uzman, not);
      degisti(pr.id);
      return { kime: "uzman", ajanId: uzman.id, ajanAd: uzman.ad };
    }
    const ceo = projeAjanlari(pr.id).find((a) => a.rol === "ceo");
    if (!ceo) throw new Hata(409, ceviri("Bu projede CEO yok; tanıtım uzmanını işe alması için önce bir CEO işe alın.", "This project has no CEO; hire a CEO first so they can hire a product marketer."));
    istekler.set(pr.id, simdi());
    mesajEkle(pr.id, "yonetim", "kurul", ceoyaIstek(not));
    ceoTeklifAcar(pr.id, ceo);
    degisti(pr.id);
    return { kime: "ceo", ajanId: ceo.id, ajanAd: ceo.ad };
  });

  /** Uzman isteği alır, stüdyoda yazar (araç çağrısı ofiste görünür), taslağı güncellenir */
  function uzmanYazar(uzman, not) {
    akisEkle(uzman.id, { tur: "kullanici", metin: uzmanaIstek(not) });
    uzman.durum = "calisiyor";
    uzman.isAciklamasi = ceviri("README.md'yi güncelliyor", "Updating README.md");
    ajanYay(uzman);
    const dosya = `${uzman.calismaAlani}/${DOSYA}`;
    setTimeout(() => {
      akisEkle(uzman.id, { tur: "arac_cagrisi", arac: "Edit", aracKimligi: yeniKimlik("toolu"), girdi: { file_path: dosya } });
    }, 900);
    setTimeout(() => {
      akisEkle(uzman.id, { tur: "arac_cagrisi", arac: "Edit", aracKimligi: yeniKimlik("toolu"), girdi: { file_path: dosya } });
    }, 2200);
    setTimeout(() => {
      // İlk istekte sık sorulanlar eklenir; uzmanı yeni olan projede (README yok) ilk taslak yazılır
      const simdiki = db.katmanlar[uzman.id]?.[DOSYA] ?? (uzman.projeId === OFIS ? TASLAK : ILK_TASLAK);
      (db.katmanlar[uzman.id] ??= {})[DOSYA] = simdiki.includes(TASLAK_EKI.trim()) || uzman.projeId !== OFIS ? simdiki : `${simdiki.trimEnd()}\n${TASLAK_EKI}`;
      taslakZamani = simdi();
      akisEkle(uzman.id, {
        tur: "asistan",
        metin: ceviri(
          "README.md güncellendi: tanıtım cümlesi ve sipariş akışı gözden geçirildi. Birleştirme isteyeceğim.",
          "README.md updated: reviewed the pitch and the order flow. I'll ask for the merge.",
        ),
      });
      uzman.durum = "bosta";
      uzman.isAciklamasi = ceviri("README.md taslağı hazır", "README.md draft ready");
      ajanYay(uzman);
      yay({ tur: "dosya.degisti", projeId: uzman.projeId, alan: uzman.id, yol: DOSYA, ajanId: uzman.id }, uzman.projeId);
      degisti(uzman.projeId);
    }, YAZMA_MS);
  }

  /** CEO yanıtlar ve bir Tanıtım uzmanı için işe alım teklifi açar (kurul kipinde Onaylar'dan onaylanınca, tam otonomda hemen katılır) */
  function ceoTeklifAcar(pid, ceo) {
    if (db.onaylar.some((o) => o.projeId === pid && o.tur === "ise_alim" && o.durum === "bekliyor" && o.veri?.rol === ROL.kimlik)) return;
    yay({ tur: "kanal.yaziyor", projeId: pid, kanal: "yonetim", ajanId: ceo.id, ad: ceo.ad, yaziyor: true }, pid);
    setTimeout(() => {
      yay({ tur: "kanal.yaziyor", projeId: pid, kanal: "yonetim", ajanId: ceo.id, ad: ceo.ad, yaziyor: false }, pid);
      // Tam otonomda karar yetkisi CEO'da: teklif hemen geçerli olur
      const otonom = projeGerekli(pid).kararVeren === "ceo";
      mesajEkle(
        pid,
        "yonetim",
        ceo.id,
        otonom
          ? ceviri(
              "Anlaşıldı. Tanıtım için Mira'yı (Tanıtım uzmanı) işe alıyorum; katılınca README.md'yi yazmasını isteyeceğim.",
              "Understood. I'm hiring Mira as our Product marketer; once she joins, I'll ask her to write README.md.",
            )
          : ceviri(
              "Anlaşıldı. Tanıtım için Mira'yı (Tanıtım uzmanı) öneriyorum; teklif Onaylar'da. Onaylarsanız README.md'yi yazmasını isteyeceğim.",
              "Understood. I'm proposing Mira as our Product marketer; the proposal is in Approvals. Once you approve, I'll ask her to write README.md.",
            ),
      );
      const o = {
        id: yeniKimlik("o"),
        projeId: pid,
        ajanId: ceo.id,
        tur: "ise_alim",
        baslik: ceviri(`İşe alım: Mira · ${ROL.ad}`, `Hiring: Mira · ${ROL.ad}`),
        ayrinti: ceviri(
          "Kurul projeyi Tanıtım alanından, kök README.md'den okuyacak; README'yi yazacak ve teslimlerden sonra güncel tutacak biri gerek.\n\nModel: Sonnet 5.5 · Yönetici: " + ceo.ad,
          "The board will read the project in the Showcase area, from the root README.md; we need someone to write it and keep it current after deliveries.\n\nModel: Sonnet 5.5 · Manager: " + ceo.ad,
        ),
        veri: { ad: "Mira", rol: ROL.kimlik, model: "sonnet", yoneticiId: ceo.id, talimatEki: "" },
        durum: "bekliyor",
        olusturma: simdi(),
        sonGecerlilik: null,
        sonuclanma: null,
        not: null,
      };
      db.onaylar.unshift(o);
      yay({ tur: "onay.yeni", onay: o }, pid);
      projeYay(pid);
    }, CEO_MS);
  }

  // Kurul README.md'yi Kod ekranında kaydedince de Tanıtım tazelenir
  const yaz = rotalar.find((r) => r.yontem === "PUT" && r.desen.test("/api/projeler/x/fs/icerik"));
  if (yaz) {
    const asil = yaz.isleyici;
    yaz.isleyici = (i) => {
      const sonuc = asil(i);
      if (String(i.q.get("yol") ?? "").replace(/^\/+/, "") === DOSYA) degisti(i.p.pid);
      return sonuc;
    };
  }
}
