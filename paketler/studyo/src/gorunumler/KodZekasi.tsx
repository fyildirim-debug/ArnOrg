// Kod zekâsı: anlamsal kod araması, semboller, depo haritası ve bağ grafiği (içe aktarma ve anlam; KodGrafigi.tsx).
// Ajanlar kod_ara, sembol_bul, kod_haritasi, bagimliliklar, benzer_kod ve ilgili_dosyalar araçlarıyla aynı dizini kullanır.
import { type CalismaAlani, type KodAramaSonucu, type KodAramaYaniti, type KodBagimliliklari, type KodDizinDurumu, type KodHaritaDugumu, type KodSembolTuru, type KodSembolu } from "@arnorg/ortak";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet, Yukleniyor } from "../bilesenler/Durumlar";
import { Simge } from "../bilesenler/Simge";
import { useSozluk, type Sozluk } from "../dil";
import { git, hataBildir } from "../durum/arayuz";
import { dizinSuruyor, kodAlaniSec, kodDurumlariniYukle, useKodZekasi } from "../durum/kodZekasi";
import { useVeri } from "../durum/veri";
import { tezgahtaAc } from "../tezgah";
import { goreli, sayi, yuzde } from "../yardimcilar/bicim";
import { Grafik } from "./KodGrafigi";

type Sekme = "arama" | "semboller" | "harita" | "grafik";

/** Dosyayı Kod ekranının düzenleyicisinde açar (satır verilirse orada) */
function koddaAc(projeId: string, alan: string, yol: string, satir?: number) {
  git("kod");
  tezgahtaAc({ projeId, alan, yol }, satir).catch(hataBildir);
}

/** Modelin okunur adı: "onnx-community/embeddinggemma-300m-ONNX@q8" → "embeddinggemma-300m" */
function modelAdi(s: Sozluk, model: string | null): string {
  if (!model) return s.kodZekasi.modelKapali;
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
  const s = useSozluk();
  const z = s.kodZekasi;
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

  const alanAdi = (a: CalismaAlani) => (a.ana ? z.anaRepo : (ajanlar.find((x) => x.id === a.ajanId)?.ad ?? a.kimlik));

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
          <h1>{z.baslik}</h1>
          <p>{z.aciklama}</p>
        </div>
        <div className="baslik-eylem kz-eylem">
          {/* 0.0.8: herkes ortak projede; seçici yalnız geçişten kalan bir alan varsa görünür */}
          {alanlar.length > 1 ? (
            <select className="girdi suzgec-secim" aria-label={z.calismaAlani} value={alan} onChange={(e) => kodAlaniSec(e.target.value)}>
              {alanlar.map((a) => (
                <option key={a.kimlik} value={a.kimlik}>
                  {alanAdi(a)}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="dugme" disabled={dizinleniyor || dizinSuruyor(durum)} onClick={() => void dizinle(false)} title={z.yenidenDizinleIpucu}>
            <Simge ad="yenile" />
            {z.yenidenDizinle}
          </button>
        </div>
      </div>

      {hata ? <HataKutu metin={hata} yeniden={() => void kodDurumlariniYukle(pid).catch((e) => setHata(hataMetni(e)))} /> : null}
      <DizinOzeti durum={durum} sifirdan={() => void dizinle(true)} />

      <div className="bolumlu kz-sekmeler" role="group" aria-label={z.bolumEtiketi}>
        {(["arama", "semboller", "harita", "grafik"] as Sekme[]).map((b) => (
          <button key={b} type="button" aria-pressed={sekme === b} onClick={() => setSekme(b)}>
            {z.sekmeler[b]}
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
        <Grafik key={alan} pid={pid} alan={alan} durum={durum} />
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

function DizinOzeti({ durum, sifirdan }: { durum: KodDizinDurumu | undefined; sifirdan: () => void }) {
  const s = useSozluk();
  const z = s.kodZekasi;
  const d = durum;
  const gomuluYuzde = d && d.toplamParca ? Math.round((d.gomulen / d.toplamParca) * 100) : 0;
  const kalan = useKalanSure(d);
  const ilerleme = (() => {
    if (!d) return null;
    switch (d.durum) {
      case "taraniyor":
        return { metin: z.taraniyor(d.taranan ?? 0, d.toplamDosya ?? 0), oran: d.toplamDosya ? (d.taranan ?? 0) / d.toplamDosya : null };
      case "model-indiriliyor":
        return { metin: z.modelIndiriliyor(yuzde(d.indirmeYuzde ?? 0)), oran: (d.indirmeYuzde ?? 0) / 100 };
      case "gomuluyor": {
        const sure = kalan !== null ? z.kalan(z.sure(kalan)) : "";
        // Uzun sürecekse daha hızlı model önerilir (yalnız kaliteli modelde)
        const oneri = kalan !== null && kalan > 20 * 60 && d.model?.includes("embeddinggemma") ? z.hizliOneri : "";
        return {
          metin: z.gomuluyor(d.gomulen, d.toplamParca, sure, oneri),
          oran: d.toplamParca ? d.gomulen / d.toplamParca : null,
        };
      }
      default:
        return null;
    }
  })();

  return (
    <>
      <dl className="kz-ozet" aria-label={z.ozetEtiketi}>
        <div>
          <dt>{z.dosya}</dt>
          <dd className="sayi">{d ? sayi(d.dosya) : "—"}</dd>
        </div>
        <div>
          <dt>{z.sembol}</dt>
          <dd className="sayi">{d ? sayi(d.sembol) : "—"}</dd>
        </div>
        <div>
          <dt>{z.parca}</dt>
          <dd className="sayi">{d ? sayi(d.parca) : "—"}</dd>
        </div>
        <div title={z.anlamsalIpucu}>
          <dt>{z.anlamsal}</dt>
          <dd className="sayi">{d?.model ? yuzde(gomuluYuzde) : "—"}</dd>
        </div>
        <div className="kz-ozet-model">
          <dt>{z.model}</dt>
          <dd>
            <span>{d ? modelAdi(s, d.model) : "—"}</span>
            <small>{d?.sonGuncelleme ? z.guncellendi(goreli(d.sonGuncelleme)) : d?.durum === "bos" ? z.henuzDizinlenmedi : ""}</small>
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
          <b>{z.dizinHatasi}</b>
          <span>{d.hata}</span>
          <span>{z.sozcukAramasiSurer}</span>
          <button type="button" className="dugme dugme-kucuk" onClick={sifirdan}>
            {z.sifirdanDizinle}
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
  const z = useSozluk().kodZekasi;
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
    <section aria-label={z.aramaEtiketi}>
      <div className="kz-arama">
        <div className="arama-kutu kz-arama-kutu">
          <Simge ad="ara" boyut={15} />
          <input
            ref={girdiRef}
            className="girdi"
            type="search"
            aria-label={z.koddaAra}
            placeholder={z.aramaIpucu}
            value={q}
            onChange={(e) => {
              setBenzerKaynak(null);
              setQ(e.target.value);
            }}
          />
        </div>
        <input
          className="girdi kz-yol-suzgec"
          aria-label={z.yolSuzgeci}
          placeholder={z.yolIpucu}
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
            {z.benzeyenYerler}
          </span>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setBenzerKaynak(null)}>
            {z.aramayaDon}
          </button>
        </div>
      ) : null}

      {hata ? <HataKutu baslik={z.aranamadi} metin={hata} /> : null}
      {araniyor && !yanit ? <Yukleniyor metin={z.araniyor} /> : null}

      {yanit ? (
        <>
          <div className="kz-sonuc-ust" role="status">
            {araniyor ? <Yukleniyor metin={z.araniyor} /> : <span>{yanit.sonuclar.length ? z.sonucSayisi(yanit.sonuclar.length, yanit.sureMs) : z.sonucYok}</span>}
            {yanit.yalnizSozcuk ? (
              <span className="kz-uyari">
                {durum?.model ? z.dizinHazirDegil : z.anlamsalKapali}
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
            <Bos kucuk baslik={z.eslesenYok}>
              {z.eslesenYokAyrinti}
            </Bos>
          )}
        </>
      ) : !araniyor && !hata ? (
        <div className="kz-bos">
          <p>{z.aramaAciklama}</p>
          <div className="kz-ornekler">
            {z.ornekSorgular.map((o) => (
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
  const z = useSozluk().kodZekasi;
  const { klasor, ad } = yolParcalari(r.yol);
  return (
    <li className="kz-sonuc">
      <div className="kz-sonuc-baslik">
        <button type="button" className="kz-yol" onClick={ac} title={z.koddaAc}>
          <span className="soluk">{klasor}</span>
          <b>{ad}</b>
          <span className="soluk">
            :{r.bas}–{r.bit}
          </span>
        </button>
        {r.sembol ? (
          <span className="kz-sembol">
            {r.sembol}
            {r.sembolTuru ? <small>{z.sembolTuru[r.sembolTuru]}</small> : null}
          </span>
        ) : null}
        <span className="kz-sonuc-sag">
          <span className="kz-eslesme" title={z.yontem}>
            {z.eslesme[r.eslesme]}
          </span>
          <span className="kz-puan" title={z.puan(r.puan.toFixed(2))} aria-label={z.puan(r.puan.toFixed(2))}>
            <span style={{ width: `${Math.max(4, r.puan * 100)}%` }} />
          </span>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={benzer} title={z.benzerleriBul}>
            {z.benzerleri}
          </button>
        </span>
      </div>
      <button type="button" className="kz-kesit-dugme" onClick={ac} aria-label={z.satirdaAc(r.yol, r.kesitBas)}>
        <Kesit kesit={r.kesit} bas={r.kesitBas} ifade={ifade} />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Semboller
// ---------------------------------------------------------------------------

function Semboller({ pid, alan }: { pid: string; alan: string }) {
  const z = useSozluk().kodZekasi;
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
    <section aria-label={z.sembollerEtiketi}>
      <div className="suzgec">
        <div className="arama-kutu">
          <Simge ad="ara" boyut={13} />
          <input className="girdi" type="search" aria-label={z.sembolAra} placeholder={z.sembolIpucu} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="girdi suzgec-secim" aria-label={z.sembolTuruEtiketi} value={tur} onChange={(e) => setTur(e.target.value as KodSembolTuru | "")}>
          <option value="">{z.tumTurler}</option>
          {(Object.keys(z.sembolTuru) as KodSembolTuru[]).map((t) => (
            <option key={t} value={t}>
              {z.sembolTuru[t]}
            </option>
          ))}
        </select>
        {liste ? (
          <span className="alan-ipucu" role="status">
            {z.sembolSayisi(liste.length, liste.length >= 200)}
            {q.trim() ? "" : z.oneCikanlar}
          </span>
        ) : null}
      </div>
      {hata ? <HataKutu metin={hata} /> : null}
      {!liste && !hata ? <Iskelet satir={6} etiket={z.sembollerYukleniyor} /> : null}
      {liste?.length ? (
        <ul className="kz-semboller">
          {liste.map((s) => (
            <li key={`${s.yol}:${s.bas}:${s.ad}`}>
              <button type="button" onClick={() => koddaAc(pid, alan, s.yol, s.bas)} title={z.koddaAc}>
                <span className="kz-sembol-ad">
                  {s.ust ? <span className="soluk">{s.ust}.</span> : null}
                  <b>{s.ad}</b>
                </span>
                <span className="kz-etiket">{z.sembolTuru[s.tur]}</span>
                {s.disaAcik ? <span className="kz-etiket kz-etiket-disa">{z.disaAcik}</span> : null}
                <span className="kz-sembol-yol soluk">
                  {s.yol}:{s.bas}
                </span>
                <code className="kz-imza">{s.imza}</code>
              </button>
            </li>
          ))}
        </ul>
      ) : liste ? (
        <Bos kucuk baslik={z.sembolYok}>
          {z.sembolYokAyrinti}
        </Bos>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Harita: klasör ağacı ve dosya paneli
// ---------------------------------------------------------------------------

function Harita({ pid, alan, surum }: { pid: string; alan: string; surum: string | null }) {
  const z = useSozluk().kodZekasi;
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
  if (!kok) return <Iskelet satir={8} etiket={z.haritaYukleniyor} />;
  if (!kok.cocuklar?.length)
    return (
      <Bos kucuk baslik={z.dizinBos}>
        {z.dizinBosAyrinti}
      </Bos>
    );

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
              <span className="kz-agac-bilgi soluk">{z.dosyaSatir(c.dosyaSayisi ?? 0, c.satir)}</span>
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
                {c.iceAktaran ? <span title={z.iceAktaranSayisi}>↙{c.iceAktaran} · </span> : null}
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
      <section aria-label={z.klasorAgaci} className="kz-agac-kap">
        <div className="kz-agac-ust soluk">
          {z.dosyaSatir(kok.dosyaSayisi ?? 0, kok.satir)}
          <span className="kz-agac-eylem">
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setAcik(new Set())}>
              {z.tumunuKapat}
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
  const z = useSozluk().kodZekasi;
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
      <aside className="kz-panel kz-panel-bos" aria-label={z.dosyaAyrintisi}>
        <p className="soluk">{z.dosyaSecin}</p>
      </aside>
    );
  return (
    <aside className="kz-panel" aria-label={z.dosyaAyrintisi}>
      <div className="kz-panel-baslik">
        <b className="kz-panel-yol">{dosya.yol}</b>
        <span className="soluk">{z.dilSatir(dosya.dil ?? "", dosya.satir)}</span>
        <button type="button" className="dugme dugme-kucuk" onClick={() => koddaAc(pid, alan, dosya.yol)}>
          {z.koddaAcKisa}
        </button>
      </div>
      {dosya.semboller?.length ? (
        <>
          <h3 className="kz-panel-alt">{z.oneCikanSemboller}</h3>
          <ul className="kz-panel-liste">
            {dosya.semboller.map((s) => (
              <li key={`${s.ad}:${s.bas}`}>
                <button type="button" onClick={() => koddaAc(pid, alan, dosya.yol, s.bas)}>
                  <b>{s.ad}</b> <span className="soluk">{z.turSatir(z.sembolTuru[s.tur], s.bas)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {hata ? <HataKutu metin={hata} /> : null}
      {!bag && !hata ? <Yukleniyor metin={z.bagimliliklarYukleniyor} /> : null}
      {bag ? (
        <>
          <h3 className="kz-panel-alt">{z.iceAktardiklari(bag.iceAktardiklari.length)}</h3>
          {bag.iceAktardiklari.length ? (
            <ul className="kz-panel-liste">
              {bag.iceAktardiklari.map((i) => (
                <li key={`${i.kaynak}:${i.satir}`}>
                  {i.yol ? (
                    <button type="button" onClick={() => sec(i.yol!)}>
                      {i.yol} <span className="soluk">{z.satir(i.satir)}</span>
                    </button>
                  ) : (
                    <span className="soluk">
                      {i.kaynak} <small>{i.kaynak.startsWith(".") ? z.bulunamadi : z.disPaket}</small>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="soluk kz-panel-not">{z.iceAktarmaYok}</p>
          )}
          <h3 className="kz-panel-alt">{z.onuKullananlar(bag.iceAktaranlar.length)}</h3>
          {bag.iceAktaranlar.length ? (
            <ul className="kz-panel-liste">
              {bag.iceAktaranlar.map((i) => (
                <li key={`${i.yol}:${i.satir}`}>
                  <button type="button" onClick={() => sec(i.yol)}>
                    {i.yol} <span className="soluk">{z.satir(i.satir)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="soluk kz-panel-not">{z.iceAktaranYok}</p>
          )}
        </>
      ) : null}
    </aside>
  );
}
