// Tarayıcı ekranının ortak parçaları: masaüstü köprüsü, kısayol yazımı ve görünümü örten katmanın izlenmesi.
//
// Masaüstündeki sayfa (WebContentsView) Stüdyo'nun üstünde ayrı bir katmandır; Stüdyo'nun kendi açılır katmanları
// (çekmece, menü, kurul penceresi, bildirim, not penceresi) onun altında kalır. Bu yüzden böyle bir katman
// görünümün alanıyla kesişirse görünüm gizlenir ve yerine son karesi konur (bkz. MasaustuTarayici).
import type { MasaustuTarayicisi } from "@arnorg/ortak";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { masaustu } from "../kurulumYardimcilari";

/** Masaüstü uygulamasının tarayıcı köprüsü; tarayıcıda ve eski masaüstü sürümlerinde yoktur */
export function tarayiciKoprusu(): MasaustuTarayicisi | null {
  return masaustu()?.tarayici ?? null;
}

export function macMi(): boolean {
  const k = masaustu();
  if (k) return k.platform === "darwin";
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** "Ctrl+L" ya da "⌘L" */
export function kisayol(tus: string): string {
  return macMi() ? `⌘${tus.replace(/^Shift\+/, "⇧")}` : `Ctrl+${tus}`;
}

/** Klavye olayı platformun ana değiştiricisiyle mi (Ctrl, macOS'ta Cmd) */
export function anaTus(e: KeyboardEvent | ReactKeyboardEvent): boolean {
  return macMi() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** Görünümü örtebilecek Stüdyo katmanları */
const KATMANLAR = [
  ".perde",
  ".cekmece",
  ".acilir",
  ".gezgin",
  ".kurul-bildirimleri",
  ".bildirimler > .bildirim",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
].join(",");

/** Kesişme sayılması için en az bu kadar piksel örtmeli */
const PAY = 4;

/** Verilen alanla kesişen bir Stüdyo katmanı var mı (canlı izlenir) */
export function useOrtenKatman(alan: RefObject<HTMLElement | null>, etkin: boolean): boolean {
  const [ortuyor, setOrtuyor] = useState(false);
  useEffect(() => {
    if (!etkin) {
      setOrtuyor(false);
      return;
    }
    let kare = 0;
    const denetle = () => {
      kare = 0;
      const el = alan.current;
      if (!el) return;
      const a = el.getBoundingClientRect();
      let var_ = false;
      for (const k of Array.from(document.querySelectorAll<HTMLElement>(KATMANLAR))) {
        const r = k.getBoundingClientRect();
        // Kenarı değen (panele yaslanan bildirim gibi) katman örtmüş sayılmaz
        if (r.width > 0 && r.height > 0 && r.left < a.right - PAY && r.right > a.left + PAY && r.top < a.bottom - PAY && r.bottom > a.top + PAY) {
          var_ = true;
          break;
        }
      }
      setOrtuyor(var_);
    };
    const planla = () => {
      if (!kare) kare = requestAnimationFrame(denetle);
    };
    const gozcu = new MutationObserver(planla);
    gozcu.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", planla);
    // Yerinde büyüyen ya da kayan katmanlar için seyrek bir güvence denetimi
    const zamanlayici = window.setInterval(planla, 800);
    planla();
    return () => {
      gozcu.disconnect();
      window.removeEventListener("resize", planla);
      window.clearInterval(zamanlayici);
      if (kare) cancelAnimationFrame(kare);
    };
  }, [alan, etkin]);
  return ortuyor;
}
