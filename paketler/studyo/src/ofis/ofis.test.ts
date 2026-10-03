// Ofis motorunun saf parçaları: yol bulma, yerleşim, karakter seçimi, balon metni
import { describe, expect, it } from "vitest";
import { adayKarakteri, karakterleriAta, ozet } from "./karakterSecimi";
import { adlariBul, balonMetni, markdownTemizle } from "./metin";
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
      for (const k of [...n.kurulBekleme, ...n.sunucuOnu, ...n.arsivOnu, ...n.kanepeOnu, ...n.toplantiAyakta, ...n.adaylar, n.kahve, n.su]) {
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
  it("Markdown işaretlerini temizler", () => {
    expect(markdownTemizle("## Başlık\n\n- **kalın** ve `kod` [bağlantı](http://x)\n\n```ts\nconst a = 1;\n```")).toBe("Başlık · kalın ve kod bağlantı [kod]");
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
