// Uygulama ayarları ve erişim anahtarı (veri dizininde)
import fs from "node:fs";
import path from "node:path";
import type { Ayarlar } from "@arnorg/ortak";
import { rastgeleAnahtar } from "./yardimci.js";

export const VARSAYILAN_AYARLAR: Ayarlar = {
  claudeYolu: null,
  varsayilanIzinModu: "bypassPermissions",
  onaySuresiSn: 900,
  gunlukButceUsd: 50,
  disEditor: process.platform === "win32" ? "code" : "codium",
  tikanmaDakika: 20,
};

export class Yapilandirma {
  private ayarlarDosyasi: string;
  private mevcut: Ayarlar;

  constructor(readonly veriDizini: string) {
    fs.mkdirSync(veriDizini, { recursive: true });
    this.ayarlarDosyasi = path.join(veriDizini, "ayarlar.json");
    this.mevcut = { ...VARSAYILAN_AYARLAR, ...this.oku() };
  }

  private oku(): Partial<Ayarlar> {
    try {
      return JSON.parse(fs.readFileSync(this.ayarlarDosyasi, "utf8")) as Partial<Ayarlar>;
    } catch {
      return {};
    }
  }

  get ayarlar(): Ayarlar {
    return { ...this.mevcut };
  }

  guncelle(degisiklik: Partial<Ayarlar>): Ayarlar {
    const temiz: Partial<Ayarlar> = {};
    if (degisiklik.claudeYolu !== undefined) temiz.claudeYolu = degisiklik.claudeYolu ? String(degisiklik.claudeYolu) : null;
    if (degisiklik.varsayilanIzinModu) temiz.varsayilanIzinModu = degisiklik.varsayilanIzinModu;
    if (typeof degisiklik.onaySuresiSn === "number") temiz.onaySuresiSn = Math.min(Math.max(30, degisiklik.onaySuresiSn), 86_400);
    if (typeof degisiklik.gunlukButceUsd === "number") temiz.gunlukButceUsd = Math.max(0, degisiklik.gunlukButceUsd);
    if (typeof degisiklik.disEditor === "string") temiz.disEditor = degisiklik.disEditor.trim();
    if (typeof degisiklik.tikanmaDakika === "number") temiz.tikanmaDakika = Math.min(Math.max(0, Math.round(degisiklik.tikanmaDakika)), 1440);
    this.mevcut = { ...this.mevcut, ...temiz };
    fs.writeFileSync(this.ayarlarDosyasi, JSON.stringify(this.mevcut, null, 2), "utf8");
    return this.ayarlar;
  }

  /** Erişim anahtarını okur; yoksa üretir ve yalnız sahibinin okuyabileceği şekilde yazar */
  erisimAnahtari(verilen?: string): string {
    const dosya = path.join(this.veriDizini, "erisim-anahtari");
    if (verilen) {
      fs.writeFileSync(dosya, verilen, { encoding: "utf8", mode: 0o600 });
      return verilen;
    }
    try {
      const mevcut = fs.readFileSync(dosya, "utf8").trim();
      if (mevcut.length >= 16) return mevcut;
    } catch {
      // ilk açılış
    }
    const yeni = rastgeleAnahtar();
    fs.writeFileSync(dosya, yeni, { encoding: "utf8", mode: 0o600 });
    return yeni;
  }

  get calismaKoku(): string {
    return path.join(this.veriDizini, "calisma");
  }
}
