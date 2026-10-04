// Sahte çekirdeğin 0.0.4 kalite kapısı: proje ayarlarında test ve hazırlık komutu ile süre sınırı, package.json
// önerisi, onaylanan birleştirmenin proje başına sırayla canlandırılan kapısı (kuyrukta → hazırlık → test → birleşti
// ya da testler geçmedi), testsiz birleştirme ve yeniden deneme, dalın hedefe göre farkı. Geçmişte birleşmiş, çakışmış
// ve zaman aşımına uğramış birer birleştirme ile kapıda kalacak bekleyen bir birleştirme tohumlanır.

import { ceviri } from "./dil.mjs";

const OFIS = "siparis-paneli";
const YENIDEN = ["test_basarisiz", "zaman_asimi", "hata"];

export function kur(c) {
  const { rota, rotalar, db, yay, yayDinle, proje, mesajEkle, Hata, simdi, yeniKimlik, projeGerekli, projeYay } = c;
  const once = (dk) => new Date(Date.now() - dk * 60_000).toISOString();
  const commit = () => [...Array(40)].map(() => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

  // -------------------------------------------------------------------------
  // Proje alanları; PATCH /api/projeler/:pid kalite alanlarını da işler
  // -------------------------------------------------------------------------

  const kaliteVarsayilanlari = {
    [OFIS]: { testKomutu: "npm test", hazirlikKomutu: "npm ci", testZamanAsimiDk: 20 },
  };
  for (const p of db.projeler) Object.assign(p, { testKomutu: null, hazirlikKomutu: null, testZamanAsimiDk: 20 }, kaliteVarsayilanlari[p.id] ?? {});

  const yama = rotalar.find((r) => r.yontem === "PATCH" && r.desen.test("/api/projeler/x"));
  const eskiYama = yama.isleyici;
  yama.isleyici = (istek) => {
    const pr = projeGerekli(istek.p.pid);
    const g = istek.govde ?? {};
    const komut = (v, tr, en) => {
      const t = String(v ?? "").trim();
      if (/[\r\n]/.test(t)) throw new Hata(400, ceviri(`${tr} tek satır olmalı.`, `The ${en} must be a single line.`));
      return t || null;
    };
    const yeni = {};
    if (g.testKomutu !== undefined) yeni.testKomutu = komut(g.testKomutu, "Test komutu", "test command");
    if (g.hazirlikKomutu !== undefined) yeni.hazirlikKomutu = komut(g.hazirlikKomutu, "Hazırlık komutu", "preparation command");
    if (g.testZamanAsimiDk !== undefined) {
      const dk = Number(g.testZamanAsimiDk);
      if (!Number.isInteger(dk) || dk < 1 || dk > 240) throw new Hata(400, ceviri("Test süre sınırı 1–240 dakika olmalı.", "The test time limit must be 1–240 minutes."));
      yeni.testZamanAsimiDk = dk;
    }
    const komutDegisti = (yeni.testKomutu !== undefined && yeni.testKomutu !== pr.testKomutu) || (yeni.hazirlikKomutu !== undefined && yeni.hazirlikKomutu !== pr.hazirlikKomutu);
    Object.assign(pr, yeni);
    if (komutDegisti) {
      const hazirlik = pr.hazirlikKomutu ? ceviri(` (önce ${pr.hazirlikKomutu})`, ` (after ${pr.hazirlikKomutu})`) : "";
      mesajEkle(
        pr.id,
        "genel",
        "arnorg",
        pr.testKomutu
          ? ceviri(
              `Kalite kapısı: onaylı her birleştirmeden önce ${pr.testKomutu}${hazirlik} koşacak; geçmeyen iş ${pr.varsayilanDal} dalına girmez. birlestirme_iste'den önce aynı komutu kendi çalışma alanınızda koşun.`,
              `Quality gate: ${pr.testKomutu}${hazirlik} now runs before every approved merge; work that fails stays out of ${pr.varsayilanDal}. Run the same command in your own working directory before birlestirme_iste.`,
            )
          : ceviri("Kurul test komutunu kaldırdı; onaylı birleştirmelerde yalnız çakışma denetlenecek.", "The board removed the test command; approved merges will only be checked for conflicts."),
      );
    }
    return eskiYama(istek);
  };

  // package.json önerisi: sipariş panelinde ve sitede gerçek bir test betiği var gibi
  rota("GET", "/api/projeler/:pid/kalite-onerisi", ({ p }) => {
    projeGerekli(p.pid);
    return p.pid === OFIS ? { testKomutu: "npm test", hazirlikKomutu: "npm ci" } : { testKomutu: "npm test", hazirlikKomutu: "npm install" };
  });

  // -------------------------------------------------------------------------
  // Çıktılar
  // -------------------------------------------------------------------------

  const KOK = "/home/furkan/.local/share/arnorg/kalite";
  const npmCi = ["added 412 packages, and audited 413 packages in 8s", "", "96 packages are looking for funding", "  run `npm fund` for details", "", "found 0 vulnerabilities"];
  const testBasi = (pid) => ["", `> ${pid}@0.4.0 test`, "> vitest run", "", ` RUN  v2.1.4 ${KOK}/${pid}`, ""];
  const gecenTestler = [
    " ✓ src/katalog/urunler.test.ts (12 tests) 48ms",
    " ✓ src/katalog/sayfalama.test.ts (7 tests) 22ms",
    " ✓ src/siparis/durum.test.ts (9 tests) 31ms",
    " ✓ src/siparis/dogrulama.test.ts (11 tests) 19ms",
    " ✓ src/oturum/jeton.test.ts (6 tests) 64ms",
    " ✓ src/musteri/adres.test.ts (4 tests) 12ms",
    " ✓ istemci/src/liste.test.tsx (3 tests) 211ms",
  ];
  const gecti = [" ✓ src/sunucu/saglik.test.ts (1 test) 9ms", "", " Test Files  8 passed (8)", "      Tests  53 passed (53)", "   Start at  14:02:11", "   Duration  6.84s (transform 412ms, setup 0ms, collect 1.21s, tests 3.52s)"];
  const kaldi = [
    " ❯ src/oturum/yenileme.test.ts (6 tests | 2 failed) 88ms",
    ceviri("   × iki sekme aynı anda yenileyince tek jeton geçerli kalır", "   × only one token stays valid when two tabs refresh at once"),
    "     → expected 2 to be 1 // Object.is equality",
    ceviri("   × kullanılmış yenileme jetonu reddedilir", "   × a used refresh token is rejected"),
    "     → expected 200 to be 401 // Object.is equality",
    "",
    "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯",
    "",
    ceviri(" FAIL  src/oturum/yenileme.test.ts > iki sekme aynı anda yenileyince tek jeton geçerli kalır", " FAIL  src/oturum/yenileme.test.ts > only one token stays valid when two tabs refresh at once"),
    "AssertionError: expected 2 to be 1 // Object.is equality",
    "",
    "- Expected",
    "+ Received",
    "",
    "- 1",
    "+ 2",
    "",
    " ❯ src/oturum/yenileme.test.ts:41:32",
    "     39|     await Promise.all([yenile(jeton), yenile(jeton)]);",
    "     40|     const gecerli = await gecerliJetonlar(kullanici.id);",
    "     41|     expect(gecerli.length).toBe(1);",
    "       |                                ^",
    "     42|   });",
    "",
    " Test Files  1 failed | 7 passed (8)",
    "      Tests  2 failed | 51 passed (53)",
    "   Start at  14:02:11",
    "   Duration  7.02s",
  ];

  // -------------------------------------------------------------------------
  // Tohum: geçmişte kapıdan geçmiş üç birleştirme ve kapıda kalacak bekleyen bir birleştirme
  // -------------------------------------------------------------------------

  const kaliteKaydi = (o) => ({
    durum: "kuyrukta",
    sira: null,
    dalCommit: commit(),
    hedefCommit: commit(),
    testYok: false,
    testsiz: false,
    komut: "npm test",
    deneme: 1,
    kuyrugaGiris: o.sonuclanma,
    baslangic: o.sonuclanma,
    adimBaslangic: null,
    bitis: null,
    sureMs: null,
    cikti: "",
    mesaj: null,
  });
  const gecmis = (dk, baslik, ayrinti, veri, isteyen, kalite) => {
    const o = { id: yeniKimlik("o"), projeId: OFIS, ajanId: isteyen, tur: "birlestirme", baslik, ayrinti, veri, durum: "onaylandi", olusturma: once(dk + 9), sonGecerlilik: null, sonuclanma: once(dk), not: null };
    o.veri = { ...veri, kalite: { ...kaliteKaydi(o), ...kalite, bitis: once(dk - Math.round((kalite.sureMs ?? 60_000) / 60_000)) } };
    return o;
  };
  const tohum = [
    gecmis(
      60 * 26,
      ceviri("T-16 Veritabanı şeması → main", "T-16 Database schema → main"),
      ceviri("Şema ve ilk göç incelendi; göç geri alınabiliyor.", "Schema and first migration reviewed; the migration can be rolled back."),
      { gorevId: "g16", dal: "arnorg/deniz/T-16", hedefDal: "main", ajanId: "deniz", dosyaSayisi: 9, eklenen: 318, silinen: 4 },
      "onur",
      { durum: "birlesti", sureMs: 108_000, cikti: ["$ npm ci", ...npmCi, "", "$ npm test", ...testBasi(OFIS), ...gecenTestler.slice(0, 4), ...gecti].join("\n") },
    ),
    gecmis(
      60 * 20,
      ceviri("T-18 Tasarım sistemi → main", "T-18 Design system → main"),
      ceviri("Tablo, rozet ve form bileşenleri; boş ve hata durumları.", "Table, badge and form components; empty and error states."),
      { gorevId: "g18", dal: "arnorg/ece/T-18", hedefDal: "main", ajanId: "ece", dosyaSayisi: 14, eklenen: 642, silinen: 38 },
      "onur",
      { durum: "cakisma", komut: null, sureMs: 4_000, mesaj: ceviri("Çakışan dosyalar: istemci/src/bilesenler/Tablo.tsx, istemci/src/stiller/tablo.css", "Conflicting files: istemci/src/bilesenler/Tablo.tsx, istemci/src/stiller/tablo.css") },
    ),
    gecmis(
      60 * 3,
      ceviri("T-17 CI hattı → main", "T-17 CI pipeline → main"),
      ceviri("Windows ve Linux üzerinde lint, tür denetimi ve test.", "Lint, type check and tests on Windows and Linux."),
      { gorevId: "g17", dal: "arnorg/kerem/T-17", hedefDal: "main", ajanId: "kerem", dosyaSayisi: 3, eklenen: 87, silinen: 12 },
      "ada",
      {
        durum: "zaman_asimi",
        sureMs: 20 * 60_000 + 41_000,
        mesaj: ceviri("npm test 20 dk içinde bitmedi; süreç durduruldu.", "npm test did not finish within 20 min; the process was stopped."),
        cikti: [
          "$ npm ci",
          ...npmCi,
          "",
          "$ npm test",
          ...testBasi(OFIS),
          ...gecenTestler,
          " ✓ src/sunucu/saglik.test.ts (1 test) 9ms",
          "",
          " Test Files  8 passed (8)",
          "      Tests  53 passed (53)",
          "",
          "close timed out after 10000ms",
          "Tests closed successfully but something prevents Vite server from exiting",
          "You can try to identify the cause by enabling \"hanging-process\" reporter.",
        ].join("\n"),
      },
    ),
  ];
  db.onaylar.push(...tohum);
  const bekleyenT19 = {
    id: yeniKimlik("o"),
    projeId: OFIS,
    ajanId: "onur",
    tur: "birlestirme",
    baslik: ceviri("T-19 Oturum açma akışı → main", "T-19 Sign-in flow → main"),
    ayrinti: ceviri(
      "Ece yenileme jetonundaki yarışı düzeltti; ikinci turda inceledim, kod uygun. Testleri kendi alanında koştuğunu söylüyor.",
      "Ece fixed the race in the refresh token; I reviewed the second round and the code looks right. She says she ran the tests in her workspace.",
    ),
    veri: { gorevId: "g19", dal: "arnorg/ece/T-19", hedefDal: "main", ajanId: "ece", dosyaSayisi: 5, eklenen: 121, silinen: 34 },
    durum: "bekliyor",
    olusturma: once(7),
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
  };
  db.onaylar.unshift(bekleyenT19);

  // -------------------------------------------------------------------------
  // Kapı: proje başına sıra; onaylanan birleştirme sırayla canlandırılır
  // -------------------------------------------------------------------------

  /** Bilinen işlerin sonucu; diğerleri sırayla geçer ve kalır */
  const planlanan = new Map([
    ["o3", "gecti"],
    [bekleyenT19.id, "kaldi"],
  ]);
  let sonrakiKalsin = false;
  const bekleyenler = new Map();
  const calisanlar = new Map();
  const bekle = (ms) => new Promise((z) => setTimeout(z, ms));

  const yayinla = (o) => yay({ tur: "onay.sonuc", onay: o }, o.projeId);
  const guncelle = (o, d) => {
    o.veri.kalite = { ...o.veri.kalite, ...d };
    yayinla(o);
  };
  function siralar(pid) {
    const onde = calisanlar.has(pid) ? 1 : 0;
    (bekleyenler.get(pid) ?? []).forEach((o, i) => {
      if (o.veri.kalite.sira !== i + 1 + onde) guncelle(o, { sira: i + 1 + onde });
    });
  }

  function kuyrugaAl(o, testsiz = false) {
    const pr = proje(o.projeId);
    const onceki = o.veri?.kalite;
    o.veri = {
      ...(o.veri ?? {}),
      kalite: {
        durum: "kuyrukta",
        sira: null,
        dalCommit: onceki?.dalCommit ?? commit(),
        hedefCommit: onceki?.hedefCommit ?? null,
        testYok: !pr?.testKomutu,
        testsiz,
        komut: null,
        deneme: onceki?.deneme ?? 0,
        kuyrugaGiris: simdi(),
        baslangic: null,
        adimBaslangic: null,
        bitis: null,
        sureMs: null,
        cikti: testsiz ? (onceki?.cikti ?? "") : "",
        mesaj: null,
      },
    };
    yayinla(o);
    const l = bekleyenler.get(o.projeId) ?? [];
    l.push(o);
    bekleyenler.set(o.projeId, l);
    siralar(o.projeId);
    isle(o.projeId);
  }

  function isle(pid) {
    if (calisanlar.has(pid)) return;
    const o = bekleyenler.get(pid)?.shift();
    if (!o) return;
    calisanlar.set(pid, o);
    siralar(pid);
    calistir(o)
      .catch((e) => console.error(e))
      .finally(() => {
        calisanlar.delete(pid);
        isle(pid);
      });
  }

  async function akit(o, satirlar, araMs) {
    for (const s of satirlar) {
      await bekle(araMs);
      guncelle(o, { cikti: o.veri.kalite.cikti ? `${o.veri.kalite.cikti}\n${s}` : s });
    }
  }

  async function calistir(o) {
    const pr = proje(o.projeId);
    const k = o.veri.kalite;
    const baslangic = Date.now();
    const bitir = (d) => guncelle(o, { sira: null, adimBaslangic: null, bitis: simdi(), sureMs: Date.now() - baslangic, ...d });
    if (k.testsiz) {
      guncelle(o, { sira: null, baslangic: simdi() });
      await bekle(1600);
      bitir({ durum: "birlesti" });
      birlesti(o, pr);
      return;
    }
    guncelle(o, { durum: "hazirlik", sira: null, baslangic: simdi(), adimBaslangic: simdi(), deneme: k.deneme + 1, komut: pr.testKomutu ? pr.hazirlikKomutu : null, testYok: !pr.testKomutu, hedefCommit: commit(), cikti: "" });
    await bekle(1200);
    if (!pr.testKomutu) {
      bitir({ durum: "birlesti" });
      birlesti(o, pr);
      return;
    }
    if (pr.hazirlikKomutu) {
      guncelle(o, { cikti: `$ ${pr.hazirlikKomutu}` });
      await akit(o, npmCi, 450);
    }
    guncelle(o, { durum: "test", komut: pr.testKomutu, adimBaslangic: simdi(), cikti: `${o.veri.kalite.cikti}${o.veri.kalite.cikti ? "\n\n" : ""}$ ${pr.testKomutu}` });
    const plan = planlanan.get(o.id) ?? ((sonrakiKalsin = !sonrakiKalsin) ? "gecti" : "kaldi");
    await akit(o, [...testBasi(pr.id), ...gecenTestler.slice(0, plan === "gecti" ? 7 : 6)], 520);
    await akit(o, plan === "gecti" ? gecti : kaldi, 160);
    if (plan === "gecti") {
      bitir({ durum: "birlesti" });
      birlesti(o, pr);
      return;
    }
    bitir({ durum: "test_basarisiz", mesaj: ceviri(`${pr.testKomutu} başarısız (çıkış kodu 1).`, `${pr.testKomutu} failed (exit code 1).`) });
    const dal = o.veri.dal;
    mesajEkle(o.projeId, "genel", "arnorg", ceviri(`${dal} kalite kapısında kaldı: testler geçmedi; ${pr.varsayilanDal} dalına birleştirilmedi.`, `${dal} was stopped at the quality gate: the tests failed; it was not merged into ${pr.varsayilanDal}.`));
    yay({ tur: "bildirim", seviye: "uyari", metin: ceviri(`${dal}: testler geçmedi, birleştirilmedi. ${pr.testKomutu} başarısız (çıkış kodu 1).`, `${dal}: the tests failed, not merged. ${pr.testKomutu} failed (exit code 1).`), projeId: o.projeId });
  }

  function birlesti(o, pr) {
    const k = o.veri.kalite;
    const sure = Math.max(1, Math.round((k.sureMs ?? 0) / 1000));
    const kapi = k.testsiz
      ? ceviri(" Kurul testsiz birleştirdi.", " The board merged it without tests.")
      : !k.testYok && k.komut
        ? ceviri(` Testler geçti (${k.komut}, ${sure} sn).`, ` Tests passed (${k.komut}, ${sure} s).`)
        : "";
    mesajEkle(o.projeId, "genel", "arnorg", ceviri(`${o.veri.dal} ${pr.varsayilanDal} dalına birleştirildi.${kapi}`, `${o.veri.dal} was merged into ${pr.varsayilanDal}.${kapi}`));
    projeYay(o.projeId);
  }

  // Onaylanan (elle ya da otomatik) birleştirme kapıya girer; kapının kendi yayınları yok sayılır
  yayDinle((olay) => {
    if (olay.tur !== "onay.sonuc") return;
    const o = db.onaylar.find((x) => x.id === olay.onay.id);
    if (!o || o.tur !== "birlestirme" || o.durum !== "onaylandi" || o.veri?.kalite) return;
    kuyrugaAl(o);
  });

  rota("POST", "/api/onaylar/:oid/birlestir", ({ p, govde }) => {
    const o = db.onaylar.find((x) => x.id === p.oid);
    if (!o || o.tur !== "birlestirme") throw new Hata(404, ceviri("Birleştirme bulunamadı.", "Merge not found."));
    if (typeof govde?.testsiz !== "boolean") throw new Hata(400, ceviri("Geçersiz istek: testsiz — boolean bekleniyor", "Invalid request: testsiz — expected a boolean"));
    if (o.durum !== "onaylandi") throw new Hata(409, ceviri("Yalnız onaylanmış birleştirme yeniden işlenebilir.", "Only an approved merge can be processed again."));
    if (!YENIDEN.includes(o.veri?.kalite?.durum)) {
      throw new Hata(
        409,
        ceviri(
          "Bu birleştirme kalite kapısında kalmadı. Testsiz birleştirme ve yeniden deneme yalnız testler geçmediğinde, zaman aşımında ya da hatada yapılabilir.",
          "This merge is not stuck at the quality gate. Merging without tests and retrying are only possible after failed tests, a timeout or an error.",
        ),
      );
    }
    // Yeniden denenen iş bu kez geçer
    if (!govde.testsiz) planlanan.set(o.id, "gecti");
    kuyrugaAl(o, govde.testsiz);
    return o;
  });

  // -------------------------------------------------------------------------
  // Fark: dalın hedefe göre birleşik farkı
  // -------------------------------------------------------------------------

  const FARKLAR = {
    g19: {
      dosyalar: [
        { yol: "src/oturum/yenileme.ts", degisiklik: "M", eklenen: 38, silinen: 21 },
        { yol: "src/oturum/kilit.ts", degisiklik: "A", eklenen: 24, silinen: 0 },
        { yol: "src/oturum/yenileme.test.ts", degisiklik: "M", eklenen: 41, silinen: 6 },
      ],
      fark: [
        "diff --git a/src/oturum/yenileme.ts b/src/oturum/yenileme.ts",
        "index 4b1e2c0..9a77d13 100644",
        "--- a/src/oturum/yenileme.ts",
        "+++ b/src/oturum/yenileme.ts",
        "@@ -1,8 +1,9 @@",
        ' import { jetonUret, jetonDogrula } from "./jeton";',
        ' import { db } from "../db";',
        '+import { kilitle } from "./kilit";',
        " ",
        ceviri(" /** Yenileme jetonu tek kullanımlıktır (ADR-004) */", " /** Refresh tokens are single-use (ADR-004) */"),
        " export async function yenile(eski: string): Promise<JetonCifti> {",
        "-  const kayit = await db.yenilemeJetonu.bul(eski);",
        "-  if (!kayit || kayit.kullanildi) throw new YetkisizHata();",
        "+  return kilitle(`yenile:${eski}`, async () => {",
        "+    const kayit = await db.yenilemeJetonu.bul(eski);",
        "+    if (!kayit || kayit.kullanildi) throw new YetkisizHata();",
        "@@ -14,11 +15,14 @@ export async function yenile(eski: string): Promise<JetonCifti> {",
        "-  await db.yenilemeJetonu.guncelle(kayit.id, { kullanildi: true });",
        "-  return jetonUret(kayit.kullaniciId);",
        "+    const isaretlendi = await db.yenilemeJetonu.kullanildiYap(kayit.id);",
        ceviri("+    // İki sekme aynı anda gelirse yalnız biri işaretler", "+    // If two tabs arrive at once, only one of them marks it"),
        "+    if (!isaretlendi) throw new YetkisizHata();",
        "+    return jetonUret(kayit.kullaniciId);",
        "+  });",
        " }",
        "diff --git a/src/oturum/kilit.ts b/src/oturum/kilit.ts",
        "new file mode 100644",
        "index 0000000..c3d4e5f",
        "--- /dev/null",
        "+++ b/src/oturum/kilit.ts",
        "@@ -0,0 +1,12 @@",
        ceviri("+/** Aynı anahtar için işleri sıraya koyar (süreç içi) */", "+/** Serialises work for the same key (in-process) */"),
        "+const kilitler = new Map<string, Promise<unknown>>();",
        "+",
        "+export async function kilitle<T>(anahtar: string, is: () => Promise<T>): Promise<T> {",
        "+  const onceki = kilitler.get(anahtar) ?? Promise.resolve();",
        "+  const simdiki = onceki.then(is, is);",
        "+  kilitler.set(anahtar, simdiki.catch(() => undefined));",
        "+  return simdiki;",
        "+}",
        "diff --git a/src/oturum/yenileme.test.ts b/src/oturum/yenileme.test.ts",
        "index 77e0a1b..e81c2d4 100644",
        "--- a/src/oturum/yenileme.test.ts",
        "+++ b/src/oturum/yenileme.test.ts",
        "@@ -36,6 +36,12 @@ describe(\"yenileme\", () => {",
        ceviri('+  it("iki sekme aynı anda yenileyince tek jeton geçerli kalır", async () => {', '+  it("only one token stays valid when two tabs refresh at once", async () => {'),
        "+    await Promise.all([yenile(jeton), yenile(jeton)]);",
        "+    const gecerli = await gecerliJetonlar(kullanici.id);",
        "+    expect(gecerli.length).toBe(1);",
        "+  });",
        "+",
        "   it(\"süresi dolan jeton reddedilir\", async () => {",
        "",
      ].join("\n"),
    },
    varsayilan: {
      dosyalar: [
        { yol: "src/katalog/urunler.ts", degisiklik: "M", eklenen: 16, silinen: 5 },
        { yol: "src/katalog/urunler.test.ts", degisiklik: "A", eklenen: 22, silinen: 0 },
      ],
      fark: [
        "diff --git a/src/katalog/urunler.ts b/src/katalog/urunler.ts",
        "index 3f2a1c4..9b7e0d2 100644",
        "--- a/src/katalog/urunler.ts",
        "+++ b/src/katalog/urunler.ts",
        "@@ -9,12 +9,20 @@ export interface UrunSorgusu {",
        "   kategori?: string;",
        "-  sayfa?: number;",
        "-  boyut?: number;",
        ceviri("+  /** Ofset sayfalama: 0'dan başlar */", "+  /** Offset pagination: starts at 0 */"),
        "+  ofset?: number;",
        "+  sinir?: number;",
        " }",
        " ",
        " export async function urunleriListele(s: UrunSorgusu) {",
        "-  const boyut = s.boyut ?? 20;",
        "-  return db.urunler.bul({ kategori: s.kategori, atla: ((s.sayfa ?? 1) - 1) * boyut, al: boyut });",
        "+  const sinir = Math.min(Math.max(s.sinir ?? 20, 1), 100);",
        "+  const ofset = Math.max(s.ofset ?? 0, 0);",
        "+  const [urunler, toplam] = await Promise.all([",
        "+    db.urunler.bul({ kategori: s.kategori, atla: ofset, al: sinir }),",
        "+    db.urunler.say({ kategori: s.kategori }),",
        "+  ]);",
        "+  return { urunler, toplam, sonraki: ofset + sinir < toplam ? ofset + sinir : null };",
        " }",
        "diff --git a/src/katalog/urunler.test.ts b/src/katalog/urunler.test.ts",
        "new file mode 100644",
        "index 0000000..4c1d2e8",
        "--- /dev/null",
        "+++ b/src/katalog/urunler.test.ts",
        "@@ -0,0 +1,9 @@",
        '+import { describe, expect, it } from "vitest";',
        '+import { urunleriListele } from "./urunler";',
        "+",
        ceviri('+describe("ürün listesi", () => {', '+describe("product list", () => {'),
        ceviri('+  it("sınırı 100 ile kırpar", async () => {', '+  it("caps the limit at 100", async () => {'),
        "+    const r = await urunleriListele({ sinir: 500 });",
        "+    expect(r.urunler.length).toBeLessThanOrEqual(100);",
        "+  });",
        "+});",
        "",
      ].join("\n"),
    },
  };
  rota("GET", "/api/onaylar/:oid/fark", ({ p }) => {
    const o = db.onaylar.find((x) => x.id === p.oid);
    if (!o || o.tur !== "birlestirme") throw new Hata(404, ceviri("Birleştirme bulunamadı.", "Merge not found."));
    return FARKLAR[o.veri?.gorevId] ?? FARKLAR.varsayilan;
  });
}
