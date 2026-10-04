// Pano kartı
import type { Gorev } from "@arnorg/ortak";
import { memo } from "react";
import { useSozluk } from "../../dil";
import { useVeri } from "../../durum/veri";
import { useIslem } from "../../yardimcilar/kancalar";
import { AjanAvatar } from "../Kisi";
import { acikBagimliliklar, durumDegistir, sonrakiDurum } from "./gorevYardimcilari";

export const GorevKarti = memo(function GorevKarti({
  gorev,
  ac,
  surukle,
}: {
  gorev: Gorev;
  ac: (id: string) => void;
  surukle: (id: string | null) => void;
}) {
  const s = useSozluk();
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === gorev.atananId));
  const gorevler = useVeri((d) => d.gorevler);
  const bagli = acikBagimliliklar(gorev, gorevler);
  const sonraki = sonrakiDurum(gorev.durum);
  const { suruyor, calistir } = useIslem();

  return (
    <li
      className={`bilet${gorev.durum === "iptal" ? " bilet-iptal" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", gorev.id);
        e.dataTransfer.effectAllowed = "move";
        surukle(gorev.id);
      }}
      onDragEnd={() => surukle(null)}
    >
      <button type="button" className="bilet-ac" onClick={() => ac(gorev.id)} aria-label={s.pano.kart.ayrintiAc(gorev.kod, gorev.baslik)}>
        <span className="bilet-ust">
          <code>{gorev.kod}</code>
          {gorev.etiket ? <span>{gorev.etiket}</span> : null}
        </span>
        <b>{gorev.baslik}</b>
        {bagli.length ? (
          <small className="bilet-not" title={s.pano.kart.bagliIpucu}>
            {s.pano.kart.bagli(bagli.map((b) => b.kod).join(", "))}
          </small>
        ) : null}
      </button>
      <div className="bilet-alt">
        {ajan ? (
          <>
            <AjanAvatar ajan={ajan} boyut="xs" />
            <span className="tek-satir">{ajan.ad}</span>
          </>
        ) : (
          <span className="soluk">{s.pano.atanmadi}</span>
        )}
        {sonraki ? (
          <button
            type="button"
            className="ilerlet"
            disabled={suruyor !== null}
            onClick={() => void calistir("ilerlet", () => durumDegistir(gorev, sonraki))}
            aria-label={s.pano.kart.tasi(gorev.kod, s.genel.gorevDurumu[sonraki])}
          >
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            {s.genel.gorevDurumu[sonraki]} →
          </button>
        ) : null}
      </div>
    </li>
  );
});
