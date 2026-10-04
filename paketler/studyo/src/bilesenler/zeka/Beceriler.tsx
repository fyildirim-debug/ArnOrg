// Ekip becerileri: ekibin bu projede öğrendiği yöntemler (.arnorg/beceriler/). Satır açılınca içerik Markdown olarak okunur.
import type { Beceri } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { hataMetni } from "../../api/istek";
import { api } from "../../api/uclar";
import { useSozluk } from "../../dil";
import { becerileriYukle, beceriUygula, useProjeZekasi, useZekaArayuz } from "../../durum/zeka";
import { useVeri } from "../../durum/veri";
import { akilliZaman, goreli } from "../../yardimcilar/bicim";
import { Bos, HataKutu, Iskelet } from "../Durumlar";
import { Markdown } from "../Markdown";
import { Simge } from "../Simge";

const BOS: Beceri[] = [];

export function Beceriler() {
  const s = useSozluk();
  const t = s.zeka.beceriler;
  const pid = useVeri((d) => d.aktifProjeId);
  const beceriler = useProjeZekasi((d) => (d.projeId === pid ? d.beceriler : BOS));
  const yukleme = useProjeZekasi((d) => (d.projeId === pid ? d.becerilerYukleme : "bos"));
  const hata = useProjeZekasi((d) => (d.projeId === pid ? d.becerilerHata : null));
  const istenen = useZekaArayuz((d) => d.acikBeceri);
  const [acik, setAcik] = useState<Set<string>>(() => new Set(istenen ? [istenen] : []));

  useEffect(() => {
    if (pid) void becerileriYukle(pid);
  }, [pid]);

  // Ajan ayrıntısından bir beceri istendiyse açılır ve görünür kılınır
  useEffect(() => {
    if (!istenen || yukleme !== "hazir") return;
    setAcik((a) => new Set([...a, istenen]));
    useZekaArayuz.setState({ acikBeceri: null });
    requestAnimationFrame(() => document.getElementById(beceriKimligi(istenen))?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [istenen, yukleme]);

  const degistir = (ad: string) =>
    setAcik((a) => {
      const k = new Set(a);
      if (k.has(ad)) k.delete(ad);
      else k.add(ad);
      return k;
    });

  return (
    <section className="beceriler" aria-label={s.zeka.sekme.beceriler}>
      <p className="zeka-aciklama">
        {t.aciklama} <code>.arnorg/beceriler/</code>
      </p>
      {hata && !beceriler.length ? <HataKutu metin={hata} yeniden={() => pid && void becerileriYukle(pid)} /> : null}
      {yukleme === "yukleniyor" && !beceriler.length ? <Iskelet satir={5} etiket={t.yukleniyor} /> : null}
      {yukleme === "hazir" && !beceriler.length ? <Bos baslik={t.bosBaslik}>{t.bosMetin}</Bos> : null}
      {beceriler.length ? (
        <>
          <ul className="beceri-liste">
            {beceriler.map((b) => (
              <BeceriSatiri key={b.ad} beceri={b} acik={acik.has(b.ad)} degistir={() => degistir(b.ad)} />
            ))}
          </ul>
          <p className="alan-ipucu beceri-not">{t.kullanimNotu}</p>
        </>
      ) : null}
    </section>
  );
}

function beceriKimligi(ad: string): string {
  return `beceri-${encodeURIComponent(ad).replace(/%/g, "")}`;
}

function BeceriSatiri({ beceri, acik, degistir }: { beceri: Beceri; acik: boolean; degistir: () => void }) {
  const t = useSozluk().zeka.beceriler;
  const pid = useVeri((d) => d.aktifProjeId);
  const [icerik, setIcerik] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const kimlik = beceriKimligi(beceri.ad);

  const yukle = () => {
    if (!pid) return;
    setHata(null);
    api
      .beceri(pid, beceri.ad)
      .then((b) => {
        setIcerik(b.icerik);
        beceriUygula(b);
      })
      .catch((e: unknown) => setHata(hataMetni(e)));
  };

  // İçerik ilk açılışta bir kez okunur (okumak çekirdekte kullanım sayar)
  useEffect(() => {
    if (acik && icerik === null && !hata) yukle();
  }, [acik]);

  return (
    <li className="beceri" id={kimlik} data-acik={acik || undefined}>
      <button type="button" className="beceri-dugme" aria-expanded={acik} aria-controls={`${kimlik}-icerik`} onClick={degistir}>
        <span className="beceri-ad">{beceri.ad}</span>
        <span className="beceri-aciklama">{beceri.aciklama}</span>
        <span className="beceri-kunye">
          <span>{t.yazan(beceri.yazan)}</span>
          <span className="sayi">{t.kullanim(beceri.kullanim)}</span>
          {beceri.guncelleme ? (
            <time dateTime={beceri.guncelleme} title={akilliZaman(beceri.guncelleme)}>
              {t.guncellendi(goreli(beceri.guncelleme))}
            </time>
          ) : null}
        </span>
        <Simge ad="asagi" boyut={14} className="beceri-ok" />
      </button>
      {acik ? (
        <div className="beceri-icerik" id={`${kimlik}-icerik`}>
          {hata ? (
            <HataKutu baslik={t.icerikAlinamadi} metin={hata} yeniden={yukle} />
          ) : icerik === null ? (
            <Iskelet satir={4} etiket={t.icerikYukleniyor} />
          ) : (
            <Markdown metin={icerik} />
          )}
        </div>
      ) : null}
    </li>
  );
}
