// Kod zekâsı: anlamsal kod araması, semboller, depo haritası ve modül bağımlılık grafiği.
// Ajanlar kod_ara, sembol_bul, kod_haritasi, bagimliliklar ve benzer_kod araçlarıyla aynı dizini kullanır.
import {
  KOD_SEMBOL_TURU_ADLARI,
  type CalismaAlani,
  type KodAramaSonucu,
  type KodAramaYaniti,
  type KodBagimliliklari,
  type KodDizinDurumu,
  type KodEslesmeTuru,
  type KodGrafigi,
  type KodHaritaDugumu,
  type KodSembolTuru,
  type KodSembolu,
} from "@arnorg/ortak";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet, Yukleniyor } from "../bilesenler/Durumlar";
import { Simge } from "../bilesenler/Simge";
import { git, hataBildir } from "../durum/arayuz";
import { dizinSuruyor, kodAlaniSec, kodDurumlariniYukle, useKodZekasi } from "../durum/kodZekasi";
import { useVeri } from "../durum/veri";
import { tezgahtaAc } from "../tezgah";
import { goreli, sayi } from "../yardimcilar/bicim";

type Sekme = "arama" | "semboller" | "harita" | "grafik";

const ESLESME_ADLARI: Record<KodEslesmeTuru, string> = {
  anlamsal: "anlamsal",
  sozcuk: "anahtar sözcük",
  sembol: "sembol adı",
  karma: "birden çok yöntem",
};

const ORNEK_SORGULAR = ["hata nasıl yakalanıp kaydediliyor", "kimlik doğrulama ve oturum", "veritabanı bağlantısı nerede kuruluyor"];

/** Dosyayı Kod ekranının düzenleyicisinde açar (satır verilirse orada) */
function koddaAc(projeId: string, alan: string, yol: string, satir?: number) {
  git("kod");
  tezgahtaAc({ projeId, alan, yol }, satir).catch(hataBildir);
}

/** Modelin okunur adı: "onnx-community/embeddinggemma-300m-ONNX@q8" → "embeddinggemma-300m" */
function modelAdi(model: string | null): string {
  if (!model) return "Kapalı";
  const ad = model.split("@")[0]!.split("/").pop() ?? model;
  return ad.replace(/-ONNX$/i, "");
}

function yolParcalari(yol: string): { klasor: string; ad: string } {
  const i = yol.lastIndexOf("/");
  return i < 0 ? { klasor: "", ad: yol } : { klasor: yol.slice(0, i + 1), ad: yol.slice(i + 1) };
}

// ---------------------------------------------------------------------------
// Ekran
// ---------------------------------------------------------------------------

export function KodZekasi() {
  const pid = useVeri((d) => d.aktifProjeId);
  const ajanlar = useVeri((d) => d.ajanlar);
  const alan = useKodZekasi((d) => d.alan);
  const durum = useKodZekasi((d) => d.durumlar[d.alan]);
  const [alanlar, setAlanlar] = useState<CalismaAlani[]>([]);
  const [sekme, setSekme] = useState<Sekme>("arama");
  const [hata, setHata] = useState<string | null>(null);
  const [dizinleniyor, setDizinleniyor] = useState(false);

  useEffect(() => {
    if (!pid) return;
    let iptal = false;
    setHata(null);
    kodDurumlariniYukle(pid).catch((e) => !iptal && setHata(hataMetni(e)));
    api
      .calismaAlanlari(pid)
      .then((l) => {
        if (iptal) return;
        setAlanlar(l);
        if (!l.some((a) => a.kimlik === useKodZekasi.getState().alan)) kodAlaniSec("ana");
      })
      .catch(() => undefined);
    return () => {
      iptal = true;
    };
  }, [pid]);

  const alanAdi = (a: CalismaAlani) => (a.ana ? "Ana repo" : (ajanlar.find((x) => x.id === a.ajanId)?.ad ?? a.kimlik));

  const dizinle = async (sifirdan = false) => {
    if (!pid) return;
    setDizinleniyor(true);
    try {
      await api.kodDizinle(pid, alan, sifirdan);
    } catch (e) {
      hataBildir(e);
    } finally {
      setDizinleniyor(false);
    }
  };

  if (!pid) return null;
  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>Kod zekâsı</h1>
          <p>Anlamsal kod araması, semboller, depo haritası ve bağımlılık grafiği · ajanlar aynı dizinle çalışır</p>
        </div>
        <div className="baslik-eylem kz-eylem">
          <select className="girdi suzgec-secim" aria-label="Çalışma alanı" value={alan} onChange={(e) => kodAlaniSec(e.target.value)}>
            {(alanlar.length ? alanlar : [{ kimlik: "ana", ana: true } as CalismaAlani]).map((a) => (
              <option key={a.kimlik} value={a.kimlik}>
                {alanAdi(a)}
              </option>
            ))}
          </select>
          <button type="button" className="dugme" disabled={dizinleniyor || dizinSuruyor(durum)} onClick={() => void dizinle(false)} title="Değişen dosyaları yeniden okur">
            <Simge ad="yenile" />
            Yeniden dizinle
          </button>
        </div>
      </div>

      {hata ? <HataKutu metin={hata} yeniden={() => void kodDurumlariniYukle(pid).catch((e) => setHata(hataMetni(e)))} /> : null}
      <DizinOzeti durum={durum} sifirdan={() => void dizinle(true)} />

      <div className="bolumlu kz-sekmeler" role="group" aria-label="Kod zekâsı bölümü">
        {(
          [
            ["arama", "Arama"],
            ["semboller", "Semboller"],
            ["harita", "Harita"],
            ["grafik", "Grafik"],
          ] as [Sekme, string][]
        ).map(([s, ad]) => (
          <button key={s} type="button" aria-pressed={sekme === s} onClick={() => setSekme(s)}>
            {ad}
          </button>
        ))}
      </div>

      {sekme === "arama" ? (
        <Arama key={alan} pid={pid} alan={alan} durum={durum} />
      ) : sekme === "semboller" ? (
        <Semboller key={alan} pid={pid} alan={alan} />
      ) : sekme === "harita" ? (
        <Harita key={alan} pid={pid} alan={alan} surum={durum?.sonGuncelleme ?? null} />
      ) : (
        <Grafik key={alan} pid={pid} alan={alan} surum={durum?.sonGuncelleme ?? null} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dizin özeti ve ilerleme
// ---------------------------------------------------------------------------

/** Gömme hızından kalan süre: ilk gözlemden bu yana gömülen parça / geçen süre */
function useKalanSure(d: KodDizinDurumu | undefined): number | null {
  const ilk = useRef<{ anahtar: string; gomulen: number; zaman: number } | null>(null);
  if (!d || d.durum !== "gomuluyor") {
    ilk.current = null;
    return null;
  }
  const anahtar = `${d.alan}:${d.model}`;
  const simdi = Date.now();
  if (!ilk.current || ilk.current.anahtar !== anahtar || d.gomulen < ilk.current.gomulen) ilk.current = { anahtar, gomulen: d.gomulen, zaman: simdi };
  const gecen = (simdi - ilk.current.zaman) / 1000;
  const yapilan = d.gomulen - ilk.current.gomulen;
  if (gecen < 8 || yapilan <= 0) return null;
  return ((d.toplamParca - d.gomulen) / yapilan) * gecen;
}

function sureMetni(sn: number): string {
  if (sn < 90) return "1 dakikadan az";
  if (sn < 3600) return `~${Math.round(sn / 60)} dk`;
  return `~${Math.floor(sn / 3600)} sa ${Math.round((sn % 3600) / 60)} dk`;
}

function DizinOzeti({ durum, sifirdan }: { durum: KodDizinDurumu | undefined; sifirdan: () => void }) {
  const d = durum;
  const gomuluYuzde = d && d.toplamParca ? Math.round((d.gomulen / d.toplamParca) * 100) : 0;
  const kalan = useKalanSure(d);
  const ilerleme = (() => {
    if (!d) return null;
    switch (d.durum) {
      case "taraniyor":
        return { metin: `Dosyalar taranıyor${d.toplamDosya ? ` · ${sayi(d.taranan ?? 0)}/${sayi(d.toplamDosya)}` : ""}`, oran: d.toplamDosya ? (d.taranan ?? 0) / d.toplamDosya : null };
      case "model-indiriliyor":
        return { metin: `Anlamsal arama modeli indiriliyor · %${d.indirmeYuzde ?? 0} (yalnız ilk kez)`, oran: (d.indirmeYuzde ?? 0) / 100 };
      case "gomuluyor": {
        const sure = kalan !== null ? ` · kalan ${sureMetni(kalan)}` : "";
        // Uzun sürecekse daha hızlı model önerilir (yalnız kaliteli modelde)
        const oneri = kalan !== null && kalan > 20 * 60 && d.model?.includes("embeddinggemma") ? " · Ayarlar → Kod zekâsı → Hızlı ile birkaç kat kısa sürer" : "";
        return {
          metin: `Anlamsal dizin kuruluyor · ${sayi(d.gomulen)}/${sayi(d.toplamParca)} parça${sure}; anahtar sözcük araması şimdiden çalışır${oneri}`,
          oran: d.toplamParca ? d.gomulen / d.toplamParca : null,
        };
      }
      default:
        return null;
    }
  })();

  return (
    <>
      <dl className="kz-ozet" aria-label="Dizin özeti">
        <div>
          <dt>Dosya</dt>
          <dd className="sayi">{d ? sayi(d.dosya) : "—"}</dd>
        </div>
        <div>
          <dt>Sembol</dt>
          <dd className="sayi">{d ? sayi(d.sembol) : "—"}</dd>
        </div>
        <div>
          <dt>Parça</dt>
          <dd className="sayi">{d ? sayi(d.parca) : "—"}</dd>
        </div>
        <div title="Vektörü hesaplanmış parçalar">
          <dt>Anlamsal</dt>
          <dd className="sayi">{d?.model ? `%${gomuluYuzde}` : "—"}</dd>
        </div>
        <div className="kz-ozet-model">
          <dt>Model</dt>
          <dd>
            <span>{d ? modelAdi(d.model) : "—"}</span>
            <small>{d?.sonGuncelleme ? `güncellendi ${goreli(d.sonGuncelleme)}` : d?.durum === "bos" ? "henüz dizinlenmedi" : ""}</small>
          </dd>
        </div>
      </dl>
      {ilerleme ? (
        <div className="kz-ilerleme" role="status">
          <span>
            <span className="doner" aria-hidden="true" />
            {ilerleme.metin}
          </span>
          {ilerleme.oran !== null ? (
            <span className="kz-ilerleme-cubuk" aria-hidden="true">
              <span style={{ width: `${Math.max(2, Math.min(100, ilerleme.oran * 100))}%` }} />
            </span>
          ) : null}
        </div>
      ) : null}
      {d?.durum === "hata" ? (
        <div className="hata-kutu kz-hata" role="alert">
          <b>Dizin hatası</b>
          <span>{d.hata}</span>
          <span>Anahtar sözcük araması çalışmaya devam eder.</span>
          <button type="button" className="dugme dugme-kucuk" onClick={sifirdan}>
            Sıfırdan dizinle
          </button>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kod kesiti: satır numaralı, sorgu terimleri vurgulu
// ---------------------------------------------------------------------------

const HARF_ESLERI: Record<string, string> = { i: "[iıİI]", ı: "[iıİI]", s: "[sşSŞ]", ş: "[sşSŞ]", g: "[gğGĞ]", ğ: "[gğGĞ]", u: "[uüUÜ]", ü: "[uüUÜ]", o: "[oöOÖ]", ö: "[oöOÖ]", c: "[cçCÇ]", ç: "[cçCÇ]" };

/** Sorgu terimlerinden, Türkçe harf farklarına duyarsız vurgu ifadesi */
function vurguIfadesi(sorgu: string): RegExp | null {
  const terimler = [...new Set(sorgu.toLocaleLowerCase("tr").match(/[\p{L}\p{N}_]{3,}/gu) ?? [])].slice(0, 12);
  if (!terimler.length) return null;
  const desen = terimler
    .sort((a, b) => b.length - a.length)
    .map((t) => [...t].map((h) => HARF_ESLERI[h] ?? h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(""))
    .join("|");
  return new RegExp(`(${desen})`, "giu");
}

function vurgula(satir: string, ifade: RegExp | null): ReactNode {
  if (!ifade || !satir) return satir || " ";
  const parcalar = satir.split(ifade);
  return parcalar.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

function Kesit({ kesit, bas, ifade }: { kesit: string; bas: number; ifade: RegExp | null }) {
  const satirlar = kesit.split("\n");
  return (
    <pre className="kz-kesit" tabIndex={0}>
      <code>
        {satirlar.map((s, i) => (
          <span className="kz-satir" key={i}>
            <span className="kz-no" aria-hidden="true">
              {bas + i}
            </span>
            <span className="kz-kod">{vurgula(s, ifade)}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Arama
// ---------------------------------------------------------------------------

function Arama({ pid, alan, durum }: { pid: string; alan: string; durum: KodDizinDurumu | undefined }) {
  const [q, setQ] = useState("");
  const [yol, setYol] = useState("");
  const [yanit, setYanit] = useState<KodAramaYaniti | null>(null);
  const [benzerKaynak, setBenzerKaynak] = useState<{ yol: string; satir: number } | null>(null);
  const [araniyor, setAraniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const girdiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    girdiRef.current?.focus();
  }, []);

  useEffect(() => {
    if (benzerKaynak) return;
    const sorgu = q.trim();
    if (sorgu.length < 2) {
      setYanit(null);
      setAraniyor(false);
      setHata(null);
      return;
    }
    const iptal = new AbortController();
    setAraniyor(true);
    const z = setTimeout(() => {
      api
        .kodAra(pid, alan, sorgu, { sinir: 20, yol: yol.trim() || undefined }, iptal.signal)
        .then((y) => {
          setYanit(y);
          setHata(null);
        })
        .catch((e) => {
          if (!iptal.signal.aborted) setHata(hataMetni(e));
        })
        .finally(() => !iptal.signal.aborted && setAraniyor(false));
    }, 250);
    return () => {
      clearTimeout(z);
      iptal.abort();
    };
    // Dizin hazır olunca aynı sorgu yenilenir (anlamsal sonuçlar gelir)
  }, [q, yol, pid, alan, benzerKaynak, durum?.durum === "hazir"]);

  const benzerleriBul = (r: KodAramaSonucu) => {
    const kaynak = { yol: r.yol, satir: r.bas };
    setBenzerKaynak(kaynak);
    setAraniyor(true);
    api
      .kodBenzer(pid, alan, kaynak.yol, kaynak.satir)
      .then((y) => {
        setYanit(y);
        setHata(null);
      })
      .catch((e) => setHata(hataMetni(e)))
      .finally(() => setAraniyor(false));
  };

  const ifade = useMemo(() => (benzerKaynak ? null : vurguIfadesi(q)), [q, benzerKaynak]);

  return (
    <section aria-label="Kod araması">
      <div className="kz-arama">
        <div className="arama-kutu kz-arama-kutu">
          <Simge ad="ara" boyut={15} />
          <input
            ref={girdiRef}
            className="girdi"
            type="search"
            aria-label="Kodda ara"
            placeholder="Ne arıyorsun? Türkçe ya da İngilizce sor: “sipariş durumu nerede değişiyor”"
            value={q}
            onChange={(e) => {
              setBenzerKaynak(null);
              setQ(e.target.value);
            }}
          />
        </div>
        <input
          className="girdi kz-yol-suzgec"
          aria-label="Yol süzgeci"
          placeholder="Yol ya da glob: src/sunucu, **/*.tsx"
          value={yol}
          onChange={(e) => {
            setBenzerKaynak(null);
            setYol(e.target.value);
          }}
        />
      </div>

      {benzerKaynak ? (
        <div className="kz-bilgi">
          <span>
            <b>
              {benzerKaynak.yol}:{benzerKaynak.satir}
            </b>{" "}
            koduna en çok benzeyen yerler
          </span>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setBenzerKaynak(null)}>
            Aramaya dön
          </button>
        </div>
      ) : null}

      {hata ? <HataKutu baslik="Aranamadı" metin={hata} /> : null}
      {araniyor && !yanit ? <Yukleniyor metin="Aranıyor…" /> : null}

      {yanit ? (
        <>
          <div className="kz-sonuc-ust" role="status">
            {araniyor ? <Yukleniyor metin="Aranıyor…" /> : <span>{yanit.sonuclar.length ? `${yanit.sonuclar.length} sonuç · ${yanit.sureMs} ms` : "Sonuç yok"}</span>}
            {yanit.yalnizSozcuk ? (
              <span className="kz-uyari">
                {durum?.model ? "Anlamsal dizin henüz hazır değil; anahtar sözcükle bulundu." : "Anlamsal arama kapalı (Ayarlar → Kod zekâsı); anahtar sözcükle bulundu."}
              </span>
            ) : null}
          </div>
          {yanit.sonuclar.length ? (
            <ol className="kz-sonuclar">
              {yanit.sonuclar.map((r) => (
                <SonucSatiri key={`${r.yol}:${r.bas}`} r={r} ifade={ifade} ac={() => koddaAc(pid, alan, r.yol, r.kesitBas)} benzer={() => benzerleriBul(r)} />
              ))}
            </ol>
          ) : (
            <Bos kucuk baslik="Eşleşen kod yok">Başka sözcüklerle deneyin, yol süzgecini kaldırın ya da Semboller sekmesinde adıyla arayın.</Bos>
          )}
        </>
      ) : !araniyor && !hata ? (
        <div className="kz-bos">
          <p>Doğal dille sorun: anlamsal arama, anahtar sözcük ve sembol adları birleşir. Sonuca tıklayınca dosya Kod ekranında o satırda açılır.</p>
          <div className="kz-ornekler">
            {ORNEK_SORGULAR.map((o) => (
              <button key={o} type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setQ(o)}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SonucSatiri({ r, ifade, ac, benzer }: { r: KodAramaSonucu; ifade: RegExp | null; ac: () => void; benzer: () => void }) {
  const { klasor, ad } = yolParcalari(r.yol);
  return (
    <li className="kz-sonuc">
      <div className="kz-sonuc-baslik">
        <button type="button" className="kz-yol" onClick={ac} title="Kod ekranında aç">
          <span className="soluk">{klasor}</span>
          <b>{ad}</b>
          <span className="soluk">
            :{r.bas}–{r.bit}
          </span>
        </button>
        {r.sembol ? (
          <span className="kz-sembol">
            {r.sembol}
            {r.sembolTuru ? <small>{KOD_SEMBOL_TURU_ADLARI[r.sembolTuru]}</small> : null}
          </span>
        ) : null}
        <span className="kz-sonuc-sag">
          <span className="kz-eslesme" title="Bu sonucu bulan yöntem">
            {ESLESME_ADLARI[r.eslesme]}
          </span>
          <span className="kz-puan" title={`Puan ${r.puan.toFixed(2)}`} aria-label={`Puan ${r.puan.toFixed(2)}`}>
            <span style={{ width: `${Math.max(4, r.puan * 100)}%` }} />
          </span>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={benzer} title="Bu koda benzeyen yerleri bul">
            Benzerleri
          </button>
        </span>
      </div>
      <button type="button" className="kz-kesit-dugme" onClick={ac} aria-label={`${r.yol} ${r.kesitBas}. satırda aç`}>
        <Kesit kesit={r.kesit} bas={r.kesitBas} ifade={ifade} />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Semboller
// ---------------------------------------------------------------------------

function Semboller({ pid, alan }: { pid: string; alan: string }) {
  const [q, setQ] = useState("");
  const [tur, setTur] = useState<KodSembolTuru | "">("");
  const [liste, setListe] = useState<KodSembolu[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const iptal = new AbortController();
    const z = setTimeout(() => {
      api
        .kodSemboller(pid, alan, q.trim(), tur || undefined, iptal.signal)
        .then((l) => {
          setListe(l);
          setHata(null);
        })
        .catch((e) => !iptal.signal.aborted && setHata(hataMetni(e)));
    }, 200);
    return () => {
      clearTimeout(z);
      iptal.abort();
    };
  }, [q, tur, pid, alan]);

  return (
    <section aria-label="Semboller">
      <div className="suzgec">
        <div className="arama-kutu">
          <Simge ad="ara" boyut={13} />
          <input className="girdi" type="search" aria-label="Sembol ara" placeholder="Ad ya da başı: siparis, Depo, useAuth" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="girdi suzgec-secim" aria-label="Sembol türü" value={tur} onChange={(e) => setTur(e.target.value as KodSembolTuru | "")}>
          <option value="">Tüm türler</option>
          {(Object.keys(KOD_SEMBOL_TURU_ADLARI) as KodSembolTuru[]).map((t) => (
            <option key={t} value={t}>
              {KOD_SEMBOL_TURU_ADLARI[t]}
            </option>
          ))}
        </select>
        {liste ? (
          <span className="alan-ipucu" role="status">
            {liste.length >= 200 ? "200+ sembol" : `${liste.length} sembol`}
            {q.trim() ? "" : " · öne çıkanlar"}
          </span>
        ) : null}
      </div>
      {hata ? <HataKutu metin={hata} /> : null}
      {!liste && !hata ? <Iskelet satir={6} etiket="Semboller yükleniyor" /> : null}
      {liste?.length ? (
        <ul className="kz-semboller">
          {liste.map((s) => (
            <li key={`${s.yol}:${s.bas}:${s.ad}`}>
              <button type="button" onClick={() => koddaAc(pid, alan, s.yol, s.bas)} title="Kod ekranında aç">
                <span className="kz-sembol-ad">
                  {s.ust ? <span className="soluk">{s.ust}.</span> : null}
                  <b>{s.ad}</b>
                </span>
                <span className="kz-etiket">{KOD_SEMBOL_TURU_ADLARI[s.tur]}</span>
                {s.disaAcik ? <span className="kz-etiket kz-etiket-disa">dışa açık</span> : null}
                <span className="kz-sembol-yol soluk">
                  {s.yol}:{s.bas}
                </span>
                <code className="kz-imza">{s.imza}</code>
              </button>
            </li>
          ))}
        </ul>
      ) : liste ? (
        <Bos kucuk baslik="Sembol bulunamadı">Adın bir kısmıyla ya da Arama sekmesinde doğal dille deneyin.</Bos>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Harita: klasör ağacı ve dosya paneli
// ---------------------------------------------------------------------------

function Harita({ pid, alan, surum }: { pid: string; alan: string; surum: string | null }) {
  const [kok, setKok] = useState<KodHaritaDugumu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<Set<string>>(new Set());
  const [secili, setSecili] = useState<KodHaritaDugumu | null>(null);

  useEffect(() => {
    let iptal = false;
    api
      .kodHaritasi(pid, alan)
      .then((k) => {
        if (iptal) return;
        setKok(k);
        setHata(null);
        // İlk açılışta en üst düzey klasörler açık
        setAcik((a) => (a.size ? a : new Set((k.cocuklar ?? []).filter((c) => c.tur === "klasor").map((c) => c.yol))));
      })
      .catch((e) => !iptal && setHata(hataMetni(e)));
    return () => {
      iptal = true;
    };
  }, [pid, alan, surum]);

  const dosyaBul = (yol: string): KodHaritaDugumu | null => {
    const ara = (d: KodHaritaDugumu): KodHaritaDugumu | null => {
      if (d.tur === "dosya") return d.yol === yol ? d : null;
      for (const c of d.cocuklar ?? []) {
        if (c.tur === "klasor" && !yol.startsWith(`${c.yol}/`)) continue;
        const b = ara(c);
        if (b) return b;
      }
      return null;
    };
    return kok ? ara(kok) : null;
  };

  const dosyaSec = (yol: string) => {
    const d = dosyaBul(yol);
    if (!d) return;
    setSecili(d);
    // Seçilen dosyanın üst klasörleri açılır
    setAcik((a) => {
      const yeni = new Set(a);
      const p = yol.split("/");
      for (let i = 1; i < p.length; i++) yeni.add(p.slice(0, i).join("/"));
      return yeni;
    });
  };

  if (hata) return <HataKutu metin={hata} />;
  if (!kok) return <Iskelet satir={8} etiket="Harita yükleniyor" />;
  if (!kok.cocuklar?.length) return <Bos kucuk baslik="Dizin boş">Dizinleme bitince dosyalar burada görünür.</Bos>;

  const satirlar: ReactNode[] = [];
  const ciz = (d: KodHaritaDugumu, derinlik: number) => {
    for (const c of d.cocuklar ?? []) {
      const girinti = { paddingLeft: `calc(${derinlik} * var(--kz-girinti))` };
      if (c.tur === "klasor") {
        const ac = acik.has(c.yol);
        satirlar.push(
          <li key={c.yol}>
            <button
              type="button"
              className="kz-agac-satir kz-agac-klasor"
              style={girinti}
              aria-expanded={ac}
              onClick={() =>
                setAcik((a) => {
                  const yeni = new Set(a);
                  if (ac) yeni.delete(c.yol);
                  else yeni.add(c.yol);
                  return yeni;
                })
              }
            >
              <span className="kz-ok" aria-hidden="true">
                {ac ? "▾" : "▸"}
              </span>
              <b>{c.ad}/</b>
              <span className="kz-agac-bilgi soluk">
                {sayi(c.dosyaSayisi ?? 0)} dosya · {sayi(c.satir)} satır
              </span>
            </button>
          </li>,
        );
        if (ac) ciz(c, derinlik + 1);
      } else {
        satirlar.push(
          <li key={c.yol}>
            <button type="button" className="kz-agac-satir" style={girinti} aria-pressed={secili?.yol === c.yol} onClick={() => setSecili(c)}>
              <span className="kz-ok" aria-hidden="true" />
              <span className="kz-agac-ad">{c.ad}</span>
              <span className="kz-agac-semboller soluk">
                {(c.semboller ?? [])
                  .slice(0, 3)
                  .map((s) => s.ad)
                  .join(", ")}
              </span>
              <span className="kz-agac-bilgi soluk">
                {c.iceAktaran ? <span title="Bu dosyayı içe aktaran dosya sayısı">↙{c.iceAktaran} · </span> : null}
                {sayi(c.satir)}
              </span>
            </button>
          </li>,
        );
      }
    }
  };
  ciz(kok, 0);

  return (
    <div className="kz-iki-sutun">
      <section aria-label="Klasör ağacı" className="kz-agac-kap">
        <div className="kz-agac-ust soluk">
          {sayi(kok.dosyaSayisi ?? 0)} dosya · {sayi(kok.satir)} satır
          <span className="kz-agac-eylem">
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setAcik(new Set())}>
              Tümünü kapat
            </button>
          </span>
        </div>
        <ul className="kz-agac">{satirlar}</ul>
      </section>
      <DosyaPaneli pid={pid} alan={alan} dosya={secili} sec={dosyaSec} />
    </div>
  );
}

function DosyaPaneli({ pid, alan, dosya, sec }: { pid: string; alan: string; dosya: KodHaritaDugumu | null; sec: (yol: string) => void }) {
  const [bag, setBag] = useState<KodBagimliliklari | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    setBag(null);
    setHata(null);
    if (!dosya) return;
    let iptal = false;
    api
      .kodBagimliliklari(pid, alan, dosya.yol)
      .then((b) => !iptal && setBag(b))
      .catch((e) => !iptal && setHata(hataMetni(e)));
    return () => {
      iptal = true;
    };
  }, [pid, alan, dosya]);

  if (!dosya)
    return (
      <aside className="kz-panel kz-panel-bos" aria-label="Dosya ayrıntısı">
        <p className="soluk">Bir dosya seçin: sembolleri, içe aktardıkları ve onu kullananlar burada görünür.</p>
      </aside>
    );
  return (
    <aside className="kz-panel" aria-label="Dosya ayrıntısı">
      <div className="kz-panel-baslik">
        <b className="kz-panel-yol">{dosya.yol}</b>
        <span className="soluk">
          {dosya.dil} · {sayi(dosya.satir)} satır
        </span>
        <button type="button" className="dugme dugme-kucuk" onClick={() => koddaAc(pid, alan, dosya.yol)}>
          Kod'da aç
        </button>
      </div>
      {dosya.semboller?.length ? (
        <>
          <h3 className="kz-panel-alt">Öne çıkan semboller</h3>
          <ul className="kz-panel-liste">
            {dosya.semboller.map((s) => (
              <li key={`${s.ad}:${s.bas}`}>
                <button type="button" onClick={() => koddaAc(pid, alan, dosya.yol, s.bas)}>
                  <b>{s.ad}</b> <span className="soluk">{KOD_SEMBOL_TURU_ADLARI[s.tur]} · satır {s.bas}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {hata ? <HataKutu metin={hata} /> : null}
      {!bag && !hata ? <Yukleniyor metin="Bağımlılıklar…" /> : null}
      {bag ? (
        <>
          <h3 className="kz-panel-alt">İçe aktardıkları · {bag.iceAktardiklari.length}</h3>
          {bag.iceAktardiklari.length ? (
            <ul className="kz-panel-liste">
              {bag.iceAktardiklari.map((i) => (
                <li key={`${i.kaynak}:${i.satir}`}>
                  {i.yol ? (
                    <button type="button" onClick={() => sec(i.yol!)}>
                      {i.yol} <span className="soluk">satır {i.satir}</span>
                    </button>
                  ) : (
                    <span className="soluk">
                      {i.kaynak} <small>{i.kaynak.startsWith(".") ? "bulunamadı" : "dış paket"}</small>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="soluk kz-panel-not">İçe aktarma yok.</p>
          )}
          <h3 className="kz-panel-alt">Onu kullananlar · {bag.iceAktaranlar.length}</h3>
          {bag.iceAktaranlar.length ? (
            <ul className="kz-panel-liste">
              {bag.iceAktaranlar.map((i) => (
                <li key={`${i.yol}:${i.satir}`}>
                  <button type="button" onClick={() => sec(i.yol)}>
                    {i.yol} <span className="soluk">satır {i.satir}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="soluk kz-panel-not">Bu dosyayı içe aktaran yok.</p>
          )}
        </>
      ) : null}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Grafik: modül bağımlılık grafiği (d3-force yerleşimi, SVG)
// ---------------------------------------------------------------------------

interface Dugum extends SimulationNodeDatum {
  id: string;
  dil: string;
  satir: number;
  dosya: number;
  r: number;
}

interface Kenar extends SimulationLinkDatum<Dugum> {
  agirlik: number;
}

function etiket(id: string, duzey: "klasor" | "dosya"): string {
  if (id === ".") return "kök";
  const p = id.split("/");
  return duzey === "dosya" ? p[p.length - 1]! : p.slice(-2).join("/");
}

function Grafik({ pid, alan, surum }: { pid: string; alan: string; surum: string | null }) {
  const [duzey, setDuzey] = useState<"klasor" | "dosya">("klasor");
  const [grafik, setGrafik] = useState<KodGrafigi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [uzerinde, setUzerinde] = useState<string | null>(null);
  const [, setKare] = useState(0);
  const [boyut, setBoyut] = useState({ en: 800, boy: 560 });
  const [gorunum, setGorunum] = useState({ x: 0, y: 0, k: 1 });
  const kapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<Dugum, Kenar> | null>(null);
  const veriRef = useRef<{ dugumler: Dugum[]; kenarlar: Kenar[] }>({ dugumler: [], kenarlar: [] });
  const surukleRef = useRef<{ tur: "dugum"; dugum: Dugum; id: number; x: number; y: number } | { tur: "kaydir"; x: number; y: number; gx: number; gy: number; id: number } | null>(null);
  /** Kullanıcı kaydırdı ya da yakınlaştırdıysa kap boyu değişince yeniden sığdırılmaz */
  const elleRef = useRef(false);
  const boyutRef = useRef(boyut);
  boyutRef.current = boyut;

  /** Bütün düğümler kaba sığacak biçimde ortalar */
  const sigdir = () => {
    const { dugumler } = veriRef.current;
    if (!dugumler.length) return;
    const { en, boy } = boyutRef.current;
    const xs = dugumler.map((d) => d.x ?? 0);
    const ys = dugumler.map((d) => d.y ?? 0);
    const pay = 40 + Math.max(...dugumler.map((d) => d.r));
    const minX = Math.min(...xs) - pay;
    const maxX = Math.max(...xs) + pay;
    const minY = Math.min(...ys) - pay;
    const maxY = Math.max(...ys) + pay + 14;
    const k = Math.min(1.6, Math.max(0.15, Math.min(en / Math.max(1, maxX - minX), boy / Math.max(1, maxY - minY))));
    setGorunum({ k, x: en / 2 - ((minX + maxX) / 2) * k, y: boy / 2 - ((minY + maxY) / 2) * k });
  };

  useEffect(() => {
    let iptal = false;
    setGrafik(null);
    setSecili(null);
    api
      .kodGrafigi(pid, alan, duzey)
      .then((g) => {
        if (iptal) return;
        setGrafik(g);
        setHata(null);
      })
      .catch((e) => !iptal && setHata(hataMetni(e)));
    return () => {
      iptal = true;
    };
  }, [pid, alan, duzey, surum]);

  // Kap genişliği: dar ekranda grafik de daralır
  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return;
    const gozlemci = new ResizeObserver(() => {
      const en = Math.max(280, kap.clientWidth);
      setBoyut({ en, boy: Math.round(Math.min(640, Math.max(360, en * 0.62))) });
    });
    gozlemci.observe(kap);
    return () => gozlemci.disconnect();
  }, [grafik !== null]);

  // Kuvvet yerleşimi: önce eşzamanlı ısınma, sonra sürüklemede canlı
  useEffect(() => {
    simRef.current?.stop();
    if (!grafik) return;
    const enCokSatir = Math.max(1, ...grafik.dugumler.map((d) => d.satir));
    const dugumler: Dugum[] = grafik.dugumler.map((d, i) => {
      const aci = (i / Math.max(1, grafik.dugumler.length)) * Math.PI * 2;
      return { ...d, r: 4 + Math.sqrt(d.satir / enCokSatir) * 20, x: Math.cos(aci) * 150, y: Math.sin(aci) * 150 };
    });
    const indeks = new Map(dugumler.map((d) => [d.id, d]));
    const kenarlar: Kenar[] = grafik.kenarlar.filter((k) => indeks.has(k.kaynak) && indeks.has(k.hedef)).map((k) => ({ source: indeks.get(k.kaynak)!, target: indeks.get(k.hedef)!, agirlik: k.agirlik }));
    veriRef.current = { dugumler, kenarlar };
    const sim = forceSimulation<Dugum, Kenar>(dugumler)
      .force(
        "baglanti",
        forceLink<Dugum, Kenar>(kenarlar)
          .distance((k) => 70 + (k.source as Dugum).r + (k.target as Dugum).r)
          .strength(0.25),
      )
      .force("itme", forceManyBody<Dugum>().strength((d) => -160 - d.r * 10))
      .force("carpisma", forceCollide<Dugum>().radius((d) => d.r + 10))
      .force("x", forceX<Dugum>(0).strength(0.04))
      .force("y", forceY<Dugum>(0).strength(0.06))
      .stop();
    sim.tick(Math.min(500, 200 + dugumler.length));
    let bekleyen = 0;
    sim.on("tick", () => {
      if (bekleyen) return;
      bekleyen = requestAnimationFrame(() => {
        bekleyen = 0;
        setKare((k) => k + 1);
      });
    });
    simRef.current = sim;
    elleRef.current = false;
    sigdir();
    setKare((x) => x + 1);
    return () => {
      sim.stop();
      if (bekleyen) cancelAnimationFrame(bekleyen);
    };
  }, [grafik]);

  // Kap boyu değişince (pencere, ray, dar ekran) kullanıcı dokunmadıysa yeniden sığdırılır
  useEffect(() => {
    if (!elleRef.current) sigdir();
  }, [boyut.en, boyut.boy]);

  const komsular = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const k of grafik?.kenarlar ?? []) {
      if (!m.has(k.kaynak)) m.set(k.kaynak, new Set());
      if (!m.has(k.hedef)) m.set(k.hedef, new Set());
      m.get(k.kaynak)!.add(k.hedef);
      m.get(k.hedef)!.add(k.kaynak);
    }
    return m;
  }, [grafik]);

  const svgNoktasi = (e: ReactPointerEvent | WheelEvent) => {
    const kutu = kapRef.current!.querySelector("svg")!.getBoundingClientRect();
    return { x: e.clientX - kutu.left, y: e.clientY - kutu.top };
  };

  // Tekerlekle yakınlaştırma (imlecin altındaki nokta yerinde kalır); sayfa kaymasın diye pasif olmayan dinleyici
  useEffect(() => {
    const svg = kapRef.current?.querySelector("svg");
    if (!svg) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      elleRef.current = true;
      const p = svgNoktasi(e);
      setGorunum((g) => {
        const k = Math.min(4, Math.max(0.15, g.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: p.x - ((p.x - g.x) / g.k) * k, y: p.y - ((p.y - g.y) / g.k) * k };
      });
    };
    svg.addEventListener("wheel", tekerlek, { passive: false });
    return () => svg.removeEventListener("wheel", tekerlek);
  }, [grafik, boyut.en]);

  const asagi = (e: ReactPointerEvent<SVGSVGElement>) => {
    const hedef = (e.target as Element).closest("[data-dugum]");
    const p = svgNoktasi(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (hedef) {
      const dugum = veriRef.current.dugumler.find((d) => d.id === hedef.getAttribute("data-dugum"));
      if (!dugum) return;
      surukleRef.current = { tur: "dugum", dugum, id: e.pointerId, x: p.x, y: p.y };
      dugum.fx = dugum.x;
      dugum.fy = dugum.y;
      simRef.current?.alphaTarget(0.25).restart();
    } else surukleRef.current = { tur: "kaydir", x: p.x, y: p.y, gx: gorunum.x, gy: gorunum.y, id: e.pointerId };
  };
  const hareket = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = surukleRef.current;
    if (!s || s.id !== e.pointerId) return;
    const p = svgNoktasi(e);
    if (s.tur === "dugum") {
      s.dugum.fx = (p.x - gorunum.x) / gorunum.k;
      s.dugum.fy = (p.y - gorunum.y) / gorunum.k;
    } else {
      if (Math.hypot(p.x - s.x, p.y - s.y) > 3) elleRef.current = true;
      setGorunum((g) => ({ ...g, x: s.gx + p.x - s.x, y: s.gy + p.y - s.y }));
    }
  };
  const yukari = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = surukleRef.current;
    if (!s || s.id !== e.pointerId) return;
    surukleRef.current = null;
    // İşaretçi yakalandığından tıklama hedefi hep svg'dir: kısa hareket tıklama sayılır
    const tiklama = Math.hypot(svgNoktasi(e).x - s.x, svgNoktasi(e).y - s.y) < 4;
    if (s.tur === "dugum") {
      s.dugum.fx = null;
      s.dugum.fy = null;
      simRef.current?.alphaTarget(0);
      if (tiklama) setSecili(s.dugum.id);
    } else if (tiklama) setSecili(null);
  };

  if (hata) return <HataKutu metin={hata} />;
  const { dugumler, kenarlar } = veriRef.current;
  const vurgulu = secili ?? uzerinde;
  const yakinlar = vurgulu ? (komsular.get(vurgulu) ?? new Set<string>()) : null;
  const enBuyuk = [...dugumler].sort((a, b) => b.r - a.r).slice(0, 14);
  const etiketli = new Set(enBuyuk.map((d) => d.id));

  return (
    <section aria-label="Modül bağımlılık grafiği">
      <div className="suzgec">
        <div className="bolumlu" role="group" aria-label="Grafik düzeyi">
          <button type="button" aria-pressed={duzey === "klasor"} onClick={() => setDuzey("klasor")}>
            Klasörler
          </button>
          <button type="button" aria-pressed={duzey === "dosya"} onClick={() => setDuzey("dosya")}>
            Dosyalar
          </button>
        </div>
        {grafik?.dugumler.length ? (
          <button
            type="button"
            className="dugme dugme-sessiz dugme-kucuk"
            onClick={() => {
              elleRef.current = false;
              sigdir();
            }}
          >
            <Simge ad="sigdir" />
            Sığdır
          </button>
        ) : null}
        {grafik ? (
          <span className="alan-ipucu">
            {grafik.dugumler.length} düğüm · {grafik.kenarlar.length} bağlantı{grafik.kirpilan ? ` · ${grafik.kirpilan} düğüm sığmadı` : ""} · sürükle, tekerlekle yakınlaştır
          </span>
        ) : null}
      </div>
      {!grafik ? (
        <Iskelet satir={6} etiket="Grafik hazırlanıyor" />
      ) : !grafik.dugumler.length ? (
        <Bos kucuk baslik="Bağımlılık yok">Çözülebilen içe aktarma bulunamadı ya da dizin henüz boş.</Bos>
      ) : (
        <div className="kz-iki-sutun kz-grafik-duzen">
          <div className="kz-grafik" ref={kapRef}>
            <svg
              width={boyut.en}
              height={boyut.boy}
              viewBox={`0 0 ${boyut.en} ${boyut.boy}`}
              role="img"
              aria-label={`${grafik.dugumler.length} düğümlü bağımlılık grafiği`}
              onPointerDown={asagi}
              onPointerMove={hareket}
              onPointerUp={yukari}
              onPointerCancel={yukari}
            >
              <defs>
                <marker id="kz-ok" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0 8 4 0 8z" className="kz-ok-ucu" />
                </marker>
              </defs>
              <g transform={`translate(${gorunum.x} ${gorunum.y}) scale(${gorunum.k})`}>
                {kenarlar.map((k, i) => {
                  const a = k.source as Dugum;
                  const b = k.target as Dugum;
                  const dx = (b.x ?? 0) - (a.x ?? 0);
                  const dy = (b.y ?? 0) - (a.y ?? 0);
                  const u = Math.hypot(dx, dy) || 1;
                  const ilgili = vurgulu !== null && (a.id === vurgulu || b.id === vurgulu);
                  return (
                    <line
                      key={i}
                      className={`kz-kenar${ilgili ? " kz-kenar-vurgu" : vurgulu ? " kz-kenar-soluk" : ""}`}
                      x1={(a.x ?? 0) + (dx / u) * a.r}
                      y1={(a.y ?? 0) + (dy / u) * a.r}
                      x2={(b.x ?? 0) - (dx / u) * (b.r + 2)}
                      y2={(b.y ?? 0) - (dy / u) * (b.r + 2)}
                      strokeWidth={Math.min(4, 0.6 + Math.log2(1 + k.agirlik)) / Math.sqrt(gorunum.k)}
                      markerEnd="url(#kz-ok)"
                    />
                  );
                })}
                {dugumler.map((d) => {
                  const durum = d.id === secili ? " kz-dugum-secili" : vurgulu && (d.id === vurgulu || yakinlar?.has(d.id)) ? " kz-dugum-yakin" : vurgulu ? " kz-dugum-soluk" : "";
                  const yazi = d.id === vurgulu || yakinlar?.has(d.id) || (etiketli.has(d.id) && !vurgulu);
                  return (
                    <g key={d.id} data-dugum={d.id} className={`kz-dugum${durum}`} transform={`translate(${d.x ?? 0} ${d.y ?? 0})`} onPointerEnter={() => setUzerinde(d.id)} onPointerLeave={() => setUzerinde(null)}>
                      <circle r={d.r} />
                      <title>{`${d.id} · ${d.dosya} dosya · ${d.satir} satır`}</title>
                      {yazi ? (
                        <text y={d.r + 11 / gorunum.k} style={{ fontSize: `${11 / gorunum.k}px` }}>
                          {etiket(d.id, grafik.duzey)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          <GrafikPaneli pid={pid} alan={alan} grafik={grafik} secili={secili} sec={setSecili} />
        </div>
      )}
    </section>
  );
}

function GrafikPaneli({ pid, alan, grafik, secili, sec }: { pid: string; alan: string; grafik: KodGrafigi; secili: string | null; sec: (id: string) => void }) {
  if (!secili)
    return (
      <aside className="kz-panel kz-panel-bos" aria-label="Düğüm ayrıntısı">
        <p className="soluk">Bir düğüme tıklayın: neleri kullandığı ve kimlerin onu kullandığı burada görünür. Düğüm boyu satır sayısını, çizgi kalınlığı içe aktarma sayısını gösterir.</p>
      </aside>
    );
  const d = grafik.dugumler.find((x) => x.id === secili);
  const giden = grafik.kenarlar.filter((k) => k.kaynak === secili).sort((a, b) => b.agirlik - a.agirlik);
  const gelen = grafik.kenarlar.filter((k) => k.hedef === secili).sort((a, b) => b.agirlik - a.agirlik);
  return (
    <aside className="kz-panel" aria-label="Düğüm ayrıntısı">
      <div className="kz-panel-baslik">
        <b className="kz-panel-yol">{secili === "." ? "Kök klasör" : secili}</b>
        {d ? (
          <span className="soluk">
            {d.dil || "karışık"} · {sayi(d.dosya)} dosya · {sayi(d.satir)} satır
          </span>
        ) : null}
        {grafik.duzey === "dosya" ? (
          <button type="button" className="dugme dugme-kucuk" onClick={() => koddaAc(pid, alan, secili)}>
            Kod'da aç
          </button>
        ) : null}
      </div>
      <h3 className="kz-panel-alt">Kullandıkları · {giden.length}</h3>
      {giden.length ? (
        <ul className="kz-panel-liste">
          {giden.map((k) => (
            <li key={k.hedef}>
              <button type="button" onClick={() => sec(k.hedef)}>
                {k.hedef} <span className="soluk">×{k.agirlik}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soluk kz-panel-not">Yok.</p>
      )}
      <h3 className="kz-panel-alt">Onu kullananlar · {gelen.length}</h3>
      {gelen.length ? (
        <ul className="kz-panel-liste">
          {gelen.map((k) => (
            <li key={k.kaynak}>
              <button type="button" onClick={() => sec(k.kaynak)}>
                {k.kaynak} <span className="soluk">×{k.agirlik}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soluk kz-panel-not">Yok.</p>
      )}
    </aside>
  );
}
