// Sağdaki canlı akış rayı: bütün ajanların araç çağrıları ve denetim kararları
import { useEffect, useRef } from "react";
import { ajanaGit } from "../durum/arayuz";
import { useVeri } from "../durum/veri";
import { saat } from "../yardimcilar/bicim";
import { Simge } from "./Simge";

export function CanliRay({ kapat }: { kapat: () => void }) {
  const canli = useVeri((d) => d.canli);
  // İlk çizimde gelenler canlandırılmaz; sonradan düşenler kayarak girer
  const gorulen = useRef<Set<string> | null>(null);
  if (gorulen.current === null) gorulen.current = new Set(canli.map((o) => o.id));
  useEffect(() => {
    canli.forEach((o) => gorulen.current?.add(o.id));
  }, [canli]);

  return (
    <aside className="ray" aria-label="Canlı akış">
      <div className="ray-baslik">
        <h2>Canlı akış</h2>
        <small>araç çağrıları</small>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={kapat} aria-label="Canlı akışı gizle" title="Gizle">
          <Simge ad="kapat" boyut={12} />
        </button>
      </div>
      {canli.length === 0 ? (
        <p className="ray-bos">Ajanlar çalışmaya başlayınca her araç çağrısı ve denetim kararı burada akar.</p>
      ) : (
        <ol className="akis" aria-live="off">
          {canli.map((o) => (
            <li key={o.id} className={`olay${gorulen.current?.has(o.id) ? "" : " olay-yeni"}`}>
              <button
                type="button"
                className="olay-dugme"
                onClick={() => (o.ajanId ? ajanaGit(o.ajanId) : undefined)}
                disabled={!o.ajanId}
                title={o.ajanId ? `${o.ajanAd} oturumunu aç` : undefined}
              >
                <span className="olay-ust">
                  <b>{o.ajanAd}</b>
                  <span className={`arac arac-${o.sinif}`}>{o.etiket}</span>
                  <time dateTime={o.zaman}>{saat(o.zaman)}</time>
                </span>
                {o.hedef ? <span className="olay-hedef">{o.hedef}</span> : null}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
