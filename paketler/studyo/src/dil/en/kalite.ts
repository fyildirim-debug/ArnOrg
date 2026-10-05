// Kalite denetimi (İngilizce)
import type { BirlestirmeDurumu, DosyaDegisikligi } from "@arnorg/ortak";
import type { kalite as tr } from "../tr/kalite";

/** "1 min 42 s" */
function sure(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  const dk = Math.floor(sn / 60);
  if (!dk) return `${sn} s`;
  return sn % 60 ? `${dk} min ${sn % 60} s` : `${dk} min`;
}

export const kalite: typeof tr = {
  durum: {
    kuyrukta: "Queued",
    hazirlik: "Preparing",
    test: "Tests running",
    birlesti: "Merged",
    cakisma: "Conflict",
    test_basarisiz: "Tests failed",
    zaman_asimi: "Timed out",
    hata: "Could not merge",
  } as Record<BirlestirmeDurumu, string>,
  sirada: (n: number) => `${n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`} in line`,
  testsizSirada: "will merge without tests",
  denetleniyor: "trying the branch on the main branch",
  testGecti: (ms: number | null) => `tests passed${ms ? ` · ${sure(ms)}` : ""}`,
  testYok: "no test command, conflicts checked only",
  testsiz: "without tests · board decision",
  birlesmedi: "not merged",
  sure,
  deneme: (n: number) => `attempt ${n}`,

  cikti: "Test output",
  ciktiEtiket: (komut: string) => `Last lines of the ${komut} output`,
  ciktiYok: "No output yet.",
  farkAc: "Open diff",

  etkiEski:
    "A merge request left over from 0.0.7. ArnOrg 0.0.8 has no merges: the team works in the shared project, and ArnOrg commits a task's files when it moves to 'inceleme' (review). Your decision is only recorded.",

  fark: {
    baslik: (dal: string, hedef: string) => `Diff · ${dal} → ${hedef}`,
    alinamadi: "Could not load the diff",
    yok: "No changes",
    yokMetin: "The branch matches the target; there is nothing to merge.",
    dosya: (n: number) => `${n} ${n === 1 ? "file" : "files"}`,
    kisaltildi: (n: number) => `The diff is long; showing the first ${n} lines.`,
    degisiklik: { A: "added", D: "deleted", M: "modified", "?": "modified" } as Record<DosyaDegisikligi, string>,
    dosyalar: "Changed files",
  },

  ayar: {
    baslik: "Quality checks",
    test: "Test command",
    testYer: "npm test",
    hazirlik: "Preparation command",
    hazirlikYer: "npm ci",
    sure: "Time limit",
    dk: "min",
    ipucu:
      "After every task save, ArnOrg tries that commit in a separate, clean copy in the background: preparation first, then the tests. The team doesn't wait; a task that fails goes back to its owner with the output. With no test command, saves stay untested.",
    sureIpucu: "If preparation and tests don't finish in time, the process is stopped. Ignored files such as node_modules are kept between runs.",
    oneri: "package.json has a test script:",
    oneriHazirlik: (komut: string) => `preparation ${komut}`,
    oneriKullan: "Fill in",
    sureGecersiz: "Enter a whole number from 1 to 240 minutes.",
    tekSatir: "The command must be a single line.",
    kaydedildi: (komut: string | null) =>
      komut ? `Quality checks saved: ${komut} will run after every task save.` : "Quality checks saved: no test command, saves will stay untested.",
  },
};
