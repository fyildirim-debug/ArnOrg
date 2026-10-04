// Pano: durum sütunları, sürükle-bırak geçişler, süzgeçler, görev çekmecesi
import { GOREV_DURUMLARI, type Gorev, type GorevDurumu } from "@arnorg/ortak";
import { useMemo, useState } from "react";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { GorevCekmecesi } from "../bilesenler/pano/GorevCekmecesi";
import { GorevKarti } from "../bilesenler/pano/GorevKarti";
import { durumDegistir, gecisVarMi } from "../bilesenler/pano/gorevYardimcilari";
import { YeniGorev } from "../bilesenler/pano/YeniGorev";
import { Simge } from "../bilesenler/Simge";
import { useSozluk } from "../dil";
import { hataBildir, useArayuz } from "../durum/arayuz";
import { projeVerisiniYukle, useVeri } from "../durum/veri";

export function Pano() {
  const s = useSozluk();
  const gorevler = useVeri((d) => d.gorevler);
  const ajanlar = useVeri((d) => d.ajanlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const projeHatasi = useVeri((d) => d.projeHatasi);
  const gorevId = useArayuz((d) => d.gorevId);
  const [iptalGoster, setIptalGoster] = useState(false);
  const [arama, setArama] = useState("");
  const [atanan, setAtanan] = useState("");
  const [yeniAcik, setYeniAcik] = useState(false);
  const [suruklenen, setSuruklenen] = useState<string | null>(null);
  const [hedef, setHedef] = useState<GorevDurumu | null>(null);

  const ac = (id: string | null) => useArayuz.setState({ gorevId: id });
  const acik = gorevler.find((g) => g.id === gorevId);
  const suruklenenGorev = gorevler.find((g) => g.id === suruklenen);

  const sutunlar = GOREV_DURUMLARI.filter((d) => d !== "iptal" || iptalGoster);
  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return gorevler.filter((g) => {
      if (atanan === "_yok" ? g.atananId : atanan && g.atananId !== atanan) return false;
      if (!q) return true;
      return `${g.kod} ${g.baslik} ${g.etiket}`.toLocaleLowerCase("tr-TR").includes(q);
    });
  }, [gorevler, arama, atanan]);

  const kolonlar = useMemo(() => {
    const k = Object.fromEntries(GOREV_DURUMLARI.map((d) => [d, [] as Gorev[]])) as Record<GorevDurumu, Gorev[]>;
    for (const g of suzulmus) k[g.durum].push(g);
    for (const d of GOREV_DURUMLARI) k[d].sort((a, b) => b.guncelleme.localeCompare(a.guncelleme));
    return k;
  }, [suzulmus]);

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
            className="girdi"
            type="search"
            aria-label={s.pano.araEtiket}
            placeholder={s.pano.araYer}
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </div>
        <select className="secim suzgec-secim" aria-label={s.pano.atananaGore} value={atanan} onChange={(e) => setAtanan(e.target.value)}>
          <option value="">{s.pano.herkes}</option>
          <option value="_yok">{s.pano.atanmamis}</option>
          {ajanlar.map((a) => (
            <option key={a.id} value={a.id}>
              {a.ad}
            </option>
          ))}
        </select>
        <label className="secenek">
          <input type="checkbox" checked={iptalGoster} onChange={(e) => setIptalGoster(e.target.checked)} />
          {s.pano.iptalleriGoster} <small>({gorevler.filter((g) => g.durum === "iptal").length})</small>
        </label>
      </div>

      {yukleme === "yukleniyor" && !gorevler.length ? <Iskelet satir={8} /> : null}
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
          <div className="pano" style={{ gridTemplateColumns: `repeat(${sutunlar.length}, minmax(10rem, 1fr))` }}>
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
                    <small>{kolonlar[d].length}</small>
                  </h2>
                  <ul className="bilet-liste">
                    {kolonlar[d].map((g) => (
                      <GorevKarti key={g.id} gorev={g} ac={ac} surukle={setSuruklenen} />
                    ))}
                    {kolonlar[d].length === 0 ? <li className="kolon-bos">{arama || atanan ? s.pano.eslesenYok : s.pano.kolonBos}</li> : null}
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
    </>
  );
}
