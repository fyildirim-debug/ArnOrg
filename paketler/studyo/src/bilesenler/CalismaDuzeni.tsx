// Ayarlar › Çalışma düzeni: aynı anda çalışan ajan tavanı, görev token tavanı ve açılışta yarım kalan işe dönüş.
// Ayarlar formunun parçasıdır: değerler formun taslağına yazılır, Kaydet ile çekirdeğe gider.
import type { Ayarlar } from "@arnorg/ortak";
import { useSozluk } from "../dil";

const MILYON = 1_000_000;
const EN_COK_AJAN = 50;
const EN_COK_MILYON = 1000;

const esZamanliGecersiz = (v: number) => !Number.isInteger(v) || v < 0 || v > EN_COK_AJAN;
const tavanGecersiz = (v: number) => !Number.isFinite(v) || v < 0 || v > EN_COK_MILYON * MILYON;

/** Çekirdek bu ayarları biliyor mu (eski çekirdekte bölüm gösterilmez) */
function destekleniyor(a: Ayarlar): boolean {
  return typeof a.esZamanliAjan === "number" && typeof a.gorevTokenTavani === "number" && typeof a.acilistaSurdur === "boolean";
}

/** Formun Kaydet düğmesi için: bölümde geçersiz değer var mı */
export function calismaDuzeniGecersiz(a: Ayarlar): boolean {
  return destekleniyor(a) && (esZamanliGecersiz(a.esZamanliAjan) || tavanGecersiz(a.gorevTokenTavani));
}

export function CalismaDuzeni({ taslak, degistir }: { taslak: Ayarlar; degistir: (d: Partial<Ayarlar>) => void }) {
  const t = useSozluk().ayarlar.calismaDuzeni;
  if (!destekleniyor(taslak)) return null;
  const esHata = esZamanliGecersiz(taslak.esZamanliAjan);
  const tavanHata = tavanGecersiz(taslak.gorevTokenTavani);
  return (
    <>
      <h2 className="ara-baslik" id="ayar-calisma-baslik">
        {t.baslik}
      </h2>
      <div className="form-izgara" role="group" aria-labelledby="ayar-calisma-baslik">
        <div className="alan">
          <label htmlFor="ay-eszamanli">{t.esZamanli}</label>
          <input
            id="ay-eszamanli"
            className="girdi"
            type="number"
            inputMode="numeric"
            min={0}
            max={EN_COK_AJAN}
            step={1}
            value={Number.isFinite(taslak.esZamanliAjan) ? taslak.esZamanliAjan : ""}
            onChange={(e) => degistir({ esZamanliAjan: e.target.valueAsNumber })}
            aria-invalid={esHata ? true : undefined}
            aria-describedby="ay-eszamanli-ipucu"
          />
          <span id="ay-eszamanli-ipucu" className={esHata ? "alan-hata" : "alan-ipucu"}>
            {esHata ? t.esZamanliHata : t.esZamanliIpucu}
          </span>
        </div>
        <div className="alan">
          <label htmlFor="ay-gorev-tavani">{t.tavan}</label>
          <input
            id="ay-gorev-tavani"
            className="girdi"
            type="number"
            inputMode="decimal"
            min={0}
            max={EN_COK_MILYON}
            step={0.5}
            value={Number.isFinite(taslak.gorevTokenTavani) ? taslak.gorevTokenTavani / MILYON : ""}
            onChange={(e) => degistir({ gorevTokenTavani: Math.round(e.target.valueAsNumber * MILYON) })}
            aria-invalid={tavanHata ? true : undefined}
            aria-describedby="ay-gorev-tavani-ipucu"
          />
          <span id="ay-gorev-tavani-ipucu" className={tavanHata ? "alan-hata" : "alan-ipucu"}>
            {tavanHata ? t.tavanHata : t.tavanIpucu}
          </span>
        </div>
        <div className="alan tam">
          <label className="secenek">
            <input type="checkbox" checked={taslak.acilistaSurdur} onChange={(e) => degistir({ acilistaSurdur: e.target.checked })} aria-describedby="ay-surdur-ipucu" />
            {t.surdur}
          </label>
          <span id="ay-surdur-ipucu" className="alan-ipucu">
            {t.surdurIpucu}
          </span>
        </div>
      </div>
    </>
  );
}
