// Menü, üst çubuk, canlı ray, bildirimler ve uygulama kabuğu (İngilizce)
import type { gezinti as tr } from "../tr/gezinti";

export const gezinti: typeof tr = {
  menuEtiketi: "Studio menu",
  menu: {
    karargah: "Headquarters",
    ofis: "Office",
    ekip: "Team",
    pano: "Board",
    kanallar: "Channels",
    notlar: "Notes",
    hafiza: "Memory",
    kod: "Code",
    "kod-zekasi": "Code intel",
    denetim: "Audit",
    onaylar: "Approvals",
    projeler: "Projects",
    ayarlar: "Settings",
  },
  onceProjeAc: "Open a project first",
  rozetArac: (n: number) => `${n} tool ${n === 1 ? "call awaits" : "calls await"} your decision`,
  rozetOnay: (n: number) => `${n} ${n === 1 ? "approval" : "approvals"} pending`,
  rozetSoru: (n: number) => `${n} ${n === 1 ? "question awaits" : "questions await"} an answer`,
  rozetOkunmamis: (n: number) => `${n} unread ${n === 1 ? "message" : "messages"}`,
};
