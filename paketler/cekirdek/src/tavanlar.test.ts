// Şirket düzeyinde tavanlar (oturumsuz kip): eşzamanlı ajan tavanı ve sırası, görev token tavanı ve kurul onayı,
// tur tavanı bildirimi
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Onay, SunucuOlayi } from "@arnorg/ortak";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Depo } from "./depo.js";
import { gecerliTavan, kisaToken, yoneticisi, yukseltilmisTavan } from "./gorev-tavani.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
const gelenler: SunucuOlayi[] = [];
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ajan = (ad: string) => depo.ajanAdla(pid, ad)!;
const durumYaz = (ad: string, durum: "kapali" | "bosta" | "calisiyor" | "karar_bekliyor") => depo.ajanGuncelle(ajan(ad).id, { durum, isAciklamasi: "" });
/** Oturumdan gelen durum değişikliği (Şirket'in iç kancası) */
const durumDegisti = (ad: string, durum: "bosta" | "kapali" | "calisiyor") =>
  (sirket as unknown as { durumDegisti(id: string, d: string, a?: string): void }).durumDegisti(ajan(ad).id, durum);
const bekleyenTavanOnayi = (): Onay | undefined => depo.onaylar(pid, "bekliyor").find((o) => o.tur === "genel" && (o.veri as { altTur?: string } | null)?.altTur === "gorev_token_tavani");

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-tavan-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  const olaylar = new OlayYolu();
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  pid = depo.projeEkle({ ad: "Tavan", yol: path.join(gecici, "repo"), aciklama: "", varsayilanDal: "main" }).id;
  sirket.iseAl(pid, { ad: "Ada", rol: "ceo" });
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  sirket.iseAl(pid, { ad: "Elif", rol: "frontend" });
  sirket.iseAl(pid, { ad: "Mert", rol: "test" });
  sirket.iseAl(pid, { ad: "Selin", rol: "tasarim" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Açılan onayların kurul bildirimi bir sonraki döngüde gider; veritabanı ondan sonra kapanır
  await bekle(20);
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("eşzamanlı ajan tavanı (Şirket)", () => {
  it("tavan doluyken turu sürmeyen ajana gelen mesaj sıraya girer; iş açıklaması Sırada olur, çağıran hata almaz", async () => {
    sirket.yapilandirma.guncelle({ esZamanliAjan: 2 });
    durumYaz("Deniz", "calisiyor");
    durumYaz("Elif", "karar_bekliyor");
    const once = gelenler.length;
    await expect(sirket.ajanaMesaj(ajan("Mert").id, "T-1 görevine başla", "next", { tur: "sistem" })).resolves.toBeUndefined();
    expect(sirket.siradaMi(ajan("Mert").id)).toBe(true);
    expect(ajan("Mert").isAciklamasi).toBe("Sırada: aynı anda en çok 2 ajan çalışır");
    expect(gelenler.slice(once).some((o) => o.tur === "proje.guncellendi")).toBe(true);
    // Aynı ajanın ikinci mesajı ve bir ajandan gelen uyandırma da sıraya girer
    await expect(sirket.uyandir(ajan("Mert").id, "Testleri de yaz", ajan("Deniz"))).resolves.toBe(true);
    expect(sirket.esZamanlilik.uzunluk).toBe(2);
  });

  it("kanalda anılıp sıraya giren ajan için yazıyor göstergesi kalmaz", async () => {
    const once = gelenler.length;
    await sirket.mesajGonder(pid, "genel", ajan("Deniz").id, "@Mert uçtan uca testlere bakar mısın?");
    const yaziyor = gelenler.slice(once).flatMap((o) => (o.tur === "kanal.yaziyor" && o.ajanId === ajan("Mert").id ? [o.yaziyor] : []));
    expect(yaziyor).toEqual([true, false]);
    expect(sirket.esZamanlilik.uzunluk).toBe(3);
  });

  it("kurulun mesajı ve yanıt bekleyen sorunun sorulanı tavandan muaftır", async () => {
    // Oturumsuz kipte teslim 503 ile biter: sıraya girmeden teslime ulaştığı görülür
    await expect(sirket.ajanaMesaj(ajan("Ada").id, "Durum nedir?", "next", { tur: "kurul" })).rejects.toThrow(/Oturumlar bu çalıştırmada kapalı/);
    const soran = ajan("Deniz");
    const soru = depo.soruEkle({ projeId: pid, soranId: soran.id, soranAd: soran.ad, soruluId: ajan("Selin").id, soruluAd: "Selin", soru: "Renk paleti hangi dosyada?" });
    await expect(sirket.ajanaMesaj(ajan("Selin").id, "Deniz sana soruyor", "next", { tur: "ajan", ad: soran.ad, id: soran.id })).rejects.toThrow(/kapalı/);
    expect(sirket.siradaMi(ajan("Selin").id)).toBe(false);
    depo.soruSonuclandir(soru.id, "zaman_asimi", null);
  });

  it("çalışan ajan boşa çıkınca sıradaki teslim edilir; başlayamazsa bildirilir ve Sırada açıklaması kalkar", async () => {
    durumDegisti("Deniz", "bosta");
    await bekle(20);
    expect(sirket.siradaMi(ajan("Mert").id)).toBe(false);
    expect(gelenler.some((o) => o.tur === "bildirim" && o.metin.startsWith("Mert uyandırılamadı"))).toBe(true);
    expect(ajan("Mert").isAciklamasi).toBe("");
  });

  it("tıkanma koruması sıradaki ajanı dürtmez; Mesaiyi durdur sıradaki mesajları düşürür", async () => {
    durumYaz("Deniz", "calisiyor");
    await sirket.ajanaMesaj(ajan("Mert").id, "T-2 görevine başla", "next", { tur: "sistem" });
    expect(sirket.siradaMi(ajan("Mert").id)).toBe(true);
    const { Gozetmen } = await import("./gozetmen.js");
    const g = sirket.gorevOlustur(pid, { baslik: "Uçtan uca testler", atananId: ajan("Mert").id });
    depo.gorevGuncelle(g.id, { durum: "calisiliyor" });
    expect(await new Gozetmen(sirket).denetle(Date.now() + 60 * 60_000)).toEqual([]);
    sirket.tumunuDurdur(pid);
    expect(sirket.esZamanlilik.uzunluk).toBe(0);
    expect(ajan("Mert").isAciklamasi).toBe("");
    depo.gorevGuncelle(g.id, { durum: "iptal" });
    for (const ad of ["Deniz", "Elif", "Mert"]) durumYaz(ad, "kapali");
  });

  it("0 sınırsızdır", async () => {
    sirket.yapilandirma.guncelle({ esZamanliAjan: 0 });
    for (const ad of ["Deniz", "Elif", "Selin"]) durumYaz(ad, "calisiyor");
    await expect(sirket.ajanaMesaj(ajan("Mert").id, "Başla", "next", { tur: "sistem" })).rejects.toThrow(/kapalı/);
    expect(sirket.siradaMi(ajan("Mert").id)).toBe(false);
    for (const ad of ["Deniz", "Elif", "Selin"]) durumYaz(ad, "kapali");
    sirket.yapilandirma.guncelle({ esZamanliAjan: 3 });
  });
});

describe("görev token tavanı", () => {
  it("yardımcılar: biçim, geçerli tavan, bir kat artış, yönetici", () => {
    expect(kisaToken(2_100_000)).toBe("2,1 M");
    expect(kisaToken(2_000_000)).toBe("2 M");
    expect(kisaToken(850_000)).toBe("850 bin");
    expect(gecerliTavan({ token: 0, tavan: null }, 2_000_000)).toBe(2_000_000);
    expect(gecerliTavan({ token: 0, tavan: 4_000_000 }, 2_000_000)).toBe(4_000_000);
    expect(gecerliTavan({ token: 0, tavan: 4_000_000 }, 0)).toBe(0);
    expect(yukseltilmisTavan(2_000_000, 2_000_000, 2_100_000)).toBe(4_000_000);
    expect(yukseltilmisTavan(2_000_000, 2_000_000, 4_500_000)).toBe(6_500_000);
    const ada = ajan("Ada");
    expect(yoneticisi(ajan("Deniz"), depo.ajanlar(pid))?.id).toBe(ada.id);
    expect(yoneticisi(ada, depo.ajanlar(pid))).toBeNull();
  });

  let gorevId: string;
  let onay: Onay;

  it("ayar 0 iken ve bitmiş görevde sayılmaz", () => {
    sirket.yapilandirma.guncelle({ gorevTokenTavani: 0 });
    const g = sirket.gorevOlustur(pid, { baslik: "Ödeme akışı", atananId: ajan("Deniz").id });
    gorevId = g.id;
    depo.gorevGuncelle(g.id, { durum: "calisiliyor" });
    depo.ajanGuncelle(ajan("Deniz").id, { gorevId: g.id, durum: "calisiyor" });
    sirket.gorevTavani.tokenEkle(ajan("Deniz").id, 5_000_000);
    expect(sirket.gorevTavani.kayit(g.id).token).toBe(5_000_000);
    expect(ajan("Deniz").durum).toBe("calisiyor");
    // Başkasına atanmış ya da bitmiş görev ajanın kullanımını saymaz
    const bitmis = sirket.gorevOlustur(pid, { baslik: "Eski iş", atananId: ajan("Elif").id });
    depo.gorevGuncelle(bitmis.id, { durum: "tamam" });
    depo.ajanGuncelle(ajan("Elif").id, { gorevId: bitmis.id });
    sirket.gorevTavani.tokenEkle(ajan("Elif").id, 100);
    expect(sirket.gorevTavani.kayit(bitmis.id).token).toBe(0);
    depo.degerYaz(`gorev-token:${g.id}`, JSON.stringify({ token: 0, tavan: null }));
    (sirket.gorevTavani as unknown as { kayitlar: Map<string, unknown> }).kayitlar.delete(g.id);
    sirket.yapilandirma.guncelle({ gorevTokenTavani: 2_000_000 });
  });

  it("görevin toplamı tavanı aşınca ajan duraklar ve kurula onay açılır", async () => {
    const deniz = ajan("Deniz");
    sirket.gorevTavani.tokenEkle(deniz.id, 1_500_000);
    expect(ajan("Deniz").durum).toBe("calisiyor");
    expect(bekleyenTavanOnayi()).toBeUndefined();
    sirket.gorevTavani.tokenEkle(deniz.id, 600_000);
    expect(ajan("Deniz")).toMatchObject({ durum: "duraklatildi", isAciklamasi: "Görev token tavanı aşıldı" });
    onay = bekleyenTavanOnayi()!;
    const kod = depo.gorev(gorevId)!.kod;
    expect(onay.baslik).toBe(`${kod} görevi token tavanını aştı (2,1 M / 2 M). Sürsün mü?`);
    expect(onay.ajanId).toBe(deniz.id);
    expect(onay.veri).toMatchObject({ altTur: "gorev_token_tavani", gorevId, gorevKodu: kod, toplam: 2_100_000, tavan: 2_000_000, yeniTavan: 4_000_000 });
    expect(onay.ayrinti).toContain("Ada görevi bölmesi ya da yeniden planlaması için uyarılır");
    expect(depo.akis(deniz.id).some((o) => o.tur === "sistem" && o.metin?.includes("tur kesildi"))).toBe(true);
  });

  it("karar beklerken iş araçları kapalıdır, mesajlar tutulur, ikinci onay açılmaz; tur içi tahmin de sayar", async () => {
    const deniz = ajan("Deniz");
    await expect(sirket.kapi(deniz.id, "Bash", { command: "npm test" })).resolves.toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    expect(depo.denetimKayitlari(pid, 3).some((k) => k.kural === "Görev token tavanı")).toBe(true);
    await expect(sirket.kapi(deniz.id, "mcp__arnorg__soruyu_yanitla", {})).resolves.toEqual({});
    await expect(sirket.ajanaMesaj(deniz.id, "Şemayı güncelledim, bakar mısın?", "next", { tur: "ajan", ad: "Elif", id: ajan("Elif").id })).resolves.toBeUndefined();
    sirket.gorevTavani.tokenEkle(deniz.id, 50_000);
    sirket.gorevTavani.turSuruyor(deniz.id, 9_000_000);
    expect(depo.onaylar(pid, "bekliyor").filter((o) => o.tur === "genel")).toHaveLength(1);
    // Turu biten (boşa çıkan) ajan duraklatılmış görünmeye devam eder
    durumDegisti("Deniz", "bosta");
    expect(ajan("Deniz")).toMatchObject({ durum: "duraklatildi", isAciklamasi: "Görev token tavanı aşıldı" });
  });

  it("onaylanınca görevin tavanı bir kat artar ve ajan tutulan mesajlarla kaldığı yerden sürer", async () => {
    const uyandir = vi.spyOn(sirket, "uyandir").mockResolvedValue(true);
    await sirket.onayKarari(onay.id, "onayla");
    expect(sirket.gorevTavani.kayit(gorevId)).toEqual({ token: 2_150_000, tavan: 4_000_000 });
    expect(ajan("Deniz").durum).toBe("kapali");
    expect(uyandir).toHaveBeenCalledTimes(1);
    const [alici, metin, gonderen] = uyandir.mock.calls[0]!;
    expect(alici).toBe(ajan("Deniz").id);
    expect(gonderen).toBeNull();
    expect(metin).toContain(`${depo.gorev(gorevId)!.kod} görevinin token tavanını 4 M yaptı. Kaldığın yerden devam et.`);
    expect(metin).toContain("Şemayı güncelledim, bakar mısın?");
    // Karar çıktı: denetim kapısı açılır
    await expect(sirket.kapi(ajan("Deniz").id, "Read", { file_path: "a.ts" })).resolves.not.toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  });

  it("yeni tavan da aşılıp kurul reddedince ajan durur, yöneticisine görevi bölmesi için mesaj gider", async () => {
    depo.ajanGuncelle(ajan("Deniz").id, { durum: "calisiyor" });
    sirket.gorevTavani.tokenEkle(ajan("Deniz").id, 1_950_000);
    const ikinci = bekleyenTavanOnayi()!;
    expect(ikinci.baslik).toContain("(4,1 M / 4 M)");
    expect(ikinci.veri).toMatchObject({ yeniTavan: 6_000_000 });
    const uyandir = vi.spyOn(sirket, "uyandir").mockResolvedValue(true);
    await sirket.onayKarari(ikinci.id, "reddet", "Önce böl");
    expect(ajan("Deniz")).toMatchObject({ durum: "duraklatildi", isAciklamasi: "Görev token tavanı aşıldı; kurul sürdürmedi" });
    expect(sirket.gorevTavani.kayit(gorevId).tavan).toBe(4_000_000);
    expect(uyandir).toHaveBeenCalledTimes(1);
    const [alici, metin] = uyandir.mock.calls[0]!;
    expect(alici).toBe(ajan("Ada").id);
    expect(metin).toContain("Görevi daha küçük görevlere böl ya da yeniden planla");
    expect(metin).toContain("kurulun notu: Önce böl");
    // Ret sonrası ajana gelen mesajlar tutulmaz (yönetici yeni iş verebilir)
    expect(sirket.gorevTavani.duraklatmaAciklamasi(ajan("Deniz").id)).toBeNull();
  });

  it("tur tavanına ulaşan ajan için akışa not düşülür ve yöneticisine haber verilir", () => {
    const uyandir = vi.spyOn(sirket, "uyandir").mockResolvedValue(true);
    sirket.gorevTavani.turSiniri(ajan("Elif").id, 200);
    expect(depo.akis(ajan("Elif").id).some((o) => o.metin === "Tek turda 200 adım sınırına ulaşıldı; ajan boşa çıktı. Ada haberdar edildi.")).toBe(true);
    expect(uyandir.mock.calls[0]![0]).toBe(ajan("Ada").id);
    expect(uyandir.mock.calls[0]![1]).toMatch(/^Elif tek turda 200 adım sınırına ulaştı ve durdu/);
  });

  it("yeniden açılışta karar bekleyen tavan onayının ajanı duraklatılmış kalır", async () => {
    depo.ajanGuncelle(ajan("Deniz").id, { durum: "calisiyor" });
    sirket.gorevTavani.tokenEkle(ajan("Deniz").id, 2_000_000);
    expect(bekleyenTavanOnayi()).toBeDefined();
    const ikinci = new Sirket(depo, new OlayYolu(), sirket.yapilandirma, () => null, true);
    expect(ajan("Deniz")).toMatchObject({ durum: "duraklatildi", isAciklamasi: "Görev token tavanı aşıldı" });
    expect(ikinci.gorevTavani.kapiNedeni(ajan("Deniz").id)).toContain("token tavanını aştı");
    ikinci.kapat();
  });
});
