// Proje açma: yeni proje (konum kendiliğinden, klasör seçicili; çalışma dalı; GitHub'da da depo), GitHub'dan
// klonlama (depo, dal, konum; canlı ilerleme) ve bilgisayardaki klasörü bağlama. Sihirbaz ve Projeler ortak kullanır.
import type { GithubDali, GithubDeposu, KurulumIslemi, ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir, hataBildir } from "../durum/arayuz";
import { githubBagli, githubHesabiYukle, kurulumuYukle, useKurulum, useKurulumIslemi } from "../durum/kurulum";
import { projeleriYukle, projeUygula, projeyiSec, useVeri } from "../durum/veri";
import { useIslem } from "../yardimcilar/kancalar";
import { DalSecici } from "./DalSecici";
import { HataKutu, Yukleniyor } from "./Durumlar";
import { GithubDepoSecici } from "./GithubDepoSecici";
import { GithubKurulumu } from "./GithubKurulumu";
import { IslemPaneli } from "./IslemPaneli";
import { useKlasorSecici } from "./KlasorSecici";
import { KonumAlani, konumHatasi, konumYolu, OTOMATIK_KONUM, type KonumDegeri } from "./KonumAlani";
import { dalAdiGecerliMi, klasorAdiYap, yolAdi } from "./kurulumYardimcilari";
import { Simge } from "./Simge";

export type AcmaYolu = "yeni" | "github" | "klasor";
const YOLLAR: AcmaYolu[] = ["yeni", "github", "klasor"];

export function ProjeAcici({
  baslangic = "yeni",
  istek = 0,
  acildi,
  githubBagla,
}: {
  baslangic?: AcmaYolu;
  /** Değişince baslangic sekmesi yeniden öne gelir (aynı sekme yeniden istendiğinde) */
  istek?: number;
  /** Proje açıldı ve etkin proje yapıldı */
  acildi: (p: ProjeOzeti) => void;
  /** "GitHub'ı bağla" istenince; verilmezse GitHub sekmesi açılır (orada kurulum yapılır) */
  githubBagla?: () => void;
}) {
  const s = useSozluk();
  const t = s.kurulum.ac;
  const id = useId();
  const [sekme, setSekme] = useState<AcmaYolu>(baslangic);
  // Sekmeler ilk açıldıklarında kurulur, sonra durumlarını korurlar
  const [acilanlar, setAcilanlar] = useState<AcmaYolu[]>([baslangic]);

  const ac = (y: AcmaYolu) => {
    setSekme(y);
    setAcilanlar((l) => (l.includes(y) ? l : [...l, y]));
  };
  useEffect(() => ac(baslangic), [baslangic, istek]);
  useEffect(() => {
    if (useKurulum.getState().yukleme === "bos") void kurulumuYukle();
  }, []);

  const sekmeTus = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = YOLLAR.indexOf(sekme);
    const yeni = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? YOLLAR.length - 1 : null;
    if (yeni === null) return;
    e.preventDefault();
    const y = YOLLAR[(yeni + YOLLAR.length) % YOLLAR.length]!;
    ac(y);
    document.getElementById(`${id}-${y}`)?.focus();
  };

  return (
    <div className="pa">
      <div className="bolumlu pa-sekmeler" role="tablist" aria-label={t.sekmeEtiket} onKeyDown={sekmeTus}>
        {YOLLAR.map((y) => (
          <button
            key={y}
            type="button"
            role="tab"
            id={`${id}-${y}`}
            aria-selected={sekme === y}
            aria-controls={`${id}-${y}-panel`}
            tabIndex={sekme === y ? 0 : -1}
            onClick={() => ac(y)}
          >
            <Simge ad={y === "yeni" ? "arti" : y === "github" ? "depo" : "klasor"} />
            {t.sekmeler[y]}
          </button>
        ))}
      </div>
      {YOLLAR.map((y) => (
        <div key={y} role="tabpanel" id={`${id}-${y}-panel`} aria-labelledby={`${id}-${y}`} hidden={sekme !== y} className="pa-panel">
          {acilanlar.includes(y) ? (
            y === "yeni" ? (
              <YeniProje acildi={acildi} githubBagla={githubBagla ?? (() => ac("github"))} />
            ) : y === "github" ? (
              <GithubdanAc acildi={acildi} />
            ) : (
              <KlasorBagla acildi={acildi} />
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Sahip seçimi: giriş yapan hesap ve üyesi olduğu kuruluşlar */
export function SahipSecimi({ id, deger, degisti, kilitli }: { id: string; deger: string; degisti: (s: string) => void; kilitli?: boolean }) {
  const t = useSozluk().kurulum.ac;
  const kullanici = useKurulum((d) => d.durum?.github.kullanici ?? null);
  const hesap = useKurulum((d) => d.githubHesabi);
  return (
    <div className="alan">
      <label htmlFor={id}>{t.sahip}</label>
      <select id={id} className="secim" value={deger} onChange={(e) => degisti(e.target.value)} disabled={kilitli}>
        <option value="">{t.sahipSiz(hesap?.kullanici ?? kullanici ?? "GitHub")}</option>
        {(hesap?.kuruluslar ?? []).map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Özel / açık seçimi */
export function GorunurlukSecimi({ ozel, degisti, kilitli }: { ozel: boolean; degisti: (ozel: boolean) => void; kilitli?: boolean }) {
  const t = useSozluk().kurulum.ac;
  const id = useId();
  return (
    <div className="alan">
      <span className="alan-ad" id={id}>
        {t.gorunurluk}
      </span>
      <div className="bolumlu" role="group" aria-labelledby={id}>
        <button type="button" aria-pressed={ozel} onClick={() => degisti(true)} disabled={kilitli}>
          <Simge ad="kilit" boyut={12} />
          {t.ozel}
        </button>
        <button type="button" aria-pressed={!ozel} onClick={() => degisti(false)} disabled={kilitli}>
          <Simge ad="kure" boyut={12} />
          {t.acik}
        </button>
      </div>
    </div>
  );
}

function YeniProje({ acildi, githubBagla }: { acildi: (p: ProjeOzeti) => void; githubBagla: () => void }) {
  const s = useSozluk();
  const t = s.kurulum.ac;
  const id = useId();
  const durum = useKurulum((d) => d.durum);
  const bagli = githubBagli(durum);
  const [ad, setAd] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [dal, setDal] = useState("main");
  const [konum, setKonum] = useState<KonumDegeri>(OTOMATIK_KONUM);
  const [github, setGithub] = useState(false);
  const [ozel, setOzel] = useState(true);
  const [sahip, setSahip] = useState("");
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();

  useEffect(() => {
    if (bagli) void githubHesabiYukle();
  }, [bagli]);

  const klasorAdi = ad.trim() ? klasorAdiYap(ad) : "";
  const adHata = !ad.trim() ? t.adGerekli : null;
  const dalHata = !dalAdiGecerliMi(dal) ? t.dalGecersiz : null;
  const konumHata = konumHatasi(konum, s);
  const githubAcik = github && bagli;

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    setDenendi(true);
    if (adHata || dalHata || konumHata) return;
    void calistir(
      "olustur",
      async () => {
        const p = await api.projeOlustur({
          ad: ad.trim(),
          aciklama: aciklama.trim() || undefined,
          olustur: true,
          yol: konumYolu(konum, klasorAdi),
          dal: dal.trim(),
          github: githubAcik ? { ozel, sahip: sahip || undefined } : null,
        });
        projeUygula(p);
        projeyiSec(p.id);
        bildir("basari", sozluk().kurulum.ac.acildi(p.ad));
        acildi(p);
      },
      true,
    );
  };

  return (
    <form className="form-izgara pa-form" onSubmit={gonder} noValidate>
      <div className="alan">
        <label htmlFor={`${id}-ad`}>{t.ad}</label>
        <input
          id={`${id}-ad`}
          className="girdi"
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          placeholder={t.adOrnek}
          aria-invalid={denendi && adHata ? true : undefined}
          maxLength={80}
          autoFocus
        />
        {denendi && adHata ? <span className="alan-hata">{adHata}</span> : null}
      </div>
      <div className="alan">
        <label htmlFor={`${id}-dal`}>{t.dal}</label>
        <input
          id={`${id}-dal`}
          className="girdi"
          value={dal}
          onChange={(e) => setDal(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={denendi && dalHata ? true : undefined}
        />
        <span className={denendi && dalHata ? "alan-hata" : "alan-ipucu"}>{denendi && dalHata ? dalHata : t.dalIpucu}</span>
      </div>
      <div className="alan tam">
        <label htmlFor={`${id}-aciklama`}>{t.aciklama}</label>
        <textarea
          id={`${id}-aciklama`}
          className="metin-alani"
          rows={2}
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
          placeholder={t.aciklamaOrnek}
        />
      </div>
      <KonumAlani
        id={`${id}-konum`}
        deger={konum}
        degisti={setKonum}
        klasorAdi={klasorAdi}
        kok={durum?.projeKoku ?? null}
        hata={denendi ? konumHata : null}
        kilitli={suruyor !== null}
      />
      <div className="alan tam pa-github">
        <label className="secenek">
          <input type="checkbox" checked={githubAcik} disabled={!bagli} onChange={(e) => setGithub(e.target.checked)} />
          {t.github}
        </label>
        {!bagli ? (
          <span className="alan-ipucu">
            {t.githubYok}{" "}
            <button type="button" className="metin-dugme" onClick={githubBagla}>
              {t.githubBagla}
            </button>
          </span>
        ) : githubAcik ? (
          <div className="pa-github-ayar">
            <GorunurlukSecimi ozel={ozel} degisti={setOzel} />
            <SahipSecimi id={`${id}-sahip`} deger={sahip} degisti={setSahip} />
            <span className="alan-ipucu tam">{t.githubIpucu}</span>
          </div>
        ) : (
          <span className="alan-ipucu">{t.githubIpucu}</span>
        )}
      </div>
      {hata ? (
        <div className="tam">
          <HataKutu baslik={t.acilamadi} metin={hata} />
        </div>
      ) : null}
      <div className="tam dugme-satir">
        <button type="submit" className="dugme dugme-ana" disabled={suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : null}
          {t.olustur}
        </button>
      </div>
    </form>
  );
}

function GithubdanAc({ acildi }: { acildi: (p: ProjeOzeti) => void }) {
  const s = useSozluk();
  const durum = useKurulum((d) => d.durum);
  const yukleme = useKurulum((d) => d.yukleme);
  if (!durum) return yukleme === "hata" ? <GithubKurulumu /> : <Yukleniyor metin={s.kurulum.github.yukleniyor} />;
  if (!githubBagli(durum)) {
    return (
      <div className="pa-github-bagla">
        <p className="panel-aciklama">{s.kurulum.depo.girisGerekli}</p>
        <GithubKurulumu />
      </div>
    );
  }
  return <DepoKlonla acildi={acildi} />;
}

function DepoKlonla({ acildi }: { acildi: (p: ProjeOzeti) => void }) {
  const s = useSozluk();
  const t = s.kurulum.depo;
  const id = useId();
  const durum = useKurulum((d) => d.durum);
  const [depo, setDepo] = useState<GithubDeposu | null>(null);
  const [dallar, setDallar] = useState<GithubDali[] | null>(null);
  const [dalHata, setDalHata] = useState<string | null>(null);
  const [dalYenile, setDalYenile] = useState(0);
  const [dal, setDal] = useState("");
  const [ad, setAd] = useState("");
  const [konum, setKonum] = useState<KonumDegeri>(OTOMATIK_KONUM);
  const [denendi, setDenendi] = useState(false);
  const [baslatHata, setBaslatHata] = useState<string | null>(null);
  const [baslatiliyor, setBaslatiliyor] = useState(false);

  const bitti = async (i: KurulumIslemi) => {
    if (i.durum !== "tamam") return;
    const pid = typeof i.sonuc?.projeId === "string" ? i.sonuc.projeId : null;
    if (!pid) return;
    await projeleriYukle().catch(() => undefined);
    const p = useVeri.getState().projeler.find((x) => x.id === pid) ?? (await api.proje(pid).catch(() => null));
    projeyiSec(pid);
    bildir("basari", sozluk().kurulum.depo.acildi(p?.ad ?? ad));
    if (p) acildi(p);
  };
  const klon = useKurulumIslemi("klonla", (i) => void bitti(i));
  const suruyor = klon.islem?.durum === "calisiyor";
  const kilitli = suruyor || baslatiliyor;

  useEffect(() => {
    if (!depo) return;
    let iptal = false;
    setDallar(null);
    setDalHata(null);
    api
      .githubDallari(depo.tamAd)
      .then((l) => {
        if (iptal) return;
        setDallar(l);
        const v = depo.varsayilanDal ?? l[0]?.ad ?? "main";
        setDal((x) => (l.some((d) => d.ad === x) ? x : v));
      })
      .catch((e: unknown) => {
        if (!iptal) setDalHata(hataMetni(e));
      });
    return () => {
      iptal = true;
    };
  }, [depo, dalYenile]);

  const depoSec = (d: GithubDeposu) => {
    setDepo(d);
    setAd(d.ad);
    setDal(d.varsayilanDal ?? "main");
    setDenendi(false);
    setBaslatHata(null);
    klon.gizle();
  };

  const klasorAdi = depo ? klasorAdiYap(depo.ad) : "";
  const dalHatasi = !dalAdiGecerliMi(dal) ? s.kurulum.ac.dalGecersiz : null;
  const konumHata = konumHatasi(konum, s);

  const klonla = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!depo) return;
    setDenendi(true);
    if (dalHatasi || konumHata) return;
    setBaslatiliyor(true);
    setBaslatHata(null);
    try {
      await klon.baslat(() =>
        api.klonla({
          depo: depo.tamAd,
          dal: dal.trim() || undefined,
          yol: konumYolu(konum, klasorAdi),
          ad: ad.trim() || undefined,
          aciklama: depo.aciklama || undefined,
        }),
      );
    } catch (h) {
      setBaslatHata(hataMetni(h));
    } finally {
      setBaslatiliyor(false);
    }
  };

  const secenekler = (dallar ?? []).map((d) => ({ ad: d.ad, korumali: d.korumali, varsayilan: d.ad === depo?.varsayilanDal }));

  return (
    <div className="pa-klon">
      <GithubDepoSecici secili={depo} sec={depoSec} kilitli={kilitli} />
      {!depo ? (
        <p className="alan-ipucu">{t.secin}</p>
      ) : (
        <form className="form-izgara pa-form" onSubmit={(e) => void klonla(e)} noValidate>
          <DalSecici
            id={`${id}-dal`}
            etiket={s.kurulum.ac.dal}
            secenekler={secenekler}
            deger={dal}
            degisti={setDal}
            yukleniyor={dallar === null && !dalHata}
            hata={dalHata}
            yeniden={() => setDalYenile((n) => n + 1)}
            ipucu={s.kurulum.ac.dalIpucu}
            dogrulama={denendi ? dalHatasi : null}
            kilitli={kilitli}
            bosDepo
          />
          <div className="alan">
            <label htmlFor={`${id}-ad`}>{t.projeAdi}</label>
            <input id={`${id}-ad`} className="girdi" value={ad} onChange={(e) => setAd(e.target.value)} placeholder={depo.ad} disabled={kilitli} maxLength={80} />
          </div>
          <KonumAlani
            id={`${id}-konum`}
            deger={konum}
            degisti={setKonum}
            klasorAdi={klasorAdi}
            kok={durum?.projeKoku ?? null}
            hata={denendi ? konumHata : null}
            kilitli={kilitli}
          />
          {baslatHata ? (
            <div className="tam">
              <HataKutu baslik={s.kurulum.ac.acilamadi} metin={baslatHata} />
            </div>
          ) : null}
          {klon.islem ? (
            <div className="tam">
              <IslemPaneli islem={klon.islem} yenidenDene={() => void klonla()} gizle={klon.gizle} />
            </div>
          ) : null}
          {!suruyor && klon.islem?.durum !== "tamam" ? (
            <div className="tam dugme-satir">
              <button type="submit" className="dugme dugme-ana" disabled={kilitli || dallar === null}>
                {baslatiliyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="indir" />}
                {t.klonla}
              </button>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}

function KlasorBagla({ acildi }: { acildi: (p: ProjeOzeti) => void }) {
  const s = useSozluk();
  const t = s.kurulum.klasor;
  const id = useId();
  const kok = useKurulum((d) => d.durum?.projeKoku ?? null);
  const { sec, pencere } = useKlasorSecici();
  const [secilen, setSecilen] = useState<{ yol: string; repo: boolean | null } | null>(null);
  const [denetleniyor, setDenetleniyor] = useState(false);
  const [denetimHata, setDenetimHata] = useState<string | null>(null);
  const [ad, setAd] = useState("");
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();

  const klasorSec = async () => {
    const yol = await sec({ baslik: t.secBaslik, varsayilan: secilen?.yol ?? kok });
    if (!yol) return;
    setSecilen({ yol, repo: null });
    setAd(yolAdi(yol));
    setDenetimHata(null);
    setDenetleniyor(true);
    try {
      const l = await api.dizinler(yol);
      setSecilen({ yol: l.yol, repo: l.repo });
    } catch (e) {
      setDenetimHata(hataMetni(e));
    } finally {
      setDenetleniyor(false);
    }
  };

  const adHata = !ad.trim() ? s.kurulum.ac.adGerekli : null;

  const bagla = (e: FormEvent) => {
    e.preventDefault();
    setDenendi(true);
    if (!secilen || adHata || denetleniyor) return;
    // Denetlenemediyse (repo bilinmiyor) var olan repo olarak bağlanır; değilse çekirdek söyler
    const olustur = secilen.repo === false;
    void calistir(
      "bagla",
      async () => {
        const p = await api.projeOlustur({ ad: ad.trim(), yol: secilen.yol, olustur });
        projeUygula(p);
        projeyiSec(p.id);
        bildir("basari", sozluk().kurulum.ac.acildi(p.ad));
        acildi(p);
      },
      true,
    );
  };

  return (
    <div className="pa-klasor">
      <p className="panel-aciklama">{t.aciklama}</p>
      {!secilen ? (
        <div>
          <button type="button" className="dugme dugme-ana" onClick={() => void klasorSec().catch(hataBildir)}>
            <Simge ad="klasor" />
            {t.sec}
          </button>
        </div>
      ) : (
        <form className="form-izgara pa-form" onSubmit={bagla} noValidate>
          <div className="alan tam">
            <span className="alan-ad">{t.secilen}</span>
            <div className="konum-satir">
              <code className="konum-yol">{secilen.yol}</code>
              <button type="button" className="dugme dugme-kucuk" onClick={() => void klasorSec().catch(hataBildir)} disabled={suruyor !== null}>
                <Simge ad="klasor" />
                {t.baska}
              </button>
            </div>
            {denetleniyor ? (
              <Yukleniyor metin={t.denetleniyor} />
            ) : denetimHata ? (
              <p className="pa-repo">
                <Simge ad="uyari" boyut={12} />
                {t.denetlenemedi}: {denetimHata}
              </p>
            ) : secilen.repo ? (
              <span className="pa-repo pa-repo-var">
                <Simge ad="dal" boyut={12} />
                {t.repo}
              </span>
            ) : (
              <span className="pa-repo">
                <Simge ad="halka" boyut={12} />
                {t.repoDegil}
              </span>
            )}
          </div>
          <div className="alan">
            <label htmlFor={`${id}-ad`}>{s.kurulum.ac.ad}</label>
            <input
              id={`${id}-ad`}
              className="girdi"
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              maxLength={80}
              aria-invalid={denendi && adHata ? true : undefined}
              disabled={suruyor !== null}
            />
            {denendi && adHata ? <span className="alan-hata">{adHata}</span> : null}
          </div>
          {secilen.repo === false ? (
            <p className="uyari-kutu tam">{t.repoDegilAciklama}</p>
          ) : !denetleniyor ? (
            <p className="alan-ipucu tam">{t.dalNotu}</p>
          ) : null}
          {hata ? (
            <div className="tam">
              <HataKutu baslik={s.kurulum.ac.acilamadi} metin={hata} />
            </div>
          ) : null}
          <div className="tam dugme-satir">
            <button type="submit" className="dugme dugme-ana" disabled={suruyor !== null || denetleniyor}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : null}
              {secilen.repo === false ? t.baslat : t.bagla}
            </button>
          </div>
        </form>
      )}
      {pencere}
    </div>
  );
}
