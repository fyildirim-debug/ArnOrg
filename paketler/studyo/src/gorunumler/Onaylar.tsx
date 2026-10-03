// Onaylar: işe alım, birleştirme, genel kararlar ve araç çağrıları; duruma göre süzülür
import { ONAY_TURU_ADLARI, type OnayDurumu, type OnayTuru } from "@arnorg/ortak";
import { useEffect, useMemo, useState } from "react";
import { Bos, Iskelet } from "../bilesenler/Durumlar";
import { ONAY_DURUM_ADLARI, OnayOgesi } from "../bilesenler/OnayOgesi";
import { rolleriYukle, useVeri } from "../durum/veri";

const DURUMLAR: (OnayDurumu | "tumu")[] = ["bekliyor", "onaylandi", "reddedildi", "zaman_asimi", "tumu"];
const TURLER: (OnayTuru | "tumu")[] = ["tumu", "ise_alim", "birlestirme", "genel", "arac"];

export function Onaylar() {
  const onaylar = useVeri((d) => d.onaylar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const [durum, setDurum] = useState<OnayDurumu | "tumu">("bekliyor");
  const [tur, setTur] = useState<OnayTuru | "tumu">("tumu");

  useEffect(() => {
    rolleriYukle().catch(() => undefined);
  }, []);

  const sayilar = useMemo(() => {
    const s: Record<string, number> = { tumu: onaylar.length };
    for (const o of onaylar) s[o.durum] = (s[o.durum] ?? 0) + 1;
    return s;
  }, [onaylar]);

  const liste = onaylar.filter((o) => (durum === "tumu" || o.durum === durum) && (tur === "tumu" || o.tur === tur));

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>Onaylar</h1>
          <p>İşe alım, main'e birleştirme ve geri alınamaz kararlar sizden geçer</p>
        </div>
      </div>
      <div className="suzgec">
        <div className="bolumlu" role="group" aria-label="Duruma göre süz">
          {DURUMLAR.map((d) => (
            <button key={d} type="button" aria-pressed={durum === d} onClick={() => setDurum(d)}>
              {d === "tumu" ? "Tümü" : ONAY_DURUM_ADLARI[d]} <span className="soluk sayi">{sayilar[d] ?? 0}</span>
            </button>
          ))}
        </div>
        <select className="secim suzgec-secim" aria-label="Türe göre süz" value={tur} onChange={(e) => setTur(e.target.value as OnayTuru | "tumu")}>
          {TURLER.map((t) => (
            <option key={t} value={t}>
              {t === "tumu" ? "Bütün türler" : ONAY_TURU_ADLARI[t]}
            </option>
          ))}
        </select>
      </div>
      {yukleme === "yukleniyor" && !onaylar.length ? <Iskelet satir={6} /> : null}
      {yukleme !== "yukleniyor" && !liste.length ? (
        <Bos baslik={durum === "bekliyor" ? "Bekleyen karar yok" : "Bu süzgeçte onay yok"}>
          {durum === "bekliyor"
            ? "CEO işe alım teklif ettiğinde, bir iş main'e girmeye hazır olduğunda burada karar verirsiniz."
            : "Süzgeci değiştirin."}
        </Bos>
      ) : null}
      {liste.length ? (
        <ul className="onay-liste">
          {liste.map((o) => (
            <OnayOgesi key={o.id} onay={o} />
          ))}
        </ul>
      ) : null}
    </>
  );
}
