// Terminal çıktısının düz metne çevrilmesi: renk kodları, satır başı, geri silme, temizleme, bölünmüş parçalar
import { describe, expect, it } from "vitest";
import { TerminalMetni } from "./terminalMetni";

function cevir(...parcalar: string[]): string {
  const t = new TerminalMetni();
  for (const p of parcalar) t.ekle(p);
  return t.metin();
}

describe("TerminalMetni", () => {
  it("renk kodlarını ayıklar, satırları korur", () => {
    expect(cevir("\x1b[32m✓\x1b[0m tests/api.test.ts\r\n Tests  \x1b[32m4 passed\x1b[0m (4)")).toBe("✓ tests/api.test.ts\n Tests  4 passed (4)");
  });

  it("parçalar arasında bölünen kaçış dizisini birleştirir", () => {
    expect(cevir("a\x1b[3", "2mb\x1b", "[0mc")).toBe("abc");
  });

  it("parçalar arasında bölünen \\r\\n tek satır sonudur", () => {
    expect(cevir("ilk\r", "\nikinci")).toBe("ilk\nikinci");
  });

  it("\\r satır başına döner ve üzerine yazar", () => {
    expect(cevir("%10\r%20\r%30")).toBe("%30");
    expect(cevir("abc\rX")).toBe("Xbc");
  });

  it("geri silme (\\b \\b) karakteri siler", () => {
    expect(cevir("ab", "\b \b", "c")).toBe("ac");
  });

  it("ekranı temizleme kodu tamponu boşaltır", () => {
    expect(cevir("eski satır\r\nbaşka\x1b[2J\x1b[Hyeni")).toBe("yeni");
  });

  it("pencere başlığı (OSC) ve satır silme kodları görünmez", () => {
    expect(cevir("\x1b]0;başlık\x07merhaba")).toBe("merhaba");
    expect(cevir("indiriliyor 10%\r\x1b[2Kbitti")).toBe("bitti");
  });

  it("sekmeyi boşluğa, sınırı aşan eski satırları atar", () => {
    expect(cevir("a\tb")).toBe("a       b");
    const t = new TerminalMetni(3);
    t.ekle("1\n2\n3\n4\n5\n6");
    expect(t.metin()).toBe("3\n4\n5\n6");
  });

  it("zil ve diğer denetim karakterlerini yok sayar", () => {
    expect(cevir("a\x07b\x00c")).toBe("abc");
  });

  it("ESC c terminali sıfırlar; tamamlanmamış dizi bekletilir", () => {
    const t = new TerminalMetni();
    t.ekle("önce\x1bc");
    expect(t.bosMu()).toBe(true);
    t.ekle("sonra\x1b");
    expect(t.metin()).toBe("sonra");
    t.ekle("[1mkalın");
    expect(t.metin()).toBe("sonrakalın");
  });
});
