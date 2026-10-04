// Kurulum denetim listesi: her satırda durum işareti, ad, kısa durum ve gerekiyorsa eylem
import type { ReactNode } from "react";
import { useSozluk } from "../dil";
import { Simge } from "./Simge";

export type OgeDurumu = "tamam" | "eksik" | "hata" | "bilgi";

export function KurulumListesi({ children }: { children: ReactNode }) {
  return <ol className="kurulum-liste">{children}</ol>;
}

export function KurulumOgesi({
  durum,
  baslik,
  deger,
  children,
}: {
  durum: OgeDurumu;
  baslik: string;
  /** Satırın sağındaki kısa durum (sürüm, hesap…) */
  deger?: ReactNode;
  /** Eksikse açıklama, eylem ve canlı işlem */
  children?: ReactNode;
}) {
  const t = useSozluk().kurulum.liste;
  return (
    <li className="kurulum-oge" data-durum={durum}>
      <span className="kurulum-isaret" aria-hidden="true">
        <Simge ad={durum === "tamam" ? "tamam" : durum === "hata" ? "uyari" : "halka"} boyut={14} />
      </span>
      <div className="kurulum-oge-ust">
        <b>
          {baslik}
          <span className="gizli"> · {t[durum]}</span>
        </b>
        {deger ? <span className="kurulum-deger">{deger}</span> : null}
      </div>
      {children ? <div className="kurulum-oge-govde">{children}</div> : null}
    </li>
  );
}
