// Mesaj metni ayrıştırma: bağlantılar, noktalama, kod içi adresler, güvenli şemalar ve var olan vurgular
import { describe, expect, it } from "vitest";
import { bloklaraAyir, zenginParcala, type ZenginParca } from "./zenginMetin";

const baglantilar = (metin: string) =>
  zenginParcala(metin)
    .filter((p): p is Extract<ZenginParca, { tur: "baglanti" }> => p.tur === "baglanti")
    .map((p) => ({ metin: p.metin, adres: p.adres }));

/** Parçaları yan yana koyunca özgün metin geri gelmeli (kod, kalın ve Markdown bağlantısı yoksa) */
const duzMetin = (parcalar: ZenginParca[]) => parcalar.map((p) => (p.tur === "gorev" ? p.kod : p.metin)).join("");

describe("bağlantılar", () => {
  it("http ve https adreslerini bağlantıya çevirir", () => {
    expect(zenginParcala("Belge: https://ornek.com/belge?a=1#b burada")).toEqual([
      { tur: "metin", metin: "Belge: " },
      { tur: "baglanti", metin: "https://ornek.com/belge?a=1#b", adres: "https://ornek.com/belge?a=1#b" },
      { tur: "metin", metin: " burada" },
    ]);
    expect(baglantilar("http://localhost:5173/#/pano")).toEqual([{ metin: "http://localhost:5173/#/pano", adres: "http://localhost:5173/#/pano" }]);
  });

  it("www. ile başlayana https:// ekler, görünen metin aynı kalır", () => {
    expect(baglantilar("Site www.ornek.com.tr adresinde")).toEqual([{ metin: "www.ornek.com.tr", adres: "https://www.ornek.com.tr" }]);
  });

  it("sondaki nokta, virgül, iki nokta ve kapanan ayraç bağlantıya katılmaz", () => {
    expect(zenginParcala("Bakın: https://ornek.com/a.")).toEqual([
      { tur: "metin", metin: "Bakın: " },
      { tur: "baglanti", metin: "https://ornek.com/a", adres: "https://ornek.com/a" },
      { tur: "metin", metin: "." },
    ]);
    expect(baglantilar("https://ornek.com, sonra")[0]?.metin).toBe("https://ornek.com");
    expect(baglantilar("Adres https://ornek.com: burada")[0]?.metin).toBe("https://ornek.com");
    expect(zenginParcala("(bkz. https://ornek.com/x)")).toEqual([
      { tur: "metin", metin: "(bkz. " },
      { tur: "baglanti", metin: "https://ornek.com/x", adres: "https://ornek.com/x" },
      { tur: "metin", metin: ")" },
    ]);
    expect(baglantilar("(https://ornek.com/x).")[0]?.metin).toBe("https://ornek.com/x");
  });

  it("adresin kendi ayracı korunur", () => {
    expect(baglantilar("https://tr.wikipedia.org/wiki/Ankara_(il)")[0]?.metin).toBe("https://tr.wikipedia.org/wiki/Ankara_(il)");
  });

  it("Türkçe ek adrese katılmaz", () => {
    expect(baglantilar("https://ornek.com'a bakın")[0]?.metin).toBe("https://ornek.com");
  });

  it("Markdown bağlantısı metniyle bağlantı olur", () => {
    expect(zenginParcala("Özet [tasarım belgesi](https://ornek.com/tasarim_(v2)) hazır.")).toEqual([
      { tur: "metin", metin: "Özet " },
      { tur: "baglanti", metin: "tasarım belgesi", adres: "https://ornek.com/tasarim_(v2)" },
      { tur: "metin", metin: " hazır." },
    ]);
  });

  it("satır içi koddaki adres bağlantı olmaz", () => {
    expect(zenginParcala("Çalıştırın: `curl https://ornek.com/api` sonra")).toEqual([
      { tur: "metin", metin: "Çalıştırın: " },
      { tur: "kod", metin: "curl https://ornek.com/api" },
      { tur: "metin", metin: " sonra" },
    ]);
  });

  it("kod bloğundaki adres bağlantı olmaz; blok olduğu gibi kalır", () => {
    const bloklar = bloklaraAyir("Komut:\n```\ncurl https://ornek.com\n```\nBitti https://ornek.com/son");
    expect(bloklar).toEqual([
      { tur: "paragraf", satirlar: ["Komut:"] },
      { tur: "kod", metin: "curl https://ornek.com" },
      { tur: "paragraf", satirlar: ["Bitti https://ornek.com/son"] },
    ]);
  });

  it("yalnız http ve https kabul edilir; başka şemalar düz metin kalır", () => {
    for (const metin of [
      "[tıkla](javascript:alert(1))",
      "javascript:alert(document.cookie)",
      "[veri](data:text/html;base64,PHNjcmlwdD4=)",
      "ftp://ornek.com/dosya",
      "file:///etc/passwd",
      "[x](vbscript:msgbox)",
    ]) {
      const parcalar = zenginParcala(metin);
      expect(parcalar, metin).toEqual([{ tur: "metin", metin }]);
    }
  });

  it("yarım adres bağlantı olmaz", () => {
    expect(baglantilar("https:// boş")).toEqual([]);
    expect(baglantilar("www.")).toEqual([]);
  });

  it("kelimenin içindeki www. bağlantı olmaz", () => {
    expect(baglantilar("ornekwww.com")).toEqual([]);
    expect(baglantilar("posta@www.ornek.com")).toEqual([]);
  });
});

describe("var olan vurgular", () => {
  it("anma, görev kodu ve kalın aynen ayrışır", () => {
    expect(zenginParcala("@Ada T-12 için **acil** bak")).toEqual([
      { tur: "anma", metin: "@Ada" },
      { tur: "metin", metin: " " },
      { tur: "gorev", kod: "T-12" },
      { tur: "metin", metin: " için " },
      { tur: "kalin", metin: "acil" },
      { tur: "metin", metin: " bak" },
    ]);
  });

  it("kalının içindeki adres kalın parçada kalır (çizilirken yeniden ayrışır)", () => {
    expect(zenginParcala("**https://ornek.com**")).toEqual([{ tur: "kalin", metin: "https://ornek.com" }]);
    expect(baglantilar("https://ornek.com")).toHaveLength(1);
  });

  it("adresteki anma ve görev kodu adresin parçasıdır", () => {
    expect(zenginParcala("https://ornek.com/@ada/T-12")).toEqual([
      { tur: "baglanti", metin: "https://ornek.com/@ada/T-12", adres: "https://ornek.com/@ada/T-12" },
    ]);
  });

  it("metin kaybolmaz", () => {
    const metin = "Merhaba @Ece, T-7 (https://ornek.com/x). Ayrıntı: www.ornek.com, https://ornek.com/a?b=1! Sonra: http://x.io:";
    expect(duzMetin(zenginParcala(metin))).toBe(metin);
    expect(baglantilar(metin).map((b) => b.metin)).toEqual(["https://ornek.com/x", "www.ornek.com", "https://ornek.com/a?b=1", "http://x.io"]);
  });
});
