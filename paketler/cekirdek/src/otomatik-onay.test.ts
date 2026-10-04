// Otomatik onayın varsayılan kapsamı (0.0.4): birleştirme kurula kalır, projede kaydedilmiş seçim korunur
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ONAY_TURLERI, VARSAYILAN_OTOMATIK_ONAY_TURLERI, type Ajan } from "@arnorg/ortak";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

describe("otomatik onayın varsayılan kapsamı", () => {
  let gecici: string;
  let depo: Depo;
  let sirket: Sirket;
  let pid: string;
  let ceo: Ajan;

  beforeAll(async () => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-oto-onay-"));
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    const p = await sirket.projeOlustur({ ad: "Kapsam", yol: path.join(gecici, "repo"), olustur: true });
    pid = p.id;
    ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
  });

  afterAll(() => {
    sirket.kapat();
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true });
  });

  it("birleştirme, genel soru ve teslim varsayılan kapsamda değil", () => {
    expect(VARSAYILAN_OTOMATIK_ONAY_TURLERI).toEqual(["arac", "ise_alim", "anayasa", "isten_cikarma"]);
    expect(VARSAYILAN_OTOMATIK_ONAY_TURLERI.every((t) => ONAY_TURLERI.includes(t))).toBe(true);
    // Hiç ayarlanmamış proje boş listeyle gelir (Stüdyo işaretlenince varsayılanı gönderir); çekirdek bir şey eklemez
    expect(depo.proje(pid)?.otomatikOnay).toEqual({ etkin: false, turler: [] });
  });

  it("varsayılan kapsamla açılan projede birleştirme teklifi kurulu bekler, işe alım kendiliğinden verilir", async () => {
    await sirket.projeGuncelle(pid, { otomatikOnay: { etkin: true, turler: [...VARSAYILAN_OTOMATIK_ONAY_TURLERI] } });
    const birlestirme = sirket.teklifAc(ceo, "birlestirme", "Birleştirme: arnorg/deniz", "Özet", { ajanId: ceo.id, dal: "arnorg/deniz", ozet: "Özet" });
    const iseAlim = sirket.teklifAc(ceo, "ise_alim", "İşe alım: Mert", "Test gerek", { ad: "Mert", rol: "test" });
    await new Promise((r) => setTimeout(r, 50));
    expect(depo.onay(birlestirme.id)?.durum).toBe("bekliyor");
    expect(depo.onay(iseAlim.id)?.durum).toBe("onaylandi");
    await sirket.onayKarari(birlestirme.id, "reddet", "Deneme");
  });

  it("projede kaydedilmiş seçim korunur: birleştirmeyi seçmiş proje yeniden açılınca da onu kapsar", async () => {
    await sirket.projeGuncelle(pid, { otomatikOnay: { etkin: true, turler: ["arac", "birlestirme"] } });
    const ikinci = new Depo(path.join(gecici, "veri", "arnorg.db"));
    try {
      expect(ikinci.proje(pid)?.otomatikOnay).toEqual({ etkin: true, turler: ["arac", "birlestirme"] });
    } finally {
      ikinci.kapat();
    }
  });
});
