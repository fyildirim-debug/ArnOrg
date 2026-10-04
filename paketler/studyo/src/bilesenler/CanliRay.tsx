// Sağdaki canlı akış rayı: bütün ajanların araç çağrıları ve denetim kararları
import { useEffect, useRef } from "react";
import { useSozluk } from "../dil";
import { ajanaGit } from "../durum/arayuz";
import { metinCevir, useVeri } from "../durum/veri";
import { saat } from "../yardimcilar/bicim";
import { Simge } from "./Simge";

export function CanliRay({ kapat }: { kapat: () => void }) {
  const s = useSozluk();
  const r = s.gezinti.ray;
  const canli = useVeri((d) => d.canli);
  // İlk çizimde gelenler canlandırılmaz; sonradan düşenler kayarak girer
  const gorulen = useRef<Set<string> | null>(null);
  if (gorulen.current === null) gorulen.current = new Set(canli.map((o) => o.id));
  useEffect(() => {
    canli.forEach((o) => gorulen.current?.add(o.id));
  }, [canli]);

  return (
    <aside className="ray" aria-label={r.baslik}>
      <div className="ray-baslik">
        <h2>{r.baslik}</h2>
        <small>{r.alt}</small>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={kapat} aria-label={r.gizle} title={r.gizleKisa}>
          <Simge ad="kapat" boyut={12} />
        </button>
      </div>
      {canli.length === 0 ? (
        <p className="ray-bos">{r.bos}</p>
      ) : (
        <ol className="akis" aria-live="off">
          {canli.map((o) => {
            const ajanAd = metinCevir(o.ajanAd, s);
            const hedef = metinCevir(o.hedef, s);
            return (
              <li key={o.id} className={`olay${gorulen.current?.has(o.id) ? "" : " olay-yeni"}`}>
                <button
                  type="button"
                  className="olay-dugme"
                  onClick={() => (o.ajanId ? ajanaGit(o.ajanId) : undefined)}
                  disabled={!o.ajanId}
                  title={o.ajanId ? s.genel.oturumuAc(ajanAd) : undefined}
                >
                  <span className="olay-ust">
                    <b>{ajanAd}</b>
                    <span className={`arac arac-${o.sinif}`}>{metinCevir(o.etiket, s)}</span>
                    <time dateTime={o.zaman}>{saat(o.zaman)}</time>
                  </span>
                  {hedef ? <span className="olay-hedef">{hedef}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
