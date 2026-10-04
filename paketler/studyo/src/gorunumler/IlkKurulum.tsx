// İlk açılış hazırlığı: ArnOrg kullanıcıyı karşılar ve kurulumları onunla birlikte yapar: dil, Claude Code,
// GitHub, ilk proje ve CEO ile hazırlık görüşmesi. Adımların durumu kurulum durumundan türer (hazır olan adım
// işaretlenir, sihirbaz geçmeyi önerir); her adım geçilebilir, sihirbaz her an kapatılabilir. Bitince ya da
// atlanınca kurulumTamam yazılır ve kabuk açılır.
import { ARNORG_SURUMU, DIL_ADLARI, DILLER, type Dil, type ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api/uclar";
import { diliAyarla, sozluk, useDil, useSozluk } from "../dil";
import { en } from "../dil/en";
import { tr } from "../dil/tr";
import { CeoModelSatiri } from "../bilesenler/CeoModelSatiri";
import { ClaudeKurulumu } from "../bilesenler/ClaudeKurulumu";
import { DisBaglanti } from "../bilesenler/DisBaglanti";
import { Bos } from "../bilesenler/Durumlar";
import { GithubKurulumu } from "../bilesenler/GithubKurulumu";
import { ProjeAcici } from "../bilesenler/ProjeAcici";
import { Simge } from "../bilesenler/Simge";
import { bildir, git, type BildirimSeviyesi, type Gorunum } from "../durum/arayuz";
import { claudeHazir, githubHazir, islemleriYukle, kurulumuYukle, useKurulum } from "../durum/kurulum";
import { ayarlariKaydet, projeleriYukle, projeUygula, projeyiSec, useVeri } from "../durum/veri";
import { useIslem } from "../yardimcilar/kancalar";

type Adim = "dil" | "claude" | "github" | "proje" | "hazirlik";
const ADIMLAR: Adim[] = ["dil", "claude", "github", "proje", "hazirlik"];
/** Dil seçenekleri her zaman kendi dillerinde selamlar */
const SOZLUKLER = { tr, en } satisfies Record<Dil, unknown>;
/** Sayfa yenilenirse sihirbaz kaldığı adımdan sürer */
const ADIM_ANAHTARI = "arnorg.kurulumAdimi";

function kayitliAdim(): Adim {
  try {
    const a = localStorage.getItem(ADIM_ANAHTARI);
    if (a && (ADIMLAR as string[]).includes(a)) return a as Adim;
  } catch {
    // depolama kapalı
  }
  return "dil";
}

function adimKaydet(a: Adim | null) {
  try {
    if (a) localStorage.setItem(ADIM_ANAHTARI, a);
    else localStorage.removeItem(ADIM_ANAHTARI);
  } catch {
    // depolama kapalı: adım yalnız bu oturumda kalır
  }
}

export function IlkKurulum() {
  const s = useSozluk();
  const t = s.kurulum;
  const dil = useDil();
  const [adim, setAdimDurumu] = useState<Adim>(kayitliAdim);
  const [acilanId, setAcilanId] = useState<string | null>(null);
  const durum = useKurulum((d) => d.durum);
  const projeler = useVeri((d) => d.projeler);
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const { suruyor, calistir } = useIslem();
  const baslikRef = useRef<HTMLHeadingElement>(null);
  const govdeRef = useRef<HTMLElement>(null);
  const ilkCizim = useRef(true);

  useEffect(() => {
    void kurulumuYukle(true);
    void islemleriYukle();
    projeleriYukle().catch(() => undefined);
  }, []);

  // Pencere başlığı sihirbaz açıkken "ArnOrg · İlk kurulum"
  useEffect(() => {
    const onceki = document.title;
    document.title = `${s.genel.arnorg} · ${t.sihirbaz.baslik}`;
    return () => {
      document.title = onceki;
    };
  }, [s, t]);

  // Adım değişince başa dön ve odağı başlığa ver (ekran okuyucu yeni adımı okusun)
  useEffect(() => {
    if (ilkCizim.current) {
      ilkCizim.current = false;
      return;
    }
    govdeRef.current?.scrollTo({ top: 0 });
    baslikRef.current?.focus({ preventScroll: true });
  }, [adim]);

  const setAdim = (a: Adim) => {
    setAdimDurumu(a);
    adimKaydet(a);
  };

  const hedef = projeler.find((p) => p.id === (acilanId ?? aktifProjeId)) ?? null;
  const hazir: Record<Adim, boolean> = {
    // Dil her zaman seçilidir
    dil: true,
    claude: claudeHazir(durum),
    github: githubHazir(durum),
    proje: !!hedef,
    hazirlik: !!hedef && (hedef.hazirlik === "suruyor" || hedef.hazirlik === "tamam"),
  };
  const sira = ADIMLAR.indexOf(adim);
  const sonraki = () => setAdim(ADIMLAR[Math.min(sira + 1, ADIMLAR.length - 1)]!);
  const onceki = () => setAdim(ADIMLAR[Math.max(sira - 1, 0)]!);

  /** Sihirbazı kapatır: kurulumTamam yazılır, kabuk istenen ekranla açılır */
  const bitir = (gorunum: Gorunum, mesaj: string, seviye: BildirimSeviyesi = "bilgi") =>
    void calistir("bitir", async () => {
      git(gorunum);
      await ayarlariKaydet({ kurulumTamam: true });
      adimKaydet(null);
      bildir(seviye, mesaj);
    });

  const dilSec = (yeni: Dil) =>
    void calistir("dil", async () => {
      if (yeni !== dil) {
        await ayarlariKaydet({ dil: yeni });
        diliAyarla(yeni);
      }
      setAdim("claude");
    });

  const hazirligiBaslat = (p: ProjeOzeti) =>
    void calistir("hazirlik", async () => {
      const yeni = await api.hazirlik(p.id, "baslat");
      projeUygula(yeni);
      if (useVeri.getState().aktifProjeId !== yeni.id) projeyiSec(yeni.id);
      git("karargah");
      await ayarlariKaydet({ kurulumTamam: true });
      adimKaydet(null);
      bildir("basari", sozluk().kurulum.hazirlik.basladi);
    });

  let baslik: string;
  let aciklama: string;
  let ek: ReactNode = null;
  let is: ReactNode;
  switch (adim) {
    case "dil":
      baslik = t.dil.baslik;
      aciklama = t.dil.aciklama;
      is = <DilAdimi sec={dilSec} kilitli={suruyor !== null} />;
      break;
    case "claude":
      baslik = hazir.claude ? t.claude.baslikHazir : t.claude.baslik;
      aciklama = hazir.claude ? t.claude.aciklamaHazir(durum?.claude.eposta ?? null) : t.claude.aciklama;
      is = <ClaudeKurulumu />;
      break;
    case "github":
      baslik = hazir.github ? t.github.baslikHazir : t.github.baslik;
      aciklama = hazir.github ? t.github.aciklamaHazir(durum?.github.kullanici ?? "GitHub") : t.github.aciklama;
      is = <GithubKurulumu />;
      break;
    case "proje":
      baslik = acilanId && hedef ? t.proje.baslikHazir(hedef.ad) : t.proje.baslik;
      aciklama = t.proje.aciklama;
      ek = (
        <>
          {projeler.length > 0 && !acilanId ? <p>{t.proje.varOlan(projeler.length)}</p> : null}
          {durum ? <p>{t.proje.kok(durum.projeKoku)}</p> : null}
        </>
      );
      is = (
        <ProjeAcici
          acildi={(p) => {
            setAcilanId(p.id);
            setAdim("hazirlik");
          }}
          githubBagla={() => setAdim("github")}
        />
      );
      break;
    case "hazirlik":
      baslik = t.hazirlik.baslik;
      aciklama = t.hazirlik.aciklama;
      ek = <Konular />;
      is = (
        <HazirlikAdimi
          proje={hedef}
          suruyor={suruyor !== null}
          baslat={hazirligiBaslat}
          bitir={(g) => bitir(g, t.sihirbaz.bitti)}
          projeyeDon={() => setAdim("proje")}
        />
      );
      break;
  }

  return (
    <div className="ilk-kurulum">
      <header className="ik-ust">
        <p className="ik-marka" aria-label={s.genel.arnorg}>
          Arn<span>Org</span>
        </p>
        <AdimGostergesi adim={adim} hazir={hazir} sec={setAdim} />
        <button
          type="button"
          className="metin-dugme ik-atla"
          onClick={() => bitir(hedef ? "karargah" : "projeler", t.sihirbaz.atlandi)}
          disabled={suruyor === "bitir"}
        >
          {t.sihirbaz.hazirligiAtla}
        </button>
      </header>
      <div className="ik-ilerleme" aria-hidden="true">
        <span style={{ transform: `scaleX(${(sira + 1) / ADIMLAR.length})` }} />
      </div>

      <main className="ik-govde" ref={govdeRef} aria-labelledby="ik-baslik">
        <div className="ik-adim" key={adim}>
          <div className="ik-ses">
            <h1 id="ik-baslik" ref={baslikRef} tabIndex={-1}>
              {baslik}
            </h1>
            <p className="ik-aciklama">{aciklama}</p>
            {ek ? <div className="ik-ek">{ek}</div> : null}
          </div>
          <div className="ik-is">{is}</div>
        </div>
      </main>

      <footer className="ik-alt">
        <p className="ik-imza">
          <span className="ik-imza-marka">ArnOrg</span> {ARNORG_SURUMU} <span aria-hidden="true">·</span> Furkan YILDIRIM{" "}
          <span aria-hidden="true">·</span> <DisBaglanti href="https://furkanyildirim.com">furkanyildirim.com</DisBaglanti>
        </p>
        <div className="ik-gezinti">
          {sira > 0 ? (
            <button type="button" className="dugme dugme-sessiz" onClick={onceki}>
              <Simge ad="geri" />
              {t.sihirbaz.geri}
            </button>
          ) : null}
          {adim !== "hazirlik" ? (
            hazir[adim] ? (
              <button type="button" className="dugme dugme-ana" onClick={sonraki} disabled={suruyor === "dil"}>
                {t.sihirbaz.devam}
                <Simge ad="sag" />
              </button>
            ) : (
              <button type="button" className="dugme" onClick={sonraki}>
                {t.sihirbaz.sonra}
                <Simge ad="sag" />
              </button>
            )
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function AdimGostergesi({ adim, hazir, sec }: { adim: Adim; hazir: Record<Adim, boolean>; sec: (a: Adim) => void }) {
  const t = useSozluk().kurulum.sihirbaz;
  return (
    <nav className="ik-adimlar" aria-label={t.adimlarEtiket}>
      <ol>
        {ADIMLAR.map((a, i) => {
          const simdi = a === adim;
          const tamam = hazir[a] && !simdi;
          return (
            <li key={a} data-durum={simdi ? "simdi" : tamam ? "tamam" : "bekliyor"}>
              <button type="button" onClick={() => sec(a)} aria-current={simdi ? "step" : undefined}>
                <span className="ik-adim-no" aria-hidden="true">
                  {tamam ? <Simge ad="tamam" boyut={11} /> : i + 1}
                </span>
                <span className="ik-adim-ad">{t.adimlar[a]}</span>
                {tamam ? <span className="gizli"> · {t.hazir}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DilAdimi({ sec, kilitli }: { sec: (d: Dil) => void; kilitli: boolean }) {
  const t = useSozluk().kurulum.dil;
  const dil = useDil();
  return (
    <div className="ik-diller" role="group" aria-label={t.secimEtiket}>
      {DILLER.map((d) => (
        <button key={d} type="button" lang={d} className="ik-dil" aria-pressed={dil === d} onClick={() => sec(d)} disabled={kilitli}>
          <span className="ik-dil-ad">{DIL_ADLARI[d]}</span>
          <span className="ik-dil-selam">{SOZLUKLER[d].kurulum.dil.selam}</span>
          <span className="ik-dil-isaret" aria-hidden="true">
            <Simge ad={dil === d ? "tamam" : "sag"} />
          </span>
        </button>
      ))}
      <p className="alan-ipucu">{t.ipucu}</p>
    </div>
  );
}

function Konular() {
  const t = useSozluk().kurulum.hazirlik;
  return (
    <div className="ik-konular">
      <h2>{t.konularBaslik}</h2>
      <ul>
        {t.konular.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </div>
  );
}

function HazirlikAdimi({
  proje,
  suruyor,
  baslat,
  bitir,
  projeyeDon,
}: {
  proje: ProjeOzeti | null;
  suruyor: boolean;
  baslat: (p: ProjeOzeti) => void;
  bitir: (gorunum: Gorunum) => void;
  projeyeDon: () => void;
}) {
  const t = useSozluk().kurulum.hazirlik;
  if (!proje) {
    return (
      <Bos
        baslik={t.projeYok}
        eylem={
          <>
            <button type="button" className="dugme dugme-ana" onClick={projeyeDon}>
              <Simge ad="geri" />
              {t.projeyeDon}
            </button>
            <button type="button" className="dugme dugme-sessiz" onClick={() => bitir("projeler")} disabled={suruyor}>
              {t.bitir}
            </button>
          </>
        }
      />
    );
  }
  const basladi = proje.hazirlik === "suruyor" || proje.hazirlik === "tamam";
  return (
    <div className="ik-hazirlik">
      <dl className="kv ik-ozet">
        <dt>{t.proje}</dt>
        <dd>
          <b>{proje.ad}</b>
          <code>{proje.yol}</code>
        </dd>
        <dt>{t.dal}</dt>
        <dd>{proje.varsayilanDal}</dd>
        <CeoModelSatiri projeId={proje.id} />
        <dt>{t.uzak}</dt>
        <dd>
          {proje.github ? (
            <DisBaglanti href={`https://github.com/${proje.github}`} className="baglanti">
              {proje.github}
            </DisBaglanti>
          ) : proje.uzakAdres ? (
            <code>{proje.uzakAdres}</code>
          ) : (
            t.uzakYok
          )}
        </dd>
      </dl>
      {basladi ? (
        <>
          <p className="ik-not">
            <Simge ad="tamam" boyut={14} />
            {proje.hazirlik === "tamam" ? t.tamam(proje.ad) : t.suruyor(proje.ad)}
          </p>
          <div className="dugme-satir">
            <button type="button" className="dugme dugme-ana" onClick={() => bitir("karargah")} disabled={suruyor}>
              {t.karargah}
              <Simge ad="sag" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="dugme-satir">
            <button type="button" className="dugme dugme-ana" onClick={() => baslat(proje)} disabled={suruyor}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="mesaj" />}
              {t.baslat}
            </button>
            <button type="button" className="dugme dugme-sessiz" onClick={() => bitir("karargah")} disabled={suruyor}>
              {t.sonra}
            </button>
          </div>
          <p className="alan-ipucu">{t.sonraIpucu}</p>
        </>
      )}
    </div>
  );
}
