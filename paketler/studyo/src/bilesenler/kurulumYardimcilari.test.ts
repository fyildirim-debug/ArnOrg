// Kurulum yardımcıları: klasör adı çekirdekle aynı, yollar iki platformda, ilerleme çıktıdan okunur
import { describe, expect, it } from "vitest";
import type { ClaudeKurulumu } from "@arnorg/ortak";
import { claudeEksigi, dalAdiGecerliMi, ilerlemeOku, klasorAdiYap, mutlakMi, sonSatir, yolAdi, yolBirlestir, yolParcalari } from "./kurulumYardimcilari";

describe("klasör adı", () => {
  it("çekirdeğin kuralına uyar", () => {
    expect(klasorAdiYap("Sipariş Paneli")).toBe("siparis-paneli");
    expect(klasorAdiYap("Çağrı Merkezi")).toBe("cagri-merkezi");
    expect(klasorAdiYap("  Café   Déjà vu!! ")).toBe("cafe-deja-vu");
    expect(klasorAdiYap("api_v2.0")).toBe("api_v2.0");
    expect(klasorAdiYap("---")).toBe("arnorg-projesi");
  });
});

describe("yollar", () => {
  it("POSIX ve Windows yollarını birleştirir", () => {
    expect(yolBirlestir("/home/furkan/ArnOrg", "siparis-paneli")).toBe("/home/furkan/ArnOrg/siparis-paneli");
    expect(yolBirlestir("/", "tmp")).toBe("/tmp");
    expect(yolBirlestir("C:\\Users\\furkan\\ArnOrg", "web")).toBe("C:\\Users\\furkan\\ArnOrg\\web");
    expect(yolBirlestir("D:\\", "kod")).toBe("D:\\kod");
  });

  it("son parçayı ve mutlaklığı bilir", () => {
    expect(yolAdi("/home/furkan/projeler/arnex-web/")).toBe("arnex-web");
    expect(yolAdi("C:\\kod\\eski-site")).toBe("eski-site");
    expect(mutlakMi("/srv")).toBe(true);
    expect(mutlakMi("C:\\kod")).toBe(true);
    expect(mutlakMi("~/kod")).toBe(false);
    expect(mutlakMi("kod")).toBe(false);
  });

  it("konum çubuğunun parçalarını çıkarır", () => {
    expect(yolParcalari("/home/furkan")).toEqual([
      { ad: "/", yol: "/" },
      { ad: "home", yol: "/home" },
      { ad: "furkan", yol: "/home/furkan" },
    ]);
    expect(yolParcalari("/")).toEqual([{ ad: "/", yol: "/" }]);
    expect(yolParcalari("C:\\Users\\furkan")).toEqual([
      { ad: "C:", yol: "C:\\" },
      { ad: "Users", yol: "C:\\Users" },
      { ad: "furkan", yol: "C:\\Users\\furkan" },
    ]);
  });
});

describe("dal adı", () => {
  it("yaygın geçersiz adları yakalar", () => {
    for (const iyi of ["main", "gelistirme", "ozellik/kargo-takibi", "surum-1.2"]) expect(dalAdiGecerliMi(iyi), iyi).toBe(true);
    for (const kotu of ["", "yeni dal", "a..b", "/bas", "son/", "x.lock", "a~b", "-a", ".gizli", "a/.b", "HEAD"]) expect(dalAdiGecerliMi(kotu), kotu).toBe(false);
  });
});

describe("işlem ilerlemesi", () => {
  it("gh indirmesinde MB'yi okur", () => {
    const i = ilerlemeOku({ tur: "gh_kur", durum: "calisiyor", cikti: "Aranıyor…\nİndiriliyor: gh.tar.gz\n9.4 / 14.6 MB\n" });
    expect(i?.asama).toBe("indirme");
    expect(i?.olcu).toBe("9.4 / 14.6 MB");
    expect(i?.oran).toBeCloseTo(9.4 / 14.6);
  });

  it("klonlamada git'in yüzdelerini okur", () => {
    const alma = ilerlemeOku({ tur: "klonla", durum: "calisiyor", cikti: "Cloning into 'x'...\nReceiving objects: 64% (602/940)\n" });
    expect(alma?.asama).toBe("alma");
    expect(alma?.olcu).toBe("64%");
    expect(alma?.oran).toBeCloseTo(0.576);
    const cozme = ilerlemeOku({ tur: "klonla", durum: "calisiyor", cikti: "Receiving objects: 100% (940/940), done.\nResolving deltas: 50% (256/512)\n" });
    expect(cozme?.asama).toBe("cozme");
    expect(cozme?.oran).toBeCloseTo(0.95);
    expect(ilerlemeOku({ tur: "claude_giris", durum: "calisiyor", cikti: "50%" })).toBeNull();
  });

  it("son satırı verir", () => {
    expect(sonSatir("bir\n\niki\n  \n")).toBe("iki");
    expect(sonSatir("")).toBe("");
  });
});

describe("Claude Code eksiği (her ekrandaki şerit)", () => {
  const hazir: ClaudeKurulumu = { kaynak: "paket", yol: "/x/claude", surum: "2.1.287", sistemde: false, girisYapildi: true, abonelik: true, girisYontemi: "claude.ai", saglayici: "firstParty", eposta: "a@b.c", hata: null };
  it("hazırken eksik yok; durum gelmeden şerit çıkmaz", () => {
    expect(claudeEksigi(hazir)).toBeNull();
    expect(claudeEksigi(undefined)).toBeNull();
  });
  it("kopya yok, giriş yok, abonelik dışı giriş", () => {
    expect(claudeEksigi({ ...hazir, yol: null, kaynak: null })).toBe("kurulu_degil");
    expect(claudeEksigi({ ...hazir, girisYapildi: false, abonelik: false })).toBe("giris");
    expect(claudeEksigi({ ...hazir, girisYontemi: "api_key", abonelik: false })).toBe("abonelik");
  });
});
