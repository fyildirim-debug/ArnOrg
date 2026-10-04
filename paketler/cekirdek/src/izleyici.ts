// Çalışma alanlarındaki dosya değişikliklerini izler; editöre canlı bildirir
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { OlayYolu } from "./olaylar.js";
import { YOK_SAYILAN } from "./dosyalar.js";

interface Izlenen {
  izleyici: FSWatcher;
  projeId: string;
  alan: string;
}

export class DosyaIzleyici {
  private izlenenler = new Map<string, Izlenen>();
  private bekleyen = new Map<string, NodeJS.Timeout>();

  constructor(
    private olaylar: OlayYolu,
    private sonDuzenleyen: (tamYol: string) => string | null,
  ) {}

  izle(projeId: string, alan: string, kok: string): void {
    const anahtar = path.resolve(kok);
    if (this.izlenenler.has(anahtar)) return;
    const izleyici = watch(kok, {
      ignoreInitial: true,
      persistent: true,
      depth: 12,
      ignored: (yol: string) => path.relative(kok, yol).split(/[\\/]/).some((p) => YOK_SAYILAN.has(p)),
    });
    izleyici.on("all", (_olay, tamYol) => {
      const goreli = path.relative(kok, tamYol).replace(/\\/g, "/");
      if (!goreli || goreli.startsWith("..")) return;
      const b = `${anahtar}::${goreli}`;
      const z = this.bekleyen.get(b);
      if (z) clearTimeout(z);
      this.bekleyen.set(
        b,
        setTimeout(() => {
          this.bekleyen.delete(b);
          this.olaylar.yayinla({ tur: "dosya.degisti", projeId, alan, yol: goreli, ajanId: this.sonDuzenleyen(tamYol) });
        }, 250),
      );
    });
    izleyici.on("error", () => undefined);
    this.izlenenler.set(anahtar, { izleyici, projeId, alan });
  }

  birak(kok: string): void {
    const anahtar = path.resolve(kok);
    const i = this.izlenenler.get(anahtar);
    if (!i) return;
    void i.izleyici.close();
    this.izlenenler.delete(anahtar);
  }

  /** Silinen ajanın alanını izlemeyi bırakır (worktree kaldırılınca her dosya için olay yağmasın) */
  alaniBirak(projeId: string, alan: string): void {
    for (const [kok, i] of this.izlenenler) if (i.projeId === projeId && i.alan === alan) this.birak(kok);
  }

  async kapat(): Promise<void> {
    for (const z of this.bekleyen.values()) clearTimeout(z);
    await Promise.all([...this.izlenenler.values()].map((i) => i.izleyici.close()));
    this.izlenenler.clear();
  }
}
