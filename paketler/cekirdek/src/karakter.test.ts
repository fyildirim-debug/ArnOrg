// Ofis karakterleri: işe alımda atama, eski ajanlara tamamlama, talimattaki kişilik
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { KARAKTERLER, karakterBul, karakterMetni, karakterSec } from "@arnorg/ortak/karakterler";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { kisilikMetni, Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-karakter-"));
afterAll(() => fs.rmSync(gecici, { recursive: true, force: true }));

describe("karakter kataloğu", () => {
  it("32 benzersiz karakter; her birinin kişiliği eksiksiz", () => {
    expect(KARAKTERLER).toHaveLength(32);
    expect(new Set(KARAKTERLER.map((k) => k.id)).size).toBe(32);
    for (const k of KARAKTERLER) {
      expect(k.id).toMatch(/^k\d{2}$/);
      expect(k.lakap && k.ozet && k.konusma && k.calisma && k.dikkat).toBeTruthy();
      expect(k.mizac).toHaveLength(3);
      expect(k.sozler.length).toBeGreaterThanOrEqual(3);
      expect(k.roller.length).toBeGreaterThan(0);
    }
  });

  it("her karakterin İngilizce metni eksiksiz; ad Türkçesiyle aynı kalır", () => {
    const turkceHarf = /[çğıöşüÇĞİÖŞÜ]/;
    for (const k of KARAKTERLER) {
      const en = k.en;
      expect(en, k.id).toBeDefined();
      if (!en) continue;
      // Ad kimliktir: görsel ve projedeki kayıtlı ajan adı ona bağlı
      expect(en.ad, k.id).toBe(k.ad);
      for (const alan of ["lakap", "ozet", "konusma", "calisma", "dikkat"] as const) {
        expect(en[alan].trim(), `${k.id}.${alan}`).not.toBe("");
        expect(en[alan], `${k.id}.${alan}`).not.toMatch(turkceHarf);
      }
      for (const alan of ["ozet", "konusma", "calisma", "dikkat"] as const) expect(en[alan], `${k.id}.${alan}`).not.toBe(k[alan]);
      expect(en.mizac, k.id).toHaveLength(3);
      expect(en.sozler, k.id).toHaveLength(k.sozler.length);
      for (const m of [...en.mizac, ...en.sozler]) {
        expect(m.trim(), k.id).not.toBe("");
        expect(m, k.id).not.toMatch(turkceHarf);
      }
      expect(karakterMetni(k, "en")).toBe(en);
      expect(karakterMetni(k, "tr")).toMatchObject({ ad: k.ad, lakap: k.lakap, sozler: k.sozler });
    }
  });

  it("role uyan boş karakteri seçer; hepsi doluysa kimlikten türetir", () => {
    expect(karakterSec("guvenlik", [], "x")).toBe("k07");
    expect(karakterSec("guvenlik", ["k07"], "x")).toBe("k20");
    const hepsi = KARAKTERLER.map((k) => k.id);
    expect(hepsi).toContain(karakterSec("test", hepsi, "tohum"));
  });

  it("kişilik metni lakabı, üslubu ve kuralların önceliğini içerir", () => {
    const m = kisilikMetni("k05");
    expect(m).toContain("Büyüteç");
    expect(m).toContain("Üslup:");
    expect(m).toContain("kurallar");
    expect(kisilikMetni(null)).toBe("");
    expect(karakterBul("k99")).toBeUndefined();
  });
});

describe("şirket", () => {
  it("işe alımda karakter atar, seçileni korur; eski karakter boşluklarını açılışta doldurur", async () => {
    const veri = path.join(gecici, "veri");
    const yap = new Yapilandirma(veri);
    const depo = new Depo(path.join(veri, "arnorg.db"));
    const sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    const p = await sirket.projeOlustur({ ad: "Karakter", yol: path.join(gecici, "repo"), olustur: true });
    const ceo = depo.ajanlar(p.id).find((a) => a.rol === "ceo")!;
    expect(ceo.karakter).toBe("k01");
    const deniz = sirket.iseAl(p.id, { ad: "Deniz", rol: "backend" });
    expect(deniz.karakter).toBe("k03");
    const elif = sirket.iseAl(p.id, { ad: "Elif", rol: "frontend", karakter: "k24" });
    expect(elif.karakter).toBe("k24");

    // Eski sürümden kalan karakteri boş ajan: yeniden açılışta tamamlanır
    depo.ajanGuncelle(deniz.id, { karakter: null });
    sirket.kapat();
    const sirket2 = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    expect(depo.ajan(deniz.id)?.karakter).toBe("k03");
    sirket2.kapat();
    depo.kapat();
  });
});
