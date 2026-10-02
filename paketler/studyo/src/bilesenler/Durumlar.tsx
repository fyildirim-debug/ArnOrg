// Boş, yükleniyor ve hata durumları
import type { ReactNode } from "react";

export function Bos({
  baslik,
  children,
  eylem,
  kucuk,
  ortali,
}: {
  baslik: string;
  children?: ReactNode;
  eylem?: ReactNode;
  kucuk?: boolean;
  ortali?: boolean;
}) {
  return (
    <div className={`bos${kucuk ? " bos-kucuk" : ""}${ortali ? " bos-ortali" : ""}`}>
      <b>{baslik}</b>
      {children ? <p>{children}</p> : null}
      {eylem ? <div className="dugme-satir">{eylem}</div> : null}
    </div>
  );
}

export function Iskelet({ satir = 4, etiket = "Yükleniyor" }: { satir?: number; etiket?: string }) {
  return (
    <div className="iskelet" role="status" aria-label={etiket}>
      {Array.from({ length: satir }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function Yukleniyor({ metin = "Yükleniyor…" }: { metin?: string }) {
  return (
    <span className="yukleniyor-satir" role="status">
      <span className="doner" aria-hidden="true" />
      {metin}
    </span>
  );
}

export function HataKutu({ baslik = "Yüklenemedi", metin, yeniden }: { baslik?: string; metin: string; yeniden?: () => void }) {
  return (
    <div className="hata-kutu" role="alert">
      <b>{baslik}</b>
      <span>{metin}</span>
      {yeniden ? (
        <div>
          <button type="button" className="dugme dugme-kucuk" onClick={yeniden}>
            Yeniden dene
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Düğme içinde dönen gösterge */
export function DugmeYukleniyor({ suruyor, children }: { suruyor: boolean; children: ReactNode }) {
  return (
    <>
      {suruyor ? <span className="doner" aria-hidden="true" /> : null}
      {children}
    </>
  );
}
