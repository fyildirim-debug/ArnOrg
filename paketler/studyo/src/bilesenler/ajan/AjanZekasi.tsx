// Ajanın kendi zekâsı (Ekip ve Ofis'teki ajan ayrıntısı): kişisel hafıza, ekip bağları, sözler, defter,
// bildiği beceriler ve başka bir çalışana hafıza aktarımı. Sözü değişince ("soz.guncellendi") tazelenir.
import type { Ajan, AjanZekasi, Beceri } from "@arnorg/ortak";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { hataMetni } from "../../api/istek";
import { api } from "../../api/uclar";
import { useSozluk } from "../../dil";
import { Simge } from "../Simge";
import { bildir, git } from "../../durum/arayuz";
import { ofisOlayDinle } from "../../durum/olaylar";
import { useVeri } from "../../durum/veri";
import { zekaSekmesiSec } from "../../durum/zeka";
import { sayi } from "../../yardimcilar/bicim";
import { useIslem, useSimdi } from "../../yardimcilar/kancalar";
import { HataKutu, Iskelet } from "../Durumlar";
import { Markdown } from "../Markdown";
import { acikSozSirala, kapaliSozSirala, SozSatiri } from "../zeka/ortak";

export function AjanZekasiBolumu({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const t = s.zeka.ajan;
  const [veri, setVeri] = useState<AjanZekasi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const simdi = useSimdi(60_000);
  const sayac = useRef(0);

  // Kişisel hafıza yazımı canlı olay üretmez: bölüm her açılışta, söz değişince ve elle tazelenir
  const yukle = useCallback(() => {
    const n = ++sayac.current;
    setHata(null);
    setTazeleniyor(true);
    api
      .ajanZekasi(ajan.id)
      .then((v) => n === sayac.current && setVeri(v))
      .catch((e: unknown) => n === sayac.current && setHata(hataMetni(e)))
      .finally(() => n === sayac.current && setTazeleniyor(false));
  }, [ajan.id]);

  useEffect(() => {
    setVeri(null);
    yukle();
  }, [yukle]);

  useEffect(
    () =>
      ofisOlayDinle((olay) => {
        if (olay.tur === "soz.guncellendi" && (olay.soz.verenId === ajan.id || olay.soz.aliciId === ajan.id)) yukle();
      }),
    [ajan.id, yukle],
  );

  if (!veri) return hata ? <HataKutu metin={hata} yeniden={yukle} /> : <Iskelet satir={6} etiket={t.yukleniyor} />;

  const acikSoz = veri.sozler.filter((x) => x.durum === "acik").length;
  return (
    <div className="ajan-zeka">
      <div className="ajan-zeka-ust">
        <p className="ajan-zeka-aciklama">{t.aciklama}</p>
        <button
          type="button"
          className="dugme dugme-sessiz dugme-kucuk dugme-simge"
          aria-label={s.genel.yenile}
          title={s.genel.yenile}
          onClick={yukle}
          disabled={tazeleniyor}
        >
          {tazeleniyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="yenile" boyut={12} />}
        </button>
      </div>
      {hata ? <HataKutu metin={hata} yeniden={yukle} /> : null}
      <KisiselHafiza veri={veri} />
      <Baglar metin={veri.baglar} />
      <AjanSozleri veri={veri} simdi={simdi} />
      <Defter key={ajan.id} metin={veri.defter} />
      {veri.beceriler.length ? <AjanBecerileri beceriler={veri.beceriler} /> : null}
      <HafizaAktar ajan={ajan} acikSoz={acikSoz} aktarildi={yukle} />
    </div>
  );
}

function KisiselHafiza({ veri }: { veri: AjanZekasi }) {
  const t = useSozluk().zeka.ajan;
  const oran = veri.kisiselSinir ? veri.kisiselKullanim / veri.kisiselSinir : 0;
  const seviye = oran >= 1 ? "dolu" : oran >= 0.85 ? "yakin" : undefined;
  const id = useId();
  return (
    <section className="ajan-bolum" aria-labelledby={id}>
      <div className="ajan-bolum-ust">
        <h3 id={id}>{t.kisisel}</h3>
        <span className="kisisel-sayac sayi" data-seviye={seviye}>
          {t.kisiselKullanim(sayi(veri.kisiselKullanim), sayi(veri.kisiselSinir))}
        </span>
      </div>
      <span className="kisisel-olcu" data-seviye={seviye} aria-hidden="true">
        <span style={{ width: `${Math.min(100, oran * 100)}%` }} />
      </span>
      {veri.kisisel.length ? (
        <ul className="kisisel-liste">
          {veri.kisisel.map((m, i) => (
            <li key={`${i}-${m.slice(0, 24)}`}>{m}</li>
          ))}
        </ul>
      ) : (
        <p className="ajan-zeka-bos">{t.kisiselBos}</p>
      )}
      <p className="alan-ipucu">
        {t.kisiselIpucu}
        {seviye ? ` ${t.kisiselDolu}` : ""}
      </p>
    </section>
  );
}

/** Bağlar metni "- Etiket: değer" satırlarıdır (ajanın talimatına girdiği biçimde); okunur listeye çevrilir */
function baglariAyir(metin: string): { etiket: string | null; deger: string }[] {
  return metin
    .split("\n")
    .map((l) => l.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean)
    .map((satir) => {
      const i = satir.indexOf(": ");
      return i > 0 && i <= 60 ? { etiket: satir.slice(0, i), deger: satir.slice(i + 2) } : { etiket: null, deger: satir };
    });
}

function Baglar({ metin }: { metin: string }) {
  const t = useSozluk().zeka.ajan;
  const satirlar = baglariAyir(metin);
  const id = useId();
  return (
    <section className="ajan-bolum" aria-labelledby={id}>
      <h3 id={id}>{t.baglar}</h3>
      {satirlar.length ? (
        <ul className="baglar">
          {satirlar.map((b, i) => (
            <li key={i}>
              {b.etiket ? <span className="bag-etiket">{b.etiket}</span> : null}
              <span className="bag-deger">{b.deger}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ajan-zeka-bos">{t.baglarBos}</p>
      )}
      <p className="alan-ipucu">{t.baglarIpucu}</p>
    </section>
  );
}

function AjanSozleri({ veri, simdi }: { veri: AjanZekasi; simdi: number }) {
  const t = useSozluk().zeka.ajan;
  const verdigi = [...veri.sozler.filter((x) => x.durum === "acik").sort(acikSozSirala), ...veri.sozler.filter((x) => x.durum !== "acik").sort(kapaliSozSirala)];
  const aldigi = veri.alinanSozler.slice().sort(acikSozSirala);
  const id = useId();
  return (
    <section className="ajan-bolum" aria-labelledby={`${id}-v`}>
      <h3 id={`${id}-v`}>
        {t.verdigi} <small className="soluk sayi">{verdigi.length}</small>
      </h3>
      {verdigi.length ? (
        <ol className="soz-liste soz-liste-kompakt" aria-labelledby={`${id}-v`}>
          {verdigi.map((x) => (
            <SozSatiri key={x.id} soz={x} simdi={simdi} taraf="veren" />
          ))}
        </ol>
      ) : (
        <p className="ajan-zeka-bos">{t.sozYok}</p>
      )}
      <h3 id={`${id}-a`}>
        {t.aldigi} <small className="soluk sayi">{aldigi.length}</small>
      </h3>
      {aldigi.length ? (
        <ol className="soz-liste soz-liste-kompakt" aria-labelledby={`${id}-a`}>
          {aldigi.map((x) => (
            <SozSatiri key={x.id} soz={x} simdi={simdi} taraf="alan" />
          ))}
        </ol>
      ) : (
        <p className="ajan-zeka-bos">{t.sozYok}</p>
      )}
    </section>
  );
}

function Defter({ metin }: { metin: string }) {
  const t = useSozluk().zeka.ajan;
  const [acik, setAcik] = useState(false);
  const uzun = metin.length > 700 || metin.split("\n").length > 14;
  const id = useId();
  return (
    <section className="ajan-bolum" aria-labelledby={id}>
      <h3 id={id}>{t.defter}</h3>
      {metin.trim() ? (
        <>
          <div className="ajan-defter" data-kisa={(uzun && !acik) || undefined}>
            <Markdown metin={metin} className="yazi yazi-kucuk" />
          </div>
          {uzun ? (
            <button type="button" className="metin-dugme ajan-defter-ac" aria-expanded={acik} onClick={() => setAcik(!acik)}>
              {acik ? t.kisalt : t.tamaminiGoster}
            </button>
          ) : null}
        </>
      ) : (
        <p className="ajan-zeka-bos">{t.defterBos}</p>
      )}
      <p className="alan-ipucu">{t.defterIpucu}</p>
    </section>
  );
}

function AjanBecerileri({ beceriler }: { beceriler: Beceri[] }) {
  const t = useSozluk().zeka.ajan;
  const id = useId();
  return (
    <section className="ajan-bolum" aria-labelledby={id}>
      <h3 id={id}>
        {t.beceriler} <small className="soluk sayi">{beceriler.length}</small>
      </h3>
      <ul className="ajan-beceriler">
        {beceriler.map((b) => (
          <li key={b.ad}>
            <button
              type="button"
              className="ajan-beceri"
              title={t.beceriAc(b.ad)}
              onClick={() => {
                zekaSekmesiSec("beceriler", b.ad);
                git("zeka");
              }}
            >
              <b>{b.ad}</b>
              <small>{b.aciklama}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HafizaAktar({ ajan, acikSoz, aktarildi }: { ajan: Ajan; acikSoz: number; aktarildi: () => void }) {
  const t = useSozluk().zeka.ajan;
  const s = useSozluk();
  const ajanlar = useVeri((d) => d.ajanlar);
  const adaylar = ajanlar.filter((a) => a.id !== ajan.id);
  const varsayilan = ajan.yoneticiId && adaylar.some((a) => a.id === ajan.yoneticiId) ? ajan.yoneticiId : (adaylar[0]?.id ?? "");
  const [acik, setAcik] = useState(false);
  const [kime, setKime] = useState(varsayilan);
  const [not, setNot] = useState("");
  const [sozler, setSozler] = useState(false);
  const { suruyor, calistir } = useIslem();
  const id = useId();

  // Başka bir ajan seçilince form kapanır ve sıfırlanır
  useEffect(() => {
    setAcik(false);
    setNot("");
    setSozler(false);
    setKime(varsayilan);
  }, [ajan.id, varsayilan]);

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    if (!kime) return;
    void calistir("aktar", async () => {
      const r = await api.hafizaAktar(ajan.id, kime, { sozler, not: not.trim() || undefined });
      bildir("basari", r.mesaj);
      setAcik(false);
      setNot("");
      setSozler(false);
      aktarildi();
    });
  };

  return (
    <section className="ajan-bolum" aria-labelledby={id}>
      <h3 id={id}>{t.aktar}</h3>
      <p className="alan-ipucu">{t.aktarAciklama}</p>
      {!adaylar.length ? (
        <p className="ajan-zeka-bos">{t.kimseYok}</p>
      ) : acik ? (
        <form
          className="ic-form aktar-form"
          onSubmit={gonder}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setAcik(false);
            }
          }}
        >
          <div className="alan">
            <label htmlFor={`aktar-kime-${ajan.id}`}>{t.kime}</label>
            <select id={`aktar-kime-${ajan.id}`} className="secim" value={kime} onChange={(e) => setKime(e.target.value)} autoFocus>
              {adaylar.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ad} · {a.rolAdi}
                  {a.id === ajan.yoneticiId ? ` (${t.yoneticisi})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="alan">
            <label htmlFor={`aktar-not-${ajan.id}`}>{t.not}</label>
            <textarea
              id={`aktar-not-${ajan.id}`}
              className="metin-alani"
              rows={2}
              maxLength={1000}
              value={not}
              placeholder={t.notOrnek}
              onChange={(e) => setNot(e.target.value)}
            />
          </div>
          <label className="secenek">
            <input type="checkbox" checked={sozler} disabled={!acikSoz} onChange={(e) => setSozler(e.target.checked)} />
            {t.sozleriDevret}
          </label>
          <span className="alan-ipucu">{t.sozleriDevretIpucu(acikSoz)}</span>
          <div className="dugme-satir">
            <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={suruyor !== null || !kime}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : null}
              {t.aktarDugme}
            </button>
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setAcik(false)}>
              {s.genel.vazgec}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="dugme dugme-kucuk" onClick={() => setAcik(true)}>
            {t.aktarAc}
          </button>
        </div>
      )}
    </section>
  );
}
