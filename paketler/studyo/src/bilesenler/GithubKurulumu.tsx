// GitHub kurulumu: git, GitHub CLI (gh), GitHub girişi (cihaz kodu) ve git kimliği. gh'yi ArnOrg kendisi indirir,
// girişten sonra git'in GitHub kimliğini gh'den alması ayarlanır. İlk kurulum sihirbazı, Projeler ve Ayarlar kullanır.
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir, hataBildir } from "../durum/arayuz";
import { githubBagli, githubHesabiYukle, kurulumuYukle, useKurulum, useKurulumIslemi } from "../durum/kurulum";
import { useIslem } from "../yardimcilar/kancalar";
import { HataKutu, Yukleniyor } from "./Durumlar";
import { IslemPaneli, KopyalaDugmesi } from "./IslemPaneli";
import { epostaGecerliMi } from "./kurulumYardimcilari";
import { KurulumListesi, KurulumOgesi } from "./KurulumListesi";
import { Simge } from "./Simge";

const LINUX_GIT_KOMUTLARI = [
  ["sudo apt install git", "Debian, Ubuntu"],
  ["sudo dnf install git", "Fedora"],
  ["sudo pacman -S git", "Arch"],
] as const;

export function GithubKurulumu() {
  const s = useSozluk();
  const t = s.kurulum.github;
  const durum = useKurulum((d) => d.durum);
  const yukleme = useKurulum((d) => d.yukleme);
  const hata = useKurulum((d) => d.hata);
  const yardimci = useIslem();
  const tazeleme = useIslem();

  const gitKur = useKurulumIslemi("git_kur", () => void kurulumuYukle(true));
  const ghKur = useKurulumIslemi("gh_kur", (i) => {
    if (i.durum === "tamam") bildir("basari", sozluk().kurulum.github.ghKuruldu);
    void kurulumuYukle(true);
  });
  const ghGiris = useKurulumIslemi("gh_giris", (i) => {
    void kurulumuYukle(true).then((d) => {
      if (i.durum !== "tamam") return;
      bildir("basari", sozluk().kurulum.github.girisTamam(d?.github.kullanici ?? null));
      void githubHesabiYukle(true);
    });
  });

  useEffect(() => {
    if (useKurulum.getState().yukleme === "bos") void kurulumuYukle();
  }, []);

  if (!durum) {
    return yukleme === "hata" ? (
      <HataKutu baslik={s.kurulum.claude.alinamadi} metin={hata ?? s.genel.bilinmeyenHata} yeniden={() => void kurulumuYukle(true)} />
    ) : (
      <Yukleniyor metin={t.yukleniyor} />
    );
  }

  const g = durum.git;
  const h = durum.github;
  const windows = durum.platform.startsWith("win32");
  const gitKurBaslat = () => void gitKur.baslat(() => api.gitKur()).catch(hataBildir);
  const ghKurBaslat = () => void ghKur.baslat(() => api.ghKur()).catch(hataBildir);
  const ghGirisBaslat = () => void ghGiris.baslat(() => api.ghGiris()).catch(hataBildir);
  const yardimciAyarla = () =>
    void yardimci.calistir("yardimci", async () => {
      const github = await api.gitYardimcisi();
      useKurulum.setState((d) => (d.durum ? { durum: { ...d.durum, github } } : {}));
      bildir("basari", sozluk().kurulum.github.yardimciTamam);
    });

  return (
    <div className="kurulum">
      <KurulumListesi>
        <KurulumOgesi durum={g.kurulu ? "tamam" : "eksik"} baslik={t.git} deger={g.kurulu ? t.gitVar(g.surum) : t.gitYok}>
          {!g.kurulu ? (
            durum.gitKurulabilir ? (
              <>
                <p className="kurulum-ipucu">{windows ? t.gitKurWindows : t.gitKurMac}</p>
                {gitKur.islem ? <IslemPaneli islem={gitKur.islem} yenidenDene={gitKurBaslat} gizle={gitKur.gizle} /> : null}
                {!gitKur.islem || gitKur.islem.durum === "tamam" ? (
                  <div>
                    <button type="button" className="dugme dugme-ana" onClick={gitKurBaslat}>
                      <Simge ad="indir" />
                      {t.gitKur}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="kurulum-ipucu">{t.gitLinux}</p>
                <ul className="kurulum-komutlar">
                  {LINUX_GIT_KOMUTLARI.map(([komut, dagitim]) => (
                    <li key={komut}>
                      <code>{komut}</code>
                      <small>{dagitim}</small>
                      <KopyalaDugmesi metin={komut} kucuk />
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : null}
        </KurulumOgesi>

        <KurulumOgesi
          durum={h.kurulu ? "tamam" : "eksik"}
          baslik={t.gh}
          deger={h.kurulu ? t.ghVar(h.surum, h.kaynak ? t.ghKaynak[h.kaynak] : "") : t.ghYok}
        >
          {!h.kurulu ? (
            <>
              <p className="kurulum-ipucu">{t.ghKurIpucu}</p>
              {ghKur.islem ? <IslemPaneli islem={ghKur.islem} yenidenDene={ghKurBaslat} gizle={ghKur.gizle} /> : null}
              {!ghKur.islem || ghKur.islem.durum === "tamam" ? (
                <div>
                  <button type="button" className="dugme dugme-ana" onClick={ghKurBaslat}>
                    <Simge ad="indir" />
                    {t.ghKur}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {h.hata ? <p className="alan-hata">{h.hata}</p> : null}
        </KurulumOgesi>

        <KurulumOgesi
          durum={h.girisYapildi ? "tamam" : "eksik"}
          baslik={t.giris}
          deger={h.girisYapildi ? t.girisVar(h.kullanici ?? "GitHub") : t.girisYok}
        >
          {!h.girisYapildi ? (
            h.kurulu ? (
              <>
                <p className="kurulum-ipucu">{t.girisIpucu}</p>
                {ghGiris.islem ? <IslemPaneli islem={ghGiris.islem} yenidenDene={ghGirisBaslat} gizle={ghGiris.gizle} /> : null}
                {!ghGiris.islem || ghGiris.islem.durum === "tamam" ? (
                  <div>
                    <button type="button" className="dugme dugme-ana" onClick={ghGirisBaslat}>
                      {t.girisYap}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="kurulum-ipucu">{t.girisOnce}</p>
            )
          ) : !h.gitYardimcisi ? (
            <>
              <p className="kurulum-ipucu">{t.yardimciYok}</p>
              <div>
                <button type="button" className="dugme" onClick={yardimciAyarla} disabled={yardimci.suruyor !== null}>
                  {yardimci.suruyor ? <span className="doner" aria-hidden="true" /> : null}
                  {t.yardimciAyarla}
                </button>
              </div>
            </>
          ) : null}
        </KurulumOgesi>

        <GitKimligi />
      </KurulumListesi>
      <div className="kurulum-alt">
        <button
          type="button"
          className="metin-dugme"
          onClick={() => void tazeleme.calistir("tazele", () => kurulumuYukle(true))}
          disabled={tazeleme.suruyor !== null}
        >
          {tazeleme.suruyor ? <span className="doner" aria-hidden="true" /> : null}
          {t.tazele}
        </button>
      </div>
    </div>
  );
}

/** git kimliği: boşsa form (GitHub hesabından doldurulur), doluysa ad ve e-posta ile "Değiştir" */
function GitKimligi() {
  const s = useSozluk();
  const t = s.kurulum.github;
  const id = useId();
  const durum = useKurulum((d) => d.durum);
  const hesap = useKurulum((d) => d.githubHesabi);
  const git = durum?.git;
  const tamam = !!git?.kullaniciAdi && !!git.eposta;
  const [duzenle, setDuzenle] = useState(false);
  const [ad, setAd] = useState(git?.kullaniciAdi ?? "");
  const [eposta, setEposta] = useState(git?.eposta ?? "");
  const [githubdan, setGithubdan] = useState(false);
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();
  const bagli = githubBagli(durum);

  useEffect(() => {
    if (bagli) void githubHesabiYukle();
  }, [bagli]);

  // Kimlik boşsa hesap gelince GitHub'dan doldur (kullanıcının yazdığına dokunmadan)
  useEffect(() => {
    if (!hesap || tamam) return;
    const hesapAdi = hesap.ad || hesap.kullanici;
    let doldu = false;
    if (hesapAdi && !ad.trim()) {
      setAd(hesapAdi);
      doldu = true;
    }
    if (hesap.eposta && !eposta.trim()) {
      setEposta(hesap.eposta);
      doldu = true;
    }
    if (doldu) setGithubdan(true);
    // Yalnız hesap bilgisi geldiğinde çalışır; yazılanlar o anki değerleriyle okunur
  }, [hesap, tamam]);

  if (!git) return null;

  const adHata = !ad.trim() ? t.adGerekli : null;
  const epostaHata = !epostaGecerliMi(eposta) ? t.epostaGecersiz : null;

  const kaydet = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDenendi(true);
    if (adHata || epostaHata) return;
    void calistir(
      "kimlik",
      async () => {
        const yeni = await api.gitKimligi(ad.trim(), eposta.trim());
        useKurulum.setState((d) => (d.durum ? { durum: { ...d.durum, git: yeni } } : {}));
        bildir("basari", sozluk().kurulum.github.kimlikKaydedildi);
        setDuzenle(false);
        setDenendi(false);
        setGithubdan(false);
      },
      true,
    );
  };

  const duzenlemeyiAc = () => {
    setAd(git.kullaniciAdi ?? "");
    setEposta(git.eposta ?? "");
    setDenendi(false);
    setDuzenle(true);
  };

  return (
    <KurulumOgesi
      durum={tamam ? "tamam" : "eksik"}
      baslik={t.kimlik}
      deger={tamam ? t.kimlikVar(git.kullaniciAdi!, git.eposta!) : t.kimlikYok}
    >
      {!git.kurulu ? (
        <p className="kurulum-ipucu">{t.gitOnce}</p>
      ) : tamam && !duzenle ? (
        <div className="kurulum-satir">
          <p className="kurulum-ipucu">{t.kimlikIpucu}</p>
          <button type="button" className="metin-dugme" onClick={duzenlemeyiAc}>
            {t.kimlikDegistir}
          </button>
        </div>
      ) : (
        <form className="kurulum-form" onSubmit={kaydet} noValidate>
          <p className="kurulum-ipucu">{githubdan ? t.kimlikGithubdan : t.kimlikIpucu}</p>
          <div className="form-izgara">
            <div className="alan">
              <label htmlFor={`${id}-ad`}>{t.ad}</label>
              <input
                id={`${id}-ad`}
                className="girdi"
                value={ad}
                onChange={(e) => setAd(e.target.value)}
                placeholder={t.adOrnek}
                autoComplete="name"
                aria-invalid={denendi && adHata ? true : undefined}
              />
              {denendi && adHata ? <span className="alan-hata">{adHata}</span> : null}
            </div>
            <div className="alan">
              <label htmlFor={`${id}-eposta`}>{t.eposta}</label>
              <input
                id={`${id}-eposta`}
                className="girdi"
                type="email"
                value={eposta}
                onChange={(e) => setEposta(e.target.value)}
                placeholder={t.epostaOrnek}
                autoComplete="email"
                spellCheck={false}
                aria-invalid={denendi && epostaHata ? true : undefined}
              />
              {denendi && epostaHata ? <span className="alan-hata">{epostaHata}</span> : null}
            </div>
          </div>
          {hata ? <p className="alan-hata" role="alert">{hata}</p> : null}
          <div className="dugme-satir">
            <button type="submit" className="dugme dugme-ana" disabled={suruyor !== null}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : null}
              {t.kimlikKaydet}
            </button>
            {duzenle ? (
              <button type="button" className="dugme dugme-sessiz" onClick={() => setDuzenle(false)}>
                {s.genel.vazgec}
              </button>
            ) : null}
          </div>
        </form>
      )}
    </KurulumOgesi>
  );
}
