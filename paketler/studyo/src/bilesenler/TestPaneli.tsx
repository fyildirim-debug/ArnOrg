// Teslim testi: proje bitince kurul burada dener. Test adımları işaretlenir; çalıştır komutu ana repoda terminalde
// çalışır, çıktı canlı akar (renk kodları ayıklanmış, eşaralıklı, sonda kalır); adres tarayıcıda açılır. Sonunda kabul
// edilir ya da notu zorunlu geri bildirim CEO'ya iş olarak gider. Her ekrandan açılabilen çekmece (KurulBildirimleri çizer).
import type { MasaustuKoprusu, Onay } from "@arnorg/ortak";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { hataMetni } from "../api/istek";
import { terminalAc, type TerminalOturumu } from "../api/terminal";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { ajanaGit, bildir } from "../durum/arayuz";
import { onaylardaAc, testAdimlariniOku, testAdimlariniYaz } from "../durum/sohbet";
import { ceoBul, onayUygula, useVeri } from "../durum/veri";
import { akilliZaman } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";
import { useAltaYapisik } from "./altaYapis";
import { Cekmece } from "./Cekmece";
import { Bos, Iskelet } from "./Durumlar";
import { AjanAvatar } from "./Kisi";
import { ilkParagraf, teslimVerisi } from "./onayVerisi";
import { Simge } from "./Simge";
import { TerminalMetni } from "./terminalMetni";

/** Http(s) adresini masaüstünde sistem tarayıcısında, tarayıcıda yeni sekmede açar */
export function disaridaAc(adres: string) {
  const kopru = (window as Window & { arnorg?: MasaustuKoprusu }).arnorg;
  if (kopru?.disaridaAc) {
    void kopru.disaridaAc(adres);
    return;
  }
  window.open(adres, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// Teslim kararı: kabul ya da notu zorunlu geri bildirim (Onaylar'daki teslim öğesi de kullanır)
// ---------------------------------------------------------------------------

export function TeslimKarari({
  onay,
  ceoAdi,
  isaretsiz = 0,
  onDugme,
  kabulAna = true,
  aciklayan,
  kilitli,
  sonra,
}: {
  onay: Onay;
  /** Geri bildirimin gideceği CEO */
  ceoAdi: string;
  /** İşaretlenmemiş test adımı sayısı (notta hatırlatılır) */
  isaretsiz?: number;
  /** Kabulün önüne konan düğme (Onaylar'da "Test et") */
  onDugme?: ReactNode;
  /** Kabul ana düğme mi (test panelinde evet; Onaylar'da ana düğme Test et) */
  kabulAna?: boolean;
  aciklayan?: string;
  kilitli?: boolean;
  /** Karar verilince (çekmeceyi kapatmak için) */
  sonra?: () => void;
}) {
  const s = useSozluk();
  const t = s.sohbet.test;
  const [notAcik, setNotAcik] = useState(false);
  const [not, setNot] = useState("");
  const [hata, setHata] = useState(false);
  const notRef = useRef<HTMLTextAreaElement>(null);
  const notId = useId();
  const hataId = useId();
  const { suruyor, calistir } = useIslem();
  const baslik = teslimVerisi(onay.veri).baslik ?? onay.baslik;

  const kabul = () =>
    calistir("kabul", async () => {
      const sonuc = await api.onayKarari(onay.id, { karar: "onayla" });
      onayUygula(sonuc);
      bildir("basari", sozluk().sohbet.test.kabulEdildi(baslik));
      sonra?.();
    });

  const geriBildirim = () => {
    if (!notAcik) {
      setNotAcik(true);
      requestAnimationFrame(() => notRef.current?.focus());
      return;
    }
    const temiz = not.trim();
    if (!temiz) {
      setHata(true);
      notRef.current?.focus();
      return;
    }
    void calistir("geri", async () => {
      const sonuc = await api.onayKarari(onay.id, { karar: "reddet", not: temiz });
      onayUygula(sonuc);
      bildir("bilgi", sozluk().sohbet.test.geriBildirimGitti(ceoAdi));
      sonra?.();
    });
  };

  const kapali = suruyor !== null || !!kilitli;
  return (
    <div className="teslim-karar">
      {notAcik ? (
        <div className="teslim-not">
          <label htmlFor={notId}>{t.notEtiketi}</label>
          <textarea
            id={notId}
            ref={notRef}
            className="metin-alani"
            rows={3}
            value={not}
            onChange={(e) => {
              setNot(e.target.value);
              if (hata && e.target.value.trim()) setHata(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) geriBildirim();
            }}
            placeholder={t.notYer(ceoAdi)}
            aria-invalid={hata || undefined}
            aria-describedby={hata ? hataId : undefined}
          />
          {hata ? (
            <p className="alan-hata" id={hataId} role="alert">
              {t.notGerekli}
            </p>
          ) : isaretsiz ? (
            <p className="alan-ipucu">{t.isaretsiz(isaretsiz)}</p>
          ) : null}
        </div>
      ) : null}
      <div className="onay-karar-dugmeler">
        {onDugme}
        <button type="button" className={`dugme onay-dugme${kabulAna ? " dugme-ana" : ""}`} onClick={() => void kabul()} disabled={kapali} aria-describedby={aciklayan}>
          {suruyor === "kabul" ? <span className="doner" aria-hidden="true" /> : null}
          {t.kabul}
        </button>
        <button type="button" className="dugme onay-dugme" onClick={geriBildirim} disabled={kapali} aria-describedby={aciklayan} aria-expanded={notAcik}>
          {suruyor === "geri" ? <span className="doner" aria-hidden="true" /> : null}
          {t.geriBildirim}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type TerminalDurumu = "kapali" | "aciliyor" | "acik" | "kapandi";

export function TestPaneli({ onayId, kapat }: { onayId: string; kapat: () => void }) {
  const s = useSozluk();
  const t = s.sohbet.test;
  const onay = useVeri((d) => d.onaylar.find((o) => o.id === onayId));
  const projeYukleme = useVeri((d) => d.projeYukleme);
  const ajanlar = useVeri((d) => d.ajanlar);
  const pid = useVeri((d) => d.aktifProjeId);
  const ajan = onay?.ajanId ? ajanlar.find((a) => a.id === onay.ajanId) : undefined;
  const ceoAdi = ceoBul(ajanlar)?.ad ?? ajan?.ad ?? "CEO";
  const v = useMemo(() => teslimVerisi(onay?.veri), [onay?.veri]);
  const baslikId = useId();

  if (!onay) {
    return (
      <Cekmece baslik={t.baslik} kapat={kapat}>
        {projeYukleme === "yukleniyor" ? (
          <Iskelet satir={6} />
        ) : (
          <Bos
            kucuk
            baslik={t.bulunamadi}
            eylem={
              <button
                type="button"
                className="dugme dugme-kucuk"
                onClick={() => {
                  onaylardaAc(null);
                  kapat();
                }}
              >
                {s.sohbet.bildirim.onaylardaAc}
              </button>
            }
          >
            {t.bulunamadiMetin}
          </Bos>
        )}
      </Cekmece>
    );
  }

  const ozet = v.ozet ?? ilkParagraf(onay.ayrinti);
  const bekliyor = onay.durum === "bekliyor";

  return (
    <Cekmece
      baslik={t.baslik}
      kapat={kapat}
      alt={bekliyor ? <PanelKarari onay={onay} ceoAdi={ceoAdi} adimSayisi={v.testAdimlari.length} aciklayan={baslikId} kapat={kapat} /> : undefined}
    >
      <div className="test-paneli">
        <header className="test-kimlik">
          <h3 id={baslikId}>{v.baslik ?? onay.baslik}</h3>
          <p className="test-meta">
            <span className="test-meta-etiket">{t.teslimEden}</span>
            {ajan ? (
              <button type="button" className="onay-kisi" onClick={() => ajanaGit(ajan.id)} title={s.genel.oturumuAc(ajan.ad)}>
                <AjanAvatar ajan={ajan} boyut="xs" />
                <b>{ajan.ad}</b>
                <span className="onay-rol">{ajan.rolAdi}</span>
              </button>
            ) : (
              <b>{onay.ajanId ?? s.genel.arnorg}</b>
            )}
            {v.dal ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="test-meta-etiket">{t.dal}</span>
                <code>{v.dal}</code>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <time dateTime={onay.olusturma}>{akilliZaman(onay.olusturma)}</time>
          </p>
          {!bekliyor ? <p className="test-sonuc">{onay.kararKaynagi === "ceo" ? s.karar.teslimSonucu(onay.kararVerenAd) : t.sonuclandi(s.onaylar.durum[onay.durum])}</p> : null}
        </header>

        {ozet ? (
          <section className="test-bolum" aria-label={t.ozet}>
            <p className="test-ozet">{ozet}</p>
          </section>
        ) : null}

        <TestAdimlari onayId={onay.id} adimlar={v.testAdimlari} />

        <Calistirma komut={v.calistir} projeId={pid} />

        {v.adres ? (
          <section className="test-bolum">
            <h4 className="test-bolum-baslik">{t.adres}</h4>
            <div className="test-adres">
              <code className="tek-satir">{v.adres}</code>
              <button type="button" className="dugme dugme-kucuk" onClick={() => disaridaAc(v.adres!)}>
                <Simge ad="dis" boyut={12} />
                {t.ac}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </Cekmece>
  );
}

/** Çekmecenin alt şeridindeki karar; işaretlenmemiş adım sayısı test adımlarından okunur */
function PanelKarari({ onay, ceoAdi, adimSayisi, aciklayan, kapat }: { onay: Onay; ceoAdi: string; adimSayisi: number; aciklayan: string; kapat: () => void }) {
  const isaretli = useIsaretliAdimlar(onay.id);
  return <TeslimKarari onay={onay} ceoAdi={ceoAdi} isaretsiz={Math.max(0, adimSayisi - isaretli.length)} aciklayan={aciklayan} sonra={kapat} />;
}

// İşaretler bu tarayıcıda saklanır; panelin iki parçası (liste ve karar) aynı kaynağı dinler
const isaretDinleyicileri = new Set<() => void>();

function useIsaretliAdimlar(onayId: string): number[] {
  const [isaretli, setIsaretli] = useState(() => testAdimlariniOku(onayId));
  useEffect(() => {
    const dinle = () => setIsaretli(testAdimlariniOku(onayId));
    isaretDinleyicileri.add(dinle);
    return () => {
      isaretDinleyicileri.delete(dinle);
    };
  }, [onayId]);
  return isaretli;
}

function TestAdimlari({ onayId, adimlar }: { onayId: string; adimlar: string[] }) {
  const s = useSozluk();
  const t = s.sohbet.test;
  const isaretli = useIsaretliAdimlar(onayId);
  const baslikId = useId();

  const degistir = (i: number) => {
    const yeni = isaretli.includes(i) ? isaretli.filter((x) => x !== i) : [...isaretli, i].sort((a, b) => a - b);
    testAdimlariniYaz(onayId, yeni);
    isaretDinleyicileri.forEach((d) => d());
  };

  return (
    <section className="test-bolum" aria-labelledby={baslikId}>
      <h4 className="test-bolum-baslik" id={baslikId}>
        {t.adimlar}
        {adimlar.length ? <small className="sayi">{t.adimSayisi(isaretli.filter((i) => i < adimlar.length).length, adimlar.length)}</small> : null}
      </h4>
      {adimlar.length ? (
        <ol className="test-adimlari">
          {adimlar.map((adim, i) => {
            const tamam = isaretli.includes(i);
            return (
              <li key={i}>
                <label className={`test-adim${tamam ? " test-adim-tamam" : ""}`}>
                  <input type="checkbox" checked={tamam} onChange={() => degistir(i)} />
                  <span className="test-adim-no sayi">{i + 1}</span>
                  <span className="test-adim-metin">{adim}</span>
                </label>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="soluk test-not">{t.adimYok}</p>
      )}
    </section>
  );
}

/** Komutu ana repoda terminalde çalıştırır; çıktı canlı akar */
function Calistirma({ komut, projeId }: { komut: string | null; projeId: string | null }) {
  const s = useSozluk();
  const t = s.sohbet.test;
  const [durum, setDurum] = useState<TerminalDurumu>("kapali");
  const [hata, setHata] = useState<string | null>(null);
  const [cikti, setCikti] = useState("");
  const [girdi, setGirdi] = useState("");
  const oturum = useRef<TerminalOturumu | null>(null);
  const tampon = useRef(new TerminalMetni(1500));
  const cizim = useRef(0);
  const bagli = useRef(true);
  const girdiId = useId();
  const baslikId = useId();
  const { ref, kaydirildi } = useAltaYapisik<HTMLPreElement>({ sayi: 0, degisim: cikti });

  useEffect(() => {
    bagli.current = true;
    return () => {
      bagli.current = false;
      oturum.current?.kapat();
      oturum.current = null;
      if (cizim.current) cancelAnimationFrame(cizim.current);
      cizim.current = 0;
    };
  }, []);

  // Parça parça gelen çıktı kare başına bir kez çizilir
  const ciz = () => {
    if (cizim.current) return;
    cizim.current = requestAnimationFrame(() => {
      cizim.current = 0;
      if (bagli.current) setCikti(tampon.current.metin());
    });
  };

  const ac = async (): Promise<TerminalOturumu | null> => {
    if (oturum.current) return oturum.current;
    if (!projeId) return null;
    setDurum("aciliyor");
    setHata(null);
    try {
      const o = await terminalAc({
        projeId,
        alan: "ana",
        sutun: 120,
        satir: 32,
        veri: (m) => {
          tampon.current.ekle(m);
          ciz();
        },
        kapandi: () => {
          oturum.current = null;
          if (bagli.current) setDurum("kapandi");
        },
      });
      if (!bagli.current) {
        o.kapat();
        return null;
      }
      oturum.current = o;
      setDurum("acik");
      return o;
    } catch (e) {
      if (bagli.current) {
        setDurum("kapali");
        setHata(hataMetni(e));
      }
      return null;
    }
  };

  const calistir = async () => {
    if (!komut) return;
    const o = await ac();
    o?.gonder(`${komut}\r`);
  };

  const durdur = () => oturum.current?.gonder("\x03");

  const terminaliKapat = () => {
    oturum.current?.kapat();
    oturum.current = null;
    setDurum("kapali");
  };

  const girdiGonder = () => {
    if (!oturum.current) return;
    oturum.current.gonder(`${girdi}\r`);
    setGirdi("");
  };

  const acik = durum === "acik";
  return (
    <section className="test-bolum" aria-labelledby={baslikId}>
      <h4 className="test-bolum-baslik" id={baslikId}>
        {t.komut}
        <small className={`test-terminal-durum test-terminal-${durum}`}>
          <i aria-hidden="true" />
          {t.terminal[durum]}
        </small>
      </h4>
      {komut ? (
        <>
          <pre className="komut test-komut">{komut}</pre>
          <div className="dugme-satir">
            <button
              type="button"
              className="dugme dugme-ana"
              onClick={() => void calistir()}
              disabled={durum === "aciliyor" || !projeId}
              title={t.calistirIpucu}
              data-ilk-odak
            >
              {durum === "aciliyor" ? <span className="doner" aria-hidden="true" /> : <Simge ad="oynat" boyut={12} />}
              {acik || durum === "kapandi" ? t.yenidenCalistir : t.calistir}
            </button>
            <button type="button" className="dugme" onClick={durdur} disabled={!acik} title={t.durdurIpucu}>
              <Simge ad="dur" boyut={12} />
              {t.durdur}
            </button>
            <button type="button" className="dugme dugme-sessiz" onClick={terminaliKapat} disabled={!acik}>
              {t.terminaliKapat}
            </button>
          </div>
        </>
      ) : (
        <p className="soluk test-not">{t.komutYok}</p>
      )}
      {hata ? (
        <p className="alan-hata" role="alert">
          {t.terminalHata(hata)}
        </p>
      ) : null}
      {komut ? (
        <>
          <h5 className="gizli">{t.cikti}</h5>
          <pre className={`test-cikti${cikti ? "" : " test-cikti-bos"}`} ref={ref} onScroll={kaydirildi} tabIndex={0} aria-label={t.cikti} aria-live="off">
            {cikti || t.ciktiBos}
          </pre>
          {acik ? (
            <div className="test-girdi">
              <label htmlFor={girdiId} className="gizli">
                {t.girdi}
              </label>
              <span className="test-girdi-istem" aria-hidden="true">
                $
              </span>
              <input
                id={girdiId}
                className="girdi"
                value={girdi}
                onChange={(e) => setGirdi(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    girdiGonder();
                  }
                }}
                placeholder={t.girdiYer}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
