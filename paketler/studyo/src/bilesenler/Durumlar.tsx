// Boş, yükleniyor ve hata durumları
import type { ReactNode } from "react";
import { useSozluk } from "../dil";

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

export function Iskelet({ satir = 4, etiket }: { satir?: number; etiket?: string }) {
  const s = useSozluk();
  return (
    <div className="iskelet" role="status" aria-label={etiket ?? s.bilesenler.durumlar.yukleniyor}>
      {Array.from({ length: satir }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function Yukleniyor({ metin }: { metin?: string }) {
  const s = useSozluk();
  return (
    <span className="yukleniyor-satir" role="status">
      <span className="doner" aria-hidden="true" />
      {metin ?? s.genel.yukleniyor}
    </span>
  );
}

export function HataKutu({ baslik, metin, yeniden }: { baslik?: string; metin: string; yeniden?: () => void }) {
  const s = useSozluk();
  return (
    <div className="hata-kutu" role="alert">
      <b>{baslik ?? s.bilesenler.durumlar.yuklenemedi}</b>
      <span>{metin}</span>
      {yeniden ? (
        <div>
          <button type="button" className="dugme dugme-kucuk" onClick={yeniden}>
            {s.genel.yenidenDene}
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
