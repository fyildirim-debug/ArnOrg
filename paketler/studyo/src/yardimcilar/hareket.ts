// Arayüzün hafif hareketleri: stiller/hareket.css'i yükler ve "sayı değişince kısa vurgu"yu başlatır.
// Vurgulanan sayılar: data-sayi taşıyan öğeler ve rozetler. Metni değişen öğeye .sayi-vurgu eklenir, animasyon bitince
// kalkar; üst üste değişirse animasyon baştan oynar. İlk çizimde (öğe yeni eklenince) vurgu yapılmaz, yalnız değişince.
// 0.0.8: data-sayi öğesinde sayı artınca yeni değer alttan, azalınca üstten yerine oturur (data-yon, sayaç tıkı).
import "../stiller/hareket.css";
import { sayiYonu } from "./hareketAyari";

const SECICI = "[data-sayi], .rozet";

function vurgula(el: Element, yon: "artti" | "azaldi" | null) {
  // Tık yalnız sayaçlarda; rozet kendi küçük büyümesiyle
  if (yon && el.matches("[data-sayi]")) el.setAttribute("data-yon", yon);
  else el.removeAttribute("data-yon");
  if (el.classList.contains("sayi-vurgu")) {
    for (const a of el.getAnimations()) {
      const ad = (a as CSSAnimation).animationName ?? "";
      if (ad.endsWith("vurgu") || ad === "sayi-solma" || ad.startsWith("sayi-tik")) a.currentTime = 0;
    }
    return;
  }
  el.classList.add("sayi-vurgu");
  const bitti = (e: Event) => {
    // Tık vurgudan önce biter; sınıf en uzun animasyon (vurgu) bitince kalkar
    if ((e as AnimationEvent).animationName?.startsWith("sayi-tik")) return;
    el.classList.remove("sayi-vurgu");
    el.removeAttribute("data-yon");
    el.removeEventListener("animationend", bitti);
    el.removeEventListener("animationcancel", bitti);
  };
  el.addEventListener("animationend", bitti);
  el.addEventListener("animationcancel", bitti);
}

/** Kökün altındaki sayı değişikliklerini izler; durdurmak için dönen işlevi çağır */
export function sayiVurgusunuBaslat(kok: Node): () => void {
  if (typeof MutationObserver === "undefined") return () => undefined;
  const gozlemci = new MutationObserver((kayitlar) => {
    // Aynı öğedeki üst üste değişikliklerde ilk eski ve son yeni değer
    const degisen = new Map<Element, { eski: string | null; yeni: string | null }>();
    for (const k of kayitlar) {
      const hedef = k.type === "characterData" ? k.target.parentElement : k.target instanceof Element ? k.target : null;
      const el = hedef?.closest(SECICI);
      if (!el || !el.isConnected) continue;
      const eski = k.type === "characterData" ? k.oldValue : metin(k.removedNodes);
      const yeni = k.type === "characterData" ? k.target.textContent : metin(k.addedNodes);
      const d = degisen.get(el);
      if (d) d.yeni = yeni;
      else degisen.set(el, { eski, yeni });
    }
    for (const [el, d] of degisen) vurgula(el, sayiYonu(d.eski, d.yeni));
  });
  gozlemci.observe(kok, { subtree: true, characterData: true, characterDataOldValue: true, childList: true });
  return () => gozlemci.disconnect();
}

function metin(dugumler: NodeList): string | null {
  let m = "";
  dugumler.forEach((d) => {
    m += d.textContent ?? "";
  });
  return m || null;
}

if (typeof document !== "undefined") {
  const baslat = () => sayiVurgusunuBaslat(document.body);
  if (document.body) baslat();
  else document.addEventListener("DOMContentLoaded", baslat, { once: true });
}
