// Sözlük: İngilizce ve Türkçe bölümler aynı anahtarları taşır; metin olan yerde metin, işlev olan yerde işlev.
// Sözlükler dil/index üzerinden alınır (bölümlerin içe aktarım sırası uygulamadakiyle aynı kalsın).
import { describe, expect, it } from "vitest";
import { diliAyarla, sozluk, type Sozluk } from "./index";

function sozlugu(dil: "tr" | "en"): Sozluk {
  diliAyarla(dil);
  return sozluk();
}

/** Yaprakların yolları: "bolum.anahtar", işlevler "bolum.anahtar()" */
function yollar(deger: unknown, yol = ""): string[] {
  if (typeof deger === "function") return [`${yol}()`];
  if (deger && typeof deger === "object") {
    return Object.keys(deger)
      .sort()
      .flatMap((k) => yollar((deger as Record<string, unknown>)[k], yol ? `${yol}.${k}` : k));
  }
  return [`${yol}:${typeof deger}`];
}

describe("sözlük", () => {
  const tr = sozlugu("tr");
  const en = sozlugu("en");

  it("iki dilde aynı bölümler var", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  for (const bolum of Object.keys(tr) as (keyof Sozluk)[]) {
    it(`${bolum}: anahtar kümeleri ve değer türleri aynı`, () => {
      expect(yollar(en[bolum])).toEqual(yollar(tr[bolum]));
    });
  }

  it("boş metin yok", () => {
    const bos = (s: Sozluk) => yollar(s).filter((y) => y.endsWith(":string") && !y.includes("()"));
    for (const s of [tr, en]) {
      const metinler = bos(s).map((y) => y.slice(0, -":string".length));
      for (const yol of metinler) {
        const deger = yol.split(".").reduce<unknown>((d, k) => (d as Record<string, unknown>)[k], s);
        expect(deger, yol).not.toBe("");
      }
    }
  });

  it("İngilizce işlevler tekil ve çoğulu ayırır", () => {
    expect(en.genel.calisanSayisi(1)).toBe("1 employee");
    expect(en.genel.calisanSayisi(3)).toBe("3 employees");
    expect(en.gezinti.ust.mesaiDurdu(1)).toBe("Closed 1 agent session. Work stopped.");
    expect(en.karargah.aracBekliyor(2)).toBe("2 tool calls waiting");
    expect(en.genel.tokenBirimi(1)).toBe("token");
    expect(en.genel.tokenBirimi(48_000)).toBe("tokens");
  });

  it("Türkçe ekler yalnız Türkçe metinde", () => {
    expect(tr.karargah.brief.kime("Ada")).toBe("Ada'ya gönder");
    expect(tr.karargah.brief.kime("Kerem")).toBe("Kerem'e gönder");
    expect(en.karargah.brief.kime("Ada")).toBe("Send to Ada");
  });
});
