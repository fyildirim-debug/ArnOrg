// Eski kurulumların göçü: kaldırılan API girişi ve dolar bütçesinin izleri veritabanından ve ayarlardan silinir
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { Depo } from "./depo.js";
import { Yapilandirma } from "./yapilandirma.js";

const temizlenecek: string[] = [];
afterEach(() => {
  for (const d of temizlenecek.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("abonelik göçü", () => {
  it("eski veritabanında token taşınır; dolar tutarları, bütçe sütunu, bütçe onayları ve teklif verisindeki bütçe silinir", () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-goc-"));
    temizlenecek.push(dizin);
    const dosya = path.join(dizin, "arnorg.db");
    // Yeni şemayla açılıp eski sürümün izleri elle eklenir
    const ilk = new Depo(dosya);
    const p = ilk.projeEkle({ ad: "Eski", yol: path.join(dizin, "repo"), aciklama: "", varsayilanDal: "main" });
    const a = ilk.ajanEkle({
      projeId: p.id, ad: "Deniz", rol: "backend", rolAdi: "Backend", model: "sonnet", yoneticiId: null, durum: "kapali",
      isAciklamasi: "", gorevId: null, oturumId: null, calismaAlani: null, dal: null, izinModu: "default", talimatEki: "", karakter: null,
    });
    ilk.kapat();
    const db = new Database(dosya);
    db.exec("ALTER TABLE ajanlar ADD COLUMN gunluk_butce REAL NOT NULL DEFAULT 5");
    db.exec("CREATE TABLE maliyet (proje_id TEXT NOT NULL, ajan_id TEXT NOT NULL, gun TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, token INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (proje_id, ajan_id, gun))");
    db.prepare("INSERT INTO maliyet VALUES (?, ?, '2026-10-01', 3.25, 41000)").run(p.id, a.id);
    db.prepare("INSERT INTO maliyet VALUES (?, ?, '2026-10-02', 1.5, 0)").run(p.id, a.id);
    db.prepare(
      "INSERT INTO onaylar (id, proje_id, ajan_id, tur, baslik, ayrinti, veri, durum, olusturma) VALUES ('o1', ?, ?, 'butce', 'Deniz · günlük bütçe doldu', 'Bugün $5.00 harcandı', '{}', 'bekliyor', '2026-10-01T10:00:00Z')",
    ).run(p.id, a.id);
    db.prepare(
      "INSERT INTO onaylar (id, proje_id, ajan_id, tur, baslik, ayrinti, veri, durum, olusturma) VALUES ('o2', ?, ?, 'ise_alim', 'Elif · Frontend', '', ?, 'bekliyor', '2026-10-01T10:00:00Z')",
    ).run(p.id, a.id, JSON.stringify({ ad: "Elif", rol: "frontend", gunlukButceUsd: 5 }));
    db.prepare(
      "INSERT INTO denetim (id, proje_id, ajan_id, ajan_ad, arac, girdi_ozeti, karar, kural, neden, zaman) VALUES ('d1', ?, ?, 'Deniz', 'Read', 'x', 'ret', 'Bütçe', 'Günlük bütçen doldu ($5.00 / $5.00)', '2026-10-01T10:00:00Z')",
    ).run(p.id, a.id);
    db.close();

    const depo = new Depo(dosya);
    try {
      const tablolar = (depo.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
      expect(tablolar).not.toContain("maliyet");
      expect(depo.ajanTokeni(p.id, a.id)).toBe(41_000);
      const sutunlar = (depo.db.prepare("PRAGMA table_info(ajanlar)").all() as { name: string }[]).map((s) => s.name);
      expect(sutunlar).not.toContain("gunluk_butce");
      expect(depo.onaylar(p.id).some((o) => (o.tur as string) === "butce")).toBe(false);
      expect(depo.onaylar(p.id).find((o) => o.id === "o2")?.veri).toEqual({ ad: "Elif", rol: "frontend" });
      expect(depo.denetimKayitlari(p.id, 10).some((k) => k.kural === "Bütçe")).toBe(false);
      const ajan = depo.ajan(a.id)!;
      expect(ajan.toplamToken).toBe(41_000);
      expect(JSON.stringify(ajan)).not.toMatch(/usd|butce/i);
      // Yeni ajan eklemek eski veritabanında da çalışır
      expect(() =>
        depo.ajanEkle({
          projeId: p.id, ad: "Elif", rol: "frontend", rolAdi: "Frontend", model: "sonnet", yoneticiId: null, durum: "kapali",
          isAciklamasi: "", gorevId: null, oturumId: null, calismaAlani: null, dal: null, izinModu: "default", talimatEki: "", karakter: null,
        }),
      ).not.toThrow();
    } finally {
      depo.kapat();
    }
  });

  it("eski ayarlar dosyasındaki giriş yöntemi ve dolar bütçesi okunmaz, açılışta dosyadan silinir", () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-ayar-"));
    temizlenecek.push(dizin);
    const dosya = path.join(dizin, "ayarlar.json");
    fs.writeFileSync(dosya, JSON.stringify({ girisYontemi: "api", gunlukButceUsd: 50, tikanmaDakika: 30 }));
    const yap = new Yapilandirma(dizin);
    expect(yap.ayarlar).not.toHaveProperty("girisYontemi");
    expect(yap.ayarlar).not.toHaveProperty("gunlukButceUsd");
    expect(yap.ayarlar.tikanmaDakika).toBe(30);
    // Açılışta temizlenir; kullanıcının ayarı korunur
    expect(fs.readFileSync(dosya, "utf8")).not.toMatch(/girisYontemi|gunlukButceUsd/);
    expect(JSON.parse(fs.readFileSync(dosya, "utf8")).tikanmaDakika).toBe(30);
    yap.guncelle({ onaySuresiSn: 600 });
    expect(fs.readFileSync(dosya, "utf8")).not.toMatch(/girisYontemi|gunlukButceUsd/);
  });

  it("bilinen alanlardan oluşan ayarlar dosyasına açılışta dokunulmaz", () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-ayar-"));
    temizlenecek.push(dizin);
    const dosya = path.join(dizin, "ayarlar.json");
    const ham = JSON.stringify({ tikanmaDakika: 45 });
    fs.writeFileSync(dosya, ham);
    new Yapilandirma(dizin);
    expect(fs.readFileSync(dosya, "utf8")).toBe(ham);
  });
});
