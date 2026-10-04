// Ajan çalışma alanlarının (git worktree) temizliği: ayrılan ajanın temiz alanı kaldırılır, kirli alana dokunulmaz,
// bayat kayıtlar budanır. Gerçek geçici git deposuyla.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SunucuOlayi } from "@arnorg/ortak";
import { Depo } from "./depo.js";
import * as gitIslemleri from "./git.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-calisma-alani-"));
});

afterAll(() => {
  fs.rmSync(gecici, { recursive: true, force: true });
});

/** İlk commit'i olan yeni bir repo; node_modules yok sayılır */
async function repoAc(ad: string): Promise<string> {
  const repo = path.join(gecici, ad);
  await gitIslemleri.repoBaslat(repo, "main");
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  await gitIslemleri.tumunuCommitle(repo, "ilk");
  return repo;
}

const kayitliMi = async (repo: string, yol: string) => (await gitIslemleri.worktreeler(repo)).some((w) => gitIslemleri.ayniYol(w.yol, yol));

describe("git: worktree yardımcıları", () => {
  it("temiz alanı kaldırır; dal ve commit'ler kalır, yok sayılan dosyalar engel olmaz", async () => {
    const repo = await repoAc("temiz");
    const alan = path.join(gecici, "alanlar", "temiz-deniz");
    await gitIslemleri.worktreeAc(repo, alan, "arnorg/deniz", "main");
    fs.writeFileSync(path.join(alan, "b.txt"), "b\n");
    await gitIslemleri.tumunuCommitle(alan, "Deniz'in işi");
    fs.mkdirSync(path.join(alan, "node_modules", "x"), { recursive: true });
    fs.writeFileSync(path.join(alan, "node_modules", "x", "i.js"), "1\n");

    expect(await gitIslemleri.commitlenmemisSayisi(alan)).toBe(0);
    expect(await gitIslemleri.worktreeKaldir(repo, alan)).toEqual({ durum: "kaldirildi" });
    expect(fs.existsSync(alan)).toBe(false);
    expect(await kayitliMi(repo, alan)).toBe(false);
    expect(await gitIslemleri.dalVarMi(repo, "arnorg/deniz")).toBe(true);
    expect((await gitIslemleri.git(repo, ["log", "--format=%s", "arnorg/deniz"])).split("\n")[0]).toBe("Deniz'in işi");
  });

  it("commit'lenmemiş (izlenmeyen dahil) değişikliği olan alana dokunmaz", async () => {
    const repo = await repoAc("kirli");
    const alan = path.join(gecici, "alanlar", "kirli-ece");
    await gitIslemleri.worktreeAc(repo, alan, "arnorg/ece", "main");
    fs.writeFileSync(path.join(alan, "yeni.txt"), "yeni\n");
    fs.appendFileSync(path.join(alan, "a.txt"), "değişti\n");

    expect(await gitIslemleri.worktreeKaldir(repo, alan)).toEqual({ durum: "kirli", degisiklik: 2 });
    expect(fs.readFileSync(path.join(alan, "yeni.txt"), "utf8")).toBe("yeni\n");
    expect(await kayitliMi(repo, alan)).toBe(true);
  });

  it("repoya kayıtlı olmayan klasöre dokunmaz; klasörü silinmiş kaydı budar", async () => {
    const repo = await repoAc("kayitsiz");
    const yabanci = path.join(gecici, "yabanci");
    fs.mkdirSync(yabanci, { recursive: true });
    fs.writeFileSync(path.join(yabanci, "onemli.txt"), "dokunma\n");
    expect(await gitIslemleri.worktreeKaldir(repo, yabanci)).toEqual({ durum: "kayitsiz" });
    expect(fs.existsSync(path.join(yabanci, "onemli.txt"))).toBe(true);

    const alan = path.join(gecici, "alanlar", "kayitsiz-mert");
    await gitIslemleri.worktreeAc(repo, alan, "arnorg/mert", "main");
    fs.rmSync(alan, { recursive: true, force: true });
    expect(await kayitliMi(repo, alan)).toBe(true);
    expect(await gitIslemleri.worktreeKaldir(repo, alan)).toEqual({ durum: "kayitsiz" });
    expect(await kayitliMi(repo, alan)).toBe(false);
    expect(await gitIslemleri.dalVarMi(repo, "arnorg/mert")).toBe(true);
  });

  it("klasörü elle silinmiş alanı yeniden açar (bayat kayıt önce budanır)", async () => {
    const repo = await repoAc("yeniden");
    const alan = path.join(gecici, "alanlar", "yeniden-ada");
    await gitIslemleri.worktreeAc(repo, alan, "arnorg/ada", "main");
    fs.rmSync(alan, { recursive: true, force: true });
    await gitIslemleri.worktreeAc(repo, alan, "arnorg/ada", "main");
    expect(fs.existsSync(path.join(alan, "a.txt"))).toBe(true);
  });
});

describe("şirket: işten çıkarılan ajanın çalışma alanı", () => {
  let depo: Depo;
  let sirket: Sirket;
  let pid: string;
  let repo: string;
  const gelenler: SunucuOlayi[] = [];

  beforeAll(async () => {
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    const olaylar = new OlayYolu();
    olaylar.dinle((o) => gelenler.push(o));
    sirket = new Sirket(depo, olaylar, yap, () => null, true);
    const p = await sirket.projeOlustur({ ad: "Alanlar", yol: path.join(gecici, "proje"), olustur: true });
    pid = p.id;
    repo = p.yol;
  });

  afterAll(() => {
    sirket.kapat();
    depo.kapat();
  });

  /** Ajanı işe alır ve ArnOrg'un kuralıyla (arnorg/<ad> dalı) worktree'sini açar */
  async function alanliAjan(ad: string) {
    const a = sirket.iseAl(pid, { ad, rol: "backend" });
    const dal = `arnorg/${ad.toLowerCase()}`;
    const yol = path.join(sirket.yapilandirma.calismaKoku, "alanlar", ad.toLowerCase());
    await gitIslemleri.worktreeAc(repo, yol, dal, "main");
    depo.ajanGuncelle(a.id, { calismaAlani: yol, dal });
    return { id: a.id, yol, dal };
  }

  it("temiz alan kaldırılır, dal kalır, kanala not düşülmez", async () => {
    const { id, yol, dal } = await alanliAjan("Deniz");
    fs.writeFileSync(path.join(yol, "is.txt"), "iş\n");
    await gitIslemleri.tumunuCommitle(yol, "Deniz: iş");

    await sirket.istenCikar(id, null, "Yönetim kurulu");
    expect(fs.existsSync(yol)).toBe(false);
    expect(await kayitliMi(repo, yol)).toBe(false);
    expect(await gitIslemleri.dalVarMi(repo, dal)).toBe(true);
    expect(depo.mesajlar(pid, "genel").some((m) => m.metin.includes("worktree"))).toBe(false);
  });

  it("kirli alan kalır; ayrılık duyurusundan sonra #genel'e ve kurula not düşülür", async () => {
    const { id, yol } = await alanliAjan("Ece");
    fs.writeFileSync(path.join(yol, "yarim.txt"), "yarım iş\n");
    const once = gelenler.length;

    await sirket.istenCikar(id, null, "Yönetim kurulu");
    expect(fs.existsSync(path.join(yol, "yarim.txt"))).toBe(true);
    expect(await kayitliMi(repo, yol)).toBe(true);
    const genel = depo.mesajlar(pid, "genel").map((m) => m.metin);
    const ayrilik = genel.findIndex((m) => m.startsWith("Ece (") && m.includes("ayrıldı"));
    const not = genel.findIndex((m) => m.includes("commit'lenmemiş 1 değişiklik") && m.includes(yol));
    expect(ayrilik).toBeGreaterThanOrEqual(0);
    expect(not).toBeGreaterThan(ayrilik);
    expect(gelenler.slice(once).some((o) => o.tur === "bildirim" && o.seviye === "uyari" && o.metin.includes("worktree silinmedi"))).toBe(true);
  });

  it("açılışta bayat worktree kayıtları budanır", async () => {
    const yol = path.join(sirket.yapilandirma.calismaKoku, "alanlar", "eski");
    await gitIslemleri.worktreeAc(repo, yol, "arnorg/eski", "main");
    fs.rmSync(yol, { recursive: true, force: true });
    expect(await kayitliMi(repo, yol)).toBe(true);
    await sirket.calismaAlanlariniBuda();
    expect(await kayitliMi(repo, yol)).toBe(false);
    expect(await gitIslemleri.dalVarMi(repo, "arnorg/eski")).toBe(true);
  });
});
