// Önemli anlarda kurula açılır pencereler: onay, öneri, istek, yetki, teslim, bilgi, uyarı (her ekranda).
// Sağ üstte yığın: en yeni üstte, aynı anda en çok üçü (telefonda biri) görünür, gerisi "+N". Odak çalınmaz;
// yeni pencere gizli bir bölgeden kibarca duyurulur. Eylemler: Onaylar'da aç, uygun türlerde doğrudan karar (ret notuyla),
// teslimde Test et, öneri/istek/bilgide CEO'ya yanıt, kapat. İlk pencerede masaüstü bildirim izni sorulur.
// Tam otonomda CEO'nun kabul ettiği teslim sonuç olarak gelir: karar düğmesi yok; denenir, geri bildirim CEO'ya yazılır.
// Teslim test paneli de buradan çizilir: kabukta her ekranda duran tek yer burası.
import type { KurulBildirimi, OnayTuru } from "@arnorg/ortak";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir, git } from "../durum/arayuz";
import { butcePaneliniAc } from "../durum/butce";
import { claudeAsistaniniAc } from "../durum/kurulum";
import {
  ceoyaYanitYaz,
  masaustuIzni,
  masaustuIzniIste,
  masaustuSorusunuKapat,
  onaylardaAc,
  testiAc,
  testiKapat,
  useSohbet,
  type MasaustuIzni,
} from "../durum/sohbet";
import { kurulBildirimiKapat, onayUygula, useVeri } from "../durum/veri";
import { akilliZaman, goreli } from "../yardimcilar/bicim";
import { useIslem, useMedya, useSimdi } from "../yardimcilar/kancalar";
import { kararVereni } from "./kararVeren";
import { AjanAvatar } from "./Kisi";
import { OnaySecimi } from "./secenek/OnaySecimi";
import { onaySecenekleri, onaySorusu } from "../yardimcilar/secenek";
import { Simge } from "./Simge";
import { TestPaneli } from "./TestPaneli";
import { ZenginMetin } from "./ZenginMetin";

/** Pencereden doğrudan karar verilebilen onaylar; araç çağrısı Denetim'de, teslim testte, seçeneksiz soru ve işten çıkarma Onaylar'da verilir (seçenekli soru pencerede seçilir) */
const DOGRUDAN: OnayTuru[] = ["ise_alim", "birlestirme", "anayasa"];
/** Kurulun dikkatini isteyen türler: üst çizgi mercan kalır */
const EYLEMLI = ["onay", "yetki", "teslim", "istek"];

export function KurulBildirimleri() {
  const s = useSozluk();
  const b = s.sohbet.bildirim;
  const hepsi = useVeri((d) => d.kurulBildirimleri);
  const pid = useVeri((d) => d.aktifProjeId);
  const testOnayId = useSohbet((d) => d.testOnayId);
  const dar = useMedya("(max-width: 520px)");
  const [genis, setGenis] = useState(false);
  const [duyuru, setDuyuru] = useState("");

  // Etkin projenin pencereleri, en yeni üstte
  const liste = useMemo(() => hepsi.filter((x) => !pid || x.projeId === pid).reverse(), [hepsi, pid]);
  const sinir = dar ? 1 : 3;
  const gorunen = genis ? liste : liste.slice(0, sinir);
  const gizli = liste.length - gorunen.length;
  const enYeni = liste[0];

  useEffect(() => {
    if (liste.length <= sinir) setGenis(false);
  }, [liste.length, sinir]);

  // Yeni pencere ekran okuyucuya kısa bir cümleyle duyurulur; odak yerinde kalır
  useEffect(() => {
    if (enYeni) setDuyuru(`${b.tur[enYeni.tur] ?? enYeni.tur}: ${enYeni.baslik} · ${enYeni.ajanAd}`);
    // Yalnız yeni pencere gelince duyurulur (dil değişimi ya da kapatma yeniden okutmaz)
  }, [enYeni?.id]);

  return (
    <>
      <p className="gizli" aria-live="polite">
        {duyuru}
      </p>
      {liste.length ? (
        <section className={`kurul-bildirimleri${genis ? " kb-genis" : ""}`} aria-label={b.etiket}>
          <div className="kb-yigin">
            {gorunen.map((x, i) => (
              <KurulPenceresi key={x.id} bildirim={x} ilk={i === 0} />
            ))}
          </div>
          {liste.length > 1 ? (
            <div className="kb-alt">
              {gizli > 0 ? (
                <button type="button" className="kb-alt-dugme" onClick={() => setGenis(true)} aria-expanded={false}>
                  {b.daha(gizli)}
                </button>
              ) : liste.length > sinir ? (
                <button type="button" className="kb-alt-dugme" onClick={() => setGenis(false)} aria-expanded>
                  {b.daralt}
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="kb-alt-dugme" onClick={() => liste.forEach((x) => kurulBildirimiKapat(x.id))}>
                {b.hepsiniKapat}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {testOnayId ? <TestPaneli onayId={testOnayId} kapat={testiKapat} /> : null}
    </>
  );
}

function KurulPenceresi({ bildirim: k, ilk }: { bildirim: KurulBildirimi; ilk: boolean }) {
  const s = useSozluk();
  const b = s.sohbet.bildirim;
  const onay = useVeri((d) => (k.onayId ? d.onaylar.find((o) => o.id === k.onayId) : undefined));
  const ajan = useVeri((d) => (k.ajanId ? d.ajanlar.find((a) => a.id === k.ajanId) : undefined));
  const simdi = useSimdi(30_000);
  const [acik, setAcik] = useState(false);
  const [tasiyor, setTasiyor] = useState(false);
  const [retAcik, setRetAcik] = useState(false);
  const [not, setNot] = useState("");
  const metinRef = useRef<HTMLParagraphElement>(null);
  const baslikId = useId();
  const notId = useId();
  const { suruyor, calistir } = useIslem();

  const kapat = () => kurulBildirimiKapat(k.id);

  // "Devamı" yalnız metin üç satıra sığmıyorsa
  useLayoutEffect(() => {
    const el = metinRef.current;
    if (el && !acik) setTasiyor(el.scrollHeight > el.clientHeight + 1);
  }, [k.metin, acik]);

  // Onayın türü, pencerenin türünden farklı bir şey söylüyorsa yanında anılır ("Onay · Ana yasa"; "Teslim · Teslim" değil)
  const turAdi = b.tur[k.tur] ?? k.tur;
  const altTur = onay && onay.tur !== "genel" && s.genel.onayTuru[onay.tur].toLocaleLowerCase() !== turAdi.toLocaleLowerCase() ? s.genel.onayTuru[onay.tur] : null;
  const bekliyor = onay?.durum === "bekliyor";
  // Kurula sorunun seçenekleri pencerede seçilir (secenek/OnaySecimi); metinde yalnız soru kalır, başlıkta tam duruyorsa o da
  const secenekli = !!onay && bekliyor && onaySecenekleri(onay).length > 0;
  const soru = secenekli ? onaySorusu(onay) : null;
  // Kısaltılmış görünümde boş satırlar yer harcamaz
  const metin = secenekli ? (soru && !k.baslik.includes(soru) ? soru : "") : acik ? k.metin : k.metin.replace(/\n\s*\n/g, "\n");
  // Tam otonom: CEO teslimi kabul etti, kurul sonucu görür (karar zaten verildi; kabul ya da geri bildirim düğmesi yok)
  const sonucTeslim = !!onay && onay.tur === "teslim" && !bekliyor && kararVereni(onay) === "ceo";
  const dogrudan = !!onay && bekliyor && DOGRUDAN.includes(onay.tur);
  const teslim = !!k.onayId && (onay ? onay.tur === "teslim" : k.tur === "teslim");
  const arac = !!k.onayId && (onay ? onay.tur === "arac" : k.tur === "yetki");
  const yanitlanir = !k.onayId && (k.tur === "oneri" || k.tur === "istek" || k.tur === "bilgi");

  const karar = (ne: "onayla" | "reddet") =>
    calistir(ne, async () => {
      if (!onay) return;
      const sonuc = await api.onayKarari(onay.id, { karar: ne, not: ne === "reddet" ? not.trim() || undefined : undefined });
      onayUygula(sonuc);
      bildir(ne === "onayla" ? "basari" : "bilgi", sozluk().onaylar.kararBildirimi(onay.baslik, ne === "onayla"));
      kapat();
    });

  return (
    <article
      className={`kb kb-${k.tur}${(EYLEMLI.includes(k.tur) && !sonucTeslim) || k.eylem ? " kb-eylemli" : ""}`}
      aria-labelledby={baslikId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          kapat();
        }
      }}
    >
      <header className="kb-ust">
        <span className="kb-tur">
          {turAdi}
          {altTur ? <span className="kb-alt-tur"> · {altTur}</span> : null}
        </span>
        <time dateTime={k.zaman} title={akilliZaman(k.zaman)}>
          {goreli(k.zaman, simdi)}
        </time>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge kb-kapat" onClick={kapat} aria-label={b.kapat} title={b.kapat}>
          <Simge ad="kapat" boyut={12} />
        </button>
      </header>

      <p className="kb-kim">
        {ajan ? <AjanAvatar ajan={ajan} boyut="xs" /> : <span className="kb-imza" aria-hidden="true">A</span>}
        <b>{ajan?.ad ?? k.ajanAd}</b>
        {ajan ? <span>{ajan.rolAdi}</span> : null}
      </p>
      <h3 className="kb-baslik" id={baslikId}>
        {k.baslik}
      </h3>
      {metin ? (
        <>
          <p className={`kb-metin${acik ? " kb-metin-acik" : ""}`} ref={metinRef}>
            <ZenginMetin metin={metin} />
          </p>
          {tasiyor || acik ? (
            <button type="button" className="metin-dugme kb-devami" onClick={() => setAcik(!acik)} aria-expanded={acik}>
              {acik ? b.kisalt : b.devami}
            </button>
          ) : null}
        </>
      ) : null}

      {secenekli ? <OnaySecimi onay={onay} sikisik sonra={kapat} /> : null}

      {onay && sonucTeslim ? (
        <p className="kb-sonuc kb-sonuc-onaylandi">{s.karar.teslimSonucu(onay.kararVerenAd)}</p>
      ) : onay && !bekliyor ? (
        <p className={`kb-sonuc kb-sonuc-${onay.durum}`}>{b.sonuc(s.onaylar.durum[onay.durum], akilliZaman(onay.sonuclanma ?? onay.olusturma))}</p>
      ) : null}

      {retAcik && onay ? (
        <form
          className="kb-ret"
          onSubmit={(e) => {
            e.preventDefault();
            void karar("reddet");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setRetAcik(false);
            }
          }}
        >
          <label htmlFor={notId} className="gizli">
            {b.retNotu}
          </label>
          <input id={notId} className="girdi" value={not} onChange={(e) => setNot(e.target.value)} placeholder={b.retYer} autoFocus autoComplete="off" />
          <div className="kb-eylem">
            <button type="submit" className="dugme dugme-kucuk dugme-tehlike" disabled={suruyor !== null}>
              {suruyor === "reddet" ? <span className="doner" aria-hidden="true" /> : null}
              {s.genel.reddet}
            </button>
            <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={() => setRetAcik(false)}>
              {s.genel.vazgec}
            </button>
          </div>
        </form>
      ) : (
        <div className="kb-eylem">
          {teslim && k.onayId && (!onay || bekliyor || sonucTeslim) ? (
            <button
              type="button"
              className={`dugme dugme-kucuk${sonucTeslim ? "" : " dugme-ana"}`}
              onClick={() => {
                testiAc(k.onayId!);
                kapat();
              }}
            >
              <Simge ad="oynat" boyut={11} />
              {b.testEt}
            </button>
          ) : null}
          {sonucTeslim ? (
            <button
              type="button"
              className="dugme dugme-kucuk"
              onClick={() => {
                ceoyaYanitYaz(k.baslik);
                kapat();
              }}
            >
              {s.karar.geriBildirimYaz}
            </button>
          ) : null}
          {dogrudan && onay ? (
            <>
              <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={() => void karar("onayla")} disabled={suruyor !== null}>
                {suruyor === "onayla" ? <span className="doner" aria-hidden="true" /> : null}
                {s.onaylar.fiil[onay.tur]}
              </button>
              <button type="button" className="dugme dugme-kucuk" onClick={() => setRetAcik(true)} disabled={suruyor !== null}>
                {s.genel.reddet}
              </button>
            </>
          ) : null}
          {arac && (!onay || bekliyor) ? (
            <button
              type="button"
              className="dugme dugme-kucuk"
              onClick={() => {
                git("denetim");
                kapat();
              }}
            >
              {b.denetimdeAc}
            </button>
          ) : null}
          {yanitlanir ? (
            <button
              type="button"
              className="dugme dugme-kucuk"
              onClick={() => {
                ceoyaYanitYaz(k.baslik);
                kapat();
              }}
            >
              {b.yanitYaz}
            </button>
          ) : null}
          {k.eylem === "claude_giris" ? (
            <button
              type="button"
              className="dugme dugme-ana dugme-kucuk"
              onClick={() => {
                claudeAsistaniniAc();
                kapat();
              }}
            >
              {b.claudeGiris}
            </button>
          ) : null}
          {k.eylem === "butce" ? (
            <button
              type="button"
              className="dugme dugme-ana dugme-kucuk"
              onClick={() => {
                butcePaneliniAc(true);
                kapat();
              }}
            >
              {s.butce.bildirim.artir}
            </button>
          ) : null}
          {k.onayId ? (
            <button
              type="button"
              className="metin-dugme kb-onaylar"
              onClick={() => {
                onaylardaAc(k.onayId);
                kapat();
              }}
            >
              {b.onaylardaAc}
            </button>
          ) : null}
        </div>
      )}

      {ilk ? <MasaustuSorusu /> : null}
    </article>
  );
}

/** Pencere arkadayken de haber verilsin diye masaüstü bildirim izni; bir kez sorulur */
function MasaustuSorusu() {
  const t = useSozluk().sohbet.bildirim.masaustu;
  const soruldu = useSohbet((d) => d.masaustuSoruldu);
  const [izin, setIzin] = useState<MasaustuIzni>(masaustuIzni);
  if (soruldu || izin !== "sorulmadi") return null;

  const iste = async () => {
    const sonuc = await masaustuIzniIste();
    setIzin(sonuc);
    const m = sozluk().sohbet.bildirim.masaustu;
    if (sonuc === "verildi") bildir("basari", m.acildi);
    else if (sonuc === "reddedildi") bildir("bilgi", m.reddedildi);
  };

  return (
    <div className="kb-masaustu">
      <span>{t.soru}</span>
      <div className="kb-eylem">
        <button type="button" className="dugme dugme-kucuk" onClick={() => void iste()}>
          {t.izinVer}
        </button>
        <button type="button" className="metin-dugme" onClick={masaustuSorusunuKapat}>
          {t.simdiDegil}
        </button>
      </div>
    </div>
  );
}
