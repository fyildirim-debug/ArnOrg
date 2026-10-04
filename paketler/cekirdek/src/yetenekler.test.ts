// Yetenekler: rol varsayılanları, depo göçü, araç listesi süzmesi, talimat, denetim kapısı, web ve araştırma
// araçlarının işleyicileri ve API uçları. Ağa çıkılmaz: web hizmetinin getiricisi ve gh'si sahtedir.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { YETENEKLER, type Ajan, type Ayarlar, type WebAramaYaniti, type WebDurumu, type YetenekKimligi } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { notYoluCoz } from "./proje-dosyalari.js";
import { varsayilanKurallar } from "./politika.js";
import { ROLLER } from "./roller.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { bugun } from "./yardimci.js";
import { Yapilandirma } from "./yapilandirma.js";
import { ajanYetenekleri, aracAcik, aracYetenegi, kapaliClaudeAraclari, rolYetenekleri, yetenekleriDogrula, yetenekTalimati } from "./yetenekler.js";
import { yanitYap, type Getirici } from "./web/http.js";
import { WebHizmeti } from "./web/index.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
let ceo: Ajan;
let deniz: Ajan;
let ece: Ajan;

/** Sahte ağ: arama motorlarından yalnız Stack Overflow ve npm yanıt verir, okunan sayfa küçük bir makale */
const sahteGetir: Getirici = async (adres) => {
  const u = new URL(adres);
  if (u.hostname === "api.stackexchange.com")
    return yanitYap(200, JSON.stringify({ items: [{ title: "electron-updater &amp; private repo", link: "https://stackoverflow.com/questions/1/x", score: 3, answer_count: 1, tags: ["electron"], body: "<p>Use a token.</p>" }] }), { "content-type": "application/json" }, adres);
  if (u.hostname === "registry.npmjs.org" && u.pathname === "/-/v1/search")
    return yanitYap(200, JSON.stringify({ objects: [{ package: { name: "electron-updater", version: "6.8.9", description: "Cross platform updater", links: { npm: "https://www.npmjs.com/package/electron-updater" } }, downloads: { weekly: 10 } }] }), { "content-type": "application/json" }, adres);
  if (u.hostname === "registry.npmjs.org" && u.pathname === "/electron-updater/latest") return yanitYap(200, JSON.stringify({ version: "6.8.9", license: "MIT" }), { "content-type": "application/json" }, adres);
  if (u.hostname === "docs.ornek.com")
    return yanitYap(200, `<html><head><title>Güncelleme</title></head><body><article><h1>Güncelleme</h1><p>${"Özel depodan güncelleme belirteç ister. ".repeat(20)}</p></article></body></html>`, { "content-type": "text/html" }, adres);
  return yanitYap(503, "kapalı", {}, adres);
};

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
const araclar = (ajanId: string) => arnorgAracListesi(sirket, ajanId) as unknown as Arac[];
const adlar = (ajanId: string) => araclar(ajanId).map((a) => a.name);
async function cagir(ajanId: string, ad: string, girdi: Record<string, unknown>) {
  const arac = araclar(ajanId).find((a) => a.name === ad);
  if (!arac) throw new Error(`${ad} aracı yok`);
  const s = await arac.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-yetenek-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
  // Web hizmeti sahte ağla kurulur (ağa çıkılmaz)
  const gh = { api: async <T>() => ({ total_count: 1, items: [{ full_name: "ornek/updater", html_url: "https://github.com/ornek/updater", stargazers_count: 42, language: "TypeScript", description: "Özel depodan güncelleme" }] }) as T };
  (sirket as unknown as { webHizmeti: WebHizmeti }).webHizmeti = new WebHizmeti({ ayarlar: () => yap.ayarlar.web, dil: () => "tr", ghBul: () => null, getir: sahteGetir, gh });
  const p = await sirket.projeOlustur({ ad: "Yetenek", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
  deniz = sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  ece = sirket.iseAl(pid, { ad: "Ece", rol: "arastirmaci" });
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("rol varsayılanları", () => {
  it("her rolde en az web araması ve sayfa okuma var; araştırmacıda hepsi", () => {
    for (const r of ROLLER) {
      const y = rolYetenekleri(r.kimlik);
      expect(y, r.kimlik).toEqual(expect.arrayContaining(["web_arama", "web_okuma"]));
    }
    expect(rolYetenekleri("arastirmaci")).toEqual(YETENEKLER.map((y) => y.kimlik));
    expect(rolYetenekleri("ceo")).toEqual(["web_arama", "web_okuma", "arastirma", "claude_web"]);
    expect(rolYetenekleri("bilinmeyen")).toEqual(["web_arama", "web_okuma", "claude_web"]);
  });

  it("araştırmacı rolü katalogda son sırada, sonnet modelli ve kod yazmaz", () => {
    const r = ROLLER.at(-1)!;
    expect(r).toMatchObject({ kimlik: "arastirmaci", ad: "Araştırmacı", varsayilanModel: "sonnet", yonetici: false });
    expect(r.en?.ad).toBe("Researcher");
    expect(r.talimat).toMatch(/Kod yazmazsın/);
    expect(r.talimat).not.toMatch(/web_ara|web_oku|arastirma_kaydet/);
  });

  it("işe alınan ajan rolünün varsayılanlarını alır; liste doğrulanır", () => {
    expect(deniz.yetenekler).toEqual(rolYetenekleri("backend"));
    expect(ece.yetenekler).toEqual(rolYetenekleri("arastirmaci"));
    expect(yetenekleriDogrula(["web_okuma", "web_arama", "web_okuma"])).toEqual(["web_arama", "web_okuma"]);
    expect(() => yetenekleriDogrula(["uçmak"])).toThrow(/Bilinmeyen yetenek: uçmak/);
    expect(() => yetenekleriDogrula("web_arama")).toThrow(/liste/);
    expect(aracYetenegi("mcp__arnorg__github_ara")).toBe("github_arastirma");
    expect(aracYetenegi("WebFetch")).toBe("claude_web");
    expect(aracYetenegi("mcp__arnorg__gorev_ac")).toBeNull();
    // Kaydı olmayan (eski) ajan rolünün varsayılanlarıyla değerlendirilir
    expect(ajanYetenekleri({ rol: "test" })).toEqual(rolYetenekleri("test"));
  });
});

describe("depo göçü", () => {
  it("var olan ajanlar rollerinin varsayılanlarını alır; açıkça seçilen liste korunur", () => {
    const dosya = path.join(gecici, "eski.db");
    const eski = new Database(dosya);
    eski.exec(`CREATE TABLE ajanlar (id TEXT PRIMARY KEY, proje_id TEXT NOT NULL, ad TEXT NOT NULL, rol TEXT NOT NULL, rol_adi TEXT NOT NULL, model TEXT NOT NULL,
      yonetici_id TEXT, durum TEXT NOT NULL DEFAULT 'kapali', is_aciklamasi TEXT NOT NULL DEFAULT '', gorev_id TEXT, oturum_id TEXT, calisma_alani TEXT, dal TEXT,
      izin_modu TEXT NOT NULL, talimat_eki TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL, silindi INTEGER NOT NULL DEFAULT 0, karakter TEXT)`);
    const ekle = eski.prepare("INSERT INTO ajanlar (id, proje_id, ad, rol, rol_adi, model, izin_modu, olusturma) VALUES (?, 'p', ?, ?, ?, 'sonnet', 'default', '2026-01-01T00:00:00Z')");
    ekle.run("a1", "Ada", "ceo", "CEO");
    ekle.run("a2", "Kerem", "devops", "DevOps");
    ekle.run("a3", "Zeynep", "eski-rol", "Eski");
    eski.close();

    const d1 = new Depo(dosya);
    try {
      expect(d1.ajan("a1")!.yetenekler).toEqual(rolYetenekleri("ceo"));
      expect(d1.ajan("a2")!.yetenekler).toEqual(rolYetenekleri("devops"));
      expect(d1.ajan("a3")!.yetenekler).toEqual(["web_arama", "web_okuma", "claude_web"]);
      const ham = d1.db.prepare("SELECT yetenekler FROM ajanlar WHERE id = 'a2'").get() as { yetenekler: string };
      expect(JSON.parse(ham.yetenekler)).toEqual(rolYetenekleri("devops"));
      d1.ajanGuncelle("a2", { yetenekler: ["web_okuma"] });
    } finally {
      d1.kapat();
    }
    const d2 = new Depo(dosya);
    try {
      expect(d2.ajan("a2")!.yetenekler).toEqual(["web_okuma"]);
    } finally {
      d2.kapat();
    }
  });
});

describe("araç listesi ve talimat", () => {
  it("araç listesi ajanın yeteneklerine göre süzülür", () => {
    const ceoAraclari = adlar(ceo.id);
    expect(ceoAraclari).toEqual(expect.arrayContaining(["web_ara", "web_oku", "arastirma_kaydet"]));
    expect(ceoAraclari).not.toContain("paket_bilgisi");
    expect(ceoAraclari).not.toContain("github_ara");
    expect(adlar(deniz.id)).toEqual(expect.arrayContaining(["web_ara", "web_oku", "paket_bilgisi", "github_ara"]));
    expect(adlar(deniz.id)).not.toContain("arastirma_kaydet");
    expect(adlar(ece.id)).toEqual(expect.arrayContaining(["web_ara", "web_oku", "arastirma_kaydet", "paket_bilgisi", "github_ara"]));
    // Yeteneğe bağlı olmayan araçlar her zaman listede
    expect(adlar(deniz.id)).toEqual(expect.arrayContaining(["mesaj_gonder", "gorev_guncelle", "kod_ara"]));
  });

  it("kapatılan yeteneğin aracı listeden ve talimattan çıkar; Claude Code araçları yasaklanır", async () => {
    const y = await sirket.ajanGuncelle(deniz.id, { yetenekler: ["web_okuma"] });
    expect(y.yetenekler).toEqual(["web_okuma"]);
    const liste = adlar(deniz.id);
    expect(liste).toContain("web_oku");
    for (const ad of ["web_ara", "paket_bilgisi", "github_ara", "arastirma_kaydet"]) expect(liste).not.toContain(ad);
    expect(kapaliClaudeAraclari(y)).toEqual(["WebSearch", "WebFetch"]);
    const talimat = (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(y, "/tmp");
    expect(talimat).toContain("mcp__arnorg__web_oku");
    expect(talimat).not.toContain("mcp__arnorg__web_ara");
    expect(talimat).not.toContain("paket_bilgisi");
    expect(talimat).toContain("WebSearch ve WebFetch senin için kapalı.");
    await sirket.ajanGuncelle(deniz.id, { yetenekler: rolYetenekleri("backend") });
  });

  it("açık yetenekler talimatta iki dilde anılır; CEO araştırma işini kime vereceğini bilir", () => {
    const tr = yetenekTalimati(ceo, "tr");
    expect(tr[0]).toBe(
      "- Web'de araştırma için mcp__arnorg__web_ara, sayfa, PDF ya da JSON okumak için mcp__arnorg__web_oku kullan (uzun sayfa parça parça gelir; baslangic ile sürdür); WebSearch/WebFetch aracını yalnız bunlar sonuç vermezse kullan.",
    );
    expect(tr.join("\n")).toContain("mcp__arnorg__arastirma_kaydet");
    expect(tr.at(-1)).toMatch(/Araştırmacı'ya \(arastirmaci\) ya da web yetenekleri olan bir çalışana ver/);
    const en = yetenekTalimati(ceo, "en");
    expect(en[0]).toMatch(/^- Use mcp__arnorg__web_ara to research on the web and mcp__arnorg__web_oku/);
    expect(en.at(-1)).toMatch(/Researcher \(arastirmaci\)/);
    expect(yetenekTalimati({ rol: "backend", yetenekler: [] }, "tr")).toEqual([]);
    expect(yetenekTalimati({ rol: "backend", yetenekler: ["web_arama"] as YetenekKimligi[] }, "tr")).toEqual(["- Web'de araştırma için mcp__arnorg__web_ara kullan.", "- WebSearch ve WebFetch senin için kapalı."]);
    const talimat = (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(depo.ajan(ceo.id)!, "/tmp");
    expect(talimat).toContain("mcp__arnorg__web_ara");
    expect(talimat).toContain("Araştırmacı'ya (arastirmaci)");
  });
});

describe("denetim kapısı", () => {
  it("kapalı yeteneğin aracı açık oturumda da reddedilir ve kayda düşer", async () => {
    await sirket.ajanGuncelle(deniz.id, { yetenekler: ["web_okuma"] });
    const k = await sirket.kapi(deniz.id, "mcp__arnorg__web_ara", { sorgu: "x" }, "toolu_1");
    expect(k).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: expect.stringContaining('"Web araması" yeteneğin yönetim kurulunca kapatıldı') } });
    const w = await sirket.kapi(deniz.id, "WebSearch", { query: "x" }, "toolu_2");
    expect(w).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    const kayitlar = depo.denetimKayitlari(pid, 20).filter((d) => d.ajanId === deniz.id);
    // Reddedilen web çağrısının özeti de izin verilenlerinki gibi okunur: "sorgu [kategori]"
    expect(kayitlar.find((d) => d.arac === "mcp__arnorg__web_ara")).toMatchObject({ karar: "ret", kural: "Yetenek kapalı", girdiOzeti: "x" });
    await sirket.ajanGuncelle(deniz.id, { yetenekler: rolYetenekleri("backend") });
    expect(aracAcik(depo.ajan(deniz.id)!, "mcp__arnorg__web_ara")).toBe(true);
  });

  it("web araçları denetimden geçer ve kayda düşer; diğer ArnOrg araçları sessiz kalır", async () => {
    expect(await sirket.kapi(deniz.id, "mcp__arnorg__web_oku", { adres: "https://docs.ornek.com/a" }, "toolu_3")).toEqual({});
    expect(await sirket.kapi(deniz.id, "mcp__arnorg__web_ara", { sorgu: "electron updater", kategori: "kod" }, "toolu_4")).toEqual({});
    expect(await sirket.kapi(deniz.id, "mcp__arnorg__gorevleri_listele", {}, "toolu_5")).toEqual({});
    const kayitlar = depo.denetimKayitlari(pid, 50).filter((d) => d.ajanId === deniz.id);
    expect(kayitlar.find((d) => d.aracKimligi === "toolu_3")).toMatchObject({ arac: "mcp__arnorg__web_oku", karar: "izin", girdiOzeti: "https://docs.ornek.com/a" });
    expect(kayitlar.find((d) => d.aracKimligi === "toolu_4")).toMatchObject({ arac: "mcp__arnorg__web_ara", karar: "izin", girdiOzeti: "electron updater [kod]" });
    expect(kayitlar.find((d) => d.aracKimligi === "toolu_5")).toBeUndefined();
  });

  it("politikanın url kuralı web_oku adresine de uygulanır", async () => {
    sirket.politikaYaz(pid, [...varsayilanKurallar(), { id: "yasak-alan", ad: "Yasak alan", aciklama: "", karar: "ret", hedef: "url", desenler: ["yasak\\.ornek\\.com"], araclar: [], etkin: true }]);
    const k = await sirket.kapi(deniz.id, "mcp__arnorg__web_oku", { adres: "https://yasak.ornek.com/gizli" }, "toolu_6");
    expect(k).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: expect.stringContaining("Yasak alan") } });
    sirket.politikaYaz(pid, varsayilanKurallar());
  });
});

describe("web ve araştırma araçları", () => {
  it("web_ara birleşik sonuçları ve yanıt veren motorları yazar", async () => {
    const s = await cagir(deniz.id, "web_ara", { sorgu: "electron updater", kategori: "kod", dil: "en" });
    expect(s.hata).toBe(false);
    expect(s.metin).toMatch(/^Web araması: "electron updater" · kod · sayfa 1 · en/);
    expect(s.metin).toMatch(/Yanıt veren motorlar \(3\/\d+\): stackoverflow, github, npm/);
    expect(s.metin).toContain("1. electron-updater & private repo");
    expect(s.metin).toContain("https://www.npmjs.com/package/electron-updater");
  });

  it("web_oku Markdown'ı üst bilgi ve parça bilgisiyle verir; şema dışı adres hatadır", async () => {
    const s = await cagir(deniz.id, "web_oku", { adres: "https://docs.ornek.com/guncelleme" });
    expect(s.hata).toBe(false);
    expect(s.metin).toMatch(/^# Güncelleme\nAdres: https:\/\/docs\.ornek\.com\/guncelleme\nSite: docs\.ornek\.com · Tür: HTML · Kaynak: yerel\nKarakter 0–\d+ \/ \d+ · belgenin sonu/);
    expect(s.metin).toContain("Özel depodan güncelleme belirteç ister.");
    const k = await cagir(deniz.id, "web_oku", { adres: "file:///etc/passwd" });
    expect(k).toEqual({ metin: "Yalnız http ve https adresleri okunur (file: değil).", hata: true });
  });

  it("paket_bilgisi ve github_ara", async () => {
    const p = await cagir(deniz.id, "paket_bilgisi", { ad: "electron-updater", ekosistem: "npm" });
    expect(p.metin).toContain("Son sürüm: 6.8.9");
    expect(p.metin).toContain("Lisans: MIT");
    const g = await cagir(deniz.id, "github_ara", { sorgu: "electron updater private", tur: "repo" });
    expect(g.metin).toMatch(/^GitHub araması \(depo\): "electron updater private" · 1 sonuç · gh girişiyle/);
    expect(g.metin).toContain("1. ornek/updater");
  });

  it("arastirma_kaydet notu kaynaklarıyla yazar, hafızaya kısa kayıt ekler, aynı adı ezmez", async () => {
    const girdi = {
      baslik: "electron-updater: özel depodan güncelleme",
      ozet: "GitHub sağlayıcısı özel depodan güncelleyebilir ama belirteç uygulamaya gömülür; ara sunucu önerilir.",
      bulgular: "- private: true ve GH_TOKEN ile çalışır.\n- Belirteç dağıtılırsa depo açığa çıkar.",
      kaynaklar: [
        { adres: "https://www.electron.build/auto-update", baslik: "Auto Update - electron-builder" },
        { adres: "https://stackoverflow.com/questions/1/x", baslik: "Stack Overflow sorusu" },
      ],
    };
    const s = await cagir(ece.id, "arastirma_kaydet", girdi);
    const yol = `arastirma/${bugun()}-electron-updater-ozel-depodan-guncelleme.md`;
    expect(s.metin).toContain(`Araştırma notu kaydedildi: notlar/${yol} (2 kaynak)`);
    const icerik = fs.readFileSync(notYoluCoz(sirket.proje(pid).yol, yol), "utf8");
    expect(icerik).toContain("# electron-updater: özel depodan güncelleme");
    expect(icerik).toContain("## Bulgular");
    expect(icerik).toContain("1. [Auto Update - electron-builder](https://www.electron.build/auto-update) — electron.build");
    expect(icerik).toContain("Ece (Araştırmacı)");
    const kayit = depo.hafizaKayitlari(pid, { tur: "olgu", sinir: 50 }).find((k) => k.baslik === "Araştırma: electron-updater: özel depodan güncelleme");
    expect(kayit).toMatchObject({ etiketler: ["arastirma"], kaynakAjanId: ece.id });
    expect(kayit!.metin).toContain(`notlar/${yol}`);
    const ikinci = await cagir(ece.id, "arastirma_kaydet", girdi);
    expect(ikinci.metin).toContain(`-guncelleme-2.md`);
  });
});

describe("API", () => {
  let app: FastifyInstance;
  const anahtar = "test-anahtari-yetenek-0123456789";
  const h = () => ({ host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` });
  beforeAll(async () => {
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => {
    await app.close();
  });

  it("yetenek kataloğu ve rol varsayılanları", async () => {
    const k = await app.inject({ url: "/api/yetenekler", headers: h() });
    expect((k.json() as { kimlik: string }[]).map((y) => y.kimlik)).toEqual(["web_arama", "web_okuma", "arastirma", "paket_bilgisi", "github_arastirma", "claude_web"]);
    const r = await app.inject({ url: "/api/yetenekler/roller", headers: h() });
    expect((r.json() as Record<string, string[]>).arastirmaci).toHaveLength(6);
  });

  it("ajan güncellemesi yetenekleri değiştirir; bilinmeyen yetenek 400", async () => {
    const y = await app.inject({ method: "PATCH", url: `/api/ajanlar/${deniz.id}`, headers: h(), payload: { yetenekler: ["web_arama", "claude_web"] } });
    expect(y.statusCode).toBe(200);
    expect((y.json() as Ajan).yetenekler).toEqual(["web_arama", "claude_web"]);
    const kotu = await app.inject({ method: "PATCH", url: `/api/ajanlar/${deniz.id}`, headers: h(), payload: { yetenekler: ["uçmak"] } });
    expect(kotu.statusCode).toBe(400);
    await app.inject({ method: "PATCH", url: `/api/ajanlar/${deniz.id}`, headers: h(), payload: { yetenekler: rolYetenekleri("backend") } });
  });

  it("web ayarları kaydedilir ve doğrulanır", async () => {
    const a = await app.inject({ method: "PUT", url: "/api/ayarlar", headers: h(), payload: { web: { searxngAdresi: "searx.ornek.org/search", kapaliMotorlar: ["bing", "olmayan"] } } });
    expect(a.statusCode).toBe(200);
    expect((a.json() as Ayarlar).web).toEqual({ searxngAdresi: "https://searx.ornek.org", disOkuyucu: true, kapaliMotorlar: ["bing"] });
    const yalniz = await app.inject({ method: "PUT", url: "/api/ayarlar", headers: h(), payload: { web: { disOkuyucu: false } } });
    expect((yalniz.json() as Ayarlar).web).toEqual({ searxngAdresi: "https://searx.ornek.org", disOkuyucu: false, kapaliMotorlar: ["bing"] });
    const kotu = await app.inject({ method: "PUT", url: "/api/ayarlar", headers: h(), payload: { web: { searxngAdresi: "ftp://searx.ornek.org" } } });
    expect(kotu.statusCode).toBe(400);
    const durum = (await app.inject({ url: "/api/web/durum", headers: h() })).json() as WebDurumu;
    expect(durum.searxngAdresi).toBe("https://searx.ornek.org");
    expect(durum.disOkuyucu).toBe(false);
    expect(durum.motorlar.find((m) => m.kimlik === "bing")!.etkin).toBe(false);
    expect(durum.motorlar.find((m) => m.kimlik === "searxng")!.etkin).toBe(true);
    await app.inject({ method: "PUT", url: "/api/ayarlar", headers: h(), payload: { web: { searxngAdresi: null, disOkuyucu: true, kapaliMotorlar: [] } } });
  });

  it("kurulun deneme araması ve okuması", async () => {
    const a = await app.inject({ method: "POST", url: "/api/web/ara", headers: h(), payload: { sorgu: "electron updater", kategori: "kod" } });
    expect(a.statusCode).toBe(200);
    const y = a.json() as WebAramaYaniti;
    // Kod kategorisi: sahte ağda yalnız Stack Overflow ve npm, sahte gh ile GitHub yanıt verir
    expect(y.yanitVerenler).toEqual(["stackoverflow", "github", "npm"]);
    expect(y.sonuclar[0]!.baslik).toBe("electron-updater & private repo");
    expect((await app.inject({ method: "POST", url: "/api/web/ara", headers: h(), payload: { sorgu: "" } })).statusCode).toBe(400);
    const o = await app.inject({ method: "POST", url: "/api/web/oku", headers: h(), payload: { adres: "https://docs.ornek.com/guncelleme", uzunluk: 500 } });
    expect(o.statusCode).toBe(200);
    expect(o.json()).toMatchObject({ tur: "html", baslik: "Güncelleme", devamVar: true });
    expect((await app.inject({ method: "POST", url: "/api/web/oku", headers: h(), payload: { adres: "data:text/plain,x" } })).statusCode).toBe(400);
  });
});
