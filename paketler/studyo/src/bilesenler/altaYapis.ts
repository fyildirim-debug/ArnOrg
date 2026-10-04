// Akan liste: yeni içerik gelince kullanıcı alttaysa liste alta iner; yukarı kaydırdıysa yerinde kalır ve
// gelenler "yeni mesaj" sayısında birikir. Kanallar, CEO sohbeti, kanal akışı ve test çıktısı kullanır.
// Kaydırılan öğe hep çizili olmalı (yükleniyor ve boş durumları içinde gösterilir).
// useYeniGelenler: ilk yüklemede gelenler canlandırılmaz, yalnız sonradan düşenler yumuşakça girer.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Alta bu kadar yakınsa "altta" sayılır (px) */
const ESIK = 48;

function azHareket(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * sayi: listedeki öğe sayısı (artışı "yeni" sayılır); degisim: alttaysa alta indiren başka değişiklik
 * (ör. yazıyor satırı geldi ya da gitti)
 */
export function useAltaYapisik<T extends HTMLElement>({ sayi, degisim }: { sayi: number; degisim?: unknown }) {
  const ref = useRef<T>(null);
  const altta = useRef(true);
  const onceki = useRef(sayi);
  /** Yumuşak kaydırma sürerken ara konumlar "yukarıda" sayılmasın */
  const kaydirmaBitisi = useRef(0);
  const [yeni, setYeni] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const fark = sayi - onceki.current;
    onceki.current = sayi;
    if (!el) return;
    if (altta.current) el.scrollTop = el.scrollHeight;
    else if (fark > 0) setYeni((n) => n + fark);
  }, [sayi, degisim]);

  // Kabın boyu değişince (yazma alanı büyüdü, pencere daraldı) alttaysa altta kal
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const gozlem = new ResizeObserver(() => {
      if (altta.current) el.scrollTop = el.scrollHeight;
    });
    gozlem.observe(el);
    return () => gozlem.disconnect();
  }, []);

  const kaydirildi = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (Date.now() < kaydirmaBitisi.current) return;
    altta.current = el.scrollHeight - el.scrollTop - el.clientHeight < ESIK;
    if (altta.current) setYeni(0);
  }, []);

  /** En yeni içeriğe iner */
  const alta = useCallback((yumusak = true) => {
    const el = ref.current;
    altta.current = true;
    setYeni(0);
    if (!el) return;
    const yumusakMi = yumusak && !azHareket();
    if (yumusakMi) kaydirmaBitisi.current = Date.now() + 700;
    el.scrollTo({ top: el.scrollHeight, behavior: yumusakMi ? "smooth" : "auto" });
  }, []);

  /** Kurul yazınca: sıradaki içerik nerede olursa olsun listeyi alta indirir */
  const altaKilitle = useCallback(() => {
    altta.current = true;
    setYeni(0);
  }, []);

  return { ref, kaydirildi, yeni, alta, altaKilitle };
}

/**
 * İlk yüklemede gelenler "eski" sayılır; sonradan düşenler yeni (giriş hareketi alır). kapsam (proje) değişince sıfırlanır.
 * kimlikler: listedeki kimlikleri veren işlev (yalnız ilk yüklemede çağrılır); hazir: liste yüklendi mi
 */
export function useYeniGelenler(kimlikler: () => readonly string[], hazir: boolean, kapsam: string | null): (id: string) => boolean {
  const ref = useRef<{ kapsam: string | null; ilk: Set<string> } | null>(null);
  if (hazir && (ref.current === null || ref.current.kapsam !== kapsam)) ref.current = { kapsam, ilk: new Set(kimlikler()) };
  const g = ref.current;
  return (id) => g !== null && g.kapsam === kapsam && !g.ilk.has(id);
}
