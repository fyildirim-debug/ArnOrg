// 0.0.8 liveliness (English): the office person card and the texts of behaviours tied to real events, screen
// shortcuts, the board filter and the saved mark
import type { canli as tr } from "../tr/canli";

const iyelik = (ad: string) => `${ad}'s`;

export const canli: typeof tr = {
  kart: {
    etiket: (ad: string) => `${ad}: quick actions`,
    kapat: "Close the card (Esc)",
    takipEt: "Follow",
    takibiBirak: "Stop following",
    mesaj: "Message",
    gorevAc: (kod: string, baslik: string) => `${kod} ${baslik}: open on the board`,
    gorevYok: "No task at the moment",
    ayrintilar: "Details",
    ayrintiIpucu: "Session, settings and intelligence",
  },

  ofis: {
    etkinlik: {
      masasindaBekliyor: "At the desk, waiting for work",
      molada: "On a short break",
      ceoKarariniBekliyor: (ceo: string) => `Waiting for ${iyelik(ceo)} decision`,
      yanitBekliyor: (ad: string) => `Waiting for ${iyelik(ad)} answer`,
    },
    balon: {
      onayladim: "Approved.",
      reddettim: "Declined.",
    },
    akis: {
      ceoKarariniBekliyor: (ad: string, ceo: string) => `${ad} is waiting for ${iyelik(ceo)} decision`,
      kaydedildi: (kod: string, ad: string | null, ozet: string) => `${kod} saved${ad ? ` · ${ad}` : ""}${ozet ? `: ${ozet}` : ""}`,
    },
    kararIsareti: (ad: string, ceo: string) => `${ad} is waiting for ${iyelik(ceo)} decision: open the approval`,
    kararIsaretiIpucu: (ceo: string) => `Waiting for ${iyelik(ceo)} decision: open the approval`,
  },

  kisayol: {
    ac: "Shortcuts (?)",
    ofisBaslik: "Office shortcuts",
    panoBaslik: "Board shortcuts",
    oklar: "Arrows",
    ofis: {
      yakinlastir: "Zoom in, zoom out",
      sigdir: "Fit the office",
      kaydir: "Move the camera",
      yayin: "Turn the live view on or off",
      kapat: "Close the card, stop following",
      pencere: "Open or close this window",
    },
    yayinTusu: "l",
    pano: {
      ara: "Search the tasks",
      yeni: "New task",
      kapat: "Close the open drawer",
      pencere: "Open or close this window",
    },
    yeniTusu: "n",
  },

  pano: {
    kisiYaDaRol: "Filter by person or role",
    kisiler: "People",
    roller: "Roles",
    temizle: "Clear the filter",
    sonuc: (n: number, toplam: number) => `${n} of ${toplam} ${toplam === 1 ? "task" : "tasks"}`,
    kaydedildi: "Saved",
    kaydedildiIpucu: (kod: string, ozet: string | null) => `${kod} was just saved${ozet ? `: ${ozet}` : ""}`,
    yukleniyor: "Loading tasks",
  },
};
