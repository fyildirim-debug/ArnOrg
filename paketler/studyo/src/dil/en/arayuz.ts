// 0.0.8 interface: project addresses in the Browser and the web-mode frame, the open project's total tokens in the
// top bar, character suggestions that fit the name in the hire form
export const arayuz = {
  adresler: {
    baslik: "Project addresses",
    sayac: (acik: number, toplam: number) => (acik === toplam ? `${acik} up` : `${acik}/${toplam} up`),
    durum: {
      acik: "Up",
      kapali: "Not responding",
      bilinmiyor: "Not checked",
    },
    yoklanmaz: "Outside the local network, not checked",
    cikti: "from output",
    ac: (ad: string, durum: string, adres: string) => `${ad}, ${durum}: open ${adres}`,
    acBaslik: (adres: string) => `${adres} · open in the browser`,
  },
  cerceve: {
    etiket: (ad: string) => `${ad}: the project's page`,
    arac: "Frame toolbar",
    yenile: "Reload",
    yeniSekme: "Open in a new tab",
    notEkle: "Add a note",
    kapat: "Close the frame",
    ipucu: "If the page doesn't load, the server may refuse to be shown in a frame; open it in a new tab.",
  },
  toplam: {
    etiket: "Total",
    birim: "tokens",
    baslik: (toplam: string, bugun: string) => `Tokens spent by all employees on the open project: ${toplam}. Today: ${bugun}. Details in Headquarters.`,
  },
  karakter: {
    digerleri: "Other characters",
    adlaIpucu: (ad: string, karakter: string | null) =>
      `Automatic: a free character that fits the name ${ad} and the role${karakter ? ` (for now, ${karakter})` : ""}. Characters that fit the name come first.`,
  },
};
