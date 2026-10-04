// Durum depolarındaki bildirim ve hata metinleri (İngilizce)
import type { bildirim as tr } from "../tr/bildirim";

export const bildirim: typeof tr = {
  kararBekliyor: (ajan: string | null, baslik: string) => `${ajan ?? "An agent"} is waiting for your decision: ${baslik}`,
  api: {
    gecersizIstek: "Invalid request.",
    anahtarGecersiz: "Invalid access key.",
    bulunamadi: "Not found.",
    yapilamiyor: "This can't be done right now.",
    cokBuyuk: "The file is too large.",
    cekirdekHatasi: "Something went wrong in the core.",
    beklenmeyen: (durum: number) => `Unexpected response (${durum}).`,
    ulasilamadi: "Couldn't reach the core. Check the connection.",
    bilinmeyen: "An unknown error occurred.",
    terminalKapandi: "Terminal session closed.",
  },
};
