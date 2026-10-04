// Ayarlar: Claude girişi ve abonelik sınırları, çekirdek ayarları, sağlık bilgisi, bu tarayıcının tercihleri ve bağlantı
import type { Ayarlar as AyarlarTipi, IzinModu, KodZekasiModelBilgisi, KodZekasiModeli, Saglik } from "@arnorg/ortak";
import { useEffect, useState, type FormEvent } from "react";
import { anahtarAyarla } from "../api/anahtar";
import { api } from "../api/uclar";
import { HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { IZIN_MODLARI, izinModuAdi } from "../bilesenler/Kisi";
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

export function Ayarlar() {
  const [ayarlar, setAyarlar] = useState<AyarlarTipi | null>(null);
  const [taslak, setTaslak] = useState<AyarlarTipi | null>(null);
  const [saglik, setSaglik] = useState<Saglik | null>(null);
  const [modeller, setModeller] = useState<KodZekasiModelBilgisi[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();

  const yukle = () => {
    setHata(null);
    Promise.all([api.ayarlar(), api.saglik()])
      .then(([a, s]) => {
        setAyarlar(a);
        setTaslak(a);
        setSaglik(s);
        useVeri.setState({ saglik: s });
      })
      .catch((e: unknown) => setHata(e instanceof Error ? e.message : "Ayarlar alınamadı."));
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
      bildir("basari", "Ayarlar kaydedildi.");
    });
  };
  const degistir = (d: Partial<AyarlarTipi>) => setTaslak((t) => (t ? { ...t, ...d } : t));
  const disEditorOzel = taslak && !DIS_EDITORLER.some(([k]) => k === taslak.disEditor);

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>Ayarlar</h1>
          <p>Çekirdek ayarları bütün projeler için geçerlidir</p>
        </div>
      </div>
      {hata ? <HataKutu metin={hata} yeniden={yukle} /> : null}
      {!taslak && !hata ? <Iskelet satir={8} /> : null}

      <div className="ayarlar-yerlesim">
        {taslak ? (
          <form className="ayar-bolum" onSubmit={kaydet} noValidate>
            <h2 className="ara-baslik">Claude girişi</h2>
            <div className="hesap-durum" role="status">
              {hesap?.durum === "hazir" ? (
                <p>
                  <b>{hesap.plan ? `Claude ${hesap.plan}` : "Claude Code"}</b>
                  {hesap.eposta ? ` · ${hesap.eposta}` : ""}
                  {hesap.kaynak ? <small> · giriş: {hesap.kaynak}</small> : null}
                </p>
              ) : (
                <p className="soluk">
                  {hesap?.durum === "hata" ? `Claude Code'a ulaşılamadı: ${hesap.hata ?? ""}` : "Claude Code girişi henüz okunmadı."}
                </p>
              )}
              {hesap?.pencereler.length ? (
                <p className="hesap-pencereler">
                  {hesap.pencereler
                    .filter((p) => p.tur === "bes_saat" || p.tur === "haftalik")
                    .map((p) => `${p.ad} ${yuzde(p.yuzde)}${p.sifirlanma ? ` (sıfırlanma ${akilliZaman(p.sifirlanma)})` : ""}`)
                    .join(" · ")}
                </p>
              ) : null}
              {hesap?.uyari ? <p className="alan-hata">{hesap.uyari}</p> : null}
              <button type="button" className="metin-dugme" onClick={() => void hesabiYukle(true)}>
                Girişi yeniden oku
              </button>
            </div>
            <div className="form-izgara">
              <p className="alan-ipucu tam">
                ArnOrg yalnız Claude aboneliğiyle çalışır: ajanlar bu makinedeki Claude Code girişinizle (Pro, Max ya da Team) çalışır.
                Planın 5 saatlik ve haftalık pencereleri sayılır; ortamda API anahtarı olsa da ajanlara verilmez.
              </p>
              <div className="alan">
                <label htmlFor="ay-bes">5 saatlik pencere üst sınırı (%)</label>
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
                <span className="alan-ipucu">Ajanlar bu yüzdede durur, kalanı sizin kullanımınıza kalır. 0 sınırsız.</span>
              </div>
              <div className="alan">
                <label htmlFor="ay-hafta">Haftalık pencere üst sınırı (%)</label>
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
                <span className="alan-ipucu">Pencere sıfırlanınca ajanlar kaldıkları yerden sürer.</span>
              </div>
            </div>

            <h2 className="ara-baslik">Çekirdek</h2>
            <div className="form-izgara">
              <div className="alan tam">
                <label htmlFor="ay-claude">Claude Code yolu</label>
                <input
                  id="ay-claude"
                  className="girdi"
                  value={taslak.claudeYolu ?? ""}
                  onChange={(e) => degistir({ claudeYolu: e.target.value })}
                  placeholder="Boş: önce PATH, sonra SDK ile gelen ikili"
                  spellCheck={false}
                />
              </div>
              <div className="alan">
                <label htmlFor="ay-mod">Varsayılan izin modu</label>
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
                <span className="alan-ipucu">Her çağrı modu ne olursa olsun PreToolUse kapısından geçer.</span>
              </div>
              <div className="alan">
                <label htmlFor="ay-sure">Karar süresi (saniye)</label>
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
                  {sureGecersiz ? "En az 10 saniye." : "Süre dolunca bekleyen araç çağrısı reddedilir."}
                </span>
              </div>
              <div className="alan">
                <label htmlFor="ay-tikanma">Tıkanma eşiği (dakika)</label>
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
                  {tikanmaGecersiz
                    ? "0 ile 1440 arasında olmalı."
                    : "Bu süre ilerlemeyen görevin sorumlusu hatırlatılır, sonra yöneticiye ve kurula iletilir. 0 kapatır."}
                </span>
              </div>
              <div className="alan">
                <label htmlFor="ay-editor">Dış editör</label>
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
                  <option value="ozel">Başka bir komut…</option>
                </select>
              </div>
              {disEditorOzel ? (
                <div className="alan">
                  <label htmlFor="ay-editor-ozel">Editör komutu</label>
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
            <h2 className="ara-baslik">Kod zekâsı</h2>
            <div className="form-izgara">
              <div className="alan tam">
                <span className="alan-ad" id="kz-model-ad">
                  Anlamsal arama modeli
                </span>
                <div className="bolumlu" role="group" aria-labelledby="kz-model-ad">
                  {(
                    [
                      ["kaliteli", "Kaliteli"],
                      ["hizli", "Hızlı"],
                      ["kapali", "Kapalı"],
                    ] as [KodZekasiModeli, string][]
                  ).map(([k, ad]) => (
                    <button key={k} type="button" aria-pressed={taslak.kodZekasiModeli === k} onClick={() => degistir({ kodZekasiModeli: k })}>
                      {ad}
                    </button>
                  ))}
                </div>
                <span className="alan-ipucu">
                  {taslak.kodZekasiModeli === "kapali"
                    ? "Kod yalnız anahtar sözcük ve sembol adıyla aranır; model indirilmez."
                    : (() => {
                        const m = modeller.find((x) => x.secim === taslak.kodZekasiModeli);
                        if (!m) return "Model ilk kullanımda indirilir ve bu makinede çalışır; kod dışarı gönderilmez.";
                        return `${m.ad}: ${m.aciklama} ${m.indirildi ? `İndirildi (${m.diskMb} MB).` : `İlk kullanımda ~${m.indirmeMb} MB indirilir.`} Model bu makinede çalışır; kod dışarı gönderilmez.`;
                      })()}
                </span>
              </div>
              <div className="alan tam">
                <label className="secenek">
                  <input type="checkbox" checked={taslak.kodZekasiOtomatik} onChange={(e) => degistir({ kodZekasiOtomatik: e.target.checked })} />
                  Projeleri otomatik dizinle
                </label>
                <span className="alan-ipucu">
                  Açıkken ArnOrg açılınca ve proje eklenince ana repo arka planda dizinlenir; değişen dosyalar kendiliğinden güncellenir. Kapalıyken ilk arama dizinlemeyi başlatır.
                </span>
              </div>
            </div>
            <div className="dugme-satir ayar-kaydet">
              <button
                type="submit"
                className="dugme dugme-ana"
                disabled={!kirli || suruyor !== null || sureGecersiz || tikanmaGecersiz || sinirGecersiz}
              >
                {suruyor ? <span className="doner" aria-hidden="true" /> : null}
                Kaydet
              </button>
              {kirli ? (
                <button type="button" className="dugme dugme-sessiz" onClick={() => setTaslak(ayarlar)}>
                  Vazgeç
                </button>
              ) : (
                <span className="alan-ipucu">Değişiklik yok</span>
              )}
            </div>
          </form>
        ) : null}

        <div className="ayar-yan">
          {saglik ? <SaglikBilgisi saglik={saglik} /> : null}
          <YerelTercihler />
        </div>
      </div>
    </>
  );
}

function SaglikBilgisi({ saglik }: { saglik: Saglik }) {
  return (
    <section className="ayar-bolum" aria-labelledby="saglik-baslik">
      <h2 className="ara-baslik" id="saglik-baslik">
        Sistem
      </h2>
      <dl className="kv">
        <dt>Claude Code</dt>
        <dd>
          {saglik.claudeBulundu ? (
            <span className="durum durum-calisiyor">
              <i aria-hidden="true" />
              Bulundu{saglik.claudeSurumu ? ` · ${saglik.claudeSurumu}` : ""}
            </span>
          ) : (
            <span className="durum durum-hata">
              <i aria-hidden="true" />
              Bulunamadı
            </span>
          )}
        </dd>
        {saglik.claudeYolu ? (
          <>
            <dt>Yol</dt>
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
        <dt>Veri dizini</dt>
        <dd>
          <code>{saglik.veriDizini}</code>
        </dd>
      </dl>
      {!saglik.claudeBulundu ? <p className="uyari-kutu">Ajanlar başlatılamaz. Claude Code'u kurun ya da yolunu yukarıda belirtin.</p> : null}
    </section>
  );
}

function YerelTercihler() {
  const sirketAdi = useTercihler((t) => t.sirketAdi);
  const [ad, setAd] = useState(sirketAdi);
  const [cikis, setCikis] = useState(false);
  return (
    <section className="ayar-bolum" aria-labelledby="tercih-baslik">
      <h2 className="ara-baslik" id="tercih-baslik">
        Bu tarayıcı
      </h2>
      <form
        className="alan"
        onSubmit={(e) => {
          e.preventDefault();
          sirketAdiAyarla(ad);
          bildir("basari", "Şirket adı güncellendi.");
        }}
      >
        <label htmlFor="ay-sirket">Üst çubukta görünen şirket adı</label>
        <div className="giris-satir">
          <input id="ay-sirket" className="girdi" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ArnOrg" />
          <button type="submit" className="dugme" disabled={ad.trim() === sirketAdi}>
            Uygula
          </button>
        </div>
        <span className="alan-ipucu">Yalnız bu tarayıcıda saklanır.</span>
      </form>
      <div className="alan ayar-baglanti">
        <span className="alan-ad">Bağlantı</span>
        {cikis ? (
          <div className="dugme-satir">
            <button type="button" className="dugme dugme-tehlike dugme-kucuk" onClick={() => anahtarAyarla(null)}>
              Anahtarı unut
            </button>
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setCikis(false)}>
              Vazgeç
            </button>
          </div>
        ) : (
          <div>
            <button type="button" className="dugme dugme-kucuk" onClick={() => setCikis(true)}>
              Bu sekmede bağlantıyı kes
            </button>
          </div>
        )}
        <span className="alan-ipucu">Erişim anahtarı sessionStorage'da durur; unutulunca yeniden yapıştırmanız gerekir.</span>
      </div>
    </section>
  );
}
