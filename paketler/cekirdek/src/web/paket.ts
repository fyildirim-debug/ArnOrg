// Paket bilgisi: npm, PyPI ve crates.io registry API'lerinden son sürüm, lisans, indirme sayısı, depo adresi,
// son yayın tarihi ve kısa açıklama (paket_bilgisi aracı)
import { iki } from "../dil.js";
import { ArnorgHatasi } from "../yardimci.js";
import { AgHatasi, apiBasliklari, jsonCevir, type Getirici, type GetirYaniti } from "./http.js";

export type Ekosistem = "npm" | "pypi" | "crates";
export const EKOSISTEMLER: Ekosistem[] = ["npm", "pypi", "crates"];

export interface PaketBilgisi {
  ad: string;
  ekosistem: Ekosistem;
  surum: string | null;
  lisans: string | null;
  /** npm: son 7 gün · pypi: pypistats son hafta (alınabilirse) · crates: yok */
  haftalikIndirme: number | null;
  /** crates.io: son 90 gün */
  yakinIndirme: number | null;
  depo: string | null;
  anaSayfa: string | null;
  sonYayin: string | null;
  aciklama: string | null;
  /** Paketin registry sayfası */
  adres: string;
}

const ZAMAN_ASIMI_MS = 10_000;

/** git+https://github.com/a/b.git, git://…, github:a/b → https://github.com/a/b */
export function depoAdresi(ham: string | null | undefined): string | null {
  if (!ham) return null;
  let s = ham.trim().replace(/^git\+/, "");
  const kisa = /^github:([^/]+\/[^/#]+)/.exec(s);
  if (kisa) return `https://github.com/${kisa[1]}`;
  s = s.replace(/^git:\/\//, "https://").replace(/^ssh:\/\/git@/, "https://").replace(/^git@([^:]+):/, "https://$1/");
  return s.replace(/\.git(#.*)?$/, "").replace(/#.*$/, "") || null;
}

function adiDogrula(ad: string, ekosistem: Ekosistem): string {
  const t = ad.trim();
  const desen = ekosistem === "npm" ? /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i : ekosistem === "pypi" ? /^[a-z0-9][\w.-]*$/i : /^[a-z0-9][\w-]*$/i;
  if (!t || t.length > 214 || !desen.test(t)) throw new ArnorgHatasi(iki(`Geçersiz paket adı: ${ad}`, `Invalid package name: ${ad}`));
  return t;
}

async function getirJson<T>(getir: Getirici, adres: string, ad: string): Promise<{ y: GetirYaniti; veri: T | null }> {
  let y: GetirYaniti;
  try {
    y = await getir(adres, { basliklar: apiBasliklari(), zamanAsimiMs: ZAMAN_ASIMI_MS });
  } catch (h) {
    if (h instanceof AgHatasi) throw new ArnorgHatasi(iki(`${ad} registry'sine ulaşılamadı: ${h.message}`, `Could not reach the ${ad} registry: ${h.message}`), 502);
    throw h;
  }
  return { y, veri: y.durum >= 200 && y.durum < 300 ? jsonCevir<T>(y) : null };
}

function bulunamadi(ad: string, ekosistem: Ekosistem): ArnorgHatasi {
  return new ArnorgHatasi(iki(`${ekosistem} üzerinde "${ad}" adında paket yok.`, `There is no package named "${ad}" on ${ekosistem}.`), 404);
}

function registryHatasi(durum: number, ekosistem: Ekosistem): ArnorgHatasi {
  return new ArnorgHatasi(iki(`${ekosistem} registry'si ${durum} döndürdü.`, `The ${ekosistem} registry returned ${durum}.`), 502);
}

async function npmBilgisi(ad: string, getir: Getirici): Promise<PaketBilgisi> {
  const kodlu = ad.startsWith("@") ? `@${encodeURIComponent(ad.slice(1))}` : encodeURIComponent(ad);
  const [son, indirme, arama] = await Promise.all([
    getirJson<{ version?: string; license?: string | { type?: string }; description?: string; homepage?: string; repository?: string | { url?: string } }>(getir, `https://registry.npmjs.org/${kodlu}/latest`, "npm"),
    getirJson<{ downloads?: number }>(getir, `https://api.npmjs.org/downloads/point/last-week/${ad}`, "npm").catch(() => null),
    getirJson<{ objects?: { package: { name: string; date?: string } }[] }>(getir, `https://registry.npmjs.org/-/v1/search?${new URLSearchParams({ text: ad, size: "5" })}`, "npm").catch(() => null),
  ]);
  if (son.y.durum === 404) throw bulunamadi(ad, "npm");
  if (!son.veri) throw registryHatasi(son.y.durum, "npm");
  const p = son.veri;
  const depo = typeof p.repository === "string" ? p.repository : p.repository?.url;
  return {
    ad,
    ekosistem: "npm",
    surum: p.version ?? null,
    lisans: typeof p.license === "string" ? p.license : (p.license?.type ?? null),
    haftalikIndirme: typeof indirme?.veri?.downloads === "number" ? indirme.veri.downloads : null,
    yakinIndirme: null,
    depo: depoAdresi(depo),
    anaSayfa: p.homepage ?? null,
    sonYayin: arama?.veri?.objects?.find((o) => o.package.name === ad)?.package.date ?? null,
    aciklama: p.description ?? null,
    adres: `https://www.npmjs.com/package/${ad}`,
  };
}

/** PyPI lisansı: license_expression, kısa license alanı ya da sınıflandırıcı */
function pypiLisansi(info: { license?: string | null; license_expression?: string | null; classifiers?: string[] }): string | null {
  if (info.license_expression?.trim()) return info.license_expression.trim();
  const l = info.license?.trim();
  if (l && l.length <= 60 && !l.includes("\n")) return l;
  const s = info.classifiers?.find((c) => c.startsWith("License :: "));
  return s ? s.split(" :: ").pop()! : l ? `${l.split("\n")[0]!.slice(0, 60)}…` : null;
}

async function pypiBilgisi(ad: string, getir: Getirici): Promise<PaketBilgisi> {
  const [paket, istatistik] = await Promise.all([
    getirJson<{
      info?: { name?: string; version?: string; summary?: string; license?: string | null; license_expression?: string | null; classifiers?: string[]; home_page?: string | null; project_urls?: Record<string, string> | null };
      urls?: { upload_time_iso_8601?: string }[];
    }>(getir, `https://pypi.org/pypi/${encodeURIComponent(ad)}/json`, "PyPI"),
    getirJson<{ data?: { last_week?: number } }>(getir, `https://pypistats.org/api/packages/${encodeURIComponent(ad.toLowerCase())}/recent`, "pypistats").catch(() => null),
  ]);
  if (paket.y.durum === 404) throw bulunamadi(ad, "pypi");
  const info = paket.veri?.info;
  if (!info) throw registryHatasi(paket.y.durum, "pypi");
  const baglantilar = Object.entries(info.project_urls ?? {});
  const bul = (desen: RegExp) => baglantilar.find(([k]) => desen.test(k))?.[1] ?? null;
  const depo = bul(/^(source|source code|repository|code|github)$/i) ?? baglantilar.map(([, v]) => v).find((v) => /github\.com|gitlab\.com|codeberg\.org/i.test(v)) ?? null;
  return {
    ad: info.name ?? ad,
    ekosistem: "pypi",
    surum: info.version ?? null,
    lisans: pypiLisansi(info),
    haftalikIndirme: typeof istatistik?.veri?.data?.last_week === "number" ? istatistik.veri.data.last_week : null,
    yakinIndirme: null,
    depo,
    anaSayfa: bul(/^home ?page$/i) ?? info.home_page ?? null,
    sonYayin: paket.veri?.urls?.[0]?.upload_time_iso_8601 ?? null,
    aciklama: info.summary ?? null,
    adres: `https://pypi.org/project/${info.name ?? ad}/`,
  };
}

async function cratesBilgisi(ad: string, getir: Getirici): Promise<PaketBilgisi> {
  const { y, veri } = await getirJson<{
    crate?: { name: string; description?: string | null; homepage?: string | null; repository?: string | null; max_stable_version?: string | null; max_version?: string; newest_version?: string; updated_at?: string; recent_downloads?: number | null };
    versions?: { num: string; license?: string | null; created_at?: string; yanked?: boolean }[];
  }>(getir, `https://crates.io/api/v1/crates/${encodeURIComponent(ad)}`, "crates.io");
  if (y.durum === 404) throw bulunamadi(ad, "crates");
  const c = veri?.crate;
  if (!c) throw registryHatasi(y.durum, "crates");
  const surum = c.max_stable_version ?? c.newest_version ?? c.max_version ?? null;
  const s = veri?.versions?.find((v) => v.num === surum) ?? veri?.versions?.find((v) => !v.yanked);
  return {
    ad: c.name,
    ekosistem: "crates",
    surum,
    lisans: s?.license ?? null,
    haftalikIndirme: null,
    yakinIndirme: typeof c.recent_downloads === "number" ? c.recent_downloads : null,
    depo: depoAdresi(c.repository),
    anaSayfa: c.homepage ?? null,
    sonYayin: s?.created_at ?? c.updated_at ?? null,
    aciklama: c.description?.trim() ?? null,
    adres: `https://crates.io/crates/${c.name}`,
  };
}

export async function paketBilgisi(ad: string, ekosistem: Ekosistem, getir: Getirici): Promise<PaketBilgisi> {
  const temiz = adiDogrula(ad, ekosistem);
  if (ekosistem === "npm") return npmBilgisi(temiz, getir);
  if (ekosistem === "pypi") return pypiBilgisi(temiz, getir);
  return cratesBilgisi(temiz, getir);
}

/** Aracın kısa, yapılı çıktısı */
export function paketMetni(p: PaketBilgisi): string {
  const sayi = (n: number) => n.toLocaleString(iki("tr-TR", "en-US"));
  const satirlar = [
    `${p.ad} (${p.ekosistem})`,
    `${iki("Son sürüm", "Latest version")}: ${p.surum ?? "?"}${p.sonYayin ? ` · ${iki("yayın", "published")} ${p.sonYayin.slice(0, 10)}` : ""}`,
    `${iki("Lisans", "License")}: ${p.lisans ?? iki("belirtilmemiş", "not stated")}`,
    p.haftalikIndirme !== null ? `${iki("Haftalık indirme", "Weekly downloads")}: ${sayi(p.haftalikIndirme)}` : "",
    p.yakinIndirme !== null ? `${iki("Son 90 günde indirme", "Downloads in the last 90 days")}: ${sayi(p.yakinIndirme)}` : "",
    p.depo ? `${iki("Depo", "Repository")}: ${p.depo}` : "",
    p.anaSayfa && p.anaSayfa !== p.depo ? `${iki("Ana sayfa", "Homepage")}: ${p.anaSayfa}` : "",
    p.aciklama ? `${iki("Açıklama", "Description")}: ${p.aciklama}` : "",
    `${iki("Sayfa", "Page")}: ${p.adres}`,
  ];
  return satirlar.filter(Boolean).join("\n");
}
