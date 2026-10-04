// Sayı, token ve zaman biçimleri; arayüz diline göre (tr-TR ya da en-US)
import { useDilDurumu } from "../dil";

type Bicimler = {
  sayi: Intl.NumberFormat;
  saat: Intl.DateTimeFormat;
  saniyeli: Intl.DateTimeFormat;
  tarih: Intl.DateTimeFormat;
  kisaTarih: Intl.DateTimeFormat;
  goreli: Intl.RelativeTimeFormat;
};
const onbellek = new Map<string, Bicimler>();

function bicimler(): Bicimler {
  const dil = useDilDurumu.getState().dil;
  let b = onbellek.get(dil);
  if (!b) {
    const y = dil === "tr" ? "tr-TR" : "en-US";
    b = {
      sayi: new Intl.NumberFormat(y),
      saat: new Intl.DateTimeFormat(y, { hour: "2-digit", minute: "2-digit" }),
      saniyeli: new Intl.DateTimeFormat(y, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      tarih: new Intl.DateTimeFormat(y, { day: "numeric", month: "long", year: "numeric" }),
      kisaTarih: new Intl.DateTimeFormat(y, { day: "numeric", month: "short" }),
      goreli: new Intl.RelativeTimeFormat(dil, { numeric: "auto", style: "short" }),
    };
    onbellek.set(dil, b);
  }
  return b;
}

const turkce = () => useDilDurumu.getState().dil === "tr";

/** Token sayısı: 950, 48 bin, 1,3 milyon (İngilizce: 950, 48k, 1.3M) */
export function token(n: number | null | undefined): string {
  const d = n ?? 0;
  const tr = turkce();
  const y = tr ? "tr-TR" : "en-US";
  if (d >= 1_000_000) return `${(d / 1_000_000).toLocaleString(y, { maximumFractionDigits: 1 })}${tr ? " milyon" : "M"}`;
  if (d >= 1000) return `${Math.round(d / 1000).toLocaleString(y)}${tr ? " bin" : "k"}`;
  return String(Math.round(d));
}

/** Yüzde: %12 (İngilizce: 12%) */
export function yuzde(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return turkce() ? `%${Math.round(n)}` : `${Math.round(n)}%`;
}

export function sayi(n: number): string {
  return bicimler().sayi.format(n);
}

function tarihe(z: string | null | undefined): Date | null {
  if (!z) return null;
  const t = new Date(z);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** 10:31 */
export function saat(z: string | null | undefined): string {
  const t = tarihe(z);
  return t ? bicimler().saat.format(t) : "";
}

export function saatSaniye(z: string | null | undefined): string {
  const t = tarihe(z);
  return t ? bicimler().saniyeli.format(t) : "";
}

/** 2 Ekim 2026 */
export function tarih(z: string | null | undefined): string {
  const t = tarihe(z);
  return t ? bicimler().tarih.format(t) : "";
}

/** Bugünse saat, değilse kısa tarih + saat */
export function akilliZaman(z: string | null | undefined): string {
  const t = tarihe(z);
  if (!t) return "";
  const b = bicimler();
  const simdi = new Date();
  if (t.toDateString() === simdi.toDateString()) return b.saat.format(t);
  return `${b.kisaTarih.format(t)} ${b.saat.format(t)}`;
}

/** 3 dk önce */
export function goreli(z: string | null | undefined, simdi = Date.now()): string {
  const t = tarihe(z);
  if (!t) return "";
  const b = bicimler();
  const fark = (t.getTime() - simdi) / 1000;
  const mutlak = Math.abs(fark);
  if (mutlak < 45) return turkce() ? "az önce" : "just now";
  if (mutlak < 3600) return b.goreli.format(Math.round(fark / 60), "minute");
  if (mutlak < 86400) return b.goreli.format(Math.round(fark / 3600), "hour");
  return b.goreli.format(Math.round(fark / 86400), "day");
}

/** Kalan süre: 4:05 */
export function kalanSure(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const dk = Math.floor(s / 60);
  const sn = s % 60;
  return `${dk}:${String(sn).padStart(2, "0")}`;
}

/** Uzun metni tek satıra kısaltır */
export function kisalt(metin: string, uzunluk = 80): string {
  const tek = metin.replace(/\s+/g, " ").trim();
  return tek.length > uzunluk ? `${tek.slice(0, uzunluk - 1)}…` : tek;
}

/** Yolun son parçası */
export function dosyaAdi(yol: string): string {
  const p = yol.split("/");
  return p[p.length - 1] || yol;
}

export function ilkHarf(ad: string): string {
  return (ad.trim()[0] ?? "?").toLocaleUpperCase(turkce() ? "tr-TR" : "en-US");
}

// ---------------------------------------------------------------------------
// Türkçe ad ekleri (ünlü uyumu): Ada'ya, Kerem'e, Ece'yi, Onur'u
// ---------------------------------------------------------------------------

const UNLULER = "aıoueiöü";

function sonUnlu(ad: string): string | null {
  const k = ad.toLocaleLowerCase("tr-TR");
  for (let i = k.length - 1; i >= 0; i--) {
    const c = k[i]!;
    if (UNLULER.includes(c)) return c;
  }
  return null;
}

function unluyleBiter(ad: string): boolean {
  const k = ad.toLocaleLowerCase("tr-TR");
  return UNLULER.includes(k[k.length - 1] ?? "");
}

/** Yönelme durumu: Ada'ya, Kerem'e */
export function yonelme(ad: string): string {
  const u = sonUnlu(ad) ?? "e";
  const ek = "aıou".includes(u) ? "a" : "e";
  return `${ad}'${unluyleBiter(ad) ? "y" : ""}${ek}`;
}

/** Belirtme durumu: Ada'yı, Ece'yi, Onur'u, Göktürk'ü */
export function belirtme(ad: string): string {
  const u = sonUnlu(ad) ?? "e";
  const ek = "aı".includes(u) ? "ı" : "ou".includes(u) ? "u" : "ei".includes(u) ? "i" : "ü";
  return `${ad}'${unluyleBiter(ad) ? "y" : ""}${ek}`;
}

/** İlgi durumu: Ada'nın, Kerem'in, Onur'un */
export function ilgi(ad: string): string {
  const u = sonUnlu(ad) ?? "e";
  const ek = "aı".includes(u) ? "ın" : "ou".includes(u) ? "un" : "ei".includes(u) ? "in" : "ün";
  return `${ad}'${unluyleBiter(ad) ? "n" : ""}${ek}`;
}
