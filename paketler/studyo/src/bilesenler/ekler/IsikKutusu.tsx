// Işık kutusu: mesajın görselleri ekranı kaplar. Esc kapatır, ← → (ve Home, End) görseller arasında gezer, dokunmatik
// ekranda kaydırmak da gezer. Görsel ekrana sığar; görsele tıklamak ya da "Gerçek boyut" doğal boyutuna geçirir (kaydırılır).
// Odak pencerede kalır, kapanınca açan küçük resme döner (MesajEkleri). Hareket azaltılınca giriş hareketi yok.
import type { MesajEki } from "@arnorg/ortak";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useSozluk } from "../../dil";
import { ekBoyutu } from "../../yardimcilar/ekler";
import { Simge } from "../Simge";
import { ekIndir, gorselAdresi } from "./ekDosyasi";
import { EkSimgesi } from "./EkSimgesi";
import { ekHatasi } from "./taslak";

const ODAKLANABILIR = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function IsikKutusu({ gorseller, baslangic, kapat }: { gorseller: MesajEki[]; baslangic: number; kapat: () => void }) {
  const s = useSozluk().ekler;
  const t = s.isik;
  const n = gorseller.length;
  const [sira, setSira] = useState(Math.min(Math.max(baslangic, 0), n - 1));
  const [yakin, setYakin] = useState(false);
  const [adres, setAdres] = useState<string | null>(null);
  const [hata, setHata] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const kapatRef = useRef(kapat);
  kapatRef.current = kapat;
  const ek = gorseller[sira]!;

  const gec = useCallback(
    (adim: number) => {
      if (n < 2) return;
      setSira((x) => (x + adim + n) % n);
      setYakin(false);
    },
    [n],
  );

  // Görsel önbellekten ya da çekirdekten
  useEffect(() => {
    let canli = true;
    setAdres(null);
    setHata(false);
    void gorselAdresi(ek).then((a) => {
      if (!canli) return;
      if (a) setAdres(a);
      else setHata(true);
    });
    return () => {
      canli = false;
    };
  }, [ek]);

  // Odak pencereye girer ve içinde kalır; tuşlar öteki dinleyicilerden önce işlenir
  useEffect(() => {
    const kutu = ref.current;
    kutu?.querySelector<HTMLElement>("[data-ilk-odak]")?.focus();
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        kapatRef.current();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        gec(e.key === "ArrowLeft" ? -1 : 1);
      } else if ((e.key === "Home" || e.key === "End") && n > 1) {
        e.preventDefault();
        setSira(e.key === "Home" ? 0 : n - 1);
        setYakin(false);
      } else if (e.key === "Tab" && kutu) {
        const ogeler = Array.from(kutu.querySelectorAll<HTMLElement>(ODAKLANABILIR)).filter((o) => o.offsetParent !== null);
        if (!ogeler.length) return;
        const bas = ogeler[0]!;
        const son = ogeler[ogeler.length - 1]!;
        const etkin = document.activeElement;
        if (e.shiftKey && (etkin === bas || !kutu.contains(etkin))) {
          e.preventDefault();
          son.focus();
        } else if (!e.shiftKey && (etkin === son || !kutu.contains(etkin))) {
          e.preventDefault();
          bas.focus();
        }
      }
    };
    document.addEventListener("keydown", tus, true);
    return () => document.removeEventListener("keydown", tus, true);
  }, [gec, n]);

  // Dokunmatik kaydırma: yatay 50 px'ten uzun hareket önceki ya da sonraki görsele geçer (yakınlaştırılmışken kaydırma görselindir)
  const dokunus = useRef<{ x: number; y: number } | null>(null);
  const basildi = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") dokunus.current = { x: e.clientX, y: e.clientY };
  };
  const birakildi = (e: PointerEvent) => {
    const d = dokunus.current;
    dokunus.current = null;
    if (!d || yakin) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - d.y)) gec(dx > 0 ? -1 : 1);
  };

  const indir = () => {
    if (indiriliyor) return;
    setIndiriliyor(true);
    ekIndir(ek)
      .catch(ekHatasi)
      .finally(() => setIndiriliyor(false));
  };

  const boyut = ek.genislik && ek.yukseklik ? `${ek.genislik}×${ek.yukseklik} · ` : "";
  return createPortal(
    <div className="isik" role="dialog" aria-modal="true" aria-label={t.etiket(ek.ad)} ref={ref}>
      <div className="isik-ust">
        <div className="isik-kim">
          <b className="tek-satir" title={ek.ad}>
            {ek.ad}
          </b>
          <span className="sayi">
            {boyut}
            {ekBoyutu(ek.boyut)}
          </span>
        </div>
        {n > 1 ? (
          <span className="isik-sira sayi" aria-live="polite">
            {t.sira(sira + 1, n)}
          </span>
        ) : null}
        <div className="isik-eylem">
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setYakin((y) => !y)} aria-pressed={yakin} disabled={!adres}>
            {yakin ? <Simge ad="sigdir" boyut={12} /> : <EkSimgesi ad="buyut" boyut={12} />}
            <span className="isik-gizle-dar">{yakin ? t.sigdir : t.gercekBoyut}</span>
          </button>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={indir} aria-label={s.indirIpucu(ek.ad)} title={s.indirIpucu(ek.ad)}>
            {indiriliyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="indir" boyut={12} />}
            <span className="isik-gizle-dar">{t.indir}</span>
          </button>
          <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={() => kapatRef.current()} aria-label={t.kapat} title={t.kapat} data-ilk-odak>
            <Simge ad="kapat" boyut={14} />
          </button>
        </div>
      </div>
      <div
        className="isik-sahne"
        data-yakin={yakin ? "" : undefined}
        onPointerDown={basildi}
        onPointerUp={birakildi}
        onPointerCancel={() => (dokunus.current = null)}
        onClick={(e) => {
          // Görselin dışına tıklamak kapatır
          if (e.target === e.currentTarget && !yakin) kapatRef.current();
        }}
      >
        {hata ? (
          <p className="isik-yok">
            <EkSimgesi ad="gorsel" boyut={20} />
            {s.gorselAlinamadi}
          </p>
        ) : adres ? (
          <img key={ek.id} src={adres} alt={ek.ad} draggable={false} onClick={() => setYakin((y) => !y)} data-yakin={yakin ? "" : undefined} />
        ) : (
          <span className="doner isik-doner" aria-hidden="true" />
        )}
      </div>
      {n > 1 ? (
        <>
          <button type="button" className="isik-gec isik-onceki" onClick={() => gec(-1)} aria-label={t.onceki} title={t.onceki}>
            <Simge ad="sol" />
          </button>
          <button type="button" className="isik-gec isik-sonraki" onClick={() => gec(1)} aria-label={t.sonraki} title={t.sonraki}>
            <Simge ad="sag" />
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
