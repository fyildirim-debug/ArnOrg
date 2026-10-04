// Ajan zekâsı, ana yasa, global zekâ ve kurul akışları (Claude Code oturumu açılmaz)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ajan, SunucuOlayi } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { benzerlik, kapsamUyar, projeyeOzguMu } from "./kuresel-zeka.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { talimatOlustur } from "./talimat.js";
import { Yapilandirma } from "./yapilandirma.js";
import { KISISEL_SINIR } from "./zeka.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let yap: Yapilandirma;
let pid: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
async function arac(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const a = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((x) => x.name === ad);
  if (!a) throw new Error(`araç yok: ${ad}`);
  const s = await a.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}
const ajan = (ad: string): Ajan => depo.ajanAdla(pid, ad)!;
const bekle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const talimat = (a: Ajan): string => (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(a, a.calismaAlani ?? sirket.proje(pid).yol);

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-zeka-"));
  yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Zekâ", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  sirket.iseAl(pid, { ad: "Ece", rol: "frontend" });
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("kişisel hafıza", () => {
  it("ekler, değiştirir, siler; sınırı korur; dosyaya yansır", async () => {
    const d = ajan("Deniz");
    expect((await arac(d.id, "kendime_not", { islem: "ekle", metin: "Testleri vitest --run ile çalıştır." })).hata).toBe(false);
    await arac(d.id, "kendime_not", { islem: "ekle", metin: "Göç dosyaları db/goc altında." });
    await arac(d.id, "kendime_not", { islem: "degistir", eski: "db/goc", metin: "Göç dosyaları paketler/db/goc altında." });
    expect(sirket.zeka.kisisel(d)).toEqual(["Testleri vitest --run ile çalıştır.", "Göç dosyaları paketler/db/goc altında."]);
    expect((await arac(d.id, "kendime_not", { islem: "sil", eski: "yok-boyle" })).hata).toBe(true);
    const dosya = path.join(sirket.proje(pid).yol, ".arnorg", "hafiza", "ajanlar", "deniz.kisisel.md");
    expect(fs.readFileSync(dosya, "utf8")).toContain("paketler/db/goc");
    // Sınır: 4 × 600 karakter sığmaz
    let son = { metin: "", hata: false };
    for (let i = 0; i < 5 && !son.hata; i++) son = await arac(d.id, "kendime_not", { islem: "ekle", metin: `${i} ${"x".repeat(560)}` });
    expect(son.hata).toBe(true);
    expect(son.metin).toContain(String(KISISEL_SINIR));
  });

  it("oturum talimatına donmuş anlık görüntü olarak girer", () => {
    expect(talimat(ajan("Deniz"))).toContain("Testleri vitest --run ile çalıştır.");
  });
});

describe("sözler, beceriler, geçmiş ve aktarım", () => {
  it("söz verilir, bağlarda görünür, alana haber gider, tutulunca kapanır", async () => {
    const d = ajan("Deniz");
    const e = ajan("Ece");
    const r = await arac(d.id, "soz_ver", { metin: "Login API'sini yarın öğlene kadar bitireceğim", kime: "Ece" });
    expect(r.hata).toBe(false);
    expect(sirket.zeka.baglar(d)).toContain("Login API");
    expect(sirket.zeka.baglar(e)).toContain("Deniz");
    const id = depo.sozler(pid, { verenId: d.id, durum: "acik" })[0]!.id;
    expect((await arac(d.id, "soz_tut", { soz_id: id.slice(0, 8), durum: "tutuldu", not: "PR hazır" })).hata).toBe(false);
    expect(depo.soz(id)?.durum).toBe("tutuldu");
    expect(sirket.zeka.haberleriAl(e.id).join("\n")).toMatch(/söz verdi[\s\S]*sözü tuttu/);
    // Başkasının sözünü kapatamaz
    const s2 = sirket.zeka.sozVer(d, null, "Kurula haftalık rapor vereceğim", null);
    expect((await arac(e.id, "soz_tut", { soz_id: s2.id, durum: "tutuldu" })).hata).toBe(true);
  });

  it("beceri yazılır, listelenir, okunur ve talimat dizinine girer", async () => {
    const d = ajan("Deniz");
    await arac(d.id, "beceri_yaz", { ad: "Veritabanı göçü", aciklama: "Şema değişince göç dosyası yazmak için", icerik: "1. npm run goc:yeni\n2. Testleri çalıştır" });
    expect((await arac(d.id, "beceri_listele", {})).metin).toContain("Veritabanı göçü");
    expect((await arac(ajan("Ece").id, "beceri_oku", { ad: "Veritabanı göçü" })).metin).toContain("npm run goc:yeni");
    expect(sirket.zeka.beceriler(sirket.proje(pid))[0]?.kullanim).toBe(1);
    expect(talimat(ajan("Ece"))).toContain("Veritabanı göçü: Şema değişince");
  });

  it("geçmiş konuşmalarda ve kanal mesajlarında arar", async () => {
    const d = ajan("Deniz");
    depo.akisEkle(pid, { id: "a1", ajanId: d.id, zaman: new Date().toISOString(), tur: "asistan", metin: "Redis bağlantı zaman aşımı sorununu havuz boyutunu artırarak çözdüm" });
    await sirket.mesajGonder(pid, "muhendislik", ajan("Ece").id, "Redis bağlantı hatası tekrar çıktı mı?");
    const ben = (await arac(d.id, "gecmiste_ara", { sorgu: "redis bağlantı", kapsam: "ben", sinir: 5 })).metin;
    expect(ben).toContain("havuz boyutunu");
    const ekip = (await arac(d.id, "gecmiste_ara", { sorgu: "redis bağlantı", kapsam: "ekip", sinir: 5 })).metin;
    expect(ekip).toContain("#muhendislik");
  });

  it("hafıza aktarımı: defterine devir bölümü yazılır, açık sözler geçer", async () => {
    const d = ajan("Deniz");
    const e = ajan("Ece");
    sirket.defterYaz(d.id, "- Login API: tamam\n- Sıradaki: oturum yenileme");
    const r = await arac(d.id, "hafiza_aktar", { kime: "Ece", not: "Oturum yenilemeyi sen bitir", sozler: true });
    expect(r.hata).toBe(false);
    const defter = sirket.hafiza.defter(e);
    expect(defter).toContain("Devir: Deniz");
    expect(defter).toContain("oturum yenileme");
    expect(defter).toContain("paketler/db/goc");
    expect(depo.sozler(pid, { verenId: e.id, durum: "acik" }).some((s) => s.metin.includes("haftalık rapor"))).toBe(true);
  });
});

describe("ana yasa", () => {
  it("CEO önerir, kurul onaylar; dosya yazılır, sürüm artar, talimata ve kapıya girer", async () => {
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    expect((await arac(ajan("Deniz").id, "anayasa_oner", { maddeler: [{ baslik: "x", metin: "y" }], gerekce: "deneme" })).hata).toBe(true);
    const r = await arac(ceo.id, "anayasa_oner", {
      maddeler: [
        { baslik: "Gizli bilgi", metin: ".env dosyaları okunmaz ve commit'lenmez.", kural: { hedef: "yol", desenler: ["(^|/)\\.env(\\.|$)"], karar: "ret" } },
        { baslik: "Testsiz iş yok", metin: "Test geçmeden iş incelemeye alınmaz." },
      ],
      gerekce: "Hazırlık görüşmesinde kurulla konuşuldu",
    });
    expect(r.hata).toBe(false);
    await bekle();
    const onay = depo.onaylar(pid, "bekliyor").find((o) => o.tur === "anayasa")!;
    expect(gelenler.some((o) => o.tur === "kurul.bildirimi" && o.bildirim.onayId === onay.id)).toBe(true);
    await sirket.onayKarari(onay.id, "onayla");
    const a = sirket.anayasa(pid);
    expect(a).toMatchObject({ surum: 1, onaylayan: "Yönetim kurulu" });
    expect(fs.readFileSync(path.join(sirket.proje(pid).yol, ".arnorg", "anayasa.md"), "utf8")).toContain("Testsiz iş yok");
    expect(talimat(ajan("Ece"))).toContain("Ana yasa (sürüm 1)");
    const k = await sirket.kapi(ajan("Ece").id, "Read", { file_path: ".env.local" });
    expect(JSON.stringify(k)).toContain("deny");
  });

  it("ana yasa değişince ajana sonraki turda yeni hâli hatırlatılır", () => {
    const e = ajan("Ece");
    talimat(e);
    sirket.anayasaGuncelle(pid, [...sirket.anayasa(pid).maddeler, { baslik: "Türkçe commit", metin: "Commit mesajları Türkçe yazılır.", kural: null }], "Yönetim kurulu");
    const ek = (sirket as unknown as { turBasiEki(a: Ajan, m: string): string | null }).turBasiEki(e, "devam et");
    expect(ek).toContain("Ana yasa değişti (sürüm 2)");
    expect(ek).toContain("Türkçe commit");
  });
});

describe("global zekâ", () => {
  it("projeye özgülük, benzerlik ve kapsam yardımcıları", () => {
    expect(projeyeOzguMu("Bu projede Redux kullanma")).toBe(true);
    expect(projeyeOzguMu("src/app.ts dosyasına dokunma")).toBe(true);
    expect(projeyeOzguMu("Commit mesajlarına emoji koyma")).toBe(false);
    expect(benzerlik("Commit mesajlarında emoji kullanma", "commit mesajına emoji koyma, kullanma")).toBeGreaterThan(0.5);
    expect(kapsamUyar([], { kimlik: "backend", yonetici: false })).toBe(true);
    expect(kapsamUyar(["yonetici"], { kimlik: "backend", yonetici: false })).toBe(false);
    expect(kapsamUyar(["gelistirici"], { kimlik: "backend", yonetici: false })).toBe(true);
    expect(kapsamUyar(["frontend"], { kimlik: "frontend", yonetici: false })).toBe(true);
  });

  it("kurul tercihi standart olur; benzeri güçlendirir; ders önce aday, başka projede de görülünce standart", async () => {
    sirket.hafizaYaz(pid, { tur: "tercih", baslik: "Emoji yok", metin: "Commit mesajlarında ve kodda emoji kullanma.", onem: 5 }, null);
    let k = depo.kurallar().find((x) => x.metin.includes("emoji"))!;
    expect(k).toMatchObject({ durum: "etkin", kaynak: "kurul" });
    const g0 = k.guven;
    sirket.kuresel.gozlem({ metin: "Commit mesajlarına emoji koyma, kullanma", kaynak: "tercih", projeId: "baska-proje", projeAd: "Başka" });
    k = depo.kural(k.id)!;
    expect(k.guven).toBeGreaterThan(g0);
    expect(k.kanitlar).toHaveLength(2);
    // Projeye özgü tercih global kurala dönüşmez
    sirket.hafizaYaz(pid, { tur: "tercih", baslik: "Durum yönetimi", metin: "Bu projede durum yönetimi için zustand kullan.", onem: 5 }, null);
    expect(depo.kurallar().some((x) => x.metin.includes("zustand"))).toBe(false);
    // Ders: aday; başka projeden benzer ders gelince etkin
    sirket.hafizaYaz(pid, { tur: "ogrenilen", baslik: "Windows yol ayracı", metin: "Windows'ta yol karşılaştırırken büyük küçük harf duyarsız karşılaştır ve ters eğik çizgiyi düzelt.", onem: 3 }, ajan("Deniz").id);
    const ders = depo.kurallar().find((x) => x.metin.includes("Windows"))!;
    expect(ders.durum).toBe("aday");
    sirket.kuresel.gozlem({ metin: "Windows yollarını karşılaştırırken harf duyarsız karşılaştır, ters eğik çizgiyi düzelt", kaynak: "ogrenilen", projeId: "baska-proje", projeAd: "Başka" });
    expect(depo.kural(ders.id)!.durum).toBe("etkin");
  });

  it("talimata kapsamına göre girer; yanlış geri bildirimi emekliye ayırır; kurul kuralı ekler", async () => {
    const f = sirket.kuresel.kurulEkle("Arayüzde her durum için boş, yükleniyor ve hata hâli yaz.", ["frontend"]);
    expect(talimat(ajan("Ece"))).toContain("boş, yükleniyor ve hata");
    expect(talimat(ajan("Deniz"))).not.toContain("boş, yükleniyor ve hata");
    expect(depo.kural(f.id)!.kullanim).toBeGreaterThan(0);
    const aday = sirket.kuresel.gozlem({ metin: "Her fonksiyona uzun açıklama yorumu yaz", kaynak: "ajan", projeId: pid, projeAd: "Zekâ" })!;
    expect(aday.durum).toBe("aday");
    for (let i = 0; i < 3; i++) await arac(ajan("Deniz").id, "kuresel_kural_degerlendir", { kural_id: aday.id.slice(0, 8), sonuc: "yanlis", not: "gereksiz yorum" });
    expect(depo.kural(aday.id)!.durum).toBe("emekli");
    expect(sirket.kuresel.durum().gunluk.some((g) => g.tur === "emekli")).toBe(true);
    expect(fs.readFileSync(path.join(yap.veriDizini, "zeka", "kurallar.md"), "utf8")).toContain("boş, yükleniyor ve hata");
  });

  it("bakım tekrar eden kuralları birleştirir", () => {
    const a = sirket.kuresel.kurulEkle("Gizli anahtarları asla depoya commit'leme.", []);
    const b = depo.kuralEkle({ metin: "Gizli anahtarları depoya asla commit'leme!", kapsam: [], kaynak: "ajan", kanitlar: [], guven: 0.6, durum: "etkin" });
    sirket.kuresel.bakim();
    const durumlar = [depo.kural(a.id)!.durum, depo.kural(b.id)!.durum].sort();
    expect(durumlar).toEqual(["emekli", "etkin"]);
  });
});

describe("kurul akışları", () => {
  it("otomatik onay açıkken işe alım teklifi kendiliğinden onaylanır, kayıt tutulur", async () => {
    await sirket.projeGuncelle(pid, { otomatikOnay: { etkin: true, turler: ["ise_alim"] } });
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    const r = await arac(ceo.id, "ise_al_teklif", { ad: "Mert", rol: "test", gerekce: "Test kapsamını artırmak için" });
    expect(r.hata).toBe(false);
    await bekle(60);
    expect(depo.ajanAdla(pid, "Mert")).toBeTruthy();
    const onay = depo.onaylar(pid).find((o) => o.tur === "ise_alim")!;
    expect(onay).toMatchObject({ durum: "onaylandi", not: "Otomatik onay" });
    await sirket.projeGuncelle(pid, { otomatikOnay: { etkin: false, turler: [] } });
  });

  it("işten çıkarma: açık işler ve bildikleri devralana geçer; CEO çıkarılamaz", async () => {
    const mert = ajan("Mert");
    const ece = ajan("Ece");
    sirket.zeka.kisiselYaz(mert, "ekle", "E2E testleri playwright ile çalışır.");
    const g = sirket.gorevOlustur(pid, { baslik: "E2E testleri", atananId: mert.id, durum: "planlandi" });
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    expect((await arac(ceo.id, "isten_cikar_teklif", { ad: "Ada", gerekce: "kendini çıkarmak istiyor" })).hata).toBe(true);
    expect((await arac(ceo.id, "isten_cikar_teklif", { ad: "Mert", gerekce: "Test işleri bitti, rol gereksiz", devralan: "Ece" })).hata).toBe(false);
    await bekle();
    const onay = depo.onaylar(pid, "bekliyor").find((o) => o.tur === "isten_cikarma")!;
    await sirket.onayKarari(onay.id, "onayla");
    expect(depo.ajanAdla(pid, "Mert")).toBeNull();
    expect(depo.gorev(g.id)?.atananId).toBe(ece.id);
    expect(sirket.hafiza.defter(ece)).toContain("playwright");
    expect(depo.mesajlar(pid, "genel").at(-1)?.metin).toContain("Mert");
  });

  it("teslim: kurul geri bildirimi #genel'e düşer; kabulde özet hafızaya yazılır", async () => {
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    expect((await arac(ajan("Ece").id, "teslim_et", { baslik: "x", ozet: "yeterince uzun özet", test_adimlari: ["a"] })).hata).toBe(true);
    const r = await arac(ceo.id, "teslim_et", { baslik: "Giriş ekranı", ozet: "Giriş ve oturum yenileme bitti", test_adimlari: ["npm run dev", "giriş yap"], calistir: "npm run dev", adres: "http://localhost:5173" });
    expect(r.hata).toBe(false);
    await bekle();
    const t1 = depo.onaylar(pid, "bekliyor").find((o) => o.tur === "teslim")!;
    expect((t1.veri as { calistir: string }).calistir).toBe("npm run dev");
    await sirket.onayKarari(t1.id, "reddet", "Şifre alanı boşken hata vermiyor");
    expect(depo.mesajlar(pid, "genel").at(-1)?.metin).toContain("Şifre alanı boşken");
    await arac(ceo.id, "teslim_et", { baslik: "Giriş ekranı v2", ozet: "Doğrulama eklendi, tekrar denenebilir", test_adimlari: ["giriş yap"] });
    await bekle();
    const t2 = depo.onaylar(pid, "bekliyor").find((o) => o.tur === "teslim")!;
    await sirket.onayKarari(t2.id, "onayla");
    expect(depo.hafizaKayitlari(pid, { tur: "ozet" }).some((k) => k.baslik.includes("Giriş ekranı v2"))).toBe(true);
  });

  it("#yonetim: kurulun mesajı CEO'ya gider (yazıyor göstergesi), başkası yazamaz; İngilizce ad kimliğe çevrilir", async () => {
    gelenler.length = 0;
    await sirket.mesajGonder(pid, "yonetim", "kurul", "Merhaba, ilk hedefimiz ne olmalı?");
    expect(gelenler.some((o) => o.tur === "kanal.yaziyor" && o.kanal === "yonetim" && o.yaziyor)).toBe(true);
    await expect(sirket.mesajGonder(pid, "yonetim", ajan("Ece").id, "araya giriyorum")).rejects.toThrow(/kurul ile CEO/);
    const m = await sirket.mesajGonder(pid, "#General", "kurul", "Herkese merhaba");
    expect(m.kanal).toBe("genel");
  });
});

describe("talimat dili", () => {
  it("İngilizcede İngilizce yazar, kanalları görünen adlarıyla anar", () => {
    const e = ajan("Ece");
    const metin = talimatOlustur({
      ajan: e,
      proje: sirket.proje(pid),
      rol: undefined,
      yonetici: null,
      ekip: [],
      cwd: "/tmp",
      anayasa: sirket.anayasa(pid),
      kuresel: "",
      kisisel: [],
      beceriler: [],
      baglar: "",
      hafizaBaglami: "",
      dil: "en",
    });
    expect(metin).toContain("Write in English");
    expect(metin).toContain("#general");
    expect(metin).toContain("Constitution (version");
    expect(metin).not.toContain("- Türkçe yaz.");
  });
});
