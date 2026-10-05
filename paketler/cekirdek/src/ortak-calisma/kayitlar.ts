// Görev kayıtları (0.0.8): ArnOrg'un çalışma dalına attığı görev commit'leri ve her birinin kalite denetimi. Tablo
// gorev_kayitlari bu modülce açılır (CREATE TABLE IF NOT EXISTS); proje silinince kayıtları da silinir (tetikleyici).
// Kalite alanı her adımda yeniden yazılır; kaydın kendisi (commit, dosyalar) değişmez.
import type Database from "better-sqlite3";
import { KAYIT_SON_DURUMLARI, type GorevKaydi, type KayitKalitesi } from "@arnorg/ortak";

interface Satir {
  id: string;
  veri: string;
  kalite: string;
}

/** Denetimi bitmiş ve sonucu dalın sağlığını söyleyen durumlar (atlanan ve testsiz sayılmaz) */
const SONUCLU = ["gecti", "kaldi", "zaman_asimi"];

export function bosKalite(durum: KayitKalitesi["durum"], komut: string | null = null): KayitKalitesi {
  return { durum, komut, sira: null, baslangic: null, adimBaslangic: null, bitis: null, sureMs: null, cikti: "", mesaj: null, kirmiziKayit: null };
}

export class KayitDefteri {
  constructor(private readonly db: Database.Database) {
    db.exec(`
CREATE TABLE IF NOT EXISTS gorev_kayitlari (
  id TEXT PRIMARY KEY,
  proje_id TEXT NOT NULL,
  gorev_id TEXT,
  zaman TEXT NOT NULL,
  veri TEXT NOT NULL,
  kalite TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gorev_kayitlari_proje ON gorev_kayitlari(proje_id, zaman);
CREATE INDEX IF NOT EXISTS gorev_kayitlari_gorev ON gorev_kayitlari(gorev_id);
CREATE TRIGGER IF NOT EXISTS gorev_kayitlari_proje_silindi AFTER DELETE ON projeler
BEGIN
  DELETE FROM gorev_kayitlari WHERE proje_id = OLD.id;
END;
`);
  }

  private satirdan(s: Satir): GorevKaydi {
    return { ...(JSON.parse(s.veri) as Omit<GorevKaydi, "kalite">), kalite: JSON.parse(s.kalite) as KayitKalitesi };
  }

  ekle(k: GorevKaydi): GorevKaydi {
    const { kalite, ...veri } = k;
    this.db.prepare("INSERT INTO gorev_kayitlari (id, proje_id, gorev_id, zaman, veri, kalite) VALUES (?, ?, ?, ?, ?, ?)").run(k.id, k.projeId, k.gorevId, k.zaman, JSON.stringify(veri), JSON.stringify(kalite));
    return k;
  }

  kayit(id: string): GorevKaydi | null {
    const s = this.db.prepare("SELECT id, veri, kalite FROM gorev_kayitlari WHERE id = ?").get(id) as Satir | undefined;
    return s ? this.satirdan(s) : null;
  }

  /** Kalite alanlarını günceller; tanımsız alanlar dokunulmaz */
  kaliteYaz(id: string, d: Partial<KayitKalitesi>): GorevKaydi | null {
    const k = this.kayit(id);
    if (!k) return null;
    const kalite: KayitKalitesi = { ...k.kalite, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
    this.db.prepare("UPDATE gorev_kayitlari SET kalite = ? WHERE id = ?").run(JSON.stringify(kalite), id);
    return { ...k, kalite };
  }

  /** Projenin son kayıtları, yeni önce */
  liste(projeId: string, sinir = 60): GorevKaydi[] {
    return (this.db.prepare("SELECT id, veri, kalite FROM gorev_kayitlari WHERE proje_id = ? ORDER BY zaman DESC, rowid DESC LIMIT ?").all(projeId, sinir) as Satir[]).map((s) => this.satirdan(s));
  }

  /** Görevin kayıtları, eski önce */
  gorevin(gorevId: string): GorevKaydi[] {
    return (this.db.prepare("SELECT id, veri, kalite FROM gorev_kayitlari WHERE gorev_id = ? ORDER BY zaman, rowid").all(gorevId) as Satir[]).map((s) => this.satirdan(s));
  }

  /** Bir aralıktaki kayıtlar (brifing ve rapor), eski önce */
  aralikta(projeId: string, baslangic: string, bitis = "9999"): GorevKaydi[] {
    return (this.db.prepare("SELECT id, veri, kalite FROM gorev_kayitlari WHERE proje_id = ? AND zaman > ? AND zaman <= ? ORDER BY zaman, rowid").all(projeId, baslangic, bitis) as Satir[]).map((s) =>
      this.satirdan(s),
    );
  }

  /** Denetimi bitmemiş kayıtlar (açılışta kaldığı yerden sürer), eski önce */
  denetimiSurenler(): GorevKaydi[] {
    return (this.db.prepare("SELECT id, veri, kalite FROM gorev_kayitlari ORDER BY zaman, rowid").all() as Satir[]).map((s) => this.satirdan(s)).filter((k) => !KAYIT_SON_DURUMLARI.includes(k.kalite.durum));
  }

  /** Projede sonucu bilinen (geçen ya da kalan) en son denetim; haric dışında */
  sonSonuclu(projeId: string, haric?: string): GorevKaydi | null {
    for (const k of this.liste(projeId, 200)) {
      if (k.id === haric || !SONUCLU.includes(k.kalite.durum) || !k.kalite.bitis) continue;
      return k;
    }
    return null;
  }
}
