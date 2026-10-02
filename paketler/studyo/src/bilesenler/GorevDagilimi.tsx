// Görevlerin durumlara dağılımı: bölümlü çubuk ve lejant
import { GOREV_DURUM_ADLARI, type GorevDurumu } from "@arnorg/ortak";

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
  const toplam = SIRA.reduce((t, d) => t + (sayilar[d] ?? 0), 0);
  const ozet = SIRA.map((d) => `${GOREV_DURUM_ADLARI[d]} ${sayilar[d] ?? 0}`).join(", ");
  return (
    <div className="dagilim">
      <div className={`ilerleme${ince ? " ilerleme-ince" : ""}`} role="img" aria-label={`Görev dağılımı: ${ozet}`}>
        {toplam === 0 ? <span className="seg seg-bos" style={{ flex: 1 }} /> : null}
        {SIRA.map((d) =>
          sayilar[d] ? <span key={d} className={`seg seg-${d}`} style={{ flex: sayilar[d] }} title={`${GOREV_DURUM_ADLARI[d]}: ${sayilar[d]}`} /> : null,
        )}
      </div>
      {lejant ? (
        <ul className="lejant">
          {SIRA.map((d) => (
            <li key={d}>
              <span className={`sw seg-${d}`} aria-hidden="true" />
              {GOREV_DURUM_ADLARI[d]} <b>{sayilar[d] ?? 0}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
