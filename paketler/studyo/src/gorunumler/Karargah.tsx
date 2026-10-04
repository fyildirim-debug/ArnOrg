// Karargâh: CEO'nun son raporu, brief kutusu, görev dağılımı ve ekip
import { GOREV_DURUMLARI, kanalGorunenAdi, type GorevDurumu } from "@arnorg/ortak";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { sozluk, useDil, useSozluk } from "../dil";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { EkipTablosu } from "../bilesenler/EkipTablosu";
import { GorevDagilimi } from "../bilesenler/GorevDagilimi";
import { AjanAvatar, AjanDurum } from "../bilesenler/Kisi";
import { Markdown } from "../bilesenler/Markdown";
import { ajanaGit, bildir, git } from "../durum/arayuz";
import { HafizaNabzi } from "../bilesenler/HafizaNabzi";
import { KullanimPaneli } from "../bilesenler/Kullanim";
import { ajanAkisiniYukle, ceoBul, kanalMesajlariniYukle, mesajUygula, projeVerisiniYukle, useVeri } from "../durum/veri";
import { akilliZaman } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

export function Karargah() {
  const s = useSozluk();
  const k = s.karargah;
  const projeler = useVeri((d) => d.projeler);
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const yukleme = useVeri((d) => d.projeYukleme);
  const projeHatasi = useVeri((d) => d.projeHatasi);
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const onaylar = useVeri((d) => d.onaylar);
  const proje = projeler.find((p) => p.id === aktifProjeId);
  const ceo = ceoBul(ajanlar);

  useEffect(() => {
    if (ceo) ajanAkisiniYukle(ceo.id).catch(() => undefined);
    kanalMesajlariniYukle("genel").catch(() => undefined);
  }, [ceo?.id]);

  const sayilar = useMemo(() => {
    const s = Object.fromEntries(GOREV_DURUMLARI.map((d) => [d, 0])) as Record<GorevDurumu, number>;
    gorevler.forEach((g) => (s[g.durum] += 1));
    return s;
  }, [gorevler]);
  const etkinGorev = gorevler.filter((g) => g.durum !== "iptal").length;
  const bekleyenOnay = onaylar.filter((o) => o.durum === "bekliyor" && o.tur !== "arac").length;
  const bekleyenArac = onaylar.filter((o) => o.durum === "bekliyor" && o.tur === "arac").length;

  if (yukleme === "yukleniyor" && ajanlar.length === 0) {
    return (
      <>
        <Baslik ad={k.baslik} alt={proje?.ad ?? ""} />
        <Iskelet satir={10} />
      </>
    );
  }
  if (yukleme === "hata" && ajanlar.length === 0) {
    return (
      <>
        <Baslik ad={k.baslik} alt={proje?.ad ?? ""} />
        <HataKutu metin={projeHatasi ?? k.veriAlinamadi} yeniden={() => void projeVerisiniYukle()} />
      </>
    );
  }

  return (
    <>
      <Baslik ad={k.baslik} alt={proje?.aciklama || proje?.yol || ""} />

      <div className="karargah-ust">
        <CeoRaporu />
        <aside className="karargah-ozet" aria-label={k.ozet}>
          <KullanimPaneli />
          <div className="dugme-satir">
            <button type="button" className={`dugme${bekleyenOnay ? " dugme-ana" : ""}`} onClick={() => git("onaylar")}>
              {bekleyenOnay ? k.onayBekleyen(bekleyenOnay) : k.onayYok}
            </button>
            {bekleyenArac ? (
              <button type="button" className="dugme" onClick={() => git("denetim")}>
                {k.aracBekliyor(bekleyenArac)}
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      <BriefKutusu ceoAdi={ceo?.ad} />

      <h2 className="ara-baslik">
        {k.gorevler} <small>{s.genel.gorevSayisi(etkinGorev)}</small>
        <span className="baslik-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => git("pano")}>
            {k.panoyaGit}
          </button>
        </span>
      </h2>
      <GorevDagilimi sayilar={sayilar} />

      <HafizaNabzi />

      <h2 className="ara-baslik">
        {k.ekip} <small>{s.genel.calisanSayisi(ajanlar.length)}</small>
        <span className="baslik-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => git("ekip")}>
            {k.orgSemasi}
          </button>
        </span>
      </h2>
      {ajanlar.length ? (
        <EkipTablosu ajanlar={ajanlar} />
      ) : (
        <Bos kucuk baslik={k.ekipBos}>
          {k.ekipBosAciklama}
        </Bos>
      )}
    </>
  );
}

function Baslik({ ad, alt }: { ad: string; alt: string }) {
  return (
    <div className="baslik">
      <div className="baslik-metin">
        <h1>{ad}</h1>
        {alt ? <p>{alt}</p> : null}
      </div>
    </div>
  );
}

/** CEO'nun en son yazdığı metin: oturum akışındaki son asistan metni ya da #genel'deki son mesajı */
function CeoRaporu() {
  const s = useSozluk();
  const t = s.karargah.rapor;
  const ajanlar = useVeri((d) => d.ajanlar);
  const ceo = ceoBul(ajanlar);
  const akis = useVeri((d) => (ceo ? d.akislar[ceo.id] : undefined));
  const genel = useVeri((d) => d.mesajlar.genel);
  const akisYukleme = useVeri((d) => (ceo ? d.akisYukleme[ceo.id] : undefined));
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [genis, setGenis] = useState(false);
  const { suruyor, calistir } = useIslem();

  const donemRaporu = () => {
    if (!aktifProjeId) return;
    void calistir("rapor", async () => {
      const r = await api.raporKaydet(aktifProjeId, 7);
      bildir("basari", sozluk().karargah.rapor.kaydedildi(r.yol));
      git("notlar", { notYolu: r.yol });
    });
  };

  const rapor = useMemo(() => {
    if (!ceo) return null;
    let son: { metin: string; zaman: string } | null = null;
    if (akis) {
      for (let i = akis.length - 1; i >= 0; i--) {
        const o = akis[i]!;
        if (o.tur === "asistan" && o.metin && !o.ustAracKimligi) {
          son = { metin: o.metin, zaman: o.zaman };
          break;
        }
      }
    }
    if (genel) {
      for (let i = genel.length - 1; i >= 0; i--) {
        const m = genel[i]!;
        if (m.gonderenId === ceo.id) {
          if (!son || m.zaman > son.zaman) son = { metin: m.metin, zaman: m.zaman };
          break;
        }
      }
    }
    return son;
  }, [ceo, akis, genel]);

  if (!ceo) {
    return (
      <section className="rapor">
        <Bos kucuk baslik={t.ceoYok}>
          {t.ceoYokAciklama}
        </Bos>
      </section>
    );
  }

  const uzun = (rapor?.metin.length ?? 0) > 700;

  return (
    <section className="rapor" aria-label={t.etiket}>
      <div className="rapor-kim">
        <AjanAvatar ajan={ceo} />
        <span className="kisi-metin">
          <b>{ceo.ad}</b>
          <small>{rapor ? t.zaman(akilliZaman(rapor.zaman)) : ceo.rolAdi}</small>
        </span>
        <span className="rapor-durum">
          <AjanDurum durum={ceo.durum} />
        </span>
      </div>
      {rapor ? (
        <div className={`rapor-metin${uzun && !genis ? " rapor-kisa" : ""}`}>
          <Markdown metin={rapor.metin} />
        </div>
      ) : akisYukleme === "yukleniyor" ? (
        <Iskelet satir={3} />
      ) : (
        <p className="soluk">{t.henuzYok}</p>
      )}
      <div className="dugme-satir">
        {uzun ? (
          <button type="button" className="metin-dugme" onClick={() => setGenis(!genis)}>
            {genis ? t.kisalt : t.tamami}
          </button>
        ) : null}
        <button type="button" className="metin-dugme" onClick={() => ajanaGit(ceo.id)}>
          {s.genel.oturumuAc(ceo.ad)}
        </button>
        <button type="button" className="metin-dugme" onClick={donemRaporu} disabled={suruyor !== null} title={t.donemBaslik}>
          {suruyor === "rapor" ? t.hazirlaniyor : t.donem}
        </button>
      </div>
    </section>
  );
}

function BriefKutusu({ ceoAdi }: { ceoAdi?: string }) {
  const s = useSozluk();
  const b = s.karargah.brief;
  const dil = useDil();
  // Brief #genel kanalına gider; kanal dile göre görünen adıyla anılır (İngilizcede #general)
  const kanal = `#${kanalGorunenAdi("genel", dil)}`;
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [metin, setMetin] = useState("");
  const { suruyor, calistir } = useIslem();

  const gonder = (e?: FormEvent) => {
    e?.preventDefault();
    const temiz = metin.trim();
    if (!temiz || !aktifProjeId) return;
    void calistir("brief", async () => {
      const m = await api.mesajGonder(aktifProjeId, "genel", temiz);
      mesajUygula(m);
      setMetin("");
      bildir("basari", sozluk().karargah.brief.gonderildi(kanal, ceoAdi ?? null));
    });
  };

  return (
    <form className="brief" onSubmit={gonder}>
      <label htmlFor="brief-metin" className="brief-baslik">
        {b.baslik}
        <small>{b.nereye(kanal)}</small>
      </label>
      <textarea
        id="brief-metin"
        className="metin-alani"
        rows={3}
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) gonder();
        }}
        placeholder={b.yer}
      />
      <div className="brief-alt">
        <span className="alan-ipucu">{b.kisayol}</span>
        <button type="submit" className="dugme dugme-ana" disabled={!metin.trim() || suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : null}
          {ceoAdi ? b.kime(ceoAdi) : s.genel.gonder}
        </button>
      </div>
    </form>
  );
}
