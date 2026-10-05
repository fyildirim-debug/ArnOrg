// Dosya kiraları (0.0.8): ortak projede bir çalışanın düzenlediği dosya ona kiralanır; başkası düzenleyemez. Kira
// görev kaydedilince, sahibi durunca ya da sahibi uzun süre sessiz kalınca biter. Anahtar repo köküne göre / ayraçlı
// yoldur; Windows ve macOS'ta (büyük/küçük harf duyarsız dosya sistemi) küçük harfe indirilir. Kayıt bellekte tutulur,
// değişince proje başına kısa gecikmeyle kalıcı kayda (anahtar-değer) yazılır; açılışta geri yüklenir.
import type { DosyaKirasi, KiraKaynagi } from "@arnorg/ortak";
import { simdi } from "../yardimci.js";

/** Göreli yolun kira anahtarı */
export function kiraAnahtari(yol: string, platform: NodeJS.Platform = process.platform): string {
  const temiz = yol.replace(/\\/g, "/").replace(/^\.\//, "");
  return platform === "win32" || platform === "darwin" ? temiz.toLowerCase() : temiz;
}

export interface KiraIstegi {
  yol: string;
  ajanId: string;
  ajanAd: string;
  gorevId: string | null;
  gorevKodu: string | null;
  kaynak: KiraKaynagi;
}

export interface KiraDefteriBaglami {
  /** Projenin kiraları değişti (yayın ve kalıcı kayıt) */
  degisti(projeId: string): void;
  platform?: NodeJS.Platform;
}

export class KiraDefteri {
  /** Proje → anahtar → kira */
  private readonly projeler = new Map<string, Map<string, DosyaKirasi>>();

  constructor(private readonly b: KiraDefteriBaglami) {}

  private harita(projeId: string): Map<string, DosyaKirasi> {
    let h = this.projeler.get(projeId);
    if (!h) this.projeler.set(projeId, (h = new Map()));
    return h;
  }

  private anahtar(yol: string): string {
    return kiraAnahtari(yol, this.b.platform);
  }

  liste(projeId: string): DosyaKirasi[] {
    return [...(this.projeler.get(projeId)?.values() ?? [])].sort((a, b) => a.ajanAd.localeCompare(b.ajanAd) || a.yol.localeCompare(b.yol));
  }

  /** Bütün projelerdeki kiralar */
  hepsi(): DosyaKirasi[] {
    return [...this.projeler.values()].flatMap((h) => [...h.values()]);
  }

  sahibi(projeId: string, yol: string): DosyaKirasi | null {
    return this.projeler.get(projeId)?.get(this.anahtar(yol)) ?? null;
  }

  /**
   * Yolu başkası kiralamış mı: dosyada o dosyanın kirası, klasörde (rm -r) içindeki herhangi bir dosyanın kirası.
   * Kendi kirası çakışma sayılmaz.
   */
  cakisan(projeId: string, ajanId: string, yol: string, dizin = false): DosyaKirasi | null {
    const h = this.projeler.get(projeId);
    if (!h) return null;
    const a = this.anahtar(yol);
    const tek = h.get(a);
    if (tek && tek.ajanId !== ajanId) return tek;
    if (!dizin) return null;
    const on = a === "" || a === "." ? "" : `${a.replace(/\/+$/, "")}/`;
    for (const [k, kira] of h) if (kira.ajanId !== ajanId && (on === "" || k.startsWith(on))) return kira;
    return null;
  }

  /** Kiralar; başkasınınkiyse dokunmaz ve onu döner. Kendi kirası tazelenir (görevi ilk kiralayandaki kalır) */
  al(projeId: string, istek: KiraIstegi): { kira: DosyaKirasi; yeni: boolean } | { cakisma: DosyaKirasi } {
    const h = this.harita(projeId);
    const a = this.anahtar(istek.yol);
    const var0 = h.get(a);
    if (var0 && var0.ajanId !== istek.ajanId) return { cakisma: var0 };
    const zaman = simdi();
    if (var0) {
      var0.son = zaman;
      // Görevsiz kiralanan dosya, sahibi bir göreve başlayınca o göreve geçer
      if (!var0.gorevId && istek.gorevId) {
        var0.gorevId = istek.gorevId;
        var0.gorevKodu = istek.gorevKodu;
        this.b.degisti(projeId);
      }
      return { kira: var0, yeni: false };
    }
    const kira: DosyaKirasi = { ...istek, yol: istek.yol.replace(/\\/g, "/"), baslangic: zaman, son: zaman };
    h.set(a, kira);
    this.b.degisti(projeId);
    return { kira, yeni: true };
  }

  /** Sahibi dosyaya yeniden dokundu */
  dokundu(projeId: string, ajanId: string, yol: string): void {
    const k = this.sahibi(projeId, yol);
    if (k && k.ajanId === ajanId) k.son = simdi();
  }

  /** Seçilen kiraları bırakır; bırakılanlar döner */
  birak(projeId: string, secici: (k: DosyaKirasi) => boolean): DosyaKirasi[] {
    const h = this.projeler.get(projeId);
    if (!h) return [];
    const birakilan: DosyaKirasi[] = [];
    for (const [a, k] of h) {
      if (!secici(k)) continue;
      h.delete(a);
      birakilan.push(k);
    }
    if (birakilan.length) this.b.degisti(projeId);
    return birakilan;
  }

  /** Bütün projelerde ajanın kiraları */
  ajaninkiler(ajanId: string): DosyaKirasi[] {
    return this.hepsi().filter((k) => k.ajanId === ajanId);
  }

  /** Görevi devralan kiraları da devralır (işten çıkarma, yeniden atama) */
  devret(projeId: string, eskiAjanId: string, yeni: { ajanId: string; ajanAd: string }, gorevId?: string | null): number {
    const h = this.projeler.get(projeId);
    if (!h) return 0;
    let n = 0;
    for (const k of h.values()) {
      if (k.ajanId !== eskiAjanId || (gorevId !== undefined && k.gorevId !== gorevId)) continue;
      k.ajanId = yeni.ajanId;
      k.ajanAd = yeni.ajanAd;
      k.son = simdi();
      n++;
    }
    if (n) this.b.degisti(projeId);
    return n;
  }

  /** Kalıcı kayıttan geri yükler (açılış) */
  yukle(projeId: string, kiralar: DosyaKirasi[]): void {
    const h = this.harita(projeId);
    for (const k of kiralar) if (k && typeof k.yol === "string" && typeof k.ajanId === "string") h.set(this.anahtar(k.yol), k);
  }

  projeKaldir(projeId: string): void {
    this.projeler.delete(projeId);
  }
}
