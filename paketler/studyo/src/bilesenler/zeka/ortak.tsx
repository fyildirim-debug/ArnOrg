// Zekâ ekranı ve ajan zekâsında paylaşılan parçalar: kapsam adları ve seçicisi, güven ölçüsü, söz satırı
import { rolMetni, type Dil, type Rol, type Soz } from "@arnorg/ortak";
import { useEffect } from "react";
import { useDil, useSozluk, type Sozluk } from "../../dil";
import { rolleriYukle, useVeri } from "../../durum/veri";
import { akilliZaman, goreli } from "../../yardimcilar/bicim";
import { AjanAvatar, Avatar } from "../Kisi";
import { Simge } from "../Simge";

/** Çekirdeğin kabul ettiği en çok kapsam sayısı */
export const KAPSAM_SINIRI = 8;
/** Güven eşikleri (çekirdekle aynı): aday %65'te standart olur, %30'un altı emekliye ayrılır */
export const ESIK_STANDART = 0.65;
export const ESIK_EMEKLI = 0.3;

/** Kapsam anahtarının görünen adı: gruplar sözlükten, roller rol adından; bilinmeyen kimlik olduğu gibi */
export function kapsamAdi(k: string, s: Sozluk, roller: Rol[], dil: Dil): string {
  if (k === "yonetici") return s.zeka.kuresel.kapsam.yonetici;
  if (k === "gelistirici") return s.zeka.kuresel.kapsam.gelistirici;
  const r = roller.find((x) => x.kimlik === k);
  return r ? rolMetni(r, dil).ad : k;
}

/** Rol adları için roller bir kez yüklenir */
export function useRoller(): Rol[] {
  const roller = useVeri((d) => d.roller);
  useEffect(() => {
    rolleriYukle().catch(() => undefined);
  }, []);
  return roller;
}

/** Kapsamı küçük etiketlerle gösterir; boşsa "Herkes" */
export function KapsamEtiketleri({ kapsam }: { kapsam: string[] }) {
  const s = useSozluk();
  const dil = useDil();
  const roller = useRoller();
  return (
    <ul className="kapsam-etiketleri" aria-label={s.zeka.kuresel.kapsamEtiketi}>
      {kapsam.length ? (
        kapsam.map((k) => (
          <li key={k} className="etiket">
            {kapsamAdi(k, s, roller, dil)}
          </li>
        ))
      ) : (
        <li className="etiket etiket-herkes">{s.zeka.kuresel.kapsam.herkes}</li>
      )}
    </ul>
  );
}

/** Kime verilir: "Herkes" (boş liste), gruplar ve roller; birden çok seçilebilir */
export function KapsamSecici({ deger, degisti, etiketId }: { deger: string[]; degisti: (k: string[]) => void; etiketId: string }) {
  const s = useSozluk();
  const dil = useDil();
  const roller = useRoller();
  const secenekler = [...new Set(["yonetici", "gelistirici", ...roller.map((r) => r.kimlik), ...deger])];
  const dolu = deger.length >= KAPSAM_SINIRI;
  const degistir = (k: string) => degisti(deger.includes(k) ? deger.filter((x) => x !== k) : [...deger, k]);
  return (
    <div className="kapsam-secici" role="group" aria-labelledby={etiketId}>
      <button type="button" aria-pressed={deger.length === 0} onClick={() => degisti([])}>
        {s.zeka.kuresel.kapsam.herkes}
      </button>
      <span className="kapsam-ayrac" aria-hidden="true" />
      {secenekler.map((k) => {
        const secili = deger.includes(k);
        return (
          <button key={k} type="button" aria-pressed={secili} disabled={!secili && dolu} onClick={() => degistir(k)} data-grup={k === "yonetici" || k === "gelistirici" || undefined}>
            {kapsamAdi(k, s, roller, dil)}
          </button>
        );
      })}
    </div>
  );
}

/** İnce güven ölçüsü: dolu kısım güvenin kendisi; iki kıl çizgi standart ve emeklilik eşikleri */
export function GuvenOlcusu({ deger }: { deger: number }) {
  const t = useSozluk().zeka.kuresel;
  const oran = Math.max(0, Math.min(1, deger));
  return (
    <span className="guven-olcu" aria-hidden="true">
      <span className="guven-dolu" style={{ width: `${oran * 100}%` }} />
      <i className="guven-esik" style={{ left: `${ESIK_EMEKLI * 100}%` }} title={t.esikEmekli} />
      <i className="guven-esik" style={{ left: `${ESIK_STANDART * 100}%` }} title={t.esikStandart} />
    </span>
  );
}

const GUN = 24 * 3600_000;

/** Açık sözlerde önce süresi geçenler, sonra son tarihi yakın olanlar, en sonda tarihsizler */
export function acikSozSirala(a: Soz, b: Soz): number {
  if (a.sonTarih && b.sonTarih) return a.sonTarih.localeCompare(b.sonTarih);
  if (a.sonTarih) return -1;
  if (b.sonTarih) return 1;
  return b.olusturma.localeCompare(a.olusturma);
}

export function kapaliSozSirala(a: Soz, b: Soz): number {
  return (b.kapanis ?? b.olusturma).localeCompare(a.kapanis ?? a.olusturma);
}

/**
 * Söz satırı. taraf verilirse (ajan ayrıntısında) yalnız karşı taraf gösterilir:
 * "veren" bu ajanın verdiği söz (→ alan), "alan" bu ajana verilen söz (veren →).
 */
export function SozSatiri({ soz, simdi, taraf }: { soz: Soz; simdi: number; taraf?: "veren" | "alan" }) {
  const s = useSozluk();
  const t = s.zeka.sozler;
  const ajanlar = useVeri((d) => d.ajanlar);
  const veren = ajanlar.find((a) => a.id === soz.verenId);
  const alan = soz.aliciId ? ajanlar.find((a) => a.id === soz.aliciId) : undefined;
  // Kurula verilen sözde alıcı adı arayüz dilinde gösterilir
  const alanAd = soz.aliciId ? soz.aliciAd : s.genel.kurul;
  const son = soz.sonTarih ? Date.parse(soz.sonTarih) : null;
  const acik = soz.durum === "acik";
  const gecikti = acik && son !== null && son < simdi;
  const yakin = acik && son !== null && !gecikti && son - simdi < GUN;

  const verenKisi = (
    <span className="soz-kisi">
      {veren ? <AjanAvatar ajan={veren} boyut="xs" /> : <Avatar ad={soz.verenAd} boyut="xs" />}
      <b>{soz.verenAd}</b>
    </span>
  );
  const alanKisi = (
    <span className="soz-kisi">
      {!soz.aliciId ? <Avatar ad="" siz boyut="xs" /> : alan ? <AjanAvatar ajan={alan} boyut="xs" /> : <Avatar ad={soz.aliciAd} boyut="xs" />}
      <b>{alanAd}</b>
    </span>
  );
  const ok = <Simge ad="sag" boyut={12} className="soz-ok" />;

  return (
    <li className="soz" data-durum={soz.durum} data-yakin={yakin || undefined} data-gecikti={gecikti || undefined}>
      <div className="soz-ust">
        <span className="gizli">{t.kime(soz.verenAd, alanAd)}</span>
        <span className="soz-kisiler" aria-hidden="true">
          {taraf === "veren" ? (
            <>
              {ok}
              {alanKisi}
            </>
          ) : taraf === "alan" ? (
            <>
              {verenKisi}
              {ok}
            </>
          ) : (
            <>
              {verenKisi}
              {ok}
              {alanKisi}
            </>
          )}
        </span>
        <span className={`soz-durum soz-durum-${soz.durum}`}>{t.durum[soz.durum]}</span>
      </div>
      <p className="soz-metin">{soz.metin}</p>
      <div className="soz-alt">
        {acik ? (
          soz.sonTarih ? (
            <span className="soz-son">
              {t.sonTarih}{" "}
              <time dateTime={soz.sonTarih}>{akilliZaman(soz.sonTarih)}</time>
              <span className="soz-kalan">{gecikti ? t.gecikti(goreli(soz.sonTarih, simdi)) : goreli(soz.sonTarih, simdi)}</span>
            </span>
          ) : (
            <span>{t.sonTarihYok}</span>
          )
        ) : null}
        <time dateTime={soz.olusturma} title={akilliZaman(soz.olusturma)}>
          {t.verildi(goreli(soz.olusturma, simdi))}
        </time>
        {soz.kapanis ? (
          <time dateTime={soz.kapanis} title={akilliZaman(soz.kapanis)}>
            {t.kapandi(goreli(soz.kapanis, simdi))}
          </time>
        ) : null}
      </div>
      {soz.not ? (
        <p className="soz-not">
          <span>{t.not}:</span> {soz.not}
        </p>
      ) : null}
    </li>
  );
}
