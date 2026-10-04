// Öğe seçilince açılan not penceresi: öğenin küçük görüntüsü, seçicisi ve metni, not alanı, Kaydet.
// Sahnede seçilen öğenin yanına konur (sığmazsa altına, üstüne ya da ortaya); odak pencerede kalır.
// Ctrl/Cmd+Enter kaydeder, Esc vazgeçer.
import type { TarayiciSecimi } from "@arnorg/ortak";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { useSozluk } from "../../dil";
import { useIslem } from "../../yardimcilar/kancalar";
import { kisaAdres, notKonumu } from "../../yardimcilar/tarayiciAdresi";
import { DugmeYukleniyor } from "../Durumlar";
import { anaTus, kisayol } from "./katman";

const ODAKLANABILIR = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NotPenceresi({
  secim,
  sahne,
  cerceve,
  kaydet,
  vazgec,
}: {
  secim: TarayiciSecimi;
  /** Pencerenin konduğu alan (sahne) ve sayfanın durduğu çerçeve: öğenin sahnedeki yeri bunlardan hesaplanır */
  sahne: RefObject<HTMLDivElement | null>;
  cerceve: RefObject<HTMLDivElement | null>;
  kaydet: (not: string, yenisiniSec: boolean) => Promise<void>;
  vazgec: () => void;
}) {
  const s = useSozluk();
  const t = s.tarayici.not;
  const baslikId = useId();
  const notId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const alanRef = useRef<HTMLTextAreaElement>(null);
  const [not, setNot] = useState("");
  const [konum, setKonum] = useState<{ sol: number; ust: number } | null>(null);
  const { suruyor, calistir } = useIslem();
  const vazgecRef = useRef(vazgec);
  vazgecRef.current = vazgec;

  // Yer: pencerenin ölçüsü bilinince seçilen öğenin yanına
  useLayoutEffect(() => {
    const yerlestir = () => {
      const kutu = ref.current;
      const sh = sahne.current;
      const c = cerceve.current;
      if (!kutu || !sh || !c) return;
      const sr = sh.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const k = secim.kutu;
      const oge = { x: cr.left - sr.left + k.x, y: cr.top - sr.top + k.y, genislik: k.genislik, yukseklik: k.yukseklik };
      setKonum(notKonumu(oge, { genislik: kutu.offsetWidth, yukseklik: kutu.offsetHeight }, { genislik: sr.width, yukseklik: sr.height }));
    };
    yerlestir();
    window.addEventListener("resize", yerlestir);
    return () => window.removeEventListener("resize", yerlestir);
  }, [secim, sahne, cerceve]);

  useEffect(() => {
    alanRef.current?.focus();
  }, []);

  const gonder = (yenisiniSec: boolean) => {
    const temiz = not.trim();
    if (!temiz) {
      alanRef.current?.focus();
      return;
    }
    void calistir("kaydet", () => kaydet(temiz, yenisiniSec));
  };

  const tus = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      vazgecRef.current();
      return;
    }
    if (e.key === "Enter" && anaTus(e)) {
      e.preventDefault();
      gonder(e.shiftKey);
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const ogeler = Array.from(ref.current.querySelectorAll<HTMLElement>(ODAKLANABILIR));
    const bas = ogeler[0];
    const son = ogeler.at(-1);
    if (!bas || !son) return;
    if (e.shiftKey && document.activeElement === bas) {
      e.preventDefault();
      son.focus();
    } else if (!e.shiftKey && document.activeElement === son) {
      e.preventDefault();
      bas.focus();
    }
  };

  return (
    <>
      <div className="tarayici-not-perde" aria-hidden="true" />
      <div
        className="tarayici-not-penceresi"
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikId}
        ref={ref}
        onKeyDown={tus}
        style={konum ? { left: konum.sol, top: konum.ust } : { visibility: "hidden" }}
      >
        <h2 id={baslikId}>{t.baslik}</h2>
        <figure className="tarayici-not-onizleme">
          {secim.gorsel ? <img src={secim.gorsel} alt={t.gorselAlt} /> : <figcaption>{t.gorselYok}</figcaption>}
        </figure>
        <dl className="tarayici-not-bilgi">
          <div>
            <dt>{t.secici}</dt>
            <dd>
              <code>{secim.secici}</code>
            </dd>
          </div>
          {secim.ogeMetni ? (
            <div>
              <dt>{t.metin}</dt>
              <dd className="tarayici-not-alinti">{secim.ogeMetni}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t.sayfa}</dt>
            <dd className="tek-satir" title={secim.adres}>
              {kisaAdres(secim.adres)}
            </dd>
          </div>
          <div>
            <dt>{t.gorunum}</dt>
            <dd className="sayi">{s.tarayici.boyut(secim.gorunum.genislik, secim.gorunum.yukseklik)}</dd>
          </div>
        </dl>
        <div className="alan">
          <label htmlFor={notId}>{t.etiket}</label>
          <textarea
            id={notId}
            ref={alanRef}
            className="metin-alani"
            rows={3}
            maxLength={4000}
            placeholder={t.ipucu}
            value={not}
            onChange={(e) => setNot(e.target.value)}
          />
        </div>
        <div className="tarayici-not-eylem">
          <button type="button" className="dugme dugme-ana" disabled={!not.trim() || !!suruyor} onClick={() => gonder(false)}>
            <DugmeYukleniyor suruyor={!!suruyor}>{t.kaydet}</DugmeYukleniyor>
          </button>
          <button type="button" className="dugme" disabled={!not.trim() || !!suruyor} onClick={() => gonder(true)}>
            {t.kaydetVeSec}
          </button>
          <button type="button" className="dugme dugme-sessiz" onClick={() => vazgecRef.current()}>
            {s.genel.vazgec}
          </button>
        </div>
        <p className="tarayici-not-kisayol">{t.kisayol(kisayol("Enter"))}</p>
      </div>
    </>
  );
}
