import type { DurumBilgisi, DurumEylemi } from "../kopru.js";

declare global {
  interface Window {
    /** durum-onyukleme.ts tarafından açılan köprü */
    arnorgDurum: {
      al(): Promise<DurumBilgisi>;
      dinle(geriCagri: (durum: DurumBilgisi) => void): void;
      eylem(ad: DurumEylemi): void;
    };
  }
}

export {};
