// Linkler (0.0.8'de "Proje adresleri"): projenin açılabilen adresleri. CEO projenin linklerini verir ve güncel tutar,
// çalışanlar başlattıkları sunucuların adresini bildirir, ArnOrg kabuk çıktılarında yakalar; kurul burada elle ekler ve
// kaldırır (0.0.9). Kart tıklanınca adres uygulama içi tarayıcıda (masaüstü) ya da web kipinin çerçevesinde açılır.
// Bölüm her zaman görünür: boşken ne olduğunu söyler; "CEO'dan iste" CEO'ya linkleri eklemesini ve güncel tutmasını
// söyler. Geniş ekranda sağ sütunun üstüdür, notlar altta; dar ekranda notlar çekmecesinin üstünde yatay kayan şerittir.
import "../../stiller/adresler.css";
import type { ProjeAdresi } from "@arnorg/ortak";
import { useEffect, useId, useRef, useState } from "react";
import { useSozluk } from "../../dil";
import { adresleriYukle, linkEkle, linkleriIste, linkSil, useAdresler } from "../../durum/adresler";
import { useVeri } from "../../durum/veri";
import { goreli } from "../../yardimcilar/bicim";
import { useIslem, useSimdi } from "../../yardimcilar/kancalar";
import { adresMi, kisaAdres } from "../../yardimcilar/tarayiciAdresi";
import { DugmeYukleniyor } from "../Durumlar";
import { OnaySor } from "../OnaySor";
import { Simge } from "../Simge";

export function ProjeAdresleri({ pid, secili, ac }: { pid: string | null; secili: string | null; ac: (a: ProjeAdresi) => void }) {
  const t = useSozluk().arayuz.adresler;
  const baslikId = useId();
  const liste = useAdresler((d) => (d.projeId === pid ? d.liste : null));
  const bagli = useVeri((d) => d.wsDurumu === "bagli");
  // Göreli zamanlar ("3 dk önce") yarım dakikada bir tazelenir
  const simdi = useSimdi(30_000);
  const [formAcik, setFormAcik] = useState(false);
  /** CEO'ya istek gitti: kısa bilgi satırı */
  const [istendi, setIstendi] = useState(false);
  const { suruyor, calistir } = useIslem();

  useEffect(() => {
    if (pid) void adresleriYukle(pid);
    setFormAcik(false);
    setIstendi(false);
  }, [pid]);
  // Bağlantı yeniden kurulunca kopukken kaçan değişiklikler için liste yeniden istenir
  const oncekiBagli = useRef(bagli);
  useEffect(() => {
    if (bagli && !oncekiBagli.current && pid) void adresleriYukle(pid);
    oncekiBagli.current = bagli;
  }, [bagli, pid]);
  // CEO'nun eklediği ilk linkle bilgi satırı kalkar
  const sayi = liste?.length ?? 0;
  const oncekiSayi = useRef(sayi);
  useEffect(() => {
    if (sayi > oncekiSayi.current) setIstendi(false);
    oncekiSayi.current = sayi;
  }, [sayi]);

  if (!pid) return null;
  const linkler = liste ?? [];

  const iste = () =>
    void calistir("iste", async () => {
      await linkleriIste(pid);
      setIstendi(true);
    });

  return (
    <section className="adresler" data-bos={linkler.length ? undefined : ""} aria-labelledby={baslikId}>
      <div className="adresler-ust">
        <h2 id={baslikId}>{t.baslik}</h2>
        {linkler.length ? <span className="adresler-sayac sayi">{t.sayac(linkler.length)}</span> : null}
        <div className="adresler-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" title={t.isteBaslik} disabled={suruyor === "iste"} onClick={iste}>
            <DugmeYukleniyor suruyor={suruyor === "iste"}>{t.iste}</DugmeYukleniyor>
          </button>
          <button
            type="button"
            className="dugme dugme-sessiz dugme-kucuk dugme-simge"
            aria-label={t.ekle}
            title={t.ekle}
            aria-expanded={formAcik}
            onClick={() => setFormAcik(!formAcik)}
          >
            <Simge ad="arti" />
          </button>
        </div>
      </div>

      {istendi ? (
        <p className="adresler-istendi" role="status">
          {t.istendi}
        </p>
      ) : null}
      {formAcik ? <LinkFormu pid={pid} kapat={() => setFormAcik(false)} /> : null}

      {linkler.length ? (
        <ul className="adres-liste">
          {linkler.map((a) => (
            <li key={a.id}>
              <AdresKarti pid={pid} adres={a} secili={a.id === secili} ac={ac} simdi={simdi} />
            </li>
          ))}
        </ul>
      ) : liste && !formAcik && !istendi ? (
        <p className="adresler-bos">{t.bos}</p>
      ) : null}
    </section>
  );
}

/** Kurulun link eklediği küçük form: ad isteğe bağlı (yoksa adresin kısası), adres localhost:5173 gibi de yazılır */
function LinkFormu({ pid, kapat }: { pid: string; kapat: () => void }) {
  const s = useSozluk();
  const t = s.arayuz.adresler.form;
  const adId = useId();
  const adresId = useId();
  const hataId = useId();
  const [ad, setAd] = useState("");
  const [adres, setAdres] = useState("");
  const [hatali, setHatali] = useState(false);
  const { suruyor, calistir } = useIslem();

  const ekle = () => {
    const url = adresMi(adres);
    if (!url) {
      setHatali(true);
      return;
    }
    const temizAd = (ad.trim() || kisaAdres(url)).slice(0, 60);
    void calistir("ekle", async () => {
      await linkEkle(pid, { adres: url, ad: temizAd });
      kapat();
    });
  };

  return (
    <form
      className="adres-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        ekle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          kapat();
        }
      }}
    >
      <div className="alan">
        <label htmlFor={adId}>{t.ad}</label>
        <input id={adId} className="girdi" maxLength={60} autoComplete="off" placeholder={t.adIpucu} value={ad} autoFocus onChange={(e) => setAd(e.target.value)} />
      </div>
      <div className="alan">
        <label htmlFor={adresId}>{t.adres}</label>
        <input
          id={adresId}
          className="girdi"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t.adresIpucu}
          value={adres}
          aria-invalid={hatali || undefined}
          aria-describedby={hatali ? hataId : undefined}
          onChange={(e) => {
            setAdres(e.target.value);
            setHatali(false);
          }}
        />
        {hatali ? (
          <span className="alan-hata" id={hataId}>
            {t.adresHata}
          </span>
        ) : null}
      </div>
      <div className="dugme-satir">
        <button type="submit" className="dugme dugme-kucuk dugme-ana" disabled={!adres.trim() || !!suruyor}>
          <DugmeYukleniyor suruyor={!!suruyor}>{t.ekle}</DugmeYukleniyor>
        </button>
        <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={kapat}>
          {s.genel.vazgec}
        </button>
      </div>
    </form>
  );
}

function AdresKarti({ pid, adres: a, secili, ac, simdi }: { pid: string; adres: ProjeAdresi; secili: boolean; ac: (a: ProjeAdresi) => void; simdi: number }) {
  const s = useSozluk();
  const t = s.arayuz.adresler;
  const [silOnay, setSilOnay] = useState(false);
  const { suruyor, calistir } = useIslem();
  const durum = a.durum === "bilinmiyor" && !a.yoklanir ? t.yoklanmaz : t.durum[a.durum];
  // Kurulun eklediği linkte bildiren, eklendiği andaki dilde saklıdır; arayüz dilinde gösterilir
  const bildiren = a.kaynak === "kurul" ? t.kurul : a.bildirenAd;
  return (
    <div className="adres-oge">
      <button
        type="button"
        className="adres-kart"
        data-durum={a.durum}
        aria-current={secili ? "true" : undefined}
        aria-label={t.ac(a.ad, durum, a.adres)}
        title={t.acBaslik(a.adres)}
        onClick={() => ac(a)}
      >
        <span className="adres-nokta" aria-hidden="true" />
        <span className="adres-ad tek-satir">{a.ad}</span>
        <span className="adres-git" aria-hidden="true">
          <Simge ad="gonder" boyut={12} />
        </span>
        <span className="adres-url tek-satir">{kisaAdres(a.adres)}</span>
        <span className="adres-alt tek-satir">
          {a.durum !== "acik" ? <span className="adres-durum">{durum}</span> : null}
          <span>{bildiren}</span>
          <span>{goreli(a.guncelleme, simdi)}</span>
          {a.kaynak === "cikti" ? <span>{t.cikti}</span> : null}
        </span>
      </button>
      {!silOnay ? (
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge adres-sil" aria-label={t.sil(a.ad)} title={t.sil(a.ad)} onClick={() => setSilOnay(true)}>
          <Simge ad="cop" boyut={12} />
        </button>
      ) : (
        <div className="adres-onay">
          <OnaySor evet={() => void calistir("sil", () => linkSil(pid, a.id))} vazgec={() => setSilOnay(false)} evetMetni={t.kaldir} suruyor={suruyor === "sil"}>
            {t.silOnay(a.ad)}
          </OnaySor>
        </div>
      )}
    </div>
  );
}
