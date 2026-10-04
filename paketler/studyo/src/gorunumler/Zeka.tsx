// Zekâ: ArnOrg'un beyni. Projenin ana yasası, ArnOrg'un global zekâsı, ekip becerileri ve sözler.
// Global zekâ "zeka.guncellendi", ana yasa "anayasa.guncellendi", sözler "soz.guncellendi" olaylarıyla canlı güncellenir.
import { useEffect } from "react";
import { gorunumAdi } from "../bilesenler/Gezinti";
import { AnaYasa } from "../bilesenler/zeka/AnaYasa";
import { Beceriler } from "../bilesenler/zeka/Beceriler";
import { GlobalZeka } from "../bilesenler/zeka/GlobalZeka";
import { Sozler } from "../bilesenler/zeka/Sozler";
import { useSozluk } from "../dil";
import { ofisOlayDinle } from "../durum/olaylar";
import { anayasayiYukle, useVeri } from "../durum/veri";
import {
  becerileriYukle,
  sozleriYukle,
  sozUygula,
  useAnayasaTaslagi,
  useProjeZekasi,
  useZeka,
  useZekaArayuz,
  ZEKA_SEKMELERI,
  zekaSekmesiSec,
  zekaYukle,
  type ZekaSekmesi,
} from "../durum/zeka";
import { useOnceki } from "../yardimcilar/kancalar";

export function Zeka() {
  const s = useSozluk();
  const t = s.zeka;
  const sekme = useZekaArayuz((d) => d.sekme);
  const pid = useVeri((d) => d.aktifProjeId);
  const ws = useVeri((d) => d.wsDurumu);
  const oncekiWs = useOnceki(ws);

  // Sekme sayıları: madde, standart, beceri, açık söz
  const maddeSayisi = useVeri((d) => d.anayasa?.maddeler.length ?? null);
  const standart = useZeka((d) => d.durum?.sayilar.etkin ?? null);
  const beceriSayisi = useProjeZekasi((d) => (d.projeId === pid && d.becerilerYukleme === "hazir" ? d.beceriler.length : null));
  const acikSoz = useProjeZekasi((d) => (d.projeId === pid && d.sozlerYukleme === "hazir" ? d.sozler.filter((x) => x.durum === "acik").length : null));
  const taslakVar = useAnayasaTaslagi((d) => d.taslak !== null && d.taslak.projeId === pid);
  // Sıfır gösterilmez; boş hâli sekmenin kendisi anlatır
  const sayilar: Record<ZekaSekmesi, number | null> = { anayasa: maddeSayisi, kuresel: standart, beceriler: beceriSayisi, sozler: acikSoz };

  useEffect(() => {
    void zekaYukle();
  }, []);

  useEffect(() => {
    if (!pid) return;
    void becerileriYukle(pid);
    void sozleriYukle(pid);
  }, [pid]);

  // Sözler canlı: genel olay dinleyicisi, olay depoya uygulandıktan sonra çağrılır
  useEffect(
    () =>
      ofisOlayDinle((olay) => {
        if (olay.tur === "soz.guncellendi") sozUygula(olay.soz);
      }),
    [],
  );

  // Bağlantı koptuysa kaçan olaylar için tazele
  useEffect(() => {
    if (oncekiWs !== "kopuk" || ws !== "bagli") return;
    void zekaYukle();
    if (pid) {
      void becerileriYukle(pid);
      void sozleriYukle(pid);
      anayasayiYukle().catch(() => undefined);
    }
  }, [ws, oncekiWs, pid]);

  return (
    <div className="zeka">
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{gorunumAdi(s, "zeka")}</h1>
          <p>{t.altBaslik}</p>
        </div>
      </div>

      <div className="bolumlu zeka-sekmeler" role="group" aria-label={t.bolumler}>
        {ZEKA_SEKMELERI.map((k) => (
          <button key={k} type="button" aria-pressed={sekme === k} title={t.sekmeIpucu[k]} onClick={() => zekaSekmesiSec(k)}>
            {t.sekme[k]}
            {sayilar[k] ? <span className="soluk sayi">{sayilar[k]}</span> : null}
            {k === "anayasa" && taslakVar && sekme !== "anayasa" ? (
              <span className="zeka-taslak-isaret" role="img" aria-label={t.anayasa.kaydedilmemis} title={t.anayasa.kaydedilmemis} />
            ) : null}
          </button>
        ))}
      </div>

      {sekme === "anayasa" ? <AnaYasa /> : sekme === "kuresel" ? <GlobalZeka /> : sekme === "beceriler" ? <Beceriler /> : <Sozler />}
    </div>
  );
}
