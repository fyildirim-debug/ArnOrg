// Düzenli ifadeyle sembol ve içe aktarma çıkarımı. Tam bir ayrıştırıcı değildir: yorumlar ve dizgeler maskelenir,
// bloklar süslü parantez dengesiyle, Python ve Ruby girintiyle, Markdown başlık düzeyiyle sınırlanır.
// Satırlar 1 tabanlıdır; metin satır sonları LF'ye çevrilmiş olarak gelir.
import path from "node:path";
import type { KodSembolTuru } from "@arnorg/ortak";
import type { DilAilesi } from "./diller.js";
import { htmlIceAktarmalari } from "./html.js";

export interface SembolBilgisi {
  ad: string;
  tur: KodSembolTuru;
  bas: number;
  bit: number;
  disaAcik: boolean;
  ust: string | null;
  imza: string;
}

export interface IceAktarmaBilgisi {
  /** Koddaki belirteç ("./a.js", "react", "..models", "mod x"); sunucu görünümünde "render:ad" */
  kaynak: string;
  satir: number;
  adlar: string[];
  /** Dosya başvurusu (HTML src/href, path.join(__dirname, …), render): dizindeki bir dosyaya çözülmezse kaydedilmez */
  tur?: "yol";
}

export interface Cozumleme {
  semboller: SembolBilgisi[];
  iceAktarmalar: IceAktarmaBilgisi[];
}

const EN_COK_SEMBOL = 3000;
const EN_COK_ICE_AKTARMA = 1000;
/** Bundan uzun satırlarda tanım aranmaz (küçültülmüş kod; düzenli ifadeler uzun satırda yavaşlar) */
const UZUN_SATIR = 1000;

// ---------------------------------------------------------------------------
// Maskeleme: yorum ve dizge içerikleri boşluğa çevrilir (satır sonları ve konumlar korunur)
// ---------------------------------------------------------------------------

interface MaskeKurali {
  satirYorumlari: string[];
  blokYorumu: [string, string] | null;
  /** Dizge açan tırnaklar */
  tirnaklar: string;
  /** Satır sonunu aşabilen tırnaklar */
  cokSatirli: string;
  /** """ ve ''' */
  ucluTirnak: boolean;
  /** JavaScript düzenli ifade değişmezleri */
  regex: boolean;
  /** SQL'de '' kaçışı ve $$ gövdeleri */
  sql: boolean;
  /** Rust: ' yalnız karakter değişmeziyse dizgedir (ömür belirteci değil) */
  karakterDegismezi: boolean;
}

const C_BENZERI: MaskeKurali = { satirYorumlari: ["//"], blokYorumu: ["/*", "*/"], tirnaklar: "\"'", cokSatirli: "", ucluTirnak: false, regex: false, sql: false, karakterDegismezi: false };

const KURALLAR: Partial<Record<DilAilesi, MaskeKurali>> = {
  ts: { ...C_BENZERI, tirnaklar: "\"'`", cokSatirli: "`", regex: true },
  py: { ...C_BENZERI, satirYorumlari: ["#"], blokYorumu: null, ucluTirnak: true },
  go: { ...C_BENZERI, tirnaklar: "\"'`", cokSatirli: "`" },
  rs: { ...C_BENZERI, tirnaklar: "\"", cokSatirli: "\"", karakterDegismezi: true },
  java: { ...C_BENZERI, ucluTirnak: true },
  kt: { ...C_BENZERI, ucluTirnak: true },
  cs: C_BENZERI,
  php: { ...C_BENZERI, satirYorumlari: ["//", "#"], tirnaklar: "\"'`" },
  rb: { ...C_BENZERI, satirYorumlari: ["#"], blokYorumu: null, tirnaklar: "\"'`" },
  swift: { ...C_BENZERI, tirnaklar: "\"", ucluTirnak: true },
  c: C_BENZERI,
  sql: { ...C_BENZERI, satirYorumlari: ["--"], tirnaklar: "'\"", cokSatirli: "'\"", sql: true },
  css: { ...C_BENZERI },
};

const REGEX_ONCESI_ISARET = "(,=:[!&|?{};+-*%<>~^";
const REGEX_ONCESI_SOZCUK = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

export function maskele(metin: string, aile: DilAilesi): string {
  const k = KURALLAR[aile];
  if (!k) return metin;
  const n = metin.length;
  const c = metin.split("");
  const bosalt = (a: number, b: number) => {
    for (let j = a; j < b && j < n; j++) if (c[j] !== "\n") c[j] = " ";
  };
  const satirYorumuMu = (i: number) => {
    for (const y of k.satirYorumlari) {
      if (!metin.startsWith(y, i)) continue;
      // CSS'te "//" yalnız boşluktan sonra yorumdur (url(http://…) korunur)
      if (aile === "css" && i > 0 && !/\s/.test(metin[i - 1]!)) continue;
      return true;
    }
    return false;
  };
  const regexBaslarMi = (i: number): boolean => {
    let j = i - 1;
    while (j >= 0 && (metin[j] === " " || metin[j] === "\t")) j--;
    if (j < 0 || metin[j] === "\n") return true;
    const p = metin[j]!;
    if (REGEX_ONCESI_ISARET.includes(p)) return true;
    if (/[\w$]/.test(p)) {
      let b = j;
      while (b > 0 && /[\w$]/.test(metin[b - 1]!)) b--;
      return REGEX_ONCESI_SOZCUK.has(metin.slice(b, j + 1));
    }
    return false;
  };

  let i = 0;
  while (i < n) {
    const ch = metin[i]!;
    if (satirYorumuMu(i)) {
      const son = metin.indexOf("\n", i);
      const e = son < 0 ? n : son;
      bosalt(i, e);
      i = e;
      continue;
    }
    if (k.blokYorumu && metin.startsWith(k.blokYorumu[0], i)) {
      const son = metin.indexOf(k.blokYorumu[1], i + k.blokYorumu[0].length);
      const e = son < 0 ? n : son + k.blokYorumu[1].length;
      bosalt(i, e);
      i = e;
      continue;
    }
    if (k.ucluTirnak && (metin.startsWith('"""', i) || metin.startsWith("'''", i))) {
      const t = metin.slice(i, i + 3);
      const son = metin.indexOf(t, i + 3);
      const e = son < 0 ? n : son + 3;
      bosalt(i + 3, Math.max(i + 3, e - 3));
      i = e;
      continue;
    }
    if (k.sql && ch === "$") {
      const etiket = /^\$[A-Za-z_]*\$/.exec(metin.slice(i, i + 40));
      if (etiket) {
        const son = metin.indexOf(etiket[0], i + etiket[0].length);
        const e = son < 0 ? n : son + etiket[0].length;
        bosalt(i + etiket[0].length, Math.max(i + etiket[0].length, e - etiket[0].length));
        i = e;
        continue;
      }
    }
    if (k.karakterDegismezi && ch === "'") {
      const d = /^'(?:\\.|[^\\'\n])'/.exec(metin.slice(i, i + 12));
      if (d) {
        bosalt(i + 1, i + d[0].length - 1);
        i += d[0].length;
        continue;
      }
      i++;
      continue;
    }
    if (k.tirnaklar.includes(ch)) {
      const cok = k.cokSatirli.includes(ch);
      let j = i + 1;
      while (j < n) {
        const d = metin[j]!;
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === ch) {
          if (k.sql && metin[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        if (d === "\n" && !cok) break;
        j++;
      }
      bosalt(i + 1, Math.min(j, n));
      i = j < n && metin[j] === ch ? j + 1 : j;
      continue;
    }
    if (k.regex && ch === "/" && regexBaslarMi(i)) {
      let j = i + 1;
      let sinif = false;
      let tamam = false;
      while (j < n) {
        const d = metin[j]!;
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "\n") break;
        if (d === "[") sinif = true;
        else if (d === "]") sinif = false;
        else if (d === "/" && !sinif) {
          tamam = true;
          break;
        }
        j++;
      }
      if (tamam && j > i + 1) {
        bosalt(i + 1, j);
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return c.join("");
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

interface Metin {
  ham: string[];
  maske: string[];
  /** Satır başındaki süslü parantez derinliği (maskeli metne göre) */
  derinlik: number[];
}

function hazirla(metin: string, aile: DilAilesi): Metin {
  const ham = metin.split("\n");
  const maske = maskele(metin, aile).split("\n");
  const derinlik = new Array<number>(maske.length);
  let d = 0;
  for (let s = 0; s < maske.length; s++) {
    derinlik[s] = d;
    for (const ch of maske[s]!) {
      if (ch === "{") d++;
      else if (ch === "}") d = Math.max(0, d - 1);
    }
  }
  return { ham, maske, derinlik };
}

function girinti(satir: string): number {
  let g = 0;
  for (const ch of satir) {
    if (ch === " ") g++;
    else if (ch === "\t") g += 4;
    else break;
  }
  return g;
}

function imza(satir: string): string {
  const t = satir.trim().replace(/\s+/g, " ");
  return t.length > 160 ? `${t.slice(0, 159)}…` : t;
}

const DEVAM_SONU = /(?:[=(\[,.+\-*/%&|?:<>!~^]|=>|\b(?:extends|implements|in|of|as|new|return|await|typeof))\s*$/;
const DEVAM_BASI = /^\s*(?:[.?:+\-*/%&|^=<>,)\]]|=>|\?\.)/;

type Kip = "blok" | "ifade" | "sql";

/**
 * Bildirimin bittiği satır (0 tabanlı).
 * blok: gövdesi süslü parantezli tanım (fonksiyon, sınıf); gövde bulunamazsa bildirim satırında biter.
 * ifade: ; ile ya da devam etmeyen bir satır sonunda biten bildirim (const, type).
 * sql: ; ile, boş satırda ya da yeni CREATE'te biten deyim.
 */
function blokSonu(m: Metin, satir: number, kip: Kip): number {
  const n = m.maske.length;
  let p = 0;
  let b = 0;
  let acildi = false;
  for (let s = satir; s < n && s < satir + 5000; s++) {
    const L = m.maske[s]!;
    if (s > satir && !acildi && b === 0 && p === 0) {
      if (!L.trim()) return sonDolu(m, satir, s - 1);
      if (kip === "sql" && /^\s*create\b/i.test(L)) return sonDolu(m, satir, s - 1);
      if (kip === "blok" && s - satir > 12) return satir;
    }
    let kapandi = -1;
    for (const ch of L) {
      if (ch === "(" || ch === "[") p++;
      else if (ch === ")" || ch === "]") p = Math.max(0, p - 1);
      else if (p === 0 && ch === "{") {
        b++;
        acildi = true;
        kapandi = -1;
      } else if (p === 0 && ch === "}") {
        b--;
        if (b < 0) return Math.max(satir, s - 1);
        if (acildi && b === 0) kapandi = s;
      } else if (ch === ";" && p === 0 && b === 0) return s;
    }
    if (kapandi >= 0) return kapandi;
    if (kip === "ifade" && p === 0 && b === 0) {
      const sonraki = m.maske[s + 1] ?? "";
      if (!DEVAM_SONU.test(L) && !DEVAM_BASI.test(sonraki) && L.trim()) return s;
    }
  }
  return kip === "blok" ? satir : Math.min(n - 1, satir);
}

function sonDolu(m: Metin, bas: number, s: number): number {
  let i = s;
  while (i > bas && !m.maske[i]!.trim()) i--;
  return i;
}

/** Girintiyle biten blok: başlık satırından sonra girintisi daha büyük son dolu satır */
function girintiSonu(m: Metin, baslik: number, g: number): number {
  let son = baslik;
  for (let s = baslik + 1; s < m.maske.length; s++) {
    const L = m.maske[s]!;
    if (!L.trim()) continue;
    if (girinti(L) <= g) break;
    son = s;
  }
  return son;
}

/** Python başlığı: parantezler kapanıp ':' ile biten satır */
function pyBaslikSonu(m: Metin, satir: number): number {
  let p = 0;
  for (let s = satir; s < m.maske.length && s < satir + 60; s++) {
    for (const ch of m.maske[s]!) {
      if (ch === "(" || ch === "[" || ch === "{") p++;
      else if (ch === ")" || ch === "]" || ch === "}") p = Math.max(0, p - 1);
    }
    if (p === 0 && /:\s*$/.test(m.maske[s]!)) return s;
    if (p === 0 && s > satir) return s;
  }
  return satir;
}

/** Tanımın hemen üstündeki belge yorumu ve dekoratörler tanıma dahil edilir */
function ustYorumlar(m: Metin, bas: number, aile: DilAilesi): number {
  let s = bas - 1;
  const yorum = aile === "py" || aile === "rb" ? /^\s*(#|@)/ : /^\s*(\/\/|\/\*|\*|@|#\[)/;
  while (s >= 0 && yorum.test(m.ham[s]!) && bas - s <= 40) s--;
  return s + 1;
}

// ---------------------------------------------------------------------------
// Kapsam yürüyücü: süslü parantezli dillerde iç içe tanımlar
// ---------------------------------------------------------------------------

interface Kapsam {
  ad: string;
  tur: KodSembolTuru;
  bit: number;
  icDerinlik: number;
  disaAcik: boolean;
  /** Dile özgü işaret (rs: impl, trait) */
  isaret?: string;
}

interface Bulunan {
  ad: string;
  tur: KodSembolTuru;
  disaAcik: boolean;
  kip: Kip;
  /** İçine inilip üyeleri aranır */
  kapsayici?: boolean;
  isaret?: string;
  /** Sembol olarak yazılmaz, yalnız kapsam açar (rs impl) */
  gizli?: boolean;
}

type Eslestirici = (L: string, ust: Kapsam | null, s: number, m: Metin) => Bulunan | null;

function yuru(m: Metin, aile: DilAilesi, eslestir: Eslestirici): SembolBilgisi[] {
  const sonuc: SembolBilgisi[] = [];
  const yigin: Kapsam[] = [];
  for (let s = 0; s < m.maske.length && sonuc.length < EN_COK_SEMBOL; s++) {
    while (yigin.length && s > yigin[yigin.length - 1]!.bit) yigin.pop();
    const ust = yigin[yigin.length - 1] ?? null;
    if (m.derinlik[s] !== (ust ? ust.icDerinlik : 0)) continue;
    const L = m.maske[s]!;
    if (!L.trim() || L.length > UZUN_SATIR) continue;
    const b = eslestir(L, ust, s, m);
    if (!b) continue;
    const bit = Math.max(s, blokSonu(m, s, b.kip));
    if (!b.gizli) {
      sonuc.push({
        ad: b.ad,
        tur: b.tur,
        bas: ustYorumlar(m, s, aile) + 1,
        bit: bit + 1,
        disaAcik: b.disaAcik,
        ust: ust?.ad ?? null,
        imza: imza(m.ham[s]!),
      });
    }
    if (b.kapsayici && bit > s) yigin.push({ ad: b.ad, tur: b.tur, bit, icDerinlik: m.derinlik[s]! + 1, disaAcik: b.disaAcik, isaret: b.isaret });
    else s = bit;
  }
  return sonuc;
}

// ---------------------------------------------------------------------------
// Diller
// ---------------------------------------------------------------------------

const TS_ANAHTAR = new Set(["if", "for", "while", "switch", "catch", "return", "function", "new", "super", "this", "await", "typeof", "else", "do", "try", "with", "import", "export", "yield", "delete", "void", "throw", "case", "default"]);
const TS_FONK = /^\s*(export\s+)?(default\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const TS_SINIF = /^\s*(export\s+)?(default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const TS_ARAYUZ = /^\s*(export\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/;
const TS_TUR = /^\s*(export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^=]*>)?\s*=/;
const TS_ENUM = /^\s*(export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/;
const TS_MODUL = /^\s*(export\s+)?(?:declare\s+)?(?:namespace|module)\s+([A-Za-z_$][\w$.]*)\s*\{/;
const TS_DEGISKEN = /^\s*(export\s+)?(?:declare\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)/;
const TS_OK = /^[^=]*=\s*(?:async\s*)?(?:function\b|(?:<[^>]*>\s*)?\([^)]*\)\s*(?::[^=]*)?=>|[A-Za-z_$][\w$]*\s*=>)/;
const TS_METOD = /^\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*((?:(?:public|private|protected|static|readonly|abstract|override|async|declare|accessor|get|set)\s+)*)\*?\s*(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*(?:<[^>()]*>)?\s*\(/;
const TS_OK_OZELLIK = /^\s*((?:(?:public|private|protected|static|readonly|override)\s+)*)(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>)/;
const TS_EXPORT_LISTESI = /^\s*export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/;
const TS_EXPORT_VARSAYILAN = /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/;
const TS_COMMONJS = /^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/;

function tsSembolleri(m: Metin): SembolBilgisi[] {
  const eslestir: Eslestirici = (L, ust, s) => {
    if (ust && ust.tur === "sinif") {
      const ok = TS_OK_OZELLIK.exec(L);
      const mt = ok ?? TS_METOD.exec(L);
      if (!mt) return null;
      const ad = mt[2]!;
      if (TS_ANAHTAR.has(ad)) return null;
      const gizli = /\b(private|protected)\b/.test(mt[1] ?? "") || ad.startsWith("#");
      return { ad, tur: "metod", disaAcik: ust.disaAcik && !gizli, kip: "blok" };
    }
    if (ust && ust.tur !== "modul") return null;
    let r: RegExpExecArray | null;
    if ((r = TS_FONK.exec(L))) return { ad: r[3]!, tur: "fonksiyon", disaAcik: Boolean(r[1]), kip: "blok" };
    if ((r = TS_SINIF.exec(L))) return { ad: r[3]!, tur: "sinif", disaAcik: Boolean(r[1]), kip: "blok", kapsayici: true };
    if ((r = TS_ARAYUZ.exec(L))) return { ad: r[2]!, tur: "arayuz", disaAcik: Boolean(r[1]), kip: "blok" };
    if ((r = TS_ENUM.exec(L))) return { ad: r[2]!, tur: "enum", disaAcik: Boolean(r[1]), kip: "blok" };
    if ((r = TS_TUR.exec(L))) return { ad: r[2]!, tur: "tur", disaAcik: Boolean(r[1]), kip: "ifade" };
    if ((r = TS_MODUL.exec(L))) return { ad: r[2]!, tur: "modul", disaAcik: Boolean(r[1]) || !ust, kip: "blok", kapsayici: true };
    if ((r = TS_DEGISKEN.exec(L))) {
      const bas = m.maske.slice(s, s + 6).join("\n").slice(0, 600);
      const fonk = TS_OK.test(bas);
      return { ad: r[3]!, tur: fonk ? "fonksiyon" : r[2] === "const" ? "sabit" : "degisken", disaAcik: Boolean(r[1]), kip: "ifade" };
    }
    if ((r = TS_COMMONJS.exec(L)) && !ust) return { ad: r[1]!, tur: "fonksiyon", disaAcik: true, kip: "ifade" };
    return null;
  };
  const semboller = yuru(m, "ts", eslestir);
  // export { a, b as c } ve export default x listeleri
  const disari = new Set<string>();
  for (let s = 0; s < m.maske.length; s++) {
    if (m.derinlik[s] !== 0 || m.maske[s]!.length > UZUN_SATIR) continue;
    const L = m.maske[s]!;
    const liste = TS_EXPORT_LISTESI.exec(L);
    if (liste) for (const p of liste[1]!.split(",")) disari.add(p.trim().split(/\s+as\s+/)[0]!.replace(/^type\s+/, "").trim());
    const v = TS_EXPORT_VARSAYILAN.exec(L);
    if (v) disari.add(v[1]!);
    if (/^\s*module\.exports\s*=\s*\{/.test(L)) {
      const govde = m.maske.slice(s, s + 40).join(" ");
      const ic = /\{([^}]*)\}/.exec(govde)?.[1] ?? "";
      for (const p of ic.split(",")) disari.add(p.split(":")[0]!.trim());
    }
  }
  if (disari.size) for (const sb of semboller) if (!sb.ust && disari.has(sb.ad)) sb.disaAcik = true;
  return semboller;
}

const PY_DEF = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*[[(]/;
const PY_SINIF = /^(\s*)class\s+([A-Za-z_]\w*)/;
const PY_SABIT = /^([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=(?!=)/;

function pySembolleri(m: Metin, ham: string): SembolBilgisi[] {
  const tumu = /^__all__\s*(?::[^=]*)?=\s*[[(]([^\])]*)/m.exec(ham);
  const disari = tumu ? new Set([...tumu[1]!.matchAll(/["']([\w]+)["']/g)].map((x) => x[1]!)) : null;
  const acik = (ad: string) => (disari ? disari.has(ad) : !ad.startsWith("_"));
  const sonuc: SembolBilgisi[] = [];
  const yigin: { g: number; ad: string; tur: "sinif" | "fonksiyon" }[] = [];
  for (let s = 0; s < m.maske.length && sonuc.length < EN_COK_SEMBOL; s++) {
    const L = m.maske[s]!;
    if (!L.trim() || L.length > UZUN_SATIR) continue;
    const g = girinti(L);
    while (yigin.length && yigin[yigin.length - 1]!.g >= g) yigin.pop();
    const ust = yigin[yigin.length - 1];
    let r: RegExpExecArray | null;
    const sinifEslesmesi = PY_SINIF.exec(L);
    if ((r = sinifEslesmesi ?? PY_DEF.exec(L))) {
      const sinif = Boolean(sinifEslesmesi);
      const ad = r[2]!;
      const baslik = pyBaslikSonu(m, s);
      const bit = girintiSonu(m, baslik, g);
      yigin.push({ g, ad, tur: sinif ? "sinif" : "fonksiyon" });
      // İç içe fonksiyonlar sembol olarak yazılmaz; sınıf içindeki fonksiyonlar metottur
      if (ust && ust.tur === "fonksiyon") continue;
      const tur: KodSembolTuru = sinif ? "sinif" : ust ? "metod" : "fonksiyon";
      const disaAcik = ust ? !ad.startsWith("_") || /^__\w+__$/.test(ad) : acik(ad);
      sonuc.push({ ad, tur, bas: ustYorumlar(m, s, "py") + 1, bit: bit + 1, disaAcik, ust: ust?.ad ?? null, imza: imza(m.ham[s]!) });
      continue;
    }
    if (!ust && g === 0 && (r = PY_SABIT.exec(L))) {
      const bit = blokSonu(m, s, "ifade");
      sonuc.push({ ad: r[1]!, tur: "sabit", bas: s + 1, bit: bit + 1, disaAcik: acik(r[1]!), ust: null, imza: imza(m.ham[s]!) });
    }
  }
  return sonuc;
}

const RB_SINIF = /^(\s*)(class|module)\s+([A-Z][\w:]*)/;
const RB_DEF = /^(\s*)def\s+(self\.)?([\w?!=]+|\[\]=?|[+\-*/%<>=!~^&|]+)/;

function rbSembolleri(m: Metin): SembolBilgisi[] {
  const sonuc: SembolBilgisi[] = [];
  const yigin: { g: number; ad: string; ozel: boolean }[] = [];
  const bitBul = (s: number, g: number) => {
    for (let i = s + 1; i < m.maske.length; i++) {
      const L = m.maske[i]!;
      if (!L.trim()) continue;
      if (girinti(L) === g && /^\s*end\b/.test(L)) return i;
      if (girinti(L) < g) return i - 1;
    }
    return girintiSonu(m, s, g);
  };
  for (let s = 0; s < m.maske.length && sonuc.length < EN_COK_SEMBOL; s++) {
    const L = m.maske[s]!;
    if (!L.trim() || L.length > UZUN_SATIR) continue;
    const g = girinti(L);
    while (yigin.length && yigin[yigin.length - 1]!.g >= g) yigin.pop();
    const ust = yigin[yigin.length - 1];
    if (ust && /^\s*private\s*$/.test(L)) ust.ozel = true;
    let r: RegExpExecArray | null;
    if ((r = RB_SINIF.exec(L))) {
      const bit = bitBul(s, g);
      sonuc.push({ ad: r[3]!, tur: r[2] === "module" ? "modul" : "sinif", bas: ustYorumlar(m, s, "rb") + 1, bit: bit + 1, disaAcik: true, ust: ust?.ad ?? null, imza: imza(m.ham[s]!) });
      yigin.push({ g, ad: r[3]!, ozel: false });
    } else if ((r = RB_DEF.exec(L))) {
      const bit = bitBul(s, g);
      const ad = `${r[2] ? "self." : ""}${r[3]!}`;
      sonuc.push({ ad, tur: ust ? "metod" : "fonksiyon", bas: ustYorumlar(m, s, "rb") + 1, bit: bit + 1, disaAcik: !ust?.ozel, ust: ust?.ad ?? null, imza: imza(m.ham[s]!) });
      s = bit;
    }
  }
  return sonuc;
}

const GO_FONK = /^func\s+(?:\(\s*(?:\w+\s+)?\*?\s*([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*\)\s*)?([A-Za-z_]\w*)\s*[[(]/;
const GO_TUR = /^type\s+([A-Za-z_]\w*)(?:\[[^\]]*\])?\s+(struct|interface)?/;
const GO_GRUP = /^(type|const|var)\s*\(\s*$/;
const GO_DEGER = /^(const|var)\s+([A-Za-z_]\w*)/;

function goSembolleri(m: Metin): SembolBilgisi[] {
  const acik = (ad: string) => /^\p{Lu}/u.test(ad);
  const sonuc: SembolBilgisi[] = [];
  for (let s = 0; s < m.maske.length && sonuc.length < EN_COK_SEMBOL; s++) {
    if (m.derinlik[s] !== 0 || m.maske[s]!.length > UZUN_SATIR) continue;
    const L = m.maske[s]!;
    let r: RegExpExecArray | null;
    const ekle = (ad: string, tur: KodSembolTuru, bit: number, ust: string | null = null) =>
      sonuc.push({ ad, tur, bas: ustYorumlar(m, s, "go") + 1, bit: bit + 1, disaAcik: acik(ad), ust, imza: imza(m.ham[s]!) });
    if ((r = GO_FONK.exec(L))) {
      const bit = blokSonu(m, s, "blok");
      ekle(r[2]!, r[1] ? "metod" : "fonksiyon", bit, r[1] ?? null);
      s = bit;
    } else if ((r = GO_GRUP.exec(L))) {
      // type ( … ), const ( … ), var ( … ) grupları: her satır ayrı sembol
      const grup = r[1]!;
      let p = 1;
      let i = s + 1;
      for (; i < m.maske.length && p > 0; i++) {
        const G = m.maske[i]!;
        const ad = /^\s+([A-Za-z_]\w*)/.exec(G)?.[1];
        const bas = p;
        for (const ch of G) {
          if (ch === "(") p++;
          else if (ch === ")") p--;
        }
        if (!ad || bas !== 1 || ad === "_") continue;
        const tur: KodSembolTuru = grup === "type" ? (/\bstruct\b/.test(G) ? "yapi" : /\binterface\b/.test(G) ? "arayuz" : "tur") : grup === "const" ? "sabit" : "degisken";
        const bit = /[{]\s*$/.test(G) ? blokSonu(m, i, "blok") : i;
        sonuc.push({ ad, tur, bas: i + 1, bit: bit + 1, disaAcik: acik(ad), ust: null, imza: imza(m.ham[i]!) });
      }
      s = i - 1;
    } else if ((r = GO_TUR.exec(L))) {
      const bit = blokSonu(m, s, r[2] ? "blok" : "ifade");
      ekle(r[1]!, r[2] === "struct" ? "yapi" : r[2] === "interface" ? "arayuz" : "tur", bit);
      s = bit;
    } else if ((r = GO_DEGER.exec(L))) {
      const bit = blokSonu(m, s, "ifade");
      ekle(r[2]!, r[1] === "const" ? "sabit" : "degisken", bit);
      s = bit;
    }
  }
  return sonuc;
}

const RS_FN = /^\s*(pub(?:\s*\([^)]*\))?\s+)?(?:default\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+(?:"[^"]*"\s+)?)?fn\s+([A-Za-z_]\w*)/;
const RS_OGE = /^\s*(pub(?:\s*\([^)]*\))?\s+)?(struct|enum|trait|union|type|mod|const|static)\s+(?:mut\s+)?([A-Za-z_]\w*)/;
const RS_IMPL = /^\s*(?:unsafe\s+)?impl\b(?:\s*<[^{]*?>)?\s+(?:[\w:]+(?:<[^{]*?>)?\s+for\s+)?([A-Za-z_][\w:]*)/;
const RS_MAKRO = /^\s*macro_rules!\s*([A-Za-z_]\w*)/;

function rsSembolleri(m: Metin): SembolBilgisi[] {
  return yuru(m, "rs", (L, ust) => {
    let r: RegExpExecArray | null;
    if ((r = RS_FN.exec(L))) {
      const uye = ust && (ust.isaret === "impl" || ust.isaret === "trait");
      return { ad: r[2]!, tur: uye ? "metod" : "fonksiyon", disaAcik: Boolean(r[1]) || ust?.isaret === "trait", kip: "blok" };
    }
    if (ust && ust.isaret !== "mod") return null;
    if ((r = RS_IMPL.exec(L))) return { ad: r[1]!.split("::").pop()!, tur: "yapi", disaAcik: true, kip: "blok", kapsayici: true, isaret: "impl", gizli: true };
    if ((r = RS_OGE.exec(L))) {
      const tur = r[2]!;
      const harita: Record<string, KodSembolTuru> = { struct: "yapi", enum: "enum", trait: "arayuz", union: "yapi", type: "tur", mod: "modul", const: "sabit", static: "degisken" };
      const blok = tur === "struct" || tur === "enum" || tur === "trait" || tur === "union" || (tur === "mod" && /\{\s*$/.test(L));
      return { ad: r[3]!, tur: harita[tur]!, disaAcik: Boolean(r[1]), kip: blok ? "blok" : "ifade", kapsayici: tur === "trait" || tur === "mod", isaret: tur === "trait" ? "trait" : tur === "mod" ? "mod" : undefined };
    }
    if ((r = RS_MAKRO.exec(L))) return { ad: r[1]!, tur: "fonksiyon", disaAcik: false, kip: "blok" };
    return null;
  });
}

const JAVA_KAPSAYICI = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*((?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp)\s+)*)(class|interface|enum|record|@interface)\s+([A-Za-z_]\w*)/;
const JAVA_METOD = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*((?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*)(?:<[^>]+>\s+)?([\w.$<>[\]?,]+(?:\s*<[^>]*>)?(?:\[\])*)\s+([A-Za-z_]\w*)\s*\(/;
const JAVA_KURUCU = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*((?:public|protected|private)\s+)?([A-Z]\w*)\s*\(/;
const JAVA_SABIT = /^\s*((?:(?:public|protected|private)\s+)?)static\s+final\s+[\w.<>[\], ]+\s+([A-Z_][A-Z0-9_]*)\s*=/;
const JAVA_ANAHTAR = new Set(["return", "new", "else", "throw", "case", "if", "for", "while", "switch", "catch", "synchronized", "try"]);

function javaSembolleri(m: Metin): SembolBilgisi[] {
  return yuru(m, "java", (L, ust) => {
    let r: RegExpExecArray | null;
    if ((r = JAVA_KAPSAYICI.exec(L))) {
      const tur: KodSembolTuru = r[2] === "enum" ? "enum" : r[2] === "interface" || r[2] === "@interface" ? "arayuz" : "sinif";
      return { ad: r[3]!, tur, disaAcik: /\bpublic\b/.test(r[1] ?? "") || ust?.tur === "arayuz", kip: "blok", kapsayici: true };
    }
    if (!ust) return null;
    if ((r = JAVA_SABIT.exec(L))) return { ad: r[2]!, tur: "sabit", disaAcik: /\bpublic\b/.test(r[1] ?? ""), kip: "ifade" };
    if ((r = JAVA_KURUCU.exec(L)) && r[2] === ust.ad) return { ad: r[2]!, tur: "metod", disaAcik: /\bpublic\b/.test(r[1] ?? ""), kip: "blok" };
    if ((r = JAVA_METOD.exec(L)) && !JAVA_ANAHTAR.has(r[2]!) && !JAVA_ANAHTAR.has(r[3]!)) {
      return { ad: r[3]!, tur: "metod", disaAcik: /\bpublic\b/.test(r[1] ?? "") || ust.tur === "arayuz", kip: "blok" };
    }
    return null;
  });
}

const KT_KAPSAYICI = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*((?:(?:public|private|internal|protected|abstract|open|sealed|data|enum|annotation|inner|value|inline|expect|actual|companion)\s+)*)(class|interface|object)\s*([A-Za-z_]\w*)?/;
const KT_FUN = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*((?:(?:public|private|internal|protected|override|open|abstract|final|suspend|inline|operator|infix|tailrec|external|actual|expect)\s+)*)fun\s+(?:<[^>]+>\s+)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/;
const KT_DEGER = /^\s*((?:(?:public|private|internal|protected|const|lateinit|override)\s+)*)(val|var)\s+([A-Za-z_]\w*)/;
const KT_TAKMA = /^\s*((?:public|private|internal)\s+)?typealias\s+([A-Za-z_]\w*)/;

function ktSembolleri(m: Metin): SembolBilgisi[] {
  const acik = (mod: string | undefined) => !/\b(private|internal)\b/.test(mod ?? "");
  return yuru(m, "kt", (L, ust) => {
    let r: RegExpExecArray | null;
    if ((r = KT_KAPSAYICI.exec(L))) {
      const ad = r[3] ?? (/\bcompanion\b/.test(r[1] ?? "") ? "Companion" : null);
      if (!ad) return null;
      const tur: KodSembolTuru = /\benum\b/.test(r[1] ?? "") ? "enum" : r[2] === "interface" ? "arayuz" : "sinif";
      return { ad, tur, disaAcik: acik(r[1]) && (!ust || ust.disaAcik), kip: "blok", kapsayici: true };
    }
    if ((r = KT_FUN.exec(L))) return { ad: r[2]!, tur: ust ? "metod" : "fonksiyon", disaAcik: acik(r[1]) && (!ust || ust.disaAcik), kip: "blok" };
    if ((r = KT_TAKMA.exec(L)) && !ust) return { ad: r[2]!, tur: "tur", disaAcik: acik(r[1]), kip: "ifade" };
    if ((r = KT_DEGER.exec(L)) && (!ust || /\bconst\b/.test(r[1] ?? ""))) {
      return { ad: r[3]!, tur: r[2] === "val" ? "sabit" : "degisken", disaAcik: acik(r[1]), kip: "ifade" };
    }
    return null;
  });
}

const CS_AD_ALANI = /^\s*namespace\s+([\w.]+)\s*(;|\{|$)/;
const CS_KAPSAYICI = /^\s*(?:\[[^\]]*\]\s*)*((?:(?:public|private|protected|internal|static|sealed|abstract|partial|readonly|ref|unsafe|new|file)\s+)*)(class|interface|struct|enum|record(?:\s+(?:class|struct))?)\s+([A-Za-z_]\w*)/;
const CS_METOD = /^\s*(?:\[[^\]]*\]\s*)*((?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial|readonly)\s+)*)([\w.<>[\]?,]+(?:\s*<[^>]*>)?)\s+([A-Za-z_]\w*)\s*(?:<[^>()]*>)?\s*\(/;
const CS_KURUCU = /^\s*((?:public|private|protected|internal|static)\s+)*([A-Z]\w*)\s*\(/;

function csSembolleri(m: Metin): SembolBilgisi[] {
  return yuru(m, "cs", (L, ust) => {
    let r: RegExpExecArray | null;
    if ((r = CS_AD_ALANI.exec(L)) && (!ust || ust.tur === "modul")) {
      return { ad: r[1]!, tur: "modul", disaAcik: true, kip: r[2] === ";" ? "ifade" : "blok", kapsayici: r[2] !== ";" };
    }
    if ((r = CS_KAPSAYICI.exec(L))) {
      const tur: KodSembolTuru = r[2] === "enum" ? "enum" : r[2] === "interface" ? "arayuz" : r[2] === "struct" ? "yapi" : "sinif";
      return { ad: r[3]!, tur, disaAcik: /\bpublic\b/.test(r[1] ?? ""), kip: "blok", kapsayici: true };
    }
    if (!ust || ust.tur === "modul") return null;
    if ((r = CS_KURUCU.exec(L)) && r[2] === ust.ad) return { ad: r[2]!, tur: "metod", disaAcik: /\bpublic\b/.test(r[1] ?? ""), kip: "blok" };
    if ((r = CS_METOD.exec(L)) && !JAVA_ANAHTAR.has(r[2]!) && !JAVA_ANAHTAR.has(r[3]!)) {
      return { ad: r[3]!, tur: "metod", disaAcik: /\bpublic\b/.test(r[1] ?? "") || ust.tur === "arayuz", kip: "blok" };
    }
    return null;
  });
}

const PHP_AD_ALANI = /^\s*namespace\s+([\w\\]+)\s*;/;
const PHP_KAPSAYICI = /^\s*((?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)/;
const PHP_FONK = /^\s*((?:(?:public|private|protected|static|abstract|final)\s+)*)function\s+&?\s*([A-Za-z_]\w*)\s*\(/;
const PHP_SABIT = /^\s*((?:public|private|protected|final)\s+)*const\s+([A-Za-z_]\w*)/;

function phpSembolleri(m: Metin): SembolBilgisi[] {
  return yuru(m, "php", (L, ust) => {
    let r: RegExpExecArray | null;
    if ((r = PHP_AD_ALANI.exec(L)) && !ust) return { ad: r[1]!, tur: "modul", disaAcik: true, kip: "ifade" };
    if ((r = PHP_KAPSAYICI.exec(L))) {
      const tur: KodSembolTuru = r[2] === "interface" ? "arayuz" : r[2] === "enum" ? "enum" : "sinif";
      return { ad: r[3]!, tur, disaAcik: true, kip: "blok", kapsayici: true };
    }
    if ((r = PHP_FONK.exec(L))) return { ad: r[2]!, tur: ust ? "metod" : "fonksiyon", disaAcik: !/\b(private|protected)\b/.test(r[1] ?? ""), kip: "blok" };
    if ((r = PHP_SABIT.exec(L))) return { ad: r[2]!, tur: "sabit", disaAcik: !/\b(private|protected)\b/.test(r[1] ?? ""), kip: "ifade" };
    return null;
  });
}

const SW_KAPSAYICI = /^\s*(?:@\w+\s+)*((?:(?:public|private|fileprivate|internal|open|final|indirect)\s+)*)(class|struct|enum|protocol|extension|actor)\s+([A-Za-z_][\w.]*)/;
const SW_FUNC = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*((?:(?:public|private|fileprivate|internal|open|static|class|final|override|mutating|nonmutating|convenience|required|nonisolated)\s+)*)(?:func\s+([A-Za-z_]\w*|[^\s(<]+)|(init|deinit)\b)/;
const SW_DEGER = /^\s*((?:(?:public|private|fileprivate|internal|open|static)\s+)*)(let|var)\s+([A-Za-z_]\w*)/;

function swiftSembolleri(m: Metin): SembolBilgisi[] {
  const acik = (mod: string | undefined) => /\b(public|open)\b/.test(mod ?? "");
  return yuru(m, "swift", (L, ust) => {
    let r: RegExpExecArray | null;
    if ((r = SW_KAPSAYICI.exec(L))) {
      const harita: Record<string, KodSembolTuru> = { class: "sinif", struct: "yapi", enum: "enum", protocol: "arayuz", extension: "sinif", actor: "sinif" };
      return { ad: r[3]!, tur: harita[r[2]!]!, disaAcik: acik(r[1]), kip: "blok", kapsayici: true };
    }
    if ((r = SW_FUNC.exec(L))) return { ad: r[2] ?? r[3]!, tur: ust ? "metod" : "fonksiyon", disaAcik: acik(r[1]), kip: "blok" };
    if (!ust && (r = SW_DEGER.exec(L))) return { ad: r[3]!, tur: r[2] === "let" ? "sabit" : "degisken", disaAcik: acik(r[1]), kip: "ifade" };
    return null;
  });
}

const C_AD_ALANI = /^\s*namespace\s+([A-Za-z_][\w:]*)\s*\{?\s*$/;
const C_KAPSAYICI = /^\s*(?:template\s*<[^>]*>\s*)?(?:typedef\s+)?(struct|class|union|enum(?:\s+class)?)\s+(?:\w+\s+)?([A-Za-z_]\w*)\s*(?::[^{;]*)?\{?\s*$/;
const C_FONK = /^\s*(?:template\s*<[^>]*>\s*)?((?:(?:static|inline|extern|virtual|constexpr|explicit|friend|const|unsigned|signed|struct|enum|long|short|volatile|__inline|__forceinline)\s+)*)(?:[\w:<>,]+[\s*&]+)+\**&?((?:[A-Za-z_]\w*::)*~?[A-Za-z_]\w*)\s*\(([^;]*)$/;
const C_TANIM = /^\s*#\s*define\s+([A-Za-z_]\w*)/;
const C_ANAHTAR = new Set(["if", "for", "while", "switch", "return", "else", "sizeof", "case", "do", "catch", "new", "delete", "throw"]);

function cSembolleri(m: Metin): SembolBilgisi[] {
  const sonuc = yuru(m, "c", (L, ust) => {
    let r: RegExpExecArray | null;
    if ((r = C_AD_ALANI.exec(L)) && (!ust || ust.tur === "modul")) return { ad: r[1]!, tur: "modul", disaAcik: true, kip: "blok", kapsayici: true };
    if ((r = C_KAPSAYICI.exec(L))) {
      const tur: KodSembolTuru = r[1]!.startsWith("enum") ? "enum" : r[1] === "class" ? "sinif" : "yapi";
      return { ad: r[2]!, tur, disaAcik: true, kip: "blok", kapsayici: tur !== "enum" };
    }
    if ((r = C_FONK.exec(L))) {
      const ad = r[2]!;
      if (C_ANAHTAR.has(ad) || /^\s*(return|else|case)\b/.test(L)) return null;
      return { ad, tur: ust && ust.tur !== "modul" ? "metod" : ad.includes("::") ? "metod" : "fonksiyon", disaAcik: !/\bstatic\b/.test(r[1] ?? ""), kip: "blok" };
    }
    return null;
  });
  // #define her derinlikte (önişlemci)
  for (let s = 0; s < m.maske.length && sonuc.length < EN_COK_SEMBOL; s++) {
    const r = C_TANIM.exec(m.maske[s]!);
    if (!r) continue;
    let bit = s;
    while (bit + 1 < m.ham.length && /\\\s*$/.test(m.ham[bit]!)) bit++;
    sonuc.push({ ad: r[1]!, tur: "sabit", bas: s + 1, bit: bit + 1, disaAcik: true, ust: null, imza: imza(m.ham[s]!) });
  }
  return sonuc.sort((a, b) => a.bas - b.bas);
}

const SQL_OLUSTUR = /^\s*create\s+(?:or\s+replace\s+)?(?:(?:global\s+|local\s+)?temp(?:orary)?\s+)?(?:unique\s+)?(table|view|materialized\s+view|index|function|procedure|trigger|type|schema|sequence)\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/i;

function sqlSembolleri(m: Metin): SembolBilgisi[] {
  const sonuc: SembolBilgisi[] = [];
  for (let s = 0; s < m.maske.length && sonuc.length < EN_COK_SEMBOL; s++) {
    if (m.maske[s]!.length > UZUN_SATIR) continue;
    const r = SQL_OLUSTUR.exec(m.maske[s]!);
    if (!r) continue;
    const tur = r[1]!.toLowerCase();
    const harita: Record<string, KodSembolTuru> = { table: "tablo", view: "tablo", index: "degisken", function: "fonksiyon", procedure: "fonksiyon", trigger: "fonksiyon", type: "tur", schema: "modul", sequence: "degisken" };
    const ad = r[2]!.replace(/["`[\]]/g, "");
    const bit = blokSonu(m, s, "sql");
    sonuc.push({ ad, tur: harita[tur] ?? "tablo", bas: s + 1, bit: bit + 1, disaAcik: true, ust: null, imza: imza(m.ham[s]!) });
    s = bit;
  }
  return sonuc;
}

function mdSembolleri(m: Metin): SembolBilgisi[] {
  const basliklar: { ad: string; duzey: number; s: number }[] = [];
  let cit: string | null = null;
  for (let s = 0; s < m.ham.length; s++) {
    const L = m.ham[s]!;
    const c = /^\s{0,3}(`{3,}|~{3,})/.exec(L);
    if (c) {
      if (!cit) cit = c[1]![0]!;
      else if (c[1]![0] === cit) cit = null;
      continue;
    }
    if (cit) continue;
    const r = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(L);
    if (r) basliklar.push({ ad: r[2]!.replace(/[`*_]/g, ""), duzey: r[1]!.length, s });
    else if (s > 0 && /^\s{0,3}(=+|-+)\s*$/.test(L) && m.ham[s - 1]!.trim() && !/^\s{0,3}[-*+>|#]/.test(m.ham[s - 1]!)) {
      basliklar.push({ ad: m.ham[s - 1]!.trim(), duzey: L.includes("=") ? 1 : 2, s: s - 1 });
    }
  }
  const sonuc: SembolBilgisi[] = [];
  const yigin: { ad: string; duzey: number }[] = [];
  for (let i = 0; i < basliklar.length && sonuc.length < EN_COK_SEMBOL; i++) {
    const b = basliklar[i]!;
    let bit = m.ham.length - 1;
    for (let j = i + 1; j < basliklar.length; j++) {
      if (basliklar[j]!.duzey <= b.duzey) {
        bit = basliklar[j]!.s - 1;
        break;
      }
    }
    while (yigin.length && yigin[yigin.length - 1]!.duzey >= b.duzey) yigin.pop();
    sonuc.push({ ad: b.ad.slice(0, 120), tur: "baslik", bas: b.s + 1, bit: Math.max(b.s, sonDolu(m, b.s, bit)) + 1, disaAcik: false, ust: yigin[yigin.length - 1]?.ad ?? null, imza: imza(m.ham[b.s]!) });
    yigin.push({ ad: b.ad.slice(0, 120), duzey: b.duzey });
  }
  return sonuc;
}

function cssSembolleri(m: Metin): SembolBilgisi[] {
  return yuru(m, "css", (L, ust, s) => {
    let r: RegExpExecArray | null;
    if ((r = /^\s*@(mixin|function)\s+([\w-]+)/.exec(L)) && !ust) return { ad: r[2]!, tur: "fonksiyon", disaAcik: true, kip: "blok" };
    if (!ust && (r = /^\s*(\$[\w-]+)\s*:/.exec(L))) return { ad: r[1]!, tur: "degisken", disaAcik: true, kip: "ifade" };
    if (!/\{\s*$/.test(L) && !/\{[^}]*\}\s*$/.test(L)) return null;
    // Seçici maskesiz satırdan alınır ([data-tur="tercih"] gibi dizgeler korunur)
    const secici = m.ham[s]!.slice(0, L.indexOf("{")).trim();
    if (!secici) return null;
    if (ust && ust.ad.startsWith("@") === false) return null;
    const kural = secici.startsWith("@");
    if (kural && !/^@(media|supports|layer|container|keyframes|font-face|page|document)\b/.test(secici)) return null;
    return { ad: secici.replace(/\s+/g, " ").slice(0, 100), tur: "secici", disaAcik: false, kip: "blok", kapsayici: kural && !/^@(keyframes|font-face)/.test(secici) };
  });
}

// ---------------------------------------------------------------------------
// İçe aktarmalar
// ---------------------------------------------------------------------------

function satirBulucu(metin: string): (konum: number) => number {
  const baslar = [0];
  for (let i = metin.indexOf("\n"); i >= 0; i = metin.indexOf("\n", i + 1)) baslar.push(i + 1);
  return (konum) => {
    let a = 0;
    let u = baslar.length - 1;
    while (a < u) {
      const o = (a + u + 1) >> 1;
      if (baslar[o]! <= konum) a = o;
      else u = o - 1;
    }
    return a + 1;
  };
}

function adlariAyir(liste: string): string[] {
  return liste
    .replace(/[{}()]/g, " ")
    .split(",")
    .map((p) => p.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())
    .filter((p) => p && /^[\w$*\\.]+$/.test(p))
    .slice(0, 40);
}

function iceAktarmalar(metin: string, maske: string, aile: DilAilesi): IceAktarmaBilgisi[] {
  const satir = satirBulucu(metin);
  const sonuc: IceAktarmaBilgisi[] = [];
  /** Eşleşmenin anahtar sözcüğü yorum ya da dizge içinde değilse kaydeder */
  const ekle = (konum: number, kaynak: string, adlar: string[] = [], tur?: "yol") => {
    let k = konum;
    while (k < metin.length && /\s/.test(metin[k]!)) k++;
    if (maske[k] !== metin[k] || !kaynak || sonuc.length >= EN_COK_ICE_AKTARMA) return;
    sonuc.push({ kaynak: kaynak.trim(), satir: satir(k), adlar, ...(tur ? { tur } : {}) });
  };
  const her = (re: RegExp, f: (m: RegExpExecArray) => void) => {
    for (const m of metin.matchAll(re)) f(m as RegExpExecArray);
  };
  switch (aile) {
    case "ts":
      her(/\bimport\s+(?:type\s+)?([\w$*{}\s,]+?)\s+from\s*(["'])([^"'\n]+)\2/g, (m) => ekle(m.index, m[3]!, adlariAyir(m[1]!.replace(/\*\s+as\s+[\w$]+/, "*"))));
      her(/\bimport\s*(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, m[2]!));
      her(/\bexport\s+(?:type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(["'])([^"'\n]+)\2/g, (m) => ekle(m.index, m[3]!, adlariAyir(m[1]!.startsWith("*") ? "*" : m[1]!)));
      her(/\brequire\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g, (m) => ekle(m.index, m[2]!));
      her(/\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g, (m) => ekle(m.index, m[2]!));
      // Dosya başvuruları: path.join(__dirname, "public", "index.html"), __dirname + "/x", new URL("./x", import.meta.url),
      // Worker, importScripts, serviceWorker.register, express.static("public"), readFileSync("./veri.json")
      her(/\b(?:path\s*\.\s*)?(?:join|resolve)\s*\(\s*(__dirname|process\s*\.\s*cwd\s*\(\s*\))\s*((?:,\s*(["'])[^"'\n]*\3\s*)+)\)/g, (m) =>
        ekle(m.index, dosyaBasvurusu(m[1] === "__dirname" ? "." : "/", [...m[2]!.matchAll(/(["'])([^"'\n]*)\1/g)].map((x) => x[2]!)), [], "yol"),
      );
      her(/\b__dirname\s*\+\s*(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, dosyaBasvurusu(".", [m[2]!]), [], "yol"));
      her(/\bnew\s+URL\s*\(\s*(["'])(\.{0,2}\/[^"'\n]+)\1\s*,\s*import\s*\.\s*meta\s*\.\s*url\s*\)/g, (m) => ekle(m.index, m[2]!, [], "yol"));
      her(/(?:\bnew\s+(?:Shared)?Worker|\bimportScripts|\.register)\s*\(\s*(["'])([^"'\n]+\.[cm]?[jt]s)\1/g, (m) => ekle(m.index, m[2]!, [], "yol"));
      her(/\bexpress\s*\.\s*static\s*\(\s*(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, dosyaBasvurusu("/", [m[2]!]), [], "yol"));
      her(/\b(?:readFileSync|readFile|createReadStream)\s*\(\s*(["'])(\.\/[^"'\n]+)\1/g, (m) => ekle(m.index, dosyaBasvurusu("/", [m[2]!]), [], "yol"));
      // Sunucu görünümleri: res.render("menu") → views/menu.ejs
      her(/\.render\s*\(\s*(["'])(\w[\w./-]*)\1/g, (m) => ekle(m.index, `render:${m[2]!}`, [], "yol"));
      break;
    case "py":
      her(/^[ \t]*import[ \t]+([\w. \t,]+)/gm, (m) => {
        for (const p of m[1]!.split(",")) ekle(m.index, p.trim().split(/\s+as\s+/)[0]!);
      });
      her(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#;]+)/gm, (m) => ekle(m.index, m[1]!, adlariAyir(m[2]!)));
      // Şablonlar: Flask render_template, Django render, FastAPI/Starlette TemplateResponse
      her(/\b(?:render_template|TemplateResponse)\s*\(\s*(?:\w+\s*,\s*)?(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, `render:${m[2]!}`, [], "yol"));
      her(/\brender\s*\(\s*\w+\s*,\s*(["'])([^"'\n]+\.html?)\1/g, (m) => ekle(m.index, `render:${m[2]!}`, [], "yol"));
      break;
    case "go":
      her(/^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"]+)"/gm, (m) => ekle(m.index, m[1]!));
      her(/^[ \t]*import[ \t]*\(([\s\S]*?)\)/gm, (m) => {
        const bas = m.index + m[0].indexOf("(") + 1;
        for (const ic of m[1]!.matchAll(/(?:^|\n)[ \t]*(?:[\w.]+[ \t]+)?"([^"]+)"/g)) ekle(bas + ic.index, ic[1]!);
      });
      break;
    case "rs":
      her(/^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?use[ \t]+([^;]+);/gm, (m) => {
        const yol = m[1]!.replace(/\s+/g, "");
        const grup = /^(.*?)::\{(.*)\}$/.exec(yol);
        if (grup) ekle(m.index, grup[1]!, adlariAyir(grup[2]!));
        else ekle(m.index, yol.replace(/::\*$/, ""), [yol.split("::").pop()!]);
      });
      her(/^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?mod[ \t]+([A-Za-z_]\w*)[ \t]*;/gm, (m) => ekle(m.index, `mod ${m[1]!}`));
      break;
    case "java":
    case "kt":
      her(/^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+?)(?:\.\*)?[ \t]*(?:as[ \t]+\w+)?[ \t]*;?[ \t]*$/gm, (m) => ekle(m.index, m[1]!, [m[1]!.split(".").pop()!]));
      break;
    case "cs":
      her(/^[ \t]*(?:global[ \t]+)?using[ \t]+(?:static[ \t]+)?(?:\w+[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm, (m) => ekle(m.index, m[1]!));
      break;
    case "php":
      her(/^[ \t]*use[ \t]+(?:function[ \t]+|const[ \t]+)?([\w\\]+)/gm, (m) => ekle(m.index, m[1]!.replace(/^\\/, ""), [m[1]!.split("\\").pop()!]));
      her(/\b(?:require|include)(?:_once)?\s*\(?\s*(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, m[2]!));
      her(/\b(?:require|include)(?:_once)?\s*\(?\s*__DIR__\s*\.\s*(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, dosyaBasvurusu(".", [m[2]!])));
      break;
    case "rb":
      her(/\brequire_relative\s*\(?\s*(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, m[2]!.startsWith(".") ? m[2]! : `./${m[2]!}`));
      her(/\brequire\s*\(?\s*(["'])([^"'\n]+)\1/g, (m) => ekle(m.index, m[2]!));
      break;
    case "swift":
      her(/^[ \t]*(?:@\w+[ \t]+)?import[ \t]+(?:(?:class|struct|enum|protocol|func|var|let|typealias)[ \t]+)?([\w.]+)/gm, (m) => ekle(m.index, m[1]!));
      break;
    case "c":
      her(/^[ \t]*#[ \t]*include[ \t]*([<"])([^>"\n]+)[>"]/gm, (m) => ekle(m.index, m[1] === "<" ? `<${m[2]!}>` : m[2]!));
      break;
    case "css":
      her(/@(?:import|use|forward)\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1/g, (m) => ekle(m.index, m[2]!));
      break;
    default:
      break;
  }
  return sonuc;
}

// ---------------------------------------------------------------------------
// Giriş
// ---------------------------------------------------------------------------

/** Kodda yazılı dosya yolu parçalarından belirteç: "." taban dosyanın klasörüne göre (./a/b), "/" köke göre (/a/b) */
function dosyaBasvurusu(taban: "." | "/", parcalar: string[]): string {
  const n = path.posix.normalize(parcalar.map((p) => p.replace(/\\/g, "/")).join("/")).replace(/^\/+/, "");
  const y = n === "." ? "" : n;
  if (taban === "/") return `/${y}`;
  return y === ".." || y.startsWith("../") ? y : `./${y}`;
}

export function cozumle(metin: string, aile: DilAilesi): Cozumleme {
  if (aile === "metin") return { semboller: [], iceAktarmalar: [] };
  if (aile === "html") return { semboller: [], iceAktarmalar: htmlIceAktarmalari(metin, (m, a) => iceAktarmalar(m, maskele(m, a), a)) };
  const m = hazirla(metin, aile);
  let semboller: SembolBilgisi[];
  switch (aile) {
    case "ts":
      semboller = tsSembolleri(m);
      break;
    case "py":
      semboller = pySembolleri(m, metin);
      break;
    case "rb":
      semboller = rbSembolleri(m);
      break;
    case "go":
      semboller = goSembolleri(m);
      break;
    case "rs":
      semboller = rsSembolleri(m);
      break;
    case "java":
      semboller = javaSembolleri(m);
      break;
    case "kt":
      semboller = ktSembolleri(m);
      break;
    case "cs":
      semboller = csSembolleri(m);
      break;
    case "php":
      semboller = phpSembolleri(m);
      break;
    case "swift":
      semboller = swiftSembolleri(m);
      break;
    case "c":
      semboller = cSembolleri(m);
      break;
    case "sql":
      semboller = sqlSembolleri(m);
      break;
    case "md":
      semboller = mdSembolleri(m);
      break;
    case "css":
      semboller = cssSembolleri(m);
      break;
  }
  const maske = m.maske.join("\n");
  return { semboller: semboller.slice(0, EN_COK_SEMBOL), iceAktarmalar: iceAktarmalar(metin, maske, aile) };
}
