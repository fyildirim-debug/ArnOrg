// Proje adresleri (0.0.8): kabuk çıktısında sunucu adresi, kayıt, yoklama ve düşme, araçlar, uç ve talimat
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { Ajan, ProjeAdresi, SunucuOlayi } from "@arnorg/ortak";
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
  const degerler = new Map<string, string>();
  const depo = {
    deger: (k: string) => degerler.get(k) ?? null,
    degerYaz: (k: string, v: string) => void degerler.set(k, v),
    projeler: () => [{ id: "p1" }, { id: "p2" }] as ReturnType<Depo["projeler"]>,
    ajan: (id: string) => (id === AJAN.id ? AJAN : null),
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
    expect(a).toMatchObject({ projeId: "p1", adres: "http://localhost:5173/", ad: "Geliştirme sunucusu", bildirenId: "a1", bildirenAd: "Ece", kaynak: "arac", durum: "acik", yoklanir: true });
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
    const uzak = await k.bildir("p2", { adres: "https://onizleme.ornek.com/", ad: "Önizleme", bildiren: AJAN, kaynak: "arac" });
    expect(uzak).toMatchObject({ yoklanir: false, durum: "bilinmiyor", denetim: null });
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
    await expect(dolu.bildir("p3", { adres: "http://localhost:7000", ad: "Fazla", bildiren: AJAN, kaynak: "arac" })).rejects.toThrow(/en çok 20/);
    acikPortlar.delete(6003);
    await dolu.yokla("p3");
    await dolu.bildir("p3", { adres: "http://localhost:7000", ad: "Yeni", bildiren: AJAN, kaynak: "arac" });
    const adlar = dolu.listele("p3").map((x) => x.ad);
    expect(adlar).toHaveLength(ADRES_SINIRI);
    expect(adlar).not.toContain("S3");
    expect(adlar.at(-1)).toBe("Yeni");
    dolu.durdur();
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

  it("GET /api/projeler/:pid/adresler listeyi verir; bilinmeyen proje 404", async () => {
    const y = await app.inject({ url: `/api/projeler/${pid}/adresler`, headers: basliklar() });
    expect(y.statusCode, y.body).toBe(200);
    const liste = y.json() as ProjeAdresi[];
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ ad: "API", adres: `http://127.0.0.1:${port}/`, bildirenAd: "Deniz", kaynak: "arac", durum: "acik", yoklanir: true });
    const yok = await app.inject({ url: "/api/projeler/yok/adresler", headers: basliklar() });
    expect(yok.statusCode).toBe(404);
  });

  it("talimat sunucuyu başlatanın adresini bildirmesini ve kapatınca kaldırmasını söyler (iki dilde)", async () => {
    const talimat = (a: Ajan) => (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(a, "/tmp");
    expect(talimat(ajan)).toContain("mcp__arnorg__adres_bildir");
    expect(talimat(ajan)).toContain("adres_kaldir");
    // CEO sunucu başlatmaz: çalışan adresleri teslimin test adımlarında kullanır
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    expect(talimat(ceo)).toContain("mcp__arnorg__adresler");
    expect(talimat(ceo)).not.toContain("mcp__arnorg__adres_bildir");
    const { dilKaynagi } = await import("./dil.js");
    dilKaynagi(() => "en");
    try {
      expect(talimat(ajan)).toContain("register its address with mcp__arnorg__adres_bildir");
    } finally {
      dilKaynagi(() => sirket.yapilandirma.ayarlar.dil);
    }
  });
});
