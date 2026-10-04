// Kurulun kurduğu kanallar (oturumsuz kip): depo göçü, API doğrulamaları (ad, sistem kanalı, çakışma, üyeler), silme,
// konuşmanın başlatılıp durdurulması, işten çıkarılan üye, mesai durdurma ve açılışta duran konuşmalar
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import type { Kanal, SunucuOlayi } from "@arnorg/ortak";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { OzelKanallar } from "./ozel-kanallar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

const ANAHTAR = "test-anahtari";
const h = { authorization: `Bearer ${ANAHTAR}` };

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let app: FastifyInstance;
let pid: string;
let digerPid: string;
const gelenler: SunucuOlayi[] = [];
const bekle = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const ajan = (ad: string) => depo.ajanAdla(pid, ad)!;

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-kanal-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  const olaylar = new OlayYolu();
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  pid = depo.projeEkle({ ad: "Kanal", yol: path.join(gecici, "repo"), aciklama: "", varsayilanDal: "main" }).id;
  digerPid = depo.projeEkle({ ad: "Diğer", yol: path.join(gecici, "diger"), aciklama: "", varsayilanDal: "main" }).id;
  for (const [ad, rol] of [
    ["Ada", "ceo"],
    ["Deniz", "backend"],
    ["Elif", "frontend"],
    ["Selin", "tasarim"],
  ] as const) {
    sirket.iseAl(pid, { ad, rol });
  }
  sirket.iseAl(digerPid, { ad: "Lale", rol: "ceo" });
  // Sunucu dinlemeye açılmaz; inject'in varsayılan Host'u izinli
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: ANAHTAR, studyoDizini: null, izinliHostlar: ["localhost:80"] });
});

afterAll(async () => {
  await app.close();
  await bekle();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const kur = (govde: Record<string, unknown>) => app.inject({ method: "POST", url: `/api/projeler/${pid}/kanallar`, headers: h, payload: govde });
const kanalOku = (ad: string) => depo.kanal(pid, ad);

describe("depo göçü", () => {
  it("eski kanallar tablosuna özel kanal sütunları eklenir; eski kanallar sistem kanalı gibi görünür", () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-kanal-goc-"));
    try {
      const dosya = path.join(dizin, "arnorg.db");
      const eski = new Database(dosya);
      eski.exec("CREATE TABLE kanallar (proje_id TEXT NOT NULL, ad TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', PRIMARY KEY (proje_id, ad))");
      eski.prepare("INSERT INTO kanallar (proje_id, ad, aciklama) VALUES ('p1', 'tasarim', 'Ajanların açtığı kanal')").run();
      eski.close();
      const d = new Depo(dosya);
      try {
        const sutunlar = (d.db.prepare("PRAGMA table_info(kanallar)").all() as { name: string }[]).map((s) => s.name);
        expect(sutunlar).toEqual(expect.arrayContaining(["ozel", "uyeler", "konusma", "konu", "konusma_baslangic", "olusturma"]));
        expect(d.kanallar("p1")).toEqual([{ ad: "tasarim", aciklama: "Ajanların açtığı kanal", mesajSayisi: 0 }]);
        // Göç ikinci açılışta yinelenmez
        d.kapat();
        const yine = new Depo(dosya);
        expect(yine.kanal("p1", "tasarim")?.ozel).toBeUndefined();
        yine.kapat();
      } finally {
        if (d.db.open) d.kapat();
      }
    } finally {
      fs.rmSync(dizin, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});

describe("kanal API'si", () => {
  it("kurul kanal kurar: ad küçük harfe iner, boşluk tire olur; üyeler sırasıyla kaydedilir, olay yayınlanır", async () => {
    const once = gelenler.length;
    const y = await kur({ ad: " #Tasarım Ekibi ", aciklama: " Ana sayfa ", uyeler: [ajan("Selin").id, ajan("Elif").id, ajan("Selin").id] });
    expect(y.statusCode).toBe(200);
    const k = y.json() as Kanal;
    expect(k).toMatchObject({ ad: "tasarım-ekibi", aciklama: "Ana sayfa", mesajSayisi: 0, ozel: true, uyeler: [ajan("Selin").id, ajan("Elif").id], konusma: "durdu", konu: null });
    expect(k.olusturma).toMatch(/^\d{4}-/);
    expect(gelenler.slice(once).some((o) => o.tur === "kanal.guncellendi" && o.kanal.ad === "tasarım-ekibi")).toBe(true);
    // Listede sistem kanallarının yanında özel alanlarıyla görünür; sistem kanallarında bu alanlar yok
    const liste = (await app.inject({ url: `/api/projeler/${pid}/kanallar`, headers: h })).json() as Kanal[];
    expect(liste.find((x) => x.ad === "tasarım-ekibi")?.ozel).toBe(true);
    expect(liste.find((x) => x.ad === "genel")).toEqual({ ad: "genel", aciklama: "Şirket geneli: brief, rapor, duyuru", mesajSayisi: 0 });
  });

  it("aynı ad 409; sistem kanallarının adları ve İngilizce görünen adları alınamaz; geçersiz ad 400", async () => {
    expect((await kur({ ad: "tasarım-ekibi", uyeler: [ajan("Deniz").id] })).statusCode).toBe(409);
    for (const ad of ["genel", "general", "yonetim", "ceo", "#Engineering", "muhendislik", "meetings", "toplanti"]) {
      const y = await kur({ ad, uyeler: [ajan("Deniz").id] });
      expect(y.statusCode, ad).toBe(409);
      expect(y.json().hata).toMatch(/ArnOrg'un kanallarından birine ayrılmış/);
    }
    for (const ad of ["a/b", "nokta.lı", "x".repeat(41), "   "]) {
      expect((await kur({ ad, uyeler: [ajan("Deniz").id] })).statusCode, ad).toBe(400);
    }
  });

  it("üyeler bu projenin çalışanları olmalı; en az bir üye gerekir", async () => {
    const yabanci = depo.ajanAdla(digerPid, "Lale")!.id;
    const y = await kur({ ad: "karma", uyeler: [ajan("Deniz").id, yabanci] });
    expect(y.statusCode).toBe(400);
    expect(y.json().hata).toBe("Üyeler bu projenin çalışanlarından seçilmeli.");
    expect((await kur({ ad: "karma", uyeler: ["olmayan"] })).statusCode).toBe(400);
    expect((await kur({ ad: "karma", uyeler: [] })).json().hata).toBe("Kanala en az bir üye seçin.");
    expect(kanalOku("karma")).toBeNull();
  });

  it("güncelleme açıklamayı ve üyeleri değiştirir; sistem kanalı düzenlenemez", async () => {
    const y = await app.inject({ method: "PATCH", url: `/api/projeler/${pid}/kanallar/${encodeURIComponent("tasarım-ekibi")}`, headers: h, payload: { aciklama: "Yeni", uyeler: [ajan("Selin").id, ajan("Deniz").id, ajan("Elif").id] } });
    expect(y.statusCode).toBe(200);
    expect(y.json()).toMatchObject({ aciklama: "Yeni", uyeler: [ajan("Selin").id, ajan("Deniz").id, ajan("Elif").id] });
    expect((await app.inject({ method: "PATCH", url: `/api/projeler/${pid}/kanallar/genel`, headers: h, payload: { aciklama: "x" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url: `/api/projeler/${pid}/kanallar/yok`, headers: h, payload: { aciklama: "x" } })).statusCode).toBe(404);
  });

  it("konuşma en az iki üyeyle başlar, durdurulur; tek üyeli kanalda 409", async () => {
    await kur({ ad: "tek", uyeler: [ajan("Deniz").id] });
    const tek = await app.inject({ method: "POST", url: `/api/projeler/${pid}/kanallar/tek/konusma`, headers: h, payload: { islem: "baslat" } });
    expect(tek.statusCode).toBe(409);
    const url = `/api/projeler/${pid}/kanallar/${encodeURIComponent("tasarım-ekibi")}/konusma`;
    const basla = await app.inject({ method: "POST", url, headers: h, payload: { islem: "baslat" } });
    expect(basla.statusCode).toBe(200);
    expect(basla.json()).toMatchObject({ konusma: "suruyor" });
    expect(basla.json().konusmaBaslangic).toMatch(/^\d{4}-/);
    const dur = await app.inject({ method: "POST", url, headers: h, payload: { islem: "durdur" } });
    expect(dur.json()).toMatchObject({ konusma: "durdu" });
    expect((await app.inject({ method: "POST", url, headers: h, payload: { islem: "bekle" } })).statusCode).toBe(400);
  });

  it("konuyla başlayan konuşmada konu kanala kurulun mesajı olarak düşer ve kaydedilir", async () => {
    const url = `/api/projeler/${pid}/kanallar/${encodeURIComponent("tasarım-ekibi")}/konusma`;
    const y = await app.inject({ method: "POST", url, headers: h, payload: { islem: "baslat", konu: "Ana sayfanın ilk taslağı" } });
    expect(y.json()).toMatchObject({ konusma: "suruyor", konu: "Ana sayfanın ilk taslağı" });
    const m = depo.mesajlar(pid, "tasarım-ekibi").at(-1)!;
    expect(m).toMatchObject({ gonderenId: "kurul", metin: "Ana sayfanın ilk taslağı" });
    // Oturumsuz kipte ilk yanıtlayan uyanamaz ve atlanır; sıradaki üye beklerken konuşma durdurulur
    await bekle(60);
    expect(sirket.kanallar.konusma.siradaki(pid, "tasarım-ekibi")).toMatchObject({ asama: "bekliyor" });
    await app.inject({ method: "POST", url, headers: h, payload: { islem: "durdur" } });
    expect(kanalOku("tasarım-ekibi")?.konusma).toBe("durdu");
    expect(sirket.kanallar.konusma.siradaki(pid, "tasarım-ekibi")).toBeNull();
  });

  it("mesajGonder kurul kanalında üyeleri doğrudan uyandırmaz (söz sırası motorda); üye olmayanları uyandırır", () => {
    const deniz = ajan("Deniz");
    const ada = ajan("Ada");
    const alicilar = [deniz, ada];
    expect(sirket.kanallar.dogrudanUyanacaklar(pid, "tasarım-ekibi", "kurul", alicilar).map((a) => a.ad)).toEqual(["Ada"]);
    expect(sirket.kanallar.dogrudanUyanacaklar(pid, "tasarım-ekibi", ajan("Selin").id, alicilar).map((a) => a.ad)).toEqual(["Ada"]);
    // Üye olmayan ajanın andıkları ve sistem kanalındaki anmalar her zamanki gibi uyanır
    expect(sirket.kanallar.dogrudanUyanacaklar(pid, "tasarım-ekibi", ada.id, [deniz]).map((a) => a.ad)).toEqual(["Deniz"]);
    expect(sirket.kanallar.dogrudanUyanacaklar(pid, "genel", "kurul", alicilar)).toHaveLength(2);
  });

  it("işten çıkarılan ajan üyeliklerden düşer", async () => {
    const elif = ajan("Elif").id;
    await sirket.istenCikar(elif, null, "Yönetim kurulu");
    expect(kanalOku("tasarım-ekibi")?.uyeler).not.toContain(elif);
    expect(gelenler.some((o) => o.tur === "kanal.guncellendi" && o.kanal.ad === "tasarım-ekibi" && !o.kanal.uyeler?.includes(elif))).toBe(true);
  });

  it("Mesaiyi durdur süren konuşmaları durdurur", async () => {
    depo.kanalGuncelle(pid, "tasarım-ekibi", { konusma: "suruyor" });
    expect((await app.inject({ method: "POST", url: `/api/projeler/${pid}/durdur`, headers: h })).statusCode).toBe(200);
    expect(kanalOku("tasarım-ekibi")?.konusma).toBe("durdu");
  });

  it("yalnız kurulun kanalı silinir, mesajlarıyla birlikte; sistem kanalı silinemez", async () => {
    await sirket.mesajGonder(pid, "tasarım-ekibi", "kurul", "Silinecek mesaj");
    const once = gelenler.length;
    expect((await app.inject({ method: "DELETE", url: `/api/projeler/${pid}/kanallar/genel`, headers: h })).statusCode).toBe(409);
    expect((await app.inject({ method: "DELETE", url: `/api/projeler/${pid}/kanallar/yonetim`, headers: h })).statusCode).toBe(409);
    const sil = await app.inject({ method: "DELETE", url: `/api/projeler/${pid}/kanallar/${encodeURIComponent("tasarım-ekibi")}`, headers: h });
    expect(sil.json()).toEqual({ tamam: true });
    expect(kanalOku("tasarım-ekibi")).toBeNull();
    expect(depo.mesajlar(pid, "tasarım-ekibi")).toEqual([]);
    expect(gelenler.slice(once).some((o) => o.tur === "kanal.silindi" && o.kanal === "tasarım-ekibi")).toBe(true);
    expect((await app.inject({ method: "DELETE", url: `/api/projeler/${pid}/kanallar/${encodeURIComponent("tasarım-ekibi")}`, headers: h })).statusCode).toBe(404);
  });
});

describe("açılış", () => {
  it("ArnOrg açılınca bütün konuşmalar durmuş başlar", () => {
    depo.kanalGuncelle(pid, "tek", { konusma: "suruyor" });
    const yeni = new OzelKanallar(depo, new OlayYolu(), {
      uyandir: async () => false,
      yaziyor: () => undefined,
      duyur: () => undefined,
      sinirda: () => false,
      siradaMi: () => false,
      kurulMesaji: async () => {
        throw new Error("beklenmedi");
      },
    });
    expect(kanalOku("tek")?.konusma).toBe("durdu");
    yeni.kapat();
  });
});
