// Multiple-choice questions (English)
import type { secenek as tr } from "../tr/secenek";

export const secenek: typeof tr = {
  grup: (soru) => `Options: ${soru}`,
  grupAdsiz: "Options",
  tekSecim: "Choose one",
  cokluSecim: "Choose any",
  secildi: (n, toplam) => `${n} of ${toplam} selected`,
  acilirYer: "Choose an option",
  notEtiketi: "Note",
  notYer: "Add a note (optional)",
  serbestYer: "Add a note or write your own answer",
  gonder: "Send",
  gonderIpucu: "Enter sends, Shift+Enter adds a line",

  yanitlandi: "Answered",
  yanitlandiZaman: (saat) => `Answered · ${saat}`,
  seciminiz: "Your choice",
  notunuz: "Note",
  yanitiniz: "Your answer",
  secilmedi: "Not chosen",
  tumu: (n) => `All options (${n})`,

  secerekYanitla: "Answer by choosing",
  secerekYanitlaIpucu: (n) => `Tick the ${n} items in the list and reply with a short note`,
  maddeSayisi: (n) => `${n} ${n === 1 ? "item" : "items"}`,
  gitti: (ad) => `Your choice went to ${ad}.`,
  gittiAdsiz: "Your choice was sent.",

  onay: {
    yanitla: "Answer",
    reddet: "Reject",
    ipucu: (ad) => `The option you pick goes to ${ad ?? "the asker"} as the answer; Reject means no, and your note becomes the reason.`,
    yanit: (no, metin, not) => `${no}) ${metin}${not ? ` — ${not}` : ""}`,
    yanitlandi: (soru) => `Your answer was sent: ${soru}`,
    reddedildi: (soru) => `Question rejected: ${soru}`,
    secilen: "Chosen",
  },
};
