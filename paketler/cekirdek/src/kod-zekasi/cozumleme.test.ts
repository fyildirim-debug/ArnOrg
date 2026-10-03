import { describe, expect, it } from "vitest";
import { IceAktarmaCozucu, goModulu, paketBilgisi } from "./cozucu.js";
import type { DosyaKaydi, IceAktarmaKaydi, SembolKaydi } from "./depo.js";
import { dilTani } from "./diller.js";
import { sahteVektor } from "./gomucu.js";
import { grafikKur, haritaAgaci, haritaMetni } from "./harita.js";
import { kesitSec, sorguTerimleri, tanimlayiciParcala } from "./metin.js";
import { PARCA_EN_COK_SATIR, gommeMetni, parcala } from "./parcalayici.js";
import { cozumle } from "./semboller.js";
import { enYakinlar, gizliDosyaMi } from "./yonetici.js";

const TS = `import { a, b as c } from "./a.js";
import type { T } from "@arnorg/ortak";
const x = require("fs");
export const SABIT = 3;
// function yorumdaki() {}
const metin = "function dizgedeki() {}";
export interface Arayuz {
  alan: string;
}
export type Tur = { a: number };
export enum Renk { Kirmizi, Mavi }
export class Sinif extends Taban {
  private alan = 1;
  constructor(private x: number) { super(); }
  async metod(a: string): Promise<void> {
    if (a) { return; }
  }
  static get deger() { return 1; }
}
export async function fonksiyon(a: number) {
  return a + 1;
}
export const ok = (a: number) => a * 2;
function ic() {}
`;

describe("dil tanıma ve gizli dosyalar", () => {
  it("kod ve metin dosyaları tanınır; üretilmiş, kilit ve ikili dosyalar atlanır", () => {
    expect(dilTani("src/a.ts")?.aile).toBe("ts");
    expect(dilTani("app/modeller.py")?.aile).toBe("py");
    expect(dilTani("Dockerfile")?.aile).toBe("metin");
    expect(dilTani("docs/README.md")?.aile).toBe("md");
    expect(dilTani("node_modules/x/index.js")).toBeNull();
    expect(dilTani("paketler/studyo/dist/app.js")).toBeNull();
    expect(dilTani("package-lock.json")).toBeNull();
    expect(dilTani("public/app.min.js")).toBeNull();
    expect(dilTani("resim.png")).toBeNull();
    expect(dilTani("veri.json")!.sinir).toBeLessThan(dilTani("a.ts")!.sinir);
  });

  it("ortam dosyaları ve kimlik bilgileri dizine girmez", () => {
    expect(gizliDosyaMi(".env")).toBe(true);
    expect(gizliDosyaMi("ayar/.env.local")).toBe(true);
    expect(gizliDosyaMi(".env.example")).toBe(false);
    expect(gizliDosyaMi("ayar/credentials.json")).toBe(true);
    expect(gizliDosyaMi("src/secrets.yaml")).toBe(true);
    expect(gizliDosyaMi("anahtarlar/sunucu.pem")).toBe(true);
    expect(gizliDosyaMi("src/app.ts")).toBe(false);
  });
});

describe("metin yardımcıları", () => {
  it("tanımlayıcılar sözcüklerine bölünür, Türkçe harfler sadeleşir", () => {
    expect(tanimlayiciParcala("hafizaAra")).toEqual(["hafiza", "ara"]);
    expect(tanimlayiciParcala("HTTPSunucusu")).toEqual(["http", "sunucusu"]);
    expect(tanimlayiciParcala("kod_ara")).toEqual(["kod", "ara"]);
    expect(tanimlayiciParcala("ÇalışmaAlanı")).toEqual(["calisma", "alani"]);
  });

  it("sorgu terimleri: durak sözcükler atılır, uzun sözcüğe önek eklenir", () => {
    const t = sorguTerimleri("ajanlar arası soru nasıl yönlendiriliyor");
    expect(t.terimler).toContain("ajanlar");
    expect(t.terimler).not.toContain("nasil");
    expect(t.terimler.some((x) => x.startsWith("yonlendi") && x.length < "yonlendiriliyor".length)).toBe(true);
    expect(t.ifade).toContain(" OR ");
    expect(sorguTerimleri("ve ile için").ifade).toBeNull();
    expect(sorguTerimleri("hafizaAra nerede").adlar).toEqual(["hafizaAra"]);
  });

  it("kesit terimlerin geçtiği pencereyi seçer; terim yoksa ilk anlamlı satırdan başlar", () => {
    const satirlar = Array.from({ length: 100 }, (_, i) => (i === 70 ? "const hedef = bul();" : `satir ${i}`));
    const k = kesitSec(satirlar, 1, 100, ["hedef"], 10);
    expect(k.kesit).toContain("hedef");
    expect(k.kesitBas).toBe(69);
    const kapanis = ["  });", "});", "", "function sonraki() {", "  return 1;", "}"];
    expect(kesitSec(kapanis, 1, 6, [], 20).kesitBas).toBe(4);
  });
});

describe("sembol çıkarımı", () => {
  it("TypeScript: tanımlar, sınıf üyeleri, dışa açıklık ve içe aktarmalar; yorum ve dizge içi sayılmaz", () => {
    const c = cozumle(TS, "ts");
    const bul = (ad: string) => c.semboller.find((s) => s.ad === ad);
    expect(bul("Sinif")).toMatchObject({ tur: "sinif", disaAcik: true, bas: 12, bit: 19 });
    expect(bul("metod")).toMatchObject({ tur: "metod", ust: "Sinif", bas: 15, bit: 17 });
    expect(bul("fonksiyon")).toMatchObject({ tur: "fonksiyon", disaAcik: true, bas: 20, bit: 22 });
    expect(bul("ok")?.tur).toBe("fonksiyon");
    expect(bul("ic")?.disaAcik).toBe(false);
    expect(bul("Arayuz")?.tur).toBe("arayuz");
    expect(bul("Tur")?.tur).toBe("tur");
    expect(bul("Renk")?.tur).toBe("enum");
    expect(bul("SABIT")?.tur).toBe("sabit");
    expect(bul("yorumdaki")).toBeUndefined();
    expect(bul("dizgedeki")).toBeUndefined();
    expect(c.iceAktarmalar.map((i) => i.kaynak)).toEqual(["./a.js", "@arnorg/ortak", "fs"]);
    expect(c.iceAktarmalar[0]!.adlar).toEqual(["a", "b"]);
  });

  it("Python, Go, Rust, Java, Markdown ve CSS", () => {
    const py = cozumle("import os\nfrom .modeller import Kullanici\nclass Hizmet(Taban):\n    def calistir(self, a):\n        return a\n\ndef yardimci(x):\n    return x\n", "py");
    expect(py.semboller.map((s) => `${s.tur}:${s.ust ? `${s.ust}.` : ""}${s.ad}:${s.bas}-${s.bit}`)).toEqual(["sinif:Hizmet:3-5", "metod:Hizmet.calistir:4-5", "fonksiyon:yardimci:7-8"]);
    expect(py.iceAktarmalar.map((i) => i.kaynak)).toEqual(["os", ".modeller"]);

    const go = cozumle('package main\n\nimport (\n\t"fmt"\n\t"ornek.com/app/depo"\n)\n\ntype Sunucu struct {\n\tad string\n}\n\nfunc (s *Sunucu) Baslat() error {\n\treturn nil\n}\n', "go");
    expect(go.semboller.find((s) => s.ad === "Baslat")).toMatchObject({ tur: "metod", ust: "Sunucu", disaAcik: true });
    expect(go.semboller.find((s) => s.ad === "Sunucu")?.tur).toBe("yapi");
    expect(go.iceAktarmalar.map((i) => i.kaynak)).toEqual(["fmt", "ornek.com/app/depo"]);

    const rs = cozumle("use crate::depo::Kayit;\npub struct Yapi { a: i32 }\nimpl Yapi {\n    pub fn yeni() -> Self { Yapi { a: 1 } }\n}\nfn ozel() {}\n", "rs");
    expect(rs.semboller.find((s) => s.ad === "yeni")).toMatchObject({ tur: "metod", ust: "Yapi" });
    expect(rs.semboller.find((s) => s.ad === "ozel")?.disaAcik).toBe(false);

    const java = cozumle("package com.ornek;\nimport com.ornek.depo.Kayit;\npublic class Hizmet {\n    public void calistir(String a) {\n        System.out.println(a);\n    }\n}\n", "java");
    expect(java.semboller.find((s) => s.ad === "calistir")).toMatchObject({ tur: "metod", ust: "Hizmet", bas: 4, bit: 6 });

    const md = cozumle("# Başlık\nMetin.\n## Alt başlık\nDaha çok metin.\n", "md");
    expect(md.semboller.map((s) => [s.ad, s.tur, s.bas, s.bit])).toEqual([
      ["Başlık", "baslik", 1, 4],
      ["Alt başlık", "baslik", 3, 4],
    ]);

    const css = cozumle('@import "./taban.css";\n.dugme { color: red; }\n', "css");
    expect(css.semboller.some((s) => s.ad === ".dugme" && s.tur === "secici")).toBe(true);
    expect(css.iceAktarmalar[0]?.kaynak).toBe("./taban.css");
  });
});

describe("içe aktarma çözümü", () => {
  const dosyalar = [
    "paketler/ortak/package.json",
    "paketler/ortak/src/index.ts",
    "src/a.ts",
    "src/b/index.ts",
    "src/c.tsx",
    "app/__init__.py",
    "app/modeller.py",
    "app/servis/__init__.py",
    "app/servis/hizmet.py",
    "stil/taban.css",
    "stil/ana.css",
    "cmd/sunucu/main.go",
    "internal/depo/depo.go",
  ];
  const kume = new Set(dosyalar);
  const paket = paketBilgisi("paketler/ortak/package.json", JSON.stringify({ name: "@arnorg/ortak", exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } } }), kume)!;
  const c = new IceAktarmaCozucu({ dosyalar, paketler: new Map([[paket.ad, paket.bilgi]]), goModulleri: new Map([["ornek.com/app", "."]]) }, false);
  const ice = (kaynak: string, adlar: string[] = []) => ({ kaynak, satir: 1, adlar });

  it("TypeScript: NodeNext .js → .ts, klasör index'i, çalışma alanı paketi; dış paket null", () => {
    expect(paket.bilgi.giris).toBe("paketler/ortak/src/index.ts");
    expect(c.coz(ice("./a.js"), "src/c.tsx", "ts")).toBe("src/a.ts");
    expect(c.coz(ice("./b"), "src/c.tsx", "ts")).toBe("src/b/index.ts");
    expect(c.coz(ice("../a"), "src/b/index.ts", "ts")).toBe("src/a.ts");
    expect(c.coz(ice("@arnorg/ortak"), "src/a.ts", "ts")).toBe("paketler/ortak/src/index.ts");
    expect(c.coz(ice("react"), "src/a.ts", "ts")).toBeNull();
  });

  it("Python göreli ve kökten modüller, CSS ve Go", () => {
    expect(c.coz(ice("..modeller", ["Kullanici"]), "app/servis/hizmet.py", "py")).toBe("app/modeller.py");
    expect(c.coz(ice(".", ["hizmet"]), "app/servis/__init__.py", "py")).toBe("app/servis/hizmet.py");
    expect(c.coz(ice("app.modeller"), "app/servis/hizmet.py", "py")).toBe("app/modeller.py");
    expect(c.coz(ice("./taban.css"), "stil/ana.css", "css")).toBe("stil/taban.css");
    expect(c.coz(ice("ornek.com/app/internal/depo"), "cmd/sunucu/main.go", "go")).toBe("internal/depo");
    expect(goModulu("module ornek.com/app\n\ngo 1.22\n")).toBe("ornek.com/app");
  });

  it("Windows ve macOS'ta büyük/küçük harf farkı tolere edilir", () => {
    const duyarsiz = new IceAktarmaCozucu({ dosyalar: ["src/Bilesen.tsx"] }, true);
    expect(duyarsiz.coz(ice("./bilesen"), "src/app.ts", "ts")).toBe("src/Bilesen.tsx");
  });
});

describe("parçalayıcı", () => {
  it("büyük sınıf metotlarına bölünür; parçalar satır sınırını aşmaz; bağlam başlığı yol ve sembolü taşır", () => {
    const metotlar = Array.from({ length: 12 }, (_, i) => `  metod${i}(a: number) {\n${Array.from({ length: 12 }, (_, j) => `    const d${j} = a * ${j} + ${i};`).join("\n")}\n    return a;\n  }`).join("\n");
    const kod = `export class Buyuk {\n${metotlar}\n}\n`;
    const c = cozumle(kod, "ts");
    const parcalar = parcala(kod, c.semboller);
    expect(parcalar.length).toBeGreaterThan(2);
    for (const p of parcalar) expect(p.bit - p.bas + 1).toBeLessThanOrEqual(PARCA_EN_COK_SATIR);
    expect(parcalar.some((p) => p.sembol === "Buyuk.metod5")).toBe(true);
    const ilk = parcalar.find((p) => p.sembol === "Buyuk.metod5")!;
    expect(gommeMetni("src/buyuk.ts", ilk).split("\n")[0]).toBe("src/buyuk.ts · Buyuk.metod5 (metod)");
  });

  it("sembolsüz dosya örtüşmeli pencerelerle tümüyle kapsanır", () => {
    const kod = Array.from({ length: 300 }, (_, i) => `satır ${i + 1} metin`).join("\n");
    const parcalar = parcala(kod, []);
    expect(parcalar[0]!.bas).toBe(1);
    expect(parcalar[parcalar.length - 1]!.bit).toBe(300);
    for (let i = 1; i < parcalar.length; i++) expect(parcalar[i]!.bas).toBeLessThanOrEqual(parcalar[i - 1]!.bit + 1);
    expect(parcala("   \n\n", [])).toEqual([]);
  });
});

describe("harita ve grafik", () => {
  const dosyalar: DosyaKaydi[] = [
    { yol: "src/app.ts", hash: "1", dil: "typescript", satir: 120, boyut: 1, mtime: 1 },
    { yol: "src/depo.ts", hash: "2", dil: "typescript", satir: 300, boyut: 1, mtime: 1 },
    { yol: "src/ui/ekran.tsx", hash: "3", dil: "typescriptreact", satir: 80, boyut: 1, mtime: 1 },
    { yol: "README.md", hash: "4", dil: "markdown", satir: 40, boyut: 1, mtime: 1 },
  ];
  const semboller: SembolKaydi[] = [
    { yol: "src/depo.ts", ad: "Depo", tur: "sinif", bas: 1, bit: 300, disaAcik: true, ust: null, imza: "export class Depo {" },
    { yol: "src/depo.ts", ad: "kaydet", tur: "metod", bas: 10, bit: 40, disaAcik: true, ust: "Depo", imza: "kaydet() {" },
    { yol: "src/app.ts", ad: "baslat", tur: "fonksiyon", bas: 1, bit: 50, disaAcik: true, ust: null, imza: "export function baslat() {" },
  ];
  const ice: IceAktarmaKaydi[] = [
    { yol: "src/app.ts", kaynak: "./depo.js", hedef: "src/depo.ts", satir: 1, adlar: ["Depo"] },
    { yol: "src/ui/ekran.tsx", kaynak: "../depo.js", hedef: "src/depo.ts", satir: 1, adlar: ["Depo"] },
    { yol: "src/ui/ekran.tsx", kaynak: "react", hedef: null, satir: 2, adlar: ["useState"] },
  ];

  it("klasör ağacı satır ve dosya sayılarını toplar; klasörler önce gelir", () => {
    const kok = haritaAgaci(dosyalar, semboller, ice);
    expect(kok.satir).toBe(540);
    expect(kok.dosyaSayisi).toBe(4);
    expect(kok.cocuklar!.map((c) => c.ad)).toEqual(["src", "README.md"]);
    const src = kok.cocuklar![0]!;
    expect(src.satir).toBe(500);
    const depo = src.cocuklar!.find((c) => c.ad === "depo.ts")!;
    expect(depo.iceAktaran).toBe(2);
    expect(depo.semboller![0]!.ad).toBe("Depo");
    expect(haritaAgaci(dosyalar, semboller, ice, "src/ui").cocuklar!.map((c) => c.yol)).toEqual(["src/ui/ekran.tsx"]);
  });

  it("metin haritası bütçeye sığar ve çok kullanılan dosya önce girer", () => {
    const m = haritaMetni(dosyalar, semboller, ice, { butce: 400 });
    expect(m.length).toBeLessThanOrEqual(480);
    expect(m).toContain("depo.ts [300]");
    expect(m).toContain("Depo.kaydet()");
    const dar = haritaMetni(dosyalar, semboller, ice, { butce: 220 });
    expect(dar).toContain("depo.ts");
    expect(dar).toContain("dosya daha");
  });

  it("modül grafiği: klasör düzeyinde kenarlar toplanır, dosya düzeyinde bağlantısız düğüm yok", () => {
    const k = grafikKur(dosyalar, ice, "klasor");
    expect(k.kenarlar).toEqual([{ kaynak: "src/ui", hedef: "src", agirlik: 1 }]);
    const d = grafikKur(dosyalar, ice, "dosya");
    expect(d.dugumler.map((x) => x.id)).toEqual(["src/app.ts", "src/depo.ts", "src/ui/ekran.tsx"]);
    expect(d.kenarlar).toHaveLength(2);
  });
});

describe("vektör yardımcıları", () => {
  it("sahte vektör belirlenimci ve birim uzunlukta; ortak sözcüklü metinler daha yakın", () => {
    const a = sahteVektor("hafıza kaydı veritabanına yazılır hafizaKaydet");
    const b = sahteVektor("hafizaKaydet hafıza kaydını yazar");
    const c = sahteVektor("fatura toplamı hesaplanır");
    expect(sahteVektor("hafıza kaydı veritabanına yazılır hafizaKaydet")).toEqual(a);
    expect(a.reduce((t, x) => t + x * x, 0)).toBeCloseTo(1, 5);
    const ic = (x: Float32Array, y: Float32Array) => x.reduce((t, v, i) => t + v * y[i]!, 0);
    expect(ic(a, b)).toBeGreaterThan(ic(a, c));
  });

  it("en yakın satırlar benzerliğe göre sıralanır ve süzgece uyar", () => {
    const veri = new Float32Array([1, 0, 0, 1, 0.6, 0.8]);
    const q = new Float32Array([1, 0]);
    expect(enYakinlar(veri, 2, q, 2).map((x) => x.i)).toEqual([0, 2]);
    expect(enYakinlar(veri, 2, q, 3, (i) => i !== 0).map((x) => x.i)).toEqual([2, 1]);
    expect(enYakinlar(veri, 2, new Float32Array([1, 0, 0]), 3)).toEqual([]);
  });
});
