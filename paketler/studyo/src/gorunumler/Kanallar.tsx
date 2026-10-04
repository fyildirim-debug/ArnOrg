// Kanallar: kanal listesi, akan mesajlar (anma ve görev kodu vurgulu), yazıyor göstergesi, yazma alanı.
// Yeni mesaj yumuşakça girer ve liste alta iner; kullanıcı yukarı kaydırdıysa yerinde kalır ve "yeni mesaj" düğmesi çıkar.
// ArnOrg'un başlangıç ve iş duyuruları kendi imzasıyla görünür.
import { ARNORG_GONDEREN, kanalAciklamasi, kanalGorunenAdi, KURUL, type Ajan, type Mesaj } from "@arnorg/ortak";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/uclar";
import { useAltaYapisik, useYeniGelenler } from "../bilesenler/altaYapis";
import { AnmaliYazi } from "../bilesenler/AnmaliYazi";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { GonderenAvatar } from "../bilesenler/Kisi";
import { gunEtiketi, gunlereAyir } from "../bilesenler/mesajGruplari";
import { MesajMetni } from "../bilesenler/MesajMetni";
import { Simge } from "../bilesenler/Simge";
import { KIMSE_YAZMIYOR, YaziyorGostergesi } from "../bilesenler/YaziyorGostergesi";
import { useDil, useSozluk } from "../dil";
import { ajanaGit, useArayuz } from "../durum/arayuz";
import { kanalMesajlariniYukle, kanalOkundu, mesajUygula, useVeri } from "../durum/veri";
import { saat, tarih } from "../yardimcilar/bicim";
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
  const kanal = kanallar.find((k) => k.ad === secili) ?? kanallar[0];
  const kanalAdi = kanal?.ad ?? secili;

  useEffect(() => {
    if (!kanalAdi) return;
    kanalMesajlariniYukle(kanalAdi).catch(() => undefined);
    kanalOkundu(kanalAdi);
  }, [kanalAdi]);

  return (
    <div className="kanallar">
      <div className="baslik baslik-sikisik">
        <div className="baslik-metin">
          <h1>{s.kanallar.baslik}</h1>
          <p>{s.kanallar.altBaslik}</p>
        </div>
      </div>
      {yukleme === "yukleniyor" && !kanallar.length ? <Iskelet satir={6} /> : null}
      {yukleme === "hazir" && !kanallar.length ? (
        <Bos baslik={s.kanallar.yokBaslik}>{s.kanallar.yokMetin(kanalGorunenAdi("genel", dil), kanalGorunenAdi("muhendislik", dil))}</Bos>
      ) : null}
      {kanallar.length ? (
        <div className="kanal-yerlesim">
          <nav className="kanal-liste" aria-label={s.kanallar.baslik}>
            {kanallar.map((k) => {
              const yazan = yaziyorlar[k.ad];
              const yaziyor = yazan?.length ? s.sohbet.yaziyor(yazan.map((y) => y.ad)) : null;
              return (
                <button
                  key={k.ad}
                  type="button"
                  className="kanal-dugme"
                  aria-current={k.ad === kanalAdi ? "true" : undefined}
                  onClick={() => useArayuz.setState({ kanal: k.ad })}
                  title={yaziyor ?? undefined}
                >
                  <span className="tek-satir"># {kanalGorunenAdi(k.ad, dil)}</span>
                  {yaziyor ? (
                    <span className="kanal-yaziyor" role="img" aria-label={yaziyor}>
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : null}
                  {okunmamis[k.ad] && k.ad !== kanalAdi ? <span className="rozet">{okunmamis[k.ad]}</span> : <small>{k.mesajSayisi}</small>}
                </button>
              );
            })}
          </nav>
          {/* Proje ya da kanal değişince kaydırma ve giriş durumu baştan kurulur */}
          <KanalIcerigi key={`${aktifProjeId}:${kanalAdi}`} kanal={kanalAdi} aciklama={kanalAciklamasi(kanalAdi, kanal?.aciklama ?? "", dil)} />
        </div>
      ) : null}
    </div>
  );
}

function KanalIcerigi({ kanal, aciklama }: { kanal: string; aciklama: string }) {
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
      <header className="kanal-ust">
        <b># {ad}</b>
        {aciklama ? <span>{aciklama}</span> : null}
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
                {s.kanallar.sessizMetin}
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
          placeholder={kanal === "genel" ? s.kanallar.yazGenel(ad) : s.kanallar.yazDiger(ad)}
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
        <MesajMetni metin={mesaj.metin} />
      </div>
    </li>
  );
}
