// Ad ile karakterin uyumu (0.0.8): adın cinsiyeti, karakterlerin cinsiyeti, işe alımda seçim, eski çalışanların
// bir kez düzeltilmesi ve ekip dosyasından içe aktarma
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AD_LISTELERI, adCinsiyeti, adSadelestir } from "@arnorg/ortak/cinsiyet";
import { bosKarakter, KARAKTERLER, karakterBul, karakterCinsiyeti, karakterSec } from "@arnorg/ortak/karakterler";
import { Depo } from "./depo.js";
import { celisiyor, iseAlimKarakteri, KARAKTER_UYUMU_GOCU } from "./karakter-uyumu.js";
import { OlayYolu } from "./olaylar.js";
import { ekipDosyalariniOku } from "./proje-dosyalari.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-karakter-uyumu-"));
afterAll(() => fs.rmSync(gecici, { recursive: true, force: true }));

describe("adın cinsiyeti", () => {
  it("Türkçe ve İngilizce adları tanır; yalnız ilk ada bakar", () => {
    for (const ad of ["Zeynep", "Elif", "Ece", "Ayşe", "Selin", "Defne", "Lale", "Ada", "Mary", "Emily", "Sophia", "Zeynep Kaya"]) expect(adCinsiyeti(ad), ad).toBe("kadin");
    for (const ad of ["Kerem", "Mert", "Burak", "Onur", "Emre", "Can", "John", "James", "Oliver", "Kerem Yılmaz", "Mehmet Ali"]) expect(adCinsiyeti(ad), ad).toBe("erkek");
  });

  it("iki cinsiyette de kullanılan ve tanınmayan adlar bilinmiyor", () => {
    for (const ad of ["Deniz", "Derin", "Ekin", "Umut", "Alex", "Sam", "Jordan", "Ege", "Kodcu", "R2D2", "", "   "]) expect(adCinsiyeti(ad), ad).toBeNull();
    expect(adCinsiyeti(null)).toBeNull();
    expect(adCinsiyeti(undefined)).toBeNull();
  });

  it("Türkçe İ/ı'yı doğru küçültür, aksanları yok sayar", () => {
    expect(adSadelestir("IŞIL")).toBe("isil");
    expect(adSadelestir("İrem")).toBe("irem");
    expect(adSadelestir("Gökhan")).toBe("gokhan");
    expect(adSadelestir("Zoë")).toBe("zoe");
    for (const ad of ["IŞIL", "Işıl", "isil", "İREM", "irem", "AYSE", "ayşe", "Zoe", "ZOË", "Chloé"]) expect(adCinsiyeti(ad), ad).toBe("kadin");
    for (const ad of ["İBRAHİM", "ibrahim", "Ilgaz", "ILGAZ", "Gokhan", "GÖKHAN", "Ugur", "Uğur", "ÖMER", "omer"]) expect(adCinsiyeti(ad), ad).toBe("erkek");
  });

  it("ad tire, nokta ya da alt çizgiyle bitişikse de ilk parça sayılır; unvanlar", () => {
    expect(adCinsiyeti("Ayşe-Nur")).toBe("kadin");
    expect(adCinsiyeti("kerem.y")).toBe("erkek");
    expect(adCinsiyeti("elif_2")).toBe("kadin");
    expect(adCinsiyeti("Dr. Elif")).toBe("kadin");
    expect(adCinsiyeti("Prof Mehmet")).toBe("erkek");
    expect(adCinsiyeti("Mr Smith")).toBe("erkek");
    expect(adCinsiyeti("Bayan Yıldırım")).toBe("kadin");
    expect(adCinsiyeti("Mimar Bey")).toBe("erkek");
    expect(adCinsiyeti("Pusula Hanım")).toBe("kadin");
    expect(adCinsiyeti("Deniz Bey")).toBeNull();
  });

  it("listeler çakışmaz", () => {
    const { kadin, erkek, ikisiDe } = AD_LISTELERI;
    expect(kadin.size).toBeGreaterThan(300);
    expect(erkek.size).toBeGreaterThan(300);
    expect([...kadin].filter((a) => erkek.has(a))).toEqual([]);
    // İki cinsiyette de kullanılan ad başka listede de olsa bilinmiyor sayılır; yine de listeler ayrık tutulur
    expect([...ikisiDe].filter((a) => kadin.has(a) || erkek.has(a))).toEqual([]);
  });
});

describe("karakterlerin cinsiyeti", () => {
  it("her karakterin görseline göre cinsiyeti var", () => {
    const beklenen: Record<string, "kadin" | "erkek"> = {
      k01: "kadin", k02: "erkek", k03: "erkek", k04: "kadin", k05: "kadin", k06: "erkek", k07: "kadin", k08: "erkek",
      k09: "kadin", k10: "erkek", k11: "kadin", k12: "erkek", k13: "kadin", k14: "erkek", k15: "kadin", k16: "kadin",
      k17: "erkek", k18: "kadin", k19: "erkek", k20: "kadin", k21: "erkek", k22: "erkek", k23: "kadin", k24: "erkek",
      k25: "kadin", k26: "kadin", k27: "erkek", k28: "kadin", k29: "kadin", k30: "erkek", k31: "kadin", k32: "erkek",
    };
    expect(Object.fromEntries(KARAKTERLER.map((k) => [k.id, k.cinsiyet]))).toEqual(beklenen);
    expect(karakterCinsiyeti("k16")).toBe("kadin");
    expect(karakterCinsiyeti("u-uretilmis-1")).toBeNull();
    expect(karakterCinsiyeti(null)).toBeNull();
  });

  it("lakabındaki Bey ya da Hanım cinsiyetiyle uyuşur", () => {
    const unvanli = KARAKTERLER.filter((k) => / (Bey|Hanım)$/.test(k.lakap));
    expect(unvanli.map((k) => k.id)).toEqual(["k02", "k16"]);
    for (const k of unvanli) expect(adCinsiyeti(k.lakap), k.id).toBe(k.cinsiyet);
    expect(karakterBul("k16")?.lakap).toBe("Pusula Hanım");
  });
});

describe("karakter seçimi", () => {
  it("adın cinsiyetine uyan boş karakterler arasında önce role uyan", () => {
    // Kadın backend: tek kadın backend karakteri k13; erkek CEO: k32
    expect(karakterSec("backend", [], "x", "kadin")).toBe("k13");
    expect(karakterSec("ceo", [], "x", "erkek")).toBe("k32");
    expect(karakterSec("cto", [], "x", "kadin")).toBe("k16");
    expect(karakterSec("cto", [], "x", "erkek")).toBe("k02");
    // Role uyan dolu: aynı cinsiyetteki ilk boş
    expect(karakterSec("backend", ["k13"], "x", "kadin")).toBe("k01");
    // Cinsiyet bilinmiyorsa yalnız rol (eski kural)
    expect(karakterSec("guvenlik", [], "x")).toBe("k07");
    expect(karakterSec("backend", [], "x", null)).toBe("k03");
  });

  it("aynı cinsiyette boş kalmayınca o cinsiyetten kararlı tekrar seçer, karşı cinsiyete geçmez", () => {
    const kadinlar = KARAKTERLER.filter((k) => k.cinsiyet === "kadin").map((k) => k.id);
    const s = karakterSec("frontend", kadinlar, "proje:Elif", "kadin");
    expect(karakterCinsiyeti(s)).toBe("kadin");
    expect(karakterSec("frontend", kadinlar, "proje:Elif", "kadin")).toBe(s);
    expect(bosKarakter(KARAKTERLER, "frontend", new Set(kadinlar), "kadin")).toBeNull();
  });

  it("işe alım: kurulun seçtiği korunur; içe aktarılan çelişen karakter uyumlusuyla değişir", () => {
    const ortak = { rol: "cto", kullanilan: ["k01"], tohum: "p:Kerem" };
    expect(iseAlimKarakteri({ ...ortak, ad: "Kerem", secilen: null, iceAktarma: false })).toBe("k02");
    expect(iseAlimKarakteri({ ...ortak, ad: "Kerem", secilen: "k16", iceAktarma: false })).toBe("k16");
    expect(iseAlimKarakteri({ ...ortak, ad: "Kerem", secilen: "k16", iceAktarma: true })).toBe("k02");
    expect(iseAlimKarakteri({ ...ortak, ad: "Deniz", secilen: "k16", iceAktarma: true })).toBe("k16");
    expect(iseAlimKarakteri({ ...ortak, ad: "Kerem", secilen: "u-ozel-karakter", iceAktarma: true })).toBe("u-ozel-karakter");
    expect(celisiyor("k16", "erkek")).toBe(true);
    expect(celisiyor("k16", null)).toBe(false);
    expect(celisiyor("u-x1234", "erkek")).toBe(false);
  });
});

describe("şirket", () => {
  it("işe alımda adla uyumlu karakter; eski çalışanlar bir kez düzelir, ekip dosyası da", async () => {
    const veri = path.join(gecici, "veri");
    const yap = new Yapilandirma(veri);
    const depo = new Depo(path.join(veri, "arnorg.db"));
    const sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    expect(depo.deger(KARAKTER_UYUMU_GOCU)).toBeTruthy();
    const p = await sirket.projeOlustur({ ad: "Uyum", yol: path.join(gecici, "repo"), olustur: true });
    const ceo = depo.ajanlar(p.id).find((a) => a.rol === "ceo")!;
    expect(ceo.ad).toBe("Ada");
    expect(ceo.karakter).toBe("k01");

    // Erkek adına erkek, kadın adına kadın karakter; bilinmeyen ad yalnız role göre
    const kerem = sirket.iseAl(p.id, { ad: "Kerem", rol: "cto" });
    expect(kerem.karakter).toBe("k02");
    const zeynep = sirket.iseAl(p.id, { ad: "Zeynep", rol: "backend" });
    expect(zeynep.karakter).toBe("k13");
    const mert = sirket.iseAl(p.id, { ad: "Mert", rol: "frontend" });
    expect(karakterCinsiyeti(mert.karakter)).toBe("erkek");
    const deniz = sirket.iseAl(p.id, { ad: "Deniz", rol: "backend" });
    expect(deniz.karakter).toBe("k03");
    // Kurulun açık seçimi adla çelişse de korunur
    const elif = sirket.iseAl(p.id, { ad: "Elif", rol: "frontend", karakter: "k24" });
    expect(elif.karakter).toBe("k24");

    // 0.0.7'den kalan çelişkiler: göç bir kez çalışır (göç kaydı silinerek eski veri taklit edilir)
    depo.ajanGuncelle(kerem.id, { karakter: "k16" });
    depo.ajanGuncelle(zeynep.id, { karakter: "k21" });
    sirket.kapat();
    depo.degerYaz(KARAKTER_UYUMU_GOCU, "");
    const sirket2 = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    expect(karakterCinsiyeti(depo.ajan(kerem.id)?.karakter)).toBe("erkek");
    expect(depo.ajan(kerem.id)?.karakter).toBe("k02");
    expect(depo.ajan(zeynep.id)?.karakter).toBe("k13");
    // Kurulun seçtiği çelişki de bu ilk göçte düzelir; adı, rolü ve modeli aynı kalır
    expect(karakterCinsiyeti(depo.ajan(elif.id)?.karakter)).toBe("kadin");
    expect(depo.ajan(elif.id)).toMatchObject({ ad: "Elif", rol: "frontend", model: elif.model });
    // Bilinmeyen ad ve uyumlu olanlar değişmez
    expect(depo.ajan(deniz.id)?.karakter).toBe("k03");
    expect(depo.ajan(ceo.id)?.karakter).toBe("k01");
    // Ekip dosyası yeni karakteri taşır
    expect(ekipDosyalariniOku(p.yol).find((k) => k.ad === "Kerem")?.karakter).toBe("k02");
    // Karakterler projede tekrar etmez
    const karakterler = depo.ajanlar(p.id).map((a) => a.karakter);
    expect(new Set(karakterler).size).toBe(karakterler.length);

    // Göçten sonra kurulun yeni seçimi kalıcıdır: yeniden açılış dokunmaz
    depo.ajanGuncelle(kerem.id, { karakter: "k16" });
    sirket2.kapat();
    const sirket3 = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    expect(depo.ajan(kerem.id)?.karakter).toBe("k16");
    sirket3.kapat();
    depo.kapat();
  });

  it("ekip dosyasından içe aktarılan, adla çelişen karakter uyumlusuyla değişir", async () => {
    const veri = path.join(gecici, "veri-ice");
    const yap = new Yapilandirma(veri);
    const repo = path.join(gecici, "repo-ice");
    fs.mkdirSync(path.join(repo, ".arnorg", "ekip"), { recursive: true });
    const dosya = (ad: string, rol: string, karakter: string) => `---\nad: ${ad}\nrol: ${rol}\nmodel: sonnet\nkarakter: ${karakter}\n---\n`;
    fs.writeFileSync(path.join(repo, ".arnorg", "ekip", "kerem.md"), dosya("Kerem", "cto", "k16"));
    fs.writeFileSync(path.join(repo, ".arnorg", "ekip", "ece.md"), dosya("Ece", "frontend", "k04"));
    fs.writeFileSync(path.join(repo, ".arnorg", "ekip", "deniz.md"), dosya("Deniz", "backend", "k25"));
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "-q", repo]);
    const depo = new Depo(path.join(veri, "arnorg.db"));
    const sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    const p = await sirket.projeOlustur({ ad: "İçe aktarma", yol: repo, olustur: false });
    const ajan = (ad: string) => depo.ajanlar(p.id).find((a) => a.ad === ad)!;
    expect(karakterCinsiyeti(ajan("Kerem").karakter)).toBe("erkek");
    expect(ajan("Ece").karakter).toBe("k04");
    expect(ajan("Deniz").karakter).toBe("k25");
    sirket.kapat();
    depo.kapat();
  });
});
