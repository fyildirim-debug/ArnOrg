// Harcama (0.0.10): en çok token işleyen görevler ve çalışan başına bugüne dek harcanan. Görev tokenları kullanım
// olaylarıyla canlı gelir (durum/olaylar.ts); görevin tavanı kullanım özetinden (kurulun yükselttiği tavan dahil), yoksa
// projenin geçerli seviyesinden hesaplanır. Üst çubuğun bütçe paneli ilk beşi, Karargâh'taki bölüm hepsini gösterir.
import "../../stiller/butce.css";
import { seviyeGorevTavani, type GorevDurumu } from "@arnorg/ortak";
import { useMemo } from "react";
import { useSozluk } from "../../dil";
import { git } from "../../durum/arayuz";
import { useVeri } from "../../durum/veri";
import { kisaToken, sayi } from "../../yardimcilar/bicim";

export interface HarcamaSatiri {
  gorevId: string;
  kod: string;
  baslik: string;
  durum: GorevDurumu;
  atananAd: string | null;
  token: number;
  /** Geçerli görev tavanı; bilinmiyorsa ya da kapalıysa 0 */
  tavan: number;
}

/** Etkin projenin en pahalı görevleri, çoktan aza */
export function useGorevHarcamalari(sinir = 10): HarcamaSatiri[] {
  const gorevler = useVeri((d) => d.gorevler);
  const ajanlar = useVeri((d) => d.ajanlar);
  const ozet = useVeri((d) => d.kullanim?.gorevler);
  const ayarTavani = useVeri((d) => d.ayarlar?.gorevTokenTavani ?? null);
  const seviye = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId)?.butceDurumu?.etkinSeviye ?? null);
  return useMemo(() => {
    const tavanlar = new Map((ozet ?? []).map((g) => [g.gorevId, g.tavan]));
    const adlar = new Map(ajanlar.map((a) => [a.id, a.ad]));
    const temel = ayarTavani !== null && seviye ? seviyeGorevTavani(ayarTavani, seviye) : 0;
    return gorevler
      .filter((g) => (g.token ?? 0) > 0)
      .sort((a, b) => (b.token ?? 0) - (a.token ?? 0) || a.no - b.no)
      .slice(0, sinir)
      .map((g) => ({
        gorevId: g.id,
        kod: g.kod,
        baslik: g.baslik,
        durum: g.durum,
        atananAd: g.atananId ? (adlar.get(g.atananId) ?? null) : null,
        token: g.token ?? 0,
        tavan: Math.max(tavanlar.get(g.id) ?? 0, temel),
      }));
  }, [gorevler, ajanlar, ozet, ayarTavani, seviye, sinir]);
}

/** Görev listesi: kod, başlık, atanan; sağda token, altta görevin tavanına (tavan yoksa en pahalıya) göre ince ölçer */
export function GorevHarcamaListesi({ satirlar, bos }: { satirlar: HarcamaSatiri[]; bos?: string }) {
  const s = useSozluk();
  const t = s.butce.harcama;
  if (!satirlar.length) return bos ? <p className="soluk harcama-bos">{bos}</p> : null;
  const enCok = satirlar[0]!.token;
  return (
    <ol className="harcama-liste">
      {satirlar.map((g) => (
        <li key={g.gorevId}>
          <button type="button" className="harcama-satir" onClick={() => git("pano", { gorevId: g.gorevId })} aria-label={t.gorevAc(g.kod)}>
            <code>{g.kod}</code>
            <span className="harcama-baslik tek-satir">{g.baslik}</span>
            <b className="sayi" title={`${sayi(g.token)} ${s.genel.tokenBirimi(g.token)}`}>
              {kisaToken(g.token)}
            </b>
            <small className="harcama-alt tek-satir">
              {g.atananAd ?? t.atanmadi} · {s.genel.gorevDurumu[g.durum]}
              {g.tavan ? ` · ${t.tavan(kisaToken(g.tavan))}` : ""}
            </small>
            <span className="harcama-pay" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(3, Math.round((g.token / (g.tavan || enCok)) * 100)))}%` }} data-asim={g.tavan && g.token > g.tavan ? "" : undefined} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Karargâh'taki bölüm: en pahalı görevler ve çalışan başına bugüne dek harcanan */
export function HarcamaBolumu() {
  const s = useSozluk();
  const t = s.butce.harcama;
  const satirlar = useGorevHarcamalari(10);
  const ajanlar = useVeri((d) => d.ajanlar);
  const calisanlar = useMemo(() => [...ajanlar].filter((a) => a.toplamToken > 0).sort((a, b) => b.toplamToken - a.toplamToken), [ajanlar]);
  const enCok = calisanlar[0]?.toplamToken ?? 0;
  return (
    <div className="harcama">
      <section aria-labelledby="harcama-gorevler">
        <h3 id="harcama-gorevler" className="harcama-ara">
          {t.gorevler}
        </h3>
        <GorevHarcamaListesi satirlar={satirlar} bos={t.gorevlerBos} />
      </section>
      <section aria-labelledby="harcama-calisanlar">
        <h3 id="harcama-calisanlar" className="harcama-ara">
          {t.calisanlar}
        </h3>
        {calisanlar.length ? (
          <ul className="kullanim-ajanlar harcama-calisanlar">
            {calisanlar.map((a) => (
              <li key={a.id}>
                <span className="tek-satir">{a.ad}</span>
                <span className="kullanim-pay" aria-hidden="true">
                  <span style={{ width: `${enCok ? Math.max(4, Math.round((a.toplamToken / enCok) * 100)) : 0}%` }} />
                </span>
                <small title={`${sayi(a.toplamToken)} ${s.genel.tokenBirimi(a.toplamToken)}`}>{kisaToken(a.toplamToken)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="soluk harcama-bos">{t.calisanlarBos}</p>
        )}
      </section>
    </div>
  );
}
