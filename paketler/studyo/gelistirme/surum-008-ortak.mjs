// Sahte çekirdeğin 0.0.8 ortak çalışması: ekip tek projede, main dalında görev bazlı ve aynı anda çalışır; kişisel
// çalışma alanı, dal ve birleştirme yoktur. Çalışanın düzenlediği dosya ona kiralanır; görev 'inceleme'ye geçince ya
// da isi_kaydet ile ArnOrg yalnız o görevin dosyalarını "<görev kodu> <başlık>" mesajıyla commit'ler ve test komutunu
// arka planda o commit'te koşar. Tam otonom kipte aynı anda kaç kişinin çalışacağına (ekip temposu) CEO karar verir.
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar, db ve yardımcılarla çağrılır (surum-007-*.mjs deseni)
//
// Açılışta 0.0.8 geçişi (çekirdekteki ortak-calisma/gecis.ts gibi): ajanların çalışma alanı ve dalı boşalır, bekleyen
// birleştirme onayları kapanır, commit'lenmemiş değişikliği olan Selin'in eski alanı korunur ve #genel'e bir kez
// söylenir. Sipariş Paneli'nde Ada ekip temposunu 4 kişi yapmış (kurulun üst sınırı 8); Deniz, Ece, Kerem ve Burak'ın
// kiraladığı dosyalar ve son görev kayıtları (geçen, geçmeyen, kuyruktaki, testleri süren) tohumlanır.
//
// Canlı: ofis döngüsünün birleştirme adımı ve ofis gösterisinin birleştirmesi yerine görev kaydı oynar (çalışanın
// kiraladığı dosyalar commit'lenir, kira biter; kalite denetimi kuyrukta → hazırlık → test → geçti ya da geçmedi);
// görev kayıtlarında kira, tempo ve kayıt olayları yayınlanır. Yeni işe alınana çalışma alanı açılmaz.
//
// Uçlar: GET /api/projeler/:pid/ortak, GET /api/kayitlar/:kid/fark, POST /api/kayitlar/:kid/yeniden; eski
// POST /api/onaylar/:oid/birlestir 410 döner; GET /api/projeler/:pid/calisma-alanlari yalnız ortak projeyi verir.
// Geliştirme uçları (yalnız sahte çekirdek):
//   POST /api/gelistirme/ortak-kayit   çalışan bir ajanın görevini kaydeder ({ kalsin: true } ile testler geçmez)
//   POST /api/gelistirme/ortak-tempo   Ada ekip temposunu değiştirir ({ es_zamanli, gerekce })

import { ceviri } from "./dil.mjs";
import { V } from "./tohum.mjs";

const OFIS = "siparis-paneli";
/** Kurulun üst sınırı (0.0.8 varsayılanı) */
const UST_SINIR = 8;
/** Kalite denetiminin adım süreleri (sahne) */
const HAZIRLIK_MS = 2_500;
const TEST_MS = 9_000;

export function kur(c) {
  const { rota, rotalar, db, yay, yayDinle, mesajEkle, akisEkle, ajanBul, projeAjanlari, proje, projeGerekli, projeYay, Hata, simdi, yeniKimlik } = c;
  const once = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
  const onceSn = (sn) => new Date(Date.now() - sn * 1000).toISOString();
  const commitKimligi = () => Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const gorevBul = (id) => db.gorevler.find((g) => g.id === id);
  const ceoBul = (pid) => projeAjanlari(pid).find((a) => a.rol === "ceo") ?? null;
  const ajanYay = (a) => yay({ tur: "ajan.guncellendi", ajan: a }, a.projeId);

  /** Proje → kiralar, kayıtlar, tempo, kalanlar */
  const durumlar = new Map();
  const durumu = (pid) => {
    let d = durumlar.get(pid);
    if (!d) durumlar.set(pid, (d = { kiralar: [], kayitlar: [], tempo: null, kalanlar: [] }));
    return d;
  };

  // ---------------------------------------------------------------------------
  // 0.0.8 geçişi
  // ---------------------------------------------------------------------------

  if (db.ayarlar.esZamanliAjan === 3 || db.ayarlar.esZamanliAjan === 4) db.ayarlar.esZamanliAjan = UST_SINIR;
  const eskiKok = (id) => `${V.CALISMA_KOKU}/${id}`;
  /** Eski kişisel alandaki yol ortak projeye taşınır (tohum akışları ve denetim kayıtları) */
  const yolTasi = (metin) => (typeof metin === "string" ? metin.replace(new RegExp(`${V.CALISMA_KOKU.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-z0-9-]+`, "g"), V.PROJE_KOKU) : metin);
  for (const ogeler of Object.values(db.akislar ?? {})) {
    for (const o of ogeler) {
      if (o.girdi && typeof o.girdi === "object") for (const k of ["file_path", "path", "notebook_path", "command"]) if (k in o.girdi) o.girdi[k] = yolTasi(o.girdi[k]);
    }
  }
  for (const k of db.denetim ?? []) k.girdiOzeti = yolTasi(k.girdiOzeti);

  for (const a of db.ajanlar) {
    a.calismaAlani = null;
    a.dal = null;
  }
  // Yeni işe alınana kişisel alan açılmaz (eski sahne kodu alan yazarsa boşaltılır)
  yayDinle((o) => {
    if (o.tur !== "ajan.guncellendi") return;
    const a = ajanBul(o.ajan.id);
    if (a && (a.calismaAlani || a.dal)) {
      a.calismaAlani = null;
      a.dal = null;
      ajanYay(a);
    }
  });

  // Bekleyen birleştirmeler kapanır: dalı alınan onaylanmış, çakışan reddedilmiş sayılır
  for (const o of db.onaylar) {
    if (o.tur !== "birlestirme" || o.durum !== "bekliyor") continue;
    o.durum = "onaylandi";
    o.sonuclanma = simdi();
    o.not = ceviri("ArnOrg 0.0.8: birleştirme onayı kalktı; dal ortak projeye alındı.", "ArnOrg 0.0.8: merge approvals are gone; the branch was brought into the shared project.");
    o.kararKaynagi = "otomatik";
    o.kararVerenAd = "ArnOrg";
  }

  // Kalite kapısında yarım kalan eski birleştirme sonuçlanır: geçişte dal ortak projeye alındı
  for (const o of db.onaylar) {
    const k = o.tur === "birlestirme" ? o.veri?.kalite : null;
    if (!k || !["kuyrukta", "hazirlik", "test"].includes(k.durum)) continue;
    o.veri.kalite = { ...k, durum: "birlesti", sira: null, adimBaslangic: null, bitis: simdi(), mesaj: ceviri("ArnOrg 0.0.8: dal ortak projeye alındı.", "ArnOrg 0.0.8: the branch was brought into the shared project.") };
  }

  // Ofisin kalanı: Selin'in commit'lenmemiş değişikliği olan eski alanı korundu
  durumu(OFIS).kalanlar = [
    {
      ajanAd: "Selin",
      dal: "arnorg/selin",
      yol: eskiKok("selin"),
      neden: "kirli",
      ayrinti: ceviri("2 commit'lenmemiş değişiklik", "2 uncommitted changes"),
    },
  ];
  if (proje(OFIS)) {
    mesajEkle(
      OFIS,
      "genel",
      "arnorg",
      ceviri(
        "ArnOrg 0.0.8: ekip artık tek projede, main dalında görev bazlı çalışıyor; kişisel dal ve birleştirme onayı yok. Görev 'inceleme'ye geçince ArnOrg dosyalarını commit'ler. 7 eski çalışma alanı kaldırıldı.\nOrtak projeye alınamayıp korunanlar (hiçbir iş silinmedi):\n- Selin · arnorg/selin · " +
          eskiKok("selin") +
          " (2 commit'lenmemiş değişiklik)\nİçlerinden gerekeni ortak projeye elle taşıyın ya da işi yeniden planlayın.",
        "ArnOrg 0.0.8: the team now works in one project, task by task on main; there are no personal branches or merge approvals. When a task moves to 'inceleme', ArnOrg commits its files. 7 old workspaces were removed.\nKept because they could not be brought in (no work was deleted):\n- Selin · arnorg/selin · " +
          eskiKok("selin") +
          " (2 uncommitted changes)\nMove what you need into the shared project by hand, or plan the work again.",
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Tohum: tempo, kiralar, kayıtlar
  // ---------------------------------------------------------------------------

  const ajanAdi = (id) => ajanBul(id)?.ad ?? id;
  function kira(pid, ajanId, gorevId, yol, kaynak, dk) {
    const g = gorevId ? gorevBul(gorevId) : null;
    return { yol, ajanId, ajanAd: ajanAdi(ajanId), gorevId, gorevKodu: g?.kod ?? null, baslangic: once(dk), son: once(Math.max(0, dk - 3)), kaynak };
  }
  function bosKalite(durum, komut) {
    return { durum, komut: komut ?? null, sira: null, baslangic: null, adimBaslangic: null, bitis: null, sureMs: null, cikti: "", mesaj: null, kirmiziKayit: null };
  }
  function kayitOlustur(pid, gorevId, ajanId, dosyalar, eklenen, silinen, neden, zaman, kalite) {
    const g = gorevBul(gorevId);
    return {
      id: yeniKimlik("k"),
      projeId: pid,
      gorevId,
      gorevKodu: g?.kod ?? null,
      baslik: `${g?.kod ?? ""} ${g?.baslik ?? ""}`.trim(),
      ajanId,
      ajanAd: ajanAdi(ajanId),
      commit: commitKimligi(),
      dal: proje(pid)?.varsayilanDal ?? "main",
      dosyalar,
      eklenen,
      silinen,
      neden,
      zaman,
      kalite,
    };
  }
  const gectiKalite = (zaman, sn, cikti) => ({
    ...bosKalite("gecti", "npm test"),
    baslangic: zaman,
    adimBaslangic: null,
    bitis: new Date(Date.parse(zaman) + sn * 1000).toISOString(),
    sureMs: sn * 1000,
    cikti: cikti ?? `$ npm ci\nadded 412 packages in 9s\n$ npm test\n\n Test Files  14 passed (14)\n      Tests  52 passed (52)\n   Duration  ${sn - 11}.4s`,
  });

  if (proje(OFIS)) {
    const d = durumu(OFIS);
    d.tempo = {
      secim: 4,
      gerekce: ceviri(
        "T-24 ve T-26 bağımsız dosyalarda; Kerem mimariyi, Burak CI'ı yürütüyor. Mert T-24'ü, Onur incelemeyi bekliyor: dört kişi birbirini beklemeden ilerler.",
        "T-24 and T-26 touch separate files; Kerem drives the architecture and Burak the CI. Mert waits on T-24 and Onur on the review: four people move without waiting on each other.",
      ),
      zaman: once(26),
      ustSinir: db.ayarlar.esZamanliAjan ?? UST_SINIR,
      gecerli: 4,
      calisan: 0,
      sirada: 0,
      belirleyen: "ceo",
    };
    d.kiralar = [
      kira(OFIS, "deniz", "g24", "api/src/siparisler/rota.ts", "arac", 18),
      kira(OFIS, "deniz", "g24", "api/src/siparisler/dogrulama.ts", "arac", 14),
      kira(OFIS, "deniz", "g24", "api/test/siparisler.test.ts", "kabuk", 9),
      kira(OFIS, "ece", "g26", "web/src/sayfalar/Siparisler.tsx", "arac", 12),
      kira(OFIS, "ece", "g26", "web/src/bilesenler/DurumRozeti.tsx", "arac", 7),
      kira(OFIS, "kerem", "g21", ".arnorg/notlar/kararlar/ADR-004-jeton-yenileme.md", "arac", 22),
      kira(OFIS, "burak", null, ".github/workflows/ci.yml", "kabuk", 5),
    ];
    const t26 = onceSn(70);
    const t24 = once(4);
    const t22 = once(15);
    const t19 = once(48);
    const t19ilk = once(66);
    const kirmiziCikti = `$ npm ci\nadded 412 packages in 9s\n$ npm test\n\n FAIL  api/test/siparisler.test.ts > PATCH /siparisler/:id/durum > ${ceviri("geçersiz geçişte 422 döner", "returns 422 on an invalid transition")}\nAssertionError: expected 500 to be 422\n ❯ api/test/siparisler.test.ts:88:31\n\n Test Files  1 failed | 13 passed (14)\n      Tests  1 failed | 51 passed (52)`;
    const ilk = kayitOlustur(OFIS, "g19", "ece", ["web/src/oturum/GirisFormu.tsx", "web/src/oturum/jeton.ts", "web/src/oturum/jeton.test.ts"], 96, 31, "inceleme", t19ilk, {
      ...bosKalite("kaldi", "npm test"),
      baslangic: t19ilk,
      bitis: once(65),
      sureMs: 51_000,
      mesaj: ceviri("npm test başarısız (çıkış kodu 1).", "npm test failed (exit code 1)."),
      cikti: `$ npm ci\nadded 412 packages in 9s\n$ npm test\n\n FAIL  web/src/oturum/jeton.test.ts > ${ceviri("iki sekme aynı anda yeniler", "two tabs refresh at once")}\nAssertionError: expected 2 to be 1\n\n Test Files  1 failed | 13 passed (14)\n      Tests  1 failed | 50 passed (51)`,
    });
    const kirmizi = kayitOlustur(OFIS, "g24", "deniz", ["api/src/siparisler/rota.ts", "api/src/siparisler/dogrulama.ts", "api/test/siparisler.test.ts", "api/src/hata.ts"], 201, 12, "ara", t24, {
      ...bosKalite("kaldi", "npm test"),
      baslangic: t24,
      bitis: once(3),
      sureMs: 47_000,
      mesaj: ceviri("npm test başarısız (çıkış kodu 1).", "npm test failed (exit code 1)."),
      cikti: kirmiziCikti,
    });
    d.kayitlar = [
      kayitOlustur(OFIS, "g26", "ece", ["web/src/sayfalar/Siparisler.tsx", "web/src/bilesenler/DurumRozeti.tsx", "web/src/api/siparisler.ts"], 142, 18, "ara", t26, {
        ...bosKalite("test", "npm test"),
        baslangic: t26,
        adimBaslangic: onceSn(52),
        cikti: "$ npm ci\nadded 412 packages in 9s\n$ npm test\n\n ✓ web/src/sayfalar/Siparisler.test.tsx (6 tests)",
      }),
      kirmizi,
      kayitOlustur(OFIS, "g22", "deniz", ["api/src/urunler/rota.ts", "api/src/urunler/sayfalama.ts", "api/test/urunler.test.ts"], 64, 7, "inceleme", t22, gectiKalite(t22, 48)),
      kayitOlustur(OFIS, "g21", "kerem", [".arnorg/notlar/kararlar/ADR-004-jeton-yenileme.md", "docs/jeton-akisi.md"], 88, 4, "ara", once(31), gectiKalite(once(31), 41)),
      kayitOlustur(OFIS, "g19", "ece", ["web/src/oturum/jeton.ts", "web/src/oturum/jeton.test.ts"], 22, 9, "inceleme", t19, gectiKalite(t19, 52)),
      ilk,
      kayitOlustur(OFIS, "g18", "ece", ["web/src/bilesenler/Tablo.tsx", "web/src/bilesenler/Rozet.tsx", "web/src/bilesenler/Dugme.tsx", "web/src/stiller/tokenlar.css"], 233, 41, "tamam", once(95), gectiKalite(once(95), 44)),
      kayitOlustur(OFIS, "g17", "kerem", [".github/workflows/ci.yml", "package.json"], 57, 3, "tamam", once(130), gectiKalite(once(130), 39)),
    ];
  }

  // ---------------------------------------------------------------------------
  // Uçlar
  // ---------------------------------------------------------------------------

  /** Önce eşleşsin diye rotayı başa alır (eski sürüm modüllerinin aynı yoldaki rotasının önüne geçer) */
  const oncelikliRota = (yontem, desen, isleyici) => {
    rota(yontem, desen, isleyici);
    rotalar.unshift(rotalar.pop());
  };

  const tempoHesapla = (pid) => {
    const d = durumu(pid);
    const ust = db.ayarlar.esZamanliAjan ?? UST_SINIR;
    const pr = proje(pid);
    const ceoKipi = pr?.kararVeren !== "kurul";
    const ekip = projeAjanlari(pid).filter((a) => a.rol !== "ceo");
    const secim = ceoKipi ? (d.tempo?.secim ?? null) : null;
    return {
      secim,
      gerekce: ceoKipi ? (d.tempo?.gerekce ?? null) : null,
      zaman: ceoKipi ? (d.tempo?.zaman ?? null) : null,
      ustSinir: ust,
      gecerli: secim !== null ? (ust > 0 ? Math.min(secim, ust) : secim) : ust,
      calisan: ekip.filter((a) => a.durum === "calisiyor" || a.durum === "karar_bekliyor").length,
      sirada: ekip.filter((a) => /^(Sırada|Queued)/.test(a.isAciklamasi ?? "")).length,
      belirleyen: ceoKipi ? "ceo" : "kurul",
    };
  };

  oncelikliRota("GET", "/api/projeler/:pid/ortak", ({ p }) => {
    projeGerekli(p.pid);
    const d = durumu(p.pid);
    return { kiralar: d.kiralar, tempo: tempoHesapla(p.pid), kayitlar: d.kayitlar.slice(0, 60), kalanlar: d.kalanlar };
  });

  const kayitBul = (kid) => {
    for (const d of durumlar.values()) {
      const k = d.kayitlar.find((x) => x.id === kid);
      if (k) return k;
    }
    throw new Hata(404, ceviri("Kayıt bulunamadı.", "Save not found."));
  };

  oncelikliRota("GET", "/api/kayitlar/:kid/fark", ({ p }) => {
    const k = kayitBul(p.kid);
    const dosyalar = k.dosyalar.map((yol, i) => ({ yol, degisiklik: i === 0 && k.eklenen > 100 ? "A" : "M", eklenen: Math.max(1, Math.round(k.eklenen / k.dosyalar.length)), silinen: Math.round(k.silinen / k.dosyalar.length) }));
    const fark = k.dosyalar
      .map((yol, i) => {
        const yeni = dosyalar[i].degisiklik === "A";
        const govde = yeni
          ? `@@ -0,0 +1,4 @@\n+// ${k.baslik}\n+export function ${yol.split("/").pop()?.replace(/\W.*$/, "") ?? "yeni"}() {\n+  return null;\n+}`
          : `@@ -10,6 +10,8 @@\n import { hata } from "../hata";\n \n-const SINIR = 20;\n+const SINIR = 50;\n+// ${k.gorevKodu ?? ""}: ${ceviri("sayfalama imleçle", "cursor pagination")}\n+export const imlecli = true;\n export function sayfa(liste) {\n   return liste.slice(0, SINIR);\n }`;
        return `diff --git a/${yol} b/${yol}\n${yeni ? "new file mode 100644\n--- /dev/null" : `--- a/${yol}`}\n+++ b/${yol}\n${govde}`;
      })
      .join("\n");
    return { fark, dosyalar };
  });

  oncelikliRota("POST", "/api/kayitlar/:kid/yeniden", ({ p }) => {
    const k = kayitBul(p.kid);
    if (!["gecti", "kaldi", "zaman_asimi", "hata", "testsiz", "atlandi"].includes(k.kalite.durum)) throw new Hata(409, ceviri("Bu kaydın denetimi zaten sürüyor.", "This save is already being checked."));
    if (!proje(k.projeId)?.testKomutu) throw new Hata(409, ceviri("Projede test komutu yok; Projeler'deki ayarlardan ekleyin.", "The project has no test command; add one in the project settings."));
    denetimeAl(k, false);
    return k;
  });

  oncelikliRota("POST", "/api/onaylar/:oid/birlestir", () => {
    throw new Hata(
      410,
      ceviri(
        "ArnOrg 0.0.8'de birleştirme yok: ekip ortak projede çalışır, görev 'inceleme'ye geçince ArnOrg dosyalarını commit'ler.",
        "ArnOrg 0.0.8 has no merges: the team works in the shared project, and ArnOrg commits a task's files when it moves to 'inceleme'.",
      ),
    );
  });

  oncelikliRota("GET", "/api/projeler/:pid/calisma-alanlari", ({ p }) => {
    const pr = projeGerekli(p.pid);
    return [{ kimlik: "ana", yol: pr.yol, dal: pr.varsayilanDal, ajanId: null, ana: true }];
  });

  // ---------------------------------------------------------------------------
  // Kayıt ve kalite denetimi (sahne)
  // ---------------------------------------------------------------------------

  /** gorev.kaydedildi kaydın kısa alanlarını da taşır (ortak tiplerde gorevKaydiOlayi); kayit.guncellendi yalnız kaydı */
  const kayitYay = (tur, k) =>
    yay(
      tur === "gorev.kaydedildi"
        ? { tur, projeId: k.projeId, gorevId: k.gorevId, gorevKodu: k.gorevKodu, ajanId: k.ajanId, mesaj: k.baslik, commit: k.commit, dosyalar: k.dosyalar, kayit: k }
        : { tur, projeId: k.projeId, kayit: k },
      k.projeId,
    );
  const kiraYay = (pid) => yay({ tur: "kira.guncellendi", projeId: pid, kiralar: durumu(pid).kiralar }, pid);

  // Canlı: çalışanın yazdığı dosya ona kiralanır (çekirdekte kapı yapar); başkasının kiralıysa dokunulmaz
  const YAZAN = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
  yayDinle((o) => {
    if (o.tur !== "ajan.akis" || o.oge?.tur !== "arac_cagrisi" || !YAZAN.has(o.oge.arac)) return;
    const a = ajanBul(o.oge.ajanId);
    const pr = a ? proje(a.projeId) : null;
    const tam = String(o.oge.girdi?.file_path ?? o.oge.girdi?.notebook_path ?? "");
    if (!a || !pr || a.rol === "ceo" || !tam.startsWith(`${pr.yol}/`)) return;
    const yol = tam.slice(pr.yol.length + 1);
    const d = durumu(a.projeId);
    const var_ = d.kiralar.find((k) => k.yol === yol);
    if (var_ && var_.ajanId !== a.id) return;
    if (var_) var_.son = simdi();
    else d.kiralar.push({ ...kira(a.projeId, a.id, a.gorevId ?? null, yol, "arac", 0), baslangic: simdi(), son: simdi() });
    kiraYay(a.projeId);
  });
  /** Projede süren denetim (sırayla, aynı anda tek) */
  const surenler = new Map();
  // T-26'nın tohumdaki denetimi sürüyor; birkaç saniye sonra geçer
  const surenTohum = proje(OFIS) ? durumu(OFIS).kayitlar[0] : null;
  if (surenTohum) {
    surenler.set(OFIS, surenTohum.id);
    setTimeout(() => denetimiBitir(OFIS, surenTohum.id, false), 12_000);
  }

  function denetimeAl(k, kalsin) {
    const pr = proje(k.projeId);
    if (!pr?.testKomutu) {
      k.kalite = { ...bosKalite("testsiz"), bitis: simdi() };
      kayitYay("kayit.guncellendi", k);
      return;
    }
    k.kalite = { ...bosKalite("kuyrukta", pr.testKomutu), sira: (surenler.get(k.projeId) ? 2 : 1) };
    kayitYay("kayit.guncellendi", k);
    const basla = () => {
      surenler.set(k.projeId, k.id);
      const bas = simdi();
      k.kalite = { ...k.kalite, durum: "hazirlik", komut: pr.hazirlikKomutu ?? pr.testKomutu, sira: null, baslangic: bas, adimBaslangic: bas, cikti: `$ ${pr.hazirlikKomutu ?? pr.testKomutu}\n` };
      kayitYay("kayit.guncellendi", k);
      setTimeout(() => {
        k.kalite = { ...k.kalite, durum: "test", komut: pr.testKomutu, adimBaslangic: simdi(), cikti: `${k.kalite.cikti}added 412 packages in 9s\n$ ${pr.testKomutu}\n` };
        kayitYay("kayit.guncellendi", k);
        setTimeout(() => denetimiBitir(k.projeId, k.id, kalsin), TEST_MS);
      }, HAZIRLIK_MS);
    };
    if (surenler.get(k.projeId)) setTimeout(basla, HAZIRLIK_MS + TEST_MS + 500);
    else basla();
  }

  function denetimiBitir(pid, kid, kalsin) {
    const d = durumu(pid);
    const k = d.kayitlar.find((x) => x.id === kid);
    if (!k || ["gecti", "kaldi", "zaman_asimi", "hata", "testsiz", "atlandi"].includes(k.kalite.durum)) return;
    if (surenler.get(pid) === kid) surenler.delete(pid);
    const bas = k.kalite.baslangic ? Date.parse(k.kalite.baslangic) : Date.now();
    const onceki = d.kayitlar.find((x) => x.id !== kid && ["gecti", "kaldi", "zaman_asimi"].includes(x.kalite.durum) && x.zaman <= k.zaman);
    const kirmizi = kalsin && onceki && onceki.kalite.durum !== "gecti" ? (onceki.kalite.kirmiziKayit ?? onceki.id) : null;
    k.kalite = kalsin
      ? {
          ...k.kalite,
          durum: "kaldi",
          sira: null,
          adimBaslangic: null,
          bitis: simdi(),
          sureMs: Date.now() - bas,
          mesaj: ceviri(`${k.kalite.komut} başarısız (çıkış kodu 1).`, `${k.kalite.komut} failed (exit code 1).`),
          cikti: `${k.kalite.cikti}\n FAIL  ${k.dosyalar[0]} > ${ceviri("boş liste durumu", "empty list state")}\nAssertionError: expected undefined to be defined\n\n Test Files  1 failed | 13 passed (14)\n      Tests  1 failed | 51 passed (52)`,
          kirmiziKayit: kirmizi,
        }
      : {
          ...k.kalite,
          durum: "gecti",
          sira: null,
          adimBaslangic: null,
          bitis: simdi(),
          sureMs: Date.now() - bas,
          cikti: `${k.kalite.cikti}\n Test Files  14 passed (14)\n      Tests  52 passed (52)`,
          kirmiziKayit: null,
        };
    kayitYay("kayit.guncellendi", k);
    if (!kalsin && onceki && onceki.kalite.durum !== "gecti") {
      mesajEkle(pid, "genel", "arnorg", ceviri(`${k.gorevKodu} kaydından sonra testler yeniden geçiyor; main yeşil.`, `The tests pass again after the ${k.gorevKodu} save; main is green.`));
    }
    if (kalsin && !kirmizi && k.ajanId) {
      mesajEkle(pid, "genel", "arnorg", ceviri(`${k.gorevKodu} "${gorevBul(k.gorevId)?.baslik ?? ""}" kaydından sonra testler geçmedi; görev ${ajanAdi(k.ajanId)} kişisine geri döndü.`, `The tests failed after the ${k.gorevKodu} "${gorevBul(k.gorevId)?.baslik ?? ""}" save; the task went back to ${ajanAdi(k.ajanId)}.`));
    }
  }

  /** Çalışanın görevini kaydeder: kiraladığı dosyalar commit'lenir, kira biter, denetim kuyruğa girer */
  function gorevKaydet(pid, ajanId, gorevId, neden, kalsin = false) {
    const d = durumu(pid);
    const kiralar = d.kiralar.filter((k) => k.ajanId === ajanId && (k.gorevId === gorevId || !k.gorevId));
    const dosyalar = kiralar.length ? kiralar.map((k) => k.yol) : [`src/${gorevBul(gorevId)?.etiket ?? "is"}/${(gorevBul(gorevId)?.kod ?? "is").toLowerCase()}.ts`];
    const k = kayitOlustur(pid, gorevId, ajanId, dosyalar, 20 + Math.floor(Math.random() * 120), Math.floor(Math.random() * 25), neden, simdi(), bosKalite("kuyrukta", proje(pid)?.testKomutu ?? null));
    d.kayitlar.unshift(k);
    d.kayitlar.splice(60);
    if (kiralar.length) {
      d.kiralar = d.kiralar.filter((x) => !kiralar.includes(x));
      kiraYay(pid);
    }
    kayitYay("gorev.kaydedildi", k);
    akisEkle(ajanId, {
      tur: "sistem",
      metin: ceviri(`ArnOrg ${k.gorevKodu} görevini kaydetti: ${k.commit.slice(0, 7)} · ${dosyalar.length} dosya`, `ArnOrg saved ${k.gorevKodu}: ${k.commit.slice(0, 7)} · ${dosyalar.length} files`),
    });
    setTimeout(() => denetimeAl(k, kalsin), 600);
    // Sahne: çalışan bir süre sonra görevinde yeni dosyalara dokunur (kira geri gelir)
    setTimeout(() => {
      const a = ajanBul(ajanId);
      if (!a || a.durum !== "calisiyor" || !gorevBul(gorevId) || gorevBul(gorevId).durum !== "calisiliyor") return;
      d.kiralar.push(kira(pid, ajanId, gorevId, dosyalar[0], "arac", 0));
      kiraYay(pid);
    }, 20_000);
    return k;
  }

  // Ofis döngüsü ve gösterisi birleştirme yerine görev kaydı oynatır (sahte-sunucu.mjs ve surum-005-ofis.mjs bu kancaya bakar)
  let siradaki = 0;
  db.ortakCalisma = {
    /** Ofis döngüsünün adımı: çalışan bir ajanın görevi ara kayıtla kaydedilir (dört kayıtta bir testler geçmez) */
    kayitDongusu() {
      const adaylar = projeAjanlari(OFIS).filter((a) => a.rol !== "ceo" && a.durum === "calisiyor" && a.gorevId && gorevBul(a.gorevId)?.durum === "calisiliyor");
      if (!adaylar.length || surenler.get(OFIS)) return;
      const a = adaylar[siradaki++ % adaylar.length];
      gorevKaydet(OFIS, a.id, a.gorevId, "ara", siradaki % 4 === 0);
    },
    /** Ofis gösterisinin birleştirmesi yerine: görev incelemeye geçmiş sayılır ve kaydedilir */
    gosteriKaydi(gorevId, ajanId) {
      if (surenler.get(OFIS)) return;
      gorevKaydet(OFIS, ajanId, gorevId, "inceleme", false);
    },
    /** Başka sahnelerin görev kaydı (surum-008-canli.mjs): çalışanın kiraladığı dosyalar commit'lenir */
    gorevKaydi(pid, ajanId, gorevId, neden = "ara") {
      return gorevKaydet(pid, ajanId, gorevId, neden, false);
    },
  };

  // ---------------------------------------------------------------------------
  // Geliştirme uçları
  // ---------------------------------------------------------------------------

  rota("POST", "/api/gelistirme/ortak-kayit", ({ govde }) => {
    const pid = govde?.projeId ?? OFIS;
    projeGerekli(pid);
    const a = projeAjanlari(pid).find((x) => x.rol !== "ceo" && x.gorevId && (govde?.ajan ? x.ad === govde.ajan || x.id === govde.ajan : x.durum === "calisiyor"));
    if (!a) throw new Hata(409, ceviri("Görevi süren bir çalışan yok.", "No employee has a task in progress."));
    return gorevKaydet(pid, a.id, a.gorevId, "ara", Boolean(govde?.kalsin));
  });

  rota("POST", "/api/gelistirme/ortak-tempo", ({ govde }) => {
    const pid = govde?.projeId ?? OFIS;
    projeGerekli(pid);
    const ceo = ceoBul(pid);
    if (!ceo) throw new Hata(409, ceviri("Bu projede CEO yok.", "This project has no CEO."));
    const ust = db.ayarlar.esZamanliAjan ?? UST_SINIR;
    const istenen = Math.max(1, Math.round(Number(govde?.es_zamanli ?? 3)));
    const secim = ust > 0 ? Math.min(istenen, ust) : istenen;
    const gerekce = String(govde?.gerekce ?? ceviri("Ödeme akışı aynı dosyalara dokunuyor; iki kişi yeter.", "The payment flow touches the same files; two people are enough."));
    durumu(pid).tempo = { ...(durumu(pid).tempo ?? {}), secim, gerekce, zaman: simdi() };
    const kimlik = yeniKimlik("toolu");
    akisEkle(ceo.id, { tur: "arac_cagrisi", arac: "mcp__arnorg__ekip_temposu", aracKimligi: kimlik, girdi: { es_zamanli: istenen, gerekce } });
    akisEkle(ceo.id, { tur: "arac_sonucu", aracKimligi: kimlik, metin: ceviri(`Ekip temposu ${secim} oldu (kurulun üst sınırı ${ust}).`, `The team pace is now ${secim} (board's ceiling ${ust}).`) });
    mesajEkle(pid, "genel", "arnorg", ceviri(`${ceo.ad} (CEO) ekip temposunu ${secim} kişi yaptı (kurulun üst sınırı ${ust}): ${gerekce}`, `${ceo.ad} (CEO) set the team pace to ${secim} (board's ceiling ${ust}): ${gerekce}`));
    const tempo = tempoHesapla(pid);
    yay({ tur: "tempo.guncellendi", projeId: pid, tempo }, pid);
    projeYay(pid);
    return tempo;
  });

  // Durum değişince tempo satırı canlı kalsın (çalışan ve sıradaki sayısı)
  yayDinle((o) => {
    if (o.tur !== "ajan.guncellendi" || !durumlar.has(o.ajan.projeId)) return;
    const d = durumu(o.ajan.projeId);
    if (!d.tempo) return;
    const yeni = tempoHesapla(o.ajan.projeId);
    if (yeni.sirada === d.sonSirada) return;
    d.sonSirada = yeni.sirada;
    yay({ tur: "tempo.guncellendi", projeId: o.ajan.projeId, tempo: yeni }, o.ajan.projeId);
  });
}
