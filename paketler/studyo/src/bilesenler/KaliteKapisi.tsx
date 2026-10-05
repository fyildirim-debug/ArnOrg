// Kalite denetimi. 0.0.7'den kalan birleştirme onayının kalite kapısı satırı (geçmişte okunur kalır; 0.0.8'de
// birleştirme yok, yeniden deneme ya da testsiz birleştirme de yok): sırası, süresi, sonucu, açılır test çıktısı ve
// dalın farkı. Fark çekmecesi ve çıktı kutusu görev kayıtlarında da kullanılır (ortak/OrtakCalisma.tsx). Proje
// ayarlarında test ve hazırlık komutu ile süre sınırı düzenlenir; package.json'da gerçek bir test betiği varsa tek
// tıkla doldurulan öneri çıkar.
import type { BirlestirmeKalitesi, FarkSonucu, KaliteOnerisi, Onay, ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir } from "../durum/arayuz";
import { projeUygula, useVeri } from "../durum/veri";
import { kalanSure, sayi } from "../yardimcilar/bicim";
import { useIslem, useSimdi } from "../yardimcilar/kancalar";
import { Cekmece } from "./Cekmece";
import { Bos, HataKutu, Iskelet } from "./Durumlar";
import { Simge } from "./Simge";

/** Birleştirme onayının kalite kapısı kaydı (veri.kalite); kuyruğa hiç girmediyse null */
export function kaliteKaydi(onay: Onay): BirlestirmeKalitesi | null {
  if (onay.tur !== "birlestirme" || !onay.veri || typeof onay.veri !== "object") return null;
  const k = (onay.veri as { kalite?: unknown }).kalite as BirlestirmeKalitesi | undefined;
  return k && typeof k === "object" && typeof k.durum === "string" ? k : null;
}

/** Onay verisindeki dal ve hedef */
function dallar(onay: Onay, anaDal: string | null): { dal: string; hedef: string } {
  const v = (onay.veri && typeof onay.veri === "object" ? onay.veri : {}) as { dal?: unknown; hedefDal?: unknown };
  return {
    dal: typeof v.dal === "string" ? v.dal : onay.baslik,
    hedef: typeof v.hedefDal === "string" ? v.hedefDal : (anaDal ?? "main"),
  };
}

const SUREN = new Set(["hazirlik", "test"]);

// ---------------------------------------------------------------------------
// Eski birleştirme onayının durum satırı ve çıktısı (salt okunur)
// ---------------------------------------------------------------------------

export function KaliteDurumu({ onay, kalite: k }: { onay: Onay; kalite: BirlestirmeKalitesi }) {
  const s = useSozluk();
  const t = s.kalite;
  const suren = SUREN.has(k.durum);
  const simdi = useSimdi(suren ? 1000 : 60_000);
  const [ciktiAcik, setCiktiAcik] = useState(false);
  const ciktiId = useId();

  const ayrinti: string[] = [];
  if (k.durum === "kuyrukta") {
    if (k.testsiz) ayrinti.push(t.testsizSirada);
    else if (k.sira) ayrinti.push(t.sirada(k.sira));
  } else if (k.durum === "hazirlik") ayrinti.push(k.komut ?? t.denetleniyor);
  else if (k.durum === "test" && k.komut) ayrinti.push(k.komut);
  else if (k.durum === "birlesti") ayrinti.push(k.testsiz ? t.testsiz : k.testYok ? t.testYok : t.testGecti(k.sureMs));
  else {
    ayrinti.push(t.birlesmedi);
    if (k.sureMs && !k.testsiz) ayrinti.push(t.sure(k.sureMs));
  }
  if (k.deneme > 1 && (suren || k.durum === "birlesti")) ayrinti.push(t.deneme(k.deneme));
  const basladi = Date.parse(k.adimBaslangic ?? k.baslangic ?? "");

  return (
    <div className="kalite" data-durum={k.durum}>
      <div className="kalite-satir">
        <p className="kalite-durum">
          <span className="kalite-isaret" aria-hidden="true">
            {suren ? <span className="doner" /> : <Simge ad={k.durum === "birlesti" ? "tamam" : k.durum === "kuyrukta" ? "saat" : "uyari"} boyut={13} />}
          </span>
          <span className="kalite-ad" aria-live="polite">
            {t.durum[k.durum]}
          </span>
          {ayrinti.length ? <span className="kalite-ayrinti">{ayrinti.join(" · ")}</span> : null}
          {suren && !Number.isNaN(basladi) ? (
            <time className="kalite-gecen sayi" dateTime={k.adimBaslangic ?? undefined}>
              {kalanSure(simdi - basladi)}
            </time>
          ) : null}
        </p>
        <div className="kalite-eylemler">
          {k.cikti ? (
            <button type="button" className="metin-dugme kalite-cikti-ac" aria-expanded={ciktiAcik} aria-controls={ciktiId} onClick={() => setCiktiAcik(!ciktiAcik)}>
              {t.cikti}
              <Simge ad="asagi" boyut={12} />
            </button>
          ) : null}
          <FarkAc onay={onay} />
        </div>
      </div>
      {k.mesaj && k.durum !== "birlesti" ? <p className="kalite-mesaj">{k.mesaj}</p> : null}
      {ciktiAcik && k.cikti ? <Cikti id={ciktiId} metin={k.cikti} etiket={t.ciktiEtiket(k.komut ?? t.cikti)} canli={suren} /> : null}
    </div>
  );
}

/** Komut çıktısının son satırları; süren işte en alttaysa yeni satırlarla birlikte iner */
export function Cikti({ id, metin, etiket, canli }: { id: string; metin: string; etiket: string; canli: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  const altta = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && altta.current) el.scrollTop = el.scrollHeight;
  }, [metin]);
  return (
    <pre
      id={id}
      ref={ref}
      className={`kalite-cikti${canli ? " kalite-cikti-canli" : ""}`}
      tabIndex={0}
      aria-label={etiket}
      onScroll={(e) => {
        const el = e.currentTarget;
        altta.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {metin}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Farkı aç: eski birleştirmede dalın hedefe göre birleşik farkı (çekmece)
// ---------------------------------------------------------------------------

export function FarkAc({ onay, metin }: { onay: Onay; metin?: boolean }) {
  const s = useSozluk();
  const anaDal = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId)?.varsayilanDal ?? null);
  const [acik, setAcik] = useState(false);
  const { dal, hedef } = dallar(onay, anaDal);
  return (
    <>
      <button type="button" className={metin ? "metin-dugme" : "dugme dugme-kucuk"} onClick={() => setAcik(true)} aria-haspopup="dialog">
        {metin ? null : <Simge ad="fark" boyut={12} />}
        {s.kalite.farkAc}
      </button>
      {acik ? (
        <FarkCekmecesi
          baslik={s.kalite.fark.baslik(dal, hedef)}
          anahtar={onay.id}
          getir={() => api.onayFarki(onay.id)}
          bosMetin={s.kalite.fark.yokMetin}
          kapat={() => setAcik(false)}
        />
      ) : null}
    </>
  );
}

/** Çizilen en çok satır; uzun farkta kalanı söylenir */
const SATIR_SINIRI = 4000;

type SatirTuru = "ekle" | "sil" | "baglam" | "parca" | "bilgi";
interface FarkSatiri {
  tur: SatirTuru;
  metin: string;
  no: number | null;
}
interface FarkDosyasi {
  yol: string;
  ust: string[];
  satirlar: FarkSatiri[];
}

/** Birleşik farkı dosyalara ve satırlara ayırır; yeni dosyadaki satır numarası tutulur */
function farkiAyristir(fark: string): { dosyalar: FarkDosyasi[]; kesildi: boolean } {
  const dosyalar: FarkDosyasi[] = [];
  let dosya: FarkDosyasi | null = null;
  let yeniNo = 0;
  let toplam = 0;
  let kesildi = false;
  for (const satir of fark.replace(/\r\n/g, "\n").split("\n")) {
    if (satir.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(satir);
      dosya = { yol: m?.[2] ?? satir.slice(11), ust: [], satirlar: [] };
      dosyalar.push(dosya);
      continue;
    }
    if (!dosya) continue;
    if (toplam >= SATIR_SINIRI) {
      kesildi = true;
      continue;
    }
    if (satir.startsWith("@@")) {
      yeniNo = Number(/\+(\d+)/.exec(satir)?.[1] ?? 1);
      dosya.satirlar.push({ tur: "parca", metin: satir, no: null });
    } else if (!dosya.satirlar.length) {
      // Başlık satırları: index, ---, +++, yeni ya da silinen dosya, ikili dosya
      if (!satir.startsWith("--- ") && !satir.startsWith("+++ ") && !satir.startsWith("index ") && satir) dosya.ust.push(satir);
      continue;
    } else if (satir.startsWith("+")) dosya.satirlar.push({ tur: "ekle", metin: satir.slice(1), no: yeniNo++ });
    else if (satir.startsWith("-")) dosya.satirlar.push({ tur: "sil", metin: satir.slice(1), no: null });
    else if (satir.startsWith("\\")) dosya.satirlar.push({ tur: "bilgi", metin: satir, no: null });
    else if (satir.startsWith(" ")) dosya.satirlar.push({ tur: "baglam", metin: satir.slice(1), no: yeniNo++ });
    else continue;
    toplam++;
  }
  return { dosyalar, kesildi };
}

const ISARET: Record<SatirTuru, string> = { ekle: "+", sil: "−", baglam: " ", parca: "", bilgi: "" };

/** Eklenen ve silinen satır sayısı; sıfır olan gösterilmez */
function Sayilar({ eklenen, silinen }: { eklenen: number; silinen: number }) {
  return (
    <>
      {eklenen ? <span className="onay-eklenen">+{sayi(eklenen)}</span> : null}
      {silinen ? <span className="onay-silinen">−{sayi(silinen)}</span> : null}
    </>
  );
}

/**
 * Birleşik farkı dosyalara ayırıp gösteren çekmece. getir farkı çeker (eski birleştirmede dalın farkı, görev kaydında
 * commit'in farkı); anahtar değişince yeniden çekilir.
 */
export function FarkCekmecesi({
  baslik,
  anahtar,
  getir,
  bosMetin,
  kapat,
}: {
  baslik: string;
  anahtar: string;
  getir: () => Promise<FarkSonucu>;
  bosMetin: string;
  kapat: () => void;
}) {
  const s = useSozluk();
  const t = s.kalite.fark;
  const [fark, setFark] = useState<FarkSonucu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yenile, setYenile] = useState(0);
  const kok = useId();
  const getirRef = useRef(getir);
  getirRef.current = getir;

  useEffect(() => {
    let iptal = false;
    setFark(null);
    setHata(null);
    getirRef
      .current()
      .then((f) => {
        if (!iptal) setFark(f);
      })
      .catch((e: unknown) => {
        if (!iptal) setHata(hataMetni(e));
      });
    return () => {
      iptal = true;
    };
  }, [anahtar, yenile]);

  const ayrik = useMemo(() => (fark ? farkiAyristir(fark.fark) : null), [fark]);
  const sayilar = useMemo(() => new Map((fark?.dosyalar ?? []).map((d) => [d.yol, d])), [fark]);
  const eklenen = fark?.dosyalar.reduce((n, d) => n + d.eklenen, 0) ?? 0;
  const silinen = fark?.dosyalar.reduce((n, d) => n + d.silinen, 0) ?? 0;

  return (
    <Cekmece baslik={baslik} kapat={kapat}>
      <div className="fark">
        {!fark && !hata ? <Iskelet satir={10} /> : null}
        {hata ? <HataKutu baslik={t.alinamadi} metin={hata} yeniden={() => setYenile((n) => n + 1)} /> : null}
        {fark && ayrik && !ayrik.dosyalar.length ? <Bos baslik={t.yok}>{bosMetin}</Bos> : null}
        {fark && ayrik?.dosyalar.length ? (
          <>
            <nav className="fark-dosyalar" aria-label={t.dosyalar}>
              <p className="onay-fark fark-toplam">
                <span>{t.dosya(fark.dosyalar.length || ayrik.dosyalar.length)}</span>
                <Sayilar eklenen={eklenen} silinen={silinen} />
              </p>
              <ul>
                {ayrik.dosyalar.map((d, i) => {
                  const say = sayilar.get(d.yol);
                  return (
                    <li key={`${d.yol}-${i}`}>
                      <a className="fark-dosya-bag" href={`#${kok}-${i}`}>
                        <span className="fark-tur" data-tur={say?.degisiklik ?? "M"} title={t.degisiklik[say?.degisiklik ?? "M"]}>
                          {say?.degisiklik ?? "M"}
                        </span>
                        <span className="fark-yol">{d.yol}</span>
                        {say ? (
                          <span className="onay-fark">
                            <Sayilar eklenen={say.eklenen} silinen={say.silinen} />
                          </span>
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {ayrik.dosyalar.map((d, i) => (
              <section key={`${d.yol}-${i}`} className="fark-dosya" id={`${kok}-${i}`} aria-label={d.yol}>
                <h3 className="fark-dosya-ad">
                  <code>{d.yol}</code>
                  {d.ust.length ? <span className="fark-dosya-ust">{d.ust.join(" · ")}</span> : null}
                </h3>
                {d.satirlar.length ? (
                  <div className="fark-kod" tabIndex={0} role="group" aria-label={d.yol}>
                    {d.satirlar.map((x, j) => (
                      <div key={j} className={`fark-satir fark-${x.tur}`}>
                        <span className="fark-no" aria-hidden="true">
                          {x.no ?? ""}
                        </span>
                        <span className="fark-isaret" aria-hidden="true">
                          {ISARET[x.tur]}
                        </span>
                        <span className="fark-metin">{x.metin || " "}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
            {ayrik.kesildi ? <p className="alan-ipucu">{t.kisaltildi(SATIR_SINIRI)}</p> : null}
          </>
        ) : null}
      </div>
    </Cekmece>
  );
}

// ---------------------------------------------------------------------------
// Proje ayarları: test ve hazırlık komutu, süre sınırı
// ---------------------------------------------------------------------------

export function KaliteAyari({ proje, k }: { proje: ProjeOzeti; k: string }) {
  const s = useSozluk();
  const t = s.kalite.ayar;
  const kayitliTest = proje.testKomutu ?? "";
  const kayitliHazirlik = proje.hazirlikKomutu ?? "";
  const kayitliSure = proje.testZamanAsimiDk ?? 20;
  const [test, setTest] = useState(kayitliTest);
  const [hazirlik, setHazirlik] = useState(kayitliHazirlik);
  const [sure, setSure] = useState(String(kayitliSure));
  const [oneri, setOneri] = useState<KaliteOnerisi | null>(null);
  const { suruyor, hata, calistir } = useIslem();

  // Kayıtlı değer değişince (başka ekrandan ya da kaydedince) alanlar ona döner
  useEffect(() => {
    setTest(kayitliTest);
    setHazirlik(kayitliHazirlik);
    setSure(String(kayitliSure));
  }, [kayitliTest, kayitliHazirlik, kayitliSure]);
  useEffect(() => {
    let iptal = false;
    api
      .kaliteOnerisi(proje.id)
      .then((o) => {
        if (!iptal) setOneri(o);
      })
      .catch(() => {
        if (!iptal) setOneri(null);
      });
    return () => {
      iptal = true;
    };
  }, [proje.id]);

  const sureSayi = Number(sure);
  const sureHatasi = !/^\d+$/.test(sure.trim()) || sureSayi < 1 || sureSayi > 240 ? t.sureGecersiz : null;
  const satirHatasi = /[\r\n]/.test(test) || /[\r\n]/.test(hazirlik) ? t.tekSatir : null;
  const degisti = test.trim() !== kayitliTest || hazirlik.trim() !== kayitliHazirlik || sureSayi !== kayitliSure;
  const oneriGoster = !!oneri?.testKomutu && test.trim() !== oneri.testKomutu;

  const kaydet = () => {
    if (!degisti || sureHatasi || satirHatasi) return;
    void calistir("kaydet", async () => {
      const p = await api.projeGuncelle(proje.id, { testKomutu: test.trim() || null, hazirlikKomutu: hazirlik.trim() || null, testZamanAsimiDk: sureSayi });
      projeUygula(p);
      bildir("basari", sozluk().kalite.ayar.kaydedildi(p.testKomutu));
    });
  };
  const vazgec = () => {
    setTest(kayitliTest);
    setHazirlik(kayitliHazirlik);
    setSure(String(kayitliSure));
  };

  return (
    <section className="proje-ayar-satir" aria-labelledby={`${k}-kalite`}>
      <h3 id={`${k}-kalite`}>{t.baslik}</h3>
      <form
        className="proje-ayar-icerik kalite-ayar"
        onSubmit={(e) => {
          e.preventDefault();
          kaydet();
        }}
      >
        <div className="alan">
          <label htmlFor={`${k}-test`}>{t.test}</label>
          <input
            id={`${k}-test`}
            className="girdi kalite-ayar-komut"
            value={test}
            onChange={(e) => setTest(e.target.value)}
            placeholder={t.testYer}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            disabled={suruyor !== null}
          />
          {oneriGoster && oneri?.testKomutu ? (
            <p className="kalite-ayar-oneri">
              <span>{t.oneri}</span>
              <code>{oneri.testKomutu}</code>
              {oneri.hazirlikKomutu ? <span className="soluk">· {t.oneriHazirlik(oneri.hazirlikKomutu)}</span> : null}
              <button
                type="button"
                className="metin-dugme"
                onClick={() => {
                  setTest(oneri.testKomutu ?? "");
                  if (oneri.hazirlikKomutu && !hazirlik.trim()) setHazirlik(oneri.hazirlikKomutu);
                }}
              >
                {t.oneriKullan}
              </button>
            </p>
          ) : null}
        </div>
        <div className="alan">
          <label htmlFor={`${k}-hazirlik`}>{t.hazirlik}</label>
          <input
            id={`${k}-hazirlik`}
            className="girdi kalite-ayar-komut"
            value={hazirlik}
            onChange={(e) => setHazirlik(e.target.value)}
            placeholder={t.hazirlikYer}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            disabled={suruyor !== null}
          />
        </div>
        <p className="alan-ipucu">{t.ipucu}</p>
        <div className="kalite-ayar-alt">
          <div className="alan">
            <label htmlFor={`${k}-sure`}>{t.sure}</label>
            <span className="kalite-ayar-sure">
              <input
                id={`${k}-sure`}
                className="girdi"
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                step={1}
                value={sure}
                onChange={(e) => setSure(e.target.value)}
                aria-invalid={sureHatasi ? true : undefined}
                aria-describedby={`${k}-sure-ipucu`}
                disabled={suruyor !== null}
              />
              <span className="soluk">{t.dk}</span>
            </span>
          </div>
          <div className="dugme-satir">
            <button type="submit" className="dugme" disabled={!degisti || !!sureHatasi || !!satirHatasi || suruyor !== null}>
              {suruyor === "kaydet" ? <span className="doner" aria-hidden="true" /> : <Simge ad="kaydet" boyut={12} />}
              {s.genel.kaydet}
            </button>
            {degisti && suruyor === null ? (
              <button type="button" className="metin-dugme" onClick={vazgec}>
                {s.genel.vazgec}
              </button>
            ) : null}
          </div>
        </div>
        <p className="alan-ipucu" id={`${k}-sure-ipucu`}>
          {t.sureIpucu}
        </p>
        {degisti && (sureHatasi || satirHatasi) ? (
          <p className="alan-hata" role="alert">
            {satirHatasi ?? sureHatasi}
          </p>
        ) : null}
        {hata && suruyor === null ? (
          <p className="alan-hata" role="alert">
            {hata}
          </p>
        ) : null}
      </form>
    </section>
  );
}
