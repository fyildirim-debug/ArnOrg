// Tanıtım alanı: kök README.md'nin yayındaki (çalışma dalına commit'lenmiş) ve taslak (ortak projede henüz
// kaydedilmemiş) hâli, git künyesi, güncelleme isteğinin uzmana ya da CEO'ya gitmesi, canlı tanitim.degisti olayı, rol
// kataloğu ve CEO talimatındaki satır. Claude Code oturumu açılmaz; testin kendi commit'leri kendi kimliğiyle atılır.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { gorevKaydiOlayi, KURUL, rolMetni, type Ajan, type GorevKaydi, type Proje, type SunucuOlayi, type TanitimDurumu } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { dilKaynagi } from "./dil.js";
import { OlayYolu } from "./olaylar.js";
import { bosKalite } from "./ortak-calisma/kayitlar.js";
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
    // Windows'ta git README'yi CRLF çıkarır; metin LF'ye indirgenir ki taslak karşılaştırması tutsun
    const crlf = Buffer.from("# Baş\r\n\r\nMetin\r\n", "utf8");
    expect(readmeMetni(crlf, crlf.length)).toBe("# Baş\n\nMetin\n");
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

  it("ortak projede henüz kaydedilmemiş README.md taslak görünür; yazanı kiracısıdır; görev kaydedilince yayına geçer", async () => {
    const tuna = sirket.iseAl(pid, { ad: "Tuna", rol: "tanitim" });
    // Tanıtım destek kademesindedir: Normal seviyede Haiku
    expect(tuna).toMatchObject({ rol: "tanitim", rolAdi: "Tanıtım uzmanı", model: "haiku", modelSabit: false });
    expect(tuna.yetenekler).toEqual(expect.arrayContaining(["web_arama", "web_okuma", "github_arastirma"]));
    // Çalışma kopyası çalışma dalıyla aynı: taslak yok
    expect(await durum()).toMatchObject({ icerik: ILK, taslak: null, uzman: { id: tuna.id, ad: "Tuna", durum: "kapali" } });

    // Uzman README.md'yi ortak projede yazar (dosya ona kiralanır)
    const g = sirket.gorevOlustur(pid, { baslik: "README özellikleri", atananId: tuna.id });
    await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" });
    const dosya = path.join(repo, "README.md");
    const yeni = "# Vitrin\n\nSipariş, stok ve kargo tek ekranda.\n\n## Özellikler\n\n- Sipariş listesi\n";
    await sirket.kapi(tuna.id, "Write", { file_path: dosya, content: yeni });
    fs.writeFileSync(dosya, yeni);
    const d = await durum();
    expect(d.icerik).toBe(ILK);
    expect(d.taslak).toMatchObject({ ajanId: tuna.id, ajanAd: "Tuna", icerik: yeni });
    expect(new Date(d.taslak!.zaman).toISOString()).toBe(d.taslak!.zaman);

    // ArnOrg görevi kaydedince taslak kalmaz; künye görevin commit'ini gösterir
    const kayit = await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara");
    expect(kayit?.dosyalar).toEqual(["README.md"]);
    const sonra = await durum();
    expect(sonra).toMatchObject({ var: true, icerik: yeni, taslak: null });
    expect(sonra.son).toMatchObject({ commit: kayit!.commit, mesaj: `${g.kod} README özellikleri` });

    // README'yi başka bir çalışan düzenliyorsa taslağın yazanı odur (kira sahibi)
    const mert = sirket.iseAl(pid, { ad: "Mert", rol: "backend" });
    const g2 = sirket.gorevOlustur(pid, { baslik: "Kurulum bölümü", atananId: mert.id });
    await sirket.gorevGuncelle(g2.id, { durum: "calisiliyor" });
    await sirket.kapi(mert.id, "Write", { file_path: dosya, content: `${yeni}\n## Kurulum\n` });
    fs.writeFileSync(dosya, `${yeni}\n## Kurulum\n`);
    expect((await durum()).taslak).toMatchObject({ ajanId: mert.id, ajanAd: "Mert" });
    await sirket.ortak.gorevKaydet(depo.gorev(g2.id)!, "ara");
    expect(await durum()).toMatchObject({ icerik: `${yeni}\n## Kurulum\n`, taslak: null });
    depo.gorevGuncelle(g.id, { durum: "tamam" });
    depo.gorevGuncelle(g2.id, { durum: "tamam" });
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
      expect(giden[0]!.metin).toContain("isi_kaydet");
      expect(giden[0]!.metin).not.toContain("birlestirme_iste");
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
  const kayit = (dosyalar: string[]): GorevKaydi => ({
    id: "k1",
    projeId: pid,
    gorevId: null,
    gorevKodu: "T-9",
    baslik: "T-9 README",
    ajanId: null,
    ajanAd: "Tuna",
    commit: "0".repeat(40),
    dal: "main",
    dosyalar,
    eklenen: 1,
    silinen: 0,
    neden: "inceleme",
    zaman: new Date().toISOString(),
    kalite: bosKalite("testsiz"),
  });

  it("kök README.md ortak projede değişince ve README'li bir görev kaydedilince tek olay yayınlanır", async () => {
    const yol = new OlayYolu();
    const yayinlar: SunucuOlayi[] = [];
    yol.dinle((o) => {
      if (o.tur === "tanitim.degisti") yayinlar.push(o);
    });
    const t = new Tanitim({ depo, olaylar: yol, uzmanaYaz: async () => undefined, ceoyaYaz: async () => undefined, gecikmeMs: 10 });
    try {
      const tuna = depo.ajanAdla(pid, "Tuna")!;
      // Ortak projede art arda iki değişiklik: tek olay
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "README.md", ajanId: tuna.id });
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "readme.md", ajanId: null });
      await bekle(50);
      expect(yayinlar).toEqual([{ tur: "tanitim.degisti", projeId: pid }]);
      // Alt klasördeki README ve 0.0.7'den kalan kişisel alan yayın açmaz
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "docs/README.md", ajanId: null });
      yol.yayinla({ tur: "dosya.degisti", projeId: pid, alan: tuna.id, yol: "README.md", ajanId: tuna.id });
      await bekle(50);
      expect(yayinlar).toHaveLength(1);
      // README'siz kayıt açmaz; README'li kayıt açar
      yol.yayinla(gorevKaydiOlayi(kayit(["src/a.ts"])));
      await bekle(50);
      expect(yayinlar).toHaveLength(1);
      yol.yayinla(gorevKaydiOlayi(kayit(["src/a.ts", "README.md"])));
      await bekle(50);
      expect(yayinlar).toHaveLength(2);
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
      expect(t).toContain("isi_kaydet");
      expect(t).not.toContain("birlestirme_iste");
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

  type Arac = { name: string; inputSchema: Record<string, z.ZodType>; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };

  it("işe alım teklifi tanıtım uzmanı rolünü bilir; onaylanınca uzman ekibe katılır", async () => {
    // Kurul kipi: teklif Onaylar'da kurulun kararını bekler
    const p4 = await sirket.projeOlustur({ ad: "Teklif", yol: path.join(gecici, "repo4"), olustur: true, kararVeren: "kurul" });
    const ceo = ceoBul(p4.id);
    const ise = (arnorgAracListesi(sirket, ceo.id) as unknown as Arac[]).find((t) => t.name === "ise_al_teklif")!;
    expect(z.toJSONSchema(z.object(ise.inputSchema))).toMatchObject({ properties: { rol: { description: expect.stringContaining("tanitim") } } });
    const sonuc = await ise.handler({ ad: "Lale", rol: "tanitim", gerekce: "Kurul projeyi Tanıtım alanından okuyacak; README.md'yi yazacak biri gerek." }, {});
    expect(sonuc.isError).toBeFalsy();
    const teklif = depo.onaylar(p4.id, "bekliyor").find((o) => o.tur === "ise_alim")!;
    expect(teklif.baslik).toBe("İşe alım: Lale · Tanıtım uzmanı");
    await sirket.onayKarari(teklif.id, "onayla");
    expect(depo.ajanAdla(p4.id, "Lale")).toMatchObject({ rol: "tanitim", rolAdi: "Tanıtım uzmanı", model: "haiku" });
    expect((await durum(p4.id)).uzman).toMatchObject({ ad: "Lale" });
  });

  it("tam otonomda CEO tanıtım uzmanını doğrudan işe alır; teklif onay beklemez", async () => {
    const p5 = await sirket.projeOlustur({ ad: "Otonom", yol: path.join(gecici, "repo5"), olustur: true });
    expect(p5.kararVeren).toBe("ceo");
    const ceo = ceoBul(p5.id);
    const ise = (arnorgAracListesi(sirket, ceo.id) as unknown as Arac[]).find((t) => t.name === "ise_al_teklif")!;
    const sonuc = await ise.handler({ ad: "Mira", rol: "tanitim", gerekce: "Kurul projeyi Tanıtım alanından okuyacak; README.md'yi yazacak biri gerek." }, {});
    expect(sonuc.isError).toBeFalsy();
    expect(sonuc.content[0]!.text).toContain("hemen geçerli oldu");
    expect(depo.onaylar(p5.id, "bekliyor")).toEqual([]);
    expect(depo.onaylar(p5.id).find((o) => o.tur === "ise_alim")).toMatchObject({ durum: "onaylandi", kararKaynagi: "ceo", kararVerenAd: ceo.ad });
    expect(depo.ajanAdla(p5.id, "Mira")).toMatchObject({ rol: "tanitim", rolAdi: "Tanıtım uzmanı" });
    expect((await durum(p5.id)).uzman).toMatchObject({ ad: "Mira" });
  });
});
