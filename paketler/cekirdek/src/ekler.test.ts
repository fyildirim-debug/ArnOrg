// Türkçe ad ekleri: ünlü uyumu, kaynaştırma ve sert ünsüz benzeşmesi
import { describe, expect, it } from "vitest";
import { ayrilma, belirtme, bulunma, ilgi, yonelme } from "./yardimci.js";

describe("Türkçe ad ekleri", () => {
  it("yönelme ve belirtme", () => {
    expect(["Ada", "Kerem", "Mert", "Ece", "Onur", "Göktürk"].map(yonelme)).toEqual(["Ada'ya", "Kerem'e", "Mert'e", "Ece'ye", "Onur'a", "Göktürk'e"]);
    expect(["Ada", "Ece", "Onur", "Göktürk", "main", "develop"].map(belirtme)).toEqual(["Ada'yı", "Ece'yi", "Onur'u", "Göktürk'ü", "main'i", "develop'u"]);
  });

  it("ilgi, ayrılma ve bulunma", () => {
    expect(["Ada", "Kerem", "Onur", "Ece"].map(ilgi)).toEqual(["Ada'nın", "Kerem'in", "Onur'un", "Ece'nin"]);
    expect(["Ada", "Kerem", "Mert", "Burak"].map(ayrilma)).toEqual(["Ada'dan", "Kerem'den", "Mert'ten", "Burak'tan"]);
    expect(["Ada", "Kerem", "Burak", "Serap"].map(bulunma)).toEqual(["Ada'da", "Kerem'de", "Burak'ta", "Serap'ta"]);
  });
});
