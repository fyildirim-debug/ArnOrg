// Uygulama içi tarayıcının düzeltme notları: kurul sayfada bir öğe seçip "burası olmamış" notu bırakır, notlar
// birikir; "Hepsini yaptır" açık notların tamamını tek bir kurul mesajıyla #yonetim'e (CEO'ya) yazar.
//
// - Tablo: duzeltmeler (göç: duzeltmeGocu, Depo açılırken). Proje silinince notları da silinir (tetikleyici).
// - Ekran görüntüsü: <proje>/.arnorg/duzeltmeler/<id>.png. Ajanlar mesajdaki mutlak yolu Read ile açar. Klasörün
//   kendi .gitignore'u vardır: görüntüler .arnorg commit'lerine ve uzak depoya girmez.
// - Olaylar: duzeltme.guncellendi (ekleme, not düzeltme, gönderim), duzeltme.silindi.
// Uçlar: duzeltme-uclari.ts, sözleşme: docs/API.md "Düzeltme notları".
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import {
  KURUL,
  type Duzeltme,
  type DuzeltmeDurumu,
  type DuzeltmeEkleIstegi,
  type DuzeltmeGonderimi,
  type DuzeltmeGorunumu,
  type DuzeltmeKutusu,
  type DuzeltmeStilleri,
} from "@arnorg/ortak";
import { iki } from "./dil.js";
import { arnorgYolu } from "./proje-dosyalari.js";
import type { Sirket } from "./sirket.js";
import { ArnorgHatasi, bulunamadi, jsonOku, kimlik, kisalt, simdi } from "./yardimci.js";

/** Bir ekran görüntüsünün en büyük boyutu (çözülmüş PNG) */
export const GORSEL_SINIRI = 4 * 1024 * 1024;
/** Not ekleme isteğinin gövde sınırı: base64 görsel (4/3 kat) ve öğe alanları sığar */
export const DUZELTME_GOVDE_SINIRI = 6 * 1024 * 1024;
/** outerHTML kısaltması */
export const HTML_SINIRI = 2000;

const PNG_IMZASI = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Depo açılırken çalışan göç: tablo, dizin ve proje silinince notları temizleyen tetikleyici */
export function duzeltmeGocu(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS duzeltmeler (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  adres TEXT NOT NULL,
  sayfa_basligi TEXT NOT NULL DEFAULT '',
  secici TEXT,
  oge_metni TEXT,
  oge_html TEXT,
  stiller TEXT,
  kutu TEXT,
  gorunum TEXT,
  not_metni TEXT NOT NULL,
  gorsel TEXT,
  durum TEXT NOT NULL DEFAULT 'acik',
  zaman TEXT NOT NULL,
  gonderim_zamani TEXT
);
CREATE INDEX IF NOT EXISTS duzeltmeler_proje ON duzeltmeler(proje_id, durum, zaman);
CREATE TRIGGER IF NOT EXISTS duzeltmeler_proje_silindi AFTER DELETE ON projeler
BEGIN
  DELETE FROM duzeltmeler WHERE proje_id = OLD.id;
END;
`);
}

type Satir = Record<string, unknown>;

/** duzeltmeler tablosunun SQL'i */
export class DuzeltmeDeposu {
  constructor(private readonly db: Database.Database) {}

  private satir(s: Satir): Duzeltme {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      adres: String(s.adres),
      sayfaBasligi: String(s.sayfa_basligi ?? ""),
      secici: (s.secici as string | null) ?? null,
      ogeMetni: (s.oge_metni as string | null) ?? null,
      ogeHtml: (s.oge_html as string | null) ?? null,
      stiller: jsonOku<DuzeltmeStilleri | null>(s.stiller as string | null, null),
      kutu: jsonOku<DuzeltmeKutusu | null>(s.kutu as string | null, null),
      gorunum: jsonOku<DuzeltmeGorunumu | null>(s.gorunum as string | null, null),
      not: String(s.not_metni),
      gorsel: (s.gorsel as string | null) ?? null,
      durum: String(s.durum) as DuzeltmeDurumu,
      zaman: String(s.zaman),
      gonderimZamani: (s.gonderim_zamani as string | null) ?? null,
    };
  }

  ekle(d: Omit<Duzeltme, "durum" | "zaman" | "gonderimZamani">): Duzeltme {
    const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
    this.db
      .prepare(
        `INSERT INTO duzeltmeler (id, proje_id, adres, sayfa_basligi, secici, oge_metni, oge_html, stiller, kutu, gorunum, not_metni, gorsel, durum, zaman)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'acik', ?)`,
      )
      .run(d.id, d.projeId, d.adres, d.sayfaBasligi, d.secici, d.ogeMetni, d.ogeHtml, json(d.stiller), json(d.kutu), json(d.gorunum), d.not, d.gorsel, simdi());
    return this.bul(d.id)!;
  }

  bul(id: string): Duzeltme | null {
    const s = this.db.prepare("SELECT * FROM duzeltmeler WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.satir(s) : null;
  }

  /** Projenin notları eskiden yeniye (rowid aynı andaki kayıtları ekleniş sırasında tutar) */
  liste(projeId: string, durum?: DuzeltmeDurumu): Duzeltme[] {
    const satirlar = durum
      ? this.db.prepare("SELECT * FROM duzeltmeler WHERE proje_id = ? AND durum = ? ORDER BY zaman, rowid").all(projeId, durum)
      : this.db.prepare("SELECT * FROM duzeltmeler WHERE proje_id = ? ORDER BY zaman, rowid").all(projeId);
    return (satirlar as Satir[]).map((s) => this.satir(s));
  }

  notYaz(id: string, not: string): Duzeltme | null {
    this.db.prepare("UPDATE duzeltmeler SET not_metni = ? WHERE id = ?").run(not, id);
    return this.bul(id);
  }

  /** Verilen açık notları gönderildi yapar; değişenleri döndürür */
  gonderildi(idler: string[], zaman: string): Duzeltme[] {
    const guncelle = this.db.prepare("UPDATE duzeltmeler SET durum = 'gonderildi', gonderim_zamani = ? WHERE id = ? AND durum = 'acik'");
    this.db.transaction((l: string[]) => {
      for (const id of l) guncelle.run(zaman, id);
    })(idler);
    return idler.map((id) => this.bul(id)).filter((d): d is Duzeltme => d !== null);
  }

  sil(id: string): void {
    this.db.prepare("DELETE FROM duzeltmeler WHERE id = ?").run(id);
  }
}

/**
 * base64 PNG'yi çözer ve denetler: isteğe bağlı data: öneki, yalnız base64 karakterleri, boyut sınırı (çözmeden önce
 * hesaplanır) ve PNG imzası. Sınır aşılırsa 413, geçersizse 400.
 */
export function pngCoz(veri: string, sinir = GORSEL_SINIRI): Buffer {
  const govde = veri.replace(/^data:image\/png;base64,/i, "").replace(/\s+/g, "");
  if (!govde || govde.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(govde)) {
    throw new ArnorgHatasi(iki("Görsel geçerli bir base64 PNG değil.", "The image is not a valid base64 PNG."));
  }
  const dolgu = govde.endsWith("==") ? 2 : govde.endsWith("=") ? 1 : 0;
  const boyut = Math.floor((govde.length * 3) / 4) - dolgu;
  if (boyut > sinir) {
    throw new ArnorgHatasi(
      iki(`Görsel çok büyük (${mb(boyut)} MB); en çok ${mb(sinir)} MB olabilir.`, `The image is too large (${mb(boyut)} MB); the limit is ${mb(sinir)} MB.`),
      413,
    );
  }
  const tampon = Buffer.from(govde, "base64");
  if (tampon.length < 33 || !tampon.subarray(0, 8).equals(PNG_IMZASI)) {
    throw new ArnorgHatasi(iki("Görsel PNG değil.", "The image is not a PNG."));
  }
  return tampon;
}

function mb(bayt: number): string {
  return (bayt / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

/** Projenin düzeltme görüntüleri klasörü; ilk yazımda .gitignore'u kurulur (görüntüler commit'lenmez) */
export function duzeltmeKlasoru(projeYolu: string): string {
  const dizin = arnorgYolu(projeYolu, "duzeltmeler");
  fs.mkdirSync(dizin, { recursive: true });
  const yoksay = path.join(dizin, ".gitignore");
  if (!fs.existsSync(yoksay)) {
    fs.writeFileSync(
      yoksay,
      iki(
        "# ArnOrg tarayıcısının düzeltme notu görüntüleri: yerelde kalır, commit'lenmez\n*\n",
        "# Screenshots of ArnOrg browser correction notes: they stay local and are not committed\n*\n",
      ),
      "utf8",
    );
  }
  return dizin;
}

/** Tek satıra indirir; çok satırlı not " / " ile birleşir */
function tekSatir(metin: string): string {
  return metin
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * "Hepsini yaptır" mesajı (geçerli dilde): üstte iş tarifi, altta numaralı notlar. Her satırda adres, öğe seçicisi,
 * öğe metni, seçim anındaki görünüm boyutu, not ve ekran görüntüsünün mutlak yolu (varsa).
 */
export function gonderimMetni(notlar: Duzeltme[]): string {
  const n = notlar.length;
  const bas = iki(
    n === 1
      ? "Tarayıcıda 1 düzeltme notu bıraktım. Bunun için görev aç (kabul ölçütüyle), uygun çalışana ata ve başlat."
      : `Tarayıcıda ${n} düzeltme notu bıraktım. Her biri için görev aç (kabul ölçütüyle), uygun çalışana ata ve başlat.`,
    n === 1
      ? "I left 1 correction note in the browser. Open a task for it (with acceptance criteria), assign it to the right employee and start it."
      : `I left ${n} correction notes in the browser. Open a task for each (with acceptance criteria), assign it to the right employee and start it.`,
  );
  const satirlar = notlar.map((d, i) => {
    const parcalar = [d.adres];
    if (d.secici) parcalar.push(`${iki("öğe", "element")}: ${kisalt(d.secici, 300)}`);
    const metin = d.ogeMetni ? tekSatir(d.ogeMetni) : "";
    if (metin) parcalar.push(`"${kisalt(metin, 120).replace(/"/g, "'")}"`);
    if (d.gorunum) parcalar.push(`${iki("görünüm", "viewport")}: ${d.gorunum.genislik}×${d.gorunum.yukseklik}`);
    parcalar.push(`${iki("not", "note")}: ${tekSatir(d.not)}`);
    if (d.gorsel) parcalar.push(`${iki("ekran görüntüsü", "screenshot")}: ${d.gorsel}`);
    return `${i + 1}) ${parcalar.join(" · ")}`;
  });
  return `${bas}\n\n${satirlar.join("\n")}`;
}

/** Adres http ya da https olmalı (elle eklenen notta da); sonda boşluk kırpılır */
function adresDenetle(adres: string): string {
  const temiz = adres.trim();
  try {
    const u = new URL(temiz);
    if (u.protocol === "http:" || u.protocol === "https:") return temiz;
  } catch {
    // aşağıda hata
  }
  throw new ArnorgHatasi(iki("Adres http:// ya da https:// ile başlayan geçerli bir adres olmalı.", "The address must be a valid http:// or https:// URL."));
}

/** Düzeltme notları: ekleme (görsel diske), düzeltme, silme, CEO'ya gönderim */
export class Duzeltmeler {
  readonly depo: DuzeltmeDeposu;
  /** Gönderimi süren projeler: çift tık aynı notları iki kez göndermesin */
  private readonly gonderiliyor = new Set<string>();

  constructor(private readonly sirket: Sirket) {
    this.depo = new DuzeltmeDeposu(sirket.depo.db);
  }

  listele(projeId: string, durum?: DuzeltmeDurumu): Duzeltme[] {
    this.sirket.proje(projeId);
    return this.depo.liste(projeId, durum);
  }

  bul(id: string): Duzeltme {
    const d = this.depo.bul(id);
    if (!d) throw bulunamadi("Düzeltme notu", "Correction note");
    return d;
  }

  ekle(projeId: string, istek: DuzeltmeEkleIstegi): Duzeltme {
    const proje = this.sirket.proje(projeId);
    const not = istek.not.trim();
    if (!not) throw new ArnorgHatasi(iki("Not boş olamaz.", "The note cannot be empty."));
    const adres = adresDenetle(istek.adres);
    const id = kimlik();
    // Görsel önce denetlenir; geçersizse kayıt açılmaz
    const png = istek.gorsel ? pngCoz(istek.gorsel) : null;
    let gorsel: string | null = null;
    if (png) {
      gorsel = path.join(duzeltmeKlasoru(proje.yol), `${id}.png`);
      fs.writeFileSync(gorsel, png);
    }
    try {
      const d = this.depo.ekle({
        id,
        projeId,
        adres,
        sayfaBasligi: (istek.sayfaBasligi ?? "").trim().slice(0, 500),
        secici: istek.secici?.trim() || null,
        ogeMetni: istek.ogeMetni?.trim() || null,
        ogeHtml: istek.ogeHtml ? istek.ogeHtml.slice(0, HTML_SINIRI) : null,
        stiller: istek.stiller ?? null,
        kutu: istek.kutu ?? null,
        gorunum: istek.gorunum ?? null,
        not,
        gorsel,
      });
      this.yayinla(d);
      return d;
    } catch (h) {
      if (gorsel) fs.rmSync(gorsel, { force: true });
      throw h;
    }
  }

  /** Açık notun metnini düzeltir; gönderilmiş not değişmez (409) */
  notuDuzelt(id: string, not: string): Duzeltme {
    const d = this.bul(id);
    if (d.durum !== "acik") throw new ArnorgHatasi(iki("Gönderilmiş not değiştirilemez.", "A note that was already sent can't be changed."), 409);
    const temiz = not.trim();
    if (!temiz) throw new ArnorgHatasi(iki("Not boş olamaz.", "The note cannot be empty."));
    const yeni = this.depo.notYaz(id, temiz)!;
    this.yayinla(yeni);
    return yeni;
  }

  /** Notu siler. Açık notun görüntüsü de silinir; gönderilmişinki kalır (CEO'nun açtığı görevler o yolu anıyor) */
  sil(id: string): void {
    const d = this.bul(id);
    this.depo.sil(id);
    if (d.durum === "acik" && d.gorsel) fs.rmSync(d.gorsel, { force: true });
    this.sirket.olaylar.yayinla({ tur: "duzeltme.silindi", projeId: d.projeId, id });
  }

  /** Görüntünün diskteki yolu; not görüntüsüzse ya da dosya yoksa 404 */
  gorselYolu(id: string): string {
    const d = this.bul(id);
    if (!d.gorsel || !fs.existsSync(d.gorsel)) throw bulunamadi("Görüntü", "Screenshot");
    return d.gorsel;
  }

  /**
   * "Hepsini yaptır": açık notların tamamı tek bir kurul mesajı olarak #yonetim'e yazılır (CEO uyanır, mesaj
   * Karargâh'taki CEO sohbetinde görünür); notlar gönderildi olur. Açık not yoksa 400.
   */
  async gonder(projeId: string): Promise<DuzeltmeGonderimi> {
    this.sirket.proje(projeId);
    if (this.gonderiliyor.has(projeId)) throw new ArnorgHatasi(iki("Notlar zaten gönderiliyor.", "The notes are already being sent."), 409);
    const acik = this.depo.liste(projeId, "acik");
    if (!acik.length) throw new ArnorgHatasi(iki("Gönderilecek açık not yok.", "There are no open notes to send."));
    this.gonderiliyor.add(projeId);
    try {
      const mesaj = await this.sirket.mesajGonder(projeId, "yonetim", KURUL, gonderimMetni(acik));
      const gonderilen = this.depo.gonderildi(
        acik.map((d) => d.id),
        simdi(),
      );
      for (const d of gonderilen) this.yayinla(d);
      return { mesaj, gonderilen };
    } finally {
      this.gonderiliyor.delete(projeId);
    }
  }

  private yayinla(d: Duzeltme): void {
    this.sirket.olaylar.yayinla({ tur: "duzeltme.guncellendi", projeId: d.projeId, duzeltme: d });
  }
}
