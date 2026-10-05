// Tanıtım alanı: kök README.md'nin yayındaki ve taslak hâli, git künyesi, güncelleme isteğinin uzmana ya da CEO'ya
// gitmesi, canlı tanitim.degisti olayı, rol kataloğu ve CEO talimatındaki satır. Claude Code oturumu açılmaz; git
// commit'leri testin kendi kimliğiyle atılır.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { KURUL, rolMetni, type Ajan, type Onay, type Proje, type SunucuOlayi, type TanitimDurumu } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { dilKaynagi } from "./dil.js";
import * as gitIslemleri from "./git.js";
import { OlayYolu } from "./olaylar.js";
import { ROLLER, rolBul } from "./roller.js";
import { hazirlikTalimati, Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { readmeMetni, Tanitim, TANITIM_ISTEK, TANITIM_SINIRI, tanitimTalimati } from "./tanitim.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";
import { rolYetenekleri } from "./yetenekler.js";

/** Testin git kimliğiyle komut (makinedeki yapılandırmadan bağımsız) */
const gitc = (dizin: string, ...arg: string[]) =>
  execFileSync("git", ["-c", "user.name=Deniz Yazar", "-c", "user.email=deniz@ornek.com", ...arg], { cwd: dizin, encoding: "utf8" }).trim();
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ILK = "# Vitrin\n\nKüçük işletmeler için sipariş takibi.\n";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let app: FastifyInstance;
let pid: string;
let repo: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];
const anahtar = "test-anahtari-tanitim-0123456789";

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-tanitim-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Vitrin", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  repo = p.yol;
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
  await app.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await app.close();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const basliklar = () => ({ host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` });
async function durum(projeId = pid): Promise<TanitimDurumu> {
  const y = await app.inject({ url: `/api/projeler/${projeId}/tanitim`, headers: basliklar() });
  expect(y.statusCode, y.body).toBe(200);
  return y.json() as TanitimDurumu;
}
const talimat = (a: Ajan) => (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(a, "/tmp");
const ceoBul = (projeId: string) => depo.ajanlar(projeId).find((a) => a.rol === "ceo")!;

describe("tanıtım durumu", () => {
  it("README.md yokken boş durum döner", async () => {
    expect(await durum()).toEqual({ dosya: "README.md", var: false, icerik: null, son: null, taslak: null, uzman: null, guncellemeIstendi: null });
  });

  it("README.md'yi ve çalışma dalındaki son commit künyesini verir; kaydedilmemiş düzenleme içerikte görünür", async () => {
    fs.writeFileSync(path.join(repo, "README.md"), ILK);
    gitc(repo, "add", "README.md");
    gitc(repo, "commit", "-q", "-m", "README: ilk tanıtım");
    const commit = gitc(repo, "rev-parse", "HEAD");
    const d = await durum();
    expect(d).toMatchObject({ dosya: "README.md", var: true, icerik: ILK, taslak: null, uzman: null });
    expect(d.son).toMatchObject({ commit, yazar: "Deniz Yazar", mesaj: "README: ilk tanıtım" });
    expect(new Date(d.son!.zaman).toISOString()).toBe(d.son!.zaman);
    // Ana repoda henüz commit'lenmemiş düzenleme: içerik dosyadan, künye son commit'ten gelir
    fs.writeFileSync(path.join(repo, "README.md"), "# Vitrin\n\nDüzenleniyor.\n");
    const d2 = await durum();
    expect(d2.icerik).toBe("# Vitrin\n\nDüzenleniyor.\n");
    expect(d2.son?.commit).toBe(commit);
    gitc(repo, "checkout", "--", "README.md");
  });

  it("büyük README'nin ilk 512 KB'ı yarım satır atılarak notla verilir; BOM atılır", () => {
    const bom = Buffer.from("﻿# Baş\n");
    expect(readmeMetni(bom, bom.length)).toBe("# Baş\n");
    const uzun = Buffer.from("satır\n".repeat(120_000));
    const m = readmeMetni(uzun, uzun.length);
    expect(Buffer.byteLength(m)).toBeLessThanOrEqual(TANITIM_SINIRI + 120);
    expect(m.startsWith("satır\nsatır\n")).toBe(true);
    expect(m).toMatch(/satır\n\n\*README\.md 512 KB'tan büyük; ilk 512 KB gösteriliyor\.\*\n$/);
  });

  it("README.md alanın dışını gösteren bir bağlantıysa okunmaz", async () => {
    const dis = path.join(gecici, "dis");
    fs.mkdirSync(path.join(dis, "repo-baglanti"), { recursive: true });
    fs.writeFileSync(path.join(dis, "gizli.md"), "# Gizli\n");
    const baglantili = path.join(dis, "repo-baglanti");
    try {
      fs.symlinkSync(path.join(dis, "gizli.md"), path.join(baglantili, "README.md"));
    } catch {
      return; // sembolik bağlantı açılamayan ortam (Windows yetkisiz)
    }
    const { readmeOku } = await import("./tanitim.js");
    expect(await readmeOku(baglantili)).toBeNull();
  });

  it("tanıtım uzmanının alanındaki farklı README.md taslak görünür; birleşince yayına geçer, geride kalan alan taslak sayılmaz", async () => {
    const tuna = sirket.iseAl(pid, { ad: "Tuna", rol: "tanitim" });
    expect(tuna).toMatchObject({ rol: "tanitim", rolAdi: "Tanıtım uzmanı", model: "sonnet" });
    expect(tuna.yetenekler).toEqual(expect.arrayContaining(["web_arama", "web_okuma", "github_arastirma"]));
    const alan = path.join(gecici, "calisma", "tuna");
    await gitIslemleri.worktreeAc(repo, alan, "arnorg/tuna", "main");
    depo.ajanGuncelle(tuna.id, { calismaAlani: alan, dal: "arnorg/tuna" });
    // Alan ana repoyla aynı: taslak yok
    expect(await durum()).toMatchObject({ icerik: ILK, taslak: null, uzman: { id: tuna.id, ad: "Tuna", durum: "kapali" } });

    const yeni = "# Vitrin\n\nSipariş, stok ve kargo tek ekranda.\n\n## Özellikler\n\n- Sipariş listesi\n";
    fs.writeFileSync(path.join(alan, "README.md"), yeni);
    const d = await durum();
    expect(d.icerik).toBe(ILK);
    expect(d.taslak).toMatchObject({ ajanId: tuna.id, ajanAd: "Tuna", icerik: yeni });
    expect(new Date(d.taslak!.zaman).toISOString()).toBe(d.taslak!.zaman);

    // Commit'lenip çalışma dalına birleşince taslak kalmaz; künye uzmanın commit'ini gösterir
    gitc(alan, "add", "README.md");
    gitc(alan, "commit", "-q", "-m", "README: özellikler");
    const uzmanCommit = gitc(alan, "rev-parse", "HEAD");
    gitc(repo, "merge", "-q", "--no-ff", "-m", "arnorg/tuna birleşti", "arnorg/tuna");
    const sonra = await durum();
    expect(sonra).toMatchObject({ var: true, icerik: yeni, taslak: null });
    expect(sonra.son).toMatchObject({ commit: uzmanCommit, mesaj: "README: özellikler" });

    // Ana repo ilerledi, uzman README'ye dokunmadı: alandaki eski hâl taslak değildir
    fs.writeFileSync(path.join(repo, "README.md"), `${yeni}- Kargo takibi\n`);
    gitc(repo, "commit", "-q", "-m", "README: kargo", "--", "README.md");
    expect((await durum()).taslak).toBeNull();
  });

  it("bilinmeyen proje 404", async () => {
    const y = await app.inject({ url: "/api/projeler/yok/tanitim", headers: basliklar() });
    expect(y.statusCode).toBe(404);
  });
});

describe("güncelleme isteği", () => {
  it("tanıtım uzmanı varsa ona kurul kaynağıyla gider: not iletilir, istek anı kaydedilir, tanitim.degisti yayınlanır", async () => {
    const s = sirket as unknown as { ajanaMesaj: (id: string, metin: string, oncelik?: string, kaynak?: unknown) => Promise<void> };
    const asil = s.ajanaMesaj;
    const giden: { id: string; metin: string; kaynak: unknown }[] = [];
    s.ajanaMesaj = async (id, metin, _oncelik, kaynak) => {
      giden.push({ id, metin, kaynak });
    };
    try {
      const once = gelenler.length;
      const y = await app.inject({ method: "POST", url: `/api/projeler/${pid}/tanitim/guncelle`, headers: basliklar(), payload: { not: "Ekran görüntüsünü de ekle." } });
      expect(y.statusCode, y.body).toBe(200);
      const tuna = depo.ajanAdla(pid, "Tuna")!;
      expect(y.json()).toEqual({ kime: "uzman", ajanId: tuna.id, ajanAd: "Tuna" });
      expect(giden).toHaveLength(1);
      expect(giden[0]).toMatchObject({ id: tuna.id, kaynak: { tur: "kurul" } });
      expect(giden[0]!.metin).toContain("Kurulun notu: Ekran görüntüsünü de ekle.");
      expect(giden[0]!.metin).toContain("birlestirme_iste");
      const istendi = depo.deger(TANITIM_ISTEK + pid);
      expect(istendi).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect((await durum()).guncellemeIstendi).toBe(istendi);
      await bekle(450);
      expect(gelenler.slice(once).filter((o) => o.tur === "tanitim.degisti" && o.projeId === pid)).toHaveLength(1);
    } finally {
      s.ajanaMesaj = asil;
    }
  });

  it("uzman yoksa istek kurulun mesajı olarak #yonetim'e yazılır ve CEO'ya gider", async () => {
    const p2 = await sirket.projeOlustur({ ad: "Uzmansız", yol: path.join(gecici, "repo2"), olustur: true });
    const ceo = ceoBul(p2.id);
    const y = await app.inject({ method: "POST", url: `/api/projeler/${p2.id}/tanitim/guncelle`, headers: basliklar(), payload: {} });
    expect(y.statusCode, y.body).toBe(200);
    expect(y.json()).toEqual({ kime: "ceo", ajanId: ceo.id, ajanAd: ceo.ad });
    const m = depo.mesajlar(p2.id, "yonetim").find((x) => x.gonderenId === KURUL)!;
    expect(m.metin).toContain("Tanıtım uzmanı (rol: tanitim)");
    expect(m.metin).toContain("ise_al_teklif");
    expect(m.metin).not.toContain("Notum");
    expect((await durum(p2.id)).guncellemeIstendi).not.toBeNull();
  });

  it("uzun not 400; CEO da yoksa 409", async () => {
    const uzun = await app.inject({ method: "POST", url: `/api/projeler/${pid}/tanitim/guncelle`, headers: basliklar(), payload: { not: "x".repeat(2001) } });
    expect(uzun.statusCode).toBe(400);
    const proje = { id: "p", ad: "P", yol: gecici, varsayilanDal: "main" } as Proje;
    const t = new Tanitim({
      depo: { proje: () => proje, ajan: () => null, ajanlar: () => [], deger: () => null, degerYaz: () => undefined },
      olaylar: new OlayYolu(),
      uzmanaYaz: async () => undefined,
      ceoyaYaz: async () => undefined,
    });
    try {
      await expect(t.guncelle("p", "not")).rejects.toMatchObject({ durumKodu: 409 });
    } finally {
      t.durdur();
    }
  });
});

describe("canlı olay", () => {
  const onay = (veri: unknown): Onay => ({
    id: "o1",
    projeId: pid,
    ajanId: null,
    tur: "birlestirme",
    baslik: "arnorg/tuna → main",
    ayrinti: "",
    veri,
    durum: "onaylandi",
    olusturma: new Date().toISOString(),
    sonGecerlilik: null,
    sonuclanma: new Date().toISOString(),
    not: null,
  });

  it("kök README.md ana repoda ya da uzmanın alanında değişince ve iş birleşince tek olay yayınlanır", async () => {
    const yol = new OlayYolu();
    const yayinlar: SunucuOlayi[] = [];
    yol.dinle((o) => {
      if (o.tur === "tanitim.degisti") yayinlar.push(o);
    });
    const t = new Tanitim({ depo, olaylar: yol, uzmanaYaz: async () => undefined, ceoyaYaz: async () => undefined, gecikmeMs: 10 });
    try {
      const tuna = depo.ajanAdla(pid, "Tuna")!;
      const ece = sirket.iseAl(pid, { ad: "Ece", rol: "frontend" });
      // Ana repoda art arda iki değişiklik: tek olay
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "README.md", ajanId: null });
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "README.md", ajanId: null });
      await bekle(50);
      expect(yayinlar).toEqual([{ tur: "tanitim.degisti", projeId: pid }]);
      // Alt klasördeki README ve başka rolün alanı yayın açmaz
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "docs/README.md", ajanId: null });
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: ece.id, yol: "README.md", ajanId: ece.id });
      await bekle(50);
      expect(yayinlar).toHaveLength(1);
      // Uzmanın alanı
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: tuna.id, yol: "README.md", ajanId: tuna.id });
      await bekle(50);
      expect(yayinlar).toHaveLength(2);
      // Kalite kapısını geçip birleşen iş yayın açar; kuyruktaki açmaz
      yol.yayinla({ tur: "onay.sonuc", onay: onay({ ajanId: tuna.id, dal: "arnorg/tuna", ozet: "README", kalite: { durum: "kuyrukta" } }) });
      await bekle(50);
      expect(yayinlar).toHaveLength(2);
      yol.yayinla({ tur: "onay.sonuc", onay: onay({ ajanId: tuna.id, dal: "arnorg/tuna", ozet: "README", kalite: { durum: "birlesti" } }) });
      await bekle(50);
      expect(yayinlar).toHaveLength(3);
    } finally {
      t.durdur();
    }
  });
});

describe("rol ve talimat", () => {
  it("tanıtım uzmanı rolü katalogun sonunda: sonnet, yönetici değil, web ve GitHub yetenekli, iki dilde", () => {
    const r = ROLLER.at(-1)!;
    expect(r).toMatchObject({ kimlik: "tanitim", ad: "Tanıtım uzmanı", varsayilanModel: "sonnet", yonetici: false });
    expect(rolBul("tanitim")).toBe(r);
    expect(rolMetni(r, "en")).toMatchObject({ ad: "Product marketer" });
    for (const t of [r.talimat, r.en!.talimat]) {
      expect(t).toContain("README.md");
      expect(t).toContain("birlestirme_iste");
      // Web araçlarının adları talimatın yetenek satırlarından gelir: kapalı yetenek anılmasın
      expect(t).not.toMatch(/web_ara|web_oku|github_ara|WebSearch|WebFetch/);
    }
    expect(r.talimat).toMatch(/Kod yazmaz/);
    expect(r.en!.talimat).toMatch(/You do not write code/);
    expect(rolYetenekleri("tanitim")).toEqual(["web_arama", "web_okuma", "github_arastirma", "claude_web"]);
  });

  it("uzmanın talimatında rolü ve açık web yetenekleri yer alır", () => {
    const t = talimat(depo.ajanAdla(pid, "Tuna")!);
    expect(t).toContain("Tanıtım uzmanısın. Projenin kök README.md dosyası senindir");
    expect(t).toContain("mcp__arnorg__web_ara");
    expect(t).toContain("mcp__arnorg__github_ara");
    // CEO'ya giden satır uzmana girmez
    expect(t).not.toContain("(Tanıtım uzmanı) kurulun Tanıtım alanında");
  });

  it("CEO talimatı: uzman yoksa işe almasını, varsa teslimlerden sonra README'yi güncelletmesini söyler", async () => {
    expect(tanitimTalimati({ rol: "ceo" }, [{ ad: "Deniz", rol: "backend" }], "tr")).toEqual([expect.stringContaining("ise_al_teklif ile bir Tanıtım uzmanı (rol: tanitim) öner")]);
    expect(tanitimTalimati({ rol: "ceo" }, [], "en")).toEqual([expect.stringContaining("propose a Product marketer (role: tanitim) with ise_al_teklif")]);
    expect(tanitimTalimati({ rol: "ceo" }, [{ ad: "Tuna", rol: "tanitim" }], "en")).toEqual([expect.stringMatching(/^- Tuna \(Product marketer\) owns the root README\.md/)]);
    expect(tanitimTalimati({ rol: "backend" }, [{ ad: "Tuna", rol: "tanitim" }], "tr")).toEqual([]);

    // Uzmanı olan proje
    const tr = talimat(ceoBul(pid));
    expect(tr).toContain("- Tuna (Tanıtım uzmanı) kurulun Tanıtım alanında okuduğu kök README.md'nin sahibidir.");
    expect(tr).not.toContain("(rol: tanitim) öner");
    dilKaynagi(() => "en");
    try {
      expect(talimat(ceoBul(pid))).toContain("- Tuna (Product marketer) owns the root README.md the board reads in the Showcase area.");
    } finally {
      dilKaynagi(() => sirket.yapilandirma.ayarlar.dil);
    }
    // Uzmansız proje
    const p3 = await sirket.projeOlustur({ ad: "Yeni Ekip", yol: path.join(gecici, "repo3"), olustur: true });
    sirket.iseAl(p3.id, { ad: "Kerem", rol: "backend" });
    const bos = talimat(ceoBul(p3.id));
    expect(bos).toContain("- Ekipte Tanıtım uzmanı yok. Kurul projeyi Stüdyo'nun Tanıtım alanında kök README.md'den okur");
    expect(bos).not.toContain("(Tanıtım uzmanı) kurulun Tanıtım alanında");
    // Hazırlık görüşmesi de ilk ekibe uzmanı katar
    expect(hazirlikTalimati("Yeni Ekip")).toContain("Tanıtım uzmanı (rol: tanitim)");
  });

  it("işe alım teklifi tanıtım uzmanı rolünü bilir; onaylanınca uzman ekibe katılır", async () => {
    const p4 = await sirket.projeOlustur({ ad: "Teklif", yol: path.join(gecici, "repo4"), olustur: true });
    const ceo = ceoBul(p4.id);
    type Arac = { name: string; inputSchema: Record<string, z.ZodType>; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
    const ise = (arnorgAracListesi(sirket, ceo.id) as unknown as Arac[]).find((t) => t.name === "ise_al_teklif")!;
    expect(z.toJSONSchema(z.object(ise.inputSchema))).toMatchObject({ properties: { rol: { description: expect.stringContaining("tanitim") } } });
    const sonuc = await ise.handler({ ad: "Lale", rol: "tanitim", gerekce: "Kurul projeyi Tanıtım alanından okuyacak; README.md'yi yazacak biri gerek." }, {});
    expect(sonuc.isError).toBeFalsy();
    const teklif = depo.onaylar(p4.id, "bekliyor").find((o) => o.tur === "ise_alim")!;
    expect(teklif.baslik).toBe("İşe alım: Lale · Tanıtım uzmanı");
    await sirket.onayKarari(teklif.id, "onayla");
    expect(depo.ajanAdla(p4.id, "Lale")).toMatchObject({ rol: "tanitim", rolAdi: "Tanıtım uzmanı", model: "sonnet" });
    expect((await durum(p4.id)).uzman).toMatchObject({ ad: "Lale" });
  });
});
