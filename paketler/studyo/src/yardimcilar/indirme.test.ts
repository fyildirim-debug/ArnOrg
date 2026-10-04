import { describe, expect, it } from "vitest";
import { dosyaAdiOku } from "./indirme";

describe("dosyaAdiOku", () => {
  it("tırnaklı ve tırnaksız filename değerini okur", () => {
    expect(dosyaAdiOku('attachment; filename="arnorg-denetim-siparis-paneli-2026-10-04.jsonl"')).toBe("arnorg-denetim-siparis-paneli-2026-10-04.jsonl");
    expect(dosyaAdiOku("attachment; filename=denetim.jsonl")).toBe("denetim.jsonl");
  });

  it("UTF-8 adı öne alır, klasör ayraçlarını atar", () => {
    expect(dosyaAdiOku(`attachment; filename="denetim.jsonl"; filename*=UTF-8''s%C4%B1nav%2Fdenetim.jsonl`)).toBe("sınav_denetim.jsonl");
    expect(dosyaAdiOku('attachment; filename="../../.bashrc"')).toBe(".._.._.bashrc");
  });

  it("başlık ya da ad yoksa null", () => {
    expect(dosyaAdiOku(null)).toBeNull();
    expect(dosyaAdiOku("attachment")).toBeNull();
    expect(dosyaAdiOku('attachment; filename=""')).toBeNull();
  });
});
