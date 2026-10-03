// Ajan oturumu: canlı döküm, otomatik kaydırma, mesaj yazma, kes/durdur
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MesajFormu, OturumDugmeleri } from "../bilesenler/ajan/AjanEylemleri";
import { TranskriptSatir, useTranskript } from "../bilesenler/ajan/Transkript";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { AjanAvatar, AjanDurum, izinModuAdi, modelAdi } from "../bilesenler/Kisi";
import { Simge } from "../bilesenler/Simge";
import { git, useArayuz } from "../durum/arayuz";
import { abonelikMi, ajanAkisiniYukle, useVeri } from "../durum/veri";
import { para, token } from "../yardimcilar/bicim";

const PENCERE = 500;
const ALT_ESIGI = 64;

export function AjanOturumu() {
  const ajanId = useArayuz((d) => d.ajanId);
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === ajanId));
  const projeYukleme = useVeri((d) => d.projeYukleme);

  if (!ajan) {
    if (projeYukleme === "yukleniyor") return <Iskelet satir={10} />;
    return (
      <Bos
        baslik="Ajan bulunamadı"
        eylem={
          <button type="button" className="dugme" onClick={() => git("ekip")}>
            Ekibe dön
          </button>
        }
      >
        Bu ajan işten çıkarılmış ya da başka bir projeye ait olabilir.
      </Bos>
    );
  }
  return <Oturum key={ajan.id} ajanId={ajan.id} />;
}

function Oturum({ ajanId }: { ajanId: string }) {
  const abonelik = useVeri(abonelikMi);
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === ajanId))!;
  const ogeler = useVeri((d) => d.akislar[ajanId]);
  const yukleme = useVeri((d) => d.akisYukleme[ajanId]);
  const satirlar = useTranskript(ogeler);
  const [goster, setGoster] = useState(PENCERE);
  const [yeniSayisi, setYeniSayisi] = useState(0);
  const kapRef = useRef<HTMLDivElement>(null);
  const alttaRef = useRef(true);
  const oncekiUzunluk = useRef(0);
  const eskiYukseklik = useRef<number | null>(null);

  useEffect(() => {
    ajanAkisiniYukle(ajanId).catch(() => undefined);
  }, [ajanId]);

  const gorunen = satirlar.slice(Math.max(0, satirlar.length - goster));
  const gizli = satirlar.length - gorunen.length;

  // Yeni öğe gelince: kullanıcı alttaysa kaydır, değilse sayacı artır
  useLayoutEffect(() => {
    const kap = kapRef.current;
    if (!kap) return;
    if (eskiYukseklik.current !== null) {
      // Eski öğeler başa eklendi: görünen yer kaymasın
      kap.scrollTop += kap.scrollHeight - eskiYukseklik.current;
      eskiYukseklik.current = null;
      return;
    }
    const fark = satirlar.length - oncekiUzunluk.current;
    oncekiUzunluk.current = satirlar.length;
    if (alttaRef.current) kap.scrollTop = kap.scrollHeight;
    else if (fark > 0) setYeniSayisi((n) => n + fark);
  }, [satirlar.length, ogeler]);

  const kaydirildi = () => {
    const kap = kapRef.current;
    if (!kap) return;
    const altta = kap.scrollHeight - kap.scrollTop - kap.clientHeight < ALT_ESIGI;
    alttaRef.current = altta;
    if (altta && yeniSayisi) setYeniSayisi(0);
  };

  const enAlta = () => {
    const kap = kapRef.current;
    if (!kap) return;
    kap.scrollTo({ top: kap.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    alttaRef.current = true;
    setYeniSayisi(0);
  };

  const dahaFazla = () => {
    eskiYukseklik.current = kapRef.current?.scrollHeight ?? null;
    setGoster((g) => g + PENCERE);
  };

  return (
    <div className="oturum">
      <header className="oturum-ust">
        <button
          type="button"
          className="dugme dugme-sessiz dugme-kucuk dugme-simge"
          onClick={() => git("ekip")}
          aria-label="Ekibe dön"
          title="Ekibe dön"
        >
          <Simge ad="geri" />
        </button>
        <AjanAvatar ajan={ajan} />
        <div className="oturum-kim">
          <h1>{ajan.ad}</h1>
          <span>
            {ajan.rolAdi} · {modelAdi(ajan.model)} · {izinModuAdi(ajan.izinModu)}
          </span>
        </div>
        <AjanDurum durum={ajan.durum} />
        {abonelik ? (
          <span className="metre oturum-maliyet" title="Bugün / toplam işlenen token (abonelik: ücret alınmaz)">
            <b>{token(ajan.bugunToken)}</b> token bugün · {token(ajan.toplamToken)} toplam
          </span>
        ) : (
          <span className="metre oturum-maliyet" title="Bugün / toplam harcama">
            <b>{para(ajan.bugunHarcananUsd)}</b> bugün · {para(ajan.toplamHarcananUsd)} toplam
          </span>
        )}
        <div className="oturum-eylem">
          <OturumDugmeleri ajan={ajan} kucuk />
        </div>
      </header>
      {ajan.isAciklamasi ? <p className="oturum-is">{ajan.isAciklamasi}</p> : null}

      <div className="oturum-govde">
        <div className="transkript" ref={kapRef} onScroll={kaydirildi} role="log" aria-label={`${ajan.ad} oturum dökümü`}>
          {yukleme === "yukleniyor" && !ogeler?.length ? <Iskelet satir={10} etiket="Oturum yükleniyor" /> : null}
          {yukleme === "hata" ? <HataKutu metin="Oturum akışı alınamadı." yeniden={() => void ajanAkisiniYukle(ajanId, true)} /> : null}
          {yukleme === "hazir" && satirlar.length === 0 ? (
            <Bos kucuk baslik="Oturumda henüz bir şey yok">
              {ajan.durum === "kapali"
                ? `Oturum kapalı. Başlatın ya da aşağıdan mesaj yazın; mesaj oturumu açar.`
                : "Ajan çalıştıkça mesajları, düşünceleri ve araç çağrıları burada akar."}
            </Bos>
          ) : null}
          {gizli > 0 ? (
            <div className="transkript-daha">
              <button type="button" className="dugme dugme-kucuk" onClick={dahaFazla}>
                Daha eski {Math.min(gizli, PENCERE)} öğeyi göster
              </button>
              <small>{gizli} öğe gizli</small>
            </div>
          ) : null}
          {gorunen.map((s) => (
            <TranskriptSatir key={s.oge.id} satir={s} kok={ajan.calismaAlani} />
          ))}
        </div>
        {yeniSayisi > 0 ? (
          <button type="button" className="dugme dugme-kucuk en-yeni" onClick={enAlta}>
            <Simge ad="asagi" boyut={12} />
            En yeniye in · {yeniSayisi} yeni
          </button>
        ) : null}
      </div>

      <div className="oturum-yaz">
        <MesajFormu ajan={ajan} satirlar={2} />
      </div>
    </div>
  );
}
