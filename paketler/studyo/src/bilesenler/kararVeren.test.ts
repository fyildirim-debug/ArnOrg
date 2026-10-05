// Karar yetkisi: kararı veren, gerekçe ve CEO'yu bekleyen onaylar
import type { Onay } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";
import { ceoyuBekliyor, kararGerekcesi, kararKipi, kararVereni, kuruluBekleyen } from "./kararVeren";

function onay(o: Partial<Onay> & Pick<Onay, "tur" | "durum">): Onay {
  return {
    id: "o1",
    projeId: "p1",
    ajanId: null,
    baslik: "Başlık",
    ayrinti: "",
    veri: null,
    olusturma: "2026-10-05T10:00:00Z",
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
    kararKaynagi: null,
    kararVerenAd: null,
    muhatap: null,
    ...o,
  };
}

describe("kararVereni", () => {
  it("kayıtlı kaynağı, süre dolmasını ve eski kayıtlarda nottan otomatik onayı ayırır", () => {
    expect(kararVereni(onay({ tur: "ise_alim", durum: "onaylandi", kararKaynagi: "ceo", kararVerenAd: "Ada" }))).toBe("ceo");
    expect(kararVereni(onay({ tur: "arac", durum: "zaman_asimi", not: "Süre doldu" }))).toBe("zaman_asimi");
    expect(kararVereni(onay({ tur: "ise_alim", durum: "onaylandi", not: "Auto-approved" }))).toBe("otomatik");
    expect(kararVereni(onay({ tur: "birlestirme", durum: "reddedildi", not: "Önce testler" }))).toBe("kurul");
    expect(kararVereni(onay({ tur: "genel", durum: "bekliyor" }))).toBeNull();
  });
});

describe("kararGerekcesi", () => {
  it("CEO kendi teklifine karar verdiyse gerekçe tekliften, öteki kararlarda nottan gelir", () => {
    const iseAlim = onay({ tur: "ise_alim", durum: "onaylandi", ajanId: "ada", ayrinti: "Test kapsamı düşük.\n\nModel: sonnet", not: "CEO kararı (tam otonom)", kararKaynagi: "ceo" });
    expect(kararGerekcesi(iseAlim, "ada")).toBe("Test kapsamı düşük.");
    const teslim = onay({ tur: "teslim", durum: "onaylandi", ajanId: "ada", veri: { ozet: "Liste hazır." }, not: "CEO kararı (tam otonom)", kararKaynagi: "ceo" });
    expect(kararGerekcesi(teslim, "ada")).toBe("Liste hazır.");
    const calisan = onay({ tur: "birlestirme", durum: "reddedildi", ajanId: "deniz", ayrinti: "Liste", not: "Testler eksik.", kararKaynagi: "ceo" });
    expect(kararGerekcesi(calisan, "ada")).toBe("Testler eksik.");
    const arac = onay({ tur: "arac", durum: "onaylandi", ajanId: "ada", ayrinti: "git push", not: "CEO kararı (tam otonom)", kararKaynagi: "ceo" });
    expect(kararGerekcesi(arac, "ada")).toBe("CEO kararı (tam otonom)");
  });
});

describe("kip ve muhatap", () => {
  it("eski çekirdekte kip kurul; rozet CEO'yu bekleyenleri saymaz", () => {
    expect(kararKipi({ kararVeren: "ceo" })).toBe("ceo");
    expect(kararKipi({} as { kararVeren: "ceo" })).toBe("kurul");
    const liste = [
      onay({ tur: "arac", durum: "bekliyor", muhatap: "ceo" }),
      onay({ tur: "arac", durum: "bekliyor", muhatap: "kurul" }),
      onay({ tur: "ise_alim", durum: "bekliyor", muhatap: null }),
      onay({ tur: "ise_alim", durum: "onaylandi", muhatap: "kurul" }),
    ];
    expect(ceoyuBekliyor(liste[0]!)).toBe(true);
    expect(kuruluBekleyen(liste)).toBe(2);
    expect(kuruluBekleyen(liste, (t) => t === "arac")).toBe(1);
  });
});
