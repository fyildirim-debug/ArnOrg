// Düzeltme notunun küçük ekran görüntüsü: çekirdekten anahtarlı istekle alınır, nesne adresiyle gösterilir.
// Görüntü bir kez yazılır ve değişmez; aynı notun görüntüsü oturum boyunca bir kez indirilir.
import type { Duzeltme } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { api } from "../../api/uclar";
import { useSozluk } from "../../dil";

const onbellek = new Map<string, Promise<string | null>>();

function gorselAdresi(id: string): Promise<string | null> {
  let s = onbellek.get(id);
  if (!s) {
    s = api.duzeltmeGorseli(id).then(
      // Tür başlığı ne gelirse gelsin görüntü PNG'dir
      ({ veri }) => URL.createObjectURL(veri.type === "image/png" ? veri : new Blob([veri], { type: "image/png" })),
      () => {
        // Alınamadıysa sonraki çizimde yeniden denensin
        onbellek.delete(id);
        return null;
      },
    );
    onbellek.set(id, s);
  }
  return s;
}

export function DuzeltmeGorseli({ duzeltme }: { duzeltme: Duzeltme }) {
  const s = useSozluk();
  const [adres, setAdres] = useState<string | null>(null);
  const var_ = !!duzeltme.gorsel;

  useEffect(() => {
    if (!var_) return;
    let canli = true;
    void gorselAdresi(duzeltme.id).then((a) => {
      if (canli) setAdres(a);
    });
    return () => {
      canli = false;
    };
  }, [duzeltme.id, var_]);

  if (!var_) {
    return (
      <span className="tarayici-not-gorsel tarayici-not-gorsel-yok" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 1.5h6l3 3v10h-9z" />
          <path d="M5.5 8h5M5.5 10.5h3.5" />
        </svg>
      </span>
    );
  }
  return adres ? (
    <img className="tarayici-not-gorsel" src={adres} alt={s.tarayici.not.gorselAlt} loading="lazy" decoding="async" />
  ) : (
    <span className="tarayici-not-gorsel tarayici-not-gorsel-bekliyor" aria-hidden="true" />
  );
}
