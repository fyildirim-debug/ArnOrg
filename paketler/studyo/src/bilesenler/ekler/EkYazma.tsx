// Yazma alanının ekleri: ekle düğmesi (gizli dosya seçici), gönderilecek eklerin çipleri (önizleme, ad, boyut, yükleme
// ilerlemesi, hata, yeniden dene, kaldır), konuşmanın üstüne dosya bırakma perdesi ve panodan görsel yapıştırma.
// CeoSohbeti ve Kanallar bunları useEkTaslagi ile birlikte kullanır.
import { useCallback, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent } from "react";
import { useSozluk } from "../../dil";
import { yuzde } from "../../yardimcilar/bicim";
import { DOSYA_KABULU, EK_MB, ekBoyutu, kisaTur } from "../../yardimcilar/ekler";
import { Simge } from "../Simge";
import { EkSimgesi } from "./EkSimgesi";
import type { EkTaslagi, Taslak } from "./taslak";
import "../../stiller/ekler.css";

/** Ataş düğmesi: dosya seçici açılır, seçilenler hemen yüklenmeye başlar */
export function EkDugmesi({ taslak, devreDisi }: { taslak: EkTaslagi; devreDisi?: boolean }) {
  const s = useSozluk().ekler;
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="dugme dugme-sessiz dugme-simge ek-dugme" onClick={() => ref.current?.click()} disabled={devreDisi} aria-label={s.ekle} title={s.ekleIpucu}>
        <EkSimgesi ad="atac" />
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        accept={DOSYA_KABULU}
        onChange={(e) => {
          const secilen = Array.from(e.target.files ?? []);
          // Aynı dosya yeniden seçilebilsin
          e.target.value = "";
          taslak.ekle(secilen);
        }}
      />
    </>
  );
}

/** Gönderilecek eklerin çipleri; ek yoksa hiçbir şey */
export function EkCipleri({ taslak }: { taslak: EkTaslagi }) {
  const s = useSozluk().ekler;
  if (!taslak.liste.length) return null;
  return (
    <ul className="ek-cipler" aria-label={s.ciplerEtiketi}>
      {taslak.liste.map((t) => (
        <EkCipi key={t.anahtar} t={t} taslak={taslak} />
      ))}
    </ul>
  );
}

function EkCipi({ t, taslak }: { t: Taslak; taslak: EkTaslagi }) {
  const s = useSozluk().ekler;
  const oran = Math.round(t.oran * 100);
  const tur = t.ek ? kisaTur(t.ek) : kisaTur({ tur: "metin", ad: t.ad, mime: t.tur });
  const yenilenir = t.durum === "hata" && !t.kalici;
  return (
    <li className="ek-cip" data-durum={t.durum} aria-busy={t.durum === "yukleniyor" || undefined}>
      <span className="ek-cip-on" aria-hidden="true">
        {t.onizleme ? <img src={t.onizleme} alt="" decoding="async" /> : <span className="ek-cip-tur">{tur}</span>}
      </span>
      <span className="ek-cip-metin">
        <span className="ek-cip-ad tek-satir" title={t.ad}>
          {t.ad}
        </span>
        {t.durum === "hata" ? (
          <span className="ek-cip-bilgi ek-cip-hata tek-satir" role="alert" title={t.hata ?? s.yuklenemedi}>
            {t.hata ?? s.yuklenemedi}
          </span>
        ) : (
          <span className="ek-cip-bilgi">{t.durum === "yukleniyor" ? `${s.yukleniyor} · ${yuzde(oran)}` : ekBoyutu(t.ek?.boyut ?? t.boyut)}</span>
        )}
      </span>
      <span className="ek-cip-eylem">
        {yenilenir ? (
          <button type="button" className="ek-cip-dugme" onClick={() => taslak.yenidenDene(t.anahtar)} aria-label={s.yenidenDene(t.ad)} title={s.yenidenDene(t.ad)}>
            <Simge ad="yenile" boyut={12} />
          </button>
        ) : null}
        <button type="button" className="ek-cip-dugme" onClick={() => taslak.kaldir(t.anahtar)} aria-label={s.kaldir(t.ad)} title={s.kaldir(t.ad)}>
          <Simge ad="kapat" boyut={12} />
        </button>
      </span>
      {t.durum === "yukleniyor" ? (
        <span
          className="ek-cip-ilerleme"
          role="progressbar"
          aria-label={s.yuklemeOrani(t.ad, oran)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={oran}
          style={{ "--oran": t.oran } as CSSProperties}
        />
      ) : null}
    </li>
  );
}

/** Konuşma alanına dosya bırakma: sürüklenen dosya varken perde görünür, bırakılanlar eklenir */
export function useEkBirakma(taslak: EkTaslagi, etkin = true) {
  const [uzerinde, setUzerinde] = useState(false);
  const derinlik = useRef(0);
  const dosyaVar = (e: DragEvent) => etkin && Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const ekle = taslak.ekle;
  const birak = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      derinlik.current = 0;
      setUzerinde(false);
      ekle(Array.from(e.dataTransfer.files));
    },
    [ekle],
  );
  return {
    uzerinde,
    ozellikler: {
      "data-ek-birakma": "",
      onDragEnter: (e: DragEvent) => {
        if (!dosyaVar(e)) return;
        e.preventDefault();
        derinlik.current++;
        setUzerinde(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!dosyaVar(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (e: DragEvent) => {
        if (!dosyaVar(e)) return;
        derinlik.current = Math.max(0, derinlik.current - 1);
        if (!derinlik.current) setUzerinde(false);
      },
      onDrop: (e: DragEvent) => {
        if (!dosyaVar(e)) return;
        birak(e);
      },
    },
  };
}

/** Dosya bırakma perdesi (konuşma alanının üstünde; dokunuşları geçirir) */
export function EkBirakmaPerdesi({ gorunur }: { gorunur: boolean }) {
  const s = useSozluk().ekler;
  if (!gorunur) return null;
  return (
    <div className="ek-birakma" aria-hidden="true">
      <div className="ek-birakma-ic">
        <EkSimgesi ad="atac" boyut={20} />
        <b>{s.birak}</b>
        <span>{s.birakAlt(EK_MB)}</span>
      </div>
    </div>
  );
}

/**
 * Yazma alanına yapıştırma: panoda düz metin varsa yapıştırma olduğu gibi kalır; yalnız dosya (ekran görüntüsü,
 * kopyalanan görsel) varsa eklenir.
 */
export function ekYapistir(e: ClipboardEvent, taslak: EkTaslagi): void {
  const dosyalar = Array.from(e.clipboardData?.files ?? []);
  if (!dosyalar.length || e.clipboardData.getData("text/plain").trim()) return;
  e.preventDefault();
  taslak.ekle(dosyalar);
}
