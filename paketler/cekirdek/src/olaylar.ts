// Süreç içi olay yolu: çekirdekteki her değişiklik buradan WebSocket istemcilerine akar
import { EventEmitter } from "node:events";
import type { SunucuOlayi } from "@arnorg/ortak";

export class OlayYolu {
  private yayici = new EventEmitter();

  constructor() {
    this.yayici.setMaxListeners(200);
  }

  yayinla(olay: SunucuOlayi): void {
    this.yayici.emit("olay", olay);
  }

  dinle(dinleyici: (olay: SunucuOlayi) => void): () => void {
    this.yayici.on("olay", dinleyici);
    return () => this.yayici.off("olay", dinleyici);
  }
}

/** Olayın ait olduğu proje; null ise herkese gider */
export function olayProjesi(o: SunucuOlayi): string | null {
  switch (o.tur) {
    case "merhaba":
    case "proje.guncellendi":
    case "hesap.guncellendi":
      return null;
    case "bildirim":
      return o.projeId ?? null;
    case "ajan.guncellendi":
      return o.ajan.projeId;
    case "denetim.kaydi":
      return o.kayit.projeId;
    case "onay.yeni":
    case "onay.sonuc":
      return o.onay.projeId;
    case "gorev.guncellendi":
      return o.gorev.projeId;
    case "mesaj.yeni":
      return o.mesaj.projeId;
    case "hafiza.yeni":
      return o.kayit.projeId;
    case "soru.guncellendi":
      return o.soru.projeId;
    default:
      return "projeId" in o ? o.projeId : null;
  }
}
