// Yöneticide anlam bağları: gömme sürerken "hazirlaniyor" (içe aktarma bağları yine gelir), bitince "hazir"; değişiklikten
// sonra yeniden gömülürken son hesaplanan bağlar; parça kümesi değişmedikçe yeniden hesaplanmaz; model kapalıyken
// "kapali". ilgili(): içe aktarma ve anlam komşuları, nedenleriyle. Çözümleme kuralları değişince dizin gömmeler
// korunarak yeniden çözümlenir. Windows'ta yazılmış proje: CRLF, UTF-16 dosya, ters eğik çizgili belirteçler.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { KodZekasiModeli } from "@arnorg/ortak";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SahteGomucu } from "./gomucu.js";
import { KodZekasi } from "./yonetici.js";

vi.mock("./anlam.js", async (ozgun) => {
  const m = await ozgun<typeof import("./anlam.js")>();
  return { ...m, anlamBaglari: vi.fn(m.anlamBaglari) };
});
const { anlamBaglari } = await import("./anlam.js");

const PID = "menu";

function yaz(kok: string, yol: string, icerik: string | Buffer): void {
  const tam = path.join(kok, ...yol.split("/"));
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, icerik);
}

/** QR menü: içe aktarmayla bağlı dosyalar ve içe aktarması olmayan ama aynı işi yapan yönetim rotası */
function repoKur(): string {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), "kz-anlam-"));
  yaz(kok, "package.json", JSON.stringify({ name: "qr-menu", dependencies: { express: "^4.19.0" } }));
  yaz(kok, "server.js", "const express = require('express');\nconst db = require('./db');\nconst menu = require('./routes/menu');\nconst app = express();\napp.use('/menu', menu);\napp.listen(3000);\n");
  yaz(
    kok,
    "db.js",
    "// Menü ürünleri: ürün ekleme, silme ve stok\nfunction urunleriGetir() { return menuVerisi.urunler; }\nfunction urunEkle(urun) { menuVerisi.urunler.push(urun); stokGuncelle(urun); }\nfunction urunSil(kimlik) { menuVerisi.urunler = menuVerisi.urunler.filter((u) => u.kimlik !== kimlik); }\nmodule.exports = { urunleriGetir, urunEkle, urunSil };\n",
  );
  yaz(kok, "routes/menu.js", "const db = require('../db');\nmodule.exports = (istek, yanit) => yanit.json(db.urunleriGetir());\n");
  yaz(
    kok,
    "routes/admin.js",
    "// Yönetim: ürün ekleme ve silme (menuVerisi doğrudan)\nfunction urunEkle(urun) { menuVerisi.urunler.push(urun); stokGuncelle(urun); }\nfunction urunSil(kimlik) { menuVerisi.urunler = menuVerisi.urunler.filter((u) => u.kimlik !== kimlik); }\nmodule.exports = { urunEkle, urunSil };\n",
  );
  yaz(kok, "lib/qr.js", "const QRCode = require('qrcode');\nasync function kareKodCiz(masaNumarasi) { return QRCode.toDataURL(`masa-${masaNumarasi}`); }\nmodule.exports = { kareKodCiz };\n");
  yaz(kok, "public/index.html", '<!doctype html>\n<link rel="stylesheet" href="css/stil.css">\n<script src="js/app.js"></script>\n');
  yaz(kok, "public/css/stil.css", "body { font-family: sans-serif; }\n.kart { padding: 1rem; }\n");
  yaz(kok, "public/js/app.js", "fetch('/menu').then((r) => r.json()).then((urunler) => urunler.forEach(kartCiz));\nfunction kartCiz(urun) { document.body.append(urun.ad); }\n");
  const g = (...a: string[]) => execFileSync("git", a, { cwd: kok, stdio: "ignore" });
  g("init", "-q");
  g("add", "-A");
  g("-c", "user.name=Deneme", "-c", "user.email=deneme@ornek.com", "commit", "-qm", "ilk");
  return kok;
}

/** Kapısı açılana kadar gömmeyi bekleten sahte gömücü */
class YavasGomucu extends SahteGomucu {
  private ac: () => void = () => undefined;
  private kapi: Promise<void> = Promise.resolve();
  kapat_(): void {
    this.kapi = new Promise((coz) => (this.ac = coz));
  }
  serbest(): void {
    this.ac();
  }
  override async gom(metinler: string[]): Promise<Float32Array[]> {
    await this.kapi;
    return super.gom(metinler);
  }
}

async function bekleKosul(f: () => boolean, ms = 5000): Promise<void> {
  const son = Date.now() + ms;
  while (!f()) {
    if (Date.now() > son) throw new Error("koşul gerçekleşmedi");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("yöneticide anlam bağları", () => {
  let veri: string;
  let repo: string;
  let model: KodZekasiModeli;
  let gomucu: YavasGomucu;
  let kz: KodZekasi;

  const yeni = () =>
    new KodZekasi({
      veriDizini: veri,
      yayinla: () => undefined,
      alanYolu: () => repo,
      projeler: () => [],
      ayarlar: () => ({ kodZekasiModeli: model, kodZekasiOtomatik: false }),
      gomucuOlustur: (s) => (s === "kapali" ? null : gomucu),
      artimliGecikmeMs: 10,
    });

  beforeEach(() => {
    veri = fs.mkdtempSync(path.join(os.tmpdir(), "kz-anlam-veri-"));
    repo = repoKur();
    model = "kaliteli";
    gomucu = new YavasGomucu();
    kz = yeni();
    vi.mocked(anlamBaglari).mockClear();
  });

  afterEach(async () => {
    gomucu.serbest();
    await kz.kapat();
    for (const d of [veri, repo]) fs.rmSync(d, { recursive: true, force: true });
  });

  it("gömme sürerken hazırlanıyor ve içe aktarma bağları gelir; bitince anlam bağları; parça kümesi aynıyken önbellekten", async () => {
    gomucu.kapat_();
    const is = kz.dizinle(PID, "ana");
    await bekleKosul(() => kz.durum(PID, "ana").durum === "gomuluyor");
    const once = await kz.grafik(PID, "ana", "dosya");
    expect(once.anlam).toMatchObject({ durum: "hazirlaniyor", esik: null });
    expect(once.anlam!.gomulen).toBeLessThan(once.anlam!.toplamParca);
    expect(once.kenarlar.length).toBeGreaterThan(0);
    expect(once.kenarlar.every((k) => k.tur === "ithal")).toBe(true);
    expect(once.kenarlar).toContainEqual({ kaynak: "public/index.html", hedef: "public/js/app.js", agirlik: 1, tur: "ithal" });

    gomucu.serbest();
    await is;
    const sonra = await kz.grafik(PID, "ana", "dosya");
    expect(sonra.anlam).toMatchObject({ durum: "hazir", kirpilan: 0 });
    expect(sonra.anlam!.esik).toBeGreaterThan(0);
    const anlam = sonra.kenarlar.filter((k) => k.tur === "anlam");
    // İçe aktarması olmayan ama aynı işi yapan iki dosya anlamca bağlanır
    expect(anlam).toContainEqual(expect.objectContaining({ kaynak: "db.js", hedef: "routes/admin.js", ithalIle: false }));
    for (const k of anlam) {
      expect(k.kaynak < k.hedef).toBe(true);
      expect(k.agirlik).toBeGreaterThanOrEqual(sonra.anlam!.esik!);
    }
    expect(vi.mocked(anlamBaglari)).toHaveBeenCalledTimes(1);
    // Aynı sürümde klasör düzeyi, ilgili() ve yeni istekler yeniden hesaplatmaz
    const klasor = await kz.grafik(PID, "ana", "klasor");
    expect(klasor.kenarlar.some((k) => k.tur === "anlam" && k.kaynak === "." && k.hedef === "routes")).toBe(true);
    await kz.ilgili(PID, "ana", "db.js");
    await kz.grafik(PID, "ana", "dosya");
    expect(vi.mocked(anlamBaglari)).toHaveBeenCalledTimes(1);

    // Değişiklik: yeniden gömülürken son hesaplanan bağlar "hazirlaniyor" durumuyla gelir
    gomucu.kapat_();
    yaz(repo, "lib/qr.js", `${fs.readFileSync(path.join(repo, "lib/qr.js"), "utf8")}function masaAdi(n) { return \`Masa \${n}\`; }\n`);
    kz.olay({ tur: "dosya.degisti", projeId: PID, alan: "ana", yol: "lib/qr.js", ajanId: null });
    await bekleKosul(() => kz.durum(PID, "ana").durum === "gomuluyor");
    const surerken = await kz.grafik(PID, "ana", "dosya");
    expect(surerken.anlam!.durum).toBe("hazirlaniyor");
    expect(surerken.kenarlar.filter((k) => k.tur === "anlam")).toEqual(anlam);
    gomucu.serbest();
    await kz.bosta(PID);
    expect((await kz.grafik(PID, "ana", "dosya")).anlam!.durum).toBe("hazir");
    expect(vi.mocked(anlamBaglari)).toHaveBeenCalledTimes(2);
  });

  it("ilgili(): içe aktarma yönleri ve satırları, anlam benzerliği ve en yakın parça çifti; sıralama ve 404", async () => {
    await kz.dizinle(PID, "ana");
    const y = await kz.ilgili(PID, "ana", "db.js");
    expect(y.yol).toBe("db.js");
    expect(y.anlam.durum).toBe("hazir");
    const bul = (yol: string) => y.dosyalar.find((d) => d.yol === yol);
    expect(bul("server.js")).toMatchObject({ dil: "javascript", giden: [], gelen: [{ satir: 2, adlar: [] }] });
    expect(bul("routes/menu.js")!.gelen).toEqual([{ satir: 1, adlar: [] }]);
    const admin = bul("routes/admin.js")!;
    expect(admin.giden.length + admin.gelen.length).toBe(0);
    expect(admin.benzerlik).toBeGreaterThan(0);
    expect(admin.enYakin).toMatchObject({ bu: { sembol: expect.any(String) }, o: { sembol: expect.any(String) } });
    expect(admin.enYakin!.bu.bas).toBeGreaterThanOrEqual(1);
    // Önce iki bağı da olanlar, sonra yalnız içe aktarma, sonra yalnız anlam
    const sira = y.dosyalar.map((d) => (d.benzerlik !== null && d.giden.length + d.gelen.length ? 0 : d.benzerlik === null ? 1 : 2));
    expect([...sira].sort()).toEqual(sira);
    expect((await kz.ilgili(PID, "ana", "db.js", { sinir: 1 })).dosyalar).toHaveLength(1);
    // HTML sayfasının bağları (Windows ayracıyla verilen yol)
    const sayfa = await kz.ilgili(PID, "ana", "public\\index.html");
    expect(sayfa.dosyalar.filter((d) => d.giden.length).map((d) => d.yol).sort()).toEqual(["public/css/stil.css", "public/js/app.js"]);
    await expect(kz.ilgili(PID, "ana", "yok.js")).rejects.toThrow(/dizinde yok/);
  });

  it("model kapalıyken yalnız içe aktarma bağları ve kapalı durumu", async () => {
    model = "kapali";
    await kz.dizinle(PID, "ana");
    const g = await kz.grafik(PID, "ana", "dosya");
    expect(g.anlam).toMatchObject({ durum: "kapali", esik: null });
    expect(g.kenarlar.length).toBeGreaterThan(0);
    expect(g.kenarlar.every((k) => k.tur === "ithal")).toBe(true);
    const y = await kz.ilgili(PID, "ana", "db.js");
    expect(y.dosyalar.every((d) => d.benzerlik === null)).toBe(true);
    expect(y.dosyalar.map((d) => d.yol).sort()).toEqual(["routes/menu.js", "server.js"]);
    expect(vi.mocked(anlamBaglari)).not.toHaveBeenCalled();
  });

  it("çözümleme kuralları değişince dosyalar yeniden çözümlenir, gömmeler korunur", async () => {
    await kz.dizinle(PID, "ana");
    const gomulen = gomucu.gomulenMetin;
    await kz.kapat();
    // 0.0.7 dizini gibi: HTML başvuruları yok, çözümleme sürümü eski
    const db = new Database(path.join(veri, "kod-dizini", `${PID}.db`));
    db.prepare("DELETE FROM iceaktarmalar WHERE yol LIKE '%.html' OR kaynak LIKE './routes/%'").run();
    db.prepare("UPDATE meta SET deger = '1' WHERE anahtar = 'cozumleme:ana'").run();
    db.close();
    kz = yeni();
    const g = await kz.grafik(PID, "ana", "dosya", { anlam: false });
    expect(g.kenarlar).not.toContainEqual(expect.objectContaining({ kaynak: "public/index.html" }));
    await kz.dizinle(PID, "ana");
    const yeniden = await kz.grafik(PID, "ana", "dosya", { anlam: false });
    expect(yeniden.kenarlar).toContainEqual({ kaynak: "public/index.html", hedef: "public/js/app.js", agirlik: 1, tur: "ithal" });
    expect(yeniden.kenarlar).toContainEqual({ kaynak: "server.js", hedef: "routes/menu.js", agirlik: 1, tur: "ithal" });
    expect(gomucu.gomulenMetin).toBe(gomulen);
    expect(kz.durum(PID, "ana").gomulen).toBe(kz.durum(PID, "ana").toplamParca);
  });

  it("Windows'ta yazılmış proje: CRLF, UTF-16 dosya ve ters eğik çizgili belirteçler bağ kurar", async () => {
    const win = fs.mkdtempSync(path.join(os.tmpdir(), "kz-windows-"));
    try {
      yaz(win, "server.js", "const menu = require('.\\\\routes\\\\menu');\r\nconst db = require('./db');\r\n");
      // Windows PowerShell'in Out-File çıktısı: BOM'lu UTF-16 LE
      yaz(win, "routes/menu.js", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('const db = require("..\\\\db");\r\nmodule.exports = db;\r\n', "utf16le")]));
      yaz(win, "db.js", "module.exports = { urunler: [] };\r\n");
      repo = win;
      const k = yeni();
      try {
        await k.dizinle(PID, "ana");
        const g = await k.grafik(PID, "ana", "dosya", { anlam: false });
        expect(g.kenarlar.map((x) => `${x.kaynak} -> ${x.hedef}`).sort()).toEqual(["routes/menu.js -> db.js", "server.js -> db.js", "server.js -> routes/menu.js"]);
        const b = await k.bagimliliklar(PID, "ana", "routes\\menu.js");
        expect(b.iceAktaranlar.map((x) => x.yol)).toEqual(["server.js"]);
        const s = await k.semboller(PID, "ana", "");
        expect(s).toBeDefined();
      } finally {
        await k.kapat();
      }
    } finally {
      fs.rmSync(win, { recursive: true, force: true });
    }
  });
});
