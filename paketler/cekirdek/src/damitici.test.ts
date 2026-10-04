// Global zekânın damıtıcısı: model yanıtının çözümü, istem ve gözlemlerin damıtılarak işlenmesi (sahte damıtıcıyla)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { damitmaIstemi, damitmaYanitiniCoz, type Damitici, type DamitmaSonucu } from "./damitici.js";
import { Depo } from "./depo.js";
import { KureselZeka } from "./kuresel-zeka.js";
import { OlayYolu } from "./olaylar.js";

const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-damitici-"));
let sayac = 0;
let depo: Depo;
/** Açılan veritabanları: Windows açık dosyayı silmez, temizlikten önce kapatılır */
const depolar: Depo[] = [];

function zeka(damitici: Damitici | null): KureselZeka {
  depo = new Depo(path.join(gecici, `${++sayac}.db`));
  depolar.push(depo);
  return new KureselZeka(depo, new OlayYolu(), gecici, damitici);
}

/** Sabit yanıtlı sahte damıtıcı; çağrıları sayar */
function sahte(yanit: (metin: string) => DamitmaSonucu) {
  const cagrilar: string[] = [];
  const d: Damitici = async (metin) => {
    cagrilar.push(metin);
    await new Promise((coz) => setTimeout(coz, 5));
    return yanit(metin);
  };
  return { d, cagrilar };
}

afterAll(() => {
  for (const d of depolar) d.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("damıtma yanıtı ve istemi", () => {
  it("RULE satırını kural, PROJECT'i projeye özgü sayar; gerisi belirsiz", () => {
    expect(damitmaYanitiniCoz("RULE: Write tests before merging any change.")).toEqual({ tur: "kural", metin: "Write tests before merging any change." });
    expect(damitmaYanitiniCoz('  rule:  "Keep the first release small."  \nek açıklama')).toEqual({ tur: "kural", metin: "Keep the first release small." });
    expect(damitmaYanitiniCoz("**RULE:** Birleştirmeden önce test yaz.")).toEqual({ tur: "kural", metin: "Birleştirmeden önce test yaz." });
    expect(damitmaYanitiniCoz("PROJECT")).toEqual({ tur: "ozgu" });
    expect(damitmaYanitiniCoz("project.")).toEqual({ tur: "ozgu" });
    expect(damitmaYanitiniCoz("I think this is a good rule")).toBeNull();
    expect(damitmaYanitiniCoz("RULE: kısa")).toBeNull();
    expect(damitmaYanitiniCoz(`RULE: ${"a".repeat(260)}`)).toBeNull();
    expect(damitmaYanitiniCoz("")).toBeNull();
  });

  it("istem çıktı dilini ve proje adını verir", () => {
    const tr = damitmaIstemi("Testsiz birleştirme yok.", { projeAd: "Not Defteri", dil: "tr" });
    expect(tr).toContain('from the project "Not Defteri"');
    expect(tr).toContain("in Turkish");
    expect(tr).toContain("Testsiz birleştirme yok.");
    expect(damitmaIstemi("No merge without tests.", { projeAd: null, dil: "en" })).toContain("in English");
  });
});

describe("gözlemin damıtılarak işlenmesi", () => {
  let k: KureselZeka;

  it("genelleştirilen kural o metinle açılır, özgün metin kanıt olarak kalır", async () => {
    const { d } = sahte(() => ({ tur: "kural", metin: "Keep the first release small and focused on its core features." }));
    k = zeka(d);
    const kural = await k.gozlemDamit({ metin: "Scope: Keep the first release small: add, list, delete notes. No bloat.", kaynak: "tercih", projeId: "p1", projeAd: "Tiny Notes" });
    expect(kural?.metin).toBe("Keep the first release small and focused on its core features.");
    expect(kural?.durum).toBe("etkin");
    expect(kural?.kanitlar[0]?.metin).toContain("add, list, delete notes");
  });

  it("projeye özgü gözlem elenir ve günlüğe yazılır", async () => {
    const { d } = sahte(() => ({ tur: "ozgu" }));
    k = zeka(d);
    expect(await k.gozlemDamit({ metin: "Notes are stored in a single JSON file in the home folder.", kaynak: "tercih", projeId: "p1", projeAd: "Tiny Notes" })).toBeNull();
    expect(depo.kurallar()).toHaveLength(0);
    expect(k.durum().gunluk[0]?.tur).toBe("eledi");
  });

  it("damıtılamayan ham gözlem kuruldan gelse de aday kalır; başka projede görülünce standart olur", async () => {
    const { d } = sahte(() => null);
    k = zeka(d);
    const ilk = await k.gozlemDamit({ metin: "Always write tests before merging anything to main.", kaynak: "kurul", projeId: "p1", projeAd: "A" });
    expect(ilk?.durum).toBe("aday");
    expect(ilk?.guven).toBe(0.5);
    const ikinci = await k.gozlemDamit({ metin: "Always write tests before merging changes to main.", kaynak: "tercih", projeId: "p2", projeAd: "B" });
    expect(ikinci?.id).toBe(ilk?.id);
    expect(ikinci?.durum).toBe("etkin");
  });

  it("aynı metin için model bir kez çağrılır; gözlemler sırayla işlenir", async () => {
    const { d, cagrilar } = sahte((m) => ({ tur: "kural", metin: m.includes("review") ? "Get a review before merging to main." : "Write a test for every bug fix." }));
    k = zeka(d);
    const [a, b, c] = await Promise.all([
      k.gozlemDamit({ metin: "Every bug fix needs a test in this team.", kaynak: "ogrenilen", projeId: "p1", projeAd: "A", guclu: true }),
      k.gozlemDamit({ metin: "Every bug fix needs a test in this team.", kaynak: "ogrenilen", projeId: "p1", projeAd: "A", guclu: true }),
      k.gozlemDamit({ metin: "Nothing goes to main without a review.", kaynak: "duzeltme", projeId: "p1", projeAd: "A" }),
    ]);
    // İkinci aynı gözlem ilki bitince önbellekten çözülür
    expect(cagrilar).toEqual(["Every bug fix needs a test in this team.", "Nothing goes to main without a review."]);
    expect(b?.id).toBe(a?.id);
    expect(c?.metin).toBe("Get a review before merging to main.");
    expect(depo.kurallar()).toHaveLength(2);
  });

  it("projeler arası benzer gözlemler damıtılmış metinde birleşir", async () => {
    const { d } = sahte(() => ({ tur: "kural", metin: "Write tests before merging any change to the main branch." }));
    k = zeka(d);
    const a = await k.gozlemDamit({ metin: "Quality: tests first, then merge (notes CLI).", kaynak: "ogrenilen", projeId: "p1", projeAd: "Tiny Notes" });
    const b = await k.gozlemDamit({ metin: "In the shop API we never merge without tests.", kaynak: "ogrenilen", projeId: "p2", projeAd: "Shop API" });
    expect(b?.id).toBe(a?.id);
    expect(b?.durum).toBe("etkin");
    expect(b?.kanitlar.map((x) => x.projeAd)).toEqual(["Tiny Notes", "Shop API"]);
  });

  it("damıtıcı yoksa gözlem olduğu gibi işlenir (eski davranış)", async () => {
    k = zeka(null);
    const kural = await k.gozlemDamit({ metin: "Always write tests before merging anything to main.", kaynak: "kurul", projeId: "p1", projeAd: "A" });
    expect(kural?.durum).toBe("etkin");
    expect(kural?.metin).toBe("Always write tests before merging anything to main.");
  });
});
