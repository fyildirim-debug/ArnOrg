// Çalışma alanı dosya ağacı: klasör aç/kapa, M/A/D işaretleri
import type { DosyaDegisikligi, DosyaDugumu } from "@arnorg/ortak";
import { memo, useMemo } from "react";
import { Simge } from "./Simge";

const DEGISIKLIK_ADLARI: Record<DosyaDegisikligi, string> = {
  M: "Değişti",
  A: "Eklendi",
  D: "Silindi",
  "?": "İzlenmiyor",
};

/** Değişiklik içeren klasör yolları */
function degisenKlasorler(kok: DosyaDugumu | null): Set<string> {
  const s = new Set<string>();
  const gez = (d: DosyaDugumu): boolean => {
    if (d.tur === "dosya") return !!d.degisiklik;
    let var_ = false;
    for (const c of d.cocuklar ?? []) if (gez(c)) var_ = true;
    if (var_) s.add(d.yol);
    return var_;
  };
  if (kok) gez(kok);
  return s;
}

/** Açılışta değişiklik içeren klasörler ve ilk düzey açık gelir */
export function baslangicKlasorleri(kok: DosyaDugumu | null): Set<string> {
  const s = degisenKlasorler(kok);
  for (const c of kok?.cocuklar ?? []) if (c.tur === "klasor" && (kok?.cocuklar?.length ?? 0) < 8) s.add(c.yol);
  return s;
}

function sirala(a: DosyaDugumu, b: DosyaDugumu) {
  if (a.tur !== b.tur) return a.tur === "klasor" ? -1 : 1;
  return a.ad.localeCompare(b.ad, "tr");
}

export const DosyaAgaci = memo(function DosyaAgaci({
  kok,
  aktifYol,
  ac,
  acikKlasorler,
  klasorDegistir,
  canliYollar,
}: {
  kok: DosyaDugumu;
  aktifYol: string | null;
  ac: (yol: string) => void;
  acikKlasorler: Set<string>;
  klasorDegistir: (yol: string) => void;
  /** Son birkaç saniyede bir ajanın değiştirdiği dosyalar */
  canliYollar: Set<string>;
}) {
  const degisen = useMemo(() => degisenKlasorler(kok), [kok]);

  const ciz = (d: DosyaDugumu, derinlik: number): React.ReactNode => {
    if (d.tur === "klasor") {
      const acik = acikKlasorler.has(d.yol);
      return (
        <li key={d.yol} role="treeitem" aria-expanded={acik} aria-selected={false}>
          <button type="button" className="a-klasor" style={{ "--d": derinlik } as React.CSSProperties} onClick={() => klasorDegistir(d.yol)}>
            <Simge ad={acik ? "asagi" : "sag"} boyut={11} />
            <span className="tek-satir">{d.ad}</span>
            {!acik && degisen.has(d.yol) ? <i className="a-nokta" aria-label="Değişiklik içeriyor" /> : null}
          </button>
          {acik ? <ul role="group">{(d.cocuklar ?? []).slice().sort(sirala).map((c) => ciz(c, derinlik + 1))}</ul> : null}
        </li>
      );
    }
    const aktif = d.yol === aktifYol;
    return (
      <li key={d.yol} role="treeitem" aria-selected={aktif}>
        <button
          type="button"
          className={`a-dosya${aktif ? " a-aktif" : ""}${canliYollar.has(d.yol) ? " a-canli" : ""}${d.degisiklik === "D" ? " a-silindi" : ""}`}
          style={{ "--d": derinlik } as React.CSSProperties}
          onClick={() => ac(d.yol)}
          title={d.yol}
          disabled={d.degisiklik === "D"}
        >
          <span className="tek-satir">{d.ad}</span>
          {d.degisiklik ? (
            <span className={`a-durum a-durum-${d.degisiklik === "?" ? "yeni" : d.degisiklik}`} title={DEGISIKLIK_ADLARI[d.degisiklik]}>
              {d.degisiklik === "?" ? "U" : d.degisiklik}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <ul className="e-agac-liste" role="tree" aria-label="Dosyalar">
      {(kok.cocuklar ?? []).slice().sort(sirala).map((c) => ciz(c, 0))}
    </ul>
  );
});
