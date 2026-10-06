// Proje bütçesi ve kullanım seviyesi (0.0.10): saf hesaplar, bütçe izleyicisi (sahte bağlamla) ve Şirket düzeyinde
// seviye, model sabitliği, görev tokenı, bekletme ve 0.0.10 göçü (oturumsuz kip)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HesapDurumu, KullanimPenceresi, KullanimSeviyesi, Proje, ProjeButcesi, SunucuOlayi } from "@arnorg/ortak";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bitisTahmini,
  butceDurumuBul,
  butceKalemi,
  etkinSeviyeBul,
  hizHesapla,
  pencereKosulu,
  ProjeButceleri,
  seviyeTavani,
  seviyeTempoSiniri,
  type ButceBaglami,
} from "./butce.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { ekipDosyalariniOku, ekipDosyasiYaz } from "./proje-dosyalari.js";
import { Sirket } from "./sirket.js";
import { bugun } from "./yardimci.js";
import { Yapilandirma } from "./yapilandirma.js";

const DK = 60_000;
const SAAT = 60 * DK;
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("saf hesaplar", () => {
  it("bütçe kalemi ve durumu: %80'de uyarı, dolunca doldu; ağır basan kalem neden olur", () => {
    expect(butceKalemi(null, 50)).toBeNull();
    expect(butceKalemi(0, 50)).toBeNull();
    expect(butceKalemi(1_000_000, 812_345)).toEqual({ sinir: 1_000_000, harcanan: 812_345, yuzde: 81.2 });
    const t = (h: number) => butceKalemi(1000, h);
    expect(butceDurumuBul(t(700), null)).toEqual({ durum: "normal", neden: null });
    expect(butceDurumuBul(t(800), null)).toEqual({ durum: "uyari", neden: "toplam" });
    expect(butceDurumuBul(t(1000), null)).toEqual({ durum: "doldu", neden: "toplam" });
    // Günlük doluysa toplamın uyarısından ağır basar; ikisi de uyarıdaysa yüzdesi büyük olan
    expect(butceDurumuBul(t(850), butceKalemi(100, 100))).toEqual({ durum: "doldu", neden: "gunluk" });
    expect(butceDurumuBul(t(850), butceKalemi(100, 90))).toEqual({ durum: "uyari", neden: "gunluk" });
    expect(butceDurumuBul(null, null)).toEqual({ durum: "normal", neden: null });
  });

  it("geçerli seviye: otomatik kademe bütçe ya da haftalık pencerede bir alta iner; Tasarruflu ve kapalı kademe inmez", () => {
    expect(etkinSeviyeBul("zeki", true, "normal", null)).toEqual({ etkin: "zeki", kademe: null });
    expect(etkinSeviyeBul("zeki", true, "uyari", null)).toEqual({ etkin: "normal", kademe: { neden: "butce", pencere: null } });
    expect(etkinSeviyeBul("normal", true, "doldu", "Haftalık")).toEqual({ etkin: "tasarruflu", kademe: { neden: "butce", pencere: null } });
    expect(etkinSeviyeBul("normal", true, "normal", "Haftalık · Opus")).toEqual({ etkin: "tasarruflu", kademe: { neden: "pencere", pencere: "Haftalık · Opus" } });
    expect(etkinSeviyeBul("tasarruflu", true, "uyari", "Haftalık")).toEqual({ etkin: "tasarruflu", kademe: null });
    expect(etkinSeviyeBul("zeki", false, "uyari", "Haftalık")).toEqual({ etkin: "zeki", kademe: null });
  });

  it("pencere koşulu: eşiği geçen en dolu haftalık pencere; 5 saatlik sayılmaz; hesap okunmadıysa bilinmiyor", () => {
    const p = (tur: KullanimPenceresi["tur"], yuzde: number | null, ad: string = tur): KullanimPenceresi => ({ tur, ad, yuzde, sifirlanma: null });
    expect(pencereKosulu(null)).toBeNull();
    expect(pencereKosulu({ durum: "bilinmiyor", pencereler: [p("haftalik", 95)] })).toBeNull();
    expect(pencereKosulu({ durum: "hazir", pencereler: [p("bes_saat", 99), p("haftalik", 40)] })).toEqual({ pencere: null, yuzde: null });
    expect(pencereKosulu({ durum: "hazir", pencereler: [p("haftalik", 81, "Haftalık"), p("haftalik_opus", 92.4, "Haftalık · Opus")] })).toEqual({ pencere: "Haftalık · Opus", yuzde: 92 });
  });

  it("hız son bir saatten (açılıştan sonraki ilk saatte açık kalınan süreden); bitiş önce dolan kalemden, günlük bütçe gece yarısından sonraysa sayılmaz", () => {
    const simdi = new Date(2026, 9, 6, 12, 0).getTime();
    const ornekler = [
      { t: simdi - 70 * DK, token: 999_999 },
      { t: simdi - 30 * DK, token: 300_000 },
      { t: simdi - 5 * DK, token: 300_000 },
    ];
    // Açılalı 5 dakika: ölçülmez; 30 dakika: o süreye bölünür; iki saat: son bir saat
    expect(hizHesapla(ornekler, simdi, simdi - 5 * DK)).toBeNull();
    expect(hizHesapla(ornekler, simdi, simdi - 30 * DK)).toBeCloseTo(300_000 / (30 * DK));
    expect(hizHesapla(ornekler, simdi, simdi - 2 * SAAT)).toBeCloseTo(600_000 / SAAT);
    expect(hizHesapla([], simdi, simdi - 2 * SAAT)).toBeNull();
    const hiz = 600_000 / SAAT;
    // 1,2 M kalan → iki saat sonra
    expect(bitisTahmini(butceKalemi(2_000_000, 800_000), null, hiz, simdi)).toBe(new Date(simdi + 2 * SAAT).toISOString());
    // Günlük 300 bin kalan → yarım saat; toplamdan önce dolar
    expect(bitisTahmini(butceKalemi(2_000_000, 800_000), butceKalemi(1_000_000, 700_000), hiz, simdi)).toBe(new Date(simdi + 30 * DK).toISOString());
    // Günlük bütçe gece yarısından sonra dolacaksa sayılmaz
    expect(bitisTahmini(null, butceKalemi(10_000_000, 0), hiz, simdi)).toBeNull();
    expect(bitisTahmini(butceKalemi(2_000_000, 800_000), null, null, simdi)).toBeNull();
  });

  it("seviyenin görev tavanı ve tempo sınırı", () => {
    expect([seviyeTavani(2_000_000, "zeki"), seviyeTavani(2_000_000, "normal"), seviyeTavani(2_000_000, "tasarruflu")]).toEqual([4_000_000, 2_000_000, 1_000_000]);
    expect(seviyeTavani(0, "zeki")).toBe(0);
    expect([seviyeTempoSiniri("zeki", 8), seviyeTempoSiniri("normal", 8), seviyeTempoSiniri("tasarruflu", 8)]).toEqual([0, 6, 3]);
    expect(seviyeTempoSiniri("normal", 4)).toBe(4);
    expect(seviyeTempoSiniri("tasarruflu", 0)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// İzleyici: sahte depo ve hesapla
// ---------------------------------------------------------------------------

interface SahteDurum {
  projeler: Proje[];
  /** proje → gün → token */
  kullanim: Map<string, Map<string, number>>;
  degerler: Map<string, string>;
  hesap: Pick<HesapDurumu, "durum" | "pencereler">;
  simdi: number;
  duyurular: string[];
  kurul: string[];
  haberler: string[];
  durdurulan: string[];
  surdurulen: { id: string; metin: string }[];
  seviyeler: { onceki: KullanimSeviyesi; yeni: KullanimSeviyesi }[];
  /** ekibiDurdur'un döneceği çalışanlar */
  calisanlar: string[];
}

function sahteProje(id: string, butce: ProjeButcesi, seviye: KullanimSeviyesi = "normal", otomatikKademe = true): Proje {
  return {
    id,
    ad: id,
    yol: `/tmp/${id}`,
    aciklama: "",
    varsayilanDal: "main",
    olusturma: new Date(0).toISOString(),
    uzakAdres: null,
    github: null,
    otomatikGonder: false,
    hazirlik: "tamam",
    otomatikOnay: { etkin: false, turler: [] },
    kararVeren: "ceo",
    testKomutu: null,
    hazirlikKomutu: null,
    testZamanAsimiDk: 20,
    butce,
    seviye,
    otomatikKademe,
  };
}

function sahteBaglam(d: SahteDurum): ButceBaglami {
  return {
    depo: {
      proje: (id: string) => d.projeler.find((p) => p.id === id) ?? null,
      projeler: () => d.projeler,
      projeTokeni: (pid: string, gun?: string) => {
        const g = d.kullanim.get(pid) ?? new Map<string, number>();
        return gun ? (g.get(gun) ?? 0) : [...g.values()].reduce((a, b) => a + b, 0);
      },
      deger: (a: string) => d.degerler.get(a) ?? null,
      degerYaz: (a: string, v: string) => void d.degerler.set(a, v),
    },
    hesap: () => d.hesap,
    ekibiDurdur: () => {
      d.durdurulan.push(...d.calisanlar);
      return [...d.calisanlar];
    },
    surdur: (id, metin) => void d.surdurulen.push({ id, metin }),
    seviyeDegisti: (_pid, onceki, yeni) => void d.seviyeler.push({ onceki, yeni }),
    duyur: (_pid, metin) => void d.duyurular.push(metin),
    kurulaBildir: (_pid, baslik) => void d.kurul.push(baslik),
    ceoyaHaber: (_pid, metin) => void d.haberler.push(metin),
    yayinla: () => undefined,
    simdi: () => d.simdi,
  };
}

function yeniDurum(projeler: Proje[]): SahteDurum {
  return {
    projeler,
    kullanim: new Map(),
    degerler: new Map(),
    hesap: { durum: "bilinmiyor", pencereler: [] },
    simdi: new Date(2026, 9, 6, 10, 0).getTime(),
    duyurular: [],
    kurul: [],
    haberler: [],
    durdurulan: [],
    surdurulen: [],
    seviyeler: [],
    calisanlar: [],
  };
}

function harca(d: SahteDurum, pid: string, token: number): void {
  const gun = bugun(new Date(d.simdi));
  const g = d.kullanim.get(pid) ?? new Map<string, number>();
  g.set(gun, (g.get(gun) ?? 0) + token);
  d.kullanim.set(pid, g);
}

describe("ProjeButceleri", () => {
  it("%80'de bir kez uyarır ve seviye bir kademe iner; dolunca ekip durur ve mesajlar bekletilir; bütçe artınca kaldığı yerden sürer", () => {
    const d = yeniDurum([sahteProje("p1", { toplam: 1_000_000, gunluk: null }, "zeki")]);
    const b = new ProjeButceleri(sahteBaglam(d));
    b.baslat(60 * SAAT);
    try {
      expect(b.etkinSeviye("p1")).toBe("zeki");
      harca(d, "p1", 700_000);
      b.kullanimEklendi("p1", "a1", 700_000);
      expect(d.duyurular).toEqual([]);
      harca(d, "p1", 120_000);
      b.kullanimEklendi("p1", "a1", 120_000);
      expect(b.durum("p1")).toMatchObject({ durum: "uyari", neden: "toplam", toplam: { harcanan: 820_000, yuzde: 82 }, seviye: "zeki", etkinSeviye: "normal", kademe: { neden: "butce" } });
      expect(d.duyurular[0]).toBe("Proje token bütçesinin %82'i harcandı (820 bin / 1 M). Bütçe dolarsa ekip durur.");
      expect(d.kurul).toEqual(["Bütçenin %82'i harcandı"]);
      expect(d.haberler[0]).toMatch(/^Proje token bütçesinin %82'i harcandı .* Kalan bütçeyle en önemli işleri bitir/);
      expect(d.seviyeler).toEqual([{ onceki: "zeki", yeni: "normal" }]);
      expect(d.duyurular[1]).toBe("Kullanım seviyesi kendiliğinden bir kademe indi: Zeki → Normal (bütçenin %80'i harcandı). Koşul kalkınca geri çıkar.");
      // Uyarı yinelenmez
      harca(d, "p1", 10_000);
      b.kullanimEklendi("p1", "a1", 10_000);
      expect(d.kurul).toHaveLength(1);

      d.calisanlar = ["a1", "a2"];
      harca(d, "p1", 200_000);
      b.kullanimEklendi("p1", "a1", 200_000);
      expect(b.doluMu("p1")).toBe(true);
      expect(b.durum("p1")).toMatchObject({ durum: "doldu", neden: "toplam", tahminiBitis: null });
      expect(d.durdurulan).toEqual(["a1", "a2"]);
      expect(d.duyurular.at(-1)).toBe("Proje token bütçesi doldu (1 M / 1 M). Ekip durdu; kurul bütçeyi artırınca kaldığı yerden sürecek.");
      expect(d.kurul.at(-1)).toBe("Proje bütçesi doldu");
      // Bekletilen mesajlar
      expect(b.tut("p1", "a3", "T-4'e başla")).toBe(true);
      expect(b.bekletiliyorMu("p1", "a3")).toBe(true);

      // Kurul bütçeyi artırır: açılır, bekletilenler sürer (a3 mesajıyla); seviye geri çıkar
      d.projeler[0] = sahteProje("p1", { toplam: 3_000_000, gunluk: null }, "zeki");
      b.ayarDegisti("p1");
      expect(b.doluMu("p1")).toBe(false);
      expect(b.tut("p1", "a3", "yeni mesaj")).toBe(false);
      expect(d.duyurular).toContain("Kurul token bütçesini artırdı; ekip kaldığı yerden sürüyor.");
      expect(d.surdurulen.map((x) => x.id)).toEqual(["a1", "a2", "a3"]);
      expect(d.surdurulen[2]!.metin).toBe("Kurul token bütçesini artırdı. Kaldığın yerden devam et.\n\nBu sürede gelen mesajlar:\n- T-4'e başla");
      expect(b.etkinSeviye("p1")).toBe("zeki");
      expect(d.seviyeler.at(-1)).toEqual({ onceki: "normal", yeni: "zeki" });
      expect(d.duyurular.at(-1)).toBe("Kademe düşürmenin nedeni kalktı; kullanım seviyesi yeniden Zeki.");
    } finally {
      b.durdur();
    }
  });

  it("tur sürerken tahminle dolan bütçe, tur sonundaki kesin sayı biraz altında kalsa da yalnız bütçe değişince açılır", () => {
    const d = yeniDurum([sahteProje("p1", { toplam: 1_000_000, gunluk: null }, "normal", false)]);
    const b = new ProjeButceleri(sahteBaglam(d));
    try {
      harca(d, "p1", 900_000);
      b.kullanimEklendi("p1", "a1", 900_000);
      d.calisanlar = ["a2"];
      b.turSuruyor("p1", "a2", 60_000);
      expect(b.doluMu("p1")).toBe(false);
      b.turSuruyor("p1", "a2", 110_000);
      expect(b.doluMu("p1")).toBe(true);
      expect(d.durdurulan).toEqual(["a2"]);
      // Kesilen turun kesin sayısı 95 bin: toplam 995 bin, yine dolu sayılır
      harca(d, "p1", 95_000);
      b.kullanimEklendi("p1", "a2", 95_000);
      expect(b.doluMu("p1")).toBe(true);
      expect(b.durum("p1").durum).toBe("doldu");
      // Otomatik kademe kapalı: seviye inmez
      expect(b.etkinSeviye("p1")).toBe("normal");
      d.projeler[0] = sahteProje("p1", { toplam: 1_000_000, gunluk: null }, "normal", false);
      b.ayarDegisti("p1");
      expect(b.durum("p1").durum).toBe("uyari");
    } finally {
      b.durdur();
    }
  });

  it("günlük bütçe gece yarısı yenilenir; dünden kalan doluluk yeniden açılışta da açılır, toplamınki korunur", () => {
    const d = yeniDurum([sahteProje("p1", { toplam: null, gunluk: 500_000 }), sahteProje("p2", { toplam: 400_000, gunluk: null })]);
    const b = new ProjeButceleri(sahteBaglam(d));
    try {
      harca(d, "p1", 500_000);
      b.kullanimEklendi("p1", "a1", 500_000);
      harca(d, "p2", 400_000);
      b.kullanimEklendi("p2", "b1", 400_000);
      expect([b.doluMu("p1"), b.doluMu("p2")]).toEqual([true, true]);
      expect(d.duyurular[0]).toBe("Bugünkü token bütçesi doldu (500 bin / 500 bin). Ekip durdu; gece yarısı ya da kurul bütçeyi artırınca kaldığı yerden sürecek.");
      b.tut("p1", "a1", "devam");
    } finally {
      b.durdur();
    }
    // Ertesi gün yeniden açılış: günlük doluluk açılır (sessiz), toplamınki korunur
    d.simdi += 24 * SAAT;
    const b2 = new ProjeButceleri(sahteBaglam(d));
    try {
      b2.baslat(60 * SAAT);
      expect([b2.doluMu("p1"), b2.doluMu("p2")]).toEqual([false, true]);
    } finally {
      b2.durdur();
    }
    // Açıkken gece yarısı: dakikalık bakış günü döndürür, bekletilenler sürer
    d.kullanim.clear();
    const b3 = new ProjeButceleri(sahteBaglam(d));
    try {
      harca(d, "p1", 500_000);
      b3.kullanimEklendi("p1", "a1", 500_000);
      b3.tut("p1", "a1", "devam");
      expect(b3.doluMu("p1")).toBe(true);
      d.simdi += 24 * SAAT;
      b3.tik();
      expect(b3.doluMu("p1")).toBe(false);
      expect(d.duyurular.slice(-2)).toEqual(["Günlük token bütçesi yenilendi; ekip kaldığı yerden sürüyor.", "Kademe düşürmenin nedeni kalktı; kullanım seviyesi yeniden Normal."]);
      expect(d.surdurulen.at(-1)).toMatchObject({ id: "a1", metin: expect.stringContaining("Günlük token bütçesi yenilendi. Kaldığın yerden devam et.") });
    } finally {
      b3.durdur();
    }
  });

  it("haftalık pencere %80'i geçince seviye iner, sıfırlanınca çıkar; pencere okunmadıysa son bilinen koşul geçerli", () => {
    const d = yeniDurum([sahteProje("p1", { toplam: null, gunluk: null }, "zeki")]);
    const pencere = (yuzde: number): KullanimPenceresi => ({ tur: "haftalik", ad: "Haftalık", yuzde, sifirlanma: null });
    const b = new ProjeButceleri(sahteBaglam(d));
    try {
      b.baslat(60 * SAAT);
      d.hesap = { durum: "hazir", pencereler: [pencere(83)] };
      b.pencereGuncellendi();
      expect(b.etkinSeviye("p1")).toBe("normal");
      expect(b.durum("p1").kademe).toEqual({ neden: "pencere", pencere: "Haftalık" });
      expect(d.duyurular.at(-1)).toBe("Kullanım seviyesi kendiliğinden bir kademe indi: Zeki → Normal (abonelik penceresi: Haftalık %83). Koşul kalkınca geri çıkar.");
    } finally {
      b.durdur();
    }
    // Yeniden açılış: hesap henüz okunmadı; son bilinen pencere koşulu geçerli, seviye inip çıkmaz
    d.hesap = { durum: "bilinmiyor", pencereler: [] };
    const sayi = d.seviyeler.length;
    const b2 = new ProjeButceleri(sahteBaglam(d));
    try {
      b2.baslat(60 * SAAT);
      expect(b2.etkinSeviye("p1")).toBe("normal");
      expect(d.seviyeler).toHaveLength(sayi);
      d.hesap = { durum: "hazir", pencereler: [pencere(4)] };
      b2.pencereGuncellendi();
      expect(b2.etkinSeviye("p1")).toBe("zeki");
      expect(d.seviyeler.at(-1)).toEqual({ onceki: "normal", yeni: "zeki" });
    } finally {
      b2.durdur();
    }
  });

  it("kurulun seviye değişikliği uygulanır ama burada duyurulmaz (duyuruyu Şirket yapar)", () => {
    const d = yeniDurum([sahteProje("p1", { toplam: null, gunluk: null }, "normal")]);
    const b = new ProjeButceleri(sahteBaglam(d));
    try {
      b.baslat(60 * SAAT);
      d.projeler[0] = sahteProje("p1", { toplam: null, gunluk: null }, "tasarruflu");
      b.ayarDegisti("p1");
      expect(d.seviyeler).toEqual([{ onceki: "normal", yeni: "tasarruflu" }]);
      expect(d.duyurular).toEqual([]);
      expect(b.durum("p1")).toMatchObject({ seviye: "tasarruflu", etkinSeviye: "tasarruflu", kademe: null });
    } finally {
      b.durdur();
    }
  });
});

// ---------------------------------------------------------------------------
// Şirket
// ---------------------------------------------------------------------------

describe("Şirket: bütçe, seviye, model sabitliği ve görev tokenı", () => {
  let gecici: string;
  let yap: Yapilandirma;
  let depo: Depo;
  let sirket: Sirket;
  const gelenler: SunucuOlayi[] = [];
  const kullanimEkle = (ajanId: string, token: number) => (sirket as unknown as { kullanimEkle(id: string, d: { token: number }): void }).kullanimEkle(ajanId, { token });
  const genel = (pid: string) => depo.mesajlar(pid, "genel").map((m) => m.metin);

  beforeAll(() => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-butce-"));
    yap = new Yapilandirma(path.join(gecici, "veri"));
    yap.guncelle({ dil: "tr" });
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    const olaylar = new OlayYolu();
    sirket = new Sirket(depo, olaylar, yap, () => null, true);
    olaylar.dinle((o) => gelenler.push(o));
  });

  afterAll(async () => {
    await bekle(20);
    sirket.kapat();
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it("proje bütçe ve seviyeyle açılır; açılış duyurusu söyler; proje özeti ve kullanım özeti bütçeyi taşır", async () => {
    const p = await sirket.projeOlustur({ ad: "Bütçeli", yol: path.join(gecici, "butceli"), olustur: true, butce: { toplam: 20_000_000, gunluk: 0 }, seviye: "zeki" });
    expect(p).toMatchObject({ butce: { toplam: 20_000_000, gunluk: null }, seviye: "zeki", otomatikKademe: true });
    expect(p.butceDurumu).toMatchObject({ toplam: { sinir: 20_000_000, harcanan: 0, yuzde: 0 }, gunluk: null, durum: "normal", seviye: "zeki", etkinSeviye: "zeki" });
    expect(genel(p.id)[0]).toContain("Kullanım seviyesi Zeki; token bütçesi toplam 20 M.");
    // CEO seviyenin yönetim modeliyle (Zeki: Fable) işe alınır ve seviyeye bağlıdır
    expect(depo.ajanlar(p.id)[0]).toMatchObject({ rol: "ceo", model: "fable", modelSabit: false });
    expect(sirket.kullanimOzeti(p.id)).toMatchObject({ butce: { toplam: { sinir: 20_000_000 } }, gorevler: [] });
    // Bozuk seviye ve eksi bütçe yok sayılır
    const q = await sirket.projeOlustur({ ad: "Varsayılan", yol: path.join(gecici, "varsayilan"), olustur: true });
    expect(q).toMatchObject({ butce: { toplam: null, gunluk: null }, seviye: "normal", otomatikKademe: true });
  });

  it("seviyeye bağlı çalışanın modeli seviyeyle değişir, sabit model korunur; null modeli seviyeye bağlar", async () => {
    const pid = depo.projeler().find((p) => p.ad === "Bütçeli")!.id;
    const deniz = sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
    const mert = sirket.iseAl(pid, { ad: "Mert", rol: "test" });
    const onur = sirket.iseAl(pid, { ad: "Onur", rol: "inceleme", model: "sonnet" });
    expect([deniz.model, mert.model, onur.model, onur.modelSabit]).toEqual(["opus", "sonnet", "sonnet", true]);
    const once = genel(pid).length;
    await sirket.projeGuncelle(pid, { seviye: "tasarruflu" });
    await bekle(10);
    const ekip = Object.fromEntries(depo.ajanlar(pid).map((a) => [a.ad, a.model]));
    expect(ekip).toMatchObject({ Ada: "sonnet", Deniz: "haiku", Mert: "haiku", Onur: "sonnet" });
    expect(genel(pid).slice(once)).toContain(
      "Kurul kullanım seviyesini Tasarruflu yaptı: CEO, CTO ve kod inceleme Sonnet 5.5; geliştirme Haiku 4.5; test, doküman ve tanıtım Haiku 4.5; kısa düşünme.",
    );
    // Elle seçilen model sabitlenir; null seviyeye bağlar
    expect(await sirket.ajanModel(deniz.id, "opus")).toMatchObject({ model: "opus", modelSabit: true });
    await sirket.projeGuncelle(pid, { seviye: "normal" });
    await bekle(10);
    expect(depo.ajan(deniz.id)!.model).toBe("opus");
    expect(await sirket.ajanModel(deniz.id, null)).toMatchObject({ model: "sonnet", modelSabit: false });
    expect(depo.ajanAdla(pid, "Ada")!.model).toBe("opus");
  });

  it("görev token tavanı seviyenin katsayısıyla: Zeki 4 M, Normal 2 M, Tasarruflu 1 M", async () => {
    const pid = depo.projeler().find((p) => p.ad === "Bütçeli")!.id;
    const g = sirket.gorevOlustur(pid, { baslik: "Tavan denemesi" });
    expect(sirket.gorevTavani.tavan(g.id)).toBe(2_000_000);
    await sirket.projeGuncelle(pid, { seviye: "zeki" });
    expect(sirket.gorevTavani.tavan(g.id)).toBe(4_000_000);
    await sirket.projeGuncelle(pid, { seviye: "tasarruflu" });
    expect(sirket.gorevTavani.tavan(g.id)).toBe(1_000_000);
    await sirket.projeGuncelle(pid, { seviye: "normal" });
  });

  it("görev tokenı görev satırında ve kullanım olayında; en pahalı görevler çoktan aza", () => {
    const pid = depo.projeler().find((p) => p.ad === "Bütçeli")!.id;
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const mert = depo.ajanAdla(pid, "Mert")!;
    const g1 = depo.gorevEkle({ projeId: pid, baslik: "Menü API", aciklama: "", kabulOlcutu: "", durum: "calisiliyor", atananId: deniz.id, bagimliliklar: [], etiket: "backend", olusturanId: null });
    const g2 = depo.gorevEkle({ projeId: pid, baslik: "Uçtan uca test", aciklama: "", kabulOlcutu: "", durum: "calisiliyor", atananId: mert.id, bagimliliklar: [], etiket: "test", olusturanId: null });
    depo.ajanGuncelle(deniz.id, { gorevId: g1.id });
    depo.ajanGuncelle(mert.id, { gorevId: g2.id });
    const once = gelenler.length;
    kullanimEkle(deniz.id, 120_000);
    kullanimEkle(mert.id, 300_000);
    kullanimEkle(deniz.id, 30_000);
    expect(depo.gorev(g1.id)!.token).toBe(150_000);
    expect(depo.gorevler(pid).find((g) => g.id === g2.id)!.token).toBe(300_000);
    const olay = gelenler.slice(once).filter((o): o is Extract<SunucuOlayi, { tur: "kullanim" }> => o.tur === "kullanim");
    expect(olay.map((o) => o.gorev)).toEqual([
      { id: g1.id, token: 120_000 },
      { id: g2.id, token: 300_000 },
      { id: g1.id, token: 150_000 },
    ]);
    const ozet = sirket.kullanimOzeti(pid);
    expect(ozet.gorevler.map((g) => [g.kod, g.token, g.atananAd, g.tavan])).toEqual([
      [g2.kod, 300_000, "Mert", 2_000_000],
      [g1.kod, 150_000, "Deniz", 2_000_000],
    ]);
    expect(ozet.butce.toplam).toMatchObject({ harcanan: 450_000 });
  });

  it("bütçe dolunca kurul dışı mesaj bekletilir, iş dağıtılmaz, konuşma başlamaz; kurulun mesajı geçer; bütçe artınca açılır", async () => {
    const p = await sirket.projeOlustur({ ad: "Dar", yol: path.join(gecici, "dar"), olustur: true, butce: { toplam: 100_000, gunluk: null } });
    const ceo = depo.ajanlar(p.id)[0]!;
    const elif = sirket.iseAl(p.id, { ad: "Elif", rol: "frontend" });
    kullanimEkle(ceo.id, 85_000);
    expect(sirket.projeOzeti(p.id).butceDurumu).toMatchObject({ durum: "uyari", etkinSeviye: "tasarruflu", kademe: { neden: "butce" } });
    expect(gelenler.some((o) => o.tur === "kurul.bildirimi" && o.bildirim.eylem === "butce" && o.bildirim.baslik === "Bütçenin %85'i harcandı")).toBe(true);
    // Seviye indi: seviyeye bağlı çalışanların modeli Tasarruflu'nun modeli
    await bekle(10);
    expect(depo.ajan(elif.id)!.model).toBe("haiku");

    kullanimEkle(ceo.id, 20_000);
    expect(sirket.butce.doluMu(p.id)).toBe(true);
    expect(genel(p.id).at(-1)).toBe("Proje token bütçesi doldu (105 bin / 100 bin). Ekip durdu; kurul bütçeyi artırınca kaldığı yerden sürecek.");
    // Kurul dışı mesaj bekletilir (hata yok), iş dağıtılmaz; kurulun mesajı teslime ulaşır (oturumsuz kipte 503)
    await expect(sirket.ajanaMesaj(elif.id, "T-2'ye başla", "next", { tur: "sistem" })).resolves.toBeUndefined();
    expect(sirket.butce.bekletiliyorMu(p.id, elif.id)).toBe(true);
    expect(await sirket.ortak.isDagit(p.id)).toEqual([]);
    await expect(sirket.ajanaMesaj(ceo.id, "Durum nedir?", "next", { tur: "kurul" })).rejects.toThrow(/Oturumlar bu çalıştırmada kapalı/);
    expect(sirket.butceOzeti(p.id)).toBe("bütçe 105 bin / 100 bin (%105) · seviye Tasarruflu (kurulun seçimi Normal) · BÜTÇE DOLDU, ekip duruyor");

    await sirket.projeGuncelle(p.id, { butce: { toplam: 1_000_000, gunluk: null } });
    expect(sirket.butce.doluMu(p.id)).toBe(false);
    expect(genel(p.id).slice(-3)).toEqual([
      "Kurul token bütçesini toplam 1 M yaptı.",
      "Kurul token bütçesini artırdı; ekip kaldığı yerden sürüyor.",
      "Kademe düşürmenin nedeni kalktı; kullanım seviyesi yeniden Normal.",
    ]);
    expect(sirket.projeOzeti(p.id).butceDurumu).toMatchObject({ durum: "normal", etkinSeviye: "normal", kademe: null });
  });

  it("0.0.10 göçü: rolün varsayılan modelindeki çalışan seviyeye bağlanıp modeli değişir, değiştirilmiş model sabit kalır; bir kez duyurulur", async () => {
    const dizin = path.join(gecici, "goc");
    const y = new Yapilandirma(dizin);
    y.guncelle({ dil: "tr" });
    const d = new Depo(path.join(dizin, "arnorg.db"));
    const p = d.projeEkle({ ad: "Eski", yol: path.join(dizin, "repo"), aciklama: "", varsayilanDal: "main" });
    const ortak = { projeId: p.id, yoneticiId: null, durum: "kapali" as const, isAciklamasi: "", gorevId: null, oturumId: null, calismaAlani: null, dal: null, izinModu: "default" as const, talimatEki: "", karakter: null, modelSabit: false };
    d.ajanEkle({ ...ortak, ad: "Ada", rol: "ceo", rolAdi: "CEO", model: "fable" });
    d.ajanEkle({ ...ortak, ad: "Deniz", rol: "backend", rolAdi: "Backend geliştirici", model: "opus" });
    d.ajanEkle({ ...ortak, ad: "Mert", rol: "test", rolAdi: "Test mühendisi", model: "sonnet" });
    d.db.exec("UPDATE ajanlar SET model_sabit = NULL");
    const s = new Sirket(d, new OlayYolu(), y, () => null, true);
    try {
      await bekle(20);
      const ekip = Object.fromEntries(d.ajanlar(p.id).map((a) => [a.ad, [a.model, a.modelSabit]]));
      expect(ekip).toEqual({ Ada: ["opus", false], Deniz: ["opus", true], Mert: ["haiku", false] });
      const duyuru = d.mesajlar(p.id, "genel").map((m) => m.metin);
      expect(duyuru).toHaveLength(1);
      expect(duyuru[0]).toBe(
        "ArnOrg 0.0.10: kullanım seviyesi ve token bütçesi geldi. Bu proje Normal seviyede: CEO, CTO ve kod inceleme Opus 5.5; geliştirme Sonnet 5.5; test, doküman ve tanıtım Haiku 4.5; orta düşünme. Modeli seviyeye göre değişenler: Ada (CEO) Fable 5.1 → Opus 5.5, Mert (Test mühendisi) Sonnet 5.5 → Haiku 4.5. Seviyeyi ve bütçeyi Proje ayarları → Kullanım ve bütçe'den seçebilirsiniz; bir çalışana elle seçtiğiniz model korunur.",
      );
      // İkinci açılışta göç ve duyuru yinelenmez
      s.kapat();
      const s2 = new Sirket(d, new OlayYolu(), y, () => null, true);
      await bekle(20);
      expect(d.mesajlar(p.id, "genel")).toHaveLength(1);
      s2.kapat();
    } finally {
      s.kapat();
      d.kapat();
    }
  });

  it("ekip dosyası model sabitliğini taşır; 0.0.10 öncesi dosyada null", () => {
    const kok = path.join(gecici, "ekip-kok");
    const pid = depo.projeler().find((p) => p.ad === "Bütçeli")!.id;
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const onur = depo.ajanAdla(pid, "Onur")!;
    ekipDosyasiYaz(kok, deniz, null);
    ekipDosyasiYaz(kok, onur, "Ada");
    fs.writeFileSync(path.join(kok, ".arnorg", "ekip", "eski.md"), "---\nad: Eski\nrol: backend\nmodel: sonnet\n---\n", "utf8");
    const kayitlar = Object.fromEntries(ekipDosyalariniOku(kok).map((k) => [k.ad, k.modelSabit]));
    expect(kayitlar).toEqual({ Deniz: false, Onur: true, Eski: null });
  });
});
