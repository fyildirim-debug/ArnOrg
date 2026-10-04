// Sahte reponun İngilizcesi (ARNORG_DIL=en): yalnız düzyazı değişir, kod mantığı ve dosya yolları aynı kalır.
// Tamamı düzyazı olan dosyalar tam metindir; koddaki yorum, test adı ve arayüz metinleri [Türkçe, İngilizce]
// çiftleriyle değişir. Çiftler main dalına, ajan çalışma alanlarına ve Ece'nin canlı düzenlemesine aynı biçimde
// uygulanır (tohum.mjs); hiçbir dosyada geçmeyen çift açılışta uyarılır.

/** Tamamı düzyazı olan dosyalar (main dalı) */
export const metinler = {
  "CLAUDE.md": `# Order Panel · shared rules

- Identifiers keep the existing Turkish naming; comments and docs are in English.
- Every task on its own branch: arnorg/<agent>/<task>.
- No direct pushes to main; merges need board approval.
- Tests run on vitest; \`npm test\` always stays green.
`,
  "README.md": `# Order Panel

Order, stock and shipping tracking for small businesses.

\`\`\`sh
npm install
npm run dev
\`\`\`
`,
  ".arnorg/proje.yaml": `ad: Order Panel
aciklama: Order, stock and shipping tracking for small businesses
varsayilan_dal: main
birlestirme: yerel
not: ArnOrg project settings. Team identities live under ekip/, project memory under notlar/.
`,
};

/** Koddaki düzyazı: [Türkçe, İngilizce] */
export const ceviriler = [
  // main dalı
  ['throw new Error("Siparişler alınamadı")', 'throw new Error("Could not fetch orders")'],
  ["// Erişim ve yenileme jetonlarını bellekte ve sessionStorage'da tutar", "// Keeps the access and refresh tokens in memory and in sessionStorage"],
  ['className="tablo-bos">Yükleniyor…<', 'className="tablo-bos">Loading…<'],
  ['className="tablo-bos">Kayıt yok.<', 'className="tablo-bos">No records.<'],
  [">Sonraki sayfa<", ">Next page<"],
  ['{ ad: "No", alan: "no" }', '{ ad: "No.", alan: "no" }'],
  ['{ ad: "Müşteri", alan: "musteri" }', '{ ad: "Customer", alan: "musteri" }'],
  ["// TODO imleç desteği", "// TODO cursor support"],
  ['describe("sipariş API"', 'describe("order API"'],
  ['it("listeyi döner"', 'it("returns the list"'],
  // Ajan çalışma alanları
  ["// ADR-005: imleç, son kaydın kimliğini taşıyan base64url JSON'dur", "// ADR-005: the cursor is base64url JSON carrying the id of the last record"],
  ['describe("imleç"', 'describe("cursor"'],
  ['it("gidiş dönüş"', 'it("round trip"'],
  ['it("bozuk imleç null döner"', 'it("returns null for a broken cursor"'],
  ['it("geçersiz gövdede 422 döner"', 'it("returns 422 for an invalid body"'],
  ['beklemede: "Beklemede"', 'beklemede: "Pending"'],
  ['hazirlaniyor: "Hazırlanıyor"', 'hazirlaniyor: "Preparing"'],
  ['kargoda: "Kargoda"', 'kargoda: "Shipped"'],
  ['teslim: "Teslim edildi"', 'teslim: "Delivered"'],
  ['test("hata durumunda uyarı kutusu"', 'test("shows an alert box on error"'],
  ['"Siparişler yüklenemedi."', '"Could not load orders."'],
  ["// ADR-004: yenileme tek kilit üzerinden yapılır", "// ADR-004: refreshing goes through a single lock"],
  ["// ADR-004: yenileme jetonu tek kullanımlık; aile kimliği ile izlenir", "// ADR-004: the refresh token is single-use and tracked by its family id"],
  // Ece'nin liste ekranındaki canlı düzenlemesi
  ['{ ad: "Durum", alan: "durum"', '{ ad: "Status", alan: "durum"'],
  ['{ ad: "Tutar", alan: "tutar"', '{ ad: "Amount", alan: "tutar"'],
  ['bosMetin="Henüz sipariş yok."', 'bosMetin="No orders yet."'],
];
