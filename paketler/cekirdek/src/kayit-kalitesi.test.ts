// Görev kaydının kalite denetimi (0.0.8; 0.0.7'nin birleştirme kuyruğundaki kalite kapısının yerine): hazırlık ve test
// komutu kaydın commit'inde, projenin kalite çalışma alanında, proje başına sırayla koşar; ortak çalışma kopyasındaki
// yarım iş teste girmez. Proje kalite alanlarının doğrulanması, eski birleştirme onaylarının farkı ve kalite araçları
// (çıktının son kısmı, süre sınırlı komut, komut önerisi, eski veritabanı). Geçmeyen kaydın görevi sahibine dönmesi,
// dalın kırmızı kalması, zaman aşımı ve açılışta yarım kalan denetim ortak-calisma.test.ts'te.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KAYIT_SON_DURUMLARI, type Ajan, type Gorev, type GorevKaydi, type KayitKaliteDurumu, type SunucuOlayi } from "@arnorg/ortak";
import { kaliteOku } from "./birlestirme-kuyrugu.js";
import { Depo } from "./depo.js";
import * as gitIslemleri from "./git.js";
import { CiktiKuyrugu, kaliteOnerisi, kaliteYolu, komutCalistir, sonKisim } from "./kalite-kapisi.js";
import { OlayYolu } from "./olaylar.js";
import { EN_COK_BEKLEYEN } from "./ortak-calisma/kalite.js";
import { bosKalite } from "./ortak-calisma/kayitlar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";
import { bekle, kimlik, simdi } from "./yardimci.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let projeId: string;
let repo: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];

const git = (dizin: string, ...arg: string[]) => gitIslemleri.git(dizin, arg);
const oku = (dosya: string) => fs.readFileSync(path.join(repo, dosya), "utf8").replace(/\r\n/g, "\n");
const ajan = (ad: string): Ajan => depo.ajanAdla(projeId, ad)!;

/** Ana dalda duran betikler: hazırlık node_modules'e (yoksayılan) yazar; kontrol deger.txt'yi denetler */
const BETIKLER: Record<string, string> = {
  ".gitignore": "node_modules/\n",
  "deger.txt": "ilk\n",
  "hazirlik.cjs": 'const fs = require("node:fs");\nfs.mkdirSync("node_modules", { recursive: true });\nfs.appendFileSync("node_modules/.hazirlik", "x\\n");\nconsole.log("hazirlik tamam");\n',
  "kontrol.cjs": [
    'const fs = require("node:fs");',
    'if (!fs.existsSync("node_modules/.hazirlik")) { console.log("hazirlik yok"); process.exit(2); }',
    'const deger = fs.readFileSync("deger.txt", "utf8");',
    'if (deger.includes("BOZUK")) { console.log("deger.txt bozuk: " + deger.trim()); process.exit(1); }',
    'console.log("kontrol tamam");',
    "",
  ].join("\n"),
  // Kayıt dosyasına başlangıç ve bitiş yazar: denetimlerin üst üste binmediği görülsün
  "sira.cjs": 'const fs = require("node:fs");\nconst log = process.argv[2];\nfs.appendFileSync(log, "basla\\n");\nsetTimeout(() => { fs.appendFileSync(log, "bitir\\n"); console.log("sira tamam"); }, 700);\n',
  "yavas.cjs": 'setTimeout(() => console.log("yavas tamam"), 600);\n',
};

beforeAll(async () => {
  gecici = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-kalite-")));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Kalite", yol: path.join(gecici, "repo"), olustur: true });
  projeId = p.id;
  repo = p.yol;
  for (const [ad, icerik] of Object.entries(BETIKLER)) fs.writeFileSync(path.join(repo, ad), icerik);
  await git(repo, "add", "-A");
  await git(repo, "commit", "-q", "-m", "Betikler");
  sirket.iseAl(projeId, { ad: "Lale", rol: "backend" });
  sirket.iseAl(projeId, { ad: "Kaan", rol: "frontend" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

/** Çalışan dosyayı Write ile yazar: kapıdan geçer, diske yazılır, ona kiralanır */
async function yaz(a: Ajan, goreli: string, icerik: string): Promise<void> {
  const tam = path.join(repo, goreli);
  await sirket.kapi(a.id, "Write", { file_path: tam, content: icerik });
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, icerik);
  sirket.ortak.aracSonrasi(depo.ajan(a.id)!, "Write", { file_path: tam }, repo);
}

async function gorevAc(baslik: string, a: Ajan): Promise<Gorev> {
  const g = sirket.gorevOlustur(projeId, { baslik, atananId: a.id });
  await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" });
  return depo.gorev(g.id)!;
}

/** Çalışan dosyayı yazar ve görevini ara kayıtla kaydeder */
async function kaydet(a: Ajan, g: Gorev, goreli: string, icerik: string): Promise<GorevKaydi> {
  await yaz(a, goreli, icerik);
  const k = await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara");
  if (!k) throw new Error(`kayıt yok: ${goreli}`);
  return k;
}

/** Kaydın denetimi bitip proje sırası boşalana dek bekler */
async function denetimBekle(kayitId: string, sureMs = 40_000): Promise<GorevKaydi> {
  const sinir = Date.now() + sureMs;
  for (;;) {
    const k = sirket.ortak.defter.kayit(kayitId)!;
    if (KAYIT_SON_DURUMLARI.includes(k.kalite.durum) && !sirket.ortak.kalite.suruyorMu(projeId)) return k;
    if (Date.now() > sinir) throw new Error(`Denetim bitmedi: ${JSON.stringify(k.kalite)}`);
    await bekle(40);
  }
}

/** Kaydın olaylarla yayınlanan kalite durumları (art arda aynılar tek) */
function durumlar(kayitId: string): KayitKaliteDurumu[] {
  const liste: KayitKaliteDurumu[] = [];
  for (const o of gelenler) {
    if (o.tur !== "kayit.guncellendi" || o.kayit.id !== kayitId) continue;
    if (liste.at(-1) !== o.kayit.kalite.durum) liste.push(o.kayit.kalite.durum);
  }
  return liste;
}

describe("görev kaydının kalite denetimi", () => {
  it("hazırlık önce koşar; test kaydın commit'inde, ayrı kalite alanında çalışır: çalışma kopyasındaki yarım iş teste girmez", async () => {
    depo.projeGuncelle(projeId, { testKomutu: "node kontrol.cjs", hazirlikKomutu: "node hazirlik.cjs", testZamanAsimiDk: 2 });
    const lale = ajan("Lale");
    const g = await gorevAc("Değer", lale);
    const kayit = await kaydet(lale, g, "deger.txt", "iyi\n");
    // Kayıttan hemen sonra çalışma kopyasında yarım (bozuk) iş: denetim kaydın commit'ine bakar
    await yaz(lale, "deger.txt", "BOZUK yarım\n");
    const k = await denetimBekle(kayit.id);
    expect(k.kalite).toMatchObject({ durum: "gecti", komut: "node kontrol.cjs", sira: null, kirmiziKayit: null });
    expect(k.kalite.cikti).toContain("$ node hazirlik.cjs");
    expect(k.kalite.cikti).toContain("hazirlik tamam");
    expect(k.kalite.cikti).toContain("kontrol tamam");
    expect(k.kalite.sureMs).toBeGreaterThanOrEqual(0);
    expect(durumlar(k.id)).toEqual(["kuyrukta", "hazirlik", "test", "gecti"]);
    // Hazırlığın ürettiği node_modules kalite alanında kalır; ortak projeye yazılmaz, yarım iş yerinde durur
    expect(fs.existsSync(path.join(kaliteYolu(path.join(gecici, "veri", "kalite"), { id: projeId }), "node_modules", ".hazirlik"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "node_modules"))).toBe(false);
    expect(oku("deger.txt")).toBe("BOZUK yarım\n");
    expect(depo.gorev(g.id)?.durum).toBe("calisiliyor");
    await yaz(lale, "deger.txt", "iyi\n");
  }, 60_000);

  it("hazırlık kalırsa test koşmaz; kayıt 'kaldi' olur, mesaj hazırlığı söyler", async () => {
    depo.projeGuncelle(projeId, { hazirlikKomutu: 'node -e "process.exit(4)"' });
    const kaan = ajan("Kaan");
    vi.spyOn(sirket, "uyandir").mockResolvedValue(true);
    const g = await gorevAc("Arayüz", kaan);
    const k = await denetimBekle((await kaydet(kaan, g, "arayuz.txt", "arayüz\n")).id);
    expect(k.kalite).toMatchObject({ durum: "kaldi", komut: 'node -e "process.exit(4)"' });
    expect(k.kalite.mesaj).toBe('Hazırlık komutu başarısız: node -e "process.exit(4)" (çıkış kodu 4).');
    expect(k.kalite.cikti).not.toContain("$ node kontrol.cjs");
    expect(durumlar(k.id)).toEqual(["kuyrukta", "hazirlik", "kaldi"]);
    depo.projeGuncelle(projeId, { hazirlikKomutu: "node hazirlik.cjs" });
  }, 60_000);

  it("aynı anda gelen kayıtların denetimi sırayla koşar; sonraki 'kuyrukta' sırasını bekler", async () => {
    const log = path.join(gecici, "sira.log");
    depo.projeGuncelle(projeId, { testKomutu: `node sira.cjs "${log}"`, hazirlikKomutu: null });
    const lale = ajan("Lale");
    const kaan = ajan("Kaan");
    const g1 = depo.gorevler(projeId).find((g) => g.baslik === "Değer")!;
    const g2 = depo.gorevler(projeId).find((g) => g.baslik === "Arayüz")!;
    await yaz(lale, "lale.txt", "lale\n");
    await yaz(kaan, "kaan.txt", "kaan\n");
    const [k1, k2] = await Promise.all([sirket.ortak.gorevKaydet(depo.gorev(g1.id)!, "ara"), sirket.ortak.gorevKaydet(depo.gorev(g2.id)!, "ara")]);
    expect(gelenler.some((o) => o.tur === "kayit.guncellendi" && o.kayit.id === k2!.id && o.kayit.kalite.durum === "kuyrukta" && o.kayit.kalite.sira === 2)).toBe(true);
    expect((await denetimBekle(k1!.id)).kalite.durum).toBe("gecti");
    expect((await denetimBekle(k2!.id)).kalite.durum).toBe("gecti");
    expect(fs.readFileSync(log, "utf8").replace(/\r\n/g, "\n")).toBe("basla\nbitir\nbasla\nbitir\n");
  }, 60_000);

  it(`kuyrukta ${EN_COK_BEKLEYEN}'dan fazla kayıt birikirse en eskileri atlanır: sonraki kayıtların denetimi onları da kapsar`, async () => {
    depo.projeGuncelle(projeId, { testKomutu: "node yavas.cjs" });
    const lale = ajan("Lale");
    const g = depo.gorevler(projeId).find((x) => x.baslik === "Değer")!;
    // Art arda gelen kayıtlar (kayıt hızı denetimden yüksek): hepsi aynı anda denetime girer
    const commit = (await kaydet(lale, g, "adim.txt", "adim\n")).commit;
    await denetimBekle(sirket.ortak.defter.gorevin(g.id).at(-1)!.id);
    const kayitlar = Array.from({ length: EN_COK_BEKLEYEN + 3 }, (_, i) =>
      sirket.ortak.defter.ekle({
        id: kimlik(), projeId, gorevId: g.id, gorevKodu: g.kod, baslik: `${g.kod} Değer`, ajanId: lale.id, ajanAd: "Lale", commit, dal: "main",
        dosyalar: [`adim-${i}.txt`], eklenen: 1, silinen: 0, neden: "ara", zaman: simdi(), kalite: bosKalite("kuyrukta", "node yavas.cjs"),
      }),
    );
    for (const k of kayitlar) sirket.ortak.kalite.ekle(k);
    for (const k of kayitlar) await denetimBekle(k.id, 60_000);
    const sonuc = kayitlar.map((k) => sirket.ortak.defter.kayit(k.id)!.kalite.durum);
    // İlki hemen koşar; bekleyen altıyı aşan iki en eski bekleyen atlanır
    expect(sonuc).toEqual(["gecti", "atlandi", "atlandi", ...Array.from({ length: EN_COK_BEKLEYEN }, () => "gecti")]);
    expect(sirket.ortak.defter.kayit(kayitlar[1]!.id)!.kalite.mesaj).toContain("daha yeni kayıtların denetimi bunu da kapsıyor");
  }, 90_000);

  it("test komutu değişince ekibe duyurulur; kaldırılınca kayıtlar 'testsiz' biter", async () => {
    await sirket.projeGuncelle(projeId, { testKomutu: "node kontrol.cjs", hazirlikKomutu: "node hazirlik.cjs" });
    const genel = () => depo.mesajlar(projeId, "genel").map((m) => m.metin);
    expect(genel().at(-1)).toBe(
      "Kalite: her görev kaydından sonra node kontrol.cjs (önce node hazirlik.cjs) main dalındaki o commit'te arka planda koşacak; geçmeyen görev çıktıyla sahibine döner. Görevi 'inceleme'ye almadan önce aynı komutu koşun.",
    );
    await sirket.projeGuncelle(projeId, { testKomutu: null });
    expect(genel().at(-1)).toBe("Kurul test komutunu kaldırdı; görev kayıtlarından sonra test koşmayacak.");
    const kaan = ajan("Kaan");
    const g = depo.gorevler(projeId).find((x) => x.baslik === "Arayüz")!;
    const k = await kaydet(kaan, g, "testsiz.txt", "x\n");
    expect(k.kalite).toMatchObject({ durum: "testsiz", komut: null, cikti: "" });
    expect(durumlar(k.id)).toEqual(["testsiz"]);
  });
});

describe("kalite ayarları ve eski birleştirmeler API'si", () => {
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
    depo.projeGuncelle(projeId, { testKomutu: null });
  });

  it("0.0.7'den kalan birleştirme onayının farkı okunur kalır; birleştirme ucu 410 döner", async () => {
    // 0.0.7'de çalışanın kendi worktree'sinde açtığı dal ve birlestirme_iste'nin açtığı onay
    const alan = path.join(gecici, "eski-alan");
    await gitIslemleri.worktreeAc(repo, alan, "arnorg/eski", "main");
    fs.writeFileSync(path.join(alan, "deger.txt"), "BOZUK eski\n");
    fs.writeFileSync(path.join(alan, "eski.txt"), "eski\n");
    await git(alan, "add", "-A");
    await git(alan, "commit", "-q", "-m", "Eski iş");
    const lale = ajan("Lale");
    const kalite = { durum: "test_basarisiz", sira: null, komut: "node kontrol.cjs", hedefCommit: null, dalCommit: null, baslangic: null, adimBaslangic: null, bitis: null, sureMs: null, cikti: "deger.txt bozuk", mesaj: null, testYok: false, testsiz: false };
    const veri = { ajanId: lale.id, dal: "arnorg/eski", ozet: "Eski iş", isteyenId: lale.id, kalite };
    const o = depo.onayEkle({ projeId, ajanId: lale.id, tur: "birlestirme", baslik: "arnorg/eski → main", ayrinti: "Eski iş", veri, sonGecerlilik: null, muhatap: "kurul" });
    expect(kaliteOku(o)).toMatchObject({ durum: "test_basarisiz", cikti: "deger.txt bozuk" });
    const fark = (await app.inject({ url: `/api/onaylar/${o.id}/fark`, headers: h })).json() as { fark: string; dosyalar: { yol: string; degisiklik: string }[] };
    expect(fark.dosyalar.map((d) => `${d.degisiklik} ${d.yol}`).sort()).toEqual(["A eski.txt", "M deger.txt"]);
    expect(fark.fark).toContain("+BOZUK eski");
    expect((await app.inject({ url: `/api/onaylar/yok/fark`, headers: h })).statusCode).toBe(404);
    // Birleştirme yok: kurulun eski "testsiz birleştir" düğmesi bir şey yapmaz, ana dal değişmez
    const yanit = await app.inject({ method: "POST", url: `/api/onaylar/${o.id}/birlestir`, headers: h, payload: { testsiz: true } });
    expect(yanit.statusCode).toBe(410);
    expect(yanit.json().hata).toContain("ArnOrg 0.0.8'de birleştirme yok");
    expect(oku("deger.txt")).not.toContain("BOZUK");
    expect(fs.existsSync(path.join(repo, "eski.txt"))).toBe(false);
  });
});

describe("kalite araçları", () => {
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
