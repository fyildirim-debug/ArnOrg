// Mesaj eklerinin saf yardımcıları: boyut metni, ekin kümesi (görsel, PDF, kod, veri, metin) ve kısa tür adı (PNG, PDF,
// MD, TS), tarayıcıda açmak için güvenli içerik türü, yapıştırılan adsız görselin adı, görsel ızgarasının düzeni,
// yüklemeden önceki yerel denetim. DOM'a dokunmaz.
import { EK_GORSEL_TURLERI, EK_SINIRLARI, type MesajEki } from "@arnorg/ortak";
import { useDilDurumu } from "../dil";

const turkce = () => useDilDurumu.getState().dil === "tr";

/** İnsan okur boyut: 812 B, 84 KB, 1,2 MB (İngilizce 1.2 MB) */
export function ekBoyutu(bayt: number): string {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${Math.round(bayt / 1024)} KB`;
  const mb = (bayt / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
  return `${turkce() ? mb.replace(".", ",") : mb} MB`;
}

/** Dosya başına sınır, MB */
export const EK_MB = EK_SINIRLARI.boyut / (1024 * 1024);

const uzanti = (ad: string): string => {
  const i = ad.lastIndexOf(".");
  return i > 0 ? ad.slice(i + 1).toLowerCase() : "";
};

const KOD = new Set(
  "js mjs cjs jsx ts mts cts tsx vue svelte astro py rb go rs java kt kts swift c h cpp cc cxx hpp hh cs fs php pl lua r dart scala clj ex exs erl hs ml sh bash zsh fish ps1 psm1 bat cmd sql graphql gql proto prisma tf hcl nix zig sol gradle css scss sass less html htm svg dockerfile makefile diff patch ipynb".split(
    " ",
  ),
);
const VERI = new Set("json jsonc json5 ndjson csv tsv yaml yml toml ini cfg conf xml properties lock".split(" "));

export type EkKumesi = "gorsel" | "pdf" | "kod" | "veri" | "metin";

/** Kartın simgesi ve tür adı: metin ekleri adın uzantısına göre kod, veri ya da düz metin */
export function ekKumesi(ek: Pick<MesajEki, "tur" | "ad">): EkKumesi {
  if (ek.tur === "gorsel" || ek.tur === "pdf") return ek.tur;
  const u = uzanti(ek.ad);
  if (KOD.has(u)) return "kod";
  if (VERI.has(u)) return "veri";
  return "metin";
}

/** Kısa tür adı: PNG, JPG, PDF, MD, TS; uzantı yoksa ya da çok uzunsa türden */
export function kisaTur(ek: Pick<MesajEki, "tur" | "ad" | "mime">): string {
  if (ek.tur === "pdf") return "PDF";
  if (ek.tur === "gorsel") return ek.mime === "image/jpeg" ? "JPG" : ek.mime.replace(/^image\//, "").toUpperCase();
  const u = uzanti(ek.ad);
  return u && u.length <= 4 ? u.toUpperCase() : "TXT";
}

const GORSEL_TURLERI = new Set<string>(Object.values(EK_GORSEL_TURLERI));

/** Görsel olarak gösterilebilir mi: yalnız PNG, JPEG, GIF, WebP (SVG asla) */
export function gorselMi(ek: Pick<MesajEki, "tur" | "mime">): boolean {
  return ek.tur === "gorsel" && GORSEL_TURLERI.has(ek.mime);
}

/**
 * Nesne adresinin içerik türü: görselde kendi türü, PDF'de application/pdf, metinde (SVG ve HTML de) yalnız düz metin.
 * Nesne adresi Stüdyo'nun kökenindedir; çalışabilen bir tür (HTML, SVG) asla verilmez.
 */
export function guvenliTur(ek: Pick<MesajEki, "tur" | "mime">): string {
  if (gorselMi(ek)) return ek.mime;
  if (ek.tur === "pdf") return "application/pdf";
  return "text/plain;charset=utf-8";
}

/** Tarayıcıda yeni sekmede açılır mı (PDF ve metin); görsel ışık kutusunda açılır */
export function sekmedeAcilir(ek: Pick<MesajEki, "tur">): boolean {
  return ek.tur === "pdf" || ek.tur === "metin";
}

/** Panodan yapıştırılan görselin adı: tarayıcı "image.png" verirse ön ek ve saatle (ekran-goruntusu-14-32-05.png) */
export function yapistirilanAd(dosya: Pick<File, "name" | "type">, onEk: string, zaman = new Date()): string {
  const ad = dosya.name.trim();
  if (ad && !/^image\.(png|jpe?g|gif|webp)$/i.test(ad)) return ad;
  const iki = (n: number) => String(n).padStart(2, "0");
  const u = dosya.type === "image/jpeg" ? "jpg" : (dosya.type.replace(/^image\//, "") || "png").replace(/[^a-z0-9]/g, "") || "png";
  return `${onEk}-${iki(zaman.getHours())}-${iki(zaman.getMinutes())}-${iki(zaman.getSeconds())}.${u}`;
}

/** Görsel ızgarası: tek görsel kendi oranında; 2 ve 4 iki sütun, ötekiler üç sütun; en çok altı kutu, sonuncusu "+N" */
export function izgara(n: number): { sutun: number; gorunen: number; kalan: number } {
  if (n <= 1) return { sutun: 1, gorunen: n, kalan: 0 };
  const sutun = n === 2 || n === 4 ? 2 : 3;
  const gorunen = Math.min(n, 6);
  return { sutun, gorunen, kalan: n - gorunen };
}

/** Dosya seçicinin kabul ettikleri: görseller, PDF, metin ve tanınan uzantılar (son sözü çekirdek söyler) */
export const DOSYA_KABULU = [
  ...Object.values(EK_GORSEL_TURLERI).filter((t, i, l) => l.indexOf(t) === i),
  "application/pdf",
  "text/*",
  ...["md", "json", "csv", "tsv", "yaml", "yml", "toml", "log", "txt", "xml", "svg", "html", ...KOD, ...VERI].filter((u, i, l) => l.indexOf(u) === i).map((u) => `.${u}`),
].join(",");

/** Yüklemeden önceki yerel denetim: boş ya da sınırı aşan dosya gönderilmez */
export function yerelDenetim(dosya: Pick<File, "size">): "bos" | "buyuk" | null {
  if (dosya.size <= 0) return "bos";
  if (dosya.size > EK_SINIRLARI.boyut) return "buyuk";
  return null;
}
