// Proje hafızası, defter, ajanlar arası sorular ve .arnorg commit'i
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SunucuOlayi } from "@arnorg/ortak";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-hafiza-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Hafıza", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  sirket.iseAl(pid, { ad: "Mert", rol: "test" });
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("proje hafızası", () => {
  it("kaydeder, aynı başlığı tekrar yazmaz, Türkçe harfsiz arar", () => {
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const k1 = sirket.hafizaYaz(pid, { tur: "karar", baslik: "Veritabanı: SQLite", metin: "Tek kullanıcılı masaüstü olduğu için PostgreSQL yerine SQLite seçildi.", etiketler: ["Veri"] }, deniz.id);
    const k2 = sirket.hafizaYaz(pid, { tur: "karar", baslik: "veritabanı: sqlite", metin: "SQLite seçildi; WAL açık.", onem: 4 }, deniz.id);
    expect(k2.id).toBe(k1.id);
    expect(k2.onem).toBe(4);
    expect(k2.etiketler).toEqual([]);
    expect(sirket.hafiza.ara(pid, "veritabani").map((k) => k.id)).toEqual([k1.id]);
    expect(sirket.hafiza.ara(pid, "wal").length).toBe(1);
    expect(gelenler.some((o) => o.tur === "hafiza.yeni" && o.kayit.id === k1.id)).toBe(true);
  });

  it("yerine geçen kayıt eskisini aramadan ve bağlamdan çıkarır", () => {
    const eski = sirket.hafizaYaz(pid, { tur: "olgu", baslik: "Node sürümü", metin: "Node 20 kullanılıyor." }, null);
    const yeni = sirket.hafizaYaz(pid, { tur: "olgu", baslik: "Node sürümü 22", metin: "Node 22'ye geçildi.", yerineGectigi: eski.id }, null);
    expect(depo.hafizaKaydi(eski.id)?.yerineGecen).toBe(yeni.id);
    expect(sirket.hafiza.ara(pid, "node").map((k) => k.id)).toEqual([yeni.id]);
    const ada = depo.ajanAdla(pid, "Ada")!;
    const baglam = sirket.hafiza.baglam(ada, []);
    expect(baglam).toContain("Node 22'ye geçildi");
    expect(baglam).not.toContain("Node 20 kullanılıyor");
    // Eskiyen kayıt da canlı olayla güncellenir; silme ayrı olay üretir
    expect(gelenler.some((o) => o.tur === "hafiza.yeni" && o.kayit.id === eski.id && o.kayit.yerineGecen === yeni.id)).toBe(true);
    const gecici = sirket.hafizaYaz(pid, { tur: "olgu", baslik: "Silinecek", metin: "Geçici kayıt." }, null);
    sirket.hafiza.sil(gecici.id);
    expect(gelenler.some((o) => o.tur === "hafiza.silindi" && o.id === gecici.id && o.projeId === pid)).toBe(true);
    expect(baglam).toContain("Veritabanı: SQLite");
  });

  it("kurul tercihi ve defter oturum talimatına girer, repo içine yazılır", async () => {
    sirket.hafizaYaz(pid, { tur: "tercih", baslik: "Arayüz dili", metin: "Tüm arayüz metinleri Türkçe olacak.", onem: 5 }, null);
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    sirket.defterYaz(deniz.id, "- T-1 şema bitti, API kaldı\n- Mert'e test verisi sözü verdim");
    const talimat = (sirket as unknown as { talimatOlustur(a: unknown, cwd: string): string }).talimatOlustur(deniz, "/tmp");
    expect(talimat).toContain("Kurul tercihleri");
    expect(talimat).toContain("Tüm arayüz metinleri Türkçe olacak.");
    expect(talimat).toContain("Mert'e test verisi sözü verdim");
    await bekle(1000);
    const kok = path.join(sirket.proje(pid).yol, ".arnorg", "hafiza");
    expect(fs.readFileSync(path.join(kok, "hafiza.md"), "utf8")).toContain("**Arayüz dili**");
    expect(JSON.parse(fs.readFileSync(path.join(kok, "kayitlar.json"), "utf8")).kayitlar.length).toBeGreaterThanOrEqual(4);
    expect(fs.readFileSync(path.join(kok, "ajanlar", "deniz.md"), "utf8")).toContain("API kaldı");
  });

  it("görev bitince özet, ilgili görev metnine hafıza eklenir", async () => {
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const g = sirket.gorevOlustur(pid, { baslik: "SQLite göçleri", aciklama: "Veritabanı göç sistemi", atananId: deniz.id });
    expect(sirket.gorevMetni(g)).toContain("İlgili hafıza:");
    expect(sirket.gorevMetni(g)).toContain("Veritabanı: SQLite");
    depo.gorevGuncelle(g.id, { durum: "inceleme" });
    await sirket.gorevGuncelle(g.id, { durum: "tamam" });
    expect(depo.hafizaKayitlari(pid, { tur: "ozet" }).some((k) => k.baslik.includes("SQLite göçleri") && k.gorevId === g.id)).toBe(true);
  });

  it(".arnorg değişikliklerini yalnız kendi yolunda commit'ler", async () => {
    const kok = sirket.proje(pid).yol;
    fs.writeFileSync(path.join(kok, "kullanici.txt"), "kullanıcının işi\n");
    execFileSync("git", ["add", "kullanici.txt"], { cwd: kok });
    expect(await sirket.arnorgCommitle(pid)).toBe(true);
    const son = execFileSync("git", ["show", "--name-only", "--format=%s", "HEAD"], { cwd: kok }).toString();
    expect(son).toContain("ArnOrg: ekip, hafıza ve not kayıtları");
    expect(son).toContain(".arnorg/hafiza/hafiza.md");
    expect(son).not.toContain("kullanici.txt");
    // Kullanıcının hazırladığı değişiklik hazırlanmış hâlde kalır
    expect(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: kok }).toString()).toContain("kullanici.txt");
    expect(await sirket.arnorgCommitle(pid)).toBe(false);
  });
});

describe("ajanlar arası sorular", () => {
  it("soru yanıtlanınca soranın beklemesi çözülür", async () => {
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const mert = depo.ajanAdla(pid, "Mert")!;
    // Testte oturum yok; uyandırma başarılı sayılır
    const s = sirket as unknown as { uyandir: (...a: unknown[]) => Promise<boolean> };
    const asil = s.uyandir;
    s.uyandir = async () => true;
    const bekleyen = sirket.ajanaSor(deniz.id, "@Mert", "Test verisi hangi klasörde?", 1);
    await bekle(10);
    const soru = depo.sorular(pid, { soruluId: mert.id, durum: "bekliyor" })[0]!;
    expect(soru.soru).toBe("Test verisi hangi klasörde?");
    // Karşılıklı bekleme reddedilir
    await expect(sirket.ajanaSor(mert.id, "Deniz", "Sen de bana bir şey söyle")).rejects.toThrow(/senden yanıt bekliyor/);
    expect(() => sirket.soruYanitla(deniz.id, soru.id, "x")).toThrow(/Mert'a soruldu/);
    sirket.soruYanitla(mert.id, soru.id, "test/veri altında.");
    const sonuc = await bekleyen;
    expect(sonuc).toMatchObject({ durum: "yanitlandi", yanit: "test/veri altında." });
    expect(gelenler.filter((o) => o.tur === "soru.guncellendi").map((o) => (o as { soru: { durum: string } }).soru.durum)).toEqual(["bekliyor", "yanitlandi"]);
    s.uyandir = asil;
  });

  it("uyandırılamayan ajana soru hemen zaman aşımına düşer", async () => {
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const s = await sirket.ajanaSor(deniz.id, "Ada", "Sürüm ne zaman çıkıyor?", 5);
    expect(s.durum).toBe("zaman_asimi");
  });
});

describe("hafıza geri yükleme", () => {
  it("var olan repo bağlanınca kayıtlar ve defter geri gelir", async () => {
    await bekle(900);
    const kok = sirket.proje(pid).yol;
    const veri2 = path.join(gecici, "veri2");
    const yap2 = new Yapilandirma(veri2);
    const depo2 = new Depo(path.join(veri2, "arnorg.db"));
    const sirket2 = new Sirket(depo2, new OlayYolu(), yap2, () => null, true);
    const p2 = await sirket2.projeOlustur({ ad: "Kopya", yol: kok, olustur: false });
    const kayitlar = depo2.hafizaKayitlari(p2.id);
    expect(kayitlar.some((k) => k.baslik === "Arayüz dili" && k.tur === "tercih")).toBe(true);
    expect(depo2.hafizaKayitlari(p2.id, { eskilerDahil: true }).some((k) => k.yerineGecen)).toBe(true);
    const deniz2 = depo2.ajanAdla(p2.id, "Deniz")!;
    expect(sirket2.hafiza.defter(deniz2)).toContain("API kaldı");
    sirket2.kapat();
    depo2.kapat();
  });
});
