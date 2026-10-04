// Karargâh: projenin hafızasında son yazılanlar ve yanıt bekleyen sorular
import { useEffect, useMemo } from "react";
import { useSozluk } from "../dil";
import { git } from "../durum/arayuz";
import { hafizayiYukle, useHafiza } from "../durum/hafiza";
import { useVeri } from "../durum/veri";
import { goreli, kisalt } from "../yardimcilar/bicim";
import { Bos } from "./Durumlar";

export function HafizaNabzi() {
  const s = useSozluk();
  const h = s.karargah.hafiza;
  const pid = useVeri((d) => d.aktifProjeId);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const sorular = useHafiza((d) => d.sorular);
  const hazir = useHafiza((d) => d.projeId === pid && d.yukleme === "hazir");

  useEffect(() => {
    if (pid) void hafizayiYukle(pid, useHafiza.getState().projeId === pid);
  }, [pid]);

  const gecerli = useMemo(() => kayitlar.filter((k) => !k.yerineGecen), [kayitlar]);
  const son = useMemo(() => [...gecerli].sort((a, b) => b.guncelleme.localeCompare(a.guncelleme)).slice(0, 4), [gecerli]);
  const gunluk = gecerli.filter((k) => Date.now() - Date.parse(k.guncelleme) < 86_400_000).length;
  const bekleyen = sorular.filter((s) => s.durum === "bekliyor");

  return (
    <>
      <h2 className="ara-baslik">
        {h.baslik}{" "}
        <small>
          {s.genel.kayitSayisi(gecerli.length)}
          {gunluk ? ` · ${h.son24(gunluk)}` : ""}
          {bekleyen.length ? ` · ${h.soruBekliyor(bekleyen.length)}` : ""}
        </small>
        <span className="baslik-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => git("hafiza")}>
            {h.git}
          </button>
        </span>
      </h2>
      {hazir && !gecerli.length && !bekleyen.length ? (
        <Bos kucuk baslik={h.bos}>
          {h.bosAciklama}
        </Bos>
      ) : (
        <ul className="nabiz">
          {bekleyen.slice(0, 2).map((s) => (
            <li key={s.id} className="nabiz-soru">
              <span className="nabiz-tur">{h.soru}</span>
              <span className="nabiz-metin">
                <b>
                  {s.soranAd} → {s.soruluAd}
                </b>{" "}
                {kisalt(s.soru, 110)}
              </span>
              <time dateTime={s.olusturma}>{goreli(s.olusturma)}</time>
            </li>
          ))}
          {son.map((k) => (
            <li key={k.id} data-tur={k.tur}>
              <span className="nabiz-tur">{s.genel.hafizaTuru[k.tur]}</span>
              <span className="nabiz-metin">
                <b>{k.baslik}</b> <small>{k.kaynakAd}</small>
              </span>
              <time dateTime={k.guncelleme}>{goreli(k.guncelleme)}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
