// Ofis motorunun saf parçaları: yol bulma, yerleşim, karakter seçimi, balon metni
import { afterEach, describe, expect, it } from "vitest";
import { useDilDurumu } from "../dil";
import { aracYeri, durumYeri, EN_AZ_KALIS, TAZE_SURE, yerDurumu, yerKarari, yerOlayi, yerVarisi } from "./etkinlikYeri";
import { adayKarakteri, karakterleriAta, ozet } from "./karakterSecimi";
import { gerekenMasa, masaAtamasiOku, masaAtamasiYaz, masalariAta } from "./masaAtama";
import { adlariBul, balonMetni, markdownTemizle, toplantiDuyurusu, toplantiSorusuMu } from "./metin";
import { masaSayisi, yerlesimKur, yurunebilirMi, type Karo } from "./yerlesim";
import { gorusHatti, sadelestir, yakinBos, yolBul, yumusat, type Izgara } from "./yol";

function izgara(satirlar: string[]): Izgara {
  const satir = satirlar.length;
  const sutun = satirlar[0]!.length;
  const yurunebilir = new Uint8Array(sutun * satir);
  satirlar.forEach((s, r) => [...s].forEach((ch, c) => (yurunebilir[r * sutun + c] = ch === "#" ? 0 : 1)));
  return { sutun, satir, yurunebilir };
}

describe("yol bulma", () => {
  const iz = izgara([
    ".......", //
    ".#####.",
    ".......",
  ]);

  it("engelin çevresinden dolaşır", () => {
    const yol = yolBul(iz, { c: 0, r: 0 }, { c: 6, r: 2 })!;
    expect(yol[0]).toEqual({ c: 0, r: 0 });
    expect(yol[yol.length - 1]).toEqual({ c: 6, r: 2 });
    for (const k of yol) expect(yurunebilirMi(iz, k)).toBe(true);
  });

  it("köşe kesmez: çapraz adımın iki komşusu da açık olmalı", () => {
    const yol = yolBul(iz, { c: 0, r: 2 }, { c: 6, r: 0 })!;
    for (let i = 1; i < yol.length; i++) {
      const a = yol[i - 1]!;
      const b = yol[i]!;
      if (a.c !== b.c && a.r !== b.r) {
        expect(yurunebilirMi(iz, { c: b.c, r: a.r })).toBe(true);
        expect(yurunebilirMi(iz, { c: a.c, r: b.r })).toBe(true);
      }
    }
  });

  it("kapalı hedefe yol yoktur", () => {
    const kapali = izgara(["..#..", "..#..", "..#.."]);
    expect(yolBul(kapali, { c: 0, r: 0 }, { c: 4, r: 2 })).toBeNull();
    expect(yolBul(kapali, { c: 0, r: 0 }, { c: 2, r: 1 })).toBeNull();
  });

  it("sadeleştirme görüş hattı olan ara noktaları atar", () => {
    const acik = izgara(["......", "......", "......"]);
    const yol = yolBul(acik, { c: 0, r: 0 }, { c: 5, r: 0 })!;
    expect(sadelestir(acik, yol)).toEqual([
      { c: 0, r: 0 },
      { c: 5, r: 0 },
    ]);
    expect(gorusHatti(iz, { c: 0, r: 0 }, { c: 6, r: 2 })).toBe(false);
  });

  it("yumuşatılmış yol uçları korur ve sık örneklenir", () => {
    const noktalar = yumusat([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(noktalar[0]).toEqual({ x: 0, y: 0 });
    expect(noktalar[noktalar.length - 1]).toEqual({ x: 100, y: 100 });
    for (let i = 1; i < noktalar.length; i++) {
      const d = Math.hypot(noktalar[i]!.x - noktalar[i - 1]!.x, noktalar[i]!.y - noktalar[i - 1]!.y);
      expect(d).toBeLessThan(8);
    }
  });

  it("aynı hedefe gelen ikinci kişi yan karoya geçer", () => {
    const acik = izgara(["......", "......", "......"]);
    const dolu = new Set(["2,1"]);
    const k = yakinBos(acik, { c: 2, r: 1 }, (c, r) => dolu.has(`${c},${r}`))!;
    expect(k.r).toBe(1);
    expect(Math.abs(k.c - 2)).toBe(1);
  });
});

describe("yerleşim", () => {
  const ulasilir = (y: ReturnType<typeof yerlesimKur>, k: Karo) => yolBul(y, y.noktalar.kapiIci, k) !== null;

  it("en az 12 masa; adalar üçer masa olarak büyür", () => {
    expect(masaSayisi(0)).toBe(12);
    expect(masaSayisi(13)).toBe(15);
    expect(yerlesimKur(12).masalar.filter((m) => m.oda === "muhendislik")).toHaveLength(12);
    const buyuk = yerlesimKur(masaSayisi(28));
    expect(buyuk.masalar.filter((m) => m.oda === "muhendislik").length).toBeGreaterThanOrEqual(28);
    expect(buyuk.satir).toBeGreaterThan(yerlesimKur(12).satir);
  });

  it("her masaya, kurul masasına, dinlenme ve odalara kapıdan yürünebilir", () => {
    for (const y of [yerlesimKur(12), yerlesimKur(30)]) {
      expect(ulasilir(y, y.noktalar.kapi)).toBe(true);
      for (const m of y.masalar) expect(ulasilir(y, m.yaklasma), `masa ${m.kimlik}`).toBe(true);
      for (const k of y.noktalar.toplantiKoltuklari) expect(ulasilir(y, k.yaklasma)).toBe(true);
      const n = y.noktalar;
      for (const k of [...n.kurulBekleme, ...n.sunucuOnu, ...n.arsivOnu, ...n.kanepeOnu, ...n.toplantiAyakta, ...n.adaylar, ...n.panoOnu, ...n.beyazTahtaOnu, ...n.okumaKosesi, n.kahve, n.su]) {
        expect(ulasilir(y, k), `${k.c},${k.r}`).toBe(true);
      }
      expect(n.dinlenme.length).toBeGreaterThan(10);
    }
  });

  it("kurul masası ve pano engeldir", () => {
    const y = yerlesimKur(12);
    const km = y.esyalar.find((e) => e.kimlik === y.noktalar.kurulMasasiKimligi)!;
    expect(km.engel).toBeDefined();
    expect(yurunebilirMi(y, { c: km.engel!.c, r: km.engel!.r })).toBe(false);
    expect(yurunebilirMi(y, { c: y.noktalar.pano.engel.c + 2, r: y.noktalar.pano.engel.r })).toBe(false);
  });
});

describe("karakter seçimi", () => {
  const katalog = [
    { id: "k01", roller: ["ceo"] },
    { id: "k02", roller: ["cto"] },
    { id: "k03", roller: ["backend"] },
    { id: "k04", roller: ["frontend"] },
  ];
  const ajan = (id: string, rol: string, dk: number, karakter: string | null = null) => ({
    id,
    rol,
    karakter,
    olusturma: new Date(Date.UTC(2026, 9, 1, 9, dk)).toISOString(),
  });

  it("kayıtlı karakter önce, sonra role uyan boş, sonra ilk boş", () => {
    const a = karakterleriAta([ajan("ada", "ceo", 0), ajan("kerem", "cto", 1, "k03"), ajan("deniz", "backend", 2), ajan("ece", "tasarim", 3)], katalog);
    expect(a.get("ada")).toBe("k01");
    expect(a.get("kerem")).toBe("k03");
    // backend karakteri Kerem'de: ilk boş (k02)
    expect(a.get("deniz")).toBe("k02");
    expect(a.get("ece")).toBe("k04");
  });

  it("hepsi doluysa kimlik özetine göre, kararlı", () => {
    const ajanlar = ["a", "b", "c", "d", "e"].map((id, i) => ajan(id, "backend", i));
    const bir = karakterleriAta(ajanlar, katalog);
    const iki = karakterleriAta([...ajanlar].reverse(), katalog);
    expect(bir.get("e")).toBe(katalog[ozet("e") % katalog.length]!.id);
    expect([...bir]).toEqual(expect.arrayContaining([...iki]));
  });

  it("önceki atama korunur; ekip değişse de aynı ajan aynı karakterde kalır", () => {
    const ilk = karakterleriAta([ajan("ada", "ceo", 0), ajan("deniz", "backend", 2), ajan("mert", "backend", 3)], katalog);
    const onceki = Object.fromEntries(ilk);
    // Deniz ayrıldı: Mert kendi karakterinde kalır
    const sonra = karakterleriAta([ajan("ada", "ceo", 0), ajan("mert", "backend", 3)], katalog, onceki);
    expect(sonra.get("mert")).toBe(ilk.get("mert"));
  });

  it("bilinmeyen kayıtlı karakter yok sayılır; aday için role uyan boş önerilir", () => {
    const a = karakterleriAta([ajan("ada", "ceo", 0, "u-yok-boyle")], katalog);
    expect(a.get("ada")).toBe("k01");
    expect(adayKarakteri("frontend", katalog, ["k01"], "o1")).toBe("k04");
    expect(adayKarakteri("tasarim", katalog, ["k01", "k02"], "o1")).toBe("k03");
  });
});

describe("balon metni", () => {
  afterEach(() => useDilDurumu.setState({ dil: "tr" }));

  it("Markdown işaretlerini temizler; kod bloğu yerine dilin kısa işareti", () => {
    useDilDurumu.setState({ dil: "tr" });
    expect(markdownTemizle("## Başlık\n\n- **kalın** ve `kod` [bağlantı](http://x)\n\n```ts\nconst a = 1;\n```")).toBe("Başlık · kalın ve kod bağlantı [kod]");
    useDilDurumu.setState({ dil: "en" });
    expect(markdownTemizle("Fix:\n```ts\nconst a = 1;\n```")).toBe("Fix: [code]");
  });

  it("sözcük ortasından kesmeden kısaltır", () => {
    const uzun = "Sipariş listesinde imleç alanı son sayfada boş gelmeli; aksi halde istemci sonsuz döngüye girer ve kullanıcı aynı sayfayı tekrar tekrar görür.";
    const k = balonMetni(uzun, 60);
    expect(k.length).toBeLessThanOrEqual(60);
    expect(k.endsWith("…")).toBe(true);
    expect(uzun.startsWith(k.slice(0, -1))).toBe(true);
  });

  it("metinde geçen adları ekleriyle birlikte bulur", () => {
    const ajanlar = [{ ad: "Ece" }, { ad: "Kerem" }, { ad: "Ada" }];
    expect(adlariBul("T-26 ilerlemiyor; Ece'ye hatırlatıldı.", ajanlar).map((a) => a.ad)).toEqual(["Ece"]);
    expect(adlariBul("Adalet ve Keremet", ajanlar)).toEqual([]);
  });
});

describe("masa ataması (kararlılık)", () => {
  const masalar = yerlesimKur(12).masalar;
  const zaman = (dk: number) => new Date(Date.UTC(2026, 9, 1, 9, dk)).toISOString();
  const ajan = (id: string, rol: string, dk: number) => ({ id, rol, olusturma: zaman(dk) });
  const ekip = [ajan("ada", "ceo", 0), ajan("kerem", "cto", 1), ajan("ece", "frontend", 2), ajan("deniz", "backend", 3), ajan("mert", "test", 4)];

  it("aynı ekip her açılışta aynı masaları alır; girdi sırası fark etmez", () => {
    const bir = masalariAta(ekip, masalar);
    const iki = masalariAta([...ekip].reverse(), masalar);
    const uc = masalariAta([ekip[3]!, ekip[0]!, ekip[4]!, ekip[2]!, ekip[1]!], masalar);
    expect(Object.fromEntries(iki)).toEqual(Object.fromEntries(bir));
    expect(Object.fromEntries(uc)).toEqual(Object.fromEntries(bir));
    expect(bir.get("ada")).toBe("ceo");
    expect(bir.get("kerem")).toBe("cto");
    // İşe alınma sırasıyla açık ofis masaları
    expect([bir.get("ece"), bir.get("deniz"), bir.get("mert")]).toEqual(["m0", "m1", "m2"]);
  });

  it("yeni ajan gelince diğerleri yerinde kalır; yeni gelen ilk boş masayı alır", () => {
    const ilk = masalariAta(ekip, masalar);
    // Oluşturma zamanı eskilerden önce olsa bile kimseyi yerinden etmez
    const sonra = masalariAta([ajan("selin", "tasarim", -10), ...ekip], masalar, Object.fromEntries(ilk));
    for (const a of ekip) expect(sonra.get(a.id), a.id).toBe(ilk.get(a.id));
    expect(sonra.get("selin")).toBe("m3");
  });

  it("biri ayrılınca kimse kaymaz; boşalan masayı sonraki yeni gelen alır", () => {
    const ilk = masalariAta(ekip, masalar);
    const kalan = ekip.filter((a) => a.id !== "deniz");
    const sonra = masalariAta(kalan, masalar, Object.fromEntries(ilk));
    expect(sonra.get("ece")).toBe("m0");
    expect(sonra.get("mert")).toBe("m2");
    const yeni = masalariAta([...kalan, ajan("onur", "inceleme", 9)], masalar, Object.fromEntries(sonra));
    expect(yeni.get("onur")).toBe("m1");
    expect(yeni.get("mert")).toBe("m2");
  });

  it("önceki atamadaki masa doluysa ya da yerleşimde yoksa yeni boş masa verilir", () => {
    const sonuc = masalariAta(ekip, masalar, { ece: "m1", deniz: "m1", mert: "m99" });
    // Ece daha önce işe alındı: m1 onun; Deniz ve Mert ilk boş masaları alır
    expect(sonuc.get("ece")).toBe("m1");
    expect(sonuc.get("deniz")).toBe("m0");
    expect(sonuc.get("mert")).toBe("m2");
  });

  it("saklanan masa sığsın diye yerleşim büyür; atama tarayıcıda saklanıp geri okunur", () => {
    expect(gerekenMasa([{ id: "x" }, { id: "y" }], { x: "m14", y: "ceo" })).toBe(15);
    expect(gerekenMasa([{ id: "z" }], { x: "m14" })).toBe(0);
    const depo = new Map<string, string>();
    const onceki = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => depo.get(k) ?? null,
      setItem: (k: string, v: string) => void depo.set(k, v),
    };
    try {
      const ilk = masalariAta(ekip, masalar);
      masaAtamasiYaz("p1", ilk);
      expect(masaAtamasiOku("p1")).toEqual(Object.fromEntries(ilk));
      expect(masaAtamasiOku("p2")).toEqual({});
      // Sayfa yeniden yüklendi: saklanan atamayla aynı sonuç
      expect(Object.fromEntries(masalariAta([...ekip].reverse(), masalar, masaAtamasiOku("p1")))).toEqual(Object.fromEntries(ilk));
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = onceki;
    }
  });
});

describe("işe göre yer: araç → yer tablosu", () => {
  const yer = (arac: string | undefined, girdi?: unknown) => aracYeri(arac, girdi)?.yer ?? null;

  it("kod yazma, test ve derleme kendi masasında", () => {
    for (const a of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) expect(yer(a), a).toBe("masa");
    for (const komut of ["npm test", "npx vitest run", "npm run build", "tsc --noEmit", "git status", "git diff main"]) expect(yer("Bash", { command: komut }), komut).toBe("masa");
    expect(aracYeri("Bash", { command: "npm test" })).toMatchObject({ kisa: false, esik: 1 });
  });

  it("kod okuma ve arama masada, kısa iş: tek başına yerinden kaldırmaz", () => {
    for (const a of ["Read", "Grep", "Glob", "mcp__arnorg__kod_ara", "mcp__arnorg__kod_haritasi", "mcp__arnorg__sembol_bul", "mcp__arnorg__bagimliliklar"]) {
      expect(aracYeri(a), a).toMatchObject({ yer: "masa", kisa: true });
    }
  });

  it("sürüm ve dağıtım komutları sunucu dolabına", () => {
    for (const komut of ["git push origin arnorg/deniz/T-24", "git merge --no-ff feature", "docker compose up -d", "kubectl apply -f k8s/", "npm publish --access public", "gh pr merge 12"]) {
      expect(yer("Bash", { command: komut }), komut).toBe("sunucu");
    }
  });

  it("görev panosu, toplantı, arşiv, kurul, beyaz tahta ve okuma köşesi", () => {
    for (const a of ["gorev_ac", "gorev_guncelle", "gorevleri_listele", "gorev_detay"]) expect(yer(`mcp__arnorg__${a}`, { gorev: "T-3" }), a).toBe("pano");
    expect(yer("mcp__arnorg__toplanti_yap", { gundem: "Kargo entegrasyonu" })).toBe("toplanti");
    for (const a of ["not_yaz", "hafiza_kaydet"]) expect(aracYeri(`mcp__arnorg__${a}`), a).toMatchObject({ yer: "arsiv", esik: 1 });
    for (const a of ["not_oku", "notlari_listele", "hafiza_ara", "hafiza_listele"]) expect(aracYeri(`mcp__arnorg__${a}`), a).toMatchObject({ yer: "arsiv", esik: 2 });
    for (const a of ["kurula_sor", "birlestirme_iste", "ise_al_teklif"]) expect(yer(`mcp__arnorg__${a}`), a).toBe("kurul");
    expect(yer("mcp__arnorg__rapor_hazirla")).toBe("tahta");
    expect(aracYeri("WebSearch")).toMatchObject({ yer: "okuma", esik: 1 });
    expect(aracYeri("WebFetch")).toMatchObject({ yer: "okuma", esik: 2 });
  });

  it("iş arkadaşına soru, devir, inceleme ve anma o kişinin yanına", () => {
    expect(aracYeri("mcp__arnorg__ajana_sor", { ajan: "@Kerem", soru: "Jeton süresi?" })).toMatchObject({ yer: "kisi", kisiAdi: "Kerem", kisa: false });
    expect(aracYeri("mcp__arnorg__gorev_guncelle", { gorev: "T-3", atanan: "Ece" })).toMatchObject({ yer: "kisi", kisiAdi: "Ece" });
    expect(aracYeri("mcp__arnorg__calisma_farki", { ajan: "Deniz" })).toMatchObject({ yer: "kisi", kisiAdi: "Deniz" });
    // Anmalı mesajda kişiyi konuşma sahnesi yanına götürür: kısa iş
    expect(aracYeri("mcp__arnorg__mesaj_gonder", { metin: "@Ece 422 gövdesine bakar mısın?" })).toMatchObject({ yer: "kisi", kisiAdi: "Ece", kisa: true });
    expect(aracYeri("mcp__arnorg__mesaj_gonder", { metin: "Herkese duyuru", kanal: "genel" })).toMatchObject({ yer: "masa", kisa: true });
    // Uzmanı ArnOrg seçecekse hedef belli değil
    expect(aracYeri("mcp__arnorg__ajana_sor", { soru: "Bunu kim bilir?" })).toMatchObject({ yer: "masa", kisa: true });
  });

  it("tabloda olmayan araç yer değiştirmez; durumun kalıcı yeri", () => {
    expect(yer("BilinmeyenArac")).toBeNull();
    expect(yer(undefined)).toBeNull();
    expect(durumYeri("karar_bekliyor")).toBe("kurul");
    expect(durumYeri("bosta")).toBe("dinlenme");
    expect(durumYeri("duraklatildi")).toBe("dinlenme");
    for (const d of ["calisiyor", "hata", "kapali"] as const) expect(durumYeri(d), d).toBe("masa");
  });
});

describe("işe göre yer: durgunluk", () => {
  it("en az kalış dolmadan yer değişmez; başka yerin işi sürerse değişir", () => {
    const d = yerDurumu(0);
    yerVarisi(d, 0);
    yerOlayi(d, { yer: "pano" }, 5000);
    expect(yerKarari(d, 5000)).toBe(false);
    expect(d.yer).toBe("masa");
    yerOlayi(d, { yer: "pano" }, 20000);
    expect(yerKarari(d, EN_AZ_KALIS - 1)).toBe(false);
    expect(yerKarari(d, EN_AZ_KALIS)).toBe(true);
    expect(d.yer).toBe("pano");
  });

  it("henüz yerleşmemiş kişi ilk işinin yerine beklemeden gider", () => {
    const d = yerDurumu(0);
    yerOlayi(d, { yer: "okuma" }, 100);
    expect(yerKarari(d, 100)).toBe(true);
    expect(d.yer).toBe("okuma");
  });

  it("kısa okuma masadan kaldırmaz; panodayken tek bir okuma masaya geri götürmez", () => {
    const d = yerDurumu(0);
    yerOlayi(d, { yer: "masa", kisa: true, esik: 3 }, 1000);
    expect(yerKarari(d, 1000)).toBe(false);
    expect(d.yer).toBe("masa");
    yerOlayi(d, { yer: "pano" }, 2000);
    expect(yerKarari(d, 2000)).toBe(true);
    yerVarisi(d, 6000);
    yerOlayi(d, { yer: "pano" }, 20000);
    yerOlayi(d, { yer: "masa", kisa: true, esik: 3 }, 37000);
    expect(yerKarari(d, 37000)).toBe(false);
    expect(d.yer).toBe("pano");
  });

  it("bulunulan yerin işi bitince en az kalıştan sonra masaya dönülür", () => {
    const d = yerDurumu(0);
    yerOlayi(d, { yer: "arsiv" }, 0);
    yerKarari(d, 0);
    yerVarisi(d, 4000);
    expect(yerKarari(d, 4000 + EN_AZ_KALIS - 1)).toBe(false);
    expect(d.yer).toBe("arsiv");
    expect(yerKarari(d, 4000 + EN_AZ_KALIS)).toBe(true);
    expect(d.yer).toBe("masa");
  });

  it("sürüp giden iş kişiyi yerinde tutar", () => {
    const d = yerDurumu(0);
    yerOlayi(d, { yer: "okuma" }, 0);
    yerKarari(d, 0);
    yerVarisi(d, 3000);
    for (let t = 10000; t <= 90000; t += 10000) {
      yerOlayi(d, { yer: "okuma" }, t);
      expect(yerKarari(d, t), String(t)).toBe(false);
    }
    expect(d.yer).toBe("okuma");
  });

  it("eşikli iş: tek web sayfası okuma köşesine götürmez, ikincisi götürür", () => {
    const d = yerDurumu(0);
    yerOlayi(d, { yer: "okuma", esik: 2 }, 1000);
    expect(yerKarari(d, 1000)).toBe(false);
    yerOlayi(d, { yer: "okuma", esik: 2 }, 3000);
    expect(yerKarari(d, 3000)).toBe(true);
    expect(d.yer).toBe("okuma");
  });

  it("bayatlayan öneri unutulur; bulunulan yerin işi öneriyi geçersiz kılar", () => {
    const d = yerDurumu(0);
    yerVarisi(d, 0);
    yerOlayi(d, { yer: "pano" }, 1000);
    expect(yerKarari(d, 1000 + TAZE_SURE + 1)).toBe(false);
    expect(d.aday).toBeNull();
    yerOlayi(d, { yer: "pano" }, 25000);
    yerOlayi(d, { yer: "masa" }, 26000);
    expect(d.aday).toBeNull();
    expect(yerKarari(d, EN_AZ_KALIS + 1)).toBe(false);
    expect(d.yer).toBe("masa");
  });

  it("farklı kişilerin yanı ayrı yerdir; başka yerin kısa işi yer değiştirmez", () => {
    const d = yerDurumu(0);
    yerOlayi(d, { yer: "kisi", kisi: "kerem" }, 0);
    expect(yerKarari(d, 0)).toBe(true);
    expect(d).toMatchObject({ yer: "kisi", kisi: "kerem" });
    yerVarisi(d, 2000);
    yerOlayi(d, { yer: "kisi", kisi: "ece", kisa: true }, 5000);
    expect(d.aday).toBeNull();
    yerOlayi(d, { yer: "kisi", kisi: "ece" }, 33000);
    expect(yerKarari(d, 33000)).toBe(true);
    expect(d).toMatchObject({ yer: "kisi", kisi: "ece" });
  });
});

describe("toplantı tanıma (dilden bağımsız)", () => {
  it("duyuru Türkçe ve İngilizce tanınır; gündem ilk satırdan", () => {
    expect(toplantiDuyurusu("Toplantı: Kargo entegrasyonunu nasıl bölelim?\nKatılımcılar: @Kerem @Deniz")).toBe("Kargo entegrasyonunu nasıl bölelim?");
    expect(toplantiDuyurusu("Meeting: How should we split the shipping integration?\nParticipants: @Kerem @Deniz")).toBe("How should we split the shipping integration?");
    expect(toplantiDuyurusu("Toplantı: Sprint 3: T-26 yetişir mi?\nKatılımcılar: @Şule")).toBe("Sprint 3: T-26 yetişir mi?");
  });

  it("görüş ve sıradan mesaj duyuru sayılmaz", () => {
    expect(toplantiDuyurusu("Önce tek firma; arayüzü soyut tutalım. Risk: firma API'si sık değişiyor.")).toBeNull();
    expect(toplantiDuyurusu("Öneri: önce tek firma.\nRisk: @Kerem dikkat etsin")).toBeNull();
    expect(toplantiDuyurusu("Meeting: tomorrow")).toBeNull();
  });

  it("toplantı sorusu çağıranın adıyla, iki dilde de", () => {
    expect(toplantiSorusuMu("Toplantı (Ada çağırdı): Kargo entegrasyonu\n\nGörüşünü kısa ver", "Ada")).toBe(true);
    expect(toplantiSorusuMu("Meeting (called by Ada): Shipping integration\n\nGive your view briefly", "Ada")).toBe(true);
    expect(toplantiSorusuMu("Soru (acil): jeton süresi kaç?", "Ece")).toBe(false);
    expect(toplantiSorusuMu("Jeton süresi kaç dakika?", "Ece")).toBe(false);
  });
});
