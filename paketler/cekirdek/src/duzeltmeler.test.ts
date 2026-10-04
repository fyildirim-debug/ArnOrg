// Düzeltme notları (uygulama içi tarayıcı): ekleme ve görsel, sınırlar, not düzeltme, silme, proje silme ve
// "Hepsini yaptır" ile #yonetim'e giden kurul mesajı. Claude Code oturumu açılmaz; istekler inject ile gider.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KURUL, type Duzeltme, type DuzeltmeGonderimi, type SunucuOlayi } from "@arnorg/ortak";
import { Depo } from "./depo.js";
import { GORSEL_SINIRI, gonderimMetni, pngCoz } from "./duzeltmeler.js";
import { olayProjesi, OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { ArnorgHatasi } from "./yardimci.js";
import { Yapilandirma } from "./yapilandirma.js";

/** 1×1 piksel PNG */
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ANAHTAR = "test-anahtari-duzeltme-0123456789";
/** Sunucu dinlemeye açılmaz; izinli Host adı inject isteklerine verilir */
const HOST = "duzeltme.test";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let app: FastifyInstance;
let pid: string;
let projeYolu: string;
/** Silinmek üzere açılan ikinci proje: en başta açılır ki git'in commit sonrası arka plan işi testler bitmeden sona ersin */
let geciciPid: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];

async function istek(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as Record<string, unknown> | undefined, headers: { host: HOST, authorization: `Bearer ${ANAHTAR}` } });
}

const seciliNot = {
  adres: "http://localhost:5173/sepet",
  sayfaBasligi: "Sepet · Vitrin",
  secici: "main > section.ozet > button.odeme",
  ogeMetni: "Ödemeye  geç",
  ogeHtml: '<button class="odeme">Ödemeye geç</button>',
  stiller: { yaziTipi: '"Inter", sans-serif', boyut: "15px", renk: "rgb(255, 255, 255)", arkaPlan: "rgb(242, 113, 95)" },
  kutu: { x: 24, y: 610, genislik: 342, yukseklik: 48, sayfaX: 24, sayfaY: 1410 },
  gorunum: { genislik: 390, yukseklik: 844 },
  not: "Buton telefonda taşıyor.",
};

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-duzeltme-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Vitrin", yol: path.join(gecici, "vitrin"), olustur: true });
  pid = p.id;
  projeYolu = p.yol;
  geciciPid = (await sirket.projeOlustur({ ad: "Geçici", yol: path.join(gecici, "gecici"), olustur: true })).id;
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: ANAHTAR, studyoDizini: null, izinliHostlar: [HOST] });
});

afterAll(async () => {
  await app.close();
  sirket.kapat();
  depo.kapat();
  // Windows yeni açılan git deposunun klasörünü kısa süre kilitli tutabilir (EBUSY); silme yeniden denenir. Yine de
  // silinemezse klasörü tutan süreçler kayda yazılır ve hata yükselir (sızan bir tanıtıcı gizlenmesin)
  try {
    fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch (h) {
    if (process.platform === "win32") {
      try {
        const surecler = execFileSync(
          "powershell",
          ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'git|arnorg' } | Select-Object ProcessId,ParentProcessId,CommandLine | Format-List | Out-String -Width 400"],
          { encoding: "utf8", windowsHide: true },
        );
        console.error(`Klasörü tutabilecek süreçler:\n${surecler}`);
      } catch {
        // tanı alınamadı
      }
    }
    throw h;
  }
}, 30_000);

describe("görsel denetimi", () => {
  it("data: önekli ve öneksiz PNG'yi çözer", () => {
    const beklenen = Buffer.from(PNG_1X1, "base64");
    expect(pngCoz(PNG_1X1)).toEqual(beklenen);
    expect(pngCoz(`data:image/png;base64,${PNG_1X1}`)).toEqual(beklenen);
  });

  it("boyut sınırını çözmeden önce uygular (413)", () => {
    let hata: unknown;
    try {
      pngCoz(PNG_1X1, 32);
    } catch (h) {
      hata = h;
    }
    expect(hata).toBeInstanceOf(ArnorgHatasi);
    expect((hata as ArnorgHatasi).durumKodu).toBe(413);
    expect((hata as Error).message).toMatch(/çok büyük/);
  });

  it("PNG olmayanı ve bozuk base64'ü reddeder (400)", () => {
    const metin = Buffer.from("bu bir resim değil, yalnız metin; PNG imzası yok").toString("base64");
    expect(() => pngCoz(metin)).toThrow(/PNG değil/);
    expect(() => pngCoz("%%%")).toThrow(/base64/);
    expect(() => pngCoz("")).toThrow(/base64/);
  });
});

describe("düzeltme notları API", () => {
  let secili: Duzeltme;

  it("görselli notu ekler: PNG .arnorg/duzeltmeler'e yazılır, klasör commit'lenmez, olay yayınlanır", async () => {
    const yanit = await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { ...seciliNot, gorsel: `data:image/png;base64,${PNG_1X1}` });
    expect(yanit.statusCode).toBe(200);
    secili = yanit.json() as Duzeltme;
    expect(secili).toMatchObject({ projeId: pid, durum: "acik", secici: seciliNot.secici, not: seciliNot.not, gorunum: { genislik: 390, yukseklik: 844 }, gonderimZamani: null });
    expect(secili.kutu).toEqual(seciliNot.kutu);
    expect(secili.stiller).toEqual(seciliNot.stiller);
    const dizin = path.join(projeYolu, ".arnorg", "duzeltmeler");
    expect(secili.gorsel).toBe(path.join(dizin, `${secili.id}.png`));
    expect(fs.readFileSync(secili.gorsel!)).toEqual(Buffer.from(PNG_1X1, "base64"));
    expect(fs.readFileSync(path.join(dizin, ".gitignore"), "utf8")).toMatch(/^\*$/m);
    expect(gelenler.some((o) => o.tur === "duzeltme.guncellendi" && o.duzeltme.id === secili.id && o.projeId === pid)).toBe(true);

    const gorsel = await istek("GET", `/api/duzeltmeler/${secili.id}/gorsel`);
    expect(gorsel.statusCode).toBe(200);
    expect(gorsel.headers["content-type"]).toBe("image/png");
    expect(gorsel.rawPayload).toEqual(Buffer.from(PNG_1X1, "base64"));
  });

  it("elle eklenen (seçicisiz, görselsiz) notu kabul eder; listede eklenme sırasıyla durur", async () => {
    const yanit = await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { adres: "https://ornek.com/", not: "Başlık çok büyük.\n  Logo da küçük." });
    expect(yanit.statusCode).toBe(200);
    expect(yanit.json()).toMatchObject({ secici: null, gorsel: null, kutu: null, durum: "acik" });
    const liste = (await istek("GET", `/api/projeler/${pid}/duzeltmeler`)).json() as Duzeltme[];
    expect(liste.map((d) => d.adres)).toEqual(["http://localhost:5173/sepet", "https://ornek.com/"]);
    expect((await istek("GET", `/api/duzeltmeler/${liste[1]!.id}/gorsel`)).statusCode).toBe(404);
  });

  it("geçersiz istekleri reddeder; başarısız istek kayıt ve dosya bırakmaz", async () => {
    const once = fs.readdirSync(path.join(projeYolu, ".arnorg", "duzeltmeler")).length;
    expect((await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { adres: "http://a.b/", not: "  " })).statusCode).toBe(400);
    const js = await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { adres: "javascript:alert(1)", not: "x" });
    expect(js.statusCode).toBe(400);
    expect(js.json()).toEqual({ hata: "Adres http:// ya da https:// ile başlayan geçerli bir adres olmalı." });
    const metin = Buffer.from("PNG değil ama base64").toString("base64");
    expect((await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { ...seciliNot, gorsel: metin })).statusCode).toBe(400);
    expect((await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { ...seciliNot, ogeHtml: "x".repeat(2001) })).statusCode).toBe(400);
    expect((await istek("POST", `/api/projeler/yok/duzeltmeler`, seciliNot)).statusCode).toBe(404);
    // Sınırı aşan görsel: gövde uca ulaşır, görsel çözülmeden 413 döner
    const buyuk = "iVBORw0KGgo" + "A".repeat(Math.ceil(((GORSEL_SINIRI + 64) * 4) / 3) - 11);
    const asan = await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { ...seciliNot, gorsel: buyuk });
    expect(asan.statusCode).toBe(413);
    expect(asan.json().hata).toMatch(/çok büyük/);
    expect(((await istek("GET", `/api/projeler/${pid}/duzeltmeler`)).json() as Duzeltme[]).length).toBe(2);
    expect(fs.readdirSync(path.join(projeYolu, ".arnorg", "duzeltmeler")).length).toBe(once);
  });

  it("açık notun metnini düzeltir", async () => {
    const yanit = await istek("PATCH", `/api/duzeltmeler/${secili.id}`, { not: "  Buton telefonda taşıyor; sağ kenara yapışık.  " });
    expect(yanit.statusCode).toBe(200);
    expect((yanit.json() as Duzeltme).not).toBe("Buton telefonda taşıyor; sağ kenara yapışık.");
    expect((await istek("PATCH", `/api/duzeltmeler/yok`, { not: "x" })).statusCode).toBe(404);
  });

  it("Hepsini yaptır: açık notlar tek kurul mesajıyla #yonetim'e gider, notlar gönderildi olur", async () => {
    const yanit = await istek("POST", `/api/projeler/${pid}/duzeltmeler/gonder`);
    expect(yanit.statusCode).toBe(200);
    const g = yanit.json() as DuzeltmeGonderimi;
    expect(g.mesaj).toMatchObject({ projeId: pid, kanal: "yonetim", gonderenId: KURUL });
    const satirlar = g.mesaj.metin.split("\n");
    expect(satirlar[0]).toBe("Tarayıcıda 2 düzeltme notu bıraktım. Her biri için görev aç (kabul ölçütüyle), uygun çalışana ata ve başlat.");
    expect(satirlar[1]).toBe("");
    expect(satirlar[2]).toBe(
      `1) http://localhost:5173/sepet · öğe: main > section.ozet > button.odeme · "Ödemeye geç" · görünüm: 390×844 · not: Buton telefonda taşıyor; sağ kenara yapışık. · ekran görüntüsü: ${secili.gorsel}`,
    );
    expect(satirlar[3]).toBe("2) https://ornek.com/ · not: Başlık çok büyük. / Logo da küçük.");
    expect(path.isAbsolute(secili.gorsel!)).toBe(true);
    // Mesaj #yonetim'de (Karargâh'taki CEO sohbeti) görünür
    expect(depo.mesajlar(pid, "yonetim").at(-1)?.id).toBe(g.mesaj.id);
    expect(g.gonderilen.map((d) => d.durum)).toEqual(["gonderildi", "gonderildi"]);
    expect(g.gonderilen.every((d) => d.gonderimZamani)).toBe(true);
    expect(gelenler.filter((o) => o.tur === "duzeltme.guncellendi" && o.duzeltme.durum === "gonderildi").length).toBe(2);

    // Gönderilecek not kalmadı
    const bos = await istek("POST", `/api/projeler/${pid}/duzeltmeler/gonder`);
    expect(bos.statusCode).toBe(400);
    expect(bos.json()).toEqual({ hata: "Gönderilecek açık not yok." });
    // Gönderilmiş not değişmez
    expect((await istek("PATCH", `/api/duzeltmeler/${secili.id}`, { not: "değişmesin" })).statusCode).toBe(409);
    expect(((await istek("GET", `/api/projeler/${pid}/duzeltmeler?durum=acik`)).json() as Duzeltme[]).length).toBe(0);
    expect(((await istek("GET", `/api/projeler/${pid}/duzeltmeler?durum=gonderildi`)).json() as Duzeltme[]).length).toBe(2);
  });

  it("silme: açık notun görüntüsü de gider, gönderilmiş notunki kalır", async () => {
    const acik = (await istek("POST", `/api/projeler/${pid}/duzeltmeler`, { ...seciliNot, gorsel: PNG_1X1 })).json() as Duzeltme;
    expect(fs.existsSync(acik.gorsel!)).toBe(true);
    expect((await istek("DELETE", `/api/duzeltmeler/${acik.id}`)).statusCode).toBe(200);
    expect(fs.existsSync(acik.gorsel!)).toBe(false);
    expect(gelenler.some((o) => o.tur === "duzeltme.silindi" && o.id === acik.id && o.projeId === pid)).toBe(true);

    expect((await istek("DELETE", `/api/duzeltmeler/${secili.id}`)).statusCode).toBe(200);
    expect(fs.existsSync(secili.gorsel!)).toBe(true);
    expect((await istek("DELETE", `/api/duzeltmeler/${secili.id}`)).statusCode).toBe(404);
  });

  it("olaylar notun projesine gider", () => {
    expect(olayProjesi({ tur: "duzeltme.silindi", projeId: pid, id: "x" })).toBe(pid);
    const o = gelenler.find((x) => x.tur === "duzeltme.guncellendi");
    expect(o && olayProjesi(o)).toBe(pid);
  });

  it("proje silinince notları da silinir", async () => {
    await istek("POST", `/api/projeler/${geciciPid}/duzeltmeler`, { adres: "http://localhost:3000/", not: "Silinecek" });
    const say = () => (depo.db.prepare("SELECT count(*) n FROM duzeltmeler WHERE proje_id = ?").get(geciciPid) as { n: number }).n;
    expect(say()).toBe(1);
    sirket.projeSil(geciciPid);
    expect(say()).toBe(0);
  });
});

describe("gönderim metni", () => {
  const not = (ek: Partial<Duzeltme>): Duzeltme => ({
    id: "d1",
    projeId: "p",
    adres: "http://localhost:5173/",
    sayfaBasligi: "",
    secici: null,
    ogeMetni: null,
    ogeHtml: null,
    stiller: null,
    kutu: null,
    gorunum: null,
    not: "Not",
    gorsel: null,
    durum: "acik",
    zaman: "2026-10-04T10:00:00.000Z",
    gonderimZamani: null,
    ...ek,
  });

  it("tek notta tekil konuşur; öğe metnindeki tırnak ve satır sonları satırı bozmaz", () => {
    const metin = gonderimMetni([not({ secici: "h1", ogeMetni: 'Merhaba "dünya"\nikinci satır', not: "Çok büyük" })]);
    expect(metin).toBe(
      'Tarayıcıda 1 düzeltme notu bıraktım. Bunun için görev aç (kabul ölçütüyle), uygun çalışana ata ve başlat.\n\n1) http://localhost:5173/ · öğe: h1 · "Merhaba \'dünya\' / ikinci satır" · not: Çok büyük',
    );
  });

  it("İngilizcede aynı yapıyı kurar", () => {
    sirket.yapilandirma.guncelle({ dil: "en" });
    try {
      const metin = gonderimMetni([
        not({ secici: "nav a", ogeMetni: "Home", gorunum: { genislik: 768, yukseklik: 1024 }, gorsel: "/p/.arnorg/duzeltmeler/d1.png", not: "Too small" }),
        not({ id: "d2", adres: "https://example.com/", not: "Wrong colour" }),
      ]);
      expect(metin).toBe(
        "I left 2 correction notes in the browser. Open a task for each (with acceptance criteria), assign it to the right employee and start it.\n\n" +
          '1) http://localhost:5173/ · element: nav a · "Home" · viewport: 768×1024 · note: Too small · screenshot: /p/.arnorg/duzeltmeler/d1.png\n' +
          "2) https://example.com/ · note: Wrong colour",
      );
    } finally {
      sirket.yapilandirma.guncelle({ dil: "tr" });
    }
  });
});
