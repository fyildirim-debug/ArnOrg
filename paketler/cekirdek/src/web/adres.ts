// Adres yardımcıları: arama sonuçlarının tekilleştirilmesi için normal biçim, izleme parametreleri,
// okunacak adresin doğrulanması ve yerel ağ adresinin tanınması
import net from "node:net";
import { iki } from "../dil.js";
import { ArnorgHatasi } from "../yardimci.js";

/** Sonuç adreslerinden atılan izleme parametreleri */
const IZLEME = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "_hsenc",
  "_hsmi",
  "_ga",
  "_gl",
  "ref_src",
  "ref_url",
  "spm",
  "scid",
  "vero_id",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
  "s_cid",
  "si",
  "trk",
  "trkcampaign",
  "cmpid",
  "campaign_id",
]);

export function izlemeParametresiMi(ad: string): boolean {
  const k = ad.toLowerCase();
  return k.startsWith("utm_") || k.startsWith("pk_") || k.startsWith("mtm_") || IZLEME.has(k);
}

/** İzleme parametreleri ve parça kimliği atılmış adres; geçersiz adres olduğu gibi döner */
export function adresiTemizle(adres: string): string {
  try {
    const u = new URL(adres);
    for (const k of [...u.searchParams.keys()]) if (izlemeParametresiMi(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return adres;
  }
}

/**
 * Tekilleştirme anahtarı: http/https farkı, "www." öneki, sondaki "/", izleme parametreleri, parametre sırası ve
 * parça kimliği yok sayılır; yol kodlaması çözülür. Aynı anahtarı taşıyan sonuçlar tek sonuçta birleşir.
 */
export function adresAnahtari(adres: string): string {
  let u: URL;
  try {
    u = new URL(adres);
  } catch {
    return adres.trim().toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const port = u.port && !["80", "443"].includes(u.port) ? `:${u.port}` : "";
  let yol = u.pathname;
  try {
    yol = decodeURI(yol);
  } catch {
    // bozuk yüzde kodlaması olduğu gibi kalır
  }
  yol = yol.replace(/\/+$/, "");
  const parametreler = [...u.searchParams.entries()].filter(([k]) => !izlemeParametresiMi(k)).sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  const sorgu = parametreler.length ? `?${new URLSearchParams(parametreler).toString()}` : "";
  return `${host}${port}${yol}${sorgu}`;
}

/** Okunacak adresi doğrular: yalnız http ve https. Şeması olmayan ada https:// (yerel adreste http://) eklenir */
export function httpAdresi(girdi: string): URL {
  const ham = girdi.trim();
  if (!ham) throw new ArnorgHatasi(iki("Adres boş olamaz.", "The address cannot be empty."));
  // "localhost:5173/x" gibi sunucu:port biçimi şema sayılmaz
  const semasiVar = /^[a-z][a-z0-9+.-]*:/i.test(ham) && !/^[^:/]+:\d+(\/|$)/.test(ham);
  let u: URL;
  try {
    if (semasiVar) u = new URL(ham);
    else {
      const govde = ham.replace(/^\/\//, "");
      u = new URL(`https://${govde}`);
      if (yerelAdresMi(u)) u = new URL(`http://${govde}`);
    }
  } catch {
    throw new ArnorgHatasi(iki(`Geçersiz adres: ${kisaGoster(ham)}`, `Invalid address: ${kisaGoster(ham)}`));
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new ArnorgHatasi(iki(`Yalnız http ve https adresleri okunur (${u.protocol} değil).`, `Only http and https addresses can be read (not ${u.protocol}).`));
  }
  if (!u.hostname) throw new ArnorgHatasi(iki(`Adreste sunucu adı yok: ${kisaGoster(ham)}`, `The address has no host name: ${kisaGoster(ham)}`));
  return u;
}

function kisaGoster(s: string): string {
  return s.length > 120 ? `${s.slice(0, 119)}…` : s;
}

/** IPv4 özel, döngü ya da bağlantı yerel aralıkta mı */
function ozelIpv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Yerel makine ya da özel ağ adresi mi: localhost, *.localhost, *.local, *.internal, noktasız ad, özel ve döngü IP'leri.
 * Ajanlar bu adresleri okuyabilir (kendi geliştirme sunucuları); dış okuyucuya (r.jina.ai) hiç gönderilmez.
 */
export function yerelAdresMi(adres: string | URL): boolean {
  let host: string;
  try {
    host = (typeof adres === "string" ? new URL(adres) : adres).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa")) return true;
  const tur = net.isIP(host);
  if (tur === 4) return ozelIpv4(host);
  if (tur === 6) {
    if (host === "::1" || host === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;
    const gomulu = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host)?.[1];
    return gomulu ? ozelIpv4(gomulu) : false;
  }
  return !host.includes(".");
}

/** Görünen alan adı: "www." öneki atılmış sunucu adı */
export function alanAdi(adres: string): string {
  try {
    return new URL(adres).hostname.replace(/^www\./, "");
  } catch {
    return adres;
  }
}
