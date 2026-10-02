// Pano kartı
import { GOREV_DURUM_ADLARI, type Gorev } from "@arnorg/ortak";
import { memo } from "react";
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
      <button type="button" className="bilet-ac" onClick={() => ac(gorev.id)} aria-label={`${gorev.kod} ${gorev.baslik} ayrıntılarını aç`}>
        <span className="bilet-ust">
          <code>{gorev.kod}</code>
          {gorev.etiket ? <span>{gorev.etiket}</span> : null}
        </span>
        <b>{gorev.baslik}</b>
        {bagli.length ? (
          <small className="bilet-not" title="Bu görev, bağımlılıkları bitmeden Çalışılıyor'a geçemez">
            Bağlı: {bagli.map((b) => b.kod).join(", ")}
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
          <span className="soluk">Atanmadı</span>
        )}
        {sonraki ? (
          <button
            type="button"
            className="ilerlet"
            disabled={suruyor !== null}
            onClick={() => void calistir("ilerlet", () => durumDegistir(gorev, sonraki))}
            aria-label={`${gorev.kod} görevini ${GOREV_DURUM_ADLARI[sonraki]} durumuna taşı`}
          >
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            {GOREV_DURUM_ADLARI[sonraki]} →
          </button>
        ) : null}
      </div>
    </li>
  );
});
