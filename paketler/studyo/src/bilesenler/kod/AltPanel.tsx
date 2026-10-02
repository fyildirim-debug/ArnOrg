// Editörün alt paneli: Terminal, Sorunlar (Monaco işaretleri), Çıktı
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { saatSaniye } from "../../yardimcilar/bicim";
import { Simge } from "../Simge";
import type { monaco } from "./monacoKurulum";
import { TerminalPaneli } from "./TerminalPaneli";

export type AltSekme = "terminal" | "sorunlar" | "cikti";

export interface CiktiSatiri {
  id: number;
  zaman: string;
  metin: string;
}

const ONEM_ADLARI: Record<number, string> = { 8: "Hata", 4: "Uyarı", 2: "Bilgi", 1: "İpucu" };

export function AltPanel({
  projeId,
  alan,
  sekme,
  setSekme,
  acik,
  setAcik,
  yukseklik,
  setYukseklik,
  sorunlar,
  sorunAc,
  cikti,
  gunluk,
  dosyaAdi,
}: {
  projeId: string;
  alan: string;
  sekme: AltSekme;
  setSekme: (s: AltSekme) => void;
  acik: boolean;
  setAcik: (a: boolean) => void;
  yukseklik: number;
  setYukseklik: (y: number) => void;
  sorunlar: monaco.editor.IMarker[];
  sorunAc: (m: monaco.editor.IMarker) => void;
  cikti: CiktiSatiri[];
  gunluk: (metin: string) => void;
  dosyaAdi: string | null;
}) {
  const surukle = useRef<{ y: number; h: number } | null>(null);
  const hataSayisi = sorunlar.filter((m) => m.severity === 8).length;

  const tutamacBas = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    surukle.current = { y: e.clientY, h: yukseklik };
  };
  const tutamacOynat = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!surukle.current) return;
    const yeni = surukle.current.h - (e.clientY - surukle.current.y);
    setYukseklik(Math.max(96, Math.min(window.innerHeight * 0.7, yeni)));
  };
  const tutamacBirak = () => {
    surukle.current = null;
  };

  const sekmeDugmesi = (s: AltSekme, ad: string, ek?: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={acik && sekme === s}
      className={acik && sekme === s ? "e-alt-aktif" : undefined}
      onClick={() => {
        if (acik && sekme === s) setAcik(false);
        else {
          setSekme(s);
          setAcik(true);
        }
      }}
    >
      {ad}
      {ek}
    </button>
  );

  return (
    <div className={`e-alt${acik ? "" : " e-alt-kapali"}`} style={acik ? { height: yukseklik } : undefined}>
      {acik ? (
        <div
          className="e-alt-tutamac"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Paneli boyutlandır"
          tabIndex={0}
          onPointerDown={tutamacBas}
          onPointerMove={tutamacOynat}
          onPointerUp={tutamacBirak}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") setYukseklik(Math.min(window.innerHeight * 0.7, yukseklik + 24));
            if (e.key === "ArrowDown") setYukseklik(Math.max(96, yukseklik - 24));
          }}
        />
      ) : null}
      <div className="e-alt-sekmeler" role="tablist" aria-label="Alt panel">
        {sekmeDugmesi("terminal", "Terminal")}
        {sekmeDugmesi("sorunlar", "Sorunlar", <b className={hataSayisi ? undefined : "sifir"}>{sorunlar.length}</b>)}
        {sekmeDugmesi("cikti", "Çıktı")}
        <button
          type="button"
          className="e-alt-kapat"
          onClick={() => setAcik(!acik)}
          aria-label={acik ? "Paneli gizle" : "Paneli göster"}
          title={acik ? "Paneli gizle" : "Paneli göster"}
        >
          <Simge ad={acik ? "asagi" : "sag"} boyut={12} />
        </button>
      </div>
      <div className="e-alt-govde" hidden={!acik}>
        <div hidden={sekme !== "terminal"} className="e-alt-pano">
          <TerminalPaneli projeId={projeId} alan={alan} gorunur={acik && sekme === "terminal"} gunluk={gunluk} />
        </div>
        <div hidden={sekme !== "sorunlar"} className="e-alt-pano e-alt-kaydir">
          {sorunlar.length ? (
            <ul className="e-sorunlar">
              {sorunlar.map((m, i) => (
                <li key={i}>
                  <button type="button" onClick={() => sorunAc(m)}>
                    <span className={`e-onem e-onem-${m.severity}`}>{ONEM_ADLARI[m.severity] ?? "Not"}</span>
                    <span className="e-sorun-metin">{m.message}</span>
                    <small>
                      {dosyaAdi} · satır {m.startLineNumber}, sütun {m.startColumn}
                      {m.source ? ` · ${m.source}` : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="e-bos">{dosyaAdi ? "Bu dosyada sorun yok. (Sözdizimi denetlenir; proje bağlamı olmadığından tür denetimi kapalı.)" : "Açık dosya yok."}</p>
          )}
        </div>
        <div hidden={sekme !== "cikti"} className="e-alt-pano e-alt-kaydir">
          {cikti.length ? (
            <ol className="e-cikti">
              {cikti.map((c) => (
                <li key={c.id}>
                  <time>{saatSaniye(c.zaman)}</time> {c.metin}
                </li>
              ))}
            </ol>
          ) : (
            <p className="e-bos">Kaydetme, ajan düzenlemeleri ve terminal olayları burada günlüğe düşer.</p>
          )}
        </div>
      </div>
    </div>
  );
}
