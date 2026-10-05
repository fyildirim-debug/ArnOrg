// Decision authority (English)
import type { karar as tr } from "../tr/karar";

/** "CEO Ada" or just "the CEO" */
const ceoAdi = (ad: string | null) => (ad ? `CEO ${ad}` : "the CEO");
const buyuk = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const karar: typeof tr = {
  ayar: {
    baslik: "Decision authority",
    ceo: "The CEO decides · fully autonomous",
    ceoAciklama: "Permissions, hires and the team pace go through the CEO; you see the results.",
    kurul: "The board decides",
    kurulAciklama: "Approvals come to you; the types you pick for auto-approval are granted automatically.",
    ipucu: "The CEO only asks you for what only a person can do: credentials, payments, external accounts, irreversible actions. You can still decide any pending approval yourself.",
    otoNotu: "Auto-approval is not used in this mode; it applies again when the board decides.",
    ceoYok: "This project has no CEO; approvals still come to you.",
  },
  ceoyaGecti: (ceo) => `Decision authority is now with ${ceoAdi(ceo)}: the company runs fully autonomously.`,
  kurulaGecti: "Decision authority is yours: approvals will come to you.",

  serit: {
    etiket: "Decision authority",
    otonom: "Fully autonomous",
    otonomBaslik: (ceo) => `${buyuk(ceoAdi(ceo))} makes the decisions`,
    otonomMetin: "Permissions, hires, deliveries and the team pace go through the CEO; every decision is listed below with its reason. You can still decide any pending approval yourself.",
    kurul: "Board",
    kurulBaslik: "You make the decisions",
    kurulMetin: "Approvals come to you. Leave them to the CEO and the company runs fully autonomously; you see the results.",
    kurulaAl: "I'll decide",
    ceoyaBirak: "Leave it to the CEO",
  },
  altBaslik: "The company's decisions and their reasons",
  bekleyenYokMetin: "Employees' requests go to the CEO; they show up here while the CEO decides.",
  gecmisYokMetin: "The CEO's decisions and yours collect here with their reasons.",

  veren: {
    etiket: "Decided by",
    ceo: (ad) => (ad ? `CEO · ${ad}` : "CEO"),
    kurul: "Board",
    otomatik: "Auto",
    zamanAsimi: "Timed out",
  },
  gerekce: (metin) => `Reason: ${metin}`,

  bekliyor: (ceo) => `${buyuk(ceoAdi(ceo))} is deciding`,
  bekliyorIpucu: "Decide yourself if needed; your decision replaces the CEO's.",
  ceoKararVeriyor: (n) => `The CEO is deciding ${n === 1 ? "1 approval" : `${n} approvals`}`,

  teslimSonucu: (ceo) => `Accepted by ${ceoAdi(ceo)}; passed to you as a result.`,
  geriBildirimYaz: "Write feedback",
};
