import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KodZekasiModeli, SunucuOlayi } from "@arnorg/ortak";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SahteGomucu } from "./gomucu.js";
import { KodZekasi } from "./yonetici.js";

const PID = "proje1";

function yaz(kok: string, yol: string, icerik: string | Buffer): void {
  const tam = path.join(kok, ...yol.split("/"));
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, icerik);
}

function repoKur(): string {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), "kz-repo-"));
  yaz(kok, "package.json", JSON.stringify({ name: "ornek", private: true }));
  yaz(
    kok,
    "src/hafiza.ts",
    [
      "// Hafıza kayıtları",
      "export function hafizaKaydet(baslik: string, metin: string) {",
      "  // Hafıza kaydını veritabanına yazar",
      "  return veritabani.ekle({ baslik, metin });",
      "}",
      "",
      "export function hafizaAra(sorgu: string) {",
      "  return veritabani.ara(sorgu);",
      "}",
      "",
    ].join("\n"),
  );
  yaz(
    kok,
    "src/sunucu.ts",
    [
      'import { hafizaAra, hafizaKaydet } from "./hafiza.js";',
      "",
      "export function uclariKur(app: Uygulama) {",
      '  app.get("/hafiza", (i) => hafizaAra(i.sorgu));',
      '  app.post("/hafiza", (i) => hafizaKaydet(i.baslik, i.metin));',
      "}",
      "",
    ].join("\n"),
  );
  yaz(kok, "src/odeme/fatura.py", "class FaturaHizmeti:\n    def toplam_hesapla(self, kalemler):\n        return sum(k.tutar for k in kalemler)\n");
  yaz(kok, "docs/MIMARI.md", "# Mimari\n\nWebhook olayları kuyruğa yazılır ve sırayla işlenir.\n");
  yaz(kok, ".env", "GIZLI_ANAHTAR=1\n");
  yaz(kok, "credentials.json", '{"anahtar": "x"}\n');
  yaz(kok, ".gitignore", "uretilen/\n");
  yaz(kok, "uretilen/cikti.ts", "export const URETILEN = 1;\n");
  yaz(kok, "veri.txt", Buffer.from([0x61, 0x00, 0x62, 0x0a]));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: kok, stdio: "ignore" });
  g("init", "-q");
  g("add", "-A");
  g("-c", "user.name=Deneme", "-c", "user.email=deneme@ornek.com", "commit", "-qm", "ilk");
  return kok;
}

describe("kod zekâsı yöneticisi", () => {
  let veri: string;
  let repo: string;
  let alanlar: Record<string, string>;
  let olaylar: SunucuOlayi[];
  let model: KodZekasiModeli;
  let gomucuA: SahteGomucu;
  let gomucuB: SahteGomucu;
  let kz: KodZekasi;
  const temizlenecek: string[] = [];

  const yeniYonetici = () =>
    new KodZekasi({
      veriDizini: veri,
      yayinla: (o) => olaylar.push(o),
      alanYolu: (pid, alan) => {
        if (pid !== PID || !alanlar[alan]) throw new Error("Çalışma alanı bulunamadı.");
        return alanlar[alan]!;
      },
      projeler: () => [{ id: PID, yol: repo }],
      ayarlar: () => ({ kodZekasiModeli: model, kodZekasiOtomatik: false }),
      gomucuOlustur: (s) => (s === "kapali" ? null : s === "kaliteli" ? gomucuA : gomucuB),
      artimliGecikmeMs: 10,
    });

  beforeEach(() => {
    veri = fs.mkdtempSync(path.join(os.tmpdir(), "kz-veri-"));
    repo = repoKur();
    alanlar = { ana: repo };
    olaylar = [];
    model = "kaliteli";
    gomucuA = new SahteGomucu();
    gomucuB = new (class extends SahteGomucu {
      override readonly anahtar = "sahte-b";
    })();
    kz = yeniYonetici();
    temizlenecek.push(veri, repo);
  });

  afterEach(async () => {
    await kz.kapat();
    for (const d of temizlenecek.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("tarar; gizli, yok sayılan ve ikili dosyaları atlar; sembol ve parçaları sayar", async () => {
    const d = await kz.dizinle(PID, "ana");
    expect(d.durum).toBe("hazir");
    expect(d.dosya).toBe(5);
    expect(d.parca).toBeGreaterThanOrEqual(5);
    expect(d.gomulen).toBe(d.toplamParca);
    expect(d.model).toBe("sahte-64");
    const harita = await kz.harita(PID, "ana");
    const yollar: string[] = [];
    const topla = (n: typeof harita) => (n.tur === "dosya" ? yollar.push(n.yol) : n.cocuklar?.forEach(topla));
    topla(harita);
    expect(yollar.sort()).toEqual(["docs/MIMARI.md", "package.json", "src/hafiza.ts", "src/odeme/fatura.py", "src/sunucu.ts"]);
    const adlar = (await kz.semboller(PID, "ana", "", { sinir: 100 })).map((s) => s.ad);
    expect(adlar).toEqual(expect.arrayContaining(["hafizaKaydet", "hafizaAra", "uclariKur", "FaturaHizmeti", "toplam_hesapla", "Mimari"]));
    // Son durum olayı (saniyede en çok iki kez; son durum geciktirilerek de olsa gelir)
    await new Promise((r) => setTimeout(r, 600));
    const son = olaylar.filter((o) => o.tur === "kod.dizin").pop();
    expect(son?.tur === "kod.dizin" && son.durum.durum).toBe("hazir");
  });

  it("hibrit arama: anlamsal, anahtar sözcük ve sembol adı; yol süzgeci; kesit", async () => {
    await kz.dizinle(PID, "ana");
    const y = await kz.ara(PID, "ana", "hafıza kaydı veritabanına nasıl yazılır");
    expect(y.yalnizSozcuk).toBe(false);
    expect(y.sonuclar[0]!.yol).toBe("src/hafiza.ts");
    expect(y.sonuclar[0]!.kesit).toContain("hafizaKaydet");
    expect(y.sonuclar[0]!.puan).toBeGreaterThan(0);
    expect(y.sonuclar[0]!.puan).toBeLessThanOrEqual(1);

    const s = await kz.ara(PID, "ana", "hafizaAra");
    expect(s.sonuclar[0]!.sembol).toBe("hafizaAra");
    expect(s.sonuclar[0]!.eslesme).toBe("karma");

    const odeme = await kz.ara(PID, "ana", "toplam hesapla", { yol: "src/odeme" });
    expect(odeme.sonuclar.length).toBeGreaterThan(0);
    expect(odeme.sonuclar.every((r) => r.yol.startsWith("src/odeme/"))).toBe(true);
    const glob = await kz.ara(PID, "ana", "hafiza", { yol: "**/*.md" });
    expect(glob.sonuclar.every((r) => r.yol.endsWith(".md"))).toBe(true);

    const webhook = await kz.ara(PID, "ana", "webhook kuyruğu");
    expect(webhook.sonuclar[0]!.yol).toBe("docs/MIMARI.md");
  });

  it("bağımlılıklar ve modül grafiği", async () => {
    await kz.dizinle(PID, "ana");
    const b = await kz.bagimliliklar(PID, "ana", "src/sunucu.ts");
    expect(b.iceAktardiklari).toEqual([{ yol: "src/hafiza.ts", kaynak: "./hafiza.js", satir: 1, adlar: ["hafizaAra", "hafizaKaydet"] }]);
    const h = await kz.bagimliliklar(PID, "ana", path.join(repo, "src", "hafiza.ts"));
    expect(h.iceAktaranlar.map((x) => x.yol)).toEqual(["src/sunucu.ts"]);
    await expect(kz.bagimliliklar(PID, "ana", "yok.ts")).rejects.toThrow(/dizinde yok/);
    const g = await kz.grafik(PID, "ana", "dosya");
    expect(g.kenarlar).toEqual([{ kaynak: "src/sunucu.ts", hedef: "src/hafiza.ts", agirlik: 1 }]);
    const metin = await kz.haritaMetni(PID, "ana", { butce: 2000 });
    expect(metin).toContain("hafiza.ts");
    expect(metin).toContain("hafizaKaydet()");
  });

  it("artımlı güncelleme: değişen dosya yeniden okunur, silinen ve yok sayılan çıkar", async () => {
    await kz.dizinle(PID, "ana");
    yaz(repo, "src/hafiza.ts", `${fs.readFileSync(path.join(repo, "src/hafiza.ts"), "utf8")}export function yedekAl() {\n  return veritabani.yedekle();\n}\n`);
    kz.olay({ tur: "dosya.degisti", projeId: PID, alan: "ana", yol: "src/hafiza.ts", ajanId: null });
    fs.rmSync(path.join(repo, "src/odeme"), { recursive: true });
    kz.olay({ tur: "dosya.degisti", projeId: PID, alan: "ana", yol: "src/odeme", ajanId: null });
    yaz(repo, "uretilen/yeni.ts", "export function uretilenFonksiyon() {}\n");
    kz.olay({ tur: "dosya.degisti", projeId: PID, alan: "ana", yol: "uretilen/yeni.ts", ajanId: null });
    yaz(repo, "src/yeni.ts", 'import { hafizaAra } from "./hafiza";\nexport const yeniSabit = hafizaAra("x");\n');
    kz.olay({ tur: "dosya.degisti", projeId: PID, alan: "ana", yol: "src/yeni.ts", ajanId: null });
    await kz.bosta(PID);
    expect((await kz.semboller(PID, "ana", "yedekAl")).map((s) => s.yol)).toEqual(["src/hafiza.ts"]);
    expect(await kz.semboller(PID, "ana", "FaturaHizmeti")).toEqual([]);
    expect(await kz.semboller(PID, "ana", "uretilenFonksiyon")).toEqual([]);
    const b = await kz.bagimliliklar(PID, "ana", "src/hafiza.ts");
    expect(b.iceAktaranlar.map((x) => x.yol).sort()).toEqual(["src/sunucu.ts", "src/yeni.ts"]);
    expect(kz.durum(PID, "ana").dosya).toBe(5);
    const y = await kz.ara(PID, "ana", "yedekAl");
    expect(y.sonuclar[0]!.kesit).toContain("yedekle");
  });

  it("aynı içerik başka alanda (ajan worktree'si) yeniden gömülmez", async () => {
    await kz.dizinle(PID, "ana");
    const ilk = gomucuA.gomulenMetin;
    const kopya = fs.mkdtempSync(path.join(os.tmpdir(), "kz-kopya-"));
    temizlenecek.push(kopya);
    fs.cpSync(repo, kopya, { recursive: true });
    alanlar.ajan1 = kopya;
    yaz(kopya, "src/odeme/fatura.py", "class FaturaHizmeti:\n    def indirim_uygula(self, oran):\n        return 1 - oran\n");
    // İlk sorgu taramayı başlatır ve bekler
    const y = await kz.ara(PID, "ajan1", "indirim oranı uygula");
    expect(y.sonuclar[0]!.yol).toBe("src/odeme/fatura.py");
    await kz.bosta(PID);
    expect(kz.durum(PID, "ajan1").gomulen).toBe(kz.durum(PID, "ajan1").toplamParca);
    // Yalnız değişen parça gömülür (+1 sorgu vektörü); kalanlar ana alandan paylaşılır
    expect(gomucuA.gomulenMetin - ilk).toBe(2);
    expect(kz.durumlar(PID).map((d) => d.alan)).toEqual(["ana", "ajan1"]);
    // Ajan silinince alanı dizinden çıkar
    kz.olay({ tur: "ajan.silindi", projeId: PID, ajanId: "ajan1" });
    delete alanlar.ajan1;
    expect(kz.durumlar(PID).map((d) => d.alan)).toEqual(["ana"]);
  });

  it("benzer kod: tekrar eden işlev başka dosyada bulunur", async () => {
    const govde = "  const toplam = kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0);\n  const vergi = toplam * 0.2;\n  return { toplam, vergi, genel: toplam + vergi };\n";
    yaz(repo, "src/sepet.ts", `export function sepetTutari(kalemler: Kalem[]) {\n${govde}}\n`);
    yaz(repo, "src/siparis.ts", `export function siparisTutari(kalemler: Kalem[]) {\n${govde}}\n`);
    await kz.dizinle(PID, "ana");
    const b = await kz.benzer(PID, "ana", "src/sepet.ts", 2, 3);
    expect(b.sonuclar[0]!.yol).toBe("src/siparis.ts");
    expect(b.sonuclar.every((r) => r.yol !== "src/sepet.ts")).toBe(true);
    await expect(kz.benzer(PID, "ana", "src/yok.ts", 1)).rejects.toThrow(/dizinde yok/);
  });

  it("model kapalıyken yalnız anahtar sözcükle arar; model değişince yeni modelle gömer", async () => {
    model = "kapali";
    const d = await kz.dizinle(PID, "ana");
    expect(d.model).toBeNull();
    expect(d.gomulen).toBe(0);
    const y = await kz.ara(PID, "ana", "fatura toplam");
    expect(y.yalnizSozcuk).toBe(true);
    expect(y.sonuclar[0]!.yol).toBe("src/odeme/fatura.py");

    model = "hizli";
    kz.ayarlarDegisti();
    await kz.bosta(PID);
    const yeni = kz.durum(PID, "ana");
    expect(yeni.model).toBe("sahte-b");
    expect(yeni.gomulen).toBe(yeni.toplamParca);
    expect((await kz.ara(PID, "ana", "fatura toplam")).yalnizSozcuk).toBe(false);
  });

  it("sıfırdan dizinleme aynı sonucu verir; proje kaldırılınca dizin dosyası silinir", async () => {
    const d1 = await kz.dizinle(PID, "ana");
    const d2 = await kz.dizinle(PID, "ana", { sifirdan: true });
    expect({ dosya: d2.dosya, sembol: d2.sembol, parca: d2.parca }).toEqual({ dosya: d1.dosya, sembol: d1.sembol, parca: d1.parca });
    // Yeniden açılan yönetici diskteki dizini kullanır
    await kz.kapat();
    kz = yeniYonetici();
    expect(kz.durum(PID, "ana")).toMatchObject({ durum: "hazir", dosya: d1.dosya });
    expect((await kz.ara(PID, "ana", "hafizaKaydet", { bekleMs: 0 })).sonuclar.length).toBeGreaterThan(0);
    await kz.bosta(PID);
    const dosya = path.join(veri, "kod-dizini", `${PID}.db`);
    expect(fs.existsSync(dosya)).toBe(true);
    kz.projeKaldir(PID);
    expect(fs.existsSync(dosya)).toBe(false);
  });

  it("durum olayları alan başına saniyede en çok iki kez yayınlanır", async () => {
    for (let i = 0; i < 260; i++) yaz(repo, `src/cok/dosya${i}.ts`, `export function islev${i}(a: number) {\n  return a * ${i};\n}\n`);
    await kz.dizinle(PID, "ana");
    await new Promise((r) => setTimeout(r, 600));
    const zamanlar: number[] = [];
    const baslangic = Date.now();
    olaylar = [];
    const kz2 = new KodZekasi({
      veriDizini: fs.mkdtempSync(path.join(os.tmpdir(), "kz-veri2-")),
      yayinla: (o) => {
        if (o.tur === "kod.dizin") zamanlar.push(Date.now() - baslangic);
        olaylar.push(o);
      },
      alanYolu: () => repo,
      projeler: () => [],
      ayarlar: () => ({ kodZekasiModeli: "kaliteli", kodZekasiOtomatik: false }),
      gomucuOlustur: () => new SahteGomucu(),
    });
    await kz2.dizinle(PID, "ana");
    await new Promise((r) => setTimeout(r, 600));
    await kz2.kapat();
    expect(zamanlar.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < zamanlar.length; i++) expect(zamanlar[i]! - zamanlar[i - 1]!).toBeGreaterThanOrEqual(450);
    const son = olaylar[olaylar.length - 1];
    expect(son?.tur === "kod.dizin" && son.durum.durum).toBe("hazir");
  });
});
