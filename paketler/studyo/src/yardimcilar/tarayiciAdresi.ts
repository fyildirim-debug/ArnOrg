// Tarayıcı ekranının saf yardımcıları: adres çubuğuna yazılanın çözümü (adres mi arama mı), notlarda gösterilen
// kısa adres, not penceresinin seçilen öğenin yanındaki yeri. Birim testleri: tarayiciAdresi.test.ts

/** Adres değilse gidilen arama */
export const ARAMA_ADRESI = "https://duckduckgo.com/?q=";

const YEREL = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(:\d{1,5})?([/?#].*)?$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?([/?#].*)?$/;
/** ornek.com, alt.ornek.com.tr/yol, panel.local:3000 */
const ALAN_ADI = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}(:\d{1,5})?([/?#].*)?$/i;
/** sunucu:8080 */
const MAKINE_PORT = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?:\d{1,5}([/?#].*)?$/i;

function gecerli(adres: string): string | null {
  try {
    const u = new URL(adres);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Yazılan metin bir adres mi: http(s) adresi aynen; localhost, IP ve portlu makine http://; alan adı portsuzsa
 * https://, portluysa http:// ile tamamlanır. Boşluk içeren ya da başka protokollü metin adres sayılmaz (null).
 */
export function adresMi(girdi: string): string | null {
  const metin = girdi.trim();
  if (!metin || /\s/.test(metin)) return null;
  if (/^https?:\/\//i.test(metin)) return gecerli(metin);
  if (YEREL.test(metin) || IPV4.test(metin) || MAKINE_PORT.test(metin)) return gecerli(`http://${metin}`);
  const alan = ALAN_ADI.exec(metin);
  if (alan) return gecerli(`${alan[2] ? "http" : "https"}://${metin}`);
  return null;
}

/** Adres çubuğu: adresse oraya, değilse aramaya gider; boşsa boş */
export function adresCoz(girdi: string, arama = ARAMA_ADRESI): string {
  const metin = girdi.trim();
  if (!metin) return "";
  if (metin === "about:blank") return metin;
  return adresMi(metin) ?? `${arama}${encodeURIComponent(metin)}`;
}

/** Notlarda gösterilen kısa adres: makine, yol ve sorgu (http(s):// ve sondaki / atılır) */
export function kisaAdres(adres: string): string {
  try {
    const u = new URL(adres);
    if (u.protocol !== "http:" && u.protocol !== "https:") return adres;
    const yol = `${u.pathname}${u.search}${u.hash}`;
    return `${u.host}${yol === "/" ? "" : yol}`;
  } catch {
    return adres;
  }
}

export interface Kutu {
  x: number;
  y: number;
  genislik: number;
  yukseklik: number;
}

/**
 * Not penceresinin yeri (sahne içinde): seçilen öğenin sağında, sığmazsa solunda, altında, üstünde; hiçbiri
 * olmazsa ortada. Sonuç sahnenin içine sıkıştırılır. Öğe ve pencere boyutları sahne koordinatlarındadır.
 */
export function notKonumu(oge: Kutu | null, pencere: { genislik: number; yukseklik: number }, sahne: { genislik: number; yukseklik: number }, aralik = 12): { sol: number; ust: number } {
  const kenar = 8;
  const sikistir = (deger: number, enCok: number) => Math.max(kenar, Math.min(deger, enCok - kenar));
  const ortaUst = Math.max(kenar, (sahne.yukseklik - pencere.yukseklik) / 2);
  const orta = { sol: Math.max(kenar, (sahne.genislik - pencere.genislik) / 2), ust: ortaUst };
  if (!oge) return orta;
  const ustHizali = sikistir(oge.y, sahne.yukseklik - pencere.yukseklik);
  const solHizali = sikistir(oge.x, sahne.genislik - pencere.genislik);
  const sag = oge.x + oge.genislik + aralik;
  if (sag + pencere.genislik <= sahne.genislik - kenar) return { sol: sag, ust: ustHizali };
  const sol = oge.x - aralik - pencere.genislik;
  if (sol >= kenar) return { sol, ust: ustHizali };
  const alt = oge.y + oge.yukseklik + aralik;
  if (alt + pencere.yukseklik <= sahne.yukseklik - kenar) return { sol: solHizali, ust: alt };
  const ust = oge.y - aralik - pencere.yukseklik;
  if (ust >= kenar) return { sol: solHizali, ust };
  return orta;
}
