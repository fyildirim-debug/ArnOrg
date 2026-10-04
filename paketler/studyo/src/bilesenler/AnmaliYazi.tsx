// @ ile ajan anma önerili metin alanı
import type { Ajan } from "@arnorg/ortak";
import { useRef, useState, type KeyboardEvent } from "react";
import { useSozluk } from "../dil";
import { AjanAvatar } from "./Kisi";

const ANMA = /@([\p{L}\p{N}_-]*)$/u;

export function AnmaliYazi({
  deger,
  degistir,
  gonder,
  ajanlar,
  placeholder,
  etiket,
  id,
  devreDisi,
}: {
  deger: string;
  degistir: (v: string) => void;
  gonder: () => void;
  ajanlar: Ajan[];
  placeholder: string;
  etiket: string;
  id: string;
  devreDisi?: boolean;
}) {
  const s = useSozluk();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sorgu, setSorgu] = useState<string | null>(null);
  const [secili, setSecili] = useState(0);

  const oneriler =
    sorgu === null
      ? []
      : ajanlar
          .filter((a) => a.ad.toLocaleLowerCase("tr-TR").startsWith(sorgu.toLocaleLowerCase("tr-TR")))
          .slice(0, 6);

  const sorguyuGuncelle = (metin: string, imlec: number) => {
    const m = ANMA.exec(metin.slice(0, imlec));
    setSorgu(m ? (m[1] ?? "") : null);
    setSecili(0);
  };

  const ekle = (a: Ajan) => {
    const t = ref.current;
    if (!t) return;
    const imlec = t.selectionStart;
    const once = deger.slice(0, imlec).replace(ANMA, `@${a.ad} `);
    const yeni = once + deger.slice(imlec);
    degistir(yeni);
    setSorgu(null);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(once.length, once.length);
    });
  };

  const tus = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (oneriler.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSecili((s) => (s + 1) % oneriler.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSecili((s) => (s - 1 + oneriler.length) % oneriler.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const a = oneriler[secili];
        if (a) ekle(a);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSorgu(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      gonder();
    }
  };

  return (
    <div className="anmali">
      <label htmlFor={id} className="gizli">
        {etiket}
      </label>
      <textarea
        id={id}
        ref={ref}
        className="metin-alani"
        rows={1}
        value={deger}
        disabled={devreDisi}
        placeholder={placeholder}
        onChange={(e) => {
          degistir(e.target.value);
          sorguyuGuncelle(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={tus}
        onBlur={() => setTimeout(() => setSorgu(null), 120)}
        role="combobox"
        aria-expanded={oneriler.length > 0}
        aria-controls={`${id}-oneri`}
        aria-autocomplete="list"
        aria-activedescendant={oneriler.length ? `${id}-oneri-${secili}` : undefined}
      />
      {oneriler.length ? (
        <ul className="anma-oneri" id={`${id}-oneri`} role="listbox" aria-label={s.bilesenler.anmaOneri}>
          {oneriler.map((a, i) => (
            <li
              key={a.id}
              id={`${id}-oneri-${i}`}
              role="option"
              aria-selected={i === secili}
              onMouseDown={(e) => {
                e.preventDefault();
                ekle(a);
              }}
              onMouseEnter={() => setSecili(i)}
            >
              <AjanAvatar ajan={a} boyut="xs" />
              <b>{a.ad}</b>
              <small>{a.rolAdi}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
