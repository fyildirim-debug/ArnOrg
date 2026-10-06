import { describe, expect, it } from "vitest";
import { acilisAlanlari, artirmaAdimlari, ayniButce, butceGirdisi, girdidenButce, kalanParcalar, milyondanToken, seviyeModeli, tokendenMilyon, VARSAYILAN_ACILIS } from "./butceYardimcilari";

describe("bütçe yardımcıları", () => {
  it("milyon girdisi tokena: boş ve 0 sınırsız, virgül ondalık, geçersiz undefined", () => {
    expect(milyondanToken("")).toBeNull();
    expect(milyondanToken(" 0 ")).toBeNull();
    expect(milyondanToken("20")).toBe(20_000_000);
    expect(milyondanToken("2,5")).toBe(2_500_000);
    expect(milyondanToken("0.25")).toBe(250_000);
    expect(milyondanToken("-3")).toBeUndefined();
    expect(milyondanToken("abc")).toBeUndefined();
    expect(milyondanToken("1e3")).toBeUndefined();
    expect(tokendenMilyon(null)).toBe("");
    expect(tokendenMilyon(2_500_000)).toBe("2.5");
    expect(tokendenMilyon(1_234_567)).toBe("1.23");
  });

  it("girdiden bütçe ve açılış alanları; geçersizse null ve hatalı alan", () => {
    expect(girdidenButce({ toplam: "20", gunluk: "" })).toEqual({ butce: { toplam: 20_000_000, gunluk: null }, hatali: { toplam: false, gunluk: false } });
    expect(girdidenButce({ toplam: "x", gunluk: "5" })).toEqual({ butce: null, hatali: { toplam: true, gunluk: false } });
    expect(butceGirdisi({ toplam: 20_000_000, gunluk: null })).toEqual({ toplam: "20", gunluk: "" });
    expect(ayniButce({ toplam: 1, gunluk: null }, { toplam: 1, gunluk: null })).toBe(true);
    expect(ayniButce({ toplam: 1, gunluk: null }, { toplam: null, gunluk: null })).toBe(false);
    expect(acilisAlanlari(VARSAYILAN_ACILIS)).toEqual({ butce: { toplam: null, gunluk: null }, seviye: "normal", otomatikKademe: true });
    expect(acilisAlanlari({ ...VARSAYILAN_ACILIS, butce: { toplam: "?", gunluk: "" } })).toBeNull();
  });

  it("bütçeyi artırma adımları yuvarlak ve harcananın üstünde", () => {
    expect(artirmaAdimlari(20_000_000, 20_400_000)).toEqual([25_500_000, 30_600_000, 40_800_000].map((n) => Math.ceil(n / 500_000) * 500_000));
    expect(artirmaAdimlari(1_000_000, 900_000)).toEqual([1_500_000, 2_000_000]);
  });

  it("kalan süre parçaları: gün varsa gün ve saat, yoksa saat ve dakika", () => {
    expect(kalanParcalar((26 * 60 + 30) * 60_000)).toEqual({ gun: 1, saat: 2, dakika: 0 });
    expect(kalanParcalar((3 * 60 + 20) * 60_000)).toEqual({ gun: 0, saat: 3, dakika: 20 });
    expect(kalanParcalar(20_000)).toEqual({ gun: 0, saat: 0, dakika: 0 });
  });

  it("rolün seviyedeki modeli kademeden; katalog yoksa takma ad", () => {
    expect(seviyeModeli("normal", "ceo", null)).toBe("opus");
    expect(seviyeModeli("zeki", "backend", null)).toBe("opus");
    expect(seviyeModeli("tasarruflu", "inceleme", null)).toBe("sonnet");
    expect(seviyeModeli("normal", "test", null)).toBe("haiku");
    // Katalogda Fable yoksa Opus
    const katalog = { kaynak: "claude" as const, guncelleme: null, modeller: [{ deger: "opus", ad: "Opus 5.5", kimlik: "claude-opus-5-5", aciklama: "" }] };
    expect(seviyeModeli("zeki", "ceo", katalog)).toBe("opus");
  });
});
