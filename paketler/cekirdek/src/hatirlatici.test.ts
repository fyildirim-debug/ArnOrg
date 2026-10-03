// Hatırlatıcı: tur başı, hata ve dosya anında hafıza; uzman bulma ve önceki yanıt
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Depo } from "./depo.js";
import { anlamliSozcukler, hataOzu, tercihGibi, uzmanBul } from "./hatirlatici.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ajan = (ad: string) => depo.ajanAdla(pid, ad)!;

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-hatirlatici-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
  const p = await sirket.projeOlustur({ ad: "Hatırlatıcı", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  sirket.iseAl(pid, { ad: "Elif", rol: "frontend" });
  sirket.iseAl(pid, { ad: "Mert", rol: "test" });
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("yardımcılar", () => {
  it("anlamlı sözcükler durak sözcükleri ve sayıları atar, Türkçe harfleri sadeleştirir", () => {
    expect(anlamliSozcukler("Veritabanı bağlantısı için hangi port kullanılıyor? 5432")).toEqual(["veritabani", "baglantisi", "port", "kullaniliyor"]);
  });

  it("hata özü anahtar sözcük geçen satırları seçer", () => {
    const oz = hataOzu("> build\nderleniyor...\nsrc/a.ts(3,1): error TS2307: Cannot find module 'zod'\nbitti");
    expect(oz).toBe("src/a.ts(3,1): error TS2307: Cannot find module 'zod'");
  });

  it("kalıcı tercih cümlelerini tanır", () => {
    expect(tercihGibi("Bundan sonra commit mesajları Türkçe olsun")).toBe(true);
    expect(tercihGibi("Asla main'e doğrudan push etme")).toBe(true);
    expect(tercihGibi("T-4'e bakar mısın?")).toBe(false);
  });
});

describe("tur başı", () => {
  it("başkasının yeni kaydını bir kez verir, kendi kaydını vermez, mesajla ilgili kaydı ekler", async () => {
    const deniz = ajan("Deniz");
    const elif = ajan("Elif");
    sirket.hatirlatici.oturumAcildi(elif.id, []);
    await bekle(5);
    sirket.hafizaYaz(pid, { tur: "karar", baslik: "API önekleri /api/v1", metin: "Tüm uçlar /api/v1 altında; sürüm başlıkla değil yolla verilir." }, deniz.id);
    sirket.hafizaYaz(pid, { tur: "olgu", baslik: "Elif'in notu", metin: "Bileşenler src/ui altında." }, elif.id);

    const ilk = sirket.hatirlatici.turBasi(elif, "Merhaba, bugünkü işe başla.", false)!;
    expect(ilk).toContain("Ekipten yeni hafıza");
    expect(ilk).toContain("API önekleri /api/v1");
    expect(ilk).not.toContain("Elif'in notu");
    // İkinci turda aynı kayıt yinelenmez
    expect(sirket.hatirlatici.turBasi(elif, "Devam et.", false)).toBeNull();

    sirket.hafizaYaz(pid, { tur: "ogrenilen", baslik: "Tarayıcı önbelleği", metin: "Vite önbelleği bozulunca node_modules/.vite silinir; sonra tarayıcı önbelleği temizlenir." }, ajan("Mert").id);
    const ilgili = sirket.hatirlatici.turBasi(ajan("Deniz"), "Tarayıcı önbelleği yüzünden eski bundle görünüyor, vite ne yapalım?", false)!;
    expect(ilgili).toContain("Tarayıcı önbelleği");
  });

  it("kuruldan gelen kalıcı tercih cümlesinde kaydetmeyi hatırlatır", () => {
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    sirket.hatirlatici.oturumAcildi(ceo.id, []);
    expect(sirket.hatirlatici.turBasi(ceo, "Bundan sonra her PR'da ekran görüntüsü olsun.", true)).toContain("tur: tercih");
    expect(sirket.hatirlatici.turBasi(ceo, "Bundan sonra her PR'da ekran görüntüsü olsun.", false) ?? "").not.toContain("tur: tercih");
  });
});

describe("hata ve dosya anında", () => {
  it("aynı hataya dair öğrenileni hatırlatır; kayıt yoksa bir kez kaydetme ipucu verir", () => {
    const mert = ajan("Mert");
    sirket.hatirlatici.oturumAcildi(mert.id, []);
    sirket.hafizaYaz(
      pid,
      { tur: "ogrenilen", baslik: "better-sqlite3 derleme hatası", metin: "NODE_MODULE_VERSION uyuşmazlığında pnpm rebuild better-sqlite3 çalıştırılır.", etiketler: ["sqlite"] },
      ajan("Deniz").id,
    );
    const ek = sirket.hatirlatici.hataSonrasi(mert, "Bash", { command: "pnpm test" }, "Error: The module was compiled against a different NODE_MODULE_VERSION\nbetter-sqlite3 failed")!;
    expect(ek).toContain("better-sqlite3 derleme hatası");
    // Aynı kayıt aynı oturumda ikinci kez hatırlatılmaz; ilgisiz hatada bir kez ipucu verilir, sonra susar
    const ikinci = sirket.hatirlatici.hataSonrasi(mert, "Bash", { command: "pnpm test" }, "NODE_MODULE_VERSION better-sqlite3");
    expect(ikinci ?? "").not.toContain("better-sqlite3 derleme hatası");
    const ipucu = sirket.hatirlatici.hataSonrasi(mert, "Bash", { command: "cargo build" }, "linker cc not found");
    expect(ipucu === null || ipucu.includes("tur: ogrenilen")).toBe(true);
    expect(sirket.hatirlatici.hataSonrasi(mert, "Bash", { command: "make" }, "gcc missing toolchain")).toBeNull();
  });

  it("dosyaya dokununca o dosyayı anan kaydı verir", () => {
    const elif = ajan("Elif");
    sirket.hatirlatici.oturumAcildi(elif.id, []);
    sirket.hafizaYaz(pid, { tur: "karar", baslik: "Tema değişkenleri", metin: "Renkler yalnız src/stiller/tokenlar.css içinde tanımlanır; bileşende sabit renk yok." }, ajan("Deniz").id);
    const kok = sirket.proje(pid).yol;
    const ek = sirket.hatirlatici.dosyaSonrasi(elif, kok, "Edit", { file_path: path.join(kok, "src/stiller/tokenlar.css") })!;
    expect(ek).toContain("src/stiller/tokenlar.css hakkında");
    expect(ek).toContain("Tema değişkenleri");
    expect(sirket.hatirlatici.dosyaSonrasi(elif, kok, "Edit", { file_path: path.join(kok, "src/stiller/tokenlar.css") })).toBeNull();
    expect(sirket.hatirlatici.dosyaSonrasi(elif, kok, "Grep", { pattern: "tokenlar" })).toBeNull();
  });
});

describe("uzman bulma ve önceki yanıt", () => {
  it("uzmanlık kaydı ve rol konusu en uygun çalışanı seçer; işaret yoksa yöneticiye gider", () => {
    const elif = ajan("Elif");
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    sirket.hafizaYaz(pid, { tur: "uzmanlik", baslik: "Ödeme entegrasyonu", metin: "Iyzico ödeme akışını ve webhook imzasını Deniz kurdu." }, ceo.id);
    expect(uzmanBul(depo, elif, "Iyzico webhook imzası nasıl doğrulanıyor?")).toMatchObject({ ajan: { ad: "Deniz" } });
    expect(uzmanBul(depo, ajan("Deniz"), "Playwright e2e testi neden kırmızı?")).toMatchObject({ ajan: { ad: "Mert" } });
    const yedek = uzmanBul(depo, elif, "Öğle yemeği saat kaçta?")!;
    expect(yedek.neden).toMatch(/belirgin bir uzman yok/);
  });

  it("hedefsiz soru uzmana gider; aynı soru yeniden sorulunca önceki yanıt döner", async () => {
    const elif = ajan("Elif");
    const s = sirket as unknown as { uyandir: (...a: unknown[]) => Promise<boolean> };
    const asil = s.uyandir;
    s.uyandir = async () => true;
    const bekleyen = sirket.ajanaSor(elif.id, null, "Iyzico webhook imzası hangi anahtarla doğrulanıyor?", 1);
    await bekle(10);
    const soru = depo.sorular(pid, { durum: "bekliyor" })[0]!;
    expect(soru.soruluAd).toBe("Deniz");
    sirket.soruYanitla(soru.soruluId, soru.id, "Kasa'daki IYZICO_SECRET ile HMAC-SHA256.");
    const sonuc = await bekleyen;
    expect(sonuc).toMatchObject({ durum: "yanitlandi", yonlendirme: expect.stringContaining("Ödeme entegrasyonu") });

    // Mert benzer soruyu sorunca Deniz yeniden uyandırılmaz
    let uyandirma = 0;
    s.uyandir = async () => {
      uyandirma++;
      return true;
    };
    const tekrar = await sirket.ajanaSor(ajan("Mert").id, "Deniz", "Iyzico webhook imzası hangi anahtarla doğrulanıyor acaba?", 1);
    expect(tekrar).toMatchObject({ onceki: true, yanit: "Kasa'daki IYZICO_SECRET ile HMAC-SHA256." });
    expect(uyandirma).toBe(0);
    s.uyandir = asil;
  });
});

describe("hafıza bakımı", () => {
  it("tekrar eden kayıtları bulur; ayrı tutulan çift bir daha önerilmez; birleştirme eskisini işaretler", () => {
    const deniz = ajan("Deniz");
    const a = sirket.hafizaYaz(pid, { tur: "tercih", baslik: "Para birimi kuruş olarak saklanır", metin: "Tutarlar veritabanında tamsayı kuruş olarak tutulur; kayan nokta kullanılmaz.", etiketler: ["para"] }, null);
    const b = sirket.hafizaYaz(pid, { tur: "tercih", baslik: "Tutarlar kuruş", metin: "Tutarlar kuruş cinsinden tamsayı saklanır, kayan nokta yok.", etiketler: ["veritabani"] }, deniz.id);
    const c = sirket.hafizaYaz(pid, { tur: "karar", baslik: "Tutarlar kuruş", metin: "Tutarlar kuruş cinsinden tamsayı saklanır, kayan nokta yok." }, deniz.id);
    const ciftler = sirket.hafiza.benzerler(pid);
    const bizim = ciftler.find((x) => [x.a.id, x.b.id].sort().join() === [a.id, b.id].sort().join());
    expect(bizim?.benzerlik).toBeGreaterThanOrEqual(0.45);
    // Farklı türdeki aynı metin çift sayılmaz
    expect(ciftler.some((x) => [x.a.id, x.b.id].includes(c.id) && [x.a.id, x.b.id].includes(b.id))).toBe(false);

    sirket.hafiza.ayriTut(pid, b.id, a.id);
    expect(sirket.hafiza.benzerler(pid).some((x) => [x.a.id, x.b.id].includes(a.id) && [x.a.id, x.b.id].includes(b.id))).toBe(false);

    const k = sirket.hafiza.birlestir(a.id, b.id, "Tutarlar tamsayı kuruş olarak saklanır; kayan nokta kullanılmaz.");
    expect(k.etiketler.sort()).toEqual(["para", "veritabani"]);
    expect(depo.hafizaKaydi(b.id)?.yerineGecen).toBe(a.id);
    expect(() => sirket.hafiza.birlestir(b.id, a.id)).toThrow(/eskimiş/);
  });
});

describe("görev devri", () => {
  it("devralınan görevin mesajında önceki sahibin defteri, göreve bağlı hafıza ve görevle ilgili soru-yanıt olur", () => {
    const deniz = ajan("Deniz");
    const mert = ajan("Mert");
    const g = sirket.gorevOlustur(pid, { baslik: "Sipariş iptal ucu", aciklama: "PATCH /siparisler/:id/iptal", atananId: deniz.id });
    sirket.defterYaz(deniz.id, "## Açık\n- İptal ucu yazıldı, testleri eksik\n## Sıradaki\n- 409 durumunu test et");
    sirket.hafizaYaz(pid, { tur: "karar", baslik: "İptal yalnız kargodan önce", metin: "Kargodaki sipariş iptal edilemez; 409 döner.", gorevId: g.id }, deniz.id);
    const kayit = depo.soruEkle({ projeId: pid, soranId: mert.id, soranAd: "Mert", soruluId: deniz.id, soruluAd: "Deniz", soru: `${g.kod} için iptal hangi kodla reddediliyor?` });
    depo.soruSonuclandir(kayit.id, "yanitlandi", "409 GECERSIZ_GECIS");

    const devralinan = depo.gorevGuncelle(g.id, { atananId: mert.id });
    const metin = sirket.gorevMetni(devralinan, deniz.id);
    expect(metin).toContain("Devir: bu görevde daha önce Deniz");
    expect(metin).toContain("409 durumunu test et");
    expect(metin).toContain("Bu görevle ilgili hafıza:");
    expect(metin).toContain("İptal yalnız kargodan önce");
    expect(metin).toContain("409 GECERSIZ_GECIS");
    // Göreve bağlı kayıt "İlgili hafıza" altında yinelenmez
    expect(metin.split("İptal yalnız kargodan önce").length - 1).toBe(1);
    // Devir yoksa defter eklenmez
    expect(sirket.gorevMetni(devralinan)).not.toContain("Devir:");
  });
});

describe("toplantı", () => {
  it("katılımcı verilmezse uzmanları seçer, görüşleri paralel toplar, kanala ve hafızaya yazar", async () => {
    const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
    const s = sirket as unknown as { uyandir: (...a: unknown[]) => Promise<boolean> };
    const asil = s.uyandir;
    s.uyandir = async () => true;
    const toplanti = sirket.toplantiYap(ceo.id, "Iyzico webhook imzası ve Playwright e2e testi: ödeme akışını nasıl test edelim?", null, 1);
    await bekle(20);
    const bekleyenler = depo.sorular(pid, { durum: "bekliyor" });
    const adlar = bekleyenler.map((x) => x.soruluAd).sort();
    expect(adlar).toEqual(expect.arrayContaining(["Deniz", "Mert"]));
    for (const soru of bekleyenler) sirket.soruYanitla(soru.soruluId, soru.id, `${soru.soruluAd}: sandbox anahtarıyla uçtan uca dene.`);
    const sonuc = await toplanti;
    const mert = sonuc.gorusler.find((g) => g.ad === "Mert")!;
    const deniz = sonuc.gorusler.find((g) => g.ad === "Deniz")!;
    expect(deniz).toMatchObject({ durum: "yanitlandi", gorus: "Deniz: sandbox anahtarıyla uçtan uca dene." });
    expect(deniz.neden).toBeTruthy();
    expect(mert.durum).toBe("yanitlandi");
    const kanal = depo.mesajlar(pid, "toplanti");
    expect(kanal.some((m) => m.gonderenAd === ceo.ad && m.metin.startsWith("Toplantı:"))).toBe(true);
    expect(kanal.some((m) => m.gonderenAd === "Deniz")).toBe(true);
    expect(depo.hafizaKaydi(sonuc.kayitId)).toMatchObject({ tur: "ozet", kaynakAjanId: ceo.id });
    s.uyandir = asil;
  });

  it("verilen katılımcı adı yoksa reddeder; kendini çağıramaz", async () => {
    const elif = ajan("Elif");
    await expect(sirket.toplantiYap(elif.id, "Tema renkleri değişsin mi, karar verelim.", ["Yok"], 1)).rejects.toThrow(/çalışan yok/);
    await expect(sirket.toplantiYap(elif.id, "Tema renkleri değişsin mi, karar verelim.", ["Elif"], 1)).rejects.toThrow(/bulunamadı/);
  });
});

describe("aynı dosyada çalışma", () => {
  it("başka ajan aynı dosyayı yakın zamanda değiştirdiyse bir kez uyarır; eski yazma sayılmaz", () => {
    const deniz = ajan("Deniz");
    const elif = ajan("Elif");
    const mert = ajan("Mert");
    const t = 1_000_000_000;
    expect(sirket.hatirlatici.yazmaIzi(deniz, "src/api/siparis.ts", t)).toBeNull();
    const uyari = sirket.hatirlatici.yazmaIzi(elif, "src/api/siparis.ts", t + 5 * 60_000)!;
    expect(uyari).toContain("src/api/siparis.ts dosyasını Deniz (5 dk önce");
    expect(sirket.hatirlatici.yazmaIzi(elif, "src/api/siparis.ts", t + 6 * 60_000)).toBeNull();
    // Deniz de Elif'in değişikliğinden haberdar olur
    expect(sirket.hatirlatici.yazmaIzi(deniz, "src/api/siparis.ts", t + 7 * 60_000)).toContain("Elif");
    // 6 saatten eski yazma uyarı doğurmaz; .arnorg yolu izlenmez
    expect(sirket.hatirlatici.yazmaIzi(mert, "src/api/siparis.ts", t + 7 * 3600_000)).toBeNull();
    expect(sirket.hatirlatici.yazmaIzi(mert, ".arnorg/hafiza/hafiza.md", t)).toBeNull();
  });
});
