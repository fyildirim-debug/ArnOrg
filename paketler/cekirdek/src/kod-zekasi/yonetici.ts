// Kod zekâsı yöneticisi: çalışma alanlarını (ana repo ve ajan worktree'leri) tarar, sembol ve parçalara ayırır,
// parçaların vektörlerini hesaplar; hibrit arama (anlamsal + anahtar sözcük + sembol adı, Reciprocal Rank Fusion),
// harita, bağımlılık ve grafik sorgularını yanıtlar. Proje başına tek dizinleme işi çalışır; değişen dosyalar birkaç
// saniye gecikmeyle artımlı işlenir. Ajan worktree'leri ilk sorguda dizinlenir; gömmeler metin özetiyle paylaşıldığı
// için ana repoyla aynı olan parçalar yeniden gömülmez.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type {
  KodAramaSonucu,
  KodAramaYaniti,
  KodBagimliliklari,
  KodDizinDurumu,
  KodEslesmeTuru,
  KodGrafigi,
  KodHaritaDugumu,
  KodSembolTuru,
  KodSembolu,
  KodZekasiModelBilgisi,
  KodZekasiModeli,
  SunucuOlayi,
} from "@arnorg/ortak";
import { iki } from "../dil.js";
import { git, repoMu } from "../git.js";
import { dosyaListesi, yolSuzgeci } from "../kod-arama.js";
import { varsayilanKurallar } from "../politika.js";
import { ArnorgHatasi, bekle, simdi } from "../yardimci.js";
import { IceAktarmaCozucu, goModulu, paketBilgisi, type PaketBilgisi } from "./cozucu.js";
import { KodDeposu, blobVektor, type DosyaKaydi, type DosyaYazimi, type ParcaKaydi } from "./depo.js";
import { dilTani } from "./diller.js";
import { gomucuOlustur, modelBilgileri, type Gomucu } from "./gomucu.js";
import { grafikKur, haritaAgaci, haritaMetni } from "./harita.js";
import { aramaMetniOlustur, kesitSec, ozet, sorguTerimleri, tanimlayiciParcalari } from "./metin.js";
import { gommeMetni, parcala } from "./parcalayici.js";
import { cozumle } from "./semboller.js";

/** Bir alanda dizinlenen en çok dosya */
const EN_COK_DOSYA = 25_000;
/** Tarama partisi: bu kadar dosya ya da metin birikince veritabanına yazılır */
const PARTI_DOSYA = 40;
const PARTI_KARAKTER = 1_500_000;
/** Bu kadar dosyada bir olay döngüsüne nefes verilir (değişmeyen dosyalar yalnız stat ile geçilir) */
const NEFES_DOSYA = 50;
/** Değişen dosyalar bu gecikmeyle toplanıp işlenir */
const ARTIMLI_GECIKME_MS = 3000;
/** Bundan çok değişiklik birikince tek tek bakmak yerine alan yeniden taranır (değişmeyenler mtime ile atlanır) */
const ARTIMLI_SINIR = 400;
/** Durum olayı alan başına en çok saniyede iki kez */
const YAYIN_ARALIGI_MS = 500;
/** Hiç dizinlenmemiş alanda sorgu, taramanın bitmesini en çok bu kadar bekler */
const TARAMA_BEKLEME_MS = 20_000;
/** Sorgu vektörü bu sürede gelmezse yalnız anahtar sözcükle aranır */
const SORGU_ZAMAN_ASIMI_MS = 8000;
/** Reciprocal Rank Fusion sabiti */
const RRF_K = 60;
/** Her yöntemden birleştirmeye giren aday sayısı */
const ADAY = 80;
/** Gömme sürerken yoğun matris en çok bu sıklıkla yeniden kurulur */
const MATRIS_TAZELEME_MS = 5000;
/** Proje başına bellekte tutulan yoğun matris (alan × model) */
const EN_COK_MATRIS = 3;
/** Bir dosyadan sonuç listesine giren en çok parça */
const DOSYA_BASINA_SONUC = 3;

const GIZLI_DESENLER = (varsayilanKurallar().find((k) => k.id === "gizli-dosya")?.desenler ?? []).flatMap((d) => {
  try {
    return [new RegExp(d, "i")];
  } catch {
    return [];
  }
});

/** Ortam dosyası, özel anahtar ve kimlik bilgisi gibi gizli dosyalar dizine girmez (politikadaki "Gizli dosyalar" kuralı) */
export function gizliDosyaMi(yol: string): boolean {
  return GIZLI_DESENLER.some((r) => r.test(yol));
}

/** İlk 8 KB'ta NUL baytı olan dosya ikili sayılır */
function ikiliMi(b: Buffer): boolean {
  return b.subarray(0, 8192).includes(0);
}

function satirSayisi(metin: string): number {
  if (!metin) return 0;
  let n = 1;
  for (let i = 0; i < metin.length; i++) if (metin.charCodeAt(i) === 10) n++;
  return metin.endsWith("\n") ? n - 1 : n;
}

function hataMetni(h: unknown): string {
  return h instanceof Error ? h.message : String(h);
}

const nefes = () => new Promise<void>((coz) => setImmediate(coz));

function zamanAsimi<T>(is: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((coz, reddet) => {
    const z = setTimeout(() => reddet(new Error(iki("zaman aşımı", "timed out"))), ms);
    is.then(
      (d) => {
        clearTimeout(z);
        coz(d);
      },
      (h) => {
        clearTimeout(z);
        reddet(h);
      },
    );
  });
}

export interface KodZekasiBaglami {
  veriDizini: string;
  /** kod.dizin olaylarının gideceği yer */
  yayinla(o: SunucuOlayi): void;
  /** Alanın kök klasörü ("ana" ya da ajan kimliği); alan yoksa hata fırlatır */
  alanYolu(projeId: string, alan: string): string;
  /** Otomatik dizinleme için projeler */
  projeler(): { id: string; yol: string }[];
  ayarlar(): { kodZekasiModeli: KodZekasiModeli; kodZekasiOtomatik: boolean };
  /** Testler: gömücü fabrikası (varsayılan ayara göre gerçek model; ARNORG_GOMME=sahte ile sahte) */
  gomucuOlustur?: (secim: KodZekasiModeli) => Gomucu | null;
  /** Testler: artımlı güncelleme gecikmesi */
  artimliGecikmeMs?: number;
}

interface Is {
  alan: string;
  /** null: tam tarama */
  yollar: Set<string> | null;
  sifirdan: boolean;
  iptal: boolean;
  bitti: Promise<void>;
  tarandi: Promise<void>;
  bitir: () => void;
  taramaBitir: () => void;
}

interface AlanDurumu {
  durum: KodDizinDurumu;
  /** Bu süreçte tam taraması yapıldı mı (kapalıyken olan değişiklikler yakalandı mı) */
  taze: boolean;
  sonYayin: number;
  yayinZamanlayici: NodeJS.Timeout | null;
  bekleyenYollar: Set<string>;
  bekleyenZamanlayici: NodeJS.Timeout | null;
  /** Paket ve Go modülü bilgisi (içe aktarma çözümü için); tam taramada yenilenir */
  paketler: Map<string, PaketBilgisi> | null;
  goModulleri: Map<string, string> | null;
}

interface YogunMatris {
  boyut: number;
  idler: number[];
  yollar: string[];
  veri: Float32Array;
  surum: number;
  kurulma: number;
}

interface ProjeKaydi {
  id: string;
  depo: KodDeposu;
  kuyruk: Is[];
  suren: Is | null;
  alanlar: Map<string, AlanDurumu>;
  /** "alan\0model" → matris (en son kullanılan sonda) */
  matrisler: Map<string, YogunMatris>;
  /** Parça ya da gömme her değiştiğinde artar; yoğun matris buna göre tazelenir */
  surum: number;
}

type Liste = {
  tur: Exclude<KodEslesmeTuru, "karma">;
  agirlik: number;
  idler: number[];
  /** Sembol listesinde: parçada eşleşen sembol (parça birden çok küçük tanımı birleştirmiş olabilir) */
  semboller?: Map<number, { ad: string; tur: KodSembolTuru }>;
};

function yeniIs(alan: string, yollar: Set<string> | null, sifirdan: boolean): Is {
  let bitir!: () => void;
  let taramaBitir!: () => void;
  const bitti = new Promise<void>((coz) => (bitir = coz));
  const tarandi = new Promise<void>((coz) => (taramaBitir = coz));
  return { alan, yollar, sifirdan, iptal: false, bitti, tarandi, bitir, taramaBitir };
}

/** Matristeki satırların sorgu vektörüne benzerliği; en benzer k satır */
export function enYakinlar(veri: Float32Array, boyut: number, q: Float32Array, k: number, uygun?: (i: number) => boolean): { i: number; benzerlik: number }[] {
  const n = Math.floor(veri.length / boyut);
  if (q.length !== boyut) return [];
  const adaylar: { i: number; benzerlik: number }[] = [];
  for (let r = 0; r < n; r++) {
    if (uygun && !uygun(r)) continue;
    let s = 0;
    const o = r * boyut;
    for (let j = 0; j < boyut; j++) s += veri[o + j]! * q[j]!;
    adaylar.push({ i: r, benzerlik: s });
  }
  adaylar.sort((a, b) => b.benzerlik - a.benzerlik);
  return adaylar.slice(0, k);
}

export class KodZekasi {
  private readonly projelerHaritasi = new Map<string, ProjeKaydi>();
  private gomucuSecimi: KodZekasiModeli | null = null;
  private gomucuNesnesi: Gomucu | null = null;
  private basladi = false;
  private kapandi = false;
  private readonly zamanlayicilar = new Set<NodeJS.Timeout>();

  constructor(private readonly b: KodZekasiBaglami) {}

  // ===================================================================
  // Yaşam döngüsü
  // ===================================================================

  /** Sunucu açılınca: otomatik dizinleme açıksa projelerin ana reposu arka planda (sırayla) dizinlenir */
  baslat(): void {
    this.basladi = true;
    if (!this.b.ayarlar().kodZekasiOtomatik) return;
    let gecikme = 1500;
    for (const p of this.b.projeler()) {
      if (!fs.existsSync(p.yol)) continue;
      this.zamanla(() => {
        if (!this.kapandi) this.isEkle(p.id, "ana");
      }, gecikme);
      gecikme += 750;
    }
  }

  /** Ayarlar değişti: model değiştiyse süren gömmeler yeni modelle sürer; otomatik açıldıysa projeler dizinlenir */
  ayarlarDegisti(): void {
    const { kodZekasiModeli, kodZekasiOtomatik } = this.b.ayarlar();
    if (this.gomucuSecimi !== null && kodZekasiModeli !== this.gomucuSecimi) {
      for (const p of this.projelerHaritasi.values()) {
        if (p.suren) p.suren.iptal = true;
        p.matrisler.clear();
      }
      const g = this.gomucu();
      for (const p of this.projelerHaritasi.values()) {
        for (const [alan, a] of p.alanlar) {
          a.durum.model = g?.anahtar ?? null;
          this.sayilariGuncelle(p, alan, a);
          this.yayinla(p.id, a);
          if (a.durum.dosya > 0) this.isEkle(p.id, alan);
        }
      }
    }
    if (this.basladi && kodZekasiOtomatik) {
      for (const p of this.b.projeler()) if (fs.existsSync(p.yol) && !this.projelerHaritasi.get(p.id)?.alanlar.get("ana")?.taze) this.isEkle(p.id, "ana");
    }
  }

  /** Çekirdek olayları: dosya değişikliği artımlı güncelleme başlatır, silinen ajanın alanı dizinden çıkar */
  olay(o: SunucuOlayi): void {
    if (this.kapandi) return;
    if (o.tur === "dosya.degisti") this.dosyaDegisti(o.projeId, o.alan, o.yol);
    else if (o.tur === "ajan.silindi") this.alanKaldir(o.projeId, o.ajanId);
    else if (o.tur === "proje.guncellendi" && this.basladi && !this.projelerHaritasi.has(o.proje.id) && this.b.ayarlar().kodZekasiOtomatik && fs.existsSync(o.proje.yol)) {
      // Yeni açılan proje
      this.isEkle(o.proje.id, "ana");
    }
  }

  async kapat(): Promise<void> {
    this.kapandi = true;
    for (const z of this.zamanlayicilar) clearTimeout(z);
    this.zamanlayicilar.clear();
    const bekleyenler: Promise<void>[] = [];
    for (const p of this.projelerHaritasi.values()) {
      for (const is of p.kuyruk) is.iptal = true;
      p.kuyruk = [];
      if (p.suren) {
        p.suren.iptal = true;
        bekleyenler.push(p.suren.bitti);
      }
      for (const a of p.alanlar.values()) this.alanZamanlayicilariniTemizle(a);
    }
    await this.gomucuNesnesi?.kapat().catch(() => undefined);
    await Promise.race([Promise.all(bekleyenler), bekle(3000)]);
    for (const p of this.projelerHaritasi.values()) p.depo.kapat();
    this.projelerHaritasi.clear();
  }

  /** Proje ArnOrg'dan çıkarıldı: dizin dosyası silinir */
  projeKaldir(projeId: string): void {
    const p = this.projelerHaritasi.get(projeId);
    const dosya = this.dizinDosyasi(projeId);
    if (p) {
      for (const is of p.kuyruk) is.iptal = true;
      p.kuyruk = [];
      if (p.suren) p.suren.iptal = true;
      for (const a of p.alanlar.values()) this.alanZamanlayicilariniTemizle(a);
      this.projelerHaritasi.delete(projeId);
      const kapat = () => {
        p.depo.kapat();
        KodDeposu.dosyalariSil(dosya);
      };
      if (p.suren) void p.suren.bitti.then(kapat);
      else kapat();
    } else if (fs.existsSync(dosya)) KodDeposu.dosyalariSil(dosya);
  }

  /** Ajan silindi: çalışma alanının kayıtları dizinden çıkar (paylaşılan gömmeler kalır) */
  alanKaldir(projeId: string, alan: string): void {
    if (alan === "ana") return;
    const p = this.projelerHaritasi.get(projeId) ?? (fs.existsSync(this.dizinDosyasi(projeId)) ? this.proje(projeId) : null);
    if (!p) return;
    for (const is of p.kuyruk) if (is.alan === alan) is.iptal = true;
    p.kuyruk = p.kuyruk.filter((x) => x.alan !== alan);
    const a = p.alanlar.get(alan);
    if (a) this.alanZamanlayicilariniTemizle(a);
    p.alanlar.delete(alan);
    for (const k of [...p.matrisler.keys()]) if (k.startsWith(`${alan}\u0000`)) p.matrisler.delete(k);
    const sil = () => {
      p.depo.alaniSil(alan);
      p.depo.sahipsizGommeleriSil();
      p.surum++;
    };
    if (p.suren?.alan === alan) {
      p.suren.iptal = true;
      void p.suren.bitti.then(sil);
    } else sil();
  }

  // ===================================================================
  // Durum ve dizinleme
  // ===================================================================

  /** Alanın dizin durumu (dizinlenmemiş alanda "bos") */
  durum(projeId: string, alan = "ana"): KodDizinDurumu {
    this.b.alanYolu(projeId, alan);
    const p = this.proje(projeId);
    return { ...this.alanDurumu(p, alan).durum };
  }

  /** Projenin bilinen tüm alanlarının durumu ("ana" her zaman ilk) */
  durumlar(projeId: string): KodDizinDurumu[] {
    this.b.alanYolu(projeId, "ana");
    const p = this.proje(projeId);
    const alanlar = new Set(["ana", ...p.depo.alanlar(), ...p.alanlar.keys()]);
    const sonuc: KodDizinDurumu[] = [];
    for (const alan of alanlar) {
      try {
        this.b.alanYolu(projeId, alan);
      } catch {
        // Ajan silinmiş: kayıtları dizinden çıkar
        this.alanKaldir(projeId, alan);
        continue;
      }
      sonuc.push({ ...this.alanDurumu(p, alan).durum });
    }
    return sonuc;
  }

  /** Alanı dizinler (sıfırdan ya da değişenleri); iş bitince son durumla çözülür */
  async dizinle(projeId: string, alan = "ana", s: { sifirdan?: boolean } = {}): Promise<KodDizinDurumu> {
    this.b.alanYolu(projeId, alan);
    const is = this.isEkle(projeId, alan, { sifirdan: s.sifirdan });
    await is.bitti;
    return this.durum(projeId, alan);
  }

  /** Testler ve kapanış: projede süren, bekleyen ya da gecikmeli iş kalmayana kadar bekler */
  async bosta(projeId: string): Promise<void> {
    const p = this.projelerHaritasi.get(projeId);
    if (!p) return;
    for (;;) {
      if (p.suren) await p.suren.bitti;
      else if (p.kuyruk.length) await p.kuyruk[p.kuyruk.length - 1]!.bitti;
      else if ([...p.alanlar.values()].some((a) => a.bekleyenZamanlayici)) await bekle(20);
      else return;
    }
  }

  /** Ayarlar ekranı için modellerin indirilme durumu */
  modeller(): KodZekasiModelBilgisi[] {
    return modelBilgileri(this.b.veriDizini);
  }

  /** Değişen dosyayı artımlı güncelleme kuyruğuna alır (yalnız dizinlenmiş alanlarda) */
  dosyaDegisti(projeId: string, alan: string, yol: string): void {
    if (this.kapandi || !/^[\w-]+$/.test(projeId)) return;
    let p = this.projelerHaritasi.get(projeId);
    if (!p) {
      if (!fs.existsSync(this.dizinDosyasi(projeId))) return;
      p = this.proje(projeId);
    }
    const a = this.alanDurumu(p, alan);
    if (a.durum.durum === "bos" && !this.isVar(p, alan)) return;
    const temiz = yol.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
    if (!temiz || temiz.startsWith("..") || temiz.split("/").some((x) => x === ".git")) return;
    a.bekleyenYollar.add(temiz);
    if (a.bekleyenZamanlayici) clearTimeout(a.bekleyenZamanlayici);
    a.bekleyenZamanlayici = setTimeout(() => {
      a.bekleyenZamanlayici = null;
      const yollar = [...a.bekleyenYollar];
      a.bekleyenYollar.clear();
      if (this.kapandi || !this.projelerHaritasi.has(projeId)) return;
      try {
        this.isEkle(projeId, alan, { yollar: yollar.length > ARTIMLI_SINIR ? null : yollar });
      } catch {
        // proje ya da alan kaldırılmış
      }
    }, this.b.artimliGecikmeMs ?? ARTIMLI_GECIKME_MS);
    a.bekleyenZamanlayici.unref?.();
  }

  // ===================================================================
  // Sorgular
  // ===================================================================

  /** Köke göre / ayraçlı yol: mutlak yol alanın içindeyse göreliye çevrilir */
  goreliYol(projeId: string, alan: string, yol: string): string {
    let y = yol.trim();
    if (path.isAbsolute(y)) {
      const kok = this.b.alanYolu(projeId, alan);
      const fark = path.relative(kok, y);
      if (!fark.startsWith("..") && !path.isAbsolute(fark)) y = fark;
    }
    return y.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  }

  /** Hibrit kod araması: anlamsal (gömme), anahtar sözcük (FTS5 bm25) ve sembol adı, RRF ile birleşir */
  async ara(projeId: string, alan: string, sorgu: string, s: { sinir?: number; yol?: string; zamanAsimiMs?: number; bekleMs?: number } = {}): Promise<KodAramaYaniti> {
    const baslangic = performance.now();
    const { p, a } = await this.hazirla(projeId, alan, s.bekleMs ?? TARAMA_BEKLEME_MS);
    const sinir = Math.min(Math.max(1, Math.floor(s.sinir ?? 10)), 50);
    const suzgec = s.yol?.trim() ? yolSuzgeci([this.goreliYol(projeId, alan, s.yol)]) : null;
    const t = sorguTerimleri(sorgu);
    const listeler: Liste[] = [];
    if (t.ifade) {
      const fts = p.depo.ftsAra(alan, t.ifade, suzgec ? ADAY * 5 : ADAY).filter((x) => !suzgec || suzgec(x.yol));
      if (fts.length) listeler.push({ tur: "sozcuk", agirlik: 1, idler: fts.slice(0, ADAY).map((x) => x.id) });
    }
    const semboller = this.sembolParcalari(p, alan, t.adlar, suzgec);
    if (semboller.idler.length) listeler.push({ tur: "sembol", agirlik: 0.8, idler: semboller.idler, semboller: semboller.eslesen });
    let yalnizSozcuk = true;
    const g = sorgu.trim() ? this.gomucu() : null;
    if (g) {
      const m = this.matris(p, alan, g);
      if (m) {
        try {
          const [q] = await zamanAsimi(g.gom([sorgu.trim()], "sorgu"), s.zamanAsimiMs ?? SORGU_ZAMAN_ASIMI_MS);
          const yakin = enYakinlar(m.veri, m.boyut, q!, ADAY, suzgec ? (i) => suzgec(m.yollar[i]!) : undefined);
          if (yakin.length) {
            listeler.push({ tur: "anlamsal", agirlik: 1, idler: yakin.map((x) => m.idler[x.i]!) });
            yalnizSozcuk = false;
          }
        } catch {
          // zaman aşımı ya da model hatası: anahtar sözcükle sürer
        }
      }
    }
    const sonuclar = this.sonuclariKur(projeId, p, alan, listeler, sinir, t.terimler);
    return { sonuclar, durum: { ...a.durum }, yalnizSozcuk, sureMs: Math.round(performance.now() - baslangic) };
  }

  /** Verilen satırı içeren parçaya en çok benzeyen parçalar (tekrar eden kodu bulmak için) */
  async benzer(projeId: string, alan: string, yol: string, satir: number, sinir = 8): Promise<KodAramaYaniti> {
    const baslangic = performance.now();
    const { p, a } = await this.hazirla(projeId, alan, TARAMA_BEKLEME_MS);
    const temiz = this.goreliYol(projeId, alan, yol);
    const parca = p.depo.satirdakiParcalar(alan, temiz, Math.max(1, Math.floor(satir)))[0];
    if (!parca)
      throw new ArnorgHatasi(
        iki(
          `${temiz}:${satir} dizinde yok. Yol çalışma alanının köküne göre olmalı (ör. src/app.ts) ve dosya dizinlenmiş olmalı.`,
          `${temiz}:${satir} is not in the index. The path must be relative to the workspace root (e.g. src/app.ts) and the file must be indexed.`,
        ),
        404,
      );
    const kendisi = (x: ParcaKaydi) => x.yol === parca.yol && x.bas <= parca.bit && x.bit >= parca.bas;
    const n = Math.min(Math.max(1, Math.floor(sinir)), 30);
    // Parçanın en sık tanımlayıcı parçaları: anahtar sözcük yedeği ve kesit seçimi için
    const sayac = new Map<string, number>();
    for (const x of tanimlayiciParcalari(parca.metin, 400)) if (x.length >= 3) sayac.set(x, (sayac.get(x) ?? 0) + 1);
    const terimler = [...sayac].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([x]) => x);
    let liste: Liste | null = null;
    const g = this.gomucu();
    if (g) {
      const v = p.depo.vektor(parca.metinHash, g.anahtar);
      const m = v ? this.matris(p, alan, g) : null;
      if (v && m) {
        const yakin = enYakinlar(m.veri, m.boyut, v, n * 3 + 10);
        liste = { tur: "anlamsal", agirlik: 1, idler: yakin.map((x) => m.idler[x.i]!) };
      }
    }
    if (!liste) {
      const ifade = terimler.length ? terimler.map((x) => `"${x}"*`).join(" OR ") : null;
      if (ifade) liste = { tur: "sozcuk", agirlik: 1, idler: p.depo.ftsAra(alan, ifade, n * 3 + 10).map((x) => x.id) };
    }
    const adaylar = liste ? p.depo.parcalar(liste.idler) : new Map<number, ParcaKaydi>();
    if (liste) liste.idler = liste.idler.filter((id) => adaylar.has(id) && !kendisi(adaylar.get(id)!));
    const sonuclar = this.sonuclariKur(projeId, p, alan, liste ? [liste] : [], n, terimler);
    return { sonuclar, durum: { ...a.durum }, yalnizSozcuk: liste?.tur !== "anlamsal", sureMs: Math.round(performance.now() - baslangic) };
  }

  /** Sembol araması: tam ad, önek, içerme; sorgu boşsa öne çıkan semboller */
  async semboller(projeId: string, alan: string, q: string, s: { tur?: KodSembolTuru; sinir?: number } = {}): Promise<KodSembolu[]> {
    const { p } = await this.hazirla(projeId, alan, TARAMA_BEKLEME_MS);
    const sinir = Math.min(Math.max(1, Math.floor(s.sinir ?? 50)), 500);
    const kayitlar = q.trim() ? p.depo.sembolAra(alan, q.trim(), { tur: s.tur, sinir }) : p.depo.oneCikanSemboller(alan, { tur: s.tur, sinir });
    return kayitlar.map((k) => ({ ad: k.ad, tur: k.tur, yol: k.yol, bas: k.bas, bit: k.bit, disaAcik: k.disaAcik, ust: k.ust, imza: k.imza }));
  }

  /** Klasör ağacı: dil, satır, öne çıkan semboller; yol verilirse o klasörün alt ağacı */
  async harita(projeId: string, alan: string, yol = ""): Promise<KodHaritaDugumu> {
    const { p } = await this.hazirla(projeId, alan, TARAMA_BEKLEME_MS);
    const kok = yol ? this.goreliYol(projeId, alan, yol) : "";
    const dosyalar = p.depo.dosyalar(alan);
    // Çok büyük depoda sembolsüz ağaç (yanıt boyutu)
    const semboller = dosyalar.length > 4000 && !kok ? [] : p.depo.tumSemboller(alan);
    return haritaAgaci(dosyalar, semboller, p.depo.tumIceAktarmalar(alan), kok);
  }

  /** Ajanlar için karakter sınırlı metin haritası (önemli dosyalar ve sembolleri önce) */
  async haritaMetni(projeId: string, alan: string, s: { yol?: string; sinir?: number } = {}): Promise<string> {
    const { p } = await this.hazirla(projeId, alan, TARAMA_BEKLEME_MS);
    const yol = s.yol ? this.goreliYol(projeId, alan, s.yol) : "";
    return haritaMetni(p.depo.dosyalar(alan), p.depo.tumSemboller(alan), p.depo.tumIceAktarmalar(alan), { yol, sinir: s.sinir ?? 4000 });
  }

  /** Dosyanın içe aktardıkları ve onu içe aktaranlar */
  async bagimliliklar(projeId: string, alan: string, yol: string): Promise<KodBagimliliklari> {
    const { p } = await this.hazirla(projeId, alan, TARAMA_BEKLEME_MS);
    const temiz = this.goreliYol(projeId, alan, yol);
    if (!p.depo.dosya(alan, temiz))
      throw new ArnorgHatasi(iki(`${temiz} dizinde yok. Yol çalışma alanının köküne göre olmalı (ör. src/app.ts).`, `${temiz} is not in the index. The path must be relative to the workspace root (e.g. src/app.ts).`), 404);
    const iceAktaranlar = p.depo.iceAktaranlar(alan, temiz);
    // Go içe aktarmaları klasöre çözülür
    if (temiz.endsWith(".go")) iceAktaranlar.push(...p.depo.iceAktaranlar(alan, path.posix.dirname(temiz)).filter((i) => i.yol !== temiz && path.posix.dirname(i.yol) !== path.posix.dirname(temiz)));
    return {
      yol: temiz,
      iceAktardiklari: p.depo.iceAktardiklari(alan, temiz).map((i) => ({ yol: i.hedef, kaynak: i.kaynak, satir: i.satir, adlar: i.adlar })),
      iceAktaranlar: iceAktaranlar.map((i) => ({ yol: i.yol, satir: i.satir, adlar: i.adlar })),
    };
  }

  /** Modül bağımlılık grafiği (klasör ya da dosya düzeyinde) */
  async grafik(projeId: string, alan: string, duzey: "klasor" | "dosya" = "klasor"): Promise<KodGrafigi> {
    const { p } = await this.hazirla(projeId, alan, TARAMA_BEKLEME_MS);
    return grafikKur(p.depo.dosyalar(alan), p.depo.tumIceAktarmalar(alan), duzey);
  }

  /** Dizin hazırsa (ya da kısmen hazırsa) kısa sürede arama yapılabilir mi */
  hazirMi(projeId: string, alan: string): boolean {
    const p = this.projelerHaritasi.get(projeId) ?? (fs.existsSync(this.dizinDosyasi(projeId)) ? this.proje(projeId) : null);
    if (!p) return false;
    const a = this.alanDurumu(p, alan);
    return a.durum.dosya > 0 && a.durum.durum !== "taraniyor";
  }

  // ===================================================================
  // İç işler
  // ===================================================================

  private dizinDosyasi(projeId: string): string {
    return path.join(this.b.veriDizini, "kod-dizini", `${projeId}.db`);
  }

  private zamanla(f: () => void, ms: number): void {
    const z = setTimeout(() => {
      this.zamanlayicilar.delete(z);
      f();
    }, ms);
    z.unref?.();
    this.zamanlayicilar.add(z);
  }

  private proje(projeId: string): ProjeKaydi {
    let p = this.projelerHaritasi.get(projeId);
    if (p) return p;
    if (!/^[\w-]+$/.test(projeId)) throw new ArnorgHatasi(iki("Geçersiz proje kimliği.", "Invalid project id."), 400);
    p = { id: projeId, depo: new KodDeposu(this.dizinDosyasi(projeId)), kuyruk: [], suren: null, alanlar: new Map(), matrisler: new Map(), surum: 0 };
    this.projelerHaritasi.set(projeId, p);
    return p;
  }

  /** Ayara göre gömücü; model değişince eskisi kapatılır */
  private gomucu(): Gomucu | null {
    const secim = this.b.ayarlar().kodZekasiModeli;
    if (secim !== this.gomucuSecimi) {
      const eski = this.gomucuNesnesi;
      if (eski) void eski.kapat().catch(() => undefined);
      this.gomucuNesnesi = (this.b.gomucuOlustur ?? ((x: KodZekasiModeli) => gomucuOlustur(x, this.b.veriDizini)))(secim);
      this.gomucuSecimi = secim;
    }
    return this.gomucuNesnesi;
  }

  private alanDurumu(p: ProjeKaydi, alan: string): AlanDurumu {
    let a = p.alanlar.get(alan);
    if (a) return a;
    const g = this.gomucu();
    const s = p.depo.sayilar(alan);
    a = {
      durum: {
        alan,
        durum: s.dosya > 0 ? "hazir" : "bos",
        ...s,
        gomulen: g && s.parca ? p.depo.gomuluParcaSayisi(alan, g.anahtar) : 0,
        toplamParca: s.parca,
        model: g?.anahtar ?? null,
        indirmeYuzde: null,
        sonGuncelleme: p.depo.metaOku(`son:${alan}`),
        hata: null,
      },
      taze: false,
      sonYayin: 0,
      yayinZamanlayici: null,
      bekleyenYollar: new Set(),
      bekleyenZamanlayici: null,
      paketler: null,
      goModulleri: null,
    };
    p.alanlar.set(alan, a);
    return a;
  }

  private alanZamanlayicilariniTemizle(a: AlanDurumu): void {
    if (a.yayinZamanlayici) clearTimeout(a.yayinZamanlayici);
    if (a.bekleyenZamanlayici) clearTimeout(a.bekleyenZamanlayici);
    a.yayinZamanlayici = null;
    a.bekleyenZamanlayici = null;
    a.bekleyenYollar.clear();
  }

  private sayilariGuncelle(p: ProjeKaydi, alan: string, a: AlanDurumu): void {
    const s = p.depo.sayilar(alan);
    a.durum.dosya = s.dosya;
    a.durum.sembol = s.sembol;
    a.durum.parca = s.parca;
    a.durum.toplamParca = s.parca;
    const g = this.gomucuNesnesi;
    a.durum.gomulen = g && a.durum.model === g.anahtar && s.parca ? p.depo.gomuluParcaSayisi(alan, g.anahtar) : 0;
  }

  /** Durum olayı: alan başına en çok saniyede iki kez; son durum her zaman gönderilir */
  private yayinla(projeId: string, a: AlanDurumu): void {
    if (this.kapandi) return;
    const gonder = () => {
      a.yayinZamanlayici = null;
      a.sonYayin = Date.now();
      if (!this.projelerHaritasi.has(projeId)) return;
      this.b.yayinla({ tur: "kod.dizin", projeId, durum: { ...a.durum } });
    };
    const gecen = Date.now() - a.sonYayin;
    if (gecen >= YAYIN_ARALIGI_MS && !a.yayinZamanlayici) {
      gonder();
      return;
    }
    if (!a.yayinZamanlayici) {
      a.yayinZamanlayici = setTimeout(gonder, Math.max(0, YAYIN_ARALIGI_MS - gecen));
      a.yayinZamanlayici.unref?.();
    }
  }

  private isVar(p: ProjeKaydi, alan: string): boolean {
    return p.suren?.alan === alan || p.kuyruk.some((x) => x.alan === alan);
  }

  /** İş kuyruğu: aynı alanın bekleyen işleriyle birleşir; proje başına bir iş çalışır */
  private isEkle(projeId: string, alan: string, s: { yollar?: string[] | null; sifirdan?: boolean } = {}): Is {
    const p = this.proje(projeId);
    const yollar = s.yollar ? new Set(s.yollar) : null;
    const bekleyen = p.kuyruk.find((x) => x.alan === alan && !x.iptal);
    if (bekleyen) {
      if (!yollar) bekleyen.yollar = null;
      else if (bekleyen.yollar) for (const y of yollar) bekleyen.yollar.add(y);
      bekleyen.sifirdan ||= Boolean(s.sifirdan);
      return bekleyen;
    }
    if (p.suren && p.suren.alan === alan && !p.suren.iptal) {
      // Süren tam tarama aynı işi zaten yapıyor
      if (!p.suren.yollar && !yollar && !s.sifirdan) return p.suren;
      if (s.sifirdan) p.suren.iptal = true;
    }
    const is = yeniIs(alan, yollar, Boolean(s.sifirdan));
    p.kuyruk.push(is);
    setImmediate(() => this.pompala(p));
    return is;
  }

  private pompala(p: ProjeKaydi): void {
    if (p.suren || this.kapandi || this.projelerHaritasi.get(p.id) !== p) return;
    const is = p.kuyruk.shift();
    if (!is) return;
    p.suren = is;
    void this.calistir(p, is).finally(() => {
      p.suren = null;
      is.taramaBitir();
      is.bitir();
      this.pompala(p);
    });
  }

  private async calistir(p: ProjeKaydi, is: Is): Promise<void> {
    if (is.iptal) return;
    const a = this.alanDurumu(p, is.alan);
    let kok: string;
    try {
      kok = this.b.alanYolu(p.id, is.alan);
    } catch (h) {
      a.durum.durum = "hata";
      a.durum.hata = hataMetni(h);
      this.yayinla(p.id, a);
      return;
    }
    if (!fs.existsSync(kok)) {
      a.durum.durum = "hata";
      a.durum.hata = iki(`Çalışma alanı klasörü bulunamadı: ${kok}`, `Workspace folder not found: ${kok}`);
      this.yayinla(p.id, a);
      return;
    }
    try {
      if (is.sifirdan) {
        p.depo.alaniSil(is.alan);
        p.surum++;
        this.sayilariGuncelle(p, is.alan, a);
      }
      a.durum.durum = "taraniyor";
      a.durum.hata = null;
      this.yayinla(p.id, a);
      await this.tara(p, a, kok, is);
      if (is.iptal) return;
      if (!is.yollar) a.taze = true;
      this.sayilariGuncelle(p, is.alan, a);
      is.taramaBitir();
      await this.gomAlan(p, a, is);
      if (is.iptal) return;
      const zaman = simdi();
      p.depo.metaYaz(`son:${is.alan}`, zaman);
      a.durum.durum = "hazir";
      a.durum.sonGuncelleme = zaman;
      a.durum.indirmeYuzde = null;
    } catch (h) {
      if (is.iptal) return;
      a.durum.durum = "hata";
      a.durum.hata = hataMetni(h);
      a.durum.indirmeYuzde = null;
    } finally {
      if (this.projelerHaritasi.get(p.id) === p && p.alanlar.get(is.alan) === a) {
        delete a.durum.taranan;
        delete a.durum.toplamDosya;
        this.sayilariGuncelle(p, is.alan, a);
        this.yayinla(p.id, a);
      }
    }
  }

  /** Git deposunda yok sayılmayan (izlenen ya da izlenmeyen ama .gitignore dışı) yollar */
  private async gitIzinli(kok: string, yollar: string[]): Promise<Set<string>> {
    const izinli = new Set<string>();
    for (let i = 0; i < yollar.length; i += 100) {
      const parti = yollar.slice(i, i + 100);
      const cikti = await git(kok, ["-c", "core.quotePath=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...parti.map((y) => `:(literal)${y}`)]).catch(() => "");
      for (const y of cikti.split("\0")) if (y) izinli.add(y);
    }
    return izinli;
  }

  /** İçe aktarma çözümü için çalışma alanı paketleri (package.json) ve Go modülleri (go.mod) */
  private async paketBaglami(kok: string, dosyalar: Set<string>, goModlari: string[]): Promise<{ paketler: Map<string, PaketBilgisi>; goModulleri: Map<string, string> }> {
    const paketler = new Map<string, PaketBilgisi>();
    for (const y of dosyalar) {
      if (y !== "package.json" && !y.endsWith("/package.json")) continue;
      const icerik = await fsp.readFile(path.join(kok, y), "utf8").catch(() => null);
      const b = icerik ? paketBilgisi(y, icerik, dosyalar) : null;
      if (b) paketler.set(b.ad, b.bilgi);
    }
    const goModulleri = new Map<string, string>();
    for (const y of goModlari) {
      const icerik = await fsp.readFile(path.join(kok, y), "utf8").catch(() => null);
      const modul = icerik ? goModulu(icerik) : null;
      if (modul) goModulleri.set(modul, path.posix.dirname(y));
    }
    return { paketler, goModulleri };
  }

  /** Dosyaları okur, değişenleri sembol, içe aktarma ve parçalarıyla yazar; silinenleri çıkarır */
  private async tara(p: ProjeKaydi, a: AlanDurumu, kok: string, is: Is): Promise<void> {
    const alan = is.alan;
    const mevcut = is.sifirdan ? new Map<string, DosyaKaydi>() : p.depo.dosyaHaritasi(alan);
    const gitDeposu = await repoMu(kok);
    let adaylar: string[] = [];
    const silinecek = new Set<string>();
    let goModlari: string[] = [];
    let paketDegisti = false;

    if (!is.yollar) {
      const liste = await dosyaListesi(kok);
      goModlari = liste.filter((y) => y === "go.mod" || y.endsWith("/go.mod"));
      adaylar = liste.filter((y) => dilTani(y) && !gizliDosyaMi(y)).slice(0, EN_COK_DOSYA);
      const kume = new Set(adaylar);
      for (const y of mevcut.keys()) if (!kume.has(y)) silinecek.add(y);
      paketDegisti = true;
    } else {
      const istenen = [...is.yollar];
      const uygun = istenen.filter((y) => dilTani(y) && !gizliDosyaMi(y));
      const izinli = gitDeposu ? await this.gitIzinli(kok, uygun) : new Set(uygun);
      for (const y of istenen) {
        const ad = y.slice(y.lastIndexOf("/") + 1);
        if (ad === "package.json" || ad === "go.mod") paketDegisti = true;
        if (izinli.has(y) && fs.existsSync(path.join(kok, y))) {
          adaylar.push(y);
          continue;
        }
        if (mevcut.has(y)) silinecek.add(y);
        // Silinen ya da yok sayılan klasör: altındaki kayıtlar
        const onek = `${y}/`;
        for (const k of mevcut.keys()) if (k.startsWith(onek) && (!fs.existsSync(path.join(kok, k)) || (gitDeposu && !izinli.has(k)))) silinecek.add(k);
      }
      if (paketDegisti || !a.paketler) goModlari = (await dosyaListesi(kok)).filter((y) => y === "go.mod" || y.endsWith("/go.mod"));
    }

    const sonKume = new Set<string>();
    for (const y of mevcut.keys()) if (!silinecek.has(y)) sonKume.add(y);
    for (const y of adaylar) sonKume.add(y);
    const kumeDegisti = silinecek.size > 0 || adaylar.some((y) => !mevcut.has(y));
    if (paketDegisti || !a.paketler) {
      const b = await this.paketBaglami(kok, sonKume, goModlari);
      a.paketler = b.paketler;
      a.goModulleri = b.goModulleri;
    }
    const cozucu = new IceAktarmaCozucu({ dosyalar: sonKume, paketler: a.paketler, goModulleri: a.goModulleri ?? new Map() });

    if (silinecek.size) {
      p.depo.dosyalariSilAlanda(alan, [...silinecek]);
      p.surum++;
    }
    a.durum.toplamDosya = adaylar.length;
    a.durum.taranan = 0;
    let yazimlar: DosyaYazimi[] = [];
    let karakter = 0;
    const yaz = () => {
      if (yazimlar.length) {
        p.depo.dosyalariYaz(alan, yazimlar);
        p.surum++;
      }
      yazimlar = [];
      karakter = 0;
    };
    let taranan = 0;
    for (const yol of adaylar) {
      if (is.iptal) return;
      taranan++;
      const y = await this.dosyaIsle(p, alan, kok, yol, mevcut.get(yol), is.sifirdan, cozucu);
      if (y) {
        yazimlar.push(y);
        karakter += y.parcalar.reduce((t, x) => t + x.metin.length, 0);
      }
      if (yazimlar.length >= PARTI_DOSYA || karakter >= PARTI_KARAKTER) yaz();
      if (taranan % NEFES_DOSYA === 0) {
        yaz();
        a.durum.taranan = taranan;
        this.sayilariGuncelle(p, alan, a);
        this.yayinla(p.id, a);
        await nefes();
      }
    }
    yaz();
    a.durum.taranan = taranan;

    // Dosya kümesi değişince göreli içe aktarmaların hedefleri değişebilir
    if (kumeDegisti || paketDegisti) {
      const degisenler: { yol: string; kaynak: string; satir: number; hedef: string | null }[] = [];
      for (const i of p.depo.tumIceAktarmalar(alan)) {
        const dil = dilTani(i.yol);
        if (!dil) continue;
        const hedef = cozucu.coz({ kaynak: i.kaynak, satir: i.satir, adlar: i.adlar }, i.yol, dil.aile);
        if (hedef !== i.hedef) degisenler.push({ yol: i.yol, kaynak: i.kaynak, satir: i.satir, hedef });
      }
      if (degisenler.length) p.depo.hedefleriYaz(alan, degisenler);
    }
    if (!is.yollar) p.depo.sahipsizGommeleriSil();
  }

  /** Tek dosya: değişmediyse null; değiştiyse yazılacak kayıt */
  private async dosyaIsle(p: ProjeKaydi, alan: string, kok: string, yol: string, eski: DosyaKaydi | undefined, zorla: boolean, cozucu: IceAktarmaCozucu): Promise<DosyaYazimi | null> {
    const dil = dilTani(yol);
    if (!dil) return null;
    const tam = path.join(kok, ...yol.split("/"));
    const sil = () => {
      if (eski) {
        p.depo.dosyalariSilAlanda(alan, [yol]);
        p.surum++;
      }
      return null;
    };
    let st: fs.Stats;
    try {
      st = await fsp.stat(tam);
    } catch {
      return sil();
    }
    if (!st.isFile() || st.size > dil.sinir) return sil();
    const mtime = Math.floor(st.mtimeMs);
    if (!zorla && eski && eski.mtime === mtime && eski.boyut === st.size) return null;
    let tampon: Buffer;
    try {
      tampon = await fsp.readFile(tam);
    } catch {
      return null;
    }
    if (ikiliMi(tampon)) return sil();
    let metin = tampon.toString("utf8");
    if (metin.charCodeAt(0) === 0xfeff) metin = metin.slice(1);
    metin = metin.replace(/\r\n?/g, "\n");
    const hash = ozet(metin);
    if (!zorla && eski && eski.hash === hash) {
      p.depo.mtimeGuncelle(alan, yol, mtime, st.size);
      return null;
    }
    const c = cozumle(metin, dil.aile);
    const parcalar = parcala(metin, c.semboller);
    return {
      dosya: { yol, hash, dil: dil.dil, satir: satirSayisi(metin), boyut: st.size, mtime },
      semboller: c.semboller.map((s) => ({ ad: s.ad, tur: s.tur, bas: s.bas, bit: s.bit, disaAcik: s.disaAcik, ust: s.ust, imza: s.imza })),
      iceAktarmalar: c.iceAktarmalar.map((i) => ({ kaynak: i.kaynak, hedef: cozucu.coz(i, yol, dil.aile), satir: i.satir, adlar: i.adlar })),
      parcalar: parcalar.map((x) => {
        const m = gommeMetni(yol, x);
        return {
          bas: x.bas,
          bit: x.bit,
          sembol: x.sembol,
          sembolTuru: x.sembolTuru,
          metin: m,
          metinHash: ozet(m),
          aramaMetni: aramaMetniOlustur(x.kod, yol, [x.sembol, ...x.digerSemboller].filter(Boolean).join(" ") || null),
        };
      }),
    };
  }

  /** Vektörü olmayan parçaları gömer (aynı metin başka alanda gömüldüyse yeniden gömülmez) */
  private async gomAlan(p: ProjeKaydi, a: AlanDurumu, is: Is): Promise<void> {
    const g = this.gomucu();
    a.durum.model = g?.anahtar ?? null;
    if (!g) return;
    let eksik = p.depo.gommeEksikleri(is.alan, g.anahtar, g.parti * 32);
    if (!eksik.length) return;
    a.durum.durum = "gomuluyor";
    this.sayilariGuncelle(p, is.alan, a);
    this.yayinla(p.id, a);
    const birak = g.ilerlemeDinle((o) => {
      if (o.tur === "indiriliyor") {
        a.durum.durum = "model-indiriliyor";
        a.durum.indirmeYuzde = o.yuzde;
        this.yayinla(p.id, a);
      } else if ((o.tur === "hazir" || o.tur === "yukleniyor") && a.durum.durum === "model-indiriliyor") {
        a.durum.durum = "gomuluyor";
        a.durum.indirmeYuzde = null;
        this.yayinla(p.id, a);
      }
    });
    try {
      while (eksik.length && !is.iptal) {
        // Benzer uzunluktaki metinler aynı partide: dolgu (padding) israfı azalır
        eksik.sort((x, y) => x.metin.length - y.metin.length);
        for (let i = 0; i < eksik.length && !is.iptal; i += g.parti) {
          const parti = eksik.slice(i, i + g.parti);
          const vektorler = await g.gom(
            parti.map((e) => e.metin),
            "belge",
          );
          if (is.iptal || this.gomucuNesnesi !== g) return;
          p.depo.gommeleriYaz(
            g.anahtar,
            parti.map((e, j) => ({ hash: e.hash, vektor: vektorler[j]! })),
          );
          p.surum++;
          // İlk parti geldiyse model inmiş ve yüklenmiştir
          a.durum.durum = "gomuluyor";
          a.durum.indirmeYuzde = null;
          a.durum.gomulen = p.depo.gomuluParcaSayisi(is.alan, g.anahtar);
          this.yayinla(p.id, a);
        }
        eksik = p.depo.gommeEksikleri(is.alan, g.anahtar, g.parti * 32);
      }
    } finally {
      birak();
    }
  }

  /** Yoğun arama matrisi (alan × model); gömme sürerken en çok 5 sn'de bir tazelenir */
  private matris(p: ProjeKaydi, alan: string, g: Gomucu): YogunMatris | null {
    const anahtar = `${alan}\u0000${g.anahtar}`;
    const m = p.matrisler.get(anahtar);
    const gomuyor = p.suren?.alan === alan;
    if (m && (m.surum === p.surum || (gomuyor && Date.now() - m.kurulma < MATRIS_TAZELEME_MS))) {
      // En son kullanılan sona
      p.matrisler.delete(anahtar);
      p.matrisler.set(anahtar, m);
      return m;
    }
    const satirlar = p.depo.vektorler(alan, g.anahtar);
    if (!satirlar.length) {
      p.matrisler.delete(anahtar);
      return null;
    }
    const boyut = g.boyut || satirlar[0]!.vektor.byteLength / 4;
    const uygun = satirlar.filter((s) => s.vektor.byteLength === boyut * 4);
    const veri = new Float32Array(uygun.length * boyut);
    const idler: number[] = [];
    const yollar: string[] = [];
    uygun.forEach((s, i) => {
      veri.set(blobVektor(s.vektor), i * boyut);
      idler.push(s.id);
      yollar.push(s.yol);
    });
    const yeni: YogunMatris = { boyut, idler, yollar, veri, surum: p.surum, kurulma: Date.now() };
    p.matrisler.delete(anahtar);
    p.matrisler.set(anahtar, yeni);
    while (p.matrisler.size > EN_COK_MATRIS) p.matrisler.delete(p.matrisler.keys().next().value!);
    return yeni;
  }

  /** Sorgudaki tanımlayıcılara uyan sembollerin parçaları: tam ad her zaman, önek yalnız tanımlayıcı biçimli sözcükte */
  private sembolParcalari(p: ProjeKaydi, alan: string, adlar: string[], suzgec: ((yol: string) => boolean) | null): { idler: number[]; eslesen: Map<number, { ad: string; tur: KodSembolTuru }> } {
    const idler: number[] = [];
    const eslesen = new Map<number, { ad: string; tur: KodSembolTuru }>();
    const goruldu = new Set<number>();
    for (const ad of adlar.slice(0, 6)) {
      const tanimlayici = /\p{Ll}\p{Lu}|[_$]|\d/u.test(ad);
      const kucuk = ad.toLowerCase();
      const bulunan = p.depo.sembolAra(alan, ad, { sinir: 12, yalnizTamVeOnek: true }).filter((s) => tanimlayici || s.ad.toLowerCase() === kucuk);
      for (const s of bulunan) {
        if (suzgec && !suzgec(s.yol)) continue;
        const parca = p.depo.satirdakiParcalar(alan, s.yol, s.bas)[0];
        if (parca && !goruldu.has(parca.id)) {
          goruldu.add(parca.id);
          idler.push(parca.id);
          eslesen.set(parca.id, { ad: s.ust && s.tur === "metod" ? `${s.ust}.${s.ad}` : s.ad, tur: s.tur });
        }
      }
      if (idler.length >= 40) break;
    }
    return { idler: idler.slice(0, 40), eslesen };
  }

  /** RRF ile birleştirir; dosya başına en çok üç sonuç; kesit dosyanın güncel hâlinden */
  private sonuclariKur(projeId: string, p: ProjeKaydi, alan: string, listeler: Liste[], sinir: number, terimler: string[]): KodAramaSonucu[] {
    if (!listeler.length) return [];
    const puan = new Map<number, number>();
    const turler = new Map<number, Set<Liste["tur"]>>();
    const eslesenSembol = new Map<number, { ad: string; tur: KodSembolTuru }>();
    for (const l of listeler) {
      for (const [id, x] of l.semboller ?? []) eslesenSembol.set(id, x);
      l.idler.forEach((id, i) => {
        puan.set(id, (puan.get(id) ?? 0) + l.agirlik / (RRF_K + i + 1));
        const t = turler.get(id) ?? new Set();
        t.add(l.tur);
        turler.set(id, t);
      });
    }
    const enCok = listeler.reduce((t, l) => t + l.agirlik / (RRF_K + 1), 0) || 1;
    const sirali = [...puan].sort((x, y) => y[1] - x[1]);
    const parcalar = p.depo.parcalar(sirali.slice(0, sinir * 6).map(([id]) => id));
    const secilen: [ParcaKaydi, number][] = [];
    const dosyaSayisi = new Map<string, number>();
    for (const [id, pn] of sirali) {
      const pr = parcalar.get(id);
      if (!pr) continue;
      const n = dosyaSayisi.get(pr.yol) ?? 0;
      if (n >= DOSYA_BASINA_SONUC) continue;
      dosyaSayisi.set(pr.yol, n + 1);
      secilen.push([pr, pn]);
      if (secilen.length >= sinir) break;
    }
    let kok: string | null = null;
    try {
      kok = this.b.alanYolu(projeId, alan);
    } catch {
      kok = null;
    }
    const satirOnbellegi = new Map<string, string[] | null>();
    const dosyaSatirlari = (yol: string): string[] | null => {
      if (!satirOnbellegi.has(yol)) {
        let s: string[] | null = null;
        if (kok) {
          try {
            s = fs.readFileSync(path.join(kok, ...yol.split("/")), "utf8").replace(/\r\n?/g, "\n").split("\n");
          } catch {
            s = null;
          }
        }
        satirOnbellegi.set(yol, s);
      }
      return satirOnbellegi.get(yol)!;
    };
    const diller = new Map<string, string>();
    return secilen.map(([pr, pn]) => {
      let satirlar = dosyaSatirlari(pr.yol);
      if (!satirlar || satirlar.length < pr.bas) {
        // Dosya okunamadı: parçanın kendi metni (ilk satır bağlam başlığıdır)
        const kod = pr.metin.slice(pr.metin.indexOf("\n") + 1).split("\n");
        satirlar = [...new Array<string>(pr.bas - 1).fill(""), ...kod];
      }
      const sembol = eslesenSembol.get(pr.id);
      const k = kesitSec(satirlar, pr.bas, pr.bit, sembol ? [...terimler, ...tanimlayiciParcalari(sembol.ad)] : terimler, 20);
      if (!diller.has(pr.yol)) diller.set(pr.yol, p.depo.dosya(alan, pr.yol)?.dil ?? "");
      const t = turler.get(pr.id)!;
      return {
        yol: pr.yol,
        dil: diller.get(pr.yol)!,
        bas: pr.bas,
        bit: pr.bit,
        sembol: sembol?.ad ?? pr.sembol,
        sembolTuru: sembol?.tur ?? pr.sembolTuru,
        puan: Math.min(1, Math.round((pn / enCok) * 1000) / 1000),
        eslesme: t.size > 1 ? "karma" : [...t][0]!,
        kesit: k.kesit,
        kesitBas: k.kesitBas,
      };
    });
  }

  /** Sorgudan önce: alan hiç dizinlenmediyse tarama başlar ve (verilen süre kadar) beklenir; bu süreçte
   * taranmamış alan arka planda yeniden taranır (kapalıyken yapılan değişiklikler) */
  private async hazirla(projeId: string, alan: string, bekleMs: number): Promise<{ p: ProjeKaydi; a: AlanDurumu }> {
    this.b.alanYolu(projeId, alan);
    const p = this.proje(projeId);
    const a = this.alanDurumu(p, alan);
    if (!a.taze && !this.isVar(p, alan) && !this.kapandi) {
      const is = this.isEkle(projeId, alan);
      if (a.durum.durum === "bos" && bekleMs > 0) await Promise.race([is.tarandi, bekle(bekleMs)]);
    } else if ((a.durum.durum === "taraniyor" || a.durum.durum === "bos") && a.durum.dosya === 0 && bekleMs > 0) {
      const is = p.suren?.alan === alan ? p.suren : p.kuyruk.find((x) => x.alan === alan);
      if (is) await Promise.race([is.tarandi, bekle(bekleMs)]);
    }
    return { p, a };
  }
}
