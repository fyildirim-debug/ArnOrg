// Proje başına git sırası (0.0.8): ortak projede ArnOrg'un git işlemleri (görev kaydı, .arnorg commit'i, uzak depoya
// gönderim, kalite alanının hazırlanması, geçiş, kurulun Kod ekranındaki commit'i) sırayla yapılır; aynı anda tek
// işlem olduğundan index.lock yarışı çıkmaz. Çalışanların index'e yazan git komutları kapıda reddedilir (kabuk.ts);
// başka bir süreç kilidi tutuyorsa kısa beklemeyle birkaç kez yeniden denenir.
import fs from "node:fs";
import path from "node:path";
import * as gitIslemleri from "../git.js";
import { bekle } from "../yardimci.js";

/** Bundan eski index.lock çökmüş bir git sürecinden kalmıştır (git kilidi saniyelerce tutar) */
export const ESKI_KILIT_MS = 10 * 60_000;

export class GitSirasi {
  /** Proje → son işin sözü (zincirin ucu) */
  private readonly uclar = new Map<string, Promise<unknown>>();
  /** Proje → sıradaki ve süren iş sayısı */
  private readonly sayilar = new Map<string, number>();

  /** İşi projenin sırasına ekler; önceki işler (başarısız olsalar da) bitince başlar */
  calistir<T>(projeId: string, is: () => Promise<T>): Promise<T> {
    const onceki = this.uclar.get(projeId) ?? Promise.resolve();
    const bu = onceki.then(is, is);
    const uc = bu.then(
      () => undefined,
      () => undefined,
    );
    this.uclar.set(projeId, uc);
    this.sayilar.set(projeId, (this.sayilar.get(projeId) ?? 0) + 1);
    void uc.then(() => {
      const n = (this.sayilar.get(projeId) ?? 1) - 1;
      if (n > 0) this.sayilar.set(projeId, n);
      else {
        this.sayilar.delete(projeId);
        if (this.uclar.get(projeId) === uc) this.uclar.delete(projeId);
      }
    });
    return bu;
  }

  /** Projenin sıradaki ve süren işi */
  bekleyen(projeId: string): number {
    return this.sayilar.get(projeId) ?? 0;
  }

  /** Sıradaki işler bitince çözülür */
  async bosalinca(projeId: string): Promise<void> {
    for (let uc = this.uclar.get(projeId); uc; uc = this.uclar.get(projeId)) {
      await uc;
      if (this.uclar.get(projeId) === uc) return;
    }
  }
}

/** Git kilit hatası mı (index.lock ya da ref kilidi başka süreçte) */
export function kilitHatasi(h: unknown): boolean {
  const m = h instanceof Error ? h.message : String(h);
  return /index\.lock|\.lock'?:? File exists|Unable to create '[^']*\.lock'|cannot lock ref|unable to write new index file/i.test(m);
}

/**
 * Çökmüş bir git sürecinden kalan index.lock'u kaldırır: ESKI_KILIT_MS'ten eskiyse. Kaldırdıysa kilidin yaşı (ms),
 * kilit yoksa ya da tazeyse null. Taze kilide dokunulmaz (başka bir git süreci çalışıyor olabilir).
 */
export async function eskiKilidiKaldir(repo: string, simdiMs = Date.now()): Promise<number | null> {
  const yol = (await gitIslemleri.git(repo, ["rev-parse", "--git-path", "index.lock"]).catch(() => "")).trim();
  if (!yol) return null;
  const tam = path.isAbsolute(yol) ? yol : path.join(repo, yol);
  try {
    const yas = simdiMs - fs.statSync(tam).mtimeMs;
    if (yas < ESKI_KILIT_MS) return null;
    fs.rmSync(tam, { force: true });
    return yas;
  } catch {
    return null;
  }
}

/** Kilit hatasında artan beklemeyle yeniden dener (toplam ~7 sn); başka hatayı hemen fırlatır */
export async function kilitliyseYinele<T>(f: () => Promise<T>, deneme = 10, bekleMs = 150): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await f();
    } catch (h) {
      if (i >= deneme || !kilitHatasi(h)) throw h;
      await bekle(bekleMs * i);
    }
  }
}
