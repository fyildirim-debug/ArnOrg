// Kod dizininin kalıcı verisi: proje başına ayrı SQLite dosyası (veri dizini/kod-dizini/<projeId>.db, WAL).
// Gömmeler metin özeti ve model anahtarıyla tutulur; aynı içerik başka alanda (ajan worktree'si) yeniden gömülmez.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { KodSembolTuru } from "@arnorg/ortak";

/** Şema ya da parçalama kuralları değişince artar; eski dosya silinip yeniden dizinlenir */
const SEMA_SURUMU = "1";

const SEMA = `
CREATE TABLE IF NOT EXISTS meta (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dosyalar (
  alan TEXT NOT NULL,
  yol TEXT NOT NULL,
  hash TEXT NOT NULL,
  dil TEXT NOT NULL,
  satir INTEGER NOT NULL,
  boyut INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  PRIMARY KEY (alan, yol)
);
CREATE TABLE IF NOT EXISTS semboller (
  alan TEXT NOT NULL,
  yol TEXT NOT NULL,
  ad TEXT NOT NULL,
  ad_kucuk TEXT NOT NULL,
  tur TEXT NOT NULL,
  bas INTEGER NOT NULL,
  bit INTEGER NOT NULL,
  disa_acik INTEGER NOT NULL,
  ust TEXT,
  imza TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS semboller_ad ON semboller(alan, ad_kucuk);
CREATE INDEX IF NOT EXISTS semboller_yol ON semboller(alan, yol);
CREATE TABLE IF NOT EXISTS iceaktarmalar (
  alan TEXT NOT NULL,
  yol TEXT NOT NULL,
  kaynak TEXT NOT NULL,
  hedef TEXT,
  satir INTEGER NOT NULL,
  adlar TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS iceaktarmalar_yol ON iceaktarmalar(alan, yol);
CREATE INDEX IF NOT EXISTS iceaktarmalar_hedef ON iceaktarmalar(alan, hedef);
CREATE TABLE IF NOT EXISTS parcalar (
  id INTEGER PRIMARY KEY,
  alan TEXT NOT NULL,
  yol TEXT NOT NULL,
  bas INTEGER NOT NULL,
  bit INTEGER NOT NULL,
  sembol TEXT,
  sembol_turu TEXT,
  metin_hash TEXT NOT NULL,
  metin TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS parcalar_yol ON parcalar(alan, yol);
CREATE INDEX IF NOT EXISTS parcalar_hash ON parcalar(metin_hash);
CREATE TABLE IF NOT EXISTS gommeler (
  metin_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  vektor BLOB NOT NULL,
  PRIMARY KEY (metin_hash, model)
);
CREATE VIRTUAL TABLE IF NOT EXISTS parca_ara USING fts5(metin, tokenize = "unicode61 remove_diacritics 2");
`;

type Satir = Record<string, unknown>;

export interface DosyaKaydi {
  yol: string;
  hash: string;
  dil: string;
  satir: number;
  boyut: number;
  mtime: number;
}

export interface SembolKaydi {
  yol: string;
  ad: string;
  tur: KodSembolTuru;
  bas: number;
  bit: number;
  disaAcik: boolean;
  ust: string | null;
  imza: string;
}

export interface IceAktarmaKaydi {
  yol: string;
  kaynak: string;
  hedef: string | null;
  satir: number;
  adlar: string[];
}

export interface ParcaYazimi {
  bas: number;
  bit: number;
  sembol: string | null;
  sembolTuru: KodSembolTuru | null;
  /** Gömme modeline giden metin (bağlam başlığıyla) */
  metin: string;
  metinHash: string;
  /** Tam metin dizinine giren metin */
  aramaMetni: string;
}

export interface ParcaKaydi {
  id: number;
  yol: string;
  bas: number;
  bit: number;
  sembol: string | null;
  sembolTuru: KodSembolTuru | null;
  metinHash: string;
  metin: string;
}

export interface DosyaYazimi {
  dosya: DosyaKaydi;
  semboller: Omit<SembolKaydi, "yol">[];
  iceAktarmalar: Omit<IceAktarmaKaydi, "yol">[];
  parcalar: ParcaYazimi[];
}

export function vektorBlobu(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function blobVektor(b: Buffer): Float32Array {
  // Hizalı kopya: Buffer havuzundaki ofset 4'ün katı olmayabilir
  const kopya = new Float32Array(b.byteLength / 4);
  new Uint8Array(kopya.buffer).set(b);
  return kopya;
}

export class KodDeposu {
  readonly db: Database.Database;
  private readonly hazir: {
    dosyaSil: Database.Statement[];
    dosyaEkle: Database.Statement;
    sembolEkle: Database.Statement;
    iceAktarmaEkle: Database.Statement;
    parcaEkle: Database.Statement;
    ftsEkle: Database.Statement;
    parcaIdleri: Database.Statement;
    ftsSil: Database.Statement;
  };

  constructor(readonly dosyaYolu: string) {
    fs.mkdirSync(path.dirname(dosyaYolu), { recursive: true });
    this.db = KodDeposu.ac(dosyaYolu);
    this.hazir = {
      dosyaSil: [
        this.db.prepare("DELETE FROM dosyalar WHERE alan = ? AND yol = ?"),
        this.db.prepare("DELETE FROM semboller WHERE alan = ? AND yol = ?"),
        this.db.prepare("DELETE FROM iceaktarmalar WHERE alan = ? AND yol = ?"),
        this.db.prepare("DELETE FROM parcalar WHERE alan = ? AND yol = ?"),
      ],
      dosyaEkle: this.db.prepare("INSERT INTO dosyalar (alan, yol, hash, dil, satir, boyut, mtime) VALUES (?, ?, ?, ?, ?, ?, ?)"),
      sembolEkle: this.db.prepare("INSERT INTO semboller (alan, yol, ad, ad_kucuk, tur, bas, bit, disa_acik, ust, imza) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
      iceAktarmaEkle: this.db.prepare("INSERT INTO iceaktarmalar (alan, yol, kaynak, hedef, satir, adlar) VALUES (?, ?, ?, ?, ?, ?)"),
      parcaEkle: this.db.prepare("INSERT INTO parcalar (alan, yol, bas, bit, sembol, sembol_turu, metin_hash, metin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
      ftsEkle: this.db.prepare("INSERT INTO parca_ara (rowid, metin) VALUES (?, ?)"),
      parcaIdleri: this.db.prepare("SELECT id FROM parcalar WHERE alan = ? AND yol = ?"),
      ftsSil: this.db.prepare("DELETE FROM parca_ara WHERE rowid = ?"),
    };
  }

  /** Dosyayı açar; şema sürümü eskiyse ya da dosya bozuksa sıfırdan kurar */
  private static ac(dosya: string): Database.Database {
    const kur = () => {
      const db = new Database(dosya);
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.exec(SEMA);
      return db;
    };
    let db: Database.Database;
    try {
      db = kur();
      const surum = (db.prepare("SELECT deger FROM meta WHERE anahtar = 'surum'").get() as Satir | undefined)?.deger;
      if (surum === SEMA_SURUMU) return db;
      if (surum !== undefined) {
        db.close();
        KodDeposu.dosyalariSil(dosya);
        db = kur();
      }
    } catch {
      KodDeposu.dosyalariSil(dosya);
      db = kur();
    }
    db.prepare("INSERT OR REPLACE INTO meta (anahtar, deger) VALUES ('surum', ?)").run(SEMA_SURUMU);
    return db;
  }

  static dosyalariSil(dosya: string): void {
    for (const ek of ["", "-wal", "-shm"]) fs.rmSync(`${dosya}${ek}`, { force: true });
  }

  kapat(): void {
    try {
      this.db.close();
    } catch {
      // zaten kapalı
    }
  }

  // ---------------- yazma ----------------

  private dosyaSilIc(alan: string, yol: string): void {
    for (const { id } of this.hazir.parcaIdleri.all(alan, yol) as { id: number }[]) this.hazir.ftsSil.run(id);
    for (const st of this.hazir.dosyaSil) st.run(alan, yol);
  }

  /** Dosyaların sembol, içe aktarma ve parçalarını tek işlemde yeniler */
  dosyalariYaz(alan: string, yazimlar: DosyaYazimi[]): void {
    const yaz = this.db.transaction(() => {
      for (const y of yazimlar) {
        const d = y.dosya;
        this.dosyaSilIc(alan, d.yol);
        this.hazir.dosyaEkle.run(alan, d.yol, d.hash, d.dil, d.satir, d.boyut, d.mtime);
        for (const s of y.semboller) this.hazir.sembolEkle.run(alan, d.yol, s.ad, s.ad.toLowerCase(), s.tur, s.bas, s.bit, s.disaAcik ? 1 : 0, s.ust, s.imza);
        for (const i of y.iceAktarmalar) this.hazir.iceAktarmaEkle.run(alan, d.yol, i.kaynak, i.hedef, i.satir, JSON.stringify(i.adlar));
        for (const p of y.parcalar) {
          const r = this.hazir.parcaEkle.run(alan, d.yol, p.bas, p.bit, p.sembol, p.sembolTuru, p.metinHash, p.metin);
          this.hazir.ftsEkle.run(r.lastInsertRowid, p.aramaMetni);
        }
      }
    });
    yaz();
  }

  /** İçeriği aynı kalan dosyanın yalnız değişme zamanını günceller */
  mtimeGuncelle(alan: string, yol: string, mtime: number, boyut: number): void {
    this.db.prepare("UPDATE dosyalar SET mtime = ?, boyut = ? WHERE alan = ? AND yol = ?").run(mtime, boyut, alan, yol);
  }

  dosyalariSilAlanda(alan: string, yollar: string[]): void {
    if (!yollar.length) return;
    const sil = this.db.transaction(() => {
      for (const y of yollar) this.dosyaSilIc(alan, y);
    });
    sil();
  }

  /** İçe aktarma hedeflerini yeniden yazar (dosya kümesi değişince göreli çözümler değişebilir) */
  hedefleriYaz(alan: string, degisenler: { yol: string; kaynak: string; satir: number; hedef: string | null }[]): void {
    const st = this.db.prepare("UPDATE iceaktarmalar SET hedef = ? WHERE alan = ? AND yol = ? AND kaynak = ? AND satir = ?");
    const yaz = this.db.transaction(() => {
      for (const d of degisenler) st.run(d.hedef, alan, d.yol, d.kaynak, d.satir);
    });
    yaz();
  }

  alaniSil(alan: string): void {
    const sil = this.db.transaction(() => {
      this.db.prepare("DELETE FROM parca_ara WHERE rowid IN (SELECT id FROM parcalar WHERE alan = ?)").run(alan);
      for (const t of ["dosyalar", "semboller", "iceaktarmalar", "parcalar"]) this.db.prepare(`DELETE FROM ${t} WHERE alan = ?`).run(alan);
      this.db.prepare("DELETE FROM meta WHERE anahtar = ?").run(`son:${alan}`);
    });
    sil();
  }

  /** Hiçbir parçanın kullanmadığı gömmeleri siler */
  sahipsizGommeleriSil(): number {
    return this.db.prepare("DELETE FROM gommeler WHERE metin_hash NOT IN (SELECT DISTINCT metin_hash FROM parcalar)").run().changes;
  }

  // ---------------- gömmeler ----------------

  /**
   * Etkin model için vektörü olmayan parça metinleri (aynı metin bir kez). Önce çok içe aktarılan kaynak
   * dosyalar, sonra diğerleri; testler ve belgeler en sona: ilk dizinleme uzun sürse de anlamsal arama
   * projenin merkezindeki kodda erkenden işe yarar.
   */
  gommeEksikleri(alan: string, model: string, sinir: number): { hash: string; metin: string }[] {
    return (
      this.db
        .prepare(
          `SELECT p.metin_hash AS hash, MIN(p.metin) AS metin,
             MAX(CASE WHEN p.yol LIKE '%.test.%' OR p.yol LIKE '%.spec.%' OR p.yol LIKE 'test/%' OR p.yol LIKE 'tests/%'
                       OR p.yol LIKE '%/test/%' OR p.yol LIKE '%/tests/%' OR p.yol LIKE '%/__tests__/%' THEN 2
                      WHEN p.yol LIKE '%.md' OR p.yol LIKE '%.json' OR p.yol LIKE '%.yaml' OR p.yol LIKE '%.yml' THEN 1 ELSE 0 END) AS sinif,
             MAX(COALESCE(o.n, 0)) AS onem
           FROM parcalar p
           LEFT JOIN (SELECT hedef, COUNT(*) AS n FROM iceaktarmalar WHERE alan = ? AND hedef IS NOT NULL GROUP BY hedef) o ON o.hedef = p.yol
           WHERE p.alan = ? AND NOT EXISTS (SELECT 1 FROM gommeler g WHERE g.metin_hash = p.metin_hash AND g.model = ?)
           GROUP BY p.metin_hash ORDER BY sinif, onem DESC, MIN(p.yol), MIN(p.bas) LIMIT ?`,
        )
        .all(alan, alan, model, sinir) as { hash: string; metin: string }[]
    );
  }

  gommeleriYaz(model: string, liste: { hash: string; vektor: Float32Array }[]): void {
    const st = this.db.prepare("INSERT OR REPLACE INTO gommeler (metin_hash, model, vektor) VALUES (?, ?, ?)");
    const yaz = this.db.transaction(() => {
      for (const g of liste) st.run(g.hash, model, vektorBlobu(g.vektor));
    });
    yaz();
  }

  gomuluParcaSayisi(alan: string, model: string): number {
    const s = this.db
      .prepare("SELECT COUNT(*) AS n FROM parcalar p JOIN gommeler g ON g.metin_hash = p.metin_hash AND g.model = ? WHERE p.alan = ?")
      .get(model, alan) as Satir;
    return Number(s.n);
  }

  /** Yoğun arama matrisi için alanın vektörlü parçaları */
  vektorler(alan: string, model: string): { id: number; yol: string; vektor: Buffer }[] {
    return this.db
      .prepare("SELECT p.id AS id, p.yol AS yol, g.vektor AS vektor FROM parcalar p JOIN gommeler g ON g.metin_hash = p.metin_hash AND g.model = ? WHERE p.alan = ? ORDER BY p.id")
      .all(model, alan) as { id: number; yol: string; vektor: Buffer }[];
  }

  vektor(hash: string, model: string): Float32Array | null {
    const s = this.db.prepare("SELECT vektor FROM gommeler WHERE metin_hash = ? AND model = ?").get(hash, model) as { vektor: Buffer } | undefined;
    return s ? blobVektor(s.vektor) : null;
  }

  // ---------------- okuma ----------------

  metaOku(anahtar: string): string | null {
    const s = this.db.prepare("SELECT deger FROM meta WHERE anahtar = ?").get(anahtar) as Satir | undefined;
    return s ? String(s.deger) : null;
  }

  metaYaz(anahtar: string, deger: string | null): void {
    if (deger === null) this.db.prepare("DELETE FROM meta WHERE anahtar = ?").run(anahtar);
    else this.db.prepare("INSERT OR REPLACE INTO meta (anahtar, deger) VALUES (?, ?)").run(anahtar, deger);
  }

  /** Dizinde kaydı olan alanlar */
  alanlar(): string[] {
    return (this.db.prepare("SELECT DISTINCT alan FROM dosyalar ORDER BY alan").all() as Satir[]).map((s) => String(s.alan));
  }

  dosyalar(alan: string): DosyaKaydi[] {
    return [...this.dosyaHaritasi(alan).values()].sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
  }

  sayilar(alan: string): { dosya: number; sembol: number; parca: number } {
    const n = (t: string) => Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE alan = ?`).get(alan) as Satir).n);
    return { dosya: n("dosyalar"), sembol: n("semboller"), parca: n("parcalar") };
  }

  dosyaHaritasi(alan: string): Map<string, DosyaKaydi> {
    const satirlar = this.db.prepare("SELECT yol, hash, dil, satir, boyut, mtime FROM dosyalar WHERE alan = ?").all(alan) as Satir[];
    return new Map(satirlar.map((s) => [String(s.yol), { yol: String(s.yol), hash: String(s.hash), dil: String(s.dil), satir: Number(s.satir), boyut: Number(s.boyut), mtime: Number(s.mtime) }]));
  }

  dosya(alan: string, yol: string): DosyaKaydi | null {
    const s = this.db.prepare("SELECT yol, hash, dil, satir, boyut, mtime FROM dosyalar WHERE alan = ? AND yol = ?").get(alan, yol) as Satir | undefined;
    return s ? { yol: String(s.yol), hash: String(s.hash), dil: String(s.dil), satir: Number(s.satir), boyut: Number(s.boyut), mtime: Number(s.mtime) } : null;
  }

  private parcaSatiri(s: Satir): ParcaKaydi {
    return {
      id: Number(s.id),
      yol: String(s.yol),
      bas: Number(s.bas),
      bit: Number(s.bit),
      sembol: (s.sembol as string | null) ?? null,
      sembolTuru: (s.sembol_turu as KodSembolTuru | null) ?? null,
      metinHash: String(s.metin_hash),
      metin: String(s.metin),
    };
  }

  parcalar(idler: number[]): Map<number, ParcaKaydi> {
    const sonuc = new Map<number, ParcaKaydi>();
    const st = this.db.prepare("SELECT * FROM parcalar WHERE id = ?");
    for (const id of idler) {
      const s = st.get(id) as Satir | undefined;
      if (s) sonuc.set(id, this.parcaSatiri(s));
    }
    return sonuc;
  }

  dosyaParcalari(alan: string, yol: string): ParcaKaydi[] {
    return (this.db.prepare("SELECT * FROM parcalar WHERE alan = ? AND yol = ? ORDER BY bas").all(alan, yol) as Satir[]).map((s) => this.parcaSatiri(s));
  }

  /** Tam metin araması: bm25 sırasıyla parça kimlikleri */
  ftsAra(alan: string, ifade: string, sinir: number): { id: number; yol: string; puan: number }[] {
    try {
      return this.db
        .prepare(
          `SELECT p.id AS id, p.yol AS yol, bm25(parca_ara) AS puan FROM parca_ara JOIN parcalar p ON p.id = parca_ara.rowid
           WHERE parca_ara MATCH ? AND p.alan = ? ORDER BY puan LIMIT ?`,
        )
        .all(ifade, alan, sinir) as { id: number; yol: string; puan: number }[];
    } catch {
      // Geçersiz FTS ifadesi: sonuç yok
      return [];
    }
  }

  private sembolSatiri(s: Satir): SembolKaydi {
    return {
      yol: String(s.yol),
      ad: String(s.ad),
      tur: String(s.tur) as KodSembolTuru,
      bas: Number(s.bas),
      bit: Number(s.bit),
      disaAcik: Number(s.disa_acik) === 1,
      ust: (s.ust as string | null) ?? null,
      imza: String(s.imza),
    };
  }

  /** Ada göre semboller: tam eşleşme, önek, içerme; türe göre süzülebilir */
  sembolAra(alan: string, q: string, s: { tur?: KodSembolTuru; sinir: number; yalnizTamVeOnek?: boolean }): SembolKaydi[] {
    const kucuk = q.toLowerCase();
    const kacisli = kucuk.replace(/[\\%_]/g, (c) => `\\${c}`);
    const turKosulu = s.tur ? "AND tur = ?" : "";
    const turDegeri = s.tur ? [s.tur] : [];
    const desen = s.yalnizTamVeOnek ? `${kacisli}%` : `%${kacisli}%`;
    const satirlar = this.db
      .prepare(
        `SELECT *, CASE WHEN ad_kucuk = ? THEN 0 WHEN ad_kucuk LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END AS sira
         FROM semboller WHERE alan = ? AND ad_kucuk LIKE ? ESCAPE '\\' ${turKosulu}
         ORDER BY sira, disa_acik DESC, (bit - bas) DESC, length(ad), yol LIMIT ?`,
      )
      .all(kucuk, `${kacisli}%`, alan, desen, ...turDegeri, s.sinir) as Satir[];
    return satirlar.map((x) => this.sembolSatiri(x));
  }

  /** Sorgu boşken: dışa açık ve büyük semboller */
  oneCikanSemboller(alan: string, s: { tur?: KodSembolTuru; sinir: number }): SembolKaydi[] {
    const turKosulu = s.tur ? "AND tur = ?" : "";
    return (
      this.db
        .prepare(`SELECT * FROM semboller WHERE alan = ? ${turKosulu} ORDER BY disa_acik DESC, (ust IS NULL) DESC, (bit - bas) DESC, ad LIMIT ?`)
        .all(alan, ...(s.tur ? [s.tur] : []), s.sinir) as Satir[]
    ).map((x) => this.sembolSatiri(x));
  }

  tumSemboller(alan: string): SembolKaydi[] {
    return (this.db.prepare("SELECT * FROM semboller WHERE alan = ? ORDER BY yol, bas").all(alan) as Satir[]).map((x) => this.sembolSatiri(x));
  }

  dosyaSembolleri(alan: string, yol: string): SembolKaydi[] {
    return (this.db.prepare("SELECT * FROM semboller WHERE alan = ? AND yol = ? ORDER BY bas").all(alan, yol) as Satir[]).map((x) => this.sembolSatiri(x));
  }

  private iceAktarmaSatiri(s: Satir): IceAktarmaKaydi {
    let adlar: string[] = [];
    try {
      adlar = JSON.parse(String(s.adlar)) as string[];
    } catch {
      // bozuk kayıt
    }
    return { yol: String(s.yol), kaynak: String(s.kaynak), hedef: (s.hedef as string | null) ?? null, satir: Number(s.satir), adlar };
  }

  iceAktardiklari(alan: string, yol: string): IceAktarmaKaydi[] {
    return (this.db.prepare("SELECT * FROM iceaktarmalar WHERE alan = ? AND yol = ? ORDER BY satir").all(alan, yol) as Satir[]).map((s) => this.iceAktarmaSatiri(s));
  }

  iceAktaranlar(alan: string, hedef: string): IceAktarmaKaydi[] {
    return (this.db.prepare("SELECT * FROM iceaktarmalar WHERE alan = ? AND hedef = ? ORDER BY yol, satir").all(alan, hedef) as Satir[]).map((s) => this.iceAktarmaSatiri(s));
  }

  tumIceAktarmalar(alan: string): IceAktarmaKaydi[] {
    return (this.db.prepare("SELECT * FROM iceaktarmalar WHERE alan = ?").all(alan) as Satir[]).map((s) => this.iceAktarmaSatiri(s));
  }

  /** Dosyanın satırını içeren parçalar (en dar olan önce) */
  satirdakiParcalar(alan: string, yol: string, satir: number): ParcaKaydi[] {
    return (
      this.db.prepare("SELECT * FROM parcalar WHERE alan = ? AND yol = ? AND bas <= ? AND bit >= ? ORDER BY (bit - bas)").all(alan, yol, satir, satir) as Satir[]
    ).map((s) => this.parcaSatiri(s));
  }
}
