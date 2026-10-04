// İlk kurulum › hazırlık özeti: projenin CEO'su ve çalıştığı model, sürümlü adıyla ("Ada · Fable 5.1"). Tanım
// listesinin (dl.kv) bir satırıdır; CEO bulunamazsa hiçbir şey çizmez.
import type { Ajan } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { api } from "../api/uclar";
import { ModelAdi } from "./Kisi";

export function CeoModelSatiri({ projeId }: { projeId: string }) {
  const [ceo, setCeo] = useState<Ajan | null>(null);
  useEffect(() => {
    let iptal = false;
    api
      .ajanlar(projeId)
      .then((l) => {
        if (!iptal) setCeo(l.find((a) => a.rol === "ceo") ?? null);
      })
      .catch(() => undefined);
    return () => {
      iptal = true;
    };
  }, [projeId]);
  if (!ceo) return null;
  return (
    <>
      <dt>{ceo.rolAdi}</dt>
      <dd>
        {ceo.ad} · <ModelAdi model={ceo.model} />
      </dd>
    </>
  );
}
