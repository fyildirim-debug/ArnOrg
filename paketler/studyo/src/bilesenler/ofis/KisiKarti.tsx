// Ofiste kişi kartı: çalışana basınca yanında açılır; konumunu ofis motoru her karede yazar (kartBagla). Kim olduğu,
// durumu, şu an ne yaptığı ve üzerindeki görev; hızlı eylemler: takip, mesaj (kartın içinde), görevi panoda açma ve
// ayrıntılar (çekmece). Escape kartı kapatır, odak kişiye döner; mesaj yazarken de.
import type { Ajan } from "@arnorg/ortak";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useSozluk } from "../../dil";
import { git } from "../../durum/arayuz";
import { useVeri } from "../../durum/veri";
import { useSimdi } from "../../yardimcilar/kancalar";
import { MesajFormu } from "../ajan/AjanEylemleri";
import { AjanAvatar } from "../Kisi";
import { Simge } from "../Simge";
import "../../stiller/canli.css";

export function KisiKarti({
  ajan,
  kokRef,
  etkinlik,
  takipte,
  takip,
  ayrinti,
  kapat,
}: {
  ajan: Ajan;
  kokRef: RefObject<HTMLDivElement | null>;
  /** Kişinin o anki etkinliği (motordan; saniyede bir okunur) */
  etkinlik: () => string;
  takipte: boolean;
  takip: () => void;
  ayrinti: () => void;
  kapat: () => void;
}) {
  const s = useSozluk();
  const t = s.canli.kart;
  const [mesajAcik, setMesajAcik] = useState(false);
  const ilkRef = useRef<HTMLButtonElement>(null);
  // Üzerindeki görev: ajanın görevi, yoksa çalıştığı atanmış görev
  const gorev = useVeri((d) => d.gorevler.find((g) => g.id === ajan.gorevId) ?? d.gorevler.find((g) => g.atananId === ajan.id && g.durum === "calisiliyor"));
  useSimdi(1000);

  // Kart açılınca (ya da başka kişiye geçince) odak ilk eyleme
  useEffect(() => {
    setMesajAcik(false);
    ilkRef.current?.focus({ preventScroll: true });
  }, [ajan.id]);

  return (
    <div
      className="ofis-kart"
      ref={kokRef}
      role="dialog"
      aria-label={t.etiket(ajan.ad)}
      data-kamera-disi
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        kapat();
      }}
    >
      <div className="ofis-kart-ust">
        <AjanAvatar ajan={ajan} boyut="s" />
        <div className="ofis-kart-kim">
          <b className="tek-satir">{ajan.ad}</b>
          <small className="tek-satir">{ajan.rolAdi}</small>
        </div>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={kapat} aria-label={t.kapat} title={t.kapat}>
          <Simge ad="kapat" boyut={12} />
        </button>
      </div>
      <p className="ofis-kart-durum" data-durum={ajan.durum}>
        <i aria-hidden="true" />
        {s.genel.ajanDurumu[ajan.durum]}
      </p>
      <p className="ofis-kart-etkinlik">{etkinlik()}</p>
      {gorev ? (
        <button type="button" className="ofis-kart-gorev" onClick={() => git("pano", { gorevId: gorev.id })} aria-label={t.gorevAc(gorev.kod, gorev.baslik)} title={t.gorevAc(gorev.kod, gorev.baslik)}>
          <code>{gorev.kod}</code>
          <span className="tek-satir">{gorev.baslik}</span>
        </button>
      ) : (
        <p className="ofis-kart-gorevsiz">{t.gorevYok}</p>
      )}
      <div className="ofis-kart-eylem">
        <button type="button" className="dugme dugme-kucuk" ref={ilkRef} aria-pressed={takipte} onClick={takip}>
          <TakipSimgesi />
          {takipte ? t.takibiBirak : t.takipEt}
        </button>
        <button type="button" className="dugme dugme-kucuk" aria-expanded={mesajAcik} onClick={() => setMesajAcik((a) => !a)}>
          <Simge ad="mesaj" boyut={12} />
          {t.mesaj}
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk ofis-kart-ayrinti" onClick={ayrinti} title={t.ayrintiIpucu}>
          {t.ayrintilar}
        </button>
      </div>
      {mesajAcik ? (
        <div className="ofis-kart-mesaj">
          <MesajFormu key={ajan.id} ajan={ajan} satirlar={2} odakla />
        </div>
      ) : null}
    </div>
  );
}

/** Takip nişangâhı: çember ve dört kısa çizgi (tek çizgi kalınlığı) */
export function TakipSimgesi() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <circle cx="8" cy="8" r="4" />
      <path d="M8 1.5v2.5M8 12v2.5M1.5 8H4M12 8h2.5" />
    </svg>
  );
}
