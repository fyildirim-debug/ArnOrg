// Sahne kamerası: tekerlekle imlece doğru yakınlaştırma, sürükleyerek kaydırma, iki parmakla yakınlaştırma,
// klavye, sığdırma. Dünya katmanına translate + scale uygular.

export interface KameraSecenekleri {
  /** Görüntü alanı (olayları dinler) */
  alan: HTMLElement;
  /** Dönüştürülen dünya katmanı */
  dunya: HTMLElement;
  genislik: number;
  yukseklik: number;
  /** Sığdırırken üstte bırakılacak pay (başlık ve akış için) */
  ustPay: () => number;
  degisti: (olcek: number) => void;
}

const EN_BUYUK = 2.6;
const SURUKLEME_ESIGI = 5;

export class Kamera {
  olcek = 1;
  tx = 0;
  ty = 0;
  private s: KameraSecenekleri;
  private enKucuk = 0.2;
  private isaretciler = new Map<number, { x: number; y: number }>();
  private surukleme: { x: number; y: number; tx: number; ty: number; gecti: boolean } | null = null;
  private kiskac: { uzaklik: number; olcek: number; mx: number; my: number; tx: number; ty: number } | null = null;
  /** Kullanıcı elle oynadıysa yeniden boyutlanınca sığdırılmaz */
  private elle = false;
  /** Son sürükleme tıklamayı yutar */
  private tikYut = false;
  private gozlemci: ResizeObserver;
  private kaldir: (() => void)[] = [];
  private animasyon: number | null = null;

  constructor(s: KameraSecenekleri) {
    this.s = s;
    const a = s.alan;
    const dinle = <K extends keyof HTMLElementEventMap>(tur: K, fn: (e: HTMLElementEventMap[K]) => void, secenek?: AddEventListenerOptions) => {
      a.addEventListener(tur, fn as EventListener, secenek);
      this.kaldir.push(() => a.removeEventListener(tur, fn as EventListener, secenek));
    };
    dinle("wheel", (e) => this.teker(e), { passive: false });
    dinle("pointerdown", (e) => this.bas(e));
    dinle("pointermove", (e) => this.kaydir(e));
    dinle("pointerup", (e) => this.birak(e));
    dinle("pointercancel", (e) => this.birak(e));
    dinle("click", (e) => {
      if (this.tikYut) {
        e.stopPropagation();
        e.preventDefault();
        this.tikYut = false;
      }
    }, { capture: true });
    dinle("keydown", (e) => this.tus(e));
    this.gozlemci = new ResizeObserver(() => {
      if (!this.elle) this.sigdir(false);
      else this.uygula();
    });
    this.gozlemci.observe(a);
  }

  yokEt() {
    this.gozlemci.disconnect();
    this.kaldir.forEach((f) => f());
    if (this.animasyon) cancelAnimationFrame(this.animasyon);
  }

  boyutDegisti(genislik: number, yukseklik: number) {
    this.s.genislik = genislik;
    this.s.yukseklik = yukseklik;
    if (!this.elle) this.sigdir(false);
  }

  private alanBoyu() {
    return { g: this.s.alan.clientWidth || 1, y: this.s.alan.clientHeight || 1 };
  }

  sigdirOlcegi(): number {
    const { g, y } = this.alanBoyu();
    const pay = g < 520 ? 8 : 20;
    const ust = this.s.ustPay();
    return Math.max(0.05, Math.min((g - pay * 2) / this.s.genislik, (y - ust - pay) / this.s.yukseklik));
  }

  /** Bütün ofisi görünür alana sığdırır */
  sigdir(yumusak = true) {
    const { g, y } = this.alanBoyu();
    const olcek = this.sigdirOlcegi();
    this.enKucuk = Math.min(olcek * 0.85, 0.5);
    const ust = this.s.ustPay();
    const pay = g < 520 ? 8 : 20;
    const tx = (g - this.s.genislik * olcek) / 2;
    // Dikeyde boşluk kalırsa sahne başlığın hemen altına yaslanır (telefonda üstte boş alan kalmasın)
    const ty = ust + Math.min(pay, Math.max(0, (y - ust - pay - this.s.yukseklik * olcek) / 2));
    this.elle = false;
    this.git(olcek, tx, ty, yumusak);
  }

  /** Görünür alanın ortasına (ya da verilen ekran noktasına) doğru yakınlaştırır */
  yakinlastir(carpan: number, ekranX?: number, ekranY?: number, yumusak = true) {
    const { g, y } = this.alanBoyu();
    const px = ekranX ?? g / 2;
    const py = ekranY ?? y / 2;
    const yeni = Math.min(EN_BUYUK, Math.max(this.enKucuk, this.olcek * carpan));
    const k = yeni / this.olcek;
    this.elle = true;
    this.git(yeni, px - (px - this.tx) * k, py - (py - this.ty) * k, yumusak);
  }

  /** Dünya noktasını görünür alanın ortasına getirir (görünüyorsa dokunmaz) */
  goster(x: number, y: number, kenar = 60) {
    const { g, y: h } = this.alanBoyu();
    const sx = this.tx + x * this.olcek;
    const sy = this.ty + y * this.olcek;
    if (sx > kenar && sx < g - kenar && sy > kenar && sy < h - kenar) return;
    this.elle = true;
    this.git(this.olcek, g / 2 - x * this.olcek, h / 2 - y * this.olcek, true);
  }

  /** Dünya → ekran (görüntü alanına göre) */
  ekrana(x: number, y: number) {
    return { x: this.tx + x * this.olcek, y: this.ty + y * this.olcek };
  }

  private git(olcek: number, tx: number, ty: number, yumusak: boolean) {
    if (this.animasyon) cancelAnimationFrame(this.animasyon);
    this.animasyon = null;
    const azHareket = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!yumusak || azHareket) {
      this.olcek = olcek;
      this.tx = tx;
      this.ty = ty;
      this.uygula();
      return;
    }
    const bas = { o: this.olcek, x: this.tx, y: this.ty };
    const t0 = performance.now();
    const sure = 320;
    const adim = (t: number) => {
      const u = Math.min(1, (t - t0) / sure);
      const e = 1 - (1 - u) ** 3;
      this.olcek = bas.o + (olcek - bas.o) * e;
      this.tx = bas.x + (tx - bas.x) * e;
      this.ty = bas.y + (ty - bas.y) * e;
      this.uygula();
      this.animasyon = u < 1 ? requestAnimationFrame(adim) : null;
    };
    this.animasyon = requestAnimationFrame(adim);
  }

  /** Dünyanın en az bir kısmı görünür kalsın */
  private sinirla() {
    const { g, y } = this.alanBoyu();
    const dg = this.s.genislik * this.olcek;
    const dy = this.s.yukseklik * this.olcek;
    const kalan = 120;
    this.tx = Math.min(g - Math.min(kalan, dg), Math.max(Math.min(kalan, dg) - dg, this.tx));
    this.ty = Math.min(y - Math.min(kalan, dy), Math.max(Math.min(kalan, dy) - dy, this.ty));
  }

  private uygula() {
    this.sinirla();
    this.s.dunya.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.olcek})`;
    this.s.degisti(this.olcek);
  }

  private teker(e: WheelEvent) {
    e.preventDefault();
    const kutu = this.s.alan.getBoundingClientRect();
    const birim = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? kutu.height : 1;
    // Dokunmatik yüzeyde iki parmakla kaydırma (ctrlKey yok) kaydırır, Ctrl/kıstırma yakınlaştırır
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.6 && e.deltaMode === 0) {
      this.elle = true;
      this.tx -= e.deltaX;
      this.ty -= e.deltaY;
      this.uygula();
      return;
    }
    const carpan = Math.exp(-e.deltaY * birim * (e.ctrlKey ? 0.01 : 0.0016));
    this.yakinlastir(carpan, e.clientX - kutu.left, e.clientY - kutu.top, false);
  }

  private bas(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const kutu = this.s.alan.getBoundingClientRect();
    const n = { x: e.clientX - kutu.left, y: e.clientY - kutu.top };
    // Katman öğeleri (düğmeler, akış) kendi olaylarını alır; sahne yine de sürüklenebilir
    if ((e.target as HTMLElement).closest("[data-kamera-disi]")) return;
    this.isaretciler.set(e.pointerId, n);
    if (this.isaretciler.size === 1) {
      this.surukleme = { x: n.x, y: n.y, tx: this.tx, ty: this.ty, gecti: false };
      this.tikYut = false;
    } else if (this.isaretciler.size === 2) {
      const [a, b] = [...this.isaretciler.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.kiskac = {
        uzaklik: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        olcek: this.olcek,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        tx: this.tx,
        ty: this.ty,
      };
      this.surukleme = null;
      this.tikYut = true;
    }
  }

  private kaydir(e: PointerEvent) {
    if (!this.isaretciler.has(e.pointerId)) return;
    const kutu = this.s.alan.getBoundingClientRect();
    const n = { x: e.clientX - kutu.left, y: e.clientY - kutu.top };
    this.isaretciler.set(e.pointerId, n);
    if (this.kiskac && this.isaretciler.size >= 2) {
      const [a, b] = [...this.isaretciler.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const k = this.kiskac;
      const uzaklik = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const olcek = Math.min(EN_BUYUK, Math.max(this.enKucuk, (k.olcek * uzaklik) / k.uzaklik));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Kıstırma merkezindeki dünya noktası parmakların altında kalır
      const wx = (k.mx - k.tx) / k.olcek;
      const wy = (k.my - k.ty) / k.olcek;
      this.olcek = olcek;
      this.tx = mx - wx * olcek;
      this.ty = my - wy * olcek;
      this.elle = true;
      this.uygula();
      return;
    }
    const s = this.surukleme;
    if (!s) return;
    const dx = n.x - s.x;
    const dy = n.y - s.y;
    if (!s.gecti && Math.hypot(dx, dy) < SURUKLEME_ESIGI) return;
    if (!s.gecti) {
      s.gecti = true;
      this.s.alan.setPointerCapture?.(e.pointerId);
      this.s.alan.dataset.surukleniyor = "1";
    }
    this.elle = true;
    this.tx = s.tx + dx;
    this.ty = s.ty + dy;
    this.uygula();
  }

  private birak(e: PointerEvent) {
    if (!this.isaretciler.has(e.pointerId)) return;
    this.isaretciler.delete(e.pointerId);
    if (this.surukleme?.gecti) this.tikYut = true;
    if (this.isaretciler.size < 2) this.kiskac = null;
    if (this.isaretciler.size === 0) {
      this.surukleme = null;
      delete this.s.alan.dataset.surukleniyor;
      // Tıklama olayı bırakmadan hemen sonra gelir; gelmezse yutma bayrağı sonraki tıklamayı bozmasın
      setTimeout(() => (this.tikYut = false), 0);
    } else if (this.isaretciler.size === 1) {
      const [n] = [...this.isaretciler.values()] as [{ x: number; y: number }];
      this.surukleme = { x: n.x, y: n.y, tx: this.tx, ty: this.ty, gecti: true };
    }
  }

  private tus(e: KeyboardEvent) {
    const hedef = e.target as HTMLElement;
    if (hedef.closest("input, textarea, select, [contenteditable]")) return;
    const adim = 80;
    switch (e.key) {
      case "+":
      case "=":
        this.yakinlastir(1.25);
        break;
      case "-":
      case "_":
        this.yakinlastir(0.8);
        break;
      case "0":
        this.sigdir();
        break;
      case "ArrowLeft":
        this.kaydirAdim(adim, 0);
        break;
      case "ArrowRight":
        this.kaydirAdim(-adim, 0);
        break;
      case "ArrowUp":
        this.kaydirAdim(0, adim);
        break;
      case "ArrowDown":
        this.kaydirAdim(0, -adim);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private kaydirAdim(dx: number, dy: number) {
    this.elle = true;
    this.git(this.olcek, this.tx + dx, this.ty + dy, true);
  }
}
