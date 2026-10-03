// Sahnenin durağan katmanları: zemin ve duvarlar (SVG), eşyalar, pano tahtası, kurul masası ışıkları, sunucu ışıkları.
import { varlikAdresi, type Varliklar } from "./varliklar";
import { KARO, type EsyaYeri, type KaroAlani, type Oda, type SicakNokta, type Yerlesim } from "./yerlesim";

const SICAK_ADLARI: Record<SicakNokta, string> = {
  kurul: "Kurul masası: onaylara git",
  pano: "Pano: görev panosuna git",
  sunucu: "Sunucu odası: koda git",
  arsiv: "Arşiv: notlara git",
  toplanti: "Toplantı odası: #toplanti kanalına git",
};

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
};

/** Zemin, duvarlar, levhalar, ışık havuzları ve eşya gölgeleri */
export function zeminSvg(y: Yerlesim): string {
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
    p.push(`<text x="${ox}" y="27" class="of-levha" text-anchor="middle">${kacis(o.ad.toLocaleUpperCase("tr-TR"))}</text>`);
    p.push(`<text x="${ox}" y="43" class="of-levha-alt" text-anchor="middle">${kacis(o.alt)}</text>`);
  }

  // Duvarlar ve kapı kasaları
  for (const d of y.duvarlar) {
    const dis = d.x1 === d.x2 ? d.x1 < KARO || d.x1 > W - KARO : d.y1 > H - KARO;
    p.push(`<path d="M${d.x1} ${d.y1}L${d.x2} ${d.y2}" class="${dis ? "of-duvar of-duvar-dis" : "of-duvar"}"/>`);
  }
  for (const k of y.kasalar) p.push(`<rect x="${k.x - 2.5}" y="${k.y - 5}" width="5" height="10" rx="1" class="of-kasa"/>`);

  // Zemin yazıları (levhasız alanlar)
  for (const o of y.odalar) {
    if (o.levha || !o.etiket) continue;
    const { x: lx, y: ly } = o.etiket;
    p.push(`<text x="${lx}" y="${ly}" class="of-zemin-yazi">${kacis(o.ad.toLocaleUpperCase("tr-TR"))}</text>`);
    p.push(`<text x="${lx + 1}" y="${ly + 14}" class="of-zemin-alt">${kacis(o.alt)}</text>`);
  }
  // Giriş yazısı ve dış basamak
  const kapi = y.noktalar.kapi;
  const kx = (kapi.c + 1) * KARO;
  p.push(`<path d="M${kx - 30} ${kapi.r * KARO + 27}h-14M${kx + 30} ${kapi.r * KARO + 27}h14" class="of-giris-ok"/>`);
  p.push(`<text x="${kx}" y="${kapi.r * KARO + 30}" class="of-zemin-alt of-giris-yazi" text-anchor="middle">GİRİŞ</text>`);
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
    d.setAttribute("aria-label", etiket ?? SICAK_ADLARI[e.sicak]);
    d.title = etiket ?? SICAK_ADLARI[e.sicak];
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

export const PANO_SUTUNLARI = [
  { ad: "Bekleyen", durumlar: ["bekleyen", "planlandi"] },
  { ad: "Sürüyor", durumlar: ["calisiliyor"] },
  { ad: "İnceleme", durumlar: ["inceleme"] },
  { ad: "Tamam", durumlar: ["tamam"] },
] as const;

/** Ayaklı büyük tahta: sütun başlıkları; notları motor yerleştirir */
export function panoOgesi(y: Yerlesim): PanoOgesi {
  const pn = y.noktalar.pano;
  const kok = document.createElement("button");
  kok.type = "button";
  kok.className = "ofis-pano";
  kok.dataset.sicak = "pano";
  kok.setAttribute("aria-label", SICAK_ADLARI.pano);
  kok.title = SICAK_ADLARI.pano;
  kok.style.cssText = `left:${pn.x - pn.genislik / 2}px;top:${pn.y - pn.yukseklik}px;width:${pn.genislik}px;height:${pn.yukseklik}px;z-index:${Math.round(pn.y)}`;
  const yuz = document.createElement("span");
  yuz.className = "ofis-pano-yuz";
  const ic = 10;
  const yuzG = pn.genislik;
  const yuzH = pn.yukseklik - 18;
  const sutunG = (yuzG - ic * 2) / PANO_SUTUNLARI.length;
  const sutunlar = PANO_SUTUNLARI.map((_, i) => ({ x: ic + i * sutunG, g: sutunG }));
  yuz.innerHTML =
    `<span class="ofis-pano-ad">PANO</span>` +
    PANO_SUTUNLARI.map((s, i) => `<span class="ofis-pano-sutun" style="left:${sutunlar[i]!.x}px;width:${sutunG}px"><b>${s.ad}</b></span>`).join("");
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
