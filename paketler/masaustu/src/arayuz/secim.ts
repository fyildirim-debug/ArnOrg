// Seçilen öğenin bilgisi: benzersiz CSS seçici, kısa metin, kısaltılmış outerHTML, hesaplanmış stiller, kutu.
// Tarayıcının sayfaya yüklenen betiği (tarayici-onyukleme.ts) kullanır; DOM dışında bir şeye bağlı değildir.
// Birim testleri (linkedom): secim.test.ts

import type { SayfaKutusu, SayfaSecimi, SayfaStilleri } from "../kopru.js";

/** outerHTML ve öğe metni sınırları */
export const HTML_SINIRI = 2000;
export const METIN_SINIRI = 160;

/** Uygulamanın kendi katmanı: seçilemez, seçicide sayılmaz */
export const KATMAN_OZNITELIGI = "data-arnorg-secici";

/** Kararlı test öznitelikleri: kimlikten sonra ilk bakılan yer */
const TEST_OZNITELIKLERI = ["data-testid", "data-test", "data-cy", "data-qa"];

/** CSS.escape (CSSOM): tanımlayıcıyı seçicide güvenle kullanılır yapar */
export function cssKacis(deger: string): string {
  let sonuc = "";
  const ilk = deger.charCodeAt(0);
  for (let i = 0; i < deger.length; i++) {
    const c = deger.charCodeAt(i);
    if (c === 0) {
      sonuc += "�";
    } else if ((c >= 0x1 && c <= 0x1f) || c === 0x7f || (i === 0 && c >= 0x30 && c <= 0x39) || (i === 1 && c >= 0x30 && c <= 0x39 && ilk === 0x2d)) {
      sonuc += `\\${c.toString(16)} `;
    } else if (i === 0 && deger.length === 1 && c === 0x2d) {
      sonuc += `\\${deger.charAt(i)}`;
    } else if (c >= 0x80 || c === 0x2d || c === 0x5f || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      sonuc += deger.charAt(i);
    } else {
      sonuc += `\\${deger.charAt(i)}`;
    }
  }
  return sonuc;
}

/** Öznitelik değeri için çift tırnaklı dize */
function ozKacis(deger: string): string {
  return `"${deger.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ")}"`;
}

/**
 * Kimlik kararlı mı: harfle başlar, yalnız harf, rakam, - ve _ içerir (React useId'nin :r0:, «r0», _r_0_
 * biçimleri böylece düşer), uzun rakam dizisi ya da çatıların ürettiği kalıp (Radix, Headless UI, Ember) değildir.
 */
export function kararliKimlikMi(id: string): boolean {
  return /^[A-Za-z][\w-]{0,63}$/.test(id) && !/\d{3,}/.test(id) && !/^(ember|react|radix|headlessui|mui)[-_]?[\w-]*\d/i.test(id);
}

/** Sınıf kararlı mı: üretilmiş (CSS-in-JS, CSS modülleri) ve geçici durum sınıfları atlanır */
export function kararliSinifMi(sinif: string): boolean {
  if (!/^[A-Za-z][\w-]{0,40}$/.test(sinif)) return false;
  if (/\d{3,}/.test(sinif) || /__[\w-]*\d/.test(sinif)) return false;
  if (/^(css|sc|jsx|svelte|emotion|chakra|styled)-/i.test(sinif)) return false;
  return !/^(is|has)-|^(active|open|show|hover|focus|focused|selected|current|visible|hidden)$/.test(sinif);
}

function siniflar(el: Element): string[] {
  return Array.from(el.classList ?? []).filter(kararliSinifMi);
}

function benzersizMi(belge: Document, secici: string, el: Element): boolean {
  try {
    const bulunan = belge.querySelectorAll(secici);
    return bulunan.length === 1 && bulunan[0] === el;
  } catch {
    return false;
  }
}

/**
 * Öğeyi belgede tek başına seçen kısa bir CSS seçici. Sıra: kararlı kimlik, test öznitelikleri, sonra yukarı
 * doğru "etiket.sınıf" basamakları; aynı etiketli kardeşler :nth-of-type ile ayrılır. Kararlı kimliği olan bir
 * ataya varılırsa yol oradan başlar; köke kadar gelinirse body'den başlayan tam yol her zaman benzersizdir.
 */
export function benzersizSecici(el: Element): string {
  const belge = el.ownerDocument;
  const kok = belge.documentElement;
  if (el === kok) return "html";
  if (el.id && kararliKimlikMi(el.id)) {
    const s = `#${cssKacis(el.id)}`;
    if (benzersizMi(belge, s, el)) return s;
  }
  for (const oz of TEST_OZNITELIKLERI) {
    const deger = el.getAttribute(oz);
    if (!deger || deger.length > 80) continue;
    const s = `[${oz}=${ozKacis(deger)}]`;
    if (benzersizMi(belge, s, el)) return s;
  }
  const parcalar: string[] = [];
  let e: Element | null = el;
  while (e && e !== kok) {
    if (e !== el && e.id && kararliKimlikMi(e.id) && benzersizMi(belge, `#${cssKacis(e.id)}`, e)) {
      parcalar.unshift(`#${cssKacis(e.id)}`);
      return parcalar.join(" > ");
    }
    let parca = cssKacis(e.localName) + siniflar(e)
      .slice(0, 2)
      .map((c) => `.${cssKacis(c)}`)
      .join("");
    const aday = [parca, ...parcalar].join(" > ");
    if (benzersizMi(belge, aday, el)) return aday;
    const ebeveyn: Element | null = e.parentElement;
    if (ebeveyn) {
      const ad = e.localName;
      const ayni = Array.from(ebeveyn.children).filter((k) => k.localName === ad);
      if (ayni.length > 1) parca += `:nth-of-type(${ayni.indexOf(e) + 1})`;
    }
    parcalar.unshift(parca);
    const yol = parcalar.join(" > ");
    if (benzersizMi(belge, yol, el)) return yol;
    e = ebeveyn;
  }
  return parcalar.join(" > ");
}

function kisalt(metin: string, sinir: number): string {
  return metin.length > sinir ? `${metin.slice(0, sinir - 1)}…` : metin;
}

/**
 * Öğenin kısa metni: görünen metin (boşluklar tekleşir); yoksa aria-label, alt, title, placeholder ya da
 * düğme değeri. Parola alanının değeri hiç okunmaz; kullanıcının yazdığı canlı değer de alınmaz.
 */
export function ogeMetni(el: Element, sinir = METIN_SINIRI): string {
  const h = el as HTMLElement;
  const ham = typeof h.innerText === "string" ? h.innerText : (el.textContent ?? "");
  let metin = ham.replace(/\s+/g, " ").trim();
  if (!metin) {
    const parola = el.localName === "input" && (el.getAttribute("type") ?? "").toLowerCase() === "password";
    for (const oz of ["aria-label", "alt", "title", "placeholder", ...(parola ? [] : ["value"])]) {
      const v = el.getAttribute(oz)?.replace(/\s+/g, " ").trim();
      if (v) {
        metin = v;
        break;
      }
    }
  }
  return kisalt(metin, sinir);
}

/** Kısaltılmış outerHTML (en çok sinir karakter) */
export function kisaHtml(el: Element, sinir = HTML_SINIRI): string {
  return kisalt(el.outerHTML, sinir);
}

function saydamMi(renk: string): boolean {
  const r = renk.replace(/\s+/g, "").toLowerCase();
  return !r || r === "transparent" || /^rgba\(.*,0(\.0+)?\)$/.test(r) || /\/0(\.0+)?\)$/.test(r);
}

/** Yazı tipi, boyut, renk ve görünen arka plan (öğeninki saydamsa ilk saydam olmayan atanınki) */
export function stilleriOku(el: Element, pencere: Window): SayfaStilleri {
  const st = pencere.getComputedStyle(el);
  let arkaPlan = "transparent";
  for (let e: Element | null = el; e; e = e.parentElement) {
    const renk = pencere.getComputedStyle(e).backgroundColor;
    if (!saydamMi(renk)) {
      arkaPlan = renk;
      break;
    }
  }
  return { yaziTipi: kisalt(st.fontFamily, 200), boyut: st.fontSize, renk: st.color, arkaPlan };
}

const yuvarla = (n: number) => Math.round(n * 10) / 10;

/** Sınır kutusu: görünüme ve sayfanın başına göre (CSS piksel) */
export function kutuOku(el: Element, pencere: Window): SayfaKutusu {
  const r = el.getBoundingClientRect();
  return {
    x: yuvarla(r.left),
    y: yuvarla(r.top),
    genislik: yuvarla(r.width),
    yukseklik: yuvarla(r.height),
    sayfaX: yuvarla(r.left + pencere.scrollX),
    sayfaY: yuvarla(r.top + pencere.scrollY),
  };
}

/** Seçim katmanındaki kısa etiket: button.kaydet, #arama, a.menu-baglanti */
export function etiketMetni(el: Element): string {
  const id = el.id && kararliKimlikMi(el.id) ? `#${el.id}` : "";
  const sinif = siniflar(el)
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join("");
  return kisalt(`${el.localName}${id}${sinif}`, 60);
}

/** Seçilen öğe için ana sürece giden bilgi */
export function secimiTopla(el: Element, pencere: Window): SayfaSecimi {
  const belge = el.ownerDocument;
  return {
    adres: pencere.location.href,
    sayfaBasligi: kisalt((belge.title ?? "").replace(/\s+/g, " ").trim(), 300),
    secici: benzersizSecici(el),
    ogeMetni: ogeMetni(el),
    ogeHtml: kisaHtml(el),
    stiller: stilleriOku(el, pencere),
    kutu: kutuOku(el, pencere),
    gorunum: { genislik: pencere.innerWidth, yukseklik: pencere.innerHeight },
  };
}
