// Ortak çalışma (İngilizce, 0.0.8)
import type { EskiCalismaAlani, KayitKaliteDurumu, KayitNedeni } from "@arnorg/ortak";
import type { ortakCalisma as tr } from "../tr/ortakCalisma";

/** "1 min 42 s" */
function sure(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  const dk = Math.floor(sn / 60);
  if (!dk) return `${sn} s`;
  return sn % 60 ? `${dk} min ${sn % 60} s` : `${dk} min`;
}

const sira = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export const ortakCalisma: typeof tr = {
  baslik: "Shared work",
  ozet: (dal: string, calisan: number, sirada: number) => `${dal} branch · ${calisan} working${sirada ? ` · ${sirada} queued` : ""}`,
  alinamadi: "Could not load the shared work state.",

  tempo: {
    etiket: "Team pace",
    sinirsiz: "Unlimited",
    ustSinir: (n: number) => `ceiling ${n}`,
    birim: (n: number) => (n === 1 ? "person" : "people"),
    ceoBelirledi: (ad: string, zaman: string) => `Set by ${ad} · ${zaman}`,
    ceoBelirlemedi: (ad: string) => `${ad} has not set it yet; the board's ceiling applies`,
    ceoYok: "No CEO; the board's ceiling applies",
    kurulda: "Decision authority is with the board; the board's ceiling applies",
    yuvalar: (calisan: number, tempo: number, ust: number) =>
      `${calisan} working; pace ${tempo} ${tempo === 1 ? "person" : "people"}${ust ? `, board's ceiling ${ust}` : ""}`,
    aciklamaCeo: "The CEO decides how many employees work at once and cannot go above the board's ceiling. The CEO is not counted.",
    aciklamaKurul: "At most this many employees work at once; the CEO is not counted.",
    ustSiniriDegistir: "Change the ceiling",
  },

  ekip: {
    baslik: "Who works on what",
    bos: "There is no one on the team besides the CEO.",
    kira: (n: number) => `${n} ${n === 1 ? "file" : "files"} leased`,
    kiraKisa: (n: number) => `${n} ${n === 1 ? "file" : "files"}`,
    kiraYok: "No leased files",
    kiraIpucu: "Nobody else can edit these files until the task is saved",
    dosyalar: (ad: string) => `Files leased by ${ad}`,
    sonDokunus: (zaman: string) => `last touched ${zaman}`,
  },

  kalanlar: {
    baslik: (n: number) => `${n} old ${n === 1 ? "workspace" : "workspaces"} left from the 0.0.8 move`,
    aciklama:
      "These could not be brought into the shared project automatically; their work is kept and nothing was deleted. Move what you need into the shared project by hand, or plan the work again.",
    neden: { kirli: "Unsaved changes", cakisma: "Conflict", hata: "Could not move" } as Record<EskiCalismaAlani["neden"], string>,
  },

  kayit: {
    baslik: "Latest saves",
    aciklama: "ArnOrg saves each task's files to the working branch as a separate commit; the tests run on that commit in the background.",
    yok: "No saves yet",
    yokMetin: "When a task moves to 'inceleme' (review) or an employee calls isi_kaydet, ArnOrg commits the task's files and the save shows up here.",
    dosya: (n: number) => `${n} ${n === 1 ? "file" : "files"}`,
    neden: { inceleme: "moved to review", tamam: "done", ara: "interim save", gecis: "0.0.8 move" } as Record<KayitNedeni, string>,
    fark: "Diff",
    farkBaslik: (kod: string, commit: string) => `Diff · ${kod} · ${commit}`,
    farkYok: "This save has no changes.",
    cikti: "Output",
    ciktiEtiket: (komut: string) => `Last lines of the ${komut} output`,
    yenidenDene: "Retry",
    yenidenDeneIpucu: "Runs this save's tests again",
    yenidenBildirim: (kod: string) => `The tests of the ${kod} save are running again.`,
    dahaGoster: (n: number) => `${n} more ${n === 1 ? "save" : "saves"}`,
    sirada: (n: number) => `${sira(n)} in line`,
    gecti: (ms: number | null) => `tests passed${ms ? ` · ${sure(ms)}` : ""}`,
    testsiz: "the project has no test command",
    atlandi: "the checks of later saves cover this one too",
    sahibeIletildi: (ad: string) => `The output went to ${ad}; the fix is in their task.`,
    kirmizi: (kod: string | null) => `The branch has been red since ${kod ? `the ${kod} save` : "an earlier save"}; the fix is under way there.`,
  },

  kalite: {
    kuyrukta: "Queued",
    hazirlik: "Preparing",
    test: "Tests running",
    gecti: "Passed",
    kaldi: "Failed",
    zaman_asimi: "Timed out",
    hata: "Not checked",
    testsiz: "No tests",
    atlandi: "Skipped",
  } as Record<KayitKaliteDurumu, string>,

  gorev: {
    baslik: "Saves",
    yok: "This task has not been saved yet; when it moves to 'inceleme', ArnOrg commits its files.",
  },

  ajan: {
    calistigiYer: "Works in",
    ortakProje: "Shared project",
    kiraladigi: "Leased files",
    yok: "None",
    dahaFazla: (n: number) => `and ${n} more ${n === 1 ? "file" : "files"}`,
    eskiAlan: "Old workspace",
  },

  ofis: {
    testKosuyor: (kod: string) => `${kod} save: tests running`,
    testGecmedi: (kod: string) => `${kod} save failed the tests`,
  },
  ray: {
    kaydedildi: "Task saved",
    gecmedi: "Tests failed",
  },
};
