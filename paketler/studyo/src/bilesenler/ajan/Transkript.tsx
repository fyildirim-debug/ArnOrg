// Ajan oturumunun canlı dökümü: mesajlar, düşünceler, araç çağrıları ve sonuçları, tur sonları
import type { AkisOgesi } from "@arnorg/ortak";
import { memo, useMemo } from "react";
import { useSozluk } from "../../dil";
import { aracAdi, aracSinifi, girdiOzeti } from "../../yardimcilar/arac";
import { saat, saatSaniye, token } from "../../yardimcilar/bicim";
import { Markdown } from "../Markdown";
import { ZenginMetin } from "../ZenginMetin";

export interface TranskriptSatiri {
  oge: AkisOgesi;
  /** Araç çağrısının sonucu (aynı aracKimligi) */
  sonuc?: AkisOgesi;
}

/** Sonuçları çağrılarına bağlar; eşleşmeyen sonuçlar ayrı satır olur */
export function satirlariKur(ogeler: AkisOgesi[]): TranskriptSatiri[] {
  const satirlar: TranskriptSatiri[] = [];
  const cagrilar = new Map<string, TranskriptSatiri>();
  for (const oge of ogeler) {
    if (oge.tur === "arac_sonucu" && oge.aracKimligi) {
      const cagri = cagrilar.get(oge.aracKimligi);
      if (cagri && !cagri.sonuc) {
        cagri.sonuc = oge;
        continue;
      }
    }
    const satir: TranskriptSatiri = { oge };
    if (oge.tur === "arac_cagrisi" && oge.aracKimligi) cagrilar.set(oge.aracKimligi, satir);
    satirlar.push(satir);
  }
  return satirlar;
}

function sonucMetni(oge: AkisOgesi): string {
  if (oge.metin) return oge.metin;
  if (oge.girdi === undefined || oge.girdi === null) return "";
  return typeof oge.girdi === "string" ? oge.girdi : JSON.stringify(oge.girdi, null, 2);
}

function AracSonucu({ sonuc }: { sonuc: AkisOgesi }) {
  const t = useSozluk().ajan.transkript;
  const metin = sonucMetni(sonuc).replace(/\s+$/, "");
  const satirSayisi = metin ? metin.split("\n").length : 0;
  if (!metin) return <p className="ak-sonuc-bos">{sonuc.hata ? t.hataCiktiYok : t.ciktiYok}</p>;
  const kisa = satirSayisi <= 6 && metin.length <= 480;
  if (kisa) return <pre className={`ak-cikti${sonuc.hata ? " ak-cikti-hata" : ""}`}>{metin}</pre>;
  return (
    <details className="ak-sonuc">
      <summary>
        {sonuc.hata ? t.hataCiktisi : t.cikti} <small>· {t.satir(satirSayisi)}</small>
      </summary>
      <pre className={`ak-cikti${sonuc.hata ? " ak-cikti-hata" : ""}`}>{metin.length > 60000 ? `${metin.slice(0, 60000)}\n…` : metin}</pre>
    </details>
  );
}

/** Edit/MultiEdit için kısa değişiklik özeti */
function duzenlemeOzeti(girdi: unknown, t: { satir: (n: number) => string; duzenleme: (n: number) => string }): string | null {
  if (!girdi || typeof girdi !== "object") return null;
  const g = girdi as { old_string?: unknown; new_string?: unknown; edits?: unknown; content?: unknown };
  const satir = (s: unknown) => (typeof s === "string" && s ? s.split("\n").length : 0);
  if (typeof g.content === "string") return t.satir(satir(g.content));
  if (Array.isArray(g.edits)) return t.duzenleme(g.edits.length);
  if (g.old_string !== undefined || g.new_string !== undefined) return `−${satir(g.old_string)} +${satir(g.new_string)}`;
  return null;
}

const AracCagrisi = memo(function AracCagrisi({ satir, kok }: { satir: TranskriptSatiri; kok?: string | null }) {
  const s = useSozluk();
  const { oge, sonuc } = satir;
  const ozet = girdiOzeti(oge.arac, oge.girdi, kok);
  const sinif = aracSinifi(oge.arac);
  const duzenleme = sinif === "yaz" ? duzenlemeOzeti(oge.girdi, s.ajan.transkript) : null;
  const ozetMetni = ozet.kod && ozet.metin === ozet.kod ? "" : ozet.metin;
  return (
    <div className={`ak ak-arac${sonuc?.hata ? " ak-arac-hata" : ""}`} title={saatSaniye(oge.zaman)}>
      <div className="ak-arac-ust">
        <span className={`arac arac-${sinif}`}>{aracAdi(oge.arac)}</span>
        {ozetMetni ? <span className="ak-arac-ozet">{ozetMetni}</span> : null}
        {duzenleme ? <span className="ak-arac-ek">{duzenleme}</span> : null}
        {!sonuc ? (
          <span className="ak-bekliyor" aria-label={s.ajan.transkript.sonucBekleniyor}>
            <i />
            <i />
            <i />
          </span>
        ) : sonuc.hata ? (
          <span className="hukum hukum-ret">{s.genel.hata}</span>
        ) : null}
      </div>
      {ozet.kod ? <pre className="komut ak-komut">{ozet.kod}</pre> : null}
      {sonuc ? <AracSonucu sonuc={sonuc} /> : null}
    </div>
  );
});

export const TranskriptSatir = memo(function TranskriptSatir({ satir, kok }: { satir: TranskriptSatiri; kok?: string | null }) {
  const t = useSozluk().ajan.transkript;
  const { oge } = satir;
  const alt = oge.ustAracKimligi ? " ak-alt" : "";
  switch (oge.tur) {
    case "kullanici":
      return (
        <div className={`ak ak-kullanici${alt}`}>
          <div className="ak-ust">
            <span>{t.gelenMesaj}</span>
            <time dateTime={oge.zaman}>{saat(oge.zaman)}</time>
          </div>
          <div className="ak-duz">
            <ZenginMetin metin={oge.metin ?? ""} />
          </div>
        </div>
      );
    case "asistan":
      return (
        <div className={`ak ak-asistan${alt}`}>
          <Markdown metin={oge.metin ?? ""} />
        </div>
      );
    case "dusunce": {
      const n = (oge.metin ?? "").split("\n").filter(Boolean).length;
      return (
        <details className={`ak ak-dusunce${alt}`}>
          <summary>
            {t.dusunce} <small>· {t.satir(n)}</small>
          </summary>
          <div className="ak-duz">{oge.metin}</div>
        </details>
      );
    }
    case "arac_cagrisi":
      return (
        <div className={alt ? "ak-alt" : undefined}>
          <AracCagrisi satir={satir} kok={kok} />
        </div>
      );
    case "arac_sonucu":
      return (
        <div className={`ak ak-arac${oge.hata ? " ak-arac-hata" : ""}${alt}`}>
          <div className="ak-arac-ust">
            <span className="arac">{t.sonuc}</span>
            {oge.arac ? <span className="ak-arac-ozet">{aracAdi(oge.arac)}</span> : null}
          </div>
          <AracSonucu sonuc={oge} />
        </div>
      );
    case "sistem":
      return <div className={`ak ak-sistem${alt}`}>{oge.metin}</div>;
    case "sonuc":
      return (
        <div className={`ak ak-tur-sonu${oge.hata ? " ak-tur-hata" : ""}${alt}`} role="separator">
          <span>{oge.hata ? t.turHatayla : t.turBitti}</span>
          {oge.metin && oge.hata ? <span className="ak-tur-neden">{oge.metin}</span> : null}
          {oge.token ? <span className="sayi">{t.token(token(oge.token))}</span> : null}
          <time dateTime={oge.zaman}>{saat(oge.zaman)}</time>
        </div>
      );
  }
});

export function useTranskript(ogeler: AkisOgesi[] | undefined) {
  return useMemo(() => satirlariKur(ogeler ?? []), [ogeler]);
}
