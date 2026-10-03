// Kalıcı veri: SQLite (WAL). Tüm SQL bu dosyada durur.
import Database from "better-sqlite3";
import type {
  Ajan,
  AjanDurumu,
  AkisOgesi,
  DenetimKaydi,
  Gorev,
  GorevDurumu,
  IzinModu,
  Kanal,
  Mesaj,
  Onay,
  OnayDurumu,
  OnayTuru,
  AjanSorusu,
  HafizaKaydi,
  HafizaTuru,
  PolitikaKurali,
  Proje,
  SoruDurumu,
} from "@arnorg/ortak";
import { aramaMetni, bugun, jsonOku, kimlik, simdi } from "./yardimci.js";

const SEMA = `
CREATE TABLE IF NOT EXISTS projeler (
  id TEXT PRIMARY KEY,
  ad TEXT NOT NULL,
  yol TEXT NOT NULL UNIQUE,
  aciklama TEXT NOT NULL DEFAULT '',
  varsayilan_dal TEXT NOT NULL DEFAULT 'main',
  olusturma TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ajanlar (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  ad TEXT NOT NULL,
  rol TEXT NOT NULL,
  rol_adi TEXT NOT NULL,
  model TEXT NOT NULL,
  yonetici_id TEXT,
  durum TEXT NOT NULL DEFAULT 'kapali',
  is_aciklamasi TEXT NOT NULL DEFAULT '',
  gorev_id TEXT,
  oturum_id TEXT,
  calisma_alani TEXT,
  dal TEXT,
  izin_modu TEXT NOT NULL,
  gunluk_butce REAL NOT NULL DEFAULT 5,
  talimat_eki TEXT NOT NULL DEFAULT '',
  olusturma TEXT NOT NULL,
  silindi INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ajanlar_proje ON ajanlar(proje_id);
CREATE TABLE IF NOT EXISTS gorevler (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  no INTEGER NOT NULL,
  baslik TEXT NOT NULL,
  aciklama TEXT NOT NULL DEFAULT '',
  kabul_olcutu TEXT NOT NULL DEFAULT '',
  durum TEXT NOT NULL,
  atanan_id TEXT,
  bagimliliklar TEXT NOT NULL DEFAULT '[]',
  etiket TEXT NOT NULL DEFAULT '',
  olusturan_id TEXT,
  olusturma TEXT NOT NULL,
  guncelleme TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gorevler_proje ON gorevler(proje_id);
CREATE TABLE IF NOT EXISTS kanallar (
  proje_id TEXT NOT NULL,
  ad TEXT NOT NULL,
  aciklama TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (proje_id, ad)
);
CREATE TABLE IF NOT EXISTS mesajlar (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  kanal TEXT NOT NULL,
  gonderen_id TEXT NOT NULL,
  gonderen_ad TEXT NOT NULL,
  metin TEXT NOT NULL,
  anilanlar TEXT NOT NULL DEFAULT '[]',
  zaman TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mesajlar_kanal ON mesajlar(proje_id, kanal, zaman);
CREATE TABLE IF NOT EXISTS denetim (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  ajan_id TEXT NOT NULL,
  ajan_ad TEXT NOT NULL,
  arac TEXT NOT NULL,
  girdi_ozeti TEXT NOT NULL,
  karar TEXT NOT NULL,
  kural TEXT,
  neden TEXT,
  arac_kimligi TEXT,
  zaman TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS denetim_proje ON denetim(proje_id, zaman);
CREATE TABLE IF NOT EXISTS onaylar (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  ajan_id TEXT,
  tur TEXT NOT NULL,
  baslik TEXT NOT NULL,
  ayrinti TEXT NOT NULL DEFAULT '',
  veri TEXT NOT NULL DEFAULT 'null',
  durum TEXT NOT NULL,
  olusturma TEXT NOT NULL,
  son_gecerlilik TEXT,
  sonuclanma TEXT,
  not_metni TEXT
);
CREATE INDEX IF NOT EXISTS onaylar_proje ON onaylar(proje_id, olusturma);
CREATE TABLE IF NOT EXISTS akis (
  sira INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  ajan_id TEXT NOT NULL,
  proje_id TEXT NOT NULL,
  zaman TEXT NOT NULL,
  veri TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS akis_ajan ON akis(ajan_id, sira);
CREATE TABLE IF NOT EXISTS maliyet (
  proje_id TEXT NOT NULL,
  ajan_id TEXT NOT NULL,
  gun TEXT NOT NULL,
  usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (proje_id, ajan_id, gun)
);
CREATE TABLE IF NOT EXISTS politika (
  proje_id TEXT PRIMARY KEY,
  kurallar TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS anahtar_deger (
  anahtar TEXT PRIMARY KEY,
  deger TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hafiza (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  tur TEXT NOT NULL,
  baslik TEXT NOT NULL,
  metin TEXT NOT NULL,
  etiketler TEXT NOT NULL DEFAULT '[]',
  kaynak_ajan_id TEXT,
  kaynak_ad TEXT NOT NULL,
  gorev_id TEXT,
  onem INTEGER NOT NULL DEFAULT 3,
  yerine_gecen TEXT,
  olusturma TEXT NOT NULL,
  guncelleme TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hafiza_proje ON hafiza(proje_id, tur, guncelleme);
CREATE VIRTUAL TABLE IF NOT EXISTS hafiza_ara USING fts5(id UNINDEXED, proje_id UNINDEXED, metin, tokenize = "unicode61 remove_diacritics 2");
CREATE TABLE IF NOT EXISTS defterler (
  ajan_id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  icerik TEXT NOT NULL,
  guncelleme TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sorular (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  soran_id TEXT NOT NULL,
  soran_ad TEXT NOT NULL,
  sorulu_id TEXT NOT NULL,
  sorulu_ad TEXT NOT NULL,
  soru TEXT NOT NULL,
  yanit TEXT,
  durum TEXT NOT NULL DEFAULT 'bekliyor',
  olusturma TEXT NOT NULL,
  yanitlanma TEXT
);
CREATE INDEX IF NOT EXISTS sorular_proje ON sorular(proje_id, olusturma);
`;

type Satir = Record<string, unknown>;

const AKIS_SINIRI = 3000;

export class Depo {
  readonly db: Database.Database;

  constructor(dosya: string) {
    this.db = new Database(dosya);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SEMA);
    this.gocEt();
  }

  /** Eski veri dosyalarına sonradan eklenen sütunlar */
  private gocEt(): void {
    const sutunlar = (this.db.prepare("PRAGMA table_info(maliyet)").all() as Satir[]).map((s) => String(s.name));
    if (!sutunlar.includes("token")) this.db.exec("ALTER TABLE maliyet ADD COLUMN token INTEGER NOT NULL DEFAULT 0");
    const ajanSutunlari = (this.db.prepare("PRAGMA table_info(ajanlar)").all() as Satir[]).map((s) => String(s.name));
    if (!ajanSutunlari.includes("karakter")) this.db.exec("ALTER TABLE ajanlar ADD COLUMN karakter TEXT");
  }

  kapat(): void {
    this.db.close();
  }

  // ---------------- projeler ----------------

  projeEkle(p: Omit<Proje, "id" | "olusturma">): Proje {
    const proje: Proje = { id: kimlik(), olusturma: simdi(), ...p };
    this.db
      .prepare("INSERT INTO projeler (id, ad, yol, aciklama, varsayilan_dal, olusturma) VALUES (?, ?, ?, ?, ?, ?)")
      .run(proje.id, proje.ad, proje.yol, proje.aciklama, proje.varsayilanDal, proje.olusturma);
    for (const [ad, aciklama] of [
      ["genel", "Şirket geneli: brief, rapor, duyuru"],
      ["muhendislik", "Teknik konuşmalar ve kararlar"],
    ] as const) {
      this.kanalEkle(proje.id, ad, aciklama);
    }
    return proje;
  }

  private projeSatiri(s: Satir): Proje {
    return {
      id: String(s.id),
      ad: String(s.ad),
      yol: String(s.yol),
      aciklama: String(s.aciklama),
      varsayilanDal: String(s.varsayilan_dal),
      olusturma: String(s.olusturma),
    };
  }

  projeler(): Proje[] {
    return (this.db.prepare("SELECT * FROM projeler ORDER BY olusturma").all() as Satir[]).map((s) => this.projeSatiri(s));
  }

  proje(id: string): Proje | null {
    const s = this.db.prepare("SELECT * FROM projeler WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.projeSatiri(s) : null;
  }

  projeYoluyla(yol: string): Proje | null {
    const s = this.db.prepare("SELECT * FROM projeler WHERE yol = ?").get(yol) as Satir | undefined;
    return s ? this.projeSatiri(s) : null;
  }

  projeSil(id: string): void {
    const sil = this.db.transaction(() => {
      for (const t of ["ajanlar", "gorevler", "kanallar", "mesajlar", "denetim", "onaylar", "akis", "maliyet", "politika"]) {
        this.db.prepare(`DELETE FROM ${t} WHERE proje_id = ?`).run(id);
      }
      this.db.prepare("DELETE FROM projeler WHERE id = ?").run(id);
    });
    sil();
  }

  // ---------------- ajanlar ----------------

  private ajanSatiri(s: Satir): Ajan {
    const projeId = String(s.proje_id);
    const id = String(s.id);
    return {
      id,
      projeId,
      ad: String(s.ad),
      rol: String(s.rol),
      rolAdi: String(s.rol_adi),
      model: String(s.model),
      yoneticiId: (s.yonetici_id as string | null) ?? null,
      durum: String(s.durum) as AjanDurumu,
      isAciklamasi: String(s.is_aciklamasi),
      gorevId: (s.gorev_id as string | null) ?? null,
      oturumId: (s.oturum_id as string | null) ?? null,
      calismaAlani: (s.calisma_alani as string | null) ?? null,
      dal: (s.dal as string | null) ?? null,
      izinModu: String(s.izin_modu) as IzinModu,
      gunlukButceUsd: Number(s.gunluk_butce),
      bugunHarcananUsd: this.ajanMaliyeti(projeId, id, bugun()),
      toplamHarcananUsd: this.ajanMaliyeti(projeId, id),
      bugunToken: this.ajanTokeni(projeId, id, bugun()),
      toplamToken: this.ajanTokeni(projeId, id),
      talimatEki: String(s.talimat_eki),
      karakter: (s.karakter as string | null) ?? null,
      olusturma: String(s.olusturma),
    };
  }

  ajanEkle(a: Omit<Ajan, "id" | "olusturma" | "bugunHarcananUsd" | "toplamHarcananUsd" | "bugunToken" | "toplamToken">): Ajan {
    const id = kimlik();
    this.db
      .prepare(
        `INSERT INTO ajanlar (id, proje_id, ad, rol, rol_adi, model, yonetici_id, durum, is_aciklamasi, gorev_id, oturum_id,
          calisma_alani, dal, izin_modu, gunluk_butce, talimat_eki, karakter, olusturma)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, a.projeId, a.ad, a.rol, a.rolAdi, a.model, a.yoneticiId, a.durum, a.isAciklamasi, a.gorevId, a.oturumId,
        a.calismaAlani, a.dal, a.izinModu, a.gunlukButceUsd, a.talimatEki, a.karakter ?? null, simdi(),
      );
    return this.ajan(id)!;
  }

  ajan(id: string): Ajan | null {
    const s = this.db.prepare("SELECT * FROM ajanlar WHERE id = ? AND silindi = 0").get(id) as Satir | undefined;
    return s ? this.ajanSatiri(s) : null;
  }

  ajanlar(projeId: string): Ajan[] {
    return (this.db.prepare("SELECT * FROM ajanlar WHERE proje_id = ? AND silindi = 0 ORDER BY olusturma").all(projeId) as Satir[]).map(
      (s) => this.ajanSatiri(s),
    );
  }

  /** Ada göre (büyük/küçük harf duyarsız) ajan bul */
  ajanAdla(projeId: string, ad: string): Ajan | null {
    const s = this.db
      .prepare("SELECT * FROM ajanlar WHERE proje_id = ? AND silindi = 0 AND lower(ad) = lower(?)")
      .get(projeId, ad) as Satir | undefined;
    return s ? this.ajanSatiri(s) : null;
  }

  ajanGuncelle(id: string, alanlar: Partial<Record<keyof Ajan, unknown>>): Ajan {
    const harita: Partial<Record<keyof Ajan, string>> = {
      model: "model",
      yoneticiId: "yonetici_id",
      durum: "durum",
      isAciklamasi: "is_aciklamasi",
      gorevId: "gorev_id",
      oturumId: "oturum_id",
      calismaAlani: "calisma_alani",
      dal: "dal",
      izinModu: "izin_modu",
      gunlukButceUsd: "gunluk_butce",
      talimatEki: "talimat_eki",
      karakter: "karakter",
    };
    const parcalar: string[] = [];
    const degerler: unknown[] = [];
    for (const [k, v] of Object.entries(alanlar)) {
      const sutun = harita[k as keyof Ajan];
      if (!sutun || v === undefined) continue;
      parcalar.push(`${sutun} = ?`);
      degerler.push(v);
    }
    if (parcalar.length) this.db.prepare(`UPDATE ajanlar SET ${parcalar.join(", ")} WHERE id = ?`).run(...degerler, id);
    return this.ajan(id)!;
  }

  ajanSil(id: string): void {
    this.db.prepare("UPDATE ajanlar SET silindi = 1, durum = 'kapali' WHERE id = ?").run(id);
  }

  /** Uygulama yeniden açılınca çalışıyor görünen ajanları kapalıya çeker */
  ajanDurumlariniSifirla(): void {
    this.db.prepare("UPDATE ajanlar SET durum = 'kapali', is_aciklamasi = '' WHERE durum != 'kapali'").run();
  }

  // ---------------- görevler ----------------

  private gorevSatiri(s: Satir): Gorev {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      no: Number(s.no),
      kod: `T-${s.no}`,
      baslik: String(s.baslik),
      aciklama: String(s.aciklama),
      kabulOlcutu: String(s.kabul_olcutu),
      durum: String(s.durum) as GorevDurumu,
      atananId: (s.atanan_id as string | null) ?? null,
      bagimliliklar: jsonOku<string[]>(s.bagimliliklar as string, []),
      etiket: String(s.etiket),
      olusturanId: (s.olusturan_id as string | null) ?? null,
      olusturma: String(s.olusturma),
      guncelleme: String(s.guncelleme),
    };
  }

  gorevEkle(g: Omit<Gorev, "id" | "no" | "kod" | "olusturma" | "guncelleme">): Gorev {
    const id = kimlik();
    const no = ((this.db.prepare("SELECT max(no) m FROM gorevler WHERE proje_id = ?").get(g.projeId) as Satir).m as number | null ?? 0) + 1;
    const z = simdi();
    this.db
      .prepare(
        `INSERT INTO gorevler (id, proje_id, no, baslik, aciklama, kabul_olcutu, durum, atanan_id, bagimliliklar, etiket, olusturan_id, olusturma, guncelleme)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, g.projeId, no, g.baslik, g.aciklama, g.kabulOlcutu, g.durum, g.atananId, JSON.stringify(g.bagimliliklar), g.etiket, g.olusturanId, z, z);
    return this.gorev(id)!;
  }

  gorev(id: string): Gorev | null {
    const s = this.db.prepare("SELECT * FROM gorevler WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.gorevSatiri(s) : null;
  }

  /** "T-12", "12" ya da kimlik ile görev bul */
  gorevKoduyla(projeId: string, kod: string): Gorev | null {
    const m = /^(?:T-)?(\d+)$/i.exec(kod.trim());
    if (m) {
      const s = this.db.prepare("SELECT * FROM gorevler WHERE proje_id = ? AND no = ?").get(projeId, Number(m[1])) as Satir | undefined;
      return s ? this.gorevSatiri(s) : null;
    }
    const g = this.gorev(kod);
    return g && g.projeId === projeId ? g : null;
  }

  gorevler(projeId: string): Gorev[] {
    return (this.db.prepare("SELECT * FROM gorevler WHERE proje_id = ? ORDER BY no").all(projeId) as Satir[]).map((s) => this.gorevSatiri(s));
  }

  gorevGuncelle(id: string, alanlar: Partial<Gorev>): Gorev {
    const harita: Partial<Record<keyof Gorev, string>> = {
      baslik: "baslik",
      aciklama: "aciklama",
      kabulOlcutu: "kabul_olcutu",
      durum: "durum",
      atananId: "atanan_id",
      bagimliliklar: "bagimliliklar",
      etiket: "etiket",
    };
    const parcalar: string[] = [];
    const degerler: unknown[] = [];
    for (const [k, v] of Object.entries(alanlar)) {
      const sutun = harita[k as keyof Gorev];
      if (!sutun || v === undefined) continue;
      parcalar.push(`${sutun} = ?`);
      degerler.push(k === "bagimliliklar" ? JSON.stringify(v) : v);
    }
    parcalar.push("guncelleme = ?");
    degerler.push(simdi());
    this.db.prepare(`UPDATE gorevler SET ${parcalar.join(", ")} WHERE id = ?`).run(...degerler, id);
    return this.gorev(id)!;
  }

  // ---------------- kanallar ve mesajlar ----------------

  kanalEkle(projeId: string, ad: string, aciklama = ""): void {
    this.db.prepare("INSERT OR IGNORE INTO kanallar (proje_id, ad, aciklama) VALUES (?, ?, ?)").run(projeId, ad, aciklama);
  }

  kanallar(projeId: string): Kanal[] {
    return (
      this.db
        .prepare(
          `SELECT k.ad, k.aciklama, (SELECT count(*) FROM mesajlar m WHERE m.proje_id = k.proje_id AND m.kanal = k.ad) sayi
           FROM kanallar k WHERE k.proje_id = ? ORDER BY k.ad = 'genel' DESC, k.ad`,
        )
        .all(projeId) as Satir[]
    ).map((s) => ({ ad: String(s.ad), aciklama: String(s.aciklama), mesajSayisi: Number(s.sayi) }));
  }

  mesajEkle(m: Omit<Mesaj, "id" | "zaman">): Mesaj {
    const mesaj: Mesaj = { id: kimlik(), zaman: simdi(), ...m };
    this.kanalEkle(m.projeId, m.kanal);
    this.db
      .prepare("INSERT INTO mesajlar (id, proje_id, kanal, gonderen_id, gonderen_ad, metin, anilanlar, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(mesaj.id, mesaj.projeId, mesaj.kanal, mesaj.gonderenId, mesaj.gonderenAd, mesaj.metin, JSON.stringify(mesaj.anilanlar), mesaj.zaman);
    return mesaj;
  }

  mesajlar(projeId: string, kanal: string, sinir = 200): Mesaj[] {
    const satirlar = this.db
      .prepare("SELECT * FROM mesajlar WHERE proje_id = ? AND kanal = ? ORDER BY zaman DESC, rowid DESC LIMIT ?")
      .all(projeId, kanal, sinir) as Satir[];
    return satirlar.reverse().map((s) => ({
      id: String(s.id),
      projeId: String(s.proje_id),
      kanal: String(s.kanal),
      gonderenId: String(s.gonderen_id),
      gonderenAd: String(s.gonderen_ad),
      metin: String(s.metin),
      anilanlar: jsonOku<string[]>(s.anilanlar as string, []),
      zaman: String(s.zaman),
    }));
  }

  // ---------------- denetim ----------------

  denetimEkle(k: Omit<DenetimKaydi, "id" | "zaman">): DenetimKaydi {
    const kayit: DenetimKaydi = { id: kimlik(), zaman: simdi(), ...k };
    this.db
      .prepare(
        "INSERT INTO denetim (id, proje_id, ajan_id, ajan_ad, arac, girdi_ozeti, karar, kural, neden, arac_kimligi, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(kayit.id, kayit.projeId, kayit.ajanId, kayit.ajanAd, kayit.arac, kayit.girdiOzeti, kayit.karar, kayit.kural, kayit.neden, kayit.aracKimligi, kayit.zaman);
    return kayit;
  }

  denetimKayitlari(projeId: string, sinir = 300): DenetimKaydi[] {
    return (this.db.prepare("SELECT * FROM denetim WHERE proje_id = ? ORDER BY zaman DESC, rowid DESC LIMIT ?").all(projeId, sinir) as Satir[]).map(
      (s) => ({
        id: String(s.id),
        projeId: String(s.proje_id),
        ajanId: String(s.ajan_id),
        ajanAd: String(s.ajan_ad),
        arac: String(s.arac),
        girdiOzeti: String(s.girdi_ozeti),
        karar: String(s.karar) as DenetimKaydi["karar"],
        kural: (s.kural as string | null) ?? null,
        neden: (s.neden as string | null) ?? null,
        aracKimligi: (s.arac_kimligi as string | null) ?? null,
        zaman: String(s.zaman),
      }),
    );
  }

  /** Verilen andan bu yana karar türüne göre denetim sayıları */
  denetimSayilari(projeId: string, baslangic: string): Record<string, number> {
    const satirlar = this.db.prepare("SELECT karar, count(*) n FROM denetim WHERE proje_id = ? AND zaman >= ? GROUP BY karar").all(projeId, baslangic) as Satir[];
    return Object.fromEntries(satirlar.map((s) => [String(s.karar), Number(s.n)]));
  }

  // ---------------- onaylar ----------------

  private onaySatiri(s: Satir): Onay {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      ajanId: (s.ajan_id as string | null) ?? null,
      tur: String(s.tur) as OnayTuru,
      baslik: String(s.baslik),
      ayrinti: String(s.ayrinti),
      veri: jsonOku<unknown>(s.veri as string, null),
      durum: String(s.durum) as OnayDurumu,
      olusturma: String(s.olusturma),
      sonGecerlilik: (s.son_gecerlilik as string | null) ?? null,
      sonuclanma: (s.sonuclanma as string | null) ?? null,
      not: (s.not_metni as string | null) ?? null,
    };
  }

  onayEkle(o: Omit<Onay, "id" | "olusturma" | "durum" | "sonuclanma" | "not">): Onay {
    const id = kimlik();
    this.db
      .prepare(
        "INSERT INTO onaylar (id, proje_id, ajan_id, tur, baslik, ayrinti, veri, durum, olusturma, son_gecerlilik) VALUES (?, ?, ?, ?, ?, ?, ?, 'bekliyor', ?, ?)",
      )
      .run(id, o.projeId, o.ajanId, o.tur, o.baslik, o.ayrinti, JSON.stringify(o.veri ?? null), simdi(), o.sonGecerlilik);
    return this.onay(id)!;
  }

  onay(id: string): Onay | null {
    const s = this.db.prepare("SELECT * FROM onaylar WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.onaySatiri(s) : null;
  }

  onaylar(projeId: string, durum?: OnayDurumu): Onay[] {
    const satirlar = durum
      ? this.db.prepare("SELECT * FROM onaylar WHERE proje_id = ? AND durum = ? ORDER BY olusturma DESC").all(projeId, durum)
      : this.db.prepare("SELECT * FROM onaylar WHERE proje_id = ? ORDER BY olusturma DESC LIMIT 500").all(projeId);
    return (satirlar as Satir[]).map((s) => this.onaySatiri(s));
  }

  onaySonuclandir(id: string, durum: OnayDurumu, not: string | null): Onay {
    this.db.prepare("UPDATE onaylar SET durum = ?, sonuclanma = ?, not_metni = ? WHERE id = ? AND durum = 'bekliyor'").run(durum, simdi(), not, id);
    return this.onay(id)!;
  }

  /** Uygulama kapanırken bekleyen araç onayları anlamını yitirir */
  bekleyenAracOnaylariniKapat(): void {
    this.db
      .prepare("UPDATE onaylar SET durum = 'zaman_asimi', sonuclanma = ?, not_metni = 'Uygulama yeniden başladı' WHERE durum = 'bekliyor' AND tur = 'arac'")
      .run(simdi());
  }

  // ---------------- akış ----------------

  akisEkle(projeId: string, oge: AkisOgesi): void {
    this.db.prepare("INSERT INTO akis (id, ajan_id, proje_id, zaman, veri) VALUES (?, ?, ?, ?, ?)").run(oge.id, oge.ajanId, projeId, oge.zaman, JSON.stringify(oge));
  }

  akis(ajanId: string, sinir = 300): AkisOgesi[] {
    const satirlar = this.db.prepare("SELECT veri FROM akis WHERE ajan_id = ? ORDER BY sira DESC LIMIT ?").all(ajanId, sinir) as Satir[];
    return satirlar.reverse().map((s) => jsonOku<AkisOgesi>(s.veri as string, null as unknown as AkisOgesi)).filter(Boolean);
  }

  akisBuda(ajanId: string): void {
    this.db
      .prepare("DELETE FROM akis WHERE ajan_id = ? AND sira <= (SELECT sira FROM akis WHERE ajan_id = ? ORDER BY sira DESC LIMIT 1 OFFSET ?)")
      .run(ajanId, ajanId, AKIS_SINIRI);
  }

  // ---------------- maliyet ----------------

  maliyetEkle(projeId: string, ajanId: string, usd: number, token = 0): void {
    const u = usd > 0 ? usd : 0;
    const t = token > 0 ? Math.round(token) : 0;
    if (!u && !t) return;
    this.db
      .prepare(
        `INSERT INTO maliyet (proje_id, ajan_id, gun, usd, token) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(proje_id, ajan_id, gun) DO UPDATE SET usd = usd + excluded.usd, token = token + excluded.token`,
      )
      .run(projeId, ajanId, bugun(), u, t);
  }

  ajanTokeni(projeId: string, ajanId: string, gun?: string): number {
    const s = (gun
      ? this.db.prepare("SELECT sum(token) t FROM maliyet WHERE proje_id = ? AND ajan_id = ? AND gun = ?").get(projeId, ajanId, gun)
      : this.db.prepare("SELECT sum(token) t FROM maliyet WHERE proje_id = ? AND ajan_id = ?").get(projeId, ajanId)) as Satir;
    return Number(s.t ?? 0);
  }

  projeTokeni(projeId: string, gun?: string): number {
    const s = (gun
      ? this.db.prepare("SELECT sum(token) t FROM maliyet WHERE proje_id = ? AND gun = ?").get(projeId, gun)
      : this.db.prepare("SELECT sum(token) t FROM maliyet WHERE proje_id = ?").get(projeId)) as Satir;
    return Number(s.t ?? 0);
  }

  ajanMaliyeti(projeId: string, ajanId: string, gun?: string): number {
    const s = (gun
      ? this.db.prepare("SELECT sum(usd) t FROM maliyet WHERE proje_id = ? AND ajan_id = ? AND gun = ?").get(projeId, ajanId, gun)
      : this.db.prepare("SELECT sum(usd) t FROM maliyet WHERE proje_id = ? AND ajan_id = ?").get(projeId, ajanId)) as Satir;
    return Number(s.t ?? 0);
  }

  projeMaliyeti(projeId: string, gun?: string): number {
    const s = (gun
      ? this.db.prepare("SELECT sum(usd) t FROM maliyet WHERE proje_id = ? AND gun = ?").get(projeId, gun)
      : this.db.prepare("SELECT sum(usd) t FROM maliyet WHERE proje_id = ?").get(projeId)) as Satir;
    return Number(s.t ?? 0);
  }

  /** Verilen günden (dahil) bu yana ajan başına harcama */
  donemMaliyeti(projeId: string, baslangicGun: string): { ajanId: string; usd: number; token: number }[] {
    return (
      this.db.prepare("SELECT ajan_id, sum(usd) t, sum(token) k FROM maliyet WHERE proje_id = ? AND gun >= ? GROUP BY ajan_id ORDER BY k DESC, t DESC").all(projeId, baslangicGun) as Satir[]
    ).map((s) => ({ ajanId: String(s.ajan_id), usd: Number(s.t ?? 0), token: Number(s.k ?? 0) }));
  }

  sirketMaliyeti(gun: string): number {
    const s = this.db.prepare("SELECT sum(usd) t FROM maliyet WHERE gun = ?").get(gun) as Satir;
    return Number(s.t ?? 0);
  }

  // ---------------- politika ----------------

  politika(projeId: string): PolitikaKurali[] | null {
    const s = this.db.prepare("SELECT kurallar FROM politika WHERE proje_id = ?").get(projeId) as Satir | undefined;
    return s ? jsonOku<PolitikaKurali[]>(s.kurallar as string, []) : null;
  }

  politikaYaz(projeId: string, kurallar: PolitikaKurali[]): void {
    this.db
      .prepare("INSERT INTO politika (proje_id, kurallar) VALUES (?, ?) ON CONFLICT(proje_id) DO UPDATE SET kurallar = excluded.kurallar")
      .run(projeId, JSON.stringify(kurallar));
  }

  // ---------------- proje hafızası ----------------

  private hafizaSatiri(s: Satir): HafizaKaydi {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      tur: String(s.tur) as HafizaTuru,
      baslik: String(s.baslik),
      metin: String(s.metin),
      etiketler: jsonOku<string[]>(s.etiketler as string, []),
      kaynakAjanId: (s.kaynak_ajan_id as string | null) ?? null,
      kaynakAd: String(s.kaynak_ad),
      gorevId: (s.gorev_id as string | null) ?? null,
      onem: Number(s.onem),
      yerineGecen: (s.yerine_gecen as string | null) ?? null,
      olusturma: String(s.olusturma),
      guncelleme: String(s.guncelleme),
    };
  }

  private hafizaDizinle(k: HafizaKaydi): void {
    this.db.prepare("DELETE FROM hafiza_ara WHERE id = ?").run(k.id);
    if (k.yerineGecen) return; // eskimiş kayıt aramada çıkmaz
    this.db
      .prepare("INSERT INTO hafiza_ara (id, proje_id, metin) VALUES (?, ?, ?)")
      .run(k.id, k.projeId, aramaMetni(`${k.baslik} ${k.metin} ${k.etiketler.join(" ")} ${k.kaynakAd}`));
  }

  hafizaEkle(k: Omit<HafizaKaydi, "id" | "olusturma" | "guncelleme" | "yerineGecen"> & { id?: string; olusturma?: string }): HafizaKaydi {
    const id = k.id ?? kimlik();
    const z = k.olusturma ?? simdi();
    this.db
      .prepare(
        `INSERT INTO hafiza (id, proje_id, tur, baslik, metin, etiketler, kaynak_ajan_id, kaynak_ad, gorev_id, onem, yerine_gecen, olusturma, guncelleme)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(id, k.projeId, k.tur, k.baslik, k.metin, JSON.stringify(k.etiketler), k.kaynakAjanId, k.kaynakAd, k.gorevId, k.onem, z, z);
    const kayit = this.hafizaKaydi(id)!;
    this.hafizaDizinle(kayit);
    return kayit;
  }

  hafizaKaydi(id: string): HafizaKaydi | null {
    const s = this.db.prepare("SELECT * FROM hafiza WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.hafizaSatiri(s) : null;
  }

  hafizaGuncelle(id: string, alanlar: Partial<Pick<HafizaKaydi, "tur" | "baslik" | "metin" | "etiketler" | "onem" | "yerineGecen" | "gorevId">>): HafizaKaydi | null {
    const eski = this.hafizaKaydi(id);
    if (!eski) return null;
    const y = { ...eski, ...alanlar };
    this.db
      .prepare("UPDATE hafiza SET tur = ?, baslik = ?, metin = ?, etiketler = ?, onem = ?, yerine_gecen = ?, gorev_id = ?, guncelleme = ? WHERE id = ?")
      .run(y.tur, y.baslik, y.metin, JSON.stringify(y.etiketler), y.onem, y.yerineGecen, y.gorevId, simdi(), id);
    const kayit = this.hafizaKaydi(id)!;
    this.hafizaDizinle(kayit);
    return kayit;
  }

  hafizaSil(id: string): void {
    this.db.prepare("DELETE FROM hafiza WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM hafiza_ara WHERE id = ?").run(id);
  }

  /** Geçerli (yerine başkası geçmemiş) kayıtlar; tür süzgeci isteğe bağlı */
  hafizaKayitlari(projeId: string, secenek: { tur?: HafizaTuru; eskilerDahil?: boolean; sinir?: number } = {}): HafizaKaydi[] {
    const kosul = ["proje_id = ?"];
    const degerler: unknown[] = [projeId];
    if (secenek.tur) {
      kosul.push("tur = ?");
      degerler.push(secenek.tur);
    }
    if (!secenek.eskilerDahil) kosul.push("yerine_gecen IS NULL");
    const satirlar = this.db
      .prepare(`SELECT * FROM hafiza WHERE ${kosul.join(" AND ")} ORDER BY onem DESC, guncelleme DESC LIMIT ?`)
      .all(...degerler, secenek.sinir ?? 500) as Satir[];
    return satirlar.map((s) => this.hafizaSatiri(s));
  }

  /** Tam metin arama: Türkçe harfler sadeleştirilir, her sözcük önek olarak aranır; puan bm25 + önem + tazelik */
  hafizaAra(projeId: string, sorgu: string, sinir = 20): HafizaKaydi[] {
    const sozcukler = aramaMetni(sorgu)
      .split(/[^a-z0-9]+/)
      .filter((s) => s.length >= 2)
      .slice(0, 12);
    if (!sozcukler.length) return [];
    const ifade = sozcukler.map((s) => `"${s}"*`).join(" OR ");
    const satirlar = this.db
      .prepare(
        `SELECT h.*, bm25(hafiza_ara) AS puan FROM hafiza_ara JOIN hafiza h ON h.id = hafiza_ara.id
         WHERE hafiza_ara MATCH ? AND hafiza_ara.proje_id = ? AND h.yerine_gecen IS NULL ORDER BY puan LIMIT 100`,
      )
      .all(ifade, projeId) as (Satir & { puan: number })[];
    const simdiMs = Date.now();
    return satirlar
      .map((s) => {
        const k = this.hafizaSatiri(s);
        const gun = (simdiMs - Date.parse(k.guncelleme)) / 86_400_000;
        // bm25 negatif; küçük olan daha iyi. Önem ve tazelik puanı iyileştirir.
        const puan = Number(s.puan) - k.onem * 0.6 + Math.min(gun, 60) * 0.02;
        return { k, puan };
      })
      .sort((a, b) => a.puan - b.puan)
      .slice(0, sinir)
      .map((x) => x.k);
  }

  // ---------------- ajan defterleri ----------------

  defter(ajanId: string): { icerik: string; guncelleme: string } | null {
    const s = this.db.prepare("SELECT icerik, guncelleme FROM defterler WHERE ajan_id = ?").get(ajanId) as Satir | undefined;
    return s ? { icerik: String(s.icerik), guncelleme: String(s.guncelleme) } : null;
  }

  defterYaz(ajanId: string, projeId: string, icerik: string): void {
    this.db
      .prepare(
        `INSERT INTO defterler (ajan_id, proje_id, icerik, guncelleme) VALUES (?, ?, ?, ?)
         ON CONFLICT(ajan_id) DO UPDATE SET icerik = excluded.icerik, guncelleme = excluded.guncelleme`,
      )
      .run(ajanId, projeId, icerik, simdi());
  }

  // ---------------- ajanlar arası sorular ----------------

  private soruSatiri(s: Satir): AjanSorusu {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      soranId: String(s.soran_id),
      soranAd: String(s.soran_ad),
      soruluId: String(s.sorulu_id),
      soruluAd: String(s.sorulu_ad),
      soru: String(s.soru),
      yanit: (s.yanit as string | null) ?? null,
      durum: String(s.durum) as SoruDurumu,
      olusturma: String(s.olusturma),
      yanitlanma: (s.yanitlanma as string | null) ?? null,
    };
  }

  soruEkle(s: Pick<AjanSorusu, "projeId" | "soranId" | "soranAd" | "soruluId" | "soruluAd" | "soru">): AjanSorusu {
    const id = kimlik();
    this.db
      .prepare("INSERT INTO sorular (id, proje_id, soran_id, soran_ad, sorulu_id, sorulu_ad, soru, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, s.projeId, s.soranId, s.soranAd, s.soruluId, s.soruluAd, s.soru, simdi());
    return this.soru(id)!;
  }

  soru(id: string): AjanSorusu | null {
    const s = this.db.prepare("SELECT * FROM sorular WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.soruSatiri(s) : null;
  }

  soruSonuclandir(id: string, durum: SoruDurumu, yanit: string | null): AjanSorusu | null {
    this.db.prepare("UPDATE sorular SET durum = ?, yanit = ?, yanitlanma = ? WHERE id = ? AND durum = 'bekliyor'").run(durum, yanit, simdi(), id);
    return this.soru(id);
  }

  sorular(projeId: string, secenek: { soruluId?: string; durum?: SoruDurumu; sinir?: number } = {}): AjanSorusu[] {
    const kosul = ["proje_id = ?"];
    const degerler: unknown[] = [projeId];
    if (secenek.soruluId) {
      kosul.push("sorulu_id = ?");
      degerler.push(secenek.soruluId);
    }
    if (secenek.durum) {
      kosul.push("durum = ?");
      degerler.push(secenek.durum);
    }
    return (this.db.prepare(`SELECT * FROM sorular WHERE ${kosul.join(" AND ")} ORDER BY olusturma DESC LIMIT ?`).all(...degerler, secenek.sinir ?? 200) as Satir[]).map(
      (s) => this.soruSatiri(s),
    );
  }

  /** Uygulama yeniden açılınca bekleyen sorular anlamını yitirir */
  bekleyenSorulariKapat(): void {
    this.db.prepare("UPDATE sorular SET durum = 'zaman_asimi', yanitlanma = ? WHERE durum = 'bekliyor'").run(simdi());
  }

  // ---------------- anahtar/değer ----------------

  deger(anahtar: string): string | null {
    const s = this.db.prepare("SELECT deger FROM anahtar_deger WHERE anahtar = ?").get(anahtar) as Satir | undefined;
    return s ? String(s.deger) : null;
  }

  degerYaz(anahtar: string, deger: string): void {
    this.db
      .prepare("INSERT INTO anahtar_deger (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger")
      .run(anahtar, deger);
  }
}
