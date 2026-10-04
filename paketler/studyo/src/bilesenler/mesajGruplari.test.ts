// Sohbet yardımcıları: güne ayırma ve birleştirme, alıntı, kanallardan birleşik akış
import type { Mesaj } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";
import { akistaBirlestir, alintiAyir, alintiyla, gunEtiketi, gunlereAyir } from "./mesajGruplari";

function mesaj(id: string, kanal: string, gonderenId: string, zaman: string, metin = id): Mesaj {
  return { id, projeId: "p", kanal, gonderenId, gonderenAd: gonderenId, metin, anilanlar: [], zaman };
}

describe("gunlereAyir", () => {
  it("güne ayırır, aynı göndericinin yakın mesajlarını birleştirir", () => {
    const gruplar = gunlereAyir(
      [
        mesaj("1", "yonetim", "ada", "2026-10-03T22:00:00.000Z"),
        mesaj("2", "yonetim", "ada", "2026-10-04T08:00:00.000Z"),
        mesaj("3", "yonetim", "ada", "2026-10-04T08:03:00.000Z"),
        mesaj("4", "yonetim", "kurul", "2026-10-04T08:04:00.000Z"),
        mesaj("5", "yonetim", "kurul", "2026-10-04T08:20:00.000Z"),
      ],
      (z) => z.slice(0, 10),
    );
    expect(gruplar.map((g) => g.gun)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(gruplar[1]!.mesajlar.map((x) => x.devam)).toEqual([false, true, false, false]);
  });

  it("birleşme süresi başlıklı ilk mesajdan sayılır", () => {
    const dakika = (n: number) => new Date(Date.UTC(2026, 9, 4, 8, n)).toISOString();
    const gruplar = gunlereAyir(
      [0, 2, 4, 6, 8].map((n) => mesaj(`m${n}`, "yonetim", "ada", dakika(n))),
      (z) => z.slice(0, 10),
    );
    expect(gruplar[0]!.mesajlar.map((x) => x.devam)).toEqual([false, true, true, false, true]);
  });
});

describe("gunEtiketi", () => {
  it("bugün ve dün adıyla, diğer günler olduğu gibi", () => {
    const gun = (z: string) => z.slice(0, 10);
    const simdi = Date.parse("2026-10-04T12:00:00.000Z");
    const s = { bugun: "Bugün", dun: "Dün" };
    expect(gunEtiketi("2026-10-04", gun, s, simdi)).toBe("Bugün");
    expect(gunEtiketi("2026-10-03", gun, s, simdi)).toBe("Dün");
    expect(gunEtiketi("2026-09-30", gun, s, simdi)).toBe("2026-09-30");
  });
});

describe("alıntı", () => {
  it("baştaki > satırlarını ayırır", () => {
    expect(alintiAyir("> Ödeme altyapısı için öneri\n\nEvet, iyzico ile başla.")).toEqual({
      alinti: "Ödeme altyapısı için öneri",
      govde: "Evet, iyzico ile başla.",
    });
    expect(alintiAyir("Düz mesaj\n> içerde")).toEqual({ alinti: null, govde: "Düz mesaj\n> içerde" });
  });

  it("alintiyla ve alintiAyir birbirinin tersidir", () => {
    const metin = alintiyla("Haftalık durum", "Teşekkürler; riski izleyelim.");
    expect(metin).toBe("> Haftalık durum\n\nTeşekkürler; riski izleyelim.");
    expect(alintiAyir(metin)).toEqual({ alinti: "Haftalık durum", govde: "Teşekkürler; riski izleyelim." });
    expect(alintiyla(null, "x")).toBe("x");
  });
});

describe("akistaBirlestir", () => {
  it("dışarıdaki kanalı atlar, zamana göre sıralar ve sınırlar", () => {
    const akis = akistaBirlestir(
      {
        genel: [mesaj("g1", "genel", "ada", "2026-10-04T08:00:00.000Z"), mesaj("g2", "genel", "kerem", "2026-10-04T08:05:00.000Z")],
        yonetim: [mesaj("y1", "yonetim", "kurul", "2026-10-04T08:06:00.000Z")],
        muhendislik: [mesaj("m1", "muhendislik", "deniz", "2026-10-04T08:02:00.000Z")],
      },
      ["genel", "yonetim", "muhendislik", "toplanti"],
      ["yonetim"],
      2,
    );
    expect(akis.map((m) => m.id)).toEqual(["m1", "g2"]);
  });
});
