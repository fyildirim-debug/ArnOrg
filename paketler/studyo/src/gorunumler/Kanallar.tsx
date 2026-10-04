// Kanallar: kanal listesi, mesajlar (anma ve görev kodu vurgulu), yazma alanı
import { kanalGorunenAdi, KURUL, type Mesaj } from "@arnorg/ortak";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/uclar";
import { AnmaliYazi } from "../bilesenler/AnmaliYazi";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { GonderenAvatar } from "../bilesenler/Kisi";
import { Simge } from "../bilesenler/Simge";
import { ZenginBlok } from "../bilesenler/ZenginMetin";
import { useDil, useSozluk } from "../dil";
import { ajanaGit, useArayuz } from "../durum/arayuz";
import { kanalMesajlariniYukle, kanalOkundu, mesajUygula, useVeri } from "../durum/veri";
import { saat, tarih } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

export function Kanallar() {
  const s = useSozluk();
  const dil = useDil();
  const kanallar = useVeri((d) => d.kanallar);
  const okunmamis = useVeri((d) => d.okunmamis);
  const yukleme = useVeri((d) => d.projeYukleme);
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
            {kanallar.map((k) => (
              <button
                key={k.ad}
                type="button"
                className="kanal-dugme"
                aria-current={k.ad === kanalAdi ? "true" : undefined}
                onClick={() => useArayuz.setState({ kanal: k.ad })}
              >
                <span className="tek-satir"># {kanalGorunenAdi(k.ad, dil)}</span>
                {okunmamis[k.ad] && k.ad !== kanalAdi ? <span className="rozet">{okunmamis[k.ad]}</span> : <small>{k.mesajSayisi}</small>}
              </button>
            ))}
          </nav>
          <KanalIcerigi
            key={kanalAdi}
            kanal={kanalAdi}
            aciklama={kanal?.aciklama || (s.kanallar.aciklamalar as Record<string, string>)[kanalAdi] || ""}
          />
        </div>
      ) : null}
    </div>
  );
}

interface Grup {
  gun: string;
  mesajlar: { m: Mesaj; devam: boolean }[];
}

/** Güne ayırır; aynı göndericinin 5 dakika içindeki ardışık mesajları birleştirir */
function grupla(mesajlar: Mesaj[]): Grup[] {
  const gruplar: Grup[] = [];
  let onceki: Mesaj | null = null;
  for (const m of mesajlar) {
    const gun = tarih(m.zaman);
    let g = gruplar[gruplar.length - 1];
    if (!g || g.gun !== gun) {
      g = { gun, mesajlar: [] };
      gruplar.push(g);
      onceki = null;
    }
    const devam = !!onceki && onceki.gonderenId === m.gonderenId && new Date(m.zaman).getTime() - new Date(onceki.zaman).getTime() < 5 * 60_000;
    g.mesajlar.push({ m, devam });
    onceki = m;
  }
  return gruplar;
}

function gunEtiketi(gun: string, s: { bugun: string; dun: string }): string {
  const bugun = tarih(new Date().toISOString());
  const dun = tarih(new Date(Date.now() - 86_400_000).toISOString());
  return gun === bugun ? s.bugun : gun === dun ? s.dun : gun;
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
  const [metin, setMetin] = useState("");
  const { suruyor, calistir } = useIslem();
  const listeRef = useRef<HTMLOListElement>(null);
  const alttaRef = useRef(true);
  const gruplar = useMemo(() => grupla(mesajlar ?? []), [mesajlar]);

  useLayoutEffect(() => {
    const l = listeRef.current;
    if (l && alttaRef.current) l.scrollTop = l.scrollHeight;
  }, [mesajlar]);

  useEffect(() => {
    // Bu kanal açıkken gelen mesajlar okunmuş sayılır
    kanalOkundu(kanal);
  }, [kanal, mesajlar?.length]);

  const gonder = () => {
    const temiz = metin.trim();
    if (!temiz || !aktifProjeId) return;
    void calistir("gonder", async () => {
      const m = await api.mesajGonder(aktifProjeId, kanal, temiz);
      alttaRef.current = true;
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
      <ol
        className="mesajlar"
        ref={listeRef}
        onScroll={(e) => {
          const l = e.currentTarget;
          alttaRef.current = l.scrollHeight - l.scrollTop - l.clientHeight < 48;
        }}
        aria-live="polite"
        aria-relevant="additions"
      >
        {yukleme === "yukleniyor" && !mesajlar ? (
          <li>
            <Iskelet satir={6} />
          </li>
        ) : null}
        {yukleme === "hata" ? (
          <li>
            <HataKutu metin={s.kanallar.mesajlarAlinamadi} yeniden={() => void kanalMesajlariniYukle(kanal, true)} />
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
              <span>{gunEtiketi(g.gun, s.kanallar)}</span>
            </div>
            <ol className="mesaj-grup">
              {g.mesajlar.map(({ m, devam }) => (
                <MesajSatiri key={m.id} mesaj={m} devam={devam} />
              ))}
            </ol>
          </li>
        ))}
      </ol>
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

function MesajSatiri({ mesaj, devam }: { mesaj: Mesaj; devam: boolean }) {
  const s = useSozluk();
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === mesaj.gonderenId));
  const kurul = mesaj.gonderenId === KURUL;
  return (
    <li className={`mesaj${kurul ? " mesaj-siz" : ""}${devam ? " mesaj-devam" : ""}`}>
      <div className="mesaj-av">{devam ? <time dateTime={mesaj.zaman}>{saat(mesaj.zaman)}</time> : <GonderenAvatar gonderenId={mesaj.gonderenId} ad={mesaj.gonderenAd} ajan={ajan} />}</div>
      <div className="mesaj-govde">
        {!devam ? (
          <div className="mesaj-ust">
            {kurul ? (
              <b>{s.kanallar.siz}</b>
            ) : ajan ? (
              <button type="button" className="mesaj-ad" onClick={() => ajanaGit(ajan.id)}>
                {ajan.ad}
              </button>
            ) : (
              <b>{mesaj.gonderenAd}</b>
            )}
            <small>
              {kurul ? s.genel.kurul : (ajan?.rolAdi ?? "")} · <time dateTime={mesaj.zaman}>{saat(mesaj.zaman)}</time>
            </small>
          </div>
        ) : null}
        <ZenginBlok metin={mesaj.metin} />
      </div>
    </li>
  );
}
