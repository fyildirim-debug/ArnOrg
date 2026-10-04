// Ekranın sağ altında üst üste duran bildirimler
import { useSozluk } from "../dil";
import { bildirimKapat, useArayuz } from "../durum/arayuz";
import { Simge } from "./Simge";

export function Bildirimler() {
  const s = useSozluk();
  const bildirimler = useArayuz((d) => d.bildirimler);
  return (
    <div className="bildirimler" aria-live="polite" aria-relevant="additions">
      {bildirimler.map((b) => (
        <div key={b.id} className={`bildirim bildirim-${b.seviye}`} role={b.seviye === "hata" ? "alert" : "status"}>
          <p>{b.metin}</p>
          <button
            type="button"
            className="dugme dugme-sessiz dugme-kucuk dugme-simge"
            onClick={() => bildirimKapat(b.id)}
            aria-label={s.gezinti.bildirimKapat}
          >
            <Simge ad="kapat" boyut={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
