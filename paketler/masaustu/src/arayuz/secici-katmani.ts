// Sayfadaki öğe seçici: fare altındaki öğeyi mercan çerçeve ve küçük bir etiketle gösterir, tıklamada öğeyi
// seçer (sayfanın kendi tıklaması engellenir), Esc ile çıkar. Seçilen öğenin çerçevesi Stüdyo notu kaydedene ya
// da vazgeçene kadar durur (birak).
//
// - Dinleyiciler betik yüklenirken (sayfanın betiklerinden önce) pencereye yakalama evresinde bir kez eklenir;
//   böylece seçici açıkken tıklama sayfanın dinleyicilerinden önce yakalanıp durdurulur. Kapalıyken hiçbir şeye
//   dokunmazlar. Üzerine gelme (CSS :hover, menüler) sayfada çalışmaya devam eder.
// - Katman sayfanın DOM'una kapalı bir gölge kökle eklenir; stiller CSSOM ile verilir (<style> yok: sayfanın
//   CSP'si engellemez, sayfanın stilleri sızmaz). Mümkünse üst katmanda (popover) durur.
// - Sayfanın kendi dünyasına (window) hiçbir işlev ya da değişken eklenmez.

import type { SayfaSecimi } from "../kopru.js";
import { etiketMetni, KATMAN_OZNITELIGI, secimiTopla } from "./secim.js";

const MERCAN = "oklch(0.72 0.19 25)";
const MERCAN_ZEMIN = "oklch(0.72 0.19 25 / 0.12)";
const MUREKKEP = "#0a0a0b";
const KAGIT = "#f2f0ec";
const YAZI = 'ui-monospace, "IBM Plex Mono", "Cascadia Mono", Consolas, monospace';

type Durum = "bos" | "seciyor" | "secili";

/** Seçici açıkken sayfaya ulaşmayan fare olayları (tıklama, bırakma, sağ tık, dokunma) */
const ENGELLENENLER = ["pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick", "contextmenu", "touchstart", "touchend"];

function stil(el: HTMLElement, ozellikler: Record<string, string>): void {
  for (const [ad, deger] of Object.entries(ozellikler)) el.style.setProperty(ad, deger, "important");
}

export class SeciciKatmani {
  private durum: Durum = "bos";
  private kok: HTMLElement | null = null;
  private cerceve: HTMLElement | null = null;
  private etiket: HTMLElement | null = null;
  private ipucu: HTMLElement | null = null;
  /** Fare altındaki öğe (seçerken) */
  private hedef: Element | null = null;
  /** Seçilen öğe (çerçevesi bırakılana kadar durur) */
  private secili: Element | null = null;
  /** Seçim tıklamasının ardından gelen bırakma ve tıklama olayları da yutulur */
  private yutmaBitis = 0;
  private kare = 0;
  private sonY = 0;
  private eskiImlec: { deger: string; oncelik: string } | null = null;

  constructor(
    private readonly secildi: (secim: SayfaSecimi) => void,
    private readonly cikildi: () => void,
  ) {
    const secenek = { capture: true, passive: false } as const;
    window.addEventListener("pointerdown", (e) => this.basildi(e), secenek);
    for (const tur of ENGELLENENLER) window.addEventListener(tur, (e) => this.engelle(e), secenek);
    window.addEventListener("pointermove", (e) => this.gezindi(e), { capture: true, passive: true });
    window.addEventListener("keydown", (e) => this.tus(e), secenek);
    window.addEventListener("scroll", () => this.yenidenCiz(), { capture: true, passive: true });
    window.addEventListener("resize", () => this.yenidenCiz(), { passive: true });
  }

  /** Seçiciyi açar; ipucu sayfanın üstünde gösterilen kısa yönerge */
  ac(ipucu: string): void {
    this.birak();
    this.durum = "seciyor";
    this.katmaniKur();
    if (this.ipucu) {
      this.ipucu.textContent = ipucu;
      stil(this.ipucu, { display: ipucu ? "block" : "none" });
    }
    this.imleciAyarla(true);
  }

  /** Seçiciyi kapatır (seçilmiş öğenin çerçevesine dokunmaz) */
  kapat(): void {
    if (this.durum !== "seciyor") return;
    this.durum = "bos";
    this.hedef = null;
    this.imleciAyarla(false);
    this.gizle();
  }

  /** Seçilen öğenin çerçevesini kaldırır */
  birak(): void {
    this.secili = null;
    if (this.durum === "secili") {
      this.durum = "bos";
      this.gizle();
    }
  }

  // ---------------------------------------------------------------------------

  private katmaniKur(): void {
    if (this.kok?.isConnected) {
      this.ustKatmanaAl();
      return;
    }
    if (!this.kok) {
      const kok = document.createElement("arnorg-secici");
      kok.setAttribute(KATMAN_OZNITELIGI, "");
      kok.setAttribute("aria-hidden", "true");
      stil(kok, {
        all: "initial",
        display: "block",
        position: "fixed",
        inset: "0",
        width: "100vw",
        height: "100vh",
        margin: "0",
        padding: "0",
        border: "0",
        background: "transparent",
        overflow: "visible",
        "pointer-events": "none",
        "z-index": "2147483647",
      });
      const golge = kok.attachShadow({ mode: "closed" });
      const cerceve = document.createElement("div");
      stil(cerceve, {
        position: "fixed",
        display: "none",
        "box-sizing": "border-box",
        border: `2px solid ${MERCAN}`,
        background: MERCAN_ZEMIN,
        "border-radius": "2px",
        "pointer-events": "none",
      });
      const etiket = document.createElement("div");
      stil(etiket, {
        position: "fixed",
        display: "none",
        font: `500 11px/18px ${YAZI}`,
        "letter-spacing": "0.01em",
        color: MUREKKEP,
        background: MERCAN,
        padding: "0 6px",
        "border-radius": "2px",
        "white-space": "nowrap",
        "max-width": "min(60vw, 420px)",
        overflow: "hidden",
        "text-overflow": "ellipsis",
        "pointer-events": "none",
      });
      const ipucu = document.createElement("div");
      stil(ipucu, {
        position: "fixed",
        display: "none",
        left: "50%",
        top: "12px",
        transform: "translateX(-50%)",
        font: `500 12px/1.4 ${YAZI}`,
        color: KAGIT,
        background: MUREKKEP,
        border: `1px solid ${MERCAN}`,
        padding: "6px 12px",
        "border-radius": "4px",
        "white-space": "nowrap",
        "max-width": "calc(100vw - 24px)",
        overflow: "hidden",
        "text-overflow": "ellipsis",
        "pointer-events": "none",
      });
      golge.append(cerceve, etiket, ipucu);
      this.kok = kok;
      this.cerceve = cerceve;
      this.etiket = etiket;
      this.ipucu = ipucu;
    }
    (document.documentElement ?? document).appendChild(this.kok);
    this.ustKatmanaAl();
  }

  /** Sayfanın açık iletişim kutuları ve açılır menüleri üstünde kalmak için üst katmana (popover) alınır */
  private ustKatmanaAl(): void {
    const kok = this.kok as (HTMLElement & { showPopover?: () => void }) | null;
    if (!kok || typeof kok.showPopover !== "function") return;
    try {
      if (!kok.hasAttribute("popover")) kok.setAttribute("popover", "manual");
      if (!kok.matches(":popover-open")) kok.showPopover();
    } catch {
      // üst katman yoksa sabit konumlu katman yeter
    }
  }

  private gizle(): void {
    if (this.cerceve) stil(this.cerceve, { display: "none" });
    if (this.etiket) stil(this.etiket, { display: "none" });
    if (this.ipucu) stil(this.ipucu, { display: "none" });
    const kok = this.kok as (HTMLElement & { hidePopover?: () => void }) | null;
    try {
      if (kok?.matches(":popover-open")) kok.hidePopover?.();
    } catch {
      // önemsiz
    }
  }

  /** Seçerken artı imleci: sayfanın kökündeki satır içi değer saklanır, çıkınca geri konur */
  private imleciAyarla(acik: boolean): void {
    const k = document.documentElement;
    if (!k) return;
    if (acik) {
      if (!this.eskiImlec) this.eskiImlec = { deger: k.style.getPropertyValue("cursor"), oncelik: k.style.getPropertyPriority("cursor") };
      k.style.setProperty("cursor", "crosshair", "important");
    } else if (this.eskiImlec) {
      if (this.eskiImlec.deger) k.style.setProperty("cursor", this.eskiImlec.deger, this.eskiImlec.oncelik);
      else k.style.removeProperty("cursor");
      this.eskiImlec = null;
    }
  }

  private ogeAl(x: number, y: number): Element | null {
    const el = document.elementFromPoint(x, y);
    if (!el || el === this.kok || el === document.documentElement) return null;
    return el;
  }

  private gezindi(e: PointerEvent): void {
    if (this.durum !== "seciyor") return;
    this.sonY = e.clientY;
    this.hedef = this.ogeAl(e.clientX, e.clientY);
    this.yenidenCiz();
  }

  private basildi(e: PointerEvent): void {
    if (this.durum !== "seciyor") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.isPrimary || e.button !== 0) return;
    const el = this.ogeAl(e.clientX, e.clientY) ?? this.hedef;
    if (el) this.sec(el);
  }

  private engelle(e: Event): void {
    if (this.durum !== "seciyor" && performance.now() > this.yutmaBitis) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  private tus(e: KeyboardEvent): void {
    if (this.durum !== "seciyor" || e.key !== "Escape") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.kapat();
    this.cikildi();
  }

  private sec(el: Element): void {
    this.durum = "secili";
    this.secili = el;
    this.hedef = null;
    this.yutmaBitis = performance.now() + 700;
    this.imleciAyarla(false);
    if (this.etiket) stil(this.etiket, { display: "none" });
    if (this.ipucu) stil(this.ipucu, { display: "none" });
    this.ciz(el, true);
    // Çerçeve ekrana çizilsin (ekran görüntüsünde görünür), sonra bilgi gider
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (this.secili !== el) return;
        try {
          this.secildi(secimiTopla(el, window));
        } catch {
          this.birak();
          this.cikildi();
        }
      }),
    );
  }

  private yenidenCiz(): void {
    if (this.durum === "bos" || this.kare) return;
    this.kare = requestAnimationFrame(() => {
      this.kare = 0;
      if (this.durum === "seciyor") this.ciz(this.hedef, false);
      else if (this.durum === "secili") this.ciz(this.secili, true);
    });
  }

  private ciz(el: Element | null, secili: boolean): void {
    const { cerceve, etiket, ipucu } = this;
    if (!cerceve || !etiket) return;
    if (this.kok && !this.kok.isConnected) this.katmaniKur();
    if (!el || !el.isConnected) {
      stil(cerceve, { display: "none" });
      stil(etiket, { display: "none" });
      return;
    }
    const r = el.getBoundingClientRect();
    stil(cerceve, {
      display: "block",
      left: `${r.left - 2}px`,
      top: `${r.top - 2}px`,
      width: `${r.width + 4}px`,
      height: `${r.height + 4}px`,
      background: secili ? "transparent" : MERCAN_ZEMIN,
    });
    if (secili) {
      stil(etiket, { display: "none" });
      return;
    }
    etiket.textContent = `${etiketMetni(el)}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
    stil(etiket, { display: "block" });
    const yukseklik = etiket.offsetHeight || 18;
    const ust = r.top - yukseklik - 4 >= 0 ? r.top - yukseklik - 4 : Math.min(r.bottom + 4, window.innerHeight - yukseklik - 2);
    const sol = Math.max(2, Math.min(r.left, window.innerWidth - etiket.offsetWidth - 2));
    stil(etiket, { top: `${ust}px`, left: `${sol}px` });
    // Yönerge imlecin yakınındaysa alta geçer
    if (ipucu) stil(ipucu, this.sonY < 72 ? { top: "auto", bottom: "12px" } : { top: "12px", bottom: "auto" });
  }
}
