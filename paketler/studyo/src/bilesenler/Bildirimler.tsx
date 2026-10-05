// Ekranın sağ altında üst üste duran bildirimler: sağdan kayarak girer, kapanınca kısa bir çıkışla söner; kalanlar
// boşalan yere kayar (yardimcilar/cikis.ts, flip.ts)
import { useRef } from "react";
import { useSozluk } from "../dil";
import { bildirimKapat, useArayuz, type Bildirim } from "../durum/arayuz";
import { useCikanlar } from "../yardimcilar/cikis";
import { useFlip } from "../yardimcilar/flip";
import { Simge } from "./Simge";

const anahtar = (b: Bildirim) => String(b.id);

export function Bildirimler() {
  const s = useSozluk();
  const bildirimler = useArayuz((d) => d.bildirimler);
  const gorunen = useCikanlar(bildirimler, anahtar);
  const kap = useRef<HTMLDivElement>(null);
  // Kap sağ alta yaslı: yeni bildirim gelince kabın kendisi büyüyüp yukarı kayar, konumlar belgeye göre
  useFlip(kap, gorunen, { giris: false, belgeye: true });
  return (
    <div className="bildirimler" aria-live="polite" aria-relevant="additions" ref={kap}>
      {gorunen.map(({ oge: b, anahtar: a, cikiyor }) => (
        <div
          key={a}
          data-flip={a}
          className={`bildirim bildirim-${b.seviye}${cikiyor ? " bildirim-cikiyor" : ""}`}
          role={b.seviye === "hata" ? "alert" : "status"}
          aria-hidden={cikiyor || undefined}
        >
          <p>{b.metin}</p>
          <button
            type="button"
            className="dugme dugme-sessiz dugme-kucuk dugme-simge"
            onClick={() => bildirimKapat(b.id)}
            aria-label={s.gezinti.bildirimKapat}
            tabIndex={cikiyor ? -1 : undefined}
          >
            <Simge ad="kapat" boyut={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
