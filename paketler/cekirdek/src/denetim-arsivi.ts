// Denetim kaydının saklanması ve dışa aktarımı.
// Ayarlar.denetimSaklamaGun'den (varsayılan 90 gün; 0 süresiz) eski kayıtlar veri dizinindeki arsiv/denetim-<yıl>-<ay>.jsonl
// dosyalarına (kaydın UTC ayına göre) eklenir, sonra tablodan silinir: açılışta ve günde bir; süre ayarı değişince de
// sıradaki bakışta (en geç 15 dk). Dışa aktarım ucu (GET /api/projeler/:pid/denetim/disa-aktar) aynı JSONL biçimini ve
// Stüdyo'daki Denetim ekranının süzgecini kullanır.
import fs from "node:fs";
import path from "node:path";
import type { DenetimKaydi, Karar } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import type { Yapilandirma } from "./yapilandirma.js";

const GUN_MS = 86_400_000;
/** Bir partide taşınan kayıt; partiler arasında olay döngüsü serbest kalır */
const PARTI = 2000;
/** Saklama bakışının sıklığı: son arşivden bu yana bir gün geçtiyse ya da süre ayarı değiştiyse arşivlenir */
const BAKIS_ARALIGI_MS = 15 * 60_000;

/** Denetim ekranının süzgeci: karar, ajan ve araç, girdi, kural ya da nedende harf duyarsız arama */
export interface DenetimSuzgeci {
  karar?: Karar | null;
  ajanId?: string | null;
  q?: string | null;
}

/** Stüdyo'daki süzgeçle aynı kural (gorunumler/Denetim.tsx) */
export function suzgeceUyar(k: DenetimKaydi, s: DenetimSuzgeci): boolean {
  if (s.karar && k.karar !== s.karar) return false;
  if (s.ajanId && k.ajanId !== s.ajanId) return false;
  const q = s.q?.trim().toLocaleLowerCase("tr-TR");
  return !q || `${k.arac} ${k.girdiOzeti} ${k.kural ?? ""} ${k.neden ?? ""}`.toLocaleLowerCase("tr-TR").includes(q);
}

/** JSONL satırı: kaydın API'deki biçimi, satır sonuyla */
export function jsonlSatiri(k: DenetimKaydi): string {
  return `${JSON.stringify(k)}\n`;
}

/** Kaydın arşiv dosyası: denetim-2026-07.jsonl (kaydın UTC ayı) */
export function arsivDosyaAdi(zaman: string): string {
  return `denetim-${/^\d{4}-\d{2}/.exec(zaman)?.[0] ?? "tarihsiz"}.jsonl`;
}

export interface ArsivSonucu {
  tasinan: number;
  /** Eklenen arşiv dosyalarının tam yolları */
  dosyalar: string[];
}

export class DenetimArsivi {
  private zamanlayici: NodeJS.Timeout | null = null;
  private suren: Promise<ArsivSonucu> | null = null;
  private sonCalisma = 0;
  private sonGun: number | null = null;
  private durdu = false;

  constructor(
    private readonly depo: Depo,
    private readonly yapilandirma: Yapilandirma,
  ) {}

  /** Arşiv dosyalarının klasörü: <veri>/arsiv */
  get dizin(): string {
    return path.join(this.yapilandirma.veriDizini, "arsiv");
  }

  /** Açılışta (kısa gecikmeyle) ve sonra günde bir ya da süre ayarı değişince arşivler */
  baslat(): void {
    if (this.zamanlayici) return;
    this.durdu = false;
    const bak = () => {
      if (Date.now() - this.sonCalisma < GUN_MS && this.yapilandirma.ayarlar.denetimSaklamaGun === this.sonGun) return;
      void this.arsivle().catch(() => undefined);
    };
    setTimeout(bak, 5_000).unref();
    this.zamanlayici = setInterval(bak, BAKIS_ARALIGI_MS);
    this.zamanlayici.unref();
  }

  durdur(): void {
    this.durdu = true;
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
  }

  /** Saklama süresi dolan kayıtları aylık arşiv dosyalarına ekleyip tablodan siler; aynı anda tek çalışma */
  arsivle(simdiMs = Date.now()): Promise<ArsivSonucu> {
    if (this.suren) return this.suren;
    this.suren = this.calis(simdiMs).finally(() => {
      this.suren = null;
    });
    return this.suren;
  }

  private async calis(simdiMs: number): Promise<ArsivSonucu> {
    const gun = this.yapilandirma.ayarlar.denetimSaklamaGun;
    this.sonCalisma = Date.now();
    this.sonGun = gun;
    const dosyalar = new Set<string>();
    let tasinan = 0;
    if (typeof gun !== "number" || !(gun > 0)) return { tasinan, dosyalar: [] };
    const sinir = new Date(simdiMs - gun * GUN_MS).toISOString();
    while (!this.durdu) {
      const parti = this.depo.denetimEskiler(sinir, PARTI);
      if (!parti.length) break;
      const aylar = new Map<string, string>();
      for (const k of parti) {
        const ad = arsivDosyaAdi(k.zaman);
        aylar.set(ad, (aylar.get(ad) ?? "") + jsonlSatiri(k));
      }
      fs.mkdirSync(this.dizin, { recursive: true });
      // Önce dosyaya eklenir, sonra silinir: dosya yazılamazsa kayıt tabloda kalır
      for (const [ad, metin] of aylar) {
        const dosya = path.join(this.dizin, ad);
        fs.appendFileSync(dosya, metin, "utf8");
        dosyalar.add(dosya);
      }
      this.depo.denetimSil(parti.map((k) => k.id));
      tasinan += parti.length;
      if (parti.length < PARTI) break;
      await new Promise((coz) => setImmediate(coz));
    }
    return { tasinan, dosyalar: [...dosyalar].sort() };
  }
}
