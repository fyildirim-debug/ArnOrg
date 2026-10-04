// Üst çubuğun altındaki şeritlerin kabı (Claude Code uyarısı, masaüstü güncellemesi): kabuk ızgarasının 2. satırı.
// Şeritler birlikte görünebilir; kabın toplam yüksekliği --serit-yukseklik olarak yazılır, açılır pencereler ve kayan ray
// hepsinin altından başlar. Şerit yokken kap sıfır yüksekliktedir.
import { useEffect, useRef, type ReactNode } from "react";

export function Seritler({ children }: { children: ReactNode }) {
  const kapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return;
    const kok = document.documentElement.style;
    const yaz = () => kok.setProperty("--serit-yukseklik", `${kap.offsetHeight}px`);
    yaz();
    const gozlemci = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(yaz);
    gozlemci?.observe(kap);
    return () => {
      gozlemci?.disconnect();
      kok.removeProperty("--serit-yukseklik");
    };
  }, []);

  return (
    <div className="seritler" ref={kapRef}>
      {children}
    </div>
  );
}
