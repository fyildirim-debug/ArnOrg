// Görev token tavanı onayı (`genel`, altTur: gorev_token_tavani): verinin güvenle okunması, kısa token biçimi ve kullanım
// ölçeri. Ölçer işleneni görevin tavanına göre gösterir: tavana dek kemik, tavanın ötesi mercan, onaylanırsa çıkılacak
// yeni tavana dek kıl çizgi; eski tavan ince bir çentikle işaretlenir.
import { GOREV_TAVANI_ALT_TURU, type Dil } from "@arnorg/ortak";
import { useDil, useSozluk } from "../dil";

export interface TokenTavani {
  ajanId: string | null;
  gorevId: string | null;
  gorevKodu: string | null;
  /** Görevin işlediği token */
  toplam: number;
  /** Aşılan tavan */
  tavan: number;
  /** Onaylanırsa yeni tavan */
  yeniTavan: number;
}

/** Kartta ayrıca gösterilen veri alanları (ham alan listesine düşmez) */
export const TOKEN_TAVANI_ALANLARI = ["altTur", "ajanId", "gorevId", "gorevKodu", "toplam", "tavan", "yeniTavan"];

function dize(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function sayi(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Onay verisi görev token tavanı onayıysa okunur hâli; değilse null */
export function tokenTavaniVerisi(veri: unknown): TokenTavani | null {
  if (!veri || typeof veri !== "object" || Array.isArray(veri)) return null;
  const v = veri as Record<string, unknown>;
  if (v.altTur !== GOREV_TAVANI_ALT_TURU) return null;
  const toplam = sayi(v.toplam);
  const tavan = sayi(v.tavan);
  if (toplam === null || tavan === null || tavan <= 0) return null;
  const yeni = sayi(v.yeniTavan);
  return { ajanId: dize(v.ajanId), gorevId: dize(v.gorevId), gorevKodu: dize(v.gorevKodu), toplam, tavan, yeniTavan: yeni !== null && yeni > tavan ? yeni : tavan * 2 };
}

/** 2_100_000 → "2,1 M" (İngilizce "2.1M"), 850_000 → "850 bin" ("850k"); çekirdeğin onay başlığıyla aynı biçim */
export function kisaToken(n: number, dil: Dil): string {
  const tr = dil === "tr";
  const yerel = tr ? "tr-TR" : "en-US";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(yerel, { maximumFractionDigits: 1 })}${tr ? " M" : "M"}`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString(yerel)}${tr ? " bin" : "k"}`;
  return String(Math.round(n));
}

export function TavanOlcer({ veri }: { veri: TokenTavani }) {
  const dil = useDil();
  const t = useSozluk().onaylar.tokenTavani;
  const olcek = Math.max(veri.yeniTavan, veri.toplam);
  const oran = (n: number) => Math.min(100, (n / olcek) * 100);
  const islenen = kisaToken(veri.toplam, dil);
  const tavan = kisaToken(veri.tavan, dil);
  const yeni = kisaToken(veri.yeniTavan, dil);
  const asim = Math.max(0, oran(veri.toplam) - oran(veri.tavan));
  return (
    <span className="tavan-olcer">
      <span className="tavan-olcer-sayilar">
        <span className="tavan-olcer-oran">
          <b>{islenen}</b>
          <span aria-hidden="true">/</span>
          <span>{tavan}</span>
        </span>
        <span className="tavan-olcer-yeni">{t.yeniTavan(yeni)}</span>
      </span>
      <span className="tavan-olcer-cubuk" role="img" aria-label={t.olcer(islenen, tavan, yeni)}>
        <span className="tavan-olcer-dolu" style={{ width: `${oran(Math.min(veri.toplam, veri.tavan))}%` }} />
        {asim > 0 ? <span className="tavan-olcer-asim" style={{ left: `${oran(veri.tavan)}%`, width: `${asim}%` }} /> : null}
        <span className="tavan-olcer-centik" style={{ left: `${oran(veri.tavan)}%` }} />
      </span>
    </span>
  );
}
