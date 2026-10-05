// Düz metindeki seçenek listesi (metindekiSecenekler): "Seçerek yanıtla"yı yalnız kurula soru soran ve numaralı
// seçenek sunan mesajda önermeli. Türkçe ve İngilizce, "1)", "1." ve "1-" biçimleri, satır başı ve satır içi listeler.
import { describe, expect, it } from "vitest";
import { metindekiSecenekler } from "./index";

/** Kullanıcının ekran görüntüsündeki CEO mesajı */
const EKRAN_TR =
  "Anlaşıldı: Node.js ile QR tabanlı menü üretme ve tasarlama platformu; Node.js tercihini kaydettim. İlk sürüm kapsamını şöyle öneriyorum: 1) işletme kaydı ve giriş, 2) menü oluşturma (kategori, ürün, fiyat, görsel), 3) şablon seçerek tasarım, 4) QR kod üretme ve indirme, 5) QR ile açılan mobil uyumlu herkese açık menü sayfası. Ödeme, sipariş alma ve çoklu dil ikinci sürüme kalsın. Bu kapsam uygun mu, eklemek ya da çıkarmak istediğiniz var mı?";
const EKRAN_EN =
  "Got it: a QR-based menu builder and designer on Node.js; I've saved the Node.js preference. For the first release I suggest this scope: 1) business sign-up and login, 2) menu builder (categories, items, prices, images), 3) template-based design, 4) QR code generation and download, 5) a mobile-friendly public menu page opened by the QR code. Payments, ordering and multiple languages can wait for the second release. Does this scope work, or is there anything you'd add or remove?";

describe("satır içi liste", () => {
  it("ekran görüntüsündeki kapsam sorusu (Türkçe, 1) biçimi)", () => {
    expect(metindekiSecenekler(EKRAN_TR)).toEqual([
      "işletme kaydı ve giriş",
      "menü oluşturma (kategori, ürün, fiyat, görsel)",
      "şablon seçerek tasarım",
      "QR kod üretme ve indirme",
      "QR ile açılan mobil uyumlu herkese açık menü sayfası",
    ]);
  });

  it("aynı soru İngilizce", () => {
    expect(metindekiSecenekler(EKRAN_EN)).toEqual([
      "business sign-up and login",
      "menu builder (categories, items, prices, images)",
      "template-based design",
      "QR code generation and download",
      "a mobile-friendly public menu page opened by the QR code",
    ]);
  });

  it("1. biçimi ve son maddeden önceki bağlaç (İngilizce)", () => {
    expect(metindekiSecenekler("I see three options: 1. Postgres, 2. SQLite, or 3. MongoDB. Which one should we use?")).toEqual(["Postgres", "SQLite", "MongoDB"]);
  });

  it("1- biçimi ve ve bağlacı (Türkçe)", () => {
    expect(metindekiSecenekler("Önerim: 1- kayıt ekranı, 2- menü düzenleyici ve 3- QR üretimi. Uygun mu?")).toEqual(["kayıt ekranı", "menü düzenleyici", "QR üretimi"]);
  });

  it("liste sorunun içindeyse son madde soru işaretinde biter", () => {
    expect(metindekiSecenekler("Hangisiyle başlayalım: 1) giriş, 2) menü ya da 3) QR?")).toEqual(["giriş", "menü", "QR"]);
  });

  it("başka biçimdeki numara maddenin metnidir", () => {
    expect(metindekiSecenekler("Kat seçimi: 1) zemin kat, 2) 2. kat, 3) çatı katı. Hangisi olsun?")).toEqual(["zemin kat", "2. kat", "çatı katı"]);
  });

  it("noktalı virgülle ayrılmış maddeler", () => {
    expect(metindekiSecenekler("Two ways: 1) ship now; 2) wait for review. Which do you prefer?")).toEqual(["ship now", "wait for review"]);
  });
});

describe("satır başı liste", () => {
  it("1. biçimi, soru listeden sonra (Türkçe); açıklama ve Markdown vurgusu", () => {
    const metin = "Veritabanı için iki yol görüyorum:\n1. **PostgreSQL**: ilişkisel, raporlama kolay.\n2. **SQLite**: kurulum yok, tek dosya.\n\nHangisiyle ilerleyelim?";
    expect(metindekiSecenekler(metin)).toEqual(["PostgreSQL: ilişkisel, raporlama kolay", "SQLite: kurulum yok, tek dosya"]);
  });

  it("1- biçimi, soru listeden önce ve liste mesajın sonunda (Türkçe)", () => {
    expect(metindekiSecenekler("Hangi bildirim kanallarıyla başlayalım?\n1- E-posta\n2- SMS\n3- Uygulama içi bildirim")).toEqual(["E-posta", "SMS", "Uygulama içi bildirim"]);
  });

  it("1) biçimi, girintili devam satırları ve maddeler arasında boş satır (İngilizce)", () => {
    const metin = "Options for the landing page:\n\n1) Single page\n   Everything on one scroll.\n\n2) Multi-page\n   Separate pages for pricing and docs.\n\nWhich one should we build first?";
    expect(metindekiSecenekler(metin)).toEqual(["Single page", "Multi-page"]);
  });

  it("**1.** biçimindeki kalın numaralar", () => {
    expect(metindekiSecenekler("Choose a theme:\n**1.** Dark\n**2.** Light\nWhich one?")).toEqual(["Dark", "Light"]);
  });

  it("CRLF satır sonları", () => {
    expect(metindekiSecenekler("Hangisi?\r\n1. A planı\r\n2. B planı")).toEqual(["A planı", "B planı"]);
  });

  it("iki liste varsa en son biten sayılır", () => {
    const metin = "Dün bitenler:\n1. Giriş ekranı\n2. Menü listesi\n\nSıradaki için önerim: 1) QR üretimi, 2) şablonlar. Hangisiyle başlayalım?";
    expect(metindekiSecenekler(metin)).toEqual(["QR üretimi", "şablonlar"]);
  });

  it("12 madde olur, 13 olmaz", () => {
    const liste = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. Madde ${i + 1}`).join("\n");
    expect(metindekiSecenekler(`Hangileri?\n${liste(12)}`)).toHaveLength(12);
    expect(metindekiSecenekler(`Hangileri?\n${liste(13)}`)).toBeNull();
  });
});

describe("temkinli: önerilmeyen mesajlar", () => {
  it("soruyla bitmeyen liste", () => {
    expect(metindekiSecenekler("İlk sürüm kapsamı: 1) kayıt, 2) menü, 3) QR. Bu hafta başlıyorum.")).toBeNull();
    expect(metindekiSecenekler("Dün bitenler:\n1. Giriş ekranı\n2. Menü listesi")).toBeNull();
    expect(metindekiSecenekler("Done today:\n1. Login screen\n2. Menu list\n\nNext I'll start on the QR codes.")).toBeNull();
  });

  it("tek madde", () => {
    expect(metindekiSecenekler("Tek bir önerim var: 1) kayıt ekranı. Uygun mu?")).toBeNull();
  });

  it("sırası tutmayan numaralar", () => {
    expect(metindekiSecenekler("Seçenekler: 1) A planı, 3) B planı. Hangisi?")).toBeNull();
    expect(metindekiSecenekler("Hangisi?\n2. A planı\n3. B planı")).toBeNull();
  });

  it("sıra sayısı ve sürüm numarası liste sayılmaz", () => {
    expect(metindekiSecenekler("1. sürümde 2. aşamaya geçelim mi?")).toBeNull();
    expect(metindekiSecenekler("Sürüm 0.0.8 ve 1.2 hazır mı?")).toBeNull();
    expect(metindekiSecenekler("Saat 1-2 arası uygun mu?")).toBeNull();
    expect(metindekiSecenekler("Shall we move T-1) and T-2) to review?")).toBeNull();
  });

  it("ayraçsız satır içi işaretler", () => {
    expect(metindekiSecenekler("Önerim şu 1) kayıt 2) menü 3) QR. Uygun mu?")).toBeNull();
  });

  it("listeden sonraki soru kısmı çok uzunsa", () => {
    const uzun = "Ayrıntılar şöyle. ".repeat(30);
    expect(metindekiSecenekler(`Seçenekler:\n1. A planı\n2. B planı\n\n${uzun}Uygun mu?`)).toBeNull();
  });

  it("çok uzun madde", () => {
    expect(metindekiSecenekler(`Hangisi?\n1. ${"uzun ".repeat(70)}\n2. Kısa`)).toBeNull();
  });

  it("boş ve listesiz metin", () => {
    expect(metindekiSecenekler("")).toBeNull();
    expect(metindekiSecenekler("Bu kapsam uygun mu?")).toBeNull();
  });
});
