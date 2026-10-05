// Seçenekli sorular: Stüdyo yardımcıları ("Seçerek yanıtla" önerisi, kurula sorunun seçenekleri ve kurulun notundan
// seçilen) ve sahte çekirdekteki liste bulucunun ortak'takiyle aynı sonucu vermesi
import { KURUL, metindekiSecenekler, type Mesaj, type Onay } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";
import { duzMetinSecenekleri, kurulSonraYazdi, onaySecenekleri, onaySecilen, onaySorusu } from "./secenek";

const mesaj = (id: string, gonderenId: string, metin: string, kanal = "yonetim"): Mesaj => ({
  id,
  projeId: "p",
  kanal,
  gonderenId,
  gonderenAd: gonderenId,
  metin,
  anilanlar: [],
  zaman: "2026-10-05T08:00:00Z",
});

const SORU = "Hangisiyle başlayalım?\n1. Kayıt\n2. Menü";

describe("Seçerek yanıtla önerisi", () => {
  it("yalnız CEO sohbetinde ajanın seçeneksiz mesajında", () => {
    expect(duzMetinSecenekleri(mesaj("1", "ada", SORU))).toEqual(["Kayıt", "Menü"]);
    expect(duzMetinSecenekleri(mesaj("2", KURUL, SORU))).toBeNull();
    expect(duzMetinSecenekleri(mesaj("3", "arnorg", SORU))).toBeNull();
    expect(duzMetinSecenekleri(mesaj("4", "ada", SORU, "genel"))).toBeNull();
    const secimli = { ...mesaj("5", "ada", SORU), secim: { kaynak: "arac" as const, soru: "Hangisi?", secenekler: [], coklu: false, serbestYanit: true, yanit: null } };
    expect(duzMetinSecenekleri(secimli)).toBeNull();
  });

  it("kurul mesajdan sonra yazdıysa önerilmez", () => {
    const soru = mesaj("1", "ada", SORU);
    const liste = [mesaj("0", KURUL, "Başlayalım"), soru, mesaj("2", "ada", "Bir de şu var.")];
    expect(kurulSonraYazdi(soru, liste)).toBe(false);
    expect(kurulSonraYazdi(soru, [...liste, mesaj("3", KURUL, "İkisi de olsun")])).toBe(true);
    expect(kurulSonraYazdi(soru, undefined)).toBe(false);
  });
});

describe("kurula sorunun seçenekleri", () => {
  const onay = (ek: Partial<Onay>): Onay => ({
    id: "o1",
    projeId: "p",
    ajanId: "ada",
    tur: "genel",
    baslik: "Ada soruyor: Alan adı?",
    ayrinti: "",
    veri: { soru: "Alan adı?", secenekler: ["menu.ornek.com", " ayri.com ", "", 3] },
    durum: "bekliyor",
    olusturma: "2026-10-05T08:00:00Z",
    sonGecerlilik: null,
    sonuclanma: null,
    not: null,
    kararKaynagi: null,
    kararVerenAd: null,
    muhatap: "kurul",
    ...ek,
  });

  it("seçenekler ve soru veriden okunur; başka türde ve seçeneksiz soruda boş", () => {
    expect(onaySecenekleri(onay({}))).toEqual(["menu.ornek.com", "ayri.com"]);
    expect(onaySorusu(onay({}))).toBe("Alan adı?");
    expect(onaySecenekleri(onay({ tur: "teslim" }))).toEqual([]);
    expect(onaySecenekleri(onay({ veri: { soru: "Alan adı?", secenekler: [] } }))).toEqual([]);
    expect(onaySecenekleri(onay({ veri: null }))).toEqual([]);
  });

  it("kurulun notundan seçilen seçenek", () => {
    const secenekler = ["menu.ornek.com", "ayri.com"];
    expect(onaySecilen(onay({ durum: "onaylandi", not: "2) ayri.com — Yıllık ödeyelim" }), secenekler)).toBe(2);
    expect(onaySecilen(onay({ durum: "onaylandi", not: "1) menu.ornek.com" }), secenekler)).toBe(1);
    expect(onaySecilen(onay({ durum: "onaylandi", not: "2) başka bir şey" }), secenekler)).toBeNull();
    expect(onaySecilen(onay({ durum: "onaylandi", not: "3) ayri.com" }), secenekler)).toBeNull();
    expect(onaySecilen(onay({ durum: "onaylandi", not: "İkincisi olsun" }), secenekler)).toBeNull();
  });
});

describe("sahte çekirdeğin liste bulucusu", () => {
  const ORNEKLER = [
    "Anlaşıldı: Node.js ile QR tabanlı menü üretme ve tasarlama platformu; Node.js tercihini kaydettim. İlk sürüm kapsamını şöyle öneriyorum: 1) işletme kaydı ve giriş, 2) menü oluşturma (kategori, ürün, fiyat, görsel), 3) şablon seçerek tasarım, 4) QR kod üretme ve indirme, 5) QR ile açılan mobil uyumlu herkese açık menü sayfası. Ödeme, sipariş alma ve çoklu dil ikinci sürüme kalsın. Bu kapsam uygun mu, eklemek ya da çıkarmak istediğiniz var mı?",
    "Got it: a QR-based menu builder and designer on Node.js. For the first release I suggest this scope: 1) business sign-up and login, 2) menu builder (categories, items, prices, images), 3) template-based design. Does this scope work?",
    "I see three options: 1. Postgres, 2. SQLite, or 3. MongoDB. Which one should we use?",
    "Önerim: 1- kayıt ekranı, 2- menü düzenleyici ve 3- QR üretimi. Uygun mu?",
    "Kat seçimi: 1) zemin kat, 2) 2. kat, 3) çatı katı. Hangisi olsun?",
    "Veritabanı için iki yol görüyorum:\n1. **PostgreSQL**: ilişkisel.\n2. **SQLite**: tek dosya.\n\nHangisiyle ilerleyelim?",
    "Hangi bildirim kanallarıyla başlayalım?\n1- E-posta\n2- SMS\n3- Uygulama içi bildirim",
    "Options:\n\n1) Single page\n   Everything on one scroll.\n\n2) Multi-page\n   Separate pages.\n\nWhich one first?",
    "Dün bitenler:\n1. Giriş ekranı\n2. Menü listesi\n\nSıradaki için önerim: 1) QR üretimi, 2) şablonlar. Hangisiyle başlayalım?",
    "Kaydettim. Şimdi ana yasa taslağı:\n1. Gizli bilgi (.env, anahtarlar) okunmaz, commit'lenmez.\n2. Test geçmeden iş incelemeye alınmaz.\nEklemek ya da çıkarmak istediğiniz var mı?",
    "İlk sürüm kapsamı: 1) kayıt, 2) menü, 3) QR. Bu hafta başlıyorum.",
    "1. sürümde 2. aşamaya geçelim mi?",
    "Sürüm 0.0.8 ve 1.2 hazır mı?",
    "Seçenekler: 1) A planı, 3) B planı. Hangisi?",
    "Önerim şu 1) kayıt 2) menü 3) QR. Uygun mu?",
    "Hangisi?\r\n1. A planı\r\n2. B planı",
    "",
  ];

  it("ortak'taki metindekiSecenekler ile aynı sonucu verir", async () => {
    const yol = new URL("../../gelistirme/surum-008-secenek.mjs", import.meta.url).href;
    const sahte = (await import(/* @vite-ignore */ yol)) as { metindekiSecenekler: (metin: string) => string[] | null };
    for (const ornek of ORNEKLER) expect(sahte.metindekiSecenekler(ornek), ornek).toEqual(metindekiSecenekler(ornek));
    expect(ORNEKLER.filter((x) => metindekiSecenekler(x)).length).toBe(11);
  });
});
