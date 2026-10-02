// Düz metinde @anma, T-12 görev kodu ve `satır içi kod` vurgulama
import { Fragment, memo, type ReactNode } from "react";
import { git } from "../durum/arayuz";
import { useVeri } from "../durum/veri";

const DESEN = /(`[^`\n]+`)|(@[\p{L}\p{N}_-]+)|(\bT-\d+\b)/gu;

export const ZenginMetin = memo(function ZenginMetin({ metin }: { metin: string }) {
  const gorevler = useVeri((d) => d.gorevler);
  const parcalar: ReactNode[] = [];
  let son = 0;
  let i = 0;
  for (const m of metin.matchAll(DESEN)) {
    const baslangic = m.index ?? 0;
    if (baslangic > son) parcalar.push(<Fragment key={i++}>{metin.slice(son, baslangic)}</Fragment>);
    const [tum, kod, anma, gorevKodu] = m;
    if (kod) {
      parcalar.push(
        <code key={i++} className="satir-ici-kod">
          {kod.slice(1, -1)}
        </code>,
      );
    } else if (anma) {
      parcalar.push(
        <span key={i++} className="anma">
          {anma}
        </span>,
      );
    } else if (gorevKodu) {
      const gorev = gorevler.find((g) => g.kod === gorevKodu);
      parcalar.push(
        gorev ? (
          <button
            key={i++}
            type="button"
            className="gorev-kodu"
            title={`${gorev.kod} · ${gorev.baslik}`}
            onClick={() => git("pano", { gorevId: gorev.id })}
          >
            {gorevKodu}
          </button>
        ) : (
          <code key={i++} className="gorev-kodu">
            {gorevKodu}
          </code>
        ),
      );
    } else {
      parcalar.push(<Fragment key={i++}>{tum}</Fragment>);
    }
    son = baslangic + tum.length;
  }
  if (son < metin.length) parcalar.push(<Fragment key={i++}>{metin.slice(son)}</Fragment>);
  return <>{parcalar}</>;
});
