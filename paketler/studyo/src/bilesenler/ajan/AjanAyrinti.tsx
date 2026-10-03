// Ekip ekranındaki ajan ayrıntı paneli: kimlik, oturum eylemleri, ayarlar, işten çıkarma
import type { Ajan, IzinModu } from "@arnorg/ortak";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api/uclar";
import { ajanaGit, bildir, git, hataBildir } from "../../durum/arayuz";
import { ajanKaldir, ajanUygula, useVeri } from "../../durum/veri";
import { belirtme, tarih, token } from "../../yardimcilar/bicim";
import { useIslem } from "../../yardimcilar/kancalar";
import { KarakterSecici } from "../KarakterSecici";
import { AjanAvatar, AjanDurum, IZIN_MODU_ADLARI, izinModuAdi, modelAdi } from "../Kisi";
import { OnaySor } from "../OnaySor";
import { Simge } from "../Simge";
import { MesajFormu, OturumDugmeleri } from "./AjanEylemleri";

const MODELLER = ["opus", "sonnet", "haiku"];
const IZIN_MODLARI = Object.keys(IZIN_MODU_ADLARI) as IzinModu[];

// Plan modundan çıkınca dönülecek mod; oturum boyunca bellekte tutulur
const oncekiModlar = new Map<string, IzinModu>();

/** mesaj: false ise "Mesaj gönder" bölümü gösterilmez (çağıran kendi mesaj kutusunu koyar) */
export function AjanAyrinti({ ajan, mesaj = true }: { ajan: Ajan; mesaj?: boolean }) {
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const yonetici = ajanlar.find((a) => a.id === ajan.yoneticiId);
  const gorev = gorevler.find((g) => g.id === ajan.gorevId);

  return (
    <div className="ajan-ayrinti">
      <div className="ajan-ayrinti-ust">
        <AjanAvatar ajan={ajan} boyut="l" />
        <div className="kisi-metin">
          <b className="ajan-ayrinti-ad">{ajan.ad}</b>
          <small>
            {ajan.rolAdi} · {modelAdi(ajan.model)}
          </small>
        </div>
        <button type="button" className="dugme dugme-kucuk" onClick={() => ajanaGit(ajan.id)}>
          Oturumu aç
        </button>
      </div>
      <div className="ajan-ayrinti-durum">
        <AjanDurum durum={ajan.durum} />
        {ajan.isAciklamasi ? <p>{ajan.isAciklamasi}</p> : null}
      </div>

      <OturumDugmeleri ajan={ajan} kucuk />

      <dl className="kv">
        <dt>Bugün</dt>
        <dd className="sayi">{token(ajan.bugunToken)} token</dd>
        <dt>Toplam</dt>
        <dd className="sayi">{token(ajan.toplamToken)} token</dd>
        <dt>İzin modu</dt>
        <dd>{izinModuAdi(ajan.izinModu)}</dd>
        <dt>Yönetici</dt>
        <dd>{yonetici ? `${yonetici.ad} · ${yonetici.rolAdi}` : "Yönetim kurulu"}</dd>
        {gorev ? (
          <>
            <dt>Görev</dt>
            <dd>
              <button type="button" className="gorev-kodu" onClick={() => git("pano", { gorevId: gorev.id })}>
                {gorev.kod}
              </button>{" "}
              {gorev.baslik}
            </dd>
          </>
        ) : null}
        <dt>Dal</dt>
        <dd>{ajan.dal ? <code>{ajan.dal}</code> : <span className="soluk">Henüz yok</span>}</dd>
        <dt>Çalışma alanı</dt>
        <dd>{ajan.calismaAlani ? <code>{ajan.calismaAlani}</code> : <span className="soluk">Henüz yok</span>}</dd>
        <dt>İşe alındı</dt>
        <dd>{tarih(ajan.olusturma)}</dd>
      </dl>

      {mesaj ? (
        <section className="ajan-bolum" aria-label="Mesaj gönder">
          <h3>Mesaj gönder</h3>
          <MesajFormu ajan={ajan} />
        </section>
      ) : null}

      <AjanAyarlari ajan={ajan} />
      <IstenCikar ajan={ajan} />
    </div>
  );
}

function AjanAyarlari({ ajan }: { ajan: Ajan }) {
  const ajanlar = useVeri((d) => d.ajanlar);
  const { suruyor, calistir } = useIslem();
  const [yoneticiId, setYoneticiId] = useState(ajan.yoneticiId ?? "");
  const [talimat, setTalimat] = useState(ajan.talimatEki);
  const [ozelModel, setOzelModel] = useState(MODELLER.includes(ajan.model) ? "" : ajan.model);

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
      bildir("basari", `${ajan.ad} artık ${modelAdi(model)} ile çalışıyor.`);
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
      bildir("basari", "Ajan ayarları kaydedildi.");
    });
  };

  return (
    <section className="ajan-bolum" aria-label="Ayarlar">
      <h3>Ayarlar</h3>
      <div className="ayar-satir">
        <div className="alan">
          <label htmlFor={`model-${ajan.id}`}>Model</label>
          <select
            id={`model-${ajan.id}`}
            className="secim"
            value={MODELLER.includes(ajan.model) ? ajan.model : "ozel"}
            disabled={suruyor !== null}
            onChange={(e) => {
              if (e.target.value !== "ozel") void modelDegistir(e.target.value);
              else setOzelModel(ajan.model);
            }}
          >
            {MODELLER.map((m) => (
              <option key={m} value={m}>
                {modelAdi(m)}
              </option>
            ))}
            <option value="ozel">Özel model kimliği…</option>
          </select>
        </div>
        <div className="alan">
          <label htmlFor={`mod-${ajan.id}`}>İzin modu</label>
          <select
            id={`mod-${ajan.id}`}
            className="secim"
            value={ajan.izinModu}
            disabled={suruyor !== null}
            onChange={(e) => void modDegistir(e.target.value as IzinModu)}
          >
            {IZIN_MODLARI.map((m) => (
              <option key={m} value={m}>
                {IZIN_MODU_ADLARI[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!MODELLER.includes(ajan.model) || ozelModel ? (
        <div className="ayar-satir ayar-satir-tek">
          <input
            className="girdi"
            aria-label="Özel model kimliği"
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
            Uygula
          </button>
        </div>
      ) : null}
      <div className="dugme-satir">
        <button
          type="button"
          className="dugme dugme-kucuk"
          disabled={suruyor !== null}
          onClick={() => void modDegistir(planda ? (oncekiModlar.get(ajan.id) ?? "default") : "plan")}
          title={planda ? "Önceki izin moduna döner" : "Ajan yalnız plan yazar, dosya değiştirmez"}
        >
          <Simge ad="plan" boyut={12} />
          {planda ? "Plan modundan çık" : "Plan moduna al"}
        </button>
      </div>

      <KarakterAyari ajan={ajan} />

      <form className="ajan-ayar-form" onSubmit={kaydet}>
        <div className="ayar-satir">
          <div className="alan">
            <label htmlFor={`yonetici-${ajan.id}`}>Yönetici</label>
            <select id={`yonetici-${ajan.id}`} className="secim" value={yoneticiId} onChange={(e) => setYoneticiId(e.target.value)}>
              <option value="">Yönetim kurulu</option>
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
          <label htmlFor={`talimat-${ajan.id}`}>Ek talimat</label>
          <textarea
            id={`talimat-${ajan.id}`}
            className="metin-alani"
            rows={3}
            value={talimat}
            onChange={(e) => setTalimat(e.target.value)}
            placeholder="Rol talimatına eklenir. Örn. Testleri her zaman vitest ile yaz."
          />
        </div>
        <div className="dugme-satir">
          <button type="submit" className="dugme dugme-kucuk" disabled={!degisti || suruyor !== null}>
            {suruyor === "kaydet" ? <span className="doner" aria-hidden="true" /> : null}
            Değişiklikleri kaydet
          </button>
        </div>
      </form>
    </section>
  );
}

/** Ofis karakteri: seçim hemen görünür, kısa bir beklemeden sonra kaydedilir (oklarla gezerken her adımda istek gitmez) */
function KarakterAyari({ ajan }: { ajan: Ajan }) {
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
        Ofis karakteri {kaydediliyor ? <span className="doner" aria-hidden="true" /> : null}
      </span>
      <KarakterSecici deger={yerel} degisti={degisti} rol={ajan.rol} ajan={ajan} etiketId={`karakter-${ajan.id}`} />
    </div>
  );
}

function IstenCikar({ ajan }: { ajan: Ajan }) {
  const [soruyor, setSoruyor] = useState(false);
  const { suruyor, calistir } = useIslem();
  useEffect(() => setSoruyor(false), [ajan.id]);

  const cikar = () =>
    calistir("cikar", async () => {
      await api.istenCikar(ajan.id);
      ajanKaldir(ajan.id);
      bildir("bilgi", `${ajan.ad} işten çıkarıldı. Kimlik dosyası ve çalışma alanı repoda kaldı.`);
    });

  return (
    <section className="ajan-bolum ajan-bolum-tehlike" aria-label="İşten çıkar">
      {soruyor ? (
        <OnaySor evet={cikar} vazgec={() => setSoruyor(false)} evetMetni={`Evet, ${belirtme(ajan.ad)} çıkar`} suruyor={suruyor === "cikar"}>
          {ajan.ad} işten çıkarılırsa oturumu kapanır. Kimlik dosyası (.arnorg/ekip/) ve çalışma alanı yerinde kalır; atanmış görevleri boşa düşer.
        </OnaySor>
      ) : (
        <button type="button" className="dugme dugme-tehlike dugme-kucuk" onClick={() => setSoruyor(true)}>
          İşten çıkar
        </button>
      )}
    </section>
  );
}
