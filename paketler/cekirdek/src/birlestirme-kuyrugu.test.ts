// Kalite kapısı ve birleştirme kuyruğu: gerçek geçici git depolarıyla (Claude Code oturumu açılmaz).
// Komutlar Windows'ta da çalışsın diye node betikleri; yollar argüman olarak verilir.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BIRLESTIRME_SON_DURUMLARI, type BirlestirmeDurumu, type BirlestirmeKalitesi, type Onay, type SunucuOlayi } from "@arnorg/ortak";
import { kaliteOku } from "./birlestirme-kuyrugu.js";
import { Depo } from "./depo.js";
import * as gitIslemleri from "./git.js";
import { CiktiKuyrugu, kaliteOnerisi, kaliteYolu, komutCalistir, sonKisim } from "./kalite-kapisi.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";
import { bekle } from "./yardimci.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let projeId: string;
let repo: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];

const git = (dizin: string, ...arg: string[]) => gitIslemleri.git(dizin, arg);
const oku = (dosya: string) => fs.readFileSync(path.join(repo, dosya), "utf8").replace(/\r\n/g, "\n");

/** Ana dalda duran betikler: hazırlık node_modules'e (yoksayılan) yazar; kontrol deger.txt'yi denetler */
const BETIKLER: Record<string, string> = {
  ".gitignore": "node_modules/\n",
  "deger.txt": "ilk\n",
  "satir.txt": "baslangic\n",
  "hazirlik.cjs": 'const fs = require("node:fs");\nfs.mkdirSync("node_modules", { recursive: true });\nfs.appendFileSync("node_modules/.hazirlik", "x\\n");\nconsole.log("hazirlik tamam");\n',
  "kontrol.cjs": [
    'const fs = require("node:fs");',
    'if (!fs.existsSync("node_modules/.hazirlik")) { console.log("hazirlik yok"); process.exit(2); }',
    'const deger = fs.readFileSync("deger.txt", "utf8");',
    'if (deger.includes("BOZUK")) { console.log("deger.txt bozuk: " + deger.trim()); process.exit(1); }',
    'console.log("kontrol tamam");',
    "",
  ].join("\n"),
  // Kayıt dosyasına başlangıç ve bitiş yazar: işlerin üst üste binmediği görülsün
  "sira.cjs": 'const fs = require("node:fs");\nconst log = process.argv[2];\nfs.appendFileSync(log, "basla\\n");\nsetTimeout(() => { fs.appendFileSync(log, "bitir\\n"); console.log("sira tamam"); }, 700);\n',
  "yavas.cjs": 'setTimeout(() => console.log("yavas tamam"), 1000);\n',
  // Kendi çocuğunu açar ve hiç bitmez; çocuk 2,5 sn sonra dosya yazar (ağaç öldürülürse yazamaz)
  "uzun.cjs": [
    'const { spawn } = require("node:child_process");',
    "const hedef = process.argv[2];",
    'spawn(process.execPath, ["-e", `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(hedef)}, "x"), 2500)`], { stdio: "ignore" });',
    'console.log("uzun basladi");',
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"),
};

beforeAll(async () => {
  gecici = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-kalite-")));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  // Birleştirmelere kurul karar verir (tam otonom kipte CEO: karar-yetkisi.test.ts)
  const p = await sirket.projeOlustur({ ad: "Kalite", yol: path.join(gecici, "repo"), olustur: true, kararVeren: "kurul" });
  projeId = p.id;
  repo = p.yol;
  for (const [ad, icerik] of Object.entries(BETIKLER)) fs.writeFileSync(path.join(repo, ad), icerik);
  await git(repo, "add", "-A");
  await git(repo, "commit", "-q", "-m", "Betikler");
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

/** Ajanın dalını kendi çalışma alanında açar, dosyaları yazar ve commit'ler (birlestirme_iste öncesi hâl) */
async function dalHazirla(ad: string, dosyalar: Record<string, string>): Promise<{ ajanId: string; dal: string }> {
  const ajan = sirket.iseAl(projeId, { ad, rol: "backend" });
  const slug = ad.toLowerCase();
  const dal = `arnorg/${slug}`;
  const alan = path.join(gecici, "alanlar", slug);
  await gitIslemleri.worktreeAc(repo, alan, dal, "main");
  for (const [y, icerik] of Object.entries(dosyalar)) fs.writeFileSync(path.join(alan, y), icerik);
  await git(alan, "add", "-A");
  await git(alan, "commit", "-q", "-m", `${ad} işi`);
  depo.ajanGuncelle(ajan.id, { calismaAlani: alan, dal });
  return { ajanId: ajan.id, dal };
}

/** birlestirme_iste'nin açtığı onayın aynısı */
function birlestirmeIste(ajanId: string, dal: string): Onay {
  return sirket.teklifAc(depo.ajan(ajanId)!, "birlestirme", `${dal} → main`, `${dal} hazır.`, { ajanId, dal, ozet: `${dal} hazır.`, isteyenId: ajanId });
}

/** İş sonuçlanıp kuyruktan çıkana (mesajlar gidene) kadar bekler */
async function sonucuBekle(onayId: string, sureMs = 40_000): Promise<BirlestirmeKalitesi> {
  const sinir = Date.now() + sureMs;
  for (;;) {
    const o = depo.onay(onayId)!;
    const k = kaliteOku(o);
    const dal = (o.veri as { dal: string }).dal;
    if (k && BIRLESTIRME_SON_DURUMLARI.includes(k.durum) && !sirket.birlestirmeKuyrugu.suruyorMu(projeId, dal)) return k;
    if (Date.now() > sinir) throw new Error(`Kalite kapısı bitmedi: ${JSON.stringify(k)}`);
    await bekle(40);
  }
}

/** Onayın olaylarla yayınlanan kalite durumları (art arda aynılar tek) */
function durumlar(onayId: string): BirlestirmeDurumu[] {
  const liste: BirlestirmeDurumu[] = [];
  for (const o of gelenler) {
    if (o.tur !== "onay.sonuc" || o.onay.id !== onayId) continue;
    const d = kaliteOku(o.onay)?.durum;
    if (d && liste.at(-1) !== d) liste.push(d);
  }
  return liste;
}

async function ayarla(alanlar: { testKomutu?: string | null; hazirlikKomutu?: string | null; testZamanAsimiDk?: number }): Promise<void> {
  depo.projeGuncelle(projeId, alanlar);
}

describe("kalite kapısı", () => {
  it("test geçerse dal ana repoda birleşir; görev tamamlanır, ekip duyulur", async () => {
    await sirket.projeGuncelle(projeId, { testKomutu: "node kontrol.cjs", hazirlikKomutu: "node hazirlik.cjs" });
    expect(depo.mesajlar(projeId, "genel").at(-1)?.metin).toMatch(/Kalite kapısı: .*node kontrol\.cjs \(önce node hazirlik\.cjs\)/);
    const { ajanId, dal } = await dalHazirla("Ece", { "deger.txt": "iyi\n" });
    const g = sirket.gorevOlustur(projeId, { baslik: "Değeri düzelt", atananId: ajanId });
    await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" });
    await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
    const o = birlestirmeIste(ajanId, dal);
    const karar = await sirket.onayKarari(o.id, "onayla");
    expect(karar.durum).toBe("onaylandi");
    expect(kaliteOku(karar)?.durum).toMatch(/kuyrukta|hazirlik/);
    const k = await sonucuBekle(o.id);
    expect(k.durum).toBe("birlesti");
    expect(k).toMatchObject({ testYok: false, testsiz: false, komut: "node kontrol.cjs", deneme: 1 });
    expect(k.cikti).toContain("$ node hazirlik.cjs");
    expect(k.cikti).toContain("kontrol tamam");
    expect(k.sureMs).toBeGreaterThan(0);
    expect(k.dalCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(durumlar(o.id)).toEqual(["kuyrukta", "hazirlik", "test", "birlesti"]);
    expect(oku("deger.txt")).toBe("iyi\n");
    expect(await git(repo, "log", "-1", "--format=%s")).toContain(`ArnOrg: ${dal} birleştirildi`);
    expect(depo.gorev(g.id)?.durum).toBe("tamam");
    expect(depo.mesajlar(projeId, "genel").some((m) => m.metin.startsWith(`${dal} main dalına birleştirildi. Testler geçti (node kontrol.cjs`))).toBe(true);
    // Kalite alanı hedefe ayrık duran ayrı bir worktree
    const alan = kaliteYolu(path.join(gecici, "veri", "kalite"), { id: projeId });
    expect((await gitIslemleri.worktreeler(repo)).some((w) => gitIslemleri.ayniYol(w.yol, alan) && w.dal === null)).toBe(true);
  }, 60_000);

  it("test geçmezse birleşmez; dal sahibine çıktının sonuyla düzelt mesajı gider", async () => {
    const uyandir = vi.spyOn(sirket, "uyandir");
    const { ajanId, dal } = await dalHazirla("Can", { "deger.txt": "BOZUK\n" });
    const o = birlestirmeIste(ajanId, dal);
    await sirket.onayKarari(o.id, "onayla");
    const k = await sonucuBekle(o.id);
    expect(k.durum).toBe("test_basarisiz");
    expect(k.mesaj).toContain("çıkış kodu 1");
    expect(k.cikti).toContain("deger.txt bozuk: BOZUK");
    expect(oku("deger.txt")).toBe("iyi\n");
    const mesaj = uyandir.mock.calls.find(([alici]) => alici === ajanId)?.[1] ?? "";
    expect(mesaj).toContain(`${dal} dalı kalite kapısından geçmedi`);
    expect(mesaj).toContain("deger.txt bozuk: BOZUK");
    expect(mesaj).toContain("yeniden birlestirme_iste");
    expect(gelenler.some((x) => x.tur === "bildirim" && x.seviye === "uyari" && x.metin.startsWith(`${dal}: testler geçmedi`))).toBe(true);
    // Yoksayılan dosyalar (node_modules) iki çalıştırma arasında korunur: hazırlık hızlı kalsın
    const alan = kaliteYolu(path.join(gecici, "veri", "kalite"), { id: projeId });
    expect(fs.readFileSync(path.join(alan, "node_modules", ".hazirlik"), "utf8").trim().split(/\r?\n/)).toHaveLength(2);
    uyandir.mockRestore();
  }, 60_000);

  it("çakışmada birleştirmez; bugünkü çakışma mesajı sahibine gider", async () => {
    const uyandir = vi.spyOn(sirket, "uyandir");
    const { ajanId, dal } = await dalHazirla("Deniz", { "satir.txt": "dal\n" });
    fs.writeFileSync(path.join(repo, "satir.txt"), "ana\n");
    await git(repo, "commit", "-q", "-am", "Ana dalda satır");
    const o = birlestirmeIste(ajanId, dal);
    await sirket.onayKarari(o.id, "onayla");
    const k = await sonucuBekle(o.id);
    expect(k.durum).toBe("cakisma");
    expect(k.mesaj).toContain("satir.txt");
    expect(oku("satir.txt")).toBe("ana\n");
    const mesaj = uyandir.mock.calls.find(([alici]) => alici === ajanId)?.[1] ?? "";
    expect(mesaj).toContain(`${dal} dalı main ile çakıştı ve birleştirilemedi`);
    uyandir.mockRestore();
  }, 60_000);

  it("zaman aşımında süreç ağacını öldürür ve birleştirmez", async () => {
    const torun = path.join(gecici, "torun.txt");
    await ayarla({ testKomutu: `node uzun.cjs "${torun}"`, hazirlikKomutu: null, testZamanAsimiDk: 0.02 });
    const { ajanId, dal } = await dalHazirla("Efe", { "efe.txt": "efe\n" });
    const o = birlestirmeIste(ajanId, dal);
    await sirket.onayKarari(o.id, "onayla");
    const k = await sonucuBekle(o.id);
    expect(k.durum).toBe("zaman_asimi");
    expect(k.mesaj).toContain("bitmedi");
    expect(k.cikti).toContain("uzun basladi");
    expect(fs.existsSync(path.join(repo, "efe.txt"))).toBe(false);
    // Torun süreç de öldürüldü: dosyasını yazamaz
    await bekle(3200);
    expect(fs.existsSync(torun)).toBe(false);
  }, 60_000);

  it("aynı anda gelen iki onay sırayla işlenir; ikincisi 2. sırada bekler", async () => {
    const kayit = path.join(gecici, "sira.log");
    await ayarla({ testKomutu: `node sira.cjs "${kayit}"`, testZamanAsimiDk: 1 });
    const a = await dalHazirla("Eda", { "a.txt": "a\n" });
    const b = await dalHazirla("Fatih", { "b.txt": "b\n" });
    const o1 = birlestirmeIste(a.ajanId, a.dal);
    const o2 = birlestirmeIste(b.ajanId, b.dal);
    await Promise.all([sirket.onayKarari(o1.id, "onayla"), sirket.onayKarari(o2.id, "onayla")]);
    const ilk = gelenler.find((x) => x.tur === "onay.sonuc" && x.onay.id === o2.id && kaliteOku(x.onay)?.sira === 2);
    expect(ilk).toBeTruthy();
    expect(kaliteOku(depo.onay(o2.id)!)?.durum).toBe("kuyrukta");
    expect((await sonucuBekle(o1.id)).durum).toBe("birlesti");
    expect((await sonucuBekle(o2.id)).durum).toBe("birlesti");
    expect(fs.readFileSync(kayit, "utf8").trim().split(/\r?\n/)).toEqual(["basla", "bitir", "basla", "bitir"]);
    // İkinci işin hazırlığı birincisi birleştikten sonra başladı
    const sira = gelenler.flatMap((x) => (x.tur === "onay.sonuc" && (x.onay.id === o1.id || x.onay.id === o2.id) ? [`${x.onay.id === o1.id ? 1 : 2}:${kaliteOku(x.onay)?.durum}`] : []));
    expect(sira.indexOf("2:hazirlik")).toBeGreaterThan(sira.indexOf("1:birlesti"));
    expect(oku("a.txt")).toBe("a\n");
    expect(oku("b.txt")).toBe("b\n");
  }, 60_000);

  it("test sürerken hedef dal ilerlerse iş yeniden test edilir", async () => {
    await ayarla({ testKomutu: "node yavas.cjs", testZamanAsimiDk: 1 });
    const a = await dalHazirla("Gul", { "gul.txt": "gul\n" });
    let ilerlet: Promise<unknown> | null = null;
    const birak = olaylar.dinle((x) => {
      if (ilerlet || x.tur !== "onay.sonuc" || kaliteOku(x.onay)?.durum !== "test") return;
      fs.writeFileSync(path.join(repo, "ek.txt"), "ek\n");
      ilerlet = git(repo, "add", "ek.txt").then(() => git(repo, "commit", "-q", "-m", "Ana dal ilerledi"));
    });
    const o1 = birlestirmeIste(a.ajanId, a.dal);
    await sirket.onayKarari(o1.id, "onayla");
    const k1 = await sonucuBekle(o1.id);
    birak();
    expect(k1.durum).toBe("birlesti");
    expect(k1.deneme).toBe(2);
    expect(k1.cikti).toContain("iş yeniden test ediliyor");
    expect(oku("gul.txt")).toBe("gul\n");
  }, 60_000);

  it("yalnız ArnOrg kayıtları (.arnorg) ilerlediyse yeniden test edilmez", async () => {
    await ayarla({ testKomutu: "node yavas.cjs", testZamanAsimiDk: 1 });
    const b = await dalHazirla("Hale", { "hale.txt": "hale\n" });
    let notYazildi = false;
    const birak2 = olaylar.dinle((x) => {
      if (notYazildi || x.tur !== "onay.sonuc" || kaliteOku(x.onay)?.durum !== "test") return;
      notYazildi = true;
      fs.writeFileSync(path.join(repo, ".arnorg", "notlar", "kalite-notu.md"), "# Not\n");
    });
    const o2 = birlestirmeIste(b.ajanId, b.dal);
    await sirket.onayKarari(o2.id, "onayla");
    const k2 = await sonucuBekle(o2.id);
    birak2();
    expect(k2.durum).toBe("birlesti");
    expect(k2.deneme).toBe(1);
    expect(await git(repo, "log", "-1", "--format=%s", "--", ".arnorg/notlar/kalite-notu.md")).toContain("ArnOrg: ekip, hafıza ve not kayıtları");
  }, 60_000);

  it("açılışta yarım kalan işi kuyruğa geri alır ve bitirir", async () => {
    await ayarla({ testKomutu: 'node -e "process.exit(0)"', testZamanAsimiDk: 1 });
    const { ajanId, dal } = await dalHazirla("Ilgaz", { "ilgaz.txt": "ilgaz\n" });
    const o = birlestirmeIste(ajanId, dal);
    // Uygulama test sırasında kapanmış gibi: onay verilmiş, kalite kaydı "test" durumunda kalmış
    depo.onaySonuclandir(o.id, "onaylandi", null);
    const yarim: BirlestirmeKalitesi = {
      durum: "test", sira: null, dalCommit: null, hedefCommit: null, testYok: false, testsiz: false, komut: "node -e", deneme: 1,
      kuyrugaGiris: new Date().toISOString(), baslangic: new Date().toISOString(), adimBaslangic: new Date().toISOString(), bitis: null, sureMs: null, cikti: "", mesaj: null,
    };
    depo.onayVerisiYaz(o.id, { ...(o.veri as object), kalite: yarim });
    sirket.birlestirmeKuyrugu.baslat();
    const k = await sonucuBekle(o.id);
    expect(k.durum).toBe("birlesti");
    expect(oku("ilgaz.txt")).toBe("ilgaz\n");
  }, 60_000);

  it("test komutu yoksa yalnız birleşebilirlik denetlenir", async () => {
    await ayarla({ testKomutu: null, hazirlikKomutu: "node hazirlik.cjs" });
    const { ajanId, dal } = await dalHazirla("Kaan", { "kaan.txt": "kaan\n" });
    const o = birlestirmeIste(ajanId, dal);
    await sirket.onayKarari(o.id, "onayla");
    const k = await sonucuBekle(o.id);
    expect(k).toMatchObject({ durum: "birlesti", testYok: true, komut: null, cikti: "" });
    expect(durumlar(o.id)).not.toContain("test");
    expect(oku("kaan.txt")).toBe("kaan\n");
  }, 60_000);
});

describe("kalite kapısı API'si", () => {
  let app: FastifyInstance;
  const anahtar = "kalite-anahtari-0123456789abcdef";
  let h: Record<string, string>;
  beforeAll(async () => {
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
    h = { host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` };
  });
  afterAll(async () => {
    await app.close();
  });

  it("proje alanlarını doğrular ve kaydeder", async () => {
    const yanlis = await app.inject({ method: "PATCH", url: `/api/projeler/${projeId}`, headers: h, payload: { testZamanAsimiDk: 0 } });
    expect(yanlis.statusCode).toBe(400);
    const cokSatir = await app.inject({ method: "PATCH", url: `/api/projeler/${projeId}`, headers: h, payload: { testKomutu: "npm ci\nnpm test" } });
    expect(cokSatir.statusCode).toBe(400);
    expect(cokSatir.json()).toEqual({ hata: "Test komutu tek satır olmalı." });
    const tamam = await app.inject({ method: "PATCH", url: `/api/projeler/${projeId}`, headers: h, payload: { testKomutu: "  node kontrol.cjs  ", hazirlikKomutu: "", testZamanAsimiDk: 15 } });
    expect(tamam.json()).toMatchObject({ testKomutu: "node kontrol.cjs", hazirlikKomutu: null, testZamanAsimiDk: 15 });
    expect((await app.inject({ url: `/api/projeler/${projeId}/kalite-onerisi`, headers: h })).json()).toEqual({ testKomutu: null, hazirlikKomutu: null });
  });

  it("testsiz birleştirme yalnız kalite kapısında kalan işe izin verir; fark dalın değişikliklerini döner", async () => {
    await ayarla({ testKomutu: "node kontrol.cjs", hazirlikKomutu: "node hazirlik.cjs", testZamanAsimiDk: 1 });
    const { ajanId, dal } = await dalHazirla("Lale", { "deger.txt": "BOZUK lale\n", "lale.txt": "lale\n" });
    const o = birlestirmeIste(ajanId, dal);
    const bekleyenFark = (await app.inject({ url: `/api/onaylar/${o.id}/fark`, headers: h })).json() as { fark: string; dosyalar: { yol: string; degisiklik: string }[] };
    expect(bekleyenFark.dosyalar.map((d) => `${d.degisiklik} ${d.yol}`).sort()).toEqual(["A lale.txt", "M deger.txt"]);
    expect(bekleyenFark.fark).toContain("+BOZUK lale");
    // Henüz onaylanmamış iş testsiz birleştirilemez
    expect((await app.inject({ method: "POST", url: `/api/onaylar/${o.id}/birlestir`, headers: h, payload: { testsiz: true } })).statusCode).toBe(409);
    await sirket.onayKarari(o.id, "onayla");
    expect((await sonucuBekle(o.id)).durum).toBe("test_basarisiz");
    expect(oku("deger.txt")).not.toContain("BOZUK");
    const yanit = await app.inject({ method: "POST", url: `/api/onaylar/${o.id}/birlestir`, headers: h, payload: { testsiz: true } });
    expect(yanit.statusCode).toBe(200);
    const k = await sonucuBekle(o.id);
    expect(k).toMatchObject({ durum: "birlesti", testsiz: true });
    // Geçmeyen testin çıktısı bağlam olarak kalır
    expect(k.cikti).toContain("deger.txt bozuk");
    expect(oku("deger.txt")).toBe("BOZUK lale\n");
    expect(depo.mesajlar(projeId, "genel").some((m) => m.metin.startsWith(`${dal} main dalına birleştirildi. Kurul testsiz birleştirdi.`))).toBe(true);
    // Birleşmiş iş yeniden birleştirilemez; fark birleşmeden önceki hedefe göre alınır
    expect((await app.inject({ method: "POST", url: `/api/onaylar/${o.id}/birlestir`, headers: h, payload: { testsiz: true } })).statusCode).toBe(409);
    const sonraFark = (await app.inject({ url: `/api/onaylar/${o.id}/fark`, headers: h })).json() as { dosyalar: { yol: string }[] };
    expect(sonraFark.dosyalar.map((d) => d.yol).sort()).toEqual(["deger.txt", "lale.txt"]);
    expect((await app.inject({ method: "POST", url: `/api/onaylar/yok/birlestir`, headers: h, payload: { testsiz: true } })).statusCode).toBe(404);
  }, 60_000);
});

describe("kalite kapısı araçları", () => {
  it("çıktının son kısmı: renk kodu ayıklanır, satır başına dönüş üzerine yazar, sınır uygulanır", () => {
    const c = new CiktiKuyrugu();
    c.ekle("\x1b[32mgeçti\x1b[0m\r\n");
    c.ekle("indiriliyor 10%\rindiriliyor 100%\n");
    c.ekle("son\x1b[");
    c.ekle("0m\n");
    expect(c.metin()).toBe("geçti\nindiriliyor 100%\nson");
    const uzun = Array.from({ length: 500 }, (_, i) => `satır ${i}`).join("\n");
    const son = sonKisim(uzun);
    expect(son.split("\n")).toHaveLength(300);
    expect(son.endsWith("satır 499")).toBe(true);
    expect(Buffer.byteLength(sonKisim("x".repeat(200_000)), "utf8")).toBeLessThanOrEqual(64 * 1024);
  });

  it("komut çıkış koduna göre geçer ya da kalır", async () => {
    const c = new CiktiKuyrugu();
    expect(await komutCalistir('node -e "console.log(42)"', { cwd: gecici, zamanAsimiMs: 10_000, cikti: c })).toMatchObject({ durum: "gecti", kod: 0 });
    expect(await komutCalistir('node -e "process.exit(3)"', { cwd: gecici, zamanAsimiMs: 10_000, cikti: c })).toMatchObject({ durum: "kaldi", kod: 3 });
    expect(c.metin()).toBe("42");
  });

  it("package.json'da gerçek test betiği varsa npm test önerir", () => {
    const dizin = path.join(gecici, "oneri");
    fs.mkdirSync(dizin, { recursive: true });
    expect(kaliteOnerisi(dizin)).toEqual({ testKomutu: null, hazirlikKomutu: null });
    fs.writeFileSync(path.join(dizin, "package.json"), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
    expect(kaliteOnerisi(dizin)).toEqual({ testKomutu: null, hazirlikKomutu: null });
    fs.writeFileSync(path.join(dizin, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    expect(kaliteOnerisi(dizin)).toEqual({ testKomutu: "npm test", hazirlikKomutu: "npm install" });
    fs.writeFileSync(path.join(dizin, "package-lock.json"), "{}");
    expect(kaliteOnerisi(dizin)).toEqual({ testKomutu: "npm test", hazirlikKomutu: "npm ci" });
    fs.writeFileSync(path.join(dizin, "package.json"), "{bozuk");
    expect(kaliteOnerisi(dizin)).toEqual({ testKomutu: null, hazirlikKomutu: null });
  });

  it("eski veritabanına kalite sütunları varsayılanlarıyla eklenir", () => {
    const dosya = path.join(gecici, "eski.db");
    const ilk = new Depo(dosya);
    const p = ilk.projeEkle({ ad: "Eski", yol: path.join(gecici, "eski-repo"), aciklama: "", varsayilanDal: "main" });
    ilk.kapat();
    const db = new Database(dosya);
    for (const s of ["test_komutu", "hazirlik_komutu", "test_zaman_asimi_dk"]) db.exec(`ALTER TABLE projeler DROP COLUMN ${s}`);
    db.close();
    const yeni = new Depo(dosya);
    try {
      expect(yeni.proje(p.id)).toMatchObject({ testKomutu: null, hazirlikKomutu: null, testZamanAsimiDk: 20 });
      expect(yeni.projeGuncelle(p.id, { testKomutu: "npm test", testZamanAsimiDk: 5 })).toMatchObject({ testKomutu: "npm test", testZamanAsimiDk: 5 });
    } finally {
      yeni.kapat();
    }
  });
});
