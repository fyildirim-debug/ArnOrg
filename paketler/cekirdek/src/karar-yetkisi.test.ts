// Karar yetkisi (0.0.7): tam otonom kipte (varsayılan) izinlere, birleştirmelere ve tekliflere CEO karar verir, kurul
// sonucu görür; CEO kurula yalnız kendi sorusuyla ulaşır. Kurul kipi ve otomatik onay eskisi gibi. Claude Code oturumu açılmaz;
// CEO'ya giden sistem mesajları uyandir casusuyla okunur.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ajan, SunucuOlayi } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { dilKaynagi } from "./dil.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];
const bekle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ajan = (ad: string): Ajan => depo.ajanAdla(pid, ad)!;
const ceo = (): Ajan => depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
const kisa = (id: string) => id.slice(0, 8);

/** Onaya bağlı kurul pencereleri (kurul.bildirimi) */
const pencereler = (onayId: string) => gelenler.flatMap((o) => (o.tur === "kurul.bildirimi" && o.bildirim.onayId === onayId ? [o.bildirim] : []));
/** Bekleyen onay: türe ve isteyene göre */
const bekleyen = (tur: string, ajanId?: string, projeId = pid) => depo.onaylar(projeId, "bekliyor").find((o) => o.tur === tur && (!ajanId || o.ajanId === ajanId))!;
const genel = () => depo.mesajlar(pid, "genel").map((m) => m.metin);
/** Şirket'in iç kancaları (oturumdan gelen durum değişikliği, hatırlatma, tavan muafiyeti, talimat) */
function ic() {
  return sirket as unknown as {
    durumDegisti(id: string, durum: string, aciklama?: string): void;
    hatirlatma(a: Ajan): string;
    tavandanMuaf(a: Ajan, kaynak: { tur: "sistem" }): boolean;
    talimatOlustur(a: Ajan, cwd: string): string;
  };
}

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
async function arac(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const a = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((x) => x.name === ad);
  if (!a) throw new Error(`araç yok: ${ad}`);
  const s = await a.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}

/** uyandir casusu: alıcıya giden mesajlar */
function casus() {
  const uyandir = vi.spyOn(sirket, "uyandir").mockResolvedValue(true);
  return { uyandir, mesajlar: (alici: string) => uyandir.mock.calls.filter(([a]) => a === alici).map(([, metin]) => metin) };
}

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-karar-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Otonom", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  sirket.iseAl(pid, { ad: "Kerem", rol: "cto" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await bekle(20);
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("tam otonom kip: CEO'nun kendi kararları", () => {
  it("yeni proje CEO kipinde açılır; CEO'nun işe alım teklifi kurula pencere açılmadan hemen geçerli olur", async () => {
    expect(sirket.proje(pid).kararVeren).toBe("ceo");
    const { mesajlar } = casus();
    const r = await arac(ceo().id, "ise_al_teklif", { ad: "Mert", rol: "test", gerekce: "Test kapsamını artırmak için" });
    expect(r.hata).toBe(false);
    expect(r.metin).toMatch(/^Karar yetkisi sende olduğundan işe alım hemen geçerli oldu: Mert \(Test mühendisi\) ekipte \(onay [0-9a-f]{8}\)\./);
    expect(ajan("Mert")).toBeTruthy();
    const onay = depo.onaylar(pid).find((o) => o.tur === "ise_alim")!;
    expect(onay).toMatchObject({ durum: "onaylandi", kararKaynagi: "ceo", kararVerenAd: "Ada", muhatap: "ceo", not: "CEO kararı (tam otonom)" });
    expect(pencereler(onay.id)).toEqual([]);
    // Sonucu aracın yanıtında gördü; kendi kararı için ayrıca uyandırılmaz
    expect(mesajlar(ceo().id).some((m) => m.includes("İşe alım onaylandı"))).toBe(false);
    expect(genel()).toContain("Mert (Test mühendisi) ekibe katıldı.");
  });

  it("teslim kurula sonuç olarak iletilir: karar düğmesiz bilgi penceresi, #genel duyurusu, CEO sıradaki hedefe geçer", async () => {
    const { mesajlar } = casus();
    const r = await arac(ceo().id, "teslim_et", {
      baslik: "Sipariş listesi",
      ozet: "Liste, süzgeç ve sayfalama hazır.",
      test_adimlari: ["npm run dev", "Siparişler sayfasını aç"],
      calistir: "npm run dev",
      adres: "http://localhost:5173",
    });
    expect(r.metin).toMatch(/^Teslim kurula sonuç olarak iletildi \(onay [0-9a-f]{8}\)\. Kabul bekleme; sıradaki hedefe geç\./);
    const onay = depo.onaylar(pid).find((o) => o.tur === "teslim")!;
    expect(onay).toMatchObject({ durum: "onaylandi", kararKaynagi: "ceo", kararVerenAd: "Ada" });
    const p = pencereler(onay.id);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ tur: "teslim", baslik: "Teslim: Sipariş listesi", ajanAd: "Ada" });
    expect(p[0]!.metin).toContain("Test adımları:");
    expect(p[0]!.metin).toContain("Çalıştır: npm run dev");
    expect(p[0]!.metin).toContain("Adres: http://localhost:5173");
    expect(genel()).toContain("Teslim: Sipariş listesi — sonuç kurula iletildi.");
    expect(genel().some((m) => m.startsWith("Teslim hazır: Sipariş listesi"))).toBe(false);
    expect(mesajlar(ceo().id).some((m) => m.includes("Kabul bekleme; sıradaki hedefe geç."))).toBe(true);
    expect(depo.hafizaKayitlari(pid, { tur: "ozet" }).some((k) => k.baslik.includes("Sipariş listesi"))).toBe(true);
    // Sonuçlanmış teslime karar düğmesi gerekmez: yeniden karar 409
    await expect(sirket.onayKarari(onay.id, "reddet", "x")).rejects.toThrow(/sonuçlanmış/);
  });

  it("CEO'nun kurula sorusu kurula gider; CEO kendi sorusuna onay_karari ile karar veremez", async () => {
    const soru = arac(ceo().id, "kurula_sor", { soru: "Ödeme sağlayıcısının canlı anahtarını tanımlar mısınız?", secenekler: [] });
    await bekle();
    const onay = bekleyen("genel", ceo().id);
    expect(onay.muhatap).toBe("kurul");
    expect(pencereler(onay.id)).toHaveLength(1);
    // Proje özetindeki sayı kurulun kararını bekleyenlerdir
    expect(sirket.projeOzeti(pid).bekleyenOnay).toBe(1);
    const kendi = await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "onayla", gerekce: "kendi sorum" });
    expect(kendi.hata).toBe(true);
    expect(kendi.metin).toContain("kurul karar verir");
    await sirket.onayKarari(onay.id, "onayla", "Tanımladım");
    expect(await soru).toEqual({ metin: "Kurul onayladı. Yanıt: Tanımladım", hata: false });
    expect(depo.onay(onay.id)).toMatchObject({ kararKaynagi: "kurul", kararVerenAd: "Yönetim kurulu" });
  });
});

describe("tam otonom kip: çalışanların istekleri CEO'ya gider", () => {
  it("araç izni: CEO'ya kimlik, tür, isteyen ve ayrıntıyla mesaj gider, kurula pencere açılmaz; CEO onaylar, denetim CEO'yu yazar", async () => {
    const { mesajlar } = casus();
    const kapi = sirket.kapi(ajan("Deniz").id, "Bash", { command: "git push origin arnorg/deniz" });
    await bekle();
    const onay = bekleyen("arac", ajan("Deniz").id);
    expect(onay.muhatap).toBe("ceo");
    expect(pencereler(onay.id)).toEqual([]);
    // CEO'nun kararındaki onay kurulun sayısına girmez
    expect(sirket.projeOzeti(pid).bekleyenOnay).toBe(0);
    const mesaj = mesajlar(ceo().id).find((m) => m.includes(kisa(onay.id))) ?? "";
    expect(mesaj).toContain(`Kararını bekleyen onay ${kisa(onay.id)} · Araç çağrısı`);
    expect(mesaj).toContain("İsteyen: Deniz (Backend geliştirici)");
    expect(mesaj).toContain("git push origin arnorg/deniz");
    expect(mesaj).toContain("mcp__arnorg__onay_karari");
    expect(mesaj).toContain("ana yasaya uyup uymadığını");
    const r = await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "onayla", gerekce: "Kendi dalına push; ana yasaya uygun." });
    expect(r.hata).toBe(false);
    expect(r.metin).toMatch(/^Onay [0-9a-f]{8} onaylandı \(Araç çağrısı: Deniz · Bash\)\. Gerekçen isteyene iletildi\./);
    await expect(kapi).resolves.toMatchObject({ hookSpecificOutput: { permissionDecision: "allow", permissionDecisionReason: "CEO Ada onayladı" } });
    expect(depo.onay(onay.id)).toMatchObject({ durum: "onaylandi", kararKaynagi: "ceo", kararVerenAd: "Ada", not: "Kendi dalına push; ana yasaya uygun." });
    expect(depo.denetimKayitlari(pid, 5).some((k) => k.karar === "izin" && k.kural === "Ada (CEO)" && k.neden === "Kendi dalına push; ana yasaya uygun.")).toBe(true);
  });

  it("CEO reddederse gerekçesi çalışana ret nedeni olarak döner", async () => {
    casus();
    const kapi = sirket.kapi(ajan("Deniz").id, "Bash", { command: "sudo apt install jq" });
    await bekle();
    const onay = bekleyen("arac", ajan("Deniz").id);
    await arac(ceo().id, "onay_karari", { onay: onay.id, karar: "reddet", gerekce: "Sistem paketi gerekmiyor; jq yerine node betiği yaz." });
    await expect(kapi).resolves.toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "CEO Ada izin vermedi. Not: Sistem paketi gerekmiyor; jq yerine node betiği yaz." },
    });
  });

  it("birleştirme isteği CEO'ya gider; CEO reddedince isteyene CEO'nun adı ve notuyla bildirilir", async () => {
    depo.ajanGuncelle(ajan("Deniz").id, { dal: "arnorg/deniz" });
    const { mesajlar } = casus();
    const r = await arac(ajan("Deniz").id, "birlestirme_iste", { ozet: "Sipariş listesi ve testleri" });
    expect(r.metin).toMatch(/^Deniz çalışanının arnorg\/deniz dalı için birleştirme CEO Ada'ya sunuldu \(onay [0-9a-f]{8}\)\./);
    const onay = bekleyen("birlestirme");
    expect(onay.muhatap).toBe("ceo");
    expect(pencereler(onay.id)).toEqual([]);
    expect(mesajlar(ceo().id).find((m) => m.includes(kisa(onay.id)))).toContain("Önce değişikliği calisma_farki ile oku (ajan: Deniz)");
    await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "reddet", gerekce: "Testler eksik; liste boşken hata veriyor." });
    expect(depo.onay(onay.id)).toMatchObject({ durum: "reddedildi", kararKaynagi: "ceo" });
    expect(mesajlar(ajan("Deniz").id)).toContain("arnorg/deniz birleştirmesi reddedildi (CEO Ada). Not: Testler eksik; liste boşken hata veriyor.");
  });

  it("çalışan birleştirmeyi istedikten sonra iş incelemeye geçerse CEO'ya bekleyen onay söylenir, yeniden sunması istenmez", async () => {
    depo.ajanGuncelle(ajan("Deniz").id, { dal: "arnorg/deniz" });
    const { mesajlar } = casus();
    const g = sirket.gorevOlustur(pid, { baslik: "Fatura listesi", atananId: ajan("Deniz").id });
    try {
      await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" });
      await arac(ajan("Deniz").id, "birlestirme_iste", { ozet: "Fatura listesi ve testleri" });
      const onay = bekleyen("birlestirme");
      await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
      const mesaj = mesajlar(ceo().id).find((m) => m.includes(`${g.kod} "Fatura listesi" incelemeye hazır`)) ?? "";
      expect(mesaj).toContain(`Deniz birleştirmeyi zaten istedi (onay ${kisa(onay.id)}): calisma_farki ile değişiklikleri incele ve onay_karari ile karar ver`);
      expect(mesaj).not.toContain("birlestirme_iste");
      await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "reddet", gerekce: "Boş liste durumu eksik." });
    } finally {
      depo.gorevGuncelle(g.id, { durum: "iptal" });
    }
  });

  it("çalışanın sorusu CEO'ya gider; gerekce soran çalışana yanıt olarak döner", async () => {
    casus();
    const soru = arac(ajan("Deniz").id, "kurula_sor", { soru: "Tarih alanları UTC mi saklansın?", secenekler: ["UTC", "Yerel saat"] });
    await bekle();
    const onay = bekleyen("genel", ajan("Deniz").id);
    expect(onay.muhatap).toBe("ceo");
    expect(pencereler(onay.id)).toEqual([]);
    await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "onayla", gerekce: "UTC sakla, arayüzde yerel saati göster." });
    expect(await soru).toEqual({ metin: "CEO Ada onayladı. Yanıt: UTC sakla, arayüzde yerel saati göster.", hata: false });
  });

  it("CTO'nun işe alım teklifi CEO'ya gider; CEO onaylayınca CTO'ya CEO'nun notuyla haber verilir", async () => {
    const { mesajlar } = casus();
    const r = await arac(ajan("Kerem").id, "ise_al_teklif", { ad: "Elif", rol: "frontend", gerekce: "Arayüz işi birikti" });
    expect(r.metin).toMatch(/^Teklif CEO Ada'ya gitti: Elif \(Frontend geliştirici\) \(onay [0-9a-f]{8}\)\./);
    const onay = bekleyen("ise_alim", ajan("Kerem").id);
    expect(pencereler(onay.id)).toEqual([]);
    await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "onayla", gerekce: "Arayüz işi gerçekten birikti." });
    expect(ajan("Elif")).toBeTruthy();
    expect(mesajlar(ajan("Kerem").id).find((m) => m.startsWith("İşe alım onaylandı"))).toContain("CEO Ada'nın notu: Arayüz işi gerçekten birikti.");
  });

  it("onay_karari: CEO dışındaki çalışan ve bilinmeyen ya da sonuçlanmış kimlik reddedilir", async () => {
    const r = await arac(ajan("Kerem").id, "onay_karari", { onay: "abcd1234", karar: "onayla", gerekce: "uygun görünüyor" });
    expect(r).toEqual({ metin: "Onaylara yalnız CEO karar verir; isteğini CEO'ya ilet.", hata: true });
    expect((await arac(ceo().id, "onay_karari", { onay: "ffffffff", karar: "onayla", gerekce: "deneme yazısı" })).metin).toContain("Bekleyen onaylar arasında ffffffff yok");
    const eski = depo.onaylar(pid).find((o) => o.tur === "teslim")!;
    expect((await arac(ceo().id, "onay_karari", { onay: kisa(eski.id), karar: "reddet", gerekce: "deneme yazısı" })).metin).toContain("artık karar beklemiyor");
  });

  it("bekleyen onaylar CEO'nun hatırlatmasına ve bekleyen_onaylar'a girer; CEO boşa çıkınca bir kez hatırlatılır ve tavandan muaftır", async () => {
    await arac(ajan("Kerem").id, "isten_cikar_teklif", { ad: "Mert", gerekce: "Test işleri bitti, rol gereksiz" });
    const onay = bekleyen("isten_cikarma");
    expect(onay.muhatap).toBe("ceo");
    expect(ic().hatirlatma(ceo())).toContain(`Kararını bekleyen onaylar (onay_karari ile karar ver): ${kisa(onay.id)} İşten çıkarma: Mert`);
    expect(ic().hatirlatma(ajan("Deniz"))).not.toContain("Kararını bekleyen onaylar");
    const liste = await arac(ceo().id, "bekleyen_onaylar", {});
    expect(liste.metin).toContain(`${kisa(onay.id)} · İşten çıkarma · Kerem · İşten çıkarma: Mert`);
    expect(liste.metin).toContain("CEO karar verecek");
    // Eşzamanlı tavan doluyken de CEO uyanır (çalışanlar onu beklerken kilitlenmesin)
    expect(ic().tavandanMuaf(ceo(), { tur: "sistem" })).toBe(true);
    // İki dakikadan eski onay CEO boşa çıkınca bir kez hatırlatılır
    depo.db.prepare("UPDATE onaylar SET olusturma = ? WHERE id = ?").run(new Date(Date.now() - 5 * 60_000).toISOString(), onay.id);
    const { mesajlar } = casus();
    ic().durumDegisti(ceo().id, "bosta");
    ic().durumDegisti(ceo().id, "bosta");
    const hatirlatmalar = mesajlar(ceo().id).filter((m) => m.includes(kisa(onay.id)));
    expect(hatirlatmalar).toHaveLength(1);
    expect(hatirlatmalar[0]).toMatch(/^Kararını bekleyen 1 onay var; isteyenler bekliyor:/);
    await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "reddet", gerekce: "Mert'e uçtan uca testler kalsın." });
    expect(ajan("Mert")).toBeTruthy();
    expect(ic().tavandanMuaf(ceo(), { tur: "sistem" })).toBe(false);
  });

  it("İngilizce: CEO'ya giden mesaj ve çalışana dönen yanıt İngilizce", async () => {
    dilKaynagi(() => "en");
    try {
      const { mesajlar } = casus();
      const soru = arac(ajan("Deniz").id, "kurula_sor", { soru: "Should we cache the order list?", secenekler: [] });
      await bekle();
      const onay = bekleyen("genel", ajan("Deniz").id);
      const mesaj = mesajlar(ceo().id).find((m) => m.includes(kisa(onay.id))) ?? "";
      expect(mesaj).toContain(`Approval ${kisa(onay.id)} is waiting for your decision · Decision`);
      expect(mesaj).toContain("your gerekce text goes back to the employee as the answer");
      await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "reddet", gerekce: "Not yet; measure first." });
      expect(await soru).toEqual({ metin: "CEO Ada rejected. Answer: Not yet; measure first.", hata: false });
    } finally {
      dilKaynagi(() => "tr");
    }
  });

  it("görev token tavanı: çalışanınki CEO'ya gider; akış notu ve kapı nedeni CEO'yu anar, CEO onaylayınca çalışan sürer", async () => {
    const { mesajlar } = casus();
    const deniz = ajan("Deniz");
    const eskiTavan = sirket.yapilandirma.ayarlar.gorevTokenTavani;
    sirket.yapilandirma.guncelle({ gorevTokenTavani: 1_000_000 });
    const g = sirket.gorevOlustur(pid, { baslik: "Rapor ekranı", atananId: deniz.id });
    try {
      depo.gorevGuncelle(g.id, { durum: "calisiliyor" });
      depo.ajanGuncelle(deniz.id, { gorevId: g.id, durum: "calisiyor" });
      sirket.gorevTavani.tokenEkle(deniz.id, 1_200_000);
      await bekle();
      const onay = bekleyen("genel", deniz.id);
      expect(onay.muhatap).toBe("ceo");
      expect(pencereler(onay.id)).toEqual([]);
      expect(depo.akis(deniz.id).some((o) => o.tur === "sistem" && o.metin?.includes("tur kesildi, CEO'nun kararı bekleniyor."))).toBe(true);
      expect(sirket.gorevTavani.kapiNedeni(deniz.id)).toContain("CEO'nun kararı bekleniyor. Başka iş aracı çağırma");
      expect(mesajlar(ceo().id).find((m) => m.includes(kisa(onay.id)))).toContain(`Kararını bekleyen onay ${kisa(onay.id)}`);
      await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "onayla", gerekce: "Ekran neredeyse bitti; sürsün." });
      expect(sirket.gorevTavani.kayit(g.id).tavan).toBe(2_000_000);
      expect(mesajlar(deniz.id).some((m) => m.startsWith(`CEO Ada ${g.kod} görevinin token tavanını 2 M yaptı.`))).toBe(true);
      expect(sirket.gorevTavani.kapiNedeni(deniz.id)).toBeNull();
    } finally {
      depo.gorevGuncelle(g.id, { durum: "tamam" });
      depo.ajanGuncelle(deniz.id, { gorevId: null, durum: "kapali" });
      sirket.yapilandirma.guncelle({ gorevTokenTavani: eskiTavan });
    }
  });
});

describe("talimat", () => {
  it("CEO'ya tam otonom bölümü, çalışana CEO'ya gittiği, kurul kipinde CEO'ya kurul bölümü verilir", async () => {
    const cwd = sirket.proje(pid).yol;
    const ceoTalimati = ic().talimatOlustur(ceo(), cwd);
    expect(ceoTalimati).toContain("## Karar yetkisi: sende (tam otonom)");
    expect(ceoTalimati).toContain("mcp__arnorg__onay_karari");
    expect(ceoTalimati).toContain("kurula_sor");
    expect(ceoTalimati).toContain("karar yetkisi sende olduğundan ikisi de hemen geçerli olur.");
    expect(ceoTalimati).not.toContain("İşe alım her zaman kurul onayından geçer");
    expect(ic().talimatOlustur(ajan("Deniz"), cwd)).toContain("## Karar yetkisi: CEO'da (tam otonom)");
    expect(ic().talimatOlustur(ajan("Deniz"), cwd)).toContain("CEO Ada'ya gider");
    expect(ic().talimatOlustur(ajan("Kerem"), cwd)).toContain("ikisi de CEO'nun kararına gider.");
    // Ortak kurallar: soru ve dışarı gönderim kipe göre
    expect(ceoTalimati).toContain("Uzak depoya push, yayın ve dağıtım onaydan geçer (karar sende)");
    expect(ceoTalimati).toContain("- Yönetim kuruluna soru gerekiyorsa mcp__arnorg__kurula_sor kullan.");
    const denizTalimati = ic().talimatOlustur(ajan("Deniz"), cwd);
    expect(denizTalimati).toContain("Uzak depoya push, yayın ve dağıtım CEO'nun onayını ister");
    expect(denizTalimati).toContain("- Karar ya da izin gerekiyorsa mcp__arnorg__kurula_sor kullan; tam otonom kipte CEO yanıtlar.");
    depo.projeGuncelle(pid, { kararVeren: "kurul" });
    try {
      expect(ic().talimatOlustur(ceo(), cwd)).toContain("## Karar yetkisi: kurulda");
      const kurulda = ic().talimatOlustur(ajan("Deniz"), cwd);
      expect(kurulda).not.toContain("## Karar yetkisi");
      expect(kurulda).toContain("Uzak depoya push, yayın ve dağıtım kurul onayı ister");
      expect(kurulda).toContain("- Yönetim kuruluna soru gerekiyorsa mcp__arnorg__kurula_sor kullan.");
    } finally {
      depo.projeGuncelle(pid, { kararVeren: "ceo" });
    }
  });
});

describe("kip değişimi", () => {
  it("kurula dönünce CEO'yu bekleyenler kurula açılır, onay_karari kapanır; CEO'ya geçince kendi teklifi kararlaşır, ötekiler toplu mesajla CEO'ya gider", async () => {
    const { mesajlar, uyandir } = casus();
    await arac(ajan("Deniz").id, "birlestirme_iste", { ozet: "İkinci deneme: testler eklendi" });
    const birlestirme = bekleyen("birlestirme");
    expect(birlestirme.muhatap).toBe("ceo");

    await sirket.projeGuncelle(pid, { kararVeren: "kurul" });
    expect(depo.onay(birlestirme.id)!.muhatap).toBe("kurul");
    expect(pencereler(birlestirme.id)).toHaveLength(1);
    expect(genel()).toContain("Kurul karar yetkisini geri aldı: onaylar yeniden kurula gelir.");
    expect(mesajlar(ceo().id).some((m) => m.startsWith("Kurul karar yetkisini geri aldı"))).toBe(true);
    const kapali = await arac(ceo().id, "onay_karari", { onay: kisa(birlestirme.id), karar: "onayla", gerekce: "uygun görünüyor" });
    expect(kapali.hata).toBe(true);
    expect(kapali.metin).toContain("Karar yetkisi kurulda");

    // Kurul kipinde CEO'nun teklifi kurulu bekler
    const t = await arac(ceo().id, "ise_al_teklif", { ad: "Selin", rol: "tasarim", gerekce: "Tasarım sistemi gerekiyor" });
    expect(t.metin).toMatch(/^Teklif yönetim kuruluna sunuldu: Selin/);
    const iseAlim = bekleyen("ise_alim", ceo().id);
    expect(iseAlim.muhatap).toBe("kurul");
    expect(pencereler(iseAlim.id)).toHaveLength(1);

    uyandir.mockClear();
    await sirket.projeGuncelle(pid, { kararVeren: "ceo" });
    expect(depo.onay(iseAlim.id)).toMatchObject({ durum: "onaylandi", kararKaynagi: "ceo", kararVerenAd: "Ada" });
    expect(ajan("Selin")).toBeTruthy();
    expect(depo.onay(birlestirme.id)!.muhatap).toBe("ceo");
    expect(genel()).toContain("Kurul karar yetkisini CEO Ada'ya bıraktı: izinler, birleştirmeler, işe alımlar ve öteki onaylar artık CEO'dan geçer; kurul sonuçları görür.");
    const devir = mesajlar(ceo().id).find((m) => m.startsWith("Kurul karar yetkisini sana bıraktı")) ?? "";
    expect(devir).toContain("Bekleyen 1 onay artık senin kararını bekliyor:");
    expect(devir).toContain(`${kisa(birlestirme.id)} · Birleştirme · Deniz (Backend geliştirici)`);

    // Kurul CEO'yu bekleyen onaya da karar verebilir
    await sirket.onayKarari(birlestirme.id, "reddet", "Önce kalite kapısının test komutunu ekleyin.");
    expect(depo.onay(birlestirme.id)).toMatchObject({ durum: "reddedildi", kararKaynagi: "kurul" });
  });

  it("kurul kipinde otomatik onay eskisi gibi çalışır ve kararı veren 'otomatik' yazılır", async () => {
    await sirket.projeGuncelle(pid, { kararVeren: "kurul", otomatikOnay: { etkin: true, turler: ["ise_alim"] } });
    try {
      await arac(ceo().id, "ise_al_teklif", { ad: "Nehir", rol: "yazar", gerekce: "Belgeler birikti" });
      const onay = depo.onaylar(pid).find((o) => o.tur === "ise_alim" && (o.veri as { ad?: string }).ad === "Nehir")!;
      expect(onay).toMatchObject({ durum: "onaylandi", kararKaynagi: "otomatik", kararVerenAd: "Otomatik onay", not: "Otomatik onay", muhatap: "kurul" });
      expect(ajan("Nehir")).toBeTruthy();
    } finally {
      await sirket.projeGuncelle(pid, { kararVeren: "ceo", otomatikOnay: { etkin: false, turler: [] } });
    }
  });

  it("tam otonom kipte otomatik onay işlemez: CEO'yu bekleyen onay otomatik verilmez", async () => {
    await sirket.projeGuncelle(pid, { otomatikOnay: { etkin: true, turler: ["genel"] } });
    try {
      casus();
      const soru = arac(ajan("Deniz").id, "kurula_sor", { soru: "Sayfalama 20 mi 50 mi olsun?", secenekler: [] });
      await bekle();
      const onay = bekleyen("genel", ajan("Deniz").id);
      expect(onay).toMatchObject({ durum: "bekliyor", muhatap: "ceo" });
      await arac(ceo().id, "onay_karari", { onay: kisa(onay.id), karar: "onayla", gerekce: "20 yeterli." });
      expect((await soru).metin).toBe("CEO Ada onayladı. Yanıt: 20 yeterli.");
    } finally {
      await sirket.projeGuncelle(pid, { otomatikOnay: { etkin: false, turler: [] } });
    }
  });
});

describe("kurula düşme", () => {
  it("CEO'su olmayan projede çalışanın onayı kurula gider", async () => {
    const p2 = depo.projeEkle({ ad: "Ceosuz", yol: path.join(gecici, "ceosuz"), aciklama: "", varsayilanDal: "main" });
    expect(p2.kararVeren).toBe("ceo");
    const ece = sirket.iseAl(p2.id, { ad: "Ece", rol: "frontend" });
    const karar = sirket.kararBekle(ece, "arac", "Ece · Bash", "sudo apt install jq", { arac: "Bash" });
    await bekle();
    const onay = depo.onaylar(p2.id, "bekliyor")[0]!;
    expect(onay.muhatap).toBe("kurul");
    expect(pencereler(onay.id)).toHaveLength(1);
    await sirket.onayKarari(onay.id, "reddet", "Gerek yok");
    await expect(karar).resolves.toMatchObject({ izin: false, kaynak: "kurul", verenAd: "Yönetim kurulu" });
  });

  it("CEO duraklatılınca onu bekleyen onaylar kurula düşer; duraklatılmışken yenisi doğrudan kurula gider", async () => {
    casus();
    const k1 = sirket.kararBekle(ajan("Deniz"), "arac", "Deniz · Bash", "sudo apt install jq", { arac: "Bash" });
    await bekle();
    const o1 = bekleyen("arac", ajan("Deniz").id);
    expect(o1.muhatap).toBe("ceo");
    expect(pencereler(o1.id)).toEqual([]);
    ic().durumDegisti(ceo().id, "duraklatildi", "Görev token tavanı aşıldı");
    await bekle();
    expect(depo.onay(o1.id)!.muhatap).toBe("kurul");
    expect(pencereler(o1.id)).toHaveLength(1);
    const k2 = sirket.kararBekle(ajan("Kerem"), "arac", "Kerem · Bash", "npm publish", { arac: "Bash" });
    await bekle();
    const o2 = bekleyen("arac", ajan("Kerem").id);
    expect(o2.muhatap).toBe("kurul");
    expect(pencereler(o2.id)).toHaveLength(1);
    await sirket.onayKarari(o1.id, "onayla");
    await sirket.onayKarari(o2.id, "reddet", "Yayın yok");
    await expect(k1).resolves.toMatchObject({ izin: true, kaynak: "kurul" });
    await expect(k2).resolves.toMatchObject({ izin: false, kaynak: "kurul" });
    ic().durumDegisti(ceo().id, "kapali");
  });
});

describe("veri ve API", () => {
  it("karar yetkisi sütunu olmayan eski veritabanında projeler CEO kipine geçer, eski onaylarda karar veren boş kalır; geçiş açılışta bir kez duyurulur", () => {
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-karar-goc-"));
    try {
      const dosya = path.join(dizin, "arnorg.db");
      const ilk = new Depo(dosya);
      const p = ilk.projeEkle({ ad: "Eski", yol: path.join(dizin, "repo"), aciklama: "", varsayilanDal: "main" });
      const o = ilk.onayEkle({ projeId: p.id, ajanId: null, tur: "genel", baslik: "Eski soru", ayrinti: "", veri: null, sonGecerlilik: null });
      ilk.kapat();
      const db = new Database(dosya);
      for (const s of ["karar_kaynagi", "karar_veren_ad", "muhatap"]) db.exec(`ALTER TABLE onaylar DROP COLUMN ${s}`);
      db.exec("ALTER TABLE projeler DROP COLUMN karar_veren");
      db.close();
      const ikinci = new Depo(dosya);
      try {
        expect(ikinci.proje(p.id)?.kararVeren).toBe("ceo");
        expect(ikinci.onay(o.id)).toMatchObject({ durum: "bekliyor", kararKaynagi: null, kararVerenAd: null, muhatap: null });
        // Şirket açılınca #genel'e ve CEO sohbetine bir kez yazılır; sonraki açılışta yinelenmez
        const duyurular = (kanal: string) => ikinci.mesajlar(p.id, kanal).filter((m) => m.metin.includes("0.0.7"));
        for (let i = 0; i < 2; i++) new Sirket(ikinci, new OlayYolu(), new Yapilandirma(path.join(dizin, "veri")), () => null, true).kapat();
        expect(duyurular("genel")).toHaveLength(1);
        expect(duyurular("yonetim")).toHaveLength(1);
        expect(duyurular("genel")[0]?.metin).toMatch(/Kurul karar verir|The board decides/);
      } finally {
        ikinci.kapat();
      }
    } finally {
      fs.rmSync(dizin, { recursive: true, force: true });
    }
  });

  it("PATCH /api/projeler/:pid karar yetkisini doğrular ve yazar; proje açılırken de verilebilir", async () => {
    const anahtar = "karar-anahtari-0123456789abcdef";
    const app: FastifyInstance = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
    try {
      const h = { host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` };
      expect((await app.inject({ method: "PATCH", url: `/api/projeler/${pid}`, headers: h, payload: { kararVeren: "herkes" } })).statusCode).toBe(400);
      const kurul = await app.inject({ method: "PATCH", url: `/api/projeler/${pid}`, headers: h, payload: { kararVeren: "kurul" } });
      expect(kurul.statusCode).toBe(200);
      expect(kurul.json()).toMatchObject({ kararVeren: "kurul" });
      const ceoya = await app.inject({ method: "PATCH", url: `/api/projeler/${pid}`, headers: h, payload: { kararVeren: "ceo" } });
      expect(ceoya.json()).toMatchObject({ kararVeren: "ceo" });
      const yeni = await app.inject({ method: "POST", url: "/api/projeler", headers: h, payload: { ad: "Kurullu", yol: path.join(gecici, "kurullu"), olustur: true, kararVeren: "kurul" } });
      expect(yeni.statusCode).toBe(200);
      expect(yeni.json()).toMatchObject({ kararVeren: "kurul" });
    } finally {
      await app.close();
    }
  });
});
