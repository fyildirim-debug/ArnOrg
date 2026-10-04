// Şirket ve API entegrasyon testleri (Claude Code oturumu açılmaz)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SunucuOlayi } from "@arnorg/ortak";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { notYoluCoz } from "./proje-dosyalari.js";
import { guvenliYol } from "./dosyalar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-test-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("proje", () => {
  it("yeni repo açar, iskelet kurar, CEO'yu işe alır", async () => {
    const p = await sirket.projeOlustur({ ad: "Deneme", yol: path.join(gecici, "repo"), olustur: true, aciklama: "Test projesi" });
    expect(p.ajanSayisi).toBe(1);
    expect(fs.existsSync(path.join(p.yol, ".arnorg", "notlar", "vizyon.md"))).toBe(true);
    expect(fs.existsSync(path.join(p.yol, ".arnorg", "ekip", "ada.md"))).toBe(true);
    expect(fs.existsSync(path.join(p.yol, "CLAUDE.md"))).toBe(true);
    const ceo = depo.ajanlar(p.id)[0]!;
    expect(ceo.rol).toBe("ceo");
    expect(ceo.izinModu).toBe("bypassPermissions");
    expect(depo.kanallar(p.id).map((k) => k.ad)).toEqual(["genel", "muhendislik", "yonetim"]);
  });

  it("aynı repoyu ikinci kez eklemez, git olmayan klasörü bağlamaz", async () => {
    await expect(sirket.projeOlustur({ ad: "Tekrar", yol: path.join(gecici, "repo"), olustur: false })).rejects.toThrow(/zaten/);
    fs.mkdirSync(path.join(gecici, "duz"));
    await expect(sirket.projeOlustur({ ad: "Düz", yol: path.join(gecici, "duz"), olustur: false })).rejects.toThrow(/git deposu değil/);
  });
});

describe("ekip ve görevler", () => {
  it("işe alır, aynı adı reddeder, CEO'ya bağlar", () => {
    const p = depo.projeler()[0]!;
    const ceo = depo.ajanlar(p.id)[0]!;
    const deniz = sirket.iseAl(p.id, { ad: "Deniz", rol: "backend" });
    expect(deniz.yoneticiId).toBe(ceo.id);
    expect(deniz.model).toBe("sonnet");
    expect(() => sirket.iseAl(p.id, { ad: "deniz", rol: "test" })).toThrow(/zaten/);
    expect(() => sirket.iseAl(p.id, { ad: "İkinci", rol: "ceo" })).toThrow(/CEO/);
  });

  it("durum geçişlerini ve bağımlılıkları denetler", async () => {
    const p = depo.projeler()[0]!;
    const deniz = depo.ajanAdla(p.id, "Deniz")!;
    const t1 = sirket.gorevOlustur(p.id, { baslik: "Şema", atananId: deniz.id });
    const t2 = sirket.gorevOlustur(p.id, { baslik: "API", atananId: deniz.id, bagimliliklar: [t1.kod] });
    expect(t2.bagimliliklar).toEqual([t1.id]);
    await expect(sirket.gorevGuncelle(t2.id, { durum: "tamam" })).rejects.toThrow(/geçişine izin yok/);
    await expect(sirket.gorevGuncelle(t2.id, { durum: "calisiliyor" })).rejects.toThrow(/bitmemiş bağımlılık/);
    // Oturumlar kapalı: başlatma bildirimle raporlanır, durum yine güncellenir
    const calisan = await sirket.gorevGuncelle(t1.id, { durum: "calisiliyor" });
    expect(calisan.durum).toBe("calisiliyor");
    expect(gelenler.some((o) => o.tur === "bildirim" && /başlatılamadı/.test(o.metin))).toBe(true);
  });

  it("@anma ile ajan bulur", () => {
    const p = depo.projeler()[0]!;
    expect(sirket.anilanlariBul(p.id, "@deniz bak, @Ada da baksın, @yok").map((a) => a.ad)).toEqual(["Deniz", "Ada"]);
  });
});

describe("onaylar", () => {
  it("işe alım teklifi onaylanınca çalışan oluşur", async () => {
    const p = depo.projeler()[0]!;
    const ceo = depo.ajanlar(p.id).find((a) => a.rol === "ceo")!;
    const o = sirket.teklifAc(ceo, "ise_alim", "İşe alım: Mert", "Test gerek", { ad: "Mert", rol: "test", yoneticiAd: "Ada" });
    expect(o.durum).toBe("bekliyor");
    const sonuc = await sirket.onayKarari(o.id, "onayla", "Uygun");
    expect(sonuc.durum).toBe("onaylandi");
    expect(depo.ajanAdla(p.id, "Mert")?.rolAdi).toBe("Test mühendisi");
    await expect(sirket.onayKarari(o.id, "reddet")).rejects.toThrow(/sonuçlanmış/);
  });

  it("araç onayı bekleyen çağrıyı kurul kararıyla çözer", async () => {
    const p = depo.projeler()[0]!;
    const deniz = depo.ajanAdla(p.id, "Deniz")!;
    const beklenen = sirket.kararBekle(deniz, "arac", "Deniz · Bash", "git push origin main", { arac: "Bash" });
    const bekleyen = depo.onaylar(p.id, "bekliyor").find((x) => x.tur === "arac")!;
    await sirket.onayKarari(bekleyen.id, "reddet", "PR açsın");
    await expect(beklenen).resolves.toEqual({ izin: false, not: "PR açsın" });
  });
});

describe("denetim kapısı", () => {
  it("yıkıcı komutu reddeder, dışarı push'u onaya sorar", async () => {
    const p = depo.projeler()[0]!;
    const deniz = depo.ajanAdla(p.id, "Deniz")!;
    const ret = await sirket.kapi(deniz.id, "Bash", { command: "git reset --hard HEAD~1" });
    expect(ret).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    const sor = sirket.kapi(deniz.id, "Bash", { command: "git push origin main" });
    await new Promise((r) => setTimeout(r, 20));
    const onay = depo.onaylar(p.id, "bekliyor").find((x) => x.tur === "arac")!;
    expect(onay.ayrinti).toContain("git push");
    await sirket.onayKarari(onay.id, "onayla");
    await expect(sor).resolves.toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } });
    const kayitlar = depo.denetimKayitlari(p.id);
    expect(kayitlar.some((k) => k.karar === "ret" && k.girdiOzeti.includes("reset"))).toBe(true);
  });

  it("ArnOrg araçlarını denetlemeden geçirir", async () => {
    const p = depo.projeler()[0]!;
    const deniz = depo.ajanAdla(p.id, "Deniz")!;
    await expect(sirket.kapi(deniz.id, "mcp__arnorg__mesaj_gonder", { metin: "x" })).resolves.toEqual({});
  });
});

describe("yol güvenliği", () => {
  it("not ve dosya yollarında dizin dışına çıkışı engeller", () => {
    expect(() => notYoluCoz("/repo", "../gizli.md")).toThrow();
    expect(() => notYoluCoz("/repo", "kararlar/a.exe")).toThrow();
    expect(() => guvenliYol("/repo", "../../etc/passwd")).toThrow();
    expect(guvenliYol("/repo", "src/a.ts")).toBe(path.resolve("/repo/src/a.ts"));
  });
});

describe("API", () => {
  let app: FastifyInstance;
  const anahtar = "test-anahtari-0123456789abcdef";
  beforeAll(async () => {
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => {
    await app.close();
  });
  const host = () => `127.0.0.1:${(app.server.address() as { port: number }).port}`;

  it("anahtarsız ve yabancı Host/Origin isteklerini reddeder", async () => {
    expect((await app.inject({ url: "/api/saglik", headers: { host: host() } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/saglik", headers: { host: "kotu.com", authorization: `Bearer ${anahtar}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/saglik", headers: { host: host(), origin: "http://kotu.com", authorization: `Bearer ${anahtar}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/saglik", headers: { host: host(), authorization: `Bearer ${anahtar}` } })).statusCode).toBe(200);
  });

  it("projeleri, ajanları ve görevleri döner; hatayı Türkçe verir", async () => {
    const h = { host: host(), authorization: `Bearer ${anahtar}` };
    const projeler = (await app.inject({ url: "/api/projeler", headers: h })).json() as { id: string }[];
    expect(projeler.length).toBe(1);
    const pid = projeler[0]!.id;
    expect(((await app.inject({ url: `/api/projeler/${pid}/ajanlar`, headers: h })).json() as unknown[]).length).toBeGreaterThanOrEqual(3);
    const kotu = await app.inject({ method: "POST", url: `/api/projeler/${pid}/gorevler`, headers: h, payload: { baslik: "" } });
    expect(kotu.statusCode).toBe(400);
    expect(kotu.json()).toHaveProperty("hata");
    const yok = await app.inject({ url: `/api/projeler/yok/gorevler`, headers: h });
    expect(yok.statusCode).toBe(404);
    expect(yok.json()).toEqual({ hata: "Proje bulunamadı." });
  });

  it("not yazar ve okur, dosya ağacını döner", async () => {
    const h = { host: host(), authorization: `Bearer ${anahtar}` };
    const pid = ((await app.inject({ url: "/api/projeler", headers: h })).json() as { id: string }[])[0]!.id;
    const yaz = await app.inject({ method: "PUT", url: `/api/projeler/${pid}/not`, headers: h, payload: { yol: "kararlar/ADR-002-test.md", icerik: "# ADR-002 · Test\n" } });
    expect(yaz.json()).toMatchObject({ baslik: "ADR-002 · Test" });
    const oku = await app.inject({ url: `/api/projeler/${pid}/not?yol=kararlar/ADR-002-test.md`, headers: h });
    expect(oku.json()).toMatchObject({ icerik: "# ADR-002 · Test\n" });
    const agac = (await app.inject({ url: `/api/projeler/${pid}/dosyalar?alan=ana`, headers: h })).json() as { cocuklar: { ad: string }[] };
    expect(agac.cocuklar.map((c) => c.ad)).toContain("CLAUDE.md");
  });
});

describe("gözetmen", () => {
  it("ilerlemeyen görevi önce sorumluya hatırlatır, sonra yöneticiye ve kurula yükseltir", async () => {
    const { Gozetmen } = await import("./gozetmen.js");
    const p = depo.projeler()[0]!;
    const deniz = depo.ajanAdla(p.id, "Deniz")!;
    const g = depo.gorevler(p.id).find((x) => x.durum === "calisiliyor" && x.atananId === deniz.id)!;
    const gozetmen = new Gozetmen(sirket);
    expect(depo.ajan(deniz.id)?.durum).toBe("calisiyor");
    // Çalışan ajan tıkanmış sayılmaz
    expect(await gozetmen.denetle(Date.now() + 60 * 60_000)).toEqual([]);
    depo.ajanGuncelle(deniz.id, { durum: "kapali" });
    expect(await gozetmen.denetle(Date.now())).toEqual([]);
    const dk = 60_000;
    let t = Date.now() + 21 * dk;
    expect((await gozetmen.denetle(t)).map((e) => e.tur)).toEqual(["hatirlatma"]);
    // Eşik dolmadan yeni eylem yok
    expect(await gozetmen.denetle(t + 5 * dk)).toEqual([]);
    t += 21 * dk;
    expect((await gozetmen.denetle(t)).map((e) => e.tur)).toEqual(["hatirlatma"]);
    t += 21 * dk;
    const yukselt = await gozetmen.denetle(t);
    expect(yukselt).toEqual([{ tur: "yukseltme", gorevKodu: g.kod, ajanAd: "Ada" }]);
    t += 21 * dk;
    expect((await gozetmen.denetle(t)).map((e) => e.tur)).toEqual(["kurul"]);
    expect(depo.mesajlar(p.id, "genel").some((m) => m.gonderenAd === "ArnOrg" && m.metin.includes(g.kod))).toBe(true);
    t += 21 * dk;
    expect(await gozetmen.denetle(t)).toEqual([]);
    // Duraklatılan ajan dürtülmez; görev güncellenince takip sıfırlanır
    depo.ajanGuncelle(deniz.id, { durum: "duraklatildi" });
    await sirket.gorevGuncelle(g.id, { aciklama: "Güncellendi" });
    expect(await gozetmen.denetle(t + 60 * dk)).toEqual([]);
    depo.ajanGuncelle(deniz.id, { durum: "kapali" });
  });

  it("ayar 0 iken çalışmaz", async () => {
    const { Gozetmen } = await import("./gozetmen.js");
    sirket.yapilandirma.guncelle({ tikanmaDakika: 0 });
    expect(await new Gozetmen(sirket).denetle(Date.now() + 10 * 86_400_000)).toEqual([]);
    sirket.yapilandirma.guncelle({ tikanmaDakika: 20 });
  });

  it("dönem raporu görevleri, ekibi ve onayları özetler", async () => {
    const { raporOlustur } = await import("./gozetmen.js");
    const p = depo.projeler()[0]!;
    const r = raporOlustur(sirket, p.id, 7);
    expect(r.yol).toMatch(/^raporlar\/\d{4}-\d{2}-\d{2}\.md$/);
    expect(r.markdown).toContain("## Özet");
    expect(r.markdown).toContain("## Sürenler");
    expect(r.markdown).toContain("| Deniz | Backend geliştirici |");
    expect(r.markdown).toMatch(/Tıkananlar[\s\S]*bekliyor: T-1/);
  });
});

describe("Stüdyo dosyaları", () => {
  it("sonradan eklenen dosyayı sunar, eksik dosyada index.html'e düşmez, SPA yolunda index döner", async () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-studyo-"));
    fs.writeFileSync(path.join(dizin, "index.html"), "<!doctype html><title>ArnOrg</title>");
    const anahtar = "studyo-anahtari-0123456789abcdef";
    const app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: dizin, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const h = { host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` };
    fs.mkdirSync(path.join(dizin, "assets"));
    fs.writeFileSync(path.join(dizin, "assets", "giris-abc123.js"), "console.log(1)");
    const js = await app.inject({ url: "/assets/giris-abc123.js", headers: h });
    expect(js.statusCode).toBe(200);
    expect(js.headers["cache-control"]).toContain("immutable");
    expect((await app.inject({ url: "/assets/eski-000.js", headers: h })).statusCode).toBe(404);
    const spa = await app.inject({ url: "/proje/pano", headers: h });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain("<title>ArnOrg</title>");
    expect(spa.headers["cache-control"]).toBe("no-cache");
    await app.close();
    fs.rmSync(dizin, { recursive: true, force: true });
  });
});

describe("imzasız commit kapısı", () => {
  it("Claude imzalı commit'i değiştirilmiş girdiyle geçirir ve denetime yazar", async () => {
    const p = depo.projeler()[0]!;
    const deniz = depo.ajanAdla(p.id, "Deniz")!;
    const sonuc = await sirket.kapi(deniz.id, "Bash", { command: 'git commit -m "Şema" -m "Co-Authored-By: Claude <noreply@anthropic.com>"' });
    expect(sonuc).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow", updatedInput: { command: 'git commit -m "Şema"' } } });
    expect(depo.denetimKayitlari(p.id, 5).some((k) => k.karar === "degisti" && k.kural === "İmzasız commit")).toBe(true);
  });
});
