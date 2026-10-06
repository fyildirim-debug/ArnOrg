// Pano kartı. data-flip: sütun değiştirince eski yerinden kayarak gelir (Pano'daki useFlip); kaydedildi: görev az önce
// kaydedildiyse birkaç saniye küçük onay işareti; görevde token işlendiyse (0.0.10) üst satırda kısa sayısı
import type { Gorev } from "@arnorg/ortak";
import { memo } from "react";
import { useSozluk } from "../../dil";
import { useVeri } from "../../durum/veri";
import { kisaToken, sayi } from "../../yardimcilar/bicim";
import { useIslem } from "../../yardimcilar/kancalar";
import { AjanAvatar } from "../Kisi";
import { acikBagimliliklar, durumDegistir, sonrakiDurum } from "./gorevYardimcilari";
import type { KayitIsareti } from "./kayitIsaretleri";

export const GorevKarti = memo(function GorevKarti({
  gorev,
  ac,
  surukle,
  kaydedildi,
}: {
  gorev: Gorev;
  ac: (id: string) => void;
  surukle: (id: string | null) => void;
  kaydedildi?: KayitIsareti;
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
      data-flip={gorev.id}
      data-kayit={kaydedildi ? "" : undefined}
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
          {kaydedildi ? (
            <span key={kaydedildi.an} className="bilet-kayit" title={s.canli.pano.kaydedildiIpucu(gorev.kod, kaydedildi.ozet)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 8.5 3.25 3.25L13 5" />
              </svg>
              {s.canli.pano.kaydedildi}
            </span>
          ) : gorev.etiket ? (
            <span className="tek-satir">{gorev.etiket}</span>
          ) : null}
          {gorev.token ? (
            <span className="bilet-token sayi" title={s.butce.gorev.tokenBaslik(`${sayi(gorev.token)} ${s.genel.tokenBirimi(gorev.token)}`, null)}>
              {kisaToken(gorev.token)}
            </span>
          ) : null}
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
