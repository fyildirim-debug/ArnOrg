// Kanallar: kanal listesi, akan mesajlar (anma ve görev kodu vurgulu), yazıyor göstergesi, yazma alanı.
// Yeni mesaj yumuşakça girer ve liste alta iner; kullanıcı yukarı kaydırdıysa yerinde kalır ve "yeni mesaj" düğmesi çıkar.
// ArnOrg'un başlangıç ve iş duyuruları kendi imzasıyla görünür. CEO ile bire bir sohbet burada değil Karargâh'tadır.
// Liste ArnOrg'un ve ajanların kanallarıyla kurulun kurduğu kanalları ayırır; kurulun kanalında üyeler ve serbest konuşma
// başlıktaki şeritten yönetilir (bilesenler/kanal).
import { ARNORG_GONDEREN, kanalAciklamasi, kanalGorunenAdi, KURUL, type Ajan, type Kanal, type Mesaj } from "@arnorg/ortak";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../api/uclar";
import { useAltaYapisik, useYeniGelenler } from "../bilesenler/altaYapis";
import { AnmaliYazi } from "../bilesenler/AnmaliYazi";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { KanalCekmecesi } from "../bilesenler/kanal/KanalCekmecesi";
import { KonusmaSeridi } from "../bilesenler/kanal/KonusmaSeridi";
import { GonderenAvatar } from "../bilesenler/Kisi";
import { gunEtiketi, gunlereAyir } from "../bilesenler/mesajGruplari";
import { SecenekliMesaj } from "../bilesenler/secenek/SecenekliMesaj";
import { Simge } from "../bilesenler/Simge";
import { KIMSE_YAZMIYOR, YaziyorGostergesi } from "../bilesenler/YaziyorGostergesi";
import { useDil, useSozluk } from "../dil";
import { ajanaGit, useArayuz } from "../durum/arayuz";
import { kanalMesajlariniYukle, kanalOkundu, mesajUygula, useVeri } from "../durum/veri";
import { saat, tarih } from "../yardimcilar/bicim";
import { kanalGruplari } from "../yardimcilar/kanallar";
import { useIslem } from "../yardimcilar/kancalar";

const BOS: Mesaj[] = [];

export function Kanallar() {
  const s = useSozluk();
  const dil = useDil();
  const kanallar = useVeri((d) => d.kanallar);
  const okunmamis = useVeri((d) => d.okunmamis);
  const yaziyorlar = useVeri((d) => d.yaziyorlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const secili = useArayuz((d) => d.kanal);
  const [kurAcik, setKurAcik] = useState(false);
  const grupId = useId().replace(/[^\w-]/g, "");
  const listeRef = useRef<HTMLElement>(null);
  // CEO sohbeti listede yok; ArnOrg'un ve ajanların kanalları önce, kurulun kurdukları sonra
  const { sirket, kurulun } = useMemo(() => kanalGruplari(kanallar), [kanallar]);
  const gorunen = useMemo(() => [...sirket, ...kurulun], [sirket, kurulun]);
  const kanal = gorunen.find((k) => k.ad === secili) ?? gorunen[0];
  const kanalAdi = kanal?.ad ?? "";

  useEffect(() => {
    if (!kanalAdi) return;
    kanalMesajlariniYukle(kanalAdi).catch(() => undefined);
    kanalOkundu(kanalAdi);
  }, [kanalAdi]);

  // Dar ekranda liste yatay kayar; seçili kanal (yeni kurulan da) görünür kalsın
  useEffect(() => {
    const nav = listeRef.current;
    const etkin = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !etkin || nav.scrollWidth <= nav.clientWidth) return;
    const kutu = etkin.getBoundingClientRect();
    const sol = kutu.left - nav.getBoundingClientRect().left + nav.scrollLeft - nav.clientWidth / 2 + kutu.width / 2;
    nav.scrollTo({ left: Math.max(0, sol) });
  }, [kanalAdi, gorunen.length]);

  const kanalDugmesi = (k: Kanal) => {
    const yazan = yaziyorlar[k.ad];
    const yaziyor = yazan?.length ? s.sohbet.yaziyor(yazan.map((y) => y.ad)) : null;
    const canli = k.ozel && k.konusma === "suruyor";
    return (
      <button
        key={k.ad}
        type="button"
        className="kanal-dugme"
        aria-current={k.ad === kanalAdi ? "true" : undefined}
        onClick={() => useArayuz.setState({ kanal: k.ad })}
        title={yaziyor ?? (canli ? s.kanallar.konusmaSuruyor : undefined)}
      >
        <span className="tek-satir"># {kanalGorunenAdi(k.ad, dil)}</span>
        {yaziyor ? (
          <span className="kanal-yaziyor" role="img" aria-label={yaziyor}>
            <i />
            <i />
            <i />
          </span>
        ) : canli ? (
          <span className="kanal-canli" role="img" aria-label={s.kanallar.konusmaSuruyor} />
        ) : null}
        {okunmamis[k.ad] && k.ad !== kanalAdi ? <span className="rozet">{okunmamis[k.ad]}</span> : <small>{k.mesajSayisi}</small>}
      </button>
    );
  };

  return (
    <div className="kanallar">
      <div className="baslik baslik-sikisik">
        <div className="baslik-metin">
          <h1>{s.kanallar.baslik}</h1>
          <p>{s.kanallar.altBaslik}</p>
        </div>
        {aktifProjeId ? (
          <div className="baslik-eylem">
            <button type="button" className="dugme dugme-ana" onClick={() => setKurAcik(true)}>
              <Simge ad="arti" />
              {s.kanallar.kanalKur}
            </button>
          </div>
        ) : null}
      </div>
      {yukleme === "yukleniyor" && !gorunen.length ? <Iskelet satir={6} /> : null}
      {yukleme === "hazir" && !gorunen.length ? (
        <Bos baslik={s.kanallar.yokBaslik}>{s.kanallar.yokMetin(kanalGorunenAdi("genel", dil), kanalGorunenAdi("muhendislik", dil))}</Bos>
      ) : null}
      {gorunen.length ? (
        <div className="kanal-yerlesim">
          <nav className="kanal-liste" aria-label={s.kanallar.baslik} ref={listeRef}>
            <div className="kanal-grup" role="group" aria-labelledby={`${grupId}-sirket`}>
              <span className="kanal-grup-ad" id={`${grupId}-sirket`}>
                {s.kanallar.grupSirket}
              </span>
              {sirket.map(kanalDugmesi)}
            </div>
            <div className="kanal-grup kanal-grup-kurulun" role="group" aria-labelledby={`${grupId}-kurulun`}>
              <span className="kanal-grup-ad" id={`${grupId}-kurulun`}>
                {s.kanallar.grupKurulun}
              </span>
              {kurulun.map(kanalDugmesi)}
              {kurulun.length ? null : <span className="kanal-grup-bos">{s.kanallar.kurulunBos}</span>}
            </div>
          </nav>
          {/* Proje ya da kanal değişince kaydırma ve giriş durumu baştan kurulur */}
          <KanalIcerigi key={`${aktifProjeId}:${kanalAdi}`} kanal={kanalAdi} aciklama={kanalAciklamasi(kanalAdi, kanal?.aciklama ?? "", dil)} ozel={kanal?.ozel ? kanal : null} />
        </div>
      ) : null}
      {kurAcik ? <KanalCekmecesi kapat={() => setKurAcik(false)} kuruldu={(ad) => useArayuz.setState({ kanal: ad })} /> : null}
    </div>
  );
}

/** ozel: kurulun kanalıysa kanalın kendisi (başlık şeridi, yazma ipucu ve boş durum ona göre) */
function KanalIcerigi({ kanal, aciklama, ozel }: { kanal: string; aciklama: string; ozel: Kanal | null }) {
  const s = useSozluk();
  const dil = useDil();
  /** Görünen ad: sistem kanalları İngilizcede kendi adlarıyla anılır; kimlik değişmez */
  const ad = kanalGorunenAdi(kanal, dil);
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const mesajlar = useVeri((d) => d.mesajlar[kanal]);
  const yukleme = useVeri((d) => d.mesajYukleme[kanal]);
  const ajanlar = useVeri((d) => d.ajanlar);
  const yazanlar = useVeri((d) => d.yaziyorlar[kanal]) ?? KIMSE_YAZMIYOR;
  const [metin, setMetin] = useState("");
  const { suruyor, calistir } = useIslem();
  const liste = mesajlar ?? BOS;
  const gruplar = useMemo(() => gunlereAyir(liste, tarih), [liste]);
  const { ref, kaydirildi, yeni, alta, altaKilitle } = useAltaYapisik<HTMLOListElement>({ sayi: liste.length, degisim: yazanlar.length });
  const yeniMi = useYeniGelenler(() => liste.map((m) => m.id), !!mesajlar, aktifProjeId);

  useEffect(() => {
    // Bu kanal açıkken gelen mesajlar okunmuş sayılır
    kanalOkundu(kanal);
  }, [kanal, liste.length]);

  const gonder = () => {
    const temiz = metin.trim();
    if (!temiz || !aktifProjeId) return;
    void calistir("gonder", async () => {
      const m = await api.mesajGonder(aktifProjeId, kanal, temiz);
      altaKilitle();
      mesajUygula(m);
      setMetin("");
    });
  };

  return (
    <section className="kanal-ic" aria-label={`#${ad}`}>
      <header className={`kanal-ust${ozel ? " kanal-ust-ozel" : ""}`}>
        <div className="kanal-kimlik">
          <b># {ad}</b>
          {aciklama ? <span>{aciklama}</span> : null}
        </div>
        {ozel ? <KonusmaSeridi kanal={ozel} /> : null}
      </header>
      <div className="kanal-pencere">
        <ol className="mesajlar" ref={ref} onScroll={kaydirildi} aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label={`#${ad}`}>
          {yukleme === "yukleniyor" && !mesajlar ? (
            <li>
              <Iskelet satir={6} />
            </li>
          ) : null}
          {yukleme === "hata" ? (
            <li>
              <HataKutu metin={s.kanallar.mesajlarAlinamadi} yeniden={() => void kanalMesajlariniYukle(kanal, true).catch(() => undefined)} />
            </li>
          ) : null}
          {mesajlar && mesajlar.length === 0 ? (
            <li>
              <Bos kucuk baslik={s.kanallar.sessiz(ad)}>
                {ozel ? s.kanallar.sessizKurulun : s.kanallar.sessizMetin}
              </Bos>
            </li>
          ) : null}
          {gruplar.map((g) => (
            <li key={g.gun} className="mesaj-gun">
              <div className="gun-ayrac" role="separator">
                <span>{gunEtiketi(g.gun, tarih, s.kanallar)}</span>
              </div>
              <ol className="mesaj-grup">
                {g.mesajlar.map(({ m, devam }) => (
                  <MesajSatiri key={m.id} mesaj={m} devam={devam} ajanlar={ajanlar} yeni={yeniMi(m.id)} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
        {yeni > 0 ? (
          <button type="button" className="yeni-mesaj-dugme" onClick={() => alta()} title={s.sohbet.enAlta}>
            <Simge ad="asagi" boyut={12} />
            {s.sohbet.yeniMesaj(yeni)}
          </button>
        ) : null}
      </div>
      <YaziyorGostergesi kisiler={yazanlar} className="kanal-yaziyor-satir" />
      <div className="kanal-yaz">
        <AnmaliYazi
          id={`yaz-${kanal}`}
          etiket={s.kanallar.yazEtiketi(ad)}
          deger={metin}
          degistir={setMetin}
          gonder={gonder}
          ajanlar={ajanlar}
          placeholder={kanal === "genel" ? s.kanallar.yazGenel(ad) : ozel ? s.kanallar.yazKurulun(ad) : s.kanallar.yazDiger(ad)}
        />
        <button type="button" className="dugme dugme-ana" onClick={gonder} disabled={!metin.trim() || suruyor !== null} aria-label={s.genel.gonder}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="gonder" boyut={13} />}
          <span className="ust-gizle-dar">{s.genel.gonder}</span>
        </button>
      </div>
    </section>
  );
}

function MesajSatiri({ mesaj, devam, ajanlar, yeni }: { mesaj: Mesaj; devam: boolean; ajanlar: Ajan[]; yeni: boolean }) {
  const s = useSozluk();
  // Giriş hareketi yalnız öğe ilk çizildiğinde karar verilir; sonraki çizimler hareketi kesmez
  const [girer] = useState(yeni);
  const kurul = mesaj.gonderenId === KURUL;
  const sistem = mesaj.gonderenId === ARNORG_GONDEREN;
  const ajan = kurul || sistem ? undefined : ajanlar.find((a) => a.id === mesaj.gonderenId);
  return (
    <li className={`mesaj${kurul ? " mesaj-siz" : ""}${sistem ? " mesaj-arnorg" : ""}${devam ? " mesaj-devam" : ""}${girer ? " mesaj-yeni" : ""}`}>
      <div className="mesaj-av">
        {devam ? (
          <time dateTime={mesaj.zaman}>{saat(mesaj.zaman)}</time>
        ) : sistem ? (
          <span className="av av-arnorg" aria-hidden="true">
            A
          </span>
        ) : (
          <GonderenAvatar gonderenId={mesaj.gonderenId} ad={mesaj.gonderenAd} ajan={ajan} />
        )}
      </div>
      <div className="mesaj-govde">
        {!devam ? (
          <div className="mesaj-ust">
            {kurul ? (
              <b>{s.kanallar.siz}</b>
            ) : sistem ? (
              <b>{s.genel.arnorg}</b>
            ) : ajan ? (
              <button type="button" className="mesaj-ad" onClick={() => ajanaGit(ajan.id)}>
                {ajan.ad}
              </button>
            ) : (
              <b>{mesaj.gonderenAd}</b>
            )}
            <small>
              {kurul ? s.genel.kurul : sistem ? s.kanallar.duyuru : (ajan?.rolAdi ?? "")} · <time dateTime={mesaj.zaman}>{saat(mesaj.zaman)}</time>
            </small>
          </div>
        ) : null}
        <SecenekliMesaj mesaj={mesaj} />
      </div>
    </li>
  );
}
