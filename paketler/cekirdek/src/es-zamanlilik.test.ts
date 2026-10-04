// Eşzamanlı ajan tavanı: tavan, FIFO sıra, muafiyet, yer açılınca teslim ve 0 = sınırsız (oturumsuz, sahte bağlam)
import type { AjanDurumu } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";
import { calisanMi, EsZamanlilik, siraAciklamasi, siraAciklamasiMi, tavanDegeri } from "./es-zamanlilik.js";

/** Bellekte ajan durumları; teslim ajanı hemen çalışan duruma alır (Şirket'teki gibi) */
function sahne(tavan = 2) {
  const durumlar = new Map<string, AjanDurumu>();
  const teslimler: [string, string[]][] = [];
  const siralar: [string, boolean][] = [];
  const ayar = { tavan };
  const ez = new EsZamanlilik<string>(
    {
      tavan: () => ayar.tavan,
      durum: (id) => durumlar.get(id) ?? null,
      calisanSayisi: () => [...durumlar.values()].filter(calisanMi).length,
      teslimEt: (id, mesajlar) => {
        teslimler.push([id, mesajlar.map((m) => m.metin)]);
        durumlar.set(id, "calisiyor");
      },
      siraDegisti: (id, sirada) => siralar.push([id, sirada]),
      zamanla: (is) => is(),
    },
    0,
  );
  /** ajanaMesaj'daki karar: turu sürmeyen ajana muaf olmayan mesaj tavan doluysa sıraya girer, yoksa hemen gider */
  const mesaj = (ajanId: string, metin: string, muaf = false) => {
    if (!calisanMi(durumlar.get(ajanId)) && ez.siraGerekli(muaf)) {
      ez.ekle({ ajanId, metin, oncelik: "next", kaynak: "sistem" });
      return "sira";
    }
    const onceki = ez.ajaninkileriAl(ajanId).map((m) => m.metin);
    teslimler.push([ajanId, [...onceki, metin]]);
    durumlar.set(ajanId, "calisiyor");
    return "teslim";
  };
  /** Durum değişikliği (Şirket.durumDegisti'nin kancası) */
  const durum = (ajanId: string, yeni: AjanDurumu) => {
    const onceki = durumlar.get(ajanId) ?? "kapali";
    durumlar.set(ajanId, yeni);
    ez.durumDegisti(ajanId, onceki, yeni);
  };
  for (const id of ["a", "b", "c", "d", "e"]) durumlar.set(id, "kapali");
  return { ez, durumlar, teslimler, siralar, ayar, mesaj, durum };
}

describe("eşzamanlı ajan tavanı", () => {
  it("çalışan sayısı tavana ulaşınca turu sürmeyen ajana gelen mesaj sıraya girer; karar bekleyen de çalışan sayılır", () => {
    const s = sahne(2);
    expect(s.mesaj("a", "a1")).toBe("teslim");
    s.durum("b", "karar_bekliyor");
    expect(s.mesaj("c", "c1")).toBe("sira");
    expect(s.ez.siradaMi("c")).toBe(true);
    expect(s.siralar).toEqual([["c", true]]);
    expect(s.teslimler).toEqual([["a", ["a1"]]]);
  });

  it("FIFO: yer açılınca önce ilk gelen ajan gider; aynı ajanın mesajları geliş sırasıyla birlikte teslim edilir", () => {
    const s = sahne(2);
    s.durum("a", "calisiyor");
    s.durum("b", "calisiyor");
    s.mesaj("c", "c1");
    s.mesaj("d", "d1");
    s.mesaj("c", "c2");
    s.mesaj("e", "e1");
    expect(s.ez.siradakiler()).toEqual(["c", "d", "e"]);
    // a boşa çıktı: bir yer açıldı, yalnız c (iki mesajı sırasıyla) gider
    s.durum("a", "bosta");
    expect(s.teslimler).toEqual([["c", ["c1", "c2"]]]);
    expect(s.ez.siradakiler()).toEqual(["d", "e"]);
    // b kapandı: sıradaki d gider, e bekler
    s.durum("b", "kapali");
    expect(s.teslimler.at(-1)).toEqual(["d", ["d1"]]);
    expect(s.ez.siradakiler()).toEqual(["e"]);
    // Duraklatılan ve hataya düşen ajan da yer açar
    s.durum("c", "duraklatildi");
    expect(s.teslimler.at(-1)).toEqual(["e", ["e1"]]);
    expect(s.ez.uzunluk).toBe(0);
  });

  it("önünde bekleyen varken yer olsa da yeni mesaj sıranın sonuna girer (sıra atlanmaz)", () => {
    const s = sahne(1);
    s.durum("a", "calisiyor");
    s.mesaj("b", "b1");
    // Yer açıldı ama sıra henüz işlenmedi (ör. aynı döngüde): yeni gelen sıradakini geçemez
    s.durumlar.set("a", "bosta");
    expect(s.mesaj("c", "c1")).toBe("sira");
    s.ez.isle();
    expect(s.teslimler).toEqual([["b", ["b1"]]]);
    expect(s.ez.siradakiler()).toEqual(["c"]);
  });

  it("muaf mesaj (kurul, soru yanıtı) tavan dolu olsa da hemen gider; sıradaki eski mesajları da önce teslim edilir", () => {
    const s = sahne(1);
    s.durum("a", "calisiyor");
    s.mesaj("b", "b1");
    expect(s.mesaj("b", "soru", true)).toBe("teslim");
    expect(s.teslimler).toEqual([["b", ["b1", "soru"]]]);
    expect(s.ez.siradaMi("b")).toBe(false);
    // Tavan aşılmış olur; aşım bitene dek muaf olmayan herkes bekler
    expect(s.mesaj("c", "c1")).toBe("sira");
    s.durum("a", "bosta");
    expect(s.ez.siradaMi("c")).toBe(true);
    s.durum("b", "bosta");
    expect(s.teslimler.at(-1)).toEqual(["c", ["c1"]]);
  });

  it("0 sınırsızdır: hiçbir mesaj beklemez; tavan sonradan kaldırılırsa sıradakilerin hepsi gider", () => {
    const s = sahne(0);
    for (const id of ["a", "b", "c", "d", "e"]) expect(s.mesaj(id, `${id}1`)).toBe("teslim");
    const t = sahne(1);
    t.durum("a", "calisiyor");
    t.mesaj("b", "b1");
    t.mesaj("c", "c1");
    t.ayar.tavan = 0;
    expect(t.ez.isle()).toEqual(["b", "c"]);
    expect(tavanDegeri(0)).toBe(0);
    expect(tavanDegeri(-3)).toBe(0);
    expect(tavanDegeri(Number.NaN)).toBe(0);
    expect(tavanDegeri(2.7)).toBe(2);
  });

  it("kendiliğinden çalışmaya başlayan sıradaki ajanın mesajları yer tutmadan gider; silinen ajanınki düşer", () => {
    const s = sahne(1);
    s.durum("a", "calisiyor");
    s.mesaj("b", "b1");
    s.mesaj("c", "c1");
    s.durum("b", "calisiyor");
    expect(s.teslimler).toEqual([["b", ["b1"]]]);
    s.durumlar.delete("c");
    s.durum("a", "bosta");
    expect(s.ez.uzunluk).toBe(0);
    expect(s.teslimler).toHaveLength(1);
  });

  it("kurul durdurunca sıradaki mesajlar düşer ve sıra açıklaması kalkar; teslim başlamazsa da kalkar", () => {
    const s = sahne(1);
    s.durum("a", "calisiyor");
    s.mesaj("b", "b1");
    s.mesaj("c", "c1");
    expect(s.ez.dusur((id) => id === "b")).toEqual(["b"]);
    expect(s.siralar).toEqual([
      ["b", true],
      ["c", true],
      ["b", false],
    ]);
    // Teslim ajanı başlatamadı (abonelik sınırı): açıklama temizlenir
    const t = new EsZamanlilik<string>(
      { tavan: () => 1, durum: () => "kapali", calisanSayisi: () => 0, teslimEt: () => undefined, siraDegisti: (id, sirada) => s.siralar.push([id, sirada]), zamanla: (is) => is() },
      0,
    );
    t.ekle({ ajanId: "x", metin: "x1", oncelik: "next", kaynak: "sistem" });
    t.isle();
    expect(s.siralar.slice(-2)).toEqual([
      ["x", true],
      ["x", false],
    ]);
  });

  it("sıra açıklaması iki dilli ve tanınır", () => {
    expect(siraAciklamasi(3)).toBe("Sırada: aynı anda en çok 3 ajan çalışır");
    expect(siraAciklamasiMi("Sırada: aynı anda en çok 3 ajan çalışır")).toBe(true);
    expect(siraAciklamasiMi("Queued: at most 3 agents work at the same time")).toBe(true);
    expect(siraAciklamasiMi("Komut: npm test")).toBe(false);
  });
});
