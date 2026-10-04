// Ofis motorunun saf parçaları: yol bulma, yerleşim (doğu kanadı dahil), karakter seçimi, balon metni, işe göre yer,
// kayıtlı görünümün uyarlanması, efektlerin yaşam döngüsü, canlı yayın, gün ışığı ve güç durumu
import { afterEach, describe, expect, it } from "vitest";
import { useDilDurumu } from "../dil";
import { EfektHavuzu, efektButcesi, egriNoktasi, konfeti, yayKontrolu } from "./efektler";
import {
  aracYeri,
  aramaMetni,
  durumYeri,
  EN_AZ_KALIS,
  komutMetni,
  komutTuru,
  TAZE_SURE,
  testSonucu,
  yerDurumu,
  yerKarari,
  yerOlayi,
  yerVarisi,
} from "./etkinlikYeri";
import { ESKI_GENISLIK, kameraDurumunuUyarla } from "./kamera";
import { adayKarakteri, karakterleriAta, ozet } from "./karakterSecimi";
import { gerekenMasa, masaAtamasiOku, masaAtamasiYaz, masalariAta } from "./masaAtama";
import { adlariBul, balonMetni, markdownTemizle, toplantiDuyurusu, toplantiSorusuMu } from "./metin";
import { gunIsigi, KareOlcer } from "./ortam";
import { KARAR_EKRANDA, sunumSec, teslimVerisi } from "./teslim";
import { KISI_CEKIMI, OLAY_CEKIMI, sonrakiCekim, yeniCekim, type YayinAdayi } from "./yayin";
import { ANA_SUTUN, KARO, karoAyak, masaSayisi, noktaKarosu, yerlesimKur, yurunebilirMi, type Karo } from "./yerlesim";
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

  it("kod yazma ve kısa komutlar kendi masasında", () => {
    for (const a of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) expect(yer(a, { file_path: "src/siparis/liste.tsx" }), a).toBe("masa");
    for (const komut of ["git status", "git diff main", "ls -la", "cat vitest.config.ts", "node betik.mjs", "npm install"]) expect(yer("Bash", { command: komut }), komut).toBe("masa");
    expect(aracYeri("Bash", { command: "git status" })).toMatchObject({ kisa: false, esik: 1 });
    // Arka plandaki komutun çıktısına bakmak kısa iş: laboratuvarda testi bekleyeni yerinden kaldırmaz
    for (const a of ["BashOutput", "KillShell", "KillBash"]) expect(aracYeri(a), a).toMatchObject({ yer: "masa", kisa: true, esik: 3 });
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
    yerOlayi(d, { yer: "arastirma" }, 100);
    expect(yerKarari(d, 100)).toBe(true);
    expect(d.yer).toBe("arastirma");
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
    yerOlayi(d, { yer: "arastirma" }, 0);
    yerKarari(d, 0);
    yerVarisi(d, 3000);
    for (let t = 10000; t <= 90000; t += 10000) {
      yerOlayi(d, { yer: "arastirma" }, t);
      expect(yerKarari(d, t), String(t)).toBe(false);
    }
    expect(d.yer).toBe("arastirma");
  });

  it("eşikli iş: tek web sayfası kütüphaneye götürmez, ikincisi götürür", () => {
    const d = yerDurumu(0);
    yerOlayi(d, { yer: "arastirma", esik: 2 }, 1000);
    expect(yerKarari(d, 1000)).toBe(false);
    yerOlayi(d, { yer: "arastirma", esik: 2 }, 3000);
    expect(yerKarari(d, 3000)).toBe(true);
    expect(d.yer).toBe("arastirma");
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

// ---------------------------------------------------------------------------
// Doğu kanadı: kütüphane, test laboratuvarı, stüdyo
// ---------------------------------------------------------------------------

/** Kanattan önceki ana binanın yürünebilir ızgarası (sütun 0-46, 12 masa): kanat eklenince birebir aynı kalmalı */
const ANA_BINA = [
  "###############################################",
  "###############################################",
  "###......#......###.........######.#.#########.",
  "###.....###.....####........######...#########.",
  "#..###...#..###...#...######...#.......#######.",
  "#..###.#.#..###...#...######...#.##.##.#.......",
  "#........##.......#............#.##.##.#.......",
  "##.......#.......##...........##.......##.....#",
  "####..#######..#########..#########..######..##",
  "#..............................................",
  "#..............................................",
  "#.............................#...............#",
  "#.......#############.....#....##..#####...##..",
  "#.#.........................#....#.#####.#.....",
  "#..............................................",
  "#...#########...#########...........###.......#",
  "#...#########...#########......................",
  "#..............................................",
  "#...........................#.................#",
  "#.................................####.........",
  "#...#########...#########......#..####.........",
  "#...#########...#########......................",
  "#..............................................",
  "#...........................#..................",
  "#..............................................",
  "###.......................#..##........#......#",
  "##########################################..###",
];

describe("doğu kanadı: yerleşim", () => {
  const ulasilir = (y: ReturnType<typeof yerlesimKur>, k: Karo) => yolBul(y, y.noktalar.kapiIci, k) !== null;
  const odasi = (y: ReturnType<typeof yerlesimKur>, k: Karo) =>
    y.odalar.find((o) => k.c >= o.alan.c && k.c < o.alan.c + o.alan.g && k.r >= o.alan.r && k.r < o.alan.r + o.alan.y)?.kimlik;

  it("ana bina yerinde kalır: ızgara, masalar ve masa kimlikleri değişmez; kanat doğuya eklenir", () => {
    const y = yerlesimKur(12);
    expect(y.sutun).toBeGreaterThan(ANA_SUTUN);
    const satirlar = ANA_BINA.map((_, r) => Array.from({ length: 47 }, (_, c) => (yurunebilirMi(y, { c, r }) ? "." : "#")).join(""));
    expect(satirlar).toEqual(ANA_BINA);
    // Masa ataması kimlikleri ve yerleri: m0 ilk adanın ilk masası, CEO ve CTO odalarında
    const m0 = y.masalar.find((m) => m.kimlik === "m0")!;
    expect(m0.yaklasma).toEqual({ c: 6, r: 14 });
    expect(y.masalar.find((m) => m.kimlik === "ceo")!.yaklasma).toEqual({ c: 5, r: 3 });
    expect(y.masalar.map((m) => m.kimlik)).toEqual(["ceo", "cto", ...Array.from({ length: 12 }, (_, i) => `m${i}`)]);
    // Kanat istasyonları masa atamasına girmez
    expect(y.masalar.every((m) => m.oda !== ("laboratuvar" as string))).toBe(true);
    for (const i of y.istasyonlar) expect(i.oturma.x, i.kimlik).toBeGreaterThan(ANA_SUTUN * KARO);
  });

  it("üç yeni oda var, ana binayla örtüşmez ve sözlükte adları var", () => {
    const y = yerlesimKur(12);
    for (const kimlik of ["arastirma", "laboratuvar", "studyo"] as const) {
      const o = y.odalar.find((x) => x.kimlik === kimlik)!;
      expect(o, kimlik).toBeDefined();
      expect(o.alan.c).toBeGreaterThanOrEqual(ANA_SUTUN);
      expect(o.alan.c + o.alan.g).toBeLessThanOrEqual(y.sutun - 1);
      // Kütüphane levha bandında, diğerlerinin kapı levhası var
      expect(o.levha || !!o.kapiLevhasi, kimlik).toBe(true);
    }
    // Odalar birbirine girmez
    const alanlar = y.odalar.map((o) => o.alan);
    for (let i = 0; i < alanlar.length; i++) {
      for (let j = i + 1; j < alanlar.length; j++) {
        const a = alanlar[i]!;
        const b = alanlar[j]!;
        const ortusur = a.c < b.c + b.g && b.c < a.c + a.g && a.r < b.r + b.y && b.r < a.r + a.y;
        expect(ortusur, `${y.odalar[i]!.kimlik} × ${y.odalar[j]!.kimlik}`).toBe(false);
      }
    }
  });

  it("kanadın her yerine kapıdan yürünebilir; noktalar kendi odasında (12 ve 30 masa)", () => {
    for (const y of [yerlesimKur(12), yerlesimKur(30)]) {
      const n = y.noktalar;
      for (const k of n.arastirmaKoltuklari) {
        expect(ulasilir(y, k.yaklasma), `kütüphane koltuğu ${k.yaklasma.c},${k.yaklasma.r}`).toBe(true);
        expect(odasi(y, noktaKarosu(k.oturma))).toBe("arastirma");
      }
      for (const k of n.arastirmaOnu) {
        expect(ulasilir(y, k), `kütüphane ${k.c},${k.r}`).toBe(true);
        expect(odasi(y, k)).toBe("arastirma");
      }
      for (const k of n.labOnu) {
        expect(ulasilir(y, k), `laboratuvar ${k.c},${k.r}`).toBe(true);
        expect(odasi(y, k)).toBe("laboratuvar");
      }
      for (const i of y.istasyonlar) {
        expect(ulasilir(y, i.yaklasma), i.kimlik).toBe(true);
        expect(odasi(y, i.yaklasma)).toBe(i.oda);
      }
      expect(y.istasyonlar.filter((i) => i.oda === "laboratuvar")).toHaveLength(3);
      expect(y.istasyonlar.filter((i) => i.oda === "studyo")).toHaveLength(1);
      expect(ulasilir(y, n.sunumNoktasi)).toBe(true);
      expect(odasi(y, n.sunumNoktasi)).toBe("studyo");
      for (const k of n.studyoOnu) expect(ulasilir(y, k), `stüdyo ${k.c},${k.r}`).toBe(true);
      // Kanat duvarındaki geçitler: koridor, dinlenme → laboratuvar, kurul → stüdyo
      expect(n.kanatKapilari).toHaveLength(3);
      for (const k of n.kanatKapilari) {
        expect(yurunebilirMi(y, k), `geçit ${k.r}`).toBe(true);
        expect(yurunebilirMi(y, { c: k.c, r: k.r + 1 }), `geçit ${k.r + 1}`).toBe(true);
        expect(yurunebilirMi(y, { c: k.c - 1, r: k.r }), `geçidin batısı ${k.r}`).toBe(true);
        expect(yurunebilirMi(y, { c: k.c + 1, r: k.r }), `geçidin doğusu ${k.r}`).toBe(true);
      }
      // Kanat duvarı geçitler dışında kapalı
      const acik = Array.from({ length: y.satir }, (_, r) => r).filter((r) => yurunebilirMi(y, { c: ANA_SUTUN - 1, r }));
      expect(acik).toEqual(n.kanatKapilari.flatMap((k) => [k.r, k.r + 1]));
      // Ekranların ve küre ayaklarının karoları engel
      for (const p of [n.arastirmaEkrani, n.testPanosu, n.sunumEkrani]) expect(yurunebilirMi(y, { c: p.engel.c + 1, r: p.engel.r })).toBe(false);
      expect(yurunebilirMi(y, noktaKarosu(n.kure))).toBe(false);
    }
  });

  it("kanattan ana binaya ve geri: laboratuvardan kurula, stüdyodan kütüphaneye yol var", () => {
    const y = yerlesimKur(12);
    const n = y.noktalar;
    expect(yolBul(y, n.labOnu[0]!, n.kurulBekleme[0]!)).not.toBeNull();
    expect(yolBul(y, n.sunumNoktasi, n.arastirmaOnu[0]!)).not.toBeNull();
    expect(yolBul(y, y.masalar.find((m) => m.kimlik === "m0")!.yaklasma, n.labOnu[0]!)).not.toBeNull();
    // Giriş kapısının kanatları iki kasanın arasında
    expect(n.girisKapisi.genislik).toBe(2 * KARO);
    expect(noktaKarosu({ x: n.girisKapisi.x, y: n.girisKapisi.y - 1 }).c).toBe(n.kapi.c + 1);
    // Sunan, sahnedeki spotun üstünde ve ekranın solunda durur
    expect(karoAyak(n.sunumNoktasi).x).toBeLessThan(n.sunumEkrani.x - n.sunumEkrani.genislik / 2 + 4);
  });
});

describe("doğu kanadı: araç → oda", () => {
  const yer = (arac: string | undefined, girdi?: unknown) => aracYeri(arac, girdi)?.yer ?? null;

  it("web araştırması kütüphaneye: arama ve kayıt hemen, sayfa okumak ve paket bilgisi ikinci çağrıda", () => {
    for (const a of ["WebSearch", "mcp__arnorg__web_ara", "mcp__arnorg__github_ara", "mcp__arnorg__arastirma_kaydet"]) {
      expect(aracYeri(a, { query: "kargo api" }), a).toMatchObject({ yer: "arastirma", esik: 1, kisa: false });
    }
    for (const a of ["WebFetch", "mcp__arnorg__web_oku", "mcp__arnorg__paket_bilgisi"]) expect(aracYeri(a, { url: "https://x.dev" }), a).toMatchObject({ yer: "arastirma", esik: 2 });
    // Benzer adlı başka araç kütüphaneye götürmez
    expect(yer("mcp__baska__web_ara")).toBeNull();
  });

  it("test komutları laboratuvara; derleme, tür denetimi ve lint ikinci çağrıda", () => {
    const testler = [
      "npm test",
      "npm run test -- liste",
      "npm t",
      "pnpm test",
      "yarn test:unit",
      "bun test",
      "npx vitest run",
      "vitest --run src/ofis",
      "cd paketler/studyo && npx vitest run",
      "npx jest --ci",
      "pytest -x tests/",
      "python -m pytest",
      "go test ./...",
      "cargo test",
      "npx playwright test",
      "cypress run",
      "dotnet test",
      "./gradlew test",
      "mvn -q test",
    ];
    for (const komut of testler) expect(aracYeri("Bash", { command: komut }), komut).toMatchObject({ yer: "laboratuvar", esik: 1 });
    const derlemeler = ["npm run build", "npm run lint", "npm run typecheck", "tsc --noEmit", "npx tsc -p .", "pnpm build", "npx vite build", "cargo clippy", "go vet ./...", "npx eslint src"];
    for (const komut of derlemeler) expect(aracYeri("Bash", { command: komut }), komut).toMatchObject({ yer: "laboratuvar", esik: 2 });
    // PowerShell (Windows) aynı
    expect(yer("PowerShell", { command: "npx vitest run" })).toBe("laboratuvar");
    expect(yer("PowerShell", { command: "Get-ChildItem" })).toBe("masa");
    // Yol içinde geçen ad ve sıradan komutlar masada; sürüm komutu her zaman sunucuda
    for (const komut of ["cat vitest.config.ts", "code jest.config.js", "rg pytest docs/", "echo build"]) expect(yer("Bash", { command: komut }), komut).toBe("masa");
    expect(yer("Bash", { command: "npm test && git push origin main" })).toBe("sunucu");
    expect(komutTuru("Bash", { command: "npm run build" })).toBe("derleme");
    expect(komutTuru("Bash", { command: "npx vitest run" })).toBe("test");
    expect(komutTuru("Bash", { command: "git push" })).toBeNull();
    expect(komutTuru("Read", { command: "npm test" })).toBeNull();
  });

  it("teslim stüdyonun sahnesine; tasarım dosyaları tasarım masasına (Windows yolları dahil)", () => {
    expect(aracYeri("mcp__arnorg__teslim_et", { baslik: "Sipariş akışı" })).toMatchObject({ yer: "sunum", esik: 1 });
    const tasarim = ["src/stiller/tokenlar.css", "tasarim/akis.excalidraw", "public/logo.svg", "C:\\proje\\design\\ekran.fig", "D:\\is\\tasarım\\renkler.md", "src/theme.ts"];
    for (const yol of tasarim) expect(aracYeri("Write", { file_path: yol }), yol).toMatchObject({ yer: "tasarim", esik: 2 });
    for (const yol of ["src/siparis/liste.tsx", "C:\\proje\\src\\api.ts", "docs/README.md", "src/designer-notes.ts"]) expect(yer("Edit", { file_path: yol }), yol).toBe("masa");
  });

  it("durgunluk: tek bir kısa denetim masadan kaldırmaz; testler sürdükçe laboratuvarda kalır, bitince masaya döner", () => {
    const d = yerDurumu(0);
    yerVarisi(d, 0);
    const derleme = aracYeri("Bash", { command: "tsc --noEmit" })!;
    yerOlayi(d, derleme, EN_AZ_KALIS + 1000);
    expect(yerKarari(d, EN_AZ_KALIS + 1000)).toBe(false);
    expect(d.yer).toBe("masa");
    yerOlayi(d, derleme, EN_AZ_KALIS + 4000);
    expect(yerKarari(d, EN_AZ_KALIS + 4000)).toBe(true);
    expect(d.yer).toBe("laboratuvar");
    const t0 = EN_AZ_KALIS + 4000;
    yerVarisi(d, t0 + 5000);
    // Testler sürüyor: arada bir okuma ve çıktı yoklaması yerinden kaldırmaz
    for (let t = t0 + 10000; t <= t0 + 120000; t += 10000) {
      yerOlayi(d, aracYeri("Bash", { command: "npm test" })!, t);
      yerOlayi(d, aracYeri("Read")!, t + 1000);
      yerOlayi(d, aracYeri("BashOutput")!, t + 2000);
      expect(yerKarari(d, t + 2000), String(t)).toBe(false);
    }
    expect(d.yer).toBe("laboratuvar");
    // Test bitti, kod yazmaya döndü: en az kalış dolduğu için masaya
    const son = t0 + 125000;
    yerOlayi(d, aracYeri("Edit", { file_path: "src/a.ts" })!, son);
    expect(yerKarari(d, son)).toBe(true);
    expect(d.yer).toBe("masa");
  });

  it("panodaki komut ve kütüphane ekranındaki konu kısaltılır", () => {
    expect(komutMetni({ command: "cd paketler/studyo && npx vitest run src/ofis" })).toBe("npx vitest run src/ofis");
    expect(komutMetni({ command: "npm test\necho bitti" })).toBe("npm test");
    expect(komutMetni({ command: "npx playwright test --project=chromium --reporter=line tests/e2e" }).length).toBeLessThanOrEqual(34);
    expect(aramaMetni({ query: "kargo API rate limit" })).toBe("kargo API rate limit");
    expect(aramaMetni({ url: "https://www.auth0.com/docs/secure/tokens" })).toBe("auth0.com/docs/secure/tokens");
    expect(aramaMetni({ paket: "zustand" })).toBe("zustand");
    expect(aramaMetni({ sorgu: "  çok   boşluklu   sorgu " })).toBe("çok boşluklu sorgu");
    expect(aramaMetni({})).toBe("");
    expect(aramaMetni({ query: "a".repeat(80) }).length).toBeLessThanOrEqual(44);
  });

  it("test sonucu: geçti, kaldı ya da tanınmadı (hata bayrağı her zaman kaldı)", () => {
    expect(testSonucu(" ✓ tests/liste.test.tsx (4 tests) 88ms\n\n Test Files  1 passed (1)\n      Tests  4 passed (4)")).toBe("gecti");
    expect(testSonucu(" Test Files  1 failed | 7 passed (8)\n      Tests  2 failed | 51 passed (53)")).toBe("kaldi");
    expect(testSonucu("   × iki sekme aynı anda yenileyince tek jeton geçerli kalır")).toBe("kaldi");
    expect(testSonucu("Tests:       1 failed, 3 passed, 4 total")).toBe("kaldi");
    expect(testSonucu("PASS src/a.test.ts\n  ✓ does not fail on empty input (3 ms)")).toBe("gecti");
    expect(testSonucu("=== 5 passed in 0.12s ===")).toBe("gecti");
    expect(testSonucu("--- FAIL: TestSiparis (0.00s)\nFAIL\texample.com/siparis\t0.012s")).toBe("kaldi");
    expect(testSonucu("ok  \texample.com/siparis\t0.012s")).toBe("gecti");
    expect(testSonucu("test result: ok. 5 passed; 0 failed")).toBe("gecti");
    expect(testSonucu("src/a.ts(3,1): error TS2322: Type 'x' is not assignable")).toBe("kaldi");
    expect(testSonucu("✓ built in 13.23s")).toBe("gecti");
    expect(testSonucu("", false)).toBe("gecti");
    expect(testSonucu("çıktı", true)).toBe("kaldi");
    expect(testSonucu("bir şeyler yazdı")).toBeNull();
  });
});

describe("kayıtlı görünümün uyarlanması", () => {
  const dunya = yerlesimKur(12);
  const yeni = { genislik: dunya.genislik, yukseklik: dunya.yukseklik };
  // 1248×760 alan: genişlikle sınırlı sığdırma
  const sigdir = (g: number, y: number) => Math.min((1248 - 40) / g, (760 - 80) / y);

  it("kanat eklenince ana binanın koordinatları değişmez: yakın görünüm aynı yeri gösterir", () => {
    expect(ESKI_GENISLIK).toBe(ANA_SUTUN * KARO);
    const yakin = { olcek: 1.4, x: 420, y: 520, elle: true };
    expect(kameraDurumunuUyarla(yakin, yeni, sigdir)).toEqual({ ...yakin, ...yeni });
  });

  it("eski ofisin tamamını gösteren görünüm yeni ofisi sığdırır (yeni odalar görünsün)", () => {
    const eskiSigdir = sigdir(ESKI_GENISLIK, dunya.yukseklik);
    expect(kameraDurumunuUyarla({ olcek: eskiSigdir, x: 768, y: 432, elle: true }, yeni, sigdir)).toBeNull();
    expect(kameraDurumunuUyarla({ olcek: eskiSigdir * 1.1, x: 700, y: 400, elle: true }, yeni, sigdir)).toBeNull();
    // Saklanan boyut varsa ona göre karar verilir
    expect(kameraDurumunuUyarla({ olcek: 0.9, x: 700, y: 400, elle: true, genislik: ESKI_GENISLIK, yukseklik: dunya.yukseklik }, yeni, sigdir)).toBeNull();
    expect(kameraDurumunuUyarla({ olcek: 1.2, x: 700, y: 400, elle: true, genislik: ESKI_GENISLIK, yukseklik: dunya.yukseklik }, yeni, sigdir)).toMatchObject({ olcek: 1.2, ...yeni });
  });

  it("yerleşim aynıysa görünüm korunur; dünya dışındaki nokta içeri çekilir; bozuk ya da sığdırılmış görünüm sığdırılır", () => {
    const d = { olcek: 0.5, x: 99999, y: -40, elle: true, ...yeni };
    expect(kameraDurumunuUyarla(d, yeni, sigdir)).toEqual({ ...d, x: yeni.genislik, y: 0 });
    expect(kameraDurumunuUyarla({ olcek: 0.7, x: 10, y: 10, elle: false }, yeni, sigdir)).toBeNull();
    expect(kameraDurumunuUyarla({ olcek: Number.NaN, x: 10, y: 10, elle: true }, yeni, sigdir)).toBeNull();
    expect(kameraDurumunuUyarla(null, yeni, sigdir)).toBeNull();
  });

  it("saklanan masa ataması yeni yerleşimde de geçerli: kimse yer değiştirmez", () => {
    const zaman = (dk: number) => new Date(Date.UTC(2026, 9, 1, 9, dk)).toISOString();
    const ekip = [
      { id: "ada", rol: "ceo", olusturma: zaman(0) },
      { id: "kerem", rol: "cto", olusturma: zaman(1) },
      { id: "ece", rol: "frontend", olusturma: zaman(2) },
      { id: "deniz", rol: "backend", olusturma: zaman(3) },
    ];
    const saklanan = { ada: "ceo", kerem: "cto", ece: "m5", deniz: "m11" };
    const sonuc = masalariAta(ekip, dunya.masalar, saklanan);
    expect(Object.fromEntries(sonuc)).toEqual(saklanan);
  });
});

describe("efektlerin yaşam döngüsü", () => {
  it("süresi dolan efekt atılır; her biri bir kez", () => {
    const atilan: string[] = [];
    const h = new EfektHavuzu<string>((e) => atilan.push(e.veri), 100);
    h.ekle({ tur: "konfeti", simdi: 0, sure: 1000, agirlik: 20, veri: "a" });
    h.ekle({ tur: "halka", simdi: 100, sure: 300, veri: "b" });
    expect(h.sayi).toBe(2);
    expect(h.ilerlet(399)).toBe(0);
    expect(h.ilerlet(400)).toBe(1);
    expect(atilan).toEqual(["b"]);
    expect(h.ilerlet(1000)).toBe(1);
    expect(h.ilerlet(5000)).toBe(0);
    expect(atilan).toEqual(["b", "a"]);
    expect(h.sayi).toBe(0);
    expect(h.yuk).toBe(0);
  });

  it("ilerleme her karede verilir; bütçe aşılırsa efekt eklenmez ve hemen atılır; temizle hepsini atar", () => {
    const atilan: string[] = [];
    const ilerleme: number[] = [];
    const h = new EfektHavuzu<string>((e) => atilan.push(e.veri), 30);
    h.ekle({ tur: "iz", simdi: 0, sure: 1000, agirlik: 10, veri: "iz", adim: (u) => ilerleme.push(u) });
    h.ilerlet(250);
    h.ilerlet(500);
    expect(ilerleme).toEqual([0.25, 0.5]);
    expect(h.kalan()).toBe(20);
    expect(h.ekle({ tur: "konfeti", simdi: 500, sure: 1000, agirlik: 25, veri: "fazla" })).toBeNull();
    expect(atilan).toEqual(["fazla"]);
    // Ağırlıksız (olayın kendisi) her zaman
    expect(h.ekle({ tur: "flas", simdi: 500, sure: 1000, veri: "flas" })).not.toBeNull();
    h.temizle();
    expect(atilan.sort()).toEqual(["fazla", "flas", "iz"]);
    expect(h.sayi).toBe(0);
  });

  it("bütçe kalabalıkta ve düşük güçte küçülür, sıfıra inmez", () => {
    expect(efektButcesi(2)).toBeGreaterThan(efektButcesi(12));
    expect(efektButcesi(12, true)).toBeLessThan(efektButcesi(12));
    expect(efektButcesi(500)).toBeGreaterThan(0);
    expect(efektButcesi(500, true)).toBeGreaterThan(0);
  });

  it("kutlama kâğıtları mercan ve kemik, istenen sayıda; ışık izi yayı uçlardan geçer", () => {
    let tohum = 7;
    const rastgele = () => ((tohum = (tohum * 16807) % 2147483647) % 1000) / 1000;
    const p = konfeti(24, rastgele);
    expect(p).toHaveLength(24);
    expect(new Set(p.map((x) => x.renk))).toEqual(new Set([0, 1]));
    for (const x of p) expect(x.yukari).toBeGreaterThan(0);
    expect(konfeti(0)).toEqual([]);
    const a = { x: 0, y: 100 };
    const b = { x: 200, y: 100 };
    const k = yayKontrolu(a, b);
    expect(k.y).toBeLessThan(100);
    expect(egriNoktasi(a, k, b, 0)).toEqual(a);
    expect(egriNoktasi(a, k, b, 1)).toEqual(b);
    expect(egriNoktasi(a, k, b, 0.5).y).toBeLessThan(100);
  });
});

describe("canlı yayın yönetmeni", () => {
  const kisi = (id: string, puan: number): YayinAdayi => ({ id, puan });

  it("en ilginç kişiyle başlar, çekim süresince kalır, sonra yakında gösterilmeyene geçer", () => {
    let c = sonrakiCekim([kisi("ada", 30), kisi("kerem", 70)], yeniCekim(), 0, () => 0);
    expect(c.hedef).toBe("kerem");
    const ayni = sonrakiCekim([kisi("ada", 30), kisi("kerem", 70)], c, KISI_CEKIMI - 1, () => 0);
    expect(ayni).toBe(c);
    c = sonrakiCekim([kisi("ada", 30), kisi("kerem", 70)], c, KISI_CEKIMI + 1, () => 0);
    expect(c.hedef).toBe("ada");
  });

  it("taze olay hemen keser, kısa kalır; hedef ayrılınca beklemeden yenisi seçilir", () => {
    let c = sonrakiCekim([kisi("ada", 30)], yeniCekim(), 0, () => 0);
    c = sonrakiCekim([kisi("ada", 30), { id: "olay:kutlama", puan: 100, olay: 1000 }], c, 1500, () => 0);
    expect(c.hedef).toBe("olay:kutlama");
    expect(c.sure).toBe(OLAY_CEKIMI);
    // Olay bitti: kişilere döner
    c = sonrakiCekim([kisi("ada", 30), kisi("ece", 30)], c, 1500 + OLAY_CEKIMI + 1, () => 0);
    expect(["ada", "ece"]).toContain(c.hedef);
    const once = c.hedef;
    c = sonrakiCekim([kisi(once === "ada" ? "ece" : "ada", 30)], c, 1500 + OLAY_CEKIMI + 2, () => 0);
    expect(c.hedef).not.toBe(once);
    // Kimse yok: geniş çekim
    expect(sonrakiCekim([], c, 99999).hedef).toBeNull();
  });
});

describe("ortam: gün ışığı ve güç", () => {
  it("gündüz açık, gece karanlık; akşam ılık ve arada", () => {
    expect(gunIsigi(12)).toEqual({ gece: 0, ilik: 0 });
    expect(gunIsigi(23.5).gece).toBe(1);
    expect(gunIsigi(3).gece).toBe(1);
    const aksam = gunIsigi(18.5);
    expect(aksam.gece).toBeGreaterThan(0);
    expect(aksam.gece).toBeLessThan(1);
    expect(aksam.ilik).toBeGreaterThan(0);
    expect(gunIsigi(6.5).gece).toBeLessThan(1);
    expect(gunIsigi(-1).gece).toBe(gunIsigi(23).gece);
  });

  it("uzun süre yavaş kareler düşük güce geçirir; tek takılma geçirmez; gizli sekmeden dönüş sayılmaz", () => {
    const o = new KareOlcer();
    expect(o.ekle(120)).toBe(false);
    expect(o.ekle(5000)).toBe(false);
    for (let i = 0; i < 30; i++) o.ekle(16.7);
    expect(o.dusukGuc).toBe(false);
    let degisti = false;
    for (let i = 0; i < 200 && !degisti; i++) degisti = o.ekle(40);
    expect(degisti).toBe(true);
    expect(o.dusukGuc).toBe(true);
    // Kısa hızlanma geri döndürmez; uzun süre hızlı kalınca döner
    for (let i = 0; i < 300; i++) o.ekle(16);
    expect(o.dusukGuc).toBe(true);
    for (let i = 0; i < 4000 && o.dusukGuc; i++) o.ekle(16);
    expect(o.dusukGuc).toBe(false);
  });
});

describe("stüdyonun sunum ekranı", () => {
  const T0 = Date.parse("2026-10-04T12:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  const teslim = (o: { baslik: string; durum: string; olusturma: number; sonuclanma?: number; adimlar?: unknown }) => ({
    tur: "teslim",
    durum: o.durum,
    baslik: `Teslim: ${o.baslik}`,
    olusturma: iso(o.olusturma),
    sonuclanma: o.sonuclanma === undefined ? null : iso(o.sonuclanma),
    veri: { baslik: o.baslik, testAdimlari: o.adimlar ?? ["Paneli aç"] },
  });

  it("teslim verisi: onayın testAdimlari'si ya da çağrının test_adimlari'si; en çok dört adım; başlık öneksiz", () => {
    expect(teslimVerisi({ veri: { baslik: "Liste", testAdimlari: ["a1", "", 3, "a2"] } })).toEqual({ baslik: "Liste", adimlar: ["a1", "a2"] });
    expect(teslimVerisi({ veri: { baslik: "Liste", test_adimlari: ["1", "2", "3", "4", "5"] } }).adimlar).toEqual(["1", "2", "3", "4"]);
    // Veride başlık yoksa onay başlığı "Teslim: " / "Delivery: " öneki atılarak
    expect(teslimVerisi({ baslik: "Teslim: Sipariş akışı", veri: null }).baslik).toBe("Sipariş akışı");
    expect(teslimVerisi({ baslik: "Delivery: Order flow", veri: {} }).baslik).toBe("Order flow");
    expect(teslimVerisi({ veri: "bozuk" })).toEqual({ baslik: "", adimlar: [] });
  });

  it("en son hareket gören teslim: yeni karar eski bekleyenin önüne geçer; yeni bekleyen eski kararın", () => {
    const eskiBekleyen = teslim({ baslik: "Eski", durum: "bekliyor", olusturma: T0 - 14 * 60_000 });
    const yeniKabul = teslim({ baslik: "Liste", durum: "onaylandi", olusturma: T0 - 60_000, sonuclanma: T0 - 5_000 });
    expect(sunumSec([eskiBekleyen, yeniKabul], null, T0)).toMatchObject({ baslik: "Liste", durum: "onaylandi" });
    // Karar üç dakikadan eskiyse ekrandan iner, bekleyen geri gelir
    expect(sunumSec([eskiBekleyen, yeniKabul], null, T0 + KARAR_EKRANDA)).toMatchObject({ baslik: "Eski", durum: "bekliyor" });
    const yeniBekleyen = teslim({ baslik: "Kargo", durum: "bekliyor", olusturma: T0 });
    expect(sunumSec([eskiBekleyen, yeniKabul, yeniBekleyen], null, T0 + 1000)).toMatchObject({ baslik: "Kargo", durum: "bekliyor" });
    // Başka türden onaylar ve hiçbir şey yoksa boş
    expect(sunumSec([{ ...yeniBekleyen, tur: "birlestirme" }], null, T0)).toBeNull();
    expect(sunumSec([], null, T0)).toBeNull();
  });

  it("onayı henüz görünmeyen teslim_et çağrısı ekranda bekler; aynı başlıklı onay gelince onunki geçerli", () => {
    const cagri = { baslik: "Liste", adimlar: ["Paneli aç"], an: T0 };
    expect(sunumSec([], cagri, T0 + 2000)).toMatchObject({ baslik: "Liste", durum: "bekliyor" });
    expect(sunumSec([], cagri, T0 + KARAR_EKRANDA + 1)).toBeNull();
    // Onay gelince çağrı adaylıktan düşer: önce onayın bekleyişi, karar gelince kararı
    const onay = teslim({ baslik: "Liste", durum: "bekliyor", olusturma: T0 + 300, adimlar: ["Paneli aç", "Listeyi kaydır"] });
    expect(sunumSec([onay], cagri, T0 + 2000)).toMatchObject({ baslik: "Liste", durum: "bekliyor", adimlar: ["Paneli aç", "Listeyi kaydır"] });
    const kabul = { ...onay, durum: "onaylandi", sonuclanma: iso(T0 + 40_000) };
    expect(sunumSec([kabul], cagri, T0 + 41_000)).toMatchObject({ baslik: "Liste", durum: "onaylandi" });
  });
});
