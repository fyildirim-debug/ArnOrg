// Claude Code kurulumu: hangi kopya, sürüm, giriş, abonelik ve terminal komutu; giriş ve kurulum canlı işlemle.
// İlk kurulum sihirbazı ve Ayarlar ortak kullanır.
import { useEffect } from "react";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir, hataBildir } from "../durum/arayuz";
import { kurulumuYukle, useKurulum, useKurulumIslemi } from "../durum/kurulum";
import { hesabiYukle } from "../durum/veri";
import { useIslem } from "../yardimcilar/kancalar";
import { HataKutu, Yukleniyor } from "./Durumlar";
import { IslemPaneli } from "./IslemPaneli";
import { KurulumListesi, KurulumOgesi } from "./KurulumListesi";
import { Simge } from "./Simge";

export function ClaudeKurulumu() {
  const s = useSozluk();
  const t = s.kurulum.claude;
  const durum = useKurulum((d) => d.durum);
  const yukleme = useKurulum((d) => d.yukleme);
  const hata = useKurulum((d) => d.hata);
  const tazeleme = useIslem();

  const giris = useKurulumIslemi("claude_giris", (i) => {
    if (i.durum === "tamam") {
      bildir("basari", sozluk().kurulum.claude.girisTamam);
      // Üst çubuktaki plan ve kullanım da yeni girişi göstersin
      void hesabiYukle(true);
    }
    void kurulumuYukle(true);
  });
  const kur = useKurulumIslemi("claude_kur", (i) => {
    if (i.durum === "tamam") bildir("basari", sozluk().kurulum.claude.kurulumTamam);
    void kurulumuYukle(true);
  });

  useEffect(() => {
    if (useKurulum.getState().yukleme === "bos") void kurulumuYukle();
  }, []);

  if (!durum) {
    return yukleme === "hata" ? (
      <HataKutu baslik={t.alinamadi} metin={hata ?? s.genel.bilinmeyenHata} yeniden={() => void kurulumuYukle(true)} />
    ) : (
      <Yukleniyor metin={t.yukleniyor} />
    );
  }

  const c = durum.claude;
  const girisBaslat = () => void giris.baslat(() => api.claudeGiris()).catch(hataBildir);
  const kurBaslat = () => void kur.baslat(() => api.claudeKur()).catch(hataBildir);
  // Panel açıkken (sürerken ya da hata/iptalde "Yeniden dene" ile) başlatma düğmesi tekrarlanmaz
  const girisSuruyor = !!giris.islem && giris.islem.durum !== "tamam";
  // Giriş paneli eksik olan satırda durur: önce giriş, sonra abonelik
  const girisPaneli =
    giris.islem && (giris.islem.durum !== "tamam" || !c.girisYapildi) ? (
      <IslemPaneli islem={giris.islem} yenidenDene={girisBaslat} gizle={giris.gizle} />
    ) : null;

  return (
    <div className="kurulum">
      <KurulumListesi>
        <KurulumOgesi
          durum={c.kaynak ? "tamam" : "hata"}
          baslik={t.kopya}
          deger={c.kaynak ? `${t.kaynak[c.kaynak]}${c.surum ? ` · ${t.surum(c.surum)}` : ""}` : t.kopyaYok}
        >
          {!c.kaynak ? <p className="uyari-kutu">{c.hata ?? t.kopyaYokUyari}</p> : null}
        </KurulumOgesi>

        <KurulumOgesi durum={c.girisYapildi ? "tamam" : "eksik"} baslik={t.giris} deger={c.girisYapildi ? (c.eposta ?? t.girisYapildi) : t.girisYok}>
          {!c.girisYapildi ? (
            <>
              <p className="kurulum-ipucu">{t.girisIpucu}</p>
              {girisPaneli}
              {!girisSuruyor ? (
                <div>
                  <button type="button" className="dugme dugme-ana" onClick={girisBaslat} disabled={!c.kaynak}>
                    {t.girisYap}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </KurulumOgesi>

        <KurulumOgesi
          durum={!c.girisYapildi ? "bilgi" : c.abonelik ? "tamam" : "hata"}
          baslik={t.abonelik}
          deger={!c.girisYapildi ? t.abonelikBekliyor : c.abonelik ? t.abonelikVar : t.abonelikYok}
        >
          {c.girisYapildi && !c.abonelik ? (
            <>
              <p className="uyari-kutu">{t.apiUyari}</p>
              {girisPaneli}
              {!girisSuruyor ? (
                <div>
                  <button type="button" className="dugme dugme-ana" onClick={girisBaslat}>
                    {t.yenidenGiris}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </KurulumOgesi>

        <KurulumOgesi durum={c.sistemde ? "tamam" : "bilgi"} baslik={t.terminal} deger={c.sistemde ? t.terminalVar : t.terminalYok}>
          {!c.sistemde ? (
            <>
              <p className="kurulum-ipucu">{t.terminalAciklama}</p>
              {kur.islem ? <IslemPaneli islem={kur.islem} yenidenDene={kurBaslat} gizle={kur.gizle} /> : null}
              {!kur.islem || kur.islem.durum === "tamam" ? (
                <div>
                  <button type="button" className="dugme" onClick={kurBaslat}>
                    <Simge ad="terminal" />
                    {t.terminalKur}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </KurulumOgesi>
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
