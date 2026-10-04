// Denetim kaydı (0.0.4): alt ajan kimliği ve göçü, saklama süresi ve aylık arşiv, JSONL dışa aktarım
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Ayarlar, DenetimKaydi } from "@arnorg/ortak";
import { arsivDosyaAdi, DenetimArsivi } from "./denetim-arsivi.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

const ANAHTAR = "denetim-testi-anahtari-0123456789";

let gecici: string;
let veri: string;
let depo: Depo;
let sirket: Sirket;
let app: FastifyInstance;
let pid: string;

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-denetim-"));
  veri = path.join(gecici, "veri");
  const yap = new Yapilandirma(veri);
  depo = new Depo(path.join(veri, "arnorg.db"));
  sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
  pid = (await sirket.projeOlustur({ ad: "Denetim", yol: path.join(gecici, "repo"), olustur: true })).id;
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: ANAHTAR, studyoDizini: null, izinliHostlar: [] });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

const istek = (url: string) => app.inject({ method: "GET", url, headers: { host: "127.0.0.1:0", authorization: `Bearer ${ANAHTAR}` } });

describe("denetim kaydında alt ajan", () => {
  it("alt ajanın çağrısı alt ajan kimliğiyle, ana ajanınki boş kaydedilir; API ikisini de döner", async () => {
    const deniz = sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
    await sirket.kapi(deniz.id, "Read", { file_path: "README.md" }, "arac-1", "alt-ajan-7f3");
    await sirket.kapi(deniz.id, "Read", { file_path: "a.ts" }, "arac-2");
    // Ret ve imza ayıklama da alt ajanı taşır
    await sirket.kapi(deniz.id, "Bash", { command: "git reset --hard HEAD~1" }, "arac-3", "alt-ajan-7f3");
    await sirket.kapi(deniz.id, "Bash", { command: 'git commit -m "iş\n\nCo-Authored-By: Claude <noreply@anthropic.com>"' }, "arac-4", "alt-ajan-9c1");

    const kayitlar = depo.denetimKayitlari(pid, 10);
    const bul = (aracKimligi: string) => kayitlar.find((k) => k.aracKimligi === aracKimligi);
    expect(bul("arac-1")).toMatchObject({ karar: "izin", altAjan: "alt-ajan-7f3" });
    expect(bul("arac-2")).toMatchObject({ karar: "izin", altAjan: null });
    expect(bul("arac-3")).toMatchObject({ karar: "ret", altAjan: "alt-ajan-7f3" });
    expect(bul("arac-4")).toMatchObject({ karar: "degisti", altAjan: "alt-ajan-9c1" });

    const yanit = await istek(`/api/projeler/${pid}/denetim`);
    expect(yanit.statusCode).toBe(200);
    const api = yanit.json() as DenetimKaydi[];
    expect(api.find((k) => k.aracKimligi === "arac-1")?.altAjan).toBe("alt-ajan-7f3");
    expect(api.find((k) => k.aracKimligi === "arac-2")?.altAjan).toBeNull();
  });

  it("eski veritabanına alt_ajan sütunu göçle eklenir; eski kayıtlar boş kalır", () => {
    const dosya = path.join(gecici, "eski.db");
    const ilk = new Depo(dosya);
    ilk.denetimEkle({ projeId: "p", ajanId: "a", ajanAd: "Ada", arac: "Read", girdiOzeti: "x", karar: "izin", kural: null, neden: null, aracKimligi: null });
    ilk.kapat();
    // 0.0.3 şeması: sütun yok
    const ham = new Database(dosya);
    ham.exec("ALTER TABLE denetim DROP COLUMN alt_ajan");
    ham.close();

    const yeni = new Depo(dosya);
    try {
      const sutunlar = (yeni.db.prepare("PRAGMA table_info(denetim)").all() as { name: string }[]).map((s) => s.name);
      expect(sutunlar).toContain("alt_ajan");
      expect(yeni.denetimKayitlari("p")).toMatchObject([{ ajanAd: "Ada", altAjan: null }]);
    } finally {
      yeni.kapat();
    }
  });
});

/** Kaydı geçmişe taşır (saklama süresi denemeleri) */
function eskit(id: string, gunOnce: number): string {
  const zaman = new Date(Date.now() - gunOnce * 86_400_000).toISOString();
  depo.db.prepare("UPDATE denetim SET zaman = ? WHERE id = ?").run(zaman, id);
  return zaman;
}

const kayitEkle = (ajanAd: string, arac: string, girdiOzeti: string, karar: DenetimKaydi["karar"], kural: string | null = null) =>
  depo.denetimEkle({ projeId: pid, ajanId: `ajan-${ajanAd.toLowerCase()}`, ajanAd, arac, girdiOzeti, karar, kural, neden: null, aracKimligi: null });

describe("denetim saklama süresi ve aylık arşiv", () => {
  it("süresi dolanlar kaydın ayına göre JSONL dosyalarına eklenir ve tablodan silinir; yeniler kalır", async () => {
    const cokEski = kayitEkle("Ada", "Read", "eski.md", "izin");
    const eski = kayitEkle("Ada", "Bash", "npm test", "izin");
    const yeni = kayitEkle("Ada", "Read", "yeni.md", "izin");
    const z1 = eskit(cokEski.id, 200);
    const z2 = eskit(eski.id, 120);
    eskit(yeni.id, 10);

    const arsiv = new DenetimArsivi(depo, sirket.yapilandirma);
    expect(sirket.yapilandirma.ayarlar.denetimSaklamaGun).toBe(90);
    const sonuc = await arsiv.arsivle();
    expect(sonuc.tasinan).toBe(2);
    const dosya1 = path.join(veri, "arsiv", arsivDosyaAdi(z1));
    const dosya2 = path.join(veri, "arsiv", arsivDosyaAdi(z2));
    expect(sonuc.dosyalar).toEqual([...new Set([dosya1, dosya2])].sort());
    expect(path.basename(dosya1)).toMatch(/^denetim-\d{4}-\d{2}\.jsonl$/);
    const arsivdekiler = [...new Set([dosya1, dosya2])].flatMap((d) => fs.readFileSync(d, "utf8").trim().split("\n").map((s) => JSON.parse(s) as DenetimKaydi));
    expect(arsivdekiler.map((k) => k.id).sort()).toEqual([cokEski.id, eski.id].sort());
    expect(arsivdekiler.find((k) => k.id === eski.id)).toMatchObject({ arac: "Bash", girdiOzeti: "npm test", zaman: z2, altAjan: null });
    const tablodakiler = depo.denetimKayitlari(pid, 2000).map((k) => k.id);
    expect(tablodakiler).toContain(yeni.id);
    expect(tablodakiler).not.toContain(eski.id);

    // İkinci çalışma bir şey taşımaz, dosyalara eklemez
    const boyut = fs.statSync(dosya2).size;
    expect((await arsiv.arsivle()).tasinan).toBe(0);
    expect(fs.statSync(dosya2).size).toBe(boyut);
  });

  it("0 süresiz demektir: hiçbir kayıt taşınmaz", async () => {
    const k = kayitEkle("Ece", "Read", "çok-eski.md", "izin");
    eskit(k.id, 5000);
    sirket.yapilandirma.guncelle({ denetimSaklamaGun: 0 });
    try {
      expect((await new DenetimArsivi(depo, sirket.yapilandirma).arsivle()).tasinan).toBe(0);
      expect(depo.denetimKayitlari(pid, 2000).some((x) => x.id === k.id)).toBe(true);
    } finally {
      sirket.yapilandirma.guncelle({ denetimSaklamaGun: 90 });
    }
  });

  it("ayar API'de doğrulanır: 0–3650 tam gün", async () => {
    const yaz = (govde: unknown) =>
      app.inject({ method: "PUT", url: "/api/ayarlar", headers: { host: "127.0.0.1:0", authorization: `Bearer ${ANAHTAR}` }, payload: govde as object });
    const tamam = await yaz({ denetimSaklamaGun: 30 });
    expect(tamam.statusCode).toBe(200);
    expect((tamam.json() as Ayarlar).denetimSaklamaGun).toBe(30);
    expect((await yaz({ denetimSaklamaGun: -1 })).statusCode).toBe(400);
    expect((await yaz({ denetimSaklamaGun: 4000 })).statusCode).toBe(400);
    expect((await yaz({ denetimSaklamaGun: 90 })).statusCode).toBe(200);
  });
});

describe("denetim dışa aktarımı", () => {
  const satirlar = (govde: string) =>
    govde
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s) as DenetimKaydi);

  it("süzgeçsiz: projenin tablodaki bütün kayıtları JSONL, eskiden yeniye; dosya adı başlıkta", async () => {
    const yanit = await istek(`/api/projeler/${pid}/denetim/disa-aktar`);
    expect(yanit.statusCode).toBe(200);
    expect(yanit.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    expect(yanit.headers["content-disposition"]).toMatch(/^attachment; filename="arnorg-denetim-denetim-\d{4}-\d{2}-\d{2}\.jsonl"$/);
    const kayitlar = satirlar(yanit.body);
    const tablodakiler = depo.denetimKayitlari(pid, 5000);
    expect(kayitlar.length).toBe(tablodakiler.length);
    expect(kayitlar.map((k) => k.id)).toEqual(tablodakiler.map((k) => k.id).reverse());
    expect(kayitlar.every((k, i) => i === 0 || kayitlar[i - 1]!.zaman <= k.zaman)).toBe(true);
  });

  it("Stüdyo'nun süzgecini uygular: karar, ajan ve harf duyarsız arama", async () => {
    const r = kayitEkle("Mert", "Bash", "rm -rf İçerik/", "ret", "Yıkıcı komutlar");
    kayitEkle("Mert", "Read", "içerik.md", "izin");
    const ret = satirlar((await istek(`/api/projeler/${pid}/denetim/disa-aktar?karar=ret&ajan=ajan-mert`)).body);
    expect(ret.map((k) => k.id)).toEqual([r.id]);
    // Türkçe büyük/küçük harf: "YIKICI" kuraldaki "Yıkıcı"yı bulur (ilk testteki Deniz'in reddi de bu kurala takıldı)
    const arama = satirlar((await istek(`/api/projeler/${pid}/denetim/disa-aktar?q=${encodeURIComponent("YIKICI")}`)).body);
    expect(arama.map((k) => k.ajanAd)).toEqual(["Deniz", "Mert"]);
    const mertinki = satirlar((await istek(`/api/projeler/${pid}/denetim/disa-aktar?ajan=ajan-mert&q=${encodeURIComponent("YIKICI")}`)).body);
    expect(mertinki.map((k) => k.id)).toEqual([r.id]);
    const icerik = satirlar((await istek(`/api/projeler/${pid}/denetim/disa-aktar?ajan=ajan-mert&q=${encodeURIComponent("içerik")}`)).body);
    expect(icerik).toHaveLength(2);
    expect((await istek(`/api/projeler/${pid}/denetim/disa-aktar?karar=belki`)).statusCode).toBe(400);
    expect((await istek(`/api/projeler/yok/denetim/disa-aktar`)).statusCode).toBe(404);
  });

  it("çok sayfalı kayıtta hepsini sırayla verir", async () => {
    const ekle = depo.db.transaction(() => {
      for (let i = 0; i < 2500; i++) kayitEkle("Toplu", "Read", `dosya-${i}.ts`, "izin");
    });
    ekle();
    const kayitlar = satirlar((await istek(`/api/projeler/${pid}/denetim/disa-aktar?ajan=ajan-toplu`)).body);
    expect(kayitlar).toHaveLength(2500);
    expect(new Set(kayitlar.map((k) => k.id)).size).toBe(2500);
    expect(kayitlar[0]!.girdiOzeti).toBe("dosya-0.ts");
    expect(kayitlar.at(-1)!.girdiOzeti).toBe("dosya-2499.ts");
  });
});
