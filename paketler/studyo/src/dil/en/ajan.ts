// Ajan oturumu ve transkript (İngilizce)
import type { ajan as tr } from "../tr/ajan";

const cogul = (n: number, tekil: string, cok: string) => `${n} ${n === 1 ? tekil : cok}`;

export const ajan: typeof tr = {
  bulunamadi: "Agent not found",
  bulunamadiMetin: "This agent may have been let go, or it belongs to another project.",
  ekibeDon: "Back to team",
  tokenIpucu: "Tokens processed today and in total",
  tokenBugun: "tokens today",
  tokenToplam: "total",
  dokum: (ad: string) => `${ad} session transcript`,
  yukleniyor: "Loading session",
  akisAlinamadi: "Couldn't load the session stream.",
  bosBaslik: "Nothing in this session yet",
  bosKapali: "The session is off. Start it or write a message below; a message starts the session.",
  bosAcik: "As the agent works, its messages, thinking and tool calls stream in here.",
  dahaEski: (n: number) => `Show ${cogul(n, "older item", "older items")}`,
  gizli: (n: number) => `${cogul(n, "item", "items")} hidden`,
  enYeni: (n: number) => `Jump to latest · ${n} new`,

  transkript: {
    hataCiktiYok: "Error (no output)",
    ciktiYok: "No output",
    hataCiktisi: "Error output",
    cikti: "Output",
    satir: (n: number) => cogul(n, "line", "lines"),
    duzenleme: (n: number) => cogul(n, "edit", "edits"),
    sonucBekleniyor: "Waiting for the result",
    gelenMesaj: "Incoming message",
    dusunce: "Thinking",
    sonuc: "result",
    turHatayla: "Turn ended with an error",
    turBitti: "Turn ended",
    token: (miktar: string) => (miktar === "1" ? "1 token" : `${miktar} tokens`),
  },

  dosyaAgaci: {
    dosyalar: "Files",
    degisiklikVar: "Contains changes",
    degisiklik: {
      M: "Modified",
      A: "Added",
      D: "Deleted",
      "?": "Untracked",
    },
  },
};
