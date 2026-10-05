// Sahte çekirdeğin 0.0.8 seçenekli soruları: ajan kurula seçenekli soru sorar (secenekli_sor), seçenekler mesajın
// altında seçilir ve kurulun seçimi soran ajana kurul mesajı olarak gider ("Kurulun seçimi: 1) …; 3) … · Not: …"). CEO'nun
// #yonetim'e düz metinle yazdığı numaralı liste ve soru "Seçerek yanıtla" ile aynı uçtan yanıtlanır; kurula sorunun
// (kurula_sor) seçenekleri Onaylar'da ve açılır pencerede seçilir.
//
//   kur(c): sahte-sunucu.mjs'teki rota, db ve yardımcılarla çağrılır (surum-007-*.mjs deseni)
//
// Sipariş Paneli'nin CEO sohbetinde (tohum):
//   - Ada'nın yanıtlanmış seçenekli sorusu (kargo bildirim kanalları): seçilenler ve not kilitli, ardından kurulun yanıtı;
//   - kurulun QR menü isteği ve Ada'nın kullanıcının ekran görüntüsündeki kapsam önerisi (düz metin, satır içi 1) … 5)
//     listesi ve soru): "Seçerek yanıtla". Kurul seçince Ada açıklamalı tek seçimli bir soru sorar (başlangıç şablonu);
//     onu da yanıtlayınca kısa bir onayla devam eder.
//   - Onaylar'da Ada'nın kurula sorusu (QR menünün adresi, üç seçenek) bekliyor; geçmişte seçilerek yanıtlanmış bir soru.
//
// Uç: POST /api/mesajlar/:mid/secim (çekirdekteki secenek/index.ts gibi). Liste bulma ortak'taki metindekiSecenekler'in
// birebir kopyasıdır; ikisinin aynı sonucu verdiği studyo testinde denetlenir (secenekSahte.test.ts).
// Geliştirme uçları (yalnız sahte çekirdek):
//   POST /api/gelistirme/secenekli-soru  {tur?: "tek" | "coklu" | "acilir"}  Ada #yonetim'de seçenekli soru sorar
//   POST /api/gelistirme/secenekli-onay                                     Ada kurula seçenekli soru sorar (açılır pencere)

import { ceviri, kanalGorunenAdi } from "./dil.mjs";

const OFIS = "siparis-paneli";

// ---------------------------------------------------------------------------
// Düz metindeki seçenek listesi (ortak/src/index.ts metindekiSecenekler ile aynı)
// ---------------------------------------------------------------------------

const SINIR = { enAz: 2, enCok: 12, metin: 300, aciklama: 400, soru: 4000, not: 4000 };
const SORU_KISMI_SINIRI = 400;
const SORU_SONU = /[?？][\s"'”’»)\]*_]*$/u;
const SORU_ONCESI = /[?？][\s"'”’»)\]*_:]*$/u;
const SATIR_MADDESI = /^[ \t]*(?:\*\*)?(\d{1,2})(\)|\.|[ \t]?[-–])(?:\*\*)?[ \t]+(\S.*)$/u;
const SATIR_ICI_ISARET = /(?<![\p{L}\p{N}_.,/-])(\d{1,2})(\)|\.|[ \t]?[-–])(?=[ \t]+\S)/gu;
const ILK_AYRAC = /(?:^|[\n:;.!?？(—–])$/u;
const SONRAKI_AYRAC = /(?:[,;.\n]|(?:^|[\s,])(?:ve|veya|ya da|yahut|and|or))$/iu;
const SON_MADDE_SONU = /[.!?？](?=[ \t]+[\p{Lu}\p{N}"“'(]|[ \t]*(?:\n|$))|\n/u;

const maddeBicimi = (isaret) => (isaret.trim() === ")" ? ")" : isaret.trim() === "." ? "." : "-");

function maddeTemizle(ham) {
  let m = ham
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (let once = ""; once !== m; ) {
    once = m;
    m = m
      .replace(/[\s,;:]+$/u, "")
      .replace(/(?:^|[\s,])(?:ve|veya|ya da|yahut|and|or)$/iu, "")
      .trim();
  }
  return m.replace(/\.+$/u, "").trim();
}

function satirListesi(metin) {
  const satirlar = metin.split("\n");
  const baslar = [];
  let konum = 0;
  for (const s of satirlar) {
    baslar.push(konum);
    konum += s.length + 1;
  }
  const bloklar = [];
  let blok = null;
  let bos = 0;
  for (let i = 0; i < satirlar.length; i++) {
    const satir = satirlar[i];
    const m = SATIR_MADDESI.exec(satir);
    if (m) {
      const n = Number(m[1]);
      const bicim = maddeBicimi(m[2]);
      if (blok && n === blok.maddeler.length + 1 && bicim === blok.bicim) {
        blok.maddeler.push(m[3]);
        blok.son = i;
      } else {
        if (blok) bloklar.push(blok);
        blok = n === 1 ? { bas: i, son: i, maddeler: [m[3]], bicim } : null;
      }
      bos = 0;
    } else if (blok) {
      if (!satir.trim()) {
        if (++bos > 1) {
          bloklar.push(blok);
          blok = null;
        }
      } else if (/^[ \t]{2,}\S/.test(satir)) {
        blok.son = i;
        bos = 0;
      } else {
        bloklar.push(blok);
        blok = null;
      }
    }
  }
  if (blok) bloklar.push(blok);
  const son = bloklar.filter((b) => b.maddeler.length >= 2).at(-1);
  if (!son) return null;
  return { maddeler: son.maddeler, bas: baslar[son.bas], son: baslar[son.son] + satirlar[son.son].length };
}

function satirIciListe(metin) {
  const kosular = new Map();
  const biten = [];
  const bitir = (b) => {
    const k = kosular.get(b);
    if (k && k.length >= 2) biten.push(k);
    kosular.delete(b);
  };
  for (const m of metin.matchAll(SATIR_ICI_ISARET)) {
    const x = { bas: m.index, son: m.index + m[0].length, n: Number(m[1]) };
    const bicim = maddeBicimi(m[2]);
    const oncesi = metin.slice(Math.max(0, x.bas - 16), x.bas).replace(/[ \t]+$/u, "");
    if (x.n === 1) {
      bitir(bicim);
      if (ILK_AYRAC.test(oncesi)) kosular.set(bicim, [x]);
      continue;
    }
    const kosu = kosular.get(bicim);
    if (!kosu) continue;
    const ayniParagraf = !/\n[ \t]*\n/u.test(metin.slice(kosu[kosu.length - 1].son, x.bas));
    if (x.n === kosu.length + 1 && ayniParagraf && SONRAKI_AYRAC.test(oncesi)) kosu.push(x);
    else kosular.delete(bicim);
  }
  for (const b of [...kosular.keys()]) bitir(b);
  const liste = biten.sort((a, b) => b[b.length - 1].bas - a[a.length - 1].bas)[0];
  if (!liste) return null;
  const maddeler = [];
  for (let i = 0; i < liste.length - 1; i++) maddeler.push(metin.slice(liste[i].son, liste[i + 1].bas));
  const sonIsaret = liste[liste.length - 1];
  const kalan = metin.slice(sonIsaret.son);
  const bitis = SON_MADDE_SONU.exec(kalan);
  const sonMadde = bitis ? bitis.index : kalan.length;
  maddeler.push(kalan.slice(0, sonMadde));
  return { maddeler, bas: liste[0].bas, son: sonIsaret.son + sonMadde };
}

/** Ajanın kurula düz metinle yazdığı mesajdaki seçenek listesi; yoksa null (ortak: metindekiSecenekler) */
export function metindekiSecenekler(metin) {
  const duz = String(metin).replace(/\r\n?/g, "\n").trim();
  if (!duz || duz.length > 8000) return null;
  const adaylar = [satirListesi(duz), satirIciListe(duz)].filter((a) => a !== null);
  const aday = adaylar.sort((a, b) => b.son - a.son)[0];
  if (!aday) return null;
  const maddeler = aday.maddeler.map(maddeTemizle);
  if (maddeler.length < SINIR.enAz || maddeler.length > SINIR.enCok) return null;
  if (!maddeler.every((m) => m.length > 0 && m.length <= SINIR.metin && /[\p{L}\p{N}]/u.test(m))) return null;
  const sonrasi = duz
    .slice(aday.son)
    .replace(/^[\s.!;,]+/u, "")
    .trim();
  const soru = sonrasi ? sonrasi.length <= SORU_KISMI_SINIRI && SORU_SONU.test(sonrasi) : SORU_ONCESI.test(duz.slice(0, aday.bas).trim());
  return soru ? maddeler : null;
}

// ---------------------------------------------------------------------------
// Senaryo metinleri
// ---------------------------------------------------------------------------

/** Kullanıcının ekran görüntüsündeki CEO mesajı */
const KAPSAM_ONERISI = ceviri(
  "Anlaşıldı: Node.js ile QR tabanlı menü üretme ve tasarlama platformu; Node.js tercihini kaydettim. İlk sürüm kapsamını şöyle öneriyorum: 1) işletme kaydı ve giriş, 2) menü oluşturma (kategori, ürün, fiyat, görsel), 3) şablon seçerek tasarım, 4) QR kod üretme ve indirme, 5) QR ile açılan mobil uyumlu herkese açık menü sayfası. Ödeme, sipariş alma ve çoklu dil ikinci sürüme kalsın. Bu kapsam uygun mu, eklemek ya da çıkarmak istediğiniz var mı?",
  "Got it: a QR-based menu builder and designer on Node.js; I've saved the Node.js preference. For the first release I suggest this scope: 1) business sign-up and login, 2) menu builder (categories, items, prices, images), 3) template-based design, 4) QR code generation and download, 5) a mobile-friendly public menu page opened by the QR code. Payments, ordering and multiple languages can wait for the second release. Does this scope work, or is there anything you'd add or remove?",
);

/** Ada'nın seçenekli soruları: kimlik → soru, seçenekler, çoklu */
const SORULAR = {
  kargo: ceviri(
    {
      soru: "Kargo durumu müşteriye hangi kanallardan bildirilsin?",
      secenekler: [
        ["E-posta", "Ücretsiz; her siparişte gönderilir"],
        ["SMS", "Gönderi başına ücretli; Netgsm ile"],
        ["Uygulama içi bildirim", "Panelde zil simgesiyle"],
      ],
      coklu: true,
    },
    {
      soru: "Which channels should tell customers about their shipping status?",
      secenekler: [
        ["Email", "Free; sent with every order"],
        ["SMS", "Paid per message; via Netgsm"],
        ["In-app notification", "The bell icon in the panel"],
      ],
      coklu: true,
    },
  ),
  sablon: ceviri(
    {
      soru: "Menü sayfası için ilk şablon hangisi olsun? Öteki ikisini sonra ekleriz.",
      secenekler: [
        ["Sade liste", "Kategori başlıkları altında ürünler alt alta; en hızlı açılan"],
        ["Görselli kartlar", "Her ürün fotoğrafıyla; iştah açar ama görsel ister"],
        ["Kategori sekmeleri", "Üstte sekmeler; uzun menülerde gezinmesi kolay"],
      ],
      coklu: false,
    },
    {
      soru: "Which template should the menu page start with? We'll add the other two later.",
      secenekler: [
        ["Simple list", "Items under category headings; the fastest to load"],
        ["Photo cards", "Each item with its photo; appetising but needs images"],
        ["Category tabs", "Tabs at the top; easy to browse long menus"],
      ],
      coklu: false,
    },
  ),
  dil: ceviri(
    {
      soru: "Herkese açık menü sayfası varsayılan olarak hangi dilde açılsın?",
      secenekler: [["Türkçe"], ["İngilizce"], ["Almanca"], ["Rusça"], ["Arapça"], ["Fransızca"], ["İspanyolca"], ["Tarayıcının diline göre"]],
      coklu: false,
    },
    {
      soru: "Which language should the public menu page open in by default?",
      secenekler: [["Turkish"], ["English"], ["German"], ["Russian"], ["Arabic"], ["French"], ["Spanish"], ["The browser's language"]],
      coklu: false,
    },
  ),
  odeme: ceviri(
    {
      soru: "İkinci sürüme hangi ödeme yöntemleri girsin?",
      secenekler: [["Kredi kartı (iyzico)"], ["Masada nakit"], ["Havale ve EFT"], ["Yemek kartları"]],
      coklu: true,
    },
    {
      soru: "Which payment methods should the second release include?",
      secenekler: [["Credit card (iyzico)"], ["Cash at the table"], ["Bank transfer"], ["Meal cards"]],
      coklu: true,
    },
  ),
};

/** Ada'nın kurula soruları (kurula_sor, genel onay) */
const KURUL_SORULARI = ceviri(
  [
    {
      soru: "QR menü sayfaları hangi adreste yayınlansın? Alan adı alınacaksa ödemesini sizin yapmanız gerekiyor.",
      secenekler: ["menu.arnex.com.tr altında (alt alan adı)", "Ayrı bir alan adı: qrmenu.com.tr", "İşletmenin kendi alan adı (CNAME ile)"],
    },
    {
      soru: "Pilot için hangi işletmeyle başlayalım? Erişimi sizin istemeniz gerekiyor.",
      secenekler: ["Moda'daki kahveci (12 masa)", "Kadıköy'deki lokanta (30 masa)", "İkisi birden"],
    },
  ],
  [
    {
      soru: "Which address should the QR menu pages be published at? If we buy a domain, you'll need to pay for it.",
      secenekler: ["Under menu.arnex.com.tr (a subdomain)", "A separate domain: qrmenu.com.tr", "The business's own domain (via CNAME)"],
    },
    {
      soru: "Which business should the pilot start with? You'll need to ask them for access.",
      secenekler: ["The café in Moda (12 tables)", "The restaurant in Kadıköy (30 tables)", "Both"],
    },
  ],
);

export function kur(c) {
  const { rota, db, yay, mesajEkle, akisEkle, ajanBul, projeAjanlari, projeGerekli, projeYay, onaySonucuDinle, Hata, simdi, sonra, yeniKimlik } = c;
  const once = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
  const ceoBul = (pid) => projeAjanlari(pid).find((a) => a.rol === "ceo") ?? null;
  const KURUL_ADI = ceviri("Yönetim kurulu", "Board");

  /** Seçenekli sorunun seçim alanı */
  const secimKur = (s, yanit = null) => ({
    kaynak: "arac",
    soru: s.soru,
    secenekler: s.secenekler.map(([metin, aciklama]) => ({ metin, aciklama: aciklama ?? null })),
    coklu: s.coklu,
    serbestYanit: true,
    yanit,
  });
  /** Düz metin yedeği: soru ve numaralı seçenekler (çekirdekteki soruMetni) */
  const soruMetni = (secim) =>
    [
      secim.soru,
      "",
      ...secim.secenekler.map((x, i) => `${i + 1}. ${x.metin}${x.aciklama ? ` — ${x.aciklama}` : ""}`),
      ...(secim.coklu ? ["", ceviri("Birden çok seçilebilir.", "Several can be chosen.")] : []),
    ].join("\n");

  /** Seçimiyle birlikte yayınlanan ajan mesajı (mesajEkle seçimi taşımaz) */
  function secimliMesajEkle(pid, kanal, ajan, secim, zaman = simdi()) {
    const m = { id: yeniKimlik("m"), projeId: pid, kanal, gonderenId: ajan.id, gonderenAd: ajan.ad, metin: soruMetni(secim), anilanlar: [], zaman, secim };
    db.mesajlar.push(m);
    yay({ tur: "mesaj.yeni", mesaj: m }, pid);
    return m;
  }

  /** Kurulun yanıtı (çekirdekteki secimMetni) */
  function secimMetni(secim) {
    const y = secim.yanit;
    const secilen = y.secilenler.map((n) => `${n}) ${secim.secenekler[n - 1]?.metin ?? "?"}`).join("; ");
    if (!secilen) return ceviri(`Kurulun yanıtı: ${y.not ?? ""}`, `Board's answer: ${y.not ?? ""}`);
    return y.not ? ceviri(`Kurulun seçimi: ${secilen} · Not: ${y.not}`, `Board's choice: ${secilen} · Note: ${y.not}`) : ceviri(`Kurulun seçimi: ${secilen}`, `Board's choice: ${secilen}`);
  }

  /** CEO yazıyor görünür, sonra yazar */
  function ceoYazar(pid, metin, gecikme = 2200, sonrasi) {
    const ceo = ceoBul(pid);
    if (!ceo) return;
    yay({ tur: "kanal.yaziyor", projeId: pid, kanal: "yonetim", ajanId: ceo.id, ad: ceo.ad, yaziyor: true }, pid);
    setTimeout(() => {
      yay({ tur: "kanal.yaziyor", projeId: pid, kanal: "yonetim", ajanId: ceo.id, ad: ceo.ad, yaziyor: false }, pid);
      if (metin) {
        mesajEkle(pid, "yonetim", ceo.id, metin);
        akisEkle(ceo.id, { tur: "asistan", metin });
      }
      sonrasi?.(ceo);
    }, gecikme);
  }

  /** Ada seçenekli soru sorar: araç çağrısı akışta, soru #yonetim'de */
  const senaryolar = new Map();
  function soruSor(pid, kimlik, sonrasi) {
    const ceo = ceoBul(pid);
    if (!ceo) return null;
    const s = SORULAR[kimlik];
    const secim = secimKur(s);
    akisEkle(ceo.id, {
      tur: "arac_cagrisi",
      arac: "mcp__arnorg__secenekli_sor",
      aracKimligi: yeniKimlik("toolu"),
      girdi: { soru: s.soru, secenekler: s.secenekler.map(([metin, aciklama]) => (aciklama ? { metin, aciklama } : metin)), coklu: s.coklu },
    });
    const m = secimliMesajEkle(pid, "yonetim", ceo, secim);
    if (sonrasi) senaryolar.set(m.id, sonrasi);
    return m;
  }

  // -------------------------------------------------------------------------
  // Tohum: Sipariş Paneli'nin CEO sohbeti ve Onaylar
  // -------------------------------------------------------------------------

  const ada = ceoBul(OFIS);
  if (ada) {
    const kargo = secimKur(SORULAR.kargo, {
      secilenler: [1, 3],
      not: ceviri("SMS'i ödeme işi bitince yeniden konuşalım.", "Let's revisit SMS once payments are done."),
      zaman: once(116),
    });
    const kargoMesaji = { id: "m-secenek-kargo", projeId: OFIS, kanal: "yonetim", gonderenId: ada.id, gonderenAd: ada.ad, metin: soruMetni(kargo), anilanlar: [], zaman: once(121), secim: kargo };
    db.mesajlar.push(kargoMesaji);
    const tohum = (id, gonderenId, gonderenAd, dk, metin) => db.mesajlar.push({ id, projeId: OFIS, kanal: "yonetim", gonderenId, gonderenAd, metin, anilanlar: [], zaman: once(dk) });
    tohum("m-secenek-kargo-yanit", "kurul", KURUL_ADI, 116, secimMetni(kargo));
    tohum(
      "m-secenek-kargo-tamam",
      ada.id,
      ada.ad,
      115,
      ceviri(
        "Tamam: e-posta ve uygulama içi bildirimle başlıyoruz, SMS'i ödeme sonrasına not ettim. Deniz'e T-28 olarak açtım.",
        "Okay: we'll start with email and in-app notifications, and I've noted SMS for after payments. I opened T-28 for Deniz.",
      ),
    );
    tohum(
      "m-secenek-qr-istek",
      "kurul",
      KURUL_ADI,
      26,
      ceviri(
        "Restoranlar için QR menü ürününe de başlayalım: işletme menüsünü kendisi tasarlasın, müşteri masadaki QR'ı okutup açsın. Node.js ile yapalım.",
        "Let's also start a QR menu product for restaurants: businesses design their own menu and customers scan the QR code on the table to open it. Let's build it with Node.js.",
      ),
    );
    tohum("m-secenek-kapsam", ada.id, ada.ad, 24, KAPSAM_ONERISI);
    db.mesajlar.sort((a, b) => a.zaman.localeCompare(b.zaman));

    // Kapsam seçilince: Ada onaylar ve başlangıç şablonunu açıklamalı tek seçimli soruyla sorar
    senaryolar.set("m-secenek-kapsam", (secim) => {
      const sayi = secim.yanit.secilenler.length;
      const notlu = Boolean(secim.yanit.not);
      ceoYazar(
        OFIS,
        ceviri(
          `Kapsamı ${sayi} maddeyle panoya yazıyorum${notlu ? "; notunuzu da ekledim" : ""}. Tasarım tarafında bir karar gerekiyor.`,
          `I'm putting the scope on the board with ${sayi} items${notlu ? " and added your note" : ""}. One design decision is needed.`,
        ),
        2400,
        () =>
          ceoYazar(OFIS, null, 1800, () =>
            soruSor(OFIS, "sablon", (s) => {
              const n = s.yanit.secilenler[0];
              const ad = n ? s.secenekler[n - 1].metin : null;
              ceoYazar(
                OFIS,
                ad
                  ? ceviri(
                      `Anlaşıldı, menü sayfası "${ad}" şablonuyla başlıyor. Ece'ye atıyorum; ilk taslak yarın #genel'de.`,
                      `Got it, the menu page starts with the "${ad}" template. I'm assigning it to Ece; the first draft goes to #general tomorrow.`,
                    )
                  : ceviri("Notunuzu aldım; şablon kararını buna göre veriyorum.", "Got your note; I'll decide the template accordingly."),
              );
            }),
          ),
      );
    });

    // Onaylar: Ada'nın kurula sorusu bekliyor; geçmişte seçilerek yanıtlanmış bir soru
    const kurulSorusu = (s, ek) => ({
      id: yeniKimlik("o"),
      projeId: OFIS,
      ajanId: ada.id,
      tur: "genel",
      baslik: ceviri(`${ada.ad} soruyor: ${s.soru.slice(0, 80)}`, `${ada.ad} asks: ${s.soru.slice(0, 80)}`),
      ayrinti: `${s.soru}\n\n${ceviri("Seçenekler", "Options")}:\n${s.secenekler.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
      veri: { soru: s.soru, secenekler: s.secenekler },
      ...ek,
    });
    const gorsel = ceviri(
      { soru: "Ürün görselleri nerede saklansın?", secenekler: ["Sunucunun diskinde", "S3 uyumlu nesne deposunda"] },
      { soru: "Where should the item photos be stored?", secenekler: ["On the server's disk", "In S3-compatible object storage"] },
    );
    db.onaylar.unshift(
      kurulSorusu(gorsel, {
        durum: "onaylandi",
        olusturma: once(58),
        sonGecerlilik: null,
        sonuclanma: once(55),
        not: ceviri(`2) ${gorsel.secenekler[1]} — Aylık 5 dolar sınırı koyalım.`, `2) ${gorsel.secenekler[1]} — Let's cap it at 5 dollars a month.`),
        kararKaynagi: "kurul",
        kararVerenAd: KURUL_ADI,
      }),
    );
    db.onaylar.unshift(kurulSorusu(KURUL_SORULARI[0], { durum: "bekliyor", olusturma: once(9), sonGecerlilik: sonra(60 * 50), sonuclanma: null, not: null }));
  }

  // Kurulun kurula_sor yanıtı: CEO kısa bir mesajla devam eder
  onaySonucuDinle((o) => {
    if (o.tur !== "genel" || !Array.isArray(o.veri?.secenekler) || o.durum === "bekliyor") return;
    const ceo = ceoBul(o.projeId);
    if (!ceo || o.ajanId !== ceo.id) return;
    const not = String(o.not ?? "").trim();
    ceoYazar(
      o.projeId,
      o.durum === "onaylandi"
        ? ceviri(`Teşekkürler; "${not}" ile ilerliyorum.`, `Thanks; going ahead with "${not}".`)
        : ceviri("Anlaşıldı, bu soruyu kapatıyorum; varsayılan yolla devam ediyorum.", "Understood, I'm closing this question and carrying on the default way."),
    );
  });

  // -------------------------------------------------------------------------
  // Kurulun seçimi
  // -------------------------------------------------------------------------

  /** CEO'nun #yonetim'deki düz metin listesi ("Seçerek yanıtla") */
  function duzMetinSecimi(m) {
    if (m.kanal !== "yonetim" || m.gonderenId === "kurul" || m.gonderenId === "arnorg") return null;
    const maddeler = metindekiSecenekler(m.metin);
    return maddeler ? { kaynak: "metin", soru: null, secenekler: maddeler.map((metin) => ({ metin, aciklama: null })), coklu: true, serbestYanit: false, yanit: null } : null;
  }

  rota("POST", "/api/mesajlar/:mid/secim", ({ p, govde }) => {
    const m = db.mesajlar.find((x) => x.id === decodeURIComponent(p.mid));
    if (!m) throw new Hata(404, ceviri("Mesaj bulunamadı.", "Message not found."));
    const secim = m.secim ?? duzMetinSecimi(m);
    if (!secim) throw new Hata(409, ceviri("Bu mesajda seçilecek seçenek yok.", "This message has no options to choose from."));
    if (secim.yanit) throw new Hata(409, ceviri("Bu soru zaten yanıtlandı.", "This question has already been answered."));
    const ham = govde?.secilenler ?? [];
    if (!Array.isArray(ham) || ham.length > SINIR.enCok || ham.some((n) => !Number.isInteger(n))) throw new Hata(400, ceviri("Geçersiz istek: secilenler", "Invalid request: secilenler"));
    const secilenler = [...new Set(ham)].sort((a, b) => a - b);
    if (secilenler.some((n) => n < 1 || n > secim.secenekler.length)) throw new Hata(400, ceviri("Geçersiz seçenek numarası.", "Invalid option number."));
    if (!secim.coklu && secilenler.length > 1) throw new Hata(400, ceviri("Bu soruda yalnız bir seçenek seçilebilir.", "Only one option can be chosen for this question."));
    const not = typeof govde?.not === "string" && govde.not.trim() ? govde.not.trim().slice(0, SINIR.not) : null;
    if (!secilenler.length && !(secim.serbestYanit && not)) {
      throw new Hata(
        400,
        secim.serbestYanit ? ceviri("Bir seçenek seçin ya da yanıtınızı yazın.", "Choose an option or write your answer.") : ceviri("En az bir seçenek seçin.", "Choose at least one option."),
      );
    }
    m.secim = { ...secim, yanit: { secilenler, not, zaman: simdi() } };
    yay({ tur: "mesaj.guncellendi", projeId: m.projeId, mesaj: m }, m.projeId);
    // Yanıt soran ajana yönelir: #yonetim'de CEO'ya gider, öteki kanallarda soran anılır
    const soran = ajanBul(m.gonderenId);
    const metin = m.kanal === "yonetim" || !soran ? secimMetni(m.secim) : `@${soran.ad} ${secimMetni(m.secim)}`;
    const yanit = mesajEkle(m.projeId, m.kanal, "kurul", metin);
    if (soran) akisEkle(soran.id, { tur: "kullanici", metin: `#${kanalGorunenAdi(m.kanal)} · ${KURUL_ADI}: ${metin}` });
    const sonrasi = senaryolar.get(m.id);
    senaryolar.delete(m.id);
    if (sonrasi) sonrasi(m.secim);
    else if (m.kanal === "yonetim") {
      const secilen = m.secim.yanit.secilenler.map((n) => m.secim.secenekler[n - 1].metin);
      ceoYazar(
        m.projeId,
        secilen.length
          ? ceviri(`Seçiminizi aldım: ${secilen.join(", ")}. Buna göre ilerliyorum.`, `Got your choice: ${secilen.join(", ")}. I'm going ahead accordingly.`)
          : ceviri("Yanıtınızı aldım; buna göre ilerliyorum.", "Got your answer; I'm going ahead accordingly."),
      );
    }
    return { soru: m, yanit };
  });

  // -------------------------------------------------------------------------
  // Geliştirme uçları
  // -------------------------------------------------------------------------

  rota("POST", "/api/gelistirme/secenekli-soru", ({ govde }) => {
    const pid = govde?.projeId ?? OFIS;
    projeGerekli(pid);
    const kimlik = { tek: "sablon", coklu: "odeme", acilir: "dil" }[govde?.tur ?? "coklu"] ?? "odeme";
    const m = soruSor(pid, kimlik);
    if (!m) throw new Hata(409, ceviri("Bu projede CEO yok.", "This project has no CEO."));
    return m;
  });

  let kurulSoruNo = 1;
  rota("POST", "/api/gelistirme/secenekli-onay", ({ govde }) => {
    const pid = govde?.projeId ?? OFIS;
    projeGerekli(pid);
    const ceo = ceoBul(pid);
    if (!ceo) throw new Hata(409, ceviri("Bu projede CEO yok.", "This project has no CEO."));
    const s = KURUL_SORULARI[kurulSoruNo++ % KURUL_SORULARI.length];
    akisEkle(ceo.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__kurula_sor", aracKimligi: yeniKimlik("toolu"), girdi: { soru: s.soru, secenekler: s.secenekler } });
    const o = {
      id: yeniKimlik("o"),
      projeId: pid,
      ajanId: ceo.id,
      tur: "genel",
      baslik: ceviri(`${ceo.ad} soruyor: ${s.soru.slice(0, 80)}`, `${ceo.ad} asks: ${s.soru.slice(0, 80)}`),
      ayrinti: `${s.soru}\n\n${ceviri("Seçenekler", "Options")}:\n${s.secenekler.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
      veri: { soru: s.soru, secenekler: s.secenekler },
      durum: "bekliyor",
      olusturma: simdi(),
      sonGecerlilik: sonra(Math.min(db.ayarlar.onaySuresiSn ?? 600, 1800)),
      sonuclanma: null,
      not: null,
    };
    // 0.0.7: CEO'nun kurula sorusu kurula gider; 0.0.2 dinleyicisi her ekranda pencere açar
    db.onaylar.unshift(o);
    yay({ tur: "onay.yeni", onay: o }, pid);
    projeYay(pid);
    return o;
  });
}
