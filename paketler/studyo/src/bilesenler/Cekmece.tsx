// Sağdan açılan çekmece: Escape ile kapanır, odak içeride kalır ve kapanınca geri döner
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Simge } from "./Simge";

const ODAKLANABILIR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Cekmece({
  baslik,
  ust,
  children,
  alt,
  kapat,
}: {
  baslik: ReactNode;
  ust?: ReactNode;
  children: ReactNode;
  alt?: ReactNode;
  kapat: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const baslikId = useId();
  const kapatRef = useRef(kapat);
  kapatRef.current = kapat;

  useEffect(() => {
    const onceki = document.activeElement as HTMLElement | null;
    const kutu = ref.current;
    const ilk = kutu?.querySelector<HTMLElement>("[data-ilk-odak]") ?? kutu?.querySelector<HTMLElement>(ODAKLANABILIR);
    ilk?.focus();
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        kapatRef.current();
        return;
      }
      if (e.key !== "Tab" || !kutu) return;
      const ogeler = Array.from(kutu.querySelectorAll<HTMLElement>(ODAKLANABILIR)).filter((o) => o.offsetParent !== null);
      if (!ogeler.length) return;
      const bas = ogeler[0]!;
      const son = ogeler[ogeler.length - 1]!;
      if (e.shiftKey && document.activeElement === bas) {
        e.preventDefault();
        son.focus();
      } else if (!e.shiftKey && document.activeElement === son) {
        e.preventDefault();
        bas.focus();
      }
    };
    document.addEventListener("keydown", tus);
    return () => {
      document.removeEventListener("keydown", tus);
      onceki?.focus?.();
    };
  }, []);

  return createPortal(
    <>
      <div className="perde" onClick={() => kapatRef.current()} aria-hidden="true" />
      <div className="cekmece" role="dialog" aria-modal="true" aria-labelledby={baslikId} ref={ref}>
        <div className="cekmece-ust">
          <h2 id={baslikId}>{baslik}</h2>
          {ust}
          <button type="button" className="dugme dugme-sessiz dugme-simge" onClick={() => kapatRef.current()} aria-label="Kapat">
            <Simge ad="kapat" />
          </button>
        </div>
        <div className="cekmece-govde">{children}</div>
        {alt ? <div className="cekmece-alt">{alt}</div> : null}
      </div>
    </>,
    document.body,
  );
}
