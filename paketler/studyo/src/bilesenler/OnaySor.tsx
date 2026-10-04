// Sayfa içi onay kutusu (window.confirm yerine)
import { useEffect, useRef, type ReactNode } from "react";
import { useSozluk } from "../dil";

export function OnaySor({
  children,
  evet,
  vazgec,
  evetMetni,
  suruyor,
  uyari,
}: {
  children: ReactNode;
  evet: () => void;
  vazgec: () => void;
  evetMetni?: string;
  suruyor?: boolean;
  /** Tehlike yerine sarı uyarı görünümü */
  uyari?: boolean;
}) {
  const s = useSozluk();
  const vazgecRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Yanlışlıkla onaylanmasın: odak Vazgeç'te başlar
    vazgecRef.current?.focus();
  }, []);
  return (
    <div
      className={`onay-sor${uyari ? " onay-sor-uyari" : ""}`}
      role="alertdialog"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          vazgec();
        }
      }}
    >
      <p>{children}</p>
      <div className="dugme-satir">
        <button type="button" className={`dugme dugme-kucuk ${uyari ? "dugme-ana" : "dugme-tehlike"}`} onClick={evet} disabled={suruyor}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : null}
          {evetMetni ?? s.genel.evet}
        </button>
        <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={vazgec} ref={vazgecRef}>
          {s.genel.vazgec}
        </button>
      </div>
    </div>
  );
}
