// Yerleşik sayfa okuyucu (r.jina.ai gibi): adresi temiz Markdown'a çevirir. Yalnız http/https; yönlendirmeler
// izlenir, süre ~15 sn, gövde 5 MB (PDF 20 MB). Yerel makine ve özel ağ adresleri okunabilir (ajanların kendi
// geliştirme sunucuları). Özel durumlar: GitHub blob → raw içerik, depo kökü → README, npm paket sayfası → registry'den
// README. Yerelde çok az metin çıkarsa (JS ile çizilen sayfa) ve ayar açıksa r.jina.ai'ye düşülür. Belge 30 dakika
// bellekte tutulur; ajan uzun belgeyi baslangic/uzunluk ile parça parça okur.
import type { Dil, WebAyarlari, WebIcerikTuru, WebOkumaIstegi, WebOkumaSonucu } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { ArnorgHatasi } from "../yardimci.js";
import { alanAdi, httpAdresi, yerelAdresMi } from "./adres.js";
import { boyutMetni, gorselDonustur, htmlDonustur, icerikTuru, jsonDonustur, metinDonustur, metinUzunlugu, pdfDonustur, type Donusum } from "./donustur.js";
import { AgHatasi, apiBasliklari, ARNORG_UA, jsonCevir, metneCevir, TARAYICI_UA, type Getirici, type GetirYaniti } from "./http.js";

export const OKUMA_ZAMAN_ASIMI_MS = 15_000;
export const SAYFA_SINIRI_BAYT = 5 * 1024 * 1024;
export const PDF_SINIRI_BAYT = 20 * 1024 * 1024;
export const OKUMA_ONBELLEK_MS = 30 * 60_000;
export const VARSAYILAN_UZUNLUK = 12_000;
/** Bundan az okunur metin çıkan HTML sayfası JS ile çiziliyor sayılır (r.jina.ai yedeği) */
export const AZ_METIN = 500;
const ONBELLEK_SINIRI = 60;
const JINA = "https://r.jina.ai/";

export interface OkuyucuBaglami {
  ayarlar(): WebAyarlari;
  dil(): Dil;
  getir: Getirici;
  simdi?(): number;
}

/** Bellekteki tam belge */
export interface OkunanBelge {
  adres: string;
  sonAdres: string;
  baslik: string | null;
  site: string | null;
  yazar: string | null;
  tarih: string | null;
  tur: WebIcerikTuru;
  kaynak: "yerel" | "jina";
  markdown: string;
  baglantilar: { metin: string; adres: string }[];
  uyarilar: string[];
}

// ---------------------------------------------------------------------------
// Özel adresler
// ---------------------------------------------------------------------------

const GITHUB_AYRILMIS = new Set([
  "about",
  "apps",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "search",
  "security",
  "settings",
  "sponsors",
  "topics",
  "trending",
  "users",
]);

function githubMu(u: URL): boolean {
  return /^(www\.)?github\.com$/i.test(u.hostname);
}

/** github.com/<sahip>/<depo>/blob/<dal>/<yol> (ya da /raw/) → raw.githubusercontent.com/<sahip>/<depo>/<dal>/<yol> */
export function githubHamAdresi(adres: string | URL): string | null {
  const u = typeof adres === "string" ? new URL(adres) : adres;
  if (!githubMu(u)) return null;
  const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : null;
}

/** github.com/<sahip>/<depo> ya da /tree/<dal> (alt klasörsüz): depo kökü */
export function githubDepoKoku(adres: string | URL): { sahip: string; depo: string; dal: string } | null {
  const u = typeof adres === "string" ? new URL(adres) : adres;
  if (!githubMu(u)) return null;
  const m = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?\/?$/.exec(u.pathname);
  if (!m || GITHUB_AYRILMIS.has(m[1]!.toLowerCase())) return null;
  return { sahip: m[1]!, depo: m[2]!, dal: m[3] ?? "HEAD" };
}

/** npmjs.com/package/<ad> (kapsamlı ad ve /v/<sürüm> dahil) → paket adı */
export function npmPaketAdi(adres: string | URL): string | null {
  const u = typeof adres === "string" ? new URL(adres) : adres;
  if (!/^(www\.)?npmjs\.(com|org)$/i.test(u.hostname)) return null;
  const m = /^\/package\/((?:@[^/]+\/)?[^/]+)/.exec(u.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

const README_ADLARI = ["README.md", "readme.md", "Readme.md", "README.MD", "README.markdown", "README.rst", "README.txt", "README"];

// ---------------------------------------------------------------------------
// Sayfalama
// ---------------------------------------------------------------------------

/**
 * Belgenin [baslangic, baslangic+uzunluk) parçası; pencere sonu son %20'de bir paragraf ya da satır sonuna denk
 * gelirse orada kesilir (cümle ortasında bölünmesin). sonraki, bir sonraki çağrının başlangıcıdır.
 */
export function parcala(metin: string, baslangic = 0, uzunluk = VARSAYILAN_UZUNLUK): { icerik: string; baslangic: number; toplam: number; devamVar: boolean; sonraki: number | null } {
  const toplam = metin.length;
  const bas = Math.min(Math.max(0, Math.floor(baslangic)), toplam);
  const boy = Math.min(Math.max(500, Math.floor(uzunluk)), 60_000);
  let son = Math.min(toplam, bas + boy);
  if (son < toplam) {
    const pencere = metin.slice(bas, son);
    const paragraf = pencere.lastIndexOf("\n\n");
    const satir = pencere.lastIndexOf("\n");
    const kes = paragraf > boy * 0.8 ? paragraf + 2 : satir > boy * 0.8 ? satir + 1 : -1;
    if (kes > 0) son = bas + kes;
  }
  const devamVar = son < toplam;
  return { icerik: metin.slice(bas, son), baslangic: bas, toplam, devamVar, sonraki: devamVar ? son : null };
}

// ---------------------------------------------------------------------------
// Okuyucu
// ---------------------------------------------------------------------------

function sayfaBasliklari(dil: Dil): Record<string, string> {
  return {
    "User-Agent": TARAYICI_UA,
    Accept: "text/html,application/xhtml+xml,application/pdf;q=0.95,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5",
    "Accept-Language": dil === "tr" ? "tr-TR,tr;q=0.9,en;q=0.7" : "en-US,en;q=0.9",
  };
}

function durumAciklamasi(durum: number): string {
  if (durum === 404) return iki("bulunamadı", "not found");
  if (durum === 401 || durum === 403) return iki("erişim reddedildi", "access denied");
  if (durum === 429) return iki("çok fazla istek", "too many requests");
  if (durum >= 500) return iki("sunucu hatası", "server error");
  return iki("beklenmeyen yanıt", "unexpected response");
}

export class SayfaOkuyucu {
  private readonly onbellek = new Map<string, { zaman: number; belge: OkunanBelge }>();
  private readonly suren = new Map<string, Promise<OkunanBelge>>();

  constructor(private readonly b: OkuyucuBaglami) {}

  private simdi(): number {
    return this.b.simdi?.() ?? Date.now();
  }

  get onbellekBoyutu(): number {
    return this.onbellek.size;
  }

  async oku(istek: WebOkumaIstegi): Promise<WebOkumaSonucu> {
    const u = httpAdresi(istek.adres);
    const anahtar = u.toString();
    let onbellekten = false;
    let belge: OkunanBelge;
    const bellek = this.onbellek.get(anahtar);
    if (bellek && this.simdi() - bellek.zaman < OKUMA_ONBELLEK_MS) {
      belge = bellek.belge;
      onbellekten = true;
    } else {
      let is = this.suren.get(anahtar);
      if (!is) {
        is = this.belgeAl(u).finally(() => this.suren.delete(anahtar));
        this.suren.set(anahtar, is);
      }
      belge = await is;
      this.onbellek.set(anahtar, { zaman: this.simdi(), belge });
      while (this.onbellek.size > ONBELLEK_SINIRI) this.onbellek.delete(this.onbellek.keys().next().value!);
    }
    const p = parcala(belge.markdown, istek.baslangic ?? 0, istek.uzunluk ?? VARSAYILAN_UZUNLUK);
    const uyarilar = [...belge.uyarilar];
    if (p.toplam > 0 && (istek.baslangic ?? 0) >= p.toplam) uyarilar.push(iki(`Belge ${p.toplam} karakter; baslangic bunun dışında.`, `The document has ${p.toplam} characters; baslangic is past the end.`));
    return {
      adres: istek.adres,
      sonAdres: belge.sonAdres,
      baslik: belge.baslik,
      site: belge.site,
      yazar: belge.yazar,
      tarih: belge.tarih,
      tur: belge.tur,
      kaynak: belge.kaynak,
      icerik: p.icerik,
      baslangic: p.baslangic,
      toplam: p.toplam,
      devamVar: p.devamVar,
      sonraki: p.sonraki,
      baglantilar: istek.baglantilar ? belge.baglantilar : [],
      uyarilar,
      onbellekten,
    };
  }

  private getir(adres: string, enCokBayt = SAYFA_SINIRI_BAYT, basliklar?: Record<string, string>): Promise<GetirYaniti> {
    return this.b.getir(adres, { basliklar: basliklar ?? sayfaBasliklari(this.b.dil()), zamanAsimiMs: OKUMA_ZAMAN_ASIMI_MS, enCokBayt }).catch((h: unknown) => {
      if (h instanceof AgHatasi) {
        throw new ArnorgHatasi(h.tur === "zaman_asimi" ? iki(`${alanAdi(adres)} ${OKUMA_ZAMAN_ASIMI_MS / 1000} sn içinde yanıt vermedi.`, `${alanAdi(adres)} did not answer within ${OKUMA_ZAMAN_ASIMI_MS / 1000} s.`) : iki(`${alanAdi(adres)} adresine bağlanılamadı (${h.message}).`, `Could not connect to ${alanAdi(adres)} (${h.message}).`), 502);
      }
      throw h;
    });
  }

  /** Adresi indirip türüne göre Markdown'a çevirir (özel durumlar ve r.jina.ai yedeği dahil) */
  async belgeAl(u: URL): Promise<OkunanBelge> {
    const adres = u.toString();
    const ham = githubHamAdresi(u);
    if (ham) return { ...(await this.normalOku(new URL(ham))), adres };
    const depo = githubDepoKoku(u);
    if (depo) {
      const readme = await this.githubReadme(depo).catch(() => null);
      if (readme) return { ...readme, adres };
    }
    const npmAdi = npmPaketAdi(u);
    if (npmAdi) {
      const paket = await this.npmReadme(npmAdi).catch(() => null);
      if (paket) return { ...paket, adres };
    }
    return this.normalOku(u);
  }

  private async normalOku(u: URL): Promise<OkunanBelge> {
    const adres = u.toString();
    const pdfGibi = /\.pdf$/i.test(u.pathname);
    let y = await this.getir(adres, pdfGibi ? PDF_SINIRI_BAYT : SAYFA_SINIRI_BAYT);
    const jinaUygun = this.b.ayarlar().disOkuyucu && !yerelAdresMi(u);
    if (y.durum < 200 || y.durum >= 300) {
      // Bot korumasına takılan sayfa dış okuyucuyla denenir
      if (jinaUygun && [401, 403, 429, 503].includes(y.durum)) {
        const j = await this.jinaOku(adres).catch(() => null);
        if (j && metinUzunlugu(j.markdown) > 0) return { ...j, uyarilar: [...j.uyarilar, iki(`Sayfa ${y.durum} döndürdü; içerik r.jina.ai üzerinden okundu.`, `The page returned ${y.durum}; the content was read through r.jina.ai.`)] };
      }
      throw new ArnorgHatasi(iki(`Sayfa ${y.durum} döndürdü (${durumAciklamasi(y.durum)}): ${adres}`, `The page returned ${y.durum} (${durumAciklamasi(y.durum)}): ${adres}`), y.durum === 404 ? 404 : 502);
    }
    let tur = icerikTuru(y.basliklar["content-type"], y.govde);
    // PDF olduğu sonradan anlaşılan büyük belge daha yüksek sınırla yeniden indirilir
    if (tur === "pdf" && y.kesildi && !pdfGibi) {
      y = await this.getir(adres, PDF_SINIRI_BAYT);
      tur = icerikTuru(y.basliklar["content-type"], y.govde);
    }
    const sonAdres = y.adres || adres;
    const uyarilar: string[] = [];
    if (y.kesildi) uyarilar.push(iki(`Gövde ${boyutMetni(y.govde.byteLength)} sınırında kesildi.`, `The body was cut at the ${boyutMetni(y.govde.byteLength)} limit.`));
    let d: Donusum;
    switch (tur) {
      case "html":
        d = htmlDonustur(metneCevir(y), sonAdres);
        break;
      case "pdf":
        try {
          d = await pdfDonustur(y.govde, sonAdres);
        } catch (h) {
          throw new ArnorgHatasi(iki(`PDF okunamadı: ${(h as Error).message}`, `Could not read the PDF: ${(h as Error).message}`), 422);
        }
        break;
      case "json":
        d = jsonDonustur(metneCevir(y), sonAdres);
        break;
      case "metin":
        d = metinDonustur(metneCevir(y), sonAdres);
        break;
      case "gorsel":
        d = gorselDonustur(y.govde, y.basliklar["content-type"], sonAdres, y.kesildi);
        break;
      default:
        throw new ArnorgHatasi(
          iki(`Bu içerik türü okunamaz: ${y.basliklar["content-type"] ?? "bilinmiyor"} (${boyutMetni(y.govde.byteLength)}).`, `This content type cannot be read: ${y.basliklar["content-type"] ?? "unknown"} (${boyutMetni(y.govde.byteLength)}).`),
          415,
        );
    }
    const belge: OkunanBelge = { adres, sonAdres, ...d, uyarilar: [...uyarilar, ...d.uyarilar], tur, kaynak: "yerel" };
    // JS ile çizilen sayfa: yerelde çok az metin çıktıysa dış okuyucu denenir; olmazsa yerelde çıkan döner
    if (tur === "html" && metinUzunlugu(belge.markdown) < AZ_METIN) {
      const j = jinaUygun ? await this.jinaOku(sonAdres).catch(() => null) : null;
      if (j && metinUzunlugu(j.markdown) > metinUzunlugu(belge.markdown)) {
        return { ...j, adres, baglantilar: belge.baglantilar, uyarilar: [...j.uyarilar, iki("Sayfada yerelde çok az metin çıktı (JS ile çiziliyor olabilir); içerik r.jina.ai üzerinden okundu.", "Very little text came out locally (the page may be drawn with JS); the content was read through r.jina.ai.")] };
      }
      belge.uyarilar.push(iki("Sayfada çok az metin var; JS ile çiziliyor olabilir.", "The page has very little text; it may be drawn with JS."));
    }
    return belge;
  }

  /** r.jina.ai üzerinden okuma (JSON: başlık, adres, Markdown içerik, yayın zamanı) */
  async jinaOku(adres: string): Promise<OkunanBelge | null> {
    const y = await this.b.getir(`${JINA}${adres}`, {
      basliklar: { "User-Agent": ARNORG_UA, Accept: "application/json", "X-Return-Format": "markdown" },
      zamanAsimiMs: OKUMA_ZAMAN_ASIMI_MS + 10_000,
      enCokBayt: SAYFA_SINIRI_BAYT,
    });
    if (y.durum < 200 || y.durum >= 300) return null;
    const j = jsonCevir<{ data?: { title?: string; url?: string; content?: string; publishedTime?: string; description?: string } }>(y);
    const veri = j?.data;
    if (!veri?.content) return null;
    return {
      adres,
      sonAdres: veri.url || adres,
      baslik: veri.title?.trim() || null,
      site: alanAdi(veri.url || adres),
      yazar: null,
      tarih: veri.publishedTime?.trim() || null,
      tur: "html",
      kaynak: "jina",
      markdown: veri.content.replace(/\n{3,}/g, "\n\n").trim(),
      baglantilar: [],
      uyarilar: [],
    };
  }

  /** Depo kökünün README'si (raw.githubusercontent.com, HEAD ya da verilen dal) */
  private async githubReadme(d: { sahip: string; depo: string; dal: string }): Promise<OkunanBelge | null> {
    for (const ad of README_ADLARI) {
      const adres = `https://raw.githubusercontent.com/${d.sahip}/${d.depo}/${d.dal}/${ad}`;
      const y = await this.getir(adres, SAYFA_SINIRI_BAYT, { "User-Agent": ARNORG_UA, Accept: "text/plain, */*" });
      if (y.durum === 404) continue;
      if (y.durum < 200 || y.durum >= 300) return null;
      return {
        adres,
        sonAdres: adres,
        baslik: `${d.sahip}/${d.depo} · ${ad}`,
        site: "github.com",
        yazar: d.sahip,
        tarih: null,
        tur: "metin",
        kaynak: "yerel",
        markdown: metneCevir(y).trim(),
        baglantilar: [],
        uyarilar: y.kesildi ? [iki("README sınırda kesildi.", "The README was cut at the limit.")] : [],
      };
    }
    return null;
  }

  /** npm paketi: registry belgesinden README ve üst bilgi (README yoksa jsDelivr'deki dosya) */
  private async npmReadme(ad: string): Promise<OkunanBelge | null> {
    const kodlu = ad.startsWith("@") ? `@${encodeURIComponent(ad.slice(1))}` : encodeURIComponent(ad);
    const adres = `https://registry.npmjs.org/${kodlu}`;
    const y = await this.getir(adres, SAYFA_SINIRI_BAYT, apiBasliklari());
    if (y.durum < 200 || y.durum >= 300 || y.kesildi) return null;
    const p = jsonCevir<{
      name?: string;
      description?: string;
      readme?: string;
      license?: string | { type?: string };
      homepage?: string;
      repository?: string | { url?: string };
      "dist-tags"?: { latest?: string };
      time?: Record<string, string>;
    }>(y);
    if (!p?.name) return null;
    const surum = p["dist-tags"]?.latest ?? null;
    let readme = p.readme?.trim() ?? "";
    if (!readme || /^ERROR: No README/i.test(readme)) {
      const j = await this.getir(`https://cdn.jsdelivr.net/npm/${p.name}${surum ? `@${surum}` : ""}/README.md`, SAYFA_SINIRI_BAYT, { "User-Agent": ARNORG_UA }).catch(() => null);
      readme = j && j.durum === 200 ? metneCevir(j).trim() : "";
    }
    const lisans = typeof p.license === "string" ? p.license : (p.license?.type ?? null);
    const depo = typeof p.repository === "string" ? p.repository : (p.repository?.url ?? null);
    const ust = [
      `# ${p.name}`,
      p.description ? `\n> ${p.description}` : "",
      "",
      [
        surum ? `**${iki("Son sürüm", "Latest version")}:** ${surum}${p.time?.[surum] ? ` (${p.time[surum]!.slice(0, 10)})` : ""}` : "",
        lisans ? `**${iki("Lisans", "License")}:** ${lisans}` : "",
        depo ? `**${iki("Depo", "Repository")}:** ${depo.replace(/^git\+/, "").replace(/\.git$/, "")}` : "",
        p.homepage ? `**${iki("Ana sayfa", "Homepage")}:** ${p.homepage}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      "",
      "---",
      "",
    ].join("\n");
    return {
      adres,
      sonAdres: adres,
      baslik: `${p.name}${surum ? ` ${surum}` : ""} · npm`,
      site: "npmjs.com",
      yazar: null,
      tarih: surum ? (p.time?.[surum] ?? null) : null,
      tur: "metin",
      kaynak: "yerel",
      markdown: `${ust}${readme || iki("(README yok)", "(no README)")}`,
      baglantilar: [],
      uyarilar: [],
    };
  }
}
