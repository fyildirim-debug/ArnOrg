// Proje açma (varsayılan klasör, çalışma dalı), proje ayarları ve uzak depoyla eşitleme (yerel bir "uzak" depo ile)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
const git = (dizin: string, ...a: string[]) => execFileSync("git", a, { cwd: dizin, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Deneme", GIT_AUTHOR_EMAIL: "d@e.f", GIT_COMMITTER_NAME: "Deneme", GIT_COMMITTER_EMAIL: "d@e.f" } }).trim();

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-github-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  yap.guncelle({ projeKoku: path.join(gecici, "projeler") });
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("proje açma ve çalışma dalı", () => {
  it("yol verilmezse proje kökünde açar; seçilen dalda çalışır; hazırlık bekler", async () => {
    const p = await sirket.projeOlustur({ ad: "Örnek Proje", olustur: true, dal: "gelistirme" });
    // Windows'ta geçici dizin kısa adla (RUNNER~1) gelebilir; iki tarafı da sistemin çözdüğü uzun yola çevir
    expect(fs.realpathSync.native(p.yol)).toBe(fs.realpathSync.native(path.join(gecici, "projeler", "ornek-proje")));
    expect(p.varsayilanDal).toBe("gelistirme");
    expect(git(p.yol, "symbolic-ref", "--short", "HEAD")).toBe("gelistirme");
    expect(p.hazirlik).toBe("bekliyor");
    expect(p.uzakAdres).toBeNull();
    expect(depo.kanallar(p.id).map((k) => k.ad)).toContain("yonetim");
    // Proje dosyaları seçilen dalı anar
    expect(fs.readFileSync(path.join(p.yol, "CLAUDE.md"), "utf8")).toContain("gelistirme");
  });

  it("var olan repoyu bağlarken klasör ister, geçersiz dalı reddeder", async () => {
    await expect(sirket.projeOlustur({ ad: "Yolsuz", olustur: false })).rejects.toThrow(/klasörünü seçin/);
    await expect(sirket.projeOlustur({ ad: "Kötü dal", olustur: true, dal: "a..b" })).rejects.toThrow(/Geçersiz dal/);
  });
});

describe("uzak depoyla eşitleme", () => {
  let uzak: string;
  let baska: string;
  const proje = () => depo.projeler()[0]!;

  it("uzak dalı yokken gönderir ve uzak adresi kaydeder", async () => {
    uzak = path.join(gecici, "uzak.git");
    execFileSync("git", ["init", "--bare", "-b", "gelistirme", uzak]);
    git(proje().yol, "remote", "add", "origin", uzak);
    const s = await sirket.esitle(proje().id, true);
    expect(s.durum).toBe("gonderildi");
    expect(proje().uzakAdres).toBe(uzak);
    expect(git(uzak, "rev-parse", "gelistirme")).toBe(git(proje().yol, "rev-parse", "HEAD"));
  });

  it("uzakta yeni commit varsa ve ağaç temizse ileri sarar", async () => {
    baska = path.join(gecici, "baska");
    execFileSync("git", ["clone", "-q", "-b", "gelistirme", uzak, baska]);
    fs.writeFileSync(path.join(baska, "yeni.txt"), "uzaktan\n");
    git(baska, "add", "yeni.txt");
    git(baska, "commit", "-q", "-m", "Uzaktan yeni dosya");
    git(baska, "push", "-q", "origin", "gelistirme");
    const s = await sirket.esitle(proje().id);
    expect(s.durum).toBe("cekildi");
    // Windows'ta git satır sonunu CRLF'ye çevirebilir (core.autocrlf)
    expect(fs.readFileSync(path.join(proje().yol, "yeni.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("uzaktan\n");
    expect((await sirket.esitle(proje().id)).durum).toBe("guncel");
  });

  it("ortak çalışma kopyası kirliyken ileri sarma yalnız kaydedilmemiş dosyalara dokunmuyorsa yapılır", async () => {
    // Çalışanın kaydedilmemiş işi başka bir dosyada: uzaktaki commit yine çekilir, iş yerinde kalır
    fs.writeFileSync(path.join(proje().yol, "yeni.txt"), "yerelde yarım\n");
    fs.writeFileSync(path.join(baska, "baska-dosya.txt"), "uzak\n");
    git(baska, "add", ".");
    git(baska, "commit", "-q", "-m", "Uzak: başka dosya");
    git(baska, "push", "-q", "origin", "gelistirme");
    expect((await sirket.esitle(proje().id)).durum).toBe("cekildi");
    expect(fs.existsSync(path.join(proje().yol, "baska-dosya.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(proje().yol, "yeni.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("yerelde yarım\n");
    // Uzaktaki commit kaydedilmemiş dosyaya dokunuyor: hiçbir şey değişmez
    fs.writeFileSync(path.join(baska, "yeni.txt"), "uzakta değişti\n");
    git(baska, "commit", "-q", "-am", "Uzak: yeni.txt");
    git(baska, "push", "-q", "origin", "gelistirme");
    const once = git(proje().yol, "rev-parse", "HEAD");
    const s = await sirket.esitle(proje().id);
    expect(s.durum).toBe("kirli");
    expect(git(proje().yol, "rev-parse", "HEAD")).toBe(once);
    expect(fs.readFileSync(path.join(proje().yol, "yeni.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("yerelde yarım\n");
    // İş kaydedilmiş gibi: yerel değişiklik geri alınınca çekilir
    git(proje().yol, "checkout", "--", "yeni.txt");
    expect((await sirket.esitle(proje().id)).durum).toBe("cekildi");
  });

  it("iki taraf da ilerlediyse dokunmaz, ayrışmayı bildirir", async () => {
    fs.writeFileSync(path.join(baska, "uzak2.txt"), "u\n");
    git(baska, "add", ".");
    git(baska, "commit", "-q", "-m", "Uzak 2");
    git(baska, "push", "-q", "origin", "gelistirme");
    fs.writeFileSync(path.join(proje().yol, "yerel.txt"), "y\n");
    git(proje().yol, "add", "yerel.txt");
    git(proje().yol, "commit", "-q", "-m", "Yerel");
    const once = git(proje().yol, "rev-parse", "HEAD");
    const s = await sirket.esitle(proje().id, true);
    expect(s.durum).toBe("ayrisik");
    expect(s).toMatchObject({ onde: 1, geride: 1 });
    expect(git(proje().yol, "rev-parse", "HEAD")).toBe(once);
  });

  it("çalışma dalını değiştirir: ana repo yeni dala geçer, dallar listelenir", async () => {
    const p = await sirket.projeGuncelle(proje().id, { varsayilanDal: "surum-1", otomatikGonder: false });
    expect(p.varsayilanDal).toBe("surum-1");
    expect(p.otomatikGonder).toBe(false);
    expect(git(p.yol, "symbolic-ref", "--short", "HEAD")).toBe("surum-1");
    const d = await sirket.projeDallari(p.id);
    expect(d).toMatchObject({ mevcut: "surum-1", calisma: "surum-1" });
    expect(d.yerel).toEqual(expect.arrayContaining(["gelistirme", "surum-1"]));
    const e = await sirket.esitle(p.id);
    expect(e.durum).toBe("guncel");
  });
});
