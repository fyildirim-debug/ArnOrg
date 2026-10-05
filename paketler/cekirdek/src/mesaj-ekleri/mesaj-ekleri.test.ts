// Mesaj ekleri (0.0.8): tür tanıma (imza baytları, metin denetimi), sınırlar, dosya adları, gizli dosya ve içerik reddi,
// yükleme ve sunum uçları, ekli kanal mesajı, ajana giden metin ve görsel blokları, dosya_paylas aracı, serbest
// konuşmanın uyandırma metni ve talimat. Claude Code oturumu açılmaz; uyandırmalar ajanaMesaj casusuyla okunur.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EK_SINIRLARI, KURUL, type Ajan, type Kanal, type Mesaj, type MesajEki, type SunucuOlayi } from "@arnorg/ortak";
import { arnorgAracListesi } from "../arnorg-araclari.js";
import { Depo } from "../depo.js";
import { dilKaynagi } from "../dil.js";
import { KanalKonusmasi, type KonusmaBaglami } from "../kanal-konusmasi.js";
import { OlayYolu } from "../olaylar.js";
import { Sirket } from "../sirket.js";
import { sunucuKur } from "../sunucu.js";
import { TerminalYoneticisi } from "../terminal.js";
import { ArnorgHatasi } from "../yardimci.js";
import { Yapilandirma } from "../yapilandirma.js";
import { ekTalimati } from "./araclar.js";
import { mesajIcerigi } from "./icerik.js";
import { ekGeciciDizini, ekMetni, kokunIcinde, SATIR_ICI_GORSEL } from "./index.js";
import { adTemizle, base64Coz, ekTuru, gizliDosyaMi, gizliIcerikVarMi, gorselBoyutu } from "./tur.js";
import { icerikYerlesimi } from "./uclar.js";

// ---------------------------------------------------------------------------
// Örnek dosyalar
// ---------------------------------------------------------------------------

/** 1×1 piksel PNG */
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** Yalnız başlığı olan PNG: piksel boyutu başlıktan okunur */
function pngBasligi(genislik: number, yukseklik: number): Buffer {
  const t = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(t, 0);
  t.writeUInt32BE(13, 8);
  t.write("IHDR", 12, "latin1");
  t.writeUInt32BE(genislik, 16);
  t.writeUInt32BE(yukseklik, 20);
  return t;
}

/** JFIF başlığı ve SOF0 (640×480) */
const JPEG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffc0001108" + "01e0" + "0280" + "03012200021101031101ffd9", "hex");
/** GIF89a, 320×240 */
const GIF = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.from([0x40, 0x01, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x3b])]);

/** Genişletilmiş (VP8X) WebP başlığı */
function webp(genislik: number, yukseklik: number): Buffer {
  const t = Buffer.alloc(30);
  t.write("RIFF", 0, "latin1");
  t.writeUInt32LE(22, 4);
  t.write("WEBPVP8X", 8, "latin1");
  t.writeUInt32LE(10, 16);
  t.writeUIntLE(genislik - 1, 24, 3);
  t.writeUIntLE(yukseklik - 1, 27, 3);
  return t;
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 1)]);
const ELF = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]), Buffer.alloc(40)]);

function tar(): Buffer {
  const t = Buffer.alloc(1024);
  t.write("notlar.txt", 0, "latin1");
  t.write("ustar", 257, "latin1");
  return t;
}

function bmp(): Buffer {
  const t = Buffer.alloc(70, 0);
  t.write("BM", 0, "latin1");
  t.writeUInt32LE(70, 2);
  return t;
}

const hata = (f: () => unknown): ArnorgHatasi => {
  try {
    f();
  } catch (h) {
    if (h instanceof ArnorgHatasi) return h;
    throw h;
  }
  throw new Error("hata atılmadı");
};

// ---------------------------------------------------------------------------

describe("tür tanıma", () => {
  it("görseller imzadan tanınır, piksel boyutu başlıktan okunur; ad uzantısı belirleyici değildir", () => {
    expect(ekTuru(PNG_1X1, "ekran.txt")).toMatchObject({ tur: "gorsel", mime: "image/png", uzanti: "png", genislik: 1, yukseklik: 1 });
    expect(ekTuru(JPEG, "foto.png")).toMatchObject({ tur: "gorsel", mime: "image/jpeg", uzanti: "jpg", genislik: 640, yukseklik: 480 });
    expect(ekTuru(GIF, "hareket.gif")).toMatchObject({ tur: "gorsel", mime: "image/gif", uzanti: "gif", genislik: 320, yukseklik: 240 });
    expect(ekTuru(webp(1440, 900), "a.webp")).toMatchObject({ tur: "gorsel", mime: "image/webp", uzanti: "webp", genislik: 1440, yukseklik: 900 });
    expect(gorselBoyutu(pngBasligi(3000, 2000), "image/png")).toEqual({ genislik: 3000, yukseklik: 2000 });
  });

  it("PDF ve metin: metnin uzantısı tanınıyorsa korunur, değilse .txt; UTF-16 (BOM'lu) metin UTF-8'e çevrilir", () => {
    expect(ekTuru(PDF, "rapor.bin")).toMatchObject({ tur: "pdf", mime: "application/pdf", uzanti: "pdf" });
    const md = ekTuru(Buffer.from("# Başlık\n\nİçerik — çğıöşü\n"), "notlar.MD");
    expect(md).toMatchObject({ tur: "metin", mime: "text/plain; charset=utf-8", uzanti: "md" });
    expect(ekTuru(Buffer.from('{"a":1}'), "veri.json").uzanti).toBe("json");
    expect(ekTuru(Buffer.from("ad;yas\nAda;30\n"), "liste.csv").uzanti).toBe("csv");
    expect(ekTuru(Buffer.from("FROM node:22\n"), "Dockerfile").uzanti).toBe("dockerfile");
    expect(ekTuru(Buffer.from("düz metin"), "isimsiz.bilinmez").uzanti).toBe("txt");
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Günlük: hata yok\r\n", "utf16le")]);
    const cevrilen = ekTuru(utf16, "cikti.log");
    expect(cevrilen).toMatchObject({ tur: "metin", uzanti: "log" });
    expect(cevrilen.icerik.toString("utf8")).toBe("Günlük: hata yok\r\n");
  });

  it("SVG ve HTML yalnız düz metindir: görsel ya da sayfa olarak sunulmaz", () => {
    expect(ekTuru(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "logo.svg")).toMatchObject({ tur: "metin", mime: "text/plain; charset=utf-8", uzanti: "svg" });
    expect(ekTuru(Buffer.from("<!doctype html><script>alert(1)</script>"), "sayfa.html")).toMatchObject({ tur: "metin", mime: "text/plain; charset=utf-8" });
  });

  it("çalıştırılabilir dosya, arşiv, desteklenmeyen görsel ve ikili dosya açık bir iletiyle reddedilir", () => {
    expect(hata(() => ekTuru(ELF, "araç")).message).toBe("Çalıştırılabilir dosyalar eklenemez.");
    expect(hata(() => ekTuru(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(60, 0x90)]), "kur.exe")).durumKodu).toBe(415);
    expect(hata(() => ekTuru(Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]), "uygulama")).message).toMatch(/Çalıştırılabilir/);
    expect(hata(() => ekTuru(ZIP, "proje.zip")).message).toMatch(/^Arşiv dosyaları .* eklenemez/);
    expect(hata(() => ekTuru(ZIP, "rapor.docx")).message).toMatch(/docx ve xlsx de zip/);
    expect(hata(() => ekTuru(Buffer.from([0x1f, 0x8b, 8, 0, 0, 0]), "a.tar.gz")).message).toMatch(/^Arşiv/);
    expect(hata(() => ekTuru(tar(), "a.tar")).message).toMatch(/^Arşiv/);
    expect(hata(() => ekTuru(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]), "a.7z")).message).toMatch(/^Arşiv/);
    expect(hata(() => ekTuru(bmp(), "eski.bmp")).message).toBe("Bu görsel biçimi desteklenmiyor; PNG, JPEG, GIF ya da WebP gönderin.");
    expect(hata(() => ekTuru(Buffer.from("II*\u0000rest", "latin1"), "tarama.tiff")).message).toMatch(/görsel biçimi/);
    expect(hata(() => ekTuru(Buffer.from([0, 1, 2, 3, 0, 0, 0xff, 0xee, 0, 1]), "veri.bin")).message).toMatch(/^Bu dosya türü desteklenmiyor/);
    expect(hata(() => ekTuru(Buffer.alloc(0), "bos.txt")).message).toBe("Dosya boş.");
    // "BM" ile başlayan metin BMP sayılmaz
    expect(ekTuru(Buffer.from("BMW servis kaydı"), "not.txt").tur).toBe("metin");
  });

  it("base64: data: öneki, geçersiz içerik (400) ve çözmeden önce uygulanan boyut sınırı (413)", () => {
    expect(base64Coz(`data:image/png;base64,${PNG_1X1.toString("base64")}`)).toEqual(PNG_1X1);
    expect(hata(() => base64Coz("%%%")).message).toMatch(/base64/);
    expect(hata(() => base64Coz("")).message).toBe("Dosya boş.");
    const buyuk = hata(() => base64Coz("A".repeat(Math.ceil(((EK_SINIRLARI.boyut + 3) * 4) / 3 / 4) * 4)));
    expect(buyuk.durumKodu).toBe(413);
    expect(buyuk.message).toMatch(/en çok 10 MB/);
  });
});

describe("dosya adları ve gizli dosyalar", () => {
  it("ad temizlenir: klasör kısmı, denetim ve yön karakterleri, Windows'ta geçersiz karakterler, ayrılmış adlar, uzunluk", () => {
    expect(adTemizle("C:\\Users\\ada\\Desktop\\ekran görüntüsü.png")).toBe("ekran görüntüsü.png");
    expect(adTemizle("../../etc/passwd")).toBe("passwd");
    expect(adTemizle("rapor\u202Efdp.exe")).toBe("raporfdp.exe");
    expect(adTemizle('a<b>c:d"e|f?g*h.txt')).toBe("a_b_c_d_e_f_g_h.txt");
    expect(adTemizle("  boşluk\t\tçok   .md.  ")).toBe("boşluk çok .md");
    expect(adTemizle("CON.txt")).toBe("_CON.txt");
    expect(adTemizle("..")).toBe("dosya");
    expect(adTemizle("")).toBe("dosya");
    const uzun = adTemizle(`${"ç".repeat(300)}.png`);
    expect(uzun.length).toBeLessThanOrEqual(EK_SINIRLARI.ad);
    expect(uzun.endsWith("….png")).toBe(true);
  });

  it("gizli dosya adları ve klasörleri tanınır; sıradan dosyalar paylaşılabilir", () => {
    for (const y of [".env", "/p/.env.local", "/p/.env.production", "/p/.envrc", "/home/a/.ssh/config", "/home/a/.ssh/id_ed25519", "id_rsa.pub", "/p/sunucu.pem", "/p/tls.key", "/p/imza.p12", "/p/ca.crt", "/p/.git/config", "/p/secrets.json", "/p/config/credentials", "/p/api_key.txt", "/p/.npmrc", "/p/terraform.tfstate", "/veri/erisim-anahtari", "C:\\Users\\a\\.aws\\credentials"]) {
      expect(gizliDosyaMi(y), y).toBe(true);
    }
    for (const y of ["/p/README.md", "/p/src/env.ts", "/p/stiller/tokenlar.css", "/p/environment.prod.ts", "/p/ekran.png", "/p/docs/anahtar-kelimeler.md", "/p/keyboard.ts"]) {
      expect(gizliDosyaMi(y), y).toBe(false);
    }
  });

  it("metindeki gizli bilgi kalıpları: özel anahtar bloğu ve bilinen erişim anahtarları", () => {
    expect(gizliIcerikVarMi("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA==\n")).toBe(true);
    expect(gizliIcerikVarMi("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    expect(gizliIcerikVarMi("aws_access_key_id = AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(gizliIcerikVarMi(`token: ghp_${"a".repeat(36)}`)).toBe(true);
    expect(gizliIcerikVarMi(`ANTHROPIC_API_KEY=sk-ant-${"x".repeat(30)}`)).toBe(true);
    expect(gizliIcerikVarMi("-----BEGIN PUBLIC KEY-----\nMIIB\n")).toBe(false);
    expect(gizliIcerikVarMi("Sipariş listesi: 12 kayıt, hata yok.")).toBe(false);
  });

  it("kök içinde denetimi: kökün kendisi, kardeş önekli klasör ve yukarı çıkan yol dışarıdadır", () => {
    const kok = path.resolve("/a/proje");
    expect(kokunIcinde(kok, path.join(kok, "src", "a.png"))).toBe(true);
    expect(kokunIcinde(kok, kok)).toBe(false);
    expect(kokunIcinde(kok, path.resolve("/a/proje2/a.png"))).toBe(false);
    expect(kokunIcinde(kok, path.join(kok, "..", "dis.png"))).toBe(false);
    // Adı .. ile başlayan klasör içeridedir
    expect(kokunIcinde(kok, path.join(kok, "..taslak", "a.png"))).toBe(true);
    // Büyük-küçük harf ayırmayan dosya sistemlerinde aynı klasör
    if (process.platform === "win32" || process.platform === "darwin") expect(kokunIcinde(kok, path.join(kok.toUpperCase(), "a.png"))).toBe(true);
  });

  it("Content-Disposition: görsel ve PDF satır içi, metin indirme; ASCII yedek ve UTF-8 ad", () => {
    expect(icerikYerlesimi({ ad: "ekran görüntüsü.png", tur: "gorsel" }, false)).toBe(`inline; filename="ekran g_r_nt_s_.png"; filename*=UTF-8''ekran%20g%C3%B6r%C3%BCnt%C3%BCs%C3%BC.png`);
    expect(icerikYerlesimi({ ad: "sayfa.html", tur: "metin" }, false)).toMatch(/^attachment; /);
    expect(icerikYerlesimi({ ad: "rapor.pdf", tur: "pdf" }, true)).toMatch(/^attachment; filename="rapor.pdf"/);
    expect(icerikYerlesimi({ ad: 'a"b.pdf', tur: "pdf" }, false)).toMatch(/filename="a_b.pdf"/);
  });
});

// ---------------------------------------------------------------------------
// Uçlar, ekli mesaj, ajana giden içerik, dosya_paylas
// ---------------------------------------------------------------------------

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let app: FastifyInstance;
let pid: string;
let projeYolu: string;
let digerPid: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];
const ANAHTAR = "ekler-anahtari-0123456789abcdef";
const HOST = "ekler.test";
const ceo = (): Ajan => depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
const ajan = (ad: string): Ajan => depo.ajanAdla(pid, ad)!;

async function istek(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as Record<string, unknown> | undefined, headers: { host: HOST, authorization: `Bearer ${ANAHTAR}` } });
}

async function yukle(ad: string, icerik: Buffer, proje = pid): Promise<MesajEki> {
  const y = await istek("POST", `/api/projeler/${proje}/ekler`, { ad, veri: icerik.toString("base64") });
  expect(y.statusCode, y.body).toBe(200);
  return y.json() as MesajEki;
}

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
async function arac(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const a = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((x) => x.name === ad);
  if (!a) throw new Error(`araç yok: ${ad}`);
  const s = await a.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}

/** Uyandırma casusu: alıcıya giden metinler */
function casus() {
  const uyandir = vi.spyOn(sirket, "ajanaMesaj").mockResolvedValue(undefined);
  return { metinler: (alici: string) => uyandir.mock.calls.filter(([a]) => a === alici).map(([, metin]) => metin) };
}

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-ekler-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Vitrin", yol: path.join(gecici, "vitrin"), olustur: true });
  pid = p.id;
  projeYolu = p.yol;
  digerPid = (await sirket.projeOlustur({ ad: "Öteki", yol: path.join(gecici, "oteki"), olustur: true })).id;
  sirket.iseAl(pid, { ad: "Deniz", rol: "frontend" });
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: ANAHTAR, studyoDizini: null, izinliHostlar: [HOST] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}, 30_000);

describe("yükleme ve sunum uçları", () => {
  it("görsel yüklenir: .arnorg/ekler'e yazılır, klasörün .gitignore'u yalnız kendisini izletir; sunum doğru başlıklarla", async () => {
    const ek = await yukle("C:\\Masaüstü\\ekran görüntüsü.png", PNG_1X1);
    expect(ek).toMatchObject({ ad: "ekran görüntüsü.png", tur: "gorsel", mime: "image/png", boyut: PNG_1X1.length, genislik: 1, yukseklik: 1 });
    const dizin = path.join(projeYolu, ".arnorg", "ekler");
    expect(ek.yol).toBe(path.join(dizin, `${ek.id}.png`));
    expect(fs.readFileSync(ek.yol)).toEqual(PNG_1X1);
    const yoksay = fs.readFileSync(path.join(dizin, ".gitignore"), "utf8");
    expect(yoksay).toMatch(/^\*$/m);
    expect(yoksay).toMatch(/^!\.gitignore$/m);

    const y = await istek("GET", `/api/ekler/${ek.id}`);
    expect(y.statusCode).toBe(200);
    expect(y.headers["content-type"]).toBe("image/png");
    expect(y.headers["x-content-type-options"]).toBe("nosniff");
    expect(y.headers["content-disposition"]).toMatch(/^inline; filename="ekran g_r_nt_s_.png"; filename\*=UTF-8''ekran%20g%C3%B6r%C3%BCnt%C3%BCs%C3%BC\.png$/);
    expect(y.headers["content-security-policy"]).toMatch(/sandbox/);
    expect(y.rawPayload).toEqual(PNG_1X1);
    expect((await istek("GET", `/api/ekler/${ek.id}?indir=1`)).headers["content-disposition"]).toMatch(/^attachment;/);
  });

  it("SVG ve HTML düz metin olarak, indirme diye sunulur; PDF satır içi", async () => {
    const svg = await yukle("logo.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(svg).toMatchObject({ tur: "metin", mime: "text/plain; charset=utf-8" });
    expect(svg.yol.endsWith(".svg")).toBe(true);
    const y = await istek("GET", `/api/ekler/${svg.id}`);
    expect(y.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(y.headers["content-disposition"]).toMatch(/^attachment; filename="logo.svg"/);
    expect(y.headers["x-content-type-options"]).toBe("nosniff");
    const pdf = await yukle("rapor.pdf", PDF);
    const p = await istek("GET", `/api/ekler/${pdf.id}`);
    expect(p.headers["content-type"]).toBe("application/pdf");
    expect(p.headers["content-disposition"]).toMatch(/^inline;/);
  });

  it("reddedilen yükleme dosya ve kayıt bırakmaz; büyük dosya çözülmeden 413", async () => {
    const dizin = path.join(projeYolu, ".arnorg", "ekler");
    const once = fs.readdirSync(dizin).length;
    const zip = await istek("POST", `/api/projeler/${pid}/ekler`, { ad: "proje.zip", veri: ZIP.toString("base64") });
    expect(zip.statusCode).toBe(415);
    expect(zip.json().hata).toMatch(/^Arşiv dosyaları/);
    const exe = await istek("POST", `/api/projeler/${pid}/ekler`, { ad: "kur.exe", veri: ELF.toString("base64") });
    expect(exe.json()).toEqual({ hata: "Çalıştırılabilir dosyalar eklenemez." });
    const buyuk = await istek("POST", `/api/projeler/${pid}/ekler`, { ad: "buyuk.png", veri: "A".repeat(Math.ceil(((EK_SINIRLARI.boyut + 3) * 4) / 3 / 4) * 4) });
    expect(buyuk.statusCode).toBe(413);
    expect(buyuk.json().hata).toMatch(/çok büyük/);
    expect((await istek("POST", `/api/projeler/${pid}/ekler`, { ad: "bos.txt", veri: "" })).statusCode).toBe(400);
    expect((await istek("POST", "/api/projeler/yok/ekler", { ad: "a.png", veri: PNG_1X1.toString("base64") })).statusCode).toBe(404);
    expect(fs.readdirSync(dizin)).toHaveLength(once);
    expect((await istek("GET", "/api/ekler/olmayan")).statusCode).toBe(404);
  });

  it("anahtarsız istek reddedilir", async () => {
    const ek = await yukle("a.png", PNG_1X1);
    const y = await app.inject({ method: "GET", url: `/api/ekler/${ek.id}`, headers: { host: HOST } });
    expect(y.statusCode).toBe(401);
  });

  it("taslak silinir (dosyasıyla); gönderilmiş ek silinmez", async () => {
    const ek = await yukle("vazgecilen.png", PNG_1X1);
    expect((await istek("DELETE", `/api/ekler/${ek.id}`)).statusCode).toBe(200);
    expect(fs.existsSync(ek.yol)).toBe(false);
    expect((await istek("GET", `/api/ekler/${ek.id}`)).statusCode).toBe(404);
    casus();
    const gonderilen = await yukle("gonderilen.png", PNG_1X1);
    expect((await istek("POST", `/api/projeler/${pid}/kanallar/genel/mesajlar`, { metin: "Bakın", ekler: [gonderilen.id] })).statusCode).toBe(200);
    const sil = await istek("DELETE", `/api/ekler/${gonderilen.id}`);
    expect(sil.statusCode).toBe(409);
    expect(fs.existsSync(gonderilen.yol)).toBe(true);
  });
});

describe("ekli kanal mesajı", () => {
  it("kurulun ekli mesajı: ekler mesajla yazılır, olayla gelir; CEO'ya giden metinde ek listesi, görsel satır içi işaretli", async () => {
    const { metinler } = casus();
    const gorsel = await yukle("ekran.png", PNG_1X1);
    const pdf = await yukle("rapor.pdf", PDF);
    const y = await istek("POST", `/api/projeler/${pid}/kanallar/yonetim/mesajlar`, { metin: "Bu ekranda ne görüyorsun?", ekler: [gorsel.id, pdf.id] });
    expect(y.statusCode, y.body).toBe(200);
    const m = y.json() as Mesaj;
    expect(m.ekler?.map((e) => e.id)).toEqual([gorsel.id, pdf.id]);
    expect(m.ekler?.[0]).toEqual(gorsel);
    const liste = (await istek("GET", `/api/projeler/${pid}/kanallar/yonetim/mesajlar`)).json() as Mesaj[];
    expect(liste.at(-1)?.ekler).toEqual([gorsel, pdf]);
    const olay = gelenler.find((o) => o.tur === "mesaj.yeni" && o.mesaj.id === m.id);
    expect(olay?.tur === "mesaj.yeni" && olay.mesaj.ekler).toHaveLength(2);

    const giden = metinler(ceo().id).at(-1)!;
    expect(giden).toContain("#yonetim · Yönetim kurulu: Bu ekranda ne görüyorsun?\n\nEkler (2):\n");
    expect(giden).toContain(`1) ekran.png (görsel, 1×1, ${PNG_1X1.length} B): görsel bu mesajda · \`${gorsel.yol}\``);
    expect(giden).toContain(`2) rapor.pdf (PDF, ${PDF.length} B): Read ile aç: ${pdf.yol}`);

    // Mesaja ancak gönderenin kendi taslağı bir kez bağlanır
    const ikinci = await istek("POST", `/api/projeler/${pid}/kanallar/yonetim/mesajlar`, { metin: "Yeniden", ekler: [gorsel.id] });
    expect(ikinci.statusCode).toBe(409);
    expect(ikinci.json().hata).toBe('"ekran.png" zaten gönderildi; yeniden ekleyin.');
  });

  it("yalnız ekli mesajın metni boş olabilir; eksiz boş mesaj, başka projenin eki ve sınırı aşan ek sayısı reddedilir", async () => {
    const { metinler } = casus();
    const ek = await yukle("yalniz.png", PNG_1X1);
    const y = await istek("POST", `/api/projeler/${pid}/kanallar/yonetim/mesajlar`, { metin: "", ekler: [ek.id] });
    expect(y.statusCode).toBe(200);
    expect(y.json()).toMatchObject({ metin: "", ekler: [{ id: ek.id }] });
    expect(metinler(ceo().id).at(-1)).toMatch(/^#yonetim · Yönetim kurulu: \[yalnız ek\]\n\nEkler \(1\):/);
    const bos = await istek("POST", `/api/projeler/${pid}/kanallar/yonetim/mesajlar`, { metin: "  " });
    expect(bos.statusCode).toBe(400);
    expect(bos.json().hata).toBe("Mesaj boş olamaz.");
    const yabanci = await yukle("oteki.png", PNG_1X1, digerPid);
    expect((await istek("POST", `/api/projeler/${pid}/kanallar/genel/mesajlar`, { metin: "x", ekler: [yabanci.id] })).statusCode).toBe(404);
    const cok = await istek("POST", `/api/projeler/${pid}/kanallar/genel/mesajlar`, { metin: "x", ekler: Array.from({ length: EK_SINIRLARI.mesajBasina + 1 }, (_, i) => `e${i}`) });
    expect(cok.statusCode).toBe(400);
  });

  it("kanal_oku eklerin adlarını ve yollarını gösterir", async () => {
    casus();
    const ek = await yukle("tablo.csv", Buffer.from("ad;adet\nkalem;3\n"));
    await istek("POST", `/api/projeler/${pid}/kanallar/genel/mesajlar`, { metin: "Sayım listesi", ekler: [ek.id] });
    const r = await arac(ceo().id, "kanal_oku", { kanal: "genel", sinir: 5 });
    expect(r.metin).toContain(`Yönetim kurulu: Sayım listesi [ekler: tablo.csv → ${ek.yol}]`);
  });
});

describe("ajana giden içerik", () => {
  it("ters tırnaktaki ek görseli görsel bloğu olur: adı önce, görsel, metin en sonda", async () => {
    const ek = await yukle("ekran.png", PNG_1X1);
    const metin = `#yonetim · Yönetim kurulu: Ne görüyorsun?${ekMetni([ek])}`;
    const icerik = mesajIcerigi(metin);
    expect(Array.isArray(icerik)).toBe(true);
    expect(icerik).toEqual([
      { type: "text", text: "ekran.png" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_1X1.toString("base64") } },
      { type: "text", text: metin },
    ]);
  });

  it("eksiz metin, ters tırnaksız yol, görsel olmayan dosya ve sınırı aşan görsel metin olarak kalır", async () => {
    expect(mesajIcerigi("Merhaba")).toBe("Merhaba");
    const ek = await yukle("ekran.png", PNG_1X1);
    expect(mesajIcerigi(`Yol: ${ek.yol}`)).toBe(`Yol: ${ek.yol}`);
    // Uzantısı .png olan metin dosyası görsel olarak gitmez
    const sahte = path.join(path.dirname(ek.yol), "0123456789abcdef.png");
    fs.writeFileSync(sahte, "bu bir görsel değil");
    expect(mesajIcerigi(`\`${sahte}\``)).toBe(`\`${sahte}\``);
    // 3000×2000 görsel satır içi değil: ek listesi Read ile açmasını söyler
    const buyuk = await yukle("buyuk.png", pngBasligi(3000, 2000));
    const metin = ekMetni([buyuk]);
    expect(metin).toContain(`1) buyuk.png (görsel, 3000×2000, 33 B): büyük görsel, Read ile aç: ${buyuk.yol}`);
    expect(mesajIcerigi(`\`${buyuk.yol}\``)).toBe(`\`${buyuk.yol}\``);
  });

  it("aynı görsel bir kez girer; adet ve toplam bayt bütçesi uygulanır", async () => {
    const ek = await yukle("tekrar.png", PNG_1X1);
    const icerik = mesajIcerigi(`\`${ek.yol}\` ve yine \`${ek.yol}\``);
    expect(Array.isArray(icerik) && icerik.filter((b) => b.type === "image")).toHaveLength(1);
    const cok = await Promise.all(Array.from({ length: SATIR_ICI_GORSEL.adet + 2 }, (_, i) => yukle(`g${i}.png`, PNG_1X1)));
    const liste = ekMetni(cok);
    expect(liste.match(/görsel bu mesajda/g)).toHaveLength(SATIR_ICI_GORSEL.adet);
    const blok = mesajIcerigi(liste);
    expect(Array.isArray(blok) && blok.filter((b) => b.type === "image")).toHaveLength(SATIR_ICI_GORSEL.adet);
  });

  it("İngilizcede ek listesi İngilizce", async () => {
    dilKaynagi(() => "en");
    try {
      const ek = await yukle("screen.png", PNG_1X1);
      expect(ekMetni([ek])).toBe(`\n\nAttachments (1):\n1) screen.png (image, 1×1, ${PNG_1X1.length} B): the image is in this message · \`${ek.yol}\``);
    } finally {
      dilKaynagi(() => sirket.yapilandirma.ayarlar.dil);
    }
  });
});

describe("dosya_paylas", () => {
  it("CEO proje içindeki görseli paylaşır: kopyalanır, #yonetim'e ekli mesaj olarak düşer", async () => {
    fs.mkdirSync(path.join(projeYolu, "docs"), { recursive: true });
    fs.writeFileSync(path.join(projeYolu, "docs", "uygulama.png"), PNG_1X1);
    const r = await arac(ceo().id, "dosya_paylas", { yol: "docs/uygulama.png", aciklama: "Teslimden sonra uygulamanın hâli" });
    expect(r.hata, r.metin).toBe(false);
    expect(r.metin).toMatch(/^uygulama\.png \(görsel, \d+ B\) #yonetim kanalında paylaşıldı; kurul sohbette görüyor\./);
    const m = depo.mesajlar(pid, "yonetim").at(-1)!;
    expect(m).toMatchObject({ gonderenId: ceo().id, metin: "Teslimden sonra uygulamanın hâli", ekler: [{ ad: "uygulama.png", tur: "gorsel", genislik: 1, yukseklik: 1 }] });
    const ek = m.ekler![0]!;
    expect(path.dirname(ek.yol)).toBe(path.join(projeYolu, ".arnorg", "ekler"));
    expect(fs.readFileSync(ek.yol)).toEqual(PNG_1X1);
  });

  it("çalışan #yonetim'e paylaşamaz; varsayılanı #genel; @anılan ekli metinle uyanır", async () => {
    const { metinler } = casus();
    fs.writeFileSync(path.join(projeYolu, "notlar.md"), "# Notlar\n\nÖlçüler hazır.\n");
    const yonetim = await arac(ajan("Deniz").id, "dosya_paylas", { yol: path.join(projeYolu, "notlar.md"), kanal: "yonetim" });
    expect(yonetim.hata).toBe(true);
    expect(yonetim.metin).toMatch(/kurul ile CEO arasındadır/);
    const r = await arac(ajan("Deniz").id, "dosya_paylas", { yol: path.join(projeYolu, "notlar.md"), aciklama: `@${ceo().ad} ölçüler burada` });
    expect(r.hata, r.metin).toBe(false);
    const m = depo.mesajlar(pid, "genel").at(-1)!;
    expect(m.ekler?.[0]).toMatchObject({ ad: "notlar.md", tur: "metin" });
    expect(metinler(ceo().id).at(-1)).toContain(`1) notlar.md (metin, .md, `);
  });

  it("gizli dosya, gizli içerik, proje dışı dosya ve proje dışını gösteren bağlantı reddedilir; kopya kalmaz", async () => {
    const dizin = path.join(projeYolu, ".arnorg", "ekler");
    const once = fs.readdirSync(dizin).length;
    fs.writeFileSync(path.join(projeYolu, ".env"), "API=1\n");
    const env = await arac(ceo().id, "dosya_paylas", { yol: ".env" });
    expect(env).toEqual({ metin: "Gizli dosyalar (.env, anahtar ve sertifika dosyaları, kimlik bilgileri) paylaşılamaz.", hata: true });
    fs.writeFileSync(path.join(projeYolu, "anahtar.pem"), "x");
    expect((await arac(ceo().id, "dosya_paylas", { yol: "anahtar.pem" })).hata).toBe(true);
    fs.writeFileSync(path.join(projeYolu, "ayar.txt"), "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n");
    expect((await arac(ceo().id, "dosya_paylas", { yol: "ayar.txt" })).metin).toMatch(/gizli bilgi/);
    const disari = path.join(gecici, "disarida.png");
    fs.writeFileSync(disari, PNG_1X1);
    const dis = await arac(ceo().id, "dosya_paylas", { yol: disari });
    expect(dis.hata).toBe(true);
    expect(dis.metin).toMatch(/^Yalnız proje içindeki dosyalar/);
    expect((await arac(ceo().id, "dosya_paylas", { yol: "yok.png" })).metin).toMatch(/^Dosya bulunamadı/);
    expect((await arac(ceo().id, "dosya_paylas", { yol: "docs" })).metin).toMatch(/^Bu bir dosya değil/);
    if (process.platform !== "win32") {
      fs.symlinkSync(disari, path.join(projeYolu, "baglanti.png"));
      expect((await arac(ceo().id, "dosya_paylas", { yol: "baglanti.png" })).metin).toMatch(/^Yalnız proje içindeki dosyalar/);
    }
    expect(fs.readdirSync(dizin)).toHaveLength(once);
  });

  it("ArnOrg'un geçici klasöründeki ekran görüntüsü paylaşılabilir", async () => {
    const dizin = ekGeciciDizini();
    fs.mkdirSync(dizin, { recursive: true });
    const dosya = path.join(dizin, `test-ekran-${process.pid}-${Date.now()}.png`);
    fs.writeFileSync(dosya, PNG_1X1);
    try {
      const r = await arac(ceo().id, "dosya_paylas", { yol: dosya });
      expect(r.hata, r.metin).toBe(false);
    } finally {
      fs.rmSync(dosya, { force: true });
    }
  });

  it("talimat eklerden ve dosya_paylas'tan söz eder (CEO ve çalışan, iki dilde)", () => {
    const ic = sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string };
    expect(ic.talimatOlustur(ceo(), projeYolu)).toContain(ekTalimati(true, "tr").join("\n"));
    expect(ekTalimati(true, "tr")[1]).toMatch(/mcp__arnorg__dosya_paylas .*Varsayılan olarak kurulla sohbetine gider/);
    expect(ekTalimati(false, "tr")[1]).toMatch(/yanıt yazdığın kanala, yoksa #genel'e gider/);
    expect(ekTalimati(true, "en")[0]).toMatch(/^- Messages can carry attachments: the "Attachments" list/);
    expect(ekTalimati(false, "en")[1]).toMatch(/screenshot of the running app after a delivery/);
  });
});

describe("serbest konuşmada ekler", () => {
  it("geçmiş satırında eklerin adları, uyandırma metninin sonunda en son mesajın ek listesi", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const ek = await yukle("taslak.png", PNG_1X1);
      const eski = await yukle("eski.pdf", PDF);
      const kanal: Kanal = { ad: "tasarim", aciklama: "", mesajSayisi: 0, ozel: true, uyeler: ["a"], konusma: "durdu", konu: null, konusmaBaslangic: null, olusturma: "" };
      const mesaj = (id: string, gonderenId: string, metin: string, ekler: MesajEki[]): Mesaj => ({
        id,
        projeId: "p",
        kanal: "tasarim",
        gonderenId,
        gonderenAd: gonderenId === KURUL ? "Yönetim kurulu" : "Ada",
        metin,
        anilanlar: [],
        zaman: new Date().toISOString(),
        ekler,
      });
      const mesajlar = [mesaj("m1", "a", "Eski taslak", [eski]), mesaj("m2", KURUL, "Bu taslak nasıl?", [ek])];
      const uyandirilan: string[] = [];
      const b: KonusmaBaglami = {
        kanal: () => ({ ...kanal }),
        durumYaz: () => undefined,
        surenKonusmalar: () => [],
        ajan: (id) => (id === "a" ? { id: "a", ad: "Ada", projeId: "p", durum: "bosta" } : null),
        mesajlar: () => mesajlar,
        sinirda: () => false,
        siradaMi: () => false,
        uyandir: async (_id, metin) => {
          uyandirilan.push(metin);
          return true;
        },
        yaziyor: () => undefined,
        duyur: () => undefined,
        bekleme: () => 0,
      };
      new KanalKonusmasi(b).olay({ tur: "mesaj.yeni", mesaj: mesajlar[1]! });
      await vi.advanceTimersByTimeAsync(0);
      const metin = uyandirilan[0]!;
      expect(metin).toContain("- Ada: [ekler: eski.pdf] Eski taslak");
      expect(metin).toContain("- Yönetim kurulu: [ekler: taslak.png] Bu taslak nasıl?");
      expect(metin).not.toContain(eski.yol);
      expect(metin.endsWith(`\n\nEkler (1):\n1) taslak.png (görsel, 1×1, ${PNG_1X1.length} B): görsel bu mesajda · \`${ek.yol}\``)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
