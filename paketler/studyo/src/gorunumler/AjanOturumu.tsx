// Ajan oturumu: canlı döküm, otomatik kaydırma, mesaj yazma, kes/durdur
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MesajFormu, OturumDugmeleri } from "../bilesenler/ajan/AjanEylemleri";
import { TranskriptSatir, useTranskript } from "../bilesenler/ajan/Transkript";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { AjanAvatar, AjanDurum, izinModuAdi, ModelAdi } from "../bilesenler/Kisi";
import { Simge } from "../bilesenler/Simge";
import { useSozluk } from "../dil";
import { git, useArayuz } from "../durum/arayuz";
import { ajanAkisiniYukle, useVeri } from "../durum/veri";
import { token } from "../yardimcilar/bicim";

const PENCERE = 500;
const ALT_ESIGI = 64;

export function AjanOturumu() {
  const s = useSozluk();
  const ajanId = useArayuz((d) => d.ajanId);
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === ajanId));
  const projeYukleme = useVeri((d) => d.projeYukleme);

  if (!ajan) {
    if (projeYukleme === "yukleniyor") return <Iskelet satir={10} />;
    return (
      <Bos
        baslik={s.ajan.bulunamadi}
        eylem={
          <button type="button" className="dugme" onClick={() => git("ekip")}>
            {s.ajan.ekibeDon}
          </button>
        }
      >
        {s.ajan.bulunamadiMetin}
      </Bos>
    );
  }
  return <Oturum key={ajan.id} ajanId={ajan.id} />;
}

function Oturum({ ajanId }: { ajanId: string }) {
  const s = useSozluk();
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
          aria-label={s.ajan.ekibeDon}
          title={s.ajan.ekibeDon}
        >
          <Simge ad="geri" />
        </button>
        <AjanAvatar ajan={ajan} />
        <div className="oturum-kim">
          <h1>{ajan.ad}</h1>
          <span>
            {ajan.rolAdi} · <ModelAdi model={ajan.model} /> · {izinModuAdi(ajan.izinModu)}
          </span>
        </div>
        <AjanDurum durum={ajan.durum} />
        <span className="metre oturum-kullanim" title={s.ajan.tokenIpucu}>
          <b>{token(ajan.bugunToken)}</b> {s.ajan.tokenBugun} · {token(ajan.toplamToken)} {s.ajan.tokenToplam}
        </span>
        <div className="oturum-eylem">
          <OturumDugmeleri ajan={ajan} kucuk />
        </div>
      </header>
      {ajan.isAciklamasi ? <p className="oturum-is">{ajan.isAciklamasi}</p> : null}

      <div className="oturum-govde">
        <div className="transkript" ref={kapRef} onScroll={kaydirildi} role="log" aria-label={s.ajan.dokum(ajan.ad)}>
          {yukleme === "yukleniyor" && !ogeler?.length ? <Iskelet satir={10} etiket={s.ajan.yukleniyor} /> : null}
          {yukleme === "hata" ? <HataKutu metin={s.ajan.akisAlinamadi} yeniden={() => void ajanAkisiniYukle(ajanId, true)} /> : null}
          {yukleme === "hazir" && satirlar.length === 0 ? (
            <Bos kucuk baslik={s.ajan.bosBaslik}>
              {ajan.durum === "kapali" ? s.ajan.bosKapali : s.ajan.bosAcik}
            </Bos>
          ) : null}
          {gizli > 0 ? (
            <div className="transkript-daha">
              <button type="button" className="dugme dugme-kucuk" onClick={dahaFazla}>
                {s.ajan.dahaEski(Math.min(gizli, PENCERE))}
              </button>
              <small>{s.ajan.gizli(gizli)}</small>
            </div>
          ) : null}
          {gorunen.map((s) => (
            <TranskriptSatir key={s.oge.id} satir={s} kok={ajan.calismaAlani} />
          ))}
        </div>
        {yeniSayisi > 0 ? (
          <button type="button" className="dugme dugme-kucuk en-yeni" onClick={enAlta}>
            <Simge ad="asagi" boyut={12} />
            {s.ajan.enYeni(yeniSayisi)}
          </button>
        ) : null}
      </div>

      <div className="oturum-yaz">
        <MesajFormu ajan={ajan} satirlar={2} />
      </div>
    </div>
  );
}
