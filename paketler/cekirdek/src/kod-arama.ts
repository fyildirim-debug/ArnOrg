// Kod düzenleyici için hızlı açma listesi ve çalışma alanında metin araması.
// Dosya listesi git'ten gelir (.gitignore'a uyar); arama Node'da JavaScript düzenli ifadeleriyle yapılır,
// böylece VS Code'un arama kutusundaki düzenli ifade, büyük/küçük harf ve tam sözcük anlamı birebir korunur.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { MetinAramaEslesmesi, MetinAramaSonucu } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { YOK_SAYILAN } from "./dosyalar.js";
import { git, repoMu } from "./git.js";
import { ArnorgHatasi } from "./yardimci.js";

/** Git deposu olmayan klasörde dolaşılacak en çok dosya */
const DOLASMA_SINIRI = 200_000;
const ONIZLEME_SINIRI = 300;
const ONIZLEME_ONCESI = 60;

/** Çalışma alanındaki dosyaların köke göre yolları (/ ayraçlı, sıralı). Git deposunda izlenen ve
 * yok sayılmayan izlenmeyen dosyalar; değilse YOK_SAYILAN klasörleri atlanarak dolaşılır. */
export async function dosyaListesi(kok: string): Promise<string[]> {
  if (await repoMu(kok)) {
    const [hepsi, silinen] = await Promise.all([
      git(kok, ["-c", "core.quotePath=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard"]),
      git(kok, ["-c", "core.quotePath=false", "ls-files", "-z", "--deleted"]),
    ]);
    const silinenler = new Set(silinen.split("\0").filter(Boolean));
    const sonuc = new Set<string>();
    for (const y of hepsi.split("\0")) if (y && !silinenler.has(y)) sonuc.add(y);
    return [...sonuc].sort();
  }
  const sonuc: string[] = [];
  const dolas = (dizin: string, goreli: string) => {
    if (sonuc.length >= DOLASMA_SINIRI) return;
    let girdiler: fs.Dirent[];
    try {
      girdiler = fs.readdirSync(dizin, { withFileTypes: true });
    } catch {
      return;
    }
    for (const g of girdiler) {
      if (sonuc.length >= DOLASMA_SINIRI) return;
      if (YOK_SAYILAN.has(g.name)) continue;
      const y = goreli ? `${goreli}/${g.name}` : g.name;
      if (g.isDirectory()) dolas(path.join(dizin, g.name), y);
      else if (g.isFile() || g.isSymbolicLink()) sonuc.push(y);
    }
  };
  dolas(kok, "");
  return sonuc.sort();
}

// ---------------------------------------------------------------------------
// Glob (VS Code sözdizimi: **, *, ?, {a,b}, [abc], [!abc])
// ---------------------------------------------------------------------------

function kacir(k: string): string {
  return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globParcasi(g: string): string {
  let s = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === "*") {
      if (g[i + 1] === "*") {
        // ** bütün bir yol parçası olarak gelir: "**/" (sıfır ya da daha çok klasör), sonda "/**" (her şey) ya da tek başına
        const onceAyrac = i === 0 || g[i - 1] === "/";
        const sonraAyrac = i + 2 >= g.length || g[i + 2] === "/";
        if (onceAyrac && sonraAyrac) {
          if (g[i + 2] === "/") {
            s += "(?:[^/]*/)*";
            i += 2;
          } else if (s.endsWith("/")) {
            s = `${s.slice(0, -1)}(?:/.*)?`;
            i += 1;
          } else {
            s += ".*";
            i += 1;
          }
          continue;
        }
        s += "[^/]*";
        i += 1;
        continue;
      }
      s += "[^/]*";
    } else if (c === "?") {
      s += "[^/]";
    } else if (c === "{") {
      // Eşleşen kapanış parantezini bul (iç içe destekli)
      let derinlik = 0;
      let j = i;
      for (; j < g.length; j++) {
        if (g[j] === "{") derinlik++;
        else if (g[j] === "}" && --derinlik === 0) break;
      }
      if (j >= g.length) {
        s += "\\{";
        continue;
      }
      const ic = g.slice(i + 1, j);
      const secenekler: string[] = [];
      let d = 0;
      let bas = 0;
      for (let k = 0; k < ic.length; k++) {
        if (ic[k] === "{") d++;
        else if (ic[k] === "}") d--;
        else if (ic[k] === "," && d === 0) {
          secenekler.push(ic.slice(bas, k));
          bas = k + 1;
        }
      }
      secenekler.push(ic.slice(bas));
      s += `(?:${secenekler.map(globParcasi).join("|")})`;
      i = j;
    } else if (c === "[") {
      const kapanis = g.indexOf("]", i + 1);
      if (kapanis < 0) {
        s += "\\[";
        continue;
      }
      let ic = g.slice(i + 1, kapanis);
      const olumsuz = ic.startsWith("!") || ic.startsWith("^");
      if (olumsuz) ic = ic.slice(1);
      s += `[${olumsuz ? "^" : ""}${ic.replace(/[\\\]]/g, "\\$&")}]`;
      i = kapanis;
    } else {
      s += kacir(c);
    }
  }
  return s;
}

/** Glob desenini köke göre yolla tam eşleşen düzenli ifadeye çevirir */
export function globDuzenli(glob: string): RegExp {
  const temiz = glob.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  return new RegExp(`^${globParcasi(temiz)}$`, process.platform === "win32" ? "i" : "");
}

/** Dosya yolunu dahil/hariç desenlerine göre süzer. Desen dosyanın kendisine ya da üst klasörlerinden
 * birine uyarsa eşleşmiş sayılır (ör. "**\/node_modules" altındaki her şeyi dışlar). */
export function yolSuzgeci(dahil: string[] = [], haric: string[] = []): (yol: string) => boolean {
  const d = dahil.filter((x) => x.trim()).map(globDuzenli);
  const h = haric.filter((x) => x.trim()).map(globDuzenli);
  const uyar = (desenler: RegExp[], yol: string) => {
    if (desenler.some((r) => r.test(yol))) return true;
    let i = yol.lastIndexOf("/");
    while (i > 0) {
      const ust = yol.slice(0, i);
      if (desenler.some((r) => r.test(ust))) return true;
      i = yol.lastIndexOf("/", i - 1);
    }
    return false;
  };
  return (yol) => (d.length === 0 || uyar(d, yol)) && !uyar(h, yol);
}

// ---------------------------------------------------------------------------
// Metin araması
// ---------------------------------------------------------------------------

export interface AramaSecenekleri {
  desen: string;
  regex?: boolean;
  harfDuyarli?: boolean;
  tamSozcuk?: boolean;
  dahil?: string[];
  haric?: string[];
  sinir?: number;
  enBuyukBoyut?: number;
  /** İstemci bağlantıyı kapatınca true döner; arama yarıda bırakılır */
  iptalMi?: () => boolean;
}

/** Arama desenini global, çok satırlı JavaScript düzenli ifadesine çevirir. Tam sözcük Unicode
 * harf ve rakamlarına göre denetlenir (Türkçe harfler sözcük sayılır). */
export function desenDerle(desen: string, s: { regex?: boolean; harfDuyarli?: boolean; tamSozcuk?: boolean }): RegExp {
  const kaynak = s.regex ? desen : desen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bayrak = `gm${s.harfDuyarli ? "" : "i"}`;
  try {
    const govde = s.tamSozcuk ? `(?<![\\p{L}\\p{N}_])(?:${kaynak})(?![\\p{L}\\p{N}_])` : kaynak;
    return new RegExp(govde, `${bayrak}u`);
  } catch {
    // Unicode kipinde geçersiz olan ama klasik kipte geçerli ifadeler (ör. "\-")
    try {
      return new RegExp(s.tamSozcuk ? `\\b(?:${kaynak})\\b` : kaynak, bayrak);
    } catch (h) {
      throw new ArnorgHatasi(iki(`Geçersiz düzenli ifade: ${(h as Error).message}`, `Invalid regular expression: ${(h as Error).message}`));
    }
  }
}

function ikiliMi(tampon: Buffer): boolean {
  return tampon.subarray(0, 8000).includes(0);
}

/** Bir dosyadaki eşleşmeler; satır ve sütunlar 0 tabanlı */
export function dosyadaAra(metin: string, duzenli: RegExp, sinir: number): MetinAramaEslesmesi[] {
  const sonuc: MetinAramaEslesmesi[] = [];
  let satirBaslari: number[] | null = null;
  const satirBul = (konum: number): number => {
    if (!satirBaslari) {
      satirBaslari = [0];
      for (let i = metin.indexOf("\n"); i >= 0; i = metin.indexOf("\n", i + 1)) satirBaslari.push(i + 1);
    }
    let alt = 0;
    let ust = satirBaslari.length - 1;
    while (alt < ust) {
      const orta = (alt + ust + 1) >> 1;
      if (satirBaslari[orta]! <= konum) alt = orta;
      else ust = orta - 1;
    }
    return alt;
  };
  const satirMetni = (satir: number): string => {
    const bas = satirBaslari![satir]!;
    const son = satir + 1 < satirBaslari!.length ? satirBaslari![satir + 1]! - 1 : metin.length;
    return metin.slice(bas, son).replace(/\r$/, "");
  };
  duzenli.lastIndex = 0;
  for (let e = duzenli.exec(metin); e; e = duzenli.exec(metin)) {
    if (e[0].length === 0) {
      duzenli.lastIndex++;
      continue;
    }
    const bas = e.index;
    const son = bas + e[0].length;
    const satir = satirBul(bas);
    const sonSatir = satirBul(son);
    const sutun = bas - satirBaslari![satir]!;
    const sonSutun = son - satirBaslari![sonSatir]!;
    let onizleme: string;
    let onizlemeBaslangic = 0;
    if (satir === sonSatir) {
      const tam = satirMetni(satir);
      if (tam.length > ONIZLEME_SINIRI) {
        onizlemeBaslangic = Math.max(0, Math.min(sutun - ONIZLEME_ONCESI, tam.length - ONIZLEME_SINIRI));
        onizleme = tam.slice(onizlemeBaslangic, onizlemeBaslangic + ONIZLEME_SINIRI);
      } else onizleme = tam;
    } else {
      const satirlar: string[] = [];
      for (let i = satir; i <= sonSatir && satirlar.length < 20; i++) satirlar.push(satirMetni(i).slice(0, 1000));
      onizleme = satirlar.join("\n");
    }
    sonuc.push({ satir, sutun, sonSatir, sonSutun, onizleme, onizlemeBaslangic });
    if (sonuc.length >= sinir) break;
  }
  return sonuc;
}

/** Çalışma alanında metin araması; dosyalar sıralı taranır, sınır dolunca durur */
export async function metinAra(kok: string, s: AramaSecenekleri): Promise<MetinAramaSonucu> {
  if (!s.desen) throw new ArnorgHatasi(iki("Arama deseni boş olamaz.", "The search pattern cannot be empty."));
  const duzenli = desenDerle(s.desen, s);
  const sinir = Math.min(Math.max(1, Math.floor(s.sinir ?? 2000)), 20_000);
  const enBuyuk = s.enBuyukBoyut && s.enBuyukBoyut > 0 ? s.enBuyukBoyut : 4 * 1024 * 1024;
  const uygun = yolSuzgeci(s.dahil, s.haric);
  const dosyalar = (await dosyaListesi(kok)).filter(uygun);
  const sonuc: MetinAramaSonucu = { dosyalar: [], sinirAsildi: false };
  let toplam = 0;
  const ESZAMANLI = 8;
  for (let i = 0; i < dosyalar.length && !sonuc.sinirAsildi; i += ESZAMANLI) {
    if (s.iptalMi?.()) break;
    const grup = dosyalar.slice(i, i + ESZAMANLI);
    const okunan = await Promise.all(
      grup.map(async (yol) => {
        try {
          const tam = path.join(kok, yol);
          const bilgi = await fsp.stat(tam);
          if (!bilgi.isFile() || bilgi.size > enBuyuk) return null;
          const tampon = await fsp.readFile(tam);
          return ikiliMi(tampon) ? null : tampon.toString("utf8");
        } catch {
          return null;
        }
      }),
    );
    for (let j = 0; j < grup.length; j++) {
      const metin = okunan[j];
      if (metin == null) continue;
      // Yeni bir RegExp nesnesi kopyalamak yerine lastIndex sıfırlanır (dosyadaAra yapar)
      const eslesmeler = dosyadaAra(metin, duzenli, sinir - toplam);
      if (eslesmeler.length === 0) continue;
      sonuc.dosyalar.push({ yol: grup[j]!, eslesmeler });
      toplam += eslesmeler.length;
      if (toplam >= sinir) {
        sonuc.sinirAsildi = true;
        break;
      }
    }
  }
  return sonuc;
}
