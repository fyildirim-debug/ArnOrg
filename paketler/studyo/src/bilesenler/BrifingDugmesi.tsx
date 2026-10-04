// Karargâh › CEO sohbeti: "Brifing ver". Çekirdek son brifingden bu yana olanları derleyip CEO'ya verir; CEO kısa bir
// brifingi #yonetim'e, yani bu sohbete yazar. İstek sürerken düğme "Hazırlanıyor…" olur ve CEO'nun "yazıyor"
// göstergesi sohbetin altında görünür. CEO brifingi yazınca, gösterge bitince, CEO bir süredir ne çalışıyor ne yazıyorsa
// ya da 5 dakika geçince düğme yeniden açılır.
import type { Ajan } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir } from "../durum/arayuz";
import { brifingBitti, brifingIstendi, brifingYaziyorGoruldu, useBrifingIstekleri } from "../durum/brifing";
import { useVeri } from "../durum/veri";
import "../stiller/brifing.css";
import { BRIFING_BEKLEME_MS, BRIFING_SESSIZLIK_MS, brifingBittiMi } from "../yardimcilar/brifing";
import { useIslem } from "../yardimcilar/kancalar";
import { Simge } from "./Simge";

/** Kurul ile CEO'nun bire bir kanalı: brifing buraya düşer */
const KANAL = "yonetim";

export function BrifingDugmesi({ pid, ceo }: { pid: string; ceo: Ajan }) {
  const t = useSozluk().brifing;
  const istek = useBrifingIstekleri((d) => d.istekler[pid]);
  const mesajlar = useVeri((d) => d.mesajlar[KANAL]);
  const ceoYaziyor = useVeri((d) => (d.yaziyorlar[KANAL] ?? []).some((y) => y.ajanId === ceo.id));
  const ceoCalisiyor = ceo.durum === "calisiyor" || ceo.durum === "karar_bekliyor";
  const { suruyor, calistir } = useIslem();
  // Sessizlik süresi dolunca bitiş yeniden değerlendirilir
  const [sessizlikDoldu, setSessizlikDoldu] = useState(false);

  // İsteğin bitişi: CEO brifingi yazdı, "yazıyor" görüldü ve bitti, CEO bir süredir sessiz ya da süre doldu
  useEffect(() => {
    if (!istek) return;
    if (ceoYaziyor && !istek.yaziyorGoruldu) brifingYaziyorGoruldu(pid);
    else if (brifingBittiMi(istek, mesajlar, ceo.id, { yaziyor: ceoYaziyor, calisiyor: ceoCalisiyor }, Date.now())) brifingBitti(pid);
  }, [istek, mesajlar, ceoYaziyor, ceoCalisiyor, ceo.id, pid, sessizlikDoldu]);

  useEffect(() => {
    setSessizlikDoldu(false);
    if (!istek) return;
    const kalan = (ms: number) => Math.max(0, istek.zaman + ms - Date.now());
    const sessizlik = setTimeout(() => setSessizlikDoldu(true), kalan(BRIFING_SESSIZLIK_MS));
    const son = setTimeout(() => brifingBitti(pid), kalan(BRIFING_BEKLEME_MS));
    return () => {
      clearTimeout(sessizlik);
      clearTimeout(son);
    };
  }, [istek, pid]);

  const hazirlaniyor = !!istek || suruyor !== null;
  const iste = () =>
    void calistir("brifing", async () => {
      const sonMesajId = useVeri.getState().mesajlar[KANAL]?.at(-1)?.id ?? null;
      const y = await api.brifingIste(pid);
      brifingIstendi(pid, sonMesajId);
      if (y.durum === "hazirlaniyor") bildir("bilgi", sozluk().brifing.zatenHazirlaniyor);
    });

  return (
    <button
      type="button"
      className="dugme dugme-kucuk brifing-dugme"
      onClick={iste}
      disabled={hazirlaniyor}
      aria-busy={hazirlaniyor || undefined}
      title={hazirlaniyor ? t.hazirlaniyorIpucu : t.dugmeIpucu}
    >
      {hazirlaniyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="plan" boyut={12} />}
      {hazirlaniyor ? t.hazirlaniyor : t.dugme}
    </button>
  );
}
