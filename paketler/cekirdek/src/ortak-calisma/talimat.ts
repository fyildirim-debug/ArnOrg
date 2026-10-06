// Ortak çalışmanın talimat ve mesaj metinleri (0.0.8): talimatın proje satırı ve ortak kuralları, CEO'nun ortak çalışma
// ve ekip temposu bölümü, görev mesajının sonu, incelemeye çağrı, kira ve git retleri. talimat.ts ve sirket.ts bu
// işlevleri tek satırla çağırır.
import type { DosyaKirasi, EkipTemposu, Gorev, GorevKaydi, Proje } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { kisalt, yonelme } from "../yardimci.js";
import type { GitKarari } from "./kabuk.js";

type Dil = "tr" | "en";

/** Talimatın proje satırı: ortak proje, çalışma dalı, çalışma dizini */
export function ortakProjeSatiri(proje: Pick<Proje, "yol" | "varsayilanDal">, cwd: string, dil: Dil): string {
  return dil === "en"
    ? `Shared project: ${proje.yol} (working branch ${proje.varsayilanDal}). The whole team works in this one working copy at the same time; there are no personal branches, worktrees or merges. Your working directory: ${cwd}.`
    : `Ortak proje: ${proje.yol} (çalışma dalı ${proje.varsayilanDal}). Bütün ekip bu tek çalışma kopyasında aynı anda çalışır; kişisel dal, worktree ya da birleştirme yok. Çalışma dizinin: ${cwd}.`;
}

/**
 * Ortak kuralların dosya, git, gönderim ve kalite satırları. gonderimOnayi: "need the board's approval" gibi kipe
 * göre tamamlanan ifade. CEO kod yazmadığından kira ve git satırları ona verilmez.
 */
export function ortakKurallar(b: { proje: Pick<Proje, "varsayilanDal" | "testKomutu" | "hazirlikKomutu">; ceo: boolean; gonderimOnayi: string }, dil: Dil): string[] {
  const dal = b.proje.varsayilanDal;
  const test = b.proje.testKomutu;
  const hazirlik = b.proje.hazirlikKomutu;
  if (dil === "en") {
    return [
      ...(b.ceo
        ? []
        : [
            "- Work only on your own task's files. A file you edit is leased to you until your task is saved, and nobody else can edit it meanwhile; if a file is leased to someone else, the denial says who holds it and for which task: work on something else, wait, or ask them with ajana_sor. Never work around a lease (for example by writing the file from a shell command), and don't reformat or regenerate files outside your task.",
            `- Git is read-only for you: status, diff, log, show and blame are fine; don't run add, commit, stash, reset, checkout, switch, clean, merge, rebase or pull. ArnOrg commits exactly your task's files to ${dal} as "<task code> <title>" when you move the task to 'inceleme' (review) or call isi_kaydet. Never add Co-Authored-By or any other Claude signature anywhere.`,
          ]),
      `- Write only inside the project folder and the temp directory. Pushing to a remote, releasing and deploying ${b.gonderimOnayi}; ArnOrg pushes ${dal} to the remote itself.`,
      ...(test
        ? [
            `- Quality: after every save ArnOrg runs \`${test}\`${hazirlik ? ` (after \`${hazirlik}\`)` : ""} on that commit in a separate copy, in the background; if it fails, the task goes back to its owner with the output.${b.ceo ? "" : " Run the same command for your part before you move the task to 'inceleme'."}`,
          ]
        : []),
    ];
  }
  return [
    ...(b.ceo
      ? []
      : [
          "- Yalnız kendi görevinin dosyalarında çalış. Düzenlediğin dosya görevin kaydedilene dek sana kiralanır ve bu sürede başkası düzenleyemez; dosya başkasının kirasındaysa ret mesajı kimde ve hangi görevde olduğunu söyler: başka bir işine geç, bekle ya da ajana_sor ile ona sor. Kirayı aşmaya çalışma (ör. dosyayı kabuk komutuyla yazarak); görevinin dışındaki dosyaları toptan biçimlendirme ya da yeniden üretme.",
          `- Git'te yalnız okursun: status, diff, log, show ve blame serbest; add, commit, stash, reset, checkout, switch, clean, merge, rebase ve pull kullanma. ArnOrg görevin dosyalarını, görevi 'inceleme' durumuna aldığında ya da isi_kaydet çağırdığında ${dal} dalına "<görev kodu> <başlık>" mesajıyla kendisi commit'ler. Hiçbir yere Co-Authored-By ya da başka bir Claude imzası ekleme.`,
        ]),
    `- Yalnız proje klasörüne ve geçici dizine yaz. Uzak depoya push, yayın ve dağıtım ${b.gonderimOnayi}; ${dal} dalını uzak depoya ArnOrg kendisi gönderir.`,
    ...(test
      ? [
          `- Kalite: ArnOrg her kayıttan sonra \`${test}\`${hazirlik ? ` (önce \`${hazirlik}\`)` : ""} komutunu ayrı bir kopyada, o commit'te, arka planda koşar; geçmezse görev çıktıyla sahibine döner.${b.ceo ? "" : " Görevi 'inceleme'ye almadan önce aynı komutu kendi payın için koş."}`,
        ]
      : []),
  ];
}

/** CEO talimatının ortak çalışma ve ekip temposu bölümü */
export function ortakCeoTalimati(b: { proje: Pick<Proje, "varsayilanDal">; tempo: EkipTemposu; butce?: string }, dil: Dil): string[] {
  const t = b.tempo;
  const dal = b.proje.varsayilanDal;
  const sinir = t.ustSinir > 0 ? String(t.ustSinir) : dil === "en" ? "none" : "yok";
  if (dil === "en") {
    return [
      "## Shared work and team pace",
      `- The team works at the same time in one shared project on ${dal}; there are no personal branches or merge approvals. When a task moves to 'inceleme', ArnOrg commits its owner's files and runs the tests in the background.`,
      "- Split the work into small, independent tasks that touch different files or areas, each one finishable in a single session. Name the files or the area in every task description (for example \"src/api/menu.ts and its test\"); never give two open tasks the same file.",
      "- Start tasks in parallel so nobody sits idle: give atanan with baslat=true, or move assigned tasks to 'calisiliyor'. Put the role id in etiket (backend, frontend, test…): ArnOrg starts an idle employee's planned task, or an unassigned task that fits their role, by itself and tells you briefly.",
      t.belirleyen === "ceo"
        ? `- You decide how many employees work at once with ekip_temposu (the board's ceiling: ${sinir}; now ${t.gecerli || sinir}, ${t.calisan} working). Raise it when there is plenty of independent work; lower it when tasks crowd onto the same files or the subscription window runs low.`
        : `- At most ${t.gecerli || "an unlimited number of"} employees work at once (the board's setting).`,
      "- Review: when a task reaches 'inceleme', read its save with calisma_farki (gorev: T-12); if it is right, move it to 'tamam'; if not, move it back to 'calisiliyor' and tell the owner what to fix. calisma_durumu shows who works on what and which files are leased.",
      ...(b.butce
        ? [
            `- Budget and usage level (${b.butce}): the board gives the project a token budget and a usage level (Smart, Normal, Economy); the level sets the employees' models and thinking depth, and only the board changes it. You hear when 80% of the budget is used; if the budget runs out, the team stops. Keep tasks small and clear, avoid needless meetings and long threads, and leave the model empty when you hire.`,
          ]
        : []),
    ];
  }
  return [
    "## Ortak çalışma ve ekip temposu",
    `- Ekip tek bir ortak projede, ${dal} dalında aynı anda çalışır; kişisel dal ve birleştirme onayı yok. Görev 'inceleme'ye geçince ArnOrg sahibinin dosyalarını commit'ler ve testleri arka planda koşar.`,
    "- İşi, farklı dosya ya da alanlara dokunan, birbirinden bağımsız ve her biri tek oturumda bitecek küçük görevlere böl. Her görevin açıklamasına dokunacağı dosyaları ya da alanı yaz (ör. \"src/api/menu.ts ve testi\"); açık iki göreve aynı dosyayı verme.",
    "- Görevleri paralel başlat, kimse boşta beklemesin: atanan ve baslat=true ver ya da atanmış görevi 'calisiliyor'a al. Etiket alanına rol kimliğini yaz (backend, frontend, test…): ArnOrg boşa çıkan çalışana planlı işini ya da rolüne uyan atanmamış işi kendiliğinden başlatır ve sana kısaca haber verir.",
    t.belirleyen === "ceo"
      ? `- Aynı anda kaç çalışanın çalışacağına ekip_temposu ile sen karar verirsin (kurulun üst sınırı: ${sinir}; şu an ${t.gecerli || sinir}, çalışan ${t.calisan}). Bağımsız iş çoksa yükselt; işler aynı dosyalarda toplanıyorsa ya da abonelik penceresi azalıyorsa düşür.`
      : `- Aynı anda en çok ${t.gecerli || "sınırsız sayıda"} çalışan çalışır (kurulun ayarı).`,
    "- İnceleme: görev 'inceleme'ye gelince kaydını calisma_farki ile oku (gorev: T-12); uygunsa 'tamam' yap, değilse 'calisiliyor'a geri al ve sahibine neyi düzelteceğini yaz. Kimin ne üzerinde çalıştığını ve kiralı dosyaları calisma_durumu gösterir.",
    ...(b.butce
      ? [
          `- Bütçe ve kullanım seviyesi (${b.butce}): kurul projeye token bütçesi ve kullanım seviyesi (Zeki, Normal, Tasarruflu) verir; seviye çalışanların modelini ve düşünme derinliğini belirler, onu yalnız kurul değiştirir. Bütçenin %80'i harcanınca sana haber gelir; bütçe dolarsa ekip durur. Görevleri küçük ve net tut, gereksiz toplantı ve uzun yazışmalardan kaçın; işe alırken modeli boş bırak.`,
        ]
      : []),
  ];
}

/** Görev mesajının son satırı */
export function gorevSonu(): string {
  return iki(
    "\nİşe başlamadan ilgili notları oku. Yalnız bu görevin dosyalarına dokun. İş bitince testleri çalıştır, gorev_guncelle ile görevi 'inceleme' durumuna al ve ne yaptığını kısaca yaz; ArnOrg dosyalarını çalışma dalına commit'ler.",
    "\nRead the relevant notes before you start. Touch only this task's files. When the work is done, run the tests, move the task to 'inceleme' (review) with gorev_guncelle and briefly write what you did; ArnOrg commits its files to the working branch.",
  );
}

/** Kaydın kısa künyesi: "a1b2c3d · 3 dosya (src/a.ts, src/b.ts …)" */
export function kayitKunyesi(k: Pick<GorevKaydi, "commit" | "dosyalar">): string {
  const ilk = k.dosyalar.slice(0, 4).join(", ") + (k.dosyalar.length > 4 ? " …" : "");
  return iki(`${k.commit.slice(0, 7)} · ${k.dosyalar.length} dosya (${ilk})`, `${k.commit.slice(0, 7)} · ${k.dosyalar.length} file${k.dosyalar.length === 1 ? "" : "s"} (${ilk})`);
}

/** İnceleyiciye (ya da CEO'ya) giden çağrı: görevin kaydı ve ne yapacağı */
export function incelemeCagrisi(b: { g: Gorev; sahip: string | null; kayit: GorevKaydi | null; kayitHatasi?: string | null; testli: boolean; inceleyici: boolean }): string {
  const { g, kayit } = b;
  const kim = b.sahip ?? iki("atanmamış", "unassigned");
  const kayitMetni = kayit
    ? iki(`Kaydı: ${kayitKunyesi(kayit)}${b.testli ? "; testler arka planda koşuyor" : ""}.`, `Saved: ${kayitKunyesi(kayit)}${b.testli ? "; the tests are running in the background" : ""}.`)
    : b.kayitHatasi
      ? iki(
          `Kaydedilemedi (${kisalt(b.kayitHatasi, 160)}); dosyalar ${kim} adına kiralı kaldı, sonraki kayıtta yeniden denenecek. Değişikliği calisma_farki kaydedilmemiş hâliyle de gösterir.`,
          `It could not be saved (${kisalt(b.kayitHatasi, 160)}); the files stay leased to ${kim} and the next save tries again. calisma_farki also shows the unsaved changes.`,
        )
      : iki("Bu görev için kaydedilecek yeni değişiklik bulunmadı.", "No new changes were found to save for this task.");
  const ek = b.inceleyici ? "" : iki(" Sık inceleme gerekiyorsa bir kod inceleyici almayı değerlendir.", " If reviews come up often, consider hiring a code reviewer.");
  return iki(
    `${g.kod} "${g.baslik}" incelemeye hazır (${kim}). ${kayitMetni} calisma_farki ile (gorev: ${g.kod}) değişikliği oku; uygunsa görevi 'tamam' durumuna al, değilse 'calisiliyor' durumuna geri al ve sahibine neyi düzelteceğini yaz.${ek}`,
    `${g.kod} "${g.baslik}" is ready for review (${kim}). ${kayitMetni} Read the change with calisma_farki (gorev: ${g.kod}); if it is right, move the task to 'tamam' (done); if not, move it back to 'calisiliyor' and tell the owner what to fix.${ek}`,
  );
}

/** Başkasının kiraladığı dosyaya yazma reddi */
export function kiraReddi(k: DosyaKirasi, yol: string, gorevBasligi: string | null, simdiMs = Date.now()): string {
  const dk = Math.max(1, Math.round((simdiMs - Date.parse(k.baslangic)) / 60_000));
  const gorev = k.gorevKodu ? `${k.gorevKodu}${gorevBasligi ? ` "${kisalt(gorevBasligi, 60)}"` : ""}` : null;
  return iki(
    `${yol} şu an ${k.ajanAd} tarafından ${gorev ? `${gorev} görevi için` : "kendi işi için"} düzenleniyor (${dk} dk önce kiraladı). Ortak projede aynı dosyayı iki kişi aynı anda düzenlemez: başka bir işine geç, bekle (kira ${k.ajanAd} görevini kaydedince biter) ya da ajana_sor ile ${yonelme(k.ajanAd)} sor.`,
    `${yol} is being edited by ${k.ajanAd} ${gorev ? `for ${gorev}` : "for their own work"} (leased ${dk} min ago). In the shared project two people never edit the same file at once: work on something else, wait (the lease ends when ${k.ajanAd}'s task is saved), or ask ${k.ajanAd} with ajana_sor.`,
  );
}

/** Ortak projede reddedilen git komutu */
export function gitReddi(k: Extract<GitKarari, { tur: "ret" }>, dal: string): string {
  const kayit = iki(
    " ArnOrg görevinin dosyalarını, görevi 'inceleme' durumuna aldığında ya da isi_kaydet çağırdığında çalışma dalına kendisi commit'ler.",
    " ArnOrg commits your task's files to the working branch itself when you move the task to 'inceleme' or call isi_kaydet.",
  );
  switch (k.neden) {
    case "index": {
      const tasima = /^git (rm|mv)$/.test(k.komut) ? iki(" Dosya silmek ya da taşımak için düz rm ya da mv kullan.", " Use plain rm or mv to delete or move a file.") : "";
      return iki(`Ortak projede ${k.komut} kullanılmaz: aşamaya alma ve commit ArnOrg'un işidir.${tasima}`, `${k.komut} is not used in the shared project: staging and committing are ArnOrg's job.${tasima}`) + kayit;
    }
    case "geri_alma":
      return (
        iki(
          `${k.komut} çalışma kopyasındaki değişiklikleri siler ya da saklar; ortak projede başkalarının yarım işi de gider. Yalnız kendi dosyanı geri almak için git restore -- <dosya> kullan.`,
          `${k.komut} discards or stashes changes in the working copy; in the shared project it would wipe other people's unfinished work too. To undo only your own file, use git restore -- <file>.`,
        ) + kayit
      );
    case "dal":
      return (
        iki(
          `Ortak projede dal ve geçmiş komutları (${k.komut}) kullanılmaz: herkes ${dal} dalında çalışır; uzak depoyla eşitleme ArnOrg'un işidir.`,
          `Branch and history commands (${k.komut}) are not used in the shared project: everyone works on ${dal}; syncing with the remote is ArnOrg's job.`,
        ) + kayit
      );
    default:
      return iki(`Ortak projede yalnız okuyan git komutları serbest (status, diff, log, show, blame); ${k.komut} reddedildi.`, `Only read-only git commands are allowed in the shared project (status, diff, log, show, blame); ${k.komut} was denied.`) + kayit;
  }
}

/** .git klasörüne dokunan komut ya da yazma */
export function gitIciReddi(): string {
  return iki(".git klasörüne dokunma: git'in iç dosyalarını (kilitler dahil) ArnOrg yönetir.", "Don't touch the .git folder: ArnOrg manages git's internal files (locks included).");
}
