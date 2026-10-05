// Kısayol penceresi: ekranın tek tuşlu kısayolları. "?" ile açılır; Escape, "?", dışarı tıklama ya da kapat düğmesiyle
// kapanır. Odak kapat düğmesindedir (pencerede başka odaklanılacak bir şey yok), kapanınca önceki yere döner.
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useSozluk } from "../dil";
import "../stiller/canli.css";
import { Simge } from "./Simge";

export interface KisayolSatiri {
  tuslar: string[];
  aciklama: string;
}

export function KisayolPenceresi({ baslik, satirlar, kapat }: { baslik: string; satirlar: KisayolSatiri[]; kapat: () => void }) {
  const s = useSozluk();
  const ref = useRef<HTMLDivElement>(null);
  const baslikId = useId();
  const kapatRef = useRef(kapat);
  kapatRef.current = kapat;

  useEffect(() => {
    const onceki = document.activeElement as HTMLElement | null;
    const dugme = ref.current?.querySelector<HTMLElement>("button");
    dugme?.focus();
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "?" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        kapatRef.current();
      } else if (e.key === "Tab") {
        e.preventDefault();
        dugme?.focus();
      }
    };
    document.addEventListener("keydown", tus);
    return () => {
      document.removeEventListener("keydown", tus);
      onceki?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="kisayol-perde"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) kapatRef.current();
      }}
    >
      <div className="kisayol-pencere" role="dialog" aria-modal="true" aria-labelledby={baslikId} ref={ref}>
        <div className="kisayol-ust">
          <h2 id={baslikId}>{baslik}</h2>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={() => kapatRef.current()} aria-label={s.genel.kapat}>
            <Simge ad="kapat" />
          </button>
        </div>
        <dl className="kisayol-liste">
          {satirlar.map((r) => (
            <div key={r.aciklama} className="kisayol-satir">
              <dt>
                {r.tuslar.map((t) => (
                  <kbd key={t}>{t}</kbd>
                ))}
              </dt>
              <dd>{r.aciklama}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
