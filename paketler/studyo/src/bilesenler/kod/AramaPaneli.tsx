// Proje geneli arama (çekirdekte ripgrep): sonuçlar dosyaya göre gruplanır
import type { AramaSonucu } from "@arnorg/ortak";
import { useEffect, useMemo, useRef, useState } from "react";
import { hataMetni } from "../../api/istek";
import { api } from "../../api/uclar";
import { dosyaAdi } from "../../yardimcilar/bicim";
import { Simge } from "../Simge";

export function AramaPaneli({ projeId, alan, ac }: { projeId: string; alan: string; ac: (yol: string, satir: number) => void }) {
  const [q, setQ] = useState("");
  const [sonuclar, setSonuclar] = useState<AramaSonucu[] | null>(null);
  const [suruyor, setSuruyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const girdiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    girdiRef.current?.focus();
  }, []);

  useEffect(() => {
    const temiz = q.trim();
    if (temiz.length < 2) {
      setSonuclar(null);
      setHata(null);
      return;
    }
    const iptal = new AbortController();
    const z = setTimeout(() => {
      setSuruyor(true);
      api
        .ara(projeId, alan, temiz, iptal.signal)
        .then((s) => {
          setSonuclar(s);
          setHata(null);
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) setHata(hataMetni(e));
        })
        .finally(() => setSuruyor(false));
    }, 280);
    return () => {
      clearTimeout(z);
      iptal.abort();
    };
  }, [q, projeId, alan]);

  const gruplar = useMemo(() => {
    const m = new Map<string, AramaSonucu[]>();
    for (const s of sonuclar ?? []) {
      const l = m.get(s.yol) ?? [];
      l.push(s);
      m.set(s.yol, l);
    }
    return [...m.entries()];
  }, [sonuclar]);

  const vurgula = (metin: string) => {
    const temiz = q.trim();
    const i = metin.toLocaleLowerCase("tr-TR").indexOf(temiz.toLocaleLowerCase("tr-TR"));
    const kirp = metin.trim();
    if (i < 0) return kirp;
    const bas = metin.length - metin.trimStart().length;
    const goreli = i - bas;
    if (goreli < 0) return kirp;
    return (
      <>
        {kirp.slice(0, goreli)}
        <mark>{kirp.slice(goreli, goreli + temiz.length)}</mark>
        {kirp.slice(goreli + temiz.length)}
      </>
    );
  };

  return (
    <div className="e-arama">
      <div className="arama-kutu">
        <Simge ad="ara" boyut={13} />
        <input
          ref={girdiRef}
          className="girdi"
          type="search"
          aria-label="Çalışma alanında ara"
          placeholder="Ara (en az 2 karakter)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          spellCheck={false}
        />
      </div>
      <p className="e-arama-durum" role="status">
        {suruyor ? "Aranıyor…" : hata ? hata : sonuclar ? `${sonuclar.length}${sonuclar.length >= 500 ? "+" : ""} sonuç · ${gruplar.length} dosya` : "Düzenli ifade desteklenir."}
      </p>
      <ul className="e-arama-sonuc">
        {gruplar.map(([yol, liste]) => (
          <li key={yol}>
            <p className="e-arama-dosya" title={yol}>
              <span className="tek-satir">{dosyaAdi(yol)}</span>
              <small className="tek-satir">{yol}</small>
            </p>
            <ul>
              {liste.map((s) => (
                <li key={`${s.satir}-${s.metin.slice(0, 20)}`}>
                  <button type="button" className="e-arama-satir" onClick={() => ac(s.yol, s.satir)}>
                    <span className="sayi">{s.satir}</span>
                    <code className="tek-satir">{vurgula(s.metin)}</code>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
