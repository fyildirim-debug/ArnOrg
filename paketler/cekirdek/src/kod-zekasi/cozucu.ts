// İçe aktarma belirteçlerini çalışma alanındaki dosyalara çözer: göreli yollar (TS/JS uzantı ve index çözümü,
// NodeNext ".js" → ".ts"), npm çalışma alanı paketleri, Python göreli ve kökten modüller, Go modül klasörleri,
// Rust mod/crate yolları, Java/Kotlin/PHP paket yolları, C başlıkları ve CSS içe aktarmaları.
import path from "node:path";
import type { DilAilesi } from "./diller.js";
import type { IceAktarmaBilgisi } from "./semboller.js";

const posix = path.posix;

export interface PaketBilgisi {
  /** Paketin klasörü (köke göre; kökteyse ".") */
  klasor: string;
  /** package.json'daki giriş alanlarından dizinde bulunan ilk dosya */
  giris: string | null;
}

export interface CozucuBaglami {
  /** Alandaki dizinlenen dosyalar (/ ayraçlı, köke göre) */
  dosyalar: Iterable<string>;
  /** npm çalışma alanı paketleri: ad → klasör */
  paketler?: Map<string, PaketBilgisi>;
  /** go.mod modül yolu → klasör */
  goModulleri?: Map<string, string>;
}

const TS_UZANTILAR = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".json"];

export class IceAktarmaCozucu {
  private readonly dosyalar: Set<string>;
  /** Büyük/küçük harf duyarsız dosya sistemlerinde (Windows, macOS) yedek arama */
  private readonly kucuk: Map<string, string> | null;
  private adDizini: Map<string, string[]> | null = null;
  private goKlasorleri: Set<string> | null = null;
  private readonly paketler: Map<string, PaketBilgisi>;
  private readonly goModulleri: Map<string, string>;

  constructor(b: CozucuBaglami, harfDuyarsiz = process.platform !== "linux") {
    this.dosyalar = new Set(b.dosyalar);
    this.kucuk = harfDuyarsiz ? new Map([...this.dosyalar].map((d) => [d.toLowerCase(), d])) : null;
    this.paketler = b.paketler ?? new Map();
    this.goModulleri = b.goModulleri ?? new Map();
  }

  private var(y: string): string | null {
    if (!y || y.startsWith("../") || y === "..") return null;
    const temiz = y.startsWith("./") ? y.slice(2) : y;
    if (this.dosyalar.has(temiz)) return temiz;
    return this.kucuk?.get(temiz.toLowerCase()) ?? null;
  }

  /** Dosya adına göre dizin (sonek araması için, gerektiğinde kurulur) */
  private adla(ad: string): string[] {
    if (!this.adDizini) {
      this.adDizini = new Map();
      for (const d of this.dosyalar) {
        const a = posix.basename(d).toLowerCase();
        const l = this.adDizini.get(a);
        if (l) l.push(d);
        else this.adDizini.set(a, [d]);
      }
    }
    return this.adDizini.get(ad.toLowerCase()) ?? [];
  }

  /** Sonu verilen göreli yolla biten dosya (birden çoksa en kısa yol) */
  private sonekle(sonek: string): string | null {
    const adaylar = this.adla(posix.basename(sonek)).filter((d) => d === sonek || d.endsWith(`/${sonek}`) || (this.kucuk && d.toLowerCase().endsWith(`/${sonek.toLowerCase()}`)));
    return adaylar.sort((a, b) => a.length - b.length)[0] ?? null;
  }

  private tsDene(taban: string): string | null {
    const t = posix.normalize(taban).replace(/\/$/, "");
    if (t.startsWith("..")) return null;
    const dogrudan = this.var(t);
    if (dogrudan && /\.[a-z]+$/i.test(t)) return dogrudan;
    const js = /\.(m|c)?jsx?$/.exec(t);
    if (js) {
      const kok = t.slice(0, -js[0].length);
      for (const u of [".ts", ".tsx", ".mts", ".cts", ".d.ts"]) {
        const v = this.var(kok + u);
        if (v) return v;
      }
    }
    for (const u of TS_UZANTILAR) {
      const v = this.var(t + u);
      if (v) return v;
    }
    for (const u of TS_UZANTILAR) {
      const v = this.var(`${t === "." ? "" : `${t}/`}index${u}`);
      if (v) return v;
    }
    return dogrudan;
  }

  private tsCoz(kaynak: string, yol: string): string | null {
    if (kaynak === "." || kaynak === ".." || kaynak.startsWith("./") || kaynak.startsWith("../")) return this.tsDene(posix.join(posix.dirname(yol), kaynak));
    if (kaynak.startsWith("/")) return this.tsDene(kaynak.slice(1));
    if (kaynak.startsWith("@/") || kaynak.startsWith("~/")) return this.tsDene(`src/${kaynak.slice(2)}`);
    const parca = kaynak.split("/");
    const ad = kaynak.startsWith("@") ? parca.slice(0, 2).join("/") : parca[0]!;
    const geri = parca.slice(kaynak.startsWith("@") ? 2 : 1).join("/");
    const p = this.paketler.get(ad);
    if (!p) return null;
    const k = p.klasor === "." ? "" : `${p.klasor}/`;
    if (geri) return this.tsDene(`${k}${geri}`) ?? this.tsDene(`${k}src/${geri}`);
    return p.giris ?? this.tsDene(`${k}src/index`) ?? this.tsDene(`${k}index`);
  }

  private pyDene(a: string): string | null {
    return this.var(`${a}.py`) ?? this.var(`${a}.pyi`) ?? this.var(`${a}/__init__.py`);
  }

  private pyCoz(i: IceAktarmaBilgisi, yol: string): string | null {
    const nokta = /^\.+/.exec(i.kaynak)?.[0].length ?? 0;
    const ad = i.kaynak.slice(nokta).replace(/\./g, "/");
    if (nokta) {
      let taban = posix.dirname(yol);
      for (let k = 1; k < nokta; k++) taban = posix.dirname(taban);
      const temel = taban === "." ? "" : `${taban}/`;
      if (ad) return this.pyDene(posix.normalize(`${temel}${ad}`));
      // from . import x: x bir modülse onun dosyası
      for (const a of i.adlar) {
        const v = this.pyDene(`${temel}${a}`);
        if (v) return v;
      }
      return this.var(`${temel}__init__.py`);
    }
    const ilk = yol.includes("/") ? `${yol.split("/")[0]}/` : "";
    for (const kok of ["", "src/", ilk, "lib/", "app/"]) {
      const v = this.pyDene(`${kok}${ad}`);
      if (v) return v;
    }
    return null;
  }

  private goCoz(kaynak: string): string | null {
    if (!this.goKlasorleri) {
      this.goKlasorleri = new Set();
      for (const d of this.dosyalar) if (d.endsWith(".go")) this.goKlasorleri.add(posix.dirname(d));
    }
    for (const [modul, klasor] of this.goModulleri) {
      if (kaynak !== modul && !kaynak.startsWith(`${modul}/`)) continue;
      const geri = kaynak.slice(modul.length + 1);
      const hedef = posix.normalize(posix.join(klasor, geri || "."));
      if (this.goKlasorleri.has(hedef)) return hedef;
    }
    return null;
  }

  /** Rust: dosyanın modül klasörü (mod.rs, lib.rs, main.rs kendi klasörünü, diğerleri adlarıyla bir alt klasörü açar) */
  private rsModulKlasoru(yol: string): string {
    const ad = posix.basename(yol, ".rs");
    const klasor = posix.dirname(yol);
    return ad === "mod" || ad === "lib" || ad === "main" ? klasor : posix.join(klasor, ad);
  }

  private rsDene(klasor: string, parcalar: string[]): string | null {
    for (let n = parcalar.length; n > 0; n--) {
      const t = posix.join(klasor, ...parcalar.slice(0, n));
      const v = this.var(`${t}.rs`) ?? this.var(`${t}/mod.rs`);
      if (v) return v;
    }
    return null;
  }

  private rsCoz(kaynak: string, yol: string): string | null {
    if (kaynak.startsWith("mod ")) return this.rsDene(this.rsModulKlasoru(yol), [kaynak.slice(4)]);
    const parcalar = kaynak.split("::").filter(Boolean);
    const bas = parcalar.shift();
    if (bas === "crate") {
      const i = yol.lastIndexOf("src/");
      const kok = i >= 0 ? yol.slice(0, i + 3) : "src";
      return this.rsDene(kok, parcalar);
    }
    if (bas === "self") return this.rsDene(this.rsModulKlasoru(yol), parcalar);
    if (bas === "super") return this.rsDene(posix.dirname(this.rsModulKlasoru(yol)), parcalar);
    return null;
  }

  private paketYoluCoz(kaynak: string, ayrac: string, uzantilar: string[]): string | null {
    const parcalar = kaynak.split(ayrac).filter(Boolean);
    for (let n = parcalar.length; n >= 2; n--) {
      const rel = parcalar.slice(parcalar.length - n).join("/");
      for (const u of uzantilar) {
        const v = this.sonekle(`${rel}${u}`);
        if (v) return v;
      }
      // PSR-4 ve Java'da önek klasöre eşlenmeyebilir: yalnız sondaki parçalarla da denenir
      if (ayrac !== "\\") break;
    }
    return null;
  }

  private cCoz(kaynak: string, yol: string): string | null {
    const sistem = kaynak.startsWith("<");
    const ad = sistem ? kaynak.slice(1, -1) : kaynak;
    const adaylar = [...(sistem ? [] : [posix.join(posix.dirname(yol), ad)]), ad, `include/${ad}`, `src/${ad}`];
    for (const a of adaylar) {
      const v = this.var(posix.normalize(a));
      if (v) return v;
    }
    const sonek = this.adla(posix.basename(ad)).filter((d) => d.endsWith(`/${ad}`) || d === ad);
    return sonek.length === 1 ? sonek[0]! : null;
  }

  private cssCoz(kaynak: string, yol: string): string | null {
    if (!kaynak.startsWith(".") && !kaynak.startsWith("/") && !/\.(s?css|sass|less)$/.test(kaynak)) {
      if (kaynak.includes(":") || !kaynak.includes("/")) return null;
    }
    const taban = posix.normalize(kaynak.startsWith("/") ? kaynak.slice(1) : posix.join(posix.dirname(yol), kaynak));
    const klasor = posix.dirname(taban);
    const ad = posix.basename(taban);
    for (const a of [taban, ...[".css", ".scss", ".sass", ".less"].map((u) => taban + u), ...[".scss", ".sass"].map((u) => posix.join(klasor, `_${ad}${u}`))]) {
      const v = this.var(a);
      if (v) return v;
    }
    return null;
  }

  /** İçe aktarmanın hedef dosyası (Go'da klasörü); dış paket ya da bulunamayan hedefte null */
  coz(i: IceAktarmaBilgisi, yol: string, aile: DilAilesi): string | null {
    const kaynak = i.kaynak;
    let sonuc: string | null = null;
    switch (aile) {
      case "ts":
        sonuc = this.tsCoz(kaynak, yol);
        break;
      case "py":
        sonuc = this.pyCoz(i, yol);
        break;
      case "go":
        sonuc = this.goCoz(kaynak);
        break;
      case "rs":
        sonuc = this.rsCoz(kaynak, yol);
        break;
      case "java":
        sonuc = this.paketYoluCoz(kaynak, ".", [".java"]);
        break;
      case "kt":
        sonuc = this.paketYoluCoz(kaynak, ".", [".kt", ".java"]);
        break;
      case "php":
        sonuc = /\.php$/i.test(kaynak) ? (this.var(posix.normalize(posix.join(posix.dirname(yol), kaynak))) ?? this.var(kaynak)) : this.paketYoluCoz(kaynak, "\\", [".php"]);
        break;
      case "rb":
        sonuc = kaynak.startsWith(".")
          ? this.var(posix.normalize(posix.join(posix.dirname(yol), kaynak)) + (kaynak.endsWith(".rb") ? "" : ".rb"))
          : (this.var(`lib/${kaynak}.rb`) ?? this.var(`${kaynak}.rb`));
        break;
      case "c":
        sonuc = this.cCoz(kaynak, yol);
        break;
      case "css":
        sonuc = this.cssCoz(kaynak, yol);
        break;
      default:
        sonuc = null;
    }
    return sonuc === yol ? null : sonuc;
  }
}

/** package.json içeriğinden çalışma alanı paket bilgisi; giriş alanları dizindeki dosyalarla doğrulanır */
export function paketBilgisi(yol: string, icerik: string, dosyalar: Set<string>): { ad: string; bilgi: PaketBilgisi } | null {
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(icerik) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof p.name !== "string" || !p.name) return null;
  const klasor = posix.dirname(yol);
  const k = klasor === "." ? "" : `${klasor}/`;
  const girisler: string[] = [];
  const ekle = (x: unknown) => {
    if (typeof x === "string") girisler.push(x);
    else if (x && typeof x === "object") for (const a of ["source", "types", "import", "default", "require", "node"]) ekle((x as Record<string, unknown>)[a]);
  };
  const disa = p.exports;
  if (typeof disa === "string") ekle(disa);
  else if (disa && typeof disa === "object") ekle((disa as Record<string, unknown>)["."] ?? disa);
  for (const a of ["source", "types", "typings", "module", "main"]) ekle(p[a]);
  let giris: string | null = null;
  for (const g of girisler) {
    const aday = posix.normalize(`${k}${g.replace(/^\.\//, "")}`);
    if (dosyalar.has(aday)) {
      giris = aday;
      break;
    }
    // Derlenmiş giriş (dist/index.js) dizinde yoksa kaynağı denenir
    const kaynak = aday.replace(/^(.*\/)?(dist|build|lib|out)\//, "$1src/").replace(/\.(m|c)?js$/, ".ts").replace(/\.d\.ts$/, ".ts");
    if (dosyalar.has(kaynak)) {
      giris = kaynak;
      break;
    }
  }
  return { ad: p.name, bilgi: { klasor: klasor || ".", giris } };
}

/** go.mod içeriğinden modül yolu */
export function goModulu(icerik: string): string | null {
  return /^\s*module\s+(\S+)/m.exec(icerik)?.[1] ?? null;
}
