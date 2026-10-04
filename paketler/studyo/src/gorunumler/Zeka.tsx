// Zekâ: projenin ana yasası, ArnOrg'un global zekâsı, ekip becerileri ve sözler
import { useSozluk } from "../dil";
import { gorunumAdi } from "../bilesenler/Gezinti";

export function Zeka() {
  const s = useSozluk();
  return (
    <div className="baslik">
      <div className="baslik-metin">
        <h1>{gorunumAdi(s, "zeka")}</h1>
      </div>
    </div>
  );
}
