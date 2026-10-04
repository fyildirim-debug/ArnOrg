// Proje konumu: proje kökü + klasör adı kendiliğinden önerilir. "Değiştir" klasör seçicisiyle üst klasörü seçer;
// yolu elle yazmak yalnız gelişmiş seçenektir.
import type { Sozluk } from "../dil";
import { useSozluk } from "../dil";
import { useKlasorSecici } from "./KlasorSecici";
import { mutlakMi, yolBirlestir } from "./kurulumYardimcilari";
import { Simge } from "./Simge";

export interface KonumDegeri {
  /** Klasör seçicisiyle seçilen üst klasör; null: proje kökü */
  ust: string | null;
  /** Elle yazılan tam yol; null: otomatik */
  elle: string | null;
}

export const OTOMATIK_KONUM: KonumDegeri = { ust: null, elle: null };

/** Çekirdeğe gidecek yol; değiştirilmediyse undefined (çekirdek proje kökünde açar) */
export function konumYolu(k: KonumDegeri, klasorAdi: string): string | undefined {
  if (k.elle !== null) return k.elle.trim() || undefined;
  if (k.ust) return yolBirlestir(k.ust, klasorAdi);
  return undefined;
}

export function konumHatasi(k: KonumDegeri, s: Sozluk): string | null {
  if (k.elle !== null && !mutlakMi(k.elle.trim())) return s.kurulum.konum.mutlak;
  return null;
}

export function KonumAlani({
  id,
  deger,
  degisti,
  klasorAdi,
  kok,
  hata,
  kilitli,
}: {
  id: string;
  deger: KonumDegeri;
  degisti: (k: KonumDegeri) => void;
  /** Proje ya da depo adından türeyen klasör adı; boşsa yer tutucu */
  klasorAdi: string;
  /** Kurulum durumundaki proje kökü */
  kok: string | null;
  hata?: string | null;
  kilitli?: boolean;
}) {
  const t = useSozluk().kurulum.konum;
  const { sec, pencere } = useKlasorSecici();
  const ust = deger.ust ?? kok;
  const tamYol = ust ? yolBirlestir(ust, klasorAdi || t.adYeri) : "";

  const degistir = async () => {
    const yol = await sec({ baslik: t.secBaslik, varsayilan: ust });
    if (yol) degisti({ ust: yol, elle: null });
  };

  return (
    <div className="alan tam konum">
      {deger.elle === null ? (
        <span className="alan-ad">{t.etiket}</span>
      ) : (
        <label htmlFor={id}>{t.elleEtiket}</label>
      )}
      {deger.elle === null ? (
        <div className="konum-satir">
          <code className="konum-yol" title={tamYol || undefined}>
            <span>{ust ? yolBirlestir(ust, "") : "…/"}</span>
            <b className={klasorAdi ? undefined : "konum-yer"}>{klasorAdi || t.adYeri}</b>
          </code>
          <button type="button" className="dugme dugme-kucuk" onClick={() => void degistir()} disabled={kilitli}>
            <Simge ad="klasor" />
            {t.degistir}
          </button>
        </div>
      ) : (
        <input
          id={id}
          className="girdi"
          value={deger.elle}
          onChange={(e) => degisti({ ...deger, elle: e.target.value })}
          placeholder={t.elleOrnek}
          spellCheck={false}
          autoComplete="off"
          disabled={kilitli}
          aria-invalid={hata ? true : undefined}
          autoFocus
        />
      )}
      <span className="konum-alt">
        {deger.elle === null ? <span className="alan-ipucu">{t.ipucu}</span> : null}
        {deger.ust && deger.elle === null ? (
          <button type="button" className="metin-dugme" onClick={() => degisti(OTOMATIK_KONUM)} disabled={kilitli}>
            {t.varsayilan}
          </button>
        ) : null}
        <button
          type="button"
          className="metin-dugme"
          disabled={kilitli}
          onClick={() => degisti(deger.elle === null ? { ust: deger.ust, elle: ust ? yolBirlestir(ust, klasorAdi) : "" } : { ...deger, elle: null })}
        >
          {deger.elle === null ? t.elle : t.elleKapat}
        </button>
      </span>
      {hata ? <span className="alan-hata">{hata}</span> : null}
      {pencere}
    </div>
  );
}
