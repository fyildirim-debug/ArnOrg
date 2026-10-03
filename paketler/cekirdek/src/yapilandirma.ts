// Uygulama ayarları ve erişim anahtarı (veri dizininde)
import fs from "node:fs";
import path from "node:path";
import type { Ayarlar } from "@arnorg/ortak";
import { rastgeleAnahtar } from "./yardimci.js";

export const VARSAYILAN_AYARLAR: Ayarlar = {
  claudeYolu: null,
  varsayilanIzinModu: "bypassPermissions",
  onaySuresiSn: 900,
  disEditor: process.platform === "win32" ? "code" : "codium",
  tikanmaDakika: 20,
  besSaatlikSinirYuzde: 90,
  haftalikSinirYuzde: 95,
  kodZekasiModeli: "kaliteli",
  kodZekasiOtomatik: true,
};

/** Yalnız bilinen ayarlar: eski sürümlerden kalan alanlar (ör. kaldırılan API girişi ve dolar bütçesi) okunmaz, açılışta dosyadan silinir */
function ayikla(a: Ayarlar): Ayarlar {
  const temiz: Record<string, unknown> = {};
  for (const k of Object.keys(VARSAYILAN_AYARLAR)) temiz[k] = (a as unknown as Record<string, unknown>)[k];
  return temiz as unknown as Ayarlar;
}

export class Yapilandirma {
  private ayarlarDosyasi: string;
  private mevcut: Ayarlar;

  constructor(readonly veriDizini: string) {
    fs.mkdirSync(veriDizini, { recursive: true });
    this.ayarlarDosyasi = path.join(veriDizini, "ayarlar.json");
    const okunan = this.oku();
    this.mevcut = ayikla({ ...VARSAYILAN_AYARLAR, ...okunan });
    if (Object.keys(okunan).some((k) => !(k in VARSAYILAN_AYARLAR))) this.yaz();
  }

  private yaz(): void {
    try {
      fs.writeFileSync(this.ayarlarDosyasi, JSON.stringify(this.mevcut, null, 2), "utf8");
    } catch {
      // Salt okunur veri dizini: eski alanlar zaten okunmuyor
    }
  }

  private oku(): Partial<Ayarlar> {
    try {
      const v: unknown = JSON.parse(fs.readFileSync(this.ayarlarDosyasi, "utf8"));
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<Ayarlar>) : {};
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
    if (typeof degisiklik.disEditor === "string") temiz.disEditor = degisiklik.disEditor.trim();
    const yuzde = (v: number) => Math.min(Math.max(0, Math.round(v)), 100);
    if (typeof degisiklik.besSaatlikSinirYuzde === "number") temiz.besSaatlikSinirYuzde = yuzde(degisiklik.besSaatlikSinirYuzde);
    if (typeof degisiklik.haftalikSinirYuzde === "number") temiz.haftalikSinirYuzde = yuzde(degisiklik.haftalikSinirYuzde);
    if (typeof degisiklik.tikanmaDakika === "number") temiz.tikanmaDakika = Math.min(Math.max(0, Math.round(degisiklik.tikanmaDakika)), 1440);
    if (degisiklik.kodZekasiModeli === "kaliteli" || degisiklik.kodZekasiModeli === "hizli" || degisiklik.kodZekasiModeli === "kapali") temiz.kodZekasiModeli = degisiklik.kodZekasiModeli;
    if (typeof degisiklik.kodZekasiOtomatik === "boolean") temiz.kodZekasiOtomatik = degisiklik.kodZekasiOtomatik;
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
