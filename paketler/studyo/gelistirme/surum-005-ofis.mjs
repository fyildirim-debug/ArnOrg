// Sahte çekirdeğin 0.0.5 ofis "canlı gösterisi": Ofis ekranındaki yeni odaları ve canlılığı izlemek için ajanlar
// gerçekçi aralıklarla sırayla iş yapar. Bir tur yaklaşık iki buçuk dakika sürer ve başa sarar:
//
//   kütüphanede web araştırması (WebSearch, WebFetch, web_oku, github_ara, arastirma_kaydet) ve bulguyu kanala yazma,
//   laboratuvarda test koşusu (geçen ya da kalan çıktısıyla) ve derleme/tür denetimi,
//   CEO'nun stüdyoda kurula teslimi (teslim_et; teslim onayı, bir süre sonra gösteri adına kabul; tam otonomda sonuç olarak),
//   görevi bitirme (kutlama), otomatik onaylı birleştirme (kalite kapısı: laboratuvar ve sunucu odası),
//   işe alım (yeni çalışan kapıdan girer, stüdyoda tasarım işi yapar) ve tur sonunda işten çıkarma (kapıdan çıkar).
//
// Olaylar sahte çekirdeğin var olan biçimiyle yayınlanır (ajan.akis, mesaj.yeni, gorev.guncellendi, onay.yeni/sonuc,
// ajan.guncellendi, ajan.silindi). ARNORG_OFIS_GOSTERI=0 ile kapatılır.
//
//   kur(c): sahte-sunucu.mjs'teki db ve yardımcılarla çağrılır (surum-004-*.mjs deseni)

import { ceviri } from "./dil.mjs";
import { kanalAdi, V } from "./tohum.mjs";

const PROJE = "siparis-paneli";
const MUHENDISLIK = kanalAdi("muhendislik");
const GENEL = kanalAdi("genel");

export function kur(c) {
  const { db, yay, akisEkle, mesajEkle, ajanBul, projeAjanlari, simdi, yeniKimlik, projeYay } = c;
  if (process.env.ARNORG_OFIS_GOSTERI === "0") return;

  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
  const calisan = (adaylar) => adaylar.map((id) => ajanBul(id)).find((a) => a && a.projeId === PROJE && a.durum === "calisiyor");
  const zamanlayicilar = new Set();
  const sonra = (ms, is) => {
    const z = setTimeout(() => {
      zamanlayicilar.delete(z);
      try {
        is();
      } catch (e) {
        console.error("Ofis gösterisi adımı hata verdi", e);
      }
    }, ms);
    zamanlayicilar.add(z);
  };

  /** Araç çağrısı ve (gecikmeli) sonucu: ofis çağrıyla yer değiştirir, sonuçla laboratuvar ışığını yakar */
  function arac(ajanId, ad, girdi, sonuc, { gecikme = 1400, hata = false } = {}) {
    const kimlik = yeniKimlik("toolu");
    akisEkle(ajanId, { tur: "arac_cagrisi", arac: ad, aracKimligi: kimlik, girdi });
    sonra(gecikme, () => akisEkle(ajanId, { tur: "arac_sonucu", aracKimligi: kimlik, metin: sonuc, hata }));
  }
  const dusun = (ajanId, metin) => akisEkle(ajanId, { tur: "dusunce", metin });

  // -------------------------------------------------------------------------
  // Araştırma konuları ve test çıktıları
  // -------------------------------------------------------------------------

  const ARASTIRMALAR = ceviri(
    [
      {
        dusunce: "Kargo firmasının API sınırlarını bilmeden kuyruğu tasarlayamam; önce belgelere bakayım.",
        sorgu: "Yurtiçi Kargo API istek sınırı",
        adres: "https://developer.yurticikargo.com/docs/rate-limits",
        adres2: "https://developer.yurticikargo.com/docs/webhooks",
        github: "kargo takip webhook typescript",
        kayit: "Kargo API'si: dakikada 60 istek, webhook imzası HMAC-SHA256",
        mesaj: (a) => `@${a} kargo API'si dakikada 60 istek alıyor; takip için webhook ve küçük bir kuyruk şart.`,
      },
      {
        dusunce: "Yenileme jetonunda iki sekme yarışını başkaları nasıl çözmüş, bakayım.",
        sorgu: "refresh token rotation race condition two tabs",
        adres: "https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation",
        adres2: "https://datatracker.ietf.org/doc/html/rfc6819",
        github: "refresh token rotation mutex",
        kayit: "Jeton yenileme: tekrar kullanılan jeton bütün aileyi düşürür",
        mesaj: (a) => `@${a} yenileme jetonu tekrar gelirse bütün aileyi düşürelim; RFC 6819 böyle öneriyor.`,
      },
      {
        dusunce: "Windows CI'daki yavaşlık için önbellek seçeneklerine bakmalıyım.",
        sorgu: "GitHub Actions Windows npm cache slow",
        adres: "https://docs.github.com/actions/using-workflows/caching-dependencies",
        adres2: "https://github.com/actions/setup-node#caching-global-packages-data",
        github: "setup-node cache windows",
        kayit: "CI: setup-node önbelleği Windows işini ~3 dk kısaltıyor",
        mesaj: (a) => `@${a} setup-node önbelleğini açınca Windows işi üç dakika kısalıyor, PR hazırlıyorum.`,
      },
    ],
    [
      {
        dusunce: "I can't design the queue without knowing the carrier's API limits; let me read the docs first.",
        sorgu: "Yurtici Kargo API rate limit",
        adres: "https://developer.yurticikargo.com/docs/rate-limits",
        adres2: "https://developer.yurticikargo.com/docs/webhooks",
        github: "shipment tracking webhook typescript",
        kayit: "Carrier API: 60 requests per minute, HMAC-SHA256 webhook signature",
        mesaj: (a) => `@${a} the carrier API takes 60 requests a minute; tracking needs webhooks and a small queue.`,
      },
      {
        dusunce: "Let me see how others solved the two-tab race on refresh tokens.",
        sorgu: "refresh token rotation race condition two tabs",
        adres: "https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation",
        adres2: "https://datatracker.ietf.org/doc/html/rfc6819",
        github: "refresh token rotation mutex",
        kayit: "Token refresh: a reused token revokes the whole family",
        mesaj: (a) => `@${a} if a refresh token comes back twice, let's revoke the whole family; RFC 6819 recommends it.`,
      },
      {
        dusunce: "I should look at caching options for the slow Windows CI job.",
        sorgu: "GitHub Actions Windows npm cache slow",
        adres: "https://docs.github.com/actions/using-workflows/caching-dependencies",
        adres2: "https://github.com/actions/setup-node#caching-global-packages-data",
        github: "setup-node cache windows",
        kayit: "CI: the setup-node cache cuts the Windows job by ~3 min",
        mesaj: (a) => `@${a} turning on the setup-node cache cuts the Windows job by three minutes; preparing a PR.`,
      },
    ],
  );

  const vitestGecti = ceviri(
    " ✓ src/siparis/liste.test.tsx (6 tests) 142ms\n ✓ src/siparis/durum.test.ts (9 tests) 31ms\n\n Test Files  2 passed (2)\n      Tests  15 passed (15)\n   Duration  2.84s",
    " ✓ src/siparis/liste.test.tsx (6 tests) 142ms\n ✓ src/siparis/durum.test.ts (9 tests) 31ms\n\n Test Files  2 passed (2)\n      Tests  15 passed (15)\n   Duration  2.84s",
  );
  const vitestKaldi = ceviri(
    " ❯ src/siparis/liste.test.tsx (6 tests | 1 failed) 160ms\n   × boş liste mesajını gösterir\n     → expected 'Yükleniyor' to be 'Henüz sipariş yok'\n ✓ src/siparis/durum.test.ts (9 tests) 31ms\n\n Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 14 passed (15)",
    " ❯ src/siparis/liste.test.tsx (6 tests | 1 failed) 160ms\n   × shows the empty list message\n     → expected 'Loading' to be 'No orders yet'\n ✓ src/siparis/durum.test.ts (9 tests) 31ms\n\n Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 14 passed (15)",
  );
  const playwrightGecti = "Running 4 tests using 2 workers\n\n  ✓  1 e2e/siparis.spec.ts:12:3 › create order (2.1s)\n  ✓  2 e2e/siparis.spec.ts:31:3 › ship order (1.8s)\n\n  4 passed (12.3s)";
  const playwrightKaldi = "Running 4 tests using 2 workers\n\n  ✘  2 e2e/siparis.spec.ts:31:3 › ship order (5.0s)\n\n  1 failed\n  3 passed (14.1s)";

  // -------------------------------------------------------------------------
  // Adımlar
  // -------------------------------------------------------------------------

  let tur = 0;

  /** Kütüphane: araştırma, bulgu kaydı ve kanala kısa mesaj */
  function arastir() {
    const a = calisan(["kerem", "burak", "ece", "deniz", "ada"]);
    if (!a) return;
    const k = ARASTIRMALAR[tur % ARASTIRMALAR.length];
    dusun(a.id, k.dusunce);
    sonra(1500, () => arac(a.id, "WebSearch", { query: k.sorgu }, ceviri("10 sonuç bulundu.", "Found 10 results.")));
    sonra(6500, () => arac(a.id, "WebFetch", { url: k.adres, prompt: ceviri("İstek sınırlarını özetle", "Summarise the limits") }, ceviri("Sayfa okundu (4,2 KB).", "Page read (4.2 KB)."), { gecikme: 2200 }));
    sonra(12000, () => arac(a.id, "mcp__arnorg__web_oku", { url: k.adres2 }, ceviri("Sayfa okundu.", "Page read."), { gecikme: 1800 }));
    sonra(17000, () => arac(a.id, "mcp__arnorg__github_ara", { sorgu: k.github }, ceviri("12 depo, 3'ü uygun.", "12 repositories, 3 relevant.")));
    sonra(22500, () => {
      arac(a.id, "mcp__arnorg__arastirma_kaydet", { baslik: k.kayit, ozet: k.kayit, kaynaklar: [k.adres, k.adres2] }, ceviri("Araştırma notlara kaydedildi.", "Research saved to the notes."));
      const alici = projeAjanlari(PROJE).find((x) => x.id !== a.id && x.durum !== "kapali" && x.rol !== "ceo") ?? ajanBul("ada");
      if (alici) sonra(1500, () => mesajEkle(PROJE, MUHENDISLIK, a.id, k.mesaj(alici.ad)));
    });
  }

  /**
   * Laboratuvar: test koşusu. Çift turda geçer, ardından tür denetimi ve lint; tek turda kalır: pano kırmızı yanar,
   * çalışan hatayı düzeltir ve aynı testi yeniden koşturur (pano yeşile döner).
   */
  function testKos() {
    const a = calisan(["ece", "mert", "burak", "kerem", "deniz"]);
    if (!a) return;
    const kalsin = tur % 2 === 1;
    const e2e = a.id === "mert";
    const girdi = { command: e2e ? "npx playwright test e2e/siparis.spec.ts" : "npx vitest run src/siparis", description: ceviri("Sipariş testlerini çalıştır", "Run the order tests") };
    const gecti = e2e ? playwrightGecti : vitestGecti;
    dusun(a.id, ceviri("Değişiklikten sonra testleri koşturayım.", "Let me run the tests after the change."));
    sonra(1200, () => arac(a.id, "Bash", girdi, kalsin ? (e2e ? playwrightKaldi : vitestKaldi) : gecti, { gecikme: 7000, hata: kalsin }));
    if (kalsin) {
      sonra(10500, () => dusun(a.id, ceviri("Boş liste mesajı yükleme bitmeden görünüyor; koşulu düzeltip yeniden koşturayım.", "The empty-list message shows before loading ends; let me fix the check and rerun.")));
      sonra(12500, () =>
        arac(a.id, "Edit", { file_path: `${V.CALISMA_KOKU}/${a.id}/src/siparis/Liste.tsx`, old_string: "siparisler.length === 0", new_string: "!yukleniyor && siparisler.length === 0" }, ceviri("Dosya güncellendi.", "File updated.")),
      );
      sonra(21000, () => arac(a.id, "Bash", girdi, gecti, { gecikme: 6500 }));
      return;
    }
    // Tür denetimi ve lint: iki kısa derleme komutu laboratuvarda kalır
    sonra(11500, () => arac(a.id, "Bash", { command: "npm run typecheck" }, "", { gecikme: 2600 }));
    sonra(16000, () => arac(a.id, "Bash", { command: "npm run lint" }, "", { gecikme: 2000 }));
  }

  /** Stüdyo: CEO kurula teslim eder; teslim onayı açılır, karar gelmezse bir süre sonra gösteri adına kabul edilir */
  function teslimEt() {
    const a = ajanBul("ada");
    // Teslim kurula açılır pencereyle gelir: gösteride iki turda bir
    if (!a || a.durum !== "calisiyor" || tur % 2 === 1) return;
    if (db.onaylar.some((o) => o.projeId === PROJE && o.tur === "teslim" && o.durum === "bekliyor" && o.veri?.gosteri)) return;
    // Teslim çift turlarda gelir; başlık her teslimde değişir
    const sira = Math.floor(tur / 2) % 2;
    const baslik = ceviri(["Sipariş listesi ve durum rozetleri", "Kargo takibi önizlemesi"][sira], ["Order list and status badges", "Shipment tracking preview"][sira]);
    const adimlar = ceviri(
      ["npm run dev ile paneli aç", "Siparişler sayfasında listeyi kaydır", "Bir siparişin durumunu 'Kargoda' yap", "Boş liste mesajını gör"],
      ["Open the panel with npm run dev", "Scroll the list on the Orders page", "Set an order's status to 'Shipped'", "See the empty list message"],
    );
    const ozet = ceviri("Liste, sayfalama ve durum rozetleri hazır; testler yeşil.", "The list, pagination and status badges are ready; tests are green.");
    dusun(a.id, ceviri("Bu hâli kurula gösterilebilir; teslim edeyim.", "This is ready to show the board; let me deliver it."));
    sonra(1500, () => {
      // Tam otonomda teslim kurula sonuç olarak gider (surum-007-otonom.mjs): kabul beklenmez
      const otonom = db.projeler.find((p) => p.id === PROJE)?.kararVeren === "ceo";
      arac(
        a.id,
        "mcp__arnorg__teslim_et",
        { baslik, ozet, test_adimlari: adimlar, calistir: "npm run dev", adres: "http://localhost:5173" },
        otonom ? ceviri("Teslim kurula sonuç olarak iletildi; kabul bekleme.", "The delivery was passed to the board as a result; don't wait for acceptance.") : ceviri("Teslim kurula sunuldu.", "The delivery went to the board."),
      );
      const o = {
        id: yeniKimlik("o"),
        projeId: PROJE,
        ajanId: a.id,
        tur: "teslim",
        baslik: ceviri(`Teslim: ${baslik}`, `Delivery: ${baslik}`),
        ayrinti: [ozet, "", ceviri("Test adımları:", "Test steps:"), ...adimlar.map((x, i) => `${i + 1}. ${x}`)].join("\n"),
        veri: { baslik, ozet, testAdimlari: adimlar, calistir: "npm run dev", adres: "http://localhost:5173", dal: "main", gosteri: true },
        durum: "bekliyor",
        olusturma: simdi(),
        sonGecerlilik: null,
        sonuclanma: null,
        not: null,
      };
      db.onaylar.unshift(o);
      yay({ tur: "onay.yeni", onay: o }, PROJE);
      projeYay(PROJE);
      if (!otonom) mesajEkle(PROJE, GENEL, a.id, ceviri(`Teslim hazır: ${baslik}. Kurul deneyip geri bildirim verecek.`, `Delivery ready: ${baslik}. The board will try it and give feedback.`));
      // Karar gelmezse gösteri kabul eder (kutlama görünsün)
      sonra(38000, () => {
        if (o.durum !== "bekliyor") return;
        Object.assign(o, { durum: "onaylandi", sonuclanma: simdi(), not: ceviri("Gösteri: kurul adına kabul", "Demo: accepted for the board") });
        yay({ tur: "onay.sonuc", onay: o }, PROJE);
        projeYay(PROJE);
      });
    });
  }

  /** Görev biter: incelemedeki iş tamama geçer (sahibinin başında kutlama) */
  function gorevBitir() {
    const g = db.gorevler.find((x) => x.id === "g22");
    if (!g) return;
    if (g.durum === "calisiliyor") {
      g.durum = "inceleme";
      g.guncelleme = simdi();
      yay({ tur: "gorev.guncellendi", gorev: g }, g.projeId);
      return;
    }
    if (g.durum !== "inceleme") return;
    g.durum = "tamam";
    g.guncelleme = simdi();
    yay({ tur: "gorev.guncellendi", gorev: g }, g.projeId);
    projeYay(g.projeId);
  }

  /** Görev yeniden açılır (bir sonraki turda yine bitsin) */
  function gorevAc() {
    const g = db.gorevler.find((x) => x.id === "g22");
    if (!g || g.durum !== "tamam") return;
    g.durum = "calisiliyor";
    g.guncelleme = simdi();
    yay({ tur: "gorev.guncellendi", gorev: g }, g.projeId);
  }

  /** Otomatik onaylı birleştirme: kalite kapısı laboratuvarda koşar, geçerse sunucu odasında birleşir */
  function birlestir() {
    if (db.onaylar.some((o) => o.projeId === PROJE && o.tur === "birlestirme" && o.durum === "onaylandi" && o.veri?.gosteri && !["birlesti", "test_basarisiz", "cakisma", "zaman_asimi", "hata"].includes(o.veri?.kalite?.durum))) return;
    const g = db.gorevler.find((x) => x.id === "g22");
    const o = {
      id: yeniKimlik("o"),
      projeId: PROJE,
      ajanId: "onur",
      tur: "birlestirme",
      baslik: ceviri(`${g?.kod ?? "T-22"} Ürün kataloğu API → main`, `${g?.kod ?? "T-22"} Product catalog API → main`),
      ayrinti: ceviri("İnceleme tamam; otomatik onay.", "Review done; auto-approved."),
      veri: { gorevId: "g22", dal: "arnorg/deniz/T-22", hedefDal: "main", ajanId: "deniz", dosyaSayisi: 3, eklenen: 64, silinen: 7, gosteri: true },
      durum: "onaylandi",
      olusturma: simdi(),
      sonGecerlilik: null,
      sonuclanma: simdi(),
      not: ceviri("Otomatik onay", "Auto-approved"),
    };
    db.onaylar.unshift(o);
    // Kalite kapısı (surum-004-kalite.mjs) onaylı birleştirmeyi bu yayından yakalar
    yay({ tur: "onay.sonuc", onay: o }, PROJE);
    projeYay(PROJE);
  }

  // İşe alım ve ayrılış: her turda bir yeni çalışan kapıdan girer, stüdyoda ya da kütüphanede çalışır, sonra ayrılır
  const YENILER = [
    { id: "nehir", ad: "Nehir", rol: "tasarim" },
    { id: "arda", ad: "Arda", rol: "arastirmaci" },
  ];
  let yeni = null;

  function iseAl() {
    if (yeni && ajanBul(yeni.id)) return;
    const v = YENILER[tur % YENILER.length];
    if (ajanBul(v.id)) return;
    const rol = V.roller.find((r) => r.kimlik === v.rol) ?? V.roller[2];
    const o = {
      id: yeniKimlik("o"),
      projeId: PROJE,
      ajanId: "ada",
      tur: "ise_alim",
      baslik: `${v.ad} · ${rol.ad}`,
      ayrinti: ceviri("Gösteri: kısa süreli destek.", "Demo: short-term help."),
      veri: { ad: v.ad, rol: v.rol, model: "sonnet", yoneticiId: "kerem", talimatEki: "" },
      durum: "onaylandi",
      olusturma: simdi(),
      sonGecerlilik: null,
      sonuclanma: simdi(),
      not: ceviri("Otomatik onay", "Auto-approved"),
    };
    db.onaylar.unshift(o);
    yay({ tur: "onay.sonuc", onay: o }, PROJE);
    const a = {
      id: v.id,
      projeId: PROJE,
      ad: v.ad,
      rol: rol.kimlik,
      rolAdi: rol.ad,
      model: "sonnet",
      yoneticiId: "kerem",
      durum: "bosta",
      isAciklamasi: ceviri("İlk görevi bekliyor", "Waiting for a first task"),
      gorevId: null,
      oturumId: `oturum-${v.id}-1`,
      calismaAlani: `${V.CALISMA_KOKU}/${v.id}`,
      dal: `arnorg/${v.id}`,
      izinModu: db.ayarlar.varsayilanIzinModu ?? "default",
      bugunToken: 0,
      toplamToken: 0,
      talimatEki: "",
      karakter: null,
      olusturma: simdi(),
    };
    db.ajanlar.push(a);
    db.katmanlar[a.id] ??= {};
    db.akislar[a.id] ??= [];
    yeni = a;
    ajanYay(a);
    projeYay(PROJE);
    sonra(1500, () => mesajEkle(PROJE, GENEL, "ada", ceviri(`${a.ad} ekibe katıldı, hoş geldin! @Kerem ilk işini sen ver.`, `${a.ad} joined the team, welcome! @Kerem please give the first task.`)));
    // Yerleşince işe başlar: tasarımcı stüdyoda, araştırmacı kütüphanede
    sonra(16000, () => {
      if (!ajanBul(a.id)) return;
      Object.assign(a, { durum: "calisiyor", isAciklamasi: a.rol === "tasarim" ? ceviri("Boş durum çizimleri", "Empty state drawings") : ceviri("Kargo firmaları karşılaştırması", "Carrier comparison") });
      ajanYay(a);
      if (a.rol === "tasarim") {
        sonra(1500, () => arac(a.id, "Write", { file_path: `${V.CALISMA_KOKU}/${a.id}/tasarim/bos-durum.svg`, content: "<svg/>" }, ceviri("Dosya yazıldı.", "File written.")));
        sonra(5000, () => arac(a.id, "Edit", { file_path: `${V.CALISMA_KOKU}/${a.id}/src/stiller/tokenlar.css`, old_string: "--b-3", new_string: "--b-3" }, ceviri("Dosya güncellendi.", "File updated.")));
        sonra(9000, () => arac(a.id, "Write", { file_path: `${V.CALISMA_KOKU}/${a.id}/tasarim/siparis-akisi.excalidraw`, content: "{}" }, ceviri("Dosya yazıldı.", "File written.")));
      } else {
        sonra(1500, () => arac(a.id, "mcp__arnorg__web_ara", { sorgu: ceviri("kargo firmaları API karşılaştırması", "shipping carrier API comparison") }, ceviri("8 sonuç.", "8 results.")));
        sonra(6000, () => arac(a.id, "mcp__arnorg__paket_bilgisi", { paket: "@aras-kargo/sdk" }, "0.4.2 · MIT"));
        sonra(10000, () => arac(a.id, "mcp__arnorg__paket_bilgisi", { paket: "yurtici-kargo" }, "1.1.0 · MIT"));
      }
    });
  }

  function istenCikar() {
    const a = yeni && ajanBul(yeni.id);
    if (!a) return;
    const o = {
      id: yeniKimlik("o"),
      projeId: PROJE,
      ajanId: "ada",
      tur: "isten_cikarma",
      baslik: ceviri(`İşten çıkarma: ${a.ad} · ${a.rolAdi}`, `Dismissal: ${a.ad} · ${a.rolAdi}`),
      ayrinti: ceviri("Gösteri: kısa süreli destek bitti.", "Demo: the short-term help is over."),
      veri: { ajanId: a.id, ad: a.ad, devralanId: "kerem", gerekce: ceviri("Kısa süreli destek bitti.", "The short-term help is over.") },
      durum: "onaylandi",
      olusturma: simdi(),
      sonGecerlilik: null,
      sonuclanma: simdi(),
      not: ceviri("Otomatik onay", "Auto-approved"),
    };
    db.onaylar.unshift(o);
    yay({ tur: "onay.sonuc", onay: o }, PROJE);
    db.ajanlar = db.ajanlar.filter((x) => x.id !== a.id);
    yay({ tur: "ajan.silindi", projeId: PROJE, ajanId: a.id }, PROJE);
    projeYay(PROJE);
    yeni = null;
  }

  // Tur planı: [önceki adımdan sonra bekleme (ms), adım]
  const PLAN = [
    [6000, arastir],
    [30000, testKos],
    [22000, iseAl],
    [12000, teslimEt],
    [14000, gorevBitir],
    [9000, gorevBitir],
    [12000, birlestir],
    [26000, () => {}],
    [8000, istenCikar],
    [6000, gorevAc],
  ];
  let adim = 0;
  function ilerle() {
    const [bekleme, is] = PLAN[adim];
    sonra(bekleme, () => {
      is();
      adim = (adim + 1) % PLAN.length;
      if (adim === 0) tur++;
      ilerle();
    });
  }
  ilerle();
}
