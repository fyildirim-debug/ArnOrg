// GitHub API: gh CLI girişliyse onun belirteciyle (kullanıcının oran sınırı ve özel depoları), değilse genel API.
// Kullanan: kod kategorisindeki GitHub arama motoru ve github_ara aracı.
import { execFile } from "node:child_process";
import { iki } from "../dil.js";
import { apiBasliklari, jsonCevir, type Getirici } from "./http.js";
import { etiketsiz, GhGirisYok, kirp, MotorHatasi, type GhIstemcisi, type MotorSonucu } from "./motorlar/ortak.js";

const GIRIS_YOK_BEKLEME_MS = 10 * 60_000;
const GH_KABUL = "application/vnd.github+json";

/** gh'yi çalıştırır; çıkış kodu sıfır değilse de sonucu döndürür (kod null: süre doldu ya da başlatılamadı) */
function ghCalistir(yol: string, argumanlar: string[], env: Record<string, string>, zamanMs: number): Promise<{ kod: number | null; cikti: string; hata: string }> {
  return new Promise((coz) => {
    execFile(yol, argumanlar, { env, timeout: zamanMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (h, stdout, stderr) => {
      const kod = h ? (typeof (h as { code?: unknown }).code === "number" ? (h as { code: number }).code : null) : 0;
      coz({ kod, cikti: String(stdout ?? ""), hata: String(stderr ?? "") || (h && kod === null ? h.message : "") });
    });
  });
}

/** gh komutunu bulan işlev: kurulu değilse null */
export type GhBulucu = () => { yol: string; ortam: Record<string, string> } | null;

/**
 * gh api ile GitHub isteği. Giriş yoksa GhGirisYok atar ve 10 dakika gh denenmez (genel API'ye düşülür).
 * Oran sınırı ve erişim hataları MotorHatasi olur.
 */
export function ghIstemcisi(bul: GhBulucu, zamanMs = 15_000): GhIstemcisi {
  let girisYokZamani = 0;
  return {
    async api<T>(yol: string, kabul = GH_KABUL): Promise<T> {
      const gh = bul();
      if (!gh || Date.now() - girisYokZamani < GIRIS_YOK_BEKLEME_MS) throw new GhGirisYok();
      const s = await ghCalistir(gh.yol, ["api", "-X", "GET", yol, "-H", `Accept: ${kabul}`], gh.ortam, zamanMs);
      if (s.kod === 0) {
        try {
          return JSON.parse(s.cikti) as T;
        } catch {
          throw new MotorHatasi("cozumleme", iki("GitHub yanıtı okunamadı", "Could not read the GitHub response"));
        }
      }
      const metin = `${s.hata}\n${s.cikti}`.trim();
      if (/auth login|not logged|authenticat|401|bad credentials|token .* invalid/i.test(metin)) {
        girisYokZamani = Date.now();
        throw new GhGirisYok();
      }
      if (/rate limit|secondary rate|429/i.test(metin)) throw new MotorHatasi("cok_istek", iki("GitHub oran sınırına takıldı", "Hit the GitHub rate limit"), 429);
      if (/\b403\b|forbidden|not available/i.test(metin)) throw new MotorHatasi("engel", `GitHub: ${kirp(metin.split("\n")[0] ?? "", 160)}`, 403);
      throw new MotorHatasi(s.kod === null ? "zaman_asimi" : "http", `GitHub: ${kirp(metin.split("\n")[0] ?? "", 160)}`);
    },
  };
}

/** GitHub API isteği: önce gh (girişliyse), olmazsa genel API */
export async function githubIstegi<T>(yol: string, o: { gh: GhIstemcisi | null; getir: Getirici; zamanAsimiMs?: number }, kabul = GH_KABUL): Promise<{ veri: T; kaynak: "gh" | "genel" }> {
  if (o.gh) {
    try {
      return { veri: await o.gh.api<T>(yol, kabul), kaynak: "gh" };
    } catch (h) {
      if (!(h instanceof GhGirisYok)) throw h;
    }
  }
  const y = await o.getir(`https://api.github.com/${yol}`, { basliklar: apiBasliklari({ Accept: kabul, "X-GitHub-Api-Version": "2022-11-28" }), zamanAsimiMs: o.zamanAsimiMs ?? 8000 });
  if (y.durum === 429 || (y.durum === 403 && (y.basliklar["x-ratelimit-remaining"] === "0" || /rate limit/i.test(new TextDecoder().decode(y.govde))))) {
    throw new MotorHatasi("cok_istek", iki("GitHub oran sınırına takıldı (girişsiz dakikada 10 arama); gh auth login ile giriş yapın", "Hit the GitHub rate limit (10 searches a minute without sign-in); sign in with gh auth login"), y.durum);
  }
  if (y.durum === 401) throw new MotorHatasi("engel", iki("GitHub bu arama için giriş istiyor (gh auth login)", "GitHub needs a sign-in for this search (gh auth login)"), 401);
  if (y.durum === 403) throw new MotorHatasi("engel", iki("GitHub erişimi reddetti (403)", "GitHub denied access (403)"), 403);
  if (y.durum === 422) throw new MotorHatasi("http", iki("GitHub sorguyu geçersiz buldu (422)", "GitHub found the query invalid (422)"), 422);
  if (y.durum < 200 || y.durum >= 300) throw new MotorHatasi("http", iki(`GitHub ${y.durum} döndürdü`, `GitHub returned ${y.durum}`), y.durum);
  const veri = jsonCevir<T>(y);
  if (veri === null) throw new MotorHatasi("cozumleme", iki("GitHub yanıtı okunamadı", "Could not read the GitHub response"));
  return { veri, kaynak: "genel" };
}

export interface GhDepo {
  full_name: string;
  html_url: string;
  description?: string | null;
  stargazers_count?: number;
  language?: string | null;
  pushed_at?: string | null;
  updated_at?: string | null;
  archived?: boolean;
  license?: { spdx_id?: string | null } | null;
}

export interface GhIssue {
  title: string;
  html_url: string;
  number: number;
  state?: string;
  comments?: number;
  updated_at?: string;
  repository_url?: string;
  pull_request?: unknown;
  body?: string | null;
}

export interface GhKod {
  name: string;
  path: string;
  html_url: string;
  repository?: { full_name?: string };
  text_matches?: { fragment?: string }[];
}

export interface GhAramaYaniti<T> {
  total_count?: number;
  incomplete_results?: boolean;
  items?: T[];
}

function binlik(n: number | undefined): string {
  return (n ?? 0).toLocaleString(iki("tr-TR", "en-US"));
}

export function depoSonuclari(g: GhAramaYaniti<GhDepo>): MotorSonucu[] {
  return (g.items ?? []).map((d) => ({
    baslik: d.full_name,
    adres: d.html_url,
    ozet: kirp([`★ ${binlik(d.stargazers_count)}`, d.language ?? "", d.archived ? iki("arşivlenmiş", "archived") : "", d.description ?? ""].filter(Boolean).join(" · "), 400),
    tarih: d.pushed_at ?? d.updated_at ?? null,
  }));
}

export function issueSonuclari(g: GhAramaYaniti<GhIssue>): MotorSonucu[] {
  return (g.items ?? []).map((x) => {
    const depo = x.repository_url?.replace(/^https:\/\/api\.github\.com\/repos\//, "") ?? "";
    const tur = x.pull_request ? "PR" : "issue";
    return {
      baslik: `${depo}#${x.number} ${x.title}`,
      adres: x.html_url,
      ozet: kirp([`${tur} · ${x.state ?? "?"}`, iki(`${x.comments ?? 0} yorum`, `${x.comments ?? 0} comments`), etiketsiz(x.body ?? "")].filter(Boolean).join(" · "), 400),
      tarih: x.updated_at ?? null,
    };
  });
}

export function kodSonuclari(g: GhAramaYaniti<GhKod>): MotorSonucu[] {
  return (g.items ?? []).map((k) => ({
    baslik: `${k.repository?.full_name ?? ""}: ${k.path}`,
    adres: k.html_url,
    ozet: kirp((k.text_matches ?? []).map((m) => (m.fragment ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" … "), 400),
    tarih: null,
  }));
}
