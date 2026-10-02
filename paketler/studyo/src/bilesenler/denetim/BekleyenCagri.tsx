// Karar bekleyen araç çağrısı: komut, kural, geri sayım, izin ver / reddet
import type { Onay } from "@arnorg/ortak";
import { useState } from "react";
import { api } from "../../api/uclar";
import { bildir } from "../../durum/arayuz";
import { onayUygula, useVeri } from "../../durum/veri";
import { aracAdi, girdiOzeti } from "../../yardimcilar/arac";
import { akilliZaman, kalanSure } from "../../yardimcilar/bicim";
import { useIslem, useSimdi } from "../../yardimcilar/kancalar";
import { AjanAvatar } from "../Kisi";

/**
 * Sözleşme `veri` alanını tiplemiyor; araç onayında şu biçim varsayılır:
 * { arac: string, girdi: unknown, kural?: string, aracKimligi?: string }
 */
export function aracOnayVerisi(o: Onay): { arac?: string; girdi?: unknown; kural?: string; aracKimligi?: string } {
  const v = o.veri && typeof o.veri === "object" ? (o.veri as Record<string, unknown>) : {};
  return {
    arac: typeof v.arac === "string" ? v.arac : undefined,
    girdi: v.girdi,
    kural: typeof v.kural === "string" ? v.kural : undefined,
    aracKimligi: typeof v.aracKimligi === "string" ? v.aracKimligi : undefined,
  };
}

export function BekleyenCagri({ onay }: { onay: Onay }) {
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === onay.ajanId));
  const simdi = useSimdi(1000);
  const [not, setNot] = useState("");
  const { suruyor, calistir } = useIslem();
  const v = aracOnayVerisi(onay);
  const ozet = girdiOzeti(v.arac, v.girdi, ajan?.calismaAlani);
  const komut = ozet.kod ?? (ozet.metin || (v.girdi !== undefined ? JSON.stringify(v.girdi, null, 2) : onay.ayrinti));

  const bitis = onay.sonGecerlilik ? new Date(onay.sonGecerlilik).getTime() : null;
  const baslangic = new Date(onay.olusturma).getTime();
  const kalan = bitis ? bitis - simdi : null;
  const oran = bitis && bitis > baslangic ? Math.max(0, Math.min(1, (bitis - simdi) / (bitis - baslangic))) : null;
  const doldu = kalan !== null && kalan <= 0;
  const acil = kalan !== null && kalan < 30_000;

  const karar = (k: "onayla" | "reddet") =>
    calistir(k, async () => {
      onayUygula(await api.onayKarari(onay.id, { karar: k, not: not.trim() || undefined }));
      bildir(k === "onayla" ? "basari" : "bilgi", `${ajan?.ad ?? "Ajan"} · ${aracAdi(v.arac)}: ${k === "onayla" ? "izin verildi" : "reddedildi"}.`);
    });

  return (
    <article className={`bekleyen${acil ? " bekleyen-acil" : ""}`} aria-label={`${ajan?.ad ?? "Ajan"} için karar bekleyen çağrı`}>
      {oran !== null ? (
        <span className="bekleyen-sure" aria-hidden="true">
          <span style={{ transform: `scaleX(${oran})` }} />
        </span>
      ) : null}
      <div className="bekleyen-ust">
        <span className="durum durum-karar_bekliyor">
          <i aria-hidden="true" />
          Karar bekliyor
        </span>
        {kalan !== null ? (
          <span className={`bekleyen-kalan sayi${acil ? " vurgu" : ""}`} role="timer" aria-live="off">
            {doldu ? "Süre doldu · reddedilecek" : `${kalanSure(kalan)} kaldı`}
          </span>
        ) : null}
        <small className="soluk">{akilliZaman(onay.olusturma)}</small>
        {v.aracKimligi ? <code className="bekleyen-kimlik">{v.aracKimligi}</code> : null}
      </div>
      <div className="bekleyen-govde">
        <AjanAvatar ajan={ajan} />
        <div className="bekleyen-ic">
          <b>
            {ajan?.ad ?? "Bilinmeyen ajan"} · {aracAdi(v.arac) || onay.baslik}
          </b>
          <pre className="komut">{komut}</pre>
          <small>
            {v.kural ? `Kural: ${v.kural}` : onay.baslik}
            {onay.ayrinti && onay.ayrinti !== komut ? ` · ${onay.ayrinti}` : ""}
          </small>
        </div>
      </div>
      <div className="bekleyen-karar">
        <input
          className="girdi"
          aria-label="Karar notu (isteğe bağlı)"
          placeholder="Not (isteğe bağlı) · örn. Dalını it, PR aç"
          value={not}
          onChange={(e) => setNot(e.target.value)}
          disabled={doldu}
        />
        <div className="dugme-satir">
          <button type="button" className="dugme dugme-ana" onClick={() => void karar("onayla")} disabled={suruyor !== null || doldu}>
            {suruyor === "onayla" ? <span className="doner" aria-hidden="true" /> : null}
            İzin ver
          </button>
          <button type="button" className="dugme" onClick={() => void karar("reddet")} disabled={suruyor !== null || doldu}>
            {suruyor === "reddet" ? <span className="doner" aria-hidden="true" /> : null}
            Reddet
          </button>
        </div>
      </div>
    </article>
  );
}
