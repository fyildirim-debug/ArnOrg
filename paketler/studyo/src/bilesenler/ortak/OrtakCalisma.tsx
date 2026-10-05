// Ortak çalışma (0.0.8): ekip tek projede, görev bazlı ve aynı anda çalışır; birleştirme yoktur. Ekip ekranının paneli:
// ekip temposu (CEO'nun seçimi ya da kurulun üst sınırı; yuvalar çalışanları gösterir), kim ne üzerinde (görevi ve
// kiraladığı dosyalar), 0.0.8 geçişinden kalan eski alanlar ve son görev kayıtları (commit, dosyalar, kalite denetimi,
// fark). Görev çekmecesi görevin kayıtlarını, ajan ayrıntısı çalıştığı yeri ve kiraladığı dosyaları buradan alır.
// Kart ve gölge yok: kıl çizgiler, durum rengi tek değişkenden (stiller/ortak-calisma.css).
import { KAYIT_SON_DURUMLARI, type Ajan, type AjanDurumu, type DosyaKirasi, type EkipTemposu, type EskiCalismaAlani, type Gorev, type GorevKaydi } from "@arnorg/ortak";
import { useId, useState } from "react";
import { ortakApi } from "../../api/ortak";
import { sozluk, useSozluk } from "../../dil";
import { bildir, git, useArayuz } from "../../durum/arayuz";
import { kayitUygula, ortakDurumuYukle, useOrtak, useOrtakCalisma } from "../../durum/ortakCalisma";
import { aktifMi, ceoBul, useVeri } from "../../durum/veri";
import { akilliZaman, goreli, kalanSure, sayi } from "../../yardimcilar/bicim";
import { useIslem, useSimdi } from "../../yardimcilar/kancalar";
import { HataKutu, Iskelet } from "../Durumlar";
import { Cikti, FarkCekmecesi } from "../KaliteKapisi";
import { AjanAvatar, DurumNoktasi } from "../Kisi";
import { Simge } from "../Simge";
import "../../stiller/ortak-calisma.css";

/** Çalışan önce, kapalı en sonda */
const DURUM_SIRASI: Record<AjanDurumu, number> = { calisiyor: 0, karar_bekliyor: 1, bosta: 2, duraklatildi: 3, hata: 4, kapali: 5 };
/** Yuvalarla gösterilen en büyük tempo; daha büyüğünde yalnız sayı */
const EN_COK_YUVA = 24;
/** Ekip ekranında ilk gösterilen kayıt */
const KAYIT_SAYFA = 8;

const SUREN = new Set(["hazirlik", "test"]);

/** Ajanın süren görevi: oturumun görevi, yoksa ona atanmış çalışılan görev */
function surenGorev(a: Ajan, gorevler: Gorev[]): Gorev | undefined {
  return gorevler.find((g) => g.id === a.gorevId) ?? gorevler.find((g) => g.atananId === a.id && g.durum === "calisiliyor");
}

// ---------------------------------------------------------------------------
// Ekip ekranındaki panel
// ---------------------------------------------------------------------------

export function OrtakCalismaPaneli() {
  const s = useSozluk();
  const t = s.ortakCalisma;
  const { yukleme, tempo, kiralar, kayitlar, kalanlar, projeId } = useOrtakCalisma();
  const ajanlar = useVeri((d) => d.ajanlar);
  const dal = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId)?.varsayilanDal ?? "main");
  const ekip = ajanlar.filter((a) => a.rol !== "ceo");
  const calisan = ekip.filter(aktifMi).length;

  return (
    <section className="ortak" aria-labelledby="ortak-baslik">
      <h2 className="ara-baslik" id="ortak-baslik">
        {t.baslik} <small className="sayi">{t.ozet(dal, calisan, tempo?.sirada ?? 0)}</small>
      </h2>
      {yukleme === "hata" ? <HataKutu metin={t.alinamadi} yeniden={projeId ? () => void ortakDurumuYukle(projeId) : undefined} /> : null}
      {tempo ? <TempoSatiri tempo={tempo} calisan={calisan} /> : yukleme === "yukleniyor" ? <Iskelet satir={2} /> : null}

      <h3 className="ortak-alt-baslik">{t.ekip.baslik}</h3>
      {ekip.length ? <KimNeUzerinde ekip={ekip} kiralar={kiralar} /> : <p className="alan-ipucu">{t.ekip.bos}</p>}

      {kalanlar.length ? <Kalanlar kalanlar={kalanlar} /> : null}

      <h3 className="ortak-alt-baslik">
        {t.kayit.baslik} <small className="sayi">{kayitlar.length || null}</small>
      </h3>
      {kayitlar.length ? (
        <KayitListesi kayitlar={kayitlar} sayfa={KAYIT_SAYFA} />
      ) : yukleme === "hazir" ? (
        <div className="ortak-bos">
          <b>{t.kayit.yok}</b>
          <p>{t.kayit.yokMetin}</p>
        </div>
      ) : null}
      {kayitlar.length ? <p className="alan-ipucu ortak-not">{t.kayit.aciklama}</p> : null}
    </section>
  );
}

/** Ekip temposu: geçerli sayı, üst sınır, kimin belirlediği ve gerekçe; yuvalar çalışanları gösterir */
function TempoSatiri({ tempo, calisan }: { tempo: EkipTemposu; calisan: number }) {
  const s = useSozluk();
  const t = s.ortakCalisma.tempo;
  const ceo = useVeri((d) => ceoBul(d.ajanlar));
  // Göreli zaman dakikada bir tazelenir
  useSimdi(60_000);
  const { gecerli, ustSinir } = tempo;
  const kim =
    tempo.belirleyen === "kurul"
      ? t.kurulda
      : !ceo
        ? t.ceoYok
        : tempo.secim !== null && tempo.zaman
          ? t.ceoBelirledi(ceo.ad, goreli(tempo.zaman))
          : t.ceoBelirlemedi(ceo.ad);
  // Yuvalar: tempo kadar (çalışan dolu), tempodan üst sınıra dek kapalı; sınırsızsa yuva yok
  const yuva = ustSinir > 0 && ustSinir <= EN_COK_YUVA ? ustSinir : gecerli > 0 && gecerli <= EN_COK_YUVA ? gecerli : 0;
  const acik = gecerli > 0 ? Math.min(gecerli, yuva) : yuva;
  const fazla = acik && calisan > acik ? calisan - acik : 0;

  return (
    <div className="tempo" data-belirleyen={tempo.belirleyen}>
      <div className="tempo-ust">
        <span className="tempo-etiket">{t.etiket}</span>
        <span className="tempo-deger">
          {gecerli > 0 ? <b className="sayi">{gecerli}</b> : <b>{t.sinirsiz}</b>}
          {gecerli > 0 ? <span className="tempo-birim">{t.birim(gecerli)}</span> : null}
          {ustSinir > 0 && gecerli !== ustSinir ? <span className="tempo-ust-sinir sayi">{t.ustSinir(ustSinir)}</span> : null}
        </span>
        <span className="tempo-kim">{kim}</span>
      </div>
      {yuva ? (
        <div className="tempo-yuvalar" role="img" aria-label={t.yuvalar(calisan, gecerli || ustSinir, ustSinir)}>
          {Array.from({ length: yuva }, (_, i) => (
            <span key={i} className="tempo-yuva" data-durum={i < Math.min(calisan, acik) ? "dolu" : i < acik ? "bos" : "kapali"} />
          ))}
          {fazla ? <span className="tempo-fazla sayi">+{fazla}</span> : null}
        </div>
      ) : null}
      {tempo.belirleyen === "ceo" && tempo.gerekce ? <p className="tempo-gerekce">{tempo.gerekce}</p> : null}
      <p className="tempo-aciklama">
        {tempo.belirleyen === "ceo" ? t.aciklamaCeo : t.aciklamaKurul}{" "}
        <button type="button" className="metin-dugme" onClick={() => git("ayarlar")}>
          {t.ustSiniriDegistir}
        </button>
      </p>
    </div>
  );
}

/** Kim ne üzerinde: her çalışanın durumu, süren görevi ve kiraladığı dosyalar */
function KimNeUzerinde({ ekip, kiralar }: { ekip: Ajan[]; kiralar: DosyaKirasi[] }) {
  const gorevler = useVeri((d) => d.gorevler);
  const sirali = ekip.slice().sort((a, b) => DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] || a.ad.localeCompare(b.ad));
  return (
    <ul className="ortak-ekip">
      {sirali.map((a) => (
        <CalisanSatiri key={a.id} ajan={a} gorev={surenGorev(a, gorevler)} kiralar={kiralar.filter((k) => k.ajanId === a.id)} />
      ))}
    </ul>
  );
}

function CalisanSatiri({ ajan, gorev, kiralar }: { ajan: Ajan; gorev: Gorev | undefined; kiralar: DosyaKirasi[] }) {
  const s = useSozluk();
  const t = s.ortakCalisma.ekip;
  const [acik, setAcik] = useState(false);
  const listeId = useId();
  const secili = useArayuz((d) => d.ajanId === ajan.id);
  return (
    <li className="ortak-calisan" data-durum={ajan.durum}>
      <button type="button" className="ortak-kisi" aria-pressed={secili} onClick={() => useArayuz.setState({ ajanId: ajan.id })} title={s.ekip.ayrintilari(ajan.ad)}>
        <span className="ortak-av">
          <AjanAvatar ajan={ajan} boyut="s" />
          <DurumNoktasi durum={ajan.durum} />
        </span>
        <span className="ortak-kisi-metin">
          <b className="tek-satir">{ajan.ad}</b>
          <small className="tek-satir">{ajan.rolAdi}</small>
        </span>
      </button>
      <span className="ortak-is">
        {gorev ? (
          <>
            <button type="button" className="gorev-kodu" onClick={() => git("pano", { gorevId: gorev.id })}>
              {gorev.kod}
            </button>
            <span className="ortak-is-baslik">{gorev.baslik}</span>
          </>
        ) : (
          <span className="soluk">{ajan.isAciklamasi || s.genel.ajanDurumu[ajan.durum]}</span>
        )}
      </span>
      {kiralar.length ? (
        <button
          type="button"
          className="ortak-kira-ac"
          aria-expanded={acik}
          aria-controls={listeId}
          aria-label={t.kira(kiralar.length)}
          onClick={() => setAcik(!acik)}
          title={`${t.kira(kiralar.length)} · ${t.kiraIpucu}`}
        >
          <Simge ad="kilit" boyut={12} />
          <span className="sayi">{t.kiraKisa(kiralar.length)}</span>
          <Simge ad="asagi" boyut={11} />
        </button>
      ) : (
        <span className="gizli">{t.kiraYok}</span>
      )}
      {acik && kiralar.length ? (
        <ul className="ortak-kiralar" id={listeId} aria-label={t.dosyalar(ajan.ad)}>
          {kiralar.map((k) => (
            <li key={k.yol}>
              <code>{k.yol}</code>
              {k.gorevKodu && k.gorevKodu !== gorev?.kod ? <span className="gorev-kodu">{k.gorevKodu}</span> : null}
              <small>{t.sonDokunus(goreli(k.son))}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** 0.0.8 geçişinde ortak projeye alınamayıp korunan eski alanlar */
function Kalanlar({ kalanlar }: { kalanlar: EskiCalismaAlani[] }) {
  const s = useSozluk();
  const t = s.ortakCalisma.kalanlar;
  return (
    <div className="ortak-kalanlar" role="note">
      <p className="ortak-kalanlar-baslik">
        <Simge ad="uyari" boyut={13} />
        {t.baslik(kalanlar.length)}
      </p>
      <p className="ortak-kalanlar-metin">{t.aciklama}</p>
      <ul>
        {kalanlar.map((k) => (
          <li key={`${k.ajanAd}-${k.dal ?? ""}-${k.yol ?? ""}`}>
            <b>{k.ajanAd}</b>
            <span className="etiket">{t.neden[k.neden]}</span>
            {k.dal ? <code>{k.dal}</code> : null}
            {k.yol ? <code className="ortak-yol">{k.yol}</code> : null}
            {k.ayrinti ? <span className="soluk">{k.ayrinti}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Görev kayıtları
// ---------------------------------------------------------------------------

/** Kayıt listesi; sayfa verilirse ilk o kadarı, sonra "N kayıt daha". gorevli: görev kodu ve başlığı satırda */
export function KayitListesi({ kayitlar, sayfa, gorevli = true }: { kayitlar: GorevKaydi[]; sayfa?: number; gorevli?: boolean }) {
  const s = useSozluk();
  const [sinir, setSinir] = useState(sayfa ?? kayitlar.length);
  const gosterilen = sayfa ? kayitlar.slice(0, sinir) : kayitlar;
  return (
    <>
      <ol className="kayitlar">
        {gosterilen.map((k) => (
          <KayitSatiri key={k.id} kayit={k} gorevli={gorevli} />
        ))}
      </ol>
      {sayfa && kayitlar.length > sinir ? (
        <div className="tablo-daha">
          <button type="button" className="dugme dugme-kucuk" onClick={() => setSinir((n) => n + sayfa)}>
            {s.ortakCalisma.kayit.dahaGoster(Math.min(sayfa, kayitlar.length - sinir))}
          </button>
          <small className="sayi">
            {sinir} / {kayitlar.length}
          </small>
        </div>
      ) : null}
    </>
  );
}

function KayitSatiri({ kayit: k, gorevli }: { kayit: GorevKaydi; gorevli: boolean }) {
  const s = useSozluk();
  const t = s.ortakCalisma.kayit;
  const q = k.kalite;
  const suren = SUREN.has(q.durum);
  const simdi = useSimdi(suren ? 1000 : 60_000);
  const [ciktiAcik, setCiktiAcik] = useState(false);
  const [farkAcik, setFarkAcik] = useState(false);
  const ciktiId = useId();
  const { suruyor, calistir } = useIslem();
  const testKomutu = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId)?.testKomutu ?? null);
  const ilkKirmizi = useOrtak((d) => (q.kirmiziKayit ? d.kayitlar.find((x) => x.id === q.kirmiziKayit) : undefined));
  const kod = k.gorevKodu ?? k.commit.slice(0, 7);
  const baslik = k.gorevKodu && k.baslik.startsWith(`${k.gorevKodu} `) ? k.baslik.slice(k.gorevKodu.length + 1) : k.baslik;
  const bitti = KAYIT_SON_DURUMLARI.includes(q.durum);
  const yenilenir = bitti && q.durum !== "gecti" && (q.durum !== "testsiz" || !!testKomutu);
  const basladi = Date.parse(q.adimBaslangic ?? q.baslangic ?? "");

  const ayrinti: string[] = [];
  if (q.durum === "kuyrukta" && q.sira) ayrinti.push(t.sirada(q.sira));
  else if (suren && q.komut) ayrinti.push(q.komut);
  else if (q.durum === "gecti") ayrinti.push(t.gecti(q.sureMs));
  else if (q.durum === "testsiz") ayrinti.push(t.testsiz);
  else if (q.durum === "atlandi") ayrinti.push(t.atlandi);
  else if (q.mesaj) ayrinti.push(q.mesaj);

  const yeniden = () =>
    void calistir("yeniden", async () => {
      kayitUygula(await ortakApi.kayitYeniden(k.id));
      bildir("bilgi", sozluk().ortakCalisma.kayit.yenidenBildirim(kod));
    });

  return (
    <li className="kayit" data-durum={q.durum}>
      <div className="kayit-ust">
        <time className="kayit-zaman sayi" dateTime={k.zaman} title={akilliZaman(k.zaman)}>
          {akilliZaman(k.zaman)}
        </time>
        <span className="kayit-ad">
          {gorevli && k.gorevId ? (
            <button type="button" className="gorev-kodu" onClick={() => git("pano", { gorevId: k.gorevId ?? undefined })}>
              {kod}
            </button>
          ) : gorevli ? (
            <span className="gorev-kodu">{kod}</span>
          ) : null}
          {gorevli ? <span className="kayit-baslik">{baslik}</span> : <span className="kayit-neden">{t.neden[k.neden]}</span>}
        </span>
        <span className="kayit-kunye">
          <span className="kayit-kim">{k.ajanAd}</span>
          <code className="kayit-commit">{k.commit.slice(0, 7)}</code>
          <span className="kayit-sayilar sayi">
            <span>{t.dosya(k.dosyalar.length)}</span>
            {k.eklenen ? <span className="onay-eklenen">+{sayi(k.eklenen)}</span> : null}
            {k.silinen ? <span className="onay-silinen">−{sayi(k.silinen)}</span> : null}
          </span>
        </span>
      </div>
      <div className="kayit-alt">
        <p className="kayit-kalite">
          <span className="kayit-isaret" aria-hidden="true">
            {suren ? <span className="doner" /> : <Simge ad={q.durum === "gecti" ? "tamam" : q.durum === "kuyrukta" ? "saat" : q.durum === "testsiz" || q.durum === "atlandi" ? "halka" : "uyari"} boyut={12} />}
          </span>
          <span className="kayit-durum" aria-live="polite">
            {s.ortakCalisma.kalite[q.durum]}
          </span>
          {ayrinti.length ? <span className="kayit-ayrinti">{ayrinti.join(" · ")}</span> : null}
          {suren && !Number.isNaN(basladi) ? (
            <time className="kayit-gecen sayi" dateTime={q.adimBaslangic ?? undefined}>
              {kalanSure(simdi - basladi)}
            </time>
          ) : null}
        </p>
        <span className="kayit-eylemler">
          <button type="button" className="metin-dugme" onClick={() => setFarkAcik(true)} aria-haspopup="dialog">
            {t.fark}
          </button>
          {q.cikti ? (
            <button type="button" className="metin-dugme kayit-cikti-ac" aria-expanded={ciktiAcik} aria-controls={ciktiId} onClick={() => setCiktiAcik(!ciktiAcik)}>
              {t.cikti}
              <Simge ad="asagi" boyut={11} />
            </button>
          ) : null}
          {yenilenir ? (
            <button type="button" className="dugme dugme-kucuk" onClick={yeniden} disabled={suruyor !== null} title={t.yenidenDeneIpucu}>
              {suruyor === "yeniden" ? <span className="doner" aria-hidden="true" /> : <Simge ad="yenile" boyut={12} />}
              {t.yenidenDene}
            </button>
          ) : null}
        </span>
      </div>
      {(q.durum === "kaldi" || q.durum === "zaman_asimi") && k.ajanAd ? (
        <p className="kayit-not">{q.kirmiziKayit ? t.kirmizi(ilkKirmizi?.gorevKodu ?? null) : t.sahibeIletildi(k.ajanAd)}</p>
      ) : null}
      {ciktiAcik && q.cikti ? <Cikti id={ciktiId} metin={q.cikti} etiket={t.ciktiEtiket(q.komut ?? t.cikti)} canli={suren} /> : null}
      {farkAcik ? (
        <FarkCekmecesi
          baslik={t.farkBaslik(kod, k.commit.slice(0, 7))}
          anahtar={k.id}
          getir={() => ortakApi.kayitFarki(k.id)}
          bosMetin={t.farkYok}
          kapat={() => setFarkAcik(false)}
        />
      ) : null}
    </li>
  );
}

/** Görev çekmecesindeki kayıtlar: görevin commit'leri ve denetimleri (projenin son 60 kaydından) */
export function GorevKayitlari({ gorevId }: { gorevId: string }) {
  const s = useSozluk();
  const t = s.ortakCalisma.gorev;
  const { kayitlar } = useOrtakCalisma();
  const liste = kayitlar.filter((k) => k.gorevId === gorevId);
  return (
    <section className="gorev-kayitlari" aria-labelledby={`gk-${gorevId}`}>
      <h3 id={`gk-${gorevId}`}>
        {t.baslik} <small className="sayi">{liste.length || null}</small>
      </h3>
      {liste.length ? <KayitListesi kayitlar={liste} gorevli={false} /> : <p className="alan-ipucu">{t.yok}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ajan ayrıntısı: çalıştığı yer, kiraladığı dosyalar, geçişten kalan alanı
// ---------------------------------------------------------------------------

/** Tanım listesinin (dl.kv) satırları */
export function AjanOrtakSatirlari({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const t = s.ortakCalisma.ajan;
  const { kiralar, kalanlar } = useOrtakCalisma();
  const dal = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId)?.varsayilanDal ?? "main");
  const benim = kiralar.filter((k) => k.ajanId === ajan.id);
  const kalan = kalanlar.find((k) => k.ajanAd === ajan.ad);
  const GOSTERILEN = 6;
  return (
    <>
      <dt>{t.calistigiYer}</dt>
      <dd>
        {ajan.calismaAlani ? (
          <code>{ajan.calismaAlani}</code>
        ) : (
          <>
            {t.ortakProje} · <code>{dal}</code>
          </>
        )}
      </dd>
      <dt>{t.kiraladigi}</dt>
      <dd>
        {benim.length ? (
          <ul className="ajan-kiralar">
            {benim.slice(0, GOSTERILEN).map((k) => (
              <li key={k.yol}>
                <code>{k.yol}</code>
              </li>
            ))}
            {benim.length > GOSTERILEN ? <li className="soluk">{t.dahaFazla(benim.length - GOSTERILEN)}</li> : null}
          </ul>
        ) : (
          <span className="soluk">{t.yok}</span>
        )}
      </dd>
      {kalan ? (
        <>
          <dt>{t.eskiAlan}</dt>
          <dd>
            {kalan.yol ? <code>{kalan.yol}</code> : kalan.dal ? <code>{kalan.dal}</code> : null}{" "}
            <span className="soluk">{kalan.ayrinti || s.ortakCalisma.kalanlar.neden[kalan.neden]}</span>
          </dd>
        </>
      ) : null}
    </>
  );
}
