// Uygulama ayarları ve erişim anahtarı (veri dizininde)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ayarlar, Dil } from "@arnorg/ortak";
import { gunlukBrifingAyari, VARSAYILAN_GUNLUK_BRIFING } from "./brifing.js";
import { rastgeleAnahtar } from "./yardimci.js";

/** Sistem dili: Türkçe yerel ayarda "tr", diğerlerinde "en". ARNORG_DIL (tr/en) her şeyin önüne geçer */
export function sistemDili(kaynak: NodeJS.ProcessEnv = process.env): Dil {
  if (kaynak.ARNORG_DIL === "tr" || kaynak.ARNORG_DIL === "en") return kaynak.ARNORG_DIL;
  const adaylar = [kaynak.LC_ALL, kaynak.LC_MESSAGES, kaynak.LANG, kaynak.LANGUAGE, Intl.DateTimeFormat().resolvedOptions().locale];
  const ilk = adaylar.find((d) => d && d !== "C" && d !== "POSIX" && !d.startsWith("C."));
  return ilk?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export const VARSAYILAN_AYARLAR: Ayarlar = {
  dil: sistemDili(),
  claudeYolu: null,
  varsayilanIzinModu: "bypassPermissions",
  onaySuresiSn: 900,
  denetimSaklamaGun: 90,
  disEditor: process.platform === "win32" ? "code" : "codium",
  tikanmaDakika: 20,
  esZamanliAjan: 3,
  acilistaSurdur: true,
  gorevTokenTavani: 2_000_000,
  besSaatlikSinirYuzde: 90,
  haftalikSinirYuzde: 95,
  kodZekasiModeli: "kaliteli",
  kodZekasiOtomatik: true,
  ghYolu: null,
  projeKoku: null,
  kurulumTamam: false,
  gunlukBrifing: { ...VARSAYILAN_GUNLUK_BRIFING },
};

/** Yalnız bilinen ayarlar: eski sürümlerden kalan alanlar (ör. kaldırılan API girişi ve dolar bütçesi) okunmaz, açılışta dosyadan silinir */
function ayikla(a: Ayarlar): Ayarlar {
  const temiz: Record<string, unknown> = {};
  for (const k of Object.keys(VARSAYILAN_AYARLAR)) temiz[k] = (a as unknown as Record<string, unknown>)[k];
  // Elle bozulmuş günlük brifing ayarı varsayılana döner (her açılışta yeni nesne)
  temiz.gunlukBrifing = gunlukBrifingAyari(temiz.gunlukBrifing);
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
    if (degisiklik.dil === "tr" || degisiklik.dil === "en") temiz.dil = degisiklik.dil;
    if (degisiklik.claudeYolu !== undefined) temiz.claudeYolu = degisiklik.claudeYolu ? String(degisiklik.claudeYolu) : null;
    if (degisiklik.varsayilanIzinModu) temiz.varsayilanIzinModu = degisiklik.varsayilanIzinModu;
    if (typeof degisiklik.onaySuresiSn === "number") temiz.onaySuresiSn = Math.min(Math.max(30, degisiklik.onaySuresiSn), 86_400);
    if (typeof degisiklik.denetimSaklamaGun === "number" && Number.isFinite(degisiklik.denetimSaklamaGun)) temiz.denetimSaklamaGun = Math.min(Math.max(0, Math.round(degisiklik.denetimSaklamaGun)), 3650);
    if (typeof degisiklik.disEditor === "string") temiz.disEditor = degisiklik.disEditor.trim();
    const yuzde = (v: number) => Math.min(Math.max(0, Math.round(v)), 100);
    if (typeof degisiklik.besSaatlikSinirYuzde === "number") temiz.besSaatlikSinirYuzde = yuzde(degisiklik.besSaatlikSinirYuzde);
    if (typeof degisiklik.haftalikSinirYuzde === "number") temiz.haftalikSinirYuzde = yuzde(degisiklik.haftalikSinirYuzde);
    if (typeof degisiklik.tikanmaDakika === "number") temiz.tikanmaDakika = Math.min(Math.max(0, Math.round(degisiklik.tikanmaDakika)), 1440);
    const tamSayi = (v: unknown, enCok: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(0, Math.round(v)), enCok) : undefined);
    const esZamanli = tamSayi(degisiklik.esZamanliAjan, 50);
    if (esZamanli !== undefined) temiz.esZamanliAjan = esZamanli;
    if (typeof degisiklik.acilistaSurdur === "boolean") temiz.acilistaSurdur = degisiklik.acilistaSurdur;
    const tavan = tamSayi(degisiklik.gorevTokenTavani, 1_000_000_000);
    if (tavan !== undefined) temiz.gorevTokenTavani = tavan;
    if (degisiklik.kodZekasiModeli === "kaliteli" || degisiklik.kodZekasiModeli === "hizli" || degisiklik.kodZekasiModeli === "kapali") temiz.kodZekasiModeli = degisiklik.kodZekasiModeli;
    if (typeof degisiklik.kodZekasiOtomatik === "boolean") temiz.kodZekasiOtomatik = degisiklik.kodZekasiOtomatik;
    if (degisiklik.ghYolu !== undefined) temiz.ghYolu = degisiklik.ghYolu ? String(degisiklik.ghYolu) : null;
    if (degisiklik.projeKoku !== undefined) temiz.projeKoku = degisiklik.projeKoku?.trim() ? path.resolve(degisiklik.projeKoku.trim()) : null;
    if (typeof degisiklik.kurulumTamam === "boolean") temiz.kurulumTamam = degisiklik.kurulumTamam;
    if (degisiklik.gunlukBrifing && typeof degisiklik.gunlukBrifing === "object") temiz.gunlukBrifing = gunlukBrifingAyari(degisiklik.gunlukBrifing, this.mevcut.gunlukBrifing);
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

  /** Yeni projelerin kök dizini: ayardaki ya da ~/ArnOrg */
  get projeKoku(): string {
    return this.mevcut.projeKoku ?? path.join(os.homedir(), "ArnOrg");
  }

  /** ArnOrg'un indirdiği araçlar (gh) */
  get araclarDizini(): string {
    return path.join(this.veriDizini, "araclar");
  }
}
