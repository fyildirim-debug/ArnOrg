// Ofisin 0.0.8 canlılığı: yazma temposu, mola planı, kararın muhatabı
import { describe, expect, it } from "vitest";
import {
  ACILIS_MOLASI,
  aracPayi,
  ILK_MOLA,
  kararMuhatabi,
  METIN_PAYI,
  MOLA_ARASI,
  molaAgirliklari,
  molaGecikmesi,
  molaSec,
  SEKERLEME_ESIGI,
  TEMPO_YARI_OMUR,
  tempoDuzeyi,
  tempoEkle,
  tempoOku,
  yazmaKipirtisi,
  yazmaSuresi,
  yeniTempo,
  type TempoDuzeyi,
} from "./canlilik";

/** Sıradaki değerleri sırayla veren rastgele kaynağı (son değer tekrar eder) */
function sirali(...degerler: number[]) {
  let i = 0;
  return () => degerler[Math.min(i++, degerler.length - 1)]!;
}

describe("yazma temposu", () => {
  it("yarı ömürde yarıya iner, yeni pay üstüne eklenir", () => {
    const t = tempoEkle(yeniTempo(0), 0.6, 0);
    expect(tempoOku(t, 0)).toBeCloseTo(0.6);
    expect(tempoOku(t, TEMPO_YARI_OMUR)).toBeCloseTo(0.3);
    expect(tempoOku(t, TEMPO_YARI_OMUR * 2)).toBeCloseTo(0.15);
    const t2 = tempoEkle(t, 0.2, TEMPO_YARI_OMUR);
    expect(tempoOku(t2, TEMPO_YARI_OMUR)).toBeCloseTo(0.5);
  });

  it("1'de doyar, geçmişe dönük okuma ölçüyü büyütmez, eksi pay yok sayılır", () => {
    let t = yeniTempo(0);
    for (let i = 0; i < 10; i++) t = tempoEkle(t, 0.34, i * 500);
    expect(tempoOku(t, t.an)).toBe(1);
    expect(tempoOku(t, t.an - 5000)).toBe(1);
    expect(tempoEkle(yeniTempo(0), -1, 0).deger).toBe(0);
  });

  it("dosya yazmak okumaktan, komut aramaktan ağır basar", () => {
    expect(aracPayi("Edit")).toBeGreaterThan(aracPayi("Bash"));
    expect(aracPayi("Write")).toBe(aracPayi("MultiEdit"));
    expect(aracPayi("Bash")).toBeGreaterThan(aracPayi("Read"));
    expect(aracPayi("mcp__arnorg__gorev_guncelle")).toBeGreaterThan(aracPayi("Grep"));
    expect(aracPayi(undefined)).toBeGreaterThan(0);
    expect(METIN_PAYI).toBeLessThan(aracPayi("Edit"));
  });

  it("sık düzenleme çok yoğun, seyrek okuma sakin, uzun sessizlik durgun", () => {
    // 2 saniyede bir düzenleme
    let yogun = yeniTempo(0);
    for (let i = 0; i < 8; i++) yogun = tempoEkle(yogun, aracPayi("Edit"), i * 2000);
    expect(tempoDuzeyi(tempoOku(yogun, yogun.an))).toBe(3);
    // 6 saniyede bir okuma
    let sakin = yeniTempo(0);
    for (let i = 0; i < 6; i++) sakin = tempoEkle(sakin, aracPayi("Read"), i * 6000);
    expect(tempoDuzeyi(tempoOku(sakin, sakin.an))).toBe(1);
    // Yarım dakika sessizlik: durgun
    expect(tempoDuzeyi(tempoOku(yogun, yogun.an + 30_000))).toBe(0);
  });

  it("düzey arttıkça klavye kıpırtısı sıklaşır ve belirginleşir, yazma süresi uzar", () => {
    const duzeyler: TempoDuzeyi[] = [0, 1, 2, 3];
    for (let i = 1; i < duzeyler.length; i++) {
      const once = yazmaKipirtisi(duzeyler[i - 1]!);
      const simdi = yazmaKipirtisi(duzeyler[i]!);
      expect(simdi.siklik).toBeGreaterThan(once.siklik);
      expect(simdi.genlik).toBeGreaterThan(once.genlik);
      expect(yazmaSuresi(duzeyler[i]!)).toBeGreaterThan(yazmaSuresi(duzeyler[i - 1]!));
    }
    // Kıpırtı sakin kalır: bir buçuk pikseli geçmez
    expect(yazmaKipirtisi(3).genlik).toBeLessThan(1.5);
  });
});

describe("mola", () => {
  it("masada geçecek süre kipine göre aralıkta", () => {
    expect(molaGecikmesi("ilk", () => 0)).toBe(ILK_MOLA[0]);
    expect(molaGecikmesi("ilk", () => 1)).toBe(ILK_MOLA[1]);
    expect(molaGecikmesi("sonraki", () => 0.5)).toBe((MOLA_ARASI[0] + MOLA_ARASI[1]) / 2);
    expect(molaGecikmesi("acilis", () => 0)).toBe(ACILIS_MOLASI[0]);
    // Ekran açılırken ilk mola, işi yeni bitenden erken gelebilir; sonrakiler seyrek
    expect(ACILIS_MOLASI[0]).toBeLessThan(ILK_MOLA[0]);
    expect(MOLA_ARASI[0]).toBeGreaterThan(ILK_MOLA[1]);
  });

  it("ağırlıklar her kişilikte 100 ve sevdiği yer öne çıkar", () => {
    for (const yer of [undefined, "kahve", "otomat", "su", "kanepe", "masa-tenisi", "kitaplik", "sunucu", "beyaz-tahta", "bitki", "pencere"] as const) {
      expect(molaAgirliklari(yer).reduce((t, [, a]) => t + a, 0)).toBe(100);
    }
    expect(molaAgirliklari("kahve")[0]).toEqual(["kahve", 65]);
    expect(molaAgirliklari("su")[0]).toEqual(["su", 60]);
    expect(molaAgirliklari("kitaplik")[0]).toEqual(["sevdigi", 55]);
  });

  it("zar ağırlıklara göre yer seçer, süre türün aralığında", () => {
    // kahve sever: 0-65 kahve, 65-80 su, 80-100 kanepe
    expect(molaSec("kahve", 0, sirali(0.1, 0.5)).tur).toBe("kahve");
    expect(molaSec("kahve", 0, sirali(0.7, 0.5)).tur).toBe("su");
    expect(molaSec("kahve", 0, sirali(0.95, 0.5)).tur).toBe("kanepe");
    const m = molaSec("kitaplik", 0, sirali(0.2, 0));
    expect(m).toEqual({ tur: "sevdigi", sure: 8000 });
  });

  it("çok uzun boşlukta ara sıra kanepede şekerleme; kısa boşlukta asla", () => {
    expect(molaSec("kahve", SEKERLEME_ESIGI, sirali(0.1, 0.5)).tur).toBe("sekerleme");
    expect(molaSec("kahve", SEKERLEME_ESIGI, sirali(0.9, 0.1, 0.5)).tur).toBe("kahve");
    expect(molaSec("kahve", SEKERLEME_ESIGI - 1, sirali(0.1, 0.5)).tur).toBe("kahve");
    const s = molaSec(undefined, SEKERLEME_ESIGI * 2, sirali(0, 1));
    expect(s).toEqual({ tur: "sekerleme", sure: 55_000 });
  });
});

describe("kararın muhatabı", () => {
  const onay = (ajanId: string | null, durum: string, muhatap?: string | null) => ({ ajanId, durum, muhatap });

  it("bekleyen onaylarının hepsi CEO'ya yöneldiyse CEO", () => {
    expect(kararMuhatabi([onay("deniz", "bekliyor", "ceo")], "deniz")).toBe("ceo");
    expect(kararMuhatabi([onay("deniz", "bekliyor", "ceo"), onay("deniz", "bekliyor", "ceo")], "deniz")).toBe("ceo");
  });

  it("biri kurula yöneldiyse ya da muhatabı yoksa kurul", () => {
    expect(kararMuhatabi([onay("deniz", "bekliyor", "ceo"), onay("deniz", "bekliyor", "kurul")], "deniz")).toBe("kurul");
    expect(kararMuhatabi([onay("deniz", "bekliyor", null)], "deniz")).toBe("kurul");
    expect(kararMuhatabi([onay("deniz", "bekliyor")], "deniz")).toBe("kurul");
  });

  it("sonuçlanan ya da başkasının onayı sayılmaz; bekleyeni görünmüyorsa kurul", () => {
    expect(kararMuhatabi([onay("deniz", "onaylandi", "ceo"), onay("ece", "bekliyor", "ceo")], "deniz")).toBe("kurul");
    expect(kararMuhatabi([], "deniz")).toBe("kurul");
  });
});
