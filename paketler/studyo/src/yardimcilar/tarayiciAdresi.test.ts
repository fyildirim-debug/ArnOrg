import { describe, expect, it } from "vitest";
import { adresCoz, adresMi, ARAMA_ADRESI, kisaAdres, notKonumu } from "./tarayiciAdresi";

describe("adres çubuğu", () => {
  it("tam adresi olduğu gibi kabul eder", () => {
    expect(adresMi("https://ornek.com/sepet?x=1")).toBe("https://ornek.com/sepet?x=1");
    expect(adresMi("  http://localhost:5173  ")).toBe("http://localhost:5173/");
  });

  it("yerel makineyi, IP'yi ve portlu makineyi http ile tamamlar", () => {
    expect(adresMi("localhost:5173/sepet")).toBe("http://localhost:5173/sepet");
    expect(adresMi("localhost")).toBe("http://localhost/");
    expect(adresMi("127.0.0.1:8080")).toBe("http://127.0.0.1:8080/");
    expect(adresMi("192.168.1.20:3000/panel")).toBe("http://192.168.1.20:3000/panel");
    expect(adresMi("sunucu:8080")).toBe("http://sunucu:8080/");
    expect(adresMi("[::1]:4000")).toBe("http://[::1]:4000/");
  });

  it("alan adını portsuzsa https, portluysa http ile tamamlar", () => {
    expect(adresMi("ornek.com")).toBe("https://ornek.com/");
    expect(adresMi("alt.ornek.com.tr/yol#bolum")).toBe("https://alt.ornek.com.tr/yol#bolum");
    expect(adresMi("panel.local:3000")).toBe("http://panel.local:3000/");
  });

  it("adres olmayanı aramaya, başka protokolleri de aramaya gönderir", () => {
    expect(adresMi("buton neden kayık")).toBeNull();
    expect(adresMi("javascript:alert(1)")).toBeNull();
    expect(adresMi("file:///etc/passwd")).toBeNull();
    expect(adresMi("1.5")).toBeNull();
    expect(adresCoz("react useEffect")).toBe(`${ARAMA_ADRESI}react%20useEffect`);
    expect(adresCoz("javascript:alert(1)")).toBe(`${ARAMA_ADRESI}javascript%3Aalert(1)`);
    expect(adresCoz("localhost:3000")).toBe("http://localhost:3000/");
    expect(adresCoz("about:blank")).toBe("about:blank");
    expect(adresCoz("   ")).toBe("");
  });

  it("kısa adres makine ve yoldan oluşur", () => {
    expect(kisaAdres("http://localhost:5173/")).toBe("localhost:5173");
    expect(kisaAdres("https://ornek.com/sepet?adim=2")).toBe("ornek.com/sepet?adim=2");
    expect(kisaAdres("bozuk")).toBe("bozuk");
  });
});

describe("not penceresinin yeri", () => {
  const sahne = { genislik: 1200, yukseklik: 800 };
  const pencere = { genislik: 352, yukseklik: 400 };

  it("öğenin sağına, sığmazsa soluna koyar", () => {
    expect(notKonumu({ x: 100, y: 120, genislik: 200, yukseklik: 40 }, pencere, sahne)).toEqual({ sol: 312, ust: 120 });
    expect(notKonumu({ x: 900, y: 120, genislik: 200, yukseklik: 40 }, pencere, sahne)).toEqual({ sol: 536, ust: 120 });
  });

  it("geniş öğede altına ya da üstüne, hiçbiri olmazsa ortaya koyar", () => {
    expect(notKonumu({ x: 20, y: 40, genislik: 1160, yukseklik: 100 }, pencere, sahne)).toEqual({ sol: 20, ust: 152 });
    expect(notKonumu({ x: 20, y: 600, genislik: 1160, yukseklik: 100 }, pencere, sahne)).toEqual({ sol: 20, ust: 188 });
    expect(notKonumu({ x: 0, y: 0, genislik: 1200, yukseklik: 800 }, pencere, sahne)).toEqual({ sol: 424, ust: 200 });
    expect(notKonumu(null, pencere, sahne)).toEqual({ sol: 424, ust: 200 });
  });

  it("dikeyde sahnenin içinde kalır", () => {
    expect(notKonumu({ x: 100, y: 700, genislik: 100, yukseklik: 40 }, pencere, sahne)).toEqual({ sol: 212, ust: 392 });
  });
});
