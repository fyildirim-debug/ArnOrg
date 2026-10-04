// Yerleşik meta arama (SearXNG gibi, ayrı sunucu olmadan): seçilen kategorideki motorlar paralel sorgulanır,
// sonuçlar adres normal biçimiyle tekilleştirilip Σ motor ağırlığı / sıra ile puanlanır. Hata veren motor askıya
// alınır (429 → 10 dk; 403, CAPTCHA, anomali → 1 sa; zaman aşımı ve ağ hatası → artan kısa askı); bir motorun
// düşmesi aramayı bozmaz. Yanıtlar 10 dakika bellekte tutulur, aynı sorgu aynı anda gelirse tek istek gider.
import type { Dil, WebAramaIstegi, WebAramaKategorisi, WebAramaSonucu, WebAramaYaniti, WebAyarlari, WebMotorDurumu } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { ArnorgHatasi } from "../yardimci.js";
import { adresAnahtari, adresiTemizle } from "./adres.js";
import { AgHatasi, type Getirici } from "./http.js";
import { bing, bingHaber } from "./motorlar/bing.js";
import { brave } from "./motorlar/brave.js";
import { duckduckgo } from "./motorlar/duckduckgo.js";
import { mojeek } from "./motorlar/mojeek.js";
import { alakaliMi, MotorHatasi, type GhIstemcisi, type Motor, type MotorIstegi, type MotorSonucu } from "./motorlar/ortak.js";
import { stackoverflow } from "./motorlar/stackoverflow.js";
import { arxiv, github, hackernews, mdn, npm, searxng } from "./motorlar/teknik.js";
import { wikipedia } from "./motorlar/wikipedia.js";

/** Yerleşik motorlar (searxng yalnız ayarda adres varken sorgulanır) */
export const MOTORLAR: Motor[] = [bing, duckduckgo, brave, mojeek, wikipedia, bingHaber, stackoverflow, github, npm, mdn, hackernews, arxiv, searxng];

export const MOTOR_ZAMAN_ASIMI_MS = 6000;
export const ARAMA_ONBELLEK_MS = 10 * 60_000;
const ONBELLEK_SINIRI = 200;
export const COK_ISTEK_ASKISI_MS = 10 * 60_000;
export const ENGEL_ASKISI_MS = 60 * 60_000;
const KISA_ASKI_MS = 5000;
const KISA_ASKI_TAVANI_MS = 120_000;
/** Birleşik listede en çok bu kadar sonuç döner */
const SONUC_SINIRI = 30;

export interface AramaBaglami {
  ayarlar(): WebAyarlari;
  dil(): Dil;
  getir: Getirici;
  gh(): GhIstemcisi | null;
  /** Testlerde saat */
  simdi?(): number;
  /** Testlerde motor listesi */
  motorlar?: Motor[];
  zamanAsimiMs?: number;
}

interface MotorKaydi {
  ardisikHata: number;
  askiBitis: number;
  sonHata: string | null;
  sonHataZamani: number | null;
  sonBasari: number | null;
  basari: number;
  hata: number;
}

interface Birlesen {
  sonuc: WebAramaSonucu;
  /** İlk görüldüğü sıra (eşit puanda kararlı sıralama) */
  ilk: number;
  enIyiSira: number;
}

/** Bir motorun hatası için askı süresi (ardışık hata sayısı artırıldıktan sonra) */
export function askiSuresi(tur: MotorHatasi["tur"], ardisikHata: number): number {
  if (tur === "cok_istek") return COK_ISTEK_ASKISI_MS;
  if (tur === "engel" || tur === "captcha") return ENGEL_ASKISI_MS;
  if (tur === "zaman_asimi" || tur === "ag" || tur === "http") return Math.min(KISA_ASKI_TAVANI_MS, ardisikHata * KISA_ASKI_MS);
  return 0;
}

/**
 * Motorların sonuçlarını birleştirir: aynı adres (normal biçim) tek sonuç olur, puan Σ ağırlık / sıra.
 * https adresi, dolu başlık ve daha uzun özet tercih edilir; motorlar en iyi sıradan başlayarak listelenir.
 */
export function sonuclariBirlestir(parcalar: { motor: Pick<Motor, "kimlik" | "agirlik">; sonuclar: MotorSonucu[] }[]): WebAramaSonucu[] {
  const harita = new Map<string, Birlesen & { siralar: Map<string, number> }>();
  let sayac = 0;
  for (const { motor, sonuclar } of parcalar) {
    sonuclar.forEach((r, i) => {
      const sira = i + 1;
      const adres = adresiTemizle(r.adres);
      const anahtar = adresAnahtari(adres);
      const mevcut = harita.get(anahtar);
      if (!mevcut) {
        harita.set(anahtar, {
          sonuc: { baslik: r.baslik || adres, adres, ozet: r.ozet, motorlar: [motor.kimlik], puan: motor.agirlik / sira, tarih: r.tarih ?? null },
          ilk: sayac++,
          enIyiSira: sira,
          siralar: new Map([[motor.kimlik, sira]]),
        });
        return;
      }
      const s = mevcut.sonuc;
      // Aynı motor aynı adresi iki kez verdiyse yalnız ilki sayılır
      if (mevcut.siralar.has(motor.kimlik)) return;
      mevcut.siralar.set(motor.kimlik, sira);
      s.puan += motor.agirlik / sira;
      if (adres.startsWith("https:") && !s.adres.startsWith("https:")) s.adres = adres;
      if (!s.baslik || s.baslik === s.adres) s.baslik = r.baslik || s.baslik;
      if (r.ozet.length > s.ozet.length) s.ozet = r.ozet;
      s.tarih ??= r.tarih ?? null;
      mevcut.enIyiSira = Math.min(mevcut.enIyiSira, sira);
    });
  }
  return [...harita.values()]
    .map((b) => {
      b.sonuc.motorlar = [...b.siralar.entries()].sort((x, y) => x[1] - y[1]).map(([m]) => m);
      b.sonuc.puan = Math.round(b.sonuc.puan * 1000) / 1000;
      return b;
    })
    .sort((a, b) => b.sonuc.puan - a.sonuc.puan || a.enIyiSira - b.enIyiSira || a.ilk - b.ilk)
    .map((b) => b.sonuc);
}

export class WebArama {
  private readonly kayitlar = new Map<string, MotorKaydi>();
  private readonly onbellek = new Map<string, { zaman: number; yanit: WebAramaYaniti }>();
  private readonly suren = new Map<string, Promise<WebAramaYaniti>>();

  constructor(private readonly b: AramaBaglami) {}

  private simdi(): number {
    return this.b.simdi?.() ?? Date.now();
  }

  motorlar(): Motor[] {
    return this.b.motorlar ?? MOTORLAR;
  }

  private kayit(kimlik: string): MotorKaydi {
    let k = this.kayitlar.get(kimlik);
    if (!k) {
      k = { ardisikHata: 0, askiBitis: 0, sonHata: null, sonHataZamani: null, sonBasari: null, basari: 0, hata: 0 };
      this.kayitlar.set(kimlik, k);
    }
    return k;
  }

  /** Kategoride sorgulanacak motorlar: kurulun kapattıkları hariç; searxng yalnız adres varken */
  private secilenler(kategori: WebAramaKategorisi, ayar: WebAyarlari): Motor[] {
    const kapali = new Set(ayar.kapaliMotorlar);
    return this.motorlar().filter((m) => m.kategoriler.includes(kategori) && !kapali.has(m.kimlik) && (m.kimlik !== "searxng" || !!ayar.searxngAdresi));
  }

  async ara(istek: WebAramaIstegi): Promise<WebAramaYaniti> {
    const sorgu = istek.sorgu?.replace(/\s+/g, " ").trim() ?? "";
    if (!sorgu) throw new ArnorgHatasi(iki("Arama sorgusu boş olamaz.", "The search query cannot be empty."));
    if (sorgu.length > 500) throw new ArnorgHatasi(iki("Arama sorgusu en çok 500 karakter olabilir.", "The search query can be at most 500 characters."));
    const kategori: WebAramaKategorisi = istek.kategori ?? "genel";
    const sayfa = Math.min(Math.max(1, Math.floor(istek.sayfa ?? 1)), 10);
    const dil: Dil = istek.dil ?? this.b.dil();
    const ayar = this.b.ayarlar();
    const anahtar = JSON.stringify([sorgu.toLocaleLowerCase("tr"), kategori, sayfa, dil, [...ayar.kapaliMotorlar].sort(), ayar.searxngAdresi ?? ""]);

    const bellek = this.onbellek.get(anahtar);
    if (bellek && this.simdi() - bellek.zaman < ARAMA_ONBELLEK_MS) return { ...bellek.yanit, onbellekten: true };
    const suren = this.suren.get(anahtar);
    if (suren) return suren;

    const is = this.calistir({ sorgu, kategori, sayfa, dil }, ayar)
      .then((yanit) => {
        // Hiçbir motor yanıt vermediyse önbelleğe girmez (bir sonraki denemede belki düzelir)
        if (yanit.yanitVerenler.length) {
          this.onbellek.set(anahtar, { zaman: this.simdi(), yanit });
          while (this.onbellek.size > ONBELLEK_SINIRI) this.onbellek.delete(this.onbellek.keys().next().value!);
        }
        return yanit;
      })
      .finally(() => this.suren.delete(anahtar));
    this.suren.set(anahtar, is);
    return is;
  }

  private async calistir(i: MotorIstegi, ayar: WebAyarlari): Promise<WebAramaYaniti> {
    const bas = this.simdi();
    const askidakiler: string[] = [];
    const sorgulanan: Motor[] = [];
    for (const m of this.secilenler(i.kategori, ayar)) {
      if (this.kayit(m.kimlik).askiBitis > bas) askidakiler.push(m.kimlik);
      else sorgulanan.push(m);
    }
    const ortam = { getir: this.b.getir, gh: this.b.gh(), searxngAdresi: ayar.searxngAdresi, zamanAsimiMs: this.b.zamanAsimiMs ?? MOTOR_ZAMAN_ASIMI_MS };
    const sonuclar = await Promise.all(
      sorgulanan.map(async (m) => {
        try {
          let r = await sureSinirli(m.ara(i, ortam), ortam.zamanAsimiMs + 2000, m.ad);
          if (m.alakaDenetimi && !alakaliMi(i.sorgu, r)) {
            this.hataYaz(m, new MotorHatasi("cozumleme", iki("sorguyla ilgisiz sonuçlar ayıklandı (bot koruması olabilir)", "results unrelated to the query were dropped (possibly bot protection)")));
            return { motor: m, sonuclar: [] as MotorSonucu[], hata: iki("ilgisiz sonuçlar ayıklandı", "unrelated results dropped") };
          }
          r = r.filter((x) => x.adres && x.baslik);
          this.basariYaz(m);
          return { motor: m, sonuclar: r, hata: null };
        } catch (h) {
          const hata = hataya(h);
          this.hataYaz(m, hata);
          return { motor: m, sonuclar: [] as MotorSonucu[], hata: hata.message };
        }
      }),
    );
    const birlesik = sonuclariBirlestir(sonuclar.filter((s) => !s.hata));
    return {
      sorgu: i.sorgu,
      kategori: i.kategori,
      sayfa: i.sayfa,
      dil: i.dil,
      sonuclar: birlesik.slice(0, SONUC_SINIRI),
      yanitVerenler: sonuclar.filter((s) => !s.hata).map((s) => s.motor.kimlik),
      hatalar: sonuclar.filter((s) => s.hata).map((s) => ({ motor: s.motor.kimlik, hata: s.hata! })),
      askidakiler,
      sureMs: Math.round(this.simdi() - bas),
      onbellekten: false,
    };
  }

  private basariYaz(m: Motor): void {
    const k = this.kayit(m.kimlik);
    k.ardisikHata = 0;
    k.askiBitis = 0;
    k.basari++;
    k.sonBasari = this.simdi();
  }

  private hataYaz(m: Motor, h: MotorHatasi): void {
    const k = this.kayit(m.kimlik);
    const simdi = this.simdi();
    k.hata++;
    k.sonHata = h.message;
    k.sonHataZamani = simdi;
    if (h.tur === "cozumleme") return;
    k.ardisikHata++;
    const sure = askiSuresi(h.tur, k.ardisikHata);
    if (sure > 0) k.askiBitis = simdi + sure;
  }

  /** Motorların anlık durumu (Stüdyo'daki motor listesi) */
  durum(): WebMotorDurumu[] {
    const ayar = this.b.ayarlar();
    const kapali = new Set(ayar.kapaliMotorlar);
    const simdi = this.simdi();
    const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);
    return this.motorlar().map((m) => {
      const k = this.kayit(m.kimlik);
      const askida = k.askiBitis > simdi;
      return {
        kimlik: m.kimlik,
        ad: m.ad,
        tur: m.tur,
        kategoriler: [...m.kategoriler],
        etkin: !kapali.has(m.kimlik) && (m.kimlik !== "searxng" || !!ayar.searxngAdresi),
        askida,
        askiBitis: askida ? iso(k.askiBitis) : null,
        sonHata: k.sonHata,
        sonHataZamani: iso(k.sonHataZamani),
        sonBasari: iso(k.sonBasari),
        basari: k.basari,
        hata: k.hata,
      };
    });
  }

  get onbellekBoyutu(): number {
    return this.onbellek.size;
  }

  /** Askıları kaldırır (ayar değişince ya da kurul elle denemek isteyince) */
  askilariKaldir(): void {
    for (const k of this.kayitlar.values()) {
      k.askiBitis = 0;
      k.ardisikHata = 0;
    }
  }
}

/** Motor sözünü süreyle sınırlar (gh gibi getirici dışı yollar için de) */
function sureSinirli<T>(soz: Promise<T>, ms: number, ad: string): Promise<T> {
  let zamanlayici: NodeJS.Timeout | undefined;
  const sure = new Promise<never>((_, red) => {
    zamanlayici = setTimeout(() => red(new MotorHatasi("zaman_asimi", iki(`${ad} ${Math.round(ms / 1000)} sn içinde yanıt vermedi`, `${ad} did not answer within ${Math.round(ms / 1000)} s`))), ms);
    zamanlayici.unref?.();
  });
  return Promise.race([soz, sure]).finally(() => clearTimeout(zamanlayici));
}

/** Her hatayı motor hatasına çevirir */
function hataya(h: unknown): MotorHatasi {
  if (h instanceof MotorHatasi) return h;
  if (h instanceof AgHatasi) return new MotorHatasi(h.tur, h.message);
  return new MotorHatasi("cozumleme", (h as Error)?.message ?? String(h));
}
