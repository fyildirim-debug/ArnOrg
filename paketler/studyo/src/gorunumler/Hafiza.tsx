// Hafıza: projenin kalıcı hafızası, ajan defterleri ve ajanlar arası soru-yanıtlar.
// Kayıtlar yalnız bu projeye aittir; ajanlar her oturumda okur, çalışırken doğru anda hatırlar.
import { HAFIZA_TURU_ADLARI, type Ajan, type AjanSorusu, type HafizaKaydi, type HafizaTuru } from "@arnorg/ortak";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { AjanAvatar, Avatar } from "../bilesenler/Kisi";
import { Markdown } from "../bilesenler/Markdown";
import { OnaySor } from "../bilesenler/OnaySor";
import { Simge } from "../bilesenler/Simge";
import { ZenginBlok } from "../bilesenler/ZenginMetin";
import { bildir, git } from "../durum/arayuz";
import { hafizaKaydiKaldir, hafizaKaydiUygula, hafizayiYukle, useHafiza } from "../durum/hafiza";
import { useVeri } from "../durum/veri";
import { akilliZaman, goreli } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

/** Ekranda gösterim sırası: kurulun sözü önce gelir */
const TURLER: HafizaTuru[] = ["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"];

const TUR_ACIKLAMALARI: Record<HafizaTuru, string> = {
  tercih: "Kurulun isteği, üslup, yasak. Her ajan her oturumda uyar.",
  karar: "Alınan karar ve gerekçesi.",
  ogrenilen: "Yaşanmış hata ve çözümü; aynı hata tekrarlanmasın.",
  olgu: "Projeye dair doğru bilgi: sürüm, yapı, komut.",
  uzmanlik: "Kim neyi biliyor; sorular ona yönlendirilir.",
  ozet: "Biten iş, devir notu.",
};

type Sekme = "kayitlar" | "defterler" | "sorular";

export function Hafiza() {
  const pid = useVeri((d) => d.aktifProjeId);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const sorular = useHafiza((d) => d.sorular);
  const yukleme = useHafiza((d) => d.yukleme);
  const hata = useHafiza((d) => d.hata);
  const [sekme, setSekme] = useState<Sekme>("kayitlar");
  const [yeniAcik, setYeniAcik] = useState(false);

  useEffect(() => {
    if (pid) void hafizayiYukle(pid, useHafiza.getState().projeId === pid);
  }, [pid]);

  const gecerli = useMemo(() => kayitlar.filter((k) => !k.yerineGecen), [kayitlar]);
  const turSayilari = useMemo(() => {
    const s: Partial<Record<HafizaTuru, number>> = {};
    for (const k of gecerli) s[k.tur] = (s[k.tur] ?? 0) + 1;
    return s;
  }, [gecerli]);
  const bekleyenSoru = sorular.filter((s) => s.durum === "bekliyor").length;
  const yanitlanan = sorular.filter((s) => s.durum === "yanitlandi").length;

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>Hafıza</h1>
          <p>
            Yalnız bu projeye ait · <code>.arnorg/hafiza/</code> · ajanlar her oturumda okur, çalışırken hatırlar
          </p>
        </div>
        <div className="baslik-eylem">
          <button
            type="button"
            className="dugme dugme-ana"
            onClick={() => {
              setSekme("kayitlar");
              setYeniAcik(true);
            }}
          >
            <Simge ad="arti" />
            Kayıt ekle
          </button>
        </div>
      </div>

      <dl className="hafiza-ozet" aria-label="Hafıza özeti">
        {TURLER.map((t) => (
          <div key={t} data-tur={t} title={TUR_ACIKLAMALARI[t]}>
            <dt>{HAFIZA_TURU_ADLARI[t]}</dt>
            <dd className="sayi">{turSayilari[t] ?? 0}</dd>
          </div>
        ))}
        <div className="hafiza-ozet-soru" title="Ajanların birbirine sorduğu sorular">
          <dt>Soru · yanıt</dt>
          <dd className="sayi">
            {yanitlanan}
            {bekleyenSoru ? <small>{bekleyenSoru} yanıt bekliyor</small> : null}
          </dd>
        </div>
      </dl>

      <div className="bolumlu hafiza-sekmeler" role="group" aria-label="Hafıza bölümü">
        <button type="button" aria-pressed={sekme === "kayitlar"} onClick={() => setSekme("kayitlar")}>
          Kayıtlar <span className="soluk sayi">{gecerli.length}</span>
        </button>
        <button type="button" aria-pressed={sekme === "defterler"} onClick={() => setSekme("defterler")}>
          Defterler
        </button>
        <button type="button" aria-pressed={sekme === "sorular"} onClick={() => setSekme("sorular")}>
          Sorular <span className="soluk sayi">{sorular.length}</span>
          {bekleyenSoru ? <span className="rozet hafiza-rozet">{bekleyenSoru}</span> : null}
        </button>
      </div>

      {hata ? <HataKutu metin={hata} yeniden={() => pid && void hafizayiYukle(pid)} /> : null}
      {yukleme === "yukleniyor" && !kayitlar.length && !hata ? <Iskelet satir={6} etiket="Hafıza yükleniyor" /> : null}

      {yukleme === "hazir" || kayitlar.length ? (
        sekme === "kayitlar" ? (
          <Kayitlar yeniAcik={yeniAcik} setYeniAcik={setYeniAcik} />
        ) : sekme === "defterler" ? (
          <Defterler />
        ) : (
          <Sorular />
        )
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kayıtlar
// ---------------------------------------------------------------------------

function Kayitlar({ yeniAcik, setYeniAcik }: { yeniAcik: boolean; setYeniAcik: (a: boolean) => void }) {
  const pid = useVeri((d) => d.aktifProjeId);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const [tur, setTur] = useState<HafizaTuru | "tumu">("tumu");
  const [arama, setArama] = useState("");
  const [eskiler, setEskiler] = useState(false);
  const [bulunan, setBulunan] = useState<string[] | null>(null);
  const [araniyor, setAraniyor] = useState(false);

  // Arama sunucudaki tam metin dizininde yapılır (Türkçe harfsiz, önekli, önem ve tazelik puanlı)
  useEffect(() => {
    const q = arama.trim();
    if (!pid || q.length < 2) {
      setBulunan(null);
      setAraniyor(false);
      return;
    }
    const iptal = new AbortController();
    setAraniyor(true);
    const z = setTimeout(() => {
      api
        .hafiza(pid, { q }, iptal.signal)
        .then((s) => setBulunan(s.map((k) => k.id)))
        .catch(() => undefined)
        .finally(() => !iptal.signal.aborted && setAraniyor(false));
    }, 220);
    return () => {
      clearTimeout(z);
      iptal.abort();
    };
  }, [arama, pid]);

  const gorunen = useMemo(() => {
    const kaynak = bulunan ? bulunan.map((id) => kayitlar.find((k) => k.id === id)).filter((k): k is HafizaKaydi => !!k) : kayitlar;
    return kaynak.filter((k) => (tur === "tumu" || k.tur === tur) && (eskiler || !k.yerineGecen));
  }, [kayitlar, bulunan, tur, eskiler]);
  const eskiSayisi = kayitlar.filter((k) => k.yerineGecen).length;

  return (
    <section aria-label="Hafıza kayıtları">
      {yeniAcik ? <KayitFormu kapat={() => setYeniAcik(false)} /> : null}

      <div className="suzgec">
        <div className="arama-kutu">
          <Simge ad="ara" boyut={13} />
          <input
            className="girdi"
            type="search"
            aria-label="Hafızada ara"
            placeholder="Ara: karar, hata, dosya, kişi"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </div>
        <div className="bolumlu" role="group" aria-label="Türe göre süz">
          <button type="button" aria-pressed={tur === "tumu"} onClick={() => setTur("tumu")}>
            Tümü
          </button>
          {TURLER.map((t) => (
            <button key={t} type="button" aria-pressed={tur === t} onClick={() => setTur(t)} title={TUR_ACIKLAMALARI[t]}>
              {HAFIZA_TURU_ADLARI[t]}
            </button>
          ))}
        </div>
        {eskiSayisi ? (
          <label className="secenek">
            <input type="checkbox" checked={eskiler} onChange={(e) => setEskiler(e.target.checked)} />
            Eskiyenleri göster <small>{eskiSayisi}</small>
          </label>
        ) : null}
        {bulunan ? (
          <span className="alan-ipucu" role="status">
            {araniyor ? "Aranıyor…" : `${gorunen.length} sonuç`}
          </span>
        ) : null}
      </div>

      {gorunen.length ? (
        <ol className="hafiza-liste">
          {gorunen.map((k) => (
            <KayitSatiri key={k.id} kayit={k} />
          ))}
        </ol>
      ) : kayitlar.length ? (
        <Bos kucuk baslik="Eşleşen kayıt yok">Aramayı ya da tür süzgecini gevşetin.</Bos>
      ) : (
        <Bos
          baslik="Hafıza boş"
          eylem={
            <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={() => setYeniAcik(true)}>
              İlk tercihi yaz
            </button>
          }
        >
          Ajanlar karar aldıkça, hata çözdükçe ve iş bitirdikçe buraya yazar. Ekibin her zaman uymasını istediğiniz bir kuralı kurul tercihi olarak
          ekleyin; her ajan her oturumda okur.
        </Bos>
      )}
    </section>
  );
}

function OnemGostergesi({ onem }: { onem: number }) {
  return (
    <span className="onem" role="img" aria-label={`Önem ${onem}/5`} title={`Önem ${onem}/5${onem >= 5 ? " · her oturumda hatırlanır" : ""}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} data-dolu={i <= onem || undefined} />
      ))}
    </span>
  );
}

function KayitSatiri({ kayit }: { kayit: HafizaKaydi }) {
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const [duzenle, setDuzenle] = useState(false);
  const [silSor, setSilSor] = useState(false);
  const { suruyor, calistir } = useIslem();
  const ajan = kayit.kaynakAjanId ? ajanlar.find((a) => a.id === kayit.kaynakAjanId) : undefined;
  const gorev = kayit.gorevId ? gorevler.find((g) => g.id === kayit.gorevId) : undefined;
  const yenisi = kayit.yerineGecen ? kayitlar.find((k) => k.id === kayit.yerineGecen) : undefined;

  if (duzenle) {
    return (
      <li className="hafiza-kayit" data-tur={kayit.tur}>
        <KayitFormu kayit={kayit} kapat={() => setDuzenle(false)} />
      </li>
    );
  }

  return (
    <li className={`hafiza-kayit${kayit.yerineGecen ? " hafiza-eski" : ""}`} data-tur={kayit.tur} id={`hafiza-${kayit.id}`}>
      <div className="hk-yan">
        <span className="hk-tur">{HAFIZA_TURU_ADLARI[kayit.tur]}</span>
        <OnemGostergesi onem={kayit.onem} />
      </div>
      <div className="hk-govde">
        <h3 className="hk-baslik">
          {kayit.baslik}
          {kayit.yerineGecen ? <span className="etiket">Eskidi</span> : null}
        </h3>
        <div className="hk-metin">
          <ZenginBlok metin={kayit.metin} />
        </div>
        {yenisi ? (
          <p className="hk-yerine">
            Yerine geçen:{" "}
            <button
              type="button"
              className="metin-dugme"
              onClick={() => document.getElementById(`hafiza-${yenisi.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              {yenisi.baslik}
            </button>
          </p>
        ) : null}
        <div className="hk-alt">
          <span className="hk-kaynak">
            {ajan ? <AjanAvatar ajan={ajan} boyut="xs" /> : <Avatar ad={kayit.kaynakAd} siz={kayit.kaynakAd === "Yönetim kurulu"} boyut="xs" />}
            {kayit.kaynakAd}
          </span>
          <time dateTime={kayit.guncelleme} title={`Yazıldı ${akilliZaman(kayit.olusturma)} · güncellendi ${akilliZaman(kayit.guncelleme)}`}>
            {goreli(kayit.guncelleme)}
          </time>
          {gorev ? (
            <button type="button" className="gorev-kodu" onClick={() => git("pano", { gorevId: gorev.id })} title={gorev.baslik}>
              {gorev.kod}
            </button>
          ) : null}
          {kayit.etiketler.map((e) => (
            <span key={e} className="hk-etiket">
              #{e}
            </span>
          ))}
        </div>
        {silSor ? (
          <OnaySor
            evetMetni="Sil"
            suruyor={suruyor !== null}
            evet={() =>
              void calistir("sil", async () => {
                await api.hafizaSil(kayit.id);
                hafizaKaydiKaldir(kayit.projeId, kayit.id);
                setSilSor(false);
                bildir("basari", "Kayıt silindi.");
              })
            }
            vazgec={() => setSilSor(false)}
          >
            Bu kayıt hafızadan ve <code>.arnorg/hafiza/</code> yansısından silinir; ajanlar bir daha hatırlamaz. Bilgi değiştiyse silmek yerine
            düzenleyin.
          </OnaySor>
        ) : null}
      </div>
      <div className="hk-eylem">
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={`${kayit.baslik} kaydını düzenle`} title="Düzenle" onClick={() => setDuzenle(true)}>
          <Simge ad="duzenle" boyut={12} />
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={`${kayit.baslik} kaydını sil`} title="Sil" onClick={() => setSilSor(true)}>
          <Simge ad="kapat" boyut={12} />
        </button>
      </div>
    </li>
  );
}

function KayitFormu({ kayit, kapat }: { kayit?: HafizaKaydi; kapat: () => void }) {
  const pid = useVeri((d) => d.aktifProjeId);
  const [tur, setTur] = useState<HafizaTuru>(kayit?.tur ?? "tercih");
  const [baslik, setBaslik] = useState(kayit?.baslik ?? "");
  const [metin, setMetin] = useState(kayit?.metin ?? "");
  const [etiketler, setEtiketler] = useState(kayit?.etiketler.join(", ") ?? "");
  const [onem, setOnem] = useState(kayit?.onem ?? 5);
  const [onemDegisti, setOnemDegisti] = useState(!!kayit);
  const { suruyor, hata, setHata, calistir } = useIslem();
  const kimlik = kayit?.id ?? "yeni";

  // Yeni kayıtta önem türe göre önerilir: kurul tercihi her oturumda hatırlanır
  const turSec = (t: HafizaTuru) => {
    setTur(t);
    if (!onemDegisti) setOnem(t === "tercih" ? 5 : t === "ozet" ? 2 : 3);
  };

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    if (!pid) return;
    if (!baslik.trim()) return setHata("Kısa bir başlık yazın.");
    if (!metin.trim()) return setHata("Ne, neden, nasıl: bir iki cümle yazın.");
    const liste = etiketler
      .split(",")
      .map((x) => x.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 12);
    void calistir(
      "kaydet",
      async () => {
        const k = kayit
          ? await api.hafizaGuncelle(kayit.id, { tur, baslik: baslik.trim(), metin: metin.trim(), etiketler: liste, onem })
          : await api.hafizaYaz(pid, { tur, baslik: baslik.trim(), metin: metin.trim(), etiketler: liste, onem });
        hafizaKaydiUygula(k);
        bildir("basari", kayit ? "Kayıt güncellendi." : "Hafızaya yazıldı; ajanlar bir sonraki turlarında görür.");
        kapat();
      },
      true,
    );
  };

  return (
    <form className="hafiza-form" onSubmit={gonder} aria-label={kayit ? "Kaydı düzenle" : "Yeni hafıza kaydı"}>
      <div className="hf-ust">
        <div className="bolumlu" role="group" aria-label="Kayıt türü">
          {TURLER.map((t) => (
            <button key={t} type="button" aria-pressed={tur === t} onClick={() => turSec(t)}>
              {HAFIZA_TURU_ADLARI[t]}
            </button>
          ))}
        </div>
        <span className="alan-ipucu">{TUR_ACIKLAMALARI[tur]}</span>
      </div>
      <div className="alan">
        <label htmlFor={`hf-baslik-${kimlik}`}>Başlık</label>
        <input
          id={`hf-baslik-${kimlik}`}
          className="girdi"
          value={baslik}
          maxLength={160}
          onChange={(e) => setBaslik(e.target.value)}
          placeholder={tur === "tercih" ? "ör. Commit mesajları Türkçe" : tur === "ogrenilen" ? "ör. better-sqlite3 derleme hatası" : "Kısa, aranabilir başlık"}
          autoFocus
        />
      </div>
      <div className="alan">
        <label htmlFor={`hf-metin-${kimlik}`}>Metin</label>
        <textarea
          id={`hf-metin-${kimlik}`}
          className="metin-alani"
          rows={4}
          value={metin}
          maxLength={8000}
          onChange={(e) => setMetin(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") gonder(e);
          }}
          placeholder={tur === "ogrenilen" ? "Belirti, neden, çözüm." : "Ne, neden, nasıl. Ajanlar bunu her oturumda okur."}
        />
      </div>
      <div className="hf-alt">
        <div className="alan hf-etiket">
          <label htmlFor={`hf-etiket-${kimlik}`}>Etiketler</label>
          <input
            id={`hf-etiket-${kimlik}`}
            className="girdi"
            value={etiketler}
            onChange={(e) => setEtiketler(e.target.value)}
            placeholder="virgülle: api, src/sunucu.ts"
            spellCheck={false}
          />
        </div>
        <div className="alan">
          <span className="alan-ad" id={`hf-onem-${kimlik}`}>
            Önem
          </span>
          <div className="bolumlu" role="group" aria-labelledby={`hf-onem-${kimlik}`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={onem === i}
                onClick={() => {
                  setOnem(i);
                  setOnemDegisti(true);
                }}
                title={i === 5 ? "Her oturumda hatırlanır" : i === 1 ? "Ayrıntı" : undefined}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>
      {hata ? <span className="alan-hata">{hata}</span> : null}
      <div className="dugme-satir">
        <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="kaydet" boyut={12} />}
          {kayit ? "Kaydet" : "Hafızaya yaz"}
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={kapat}>
          Vazgeç
        </button>
        <span className="alan-ipucu itele">Ctrl+Enter</span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Defterler
// ---------------------------------------------------------------------------

function Defterler() {
  const ajanlar = useVeri((d) => d.ajanlar);
  const [secili, setSecili] = useState<string | null>(null);
  const ajan = ajanlar.find((a) => a.id === secili) ?? ajanlar[0];

  if (!ajanlar.length) return <Bos kucuk baslik="Ekip yok">İlk çalışan işe alınınca defteri burada görünür.</Bos>;

  return (
    <div className="defter-yerlesim">
      <nav className="defter-liste" aria-label="Çalışanlar">
        <p className="alan-ipucu">Her çalışan turunun sonunda defterine ne yaptığını, ne kaldığını ve kime ne söz verdiğini yazar.</p>
        <ul>
          {ajanlar.map((a) => (
            <li key={a.id}>
              <button type="button" className="defter-dugme" aria-current={a.id === ajan?.id ? "true" : undefined} onClick={() => setSecili(a.id)}>
                <AjanAvatar ajan={a} boyut="s" />
                <span className="kisi-metin">
                  <b className="tek-satir">{a.ad}</b>
                  <small className="tek-satir">{a.rolAdi}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {ajan ? <Defter key={ajan.id} ajan={ajan} /> : null}
    </div>
  );
}

function Defter({ ajan }: { ajan: Ajan }) {
  const [veri, setVeri] = useState<{ icerik: string; guncelleme: string | null } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();

  const yukle = () => {
    setHata(null);
    api
      .defter(ajan.id)
      .then(setVeri)
      .catch((e: unknown) => setHata(e instanceof Error ? e.message : "Defter alınamadı."));
  };
  useEffect(yukle, [ajan.id]);

  const kaydet = () => {
    if (taslak === null) return;
    void calistir("kaydet", async () => {
      await api.defterYaz(ajan.id, taslak);
      setVeri({ icerik: taslak.trim(), guncelleme: new Date().toISOString() });
      setTaslak(null);
      bildir("basari", `${ajan.ad} defteri kaydedildi.`);
    });
  };

  return (
    <article className="defter">
      <header className="not-ust">
        <h2 className="defter-baslik">{ajan.ad} · defter</h2>
        {veri?.guncelleme ? <small>güncellendi {goreli(veri.guncelleme)}</small> : null}
        <div className="dugme-satir itele">
          {taslak !== null ? (
            <>
              <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={kaydet} disabled={suruyor !== null || taslak.length > 6000}>
                Kaydet
              </button>
              <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setTaslak(null)}>
                Vazgeç
              </button>
            </>
          ) : (
            <>
              <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={yukle}>
                Yenile
              </button>
              <button type="button" className="dugme dugme-kucuk" onClick={() => setTaslak(veri?.icerik ?? "")} disabled={!veri}>
                <Simge ad="duzenle" boyut={12} />
                Düzenle
              </button>
            </>
          )}
        </div>
      </header>
      {hata ? <HataKutu metin={hata} yeniden={yukle} /> : null}
      {!veri && !hata ? <Iskelet satir={5} /> : null}
      {taslak !== null ? (
        <div className="alan">
          <label className="gizli" htmlFor="defter-metin">
            {ajan.ad} defteri
          </label>
          <textarea id="defter-metin" className="metin-alani defter-metin" value={taslak} onChange={(e) => setTaslak(e.target.value)} spellCheck={false} autoFocus />
          <span className={taslak.length > 6000 ? "alan-hata" : "alan-ipucu"}>
            {taslak.length} / 6000 · ajan bir sonraki oturumunda bu hâliyle okur
          </span>
        </div>
      ) : veri ? (
        veri.icerik.trim() ? (
          <Markdown metin={veri.icerik} />
        ) : (
          <Bos kucuk baslik="Defter boş">{ajan.ad} ilk turunun sonunda açık işlerini ve verdiği sözleri buraya yazar.</Bos>
        )
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sorular
// ---------------------------------------------------------------------------

type SoruSuzgeci = "tumu" | AjanSorusu["durum"];
const SORU_SUZGECLERI: { k: SoruSuzgeci; ad: string }[] = [
  { k: "tumu", ad: "Tümü" },
  { k: "bekliyor", ad: "Bekleyen" },
  { k: "yanitlandi", ad: "Yanıtlanan" },
  { k: "zaman_asimi", ad: "Yanıtsız" },
];
const SORU_DURUM_ADLARI: Record<AjanSorusu["durum"], string> = { bekliyor: "Bekliyor", yanitlandi: "Yanıtlandı", zaman_asimi: "Yanıtsız" };

function sureMetni(baslangic: string, bitis: string): string {
  const sn = Math.max(0, Math.round((Date.parse(bitis) - Date.parse(baslangic)) / 1000));
  if (sn < 60) return `${sn} sn`;
  if (sn < 3600) return `${Math.round(sn / 60)} dk`;
  return `${Math.round(sn / 3600)} sa`;
}

function Sorular() {
  const sorular = useHafiza((d) => d.sorular);
  const ajanlar = useVeri((d) => d.ajanlar);
  const [suzgec, setSuzgec] = useState<SoruSuzgeci>("tumu");
  const gorunen = sorular.filter((s) => suzgec === "tumu" || s.durum === suzgec);

  if (!sorular.length)
    return (
      <Bos kucuk baslik="Henüz soru yok">
        Bir çalışan bilmediği bir şeyi ekip arkadaşına ajana_sor ile sorduğunda soru ve yanıt burada görünür. Kime soracağını bilmeyenin sorusunu ArnOrg
        hafızaya ve geçmiş işlere bakıp uzmana yönlendirir; aynı soru yeniden sorulursa önceki yanıt hemen verilir.
      </Bos>
    );

  return (
    <section aria-label="Ajanlar arası sorular">
      <div className="suzgec">
        <div className="bolumlu" role="group" aria-label="Duruma göre süz">
          {SORU_SUZGECLERI.map((s) => (
            <button key={s.k} type="button" aria-pressed={suzgec === s.k} onClick={() => setSuzgec(s.k)}>
              {s.ad} <span className="soluk sayi">{s.k === "tumu" ? sorular.length : sorular.filter((x) => x.durum === s.k).length}</span>
            </button>
          ))}
        </div>
      </div>
      <ol className="soru-liste">
        {gorunen.map((s) => {
          const soran = ajanlar.find((a) => a.id === s.soranId);
          const sorulan = ajanlar.find((a) => a.id === s.soruluId);
          return (
            <li key={s.id} className="soru-kayit" data-durum={s.durum}>
              <header className="sk-ust">
                <span className="sk-kisi">
                  {soran ? <AjanAvatar ajan={soran} boyut="xs" /> : <Avatar ad={s.soranAd} boyut="xs" />}
                  <b>{s.soranAd}</b>
                </span>
                <Simge ad="sag" boyut={12} />
                <span className="sk-kisi">
                  {sorulan ? <AjanAvatar ajan={sorulan} boyut="xs" /> : <Avatar ad={s.soruluAd} boyut="xs" />}
                  <b>{s.soruluAd}</b>
                </span>
                <span className={`hukum hukum-${s.durum}`}>{SORU_DURUM_ADLARI[s.durum]}</span>
                <time className="itele" dateTime={s.olusturma}>
                  {akilliZaman(s.olusturma)}
                </time>
              </header>
              <div className="sk-soru">
                <ZenginBlok metin={s.soru} />
              </div>
              {s.yanit ? (
                <div className="sk-yanit">
                  <ZenginBlok metin={s.yanit} />
                  {s.yanitlanma ? <small>{sureMetni(s.olusturma, s.yanitlanma)} içinde yanıtladı</small> : null}
                </div>
              ) : s.durum === "bekliyor" ? (
                <p className="sk-bekliyor">
                  <span className="nokta nokta-calisiyor" aria-hidden="true" />
                  {s.soruluAd} yanıtlıyor; {s.soranAd} bekliyor
                </p>
              ) : (
                <p className="sk-bekliyor soluk">Süre içinde yanıt gelmedi; {s.soranAd} güvenli yolla devam etti.</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
