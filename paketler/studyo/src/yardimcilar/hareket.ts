// Arayüzün hafif hareketleri: stiller/hareket.css'i yükler ve "sayı değişince kısa vurgu"yu başlatır.
// Vurgulanan sayılar: data-sayi taşıyan öğeler ve rozetler. Metni değişen öğeye .sayi-vurgu eklenir, animasyon bitince
// kalkar; üst üste değişirse animasyon baştan oynar. İlk çizimde (öğe yeni eklenince) vurgu yapılmaz, yalnız değişince.
import "../stiller/hareket.css";

const SECICI = "[data-sayi], .rozet";

function vurgula(el: Element) {
  if (el.classList.contains("sayi-vurgu")) {
    for (const a of el.getAnimations()) {
      const ad = (a as CSSAnimation).animationName ?? "";
      if (ad.endsWith("vurgu") || ad === "sayi-solma") a.currentTime = 0;
    }
    return;
  }
  el.classList.add("sayi-vurgu");
  const bitti = () => el.classList.remove("sayi-vurgu");
  el.addEventListener("animationend", bitti, { once: true });
  el.addEventListener("animationcancel", bitti, { once: true });
}

/** Kökün altındaki sayı değişikliklerini izler; durdurmak için dönen işlevi çağır */
export function sayiVurgusunuBaslat(kok: Node): () => void {
  if (typeof MutationObserver === "undefined") return () => undefined;
  const gozlemci = new MutationObserver((kayitlar) => {
    const gorulen = new Set<Element>();
    for (const k of kayitlar) {
      const hedef = k.type === "characterData" ? k.target.parentElement : k.target instanceof Element ? k.target : null;
      const el = hedef?.closest(SECICI);
      if (!el || gorulen.has(el) || !el.isConnected) continue;
      gorulen.add(el);
      vurgula(el);
    }
  });
  gozlemci.observe(kok, { subtree: true, characterData: true, childList: true });
  return () => gozlemci.disconnect();
}

if (typeof document !== "undefined") {
  const baslat = () => sayiVurgusunuBaslat(document.body);
  if (document.body) baslat();
  else document.addEventListener("DOMContentLoaded", baslat, { once: true });
}
