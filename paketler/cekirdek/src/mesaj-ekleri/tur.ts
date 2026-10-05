// Ek dosyalarının türü ve güvenliği: imza baytlarından tür tanıma (görsel, PDF, metin), görselin piksel boyutu,
// çalıştırılabilir dosya ve arşiv reddi, dosya adı temizliği, gizli dosya adı ve gizli içerik denetimi, base64 çözme.
// Diske ve ağa dokunmaz; ret açık bir iletiyle ArnorgHatasi olarak atılır.
import { EK_GORSEL_TURLERI, EK_METIN_UZANTILARI, EK_SINIRLARI, type MesajEkiTuru } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { ArnorgHatasi } from "../yardimci.js";

/** Görselin içerik türü (yalnız ajana ve Stüdyo'ya görsel olarak gidebilenler) */
export type GorselTuru = (typeof EK_GORSEL_TURLERI)[keyof typeof EK_GORSEL_TURLERI];

/** Metin ekinin sunulduğu tür: SVG ve HTML de düz metin olarak sunulur, tarayıcıda çalışmaz */
export const METIN_TURU = "text/plain; charset=utf-8";

/** İçerikten tanınan ek: tür, sunulacak içerik türü, saklanacak uzantı ve (metinde UTF-8'e çevrilmiş) içerik */
export interface TaninanEk {
  tur: MesajEkiTuru;
  mime: string;
  uzanti: string;
  icerik: Buffer;
  genislik?: number;
  yukseklik?: number;
}

export function mb(bayt: number): string {
  return (bayt / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

/** İnsan okur boyut: 812 B, 84 KB, 1.2 MB (Türkçede ondalık virgül) */
export function boyutMetni(bayt: number): string {
  const bicim = (n: number) => iki(n.toFixed(1).replace(/\.0$/, "").replace(".", ","), n.toFixed(1).replace(/\.0$/, ""));
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${Math.round(bayt / 1024)} KB`;
  return `${bicim(bayt / (1024 * 1024))} MB`;
}

// ===================================================================
// base64
// ===================================================================

/**
 * base64 içeriği çözer ve denetler: isteğe bağlı data: öneki, yalnız base64 karakterleri, boyut sınırı (çözmeden önce
 * hesaplanır). Sınır aşılırsa 413, geçersizse ya da boşsa 400.
 */
export function base64Coz(veri: string, sinir: number = EK_SINIRLARI.boyut): Buffer {
  const govde = veri.replace(/^data:[^,]{0,200};base64,/i, "").replace(/\s+/g, "");
  if (!govde) throw new ArnorgHatasi(iki("Dosya boş.", "The file is empty."));
  if (govde.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(govde)) {
    throw new ArnorgHatasi(iki("Dosya içeriği geçerli base64 değil.", "The file content is not valid base64."));
  }
  const dolgu = govde.endsWith("==") ? 2 : govde.endsWith("=") ? 1 : 0;
  const boyut = Math.floor((govde.length * 3) / 4) - dolgu;
  if (boyut > sinir) throw cokBuyuk(boyut, sinir);
  return Buffer.from(govde, "base64");
}

export function cokBuyuk(boyut: number, sinir: number = EK_SINIRLARI.boyut): ArnorgHatasi {
  return new ArnorgHatasi(
    iki(`Dosya çok büyük (${mb(boyut)} MB); en çok ${mb(sinir)} MB olabilir.`, `The file is too large (${mb(boyut)} MB); the limit is ${mb(sinir)} MB.`),
    413,
  );
}

// ===================================================================
// Dosya adı
// ===================================================================

/** Windows'un ayırdığı adlar (uzantılı da olsa) */
const AYRILMIS_AD = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Görünen ve indirilen ad: klasör kısmı atılır; denetim, yön değiştiren (uzantı gizleyen) ve sıfır genişlikli
 * karakterler, Windows'ta geçersiz karakterler çıkar; boşluklar tekleşir, sondaki nokta ve boşluk kırpılır; Windows'un
 * ayırdığı adlar öne _ alır; uzantı korunarak en çok 120 karaktere kısalır. Boş kalırsa yedek ad.
 */
export function adTemizle(ham: string, yedek = "dosya"): string {
  let ad = (ham.split(/[\\/]/).pop() ?? "").normalize("NFC");
  ad = ad
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
  if (!ad || /^\.+$/.test(ad)) ad = yedek;
  const nokta = ad.lastIndexOf(".");
  const govde = nokta > 0 ? ad.slice(0, nokta) : ad;
  const uzanti = nokta > 0 ? ad.slice(nokta) : "";
  const temizGovde = AYRILMIS_AD.test(govde) ? `_${govde}` : govde;
  const sinir = EK_SINIRLARI.ad;
  if (temizGovde.length + uzanti.length <= sinir) return temizGovde + uzanti;
  const kisaUzanti = uzanti.length <= 16 ? uzanti : "";
  return `${Array.from(temizGovde).slice(0, sinir - kisaUzanti.length - 1).join("")}…${kisaUzanti}`;
}

/** Adın küçük harfli uzantısı (noktasız); yoksa "" */
export function uzantisi(ad: string): string {
  const nokta = ad.lastIndexOf(".");
  return nokta > 0 ? ad.slice(nokta + 1).toLowerCase() : "";
}

// ===================================================================
// İmza baytları
// ===================================================================

const bas = (t: Buffer, ...b: number[]) => t.length >= b.length && b.every((x, i) => t[i] === x);
const ascii = (t: Buffer, konum: number, metin: string) => t.length >= konum + metin.length && t.toString("latin1", konum, konum + metin.length) === metin;

/** Desteklenen görselin türü (imzadan); değilse null */
export function gorselImzasi(t: Buffer): GorselTuru | null {
  if (bas(t, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (bas(t, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(t, 0, "GIF87a") || ascii(t, 0, "GIF89a")) return "image/gif";
  if (ascii(t, 0, "RIFF") && ascii(t, 8, "WEBP")) return "image/webp";
  return null;
}

/** Reddedilen ikili dosya türleri: çalıştırılabilir, arşiv, desteklenmeyen görsel, ses ya da görüntü, öteki ikili biçimler */
type Ret = "calistirilabilir" | "arsiv" | "gorsel" | "medya" | "ikili";

function reddedilen(t: Buffer): Ret | null {
  // Çalıştırılabilir: ELF, Windows PE (MZ), Mach-O ve evrensel ikili (Java sınıfı da CAFEBABE), WebAssembly, Dalvik
  if (bas(t, 0x7f, 0x45, 0x4c, 0x46) || bas(t, 0x4d, 0x5a)) return "calistirilabilir";
  if ([[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]].some((b) => bas(t, ...b))) return "calistirilabilir";
  if (bas(t, 0x00, 0x61, 0x73, 0x6d) || ascii(t, 0, "dex\n")) return "calistirilabilir";
  // Arşiv: zip (docx, xlsx, jar, apk da), gzip, bzip2, xz, 7z, rar, zstd, lz4, cab, ar/deb, rpm, tar, ISO 9660
  if (bas(t, 0x50, 0x4b, 0x03, 0x04) || bas(t, 0x50, 0x4b, 0x05, 0x06) || bas(t, 0x50, 0x4b, 0x07, 0x08)) return "arsiv";
  if (bas(t, 0x1f, 0x8b) || ascii(t, 0, "BZh") || bas(t, 0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00) || bas(t, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return "arsiv";
  if (ascii(t, 0, "Rar!\u001a\u0007") || bas(t, 0x28, 0xb5, 0x2f, 0xfd) || bas(t, 0x04, 0x22, 0x4d, 0x18) || ascii(t, 0, "MSCF") || ascii(t, 0, "!<arch>\n")) return "arsiv";
  if (bas(t, 0xed, 0xab, 0xee, 0xdb) || ascii(t, 257, "ustar") || ascii(t, 0x8001, "CD001")) return "arsiv";
  // Desteklenmeyen görseller: BMP (başlıktaki boyut dosyayla tutar), TIFF, ICO, PSD, HEIC ve AVIF (ftyp markası)
  if (ascii(t, 0, "BM") && t.length >= 6 && t.readUInt32LE(2) === t.length) return "gorsel";
  if (ascii(t, 0, "II*\u0000") || ascii(t, 0, "MM\u0000*") || bas(t, 0x00, 0x00, 0x01, 0x00) || ascii(t, 0, "8BPS")) return "gorsel";
  if (ascii(t, 4, "ftyp")) return /^(heic|heix|hevc|mif1|msf1|avif|avis)/.test(t.toString("latin1", 8, 12)) ? "gorsel" : "medya";
  // Ses ve görüntü: MP3, Ogg, FLAC, WAV ve AVI (RIFF), Matroska ve WebM
  if (ascii(t, 0, "ID3") || bas(t, 0xff, 0xfb) || bas(t, 0xff, 0xf3) || bas(t, 0xff, 0xf2) || ascii(t, 0, "OggS") || ascii(t, 0, "fLaC")) return "medya";
  if ((ascii(t, 0, "RIFF") && !ascii(t, 8, "WEBP")) || bas(t, 0x1a, 0x45, 0xdf, 0xa3)) return "medya";
  // Öteki ikili biçimler: SQLite, OLE (eski Office, MSI)
  if (ascii(t, 0, "SQLite format 3\u0000") || bas(t, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "ikili";
  return null;
}

function retHatasi(ret: Ret): ArnorgHatasi {
  switch (ret) {
    case "calistirilabilir":
      return new ArnorgHatasi(iki("Çalıştırılabilir dosyalar eklenemez.", "Executable files can't be attached."), 415);
    case "arsiv":
      return new ArnorgHatasi(
        iki("Arşiv dosyaları (zip, tar, 7z, rar; docx ve xlsx de zip'tir) eklenemez; dosyaları tek tek ekleyin.", "Archives (zip, tar, 7z, rar; docx and xlsx are zips too) can't be attached; attach the files one by one."),
        415,
      );
    case "gorsel":
      return new ArnorgHatasi(iki("Bu görsel biçimi desteklenmiyor; PNG, JPEG, GIF ya da WebP gönderin.", "This image format isn't supported; send PNG, JPEG, GIF or WebP."), 415);
    default:
      return desteklenmiyor();
  }
}

function desteklenmiyor(): ArnorgHatasi {
  return new ArnorgHatasi(
    iki("Bu dosya türü desteklenmiyor; görsel (PNG, JPEG, GIF, WebP), PDF ya da metin ve kod dosyası ekleyin.", "This file type isn't supported; attach an image (PNG, JPEG, GIF, WebP), a PDF or a text or code file."),
    415,
  );
}

// ===================================================================
// Görselin piksel boyutu
// ===================================================================

/** Görselin genişliği ve yüksekliği başlığından; okunamazsa null */
export function gorselBoyutu(t: Buffer, tur: GorselTuru): { genislik: number; yukseklik: number } | null {
  try {
    if (tur === "image/png") {
      if (t.length < 24 || !ascii(t, 12, "IHDR")) return null;
      return gecerli(t.readUInt32BE(16), t.readUInt32BE(20));
    }
    if (tur === "image/gif") return t.length < 10 ? null : gecerli(t.readUInt16LE(6), t.readUInt16LE(8));
    if (tur === "image/webp") return webpBoyutu(t);
    return jpegBoyutu(t);
  } catch {
    return null;
  }
}

function gecerli(genislik: number, yukseklik: number): { genislik: number; yukseklik: number } | null {
  return genislik > 0 && yukseklik > 0 ? { genislik, yukseklik } : null;
}

function webpBoyutu(t: Buffer): { genislik: number; yukseklik: number } | null {
  if (t.length < 30) return null;
  const parca = t.toString("latin1", 12, 16);
  // Kayıplı: anahtar karenin 14 bitlik genişlik ve yüksekliği
  if (parca === "VP8 ") return gecerli(t.readUInt16LE(26) & 0x3fff, t.readUInt16LE(28) & 0x3fff);
  // Kayıpsız: 0x2f imzasından sonra 14'er bit (değer - 1)
  if (parca === "VP8L") {
    if (t[20] !== 0x2f) return null;
    const b = t.readUInt32LE(21);
    return gecerli((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
  }
  // Genişletilmiş: 24 bitlik tuval genişliği ve yüksekliği (değer - 1)
  if (parca === "VP8X") return gecerli(t.readUIntLE(24, 3) + 1, t.readUIntLE(27, 3) + 1);
  return null;
}

function jpegBoyutu(t: Buffer): { genislik: number; yukseklik: number } | null {
  let i = 2;
  while (i + 9 < t.length) {
    if (t[i] !== 0xff) {
      i++;
      continue;
    }
    const isaret = t[i + 1]!;
    // Doldurma ve bağımsız işaretler (RST, SOI, TEM) uzunluk taşımaz
    if (isaret === 0xff || isaret === 0x01 || (isaret >= 0xd0 && isaret <= 0xd8)) {
      i += isaret === 0xff ? 1 : 2;
      continue;
    }
    if (isaret === 0xd9 || isaret === 0xda) return null;
    // SOF0–SOF15 (DHT, JPG ve DAC hariç): yükseklik, genişlik
    if (isaret >= 0xc0 && isaret <= 0xcf && isaret !== 0xc4 && isaret !== 0xc8 && isaret !== 0xcc) return gecerli(t.readUInt16BE(i + 7), t.readUInt16BE(i + 5));
    i += 2 + t.readUInt16BE(i + 2);
  }
  return null;
}

// ===================================================================
// Tür tanıma
// ===================================================================

const METIN_UZANTILARI = new Set<string>(EK_METIN_UZANTILARI);
const UZANTI_ADLARI: Record<string, string> = { dockerfile: "dockerfile", makefile: "makefile", gnumakefile: "makefile" };

/**
 * Metin: UTF-16 (BOM'lu) UTF-8'e çevrilir; UTF-8 kesin denetlenir. NUL karakteri ya da sekme, satır sonu ve ANSI kaçışı
 * dışındaki denetim karakterleri %1'i geçerse ikili sayılır. Metin değilse null.
 */
function metinCoz(t: Buffer): Buffer | null {
  let metin: string;
  try {
    if (bas(t, 0xff, 0xfe)) metin = new TextDecoder("utf-16le", { fatal: true }).decode(t.subarray(2));
    else if (bas(t, 0xfe, 0xff)) metin = new TextDecoder("utf-16be", { fatal: true }).decode(t.subarray(2));
    else metin = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(t);
  } catch {
    return null;
  }
  if (metin.includes("\u0000")) return null;
  const denetim = metin.match(/[\u0001-\u0008\u000e-\u001a\u001c-\u001f\u007f]/g)?.length ?? 0;
  if (denetim > Math.max(2, metin.length / 100)) return null;
  return bas(t, 0xff, 0xfe) || bas(t, 0xfe, 0xff) ? Buffer.from(metin, "utf8") : t;
}

/**
 * Ekin türü içerikten tanınır, adın uzantısından değil: önce görsel imzaları (PNG, JPEG, GIF, WebP), sonra reddedilen
 * ikili biçimler (çalıştırılabilir, arşiv, desteklenmeyen görsel, ses ve görüntü), PDF (%PDF- ilk 1024 baytta) ve en son
 * UTF-8 metin. Metin, adın uzantısı tanınıyorsa onunla (yoksa .txt) saklanır. Boş dosya, sınırı aşan dosya ve tanınmayan
 * ikili reddedilir.
 */
export function ekTuru(icerik: Buffer, ad: string): TaninanEk {
  if (!icerik.length) throw new ArnorgHatasi(iki("Dosya boş.", "The file is empty."));
  if (icerik.length > EK_SINIRLARI.boyut) throw cokBuyuk(icerik.length);
  const gorsel = gorselImzasi(icerik);
  if (gorsel) {
    const uzanti = gorsel === "image/jpeg" ? "jpg" : gorsel.slice("image/".length);
    return { tur: "gorsel", mime: gorsel, uzanti, icerik, ...(gorselBoyutu(icerik, gorsel) ?? {}) };
  }
  const ret = reddedilen(icerik);
  if (ret) throw retHatasi(ret);
  if (icerik.subarray(0, 1024).includes("%PDF-")) return { tur: "pdf", mime: "application/pdf", uzanti: "pdf", icerik };
  const metin = metinCoz(icerik);
  if (!metin) throw desteklenmiyor();
  if (metin.length > EK_SINIRLARI.boyut) throw cokBuyuk(metin.length);
  const u = uzantisi(ad);
  const uzanti = METIN_UZANTILARI.has(u) ? u : (UZANTI_ADLARI[ad.toLowerCase()] ?? "txt");
  return { tur: "metin", mime: METIN_TURU, uzanti, icerik: metin };
}

// ===================================================================
// Gizli dosyalar
// ===================================================================

/** Paylaşılamayan klasörler: anahtarlar, bulut kimlikleri, git'in iç dosyaları */
const GIZLI_KLASORLER = new Set([".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker", ".git", ".password-store", ".terraform.d"]);
/** Anahtar ve sertifika uzantıları */
const GIZLI_UZANTILAR = new Set(["pem", "key", "p12", "pfx", "p8", "crt", "cer", "der", "csr", "jks", "keystore", "ppk", "kdbx", "gpg", "asc", "ovpn", "tfstate"]);
/** Bilinen gizli dosya adları: .env ve türevleri, SSH anahtarları, paket yöneticisi ve git kimlikleri, ArnOrg'un erişim anahtarı */
const GIZLI_ADLAR =
  /^(?:\.env.*|\.envrc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|\.npmrc|\.yarnrc(?:\.yml)?|\.pypirc|\.netrc|_netrc|\.git-credentials|\.htpasswd|\.pgpass|credentials(?:\..*)?|known_hosts|authorized_keys|erisim-anahtari)$/i;
/** Adında gizli bilgi geçen dosyalar: secret, credential, password, api key, private key, service account */
const GIZLI_KALIP = /(?:^|[._\- ])(?:secrets?|credentials?|passwords?|passwd|api[_-]?keys?|private[_-]?keys?|service[_-]?accounts?)(?:[._\- ]|$)/i;

/** Yol gizli bir dosyayı ya da gizli bir klasörün içini gösteriyor mu (adına ve klasörlerine bakılır) */
export function gizliDosyaMi(yol: string): boolean {
  const parcalar = yol.split(/[\\/]+/).filter(Boolean);
  const ad = parcalar.at(-1) ?? "";
  if (parcalar.slice(0, -1).some((p) => GIZLI_KLASORLER.has(p.toLowerCase()))) return true;
  if (GIZLI_ADLAR.test(ad) || GIZLI_KALIP.test(ad)) return true;
  return GIZLI_UZANTILAR.has(uzantisi(ad));
}

/** Metinde bilinen gizli bilgi kalıpları: özel anahtar bloğu, AWS, GitHub, Anthropic, Slack, Google ve Stripe anahtarları */
const GIZLI_ICERIK = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\b[rs]k_live_[0-9A-Za-z]{20,}/,
];

export function gizliIcerikVarMi(metin: string): boolean {
  return GIZLI_ICERIK.some((d) => d.test(metin));
}
