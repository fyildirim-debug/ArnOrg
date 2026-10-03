// Yol bulma: yürünebilir ızgarada A*, görüş hattıyla sadeleştirme, köşe yumuşatma ve yay boyu örnekleme.
// Saf işlevler; DOM'a dokunmaz.
import { KARO, karoAyak, type Karo, type Nokta } from "./yerlesim";

export interface Izgara {
  sutun: number;
  satir: number;
  /** 1: yürünebilir */
  yurunebilir: Uint8Array;
}

const KOK2 = Math.SQRT2;

function acik(iz: Izgara, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < iz.sutun && r < iz.satir && iz.yurunebilir[r * iz.sutun + c] === 1;
}

/** İkili yığın (en küçük f önde) */
class Yigin {
  private dugum: number[] = [];
  private oncelik: number[] = [];
  get bos() {
    return this.dugum.length === 0;
  }
  ekle(d: number, p: number) {
    this.dugum.push(d);
    this.oncelik.push(p);
    let i = this.dugum.length - 1;
    while (i > 0) {
      const u = (i - 1) >> 1;
      if (this.oncelik[u]! <= this.oncelik[i]!) break;
      this.takas(i, u);
      i = u;
    }
  }
  al(): number {
    const ilk = this.dugum[0]!;
    const sonD = this.dugum.pop()!;
    const sonP = this.oncelik.pop()!;
    if (this.dugum.length) {
      this.dugum[0] = sonD;
      this.oncelik[0] = sonP;
      let i = 0;
      for (;;) {
        const s = 2 * i + 1;
        const g = s + 1;
        let k = i;
        if (s < this.dugum.length && this.oncelik[s]! < this.oncelik[k]!) k = s;
        if (g < this.dugum.length && this.oncelik[g]! < this.oncelik[k]!) k = g;
        if (k === i) break;
        this.takas(i, k);
        i = k;
      }
    }
    return ilk;
  }
  private takas(a: number, b: number) {
    [this.dugum[a], this.dugum[b]] = [this.dugum[b]!, this.dugum[a]!];
    [this.oncelik[a], this.oncelik[b]] = [this.oncelik[b]!, this.oncelik[a]!];
  }
}

/**
 * 8 yönlü A*: köşe kesmez (çapraz adım için iki komşu da açık olmalı), sekizgen sezgisel.
 * Başlangıç yürünemez bir karodaysa (ör. masada oturan) yine de çıkabilir.
 * Yol yoksa null.
 */
export function yolBul(iz: Izgara, bas: Karo, hedef: Karo): Karo[] | null {
  if (!acik(iz, hedef.c, hedef.r)) return null;
  if (bas.c === hedef.c && bas.r === hedef.r) return [bas];
  const n = iz.sutun * iz.satir;
  const g = new Float64Array(n).fill(Infinity);
  const onceki = new Int32Array(n).fill(-1);
  const kapali = new Uint8Array(n);
  const basI = bas.r * iz.sutun + bas.c;
  const hedefI = hedef.r * iz.sutun + hedef.c;
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - hedef.c);
    const dy = Math.abs(r - hedef.r);
    return dx + dy + (KOK2 - 2) * Math.min(dx, dy);
  };
  const yigin = new Yigin();
  g[basI] = 0;
  yigin.ekle(basI, h(bas.c, bas.r));
  while (!yigin.bos) {
    const i = yigin.al();
    if (kapali[i]) continue;
    kapali[i] = 1;
    if (i === hedefI) break;
    const c = i % iz.sutun;
    const r = (i - c) / iz.sutun;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nc = c + dx;
        const nr = r + dy;
        if (!acik(iz, nc, nr)) continue;
        if (dx && dy && (!acik(iz, c + dx, r) || !acik(iz, c, r + dy))) continue;
        const j = nr * iz.sutun + nc;
        if (kapali[j]) continue;
        const yeni = g[i]! + (dx && dy ? KOK2 : 1);
        if (yeni < g[j]!) {
          g[j] = yeni;
          onceki[j] = i;
          yigin.ekle(j, yeni + h(nc, nr));
        }
      }
    }
  }
  if (onceki[hedefI] === -1 && hedefI !== basI) return null;
  const yol: Karo[] = [];
  for (let i = hedefI; i !== -1; i = onceki[i]!) {
    const c = i % iz.sutun;
    yol.push({ c, r: (i - c) / iz.sutun });
    if (i === basI) break;
  }
  return yol.reverse();
}

/** İki karo merkezi arasındaki doğru, değdiği bütün karolar açıksa görüş hattı vardır */
export function gorusHatti(iz: Izgara, a: Karo, b: Karo): boolean {
  // Doğruyu ince adımlarla örnekle; karakter genişliği için iki yana küçük pay
  const ax = a.c + 0.5;
  const ay = a.r + 0.5;
  const bx = b.c + 0.5;
  const by = b.r + 0.5;
  const uz = Math.hypot(bx - ax, by - ay);
  const adim = Math.max(1, Math.ceil(uz * 4));
  const nx = uz ? -(by - ay) / uz : 0;
  const ny = uz ? (bx - ax) / uz : 0;
  const pay = 0.28;
  for (let k = 0; k <= adim; k++) {
    const t = k / adim;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    for (const s of [-pay, 0, pay]) {
      if (!acik(iz, Math.floor(x + nx * s), Math.floor(y + ny * s))) return false;
    }
  }
  return true;
}

/** Görüş hattı olan ara noktaları atarak yolu kısaltır (ip çekme) */
export function sadelestir(iz: Izgara, yol: Karo[]): Karo[] {
  if (yol.length <= 2) return yol.slice();
  const sonuc: Karo[] = [yol[0]!];
  let i = 0;
  while (i < yol.length - 1) {
    let j = yol.length - 1;
    while (j > i + 1 && !gorusHatti(iz, yol[i]!, yol[j]!)) j--;
    sonuc.push(yol[j]!);
    i = j;
  }
  return sonuc;
}

/**
 * Kırık çizginin köşelerini ikinci derece Bézier eğrileriyle yuvarlar ve
 * yaklaşık eşit aralıklı noktalar döner. yaricap: köşeden en çok bu kadar önce kıvrılmaya başlar.
 */
export function yumusat(noktalar: Nokta[], yaricap = 14, aralik = 4): Nokta[] {
  if (noktalar.length < 2) return noktalar.slice();
  const ham: Nokta[] = [noktalar[0]!];
  for (let i = 1; i < noktalar.length - 1; i++) {
    const o = noktalar[i - 1]!;
    const k = noktalar[i]!;
    const s = noktalar[i + 1]!;
    const d1 = Math.hypot(k.x - o.x, k.y - o.y);
    const d2 = Math.hypot(s.x - k.x, s.y - k.y);
    const r = Math.min(yaricap, d1 / 2, d2 / 2);
    if (r < 1) {
      ham.push(k);
      continue;
    }
    const a = { x: k.x + ((o.x - k.x) / d1) * r, y: k.y + ((o.y - k.y) / d1) * r };
    const b = { x: k.x + ((s.x - k.x) / d2) * r, y: k.y + ((s.y - k.y) / d2) * r };
    ham.push(a);
    const parca = Math.max(3, Math.ceil((2 * r) / aralik));
    for (let t = 1; t < parca; t++) {
      const u = t / parca;
      const v = 1 - u;
      ham.push({ x: v * v * a.x + 2 * v * u * k.x + u * u * b.x, y: v * v * a.y + 2 * v * u * k.y + u * u * b.y });
    }
    ham.push(b);
  }
  ham.push(noktalar[noktalar.length - 1]!);
  // Düz kısımları da örnekle: hareket yay boyuna göre ilerler
  const sonuc: Nokta[] = [ham[0]!];
  for (let i = 1; i < ham.length; i++) {
    const a = ham[i - 1]!;
    const b = ham[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const parca = Math.max(1, Math.round(d / aralik));
    for (let t = 1; t <= parca; t++) sonuc.push({ x: a.x + ((b.x - a.x) * t) / parca, y: a.y + ((b.y - a.y) * t) / parca });
  }
  return sonuc;
}

/** Ayak noktasından hedef ayak noktasına yumuşatılmış yol; bulunamazsa null */
export function rota(iz: Izgara, basNokta: Nokta, bas: Karo, hedef: Karo, hedefNokta?: Nokta): Nokta[] | null {
  const yol = yolBul(iz, bas, hedef);
  if (!yol) return null;
  const sade = sadelestir(iz, yol);
  const noktalar = sade.map(karoAyak);
  noktalar[0] = basNokta;
  if (hedefNokta) noktalar[noktalar.length - 1] = hedefNokta;
  if (noktalar.length === 1) noktalar.push(hedefNokta ?? karoAyak(hedef));
  return yumusat(noktalar);
}

/** Yol uzunluğu (piksel) */
export function uzunluk(noktalar: Nokta[]): number {
  let t = 0;
  for (let i = 1; i < noktalar.length; i++) t += Math.hypot(noktalar[i]!.x - noktalar[i - 1]!.x, noktalar[i]!.y - noktalar[i - 1]!.y);
  return t;
}

/**
 * Hedefe en yakın, yürünebilir ve dolu olmayan karo (genişleyen halkalarla).
 * Aynı satırdaki komşular önce denenir: yan yana durulsun.
 */
export function yakinBos(iz: Izgara, hedef: Karo, dolu: (c: number, r: number) => boolean, enCok = 6): Karo | null {
  if (acik(iz, hedef.c, hedef.r) && !dolu(hedef.c, hedef.r)) return hedef;
  for (let d = 1; d <= enCok; d++) {
    const adaylar: Karo[] = [];
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        adaylar.push({ c: hedef.c + dx, r: hedef.r + dy });
      }
    }
    adaylar.sort((a, b) => Math.abs(a.r - hedef.r) - Math.abs(b.r - hedef.r) || Math.abs(a.c - hedef.c) - Math.abs(b.c - hedef.c));
    for (const k of adaylar) if (acik(iz, k.c, k.r) && !dolu(k.c, k.r)) return k;
  }
  return null;
}

/** Noktaya en yakın yürünebilir karo (yürünemez yerde kalan karakter için) */
export function enYakinAcik(iz: Izgara, n: Nokta): Karo {
  const k = { c: Math.floor(n.x / KARO), r: Math.floor(n.y / KARO) };
  return yakinBos(iz, k, () => false, 12) ?? k;
}
