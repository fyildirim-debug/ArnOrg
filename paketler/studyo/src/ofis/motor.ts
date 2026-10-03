// Ofis motoru: React dışında çalışan canlı sahne. Karakterler, davranışlar, sahneler (üreteç işlevleri),
// balonlar, kamera ve requestAnimationFrame döngüsü. React yalnız veri ve olay iletir; her karede
// React durumu güncellenmez, konumlar doğrudan transform ile yazılır.
import {
  AJAN_DURUM_ADLARI,
  GOREV_DURUM_ADLARI,
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
import { esyaOgesi, PANO_SUTUNLARI, panoOgesi, zeminSvg, type PanoOgesi } from "./cizim";
import { Kamera } from "./kamera";
import { projeAtamalari } from "./karakterAtama";
import { adayKarakteri } from "./karakterSecimi";
import { adlariBul, balonMetni } from "./metin";
import { aracSimgesi, simgeSvg, type OfisSimgesi } from "./simgeler";
import { esyaOranlari, varlikAdresi, type KarakterVarligi, type Varliklar } from "./varliklar";
import {
  KARAKTER_BOYU,
  KARO,
  karoAyak,
  masaSayisi,
  noktaKarosu,
  yerlesimKur,
  yurunebilirMi,
  type Karo,
  type Koltuk,
  type Masa,
  type Nokta,
  type SicakNokta,
  type Yerlesim,
} from "./yerlesim";
import { enYakinAcik, rota, uzunluk, yakinBos } from "./yol";

// ---------------------------------------------------------------------------
// Dış arayüz
// ---------------------------------------------------------------------------

export type OfisHedefi = "onaylar" | "denetim" | "pano" | "kod" | "notlar" | "kanallar";

export type AkisTuru = "mesaj" | "gorev" | "onay" | "hafiza" | "soru" | "giris" | "cikis" | "birlesme" | "kurul" | "toplanti" | "bildirim";

export interface AkisSatiri {
  id: number;
  zaman: number;
  tur: AkisTuru;
  metin: string;
}

export interface MotorCagrilari {
  ajanSec: (ajanId: string) => void;
  git: (hedef: OfisHedefi, p?: { kanal?: string }) => void;
  akis: (satir: AkisSatiri) => void;
  ozet: (metin: string) => void;
}

export interface MotorVerisi {
  ajanlar: Ajan[];
  gorevler: Gorev[];
  onaylar: Onay[];
}

export interface MotorSecenekleri {
  /** Görüntü alanı: kamera olaylarını dinler, katmanlar içine kurulur */
  alan: HTMLElement;
  /** İpucu gibi ekran katmanı öğeleri için kap */
  ekran: HTMLElement;
  varliklar: Varliklar;
  projeId: string;
  cagrilar: MotorCagrilari;
  /** Sığdırırken üstte bırakılacak pay */
  ustPay: () => number;
}

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

type KaliciTur = "masa" | "kurul" | "dinlen";

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
  kuyruk: { ad: string; gen: () => Senaryo; son?: () => void }[];
  kaliciTur: KaliciTur;
  rezerv: number | null;
  etkinlik: string;
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
  balonlar: Balon[];
  bekleyenBalon: { metin: string; tip: BalonTipi; simge?: OfisSimgesi; ust?: string }[];
  // yazılan son değerler (gereksiz DOM yazımını önler)
  yaz: { tf: string; z: number; govde: string; kirp: string; ust: string; op: string; durum: string; etiket: string; isaret: string; ad: string; is: string; oturan: boolean };
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
  private s: MotorSecenekleri;
  private v: Varliklar;
  private yer!: Yerlesim;
  private dunya: HTMLDivElement;
  private nesneler: HTMLDivElement;
  private ustKatman: HTMLDivElement;
  private zeminKap: HTMLDivElement;
  private durgun: HTMLElement[] = [];
  private kamera: Kamera;
  private kisiler = new Map<string, Kisi>();
  private atamalar = new Map<string, string>();
  private masaAtamalari = new Map<string, string>();
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
  private t = 0;
  private sonKare = 0;
  private kare: number | null = null;
  private calisiyor = false;
  private ilkVeri = true;
  private olcek = 1;
  private ters = 1;
  private lod = "";
  private akisNo = 0;
  private azHareket: boolean;
  private azHareketSorgu: MediaQueryList;
  private kaldir: (() => void)[] = [];
  private ozetAnahtari = "";
  private gorulenHafiza = new Set<string>();
  private yokEdildi = false;

  constructor(s: MotorSecenekleri) {
    this.s = s;
    this.v = s.varliklar;
    this.azHareketSorgu = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.azHareket = this.azHareketSorgu.matches;
    const azDegisti = () => (this.azHareket = this.azHareketSorgu.matches);
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
    this.dunya.append(this.zeminKap, this.nesneler, this.ustKatman);
    s.alan.appendChild(this.dunya);

    this.ipucu = document.createElement("div");
    this.ipucu.className = "ofis-ipucu";
    this.ipucu.setAttribute("role", "tooltip");
    this.ipucu.hidden = true;
    s.ekran.appendChild(this.ipucu);

    this.yerlesimiKur(masaSayisi(0));
    this.kamera = new Kamera({
      alan: s.alan,
      dunya: this.dunya,
      genislik: this.yer.genislik,
      yukseklik: this.yer.yukseklik,
      ustPay: s.ustPay,
      degisti: (o) => this.olcekDegisti(o),
    });
    this.kamera.sigdir(false);

    // Tıklamalar: karakter, sıcak noktalar, işaretler
    const tik = (e: MouseEvent) => this.tiklandi(e);
    this.dunya.addEventListener("click", tik);
    this.kaldir.push(() => this.dunya.removeEventListener("click", tik));
    const ustune = (e: Event) => this.ipucuBak(e);
    for (const tur of ["pointerover", "pointerout", "focusin", "focusout"]) {
      this.dunya.addEventListener(tur, ustune);
      this.kaldir.push(() => this.dunya.removeEventListener(tur, ustune));
    }
    const gorunurluk = () => {
      if (document.hidden) this.dur();
      else this.basla();
    };
    document.addEventListener("visibilitychange", gorunurluk);
    this.kaldir.push(() => document.removeEventListener("visibilitychange", gorunurluk));
    this.basla();
  }

  // -------------------------------------------------------------------------
  // Yaşam döngüsü
  // -------------------------------------------------------------------------

  yokEt() {
    this.yokEdildi = true;
    this.dur();
    this.kamera.yokEt();
    this.kaldir.forEach((f) => f());
    this.dunya.remove();
    this.ipucu.remove();
  }

  private basla() {
    if (this.calisiyor || this.yokEdildi || document.hidden) return;
    this.calisiyor = true;
    this.sonKare = performance.now();
    const dongu = (an: number) => {
      if (!this.calisiyor) return;
      const dt = Math.min(64, Math.max(0, an - this.sonKare));
      this.sonKare = an;
      this.guncelle(dt);
      this.kare = requestAnimationFrame(dongu);
    };
    this.kare = requestAnimationFrame(dongu);
  }

  private dur() {
    this.calisiyor = false;
    if (this.kare) cancelAnimationFrame(this.kare);
    this.kare = null;
  }

  sigdir() {
    this.kamera.sigdir();
  }

  yakinlastir(carpan: number) {
    this.kamera.yakinlastir(carpan);
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
      this.nesneler.appendChild(el);
      this.durgun.push(el);
    }
    // Monitör ışımaları (masanın hemen önünde, aynı derinlikte)
    for (const m of y.masalar) {
      const isik = document.createElement("div");
      isik.className = "ofis-monitor";
      isik.style.cssText = `left:${m.monitor.x}px;top:${m.monitor.y}px;width:${m.monitor.g}px;height:${m.monitor.h}px;z-index:${Math.round(m.oturma.y + 30)}`;
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
    // Pano
    this.pano = panoOgesi(y);
    this.nesneler.appendChild(this.pano.kok);
    this.durgun.push(this.pano.kok);
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

    this.panoyuGuncelle();
    this.kurulIsiklariniGuncelle();
  }

  /** Masa sayısı yetmezse yerleşimi büyütür; karakterler yerinde kalır, yürünemez yerdeyse en yakın açık karoya geçer */
  private yerlesimiBuyut(masa: number) {
    this.yerlesimiKur(masa);
    this.kamera.boyutDegisti(this.yer.genislik, this.yer.yukseklik);
    this.masaAtamalari.clear();
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
    this.masalariAta();
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
    this.ilkVeri = false;
    // Karakter atamaları (kalıcı)
    this.atamalar = projeAtamalari(this.s.projeId, v.ajanlar, this.v.karakterler, this.atamalar);

    // Masa kapasitesi
    const gereken = this.muhendisSayisi(v.ajanlar);
    const kapasite = this.yer.masalar.filter((m) => m.oda === "muhendislik").length;
    if (masaSayisi(gereken) > kapasite) this.yerlesimiBuyut(masaSayisi(gereken));

    const gorulen = new Set<string>();
    for (const a of v.ajanlar) {
      gorulen.add(a.id);
      const k = this.kisiler.get(a.id);
      if (!k) {
        this.kisiEkle(a, ilk);
        continue;
      }
      const eski = k.ajan;
      k.ajan = a;
      const yeniKarakter = this.atamalar.get(a.id);
      if (yeniKarakter && yeniKarakter !== k.karakter.id) this.karakterDegistir(k, yeniKarakter);
      if (eski.durum !== a.durum) this.durumDegisti(k, eski.durum);
    }
    for (const k of [...this.kisiler.values()]) if (!gorulen.has(k.id) && !k.cikiyor) this.kisiAyrildi(k);
    this.masalariAta();

    // Görevler
    this.gorevler = v.gorevler;
    for (const g of v.gorevler) {
      const once = this.gorevDurumu.get(g.id);
      this.gorevDurumu.set(g.id, g.durum);
      if (!ilk && once !== undefined && once !== g.durum) this.gorevGecti(g, once);
      else if (!ilk && once === undefined) this.akisa("gorev", `Yeni görev ${g.kod}: ${kisaMetin(g.baslik, 48)}`);
    }
    this.panoyuGuncelle();

    // Onaylar
    this.onaylar = v.onaylar;
    for (const o of v.onaylar) {
      const once = this.onayDurumu.get(o.id);
      this.onayDurumu.set(o.id, o.durum);
      if (ilk) continue;
      if (once === undefined && o.durum === "bekliyor") this.onayYeni(o);
      else if (once === "bekliyor" && o.durum !== "bekliyor") this.onaySonuc(o);
    }
    this.kurulIsiklariniGuncelle();
    this.adaylariGuncelle(ilk);
    this.ozetiGuncelle();
  }

  private muhendisSayisi(ajanlar: Ajan[]) {
    const ceo = ajanlar.filter((a) => a.rol === "ceo").length ? 1 : 0;
    const cto = ajanlar.filter((a) => a.rol === "cto").length ? 1 : 0;
    return Math.max(0, ajanlar.length - ceo - cto);
  }

  /** CEO ve CTO kendi odalarında; diğerleri açık ofiste, işe alınma sırasıyla ve yapışkan */
  private masalariAta() {
    const sirali = [...this.kisiler.values()].filter((k) => !k.cikiyor).sort((a, b) => a.ajan.olusturma.localeCompare(b.ajan.olusturma) || a.id.localeCompare(b.id));
    const dolu = new Set<string>();
    const odaSahibi = (rol: string) => sirali.find((k) => k.ajan.rol === rol);
    const ceo = odaSahibi("ceo");
    const cto = odaSahibi("cto");
    const yeni = new Map<string, string>();
    if (ceo) yeni.set(ceo.id, "ceo");
    if (cto) yeni.set(cto.id, "cto");
    for (const m of yeni.values()) dolu.add(m);
    // Önceki atamayı koru
    for (const k of sirali) {
      if (yeni.has(k.id)) continue;
      const m = this.masaAtamalari.get(k.id);
      if (m && m.startsWith("m") && !dolu.has(m) && this.yer.masalar.some((x) => x.kimlik === m)) {
        yeni.set(k.id, m);
        dolu.add(m);
      }
    }
    const bos = this.yer.masalar.filter((m) => m.oda === "muhendislik" && !dolu.has(m.kimlik));
    for (const k of sirali) {
      if (yeni.has(k.id)) continue;
      const m = bos.shift();
      if (m) yeni.set(k.id, m.kimlik);
    }
    this.masaAtamalari = yeni;
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

  private kisiEkle(a: Ajan, ilk: boolean) {
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
    govde.appendChild(img);
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
    ust.append(isaretEl, etiket, isEl);
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
      balonlar: [],
      bekleyenBalon: [],
      yaz: { tf: "", z: -1, govde: "", kirp: "", ust: "", op: "", durum: "", etiket: "", isaret: "", ad: "", is: "", oturan: false },
      sonEtiketZamani: -SONSUZ,
    };
    this.gorselAyarla(k, karakter);
    this.kisiler.set(a.id, k);
    // Sekme sırası: karakterler sıcak noktalardan (eşyalardan) önce gelsin
    const ilkKisiOlmayan = [...this.nesneler.children].find((el) => !el.classList.contains("ofis-kisi")) ?? null;
    this.nesneler.insertBefore(dugme, ilkKisiOlmayan);
    this.ustKatman.append(ust, eldeEl);
    this.masalariAta();

    if (ilk) {
      this.yerinde(k);
    } else {
      // Kapıdan girer, masasına yürür; CEO karşılar
      const kapi = karoAyak(this.yer.noktalar.kapi);
      k.x = kapi.x;
      k.y = kapi.y;
      k.opaklik = 0;
      k.hedefOpaklik = 1;
      this.akisa("giris", `${a.ad} ofise geldi · ${a.rolAdi}`);
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
    if (tur === "masa" && k.masa) {
      this.oturt(k, k.masa);
    } else if (tur === "kurul") {
      const karo = this.rezerveEt(k, this.yer.noktalar.kurulBekleme[0]!, this.yer.noktalar.kurulBekleme);
      const a = karoAyak(karo);
      k.x = a.x;
      k.y = a.y;
    } else {
      const karo = this.rezerveEt(k, sec(this.yer.noktalar.dinlenme) ?? this.yer.noktalar.kapiIci, this.yer.noktalar.dinlenme);
      const a = karoAyak(karo);
      k.x = a.x;
      k.y = a.y;
      k.yon = Math.random() < 0.5 ? 1 : -1;
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
    if (d === "karar_bekliyor") return "kurul";
    if (d === "bosta") return "dinlen";
    return "masa";
  }

  private durumDegisti(k: Kisi, eski: AjanDurumu) {
    const yeni = k.ajan.durum;
    const tur = this.kaliciTuru(yeni);
    if (yeni === "karar_bekliyor") this.akisa("onay", `${k.ajan.ad} kurul masasında kararınızı bekliyor`);
    else if (eski === "karar_bekliyor" && yeni === "calisiyor") this.akisa("onay", `${k.ajan.ad} masasına döndü`);
    else if (yeni === "hata") this.akisa("bildirim", `${k.ajan.ad}: oturumda hata`);
    if (tur !== k.kaliciTur) {
      k.kaliciTur = tur;
      if (!k.is || k.is.tur === "kalici") this.kaliciBaslat(k);
    }
  }

  private kisiAyrildi(k: Kisi) {
    k.cikiyor = true;
    k.kuyruk = [];
    this.akisa("cikis", `${k.ajan.ad} ofisten ayrıldı`);
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
    const gen = tur === "masa" ? this.masaDavranisi(k) : tur === "kurul" ? this.kurulDavranisi(k) : this.dinlenmeDavranisi(k);
    k.is = { tur: "kalici", ad: tur, gen, kosul: null };
  }

  private sahneEkle(k: Kisi, ad: string, gen: () => Senaryo, son?: () => void) {
    if (k.cikiyor) return;
    if (!k.is || k.is.tur === "kalici") {
      this.sahneBaslat(k, { ad, gen, son });
      return;
    }
    // En çok üç bekleyen sahne; eskisi düşer
    k.kuyruk.push({ ad, gen, son });
    if (k.kuyruk.length > 3) k.kuyruk.shift();
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

  private *masaDavranisi(k: Kisi): Senaryo {
    if (!k.masa) {
      yield* this.dinlenmeDavranisi(k);
      return;
    }
    if (k.oturan !== k.masa) yield* this.koltugaGit(k, k.masa);
    yield this.sonsuz();
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
    if (k.oturan) yield this.bekle(rastgele(1200, 3600));
    let ilk = true;
    for (;;) {
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

  // ---- sahneler ----

  /** Yeni gelen kapıdan girer, masasına oturur ve CEO'nun karşılamasını bekler */
  private *girisSahnesi(k: Kisi): Senaryo {
    k.etkinlik = "Ofise yeni geldi";
    yield this.bekle(300);
    yield* this.git(k, this.yer.noktalar.kapiIci);
    if (k.masa) {
      k.etkinlik = "Masasına yerleşiyor";
      yield* this.koltugaGit(k, k.masa);
      const ceo = this.ceo();
      if (ceo && ceo !== k) yield this.kosul(() => k.karsilandi, 16000);
      yield this.bekle(1200);
    }
  }

  private *cikisSahnesi(k: Kisi): Senaryo {
    k.etkinlik = "Ofisten ayrılıyor";
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
    ceo.etkinlik = `${yeni.ajan.ad} ile tanışıyor`;
    try {
      yield* this.yaninaGit(ceo, yeni);
      this.isaretKoy(yeni, "unlem", 2400);
      const b = this.balon(ceo, `Hoş geldin, ${yeni.ajan.ad}! Masan hazır.`, "konusma");
      yield this.balonBitene(b);
      this.balon(yeni, "Teşekkürler, başlıyorum.", "kisa");
      yield this.bekle(1600);
    } finally {
      yeni.karsilandi = true;
    }
  }

  private *konusmaSahnesi(g: Kisi, a: Kisi, metin: string, digerleri: Kisi[]): Senaryo {
    g.etkinlik = `${a.ajan.ad} ile konuşuyor`;
    yield* this.yaninaGit(g, a);
    this.isaretKoy(a, "unlem", 2800);
    for (const d of digerleri) this.isaretKoy(d, "unlem", 2800);
    const b = this.balon(g, metin, "konusma");
    yield this.balonBitene(b);
    yield this.bekle(300);
  }

  private *yerindeKonusma(g: Kisi, metin: string, kanal: string): Senaryo {
    g.etkinlik = `#${kanal} kanalına yazıyor`;
    const b = this.balon(g, metin, "konusma", undefined, `#${kanal}`);
    yield this.balonBitene(b);
  }

  private *belgeSahnesi(o: Kisi, r: Kisi, kod: string): Senaryo {
    o.etkinlik = `${kod} incelemeye götürüyor`;
    o.elde = { simge: "belge", metin: kod };
    yield* this.yaninaGit(o, r);
    this.isaretKoy(r, "unlem", 2600);
    const b = this.balon(o, `${kod} incelemeye hazır`, "konusma");
    yield this.balonBitene(b);
    o.elde = null;
    this.balon(r, "Bakıyorum.", "kisa");
    yield this.bekle(900);
  }

  private *birlesmeSahnesi(k: Kisi, kod: string): Senaryo {
    k.etkinlik = `${kod} main'e birleşiyor`;
    yield* this.git(k, this.yer.noktalar.sunucuOnu[0]!, { adaylar: this.yer.noktalar.sunucuOnu });
    k.yon = -1;
    k.uzanma = this.t;
    this.sunucuAkisBitis = this.t + 4800;
    this.balon(k, `${kod} main'e birleşti`, "bilgi", "dal");
    yield this.bekle(3800);
  }

  private *arsivSahnesi(k: Kisi, baslik: string): Senaryo {
    k.etkinlik = "Arşive not bırakıyor";
    yield* this.git(k, this.yer.noktalar.arsivOnu[0]!, { adaylar: this.yer.noktalar.arsivOnu });
    k.yon = 1;
    k.uzanma = this.t;
    const raf = this.nesneler.querySelector<HTMLElement>(`[data-kimlik="${this.yer.noktalar.arsivKimligi}"]`);
    raf?.classList.add("ofis-parilti");
    setTimeout(() => raf?.classList.remove("ofis-parilti"), 1600);
    this.balon(k, `not aldı: ${kisaMetin(baslik, 60)}`, "bilgi", "kitap");
    yield this.bekle(3400);
  }

  private *soruSahnesi(a: Kisi, b: Kisi, soru: string): Senaryo {
    a.etkinlik = `${b.ajan.ad} ile soru soruyor`;
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
    k.etkinlik = "Toplantıya gidiyor";
    try {
      if (bosKoltuk) {
        this.koltukSahipleri.set(bosKoltuk, k.id);
        yield* this.koltugaGit(k, bosKoltuk);
      } else {
        yield* this.git(k, n.toplantiAyakta[0]!, { adaylar: n.toplantiAyakta });
        const masa = this.yer.esyalar.find((e) => e.esya === "toplanti-masasi" && e.sicak === "toplanti");
        if (masa) this.yuzlestir(k, masa);
      }
      k.etkinlik = "Toplantıda";
      this.toplantiBalonlari(k);
      yield this.kosul(() => !this.toplanti || this.t > this.toplanti.bitis, 125000);
    } finally {
      // Yarıda kalırsa koltuk ve katılım bırakılır
      if (bosKoltuk && k.oturan !== bosKoltuk && this.koltukSahipleri.get(bosKoltuk) === k.id) this.koltukSahipleri.delete(bosKoltuk);
      toplanti?.katilimcilar.delete(k.id);
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
    if (m.projeId !== this.s.projeId) return;
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
        this.akisa("kurul", `Kurul #${m.kanal}: ${kisaMetin(metin, 56)}`);
        return;
      }
      // #toplanti: anılanlar toplantı odasına geçer, kurulun notu zarfla gelir
      if (m.kanal === "toplanti") this.toplantiyaCagir(hedefler, null, "");
      const km = this.yer.esyalar.find((e) => e.kimlik === this.yer.noktalar.kurulMasasiKimligi)!;
      for (const h of hedefler) {
        this.zarfGonder({ x: km.x, y: km.y - km.yukseklik }, h, () => this.balon(h, metin, "kurul", undefined, "Kurul"));
      }
      this.akisa("kurul", `Kurul → ${hedefler.map((h) => h.ajan.ad).join(", ")}: ${kisaMetin(metin, 56)}`);
      return;
    }

    const g = this.kisiler.get(m.gonderenId);
    if (!g || g.cikiyor) return;
    if (m.kanal === "toplanti") {
      // Çağıranın duyurusu: "Toplantı: <gündem>\nKatılımcılar: @A @B"; görüşler gelene kadar oda dolu kalır
      const duyuru = /^Toplantı:\s*([^\n]+)/.exec(m.metin.trim());
      if (duyuru) {
        const gundem = balonMetni(duyuru[1]!, 110);
        this.toplantiyaCagir([g, ...anilan], g, `Toplantı: ${gundem}`, 120000);
        this.akisa("toplanti", `Toplantı · ${g.ajan.ad}: ${kisaMetin(gundem, 48)} · ${anilan.map((a) => a.ajan.ad).join(", ")}`);
      } else {
        this.toplantiyaCagir([g, ...anilan], g, metin);
        this.akisa("toplanti", `Toplantı · ${g.ajan.ad}: ${kisaMetin(metin, 52)}`);
      }
      return;
    }
    let alicilar = anilan.filter((a) => a !== g);
    if (!alicilar.length && m.kanal === "genel") {
      const c = this.ceo();
      if (c && c !== g) alicilar = [c];
    }
    const [ilk, ...digerleri] = alicilar;
    if (ilk) {
      this.sahneEkle(g, "konusma", () => this.konusmaSahnesi(g, ilk, metin, digerleri));
      this.akisa("mesaj", `${g.ajan.ad} → ${alicilar.map((a) => a.ajan.ad).join(", ")}: ${kisaMetin(metin, 52)}`);
    } else {
      this.sahneEkle(g, "yazma", () => this.yerindeKonusma(g, metin, m.kanal));
      this.akisa("mesaj", `${g.ajan.ad} #${m.kanal}: ${kisaMetin(metin, 52)}`);
    }
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
    if (konusan && konusan.is?.ad === "toplanti" && konusan.etkinlik === "Toplantıda") this.toplantiBalonlari(konusan);
  }

  private toplantiBalonlari(k: Kisi) {
    const liste = this.toplanti?.balonlar.get(k.id);
    if (!liste?.length) return;
    for (const b of liste.splice(0)) this.balon(k, b.metin, "konusma");
  }

  hafizaGeldi(kayit: HafizaKaydi) {
    if (kayit.projeId !== this.s.projeId) return;
    // Güncellenen ya da yerine yenisi geçen kayıt yeniden canlandırılmaz
    if (kayit.yerineGecen || this.gorulenHafiza.has(kayit.id)) return;
    this.gorulenHafiza.add(kayit.id);
    const k = kayit.kaynakAjanId ? this.kisiler.get(kayit.kaynakAjanId) : undefined;
    if (!k || k.cikiyor) {
      this.akisa("hafiza", `${kayit.kaynakAd || "Kurul"} not aldı: ${kisaMetin(kayit.baslik, 48)}`);
      return;
    }
    this.sahneEkle(k, "arsiv", () => this.arsivSahnesi(k, kayit.baslik));
    this.akisa("hafiza", `${k.ajan.ad} not aldı: ${kisaMetin(kayit.baslik, 48)}`);
  }

  soruGeldi(s: AjanSorusu) {
    if (s.projeId !== this.s.projeId) return;
    const soran = this.kisiler.get(s.soranId);
    const sorulu = this.kisiler.get(s.soruluId);
    // Toplantı soruları (toplanti_yap): yürüyüş ve balon toplantı odasında; görüş #toplanti mesajıyla gelir
    if (/^Toplantı \(/.test(s.soru)) {
      if (s.durum === "bekliyor") {
        this.toplantiSorulari.add(s.id);
        this.toplantiyaCagir([soran, sorulu].filter((k): k is Kisi => !!k && !k.cikiyor), null, "", 120000);
        return;
      }
      this.toplantiSorulari.delete(s.id);
      if (s.durum === "zaman_asimi") {
        if (sorulu) this.isaretKoy(sorulu, "omuz", 2200);
        this.akisa("toplanti", `Toplantı · ${s.soruluAd} görüş vermedi`);
      }
      // Bütün görüşler geldiyse oda birkaç saniye sonra dağılır
      if (!this.toplantiSorulari.size && this.toplanti) this.toplanti.bitis = Math.min(this.toplanti.bitis, this.t + 9000);
      return;
    }
    if (s.durum === "bekliyor") {
      if (soran && sorulu && !soran.cikiyor) this.sahneEkle(soran, "soru", () => this.soruSahnesi(soran, sorulu, balonMetni(s.soru, 110)));
      this.akisa("soru", `${s.soranAd} → ${s.soruluAd}: ${kisaMetin(s.soru, 52)}`);
    } else if (s.durum === "yanitlandi") {
      if (sorulu) {
        if (soran && !soran.oturan && Math.hypot(soran.x - sorulu.x, soran.y - sorulu.y) < KARO * 3) this.yuzlestir(sorulu, soran);
        this.balon(sorulu, balonMetni(s.yanit ?? "Yanıtladım.", 110), "yanit");
        if (soran) this.isaretKoy(soran, "unlem", 2400);
      }
      this.akisa("soru", `${s.soruluAd} yanıtladı: ${kisaMetin(s.yanit ?? "", 52)}`);
    } else {
      if (soran) {
        this.isaretKoy(soran, "omuz", 2200);
        this.balon(soran, "Yanıt gelmedi.", "kisa");
      }
      this.akisa("soru", `${s.soranAd}: ${s.soruluAd} yanıt vermedi`);
    }
  }

  akisOgesi(projeId: string, oge: AkisOgesi) {
    if (projeId !== this.s.projeId || oge.tur !== "arac_cagrisi" || oge.ustAracKimligi) return;
    const k = this.kisiler.get(oge.ajanId);
    if (!k || !k.masa || k.oturan !== k.masa) return;
    k.aracSimge = { simge: aracSimgesi(oge.arac), bitis: this.t + 2800 };
    k.sonEtiketZamani = this.t;
  }

  bildirimGeldi(metin: string, projeId?: string) {
    if (projeId && projeId !== this.s.projeId) return;
    const kisiler = [...this.kisiler.values()].filter((k) => !k.cikiyor);
    const bulunan = adlariBul(metin, kisiler.map((k) => ({ ad: k.ajan.ad, k }))).map((x) => x.k);
    if (!bulunan.length) return;
    for (const k of bulunan) k.saatBitis = this.t + 20000;
    this.akisa("bildirim", `Gözetmen: ${kisaMetin(metin, 60)}`);
  }

  private gorevGecti(g: Gorev, once: GorevDurumu) {
    const sahip = g.atananId ? this.kisiler.get(g.atananId) : undefined;
    if (g.durum === "inceleme") {
      const ink = [...this.kisiler.values()].find((k) => k.ajan.rol === "inceleme" && k !== sahip && !k.cikiyor);
      const inceleyen = ink ?? this.ceo();
      if (sahip && inceleyen && inceleyen !== sahip && !sahip.cikiyor) {
        this.sahneEkle(sahip, "inceleme", () => this.belgeSahnesi(sahip, inceleyen, g.kod));
        this.akisa("gorev", `${sahip.ajan.ad} → ${inceleyen.ajan.ad}: ${g.kod} incelemeye hazır`);
      } else this.akisa("gorev", `${g.kod} incelemede`);
      return;
    }
    if (g.durum === "tamam") {
      requestAnimationFrame(() => this.panoKivilcim(g.id));
      if (sahip && !sahip.cikiyor) this.balon(sahip, `${g.kod} tamam`, "bilgi", "onay");
      this.akisa("gorev", `${g.kod} tamamlandı${sahip ? ` · ${sahip.ajan.ad}` : ""}`);
      return;
    }
    if (once !== g.durum) this.akisa("gorev", `${g.kod} → ${GOREV_DURUM_ADLARI[g.durum]}`);
  }

  private onayYeni(o: Onay) {
    const ajan = o.ajanId ? this.kisiler.get(o.ajanId)?.ajan : undefined;
    if (o.tur === "ise_alim") {
      const v = (o.veri ?? {}) as { ad?: string };
      this.akisa("onay", `Aday kapıda: ${v.ad ?? o.baslik}`);
    } else if (o.tur === "birlestirme") this.akisa("onay", `${o.baslik}: kurul onayı bekliyor`);
    else if (o.tur !== "arac") this.akisa("onay", `${ajan?.ad ?? "Ekip"}: ${kisaMetin(o.baslik, 48)}`);
  }

  private onaySonuc(o: Onay) {
    if (o.tur === "birlestirme" && o.durum === "onaylandi") {
      const v = (o.veri ?? {}) as { gorevId?: string };
      const g = this.gorevler.find((x) => x.id === v.gorevId);
      const sahip = (g?.atananId ? this.kisiler.get(g.atananId) : undefined) ?? (o.ajanId ? this.kisiler.get(o.ajanId) : undefined);
      const kod = g?.kod ?? "Dal";
      if (sahip && !sahip.cikiyor) this.sahneEkle(sahip, "birlesme", () => this.birlesmeSahnesi(sahip, kod));
      else this.sunucuAkisBitis = this.t + 4800;
      this.akisa("birlesme", `${kod} main'e birleşti`);
      return;
    }
    if (o.tur === "ise_alim") {
      const v = (o.veri ?? {}) as { ad?: string };
      if (o.durum !== "onaylandi") this.akisa("onay", `Aday ${v.ad ?? ""} kabul edilmedi`.replace("  ", " "));
      return;
    }
    if (o.tur !== "arac") this.akisa("onay", `${kisaMetin(o.baslik, 44)}: ${o.durum === "onaylandi" ? "onaylandı" : o.durum === "reddedildi" ? "reddedildi" : "süresi doldu"}`);
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
        .sort((a, b) => (sutun.ad === "Tamam" ? b.guncelleme.localeCompare(a.guncelleme) : a.no - b.no));
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
        el.title = `${g.kod} · ${g.baslik} · ${GOREV_DURUM_ADLARI[g.durum]}`;
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
    p.kok.setAttribute(
      "aria-label",
      `Pano: ${sayi(["bekleyen", "planlandi"])} bekleyen, ${sayi(["calisiliyor"])} süren, ${sayi(["inceleme"])} incelemede, ${sayi(["tamam"])} tamam. Görev panosuna git`,
    );
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
    const anahtar = `${n}`;
    if (this.kurulIsiklari.dataset.sayi !== anahtar) {
      this.kurulIsiklari.dataset.sayi = anahtar;
      this.kurulIsiklari.innerHTML = `<span class="ofis-kurul-ad">Kurul</span>${
        n ? `${Array.from({ length: goster }, (_, i) => `<i style="--i:${i}"></i>`).join("")}<b>${n}</b>` : ""
      }`;
      this.kurulZemin.classList.toggle("ofis-kurul-var", n > 0);
      const masa = this.nesneler.querySelector<HTMLElement>('[data-sicak="kurul"]');
      const metin = n ? `Kurul masası: ${n} bekleyen onay. Onaylara git` : "Kurul masası: bekleyen onay yok. Onaylara git";
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
      const karakterId = adayKarakteri(v.rol ?? "", this.v.karakterler, kullanilan, o.id);
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
      const etiket = `Aday: ${v.ad ?? o.baslik}${v.rol ? "" : ""}. İşe alım teklifine git`;
      el.setAttribute("aria-label", etiket);
      el.title = etiket;
      el.innerHTML = `<span class="ofis-aday-golge"></span><img alt="" draggable="false" src="${varlikAdresi(karakter.dosya)}"><span class="ofis-aday-ad">Aday · ${(v.ad ?? "").replace(/[<>&"]/g, "")}</span>`;
      this.nesneler.appendChild(el);
      this.adaylar.set(o.id, { onayId: o.id, el, karo: bos, cikiyor: false });
    }
  }

  // -------------------------------------------------------------------------
  // Balonlar, işaretler, zarf
  // -------------------------------------------------------------------------

  private balon(k: Kisi, metin: string, tip: BalonTipi, simge?: OfisSimgesi, ust?: string): Balon | null {
    if (!this.kisiler.has(k.id)) return null;
    const gorunur = k.balonlar.filter((b) => !b.kapaniyor);
    if (gorunur.length >= 2) {
      // Sıraya al: en eskisi kapanınca çıkar
      k.bekleyenBalon.push({ metin, tip, simge, ust });
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
    const sure = Math.min(9000, Math.max(tip === "kisa" || tip === "bilgi" ? 2800 : 3600, yazmaSuresi + 1800 + metin.length * 18));
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
      this.s.cagrilar.git(arac ? "denetim" : "onaylar");
      return;
    }
    const kisi = hedef.closest<HTMLElement>(".ofis-kisi");
    if (kisi?.dataset.ajan) {
      this.s.cagrilar.ajanSec(kisi.dataset.ajan);
      return;
    }
    const sicak = hedef.closest<HTMLElement>("[data-sicak]")?.dataset.sicak;
    if (!sicak) return;
    if (sicak === "kurul" || sicak === "aday") this.s.cagrilar.git("onaylar");
    else if (sicak === "pano") this.s.cagrilar.git("pano");
    else if (sicak === "sunucu") this.s.cagrilar.git("kod");
    else if (sicak === "arsiv") this.s.cagrilar.git("notlar");
    else if (sicak === "toplanti") this.s.cagrilar.git("kanallar", { kanal: "toplanti" });
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
        if (e.type === "focusin") this.kamera.goster(kisi.x, kisi.y - kisi.boy / 2);
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
    const a = k.ajan;
    if (k.cikiyor) return "Ofisten ayrılıyor";
    if (k.is?.tur === "sahne" && k.etkinlik) return k.etkinlik;
    switch (a.durum) {
      case "calisiyor":
        return k.oturan ? `Masasında çalışıyor${a.isAciklamasi ? ` · ${a.isAciklamasi}` : ""}` : "Masasına gidiyor";
      case "karar_bekliyor":
        return "Kurul masasında kararınızı bekliyor";
      case "bosta":
        return k.elde?.simge === "fincan" ? "Dinlenme alanında kahve içiyor" : k.elde?.simge === "bardak" ? "Su içiyor" : "Dinlenme alanında, iş bekliyor";
      case "kapali":
        return "Oturumu kapalı · masasında";
      case "duraklatildi":
        return "Kurul tarafından duraklatıldı";
      case "hata":
        return "Oturumda hata var";
    }
  }

  private olcekDegisti(o: number) {
    this.olcek = o;
    this.ters = Math.min(1.15, Math.max(0.74, o)) / o;
    this.dunya.style.setProperty("--ters", this.ters.toFixed(3));
    const lod = o < 0.42 ? "uzak" : o < 0.62 ? "orta" : "yakin";
    if (lod !== this.lod) {
      this.lod = lod;
      this.dunya.dataset.lod = lod;
    }
    for (const k of this.kisiler.values()) k.yaz.ust = "";
    for (const b of this.balonlar) b.olcum = true;
  }

  private akisa(tur: AkisTuru, metin: string) {
    this.s.cagrilar.akis({ id: ++this.akisNo, zaman: Date.now(), tur, metin });
  }

  private ozetiGuncelle() {
    const sayac: Partial<Record<AjanDurumu, number>> = {};
    const liste = [...this.kisiler.values()].filter((k) => !k.cikiyor);
    for (const k of liste) sayac[k.ajan.durum] = (sayac[k.ajan.durum] ?? 0) + 1;
    const parcalar = (Object.keys(AJAN_DURUM_ADLARI) as AjanDurumu[])
      .filter((d) => sayac[d])
      .map((d) => `${sayac[d]} ${AJAN_DURUM_ADLARI[d].toLocaleLowerCase("tr-TR")}`);
    const bekleyen = this.onaylar.filter((o) => o.durum === "bekliyor").length;
    const metin = `Ofiste ${liste.length} çalışan${parcalar.length ? `: ${parcalar.join(", ")}` : ""}. Kurul masasında ${bekleyen ? `${bekleyen} bekleyen onay` : "bekleyen onay yok"}.`;
    if (metin !== this.ozetAnahtari) {
      this.ozetAnahtari = metin;
      this.s.cagrilar.ozet(metin);
    }
  }

  // -------------------------------------------------------------------------
  // Kare
  // -------------------------------------------------------------------------

  private guncelle(dt: number) {
    this.t += dt;
    const kisiler = [...this.kisiler.values()];
    for (const k of kisiler) {
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
      const u = Math.min(1, (this.t - g.t0) / g.sure);
      const e = yumusakGecis(u);
      k.x = g.bas.x + (g.son.x - g.bas.x) * e;
      k.y = g.bas.y + (g.son.y - g.bas.y) * e;
      k.kirp = g.kirpBas + (g.kirpSon - g.kirpBas) * e;
      if (u >= 1) k.gecis = null;
      return;
    }
    if (!k.yol) return;
    let kalan = (k.hiz * dt) / 1000;
    const onceX = k.x;
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
    if (Math.abs(hareketX) > 0.15) k.yon = hareketX > 0 ? 1 : -1;
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
      if (yuruyor) {
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
    // İşaret: kalıcı (durumdan) ya da geçici
    let isaret = "";
    if (k.isaret && this.t >= k.isaret.bitis) k.isaret = null;
    if (k.ajan.durum === "karar_bekliyor") isaret = "soru";
    else if (k.isaret) isaret = k.isaret.tip;
    else if (k.ajan.durum === "kapali" && k.oturan) isaret = "uyku";
    else if (k.ajan.durum === "duraklatildi") isaret = "duraklat";
    else if (k.ajan.durum === "hata") isaret = "uyari";
    if (isaret !== k.yaz.isaret) {
      k.yaz.isaret = isaret;
      this.isaretYaz(k, isaret);
    }
    // Etiket (erişilebilir ad) seyrek güncellenir
    if (this.t - k.sonEtiketZamani > 700) {
      k.sonEtiketZamani = this.t;
      const etiket = `${k.ajan.ad}, ${k.ajan.rolAdi}, ${AJAN_DURUM_ADLARI[k.ajan.durum]}: ${this.etkinlikMetni(k)}`;
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
      const masadaCalisiyor = k.oturan === k.masa && k.ajan.durum === "calisiyor";
      const isik = this.monitorler.get(k.masa.kimlik);
      if (isik) {
        const durumu = masadaCalisiyor ? (k.aracSimge && this.t < k.aracSimge.bitis ? "parlak" : "acik") : "";
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
        el.setAttribute("aria-label", `${k.ajan.ad} kararınızı bekliyor: onaya git`);
        el.title = "Kararınızı bekliyor: onaya git";
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
        el.innerHTML = "<i>z</i><i>z</i>";
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
      k.aracEl.style.transform = `translate(${masa.monitor.x + masa.monitor.g * 0.5}px, ${masa.monitor.y - 2}px) scale(${Math.min(this.ters, 1.3).toFixed(3)}) translate(-50%, -100%)`;
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
        k.saatEl.title = "Gözetmen hatırlattı";
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
          if (sonraki && this.kisiler.has(kisi.id)) this.balon(kisi, sonraki.metin, sonraki.tip, sonraki.simge, sonraki.ust);
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
    if (!k) return;
    if (!this.kisiler.has(k.id)) {
      this.ipucuGizle();
      return;
    }
    if (this.t - this.ipucuYazildi > 400) {
      this.ipucuYazildi = this.t;
      const a = k.ajan;
      this.ipucu.innerHTML = `<b>${kacis(a.ad)}</b><small>${kacis(a.rolAdi)}</small><span class="ofis-ipucu-durum" data-durum="${DURUM_SINIFI[a.durum]}"><i></i>${AJAN_DURUM_ADLARI[a.durum]}</span><p>${kacis(this.etkinlikMetni(k))}</p>`;
    }
    const n = this.kamera.ekrana(k.x + k.ax, k.y - k.boy * (1 - k.kirp));
    const alan = this.s.alan.getBoundingClientRect();
    const ekran = this.s.ekran.getBoundingClientRect();
    const g = this.ipucu.offsetWidth;
    const h = this.ipucu.offsetHeight;
    let x = n.x + alan.left - ekran.left + 18;
    let y = n.y + alan.top - ekran.top - 8;
    if (x + g > ekran.width - 8) x = n.x + alan.left - ekran.left - g - 18;
    x = Math.max(8, x);
    y = Math.max(8, Math.min(ekran.height - h - 8, y));
    this.ipucu.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }
}

function kacis(m: string) {
  return m.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
