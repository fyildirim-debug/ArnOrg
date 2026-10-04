// Öğe seçicinin saf mantığı linkedom belgelerinde: benzersiz seçici, kısa metin, kısaltılmış HTML, stiller, kutu
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { benzersizSecici, cssKacis, etiketMetni, HTML_SINIRI, kararliKimlikMi, kararliSinifMi, kisaHtml, kutuOku, ogeMetni, secimiTopla, stilleriOku } from "./secim.js";

function belge(govde: string): Document {
  return parseHTML(`<!doctype html><html><head><title>Vitrin · Sepet</title></head><body>${govde}</body></html>`).document as unknown as Document;
}

/** Seçici belgede tam olarak bu öğeyi bulmalı */
function dogrula(b: Document, el: Element): string {
  const secici = benzersizSecici(el);
  const bulunan = b.querySelectorAll(secici);
  expect(bulunan.length, secici).toBe(1);
  expect(bulunan[0], secici).toBe(el);
  return secici;
}

describe("benzersizSecici", () => {
  it("kararlı ve benzersiz kimliği kullanır", () => {
    const b = belge(`<main><button id="odeme">Öde</button><button>Vazgeç</button></main>`);
    expect(dogrula(b, b.querySelector("button")!)).toBe("#odeme");
  });

  it("üretilmiş kimliği atlar, test özniteliğini kullanır", () => {
    const b = belge(`<form><input id=":r3:" data-testid="eposta"><input id="alan-48213" name="ad"></form>`);
    expect(dogrula(b, b.querySelectorAll("input")[0]!)).toBe('[data-testid="eposta"]');
    const ikinci = dogrula(b, b.querySelectorAll("input")[1]!);
    expect(ikinci).not.toContain("48213");
  });

  it("etiket ve kararlı sınıflarla kısa yol kurar", () => {
    const b = belge(`<header><nav class="ust-menu"><a class="baglanti active">A</a></nav></header><main><p>x</p></main>`);
    expect(dogrula(b, b.querySelector("nav")!)).toBe("nav.ust-menu");
    // geçici durum sınıfı (active) seçiciye girmez
    expect(dogrula(b, b.querySelector("a")!)).toBe("a.baglanti");
  });

  it("aynı etiketli kardeşleri :nth-of-type ile ayırır", () => {
    const b = belge(`<ul class="liste"><li>bir</li><li>iki</li><li>üç</li></ul><ul><li>dört</li><li>beş</li><li>altı</li></ul>`);
    const ucuncu = b.querySelectorAll("ul.liste > li")[2]!;
    const s = dogrula(b, ucuncu);
    expect(s).toContain(":nth-of-type(3)");
    expect(s).toContain("ul.liste");
  });

  it("kararlı kimlikli bir atadan başlar", () => {
    const b = belge(`<section id="sepet"><div><span>1</span><span>2</span></div></section><section><div><span>1</span><span>2</span></div></section>`);
    const s = dogrula(b, b.querySelectorAll("#sepet span")[1]!);
    expect(s.startsWith("#sepet > ")).toBe(true);
  });

  it("sınıfsız ve kimliksiz derin öğede body'den tam yol benzersizdir", () => {
    const b = belge(`<div><div><span>a</span></div><div><span>b</span></div></div><div><div><span>c</span></div></div>`);
    for (const el of Array.from(b.querySelectorAll("span"))) dogrula(b, el);
  });

  it("özel karakterli kimlik ve sınıfları kaçırır; CSS-in-JS sınıflarını atlar", () => {
    const b = belge(`<div class="css-1x2y3z kart"><b class="fiyat.indirim">10</b></div><div class="kart"><b>20</b></div>`);
    const s = dogrula(b, b.querySelector("b")!);
    expect(s).not.toContain("css-1x2y3z");
    expect(cssKacis("fiyat.indirim")).toBe("fiyat\\.indirim");
  });

  it("SVG öğelerini ve html kökünü seçer", () => {
    const b = belge(`<button class="sil"><svg viewBox="0 0 16 16"><path d="M0 0"/></svg></button><button class="ekle"><svg><path d="M1 1"/></svg></button>`);
    dogrula(b, b.querySelector("button.ekle path")!);
    expect(benzersizSecici(b.documentElement)).toBe("html");
  });
});

describe("kimlik, sınıf ve kaçış", () => {
  it("CSS.escape gibi kaçırır", () => {
    expect(cssKacis("ana-baslik")).toBe("ana-baslik");
    expect(cssKacis("1a")).toBe("\\31 a");
    expect(cssKacis("-1a")).toBe("-\\31 a");
    expect(cssKacis("-")).toBe("\\-");
    expect(cssKacis("a b")).toBe("a\\ b");
    expect(cssKacis("çerez")).toBe("çerez");
    expect(cssKacis("a\u0000b")).toBe("a�b");
  });

  it("kararlı kimlik ve sınıfı ayırt eder", () => {
    expect(kararliKimlikMi("odeme-dugmesi")).toBe(true);
    for (const id of [":r1:", "«r1»", "_r_5_", "radix-12", "headlessui-menu-button-3", "ember42", "kayit-20240101", "1baslik"]) expect(kararliKimlikMi(id), id).toBe(false);
    expect(kararliSinifMi("kart")).toBe(true);
    for (const c of ["css-abc", "sc-bdVaJa", "Button_root__a1B2c", "is-open", "active", "md:flex", "w-[300px]"]) expect(kararliSinifMi(c), c).toBe(false);
  });
});

describe("öğe metni ve HTML", () => {
  it("metni tekleştirir ve kısaltır", () => {
    const b = belge(`<p>  Ödemeye\n   geç  </p><p>${"uzun ".repeat(100)}</p>`);
    expect(ogeMetni(b.querySelectorAll("p")[0]!)).toBe("Ödemeye geç");
    const uzun = ogeMetni(b.querySelectorAll("p")[1]!);
    expect(uzun.length).toBe(160);
    expect(uzun.endsWith("…")).toBe(true);
  });

  it("metinsiz öğede aria-label, alt, placeholder ve düğme değerine bakar; parolayı okumaz", () => {
    const b = belge(`<button aria-label="Kapat"></button><img alt="Logo"><input placeholder="Ara"><input type="submit" value="Gönder"><input type="password" value="gizli123">`);
    expect(ogeMetni(b.querySelector("button")!)).toBe("Kapat");
    expect(ogeMetni(b.querySelector("img")!)).toBe("Logo");
    expect(ogeMetni(b.querySelector("input")!)).toBe("Ara");
    expect(ogeMetni(b.querySelector('input[type="submit"]')!)).toBe("Gönder");
    expect(ogeMetni(b.querySelector('input[type="password"]')!)).toBe("");
  });

  it("outerHTML en çok 2000 karakter", () => {
    const b = belge(`<div class="uzun">${"<span>öğe</span>".repeat(400)}</div><i>kısa</i>`);
    const html = kisaHtml(b.querySelector("div")!);
    expect(html.length).toBe(HTML_SINIRI);
    expect(html.startsWith('<div class="uzun"><span>')).toBe(true);
    expect(html.endsWith("…")).toBe(true);
    expect(kisaHtml(b.querySelector("i")!)).toBe("<i>kısa</i>");
  });

  it("etiket metni kısa ve okunur", () => {
    const b = belge(`<button id="kaydet" class="dugme ana css-9k2j1">Kaydet</button><div class="a b c d"></div>`);
    expect(etiketMetni(b.querySelector("button")!)).toBe("button#kaydet.dugme.ana");
    expect(etiketMetni(b.querySelector("div")!)).toBe("div.a.b");
  });
});

describe("stiller, kutu ve seçim", () => {
  const b = belge(`<section class="kart"><button class="odeme">Ödemeye geç</button></section>`);
  const dugme = b.querySelector("button")!;
  const stiller = new Map<Element, Partial<CSSStyleDeclaration>>([
    [dugme, { fontFamily: '"Inter", sans-serif', fontSize: "15px", color: "rgb(255, 255, 255)", backgroundColor: "rgba(0, 0, 0, 0)" }],
    [b.querySelector("section")!, { backgroundColor: "rgb(242, 113, 95)" }],
  ]);
  const pencere = {
    getComputedStyle: (el: Element) => ({ backgroundColor: "rgba(0, 0, 0, 0)", ...stiller.get(el) }),
    scrollX: 0,
    scrollY: 800,
    innerWidth: 390,
    innerHeight: 844,
    location: { href: "http://localhost:5173/sepet" },
  } as unknown as Window;
  (dugme as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ left: 24.04, top: 610.26, width: 342, height: 48, right: 366.04, bottom: 658.26 }) as DOMRect;

  it("saydam arka planda görünen arka planı (ata) verir", () => {
    expect(stilleriOku(dugme, pencere)).toEqual({ yaziTipi: '"Inter", sans-serif', boyut: "15px", renk: "rgb(255, 255, 255)", arkaPlan: "rgb(242, 113, 95)" });
  });

  it("kutu görünüme ve sayfaya göre", () => {
    expect(kutuOku(dugme, pencere)).toEqual({ x: 24, y: 610.3, genislik: 342, yukseklik: 48, sayfaX: 24, sayfaY: 1410.3 });
  });

  it("seçimi toplar", () => {
    const s = secimiTopla(dugme, pencere);
    expect(s).toMatchObject({
      adres: "http://localhost:5173/sepet",
      sayfaBasligi: "Vitrin · Sepet",
      secici: "button.odeme",
      ogeMetni: "Ödemeye geç",
      ogeHtml: '<button class="odeme">Ödemeye geç</button>',
      gorunum: { genislik: 390, yukseklik: 844 },
    });
  });
});
