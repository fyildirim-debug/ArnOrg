// Üst çubuk: açık projede bütün çalışanların bugüne dek harcadığı toplam token (5 saatlik ve haftalık pencerelerin
// yanında); bugünkü sayı ipucunda. Kullanım olaylarıyla canlı güncellenir (durum/olaylar.ts), değişince kısa vurgu
// alır. Tıklanınca ayrıntının olduğu Karargâh'a gider.
import "../stiller/toplam-token.css";
import { useSozluk } from "../dil";
import { git } from "../durum/arayuz";
import { useVeri } from "../durum/veri";
import { kisaToken, sayi } from "../yardimcilar/bicim";

export function ToplamToken() {
  const s = useSozluk();
  const t = s.arayuz.toplam;
  const kullanim = useVeri((d) => d.kullanim);
  if (!kullanim) return null;
  const tam = (n: number) => `${sayi(n)} ${s.genel.tokenBirimi(n)}`;
  const baslik = t.baslik(tam(kullanim.toplamToken), tam(kullanim.bugunToken));
  return (
    <button type="button" className="ust-toplam" title={baslik} aria-label={baslik} onClick={() => git("karargah")}>
      <small className="ust-toplam-etiket">{t.etiket}</small>
      <b data-sayi>{kisaToken(kullanim.toplamToken)}</b>
      <small>{t.birim}</small>
    </button>
  );
}
