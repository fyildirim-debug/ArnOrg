// Sayı, para ve zaman biçimleri (Türkçe yerel ayar)

const paraBicimi = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const kucukParaBicimi = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const sayiBicimi = new Intl.NumberFormat("tr-TR");
const saatBicimi = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });
const saniyeliBicim = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const tarihBicimi = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const kisaTarih = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
const goreliBicim = new Intl.RelativeTimeFormat("tr", { numeric: "auto", style: "short" });

/** $14,22 */
export function para(n: number | null | undefined): string {
  return paraBicimi.format(n ?? 0);
}

/** Küçük tutarlar için üç basamak: $0,042 */
export function kucukPara(n: number | null | undefined): string {
  const d = n ?? 0;
  return d > 0 && d < 0.1 ? kucukParaBicimi.format(d) : paraBicimi.format(d);
}

export function sayi(n: number): string {
  return sayiBicimi.format(n);
}

function tarihe(z: string | null | undefined): Date | null {
  if (!z) return null;
  const t = new Date(z);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** 10:31 */
export function saat(z: string | null | undefined): string {
  const t = tarihe(z);
  return t ? saatBicimi.format(t) : "";
}

export function saatSaniye(z: string | null | undefined): string {
  const t = tarihe(z);
  return t ? saniyeliBicim.format(t) : "";
}

/** 2 Ekim 2026 */
export function tarih(z: string | null | undefined): string {
  const t = tarihe(z);
  return t ? tarihBicimi.format(t) : "";
}

/** Bugünse saat, değilse kısa tarih + saat */
export function akilliZaman(z: string | null | undefined): string {
  const t = tarihe(z);
  if (!t) return "";
  const simdi = new Date();
  if (t.toDateString() === simdi.toDateString()) return saatBicimi.format(t);
  return `${kisaTarih.format(t)} ${saatBicimi.format(t)}`;
}

/** 3 dk önce */
export function goreli(z: string | null | undefined, simdi = Date.now()): string {
  const t = tarihe(z);
  if (!t) return "";
  const fark = (t.getTime() - simdi) / 1000;
  const mutlak = Math.abs(fark);
  if (mutlak < 45) return "az önce";
  if (mutlak < 3600) return goreliBicim.format(Math.round(fark / 60), "minute");
  if (mutlak < 86400) return goreliBicim.format(Math.round(fark / 3600), "hour");
  return goreliBicim.format(Math.round(fark / 86400), "day");
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
  return (ad.trim()[0] ?? "?").toLocaleUpperCase("tr-TR");
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
