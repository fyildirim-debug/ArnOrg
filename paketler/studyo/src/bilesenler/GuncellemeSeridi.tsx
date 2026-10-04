// Masaüstünde yeni sürüm indirildiğinde üst çubuğun altında sakin bir şerit: "ArnOrg <sürüm> hazır; yeniden başlatınca
// kurulur." Yeniden başlat hemen kurar ve uygulamayı yeniden açar; Sonra şeridi bu sürüm için bu oturumda gizler
// (güncelleme yine uygulama kapanırken kurulur). Tarayıcıda (masaüstü köprüsü yokken) hiç görünmez.
import type { MasaustuGuncellemeDurumu } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { useSozluk } from "../dil";
import { hataBildir } from "../durum/arayuz";
import { masaustu } from "./kurulumYardimcilari";

/** "Sonra" denen sürüm (bu pencere oturumu boyunca) */
const ERTELENEN = "arnorg.guncellemeErtelendi";

function ertelenenSurum(): string | null {
  try {
    return sessionStorage.getItem(ERTELENEN);
  } catch {
    return null;
  }
}

export function GuncellemeSeridi() {
  const t = useSozluk().bilesenler.guncelleme;
  const [durum, setDurum] = useState<MasaustuGuncellemeDurumu | null>(null);
  const [ertelenen, setErtelenen] = useState<string | null>(ertelenenSurum);
  const [kuruluyor, setKuruluyor] = useState(false);

  useEffect(() => {
    const g = masaustu()?.guncelleme;
    if (!g) return;
    // Önce dinlenir, sonra anlık durum okunur; arada olay geldiyse o daha yenidir
    let olayGeldi = false;
    const birak = g.dinle((d) => {
      olayGeldi = true;
      setDurum(d);
    });
    g.durum().then(
      (d) => {
        if (!olayGeldi && d) setDurum(d);
      },
      () => undefined,
    );
    return birak;
  }, []);

  const surum = durum?.asama === "hazir" ? durum.surum : null;
  if (!surum || surum === ertelenen) return null;

  const yenidenBaslat = () => {
    const g = masaustu()?.guncelleme;
    if (!g) return;
    setKuruluyor(true);
    g.kur().then(
      (oldu) => {
        if (!oldu) setKuruluyor(false);
      },
      (e: unknown) => {
        setKuruluyor(false);
        hataBildir(e);
      },
    );
  };
  const sonra = () => {
    try {
      sessionStorage.setItem(ERTELENEN, surum);
    } catch {
      // depolama kapalı: yalnız bu çizimde gizlenir
    }
    setErtelenen(surum);
  };

  return (
    <div className="guncelleme-serit" role="status" aria-label={t.etiket}>
      <span className="guncelleme-serit-isaret" aria-hidden="true" />
      <p>{t.hazir(surum)}</p>
      <div className="guncelleme-serit-eylem">
        <button type="button" className="dugme dugme-kucuk" onClick={yenidenBaslat} disabled={kuruluyor}>
          {kuruluyor ? <span className="doner" aria-hidden="true" /> : null}
          {kuruluyor ? t.baslatiliyor : t.yenidenBaslat}
        </button>
        <button type="button" className="metin-dugme" onClick={sonra} disabled={kuruluyor}>
          {t.sonra}
        </button>
      </div>
    </div>
  );
}
