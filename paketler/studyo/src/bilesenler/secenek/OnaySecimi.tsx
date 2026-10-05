// Kurula sorunun (kurula_sor, genel onay) seçenekleri: bekleyen soruda seçilir, seçilen seçenek (ve not) sorana yanıt
// olarak gider (onay notu "2) Seçenek — not"); Reddet hayır demektir, not gerekçe olur. Sonuçlanan soruda liste seçilen
// işaretli çizilir. Onaylar ekranı (OnayOgesi) ve her ekrandaki açılır pencere (KurulBildirimleri) kullanır.
import type { Onay } from "@arnorg/ortak";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { onayUygula, useVeri } from "../../durum/veri";
import { kisalt } from "../../yardimcilar/bicim";
import { onaySecenekleri, onaySecilen, onaySorusu } from "../../yardimcilar/secenek";
import { Simge } from "../Simge";
import { SecenekSecici } from "./SecenekSecici";
import "../../stiller/secenek.css";

/** Not alanının üst sınırı (POST /api/onaylar/:oid) */
const NOT_SINIRI = 4000;

export function OnaySecimi({
  onay,
  aciklayan,
  kilitli,
  ikincil,
  sikisik,
  sonra,
}: {
  onay: Onay;
  aciklayan?: string;
  /** Süre doldu */
  kilitli?: boolean;
  /** Karar CEO'da (tam otonom): kurulun düğmeleri ikincil */
  ikincil?: boolean;
  /** Açılır pencerede */
  sikisik?: boolean;
  /** Karar verilince (açılır pencere kapanır) */
  sonra?: () => void;
}) {
  const s = useSozluk();
  const t = s.secenek;
  const secenekler = onaySecenekleri(onay);
  const soru = onaySorusu(onay) ?? onay.baslik;
  const soran = useVeri((d) => d.ajanlar.find((a) => a.id === onay.ajanId)?.ad ?? null);

  const karar = async (ne: "onayla" | "reddet", not: string) => {
    // Not olduğu gibi gider (satır sonları korunur); yalnız uç sınırında kesilir
    const sonuc = await api.onayKarari(onay.id, { karar: ne, not: not ? not.slice(0, NOT_SINIRI) : undefined });
    onayUygula(sonuc);
    const m = sozluk().secenek.onay;
    bildir(ne === "onayla" ? "basari" : "bilgi", ne === "onayla" ? m.yanitlandi(kisalt(soru, 60)) : m.reddedildi(kisalt(soru, 60)));
    sonra?.();
  };

  return (
    <div className="secenek-onay">
      <SecenekSecici
        secenekler={secenekler.map((metin) => ({ metin }))}
        coklu={false}
        serbestYanit
        etiket={t.grup(soru)}
        gonder={(secilenler, not) => {
          const n = secilenler[0];
          return karar("onayla", n ? t.onay.yanit(n, secenekler[n - 1]!, not) : not);
        }}
        gonderMetni={t.onay.yanitla}
        reddet={(not) => karar("reddet", not)}
        ikincil={ikincil}
        kilitli={kilitli}
        sikisik={sikisik}
        aciklayan={aciklayan}
      />
      {sikisik ? null : <p className="secenek-onay-ipucu">{t.onay.ipucu(soran)}</p>}
    </div>
  );
}

/** Sonuçlanan sorunun seçenekleri: kurulun notundan anlaşılan seçilen işaretli */
export function OnaySecenekListesi({ onay, secenekler }: { onay: Onay; secenekler: string[] }) {
  const t = useSozluk().secenek;
  const secilen = onaySecilen(onay, secenekler);
  return (
    <ol className="onay-secenekler secenek-onay-liste">
      {secenekler.map((x, i) => (
        <li key={i} className={secilen === i + 1 ? "secenek-onay-secilen" : undefined}>
          {x}
          {secilen === i + 1 ? (
            <span className="secenek-onay-isaret">
              <Simge ad="tamam" boyut={11} />
              {t.onay.secilen}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
