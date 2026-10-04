// Görevlerin durumlara dağılımı: bölümlü çubuk ve lejant
import type { GorevDurumu } from "@arnorg/ortak";
import { useSozluk } from "../dil";

const SIRA: GorevDurumu[] = ["bekleyen", "planlandi", "calisiliyor", "inceleme", "tamam"];

export function GorevDagilimi({
  sayilar,
  lejant = true,
  ince,
}: {
  sayilar: Partial<Record<GorevDurumu, number>>;
  lejant?: boolean;
  ince?: boolean;
}) {
  const s = useSozluk();
  const adlar = s.genel.gorevDurumu;
  const toplam = SIRA.reduce((t, d) => t + (sayilar[d] ?? 0), 0);
  const ozet = SIRA.map((d) => `${adlar[d]} ${sayilar[d] ?? 0}`).join(", ");
  return (
    <div className="dagilim">
      <div className={`ilerleme${ince ? " ilerleme-ince" : ""}`} role="img" aria-label={s.bilesenler.gorevDagilimi(ozet)}>
        {toplam === 0 ? <span className="seg seg-bos" style={{ flex: 1 }} /> : null}
        {SIRA.map((d) =>
          sayilar[d] ? <span key={d} className={`seg seg-${d}`} style={{ flex: sayilar[d] }} title={`${adlar[d]}: ${sayilar[d]}`} /> : null,
        )}
      </div>
      {lejant ? (
        <ul className="lejant">
          {SIRA.map((d) => (
            <li key={d}>
              <span className={`sw seg-${d}`} aria-hidden="true" />
              {adlar[d]} <b>{sayilar[d] ?? 0}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
