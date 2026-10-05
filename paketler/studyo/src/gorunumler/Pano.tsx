// Pano: durum sütunları, sürükle-bırak geçişler, süzgeçler, görev çekmecesi.
// 0.0.8: kart sütun değiştirince eski yerinden kayarak gelir (FLIP), süzgeç kişiye ya da role göre ve projeye göre
// saklı, yüklenirken sütun biçiminde iskelet, kaydedilen görevde kısa onay işareti, tek tuşlu kısayollar ("?").
import { GOREV_DURUMLARI, type Gorev, type GorevDurumu } from "@arnorg/ortak";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bos, HataKutu } from "../bilesenler/Durumlar";
import { KisayolPenceresi } from "../bilesenler/KisayolPenceresi";
import { GorevCekmecesi } from "../bilesenler/pano/GorevCekmecesi";
import { GorevKarti } from "../bilesenler/pano/GorevKarti";
import { durumDegistir, gecisVarMi } from "../bilesenler/pano/gorevYardimcilari";
import { useKayitIsaretleri } from "../bilesenler/pano/kayitIsaretleri";
import { gorevUyar, rolSecenekleri, suzgecCoz, suzgecGecerli, suzgecOku, suzgecYaz } from "../bilesenler/pano/suzgec";
import { YeniGorev } from "../bilesenler/pano/YeniGorev";
import { Simge } from "../bilesenler/Simge";
import { useSozluk } from "../dil";
import { hataBildir, useArayuz } from "../durum/arayuz";
import { projeVerisiniYukle, useVeri } from "../durum/veri";
import { useFlip } from "../yardimcilar/flip";
import { useKisayollar } from "../yardimcilar/kisayol";
import "../stiller/canli.css";

/** Yükleme iskeleti: ilk beş sütun ve gerçek kartlara yakın boylarda yer tutucular (rem) */
const ISKELET: number[][] = [[5.5, 4.75], [6.25, 4.75, 5.5], [5.5, 6.25], [4.75], [5.5, 4.75, 4.75]];

function PanoIskeleti({ etiket }: { etiket: string }) {
  return (
    <div className="pano-sar">
      <div className="pano-iskelet" role="status" aria-label={etiket}>
        {ISKELET.map((kartlar, i) => (
          <div key={i} className="pano-iskelet-kolon" aria-hidden="true">
            <div className="pano-iskelet-baslik">
              <i />
            </div>
            {kartlar.map((boy, j) => (
              <div key={j} className="pano-iskelet-kart" style={{ "--boy": `${boy}rem` } as CSSProperties}>
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Pano() {
  const s = useSozluk();
  const c = s.canli;
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const gorevler = useVeri((d) => d.gorevler);
  const ajanlar = useVeri((d) => d.ajanlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const projeHatasi = useVeri((d) => d.projeHatasi);
  const gorevId = useArayuz((d) => d.gorevId);
  const [iptalGoster, setIptalGoster] = useState(false);
  const [arama, setArama] = useState("");
  const [suzgecDegeri, setSuzgecDegeri] = useState(() => suzgecOku(aktifProjeId));
  const [yeniAcik, setYeniAcik] = useState(false);
  const [kisayolAcik, setKisayolAcik] = useState(false);
  const [suruklenen, setSuruklenen] = useState<string | null>(null);
  const [hedef, setHedef] = useState<GorevDurumu | null>(null);
  const panoRef = useRef<HTMLDivElement>(null);
  const aramaRef = useRef<HTMLInputElement>(null);
  const kayitlar = useKayitIsaretleri(aktifProjeId);

  // Proje değişince o projenin son süzgeci
  useEffect(() => setSuzgecDegeri(suzgecOku(aktifProjeId)), [aktifProjeId]);
  const suzgecSec = (deger: string) => {
    setSuzgecDegeri(deger);
    suzgecYaz(aktifProjeId, deger);
  };

  const ac = (id: string | null) => useArayuz.setState({ gorevId: id });
  const acik = gorevler.find((g) => g.id === gorevId);
  const suruklenenGorev = gorevler.find((g) => g.id === suruklenen);

  // Ekipten ayrılan kişi ya da kimsesi kalmayan rol süzgeci herkese döner
  const etkinSuzgec = suzgecGecerli(suzgecCoz(suzgecDegeri), ajanlar) ? suzgecDegeri : "";
  const roller = useMemo(() => rolSecenekleri(ajanlar, s.ofis.yerel), [ajanlar, s]);
  const sutunlar = GOREV_DURUMLARI.filter((d) => d !== "iptal" || iptalGoster);
  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    const suzgec = suzgecCoz(etkinSuzgec);
    return gorevler.filter((g) => {
      if (!gorevUyar(g, suzgec, ajanlar)) return false;
      if (!q) return true;
      return `${g.kod} ${g.baslik} ${g.etiket}`.toLocaleLowerCase("tr-TR").includes(q);
    });
  }, [gorevler, arama, etkinSuzgec, ajanlar]);
  const suzgecVar = !!arama.trim() || !!etkinSuzgec;

  const kolonlar = useMemo(() => {
    const k = Object.fromEntries(GOREV_DURUMLARI.map((d) => [d, [] as Gorev[]])) as Record<GorevDurumu, Gorev[]>;
    for (const g of suzulmus) k[g.durum].push(g);
    for (const d of GOREV_DURUMLARI) k[d].sort((a, b) => b.guncelleme.localeCompare(a.guncelleme));
    return k;
  }, [suzulmus]);

  // Kart sütun değiştirince, süzgeçle liste değişince ya da sütun eklenip çıkınca yer değiştirenler kayar, yeniler
  // solarak girer (kartın içeriği değişip boyu uzayınca altındakiler de)
  const yerlesim = useMemo(() => ({ kolonlar, sutun: sutunlar.length }), [kolonlar, sutunlar.length]);
  useFlip(panoRef, yerlesim);

  useKisayollar(
    {
      "/": () => aramaRef.current?.focus(),
      [c.kisayol.yeniTusu]: () => setYeniAcik(true),
      "?": () => setKisayolAcik(true),
    },
    !yeniAcik && !kisayolAcik,
  );

  const birak = async (durum: GorevDurumu) => {
    const g = suruklenenGorev;
    setSuruklenen(null);
    setHedef(null);
    if (!g || g.durum === durum || !gecisVarMi(g.durum, durum)) return;
    try {
      await durumDegistir(g, durum);
    } catch (e) {
      hataBildir(e);
    }
  };

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{s.pano.baslik}</h1>
          <p>{s.pano.altBaslik}</p>
        </div>
        <div className="baslik-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-simge kisayol-dugme" onClick={() => setKisayolAcik(true)} aria-label={c.kisayol.ac} title={c.kisayol.ac}>
            ?
          </button>
          <button type="button" className="dugme dugme-ana" onClick={() => setYeniAcik(true)}>
            <Simge ad="arti" />
            {s.pano.yeniGorev}
          </button>
        </div>
      </div>

      <div className="suzgec">
        <div className="arama-kutu">
          <Simge ad="ara" boyut={14} />
          <input
            ref={aramaRef}
            className="girdi"
            type="search"
            aria-label={s.pano.araEtiket}
            placeholder={s.pano.araYer}
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </div>
        <select className="secim suzgec-secim" aria-label={c.pano.kisiYaDaRol} value={etkinSuzgec} onChange={(e) => suzgecSec(e.target.value)}>
          <option value="">{s.pano.herkes}</option>
          <option value="_yok">{s.pano.atanmamis}</option>
          {ajanlar.length ? (
            <optgroup label={c.pano.kisiler}>
              {ajanlar.map((a) => (
                <option key={a.id} value={`a:${a.id}`}>
                  {a.ad}
                </option>
              ))}
            </optgroup>
          ) : null}
          {roller.length > 1 ? (
            <optgroup label={c.pano.roller}>
              {roller.map((r) => (
                <option key={r.rol} value={`r:${r.rol}`}>
                  {r.ad}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <label className="secenek">
          <input type="checkbox" checked={iptalGoster} onChange={(e) => setIptalGoster(e.target.checked)} />
          {s.pano.iptalleriGoster} <small data-sayi>({gorevler.filter((g) => g.durum === "iptal").length})</small>
        </label>
        {suzgecVar && gorevler.length ? (
          <span className="suzgec-sonuc">
            <span data-sayi>{c.pano.sonuc(suzulmus.length, gorevler.length)}</span>
            <button
              type="button"
              className="dugme dugme-sessiz dugme-kucuk"
              onClick={() => {
                setArama("");
                suzgecSec("");
              }}
            >
              {c.pano.temizle}
            </button>
          </span>
        ) : null}
      </div>

      {yukleme === "yukleniyor" && !gorevler.length ? <PanoIskeleti etiket={c.pano.yukleniyor} /> : null}
      {yukleme === "hata" && !gorevler.length ? (
        <HataKutu metin={projeHatasi ?? s.pano.alinamadi} yeniden={() => void projeVerisiniYukle()} />
      ) : null}
      {yukleme === "hazir" && !gorevler.length ? (
        <Bos
          baslik={s.pano.bosBaslik}
          eylem={
            <button type="button" className="dugme dugme-ana" onClick={() => setYeniAcik(true)}>
              {s.pano.ilkGorev}
            </button>
          }
        >
          {s.pano.bosMetin}
        </Bos>
      ) : null}

      {gorevler.length ? (
        <div className="pano-sar">
          <div className="pano" ref={panoRef} style={{ gridTemplateColumns: `repeat(${sutunlar.length}, minmax(10rem, 1fr))` }}>
            {sutunlar.map((d) => {
              const uygun = suruklenenGorev ? suruklenenGorev.durum !== d && gecisVarMi(suruklenenGorev.durum, d) : false;
              return (
                <section
                  key={d}
                  className={`kolon${suruklenenGorev ? (uygun ? " kolon-uygun" : " kolon-kapali") : ""}${hedef === d && uygun ? " kolon-hedef" : ""}`}
                  aria-label={`${s.genel.gorevDurumu[d]}: ${s.genel.gorevSayisi(kolonlar[d].length)}`}
                  onDragOver={(e) => {
                    if (!uygun) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (hedef !== d) setHedef(d);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setHedef((h) => (h === d ? null : h));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void birak(d);
                  }}
                >
                  <h2 className="kolon-baslik">
                    <span className={`gd-nokta gd-${d}`} aria-hidden="true" />
                    {s.genel.gorevDurumu[d]}
                    <small data-sayi>{kolonlar[d].length}</small>
                  </h2>
                  <ul className="bilet-liste">
                    {kolonlar[d].map((g) => (
                      <GorevKarti key={g.id} gorev={g} ac={ac} surukle={setSuruklenen} kaydedildi={kayitlar.get(g.id) ?? kayitlar.get(g.kod)} />
                    ))}
                    {kolonlar[d].length === 0 ? <li className="kolon-bos">{suzgecVar ? s.pano.eslesenYok : s.pano.kolonBos}</li> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {acik ? <GorevCekmecesi key={acik.id} gorev={acik} kapat={() => ac(null)} /> : null}
      {yeniAcik ? (
        <YeniGorev
          kapat={() => setYeniAcik(false)}
          olustu={(id) => {
            setYeniAcik(false);
            ac(id);
          }}
        />
      ) : null}
      {kisayolAcik ? (
        <KisayolPenceresi
          baslik={c.kisayol.panoBaslik}
          kapat={() => setKisayolAcik(false)}
          satirlar={[
            { tuslar: ["/"], aciklama: c.kisayol.pano.ara },
            { tuslar: [c.kisayol.yeniTusu.toLocaleUpperCase(s.ofis.yerel)], aciklama: c.kisayol.pano.yeni },
            { tuslar: ["Esc"], aciklama: c.kisayol.pano.kapat },
            { tuslar: ["?"], aciklama: c.kisayol.pano.pencere },
          ]}
        />
      ) : null}
    </>
  );
}
