// Üst çubukta açık projenin bütçesi ve kullanım seviyesi (0.0.10). Bütçe varsa harcanan / bütçe ve ince ölçer (%80'de
// sarı, dolunca mercan; toplam bütçe yoksa günlük), yoksa 0.0.8'deki toplam token; yanında geçerli seviye (kademe
// inmişse işaretli). Tıklanınca panel açılır: seviye, bütçeler, bu hızla bitiş tahmini, bütçeyi artırma ve en pahalı
// görevler. Kurul bildirimindeki "Bütçeyi artır" paneli artırma formu açık olarak açar (durum/butce.ts).
import "../../stiller/butce.css";
import type { ButceDurumu, ButceKalemi, KullanimSeviyesi, ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir, git } from "../../durum/arayuz";
import { butcePaneliniDegistir, butcePaneliniKapat, useButcePaneli } from "../../durum/butce";
import { projeUygula, useVeri } from "../../durum/veri";
import { akilliZaman, kisaToken, sayi, yuzde } from "../../yardimcilar/bicim";
import { useDisariTik, useIslem, useSimdi } from "../../yardimcilar/kancalar";
import { KullanimCubugu } from "../Kullanim";
import { Simge } from "../Simge";
import { ButceAlanlari } from "./ButceAlanlari";
import { artirmaAdimlari, ayniButce, butceGirdisi, girdidenButce, kalanParcalar, tokendenMilyon } from "./butceYardimcilari";
import { GorevHarcamaListesi, useGorevHarcamalari } from "./Harcama";
import { kademeNedeni } from "./KullanimVeButce";
import { SeviyeDugmeleri } from "./SeviyeSecici";

/** Göstergenin kalemi: toplam bütçe, yoksa günlük */
function anaKalem(d: ButceDurumu): { kalem: ButceKalemi; gunluk: boolean } | null {
  if (d.toplam) return { kalem: d.toplam, gunluk: false };
  if (d.gunluk) return { kalem: d.gunluk, gunluk: true };
  return null;
}

/** Tahmini bitişe kalan süre metni: "3 sa 20 dk", "2 gün 4 sa", "15 dk" */
export function kalanMetni(ms: number): string {
  const t = sozluk().butce.panel.sure;
  const p = kalanParcalar(ms);
  if (p.gun) return [t.gun(p.gun), p.saat ? t.saat(p.saat) : null].filter(Boolean).join(" ");
  if (p.saat) return [t.saat(p.saat), p.dakika ? t.dakika(p.dakika) : null].filter(Boolean).join(" ");
  return t.dakika(Math.max(1, p.dakika));
}

export function ButceGostergesi() {
  const s = useSozluk();
  const t = s.butce.gosterge;
  const proje = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId));
  const kullanim = useVeri((d) => d.kullanim);
  const acik = useButcePaneli((d) => d.acik);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useDisariTik(ref, acik, butcePaneliniKapat);
  // Proje değişince panel kapanır
  useEffect(() => butcePaneliniKapat(), [proje?.id]);
  const d = proje?.butceDurumu;
  if (!proje || !d) return null;

  const ana = anaKalem(d);
  const toplam = kullanim?.toplamToken ?? proje.toplamToken ?? 0;
  const seviyeAdi = s.butce.seviye.adlar[d.etkinSeviye];
  const parcalar = [
    d.toplam ? t.kalem(t.butce, kisaToken(d.toplam.harcanan), kisaToken(d.toplam.sinir), yuzde(d.toplam.yuzde)) : t.toplamKalem(sayi(toplam)),
    d.gunluk ? t.kalem(t.bugun, kisaToken(d.gunluk.harcanan), kisaToken(d.gunluk.sinir), yuzde(d.gunluk.yuzde)) : null,
    t.seviyeKalem(d.etkinSeviye !== d.seviye ? `${seviyeAdi} (${kademeNedeni(d)})` : seviyeAdi),
    d.durum === "doldu" ? t.doldu : null,
  ].filter((x): x is string => Boolean(x));
  const baslik = t.baslik(parcalar);

  return (
    <div className="proje-secici butce-gosterge" ref={ref}>
      <button
        type="button"
        className="ust-butce"
        data-durum={d.durum}
        aria-expanded={acik}
        aria-controls={acik ? panelId : undefined}
        aria-label={baslik}
        title={baslik}
        onClick={butcePaneliniDegistir}
      >
        {ana ? (
          <>
            <small className="ust-butce-etiket">{ana.gunluk ? t.bugun : t.butce}</small>
            <b data-sayi>{kisaToken(ana.kalem.harcanan)}</b>
            <small>/ {kisaToken(ana.kalem.sinir)}</small>
            <KullanimCubugu deger={ana.kalem.yuzde} sinir={80} etiket={baslik} />
          </>
        ) : (
          <>
            <small className="ust-butce-etiket">{t.toplam}</small>
            <b data-sayi>{kisaToken(toplam)}</b>
            <small>{t.birim}</small>
          </>
        )}
        <span className="ust-seviye" data-seviye={d.etkinSeviye} data-kademe={d.etkinSeviye !== d.seviye ? "" : undefined}>
          {d.etkinSeviye !== d.seviye ? <Simge ad="asagi" boyut={10} /> : null}
          {seviyeAdi}
        </span>
      </button>
      {acik ? (
        <div className="acilir acilir-sag butce-acilir" id={panelId} role="dialog" aria-label={s.butce.panel.baslik}>
          <ButcePaneli proje={proje} durum={d} />
        </div>
      ) : null}
    </div>
  );
}

/** Bir bütçe kaleminin satırı: ad, ölçer, harcanan / sınır ve yüzde */
function KalemSatiri({ ad, kalem }: { ad: string; kalem: ButceKalemi }) {
  const t = useSozluk().butce.gosterge;
  const metin = t.kalem(ad, kisaToken(kalem.harcanan), kisaToken(kalem.sinir), yuzde(kalem.yuzde));
  return (
    <div className="butce-kalem">
      <span className="butce-kalem-ad">{ad}</span>
      <KullanimCubugu deger={kalem.yuzde} sinir={80} etiket={metin} />
      <span className="butce-kalem-sayi">
        <b>{kisaToken(kalem.harcanan)}</b> / {kisaToken(kalem.sinir)}
      </span>
      <small className="butce-kalem-yuzde">{yuzde(kalem.yuzde)}</small>
    </div>
  );
}

function ButcePaneli({ proje, durum: d }: { proje: ProjeOzeti; durum: ButceDurumu }) {
  const s = useSozluk();
  const t = s.butce.panel;
  const seviyeBaslik = useId();
  const artirIstegi = useButcePaneli((x) => x.artir);
  const simdi = useSimdi(30_000);
  const [form, setForm] = useState(false);
  const [girdi, setGirdi] = useState(() => butceGirdisi(proje.butce));
  const { suruyor, calistir } = useIslem();
  const satirlar = useGorevHarcamalari(5);
  const ilkIstek = useRef(artirIstegi);

  // "Bütçeyi artır" (kurul bildirimi) formu açar; dolu bütçede form kendiliğinden açıktır
  useEffect(() => {
    if (artirIstegi !== ilkIstek.current || d.durum === "doldu") setForm(true);
  }, [artirIstegi, d.durum]);
  useEffect(() => {
    if (!form) setGirdi(butceGirdisi(proje.butce));
  }, [form, proje.butce.toplam, proje.butce.gunluk]);

  const { butce, hatali } = girdidenButce(girdi);
  const degisti = Boolean(butce && !ayniButce(butce, proje.butce));
  const doluKalem = d.neden === "gunluk" ? d.gunluk : d.toplam;
  const adimlar = d.durum !== "normal" && doluKalem ? artirmaAdimlari(doluKalem.sinir, doluKalem.harcanan) : [];
  const bitis = d.tahminiBitis ? Date.parse(d.tahminiBitis) : NaN;

  const seviyeSec = (x: KullanimSeviyesi) =>
    void calistir(x, async () => {
      projeUygula(await api.projeGuncelle(proje.id, { seviye: x }));
      const m = sozluk().butce.seviye;
      bildir("basari", m.degisti(m.adlar[x]));
    });
  const kaydet = () => {
    if (!butce) return;
    void calistir("butce", async () => {
      projeUygula(await api.projeGuncelle(proje.id, { butce }));
      bildir("basari", sozluk().butce.panel.artirildi);
      setForm(false);
    });
  };
  /** Hazır adım: dolu kalemi o değere çıkarır */
  const adim = (deger: number) => setGirdi((g) => ({ ...g, [d.neden === "gunluk" ? "gunluk" : "toplam"]: tokendenMilyon(deger) }));

  return (
    <div className="butce-panel">
      <div className="butce-panel-ust">
        <h2>{t.baslik}</h2>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={t.kapat} title={t.kapat} onClick={butcePaneliniKapat}>
          <Simge ad="kapat" boyut={12} />
        </button>
      </div>

      <div className="butce-panel-satir">
        <span className="butce-panel-ad" id={seviyeBaslik}>
          {t.seviye}
        </span>
        <SeviyeDugmeleri
          deger={proje.seviye}
          degisti={seviyeSec}
          suruyor={suruyor && suruyor !== "butce" ? (suruyor as KullanimSeviyesi) : null}
          etiketId={seviyeBaslik}
        />
      </div>
      {d.etkinSeviye !== d.seviye ? <p className="butce-panel-not">{t.gecerli(s.butce.seviye.adlar[d.etkinSeviye], kademeNedeni(d))}</p> : null}

      {d.durum === "doldu" ? (
        <p className="butce-panel-uyari" role="status">
          {d.neden === "gunluk" ? t.doldu.gunluk : t.doldu.toplam}
        </p>
      ) : d.durum === "uyari" && doluKalem ? (
        <p className="butce-panel-not butce-panel-sari">{t.uyari(yuzde(doluKalem.yuzde))}</p>
      ) : null}

      {d.toplam || d.gunluk ? (
        <div className="butce-kalemler">
          {d.toplam ? <KalemSatiri ad={t.toplam} kalem={d.toplam} /> : null}
          {d.gunluk ? <KalemSatiri ad={t.gunluk} kalem={d.gunluk} /> : null}
        </div>
      ) : (
        <p className="butce-panel-not">
          {t.butceYok} {t.harcandi(kisaToken(proje.toplamToken))}
        </p>
      )}
      {d.toplam || d.gunluk ? (
        <p className="butce-panel-not">{Number.isFinite(bitis) && bitis > simdi ? t.tahmin(kalanMetni(bitis - simdi), akilliZaman(d.tahminiBitis)) : d.durum === "doldu" ? null : t.tahminYok}</p>
      ) : null}

      {form ? (
        <div className="butce-panel-form">
          {adimlar.length ? (
            <div className="butce-hazir" role="group">
              {adimlar.map((x) => (
                <button key={x} type="button" onClick={() => adim(x)} aria-pressed={girdi[d.neden === "gunluk" ? "gunluk" : "toplam"] === tokendenMilyon(x)}>
                  {t.adim(kisaToken(x))}
                </button>
              ))}
            </div>
          ) : null}
          <ButceAlanlari id={`${seviyeBaslik}-butce`} deger={girdi} degisti={setGirdi} hatali={hatali} kilitli={suruyor === "butce"} />
          <div className="dugme-satir">
            <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={kaydet} disabled={!degisti || suruyor !== null}>
              {suruyor === "butce" ? <span className="doner" aria-hidden="true" /> : null}
              {t.kaydet}
            </button>
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setForm(false)}>
              {t.vazgec}
            </button>
          </div>
        </div>
      ) : (
        <div className="dugme-satir">
          <button type="button" className={`dugme dugme-kucuk${d.durum !== "normal" ? " dugme-ana" : ""}`} onClick={() => setForm(true)}>
            {d.toplam || d.gunluk ? t.artir : t.butceKoy}
          </button>
        </div>
      )}

      {satirlar.length ? (
        <div className="butce-panel-pahali">
          <h3 className="harcama-ara">{t.pahali}</h3>
          <GorevHarcamaListesi satirlar={satirlar} />
          <button
            type="button"
            className="metin-dugme"
            onClick={() => {
              butcePaneliniKapat();
              git("karargah");
            }}
          >
            {t.tumu}
          </button>
        </div>
      ) : null}
    </div>
  );
}
