// Yerleşik meta arama: motor ayrıştırıcıları (gerçek yanıtlardan ve bilinen biçimlerden fikstürler), birleştirme,
// puanlama, tekilleştirme, askıya alma ve önbellek. Ağa çıkılmaz: getirici sahtedir.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WebAyarlari } from "@arnorg/ortak";
import { adresAnahtari, adresiTemizle } from "./adres.js";
import { askiSuresi, COK_ISTEK_ASKISI_MS, ENGEL_ASKISI_MS, MOTORLAR, sonuclariBirlestir, WebArama } from "./arama.js";
import { depoSonuclari, githubIstegi } from "./github-api.js";
import { AgHatasi, yanitYap, type Getirici } from "./http.js";
import { MOTOR_KIMLIKLERI } from "./motor-kimlikleri.js";
import { bing, bingAdresiCoz, bingAyristir, bingHaberAyristir, bingIstegi } from "./motorlar/bing.js";
import { braveAyristir } from "./motorlar/brave.js";
import { duckduckgo, duckduckgoAdresiCoz, duckduckgoAyristir, duckduckgoIstegi } from "./motorlar/duckduckgo.js";
import { mojeekAyristir } from "./motorlar/mojeek.js";
import { alakaliMi, MotorHatasi, type Motor, type MotorSonucu } from "./motorlar/ortak.js";
import { stackoverflow, stackoverflowAyristir } from "./motorlar/stackoverflow.js";
import { arxivAyristir, arxivSorgusu, hackernewsAyristir, mdnAyristir, npmAyristir, searxngAyristir, searxngIstegi } from "./motorlar/teknik.js";
import { wikipediaAdresi, wikipediaAyristir } from "./motorlar/wikipedia.js";

const fikstur = (ad: string) => fs.readFileSync(fileURLToPath(new URL(`./fikstur/${ad}`, import.meta.url)), "utf8");
const json = <T = unknown>(ad: string) => JSON.parse(fikstur(ad)) as T;
const istek = { sorgu: "electron updater", sayfa: 1, dil: "en" as const, kategori: "genel" as const };

describe("motor ayrıştırıcıları", () => {
  it("Bing: sonuçları okur, bing.com/ck/a yönlendirmesini çözer", () => {
    const r = bingAyristir(fikstur("bing.html"));
    expect(r).toHaveLength(4);
    expect(r[0]).toMatchObject({ baslik: "Build cross-platform desktop apps with JavaScript, HTML, and CSS | Electron", adres: "https://www.electronjs.org/" });
    expect(r[3]!.adres).toBe("https://github.com/electron/electron");
    expect(r.every((x) => x.ozet.length > 20 && !x.adres.includes("bing.com"))).toBe(true);
    const kodlu = Buffer.from("https://ornek.com/yol?a=1").toString("base64url");
    expect(bingAdresiCoz(`https://www.bing.com/ck/a?!&&p=abc&u=a1${kodlu}&ntb=1`)).toBe("https://ornek.com/yol?a=1");
    expect(bingAdresiCoz("https://ornek.com/x")).toBe("https://ornek.com/x");
  });

  it("Bing: sayfa ve pazar SearXNG'deki gibi verilir", () => {
    const i = bingIstegi({ ...istek, sayfa: 3, dil: "tr" });
    const u = new URL(i.adres);
    expect(u.searchParams.get("first")).toBe("21");
    expect(u.searchParams.get("FORM")).toBe("PERE1");
    expect(u.searchParams.get("pq")).toBe("electron updater");
    expect(i.basliklar.Cookie).toContain("mkt=tr-TR");
    expect(i.basliklar["Accept-Language"]).toMatch(/^tr-TR/);
    expect(new URL(bingIstegi(istek).adres).searchParams.has("first")).toBe(false);
  });

  it("Bing Haberler: RSS'i okur, apiclick bağlantısını açar, tarihi çevirir", () => {
    const r = bingHaberAyristir(fikstur("bing-haber.xml"));
    expect(r).toHaveLength(3);
    expect(r[0]!.adres).toMatch(/^https:\/\/www\.msn\.com\//);
    expect(r[0]!.tarih).toBe("2026-10-03T12:47:01.000Z");
    expect(r[0]!.ozet).toContain("The Motley Fool on MSN");
  });

  it("DuckDuckGo: sonuçları okur; anomali sayfası CAPTCHA hatasıdır", () => {
    const r = duckduckgoAyristir(fikstur("duckduckgo.html"));
    expect(r.map((x) => x.adres)).toEqual(["https://www.npmjs.com/package/electron-updater", "https://www.electronjs.org/docs/latest/tutorial/updates", "https://www.electron.build/docs/api/electron-updater/"]);
    expect(r[0]!.ozet).toContain("update your electron application");
    expect(() => duckduckgoAyristir(fikstur("duckduckgo-anomali.html"))).toThrow(MotorHatasi);
    try {
      duckduckgoAyristir(fikstur("duckduckgo-anomali.html"));
    } catch (h) {
      expect((h as MotorHatasi).tur).toBe("captcha");
    }
    expect(duckduckgoAdresiCoz("//duckduckgo.com/l/?uddg=https%3A%2F%2Fornek.com%2Fa&rut=x")).toBe("https://ornek.com/a");
    const i = duckduckgoIstegi({ ...istek, dil: "tr" });
    expect(new URLSearchParams(i.govde).get("kl")).toBe("tr-tr");
    expect(i.basliklar["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("DuckDuckGo: 202 yanıtı askıya alınacak CAPTCHA hatasıdır, ikinci sayfa sorgulanmaz", async () => {
    let cagri = 0;
    const getir: Getirici = async () => (cagri++, yanitYap(202, "<html><body>bekleyin</body></html>"));
    const ortam = { getir, gh: null, searxngAdresi: null, zamanAsimiMs: 1000 };
    await expect(duckduckgo.ara(istek, ortam)).rejects.toMatchObject({ tur: "captcha" });
    expect(await duckduckgo.ara({ ...istek, sayfa: 2 }, ortam)).toEqual([]);
    expect(cagri).toBe(1);
  });

  it("Brave: web sonuçlarını okur, video kutusunu atlar", () => {
    const r = braveAyristir(fikstur("brave.html"));
    expect(r.map((x) => x.baslik)).toEqual([
      "Auto Update - electron-builder",
      "Private GitHub repository updates · Issue #2222 · electron-userland/electron-builder",
      "Updating Applications | Electron",
    ]);
    expect(r[1]!.ozet).toContain("proxy update server");
  });

  it("Mojeek: sonuçları okur; otomatik sorgu sayfası engeldir", () => {
    const r = mojeekAyristir(fikstur("mojeek.html"));
    expect(r).toEqual([
      { baslik: "Auto Update - electron-builder", adres: "https://www.electron.build/auto-update", ozet: expect.stringContaining("electron-updater module") },
      { baslik: "electron-updater - npm", adres: "https://www.npmjs.com/package/electron-updater", ozet: "Cross platform updater for electron applications." },
    ]);
    expect(() => mojeekAyristir(fikstur("mojeek-engel.html"))).toThrow(expect.objectContaining({ tur: "engel" }));
  });

  it("Wikipedia: arama sonuçları dil alt alan adıyla makale adresine döner", () => {
    const r = wikipediaAyristir(json("wikipedia.json"), "en");
    expect(r[0]).toMatchObject({ baslik: "Electron (software framework)", adres: "https://en.wikipedia.org/wiki/Electron_(software_framework)", tarih: "2026-09-14T08:12:44.000Z" });
    expect(r[0]!.ozet).toMatch(/^Electron \(formerly known as Atom Shell\)/);
    expect(r[1]).toMatchObject({ adres: "https://en.wikipedia.org/wiki/AC/DC", ozet: "AC/DC are an Australian rock band & more" });
    expect(wikipediaAdresi("tr", "Türkiye Cumhuriyeti")).toBe("https://tr.wikipedia.org/wiki/T%C3%BCrkiye_Cumhuriyeti");
    expect(() => wikipediaAyristir({ error: { code: "ratelimited", info: "too many" } }, "en")).toThrow(expect.objectContaining({ tur: "cok_istek" }));
  });

  it("Stack Overflow: başlığı çözer, skor ve yanıt sayısını özete yazar; kısıtlama çok istek hatasıdır", () => {
    const r = stackoverflowAyristir(json("stackoverflow.json"));
    expect(r).toHaveLength(2);
    expect(r[0]!.adres).toBe("https://stackoverflow.com/questions/72139735/electron-autoupdater-is-not-fetching-releases-from-private-repository");
    expect(r[0]!.ozet).toMatch(/^skor 0 · 1 yanıt · \[javascript/);
    expect(r[0]!.tarih).toBe("2022-05-24T06:22:54.000Z");
    expect(() => stackoverflowAyristir({ error_id: 502, error_name: "throttle_violation", error_message: "too many requests from this IP" })).toThrow(expect.objectContaining({ tur: "cok_istek" }));
  });

  it("Stack Overflow: 400 gövdesindeki kısıtlama hatası okunur", async () => {
    const getir: Getirici = async () => yanitYap(400, JSON.stringify({ error_id: 502, error_name: "throttle_violation", error_message: "x" }), { "content-type": "application/json" });
    await expect(stackoverflow.ara(istek, { getir, gh: null, searxngAdresi: null, zamanAsimiMs: 1000 })).rejects.toMatchObject({ tur: "cok_istek" });
  });

  it("GitHub, npm, MDN, Hacker News ve arXiv yanıtları", () => {
    const gh = depoSonuclari(json("github-depolar.json"));
    expect(gh[0]).toMatchObject({ baslik: "electron-userland/electron-builder", adres: "https://github.com/electron-userland/electron-builder" });
    expect(gh[0]!.ozet).toMatch(/^★ 14\.012 · TypeScript · A complete solution/);
    expect(gh[1]!.ozet).toContain("arşivlenmiş");

    const n = npmAyristir(json("npm.json"));
    expect(n[1]).toMatchObject({ baslik: "electron-updater@6.8.9", adres: "https://www.npmjs.com/package/electron-updater" });
    expect(n[1]!.ozet).toMatch(/haftalık 4\.422\.781 indirme$/);

    const m = mdnAyristir(json("mdn.json"));
    expect(m[1]).toMatchObject({ baslik: "AbortController: abort() method", adres: "https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort" });

    const hn = hackernewsAyristir(json("hackernews.json"));
    expect(hn[0]!.adres).toBe("https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html");
    expect(hn[0]!.ozet).toContain("tartışma: https://news.ycombinator.com/item?id=22406613");
    // Adresi olmayan hikâye tartışma sayfasına gider, metni özete girer
    expect(hn[2]!.adres).toBe("https://news.ycombinator.com/item?id=46132119");
    expect(hn[2]!.ozet).toContain("Ask HN: how do you ship private Electron updates?");

    const ax = arxivAyristir(fikstur("arxiv.xml"));
    expect(ax).toHaveLength(2);
    expect(ax[0]).toMatchObject({ baslik: "AR-RAG: Autoregressive Retrieval Augmentation for Image Generation", adres: "https://arxiv.org/abs/2506.06962v3", tarih: "2025-06-08T01:33:05.000Z" });
    expect(ax[0]!.ozet).toMatch(/^Jingyuan Qi, Zhiyang Xu, Qifan Wang ve diğerleri — We introduce/);
    expect(arxivSorgusu("retrieval augmented")).toBe("all:retrieval AND all:augmented");
    expect(arxivSorgusu('"retrieval augmented"')).toBe('all:"retrieval augmented"');
  });

  it("SearXNG: JSON sonuçlarını okur, http(s) olmayanı atar, kategori eşlenir", () => {
    const r = searxngAyristir(json("searxng.json"));
    expect(r.map((x) => x.adres)).toEqual(["https://www.electron.build/auto-update", "https://example.org/blog/electron-updates"]);
    expect(r[1]!.tarih).toBe(new Date("2026-01-15T00:00:00").toISOString());
    const u = new URL(searxngIstegi("https://searx.ornek.org/", { ...istek, kategori: "kod", sayfa: 2 }));
    expect(u.pathname).toBe("/search");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ q: "electron updater", format: "json", pageno: "2", categories: "it,general" });
  });

  it("motor kimlik listesi motorlarla aynı", () => {
    expect(MOTORLAR.map((m) => m.kimlik)).toEqual([...MOTOR_KIMLIKLERI]);
  });
});

describe("adres normal biçimi", () => {
  it("www, http/https, sondaki /, izleme parametreleri ve parametre sırası yok sayılır", () => {
    const a = adresAnahtari("https://www.Ornek.com/yazi/?utm_source=x&b=2&a=1#bolum");
    expect(a).toBe(adresAnahtari("http://ornek.com/yazi?a=1&b=2&fbclid=abc"));
    expect(a).toBe("ornek.com/yazi?a=1&b=2");
    expect(adresAnahtari("https://ornek.com/%C3%A7ay")).toBe(adresAnahtari("https://ornek.com/çay/"));
    expect(adresAnahtari("https://ornek.com/a")).not.toBe(adresAnahtari("https://ornek.com/b"));
    expect(adresiTemizle("https://ornek.com/x?utm_medium=y&q=1#z")).toBe("https://ornek.com/x?q=1");
  });
});

describe("birleştirme ve puanlama", () => {
  const sonuc = (adres: string, baslik = adres, ozet = ""): MotorSonucu => ({ adres, baslik, ozet });

  it("aynı adres tek sonuç olur, puan Σ ağırlık / sıra", () => {
    const r = sonuclariBirlestir([
      { motor: { kimlik: "a", agirlik: 1 }, sonuclar: [sonuc("https://x.com/1"), sonuc("http://www.ortak.com/yazi/", "Ortak", "kısa")] },
      { motor: { kimlik: "b", agirlik: 2 }, sonuclar: [sonuc("https://ortak.com/yazi?utm_source=b", "Ortak", "daha uzun bir özet"), sonuc("https://y.com/2")] },
    ]);
    expect(r.map((x) => x.adres)).toEqual(["https://ortak.com/yazi", "https://x.com/1", "https://y.com/2"]);
    // a: 1/2 + b: 2/1
    expect(r[0]!.puan).toBe(2.5);
    expect(r[0]!.motorlar).toEqual(["b", "a"]);
    expect(r[0]!.ozet).toBe("daha uzun bir özet");
    expect(r[1]!.puan).toBe(1);
    expect(r[2]!.puan).toBe(1);
  });

  it("eşit puanda daha iyi sırada görülen önce gelir; aynı motorun tekrarı sayılmaz", () => {
    const r = sonuclariBirlestir([
      { motor: { kimlik: "a", agirlik: 1 }, sonuclar: [sonuc("https://a.com/"), sonuc("https://b.com/"), sonuc("https://a.com")] },
      { motor: { kimlik: "b", agirlik: 0.5 }, sonuclar: [sonuc("https://c.com/")] },
    ]);
    // b.com ve c.com eşit puanlı (0,5); c.com kendi motorunda 1. sırada olduğu için önce gelir
    expect(r.map((x) => [x.adres, x.puan])).toEqual([
      ["https://a.com/", 1],
      ["https://c.com/", 0.5],
      ["https://b.com/", 0.5],
    ]);
  });

  it("alaka denetimi: sorgu sözcükleri hiçbir sonuçta yoksa sonuçlar ilgisiz sayılır", () => {
    const ilgisiz = ["Toyota Camry", "Used cars", "Car dealers", "Sedan reviews"].map((b, i) => sonuc(`https://araba${i}.com/`, b, "araba"));
    expect(alakaliMi("vitest windows path separator", ilgisiz)).toBe(false);
    expect(alakaliMi("vitest windows path separator", [...ilgisiz, sonuc("https://vitest.dev/", "Vitest config")])).toBe(true);
    expect(alakaliMi("Güncelleme sunucusu", [...ilgisiz.slice(0, 3), sonuc("https://x.com/guncelleme", "x")])).toBe(true);
    expect(alakaliMi("a b", ilgisiz)).toBe(true);
  });
});

/** Sahte motor: sonuç ya da hata döndürür, çağrıları sayar */
function sahteMotor(kimlik: string, davranis: () => MotorSonucu[] | Promise<MotorSonucu[]>, ek: Partial<Motor> = {}): Motor & { cagri: number } {
  const m = {
    kimlik,
    ad: kimlik,
    tur: "genel" as const,
    kategoriler: ["genel", "kod"] as const,
    agirlik: 1,
    cagri: 0,
    async ara() {
      m.cagri++;
      return davranis();
    },
    ...ek,
  };
  return m;
}

function aramaKur(motorlar: Motor[], ayar: Partial<WebAyarlari> = {}) {
  let saat = 1_000_000;
  const ayarlar: WebAyarlari = { searxngAdresi: null, disOkuyucu: true, kapaliMotorlar: [], ...ayar };
  const arama = new WebArama({ ayarlar: () => ayarlar, dil: () => "tr", getir: async () => yanitYap(500, ""), gh: () => null, simdi: () => saat, motorlar, zamanAsimiMs: 500 });
  return { arama, ayarlar, ilerlet: (ms: number) => (saat += ms) };
}

describe("meta arama", () => {
  const iyi = (onek: string) => () => [{ baslik: `${onek} electron`, adres: `https://${onek}.com/electron`, ozet: "electron" }];

  it("bir motorun düşmesi aramayı bozmaz; 429 motoru 10 dakika askıya alır", async () => {
    const a = sahteMotor("a", iyi("a"));
    const b = sahteMotor("b", () => {
      throw new MotorHatasi("cok_istek", "429");
    });
    const { arama, ilerlet } = aramaKur([a, b]);
    const y = await arama.ara({ sorgu: "electron" });
    expect(y.sonuclar.map((r) => r.adres)).toEqual(["https://a.com/electron"]);
    expect(y.yanitVerenler).toEqual(["a"]);
    expect(y.hatalar).toEqual([{ motor: "b", hata: "429" }]);
    expect(arama.durum().find((d) => d.kimlik === "b")).toMatchObject({ askida: true, sonHata: "429", hata: 1 });

    ilerlet(COK_ISTEK_ASKISI_MS - 1000);
    const y2 = await arama.ara({ sorgu: "electron 2" });
    expect(y2.askidakiler).toEqual(["b"]);
    expect(b.cagri).toBe(1);

    ilerlet(2000);
    await arama.ara({ sorgu: "electron 3" });
    expect(b.cagri).toBe(2);
  });

  it("403 ve CAPTCHA 1 saat, zaman aşımı artan kısa askı", async () => {
    expect(askiSuresi("engel", 1)).toBe(ENGEL_ASKISI_MS);
    expect(askiSuresi("captcha", 1)).toBe(60 * 60_000);
    expect(askiSuresi("cok_istek", 3)).toBe(10 * 60_000);
    expect(askiSuresi("zaman_asimi", 1)).toBe(5000);
    expect(askiSuresi("ag", 3)).toBe(15_000);
    expect(askiSuresi("http", 100)).toBe(120_000);
    expect(askiSuresi("cozumleme", 5)).toBe(0);

    const c = sahteMotor("c", () => {
      throw new MotorHatasi("captcha", "anomaly");
    });
    const { arama, ilerlet } = aramaKur([c, sahteMotor("a", iyi("a"))]);
    await arama.ara({ sorgu: "x" });
    ilerlet(59 * 60_000);
    expect((await arama.ara({ sorgu: "y" })).askidakiler).toEqual(["c"]);
    ilerlet(2 * 60_000);
    expect((await arama.ara({ sorgu: "z" })).askidakiler).toEqual([]);
  });

  it("ağ hatası ve süresini aşan motor yakalanır", async () => {
    const yavas = sahteMotor("yavas", () => new Promise<MotorSonucu[]>(() => undefined));
    const kopuk = sahteMotor("kopuk", () => {
      throw new AgHatasi("ag", "ECONNRESET");
    });
    const { arama } = aramaKur([yavas, kopuk, sahteMotor("a", iyi("a"))]);
    const y = await arama.ara({ sorgu: "electron" });
    expect(y.yanitVerenler).toEqual(["a"]);
    expect(y.hatalar.map((h) => h.motor).sort()).toEqual(["kopuk", "yavas"]);
    expect(arama.durum().find((d) => d.kimlik === "yavas")!.askida).toBe(true);
  }, 10_000);

  it("başarı ardışık hatayı ve askıyı sıfırlar", async () => {
    let bozuk = true;
    const m = sahteMotor("m", () => {
      if (bozuk) throw new MotorHatasi("http", "503");
      return iyi("m")();
    });
    const { arama, ilerlet } = aramaKur([m]);
    await arama.ara({ sorgu: "a" });
    bozuk = false;
    ilerlet(6000);
    const y = await arama.ara({ sorgu: "b" });
    expect(y.yanitVerenler).toEqual(["m"]);
    expect(arama.durum()[0]).toMatchObject({ askida: false, basari: 1, hata: 1 });
  });

  it("aynı sorgu 10 dakika önbellekten gelir; eşzamanlı tekrarında tek istek gider", async () => {
    const m = sahteMotor("m", async () => {
      await new Promise((r) => setTimeout(r, 20));
      return iyi("m")();
    });
    const { arama, ilerlet } = aramaKur([m]);
    const [x, y] = await Promise.all([arama.ara({ sorgu: "Electron" }), arama.ara({ sorgu: "electron " })]);
    expect(m.cagri).toBe(1);
    expect(x.sonuclar).toEqual(y.sonuclar);
    const z = await arama.ara({ sorgu: "electron" });
    expect(z.onbellekten).toBe(true);
    expect(m.cagri).toBe(1);
    // Kategori ya da sayfa farklıysa ayrı sorgudur
    await arama.ara({ sorgu: "electron", sayfa: 2 });
    expect(m.cagri).toBe(2);
    ilerlet(10 * 60_000 + 1);
    expect((await arama.ara({ sorgu: "electron" })).onbellekten).toBe(false);
    expect(m.cagri).toBe(3);
  });

  it("hiçbir motor yanıt vermezse önbelleğe girmez", async () => {
    let bozuk = true;
    const m = sahteMotor("m", () => {
      if (bozuk) throw new MotorHatasi("cozumleme", "bozuk");
      return iyi("m")();
    });
    const { arama } = aramaKur([m]);
    expect((await arama.ara({ sorgu: "q" })).sonuclar).toEqual([]);
    bozuk = false;
    expect((await arama.ara({ sorgu: "q" })).sonuclar).toHaveLength(1);
  });

  it("kurulun kapattığı motor sorgulanmaz; SearXNG yalnız adres varken; kategori seçimi", async () => {
    const a = sahteMotor("a", iyi("a"));
    const kapali = sahteMotor("kapali", iyi("k"));
    const dis = sahteMotor("searxng", iyi("s"), { tur: "dis", kategoriler: ["genel", "kod", "haber", "bilim"] });
    const bilim = sahteMotor("bilim", iyi("b"), { kategoriler: ["bilim"] });
    const { arama, ayarlar } = aramaKur([a, kapali, dis, bilim], { kapaliMotorlar: ["kapali"] });
    expect((await arama.ara({ sorgu: "q" })).yanitVerenler).toEqual(["a"]);
    ayarlar.searxngAdresi = "https://searx.ornek.org";
    expect((await arama.ara({ sorgu: "q2" })).yanitVerenler).toEqual(["a", "searxng"]);
    expect((await arama.ara({ sorgu: "q3", kategori: "bilim" })).yanitVerenler).toEqual(["searxng", "bilim"]);
    expect(kapali.cagri).toBe(0);
    expect(arama.durum().find((d) => d.kimlik === "kapali")!.etkin).toBe(false);
  });

  it("ilgisiz sonuç döndüren genel motorun sonuçları ayıklanır, askıya alınmaz", async () => {
    const zehirli = sahteMotor("bing", () => ["Toyota", "Cars", "Dealers", "Reviews"].map((b, i) => ({ baslik: b, adres: `https://araba${i}.com/`, ozet: "araba" })), { alakaDenetimi: true });
    const { arama } = aramaKur([zehirli, sahteMotor("a", iyi("a"))]);
    const y = await arama.ara({ sorgu: "electron updater" });
    expect(y.sonuclar.map((r) => r.adres)).toEqual(["https://a.com/electron"]);
    expect(y.hatalar.map((h) => h.motor)).toEqual(["bing"]);
    expect(arama.durum().find((d) => d.kimlik === "bing")!.askida).toBe(false);
  });

  it("boş ve çok uzun sorgu reddedilir", async () => {
    const { arama } = aramaKur([sahteMotor("a", iyi("a"))]);
    await expect(arama.ara({ sorgu: "   " })).rejects.toThrow(/boş/);
    await expect(arama.ara({ sorgu: "x".repeat(501) })).rejects.toThrow(/500/);
  });
});

describe("gerçek motorlar sahte ağla", () => {
  /** Alan adına göre fikstür döndüren getirici; erişilemeyen motorlar bu kaptaki gibi yanıt verir */
  const getir: Getirici = async (adres) => {
    const u = new URL(adres);
    const ct = (t: string) => ({ "content-type": t });
    switch (u.hostname) {
      case "www.bing.com":
        return yanitYap(200, fikstur("bing.html"), ct("text/html; charset=utf-8"), adres);
      case "html.duckduckgo.com":
        return yanitYap(202, fikstur("duckduckgo-anomali.html"), ct("text/html"), adres);
      case "search.brave.com":
        return yanitYap(429, "Too Many Requests", ct("text/html"), adres);
      case "www.mojeek.com":
        return yanitYap(403, fikstur("mojeek-engel.html"), ct("text/html"), adres);
      case "api.stackexchange.com":
        return yanitYap(200, fikstur("stackoverflow.json"), ct("application/json"), adres);
      case "api.github.com":
        return yanitYap(200, fikstur("github-depolar.json"), ct("application/json"), adres);
      case "registry.npmjs.org":
        return yanitYap(200, fikstur("npm.json"), ct("application/json"), adres);
      case "developer.mozilla.org":
        return yanitYap(200, fikstur("mdn.json"), ct("application/json"), adres);
      case "hn.algolia.com":
        return yanitYap(200, fikstur("hackernews.json"), ct("application/json"), adres);
      default:
        throw new AgHatasi("ag", `beklenmeyen adres ${adres}`);
    }
  };

  it("kod kategorisi: erişilebilir motorlar birleşir, engellenenler askıya alınır", async () => {
    const arama = new WebArama({ ayarlar: () => ({ searxngAdresi: null, disOkuyucu: true, kapaliMotorlar: [] }), dil: () => "en", getir, gh: () => null });
    const y = await arama.ara({ sorgu: "electron", kategori: "kod" });
    expect(y.yanitVerenler.sort()).toEqual(["bing", "github", "hackernews", "mdn", "npm", "stackoverflow"]);
    expect(Object.fromEntries(y.hatalar.map((h) => [h.motor, h.hata]))).toMatchObject({ duckduckgo: expect.stringMatching(/anomaly/), brave: expect.stringMatching(/429/), mojeek: expect.stringMatching(/403/) });
    const durum = Object.fromEntries(arama.durum().map((d) => [d.kimlik, d]));
    expect(durum.brave!.askida && durum.mojeek!.askida && durum.duckduckgo!.askida).toBe(true);
    expect(new Date(durum.brave!.askiBitis!).getTime() - Date.now()).toBeLessThanOrEqual(COK_ISTEK_ASKISI_MS);
    expect(new Date(durum.mojeek!.askiBitis!).getTime() - Date.now()).toBeGreaterThan(COK_ISTEK_ASKISI_MS);
    // GitHub deposu iki motordan (bing ve github) geldi; tek sonuçtur
    const gh = y.sonuclar.filter((r) => adresAnahtari(r.adres) === "github.com/electron/electron");
    expect(gh).toHaveLength(1);
    expect(y.sonuclar.length).toBeGreaterThan(10);
    expect(y.sonuclar.every((r) => r.motorlar.length >= 1 && r.puan > 0)).toBe(true);
  });

  it("GitHub: gh yoksa genel API, gh girişliyse onun yanıtı", async () => {
    const genel = await githubIstegi("search/repositories?q=electron", { gh: null, getir });
    expect(genel.kaynak).toBe("genel");
    const ghVeri = { total_count: 1, items: [{ full_name: "ozel/depo", html_url: "https://github.com/ozel/depo" }] };
    const gh = { api: async <T>() => ghVeri as T };
    const ozel = await githubIstegi<typeof ghVeri>("search/repositories?q=x", { gh, getir });
    expect(ozel).toEqual({ veri: ghVeri, kaynak: "gh" });
  });

  it("Bing motoru getiriciyle uçtan uca", async () => {
    const r = await bing.ara(istek, { getir, gh: null, searxngAdresi: null, zamanAsimiMs: 1000 });
    expect(r).toHaveLength(4);
  });
});
