// Sahnenin durağan katmanları: zemin ve duvarlar (SVG), eşyalar, pano tahtası, kurul masası ışıkları, sunucu ışıkları,
// doğu kanadının ekranları (kütüphane, test panosu, sunum), dünya küresi, kahve buharı ve giriş kapısı.
// Yazılar o anki dilde çizilir; dil değişince motor metinleri yeniler (sicakAdi, zeminSvg, panoYazilari, ekranYazilari).
import { sozluk } from "../dil";
import { varlikAdresi, type Varliklar } from "./varliklar";
import { KARO, type EsyaYeri, type KaroAlani, type Oda, type Pano, type SicakNokta, type Yerlesim } from "./yerlesim";

/** Sıcak noktanın erişilebilir adı */
export function sicakAdi(s: SicakNokta): string {
  return sozluk().ofis.sicak[s];
}

function kacis(metin: string): string {
  return metin.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function alanPx(a: KaroAlani) {
  return { x: a.c * KARO, y: a.r * KARO, g: a.g * KARO, h: a.y * KARO };
}

const ZEMIN_SINIFI: Record<Oda["zemin"], string> = {
  oda: "of-z-oda",
  ahsap: "of-z-ahsap",
  hali: "of-z-hali",
  yukseltilmis: "of-z-yuk",
  acik: "of-z-acik",
  kilim: "of-z-kilim",
  karo: "of-z-karo",
  sahne: "of-z-sahne",
};

/** Zemin, duvarlar, levhalar, ışık havuzları ve eşya gölgeleri */
export function zeminSvg(y: Yerlesim): string {
  const so = sozluk().ofis;
  const buyuk = (m: string) => m.toLocaleUpperCase(so.yerel);
  const W = y.genislik;
  const H = y.yukseklik;
  const p: string[] = [];
  p.push(`<svg class="ofis-zemin" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">`);
  p.push(`<defs>
    <pattern id="of-nokta" width="${KARO}" height="${KARO}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1" class="of-nokta"/></pattern>
    <pattern id="of-tahta" width="96" height="16" patternUnits="userSpaceOnUse"><path d="M0 15.5h96M40 0v16" class="of-desen"/></pattern>
    <pattern id="of-tahta2" width="96" height="16" patternUnits="userSpaceOnUse" patternTransform="translate(48 8)"><path d="M0 15.5h96M40 0v16" class="of-desen"/></pattern>
    <pattern id="of-hali" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v6" class="of-desen of-desen-ince"/></pattern>
    <pattern id="of-yuk" width="${KARO * 2}" height="${KARO * 2}" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="${KARO * 2 - 2}" height="${KARO * 2 - 2}" rx="2" class="of-yuk-karo"/><circle cx="${KARO}" cy="${KARO}" r="1.6" class="of-yuk-delik"/></pattern>
    <pattern id="of-kilim" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M12 3 21 12 12 21 3 12z" class="of-desen of-desen-ince"/></pattern>
    <pattern id="of-karo" width="${KARO}" height="${KARO}" patternUnits="userSpaceOnUse"><path d="M0 0.5H${KARO}M0.5 0V${KARO}" class="of-karo-derz"/><path d="M${KARO / 2} ${KARO / 2 - 2}v4M${KARO / 2 - 2} ${KARO / 2}h4" class="of-karo-arti"/></pattern>
    <pattern id="of-sahne" width="12" height="${KARO}" patternUnits="userSpaceOnUse"><path d="M0 ${KARO - 0.5}H12" class="of-desen"/></pattern>
    <radialGradient id="of-spot"><stop offset="0" class="of-spot-ic"/><stop offset="1" class="of-spot-dis"/></radialGradient>
    <radialGradient id="of-isik"><stop offset="0" class="of-isik-ic"/><stop offset="1" class="of-isik-dis"/></radialGradient>
    <radialGradient id="of-golge"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="0.55" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="of-duvar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="of-duvar-ust"/><stop offset="1" class="of-duvar-alt"/></linearGradient>
  </defs>`);

  // Bina içi taban ve köşe noktaları
  const ic = { x: KARO / 2, y: 0, g: W - KARO, h: H - KARO / 2 };
  p.push(`<rect x="${ic.x}" y="${ic.y}" width="${ic.g}" height="${ic.h}" class="of-taban"/>`);

  // Oda zeminleri
  for (const o of y.odalar) {
    const a = alanPx(o.alan);
    p.push(`<rect x="${a.x}" y="${a.y}" width="${a.g}" height="${a.h}" class="${ZEMIN_SINIFI[o.zemin]}"/>`);
    if (o.zemin === "ahsap") {
      p.push(`<rect x="${a.x}" y="${a.y}" width="${a.g}" height="${a.h}" fill="url(#of-tahta)"/>`);
    } else if (o.zemin === "hali") {
      p.push(`<rect x="${a.x + 12}" y="${a.y + 12}" width="${a.g - 24}" height="${a.h - 24}" rx="3" class="of-hali-kenar"/>`);
      p.push(`<rect x="${a.x + 12}" y="${a.y + 12}" width="${a.g - 24}" height="${a.h - 24}" rx="3" fill="url(#of-hali)"/>`);
    } else if (o.zemin === "yukseltilmis") {
      p.push(`<rect x="${a.x}" y="${a.y}" width="${a.g}" height="${a.h}" fill="url(#of-yuk)"/>`);
    } else if (o.zemin === "karo") {
      p.push(`<rect x="${a.x}" y="${a.y}" width="${a.g}" height="${a.h}" fill="url(#of-karo)"/>`);
    } else if (o.zemin === "sahne") {
      p.push(`<rect x="${a.x}" y="${a.y}" width="${a.g}" height="${a.h}" fill="url(#of-tahta2)"/>`);
    }
  }
  p.push(`<rect x="${ic.x}" y="${ic.y}" width="${ic.g}" height="${ic.h}" fill="url(#of-nokta)"/>`);

  // Kilimler ve kurul alanının ince çerçevesi
  for (const k of y.kilimler) {
    const r = alanPx(k.alan);
    if (k.tur === "kurul") {
      p.push(`<rect x="${r.x}" y="${r.y}" width="${r.g}" height="${r.h}" rx="6" class="of-kurul-alan"/>`);
      continue;
    }
    if (k.tur === "sahne") {
      // Sunum sahnesi: alçak platform, ön kenarında ışık bandı, sunanın durduğu yerde spot
      p.push(`<rect x="${r.x}" y="${r.y + 6}" width="${r.g}" height="${r.h - 6}" rx="3" class="of-sahne"/>`);
      p.push(`<rect x="${r.x}" y="${r.y + 6}" width="${r.g}" height="${r.h - 6}" rx="3" fill="url(#of-sahne)"/>`);
      p.push(`<path d="M${r.x + 4} ${r.y + r.h - 1.5}H${r.x + r.g - 4}" class="of-sahne-kenar"/>`);
      p.push(`<ellipse cx="${r.x + KARO * 1.5}" cy="${r.y + r.h - KARO * 1.1}" rx="${KARO * 1.6}" ry="${KARO * 0.75}" fill="url(#of-spot)" class="of-spot"/>`);
      continue;
    }
    p.push(`<rect x="${r.x + 4}" y="${r.y + 4}" width="${r.g - 8}" height="${r.h - 8}" rx="4" class="of-kilim${k.tur === "koyu" ? " of-kilim-koyu" : ""}"/>`);
    p.push(`<rect x="${r.x + 10}" y="${r.y + 10}" width="${r.g - 20}" height="${r.h - 20}" rx="2" class="of-kilim-ic"/>`);
  }
  // Giriş paspası
  const pas = alanPx(y.noktalar.paspas);
  p.push(`<rect x="${pas.x + 6}" y="${pas.y + 8}" width="${pas.g - 12}" height="${pas.h - 8}" rx="3" class="of-paspas"/>`);
  for (let i = 1; i < 8; i++) p.push(`<path d="M${pas.x + 6 + ((pas.g - 12) * i) / 8} ${pas.y + 12}v${pas.h - 16}" class="of-paspas-cizgi"/>`);

  // Işık havuzları (lambalar)
  for (const e of y.esyalar) {
    if (e.esya !== "lamba") continue;
    p.push(`<ellipse cx="${e.x - e.genislik * 0.25}" cy="${e.y - 6}" rx="${KARO * 3}" ry="${KARO * 1.8}" fill="url(#of-isik)" class="of-isik"/>`);
  }

  // Eşya gölgeleri
  for (const e of y.esyalar) {
    if (!e.golge) continue;
    const rx = (e.genislik * e.golge) / 2;
    p.push(`<ellipse cx="${e.x}" cy="${e.y - 3}" rx="${rx}" ry="${Math.max(5, rx * 0.26)}" fill="url(#of-golge)"/>`);
  }
  // Pano tahtasının gölgesi
  const pn = y.noktalar.pano;
  p.push(`<ellipse cx="${pn.x}" cy="${pn.y - 2}" rx="${pn.genislik * 0.5}" ry="9" fill="url(#of-golge)"/>`);

  // Üst duvar yüzü (levha bandı) ve oda levhaları
  const bandAlt = 2 * KARO;
  p.push(`<rect x="${KARO / 2}" y="0" width="${W - KARO}" height="${bandAlt}" fill="url(#of-duvar)"/>`);
  p.push(`<rect x="${KARO / 2}" y="${bandAlt - 6}" width="${W - KARO}" height="6" class="of-supurgelik"/>`);
  p.push(`<path d="M${KARO / 2} 0.5H${W - KARO / 2}" class="of-duvar-tepe"/>`);
  p.push(`<path d="M${KARO / 2} ${bandAlt}H${W - KARO / 2}" class="of-duvar-dip"/>`);
  for (const o of y.odalar) {
    if (!o.levha) continue;
    const a = alanPx(o.alan);
    // Levha: oda adının duvara asılı yazısı, ortalanmış
    const ox = a.x + a.g / 2;
    const ad = so.odalar[o.kimlik];
    p.push(`<text x="${ox}" y="27" class="of-levha" text-anchor="middle">${kacis(buyuk(ad.ad))}</text>`);
    p.push(`<text x="${ox}" y="43" class="of-levha-alt" text-anchor="middle">${kacis(ad.alt)}</text>`);
  }

  // Duvarlar ve kapı kasaları
  for (const d of y.duvarlar) {
    const dis = d.x1 === d.x2 ? d.x1 < KARO || d.x1 > W - KARO : d.y1 > H - KARO;
    p.push(`<path d="M${d.x1} ${d.y1}L${d.x2} ${d.y2}" class="${dis ? "of-duvar of-duvar-dis" : "of-duvar"}"/>`);
  }
  for (const k of y.kasalar) {
    p.push(k.yatay ? `<rect x="${k.x - 5}" y="${k.y - 2.5}" width="10" height="5" rx="1" class="of-kasa"/>` : `<rect x="${k.x - 2.5}" y="${k.y - 5}" width="5" height="10" rx="1" class="of-kasa"/>`);
  }
  // Kanat odalarının kapı levhaları: iç duvara asılı küçük plaka (ad ve alt yazı)
  for (const o of y.odalar) {
    if (!o.kapiLevhasi) continue;
    const ad = so.odalar[o.kimlik];
    const baslik = buyuk(ad.ad);
    const g = Math.max(baslik.length * 8.6, ad.alt.length * 5.4) + 22;
    const { x: lx, y: ly } = o.kapiLevhasi;
    p.push(`<rect x="${lx - g / 2}" y="${ly - 13}" width="${g}" height="27" rx="2" class="of-plaka"/>`);
    p.push(`<text x="${lx}" y="${ly + 1}" class="of-plaka-ad" text-anchor="middle">${kacis(baslik)}</text>`);
    p.push(`<text x="${lx}" y="${ly + 10}" class="of-plaka-alt" text-anchor="middle">${kacis(ad.alt)}</text>`);
  }

  // Zemin yazıları (levhasız alanlar)
  for (const o of y.odalar) {
    if (o.levha || !o.etiket) continue;
    const { x: lx, y: ly } = o.etiket;
    const ad = so.odalar[o.kimlik];
    p.push(`<text x="${lx}" y="${ly}" class="of-zemin-yazi">${kacis(buyuk(ad.ad))}</text>`);
    p.push(`<text x="${lx + 1}" y="${ly + 14}" class="of-zemin-alt">${kacis(ad.alt)}</text>`);
  }
  // Giriş yazısı ve dış basamak
  const kapi = y.noktalar.kapi;
  const kx = (kapi.c + 1) * KARO;
  p.push(`<path d="M${kx - 30} ${kapi.r * KARO + 27}h-14M${kx + 30} ${kapi.r * KARO + 27}h14" class="of-giris-ok"/>`);
  p.push(`<text x="${kx}" y="${kapi.r * KARO + 30}" class="of-zemin-alt of-giris-yazi" text-anchor="middle">${kacis(so.giris)}</text>`);
  p.push("</svg>");
  return p.join("");
}

/** Görsel öğesi: yüklenince gerçek oranla yüksekliği düzeltir */
export function esyaOgesi(e: EsyaYeri, v: Varliklar, etiket?: string, odaklanir = true): HTMLElement {
  const varlik = v.esyalar[e.esya];
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  if (varlik) img.src = varlikAdresi(varlik.dosya);
  img.className = "ofis-esya-gorsel";
  if (e.ayna) img.style.transform = "scaleX(-1)";
  let kap: HTMLElement;
  if (e.sicak) {
    const d = document.createElement("button");
    d.type = "button";
    d.className = "ofis-esya ofis-sicak";
    d.dataset.sicak = e.sicak;
    d.setAttribute("aria-label", etiket ?? sicakAdi(e.sicak));
    d.title = etiket ?? sicakAdi(e.sicak);
    if (!odaklanir) d.tabIndex = -1;
    kap = d;
  } else {
    kap = document.createElement("div");
    kap.className = "ofis-esya";
  }
  kap.dataset.esya = e.esya;
  kap.appendChild(img);
  const yerlestir = (h: number) => {
    kap.style.cssText = `left:${e.x - e.genislik / 2}px;top:${e.y - h}px;width:${e.genislik}px;height:${h}px;z-index:${Math.round(e.z ?? e.y)}`;
  };
  yerlestir(e.yukseklik);
  img.addEventListener("load", () => {
    if (!img.naturalWidth) return;
    const h = (e.genislik * img.naturalHeight) / img.naturalWidth;
    if (Math.abs(h - e.yukseklik) > 0.5) yerlestir(h);
  });
  return kap;
}

export interface PanoOgesi {
  kok: HTMLButtonElement;
  notlar: HTMLElement;
  sutunlar: { x: number; g: number }[];
  ustY: number;
  satirH: number;
  notG: number;
  notH: number;
}

/** Pano sütunları; adları sözlükte s.ofis.pano.sutunlar[kimlik] */
export const PANO_SUTUNLARI = [
  { kimlik: "bekleyen", durumlar: ["bekleyen", "planlandi"] },
  { kimlik: "suruyor", durumlar: ["calisiliyor"] },
  { kimlik: "inceleme", durumlar: ["inceleme"] },
  { kimlik: "tamam", durumlar: ["tamam"] },
] as const;

/** Pano başlığı ve sütun adları (o anki dilde) */
export function panoYazilari(p: PanoOgesi) {
  const so = sozluk().ofis;
  const ad = p.kok.querySelector(".ofis-pano-ad");
  if (ad) ad.textContent = so.pano.ad;
  p.kok.querySelectorAll<HTMLElement>(".ofis-pano-sutun b").forEach((b, i) => {
    const s = PANO_SUTUNLARI[i];
    if (s) b.textContent = so.pano.sutunlar[s.kimlik];
  });
  p.kok.title = sicakAdi("pano");
}

/** Ayaklı büyük tahta: sütun başlıkları; notları motor yerleştirir */
export function panoOgesi(y: Yerlesim): PanoOgesi {
  const pn = y.noktalar.pano;
  const kok = document.createElement("button");
  kok.type = "button";
  kok.className = "ofis-pano";
  kok.dataset.sicak = "pano";
  kok.setAttribute("aria-label", sicakAdi("pano"));
  kok.title = sicakAdi("pano");
  kok.style.cssText = `left:${pn.x - pn.genislik / 2}px;top:${pn.y - pn.yukseklik}px;width:${pn.genislik}px;height:${pn.yukseklik}px;z-index:${Math.round(pn.y)}`;
  const yuz = document.createElement("span");
  yuz.className = "ofis-pano-yuz";
  const ic = 10;
  const yuzG = pn.genislik;
  const yuzH = pn.yukseklik - 18;
  const sutunG = (yuzG - ic * 2) / PANO_SUTUNLARI.length;
  const sutunlar = PANO_SUTUNLARI.map((_, i) => ({ x: ic + i * sutunG, g: sutunG }));
  const so = sozluk().ofis;
  yuz.innerHTML =
    `<span class="ofis-pano-ad">${kacis(so.pano.ad)}</span>` +
    PANO_SUTUNLARI.map((s, i) => `<span class="ofis-pano-sutun" style="left:${sutunlar[i]!.x}px;width:${sutunG}px"><b>${kacis(so.pano.sutunlar[s.kimlik])}</b></span>`).join("");
  const notlar = document.createElement("span");
  notlar.className = "ofis-pano-notlar";
  yuz.appendChild(notlar);
  kok.appendChild(yuz);
  const ayak = document.createElement("span");
  ayak.className = "ofis-pano-ayaklar";
  kok.appendChild(ayak);
  void yuzH;
  return { kok, notlar, sutunlar, ustY: 30, satirH: 19, notG: 26, notH: 15 };
}

// ---------------------------------------------------------------------------
// Doğu kanadı: ayaklı ekranlar, küre, buhar, giriş kapısı
// ---------------------------------------------------------------------------

/** Ayaklı ekranın kökü: sıcak nokta düğmesi, yüz ve ayaklar; konumu Pano ölçülerinden */
function ayakliEkran(p: Pano, sicak: SicakNokta, sinif: string): { kok: HTMLButtonElement; yuz: HTMLSpanElement } {
  const kok = document.createElement("button");
  kok.type = "button";
  kok.className = `ofis-ekran-ayakli ${sinif}`;
  kok.dataset.sicak = sicak;
  kok.setAttribute("aria-label", sicakAdi(sicak));
  kok.title = sicakAdi(sicak);
  kok.style.cssText = `left:${p.x - p.genislik / 2}px;top:${p.y - p.yukseklik}px;width:${p.genislik}px;height:${p.yukseklik}px;z-index:${Math.round(p.y)}`;
  const yuz = document.createElement("span");
  yuz.className = "ofis-ekran-yuz";
  const ayak = document.createElement("span");
  ayak.className = "ofis-ekran-ayaklar";
  kok.append(yuz, ayak);
  return { kok, yuz };
}

/** Ekranda kayan satırlar: farklı uzunlukta çizgiler; iki kez yazılır, yarısı kadar kayınca başa sarar */
function kayanSatirlar(sayi: number, tohum: number): string {
  const satir = (i: number) => {
    const u = 28 + ((i * 37 + tohum * 11) % 62);
    const vurgu = (i + tohum) % 5 === 0 ? " data-vurgu" : "";
    return `<i style="width:${u}%"${vurgu}></i>`;
  };
  const yarim = Array.from({ length: sayi }, (_, i) => satir(i)).join("");
  return `<span class="ofis-ekran-kaydir">${yarim}${yarim}</span>`;
}

/**
 * Tel kafes küre: dış çember, enlemler ve dönen üç meridyen. HTML öğeleriyle çizilir: meridyenin dönüşü yalnız
 * birleştiricide çalışan bir dönüşüm (SVG içindeki dönüşüm her karede yerleşimi geçersiz kılardı).
 */
function kureHtml(cap: number): string {
  return `<span class="ofis-kure-top" style="--cap:${cap}px"><b></b><i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i></span>`;
}

export interface ArastirmaEkrani {
  kok: HTMLButtonElement;
  baslik: HTMLElement;
  sorgu: HTMLElement;
}

/** Kütüphanenin büyük ekranı: başlık, son sorgu (yazılarak gelir), kayan sonuç satırları ve köşede küre */
export function arastirmaEkraniOgesi(p: Pano): ArastirmaEkrani {
  const { kok, yuz } = ayakliEkran(p, "arastirma", "ofis-arastirma-ekrani");
  yuz.innerHTML = `<span class="ofis-ekran-ust"><b></b><span class="ofis-ekran-kure">${kureHtml(12)}</span></span><span class="ofis-ekran-sorgu"></span><span class="ofis-ekran-satirlar">${kayanSatirlar(9, 3)}</span>`;
  const ekran = { kok, baslik: yuz.querySelector<HTMLElement>(".ofis-ekran-ust b")!, sorgu: yuz.querySelector<HTMLElement>(".ofis-ekran-sorgu")! };
  ekran.baslik.textContent = sozluk().ofis.ekran.arastirma;
  return ekran;
}

export interface TestPanosu {
  kok: HTMLButtonElement;
  baslik: HTMLElement;
  durum: HTMLElement;
  komut: HTMLElement;
}

/** Test panosu: büyük durum ışığı (hazır, koşuyor, geçti, kaldı), son komut ve tarama çubuğu */
export function testPanosuOgesi(p: Pano): TestPanosu {
  const { kok, yuz } = ayakliEkran(p, "laboratuvar", "ofis-test-panosu");
  kok.dataset.durum = "bos";
  yuz.innerHTML = `<span class="ofis-test-isik" aria-hidden="true"><i></i></span><span class="ofis-test-bilgi"><span class="ofis-ekran-ust"><b></b><em></em></span><span class="ofis-test-komut"></span><span class="ofis-test-cubuk"><i></i></span></span>`;
  const pano = {
    kok,
    baslik: yuz.querySelector<HTMLElement>(".ofis-ekran-ust b")!,
    durum: yuz.querySelector<HTMLElement>(".ofis-ekran-ust em")!,
    komut: yuz.querySelector<HTMLElement>(".ofis-test-komut")!,
  };
  pano.baslik.textContent = sozluk().ofis.ekran.test;
  return pano;
}

export interface SunumEkrani {
  kok: HTMLButtonElement;
  baslik: HTMLElement;
  durum: HTMLElement;
  konu: HTMLElement;
  adimlar: HTMLElement;
}

/** Stüdyonun sunum ekranı: teslimin başlığı ve test adımları (sırayla işaretlenir), kurulun kararı */
export function sunumEkraniOgesi(p: Pano): SunumEkrani {
  const { kok, yuz } = ayakliEkran(p, "studyo", "ofis-sunum-ekrani");
  kok.dataset.durum = "bos";
  yuz.innerHTML = `<span class="ofis-ekran-ust"><b></b><em></em></span><span class="ofis-sunum-konu"></span><span class="ofis-sunum-adimlar"></span>`;
  const ekran = {
    kok,
    baslik: yuz.querySelector<HTMLElement>(".ofis-ekran-ust b")!,
    durum: yuz.querySelector<HTMLElement>(".ofis-ekran-ust em")!,
    konu: yuz.querySelector<HTMLElement>(".ofis-sunum-konu")!,
    adimlar: yuz.querySelector<HTMLElement>(".ofis-sunum-adimlar")!,
  };
  ekran.baslik.textContent = sozluk().ofis.ekran.sunum;
  return ekran;
}

/** Ayaklı dünya küresi (kütüphanenin köşesi) */
export function kureOgesi(n: { x: number; y: number }): HTMLElement {
  const el = document.createElement("div");
  el.className = "ofis-kure";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `left:${n.x - 14}px;top:${n.y - 44}px;z-index:${Math.round(n.y)}`;
  el.innerHTML = `${kureHtml(24)}<span class="ofis-kure-ayak"></span>`;
  return el;
}

/** Kahve makinesinin buharı: üç ince bulut yükselir ve söner */
export function buharOgesi(e: EsyaYeri): HTMLElement {
  const el = document.createElement("div");
  el.className = "ofis-buhar";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `left:${e.x - 8}px;top:${e.y - e.yukseklik - 18}px;z-index:${Math.round(e.y) + 1}`;
  el.innerHTML = '<i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i>';
  return el;
}

/** Giriş kapısı: iki cam kanat; biri yaklaşınca yana kayar */
export function kapiOgesi(k: { x: number; y: number; genislik: number }): HTMLElement {
  const el = document.createElement("div");
  el.className = "ofis-kapi";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `left:${k.x - k.genislik / 2}px;top:${k.y - 4}px;width:${k.genislik}px;z-index:${Math.round(k.y) + 40}`;
  el.innerHTML = "<i></i><i></i>";
  return el;
}
