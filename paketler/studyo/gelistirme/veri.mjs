// Sahte çekirdeğin örnek verisi: Arnex Yazılım · Sipariş Paneli
// Zamanlar sunucunun açıldığı ana göre üretilir; böylece "bugün" her açılışta doğru görünür.

const dk = 60_000;
const BASLANGIC = Date.now();
export const once = (dakika) => new Date(BASLANGIC - dakika * dk).toISOString();
export const sonra = (dakika) => new Date(BASLANGIC + dakika * dk).toISOString();

export const PROJE_KOKU = "/home/furkan/projeler/siparis-paneli";
export const CALISMA_KOKU = "/home/furkan/.arnorg/calisma/siparis-paneli";

export const roller = [
  { kimlik: "ceo", ad: "CEO", aciklama: "Plan yazar, kadro önerir, işi dağıtır, kurula rapor verir. Kod yazmaz.", varsayilanModel: "opus", talimat: "Sen şirketin CEO'susun.", yonetici: true },
  { kimlik: "cto", ad: "CTO", aciklama: "Mimari kararları ADR olarak yazar, görevleri teknik olarak böler, standartları belirler.", varsayilanModel: "opus", talimat: "", yonetici: false },
  { kimlik: "backend", ad: "Backend geliştirici", aciklama: "API, veritabanı ve sunucu tarafı işler. Kendi çalışma alanında çalışır.", varsayilanModel: "sonnet", talimat: "", yonetici: false },
  { kimlik: "frontend", ad: "Frontend geliştirici", aciklama: "Arayüz ekranları, bileşenler ve istemci tarafı durum.", varsayilanModel: "sonnet", talimat: "", yonetici: false },
  { kimlik: "test", ad: "Test mühendisi", aciklama: "Uçtan uca ve birim testleri yazar, hataları yeniden üretir.", varsayilanModel: "sonnet", talimat: "", yonetici: false },
  { kimlik: "inceleme", ad: "Kod inceleyici", aciklama: "Değişiklikleri inceler, satır yorumu yazar, birleştirmeyi onaylar ya da geri gönderir.", varsayilanModel: "opus", talimat: "", yonetici: false },
  { kimlik: "guvenlik", ad: "Güvenlik uzmanı", aciklama: "OWASP denetimi, bağımlılık taraması, gizli bilgi sızıntısı kontrolü.", varsayilanModel: "sonnet", talimat: "", yonetici: false },
  { kimlik: "devops", ad: "DevOps", aciklama: "CI, dağıtım, gözlem ve altyapı betikleri.", varsayilanModel: "sonnet", talimat: "", yonetici: false },
  { kimlik: "tasarim", ad: "Tasarımcı", aciklama: "Tasarım sistemi, ekran akışları ve erişilebilirlik.", varsayilanModel: "sonnet", talimat: "", yonetici: false },
  { kimlik: "yazar", ad: "Teknik yazar", aciklama: "Kullanıcı belgeleri, API başvurusu ve sürüm notları.", varsayilanModel: "haiku", talimat: "", yonetici: false },
];

export const projeler = [
  {
    id: "siparis-paneli",
    ad: "Sipariş Paneli",
    yol: PROJE_KOKU,
    aciklama: "Küçük işletmeler için sipariş, stok ve kargo takibi · Sprint 3: sipariş akışı uçtan uca",
    varsayilanDal: "main",
    olusturma: once(60 * 24 * 9),
  },
  {
    id: "arnex-web",
    ad: "Arnex Web Sitesi",
    yol: "/home/furkan/projeler/arnex-web",
    aciklama: "Şirket tanıtım sitesi · Astro ve içerik notları",
    varsayilanDal: "main",
    olusturma: once(60 * 24 * 2),
  },
];

function ajan(o) {
  const proje = o.projeId ?? "siparis-paneli";
  return {
    projeId: proje,
    yoneticiId: null,
    gorevId: null,
    oturumId: o.durum === "kapali" ? null : `oturum-${o.id}-7f3a`,
    calismaAlani: proje === "siparis-paneli" ? `${CALISMA_KOKU}/${o.id}` : null,
    dal: null,
    izinModu: "bypassPermissions",
    talimatEki: "",
    olusturma: once(60 * 24 * 8),
    ...o,
  };
}

export const ajanlar = [
  ajan({ id: "ada", ad: "Ada", rol: "ceo", rolAdi: "CEO", model: "opus", durum: "calisiyor", isAciklamasi: "Sprint 3 ilerlemesini derliyor", gunlukButceUsd: 10, bugunHarcananUsd: 3.1, toplamHarcananUsd: 41.8, dal: "arnorg/ada", calismaAlani: null, izinModu: "default", talimatEki: "Her sabah 09:00'da kısa durum raporu yaz. Bütçe aşımlarını hemen kurula bildir." }),
  ajan({ id: "kerem", ad: "Kerem", rol: "cto", rolAdi: "CTO", model: "opus", yoneticiId: "ada", durum: "calisiyor", isAciklamasi: "T-21 Jeton yenileme mimarisi", gorevId: "g21", gunlukButceUsd: 8, bugunHarcananUsd: 2.6, toplamHarcananUsd: 33.2, dal: "arnorg/kerem/T-21" }),
  ajan({ id: "deniz", ad: "Deniz", rol: "backend", rolAdi: "Backend geliştirici", model: "sonnet", yoneticiId: "kerem", durum: "karar_bekliyor", isAciklamasi: "T-24 Sipariş API uç noktaları · git push için onay bekliyor", gorevId: "g24", gunlukButceUsd: 5, bugunHarcananUsd: 4.25, toplamHarcananUsd: 28.9, dal: "arnorg/deniz/T-24" }),
  ajan({ id: "ece", ad: "Ece", rol: "frontend", rolAdi: "Frontend geliştirici", model: "sonnet", yoneticiId: "kerem", durum: "calisiyor", isAciklamasi: "T-26 Sipariş listesi ekranı", gorevId: "g26", gunlukButceUsd: 5, bugunHarcananUsd: 2.2, toplamHarcananUsd: 19.4, dal: "arnorg/ece/T-26" }),
  ajan({ id: "mert", ad: "Mert", rol: "test", rolAdi: "Test mühendisi", model: "sonnet", yoneticiId: "kerem", durum: "bosta", isAciklamasi: "T-27 için T-24'ü bekliyor", gorevId: "g27", gunlukButceUsd: 3, bugunHarcananUsd: 0.4, toplamHarcananUsd: 6.1, dal: "arnorg/mert/T-27", izinModu: "acceptEdits" }),
  ajan({ id: "onur", ad: "Onur", rol: "inceleme", rolAdi: "Kod inceleyici", model: "opus", yoneticiId: "kerem", durum: "kapali", isAciklamasi: "T-19 düzeltmelerini bekliyor", gunlukButceUsd: 5, bugunHarcananUsd: 0.75, toplamHarcananUsd: 12.3, dal: "arnorg/onur", izinModu: "plan" }),
  ajan({ id: "lale", projeId: "arnex-web", ad: "Lale", rol: "ceo", rolAdi: "CEO", model: "opus", durum: "kapali", isAciklamasi: "Brief bekliyor", gunlukButceUsd: 6, bugunHarcananUsd: 0, toplamHarcananUsd: 1.2, calismaAlani: null, dal: null }),
];

function gorev(no, baslik, durum, atananId, etiket, ek = {}) {
  return {
    id: `g${no}`,
    projeId: "siparis-paneli",
    no,
    kod: `T-${no}`,
    baslik,
    aciklama: "",
    kabulOlcutu: "",
    durum,
    atananId,
    bagimliliklar: [],
    etiket,
    olusturanId: "ada",
    olusturma: once(60 * 24 * 7 - no * 30),
    guncelleme: once(200 - no * 4),
    ...ek,
  };
}

export const gorevler = [
  gorev(15, "Proje iskeleti", "tamam", "kerem", "altyapı", { aciklama: "Vite + React istemci, Node API, ortak tipler.", kabulOlcutu: "npm run dev iki tarafı da açar; CI yeşil." }),
  gorev(16, "Veritabanı şeması", "tamam", "deniz", "backend", { aciklama: "Sipariş, müşteri, ürün ve gönderi tabloları; ilk göç.", kabulOlcutu: "Göç geri alınabilir; tohum verisi yüklenir." }),
  gorev(17, "CI hattı", "tamam", "kerem", "altyapı", { aciklama: "Windows ve Linux üzerinde lint, tür denetimi ve test." }),
  gorev(18, "Tasarım sistemi", "tamam", "ece", "tasarım", { aciklama: "Tablo, rozet, düğme ve form bileşenleri; boş ve hata durumları." }),
  gorev(19, "Oturum açma akışı", "inceleme", "ece", "frontend", { aciklama: "E-posta + parola ile giriş, kısa ömürlü erişim jetonu.", kabulOlcutu: "Yenileme jetonu tek kullanımlık; iki sekmede yarış yok.", bagimliliklar: ["g15"] }),
  gorev(20, "Ürün kataloğu ekranı", "iptal", "ece", "frontend", { aciklama: "Sprint 4'e ertelendi; katalog API'si önce bitmeli." }),
  gorev(21, "Jeton yenileme mimarisi", "calisiliyor", "kerem", "mimari", { aciklama: "ADR-004'e göre tek kullanımlık yenileme jetonu ve istemci kilidi.", kabulOlcutu: "ADR onaylı; Deniz ve Ece için uygulama notları hazır." }),
  gorev(22, "Ürün kataloğu API", "inceleme", "deniz", "backend", { aciklama: "GET /urunler ofset sayfalama ile.", kabulOlcutu: "Testler geçer; Onur onaylar.", bagimliliklar: ["g16"] }),
  gorev(23, "Hata izleme kurulumu", "planlandi", null, "altyapı", { aciklama: "Sunucu ve istemci hatalarının tek yerde toplanması." }),
  gorev(24, "Sipariş API uç noktaları", "calisiliyor", "deniz", "backend", { aciklama: "GET /siparisler (imleçle sayfalama), POST /siparisler, PATCH /siparisler/:id/durum.", kabulOlcutu: "Sayfalama ADR-005'e uyar; doğrulama hataları 422 döner; testler geçer.", bagimliliklar: ["g16"] }),
  gorev(25, "Sipariş durum makinesi", "planlandi", "deniz", "backend", { aciklama: "Beklemede → Hazırlanıyor → Kargoda → Teslim edildi; iptal ve iade.", bagimliliklar: ["g24"] }),
  gorev(26, "Sipariş listesi ekranı", "calisiliyor", "ece", "frontend", { aciklama: "Tablo, durum rozeti, imleçle sonraki sayfa, hata kutusu.", kabulOlcutu: "Boş, yükleniyor ve hata durumları; klavyeyle gezilebilir.", bagimliliklar: ["g18"] }),
  gorev(27, "Sipariş akışı uçtan uca testleri", "planlandi", "mert", "test", { aciklama: "Sipariş oluştur → listele → durum değiştir akışı.", bagimliliklar: ["g24", "g26"] }),
  gorev(28, "Kargo firması entegrasyonu", "bekleyen", null, "backend", { aciklama: "İlk aşamada tek kargo firması; gönderi kodu ve takip bağlantısı." }),
  gorev(29, "Sipariş bildirim e-postaları", "bekleyen", null, "backend", { aciklama: "Sipariş alındı ve kargoya verildi e-postaları.", bagimliliklar: ["g25"] }),
  {
    id: "w1",
    projeId: "arnex-web",
    no: 1,
    kod: "T-1",
    baslik: "Site iskeleti ve içerik yapısı",
    aciklama: "",
    kabulOlcutu: "",
    durum: "bekleyen",
    atananId: null,
    bagimliliklar: [],
    etiket: "altyapı",
    olusturanId: null,
    olusturma: once(60 * 24),
    guncelleme: once(60 * 24),
  },
];

export const kanallar = {
  "siparis-paneli": [
    { ad: "genel", aciklama: "Bütün ekip · anma olmadan yazılan mesaj CEO'ya gider" },
    { ad: "muhendislik", aciklama: "Teknik konuşmalar · kararlar ADR olarak notlara taşınır" },
  ],
  "arnex-web": [
    { ad: "genel", aciklama: "Bütün ekip" },
    { ad: "muhendislik", aciklama: "Teknik konuşmalar" },
  ],
};

function mesaj(id, kanal, gonderenId, gonderenAd, dakikaOnce, metin, anilanlar = []) {
  return { id, projeId: "siparis-paneli", kanal, gonderenId, gonderenAd, metin, anilanlar, zaman: once(dakikaOnce) };
}

export const mesajlar = [
  mesaj("m1", "genel", "kurul", "Yönetim kurulu", 60 * 24 + 30, "Bu sprintin hedefi sipariş akışının uçtan uca çalışması. Ödeme işini sonraki sprinte bırakalım."),
  mesaj("m2", "genel", "ada", "Ada", 60 * 24 + 25, "Anlaşıldı. Sprint 3'ü T-21, T-24, T-26 ve T-27 etrafında kurdum. Kerem mimariyi, Deniz API'yi, Ece listeyi alıyor; Mert T-24 incelemeye düşünce testlere başlar."),
  mesaj("m3", "genel", "ada", "Ada", 95, "Günaydın. Dünkü durum: T-22 incelemede, T-19 iki güvenlik bulgusuyla Ece'ye geri döndü. Bugün öncelik T-24 ve T-26.", []),
  mesaj("m4", "genel", "deniz", "Deniz", 52, "T-24: GET ve POST /siparisler hazır, sayfalama testleri yazılıyor. @Mert şema notlar/api/siparis.md içinde.", ["mert"]),
  mesaj("m5", "genel", "mert", "Mert", 51, "Aldım. T-24 incelemeye geçince E2E testlerini başlatıyorum."),
  mesaj("m6", "genel", "onur", "Onur", 34, "T-19 incelemesi bitti: oturum süresi sabit kodlanmış, yenileme jetonunda yarış durumu var. Ece'ye geri gönderdim."),
  mesaj("m7", "genel", "ada", "Ada", 18, "Ödeme entegrasyonundan önce güvenlik denetimi gerekiyor. Bir güvenlik uzmanı alınmasını öneriyorum; teklif Onaylar'da."),
  mesaj("m8", "muhendislik", "kerem", "Kerem", 120, "Jeton yenileme için ADR-004 taslağını açtım. Yorumlarınızı nota yazın, kanala değil."),
  mesaj("m9", "muhendislik", "deniz", "Deniz", 64, "@Kerem sayfalamada imleç mi, ofset mi? Katalogda ofset kullanmıştık.", ["kerem"]),
  mesaj("m10", "muhendislik", "kerem", "Kerem", 62, "İmleç. Sipariş listesi büyüyecek; karar ADR-005 olarak notlara girdi. Katalog şimdilik ofsette kalsın."),
  mesaj("m11", "muhendislik", "ece", "Ece", 40, "Liste ekranında `Rozet` bileşenini tasarım sisteminden aldım. T-26 için API yanıtındaki `sonrakiImlec` alanını kullanıyorum."),
  mesaj("m12", "muhendislik", "deniz", "Deniz", 22, "@Ece alan adı `sonrakiImlec`, son sayfada null gelir.", ["ece"]),
];

export const notlar = {
  "vizyon.md": `# Vizyon

Küçük işletmeler için sipariş, stok ve kargo takibini **tek ekranda** toplayan web paneli.

## İlk sürüm

- Sipariş akışı uçtan uca: oluştur, listele, durum değiştir
- Tek kargo firması entegrasyonu
- Rol tabanlı erişim: sahip, çalışan

## Başarı ölçütü

İlk on işletme bir hafta boyunca siparişlerini yalnız bu panelden yönetebilsin.
`,
  "mimari.md": `# Mimari

- **İstemci:** Vite + React, TanStack Query
- **Sunucu:** Node.js API, Fastify
- **Veri:** PostgreSQL, göçler \`db/goc/\` altında
- **Kimlik:** kısa ömürlü erişim jetonu + dönen yenileme jetonu (bkz. ADR-004)

| Katman | Sahibi |
|---|---|
| API | Deniz |
| Arayüz | Ece |
| Test | Mert |
`,
  "sozluk.md": `# Sözlük

- **Sipariş:** müşterinin onaylanmış sepeti.
- **Gönderi:** kargoya verilmiş sipariş parçası.
- **İmleç:** sayfalamada bir sonraki sayfanın başlangıç anahtarı.
`,
  "kararlar/ADR-004-jeton-yenileme.md": `# ADR-004 · Jeton yenileme

**Durum:** Önerildi · Kerem · 2 Ekim 2026

## Bağlam

T-19 incelemesinde iki sekme aynı anda yenileme yapınca jetonun iki kez kullanıldığı görüldü.

## Karar

Yenileme jetonu **tek kullanımlık** olur; aynı aile ikinci kez görülürse tüm aile iptal edilir. İstemci tarafında yenileme tek bir kilit üzerinden yapılır.

## Sonuç

- Ece T-19'da istemci kilidini uygular.
- Deniz T-24'te sunucu tarafını uygular.
- Mert yarış durumu için test yazar.
`,
  "kararlar/ADR-005-imlec-sayfalama.md": `# ADR-005 · İmleç tabanlı sayfalama

Sipariş listesi büyüyeceği için ofset yerine **imleç** kullanılır. Katalog uç noktaları şimdilik ofsette kalır.

\`\`\`http
GET /siparisler?imlec=eyJpZCI6MTI0fQ&limit=25
\`\`\`
`,
  "api/siparis.md": `# Sipariş API

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | \`/siparisler?imlec=&limit=\` | İmleçle sayfalanmış liste |
| POST | \`/siparisler\` | Yeni sipariş; doğrulama hatası 422 |
| PATCH | \`/siparisler/:id/durum\` | Durum makinesine uygun geçiş |
`,
};

export const notZamanlari = {
  "vizyon.md": once(60 * 24 * 8),
  "mimari.md": once(60 * 24 * 5),
  "sozluk.md": once(60 * 24 * 3),
  "kararlar/ADR-004-jeton-yenileme.md": once(118),
  "kararlar/ADR-005-imlec-sayfalama.md": once(61),
  "api/siparis.md": once(55),
};

export const politika = [
  { id: "k1", ad: "Yıkıcı komutlar", aciklama: "Geri alınamaz dosya ve veri silme", karar: "ret", hedef: "komut", desenler: ["rm\\s+-rf", "git\\s+reset\\s+--hard", "drop\\s+table", "git\\s+clean\\s+-f"], araclar: ["Bash"], etkin: true },
  { id: "k2", ad: "Gizli dosyalar", aciklama: "Ortam değişkenleri, anahtarlar", karar: "ret", hedef: "yol", desenler: ["\\.env", "\\.pem$", "id_rsa"], araclar: [], etkin: true },
  { id: "k3", ad: "Çalışma alanı dışına yazma", aciklama: "Worktree dışındaki her yol", karar: "ret", hedef: "yol", desenler: ["^/(?!home/furkan/\\.arnorg/calisma/)"], araclar: ["Write", "Edit"], etkin: true },
  { id: "k4", ad: "Dışarı push ve yayın", aciklama: "Uzak repoya yazma, paket yayını, dağıtım", karar: "sor", hedef: "komut", desenler: ["git\\s+push", "npm\\s+publish", "dokploy"], araclar: ["Bash"], etkin: true },
  { id: "k5", ad: "Ağ erişimi", aciklama: "İzinli alan adları dışı", karar: "sor", hedef: "url", desenler: ["^https?://(?!(github\\.com|registry\\.npmjs\\.org|owasp\\.org))"], araclar: ["WebFetch"], etkin: true },
  { id: "k6", ad: "Test komutları", aciklama: "Testler her zaman serbest", karar: "izin", hedef: "komut", desenler: ["^npm\\s+(run\\s+)?test", "vitest"], araclar: ["Bash"], etkin: true },
];

function kayit(id, dakikaOnce, ajanId, ajanAd, arac, girdiOzeti, karar, kural, neden = null) {
  return { id, projeId: "siparis-paneli", ajanId, ajanAd, arac, girdiOzeti, karar, kural, neden, aracKimligi: `toolu_${id}`, zaman: once(dakikaOnce) };
}

export const denetim = [
  kayit("d1", 3, "deniz", "Deniz", "Bash", "git push origin main", "sor", "Dışarı push ve yayın"),
  kayit("d2", 4, "ece", "Ece", "Write", "src/ekranlar/SiparisListesi.tsx", "izin", null),
  kayit("d3", 6, "mert", "Mert", "Bash", "rm -rf tests/eski", "ret", "Yıkıcı komutlar", "Desen: rm\\s+-rf"),
  kayit("d4", 7, "deniz", "Deniz", "Bash", "npm test -- api/siparisler", "izin", "Test komutları"),
  kayit("d5", 9, "ece", "Ece", "Read", ".env.local", "ret", "Gizli dosyalar"),
  kayit("d6", 11, "kerem", "Kerem", "Write", ".arnorg/notlar/kararlar/ADR-004-jeton-yenileme.md", "degisti", null, "Not başlığına yazar ve tarih eklendi"),
  kayit("d7", 13, "onur", "Onur", "WebFetch", "https://owasp.org/Top10", "izin", "Ağ erişimi"),
  kayit("d8", 15, "kerem", "Kerem", "Grep", "\"refreshToken\" src/", "izin", null),
  kayit("d9", 16, "ada", "Ada", "mcp__arnorg__gorev_guncelle", "T-27 → Planlandı", "izin", null),
  kayit("d10", 19, "ece", "Ece", "Bash", "npm run test -- liste", "izin", "Test komutları"),
  kayit("d11", 22, "deniz", "Deniz", "Edit", "src/sunucu/siparisRotalari.ts", "izin", null),
  kayit("d12", 24, "mert", "Mert", "mcp__arnorg__mesaj_gonder", "#genel · T-24 şeması değişti mi?", "izin", null),
  kayit("d13", 27, "deniz", "Deniz", "Write", "tests/api/sayfalama.test.ts", "izin", null),
  kayit("d14", 31, "ada", "Ada", "mcp__arnorg__hafiza_ara", "\"ödeme sağlayıcısı\"", "izin", null),
  kayit("d15", 34, "ece", "Ece", "Bash", "curl https://cdn.example.com/ikon.svg", "ret", "Ağ erişimi", "Kurul reddetti"),
  kayit("d16", 40, "kerem", "Kerem", "Read", "src/auth/jeton.ts", "izin", null),
];

export const onaylar = [
  {
    id: "o1",
    projeId: "siparis-paneli",
    ajanId: "deniz",
    tur: "arac",
    baslik: "Bash · git push origin main",
    ayrinti: "T-24 değişikliklerini main'e doğrudan göndermek istiyor.",
    veri: { arac: "Bash", girdi: { command: "git push origin main", description: "Ana dala gönder" }, kural: "Dışarı push ve yayın → onaya sor", aracKimligi: "toolu_01Q7Xk" },
    durum: "bekliyor",
    olusturma: once(3),
    sonGecerlilik: sonra(9),
    sonuclanma: null,
    not: null,
  },
  {
    id: "o2",
    projeId: "siparis-paneli",
    ajanId: "ada",
    tur: "ise_alim",
    baslik: "Aras · Güvenlik uzmanı",
    ayrinti: "Ödeme entegrasyonu öncesi oturum ve jeton akışlarının bağımsız denetimi, bağımlılık taraması.",
    veri: { ad: "Aras", rol: "guvenlik", model: "sonnet", yoneticiId: "kerem", gunlukButceUsd: 6, talimatEki: "OWASP ASVS 4 düzey 2 ile denetle; bulguları ADR olarak yaz." },
    durum: "bekliyor",
    olusturma: once(18),
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
  },
  {
    id: "o3",
    projeId: "siparis-paneli",
    ajanId: "onur",
    tur: "birlestirme",
    baslik: "T-22 Ürün kataloğu API → main",
    ayrinti: "Onur iki turda inceledi ve onayladı. Çakışma yok, testler geçti.",
    veri: { gorevId: "g22", dal: "arnorg/deniz/T-22", hedefDal: "main", dosyaSayisi: 6, eklenen: 214, silinen: 12, testler: "48/48 geçti" },
    durum: "bekliyor",
    olusturma: once(41),
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
  },
  {
    id: "o4",
    projeId: "siparis-paneli",
    ajanId: "deniz",
    tur: "butce",
    baslik: "Deniz · günlük bütçe +$3",
    ayrinti: "T-24 sayfalama testleri beklenenden uzun sürdü. Kalan iş tahmini 40 dakika.",
    veri: { ajanId: "deniz", mevcutUsd: 5, istenenUsd: 8 },
    durum: "bekliyor",
    olusturma: once(12),
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
  },
  {
    id: "o5",
    projeId: "siparis-paneli",
    ajanId: "ada",
    tur: "genel",
    baslik: "Ödeme sağlayıcısı: iyzico",
    ayrinti: "Üç sağlayıcı karşılaştırıldı; yerel kart desteği ve komisyon nedeniyle iyzico önerildi.",
    veri: null,
    durum: "onaylandi",
    olusturma: once(60 * 26),
    sonGecerlilik: null,
    sonuclanma: once(60 * 25),
    not: "Sprint 4'te başlansın.",
  },
  {
    id: "o6",
    projeId: "siparis-paneli",
    ajanId: "mert",
    tur: "arac",
    baslik: "Bash · rm -rf tests/eski",
    ayrinti: "Eski test klasörünü silmek istedi.",
    veri: { arac: "Bash", girdi: { command: "rm -rf tests/eski" }, kural: "Yıkıcı komutlar", aracKimligi: "toolu_01Mx2" },
    durum: "reddedildi",
    olusturma: once(7),
    sonGecerlilik: null,
    sonuclanma: once(6),
    not: "Klasörü git rm ile kaldır, PR'da göreyim.",
  },
];

// ---------------------------------------------------------------------------
// Ajan akışları
// ---------------------------------------------------------------------------

const ADA_RAPORU = `## Sprint 3 · 2. gün

Sprint planının **yüzde 27'si** tamamlandı. Jeton yenileme (T-21) ve sipariş API'si (T-24) yolunda; T-26 liste ekranı bugün incelemeye girebilir.

- **T-19** iki güvenlik bulgusuyla Ece'ye geri döndü: oturum süresi sabit kodlanmış, yenileme jetonunda yarış durumu var. ADR-004'teki istemci kilidiyle düzeliyor.
- **T-22** Onur'dan onay aldı; birleştirme kararı sizde.
- **Bütçe:** bugün $13,30 harcandı, günlük sınır $40. Deniz sınırına yakın; +$3 teklifi Onaylar'da.

Ödeme işine geçmeden önce bir **güvenlik uzmanı** almamızı öneriyorum. Teklif ve gerekçe Onaylar'da.`;

const DENIZ_ROTA_OKUMA = `import type { FastifyInstance } from "fastify";
import { siparisleriListele, siparisOlustur } from "./veritabani";

export async function siparisRotalari(app: FastifyInstance) {
  app.get("/siparisler", async (istek) => {
    const { limit = 25 } = istek.query as { limit?: number };
    return siparisleriListele({ limit });
  });
  …`;

const VITEST_GECTI = ` RUN  v5.0.3 /home/furkan/.arnorg/calisma/siparis-paneli/deniz

 ✓ tests/api/siparisler.test.ts (6 tests) 41ms
 ✓ tests/api/sayfalama.test.ts (4 tests) 18ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  612ms`;

const VITEST_KALDI = ` RUN  v5.0.3 /home/furkan/.arnorg/calisma/siparis-paneli/deniz

 ✓ tests/api/siparisler.test.ts (6 tests) 39ms
 ❯ tests/api/sayfalama.test.ts (4 tests | 1 failed) 22ms
   × son sayfada sonrakiImlec null döner
     → expected 'eyJpZCI6MTMwfQ' to be null

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 9 passed (10)`;

/** [dakikaOnce, tur, alanlar] listesinden akış öğeleri üretir */
function akisUret(ajanId, adimlar) {
  return adimlar.map(([dak, tur, alanlar], i) => ({ id: `${ajanId}-a${i + 1}`, ajanId, zaman: once(dak), tur, ustAracKimligi: null, ...alanlar }));
}

const K = CALISMA_KOKU;

export const akislar = {
  ada: akisUret("ada", [
    [95, "kullanici", { metin: "Günlük durum raporunu hazırla; bütçe ve tıkanan işleri öne çıkar." }],
    [94, "dusunce", { metin: "Önce panodaki durumları ve dünkü kanal mesajlarını okumalıyım.\nSonra bütçe tablosuna bakıp sınırına yaklaşanları belirtirim." }],
    [94, "arac_cagrisi", { arac: "mcp__arnorg__kanal_oku", aracKimligi: "t-ada-1", girdi: { kanal: "genel", sinir: 30 } }],
    [94, "arac_sonucu", { aracKimligi: "t-ada-1", metin: "30 mesaj okundu (genel)." }],
    [93, "arac_cagrisi", { arac: "mcp__arnorg__gorev_guncelle", aracKimligi: "t-ada-2", girdi: { gorev: "T-27", durum: "planlandi" } }],
    [93, "arac_sonucu", { aracKimligi: "t-ada-2", metin: "T-27 → Planlandı" }],
    [92, "asistan", { metin: "Günaydın. Dünkü durum #genel kanalında; T-24 ve T-26 bugünün önceliği." }],
    [92, "sonuc", { maliyetUsd: 0.18 }],
    [20, "kullanici", { metin: "Ödeme işine ne zaman geçebiliriz?" }],
    [19, "arac_cagrisi", { arac: "mcp__arnorg__hafiza_ara", aracKimligi: "t-ada-3", girdi: { sorgu: "ödeme sağlayıcısı" } }],
    [19, "arac_sonucu", { aracKimligi: "t-ada-3", metin: "2 sonuç: kararlar/ödeme-sağlayıcısı (onaylandı: iyzico), sozluk.md" }],
    [18, "arac_cagrisi", { arac: "mcp__arnorg__onay_iste", aracKimligi: "t-ada-4", girdi: { tur: "ise_alim", baslik: "Aras · Güvenlik uzmanı" } }],
    [18, "arac_sonucu", { aracKimligi: "t-ada-4", metin: "Onay isteği açıldı: o2" }],
    [11, "asistan", { metin: ADA_RAPORU }],
    [11, "sonuc", { maliyetUsd: 0.41 }],
  ]),
  deniz: akisUret("deniz", [
    [58, "sistem", { metin: "Oturum açıldı · arnorg/deniz/T-24 · sonnet" }],
    [58, "kullanici", { metin: "T-24'e başla: Sipariş API uç noktaları. Kabul ölçütü: GET /siparisler imleçle sayfalanır, POST doğrular, testler geçer." }],
    [57, "dusunce", { metin: "Mevcut rota dosyası ofset kullanıyor olabilir.\nADR-005 imleç diyor; önce rotaları ve veritabanı katmanını okuyayım." }],
    [57, "asistan", { metin: "T-24 için önce mevcut rotaları ve **ADR-005**'i okuyorum." }],
    [57, "arac_cagrisi", { arac: "Read", aracKimligi: "t-dz-1", girdi: { file_path: `${K}/deniz/src/sunucu/siparisRotalari.ts` } }],
    [57, "arac_sonucu", { aracKimligi: "t-dz-1", metin: DENIZ_ROTA_OKUMA }],
    [56, "arac_cagrisi", { arac: "Grep", aracKimligi: "t-dz-2", girdi: { pattern: "imlec|cursor", path: `${K}/deniz/src` } }],
    [56, "arac_sonucu", { aracKimligi: "t-dz-2", metin: "src/sunucu/veritabani.ts:41:  // TODO imleç desteği" }],
    [55, "arac_cagrisi", { arac: "Task", aracKimligi: "t-dz-task", girdi: { description: "Sayfalama kenar durumlarını araştır", prompt: "İmleç tabanlı sayfalamada son sayfa, boş liste ve silinen kayıt durumlarını listele." } }],
    [55, "asistan", { metin: "Kenar durumlarını tarıyorum: son sayfa, boş liste, imleç sonrası silinen kayıt.", ustAracKimligi: "t-dz-task" }],
    [54, "arac_cagrisi", { arac: "Read", aracKimligi: "t-dz-sub1", girdi: { file_path: `${K}/deniz/.arnorg/notlar/kararlar/ADR-005-imlec-sayfalama.md` }, ustAracKimligi: "t-dz-task" }],
    [54, "arac_sonucu", { aracKimligi: "t-dz-sub1", metin: "# ADR-005 · İmleç tabanlı sayfalama\n…", ustAracKimligi: "t-dz-task" }],
    [53, "arac_sonucu", { aracKimligi: "t-dz-task", metin: "Üç kenar durumu: (1) son sayfada sonrakiImlec null, (2) boş listede 200 + boş dizi, (3) imleçteki kayıt silinmişse bir sonraki büyük kimlikten devam." }],
    [52, "arac_cagrisi", { arac: "Write", aracKimligi: "t-dz-3", girdi: { file_path: `${K}/deniz/src/sunucu/sayfalama.ts`, content: "export function imleciCoz(…" } }],
    [52, "arac_sonucu", { aracKimligi: "t-dz-3", metin: "Dosya oluşturuldu." }],
    [50, "arac_cagrisi", { arac: "Edit", aracKimligi: "t-dz-4", girdi: { file_path: `${K}/deniz/src/sunucu/siparisRotalari.ts`, old_string: "const { limit = 25 } = istek.query", new_string: "const { limit = 25, imlec } = istek.query\n    const sayfa = imleciCoz(imlec)" } }],
    [50, "arac_sonucu", { aracKimligi: "t-dz-4", metin: "Dosya güncellendi." }],
    [48, "arac_cagrisi", { arac: "Write", aracKimligi: "t-dz-5", girdi: { file_path: `${K}/deniz/tests/api/sayfalama.test.ts`, content: "…" } }],
    [48, "arac_sonucu", { aracKimligi: "t-dz-5", metin: "Dosya oluşturuldu." }],
    [46, "arac_cagrisi", { arac: "Bash", aracKimligi: "t-dz-6", girdi: { command: "npm test -- api/", description: "API testlerini çalıştır" } }],
    [46, "arac_sonucu", { aracKimligi: "t-dz-6", metin: VITEST_KALDI, hata: true }],
    [45, "asistan", { metin: "Son sayfada `sonrakiImlec` null dönmüyor; sınır kontrolü `<=` olmalı. Düzeltiyorum." }],
    [45, "arac_cagrisi", { arac: "Edit", aracKimligi: "t-dz-7", girdi: { file_path: `${K}/deniz/src/sunucu/sayfalama.ts`, old_string: "kayitlar.length < limit", new_string: "kayitlar.length <= limit" } }],
    [45, "arac_sonucu", { aracKimligi: "t-dz-7", metin: "Dosya güncellendi." }],
    [44, "arac_cagrisi", { arac: "Bash", aracKimligi: "t-dz-8", girdi: { command: "npm test -- api/", description: "API testlerini yeniden çalıştır" } }],
    [44, "arac_sonucu", { aracKimligi: "t-dz-8", metin: VITEST_GECTI }],
    [43, "sonuc", { maliyetUsd: 0.62 }],
    [24, "kullanici", { metin: "Kerem: @Deniz alan adı sonrakiImlec olsun, Ece istemcide bunu bekliyor." }],
    [23, "asistan", { metin: "Tamam, yanıt alanı zaten `sonrakiImlec`. Ece'ye kanaldan haber veriyorum." }],
    [22, "arac_cagrisi", { arac: "mcp__arnorg__mesaj_gonder", aracKimligi: "t-dz-9", girdi: { kanal: "muhendislik", metin: "@Ece alan adı sonrakiImlec, son sayfada null gelir." } }],
    [22, "arac_sonucu", { aracKimligi: "t-dz-9", metin: "Mesaj #muhendislik kanalına yazıldı." }],
    [21, "sonuc", { maliyetUsd: 0.09 }],
    [4, "asistan", { metin: "Testler geçti. Değişiklikleri gönderiyorum." }],
    [3, "arac_cagrisi", { arac: "Bash", aracKimligi: "toolu_01Q7Xk", girdi: { command: "git push origin main", description: "Ana dala gönder" } }],
    [3, "sistem", { metin: "Denetim: \"Dışarı push ve yayın\" kuralı · kurulun kararı bekleniyor" }],
  ]),
  ece: akisUret("ece", [
    [40, "kullanici", { metin: "T-26: Sipariş listesi ekranı. Tasarım sistemindeki Tablo ve Rozet bileşenlerini kullan; imleçle sonraki sayfa." }],
    [39, "arac_cagrisi", { arac: "Read", aracKimligi: "t-ec-1", girdi: { file_path: `${K}/ece/src/bilesenler/Tablo.tsx` } }],
    [39, "arac_sonucu", { aracKimligi: "t-ec-1", metin: "export function Tablo<T>({ satirlar, sutunlar, yukleniyor }: TabloOzellikleri<T>) { … }" }],
    [36, "arac_cagrisi", { arac: "Write", aracKimligi: "t-ec-2", girdi: { file_path: `${K}/ece/src/bilesenler/Rozet.tsx`, content: "…" } }],
    [36, "arac_sonucu", { aracKimligi: "t-ec-2", metin: "Dosya oluşturuldu." }],
    [30, "arac_cagrisi", { arac: "Edit", aracKimligi: "t-ec-3", girdi: { file_path: `${K}/ece/src/ekranlar/SiparisListesi.tsx`, old_string: "…", new_string: "…" } }],
    [30, "arac_sonucu", { aracKimligi: "t-ec-3", metin: "Dosya güncellendi." }],
    [9, "arac_cagrisi", { arac: "Read", aracKimligi: "t-ec-4", girdi: { file_path: `${K}/ece/.env.local` } }],
    [9, "arac_sonucu", { aracKimligi: "t-ec-4", metin: "ArnOrg politikası reddetti: Gizli dosyalar (.env)", hata: true }],
    [8, "asistan", { metin: "Ortam dosyasına erişimim yok; API adresini `vite.config.ts` içindeki vekilden alıyorum." }],
  ]),
  kerem: akisUret("kerem", [
    [120, "kullanici", { metin: "T-21: Jeton yenileme mimarisini ADR olarak yaz; Deniz ve Ece için uygulama notu çıkar." }],
    [118, "arac_cagrisi", { arac: "mcp__arnorg__not_yaz", aracKimligi: "t-kr-1", girdi: { yol: "kararlar/ADR-004-jeton-yenileme.md" } }],
    [118, "arac_sonucu", { aracKimligi: "t-kr-1", metin: "Not yazıldı (başlığa yazar ve tarih eklendi)." }],
    [15, "arac_cagrisi", { arac: "Grep", aracKimligi: "t-kr-2", girdi: { pattern: "refreshToken", path: `${K}/kerem/src` } }],
    [15, "arac_sonucu", { aracKimligi: "t-kr-2", metin: "src/auth/jetonDeposu.ts:12: const refreshToken = …" }],
  ]),
  mert: akisUret("mert", [
    [51, "kullanici", { metin: "Deniz: @Mert şema notlar/api/siparis.md içinde." }],
    [51, "asistan", { metin: "Aldım. T-24 incelemeye geçince E2E testlerini başlatıyorum." }],
    [7, "arac_cagrisi", { arac: "Bash", aracKimligi: "toolu_01Mx2", girdi: { command: "rm -rf tests/eski", description: "Eski testleri sil" } }],
    [6, "arac_sonucu", { aracKimligi: "toolu_01Mx2", metin: "Kurul reddetti: Klasörü git rm ile kaldır, PR'da göreyim.", hata: true }],
    [6, "sonuc", { maliyetUsd: 0.05 }],
  ]),
  onur: akisUret("onur", [
    [36, "kullanici", { metin: "T-19 incelemesini yap." }],
    [35, "arac_cagrisi", { arac: "Read", aracKimligi: "t-on-1", girdi: { file_path: `${K}/onur/src/auth/oturum.ts` } }],
    [35, "arac_sonucu", { aracKimligi: "t-on-1", metin: "const sure = 3600; …" }],
    [34, "asistan", { metin: "İki bulgu:\n\n1. Oturum süresi `3600` olarak sabit kodlanmış; `ayarlar.oturumSuresiSn` kullanılmalı.\n2. İki sekme aynı anda yenileme yaparsa aynı yenileme jetonu iki kez gönderiliyor. ADR-004'teki istemci kilidi gerekli.\n\nT-19'u Ece'ye geri gönderiyorum." }],
    [34, "sonuc", { maliyetUsd: 0.33 }],
    [33, "sistem", { metin: "Oturum kapatıldı" }],
  ]),
};
