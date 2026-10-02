// Ana pencerenin konum ve boyutunu <userData>/pencere-durumu.json dosyasında hatırlar.

import { screen, type BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { pencereDurumunuAyristir, sinirlarGorunurMu, type PencereDurumu } from "./denetimler.js";

const VARSAYILAN = { width: 1440, height: 900 };

export function pencereDurumunuOku(dosya: string): PencereDurumu {
  const alan = screen.getPrimaryDisplay().workAreaSize;
  let durum: PencereDurumu | null = null;
  try {
    durum = pencereDurumunuAyristir(JSON.parse(readFileSync(dosya, "utf8")));
  } catch {
    // ilk açılış ya da bozuk dosya
  }
  if (!durum) {
    return { width: Math.min(VARSAYILAN.width, alan.width), height: Math.min(VARSAYILAN.height, alan.height), buyutulmus: false };
  }
  // Pencere çıkarılmış bir ekranda kaldıysa konumu unut, sistem ortalasın
  if (durum.x !== undefined && durum.y !== undefined) {
    const calismaAlanlari = screen.getAllDisplays().map((e) => e.workArea);
    if (!sinirlarGorunurMu({ x: durum.x, y: durum.y, width: durum.width, height: durum.height }, calismaAlanlari)) {
      delete durum.x;
      delete durum.y;
    }
  }
  return durum;
}

export function pencereDurumunuYaz(dosya: string, pencere: BrowserWindow): void {
  if (pencere.isDestroyed()) return;
  const sinir = pencere.getNormalBounds();
  const durum: PencereDurumu = { ...sinir, buyutulmus: pencere.isMaximized() };
  try {
    writeFileSync(dosya, JSON.stringify(durum, null, 2));
  } catch {
    // yazılamazsa önemli değil
  }
}
