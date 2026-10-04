// Sayfa okuyucu: HTML → Markdown (tablo, kod), PDF, JSON, görsel, GitHub ve npm özel adresleri, sayfalama,
// r.jina.ai yedeğine düşme kararı ve şema dışı adresin reddi. Ağa çıkılmaz: getirici sahtedir.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WebAyarlari } from "@arnorg/ortak";
import { httpAdresi, yerelAdresMi } from "./adres.js";
import { AgHatasi, yanitYap, type Getirici, type GetirSecenekleri } from "./http.js";
import { githubDepoKoku, githubHamAdresi, npmPaketAdi, parcala, SayfaOkuyucu } from "./okuyucu.js";
import { htmlMarkdowna, icerikTuru, metinUzunlugu, tablolariDuzle } from "./donustur.js";

const fikstur = (ad: string) => fs.readFileSync(fileURLToPath(new URL(`./fikstur/${ad}`, import.meta.url)), "utf8");

/** Küçük, geçerli bir PDF: her sayfa bir satır metin (Helvetica), Info sözlüğünde başlık, yazar ve tarih */
export function ornekPdf(sayfalar: string[], bilgi: { baslik: string; yazar: string }): Uint8Array {
  const nesneler: string[] = [];
  const fontNo = 3 + sayfalar.length * 2;
  const bilgiNo = fontNo + 1;
  nesneler[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  nesneler[2] = `<< /Type /Pages /Kids [${sayfalar.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${sayfalar.length} >>`;
  sayfalar.forEach((metin, i) => {
    const sayfa = 3 + i * 2;
    const akis = `BT /F1 18 Tf 72 760 Td (${metin.replace(/([()\\])/g, "\\$1")}) Tj ET`;
    nesneler[sayfa] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${sayfa + 1} 0 R /Resources << /Font << /F1 ${fontNo} 0 R >> >> >>`;
    nesneler[sayfa + 1] = `<< /Length ${akis.length} >>\nstream\n${akis}\nendstream`;
  });
  nesneler[fontNo] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  nesneler[bilgiNo] = `<< /Title (${bilgi.baslik}) /Author (${bilgi.yazar}) /CreationDate (D:20260314093000Z) >>`;
  let govde = "%PDF-1.4\n";
  const konumlar: number[] = [];
  for (let n = 1; n < nesneler.length; n++) {
    konumlar[n] = govde.length;
    govde += `${n} 0 obj\n${nesneler[n]}\nendobj\n`;
  }
  const xref = govde.length;
  govde += `xref\n0 ${nesneler.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < nesneler.length; n++) govde += `${String(konumlar[n]).padStart(10, "0")} 00000 n \n`;
  govde += `trailer\n<< /Size ${nesneler.length} /Root 1 0 R /Info ${bilgiNo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(govde);
}

type Kayit = { adres: string; s?: GetirSecenekleri };

/** Adrese göre yanıt veren sahte getirici; istenen adresleri kaydeder */
function sahteAg(yanitlar: Record<string, () => ReturnType<typeof yanitYap>>) {
  const istenenler: Kayit[] = [];
  const getir: Getirici = async (adres, s) => {
    istenenler.push({ adres, s });
    const f = yanitlar[adres];
    if (!f) return yanitYap(404, "yok", { "content-type": "text/plain" }, adres);
    const y = f();
    return { ...y, adres: y.adres === "https://ornek.test/" ? adres : y.adres };
  };
  return { getir, istenenler };
}

function okuyucu(getir: Getirici, ayar: Partial<WebAyarlari> = {}) {
  const ayarlar: WebAyarlari = { searxngAdresi: null, disOkuyucu: true, kapaliMotorlar: [], ...ayar };
  return new SayfaOkuyucu({ ayarlar: () => ayarlar, dil: () => "tr", getir });
}

const HTML = { "content-type": "text/html; charset=utf-8" };

describe("adres doğrulama", () => {
  it("yalnız http ve https okunur; şemasız ada https, yerel adrese http eklenir", () => {
    for (const kotu of ["file:///etc/passwd", "data:text/html,<b>x</b>", "javascript:alert(1)", "ftp://ornek.com/a", "mailto:a@b.c"]) {
      expect(() => httpAdresi(kotu), kotu).toThrow(/Yalnız http ve https/);
    }
    expect(() => httpAdresi("   ")).toThrow(/boş/);
    expect(httpAdresi("ornek.com/yol").toString()).toBe("https://ornek.com/yol");
    expect(httpAdresi("localhost:5173/sayfa").toString()).toBe("http://localhost:5173/sayfa");
    expect(httpAdresi("http://127.0.0.1:3000").toString()).toBe("http://127.0.0.1:3000/");
  });

  it("yerel ve özel ağ adresleri tanınır", () => {
    for (const a of ["http://localhost:3000", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.20/", "http://172.20.1.1/", "http://[::1]:8080/", "http://ajan.local/", "http://intranet/", "http://[fd00::1]/"]) {
      expect(yerelAdresMi(a), a).toBe(true);
    }
    for (const a of ["https://example.com/", "http://8.8.8.8/", "http://172.32.0.1/", "https://[2001:db8::1]/"]) expect(yerelAdresMi(a), a).toBe(false);
  });

  it("okuyucu şema dışı adresi ağa çıkmadan reddeder", async () => {
    const { getir, istenenler } = sahteAg({});
    await expect(okuyucu(getir).oku({ adres: "file:///C:/Windows/win.ini" })).rejects.toThrow(/Yalnız http ve https/);
    expect(istenenler).toEqual([]);
  });
});

describe("HTML → Markdown", () => {
  it("ana içerik tablo ve kod bloğuyla Markdown olur; üst bilgi ve bağlantılar okunur", async () => {
    const adres = "https://blog.ornek.com/yazilar/electron-ozel-depo";
    const { getir } = sahteAg({ [adres]: () => yanitYap(200, fikstur("sayfa.html"), HTML) });
    const s = await okuyucu(getir).oku({ adres, baglantilar: true });
    expect(s).toMatchObject({ baslik: "electron-updater ile özel depodan güncelleme", site: "Örnek Blog", yazar: "Deniz Yılmaz", tarih: "2026-03-14T09:30:00Z", tur: "html", kaynak: "yerel", devamVar: false, sonraki: null });
    expect(s.icerik).toContain("| Yöntem | Belirteç uygulamada mı | Not |\n| --- | --- | --- |\n| GitHub sağlayıcısı (private) | Evet | Yalnız iç kullanım |");
    expect(s.icerik).toContain('```ts\nimport { autoUpdater } from "electron-updater";');
    expect(s.icerik).toContain("[Auto Update](https://www.electron.build/auto-update)");
    // Göreli bağlantı ve görsel mutlak olur; açıklamasız data: görseli atılır
    expect(s.icerik).toContain("(https://blog.ornek.com/yazilar/imzali-guncellemeler)");
    expect(s.icerik).toContain("![Güncelleme akışı şeması](https://blog.ornek.com/gorseller/akis.png)");
    expect(s.icerik).not.toContain("data:image");
    // Gezinti, alt bilgi, betik ve stil girmez
    expect(s.icerik).not.toMatch(/Ana sayfa|Gizlilik|window\.izleme|font-family/);
    expect(s.baglantilar.map((b) => b.adres)).toEqual([
      "https://www.electron.build/auto-update",
      "https://blog.ornek.com/yazilar/imzali-guncellemeler",
      "https://github.com/electron-userland/electron-builder/issues/2222",
    ]);
    // Bağlantılar istenmezse boş
    expect((await okuyucu(getir).oku({ adres })).baglantilar).toEqual([]);
  });

  it("ana içerikten ayrı kalan giriş sayfa açıklamasıyla özet olur; başlık çapaları metin kalır", async () => {
    // MDN gibi: giriş paragrafı başlık bölümünde, ana içerik ayrı gövde bölümünde
    const govde = Array.from({ length: 6 }, (_, i) => `<section><h2 id="b${i}"><a href="#b${i}">Bölüm ${i}</a></h2><p>${"Bu bölüm denetleyicinin ayrıntılarını anlatır. ".repeat(8)}</p></section>`).join("");
    const html = `<html><head><title>AbortController</title><meta name="description" content="AbortController arayüzü bir ya da birden çok web isteğini istenince durdurmayı sağlar."></head>
      <body><main><div class="baslik"><h1>AbortController</h1><section><p>AbortController arayüzü bir ya da birden çok web isteğini istenince durdurmayı sağlar.</p></section></div><div class="govde">${govde}</div></main></body></html>`;
    const adres = "https://belgeler.ornek.com/AbortController";
    const { getir } = sahteAg({ [adres]: () => yanitYap(200, html, HTML) });
    const s = await okuyucu(getir).oku({ adres });
    expect(s.icerik).toContain("## Bölüm 0\n");
    expect(s.icerik).not.toContain("](#b0)");
    // Açıklama metinde zaten varsa yinelenmez
    const yinelenen = s.icerik.split("AbortController arayüzü bir ya da birden çok web isteğini").length - 1;
    expect(yinelenen).toBe(1);
    // Açıklama ana içerikte hiç yoksa özet olarak başa girer
    const ozetli = html.replace("</head>", "").replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Kısa özet: bu sayfa istekleri durdurmanın yollarını anlatır."></head>').replace(/<div class="baslik">[\s\S]*?<\/div>/, "");
    const adres2 = "https://belgeler.ornek.com/ozet";
    const { getir: getir2 } = sahteAg({ [adres2]: () => yanitYap(200, ozetli, HTML) });
    expect((await okuyucu(getir2).oku({ adres: adres2 })).icerik).toMatch(/^> Kısa özet: bu sayfa istekleri durdurmanın yollarını anlatır\.\n\n## Bölüm 0/);
  });

  it("başlık satırı olmayan düzen tabloları satır satır açılır, başlıklı veri tablosu kalır", () => {
    const duzen = `<table id="ana"><tr><td><table><tr><td>1.</td><td><a href="https://ornek.com/a">Birinci haber</a></td></tr><tr><td></td><td>12 puan · 3 yorum</td></tr></table></td></tr></table>`;
    const md = htmlMarkdowna(duzen);
    // Satır başındaki "1." liste sanılmasın diye Markdown'da kaçışlanır
    expect(md).toBe("1\\. · [Birinci haber](https://ornek.com/a)\n\n12 puan · 3 yorum");
    expect(md).not.toContain("<table");
    const veri = "<table><tr><th>Ad</th><th>Sürüm</th></tr><tr><td>linkedom</td><td>0.18</td></tr></table>";
    expect(htmlMarkdowna(veri)).toBe("| Ad | Sürüm |\n| --- | --- |\n| linkedom | 0.18 |");
    // Başlık çapası (#, ¶) ve metni olmayan bağlantı atılır
    expect(htmlMarkdowna('<h2>Dosya sistemi<a href="#fs">#</a></h2><p>Bak <a href="https://x.com/"></a><a href="#alt">alt bölüm</a>.</p>')).toBe("## Dosya sistemi\n\nBak alt bölüm.");
    expect(tablolariDuzle("<p>tablo yok</p>")).toBe("<p>tablo yok</p>");
  });

  it("okunur metin uzunluğu bağlantı adreslerini ve işaretleri saymaz", () => {
    expect(metinUzunlugu("# Başlık\n\n[bağlantı](https://cok-uzun-bir-adres.ornek.com/a/b/c) ![görsel](https://x.com/a.png) **kalın**")).toBe("Başlık bağlantı kalın".length);
  });

  it("içerik türü başlıktan ve ilk baytlardan tanınır", () => {
    const b = (s: string) => new TextEncoder().encode(s);
    expect(icerikTuru("text/html; charset=utf-8", b("<p>x</p>"))).toBe("html");
    expect(icerikTuru("application/octet-stream", b("%PDF-1.7\n"))).toBe("pdf");
    expect(icerikTuru("text/plain", b('{"a": 1}'))).toBe("json");
    expect(icerikTuru("application/vnd.api+json", b("{}"))).toBe("json");
    expect(icerikTuru(undefined, b("<!DOCTYPE html><html>"))).toBe("html");
    expect(icerikTuru("text/markdown", b("# Başlık"))).toBe("metin");
    expect(icerikTuru("application/octet-stream", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("gorsel");
    expect(icerikTuru("application/zip", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]))).toBe("diger");
  });
});

describe("PDF, JSON, metin ve görsel", () => {
  it("PDF'in metni sayfa sayfa, başlık ve yazarıyla okunur", async () => {
    const adres = "https://ornek.test/belgeler/rapor";
    const pdf = ornekPdf(["Merhaba ArnOrg PDF okuyucu", "Ikinci sayfa: electron-updater"], { baslik: "Deneme Raporu", yazar: "ArnOrg" });
    const { getir } = sahteAg({ [adres]: () => yanitYap(200, pdf, { "content-type": "application/pdf" }) });
    const s = await okuyucu(getir).oku({ adres });
    expect(s).toMatchObject({ tur: "pdf", baslik: "Deneme Raporu", yazar: "ArnOrg", tarih: "2026-03-14T09:30:00.000Z" });
    expect(s.icerik).toBe("--- Sayfa 1/2 ---\n\nMerhaba ArnOrg PDF okuyucu\n\n--- Sayfa 2/2 ---\n\nIkinci sayfa: electron-updater");
  });

  it("bozuk PDF anlaşılır hata verir", async () => {
    const adres = "https://ornek.test/bozuk.pdf";
    const { getir } = sahteAg({ [adres]: () => yanitYap(200, "%PDF-1.4\nbu bir pdf değil", { "content-type": "application/pdf" }) });
    await expect(okuyucu(getir).oku({ adres })).rejects.toThrow(/PDF okunamadı/);
  });

  it("JSON biçimlendirilir, düz metin ve Markdown olduğu gibi, kod dosyası kod bloğunda", async () => {
    const { getir } = sahteAg({
      "https://api.ornek.test/veri": () => yanitYap(200, '{"ad":"arnorg","surum":[0,0,5]}', { "content-type": "application/json" }),
      "https://ornek.test/BENIOKU.md": () => yanitYap(200, "# Başlık\n\nMetin.\n", { "content-type": "text/markdown; charset=utf-8" }),
      "https://ornek.test/kaynak/ana.ts": () => yanitYap(200, "export const x = 1;\n", { "content-type": "text/plain; charset=utf-8" }),
    });
    const o = okuyucu(getir);
    const j = await o.oku({ adres: "https://api.ornek.test/veri" });
    expect(j.tur).toBe("json");
    expect(j.icerik).toBe('```json\n{\n  "ad": "arnorg",\n  "surum": [\n    0,\n    0,\n    5\n  ]\n}\n```');
    expect((await o.oku({ adres: "https://ornek.test/BENIOKU.md" })).icerik).toBe("# Başlık\n\nMetin.");
    expect((await o.oku({ adres: "https://ornek.test/kaynak/ana.ts" })).icerik).toBe("```ts\nexport const x = 1;\n```");
  });

  it("görselin yalnız bilgisi verilir", async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    const { getir } = sahteAg({ "https://ornek.test/sema.png": () => yanitYap(200, png, { "content-type": "image/png" }) });
    const s = await okuyucu(getir).oku({ adres: "https://ornek.test/sema.png" });
    expect(s.tur).toBe("gorsel");
    expect(s.icerik).toContain("Görsel: image/png");
    expect(s.icerik).toContain("640 × 480");
  });

  it("okunamayan tür ve hata durumu anlaşılır hatadır", async () => {
    const { getir } = sahteAg({
      "https://ornek.test/arsiv.zip": () => yanitYap(200, new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]), { "content-type": "application/zip" }),
      "https://ornek.test/sunucu": () => yanitYap(500, "hata", { "content-type": "text/plain" }),
    });
    const o = okuyucu(getir, { disOkuyucu: false });
    await expect(o.oku({ adres: "https://ornek.test/arsiv.zip" })).rejects.toThrow(/içerik türü okunamaz: application\/zip/);
    await expect(o.oku({ adres: "https://ornek.test/yok" })).rejects.toThrow(/404 döndürdü \(bulunamadı\)/);
    await expect(o.oku({ adres: "https://ornek.test/sunucu" })).rejects.toThrow(/500 döndürdü \(sunucu hatası\)/);
  });

  it("ağ hatası ve zaman aşımı anlaşılır hatadır", async () => {
    const getir: Getirici = async (adres) => {
      throw adres.includes("yavas") ? new AgHatasi("zaman_asimi", "x") : new AgHatasi("ag", "ENOTFOUND");
    };
    const o = okuyucu(getir);
    await expect(o.oku({ adres: "https://yavas.test/" })).rejects.toThrow(/15 sn içinde yanıt vermedi/);
    await expect(o.oku({ adres: "https://yok.test/" })).rejects.toThrow(/bağlanılamadı \(ENOTFOUND\)/);
  });
});

describe("özel adresler", () => {
  it("GitHub blob ve raw bağlantısı ham içeriğe, depo kökü README'ye çevrilir; npm paket adı okunur", () => {
    expect(githubHamAdresi("https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/main.ts#L10")).toBe(
      "https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/electron-updater/src/main.ts",
    );
    expect(githubHamAdresi("https://github.com/a/b/raw/v1.2.0/docs/x.md")).toBe("https://raw.githubusercontent.com/a/b/v1.2.0/docs/x.md");
    expect(githubHamAdresi("https://github.com/a/b")).toBeNull();
    expect(githubHamAdresi("https://gitlab.com/a/b/blob/main/x")).toBeNull();
    expect(githubDepoKoku("https://github.com/electron/electron/")).toEqual({ sahip: "electron", depo: "electron", dal: "HEAD" });
    expect(githubDepoKoku("https://github.com/a/b.git")).toEqual({ sahip: "a", depo: "b", dal: "HEAD" });
    expect(githubDepoKoku("https://github.com/a/b/tree/gelistirme")).toEqual({ sahip: "a", depo: "b", dal: "gelistirme" });
    expect(githubDepoKoku("https://github.com/a/b/issues")).toBeNull();
    expect(githubDepoKoku("https://github.com/orgs/arnorg")).toBeNull();
    expect(npmPaketAdi("https://www.npmjs.com/package/electron-updater")).toBe("electron-updater");
    expect(npmPaketAdi("https://www.npmjs.com/package/@scope/ad/v/1.0.0")).toBe("@scope/ad");
    expect(npmPaketAdi("https://ornek.com/package/x")).toBeNull();
  });

  it("GitHub dosya bağlantısı ham içerikten okunur", async () => {
    const ham = "https://raw.githubusercontent.com/a/b/main/src/ana.ts";
    const { getir, istenenler } = sahteAg({ [ham]: () => yanitYap(200, "export const surum = 5;\n", { "content-type": "text/plain; charset=utf-8" }) });
    const s = await okuyucu(getir).oku({ adres: "https://github.com/a/b/blob/main/src/ana.ts" });
    expect(istenenler.map((x) => x.adres)).toEqual([ham]);
    expect(s).toMatchObject({ adres: "https://github.com/a/b/blob/main/src/ana.ts", sonAdres: ham, icerik: "```ts\nexport const surum = 5;\n```" });
  });

  it("depo kökünde README bulunur (ilk ad yoksa sonrakiler denenir)", async () => {
    const { getir, istenenler } = sahteAg({ "https://raw.githubusercontent.com/a/b/HEAD/readme.md": () => yanitYap(200, "# B deposu\n\nAçıklama.", { "content-type": "text/plain" }) });
    const s = await okuyucu(getir).oku({ adres: "https://github.com/a/b" });
    expect(istenenler.map((x) => x.adres)).toEqual(["https://raw.githubusercontent.com/a/b/HEAD/README.md", "https://raw.githubusercontent.com/a/b/HEAD/readme.md"]);
    expect(s).toMatchObject({ baslik: "a/b · readme.md", icerik: "# B deposu\n\nAçıklama." });
  });

  it("npm paket sayfası registry'deki README ve üst bilgiyle okunur", async () => {
    const belge = {
      name: "@ornek/paket",
      description: "Örnek paket",
      readme: "# @ornek/paket\n\nKurulum: npm i @ornek/paket",
      license: "MIT",
      repository: { url: "git+https://github.com/ornek/paket.git" },
      "dist-tags": { latest: "2.1.0" },
      time: { "2.1.0": "2026-08-01T10:00:00.000Z" },
    };
    const { getir, istenenler } = sahteAg({ "https://registry.npmjs.org/@ornek%2Fpaket": () => yanitYap(200, JSON.stringify(belge), { "content-type": "application/json" }) });
    const s = await okuyucu(getir).oku({ adres: "https://www.npmjs.com/package/@ornek/paket" });
    expect(istenenler.map((x) => x.adres)).toEqual(["https://registry.npmjs.org/@ornek%2Fpaket"]);
    expect(s.baslik).toBe("@ornek/paket 2.1.0 · npm");
    expect(s.icerik).toContain("**Son sürüm:** 2.1.0 (2026-08-01) · **Lisans:** MIT · **Depo:** https://github.com/ornek/paket");
    expect(s.icerik).toContain("Kurulum: npm i @ornek/paket");
  });
});

describe("sayfalama", () => {
  it("parçalar paragraf sonunda kesilir, sonraki başlangıç verilir", () => {
    const paragraflar = Array.from({ length: 40 }, (_, i) => `Paragraf ${i}: ${"x".repeat(90)}`);
    const metin = paragraflar.join("\n\n");
    const p1 = parcala(metin, 0, 1000);
    expect(p1.devamVar).toBe(true);
    expect(p1.icerik.endsWith("\n\n")).toBe(true);
    expect(p1.icerik.length).toBeGreaterThan(800);
    expect(p1.icerik.length).toBeLessThanOrEqual(1000);
    const p2 = parcala(metin, p1.sonraki!, 1000);
    expect(p2.icerik.startsWith("Paragraf")).toBe(true);
    // Parçalar uç uca bütün metni verir
    let bas = 0;
    let birlesik = "";
    for (;;) {
      const p = parcala(metin, bas, 1000);
      birlesik += p.icerik;
      if (!p.devamVar) break;
      bas = p.sonraki!;
    }
    expect(birlesik).toBe(metin);
    expect(parcala("kısa", 0, 12_000)).toEqual({ icerik: "kısa", baslangic: 0, toplam: 4, devamVar: false, sonraki: null });
  });

  it("uzun sayfa parça parça okunur, belge bir kez indirilir", async () => {
    const govde = `<html><head><title>Uzun</title></head><body><article>${Array.from({ length: 300 }, (_, i) => `<p>Satır ${i}: ${"bilgi ".repeat(20)}</p>`).join("")}</article></body></html>`;
    const adres = "https://ornek.test/uzun";
    let indirme = 0;
    const { getir } = sahteAg({ [adres]: () => (indirme++, yanitYap(200, govde, HTML)) });
    const o = okuyucu(getir);
    const s1 = await o.oku({ adres });
    expect(s1.icerik.length).toBeLessThanOrEqual(12_000);
    expect(s1.devamVar).toBe(true);
    expect(s1.toplam).toBeGreaterThan(30_000);
    const s2 = await o.oku({ adres, baslangic: s1.sonraki!, uzunluk: 5000 });
    expect(s2.baslangic).toBe(s1.sonraki);
    expect(s2.onbellekten).toBe(true);
    expect(s2.icerik.length).toBeLessThanOrEqual(5000);
    expect(indirme).toBe(1);
    const son = await o.oku({ adres, baslangic: s1.toplam + 10 });
    expect(son.icerik).toBe("");
    expect(son.uyarilar.join(" ")).toMatch(/baslangic bunun dışında/);
  });
});

describe("r.jina.ai yedeği", () => {
  const jinaYaniti = (adres: string) =>
    yanitYap(200, JSON.stringify({ code: 200, data: { title: "Pano", url: adres, content: `# Pano\n\n${"JS ile çizilen içerik. ".repeat(60)}`, publishedTime: "Sun, 04 Oct 2026 07:03:47 GMT" } }), { "content-type": "application/json" });

  it("yerelde çok az metin çıkan sayfa açık ayarla r.jina.ai'den okunur", async () => {
    const adres = "https://app.ornek.com/pano";
    const { getir, istenenler } = sahteAg({ [adres]: () => yanitYap(200, fikstur("js-sayfa.html"), HTML), [`https://r.jina.ai/${adres}`]: () => jinaYaniti(adres) });
    const s = await okuyucu(getir).oku({ adres });
    expect(istenenler.map((x) => x.adres)).toEqual([adres, `https://r.jina.ai/${adres}`]);
    expect(istenenler[1]!.s?.basliklar).toMatchObject({ Accept: "application/json" });
    expect(s).toMatchObject({ kaynak: "jina", baslik: "Pano", tarih: "Sun, 04 Oct 2026 07:03:47 GMT" });
    expect(s.icerik).toContain("JS ile çizilen içerik.");
    expect(s.uyarilar.join(" ")).toMatch(/r\.jina\.ai/);
  });

  it("ayar kapalıysa ya da adres yerelse dış okuyucuya gidilmez; yerelde ne çıktıysa döner", async () => {
    const dis = "https://app.ornek.com/pano";
    const yerel = "http://localhost:5173/";
    const { getir, istenenler } = sahteAg({ [dis]: () => yanitYap(200, fikstur("js-sayfa.html"), HTML), [yerel]: () => yanitYap(200, fikstur("js-sayfa.html"), HTML) });
    const kapali = await okuyucu(getir, { disOkuyucu: false }).oku({ adres: dis });
    expect(kapali.kaynak).toBe("yerel");
    expect(kapali.uyarilar.join(" ")).toMatch(/JS ile çiziliyor olabilir/);
    const y = await okuyucu(getir).oku({ adres: yerel });
    expect(y.kaynak).toBe("yerel");
    expect(istenenler.some((x) => x.adres.startsWith("https://r.jina.ai/"))).toBe(false);
  });

  it("yeterli metni olan sayfa ve yedeğin de başarısız olduğu sayfa yerelde kalır", async () => {
    const tam = "https://blog.ornek.com/yazi";
    const az = "https://app.ornek.com/bos";
    const { getir, istenenler } = sahteAg({
      [tam]: () => yanitYap(200, fikstur("sayfa.html"), HTML),
      [az]: () => yanitYap(200, fikstur("js-sayfa.html"), HTML),
      [`https://r.jina.ai/${az}`]: () => yanitYap(403, "engellendi"),
    });
    const o = okuyucu(getir);
    expect((await o.oku({ adres: tam })).kaynak).toBe("yerel");
    expect(istenenler.filter((x) => x.adres.startsWith("https://r.jina.ai/"))).toEqual([]);
    const s = await o.oku({ adres: az });
    expect(s.kaynak).toBe("yerel");
    expect(istenenler.filter((x) => x.adres.startsWith("https://r.jina.ai/")).length).toBe(1);
  });

  it("bot korumasına takılan sayfa (403) r.jina.ai ile denenir", async () => {
    const adres = "https://korumali.ornek.com/makale";
    const { getir } = sahteAg({ [adres]: () => yanitYap(403, "Forbidden", HTML), [`https://r.jina.ai/${adres}`]: () => jinaYaniti(adres) });
    const s = await okuyucu(getir).oku({ adres });
    expect(s.kaynak).toBe("jina");
    expect(s.uyarilar.join(" ")).toMatch(/403 döndürdü; içerik r\.jina\.ai üzerinden okundu/);
  });
});
