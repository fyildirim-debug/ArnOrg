// Erişim anahtarı ekranı (İngilizce)
import type { anahtar as tr } from "../tr/anahtar";

export const anahtar: typeof tr = {
  baslik: "Access key required",
  aciklama:
    "On first launch the core generates an access key and, in server mode, prints the connection URL to the terminal. Open that URL or paste the key below. The key is kept only in this tab and is deleted when the tab closes.",
  etiket: "Access key or connection URL",
  baglan: "Connect",
  dosya: "Key file: <data directory>/erisim-anahtari",
  yapistirin: "Paste the key.",
  gecersiz: "Invalid key. Use the most recent link printed by the core.",
  yanitYok: (durum: number) => `The core didn't respond (${durum}).`,
  ulasilamadi: "Couldn't reach the core. Make sure the server is running.",
};
