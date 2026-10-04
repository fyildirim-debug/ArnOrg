// Projeler: liste; yeni proje, GitHub'dan açma ve klasör bağlama (sihirbazla aynı bileşen); proje ayarları
// (çalışma dalı, uzak depo, otomatik gönderim); listeden çıkarma
import type { ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { DisBaglanti } from "../bilesenler/DisBaglanti";
import { HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { GorevDagilimi } from "../bilesenler/GorevDagilimi";
import { OnaySor } from "../bilesenler/OnaySor";
import { ProjeAcici, type AcmaYolu } from "../bilesenler/ProjeAcici";
import { ProjeAyarlari } from "../bilesenler/ProjeAyarlari";
import { Simge } from "../bilesenler/Simge";
import { bildir, git, hataBildir, useArayuz } from "../durum/arayuz";
import { kurulumuYukle, useKurulum } from "../durum/kurulum";
import { projeleriYukle, projeyiSec, useVeri } from "../durum/veri";
import { tarih, token } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

export function Projeler() {
  const s = useSozluk();
  const t = s.projeler;
  const projeler = useVeri((d) => d.projeler);
  const yukleme = useVeri((d) => d.projelerYukleme);
  const yeniIstek = useArayuz((d) => d.yeniProjeIstegi);
  // Aynı düğmeye yeniden basılınca da o sekme öne gelsin: her istek yeni numara alır
  const [acici, setAcici] = useState<{ yol: AcmaYolu; no: number } | null>(null);
  const ac = (yol: AcmaYolu) => setAcici((x) => ({ yol, no: (x?.no ?? 0) + 1 }));

  useEffect(() => {
    projeleriYukle().catch(() => undefined);
    if (useKurulum.getState().yukleme === "bos") void kurulumuYukle();
  }, []);
  useEffect(() => {
    if (yeniIstek) ac("yeni");
  }, [yeniIstek]);

  const bos = yukleme === "hazir" && projeler.length === 0;
  const acildi = () => {
    setAcici(null);
    git("karargah");
  };

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{t.baslik}</h1>
          <p>{t.aciklama}</p>
        </div>
        {!bos ? (
          <div className="baslik-eylem">
            <button type="button" className="dugme" aria-pressed={acici?.yol === "github"} onClick={() => ac("github")}>
              <Simge ad="depo" />
              {t.githubdanAc}
            </button>
            <button type="button" className="dugme" aria-pressed={acici?.yol === "klasor"} onClick={() => ac("klasor")}>
              <Simge ad="klasor" />
              {t.klasorBagla}
            </button>
            <button type="button" className="dugme dugme-ana" onClick={() => ac("yeni")}>
              <Simge ad="arti" />
              {t.yeniProje}
            </button>
          </div>
        ) : null}
      </div>

      {acici || bos ? (
        <ProjeAcmaPaneli
          ilk={bos}
          baslangic={acici?.yol ?? "yeni"}
          istek={acici?.no ?? 0}
          kapat={bos ? undefined : () => setAcici(null)}
          acildi={acildi}
        />
      ) : null}

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

function ProjeAcmaPaneli({
  ilk,
  baslangic,
  istek,
  kapat,
  acildi,
}: {
  ilk: boolean;
  baslangic: AcmaYolu;
  istek: number;
  kapat?: () => void;
  acildi: (p: ProjeOzeti) => void;
}) {
  const s = useSozluk();
  const f = s.projeler.form;
  return (
    <section className="panel yeni-proje" aria-labelledby="proje-ac-baslik">
      <div className="panel-ust">
        <h2 id="proje-ac-baslik">{ilk ? f.ilkBaslik : f.baslik}</h2>
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
      <ProjeAcici baslangic={baslangic} istek={istek} acildi={acildi} />
    </section>
  );
}

function ProjeSatiri({ proje: p }: { proje: ProjeOzeti }) {
  const s = useSozluk();
  const t = s.projeler;
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [cikar, setCikar] = useState(false);
  const [ayarAcik, setAyarAcik] = useState(false);
  const { suruyor, calistir } = useIslem();
  const acik = p.id === aktifProjeId;
  const toplamGorev = Object.values(p.gorevSayilari ?? {}).reduce((a, b) => a + b, 0);
  const ayarId = `proje-ayar-${p.id}`;

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
        {p.github ? (
          <DisBaglanti href={`https://github.com/${p.github}`} className="baglanti proje-uzak">
            <Simge ad="depo" boyut={11} />
            {p.github}
          </DisBaglanti>
        ) : null}
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
          onClick={() => setAyarAcik(!ayarAcik)}
          aria-expanded={ayarAcik}
          aria-controls={ayarAcik ? ayarId : undefined}
          aria-label={t.ayar.acEtiket(p.ad)}
          title={t.ayar.ac}
        >
          <Simge ad="ayarlar" boyut={13} />
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
      {ayarAcik ? (
        <div className="proje-onay">
          <ProjeAyarlari proje={p} id={ayarId} />
        </div>
      ) : null}
    </li>
  );
}
