// Uzun süren kurulum işleminin canlı paneli: durum, geçen süre, ilerleme, giriş adresi, tek kullanımlık kod,
// kod yapıştırma, iptal, hata ve yeniden deneme, ayrıntılı çıktı
import type { KurulumIslemi } from "@arnorg/ortak";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { hataMetni } from "../api/istek";
import { useSozluk } from "../dil";
import { hataBildir } from "../durum/arayuz";
import { islemeGirdi, islemIptal } from "../durum/kurulum";
import { kalanSure } from "../yardimcilar/bicim";
import { useSimdi } from "../yardimcilar/kancalar";
import { DisBaglanti } from "./DisBaglanti";
import { ilerlemeOku, sonSatir, type IslemIlerlemesi } from "./kurulumYardimcilari";
import { Simge } from "./Simge";

export function IslemPaneli({
  islem,
  yenidenDene,
  gizle,
}: {
  islem: KurulumIslemi;
  /** Hata ya da iptalden sonra işlemi yeniden başlatır */
  yenidenDene?: () => void;
  /** Biten işlemin panelini kapatır */
  gizle?: () => void;
}) {
  const s = useSozluk();
  const t = s.kurulum.islem;
  const calisiyor = islem.durum === "calisiyor";
  const ilerleme = calisiyor ? ilerlemeOku(islem) : null;
  const son = sonSatir(islem.cikti);
  const [iptalEdiliyor, setIptalEdiliyor] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Yeni işlem başlayınca panel görünür alana gelsin (dar ekranda düğmenin altında kalabilir)
  useEffect(() => {
    const azHareket = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "nearest", behavior: azHareket ? "auto" : "smooth" });
  }, [islem.id]);

  const iptal = async () => {
    setIptalEdiliyor(true);
    try {
      await islemIptal(islem.id);
    } catch (e) {
      hataBildir(e);
    } finally {
      setIptalEdiliyor(false);
    }
  };

  return (
    <section className={`islem islem-${islem.durum}`} aria-label={t.adlar[islem.tur]} ref={ref}>
      <div className="islem-ust">
        <span className="islem-durum" role="status">
          {calisiyor ? (
            <span className="doner" aria-hidden="true" />
          ) : (
            <Simge ad={islem.durum === "tamam" ? "tamam" : islem.durum === "hata" ? "uyari" : "halka"} boyut={14} />
          )}
          {t.durumlar[islem.durum]}
        </span>
        <b className="islem-ad">{t.adlar[islem.tur]}</b>
        {calisiyor ? <GecenSure baslangic={islem.baslangic} /> : null}
        {calisiyor ? (
          <button type="button" className="dugme dugme-kucuk dugme-sessiz islem-eylem" onClick={() => void iptal()} disabled={iptalEdiliyor}>
            {iptalEdiliyor ? <span className="doner" aria-hidden="true" /> : null}
            {t.iptal}
          </button>
        ) : gizle ? (
          <button type="button" className="dugme dugme-kucuk dugme-sessiz islem-eylem" onClick={gizle}>
            {t.gizle}
          </button>
        ) : null}
      </div>

      {calisiyor && islem.tur === "claude_giris" ? <ClaudeGirisi islem={islem} /> : null}
      {calisiyor && islem.tur === "gh_giris" ? <CihazKodu islem={islem} /> : null}
      {ilerleme ? <IlerlemeCubugu ilerleme={ilerleme} /> : null}
      {calisiyor && !ilerleme && islem.tur !== "claude_giris" && islem.tur !== "gh_giris" && son ? (
        <p className="islem-son tek-satir">{son}</p>
      ) : null}
      {islem.durum === "tamam" && son ? <p className="islem-son tek-satir">{son}</p> : null}

      {islem.durum === "hata" || islem.durum === "iptal" ? (
        <div className="islem-sonuc" role={islem.durum === "hata" ? "alert" : undefined}>
          {islem.durum === "hata" ? <p className="islem-hata-metin">{islem.hata ?? s.genel.bilinmeyenHata}</p> : null}
          {yenidenDene ? (
            <div>
              <button type="button" className="dugme dugme-kucuk" onClick={yenidenDene}>
                <Simge ad="yenile" />
                {t.yenidenDene}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Cikti metin={islem.cikti} />
    </section>
  );
}

function GecenSure({ baslangic }: { baslangic: string }) {
  const t = useSozluk().kurulum.islem;
  const simdi = useSimdi(1000);
  const sure = kalanSure(simdi - new Date(baslangic).getTime());
  return (
    <span className="islem-sure tabular">
      <span className="gizli">{t.gecen(sure)}</span>
      <span aria-hidden="true">{sure}</span>
    </span>
  );
}

/** Claude girişi: tarayıcıdaki giriş sayfasının adresi ve gerekirse kodu yapıştırma alanı */
function ClaudeGirisi({ islem }: { islem: KurulumIslemi }) {
  const t = useSozluk().kurulum.islem;
  const id = useId();
  const [kod, setKod] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderildi, setGonderildi] = useState(false);

  useEffect(() => {
    if (islem.girdiBekliyor) setGonderildi(false);
  }, [islem.girdiBekliyor]);

  const gonder = async (e: FormEvent) => {
    e.preventDefault();
    // Panel bir formun içinde çizilse de dıştaki form gönderilmesin
    e.stopPropagation();
    const metin = kod.trim();
    if (!metin) {
      setHata(t.kodGerekli);
      return;
    }
    setGonderiliyor(true);
    setHata(null);
    try {
      await islemeGirdi(islem.id, metin);
      setGonderildi(true);
      setKod("");
    } catch (e) {
      setHata(hataMetni(e));
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="islem-govde">
      {islem.adres ? (
        <p className="islem-adres">
          {t.adresAcildi}{" "}
          <DisBaglanti href={islem.adres} className="baglanti">
            {t.adresAc}
            <Simge ad="dis" boyut={11} className="islem-dis" />
          </DisBaglanti>
        </p>
      ) : null}
      {islem.girdiBekliyor ? (
        <form className="islem-kod" onSubmit={(e) => void gonder(e)} noValidate>
          <label htmlFor={id}>{t.kodYapistir}</label>
          <div className="giris-satir">
            <input
              id={id}
              className="girdi"
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              placeholder={t.kodOrnek}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              aria-invalid={hata ? true : undefined}
              aria-describedby={hata ? `${id}-hata` : undefined}
            />
            <button type="submit" className="dugme dugme-ana" disabled={gonderiliyor}>
              {gonderiliyor ? <span className="doner" aria-hidden="true" /> : null}
              {t.kodGonder}
            </button>
          </div>
          {hata ? (
            <span className="alan-hata" id={`${id}-hata`} role="alert">
              {hata}
            </span>
          ) : null}
        </form>
      ) : (
        <p className="yukleniyor-satir">
          <span className="doner" aria-hidden="true" />
          {gonderildi ? t.kodDogrulaniyor : t.girisBekleniyor}
        </p>
      )}
    </div>
  );
}

/** GitHub girişi: tek kullanımlık cihaz kodu, cihaz sayfası ve bekleme */
function CihazKodu({ islem }: { islem: KurulumIslemi }) {
  const t = useSozluk().kurulum.islem;
  return (
    <div className="islem-govde">
      {islem.kod ? (
        <div className="cihaz-kodu">
          <span className="cihaz-kodu-ad">{t.cihazKodu}</span>
          <div className="cihaz-kodu-satir">
            <output className="cihaz-kodu-deger" aria-live="polite">
              {islem.kod}
            </output>
            <KopyalaDugmesi metin={islem.kod} />
          </div>
          <span className="alan-ipucu">{t.cihazKoduIpucu}</span>
        </div>
      ) : null}
      {islem.adres ? (
        <div>
          <DisBaglanti href={islem.adres} className="dugme">
            <Simge ad="dis" />
            {t.cihazSayfasi}
          </DisBaglanti>
        </div>
      ) : null}
      <p className="yukleniyor-satir">
        <span className="doner" aria-hidden="true" />
        {t.onayBekleniyor}
      </p>
    </div>
  );
}

export function KopyalaDugmesi({ metin, kucuk }: { metin: string; kucuk?: boolean }) {
  const s = useSozluk();
  const [kopyalandi, setKopyalandi] = useState(false);
  const zaman = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (zaman.current) clearTimeout(zaman.current);
  }, []);
  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(true);
      if (zaman.current) clearTimeout(zaman.current);
      zaman.current = setTimeout(() => setKopyalandi(false), 2000);
    } catch (e) {
      hataBildir(e);
    }
  };
  return (
    <button type="button" className={`dugme${kucuk ? " dugme-kucuk" : ""}`} onClick={() => void kopyala()} aria-live="polite">
      <Simge ad={kopyalandi ? "tamam" : "kopyala"} />
      {kopyalandi ? s.genel.kopyalandi : s.genel.kopyala}
    </button>
  );
}

function IlerlemeCubugu({ ilerleme }: { ilerleme: IslemIlerlemesi }) {
  const t = useSozluk().kurulum.islem;
  const yuzde = ilerleme.oran === null ? null : Math.round(ilerleme.oran * 100);
  return (
    <div className="islem-ilerleme">
      <div className="islem-ilerleme-ust">
        <span>{t.asamalar[ilerleme.asama]}</span>
        <span className="tabular">{ilerleme.olcu}</span>
      </div>
      <div
        className={`islem-cubuk${yuzde === null ? " islem-cubuk-belirsiz" : ""}`}
        role="progressbar"
        aria-label={t.ilerleme}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={yuzde ?? undefined}
      >
        <span style={yuzde === null ? undefined : { width: `${yuzde}%` }} />
      </div>
    </div>
  );
}

/** Ayrıntılı çıktı: açıkken yeni satırlar gelince sona kayar */
function Cikti({ metin }: { metin: string }) {
  const t = useSozluk().kurulum.islem;
  const ref = useRef<HTMLPreElement>(null);
  const [acik, setAcik] = useState(false);
  useEffect(() => {
    if (acik && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [metin, acik]);
  return (
    <details className="islem-cikti" onToggle={(e) => setAcik((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <Simge ad="sag" boyut={12} className="islem-cikti-ok" />
        {t.cikti}
      </summary>
      <pre ref={ref} className="komut" tabIndex={0}>
        {metin.trim() || t.ciktiYok}
      </pre>
    </details>
  );
}
