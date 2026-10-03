// Ofis yerleşimi: odalar, duvarlar, eşyalar, masalar ve yürünebilir ızgara.
// Saf veri üretir; DOM'a ve React'e dokunmaz. Birimler: karo (ızgara hücresi) ve dünya pikseli.

/** Bir karonun dünya pikseli cinsinden kenarı */
export const KARO = 32;
/** Ayakta duran karakterin dünya yüksekliği (piksel); genişlik görselin oranından gelir */
export const KARAKTER_BOYU = 86;
/** Oturan karakterin masa yüzeyinin üstünde kalan payı (boyuna oran) */
const OTURMA_GORUNUR = 0.55;

export interface Karo {
  c: number;
  r: number;
}

export interface Nokta {
  x: number;
  y: number;
}

/** Karo dikdörtgeni: sol üst karo ve genişlik/yükseklik (karo) */
export interface KaroAlani {
  c: number;
  r: number;
  g: number;
  y: number;
}

export type EsyaAdi =
  | "masa"
  | "sandalye"
  | "bitki-buyuk"
  | "bitki-kucuk"
  | "kanepe"
  | "beyaz-tahta"
  | "sunucu"
  | "kahve"
  | "kitaplik"
  | "toplanti-masasi"
  | "su"
  | "lamba";

/** Eşya görsellerinin yükseklik / genişlik oranı (varlık bildirimindeki boyutlardan) */
export type EsyaOranlari = Record<EsyaAdi, number>;

export const VARSAYILAN_ORANLAR: EsyaOranlari = {
  masa: 258 / 320,
  sandalye: 281 / 174,
  "bitki-buyuk": 300 / 217,
  "bitki-kucuk": 192 / 146,
  kanepe: 216 / 320,
  "beyaz-tahta": 298 / 313,
  sunucu: 314 / 199,
  kahve: 149 / 125,
  kitaplik: 171 / 111,
  "toplanti-masasi": 182 / 320,
  su: 314 / 114,
  lamba: 289 / 230,
};

export type OdaKimligi = "ceo" | "cto" | "toplanti" | "arsiv" | "sunucu" | "muhendislik" | "dinlenme" | "kurul";
export type ZeminTuru = "oda" | "hali" | "ahsap" | "yukseltilmis" | "acik" | "kilim";
/** Tıklanınca başka ekrana götüren sahne öğeleri */
export type SicakNokta = "kurul" | "pano" | "sunucu" | "arsiv" | "toplanti";

export interface Oda {
  kimlik: OdaKimligi;
  /** Duvar levhasındaki ya da zemindeki büyük ad */
  ad: string;
  /** Küçük alt yazı */
  alt: string;
  alan: KaroAlani;
  zemin: ZeminTuru;
  /** Üst duvarı (levha bandı) olan odalar */
  levha: boolean;
  /** Levhasız odada zemin yazısının sol alt noktası; yoksa yazı çizilmez */
  etiket?: Nokta;
}

export interface Cizgi {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EsyaYeri {
  kimlik: string;
  esya: EsyaAdi;
  /** Ayak noktası (görselin alt ortası), dünya pikseli */
  x: number;
  y: number;
  /** Görünen genişlik (piksel); yükseklik orandan */
  genislik: number;
  yukseklik: number;
  ayna?: boolean;
  /** Derinlik anahtarı; verilmezse y */
  z?: number;
  engel?: KaroAlani;
  sicak?: SicakNokta;
  /** Zemin gölgesinin genişliğe oranı; 0 gölgesiz */
  golge?: number;
}

/** Oturulan yer: masa arkası ya da toplantı masası */
export interface Koltuk {
  /** Oturan karakterin ayak noktası */
  oturma: Nokta;
  /** Oturmadan önce yüründüğü karo */
  yaklasma: Karo;
  /** Bu y'nin altı masanın arkasında kalır (kırpılır) */
  kesit: number;
}

export interface Masa extends Koltuk {
  kimlik: string;
  oda: "ceo" | "cto" | "muhendislik";
  esyaKimligi: string;
  /** Monitör ekranının alanı (ışıma için), dünya pikseli */
  monitor: { x: number; y: number; g: number; h: number };
  /** Masanın üst kenarı (simge ve saat için) */
  ust: Nokta;
}

export interface Yerlesim {
  sutun: number;
  satir: number;
  genislik: number;
  yukseklik: number;
  odalar: Oda[];
  duvarlar: Cizgi[];
  /** Kapı boşluklarının iki yanındaki kasa noktaları */
  kasalar: Nokta[];
  esyalar: EsyaYeri[];
  masalar: Masa[];
  /** Zemin kilimleri ve işaretli alanlar */
  kilimler: { alan: KaroAlani; tur: "kilim" | "koyu" | "kurul" }[];
  /** 1: yürünebilir */
  yurunebilir: Uint8Array;
  noktalar: {
    /** Giriş kapısı karosu: yeni gelen burada belirir, giden burada kaybolur */
    kapi: Karo;
    kapiIci: Karo;
    kurulMasasiKimligi: string;
    kurulBekleme: Karo[];
    kahve: Karo;
    su: Karo;
    kanepeOnu: Karo[];
    dinlenme: Karo[];
    toplantiKoltuklari: Koltuk[];
    toplantiAyakta: Karo[];
    toplantiAlani: KaroAlani;
    sunucuOnu: Karo[];
    sunucuKimlikleri: string[];
    arsivOnu: Karo[];
    arsivKimligi: string;
    adaylar: Karo[];
    /** Pano tahtasının ayak ortası ve boyutu */
    pano: { x: number; y: number; genislik: number; yukseklik: number; engel: KaroAlani };
    /** Kapı paspası (zemin işareti) */
    paspas: KaroAlani;
  };
}

/** Mühendislik adası başına masa */
export const ADA_MASA = 3;
/** Satır başına ada */
const SATIR_ADA = 2;
/** En az masa sayısı */
export const EN_AZ_MASA = 12;

export function karoMerkezi(k: Karo): Nokta {
  return { x: (k.c + 0.5) * KARO, y: (k.r + 0.5) * KARO };
}

/** Ayakta duran karakterin ayak noktası: karonun alt yarısında */
export function karoAyak(k: Karo): Nokta {
  return { x: (k.c + 0.5) * KARO, y: (k.r + 0.78) * KARO };
}

export function noktaKarosu(n: Nokta): Karo {
  return { c: Math.floor(n.x / KARO), r: Math.floor(n.y / KARO) };
}

/** Gereken mühendislik masası: en az 12, adalar üçer masalık */
export function masaSayisi(muhendis: number): number {
  return Math.max(EN_AZ_MASA, Math.ceil(muhendis / ADA_MASA) * ADA_MASA);
}

/**
 * Ofis yerleşimini kurar.
 * muhendisMasasi: açık ofisteki masa sayısı (masaSayisi() ile yuvarlanmış)
 */
/**
 * Ofis yerleşimini kurar.
 * muhendisMasasi: açık ofisteki masa sayısı (masaSayisi() ile yuvarlanmış)
 *
 * Satırlar: 0-1 duvar levhası, 2-7 üst odalar, 8 duvar, 9-10 koridor, 11'den sonrası açık ofis (solda),
 * dinlenme ve kurul/giriş (sağda). Ada satırı arttıkça ofis aşağı uzar; giriş ve kurul en altta kalır.
 */
export function yerlesimKur(muhendisMasasi: number, oranlar: EsyaOranlari = VARSAYILAN_ORANLAR): Yerlesim {
  const adaSayisi = Math.ceil(Math.max(EN_AZ_MASA, muhendisMasasi) / ADA_MASA);
  const adaSatiri = Math.ceil(adaSayisi / SATIR_ADA);
  const C = 48;
  const R = Math.max(27, 15 + 5 * adaSatiri);
  /** Alt bölümün (lobi, giriş) temel 27 satırlık plana göre kayması */
  const alt = R - 27;

  const yurunebilir = new Uint8Array(C * R);
  const ac = (a: KaroAlani) => {
    for (let r = a.r; r < a.r + a.y; r++) for (let c = a.c; c < a.c + a.g; c++) if (c >= 0 && r >= 0 && c < C && r < R) yurunebilir[r * C + c] = 1;
  };
  const kapat = (a: KaroAlani) => {
    for (let r = a.r; r < a.r + a.y; r++) for (let c = a.c; c < a.c + a.g; c++) if (c >= 0 && r >= 0 && c < C && r < R) yurunebilir[r * C + c] = 0;
  };

  // İç alan: dış duvarlar (sütun 0 ve 47, son satır) ve üst levha bandı (satır 0-1) hariç
  ac({ c: 1, r: 2, g: C - 2, y: R - 3 });
  // Üst odaların güney duvarı (satır 8) ve oda bölmeleri
  const DUVAR_SATIRI = 8;
  kapat({ c: 1, r: DUVAR_SATIRI, g: C - 2, y: 1 });
  const bolmeler = [9, 18, 31, 39];
  for (const c of bolmeler) kapat({ c, r: 0, g: 1, y: DUVAR_SATIRI + 1 });
  const odaKapilari: [number, number][] = [
    [4, 5],
    [13, 14],
    [24, 25],
    [35, 36],
    [43, 44],
  ];
  for (const [a, b] of odaKapilari) ac({ c: a, r: DUVAR_SATIRI, g: b - a + 1, y: 1 });
  // Giriş kapısı (alt duvar)
  const girisC = 42;
  const kapi: Karo = { c: girisC, r: R - 1 };
  ac({ c: girisC, r: R - 1, g: 2, y: 1 });

  // ---------------- Duvarlar ----------------
  const yarim = KARO / 2;
  const sol = yarim;
  const sag = C * KARO - yarim;
  const odaAlt = DUVAR_SATIRI * KARO + yarim;
  const altDuvar = (R - 1) * KARO + yarim;
  const duvarlar: Cizgi[] = [];
  const kasalar: Nokta[] = [];
  duvarlar.push({ x1: sol, y1: 0, x2: sol, y2: altDuvar }, { x1: sag, y1: 0, x2: sag, y2: altDuvar });
  const girisSol = girisC * KARO;
  const girisSag = (girisC + 2) * KARO;
  duvarlar.push({ x1: sol, y1: altDuvar, x2: girisSol, y2: altDuvar }, { x1: girisSag, y1: altDuvar, x2: sag, y2: altDuvar });
  kasalar.push({ x: girisSol, y: altDuvar }, { x: girisSag, y: altDuvar });
  let x = sol;
  for (const [a, b] of odaKapilari) {
    duvarlar.push({ x1: x, y1: odaAlt, x2: a * KARO, y2: odaAlt });
    kasalar.push({ x: a * KARO, y: odaAlt }, { x: (b + 1) * KARO, y: odaAlt });
    x = (b + 1) * KARO;
  }
  duvarlar.push({ x1: x, y1: odaAlt, x2: sag, y2: odaAlt });
  for (const c of bolmeler) duvarlar.push({ x1: c * KARO + yarim, y1: 0, x2: c * KARO + yarim, y2: odaAlt });

  // ---------------- Odalar ----------------
  const ODA_Y = DUVAR_SATIRI - 2;
  const odalar: Oda[] = [
    { kimlik: "ceo", ad: "CEO", alt: "yönetim", alan: { c: 1, r: 2, g: 8, y: ODA_Y }, zemin: "ahsap", levha: true },
    { kimlik: "cto", ad: "CTO", alt: "teknik yönetim", alan: { c: 10, r: 2, g: 8, y: ODA_Y }, zemin: "ahsap", levha: true },
    { kimlik: "toplanti", ad: "Toplantı", alt: "#toplanti", alan: { c: 19, r: 2, g: 12, y: ODA_Y }, zemin: "hali", levha: true },
    { kimlik: "arsiv", ad: "Arşiv", alt: "proje hafızası · notlar", alan: { c: 32, r: 2, g: 7, y: ODA_Y }, zemin: "ahsap", levha: true },
    { kimlik: "sunucu", ad: "Sunucu", alt: "main dalı", alan: { c: 40, r: 2, g: 7, y: ODA_Y }, zemin: "yukseltilmis", levha: true },
    {
      kimlik: "muhendislik",
      ad: "Mühendislik",
      alt: "açık ofis",
      alan: { c: 1, r: 11, g: 27, y: R - 12 },
      zemin: "acik",
      levha: false,
      etiket: { x: 1.5 * KARO, y: 11.95 * KARO },
    },
    { kimlik: "dinlenme", ad: "Dinlenme", alt: "kahve · su · sohbet", alan: { c: 29, r: 11, g: 18, y: 7 }, zemin: "kilim", levha: false, etiket: { x: 40.4 * KARO, y: 17.15 * KARO } },
    { kimlik: "kurul", ad: "Kurul", alt: "onay masası · giriş", alan: { c: 29, r: 18 + alt, g: 18, y: 8 }, zemin: "acik", levha: false },
  ];

  // ---------------- Eşyalar ----------------
  const esyalar: EsyaYeri[] = [];
  let sayac = 0;
  const yerlestir = (
    esya: EsyaAdi,
    ayakX: number,
    ayakY: number,
    genislik: number,
    ek: Partial<Omit<EsyaYeri, "esya" | "x" | "y" | "genislik" | "yukseklik">> = {},
  ): EsyaYeri => {
    const e: EsyaYeri = {
      kimlik: ek.kimlik ?? `${esya}-${sayac++}`,
      esya,
      x: ayakX,
      y: ayakY,
      genislik,
      yukseklik: genislik * oranlar[esya],
      golge: 0.8,
      ...ek,
    };
    esyalar.push(e);
    if (e.engel) kapat(e.engel);
    return e;
  };

  const masalar: Masa[] = [];
  const MASA_G = 96;
  const masaKur = (kimlik: string, oda: Masa["oda"], c: number, r: number) => {
    // Masa ayak izi: c..c+2, r..r+1; arkasında (kuzeyinde) sandalye ve oturma yeri
    const ayakY = (r + 2) * KARO;
    const solX = c * KARO;
    const h = MASA_G * oranlar.masa;
    const ust = ayakY - h;
    const oturmaX = solX + MASA_G * 0.82;
    const arkaKenar = ust + h * 0.22;
    const oturma = { x: oturmaX, y: arkaKenar - KARAKTER_BOYU * OTURMA_GORUNUR + KARAKTER_BOYU };
    yerlestir("sandalye", oturmaX, ust + h * 0.5, 40, { kimlik: `${kimlik}-sandalye`, golge: 0 });
    const m = yerlestir("masa", solX + MASA_G / 2, ayakY, MASA_G, { kimlik: `${kimlik}-masa`, engel: { c, r, g: 3, y: 2 }, golge: 0.9 });
    masalar.push({
      kimlik,
      oda,
      esyaKimligi: m.kimlik,
      oturma,
      yaklasma: { c: Math.floor(oturmaX / KARO), r: r - 1 },
      kesit: ust + h * 0.56,
      monitor: { x: solX + MASA_G * 0.2, y: ust + h * 0.05, g: MASA_G * 0.52, h: h * 0.33 },
      ust: { x: solX + MASA_G * 0.46, y: ust },
    });
  };

  // CEO odası
  masaKur("ceo", "ceo", 3, 4);
  yerlestir("kitaplik", 2 * KARO, 4 * KARO, 60, { engel: { c: 1, r: 2, g: 2, y: 2 } });
  yerlestir("bitki-buyuk", 8 * KARO + 4, 4 * KARO, 48, { engel: { c: 8, r: 3, g: 1, y: 1 } });
  yerlestir("lamba", 7.6 * KARO, 5.9 * KARO, 54, { engel: { c: 7, r: 5, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 1.6 * KARO, 7.9 * KARO, 30, { engel: { c: 1, r: 7, g: 1, y: 1 } });

  // CTO odası
  masaKur("cto", "cto", 12, 4);
  yerlestir("kitaplik", 17 * KARO, 4 * KARO, 60, { engel: { c: 16, r: 2, g: 2, y: 2 } });
  yerlestir("bitki-buyuk", 10.5 * KARO, 4 * KARO, 48, { engel: { c: 10, r: 3, g: 1, y: 1 } });
  yerlestir("lamba", 10.6 * KARO, 6.9 * KARO, 50, { engel: { c: 10, r: 6, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 17.4 * KARO, 7.9 * KARO, 30, { engel: { c: 17, r: 7, g: 1, y: 1 } });

  // Toplantı odası: oval masa, arkasında üç koltuk, sağ köşede beyaz tahta
  const tmG = 176;
  const tmH = tmG * oranlar["toplanti-masasi"];
  const tmX = 25 * KARO;
  const tmAyak = 6.4 * KARO;
  const tmUst = tmAyak - tmH;
  const toplantiKoltuklari: Koltuk[] = [];
  for (const [oran, arka] of [
    [0.3, 0.17],
    [0.5, 0.09],
    [0.7, 0.04],
  ] as const) {
    const kx = tmX - tmG / 2 + tmG * oran;
    const arkaKenar = tmUst + tmH * arka;
    yerlestir("sandalye", kx, tmUst + tmH * 0.32, 40, { kimlik: `toplanti-sandalye-${oran}`, golge: 0 });
    toplantiKoltuklari.push({
      oturma: { x: kx, y: arkaKenar - KARAKTER_BOYU * OTURMA_GORUNUR + KARAKTER_BOYU },
      yaklasma: { c: Math.floor(kx / KARO), r: 3 },
      kesit: tmUst + tmH * 0.6,
    });
  }
  yerlestir("toplanti-masasi", tmX, tmAyak, tmG, { kimlik: "toplanti-masasi", engel: { c: 22, r: 4, g: 6, y: 2 }, sicak: "toplanti", golge: 0.9 });
  yerlestir("beyaz-tahta", 29.4 * KARO, 4 * KARO, 90, { engel: { c: 28, r: 2, g: 3, y: 2 } });
  yerlestir("bitki-buyuk", 19.6 * KARO, 4 * KARO, 46, { engel: { c: 19, r: 3, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 30.4 * KARO, 7.9 * KARO, 28, { engel: { c: 30, r: 7, g: 1, y: 1 } });
  const toplantiAyakta: Karo[] = [
    { c: 21, r: 5 },
    { c: 28, r: 5 },
    { c: 21, r: 4 },
    { c: 28, r: 4 },
    { c: 23, r: 7 },
    { c: 26, r: 7 },
    { c: 22, r: 7 },
    { c: 27, r: 7 },
  ];

  // Arşiv: duvar boyunca üç kitaplık, ortada iki raf daha
  const arsivKimligi = "arsiv-raf-orta";
  yerlestir("kitaplik", 33 * KARO, 4 * KARO, 58, { engel: { c: 32, r: 2, g: 2, y: 2 }, sicak: "arsiv" });
  yerlestir("kitaplik", 35 * KARO + 16, 4 * KARO, 58, { kimlik: arsivKimligi, engel: { c: 34, r: 2, g: 3, y: 2 }, sicak: "arsiv" });
  yerlestir("kitaplik", 38 * KARO, 4 * KARO, 58, { engel: { c: 37, r: 2, g: 2, y: 2 }, sicak: "arsiv" });
  yerlestir("kitaplik", 34 * KARO, 7 * KARO, 58, { engel: { c: 33, r: 5, g: 2, y: 2 }, sicak: "arsiv" });
  yerlestir("kitaplik", 37 * KARO, 7 * KARO, 58, { engel: { c: 36, r: 5, g: 2, y: 2 }, sicak: "arsiv" });
  const arsivOnu: Karo[] = [
    { c: 35, r: 4 },
    { c: 36, r: 4 },
    { c: 34, r: 4 },
  ];

  // Sunucu odası: üç dolap
  const sunucuKimlikleri: string[] = [];
  for (const [i, c] of [40, 42, 44].entries()) {
    const e = yerlestir("sunucu", (c + 1) * KARO, 4.2 * KARO, 60, { kimlik: `sunucu-${i}`, engel: { c, r: 2, g: 2, y: 2 }, sicak: "sunucu" });
    sunucuKimlikleri.push(e.kimlik);
  }
  yerlestir("bitki-kucuk", 46.4 * KARO, 7.9 * KARO, 28, { engel: { c: 46, r: 7, g: 1, y: 1 } });
  yerlestir("lamba", 40.5 * KARO, 7.9 * KARO, 48, { engel: { c: 40, r: 7, g: 1, y: 1 } });
  const sunucuOnu: Karo[] = [
    { c: 43, r: 5 },
    { c: 41, r: 5 },
    { c: 45, r: 5 },
  ];

  // Mühendislik: pano tahtası ve masa adaları
  const panoG = 12 * KARO;
  const pano = { x: 14.5 * KARO, y: 13 * KARO, genislik: panoG, yukseklik: 118, engel: { c: 8, r: 12, g: 13, y: 1 } };
  kapat(pano.engel);
  let masaNo = 0;
  for (let ada = 0; ada < adaSayisi; ada++) {
    const satir = Math.floor(ada / SATIR_ADA);
    const sutun = ada % SATIR_ADA;
    const c0 = sutun === 0 ? 4 : 16;
    const r0 = 15 + satir * 5;
    for (let i = 0; i < ADA_MASA; i++) masaKur(`m${masaNo++}`, "muhendislik", c0 + i * 3, r0);
  }
  // Mühendislik ile sağ bölüm arasında saksı sırası
  for (let r = 13; r < R - 3; r += 5) yerlestir("bitki-buyuk", 28.5 * KARO, (r + 1) * KARO, 44, { engel: { c: 28, r, g: 1, y: 1 } });
  // Açık ofisin köşeleri
  yerlestir("bitki-buyuk", 1.9 * KARO, (R - 1.1) * KARO, 46, { engel: { c: 1, r: R - 2, g: 2, y: 1 } });
  yerlestir("bitki-kucuk", 26.5 * KARO, (R - 1.15) * KARO, 30, { engel: { c: 26, r: R - 2, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 2.2 * KARO, 13.9 * KARO, 30, { engel: { c: 2, r: 13, g: 1, y: 1 } });
  yerlestir("lamba", 26.5 * KARO, 12.9 * KARO, 50, { engel: { c: 26, r: 12, g: 1, y: 1 } });

  // Dinlenme: kanepe, lamba, kahve makinesi, su sebili, bitkiler
  yerlestir("kanepe", 37.5 * KARO, 14 * KARO, 150, { engel: { c: 35, r: 12, g: 5, y: 2 }, golge: 0.95 });
  yerlestir("lamba", 41.3 * KARO, 13.85 * KARO, 54, { engel: { c: 41, r: 13, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 33.6 * KARO, 13.9 * KARO, 30, { engel: { c: 33, r: 13, g: 1, y: 1 } });
  yerlestir("kahve", 44 * KARO, 13 * KARO, 48, { engel: { c: 43, r: 12, g: 2, y: 1 } });
  yerlestir("su", 46.5 * KARO, 16 * KARO, 24, { engel: { c: 46, r: 15, g: 1, y: 1 } });
  yerlestir("bitki-buyuk", 46.4 * KARO, 12.2 * KARO, 44, { engel: { c: 46, r: 11, g: 1, y: 1 } });
  yerlestir("bitki-buyuk", 30.5 * KARO, 12.2 * KARO, 44, { engel: { c: 30, r: 11, g: 1, y: 1 } });
  yerlestir("kitaplik", 31.8 * KARO, 13 * KARO, 52, { engel: { c: 31, r: 12, g: 2, y: 1 } });
  // Kanepenin önünde alçak sehpa
  yerlestir("toplanti-masasi", 37.5 * KARO, 15.75 * KARO, 76, { kimlik: "sehpa", engel: { c: 36, r: 15, g: 3, y: 1 }, golge: 0.85 });

  // Ofis uzadıkça dinlenme ile kurul arasındaki boşluğa okuma köşeleri
  for (let i = 0; i + 5 <= alt; i += 5) {
    const r = 18 + i;
    yerlestir("kanepe", 38 * KARO, (r + 3) * KARO, 128, { engel: { c: 36, r: r + 1, g: 4, y: 2 }, golge: 0.95 });
    yerlestir("lamba", 41.6 * KARO, (r + 2.85) * KARO, 50, { engel: { c: 41, r: r + 2, g: 1, y: 1 } });
    yerlestir("bitki-buyuk", 33.8 * KARO, (r + 3) * KARO, 44, { engel: { c: 33, r: r + 2, g: 1, y: 1 } });
    yerlestir("kitaplik", 44.6 * KARO, (r + 3) * KARO, 52, { engel: { c: 44, r: r + 2, g: 2, y: 1 } });
  }

  // Kurul masası (onay masası), arkasında kurulun boş koltuğu
  const kmG = 128;
  const kmH = kmG * oranlar["toplanti-masasi"];
  const kmX = 36 * KARO;
  const kmAyak = (21 + alt) * KARO;
  yerlestir("sandalye", kmX, kmAyak - kmH + kmH * 0.3, 42, { kimlik: "kurul-koltugu", golge: 0 });
  const kurulMasasiKimligi = "kurul-masasi";
  yerlestir("toplanti-masasi", kmX, kmAyak, kmG, { kimlik: kurulMasasiKimligi, engel: { c: 34, r: 19 + alt, g: 4, y: 2 }, sicak: "kurul", golge: 0.9 });
  yerlestir("lamba", 31.3 * KARO, (20.8 + alt) * KARO, 52, { engel: { c: 31, r: 20 + alt, g: 1, y: 1 } });
  yerlestir("bitki-buyuk", 39.6 * KARO, (25.9 + alt) * KARO, 44, { engel: { c: 39, r: 25 + alt, g: 1, y: 1 } });
  yerlestir("bitki-buyuk", 46.4 * KARO, (25.9 + alt) * KARO, 44, { engel: { c: 46, r: 25 + alt, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 30 * KARO, (25.8 + alt) * KARO, 30, { engel: { c: 29, r: 25 + alt, g: 2, y: 1 } });
  yerlestir("bitki-buyuk", 46.4 * KARO, (19.2 + alt) * KARO, 44, { engel: { c: 46, r: 18 + alt, g: 1, y: 1 } });
  // Karar bekleyenler masanın iki yanında sıraya girer; ışıklar önden görünür kalır
  const kurulBekleme: Karo[] = [
    { c: 38, r: 20 + alt },
    { c: 33, r: 20 + alt },
    { c: 39, r: 20 + alt },
    { c: 32, r: 20 + alt },
    { c: 38, r: 21 + alt },
    { c: 33, r: 21 + alt },
    { c: 39, r: 21 + alt },
    { c: 32, r: 21 + alt },
    { c: 40, r: 20 + alt },
    { c: 40, r: 21 + alt },
  ];

  const dinlenme: Karo[] = [];
  for (let r = 15; r <= 17; r++) for (let c = 31; c <= 40; c++) dinlenme.push({ c, r });
  for (let r = 14; r <= 16; r++) for (let c = 41; c <= 44; c++) dinlenme.push({ c, r });

  const yerlesim: Yerlesim = {
    sutun: C,
    satir: R,
    genislik: C * KARO,
    yukseklik: R * KARO,
    odalar,
    duvarlar,
    kasalar,
    esyalar,
    masalar,
    kilimler: [
      { alan: { c: 31, r: 14, g: 15, y: 4 }, tur: "kilim" },
      { alan: { c: 2, r: 3, g: 6, y: 4 }, tur: "koyu" },
      { alan: { c: 11, r: 3, g: 6, y: 4 }, tur: "koyu" },
      { alan: { c: 3, r: 14, g: 23, y: R - 15 }, tur: "koyu" },
      { alan: { c: 31, r: 18 + alt, g: 10, y: 5 }, tur: "kurul" },
    ],
    yurunebilir,
    noktalar: {
      kapi,
      kapiIci: { c: girisC, r: R - 3 },
      kurulMasasiKimligi,
      kurulBekleme,
      kahve: { c: 42, r: 12 },
      su: { c: 45, r: 15 },
      kanepeOnu: [
        { c: 35, r: 14 },
        { c: 37, r: 14 },
        { c: 39, r: 14 },
      ],
      dinlenme,
      toplantiKoltuklari,
      toplantiAyakta,
      toplantiAlani: { c: 19, r: 2, g: 12, y: ODA_Y },
      sunucuOnu,
      sunucuKimlikleri,
      arsivOnu,
      arsivKimligi,
      adaylar: [
        { c: 41, r: R - 4 },
        { c: 44, r: R - 4 },
        { c: 45, r: R - 3 },
      ],
      pano,
      paspas: { c: girisC - 1, r: R - 3, g: 4, y: 2 },
    },
  };
  // Dinlenme noktalarından yürünemeyenleri at
  yerlesim.noktalar.dinlenme = dinlenme.filter((k) => yurunebilirMi(yerlesim, k));
  return yerlesim;
}

export function yurunebilirMi(y: Pick<Yerlesim, "sutun" | "satir" | "yurunebilir">, k: Karo): boolean {
  return k.c >= 0 && k.r >= 0 && k.c < y.sutun && k.r < y.satir && y.yurunebilir[k.r * y.sutun + k.c] === 1;
}
