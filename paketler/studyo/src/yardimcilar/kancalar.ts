// Paylaşılan React kancaları
import { useEffect, useRef, useState, type RefObject } from "react";
import { hataMetni } from "../api/istek";
import { hataBildir } from "../durum/arayuz";

/** Belirli aralıkla yenilenen şimdiki zaman (geri sayımlar ve göreli zamanlar için) */
export function useSimdi(aralikMs = 1000): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => setSimdi(Date.now()), aralikMs);
    return () => clearInterval(z);
  }, [aralikMs]);
  return simdi;
}

/** Öğenin dışına tıklanınca ya da Escape'e basılınca çağrılır */
export function useDisariTik(ref: RefObject<HTMLElement | null>, acik: boolean, kapat: () => void) {
  const kapatRef = useRef(kapat);
  kapatRef.current = kapat;
  useEffect(() => {
    if (!acik) return;
    const tik = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) kapatRef.current();
    };
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape") kapatRef.current();
    };
    document.addEventListener("pointerdown", tik);
    document.addEventListener("keydown", tus);
    return () => {
      document.removeEventListener("pointerdown", tik);
      document.removeEventListener("keydown", tus);
    };
  }, [acik, ref]);
}

/** CSS medya sorgusunu izler */
export function useMedya(sorgu: string): boolean {
  const [eslesti, setEslesti] = useState(() => window.matchMedia(sorgu).matches);
  useEffect(() => {
    const m = window.matchMedia(sorgu);
    const degisti = () => setEslesti(m.matches);
    degisti();
    m.addEventListener("change", degisti);
    return () => m.removeEventListener("change", degisti);
  }, [sorgu]);
  return eslesti;
}

/** Bir değerin bir önceki çizimdeki hâli */
export function useOnceki<T>(deger: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = deger;
  }, [deger]);
  return ref.current;
}

/**
 * Async bir işlemin sürüp sürmediğini izler; aynı anda iki kez tetiklenmesini önler.
 * Hata bildirim olarak gösterilir ve `hata` alanında kalır; işlev undefined döner.
 */
export function useIslem() {
  const [suruyor, setSuruyor] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const kilit = useRef(false);
  const calistir = async <T>(ad: string, is: () => Promise<T>, sessiz = false): Promise<T | undefined> => {
    if (kilit.current) return undefined;
    kilit.current = true;
    setSuruyor(ad);
    setHata(null);
    try {
      return await is();
    } catch (e) {
      setHata(hataMetni(e));
      if (!sessiz) hataBildir(e);
      return undefined;
    } finally {
      kilit.current = false;
      setSuruyor(null);
    }
  };
  return { suruyor, hata, setHata, calistir };
}
