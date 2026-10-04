// Klasör seçici: masaüstünde sistemin seçicisi (arnorg.klasorSec), tarayıcıda çekirdeğin dizin uçlarıyla gezgin
// penceresi (kısayollar, üst klasör, alt klasörler, git depoları işaretli, yeni klasör). Klavyeyle kullanılır:
// odak pencerede kalır, Escape kapatır, oklar klasörler arasında gezer, Backspace üst klasöre çıkar.
import type { DizinListesi } from "@arnorg/ortak";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { useSozluk } from "../dil";
import { HataKutu, Yukleniyor } from "./Durumlar";
import { masaustu, mutlakMi, yolParcalari } from "./kurulumYardimcilari";
import { Simge } from "./Simge";

export interface KlasorSecimi {
  baslik: string;
  /** Açılışta gösterilecek klasör; yoksa ev klasörü */
  varsayilan?: string | null;
}

/**
 * Bileşende: const { sec, pencere } = useKlasorSecici(); ... const yol = await sec({ baslik });
 * `pencere` ağaçta bir yere konur (tarayıcıdaki gezgin orada açılır).
 */
export function useKlasorSecici() {
  const [istek, setIstek] = useState<(KlasorSecimi & { coz: (yol: string | null) => void }) | null>(null);

  const sec = useCallback(async (secenek: KlasorSecimi): Promise<string | null> => {
    const k = masaustu();
    if (k?.klasorSec) {
      try {
        return await k.klasorSec({ baslik: secenek.baslik, varsayilan: secenek.varsayilan ?? undefined });
      } catch {
        // Masaüstü seçicisi açılamadı: tarayıcı gezginiyle sürdür
      }
    }
    return new Promise<string | null>((coz) => setIstek({ ...secenek, coz }));
  }, []);

  const pencere = istek ? (
    <DizinGezgini
      baslik={istek.baslik}
      varsayilan={istek.varsayilan ?? undefined}
      sonuc={(yol) => {
        istek.coz(yol);
        setIstek(null);
      }}
    />
  ) : null;

  return { sec, pencere };
}

const ODAKLANABILIR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DizinGezgini({ baslik, varsayilan, sonuc }: { baslik: string; varsayilan?: string; sonuc: (yol: string | null) => void }) {
  const s = useSozluk();
  const t = s.kurulum.gezgin;
  const baslikId = useId();
  const yolId = useId();
  const yeniId = useId();
  const [liste, setListe] = useState<DizinListesi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [yolGirdisi, setYolGirdisi] = useState<string | null>(null);
  const [yolHata, setYolHata] = useState<string | null>(null);
  const [yeniAd, setYeniAd] = useState<string | null>(null);
  const [yeniHata, setYeniHata] = useState<string | null>(null);
  const [olusturuluyor, setOlusturuluyor] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const konumRef = useRef<HTMLOListElement>(null);
  const istekNo = useRef(0);
  const odakListeye = useRef(true);
  const sonucRef = useRef(sonuc);
  sonucRef.current = sonuc;

  /** Klasörü açar; başarısızsa false. geriDus: açılamazsa ev klasörüne düş */
  const yukle = useCallback(async (yol?: string, geriDus = false): Promise<boolean> => {
    const no = ++istekNo.current;
    setYukleniyor(true);
    setHata(null);
    try {
      const l = await api.dizinler(yol);
      if (no !== istekNo.current) return true;
      setListe(l);
      setYukleniyor(false);
      return true;
    } catch (e) {
      if (no !== istekNo.current) return false;
      if (geriDus && yol) return yukle(undefined, false);
      setHata(hataMetni(e));
      setYukleniyor(false);
      return false;
    }
  }, []);

  useEffect(() => {
    void yukle(varsayilan, true);
  }, [yukle, varsayilan]);

  // Yeni klasöre geçince odak listenin başına (klavyeyle gezinme sürsün); konum çubuğu sona kaysın
  useEffect(() => {
    if (!liste) return;
    if (konumRef.current) konumRef.current.scrollLeft = konumRef.current.scrollWidth;
    if (!odakListeye.current) return;
    odakListeye.current = false;
    const ilk = listeRef.current?.querySelector<HTMLElement>(".gezgin-oge");
    (ilk ?? kutuRef.current?.querySelector<HTMLElement>(".gezgin-sec .dugme-ana"))?.focus();
  }, [liste]);

  // Odak tuzağı, Escape ve kapanınca odağı geri verme
  useEffect(() => {
    const onceki = document.activeElement as HTMLElement | null;
    const kutu = kutuRef.current;
    kutu?.focus();
    const tus = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        // Kendi Escape'i olan alan (yeni klasör, yol yazma) önce kendisini kapatır
        if ((e.target as HTMLElement | null)?.closest?.("[data-kendi-escape]")) return;
        e.stopPropagation();
        e.preventDefault();
        sonucRef.current(null);
        return;
      }
      if (e.key !== "Tab" || !kutu) return;
      const ogeler = Array.from(kutu.querySelectorAll<HTMLElement>(ODAKLANABILIR)).filter((o) => o.offsetParent !== null);
      if (!ogeler.length) return;
      const bas = ogeler[0]!;
      const son = ogeler[ogeler.length - 1]!;
      // Odak pencere dışına düştüyse (odaktaki öğe kaybolduysa) içeri geri al
      if (!kutu.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? son : bas).focus();
      } else if (e.shiftKey && (document.activeElement === bas || document.activeElement === kutu)) {
        e.preventDefault();
        son.focus();
      } else if (!e.shiftKey && document.activeElement === son) {
        e.preventDefault();
        bas.focus();
      }
    };
    document.addEventListener("keydown", tus);
    return () => {
      document.removeEventListener("keydown", tus);
      onceki?.focus?.();
    };
  }, []);

  const git = (yol: string, listeden = false) => {
    odakListeye.current = listeden;
    setYolHata(null);
    void yukle(yol);
  };

  const ust = (listeden = false) => {
    if (liste?.ust) git(liste.ust, listeden);
  };

  const listeTus = (e: KeyboardEvent<HTMLUListElement>) => {
    const ogeler = Array.from(listeRef.current?.querySelectorAll<HTMLElement>(".gezgin-oge") ?? []);
    const i = ogeler.indexOf(document.activeElement as HTMLElement);
    const odakla = (n: number) => ogeler[Math.max(0, Math.min(ogeler.length - 1, n))]?.focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      odakla(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      odakla(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      odakla(0);
    } else if (e.key === "End") {
      e.preventDefault();
      odakla(ogeler.length - 1);
    } else if (e.key === "Backspace" || (e.key === "ArrowLeft" && e.altKey)) {
      e.preventDefault();
      ust(true);
    }
  };

  // Gezgin portalda açılsa da React olayları ağaçta yukarı çıkar: dıştaki proje formu gönderilmesin
  const yolaGit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const yol = (yolGirdisi ?? "").trim();
    if (!mutlakMi(yol)) {
      setYolHata(s.kurulum.konum.mutlak);
      return;
    }
    odakListeye.current = true;
    const oldu = await yukle(yol);
    if (oldu) {
      setYolGirdisi(null);
      setYolHata(null);
    }
  };

  const olustur = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!liste) return;
    const ad = (yeniAd ?? "").trim();
    if (!ad) {
      setYeniHata(t.yeniKlasorAd);
      return;
    }
    setOlusturuluyor(true);
    setYeniHata(null);
    try {
      const { yol } = await api.dizinOlustur(liste.yol, ad);
      setYeniAd(null);
      odakListeye.current = true;
      await yukle(yol);
    } catch (h) {
      setYeniHata(hataMetni(h));
    } finally {
      setOlusturuluyor(false);
    }
  };

  const parcalar = liste ? yolParcalari(liste.yol) : [];

  return createPortal(
    <>
      <div className="perde" onClick={() => sonuc(null)} aria-hidden="true" />
      <div className="gezgin" role="dialog" aria-modal="true" aria-labelledby={baslikId} ref={kutuRef} tabIndex={-1}>
        <div className="gezgin-ust">
          <h2 id={baslikId}>{baslik}</h2>
          <button type="button" className="dugme dugme-sessiz dugme-simge" onClick={() => sonuc(null)} aria-label={s.genel.kapat}>
            <Simge ad="kapat" />
          </button>
        </div>

        <div className="gezgin-govde">
          <nav className="gezgin-kisayollar" aria-label={t.kisayollar}>
            <ul>
              {(liste?.kisayollar ?? []).map((k, i) => (
                <li key={`${k.yol}-${k.ad}`}>
                  <button type="button" onClick={() => git(k.yol)} aria-current={liste?.yol === k.yol ? "location" : undefined}>
                    <Simge ad={i === 0 ? "ev" : "klasor"} boyut={14} />
                    <span className="tek-satir">{k.ad}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="gezgin-ana">
            <div className="gezgin-konum">
              <button
                type="button"
                className="dugme dugme-kucuk dugme-sessiz dugme-simge"
                onClick={() => ust()}
                disabled={!liste?.ust || yukleniyor}
                aria-label={t.ust}
                title={t.ust}
              >
                <Simge ad="yukari" />
              </button>
              {yolGirdisi === null ? (
                <ol className="gezgin-yol" aria-label={t.konum} ref={konumRef}>
                  {parcalar.map((p, i) => (
                    <li key={p.yol}>
                      <button type="button" onClick={() => git(p.yol)} aria-current={i === parcalar.length - 1 ? "location" : undefined}>
                        {p.ad}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <form className="gezgin-yol-form" onSubmit={(e) => void yolaGit(e)} noValidate>
                  <label className="gizli" htmlFor={yolId}>
                    {t.yolEtiket}
                  </label>
                  <input
                    id={yolId}
                    className="girdi"
                    value={yolGirdisi}
                    onChange={(e) => setYolGirdisi(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                    aria-invalid={yolHata ? true : undefined}
                    data-kendi-escape=""
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setYolGirdisi(null);
                        setYolHata(null);
                      }
                    }}
                  />
                  <button type="submit" className="dugme dugme-kucuk">
                    {t.yolGit}
                  </button>
                </form>
              )}
              <button
                type="button"
                className="dugme dugme-kucuk dugme-sessiz"
                aria-pressed={yolGirdisi !== null}
                onClick={() => {
                  setYolHata(null);
                  setYolGirdisi(yolGirdisi === null ? (liste?.yol ?? "") : null);
                }}
              >
                {t.yolYaz}
              </button>
            </div>
            {yolHata ? (
              <p className="alan-hata gezgin-yol-hata" role="alert">
                {yolHata}
              </p>
            ) : null}

            <div className={`gezgin-liste-kap${yukleniyor && liste ? " gezgin-yukleniyor" : ""}`} aria-busy={yukleniyor}>
              {hata ? (
                <div className="gezgin-hata">
                  <HataKutu baslik={t.alinamadi} metin={hata} yeniden={() => void yukle(liste?.yol)} />
                  <div>
                    <button type="button" className="dugme dugme-kucuk" onClick={() => git("")}>
                      <Simge ad="ev" />
                      {t.evDon}
                    </button>
                  </div>
                </div>
              ) : !liste ? (
                <Yukleniyor metin={t.yukleniyor} />
              ) : liste.dizinler.length === 0 ? (
                <p className="gezgin-bos">{t.bos}</p>
              ) : (
                <ul className="gezgin-liste" ref={listeRef} aria-label={t.klasorler} onKeyDown={listeTus}>
                  {liste.dizinler.map((d) => (
                    <li key={d.yol}>
                      <button type="button" className="gezgin-oge" onClick={() => git(d.yol, true)}>
                        <Simge ad="klasor" boyut={14} />
                        <span className="tek-satir">{d.ad}</span>
                        {d.repo ? (
                          <span className="etiket gezgin-repo" title={t.repoBaslik}>
                            <Simge ad="dal" boyut={10} />
                            {t.repo}
                          </span>
                        ) : null}
                        <Simge ad="sag" boyut={12} className="gezgin-ok" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="gezgin-klavye">{t.klavye}</p>
          </div>
        </div>

        <div className="gezgin-alt">
          {yeniAd === null ? (
            <button type="button" className="dugme" onClick={() => setYeniAd("")} disabled={!liste || !!hata}>
              <Simge ad="arti" />
              {t.yeniKlasor}
            </button>
          ) : (
            <form className="gezgin-yeni" onSubmit={(e) => void olustur(e)} noValidate>
              <label className="gizli" htmlFor={yeniId}>
                {t.yeniKlasorAd}
              </label>
              <input
                id={yeniId}
                className="girdi"
                value={yeniAd}
                onChange={(e) => setYeniAd(e.target.value)}
                placeholder={t.yeniKlasorAd}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                aria-invalid={yeniHata ? true : undefined}
                data-kendi-escape=""
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    // Yalnız yeni klasör alanını kapat; pencere açık kalsın
                    e.preventDefault();
                    setYeniAd(null);
                    setYeniHata(null);
                  }
                }}
              />
              <button type="submit" className="dugme" disabled={olusturuluyor}>
                {olusturuluyor ? <span className="doner" aria-hidden="true" /> : null}
                {t.olustur}
              </button>
              <button
                type="button"
                className="dugme dugme-sessiz"
                onClick={() => {
                  setYeniAd(null);
                  setYeniHata(null);
                }}
              >
                {s.genel.vazgec}
              </button>
              {yeniHata ? (
                <span className="alan-hata" role="alert">
                  {yeniHata}
                </span>
              ) : null}
            </form>
          )}
          <div className="gezgin-sec">
            <span className="gezgin-secilecek">
              <small>{t.secilecek}</small>
              <code className="tek-satir" title={liste?.yol}>
                {liste?.yol ?? "…"}
              </code>
            </span>
            <button type="button" className="dugme dugme-sessiz" onClick={() => sonuc(null)}>
              {s.genel.vazgec}
            </button>
            <button type="button" className="dugme dugme-ana" disabled={!liste || yukleniyor || !!hata} onClick={() => liste && sonuc(liste.yol)}>
              {t.sec}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
