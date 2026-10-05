// Web istekleri: zaman aşımı, boyut sınırı, gövdenin kodlaması. Arama motorları ve sayfa okuyucu bu getiriciyle
// çalışır; testler kendi sahte getiricisini verir (ağa çıkılmaz).
import { ARNORG_SURUMU, type Dil } from "@arnorg/ortak";
import { iki } from "../dil.js";

/** API'lere (Wikimedia, Stack Exchange, registry'ler) kendini tanıtan açıklayıcı User-Agent */
export const ARNORG_UA = `ArnOrg/${ARNORG_SURUMU} (+https://github.com/fyildirim-debug/ArnOrg)`;
/** HTML arama sayfaları ve okunan sayfalar için tarayıcı benzeri User-Agent */
export const TARAYICI_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export const VARSAYILAN_SINIR_BAYT = 5 * 1024 * 1024;

export interface GetirSecenekleri {
  yontem?: "GET" | "POST";
  basliklar?: Record<string, string>;
  govde?: string;
  zamanAsimiMs?: number;
  /** Gövde bu kadar baytta kesilir (yanıt yine döner, kesildi=true) */
  enCokBayt?: number;
}

export interface GetirYaniti {
  durum: number;
  /** Yönlendirmelerden sonraki adres */
  adres: string;
  /** Küçük harfli başlık adları */
  basliklar: Record<string, string>;
  govde: Uint8Array;
  kesildi: boolean;
}

export type Getirici = (adres: string, s?: GetirSecenekleri) => Promise<GetirYaniti>;

/** Ağ katmanı hatası: zaman aşımı ya da bağlantı kurulamadı */
export class AgHatasi extends Error {
  constructor(
    readonly tur: "zaman_asimi" | "ag",
    mesaj: string,
  ) {
    super(mesaj);
  }
}

/** Akışı sınıra kadar okur; sınır aşılırsa okumayı keser */
async function sinirliOku(yanit: Response, sinir: number): Promise<{ govde: Uint8Array; kesildi: boolean }> {
  if (!yanit.body) return { govde: new Uint8Array(await yanit.arrayBuffer()), kesildi: false };
  const okuyucu = yanit.body.getReader();
  const parcalar: Uint8Array[] = [];
  let boyut = 0;
  let kesildi = false;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    if (boyut + value.byteLength > sinir) {
      parcalar.push(value.subarray(0, sinir - boyut));
      boyut = sinir;
      kesildi = true;
      await okuyucu.cancel().catch(() => undefined);
      break;
    }
    parcalar.push(value);
    boyut += value.byteLength;
  }
  const govde = new Uint8Array(boyut);
  let i = 0;
  for (const p of parcalar) {
    govde.set(p, i);
    i += p.byteLength;
  }
  return { govde, kesildi };
}

/** Node'un fetch'iyle getirir: yönlendirmeleri izler, süre gövde okunurken de işler */
export const varsayilanGetirici: Getirici = async (adres, s = {}) => {
  const denetleyici = new AbortController();
  const sure = s.zamanAsimiMs ?? 10_000;
  const zamanlayici = setTimeout(() => denetleyici.abort(), sure);
  try {
    const yanit = await fetch(adres, { method: s.yontem ?? "GET", headers: s.basliklar, body: s.govde, redirect: "follow", signal: denetleyici.signal });
    const { govde, kesildi } = await sinirliOku(yanit, s.enCokBayt ?? VARSAYILAN_SINIR_BAYT);
    const basliklar: Record<string, string> = {};
    yanit.headers.forEach((v, k) => (basliklar[k.toLowerCase()] = v));
    return { durum: yanit.status, adres: yanit.url || adres, basliklar, govde, kesildi };
  } catch (h) {
    if (denetleyici.signal.aborted) throw new AgHatasi("zaman_asimi", iki(`${Math.round(sure / 1000)} sn içinde yanıt gelmedi`, `no response within ${Math.round(sure / 1000)} s`));
    const neden = (h as { cause?: { code?: string; message?: string } }).cause;
    throw new AgHatasi("ag", neden?.code ?? neden?.message ?? (h as Error).message);
  } finally {
    clearTimeout(zamanlayici);
  }
};

/** Content-Type'tan ve (HTML'de) meta etiketinden karakter kodlaması */
function kodlamaBul(govde: Uint8Array, icerikTuru: string | undefined): string {
  const baslik = /charset=["']?([\w-]+)/i.exec(icerikTuru ?? "")?.[1];
  if (baslik) return baslik.toLowerCase();
  const bas = new TextDecoder("latin1").decode(govde.subarray(0, 4096));
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(bas)?.[1];
  return (meta ?? "utf-8").toLowerCase();
}

/** Gövdeyi metne çevirir; bilinmeyen kodlamada UTF-8 */
export function metneCevir(y: Pick<GetirYaniti, "govde" | "basliklar">): string {
  const kodlama = kodlamaBul(y.govde, y.basliklar["content-type"]);
  try {
    return new TextDecoder(kodlama).decode(y.govde);
  } catch {
    return new TextDecoder("utf-8").decode(y.govde);
  }
}

/** JSON gövdesi; çözülemezse null */
export function jsonCevir<T>(y: Pick<GetirYaniti, "govde" | "basliklar">): T | null {
  try {
    return JSON.parse(metneCevir(y)) as T;
  } catch {
    return null;
  }
}

/** HTML sayfası isteyen tarayıcı benzeri başlıklar */
export function tarayiciBasliklari(dil: Dil): Record<string, string> {
  return {
    "User-Agent": TARAYICI_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": dil === "tr" ? "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6" : "en-US,en;q=0.9",
  };
}

/** API isteği başlıkları: açıklayıcı User-Agent ve JSON */
export function apiBasliklari(ek: Record<string, string> = {}): Record<string, string> {
  return { "User-Agent": ARNORG_UA, Accept: "application/json", ...ek };
}

/** Testler ve sahte getiriciler için yanıt kurar */
export function yanitYap(durum: number, govde: string | Uint8Array, basliklar: Record<string, string> = {}, adres = "https://ornek.test/"): GetirYaniti {
  const bayt = typeof govde === "string" ? new TextEncoder().encode(govde) : govde;
  const kucuk: Record<string, string> = {};
  for (const [k, v] of Object.entries(basliklar)) kucuk[k.toLowerCase()] = v;
  return { durum, adres, basliklar: kucuk, govde: bayt, kesildi: false };
}
