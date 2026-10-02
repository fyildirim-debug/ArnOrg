// Sistem git'i üzerinden küçük yardımcılar
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { temizOrtam } from "./ortam.js";
import { ArnorgHatasi } from "./yardimci.js";

const execFileP = promisify(execFile);

export async function git(dizin: string, argumanlar: string[], secenek: { izinVerilenKodlar?: number[] } = {}): Promise<string> {
  try {
    const { stdout } = await execFileP("git", argumanlar, {
      cwd: dizin,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: temizOrtam({ GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" }),
    });
    return stdout;
  } catch (h) {
    const hata = h as { code?: number; stderr?: string; stdout?: string; message: string };
    if (typeof hata.code === "number" && secenek.izinVerilenKodlar?.includes(hata.code)) return hata.stdout ?? "";
    throw new ArnorgHatasi(`git ${argumanlar[0]} başarısız: ${(hata.stderr || hata.message).trim().slice(0, 400)}`, 500);
  }
}

export async function gitVarMi(): Promise<boolean> {
  try {
    await execFileP("git", ["--version"], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function repoMu(dizin: string): Promise<boolean> {
  try {
    const cikti = await git(dizin, ["rev-parse", "--is-inside-work-tree"]);
    return cikti.trim() === "true";
  } catch {
    return false;
  }
}

export async function repoKoku(dizin: string): Promise<string> {
  return path.resolve((await git(dizin, ["rev-parse", "--show-toplevel"])).trim());
}

export async function commitVarMi(dizin: string): Promise<boolean> {
  try {
    await git(dizin, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export async function mevcutDal(dizin: string): Promise<string> {
  const d = (await git(dizin, ["symbolic-ref", "--short", "-q", "HEAD"], { izinVerilenKodlar: [1] })).trim();
  return d || "HEAD";
}

/** Repo kimliği yoksa yerel olarak ArnOrg kimliği tanımlar (yalnız bu repo için) */
export async function kimlikGuvenceAltinaAl(dizin: string): Promise<void> {
  const ad = (await git(dizin, ["config", "user.name"], { izinVerilenKodlar: [1] })).trim();
  if (!ad) await git(dizin, ["config", "user.name", "ArnOrg"]);
  const eposta = (await git(dizin, ["config", "user.email"], { izinVerilenKodlar: [1] })).trim();
  if (!eposta) await git(dizin, ["config", "user.email", "arnorg@localhost"]);
}

export async function repoBaslat(dizin: string, dal = "main"): Promise<void> {
  fs.mkdirSync(dizin, { recursive: true });
  await git(dizin, ["init", "-b", dal]);
  await kimlikGuvenceAltinaAl(dizin);
}

export async function tumunuCommitle(dizin: string, mesaj: string): Promise<boolean> {
  await git(dizin, ["add", "-A"]);
  const durum = await git(dizin, ["status", "--porcelain"]);
  if (!durum.trim()) return false;
  await git(dizin, ["commit", "-m", mesaj]);
  return true;
}

export interface WorktreeBilgisi {
  yol: string;
  dal: string | null;
  bas: string | null;
}

export async function worktreeler(dizin: string): Promise<WorktreeBilgisi[]> {
  const cikti = await git(dizin, ["worktree", "list", "--porcelain"]);
  const sonuc: WorktreeBilgisi[] = [];
  let mevcut: WorktreeBilgisi | null = null;
  for (const satir of cikti.split("\n")) {
    if (satir.startsWith("worktree ")) {
      if (mevcut) sonuc.push(mevcut);
      mevcut = { yol: path.resolve(satir.slice(9)), dal: null, bas: null };
    } else if (mevcut && satir.startsWith("branch ")) mevcut.dal = satir.slice(7).replace(/^refs\/heads\//, "");
    else if (mevcut && satir.startsWith("HEAD ")) mevcut.bas = satir.slice(5);
  }
  if (mevcut) sonuc.push(mevcut);
  return sonuc;
}

export async function dalVarMi(dizin: string, dal: string): Promise<boolean> {
  try {
    await git(dizin, ["rev-parse", "--verify", `refs/heads/${dal}`]);
    return true;
  } catch {
    return false;
  }
}

/** Ajan için worktree açar; varsa dokunmaz */
export async function worktreeAc(repo: string, hedef: string, dal: string, temel: string): Promise<void> {
  const mevcutlar = await worktreeler(repo);
  if (mevcutlar.some((w) => path.resolve(w.yol) === path.resolve(hedef))) return;
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  if (await dalVarMi(repo, dal)) await git(repo, ["worktree", "add", hedef, dal]);
  else await git(repo, ["worktree", "add", "-b", dal, hedef, temel]);
}

export type DegisiklikHaritasi = Map<string, "M" | "A" | "D" | "?">;

/** git status --porcelain → göreli yol başına değişiklik türü */
export async function degisiklikler(dizin: string): Promise<DegisiklikHaritasi> {
  const harita: DegisiklikHaritasi = new Map();
  let cikti = "";
  try {
    cikti = await git(dizin, ["status", "--porcelain=v1", "-uall", "-z"]);
  } catch {
    return harita;
  }
  const parcalar = cikti.split("\0");
  for (let i = 0; i < parcalar.length; i++) {
    const p = parcalar[i]!;
    if (p.length < 4) continue;
    const kod = p.slice(0, 2);
    const yol = p.slice(3);
    if (kod.startsWith("R")) i++; // yeniden adlandırmada eski yol ayrı gelir
    const tur = kod === "??" ? "A" : kod.includes("D") ? "D" : kod.includes("A") ? "A" : "M";
    harita.set(yol, tur);
  }
  return harita;
}

/** Çalışma alanının temel dala göre farkı (commit'lenmemiş değişiklikler dahil) */
export async function fark(dizin: string, temel: string, yol?: string): Promise<{ fark: string; sayilar: { yol: string; eklenen: number; silinen: number }[] }> {
  const ek = yol ? ["--", yol] : [];
  let temelRef = temel;
  try {
    temelRef = (await git(dizin, ["merge-base", temel, "HEAD"])).trim() || temel;
  } catch {
    // temel dal yoksa (ör. ilk commit) doğrudan HEAD ile karşılaştır
    temelRef = "HEAD";
  }
  const metin = await git(dizin, ["diff", "--no-color", "--no-ext-diff", temelRef, ...ek]);
  const sayiCiktisi = await git(dizin, ["diff", "--numstat", temelRef, ...ek]);
  const sayilar = sayiCiktisi
    .split("\n")
    .filter(Boolean)
    .map((s) => {
      const [e, si, ...y] = s.split("\t");
      return { yol: y.join("\t"), eklenen: Number(e) || 0, silinen: Number(si) || 0 };
    });
  return { fark: metin, sayilar };
}

/** Ajan dalını hedef dala birleştirir; çakışmada geri alır */
export async function birlestir(repo: string, kaynakDal: string, mesaj: string): Promise<{ basarili: boolean; cikti: string }> {
  try {
    const cikti = await git(repo, ["merge", "--no-ff", "-m", mesaj, kaynakDal]);
    return { basarili: true, cikti };
  } catch (h) {
    await git(repo, ["merge", "--abort"], { izinVerilenKodlar: [128, 1] }).catch(() => undefined);
    return { basarili: false, cikti: (h as Error).message };
  }
}
