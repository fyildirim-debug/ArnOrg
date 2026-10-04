// Ajan ayrıntısındaki "Yetenekler" bölümü: her yetenek için ad, kısa açıklama, açtığı araçlar ve aç/kapa anahtarı.
// Değişiklik hemen kaydedilir (PATCH /api/ajanlar/:aid yetenekler). Kapatılan yeteneğin aracı çekirdekte hemen
// reddedilir; açılan yeteneğin araçları ajanın bir sonraki oturumunda gelir.
import { YETENEKLER, yetenekMetni, type Ajan, type YetenekKimligi } from "@arnorg/ortak";
import { useEffect, useId, useState } from "react";
import { yetenekApi } from "../../api/yetenek";
import { api } from "../../api/uclar";
import { sozluk, useDil, useSozluk } from "../../dil";
import { bildir, hataBildir } from "../../durum/arayuz";
import { ajanUygula } from "../../durum/veri";
import "../../stiller/yetenek.css";

const SIRA = YETENEKLER.map((y) => y.kimlik);

/** Katalog sırasında, tekil */
function sirala(liste: Iterable<YetenekKimligi>): YetenekKimligi[] {
  const k = new Set(liste);
  return SIRA.filter((x) => k.has(x));
}

/** mcp__arnorg__web_ara → web_ara; Claude Code araçları olduğu gibi */
function aracKisaAdi(arac: string): string {
  return arac.replace(/^mcp__arnorg__/, "");
}

export function AjanYetenekleri({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const t = s.yetenek.ajan;
  const dil = useDil();
  const kimlik = useId();
  // Kayıt sürerken anahtar hemen yeni konumunu gösterir; yanıt gelince sunucunun listesi geçerli olur
  const [yerel, setYerel] = useState<YetenekKimligi[] | null>(null);
  const [kaydedilen, setKaydedilen] = useState<YetenekKimligi | "hepsi" | null>(null);
  const [varsayilan, setVarsayilan] = useState<YetenekKimligi[] | null>(null);

  useEffect(() => setYerel(null), [ajan.id]);
  useEffect(() => {
    let iptal = false;
    yetenekApi
      .rolVarsayilanlari()
      .then((r) => {
        if (!iptal) setVarsayilan(r[ajan.rol] ? sirala(r[ajan.rol]!) : null);
      })
      .catch(() => undefined);
    return () => {
      iptal = true;
    };
  }, [ajan.rol]);

  // Yetenek alanı olmayan (eski) çekirdekte bölüm gösterilmez
  if (!ajan.yetenekler) return null;
  const acik = new Set(yerel ?? ajan.yetenekler);
  const farkli = !!varsayilan && sirala(acik).join() !== varsayilan.join();

  const kaydet = (yeni: YetenekKimligi[], ne: YetenekKimligi | "hepsi", bildirim: () => string) => {
    setYerel(yeni);
    setKaydedilen(ne);
    api
      .ajanGuncelle(ajan.id, { yetenekler: yeni })
      .then((a) => {
        ajanUygula(a);
        bildir("basari", bildirim());
      })
      .catch(hataBildir)
      .finally(() => {
        setYerel(null);
        setKaydedilen(null);
      });
  };

  const degistir = (k: YetenekKimligi) => {
    const y = YETENEKLER.find((x) => x.kimlik === k)!;
    const ad = yetenekMetni(y, dil).ad;
    const acilacak = !acik.has(k);
    const yeni = sirala(acilacak ? [...acik, k] : [...acik].filter((x) => x !== k));
    kaydet(yeni, k, () => (acilacak ? sozluk().yetenek.ajan.acildi(ajan.ad, ad) : sozluk().yetenek.ajan.kapandi(ajan.ad, ad)));
  };

  return (
    <section className="ajan-bolum yetenek-bolum" aria-labelledby={`${kimlik}-baslik`}>
      <div className="yetenek-ust">
        <h3 id={`${kimlik}-baslik`}>{t.baslik}</h3>
        <span className="yetenek-sayac">{t.sayac(acik.size, YETENEKLER.length)}</span>
      </div>
      <p className="alan-ipucu">{t.ipucu}</p>
      <ul className="yetenekler">
        {YETENEKLER.map((y) => {
          const m = yetenekMetni(y, dil);
          const ac = acik.has(y.kimlik);
          return (
            <li key={y.kimlik} className={`yetenek${ac ? "" : " yetenek-kapali"}`}>
              <button
                type="button"
                role="switch"
                className="anahtar-dugme"
                aria-checked={ac}
                aria-label={t.anahtar(m.ad, ac)}
                aria-describedby={`${kimlik}-${y.kimlik}`}
                disabled={kaydedilen !== null}
                onClick={() => degistir(y.kimlik)}
              />
              <div className="yetenek-metin">
                <b>
                  {m.ad}
                  {kaydedilen === y.kimlik ? <span className="doner" aria-hidden="true" /> : null}
                </b>
                <small id={`${kimlik}-${y.kimlik}`}>{m.aciklama}</small>
                <code>{y.araclar.map(aracKisaAdi).join(" · ")}</code>
              </div>
            </li>
          );
        })}
      </ul>
      {farkli ? (
        <div>
          <button
            type="button"
            className="metin-dugme yetenek-varsayilan"
            disabled={kaydedilen !== null}
            onClick={() => kaydet(varsayilan!, "hepsi", () => sozluk().yetenek.ajan.varsayilanaDondu(ajan.ad))}
          >
            {kaydedilen === "hepsi" ? <span className="doner" aria-hidden="true" /> : null}
            {t.varsayilan}
          </button>
        </div>
      ) : null}
    </section>
  );
}
