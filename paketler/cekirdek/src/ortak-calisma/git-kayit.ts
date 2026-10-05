// Ortak projede görev kaydının git işlemleri (0.0.8): değişen yollar, yalnız verilen yolların commit'i, commit'in ve
// çalışma ağacının farkı, kirli yolların anlık görüntüsü. Yollar repo köküne göre / ayraçlıdır; --literal-pathspecs ile
// joker yorumlanmaz. Görev commit'inde kancalar atlanır (--no-verify): ortak çalışma kopyasında lint-staged gibi
// kancalar commit'lenmeyen dosyaları saklayıp geri yükler, aynı anda çalışan başkalarının yarım işine dokunur.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DosyaDegisikligi, FarkSonucu } from "@arnorg/ortak";
import * as gitIslemleri from "../git.js";
import { kimlik } from "../yardimci.js";

/** Bir seferde dönen en uzun fark */
const FARK_SINIRI = 1024 * 1024;
/** Komut satırına sığmayan yol listesi dosyayla verilir (Windows'ta komut satırı ~32 bin karakter) */
const SATIR_SINIRI = 6000;

export type YolDegisikligi = "M" | "A" | "D";

/**
 * Çalışma ağacında HEAD'e göre değişen yollar (izlenmeyen yeni dosyalar dahil, yok sayılanlar hariç). yollar
 * verilirse yalnız onlar. kilitsiz: git index'i tazelemek için kilit almaz (anlık görüntü, sıranın dışında)
 */
export async function degisenYollar(repo: string, yollar?: string[], kilitsiz = false): Promise<Map<string, YolDegisikligi>> {
  const cikti = await gitIslemleri.git(repo, [...(kilitsiz ? ["--no-optional-locks"] : []), "-c", "core.quotePath=false", "status", "--porcelain=v1", "-z", "-uall", "--no-renames"]);
  const istenen = yollar ? new Set(yollar.map((y) => anahtar(y))) : null;
  const sonuc = new Map<string, YolDegisikligi>();
  for (const p of cikti.split("\0")) {
    if (p.length < 4) continue;
    const kod = p.slice(0, 2);
    const yol = p.slice(3);
    if (istenen && !istenen.has(anahtar(yol))) continue;
    sonuc.set(yol, kod === "??" || kod.includes("A") ? "A" : kod.includes("D") ? "D" : "M");
  }
  return sonuc;
}

/** Karşılaştırma anahtarı: Windows ve macOS'ta büyük/küçük harf duyarsız */
function anahtar(yol: string): string {
  const t = yol.replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin" ? t.toLowerCase() : t;
}

/** Yol argümanları: kısa listede doğrudan, uzunda geçici dosyayla (--pathspec-from-file) */
function yolArgumanlari(yollar: string[]): { arg: string[]; temizle: () => void } {
  if (yollar.reduce((t, y) => t + y.length + 1, 0) < SATIR_SINIRI) return { arg: ["--", ...yollar], temizle: () => undefined };
  const dosya = path.join(os.tmpdir(), `arnorg-yollar-${kimlik()}`);
  fs.writeFileSync(dosya, yollar.join("\0"), "utf8");
  return { arg: [`--pathspec-from-file=${dosya}`, "--pathspec-file-nul"], temizle: () => fs.rmSync(dosya, { force: true }) };
}

export interface CommitSonucu {
  commit: string;
  dosyalar: string[];
  eklenen: number;
  silinen: number;
}

/**
 * Yalnız verilen yolların çalışma ağacındaki hâlini commit'ler (git commit --only): index'te başka değişiklik olsa da
 * commit'e girmez. Yeni dosyalar önce index'e alınır. Değişen yol yoksa null.
 */
export async function yollariCommitle(repo: string, yollar: string[], konu: string, govde?: string): Promise<CommitSonucu | null> {
  const degisen = [...(await degisenYollar(repo, yollar)).keys()];
  if (!degisen.length) return null;
  await gitIslemleri.kimlikGuvenceAltinaAl(repo);
  const y = yolArgumanlari(degisen);
  try {
    await gitIslemleri.git(repo, ["--literal-pathspecs", "add", "-A", ...y.arg]);
    const mesaj = ["-m", konu, ...(govde?.trim() ? ["-m", govde.trim()] : [])];
    await gitIslemleri.git(repo, ["--literal-pathspecs", "commit", "--no-verify", "-q", ...mesaj, "--only", ...y.arg]);
  } finally {
    y.temizle();
  }
  const commit = (await gitIslemleri.git(repo, ["rev-parse", "HEAD"])).trim();
  const { eklenen, silinen, dosyalar } = await commitSayilari(repo, commit);
  return { commit, dosyalar: dosyalar.length ? dosyalar : degisen, eklenen, silinen };
}

/** Commit'in dosyaları ve eklenen, silinen satır sayısı */
export async function commitSayilari(repo: string, commit: string): Promise<{ dosyalar: string[]; eklenen: number; silinen: number }> {
  const c = await gitIslemleri.git(repo, ["-c", "core.quotePath=false", "show", "--numstat", "--no-renames", "--format=", commit]).catch(() => "");
  let eklenen = 0;
  let silinen = 0;
  const dosyalar: string[] = [];
  for (const satir of c.split("\n")) {
    const [e, s, ...y] = satir.split("\t");
    if (!y.length) continue;
    eklenen += Number(e) || 0;
    silinen += Number(s) || 0;
    dosyalar.push(y.join("\t"));
  }
  return { dosyalar, eklenen, silinen };
}

/** Bir commit'in farkı (ebeveynine göre); kökteki ilk commit'te boş ağaca göre */
export async function commitFarki(repo: string, commit: string, yol?: string): Promise<FarkSonucu> {
  const ek = yol ? ["--", yol] : [];
  const metin = await gitIslemleri.git(repo, ["-c", "core.quotePath=false", "show", "--no-color", "--no-ext-diff", "--no-renames", "--format=", commit, ...ek]);
  const sayilar = await gitIslemleri.git(repo, ["-c", "core.quotePath=false", "show", "--numstat", "--no-renames", "--format=", commit, ...ek]);
  const turler = new Map<string, DosyaDegisikligi>();
  for (const satir of (await gitIslemleri.git(repo, ["-c", "core.quotePath=false", "show", "--name-status", "--no-renames", "--format=", commit, ...ek])).split("\n")) {
    const [kod, ...y] = satir.split("\t");
    if (!kod || !y.length) continue;
    turler.set(y.join("\t"), kod.startsWith("A") ? "A" : kod.startsWith("D") ? "D" : "M");
  }
  return { fark: kisaFark(metin), dosyalar: numstat(sayilar, turler) };
}

/** Verilen yolların çalışma ağacındaki (henüz kaydedilmemiş) farkı; yeni dosyalar tam içerikle */
export async function calismaFarki(repo: string, yollar: string[]): Promise<FarkSonucu> {
  if (!yollar.length) return { fark: "", dosyalar: [] };
  const degisen = await degisenYollar(repo, yollar);
  if (!degisen.size) return { fark: "", dosyalar: [] };
  const parcalar: string[] = [];
  const dosyalar: FarkSonucu["dosyalar"] = [];
  const izlenmeyen = new Set((await gitIslemleri.git(repo, ["-c", "core.quotePath=false", "ls-files", "-z", "--others", "--exclude-standard"]).catch(() => "")).split("\0").filter(Boolean));
  const izliler = [...degisen.keys()].filter((y) => !izlenmeyen.has(y));
  if (izliler.length) {
    const ya = yolArgumanlari(izliler);
    try {
      parcalar.push(await gitIslemleri.git(repo, ["--literal-pathspecs", "-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "--no-renames", "HEAD", ...ya.arg]));
      dosyalar.push(...numstat(await gitIslemleri.git(repo, ["--literal-pathspecs", "-c", "core.quotePath=false", "diff", "--numstat", "--no-renames", "HEAD", ...ya.arg]), new Map(izliler.map((y) => [y, degisen.get(y) ?? "M"]))));
    } finally {
      ya.temizle();
    }
  }
  for (const y of [...degisen.keys()].filter((x) => izlenmeyen.has(x))) {
    const { metin, satir } = yeniDosyaFarki(repo, y);
    parcalar.push(metin);
    dosyalar.push({ yol: y, degisiklik: "A", eklenen: satir, silinen: 0 });
  }
  return { fark: kisaFark(parcalar.join("")), dosyalar };
}

/** İzlenmeyen yeni dosyanın birleşik farkı (ikili ya da çok büyükse yalnız başlık) */
function yeniDosyaFarki(repo: string, yol: string): { metin: string; satir: number } {
  const bas = `diff --git a/${yol} b/${yol}\nnew file mode 100644\n`;
  try {
    const tampon = fs.readFileSync(path.join(repo, yol));
    if (tampon.length > 512 * 1024 || tampon.includes(0)) return { metin: `${bas}Binary files /dev/null and b/${yol} differ\n`, satir: 0 };
    const satirlar = tampon.toString("utf8").replace(/\r\n/g, "\n").split("\n");
    if (satirlar.at(-1) === "") satirlar.pop();
    return { metin: `${bas}--- /dev/null\n+++ b/${yol}\n@@ -0,0 +1,${satirlar.length} @@\n${satirlar.map((s) => `+${s}`).join("\n")}\n`, satir: satirlar.length };
  } catch {
    return { metin: "", satir: 0 };
  }
}

function numstat(cikti: string, turler: Map<string, DosyaDegisikligi>): FarkSonucu["dosyalar"] {
  return cikti
    .split("\n")
    .filter(Boolean)
    .map((s) => {
      const [e, si, ...y] = s.split("\t");
      const yol = y.join("\t");
      return { yol, degisiklik: turler.get(yol) ?? ("M" as const), eklenen: Number(e) || 0, silinen: Number(si) || 0 };
    });
}

function kisaFark(metin: string): string {
  return metin.length > FARK_SINIRI ? `${metin.slice(0, FARK_SINIRI)}\n…` : metin;
}

/** Kirli yolların imzası (değişiklik türü, boyut ve değişme anı): iz alınırken öncekiyle karşılaştırılır */
export async function kirliImzalar(repo: string): Promise<Map<string, string>> {
  const degisen = await degisenYollar(repo, undefined, true);
  const sonuc = new Map<string, string>();
  for (const [yol, tur] of degisen) {
    let imza: string = tur;
    try {
      const s = fs.statSync(path.join(repo, yol));
      // ctime: içerik ya da dosya yeni oluştuğunda (mtime'ı korunarak kopyalansa da) değişir
      imza = `${tur}:${s.size}:${Math.round(s.mtimeMs)}:${Math.round(s.ctimeMs)}`;
    } catch {
      imza = "D";
    }
    sonuc.set(yol, imza);
  }
  return sonuc;
}

/** İmzadaki son değişiklik anı (mtime ile ctime'ın büyüğü); silinen dosyada null */
export function imzaZamani(imza: string): number | null {
  const [, , m, c] = imza.split(":");
  const z = Math.max(Number(m) || 0, Number(c) || 0);
  return z > 0 ? z : null;
}

/** Çalışma ağacı (izlenen dosyalarda) temiz mi */
export async function izlenenTemiz(repo: string): Promise<boolean> {
  return !(await gitIslemleri.git(repo, ["status", "--porcelain", "--untracked-files=no"])).trim();
}
