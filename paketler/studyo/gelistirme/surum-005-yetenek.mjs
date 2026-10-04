// Sahte çekirdeğin 0.0.5 "yetenek" davranışları: yetenek kataloğu ve rol varsayılanları, ajanlarda yetenekler alanı
// (PATCH ile değişir, işe alınan rolünün varsayılanlarını alır), Araştırmacı rolü, ayarlarda web bloğu, yerleşik
// arama motorlarının durumu, kurulun deneme araması ve okuması (sabit örnekler), Kerem'in akışında web_ara, web_oku
// ve arastirma_kaydet çağrıları.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır (surum-004-*.mjs deseni)

import { ceviri } from "./dil.mjs";

/** Çekirdekteki YETENEKLER (paketler/ortak) ile aynı katalog */
const YETENEKLER = [
  {
    kimlik: "web_arama",
    ad: "Web araması",
    aciklama: "Yerleşik meta arama: birçok arama motoru birlikte sorgulanır, sonuçlar birleştirilip sıralanır.",
    en: { ad: "Web search", aciklama: "Built-in meta search: several search engines are queried together and the results are merged and ranked." },
    araclar: ["mcp__arnorg__web_ara"],
  },
  {
    kimlik: "web_okuma",
    ad: "Sayfa okuma",
    aciklama: "Web sayfasını, PDF'i ya da JSON'u temiz Markdown'a çevirip parça parça okur.",
    en: { ad: "Page reading", aciklama: "Turns a web page, PDF or JSON into clean Markdown and reads it piece by piece." },
    araclar: ["mcp__arnorg__web_oku"],
  },
  {
    kimlik: "arastirma",
    ad: "Araştırma notu",
    aciklama: "Bulguları kaynaklarıyla notlar/arastirma altına yazar, kısa özetini proje hafızasına ekler.",
    en: { ad: "Research notes", aciklama: "Writes findings with their sources under notlar/arastirma and adds a short summary to project memory." },
    araclar: ["mcp__arnorg__arastirma_kaydet"],
  },
  {
    kimlik: "paket_bilgisi",
    ad: "Paket bilgisi",
    aciklama: "npm, PyPI ve crates.io'dan son sürüm, lisans, indirme sayısı ve depo adresi.",
    en: { ad: "Package info", aciklama: "Latest version, license, downloads and repository from npm, PyPI and crates.io." },
    araclar: ["mcp__arnorg__paket_bilgisi"],
  },
  {
    kimlik: "github_arastirma",
    ad: "GitHub araştırması",
    aciklama: "GitHub'da depo, issue ve kod araması; gh girişi varsa onun belirteciyle.",
    en: { ad: "GitHub research", aciklama: "Searches GitHub repositories, issues and code; with the gh token when signed in." },
    araclar: ["mcp__arnorg__github_ara"],
  },
  {
    kimlik: "claude_web",
    ad: "Claude Code web araçları",
    aciklama: "Claude Code'un kendi WebSearch ve WebFetch araçları; yerleşik araçlar sonuç vermezse yedek.",
    en: { ad: "Claude Code web tools", aciklama: "Claude Code's own WebSearch and WebFetch tools; a fallback when the built-in tools find nothing." },
    araclar: ["WebSearch", "WebFetch"],
  },
];
const KIMLIKLER = YETENEKLER.map((y) => y.kimlik);

/** Çekirdekteki ROL_YETENEKLERI (paketler/cekirdek/src/yetenekler.ts) ile aynı */
const ROL_YETENEKLERI = {
  ceo: ["web_arama", "web_okuma", "arastirma", "claude_web"],
  cto: ["web_arama", "web_okuma", "arastirma", "paket_bilgisi", "github_arastirma", "claude_web"],
  backend: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  frontend: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  fullstack: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  test: ["web_arama", "web_okuma", "github_arastirma", "claude_web"],
  inceleme: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  guvenlik: ["web_arama", "web_okuma", "arastirma", "paket_bilgisi", "github_arastirma", "claude_web"],
  devops: ["web_arama", "web_okuma", "paket_bilgisi", "github_arastirma", "claude_web"],
  tasarim: ["web_arama", "web_okuma", "arastirma", "claude_web"],
  yazar: ["web_arama", "web_okuma", "claude_web"],
  arastirmaci: [...KIMLIKLER],
};

const sirala = (liste) => KIMLIKLER.filter((k) => liste.includes(k));
const rolYetenekleri = (rol) => sirala(["web_arama", "web_okuma", ...(ROL_YETENEKLERI[rol] ?? ["claude_web"])]);

/** Yerleşik motorlar (çekirdekteki MOTORLAR sırasıyla) */
const MOTORLAR = [
  { kimlik: "bing", ad: "Bing", tur: "genel", kategoriler: ["genel", "kod", "bilim"] },
  { kimlik: "duckduckgo", ad: "DuckDuckGo", tur: "genel", kategoriler: ["genel", "kod", "bilim"] },
  { kimlik: "brave", ad: "Brave", tur: "genel", kategoriler: ["genel", "kod", "bilim"] },
  { kimlik: "mojeek", ad: "Mojeek", tur: "genel", kategoriler: ["genel", "kod"] },
  { kimlik: "wikipedia", ad: "Wikipedia", tur: "genel", kategoriler: ["genel", "bilim"] },
  { kimlik: "bing_haber", ad: "Bing Haberler", tur: "genel", kategoriler: ["haber"] },
  { kimlik: "stackoverflow", ad: "Stack Overflow", tur: "teknik", kategoriler: ["kod"] },
  { kimlik: "github", ad: "GitHub", tur: "teknik", kategoriler: ["kod"] },
  { kimlik: "npm", ad: "npm", tur: "teknik", kategoriler: ["kod"] },
  { kimlik: "mdn", ad: "MDN", tur: "teknik", kategoriler: ["kod"] },
  { kimlik: "hackernews", ad: "Hacker News", tur: "teknik", kategoriler: ["kod", "haber"] },
  { kimlik: "arxiv", ad: "arXiv", tur: "teknik", kategoriler: ["bilim"] },
  { kimlik: "searxng", ad: "SearXNG", tur: "dis", kategoriler: ["genel", "kod", "haber", "bilim"] },
];

const dakikaOnce = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
const dakikaSonra = (dk) => new Date(Date.now() + dk * 60_000).toISOString();

/** Örnek sonuçlar: kategoriye göre birkaç gerçekçi kayıt */
const ORNEK_SONUCLAR = {
  genel: [
    { baslik: "Auto Update - electron-builder", adres: "https://www.electron.build/auto-update", motorlar: ["bing", "duckduckgo", "brave"], ozet: ceviri("electron-updater; GitHub sürümleri, S3 ve genel sunucudan güncellemeyi destekler. Özel depo bir belirteç ister.", "electron-updater supports updates from GitHub releases, S3 and generic servers. A private repository needs a token.") },
    { baslik: "Updating Applications | Electron", adres: "https://www.electronjs.org/docs/latest/tutorial/updates", motorlar: ["bing", "duckduckgo"], ozet: ceviri("Electron uygulamasına otomatik güncelleme eklemenin yolları: update.electronjs.org, statik depolama, kendi sunucunuz.", "Ways to add automatic updates to an Electron app: update.electronjs.org, static storage, your own server.") },
    { baslik: "electron-updater - npm", adres: "https://www.npmjs.com/package/electron-updater", motorlar: ["brave", "mojeek"], ozet: "Cross platform updater for electron applications." },
    { baslik: "Electron (software framework) - Wikipedia", adres: "https://en.wikipedia.org/wiki/Electron_(software_framework)", motorlar: ["wikipedia"], ozet: ceviri("Electron, OpenJS Vakfı'nın geliştirdiği özgür ve açık kaynak bir yazılım çatısıdır.", "Electron is a free and open-source software framework developed by the OpenJS Foundation.") },
  ],
  kod: [
    { baslik: "Electron Autoupdater with Private GitHub Repository?", adres: "https://stackoverflow.com/questions/57069210/electron-autoupdater-with-private-github-repo", motorlar: ["stackoverflow", "bing"], ozet: ceviri("skor 14 · 3 yanıt · kabul edilmiş yanıt var · [electron, electron-builder]", "score 14 · 3 answers · has an accepted answer · [electron, electron-builder]") },
    { baslik: "electron-userland/electron-builder", adres: "https://github.com/electron-userland/electron-builder", motorlar: ["github", "duckduckgo"], ozet: "★ 14.012 · TypeScript · A complete solution to package and build a ready for distribution Electron app with auto update support" },
    { baslik: "Auto Update - electron-builder", adres: "https://www.electron.build/auto-update", motorlar: ["bing", "brave"], ozet: ceviri("GitHub sağlayıcısı private: true ve GH_TOKEN ile özel depodan okur; belirteç uygulamaya gömülmemeli.", "The GitHub provider reads a private repo with private: true and GH_TOKEN; do not ship the token in the app.") },
    { baslik: "electron-updater@6.8.9", adres: "https://www.npmjs.com/package/electron-updater", motorlar: ["npm"], ozet: ceviri("Cross platform updater for electron applications · haftalık 4.422.781 indirme", "Cross platform updater for electron applications · 4,422,781 weekly downloads") },
    { baslik: "Signature Validation Bypass Leading to RCE in Electron-Updater", adres: "https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html", motorlar: ["hackernews"], ozet: ceviri("2 puan · 0 yorum · tartışma: https://news.ycombinator.com/item?id=22406613", "2 points · 0 comments · discussion: https://news.ycombinator.com/item?id=22406613") },
  ],
  haber: [
    { baslik: "Electron 39 released with Chromium 142", adres: "https://www.electronjs.org/blog/electron-39-0", motorlar: ["bing_haber"], ozet: ceviri("Electron blogu · Yeni sürüm Chromium 142, Node 22.20 ve V8 14.2 ile geliyor.", "Electron blog · The new release ships Chromium 142, Node 22.20 and V8 14.2."), tarih: dakikaOnce(60 * 30) },
    { baslik: "Show HN: Shipping private Electron updates without a token in the app", adres: "https://news.ycombinator.com/item?id=46132119", motorlar: ["hackernews"], ozet: ceviri("118 puan · 46 yorum", "118 points · 46 comments"), tarih: dakikaOnce(60 * 50) },
  ],
  bilim: [
    { baslik: "Software Update Mechanisms: A Systematic Review", adres: "https://arxiv.org/abs/2409.01234v2", motorlar: ["arxiv"], ozet: ceviri("A. Yılmaz, B. Kaya ve diğerleri — Güncelleme sistemlerinin güvenlik özelliklerini karşılaştıran bir derleme.", "A. Yilmaz, B. Kaya et al. — A review comparing the security properties of update systems."), tarih: dakikaOnce(60 * 24 * 300) },
    { baslik: "The Update Framework", adres: "https://en.wikipedia.org/wiki/The_Update_Framework", motorlar: ["wikipedia", "bing"], ozet: ceviri("TUF, yazılım güncelleme sistemlerini anahtar ele geçirilse bile korumak için tasarlanmış bir çatıdır.", "TUF is a framework designed to protect software update systems even if keys are compromised.") },
  ],
};

export function kur(c) {
  const { rota, rotalar, db, yay, ajanBul, Hata, roller } = c;
  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);

  // -------------------------------------------------------------------------
  // Araştırmacı rolü (çekirdekte rol kataloğunun son elemanı) ve ajanların yetenekleri
  // -------------------------------------------------------------------------
  if (roller && !roller.some((r) => r.kimlik === "arastirmaci")) {
    roller.push({
      kimlik: "arastirmaci",
      ad: ceviri("Araştırmacı", "Researcher"),
      aciklama: ceviri(
        "Teknoloji ve kütüphane karşılaştırması, belge okuma, pazar ve rakip araştırması yapar; kaynaklı araştırma notu yazar. Kod yazmaz.",
        "Compares technologies and libraries, reads documentation, researches markets and competitors, and writes sourced research notes. Does not write code.",
      ),
      varsayilanModel: "sonnet",
      talimat: "",
      yonetici: false,
    });
  }
  for (const a of db.ajanlar) a.yetenekler ??= rolYetenekleri(a.rol);
  // Örnek: Mert'in GitHub araştırması kapatılmış, Selin'e paket bilgisi açılmış
  const mert = ajanBul("mert");
  if (mert) mert.yetenekler = mert.yetenekler.filter((k) => k !== "github_arastirma");
  const selin = ajanBul("selin");
  if (selin) selin.yetenekler = sirala([...selin.yetenekler, "paket_bilgisi"]);

  rota("GET", "/api/yetenekler", () => YETENEKLER);
  rota("GET", "/api/yetenekler/roller", () => ROL_YETENEKLERI);

  // İşe alınan ajan rolünün varsayılan yeteneklerini alır
  const iseAl = rotalar.find((r) => r.yontem === "POST" && r.desen.test("/api/projeler/x/ajanlar"));
  const eskiIseAl = iseAl.isleyici;
  iseAl.isleyici = (istek) => {
    const a = eskiIseAl(istek);
    const kayit = ajanBul(a.id);
    if (kayit && !kayit.yetenekler) {
      kayit.yetenekler = rolYetenekleri(kayit.rol);
      ajanYay(kayit);
    }
    return kayit ?? a;
  };

  // PATCH /api/ajanlar/:aid yetenekler alanını da işler
  const yama = rotalar.find((r) => r.yontem === "PATCH" && r.desen.test("/api/ajanlar/x"));
  const eskiYama = yama.isleyici;
  yama.isleyici = (istek) => {
    const g = istek.govde ?? {};
    if (g.yetenekler !== undefined) {
      if (!Array.isArray(g.yetenekler)) throw new Hata(400, ceviri("Yetenekler bir liste olmalı.", "Capabilities must be a list."));
      const bilinmeyen = g.yetenekler.filter((k) => !KIMLIKLER.includes(k));
      if (bilinmeyen.length) throw new Hata(400, ceviri(`Bilinmeyen yetenek: ${bilinmeyen.join(", ")}`, `Unknown capability: ${bilinmeyen.join(", ")}`));
    }
    const a = eskiYama(istek);
    if (g.yetenekler !== undefined) {
      a.yetenekler = sirala(g.yetenekler);
      ajanYay(a);
    }
    return a;
  };

  // -------------------------------------------------------------------------
  // Ayarlar › web: PUT /api/ayarlar web bloğunu birleştirir ve doğrular
  // -------------------------------------------------------------------------
  db.ayarlar.web ??= { searxngAdresi: null, disOkuyucu: true, kapaliMotorlar: [] };
  const ayar = rotalar.find((r) => r.yontem === "PUT" && r.desen.test("/api/ayarlar"));
  const eskiAyar = ayar.isleyici;
  ayar.isleyici = (istek) => {
    const { web, ...geri } = istek.govde ?? {};
    if (web && typeof web === "object") {
      const yeni = { ...db.ayarlar.web };
      if (web.searxngAdresi !== undefined) {
        const t = String(web.searxngAdresi ?? "").trim();
        if (t && !/^https?:\/\/[^\s/]+/i.test(t.includes("://") ? t : `https://${t}`)) throw new Hata(400, ceviri(`Geçersiz SearXNG adresi: ${t}`, `Invalid SearXNG address: ${t}`));
        if (t && /^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:/i.test(t)) throw new Hata(400, ceviri("SearXNG adresi http ya da https olmalı.", "The SearXNG address must be http or https."));
        yeni.searxngAdresi = t ? (t.includes("://") ? t : `https://${t}`).replace(/\/search\/?$/, "").replace(/\/+$/, "") : null;
      }
      if (typeof web.disOkuyucu === "boolean") yeni.disOkuyucu = web.disOkuyucu;
      if (Array.isArray(web.kapaliMotorlar)) yeni.kapaliMotorlar = [...new Set(web.kapaliMotorlar.filter((m) => MOTORLAR.some((x) => x.kimlik === m)))];
      db.ayarlar.web = yeni;
    }
    return eskiAyar({ ...istek, govde: geri });
  };

  // -------------------------------------------------------------------------
  // Motor durumu: çoğu çalışıyor; Brave çok istekten 10 dk, DuckDuckGo bot doğrulamasından 1 sa askıda
  // -------------------------------------------------------------------------
  const kayitlar = Object.fromEntries(MOTORLAR.map((m) => [m.kimlik, { askiBitis: null, sonHata: null, sonHataZamani: null, sonBasari: dakikaOnce(7), basari: 6, hata: 0 }]));
  Object.assign(kayitlar.brave, { askiBitis: dakikaSonra(8), sonHata: ceviri("Brave çok fazla istek dedi (429)", "Brave said too many requests (429)"), sonHataZamani: dakikaOnce(2), basari: 4, hata: 1 });
  Object.assign(kayitlar.duckduckgo, { askiBitis: dakikaSonra(52), sonHata: ceviri("DuckDuckGo bot doğrulaması (anomaly) istedi", "DuckDuckGo asked for bot verification (anomaly)"), sonHataZamani: dakikaOnce(8), basari: 5, hata: 1 });
  Object.assign(kayitlar.arxiv, { sonBasari: null, basari: 0 });
  Object.assign(kayitlar.searxng, { sonBasari: null, basari: 0 });

  const durum = () => {
    const kapali = new Set(db.ayarlar.web.kapaliMotorlar);
    const simdi = Date.now();
    return {
      motorlar: MOTORLAR.map((m) => {
        const k = kayitlar[m.kimlik];
        const askida = !!k.askiBitis && Date.parse(k.askiBitis) > simdi;
        return {
          ...m,
          etkin: !kapali.has(m.kimlik) && (m.kimlik !== "searxng" || !!db.ayarlar.web.searxngAdresi),
          askida,
          askiBitis: askida ? k.askiBitis : null,
          sonHata: k.sonHata,
          sonHataZamani: k.sonHataZamani,
          sonBasari: k.sonBasari,
          basari: k.basari,
          hata: k.hata,
        };
      }),
      searxngAdresi: db.ayarlar.web.searxngAdresi,
      disOkuyucu: db.ayarlar.web.disOkuyucu,
      onbellek: { arama: 3, sayfa: 2 },
    };
  };
  rota("GET", "/api/web/durum", () => durum());
  rota("POST", "/api/web/askilari-kaldir", () => {
    for (const k of Object.values(kayitlar)) k.askiBitis = null;
    return durum();
  });

  // -------------------------------------------------------------------------
  // Kurulun deneme araması ve okuması (sabit örnekler)
  // -------------------------------------------------------------------------
  rota("POST", "/api/web/ara", async ({ govde }) => {
    const sorgu = String(govde?.sorgu ?? "").replace(/\s+/g, " ").trim();
    if (!sorgu) throw new Hata(400, ceviri("Arama sorgusu boş olamaz.", "The search query cannot be empty."));
    const kategori = ["genel", "kod", "haber", "bilim"].includes(govde?.kategori) ? govde.kategori : "genel";
    await new Promise((z) => setTimeout(z, 450));
    const d = durum();
    const secilen = d.motorlar.filter((m) => m.kategoriler.includes(kategori) && m.etkin);
    const askidakiler = secilen.filter((m) => m.askida).map((m) => m.kimlik);
    const sorgulanan = secilen.filter((m) => !m.askida);
    const hatalar = kategori === "kod" ? [{ motor: "mojeek", hata: ceviri("Mojeek erişimi reddetti (403)", "Mojeek denied access (403)") }].filter((h) => sorgulanan.some((m) => m.kimlik === h.motor)) : [];
    const yanitVerenler = sorgulanan.map((m) => m.kimlik).filter((k) => !hatalar.some((h) => h.motor === k));
    for (const k of yanitVerenler) Object.assign(kayitlar[k], { sonBasari: new Date().toISOString(), basari: kayitlar[k].basari + 1 });
    for (const h of hatalar) Object.assign(kayitlar[h.motor], { sonHata: h.hata, sonHataZamani: new Date().toISOString(), hata: kayitlar[h.motor].hata + 1, askiBitis: dakikaSonra(60) });
    const sonuclar = ORNEK_SONUCLAR[kategori]
      .map((r) => ({ ...r, motorlar: r.motorlar.filter((m) => yanitVerenler.includes(m)) }))
      .filter((r) => r.motorlar.length)
      .map((r, i) => ({ tarih: null, ...r, puan: Math.round((r.motorlar.length * 1.1) / (i + 1) * 1000) / 1000 }));
    return { sorgu, kategori, sayfa: 1, dil: govde?.dil ?? db.ayarlar.dil, sonuclar, yanitVerenler, hatalar, askidakiler, sureMs: 640 + Math.round(Math.random() * 300), onbellekten: false };
  });

  rota("POST", "/api/web/oku", ({ govde }) => {
    const adres = String(govde?.adres ?? "").trim();
    if (!/^https?:\/\//i.test(adres)) throw new Hata(400, ceviri(`Yalnız http ve https adresleri okunur.`, `Only http and https addresses can be read.`));
    const icerik = ceviri(
      "# Auto Update\n\nelectron-updater; GitHub sürümleri, Amazon S3 ve genel HTTP(S) sunucularından güncellemeyi destekler.\n\n| Sağlayıcı | Özel depo |\n| --- | --- |\n| GitHub | Belirteç ister |\n| Genel sunucu | Gerekmez |",
      "# Auto Update\n\nelectron-updater supports updates from GitHub releases, Amazon S3 and generic HTTP(S) servers.\n\n| Provider | Private repo |\n| --- | --- |\n| GitHub | Needs a token |\n| Generic server | Not needed |",
    );
    return { adres, sonAdres: adres, baslik: "Auto Update", site: "electron.build", yazar: null, tarih: null, tur: "html", kaynak: "yerel", icerik, baslangic: 0, toplam: icerik.length, devamVar: false, sonraki: null, baglantilar: [], uyarilar: [], onbellekten: false };
  });

  // -------------------------------------------------------------------------
  // Kerem'in akışı: T-21 için web araştırması (web_ara, web_oku, arastirma_kaydet) ve denetim kayıtları
  // -------------------------------------------------------------------------
  const kerem = ajanBul("kerem");
  if (kerem) {
    const RFC = "https://datatracker.ietf.org/doc/html/rfc9700";
    const NOT = `notlar/arastirma/${new Date().toISOString().slice(0, 10)}-yenileme-jetonu-rotasyonu.md`;
    const adimlar = [
      [14, "asistan", { metin: ceviri("ADR-004'teki yenileme jetonu rotasyonunu güncel öneriyle karşılaştırmak için kısa bir araştırma yapıyorum.", "I'm doing a short piece of research to compare the refresh token rotation in ADR-004 with current guidance.") }],
      [14, "arac_cagrisi", { arac: "mcp__arnorg__web_ara", aracKimligi: "t-kr-w1", girdi: { sorgu: "refresh token rotation reuse detection", kategori: "kod" } }],
      [
        14,
        "arac_sonucu",
        {
          aracKimligi: "t-kr-w1",
          metin: ceviri(
            'Web araması: "refresh token rotation reuse detection" · kod · sayfa 1 · en\nYanıt veren motorlar (6/8): bing, stackoverflow, github, npm, mdn, hackernews\nAskıda (sorgulanmadı): duckduckgo, brave\n\n1. RFC 9700: Best Current Practice for OAuth 2.0 Security\n   https://datatracker.ietf.org/doc/html/rfc9700\n   Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation…\n   [bing, hackernews · 2025-01-15]\n2. What is refresh token reuse detection?\n   https://stackoverflow.com/questions/68155321/what-is-refresh-token-reuse-detection\n   skor 41 · 4 yanıt · kabul edilmiş yanıt var · [oauth-2.0, jwt]\n   [stackoverflow]',
            'Web search: "refresh token rotation reuse detection" · kod · page 1 · en\nEngines that answered (6/8): bing, stackoverflow, github, npm, mdn, hackernews\nSuspended (not queried): duckduckgo, brave\n\n1. RFC 9700: Best Current Practice for OAuth 2.0 Security\n   https://datatracker.ietf.org/doc/html/rfc9700\n   Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation…\n   [bing, hackernews · 2025-01-15]\n2. What is refresh token reuse detection?\n   https://stackoverflow.com/questions/68155321/what-is-refresh-token-reuse-detection\n   score 41 · 4 answers · has an accepted answer · [oauth-2.0, jwt]\n   [stackoverflow]',
          ),
        },
      ],
      [13, "arac_cagrisi", { arac: "mcp__arnorg__web_oku", aracKimligi: "t-kr-w2", girdi: { adres: RFC } }],
      [
        13,
        "arac_sonucu",
        {
          aracKimligi: "t-kr-w2",
          metin: ceviri(
            "# RFC 9700: Best Current Practice for OAuth 2.0 Security\nAdres: https://datatracker.ietf.org/doc/html/rfc9700\nSite: datatracker.ietf.org · Tarih: 2025-01 · Tür: HTML · Kaynak: yerel\nKarakter 0–12000 / 98412 · devamı: web_oku adres=\"https://datatracker.ietf.org/doc/html/rfc9700\" baslangic=12000\n\n---\n\n## 4.14. Refresh Token Protection\n\nRefresh tokens for public clients MUST be sender-constrained or use refresh token rotation…",
            "# RFC 9700: Best Current Practice for OAuth 2.0 Security\nAddress: https://datatracker.ietf.org/doc/html/rfc9700\nSite: datatracker.ietf.org · Date: 2025-01 · Type: HTML · Source: local\nCharacters 0–12000 of 98412 · more: web_oku adres=\"https://datatracker.ietf.org/doc/html/rfc9700\" baslangic=12000\n\n---\n\n## 4.14. Refresh Token Protection\n\nRefresh tokens for public clients MUST be sender-constrained or use refresh token rotation…",
          ),
        },
      ],
      [12, "arac_cagrisi", { arac: "mcp__arnorg__web_oku", aracKimligi: "t-kr-w3", girdi: { adres: RFC, baslangic: 12000 } }],
      [12, "arac_sonucu", { aracKimligi: "t-kr-w3", metin: ceviri("Karakter 12000–24000 / 98412 · …yeniden kullanılan yenileme jetonu bütün jeton ailesini geçersiz kılmalıdır.", "Characters 12000–24000 of 98412 · …a reused refresh token should invalidate the whole token family.") }],
      [11, "asistan", { metin: ceviri("RFC 9700 §4.14: tarayıcı istemcisinde rotasyon şart, yeniden kullanılan jeton bütün aileyi düşürmeli. ADR-004'e ekliyorum ve kaynaklarıyla kaydediyorum.", "RFC 9700 §4.14: rotation is required for the browser client, and a reused token must drop the whole family. I'm adding this to ADR-004 and saving it with its sources.") }],
      [
        10,
        "arac_cagrisi",
        {
          arac: "mcp__arnorg__arastirma_kaydet",
          aracKimligi: "t-kr-w4",
          girdi: {
            baslik: ceviri("Yenileme jetonu rotasyonu ve yeniden kullanım tespiti", "Refresh token rotation and reuse detection"),
            ozet: ceviri("Tarayıcı istemcisinde yenileme jetonu her kullanımda değişmeli; yeniden kullanılan jeton bütün jeton ailesini geçersiz kılmalı.", "In the browser client the refresh token must change on every use; a reused token must invalidate the whole token family."),
            bulgular: "- RFC 9700 §4.14 …",
            kaynaklar: [
              { adres: RFC, baslik: "RFC 9700: Best Current Practice for OAuth 2.0 Security" },
              { adres: "https://stackoverflow.com/questions/68155321/what-is-refresh-token-reuse-detection", baslik: "What is refresh token reuse detection?" },
            ],
          },
        },
      ],
      [10, "arac_sonucu", { aracKimligi: "t-kr-w4", metin: ceviri(`Araştırma notu kaydedildi: ${NOT} (2 kaynak). Hafıza kaydı: 7c1e2a90.`, `Research note saved: ${NOT} (2 sources). Memory record: 7c1e2a90.`) }],
    ];
    const ogeler = adimlar.map(([dk, tur, alanlar], i) => ({ id: `kerem-w${i + 1}`, ajanId: "kerem", zaman: dakikaOnce(dk), tur, ustAracKimligi: null, ...alanlar }));
    db.akislar.kerem = [...(db.akislar.kerem ?? []), ...ogeler].sort((a, b) => a.zaman.localeCompare(b.zaman));

    const denetim = (id, dk, arac, girdiOzeti) => ({ id, projeId: kerem.projeId, ajanId: "kerem", ajanAd: kerem.ad, arac, girdiOzeti, karar: "izin", kural: null, neden: null, aracKimligi: id.replace("d-", "t-kr-"), altAjan: null, zaman: dakikaOnce(dk) });
    db.denetim.push(
      denetim("d-w1", 14, "mcp__arnorg__web_ara", "refresh token rotation reuse detection [kod]"),
      denetim("d-w2", 13, "mcp__arnorg__web_oku", RFC),
      denetim("d-w3", 12, "mcp__arnorg__web_oku", RFC),
      denetim("d-w4", 10, "mcp__arnorg__arastirma_kaydet", ceviri("Yenileme jetonu rotasyonu ve yeniden kullanım tespiti", "Refresh token rotation and reuse detection")),
    );
    db.denetim.sort((a, b) => b.zaman.localeCompare(a.zaman));
  }
}
