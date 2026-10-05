// Proje adresleri (0.0.8), Tarayıcı'da Linkler (0.0.9): kabuk çıktısında sunucu adresi, kayıt, yoklama ve düşme,
// kalıcı linkler, araçlar, uçlar (kurulun ekleyip kaldırması, CEO'dan iste) ve talimat
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { KURUL, type Ajan, type Mesaj, type ProjeAdresi, type SunucuOlayi } from "@arnorg/ortak";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { ADRES_SINIRI, KAPALI_DUSME_MS, ProjeAdresleri, sunucuAdresleri, taranacakMetin, YOKLANMAYAN_DUSME_MS, type Yoklayici } from "./proje-adresleri.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

describe("kabuk çıktısında sunucu adresi", () => {
  it("Vite: renk kodları atılır, ağ adresi alınmaz, ad karşılamadan gelir", () => {
    const cikti = [
      "",
      "  \x1b[32m\x1b[1mVITE\x1b[22m v5.4.0\x1b[39m  \x1b[2mready in \x1b[0m\x1b[1m312\x1b[22m\x1b[2m\x1b[0m ms\x1b[22m",
      "",
      "  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m",
      "  \x1b[32m➜\x1b[39m  \x1b[1mNetwork\x1b[22m: \x1b[36mhttp://192.168.1.20:\x1b[1m5173\x1b[22m/\x1b[39m",
    ].join("\n");
    expect(sunucuAdresleri(cikti, "npm run dev")).toEqual([{ adres: "http://localhost:5173/", ad: "Vite" }]);
  });

  it("yaygın sunucu satırları; 0.0.0.0 localhost olur, aynı adres bir kez", () => {
    const next = ["▲ Next.js 14.2.3", "  - Local:        http://localhost:3000", "  - Local:        http://localhost:3000"].join("\n");
    expect(sunucuAdresleri(next, "npm run dev")).toEqual([{ adres: "http://localhost:3000/", ad: "Next.js" }]);
    expect(sunucuAdresleri("Server running at http://0.0.0.0:4000/api")).toEqual([{ adres: "http://localhost:4000/api", ad: "API" }]);
    expect(sunucuAdresleri("listening on http://[::]:8080")).toEqual([{ adres: "http://localhost:8080/", ad: null }]);
    expect(sunucuAdresleri("API listening on http://127.0.0.1:8080 (Press CTRL+C to quit)")).toEqual([{ adres: "http://127.0.0.1:8080/", ad: "API" }]);
    expect(sunucuAdresleri("Starting development server at http://127.0.0.1:8000/", "python manage.py runserver")).toEqual([{ adres: "http://127.0.0.1:8000/", ad: "Django" }]);
    expect(sunucuAdresleri("INFO:     Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)")).toEqual([{ adres: "http://127.0.0.1:8001/", ad: "FastAPI" }]);
    expect(sunucuAdresleri("Storybook 8.1 for react-vite started\n   Local:            http://localhost:6006/")).toEqual([{ adres: "http://localhost:6006/", ad: "Storybook" }]);
    expect(sunucuAdresleri("Sunucu http://192.168.1.20:3000 adresinde çalışıyor.")).toEqual([]);
    expect(sunucuAdresleri("Sunucu çalışıyor: Local: http://192.168.1.20:3000.")).toEqual([{ adres: "http://192.168.1.20:3000/", ad: null }]);
  });

  it("uzak adresler, sunucu satırı olmayan bağlantılar ve geçersiz şemalar alınmaz", () => {
    const cikti = [
      "Deployed: https://siparis.vercel.app ready on https://siparis.vercel.app",
      "Bkz. http://localhost:3000/docs",
      "curl http://localhost:3000/api/saglik",
      "Metro waiting on exp://192.168.1.5:8081",
      "Local: http://user:parola@localhost:9000/",
    ].join("\n");
    expect(sunucuAdresleri(cikti)).toEqual([]);
  });

  it("taranacak metin: kabuk çıktısı ve okunan günlük dosyası", () => {
    expect(taranacakMetin("Bash", { command: "npm run dev" }, { stdout: "a", stderr: "b", interrupted: false })).toBe("a\nb");
    expect(taranacakMetin("PowerShell", {}, "çıktı")).toBe("çıktı");
    expect(taranacakMetin("Read", { file_path: "/tmp/dev.log" }, { type: "text", file: { content: "Local: http://localhost:5173/" } })).toBe("Local: http://localhost:5173/");
    expect(taranacakMetin("Read", { file_path: "/repo/README.md" }, { type: "text", file: { content: "Local: http://localhost:5173/" } })).toBeNull();
    expect(taranacakMetin("Write", { file_path: "/tmp/dev.log" }, {})).toBeNull();
    expect(taranacakMetin("Bash", {}, { stdout: "   ", stderr: "" })).toBeNull();
  });
});

describe("adres kaydı", () => {
  const AJAN = { id: "a1", ad: "Ece", projeId: "p1" } as Ajan;
  /** Kalıcı link testinin projesindeki çalışan */
  const MERT = { id: "a4", ad: "Mert", projeId: "p4" } as Ajan;
  const degerler = new Map<string, string>();
  const depo = {
    deger: (k: string) => degerler.get(k) ?? null,
    degerYaz: (k: string, v: string) => void degerler.set(k, v),
    projeler: () => [{ id: "p1" }, { id: "p2" }] as ReturnType<Depo["projeler"]>,
    ajan: (id: string) => [AJAN, MERT].find((a) => a.id === id) ?? null,
  };
  const olaylar: SunucuOlayi[] = [];
  let saat = Date.parse("2026-10-05T10:00:00Z");
  const acikPortlar = new Set([5173, 4000]);
  const yoklayici: Yoklayici = async (_s, port) => acikPortlar.has(port);
  const kayit = () => new ProjeAdresleri({ depo, olaylar: { yayinla: (o) => void olaylar.push(o) }, yoklayici, saat: () => saat });
  let k: ProjeAdresleri;
  const son = () => olaylar.filter((o): o is Extract<SunucuOlayi, { tur: "adresler.guncellendi" }> => o.tur === "adresler.guncellendi").at(-1);

  beforeAll(() => {
    k = kayit();
  });
  afterAll(() => k.durdur());

  it("bildirilen yerel adres yoklanır, saklanır ve olay yayınlanır", async () => {
    const a = await k.bildir("p1", { adres: "localhost:5173", ad: "  Geliştirme   sunucusu ", bildiren: AJAN, kaynak: "arac" });
    expect(a).toMatchObject({ projeId: "p1", adres: "http://localhost:5173/", ad: "Geliştirme sunucusu", bildirenId: "a1", bildirenAd: "Ece", kaynak: "arac", kalici: false, durum: "acik", yoklanir: true });
    expect(a.denetim).not.toBeNull();
    expect(son()).toMatchObject({ projeId: "p1", adresler: [{ id: a.id, durum: "acik" }] });
    expect(JSON.parse(degerler.get("proje-adresleri:p1")!)).toHaveLength(1);
    // Aynı adres başka yazımla: yeni kayıt açılmaz, ad güncellenir
    const b = await k.bildir("p1", { adres: "http://LOCALHOST:5173", ad: "Vite", bildiren: AJAN, kaynak: "arac" });
    expect(b.id).toBe(a.id);
    expect(k.listele("p1").map((x) => x.ad)).toEqual(["Vite"]);
  });

  it("çıktıdan yakalanan adres çalışanın verdiği adı ezmez; yeni adreste çalışana not döner", () => {
    const not = k.ciktidanYakala("a1", "Bash", { command: "npm run dev -w api" }, { stdout: "Local: http://localhost:5173/\nAPI listening on http://localhost:4000\n", stderr: "" });
    expect(not).toContain("http://localhost:4000/");
    expect(not).not.toContain("5173");
    expect(not).toContain("adres_kaldir");
    const liste = k.listele("p1");
    expect(liste.map((x) => [x.ad, x.kaynak])).toEqual([
      ["Vite", "arac"],
      ["API", "cikti"],
    ]);
    // Aynı çıktı tekrar: yeni adres yok, not da yok
    expect(k.ciktidanYakala("a1", "Bash", {}, { stdout: "API listening on http://localhost:4000", stderr: "" })).toBeNull();
    // Bilinmeyen ajan ya da sunucu satırı olmayan çıktı
    expect(k.ciktidanYakala("yok", "Bash", {}, { stdout: "Local: http://localhost:7000", stderr: "" })).toBeNull();
    expect(k.ciktidanYakala("a1", "Bash", {}, { stdout: "tamam", stderr: "" })).toBeNull();
  });

  it("uzak adres yoklanmaz; izinli sunucu yoklanır; http(s) dışı ve kimlik bilgili adres reddedilir", async () => {
    // Yerel ağ dışındaki adres varsayılan olarak kalıcıdır; burada geçici bildirilir (bir günde düşmesi aşağıda)
    const uzak = await k.bildir("p2", { adres: "https://onizleme.ornek.com/", ad: "Önizleme", bildiren: AJAN, kaynak: "arac", kalici: false });
    expect(uzak).toMatchObject({ yoklanir: false, kalici: false, durum: "bilinmiyor", denetim: null });
    k.izinliHostlariAyarla(["onizleme.ornek.com"]);
    expect(k.listele("p2")[0]!.yoklanir).toBe(true);
    k.izinliHostlariAyarla([]);
    await expect(k.bildir("p2", { adres: "ftp://localhost/", ad: "x", bildiren: AJAN, kaynak: "arac" })).rejects.toThrow(/http ya da https/);
    await expect(k.bildir("p2", { adres: "file:///etc/passwd", ad: "x", bildiren: AJAN, kaynak: "arac" })).rejects.toThrow(/http ya da https/);
    await expect(k.bildir("p2", { adres: "http://kurul:gizli@localhost:3000", ad: "x", bildiren: AJAN, kaynak: "arac" })).rejects.toThrow(/parola/);
  });

  it("kapanan adres işaretlenir, uzun süre kapalı kalınca düşer; yoklanmayan adres bir günde düşer", async () => {
    acikPortlar.delete(4000);
    await k.yokla();
    expect(k.listele("p1").find((x) => x.ad === "API")?.durum).toBe("kapali");
    saat += KAPALI_DUSME_MS - 1000;
    await k.yokla();
    expect(k.listele("p1")).toHaveLength(2);
    saat += 2000;
    await k.yokla();
    expect(k.listele("p1").map((x) => x.ad)).toEqual(["Vite"]);
    expect(son()?.adresler.map((x) => x.ad)).toEqual(["Vite"]);
    // Yeniden açılan sunucu kapalılık süresini sıfırlar
    acikPortlar.delete(5173);
    await k.yokla();
    acikPortlar.add(5173);
    saat += KAPALI_DUSME_MS;
    await k.yokla();
    expect(k.listele("p1")[0]!.durum).toBe("acik");
    expect(k.listele("p2")).toHaveLength(1);
    saat = Date.parse(k.listele("p2")[0]!.guncelleme) + YOKLANMAYAN_DUSME_MS + 1000;
    await k.yokla();
    expect(k.listele("p2")).toEqual([]);
  });

  it("adı ya da adresiyle kaldırılır; kayıt yeniden açılışta okunur", async () => {
    await k.bildir("p2", { adres: "http://localhost:5173/storybook", ad: "Storybook", bildiren: AJAN, kaynak: "arac" });
    await k.bildir("p2", { adres: "http://localhost:4000", ad: "API", bildiren: AJAN, kaynak: "arac" });
    expect(k.kaldir("p2", "storybook").map((x) => x.ad)).toEqual(["Storybook"]);
    expect(k.kaldir("p2", "yok")).toEqual([]);
    const ikinci = kayit();
    expect(ikinci.listele("p2").map((x) => [x.ad, x.adres])).toEqual([["API", "http://localhost:4000/"]]);
    expect(ikinci.kaldir("p2", "localhost:4000/").map((x) => x.ad)).toEqual(["API"]);
    expect(ikinci.listele("p2")).toEqual([]);
    ikinci.durdur();
  });

  it("projede en çok sınır kadar adres: açık adresler doluysa reddedilir, kapalı olan yer açar", async () => {
    const dolu = kayit();
    acikPortlar.clear();
    for (let i = 0; i < ADRES_SINIRI; i++) acikPortlar.add(6000 + i);
    for (let i = 0; i < ADRES_SINIRI; i++) await dolu.bildir("p3", { adres: `http://localhost:${6000 + i}`, ad: `S${i}`, bildiren: AJAN, kaynak: "arac" });
    await expect(dolu.bildir("p3", { adres: "http://localhost:7000", ad: "Fazla", bildiren: AJAN, kaynak: "arac" })).rejects.toThrow(/en çok 20 link/);
    acikPortlar.delete(6003);
    await dolu.yokla("p3");
    await dolu.bildir("p3", { adres: "http://localhost:7000", ad: "Yeni", bildiren: AJAN, kaynak: "arac" });
    const adlar = dolu.listele("p3").map((x) => x.ad);
    expect(adlar).toHaveLength(ADRES_SINIRI);
    expect(adlar).not.toContain("S3");
    expect(adlar.at(-1)).toBe("Yeni");
    dolu.durdur();
  });

  it("kalıcı link (0.0.9): CEO'nun, kurulun ve yerel ağ dışındaki bildirim kalıcıdır; kapalı da kalsa günler de geçse düşmez", async () => {
    const r = kayit();
    const CEO = { id: "c1", ad: "Ada", rol: "ceo" } as Ajan;
    acikPortlar.clear();
    const uygulama = await r.bildir("p4", { adres: "http://localhost:5174", ad: "Uygulama", bildiren: CEO, kaynak: "arac" });
    const test = await r.bildir("p4", { adres: "https://test.ornek.com", ad: "Test ortamı", bildiren: AJAN, kaynak: "arac" });
    const panel = await r.bildir("p4", { adres: "localhost:8081/yonetim", ad: "Yönetim paneli", bildiren: null, kaynak: "kurul" });
    const onizleme = await r.bildir("p4", { adres: "http://localhost:5175", ad: "Önizleme", bildiren: AJAN, kaynak: "arac" });
    expect([uygulama, test, panel, onizleme].map((a) => a.kalici)).toEqual([true, true, true, false]);
    expect(panel).toMatchObject({ adres: "http://localhost:8081/yonetim", kaynak: "kurul", bildirenId: null, bildirenAd: "Kurul", durum: "kapali" });

    // Çıktıdan yakalanan aynı adres adı, sahibi ve kalıcılığı değiştirmez; çalışanın kalıcılık vermeden yeniden
    // bildirmesi adı günceller, kalıcılığı korur; açıkça geçici demesi kalıcılığı kaldırır
    expect(r.ciktidanYakala(MERT.id, "Bash", {}, { stdout: "Local: http://localhost:5174/", stderr: "" })).toBeNull();
    expect(r.listele("p4")[0]).toMatchObject({ ad: "Uygulama", bildirenAd: "Ada", kaynak: "arac", kalici: true });
    expect(await r.bildir("p4", { adres: "localhost:5174", ad: "Uygulama (Vite)", bildiren: MERT, kaynak: "arac" })).toMatchObject({ ad: "Uygulama (Vite)", kalici: true });
    expect(await r.bildir("p4", { adres: "localhost:5174", ad: "Uygulama", bildiren: CEO, kaynak: "arac", kalici: false })).toMatchObject({ kalici: false });
    await r.bildir("p4", { adres: "localhost:5174", ad: "Uygulama", bildiren: CEO, kaynak: "arac", kalici: true });

    // Kapalılık süresi dolunca yalnız geçici adres düşer; bir gün sonra da kalıcılar durur
    saat += KAPALI_DUSME_MS + 1000;
    await r.yokla();
    expect(r.listele("p4").map((a) => a.ad)).toEqual(["Uygulama", "Test ortamı", "Yönetim paneli"]);
    saat += YOKLANMAYAN_DUSME_MS + 1000;
    await r.yokla();
    expect(r.listele("p4").map((a) => [a.ad, a.durum])).toEqual([
      ["Uygulama", "kapali"],
      ["Test ortamı", "bilinmiyor"],
      ["Yönetim paneli", "kapali"],
    ]);
    // Kalıcı link yalnız kaldırılınca gider
    expect(r.kaldir("p4", "test ortamı").map((a) => a.ad)).toEqual(["Test ortamı"]);
    r.durdur();
  });

  it("sınır doluyken kalıcı linkler yer açmaz", async () => {
    const dolu = kayit();
    acikPortlar.clear();
    for (let i = 0; i < ADRES_SINIRI; i++) await dolu.bildir("p5", { adres: `http://localhost:${6100 + i}`, ad: `K${i}`, bildiren: null, kaynak: "kurul" });
    await dolu.yokla("p5");
    await expect(dolu.bildir("p5", { adres: "http://localhost:7100", ad: "Fazla", bildiren: AJAN, kaynak: "arac" })).rejects.toThrow(/en çok 20 link/);
    expect(dolu.listele("p5")).toHaveLength(ADRES_SINIRI);
    dolu.durdur();
  });

  it("0.0.8 kaydı (kalıcılık alanı yok): bildirilen uzak adres kalıcı, yerel ve çıktıdan yakalanan geçici okunur", () => {
    const zaman = new Date(saat).toISOString();
    const eski = (adres: string, ad: string, kaynak: string) => ({ adres, ad, kaynak, bildirenId: "a1", bildirenAd: "Ece", guncelleme: zaman, durum: "bilinmiyor", denetim: null });
    degerler.set(
      "proje-adresleri:p6",
      JSON.stringify([eski("https://canli.ornek.com/", "Canlı site", "arac"), eski("http://localhost:3000/", "Geliştirme", "arac"), eski("http://localhost:4000/", "API", "cikti")]),
    );
    const r = kayit();
    expect(r.listele("p6").map((a) => [a.ad, a.kalici])).toEqual([
      ["Canlı site", true],
      ["Geliştirme", false],
      ["API", false],
    ]);
    r.durdur();
  });
});

describe("araçlar, uç ve talimat", () => {
  let gecici: string;
  let depo: Depo;
  let sirket: Sirket;
  let app: FastifyInstance;
  let pid: string;
  let ajan: Ajan;
  let sunucu: net.Server;
  let port: number;
  const olaylar = new OlayYolu();
  const gelenler: SunucuOlayi[] = [];
  const anahtar = "test-anahtari-adresler-0123456789";

  beforeAll(async () => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-adresler-"));
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    sirket = new Sirket(depo, olaylar, yap, () => null, true);
    olaylar.dinle((o) => gelenler.push(o));
    const p = await sirket.projeOlustur({ ad: "Adresler", yol: path.join(gecici, "repo"), olustur: true });
    pid = p.id;
    ajan = sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
    // Gerçek bir yerel sunucu: TCP yoklaması "açık" görür
    sunucu = net.createServer((s) => s.end());
    await new Promise<void>((coz) => sunucu.listen(0, "127.0.0.1", coz));
    port = (sunucu.address() as net.AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
    await new Promise((coz) => sunucu.close(coz));
    sirket.kapat();
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
  async function arac(ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
    const a = (arnorgAracListesi(sirket, ajan.id) as unknown as Arac[]).find((x) => x.name === ad);
    if (!a) throw new Error(`araç yok: ${ad}`);
    const s = await a.handler(girdi, {});
    return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
  }
  const basliklar = () => ({ host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` });

  it("adres_bildir yoklar ve durumu söyler; adresler listeler; adres_kaldir kaldırır", async () => {
    const acik = await arac("adres_bildir", { adres: `http://127.0.0.1:${port}`, ad: "API" });
    expect(acik.hata).toBe(false);
    expect(acik.metin).toContain(`API → http://127.0.0.1:${port}/`);
    expect(acik.metin).toContain("açık");
    // Kapalı port: yine kaydedilir, uyarıyla
    const kapali = await arac("adres_bildir", { adres: "http://127.0.0.1:9", ad: "Eski sunucu" });
    expect(kapali.metin).toContain("yanıt vermiyor");
    expect((await arac("adres_bildir", { adres: "javascript:alert(1)", ad: "x" })).hata).toBe(true);
    const liste = await arac("adresler", {});
    expect(liste.metin).toContain("API ·");
    expect(liste.metin).toContain("Deniz bildirdi");
    expect((await arac("adres_kaldir", { adres: "eski sunucu" })).metin).toContain("Kaldırıldı: Eski sunucu");
    expect((await arac("adres_kaldir", { adres: "eski sunucu" })).hata).toBe(true);
    const olay = gelenler.filter((o) => o.tur === "adresler.guncellendi").at(-1) as { projeId: string; adresler: ProjeAdresi[] };
    expect(olay.projeId).toBe(pid);
    expect(olay.adresler.map((a) => a.ad)).toEqual(["API"]);
  });

  it("kurul link ekler ve kaldırır (0.0.9): kalıcı, kaynağı kurul; aynı adres adını günceller; geçersiz 400, bilinmeyen 404", async () => {
    const ekle = (govde: Record<string, unknown>) => app.inject({ method: "POST", url: `/api/projeler/${pid}/adresler`, headers: basliklar(), payload: govde });
    const y = await ekle({ adres: "test.ornek.com/giris", ad: " Test ortamı " });
    expect(y.statusCode, y.body).toBe(200);
    const link = y.json() as ProjeAdresi;
    expect(link).toMatchObject({ adres: "https://test.ornek.com/giris", ad: "Test ortamı", kaynak: "kurul", kalici: true, bildirenId: null, bildirenAd: "Kurul", yoklanir: false });
    const yine = await ekle({ adres: "https://test.ornek.com/giris", ad: "Test" });
    expect(yine.json()).toMatchObject({ id: link.id, ad: "Test", kalici: true });
    expect((await ekle({ adres: "javascript:alert(1)", ad: "x" })).statusCode).toBe(400);
    expect((await ekle({ adres: "", ad: "x" })).statusCode).toBe(400);
    expect((await ekle({ adres: "localhost:3000", ad: "" })).statusCode).toBe(400);
    // Ajanlar listede görür
    expect((await arac("adresler", {})).metin).toMatch(/Test · https:\/\/test\.ornek\.com\/giris · .* · kalıcı · Kurul ekledi/);
    const sil = (id: string) => app.inject({ method: "DELETE", url: `/api/projeler/${pid}/adresler/${id}`, headers: basliklar() });
    expect((await sil(link.id)).statusCode).toBe(200);
    expect(sirket.adresler.listele(pid).some((a) => a.id === link.id)).toBe(false);
    expect((await sil(link.id)).statusCode).toBe(404);
  });

  it("CEO'dan iste: CEO'ya #yonetim'den kurul mesajı gider, listedeki linkler de yazılır", async () => {
    const y = await app.inject({ method: "POST", url: `/api/projeler/${pid}/adresler/iste`, headers: basliklar() });
    expect(y.statusCode, y.body).toBe(200);
    const { mesaj } = y.json() as { mesaj: Mesaj };
    expect(mesaj).toMatchObject({ kanal: "yonetim", gonderenId: KURUL });
    expect(mesaj.metin).toContain("Linkler alanını güncelle");
    expect(mesaj.metin).toContain(`API (http://127.0.0.1:${port}/)`);
    expect((await app.inject({ method: "POST", url: "/api/projeler/yok/adresler/iste", headers: basliklar() })).statusCode).toBe(404);
  });

  it("GET /api/projeler/:pid/adresler listeyi verir; bilinmeyen proje 404", async () => {
    const y = await app.inject({ url: `/api/projeler/${pid}/adresler`, headers: basliklar() });
    expect(y.statusCode, y.body).toBe(200);
    const liste = y.json() as ProjeAdresi[];
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ ad: "API", adres: `http://127.0.0.1:${port}/`, bildirenAd: "Deniz", kaynak: "arac", kalici: false, durum: "acik", yoklanir: true });
    const yok = await app.inject({ url: "/api/projeler/yok/adresler", headers: basliklar() });
    expect(yok.statusCode).toBe(404);
  });

  it("talimat: çalışan başlattığı sunucunun adresini bildirir, kapatınca kaldırır; CEO Linkler alanını yönetir (iki dilde)", async () => {
    const talimat = (a: Ajan) => (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(a, "/tmp");
    expect(talimat(ajan)).toContain("mcp__arnorg__adres_bildir");
    expect(talimat(ajan)).toContain("adres_kaldir");
    expect(talimat(ajan)).toContain("kalici: true");
    // CEO projenin linklerini verir ve güncel tutar (0.0.9)
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    expect(talimat(ceo)).toContain("Linkler alanını sen yönetirsin");
    expect(talimat(ceo)).toContain("mcp__arnorg__adres_bildir");
    expect(talimat(ceo)).toContain("adres_kaldir");
    const { dilKaynagi } = await import("./dil.js");
    dilKaynagi(() => "en");
    try {
      expect(talimat(ajan)).toContain("register its address with mcp__arnorg__adres_bildir");
      expect(talimat(ceo)).toContain("You run the Links in the board's Browser");
    } finally {
      dilKaynagi(() => sirket.yapilandirma.ayarlar.dil);
    }
  });
});
