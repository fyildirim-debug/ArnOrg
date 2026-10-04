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

export type OdaKimligi =
  | "ceo"
  | "cto"
  | "toplanti"
  | "arsiv"
  | "sunucu"
  | "muhendislik"
  | "dinlenme"
  | "kurul"
  /** Doğu kanadı: araştırma kütüphanesi, test laboratuvarı, sunum ve tasarım stüdyosu */
  | "arastirma"
  | "laboratuvar"
  | "studyo";
export type ZeminTuru = "oda" | "hali" | "ahsap" | "yukseltilmis" | "acik" | "kilim" | "karo" | "sahne";
/** Tıklanınca başka ekrana götüren sahne öğeleri */
export type SicakNokta = "kurul" | "pano" | "sunucu" | "arsiv" | "toplanti" | "arastirma" | "laboratuvar" | "studyo";

export interface Oda {
  /** Levhadaki ya da zemindeki ad ve alt yazı sözlükten bu kimlikle gelir (s.ofis.odalar) */
  kimlik: OdaKimligi;
  alan: KaroAlani;
  zemin: ZeminTuru;
  /** Üst duvarı (levha bandı) olan odalar */
  levha: boolean;
  /** Levhasız odada zemin yazısının sol alt noktası; yoksa yazı çizilmez */
  etiket?: Nokta;
  /** İç duvara asılı kapı levhasının ortası (kanat odaları); levha bandı olmayan odaların adı burada okunur */
  kapiLevhasi?: Nokta;
}

export interface Cizgi {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Kapı kasası: yatay duvardaki kapıda dik, dikey duvardaki kapıda yatık çizilir */
export interface Kasa extends Nokta {
  yatay?: boolean;
}

/** Sahnedeki ayaklı ekran ya da tahta: ayak ortası, boyut ve ayaklarının kapattığı karolar */
export interface Pano {
  x: number;
  y: number;
  genislik: number;
  yukseklik: number;
  engel: KaroAlani;
}

/** Kanat odalarındaki çalışma istasyonu: masa, sandalye ve monitör (test istasyonu, tasarım masası) */
export interface Istasyon extends Omit<Masa, "oda"> {
  oda: "laboratuvar" | "studyo";
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
  /** Monitörün kasası, dünya pikseli. Oturan masanın arkasında izleyiciye dönük oturur; ekran ona bakar,
   * izleyici monitörün arkasını görür. Araç simgesi kasanın üst kenarında, oturanın yanında durur. */
  monitor: { x: number; y: number; g: number; h: number };
  /** Ekran ışığının düştüğü yer: oturanın yüzü ve göğsü (masanın arkasında, kasanın sağ üstü) */
  isik: { x: number; y: number; g: number; h: number };
  /** Masanın üst kenarı (saat için) */
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
  kasalar: Kasa[];
  esyalar: EsyaYeri[];
  masalar: Masa[];
  /** Kanat odalarındaki istasyonlar (masa ataması dışında; işe göre oturulur) */
  istasyonlar: Istasyon[];
  /** Zemin kilimleri ve işaretli alanlar */
  kilimler: { alan: KaroAlani; tur: "kilim" | "koyu" | "kurul" | "sahne" }[];
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
    /** Görev panosunun önü (pano işleri) */
    panoOnu: Karo[];
    /** Toplantı odasındaki beyaz tahtanın önü (rapor) */
    beyazTahtaOnu: Karo[];
    beyazTahtaKimligi: string;
    /** Okuma köşesi: dinlenme alanındaki kitaplığın ve okuma kanepelerinin önü (kitap seven boştakiler) */
    okumaKosesi: Karo[];
    okumaKimligi: string;
    adaylar: Karo[];
    /** Pano tahtasının ayak ortası ve boyutu */
    pano: Pano;
    /** Kapı paspası (zemin işareti) */
    paspas: KaroAlani;
    /** Giriş kapısının kanatları: iki kasa arasının ortası (dünya pikseli) ve genişliği */
    girisKapisi: { x: number; y: number; genislik: number };

    // ---- Doğu kanadı ----
    /** Kütüphane: okuma masalarının koltukları (web araştırması) */
    arastirmaKoltuklari: Koltuk[];
    /** Kütüphane: rafların ve ekranın önü (koltuk boş değilse ayakta) */
    arastirmaOnu: Karo[];
    /** Kütüphanenin büyük ekranı: son araştırmanın sorgusu */
    arastirmaEkrani: Pano;
    /** Dünya küresinin ayak noktası */
    kure: Nokta;
    /** Test laboratuvarı: test cihazlarının (dolap) ve panonun önü */
    labOnu: Karo[];
    /** Test panosu: büyük durum ışığı ve son komut */
    testPanosu: Pano;
    /** Test cihazı olarak duran dolapların kimlikleri (ışıkları motor çizer) */
    testCihazlari: string[];
    /** Stüdyo: sunum ekranı (teslim ve demo) */
    sunumEkrani: Pano;
    /** Sunan kişinin durduğu yer: ekranın yanında, kurula (izleyene) dönük */
    sunumNoktasi: Karo;
    /** Stüdyodaki taslak tahtasının önü */
    studyoOnu: Karo[];
    /** Dışarıdan kanada açılan kapılar (kanat duvarındaki boşlukların içi) */
    kanatKapilari: Karo[];
  };
}

/** Ana binanın sütun sayısı: 0 ve 47 duvar; doğu kanadı 47. sütundaki duvarın ardından başlar */
export const ANA_SUTUN = 48;
/** Doğu kanadının iç genişliği (karo) */
export const KANAT_SUTUN = 15;

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
 *
 * Satırlar: 0-1 duvar levhası, 2-7 üst odalar, 8 duvar, 9-10 koridor, 11'den sonrası açık ofis (solda),
 * dinlenme ve kurul/giriş (sağda). Ada satırı arttıkça ofis aşağı uzar; giriş ve kurul en altta kalır.
 *
 * Doğu kanadı (sütun 48'den sonrası) ana binanın yanına eklenir; ana binada hiçbir şeyin yeri değişmez (kamera ve
 * masa ataması aynı kalır). Kanatta yukarıdan aşağı: kütüphane (koridora açılır), kanat koridoru, test laboratuvarı
 * (dinlenmeye ve koridora açılır), sunum ve tasarım stüdyosu (kurul alanına ve laboratuvara açılır).
 */
export function yerlesimKur(muhendisMasasi: number, oranlar: EsyaOranlari = VARSAYILAN_ORANLAR): Yerlesim {
  const adaSayisi = Math.ceil(Math.max(EN_AZ_MASA, muhendisMasasi) / ADA_MASA);
  const adaSatiri = Math.ceil(adaSayisi / SATIR_ADA);
  /** Kanat duvarı (ana binanın eski doğu duvarı) */
  const KANAT_DUVARI = ANA_SUTUN - 1;
  /** Kanadın ilk ve son iç sütunu */
  const K0 = ANA_SUTUN;
  const C = ANA_SUTUN + KANAT_SUTUN + 1;
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

  // İç alan: dış duvarlar (ilk ve son sütun, son satır) ve üst levha bandı (satır 0-1) hariç
  ac({ c: 1, r: 2, g: C - 2, y: R - 3 });
  // Üst odaların güney duvarı (satır 8) ve oda bölmeleri
  const DUVAR_SATIRI = 8;
  kapat({ c: 1, r: DUVAR_SATIRI, g: C - 2, y: 1 });
  const bolmeler = [9, 18, 31, 39];
  for (const c of bolmeler) kapat({ c, r: 0, g: 1, y: DUVAR_SATIRI + 1 });
  /** Kanat odalarının kapı sütunları: kütüphane ve laboratuvar ortadan, stüdyo soldan açılır */
  const KANAT_KAPI = 54;
  const STUDYO_KAPI = 50;
  const odaKapilari: [number, number][] = [
    [4, 5],
    [13, 14],
    [24, 25],
    [35, 36],
    [43, 44],
    [KANAT_KAPI, KANAT_KAPI + 1],
  ];
  for (const [a, b] of odaKapilari) ac({ c: a, r: DUVAR_SATIRI, g: b - a + 1, y: 1 });
  // Giriş kapısı (alt duvar)
  const girisC = 42;
  const kapi: Karo = { c: girisC, r: R - 1 };
  ac({ c: girisC, r: R - 1, g: 2, y: 1 });

  // Kanat duvarı ve kapıları: koridorun devamı, dinlenmeden laboratuvara, kurul alanından stüdyoya
  /** Stüdyonun ilk satırı (ofis aşağı uzadıkça stüdyo kurul alanıyla birlikte aşağı kayar) */
  const S = 20 + alt;
  const LAB_UST = 12;
  const LAB_ALT = S - 2;
  kapat({ c: KANAT_DUVARI, r: 0, g: 1, y: R });
  const kanatGecitleri: [number, number][] = [
    [9, 10],
    [16, 17],
    [S + 2, S + 3],
  ];
  for (const [a, b] of kanatGecitleri) ac({ c: KANAT_DUVARI, r: a, g: 1, y: b - a + 1 });
  // Laboratuvarın kuzey duvarı (koridordan kapı) ve stüdyonun kuzey duvarı (laboratuvardan kapı)
  kapat({ c: K0, r: LAB_UST - 1, g: KANAT_SUTUN, y: 1 });
  ac({ c: KANAT_KAPI, r: LAB_UST - 1, g: 2, y: 1 });
  kapat({ c: K0, r: S - 1, g: KANAT_SUTUN, y: 1 });
  ac({ c: STUDYO_KAPI, r: S - 1, g: 2, y: 1 });

  // ---------------- Duvarlar ----------------
  const yarim = KARO / 2;
  const sol = yarim;
  const sag = C * KARO - yarim;
  const odaAlt = DUVAR_SATIRI * KARO + yarim;
  const altDuvar = (R - 1) * KARO + yarim;
  const duvarlar: Cizgi[] = [];
  const kasalar: Kasa[] = [];
  duvarlar.push({ x1: sol, y1: 0, x2: sol, y2: altDuvar }, { x1: sag, y1: 0, x2: sag, y2: altDuvar });
  const girisSol = girisC * KARO;
  const girisSag = (girisC + 2) * KARO;
  duvarlar.push({ x1: sol, y1: altDuvar, x2: girisSol, y2: altDuvar }, { x1: girisSag, y1: altDuvar, x2: sag, y2: altDuvar });
  kasalar.push({ x: girisSol, y: altDuvar }, { x: girisSag, y: altDuvar });
  /** Yatay duvar: verilen kapı boşluklarıyla x1'den x2'ye */
  const yatayDuvar = (y: number, x1: number, x2: number, kapilar: [number, number][]) => {
    let x = x1;
    for (const [a, b] of kapilar) {
      duvarlar.push({ x1: x, y1: y, x2: a * KARO, y2: y });
      kasalar.push({ x: a * KARO, y }, { x: (b + 1) * KARO, y });
      x = (b + 1) * KARO;
    }
    duvarlar.push({ x1: x, y1: y, x2: x2, y2: y });
  };
  yatayDuvar(odaAlt, sol, sag, odaKapilari);
  for (const c of bolmeler) duvarlar.push({ x1: c * KARO + yarim, y1: 0, x2: c * KARO + yarim, y2: odaAlt });
  // Kanat duvarı: üstten alta, geçitlerde boşluk
  const kanatX = KANAT_DUVARI * KARO + yarim;
  let ky = 0;
  for (const [a, b] of kanatGecitleri) {
    duvarlar.push({ x1: kanatX, y1: ky, x2: kanatX, y2: a * KARO });
    kasalar.push({ x: kanatX, y: a * KARO, yatay: true }, { x: kanatX, y: (b + 1) * KARO, yatay: true });
    ky = (b + 1) * KARO;
  }
  duvarlar.push({ x1: kanatX, y1: ky, x2: kanatX, y2: altDuvar });
  yatayDuvar((LAB_UST - 1) * KARO + yarim, kanatX, sag, [[KANAT_KAPI, KANAT_KAPI + 1]]);
  yatayDuvar((S - 1) * KARO + yarim, kanatX, sag, [[STUDYO_KAPI, STUDYO_KAPI + 1]]);

  // ---------------- Odalar ----------------
  const ODA_Y = DUVAR_SATIRI - 2;
  const odalar: Oda[] = [
    { kimlik: "ceo", alan: { c: 1, r: 2, g: 8, y: ODA_Y }, zemin: "ahsap", levha: true },
    { kimlik: "cto", alan: { c: 10, r: 2, g: 8, y: ODA_Y }, zemin: "ahsap", levha: true },
    { kimlik: "toplanti", alan: { c: 19, r: 2, g: 12, y: ODA_Y }, zemin: "hali", levha: true },
    { kimlik: "arsiv", alan: { c: 32, r: 2, g: 7, y: ODA_Y }, zemin: "ahsap", levha: true },
    { kimlik: "sunucu", alan: { c: 40, r: 2, g: 7, y: ODA_Y }, zemin: "yukseltilmis", levha: true },
    {
      kimlik: "muhendislik",
      alan: { c: 1, r: 11, g: 27, y: R - 12 },
      zemin: "acik",
      levha: false,
      etiket: { x: 1.5 * KARO, y: 11.95 * KARO },
    },
    { kimlik: "dinlenme", alan: { c: 29, r: 11, g: 18, y: 7 }, zemin: "kilim", levha: false, etiket: { x: 40.4 * KARO, y: 17.15 * KARO } },
    { kimlik: "kurul", alan: { c: 29, r: 18 + alt, g: 18, y: 8 }, zemin: "acik", levha: false },
    { kimlik: "arastirma", alan: { c: K0, r: 2, g: KANAT_SUTUN, y: ODA_Y }, zemin: "ahsap", levha: true },
    {
      kimlik: "laboratuvar",
      alan: { c: K0, r: LAB_UST, g: KANAT_SUTUN, y: LAB_ALT - LAB_UST + 1 },
      zemin: "karo",
      levha: false,
      // Kapı levhası kapının üstünde: duvar boyunca pano ve test cihazları var
      kapiLevhasi: { x: (KANAT_KAPI + 1) * KARO, y: (LAB_UST - 1) * KARO + yarim },
    },
    {
      kimlik: "studyo",
      alan: { c: K0, r: S, g: KANAT_SUTUN, y: R - 1 - S },
      zemin: "sahne",
      levha: false,
      kapiLevhasi: { x: (STUDYO_KAPI + 1) * KARO, y: (S - 1) * KARO + yarim },
    },
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
  const istasyonlar: Istasyon[] = [];
  const MASA_G = 96;
  /** Masa, sandalye ve monitör; masa ataması olan masalar masalar'a, kanat istasyonları istasyonlar'a girer */
  const masaKur = (kimlik: string, oda: Masa["oda"] | Istasyon["oda"], c: number, r: number) => {
    // Masa ayak izi: c..c+2, r..r+1; arkasında (kuzeyinde) sandalye ve oturma yeri. Oturan izleyiciye dönük,
    // monitörün ekranı ona bakar: görselde monitörün arkası görünür (public/ofis/esyalar/masa.png)
    const ayakY = (r + 2) * KARO;
    const solX = c * KARO;
    const h = MASA_G * oranlar.masa;
    const ust = ayakY - h;
    const oturmaX = solX + MASA_G * 0.82;
    const arkaKenar = ust + h * 0.22;
    const oturma = { x: oturmaX, y: arkaKenar - KARAKTER_BOYU * OTURMA_GORUNUR + KARAKTER_BOYU };
    yerlestir("sandalye", oturmaX, ust + h * 0.5, 40, { kimlik: `${kimlik}-sandalye`, golge: 0 });
    const m = yerlestir("masa", solX + MASA_G / 2, ayakY, MASA_G, { kimlik: `${kimlik}-masa`, engel: { c, r, g: 3, y: 2 }, golge: 0.9 });
    const ortak = {
      kimlik,
      esyaKimligi: m.kimlik,
      oturma,
      yaklasma: { c: Math.floor(oturmaX / KARO), r: r - 1 },
      kesit: ust + h * 0.56,
      // Görseldeki kasa: x 58–238 / 320, y 3–106 / 258
      monitor: { x: solX + MASA_G * 0.18, y: ust + h * 0.012, g: MASA_G * 0.56, h: h * 0.4 },
      isik: { x: solX + MASA_G * 0.5, y: ust - 32, g: MASA_G * 0.56, h: 56 },
      ust: { x: solX + MASA_G * 0.46, y: ust },
    };
    if (oda === "laboratuvar" || oda === "studyo") istasyonlar.push({ ...ortak, oda });
    else masalar.push({ ...ortak, oda });
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
  const beyazTahtaKimligi = "beyaz-tahta";
  yerlestir("beyaz-tahta", 29.4 * KARO, 4 * KARO, 90, { kimlik: beyazTahtaKimligi, engel: { c: 28, r: 2, g: 3, y: 2 } });
  const beyazTahtaOnu: Karo[] = [
    { c: 29, r: 4 },
    { c: 30, r: 4 },
    { c: 28, r: 4 },
  ];
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

  // Arşiv: duvarın iki yanında kitaplık (levha ortada görünür kalsın), ortada iki raf daha
  const arsivKimligi = "arsiv-raf-sol";
  yerlestir("kitaplik", 33 * KARO, 4 * KARO, 58, { kimlik: arsivKimligi, engel: { c: 32, r: 2, g: 2, y: 2 }, sicak: "arsiv" });
  yerlestir("kitaplik", 38 * KARO, 4 * KARO, 58, { engel: { c: 37, r: 2, g: 2, y: 2 }, sicak: "arsiv" });
  yerlestir("bitki-kucuk", 35.5 * KARO, 3.4 * KARO, 26, { engel: { c: 35, r: 2, g: 1, y: 1 } });
  yerlestir("kitaplik", 34 * KARO, 7 * KARO, 58, { engel: { c: 33, r: 5, g: 2, y: 2 }, sicak: "arsiv" });
  yerlestir("kitaplik", 37 * KARO, 7 * KARO, 58, { engel: { c: 36, r: 5, g: 2, y: 2 }, sicak: "arsiv" });
  const arsivOnu: Karo[] = [
    { c: 33, r: 4 },
    { c: 32, r: 4 },
    { c: 37, r: 4 },
  ];

  // Sunucu odası: üç dolap
  const sunucuKimlikleri: string[] = [];
  for (const [i, c] of [40, 42, 44].entries()) {
    const e = yerlestir("sunucu", (c + 1) * KARO, 4.5 * KARO, 60, { kimlik: `sunucu-${i}`, engel: { c, r: 2, g: 2, y: 3 }, sicak: "sunucu" });
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
  // Panonun önündeki sıra: masaların yaklaşma karolarının (satır 14) üstü
  const panoOnu: Karo[] = [11, 14, 17, 9, 19, 12, 16].map((c) => ({ c, r: 13 }));
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
  const okumaKimligi = "okuma-kitapligi";
  yerlestir("kitaplik", 31.8 * KARO, 13 * KARO, 52, { kimlik: okumaKimligi, engel: { c: 31, r: 12, g: 2, y: 1 } });
  const okumaKosesi: Karo[] = [
    { c: 31, r: 13 },
    { c: 32, r: 13 },
    { c: 30, r: 13 },
  ];
  // Kanepenin önünde alçak sehpa
  yerlestir("toplanti-masasi", 37.5 * KARO, 15.75 * KARO, 76, { kimlik: "sehpa", engel: { c: 36, r: 15, g: 3, y: 1 }, golge: 0.85 });

  // Ofis uzadıkça dinlenme ile kurul arasındaki boşluğa okuma köşeleri
  for (let i = 0; i + 5 <= alt; i += 5) {
    const r = 18 + i;
    yerlestir("kanepe", 38 * KARO, (r + 3) * KARO, 128, { engel: { c: 36, r: r + 1, g: 4, y: 2 }, golge: 0.95 });
    yerlestir("lamba", 41.6 * KARO, (r + 2.85) * KARO, 50, { engel: { c: 41, r: r + 2, g: 1, y: 1 } });
    yerlestir("bitki-buyuk", 33.8 * KARO, (r + 3) * KARO, 44, { engel: { c: 33, r: r + 2, g: 1, y: 1 } });
    yerlestir("kitaplik", 44.6 * KARO, (r + 3) * KARO, 52, { engel: { c: 44, r: r + 2, g: 2, y: 1 } });
    okumaKosesi.push({ c: 44, r: r + 3 }, { c: 37, r: r + 3 }, { c: 45, r: r + 3 });
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

  // ---------------- Doğu kanadı ----------------

  // Kütüphane: solda büyük ekran, sağda raflar; ortada iki okuma masası (arkalarında ikişer koltuk), köşede küre.
  // Levha ortada görünür kalsın diye arka duvarın ortası boş; kapı (54-55) ortadan açılır.
  const arastirmaEkrani: Pano = { x: 50.5 * KARO, y: 4 * KARO, genislik: 150, yukseklik: 96, engel: { c: K0, r: 3, g: 5, y: 1 } };
  kapat(arastirmaEkrani.engel);
  yerlestir("kitaplik", 59 * KARO, 4 * KARO, 58, { engel: { c: 58, r: 2, g: 2, y: 2 } });
  yerlestir("kitaplik", 61 * KARO, 4 * KARO, 58, { engel: { c: 60, r: 2, g: 2, y: 2 } });
  yerlestir("bitki-buyuk", 62.5 * KARO, 3.9 * KARO, 40, { engel: { c: 62, r: 3, g: 1, y: 1 } });
  const arastirmaKoltuklari: Koltuk[] = [];
  /** Okuma masası: küçük oval masa, arkasında iki koltuk */
  const okumaMasasi = (cx: number, c0: number) => {
    const g = 104;
    const h = g * oranlar["toplanti-masasi"];
    const ayak = 6.75 * KARO;
    const ustY = ayak - h;
    for (const oran of [0.3, 0.7]) {
      const kx = cx - g / 2 + g * oran;
      yerlestir("sandalye", kx, ustY + h * 0.3, 36, { kimlik: `okuma-sandalye-${c0}-${oran}`, golge: 0 });
      arastirmaKoltuklari.push({
        oturma: { x: kx, y: ustY + h * 0.1 - KARAKTER_BOYU * OTURMA_GORUNUR + KARAKTER_BOYU },
        yaklasma: { c: Math.floor(kx / KARO), r: 4 },
        kesit: ustY + h * 0.6,
      });
    }
    yerlestir("toplanti-masasi", cx, ayak, g, { kimlik: `okuma-masasi-${c0}`, engel: { c: c0, r: 5, g: 4, y: 2 }, golge: 0.85 });
  };
  okumaMasasi(51 * KARO, 49);
  okumaMasasi(59.5 * KARO, 57);
  yerlestir("lamba", 55.6 * KARO, 5.9 * KARO, 44, { engel: { c: 56, r: 5, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 48.6 * KARO, 7.9 * KARO, 28, { engel: { c: K0, r: 7, g: 1, y: 1 } });
  const kure: Nokta = { x: 61.6 * KARO, y: 7.75 * KARO };
  kapat({ c: 61, r: 7, g: 1, y: 1 });
  const arastirmaOnu: Karo[] = [
    { c: 59, r: 4 },
    { c: 61, r: 4 },
    { c: 53, r: 4 },
    { c: 49, r: 4 },
    { c: 55, r: 4 },
  ];

  // Test laboratuvarı: arka duvarda durum panosu ve test cihazları, ortada üç test istasyonu
  const testPanosu: Pano = { x: 50.5 * KARO, y: 14 * KARO, genislik: 140, yukseklik: 86, engel: { c: K0, r: LAB_UST + 1, g: 5, y: 1 } };
  kapat(testPanosu.engel);
  const testCihazlari: string[] = [];
  for (const [i, c] of [57, 59].entries()) {
    const e = yerlestir("sunucu", (c + 1) * KARO, 14 * KARO, 52, { kimlik: `test-cihazi-${i}`, engel: { c, r: LAB_UST, g: 2, y: 2 } });
    testCihazlari.push(e.kimlik);
  }
  yerlestir("bitki-buyuk", 62.4 * KARO, 13.9 * KARO, 40, { engel: { c: 62, r: LAB_UST + 1, g: 1, y: 1 } });
  for (const [i, c] of [49, 53, 57].entries()) masaKur(`lab-${i}`, "laboratuvar", c, 15);
  yerlestir("lamba", 61.4 * KARO, 16.9 * KARO, 46, { engel: { c: 61, r: 16, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 62.4 * KARO, (LAB_ALT + 0.9) * KARO, 28, { engel: { c: 62, r: LAB_ALT, g: 1, y: 1 } });
  const labOnu: Karo[] = [
    { c: 58, r: 14 },
    { c: 60, r: 14 },
    { c: 50, r: 14 },
    { c: 49, r: 14 },
  ];

  // Stüdyo: sağda sahne ve sunum ekranı, en sağda taslak tahtası, solda tasarım masası
  const sunumEkrani: Pano = { x: 57 * KARO, y: (S + 1.75) * KARO, genislik: 168, yukseklik: 92, engel: { c: 54, r: S + 1, g: 6, y: 1 } };
  kapat(sunumEkrani.engel);
  yerlestir("beyaz-tahta", 61.9 * KARO, (S + 2) * KARO, 64, { kimlik: "studyo-tahta", engel: { c: 61, r: S, g: 2, y: 2 } });
  masaKur("tasarim-0", "studyo", 49, S + 3);
  yerlestir("bitki-buyuk", 48.6 * KARO, (S + 0.95) * KARO, 40, { engel: { c: K0, r: S, g: 1, y: 1 } });
  yerlestir("lamba", 60.5 * KARO, (S + 4.9) * KARO, 46, { engel: { c: 60, r: S + 4, g: 1, y: 1 } });
  yerlestir("bitki-kucuk", 62.4 * KARO, (S + 4.9) * KARO, 28, { engel: { c: 62, r: S + 4, g: 1, y: 1 } });
  const sunumNoktasi: Karo = { c: 53, r: S + 2 };
  const studyoOnu: Karo[] = [
    { c: 61, r: S + 2 },
    { c: 62, r: S + 2 },
    { c: 60, r: S + 2 },
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
    istasyonlar,
    kilimler: [
      { alan: { c: 31, r: 14, g: 15, y: 4 }, tur: "kilim" },
      { alan: { c: 2, r: 3, g: 6, y: 4 }, tur: "koyu" },
      { alan: { c: 11, r: 3, g: 6, y: 4 }, tur: "koyu" },
      { alan: { c: 3, r: 14, g: 23, y: 5 * adaSatiri }, tur: "koyu" },
      { alan: { c: 31, r: 18 + alt, g: 10, y: 5 }, tur: "kurul" },
      { alan: { c: 49, r: 4, g: 13, y: 4 }, tur: "kilim" },
      { alan: { c: K0, r: 14, g: 13, y: 4 }, tur: "koyu" },
      { alan: { c: 52, r: S, g: 9, y: 4 }, tur: "sahne" },
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
      panoOnu,
      beyazTahtaOnu,
      beyazTahtaKimligi,
      okumaKosesi,
      okumaKimligi,
      adaylar: [
        { c: 41, r: R - 4 },
        { c: 44, r: R - 4 },
        { c: 45, r: R - 3 },
      ],
      pano,
      paspas: { c: girisC - 1, r: R - 3, g: 4, y: 2 },
      girisKapisi: { x: (girisSol + girisSag) / 2, y: altDuvar, genislik: girisSag - girisSol },
      arastirmaKoltuklari,
      arastirmaOnu,
      arastirmaEkrani,
      kure,
      labOnu,
      testPanosu,
      testCihazlari,
      sunumEkrani,
      sunumNoktasi,
      studyoOnu,
      kanatKapilari: kanatGecitleri.map(([a]) => ({ c: KANAT_DUVARI, r: a })),
    },
  };
  // Dinlenme noktalarından yürünemeyenleri at
  yerlesim.noktalar.dinlenme = dinlenme.filter((k) => yurunebilirMi(yerlesim, k));
  return yerlesim;
}

export function yurunebilirMi(y: Pick<Yerlesim, "sutun" | "satir" | "yurunebilir">, k: Karo): boolean {
  return k.c >= 0 && k.r >= 0 && k.c < y.sutun && k.r < y.satir && y.yurunebilir[k.r * y.sutun + k.c] === 1;
}
