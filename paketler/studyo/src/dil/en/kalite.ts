// Kalite kapısı (İngilizce)
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
  sahibeIletildi: (ad: string) => `${ad} was told, with the output; they will fix it and ask again.`,
  deneme: (n: number) => `attempt ${n}`,

  cikti: "Test output",
  ciktiEtiket: (komut: string) => `Last lines of the ${komut} output`,
  ciktiYok: "No output yet.",
  farkAc: "Open diff",
  yenidenDene: "Try again",
  yenidenDeneIpucu: "Runs it through the quality gate from the start",
  yineDeBirlestir: "Merge anyway",
  testsizUyari: (hedef: string) => `It goes into ${hedef} without passing the tests and is recorded as a merge without tests. The quality gate is skipped for this work.`,
  testsizBirlestir: "Merge without tests",
  testsizBildirim: (dal: string) => `${dal} is queued to merge without tests.`,
  yenidenBildirim: (dal: string) => `${dal} is going through the quality gate again.`,

  etkiTestli: (dal: string, hedef: string, komut: string) =>
    `It joins the queue; ${dal} is merged with ${hedef} in a clean copy and ${komut} runs. If it passes, it is merged into ${hedef} and tasks in review move to Done; if not, nothing is merged and the branch owner is told.`,
  etkiTestsiz: (dal: string, hedef: string) =>
    `It joins the queue; if there are no conflicts, ${dal} is merged into ${hedef} and tasks in review move to Done. The project has no test command; add one in the settings on Projects.`,

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
    baslik: "Quality gate",
    test: "Test command",
    testYer: "npm test",
    hazirlik: "Preparation command",
    hazirlikYer: "npm ci",
    sure: "Time limit",
    dk: "min",
    ipucu:
      "Every approved merge is first tried in a clean copy merged with the main branch: preparation, then the tests. Work that fails is not merged. With no test command, only conflicts are checked.",
    sureIpucu: "If preparation and tests don't finish in time, the process is stopped. Ignored files such as node_modules are kept between runs.",
    oneri: "package.json has a test script:",
    oneriHazirlik: (komut: string) => `preparation ${komut}`,
    oneriKullan: "Fill in",
    sureGecersiz: "Enter a whole number from 1 to 240 minutes.",
    tekSatir: "The command must be a single line.",
    kaydedildi: (komut: string | null) => (komut ? `Quality gate saved: ${komut} will run before merges.` : "Quality gate saved: no test command, only conflicts will be checked."),
  },
};
