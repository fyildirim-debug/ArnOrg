// Ofis motoru: React dışında çalışan canlı sahne. Karakterler, davranışlar, sahneler (üreteç işlevleri),
// balonlar, efektler, kamera (takip ve canlı yayın) ve requestAnimationFrame döngüsü. React yalnız veri ve olay
// iletir; her karede React durumu güncellenmez, konumlar doğrudan transform ile yazılır.
//
// Motor proje başına bir kez kurulur ve bellekte kalır (bellek.ts): Ofis ekranı açılınca bagla() ile sahneye
// takılır, ekrandan çıkınca ayir() ile durur. Geri gelindiğinde kişiler, etkinlikleri ve kamera aynen sürer.
//
// Oyun gibi canlılık: yürürken adım ve sallanma, dururken nefes, masada yazma (monitör titrer), araç sonuçları
// arasında düşünme noktaları, uzun boşlukta uyuklama, kanal mesajında kısa balon ve anılana ışık izi, görev
// bitince kutlama, birleşmede sunucu odasında ışık, test laboratuvarında geçti/kaldı ışığı, kurul masasında onay
// işareti, kahve buharı, bitki salınımı, yerel saate göre gün ışığı. Hareket azaltılınca süsler ve kamera dolaşması
// kapanır; sekme gizliyken döngü durur; yavaş makinede 30 fps'e iner ve efekt bütçesi küçülür.
import {
  kanalGorunenAdi,
  KURUL,
  type AjanSorusu,
  type Ajan,
  type AjanDurumu,
  type AkisOgesi,
  type Gorev,
  type GorevDurumu,
  type HafizaKaydi,
  type Mesaj,
  type Onay,
  type OnayDurumu,
} from "@arnorg/ortak";
import { karakterBul, karakterMetni, type KarakterTanimi, type OfisYeri } from "@arnorg/ortak/karakterler";
import { sozluk, useDilDurumu } from "../dil";
import {
  arastirmaEkraniOgesi,
  buharOgesi,
  esyaOgesi,
  kapiOgesi,
  kureOgesi,
  PANO_SUTUNLARI,
  panoOgesi,
  panoYazilari,
  sicakAdi,
  sunumEkraniOgesi,
  testPanosuOgesi,
  zeminSvg,
  type ArastirmaEkrani,
  type PanoOgesi,
  type SunumEkrani,
  type TestPanosu,
} from "./cizim";
import { EfektHavuzu, efektButcesi, egriNoktasi, konfeti, yayKontrolu } from "./efektler";
import { Kamera, kameraOku, kameraYaz, type KameraDurumu } from "./kamera";
import { projeAtamalari } from "./karakterAtama";
import { adayKarakteri, ozet } from "./karakterSecimi";
import { aracYeri, aramaMetni, komutMetni, komutTuru, testSonucu, yerDurumu, yerKarari, yerOlayi, yerVarisi, type YerDurumu, type YerTuru } from "./etkinlikYeri";
import { gunIsigi, KareOlcer } from "./ortam";
import { sonrakiCekim, yeniCekim, type Cekim, type YayinAdayi } from "./yayin";
import { gerekenMasa, masaAtamasiOku, masaAtamasiYaz, masalariAta } from "./masaAtama";
import { adlariBul, balonMetni, toplantiDuyurusu, toplantiSorusuMu } from "./metin";
import { aracSimgesi, simgeSvg, type OfisSimgesi } from "./simgeler";
import { sunumSec, teslimVerisi } from "./teslim";
import { esyaOranlari, varlikAdresi, type KarakterVarligi, type Varliklar } from "./varliklar";
import {
  KARAKTER_BOYU,
  KARO,
  karoAyak,
  masaSayisi,
  noktaKarosu,
  yerlesimKur,
  yurunebilirMi,
  type Istasyon,
  type Karo,
  type Koltuk,
  type Masa,
  type Nokta,
  type OdaKimligi,
  type SicakNokta,
  type Yerlesim,
} from "./yerlesim";
import { enYakinAcik, rota, uzunluk, yakinBos } from "./yol";

// ---------------------------------------------------------------------------
// Dış arayüz
// ---------------------------------------------------------------------------

export type OfisHedefi = "onaylar" | "denetim" | "pano" | "kod" | "notlar" | "kanallar";

export type AkisTuru =
  | "mesaj"
  | "gorev"
  | "onay"
  | "hafiza"
  | "soru"
  | "giris"
  | "cikis"
  | "birlesme"
  | "kurul"
  | "toplanti"
  | "bildirim"
  | "arastirma"
  | "test"
  | "teslim";

export interface AkisSatiri {
  id: number;
  zaman: number;
  tur: AkisTuru;
  metin: string;
  /** Olayın kişisi: şeritte satıra basınca kamera ona gider (ve takip eder) */
  ajanId?: string;
  /** Kişisi olmayan olayın yeri (kurul masası, sunucu odası, laboratuvar) */
  nokta?: Nokta;
}

/** Kameranın kipi: ekranın düğmeleri bunu gösterir */
export interface KameraModu {
  /** Canlı yayın açık */
  yayin: boolean;
  /** Takip edilen kişi */
  takip: { id: string; ad: string } | null;
  /** Yayında şu an gösterilen kişinin adı */
  yayinda: string | null;
  /** Hareket azaltılmış: yayın kullanılamaz */
  azHareket: boolean;
}

export interface MotorCagrilari {
  ajanSec: (ajanId: string) => void;
  git: (hedef: OfisHedefi, p?: { kanal?: string }) => void;
  akis: (satir: AkisSatiri) => void;
  ozet: (metin: string) => void;
  /** Kamera kipi değişti (yayın, takip, yayındaki kişi) */
  kamera?: (m: KameraModu) => void;
}

export interface MotorVerisi {
  ajanlar: Ajan[];
  gorevler: Gorev[];
  onaylar: Onay[];
}

export interface MotorKurulumu {
  varliklar: Varliklar;
  projeId: string;
}

/** Ofis ekranının motora verdiği bağlantı; ekran her açılışta yenisini verir */
export interface MotorBaglantisi {
  /** Görüntü alanı: kamera olaylarını dinler, sahne içine takılır */
  alan: HTMLElement;
  /** İpucu gibi ekran katmanı öğeleri için kap */
  ekran: HTMLElement;
  cagrilar: MotorCagrilari;
  /** Sığdırırken üstte bırakılacak pay */
  ustPay: () => number;
  /** Sığdırırken altta bırakılacak pay (olay şeridi) */
  altPay?: () => number;
}

/** "Ofiste şimdi" geçmişi: ekran yeniden açılınca son satırlar geri gelir */
const AKIS_GECMISI = 12;
/** Canlı yayın tercihi bu tarayıcıda saklanır */
const YAYIN_ANAHTARI = "arnorg.ofis.yayin";

/** Test laboratuvarının durumu */
type LabDurumu = "bos" | "hazirlik" | "kosuyor" | "gecti" | "kaldi";
/** Sonuç ışığının yanık kaldığı süre (ms); kalan iş kırmızıda daha uzun durur */
const GECTI_SURESI = 14_000;
const KALDI_SURESI = 26_000;
/** Kısa konuşma balonu: ilk ~40 karakter, 4 sn */
const KISA_BALON = 40;
const KISA_BALON_SURESI = 4000;
/** Boşta bu kadar kalan, durunca uyuklar */
const UYUKLAMA = 90_000;

// ---------------------------------------------------------------------------
// İç tipler
// ---------------------------------------------------------------------------

interface Kosul {
  bitti: () => boolean;
  sinir: number;
}
type Senaryo = Generator<Kosul, void, void>;

interface Calisma {
  tur: "kalici" | "sahne";
  ad: string;
  gen: Senaryo;
  kosul: Kosul | null;
  /** Sahne bitince çağrılır (koltuk, rezervasyon bırakma) */
  son?: () => void;
}

/** Kalıcı davranış: calisma işine göre yer seçer; masa (kapalı, hata), kurul, dinlen (boşta), durak (duraklatıldı) */
type KaliciTur = "calisma" | "masa" | "kurul" | "dinlen" | "durak";

type BalonTipi = "konusma" | "soru" | "yanit" | "bilgi" | "kurul" | "kisa";

interface Balon {
  kisi: Kisi;
  el: HTMLDivElement;
  metinEl: HTMLSpanElement;
  tam: string;
  gosterilen: number;
  yazar: boolean;
  bas: number;
  bitis: number;
  g: number;
  h: number;
  olcum: boolean;
  /** Son yerleşim (dünya pikseli, sol alt) */
  x: number;
  y: number;
  kapaniyor: boolean;
  gorunur: boolean;
}

interface Isaret {
  tip: "unlem" | "omuz";
  bitis: number;
}

interface Gecis {
  bas: Nokta;
  son: Nokta;
  t0: number;
  sure: number;
  kirpBas: number;
  kirpSon: number;
}

interface Kisi {
  id: string;
  ajan: Ajan;
  karakter: KarakterVarligi;
  en: number;
  boy: number;
  // DOM
  dugme: HTMLButtonElement;
  govde: HTMLSpanElement;
  img: HTMLImageElement;
  /** Arkadan görünüş (karakterin varsa) */
  arkaImg: HTMLImageElement;
  /** Şu an arkası dönük mü (uzaklaşırken) */
  arkadan: boolean;
  golge: HTMLSpanElement;
  halka: HTMLSpanElement;
  ust: HTMLDivElement;
  isaretEl: HTMLElement;
  adEl: HTMLSpanElement;
  isEl: HTMLSpanElement;
  eldeEl: HTMLDivElement;
  // konum
  x: number;
  y: number;
  ax: number;
  ay: number;
  yon: 1 | -1;
  faz: number;
  nefesFaz: number;
  yol: Nokta[] | null;
  yolI: number;
  hiz: number;
  gecis: Gecis | null;
  isinlan: { hedef: Nokta; t0: number } | null;
  kirp: number;
  oturan: Koltuk | null;
  opaklik: number;
  hedefOpaklik: number;
  // davranış
  masa: Masa | null;
  is: Calisma | null;
  /** Bekleyen sahneler (en çok üç); öncelikli olan sıranın başına geçer ve taşmada düşmez */
  kuyruk: { ad: string; gen: () => Senaryo; son?: () => void; oncelikli?: boolean }[];
  kaliciTur: KaliciTur;
  rezerv: number | null;
  etkinlik: string;
  /** Toplantı odasına vardı (balonları hemen çıkar) */
  toplantida: boolean;
  elde: { simge: OfisSimgesi; metin?: string } | null;
  eldeAnahtar: string;
  isaret: Isaret | null;
  uzanma: number;
  aracSimge: { simge: OfisSimgesi; bitis: number } | null;
  aracEl: HTMLDivElement | null;
  saatBitis: number;
  saatEl: HTMLDivElement | null;
  cikiyor: boolean;
  /** Yeni gelen: CEO karşılayınca true */
  karsilandi: boolean;
  /** Açılışta yerine kondu: ilk adımda bir süre yerinde kalır (hemen yürümeye başlamaz) */
  yerlesti: boolean;
  /** Çalışırken işine göre bulunduğu yer ve durgunluk (etkinlikYeri.ts) */
  yerDurumu: YerDurumu;
  /** Dururken yüzü: pano, raf, tahta ya da dolaba bakarken arkası döner (arkadan görünüşü varsa) */
  bakis: "on" | "arka";
  balonlar: Balon[];
  bekleyenBalon: { metin: string; tip: BalonTipi; simge?: OfisSimgesi; ust?: string; sure?: number }[];
  // canlılık
  /** Düşünme noktaları bu ana kadar; dusunceBaslar gelince başlar (araç sonucundan sonra model düşünürken) */
  dusunceBitis: number;
  dusunceBaslar: number;
  dusunceEl: HTMLSpanElement;
  /** Masada yazma (Edit, Write, model metni) bu ana kadar: monitör titrer, gövde hafifçe kıpırdar */
  yazmaBitis: number;
  /** Kutlama zıplamasının başladığı an */
  ziplaBas: number;
  /** Boşta kalmaya başladığı an (uyuklama için) ve son kımıldadığı an */
  bostaBas: number;
  sonHareket: number;
  /** Kanala yazdığı kısa balon sürerken etkinliği */
  kanalYazisi: { kanal: string; bitis: number } | null;
  /** Konuşmaya yürüdü: varınca sözsüz konuşma göstergesi */
  konusmaBitis: number;
  /** Son araştırma sorgusu ve son test/derleme komutu (akış satırı) */
  sonSorgu: string;
  sonKomut: string;
  // yazılan son değerler (gereksiz DOM yazımını önler)
  yaz: {
    tf: string;
    z: number;
    govde: string;
    kirp: string;
    ust: string;
    op: string;
    durum: string;
    etiket: string;
    isaret: string;
    ad: string;
    is: string;
    oturan: boolean;
    arka: boolean;
    dusunce: boolean;
    konusma: boolean;
  };
  sonEtiketZamani: number;
}

interface Aday {
  onayId: string;
  el: HTMLElement;
  karo: Karo;
  cikiyor: boolean;
}

interface Ucan {
  el: HTMLElement;
  bas: Nokta;
  hedef: () => Nokta;
  t0: number;
  sure: number;
  sonra: () => void;
}

/** Canlı yayın ve şerit için olay: yeri, kişisi ve doğduğu an */
interface SahneOlayi {
  anahtar: string;
  nokta: Nokta;
  ajanId?: string;
  t: number;
}

const HIZ_EN_AZ = 96;
const HIZ_EN_COK = 175;
const ADIM = 22;
const SONSUZ = 1e15;

function rastgele(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function sec<T>(liste: T[]): T | undefined {
  return liste[Math.floor(Math.random() * liste.length)];
}

function yumusakGecis(u: number) {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

function kisaMetin(m: string, n = 64) {
  return balonMetni(m, n);
}

/** O anki sözlüğün ofis bölümü (her çağrıda geçerli dil) */
const so = () => sozluk().ofis;

/** Kanalın görünen adı (# olmadan): genel → general */
const kanalAdi = (kanal: string) => kanalGorunenAdi(kanal, useDilDurumu.getState().dil);

const DURUM_SINIFI: Record<AjanDurumu, string> = {
  calisiyor: "calisiyor",
  karar_bekliyor: "karar",
  bosta: "bosta",
  kapali: "kapali",
  duraklatildi: "durak",
  hata: "hata",
};

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export class OfisMotoru {
  private kur: MotorKurulumu;
  /** Ekrana takılıyken ekranın verdiği bağlantı; ayrıkken null */
  private b: MotorBaglantisi | null = null;
  private v: Varliklar;
  private yer!: Yerlesim;
  private dunya: HTMLDivElement;
  private nesneler: HTMLDivElement;
  private ustKatman: HTMLDivElement;
  private zeminKap: HTMLDivElement;
  private durgun: HTMLElement[] = [];
  private kamera: Kamera | null = null;
  /** Ayrılırken bırakılan kamera görünümü (yeniden takılınca aynen döner) */
  private kameraDurumu: KameraDurumu | null = null;
  private kameraKayitZamani: ReturnType<typeof setTimeout> | undefined;
  private kisiler = new Map<string, Kisi>();
  private atamalar = new Map<string, string>();
  private masaAtamalari = new Map<string, string>();
  /** Tarayıcıda saklanan masa ataması (sayfa yeniden yüklenince herkes aynı masada) */
  private kayitliMasalar: Record<string, string>;
  private rezervler = new Map<number, string>();
  private koltukSahipleri = new Map<Koltuk, string>();
  private gorevDurumu = new Map<string, GorevDurumu>();
  private onayDurumu = new Map<string, OnayDurumu>();
  private gorevler: Gorev[] = [];
  private onaylar: Onay[] = [];
  private adaylar = new Map<string, Aday>();
  private ucanlar: Ucan[] = [];
  private kivilcimlar: { el: HTMLElement; bitis: number }[] = [];
  private balonlar: Balon[] = [];
  private pano!: PanoOgesi;
  private panoNotlari = new Map<string, HTMLElement>();
  private kurulIsiklari!: HTMLElement;
  private kurulZemin!: HTMLElement;
  private sunucuIsiklari: HTMLElement[] = [];
  private sunucuAkisBitis = 0;
  private monitorler = new Map<string, HTMLElement>();
  private toplanti: { basladi: number; bitis: number; katilimcilar: Set<string>; balonlar: Map<string, { metin: string }[]> } | null = null;
  /** Yanıtı beklenen toplantı soruları (hepsi yanıtlanınca toplantı dağılır) */
  private toplantiSorulari = new Set<string>();
  private ipucu: HTMLDivElement;
  private ipucuKisi: Kisi | null = null;
  private ipucuYazildi = 0;
  /** İpucunun son ölçüleri: alanın ekran katmanına göre yeri, katmanın ve ipucunun boyu */
  private ipucuOlcu = { dx: 0, dy: 0, eg: 0, eh: 0, g: 0, h: 0 };
  private t = 0;
  private sonKare = 0;
  private kare: number | null = null;
  private calisiyor = false;
  private ilkVeri = true;
  /** Yeniden takıldıktan sonraki ilk veri: ekran kapalıyken olanlar sahnesiz uygulanır */
  private yenidenBaglandi = false;
  /** Sahne yazılarının çizildiği dil */
  private dil: string;
  private akisGecmisi: AkisSatiri[] = [];
  private olcek = 1;
  private ters = 1;
  private tersYazilan = "";
  private lod = "";
  private akisNo = 0;
  private azHareket: boolean;
  private azHareketSorgu: MediaQueryList;
  private kaldir: (() => void)[] = [];
  /** Yalnız takılıyken geçerli dinleyiciler */
  private baglantiKaldir: (() => void)[] = [];
  private ozetAnahtari = "";
  private gorulenHafiza = new Set<string>();
  private yerKarariZamani = 0;
  private yokEdildi = false;

  // ---- Doğu kanadı ve canlılık ----
  /** Efektler: kutlama kâğıtları, halkalar, ışık izleri, oda flaşları (süresi dolunca atılır) */
  private efektler = new EfektHavuzu<Element>((e) => e.veri.remove());
  /** Işık izlerinin çizildiği SVG katmanı (üst katmanda) */
  private izKatmani: SVGSVGElement;
  private arastirmaEkrani: ArastirmaEkrani | null = null;
  private testPanosu: TestPanosu | null = null;
  private sunumEkrani: SunumEkrani | null = null;
  private kapiEl: HTMLElement | null = null;
  private kurulIsareti: HTMLElement | null = null;
  private geceKatmani: HTMLElement | null = null;
  /** Laboratuvar: durum, son komut, ışığın sönme anı */
  private lab: { durum: LabDurumu; komut: string; bitis: number; yazilan: string } = { durum: "bos", komut: "", bitis: 0, yazilan: "" };
  /** Test ve derleme çağrıları: aracKimligi → kim, ne koştu (sonuç gelince ışık) */
  private labCagrilari = new Map<string, { ajanId: string; komut: string; t: number }>();
  /** Kütüphane ekranı: son sorgu */
  private arastirma = { sorgu: "", t: -SONSUZ, yazilan: "" };
  /** Stüdyo ekranı: teslim (onaydan ya da teslim_et çağrısından) */
  private sunum: { baslik: string; adimlar: string[]; durum: string; yazilan: string } = { baslik: "", adimlar: [], durum: "bos", yazilan: "" };
  /** Son teslim_et çağrısı (onayı gelmeden de ekranda görünsün; an: duvar saati) */
  private sunumCagrisi: { baslik: string; adimlar: string[]; an: number } | null = null;
  /** Son sunum sahnesi (teslim_et çağrısı ve teslim onayı birlikte gelir; sahne bir kez açılır) */
  private sonSunum: { ajanId: string; t: number } | null = null;
  /** Birleştirmelerin kalite kapısı durumu (onay kimliği → durum) */
  private kaliteDurumu = new Map<string, string>();
  /** Onaylanıp kalite kaydı beklenen birleştirmeler (gelmezse bu anda doğrudan birleşmiş sayılır) */
  private birlesmeBekleyenler = new Map<string, number>();
  /** Şeritteki bir yere kısa kamera gezintisi */
  private gezinti: { x: number; y: number; bitis: number } | null = null;
  /** Takip başlarken bir kez yakınlaşılan ölçek; kullanıcı yakınlaştırınca bırakılır */
  private takipOlcek: number | null = null;
  /** Kamera kipleri */
  private yayinAcik = false;
  private takipId: string | null = null;
  private cekim: Cekim = yeniCekim();
  private sahneOlaylari: SahneOlayi[] = [];
  private kameraModuAnahtari = "";
  private kayitBekliyor = false;
  /** Döngünün güç durumu: düşük güçte 30 fps ve küçük efekt bütçesi */
  private kareOlcer = new KareOlcer();
  private kareAtla = false;
  private birikenDt = 0;
  private gunIsigiZamani = -SONSUZ;
  private yarimSaniye = 0;

  constructor(kur: MotorKurulumu) {
    this.kur = kur;
    this.v = kur.varliklar;
    this.dil = useDilDurumu.getState().dil;
    this.kayitliMasalar = masaAtamasiOku(kur.projeId);
    this.azHareketSorgu = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.azHareket = this.azHareketSorgu.matches;
    const azDegisti = () => {
      this.azHareket = this.azHareketSorgu.matches;
      // Hareket azaltıldı: süsler hemen kalkar, kamera dolaşması durur
      if (this.azHareket) {
        this.efektler.temizle();
        if (this.yayinAcik) this.yayinAc(false);
      }
      this.kameraModunuBildir();
    };
    this.azHareketSorgu.addEventListener("change", azDegisti);
    this.kaldir.push(() => this.azHareketSorgu.removeEventListener("change", azDegisti));

    // Katmanlar
    this.dunya = document.createElement("div");
    this.dunya.className = "ofis-dunya";
    this.zeminKap = document.createElement("div");
    this.zeminKap.className = "ofis-zemin-kap";
    this.nesneler = document.createElement("div");
    this.nesneler.className = "ofis-nesneler";
    this.ustKatman = document.createElement("div");
    this.ustKatman.className = "ofis-ust-katman";
    this.izKatmani = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.izKatmani.setAttribute("class", "ofis-iz-katmani");
    this.izKatmani.setAttribute("aria-hidden", "true");
    this.ustKatman.appendChild(this.izKatmani);
    this.dunya.append(this.zeminKap, this.nesneler, this.ustKatman);
    try {
      this.yayinAcik = localStorage.getItem(YAYIN_ANAHTARI) === "1" && !this.azHareket;
    } catch {
      // depolama kapalı: yayın kapalı başlar
    }

    this.ipucu = document.createElement("div");
    this.ipucu.className = "ofis-ipucu";
    this.ipucu.setAttribute("role", "tooltip");
    this.ipucu.hidden = true;

    this.yerlesimiKur(masaSayisi(0));

    // Tıklamalar: karakter, sıcak noktalar, işaretler
    const tik = (e: MouseEvent) => this.tiklandi(e);
    this.dunya.addEventListener("click", tik);
    this.kaldir.push(() => this.dunya.removeEventListener("click", tik));
    const ustune = (e: Event) => this.ipucuBak(e);
    for (const tur of ["pointerover", "pointerout", "focusin", "focusout"]) {
      this.dunya.addEventListener(tur, ustune);
      this.kaldir.push(() => this.dunya.removeEventListener(tur, ustune));
    }
    // Dil değişince sahne yazıları (levhalar, pano, etiketler) yenilenir; balonlar olduğu gibi kalır
    this.kaldir.push(
      useDilDurumu.subscribe((d, o) => {
        if (d.dil !== o.dil) this.metinleriYenile();
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Yaşam döngüsü
  // -------------------------------------------------------------------------

  get varliklar(): Varliklar {
    return this.v;
  }

  bagliMi(): boolean {
    return this.b !== null;
  }

  /**
   * Ofis ekranına takılır: sahne görüntü alanına, ipucu ekran katmanına girer; kamera bırakıldığı görünümle
   * (ilk açılışta tarayıcıda saklananla) kurulur ve döngü başlar.
   */
  bagla(b: MotorBaglantisi) {
    if (this.yokEdildi) return;
    if (this.b) this.ayir();
    this.b = b;
    b.alan.appendChild(this.dunya);
    b.ekran.appendChild(this.ipucu);
    this.kamera = new Kamera({
      alan: b.alan,
      dunya: this.dunya,
      genislik: this.yer.genislik,
      yukseklik: this.yer.yukseklik,
      ustPay: b.ustPay,
      altPay: b.altPay,
      degisti: (o) => this.olcekDegisti(o),
      kaydedilsin: () => this.kameraKaydetPlanla(),
      // Kullanıcı kamerayı eline aldı: yayın durur; takip kaydırınca bırakılır, yakınlaştırınca sürer
      elle: (tur) => {
        if (this.yayinAcik) this.yayinAc(false);
        this.gezinti = null;
        if (tur === "kaydir" && this.takipId) this.takipEt(null);
        else this.takipOlcek = null;
      },
    });
    this.kamera.durumaGetir(this.kameraDurumu ?? kameraOku(this.kur.projeId));
    const gorunurluk = () => {
      if (document.hidden) this.dur();
      else this.basla();
    };
    document.addEventListener("visibilitychange", gorunurluk);
    this.baglantiKaldir.push(() => document.removeEventListener("visibilitychange", gorunurluk));
    if (!this.ilkVeri) this.yenidenBaglandi = true;
    this.metinleriYenile();
    // Ölçüler yeniden alınır (ayrıkken sıfırdı)
    for (const bl of this.balonlar) bl.olcum = true;
    this.ozetAnahtari = "";
    this.ozetiGuncelle();
    this.kameraModuAnahtari = "";
    this.kameraModunuBildir();
    this.gunIsigiZamani = -SONSUZ;
    this.basla();
  }

  /** Ekrandan çıkılınca: döngü durur, görünüm saklanır, sahne DOM'dan ayrılır; durum bellekte kalır */
  ayir() {
    if (!this.b) return;
    if (this.kamera) {
      this.kameraDurumu = this.kamera.durum();
      kameraYaz(this.kur.projeId, this.kameraDurumu);
      this.kamera.yokEt();
      this.kamera = null;
    }
    clearTimeout(this.kameraKayitZamani);
    this.kayitBekliyor = false;
    // Yarım kalan süsler geri dönüşte eskimiş görünmesin
    this.efektler.temizle();
    this.dur();
    for (const f of this.baglantiKaldir.splice(0)) f();
    this.ipucuGizle();
    this.ipucu.remove();
    this.dunya.remove();
    this.b = null;
  }

  yokEt() {
    if (this.yokEdildi) return;
    this.ayir();
    this.yokEdildi = true;
    this.dur();
    this.kaldir.forEach((f) => f());
    this.dunya.remove();
    this.ipucu.remove();
  }

  /** Son "Ofiste şimdi" satırları, en yenisi önde */
  sonAkislar(): AkisSatiri[] {
    return this.akisGecmisi.slice();
  }

  private basla() {
    if (this.calisiyor || this.yokEdildi || !this.b || document.hidden) return;
    this.calisiyor = true;
    this.sonKare = performance.now();
    this.birikenDt = 0;
    const dongu = (an: number) => {
      if (!this.calisiyor) return;
      const ham = Math.max(0, an - this.sonKare);
      this.sonKare = an;
      if (this.kareOlcer.ekle(ham)) this.gucDegisti();
      // Düşük güç: iki karede bir güncellenir (30 fps); geçen süre birikir, hareket hızı değişmez
      this.birikenDt += ham;
      this.kareAtla = this.kareOlcer.dusukGuc && !this.kareAtla;
      if (!this.kareAtla) {
        const dt = Math.min(64, this.birikenDt);
        this.birikenDt = 0;
        this.guncelle(dt);
      }
      this.kare = requestAnimationFrame(dongu);
    };
    this.kare = requestAnimationFrame(dongu);
  }

  /** Güç durumu değişti: efekt bütçesi ve süs hareketleri (CSS) uyarlanır */
  private gucDegisti() {
    const dusuk = this.kareOlcer.dusukGuc;
    if (dusuk) this.dunya.dataset.guc = "dusuk";
    else delete this.dunya.dataset.guc;
    this.efektler.butce = efektButcesi(this.kisiler.size, dusuk);
  }

  private dur() {
    this.calisiyor = false;
    if (this.kare) cancelAnimationFrame(this.kare);
    this.kare = null;
  }

  /** Bütün ofisi sığdırır: yayın ve takip bırakılır */
  sigdir() {
    if (this.yayinAcik) this.yayinAc(false);
    if (this.takipId) this.takipEt(null);
    this.gezinti = null;
    this.kamera?.sigdir();
  }

  /** Yakınlaştırma düğmeleri: yayın durur; takip yeni yakınlıkla sürer */
  yakinlastir(carpan: number) {
    if (this.yayinAcik) this.yayinAc(false);
    this.takipOlcek = null;
    this.kamera?.yakinlastir(carpan);
  }

  /** Sahnenin üstündeki başlık katmanının yüksekliği değişti */
  ustDegisti() {
    this.kamera?.ustDegisti();
  }

  // -------------------------------------------------------------------------
  // Kamera kipleri: canlı yayın, takip, şeritten gezinti
  // -------------------------------------------------------------------------

  /** Şu anki kamera kipi (ekranın düğmeleri için) */
  kameraModu(): KameraModu {
    const takip = this.takipId ? this.kisiler.get(this.takipId) : undefined;
    const yayinda = this.yayinAcik && this.cekim.hedef ? this.cekimKisisi()?.ajan.ad ?? null : null;
    return { yayin: this.yayinAcik, takip: takip ? { id: takip.id, ad: takip.ajan.ad } : null, yayinda, azHareket: this.azHareket };
  }

  private kameraModunuBildir() {
    const m = this.kameraModu();
    const anahtar = `${m.yayin}|${m.takip?.id ?? ""}|${m.takip?.ad ?? ""}|${m.yayinda ?? ""}|${m.azHareket}`;
    if (anahtar === this.kameraModuAnahtari || !this.b) return;
    this.kameraModuAnahtari = anahtar;
    this.b.cagrilar.kamera?.(m);
  }

  /** Canlı yayın: kamera çalışanlar ve olaylar arasında kendiliğinden dolaşır (hareket azaltıldıysa açılmaz) */
  yayinAc(acik: boolean) {
    const yeni = acik && !this.azHareket;
    if (yeni !== this.yayinAcik) {
      this.yayinAcik = yeni;
      try {
        localStorage.setItem(YAYIN_ANAHTARI, yeni ? "1" : "0");
      } catch {
        // depolama kapalı: tercih yalnız bu oturumda
      }
      if (yeni) {
        this.takipId = null;
        this.gezinti = null;
        this.cekim = yeniCekim();
      }
    }
    this.kameraModunuBildir();
  }

  /** Bir çalışanı takip et (null: bırak). Takip başlarken rahat bir yakınlığa gelinir. */
  takipEt(ajanId: string | null) {
    const k = ajanId ? this.kisiler.get(ajanId) : undefined;
    this.takipId = k && !k.cikiyor ? k.id : null;
    this.gezinti = null;
    if (this.takipId) {
      if (this.yayinAcik) this.yayinAc(false);
      this.takipOlcek = this.kamera ? Math.max(this.kamera.olcek, this.yakinOlcek()) : null;
    }
    this.kameraModunuBildir();
  }

  /** Şeritteki satıra basıldı: kişisi varsa ona gidip takip eder, yoksa olayın yerine kısa bir gezinti */
  olayaGit(satir: Pick<AkisSatiri, "ajanId" | "nokta">) {
    const k = satir.ajanId ? this.kisiler.get(satir.ajanId) : undefined;
    if (k && !k.cikiyor) {
      this.takipEt(k.id);
      return;
    }
    if (!satir.nokta) return;
    if (this.yayinAcik) this.yayinAc(false);
    this.takipId = null;
    this.takipOlcek = null;
    this.gezinti = { x: satir.nokta.x, y: satir.nokta.y - KARO, bitis: this.t + 2600 };
    this.kameraModunuBildir();
  }

  /** Bir kişiyi yakından gösterirken rahat ölçek: sığdırmanın iki katı, 0.85-1.3 arası */
  private yakinOlcek(): number {
    const s = this.kamera?.sigdirOlcegi() ?? 0.6;
    return Math.min(1.3, Math.max(0.85, s * 2));
  }

  private cekimKisisi(): Kisi | undefined {
    const h = this.cekim.hedef;
    if (!h) return undefined;
    if (h.startsWith("olay:")) {
      const o = this.sahneOlaylari.find((x) => `olay:${x.anahtar}` === h);
      return o?.ajanId ? this.kisiler.get(o.ajanId) : undefined;
    }
    return this.kisiler.get(h);
  }

  /** Canlı yayının adayları: ilginçliğe göre puanlanan kişiler ve taze olaylar */
  private yayinAdaylari(): YayinAdayi[] {
    const adaylar: YayinAdayi[] = [];
    for (const k of this.kisiler.values()) {
      if (k.cikiyor || k.opaklik < 0.5 || k.ajan.durum === "kapali") continue;
      let puan = k.ajan.durum === "calisiyor" ? 30 : k.ajan.durum === "karar_bekliyor" ? 26 : k.ajan.durum === "hata" ? 16 : k.ajan.durum === "bosta" ? 8 : 4;
      if (k.is?.tur === "sahne") puan += 34;
      if (k.yol) puan += 18;
      if (this.t < k.konusmaBitis || k.balonlar.length) puan += 22;
      if (k.ajan.durum === "calisiyor" && ["arastirma", "laboratuvar", "sunum", "tasarim", "tanitim", "kisi", "toplanti"].includes(k.yerDurumu.yer)) puan += 16;
      if (this.uyukluyor(k)) puan = 6;
      adaylar.push({ id: k.id, puan });
    }
    for (const o of this.sahneOlaylari) if (this.t - o.t < 6000) adaylar.push({ id: `olay:${o.anahtar}`, puan: 100, olay: o.t });
    return adaylar;
  }

  /** Her karede kameranın kipine göre adımı: takip, yayın ya da şeritten gezinti */
  private kameraAdimi(dt: number) {
    const kam = this.kamera;
    if (!kam) return;
    const aninda = this.azHareket;
    if (this.takipId) {
      const k = this.kisiler.get(this.takipId);
      if (!k || k.cikiyor) {
        this.takipEt(null);
        return;
      }
      if (this.takipOlcek !== null && Math.abs(kam.olcek - this.takipOlcek) < 0.004) this.takipOlcek = null;
      kam.izle(k.x + k.ax, k.y + k.ay - k.boy * 0.45, this.takipOlcek, dt, 380, aninda);
      return;
    }
    if (this.yayinAcik) {
      const once = this.cekim;
      this.cekim = sonrakiCekim(this.yayinAdaylari(), this.cekim, this.t);
      if (this.cekim !== once) this.kameraModunuBildir();
      const h = this.cekim.hedef;
      if (!h) {
        // Gösterilecek kimse yok: ofisin geneline geniş çekim
        kam.izle(this.yer.genislik / 2, this.yer.yukseklik / 2, kam.sigdirOlcegi(), dt, 1600);
        return;
      }
      if (h.startsWith("olay:")) {
        const o = this.sahneOlaylari.find((x) => `olay:${x.anahtar}` === h);
        if (o) kam.izle(o.nokta.x, o.nokta.y - KARO * 1.2, this.yakinOlcek(), dt, 700);
        return;
      }
      const k = this.kisiler.get(h);
      if (k) kam.izle(k.x + k.ax, k.y + k.ay - k.boy * 0.45, this.yakinOlcek(), dt, 1100);
      return;
    }
    const g = this.gezinti;
    if (g) {
      kam.izle(g.x, g.y, Math.max(kam.olcek, this.yakinOlcek() * 0.9), dt, 360, aninda);
      if (this.t >= g.bitis) this.gezinti = null;
    }
  }

  /** Kamera görünümü tarayıcıda saklanır (sayfa yeniden yüklenince aynı yer); takip ve yayında her kare
   * değişse de en çok yarım saniyede bir yazılır */
  private kameraKaydetPlanla() {
    if (this.kayitBekliyor) return;
    this.kayitBekliyor = true;
    this.kameraKayitZamani = setTimeout(() => {
      this.kayitBekliyor = false;
      if (this.kamera) kameraYaz(this.kur.projeId, this.kamera.durum());
    }, 500);
  }

  /** Dil değişti: zemin yazıları, sıcak nokta adları, pano, kurul ve erişilebilir adlar yeni dilde */
  private metinleriYenile() {
    const dil = useDilDurumu.getState().dil;
    if (dil === this.dil) return;
    this.dil = dil;
    this.zeminKap.innerHTML = zeminSvg(this.yer);
    for (const el of this.durgun) {
      const sicak = el.dataset.sicak as SicakNokta | undefined;
      if (!sicak || el === this.pano.kok) continue;
      el.setAttribute("aria-label", sicakAdi(sicak));
      el.title = sicakAdi(sicak);
    }
    panoYazilari(this.pano);
    this.panoyuGuncelle();
    this.kurulIsiklariniGuncelle();
    this.ekranlariYaz(true);
    for (const a of this.adaylar.values()) a.el.remove();
    this.adaylar.clear();
    this.adaylariGuncelle(true);
    for (const k of this.kisiler.values()) {
      k.yaz.etiket = "";
      k.yaz.isaret = "";
      k.sonEtiketZamani = -SONSUZ;
      if (k.saatEl) k.saatEl.title = so().gozetmenHatirlatti;
    }
    this.ipucuYazildi = -SONSUZ;
    this.ozetAnahtari = "";
    this.ozetiGuncelle();
  }

  // -------------------------------------------------------------------------
  // Yerleşim ve durağan sahne
  // -------------------------------------------------------------------------

  private yerlesimiKur(masa: number) {
    this.yer = yerlesimKur(masa, esyaOranlari(this.v));
    for (const el of this.durgun) el.remove();
    this.durgun = [];
    this.monitorler.clear();
    this.sunucuIsiklari = [];
    this.panoNotlari.clear();
    const y = this.yer;
    this.dunya.style.width = `${y.genislik}px`;
    this.dunya.style.height = `${y.yukseklik}px`;
    this.zeminKap.innerHTML = zeminSvg(y);

    const ilkSicak = new Set<SicakNokta>();
    for (const e of y.esyalar) {
      const odak = e.sicak ? !ilkSicak.has(e.sicak) : true;
      if (e.sicak) ilkSicak.add(e.sicak);
      const el = esyaOgesi(e, this.v, undefined, odak);
      el.dataset.kimlik = e.kimlik;
      // Bitkiler çok hafif salınır; her biri kendi evresinde (kimliğinden)
      if (e.esya === "bitki-buyuk" || e.esya === "bitki-kucuk") el.style.setProperty("--evre", `${-(ozet(e.kimlik) % 7000) / 1000}s`);
      this.nesneler.appendChild(el);
      this.durgun.push(el);
      // Kahve makinesinin buharı
      if (e.esya === "kahve") {
        const buhar = buharOgesi(e);
        this.nesneler.appendChild(buhar);
        this.durgun.push(buhar);
      }
    }
    // Ekran ışığı: monitör oturana bakar; ışık oturanın yüzüne düşer. Oturanın önünde, masanın arkasında
    // (masa ve monitör kasası ışığın alt kısmını örter, ışık kasanın ardından taşar). Kanat istasyonları da aynı.
    for (const m of [...y.masalar, ...y.istasyonlar]) {
      const isik = document.createElement("div");
      isik.className = "ofis-monitor";
      isik.style.cssText = `left:${m.isik.x}px;top:${m.isik.y}px;width:${m.isik.g}px;height:${m.isik.h}px;z-index:${Math.round(m.oturma.y) + 1}`;
      this.nesneler.appendChild(isik);
      this.durgun.push(isik);
      this.monitorler.set(m.kimlik, isik);
    }
    // Sunucu ışıkları
    for (const kimlik of y.noktalar.sunucuKimlikleri) {
      const e = y.esyalar.find((x) => x.kimlik === kimlik)!;
      const isik = document.createElement("div");
      isik.className = "ofis-sunucu-isik";
      const h = e.yukseklik;
      isik.style.cssText = `left:${e.x - e.genislik * 0.27}px;top:${e.y - h * 0.79}px;width:${e.genislik * 0.5}px;height:${h * 0.58}px;z-index:${Math.round(e.y) + 1}`;
      isik.innerHTML = Array.from({ length: 5 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
      this.nesneler.appendChild(isik);
      this.durgun.push(isik);
      this.sunucuIsiklari.push(isik);
    }
    // Test cihazlarının ışıkları: laboratuvarın durumuna göre renk ve hız (CSS, data-lab)
    for (const kimlik of y.noktalar.testCihazlari) {
      const e = y.esyalar.find((x) => x.kimlik === kimlik)!;
      const isik = document.createElement("div");
      isik.className = "ofis-test-cihazi";
      const h = e.yukseklik;
      isik.style.cssText = `left:${e.x - e.genislik * 0.27}px;top:${e.y - h * 0.79}px;width:${e.genislik * 0.5}px;height:${h * 0.58}px;z-index:${Math.round(e.y) + 1}`;
      isik.innerHTML = Array.from({ length: 6 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
      this.nesneler.appendChild(isik);
      this.durgun.push(isik);
    }
    // Pano
    this.pano = panoOgesi(y);
    this.nesneler.appendChild(this.pano.kok);
    this.durgun.push(this.pano.kok);
    // Doğu kanadının ekranları, küre, giriş kapısı
    const n = y.noktalar;
    this.arastirmaEkrani = arastirmaEkraniOgesi(n.arastirmaEkrani);
    this.testPanosu = testPanosuOgesi(n.testPanosu);
    this.sunumEkrani = sunumEkraniOgesi(n.sunumEkrani);
    const kure = kureOgesi(n.kure);
    this.kapiEl = kapiOgesi(n.girisKapisi);
    for (const el of [this.arastirmaEkrani.kok, this.testPanosu.kok, this.sunumEkrani.kok, kure, this.kapiEl]) {
      this.nesneler.appendChild(el);
      this.durgun.push(el);
    }
    this.lab.yazilan = "";
    this.arastirma.yazilan = "";
    this.sunum.yazilan = "";
    // Gün ışığı: bütün sahnenin üstünde (etiketlerin altında) ince bir örtü; lambalar örtünün üstünde parlar
    this.geceKatmani = document.createElement("div");
    this.geceKatmani.className = "ofis-gece";
    this.geceKatmani.setAttribute("aria-hidden", "true");
    this.nesneler.appendChild(this.geceKatmani);
    this.durgun.push(this.geceKatmani);
    for (const e of y.esyalar) {
      if (e.esya !== "lamba") continue;
      const isik = document.createElement("div");
      isik.className = "ofis-gece-isik";
      isik.setAttribute("aria-hidden", "true");
      isik.style.cssText = `left:${e.x - e.genislik * 0.25 - KARO * 3}px;top:${e.y - 6 - KARO * 1.8}px;width:${KARO * 6}px;height:${KARO * 3.6}px`;
      this.nesneler.appendChild(isik);
      this.durgun.push(isik);
    }
    // Kurul masası: ışıklar ve zemin parıltısı
    const km = y.esyalar.find((e) => e.kimlik === y.noktalar.kurulMasasiKimligi)!;
    this.kurulZemin = document.createElement("div");
    this.kurulZemin.className = "ofis-kurul-zemin";
    this.kurulZemin.style.cssText = `left:${km.x - 150}px;top:${km.y - 70}px;width:300px;height:140px`;
    this.nesneler.appendChild(this.kurulZemin);
    this.durgun.push(this.kurulZemin);
    this.kurulIsiklari = document.createElement("div");
    this.kurulIsiklari.className = "ofis-kurul-isiklar";
    this.kurulIsiklari.style.cssText = `left:${km.x}px;top:${km.y - km.yukseklik * 0.42}px;z-index:${Math.round(km.y) + 1}`;
    this.nesneler.appendChild(this.kurulIsiklari);
    this.durgun.push(this.kurulIsiklari);
    // Onay bekleyen karar varken masanın üstünde süzülen işaret (oyundaki görev işareti)
    this.kurulIsareti = document.createElement("div");
    this.kurulIsareti.className = "ofis-kurul-isaret";
    this.kurulIsareti.setAttribute("aria-hidden", "true");
    this.kurulIsareti.style.cssText = `left:${km.x}px;top:${km.y - km.yukseklik - 34}px;z-index:${Math.round(km.y) + 2}`;
    // Zemindeki halka kurulZemin'in içinde (masanın altında) yayılır
    this.kurulIsareti.innerHTML = '<span class="ofis-kurul-isaret-ok"></span>';
    this.nesneler.appendChild(this.kurulIsareti);
    this.durgun.push(this.kurulIsareti);

    this.panoyuGuncelle();
    this.kurulIsiklariniGuncelle();
    this.ekranlariYaz(true);
    this.gunIsigiZamani = -SONSUZ;
  }

  /** Masa sayısı yetmezse yerleşimi büyütür; karakterler yerinde kalır, yürünemez yerdeyse en yakın açık karoya geçer */
  private yerlesimiBuyut(masa: number) {
    // Var olan adalar aynı yerde kalır: masasında oturan yerinde oturmaya devam eder
    const masadaOturan = new Set([...this.kisiler.values()].filter((k) => k.oturan && k.oturan === k.masa).map((k) => k.id));
    this.yerlesimiKur(masa);
    this.kamera?.boyutDegisti(this.yer.genislik, this.yer.yukseklik);
    this.rezervler.clear();
    this.koltukSahipleri.clear();
    for (const k of this.kisiler.values()) {
      k.oturan = null;
      k.kirp = 0;
      k.gecis = null;
      k.yol = null;
      k.rezerv = null;
      const karo = noktaKarosu(k);
      if (!yurunebilirMi(this.yer, karo)) {
        const acik = enYakinAcik(this.yer, k);
        const a = karoAyak(acik);
        k.x = a.x;
        k.y = a.y;
      }
    }
    this.masalariAta(false);
    for (const k of this.kisiler.values()) if (masadaOturan.has(k.id) && k.masa) this.oturt(k, k.masa);
    for (const k of this.kisiler.values()) if (k.is?.tur === "kalici") this.kaliciBaslat(k);
    // Lobi aşağı kaydı: aday siluetleri yeni yerlerine
    for (const a of this.adaylar.values()) a.el.remove();
    this.adaylar.clear();
    this.adaylariGuncelle(true);
  }

  // -------------------------------------------------------------------------
  // Veri
  // -------------------------------------------------------------------------

  veriGuncelle(v: MotorVerisi) {
    const ilk = this.ilkVeri;
    // Ekran kapalıyken olanlar (yeni gelen, giden, görev ve onay geçişleri) sahnesiz uygulanır; durum
    // değişenler bırakıldıkları yerden yeni yerlerine yürür
    const sessiz = ilk || this.yenidenBaglandi;
    this.ilkVeri = false;
    this.yenidenBaglandi = false;
    // Karakter atamaları (kalıcı)
    this.atamalar = projeAtamalari(this.kur.projeId, v.ajanlar, this.v.karakterler, this.atamalar);

    // Masa kapasitesi: saklanan masalar da sığsın (kimse yerinden kaymasın)
    const onceki = { ...this.kayitliMasalar, ...Object.fromEntries(this.masaAtamalari) };
    const gereken = Math.max(this.muhendisSayisi(v.ajanlar), gerekenMasa(v.ajanlar, onceki));
    const kapasite = this.yer.masalar.filter((m) => m.oda === "muhendislik").length;
    if (masaSayisi(gereken) > kapasite) this.yerlesimiBuyut(masaSayisi(gereken));

    const gorulen = new Set<string>();
    const yeniler: Kisi[] = [];
    for (const a of v.ajanlar) {
      gorulen.add(a.id);
      const k = this.kisiler.get(a.id);
      if (!k) {
        yeniler.push(this.kisiOlustur(a));
        continue;
      }
      const eski = k.ajan;
      k.ajan = a;
      const yeniKarakter = this.atamalar.get(a.id);
      if (yeniKarakter && yeniKarakter !== k.karakter.id) this.karakterDegistir(k, yeniKarakter);
      if (eski.durum !== a.durum) this.durumDegisti(k, eski.durum, sessiz);
    }
    for (const k of [...this.kisiler.values()]) if (!gorulen.has(k.id) && !k.cikiyor) this.kisiAyrildi(k, sessiz);
    // Masalar bütün ekip görüldükten sonra atanır: sonuç ajanların geliş sırasından bağımsız
    this.masalariAta(true);
    for (const k of yeniler) this.kisiyiYerlestir(k, sessiz);

    // Görevler
    this.gorevler = v.gorevler;
    for (const g of v.gorevler) {
      const once = this.gorevDurumu.get(g.id);
      this.gorevDurumu.set(g.id, g.durum);
      if (sessiz) continue;
      if (once !== undefined && once !== g.durum) this.gorevGecti(g, once);
      else if (once === undefined) this.akisa("gorev", so().akis.yeniGorev(g.kod, kisaMetin(g.baslik, 48)), { nokta: this.odaNoktasi("pano") });
    }
    this.panoyuGuncelle();

    // Onaylar
    this.onaylar = v.onaylar;
    for (const o of v.onaylar) {
      const once = this.onayDurumu.get(o.id);
      this.onayDurumu.set(o.id, o.durum);
      if (sessiz) continue;
      if (once === undefined && o.durum === "bekliyor") this.onayYeni(o);
      else if (once === "bekliyor" && o.durum !== "bekliyor") this.onaySonuc(o);
    }
    // Birleştirmelerin kalite kapısı: her adım onay.sonuc ile gelir (kuyrukta → hazırlık → test → birleşti/kaldı)
    for (const o of v.onaylar) {
      if (o.tur !== "birlestirme") continue;
      const k = ((o.veri ?? null) as { kalite?: { durum?: string; komut?: string | null; testYok?: boolean; testsiz?: boolean } } | null)?.kalite;
      if (!k?.durum) continue;
      const once = this.kaliteDurumu.get(o.id);
      this.kaliteDurumu.set(o.id, k.durum);
      if (!sessiz && once !== k.durum) this.kaliteGecti(o, k.durum, k);
    }
    this.sunumuGuncelle();
    this.kurulIsiklariniGuncelle();
    this.adaylariGuncelle(sessiz);
    this.ozetiGuncelle();
  }

  private muhendisSayisi(ajanlar: Ajan[]) {
    const ceo = ajanlar.filter((a) => a.rol === "ceo").length ? 1 : 0;
    const cto = ajanlar.filter((a) => a.rol === "cto").length ? 1 : 0;
    return Math.max(0, ajanlar.length - ceo - cto);
  }

  /**
   * CEO ve CTO kendi odalarında; diğerleri açık ofiste. Önceki atama (bellek ve tarayıcıda saklanan) korunur,
   * yeni gelen ilk boş masayı alır (masaAtama.ts). kaydet: ekip tam görüldüyse sonuç saklanır.
   */
  private masalariAta(kaydet = true) {
    const kisiler = [...this.kisiler.values()].filter((k) => !k.cikiyor);
    const onceki = { ...this.kayitliMasalar, ...Object.fromEntries(this.masaAtamalari) };
    const yeni = masalariAta(
      kisiler.map((k) => ({ id: k.id, rol: k.ajan.rol, olusturma: k.ajan.olusturma })),
      this.yer.masalar,
      onceki,
    );
    this.masaAtamalari = yeni;
    if (kaydet && kisiler.length && !this.ilkVeri) {
      masaAtamasiYaz(this.kur.projeId, yeni);
      this.kayitliMasalar = Object.fromEntries(yeni);
    }
    for (const k of this.kisiler.values()) {
      const kimlik = yeni.get(k.id);
      const masa = kimlik ? (this.yer.masalar.find((m) => m.kimlik === kimlik) ?? null) : null;
      if (masa !== k.masa) {
        const eski = k.masa;
        k.masa = masa;
        if (k.oturan && k.oturan === eski) {
          // Masası değişti: kalkıp yenisine geçsin
          if (k.is?.tur === "kalici") this.kaliciBaslat(k);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Karakterler
  // -------------------------------------------------------------------------

  private karakterBul(id: string | undefined): KarakterVarligi {
    return this.v.karakterler.find((k) => k.id === id) ?? this.v.karakterler[0] ?? { id: "yok", ad: "", roller: [], dosya: "", en: 1, boy: 3 };
  }

  /** Karakteri kurar ve sahneye ekler; yerini kisiyiYerlestir verir (masalar atandıktan sonra) */
  private kisiOlustur(a: Ajan): Kisi {
    const karakter = this.karakterBul(this.atamalar.get(a.id));
    const dugme = document.createElement("button");
    dugme.type = "button";
    dugme.className = "ofis-kisi";
    dugme.dataset.ajan = a.id;
    const golge = document.createElement("span");
    golge.className = "ofis-kisi-golge";
    const halka = document.createElement("span");
    halka.className = "ofis-kisi-halka";
    const govde = document.createElement("span");
    govde.className = "ofis-kisi-govde";
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    const arkaImg = document.createElement("img");
    arkaImg.className = "ofis-kisi-arka";
    arkaImg.alt = "";
    arkaImg.draggable = false;
    arkaImg.decoding = "async";
    govde.append(img, arkaImg);
    dugme.append(golge, halka, govde);

    const ust = document.createElement("div");
    ust.className = "ofis-kisi-ust";
    ust.dataset.ajan = a.id;
    const isaretEl = document.createElement("span");
    isaretEl.className = "ofis-isaret";
    const etiket = document.createElement("span");
    etiket.className = "ofis-ad";
    const adEl = document.createElement("span");
    etiket.append(document.createElement("i"), adEl);
    const isEl = document.createElement("span");
    isEl.className = "ofis-is";
    // Düşünme noktaları ve sözsüz konuşma göstergesi: başın üstünde küçük balon (CSS ile akar)
    const dusunceEl = document.createElement("span");
    dusunceEl.className = "ofis-dusunce";
    dusunceEl.setAttribute("aria-hidden", "true");
    dusunceEl.innerHTML = '<i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i>';
    ust.append(dusunceEl, isaretEl, etiket, isEl);
    const eldeEl = document.createElement("div");
    eldeEl.className = "ofis-elde";
    eldeEl.hidden = true;

    const k: Kisi = {
      id: a.id,
      ajan: a,
      karakter,
      en: 30,
      boy: KARAKTER_BOYU,
      dugme,
      govde,
      img,
      arkaImg,
      arkadan: false,
      golge,
      halka,
      ust,
      isaretEl,
      adEl,
      isEl,
      eldeEl,
      x: 0,
      y: 0,
      ax: 0,
      ay: 0,
      yon: 1,
      faz: 0,
      nefesFaz: Math.random() * Math.PI * 2,
      yol: null,
      yolI: 0,
      hiz: HIZ_EN_AZ,
      gecis: null,
      isinlan: null,
      kirp: 0,
      oturan: null,
      opaklik: 1,
      hedefOpaklik: 1,
      masa: null,
      is: null,
      kuyruk: [],
      kaliciTur: this.kaliciTuru(a.durum),
      rezerv: null,
      etkinlik: "",
      toplantida: false,
      elde: null,
      eldeAnahtar: "",
      isaret: null,
      uzanma: -SONSUZ,
      aracSimge: null,
      aracEl: null,
      saatBitis: 0,
      saatEl: null,
      cikiyor: false,
      karsilandi: false,
      yerlesti: false,
      yerDurumu: yerDurumu(this.t),
      bakis: "on",
      balonlar: [],
      bekleyenBalon: [],
      dusunceBitis: -SONSUZ,
      dusunceBaslar: SONSUZ,
      dusunceEl,
      yazmaBitis: -SONSUZ,
      ziplaBas: -SONSUZ,
      bostaBas: a.durum === "bosta" ? this.t : SONSUZ,
      sonHareket: this.t,
      kanalYazisi: null,
      konusmaBitis: -SONSUZ,
      sonSorgu: "",
      sonKomut: "",
      yaz: { tf: "", z: -1, govde: "", kirp: "", ust: "", op: "", durum: "", etiket: "", isaret: "", ad: "", is: "", oturan: false, arka: false, dusunce: false, konusma: false },
      sonEtiketZamani: -SONSUZ,
    };
    this.gorselAyarla(k, karakter);
    this.kisiler.set(a.id, k);
    // Sekme sırası: karakterler sıcak noktalardan (eşyalardan) önce gelsin
    const ilkKisiOlmayan = [...this.nesneler.children].find((el) => !el.classList.contains("ofis-kisi")) ?? null;
    this.nesneler.insertBefore(dugme, ilkKisiOlmayan);
    this.ustKatman.append(ust, eldeEl);
    return k;
  }

  /** aninda: ilk açılış ya da ekran kapalıyken gelmiş; yerinde belirir. Değilse kapıdan girer, CEO karşılar. */
  private kisiyiYerlestir(k: Kisi, aninda: boolean) {
    const a = k.ajan;
    if (aninda) {
      k.karsilandi = true;
      this.yerinde(k);
    } else {
      // Kapıdan girer, masasına yürür; CEO karşılar
      const kapi = karoAyak(this.yer.noktalar.kapi);
      k.x = kapi.x;
      k.y = kapi.y;
      k.opaklik = 0;
      k.hedefOpaklik = 1;
      this.akisa("giris", so().akis.geldi(a.ad, a.rolAdi), { ajanId: k.id });
      this.vurgula(karoAyak(this.yer.noktalar.kapiIci), { ajanId: k.id, anahtar: `giris:${k.id}` });
      this.sahneEkle(k, "giris", () => this.girisSahnesi(k));
      // Oturumu açık CEO karşılar; kapalıysa yeni gelen beklemeden işine bakar
      const ceo = this.ceo();
      if (ceo && ceo !== k && ceo.ajan.durum !== "kapali") this.sahneEkle(ceo, "karsilama", () => this.karsilamaSahnesi(ceo, k));
      else k.karsilandi = true;
    }
  }

  private gorselAyarla(k: Kisi, karakter: KarakterVarligi) {
    k.karakter = karakter;
    k.en = (KARAKTER_BOYU * karakter.en) / karakter.boy;
    k.img.src = karakter.dosya ? varlikAdresi(karakter.dosya) : "";
    // Arkadan görünüş önceden yüklenir; dönüşte titreme olmaz
    if (karakter.arka) k.arkaImg.src = varlikAdresi(karakter.arka.dosya);
    else k.arkaImg.removeAttribute("src");
    k.arkadan = false;
    k.img.onload = () => {
      if (k.img.naturalWidth && k.img.naturalHeight) {
        k.en = (KARAKTER_BOYU * k.img.naturalWidth) / k.img.naturalHeight;
        k.yaz.tf = "";
        this.boyutYaz(k);
      }
    };
    this.boyutYaz(k);
  }

  private boyutYaz(k: Kisi) {
    k.dugme.style.width = `${k.en}px`;
    k.dugme.style.height = `${k.boy}px`;
  }

  private karakterDegistir(k: Kisi, id: string) {
    this.gorselAyarla(k, this.karakterBul(id));
  }

  /** Kalıcı hedefine animasyonsuz yerleştirir (ilk açılış) */
  private yerinde(k: Kisi) {
    const tur = this.kaliciTuru(k.ajan.durum);
    if ((tur === "masa" || tur === "calisma") && k.masa) {
      this.oturt(k, k.masa);
    } else if (tur === "kurul") {
      const karo = this.rezerveEt(k, this.yer.noktalar.kurulBekleme[0]!, this.yer.noktalar.kurulBekleme);
      const a = karoAyak(karo);
      k.x = a.x;
      k.y = a.y;
    } else {
      // Boştaki kişi sevdiği yerde, duraklatılmış olan kanepede ya da mutfakta başlar; kimliğine göre seçilen
      // karo her açılışta aynı
      const tohum = ozet(k.id);
      const liste = tur === "durak" ? this.durakKarolari() : this.sevdigiKarolar(k);
      const i = tohum % liste.length;
      const sirali = [...liste.slice(i), ...liste.slice(0, i)];
      const karo = this.rezerveEt(k, sirali[0]!, sirali);
      const a = karoAyak(karo);
      k.x = a.x;
      k.y = a.y;
      k.yon = tohum % 2 ? 1 : -1;
      k.yerlesti = true;
    }
    this.kaliciBaslat(k);
  }

  private oturt(k: Kisi, koltuk: Koltuk) {
    this.rezervBirak(k);
    k.oturan = koltuk;
    k.x = koltuk.oturma.x;
    k.y = koltuk.oturma.y;
    k.kirp = Math.max(0, (koltuk.oturma.y - koltuk.kesit) / k.boy);
    k.yol = null;
    k.gecis = null;
  }

  private ceo(): Kisi | undefined {
    const liste = [...this.kisiler.values()].filter((k) => !k.cikiyor);
    return liste.find((k) => k.ajan.rol === "ceo") ?? liste.find((k) => k.ajan.yoneticiId === null);
  }

  private kaliciTuru(d: AjanDurumu): KaliciTur {
    if (d === "calisiyor") return "calisma";
    if (d === "karar_bekliyor") return "kurul";
    if (d === "bosta") return "dinlen";
    if (d === "duraklatildi") return "durak";
    // hata: masasında, belirgin işaretle; kapali: masasında uyur
    return "masa";
  }

  private toplantiSuruyor(): boolean {
    return !!this.toplanti && this.t < this.toplanti.bitis;
  }

  /** Adıyla kişi (araç girdisindeki "Kerem", "@kerem") */
  private adlaKisi(ad: string): Kisi | undefined {
    const aranan = ad.replace(/^@/, "").trim().toLocaleLowerCase("tr-TR");
    if (!aranan) return undefined;
    return [...this.kisiler.values()].find((k) => !k.cikiyor && k.ajan.ad.toLocaleLowerCase("tr-TR") === aranan);
  }

  private durumDegisti(k: Kisi, eski: AjanDurumu, sessiz = false) {
    const yeni = k.ajan.durum;
    const tur = this.kaliciTuru(yeni);
    if (sessiz) {
      // ekran kapalıyken oldu: akışa yazılmaz
    } else if (yeni === "karar_bekliyor") this.akisa("onay", so().akis.kurulMasasinda(k.ajan.ad), { ajanId: k.id });
    else if (eski === "karar_bekliyor" && yeni === "calisiyor") this.akisa("onay", so().akis.masasinaDondu(k.ajan.ad), { ajanId: k.id });
    else if (yeni === "hata") this.akisa("bildirim", so().akis.oturumHatasi(k.ajan.ad), { ajanId: k.id });
    // İşe yeni başladı: henüz bir yere yerleşmedi, ilk işi onu beklemeden yerine götürür
    if (yeni === "calisiyor" && eski !== "calisiyor") k.yerDurumu = yerDurumu(this.t);
    // Boşta kalma süresi uyuklamayı belirler; çalışmayan düşünmez
    k.bostaBas = yeni === "bosta" ? (eski === "bosta" ? k.bostaBas : this.t) : SONSUZ;
    if (yeni !== "calisiyor") {
      k.dusunceBitis = -SONSUZ;
      k.dusunceBaslar = SONSUZ;
    }
    if (tur !== k.kaliciTur) {
      k.kaliciTur = tur;
      if (!k.is || k.is.tur === "kalici") this.kaliciBaslat(k);
    }
  }

  private kisiAyrildi(k: Kisi, aninda = false) {
    k.cikiyor = true;
    k.kuyruk = [];
    if (aninda) {
      // Ekran kapalıyken gitti: sahnesiz kalkar
      this.isiBitir(k);
      this.kisiKaldir(k);
      return;
    }
    this.akisa("cikis", so().akis.ayrildi(k.ajan.ad), { nokta: karoAyak(this.yer.noktalar.kapiIci) });
    this.vurgula({ x: k.x, y: k.y }, { ajanId: k.id, anahtar: `cikis:${k.id}` });
    this.isiBitir(k);
    this.sahneBaslat(k, { ad: "cikis", gen: () => this.cikisSahnesi(k) });
  }

  private kisiKaldir(k: Kisi) {
    this.rezervBirak(k);
    for (const [koltuk, sahip] of this.koltukSahipleri) if (sahip === k.id) this.koltukSahipleri.delete(koltuk);
    for (const b of k.balonlar) b.el.remove();
    this.balonlar = this.balonlar.filter((b) => b.kisi !== k);
    k.dugme.remove();
    k.ust.remove();
    k.eldeEl.remove();
    k.aracEl?.remove();
    k.saatEl?.remove();
    if (this.ipucuKisi === k) this.ipucuGizle();
    this.kisiler.delete(k.id);
    if (this.takipId === k.id) this.takipEt(null);
    this.masalariAta();
    this.ozetiGuncelle();
  }

  // -------------------------------------------------------------------------
  // Rezervasyon (aynı karoda iki kişi durmasın)
  // -------------------------------------------------------------------------

  private karoNo(k: Karo) {
    return k.r * this.yer.sutun + k.c;
  }

  private rezervBirak(k: Kisi) {
    if (k.rezerv !== null && this.rezervler.get(k.rezerv) === k.id) this.rezervler.delete(k.rezerv);
    k.rezerv = null;
  }

  /** Hedefe en yakın boş karoyu ayırır; adaylar verilirse önce onlar denenir */
  private rezerveEt(k: Kisi, hedef: Karo, adaylar?: Karo[]): Karo {
    this.rezervBirak(k);
    const dolu = (c: number, r: number) => {
      const sahip = this.rezervler.get(r * this.yer.sutun + c);
      return sahip !== undefined && sahip !== k.id;
    };
    let secilen: Karo | null = null;
    if (adaylar) secilen = adaylar.find((a) => yurunebilirMi(this.yer, a) && !dolu(a.c, a.r)) ?? null;
    secilen ??= yakinBos(this.yer, hedef, dolu) ?? hedef;
    k.rezerv = this.karoNo(secilen);
    this.rezervler.set(k.rezerv, k.id);
    return secilen;
  }

  // -------------------------------------------------------------------------
  // Davranış: kalıcı hedef ve sahneler
  // -------------------------------------------------------------------------

  private bekle(ms: number): Kosul {
    const son = this.t + ms;
    return { bitti: () => this.t >= son, sinir: son + 1 };
  }

  private kosul(bitti: () => boolean, ms: number): Kosul {
    return { bitti, sinir: this.t + ms };
  }

  private sonsuz(): Kosul {
    return { bitti: () => false, sinir: SONSUZ };
  }

  private isiBitir(k: Kisi) {
    if (!k.is) return;
    try {
      k.is.gen.return();
    } catch {
      // üreteç zaten bitti
    }
    k.is.son?.();
    k.is = null;
  }

  private kaliciBaslat(k: Kisi) {
    if (k.cikiyor) return;
    this.isiBitir(k);
    const tur = this.kaliciTuru(k.ajan.durum);
    k.kaliciTur = tur;
    const gen =
      tur === "calisma"
        ? this.calismaDavranisi(k)
        : tur === "masa"
          ? this.masaDavranisi(k)
          : tur === "kurul"
            ? this.kurulDavranisi(k)
            : tur === "durak"
              ? this.durakDavranisi(k)
              : this.dinlenmeDavranisi(k);
    k.is = { tur: "kalici", ad: tur, gen, kosul: null };
  }

  private sahneEkle(k: Kisi, ad: string, gen: () => Senaryo, son?: () => void, oncelikli = false) {
    if (k.cikiyor) return;
    if (!k.is || k.is.tur === "kalici") {
      this.sahneBaslat(k, { ad, gen, son });
      return;
    }
    // En çok üç bekleyen sahne; taşınca öncelikli olmayanların en eskisi düşer
    if (oncelikli) {
      // Önceki öncelikli sahnelerin ardına, sıradakilerin önüne
      const i = k.kuyruk.findIndex((x) => !x.oncelikli);
      k.kuyruk.splice(i < 0 ? k.kuyruk.length : i, 0, { ad, gen, son, oncelikli });
    } else k.kuyruk.push({ ad, gen, son });
    if (k.kuyruk.length > 3) {
      const i = k.kuyruk.findIndex((x) => !x.oncelikli);
      k.kuyruk.splice(i < 0 ? 0 : i, 1);
    }
  }

  private sahneBaslat(k: Kisi, s: { ad: string; gen: () => Senaryo; son?: () => void }) {
    this.isiBitir(k);
    k.is = { tur: "sahne", ad: s.ad, gen: s.gen(), kosul: null, son: s.son };
  }

  private isiIlerlet(k: Kisi) {
    if (!k.is) {
      const sonraki = k.kuyruk.shift();
      if (sonraki) this.sahneBaslat(k, sonraki);
      else this.kaliciBaslat(k);
      if (!k.is) return;
    }
    const is = k.is;
    // En çok birkaç adım: koşulu hemen sağlanan adımlar aynı karede ilerlesin
    for (let i = 0; i < 6; i++) {
      if (is.kosul) {
        const zaman = this.t >= is.kosul.sinir;
        if (!is.kosul.bitti() && !zaman) return;
        if (zaman && !is.kosul.bitti()) this.zamanAsimi(k);
      }
      let r: IteratorResult<Kosul, void>;
      try {
        r = is.gen.next();
      } catch (e) {
        console.error("Ofis sahnesi hata verdi", e);
        r = { done: true, value: undefined };
      }
      if (r.done) {
        is.son?.();
        if (k.is === is) k.is = null;
        if (is.tur === "sahne" && !k.cikiyor) {
          const sonraki = k.kuyruk.shift();
          if (sonraki) this.sahneBaslat(k, sonraki);
          else this.kaliciBaslat(k);
        }
        return;
      }
      is.kosul = r.value;
    }
  }

  /** Süresi dolan adım: yürüyüşse hedefe ışınlanır */
  private zamanAsimi(k: Kisi) {
    if (k.yol && k.yol.length) {
      const son = k.yol[k.yol.length - 1]!;
      k.x = son.x;
      k.y = son.y;
      k.yol = null;
    }
    if (k.gecis) {
      k.x = k.gecis.son.x;
      k.y = k.gecis.son.y;
      k.kirp = k.gecis.kirpSon;
      k.gecis = null;
    }
  }

  // ---- hareket ilkelleri ----

  private hareketsiz(k: Kisi) {
    return !k.yol && !k.gecis && !k.isinlan;
  }

  /** Oturuyorsa kalkar: koltuktan yaklaşma karosuna kısa geçiş */
  private kalk(k: Kisi): Kosul {
    const koltuk = k.oturan;
    if (!koltuk) return this.bekle(0);
    if (this.koltukSahipleri.get(koltuk) === k.id) this.koltukSahipleri.delete(koltuk);
    k.oturan = null;
    const son = karoAyak(koltuk.yaklasma);
    son.x = koltuk.oturma.x;
    k.gecis = { bas: { x: k.x, y: k.y }, son, t0: this.t, sure: this.azHareket ? 1 : 260, kirpBas: k.kirp, kirpSon: 0 };
    return this.kosul(() => !k.gecis, 1500);
  }

  private otur(k: Kisi, koltuk: Koltuk): Kosul {
    this.rezervBirak(k);
    k.oturan = koltuk;
    this.koltukSahipleri.set(koltuk, k.id);
    const kirp = Math.max(0, (koltuk.oturma.y - koltuk.kesit) / k.boy);
    k.gecis = { bas: { x: k.x, y: k.y }, son: { ...koltuk.oturma }, t0: this.t, sure: this.azHareket ? 1 : 300, kirpBas: k.kirp, kirpSon: kirp };
    k.yon = 1;
    return this.kosul(() => !k.gecis, 1500);
  }

  /** Karoya yürür (gerekirse ayırır). Yol yoksa ışınlanır. */
  private yuru(k: Kisi, hedef: Karo, secenek: { ayir?: boolean; nokta?: Nokta; adaylar?: Karo[] } = {}): Kosul {
    // Yürürken ve yeni yerinde önce yüzü dönük; eşyaya bakacaksa çağıran yeniden çevirir
    k.bakis = "on";
    const karo = secenek.ayir === false ? hedef : this.rezerveEt(k, hedef, secenek.adaylar);
    const hedefNokta = secenek.nokta ?? karoAyak(karo);
    const bas = { x: k.x, y: k.y };
    const basKaro = enYakinAcik(this.yer, bas);
    if (Math.hypot(hedefNokta.x - bas.x, hedefNokta.y - bas.y) < 2) return this.bekle(0);
    if (this.azHareket) {
      k.isinlan = { hedef: hedefNokta, t0: this.t };
      return this.kosul(() => !k.isinlan, 2000);
    }
    const yol = rota(this.yer, bas, basKaro, karo, hedefNokta);
    if (!yol) {
      k.isinlan = { hedef: hedefNokta, t0: this.t };
      return this.kosul(() => !k.isinlan, 2000);
    }
    const uz = uzunluk(yol);
    k.hiz = Math.min(HIZ_EN_COK, Math.max(HIZ_EN_AZ, uz / 5.5));
    k.yol = yol;
    k.yolI = 1;
    return this.kosul(() => !k.yol, (uz / k.hiz) * 1000 + 4000);
  }

  private *git(k: Kisi, hedef: Karo, secenek: { ayir?: boolean; nokta?: Nokta; adaylar?: Karo[] } = {}): Senaryo {
    if (k.oturan) yield this.kalk(k);
    yield this.yuru(k, hedef, secenek);
  }

  private *koltugaGit(k: Kisi, koltuk: Koltuk): Senaryo {
    if (k.oturan === koltuk) return;
    if (k.oturan) yield this.kalk(k);
    yield this.yuru(k, koltuk.yaklasma, { ayir: false, nokta: { x: koltuk.oturma.x, y: karoAyak(koltuk.yaklasma).y } });
    yield this.otur(k, koltuk);
  }

  /** Bir başkasının yanına: aynı satırda sağ ya da sol komşu karo; oturuyorsa masasının arkasındaki koridora */
  private *yaninaGit(k: Kisi, hedef: Kisi): Senaryo {
    for (let deneme = 0; deneme < 2; deneme++) {
      const merkez = hedef.oturan ? hedef.oturan.yaklasma : noktaKarosu(hedef);
      const taraf = k.x <= hedef.x ? -1 : 1;
      const adaylar: Karo[] = [
        { c: merkez.c + taraf, r: merkez.r },
        { c: merkez.c - taraf, r: merkez.r },
        { c: merkez.c + taraf, r: merkez.r + 1 },
        { c: merkez.c - taraf, r: merkez.r + 1 },
        { c: merkez.c + taraf, r: merkez.r - 1 },
      ];
      yield* this.git(k, merkez, { adaylar });
      // Karşıdaki bu arada çok uzaklaştıysa bir kez daha yaklaş
      if (Math.hypot(hedef.x - k.x, hedef.y - k.y) < KARO * 2.6 || hedef.oturan) break;
    }
    this.yuzlestir(k, hedef);
    if (!hedef.oturan && this.hareketsiz(hedef)) this.yuzlestir(hedef, k);
  }

  private yuzlestir(k: Kisi, hedef: Nokta) {
    if (Math.abs(hedef.x - k.x) > 2) k.yon = hedef.x > k.x ? 1 : -1;
  }

  // ---- kalıcı davranışlar ----

  private yerAnahtari(k: Kisi): string {
    const d = k.yerDurumu;
    return d.yer === "kisi" ? `kisi:${d.kisi ?? ""}` : d.yer;
  }

  /**
   * Çalışan: işine göre yerde durur (masası, görev panosu, arşiv, kurul masası, beyaz tahta, kütüphane, test
   * laboratuvarı, stüdyo, sunucu dolabı ya da bir iş arkadaşının yanı). Yer kararı etkinlikYeri.ts'te verilir;
   * değişince oraya yürür.
   */
  private *calismaDavranisi(k: Kisi): Senaryo {
    for (;;) {
      const bas = { x: k.x, y: k.y, oturan: k.oturan };
      yield* this.yereGit(k);
      // Varış yalnız yürüyerek gelince sayılır: açılışta yerinde duran çoktandır oradadır, beklemeden kalkabilir
      if (Math.hypot(k.x - bas.x, k.y - bas.y) > 2 || k.oturan !== bas.oturan) yerVarisi(k.yerDurumu, this.t);
      const anahtar = this.yerAnahtari(k);
      const hedef = k.yerDurumu.yer === "kisi" ? this.kisiler.get(k.yerDurumu.kisi ?? "") : undefined;
      const hx = hedef?.x ?? 0;
      const hy = hedef?.y ?? 0;
      // Yer değişene ya da yanına gidilen kişi uzaklaşana kadar burada
      yield this.kosul(() => this.yerAnahtari(k) !== anahtar || (!!hedef && (hedef.cikiyor || Math.hypot(hedef.x - hx, hedef.y - hy) > KARO * 3)), SONSUZ);
    }
  }

  /** Karar verilen yere gider; masa dışındaki yerlerde ilgili eşyaya döner */
  private *yereGit(k: Kisi): Senaryo {
    const n = this.yer.noktalar;
    const d = k.yerDurumu;
    const yakindan = (liste: Karo[]) => [...liste].sort((a, b) => Math.abs(karoAyak(a).x - k.x) - Math.abs(karoAyak(b).x - k.x));
    const bak = (kimlik: string) => {
      const e = this.yer.esyalar.find((x) => x.kimlik === kimlik);
      if (e) this.yuzlestir(k, e);
      k.bakis = "arka";
    };
    switch (d.yer) {
      case "pano":
        yield* this.git(k, n.panoOnu[0]!, { adaylar: yakindan(n.panoOnu) });
        k.bakis = "arka";
        return;
      case "kisi": {
        const h = d.kisi ? this.kisiler.get(d.kisi) : undefined;
        if (h && h !== k && !h.cikiyor) {
          yield* this.yaninaGit(k, h);
          return;
        }
        // Yanına gidilecek kişi yok: masasına döner
        d.yer = "masa";
        delete d.kisi;
        break;
      }
      case "arsiv":
        yield* this.git(k, n.arsivOnu[0]!, { adaylar: n.arsivOnu });
        bak(n.arsivKimligi);
        return;
      case "kurul": {
        yield* this.git(k, n.kurulBekleme[0]!, { adaylar: n.kurulBekleme });
        const km = this.yer.esyalar.find((e) => e.kimlik === n.kurulMasasiKimligi);
        if (km) this.yuzlestir(k, km);
        return;
      }
      case "tahta":
        // Toplantı sürerken odaya girilmez: rapor panonun önünde hazırlanır
        if (this.toplantiSuruyor()) {
          yield* this.git(k, n.panoOnu[0]!, { adaylar: yakindan(n.panoOnu) });
          k.bakis = "arka";
        } else {
          yield* this.git(k, n.beyazTahtaOnu[0]!, { adaylar: n.beyazTahtaOnu });
          bak(n.beyazTahtaKimligi);
        }
        return;
      case "arastirma":
        // Okuma masasında boş koltuk varsa oturur; yoksa rafların ya da ekranın önünde ayakta
        if (yield* this.koltukta(k, n.arastirmaKoltuklari)) return;
        yield* this.git(k, n.arastirmaOnu[0]!, { adaylar: yakindan(n.arastirmaOnu) });
        k.bakis = "arka";
        return;
      case "laboratuvar":
        // Boş test istasyonunda oturur; yoksa test cihazlarının ya da panonun önünde
        if (yield* this.koltukta(k, this.istasyonlar("laboratuvar"))) return;
        yield* this.git(k, n.labOnu[0]!, { adaylar: n.labOnu });
        k.bakis = "arka";
        return;
      case "sunum":
        // Sahnede, ekranın yanında; kurula (izleyene) dönük
        yield* this.git(k, n.sunumNoktasi);
        k.yon = 1;
        return;
      case "tasarim":
      case "tanitim":
        if (yield* this.koltukta(k, this.istasyonlar("studyo"))) return;
        yield* this.git(k, n.studyoOnu[0]!, { adaylar: n.studyoOnu });
        bak("studyo-tahta");
        return;
      case "sunucu":
        yield* this.git(k, n.sunucuOnu[0]!, { adaylar: n.sunucuOnu });
        k.yon = -1;
        k.bakis = "arka";
        return;
      default:
        break;
    }
    if (k.masa) {
      if (k.oturan !== k.masa) yield* this.koltugaGit(k, k.masa);
    } else yield* this.git(k, n.kahve);
  }

  /** Kanat odasının istasyonları (test istasyonları ya da tasarım masası) */
  private istasyonlar(oda: Istasyon["oda"]): Istasyon[] {
    return this.yer.istasyonlar.filter((i) => i.oda === oda);
  }

  /**
   * Listedeki boş koltuklardan en yakınına yürüyüp oturur (yola çıkmadan ayırır, iki kişi aynı koltuğa gitmesin).
   * Oturduysa true; hepsi doluysa false. Yarıda kesilirse ayırma bırakılır.
   */
  private *koltukta(k: Kisi, liste: readonly Koltuk[]): Generator<Kosul, boolean, void> {
    if (k.oturan && liste.includes(k.oturan)) return true;
    const bos = [...liste].sort((a, b) => Math.abs(a.oturma.x - k.x) - Math.abs(b.oturma.x - k.x)).find((kt) => !this.koltukSahipleri.has(kt));
    if (!bos) return false;
    this.koltukSahipleri.set(bos, k.id);
    try {
      yield* this.koltugaGit(k, bos);
    } finally {
      if (k.oturan !== bos && this.koltukSahipleri.get(bos) === k.id) this.koltukSahipleri.delete(bos);
    }
    return k.oturan === bos;
  }

  private *masaDavranisi(k: Kisi): Senaryo {
    if (!k.masa) {
      yield* this.dinlenmeDavranisi(k);
      return;
    }
    if (k.oturan !== k.masa) yield* this.koltugaGit(k, k.masa);
    yield this.sonsuz();
  }

  /** Kanepenin önü ve kahve makinesi: duraklatılmış (kullanım sınırı ya da kurul) olanın beklediği yerler */
  private durakKarolari(): Karo[] {
    const n = this.yer.noktalar;
    return [...n.kanepeOnu, n.kahve];
  }

  /** Duraklatıldı: kanepede ya da mutfakta bekler, ortalıkta dolaşmaz */
  private *durakDavranisi(k: Kisi): Senaryo {
    const liste = this.durakKarolari();
    const i = ozet(k.id) % liste.length;
    try {
      if (k.yerlesti) k.yerlesti = false;
      else {
        if (k.oturan) yield this.bekle(rastgele(800, 2000));
        yield* this.git(k, liste[i]!, { adaylar: [...liste.slice(i), ...liste.slice(0, i)] });
      }
      k.yon = ozet(k.id) % 2 ? 1 : -1;
      if (ozet(k.id) % 3 === 0) k.elde = { simge: "fincan" };
      yield this.sonsuz();
    } finally {
      k.elde = null;
    }
  }

  private *kurulDavranisi(k: Kisi): Senaryo {
    const n = this.yer.noktalar;
    yield* this.git(k, n.kurulBekleme[0]!, { adaylar: n.kurulBekleme });
    const km = this.yer.esyalar.find((e) => e.kimlik === n.kurulMasasiKimligi);
    if (km) this.yuzlestir(k, km);
    yield this.sonsuz();
  }

  private *dinlenmeDavranisi(k: Kisi): Senaryo {
    const n = this.yer.noktalar;
    const kisilik = karakterBul(k.karakter.id);
    if (k.yerlesti) {
      // Ofis açılırken yerine kondu: bir süre orada kalır
      k.yerlesti = false;
      yield this.bekle(rastgele(9000, 18000));
    }
    if (k.oturan) yield this.bekle(rastgele(1200, 3600));
    let ilk = true;
    for (;;) {
      // Uzun süredir boşta: kanepeye gidip uyuklar (uzun kalır; başında çizilmiş "z" işareti)
      if (this.t - k.bostaBas > UYUKLAMA && Math.random() < 0.55) {
        yield* this.git(k, sec(n.kanepeOnu) ?? n.kahve, { adaylar: [...n.kanepeOnu].sort(() => Math.random() - 0.5) });
        k.yon = Math.random() < 0.5 ? 1 : -1;
        yield this.bekle(rastgele(26000, 52000));
        continue;
      }
      // Karakterin kişiliği: zamanının bir kısmını sevdiği yerde geçirir
      if (kisilik && Math.random() < (ilk ? 0.5 : 0.4)) {
        ilk = false;
        yield* this.sevdigiYerde(k, kisilik);
        continue;
      }
      const zar = Math.random();
      const kahve = ilk ? zar < 0.55 : zar < 0.3;
      ilk = false;
      if (kahve) {
        yield* this.git(k, n.kahve);
        k.yon = 1;
        yield this.bekle(rastgele(2600, 3800));
        k.elde = { simge: "fincan" };
        yield* this.git(k, sec(n.dinlenme) ?? n.kahve);
        k.yon = Math.random() < 0.5 ? 1 : -1;
        yield this.bekle(rastgele(6000, 11000));
        k.elde = null;
      } else if (zar < 0.45) {
        yield* this.git(k, n.su);
        k.yon = 1;
        yield this.bekle(rastgele(2000, 3000));
        k.elde = { simge: "bardak" };
        yield this.bekle(rastgele(2500, 4000));
        k.elde = null;
      } else if (zar < 0.7) {
        yield* this.git(k, sec(n.kanepeOnu) ?? n.kahve, { adaylar: [...n.kanepeOnu].sort(() => Math.random() - 0.5) });
        k.yon = Math.random() < 0.5 ? 1 : -1;
        yield this.bekle(rastgele(6000, 12000));
      } else {
        yield* this.git(k, sec(n.dinlenme) ?? n.kahve);
        k.yon = Math.random() < 0.5 ? 1 : -1;
        yield this.bekle(rastgele(4000, 9000));
      }
    }
  }

  /** Kişiliğin sevdiği yere gider, oyalanır, ara sıra kendi sözlerinden birini söyler */
  /** Karakterin sevdiği yerin karoları (karakterler.ts'teki OfisYeri); kişiliği yoksa dinlenme alanı */
  private sevdigiKarolar(k: Kisi): Karo[] {
    const n = this.yer.noktalar;
    const kisilik = karakterBul(k.karakter.id);
    if (!kisilik) return n.dinlenme;
    const toplantiSuruyor = !!this.toplanti && this.t < this.toplanti.bitis;
    const yerler: Record<OfisYeri, Karo[]> = {
      kahve: [n.kahve],
      otomat: [n.kahve],
      su: [n.su],
      kanepe: n.kanepeOnu,
      "masa-tenisi": n.kanepeOnu,
      kitaplik: [...n.okumaKosesi, ...n.arsivOnu, ...n.arastirmaOnu],
      sunucu: [...n.sunucuOnu, ...n.labOnu],
      // Toplantı sürerken odaya girilmez; stüdyonun taslak tahtası her zaman açık
      "beyaz-tahta": toplantiSuruyor ? n.studyoOnu : [...n.beyazTahtaOnu, ...n.studyoOnu],
      bitki: n.dinlenme,
      pencere: n.dinlenme,
    };
    return yerler[kisilik.sevdigiYer].length ? yerler[kisilik.sevdigiYer] : n.dinlenme;
  }

  private *sevdigiYerde(k: Kisi, kisilik: KarakterTanimi): Senaryo {
    const n = this.yer.noktalar;
    const liste = this.sevdigiKarolar(k);
    const hedef = sec(liste) ?? n.kahve;
    yield* this.git(k, hedef, liste.length > 1 ? { adaylar: [...liste].sort(() => Math.random() - 0.5) } : {});
    k.yon = Math.random() < 0.5 ? 1 : -1;
    yield this.bekle(rastgele(1800, 3200));
    if (kisilik.sevdigiYer === "kahve" || kisilik.sevdigiYer === "otomat") k.elde = { simge: "fincan" };
    else if (kisilik.sevdigiYer === "su") k.elde = { simge: "bardak" };
    if (Math.random() < 0.45) {
      const soz = sec(karakterMetni(kisilik, useDilDurumu.getState().dil).sozler);
      if (soz) this.balon(k, soz, "kisa");
    }
    yield this.bekle(rastgele(6000, 11000));
    k.elde = null;
  }

  // ---- sahneler ----

  /** Yeni gelen kapıdan girer, masasına oturur ve CEO'nun karşılamasını bekler */
  private *girisSahnesi(k: Kisi): Senaryo {
    k.etkinlik = so().etkinlik.yeniGeldi;
    yield this.bekle(300);
    yield* this.git(k, this.yer.noktalar.kapiIci);
    if (k.masa) {
      k.etkinlik = so().etkinlik.yerlesiyor;
      yield* this.koltugaGit(k, k.masa);
      const ceo = this.ceo();
      if (ceo && ceo !== k) yield this.kosul(() => k.karsilandi, 16000);
      yield this.bekle(1200);
    }
  }

  private *cikisSahnesi(k: Kisi): Senaryo {
    k.etkinlik = so().etkinlik.ayriliyor;
    k.elde = null;
    yield* this.git(k, this.yer.noktalar.kapi, { ayir: false });
    k.hedefOpaklik = 0;
    yield this.kosul(() => k.opaklik <= 0.02, 1500);
    this.kisiKaldir(k);
  }

  private *karsilamaSahnesi(ceo: Kisi, yeni: Kisi): Senaryo {
    yield this.bekle(1200);
    // Yeni gelen masasına yerleşsin
    yield this.kosul(() => yeni.oturan !== null || yeni.cikiyor, 16000);
    if (yeni.cikiyor || !this.kisiler.has(yeni.id)) return;
    ceo.etkinlik = so().etkinlik.tanisiyor(yeni.ajan.ad);
    try {
      yield* this.yaninaGit(ceo, yeni);
      this.isaretKoy(yeni, "unlem", 2400);
      const b = this.balon(ceo, so().balon.hosGeldin(yeni.ajan.ad), "konusma");
      yield this.balonBitene(b);
      this.balon(yeni, so().balon.tesekkurler, "kisa");
      yield this.bekle(1600);
    } finally {
      yeni.karsilandi = true;
    }
  }

  /**
   * Anmalı mesajdan sonra yüz yüze: mesaj kısa balonla ve ışık iziyle çoktan gitti; yazan anılanın yanına yürür
   * ve ikisi sözsüz konuşur (başlarında konuşma göstergesi). Metin bir daha yazılmaz.
   */
  private *konusmaSahnesi(g: Kisi, a: Kisi, digerleri: Kisi[]): Senaryo {
    g.etkinlik = so().etkinlik.konusuyor(a.ajan.ad);
    yield* this.yaninaGit(g, a);
    const sure = 2600;
    g.konusmaBitis = this.t + sure;
    if (!a.cikiyor) a.konusmaBitis = this.t + sure;
    for (const d of digerleri) this.isaretKoy(d, "unlem", 2000);
    yield this.bekle(sure + 300);
  }

  private *belgeSahnesi(o: Kisi, r: Kisi, kod: string): Senaryo {
    o.etkinlik = so().etkinlik.incelemeyeGoturuyor(kod);
    o.elde = { simge: "belge", metin: kod };
    yield* this.yaninaGit(o, r);
    this.isaretKoy(r, "unlem", 2600);
    const b = this.balon(o, so().balon.incelemeyeHazir(kod), "konusma");
    yield this.balonBitene(b);
    o.elde = null;
    this.balon(r, so().balon.bakiyorum, "kisa");
    yield this.bekle(900);
  }

  private *birlesmeSahnesi(k: Kisi, kod: string): Senaryo {
    k.etkinlik = so().etkinlik.birlesiyor(kod);
    yield* this.git(k, this.yer.noktalar.sunucuOnu[0]!, { adaylar: this.yer.noktalar.sunucuOnu });
    k.yon = -1;
    k.uzanma = this.t;
    this.sunucuAkisBitis = this.t + 4800;
    // Vardığında dolapların ışıkları bir kez daha akar
    this.odaFlasi("sunucu", "mercan");
    this.balon(k, so().balon.birlesti(kod), "bilgi", "dal");
    yield this.bekle(3800);
  }

  /** Teslim sunumu sahnesi; aynı kişiye bir dakikada bir */
  private sunumaCagir(k: Kisi, baslik: string) {
    if (k.cikiyor) return;
    if (this.sonSunum && this.sonSunum.ajanId === k.id && this.t - this.sonSunum.t < 60_000) return;
    this.sonSunum = { ajanId: k.id, t: this.t };
    const t0 = this.t;
    this.sahneEkle(k, "sunum", () => this.sunumSahnesi(k, baslik, t0), undefined, true);
  }

  /**
   * Teslim sunumu: teslim eden stüdyonun sahnesine çıkar, ekranın yanında durur; balonda teslimin başlığı, ardından
   * kısa bir sözsüz anlatım. Kişi o sırada uzun bir işteyse (toplantı) gecikmiş sunum oynatılmaz.
   */
  private *sunumSahnesi(k: Kisi, baslik: string, t0: number): Senaryo {
    if (this.t - t0 > 90_000) return;
    k.etkinlik = so().etkinlik.sunumda;
    yield* this.git(k, this.yer.noktalar.sunumNoktasi);
    // Ekran sağında: ona dönük, yüzü izleyene açık
    k.yon = 1;
    const b = this.balon(k, so().balon.teslim(kisaMetin(baslik, 48)), "bilgi", "ekran");
    yield this.balonBitene(b);
    const sure = 4200;
    k.konusmaBitis = this.t + sure;
    yield this.bekle(sure + 400);
  }

  private *arsivSahnesi(k: Kisi, baslik: string): Senaryo {
    k.etkinlik = so().etkinlik.arsiveNot;
    yield* this.git(k, this.yer.noktalar.arsivOnu[0]!, { adaylar: this.yer.noktalar.arsivOnu });
    const raf = this.yer.esyalar.find((e) => e.kimlik === this.yer.noktalar.arsivKimligi);
    if (raf) this.yuzlestir(k, raf);
    k.uzanma = this.t;
    const rafEl = this.nesneler.querySelector<HTMLElement>(`[data-kimlik="${this.yer.noktalar.arsivKimligi}"]`);
    rafEl?.classList.add("ofis-parilti");
    setTimeout(() => rafEl?.classList.remove("ofis-parilti"), 1600);
    this.balon(k, so().balon.notAldi(kisaMetin(baslik, 60)), "bilgi", "kitap");
    yield this.bekle(3400);
  }

  private *soruSahnesi(a: Kisi, b: Kisi, soru: string): Senaryo {
    a.etkinlik = so().etkinlik.soruSoruyor(b.ajan.ad);
    yield* this.yaninaGit(a, b);
    this.isaretKoy(b, "unlem", 3000);
    const bal = this.balon(a, soru, "soru");
    yield this.balonBitene(bal);
    yield this.bekle(400);
  }

  private *toplantiSahnesi(k: Kisi): Senaryo {
    const n = this.yer.noktalar;
    const bosKoltuk = n.toplantiKoltuklari.find((kt) => !this.koltukSahipleri.has(kt));
    const toplanti = this.toplanti;
    k.etkinlik = so().etkinlik.toplantiyaGidiyor;
    try {
      if (bosKoltuk) {
        this.koltukSahipleri.set(bosKoltuk, k.id);
        yield* this.koltugaGit(k, bosKoltuk);
      } else {
        yield* this.git(k, n.toplantiAyakta[0]!, { adaylar: n.toplantiAyakta });
        const masa = this.yer.esyalar.find((e) => e.esya === "toplanti-masasi" && e.sicak === "toplanti");
        if (masa) this.yuzlestir(k, masa);
      }
      k.etkinlik = so().etkinlik.toplantida;
      k.toplantida = true;
      this.toplantiBalonlari(k);
      yield this.kosul(() => !this.toplanti || this.t > this.toplanti.bitis, 125000);
    } finally {
      // Yarıda kalırsa koltuk ve katılım bırakılır
      if (bosKoltuk && k.oturan !== bosKoltuk && this.koltukSahipleri.get(bosKoltuk) === k.id) this.koltukSahipleri.delete(bosKoltuk);
      toplanti?.katilimcilar.delete(k.id);
      k.toplantida = false;
    }
  }

  private balonBitene(b: Balon | null): Kosul {
    if (!b) return this.bekle(2500);
    return this.kosul(() => b.kapaniyor || !b.el.isConnected, 12000);
  }

  // -------------------------------------------------------------------------
  // Olaylar
  // -------------------------------------------------------------------------

  /** Canlı olaylar (store'a uygulandıktan sonra çağrılır) */
  mesajGeldi(m: Mesaj) {
    if (m.projeId !== this.kur.projeId) return;
    const metin = balonMetni(m.metin, 120);
    if (!metin) return;
    const anilan = m.anilanlar.map((id) => this.kisiler.get(id)).filter((k): k is Kisi => !!k && !k.cikiyor);

    if (m.gonderenId === KURUL) {
      let hedefler = anilan;
      if (!hedefler.length && m.kanal === "genel") {
        const c = this.ceo();
        if (c) hedefler = [c];
      }
      if (!hedefler.length) {
        this.akisa("kurul", so().akis.kurulKanala(kanalAdi(m.kanal), kisaMetin(metin, 56)), { nokta: this.odaNoktasi("kurul") });
        return;
      }
      // #toplanti: anılanlar toplantı odasına geçer, kurulun notu zarfla gelir
      if (m.kanal === "toplanti") this.toplantiyaCagir(hedefler, null, "");
      const km = this.yer.esyalar.find((e) => e.kimlik === this.yer.noktalar.kurulMasasiKimligi)!;
      for (const h of hedefler) {
        this.zarfGonder({ x: km.x, y: km.y - km.yukseklik }, h, () => this.balon(h, metin, "kurul", undefined, so().balon.kurul));
      }
      this.akisa("kurul", so().akis.kuruldan(hedefler.map((h) => h.ajan.ad).join(", "), kisaMetin(metin, 56)), { ajanId: hedefler[0]?.id });
      return;
    }

    const g = this.kisiler.get(m.gonderenId);
    if (!g || g.cikiyor) return;
    if (m.kanal === "toplanti") {
      // Çağıranın duyurusu ("Toplantı: <gündem>\nKatılımcılar: @A @B", İngilizcede "Meeting: …"); dilden bağımsız
      // yapısından tanınır, katılımcılar anılanlardır. Görüşler gelene kadar oda dolu kalır.
      const duyuru = toplantiDuyurusu(m.metin);
      if (duyuru !== null) {
        const gundem = balonMetni(duyuru, 110);
        this.toplantiyaCagir([g, ...anilan], g, so().balon.toplanti(gundem), 120000);
        this.akisa("toplanti", so().akis.toplanti(g.ajan.ad, kisaMetin(gundem, 48), anilan.map((a) => a.ajan.ad).join(", ")), { ajanId: g.id });
      } else {
        this.toplantiyaCagir([g, ...anilan], g, metin);
        this.akisa("toplanti", so().akis.toplantiMesaji(g.ajan.ad, kisaMetin(metin, 52)), { ajanId: g.id });
      }
      return;
    }
    let alicilar = anilan.filter((a) => a !== g);
    if (!alicilar.length && m.kanal === "genel") {
      const c = this.ceo();
      if (c && c !== g) alicilar = [c];
    }
    // Hemen: yazanın başında mesajın ilk ~40 karakteri (4 sn), anılanlara doğru ışık izi
    this.kisaBalon(g, balonMetni(m.metin, KISA_BALON), m.kanal);
    alicilar.slice(0, 3).forEach((a, i) => this.isikIzi(g, a, i * 160));
    const [ilk, ...digerleri] = alicilar;
    if (ilk) {
      // Ardından yüz yüze: yanına yürür, sözsüz konuşurlar
      this.sahneEkle(g, "konusma", () => this.konusmaSahnesi(g, ilk, digerleri));
      this.akisa("mesaj", so().akis.mesaj(g.ajan.ad, alicilar.map((a) => a.ajan.ad).join(", "), kisaMetin(metin, 52)), { ajanId: g.id });
    } else {
      this.akisa("mesaj", so().akis.kanalMesaji(g.ajan.ad, kanalAdi(m.kanal), kisaMetin(metin, 52)), { ajanId: g.id });
    }
  }

  /** Kanala yazan: başında kısa balon (kanalın adıyla), monitörü kısa bir an titrer */
  private kisaBalon(g: Kisi, metin: string, kanal: string) {
    if (!metin) return;
    g.kanalYazisi = { kanal, bitis: this.t + KISA_BALON_SURESI };
    g.yazmaBitis = Math.max(g.yazmaBitis, this.t + 1400);
    this.balon(g, metin, "kisa", undefined, `#${kanalAdi(kanal)}`, KISA_BALON_SURESI);
  }

  /**
   * Işık izi: yazanın başından anılanın başına yay çizerek giden bir ışık; varınca anılanın başında ünlem.
   * Uçlar her karede kişilerin o anki yerinden alınır. Hareket azaltıldıysa yalnız ünlem.
   */
  private isikIzi(g: Kisi, a: Kisi, gecikme = 0) {
    if (this.azHareket) {
      this.isaretKoy(a, "unlem", 2400);
      return;
    }
    const ns = "http://www.w3.org/2000/svg";
    const grup = document.createElementNS(ns, "g");
    grup.setAttribute("class", "ofis-iz");
    const cizgi = document.createElementNS(ns, "path");
    const bas = document.createElementNS(ns, "circle");
    bas.setAttribute("r", "3.4");
    grup.append(cizgi, bas);
    this.izKatmani.appendChild(grup);
    const t0 = this.t + gecikme;
    const ucus = 1050;
    let vardi = false;
    this.efektler.ekle({
      tur: "iz",
      simdi: this.t,
      sure: gecikme + ucus + 650,
      agirlik: 3,
      veri: grup,
      adim: () => {
        const p = (this.t - t0) / ucus;
        if (p < 0) {
          grup.setAttribute("opacity", "0");
          return;
        }
        const A = { x: g.x + g.ax, y: g.y + g.ay - g.boy * (1 - g.kirp) + 2 };
        const B = { x: a.x + a.ax, y: a.y + a.ay - a.boy * (1 - a.kirp) + 2 };
        const K = yayKontrolu(A, B);
        const u = Math.min(1, p);
        // Kuyruk: başın arkasında kısalan iz (son %45)
        const kuyruk = Math.max(0, u - 0.45);
        const parca = 14;
        let d = "";
        for (let i = 0; i <= parca; i++) {
          const n = egriNoktasi(A, K, B, kuyruk + ((u - kuyruk) * i) / parca);
          d += `${i ? "L" : "M"}${n.x.toFixed(1)} ${n.y.toFixed(1)}`;
        }
        cizgi.setAttribute("d", d);
        const uc = egriNoktasi(A, K, B, u);
        bas.setAttribute("cx", uc.x.toFixed(1));
        bas.setAttribute("cy", uc.y.toFixed(1));
        grup.setAttribute("opacity", p <= 1 ? "1" : Math.max(0, 1 - (p - 1) * (ucus / 650)).toFixed(2));
        if (p >= 1 && !vardi) {
          vardi = true;
          if (this.kisiler.has(a.id)) this.isaretKoy(a, "unlem", 2400);
        }
      },
    });
  }

  /** Toplantı odasına çağırır; enAz: toplantının en az sürmesi gereken süre (en çok 2 dk) */
  private toplantiyaCagir(kisiler: Kisi[], konusan: Kisi | null, metin: string, enAz = 13000) {
    if (!this.toplanti || this.toplanti.bitis < this.t) this.toplanti = { basladi: this.t, bitis: this.t + Math.max(16000, enAz), katilimcilar: new Set(), balonlar: new Map() };
    else this.toplanti.bitis = Math.min(this.toplanti.basladi + 120000, Math.max(this.toplanti.bitis, this.t + enAz));
    const t = this.toplanti;
    if (konusan && metin) {
      const liste = t.balonlar.get(konusan.id) ?? [];
      liste.push({ metin });
      t.balonlar.set(konusan.id, liste);
    }
    for (const k of kisiler) {
      if (t.katilimcilar.has(k.id)) continue;
      t.katilimcilar.add(k.id);
      this.sahneEkle(k, "toplanti", () => this.toplantiSahnesi(k));
    }
    // Konuşan zaten toplantıdaysa balonu hemen çıksın
    if (konusan && konusan.is?.ad === "toplanti" && konusan.toplantida) this.toplantiBalonlari(konusan);
  }

  private toplantiBalonlari(k: Kisi) {
    const liste = this.toplanti?.balonlar.get(k.id);
    if (!liste?.length) return;
    for (const b of liste.splice(0)) this.balon(k, b.metin, "konusma");
  }

  hafizaGeldi(kayit: HafizaKaydi) {
    if (kayit.projeId !== this.kur.projeId) return;
    // Güncellenen ya da yerine yenisi geçen kayıt yeniden canlandırılmaz
    if (kayit.yerineGecen || this.gorulenHafiza.has(kayit.id)) return;
    this.gorulenHafiza.add(kayit.id);
    const k = kayit.kaynakAjanId ? this.kisiler.get(kayit.kaynakAjanId) : undefined;
    if (!k || k.cikiyor) {
      this.akisa("hafiza", so().akis.notAldi(kayit.kaynakAd || so().kurulAd, kisaMetin(kayit.baslik, 48)), { nokta: this.odaNoktasi("arsiv") });
      return;
    }
    this.sahneEkle(k, "arsiv", () => this.arsivSahnesi(k, kayit.baslik));
    this.akisa("hafiza", so().akis.notAldi(k.ajan.ad, kisaMetin(kayit.baslik, 48)), { ajanId: k.id });
  }

  soruGeldi(s: AjanSorusu) {
    if (s.projeId !== this.kur.projeId) return;
    const soran = this.kisiler.get(s.soranId);
    const sorulu = this.kisiler.get(s.soruluId);
    // Toplantı soruları (toplanti_yap): yürüyüş ve balon toplantı odasında; görüş #toplanti mesajıyla gelir
    if (toplantiSorusuMu(s.soru, s.soranAd)) {
      if (s.durum === "bekliyor") {
        this.toplantiSorulari.add(s.id);
        this.toplantiyaCagir([soran, sorulu].filter((k): k is Kisi => !!k && !k.cikiyor), null, "", 120000);
        return;
      }
      this.toplantiSorulari.delete(s.id);
      if (s.durum === "zaman_asimi") {
        if (sorulu) this.isaretKoy(sorulu, "omuz", 2200);
        this.akisa("toplanti", so().akis.toplantiGorusYok(s.soruluAd), { ajanId: sorulu?.id });
      }
      // Bütün görüşler geldiyse oda birkaç saniye sonra dağılır
      if (!this.toplantiSorulari.size && this.toplanti) this.toplanti.bitis = Math.min(this.toplanti.bitis, this.t + 9000);
      return;
    }
    if (s.durum === "bekliyor") {
      if (soran && sorulu && !soran.cikiyor) this.sahneEkle(soran, "soru", () => this.soruSahnesi(soran, sorulu, balonMetni(s.soru, 110)));
      this.akisa("soru", so().akis.soru(s.soranAd, s.soruluAd, kisaMetin(s.soru, 52)), { ajanId: soran?.id });
    } else if (s.durum === "yanitlandi") {
      if (sorulu) {
        if (soran && !soran.oturan && Math.hypot(soran.x - sorulu.x, soran.y - sorulu.y) < KARO * 3) this.yuzlestir(sorulu, soran);
        this.balon(sorulu, balonMetni(s.yanit ?? so().balon.yanitladim, 110), "yanit");
        if (soran) this.isaretKoy(soran, "unlem", 2400);
      }
      this.akisa("soru", so().akis.yanitladi(s.soruluAd, kisaMetin(s.yanit ?? "", 52)), { ajanId: sorulu?.id });
    } else {
      if (soran) {
        this.isaretKoy(soran, "omuz", 2200);
        this.balon(soran, so().balon.yanitGelmedi, "kisa");
      }
      this.akisa("soru", so().akis.yanitVermedi(s.soranAd, s.soruluAd), { ajanId: soran?.id });
    }
  }

  /**
   * Ajanın canlı akışı: araç çağrısı (yer, yazma, laboratuvar, kütüphane, teslim), araç sonucu (test ışığı; ardından
   * düşünme), düşünce (düşünme noktaları), model metni (kısa yazma), tur sonu. Alt ajanların akışı sahneye düşmez.
   */
  akisOgesi(projeId: string, oge: AkisOgesi) {
    if (projeId !== this.kur.projeId || oge.ustAracKimligi) return;
    const k = this.kisiler.get(oge.ajanId);
    if (!k || k.cikiyor) return;
    switch (oge.tur) {
      case "arac_cagrisi":
        this.aracCagrisi(k, oge);
        return;
      case "arac_sonucu":
        this.aracSonucu(k, oge);
        return;
      case "dusunce":
        if (k.ajan.durum === "calisiyor") {
          k.dusunceBitis = this.t + 4500;
          k.dusunceBaslar = SONSUZ;
        }
        return;
      case "asistan":
        k.dusunceBitis = -SONSUZ;
        k.dusunceBaslar = SONSUZ;
        k.yazmaBitis = Math.max(k.yazmaBitis, this.t + 1600);
        return;
      case "sonuc":
        k.dusunceBitis = -SONSUZ;
        k.dusunceBaslar = SONSUZ;
        return;
      default:
        return;
    }
  }

  /** Araç çağrısı: masadaysa monitörde aracın simgesi; işine göre yer (etkinlikYeri.ts) ve kanat odalarının ekranları */
  private aracCagrisi(k: Kisi, oge: AkisOgesi) {
    // Araç çağırdı: düşünmesi biter, iş başında
    k.dusunceBitis = -SONSUZ;
    k.dusunceBaslar = SONSUZ;
    if (k.masa && k.oturan === k.masa) {
      k.aracSimge = { simge: aracSimgesi(oge.arac), bitis: this.t + 2800 };
      k.sonEtiketZamani = this.t;
    }
    if (/^(?:Edit|Write|MultiEdit|NotebookEdit)$/.test(oge.arac ?? "")) k.yazmaBitis = this.t + 2600;
    // Test ve derleme: laboratuvarın panosu koşar; sonucu gelince ışık yanar
    const tur = komutTuru(oge.arac, oge.girdi);
    if (tur && oge.aracKimligi) {
      const komut = komutMetni(oge.girdi);
      k.sonKomut = komut;
      this.labCagrilari.set(oge.aracKimligi, { ajanId: k.id, komut, t: this.t });
      this.labDurumu("kosuyor", komut);
    }
    const y = aracYeri(oge.arac, oge.girdi, k.ajan.rol);
    // Araştırma: kütüphanenin ekranında sorgu yazılır
    if (y?.yer === "arastirma") {
      const sorgu = aramaMetni(oge.girdi);
      if (sorgu) k.sonSorgu = sorgu;
      this.arastirma = { ...this.arastirma, sorgu: sorgu || this.arastirma.sorgu, t: this.t };
    }
    // Teslim: stüdyonun ekranında başlık ve test adımları
    if (y?.yer === "sunum") {
      const v = teslimVerisi({ veri: oge.girdi });
      if (v.baslik) {
        this.sunumCagrisi = { baslik: v.baslik, adimlar: v.adimlar, an: Date.now() };
        this.sunumuGuncelle();
        this.akisa("teslim", so().akis.teslim(k.ajan.ad, kisaMetin(v.baslik, 44)), { ajanId: k.id });
        this.vurgula(this.odaNoktasi("studyo"), { anahtar: `teslim-cagri:${oge.id}`, ajanId: k.id });
        this.sunumaCagir(k, v.baslik);
      }
    }
    if (k.ajan.durum !== "calisiyor") return;
    if (!y) return;
    if (y.yer === "toplanti") {
      // toplanti_yap: çağıran odaya geçer; katılımcılar #toplanti duyurusuyla gelir
      this.toplantiyaCagir([k], null, "", 20000);
      return;
    }
    let kisi: string | undefined;
    if (y.yer === "kisi") {
      const h = y.kisiAdi ? this.adlaKisi(y.kisiAdi) : undefined;
      if (!h || h === k) return;
      kisi = h.id;
    }
    yerOlayi(k.yerDurumu, { yer: y.yer, kisi, esik: y.esik, kisa: y.kisa }, this.t);
    this.yerKarariVer(k);
  }

  /** Araç sonucu: test ya da derleme çağrısıysa laboratuvarın ışığı; ardından model sonuca bakıp düşünür */
  private aracSonucu(k: Kisi, oge: AkisOgesi) {
    if (k.ajan.durum === "calisiyor") k.dusunceBaslar = this.t + 1300;
    const c = oge.aracKimligi ? this.labCagrilari.get(oge.aracKimligi) : undefined;
    if (!c || !oge.aracKimligi) return;
    this.labCagrilari.delete(oge.aracKimligi);
    const sonuc = testSonucu(oge.metin, oge.hata);
    if (!sonuc) {
      // Tanınmayan çıktı: koşu bitti, ışık söner
      if (this.lab.durum === "kosuyor") this.labDurumu("bos", c.komut);
      return;
    }
    this.labSonuc(sonuc, c.komut, k);
  }

  /** Yer kararı (zaman geçtikçe ya da yeni işle): kişi bir kanat odasına geçtiyse akışa yazılır */
  private yerKarariVer(k: Kisi) {
    const once = k.yerDurumu.yer;
    if (!yerKarari(k.yerDurumu, this.t) || k.yerDurumu.yer === once) return;
    this.yerDegisti(k, k.yerDurumu.yer);
  }

  private yerDegisti(k: Kisi, yer: YerTuru) {
    const a = so().akis;
    if (yer === "arastirma") this.akisa("arastirma", a.arastirma(k.ajan.ad, k.sonSorgu), { ajanId: k.id });
    else if (yer === "laboratuvar") this.akisa("test", a.laboratuvar(k.ajan.ad, k.sonKomut || "test"), { ajanId: k.id });
    else if (yer === "tasarim") this.akisa("teslim", a.tasarim(k.ajan.ad), { ajanId: k.id });
    else if (yer === "tanitim") this.akisa("teslim", a.tanitim(k.ajan.ad), { ajanId: k.id });
  }

  // -------------------------------------------------------------------------
  // Kanat odaları: laboratuvar, kütüphane, stüdyo
  // -------------------------------------------------------------------------

  /** Laboratuvarın panosu: hazırlık ya da koşu (sonuç gelmezse iki dakikada söner) */
  private labDurumu(durum: LabDurumu, komut: string) {
    this.lab.durum = durum;
    if (komut) this.lab.komut = komut;
    this.lab.bitis = durum === "kosuyor" || durum === "hazirlik" ? this.t + 120_000 : 0;
  }

  /** Test ya da derleme bitti: pano yeşil ya da kırmızı yanar, oda bir an o renkte parlar, koşanın başında balon */
  private labSonuc(sonuc: "gecti" | "kaldi", komut: string, k?: Kisi) {
    this.lab.durum = sonuc;
    if (komut) this.lab.komut = komut;
    this.lab.bitis = this.t + (sonuc === "gecti" ? GECTI_SURESI : KALDI_SURESI);
    this.odaFlasi("laboratuvar", sonuc === "gecti" ? "yesil" : "kirmizi");
    if (k && !k.cikiyor) {
      const b = so().balon;
      this.balon(k, sonuc === "gecti" ? b.testGecti(komut) : b.testKaldi(komut), "bilgi", sonuc === "gecti" ? "onay" : "uyari");
      this.akisa("test", sonuc === "gecti" ? so().akis.testGecti(k.ajan.ad, komut) : so().akis.testKaldi(k.ajan.ad, komut), { ajanId: k.id });
    }
    // Kalan test yayında gösterilir; her geçen koşu kamerayı oynatmasın
    if (sonuc === "kaldi") this.vurgula(this.odaNoktasi("laboratuvar"), { anahtar: `test:${this.t}`, ajanId: k?.id });
  }

  /** Stüdyonun ekranı: en son hareket gören teslim (bekleyen, yeni karara bağlanan ya da onayı gelmemiş çağrı) */
  private sunumuGuncelle() {
    const s = sunumSec(this.onaylar, this.sunumCagrisi, Date.now());
    if (!s) {
      if (this.sunum.durum !== "bos") this.sunum = { ...this.sunum, baslik: "", adimlar: [], durum: "bos" };
      return;
    }
    if (s.baslik !== this.sunum.baslik || s.durum !== this.sunum.durum || s.adimlar.join("\n") !== this.sunum.adimlar.join("\n")) {
      this.sunum = { ...this.sunum, baslik: s.baslik, adimlar: s.adimlar, durum: s.durum };
    }
  }

  /** Kanat ekranlarının yazıları ve durumları; yalnız değişince yazılır */
  private ekranlariYaz(zorla = false) {
    const e = so().ekran;
    const ae = this.arastirmaEkrani;
    if (ae) {
      const aktif = !!this.arastirma.sorgu && this.t - this.arastirma.t < 60_000;
      const anahtar = `${aktif ? this.arastirma.sorgu : ""}|${this.dil}`;
      if (zorla || anahtar !== this.arastirma.yazilan) {
        const yeniSorgu = aktif && anahtar.split("|")[0] !== this.arastirma.yazilan.split("|")[0];
        this.arastirma.yazilan = anahtar;
        ae.baslik.textContent = e.arastirma;
        ae.sorgu.textContent = aktif ? this.arastirma.sorgu : e.arastirmaBos;
        ae.kok.dataset.durum = aktif ? "aktif" : "bos";
        if (yeniSorgu && !this.azHareket) {
          // Yeni sorgu ekrana yazılarak gelir
          ae.sorgu.classList.remove("ofis-yaziliyor");
          void ae.sorgu.offsetWidth;
          ae.sorgu.classList.add("ofis-yaziliyor");
        }
      }
    }
    const tp = this.testPanosu;
    if (tp) {
      const anahtar = `${this.lab.durum}|${this.lab.komut}|${this.dil}`;
      if (zorla || anahtar !== this.lab.yazilan) {
        this.lab.yazilan = anahtar;
        tp.baslik.textContent = e.test;
        tp.kok.dataset.durum = this.lab.durum;
        tp.durum.textContent = e.testDurum[this.lab.durum];
        tp.komut.textContent = this.lab.komut ? `$ ${this.lab.komut}` : e.testBos;
        this.dunya.dataset.lab = this.lab.durum;
      }
    }
    const se = this.sunumEkrani;
    if (se) {
      const s = this.sunum;
      const anahtar = `${s.durum}|${s.baslik}|${s.adimlar.join("\n")}|${this.dil}`;
      if (zorla || anahtar !== s.yazilan) {
        s.yazilan = anahtar;
        const bos = s.durum === "bos" || !s.baslik;
        se.baslik.textContent = e.sunum;
        se.kok.dataset.durum = bos ? "bos" : s.durum;
        se.durum.textContent = bos ? "" : (e.sunumDurum[s.durum as keyof typeof e.sunumDurum] ?? "");
        se.konu.textContent = bos ? e.sunumBos : kisaMetin(s.baslik, 42);
        se.adimlar.innerHTML = bos ? "" : s.adimlar.map((a, i) => `<span style="--i:${i}"><i></i>${kacis(kisaMetin(a, 38))}</span>`).join("");
      }
    }
  }

  /** Kanat istasyonlarının monitörleri: oturan çalışıyorsa açık, yazıyorsa titrer */
  private istasyonlariYaz() {
    for (const ist of this.yer.istasyonlar) {
      const isik = this.monitorler.get(ist.kimlik);
      if (!isik) continue;
      const sahip = this.koltukSahipleri.get(ist);
      const k = sahip ? this.kisiler.get(sahip) : undefined;
      const durumu = k && k.oturan === ist && k.ajan.durum === "calisiyor" ? (this.t < k.yazmaBitis ? "yaziyor" : "acik") : "";
      if (isik.dataset.durum !== durumu) isik.dataset.durum = durumu;
    }
  }

  /** Giriş kapısı: biri yaklaşınca kanatlar açılır */
  private kapiYaz() {
    if (!this.kapiEl) return;
    const kp = this.yer.noktalar.girisKapisi;
    let acik = false;
    for (const k of this.kisiler.values()) {
      if (Math.abs(k.x - kp.x) < 70 && Math.abs(k.y - kp.y) < 76) {
        acik = true;
        break;
      }
    }
    if (this.kapiEl.classList.contains("ofis-kapi-acik") !== acik) this.kapiEl.classList.toggle("ofis-kapi-acik", acik);
  }

  /** Yerel saate göre gün ışığı (dakikada bir) */
  private gunIsigiYaz() {
    const simdi = new Date();
    const g = gunIsigi(simdi.getHours() + simdi.getMinutes() / 60);
    this.dunya.style.setProperty("--gece", g.gece.toFixed(3));
    this.dunya.style.setProperty("--ilik", g.ilik.toFixed(3));
  }

  /** Kanat odalarının ve olayların yeri (akış satırı ve yayın için) */
  private odaNoktasi(kimlik: "kurul" | "pano" | "sunucu" | "arsiv" | "laboratuvar" | "studyo" | "arastirma"): Nokta {
    const n = this.yer.noktalar;
    switch (kimlik) {
      case "kurul": {
        const km = this.yer.esyalar.find((e) => e.kimlik === n.kurulMasasiKimligi);
        return km ? { x: km.x, y: km.y } : karoAyak(n.kurulBekleme[0]!);
      }
      case "pano":
        return { x: n.pano.x, y: n.pano.y + KARO };
      case "sunucu":
        return karoAyak(n.sunucuOnu[0]!);
      case "arsiv":
        return karoAyak(n.arsivOnu[0]!);
      case "laboratuvar":
        return { x: n.testPanosu.x + KARO * 2, y: n.testPanosu.y + KARO };
      case "studyo":
        return { x: n.sunumEkrani.x, y: n.sunumEkrani.y + KARO };
      case "arastirma":
        return { x: n.arastirmaEkrani.x + KARO * 2, y: n.arastirmaEkrani.y + KARO };
    }
  }

  // -------------------------------------------------------------------------
  // Efektler: vurgu halkası, oda flaşı, kutlama
  // -------------------------------------------------------------------------

  /** Olay vurgusu: yerde genişleyen halka; canlı yayın bu olaya keser */
  private vurgula(nokta: Nokta, o: { anahtar: string; ajanId?: string }) {
    this.sahneOlaylari = [...this.sahneOlaylari.filter((x) => this.t - x.t < 8000 && x.anahtar !== o.anahtar), { anahtar: o.anahtar, nokta, ajanId: o.ajanId, t: this.t }].slice(-6);
    if (!this.b) return;
    const el = document.createElement("div");
    el.className = "ofis-vurgu";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = `transform:translate(${nokta.x.toFixed(1)}px, ${nokta.y.toFixed(1)}px);z-index:${Math.max(2, Math.round(nokta.y) - 2)}`;
    el.innerHTML = "<i></i><i></i>";
    this.nesneler.appendChild(el);
    this.efektler.ekle({ tur: "halka", simdi: this.t, sure: 1900, veri: el });
  }

  /** Odanın zemininde kısa ışık: birleşmede mercan, test geçince yeşil, kalınca kırmızı */
  private odaFlasi(kimlik: OdaKimligi, renk: "mercan" | "yesil" | "kirmizi" | "sari") {
    if (!this.b) return;
    const oda = this.yer.odalar.find((o) => o.kimlik === kimlik);
    if (!oda) return;
    const el = document.createElement("div");
    el.className = "ofis-oda-flas";
    el.dataset.renk = renk;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = `left:${oda.alan.c * KARO}px;top:${oda.alan.r * KARO}px;width:${oda.alan.g * KARO}px;height:${oda.alan.y * KARO}px`;
    this.nesneler.appendChild(el);
    this.efektler.ekle({ tur: "flas", simdi: this.t, sure: 2700, veri: el });
  }

  /** Kutlama: başın üstünde kâğıtlar ve iki küçük zıplama (bütçe yetmezse yalnız zıplama) */
  private kutla(k: Kisi) {
    k.ziplaBas = this.t;
    this.vurgula({ x: k.x, y: k.y }, { anahtar: `kutlama:${k.id}`, ajanId: k.id });
    this.konfetiPatlat({ x: k.x, y: k.y - k.boy * (1 - k.kirp) - 6 }, 24);
  }

  /** Mercan ve kemik kâğıtlar: hareket azaltıldıysa ya da bütçe azsa atlanır */
  private konfetiPatlat(n: Nokta, istenen: number) {
    if (this.azHareket || !this.b) return;
    const sayi = Math.min(istenen, this.efektler.kalan());
    if (sayi < 6) return;
    const el = document.createElement("div");
    el.className = "ofis-konfeti";
    el.setAttribute("aria-hidden", "true");
    el.style.transform = `translate(${n.x.toFixed(1)}px, ${n.y.toFixed(1)}px) scale(${Math.min(this.ters, 1.3).toFixed(3)})`;
    el.innerHTML = konfeti(sayi)
      .map((p) => `<i style="--dx:${p.dx}px;--yukari:${-p.yukari}px;--asagi:${p.asagi}px;--don:${p.don}deg;--gecikme:${p.gecikme}ms" data-renk="${p.renk}"${p.serit ? " data-serit" : ""}></i>`)
      .join("");
    this.ustKatman.appendChild(el);
    this.efektler.ekle({ tur: "konfeti", simdi: this.t, sure: 1800, agirlik: sayi, veri: el });
  }

  bildirimGeldi(metin: string, projeId?: string) {
    if (projeId && projeId !== this.kur.projeId) return;
    const kisiler = [...this.kisiler.values()].filter((k) => !k.cikiyor);
    const bulunan = adlariBul(metin, kisiler.map((k) => ({ ad: k.ajan.ad, k }))).map((x) => x.k);
    if (!bulunan.length) return;
    for (const k of bulunan) k.saatBitis = this.t + 20000;
    this.akisa("bildirim", so().akis.gozetmen(kisaMetin(metin, 60)), { ajanId: bulunan[0]?.id });
  }

  private gorevGecti(g: Gorev, once: GorevDurumu) {
    const sahip = g.atananId ? this.kisiler.get(g.atananId) : undefined;
    if (g.durum === "inceleme") {
      const ink = [...this.kisiler.values()].find((k) => k.ajan.rol === "inceleme" && k !== sahip && !k.cikiyor);
      const inceleyen = ink ?? this.ceo();
      if (sahip && inceleyen && inceleyen !== sahip && !sahip.cikiyor) {
        this.sahneEkle(sahip, "inceleme", () => this.belgeSahnesi(sahip, inceleyen, g.kod));
        this.akisa("gorev", so().akis.incelemeyeHazir(sahip.ajan.ad, inceleyen.ajan.ad, g.kod), { ajanId: sahip.id });
      } else this.akisa("gorev", so().akis.incelemede(g.kod), { nokta: this.odaNoktasi("pano") });
      return;
    }
    if (g.durum === "tamam") {
      requestAnimationFrame(() => this.panoKivilcim(g.id));
      if (sahip && !sahip.cikiyor) {
        this.balon(sahip, so().balon.tamam(g.kod), "bilgi", "onay");
        // Kutlama: mercan ve kemik kâğıtlar, küçük bir zıplama
        this.kutla(sahip);
      }
      this.akisa("gorev", so().akis.tamamlandi(g.kod, sahip ? sahip.ajan.ad : null), sahip ? { ajanId: sahip.id } : { nokta: this.odaNoktasi("pano") });
      return;
    }
    if (once !== g.durum) this.akisa("gorev", so().akis.gorevDurumu(g.kod, sozluk().genel.gorevDurumu[g.durum]), sahip ? { ajanId: sahip.id } : { nokta: this.odaNoktasi("pano") });
  }

  private onayYeni(o: Onay) {
    const ajan = o.ajanId ? this.kisiler.get(o.ajanId)?.ajan : undefined;
    if (o.tur === "ise_alim") {
      const v = (o.veri ?? {}) as { ad?: string };
      this.akisa("onay", so().akis.adayKapida(v.ad ?? o.baslik), { nokta: karoAyak(this.yer.noktalar.adaylar[0]!) });
    } else if (o.tur === "birlestirme") this.akisa("onay", so().akis.birlestirmeBekliyor(o.baslik), { nokta: this.odaNoktasi("kurul") });
    else if (o.tur !== "arac") this.akisa("onay", so().akis.onay(ajan?.ad ?? so().ekip, kisaMetin(o.baslik, 48)), ajan ? { ajanId: ajan.id } : { nokta: this.odaNoktasi("kurul") });
    if (o.tur !== "arac") this.vurgula(this.odaNoktasi("kurul"), { anahtar: `onay:${o.id}` });
    // Teslim: teslim eden stüdyoda sunar (teslim_et çağrısı akışta göründüyse sahne zaten açıldı)
    const sunan = o.tur === "teslim" && o.ajanId ? this.kisiler.get(o.ajanId) : undefined;
    if (sunan) this.sunumaCagir(sunan, teslimVerisi(o).baslik || o.baslik);
  }

  private onaySonuc(o: Onay) {
    if (o.tur === "birlestirme" && o.durum === "onaylandi") {
      // Onaylanan birleştirme kalite kapısına girer; birleşme anı kapının "birleşti" adımında oynar. Kalite kaydı
      // hiç gelmezse (kapısız çekirdek) birkaç saniye sonra doğrudan birleşmiş sayılır.
      if (!this.kaliteDurumu.has(o.id)) this.birlesmeBekleyenler.set(o.id, this.t + 8000);
      this.akisa("birlesme", so().akis.birlesmeOnay(this.birlesmeKodu(o)), { nokta: this.odaNoktasi("laboratuvar") });
      return;
    }
    if (o.tur === "ise_alim") {
      const v = (o.veri ?? {}) as { ad?: string };
      if (o.durum !== "onaylandi") this.akisa("onay", so().akis.adayKabulEdilmedi(v.ad ?? ""), { nokta: karoAyak(this.yer.noktalar.kapiIci) });
      return;
    }
    if (o.tur === "teslim") {
      this.teslimSonuc(o);
      return;
    }
    if (o.tur !== "arac") {
      const baslik = kisaMetin(o.baslik, 44);
      const a = so().akis;
      this.akisa("onay", o.durum === "onaylandi" ? a.onaylandi(baslik) : o.durum === "reddedildi" ? a.reddedildi(baslik) : a.suresiDoldu(baslik), {
        nokta: this.odaNoktasi("kurul"),
      });
    }
  }

  private birlesmeKodu(o: Onay): string {
    const v = (o.veri ?? {}) as { gorevId?: string };
    return this.gorevler.find((x) => x.id === v.gorevId)?.kod ?? so().dal;
  }

  /** Birleşme anı: sahibi sunucu odasına yürür, dolapların ışıkları akar, oda mercan ışıkla yanıp söner */
  private birlesmeOyna(o: Onay) {
    const v = (o.veri ?? {}) as { gorevId?: string };
    const g = this.gorevler.find((x) => x.id === v.gorevId);
    const sahip = (g?.atananId ? this.kisiler.get(g.atananId) : undefined) ?? (o.ajanId ? this.kisiler.get(o.ajanId) : undefined);
    const kod = g?.kod ?? so().dal;
    if (sahip && !sahip.cikiyor) this.sahneEkle(sahip, "birlesme", () => this.birlesmeSahnesi(sahip, kod));
    this.sunucuAkisBitis = this.t + 4800;
    this.odaFlasi("sunucu", "mercan");
    this.vurgula(this.odaNoktasi("sunucu"), { anahtar: `birlesme:${o.id}`, ajanId: sahip?.id });
    this.akisa("birlesme", so().akis.birlesti(kod), sahip ? { ajanId: sahip.id } : { nokta: this.odaNoktasi("sunucu") });
  }

  /**
   * Kalite kapısının adımları (onay.sonuc ile yayınlanır): hazırlık ve test laboratuvarın panosunda koşar; birleşince
   * pano yeşil yanar ve birleşme anı oynar, testler geçmezse kırmızı yanar.
   */
  private kaliteGecti(o: Onay, durum: string, k: { komut?: string | null; testYok?: boolean; testsiz?: boolean }) {
    const kod = this.birlesmeKodu(o);
    const komut = k.komut ? komutMetni({ command: k.komut }) : "";
    this.birlesmeBekleyenler.delete(o.id);
    switch (durum) {
      case "hazirlik":
        this.labDurumu("hazirlik", komut);
        break;
      case "test":
        this.labDurumu("kosuyor", komut);
        this.akisa("test", so().akis.kaliteTest(kod), { nokta: this.odaNoktasi("laboratuvar") });
        break;
      case "birlesti":
        if (!k.testYok && !k.testsiz) this.labSonuc("gecti", komut || this.lab.komut);
        this.birlesmeOyna(o);
        break;
      case "test_basarisiz":
      case "zaman_asimi":
      case "hata":
        this.labSonuc("kaldi", komut || this.lab.komut);
        this.akisa("test", so().akis.kaliteKaldi(kod), { nokta: this.odaNoktasi("laboratuvar") });
        break;
      case "cakisma":
        this.akisa("birlesme", so().akis.kaliteKaldi(kod), { nokta: this.odaNoktasi("sunucu") });
        break;
      default:
        break;
    }
  }

  /** Teslim kararı: kabulde sahnede kutlama, geri bildirimde sarı ışık */
  private teslimSonuc(o: Onay) {
    const baslik = kisaMetin(teslimVerisi(o).baslik || o.baslik, 48);
    const ekran = this.odaNoktasi("studyo");
    const sunan = o.ajanId ? this.kisiler.get(o.ajanId) : undefined;
    if (o.durum === "onaylandi") {
      this.konfetiPatlat(ekran, 26);
      if (sunan && !sunan.cikiyor) this.kutla(sunan);
      this.odaFlasi("studyo", "yesil");
      this.akisa("teslim", so().akis.teslimKabul(baslik), sunan ? { ajanId: sunan.id } : { nokta: ekran });
    } else {
      this.odaFlasi("studyo", "sari");
      this.akisa("teslim", so().akis.teslimGeri(baslik), sunan ? { ajanId: sunan.id } : { nokta: ekran });
    }
    this.vurgula(ekran, { anahtar: `teslim:${o.id}`, ajanId: sunan?.id });
  }

  // -------------------------------------------------------------------------
  // Pano, kurul, adaylar
  // -------------------------------------------------------------------------

  private panoyuGuncelle() {
    if (!this.pano) return;
    const p = this.pano;
    const notG = 24;
    const notH = 14;
    const bosluk = 3;
    const ustY = 28;
    const satirH = notH + 4;
    const yuzH = this.yer.noktalar.pano.yukseklik - 18;
    const satirSay = Math.max(1, Math.floor((yuzH - ustY - 4) / satirH));
    const gorulen = new Set<string>();
    PANO_SUTUNLARI.forEach((sutun, i) => {
      const s = p.sutunlar[i]!;
      const sigan = Math.max(1, Math.floor((s.g - 8 + bosluk) / (notG + bosluk)));
      const liste = this.gorevler
        .filter((g) => (sutun.durumlar as readonly string[]).includes(g.durum))
        .sort((a, b) => (sutun.kimlik === "tamam" ? b.guncelleme.localeCompare(a.guncelleme) : a.no - b.no));
      const kapasite = sigan * satirSay;
      const fazla = liste.length > kapasite ? liste.length - kapasite + 1 : 0;
      const gosterilen = fazla ? liste.slice(0, kapasite - 1) : liste;
      gosterilen.forEach((g, j) => {
        gorulen.add(g.id);
        let el = this.panoNotlari.get(g.id);
        if (!el) {
          el = document.createElement("span");
          el.className = "ofis-not ofis-not-yeni";
          p.notlar.appendChild(el);
          this.panoNotlari.set(g.id, el);
          const yeni = el;
          setTimeout(() => yeni.classList.remove("ofis-not-yeni"), 50);
        }
        el.textContent = g.kod;
        el.dataset.durum = g.durum;
        el.title = `${g.kod} · ${g.baslik} · ${sozluk().genel.gorevDurumu[g.durum]}`;
        const x = s.x + 4 + (j % sigan) * (notG + bosluk);
        const y = ustY + Math.floor(j / sigan) * satirH;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      const fazlaKimlik = `fazla-${i}`;
      let fazlaEl = this.panoNotlari.get(fazlaKimlik);
      if (fazla) {
        if (!fazlaEl) {
          fazlaEl = document.createElement("span");
          fazlaEl.className = "ofis-not ofis-not-fazla";
          p.notlar.appendChild(fazlaEl);
          this.panoNotlari.set(fazlaKimlik, fazlaEl);
        }
        fazlaEl.textContent = `+${fazla}`;
        const j = kapasite - 1;
        fazlaEl.style.transform = `translate(${s.x + 4 + (j % sigan) * (notG + bosluk)}px, ${ustY + Math.floor(j / sigan) * satirH}px)`;
        gorulen.add(fazlaKimlik);
      }
    });
    for (const [id, el] of this.panoNotlari) {
      if (gorulen.has(id)) continue;
      el.remove();
      this.panoNotlari.delete(id);
    }
    const sayi = (d: string[]) => this.gorevler.filter((g) => d.includes(g.durum)).length;
    p.kok.setAttribute("aria-label", so().pano.etiket(sayi(["bekleyen", "planlandi"]), sayi(["calisiliyor"]), sayi(["inceleme"]), sayi(["tamam"])));
  }

  private panoKivilcim(gorevId: string) {
    const el = this.panoNotlari.get(gorevId);
    const pn = this.yer.noktalar.pano;
    let x = pn.x + pn.genislik * 0.35;
    let y = pn.y - pn.yukseklik + 40;
    if (el) {
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
      if (m) {
        x = pn.x - pn.genislik / 2 + Number(m[1]) + 12;
        y = pn.y - pn.yukseklik + Number(m[2]) + 7;
      }
    }
    this.kivilcim({ x, y });
  }

  private kivilcim(n: Nokta) {
    const el = document.createElement("div");
    el.className = "ofis-kivilcim";
    el.style.transform = `translate(${n.x}px, ${n.y}px)`;
    el.innerHTML = Array.from({ length: 8 }, (_, i) => `<i style="--a:${i * 45}deg"></i>`).join("");
    this.ustKatman.appendChild(el);
    this.kivilcimlar.push({ el, bitis: this.t + 1100 });
  }

  private kurulIsiklariniGuncelle() {
    if (!this.kurulIsiklari) return;
    const bekleyen = this.onaylar.filter((o) => o.durum === "bekliyor");
    const n = bekleyen.length;
    const goster = Math.min(n, 7);
    const anahtar = `${n}|${useDilDurumu.getState().dil}`;
    if (this.kurulIsiklari.dataset.sayi !== anahtar) {
      this.kurulIsiklari.dataset.sayi = anahtar;
      this.kurulIsiklari.innerHTML = `<span class="ofis-kurul-ad">${kacis(so().kurulAd)}</span>${
        n ? `${Array.from({ length: goster }, (_, i) => `<i style="--i:${i}"></i>`).join("")}<b>${n}</b>` : ""
      }`;
      this.kurulZemin.classList.toggle("ofis-kurul-var", n > 0);
      this.kurulIsareti?.classList.toggle("ofis-kurul-isaret-var", n > 0);
      const masa = this.nesneler.querySelector<HTMLElement>('[data-sicak="kurul"]');
      const metin = so().kurulMasasi(n);
      masa?.setAttribute("aria-label", metin);
      if (masa) masa.title = metin;
    }
  }

  private adaylariGuncelle(ilk: boolean) {
    const bekleyen = this.onaylar.filter((o) => o.tur === "ise_alim" && o.durum === "bekliyor").slice(0, this.yer.noktalar.adaylar.length);
    const gorulen = new Set(bekleyen.map((o) => o.id));
    // Gidenler
    for (const [id, a] of this.adaylar) {
      if (gorulen.has(id) || a.cikiyor) continue;
      a.cikiyor = true;
      const o = this.onaylar.find((x) => x.id === id);
      if (o?.durum === "onaylandi" || ilk) {
        a.el.classList.add("ofis-aday-gidiyor");
        setTimeout(() => a.el.remove(), 700);
      } else {
        // Reddedilen aday kapıdan çıkar
        const kapi = karoAyak(this.yer.noktalar.kapi);
        a.el.style.transition = "transform 1.8s linear, opacity 0.6s ease 1.4s";
        a.el.style.transform = `translate(${kapi.x}px, ${kapi.y}px)`;
        a.el.style.opacity = "0";
        setTimeout(() => a.el.remove(), 2200);
      }
      setTimeout(() => this.adaylar.delete(id), 0);
    }
    // Gelenler
    const kullanilan = new Set(this.atamalar.values());
    for (const o of bekleyen) {
      if (this.adaylar.has(o.id)) continue;
      const bos = this.yer.noktalar.adaylar.find((k) => ![...this.adaylar.values()].some((a) => !a.cikiyor && a.karo.c === k.c && a.karo.r === k.r));
      if (!bos) break;
      const v = (o.veri ?? {}) as { ad?: string; rol?: string };
      const karakterId = adayKarakteri(v.rol ?? "", this.v.karakterler, kullanilan, o.id, v.ad);
      if (karakterId) kullanilan.add(karakterId);
      const karakter = this.karakterBul(karakterId ?? undefined);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "ofis-aday";
      el.dataset.sicak = "aday";
      const en = (KARAKTER_BOYU * karakter.en) / karakter.boy;
      const ayak = karoAyak(bos);
      el.style.width = `${en}px`;
      el.style.height = `${KARAKTER_BOYU}px`;
      el.style.left = `${-en / 2}px`;
      el.style.top = `${-KARAKTER_BOYU}px`;
      el.style.zIndex = String(Math.round(ayak.y));
      el.style.transform = `translate(${ayak.x}px, ${ayak.y}px)`;
      const etiket = so().adayEtiketi(v.ad ?? o.baslik);
      el.setAttribute("aria-label", etiket);
      el.title = etiket;
      el.innerHTML = `<span class="ofis-aday-golge"></span><img alt="" draggable="false" src="${varlikAdresi(karakter.dosya)}"><span class="ofis-aday-ad">${kacis(so().aday)} · ${(v.ad ?? "").replace(/[<>&"]/g, "")}</span>`;
      this.nesneler.appendChild(el);
      this.adaylar.set(o.id, { onayId: o.id, el, karo: bos, cikiyor: false });
    }
  }

  // -------------------------------------------------------------------------
  // Balonlar, işaretler, zarf
  // -------------------------------------------------------------------------

  private balon(k: Kisi, metin: string, tip: BalonTipi, simge?: OfisSimgesi, ust?: string, sureVerilen?: number): Balon | null {
    if (!this.kisiler.has(k.id)) return null;
    const gorunur = k.balonlar.filter((b) => !b.kapaniyor);
    if (gorunur.length >= 2) {
      // Sıraya al: en eskisi kapanınca çıkar
      k.bekleyenBalon.push({ metin, tip, simge, ust, sure: sureVerilen });
      if (k.bekleyenBalon.length > 3) k.bekleyenBalon.shift();
      return null;
    }
    const el = document.createElement("div");
    el.className = `ofis-balon ofis-balon-${tip}`;
    el.setAttribute("aria-hidden", "true");
    if (ust) {
      const u = document.createElement("span");
      u.className = "ofis-balon-ust";
      u.textContent = ust;
      el.appendChild(u);
    }
    if (simge) el.insertAdjacentHTML("beforeend", `<span class="ofis-balon-simge">${simgeSvg(simge, 11)}</span>`);
    if (tip === "soru") el.insertAdjacentHTML("beforeend", `<span class="ofis-balon-soru">?</span>`);
    const metinEl = document.createElement("span");
    metinEl.className = "ofis-balon-metin";
    el.appendChild(metinEl);
    const yazar = !this.azHareket && (tip === "konusma" || tip === "soru" || tip === "yanit" || tip === "kurul") && metin.length > 12;
    metinEl.textContent = yazar ? "" : metin;
    // Ölçüm için tam metni görünmez bir yer tutucuyla genişlik sabitlenir
    el.style.setProperty("--uzunluk", String(metin.length));
    this.ustKatman.appendChild(el);
    const yazmaSuresi = yazar ? (metin.length / 42) * 1000 : 0;
    const sure = sureVerilen ?? Math.min(9000, Math.max(tip === "kisa" || tip === "bilgi" ? 2800 : 3600, yazmaSuresi + 1800 + metin.length * 18));
    const b: Balon = {
      kisi: k,
      el,
      metinEl,
      tam: metin,
      gosterilen: 0,
      yazar,
      bas: this.t,
      bitis: this.t + sure,
      g: 0,
      h: 0,
      olcum: true,
      x: k.x,
      y: k.y - k.boy,
      kapaniyor: false,
      gorunur: false,
    };
    if (yazar) {
      // Yazı makinesi sırasında kutu büyümesin: son boyut ilk ölçümde alınır
      metinEl.textContent = metin;
    }
    k.balonlar.push(b);
    this.balonlar.push(b);
    return b;
  }

  private isaretKoy(k: Kisi, tip: Isaret["tip"], ms: number) {
    k.isaret = { tip, bitis: this.t + ms };
  }

  private zarfGonder(bas: Nokta, hedef: Kisi, sonra: () => void) {
    if (this.azHareket) {
      sonra();
      return;
    }
    const el = document.createElement("div");
    el.className = "ofis-zarf";
    el.innerHTML = simgeSvg("zarf", 14);
    this.ustKatman.appendChild(el);
    this.ucanlar.push({
      el,
      bas,
      hedef: () => ({ x: hedef.x, y: hedef.y - hedef.boy - 8 }),
      t0: this.t,
      sure: 1300,
      sonra,
    });
  }

  // -------------------------------------------------------------------------
  // Etkileşim
  // -------------------------------------------------------------------------

  private tiklandi(e: MouseEvent) {
    const hedef = e.target as HTMLElement;
    const isaret = hedef.closest<HTMLElement>("[data-onay-ajan]");
    if (isaret) {
      e.stopPropagation();
      const aid = isaret.dataset.onayAjan!;
      const arac = this.onaylar.some((o) => o.ajanId === aid && o.durum === "bekliyor" && o.tur === "arac");
      this.b?.cagrilar.git(arac ? "denetim" : "onaylar");
      return;
    }
    const kisi = hedef.closest<HTMLElement>(".ofis-kisi");
    if (kisi?.dataset.ajan) {
      this.b?.cagrilar.ajanSec(kisi.dataset.ajan);
      return;
    }
    const sicak = hedef.closest<HTMLElement>("[data-sicak]")?.dataset.sicak;
    if (!sicak) return;
    const c = this.b?.cagrilar;
    if (sicak === "kurul" || sicak === "aday" || sicak === "laboratuvar" || sicak === "studyo") c?.git("onaylar");
    else if (sicak === "pano") c?.git("pano");
    else if (sicak === "sunucu") c?.git("kod");
    else if (sicak === "arsiv" || sicak === "arastirma") c?.git("notlar");
    else if (sicak === "toplanti") c?.git("kanallar", { kanal: "toplanti" });
  }

  private ipucuBak(e: Event) {
    const hedef = e.target as HTMLElement;
    const el = hedef.closest?.<HTMLElement>(".ofis-kisi");
    const kisi = el?.dataset.ajan ? this.kisiler.get(el.dataset.ajan) : undefined;
    if (e.type === "pointerover" || e.type === "focusin") {
      if (kisi) {
        this.ipucuKisi = kisi;
        this.ipucuYazildi = -SONSUZ;
        this.ipucu.hidden = false;
        kisi.ust.classList.add("ofis-kisi-ust-odak");
        if (e.type === "focusin") this.kamera?.goster(kisi.x, kisi.y - kisi.boy / 2);
      }
    } else if (kisi && kisi === this.ipucuKisi) {
      const ilgili = (e as PointerEvent | FocusEvent).relatedTarget as HTMLElement | null;
      if (ilgili && el?.contains(ilgili)) return;
      this.ipucuGizle();
    }
  }

  private ipucuGizle() {
    this.ipucuKisi?.ust.classList.remove("ofis-kisi-ust-odak");
    this.ipucuKisi = null;
    this.ipucu.hidden = true;
  }

  private etkinlikMetni(k: Kisi): string {
    const temel = this.temelEtkinlik(k);
    return this.dusunuyor(k) ? so().etkinlik.dusunuyor(temel) : temel;
  }

  /** Düşünme noktaları görünüyor mu */
  private dusunuyor(k: Kisi): boolean {
    return k.ajan.durum === "calisiyor" && !k.cikiyor && this.t < k.dusunceBitis;
  }

  /** Uzun süre boşta kalıp durmuş: uyukluyor (kanepede, köşede) */
  private uyukluyor(k: Kisi): boolean {
    return k.ajan.durum === "bosta" && !k.cikiyor && this.t - k.bostaBas > UYUKLAMA && this.t - k.sonHareket > 6000 && this.hareketsiz(k) && !k.balonlar.length;
  }

  private temelEtkinlik(k: Kisi): string {
    const a = k.ajan;
    const e = so().etkinlik;
    if (k.cikiyor) return e.ayriliyor;
    if (k.is?.tur === "sahne" && k.etkinlik) return k.etkinlik;
    if (k.kanalYazisi && this.t < k.kanalYazisi.bitis) return e.kanalaYaziyor(kanalAdi(k.kanalYazisi.kanal));
    if (this.uyukluyor(k)) return e.uyukluyor;
    switch (a.durum) {
      case "calisiyor": {
        if (k.kaliciTur === "calisma") {
          const d = k.yerDurumu;
          switch (d.yer) {
            case "pano":
              return e.panoda;
            case "kisi": {
              const h = d.kisi ? this.kisiler.get(d.kisi) : undefined;
              if (h) return e.kisiyle(h.ajan.ad);
              break;
            }
            case "arsiv":
              return e.arsivde;
            case "kurul":
              return e.kurulda;
            case "tahta":
              return this.toplantiSuruyor() ? e.panoda : e.tahtada;
            case "arastirma":
              return e.arastirmada;
            case "laboratuvar":
              return e.laboratuvarda;
            case "sunum":
              return e.sunumda;
            case "tasarim":
              return e.tasarimda;
            case "tanitim":
              return e.tanitimda;
            case "sunucu":
              return e.sunucuda;
            default:
              break;
          }
        }
        return k.oturan ? e.masasindaCalisiyor(a.isAciklamasi) : e.masasinaGidiyor;
      }
      case "karar_bekliyor":
        return e.kurulBekliyor;
      case "bosta":
        return k.elde?.simge === "fincan" ? e.kahveIciyor : k.elde?.simge === "bardak" ? e.suIciyor : e.isBekliyor;
      case "kapali":
        return e.kapali;
      case "duraklatildi":
        return e.duraklatildi;
      case "hata":
        return e.hata;
    }
  }

  private olcekDegisti(o: number) {
    this.olcek = o;
    const ters = Math.min(1.15, Math.max(0.74, o)) / o;
    // Değişken yalnız değişince yazılır: dünyanın bütün alt ağacı ondan miras alır (her yazım stil hesaplatır)
    const tersMetin = ters.toFixed(3);
    if (tersMetin !== this.tersYazilan) {
      this.tersYazilan = tersMetin;
      this.dunya.style.setProperty("--ters", tersMetin);
    }
    const tersDegisti = Math.abs(ters - this.ters) > 1e-4;
    this.ters = ters;
    const lod = o < 0.42 ? "uzak" : o < 0.62 ? "orta" : "yakin";
    if (lod !== this.lod) {
      this.lod = lod;
      this.dunya.dataset.lod = lod;
      // Balonun kendi boyu ölçekten bağımsız (transform); yalnız ayrıntı düzeyi değişince yeniden ölçülür
      for (const b of this.balonlar) b.olcum = true;
    }
    // Etiketler ölçeğin tersiyle büyür; ters değişmediyse (0.74-1.15 arası) yeniden yazmaya gerek yok
    if (tersDegisti) for (const k of this.kisiler.values()) k.yaz.ust = "";
  }

  /** Şeride satır: kim ya da nerede (basınca kamera oraya gider) */
  private akisa(tur: AkisTuru, metin: string, hedef: { ajanId?: string; nokta?: Nokta } = {}) {
    const satir: AkisSatiri = {
      id: ++this.akisNo,
      zaman: Date.now(),
      tur,
      metin,
      ...(hedef.ajanId ? { ajanId: hedef.ajanId } : {}),
      ...(hedef.nokta ? { nokta: { x: Math.round(hedef.nokta.x), y: Math.round(hedef.nokta.y) } } : {}),
    };
    this.akisGecmisi = [satir, ...this.akisGecmisi].slice(0, AKIS_GECMISI);
    this.b?.cagrilar.akis(satir);
  }

  private ozetiGuncelle() {
    const sayac: Partial<Record<AjanDurumu, number>> = {};
    const liste = [...this.kisiler.values()].filter((k) => !k.cikiyor);
    for (const k of liste) sayac[k.ajan.durum] = (sayac[k.ajan.durum] ?? 0) + 1;
    const adlar = sozluk().genel.ajanDurumu;
    const parcalar = (Object.keys(adlar) as AjanDurumu[]).filter((d) => sayac[d]).map((d) => `${sayac[d]} ${adlar[d].toLocaleLowerCase(so().yerel)}`);
    const bekleyen = this.onaylar.filter((o) => o.durum === "bekliyor").length;
    const metin = so().ozet(liste.length, parcalar, bekleyen);
    if (metin !== this.ozetAnahtari && this.b) {
      this.ozetAnahtari = metin;
      this.b.cagrilar.ozet(metin);
    }
  }

  // -------------------------------------------------------------------------
  // Kare
  // -------------------------------------------------------------------------

  private guncelle(dt: number) {
    this.t += dt;
    const kisiler = [...this.kisiler.values()];
    // İşe göre yer: zaman geçtikçe aday yer olgunlaşır ya da bitmiş işin yerinden masaya dönülür
    this.yerKarariZamani += dt;
    if (this.yerKarariZamani >= 500) {
      this.yerKarariZamani = 0;
      for (const k of kisiler) if (k.kaliciTur === "calisma" && !k.cikiyor) yerKarari(k.yerDurumu, this.t);
    }
    for (const k of kisiler) {
      // Araç sonucundan sonra sıradaki çağrı gelmediyse model düşünüyor
      if (this.t >= k.dusunceBaslar) {
        k.dusunceBaslar = SONSUZ;
        if (k.ajan.durum === "calisiyor") k.dusunceBitis = this.t + 9000;
      }
      this.isiIlerlet(k);
      if (this.kisiler.has(k.id)) this.hareket(k, dt);
    }
    this.ayrisma(kisiler);
    this.balonlariIlerlet(dt);
    this.ucanlariIlerlet();
    // Yazım
    for (const k of this.kisiler.values()) this.kisiYaz(k);
    this.balonlariYerlestir();
    this.ipucuYaz();
    this.sunucuYaz();
    for (const kv of this.kivilcimlar.splice(0)) {
      if (this.t < kv.bitis) this.kivilcimlar.push(kv);
      else kv.el.remove();
    }
    this.efektler.ilerlet(this.t);
    this.kameraAdimi(dt);
    this.yarimSaniye += dt;
    if (this.yarimSaniye >= 250) {
      this.yarimSaniye = 0;
      this.yavasAdim();
    }
  }

  /** Dörtte bir saniyede bir: kanat ekranları, istasyonlar, kapı, laboratuvarın sönmesi, gün ışığı, bütçe */
  private yavasAdim() {
    if (this.lab.durum !== "bos" && this.lab.bitis && this.t >= this.lab.bitis) {
      this.lab.durum = "bos";
      this.lab.bitis = 0;
    }
    // Kalite kaydı gelmeyen onaylı birleştirme: doğrudan birleşmiş sayılır
    for (const [id, son] of this.birlesmeBekleyenler) {
      if (this.t < son) continue;
      this.birlesmeBekleyenler.delete(id);
      const o = this.onaylar.find((x) => x.id === id);
      if (o && !this.kaliteDurumu.has(id)) this.birlesmeOyna(o);
    }
    // Sonucu hiç gelmeyen çağrılar unutulur
    for (const [id, c] of this.labCagrilari) if (this.t - c.t > 600_000) this.labCagrilari.delete(id);
    this.sahneOlaylari = this.sahneOlaylari.filter((o) => this.t - o.t < 8000);
    this.sunumuGuncelle();
    this.ekranlariYaz();
    this.istasyonlariYaz();
    this.kapiYaz();
    if (this.t - this.gunIsigiZamani > 60_000) {
      this.gunIsigiZamani = this.t;
      this.gunIsigiYaz();
    }
    this.efektler.butce = efektButcesi(this.kisiler.size, this.kareOlcer.dusukGuc);
    this.kameraModunuBildir();
  }

  private hareket(k: Kisi, dt: number) {
    // Saydamlık
    if (k.opaklik !== k.hedefOpaklik) {
      const adim = dt / 450;
      k.opaklik = k.hedefOpaklik > k.opaklik ? Math.min(k.hedefOpaklik, k.opaklik + adim) : Math.max(k.hedefOpaklik, k.opaklik - adim);
    }
    if (k.isinlan) {
      // Az hareket: kısa solma, ışınlanma, belirme
      const u = (this.t - k.isinlan.t0) / 320;
      if (u >= 0.5 && (k.x !== k.isinlan.hedef.x || k.y !== k.isinlan.hedef.y)) {
        k.x = k.isinlan.hedef.x;
        k.y = k.isinlan.hedef.y;
      }
      k.ax = 0;
      if (u >= 1) k.isinlan = null;
      return;
    }
    if (k.gecis) {
      const g = k.gecis;
      k.sonHareket = this.t;
      const u = Math.min(1, (this.t - g.t0) / g.sure);
      const e = yumusakGecis(u);
      k.x = g.bas.x + (g.son.x - g.bas.x) * e;
      k.y = g.bas.y + (g.son.y - g.bas.y) * e;
      k.kirp = g.kirpBas + (g.kirpSon - g.kirpBas) * e;
      if (u >= 1) k.gecis = null;
      return;
    }
    if (!k.yol) {
      // Dururken: panoya, rafa, tahtaya ya da dolaba bakıyorsa arkası dönük (arkadan görünüşü varsa)
      k.arkadan = k.bakis === "arka" && !!k.karakter.arka;
      return;
    }
    let kalan = (k.hiz * dt) / 1000;
    const onceX = k.x;
    const onceY = k.y;
    while (kalan > 0 && k.yol) {
      const h = k.yol[k.yolI];
      if (!h) {
        k.yol = null;
        break;
      }
      const dx = h.x - k.x;
      const dy = h.y - k.y;
      const d = Math.hypot(dx, dy);
      if (d <= kalan) {
        k.x = h.x;
        k.y = h.y;
        kalan -= d;
        k.yolI++;
        if (k.yolI >= k.yol.length) k.yol = null;
      } else {
        k.x += (dx / d) * kalan;
        k.y += (dy / d) * kalan;
        kalan = 0;
      }
    }
    const hareketX = k.x - onceX;
    const hareketY = k.y - onceY;
    k.sonHareket = this.t;
    if (Math.abs(hareketX) > 0.15) k.yon = hareketX > 0 ? 1 : -1;
    // Yukarı (bakandan uzağa) yürürken arkası döner; aşağı ya da yana dönünce yüzü görünür
    if (!k.yol) k.arkadan = k.bakis === "arka" && !!k.karakter.arka;
    else if (k.karakter.arka) {
      if (hareketY < -0.15 && -hareketY > Math.abs(hareketX) * 0.6) k.arkadan = true;
      else if (hareketY > 0.15 || Math.abs(hareketX) > Math.abs(hareketY) * 2.5) k.arkadan = false;
    }
    k.faz += ((k.hiz * dt) / 1000 / ADIM) * Math.PI;
  }

  /** Yakın duran ya da yürüyenler görsel olarak birbirinden itilir (oturanlar hariç) */
  private ayrisma(kisiler: Kisi[]) {
    for (const k of kisiler) {
      k.ax *= 0.86;
      k.ay *= 0.86;
    }
    for (let i = 0; i < kisiler.length; i++) {
      const a = kisiler[i]!;
      if (a.oturan || a.gecis) continue;
      for (let j = i + 1; j < kisiler.length; j++) {
        const b = kisiler[j]!;
        if (b.oturan || b.gecis) continue;
        const dx = b.x + b.ax - (a.x + a.ax);
        const dy = (b.y + b.ay - (a.y + a.ay)) * 1.6;
        const d = Math.hypot(dx, dy);
        const en = 22;
        if (d >= en) continue;
        const it = ((en - d) / en) * 1.6;
        const nx = d > 0.01 ? dx / d : i % 2 ? 1 : -1;
        const ny = d > 0.01 ? dy / d / 1.6 : 0;
        a.ax -= nx * it;
        a.ay -= ny * it * 0.5;
        b.ax += nx * it;
        b.ay += ny * it * 0.5;
      }
    }
    for (const k of kisiler) {
      k.ax = Math.max(-14, Math.min(14, k.ax));
      k.ay = Math.max(-6, Math.min(6, k.ay));
    }
  }

  private kisiYaz(k: Kisi) {
    const yuruyor = !!k.yol;
    const x = k.x + k.ax;
    const y = k.y + k.ay;
    // Gövde: yürürken adım sallanması, dururken nefes
    let bob = 0;
    let don = 0;
    let sx = 1;
    let sy = 1;
    if (!this.azHareket) {
      if (yuruyor && k.karakter.hareket === "tekerlekli") {
        // Tekerlekli sandalye: adım sallanması yok, hafif süzülme
        don = Math.sin(k.faz * 0.5) * 0.35;
      } else if (yuruyor) {
        bob = -Math.abs(Math.sin(k.faz)) * 3.4;
        don = Math.sin(k.faz) * 2.8;
      } else {
        const n = Math.sin(this.t / 1000 * 2.3 + k.nefesFaz);
        sy = 1 + n * 0.012;
        sx = 1 - n * 0.006;
        if (k.oturan && k.ajan.durum === "calisiyor") don = Math.sin(this.t / 1000 * 0.9 + k.nefesFaz) * 0.7;
      }
      const uz = this.t - k.uzanma;
      if (uz >= 0 && uz < 700) bob -= Math.sin((uz / 700) * Math.PI) * 5;
      // Kutlama: iki küçük zıplama, ikincisi alçak
      const zu = this.t - k.ziplaBas;
      if (zu >= 0 && zu < 780) bob -= Math.abs(Math.sin((zu / 390) * Math.PI)) * (zu < 390 ? 10 : 5);
      // Masada yazarken: hızlı, küçük kıpırtı (klavyeye vuruş)
      if (k.oturan && this.t < k.yazmaBitis) bob -= Math.max(0, Math.sin(this.t * 0.046 + k.nefesFaz)) * 0.9;
      if (k.isaret?.tip === "omuz" && this.t < k.isaret.bitis) {
        const o = (k.isaret.bitis - this.t) % 700;
        if (o < 350) bob -= Math.sin((o / 350) * Math.PI) * 3;
      }
    }
    const tf = `translate3d(${(x - k.en / 2).toFixed(1)}px, ${(y - k.boy).toFixed(1)}px, 0)`;
    if (tf !== k.yaz.tf) {
      k.dugme.style.transform = tf;
      k.yaz.tf = tf;
    }
    const z = Math.round(y);
    if (z !== k.yaz.z) {
      k.dugme.style.zIndex = String(z);
      k.yaz.z = z;
    }
    const arkadan = k.arkadan && !k.oturan;
    if (arkadan !== k.yaz.arka) {
      if (arkadan) k.govde.dataset.arka = "";
      else delete k.govde.dataset.arka;
      k.yaz.arka = arkadan;
    }
    const govde = `translateY(${bob.toFixed(2)}px) rotate(${don.toFixed(2)}deg) scale(${(sx * k.yon).toFixed(4)}, ${sy.toFixed(4)})`;
    if (govde !== k.yaz.govde) {
      k.govde.style.transform = govde;
      k.yaz.govde = govde;
    }
    const kirp = k.kirp > 0.001 ? `inset(-20% -20% ${(k.kirp * 100).toFixed(2)}% -20%)` : "none";
    if (kirp !== k.yaz.kirp) {
      k.govde.style.clipPath = kirp;
      k.yaz.kirp = kirp;
    }
    // Saydamlık ve ışınlanma solması
    let op = k.opaklik;
    if (k.isinlan) {
      const u = (this.t - k.isinlan.t0) / 320;
      op *= Math.abs(1 - Math.min(1, u) * 2);
    }
    const opMetin = op.toFixed(2);
    if (opMetin !== k.yaz.op) {
      k.dugme.style.opacity = opMetin;
      k.ust.style.opacity = opMetin;
      k.yaz.op = opMetin;
    }
    const oturan = !!k.oturan || !!k.gecis;
    if (oturan !== k.yaz.oturan) {
      k.dugme.classList.toggle("ofis-kisi-oturan", oturan);
      k.yaz.oturan = oturan;
    }
    const durum = DURUM_SINIFI[k.ajan.durum];
    if (durum !== k.yaz.durum) {
      k.dugme.dataset.durum = durum;
      k.ust.dataset.durum = durum;
      k.yaz.durum = durum;
      this.ozetiGuncelle();
    }

    // Üst bilgi: işaret, ad, iş
    const tepe = y - k.boy + 6 + bob;
    const ust = `translate(${x.toFixed(1)}px, ${tepe.toFixed(1)}px) scale(${this.ters.toFixed(3)}) translate(-50%, -100%)`;
    if (ust !== k.yaz.ust) {
      k.ust.style.transform = ust;
      k.yaz.ust = ust;
    }
    if (k.ajan.ad !== k.yaz.ad) {
      k.adEl.textContent = k.ajan.ad;
      k.yaz.ad = k.ajan.ad;
    }
    const isMetni = k.ajan.durum === "calisiyor" && k.oturan && k.oturan === k.masa && k.ajan.isAciklamasi ? kisaMetin(k.ajan.isAciklamasi, 30) : "";
    if (isMetni !== k.yaz.is) {
      k.isEl.textContent = isMetni;
      k.isEl.hidden = !isMetni;
      k.yaz.is = isMetni;
    }
    // Başın üstünde: düşünürken akan üç nokta, yüz yüze konuşurken sözsüz konuşma göstergesi
    const konusma = this.t < k.konusmaBitis;
    const dusunce = !konusma && this.dusunuyor(k);
    if (dusunce !== k.yaz.dusunce || konusma !== k.yaz.konusma) {
      k.yaz.dusunce = dusunce;
      k.yaz.konusma = konusma;
      if (konusma) k.dusunceEl.dataset.tur = "konusma";
      else if (dusunce) k.dusunceEl.dataset.tur = "dusunce";
      else delete k.dusunceEl.dataset.tur;
    }
    // İşaret: kalıcı (durumdan) ya da geçici
    let isaret = "";
    if (k.isaret && this.t >= k.isaret.bitis) k.isaret = null;
    if (k.ajan.durum === "karar_bekliyor") isaret = "soru";
    else if (k.isaret) isaret = k.isaret.tip;
    else if (k.ajan.durum === "kapali" && k.oturan) isaret = "uyku";
    else if (this.uyukluyor(k)) isaret = "uyku";
    else if (k.ajan.durum === "duraklatildi") isaret = "duraklat";
    else if (k.ajan.durum === "hata") isaret = "uyari";
    if (isaret !== k.yaz.isaret) {
      k.yaz.isaret = isaret;
      this.isaretYaz(k, isaret);
    }
    // Etiket (erişilebilir ad) seyrek güncellenir
    if (this.t - k.sonEtiketZamani > 700) {
      k.sonEtiketZamani = this.t;
      const etiket = so().kisiEtiketi(k.ajan.ad, k.ajan.rolAdi, sozluk().genel.ajanDurumu[k.ajan.durum], this.etkinlikMetni(k));
      if (etiket !== k.yaz.etiket) {
        k.dugme.setAttribute("aria-label", etiket);
        k.yaz.etiket = etiket;
      }
    }
    // Elde taşınan
    const elde = k.elde ? `${k.elde.simge}|${k.elde.metin ?? ""}` : "";
    if (elde !== k.eldeAnahtar) {
      k.eldeAnahtar = elde;
      k.eldeEl.hidden = !elde;
      k.eldeEl.innerHTML = k.elde ? `${simgeSvg(k.elde.simge, 10)}${k.elde.metin ? `<b>${k.elde.metin.replace(/[<>&"]/g, "")}</b>` : ""}` : "";
    }
    if (elde) {
      const ex = x + k.yon * k.en * 0.36;
      const ey = y - k.boy * 0.44 + bob;
      k.eldeEl.style.transform = `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) scale(${Math.min(this.ters, 1.4).toFixed(3)}) translate(-50%, -50%)`;
      k.eldeEl.style.zIndex = "2";
    }
    // Masa: monitör ışıması, araç simgesi, gözetmen saati
    if (k.masa) {
      const masada = k.oturan === k.masa;
      const masadaCalisiyor = masada && k.ajan.durum === "calisiyor";
      const isik = this.monitorler.get(k.masa.kimlik);
      if (isik) {
        // Hata: ekran mercan renginde yanıp söner (belirgin işaret)
        const durumu = masadaCalisiyor
          ? this.t < k.yazmaBitis
            ? "yaziyor"
            : k.aracSimge && this.t < k.aracSimge.bitis
              ? "parlak"
              : "acik"
          : masada && k.ajan.durum === "hata"
            ? "hata"
            : "";
        if (isik.dataset.durum !== durumu) isik.dataset.durum = durumu;
      }
      this.masaSimgeleri(k, masadaCalisiyor);
    }
  }

  private isaretYaz(k: Kisi, isaret: string) {
    const el = k.isaretEl;
    el.className = `ofis-isaret${isaret ? ` ofis-isaret-${isaret}` : ""}`;
    el.removeAttribute("data-onay-ajan");
    el.removeAttribute("role");
    el.removeAttribute("tabindex");
    el.removeAttribute("aria-label");
    switch (isaret) {
      case "soru":
        el.textContent = "?";
        el.dataset.onayAjan = k.id;
        el.setAttribute("role", "button");
        el.tabIndex = 0;
        el.setAttribute("aria-label", so().kararIsareti(k.ajan.ad));
        el.title = so().kararIsaretiIpucu;
        el.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            el.click();
          }
        };
        break;
      case "unlem":
        el.textContent = "!";
        break;
      case "omuz":
        el.textContent = "…";
        break;
      case "uyku":
        // Her "z" kendi kabında yükselir (kabın dönüşümü birleştiricide oynar, SVG yerleşimini bozmaz)
        el.innerHTML = [7, 5.5, 4]
          .map((b, i) => `<i style="--i:${i}"><svg viewBox="0 0 8 8" width="${b}" height="${b}" aria-hidden="true" focusable="false"><path d="M1 1.5h6L1 6.5h6"/></svg></i>`)
          .join("");
        break;
      case "duraklat":
        el.innerHTML = simgeSvg("duraklat", 10);
        break;
      case "uyari":
        el.innerHTML = simgeSvg("uyari", 11);
        break;
      default:
        el.textContent = "";
    }
    if (isaret !== "soru") {
      el.title = "";
      el.onkeydown = null;
    }
  }

  private masaSimgeleri(k: Kisi, masada: boolean) {
    const masa = k.masa!;
    const arac = masada && k.aracSimge && this.t < k.aracSimge.bitis ? k.aracSimge.simge : null;
    if (arac) {
      if (!k.aracEl) {
        k.aracEl = document.createElement("div");
        k.aracEl.className = "ofis-arac";
        this.ustKatman.appendChild(k.aracEl);
      }
      if (k.aracEl.dataset.simge !== arac) {
        k.aracEl.dataset.simge = arac;
        k.aracEl.innerHTML = simgeSvg(arac, 11);
        k.aracEl.classList.remove("ofis-arac-gir");
        void k.aracEl.offsetWidth;
        k.aracEl.classList.add("ofis-arac-gir");
      }
      // Kasanın üst kenarında, oturanın başının yanında: ekranda olan, ona dönük
      const ax = masa.monitor.x + masa.monitor.g * 0.7;
      const ay = masa.monitor.y + masa.monitor.h * 0.08;
      k.aracEl.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) scale(${Math.min(this.ters, 1.3).toFixed(3)}) translate(-50%, -100%)`;
    } else if (k.aracEl) {
      k.aracEl.remove();
      k.aracEl = null;
    }
    const saat = this.t < k.saatBitis;
    if (saat) {
      if (!k.saatEl) {
        k.saatEl = document.createElement("div");
        k.saatEl.className = "ofis-saat";
        k.saatEl.innerHTML = simgeSvg("saat", 11);
        k.saatEl.title = so().gozetmenHatirlatti;
        this.ustKatman.appendChild(k.saatEl);
      }
      k.saatEl.style.transform = `translate(${masa.ust.x - 30}px, ${masa.ust.y + 22}px) scale(${Math.min(this.ters, 1.3).toFixed(3)}) translate(-50%, -50%)`;
    } else if (k.saatEl) {
      k.saatEl.remove();
      k.saatEl = null;
    }
  }

  // ---- balonlar ----

  private balonlariIlerlet(dt: number) {
    for (const b of this.balonlar) {
      if (b.yazar && b.gosterilen < b.tam.length) {
        const once = Math.floor(b.gosterilen);
        b.gosterilen = Math.min(b.tam.length, b.gosterilen + (dt / 1000) * 42);
        const simdi = Math.floor(b.gosterilen);
        if (simdi !== once && b.gorunur) {
          b.metinEl.dataset.yaziyor = "1";
          b.metinEl.innerHTML = `${kacis(b.tam.slice(0, simdi))}<span class="ofis-balon-gizli">${kacis(b.tam.slice(simdi))}</span>`;
          if (simdi >= b.tam.length) {
            b.metinEl.textContent = b.tam;
            delete b.metinEl.dataset.yaziyor;
          }
        }
      }
      if (!b.kapaniyor && this.t >= b.bitis) {
        b.kapaniyor = true;
        b.el.classList.add("ofis-balon-kapan");
        const kisi = b.kisi;
        setTimeout(() => {
          b.el.remove();
          this.balonlar = this.balonlar.filter((x) => x !== b);
          kisi.balonlar = kisi.balonlar.filter((x) => x !== b);
          const sonraki = kisi.bekleyenBalon.shift();
          if (sonraki && this.kisiler.has(kisi.id)) this.balon(kisi, sonraki.metin, sonraki.tip, sonraki.simge, sonraki.ust, sonraki.sure);
        }, 260);
      }
    }
  }

  /** Balonlar konuşanın başının üstünde; çakışanlar yukarı itilir */
  private balonlariYerlestir() {
    const ters = this.ters;
    // Okuma: ölçülmemiş balonlar
    for (const b of this.balonlar) {
      if (!b.olcum) continue;
      b.g = b.el.offsetWidth;
      b.h = b.el.offsetHeight;
      b.olcum = false;
      if (!b.gorunur) {
        b.gorunur = true;
        if (b.yazar) b.metinEl.innerHTML = `<span class="ofis-balon-gizli">${kacis(b.tam)}</span>`;
      }
    }
    const yerlesen: { x1: number; x2: number; y1: number; y2: number }[] = [];
    const sirali = [...this.balonlar].sort((a, b) => a.bas - b.bas);
    const ustPay = 24 * ters;
    for (const b of sirali) {
      const k = b.kisi;
      const g = b.g * ters;
      const h = b.h * ters;
      const cx = k.x + k.ax;
      let alt = k.y + k.ay - k.boy - ustPay - (k.yaz.isaret ? 18 * ters : 0) - (k.yaz.is ? 12 * ters : 0);
      let x1 = Math.max(4, Math.min(this.yer.genislik - g - 4, cx - g / 2));
      for (let i = 0; i < 8; i++) {
        const cakisan = yerlesen.find((r) => x1 < r.x2 + 3 && x1 + g > r.x1 - 3 && alt - h < r.y2 + 3 && alt > r.y1 - 3);
        if (!cakisan) break;
        alt = cakisan.y1 - 5;
      }
      if (alt - h < 2) {
        alt = h + 2;
        x1 = Math.max(4, Math.min(this.yer.genislik - g - 4, x1));
      }
      yerlesen.push({ x1, x2: x1 + g, y1: alt - h, y2: alt });
      // Kuyruk konuşanı göstersin
      const kuyruk = Math.max(10, Math.min(b.g - 10, (cx - x1) / ters));
      b.el.style.setProperty("--kuyruk", `${kuyruk.toFixed(1)}px`);
      b.el.style.transform = `translate(${x1.toFixed(1)}px, ${(alt - h).toFixed(1)}px) scale(${ters.toFixed(3)})`;
      b.x = x1;
      b.y = alt;
    }
  }

  private ucanlariIlerlet() {
    for (const u of this.ucanlar.splice(0)) {
      const p = Math.min(1, (this.t - u.t0) / u.sure);
      const e = yumusakGecis(p);
      const h = u.hedef();
      const kx = (u.bas.x + h.x) / 2;
      const ky = Math.min(u.bas.y, h.y) - 140;
      const x = (1 - e) ** 2 * u.bas.x + 2 * (1 - e) * e * kx + e * e * h.x;
      const y = (1 - e) ** 2 * u.bas.y + 2 * (1 - e) * e * ky + e * e * h.y;
      u.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${Math.min(this.ters, 1.4).toFixed(3)}) translate(-50%, -50%) rotate(${((1 - p) * -14).toFixed(1)}deg)`;
      if (p >= 1) {
        u.el.remove();
        u.sonra();
      } else this.ucanlar.push(u);
    }
  }

  private sunucuYaz() {
    const akiyor = this.t < this.sunucuAkisBitis;
    for (const el of this.sunucuIsiklari) if (el.classList.contains("ofis-akiyor") !== akiyor) el.classList.toggle("ofis-akiyor", akiyor);
  }

  private ipucuYaz() {
    const k = this.ipucuKisi;
    if (!k || !this.b || !this.kamera) return;
    if (!this.kisiler.has(k.id)) {
      this.ipucuGizle();
      return;
    }
    // Yazı ve ölçüler 400 ms'de bir yenilenir; aradaki karelerde yalnız konum hesaplanır (yerleşim zorlanmaz)
    if (this.t - this.ipucuYazildi > 400) {
      this.ipucuYazildi = this.t;
      const a = k.ajan;
      this.ipucu.innerHTML = `<b>${kacis(a.ad)}</b><small>${kacis(a.rolAdi)}</small><span class="ofis-ipucu-durum" data-durum="${DURUM_SINIFI[a.durum]}"><i></i>${kacis(sozluk().genel.ajanDurumu[a.durum])}</span><p>${kacis(this.etkinlikMetni(k))}</p>`;
      const alan = this.b.alan.getBoundingClientRect();
      const ekran = this.b.ekran.getBoundingClientRect();
      this.ipucuOlcu = { dx: alan.left - ekran.left, dy: alan.top - ekran.top, eg: ekran.width, eh: ekran.height, g: this.ipucu.offsetWidth, h: this.ipucu.offsetHeight };
    }
    const n = this.kamera.ekrana(k.x + k.ax, k.y - k.boy * (1 - k.kirp));
    const o = this.ipucuOlcu;
    let x = n.x + o.dx + 18;
    let y = n.y + o.dy - 8;
    if (x + o.g > o.eg - 8) x = n.x + o.dx - o.g - 18;
    x = Math.max(8, x);
    y = Math.max(8, Math.min(o.eh - o.h - 8, y));
    this.ipucu.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }
}

function kacis(m: string) {
  return m.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
