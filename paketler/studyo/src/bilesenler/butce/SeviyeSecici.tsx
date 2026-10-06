// Kullanım seviyesi seçimi (0.0.10): Zeki, Normal, Tasarruflu. Her seçenek kademelerin modelini (hesabın kataloğundaki
// sürümlü adıyla), düşünme derinliğini, görev token tavanını ve aynı anda çalışan sınırını söyler; değerler kurulun
// ayarlarından (görev tavanı, eşzamanlı üst sınır) hesaplanır. Proje açarken ve Proje ayarlarında kart olarak, üst
// çubuğun bütçe panelinde bölümlü düğme olarak kullanılır.
import {
  KULLANIM_SEVIYELERI,
  ROL_KADEMELERI,
  SEVIYE_DERINLIGI,
  SEVIYE_MODELLERI,
  seviyeGorevTavani,
  seviyeTempoSiniri,
  type KullanimSeviyesi,
} from "@arnorg/ortak";
import { useEffect } from "react";
import { useSozluk } from "../../dil";
import { modelAdi, rolModeli, useModelKatalogu } from "../../durum/modeller";
import { ayarlariYukle, useVeri } from "../../durum/veri";
import { kisaToken } from "../../yardimcilar/bicim";

/** Ayarlar yüklenmediyse çekirdeğin varsayılanları (görev tavanı 2 M, üst sınır 8) */
const VARSAYILAN_TAVAN = 2_000_000;
const VARSAYILAN_UST = 8;

/** Kurulun ayarları (görev tavanı, eşzamanlı üst sınır); ilk kullanımda yüklenir */
function useSeviyeAyarlari(): { temel: number; ust: number } {
  const ayarlar = useVeri((d) => d.ayarlar);
  useEffect(() => {
    if (!useVeri.getState().ayarlar) void ayarlariYukle();
  }, []);
  return { temel: ayarlar?.gorevTokenTavani ?? VARSAYILAN_TAVAN, ust: ayarlar?.esZamanliAjan ?? VARSAYILAN_UST };
}

/** Seviyenin kural satırı: "orta düşünme · görev tavanı 2 M · aynı anda en çok 6 çalışan" */
export function useSeviyeKurali(): (s: KullanimSeviyesi) => string {
  const t = useSozluk().butce.seviye;
  const { temel, ust } = useSeviyeAyarlari();
  return (x) => {
    const tavan = seviyeGorevTavani(temel, x);
    const tempo = seviyeTempoSiniri(x, ust) || ust;
    return [t.derinlik[SEVIYE_DERINLIGI[x]], tavan ? t.tavan(kisaToken(tavan)) : t.tavanKapali, tempo ? t.tempo(tempo) : t.tempoSinirsiz].join(" · ");
  };
}

export function SeviyeSecici({
  ad,
  deger,
  degisti,
  kilitli = false,
  suruyor = null,
  etiketId,
}: {
  /** Radyo grubunun adı (sayfada tek olmalı) */
  ad: string;
  deger: KullanimSeviyesi;
  degisti: (s: KullanimSeviyesi) => void;
  kilitli?: boolean;
  /** Kaydedilmekte olan seçim: yanında dönen işaret */
  suruyor?: KullanimSeviyesi | null;
  /** Grubu adlandıran başlığın kimliği; yoksa "Kullanım seviyesi" */
  etiketId?: string;
}) {
  const t = useSozluk().butce.seviye;
  const katalog = useModelKatalogu();
  const kural = useSeviyeKurali();
  return (
    <div className="seviye-secim" role="radiogroup" aria-labelledby={etiketId} aria-label={etiketId ? undefined : t.baslik}>
      {KULLANIM_SEVIYELERI.map((x) => (
        <label key={x} className="seviye-secenek" data-secili={deger === x ? "" : undefined}>
          <input type="radio" name={ad} value={x} checked={deger === x} onChange={() => degisti(x)} disabled={kilitli} />
          <span className="seviye-metin">
            <b>
              {t.adlar[x]}
              {suruyor === x ? <span className="doner" aria-hidden="true" /> : null}
            </b>
            <small>{t.aciklamalar[x]}</small>
            <span className="seviye-modeller">
              {ROL_KADEMELERI.map((k) => (
                <span key={k}>
                  <i>{t.kademeler[k]}</i> {modelAdi(rolModeli(SEVIYE_MODELLERI[x][k], katalog), katalog)}
                </span>
              ))}
            </span>
            <span className="seviye-kural">{kural(x)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Bütçe panelindeki sıkı seçim: üç düğme; ayrıntı ipucunda */
export function SeviyeDugmeleri({
  deger,
  degisti,
  suruyor = null,
  etiketId,
}: {
  deger: KullanimSeviyesi;
  degisti: (s: KullanimSeviyesi) => void;
  suruyor?: KullanimSeviyesi | null;
  etiketId?: string;
}) {
  const t = useSozluk().butce.seviye;
  const kural = useSeviyeKurali();
  return (
    <div className="bolumlu seviye-dugmeleri" role="group" aria-labelledby={etiketId}>
      {KULLANIM_SEVIYELERI.map((x) => (
        <button key={x} type="button" aria-pressed={deger === x} title={`${t.aciklamalar[x]} ${kural(x)}.`} disabled={suruyor !== null} onClick={() => deger !== x && degisti(x)}>
          {t.adlar[x]}
          {suruyor === x ? <span className="doner" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}
