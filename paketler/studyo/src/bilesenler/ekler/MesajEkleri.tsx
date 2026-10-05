// Mesajın ekleri: görseller tek başına kendi oranında, birden çoksa düzenli bir ızgarada (en çok altı kutu, sonuncusu
// "+N"); tıklayınca ışık kutusu. Öteki ekler kart: tür rozeti, ad, tür ve boyut; PDF ve metin yeni sekmede açılır
// (masaüstünde kaydedilir), indirme ayrı düğmede. Görseller anahtarlı istekle alınır, nesne adresiyle gösterilir.
import type { MesajEki } from "@arnorg/ortak";
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { useSozluk } from "../../dil";
import { ekBoyutu, ekKumesi, gorselMi, izgara, kisaTur, sekmedeAcilir } from "../../yardimcilar/ekler";
import { Simge } from "../Simge";
import { ekAc, ekIndir, gorselAdresi, sekmeAcilabilir } from "./ekDosyasi";
import { EkSimgesi } from "./EkSimgesi";
import { IsikKutusu } from "./IsikKutusu";
import { ekHatasi } from "./taslak";
import "../../stiller/ekler.css";

export const MesajEkleri = memo(function MesajEkleri({ ekler }: { ekler: MesajEki[] | undefined }) {
  const [acik, setAcik] = useState<number | null>(null);
  const donus = useRef<HTMLElement | null>(null);
  if (!ekler?.length) return null;
  const gorseller = ekler.filter(gorselMi);
  const dosyalar = ekler.filter((e) => !gorselMi(e));
  const ac = (i: number, el: HTMLElement) => {
    donus.current = el;
    setAcik(i);
  };
  return (
    <div className="mesaj-ekleri">
      {gorseller.length === 1 ? <TekGorsel ek={gorseller[0]!} ac={(el) => ac(0, el)} /> : null}
      {gorseller.length > 1 ? <GorselIzgarasi gorseller={gorseller} ac={ac} /> : null}
      {dosyalar.length ? (
        <ul className="ek-dosyalar">
          {dosyalar.map((e) => (
            <DosyaKarti key={e.id} ek={e} />
          ))}
        </ul>
      ) : null}
      {acik !== null ? (
        <IsikKutusu
          gorseller={gorseller}
          baslangic={acik}
          kapat={() => {
            setAcik(null);
            donus.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
});

/** Görsel: önbellekten ya da çekirdekten; gelince yumuşakça belirir, alınamazsa kısa bir not */
function EkGorseli({ ek }: { ek: MesajEki }) {
  const s = useSozluk().ekler;
  const [adres, setAdres] = useState<string | null>(null);
  const [durum, setDurum] = useState<"bekliyor" | "hazir" | "hata">("bekliyor");
  useEffect(() => {
    let canli = true;
    setDurum("bekliyor");
    void gorselAdresi(ek).then((a) => {
      if (!canli) return;
      if (a) setAdres(a);
      else setDurum("hata");
    });
    return () => {
      canli = false;
    };
    // Ek bir kez yazılır, değişmez: kimliği yeter
  }, [ek.id]);
  if (durum === "hata") {
    return (
      <span className="ek-gorsel-yok">
        <EkSimgesi ad="gorsel" />
        <span>{s.gorselAlinamadi}</span>
      </span>
    );
  }
  if (!adres) return null;
  return <img src={adres} alt="" decoding="async" data-hazir={durum === "hazir" ? "" : undefined} onLoad={() => setDurum("hazir")} onError={() => setDurum("hata")} />;
}

/** Tek görsel: kendi oranında, en çok 22rem genişlik ve 20rem yükseklik; doğal boyutundan büyütülmez */
function TekGorsel({ ek, ac }: { ek: MesajEki; ac: (el: HTMLElement) => void }) {
  const s = useSozluk().ekler;
  const g = ek.genislik;
  const y = ek.yukseklik;
  const stil: CSSProperties | undefined = g && y ? { aspectRatio: `${g} / ${y}`, width: `min(100%, 22rem, ${g}px, ${((20 * g) / y).toFixed(3)}rem)` } : undefined;
  return (
    <figure className="ek-tek">
      <button type="button" className="ek-gorsel" style={stil} onClick={(e) => ac(e.currentTarget)} aria-label={s.gorselAc(ek.ad)} title={ek.ad}>
        <EkGorseli ek={ek} />
      </button>
      <figcaption className="ek-tek-alt">
        <span className="tek-satir">{ek.ad}</span>
        <span className="sayi">
          {g && y ? `${g}×${y} · ` : ""}
          {ekBoyutu(ek.boyut)}
        </span>
      </figcaption>
    </figure>
  );
}

function GorselIzgarasi({ gorseller, ac }: { gorseller: MesajEki[]; ac: (i: number, el: HTMLElement) => void }) {
  const s = useSozluk().ekler;
  const { sutun, gorunen, kalan } = izgara(gorseller.length);
  return (
    <ul className="ek-izgara" style={{ "--sutun": sutun } as CSSProperties} aria-label={s.etiket}>
      {gorseller.slice(0, gorunen).map((ek, i) => {
        const fazla = i === gorunen - 1 && kalan > 0;
        return (
          <li key={ek.id}>
            <button
              type="button"
              className="ek-gorsel"
              onClick={(e) => ac(i, e.currentTarget)}
              aria-label={fazla ? `${s.gorselAc(ek.ad)} · ${s.dahaFazlaEtiket(kalan)}` : s.gorselAc(ek.ad)}
              title={ek.ad}
            >
              <EkGorseli ek={ek} />
              {fazla ? (
                <span className="ek-gorsel-fazla" aria-hidden="true">
                  {s.dahaFazla(kalan)}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Dosya kartı: kartın kendisi PDF ve metni yeni sekmede açar (masaüstünde kaydeder), öteki türü indirir */
function DosyaKarti({ ek }: { ek: MesajEki }) {
  const s = useSozluk().ekler;
  const [suruyor, setSuruyor] = useState<"ac" | "indir" | null>(null);
  const kume = ekKumesi(ek);
  const acilir = sekmedeAcilir(ek) && sekmeAcilabilir();
  const yap = (ne: "ac" | "indir") => {
    if (suruyor) return;
    setSuruyor(ne);
    (ne === "ac" ? ekAc(ek) : ekIndir(ek)).catch(ekHatasi).finally(() => setSuruyor(null));
  };
  const anaIpucu = acilir ? s.acIpucu(ek.ad) : sekmeAcilabilir() ? s.indirIpucu(ek.ad) : s.kaydetIpucu(ek.ad);
  return (
    <li className="ek-dosya" data-kume={kume}>
      <button type="button" className="ek-dosya-ana" onClick={() => yap(acilir ? "ac" : "indir")} aria-label={anaIpucu} title={anaIpucu}>
        <span className="ek-rozet" aria-hidden="true">
          <span>{kisaTur(ek)}</span>
        </span>
        <span className="ek-dosya-metin">
          <span className="ek-dosya-ad tek-satir">{ek.ad}</span>
          <span className="ek-dosya-bilgi sayi">
            {s.turler[kume]} · {ekBoyutu(ek.boyut)}
          </span>
        </span>
        <span className="ek-dosya-isaret" aria-hidden="true">
          {suruyor === (acilir ? "ac" : "indir") ? <span className="doner" /> : <Simge ad={acilir ? "dis" : "indir"} boyut={13} />}
        </span>
      </button>
      {acilir ? (
        <button type="button" className="ek-dosya-indir" onClick={() => yap("indir")} aria-label={s.indirIpucu(ek.ad)} title={s.indirIpucu(ek.ad)}>
          {suruyor === "indir" ? <span className="doner" aria-hidden="true" /> : <Simge ad="indir" boyut={13} />}
        </button>
      ) : null}
    </li>
  );
}

/** Karargâh akışında ekin özeti: ataş ve ilk ekin adı ("ekran.png +2"); düğme içinde, etkileşimsiz */
export function EkOzeti({ ekler }: { ekler: MesajEki[] | undefined }) {
  const s = useSozluk().ekler;
  if (!ekler?.length) return null;
  return (
    <span className="akis-ek" title={ekler.map((e) => e.ad).join(", ")}>
      <EkSimgesi ad="atac" boyut={11} />
      {s.ozet(ekler[0]!.ad, ekler.length - 1)}
    </span>
  );
}
