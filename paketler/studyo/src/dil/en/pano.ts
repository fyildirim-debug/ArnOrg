// Görev panosu (İngilizce)
import type { pano as tr } from "../tr/pano";

export const pano: typeof tr = {
  baslik: "Board",
  altBaslik: "Goal → epic → task · a task can't start until its dependencies are done",
  yeniGorev: "New task",
  araEtiket: "Search tasks",
  araYer: "Search: code, title, label",
  atananaGore: "Filter by assignee",
  herkes: "Everyone",
  atanmamis: "Unassigned",
  iptalleriGoster: "Show cancelled",
  alinamadi: "Couldn't load tasks.",
  bosBaslik: "The board is empty",
  ilkGorev: "Create the first task",
  bosMetin: "Cards show up here once the CEO breaks the brief into tasks. You can also create tasks yourself.",
  eslesenYok: "No matches",
  kolonBos: "Empty",
  atanmadi: "Unassigned",

  kart: {
    ayrintiAc: (kod: string, baslik: string) => `Open ${kod} ${baslik}`,
    bagliIpucu: "This task can't move to In progress until its dependencies are done",
    bagli: (kodlar: string) => `Depends on: ${kodlar}`,
    tasi: (kod: string, durum: string) => `Move ${kod} to ${durum}`,
  },

  cekmece: {
    kaydedildi: (kod: string) => `${kod} saved.`,
    geriAl: "Revert changes",
    guncellendi: (zaman: string) => `Updated ${zaman}`,
    durum: "Status",
    bagimliliklarBitmedi: (kodlar: string) => `Dependencies not done: ${kodlar}`,
    bagliUyari: (liste: string) => `Depends on: ${liste}. It can't move to In progress until these are done.`,
    islemYapilamadi: "Couldn't do that",
    olusturan: "Created by",
    olusturma: "Created",
    bunuBekleyen: "Waiting on this",
  },

  alanlar: {
    baslik: "Title",
    baslikGerekli: "Title is required.",
    atanan: "Assignee",
    etiket: "Label",
    etiketOrnek: "backend",
    aciklama: "Description",
    kabulOlcutu: "Acceptance criteria",
    kabulOrnek: "When is the work done? Make it measurable.",
    bagimliliklar: "Dependencies",
    bilinmeyenGorev: "Unknown task",
    bagimlilikKaldir: (kod: string) => `Remove dependency ${kod}`,
    bagimlilikYok: "No dependencies. A task with unfinished dependencies can't move to In progress.",
    bagimlilikEkle: "Add dependency",
    bagimlilikEkleSecenek: "Add dependency…",
  },

  yeni: {
    olusturuldu: (kod: string) => `${kod} created.`,
    olustur: "Create task",
    baslangicDurumu: "Starting status",
    olusturulamadi: "Couldn't create the task",
  },
};
