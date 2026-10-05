// Arayüz hareketinin saf parçaları: FLIP farkı ve konum ölçümü, çıkanların birleştirilmesi, sayaç tıkının yönü,
// kısayol tuşu
import { describe, expect, it } from "vitest";
import { cikanlariBirlestir, type CikanOge } from "./cikis";
import { flipFarki, konumOlc } from "./flip";
import { sayiYonu, SURE } from "./hareketAyari";
import { kisayolTusu, yaziAlaniMi } from "./kisayol";

describe("FLIP", () => {
  it("fark eski konumdan yenisine ters kayma; eşiğin altı ve eksik konum yok", () => {
    expect(flipFarki({ x: 10, y: 200 }, { x: 180, y: 40 })).toEqual({ x: -170, y: 160 });
    expect(flipFarki({ x: 10, y: 10 }, { x: 10.4, y: 9.7 })).toBeNull();
    expect(flipFarki(undefined, { x: 0, y: 0 })).toBeNull();
    expect(flipFarki({ x: 0, y: 0 }, undefined)).toBeNull();
    expect(flipFarki({ x: 0, y: 0 }, { x: 0.2, y: 0.6 }, 0.5)).toEqual({ x: -0.2, y: -0.6 });
  });

  it("konum offset zinciriyle kaba kadar ölçülür (kap null ise köke kadar)", () => {
    const kok = { offsetLeft: 0, offsetTop: 0, offsetParent: null };
    const kap = { offsetLeft: 240, offsetTop: 120, offsetParent: kok };
    const kolon = { offsetLeft: 180, offsetTop: 0, offsetParent: kap };
    const kart = { offsetLeft: 8, offsetTop: 64, offsetParent: kolon };
    const el = (o: object) => o as unknown as HTMLElement;
    expect(konumOlc(el(kart), el(kap))).toEqual({ x: 188, y: 64 });
    expect(konumOlc(el(kart), null)).toEqual({ x: 428, y: 184 });
  });
});

describe("çıkanlar", () => {
  const ad = (x: string) => x;
  const gor = (liste: CikanOge<string>[]) => liste.map((o) => `${o.anahtar}${o.cikiyor ? "~" : ""}`).join(" ");

  it("çıkan öğe eski komşusunun ardında, cikiyor olarak kalır", () => {
    const once = cikanlariBirlestir([], ["a", "b", "c"], ad);
    expect(gor(once)).toBe("a b c");
    expect(gor(cikanlariBirlestir(once, ["a", "c"], ad))).toBe("a b~ c");
    expect(gor(cikanlariBirlestir(once, ["b", "c"], ad))).toBe("a~ b c");
    expect(gor(cikanlariBirlestir(once, ["a", "b"], ad))).toBe("a b c~");
  });

  it("üst üste çıkanlar sırasını korur; yeni gelen kendi yerinde", () => {
    const once = cikanlariBirlestir([], ["a", "b", "c", "d"], ad);
    expect(gor(cikanlariBirlestir(once, ["a", "d", "e"], ad))).toBe("a b~ c~ d e");
    expect(gor(cikanlariBirlestir(once, [], ad))).toBe("a~ b~ c~ d~");
  });

  it("geri gelen öğe artık çıkmıyor", () => {
    const cikarken = cikanlariBirlestir(cikanlariBirlestir([], ["a", "b"], ad), ["a"], ad);
    expect(gor(cikanlariBirlestir(cikarken, ["a", "b"], ad))).toBe("a b");
  });
});

describe("sayaç tıkı", () => {
  it("artış, azalış ve değişmeyen sayı", () => {
    expect(sayiYonu("3", "4")).toBe("artti");
    expect(sayiYonu("12", "9")).toBe("azaldi");
    expect(sayiYonu("5", "5")).toBeNull();
  });

  it("çevresindeki yazı ve binlik ayırıcılar okunur; sayı yoksa yön yok", () => {
    expect(sayiYonu("(1)", "(2)")).toBe("artti");
    expect(sayiYonu("5 / 14 görev", "4 / 14 görev")).toBe("azaldi");
    expect(sayiYonu("1.234", "987")).toBe("azaldi");
    expect(sayiYonu("1,234", "2,001")).toBe("artti");
    expect(sayiYonu(null, "3")).toBeNull();
    expect(sayiYonu("yok", "3")).toBeNull();
  });

  it("süreler 150-250 ms aralığında, çıkış girişten kısa", () => {
    for (const s of Object.values(SURE)) {
      expect(s).toBeGreaterThanOrEqual(150);
      expect(s).toBeLessThanOrEqual(250);
    }
    expect(SURE.hizli).toBeLessThan(SURE.orta);
  });
});

describe("kısayol tuşu", () => {
  it("tek karakter küçük harfe iner, adlı tuşlar olduğu gibi; Shift sayılır", () => {
    expect(kisayolTusu({ key: "C" })).toBe("c");
    expect(kisayolTusu({ key: "?" })).toBe("?");
    expect(kisayolTusu({ key: "/" })).toBe("/");
    expect(kisayolTusu({ key: "Escape" })).toBe("Escape");
    expect(kisayolTusu({ key: "ArrowLeft" })).toBe("ArrowLeft");
  });

  it("Ctrl, Cmd ya da Alt basılıyken ve tanınmayan tuşta kısayol yok", () => {
    expect(kisayolTusu({ key: "c", ctrlKey: true })).toBeNull();
    expect(kisayolTusu({ key: "c", metaKey: true })).toBeNull();
    expect(kisayolTusu({ key: "c", altKey: true })).toBeNull();
    expect(kisayolTusu({ key: "Dead" })).toBeNull();
    expect(kisayolTusu({ key: "" })).toBeNull();
  });

  it("yazı alanında kısayol çalışmaz", () => {
    expect(yaziAlaniMi({ tagName: "INPUT" })).toBe(true);
    expect(yaziAlaniMi({ tagName: "textarea" })).toBe(true);
    expect(yaziAlaniMi({ tagName: "SELECT" })).toBe(true);
    expect(yaziAlaniMi({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(yaziAlaniMi({ tagName: "BUTTON" })).toBe(false);
    expect(yaziAlaniMi(null)).toBe(false);
  });
});
