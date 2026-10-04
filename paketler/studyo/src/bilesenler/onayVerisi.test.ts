// Teslim, ana yasa ve işten çıkarma onaylarının verisi güvenle okunur
import { describe, expect, it } from "vitest";
import { anayasaVerisi, ilkParagraf, istenCikarmaVerisi, teslimVerisi } from "./onayVerisi";

describe("teslimVerisi", () => {
  it("bilinen alanları okur, boşları atar", () => {
    const v = teslimVerisi({
      baslik: "Sipariş akışı",
      ozet: " Uçtan uca çalışıyor ",
      testAdimlari: ["Paneli aç", "", 3, "Sipariş oluştur"],
      calistir: "npm run dev",
      adres: "http://localhost:5173",
      dal: "main",
    });
    expect(v).toEqual({
      baslik: "Sipariş akışı",
      ozet: "Uçtan uca çalışıyor",
      testAdimlari: ["Paneli aç", "Sipariş oluştur"],
      calistir: "npm run dev",
      adres: "http://localhost:5173",
      dal: "main",
    });
  });

  it("http(s) dışındaki adresi ve eksik veriyi güvenle karşılar", () => {
    expect(teslimVerisi({ adres: "javascript:alert(1)", calistir: null }).adres).toBeNull();
    expect(teslimVerisi(null)).toEqual({ baslik: null, ozet: null, testAdimlari: [], calistir: null, adres: null, dal: null });
  });
});

describe("anayasaVerisi", () => {
  it("maddeleri ve geçerli makine kurallarını okur", () => {
    const v = anayasaVerisi({
      maddeler: [
        { no: 1, baslik: "Gizli bilgi", metin: ".env okunmaz.", kural: { hedef: "yol", desenler: ["(^|/)\\.env"], karar: "ret" } },
        { no: 2, baslik: "Testsiz iş yok", metin: "Test geçmeden inceleme yok.", kural: null },
        { baslik: "Bozuk kural", metin: "x", kural: { hedef: "disk", desenler: ["a"], karar: "ret" } },
        { metin: "" },
      ],
      gerekce: "Hazırlıkta konuşuldu.",
    });
    expect(v.gerekce).toBe("Hazırlıkta konuşuldu.");
    expect(v.maddeler).toHaveLength(3);
    expect(v.maddeler[0]!.kural).toEqual({ hedef: "yol", desenler: ["(^|/)\\.env"], karar: "ret" });
    expect(v.maddeler[1]!.kural).toBeNull();
    expect(v.maddeler[2]).toMatchObject({ no: 3, kural: null });
  });
});

describe("istenCikarmaVerisi", () => {
  it("devralan yoksa null döner", () => {
    expect(istenCikarmaVerisi({ ajanId: "mert", ad: "Mert", devralanId: null, gerekce: "Test işi bitti." })).toEqual({
      ajanId: "mert",
      ad: "Mert",
      devralanId: null,
      gerekce: "Test işi bitti.",
    });
  });
});

describe("ilkParagraf", () => {
  it("madde listesinden önceki açıklamayı alır", () => {
    expect(ilkParagraf("Hazırlıkta konuşuldu.\n\n1. Gizli bilgi — .env okunmaz")).toBe("Hazırlıkta konuşuldu.");
    expect(ilkParagraf("1. Gizli bilgi\n2. Testler")).toBeNull();
    expect(ilkParagraf("")).toBeNull();
  });
});
