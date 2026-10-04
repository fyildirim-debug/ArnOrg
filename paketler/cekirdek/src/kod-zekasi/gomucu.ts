// Gömücüler: metni vektöre çeviren modeller. Gerçek model (@huggingface/transformers, onnxruntime-node) ayrı bir
// worker_threads iş parçacığında çalışır; ana olay döngüsü kilitlenmez. Testler için deterministik sahte gömücü vardır.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { KodZekasiModelBilgisi, KodZekasiModeli } from "@arnorg/ortak";
import { dil, iki } from "../dil.js";
import { aramaMetni } from "../yardimci.js";
import { onek, tanimlayiciParcala } from "./metin.js";

export interface ModelProfili {
  secim: Exclude<KodZekasiModeli, "kapali">;
  /** Hugging Face model kimliği */
  kimlik: string;
  dtype: "q8";
  boyut: number;
  /** Sorgu ve belge önekleri (modelin eğitildiği biçim) */
  sorguOneki: string;
  belgeOneki: string;
  ad: string;
  /** Ayarlar ekranındaki açıklama; İngilizcesi aciklamaEn (modelBilgileri geçerli dildekini verir) */
  aciklama: string;
  aciklamaEn: string;
  indirmeMb: number;
  /** Önbellekte bulunması gereken dosyalar (indirildi mi denetimi) */
  dosyalar: string[];
  /** Bir istekte gömülen en çok parça */
  parti: number;
}

export const MODELLER: Record<Exclude<KodZekasiModeli, "kapali">, ModelProfili> = {
  kaliteli: {
    secim: "kaliteli",
    kimlik: "onnx-community/embeddinggemma-300m-ONNX",
    dtype: "q8",
    boyut: 768,
    sorguOneki: "task: code retrieval | query: ",
    belgeOneki: "title: none | text: ",
    ad: "EmbeddingGemma 300M",
    aciklama: "Çok dilli ve kodda güçlü; Türkçe soruyla İngilizce ya da Türkçe adlı kodu bulur. İlk dizinleme yavaştır (4 çekirdekte parça başına ~0,5 sn; çok kullanılan kod önce gömülür), sonra yalnız değişen parçalar gömülür.",
    aciklamaEn:
      "Multilingual and strong on code; finds code named in English or Turkish from a question in either language. The first indexing is slow (~0.5 s per chunk on 4 cores; frequently used code is embedded first), after that only changed chunks are embedded.",
    indirmeMb: 310,
    dosyalar: ["config.json", "tokenizer.json", "onnx/model_quantized.onnx", "onnx/model_quantized.onnx_data"],
    parti: 8,
  },
  hizli: {
    secim: "hizli",
    kimlik: "Xenova/multilingual-e5-small",
    dtype: "q8",
    boyut: 384,
    sorguOneki: "query: ",
    belgeOneki: "passage: ",
    ad: "Multilingual E5 Small",
    aciklama: "Daha küçük ve birkaç kat hızlı; kod aramasında biraz daha zayıf. Büyük projelerde ilk dizinleme için uygun.",
    aciklamaEn: "Smaller and several times faster; a little weaker at code search. Good for the first indexing of large projects.",
    indirmeMb: 130,
    dosyalar: ["config.json", "tokenizer.json", "onnx/model_quantized.onnx"],
    parti: 16,
  },
};

/** Gömmelerin veritabanındaki model anahtarı */
export function modelAnahtari(p: ModelProfili): string {
  return `${p.kimlik}@${p.dtype}`;
}

/** Model önbelleği: ARNORG_MODEL_DIZINI ya da veri dizini/modeller */
export function modelDizini(veriDizini: string): string {
  return process.env.ARNORG_MODEL_DIZINI || path.join(veriDizini, "modeller");
}

function klasorBoyutu(dizin: string): number {
  let toplam = 0;
  let girdiler: fs.Dirent[];
  try {
    girdiler = fs.readdirSync(dizin, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const g of girdiler) {
    const tam = path.join(dizin, g.name);
    if (g.isDirectory()) toplam += klasorBoyutu(tam);
    else {
      try {
        toplam += fs.statSync(tam).size;
      } catch {
        // okunamadı
      }
    }
  }
  return toplam;
}

/** Ayarlar ekranı için modellerin indirilme durumu */
export function modelBilgileri(veriDizini: string): KodZekasiModelBilgisi[] {
  const kok = modelDizini(veriDizini);
  return Object.values(MODELLER).map((p) => {
    const dizin = path.join(kok, ...p.kimlik.split("/"));
    const indirildi = p.dosyalar.every((d) => fs.existsSync(path.join(dizin, ...d.split("/"))));
    return {
      secim: p.secim,
      kimlik: p.kimlik,
      ad: p.ad,
      aciklama: iki(p.aciklama, p.aciklamaEn),
      boyut: p.boyut,
      indirmeMb: p.indirmeMb,
      indirildi,
      diskMb: indirildi ? Math.round(klasorBoyutu(dizin) / 1024 / 1024) : 0,
    };
  });
}

export type GomucuIlerlemesi =
  | { tur: "indiriliyor"; yuzde: number }
  | { tur: "yukleniyor" }
  | { tur: "hazir" }
  | { tur: "hata"; mesaj: string };

export interface Gomucu {
  /** Veritabanındaki model anahtarı */
  readonly anahtar: string;
  readonly boyut: number;
  /** Bir istekte gömülecek parça sayısı */
  readonly parti: number;
  /** Metinleri normalize edilmiş vektörlere çevirir. Sorgular kuyruğun önüne geçer. */
  gom(metinler: string[], tur: "belge" | "sorgu"): Promise<Float32Array[]>;
  /** Model indirme ve yükleme ilerlemesi */
  ilerlemeDinle(f: (o: GomucuIlerlemesi) => void): () => void;
  kapat(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Sahte gömücü: sözcük özetlerinden 64 boyutlu vektör (testler, ARNORG_GOMME=sahte)
// ---------------------------------------------------------------------------

function fnv(metin: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < metin.length; i++) {
    h ^= metin.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministik "torba" vektör: ortak sözcüğü ve öneki olan metinler birbirine yakın düşer */
export function sahteVektor(metin: string, boyut = 64): Float32Array {
  const v = new Float32Array(boyut);
  const sozcukler = new Set<string>();
  for (const m of metin.matchAll(/[\p{L}_$][\p{L}\p{N}_$]*/gu)) {
    for (const p of tanimlayiciParcala(m[0])) if (p.length >= 2) sozcukler.add(p);
    const sade = aramaMetni(m[0]).replace(/[^a-z0-9]/g, "");
    if (sade.length >= 2) sozcukler.add(sade);
  }
  for (const s of sozcukler) {
    for (const t of [s, onek(s)]) {
      if (!t) continue;
      const h = fnv(t);
      v[h % boyut]! += h & 0x80000000 ? -1 : 1;
    }
  }
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < boyut; i++) v[i]! /= n;
  return v;
}

export class SahteGomucu implements Gomucu {
  readonly anahtar: string = "sahte-64";
  readonly boyut: number = 64;
  readonly parti: number = 32;
  /** Testler gömme sayısını izleyebilsin */
  gomulenMetin = 0;

  async gom(metinler: string[]): Promise<Float32Array[]> {
    this.gomulenMetin += metinler.length;
    return metinler.map((m) => sahteVektor(m, this.boyut));
  }

  ilerlemeDinle(): () => void {
    return () => undefined;
  }

  async kapat(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Gerçek model: iş parçacığında transformers.js
// ---------------------------------------------------------------------------

/** İş parçacığı dosyası: derlemede dist/gomme-calisani.js, kaynakta (testler, tsx) src/kod-zekasi/gomme-calisani.ts */
export function calisanYolu(): URL {
  for (const ad of ["./gomme-calisani.js", "./gomme-calisani.ts", "./kod-zekasi/gomme-calisani.js"]) {
    const u = new URL(ad, import.meta.url);
    if (fs.existsSync(fileURLToPath(u))) return u;
  }
  throw new Error(iki("Gömme iş parçacığı dosyası bulunamadı (gomme-calisani.js).", "Embedding worker file not found (gomme-calisani.js)."));
}

interface Is {
  metinler: string[];
  sorgu: boolean;
  coz: (v: Float32Array[]) => void;
  reddet: (h: Error) => void;
}

type CalisanMesaji =
  | { tur: "ilerleme"; durum: "indiriliyor"; yuzde: number }
  | { tur: "ilerleme"; durum: "yukleniyor" }
  | { tur: "hazir"; boyut: number | null }
  | { tur: "hata"; mesaj: string }
  | { tur: "sonuc"; id: number; vektorler?: Float32Array; boyut?: number; hata?: string };

/** Boşta kalan iş parçacığı bu süre sonra kapatılır (model belleği geri verilir) */
const BOSTA_KAPATMA_MS = 10 * 60_000;
/**
 * Modele giden metin bu uzunlukta kesilir (~350 kod belirteci). Parçanın başı (yol, sembol, imza, belge yorumu)
 * anlamı taşır; tam metin anahtar sözcük dizininde kalır. Uzun girdide süre ve bellek hızla büyür.
 */
export const EN_COK_GOMME_KARAKTERI = 1200;

export class IsciGomucu implements Gomucu {
  readonly anahtar: string;
  readonly boyut: number;
  readonly parti: number;
  private isci: Worker | null = null;
  private hazirlik: Promise<void> | null = null;
  private kuyruk: Is[] = [];
  private suren: { id: number; is: Is } | null = null;
  private sayac = 0;
  private bostaZamanlayici: NodeJS.Timeout | null = null;
  private dinleyiciler = new Set<(o: GomucuIlerlemesi) => void>();
  private kapandi = false;

  constructor(
    readonly profil: ModelProfili,
    private readonly onbellekDizini: string,
  ) {
    this.anahtar = modelAnahtari(profil);
    this.boyut = profil.boyut;
    this.parti = profil.parti;
  }

  ilerlemeDinle(f: (o: GomucuIlerlemesi) => void): () => void {
    this.dinleyiciler.add(f);
    return () => this.dinleyiciler.delete(f);
  }

  private yay(o: GomucuIlerlemesi): void {
    for (const d of this.dinleyiciler) {
      try {
        d(o);
      } catch {
        // dinleyici hatası gömmeyi durdurmaz
      }
    }
  }

  private hepsiniReddet(h: Error): void {
    const bekleyenler = [...this.kuyruk, ...(this.suren ? [this.suren.is] : [])];
    this.kuyruk = [];
    this.suren = null;
    for (const is of bekleyenler) is.reddet(h);
  }

  private baslat(): Promise<void> {
    if (this.kapandi) return Promise.reject(new Error(iki("Gömücü kapatıldı.", "The embedder was closed.")));
    if (this.hazirlik) return this.hazirlik;
    this.hazirlik = new Promise<void>((coz, reddet) => {
      let hazir = false;
      const isci = new Worker(calisanYolu(), { stdout: false, stderr: false });
      this.isci = isci;
      isci.unref();
      isci.on("message", (m: CalisanMesaji) => {
        if (m.tur === "ilerleme") this.yay(m.durum === "indiriliyor" ? { tur: "indiriliyor", yuzde: m.yuzde } : { tur: "yukleniyor" });
        else if (m.tur === "hazir") {
          hazir = true;
          this.yay({ tur: "hazir" });
          coz();
          this.pompala();
        } else if (m.tur === "hata") {
          this.yay({ tur: "hata", mesaj: m.mesaj });
          reddet(new Error(m.mesaj));
          void this.durdur(new Error(m.mesaj));
        } else if (m.tur === "sonuc") {
          const s = this.suren;
          if (!s || s.id !== m.id) return;
          this.suren = null;
          if (m.hata || !m.vektorler) s.is.reddet(new Error(m.hata ?? iki("Gömme sonucu boş.", "The embedding result is empty.")));
          else {
            const d = m.boyut ?? this.boyut;
            const liste: Float32Array[] = [];
            for (let i = 0; i < s.is.metinler.length; i++) liste.push(m.vektorler.slice(i * d, (i + 1) * d));
            s.is.coz(liste);
          }
          this.pompala();
        }
      });
      isci.on("error", (h) => {
        const hata = new Error(iki(`Gömme iş parçacığı hata verdi: ${h.message}`, `The embedding worker failed: ${h.message}`));
        if (!hazir) reddet(hata);
        this.yay({ tur: "hata", mesaj: hata.message });
        void this.durdur(hata);
      });
      isci.on("exit", (kod) => {
        if (this.isci !== isci) return;
        this.isci = null;
        this.hazirlik = null;
        const hata = new Error(iki(`Gömme iş parçacığı kapandı (${kod}).`, `The embedding worker exited (${kod}).`));
        if (!hazir) reddet(hata);
        this.hepsiniReddet(hata);
      });
      const izlek = Math.max(1, Math.min(8, (os.availableParallelism?.() ?? os.cpus().length) - 1));
      // İş parçacığı kendi başına durur (dil.ts'i içe aktarmaz); hata metinlerinin dili mesajla gider
      isci.postMessage({ tur: "yukle", model: this.profil.kimlik, dtype: this.profil.dtype, onbellek: this.onbellekDizini, izlek, dosyalar: this.profil.dosyalar, dil: dil() });
    });
    // Yükleme hatası bir kez yayılır; sonraki çağrılar yeniden dener
    this.hazirlik.catch(() => {
      this.hazirlik = null;
    });
    return this.hazirlik;
  }

  private pompala(): void {
    if (!this.isci || this.suren || !this.hazirlik) return;
    const is = this.kuyruk.shift();
    if (!is) {
      this.bostaPlanla();
      return;
    }
    if (this.bostaZamanlayici) clearTimeout(this.bostaZamanlayici);
    this.bostaZamanlayici = null;
    const id = ++this.sayac;
    this.suren = { id, is };
    const onekli = is.metinler.map((m) => (is.sorgu ? this.profil.sorguOneki : this.profil.belgeOneki) + m.slice(0, EN_COK_GOMME_KARAKTERI));
    this.isci.postMessage({ tur: "gom", id, metinler: onekli, dil: dil() });
  }

  private bostaPlanla(): void {
    if (this.bostaZamanlayici) clearTimeout(this.bostaZamanlayici);
    this.bostaZamanlayici = setTimeout(() => void this.durdur(), BOSTA_KAPATMA_MS);
    this.bostaZamanlayici.unref();
  }

  /** İş parçacığını kapatır; sonraki gom() yeniden açar */
  private async durdur(hata?: Error): Promise<void> {
    if (this.bostaZamanlayici) clearTimeout(this.bostaZamanlayici);
    this.bostaZamanlayici = null;
    const isci = this.isci;
    this.isci = null;
    this.hazirlik = null;
    this.hepsiniReddet(hata ?? new Error(iki("Gömme iş parçacığı kapatıldı.", "The embedding worker was stopped.")));
    if (isci) await isci.terminate().catch(() => undefined);
  }

  async gom(metinler: string[], tur: "belge" | "sorgu"): Promise<Float32Array[]> {
    if (!metinler.length) return [];
    await this.baslat();
    return new Promise<Float32Array[]>((coz, reddet) => {
      const is: Is = { metinler, sorgu: tur === "sorgu", coz, reddet };
      // Kullanıcının ve ajanların sorguları dizinleme partilerini beklemez
      if (is.sorgu) this.kuyruk.unshift(is);
      else this.kuyruk.push(is);
      this.pompala();
    });
  }

  async kapat(): Promise<void> {
    this.kapandi = true;
    await this.durdur(new Error(iki("Gömücü kapatıldı.", "The embedder was closed.")));
  }
}

/** Ayara göre gömücü: kapali → null; ARNORG_GOMME=sahte → sahte gömücü */
export function gomucuOlustur(secim: KodZekasiModeli, veriDizini: string): Gomucu | null {
  if (secim === "kapali") return null;
  if (process.env.ARNORG_GOMME === "sahte") return new SahteGomucu();
  return new IsciGomucu(MODELLER[secim], modelDizini(veriDizini));
}
