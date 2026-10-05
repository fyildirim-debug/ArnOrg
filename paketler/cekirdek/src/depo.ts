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
  KararKaynagi,
  KararVeren,
  Mesaj,
  Onay,
  OnayDurumu,
  OnayTuru,
  AjanSorusu,
  HafizaKaydi,
  HafizaTuru,
  PolitikaKurali,
  KuralDurumu,
  KuralKaniti,
  KuralKaynagi,
  KureselKural,
  OtomatikOnay,
  Proje,
  Soz,
  SozDurumu,
  SoruDurumu,
  ZekaGunlukKaydi,
  ZekaGunlukTuru,
  YetenekKimligi,
} from "@arnorg/ortak";
import { VARSAYILAN_KARAR_VEREN, VARSAYILAN_OTOMATIK_ONAY_TURLERI } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { duzeltmeGocu } from "./duzeltmeler.js";
import { aramaMetni, bugun, jsonOku, kimlik, simdi } from "./yardimci.js";
import { rolYetenekleri } from "./yetenekler.js";

/** Uzak depo adresinden GitHub "sahip/ad": https://github.com/a/b(.git), git@github.com:a/b(.git), ssh://git@github.com/a/b */
export function githubDeposu(adres: string | null | undefined): string | null {
  if (!adres) return null;
  const m = adres.trim().match(/^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

const SEMA = `
CREATE TABLE IF NOT EXISTS projeler (
  id TEXT PRIMARY KEY,
  ad TEXT NOT NULL,
  yol TEXT NOT NULL UNIQUE,
  aciklama TEXT NOT NULL DEFAULT '',
  varsayilan_dal TEXT NOT NULL DEFAULT 'main',
  olusturma TEXT NOT NULL,
  uzak_adres TEXT,
  otomatik_gonder INTEGER NOT NULL DEFAULT 1,
  hazirlik TEXT NOT NULL DEFAULT 'tamam',
  otomatik_onay TEXT NOT NULL DEFAULT '{"etkin":false,"turler":[]}'
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
CREATE TABLE IF NOT EXISTS kullanim (
  proje_id TEXT NOT NULL,
  ajan_id TEXT NOT NULL,
  gun TEXT NOT NULL,
  token INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS sozler (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  veren_id TEXT NOT NULL,
  veren_ad TEXT NOT NULL,
  alici_id TEXT,
  alici_ad TEXT NOT NULL,
  metin TEXT NOT NULL,
  son_tarih TEXT,
  durum TEXT NOT NULL DEFAULT 'acik',
  not_metni TEXT,
  olusturma TEXT NOT NULL,
  kapanis TEXT
);
CREATE INDEX IF NOT EXISTS sozler_proje ON sozler(proje_id, durum);
CREATE TABLE IF NOT EXISTS kuresel_kurallar (
  id TEXT PRIMARY KEY,
  metin TEXT NOT NULL,
  kapsam TEXT NOT NULL DEFAULT '[]',
  kaynak TEXT NOT NULL,
  kanitlar TEXT NOT NULL DEFAULT '[]',
  guven REAL NOT NULL DEFAULT 0.5,
  kullanim INTEGER NOT NULL DEFAULT 0,
  yarar INTEGER NOT NULL DEFAULT 0,
  ihlal INTEGER NOT NULL DEFAULT 0,
  durum TEXT NOT NULL DEFAULT 'aday',
  olusturma TEXT NOT NULL,
  guncelleme TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS zeka_gunlugu (
  id TEXT PRIMARY KEY,
  zaman TEXT NOT NULL,
  tur TEXT NOT NULL,
  metin TEXT NOT NULL,
  kural_id TEXT
);
CREATE INDEX IF NOT EXISTS zeka_gunlugu_zaman ON zeka_gunlugu(zaman);
`;

type Satir = Record<string, unknown>;

/** Denetim sayfalamasında kalınan yer: son kaydın zamanı ve satır sırası */
export interface DenetimImleci {
  zaman: string;
  sira: number;
}

const AKIS_SINIRI = 3000;

/** Kanal ve mesaj sayısı; WHERE ve ORDER BY çağıran yerde eklenir */
const KANAL_SORGUSU = "SELECT k.*, (SELECT count(*) FROM mesajlar m WHERE m.proje_id = k.proje_id AND m.kanal = k.ad) sayi FROM kanallar k";

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

  /** Eski veri dosyalarının göçü: sonradan eklenen sütunlar; kaldırılan API girişi ve dolar bütçesinin izleri silinir */
  private gocEt(): void {
    const tablolar = new Set((this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Satir[]).map((s) => String(s.name)));
    if (tablolar.has("maliyet")) {
      // Eski maliyet tablosu: token sayıları kullanim tablosuna taşınır, dolar tutarları silinir
      const sutunlar = (this.db.prepare("PRAGMA table_info(maliyet)").all() as Satir[]).map((s) => String(s.name));
      const tasi = this.db.transaction(() => {
        if (sutunlar.includes("token")) {
          this.db.exec("INSERT OR IGNORE INTO kullanim (proje_id, ajan_id, gun, token) SELECT proje_id, ajan_id, gun, token FROM maliyet WHERE token > 0");
        }
        this.db.exec("DROP TABLE maliyet");
      });
      tasi();
    }
    // 0.0.2: uzak depo, otomatik gönderim ve hazırlık görüşmesi; var olan projelerin hazırlığı bitmiş sayılır
    const projeSutunlari = (this.db.prepare("PRAGMA table_info(projeler)").all() as Satir[]).map((s) => String(s.name));
    if (!projeSutunlari.includes("uzak_adres")) this.db.exec("ALTER TABLE projeler ADD COLUMN uzak_adres TEXT");
    if (!projeSutunlari.includes("otomatik_gonder")) this.db.exec("ALTER TABLE projeler ADD COLUMN otomatik_gonder INTEGER NOT NULL DEFAULT 1");
    if (!projeSutunlari.includes("hazirlik")) this.db.exec("ALTER TABLE projeler ADD COLUMN hazirlik TEXT NOT NULL DEFAULT 'tamam'");
    if (!projeSutunlari.includes("otomatik_onay")) this.db.exec(`ALTER TABLE projeler ADD COLUMN otomatik_onay TEXT NOT NULL DEFAULT '{"etkin":false,"turler":[]}'`);
    // 0.0.4: kalite kapısı (birleştirmeden önce koşan test ve hazırlık komutu, süre sınırı)
    if (!projeSutunlari.includes("test_komutu")) this.db.exec("ALTER TABLE projeler ADD COLUMN test_komutu TEXT");
    if (!projeSutunlari.includes("hazirlik_komutu")) this.db.exec("ALTER TABLE projeler ADD COLUMN hazirlik_komutu TEXT");
    if (!projeSutunlari.includes("test_zaman_asimi_dk")) this.db.exec("ALTER TABLE projeler ADD COLUMN test_zaman_asimi_dk REAL NOT NULL DEFAULT 20");
    // 0.0.7: karar yetkisi (ceo: tam otonom, kurul); var olan projeler de CEO'ya geçer
    if (!projeSutunlari.includes("karar_veren")) this.db.exec("ALTER TABLE projeler ADD COLUMN karar_veren TEXT NOT NULL DEFAULT 'ceo'");
    // 0.0.7: onayı kimin karara bağladığı (kurul, otomatik, ceo) ve adı; bekleyen onayın muhatabı (ceo ya da kurul)
    const onaySutunlari = (this.db.prepare("PRAGMA table_info(onaylar)").all() as Satir[]).map((s) => String(s.name));
    if (!onaySutunlari.includes("karar_kaynagi")) this.db.exec("ALTER TABLE onaylar ADD COLUMN karar_kaynagi TEXT");
    if (!onaySutunlari.includes("karar_veren_ad")) this.db.exec("ALTER TABLE onaylar ADD COLUMN karar_veren_ad TEXT");
    if (!onaySutunlari.includes("muhatap")) this.db.exec("ALTER TABLE onaylar ADD COLUMN muhatap TEXT");
    // Kurul ile CEO'nun bire bir kanalı her projede bulunur
    this.db.prepare("INSERT OR IGNORE INTO kanallar (proje_id, ad, aciklama) SELECT id, 'yonetim', 'Yönetim kurulu ile CEO''nun bire bir sohbeti' FROM projeler").run();
    // 0.0.5: kurulun kurduğu kanallar (özel); üyeler ajan kimlikleri (JSON), serbest konuşmanın durumu ve konusu
    const kanalSutunlari = (this.db.prepare("PRAGMA table_info(kanallar)").all() as Satir[]).map((s) => String(s.name));
    if (!kanalSutunlari.includes("ozel")) this.db.exec("ALTER TABLE kanallar ADD COLUMN ozel INTEGER NOT NULL DEFAULT 0");
    if (!kanalSutunlari.includes("uyeler")) this.db.exec("ALTER TABLE kanallar ADD COLUMN uyeler TEXT NOT NULL DEFAULT '[]'");
    if (!kanalSutunlari.includes("konusma")) this.db.exec("ALTER TABLE kanallar ADD COLUMN konusma TEXT NOT NULL DEFAULT 'durdu'");
    if (!kanalSutunlari.includes("konu")) this.db.exec("ALTER TABLE kanallar ADD COLUMN konu TEXT");
    if (!kanalSutunlari.includes("konusma_baslangic")) this.db.exec("ALTER TABLE kanallar ADD COLUMN konusma_baslangic TEXT");
    if (!kanalSutunlari.includes("olusturma")) this.db.exec("ALTER TABLE kanallar ADD COLUMN olusturma TEXT");
    const ajanSutunlari = (this.db.prepare("PRAGMA table_info(ajanlar)").all() as Satir[]).map((s) => String(s.name));
    if (!ajanSutunlari.includes("karakter")) this.db.exec("ALTER TABLE ajanlar ADD COLUMN karakter TEXT");
    if (ajanSutunlari.includes("gunluk_butce")) this.db.exec("ALTER TABLE ajanlar DROP COLUMN gunluk_butce");
    // 0.0.5: çalışan başına yetenekler (JSON); kaydı olmayan ajanlar rollerinin varsayılanlarını alır
    if (!ajanSutunlari.includes("yetenekler")) this.db.exec("ALTER TABLE ajanlar ADD COLUMN yetenekler TEXT");
    const yeteneksiz = this.db.prepare("SELECT id, rol FROM ajanlar WHERE yetenekler IS NULL").all() as Satir[];
    if (yeteneksiz.length) {
      const yaz = this.db.prepare("UPDATE ajanlar SET yetenekler = ? WHERE id = ?");
      this.db.transaction(() => {
        for (const s of yeteneksiz) yaz.run(JSON.stringify(rolYetenekleri(String(s.rol))), s.id);
      })();
    }
    this.db.prepare("DELETE FROM onaylar WHERE tur = 'butce'").run();
    // Eski işe alım tekliflerinin verisindeki günlük bütçe alanı
    this.db
      .prepare("UPDATE onaylar SET veri = json_remove(veri, '$.gunlukButceUsd') WHERE json_valid(veri) AND json_type(veri, '$.gunlukButceUsd') IS NOT NULL")
      .run();
    this.db.prepare("DELETE FROM denetim WHERE kural IN ('Bütçe', 'Şirket bütçesi')").run();
    // 0.0.4: denetim kaydında alt ajan kimliği (Agent aracıyla açılan alt ajanın çağrıları); eski kayıtlarda boş
    const denetimSutunlari = (this.db.prepare("PRAGMA table_info(denetim)").all() as Satir[]).map((s) => String(s.name));
    if (!denetimSutunlari.includes("alt_ajan")) this.db.exec("ALTER TABLE denetim ADD COLUMN alt_ajan TEXT");
    // 0.0.4: saklama süresi dolan kayıtlar (bütün projeler) zamana göre arşivlenir
    this.db.exec("CREATE INDEX IF NOT EXISTS denetim_zaman ON denetim(zaman)");
    // 0.0.5: uygulama içi tarayıcının düzeltme notları (tablo ve SQL: duzeltmeler.ts)
    duzeltmeGocu(this.db);
  }

  kapat(): void {
    this.db.close();
  }

  // ---------------- projeler ----------------

  projeEkle(p: Pick<Proje, "ad" | "yol" | "aciklama" | "varsayilanDal"> & Partial<Pick<Proje, "uzakAdres" | "otomatikGonder" | "hazirlik" | "kararVeren">>): Proje {
    const id = kimlik();
    const olusturma = simdi();
    this.db
      .prepare("INSERT INTO projeler (id, ad, yol, aciklama, varsayilan_dal, olusturma, uzak_adres, otomatik_gonder, hazirlik, karar_veren) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, p.ad, p.yol, p.aciklama, p.varsayilanDal, olusturma, p.uzakAdres ?? null, p.otomatikGonder === false ? 0 : 1, p.hazirlik ?? "tamam", p.kararVeren ?? VARSAYILAN_KARAR_VEREN);
    // Kanal açıklaması proje açıldığı andaki dilde yazılır (API sistem kanallarını geçerli dilde gösterir)
    for (const [ad, aciklama] of [
      ["genel", iki("Şirket geneli: brief, rapor, duyuru", "Company-wide: brief, reports, announcements")],
      ["yonetim", iki("Yönetim kurulu ile CEO'nun bire bir sohbeti", "One-on-one between the board and the CEO")],
      ["muhendislik", iki("Teknik konuşmalar ve kararlar", "Technical discussions and decisions")],
    ] as const) {
      this.kanalEkle(id, ad, aciklama);
    }
    return this.proje(id)!;
  }

  projeGuncelle(
    id: string,
    alanlar: Partial<Pick<Proje, "ad" | "aciklama" | "varsayilanDal" | "uzakAdres" | "otomatikGonder" | "hazirlik" | "otomatikOnay" | "kararVeren" | "testKomutu" | "hazirlikKomutu" | "testZamanAsimiDk">>,
  ): Proje {
    const sutunlar: Record<string, string> = {
      ad: "ad",
      aciklama: "aciklama",
      varsayilanDal: "varsayilan_dal",
      uzakAdres: "uzak_adres",
      otomatikGonder: "otomatik_gonder",
      hazirlik: "hazirlik",
      otomatikOnay: "otomatik_onay",
      kararVeren: "karar_veren",
      testKomutu: "test_komutu",
      hazirlikKomutu: "hazirlik_komutu",
      testZamanAsimiDk: "test_zaman_asimi_dk",
    };
    const atamalar: string[] = [];
    const degerler: unknown[] = [];
    for (const [k, v] of Object.entries(alanlar)) {
      if (v === undefined || !sutunlar[k]) continue;
      atamalar.push(`${sutunlar[k]} = ?`);
      degerler.push(typeof v === "boolean" ? (v ? 1 : 0) : v !== null && typeof v === "object" ? JSON.stringify(v) : v);
    }
    if (atamalar.length) this.db.prepare(`UPDATE projeler SET ${atamalar.join(", ")} WHERE id = ?`).run(...degerler, id);
    const p = this.proje(id);
    if (!p) throw new Error(iki("Proje bulunamadı", "Project not found"));
    return p;
  }

  private projeSatiri(s: Satir): Proje {
    const uzak = (s.uzak_adres as string | null) ?? null;
    return {
      id: String(s.id),
      ad: String(s.ad),
      yol: String(s.yol),
      aciklama: String(s.aciklama),
      varsayilanDal: String(s.varsayilan_dal),
      olusturma: String(s.olusturma),
      uzakAdres: uzak,
      github: githubDeposu(uzak),
      otomatikGonder: Number(s.otomatik_gonder ?? 1) === 1,
      hazirlik: (String(s.hazirlik ?? "tamam") as Proje["hazirlik"]),
      // Hiç ayarlanmamış projede kutu işaretlenince varsayılan türler geçerli olsun
      otomatikOnay: jsonOku<OtomatikOnay>(s.otomatik_onay as string | null, { etkin: false, turler: [...VARSAYILAN_OTOMATIK_ONAY_TURLERI] }),
      kararVeren: s.karar_veren === "kurul" ? "kurul" : "ceo",
      testKomutu: (s.test_komutu as string | null) ?? null,
      hazirlikKomutu: (s.hazirlik_komutu as string | null) ?? null,
      testZamanAsimiDk: Number(s.test_zaman_asimi_dk ?? 20) || 20,
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
      for (const t of ["ajanlar", "gorevler", "kanallar", "mesajlar", "denetim", "onaylar", "akis", "kullanim", "politika", "sozler"]) {
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
      bugunToken: this.ajanTokeni(projeId, id, bugun()),
      toplamToken: this.ajanTokeni(projeId, id),
      talimatEki: String(s.talimat_eki),
      karakter: (s.karakter as string | null) ?? null,
      olusturma: String(s.olusturma),
      yetenekler: jsonOku<YetenekKimligi[] | null>(s.yetenekler as string | null, null) ?? rolYetenekleri(String(s.rol)),
    };
  }

  ajanEkle(a: Omit<Ajan, "id" | "olusturma" | "bugunToken" | "toplamToken">): Ajan {
    const id = kimlik();
    this.db
      .prepare(
        `INSERT INTO ajanlar (id, proje_id, ad, rol, rol_adi, model, yonetici_id, durum, is_aciklamasi, gorev_id, oturum_id,
          calisma_alani, dal, izin_modu, talimat_eki, karakter, olusturma, yetenekler)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, a.projeId, a.ad, a.rol, a.rolAdi, a.model, a.yoneticiId, a.durum, a.isAciklamasi, a.gorevId, a.oturumId,
        a.calismaAlani, a.dal, a.izinModu, a.talimatEki, a.karakter ?? null, simdi(), JSON.stringify(a.yetenekler ?? rolYetenekleri(a.rol)),
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
      talimatEki: "talimat_eki",
      karakter: "karakter",
      yetenekler: "yetenekler",
    };
    const parcalar: string[] = [];
    const degerler: unknown[] = [];
    for (const [k, v] of Object.entries(alanlar)) {
      const sutun = harita[k as keyof Ajan];
      if (!sutun || v === undefined) continue;
      parcalar.push(`${sutun} = ?`);
      degerler.push(k === "yetenekler" ? JSON.stringify(v) : v);
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
    return (this.db.prepare(`${KANAL_SORGUSU} WHERE k.proje_id = ? ORDER BY k.ad = 'genel' DESC, k.ad`).all(projeId) as Satir[]).map((s) => this.kanalSatiri(s));
  }

  kanal(projeId: string, ad: string): Kanal | null {
    const s = this.db.prepare(`${KANAL_SORGUSU} WHERE k.proje_id = ? AND k.ad = ?`).get(projeId, ad) as Satir | undefined;
    return s ? this.kanalSatiri(s) : null;
  }

  /** Kurulun kanalında üyeler ve konuşma alanları da gelir; sistem kanallarında ve ajanların açtığı kanallarda yok */
  private kanalSatiri(s: Satir): Kanal {
    const kanal: Kanal = { ad: String(s.ad), aciklama: String(s.aciklama), mesajSayisi: Number(s.sayi) };
    if (Number(s.ozel) !== 1) return kanal;
    return {
      ...kanal,
      ozel: true,
      uyeler: jsonOku<string[]>(s.uyeler as string, []),
      konusma: s.konusma === "suruyor" ? "suruyor" : "durdu",
      konu: (s.konu as string | null) ?? null,
      konusmaBaslangic: (s.konusma_baslangic as string | null) ?? null,
      olusturma: String(s.olusturma ?? ""),
    };
  }

  /** Kurulun kanalını açar; adın boşta olduğunu çağıran denetler */
  ozelKanalEkle(k: { projeId: string; ad: string; aciklama: string; uyeler: string[] }): Kanal {
    this.db
      .prepare("INSERT INTO kanallar (proje_id, ad, aciklama, ozel, uyeler, konusma, olusturma) VALUES (?, ?, ?, 1, ?, 'durdu', ?)")
      .run(k.projeId, k.ad, k.aciklama, JSON.stringify(k.uyeler), simdi());
    return this.kanal(k.projeId, k.ad)!;
  }

  kanalGuncelle(projeId: string, ad: string, alanlar: Partial<Pick<Kanal, "aciklama" | "uyeler" | "konusma" | "konu" | "konusmaBaslangic">>): Kanal | null {
    const sutunlar: Record<string, string> = { aciklama: "aciklama", uyeler: "uyeler", konusma: "konusma", konu: "konu", konusmaBaslangic: "konusma_baslangic" };
    const atamalar: string[] = [];
    const degerler: unknown[] = [];
    for (const [k, v] of Object.entries(alanlar)) {
      if (v === undefined || !sutunlar[k]) continue;
      atamalar.push(`${sutunlar[k]} = ?`);
      degerler.push(Array.isArray(v) ? JSON.stringify(v) : v);
    }
    if (atamalar.length) this.db.prepare(`UPDATE kanallar SET ${atamalar.join(", ")} WHERE proje_id = ? AND ad = ?`).run(...degerler, projeId, ad);
    return this.kanal(projeId, ad);
  }

  /** Kanalı mesajlarıyla siler */
  kanalSil(projeId: string, ad: string): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM mesajlar WHERE proje_id = ? AND kanal = ?").run(projeId, ad);
      this.db.prepare("DELETE FROM kanallar WHERE proje_id = ? AND ad = ?").run(projeId, ad);
    })();
  }

  /** Ajanı kurulun kanallarının üyeliğinden düşürür; üyeliği değişen kanalların adları */
  kanalUyesiniCikar(projeId: string, ajanId: string): string[] {
    const degisen: string[] = [];
    for (const k of this.kanallar(projeId)) {
      if (!k.ozel || !k.uyeler?.includes(ajanId)) continue;
      this.kanalGuncelle(projeId, k.ad, { uyeler: k.uyeler.filter((id) => id !== ajanId) });
      degisen.push(k.ad);
    }
    return degisen;
  }

  /** Bütün serbest konuşmaları durdurur (açılışta: beklenmedik abonelik harcaması olmasın); duran konuşma sayısı */
  konusmalariDurdur(): number {
    return this.db.prepare("UPDATE kanallar SET konusma = 'durdu' WHERE konusma != 'durdu'").run().changes;
  }

  mesajEkle(m: Omit<Mesaj, "id" | "zaman">): Mesaj {
    const mesaj: Mesaj = { id: kimlik(), zaman: simdi(), ...m };
    this.kanalEkle(m.projeId, m.kanal);
    this.db
      .prepare("INSERT INTO mesajlar (id, proje_id, kanal, gonderen_id, gonderen_ad, metin, anilanlar, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(mesaj.id, mesaj.projeId, mesaj.kanal, mesaj.gonderenId, mesaj.gonderenAd, mesaj.metin, JSON.stringify(mesaj.anilanlar), mesaj.zaman);
    return mesaj;
  }

  private mesajSatiri(s: Satir): Mesaj {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      kanal: String(s.kanal),
      gonderenId: String(s.gonderen_id),
      gonderenAd: String(s.gonderen_ad),
      metin: String(s.metin),
      anilanlar: jsonOku<string[]>(s.anilanlar as string, []),
      zaman: String(s.zaman),
    };
  }

  mesajlar(projeId: string, kanal: string, sinir = 200): Mesaj[] {
    const satirlar = this.db
      .prepare("SELECT * FROM mesajlar WHERE proje_id = ? AND kanal = ? ORDER BY zaman DESC, rowid DESC LIMIT ?")
      .all(projeId, kanal, sinir) as Satir[];
    return satirlar.reverse().map((s) => this.mesajSatiri(s));
  }

  // ---------------- denetim ----------------

  /** altAjan verilmezse ana ajanın kendi çağrısı sayılır */
  denetimEkle(k: Omit<DenetimKaydi, "id" | "zaman" | "altAjan"> & { altAjan?: string | null }): DenetimKaydi {
    const kayit: DenetimKaydi = { id: kimlik(), zaman: simdi(), ...k, altAjan: k.altAjan ?? null };
    this.db
      .prepare(
        "INSERT INTO denetim (id, proje_id, ajan_id, ajan_ad, arac, girdi_ozeti, karar, kural, neden, arac_kimligi, alt_ajan, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(kayit.id, kayit.projeId, kayit.ajanId, kayit.ajanAd, kayit.arac, kayit.girdiOzeti, kayit.karar, kayit.kural, kayit.neden, kayit.aracKimligi, kayit.altAjan, kayit.zaman);
    return kayit;
  }

  private denetimSatiri(s: Satir): DenetimKaydi {
    return {
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
      altAjan: (s.alt_ajan as string | null) ?? null,
      zaman: String(s.zaman),
    };
  }

  denetimKayitlari(projeId: string, sinir = 300): DenetimKaydi[] {
    return (this.db.prepare("SELECT * FROM denetim WHERE proje_id = ? ORDER BY zaman DESC, rowid DESC LIMIT ?").all(projeId, sinir) as Satir[]).map((s) =>
      this.denetimSatiri(s),
    );
  }

  /**
   * Projenin denetim kayıtları eskiden yeniye, sayfa sayfa (dışa aktarım). sonra: önceki sayfanın son imleci.
   * Her sayfa ayrı bir sorgudur; sayfalar arasında bağlantı başka isteklere açık kalır.
   */
  denetimSayfasi(projeId: string, sonra: DenetimImleci | null, sinir = 1000): { kayitlar: DenetimKaydi[]; imlec: DenetimImleci | null } {
    const satirlar = (
      sonra
        ? this.db
            .prepare("SELECT rowid AS sira, * FROM denetim WHERE proje_id = ? AND (zaman, rowid) > (?, ?) ORDER BY zaman, rowid LIMIT ?")
            .all(projeId, sonra.zaman, sonra.sira, sinir)
        : this.db.prepare("SELECT rowid AS sira, * FROM denetim WHERE proje_id = ? ORDER BY zaman, rowid LIMIT ?").all(projeId, sinir)
    ) as Satir[];
    const son = satirlar.at(-1);
    return { kayitlar: satirlar.map((s) => this.denetimSatiri(s)), imlec: son && satirlar.length === sinir ? { zaman: String(son.zaman), sira: Number(son.sira) } : null };
  }

  /** Verilen andan eski denetim kayıtları (bütün projeler, eskiden yeniye); saklama süresi dolanların arşivi için */
  denetimEskiler(once: string, sinir = 2000): DenetimKaydi[] {
    return (this.db.prepare("SELECT * FROM denetim WHERE zaman < ? ORDER BY zaman, rowid LIMIT ?").all(once, sinir) as Satir[]).map((s) => this.denetimSatiri(s));
  }

  denetimSil(idler: string[]): void {
    const sil = this.db.prepare("DELETE FROM denetim WHERE id = ?");
    this.db.transaction((l: string[]) => {
      for (const id of l) sil.run(id);
    })(idler);
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
      kararKaynagi: (s.karar_kaynagi as KararKaynagi | null) ?? null,
      kararVerenAd: (s.karar_veren_ad as string | null) ?? null,
      muhatap: (s.muhatap as KararVeren | null) ?? null,
    };
  }

  onayEkle(o: Omit<Onay, "id" | "olusturma" | "durum" | "sonuclanma" | "not" | "kararKaynagi" | "kararVerenAd" | "muhatap"> & { muhatap?: KararVeren | null }): Onay {
    const id = kimlik();
    this.db
      .prepare(
        "INSERT INTO onaylar (id, proje_id, ajan_id, tur, baslik, ayrinti, veri, durum, olusturma, son_gecerlilik, muhatap) VALUES (?, ?, ?, ?, ?, ?, ?, 'bekliyor', ?, ?, ?)",
      )
      .run(id, o.projeId, o.ajanId, o.tur, o.baslik, o.ayrinti, JSON.stringify(o.veri ?? null), simdi(), o.sonGecerlilik, o.muhatap ?? null);
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

  /** Bekleyen onayı sonuçlandırır; veren: kararı kim verdi (süre dolunca yok) */
  onaySonuclandir(id: string, durum: OnayDurumu, not: string | null, veren?: { kaynak: KararKaynagi; ad: string | null }): Onay {
    this.db
      .prepare("UPDATE onaylar SET durum = ?, sonuclanma = ?, not_metni = ?, karar_kaynagi = ?, karar_veren_ad = ? WHERE id = ? AND durum = 'bekliyor'")
      .run(durum, simdi(), not, veren?.kaynak ?? null, veren?.ad ?? null, id);
    return this.onay(id)!;
  }

  /** Bekleyen onayın muhatabını değiştirir (karar yetkisi değişti, CEO duraklatıldı) */
  onayMuhatabiYaz(id: string, muhatap: KararVeren): Onay | null {
    this.db.prepare("UPDATE onaylar SET muhatap = ? WHERE id = ? AND durum = 'bekliyor'").run(muhatap, id);
    return this.onay(id);
  }

  /** Sonuçlanmış onayın verisini değiştirir (birleştirmenin kalite kapısı kaydı) */
  onayVerisiYaz(id: string, veri: unknown): Onay | null {
    this.db.prepare("UPDATE onaylar SET veri = ? WHERE id = ?").run(JSON.stringify(veri ?? null), id);
    return this.onay(id);
  }

  /** Uygulama kapanırken bekleyen araç onayları anlamını yitirir; not o anki dilde yazılır */
  bekleyenAracOnaylariniKapat(not = "Uygulama yeniden başladı"): void {
    this.db.prepare("UPDATE onaylar SET durum = 'zaman_asimi', sonuclanma = ?, not_metni = ? WHERE durum = 'bekliyor' AND tur = 'arac'").run(simdi(), not);
  }

  // ---------------- akış ----------------

  akisEkle(projeId: string, oge: AkisOgesi): void {
    this.db.prepare("INSERT INTO akis (id, ajan_id, proje_id, zaman, veri) VALUES (?, ?, ?, ?, ?)").run(oge.id, oge.ajanId, projeId, oge.zaman, JSON.stringify(oge));
  }

  akis(ajanId: string, sinir = 300): AkisOgesi[] {
    const satirlar = this.db.prepare("SELECT veri FROM akis WHERE ajan_id = ? ORDER BY sira DESC LIMIT ?").all(ajanId, sinir) as Satir[];
    return satirlar
      .reverse()
      .map((s) => {
        const o = jsonOku<(AkisOgesi & { maliyetUsd?: number }) | null>(s.veri as string, null);
        // Eski sürümlerin tur sonu kayıtlarındaki dolar tutarı gösterilmez
        if (o) delete o.maliyetUsd;
        return o;
      })
      .filter((o): o is AkisOgesi => o !== null);
  }

  /** Akışta (ajan konuşmaları ve araç çağrıları) sözcük arar; ajanId verilmezse tüm proje */
  akisAra(projeId: string, ajanId: string | null, sozcuk: string, sinir = 400): AkisOgesi[] {
    // Sözcük boşsa son kayıtlar döner (çağıran süzer)
    const desen = sozcuk ? `%${sozcuk.replace(/[%_\\]/g, (h) => `\\${h}`)}%` : "%";
    const satirlar = (
      ajanId
        ? this.db.prepare("SELECT veri FROM akis WHERE proje_id = ? AND ajan_id = ? AND veri LIKE ? ESCAPE '\\' ORDER BY sira DESC LIMIT ?").all(projeId, ajanId, desen, sinir)
        : this.db.prepare("SELECT veri FROM akis WHERE proje_id = ? AND veri LIKE ? ESCAPE '\\' ORDER BY sira DESC LIMIT ?").all(projeId, desen, sinir)
    ) as Satir[];
    return satirlar.map((s) => jsonOku<AkisOgesi | null>(s.veri as string, null)).filter((o): o is AkisOgesi => o !== null);
  }

  /** Kanal mesajlarında sözcük arar (en yeni önce) */
  mesajAra(projeId: string, sozcuk: string, sinir = 200): Mesaj[] {
    const desen = sozcuk ? `%${sozcuk.replace(/[%_\\]/g, (h) => `\\${h}`)}%` : "%";
    return (this.db.prepare("SELECT * FROM mesajlar WHERE proje_id = ? AND metin LIKE ? ESCAPE '\\' ORDER BY zaman DESC LIMIT ?").all(projeId, desen, sinir) as Satir[]).map((s) => this.mesajSatiri(s));
  }

  akisBuda(ajanId: string): void {
    this.db
      .prepare("DELETE FROM akis WHERE ajan_id = ? AND sira <= (SELECT sira FROM akis WHERE ajan_id = ? ORDER BY sira DESC LIMIT 1 OFFSET ?)")
      .run(ajanId, ajanId, AKIS_SINIRI);
  }

  // ---------------- kullanım (işlenen token; abonelik pencereleri Claude Code'dan okunur) ----------------

  kullanimEkle(projeId: string, ajanId: string, token: number): void {
    const t = token > 0 ? Math.round(token) : 0;
    if (!t) return;
    this.db
      .prepare(
        `INSERT INTO kullanim (proje_id, ajan_id, gun, token) VALUES (?, ?, ?, ?)
         ON CONFLICT(proje_id, ajan_id, gun) DO UPDATE SET token = token + excluded.token`,
      )
      .run(projeId, ajanId, bugun(), t);
  }

  ajanTokeni(projeId: string, ajanId: string, gun?: string): number {
    const s = (gun
      ? this.db.prepare("SELECT sum(token) t FROM kullanim WHERE proje_id = ? AND ajan_id = ? AND gun = ?").get(projeId, ajanId, gun)
      : this.db.prepare("SELECT sum(token) t FROM kullanim WHERE proje_id = ? AND ajan_id = ?").get(projeId, ajanId)) as Satir;
    return Number(s.t ?? 0);
  }

  projeTokeni(projeId: string, gun?: string): number {
    const s = (gun
      ? this.db.prepare("SELECT sum(token) t FROM kullanim WHERE proje_id = ? AND gun = ?").get(projeId, gun)
      : this.db.prepare("SELECT sum(token) t FROM kullanim WHERE proje_id = ?").get(projeId)) as Satir;
    return Number(s.t ?? 0);
  }

  /** Verilen günden (dahil) bu yana ajan başına işlenen token */
  donemKullanimi(projeId: string, baslangicGun: string): { ajanId: string; token: number }[] {
    return (
      this.db.prepare("SELECT ajan_id, sum(token) k FROM kullanim WHERE proje_id = ? AND gun >= ? GROUP BY ajan_id ORDER BY k DESC").all(projeId, baslangicGun) as Satir[]
    ).map((s) => ({ ajanId: String(s.ajan_id), token: Number(s.k ?? 0) }));
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
  hafizaKayitlari(projeId: string, secenek: { tur?: HafizaTuru; eskilerDahil?: boolean; sinir?: number; sonra?: string } = {}): HafizaKaydi[] {
    const kosul = ["proje_id = ?"];
    const degerler: unknown[] = [projeId];
    if (secenek.tur) {
      kosul.push("tur = ?");
      degerler.push(secenek.tur);
    }
    if (secenek.sonra) {
      kosul.push("guncelleme > ?");
      degerler.push(secenek.sonra);
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

  // ---------------- sözler ----------------

  private sozSatiri(s: Satir): Soz {
    return {
      id: String(s.id),
      projeId: String(s.proje_id),
      verenId: String(s.veren_id),
      verenAd: String(s.veren_ad),
      aliciId: (s.alici_id as string | null) ?? null,
      aliciAd: String(s.alici_ad),
      metin: String(s.metin),
      sonTarih: (s.son_tarih as string | null) ?? null,
      durum: String(s.durum) as SozDurumu,
      not: (s.not_metni as string | null) ?? null,
      olusturma: String(s.olusturma),
      kapanis: (s.kapanis as string | null) ?? null,
    };
  }

  sozEkle(s: Pick<Soz, "projeId" | "verenId" | "verenAd" | "aliciId" | "aliciAd" | "metin" | "sonTarih">): Soz {
    const id = kimlik();
    this.db
      .prepare("INSERT INTO sozler (id, proje_id, veren_id, veren_ad, alici_id, alici_ad, metin, son_tarih, durum, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'acik', ?)")
      .run(id, s.projeId, s.verenId, s.verenAd, s.aliciId, s.aliciAd, s.metin, s.sonTarih, simdi());
    return this.soz(id)!;
  }

  soz(id: string): Soz | null {
    const s = this.db.prepare("SELECT * FROM sozler WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.sozSatiri(s) : null;
  }

  sozKapat(id: string, durum: Exclude<SozDurumu, "acik">, not: string | null): Soz | null {
    this.db.prepare("UPDATE sozler SET durum = ?, not_metni = ?, kapanis = ? WHERE id = ?").run(durum, not, simdi(), id);
    return this.soz(id);
  }

  /** Projenin sözleri; veren ya da alan çalışana göre süzülebilir; en yeni önce */
  sozler(projeId: string, s: { verenId?: string; aliciId?: string; durum?: SozDurumu; sinir?: number } = {}): Soz[] {
    const kosul = ["proje_id = ?"];
    const degerler: unknown[] = [projeId];
    if (s.verenId) (kosul.push("veren_id = ?"), degerler.push(s.verenId));
    if (s.aliciId) (kosul.push("alici_id = ?"), degerler.push(s.aliciId));
    if (s.durum) (kosul.push("durum = ?"), degerler.push(s.durum));
    return (this.db.prepare(`SELECT * FROM sozler WHERE ${kosul.join(" AND ")} ORDER BY olusturma DESC LIMIT ?`).all(...degerler, s.sinir ?? 200) as Satir[]).map((x) => this.sozSatiri(x));
  }

  // ---------------- global zekâ ----------------

  private kuralSatiri(s: Satir): KureselKural {
    return {
      id: String(s.id),
      metin: String(s.metin),
      kapsam: jsonOku<string[]>(s.kapsam as string, []),
      kaynak: String(s.kaynak) as KuralKaynagi,
      kanitlar: jsonOku<KuralKaniti[]>(s.kanitlar as string, []),
      guven: Number(s.guven),
      kullanim: Number(s.kullanim),
      yarar: Number(s.yarar),
      ihlal: Number(s.ihlal),
      durum: String(s.durum) as KuralDurumu,
      olusturma: String(s.olusturma),
      guncelleme: String(s.guncelleme),
    };
  }

  kuralEkle(k: Pick<KureselKural, "metin" | "kapsam" | "kaynak" | "kanitlar" | "guven" | "durum">): KureselKural {
    const id = kimlik();
    const zaman = simdi();
    this.db
      .prepare("INSERT INTO kuresel_kurallar (id, metin, kapsam, kaynak, kanitlar, guven, durum, olusturma, guncelleme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, k.metin, JSON.stringify(k.kapsam), k.kaynak, JSON.stringify(k.kanitlar), k.guven, k.durum, zaman, zaman);
    return this.kural(id)!;
  }

  kural(id: string): KureselKural | null {
    const s = this.db.prepare("SELECT * FROM kuresel_kurallar WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.kuralSatiri(s) : null;
  }

  kurallar(durum?: KuralDurumu): KureselKural[] {
    const satirlar = durum
      ? (this.db.prepare("SELECT * FROM kuresel_kurallar WHERE durum = ? ORDER BY guven DESC, guncelleme DESC").all(durum) as Satir[])
      : (this.db.prepare("SELECT * FROM kuresel_kurallar ORDER BY CASE durum WHEN 'etkin' THEN 0 WHEN 'aday' THEN 1 ELSE 2 END, guven DESC, guncelleme DESC").all() as Satir[]);
    return satirlar.map((x) => this.kuralSatiri(x));
  }

  kuralGuncelle(id: string, alanlar: Partial<Pick<KureselKural, "metin" | "kapsam" | "kanitlar" | "guven" | "kullanim" | "yarar" | "ihlal" | "durum">>): KureselKural | null {
    const sutunlar: Record<string, string> = { metin: "metin", kapsam: "kapsam", kanitlar: "kanitlar", guven: "guven", kullanim: "kullanim", yarar: "yarar", ihlal: "ihlal", durum: "durum" };
    const atamalar: string[] = ["guncelleme = ?"];
    const degerler: unknown[] = [simdi()];
    for (const [k, v] of Object.entries(alanlar)) {
      if (v === undefined || !sutunlar[k]) continue;
      atamalar.push(`${sutunlar[k]} = ?`);
      degerler.push(Array.isArray(v) ? JSON.stringify(v) : v);
    }
    this.db.prepare(`UPDATE kuresel_kurallar SET ${atamalar.join(", ")} WHERE id = ?`).run(...degerler, id);
    return this.kural(id);
  }

  /** Talimata giren kuralların kullanım sayacı (güncelleme zamanı değişmez) */
  kuralKullanildi(idler: string[]): void {
    const artir = this.db.prepare("UPDATE kuresel_kurallar SET kullanim = kullanim + 1 WHERE id = ?");
    const hepsi = this.db.transaction((l: string[]) => {
      for (const id of l) artir.run(id);
    });
    hepsi(idler);
  }

  kuralSil(id: string): void {
    this.db.prepare("DELETE FROM kuresel_kurallar WHERE id = ?").run(id);
  }

  zekaGunluguEkle(tur: ZekaGunlukTuru, metin: string, kuralId: string | null): ZekaGunlukKaydi {
    const kayit: ZekaGunlukKaydi = { id: kimlik(), zaman: simdi(), tur, metin, kuralId };
    this.db.prepare("INSERT INTO zeka_gunlugu (id, zaman, tur, metin, kural_id) VALUES (?, ?, ?, ?, ?)").run(kayit.id, kayit.zaman, kayit.tur, kayit.metin, kayit.kuralId);
    this.db.prepare("DELETE FROM zeka_gunlugu WHERE id NOT IN (SELECT id FROM zeka_gunlugu ORDER BY zaman DESC LIMIT 1000)").run();
    return kayit;
  }

  zekaGunlugu(sinir = 100): ZekaGunlukKaydi[] {
    return (this.db.prepare("SELECT * FROM zeka_gunlugu ORDER BY zaman DESC LIMIT ?").all(sinir) as Satir[]).map((s) => ({
      id: String(s.id),
      zaman: String(s.zaman),
      tur: String(s.tur) as ZekaGunlukTuru,
      metin: String(s.metin),
      kuralId: (s.kural_id as string | null) ?? null,
    }));
  }
}
