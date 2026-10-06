// Proje bütçesi ve geçerli kullanım seviyesi (0.0.10). Kurulun proje başına seçtiği token bütçesi (toplam ve günlük)
// projenin işlediği tokenla (kullanim tablosu) ölçülür:
//   - %80: kurul (açılır pencere), CEO (ekipten haberler) ve #genel bir kez uyarılır.
//   - %100: projenin turu süren çalışanları kesilir; kurul dışından gelen mesajlar bekletilir, ArnOrg kendiliğinden iş
//     başlatmaz. Kurul bütçeyi artırınca (günlük bütçede gece yarısı da) bekletilenler kaldıkları yerden sürer. Tur
//     sürerken tahminle dolan bütçe, tur sonundaki kesin sayı biraz altında kalsa da yalnız bütçe değişince ya da gün
//     dönünce açılır (art arda dur-kalk olmasın).
//   - Bitiş tahmini: son bir saatteki hızla (ArnOrg açıldıktan sonraki ilk saatte açık kaldığı süreyle, en az 10 dakika)
//     kalan bütçenin ne zaman biteceği.
// Geçerli seviye: otomatik kademe açıksa bütçe %80'i ya da haftalık abonelik penceresi %80'i geçince kurulun seçtiği
// seviyenin bir altı, koşul kalkınca yeniden kurulunki. Değişince Şirket modelleri, düşünme derinliğini ve tempoyu
// uygular (seviyeDegisti); bu modül kurula, CEO'ya ve #genel'e duyurur. Abonelik penceresi henüz okunmadıysa son bilinen
// pencere koşulu geçerlidir (açılışta seviye inip çıkmasın).
import {
  altSeviye,
  BUTCE_UYARI_YUZDE,
  KADEME_ESIGI_YUZDE,
  seviyeGorevTavani,
  seviyeMi,
  seviyeTempoSiniri as tempoSiniri,
  type ButceDurumu,
  type ButceDurumuTuru,
  type ButceKalemi,
  type HesapDurumu,
  type KullanimSeviyesi,
  type Proje,
} from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import { kisaToken } from "./gorev-tavani.js";
import { bugun, jsonOku } from "./yardimci.js";

/** Anahtar-değer kayıtları: projenin son bütçe durumu, son uygulanan seviye; son bilinen haftalık pencere koşulu */
const DURUM_ONEKI = "butce-durumu:";
const SEVIYE_ONEKI = "etkin-seviye:";
const PENCERE_ANAHTARI = "kademe-penceresi";

const DAKIKA_MS = 60_000;
const SAAT_MS = 60 * DAKIKA_MS;
/** Hız en az bu kadar süreli gözlemle ölçülür */
const TAHMIN_EN_AZ_MS = 10 * DAKIKA_MS;
/** Bundan uzak tahmin gösterilmez */
const TAHMIN_EN_COK_MS = 30 * 24 * SAAT_MS;
/** Proje özeti kullanımdan sonra en çok bu sıklıkla yeniden yayınlanır */
const YAYIN_ARALIGI_MS = 1500;

// ---------------------------------------------------------------------------
// Saf hesaplar
// ---------------------------------------------------------------------------

/** Bütçenin kalemi; sınır yoksa null */
export function butceKalemi(sinir: number | null, harcanan: number): ButceKalemi | null {
  if (!sinir || !(sinir > 0)) return null;
  const h = Math.max(0, Math.round(harcanan));
  return { sinir, harcanan: h, yuzde: Math.round((h / sinir) * 1000) / 10 };
}

const SIRA: Record<ButceDurumuTuru, number> = { normal: 0, uyari: 1, doldu: 2 };

/** Kalemin durumu: dolduysa doldu, %80'i geçtiyse uyarı */
function kalemDurumu(k: ButceKalemi): ButceDurumuTuru {
  return k.harcanan >= k.sinir ? "doldu" : k.yuzde >= BUTCE_UYARI_YUZDE ? "uyari" : "normal";
}

/** İki kalemden ağır basanı: doldu > uyarı > normal; eşitlikte yüzdesi büyük olan neden olur */
export function butceDurumuBul(toplam: ButceKalemi | null, gunluk: ButceKalemi | null): { durum: ButceDurumuTuru; neden: "toplam" | "gunluk" | null } {
  let durum: ButceDurumuTuru = "normal";
  let neden: "toplam" | "gunluk" | null = null;
  let yuzde = -1;
  for (const [ad, k] of [
    ["toplam", toplam],
    ["gunluk", gunluk],
  ] as const) {
    if (!k) continue;
    const d = kalemDurumu(k);
    if (d === "normal") continue;
    if (SIRA[d] > SIRA[durum] || (SIRA[d] === SIRA[durum] && k.yuzde > yuzde)) {
      durum = d;
      neden = ad;
      yuzde = k.yuzde;
    }
  }
  return { durum, neden };
}

/** Haftalık pencere koşulu: eşiği geçen en dolu haftalık pencere; hesap okunmadıysa null (bilinmiyor) */
export function pencereKosulu(h: Pick<HesapDurumu, "durum" | "pencereler"> | null): { pencere: string | null; yuzde: number | null } | null {
  if (!h || h.durum !== "hazir") return null;
  const p = h.pencereler.filter((x) => x.tur !== "bes_saat" && (x.yuzde ?? 0) >= KADEME_ESIGI_YUZDE).sort((a, b) => (b.yuzde ?? 0) - (a.yuzde ?? 0))[0];
  return p ? { pencere: p.ad, yuzde: Math.round(p.yuzde ?? 0) } : { pencere: null, yuzde: null };
}

/** Kademe düşürmeden sonra geçerli seviye: otomatik açıksa bütçe uyarıda/dolu ya da haftalık pencere eşikteyse bir alt */
export function etkinSeviyeBul(
  seviye: KullanimSeviyesi,
  otomatik: boolean,
  butce: ButceDurumuTuru,
  pencere: string | null,
): { etkin: KullanimSeviyesi; kademe: ButceDurumu["kademe"] } {
  const alt = altSeviye(seviye);
  if (!otomatik || alt === seviye) return { etkin: seviye, kademe: null };
  if (butce !== "normal") return { etkin: alt, kademe: { neden: "butce", pencere: null } };
  if (pencere) return { etkin: alt, kademe: { neden: "pencere", pencere } };
  return { etkin: seviye, kademe: null };
}

/** Son bir saatin hızı (token/ms): izleme başlayalı bir saat olmadıysa o süreyle; 10 dakikadan kısa gözlemde ya da kullanım yoksa null */
export function hizHesapla(ornekler: readonly { t: number; token: number }[], simdiMs: number, baslangicMs: number): number | null {
  const pencere = Math.min(SAAT_MS, simdiMs - baslangicMs);
  if (pencere < TAHMIN_EN_AZ_MS) return null;
  const toplam = ornekler.reduce((a, o) => (o.t > simdiMs - pencere ? a + o.token : a), 0);
  return toplam > 0 ? toplam / pencere : null;
}

/** Yerel gece yarısına kalan süre */
function geceYarisinaMs(simdiMs: number): number {
  const d = new Date(simdiMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - simdiMs;
}

/** Bu hızla bütçenin dolacağı an: önce dolan kalem; günlük bütçe gece yarısından önce dolmuyorsa sayılmaz */
export function bitisTahmini(toplam: ButceKalemi | null, gunluk: ButceKalemi | null, hiz: number | null, simdiMs: number): string | null {
  if (!hiz || !(hiz > 0)) return null;
  let en = Number.POSITIVE_INFINITY;
  if (toplam && toplam.harcanan < toplam.sinir) en = Math.min(en, (toplam.sinir - toplam.harcanan) / hiz);
  if (gunluk && gunluk.harcanan < gunluk.sinir) {
    const ms = (gunluk.sinir - gunluk.harcanan) / hiz;
    if (ms < geceYarisinaMs(simdiMs)) en = Math.min(en, ms);
  }
  return Number.isFinite(en) && en <= TAHMIN_EN_COK_MS ? new Date(simdiMs + en).toISOString() : null;
}

/** Seviyedeki görev token tavanı: ayardaki tavan × katsayı (0 kapalı kalır; kural ortak sözleşmede) */
export function seviyeTavani(temel: number, seviye: KullanimSeviyesi): number {
  return seviyeGorevTavani(temel, seviye);
}

/** Seviyenin tempo sınırı kurulun üst sınırıyla birlikte: 0 sınır yok (kural ortak sözleşmede) */
export function seviyeTempoSiniri(seviye: KullanimSeviyesi, ustSinir: number): number {
  return tempoSiniri(seviye, ustSinir);
}

/** Seviyenin görünen adı (geçerli dilde) */
export function seviyeAdi(s: KullanimSeviyesi): string {
  return s === "zeki" ? iki("Zeki", "Smart") : s === "normal" ? "Normal" : iki("Tasarruflu", "Economy");
}

/** %83 (İngilizce 83%) */
function yuzdeMetni(n: number): string {
  const y = Math.floor(n);
  return iki(`%${y}`, `${y}%`);
}

// ---------------------------------------------------------------------------
// İzleyici
// ---------------------------------------------------------------------------

interface DurumKaydi {
  durum: ButceDurumuTuru;
  neden: "toplam" | "gunluk" | null;
  gun: string;
}

interface SeviyeKaydi {
  /** Kaydın yazıldığı andaki kurul seviyesi (kurul değiştirdiyse duyuruyu Şirket yapar) */
  secilen: KullanimSeviyesi;
  etkin: KullanimSeviyesi;
  kademe: ButceDurumu["kademe"];
}

/** Yeniden değerlendirmenin nedeni: acilabilir olanlar (ayar, gün) tahminle ya da önceden dolmuş bütçeyi açabilir */
type Neden = "acilis" | "kullanim" | "tahmin" | "ayar" | "gun" | "pencere";

export interface ButceBaglami {
  depo: Pick<Depo, "proje" | "projeler" | "projeTokeni" | "deger" | "degerYaz">;
  /** Abonelik kullanım durumu (haftalık pencereler) */
  hesap(): Pick<HesapDurumu, "durum" | "pencereler">;
  /** Bütçe doldu: projenin turu süren çalışanları kesilir, konuşmalar durur; kesilenlerin kimlikleri döner */
  ekibiDurdur(projeId: string): string[];
  /** Bütçe açıldı: bekletilen çalışan kaldığı yerden sürer (metin beklerken gelen mesajları da taşır) */
  surdur(ajanId: string, metin: string): void;
  /** Geçerli seviye değişti: Şirket modelleri, düşünme derinliğini ve tempoyu uygular */
  seviyeDegisti(projeId: string, onceki: KullanimSeviyesi, yeni: KullanimSeviyesi): void;
  /** #genel'e ArnOrg mesajı */
  duyur(projeId: string, metin: string): void;
  /** Kurula açılır pencere; Stüdyo "Bütçeyi artır" düğmesini gösterir */
  kurulaBildir(projeId: string, baslik: string, metin: string): void;
  /** CEO'nun bir sonraki turunda "ekipten haberler" */
  ceoyaHaber(projeId: string, metin: string): void;
  /** Proje özetini yeniden yayınlar (doluluk, tahmin, seviye) */
  yayinla(projeId: string): void;
  /** Şimdiki an (testlerde verilir) */
  simdi?(): number;
}

export class ProjeButceleri {
  private readonly durumlar = new Map<string, DurumKaydi>();
  private readonly seviyeler = new Map<string, SeviyeKaydi>();
  /** Proje → bütçe dolunca bekletilen çalışanlar ve beklerken onlara gelen mesajlar */
  private readonly bekleyenler = new Map<string, Map<string, string[]>>();
  /** Proje → son bir saatin tur kullanımları (bitiş tahmini için) */
  private readonly ornekler = new Map<string, { t: number; token: number }[]>();
  /** Ajan → süren turun tahmini kullanımı (dolma denetimi için) */
  private readonly turlar = new Map<string, { projeId: string; token: number }>();
  private readonly yayinlar = new Map<string, NodeJS.Timeout>();
  private readonly baslangic: number;
  private sonGun: string;
  private zamanlayici: NodeJS.Timeout | null = null;

  constructor(private readonly b: ButceBaglami) {
    this.baslangic = this.simdi();
    this.sonGun = bugun(new Date(this.baslangic));
  }

  private simdi(): number {
    return this.b.simdi?.() ?? Date.now();
  }

  /** Açılış: kayıtlar okunur ve her proje sessizce değerlendirilir; gün dönümü ve tahmin dakikada bir bakılır */
  baslat(aralikMs = DAKIKA_MS): void {
    for (const p of this.b.depo.projeler()) this.degerlendir(p.id, "acilis");
    if (this.zamanlayici) return;
    this.zamanlayici = setInterval(() => this.tik(), aralikMs);
    this.zamanlayici.unref();
  }

  durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
    for (const z of this.yayinlar.values()) clearTimeout(z);
    this.yayinlar.clear();
  }

  projeKaldir(projeId: string): void {
    this.durumlar.delete(projeId);
    this.seviyeler.delete(projeId);
    this.bekleyenler.delete(projeId);
    this.ornekler.delete(projeId);
    for (const [id, t] of this.turlar) if (t.projeId === projeId) this.turlar.delete(id);
    const z = this.yayinlar.get(projeId);
    if (z) clearTimeout(z);
    this.yayinlar.delete(projeId);
  }

  // ------------------------------------------------------------------ okuma

  /** Projenin bütçe durumu (proje özeti ve kullanım uçları) */
  durum(projeId: string): ButceDurumu {
    const p = this.b.depo.proje(projeId);
    const seviye = this.seviyeKaydi(projeId);
    if (!p) return { toplam: null, gunluk: null, durum: "normal", neden: null, tahminiBitis: null, seviye: seviye.secilen, etkinSeviye: seviye.etkin, kademe: seviye.kademe };
    const { toplam, gunluk } = this.kalemler(p);
    const hesap = butceDurumuBul(toplam, gunluk);
    const kayit = this.durumKaydi(projeId);
    const dolu = kayit.durum === "doldu";
    const simdi = this.simdi();
    return {
      toplam,
      gunluk,
      durum: dolu ? "doldu" : hesap.durum,
      neden: dolu ? kayit.neden : hesap.neden,
      tahminiBitis: dolu || hesap.durum === "doldu" ? null : bitisTahmini(toplam, gunluk, hizHesapla(this.ornekler.get(projeId) ?? [], simdi, this.baslangic), simdi),
      seviye: p.seviye,
      etkinSeviye: seviye.etkin,
      kademe: seviye.kademe,
    };
  }

  /** Bütçe dolu mu: çalışanlar durur, kurul dışı mesajlar bekletilir */
  doluMu(projeId: string): boolean {
    return this.durumKaydi(projeId).durum === "doldu";
  }

  /** Projenin geçerli seviyesi (kademe düşürmeden sonra) */
  etkinSeviye(projeId: string): KullanimSeviyesi {
    return this.seviyeKaydi(projeId).etkin;
  }

  /** Bütçe doluyken çalışana kurul dışından gelen mesaj: saklanır, bütçe açılınca iletilir; saklandıysa true */
  tut(projeId: string, ajanId: string, metin: string): boolean {
    if (!this.doluMu(projeId)) return false;
    const liste = this.bekleyenListesi(projeId);
    const mesajlar = liste.get(ajanId) ?? [];
    mesajlar.push(metin.length > 1500 ? `${metin.slice(0, 1499)}…` : metin);
    if (mesajlar.length > 20) mesajlar.splice(0, mesajlar.length - 20);
    liste.set(ajanId, mesajlar);
    return true;
  }

  /** Çalışan bütçe yüzünden bekletiliyor mu */
  bekletiliyorMu(projeId: string, ajanId: string): boolean {
    return this.bekleyenler.get(projeId)?.has(ajanId) ?? false;
  }

  // ------------------------------------------------------------------ girişler

  /** Tur bitti: kesin kullanım yazıldı (kullanim tablosu); tahmin düşer, eşikler denetlenir */
  kullanimEklendi(projeId: string, ajanId: string, token: number): void {
    this.turlar.delete(ajanId);
    if (token > 0) {
      const simdi = this.simdi();
      const liste = (this.ornekler.get(projeId) ?? []).filter((o) => o.t > simdi - SAAT_MS);
      liste.push({ t: simdi, token: Math.round(token) });
      this.ornekler.set(projeId, liste);
    }
    this.degerlendir(projeId, "kullanim");
    this.yayinPlanla(projeId);
  }

  /** Tur sürüyor: tahminle bütçe dolduysa tur sonunu beklemeden ekip durur */
  turSuruyor(projeId: string, ajanId: string, tahmin: number): void {
    if (!(tahmin > 0)) return;
    this.turlar.set(ajanId, { projeId, token: tahmin });
    if (this.doluMu(projeId)) return;
    const p = this.b.depo.proje(projeId);
    if (!p || (!p.butce.toplam && !p.butce.gunluk)) return;
    const { toplam, gunluk } = this.kalemler(p, this.surenTahmin(projeId));
    if (butceDurumuBul(toplam, gunluk).durum === "doldu") this.degerlendir(projeId, "tahmin");
  }

  /** Kurul bütçeyi, seviyeyi ya da otomatik kademeyi değiştirdi: dolu bütçe de yeniden ölçülür */
  ayarDegisti(projeId: string): void {
    this.degerlendir(projeId, "ayar");
    this.b.yayinla(projeId);
  }

  /** Abonelik pencereleri okundu: haftalık pencere koşulu değiştiyse projeler yeniden değerlendirilir */
  pencereGuncellendi(): void {
    const k = pencereKosulu(this.b.hesap());
    if (!k) return;
    const onceki = this.kayitliPencere();
    if (onceki.pencere === k.pencere && onceki.yuzde === k.yuzde) return;
    this.b.depo.degerYaz(PENCERE_ANAHTARI, JSON.stringify(k));
    if (onceki.pencere === k.pencere) return;
    for (const p of this.b.depo.projeler()) this.degerlendir(p.id, "pencere");
  }

  /** Dakikalık bakış: gün döndüyse günlük bütçeler yeniden ölçülür; bütçeli projelerin tahmini tazelenir */
  tik(): void {
    const gun = bugun(new Date(this.simdi()));
    const dondu = gun !== this.sonGun;
    this.sonGun = gun;
    for (const p of this.b.depo.projeler()) {
      if (dondu) this.degerlendir(p.id, "gun");
      if ((p.butce.toplam || p.butce.gunluk) && (dondu || this.ornekler.get(p.id)?.length)) {
        const simdi = this.simdi();
        const kalan = (this.ornekler.get(p.id) ?? []).filter((o) => o.t > simdi - SAAT_MS);
        if (kalan.length) this.ornekler.set(p.id, kalan);
        else this.ornekler.delete(p.id);
        this.b.yayinla(p.id);
      }
    }
  }

  // ------------------------------------------------------------------ değerlendirme

  private kalemler(p: Proje, ek = 0): { toplam: ButceKalemi | null; gunluk: ButceKalemi | null } {
    const gun = bugun(new Date(this.simdi()));
    return {
      toplam: p.butce.toplam ? butceKalemi(p.butce.toplam, this.b.depo.projeTokeni(p.id) + ek) : null,
      gunluk: p.butce.gunluk ? butceKalemi(p.butce.gunluk, this.b.depo.projeTokeni(p.id, gun) + ek) : null,
    };
  }

  /** Projede süren turların tahmini kullanımı */
  private surenTahmin(projeId: string): number {
    let t = 0;
    for (const x of this.turlar.values()) if (x.projeId === projeId) t += x.token;
    return t;
  }

  private degerlendir(projeId: string, neden: Neden): void {
    const p = this.b.depo.proje(projeId);
    if (!p) return;
    const sessiz = neden === "acilis";
    const onceki = this.durumKaydi(projeId);
    const { toplam, gunluk } = this.kalemler(p, neden === "tahmin" ? this.surenTahmin(projeId) : 0);
    const hesap = butceDurumuBul(toplam, gunluk);
    const gun = bugun(new Date(this.simdi()));
    // Dolu bütçe yalnız kurul bütçeyi değiştirince açılır; günlük bütçenin doluluğu gün dönünce de (dünden kalan doluluk
    // açılışta da) açılır. Toplam bütçenin doluluğu açılışta korunur, bekletilenler mesaiye dönüşte yine tutulur
    const acilabilir = neden === "ayar" || (onceki.neden === "gunluk" && (neden === "gun" || onceki.gun !== gun));
    const yeni: DurumKaydi = onceki.durum === "doldu" && hesap.durum !== "doldu" && !acilabilir ? onceki : { durum: hesap.durum, neden: hesap.neden, gun };
    const degisti = yeni.durum !== onceki.durum || yeni.neden !== onceki.neden;
    if (degisti || yeni.gun !== onceki.gun) {
      this.durumlar.set(projeId, yeni);
      this.b.depo.degerYaz(DURUM_ONEKI + projeId, JSON.stringify(yeni));
    }
    if (degisti && !sessiz) this.durumDegisti(p, onceki, yeni, toplam, gunluk, neden);
    this.seviyeDegerlendir(p, yeni.durum, sessiz);
  }

  private durumDegisti(p: Proje, onceki: DurumKaydi, yeni: DurumKaydi, toplam: ButceKalemi | null, gunluk: ButceKalemi | null, neden: Neden): void {
    const kalem = yeni.neden === "gunluk" ? gunluk : toplam;
    const oran = kalem ? `${kisaToken(kalem.harcanan)} / ${kisaToken(kalem.sinir)}` : "";
    const gunlukMu = yeni.neden === "gunluk";
    if (yeni.durum === "doldu") {
      const durdurulan = this.b.ekibiDurdur(p.id);
      const liste = this.bekleyenListesi(p.id);
      for (const id of durdurulan) if (!liste.has(id)) liste.set(id, []);
      const metin = gunlukMu
        ? iki(
            `Bugünkü token bütçesi doldu (${oran}). Ekip durdu; gece yarısı ya da kurul bütçeyi artırınca kaldığı yerden sürecek.`,
            `Today's token budget is used up (${oran}). The team has stopped; it will pick up where it left off at midnight or when the board raises the budget.`,
          )
        : iki(
            `Proje token bütçesi doldu (${oran}). Ekip durdu; kurul bütçeyi artırınca kaldığı yerden sürecek.`,
            `The project's token budget is used up (${oran}). The team has stopped; it will pick up where it left off when the board raises the budget.`,
          );
      this.b.duyur(p.id, metin);
      this.b.kurulaBildir(p.id, gunlukMu ? iki("Bugünkü bütçe doldu", "Today's budget is used up") : iki("Proje bütçesi doldu", "The project budget is used up"), metin);
      return;
    }
    if (onceki.durum === "doldu") {
      // Bütçe açıldı: bekletilenler kaldıkları yerden sürer
      const bekleyenler = this.bekleyenler.get(p.id);
      this.bekleyenler.delete(p.id);
      const gerekce =
        neden !== "ayar"
          ? iki("Günlük token bütçesi yenilendi", "The daily token budget has renewed")
          : iki("Kurul token bütçesini artırdı", "The board raised the token budget");
      this.b.duyur(p.id, iki(`${gerekce}; ekip kaldığı yerden sürüyor.`, `${gerekce}; the team is picking up where it left off.`));
      for (const [id, mesajlar] of bekleyenler ?? []) {
        const ek = mesajlar.length ? `\n\n${iki("Bu sürede gelen mesajlar", "Messages that came in meanwhile")}:\n${mesajlar.map((m) => `- ${m}`).join("\n")}` : "";
        this.b.surdur(id, iki(`${gerekce}. Kaldığın yerden devam et.${ek}`, `${gerekce}. Continue where you left off.${ek}`));
      }
      return;
    }
    if (yeni.durum === "uyari" && kalem) {
      const yuzde = yuzdeMetni(kalem.yuzde);
      const metin = gunlukMu
        ? iki(
            `Bugünkü token bütçesinin ${yuzde}'i harcandı (${oran}). Bütçe dolarsa ekip gece yarısına dek durur.`,
            `${yuzde} of today's token budget is used (${oran}). If it runs out, the team stops until midnight.`,
          )
        : iki(`Proje token bütçesinin ${yuzde}'i harcandı (${oran}). Bütçe dolarsa ekip durur.`, `${yuzde} of the project's token budget is used (${oran}). If it runs out, the team stops.`);
      this.b.duyur(p.id, metin);
      this.b.kurulaBildir(p.id, iki(`Bütçenin ${yuzde}'i harcandı`, `${yuzde} of the budget is used`), metin);
      this.b.ceoyaHaber(
        p.id,
        iki(
          `${metin} Kalan bütçeyle en önemli işleri bitir; gerekmeyen işleri ertele, çalışanlara kısa ve net görevler ver.`,
          `${metin} Use what is left on the most important work; put off what can wait and give employees short, clear tasks.`,
        ),
      );
    }
  }

  /** Geçerli seviyeyi yeniden bulur; değiştiyse Şirket uygular, kurul seviyeyi değiştirmediyse duyurulur */
  private seviyeDegerlendir(p: Proje, butce: ButceDurumuTuru, sessiz: boolean): void {
    const pencere = pencereKosulu(this.b.hesap()) ?? this.kayitliPencere();
    const { etkin, kademe } = etkinSeviyeBul(p.seviye, p.otomatikKademe, butce, pencere.pencere);
    const onceki = this.kayitliSeviye(p.id);
    const yeni: SeviyeKaydi = { secilen: p.seviye, etkin, kademe };
    if (onceki && onceki.secilen === yeni.secilen && onceki.etkin === yeni.etkin && JSON.stringify(onceki.kademe) === JSON.stringify(yeni.kademe)) return;
    this.seviyeler.set(p.id, yeni);
    this.b.depo.degerYaz(SEVIYE_ONEKI + p.id, JSON.stringify(yeni));
    if (!onceki || onceki.etkin === etkin) return;
    this.b.seviyeDegisti(p.id, onceki.etkin, etkin);
    // Kurulun kendi seçimini Şirket duyurur; burada yalnız kendiliğinden inip çıkan seviye
    if (sessiz || onceki.secilen !== p.seviye) return;
    const pencereMetni = `${kademe?.pencere ?? ""} ${yuzdeMetni(pencere.yuzde ?? KADEME_ESIGI_YUZDE)}`.trim();
    const metin = kademe
      ? iki(
          `Kullanım seviyesi kendiliğinden bir kademe indi: ${seviyeAdi(onceki.etkin)} → ${seviyeAdi(etkin)} (${kademe.neden === "butce" ? "bütçenin %80'i harcandı" : `abonelik penceresi: ${pencereMetni}`}). Koşul kalkınca geri çıkar.`,
          `The usage level stepped down by itself: ${seviyeAdi(onceki.etkin)} → ${seviyeAdi(etkin)} (${kademe.neden === "butce" ? "80% of the budget is used" : `subscription window: ${pencereMetni}`}). It steps back up once that clears.`,
        )
      : iki(`Kademe düşürmenin nedeni kalktı; kullanım seviyesi yeniden ${seviyeAdi(etkin)}.`, `The reason for stepping down has cleared; the usage level is ${seviyeAdi(etkin)} again.`);
    this.b.duyur(p.id, metin);
    this.b.ceoyaHaber(
      p.id,
      iki(
        `${metin} Seviyeye bağlı çalışanların modeli ve herkesin düşünme derinliği buna göre değişti.`,
        `${metin} The models of employees who follow the level and everyone's thinking depth changed accordingly.`,
      ),
    );
  }

  // ------------------------------------------------------------------ kayıtlar

  private durumKaydi(projeId: string): DurumKaydi {
    let k = this.durumlar.get(projeId);
    if (!k) {
      const v = jsonOku<Partial<DurumKaydi> | null>(this.b.depo.deger(DURUM_ONEKI + projeId), null);
      k =
        v && (v.durum === "normal" || v.durum === "uyari" || v.durum === "doldu")
          ? { durum: v.durum, neden: v.neden === "toplam" || v.neden === "gunluk" ? v.neden : null, gun: typeof v.gun === "string" ? v.gun : "" }
          : { durum: "normal", neden: null, gun: "" };
      this.durumlar.set(projeId, k);
    }
    return k;
  }

  private kayitliSeviye(projeId: string): SeviyeKaydi | null {
    const bellek = this.seviyeler.get(projeId);
    if (bellek) return bellek;
    const v = jsonOku<Partial<SeviyeKaydi> | null>(this.b.depo.deger(SEVIYE_ONEKI + projeId), null);
    if (!v || !seviyeMi(v.secilen) || !seviyeMi(v.etkin)) return null;
    const k: SeviyeKaydi = { secilen: v.secilen, etkin: v.etkin, kademe: v.kademe && (v.kademe.neden === "butce" || v.kademe.neden === "pencere") ? v.kademe : null };
    this.seviyeler.set(projeId, k);
    return k;
  }

  /** Seviye kaydı; hiç yoksa (yeni proje, ilk açılış) sessizce değerlendirilir */
  private seviyeKaydi(projeId: string): SeviyeKaydi {
    let k = this.kayitliSeviye(projeId);
    if (!k) {
      this.degerlendir(projeId, "acilis");
      k = this.kayitliSeviye(projeId);
    }
    if (k) return k;
    const p = this.b.depo.proje(projeId);
    const s = p?.seviye ?? "normal";
    return { secilen: s, etkin: s, kademe: null };
  }

  private kayitliPencere(): { pencere: string | null; yuzde: number | null } {
    const v = jsonOku<{ pencere?: unknown; yuzde?: unknown } | null>(this.b.depo.deger(PENCERE_ANAHTARI), null);
    return { pencere: typeof v?.pencere === "string" ? v.pencere : null, yuzde: typeof v?.yuzde === "number" ? v.yuzde : null };
  }

  private bekleyenListesi(projeId: string): Map<string, string[]> {
    let l = this.bekleyenler.get(projeId);
    if (!l) {
      l = new Map();
      this.bekleyenler.set(projeId, l);
    }
    return l;
  }

  private yayinPlanla(projeId: string): void {
    if (this.yayinlar.has(projeId)) return;
    const z = setTimeout(() => {
      this.yayinlar.delete(projeId);
      this.b.yayinla(projeId);
    }, YAYIN_ARALIGI_MS);
    z.unref();
    this.yayinlar.set(projeId, z);
  }
}
