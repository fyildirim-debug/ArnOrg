// Rol kataloğu: her rolün İngilizce adı, açıklaması ve talimatı Türkçesiyle aynı kuralları ve araçları taşır
import { GOREV_DURUMLARI, HAFIZA_TURU_ADLARI, kanalGorunenAdi, rolMetni, SISTEM_KANALLARI } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";
import { ROLLER } from "./roller.js";

const kume = (metin: string, desen: RegExp) => new Set([...metin.matchAll(desen)].map((m) => m[1] ?? m[0]));
/** mcp__arnorg__ önekli araç adları */
const mcpAraclari = (m: string) => kume(m, /mcp__arnorg__[a-z_]+/g);
/** Talimatta geçen bütün araç adları (gorev_guncelle, hafiza_kaydet… alt çizgili tanımlayıcılar) */
const aracAdlari = (m: string) => kume(m, /\b[a-z]+(?:_{1,2}[a-z]+)+\b/g);
/** Tırnak içindeki API değerleri: 'inceleme', 'calisiliyor' */
const tirnakli = (m: string) => kume(m, /'([a-z_]+)'/g);
const kanallar = (m: string) => kume(m, /#([a-z]+)/g);
const notYollari = (m: string) => kume(m, /\bnotlar\/[a-z/]*/g);
const turkceHarf = /[çğıöşüÇĞİÖŞÜ]/;

describe("rol kataloğu İngilizcesi", () => {
  it("her rolde İngilizce ad, açıklama ve talimat var; rolMetni dile göre seçer", () => {
    for (const r of ROLLER) {
      expect(r.en, r.kimlik).toBeDefined();
      if (!r.en) continue;
      for (const alan of ["ad", "aciklama", "talimat"] as const) {
        expect(r.en[alan].trim(), `${r.kimlik}.${alan}`).not.toBe("");
        expect(r.en[alan], `${r.kimlik}.${alan}`).not.toMatch(turkceHarf);
      }
      expect(rolMetni(r, "en")).toBe(r.en);
      expect(rolMetni(r, "tr")).toEqual({ ad: r.ad, aciklama: r.aciklama, talimat: r.talimat });
    }
    expect(new Set(ROLLER.map((r) => r.en?.ad)).size).toBe(ROLLER.length);
  });

  it("İngilizce talimattaki mcp__arnorg__ araç adları Türkçedekilerle aynı küme", () => {
    for (const r of ROLLER) expect(mcpAraclari(r.en!.talimat), r.kimlik).toEqual(mcpAraclari(r.talimat));
  });

  it("aynı araçlar, aynı sırada aynı sayıda kural", () => {
    for (const r of ROLLER) {
      expect(aracAdlari(r.en!.talimat), r.kimlik).toEqual(aracAdlari(r.talimat));
      expect(r.en!.talimat.split("\n"), r.kimlik).toHaveLength(r.talimat.split("\n").length);
    }
  });

  it("görev durumları API değeriyle, kanallar görünen adıyla, not yolları aynen geçer", () => {
    const apiDegerleri = new Set<string>([...GOREV_DURUMLARI, ...Object.keys(HAFIZA_TURU_ADLARI)]);
    for (const r of ROLLER) {
      const en = r.en!.talimat;
      // Türkçede tırnaklı her durum İngilizcede de tırnaklı; İngilizcede tırnaklanan her değer araçların beklediği bir değer
      for (const d of tirnakli(r.talimat)) expect(tirnakli(en), r.kimlik).toContain(d);
      for (const d of tirnakli(en)) expect(apiDegerleri, `${r.kimlik}: '${d}'`).toContain(d);
      expect([...kanallar(en)].sort(), r.kimlik).toEqual([...kanallar(r.talimat)].map((k) => kanalGorunenAdi(k, "en")).sort());
      for (const k of SISTEM_KANALLARI) if (kanalGorunenAdi(k, "en") !== k) expect(en, r.kimlik).not.toContain(`#${k}`);
      expect(notYollari(en), r.kimlik).toEqual(notYollari(r.talimat));
    }
  });
});
