// Onaylar: bekleyen kararlar üstte (süresi azalan önce, sonra en uzun bekleyen), sonuçlananlar altta sakin bir geçmişte.
// Türe göre süzgeç iki bölüme de uygulanır; geçmiş ayrıca sonuca göre süzülür. Başlığın altında karar yetkisi şeridi:
// tam otonomda kararları CEO verir (kurul yine her bekleyene karar verebilir), kurul kipinde başlığın yanında otomatik
// onay kutusu ve açıkken uyarı satırı. Önemli an penceresinden "Onaylar'da aç" gelince o onay görünür kılınıp vurgulanır.
import type { Onay, OnayDurumu, OnayTuru } from "@arnorg/ortak";
import { useEffect, useMemo, useState } from "react";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { KararYetkisiSeridi, useTamOtonom } from "../bilesenler/KararYetkisi";
import { OnayOgesi } from "../bilesenler/OnayOgesi";
import { OtomatikOnayKutusu, OtomatikOnayUyarisi } from "../bilesenler/OtomatikOnay";
import { useSozluk } from "../dil";
import { useSohbet, vurguyuBitir } from "../durum/sohbet";
import { projeVerisiniYukle, rolleriYukle, useVeri } from "../durum/veri";

type Sonuc = Exclude<OnayDurumu, "bekliyor">;

const TURLER: (OnayTuru | "tumu")[] = ["tumu", "teslim", "ise_alim", "birlestirme", "genel", "anayasa", "isten_cikarma", "arac"];
/** Vurgu bu süre sonra söner */
const VURGU_MS = 2400;
const SONUCLAR: (Sonuc | "tumu")[] = ["tumu", "onaylandi", "reddedildi", "zaman_asimi"];
/** Geçmişte bir seferde gösterilen satır */
const GECMIS_SAYFA = 30;

/** Süresi olan önce (en az kalan başta), sonra en uzun bekleyen */
function bekleyenSirasi(a: Onay, b: Onay): number {
  const sa = a.sonGecerlilik ? Date.parse(a.sonGecerlilik) : Infinity;
  const sb = b.sonGecerlilik ? Date.parse(b.sonGecerlilik) : Infinity;
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.olusturma.localeCompare(b.olusturma);
}

/** En son karar verilen önce */
function gecmisSirasi(a: Onay, b: Onay): number {
  return (b.sonuclanma ?? b.olusturma).localeCompare(a.sonuclanma ?? a.olusturma);
}

export function Onaylar() {
  const s = useSozluk();
  const t = s.onaylar;
  const onaylar = useVeri((d) => d.onaylar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const projeHatasi = useVeri((d) => d.projeHatasi);
  // Tam otonomda otomatik onay kullanılmaz; şerit kimin karar verdiğini söyler
  const otonom = useTamOtonom();
  const [tur, setTur] = useState<OnayTuru | "tumu">("tumu");
  const [sonuc, setSonuc] = useState<Sonuc | "tumu">("tumu");
  const [gecmisSiniri, setGecmisSiniri] = useState(GECMIS_SAYFA);
  const vurgulu = useSohbet((d) => d.vurguluOnayId);

  useEffect(() => {
    // İşe alım verisindeki rol adları için
    rolleriYukle().catch(() => undefined);
  }, []);

  // "Onaylar'da aç": onay süzgeçte gizliyse süzgeç açılır; kabuk ekranı başa aldıktan sonra öğeye kaydırılır
  const vurguluOnay = vurgulu ? onaylar.find((o) => o.id === vurgulu) : undefined;
  useEffect(() => {
    if (!vurgulu) return;
    if (!vurguluOnay) {
      // Liste henüz yüklenmediyse bekler; yüklendiği hâlde yoksa vurgu bırakılır
      if (yukleme !== "yukleniyor") vurguyuBitir();
      return;
    }
    if (tur !== "tumu" && vurguluOnay.tur !== tur) setTur("tumu");
    if (vurguluOnay.durum !== "bekliyor") {
      setSonuc("tumu");
      setGecmisSiniri((n) => Math.max(n, onaylar.length));
    }
    const kaydir = window.setTimeout(() => {
      const azHareket = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`onay-${vurgulu}`)?.scrollIntoView({ block: "center", behavior: azHareket ? "auto" : "smooth" });
    }, 80);
    const son = window.setTimeout(vurguyuBitir, VURGU_MS);
    return () => {
      window.clearTimeout(kaydir);
      window.clearTimeout(son);
    };
    // Vurgulanan onay ya da durumu değişince bir kez
  }, [vurgulu, vurguluOnay?.id, vurguluOnay?.durum, yukleme]);

  const { bekleyenler, sonuclananlar, gecmis, sayilar } = useMemo(() => {
    const turda = onaylar.filter((o) => tur === "tumu" || o.tur === tur);
    const bekleyenler = turda.filter((o) => o.durum === "bekliyor").sort(bekleyenSirasi);
    const sonuclananlar = turda.filter((o) => o.durum !== "bekliyor");
    const sayilar: Record<string, number> = { tumu: sonuclananlar.length };
    for (const o of sonuclananlar) sayilar[o.durum] = (sayilar[o.durum] ?? 0) + 1;
    const gecmis = sonuclananlar.filter((o) => sonuc === "tumu" || o.durum === sonuc).sort(gecmisSirasi);
    return { bekleyenler, sonuclananlar, gecmis, sayilar };
  }, [onaylar, tur, sonuc]);

  const ilkYukleme = yukleme === "yukleniyor" && !onaylar.length;
  const yuklenemedi = yukleme === "hata" && !onaylar.length;

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{t.baslik}</h1>
          <p>{otonom ? s.karar.altBaslik : t.altBaslik}</p>
        </div>
        <div className="baslik-eylem onay-baslik-eylem">
          {otonom ? null : <OtomatikOnayKutusu />}
          <select
            className="secim suzgec-secim"
            aria-label={t.tureGore}
            value={tur}
            onChange={(e) => {
              setTur(e.target.value as OnayTuru | "tumu");
              setGecmisSiniri(GECMIS_SAYFA);
            }}
          >
            {TURLER.map((x) => (
              <option key={x} value={x}>
                {x === "tumu" ? t.butunTurler : s.genel.onayTuru[x]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <KararYetkisiSeridi />
      {otonom ? null : <OtomatikOnayUyarisi />}

      {ilkYukleme ? <Iskelet satir={6} /> : null}
      {yuklenemedi ? <HataKutu metin={projeHatasi ?? t.alinamadi} yeniden={() => void projeVerisiniYukle()} /> : null}

      {!ilkYukleme && !yuklenemedi ? (
        <>
          <section className="onay-bolum" aria-labelledby="onay-bekleyen-baslik">
            <h2 className="ara-baslik" id="onay-bekleyen-baslik">
              {t.bekleyenler} <small className="sayi">{bekleyenler.length}</small>
            </h2>
            {bekleyenler.length ? (
              <ul className="onay-liste">
                {bekleyenler.map((o) => (
                  <OnayOgesi key={o.id} onay={o} />
                ))}
              </ul>
            ) : (
              <Bos kucuk baslik={tur === "tumu" ? t.bekleyenYok : t.turdeBekleyenYok}>
                {tur === "tumu" ? (otonom ? s.karar.bekleyenYokMetin : t.bekleyenYokMetin) : t.suzgeciDegistirin}
              </Bos>
            )}
          </section>

          <section className="onay-bolum" aria-labelledby="onay-gecmis-baslik">
            <div className="onay-bolum-ust">
              <h2 className="ara-baslik" id="onay-gecmis-baslik">
                {t.gecmis} <small className="sayi">{sonuclananlar.length}</small>
              </h2>
              {sonuclananlar.length ? (
                <div className="bolumlu" role="group" aria-label={t.sonucaGore}>
                  {SONUCLAR.map((x) => (
                    <button
                      key={x}
                      type="button"
                      aria-pressed={sonuc === x}
                      onClick={() => {
                        setSonuc(x);
                        setGecmisSiniri(GECMIS_SAYFA);
                      }}
                    >
                      {x === "tumu" ? s.genel.tumu : t.durum[x]} <span className="soluk sayi">{sayilar[x] ?? 0}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {gecmis.length ? (
              <>
                <ul className="onay-liste onay-gecmis">
                  {gecmis.slice(0, gecmisSiniri).map((o) => (
                    <OnayOgesi key={o.id} onay={o} />
                  ))}
                </ul>
                {gecmis.length > gecmisSiniri ? (
                  <div className="tablo-daha">
                    <button type="button" className="dugme dugme-kucuk" onClick={() => setGecmisSiniri((n) => n + GECMIS_SAYFA)}>
                      {t.dahaGoster(Math.min(GECMIS_SAYFA, gecmis.length - gecmisSiniri))}
                    </button>
                    <small>
                      {gecmisSiniri} / {gecmis.length}
                    </small>
                  </div>
                ) : null}
              </>
            ) : (
              <Bos kucuk baslik={sonuclananlar.length || tur !== "tumu" ? t.suzgecteYok : t.gecmisYok}>
                {sonuclananlar.length || tur !== "tumu" ? t.suzgeciDegistirin : otonom ? s.karar.gecmisYokMetin : t.gecmisYokMetin}
              </Bos>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
