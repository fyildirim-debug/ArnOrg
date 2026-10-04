// Sözler: çalışanların birbirine ve kurula verdiği sözler. Açıklar üstte (süresi geçen ve yaklaşan vurgulu),
// tutulan ve iptal edilenler altta sakin. "soz.guncellendi" olayıyla canlı güncellenir (Zekâ ekranı dinler).
import type { Soz } from "@arnorg/ortak";
import { useEffect, useMemo } from "react";
import { useSozluk } from "../../dil";
import { sozleriYukle, useProjeZekasi } from "../../durum/zeka";
import { useVeri } from "../../durum/veri";
import { useSimdi } from "../../yardimcilar/kancalar";
import { Bos, HataKutu, Iskelet } from "../Durumlar";
import { acikSozSirala, kapaliSozSirala, SozSatiri } from "./ortak";

const BOS: Soz[] = [];

export function Sozler() {
  const s = useSozluk();
  const t = s.zeka.sozler;
  const pid = useVeri((d) => d.aktifProjeId);
  const sozler = useProjeZekasi((d) => (d.projeId === pid ? d.sozler : BOS));
  const yukleme = useProjeZekasi((d) => (d.projeId === pid ? d.sozlerYukleme : "bos"));
  const hata = useProjeZekasi((d) => (d.projeId === pid ? d.sozlerHata : null));
  const simdi = useSimdi(60_000);

  useEffect(() => {
    if (pid) void sozleriYukle(pid);
  }, [pid]);

  const acik = useMemo(() => sozler.filter((x) => x.durum === "acik").sort(acikSozSirala), [sozler]);
  const kapali = useMemo(() => sozler.filter((x) => x.durum !== "acik").sort(kapaliSozSirala), [sozler]);

  return (
    <section className="sozler" aria-label={s.zeka.sekme.sozler}>
      <p className="zeka-aciklama">{t.aciklama}</p>
      {hata && !sozler.length ? <HataKutu metin={hata} yeniden={() => pid && void sozleriYukle(pid)} /> : null}
      {yukleme === "yukleniyor" && !sozler.length ? <Iskelet satir={5} etiket={t.yukleniyor} /> : null}
      {yukleme === "hazir" && !sozler.length ? <Bos baslik={t.bosBaslik}>{t.bosMetin}</Bos> : null}
      {sozler.length ? (
        <>
          <section aria-labelledby="sozler-acik">
            <h2 className="ara-baslik soz-grup-baslik" id="sozler-acik">
              {t.acik} <small className="sayi">{acik.length}</small>
            </h2>
            {acik.length ? (
              <ol className="soz-liste">
                {acik.map((x) => (
                  <SozSatiri key={x.id} soz={x} simdi={simdi} />
                ))}
              </ol>
            ) : (
              <p className="soz-bos">{t.acikYok}</p>
            )}
          </section>
          {kapali.length ? (
            <section aria-labelledby="sozler-kapali">
              <h2 className="ara-baslik soz-grup-baslik" id="sozler-kapali">
                {t.kapanan} <small className="sayi">{kapali.length}</small>
              </h2>
              <ol className="soz-liste soz-liste-kapali">
                {kapali.map((x) => (
                  <SozSatiri key={x.id} soz={x} simdi={simdi} />
                ))}
              </ol>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
