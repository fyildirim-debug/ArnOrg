// Tanıtım görünümünün yardımcıları: README adresleri, görsel türü, başlık çapaları, gösterilen sürüm, bekleyen istek
import { describe, expect, it } from "vitest";
import { benzersizCapa, capa, gorselTuru, gosterilenSurum, istekBekliyor, readmeAdresi } from "./tanitim";

describe("README adresleri", () => {
  it("göreli, ./ ve / önekli yollar repo kökündeki aynı dosyadır; sorgu ve çapa atılır", () => {
    expect(readmeAdresi("docs/ekran.png")).toEqual({ tur: "yerel", yol: "docs/ekran.png" });
    expect(readmeAdresi("./docs/ekran.png")).toEqual({ tur: "yerel", yol: "docs/ekran.png" });
    expect(readmeAdresi("/docs/ekran.png?raw=true")).toEqual({ tur: "yerel", yol: "docs/ekran.png" });
    expect(readmeAdresi("docs/../gorseller/logo.svg#koyu")).toEqual({ tur: "yerel", yol: "gorseller/logo.svg" });
    expect(readmeAdresi("docs\\kurulum.md")).toEqual({ tur: "yerel", yol: "docs/kurulum.md" });
    expect(readmeAdresi("ekran%20g%C3%B6r%C3%BCnt%C3%BCs%C3%BC.png")).toEqual({ tur: "yerel", yol: "ekran görüntüsü.png" });
  });

  it("dış adres olduğu gibi kalır; kökün dışı ve sürücü yolu geçersiz", () => {
    for (const a of ["https://img.shields.io/badge/lisans-MIT-blue", "http://ornek.com/a.png", "mailto:ekip@ornek.com", "data:image/png;base64,AAAA", "//cdn.ornek.com/a.png"]) {
      expect(readmeAdresi(a), a).toEqual({ tur: "dis" });
    }
    for (const a of ["../disari.png", "docs/../../disari.png", "C:\\Users\\a.png", "", "   ", "./"]) expect(readmeAdresi(a), a).toEqual({ tur: "gecersiz" });
  });

  it("çapa başlık çapasına çevrilir (GitHub'daki gibi)", () => {
    expect(readmeAdresi("#kurulum-ve-çalıştırma")).toEqual({ tur: "capa", capa: "kurulum-ve-çalıştırma" });
    expect(readmeAdresi("#Getting%20Started")).toEqual({ tur: "capa", capa: "getting-started" });
    expect(capa("Kurulum ve Çalıştırma")).toBe("kurulum-ve-çalıştırma");
    expect(capa("  Install & Run (v2.1)  ")).toBe("install--run-v21");
    const kullanilan = new Map<string, number>();
    expect([benzersizCapa("kullanim", kullanilan), benzersizCapa("kullanim", kullanilan), benzersizCapa("kullanim", kullanilan)]).toEqual(["kullanim", "kullanim-1", "kullanim-2"]);
  });
});

describe("görsel türü", () => {
  it("uzantıdan; görsel olmayan dosyada null", () => {
    expect(gorselTuru("docs/ekran.PNG")).toBe("image/png");
    expect(gorselTuru("logo.svg")).toBe("image/svg+xml");
    expect(gorselTuru("a.jpeg")).toBe("image/jpeg");
    expect(gorselTuru("README.md")).toBeNull();
    expect(gorselTuru("uzantisiz")).toBeNull();
  });
});

describe("sürüm ve istek", () => {
  const taslak = { ajanId: "tuna", ajanAd: "Tuna", icerik: "# Taslak", zaman: "2026-10-05T10:42:00.000Z" };
  const son = { commit: "a1b2c3d4", yazar: "Deniz", zaman: "2026-10-05T09:00:00.000Z", mesaj: "README" };

  it("taslak seçiliyse ve varsa taslak; yoksa yayındaki, o da yoksa taslak", () => {
    expect(gosterilenSurum({ var: true, taslak }, "taslak")).toBe("taslak");
    expect(gosterilenSurum({ var: true, taslak: null }, "taslak")).toBe("yayinda");
    expect(gosterilenSurum({ var: true, taslak }, "yayinda")).toBe("yayinda");
    expect(gosterilenSurum({ var: false, taslak }, "yayinda")).toBe("taslak");
    expect(gosterilenSurum({ var: false, taslak: null }, "yayinda")).toBeNull();
  });

  it("istek, sonrasında README değişene dek bekler", () => {
    expect(istekBekliyor({ guncellemeIstendi: null, son, taslak: null })).toBe(false);
    expect(istekBekliyor({ guncellemeIstendi: "2026-10-05T10:00:00.000Z", son, taslak: null })).toBe(true);
    expect(istekBekliyor({ guncellemeIstendi: "2026-10-05T10:00:00.000Z", son, taslak })).toBe(false);
    expect(istekBekliyor({ guncellemeIstendi: "2026-10-05T08:00:00.000Z", son: null, taslak: null })).toBe(true);
  });
});
