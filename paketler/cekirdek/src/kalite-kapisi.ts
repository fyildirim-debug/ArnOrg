// Kalite denetiminin araçları: projenin kalıcı kalite çalışma alanı (denetlenen commit'e ayrık worktree), kabukta süre
// sınırlı komut (zaman aşımında süreç ağacı öldürülür), çıktının son kısmı, eski birleştirme onaylarında dalın hedefe
// göre farkı ve proje kökündeki package.json'dan tek tıklık komut önerisi. 0.0.8'de görev kaydının denetimi
// (ortak-calisma/kalite.ts) bunları kullanır.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { DosyaDegisikligi, FarkSonucu, KaliteOnerisi, Proje } from "@arnorg/ortak";
import * as gitIslemleri from "./git.js";
import { ajanOrtami } from "./ortam.js";

/** Saklanan çıktının sınırları: son 300 satır, en çok 64 KB */
export const CIKTI_SATIR_SINIRI = 300;
export const CIKTI_BAYT_SINIRI = 64 * 1024;
/** Birleşik farkın en çok bu kadarı döner */
const FARK_SINIRI = 1024 * 1024;

// ---------------------------------------------------------------------------
// Çıktı
// ---------------------------------------------------------------------------

/** Renk ve imleç kodları (CSI, OSC, iki baytlık kaçışlar) */
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** Metnin son kısmı: satır başına dönüş terminaldeki gibi üzerine yazar, son satır ve bayt sınırı uygulanır */
export function sonKisim(metin: string, satirSiniri = CIKTI_SATIR_SINIRI, baytSiniri = CIKTI_BAYT_SINIRI): string {
  const satirlar = metin
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => (s.includes("\r") ? s.slice(s.lastIndexOf("\r", s.length - 2) + 1).replace(/\r$/, "") : s));
  let son = satirlar.slice(-satirSiniri).join("\n");
  if (Buffer.byteLength(son, "utf8") > baytSiniri) {
    const b = Buffer.from(son, "utf8");
    son = b.subarray(b.length - baytSiniri).toString("utf8").replace(/^[^\n]*\n/, "");
  }
  return son;
}

/** Süren komutun çıktısı: yalnız son kısım bellekte tutulur */
export class CiktiKuyrugu {
  private ham = "";
  private surum = 0;

  ekle(parca: string): void {
    if (!parca) return;
    this.ham += parca;
    // Sınırın birkaç katı birikince baştan kırpılır; satır ve bayt sınırı metin() içinde uygulanır
    if (this.ham.length > CIKTI_BAYT_SINIRI * 3) this.ham = this.ham.slice(-CIKTI_BAYT_SINIRI * 2);
    this.surum++;
  }

  /** Her eklemede artar (canlı yayında değişiklik denetimi için) */
  get degisim(): number {
    return this.surum;
  }

  /** Renk kodları ayıklanmış son kısım (parçalara bölünmüş kaçış dizileri de bütün hâlde ayıklanır) */
  metin(): string {
    return sonKisim(this.ham.replace(ANSI, "")).replace(/\s+$/, "");
  }
}

// ---------------------------------------------------------------------------
// Komut
// ---------------------------------------------------------------------------

export interface KomutSonucu {
  durum: "gecti" | "kaldi" | "zaman_asimi" | "iptal";
  /** Çıkış kodu; öldürülen ya da başlatılamayan süreçte null */
  kod: number | null;
  sureMs: number;
}

/** Süreç ağacını öldürür: Windows'ta taskkill /T /F, Linux ve macOS'ta süreç grubu (önce SIGTERM, 2 sn sonra SIGKILL) */
export function surecAgaciniOldur(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => undefined);
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // süreç zaten bitmiş
    }
  }
  setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // grup kalmadı
    }
  }, 2000).unref();
}

/**
 * Komutu kabukla, temiz ortamla ve süre sınırıyla koşar. Ortam ajanlarınkiyle aynıdır (üst oturum değişkenleri ve API
 * anahtarları geçmez); ajanın kendi alanında geçen test kapıda da aynı koşulda koşar. Girdi kapalıdır; CI=true ve
 * renksiz çıktı istenir ki test araçları izleme kipine girmesin. Linux ve macOS'ta süreç kendi grubunu açar (ağaç
 * birlikte öldürülsün diye).
 */
export function komutCalistir(komut: string, s: { cwd: string; zamanAsimiMs: number; cikti: CiktiKuyrugu; iptal?: AbortSignal }): Promise<KomutSonucu> {
  return new Promise((coz) => {
    const baslangic = Date.now();
    let cocuk: ChildProcess;
    try {
      cocuk = spawn(komut, {
        cwd: s.cwd,
        shell: true,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: ajanOrtami({ CI: "true", NO_COLOR: "1", FORCE_COLOR: "0", GIT_TERMINAL_PROMPT: "0" }),
      });
    } catch (h) {
      s.cikti.ekle(`${(h as Error).message}\n`);
      coz({ durum: "kaldi", kod: null, sureMs: 0 });
      return;
    }
    let neden: "zaman_asimi" | "iptal" | null = null;
    let bitti = false;
    let yedek: NodeJS.Timeout | null = null;
    const bitir = (kod: number | null) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayici);
      if (yedek) clearTimeout(yedek);
      s.iptal?.removeEventListener("abort", iptalEt);
      coz({ durum: neden ?? (kod === 0 ? "gecti" : "kaldi"), kod: neden ? null : kod, sureMs: Date.now() - baslangic });
    };
    const oldur = () => {
      surecAgaciniOldur(cocuk.pid);
      // Ağaçtan kaçan bir süreç boruları açık tutarsa beklenmez
      yedek ??= setTimeout(() => {
        cocuk.stdout?.destroy();
        cocuk.stderr?.destroy();
        bitir(null);
      }, 5000);
    };
    const zamanlayici = setTimeout(() => {
      neden = "zaman_asimi";
      oldur();
    }, Math.max(1, s.zamanAsimiMs));
    const iptalEt = () => {
      neden ??= "iptal";
      oldur();
    };
    if (s.iptal?.aborted) iptalEt();
    else s.iptal?.addEventListener("abort", iptalEt, { once: true });
    const cozuculer = [new StringDecoder("utf8"), new StringDecoder("utf8")];
    cocuk.stdout?.on("data", (b: Buffer) => s.cikti.ekle(cozuculer[0]!.write(b)));
    cocuk.stderr?.on("data", (b: Buffer) => s.cikti.ekle(cozuculer[1]!.write(b)));
    cocuk.on("error", (h) => {
      s.cikti.ekle(`\n${h.message}\n`);
      bitir(null);
    });
    cocuk.on("close", (kod) => bitir(kod));
  });
}

// ---------------------------------------------------------------------------
// Kalite çalışma alanı
// ---------------------------------------------------------------------------

/** Projenin kalite çalışma alanı: veri dizininde, ajan çalışma alanlarından ayrı (kok = <veri>/kalite); proje adı değişse de aynı yer */
export function kaliteYolu(kok: string, proje: Pick<Proje, "id">): string {
  return path.join(kok, proje.id);
}

/** Kalite alanını kaldırır (proje ArnOrg'dan çıkarılınca); hata yutulur */
export async function kaliteAlaniniSil(repo: string, yol: string): Promise<void> {
  if (fs.existsSync(repo)) await gitIslemleri.git(repo, ["worktree", "remove", "--force", yol]).catch(() => undefined);
  fs.rmSync(yol, { recursive: true, force: true });
  if (fs.existsSync(repo)) await gitIslemleri.git(repo, ["worktree", "prune"]).catch(() => undefined);
}

/** Dal ya da commit adının tam commit kimliği; yoksa null */
export async function commitBul(repo: string, ad: string): Promise<string | null> {
  const c = await gitIslemleri.git(repo, ["rev-parse", "--verify", "-q", `${ad}^{commit}`], { izinVerilenKodlar: [1, 128] }).catch(() => "");
  return c.trim() || null;
}

/**
 * Kalite alanını hedef commit'e ayrık (detached) getirir ve temizler: yarım birleştirme bırakılır, izlenen dosyalar
 * sıfırlanır, izlenmeyenler silinir. Yoksayılan dosyalar (node_modules gibi) kalır ki hazırlık hızlı olsun.
 * Alan yoksa ya da bozulduysa yeniden açılır.
 */
export async function kaliteAlaniHazirla(repo: string, yol: string, commit: string): Promise<void> {
  const kayitli = (await gitIslemleri.worktreeler(repo)).some((w) => gitIslemleri.ayniYol(w.yol, yol));
  if (kayitli && fs.existsSync(path.join(yol, ".git"))) {
    await gitIslemleri.git(yol, ["merge", "--abort"], { izinVerilenKodlar: [1, 128] }).catch(() => undefined);
    // Argümansız reset HEAD'i oynatmaz; alan bir dala geçirilmiş olsa bile o dal yerinde kalır
    await gitIslemleri.git(yol, ["reset", "--hard", "-q"]);
    await gitIslemleri.git(yol, ["checkout", "-q", "--detach", "--force", commit]);
  } else {
    await gitIslemleri.git(repo, ["worktree", "prune"]);
    fs.rmSync(yol, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(yol), { recursive: true });
    await gitIslemleri.git(repo, ["worktree", "add", "--detach", yol, commit]);
  }
  await gitIslemleri.git(yol, ["clean", "-fdq"]);
}

/** Alanı son commit'e geri sarar (komutların bıraktığı izlenen değişiklikler atılır); hata yutulur */
export async function kaliteAlaniniBirak(yol: string): Promise<void> {
  if (!fs.existsSync(path.join(yol, ".git"))) return;
  await gitIslemleri.git(yol, ["reset", "--hard", "-q"]).catch(() => undefined);
}

/** Kaynağın hedefe göre farkı (ortak atadan kaynağa; yalnız commit'lenmiş değişiklikler) */
export async function dalFarki(repo: string, hedef: string, kaynak: string): Promise<FarkSonucu> {
  const taban = (await gitIslemleri.git(repo, ["merge-base", hedef, kaynak]).catch(() => "")).trim() || hedef;
  const metin = await gitIslemleri.git(repo, ["diff", "--no-color", "--no-ext-diff", "--no-renames", taban, kaynak]);
  const sayilar = await gitIslemleri.git(repo, ["diff", "--numstat", "--no-renames", taban, kaynak]);
  const turler = new Map<string, DosyaDegisikligi>();
  for (const satir of (await gitIslemleri.git(repo, ["diff", "--name-status", "--no-renames", taban, kaynak])).split("\n")) {
    const [kod, ...y] = satir.split("\t");
    if (!kod || !y.length) continue;
    turler.set(y.join("\t"), kod.startsWith("A") ? "A" : kod.startsWith("D") ? "D" : "M");
  }
  const dosyalar = sayilar
    .split("\n")
    .filter(Boolean)
    .map((s) => {
      const [e, si, ...y] = s.split("\t");
      const yol = y.join("\t");
      return { yol, degisiklik: turler.get(yol) ?? ("M" as const), eklenen: Number(e) || 0, silinen: Number(si) || 0 };
    });
  return { fark: metin.length > FARK_SINIRI ? `${metin.slice(0, FARK_SINIRI)}\n…` : metin, dosyalar };
}

// ---------------------------------------------------------------------------
// Öneri
// ---------------------------------------------------------------------------

/** npm init'in yer tutucu betiği gerçek test sayılmaz */
const BOS_TEST = /no test specified/i;

/** Proje kökündeki package.json'da gerçek bir "test" betiği varsa npm test ve hazırlık için npm ci (kilit dosyası yoksa npm install) */
export function kaliteOnerisi(kok: string): KaliteOnerisi {
  const yok: KaliteOnerisi = { testKomutu: null, hazirlikKomutu: null };
  try {
    const paket = JSON.parse(fs.readFileSync(path.join(kok, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
    const test = paket?.scripts?.test;
    if (typeof test !== "string" || !test.trim() || BOS_TEST.test(test)) return yok;
    const kilit = ["package-lock.json", "npm-shrinkwrap.json"].some((d) => fs.existsSync(path.join(kok, d)));
    return { testKomutu: "npm test", hazirlikKomutu: kilit ? "npm ci" : "npm install" };
  } catch {
    return yok;
  }
}
