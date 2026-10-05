// Seçenekli sorular (0.0.8): secenekli_sor aracı soruyu seçenekleriyle kurulun kanalına yazar; kurulun seçimi
// (POST /api/mesajlar/:mid/secim) soruyu kilitler ve soran ajana kurul mesajı olarak gider. CEO'nun #yonetim'e düz
// metinle yazdığı numaralı liste de aynı uçla yanıtlanır. Claude Code oturumu açılmaz; uyandırmalar ajanaMesaj casusuyla okunur.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KURUL, type Ajan, type Mesaj, type SunucuOlayi } from "@arnorg/ortak";
import { arnorgAracListesi } from "../arnorg-araclari.js";
import { Depo } from "../depo.js";
import { OlayYolu } from "../olaylar.js";
import { Sirket } from "../sirket.js";
import { sunucuKur } from "../sunucu.js";
import { TerminalYoneticisi } from "../terminal.js";
import { Yapilandirma } from "../yapilandirma.js";
import { secenekTalimati, secimMetni } from "./index.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
let app: FastifyInstance;
let basliklar: Record<string, string>;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];
const ANAHTAR = "secenek-anahtari-0123456789abcdef";
const bekle = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const ajan = (ad: string): Ajan => depo.ajanAdla(pid, ad)!;
const ceo = (): Ajan => depo.ajanlar(pid).find((a) => a.rol === "ceo")!;

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
async function arac(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const a = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((x) => x.name === ad);
  if (!a) throw new Error(`araç yok: ${ad}`);
  const s = await a.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}

/** Kanalın son mesajı */
const son = (kanal: string): Mesaj => depo.mesajlar(pid, kanal).at(-1)!;

/** Kurulun seçimi (HTTP) */
async function sec(mid: string, govde: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/api/mesajlar/${mid}/secim`, headers: basliklar, payload: govde });
}

/** Uyandırma casusu: alıcıya giden metinler */
function casus() {
  const uyandir = vi.spyOn(sirket, "ajanaMesaj").mockResolvedValue(undefined);
  return { metinler: (alici: string) => uyandir.mock.calls.filter(([a]) => a === alici).map(([, metin]) => metin) };
}

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-secenek-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "QR Menü", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: ANAHTAR, studyoDizini: null, izinliHostlar: [] });
  await app.listen({ port: 0, host: "127.0.0.1" });
  basliklar = { host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${ANAHTAR}` };
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
  await bekle(20);
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("secenekli_sor", () => {
  it("CEO'nun sorusu #yonetim'e seçenekleriyle düşer; düz metin yedeği numaralı listedir ve ilk olay seçenekleri taşır", async () => {
    const r = await arac(ceo().id, "secenekli_sor", {
      soru: "İlk sürüm kapsamına hangileri girsin?",
      secenekler: [{ metin: "İşletme kaydı ve giriş" }, { metin: "Menü oluşturma", aciklama: "Kategori, ürün, fiyat, görsel" }, "Şablon seçerek tasarım", "3) QR kod üretme ve indirme"],
      coklu: true,
    });
    expect(r.hata).toBe(false);
    expect(r.metin).toMatch(/^Seçenekli soru #yonetim kanalına bırakıldı \(mesaj [0-9a-f]{8}\): 4 seçenek, birden çok seçilebilir\./);
    const m = son("yonetim");
    expect(m.gonderenId).toBe(ceo().id);
    expect(m.secim).toEqual({
      kaynak: "arac",
      soru: "İlk sürüm kapsamına hangileri girsin?",
      secenekler: [
        { metin: "İşletme kaydı ve giriş", aciklama: null },
        { metin: "Menü oluşturma", aciklama: "Kategori, ürün, fiyat, görsel" },
        { metin: "Şablon seçerek tasarım", aciklama: null },
        { metin: "QR kod üretme ve indirme", aciklama: null },
      ],
      coklu: true,
      serbestYanit: true,
      yanit: null,
    });
    expect(m.metin).toBe(
      "İlk sürüm kapsamına hangileri girsin?\n\n1. İşletme kaydı ve giriş\n2. Menü oluşturma — Kategori, ürün, fiyat, görsel\n3. Şablon seçerek tasarım\n4. QR kod üretme ve indirme\n\nBirden çok seçilebilir.",
    );
    const yeni = gelenler.find((o) => o.tur === "mesaj.yeni" && o.mesaj.id === m.id);
    expect(yeni && yeni.tur === "mesaj.yeni" && yeni.mesaj.secim?.secenekler).toHaveLength(4);
  });

  it("yanıtı bekleyen aynı soru yeniden açılmaz; aynı seçenekler bir kez sayılır, ikiden azı reddedilir", async () => {
    const once = depo.mesajlar(pid, "yonetim").length;
    const r = await arac(ceo().id, "secenekli_sor", { soru: "İlk sürüm kapsamına hangileri girsin?", secenekler: ["A", "B"], coklu: true });
    expect(r.metin).toMatch(/zaten kurulun yanıtını bekliyor/);
    expect(depo.mesajlar(pid, "yonetim")).toHaveLength(once);
    const az = await arac(ceo().id, "secenekli_sor", { soru: "Hangi dil?", secenekler: ["Türkçe", " türkçe "] });
    expect(az).toEqual({ metin: "En az iki farklı seçenek ver.", hata: true });
  });

  it("çalışan #yonetim'e soramaz; varsayılan kanalı #genel, kurulun kanalına da sorabilir, ekip kanalına soramaz", async () => {
    const yonetim = await arac(ajan("Deniz").id, "secenekli_sor", { soru: "Hangisi?", secenekler: ["A", "B"], kanal: "yonetim" });
    expect(yonetim.hata).toBe(true);
    expect(yonetim.metin).toMatch(/#yonetim kanalı kurul ile CEO arasındadır/);
    const muhendislik = await arac(ajan("Deniz").id, "secenekli_sor", { soru: "Hangisi?", secenekler: ["A", "B"], kanal: "muhendislik" });
    expect(muhendislik.metin).toMatch(/yalnız kurulun bulunduğu kanallara/);
    const genel = await arac(ajan("Deniz").id, "secenekli_sor", { soru: "Sayfalama boyutu ne olsun?", secenekler: ["20", "50"] });
    expect(genel.metin).toMatch(/#genel kanalına bırakıldı/);
    expect(son("genel").secim).toMatchObject({ coklu: false, serbestYanit: true });
    sirket.kanallar.olustur(pid, { ad: "tasarim", uyeler: [ajan("Deniz").id] });
    const ozel = await arac(ajan("Deniz").id, "secenekli_sor", { soru: "Renk paleti?", secenekler: ["Koyu", "Açık"], kanal: "#tasarim" });
    expect(ozel.metin).toMatch(/#tasarim kanalına bırakıldı/);
  });

  it("araç her ajanda var; talimat CEO'ya ve öteki ajanlara seçenek sunarken kullanmasını söyler", () => {
    for (const a of [ceo(), ajan("Deniz")]) expect((arnorgAracListesi(sirket, a.id) as unknown as Arac[]).some((x) => x.name === "secenekli_sor")).toBe(true);
    expect(secenekTalimati(true, "tr")[0]).toMatch(/^- Kurula seçenek sunduğun her soruda .*mcp__arnorg__secenekli_sor ile sor\..*coklu: true/);
    expect(secenekTalimati(true, "en")[0]).toMatch(/^- Whenever you offer the board choices .*mcp__arnorg__secenekli_sor\. The question lands in #ceo/);
    expect(secenekTalimati(false, "tr")[0]).toMatch(/kendi kanalında ya da #genel'de .*secenekli_sor/);
    const talimat = (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(ceo(), gecici);
    expect(talimat).toContain("mcp__arnorg__secenekli_sor ile sor");
  });
});

describe("kurulun seçimi", () => {
  it("çoklu seçim notla: soru kilitlenir, seçim #yonetim'e kurul mesajı olarak yazılır ve CEO uyanır", async () => {
    const { metinler } = casus();
    const soru = depo.mesajlar(pid, "yonetim").find((m) => m.secim?.soru === "İlk sürüm kapsamına hangileri girsin?")!;
    const y = await sec(soru.id, { secilenler: [4, 1, 3, 1], not: "  Ödeme de ilk sürümde olsun  " });
    expect(y.statusCode).toBe(200);
    const govde = y.json() as { soru: Mesaj; yanit: Mesaj };
    expect(govde.soru.secim?.yanit).toMatchObject({ secilenler: [1, 3, 4], not: "Ödeme de ilk sürümde olsun" });
    expect(govde.yanit).toMatchObject({ kanal: "yonetim", gonderenId: KURUL });
    expect(govde.yanit.metin).toBe("Kurulun seçimi: 1) İşletme kaydı ve giriş; 3) Şablon seçerek tasarım; 4) QR kod üretme ve indirme · Not: Ödeme de ilk sürümde olsun");
    expect(depo.mesaj(soru.id)?.secim?.yanit?.secilenler).toEqual([1, 3, 4]);
    expect(gelenler.some((o) => o.tur === "mesaj.guncellendi" && o.projeId === pid && o.mesaj.id === soru.id && o.mesaj.secim?.yanit)).toBe(true);
    expect(metinler(ceo().id)).toEqual([`#yonetim · Yönetim kurulu: ${govde.yanit.metin}`]);
    // İkinci yanıt kabul edilmez
    const tekrar = await sec(soru.id, { secilenler: [2] });
    expect(tekrar.statusCode).toBe(409);
    expect(tekrar.json()).toEqual({ hata: "Bu soru zaten yanıtlandı." });
  });

  it("tek seçimde iki seçenek, aralık dışı numara ve boş yanıt reddedilir; serbest yanıt yalnız yazıyla gider", async () => {
    casus();
    const r = await arac(ceo().id, "secenekli_sor", { soru: "Menü sayfasının başlangıç şablonu?", secenekler: ["Sade liste", "Görselli kartlar", "Kategori sekmeleri"] });
    expect(r.hata).toBe(false);
    const soru = son("yonetim");
    expect((await sec(soru.id, { secilenler: [1, 2] })).json()).toEqual({ hata: "Bu soruda yalnız bir seçenek seçilebilir." });
    expect((await sec(soru.id, { secilenler: [4] })).json()).toEqual({ hata: "Geçersiz seçenek numarası." });
    expect((await sec(soru.id, { secilenler: [] })).json()).toEqual({ hata: "Bir seçenek seçin ya da yanıtınızı yazın." });
    expect((await sec(soru.id, { secilenler: ["iki"] })).statusCode).toBe(400);
    const y = await sec(soru.id, { not: "Önce müşterilerle konuşalım" });
    expect(y.statusCode).toBe(200);
    expect((y.json() as { yanit: Mesaj }).yanit.metin).toBe("Kurulun yanıtı: Önce müşterilerle konuşalım");
    expect(depo.mesaj(soru.id)?.secim?.yanit).toMatchObject({ secilenler: [], not: "Önce müşterilerle konuşalım" });
  });

  it("öteki kanallarda yanıt soranı anar ve onu uyandırır", async () => {
    const { metinler } = casus();
    const soru = depo.mesajlar(pid, "genel").find((m) => m.secim?.soru === "Sayfalama boyutu ne olsun?")!;
    const y = await sec(soru.id, { secilenler: [2] });
    expect((y.json() as { yanit: Mesaj }).yanit.metin).toBe("@Deniz Kurulun seçimi: 2) 50");
    expect(metinler(ajan("Deniz").id)).toEqual(["#genel · Yönetim kurulu: @Deniz Kurulun seçimi: 2) 50"]);
    expect(metinler(ceo().id)).toEqual([]);
  });

  it("kurulun kanalında yanıt konuşma motoruyla soran üyeye gider", async () => {
    const { metinler } = casus();
    const soru = depo.mesajlar(pid, "tasarim").find((m) => m.secim?.soru === "Renk paleti?")!;
    await sec(soru.id, { secilenler: [1] });
    await bekle(30);
    expect(metinler(ajan("Deniz").id).some((m) => m.includes("@Deniz Kurulun seçimi: 1) Koyu"))).toBe(true);
  });

  it("yanıt gönderilemezse soru yeniden açılır", async () => {
    const r = await arac(ceo().id, "secenekli_sor", { soru: "Alan adı?", secenekler: ["menu.ornek.com", "Ayrı alan adı"] });
    expect(r.hata).toBe(false);
    const soru = son("yonetim");
    vi.spyOn(sirket, "mesajGonder").mockRejectedValueOnce(new Error("kanal yok"));
    const y = await sec(soru.id, { secilenler: [1] });
    expect(y.statusCode).toBe(500);
    expect(depo.mesaj(soru.id)?.secim?.yanit).toBeNull();
    const acildi = gelenler.flatMap((o) => (o.tur === "mesaj.guncellendi" && o.mesaj.id === soru.id ? [o.mesaj] : []));
    expect(acildi.map((m) => Boolean(m.secim?.yanit))).toEqual([true, false]);
  });
});

describe("düz metinden seçerek yanıtlama", () => {
  const EKRAN =
    "Anlaşıldı: Node.js ile QR tabanlı menü üretme ve tasarlama platformu; Node.js tercihini kaydettim. İlk sürüm kapsamını şöyle öneriyorum: 1) işletme kaydı ve giriş, 2) menü oluşturma (kategori, ürün, fiyat, görsel), 3) şablon seçerek tasarım, 4) QR kod üretme ve indirme, 5) QR ile açılan mobil uyumlu herkese açık menü sayfası. Ödeme, sipariş alma ve çoklu dil ikinci sürüme kalsın. Bu kapsam uygun mu, eklemek ya da çıkarmak istediğiniz var mı?";

  it("CEO'nun numaralı listesi işaretlenerek yanıtlanır; seçim mesaja kaynak metin olarak yazılır", async () => {
    const { metinler } = casus();
    const m = sirket.kanalMesaji(pid, "yonetim", { id: ceo().id, ad: ceo().ad }, EKRAN);
    expect(m.secim).toBeUndefined();
    const y = await sec(m.id, { secilenler: [1, 2, 4, 5], not: "Çoklu dil de ilk sürümde olsun" });
    expect(y.statusCode).toBe(200);
    const govde = y.json() as { soru: Mesaj; yanit: Mesaj };
    expect(govde.soru.secim).toMatchObject({ kaynak: "metin", soru: null, coklu: true, serbestYanit: false, yanit: { secilenler: [1, 2, 4, 5], not: "Çoklu dil de ilk sürümde olsun" } });
    expect(govde.soru.secim?.secenekler.map((s) => s.metin)).toEqual([
      "işletme kaydı ve giriş",
      "menü oluşturma (kategori, ürün, fiyat, görsel)",
      "şablon seçerek tasarım",
      "QR kod üretme ve indirme",
      "QR ile açılan mobil uyumlu herkese açık menü sayfası",
    ]);
    expect(govde.yanit.metin).toBe(
      "Kurulun seçimi: 1) işletme kaydı ve giriş; 2) menü oluşturma (kategori, ürün, fiyat, görsel); 4) QR kod üretme ve indirme; 5) QR ile açılan mobil uyumlu herkese açık menü sayfası · Not: Çoklu dil de ilk sürümde olsun",
    );
    expect(metinler(ceo().id)).toHaveLength(1);
  });

  it("düz metinde yalnız yazıyla yanıt yok; listesiz mesaj, kurulun mesajı ve #yonetim dışı mesaj seçilemez", async () => {
    casus();
    const m = sirket.kanalMesaji(pid, "yonetim", { id: ceo().id, ad: ceo().ad }, "Hangisiyle başlayalım?\n1. Kayıt\n2. Menü");
    expect((await sec(m.id, { not: "İkisi birden" })).json()).toEqual({ hata: "En az bir seçenek seçin." });
    const duz = sirket.kanalMesaji(pid, "yonetim", { id: ceo().id, ad: ceo().ad }, "Bugün kayıt ekranını bitirdik.");
    expect((await sec(duz.id, { secilenler: [1] })).statusCode).toBe(409);
    const kurulun = sirket.kanalMesaji(pid, "yonetim", { id: KURUL, ad: "Yönetim kurulu" }, "Hangisi?\n1. A\n2. B");
    expect((await sec(kurulun.id, { secilenler: [1] })).statusCode).toBe(409);
    const genel = sirket.kanalMesaji(pid, "genel", { id: ceo().id, ad: ceo().ad }, "Hangisi?\n1. A\n2. B");
    expect((await sec(genel.id, { secilenler: [1] })).json()).toEqual({ hata: "Bu mesajda seçilecek seçenek yok." });
    expect((await sec("yok", { secilenler: [1] })).statusCode).toBe(404);
  });
});

describe("kalıcılık ve metin", () => {
  it("seçenekler ve yanıt veri dosyası yeniden açılınca da durur; düz mesajda alan yok", () => {
    const ikinci = new Depo(path.join(gecici, "veri", "arnorg.db"));
    try {
      const mesajlar = ikinci.mesajlar(pid, "yonetim");
      expect(mesajlar.find((m) => m.secim?.soru === "İlk sürüm kapsamına hangileri girsin?")?.secim?.yanit?.secilenler).toEqual([1, 3, 4]);
      expect(mesajlar.find((m) => m.metin === "Bugün kayıt ekranını bitirdik.")).not.toHaveProperty("secim");
    } finally {
      ikinci.kapat();
    }
  });

  it("yanıt metni İngilizcede", () => {
    sirket.yapilandirma.guncelle({ dil: "en" });
    try {
      const secim = {
        kaynak: "arac" as const,
        soru: "Q",
        secenekler: [
          { metin: "Sign-up", aciklama: null },
          { metin: "Menu", aciklama: null },
        ],
        coklu: true,
        serbestYanit: true,
      };
      expect(secimMetni({ ...secim, yanit: { secilenler: [1, 2], not: "Payments too", zaman: "" } })).toBe("Board's choice: 1) Sign-up; 2) Menu · Note: Payments too");
      expect(secimMetni({ ...secim, yanit: { secilenler: [], not: "Later", zaman: "" } })).toBe("Board's answer: Later");
    } finally {
      sirket.yapilandirma.guncelle({ dil: "tr" });
    }
  });
});
