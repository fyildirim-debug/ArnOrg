// Ofis karakterleri: işe alımda atama, eski ajanlara tamamlama, talimattaki kişilik
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { KARAKTERLER, karakterBul, karakterSec } from "@arnorg/ortak/karakterler";
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
