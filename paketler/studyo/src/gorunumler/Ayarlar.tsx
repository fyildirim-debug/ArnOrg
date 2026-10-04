// Ayarlar: dil, Claude girişi ve abonelik sınırları, çekirdek ayarları, sağlık bilgisi, bu tarayıcının tercihleri,
// bağlantı ve hakkında satırı
import {
  ARNORG_SURUMU,
  DIL_ADLARI,
  DILLER,
  type Ayarlar as AyarlarTipi,
  type Dil,
  type IzinModu,
  type KodZekasiModelBilgisi,
  type KodZekasiModeli,
  type Saglik,
} from "@arnorg/ortak";
import { useEffect, useState, type FormEvent } from "react";
import { anahtarAyarla } from "../api/anahtar";
import { api } from "../api/uclar";
import { diliAyarla, sozluk, useDil, useSozluk } from "../dil";
import { HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { IZIN_MODLARI, izinModuAdi } from "../bilesenler/Kisi";
import { pencereAdi } from "../bilesenler/Kullanim";
import { bildir } from "../durum/arayuz";
import { hesabiYukle, useVeri } from "../durum/veri";
import { akilliZaman, yuzde } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";
import { sirketAdiAyarla, useTercihler } from "../yardimcilar/tercihler";

const DIS_EDITORLER = [
  ["codium", "VSCodium"],
  ["code", "VS Code"],
  ["cursor", "Cursor"],
] as const;

const KOD_ZEKASI_MODELLERI: KodZekasiModeli[] = ["kaliteli", "hizli", "kapali"];

export function Ayarlar() {
  const s = useSozluk();
  const t = s.ayarlar;
  const [ayarlar, setAyarlar] = useState<AyarlarTipi | null>(null);
  const [taslak, setTaslak] = useState<AyarlarTipi | null>(null);
  const [saglik, setSaglik] = useState<Saglik | null>(null);
  const [modeller, setModeller] = useState<KodZekasiModelBilgisi[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();

  const yukle = () => {
    setHata(null);
    Promise.all([api.ayarlar(), api.saglik()])
      .then(([a, sg]) => {
        setAyarlar(a);
        setTaslak(a);
        setSaglik(sg);
        useVeri.setState({ saglik: sg });
      })
      .catch((e: unknown) => setHata(e instanceof Error ? e.message : sozluk().ayarlar.alinamadi));
  };
  useEffect(yukle, []);
  useEffect(() => {
    api
      .kodModelleri()
      .then(setModeller)
      .catch(() => undefined);
  }, []);

  const kirli = !!ayarlar && !!taslak && JSON.stringify(ayarlar) !== JSON.stringify(taslak);
  const sureGecersiz = !!taslak && (!Number.isFinite(taslak.onaySuresiSn) || taslak.onaySuresiSn < 10);
  const yuzdeGecersiz = (v: number) => !Number.isFinite(v) || v < 0 || v > 100;
  const sinirGecersiz = !!taslak && (yuzdeGecersiz(taslak.besSaatlikSinirYuzde) || yuzdeGecersiz(taslak.haftalikSinirYuzde));
  const hesap = useVeri((d) => d.hesap);
  const tikanmaGecersiz = !!taslak && (!Number.isFinite(taslak.tikanmaDakika) || taslak.tikanmaDakika < 0 || taslak.tikanmaDakika > 1440);

  const kaydet = (e: FormEvent) => {
    e.preventDefault();
    if (!taslak || sureGecersiz || tikanmaGecersiz || sinirGecersiz) return;
    void calistir("kaydet", async () => {
      const a = await api.ayarlariKaydet({ ...taslak, claudeYolu: taslak.claudeYolu?.trim() ? taslak.claudeYolu.trim() : null });
      setAyarlar(a);
      setTaslak(a);
      bildir("basari", sozluk().ayarlar.kaydedildi);
    });
  };
  // Dil kaydedilince ekrandaki ve durumdaki kopyalar da yeni dili taşısın (sonraki Kaydet eski dili geri yazmasın)
  const dilKaydedildi = (dil: Dil) => {
    setAyarlar((x) => (x ? { ...x, dil } : x));
    setTaslak((x) => (x ? { ...x, dil } : x));
    setSaglik((x) => (x ? { ...x, dil } : x));
    useVeri.setState((d) => (d.saglik ? { saglik: { ...d.saglik, dil } } : {}));
  };
  const degistir = (d: Partial<AyarlarTipi>) => setTaslak((x) => (x ? { ...x, ...d } : x));
  const disEditorOzel = taslak && !DIS_EDITORLER.some(([k]) => k === taslak.disEditor);

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{t.baslik}</h1>
          <p>{t.aciklama}</p>
        </div>
      </div>
      <DilSecimi kaydedildi={dilKaydedildi} />
      {hata ? <HataKutu metin={hata} yeniden={yukle} /> : null}
      {!taslak && !hata ? <Iskelet satir={8} /> : null}

      <div className="ayarlar-yerlesim">
        {taslak ? (
          <form className="ayar-bolum" onSubmit={kaydet} noValidate>
            <h2 className="ara-baslik">{t.giris.baslik}</h2>
            <div className="hesap-durum" role="status">
              {hesap?.durum === "hazir" ? (
                <p>
                  <b>{hesap.plan ? `Claude ${hesap.plan}` : "Claude Code"}</b>
                  {hesap.eposta ? ` · ${hesap.eposta}` : ""}
                  {hesap.kaynak ? <small> · {t.giris.kaynak}: {hesap.kaynak}</small> : null}
                </p>
              ) : (
                <p className="soluk">
                  {hesap?.durum === "hata" ? t.giris.ulasilamadi(hesap.hata ?? "") : t.giris.okunmadi}
                </p>
              )}
              {hesap?.pencereler.length ? (
                <p className="hesap-pencereler">
                  {hesap.pencereler
                    .filter((p) => p.tur === "bes_saat" || p.tur === "haftalik")
                    .map((p) => `${pencereAdi(s, p)} ${yuzde(p.yuzde)}${p.sifirlanma ? ` (${t.giris.sifirlanma(akilliZaman(p.sifirlanma))})` : ""}`)
                    .join(" · ")}
                </p>
              ) : null}
              {hesap?.uyari ? <p className="alan-hata">{hesap.uyari}</p> : null}
              <button type="button" className="metin-dugme" onClick={() => void hesabiYukle(true)}>
                {t.giris.yenidenOku}
              </button>
            </div>
            <div className="form-izgara">
              <p className="alan-ipucu tam">{t.giris.abonelik}</p>
              <div className="alan">
                <label htmlFor="ay-bes">{t.giris.besSaat}</label>
                <input
                  id="ay-bes"
                  className="girdi"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={Number.isFinite(taslak.besSaatlikSinirYuzde) ? taslak.besSaatlikSinirYuzde : ""}
                  onChange={(e) => degistir({ besSaatlikSinirYuzde: e.target.valueAsNumber })}
                  aria-invalid={yuzdeGecersiz(taslak.besSaatlikSinirYuzde) ? true : undefined}
                />
                <span className="alan-ipucu">{t.giris.besSaatIpucu}</span>
              </div>
              <div className="alan">
                <label htmlFor="ay-hafta">{t.giris.hafta}</label>
                <input
                  id="ay-hafta"
                  className="girdi"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={Number.isFinite(taslak.haftalikSinirYuzde) ? taslak.haftalikSinirYuzde : ""}
                  onChange={(e) => degistir({ haftalikSinirYuzde: e.target.valueAsNumber })}
                  aria-invalid={yuzdeGecersiz(taslak.haftalikSinirYuzde) ? true : undefined}
                />
                <span className="alan-ipucu">{t.giris.haftaIpucu}</span>
              </div>
            </div>

            <h2 className="ara-baslik">{t.cekirdek.baslik}</h2>
            <div className="form-izgara">
              <div className="alan tam">
                <label htmlFor="ay-claude">{t.cekirdek.claudeYolu}</label>
                <input
                  id="ay-claude"
                  className="girdi"
                  value={taslak.claudeYolu ?? ""}
                  onChange={(e) => degistir({ claudeYolu: e.target.value })}
                  placeholder={t.cekirdek.claudeYoluOrnek}
                  spellCheck={false}
                />
              </div>
              <div className="alan">
                <label htmlFor="ay-mod">{t.cekirdek.izinModu}</label>
                <select
                  id="ay-mod"
                  className="secim"
                  value={taslak.varsayilanIzinModu}
                  onChange={(e) => degistir({ varsayilanIzinModu: e.target.value as IzinModu })}
                >
                  {IZIN_MODLARI.map((k) => [k, izinModuAdi(k)] as const).map(([k, ad]) => (
                    <option key={k} value={k}>
                      {ad}
                    </option>
                  ))}
                </select>
                <span className="alan-ipucu">{t.cekirdek.izinModuIpucu}</span>
              </div>
              <div className="alan">
                <label htmlFor="ay-sure">{t.cekirdek.sure}</label>
                <input
                  id="ay-sure"
                  className="girdi"
                  type="number"
                  min={10}
                  step={10}
                  value={Number.isFinite(taslak.onaySuresiSn) ? taslak.onaySuresiSn : ""}
                  onChange={(e) => degistir({ onaySuresiSn: e.target.valueAsNumber })}
                  aria-invalid={sureGecersiz ? true : undefined}
                />
                <span className={sureGecersiz ? "alan-hata" : "alan-ipucu"}>
                  {sureGecersiz ? t.cekirdek.sureHata : t.cekirdek.sureIpucu}
                </span>
              </div>
              <div className="alan">
                <label htmlFor="ay-tikanma">{t.cekirdek.tikanma}</label>
                <input
                  id="ay-tikanma"
                  className="girdi"
                  type="number"
                  min={0}
                  max={1440}
                  step={5}
                  value={Number.isFinite(taslak.tikanmaDakika) ? taslak.tikanmaDakika : ""}
                  onChange={(e) => degistir({ tikanmaDakika: e.target.valueAsNumber })}
                  aria-invalid={tikanmaGecersiz ? true : undefined}
                />
                <span className={tikanmaGecersiz ? "alan-hata" : "alan-ipucu"}>
                  {tikanmaGecersiz ? t.cekirdek.tikanmaHata : t.cekirdek.tikanmaIpucu}
                </span>
              </div>
              <div className="alan">
                <label htmlFor="ay-editor">{t.cekirdek.editor}</label>
                <select
                  id="ay-editor"
                  className="secim"
                  value={disEditorOzel ? "ozel" : taslak.disEditor}
                  onChange={(e) => degistir({ disEditor: e.target.value === "ozel" ? "" : e.target.value })}
                >
                  {DIS_EDITORLER.map(([k, ad]) => (
                    <option key={k} value={k}>
                      {ad}
                    </option>
                  ))}
                  <option value="ozel">{t.cekirdek.editorBaska}</option>
                </select>
              </div>
              {disEditorOzel ? (
                <div className="alan">
                  <label htmlFor="ay-editor-ozel">{t.cekirdek.editorKomutu}</label>
                  <input
                    id="ay-editor-ozel"
                    className="girdi"
                    value={taslak.disEditor}
                    onChange={(e) => degistir({ disEditor: e.target.value })}
                    placeholder="zed"
                    spellCheck={false}
                  />
                </div>
              ) : null}
            </div>
            <h2 className="ara-baslik">{t.kodZekasi.baslik}</h2>
            <div className="form-izgara">
              <div className="alan tam">
                <span className="alan-ad" id="kz-model-ad">
                  {t.kodZekasi.model}
                </span>
                <div className="bolumlu" role="group" aria-labelledby="kz-model-ad">
                  {KOD_ZEKASI_MODELLERI.map((k) => (
                    <button key={k} type="button" aria-pressed={taslak.kodZekasiModeli === k} onClick={() => degistir({ kodZekasiModeli: k })}>
                      {t.kodZekasi.modeller[k]}
                    </button>
                  ))}
                </div>
                <span className="alan-ipucu">
                  {taslak.kodZekasiModeli === "kapali"
                    ? t.kodZekasi.kapaliIpucu
                    : (() => {
                        const kz = t.kodZekasi;
                        const m = modeller.find((x) => x.secim === taslak.kodZekasiModeli);
                        if (!m) return kz.modelIpucu;
                        // Model adı ve açıklaması çekirdekten gelir
                        return `${m.ad}: ${m.aciklama} ${m.indirildi ? kz.indirildi(m.diskMb) : kz.indirilecek(m.indirmeMb)} ${kz.yerel}`;
                      })()}
                </span>
              </div>
              <div className="alan tam">
                <label className="secenek">
                  <input type="checkbox" checked={taslak.kodZekasiOtomatik} onChange={(e) => degistir({ kodZekasiOtomatik: e.target.checked })} />
                  {t.kodZekasi.otomatik}
                </label>
                <span className="alan-ipucu">{t.kodZekasi.otomatikIpucu}</span>
              </div>
            </div>
            <div className="dugme-satir ayar-kaydet">
              <button
                type="submit"
                className="dugme dugme-ana"
                disabled={!kirli || suruyor !== null || sureGecersiz || tikanmaGecersiz || sinirGecersiz}
              >
                {suruyor ? <span className="doner" aria-hidden="true" /> : null}
                {s.genel.kaydet}
              </button>
              {kirli ? (
                <button type="button" className="dugme dugme-sessiz" onClick={() => setTaslak(ayarlar)}>
                  {s.genel.vazgec}
                </button>
              ) : (
                <span className="alan-ipucu">{t.degisiklikYok}</span>
              )}
            </div>
          </form>
        ) : null}

        <div className="ayar-yan">
          {saglik ? <SaglikBilgisi saglik={saglik} /> : null}
          <YerelTercihler />
        </div>
      </div>

      <Hakkinda surum={saglik?.surum ?? ARNORG_SURUMU} />
    </>
  );
}

/** Arayüz ve ajan dili: seçim hemen çekirdeğe yazılır, sonra arayüz yeni dille yeniden çizilir */
function DilSecimi({ kaydedildi }: { kaydedildi: (dil: Dil) => void }) {
  const s = useSozluk();
  const dil = useDil();
  const { calistir } = useIslem();

  const sec = (yeni: Dil) => {
    if (yeni === dil) return;
    void calistir("dil", async () => {
      await api.ayarlariKaydet({ dil: yeni });
      diliAyarla(yeni);
      kaydedildi(yeni);
    });
  };

  return (
    <section className="ayar-bolum ayar-dil" aria-labelledby="dil-baslik">
      <h2 className="ara-baslik" id="dil-baslik">
        {s.genel.dil}
      </h2>
      <div className="ayar-dil-satir">
        <div className="bolumlu" role="group" aria-labelledby="dil-baslik">
          {/* Seçenekler kendi dillerinde yazılır */}
          {DILLER.map((d) => (
            <button key={d} type="button" lang={d} aria-pressed={dil === d} onClick={() => sec(d)}>
              {DIL_ADLARI[d]}
            </button>
          ))}
        </div>
        <span className="alan-ipucu">{s.ayarlar.dil.aciklama}</span>
      </div>
    </section>
  );
}

/** Sayfanın sonunda tek satırlık imza: sürüm ve yapan */
function Hakkinda({ surum }: { surum: string }) {
  const s = useSozluk();
  return (
    <section className="ayar-hakkinda" aria-labelledby="hakkinda-baslik">
      <h2 className="gizli" id="hakkinda-baslik">
        {s.ayarlar.hakkinda.baslik}
      </h2>
      <p>
        <span className="ayar-hakkinda-marka">ArnOrg</span> {surum} <span aria-hidden="true">·</span> Furkan YILDIRIM{" "}
        <span aria-hidden="true">·</span>{" "}
        <a href="https://furkanyildirim.com" target="_blank" rel="noreferrer">
          furkanyildirim.com
        </a>
      </p>
    </section>
  );
}

function SaglikBilgisi({ saglik }: { saglik: Saglik }) {
  const t = useSozluk().ayarlar.sistem;
  return (
    <section className="ayar-bolum" aria-labelledby="saglik-baslik">
      <h2 className="ara-baslik" id="saglik-baslik">
        {t.baslik}
      </h2>
      <dl className="kv">
        <dt>Claude Code</dt>
        <dd>
          {saglik.claudeBulundu ? (
            <span className="durum durum-calisiyor">
              <i aria-hidden="true" />
              {t.bulundu}
              {saglik.claudeSurumu ? ` · ${saglik.claudeSurumu}` : ""}
            </span>
          ) : (
            <span className="durum durum-hata">
              <i aria-hidden="true" />
              {t.bulunamadi}
            </span>
          )}
        </dd>
        {saglik.claudeYolu ? (
          <>
            <dt>{t.yol}</dt>
            <dd>
              <code>{saglik.claudeYolu}</code>
            </dd>
          </>
        ) : null}
        <dt>Agent SDK</dt>
        <dd>{saglik.sdkSurumu}</dd>
        <dt>ArnOrg</dt>
        <dd>{saglik.surum}</dd>
        <dt>Platform</dt>
        <dd>{saglik.platform}</dd>
        <dt>{t.veriDizini}</dt>
        <dd>
          <code>{saglik.veriDizini}</code>
        </dd>
      </dl>
      {!saglik.claudeBulundu ? <p className="uyari-kutu">{t.uyari}</p> : null}
    </section>
  );
}

function YerelTercihler() {
  const s = useSozluk();
  const t = s.ayarlar.tarayici;
  const sirketAdi = useTercihler((x) => x.sirketAdi);
  const [ad, setAd] = useState(sirketAdi);
  const [cikis, setCikis] = useState(false);
  return (
    <section className="ayar-bolum" aria-labelledby="tercih-baslik">
      <h2 className="ara-baslik" id="tercih-baslik">
        {t.baslik}
      </h2>
      <form
        className="alan"
        onSubmit={(e) => {
          e.preventDefault();
          sirketAdiAyarla(ad);
          bildir("basari", sozluk().ayarlar.tarayici.sirketGuncellendi);
        }}
      >
        <label htmlFor="ay-sirket">{t.sirketAdi}</label>
        <div className="giris-satir">
          <input id="ay-sirket" className="girdi" value={ad} onChange={(e) => setAd(e.target.value)} placeholder={s.genel.arnorg} />
          <button type="submit" className="dugme" disabled={ad.trim() === sirketAdi}>
            {t.uygula}
          </button>
        </div>
        <span className="alan-ipucu">{t.yerel}</span>
      </form>
      <div className="alan ayar-baglanti">
        <span className="alan-ad">{t.baglanti}</span>
        {cikis ? (
          <div className="dugme-satir">
            <button type="button" className="dugme dugme-tehlike dugme-kucuk" onClick={() => anahtarAyarla(null)}>
              {t.anahtariUnut}
            </button>
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setCikis(false)}>
              {s.genel.vazgec}
            </button>
          </div>
        ) : (
          <div>
            <button type="button" className="dugme dugme-kucuk" onClick={() => setCikis(true)}>
              {t.baglantiyiKes}
            </button>
          </div>
        )}
        <span className="alan-ipucu">{t.anahtarIpucu}</span>
      </div>
    </section>
  );
}
