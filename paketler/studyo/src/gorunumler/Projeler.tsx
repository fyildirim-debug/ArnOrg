// Projeler: liste, yeni proje / var olan repoyu bağlama, listeden çıkarma
import type { ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { GorevDagilimi } from "../bilesenler/GorevDagilimi";
import { OnaySor } from "../bilesenler/OnaySor";
import { Simge } from "../bilesenler/Simge";
import { bildir, git, hataBildir, useArayuz } from "../durum/arayuz";
import { projeleriYukle, projeUygula, projeyiSec, useVeri } from "../durum/veri";
import { tarih, token } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

export function Projeler() {
  const s = useSozluk();
  const t = s.projeler;
  const projeler = useVeri((d) => d.projeler);
  const yukleme = useVeri((d) => d.projelerYukleme);
  const yeniIstek = useArayuz((d) => d.yeniProjeIstegi);
  const [formAcik, setFormAcik] = useState(false);

  useEffect(() => {
    projeleriYukle().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (yeniIstek) setFormAcik(true);
  }, [yeniIstek]);

  const bos = yukleme === "hazir" && projeler.length === 0;

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{t.baslik}</h1>
          <p>{t.aciklama}</p>
        </div>
        {!formAcik && !bos ? (
          <div className="baslik-eylem">
            <button type="button" className="dugme dugme-ana" onClick={() => setFormAcik(true)}>
              <Simge ad="arti" />
              {t.yeniProje}
            </button>
          </div>
        ) : null}
      </div>

      {formAcik || bos ? <YeniProjeFormu kapat={bos ? undefined : () => setFormAcik(false)} ilk={bos} /> : null}

      {yukleme === "yukleniyor" && projeler.length === 0 ? <Iskelet satir={6} /> : null}
      {yukleme === "hata" ? <HataKutu metin={t.listeAlinamadi} yeniden={() => projeleriYukle().catch(hataBildir)} /> : null}

      {projeler.length > 0 ? (
        <>
          <h2 className="ara-baslik">
            {t.acikProjeler} <small>{projeler.length}</small>
          </h2>
          <ul className="proje-liste">
            {projeler.map((p) => (
              <ProjeSatiri key={p.id} proje={p} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function ProjeSatiri({ proje: p }: { proje: ProjeOzeti }) {
  const s = useSozluk();
  const t = s.projeler;
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [cikar, setCikar] = useState(false);
  const { suruyor, calistir } = useIslem();
  const acik = p.id === aktifProjeId;
  const toplamGorev = Object.values(p.gorevSayilari ?? {}).reduce((a, b) => a + b, 0);

  const ac = () => {
    if (!acik) projeyiSec(p.id);
    git("karargah");
  };

  const listedenCikar = () =>
    calistir("cikar", async () => {
      await api.projeCikar(p.id);
      if (acik) projeyiSec(null);
      useVeri.setState((d) => ({ projeler: d.projeler.filter((x) => x.id !== p.id) }));
      bildir("bilgi", sozluk().projeler.cikarildi(p.ad));
    });

  return (
    <li className={`proje-satir${acik ? " proje-acik" : ""}`}>
      <div className="proje-kimlik">
        <button type="button" className="proje-ad" onClick={ac}>
          {p.ad}
        </button>
        <code className="proje-yol">{p.yol}</code>
        {p.aciklama ? <p>{p.aciklama}</p> : null}
      </div>
      <div className="proje-gorev">
        <GorevDagilimi sayilar={p.gorevSayilari ?? {}} lejant={false} ince />
        <small>
          {s.genel.gorevSayisi(toplamGorev)} · {p.varsayilanDal} · {tarih(p.olusturma)}
        </small>
      </div>
      <dl className="proje-sayac">
        <div>
          <dt>{t.ekip}</dt>
          <dd>
            <b>{p.aktifAjanSayisi}</b>/{p.ajanSayisi}
          </dd>
        </div>
        <div>
          <dt>{t.onay}</dt>
          <dd className={p.bekleyenOnay ? "vurgu" : undefined}>{p.bekleyenOnay}</dd>
        </div>
        <div>
          <dt>{t.bugun}</dt>
          <dd title={t.bugunBaslik}>{token(p.bugunToken)}</dd>
        </div>
      </dl>
      <div className="proje-eylem">
        <button type="button" className={`dugme dugme-kucuk${acik ? "" : " dugme-ana"}`} onClick={ac}>
          {acik ? t.karargahaGit : s.genel.ac}
        </button>
        <button
          type="button"
          className="dugme dugme-kucuk dugme-sessiz dugme-simge"
          onClick={() => setCikar(true)}
          aria-label={t.cikarEtiket(p.ad)}
          title={t.listedenCikar}
        >
          <Simge ad="cop" boyut={13} />
        </button>
      </div>
      {cikar ? (
        <div className="proje-onay">
          <OnaySor evet={listedenCikar} vazgec={() => setCikar(false)} evetMetni={t.listedenCikar} suruyor={suruyor === "cikar"}>
            {t.cikarOnay(p.ad)}
          </OnaySor>
        </div>
      ) : null}
    </li>
  );
}

function yolMutlakMi(yol: string): boolean {
  return yol.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(yol) || yol.startsWith("\\\\") || yol.startsWith("~");
}

function YeniProjeFormu({ kapat, ilk }: { kapat?: () => void; ilk?: boolean }) {
  const s = useSozluk();
  const f = s.projeler.form;
  const [ad, setAd] = useState("");
  const [yol, setYol] = useState("");
  const [olustur, setOlustur] = useState(true);
  const [aciklama, setAciklama] = useState("");
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();

  const adHata = !ad.trim() ? f.adGerekli : null;
  const yolHata = !yol.trim() ? f.yolGerekli : !yolMutlakMi(yol.trim()) ? f.yolMutlak : null;

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    setDenendi(true);
    if (adHata || yolHata) return;
    void calistir("olustur", async () => {
      const p = await api.projeOlustur({ ad: ad.trim(), yol: yol.trim(), olustur, aciklama: aciklama.trim() || undefined });
      projeUygula(p);
      projeyiSec(p.id);
      bildir("basari", sozluk().projeler.form.acildi(p.ad));
      git("karargah");
    }, true);
  };

  return (
    <section className="panel yeni-proje" aria-labelledby="yeni-proje-baslik">
      <div className="panel-ust">
        <h2 id="yeni-proje-baslik">{ilk ? f.ilkBaslik : s.projeler.yeniProje}</h2>
        {kapat ? (
          <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={kapat} aria-label={f.kapat}>
            <Simge ad="kapat" boyut={12} />
          </button>
        ) : null}
      </div>
      {ilk ? (
        <p className="panel-aciklama">
          {f.ilkAciklamaOnce}
          <code>.arnorg/</code>
          {f.ilkAciklamaSonra}
        </p>
      ) : null}
      <form className="form-izgara" onSubmit={gonder} noValidate>
        <div className="alan tam">
          <span className="alan-ad" id="kip-ad">
            {f.kaynak}
          </span>
          <div className="bolumlu" role="group" aria-labelledby="kip-ad">
            <button type="button" aria-pressed={olustur} onClick={() => setOlustur(true)}>
              {f.yeniRepo}
            </button>
            <button type="button" aria-pressed={!olustur} onClick={() => setOlustur(false)}>
              {f.varOlanRepo}
            </button>
          </div>
          <span className="alan-ipucu">
            {olustur ? f.yeniRepoIpucu : f.varOlanIpucu}
          </span>
        </div>
        <div className="alan">
          <label htmlFor="proje-ad">{f.ad}</label>
          <input
            id="proje-ad"
            className="girdi"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder={f.adOrnek}
            aria-invalid={denendi && adHata ? true : undefined}
            autoFocus
          />
          {denendi && adHata ? <span className="alan-hata">{adHata}</span> : null}
        </div>
        <div className="alan">
          <label htmlFor="proje-yol">{f.yol}</label>
          <input
            id="proje-yol"
            className="girdi"
            value={yol}
            onChange={(e) => setYol(e.target.value)}
            placeholder={olustur ? f.yolOrnekYeni : f.yolOrnekVar}
            spellCheck={false}
            aria-invalid={denendi && yolHata ? true : undefined}
          />
          {denendi && yolHata ? <span className="alan-hata">{yolHata}</span> : null}
        </div>
        <div className="alan tam">
          <label htmlFor="proje-aciklama">{f.aciklama}</label>
          <textarea
            id="proje-aciklama"
            className="metin-alani"
            rows={2}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder={f.aciklamaOrnek}
          />
        </div>
        {hata ? (
          <div className="tam">
            <HataKutu baslik={f.acilamadi} metin={hata} />
          </div>
        ) : null}
        <div className="tam dugme-satir">
          <button type="submit" className="dugme dugme-ana" disabled={suruyor !== null}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            {olustur ? f.olustur : f.bagla}
          </button>
          {kapat ? (
            <button type="button" className="dugme dugme-sessiz" onClick={kapat}>
              {s.genel.vazgec}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
