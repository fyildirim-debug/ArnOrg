// Pano kartlarındaki kısa "kaydedildi" işareti: gorev.kaydedildi olayı (yardimcilar/gorevKaydi.ts) gelince görev birkaç
// saniye işaretli kalır. İşaret görev kimliğiyle, olayda yalnız kod varsa koduyla tutulur.
import { useEffect, useState } from "react";
import { olaylariDinle } from "../../api/canli";
import { gorevKaydiOku } from "../../yardimcilar/gorevKaydi";

/** İşaretin kartta kaldığı süre (stil canli.css'te aynı sürede söner) */
export const ISARET_SURESI = 4600;

export interface KayitIsareti {
  an: number;
  ozet: string | null;
}

export function useKayitIsaretleri(projeId: string | null): ReadonlyMap<string, KayitIsareti> {
  const [isaretler, setIsaretler] = useState<ReadonlyMap<string, KayitIsareti>>(() => new Map());
  useEffect(() => {
    const zamanlayicilar = new Set<ReturnType<typeof setTimeout>>();
    const birak = olaylariDinle((olay) => {
      const k = gorevKaydiOku(olay);
      if (!k || (k.projeId && projeId && k.projeId !== projeId)) return;
      const anahtar = k.gorevId ?? k.kod;
      if (!anahtar) return;
      const isaret: KayitIsareti = { an: Date.now(), ozet: k.ozet };
      setIsaretler((m) => new Map(m).set(anahtar, isaret));
      const z = setTimeout(() => {
        zamanlayicilar.delete(z);
        // Arada yeniden kaydedildiyse yenisi kalır
        setIsaretler((m) => {
          if (m.get(anahtar) !== isaret) return m;
          const y = new Map(m);
          y.delete(anahtar);
          return y;
        });
      }, ISARET_SURESI);
      zamanlayicilar.add(z);
    });
    return () => {
      birak();
      for (const z of zamanlayicilar) clearTimeout(z);
      setIsaretler(new Map());
    };
  }, [projeId]);
  return isaretler;
}
