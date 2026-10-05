// Ajan ayrıntısındaki "Skiller" bölümü (0.0.8): çalışana atanmış Claude Code skilleri; ekleme ve çıkarma hemen
// kaydedilir (PATCH /api/ajanlar/:aid skiller), skiller çalışanın bir sonraki oturumunda yüklenir. CEO skill kullanmaz.
// Ekibin öğrendiği yöntemler (beceriler) Zekâ sekmesindedir.
import { skillMetni, type Ajan } from "@arnorg/ortak";
import { useEffect, useId, useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useDil, useSozluk } from "../../dil";
import { bildir, hataBildir } from "../../durum/arayuz";
import { skilleriYukle, skillBul, useSkillKatalogu } from "../../durum/skiller";
import { ajanUygula } from "../../durum/veri";
import { SkillSecici, type SkillDegisikligi } from "./SkillSecici";
import "../../stiller/skiller.css";

export function AjanSkilleri({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const t = s.skiller;
  const dil = useDil();
  const kimlik = useId();
  const { katalog, hata, desteklenmiyor } = useSkillKatalogu();
  // Kayıt sürerken liste hemen yeni hâlini gösterir; yanıt gelince sunucunun listesi geçerli olur
  const [yerel, setYerel] = useState<string[] | null>(null);
  const [kaydedilen, setKaydedilen] = useState<string | null>(null);

  useEffect(() => setYerel(null), [ajan.id]);

  // Skill alanı olmayan (eski) çekirdekte bölüm gösterilmez
  if (!ajan.skiller || desteklenmiyor) return null;
  const ceo = ajan.rol === "ceo";
  const liste = yerel ?? ajan.skiller;

  const degisti = (yeni: string[], ne: SkillDegisikligi) => {
    const ad = ne.tur === "varsayilan" ? "" : skillMetni(skillBul(katalog, ne.kimlik)!, dil).ad;
    setYerel(yeni);
    setKaydedilen(ne.tur === "varsayilan" ? "hepsi" : ne.kimlik);
    // Rol varsayılanına dönüş kaydı siler (null): rolün varsayılanları sonraki sürümlerde de izlenir
    api
      .ajanGuncelle(ajan.id, { skiller: ne.tur === "varsayilan" ? null : yeni })
      .then((a) => {
        ajanUygula(a);
        const m = sozluk().skiller;
        bildir("basari", ne.tur === "ekle" ? m.eklendi(ajan.ad, ad) : ne.tur === "cikar" ? m.cikarildi(ajan.ad, ad) : m.varsayilanaDondu(ajan.ad));
      })
      .catch(hataBildir)
      .finally(() => {
        setYerel(null);
        setKaydedilen(null);
      });
  };

  return (
    <section className="ajan-bolum skill-bolum" aria-labelledby={`${kimlik}-baslik`}>
      <div className="skill-ust">
        <h3 id={`${kimlik}-baslik`}>{t.baslik}</h3>
        {ceo ? null : <span className="skill-sayac">{t.sayac(liste.length)}</span>}
      </div>
      {ceo ? (
        <p className="alan-ipucu">{t.ceo}</p>
      ) : (
        <>
          <p className="alan-ipucu">{t.ipucu}</p>
          {katalog ? (
            <SkillSecici katalog={katalog} deger={liste} degisti={degisti} rol={ajan.rol} kaydedilen={kaydedilen} etiketId={`${kimlik}-baslik`} />
          ) : hata ? (
            <p className="skill-durum skill-durum-hata">
              {t.alinamadi}{" "}
              <button type="button" className="metin-dugme" onClick={() => void skilleriYukle(true)}>
                {t.yenidenDene}
              </button>
            </p>
          ) : (
            <p className="skill-durum">
              <span className="doner" aria-hidden="true" /> {t.yukleniyor}
            </p>
          )}
        </>
      )}
    </section>
  );
}
