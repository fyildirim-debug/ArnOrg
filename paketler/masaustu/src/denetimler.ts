// Electron'a bağımlı olmayan saf yardımcılar: adres denetimleri, pencere sınırları, kayıt tamponu.
// Birim testleri: denetimler.test.ts

/** Yalnız http ve https adresleri sistem tarayıcısında açılabilir. */
export function disaridaAcilabilirMi(adres: string): boolean {
  try {
    const u = new URL(adres);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Adres verilen kökle aynı kökten mi (protokol + ana makine + port)? */
export function ayniKokMu(adres: string, kok: string): boolean {
  try {
    return new URL(adres).origin === new URL(kok).origin;
  } catch {
    return false;
  }
}

/** Ana pencerenin (Stüdyo) isteyebileceği izinler */
export const ANA_PENCERE_IZINLERI: ReadonlySet<string> = new Set(["clipboard-read", "clipboard-sanitized-write", "fullscreen", "notifications"]);

/** Ana oturumda izin: yalnız listedeki izinler ve yalnız çekirdek kökünden gelen istekler (kök henüz yoksa hiçbiri) */
export function anaPencereIzniMi(izin: string, istekAdresi: string, kok: string | null): boolean {
  return ANA_PENCERE_IZINLERI.has(izin) && kok !== null && ayniKokMu(istekAdresi, kok);
}

export interface Dikdortgen {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PencereDurumu {
  x?: number;
  y?: number;
  width: number;
  height: number;
  buyutulmus: boolean;
}

const sayiMi = (d: unknown): d is number => typeof d === "number" && Number.isFinite(d);

/** Diskten okunan pencere durumunu doğrular; bozuksa null döner. */
export function pencereDurumunuAyristir(veri: unknown): PencereDurumu | null {
  if (typeof veri !== "object" || veri === null) return null;
  const v = veri as Record<string, unknown>;
  if (!sayiMi(v.width) || !sayiMi(v.height) || v.width < 200 || v.height < 150) return null;
  const durum: PencereDurumu = {
    width: Math.round(v.width),
    height: Math.round(v.height),
    buyutulmus: v.buyutulmus === true,
  };
  if (sayiMi(v.x) && sayiMi(v.y)) {
    durum.x = Math.round(v.x);
    durum.y = Math.round(v.y);
  }
  return durum;
}

/** Pencere, ekranlardan birinin çalışma alanıyla en az 100x50 piksel kesişiyorsa görünür sayılır. */
export function sinirlarGorunurMu(sinir: Dikdortgen, calismaAlanlari: Dikdortgen[]): boolean {
  return calismaAlanlari.some((a) => {
    const gen = Math.min(sinir.x + sinir.width, a.x + a.width) - Math.max(sinir.x, a.x);
    const yuk = Math.min(sinir.y + sinir.height, a.y + a.height) - Math.max(sinir.y, a.y);
    return gen >= 100 && yuk >= 50;
  });
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

/** Terminal renk ve denetim dizilerini temizler. */
export function ansiTemizle(metin: string): string {
  return metin.replace(ANSI, "");
}

/**
 * Parça parça gelen çıktıyı satırlara böler ve son `sinir` satırı tutar.
 * Yarım kalan satır bir sonraki parçayla birleştirilir.
 */
export class SatirTamponu {
  private readonly satirlar: string[] = [];
  private yarim = "";

  constructor(private readonly sinir = 200) {}

  ekle(parca: string): void {
    const metin = this.yarim + parca;
    const bolumler = metin.split(/\r?\n/);
    this.yarim = bolumler.pop() ?? "";
    for (const s of bolumler) this.satirEkle(s);
  }

  satirEkle(satir: string): void {
    this.satirlar.push(ansiTemizle(satir));
    if (this.satirlar.length > this.sinir) this.satirlar.splice(0, this.satirlar.length - this.sinir);
  }

  /** Tampondaki satırlar (yarım kalan son satır dahil) */
  kuyruk(): string {
    const tum = this.yarim ? [...this.satirlar, ansiTemizle(this.yarim)] : this.satirlar;
    return tum.slice(-this.sinir).join("\n");
  }
}
