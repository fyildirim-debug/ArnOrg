// Karargâh: CEO'nun son raporu, brief kutusu, görev dağılımı ve ekip
import { GOREV_DURUMLARI, type GorevDurumu } from "@arnorg/ortak";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { EkipTablosu } from "../bilesenler/EkipTablosu";
import { GorevDagilimi } from "../bilesenler/GorevDagilimi";
import { AjanAvatar, AjanDurum } from "../bilesenler/Kisi";
import { Markdown } from "../bilesenler/Markdown";
import { ajanaGit, bildir, git } from "../durum/arayuz";
import { HafizaNabzi } from "../bilesenler/HafizaNabzi";
import { KullanimPaneli } from "../bilesenler/Kullanim";
import { ajanAkisiniYukle, ceoBul, kanalMesajlariniYukle, mesajUygula, projeVerisiniYukle, useVeri } from "../durum/veri";
import { akilliZaman, yonelme } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

export function Karargah() {
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
        <Baslik ad="Karargâh" alt={proje?.ad ?? ""} />
        <Iskelet satir={10} />
      </>
    );
  }
  if (yukleme === "hata" && ajanlar.length === 0) {
    return (
      <>
        <Baslik ad="Karargâh" alt={proje?.ad ?? ""} />
        <HataKutu metin={projeHatasi ?? "Proje verisi alınamadı."} yeniden={() => void projeVerisiniYukle()} />
      </>
    );
  }

  return (
    <>
      <Baslik ad="Karargâh" alt={proje?.aciklama || proje?.yol || ""} />

      <div className="karargah-ust">
        <CeoRaporu />
        <aside className="karargah-ozet" aria-label="Özet">
          <KullanimPaneli />
          <div className="dugme-satir">
            <button type="button" className={`dugme${bekleyenOnay ? " dugme-ana" : ""}`} onClick={() => git("onaylar")}>
              {bekleyenOnay ? `Onay bekleyen ${bekleyenOnay} karar` : "Bekleyen onay yok"}
            </button>
            {bekleyenArac ? (
              <button type="button" className="dugme" onClick={() => git("denetim")}>
                {bekleyenArac} araç çağrısı bekliyor
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      <BriefKutusu ceoAdi={ceo?.ad} />

      <h2 className="ara-baslik">
        Görevler <small>{etkinGorev} görev</small>
        <span className="baslik-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => git("pano")}>
            Panoya git
          </button>
        </span>
      </h2>
      <GorevDagilimi sayilar={sayilar} />

      <HafizaNabzi />

      <h2 className="ara-baslik">
        Ekip <small>{ajanlar.length} çalışan</small>
        <span className="baslik-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => git("ekip")}>
            Organizasyon şeması
          </button>
        </span>
      </h2>
      {ajanlar.length ? (
        <EkipTablosu ajanlar={ajanlar} />
      ) : (
        <Bos kucuk baslik="Ekip boş">
          CEO işe alım teklif edince ekip burada görünür.
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
      bildir("basari", `Dönem raporu notlara kaydedildi: ${r.yol}`);
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
        <Bos kucuk baslik="CEO yok">
          Bu projede CEO ajanı bulunamadı. Ekip ekranından CEO rolüyle birini işe alın.
        </Bos>
      </section>
    );
  }

  const uzun = (rapor?.metin.length ?? 0) > 700;

  return (
    <section className="rapor" aria-label="CEO raporu">
      <div className="rapor-kim">
        <AjanAvatar ajan={ceo} />
        <span className="kisi-metin">
          <b>{ceo.ad}</b>
          <small>{rapor ? `CEO raporu · ${akilliZaman(rapor.zaman)}` : ceo.rolAdi}</small>
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
        <p className="soluk">CEO henüz rapor yazmadı. Aşağıdan bir brief verin; planı ve ekip önerisini burada okursunuz.</p>
      )}
      <div className="dugme-satir">
        {uzun ? (
          <button type="button" className="metin-dugme" onClick={() => setGenis(!genis)}>
            {genis ? "Kısalt" : "Tamamını oku"}
          </button>
        ) : null}
        <button type="button" className="metin-dugme" onClick={() => ajanaGit(ceo.id)}>
          {ceo.ad} oturumunu aç
        </button>
        <button type="button" className="metin-dugme" onClick={donemRaporu} disabled={suruyor !== null} title="Son 7 günün raporunu notlara yazar">
          {suruyor === "rapor" ? "Hazırlanıyor" : "Dönem raporu"}
        </button>
      </div>
    </section>
  );
}

function BriefKutusu({ ceoAdi }: { ceoAdi?: string }) {
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
      bildir("basari", `Brief #genel kanalına yazıldı${ceoAdi ? `; ${ceoAdi} aldı` : ""}.`);
    });
  };

  return (
    <form className="brief" onSubmit={gonder}>
      <label htmlFor="brief-metin" className="brief-baslik">
        Brief ver
        <small>#genel kanalına yazılır; anma yoksa CEO'ya gider</small>
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
        placeholder="Ne istediğinizi düz metinle yazın. Örn. Sipariş listesine CSV dışa aktarma ekleyin; ay sonuna kadar canlıda olsun."
      />
      <div className="brief-alt">
        <span className="alan-ipucu">Ctrl+Enter ile gönderin</span>
        <button type="submit" className="dugme dugme-ana" disabled={!metin.trim() || suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : null}
          {ceoAdi ? `${yonelme(ceoAdi)} gönder` : "Gönder"}
        </button>
      </div>
    </form>
  );
}
