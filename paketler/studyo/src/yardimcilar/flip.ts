// FLIP: liste öğeleri yer değiştirince eski yerinden yenisine kayarak gelir (First, Last, Invert, Play). Öğeler
// data-flip="<kimlik>" taşır; kimlik aynı kaldıkça öğe başka bir listeye geçse de (Pano'da sütundan sütuna) izlenir.
// Konumlar dönüşümden bağımsız ölçülür (offset zinciri): süren kayma ölçümü bozmaz, yarıda kesilen kayma öğenin
// göründüğü yerden sürer. Yeni öğe kısa bir solmayla girer; ilk çizimde hareket yoktur (ekran girişi zaten oynar).
// Kap yeniden boyutlanınca konumlar sessizce tazelenir: pencere daraldı diye kartlar kaymaz. Hareket azaltılınca
// hiçbiri oynamaz.
import { useLayoutEffect, useRef, type RefObject } from "react";
import { EGRI, hareketAzaltildi, SURE } from "./hareketAyari";

export interface Konum {
  x: number;
  y: number;
}

/** Eski konumdan yenisine kayma (ters çevrilmiş: öğe bu kadar geriden başlar); yoksa ya da eşiğin altındaysa null */
export function flipFarki(once: Konum | undefined, simdi: Konum | undefined, esik = 1): Konum | null {
  if (!once || !simdi) return null;
  const x = once.x - simdi.x;
  const y = once.y - simdi.y;
  if (Math.abs(x) < esik && Math.abs(y) < esik) return null;
  return { x, y };
}

/**
 * Öğenin yerleşim konumu: kaba kadar (kap null ise belgenin köküne kadar) offset zinciri; dönüşümler ve kaydırma
 * sayılmaz. Kendisi yer değiştiren kapta (sağ alta yaslı bildirimler) belgeye göre ölçülür.
 */
export function konumOlc(el: HTMLElement, kap: HTMLElement | null): Konum {
  let x = 0;
  let y = 0;
  let o: HTMLElement | null = el;
  while (o && o !== kap) {
    x += o.offsetLeft;
    y += o.offsetTop;
    o = o.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const GIRIS: Keyframe[] = [
  { opacity: 0, transform: "translateY(-4px)" },
  { opacity: 1, transform: "none" },
];

/**
 * Kabın içindeki [data-flip] öğelerini izler: bagimlilik değişince (liste yeniden çizilince) yer değiştirenler kayar,
 * yeniler solarak girer. giris: false ise yeni öğeye dokunulmaz (girişini kendisi oynatıyorsa). belgeye: konumlar
 * kaba göre değil belgeye göre (kabın kendisi büyüyüp kayıyorsa).
 */
export function useFlip(kap: RefObject<HTMLElement | null>, bagimlilik: unknown, secenek: { sure?: number; giris?: boolean; belgeye?: boolean } = {}) {
  const sure = secenek.sure ?? SURE.yavas;
  const giris = secenek.giris ?? true;
  const belgeye = secenek.belgeye ?? false;
  const konumlar = useRef<Map<string, Konum> | null>(null);
  const kayanlar = useRef(new Map<string, Animation>());
  /** Ölçülen kap ve onu izleyen boyut gözlemcisi (kap sonradan çizilebilir ya da değişebilir) */
  const gozlenen = useRef<{ el: HTMLElement; gozlemci: ResizeObserver | null } | null>(null);

  useLayoutEffect(() => {
    const k = kap.current;
    if (gozlenen.current?.el !== k) {
      // Kap değişti: eski ölçüler geçersiz, gözlemci yenisine geçer
      gozlenen.current?.gozlemci?.disconnect();
      gozlenen.current = k ? { el: k, gozlemci: boyutGozlemcisi(k, konumlar, belgeye) } : null;
      konumlar.current = null;
    }
    if (!k) return;
    const ogeler = Array.from(k.querySelectorAll<HTMLElement>("[data-flip]"));
    const yeni = new Map<string, Konum>();
    for (const el of ogeler) yeni.set(el.dataset.flip!, konumOlc(el, belgeye ? null : k));
    const once = konumlar.current;
    konumlar.current = yeni;
    if (!once || hareketAzaltildi() || typeof k.animate !== "function") return;
    for (const el of ogeler) {
      const id = el.dataset.flip!;
      const onceki = once.get(id);
      const simdi = yeni.get(id);
      const suren = kayanlar.current.get(id);
      const ayniOge = (suren?.effect as KeyframeEffect | null | undefined)?.target === el;
      // Yeri değişmeyen ve kayması süren öğe olduğu gibi sürer
      if (suren && ayniOge && !flipFarki(onceki, simdi, 0.5)) continue;
      let ilk = onceki;
      if (suren) {
        // Yarıda kesilen kayma: öğe şu an göründüğü yerden başlar
        if (ilk && ayniOge) {
          const tf = getComputedStyle(el).transform;
          if (tf && tf !== "none") {
            const m = new DOMMatrixReadOnly(tf);
            ilk = { x: ilk.x + m.m41, y: ilk.y + m.m42 };
          }
        }
        suren.cancel();
      }
      const fark = flipFarki(ilk, simdi);
      if (fark) {
        const a = el.animate([{ transform: `translate(${fark.x}px, ${fark.y}px)` }, { transform: "translate(0, 0)" }], { duration: sure, easing: EGRI });
        kayanlar.current.set(id, a);
        const bitti = () => {
          if (kayanlar.current.get(id) === a) kayanlar.current.delete(id);
        };
        a.addEventListener("finish", bitti);
        a.addEventListener("cancel", bitti);
      } else if (!onceki && giris) {
        el.animate(GIRIS, { duration: SURE.orta, easing: EGRI });
      }
    }
  }, [bagimlilik]);

  useLayoutEffect(
    () => () => {
      gozlenen.current?.gozlemci?.disconnect();
      gozlenen.current = null;
    },
    [],
  );
}

/** Kap yeniden boyutlanınca (pencere, yan panel) konumlar sessizce tazelenir */
function boyutGozlemcisi(k: HTMLElement, konumlar: { current: Map<string, Konum> | null }, belgeye: boolean): ResizeObserver | null {
  if (typeof ResizeObserver === "undefined") return null;
  const gozlemci = new ResizeObserver(() => {
    if (!konumlar.current) return;
    const yeni = new Map<string, Konum>();
    for (const el of k.querySelectorAll<HTMLElement>("[data-flip]")) yeni.set(el.dataset.flip!, konumOlc(el, belgeye ? null : k));
    konumlar.current = yeni;
  });
  gozlemci.observe(k);
  return gozlemci;
}
