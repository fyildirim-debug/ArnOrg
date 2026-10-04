// Araç girdisindeki biçim sızıntısının ayıklanması (gerçek bir teslimde görülen örnekle)
import { describe, expect, it } from "vitest";
import { aracGirdisiniOnar } from "./arac-girdisi.js";

describe("araç girdisi onarımı", () => {
  it("teslimde sızan parametreyi keser ve boş alanı doldurur", () => {
    const girdi = {
      baslik: "Tiny Notes v0.1.0 — First Release",
      ozet: 'Tiny Notes is ready for board testing. Total: 4 tasks, 15 tests, 100% pass rate.</ozet>\n<parameter name="calistir">npm test',
      testAdimlari: ["Run all tests: npm test"],
    };
    const onarilan = aracGirdisiniOnar(girdi as Record<string, unknown>);
    expect(onarilan.ozet).toBe("Tiny Notes is ready for board testing. Total: 4 tasks, 15 tests, 100% pass rate.");
    expect(onarilan.calistir).toBe("npm test");
    expect(onarilan.testAdimlari).toEqual(["Run all tests: npm test"]);
  });

  it("birden çok sızan parametreyi ve sondaki kapanış etiketlerini ayıklar", () => {
    const onarilan = aracGirdisiniOnar({ metin: 'Merhaba</metin>\n<parameter name="kanal">genel</parameter>\n<parameter name="alici">Ada</parameter>\n</invoke>', kanal: "", alici: undefined });
    expect(onarilan).toEqual({ metin: "Merhaba", kanal: "genel", alici: "Ada" });
  });

  it("dolu alanın üzerine yazmaz; sızıntı yoksa girdiyi aynen döndürür", () => {
    const dolu = aracGirdisiniOnar({ ozet: 'Hazır.<parameter name="adres">http://x</parameter>', adres: "http://127.0.0.1:3000" });
    expect(dolu).toEqual({ ozet: "Hazır.", adres: "http://127.0.0.1:3000" });
    const temiz = { ozet: "Hazır. <b>kalın</b> metin", adres: null };
    expect(aracGirdisiniOnar(temiz)).toBe(temiz);
  });

  it("metin alanları verilince yalnız onları doldurur", () => {
    const onarilan = aracGirdisiniOnar({ ozet: 'Bitti</ozet><parameter name="testAdimlari">npm test</parameter><parameter name="calistir">npm start' }, ["calistir", "adres"]);
    expect(onarilan).toEqual({ ozet: "Bitti", calistir: "npm start" });
  });
});
