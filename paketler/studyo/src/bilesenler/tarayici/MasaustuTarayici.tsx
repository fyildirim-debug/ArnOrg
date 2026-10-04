// Masaüstündeki uygulama içi tarayıcı: araç çubuğu (geri, ileri, yenile, adres, Öğe seç, görünüm genişliği,
// yükleniyor çubuğu) ve sahne. Sayfa ana süreçteki bir WebContentsView'dır; yeri sahnedeki çerçeveden gönderilir
// (yerlestir). Bir Stüdyo katmanı (not penceresi, çekmece, menü, kurul penceresi) çerçeveyle kesişince görünüm
// gizlenir, yerine son karesi konur; katman kapanınca görünüm geri gelir.
import type { MasaustuTarayicisi, TarayiciDurumu, TarayiciSecimi } from "@arnorg/ortak";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSozluk } from "../../dil";
import { hataBildir } from "../../durum/arayuz";
import { duzeltmeEkle } from "../../durum/duzeltmeler";
import { useMedya } from "../../yardimcilar/kancalar";
import { adresCoz } from "../../yardimcilar/tarayiciAdresi";
import { gorunumGenisligi, gorunumGenisliginiYaz, sonAdres, sonAdresiYaz } from "../../yardimcilar/tercihler";
import { Simge } from "../Simge";
import { anaTus, kisayol, useOrtenKatman } from "./katman";
import { NotPenceresi } from "./NotPenceresi";

type Genislik = 0 | 768 | 390;
const GENISLIKLER: Genislik[] = [0, 768, 390];
/** Yönergedeki hızlı yerel adresler */
const YEREL_ADRESLER = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"];

/** Görünümdeki sayfanın hangi projeye ait olduğu: ekran kapanıp açılınca sayfa yerinde kalır */
let sayfaProjesi: string | null = null;

/** Öğe seç simgesi: köşeli seçim alanı ve imleç */
function SecimSimgesi() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 5.5v-3h3M9.5 2.5h3v3M2.5 9.5v3h3" />
      <path d="m8.5 8.5 5.5 2-2.25 1-1 2.25z" />
    </svg>
  );
}

export function MasaustuTarayici({ kopru, pid, ortuyor }: { kopru: MasaustuTarayicisi; pid: string | null; ortuyor: boolean }) {
  const s = useSozluk();
  const t = s.tarayici;
  const [durum, setDurum] = useState<TarayiciDurumu | null>(null);
  const [secim, setSecim] = useState<TarayiciSecimi | null>(null);
  const [genislik, setGenislik] = useState<Genislik>(() => gorunumGenisligi() as Genislik);
  const [girdi, setGirdi] = useState("");
  const [girdiOdakta, setGirdiOdakta] = useState(false);
  const [donuk, setDonuk] = useState(false);
  const [kare, setKare] = useState<string | null>(null);
  const [boyut, setBoyut] = useState<{ g: number; y: number } | null>(null);
  const adresRef = useRef<HTMLInputElement>(null);
  const secDugmesiRef = useRef<HTMLButtonElement>(null);
  const sahneRef = useRef<HTMLDivElement>(null);
  const cerceveRef = useRef<HTMLDivElement>(null);
  const durumRef = useRef(durum);
  durumRef.current = durum;
  const secimRef = useRef(secim);
  secimRef.current = secim;
  const azHareket = useMedya("(prefers-reduced-motion: reduce)");

  const sayfaVar = !!durum?.adres;
  const hata = durum?.hata ?? null;
  const katman = useOrtenKatman(cerceveRef, sayfaVar && !hata);
  const ortulmeli = sayfaVar && !hata && (!!secim || ortuyor || katman);
  const yerde = sayfaVar && !hata && !donuk;

  const adresaOdaklan = useCallback(() => {
    adresRef.current?.focus();
    adresRef.current?.select();
  }, []);

  const seciciyiDegistir = useCallback(() => {
    const d = durumRef.current;
    if (!d?.adres || d.hata || secimRef.current) return;
    kopru.secici(!d.secici, t.secimIpucu);
  }, [kopru, t.secimIpucu]);

  // Durum, seçim ve kısayol olayları (sayfa odaktayken yakalanan Ctrl/Cmd+L ve Ctrl/Cmd+Shift+C dahil)
  useEffect(() => {
    let canli = true;
    void kopru.durum().then((d) => {
      if (canli && d) setDurum(d);
    });
    const birak = kopru.dinle((o) => {
      if (o.tur === "durum") setDurum(o.durum);
      else if (o.tur === "secim") setSecim(o.secim);
      else if (o.kisayol === "adres") adresaOdaklan();
      else seciciyiDegistir();
    });
    return () => {
      canli = false;
      birak();
      // Ekrandan çıkarken seçici kapanır, bekleyen seçimin çerçevesi kalkar
      if (durumRef.current?.secici) kopru.secici(false);
      if (secimRef.current) kopru.secimiBirak();
    };
  }, [kopru, adresaOdaklan, seciciyiDegistir]);

  // Proje değişince o projenin son adresi açılır; yoksa boş sayfa ve yönerge
  const durumGeldi = durum !== null;
  useEffect(() => {
    if (!pid || !durumGeldi || sayfaProjesi === pid) return;
    const onceki = sayfaProjesi;
    sayfaProjesi = pid;
    // Stüdyo yeniden açıldıysa görünümdeki sayfa bu projenindir
    if (onceki === null && durumRef.current?.adres) return;
    const son = sonAdres(pid);
    if (son) void kopru.git(son);
    else if (durumRef.current?.adres) void kopru.git("about:blank");
  }, [pid, durumGeldi, kopru]);

  // Açılan adres projenin son adresi olur
  useEffect(() => {
    if (pid && durum?.adres && !durum.hata && sayfaProjesi === pid) sonAdresiYaz(pid, durum.adres);
  }, [pid, durum?.adres, durum?.hata]);

  // Adres çubuğu yazılırken değişmez; odakta değilken görünümün adresini gösterir
  useEffect(() => {
    if (!girdiOdakta) setGirdi(durum?.adres ?? "");
  }, [durum?.adres, girdiOdakta]);

  // Katman görünümü örtecekse önce kare alınır, sonra görünüm gizlenir; katman kalkınca görünüm geri gelir
  useEffect(() => {
    let iptal = false;
    if (ortulmeli && !donuk) {
      void kopru.kare().then((k) => {
        if (iptal) return;
        setKare(k);
        setDonuk(true);
      });
    } else if (!ortulmeli && donuk) {
      setDonuk(false);
      setKare(null);
    }
    return () => {
      iptal = true;
    };
  }, [ortulmeli, donuk, kopru]);

  // Görünümün yeri: çerçevenin pencere içindeki kutusu; boyut ve konum değişince yeniden gönderilir
  useEffect(() => {
    const el = cerceveRef.current;
    if (!yerde || !el) {
      kopru.yerlestir(null);
      return;
    }
    let son = "";
    const gonder = () => {
      const r = el.getBoundingClientRect();
      const anahtar = `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;
      if (anahtar === son) return;
      son = anahtar;
      kopru.yerlestir({ x: r.left, y: r.top, genislik: r.width, yukseklik: r.height });
    };
    gonder();
    const gozcu = new ResizeObserver(gonder);
    gozcu.observe(el);
    gozcu.observe(document.documentElement);
    window.addEventListener("resize", gonder);
    // Boyutu değişmeden kayan çerçeve (üstte şerit açıldı) için seyrek denetim
    const zamanlayici = window.setInterval(gonder, 500);
    return () => {
      gozcu.disconnect();
      window.removeEventListener("resize", gonder);
      window.clearInterval(zamanlayici);
      kopru.yerlestir(null);
    };
  }, [kopru, yerde, genislik]);

  // Çerçevenin boyutu (dar görünümlerde altında yazılır)
  useEffect(() => {
    const el = cerceveRef.current;
    if (!el) return;
    const olc = () => setBoyut({ g: Math.round(el.clientWidth), y: Math.round(el.clientHeight) });
    olc();
    const gozcu = new ResizeObserver(olc);
    gozcu.observe(el);
    return () => gozcu.disconnect();
  }, []);

  // Klavye: Ctrl/Cmd+L adres çubuğu, Ctrl/Cmd+Shift+C öğe seç, Esc seçiciden çıkar
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (anaTus(e) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (!e.shiftKey && (k === "l" || e.code === "KeyL")) {
          e.preventDefault();
          adresaOdaklan();
          return;
        }
        if (e.shiftKey && (k === "c" || e.code === "KeyC")) {
          e.preventDefault();
          seciciyiDegistir();
          return;
        }
      }
      if (e.key === "Escape" && durumRef.current?.secici && !secimRef.current) kopru.secici(false);
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [kopru, adresaOdaklan, seciciyiDegistir]);

  const git = (adres: string) => {
    const hedef = adresCoz(adres);
    if (!hedef) return;
    if (pid) sayfaProjesi = pid;
    void kopru.git(hedef).then((tamam) => {
      if (!tamam) hataBildir(new Error(t.web.adresHata));
    });
  };

  const adresGonder = (e: FormEvent) => {
    e.preventDefault();
    git(girdi);
    adresRef.current?.blur();
  };

  const genislikSec = (g: Genislik) => {
    setGenislik(g);
    gorunumGenisliginiYaz(g);
  };

  const secimiKapat = () => {
    setSecim(null);
    kopru.secimiBirak();
    requestAnimationFrame(() => secDugmesiRef.current?.focus());
  };

  const notuKaydet = async (not: string, yenisiniSec: boolean) => {
    const sc = secimRef.current;
    if (!sc || !pid) return;
    await duzeltmeEkle(pid, {
      adres: sc.adres,
      sayfaBasligi: sc.sayfaBasligi,
      secici: sc.secici,
      ogeMetni: sc.ogeMetni || null,
      ogeHtml: sc.ogeHtml || null,
      stiller: sc.stiller,
      kutu: sc.kutu,
      gorunum: sc.gorunum,
      not,
      gorsel: sc.gorsel,
    });
    setSecim(null);
    kopru.secimiBirak();
    if (yenisiniSec) kopru.secici(true, t.secimIpucu);
    else requestAnimationFrame(() => secDugmesiRef.current?.focus());
  };

  const yukleniyor = !!durum?.yukleniyor;
  const https = !!durum?.adres.startsWith("https://");
  const genislikAdi = (g: Genislik) => (g === 0 ? t.arac.masaustu : g === 768 ? t.arac.tablet : t.arac.telefon);

  return (
    <>
      <div className="tarayici-arac" role="toolbar" aria-label={t.arac.etiket}>
        <div className="tarayici-gezinme">
          <button type="button" className="dugme dugme-sessiz dugme-simge" aria-label={t.arac.geri} title={t.arac.geri} disabled={!durum?.geriGidebilir} onClick={() => kopru.geri()}>
            <Simge ad="geri" />
          </button>
          <button type="button" className="dugme dugme-sessiz dugme-simge" aria-label={t.arac.ileri} title={t.arac.ileri} disabled={!durum?.ileriGidebilir} onClick={() => kopru.ileri()}>
            <Simge ad="gonder" />
          </button>
          {yukleniyor ? (
            <button type="button" className="dugme dugme-sessiz dugme-simge" aria-label={t.arac.durdur} title={t.arac.durdur} onClick={() => kopru.durdur()}>
              <Simge ad="kapat" />
            </button>
          ) : (
            <button type="button" className="dugme dugme-sessiz dugme-simge" aria-label={t.arac.yenile} title={t.arac.yenile} disabled={!sayfaVar && !hata} onClick={() => kopru.yenile()}>
              <Simge ad="yenile" />
            </button>
          )}
        </div>
        <form className="tarayici-adres" onSubmit={adresGonder} role="search">
          <span className="tarayici-adres-isaret" aria-hidden="true">
            {https ? <Simge ad="kilit" boyut={12} /> : <Simge ad="kure" boyut={12} />}
          </span>
          <input
            ref={adresRef}
            className="tarayici-adres-girdi"
            aria-label={t.arac.adres}
            title={t.arac.adresBaslik(kisayol("L"))}
            placeholder={t.arac.adresIpucu}
            value={girdi}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="go"
            onChange={(e) => setGirdi(e.target.value)}
            onFocus={(e) => {
              setGirdiOdakta(true);
              e.currentTarget.select();
            }}
            onBlur={() => setGirdiOdakta(false)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              setGirdi(durum?.adres ?? "");
              e.currentTarget.blur();
            }}
          />
        </form>
        <button
          type="button"
          ref={secDugmesiRef}
          className="dugme tarayici-sec"
          aria-pressed={!!durum?.secici}
          disabled={!sayfaVar || !!hata || !!secim}
          title={t.arac.secBaslik(kisayol("Shift+C"))}
          onClick={seciciyiDegistir}
        >
          <SecimSimgesi />
          {t.arac.sec}
        </button>
        <div className="bolumlu tarayici-genislik" role="group" aria-label={t.arac.genislik}>
          {GENISLIKLER.map((g) => (
            <button key={g} type="button" aria-pressed={genislik === g} onClick={() => genislikSec(g)}>
              {genislikAdi(g)}
            </button>
          ))}
        </div>
        <div className={`tarayici-yukleme${azHareket ? " tarayici-yukleme-sabit" : ""}`} role="progressbar" aria-label={t.yukleniyor} hidden={!yukleniyor} />
      </div>

      <div className="tarayici-sahne" ref={sahneRef} data-genislik={genislik || undefined}>
        <div className="tarayici-cerceve" ref={cerceveRef} style={genislik ? { width: `min(${genislik}px, 100%)` } : undefined}>
          {!sayfaVar && !hata ? (
            <div className="tarayici-yonerge">
              <h2>{t.yonerge.baslik}</h2>
              <ol>
                <li>{t.yonerge.adim1}</li>
                <li>{t.yonerge.adim2}</li>
                <li>{t.yonerge.adim3}</li>
              </ol>
              <div className="tarayici-yonerge-hizli">
                <span>{t.yonerge.hizli}</span>
                <div className="dugme-satir">
                  {YEREL_ADRESLER.map((a) => (
                    <button key={a} type="button" className="dugme dugme-kucuk" onClick={() => git(a)}>
                      {a.replace("http://", "")}
                    </button>
                  ))}
                </div>
              </div>
              <p className="tarayici-yonerge-kisayol">{t.yonerge.kisayollar(kisayol("L"), kisayol("Shift+C"))}</p>
            </div>
          ) : null}
          {hata ? (
            <div className="tarayici-hata" role="alert">
              <b>{t.hata.baslik}</b>
              <code>{hata}</code>
              <p>{t.hata.ipucu}</p>
              <div className="dugme-satir">
                <button type="button" className="dugme dugme-kucuk" onClick={() => kopru.yenile()}>
                  {s.genel.yenidenDene}
                </button>
              </div>
            </div>
          ) : null}
          {donuk ? kare ? <img className="tarayici-kare" src={kare} alt={t.kare} draggable={false} /> : <div className="tarayici-kare" aria-hidden="true" /> : null}
        </div>
        {genislik && boyut ? (
          <p className="tarayici-boyut sayi" aria-live="off">
            {genislikAdi(genislik)} · {t.boyut(boyut.g, boyut.y)}
          </p>
        ) : null}
        {secim ? <NotPenceresi secim={secim} sahne={sahneRef} cerceve={cerceveRef} kaydet={notuKaydet} vazgec={secimiKapat} /> : null}
      </div>
    </>
  );
}
