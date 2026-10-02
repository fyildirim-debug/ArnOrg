// Organizasyon şeması: yoneticiId'ye göre ağaç
import { AJAN_DURUM_ADLARI, type Ajan } from "@arnorg/ortak";
import { useMemo } from "react";
import { AjanAvatar, DurumNoktasi, modelAdi } from "../Kisi";

interface Dugum {
  ajan: Ajan;
  astlar: Dugum[];
}

function agacKur(ajanlar: Ajan[]): Dugum[] {
  const kimlikler = new Set(ajanlar.map((a) => a.id));
  const astlar = new Map<string, Ajan[]>();
  const kokler: Ajan[] = [];
  for (const a of ajanlar) {
    if (a.yoneticiId && kimlikler.has(a.yoneticiId) && a.yoneticiId !== a.id) {
      const liste = astlar.get(a.yoneticiId) ?? [];
      liste.push(a);
      astlar.set(a.yoneticiId, liste);
    } else kokler.push(a);
  }
  // Döngüye karşı: her ajan yalnız bir kez yerleşir
  const yerlesen = new Set<string>();
  const kur = (a: Ajan): Dugum => {
    yerlesen.add(a.id);
    const altlar = (astlar.get(a.id) ?? []).filter((x) => !yerlesen.has(x.id));
    return { ajan: a, astlar: altlar.map(kur) };
  };
  const agac = kokler.sort((a, b) => (a.rol === "ceo" ? -1 : b.rol === "ceo" ? 1 : 0)).map(kur);
  // Döngüde kalmış ajanlar kök olarak eklenir
  for (const a of ajanlar) if (!yerlesen.has(a.id)) agac.push(kur(a));
  return agac;
}

export function OrgSemasi({ ajanlar, secili, sec }: { ajanlar: Ajan[]; secili: string | null; sec: (id: string) => void }) {
  const agac = useMemo(() => agacKur(ajanlar), [ajanlar]);
  const dal = (d: Dugum) => (
    <li key={d.ajan.id}>
      <button
        type="button"
        className="dugum"
        aria-pressed={secili === d.ajan.id}
        onClick={() => sec(d.ajan.id)}
        title={`${d.ajan.ad} · ${d.ajan.rolAdi} · ${modelAdi(d.ajan.model)} · ${AJAN_DURUM_ADLARI[d.ajan.durum]}`}
      >
        <span className="dugum-av">
          <AjanAvatar ajan={d.ajan} />
          <DurumNoktasi durum={d.ajan.durum} />
        </span>
        <b>{d.ajan.ad}</b>
        <small>{d.ajan.rolAdi}</small>
      </button>
      {d.astlar.length ? <ul>{d.astlar.map(dal)}</ul> : null}
    </li>
  );
  return (
    <div className="org-sar">
      <div className="org">
        <ul>{agac.map(dal)}</ul>
      </div>
    </div>
  );
}
