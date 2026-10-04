// Arama motorlarının ortak sözleşmesi: istek, sonuç, hata türleri ve küçük ayrıştırma yardımcıları
import type { Dil, WebAramaKategorisi } from "@arnorg/ortak";
import { iki } from "../../dil.js";
import type { Getirici, GetirYaniti } from "../http.js";

export interface MotorIstegi {
  sorgu: string;
  /** 1 tabanlı */
  sayfa: number;
  dil: Dil;
  kategori: WebAramaKategorisi;
}

export interface MotorSonucu {
  baslik: string;
  adres: string;
  ozet: string;
  tarih?: string | null;
}

/** gh CLI üzerinden GitHub API'si; giriş yoksa ya da gh kurulu değilse GhGirisYok atar */
export interface GhIstemcisi {
  api<T>(yol: string, kabul?: string): Promise<T>;
}

export class GhGirisYok extends Error {}

export interface MotorOrtami {
  getir: Getirici;
  /** gh CLI istemcisi (kurulu değilse null) */
  gh: GhIstemcisi | null;
  /** Kurulun dış SearXNG adresi */
  searxngAdresi: string | null;
  zamanAsimiMs: number;
}

export interface Motor {
  kimlik: string;
  ad: string;
  tur: "genel" | "teknik" | "dis";
  kategoriler: readonly WebAramaKategorisi[];
  /** Puanlamadaki ağırlık: Σ ağırlık / sıra */
  agirlik: number;
  /** Sonuçlar sorguyla ilgisizse (bot korumasının zehirli sonuçları) ayıklanır: genel HTML motorları */
  alakaDenetimi?: boolean;
  ara(istek: MotorIstegi, ortam: MotorOrtami): Promise<MotorSonucu[]>;
}

/**
 * cok_istek (429): 10 dk askı · engel (403) ve captcha (CAPTCHA, anomali sayfası): 1 sa askı ·
 * zaman_asimi, ag, http: artan kısa askı (5 sn × ardışık hata, en çok 2 dk) · cozumleme: askı yok
 */
export type MotorHataTuru = "cok_istek" | "engel" | "captcha" | "zaman_asimi" | "ag" | "http" | "cozumleme";

export class MotorHatasi extends Error {
  constructor(
    readonly tur: MotorHataTuru,
    mesaj: string,
    readonly durum?: number,
  ) {
    super(mesaj);
  }
}

/** HTTP durumunu hata türüne çevirir; 2xx'te bir şey yapmaz */
export function durumuDenetle(y: GetirYaniti, ad: string): void {
  const d = y.durum;
  if (d >= 200 && d < 300) return;
  if (d === 429) throw new MotorHatasi("cok_istek", iki(`${ad} çok fazla istek dedi (429)`, `${ad} said too many requests (429)`), d);
  if (d === 403 || d === 401) throw new MotorHatasi("engel", iki(`${ad} erişimi reddetti (${d})`, `${ad} denied access (${d})`), d);
  throw new MotorHatasi("http", iki(`${ad} ${d} döndürdü`, `${ad} returned ${d}`), d);
}

const VARLIKLAR: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»" };

/** HTML varlıklarını çözer: &amp; &#39; &#x2F; */
export function varlikCoz(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, v: string) => {
    if (v[0] === "#") {
      const kod = v[1] === "x" || v[1] === "X" ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10);
      return Number.isFinite(kod) && kod > 0 && kod < 0x110000 ? String.fromCodePoint(kod) : m;
    }
    return VARLIKLAR[v.toLowerCase()] ?? m;
  });
}

/** Küçük HTML parçasından düz metin: etiketler atılır, varlıklar çözülür, boşluk sadeleşir */
export function etiketsiz(html: string | null | undefined): string {
  if (!html) return "";
  return varlikCoz(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function sadeMetin(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function kirp(s: string, uzunluk: number): string {
  return s.length > uzunluk ? `${s.slice(0, uzunluk - 1).trimEnd()}…` : s;
}

/** Unix saniyesinden ISO zaman */
export function unixZaman(sn: unknown): string | null {
  return typeof sn === "number" && Number.isFinite(sn) ? new Date(sn * 1000).toISOString() : null;
}

/** Tarih metninden ISO zaman; çözülemezse null */
export function isoZaman(s: unknown): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Yalnız http(s) adresleri sonuç olur */
export function gecerliAdres(adres: string | null | undefined): adres is string {
  return !!adres && /^https?:\/\/[^\s/]+/i.test(adres);
}

/** Alaka denetiminde sayılmayan sık sözcükler */
const DOLGU = new Set(["the", "and", "for", "with", "how", "what", "why", "are", "can", "does", "ile", "için", "icin", "nasıl", "nasil", "nedir", "neden", "bir", "veya", "gibi", "olan"]);

function katla(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i");
}

/**
 * Sonuçlar sorguyla ilgili mi: en az 4 sonuçtan hiçbirinin başlık, özet ya da adresinde sorgunun anlamlı (3+ harf)
 * sözcükleri geçmiyorsa bot korumasının döndürdüğü rastgele sonuçlar sayılır.
 */
export function alakaliMi(sorgu: string, sonuclar: MotorSonucu[]): boolean {
  if (sonuclar.length < 4) return true;
  const sozcukler = [...new Set(katla(sorgu).split(/[^\p{L}\p{N}]+/u))].filter((s) => s.length >= 3 && !DOLGU.has(s));
  if (!sozcukler.length) return true;
  return sonuclar.some((r) => {
    const metin = katla(`${r.baslik} ${r.ozet} ${r.adres}`);
    return sozcukler.some((s) => metin.includes(s));
  });
}
