// Anlam bağları: kodu anlamca yakın dosyalar, arama dizinindeki gömmelerden. Dosyanın vektörü parça vektörlerinin
// ortalamasıdır (birim uzunlukta). Her dosya için en yakın k dosya aday olur; eşik modelin taban benzerliğine göre
// uyarlanır (bütün çiftlerin ortalaması + z × sapma; e5'te taban yüksek, EmbeddingGemma'da düşüktür). Çiftler
// tekilleşir, en benzerler önce girer; bir dosyanın anlam bağı sayısı ve toplam bağ sayısı sınırlıdır (büyük depoda
// grafik yumak olmasın). Hesap satır partileriyle yapılır, partiler arasında olay döngüsü nefes alır.
import { dilTani } from "./diller.js";

/** Her dosya için aday sayısı */
export const ANLAM_K = 3;
/** Eşik: ortalama + Z × standart sapma; altındaki taban hiçbir modelde aşılmaz */
const ESIK_Z = 1.25;
const ESIK_TABANI = 0.2;
/** Bir dosyanın en çok anlam bağı (çok genel dosyalar her şeye bağlanmasın) */
const EN_COK_DERECE = 6;
/** Büyük depoda anlam bağı aranan en çok dosya: en çok parçası olanlar */
export const EN_COK_ANLAM_DOSYASI = 1200;
/** Bu kadar çarpma-toplamada bir nefes */
const NEFES_ISLEM = 20_000_000;

export interface ParcaMatrisi {
  boyut: number;
  /** Satırın parça kimliği ve dosyası */
  idler: number[];
  yollar: string[];
  veri: Float32Array;
}

export interface AnlamKenari {
  a: string;
  b: string;
  benzerlik: number;
}

export interface AnlamSonucu {
  kenarlar: AnlamKenari[];
  /** Hesaplanan eşik; dosya azsa null */
  esik: number | null;
  /** Anlam bağı aranan dosya sayısı */
  dosya: number;
  /** Sınır yüzünden dışarıda kalan uygun dosya sayısı */
  kirpilan: number;
  /** Dosya vektörleri (tek dosyanın komşuları için yeniden kullanılır) */
  vektorler: Map<string, Float32Array>;
}

/** Anlam bağına girecek dosyalar: kod, stil ve şablonlar; belgeler ve veri/yapılandırma dosyaları değil */
export function anlamaUygun(yol: string): boolean {
  const d = dilTani(yol);
  return d !== null && d.aile !== "metin" && d.aile !== "md";
}

function birimle(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

function ic(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Matristeki satırları dosyalara toplar: dosya → satır numaraları */
export function dosyaSatirlari(m: ParcaMatrisi): Map<string, number[]> {
  const sonuc = new Map<string, number[]>();
  m.yollar.forEach((y, i) => {
    const l = sonuc.get(y);
    if (l) l.push(i);
    else sonuc.set(y, [i]);
  });
  return sonuc;
}

/** Dosyanın vektörü: parça vektörlerinin ortalaması, birim uzunlukta */
export function dosyaVektoru(m: ParcaMatrisi, satirlar: number[]): Float32Array {
  const v = new Float32Array(m.boyut);
  for (const r of satirlar) {
    const o = r * m.boyut;
    for (let j = 0; j < m.boyut; j++) v[j]! += m.veri[o + j]!;
  }
  return birimle(v);
}

/** Matrisin parmak izi: aynı parça kümesi (kimlikler değişmezse içerik de değişmez) aynı izi verir */
export function matrisIzi(m: ParcaMatrisi): string {
  let h = 0x811c9dc5;
  for (const id of m.idler) {
    h ^= id;
    h = Math.imul(h, 0x01000193);
  }
  return `${m.boyut}:${m.idler.length}:${(h >>> 0).toString(36)}`;
}

/** Sıralı küçük liste: en iyi n aday (benzerliğe göre azalan) */
function adayEkle(liste: { j: number; s: number }[], j: number, s: number, n: number): void {
  if (liste.length >= n && liste[liste.length - 1]!.s >= s) return;
  let i = liste.length;
  while (i > 0 && liste[i - 1]!.s < s) i--;
  liste.splice(i, 0, { j, s });
  if (liste.length > n) liste.pop();
}

export interface AnlamSecenekleri {
  k?: number;
  enCokDosya?: number;
  enCokKenar?: number;
  /** Dosya anlam bağına girer mi (varsayılan: anlamaUygun) */
  uygun?: (yol: string) => boolean;
  /** Partiler arasında olay döngüsüne nefes */
  nefes?: () => Promise<void>;
}

export async function anlamBaglari(m: ParcaMatrisi, s: AnlamSecenekleri = {}): Promise<AnlamSonucu> {
  const k = s.k ?? ANLAM_K;
  const uygun = s.uygun ?? anlamaUygun;
  const satirlar = [...dosyaSatirlari(m)].filter(([y]) => uygun(y));
  // Sınır aşılırsa en çok parçası olan dosyalar (eşitlikte yol sırası: sonuç belirlenimci)
  satirlar.sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  const secilen = satirlar.slice(0, s.enCokDosya ?? EN_COK_ANLAM_DOSYASI);
  const yollar = secilen.map(([y]) => y);
  const vektorler = new Map(secilen.map(([y, r]) => [y, dosyaVektoru(m, r)]));
  const v = yollar.map((y) => vektorler.get(y)!);
  const n = v.length;
  const bos: AnlamSonucu = { kenarlar: [], esik: null, dosya: n, kirpilan: satirlar.length - n, vektorler };
  if (n < 3) return bos;

  const adaylar = yollar.map(() => [] as { j: number; s: number }[]);
  const yedek = k + 3;
  let toplam = 0;
  let kareToplam = 0;
  let islem = 0;
  for (let i = 0; i < n; i++) {
    const a = v[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = v[j]!;
      let t = 0;
      for (let d = 0; d < a.length; d++) t += a[d]! * b[d]!;
      toplam += t;
      kareToplam += t * t;
      adayEkle(adaylar[i]!, j, t, yedek);
      adayEkle(adaylar[j]!, i, t, yedek);
    }
    islem += (n - i - 1) * m.boyut;
    if (s.nefes && islem >= NEFES_ISLEM) {
      islem = 0;
      await s.nefes();
    }
  }
  const ciftSayisi = (n * (n - 1)) / 2;
  const ortalama = toplam / ciftSayisi;
  const sapma = Math.sqrt(Math.max(0, kareToplam / ciftSayisi - ortalama * ortalama));
  const esik = Math.min(0.99, Math.max(ESIK_TABANI, ortalama + ESIK_Z * sapma));

  // Her dosyanın en yakın k adayı; çiftler tekil, en benzerler önce, derece ve toplam sınırıyla
  const ciftler = new Map<string, { i: number; j: number; s: number }>();
  adaylar.forEach((liste, i) => {
    for (const x of liste.slice(0, k)) {
      if (x.s < esik) break;
      const [a, b] = i < x.j ? [i, x.j] : [x.j, i];
      ciftler.set(`${a}:${b}`, { i: a, j: b, s: x.s });
    }
  });
  const derece = new Array<number>(n).fill(0);
  const enCokKenar = s.enCokKenar ?? Math.max(60, n * 2);
  const kenarlar: AnlamKenari[] = [];
  for (const c of [...ciftler.values()].sort((x, y) => y.s - x.s)) {
    if (kenarlar.length >= enCokKenar) break;
    if (derece[c.i]! >= EN_COK_DERECE || derece[c.j]! >= EN_COK_DERECE) continue;
    derece[c.i]!++;
    derece[c.j]!++;
    kenarlar.push({ a: yollar[c.i]!, b: yollar[c.j]!, benzerlik: Math.round(c.s * 100) / 100 });
  }
  return { ...bos, kenarlar, esik: Math.round(esik * 1000) / 1000 };
}

/** Tek dosyanın anlamca en yakın dosyaları (eşiği geçenler; benzerliğe göre azalan) */
export function enYakinDosyalar(hedef: Float32Array, vektorler: Map<string, Float32Array>, s: { haric: string; esik: number; sinir: number }): AnlamKenari[] {
  const sonuc: AnlamKenari[] = [];
  for (const [y, v] of vektorler) {
    if (y === s.haric) continue;
    const b = ic(hedef, v);
    if (b >= s.esik) sonuc.push({ a: s.haric, b: y, benzerlik: Math.round(b * 100) / 100 });
  }
  return sonuc.sort((x, y) => y.benzerlik - x.benzerlik || (x.b < y.b ? -1 : 1)).slice(0, s.sinir);
}

/** İki dosyanın anlamca en yakın parça çifti (matris satırlarıyla) */
export function enYakinParcaCifti(m: ParcaMatrisi, a: number[], b: number[]): { i: number; j: number; benzerlik: number } | null {
  let en: { i: number; j: number; benzerlik: number } | null = null;
  for (const i of a) {
    const oa = i * m.boyut;
    for (const j of b) {
      const ob = j * m.boyut;
      let t = 0;
      for (let d = 0; d < m.boyut; d++) t += m.veri[oa + d]! * m.veri[ob + d]!;
      if (!en || t > en.benzerlik) en = { i, j, benzerlik: t };
    }
  }
  return en ? { ...en, benzerlik: Math.round(en.benzerlik * 100) / 100 } : null;
}
