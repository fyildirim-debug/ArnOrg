// Projeler: liste, yeni proje / var olan repoyu bağlama, listeden çıkarma
import type { ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { GorevDagilimi } from "../bilesenler/GorevDagilimi";
import { OnaySor } from "../bilesenler/OnaySor";
import { Simge } from "../bilesenler/Simge";
import { bildir, git, hataBildir, useArayuz } from "../durum/arayuz";
import { projeleriYukle, projeUygula, projeyiSec, useVeri } from "../durum/veri";
import { para, tarih } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

export function Projeler() {
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
          <h1>Projeler</h1>
          <p>Her proje bir git deposu; kendi ekibi, panosu, bütçesi ve denetim politikası olur</p>
        </div>
        {!formAcik && !bos ? (
          <div className="baslik-eylem">
            <button type="button" className="dugme dugme-ana" onClick={() => setFormAcik(true)}>
              <Simge ad="arti" />
              Yeni proje
            </button>
          </div>
        ) : null}
      </div>

      {formAcik || bos ? <YeniProjeFormu kapat={bos ? undefined : () => setFormAcik(false)} ilk={bos} /> : null}

      {yukleme === "yukleniyor" && projeler.length === 0 ? <Iskelet satir={6} /> : null}
      {yukleme === "hata" ? <HataKutu metin="Proje listesi alınamadı." yeniden={() => projeleriYukle().catch(hataBildir)} /> : null}

      {projeler.length > 0 ? (
        <>
          <h2 className="ara-baslik">
            Açık projeler <small>{projeler.length}</small>
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
      bildir("bilgi", `${p.ad} listeden çıkarıldı. Dosyalara dokunulmadı.`);
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
          {toplamGorev} görev · {p.varsayilanDal} · {tarih(p.olusturma)}
        </small>
      </div>
      <dl className="proje-sayac">
        <div>
          <dt>Ekip</dt>
          <dd>
            <b>{p.aktifAjanSayisi}</b>/{p.ajanSayisi}
          </dd>
        </div>
        <div>
          <dt>Onay</dt>
          <dd className={p.bekleyenOnay ? "vurgu" : undefined}>{p.bekleyenOnay}</dd>
        </div>
        <div>
          <dt>Bugün</dt>
          <dd>{para(p.bugunMaliyetUsd)}</dd>
        </div>
      </dl>
      <div className="proje-eylem">
        <button type="button" className={`dugme dugme-kucuk${acik ? "" : " dugme-ana"}`} onClick={ac}>
          {acik ? "Karargâha git" : "Aç"}
        </button>
        <button
          type="button"
          className="dugme dugme-kucuk dugme-sessiz dugme-simge"
          onClick={() => setCikar(true)}
          aria-label={`${p.ad} projesini listeden çıkar`}
          title="Listeden çıkar"
        >
          <Simge ad="cop" boyut={13} />
        </button>
      </div>
      {cikar ? (
        <div className="proje-onay">
          <OnaySor evet={listedenCikar} vazgec={() => setCikar(false)} evetMetni="Listeden çıkar" suruyor={suruyor === "cikar"}>
            {p.ad} ArnOrg listesinden çıkarılır. Repo, .arnorg/ klasörü ve çalışma alanları diskte kalır; aynı yolu yeniden bağlayabilirsiniz.
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
  const [ad, setAd] = useState("");
  const [yol, setYol] = useState("");
  const [olustur, setOlustur] = useState(true);
  const [aciklama, setAciklama] = useState("");
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();

  const adHata = !ad.trim() ? "Proje adı gerekli." : null;
  const yolHata = !yol.trim() ? "Klasör yolu gerekli." : !yolMutlakMi(yol.trim()) ? "Mutlak yol yazın (ör. /home/siz/projeler/siparis-paneli)." : null;

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    setDenendi(true);
    if (adHata || yolHata) return;
    void calistir("olustur", async () => {
      const p = await api.projeOlustur({ ad: ad.trim(), yol: yol.trim(), olustur, aciklama: aciklama.trim() || undefined });
      projeUygula(p);
      projeyiSec(p.id);
      bildir("basari", `${p.ad} açıldı. CEO işe alındı; Karargâh'tan brief verebilirsiniz.`);
      git("karargah");
    }, true);
  };

  return (
    <section className="panel yeni-proje" aria-labelledby="yeni-proje-baslik">
      <div className="panel-ust">
        <h2 id="yeni-proje-baslik">{ilk ? "İlk projenizi açın" : "Yeni proje"}</h2>
        {kapat ? (
          <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={kapat} aria-label="Formu kapat">
            <Simge ad="kapat" boyut={12} />
          </button>
        ) : null}
      </div>
      {ilk ? (
        <p className="panel-aciklama">
          Proje, ArnOrg'un yönettiği bir git deposudur. Açtığınızda depoya <code>.arnorg/</code> iskeleti (vizyon ve mimari notları, ekip kimlikleri,
          hafıza) eklenir ve bir CEO ajanı işe alınır. Siz brief verirsiniz; CEO planı çıkarır, ekibi önerir, işi dağıtır.
        </p>
      ) : null}
      <form className="form-izgara" onSubmit={gonder} noValidate>
        <div className="alan tam">
          <span className="alan-ad" id="kip-ad">
            Kaynak
          </span>
          <div className="bolumlu" role="group" aria-labelledby="kip-ad">
            <button type="button" aria-pressed={olustur} onClick={() => setOlustur(true)}>
              Yeni repo oluştur
            </button>
            <button type="button" aria-pressed={!olustur} onClick={() => setOlustur(false)}>
              Var olan repoyu bağla
            </button>
          </div>
          <span className="alan-ipucu">
            {olustur
              ? "Klasör yoksa açılır; git init, CLAUDE.md ve ilk commit yapılır."
              : "Klasör bir git deposu olmalı. Dosyalarınıza dokunulmaz; yalnız .arnorg/ eklenir."}
          </span>
        </div>
        <div className="alan">
          <label htmlFor="proje-ad">Proje adı</label>
          <input
            id="proje-ad"
            className="girdi"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Sipariş Paneli"
            aria-invalid={denendi && adHata ? true : undefined}
            autoFocus
          />
          {denendi && adHata ? <span className="alan-hata">{adHata}</span> : null}
        </div>
        <div className="alan">
          <label htmlFor="proje-yol">Klasör (mutlak yol)</label>
          <input
            id="proje-yol"
            className="girdi"
            value={yol}
            onChange={(e) => setYol(e.target.value)}
            placeholder={olustur ? "/home/siz/projeler/siparis-paneli" : "/home/siz/kod/var-olan-repo"}
            spellCheck={false}
            aria-invalid={denendi && yolHata ? true : undefined}
          />
          {denendi && yolHata ? <span className="alan-hata">{yolHata}</span> : null}
        </div>
        <div className="alan tam">
          <label htmlFor="proje-aciklama">Açıklama (isteğe bağlı)</label>
          <textarea
            id="proje-aciklama"
            className="metin-alani"
            rows={2}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Küçük işletmeler için sipariş ve kargo takibi"
          />
        </div>
        {hata ? (
          <div className="tam">
            <HataKutu baslik="Proje açılamadı" metin={hata} />
          </div>
        ) : null}
        <div className="tam dugme-satir">
          <button type="submit" className="dugme dugme-ana" disabled={suruyor !== null}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            {olustur ? "Projeyi oluştur" : "Repoyu bağla"}
          </button>
          {kapat ? (
            <button type="button" className="dugme dugme-sessiz" onClick={kapat}>
              Vazgeç
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
