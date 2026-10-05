// HTML ve şablon dosyalarındaki başvurular: <script src>, <link href>, sayfalar arası <a href> (.html), <iframe src>,
// satır içi <script> içe aktarmaları ve <style> @import'ları; EJS include, Jinja/Nunjucks/Twig/Django
// include/extends/import, Handlebars kısmi şablonları ({{> ad}}) ve Flask/Django static adresleri. Yorumlar sayılmaz;
// dış adresler (http:, //cdn, data:) ve şablon ifadeli yollar atlanır. Hepsi dosya başvurusudur: dizindeki bir dosyaya
// çözülmezse kaydedilmez.
import type { IceAktarmaBilgisi } from "./semboller.js";

/** Satır içi blokların içe aktarmalarını çıkaran işlev (semboller.ts verir; döngüsel içe aktarma olmasın diye) */
export type IcCikarici = (metin: string, aile: "ts" | "css") => IceAktarmaBilgisi[];

const EN_COK = 1000;
/** Satır içi <script> yalnız JavaScript türlerinde okunur (importmap, JSON ve şablon blokları değil) */
const BETIK_TURU = /^(?:module|text\/javascript|application\/javascript|text\/babel|text\/jsx)$/i;

/** Yorumlar boşluğa çevrilir (konumlar ve satır sonları korunur): <!-- -->, <%# %>, {# #}, {{!-- --}}, {{! }} */
function yorumlariSil(metin: string): string {
  return metin.replace(/<!--[\s\S]*?(?:-->|$)|<%#[\s\S]*?(?:%>|$)|\{#[\s\S]*?(?:#\}|$)|\{\{!--[\s\S]*?(?:--\}\}|$)|\{\{![\s\S]*?(?:\}\}|$)/g, (m) => m.replace(/[^\n]/g, " "));
}

function satirBulucu(metin: string): (konum: number) => number {
  const baslar = [0];
  for (let i = metin.indexOf("\n"); i >= 0; i = metin.indexOf("\n", i + 1)) baslar.push(i + 1);
  return (konum) => {
    let a = 0;
    let u = baslar.length - 1;
    while (a < u) {
      const o = (a + u + 1) >> 1;
      if (baslar[o]! <= konum) a = o;
      else u = o - 1;
    }
    return a + 1;
  };
}

function ozellikler(metin: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of metin.matchAll(/([\w:@.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) m.set(x[1]!.toLowerCase(), x[2] ?? x[3] ?? x[4] ?? "");
  return m;
}

/** Yerel dosya yolu mu: dış adres, veri adresi, çapa ya da şablon ifadesi değil */
function yerelMi(y: string): boolean {
  return Boolean(y) && !/^[a-z][\w+.-]*:/i.test(y) && !y.startsWith("//") && !y.startsWith("#") && !/[{}<>$%]/.test(y);
}

/** Öznitelik değerindeki yerel yol: Flask url_for('static', filename=…) ve Django {% static … %} kökten static/ olur */
function adresYolu(deger: string): string | null {
  const flask = /url_for\(\s*["']static["']\s*,\s*filename\s*=\s*["']([^"']+)["']/.exec(deger);
  if (flask) return `/static/${flask[1]!}`;
  const django = /\{%\s*static\s+["']([^"']+)["']\s*%\}/.exec(deger);
  if (django) return `/static/${django[1]!}`;
  const t = deger.trim().replace(/[?#].*$/, "");
  return yerelMi(t) ? t : null;
}

export function htmlIceAktarmalari(metin: string, ic: IcCikarici): IceAktarmaBilgisi[] {
  const temiz = yorumlariSil(metin);
  const satir = satirBulucu(temiz);
  const sonuc: IceAktarmaBilgisi[] = [];
  const ekle = (konum: number, kaynak: string) => {
    if (sonuc.length < EN_COK) sonuc.push({ kaynak, satir: satir(konum), adlar: [], tur: "yol" });
  };

  for (const m of temiz.matchAll(/<(script|link|a|iframe|frame|embed|object)\b([^>]*)>/gi)) {
    const etiket = m[1]!.toLowerCase();
    const o = ozellikler(m[2]!);
    const deger = etiket === "link" || etiket === "a" ? o.get("href") : etiket === "object" ? o.get("data") : o.get("src");
    const yol = deger ? adresYolu(deger) : null;
    if (!yol) continue;
    // Bağlantılardan yalnız sayfalar; <link> ile kanonik adres, ön bağlantı ve arama tanımı başvuru değildir
    if (etiket === "a" && !/\.html?$/i.test(yol)) continue;
    if (etiket === "link" && /\b(?:canonical|alternate|dns-prefetch|preconnect|search|author|license)\b/i.test(o.get("rel") ?? "")) continue;
    ekle(m.index, yol);
  }

  // Satır içi betik ve stil blokları: bloğun satırları korunarak yalnız içerik ayıklanır
  const blok = (bas: number, ici: string) => `${"\n".repeat(satir(bas) - 1)}${ici}`;
  for (const m of temiz.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const o = ozellikler(m[1]!);
    if (o.has("src") || (o.has("type") && !BETIK_TURU.test(o.get("type")!.trim())) || !m[2]!.trim()) continue;
    for (const i of ic(blok(m.index + m[0].indexOf(">") + 1, m[2]!), "ts")) if (sonuc.length < EN_COK) sonuc.push({ ...i, tur: "yol" });
  }
  for (const m of temiz.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    if (!m[1]!.includes("@")) continue;
    for (const i of ic(blok(m.index + m[0].indexOf(">") + 1, m[1]!), "css")) if (sonuc.length < EN_COK) sonuc.push({ ...i, tur: "yol" });
  }

  // Şablon başvuruları: EJS include, Jinja/Nunjucks/Twig/Django include, extends, import, embed; Handlebars {{> ad}}
  for (const desen of [/<%[-=_]?\s*include\s*\(?\s*(["'])([^"'\n]+)\1/g, /\{%-?\s*(?:include|extends|import|from|embed)\s+(["'])([^"'\n]+)\1/g]) {
    for (const m of temiz.matchAll(desen)) if (yerelMi(m[2]!)) ekle(m.index, m[2]!);
  }
  for (const m of temiz.matchAll(/\{\{>\s*([\w./-]+)/g)) ekle(m.index, m[1]!);
  return sonuc.sort((a, b) => a.satir - b.satir);
}
