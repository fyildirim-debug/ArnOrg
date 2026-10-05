// Sahte çekirdeğin 0.0.8 canlılık gösterisi: Ofis'in gerçek olaylara bağlı yeni davranışlarını izlemek için ajanlar
// gerçekçi aralıklarla iş yapar. Bir tur yaklaşık iki dakika sürer ve başa sarar:
//
//   yazma temposu: Ece kısa aralıklarla düzenler (masasında hızlı yazma), sonra yalnız okur (tempo söner); iş
//     kaydedilince gorev.kaydedildi (başında onay işareti, panoda kartta "Kaydedildi");
//   geç yanıt: Burak Kerem'e sorar (ajana_sor); yanıt bir süre gelmez, Burak masasına döner, yanıt ışık iziyle ulaşır;
//   CEO'nun kararı: Burak'ın komut izni tam otonomda Ada'ya gider; Burak Ada'nın masasının yanında bekler, Ada karar
//     verir (çift turda onay, tek turda ret; surum-007-otonom.mjs);
//   Deniz T-24'te kısa bir düzenleme ve kayıt.
// Boştaki Mert ve Selin'in masada oturup uzun boşlukta kısa molaya çıkmasını ofis kendisi yapar.
//
// gorev.kaydedildi olayının kesin biçimi ortak tiplere tek çalışma alanı işiyle girer; burada Stüdyo'nun tanıdığı
// alanlarla yayınlanır (src/yardimcilar/gorevKaydi.ts). ARNORG_CANLI_GOSTERI=0 ile tur kapanır (uçlar kalır).
//
// Geliştirme uçları (yalnız sahte çekirdek; ekran görüntüsü ve deneme için anında):
//   POST /api/gelistirme/canli/yaz     Ece yoğun düzenler, kaydeder, sonra seyrek okur
//   POST /api/gelistirme/canli/kayit   Ece T-26'yı kaydeder
//   POST /api/gelistirme/canli/soru    Burak Kerem'e sorar, yanıt geç gelir
//   POST /api/gelistirme/canli/izin    Burak'ın komut izni CEO'ya gider
//
//   kur(c): sahte-sunucu.mjs'teki rota, db ve yardımcılarla çağrılır (surum-005-*.mjs deseni)

import crypto from "node:crypto";
import { ceviri } from "./dil.mjs";
import { V } from "./tohum.mjs";

const PROJE = "siparis-paneli";

export function kur(c) {
  const { rota, db, yay, yayDinle, akisEkle, ajanBul, simdi, yeniKimlik, projeYay } = c;

  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);
  const calisiyor = (id) => {
    const a = ajanBul(id);
    return a && a.projeId === PROJE && a.durum === "calisiyor" ? a : null;
  };
  const zamanlayicilar = new Set();
  const sonra = (ms, is) => {
    const z = setTimeout(() => {
      zamanlayicilar.delete(z);
      try {
        is();
      } catch (e) {
        console.error("Canlılık gösterisi adımı hata verdi", e);
      }
    }, ms);
    zamanlayicilar.add(z);
  };

  /** Araç çağrısı ve (gecikmeli) sonucu */
  function arac(ajanId, ad, girdi, sonuc, gecikme = 900) {
    const kimlik = yeniKimlik("toolu");
    akisEkle(ajanId, { tur: "arac_cagrisi", arac: ad, aracKimligi: kimlik, girdi });
    sonra(gecikme, () => akisEkle(ajanId, { tur: "arac_sonucu", aracKimligi: kimlik, metin: sonuc }));
    return kimlik;
  }

  /** Görevin işi ortak çalışma alanına kaydedildi: Stüdyo'nun tanıdığı biçimde gorev.kaydedildi */
  function kaydet(ajanId, gorevId, mesaj, dosyaSayisi) {
    const a = ajanBul(ajanId);
    const g = db.gorevler.find((x) => x.id === gorevId);
    if (!a || !g) return;
    g.guncelleme = simdi();
    yay(
      {
        tur: "gorev.kaydedildi",
        projeId: PROJE,
        gorevId: g.id,
        gorev: g,
        ajanId: a.id,
        mesaj,
        kimlik: crypto.randomBytes(20).toString("hex"),
        dosyaSayisi,
        zaman: simdi(),
      },
      PROJE,
    );
    yay({ tur: "gorev.guncellendi", gorev: g }, PROJE);
  }

  let tur = 0;

  /** Ece: yoğun düzenleme (tempo yükselir), kayıt, ardından seyrek okuma (tempo söner) */
  function yogunYazma() {
    const a = calisiyor("ece");
    if (!a) return;
    const kok = `${V.CALISMA_KOKU}/${a.id}/src`;
    const dosyalar = ["ekranlar/SiparisListesi.tsx", "ekranlar/SiparisListesi.tsx", "bilesenler/DurumRozeti.tsx", "ekranlar/SiparisListesi.tsx", "api/siparisler.ts", "ekranlar/SiparisListesi.tsx", "bilesenler/BosDurum.tsx"];
    dosyalar.forEach((d, i) => {
      sonra(i * 2100, () => {
        if (!calisiyor(a.id)) return;
        arac(a.id, i % 3 === 2 ? "Write" : "Edit", { file_path: `${kok}/${d}`, old_string: "…", new_string: "…" }, ceviri("Dosya güncellendi.", "File updated."));
      });
    });
    sonra(dosyalar.length * 2100 + 1500, () => {
      if (!calisiyor(a.id)) return;
      kaydet(a.id, "g26", ceviri("Sipariş listesi: boş durum ve imleçli sayfalama", "Order list: empty state and cursor pagination"), 4);
    });
    // Sakin bölüm: yalnız okuma, aralıklar açılır
    [24_000, 31_000, 40_000].forEach((t, i) => {
      sonra(t, () => {
        if (!calisiyor(a.id)) return;
        arac(a.id, "Read", { file_path: `${kok}/${["api/istemci.ts", "ekranlar/SiparisDetay.tsx", "bilesenler/Tablo.tsx"][i]}` }, ceviri("(42 satır)", "(42 lines)"));
      });
    });
  }

  /** Burak Kerem'e sorar; yanıt geç gelir (soran yanında bir süre bekler, sonra masasına döner) */
  function gecYanit() {
    const soran = calisiyor("burak");
    const sorulu = ajanBul("kerem");
    if (!soran || !sorulu || sorulu.durum === "kapali") return;
    const soru = ceviri(
      "Windows işinde önbellek anahtarını package-lock'a mı bağlayalım, yoksa haftalık mı tazeleyelim?",
      "Should the Windows job's cache key follow package-lock, or should we refresh it weekly?",
    );
    const yanit = ceviri(
      "package-lock'a bağla; haftalık tazeleme gereksiz geçersizleme yapar. Anahtara Node sürümünü de ekle.",
      "Tie it to package-lock; a weekly refresh invalidates for no reason. Add the Node version to the key too.",
    );
    const s = { id: yeniKimlik("s"), projeId: PROJE, soranId: soran.id, soranAd: soran.ad, soruluId: sorulu.id, soruluAd: sorulu.ad, soru, yanit: null, durum: "bekliyor", olusturma: simdi(), yanitlanma: null };
    db.sorular?.unshift(s);
    akisEkle(soran.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__ajana_sor", aracKimligi: yeniKimlik("toolu"), girdi: { ajan: sorulu.ad, soru } });
    yay({ tur: "soru.guncellendi", soru: s }, PROJE);
    // Kerem bu sırada kendi işinde; yanıtı yarım dakika sonra gelir
    sonra(30_000, () => {
      if (!ajanBul(sorulu.id) || s.durum !== "bekliyor") return;
      Object.assign(s, { yanit, durum: "yanitlandi", yanitlanma: simdi() });
      akisEkle(sorulu.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__soruyu_yanitla", aracKimligi: yeniKimlik("toolu"), girdi: { soru_id: s.id, yanit } });
      yay({ tur: "soru.guncellendi", soru: s }, PROJE);
    });
  }

  /** Burak'ın komut izni: tam otonomda CEO'ya gider (muhatap ve karar surum-007-otonom.mjs'te) */
  function ceoyaIzin() {
    const a = calisiyor("burak");
    if (!a) return;
    if (db.onaylar.some((o) => o.projeId === PROJE && o.ajanId === a.id && o.durum === "bekliyor")) return;
    // Çift turda onaylanır, tek turda reddedilir (CEO'nun gerekçesi komuttan)
    const girdi =
      tur % 2 === 0
        ? { command: "docker compose -f ci/docker-compose.yml up -d", description: ceviri("CI önbellek sunucusunu başlat", "Start the CI cache server") }
        : { command: "npm publish --access public", description: ceviri("CI yardımcı paketini yayınla", "Publish the CI helper package") };
    const kimlik = yeniKimlik("toolu");
    akisEkle(a.id, { tur: "arac_cagrisi", arac: "Bash", aracKimligi: kimlik, girdi });
    const o = {
      id: yeniKimlik("o"),
      projeId: PROJE,
      ajanId: a.id,
      tur: "arac",
      baslik: ceviri(`${a.ad} · Bash izni istiyor`, `${a.ad} · requests Bash`),
      ayrinti: girdi.command,
      veri: { arac: "Bash", girdi, kural: ceviri("Claude Code izin sorusu", "Claude Code permission prompt"), aracKimligi: kimlik },
      durum: "bekliyor",
      olusturma: simdi(),
      sonGecerlilik: new Date(Date.now() + 180_000).toISOString(),
      sonuclanma: null,
      not: null,
    };
    // Çekirdekteki sırayla: önce onay, sonra çalışanın durumu
    db.onaylar.unshift(o);
    yay({ tur: "onay.yeni", onay: o }, PROJE);
    izinler.set(o.id, a.isAciklamasi);
    a.durum = "karar_bekliyor";
    a.isAciklamasi = ceviri(`Onay bekliyor: ${girdi.command}`, `Awaiting approval: ${girdi.command}`);
    ajanYay(a);
    projeYay(PROJE);
  }

  /** Karara bağlanan izin: çalışanın iş açıklaması bekleme öncesine döner (çekirdekte "Devam ediyor" yazılır) */
  const izinler = new Map();
  yayDinle?.((olay) => {
    if (olay.tur !== "onay.sonuc" || !izinler.has(olay.onay.id) || olay.onay.durum === "bekliyor") return;
    const onceki = izinler.get(olay.onay.id);
    izinler.delete(olay.onay.id);
    const a = ajanBul(olay.onay.ajanId);
    if (!a || a.durum === "karar_bekliyor") return;
    a.isAciklamasi = onceki;
    ajanYay(a);
  });

  /** Deniz: T-24'te kısa düzenleme ve kayıt */
  function denizKaydeder() {
    const a = calisiyor("deniz");
    if (!a) return;
    const kok = `${V.CALISMA_KOKU}/${a.id}/src`;
    ["api/siparisler/durum.ts", "api/siparisler/durum.test.ts", "api/siparisler/durum.ts"].forEach((d, i) => {
      sonra(i * 3200, () => {
        if (!calisiyor(a.id)) return;
        arac(a.id, "Edit", { file_path: `${kok}/${d}`, old_string: "…", new_string: "…" }, ceviri("Dosya güncellendi.", "File updated."));
      });
    });
    sonra(11_000, () => {
      if (!calisiyor(a.id)) return;
      kaydet(a.id, "g24", ceviri("Sipariş durumu: geçersiz geçişte 422", "Order status: 422 on an invalid transition"), 2);
    });
  }

  rota("POST", "/api/gelistirme/canli/yaz", () => {
    yogunYazma();
    return { tamam: true };
  });
  rota("POST", "/api/gelistirme/canli/kayit", () => {
    kaydet("ece", "g26", ceviri("Sipariş listesi: boş durum ve imleçli sayfalama", "Order list: empty state and cursor pagination"), 4);
    return { tamam: true };
  });
  rota("POST", "/api/gelistirme/canli/soru", () => {
    gecYanit();
    return { tamam: true };
  });
  rota("POST", "/api/gelistirme/canli/izin", () => {
    ceoyaIzin();
    return { tamam: true };
  });

  if (process.env.ARNORG_CANLI_GOSTERI === "0") return;

  // Tur planı: [önceki adımdan sonra bekleme (ms), adım]
  const PLAN = [
    [5000, yogunYazma],
    [16_000, gecYanit],
    [34_000, ceoyaIzin],
    [30_000, denizKaydeder],
    [35_000, () => {}],
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
