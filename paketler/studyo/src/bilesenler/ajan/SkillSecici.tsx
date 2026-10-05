// Skill seçici (0.0.8): atanmış skiller kıl çizgili bir listede, her biri çıkarılabilir; "Skill ekle" ile açılan
// listede kütüphanenin geri kalanı kategoriye göre, aranabilir, önce role uyanlar. Denetimli bileşendir: işe alım
// formunda yerel durumu, çalışan panelinde (AjanSkilleri) kaydı değiştirir. Ekleme ve çıkarmadan sonra odak
// kaybolmaz: sıradaki öğeye, liste boşalırsa denetime geçer.
import { skillMetni, type SkillKatalogu, type SkillKaydi } from "@arnorg/ortak";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDil, useSozluk } from "../../dil";
import { rolSkilleri, skillBul, skillSirala } from "../../durum/skiller";
import { Simge } from "../Simge";

export type SkillDegisikligi = { tur: "ekle" | "cikar"; kimlik: string } | { tur: "varsayilan" };

/** Arama: ad, kimlik, açıklama ve kategori adında, büyük/küçük harf ve Türkçe harflerden bağımsız */
function sadele(metin: string, dil: string): string {
  return metin.toLocaleLowerCase(dil === "tr" ? "tr-TR" : "en-US").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function SkillSecici({
  katalog,
  deger,
  degisti,
  rol,
  kaydedilen = null,
  etiketId,
}: {
  katalog: SkillKatalogu;
  /** Atanmış skill kimlikleri */
  deger: string[];
  degisti: (yeni: string[], ne: SkillDegisikligi) => void;
  rol: string;
  /** Kaydı süren skill (ya da "hepsi"): o satırda gösterge döner, öteki denetimler bekler */
  kaydedilen?: string | null;
  etiketId?: string;
}) {
  const s = useSozluk();
  const t = s.skiller;
  const dil = useDil();
  const kimlik = useId();
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState("");
  const [hepsi, setHepsi] = useState(false);
  /** Son eklenen skill: yalnız onun satırı girişle belirir */
  const [yeni, setYeni] = useState<string | null>(null);
  const atanmisRef = useRef<HTMLUListElement>(null);
  const adaylarRef = useRef<HTMLDivElement>(null);
  const aramaRef = useRef<HTMLInputElement>(null);
  const ekleRef = useRef<HTMLButtonElement>(null);
  /** Ekleme ya da çıkarmadan sonra odaklanacak öğe: hangi liste, kaçıncı sıra */
  const odak = useRef<{ liste: "atanmis" | "aday"; sira: number } | null>(null);

  const secili = useMemo(() => skillSirala(katalog, deger), [katalog, deger]);
  const varsayilan = rolSkilleri(katalog, rol);
  const varsayilanKume = new Set(varsayilan);
  const farkli = secili.join() !== varsayilan.join();
  const bekliyor = kaydedilen !== null;

  // Role uyan skill yoksa (yeni rol) liste baştan bütün kütüphaneyi gösterir
  const roleUyanVar = katalog.skiller.some((x) => x.roller.includes(rol) && !secili.includes(x.kimlik));
  const tumunuGoster = hepsi || !roleUyanVar;
  const aranan = sadele(arama.trim(), dil);
  const adaylar = katalog.skiller.filter((x) => {
    if (secili.includes(x.kimlik)) return false;
    if (!tumunuGoster && !x.roller.includes(rol)) return false;
    if (!aranan) return true;
    const m = skillMetni(x, dil);
    return sadele(`${m.ad} ${x.kimlik} ${m.aciklama} ${t.kategoriler[x.kategori]}`, dil).includes(aranan);
  });
  // Kategoriler katalog sırasıyla; her grupta rolün varsayılanları önce
  const gruplar: { kategori: SkillKaydi["kategori"]; skiller: SkillKaydi[] }[] = [];
  for (const x of adaylar) {
    const g = gruplar.find((y) => y.kategori === x.kategori);
    if (g) g.skiller.push(x);
    else gruplar.push({ kategori: x.kategori, skiller: [x] });
  }

  // Değişiklikten sonra odak: aynı sıradaki öğe ya da bir öncesi; liste boşaldıysa ekle düğmesi ya da arama
  useLayoutEffect(() => {
    const o = odak.current;
    if (!o || bekliyor) return;
    odak.current = null;
    const kok = o.liste === "atanmis" ? atanmisRef.current : adaylarRef.current;
    const dugmeler = Array.from(kok?.querySelectorAll<HTMLButtonElement>(o.liste === "atanmis" ? ".skill-cikar" : ".skill-aday") ?? []);
    const hedef = dugmeler[Math.min(o.sira, dugmeler.length - 1)];
    if (hedef) hedef.focus();
    else (o.liste === "atanmis" ? ekleRef.current : (aramaRef.current ?? ekleRef.current))?.focus();
  }, [secili, bekliyor]);

  useEffect(() => {
    if (acik) aramaRef.current?.focus();
  }, [acik]);

  const kapat = () => {
    setAcik(false);
    setArama("");
    ekleRef.current?.focus();
  };

  const ekle = (x: SkillKaydi, sira: number) => {
    odak.current = { liste: "aday", sira };
    setYeni(x.kimlik);
    degisti(skillSirala(katalog, [...secili, x.kimlik]), { tur: "ekle", kimlik: x.kimlik });
  };
  const cikar = (k: string, sira: number) => {
    odak.current = { liste: "atanmis", sira };
    degisti(
      secili.filter((y) => y !== k),
      { tur: "cikar", kimlik: k },
    );
  };

  let adaySirasi = -1;
  return (
    <div className="skill-secici" role="group" aria-labelledby={etiketId}>
      {secili.length ? (
        <ul className="skill-liste" ref={atanmisRef}>
          {secili.map((k, i) => {
            const x = skillBul(katalog, k)!;
            const m = skillMetni(x, dil);
            return (
              <li key={k} className={k === yeni ? "skill-satir skill-satir-yeni" : "skill-satir"}>
                <div className="skill-metin">
                  <b>
                    {m.ad}
                    {kaydedilen === k ? <span className="doner" aria-hidden="true" /> : null}
                  </b>
                  <code>{k}</code>
                </div>
                <button
                  type="button"
                  className="dugme dugme-sessiz dugme-kucuk dugme-simge skill-cikar"
                  aria-label={t.cikar(m.ad)}
                  title={t.cikar(m.ad)}
                  disabled={bekliyor}
                  onClick={() => cikar(k, i)}
                >
                  <Simge ad="kapat" boyut={12} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="skill-bos">{t.bos}</p>
      )}

      <div className="skill-eylem">
        <button
          type="button"
          className="dugme dugme-kucuk"
          ref={ekleRef}
          aria-expanded={acik}
          aria-controls={`${kimlik}-ekle`}
          onClick={() => (acik ? kapat() : setAcik(true))}
        >
          <Simge ad={acik ? "kapat" : "arti"} boyut={12} />
          {acik ? t.listeyiKapat : t.ekle}
        </button>
        {farkli && varsayilan.length ? (
          <button type="button" className="metin-dugme skill-varsayilan" disabled={bekliyor} onClick={() => degisti(varsayilan, { tur: "varsayilan" })}>
            {kaydedilen === "hepsi" ? <span className="doner" aria-hidden="true" /> : null}
            {t.varsayilanaDon}
          </button>
        ) : null}
      </div>

      {acik ? (
        <div
          className="skill-ekle"
          id={`${kimlik}-ekle`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Çekmecenin kendisi kapanmasın: yalnız liste kapanır, odak düğmeye döner
              e.stopPropagation();
              kapat();
            }
          }}
        >
          <div className="skill-suzgec">
            <div className="arama-kutu">
              <Simge ad="ara" boyut={13} />
              <input
                ref={aramaRef}
                type="search"
                className="girdi"
                aria-label={t.ara}
                placeholder={t.araYer}
                value={arama}
                onChange={(e) => setArama(e.target.value)}
              />
            </div>
            {roleUyanVar ? (
              <div className="bolumlu" role="group" aria-label={t.suzgec}>
                <button type="button" aria-pressed={!hepsi} onClick={() => setHepsi(false)}>
                  {t.roleUyan}
                </button>
                <button type="button" aria-pressed={hepsi} onClick={() => setHepsi(true)}>
                  {t.tumu}
                </button>
              </div>
            ) : null}
          </div>
          <div className="skill-adaylar" ref={adaylarRef}>
            {gruplar.length ? (
              gruplar.map((g) => (
                <section key={g.kategori} className="skill-grup" aria-labelledby={`${kimlik}-${g.kategori}`}>
                  <h4 id={`${kimlik}-${g.kategori}`}>{t.kategoriler[g.kategori]}</h4>
                  <ul>
                    {[...g.skiller]
                      .sort((a, b) => Number(varsayilanKume.has(b.kimlik)) - Number(varsayilanKume.has(a.kimlik)))
                      .map((x) => {
                        const m = skillMetni(x, dil);
                        const sira = ++adaySirasi;
                        return (
                          <li key={x.kimlik}>
                            <button
                              type="button"
                              className="skill-aday"
                              aria-label={t.ekleEtiket(m.ad)}
                              aria-describedby={`${kimlik}-${x.kimlik}`}
                              disabled={bekliyor}
                              onClick={() => ekle(x, sira)}
                            >
                              <span className="skill-aday-metin">
                                <b>
                                  {m.ad}
                                  {varsayilanKume.has(x.kimlik) ? <span className="etiket">{t.varsayilan}</span> : null}
                                  {kaydedilen === x.kimlik ? <span className="doner" aria-hidden="true" /> : null}
                                </b>
                                <span id={`${kimlik}-${x.kimlik}`} className="skill-aciklama">
                                  {m.aciklama}
                                  {m.gereksinim ? <span className="skill-gereksinim"> {m.gereksinim}</span> : null}
                                </span>
                                <code>
                                  {x.kimlik} · {t.kaynak(x.kaynak.depo, x.lisans)}
                                </code>
                              </span>
                              <Simge ad="arti" boyut={14} className="skill-aday-simge" />
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </section>
              ))
            ) : (
              <p className="skill-bos">{aranan ? t.sonucYok : t.hepsiAtanmis}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
