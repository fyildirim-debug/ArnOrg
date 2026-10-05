// Listeden çıkan öğe hemen kaybolmaz: kısa bir çıkış süresince yerinde kalır (cikiyor: true), stil onu söndürüp
// kaydırır, süre dolunca kalkar. Sıra korunur: çıkan öğe listedeki eski komşusunun ardında durur. Hareket azaltılınca
// çıkış beklenmez. Saf birleştirme (cikanlariBirlestir) test edilir; kanca zamanlamayı yapar.
import { useEffect, useReducer, useRef } from "react";
import { hareketAzaltildi, SURE } from "./hareketAyari";

export interface CikanOge<T> {
  oge: T;
  anahtar: string;
  cikiyor: boolean;
}

/**
 * Önceki görünür liste (çıkanlar dahil) ile yeni listeyi birleştirir: yeni listedeki her öğe kendi sırasıyla,
 * yeni listede olmayan önceki öğeler cikiyor olarak eski komşularının ardında.
 */
export function cikanlariBirlestir<T>(onceki: readonly CikanOge<T>[], simdi: readonly T[], anahtar: (x: T) => string): CikanOge<T>[] {
  const sonuc: CikanOge<T>[] = simdi.map((oge) => ({ oge, anahtar: anahtar(oge), cikiyor: false }));
  const yeniler = new Set(sonuc.map((o) => o.anahtar));
  let son: string | null = null;
  for (const o of onceki) {
    if (yeniler.has(o.anahtar)) {
      son = o.anahtar;
      continue;
    }
    const cikan: CikanOge<T> = { oge: o.oge, anahtar: o.anahtar, cikiyor: true };
    // Eski komşusunun (ya da ondan önce eklenen çıkanın) ardına
    const i = son === null ? -1 : sonuc.findIndex((x) => x.anahtar === son);
    sonuc.splice(i + 1, 0, cikan);
    son = o.anahtar;
  }
  return sonuc;
}

/** Liste ve çıkış süresince yerinde kalan çıkanlar; çıkanlar sure (ms) sonra kalkar */
export function useCikanlar<T>(liste: readonly T[], anahtar: (x: T) => string, sure: number = SURE.hizli): CikanOge<T>[] {
  const [, yenile] = useReducer((n: number) => n + 1, 0);
  const gorunen = useRef<CikanOge<T>[]>([]);
  /** Çıkışı biten anahtarlar (yeniden gelirse silinir) */
  const bitenler = useRef(new Set<string>());
  const zamanlayicilar = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const bekleme = hareketAzaltildi() ? 0 : sure;
  const birlesik = cikanlariBirlestir(gorunen.current, liste, anahtar).filter((o) => {
    if (!o.cikiyor) {
      bitenler.current.delete(o.anahtar);
      return true;
    }
    return bekleme > 0 && !bitenler.current.has(o.anahtar);
  });

  useEffect(() => {
    gorunen.current = birlesik;
    // Görünenden düşen çıkanın anahtarı artık gerekmez (birleştirme onu bir daha görmez)
    for (const a of bitenler.current) if (!birlesik.some((o) => o.anahtar === a)) bitenler.current.delete(a);
    for (const o of birlesik) {
      if (!o.cikiyor) {
        const z = zamanlayicilar.current.get(o.anahtar);
        if (z !== undefined) {
          clearTimeout(z);
          zamanlayicilar.current.delete(o.anahtar);
        }
        continue;
      }
      if (zamanlayicilar.current.has(o.anahtar)) continue;
      zamanlayicilar.current.set(
        o.anahtar,
        setTimeout(() => {
          zamanlayicilar.current.delete(o.anahtar);
          bitenler.current.add(o.anahtar);
          yenile();
        }, bekleme),
      );
    }
  });

  useEffect(
    () => () => {
      for (const z of zamanlayicilar.current.values()) clearTimeout(z);
      zamanlayicilar.current.clear();
    },
    [],
  );

  return birlesik;
}
