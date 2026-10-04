import { describe, expect, it } from "vitest";
import {
  SatirTamponu,
  anaPencereIzniMi,
  ansiTemizle,
  ayniKokMu,
  disaridaAcilabilirMi,
  pencereDurumunuAyristir,
  sinirlarGorunurMu,
} from "./denetimler.js";
import { cekirdekMesajiMi } from "./mesajlar.js";

describe("disaridaAcilabilirMi", () => {
  it("yalnız http ve https adreslerine izin verir", () => {
    expect(disaridaAcilabilirMi("https://github.com/fyildirim-debug/ArnOrg")).toBe(true);
    expect(disaridaAcilabilirMi("http://localhost:5173/")).toBe(true);
    expect(disaridaAcilabilirMi("file:///etc/passwd")).toBe(false);
    expect(disaridaAcilabilirMi("javascript:alert(1)")).toBe(false);
    expect(disaridaAcilabilirMi("smb://sunucu/paylasim")).toBe(false);
    expect(disaridaAcilabilirMi("bozuk adres")).toBe(false);
  });
});

describe("ayniKokMu", () => {
  const kok = "http://127.0.0.1:47820";
  it("aynı protokol, ana makine ve portu kabul eder", () => {
    expect(ayniKokMu("http://127.0.0.1:47820/#anahtar=x", kok)).toBe(true);
    expect(ayniKokMu("http://127.0.0.1:47820/projeler/1", kok)).toBe(true);
  });
  it("farklı kökü reddeder", () => {
    expect(ayniKokMu("http://127.0.0.1:47821/", kok)).toBe(false);
    expect(ayniKokMu("http://localhost:47820/", kok)).toBe(false);
    expect(ayniKokMu("https://127.0.0.1:47820/", kok)).toBe(false);
    expect(ayniKokMu("http://127.0.0.1:47820.kotu.com/", kok)).toBe(false);
    expect(ayniKokMu("bozuk", kok)).toBe(false);
  });
});

describe("anaPencereIzniMi", () => {
  const kok = "http://127.0.0.1:47820";
  it("yalnız listedeki izinleri ve yalnız çekirdek kökünden verir", () => {
    expect(anaPencereIzniMi("notifications", "http://127.0.0.1:47820/", kok)).toBe(true);
    expect(anaPencereIzniMi("clipboard-sanitized-write", "http://127.0.0.1:47820/#x", kok)).toBe(true);
    expect(anaPencereIzniMi("media", "http://127.0.0.1:47820/", kok)).toBe(false);
    expect(anaPencereIzniMi("geolocation", "http://127.0.0.1:47820/", kok)).toBe(false);
    expect(anaPencereIzniMi("notifications", "http://localhost:5173/", kok)).toBe(false);
  });
  it("çekirdek kökü henüz yokken hiçbir izin vermez", () => {
    expect(anaPencereIzniMi("notifications", "http://127.0.0.1:47820/", null)).toBe(false);
  });
});

describe("pencereDurumunuAyristir", () => {
  it("geçerli durumu okur", () => {
    expect(pencereDurumunuAyristir({ x: 10.4, y: 20, width: 1200, height: 800, buyutulmus: true })).toEqual({
      x: 10,
      y: 20,
      width: 1200,
      height: 800,
      buyutulmus: true,
    });
  });
  it("konumsuz durumu kabul eder, bozuk durumu reddeder", () => {
    expect(pencereDurumunuAyristir({ width: 1000, height: 700 })).toEqual({ width: 1000, height: 700, buyutulmus: false });
    expect(pencereDurumunuAyristir({ width: "1000", height: 700 })).toBeNull();
    expect(pencereDurumunuAyristir({ width: 10, height: 10 })).toBeNull();
    expect(pencereDurumunuAyristir(null)).toBeNull();
  });
});

describe("sinirlarGorunurMu", () => {
  const ekran = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  it("ekranda kalan pencereyi görünür sayar", () => {
    expect(sinirlarGorunurMu({ x: 100, y: 100, width: 1200, height: 800 }, ekran)).toBe(true);
    expect(sinirlarGorunurMu({ x: 1800, y: 900, width: 1200, height: 800 }, ekran)).toBe(true);
  });
  it("çıkarılmış ekrandaki pencereyi görünmez sayar", () => {
    expect(sinirlarGorunurMu({ x: 2000, y: 0, width: 1200, height: 800 }, ekran)).toBe(false);
    expect(sinirlarGorunurMu({ x: 1880, y: 0, width: 1200, height: 800 }, ekran)).toBe(false);
  });
});

describe("SatirTamponu", () => {
  it("parçaları satırlara böler ve son satırları tutar", () => {
    const t = new SatirTamponu(3);
    t.ekle("bir\niki\nüç");
    t.ekle("ün devamı\r\ndört\nbeş\n");
    expect(t.kuyruk()).toBe("üçün devamı\ndört\nbeş");
  });
  it("yarım satırı kuyruğa ekler ve ANSI kodlarını temizler", () => {
    const t = new SatirTamponu(5);
    t.ekle("\u001b[31mhata\u001b[0m\nyarım");
    expect(t.kuyruk()).toBe("hata\nyarım");
    expect(ansiTemizle("\u001b[1;32mtamam\u001b[0m")).toBe("tamam");
  });
});

describe("cekirdekMesajiMi", () => {
  it("geçerli mesajları tanır", () => {
    expect(cekirdekMesajiMi({ tur: "hazir", adres: "http://127.0.0.1:1", erisimAnahtari: "a" })).toBe(true);
    expect(cekirdekMesajiMi({ tur: "hata", mesaj: "x" })).toBe(true);
    expect(cekirdekMesajiMi({ tur: "kapandi" })).toBe(true);
  });
  it("geçersiz mesajları reddeder", () => {
    expect(cekirdekMesajiMi({ tur: "hazir", adres: 1 })).toBe(false);
    expect(cekirdekMesajiMi({ tur: "bilinmeyen" })).toBe(false);
    expect(cekirdekMesajiMi("hazir")).toBe(false);
    expect(cekirdekMesajiMi(null)).toBe(false);
  });
});
