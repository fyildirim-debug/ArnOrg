// Teknik kaynaklar: GitHub (depolar), npm, MDN, Hacker News ve arXiv. Hepsi anahtarsız JSON/Atom API'leridir.
import { DOMParser } from "linkedom";
import { iki } from "../../dil.js";
import { depoSonuclari, githubIstegi, type GhAramaYaniti, type GhDepo } from "../github-api.js";
import { apiBasliklari, jsonCevir, metneCevir } from "../http.js";
import { durumuDenetle, etiketsiz, gecerliAdres, isoZaman, kirp, MotorHatasi, sadeMetin, type Motor, type MotorIstegi, type MotorSonucu } from "./ortak.js";

const SAYFA_BOYU = 8;

function cozumlemeHatasi(ad: string): MotorHatasi {
  return new MotorHatasi("cozumleme", iki(`${ad} yanıtı okunamadı`, `Could not read the ${ad} response`));
}

// ---------------------------------------------------------------------------
// GitHub depoları (gh girişliyse kullanıcının belirteciyle)
// ---------------------------------------------------------------------------

export function githubYolu(i: MotorIstegi): string {
  return `search/repositories?${new URLSearchParams({ q: i.sorgu, per_page: String(SAYFA_BOYU), page: String(i.sayfa) })}`;
}

export const github: Motor = {
  kimlik: "github",
  ad: "GitHub",
  tur: "teknik",
  kategoriler: ["kod"],
  agirlik: 1,
  async ara(i, o) {
    const { veri } = await githubIstegi<GhAramaYaniti<GhDepo>>(githubYolu(i), { gh: o.gh, getir: o.getir, zamanAsimiMs: o.zamanAsimiMs });
    return depoSonuclari(veri);
  },
};

// ---------------------------------------------------------------------------
// npm (registry.npmjs.org/-/v1/search)
// ---------------------------------------------------------------------------

export function npmIstegi(i: MotorIstegi): string {
  return `https://registry.npmjs.org/-/v1/search?${new URLSearchParams({ text: i.sorgu, size: String(SAYFA_BOYU), from: String((i.sayfa - 1) * SAYFA_BOYU) })}`;
}

interface NpmArama {
  objects?: { package: { name: string; version?: string; description?: string; date?: string; links?: { npm?: string } }; downloads?: { weekly?: number } }[];
}

export function npmAyristir(g: NpmArama | null): MotorSonucu[] {
  if (!g) throw cozumlemeHatasi("npm");
  return (g.objects ?? []).map(({ package: p, downloads }) => ({
    baslik: `${p.name}${p.version ? `@${p.version}` : ""}`,
    adres: p.links?.npm ?? `https://www.npmjs.com/package/${p.name}`,
    ozet: kirp([p.description ?? "", downloads?.weekly !== undefined ? iki(`haftalık ${downloads.weekly.toLocaleString("tr-TR")} indirme`, `${downloads.weekly.toLocaleString("en-US")} weekly downloads`) : ""].filter(Boolean).join(" · "), 400),
    tarih: isoZaman(p.date),
  }));
}

export const npm: Motor = {
  kimlik: "npm",
  ad: "npm",
  tur: "teknik",
  kategoriler: ["kod"],
  agirlik: 0.8,
  async ara(i, o) {
    const y = await o.getir(npmIstegi(i), { basliklar: apiBasliklari(), zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "npm");
    return npmAyristir(jsonCevir<NpmArama>(y));
  },
};

// ---------------------------------------------------------------------------
// MDN (developer.mozilla.org/api/v1/search)
// ---------------------------------------------------------------------------

export function mdnIstegi(i: MotorIstegi): string {
  return `https://developer.mozilla.org/api/v1/search?${new URLSearchParams({ q: i.sorgu, locale: "en-US", size: String(SAYFA_BOYU), page: String(i.sayfa) })}`;
}

interface MdnArama {
  documents?: { title: string; mdn_url: string; summary?: string }[];
}

export function mdnAyristir(g: MdnArama | null): MotorSonucu[] {
  if (!g) throw cozumlemeHatasi("MDN");
  return (g.documents ?? []).map((d) => ({
    baslik: sadeMetin(d.title),
    adres: new URL(d.mdn_url, "https://developer.mozilla.org").toString(),
    ozet: kirp(sadeMetin(d.summary), 400),
  }));
}

export const mdn: Motor = {
  kimlik: "mdn",
  ad: "MDN",
  tur: "teknik",
  kategoriler: ["kod"],
  agirlik: 0.9,
  async ara(i, o) {
    const y = await o.getir(mdnIstegi(i), { basliklar: apiBasliklari(), zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "MDN");
    return mdnAyristir(jsonCevir<MdnArama>(y));
  },
};

// ---------------------------------------------------------------------------
// Hacker News (hn.algolia.com)
// ---------------------------------------------------------------------------

export function hackernewsIstegi(i: MotorIstegi): string {
  return `https://hn.algolia.com/api/v1/search?${new URLSearchParams({ query: i.sorgu, tags: "story", hitsPerPage: String(SAYFA_BOYU), page: String(i.sayfa - 1) })}`;
}

interface HnArama {
  hits?: { objectID: string; title?: string | null; url?: string | null; points?: number | null; num_comments?: number | null; created_at?: string; story_text?: string | null }[];
}

export function hackernewsAyristir(g: HnArama | null): MotorSonucu[] {
  if (!g) throw cozumlemeHatasi("Hacker News");
  return (g.hits ?? [])
    .filter((h) => h.title)
    .map((h) => {
      const tartisma = `https://news.ycombinator.com/item?id=${h.objectID}`;
      const adres = gecerliAdres(h.url) ? h.url : tartisma;
      const bilgi = iki(`${h.points ?? 0} puan · ${h.num_comments ?? 0} yorum`, `${h.points ?? 0} points · ${h.num_comments ?? 0} comments`);
      const ek = adres === tartisma ? etiketsiz(h.story_text) : iki(`tartışma: ${tartisma}`, `discussion: ${tartisma}`);
      return { baslik: sadeMetin(h.title), adres, ozet: kirp([bilgi, ek].filter(Boolean).join(" · "), 400), tarih: isoZaman(h.created_at) };
    });
}

export const hackernews: Motor = {
  kimlik: "hackernews",
  ad: "Hacker News",
  tur: "teknik",
  kategoriler: ["kod", "haber"],
  agirlik: 0.7,
  async ara(i, o) {
    const y = await o.getir(hackernewsIstegi(i), { basliklar: apiBasliklari(), zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "Hacker News");
    return hackernewsAyristir(jsonCevir<HnArama>(y));
  },
};

// ---------------------------------------------------------------------------
// arXiv (export.arxiv.org/api/query, Atom)
// ---------------------------------------------------------------------------

/** Tırnaklı sorgu olduğu gibi, değilse sözcükler AND ile: all:a AND all:b */
export function arxivSorgusu(sorgu: string): string {
  if (/"/.test(sorgu)) return `all:${sorgu}`;
  const sozcukler = sorgu.split(/\s+/).filter(Boolean);
  return sozcukler.map((s) => `all:${s}`).join(" AND ");
}

export function arxivIstegi(i: MotorIstegi): string {
  return `https://export.arxiv.org/api/query?${new URLSearchParams({ search_query: arxivSorgusu(i.sorgu), start: String((i.sayfa - 1) * SAYFA_BOYU), max_results: String(SAYFA_BOYU) })}`;
}

export function arxivAyristir(xml: string): MotorSonucu[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const sonuclar: MotorSonucu[] = [];
  for (const e of doc.getElementsByTagName("entry")) {
    const al = (ad: string) => sadeMetin(e.getElementsByTagName(ad)[0]?.textContent);
    const baglantilar = [...e.getElementsByTagName("link")];
    const adres = baglantilar.find((l) => l.getAttribute("rel") === "alternate")?.getAttribute("href") ?? al("id");
    if (!gecerliAdres(adres)) continue;
    const yazarlar = [...e.getElementsByTagName("author")].map((a) => sadeMetin(a.getElementsByTagName("name")[0]?.textContent)).filter(Boolean);
    const yazar = yazarlar.length > 3 ? `${yazarlar.slice(0, 3).join(", ")} ${iki("ve diğerleri", "et al.")}` : yazarlar.join(", ");
    sonuclar.push({ baslik: al("title"), adres: adres.replace(/^http:/, "https:"), ozet: kirp([yazar, al("summary")].filter(Boolean).join(" — "), 400), tarih: isoZaman(al("published")) });
  }
  return sonuclar;
}

export const arxiv: Motor = {
  kimlik: "arxiv",
  ad: "arXiv",
  tur: "teknik",
  kategoriler: ["bilim"],
  agirlik: 1.2,
  async ara(i, o) {
    const y = await o.getir(arxivIstegi(i), { basliklar: { ...apiBasliklari(), Accept: "application/atom+xml" }, zamanAsimiMs: o.zamanAsimiMs });
    durumuDenetle(y, "arXiv");
    return arxivAyristir(metneCevir(y));
  },
};

// ---------------------------------------------------------------------------
// Kurulun dış SearXNG'si (<adres>/search?format=json)
// ---------------------------------------------------------------------------

const SEARXNG_KATEGORI: Record<MotorIstegi["kategori"], string> = { genel: "general", kod: "it,general", haber: "news", bilim: "science" };

export function searxngIstegi(adres: string, i: MotorIstegi): string {
  const kok = adres.replace(/\/+$/, "");
  return `${kok}/search?${new URLSearchParams({ q: i.sorgu, format: "json", pageno: String(i.sayfa), language: i.dil, categories: SEARXNG_KATEGORI[i.kategori] })}`;
}

interface SearxngYanit {
  results?: { url: string; title?: string; content?: string; publishedDate?: string | null; engines?: string[] }[];
}

export function searxngAyristir(g: SearxngYanit | null): MotorSonucu[] {
  if (!g || !Array.isArray(g.results)) throw cozumlemeHatasi("SearXNG");
  return g.results.filter((r) => gecerliAdres(r.url)).map((r) => ({ baslik: sadeMetin(r.title) || r.url, adres: r.url, ozet: kirp(sadeMetin(r.content), 400), tarih: isoZaman(r.publishedDate) }));
}

export const searxng: Motor = {
  kimlik: "searxng",
  ad: "SearXNG",
  tur: "dis",
  kategoriler: ["genel", "kod", "haber", "bilim"],
  agirlik: 1,
  async ara(i, o) {
    if (!o.searxngAdresi) return [];
    const y = await o.getir(searxngIstegi(o.searxngAdresi, i), { basliklar: apiBasliklari(), zamanAsimiMs: o.zamanAsimiMs });
    if (y.durum === 403) throw new MotorHatasi("engel", iki("SearXNG JSON çıktısını reddetti (403); settings.yml search.formats listesine json ekleyin", "SearXNG refused JSON output (403); add json to search.formats in settings.yml"), 403);
    durumuDenetle(y, "SearXNG");
    return searxngAyristir(jsonCevir<SearxngYanit>(y));
  },
};
