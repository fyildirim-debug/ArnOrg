// Web kipi: Stüdyo tarayıcıdan açıldığında uygulama içi tarayıcı yoktur. Kısa açıklama ve elle not formu
// (sayfanın adresi ve not); notlar paneli ve "Hepsini yaptır" aynı biçimde çalışır.
// Proje adreslerinden biri seçilince (ProjeAdresleri) adres bu alanda bir çerçevede açılır: yenile, yeni sekmede aç,
// not ekle (adres dolu gelir) ve kapat.
import type { ProjeAdresi } from "@arnorg/ortak";
import { useEffect, useId, useRef, useState } from "react";
import { useSozluk } from "../../dil";
import { duzeltmeEkle } from "../../durum/duzeltmeler";
import { useIslem } from "../../yardimcilar/kancalar";
import { adresMi, kisaAdres } from "../../yardimcilar/tarayiciAdresi";
import { sonAdres, sonAdresiYaz } from "../../yardimcilar/tercihler";
import { DugmeYukleniyor } from "../Durumlar";
import { Simge } from "../Simge";

/**
 * Çerçevenin kum havuzu: sayfa Stüdyo'yu başka adrese götüremez (allow-top-navigation yok); açılır pencereler
 * yeni sekmede açılır.
 */
const CERCEVE_KUMU = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";
/**
 * Stüdyo çapraz köken yalıtımıyla sunulur (COEP credentialless): kimlik bilgisiz (credentialless) çerçeve, yalıtım
 * başlığı göndermeyen geliştirme sunucularını da açar. React özniteliği tanır; türlerde henüz yok.
 */
const KIMLIKSIZ = { credentialless: true } as object;

export function WebKipi({ pid, cerceve, cerceveyiKapat }: { pid: string | null; cerceve: ProjeAdresi | null; cerceveyiKapat: () => void }) {
  const s = useSozluk();
  const t = s.tarayici.web;
  if (cerceve) return <Cerceve key={cerceve.id} pid={pid} adres={cerceve} kapat={cerceveyiKapat} />;
  return (
    <div className="tarayici-web">
      <div className="tarayici-web-ic">
        <h1>{s.tarayici.baslik}</h1>
        <p className="tarayici-web-baslik">{t.baslik}</p>
        <p className="tarayici-web-metin">{t.metin}</p>
        <ElleNot pid={pid} />
      </div>
    </div>
  );
}

/** Seçilen proje adresi çerçevede; araç çubuğunda yenile, yeni sekmede aç, not ekle, kapat */
function Cerceve({ pid, adres: a, kapat }: { pid: string | null; adres: ProjeAdresi; kapat: () => void }) {
  const s = useSozluk();
  const t = s.arayuz.cerceve;
  const [surum, setSurum] = useState(0);
  const [notAcik, setNotAcik] = useState(false);
  const notDugmesi = useRef<HTMLButtonElement>(null);

  const notuKapat = () => {
    setNotAcik(false);
    requestAnimationFrame(() => notDugmesi.current?.focus());
  };
  useEffect(() => {
    if (!notAcik) return;
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape") notuKapat();
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [notAcik]);

  return (
    <div className="cerceve">
      <div className="cerceve-arac" role="toolbar" aria-label={t.arac}>
        <div className="cerceve-kimlik" data-durum={a.durum}>
          <span className="adres-nokta" aria-hidden="true" />
          <b className="cerceve-ad tek-satir">{a.ad}</b>
          <code className="cerceve-url tek-satir" title={a.adres}>
            {kisaAdres(a.adres)}
          </code>
        </div>
        <div className="cerceve-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={t.yenile} title={t.yenile} onClick={() => setSurum((n) => n + 1)}>
            <Simge ad="yenile" />
          </button>
          <a className="dugme dugme-sessiz dugme-kucuk" href={a.adres} target="_blank" rel="noopener noreferrer" title={t.yeniSekme}>
            <Simge ad="dis" />
            <span className="dugme-metin">{t.yeniSekme}</span>
          </a>
          <button type="button" ref={notDugmesi} className="dugme dugme-kucuk" aria-expanded={notAcik} title={t.notEkle} onClick={() => (notAcik ? notuKapat() : setNotAcik(true))}>
            <Simge ad="duzenle" />
            <span className="dugme-metin">{t.notEkle}</span>
          </button>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={t.kapat} title={t.kapat} onClick={kapat}>
            <Simge ad="kapat" />
          </button>
        </div>
        <p className="cerceve-ipucu">{t.ipucu}</p>
      </div>
      <div className="cerceve-sahne">
        <iframe key={surum} src={a.adres} title={t.etiket(a.ad)} sandbox={CERCEVE_KUMU} referrerPolicy="no-referrer" {...KIMLIKSIZ} />
        {notAcik ? (
          <div className="tarayici-not-penceresi cerceve-not" role="dialog" aria-label={s.tarayici.web.formBaslik}>
            <ElleNot pid={pid} ilkAdres={a.adres} eklendi={notuKapat} vazgec={notuKapat} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Elle not: sayfanın adresi ve ne olmadığı; çerçevede adres dolu gelir */
function ElleNot({ pid, ilkAdres, eklendi, vazgec }: { pid: string | null; ilkAdres?: string; eklendi?: () => void; vazgec?: () => void }) {
  const s = useSozluk();
  const t = s.tarayici.web;
  const adresId = useId();
  const notId = useId();
  const hataId = useId();
  const [adres, setAdres] = useState(() => ilkAdres ?? (pid ? (sonAdres(pid) ?? "") : ""));
  const [not, setNot] = useState("");
  const [adresHatali, setAdresHatali] = useState(false);
  const { suruyor, calistir } = useIslem();

  const ekle = () => {
    if (!pid) return;
    const tam = adresMi(adres);
    if (!tam) {
      setAdresHatali(true);
      return;
    }
    const temiz = not.trim();
    if (!temiz) return;
    void calistir("ekle", async () => {
      await duzeltmeEkle(pid, { adres: tam, not: temiz });
      sonAdresiYaz(pid, tam);
      setAdres(tam);
      setNot("");
      eklendi?.();
    });
  };

  return (
    <form
      className={ilkAdres ? "tarayici-elle tarayici-elle-cerceve" : "tarayici-elle"}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        ekle();
      }}
    >
      <h2>{t.formBaslik}</h2>
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
          aria-invalid={adresHatali || undefined}
          aria-describedby={adresHatali ? hataId : undefined}
          onChange={(e) => {
            setAdres(e.target.value);
            setAdresHatali(false);
          }}
        />
        {adresHatali ? (
          <span className="alan-hata" id={hataId}>
            {t.adresHata}
          </span>
        ) : null}
      </div>
      <div className="alan">
        <label htmlFor={notId}>{t.not}</label>
        <textarea
          id={notId}
          className="metin-alani"
          rows={4}
          maxLength={4000}
          placeholder={s.tarayici.not.ipucu}
          value={not}
          autoFocus={!!ilkAdres}
          onChange={(e) => setNot(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              ekle();
            }
          }}
        />
      </div>
      <div className="dugme-satir">
        <button type="submit" className="dugme dugme-ana" disabled={!pid || !adres.trim() || !not.trim() || !!suruyor}>
          <DugmeYukleniyor suruyor={!!suruyor}>{t.ekle}</DugmeYukleniyor>
        </button>
        {vazgec ? (
          <button type="button" className="dugme dugme-sessiz" onClick={vazgec}>
            {s.genel.vazgec}
          </button>
        ) : null}
      </div>
    </form>
  );
}
