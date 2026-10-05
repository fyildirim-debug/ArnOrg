// İçe aktarma takma adları: tsconfig/jsconfig "paths" ve "baseUrl" (extends zinciriyle, yorumlu JSON), package.json
// "imports" (#ad) ve Vite, webpack gibi yapılandırmalardaki alias tanımları. Her tanım bulunduğu klasörde ve altında
// geçerlidir; çözücü içe aktaran dosyaya en yakın (en derin) tanımı önce dener. Windows ters eğik çizgileri / olur.
import path from "node:path";
import { yolSadelestir } from "./platform.js";

const posix = path.posix;

export interface TakmaAd {
  /** Geçerli olduğu klasör (köke göre; kökse "") */
  kapsam: string;
  /** Belirteç deseni: "@/*", "#db", "~lib/*" (en çok bir *) */
  desen: string;
  /** Köke göre hedefler; * desendeki karşılığıyla değişir */
  hedefler: string[];
}

export interface TakmaAdlar {
  adlar: TakmaAd[];
  /** baseUrl: kökten olmayan belirteçler bu klasöre göre de çözülür ("" kök) */
  tabanlar: { kapsam: string; taban: string }[];
}

/** Takma ad okunan dosyalar: değişince içe aktarmalar yeniden çözülür */
export function takmaAdDosyasiMi(ad: string): boolean {
  return /^[jt]sconfig(?:\..+)?\.json$/i.test(ad) || YAPILANDIRMA.test(ad);
}

const YAPILANDIRMA = /^(?:vite|vitest|webpack|vue|craco|rollup|svelte|astro|nuxt|quasar)\.config\.[cm]?[jt]s$/i;

/** Klasör kapsamı: kök "", diğerleri "a/b" */
function kapsamOf(klasor: string): string {
  return klasor === "." ? "" : klasor;
}

/** Yapılandırmanın klasörüne göre hedefi köke göreli yapar; kökün dışına çıkan hedef null */
function kokeGore(klasor: string, hedef: string): string | null {
  const t = posix.normalize(posix.join(klasor, yolSadelestir(hedef).replace(/^\/+/, "")));
  if (t === "." || t === "./") return "";
  if (t.startsWith("../") || t === "..") return null;
  return t.replace(/^\.\//, "");
}

/** Dizgeleri koruyarak metni tarar; dizge dışındaki her konum için f, atlanacak uzunluğu ya da eklenecek metni verir */
function dizgeDisinda(metin: string, f: (i: number) => { atla: number; ekle: string } | null): string {
  let s = "";
  let i = 0;
  while (i < metin.length) {
    if (metin[i] === '"') {
      let j = i + 1;
      while (j < metin.length && metin[j] !== '"') j += metin[j] === "\\" ? 2 : 1;
      s += metin.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const d = f(i);
    if (d) {
      s += d.ekle;
      i += d.atla;
    } else s += metin[i++];
  }
  return s;
}

/** Yorumları (// ve /* *\/) ve sondaki virgülleri ayıklayıp JSON olarak okur; okunamazsa null */
export function jsoncOku(metin: string): unknown {
  const yorumsuz = dizgeDisinda(metin, (i) => {
    if (metin[i] !== "/") return null;
    if (metin[i + 1] === "/") {
      const son = metin.indexOf("\n", i);
      return { atla: (son < 0 ? metin.length : son) - i, ekle: "" };
    }
    if (metin[i + 1] === "*") {
      const son = metin.indexOf("*/", i + 2);
      return { atla: (son < 0 ? metin.length : son + 2) - i, ekle: " " };
    }
    return null;
  });
  // Sondaki virgül: ardından yalnız boşluk ve kapanış geliyorsa atılır (yorumlar silindikten sonra)
  const temiz = dizgeDisinda(yorumsuz, (i) => (yorumsuz[i] === "," && /^\s*[}\]]/.test(yorumsuz.slice(i + 1, i + 200)) ? { atla: 1, ekle: "" } : null));
  try {
    return JSON.parse(temiz);
  } catch {
    return null;
  }
}

function nesne(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// tsconfig / jsconfig
// ---------------------------------------------------------------------------

interface TsAyari {
  paths?: Record<string, unknown>;
  /** paths'in tanımlandığı dosyanın klasörü (baseUrl yoksa hedefler buna göredir) */
  pathsKlasoru: string;
  /** Köke göre baseUrl */
  baseUrl?: string;
}

function tsAyariOku(yol: string, oku: (yol: string) => string | null, derinlik: number): TsAyari | null {
  if (derinlik > 6) return null;
  const icerik = oku(yol);
  const j = nesne(icerik === null ? null : jsoncOku(icerik));
  if (!j) return null;
  const klasor = posix.dirname(yol);
  const sonuc: TsAyari = { pathsKlasoru: klasor };
  const ust = Array.isArray(j.extends) ? j.extends : j.extends ? [j.extends] : [];
  for (const e of ust) {
    // Paketten gelen temel yapılandırma (node_modules) okunmaz
    if (typeof e !== "string" || !/^\.{1,2}[\\/]/.test(e)) continue;
    let hedef = posix.normalize(posix.join(klasor, yolSadelestir(e)));
    if (!hedef.endsWith(".json")) hedef += ".json";
    const a = tsAyariOku(hedef, oku, derinlik + 1);
    if (!a) continue;
    if (a.paths) {
      sonuc.paths = a.paths;
      sonuc.pathsKlasoru = a.pathsKlasoru;
    }
    if (a.baseUrl !== undefined) sonuc.baseUrl = a.baseUrl;
  }
  const co = nesne(j.compilerOptions);
  if (co) {
    if (typeof co.baseUrl === "string") {
      const b = kokeGore(klasor, co.baseUrl);
      if (b !== null) sonuc.baseUrl = b;
    }
    const p = nesne(co.paths);
    if (p) {
      sonuc.paths = p;
      sonuc.pathsKlasoru = klasor;
    }
  }
  return sonuc;
}

/** tsconfig/jsconfig'in paths takma adları ve baseUrl'si (hedefler baseUrl'e, o yoksa paths'i tanımlayan dosyaya göre) */
export function tsconfigTakmaAdlari(yol: string, oku: (yol: string) => string | null): { adlar: TakmaAd[]; taban: string | null } {
  const a = tsAyariOku(yolSadelestir(yol), oku, 0);
  if (!a) return { adlar: [], taban: null };
  const kapsam = kapsamOf(posix.dirname(yolSadelestir(yol)));
  const temel = a.baseUrl ?? a.pathsKlasoru;
  const adlar: TakmaAd[] = [];
  for (const [desen, liste] of Object.entries(a.paths ?? {})) {
    if (!Array.isArray(liste) || (desen.match(/\*/g)?.length ?? 0) > 1) continue;
    const hedefler = liste.filter((x): x is string => typeof x === "string").flatMap((x) => kokeGore(temel === "" ? "." : temel, x) ?? []);
    if (hedefler.length) adlar.push({ kapsam, desen, hedefler });
  }
  return { adlar, taban: a.baseUrl ?? null };
}

// ---------------------------------------------------------------------------
// package.json: "imports" ve bağımlılık adları
// ---------------------------------------------------------------------------

/** Koşullu hedefin ilk yolu: kaynak ve tür girişleri önce */
function kosulluHedef(x: unknown): string | null {
  if (typeof x === "string") return x;
  const o = nesne(x);
  if (!o) return null;
  for (const k of ["source", "types", "import", "require", "node", "default", ...Object.keys(o)]) {
    const v = kosulluHedef(o[k]);
    if (v) return v;
  }
  return null;
}

/** package.json'daki Node alt yol içe aktarmaları (#db, #lib/*) ve bağımlılık adları */
export function paketTakmaAdlari(yol: string, icerik: string): { adlar: TakmaAd[]; bagimliliklar: string[] } {
  const j = nesne(jsoncOku(icerik));
  if (!j) return { adlar: [], bagimliliklar: [] };
  const klasor = posix.dirname(yolSadelestir(yol));
  const adlar: TakmaAd[] = [];
  for (const [desen, deger] of Object.entries(nesne(j.imports) ?? {})) {
    const h = kosulluHedef(deger);
    if (!desen.startsWith("#") || !h || !h.startsWith("./")) continue;
    const t = kokeGore(klasor, h);
    if (t !== null) adlar.push({ kapsam: kapsamOf(klasor), desen, hedefler: [t] });
  }
  const bagimliliklar = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) => Object.keys(nesne(j[k]) ?? {}));
  return { adlar, bagimliliklar };
}

// ---------------------------------------------------------------------------
// Vite, webpack ve benzerleri: resolve.alias
// ---------------------------------------------------------------------------

/** Açılış parantezinden (konum) eşleşen kapanışa kadarki iç metin; dizgeler atlanır */
function dengeliIc(metin: string, konum: number): string | null {
  const ac = metin[konum]!;
  const kapa = ac === "{" ? "}" : ac === "[" ? "]" : ")";
  let derinlik = 0;
  for (let i = konum; i < metin.length; i++) {
    const c = metin[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const son = metin.indexOf(c, i + 1);
      if (son < 0) return null;
      i = son;
    } else if (c === "{" || c === "[" || c === "(") derinlik++;
    else if (c === "}" || c === "]" || c === ")") {
      derinlik--;
      if (derinlik === 0) return c === kapa ? metin.slice(konum + 1, i) : null;
    }
  }
  return null;
}

/** Üst düzeydeki virgüllerden böler (parantez ve dizge içi bölünmez) */
function ustDuzeyBol(metin: string, ayrac: string): string[] {
  const parcalar: string[] = [];
  let derinlik = 0;
  let bas = 0;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const son = metin.indexOf(c, i + 1);
      i = son < 0 ? metin.length : son;
    } else if (c === "{" || c === "[" || c === "(") derinlik++;
    else if (c === "}" || c === "]" || c === ")") derinlik--;
    else if (c === ayrac && derinlik === 0) {
      parcalar.push(metin.slice(bas, i));
      bas = i + 1;
    }
  }
  parcalar.push(metin.slice(bas));
  return parcalar.map((p) => p.trim()).filter(Boolean);
}

/** Alias değerinin hedefi (yapılandırmanın klasörüne göre): path.resolve(__dirname, "src"), "/src",
 * fileURLToPath(new URL("./src", import.meta.url)); çözülemeyen ifade null */
function hedefIfadesi(ifade: string): string | null {
  const dizgeler = [...ifade.matchAll(/(["'`])([^"'`]*)\1/g)].map((m) => m[2]!);
  if (!dizgeler.length || dizgeler.some((d) => d.includes("node_modules"))) return null;
  if (/\b(?:resolve|join)\s*\(|\bnew\s+URL\s*\(/.test(ifade)) return dizgeler.join("/");
  return dizgeler.length === 1 && /^\.{0,2}\//.test(dizgeler[0]!) ? dizgeler[0]! : null;
}

/** Yapılandırma dosyasındaki alias tanımları: { "@": path.resolve(__dirname, "src") } ve [{ find: "@", replacement: … }] */
export function yapilandirmaTakmaAdlari(yol: string, icerik: string): TakmaAd[] {
  const klasor = posix.dirname(yolSadelestir(yol));
  const adlar: TakmaAd[] = [];
  const ekle = (anahtar: string, ifade: string) => {
    const h = hedefIfadesi(ifade);
    // Paket adına eşlenen (vue$) ya da çözülemeyen tanımlar atlanır
    if (!anahtar || anahtar.endsWith("$") || /[*\s]/.test(anahtar) || h === null) return;
    const t = kokeGore(klasor, h);
    if (t === null) return;
    const kapsam = kapsamOf(klasor);
    adlar.push({ kapsam, desen: anahtar, hedefler: [t] }, { kapsam, desen: `${anahtar.replace(/\/$/, "")}/*`, hedefler: [t ? `${t}/*` : "*"] });
  };
  for (const m of icerik.matchAll(/\balias\s*:\s*([[{])/g)) {
    const ic = dengeliIc(icerik, m.index + m[0].length - 1);
    if (!ic) continue;
    if (m[1] === "{") {
      for (const p of ustDuzeyBol(ic, ",")) {
        const [anahtar, ...deger] = ustDuzeyBol(p, ":");
        if (anahtar && deger.length) ekle(anahtar.replace(/^(["'`])(.*)\1$/, "$2"), deger.join(":"));
      }
    } else {
      for (const p of ustDuzeyBol(ic, ",")) {
        const find = /\bfind\s*:\s*(["'`])([^"'`]+)\1/.exec(p);
        const replacement = /\breplacement\s*:\s*([\s\S]+)$/.exec(p.replace(/^\{|\}$/g, ""));
        if (find && replacement) ekle(find[2]!, ustDuzeyBol(replacement[1]!, ",")[0] ?? "");
      }
    }
  }
  return adlar;
}

// ---------------------------------------------------------------------------
// Eşleştirme
// ---------------------------------------------------------------------------

/** Belirtecin desene uyan karşılığı: tam eşleşmede "", * desende yıldızın yerine gelen; uymazsa null */
function desenUyar(desen: string, belirtec: string): string | null {
  const y = desen.indexOf("*");
  if (y < 0) return desen === belirtec ? "" : null;
  const on = desen.slice(0, y);
  const son = desen.slice(y + 1);
  if (belirtec.length < on.length + son.length || !belirtec.startsWith(on) || !belirtec.endsWith(son)) return null;
  return belirtec.slice(on.length, belirtec.length - son.length);
}

/** İçe aktaran dosya için belirtecin aday yolları: en derin kapsam, tam desen ve en uzun önek önce */
export function takmaAdAdaylari(t: TakmaAdlar, belirtec: string, yol: string): string[] {
  const uygun = t.adlar
    .filter((a) => a.kapsam === "" || yol.startsWith(`${a.kapsam}/`))
    .map((a) => ({ a, eslesen: desenUyar(a.desen, belirtec) }))
    .filter((x): x is { a: TakmaAd; eslesen: string } => x.eslesen !== null)
    .sort(
      (x, y) =>
        y.a.kapsam.length - x.a.kapsam.length ||
        Number(x.a.desen.includes("*")) - Number(y.a.desen.includes("*")) ||
        y.a.desen.indexOf("*") - x.a.desen.indexOf("*"),
    );
  const adaylar: string[] = [];
  for (const { a, eslesen } of uygun) for (const h of a.hedefler) adaylar.push(h.replace("*", eslesen));
  return [...new Set(adaylar)];
}

/** İçe aktaran dosya için baseUrl klasörleri (en derin kapsam önce) */
export function tabanAdaylari(t: TakmaAdlar, yol: string): string[] {
  return t.tabanlar
    .filter((b) => b.kapsam === "" || yol.startsWith(`${b.kapsam}/`))
    .sort((a, b) => b.kapsam.length - a.kapsam.length)
    .map((b) => b.taban);
}
