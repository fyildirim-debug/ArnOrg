// Proje ayarları: çalışma dalı (yerel ve uzak dallar), uzak depo (GitHub bağlantısı, eşitleme, GitHub'da depo açma)
// ve onaylı birleştirmeden sonra uzak depoya gönderim. Projeler ekranında satırın altında açılır.
import type { EsitlemeSonucu, ProjeDallari, ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useId, useState } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir, git, type BildirimSeviyesi } from "../durum/arayuz";
import { githubBagli, githubHesabiYukle, kurulumuYukle, useKurulum } from "../durum/kurulum";
import { projeUygula } from "../durum/veri";
import { akilliZaman } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";
import { DalSecici, type DalSecenegi } from "./DalSecici";
import { DisBaglanti } from "./DisBaglanti";
import { dalAdiGecerliMi } from "./kurulumYardimcilari";
import { GorunurlukSecimi, SahipSecimi } from "./ProjeAcici";
import { Simge } from "./Simge";

function esitlemeSeviyesi(d: EsitlemeSonucu["durum"]): BildirimSeviyesi {
  if (d === "cekildi" || d === "gonderildi") return "basari";
  if (d === "hata") return "hata";
  if (d === "ayrisik" || d === "kirli" || d === "dal_farkli") return "uyari";
  return "bilgi";
}

export function ProjeAyarlari({ proje, id }: { proje: ProjeOzeti; id?: string }) {
  const s = useSozluk();
  const t = s.projeler.ayar;
  const kendiId = useId();
  const k = id ?? kendiId;
  const durum = useKurulum((d) => d.durum);
  const bagli = githubBagli(durum);
  const [dallar, setDallar] = useState<ProjeDallari | null>(null);
  const [dalHata, setDalHata] = useState<string | null>(null);
  const [dalYenile, setDalYenile] = useState(0);
  const [dal, setDal] = useState(proje.varsayilanDal);
  const [esitleme, setEsitleme] = useState<(EsitlemeSonucu & { zaman: string }) | null>(null);
  const [ozel, setOzel] = useState(true);
  const [sahip, setSahip] = useState("");
  const { suruyor, hata, calistir } = useIslem();

  useEffect(() => {
    if (useKurulum.getState().yukleme === "bos") void kurulumuYukle();
  }, []);
  useEffect(() => {
    if (bagli) void githubHesabiYukle();
  }, [bagli]);
  useEffect(() => {
    let iptal = false;
    setDallar(null);
    setDalHata(null);
    api
      .projeDallari(proje.id)
      .then((d) => {
        if (!iptal) setDallar(d);
      })
      .catch((e: unknown) => {
        if (!iptal) setDalHata(hataMetni(e));
      });
    return () => {
      iptal = true;
    };
  }, [proje.id, dalYenile]);
  useEffect(() => setDal(proje.varsayilanDal), [proje.varsayilanDal]);

  const secenekler: DalSecenegi[] = dallar
    ? [
        ...dallar.yerel.map((ad) => ({ ad, grup: "yerel" as const })),
        ...dallar.uzak.filter((ad) => !dallar.yerel.includes(ad)).map((ad) => ({ ad, grup: "uzak" as const })),
      ]
    : [];
  if (dallar && !secenekler.some((o) => o.ad === proje.varsayilanDal)) secenekler.unshift({ ad: proje.varsayilanDal, grup: "yerel" });
  const dalHatasi = !dalAdiGecerliMi(dal) ? s.kurulum.ac.dalGecersiz : null;
  const dalDegisti = dal.trim() !== proje.varsayilanDal;

  const dalDegistir = () => {
    if (dalHatasi || !dalDegisti) return;
    void calistir("dal", async () => {
      const p = await api.projeGuncelle(proje.id, { varsayilanDal: dal.trim() });
      projeUygula(p);
      bildir("basari", sozluk().projeler.ayar.dalDegisti(p.varsayilanDal));
      setDalYenile((n) => n + 1);
    });
  };

  const gonderimDegistir = (acik: boolean) =>
    void calistir("gonderim", async () => {
      const p = await api.projeGuncelle(proje.id, { otomatikGonder: acik });
      projeUygula(p);
      const m = sozluk().projeler.ayar;
      bildir("bilgi", acik ? m.otomatikAcik : m.otomatikKapali);
    });

  const esitle = (gonder: boolean) =>
    void calistir(gonder ? "gonder" : "esitle", async () => {
      const r = await api.esitle(proje.id, gonder);
      setEsitleme({ ...r, zaman: new Date().toISOString() });
      // Çekirdek önemli sonuçları kendisi de bildirir; aynı metin bir kez görünür
      bildir(esitlemeSeviyesi(r.durum), r.mesaj);
    });

  const githubAc = () =>
    void calistir("github", async () => {
      const p = await api.githubDeposuAc(proje.id, { ozel, sahip: sahip || undefined });
      projeUygula(p);
      bildir("basari", sozluk().projeler.ayar.githubAcildi(p.github ?? p.uzakAdres ?? ""));
    });

  const uzakAdi = proje.github ?? proje.uzakAdres;
  const uzakAdresi = proje.github ? `https://github.com/${proje.github}` : proje.uzakAdres && /^https?:\/\//.test(proje.uzakAdres) ? proje.uzakAdres.replace(/\.git$/, "") : null;

  return (
    <div className="proje-ayar" id={k}>
      <section className="proje-ayar-satir" aria-labelledby={`${k}-dal`}>
        <h3 id={`${k}-dal`}>{t.dal}</h3>
        <div className="proje-ayar-icerik">
          <div className="proje-ayar-dal">
            <DalSecici
              id={`${k}-dal-sec`}
              etiket={t.dal}
              etiketGizli
              secenekler={secenekler}
              deger={dal}
              degisti={setDal}
              yukleniyor={dallar === null && !dalHata}
              hata={dalHata}
              yeniden={() => setDalYenile((n) => n + 1)}
              dogrulama={dalDegisti ? dalHatasi : null}
              kilitli={suruyor === "dal"}
            />
            {dallar ? (
              <button type="button" className="dugme" onClick={dalDegistir} disabled={!dalDegisti || !!dalHatasi || suruyor !== null}>
                {suruyor === "dal" ? <span className="doner" aria-hidden="true" /> : <Simge ad="dal" />}
                {t.dalDegistir}
              </button>
            ) : null}
          </div>
          <p className="alan-ipucu">{t.dalIpucu}</p>
          {dallar && dallar.mevcut !== dallar.calisma ? <p className="uyari-kutu">{t.dalFarkli(dallar.mevcut, dallar.calisma)}</p> : null}
        </div>
      </section>

      <section className="proje-ayar-satir" aria-labelledby={`${k}-uzak`}>
        <h3 id={`${k}-uzak`}>{t.uzak}</h3>
        <div className="proje-ayar-icerik">
          {uzakAdi ? (
            <>
              <div className="proje-ayar-uzak">
                {uzakAdresi ? (
                  <DisBaglanti href={uzakAdresi} className="baglanti proje-ayar-depo">
                    <Simge ad="depo" boyut={13} />
                    {uzakAdi}
                    <Simge ad="dis" boyut={11} />
                  </DisBaglanti>
                ) : (
                  <code className="proje-ayar-depo">{uzakAdi}</code>
                )}
                <button type="button" className="dugme" onClick={() => esitle(false)} disabled={suruyor !== null}>
                  {suruyor === "esitle" ? <span className="doner" aria-hidden="true" /> : <Simge ad="yenile" />}
                  {t.esitle}
                </button>
              </div>
              {esitleme ? (
                <p className="proje-ayar-sonuc" role="status">
                  <span>{t.sonEsitleme(akilliZaman(esitleme.zaman))}</span> · {esitleme.mesaj}
                </p>
              ) : null}
              {esitleme && esitleme.onde > 0 && esitleme.durum === "guncel" ? (
                <div className="proje-ayar-uzak">
                  <span className="alan-ipucu">{t.bekleyen(esitleme.onde)}</span>
                  <button type="button" className="dugme dugme-kucuk" onClick={() => esitle(true)} disabled={suruyor !== null}>
                    {suruyor === "gonder" ? <span className="doner" aria-hidden="true" /> : <Simge ad="gonder" />}
                    {t.gonder}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="proje-ayar-yok">{t.uzakYok}</p>
              {bagli ? (
                <div className="proje-ayar-github">
                  <GorunurlukSecimi ozel={ozel} degisti={setOzel} kilitli={suruyor === "github"} />
                  <SahipSecimi id={`${k}-sahip`} deger={sahip} degisti={setSahip} kilitli={suruyor === "github"} />
                  <div className="proje-ayar-github-dugme">
                    <button type="button" className="dugme dugme-ana" onClick={githubAc} disabled={suruyor !== null}>
                      {suruyor === "github" ? <span className="doner" aria-hidden="true" /> : <Simge ad="depo" />}
                      {t.githubAc}
                    </button>
                  </div>
                  <span className="alan-ipucu proje-ayar-tam">{t.githubAcIpucu}</span>
                </div>
              ) : (
                <div className="proje-ayar-uzak">
                  <span className="alan-ipucu">{t.githubBagliDegil}</span>
                  <button type="button" className="dugme dugme-kucuk" onClick={() => git("ayarlar")}>
                    <Simge ad="ayarlar" />
                    {t.githubBagla}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="proje-ayar-satir" aria-labelledby={`${k}-gonderim`}>
        <h3 id={`${k}-gonderim`}>{t.gonderim}</h3>
        <div className="proje-ayar-icerik">
          <label className="secenek proje-ayar-anahtar">
            <button
              type="button"
              role="switch"
              className="anahtar-dugme"
              aria-checked={proje.otomatikGonder}
              onClick={() => gonderimDegistir(!proje.otomatikGonder)}
              disabled={suruyor === "gonderim"}
            />
            {t.otomatikGonder}
          </label>
          <p className="alan-ipucu">{uzakAdi ? t.otomatikGonderIpucu : t.otomatikGonderUzakYok}</p>
        </div>
      </section>
      {hata && suruyor === null ? (
        <p className="alan-hata proje-ayar-hata" role="alert">
          {hata}
        </p>
      ) : null}
    </div>
  );
}
