// Karargâh: kanallardan canlı akış. #yonetim dışındaki bütün kanalların son mesajları tek akışta, zamana göre
// (eskiden yeniye, en yeni altta); ajanlar birbirine yazarken yazıyor göstergeleri; satıra tıklayınca o kanala gidilir.
// ArnOrg'un başlangıç ve iş duyuruları da burada akar.
import { ARNORG_GONDEREN, kanalGorunenAdi, KURUL, type Mesaj } from "@arnorg/ortak";
import { useEffect, useMemo, useState } from "react";
import { useDil, useSozluk } from "../dil";
import { git } from "../durum/arayuz";
import { kanalMesajlariniYukle, useVeri } from "../durum/veri";
import { saat } from "../yardimcilar/bicim";
import { KANALLARDA_YOK } from "../yardimcilar/kanallar";
import { useAltaYapisik, useYeniGelenler } from "./altaYapis";
import { Bos, HataKutu, Iskelet } from "./Durumlar";
import { akistaBirlestir } from "./mesajGruplari";
import { EkOzeti } from "./ekler/MesajEkleri";
import { DuzMetin } from "./MesajMetni";
import { Simge } from "./Simge";
import { YaziyorGostergesi } from "./YaziyorGostergesi";

/** Akışa girmeyen kanal: kurul ile CEO'nun bire bir sohbeti yanında ayrıca gösteriliyor (Kanallar ekranıyla aynı kural) */
const DISARIDA = KANALLARDA_YOK;

export function KanalAkisi() {
  const s = useSozluk();
  const a = s.sohbet.akis;
  const dil = useDil();
  const pid = useVeri((d) => d.aktifProjeId);
  const kanallar = useVeri((d) => d.kanallar);
  const mesajlar = useVeri((d) => d.mesajlar);
  const yukleme = useVeri((d) => d.mesajYukleme);
  const yaziyorlar = useVeri((d) => d.yaziyorlar);
  const ajanlar = useVeri((d) => d.ajanlar);
  const wsDurumu = useVeri((d) => d.wsDurumu);
  const projeYukleme = useVeri((d) => d.projeYukleme);

  // Kanal kimlikleri; mesaj sayısı değişince yeniden yükleme yapılmasın diye dize anahtarla izlenir
  const anahtar = kanallar
    .map((k) => k.ad)
    .filter((k) => !DISARIDA.includes(k))
    .join("|");
  const adlar = useMemo(() => (anahtar ? anahtar.split("|") : []), [anahtar]);

  useEffect(() => {
    for (const k of adlar) kanalMesajlariniYukle(k).catch(() => undefined);
  }, [pid, adlar]);

  const akis = useMemo(() => akistaBirlestir(mesajlar, adlar, DISARIDA), [mesajlar, adlar]);
  const yazanlar = useMemo(
    () => adlar.flatMap((k) => (yaziyorlar[k] ?? []).map((y) => ({ ...y, kanal: k }))),
    [yaziyorlar, adlar],
  );
  // Kanallardaki toplam mesaj: artışı "yeni mesaj" sayılır (akış en çok 40 satır tuttuğu için uzunluğu yetmez)
  const toplam = adlar.reduce((n, k) => n + (mesajlar[k]?.length ?? 0), 0);
  const { ref, kaydirildi, yeni, alta } = useAltaYapisik<HTMLOListElement>({ sayi: toplam, degisim: yazanlar.length });

  const hepsiYuklendi = adlar.length > 0 && adlar.every((k) => yukleme[k] === "hazir" || yukleme[k] === "hata");
  const yeniMi = useYeniGelenler(() => akis.map((m) => m.id), hepsiYuklendi, pid);

  const hepsiHata = adlar.length > 0 && adlar.every((k) => yukleme[k] === "hata");
  const yukleniyor = !akis.length && !hepsiYuklendi && (adlar.length > 0 || projeYukleme === "yukleniyor");

  const adOf = (m: Mesaj): string =>
    m.gonderenId === KURUL ? s.kanallar.siz : m.gonderenId === ARNORG_GONDEREN ? s.genel.arnorg : (ajanlar.find((x) => x.id === m.gonderenId)?.ad ?? m.gonderenAd);

  return (
    <section className="kanal-akisi" aria-label={a.etiket}>
      <header className="sohbet-serit">
        <h2>{a.baslik}</h2>
        <span className={`akis-baglanti akis-${wsDurumu}`}>
          <i aria-hidden="true" />
          {a.baglanti[wsDurumu]}
        </span>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge akis-tumu" onClick={() => git("kanallar")} aria-label={a.tumu} title={a.tumu}>
          <Simge ad="sag" boyut={12} />
        </button>
      </header>
      <div className="sohbet-pencere">
        <ol className="akis-liste" ref={ref} onScroll={kaydirildi} tabIndex={0} aria-label={a.etiket}>
          {yukleniyor ? (
            <li className="sohbet-durum">
              <Iskelet satir={6} />
            </li>
          ) : null}
          {hepsiHata ? (
            <li className="sohbet-durum">
              <HataKutu metin={a.alinamadi} yeniden={() => adlar.forEach((k) => void kanalMesajlariniYukle(k, true).catch(() => undefined))} />
            </li>
          ) : null}
          {!akis.length && !yukleniyor && !hepsiHata ? (
            <li className="sohbet-durum">
              <Bos kucuk baslik={a.bos}>
                {a.bosMetin}
              </Bos>
            </li>
          ) : null}
          {akis.map((m) => (
            <AkisSatiri
              key={m.id}
              mesaj={m}
              ad={adOf(m)}
              kanal={kanalGorunenAdi(m.kanal, dil)}
              yeni={yeniMi(m.id)}
              baslik={a.kanalaGit(kanalGorunenAdi(m.kanal, dil))}
            />
          ))}
        </ol>
        {yeni > 0 ? (
          <button type="button" className="yeni-mesaj-dugme" onClick={() => alta()} title={s.sohbet.enAlta}>
            <Simge ad="asagi" boyut={12} />
            {s.sohbet.yeniMesaj(yeni)}
          </button>
        ) : null}
      </div>
      <YaziyorGostergesi
        kisiler={yazanlar}
        metinler={yazanlar.slice(0, 2).map((y) => s.sohbet.kanaldaYaziyor(y.ad, kanalGorunenAdi(y.kanal, dil)))}
        className="akis-yaziyor"
      />
    </section>
  );
}

function AkisSatiri({ mesaj, ad, kanal, yeni, baslik }: { mesaj: Mesaj; ad: string; kanal: string; yeni: boolean; baslik: string }) {
  const [girer] = useState(yeni);
  const sistem = mesaj.gonderenId === ARNORG_GONDEREN;
  return (
    <li className={`akis-satir${sistem ? " akis-sistem" : ""}${girer ? " akis-yeni" : ""}`}>
      <button type="button" className="akis-dugme" onClick={() => git("kanallar", { kanal: mesaj.kanal })} title={baslik}>
        <span className="akis-ust">
          <span className="akis-kanal">#{kanal}</span>
          <b className="akis-kim tek-satir">{ad}</b>
          <time dateTime={mesaj.zaman}>{saat(mesaj.zaman)}</time>
        </span>
        <span className="akis-metin">
          <DuzMetin metin={mesaj.metin} />
          <EkOzeti ekler={mesaj.ekler} />
        </span>
      </button>
    </li>
  );
}
