// İçe aktarma belirteçlerini çalışma alanındaki dosyalara çözer: göreli yollar (TS/JS uzantı ve index çözümü,
// NodeNext ".js" → ".ts"), takma adlar (tsconfig/jsconfig paths ve baseUrl, package.json imports, Vite/webpack
// alias), npm çalışma alanı paketleri, HTML ve şablon başvuruları (betik, stil, sayfa, include/extends), sunucu
// görünümleri (render), Python göreli ve kökten modüller, Go modül klasörleri, Rust mod/crate yolları,
// Java/Kotlin/PHP paket yolları, C başlıkları ve CSS içe aktarmaları. Windows ayraçları (\) her girişte / olur.
import path from "node:path";
import type { DilAilesi } from "./diller.js";
import { yolSadelestir } from "./platform.js";
import type { IceAktarmaBilgisi } from "./semboller.js";
import { paketTakmaAdlari, tabanAdaylari, takmaAdAdaylari, takmaAdDosyasiMi, tsconfigTakmaAdlari, yapilandirmaTakmaAdlari, type TakmaAdlar } from "./takma-adlar.js";

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
  /** tsconfig/jsconfig, package.json imports ve Vite/webpack takma adları */
  takmaAdlar?: TakmaAdlar;
  /** package.json'larda adı geçen bağımlılıklar (dış paket sayılır, klasör takma adı tahmini yapılmaz) */
  bagimliliklar?: Set<string>;
}

const TS_UZANTILAR = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".json"];
/** Şablon ve sayfa uzantıları: HTML başvuruları, include/extends ve render("ad") uzantısız yazılabilir */
const SABLON_UZANTILAR = [".html", ".htm", ".ejs", ".njk", ".hbs", ".handlebars", ".twig", ".liquid", ".mustache", ".jinja", ".j2", ".pug"];
/** Belirtecindeki \ ayracı / sayılan aileler (Windows'ta require(".\\lib\\db") geçerlidir) */
const AYRACLI_AILELER = new Set<DilAilesi>(["ts", "css", "html", "c", "rb"]);

export class IceAktarmaCozucu {
  private readonly dosyalar: Set<string>;
  /** Büyük/küçük harf duyarsız dosya sistemlerinde (Windows, macOS) yedek arama */
  private readonly kucuk: Map<string, string> | null;
  private adDizini: Map<string, string[]> | null = null;
  private goKlasorleri: Set<string> | null = null;
  private klasorDizini: Map<string, string[]> | null = null;
  private readonly paketler: Map<string, PaketBilgisi>;
  private readonly goModulleri: Map<string, string>;
  private readonly takmaAdlar: TakmaAdlar;
  private readonly bagimliliklar: Set<string>;

  constructor(b: CozucuBaglami, harfDuyarsiz = process.platform !== "linux") {
    this.dosyalar = new Set([...b.dosyalar].map(yolSadelestir));
    this.kucuk = harfDuyarsiz ? new Map([...this.dosyalar].map((d) => [d.toLowerCase(), d])) : null;
    this.paketler = b.paketler ?? new Map();
    this.goModulleri = b.goModulleri ?? new Map();
    this.takmaAdlar = b.takmaAdlar ?? { adlar: [], tabanlar: [] };
    this.bagimliliklar = b.bagimliliklar ?? new Set();
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
    // Klasör başvurusu (express.static("public")): klasörün sayfası
    return dogrudan ?? this.var(`${t === "." ? "" : `${t}/`}index.html`);
  }

  private tsCoz(kaynak: string, yol: string): string | null {
    if (kaynak === "." || kaynak === ".." || kaynak.startsWith("./") || kaynak.startsWith("../")) return this.tsDene(posix.join(posix.dirname(yol), kaynak));
    // Kökten yol: proje kökü, sonra içe aktaran dosyanın üst klasörleri (web kökü public/ gibi)
    if (kaynak.startsWith("/")) return this.ustlerdeDene(kaynak.replace(/^\/+/, ""), yol, (t) => this.tsDene(t), true);
    for (const aday of takmaAdAdaylari(this.takmaAdlar, kaynak, yol)) {
      const v = this.tsDene(aday);
      if (v) return v;
    }
    const parca = kaynak.split("/");
    const ad = kaynak.startsWith("@") ? parca.slice(0, 2).join("/") : parca[0]!;
    const geri = parca.slice(kaynak.startsWith("@") ? 2 : 1).join("/");
    const p = this.paketler.get(ad);
    if (p) {
      const k = p.klasor === "." ? "" : `${p.klasor}/`;
      if (geri) return this.tsDene(`${k}${geri}`) ?? this.tsDene(`${k}src/${geri}`);
      return p.giris ?? this.tsDene(`${k}src/index`) ?? this.tsDene(`${k}index`);
    }
    if (this.disPaketMi(ad)) return null;
    for (const taban of tabanAdaylari(this.takmaAdlar, yol)) {
      const v = this.tsDene(taban ? `${taban}/${kaynak}` : kaynak);
      if (v) return v;
    }
    // Yapılandırması okunamayan yaygın takma adlar: @/ ve ~/ önce src/, sonra kök (Next.js)
    if (kaynak.startsWith("@/") || kaynak.startsWith("~/")) return this.tsDene(`src/${kaynak.slice(2)}`) ?? this.tsDene(kaynak.slice(2));
    return this.klasorTakmaAdi(kaynak, yol);
  }

  /** Bağımlılık listesinde (ya da kapsamında) geçen paket adı */
  private disPaketMi(ad: string): boolean {
    if (this.bagimliliklar.has(ad)) return true;
    const kapsam = ad.startsWith("@") ? `${ad.split("/")[0]}/` : null;
    return kapsam !== null && [...this.bagimliliklar].some((b) => b.startsWith(kapsam));
  }

  /** Klasör adına göre dizin (klasör takma adı tahmini için, gerektiğinde kurulur) */
  private klasorAdla(ad: string): string[] {
    if (!this.klasorDizini) {
      const klasorler = new Set<string>();
      for (const d of this.dosyalar) for (let k = posix.dirname(d); k !== "." && !klasorler.has(k); k = posix.dirname(k)) klasorler.add(k);
      this.klasorDizini = new Map();
      for (const k of klasorler) {
        const a = posix.basename(k).toLowerCase();
        this.klasorDizini.set(a, [...(this.klasorDizini.get(a) ?? []), k]);
      }
    }
    return this.klasorDizini.get(ad.toLowerCase()) ?? [];
  }

  /**
   * Yapılandırması okunamayan takma ad tahmini: @hooks/useSepet, ~bilesenler/Dugme, $lib/api, #ortak/x ilk parçası
   * (öneki atılmış) adlı bir klasöre eşlenir. Bağımlılıklarda geçen paket adları dış pakettir; içe aktaran dosyanın
   * üst klasörüyle aynı yerdeki ve src/ altındaki klasör önce denenir.
   */
  private klasorTakmaAdi(kaynak: string, yol: string): string | null {
    const m = /^[@~#$]([\w.-]+)\/(.+)$/.exec(kaynak);
    if (!m || this.disPaketMi(kaynak.startsWith("@") ? kaynak.split("/").slice(0, 2).join("/") : m[1]!)) return null;
    const ilk = yol.includes("/") ? `${yol.split("/")[0]}/` : "";
    const adaylar = [...this.klasorAdla(m[1]!)].sort(
      (a, b) => Number(!(ilk && a.startsWith(ilk))) - Number(!(ilk && b.startsWith(ilk))) || Number(!a.startsWith("src/")) - Number(!b.startsWith("src/")) || a.length - b.length,
    );
    for (const k of adaylar) {
      const v = this.tsDene(`${k}/${m[2]!}`);
      if (v) return v;
    }
    return null;
  }

  /** Göreli yolu önce kökte, sonra içe aktaran dosyanın klasöründen yukarı doğru dener (kendi klasörü dahilse ilk o) */
  private ustlerdeDene(goreli: string, yol: string, dene: (t: string) => string | null, kokOnce: boolean): string | null {
    if (kokOnce) {
      const v = dene(goreli);
      if (v) return v;
    }
    for (let d = posix.dirname(yol); d !== "."; d = posix.dirname(d)) {
      const v = dene(`${d}/${goreli}`);
      if (v) return v;
    }
    return kokOnce ? null : dene(goreli);
  }

  /** Şablon ya da sayfa: tam ad, şablon uzantıları, klasörün index.html'i; betikte .js yerine .ts */
  private sablonDene(taban: string): string | null {
    const t = posix.normalize(taban).replace(/\/$/, "");
    if (t.startsWith("..")) return null;
    const dogrudan = this.var(t);
    if (dogrudan) return dogrudan;
    if (/\.(m|c)?jsx?$/.test(t)) return this.tsDene(t);
    if (!/\.[a-z0-9]+$/i.test(posix.basename(t))) {
      for (const u of SABLON_UZANTILAR) {
        const v = this.var(t + u);
        if (v) return v;
      }
    }
    return this.var(`${t === "." ? "" : `${t}/`}index.html`);
  }

  /** Sonu verilen göreli yolla biten tek dosya (uzantısız yazıldıysa şablon uzantılarıyla); birden çoksa null */
  private tekSonek(sonek: string): string | null {
    const s = posix.normalize(sonek).replace(/^\/+/, "");
    if (!s || s.startsWith("..") || (!s.includes("/") && !/\.[a-z0-9]+$/i.test(s))) return null;
    const adlar = /\.[a-z0-9]+$/i.test(posix.basename(s)) ? [s] : SABLON_UZANTILAR.map((u) => s + u);
    const bulunan = new Set<string>();
    for (const a of adlar) {
      for (const d of this.adla(posix.basename(a))) if (d.toLowerCase() === a.toLowerCase() || d.toLowerCase().endsWith(`/${a.toLowerCase()}`)) bulunan.add(d);
    }
    return bulunan.size === 1 ? [...bulunan][0]! : null;
  }

  /**
   * HTML ve şablon başvurusu: önce dosyanın klasörüne göre, sonra üst klasörlere göre (web kökü public/, şablon kökü
   * templates/ ya da views/ çoğu zaman bir üst klasördür; partials/ alt klasörü de denenir). Kökten başlayan yol
   * (/js/app.js) HTML'nin klasöründen köke doğru aranır. Son çare: yolu bu sonekle biten tek dosya.
   */
  private htmlCoz(kaynak: string, yol: string): string | null {
    const t = kaynak.replace(/[?#].*$/, "");
    if (!t || /^[a-z][\w+.-]*:/i.test(t) || t.startsWith("//")) return null;
    const kokten = t.startsWith("/");
    const goreli = t.replace(/^\/+/, "");
    const dene = (x: string) => this.sablonDene(x) ?? (posix.basename(posix.dirname(x)) === "partials" ? null : this.sablonDene(`${posix.dirname(x)}/partials/${posix.basename(x)}`));
    if (!kokten) {
      const v = this.sablonDene(posix.join(posix.dirname(yol), goreli));
      if (v) return v;
    }
    const ust = kokten ? posix.dirname(yol) : posix.dirname(posix.dirname(yol));
    for (let d = ust; ; d = posix.dirname(d)) {
      if (d === "..") break;
      const v = dene(d === "." ? goreli : `${d}/${goreli}`);
      if (v) return v;
      if (d === ".") break;
    }
    return this.tekSonek(goreli);
  }

  /** Sunucu görünümü (res.render("menu"), render_template("menu.html")): içe aktaran dosyanın klasöründen köke doğru
   * views/ ve templates/ altında; bulunamazsa views/ ya da templates/ ile biten tek eşleşme */
  private gorunumCoz(ad: string, yol: string): string | null {
    const t = yolSadelestir(ad).replace(/^\/+/, "");
    if (!t || t.startsWith("..")) return null;
    for (let d = posix.dirname(yol); ; d = posix.dirname(d)) {
      for (const kok of ["views", "templates"]) {
        const v = this.sablonDene(d === "." ? `${kok}/${t}` : `${d}/${kok}/${t}`);
        if (v) return v;
      }
      if (d === ".") break;
    }
    return this.tekSonek(`views/${t}`) ?? this.tekSonek(`templates/${t}`);
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
    // Paket olmayan klasördeki betik (python scripts/x.py): kendi klasörü sys.path'in başındadır
    const klasor = posix.dirname(yol);
    const betik = klasor !== "." && !this.var(`${klasor}/__init__.py`) ? `${klasor}/` : null;
    const ilk = yol.includes("/") ? `${yol.split("/")[0]}/` : "";
    for (const kok of [...(betik ? [betik] : []), "", "src/", ilk, "lib/", "app/"]) {
      const v = this.pyDene(`${kok}${ad}`);
      if (v) return v;
    }
    return null;
  }

  /**
   * Python'da "from paket import alt1, alt2": adlardan alt modül olanlar ayrı içe aktarma olur (paket.alt1), böylece
   * bağ paketin __init__.py'sine değil modülün kendisine gider; kalan adlar paketin kaydında kalır. Diğer dillerde aynen.
   */
  genislet(i: IceAktarmaBilgisi, yol: string, aile: DilAilesi): IceAktarmaBilgisi[] {
    if (aile !== "py" || !i.adlar.length || i.adlar.includes("*")) return [i];
    const temel = this.pyCoz(i, yolSadelestir(yol));
    const alt: IceAktarmaBilgisi[] = [];
    const kalan: string[] = [];
    for (const ad of i.adlar) {
      const kaynak = i.kaynak.endsWith(".") ? `${i.kaynak}${ad}` : `${i.kaynak}.${ad}`;
      const h = this.pyCoz({ kaynak, satir: i.satir, adlar: [] }, yolSadelestir(yol));
      if (h && h !== temel && h !== yolSadelestir(yol)) alt.push({ kaynak, satir: i.satir, adlar: [ad] });
      else kalan.push(ad);
    }
    if (!alt.length) return [i];
    return [...(kalan.length ? [{ ...i, adlar: kalan }] : []), ...alt];
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
  coz(i: IceAktarmaBilgisi, yol0: string, aile: DilAilesi): string | null {
    const yol = yolSadelestir(yol0);
    const kaynak = AYRACLI_AILELER.has(aile) ? i.kaynak.replace(/\\/g, "/") : i.kaynak;
    let sonuc: string | null = null;
    if (kaynak.startsWith("render:")) return this.gorunumCoz(kaynak.slice(7), yol);
    switch (aile) {
      case "ts":
        sonuc = this.tsCoz(kaynak, yol);
        break;
      case "html":
        sonuc = this.htmlCoz(kaynak, yol);
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
      case "php": {
        const dosya = kaynak.replace(/\\/g, "/");
        sonuc = /\.php$/i.test(dosya) ? (this.var(posix.normalize(posix.join(posix.dirname(yol), dosya))) ?? this.var(dosya)) : this.paketYoluCoz(kaynak, "\\", [".php"]);
        break;
      }
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

/** Çözüm bağlamı için okunan dosya mı: package.json, go.mod, tsconfig/jsconfig ve Vite/webpack yapılandırmaları */
export function baglamDosyasiMi(yol: string): boolean {
  const ad = yol.slice(yol.lastIndexOf("/") + 1);
  return ad === "package.json" || ad === "go.mod" || takmaAdDosyasiMi(ad);
}

/**
 * İçe aktarma çözümünün bağlamı: çalışma alanı paketleri (package.json), Go modülleri (go.mod), takma adlar (tsconfig/
 * jsconfig paths ve baseUrl, package.json imports, Vite/webpack alias) ve bağımlılık adları. oku köke göre yolun
 * içeriğini verir (yoksa null); tsconfig extends zinciri de onunla okunur.
 */
export function cozumBaglami(dosyalar: Set<string>, oku: (yol: string) => string | null, goModlari: string[] = []): Required<Omit<CozucuBaglami, "dosyalar">> {
  const paketler = new Map<string, PaketBilgisi>();
  const takmaAdlar: TakmaAdlar = { adlar: [], tabanlar: [] };
  const bagimliliklar = new Set<string>();
  for (const y of dosyalar) {
    const ad = y.slice(y.lastIndexOf("/") + 1);
    if (ad !== "package.json" && !takmaAdDosyasiMi(ad)) continue;
    const icerik = oku(y);
    if (icerik === null) continue;
    if (ad === "package.json") {
      const b = paketBilgisi(y, icerik, dosyalar);
      if (b) paketler.set(b.ad, b.bilgi);
      const t = paketTakmaAdlari(y, icerik);
      takmaAdlar.adlar.push(...t.adlar);
      for (const d of t.bagimliliklar) bagimliliklar.add(d);
    } else if (ad.endsWith(".json")) {
      const t = tsconfigTakmaAdlari(y, oku);
      takmaAdlar.adlar.push(...t.adlar);
      const klasor = posix.dirname(y);
      if (t.taban !== null) takmaAdlar.tabanlar.push({ kapsam: klasor === "." ? "" : klasor, taban: t.taban });
    } else takmaAdlar.adlar.push(...yapilandirmaTakmaAdlari(y, icerik));
  }
  const goModulleri = new Map<string, string>();
  for (const y of goModlari) {
    const icerik = oku(y);
    const modul = icerik ? goModulu(icerik) : null;
    if (modul) goModulleri.set(modul, posix.dirname(y));
  }
  return { paketler, goModulleri, takmaAdlar, bagimliliklar };
}
