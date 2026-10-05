// Ekip ekranındaki (ve Ofis çekmecesindeki) ajan ayrıntı paneli: kimlik ve iki bölüm.
// Genel: oturum eylemleri, bilgiler, mesaj, ayarlar, devralanlı işten çıkarma. Zekâ: ajanın kendi kalıcı zekâsı.
import type { Ajan, Gorev, IzinModu } from "@arnorg/ortak";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { ajanaGit, bildir, git, hataBildir } from "../../durum/arayuz";
import { modelBilgisi, modelSecenegi, modelSecenekleri, useModelKatalogu } from "../../durum/modeller";
import { ajanKaldir, ajanUygula, ceoBul, useVeri } from "../../durum/veri";
import { ajanSekmesiSec, useZekaArayuz } from "../../durum/zeka";
import { tarih, token } from "../../yardimcilar/bicim";
import { useIslem } from "../../yardimcilar/kancalar";
import { KarakterSecici } from "../KarakterSecici";
import { AjanAvatar, AjanDurum, IZIN_MODLARI as MODLAR, izinModuAdi, ModelAdi, modelAdi } from "../Kisi";
import { AjanOrtakSatirlari } from "../ortak/OrtakCalisma";
import { Simge } from "../Simge";
import { MesajFormu, OturumDugmeleri } from "./AjanEylemleri";
import { AjanZekasiBolumu } from "./AjanZekasi";
import { AjanYetenekleri } from "./AjanYetenekleri";
import { AjanSkilleri } from "./AjanSkilleri";

const IZIN_MODLARI = MODLAR as readonly IzinModu[];

// Plan modundan çıkınca dönülecek mod; oturum boyunca bellekte tutulur
const oncekiModlar = new Map<string, IzinModu>();

/** mesaj: false ise "Mesaj gönder" bölümü gösterilmez (çağıran kendi mesaj kutusunu koyar) */
export function AjanAyrinti({ ajan, mesaj = true }: { ajan: Ajan; mesaj?: boolean }) {
  const s = useSozluk();
  const t = s.ekip.ayrinti;
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const yonetici = ajanlar.find((a) => a.id === ajan.yoneticiId);
  const gorev = gorevler.find((g) => g.id === ajan.gorevId);
  // Seçili bölüm başka ajan seçilince de korunur (zekâları karşılaştırırken)
  const sekme = useZekaArayuz((d) => d.ajanSekmesi);

  return (
    <div className="ajan-ayrinti">
      <div className="ajan-ayrinti-ust">
        <AjanAvatar ajan={ajan} boyut="l" />
        <div className="kisi-metin">
          <b className="ajan-ayrinti-ad">{ajan.ad}</b>
          <small>
            {ajan.rolAdi} · <ModelAdi model={ajan.model} />
          </small>
        </div>
        <button type="button" className="dugme dugme-kucuk" onClick={() => ajanaGit(ajan.id)}>
          {t.oturumuAc}
        </button>
      </div>
      <div className="ajan-ayrinti-durum">
        <AjanDurum durum={ajan.durum} />
        {ajan.isAciklamasi ? <p>{ajan.isAciklamasi}</p> : null}
      </div>

      <div className="bolumlu ajan-sekmeler" role="group" aria-label={t.sekmeler}>
        <button type="button" aria-pressed={sekme === "genel"} onClick={() => ajanSekmesiSec("genel")}>
          {t.sekmeGenel}
        </button>
        <button type="button" aria-pressed={sekme === "zeka"} onClick={() => ajanSekmesiSec("zeka")}>
          <Simge ad="zeka" boyut={12} />
          {t.sekmeZeka}
        </button>
      </div>

      {sekme === "zeka" ? <AjanZekasiBolumu ajan={ajan} /> : <AjanGenel ajan={ajan} mesaj={mesaj} yonetici={yonetici} gorev={gorev} />}
    </div>
  );
}

function AjanGenel({
  ajan,
  mesaj,
  yonetici,
  gorev,
}: {
  ajan: Ajan;
  mesaj: boolean;
  yonetici: Ajan | undefined;
  gorev: Gorev | undefined;
}) {
  const s = useSozluk();
  const t = s.ekip.ayrinti;
  return (
    <>
      <OturumDugmeleri ajan={ajan} kucuk />

      <dl className="kv">
        <dt>{t.bugun}</dt>
        <dd className="sayi">{t.token(token(ajan.bugunToken))}</dd>
        <dt>{t.toplam}</dt>
        <dd className="sayi">{t.token(token(ajan.toplamToken))}</dd>
        <dt>{t.izinModu}</dt>
        <dd>{izinModuAdi(ajan.izinModu)}</dd>
        <dt>{t.yonetici}</dt>
        <dd>{yonetici ? `${yonetici.ad} · ${yonetici.rolAdi}` : s.genel.kurul}</dd>
        {gorev ? (
          <>
            <dt>{t.gorev}</dt>
            <dd>
              <button type="button" className="gorev-kodu" onClick={() => git("pano", { gorevId: gorev.id })}>
                {gorev.kod}
              </button>{" "}
              {gorev.baslik}
            </dd>
          </>
        ) : null}
        <AjanOrtakSatirlari ajan={ajan} />
        <dt>{t.iseAlindi}</dt>
        <dd>{tarih(ajan.olusturma)}</dd>
      </dl>

      {mesaj ? (
        <section className="ajan-bolum" aria-label={t.mesajGonder}>
          <h3>{t.mesajGonder}</h3>
          <MesajFormu ajan={ajan} />
        </section>
      ) : null}

      <AjanAyarlari ajan={ajan} />
      <AjanYetenekleri ajan={ajan} />
      <AjanSkilleri ajan={ajan} />
      <IstenCikar ajan={ajan} />
    </>
  );
}

function AjanAyarlari({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const t = s.ekip.ayrinti;
  const ajanlar = useVeri((d) => d.ajanlar);
  const { suruyor, calistir } = useIslem();
  const [yoneticiId, setYoneticiId] = useState(ajan.yoneticiId ?? "");
  const [talimat, setTalimat] = useState(ajan.talimatEki);
  // Seçenekler model kataloğundan, sürümlü ad ve kısa açıklamayla; listede olmayan model "Özel" ile girilir
  const katalog = useModelKatalogu();
  const modeller = modelSecenekleri(katalog);
  const listede = modeller.some((m) => m.deger === ajan.model);
  const kimlik = modelBilgisi(ajan.model, katalog)?.kimlik;
  const [ozelModel, setOzelModel] = useState(listede ? "" : ajan.model);

  // Başka bir ajan seçilince ya da sunucudan güncelleme gelince alanları tazele
  useEffect(() => {
    setYoneticiId(ajan.yoneticiId ?? "");
    setTalimat(ajan.talimatEki);
  }, [ajan.id, ajan.yoneticiId, ajan.talimatEki]);

  const planda = ajan.izinModu === "plan";
  const degisti = (yoneticiId || null) !== ajan.yoneticiId || talimat !== ajan.talimatEki;

  const modelDegistir = (model: string) =>
    calistir("model", async () => {
      ajanUygula(await api.ajanModel(ajan.id, model));
      bildir("basari", sozluk().ekip.ayrinti.modelDegisti(ajan.ad, modelAdi(model)));
    });

  const modDegistir = (mod: IzinModu) =>
    calistir("mod", async () => {
      if (mod === "plan" && ajan.izinModu !== "plan") oncekiModlar.set(ajan.id, ajan.izinModu);
      ajanUygula(await api.ajanMod(ajan.id, mod));
      bildir("basari", `${ajan.ad}: ${izinModuAdi(mod)}.`);
    });

  const kaydet = (e: FormEvent) => {
    e.preventDefault();
    void calistir("kaydet", async () => {
      ajanUygula(
        await api.ajanGuncelle(ajan.id, {
          yoneticiId: yoneticiId || null,
          talimatEki: talimat,
        }),
      );
      bildir("basari", sozluk().ekip.ayrinti.ayarlarKaydedildi);
    });
  };

  return (
    <section className="ajan-bolum" aria-label={t.ayarlar}>
      <h3>{t.ayarlar}</h3>
      <div className="ayar-satir">
        <div className="alan">
          <label htmlFor={`model-${ajan.id}`}>{t.model}</label>
          <select
            id={`model-${ajan.id}`}
            className="secim"
            value={listede ? ajan.model : "ozel"}
            disabled={suruyor !== null}
            onChange={(e) => {
              if (e.target.value !== "ozel") void modelDegistir(e.target.value);
              else setOzelModel(ajan.model);
            }}
          >
            {modeller.map((m) => (
              <option key={m.deger} value={m.deger}>
                {modelSecenegi(m, s)}
              </option>
            ))}
            <option value="ozel">{t.ozelModelSecenegi}</option>
          </select>
          {kimlik && kimlik !== ajan.model ? <span className="alan-ipucu model-kimlik">{kimlik}</span> : null}
        </div>
        <div className="alan">
          <label htmlFor={`mod-${ajan.id}`}>{t.izinModu}</label>
          <select
            id={`mod-${ajan.id}`}
            className="secim"
            value={ajan.izinModu}
            disabled={suruyor !== null}
            onChange={(e) => void modDegistir(e.target.value as IzinModu)}
          >
            {IZIN_MODLARI.map((m) => (
              <option key={m} value={m}>
                {izinModuAdi(m)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!listede || ozelModel ? (
        <div className="ayar-satir ayar-satir-tek">
          <input
            className="girdi"
            aria-label={t.ozelModel}
            value={ozelModel}
            onChange={(e) => setOzelModel(e.target.value)}
            placeholder="claude-…"
            spellCheck={false}
          />
          <button
            type="button"
            className="dugme dugme-kucuk"
            disabled={!ozelModel.trim() || ozelModel.trim() === ajan.model || suruyor !== null}
            onClick={() => void modelDegistir(ozelModel.trim())}
          >
            {t.uygula}
          </button>
        </div>
      ) : null}
      <div className="dugme-satir">
        <button
          type="button"
          className="dugme dugme-kucuk"
          disabled={suruyor !== null}
          onClick={() => void modDegistir(planda ? (oncekiModlar.get(ajan.id) ?? "default") : "plan")}
          title={planda ? t.plandanCikIpucu : t.planaAlIpucu}
        >
          <Simge ad="plan" boyut={12} />
          {planda ? t.plandanCik : t.planaAl}
        </button>
      </div>

      <KarakterAyari ajan={ajan} />

      <form className="ajan-ayar-form" onSubmit={kaydet}>
        <div className="ayar-satir">
          <div className="alan">
            <label htmlFor={`yonetici-${ajan.id}`}>{t.yonetici}</label>
            <select id={`yonetici-${ajan.id}`} className="secim" value={yoneticiId} onChange={(e) => setYoneticiId(e.target.value)}>
              <option value="">{s.genel.kurul}</option>
              {ajanlar
                .filter((a) => a.id !== ajan.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ad} · {a.rolAdi}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="alan">
          <label htmlFor={`talimat-${ajan.id}`}>{t.ekTalimat}</label>
          <textarea
            id={`talimat-${ajan.id}`}
            className="metin-alani"
            rows={3}
            value={talimat}
            onChange={(e) => setTalimat(e.target.value)}
            placeholder={t.ekTalimatOrnek}
          />
        </div>
        <div className="dugme-satir">
          <button type="submit" className="dugme dugme-kucuk" disabled={!degisti || suruyor !== null}>
            {suruyor === "kaydet" ? <span className="doner" aria-hidden="true" /> : null}
            {t.degisiklikleriKaydet}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Ofis karakteri: seçim hemen görünür, kısa bir beklemeden sonra kaydedilir (oklarla gezerken her adımda istek gitmez) */
function KarakterAyari({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const [yerel, setYerel] = useState<string | null>(ajan.karakter);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const bekleyen = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setYerel(ajan.karakter), [ajan.id, ajan.karakter]);
  useEffect(() => () => clearTimeout(bekleyen.current), []);

  const degisti = (karakter: string | null) => {
    setYerel(karakter);
    clearTimeout(bekleyen.current);
    bekleyen.current = setTimeout(() => {
      setKaydediliyor(true);
      api
        .ajanGuncelle(ajan.id, { karakter })
        .then(ajanUygula)
        .catch((e: unknown) => {
          setYerel(ajan.karakter);
          hataBildir(e);
        })
        .finally(() => setKaydediliyor(false));
    }, 450);
  };

  return (
    <div className="alan">
      <span className="alan-ad" id={`karakter-${ajan.id}`}>
        {s.ekip.ayrinti.ofisKarakteri} {kaydediliyor ? <span className="doner" aria-hidden="true" /> : null}
      </span>
      <KarakterSecici deger={yerel} degisti={degisti} rol={ajan.rol} ajan={ajan} etiketId={`karakter-${ajan.id}`} />
    </div>
  );
}

/**
 * İşten çıkarma: kurul açık işlerin ve bildiklerin (kişisel hafıza, defter, açık sözler) kime devredileceğini seçer.
 * Varsayılan yöneticisi; yoksa CEO. CEO çıkarılamaz (çekirdek de reddeder).
 */
function IstenCikar({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const t = s.ekip.ayrinti;
  const ajanlar = useVeri((d) => d.ajanlar);
  const adaylar = ajanlar.filter((a) => a.id !== ajan.id);
  const varsayilan =
    (ajan.yoneticiId && adaylar.some((a) => a.id === ajan.yoneticiId) ? ajan.yoneticiId : null) ?? ceoBul(adaylar)?.id ?? adaylar[0]?.id ?? "";
  const [soruyor, setSoruyor] = useState(false);
  const [devralanId, setDevralanId] = useState(varsayilan);
  const { suruyor, calistir } = useIslem();
  const vazgecRef = useRef<HTMLButtonElement>(null);
  const kimlik = useId();
  const devralan = adaylar.find((a) => a.id === devralanId);

  useEffect(() => {
    setSoruyor(false);
    setDevralanId(varsayilan);
  }, [ajan.id, varsayilan]);

  // Yanlışlıkla onaylanmasın: odak Vazgeç'te başlar
  useEffect(() => {
    if (soruyor) vazgecRef.current?.focus();
  }, [soruyor]);

  if (ajan.rol === "ceo") {
    return (
      <section className="ajan-bolum ajan-bolum-tehlike" aria-label={t.istenCikar}>
        <p className="alan-ipucu">{t.ceoCikarilamaz}</p>
      </section>
    );
  }

  const cikar = () =>
    calistir("cikar", async () => {
      await api.istenCikarDevrederek(ajan.id, devralan?.id);
      ajanKaldir(ajan.id);
      bildir("bilgi", sozluk().ekip.ayrinti.istenCikarildi(ajan.ad, devralan?.ad ?? null));
    });

  return (
    <section className="ajan-bolum ajan-bolum-tehlike" aria-label={t.istenCikar}>
      {soruyor ? (
        <div
          className="onay-sor isten-cikar"
          role="alertdialog"
          aria-labelledby={`${kimlik}-uyari`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setSoruyor(false);
            }
          }}
        >
          <p id={`${kimlik}-uyari`}>{t.istenCikarUyari(ajan.ad)}</p>
          {adaylar.length ? (
            <div className="alan">
              <label htmlFor={`${kimlik}-devralan`}>{t.devralanSoru}</label>
              <select id={`${kimlik}-devralan`} className="secim" value={devralanId} onChange={(e) => setDevralanId(e.target.value)}>
                {adaylar.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ad} · {a.rolAdi}
                    {a.id === ajan.yoneticiId ? ` (${t.yoneticisi})` : ""}
                  </option>
                ))}
              </select>
              {devralan ? <span className="alan-ipucu isten-cikar-ipucu">{t.devralanAciklama(devralan.ad)}</span> : null}
            </div>
          ) : (
            <p className="alan-ipucu">{t.devralanYok}</p>
          )}
          <div className="dugme-satir">
            <button type="button" className="dugme dugme-kucuk dugme-tehlike" onClick={() => void cikar()} disabled={suruyor !== null}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : null}
              {t.istenCikarEvet(ajan.ad)}
            </button>
            <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={() => setSoruyor(false)} ref={vazgecRef}>
              {s.genel.vazgec}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dugme dugme-tehlike dugme-kucuk" onClick={() => setSoruyor(true)}>
          {t.istenCikar}
        </button>
      )}
    </section>
  );
}
