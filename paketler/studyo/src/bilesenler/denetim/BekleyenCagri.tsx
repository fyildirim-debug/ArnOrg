// Karar bekleyen araç çağrısı: komut, kural, geri sayım, izin ver / reddet. Tam otonomda karar CEO'dadır; kurulun
// düğmeleri ikincil kalır, kurul yine de karar verebilir.
import type { Onay } from "@arnorg/ortak";
import { useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { onayUygula, useVeri } from "../../durum/veri";
import { aracAdi, girdiOzeti } from "../../yardimcilar/arac";
import { akilliZaman, kalanSure } from "../../yardimcilar/bicim";
import { useIslem, useSimdi } from "../../yardimcilar/kancalar";
import { CeoKararVeriyor } from "../KararYetkisi";
import { ceoyuBekliyor } from "../kararVeren";
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
  const s = useSozluk();
  const t = s.denetim.cagri;
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
  const ceoda = ceoyuBekliyor(onay);

  const karar = (k: "onayla" | "reddet") =>
    calistir(k, async () => {
      onayUygula(await api.onayKarari(onay.id, { karar: k, not: not.trim() || undefined }));
      const c = sozluk().denetim.cagri;
      bildir(k === "onayla" ? "basari" : "bilgi", c.karar(ajan?.ad ?? c.ajan, aracAdi(v.arac), k === "onayla"));
    });

  return (
    <article className={`bekleyen${acil ? " bekleyen-acil" : ""}`} aria-label={t.etiket(ajan?.ad ?? t.ajan)}>
      {oran !== null ? (
        <span className="bekleyen-sure" aria-hidden="true">
          <span style={{ transform: `scaleX(${oran})` }} />
        </span>
      ) : null}
      <div className="bekleyen-ust">
        {ceoda ? (
          <CeoKararVeriyor ipucu={false} />
        ) : (
          <span className="durum durum-karar_bekliyor">
            <i aria-hidden="true" />
            {s.genel.ajanDurumu.karar_bekliyor}
          </span>
        )}
        {kalan !== null ? (
          <span className={`bekleyen-kalan sayi${acil ? " vurgu" : ""}`} role="timer" aria-live="off">
            {doldu ? t.doldu : t.kaldi(kalanSure(kalan))}
          </span>
        ) : null}
        <small className="soluk">{akilliZaman(onay.olusturma)}</small>
        {v.aracKimligi ? <code className="bekleyen-kimlik">{v.aracKimligi}</code> : null}
      </div>
      <div className="bekleyen-govde">
        <AjanAvatar ajan={ajan} />
        <div className="bekleyen-ic">
          <b>
            {ajan?.ad ?? t.bilinmeyenAjan} · {aracAdi(v.arac) || onay.baslik}
          </b>
          <pre className="komut">{komut}</pre>
          <small>
            {v.kural ? t.kural(v.kural) : onay.baslik}
            {onay.ayrinti && onay.ayrinti !== komut ? ` · ${onay.ayrinti}` : ""}
          </small>
        </div>
      </div>
      <div className="bekleyen-karar">
        <input
          className="girdi"
          aria-label={t.notEtiketi}
          placeholder={t.notYer}
          value={not}
          onChange={(e) => setNot(e.target.value)}
          disabled={doldu}
        />
        <div className="dugme-satir">
          <button type="button" className={`dugme${ceoda ? "" : " dugme-ana"}`} onClick={() => void karar("onayla")} disabled={suruyor !== null || doldu}>
            {suruyor === "onayla" ? <span className="doner" aria-hidden="true" /> : null}
            {t.izinVer}
          </button>
          <button type="button" className="dugme" onClick={() => void karar("reddet")} disabled={suruyor !== null || doldu}>
            {suruyor === "reddet" ? <span className="doner" aria-hidden="true" /> : null}
            {t.reddet}
          </button>
          {ceoda ? <span className="karar-ceo-ipucu">{s.karar.bekliyorIpucu}</span> : null}
        </div>
      </div>
    </article>
  );
}
