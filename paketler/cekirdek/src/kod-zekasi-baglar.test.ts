// Kod zekâsı bağlarının şirkete bağlanışı (0.0.8): grafik ucunda türlü kenarlar ve anlam durumu, ilgili dosyalar ucu,
// ilgili_dosyalar aracı ve talimattaki satırı. Gömme sahte gömücüyle (ARNORG_GOMME=sahte) yapılır.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { KodGrafigi, KodIlgiliDosyalar } from "@arnorg/ortak";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { dilKaynagi } from "./dil.js";
import { ilgiliDosyalarTalimati, ilgiliMetni } from "./kod-zekasi/araclar.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { talimatOlustur } from "./talimat.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let app: FastifyInstance;
let pid: string;
let repo: string;
let eskiGomme: string | undefined;
const anahtar = "test-anahtari-kodzeka-0123456789";

function yaz(yol: string, icerik: string): void {
  const tam = path.join(repo, ...yol.split("/"));
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, icerik);
}

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
async function aracCagir(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const arac = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((a) => a.name === ad)!;
  const s = await arac.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}

beforeAll(async () => {
  eskiGomme = process.env.ARNORG_GOMME;
  process.env.ARNORG_GOMME = "sahte";
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-kodzeka-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
  const p = await sirket.projeOlustur({ ad: "QR Menü", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  repo = p.yol;
  yaz("package.json", JSON.stringify({ name: "qr-menu", dependencies: { express: "^4.19.0" } }));
  yaz("server.js", "const express = require('express');\nconst path = require('path');\nconst menu = require('./routes/menu');\nconst app = express();\napp.use(express.static(path.join(__dirname, 'public')));\napp.use('/api/menu', menu);\n");
  yaz("db.js", "function urunleriGetir() { return menuVerisi.urunler; }\nfunction urunEkle(urun) { menuVerisi.urunler.push(urun); stokGuncelle(urun); }\nmodule.exports = { urunleriGetir, urunEkle };\n");
  yaz("routes/menu.js", "const db = require('../db');\nmodule.exports = (istek, yanit) => yanit.json(db.urunleriGetir());\n");
  yaz("routes/admin.js", "function urunEkle(urun) { menuVerisi.urunler.push(urun); stokGuncelle(urun); }\nmodule.exports = { urunEkle };\n");
  yaz("lib/qr.js", "async function kareKodCiz(masaNumarasi) { return `masa-${masaNumarasi}`; }\nmodule.exports = { kareKodCiz };\n");
  yaz("public/index.html", '<!doctype html>\n<link rel="stylesheet" href="css/stil.css">\n<script src="js/app.js"></script>\n');
  yaz("public/css/stil.css", ".kart { padding: 1rem; }\n");
  yaz("public/js/app.js", "fetch('/api/menu').then((r) => r.json()).then((urunler) => urunler.forEach(kartCiz));\nfunction kartCiz(urun) { document.body.append(urun.ad); }\n");
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  await sirket.kodZekasi.dizinle(pid, "ana");
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
  await app.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await app.close();
  await sirket.kodZekasi.kapat();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  if (eskiGomme === undefined) delete process.env.ARNORG_GOMME;
  else process.env.ARNORG_GOMME = eskiGomme;
});

const basliklar = () => ({ host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` });
async function al<T>(yol: string): Promise<{ durum: number; govde: T }> {
  const y = await app.inject({ url: `/api/projeler/${pid}/kod-zekasi/${yol}`, headers: basliklar() });
  return { durum: y.statusCode, govde: y.json() as T };
}

describe("kod zekâsı bağları: uçlar, araç ve talimat", () => {
  it("grafik ucu: kenarlar türlü (ithal ve anlam), anlam durumu; anlam=0 yalnız içe aktarma", async () => {
    const { durum, govde: g } = await al<KodGrafigi>("grafik?duzey=dosya");
    expect(durum).toBe(200);
    expect(Object.keys(g).sort()).toEqual(["anlam", "dugumler", "duzey", "kenarlar", "kirpilan"]);
    expect(Object.keys(g.anlam!).sort()).toEqual(["durum", "esik", "gomulen", "kirpilan", "toplamParca"]);
    expect(g.anlam!.durum).toBe("hazir");
    expect(new Set(g.kenarlar.map((k) => k.tur))).toEqual(new Set(["ithal", "anlam"]));
    for (const k of g.kenarlar) {
      expect(g.dugumler.some((d) => d.id === k.kaynak) && g.dugumler.some((d) => d.id === k.hedef)).toBe(true);
      if (k.tur === "anlam") {
        expect(typeof k.ithalIle).toBe("boolean");
        expect(k.agirlik).toBeGreaterThan(0);
        expect(k.agirlik).toBeLessThanOrEqual(1);
      } else expect(Number.isInteger(k.agirlik)).toBe(true);
    }
    expect(g.kenarlar).toContainEqual({ kaynak: "server.js", hedef: "public/index.html", agirlik: 1, tur: "ithal" });
    expect(g.kenarlar).toContainEqual({ kaynak: "public/index.html", hedef: "public/js/app.js", agirlik: 1, tur: "ithal" });

    const { govde: yalniz } = await al<KodGrafigi>("grafik?duzey=dosya&anlam=0");
    expect(yalniz.anlam).toBeUndefined();
    expect(yalniz.kenarlar.every((k) => k.tur === "ithal")).toBe(true);
  });

  it("ilgili ucu: içe aktarma ve anlam komşuları; yol gerekli, bilinmeyen dosya 404", async () => {
    const { durum, govde: y } = await al<KodIlgiliDosyalar>("ilgili?yol=db.js");
    expect(durum).toBe(200);
    expect(Object.keys(y).sort()).toEqual(["anlam", "dosyalar", "yol"]);
    const d = y.dosyalar.find((x) => x.yol === "routes/menu.js")!;
    expect(Object.keys(d).sort()).toEqual(["benzerlik", "dil", "enYakin", "gelen", "giden", "yol"]);
    expect(d.gelen).toEqual([{ satir: 1, adlar: [] }]);
    expect(y.dosyalar.find((x) => x.yol === "routes/admin.js")?.benzerlik).toBeGreaterThan(0);
    expect((await al("ilgili")).durum).toBe(400);
    expect((await al("ilgili?yol=yok.js")).durum).toBe(404);
  });

  it("ilgili_dosyalar aracı nedenleri ve en yakın kodu yazar; talimat aracı kod araçlarının yanında anar", async () => {
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const y = await aracCagir(deniz.id, "ilgili_dosyalar", { dosya: "db.js" });
    expect(y.hata).toBe(false);
    expect(y.metin).toMatch(/^db\.js · \d+ ilgili dosya \(\d+ içe aktarma, \d+ anlam bağı\)/);
    expect(y.metin).toContain("routes/menu.js · o bu dosyayı içe aktarıyor (satır 1)");
    expect(y.metin).toMatch(/routes\/admin\.js · anlamca yakın %\d+; en yakın kod: db\.js:\d+-\d+ \S+ ↔ routes\/admin\.js:\d+-\d+/);
    expect(y.metin).toContain("Read ile doğrula");
    const yok = await aracCagir(deniz.id, "ilgili_dosyalar", { dosya: "yok.js" });
    expect(yok.hata).toBe(true);
    expect(yok.metin).toContain("dizinde yok");

    const ajan = depo.ajan(deniz.id)!;
    const t = talimatOlustur({ ajan, proje: sirket.proje(pid), rol: undefined, yonetici: null, ekip: [], cwd: repo, anayasa: sirket.anayasa(pid), kuresel: "", kisisel: [], beceriler: [], baglar: "", hafizaBaglami: "", dil: "tr" });
    expect(t).toContain(ilgiliDosyalarTalimati("tr"));
    expect(t.indexOf("mcp__arnorg__ilgili_dosyalar")).toBeGreaterThan(t.indexOf("mcp__arnorg__kod_ara"));
  });

  it("araç metni: anlam bağları hazırlanırken ve kapalıyken not düşer; İngilizce", () => {
    const temel = { yol: "db.js", dosyalar: [{ yol: "server.js", dil: "javascript", giden: [], gelen: [{ satir: 2, adlar: [] }], benzerlik: null, enYakin: null }] };
    expect(ilgiliMetni({ ...temel, anlam: { durum: "hazirlaniyor", gomulen: 3, toplamParca: 9, esik: null, kirpilan: 0 } })).toContain("Anlam bağları hazırlanıyor (3/9 parça gömüldü)");
    expect(ilgiliMetni({ ...temel, anlam: { durum: "kapali", gomulen: 0, toplamParca: 9, esik: null, kirpilan: 0 } })).toContain("Anlam bağları kapalı");
    expect(ilgiliMetni({ yol: "a.ts", dosyalar: [], anlam: { durum: "hazir", gomulen: 1, toplamParca: 1, esik: 0.5, kirpilan: 0 } })).toContain("ilgili dosya bulunamadı");
    dilKaynagi(() => "en");
    try {
      const en = ilgiliMetni({
        yol: "db.js",
        dosyalar: [{ yol: "routes/admin.js", dil: "javascript", giden: [{ kaynak: "./x", satir: 3, adlar: ["urunEkle"] }], gelen: [], benzerlik: 0.82, enYakin: { bu: { bas: 2, bit: 2, sembol: "urunEkle" }, o: { bas: 1, bit: 1, sembol: "urunEkle" }, benzerlik: 0.9 } }],
        anlam: { durum: "hazir", gomulen: 4, toplamParca: 4, esik: 0.5, kirpilan: 0 },
      });
      expect(en).toContain("db.js · 1 related files (1 import, 1 meaning links)");
      expect(en).toContain("1. routes/admin.js · this file imports it (line 3; urunEkle) · semantically close 82%; closest code: db.js:2-2 urunEkle ↔ routes/admin.js:1-1 urunEkle");
      expect(ilgiliDosyalarTalimati("en")).toContain("mcp__arnorg__ilgili_dosyalar");
    } finally {
      dilKaynagi(() => "tr");
    }
  });
});
