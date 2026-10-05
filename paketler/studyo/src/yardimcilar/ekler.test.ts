// Mesaj eklerinin saf yardımcıları: boyut metni (iki dil), ekin kümesi ve kısa tür adı, nesne adresinin güvenli türü
// (HTML ve SVG asla), yapıştırılan görselin adı, görsel ızgarası ve yerel denetim
import { describe, expect, it } from "vitest";
import { diliAyarla } from "../dil";
import { ekBoyutu, ekKumesi, gorselMi, guvenliTur, izgara, kisaTur, sekmedeAcilir, yapistirilanAd, yerelDenetim } from "./ekler";

describe("ek yardımcıları", () => {
  it("boyut: B, KB, MB; Türkçede ondalık virgül", () => {
    diliAyarla("tr");
    expect(ekBoyutu(812)).toBe("812 B");
    expect(ekBoyutu(84 * 1024)).toBe("84 KB");
    expect(ekBoyutu(1.25 * 1024 * 1024)).toBe("1,3 MB");
    expect(ekBoyutu(2 * 1024 * 1024)).toBe("2 MB");
    diliAyarla("en");
    expect(ekBoyutu(1.25 * 1024 * 1024)).toBe("1.3 MB");
    diliAyarla("tr");
  });

  it("küme ve kısa tür: görsel ve PDF türünden, metin uzantısından", () => {
    expect(ekKumesi({ tur: "gorsel", ad: "a.png" })).toBe("gorsel");
    expect(ekKumesi({ tur: "pdf", ad: "a.pdf" })).toBe("pdf");
    expect(ekKumesi({ tur: "metin", ad: "uygulama.tsx" })).toBe("kod");
    expect(ekKumesi({ tur: "metin", ad: "veri.csv" })).toBe("veri");
    expect(ekKumesi({ tur: "metin", ad: "notlar.md" })).toBe("metin");
    expect(kisaTur({ tur: "gorsel", ad: "foto.jpeg", mime: "image/jpeg" })).toBe("JPG");
    expect(kisaTur({ tur: "gorsel", ad: "x", mime: "image/webp" })).toBe("WEBP");
    expect(kisaTur({ tur: "pdf", ad: "rapor.bin", mime: "application/pdf" })).toBe("PDF");
    expect(kisaTur({ tur: "metin", ad: "a.json", mime: "text/plain" })).toBe("JSON");
    expect(kisaTur({ tur: "metin", ad: "Dockerfile", mime: "text/plain" })).toBe("TXT");
  });

  it("nesne adresinin türü: yalnız izinli görsel türleri; SVG ve HTML düz metin", () => {
    expect(guvenliTur({ tur: "gorsel", mime: "image/png" })).toBe("image/png");
    expect(guvenliTur({ tur: "gorsel", mime: "image/svg+xml" })).toBe("text/plain;charset=utf-8");
    expect(gorselMi({ tur: "gorsel", mime: "image/svg+xml" })).toBe(false);
    expect(guvenliTur({ tur: "metin", mime: "text/html" })).toBe("text/plain;charset=utf-8");
    expect(guvenliTur({ tur: "pdf", mime: "application/pdf" })).toBe("application/pdf");
    expect(sekmedeAcilir({ tur: "gorsel" })).toBe(false);
    expect(sekmedeAcilir({ tur: "pdf" })).toBe(true);
  });

  it("yapıştırılan adsız görsel saatle adlanır; adlı dosya olduğu gibi kalır", () => {
    const z = new Date(2026, 9, 5, 14, 3, 9);
    expect(yapistirilanAd({ name: "image.png", type: "image/png" }, "ekran-goruntusu", z)).toBe("ekran-goruntusu-14-03-09.png");
    expect(yapistirilanAd({ name: "", type: "image/jpeg" }, "screenshot", z)).toBe("screenshot-14-03-09.jpg");
    expect(yapistirilanAd({ name: "tasarim.png", type: "image/png" }, "ekran-goruntusu", z)).toBe("tasarim.png");
  });

  it("ızgara: 2 ve 4 iki sütun, ötekiler üç; en çok altı kutu", () => {
    expect(izgara(1)).toEqual({ sutun: 1, gorunen: 1, kalan: 0 });
    expect(izgara(2)).toEqual({ sutun: 2, gorunen: 2, kalan: 0 });
    expect(izgara(3)).toEqual({ sutun: 3, gorunen: 3, kalan: 0 });
    expect(izgara(4)).toEqual({ sutun: 2, gorunen: 4, kalan: 0 });
    expect(izgara(9)).toEqual({ sutun: 3, gorunen: 6, kalan: 3 });
  });

  it("yerel denetim: boş ve 10 MB'tan büyük dosya yüklenmez", () => {
    expect(yerelDenetim({ size: 0 })).toBe("bos");
    expect(yerelDenetim({ size: 10 * 1024 * 1024 + 1 })).toBe("buyuk");
    expect(yerelDenetim({ size: 1024 })).toBeNull();
  });
});
