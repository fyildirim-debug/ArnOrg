// "main ile fark" görünümü: değişen dosyalar listesi ve seçili dosyanın birleşik farkı
import type { FarkSonucu } from "@arnorg/ortak";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/uclar";
import { hataMetni } from "../../api/istek";
import { dosyaAdi } from "../../yardimcilar/bicim";
import { Bos, HataKutu, Iskelet } from "../Durumlar";
import { farkiAyristir, type DosyaFarki } from "./fark";

const SATIR_SINIRI = 4000;

export function FarkGorunumu({
  projeId,
  alan,
  anaMi,
  varsayilanDal,
  aktifYol,
  ac,
  yenile,
}: {
  projeId: string;
  alan: string;
  anaMi: boolean;
  varsayilanDal: string;
  aktifYol: string | null;
  ac: (yol: string) => void;
  /** Dışarıdan artırılınca fark yeniden alınır (dosya değişince) */
  yenile: number;
}) {
  const [sonuc, setSonuc] = useState<FarkSonucu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [secili, setSecili] = useState<string | null>(aktifYol);

  useEffect(() => {
    let iptal = false;
    setHata(null);
    api
      .fark(projeId, alan)
      .then((s) => {
        if (!iptal) setSonuc(s);
      })
      .catch((e: unknown) => {
        if (!iptal) setHata(hataMetni(e));
      });
    return () => {
      iptal = true;
    };
  }, [projeId, alan, yenile]);

  const dosyalar = useMemo(() => (sonuc ? farkiAyristir(sonuc.fark) : []), [sonuc]);
  const ozet = sonuc?.dosyalar ?? [];
  const seciliYol = secili && ozet.some((d) => d.yol === secili) ? secili : (ozet[0]?.yol ?? dosyalar[0]?.yol ?? null);
  const seciliFark = dosyalar.find((d) => d.yol === seciliYol || d.eskiYol === seciliYol);
  const toplamEkle = ozet.reduce((t, d) => t + d.eklenen, 0);
  const toplamSil = ozet.reduce((t, d) => t + d.silinen, 0);

  if (hata) return <div className="fark-bos"><HataKutu metin={hata} /></div>;
  if (!sonuc) return <div className="fark-bos"><Iskelet satir={8} /></div>;
  if (!ozet.length && !dosyalar.length) {
    return (
      <div className="fark-bos">
        <Bos kucuk baslik={anaMi ? "Ana repo" : `${varsayilanDal} ile fark yok`}>
          {anaMi ? `Ana repo ${varsayilanDal} dalını gösterir; fark için bir ajanın çalışma alanını seçin.` : "Bu çalışma alanında henüz değişiklik yok."}
        </Bos>
      </div>
    );
  }

  return (
    <div className="fark">
      <nav className="fark-dosyalar" aria-label="Değişen dosyalar">
        <p className="fark-ozet">
          {ozet.length} dosya · <span className="f-ekle-metin">+{toplamEkle}</span> <span className="f-sil-metin">−{toplamSil}</span>
        </p>
        <ul>
          {ozet.map((d) => (
            <li key={d.yol}>
              <button type="button" className="fark-dosya" aria-current={d.yol === seciliYol ? "true" : undefined} onClick={() => setSecili(d.yol)} title={d.yol}>
                <span className={`a-durum a-durum-${d.degisiklik === "?" ? "yeni" : d.degisiklik}`}>{d.degisiklik === "?" ? "U" : d.degisiklik}</span>
                <span className="tek-satir">{dosyaAdi(d.yol)}</span>
                <small className="sayi">
                  <span className="f-ekle-metin">+{d.eklenen}</span> <span className="f-sil-metin">−{d.silinen}</span>
                </small>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="fark-icerik">
        {seciliFark ? (
          <DosyaFarkCizimi fark={seciliFark} ac={ac} />
        ) : (
          <Bos kucuk baslik="Fark gösterilemiyor">Bu dosyanın satır farkı yok (ikili dosya ya da yalnız kip değişikliği).</Bos>
        )}
      </div>
    </div>
  );
}

function DosyaFarkCizimi({ fark, ac }: { fark: DosyaFarki; ac: (yol: string) => void }) {
  let kalan = SATIR_SINIRI;
  const silindi = !fark.yol || fark.yol === "/dev/null";
  return (
    <div className="fark-dosya-govde">
      <header className="fark-dosya-ust">
        <code>{fark.yol || fark.eskiYol}</code>
        {fark.eskiYol && fark.yol && fark.eskiYol !== fark.yol ? <small>← {fark.eskiYol}</small> : null}
        {!silindi ? (
          <button type="button" className="dugme dugme-kucuk itele" onClick={() => ac(fark.yol)}>
            Düzenleyicide aç
          </button>
        ) : null}
      </header>
      {fark.ikili ? <p className="e-bos">İkili dosya; satır farkı yok.</p> : null}
      <div className="fark-kod" role="table" aria-label={`${fark.yol} farkı`}>
        {fark.parcalar.map((p, i) => {
          if (kalan <= 0) return null;
          const satirlar = p.satirlar.slice(0, kalan);
          kalan -= satirlar.length;
          return (
            <div key={i} className="fark-parca" role="rowgroup">
              <div className="f-baslik" role="row">
                <span role="cell">{p.baslik}</span>
              </div>
              {satirlar.map((s, j) => (
                <div key={j} className={`f-satir f-${s.tur}`} role="row">
                  <span className="f-no" role="cell">
                    {s.eski ?? ""}
                  </span>
                  <span className="f-no" role="cell">
                    {s.yeni ?? ""}
                  </span>
                  <span className="f-isaret" role="cell" aria-label={s.tur === "ekle" ? "eklendi" : s.tur === "sil" ? "silindi" : undefined}>
                    {s.tur === "ekle" ? "+" : s.tur === "sil" ? "−" : ""}
                  </span>
                  <code className="f-kod" role="cell">
                    {s.metin || " "}
                  </code>
                </div>
              ))}
            </div>
          );
        })}
        {kalan <= 0 ? <p className="e-bos">Fark çok uzun; ilk {SATIR_SINIRI} satır gösterildi.</p> : null}
      </div>
    </div>
  );
}
