// Ayarlar › Brifing: günlük otomatik brifing açık mı ve saati (yerel saat). Ayarlar formunun parçasıdır: değerler
// formun taslağına yazılır, Kaydet ile çekirdeğe gider (Ayarlar.gunlukBrifing). Eski çekirdekte bölüm görünmez.
import type { Ayarlar } from "@arnorg/ortak";
import { useSozluk } from "../dil";
import "../stiller/brifing.css";

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function BrifingAyari({ taslak, degistir }: { taslak: Ayarlar; degistir: (d: Partial<Ayarlar>) => void }) {
  const t = useSozluk().brifing.ayar;
  const g = taslak.gunlukBrifing;
  if (!g || typeof g.acik !== "boolean") return null;
  return (
    <>
      <h2 className="ara-baslik" id="ayar-brifing-baslik">
        {t.baslik}
      </h2>
      <div className="brifing-ayar" role="group" aria-labelledby="ayar-brifing-baslik">
        <div className="brifing-ayar-satir">
          <label className="secenek">
            <input type="checkbox" checked={g.acik} onChange={(e) => degistir({ gunlukBrifing: { ...g, acik: e.target.checked } })} aria-describedby="ay-brifing-ipucu" />
            {t.gunluk}
          </label>
          <input
            id="ay-brifing-saat"
            className="girdi brifing-saat"
            type="time"
            step={60}
            required
            value={g.saat}
            disabled={!g.acik}
            aria-label={t.saat}
            aria-describedby="ay-brifing-ipucu"
            // Boşaltılan alan kaydedilmez: son geçerli saat kalır
            onChange={(e) => {
              if (SAAT.test(e.target.value)) degistir({ gunlukBrifing: { ...g, saat: e.target.value } });
            }}
          />
        </div>
        <p id="ay-brifing-ipucu" className="alan-ipucu">
          {g.acik ? t.ipucu : t.kapaliIpucu}
        </p>
      </div>
    </>
  );
}
