// GitHub depo seçici: arama kutulu liste (özel/açık işareti, boş depo, son güncelleme); radyo grubu olduğu için
// oklarla gezilir. Yalnız GitHub'a giriş yapılmışken çizilir (girişsiz uç 401 döner).
import type { GithubDeposu } from "@arnorg/ortak";
import { useEffect, useId, useState } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { useSozluk } from "../dil";
import { goreli } from "../yardimcilar/bicim";
import { Bos, HataKutu, Iskelet } from "./Durumlar";
import { Simge } from "./Simge";

export function GithubDepoSecici({
  secili,
  sec,
  kilitli,
}: {
  secili: GithubDeposu | null;
  sec: (depo: GithubDeposu) => void;
  kilitli?: boolean;
}) {
  const s = useSozluk();
  const t = s.kurulum.depo;
  const id = useId();
  const [q, setQ] = useState("");
  const [arama, setArama] = useState("");
  const [depolar, setDepolar] = useState<GithubDeposu[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [yenile, setYenile] = useState(0);

  useEffect(() => {
    const z = setTimeout(() => setArama(q.trim()), 250);
    return () => clearTimeout(z);
  }, [q]);

  useEffect(() => {
    const ac = new AbortController();
    setYukleniyor(true);
    setHata(null);
    api
      .githubDepolari(arama || undefined, ac.signal)
      .then((l) => {
        setDepolar(l);
        setYukleniyor(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setHata(hataMetni(e));
        setYukleniyor(false);
      });
    return () => ac.abort();
  }, [arama, yenile]);

  return (
    <div className="depo-secici">
      <div className="arama-kutu depo-arama">
        <Simge ad="ara" boyut={14} />
        <label className="gizli" htmlFor={`${id}-ara`}>
          {t.ara}
        </label>
        <input
          id={`${id}-ara`}
          className="girdi"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.araOrnek}
          autoComplete="off"
          spellCheck={false}
          disabled={kilitli}
        />
        {yukleniyor && depolar ? <span className="doner depo-arama-doner" aria-hidden="true" /> : null}
      </div>
      <fieldset className="depo-liste-kap" disabled={kilitli} aria-busy={yukleniyor}>
        <legend className="gizli">{t.liste}</legend>
        {hata ? (
          <HataKutu baslik={t.alinamadi} metin={hata} yeniden={() => setYenile((n) => n + 1)} />
        ) : depolar === null ? (
          <Iskelet satir={5} etiket={t.yukleniyor} />
        ) : depolar.length === 0 ? (
          <Bos kucuk baslik={arama ? t.eslesmeYok(arama) : t.bos} />
        ) : (
          <ul className="depo-liste">
            {depolar.map((d) => {
              const secildi = secili?.tamAd === d.tamAd;
              return (
                <li key={d.tamAd}>
                  <label className="depo" data-secili={secildi || undefined}>
                    <input type="radio" name={`${id}-depo`} value={d.tamAd} checked={secildi} onChange={() => sec(d)} />
                    <span className="depo-kimlik">
                      <span className="depo-ad tek-satir">
                        <span className="depo-sahip">{d.sahip}/</span>
                        <b>{d.ad}</b>
                      </span>
                      {d.aciklama ? <small className="tek-satir">{d.aciklama}</small> : null}
                    </span>
                    <span className="depo-bilgi">
                      <span className="etiket">
                        <Simge ad={d.ozel ? "kilit" : "kure"} boyut={10} />
                        {d.ozel ? t.ozel : t.acik}
                      </span>
                      {!d.varsayilanDal ? <span className="etiket">{t.bosDepo}</span> : null}
                      <small>{t.guncellendi(goreli(d.guncelleme))}</small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
