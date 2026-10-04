// İçerik dönüştürücüler: HTML (linkedom + Readability, bulamazsa gövde metni → turndown + gfm), PDF (unpdf),
// JSON, düz metin ve görsel bilgisi. Çıktı ajanın okuyacağı temiz Markdown'dır.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { WebIcerikTuru } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { alanAdi } from "./adres.js";

export interface Donusum {
  baslik: string | null;
  site: string | null;
  yazar: string | null;
  tarih: string | null;
  markdown: string;
  baglantilar: { metin: string; adres: string }[];
  uyarilar: string[];
}

const BAGLANTI_SINIRI = 40;

// ---------------------------------------------------------------------------
// Tür tanıma
// ---------------------------------------------------------------------------

function basBaytlar(govde: Uint8Array, n: number): string {
  return new TextDecoder("latin1").decode(govde.subarray(0, n));
}

/** Content-Type ve ilk baytlardan içerik türü */
export function icerikTuru(icerikTuruBasligi: string | undefined, govde: Uint8Array): WebIcerikTuru {
  const ct = (icerikTuruBasligi ?? "").toLowerCase().split(";")[0]!.trim();
  const bas = basBaytlar(govde, 512);
  if (ct === "application/pdf" || bas.startsWith("%PDF-")) return "pdf";
  if (ct.startsWith("image/") || gorselImzasi(govde)) return "gorsel";
  if (ct === "application/json" || ct.endsWith("+json") || ct === "text/json") return "json";
  if (ct === "text/html" || ct === "application/xhtml+xml") return "html";
  const metinBas = bas.replace(/^﻿|^\xEF\xBB\xBF/, "").trimStart();
  if (!ct || ct === "text/plain" || ct === "application/octet-stream") {
    if (/^<!doctype html|^<html[\s>]|^<head[\s>]/i.test(metinBas)) return "html";
    if (/^[[{]/.test(metinBas) && jsonMu(govde)) return "json";
  }
  if (ct.startsWith("text/") || /(\+xml|\/xml|javascript|ecmascript|x-yaml|yaml|toml|x-sh|csv)$/.test(ct)) return "metin";
  if (ct === "application/octet-stream" || !ct) return metinMi(govde) ? "metin" : "diger";
  return "diger";
}

function jsonMu(govde: Uint8Array): boolean {
  try {
    JSON.parse(new TextDecoder("utf-8").decode(govde));
    return true;
  } catch {
    return false;
  }
}

/** İlk 4 KB'ta denetim karakteri az mı (ikili dosya değil mi) */
function metinMi(govde: Uint8Array): boolean {
  const n = Math.min(govde.length, 4096);
  let garip = 0;
  for (let i = 0; i < n; i++) {
    const b = govde[i]!;
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) garip++;
  }
  return garip < n * 0.02;
}

function gorselImzasi(g: Uint8Array): string | null {
  if (g[0] === 0x89 && g[1] === 0x50 && g[2] === 0x4e && g[3] === 0x47) return "image/png";
  if (g[0] === 0xff && g[1] === 0xd8 && g[2] === 0xff) return "image/jpeg";
  if (g[0] === 0x47 && g[1] === 0x49 && g[2] === 0x46) return "image/gif";
  if (basBaytlar(g, 4) === "RIFF" && basBaytlar(g.subarray(8), 4) === "WEBP") return "image/webp";
  return null;
}

/** PNG, GIF ve JPEG için en × boy */
function gorselBoyutu(g: Uint8Array): { en: number; boy: number } | null {
  const dv = new DataView(g.buffer, g.byteOffset, g.byteLength);
  try {
    if (g[0] === 0x89 && g[1] === 0x50 && g.length >= 24) return { en: dv.getUint32(16), boy: dv.getUint32(20) };
    if (g[0] === 0x47 && g[1] === 0x49 && g.length >= 10) return { en: dv.getUint16(6, true), boy: dv.getUint16(8, true) };
    if (g[0] === 0xff && g[1] === 0xd8) {
      let i = 2;
      while (i + 9 < g.length) {
        if (g[i] !== 0xff) return null;
        const isaret = g[i + 1]!;
        const uzunluk = dv.getUint16(i + 2);
        // SOF0–SOF15 (C4, C8 ve CC hariç)
        if (isaret >= 0xc0 && isaret <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(isaret)) return { en: dv.getUint16(i + 7), boy: dv.getUint16(i + 5) };
        i += 2 + uzunluk;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function boyutMetni(bayt: number): string {
  if (bayt >= 1024 * 1024) return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
  if (bayt >= 1024) return `${Math.round(bayt / 1024)} KB`;
  return `${bayt} B`;
}

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

let turndown: TurndownService | null = null;

function turndownHizmeti(): TurndownService {
  if (turndown) return turndown;
  const t = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "_", hr: "---" });
  t.use(gfm);
  t.remove(["script", "style", "noscript", "iframe", "button", "form", "input", "select", "textarea", "svg", "canvas", "template", "object", "embed"]);
  // Görseller yalnız açıklaması varsa ve http(s) adresliyse kalır (data: adresleri bağlamı şişirir)
  t.addRule("gorsel", {
    filter: "img",
    replacement: (_icerik, dugum) => {
      const d = dugum as unknown as { getAttribute(ad: string): string | null };
      const alt = (d.getAttribute("alt") ?? "").replace(/\s+/g, " ").trim();
      const src = d.getAttribute("src") ?? "";
      return alt && /^https?:\/\//i.test(src) ? `![${alt.replace(/[[\]]/g, "")}](${src})` : "";
    },
  });
  // Sayfa içi bağlantılar (başlık çapaları, "#bolum") yalnız metin olarak kalır; "#", "¶" gibi çapa işaretleri ve
  // metni olmayan bağlantılar ([](…)) atılır
  t.addRule("sayfaIciBaglanti", {
    filter: (dugum) => {
      if (dugum.nodeName !== "A") return false;
      const d = dugum as unknown as { getAttribute(ad: string): string | null; textContent: string | null; querySelector(s: string): unknown };
      return /^#/.test(d.getAttribute("href") ?? "") || (!(d.textContent ?? "").trim() && !d.querySelector("img"));
    },
    replacement: (icerik) => (/^\s*[#¶§]?\s*$/.test(icerik) ? "" : icerik),
  });
  // Dil sınıfı pre'nin kendisinde olan kod blokları (<pre class="language-ts">)
  t.addRule("onSinifliKod", {
    filter: (dugum) => dugum.nodeName === "PRE" && !(dugum.firstChild && dugum.firstChild.nodeName === "CODE"),
    replacement: (_icerik, dugum) => {
      const d = dugum as unknown as { getAttribute(ad: string): string | null; textContent: string | null };
      const dil = /(?:language|lang)-([\w+#-]+)/.exec(d.getAttribute("class") ?? "")?.[1] ?? "";
      const kod = (d.textContent ?? "").replace(/\n+$/, "");
      const cit = kod.includes("```") ? "~~~" : "```";
      return `\n\n${cit}${dil}\n${kod}\n${cit}\n\n`;
    },
  });
  turndown = t;
  return t;
}

/** Turndown çıktısını sadeleştirir: fazla boş satırlar, satır sonu boşlukları */
function markdownSadele(md: string): string {
  return md
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Başlık satırı olmayan (düzen için kullanılan) tablolar satır satır metne açılır: GFM tablo başlığı ister, yoksa
 * turndown tabloyu ham HTML bırakırdı. İç içe tablolar içten dışa açılır; başlıklı veri tabloları olduğu gibi kalır.
 */
export function tablolariDuzle(html: string): string {
  if (!/<table[\s>]/i.test(html)) return html;
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const hucreMi = (e: { tagName: string }) => e.tagName === "TD" || e.tagName === "TH";
  for (const tablo of [...document.querySelectorAll("table")].reverse()) {
    const satirlar = [...tablo.querySelectorAll("tr")].filter((tr) => tr.closest("table") === tablo);
    const ilk = satirlar[0];
    const baslikli = !!ilk && (ilk.parentElement?.tagName === "THEAD" || [...ilk.children].filter(hucreMi).every((h) => h.tagName === "TH"));
    if (baslikli && !tablo.querySelector("table")) continue;
    const kap = document.createElement("div");
    for (const tr of satirlar) {
      const hucreler = [...tr.children].filter(hucreMi).filter((h) => (h.textContent ?? "").trim() || h.querySelector("img"));
      if (!hucreler.length) continue;
      const satir = document.createElement("div");
      hucreler.forEach((h, i) => {
        if (i) satir.appendChild(document.createTextNode(" · "));
        while (h.firstChild) satir.appendChild(h.firstChild);
      });
      kap.appendChild(satir);
    }
    tablo.replaceWith(kap);
  }
  return document.body?.innerHTML ?? html;
}

export function htmlMarkdowna(html: string): string {
  return markdownSadele(turndownHizmeti().turndown(tablolariDuzle(html)));
}

type Belge = ReturnType<typeof parseHTML>["document"];

/** Bağlantı ve görsel adreslerini mutlak yapar; çözülemeyen ve javascript: bağlantıları ayıklar */
function adresleriMutlakYap(document: Belge, taban: string): void {
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#")) continue;
    try {
      const u = new URL(href, taban);
      if (u.protocol === "javascript:") a.removeAttribute("href");
      else a.setAttribute("href", u.toString());
    } catch {
      a.removeAttribute("href");
    }
  }
  for (const img of document.querySelectorAll("img")) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    try {
      if (src) img.setAttribute("src", new URL(src, taban).toString());
    } catch {
      img.removeAttribute("src");
    }
  }
}

function metaIcerik(document: Belge, ...secici: string[]): string | null {
  for (const s of secici) {
    const v = document.querySelector(s)?.getAttribute("content")?.trim();
    if (v) return v;
  }
  return null;
}

/** JSON-LD'deki yazar ve yayın tarihi */
function jsonLdBilgisi(document: Belge): { yazar: string | null; tarih: string | null } {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const v: unknown = JSON.parse(s.textContent ?? "");
      const ogeler = (Array.isArray(v) ? v : [v, ...(((v as { "@graph"?: unknown[] })?.["@graph"] as unknown[]) ?? [])]) as Record<string, unknown>[];
      for (const o of ogeler) {
        if (!o || typeof o !== "object") continue;
        const yazarHam = o.author as unknown;
        const yazarlar = (Array.isArray(yazarHam) ? yazarHam : [yazarHam])
          .map((y) => (typeof y === "string" ? y : (y as { name?: string } | null)?.name))
          .filter((y): y is string => typeof y === "string" && !!y.trim());
        const tarih = typeof o.datePublished === "string" ? o.datePublished : null;
        if (yazarlar.length || tarih) return { yazar: yazarlar.join(", ") || null, tarih };
      }
    } catch {
      // bozuk JSON-LD atlanır
    }
  }
  return { yazar: null, tarih: null };
}

/** HTML parçasındaki önemli bağlantılar: http(s), metinli, tekil */
function baglantilariTopla(html: string): { metin: string; adres: string }[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const gorulen = new Set<string>();
  const sonuc: { metin: string; adres: string }[] = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const adres = a.getAttribute("href") ?? "";
    const metin = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!/^https?:\/\//i.test(adres) || metin.length < 2 || gorulen.has(adres)) continue;
    gorulen.add(adres);
    sonuc.push({ metin: metin.length > 100 ? `${metin.slice(0, 99)}…` : metin, adres });
    if (sonuc.length >= BAGLANTI_SINIRI) break;
  }
  return sonuc;
}

/** Ana içerik bulunamayınca gövdeden gezinti, üst ve alt bilgi, form ve betikler atılır */
const GURULTU = "script, style, noscript, template, nav, header, footer, aside, form, iframe, svg, canvas, button, dialog, [role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true], .cookie, #cookie-banner";

/**
 * HTML sayfasını Markdown'a çevirir. Readability ana içeriği bulursa o, bulamazsa (ya da çok kısaysa) temizlenmiş
 * gövde kullanılır. Adresler sayfanın son adresine göre mutlak yapılır.
 */
export function htmlDonustur(html: string, adres: string): Donusum {
  const uyarilar: string[] = [];
  const { document } = parseHTML(html);
  const tabanHam = document.querySelector("base[href]")?.getAttribute("href");
  let taban = adres;
  try {
    if (tabanHam) taban = new URL(tabanHam, adres).toString();
  } catch {
    // geçersiz <base> yok sayılır
  }
  adresleriMutlakYap(document, taban);
  const ld = jsonLdBilgisi(document);
  const metaBaslik = metaIcerik(document, 'meta[property="og:title"]', 'meta[name="twitter:title"]') ?? (document.querySelector("title")?.textContent?.trim() || null);
  const metaSite = metaIcerik(document, 'meta[property="og:site_name"]', 'meta[name="application-name"]');
  const metaAciklama = metaIcerik(document, 'meta[name="description"]', 'meta[property="og:description"]', 'meta[name="og:description"]');
  const metaYazar = metaIcerik(document, 'meta[name="author"]', 'meta[property="article:author"]', 'meta[name="parsely-author"]') ?? ld.yazar;
  const metaTarih =
    metaIcerik(document, 'meta[property="article:published_time"]', 'meta[name="date"]', 'meta[itemprop="datePublished"]', 'meta[name="publish-date"]', 'meta[name="DC.date.issued"]') ??
    ld.tarih ??
    (document.querySelector("time[datetime]")?.getAttribute("datetime") || null);

  // Readability belgeyi değiştirir; ayrı bir kopyada çalışır
  let makale: ReturnType<Readability["parse"]> = null;
  try {
    const kopya = parseHTML(html).document;
    adresleriMutlakYap(kopya, taban);
    makale = new Readability(kopya as unknown as ConstructorParameters<typeof Readability>[0], { charThreshold: 300, keepClasses: true }).parse();
  } catch (h) {
    uyarilar.push(iki(`Ana içerik çıkarılamadı: ${(h as Error).message}`, `Could not extract the main content: ${(h as Error).message}`));
  }

  let govdeHtml: string;
  let ozetEki = "";
  if (makale?.content && (makale.textContent ?? "").trim().length >= 200) {
    govdeHtml = makale.content;
    // Giriş paragrafı ana içerikten ayrı bir bölümde kaldıysa (ör. MDN) sayfanın açıklaması özet olarak başa girer
    if (metaAciklama && metaAciklama.length >= 40 && !katla(makale.textContent ?? "").includes(katla(metaAciklama.slice(0, 60)))) ozetEki = `> ${metaAciklama.replace(/\s+/g, " ")}\n\n`;
  } else {
    for (const e of document.querySelectorAll(GURULTU)) e.remove();
    const ana = document.querySelector("main, article, [role=main]") ?? document.querySelector("body");
    govdeHtml = ana?.innerHTML ?? html;
  }

  let markdown = "";
  try {
    markdown = ozetEki + htmlMarkdowna(govdeHtml);
  } catch (h) {
    uyarilar.push(iki(`Markdown'a çevrilemedi, düz metin verildi: ${(h as Error).message}`, `Could not convert to Markdown, plain text given: ${(h as Error).message}`));
    markdown = (parseHTML(`<body>${govdeHtml}</body>`).document.body?.textContent ?? "").replace(/\s+\n/g, "\n").trim();
  }
  return {
    baslik: makale?.title?.trim() || metaBaslik,
    site: makale?.siteName?.trim() || metaSite || alanAdi(adres),
    yazar: makale?.byline?.trim() || metaYazar,
    tarih: makale?.publishedTime?.trim() || metaTarih,
    markdown,
    baglantilar: baglantilariTopla(govdeHtml),
    uyarilar,
  };
}

/** Karşılaştırma için sadeleştirilmiş metin: boşluklar tek, küçük harf */
function katla(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Markdown'daki okunur metnin uzunluğu (bağlantı adresleri ve işaretler hariç): JS ile çizilen sayfayı tanımak için */
export function metinUzunlugu(markdown: string): number {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~-]/g, "")
    .replace(/\s+/g, " ")
    .trim().length;
}

// ---------------------------------------------------------------------------
// PDF, JSON, metin, görsel
// ---------------------------------------------------------------------------

/** PDF tarihi (D:20240131120000Z) → ISO */
function pdfTarihi(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(v);
  if (!m) return null;
  const [, y, a = "01", g = "01", s = "00", d = "00", sn = "00"] = m;
  const t = Date.parse(`${y}-${a}-${g}T${s}:${d}:${sn}Z`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** PDF'in metni (unpdf, pdf.js); sayfalar ayraçla ayrılır */
export async function pdfDonustur(govde: Uint8Array, adres: string): Promise<Donusum> {
  const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
  const belge = await getDocumentProxy(new Uint8Array(govde));
  const { totalPages, text } = await extractText(belge, { mergePages: false });
  const bilgi = (await getMeta(belge).catch(() => null))?.info ?? {};
  const sayfalar = text.map((t, i) => `--- ${iki("Sayfa", "Page")} ${i + 1}/${totalPages} ---\n\n${t.replace(/[ \t]+\n/g, "\n").trim()}`);
  const uyarilar = text.every((t) => !t.trim()) ? [iki("PDF'te metin yok (taranmış görüntü olabilir).", "The PDF has no text (it may be a scanned image).")] : [];
  return {
    baslik: typeof bilgi.Title === "string" && bilgi.Title.trim() ? bilgi.Title.trim() : null,
    site: alanAdi(adres),
    yazar: typeof bilgi.Author === "string" && bilgi.Author.trim() ? bilgi.Author.trim() : null,
    tarih: pdfTarihi(bilgi.CreationDate),
    markdown: sayfalar.join("\n\n"),
    baglantilar: [],
    uyarilar,
  };
}

export function jsonDonustur(metin: string, adres: string): Donusum {
  let govde: string;
  const uyarilar: string[] = [];
  try {
    govde = JSON.stringify(JSON.parse(metin), null, 2);
  } catch {
    govde = metin;
    uyarilar.push(iki("JSON çözülemedi; ham metin verildi.", "Could not parse the JSON; the raw text is given."));
  }
  return { baslik: null, site: alanAdi(adres), yazar: null, tarih: null, markdown: `\`\`\`json\n${govde}\n\`\`\``, baglantilar: [], uyarilar };
}

const KOD_UZANTILARI: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  mjs: "js",
  cjs: "js",
  jsx: "jsx",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  ps1: "powershell",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  css: "css",
  scss: "scss",
  sql: "sql",
  vue: "vue",
  svelte: "svelte",
  dockerfile: "dockerfile",
};

/** Düz metin: Markdown olduğu gibi, kaynak kod uzantısına göre kod bloğunda */
export function metinDonustur(metin: string, adres: string): Donusum {
  let yol = "";
  try {
    yol = new URL(adres).pathname.toLowerCase();
  } catch {
    // adres okunamadı
  }
  const dosya = yol.split("/").pop() ?? "";
  const uzanti = dosya.includes(".") ? dosya.split(".").pop()! : dosya;
  const dil = KOD_UZANTILARI[uzanti];
  const markdown = dil ? `\`\`\`${dil}\n${metin.replace(/\n+$/, "")}\n\`\`\`` : metin.trim();
  return { baslik: dosya || null, site: alanAdi(adres), yazar: null, tarih: null, markdown, baglantilar: [], uyarilar: [] };
}

export function gorselDonustur(govde: Uint8Array, icerikTuruBasligi: string | undefined, adres: string, kesildi: boolean): Donusum {
  const tur = (icerikTuruBasligi ?? "").split(";")[0]!.trim() || gorselImzasi(govde) || "image";
  const boyut = gorselBoyutu(govde);
  const satirlar = [
    iki(`Görsel: ${tur}`, `Image: ${tur}`),
    iki(`Dosya boyutu: ${boyutMetni(govde.byteLength)}${kesildi ? " (kesildi)" : ""}`, `File size: ${boyutMetni(govde.byteLength)}${kesildi ? " (truncated)" : ""}`),
    boyut ? iki(`Ölçüler: ${boyut.en} × ${boyut.boy} piksel`, `Dimensions: ${boyut.en} × ${boyut.boy} pixels`) : "",
    iki("Görselin içeriği okunmaz; yalnız bilgisi verilir.", "The image content is not read; only its details are given."),
  ].filter(Boolean);
  return { baslik: null, site: alanAdi(adres), yazar: null, tarih: null, markdown: satirlar.join("\n"), baglantilar: [], uyarilar: [] };
}
