// Sahne kamerası: tekerlekle imlece doğru yakınlaştırma, sürükleyerek kaydırma, iki parmakla yakınlaştırma,
// klavye, sığdırma; takip ve canlı yayın için bir noktaya yumuşak yaklaşma. Dünya katmanına translate + scale uygular.

export interface KameraSecenekleri {
  /** Görüntü alanı (olayları dinler) */
  alan: HTMLElement;
  /** Dönüştürülen dünya katmanı */
  dunya: HTMLElement;
  genislik: number;
  yukseklik: number;
  /** Sığdırırken üstte bırakılacak pay (başlık için) */
  ustPay: () => number;
  /** Sığdırırken altta bırakılacak pay (olay şeridi için) */
  altPay?: () => number;
  /** Ölçek değişti (yalnız değişince çağrılır) */
  degisti: (olcek: number) => void;
  /** Görünüm (konum ya da ölçek) değişti: saklama için */
  kaydedilsin?: () => void;
  /** Kullanıcı kamerayla oynadı: kaydırma, yakınlaştırma, klavye (takip ve yayın bırakılır) */
  elle?: (tur: "kaydir" | "yakinlastir") => void;
}

const EN_BUYUK = 2.6;
const SURUKLEME_ESIGI = 5;

/** Kameranın saklanabilir hâli: görünür alanın ortasındaki dünya noktası ve ölçek. elle=false ise sığdırılır. */
export interface KameraDurumu {
  olcek: number;
  x: number;
  y: number;
  elle: boolean;
  /** Saklandığı andaki dünya boyutu (yerleşim değişince görünüm uyarlanır); eski kayıtlarda yok */
  genislik?: number;
  yukseklik?: number;
}

/** Doğu kanadından önceki ofisin genişliği: dünya boyutu saklanmamış eski kayıtlar bu yerleşimdendir */
export const ESKI_GENISLIK = 48 * 32;

/**
 * Saklanan görünümü bugünkü yerleşime uyarlar. Yerleşim değişmediyse aynen döner (noktası dünyanın içine çekilir).
 * Değiştiyse (kanat eklendi, ofis uzadı): kullanıcı eski ofisin tamamına yakınını görüyorsa (ölçek, aynı görüntü
 * alanında eski ofisi sığdıran ölçeğin %125'inden küçük) yeni ofis sığdırılır (null) ki yeni odalar görünsün;
 * yakınlaştırılmış görünüm korunur. Ana binanın koordinatları değişmediği için yakın görünüm aynı yeri gösterir.
 * sigdir: verilen dünya boyutunu bugünkü görüntü alanına sığdıran ölçek.
 */
export function kameraDurumunuUyarla(
  d: KameraDurumu | null,
  dunya: { genislik: number; yukseklik: number },
  sigdir: (genislik: number, yukseklik: number) => number,
): KameraDurumu | null {
  if (!d || !d.elle || !Number.isFinite(d.olcek) || !Number.isFinite(d.x) || !Number.isFinite(d.y) || d.olcek <= 0) return null;
  const eskiG = d.genislik ?? ESKI_GENISLIK;
  const eskiY = d.yukseklik ?? dunya.yukseklik;
  const x = Math.min(dunya.genislik, Math.max(0, d.x));
  const y = Math.min(dunya.yukseklik, Math.max(0, d.y));
  const boyut = { genislik: dunya.genislik, yukseklik: dunya.yukseklik };
  if (eskiG === dunya.genislik && eskiY === dunya.yukseklik) return { ...d, x, y, ...boyut };
  if (d.olcek < sigdir(eskiG, eskiY) * 1.25) return null;
  return { ...d, x, y, ...boyut };
}

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
  /** Son ölçülen alan boyu: ekran kapanırken alan DOM'dan çıkmış olsa da görünüm doğru saklansın */
  private sonBoy = { g: 1, y: 1 };
  /** Son bildirilen ölçek (degisti yalnız değişince) */
  private bildirilenOlcek = NaN;

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
    // Alanın boyu bir kez okunur, sonra yalnız boyutu değişince (her karede okumak yerleşimi zorlar)
    this.alaniOlc();
    this.gozlemci = new ResizeObserver((girdiler) => {
      const r = girdiler[girdiler.length - 1]?.contentRect;
      if (r && r.width > 0 && r.height > 0) this.sonBoy = { g: r.width, y: r.height };
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

  /** Üst pay (başlık yüksekliği) değişti: kullanıcı oynamadıysa yeniden sığdırır */
  ustDegisti() {
    if (!this.elle) this.sigdir(false);
  }

  boyutDegisti(genislik: number, yukseklik: number) {
    this.s.genislik = genislik;
    this.s.yukseklik = yukseklik;
    if (!this.elle) this.sigdir(false);
  }

  /** Alanın boyunu ölçer (kurulurken); sonrası ResizeObserver ile güncellenir */
  private alaniOlc() {
    const g = this.s.alan.clientWidth;
    const y = this.s.alan.clientHeight;
    if (g > 0 && y > 0) this.sonBoy = { g, y };
  }

  /** Son bilinen alan boyu: ekran kapanırken alan DOM'dan çıkmış olsa da görünüm doğru saklanır */
  private alanBoyu() {
    return this.sonBoy;
  }

  sigdirOlcegi(genislik = this.s.genislik, yukseklik = this.s.yukseklik): number {
    const { g, y } = this.alanBoyu();
    const pay = g < 520 ? 8 : 20;
    const ust = this.s.ustPay();
    const alt = this.s.altPay?.() ?? 0;
    return Math.max(0.05, Math.min((g - pay * 2) / genislik, (y - ust - alt - pay) / yukseklik));
  }

  /** Bütün ofisi görünür alana sığdırır */
  sigdir(yumusak = true) {
    const { g, y } = this.alanBoyu();
    const olcek = this.sigdirOlcegi();
    this.enKucuk = Math.min(olcek * 0.85, 0.5);
    const ust = this.s.ustPay();
    const alt = this.s.altPay?.() ?? 0;
    const pay = g < 520 ? 8 : 20;
    const tx = (g - this.s.genislik * olcek) / 2;
    // Dikeyde boşluk kalırsa sahne başlığın hemen altına yaslanır (telefonda üstte boş alan kalmasın)
    const ty = ust + Math.min(pay, Math.max(0, (y - ust - alt - pay - this.s.yukseklik * olcek) / 2));
    this.elle = false;
    this.git(olcek, tx, ty, yumusak);
  }

  /** Elle oynanmış mı (kullanıcı ya da takip/yayın görünümü değiştirdi) */
  elleMi(): boolean {
    return this.elle;
  }

  /** Görünür alanın (başlık ve şerit hariç) ortasının ekrandaki yüksekliği */
  private ortaY(h: number) {
    const ust = this.s.ustPay();
    const alt = this.s.altPay?.() ?? 0;
    return ust + Math.max(40, h - ust - alt) / 2;
  }

  /**
   * Takip ve canlı yayın: dünya noktasına (ve istenirse ölçeğe) her karede biraz yaklaşır. Görünür alanın ortası ile
   * ölçek ayrı ayrı yumuşatılır; pan ve yakınlaşma birlikte, sarsıntısız ilerler. sure: yarı yolun yaklaşık süresi.
   * aninda: hareket azaltıldığında yumuşatmadan oraya geçer.
   */
  izle(x: number, y: number, hedefOlcek: number | null, dt: number, sure = 520, aninda = false) {
    if (this.animasyon) {
      cancelAnimationFrame(this.animasyon);
      this.animasyon = null;
    }
    const { g, y: h } = this.alanBoyu();
    const oy = this.ortaY(h);
    const k = aninda ? 1 : 1 - Math.exp((-dt * Math.LN2) / Math.max(16, sure));
    const hedef = hedefOlcek === null ? this.olcek : Math.min(EN_BUYUK, Math.max(this.enKucuk, hedefOlcek));
    // Şu an ortadaki dünya noktası
    const mx = (g / 2 - this.tx) / this.olcek;
    const my = (oy - this.ty) / this.olcek;
    const yeniOlcek = this.olcek + (hedef - this.olcek) * k;
    const nx = mx + (x - mx) * k;
    const ny = my + (y - my) * k;
    this.olcek = yeniOlcek;
    this.tx = g / 2 - nx * yeniOlcek;
    this.ty = oy - ny * yeniOlcek;
    // Çekim dünyanın dışına taşmasın: kenardaki kişi gösterilirken boş alan kalmaz (dünya küçükse ortalanır)
    const dg = this.s.genislik * yeniOlcek;
    const dy = this.s.yukseklik * yeniOlcek;
    const ust = this.s.ustPay();
    const alt = this.s.altPay?.() ?? 0;
    this.tx = dg > g ? Math.min(0, Math.max(g - dg, this.tx)) : (g - dg) / 2;
    this.ty = dy > h - ust - alt ? Math.min(ust, Math.max(h - alt - dy, this.ty)) : ust + (h - ust - alt - dy) / 2;
    this.elle = true;
    this.uygula();
  }

  /** Nokta, kenar payı içinde görünüyor mu */
  gorunurMu(x: number, y: number, kenar = 40): boolean {
    const { g, y: h } = this.alanBoyu();
    const sx = this.tx + x * this.olcek;
    const sy = this.ty + y * this.olcek;
    return sx > kenar && sx < g - kenar && sy > this.s.ustPay() && sy < h - (this.s.altPay?.() ?? 0);
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

  /** Kullanıcının bıraktığı görünüm: ekran boyutundan bağımsız (alanın ortasındaki dünya noktası) */
  durum(): KameraDurumu {
    const { g, y } = this.alanBoyu();
    return {
      olcek: this.olcek,
      x: (g / 2 - this.tx) / this.olcek,
      y: (y / 2 - this.ty) / this.olcek,
      elle: this.elle,
      genislik: this.s.genislik,
      yukseklik: this.s.yukseklik,
    };
  }

  /** Saklanan görünüme animasyonsuz döner (yerleşim değiştiyse uyarlanmış hâline); kullanıcı oynamamışsa sığdırır */
  durumaGetir(saklanan: KameraDurumu | null) {
    const d = kameraDurumunuUyarla(saklanan, { genislik: this.s.genislik, yukseklik: this.s.yukseklik }, (g, y) => this.sigdirOlcegi(g, y));
    if (!d) {
      this.sigdir(false);
      return;
    }
    // Sınırlar sığdırma ölçeğinden gelir
    this.enKucuk = Math.min(this.sigdirOlcegi() * 0.85, 0.5);
    const { g, y } = this.alanBoyu();
    const olcek = Math.min(EN_BUYUK, Math.max(this.enKucuk, d.olcek));
    this.elle = true;
    this.git(olcek, g / 2 - d.x * olcek, y / 2 - d.y * olcek, false);
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
    this.s.dunya.style.transform = `translate(${this.tx.toFixed(2)}px, ${this.ty.toFixed(2)}px) scale(${this.olcek.toFixed(5)})`;
    if (Math.abs(this.olcek - this.bildirilenOlcek) > 1e-5 || !Number.isFinite(this.bildirilenOlcek)) {
      this.bildirilenOlcek = this.olcek;
      this.s.degisti(this.olcek);
    }
    this.s.kaydedilsin?.();
  }

  private teker(e: WheelEvent) {
    e.preventDefault();
    this.s.elle?.(e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? "yakinlastir" : "kaydir");
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
      this.s.elle?.("yakinlastir");
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
      this.s.elle?.("kaydir");
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
    if (["+", "=", "-", "_", "0"].includes(e.key)) this.s.elle?.("yakinlastir");
    else if (e.key.startsWith("Arrow")) this.s.elle?.("kaydir");
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

const kameraAnahtari = (pid: string) => `arnorg.ofis.kamera.${pid}`;

export function kameraOku(pid: string): KameraDurumu | null {
  try {
    const ham = localStorage.getItem(kameraAnahtari(pid));
    const d = ham ? (JSON.parse(ham) as Partial<KameraDurumu>) : null;
    if (!d || typeof d.olcek !== "number" || typeof d.x !== "number" || typeof d.y !== "number") return null;
    const boyut = typeof d.genislik === "number" && typeof d.yukseklik === "number" ? { genislik: d.genislik, yukseklik: d.yukseklik } : {};
    return { olcek: d.olcek, x: d.x, y: d.y, elle: d.elle === true, ...boyut };
  } catch {
    return null;
  }
}

export function kameraYaz(pid: string, d: KameraDurumu) {
  try {
    const yuvarla = (n: number) => Math.round(n * 1000) / 1000;
    const boyut = d.genislik && d.yukseklik ? { genislik: Math.round(d.genislik), yukseklik: Math.round(d.yukseklik) } : {};
    localStorage.setItem(kameraAnahtari(pid), JSON.stringify({ olcek: yuvarla(d.olcek), x: Math.round(d.x), y: Math.round(d.y), elle: d.elle, ...boyut }));
  } catch {
    // depolama kapalı: görünüm yalnız bu oturumda korunur
  }
}
