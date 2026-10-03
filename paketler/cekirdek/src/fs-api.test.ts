// Kod düzenleyici uçları: dosya sistemi, hızlı açma listesi, metin araması ve git (Claude Code oturumu açılmaz)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { FsDurumu, FsGirdisi, GitDurumu, MetinAramaSonucu, SunucuOlayi } from "@arnorg/ortak";
import { Depo } from "./depo.js";
import { durumAyristir } from "./fs-api.js";
import * as gitIslemleri from "./git.js";
import { desenDerle, dosyadaAra, globDuzenli, yolSuzgeci } from "./kod-arama.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let app: FastifyInstance;
let pid: string;
let repo: string;
let h: Record<string, string>;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];
const anahtar = "fs-anahtari-0123456789abcdef";

const git = (dizin: string, ...arg: string[]) => execFileSync("git", arg, { cwd: dizin, encoding: "utf8" });

beforeAll(async () => {
  gecici = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-fs-")));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Kod", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  repo = p.yol;
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const selam = 'merhaba';\nconst Selam = 2;\n// selamlar\n");
  fs.writeFileSync(path.join(repo, "src", "b.js"), "console.log('merhaba dünya');\n");
  fs.writeFileSync(path.join(repo, ".gitignore"), "gizli/\n");
  fs.mkdirSync(path.join(repo, "gizli"));
  fs.writeFileSync(path.join(repo, "gizli", "x.txt"), "merhaba\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "Başlangıç");
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
  await app.listen({ port: 0, host: "127.0.0.1" });
  h = { host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` };
});

afterAll(async () => {
  await app.close();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

const url = (u: string, q: Record<string, string> = {}) => `/api/projeler/${pid}/${u}?${new URLSearchParams({ alan: "ana", ...q })}`;

describe("dosya sistemi", () => {
  it("stat, liste ve içerik döner; yoksa 404, kök dışına 400", async () => {
    const s = (await app.inject({ url: url("fs/stat", { yol: "src/a.ts" }), headers: h })).json() as FsDurumu;
    expect(s).toMatchObject({ tur: "dosya", baglanti: false, saltOkunur: false, duzenleyenAjanId: null });
    expect(s.boyut).toBe(fs.statSync(path.join(repo, "src/a.ts")).size);
    expect(s.degisme).toBeGreaterThan(0);
    expect(((await app.inject({ url: url("fs/stat", { yol: "" }), headers: h })).json() as FsDurumu).tur).toBe("klasor");
    expect((await app.inject({ url: url("fs/stat", { yol: "yok.ts" }), headers: h })).statusCode).toBe(404);
    expect((await app.inject({ url: url("fs/stat", { yol: "../disari" }), headers: h })).statusCode).toBe(400);

    const liste = (await app.inject({ url: url("fs/liste", { yol: "src" }), headers: h })).json() as FsGirdisi[];
    expect(liste.map((g) => g.ad).sort()).toEqual(["a.ts", "b.js"]);
    expect((await app.inject({ url: url("fs/liste"), headers: h })).json()).toEqual(expect.arrayContaining([{ ad: "src", tur: "klasor", baglanti: false }]));

    const icerik = await app.inject({ url: url("fs/icerik", { yol: "src/b.js" }), headers: h });
    expect(icerik.headers["content-type"]).toBe("application/octet-stream");
    expect(icerik.body).toBe("console.log('merhaba dünya');\n");
    expect((await app.inject({ url: url("fs/icerik", { yol: "src" }), headers: h })).statusCode).toBe(400);
  });

  it("alan dışını gösteren sembolik bağlantıyı açmaz", async () => {
    if (process.platform === "win32") return;
    const disari = path.join(gecici, "disari.txt");
    fs.writeFileSync(disari, "gizli");
    fs.symlinkSync(disari, path.join(repo, "bag.txt"));
    fs.symlinkSync(path.join(repo, "src", "a.ts"), path.join(repo, "ic-bag.ts"));
    expect((await app.inject({ url: url("fs/liste"), headers: h })).json()).toContainEqual({ ad: "bag.txt", tur: "baglanti", baglanti: true });
    expect((await app.inject({ url: url("fs/stat", { yol: "bag.txt" }), headers: h })).statusCode).toBe(403);
    expect((await app.inject({ url: url("fs/icerik", { yol: "bag.txt" }), headers: h })).statusCode).toBe(403);
    const ic = (await app.inject({ url: url("fs/stat", { yol: "ic-bag.ts" }), headers: h })).json() as FsDurumu;
    expect(ic).toMatchObject({ tur: "dosya", baglanti: true });
    fs.rmSync(path.join(repo, "bag.txt"));
    fs.rmSync(path.join(repo, "ic-bag.ts"));
  });

  it("ham bayt yazar; olustur/ustune bayraklarına uyar, .git'e yazmaz, kilit ve olay bırakır", async () => {
    const ikili = Buffer.from([0, 1, 2, 255, 10, 13]);
    const yaz = (yol: string, govde: Buffer, q: Record<string, string> = {}) =>
      app.inject({ method: "PUT", url: url("fs/icerik", { yol, ...q }), headers: { ...h, "content-type": "application/octet-stream" }, payload: govde });
    expect((await yaz("yeni/c.bin", ikili)).statusCode).toBe(404);
    const once = gelenler.length;
    const r = await yaz("yeni/c.bin", ikili, { olustur: "1" });
    expect(r.statusCode).toBe(200);
    expect((r.json() as FsDurumu).boyut).toBe(6);
    expect(fs.readFileSync(path.join(repo, "yeni/c.bin")).equals(ikili)).toBe(true);
    expect(gelenler.slice(once)).toContainEqual({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "yeni/c.bin", ajanId: null });
    expect(sirket.kullaniciKilitleri.get(path.join(repo, "yeni/c.bin"))).toBeGreaterThan(Date.now());
    expect((await yaz("yeni/c.bin", Buffer.from("x"), { olustur: "1" })).statusCode).toBe(409);
    expect((await yaz("yeni/c.bin", Buffer.from("x"), { ustune: "1" })).statusCode).toBe(200);
    expect(fs.readFileSync(path.join(repo, "yeni/c.bin"), "utf8")).toBe("x");
    expect((await yaz(".git/config", Buffer.from("x"), { ustune: "1" })).statusCode).toBe(403);
    expect(((await app.inject({ url: url("fs/stat", { yol: ".git/config" }), headers: h })).json() as FsDurumu).saltOkunur).toBe(true);
  });

  it("ajanın düzenlediği dosya salt okunurdur; ajan durunca yazılabilir olur", async () => {
    const deniz = sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
    const tam = path.join(repo, "src", "a.ts");
    sirket.duzenlemeler.set(tam, { ajanId: deniz.id, zaman: Date.now() });
    depo.ajanGuncelle(deniz.id, { durum: "calisiyor" });
    const s = (await app.inject({ url: url("fs/stat", { yol: "src/a.ts" }), headers: h })).json() as FsDurumu;
    expect(s).toMatchObject({ saltOkunur: true, duzenleyenAjanId: deniz.id });
    const ret = await app.inject({ method: "PUT", url: url("fs/icerik", { yol: "src/a.ts", ustune: "1" }), headers: { ...h, "content-type": "application/octet-stream" }, payload: Buffer.from("x") });
    expect(ret.statusCode).toBe(409);
    expect(ret.json()).toEqual({ hata: "Deniz bu dosyayı düzenliyor. Önce ajanı duraklatın." });
    depo.ajanGuncelle(deniz.id, { durum: "duraklatildi" });
    expect(((await app.inject({ url: url("fs/stat", { yol: "src/a.ts" }), headers: h })).json() as FsDurumu).saltOkunur).toBe(false);
  });

  it("klasör açar, taşır ve siler", async () => {
    expect((await app.inject({ method: "POST", url: `/api/projeler/${pid}/fs/klasor`, headers: h, payload: { alan: "ana", yol: "k1" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/projeler/${pid}/fs/klasor`, headers: h, payload: { alan: "ana", yol: "k1" } })).statusCode).toBe(409);
    fs.writeFileSync(path.join(repo, "k1", "d.txt"), "d");
    const tasi = (kaynak: string, hedef: string, ustune?: boolean) =>
      app.inject({ method: "POST", url: `/api/projeler/${pid}/fs/tasi`, headers: h, payload: { alan: "ana", kaynak, hedef, ustune } });
    expect((await tasi("k1/d.txt", "k2/e.txt")).statusCode).toBe(200);
    expect(fs.readFileSync(path.join(repo, "k2/e.txt"), "utf8")).toBe("d");
    fs.writeFileSync(path.join(repo, "k1", "f.txt"), "f");
    expect((await tasi("k1/f.txt", "k2/e.txt")).statusCode).toBe(409);
    expect((await tasi("k1/f.txt", "k2/e.txt", true)).statusCode).toBe(200);
    expect(fs.readFileSync(path.join(repo, "k2/e.txt"), "utf8")).toBe("f");
    const sil = (yol: string, ozyinelemeli = false) => app.inject({ method: "DELETE", url: url("fs", { yol, ...(ozyinelemeli ? { ozyinelemeli: "1" } : {}) }), headers: h });
    expect((await sil("k2")).statusCode).toBe(409);
    expect((await sil("k2", true)).statusCode).toBe(200);
    expect((await sil("k1")).statusCode).toBe(200);
    expect((await sil("")).statusCode).toBe(403);
    expect((await sil(".git", true)).statusCode).toBe(403);
    expect(fs.existsSync(path.join(repo, "k2"))).toBe(false);
  });
});

describe("hızlı açma ve arama", () => {
  it("git'in izlediği ve yok sayılmayan dosyaları listeler", async () => {
    const liste = (await app.inject({ url: url("fs/dosyalar"), headers: h })).json() as string[];
    expect(liste).toEqual(expect.arrayContaining(["src/a.ts", "src/b.js", "CLAUDE.md", "yeni/c.bin"]));
    expect(liste).not.toContain("gizli/x.txt");
    expect(liste.some((y) => y.startsWith(".git/"))).toBe(false);
  });

  it("düzenli ifade, büyük/küçük harf, tam sözcük ve dahil/hariç desenleriyle arar", async () => {
    const ara = async (govde: Record<string, unknown>) =>
      (await app.inject({ method: "POST", url: `/api/projeler/${pid}/fs/ara`, headers: h, payload: { alan: "ana", ...govde } })).json() as MetinAramaSonucu;
    const hepsi = await ara({ desen: "selam" });
    expect(hepsi.dosyalar.map((d) => d.yol)).toEqual(["src/a.ts"]);
    expect(hepsi.dosyalar[0]!.eslesmeler.map((e) => [e.satir, e.sutun, e.sonSutun])).toEqual([
      [0, 13, 18],
      [1, 6, 11],
      [2, 3, 8],
    ]);
    expect((await ara({ desen: "Selam", harfDuyarli: true })).dosyalar[0]!.eslesmeler).toHaveLength(1);
    expect((await ara({ desen: "selam", tamSozcuk: true })).dosyalar[0]!.eslesmeler).toHaveLength(2);
    expect((await ara({ desen: "merhaba( dünya)?", regex: true })).dosyalar.map((d) => d.yol)).toEqual(["src/a.ts", "src/b.js"]);
    expect((await ara({ desen: "merhaba", dahil: ["**/*.js"] })).dosyalar.map((d) => d.yol)).toEqual(["src/b.js"]);
    expect((await ara({ desen: "merhaba", haric: ["src/a.ts"] })).dosyalar.map((d) => d.yol)).toEqual(["src/b.js"]);
    expect((await ara({ desen: "merhaba", haric: ["**/src"] })).dosyalar).toEqual([]);
    const sinirli = await ara({ desen: "e", sinir: 2 });
    expect(sinirli.sinirAsildi).toBe(true);
    expect(sinirli.dosyalar.reduce((t, d) => t + d.eslesmeler.length, 0)).toBe(2);
    const kotu = await app.inject({ method: "POST", url: `/api/projeler/${pid}/fs/ara`, headers: h, payload: { alan: "ana", desen: "(", regex: true } });
    expect(kotu.statusCode).toBe(400);
  });

  it("glob ve satır hesapları", () => {
    expect(globDuzenli("**/*.ts").test("a.ts")).toBe(true);
    expect(globDuzenli("**/*.ts").test("src/x/a.ts")).toBe(true);
    expect(globDuzenli("src/**").test("src/x/a.ts")).toBe(true);
    expect(globDuzenli("src/**").test("src")).toBe(true);
    expect(globDuzenli("{**/*.md,**/*.ts}").test("docs/a.md")).toBe(true);
    expect(globDuzenli("*.ts").test("src/a.ts")).toBe(false);
    expect(globDuzenli("a?[bc].js").test("axc.js")).toBe(true);
    const suz = yolSuzgeci(["src/**"], ["**/node_modules"]);
    expect(suz("src/a.ts")).toBe(true);
    expect(suz("src/node_modules/x/a.ts")).toBe(false);
    expect(suz("docs/a.md")).toBe(false);
    const e = dosyadaAra("bir\r\niki üç\nüç dört", desenDerle("üç", { tamSozcuk: true }), 10);
    expect(e.map((x) => [x.satir, x.sutun, x.onizleme])).toEqual([
      [1, 4, "iki üç"],
      [2, 0, "üç dört"],
    ]);
    const cok = dosyadaAra("a\nbc\nd", desenDerle("a\\nb", { regex: true }), 10);
    expect(cok[0]).toMatchObject({ satir: 0, sutun: 0, sonSatir: 1, sonSutun: 1, onizleme: "a\nbc" });
  });
});

describe("git", () => {
  const durum = async (alan = "ana") => (await app.inject({ url: url("git/durum", { alan }), headers: h })).json() as GitDurumu;
  const post = (u: string, payload: Record<string, unknown>) => app.inject({ method: "POST", url: `/api/projeler/${pid}/git/${u}`, headers: h, payload });

  it("porcelain çıktısını gruplara ayırır", () => {
    const d = durumAyristir("M  a.ts\0 M b.ts\0R  yeni.ts\0eski.ts\0?? c.ts\0UU d.ts\0MM e.ts\0");
    expect(d.hazirlanan).toEqual([
      { yol: "a.ts", tur: "M" },
      { yol: "yeni.ts", tur: "R", eskiYol: "eski.ts" },
      { yol: "e.ts", tur: "M" },
    ]);
    expect(d.degisen).toEqual([
      { yol: "b.ts", tur: "M" },
      { yol: "c.ts", tur: "?" },
      { yol: "e.ts", tur: "M" },
    ]);
    expect(d.cakisan).toEqual([{ yol: "d.ts", tur: "U" }]);
  });

  it("durum, aşamaya alma, geri alma, değişiklik atma ve imzasız commit", async () => {
    fs.writeFileSync(path.join(repo, "src", "b.js"), "console.log('değişti');\n");
    let d = await durum();
    expect(d).toMatchObject({ repo: true, ana: true, dal: "main" });
    expect(d.degisen).toEqual(expect.arrayContaining([{ yol: "src/b.js", tur: "M" }, { yol: "yeni/c.bin", tur: "?" }]));
    expect((await post("hazirla", { alan: "ana", yollar: ["src/b.js"] })).statusCode).toBe(200);
    d = await durum();
    expect(d.hazirlanan).toEqual([{ yol: "src/b.js", tur: "M" }]);
    expect((await post("hazirlamayi-geri-al", { alan: "ana", yollar: ["src/b.js"] })).statusCode).toBe(200);
    expect((await durum()).hazirlanan).toEqual([]);

    // HEAD ve indeks sürümleri
    const head = await app.inject({ url: url("git/icerik", { yol: "src/b.js", ref: "HEAD" }), headers: h });
    expect(head.body).toBe("console.log('merhaba dünya');\n");
    expect((await app.inject({ url: url("git/icerik", { yol: "yeni/c.bin", ref: "HEAD" }), headers: h })).statusCode).toBe(404);

    // Değişiklikleri at: izlenen dosya geri döner, izlenmeyen silinir
    fs.writeFileSync(path.join(repo, "silinecek.txt"), "x");
    expect((await post("degisiklikleri-at", { alan: "ana", yollar: ["src/b.js", "silinecek.txt"] })).statusCode).toBe(200);
    expect(fs.readFileSync(path.join(repo, "src", "b.js"), "utf8")).toBe("console.log('merhaba dünya');\n");
    expect(fs.existsSync(path.join(repo, "silinecek.txt"))).toBe(false);

    expect((await post("commit", { alan: "ana", mesaj: "Boş" })).statusCode).toBe(409);
    expect((await post("commit", { alan: "ana", mesaj: "  " })).statusCode).toBe(400);
    const c = await post("commit", { alan: "ana", mesaj: "Kod düzenleyiciden commit", tumu: true });
    expect(c.statusCode).toBe(200);
    expect((c.json() as { commit: string }).commit).toMatch(/^[0-9a-f]{40}$/);
    expect(git(repo, "log", "-1", "--format=%B").trim()).toBe("Kod düzenleyiciden commit");
    expect(git(repo, "log", "-1", "--format=%an <%ae>").trim()).toBe(`${git(repo, "config", "user.name").trim()} <${git(repo, "config", "user.email").trim()}>`);
    expect((await durum()).degisen).toEqual([]);
  });

  it("ajan alanında temel dala göre değişiklikleri verir, git işlemlerini reddeder", async () => {
    const emre = sirket.iseAl(pid, { ad: "Emre", rol: "backend" });
    const hedef = path.join(gecici, "calisma", "emre");
    await gitIslemleri.worktreeAc(repo, hedef, "arnorg/emre", "main");
    depo.ajanGuncelle(emre.id, { calismaAlani: hedef, dal: "arnorg/emre" });
    expect((await sirket.calismaAlanlari(pid)).map((a) => a.kimlik)).toEqual(["ana", emre.id]);

    fs.writeFileSync(path.join(hedef, "src", "a.ts"), "export const selam = 'emre';\n");
    fs.writeFileSync(path.join(hedef, "src", "yeni.ts"), "export {};\n");
    git(hedef, "add", "src/yeni.ts");
    git(hedef, "commit", "-q", "-m", "Emre: yeni dosya");
    fs.writeFileSync(path.join(hedef, "notlar.md"), "# Not\n");

    const d = await durum(emre.id);
    expect(d).toMatchObject({ ana: false, dal: "arnorg/emre", temelDal: "main" });
    expect(d.temeleGore).toEqual([
      { yol: "notlar.md", tur: "A" },
      { yol: "src/a.ts", tur: "M" },
      { yol: "src/yeni.ts", tur: "A" },
    ]);
    // Temel sürüm: main'deki içerik
    const temel = await app.inject({ url: url("git/icerik", { alan: emre.id, yol: "src/a.ts", ref: "temel" }), headers: h });
    expect(temel.body).toContain("'merhaba'");
    // Çalışma alanı dosyası aynı uçlarla okunur
    const icerik = await app.inject({ url: url("fs/icerik", { alan: emre.id, yol: "src/a.ts" }), headers: h });
    expect(icerik.body).toContain("'emre'");
    expect((await post("commit", { alan: emre.id, mesaj: "x", tumu: true })).statusCode).toBe(403);
    expect((await post("hazirla", { alan: emre.id, yollar: ["notlar.md"] })).statusCode).toBe(403);
    expect((await app.inject({ url: url("fs/stat", { alan: "yok-alan", yol: "" }), headers: h })).statusCode).toBe(404);
  });
});

describe("statik sunum", () => {
  it(".wasm application/wasm ile, sayfa çapraz köken yalıtım başlıklarıyla sunulur", async () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-studyo-"));
    fs.writeFileSync(path.join(dizin, "index.html"), "<!doctype html><title>ArnOrg</title>");
    fs.mkdirSync(path.join(dizin, "assets"));
    fs.writeFileSync(path.join(dizin, "assets", "onig-abc.wasm"), Buffer.from([0, 97, 115, 109]));
    const s = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: dizin, izinliHostlar: [] });
    await s.listen({ port: 0, host: "127.0.0.1" });
    const hs = { host: `127.0.0.1:${(s.server.address() as { port: number }).port}` };
    const wasm = await s.inject({ url: "/assets/onig-abc.wasm", headers: hs });
    expect(wasm.headers["content-type"]).toBe("application/wasm");
    const sayfa = await s.inject({ url: "/", headers: hs });
    expect(sayfa.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(sayfa.headers["cross-origin-embedder-policy"]).toBe("credentialless");
    const api = await s.inject({ url: "/api/saglik", headers: { ...hs, authorization: `Bearer ${anahtar}` } });
    expect(api.headers["cross-origin-embedder-policy"]).toBeUndefined();
    await s.close();
    fs.rmSync(dizin, { recursive: true, force: true });
  });
});
