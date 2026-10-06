// Token bütçesi alanları (0.0.10): toplam ve günlük, milyon token olarak; boş ya da 0 sınırsız. Hazır değerler tek
// tıkla seçilir; geçersiz girdi alanın altında söylenir.
import { useSozluk } from "../../dil";
import type { ButceGirdisi } from "./butceYardimcilari";

const HAZIR = { toplam: [10, 25, 50, 100], gunluk: [2, 5, 10] } as const;

export function ButceAlanlari({
  id,
  deger,
  degisti,
  hatali,
  kilitli = false,
}: {
  id: string;
  deger: ButceGirdisi;
  degisti: (d: ButceGirdisi) => void;
  hatali?: { toplam: boolean; gunluk: boolean };
  kilitli?: boolean;
}) {
  const t = useSozluk().butce.butce;
  const alan = (k: "toplam" | "gunluk") => {
    const ad = k === "toplam" ? t.toplam : t.gunluk;
    const hata = Boolean(hatali?.[k]);
    const temiz = deger[k].trim().replace(",", ".");
    return (
      <div className="alan butce-alan">
        <label htmlFor={`${id}-${k}`}>{ad}</label>
        <div className="butce-girdi">
          <input
            id={`${id}-${k}`}
            className="girdi"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder={t.sinirsiz}
            value={deger[k]}
            onChange={(e) => degisti({ ...deger, [k]: e.target.value })}
            aria-invalid={hata || undefined}
            aria-describedby={`${id}-${k}-ipucu`}
            disabled={kilitli}
          />
          <span className="butce-birim" aria-hidden="true">
            {t.birim}
          </span>
        </div>
        <div className="butce-hazir" role="group" aria-label={t.hazirEtiket(ad)}>
          <button type="button" aria-pressed={!temiz || Number(temiz) === 0} onClick={() => degisti({ ...deger, [k]: "" })} disabled={kilitli}>
            {t.sinirsiz}
          </button>
          {HAZIR[k].map((m) => (
            <button key={m} type="button" aria-pressed={Number(temiz) === m} onClick={() => degisti({ ...deger, [k]: String(m) })} disabled={kilitli}>
              {t.milyon(m)}
            </button>
          ))}
        </div>
        <span id={`${id}-${k}-ipucu`} className={hata ? "alan-hata" : "alan-ipucu"}>
          {hata ? t.hata : k === "toplam" ? t.toplamIpucu : t.gunlukIpucu}
        </span>
      </div>
    );
  };
  return (
    <div className="butce-alanlari">
      {alan("toplam")}
      {alan("gunluk")}
    </div>
  );
}
