// Düz metinde @anma, T-12 görev kodu, **kalın** ve `satır içi kod` vurgulama;
// ZenginBlok ayrıca ajan mesajlarındaki hafif markdown'ı (liste, başlık, kod bloğu) çizer
import { Fragment, memo, useMemo, type ReactNode } from "react";
import { git } from "../durum/arayuz";
import { useVeri } from "../durum/veri";

const DESEN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(@[\p{L}\p{N}_-]+)|(\bT-\d+\b)/gu;

export const ZenginMetin = memo(function ZenginMetin({ metin }: { metin: string }) {
  const gorevler = useVeri((d) => d.gorevler);
  const parcalar: ReactNode[] = [];
  let son = 0;
  let i = 0;
  for (const m of metin.matchAll(DESEN)) {
    const baslangic = m.index ?? 0;
    if (baslangic > son) parcalar.push(<Fragment key={i++}>{metin.slice(son, baslangic)}</Fragment>);
    const [tum, kod, kalin, anma, gorevKodu] = m;
    if (kalin) {
      parcalar.push(
        <strong key={i++}>
          <ZenginMetin metin={kalin.slice(2, -2)} />
        </strong>,
      );
    } else if (kod) {
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

type Blok =
  | { tur: "paragraf"; satirlar: string[] }
  | { tur: "liste"; sirali: boolean; ogeler: string[] }
  | { tur: "baslik"; metin: string }
  | { tur: "kod"; metin: string };

function bloklaraAyir(metin: string): Blok[] {
  const bloklar: Blok[] = [];
  let acik: Blok | null = null;
  let kodSatirlari: string[] | null = null;
  const kapat = () => {
    if (acik) bloklar.push(acik);
    acik = null;
  };
  for (const satir of metin.replace(/\r\n/g, "\n").split("\n")) {
    if (kodSatirlari) {
      if (/^\s*```/.test(satir)) {
        bloklar.push({ tur: "kod", metin: kodSatirlari.join("\n") });
        kodSatirlari = null;
      } else kodSatirlari.push(satir);
      continue;
    }
    if (/^\s*```/.test(satir)) {
      kapat();
      kodSatirlari = [];
      continue;
    }
    const baslik = /^#{1,6}\s+(.+)$/.exec(satir);
    const madde = /^\s*[-*\u2022]\s+(.+)$/.exec(satir);
    const sirali = /^\s*\d+[.)]\s+(.+)$/.exec(satir);
    if (!satir.trim()) {
      kapat();
    } else if (baslik) {
      kapat();
      bloklar.push({ tur: "baslik", metin: baslik[1]! });
    } else if (madde || sirali) {
      const sira = Boolean(sirali);
      const b = acik as Blok | null;
      if (!(b && b.tur === "liste" && b.sirali === sira)) {
        kapat();
        acik = { tur: "liste", sirali: sira, ogeler: [] };
      }
      (acik as unknown as { ogeler: string[] }).ogeler.push((madde ?? sirali)![1]!);
    } else {
      const b = acik as Blok | null;
      if (!(b && b.tur === "paragraf")) {
        kapat();
        acik = { tur: "paragraf", satirlar: [] };
      }
      (acik as unknown as { satirlar: string[] }).satirlar.push(satir);
    }
  }
  if (kodSatirlari) bloklar.push({ tur: "kod", metin: kodSatirlari.join("\n") });
  kapat();
  return bloklar;
}

export const ZenginBlok = memo(function ZenginBlok({ metin }: { metin: string }) {
  const bloklar = useMemo(() => bloklaraAyir(metin), [metin]);
  return (
    <div className="zengin">
      {bloklar.map((b, i) => {
        if (b.tur === "baslik")
          return (
            <p key={i} className="zengin-baslik">
              <ZenginMetin metin={b.metin} />
            </p>
          );
        if (b.tur === "kod")
          return (
            <pre key={i}>
              <code>{b.metin}</code>
            </pre>
          );
        if (b.tur === "liste") {
          const Etiket = b.sirali ? "ol" : "ul";
          return (
            <Etiket key={i}>
              {b.ogeler.map((o, j) => (
                <li key={j}>
                  <ZenginMetin metin={o} />
                </li>
              ))}
            </Etiket>
          );
        }
        return (
          <p key={i}>
            {b.satirlar.map((s, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                <ZenginMetin metin={s} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
});
