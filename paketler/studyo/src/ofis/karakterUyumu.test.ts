// Stüdyo'nun karakter seçimi adla uyumlu (0.0.8): ofisteki otomatik atama, işe alım adayı, eski atamanın düzelmesi
import { karakterCinsiyeti } from "@arnorg/ortak/karakterler";
import { describe, expect, it } from "vitest";
import { adayKarakteri, karakterleriAta } from "./karakterSecimi";

// Gerçek katalogdan bir kesit: kadın CEO, erkek CTO, erkek ve kadın backend, kadın frontend, erkek frontend
const katalog = [
  { id: "k01", roller: ["ceo"] },
  { id: "k02", roller: ["cto"] },
  { id: "k03", roller: ["backend", "fullstack"] },
  { id: "k04", roller: ["frontend", "fullstack"] },
  { id: "k13", roller: ["frontend", "backend"] },
  { id: "k16", roller: ["cto", "inceleme", "ceo"] },
  { id: "k24", roller: ["frontend", "fullstack"] },
];
const ajan = (id: string, ad: string, rol: string, dk: number, karakter: string | null = null) => ({
  id,
  ad,
  rol,
  karakter,
  olusturma: new Date(Date.UTC(2026, 9, 1, 9, dk)).toISOString(),
});

describe("adla uyumlu karakter seçimi", () => {
  it("otomatik atama adın cinsiyetine uyan boş karakterler arasında rolü öne alır", () => {
    const a = karakterleriAta([ajan("ada", "Ada", "ceo", 0), ajan("kerem", "Kerem", "cto", 1), ajan("zeynep", "Zeynep", "backend", 2), ajan("mert", "Mert", "frontend", 3)], katalog);
    expect(a.get("ada")).toBe("k01");
    expect(a.get("kerem")).toBe("k02");
    // Kadın backend: k03 (erkek) değil, k13
    expect(a.get("zeynep")).toBe("k13");
    // Erkek frontend: k04 (kadın) değil, k24
    expect(a.get("mert")).toBe("k24");
  });

  it("bilinmeyen adda yalnız role bakar; aynı cinsiyette boş kalmayınca o cinsiyetten tekrar seçer", () => {
    const a = karakterleriAta([ajan("deniz", "Deniz", "backend", 0)], katalog);
    expect(a.get("deniz")).toBe("k03");
    const kadinlar = ["ayse", "elif", "ece", "selin", "lale"].map((ad, i) => ajan(ad, ad[0]!.toUpperCase() + ad.slice(1), "frontend", i));
    const b = karakterleriAta(kadinlar, katalog);
    for (const k of kadinlar) expect(karakterCinsiyeti(b.get(k.id)), k.id).toBe("kadin");
  });

  it("adla çelişen önceki otomatik atama yeniden seçilir; kayıtlı karakter korunur", () => {
    const onceki = { kerem: "k16", mert: "k04" };
    const a = karakterleriAta([ajan("kerem", "Kerem", "cto", 0), ajan("mert", "Mert", "frontend", 1), ajan("elif", "Elif", "frontend", 2, "k24")], katalog, onceki);
    expect(a.get("kerem")).toBe("k02");
    expect(a.get("mert")).not.toBe("k04");
    expect(karakterCinsiyeti(a.get("mert"))).toBe("erkek");
    // Kurulun seçtiği karakter (kayıtlı) adla çelişse de korunur
    expect(a.get("elif")).toBe("k24");
    // Adla uyumlu önceki atama kalır
    expect(karakterleriAta([ajan("ece", "Ece", "frontend", 0)], katalog, { ece: "k13" }).get("ece")).toBe("k13");
  });

  it("işe alım adayı ada ve role göre önerilir", () => {
    expect(adayKarakteri("backend", katalog, [], "yeni", "Zeynep")).toBe("k13");
    expect(adayKarakteri("backend", katalog, [], "yeni", "Kerem")).toBe("k03");
    expect(adayKarakteri("frontend", katalog, ["k04", "k13"], "yeni", "Elif")).toBe("k01");
    expect(adayKarakteri("frontend", katalog, [], "yeni", "Deniz")).toBe("k04");
    expect(adayKarakteri("frontend", katalog, [], "yeni")).toBe("k04");
  });
});
