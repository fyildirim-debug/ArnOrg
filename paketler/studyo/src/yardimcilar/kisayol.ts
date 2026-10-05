// Ekran kısayolları: tek tuşlu kısayollar yazı alanında, değiştirici tuşla (Ctrl, Cmd, Alt) ve açık bir pencere
// (çekmece, kısayol penceresi) varken çalışmaz; başka bir dinleyicinin işlediği tuşa (preventDefault) karışmaz.
// Harf kısayolları sözlükten gelir (Türkçede Canlı için C, İngilizcede Live için L gibi).
import { useEffect, useRef } from "react";

/** Odak yazı yazılan bir alanda mı: girdi, metin alanı, seçim kutusu ya da düzenlenebilir içerik */
export function yaziAlaniMi(hedef: unknown): boolean {
  if (!hedef || typeof hedef !== "object") return false;
  const el = hedef as { tagName?: unknown; isContentEditable?: unknown };
  const ad = typeof el.tagName === "string" ? el.tagName.toLowerCase() : "";
  return ad === "input" || ad === "textarea" || ad === "select" || el.isContentEditable === true;
}

/** Olayın kısayol adı: tek karakter küçük harfe iner; Ctrl, Cmd ya da Alt basılıysa kısayol sayılmaz (Shift sayılır: ? ve /) */
export function kisayolTusu(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (!e.key || e.key === "Unidentified" || e.key === "Dead") return null;
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/** Ekranın kısayolları: anahtar kisayolTusu adıdır ("?", "/", "c", "Escape") */
export function useKisayollar(tuslar: Record<string, (e: KeyboardEvent) => void>, etkin = true) {
  const ref = useRef(tuslar);
  ref.current = tuslar;
  useEffect(() => {
    if (!etkin) return;
    const dinle = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      if (yaziAlaniMi(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const tus = kisayolTusu(e);
      const is = tus ? ref.current[tus] : undefined;
      if (!is) return;
      e.preventDefault();
      is(e);
    };
    document.addEventListener("keydown", dinle);
    return () => document.removeEventListener("keydown", dinle);
  }, [etkin]);
}
