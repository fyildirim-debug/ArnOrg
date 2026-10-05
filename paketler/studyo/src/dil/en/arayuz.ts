// 0.0.8 interface: project addresses in the Browser (Links since 0.0.9) and the web-mode frame, the open project's
// total tokens in the top bar, character suggestions that fit the name in the hire form
export const arayuz = {
  adresler: {
    baslik: "Links",
    sayac: (toplam: number) => (toplam === 1 ? "1 link" : `${toplam} links`),
    durum: {
      acik: "Up",
      kapali: "Not responding",
      bilinmiyor: "Not checked",
    },
    yoklanmaz: "Outside the local network, not checked",
    cikti: "from output",
    kurul: "Board",
    ac: (ad: string, durum: string, adres: string) => `${ad}, ${durum}: open ${adres}`,
    acBaslik: (adres: string) => `${adres} · open in the browser`,
    bos: "No links yet. The CEO adds the project's links here (dev server, API, preview, staging or live site) and employees register the servers they start. Click one to open it here.",
    iste: "Ask the CEO",
    isteBaslik: "Tell the CEO to add the project's links and keep them current (#ceo)",
    istendi: "Sent to the CEO; links show up here as they are added.",
    ekle: "Add a link",
    sil: (ad: string) => `Remove the ${ad} link`,
    silOnay: (ad: string) => `Remove ${ad} from the Links?`,
    kaldir: "Remove",
    form: {
      ad: "Name",
      adIpucu: "Staging",
      adres: "Address",
      adresIpucu: "localhost:5173 or https://…",
      ekle: "Add",
      adresHata: "Enter a valid address, e.g. localhost:5173 or https://example.com.",
    },
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
