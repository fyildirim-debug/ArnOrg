// ArnOrg ortak sözleşmesi
// Çekirdek (arnorg-server) ile Stüdyo (arayüz) arasında paylaşılan tipler ve sabitler.
// Bu dosya tek başına durur; başka dosyaya göreli import yapmaz.

export const ARNORG_SURUMU = "0.0.1";

// ---------------------------------------------------------------------------
// Genel
// ---------------------------------------------------------------------------

/** ISO 8601 zaman damgası */
export type Zaman = string;

/** Arayüz ve ajan dili: arayüz metinleri, ajan talimatları ve ArnOrg'un kanal mesajları bu dilde olur */
export type Dil = "tr" | "en";
export const DILLER: Dil[] = ["tr", "en"];
export const DIL_ADLARI: Record<Dil, string> = { tr: "Türkçe", en: "English" };

export type IzinModu = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto";

/** Claude model takma adı ya da tam model kimliği */
export type ModelAdi = "opus" | "sonnet" | "haiku" | (string & {});

export interface Saglik {
  surum: string;
  /** Ayarlardaki dil; Stüdyo açılışta buna uyar */
  dil: Dil;
  platform: string;
  claudeBulundu: boolean;
  claudeYolu: string | null;
  claudeSurumu: string | null;
  sdkSurumu: string;
  veriDizini: string;
}

export interface Ayarlar {
  /** Arayüz ve ajan dili; ilk açılışta sistem dilinden seçilir */
  dil: Dil;
  /** Kurulu Claude Code yolu; boşsa önce PATH, sonra SDK ile gelen ikili denenir */
  claudeYolu: string | null;
  /** Ajanların varsayılan izin modu */
  varsayilanIzinModu: IzinModu;
  /** Karar bekleyen araç çağrısı için süre (saniye); dolunca reddedilir */
  onaySuresiSn: number;
  /** Dış editör komutu (codium, code, cursor) */
  disEditor: string;
  /** Görev bu kadar dakika ilerlemezse sorumlu hatırlatılır, sonra yöneticiye ve kurula yükseltilir; 0 kapalı */
  tikanmaDakika: number;
  /** Ajanlar Claude aboneliğinin 5 saatlik penceresinin en çok bu yüzdesine kadar çalışır; 0 sınırsız */
  besSaatlikSinirYuzde: number;
  /** Haftalık pencere için üst sınır yüzdesi; 0 sınırsız */
  haftalikSinirYuzde: number;
  /** Kod zekâsının anlamsal arama modeli; kapali iken yalnız anahtar sözcükle aranır */
  kodZekasiModeli: KodZekasiModeli;
  /** Proje açılınca ana repo arka planda dizinlenir, değişen dosyalar kendiliğinden güncellenir */
  kodZekasiOtomatik: boolean;
  /** GitHub CLI (gh) yolu; boşsa PATH ve ArnOrg'un indirdiği kopya denenir */
  ghYolu: string | null;
  /** Yeni projelerin açıldığı kök dizin; boşsa ~/ArnOrg */
  projeKoku: string | null;
  /** İlk açılış hazırlığı (dil, Claude, GitHub, ilk proje) bitti ya da atlandı */
  kurulumTamam: boolean;
}

// ---------------------------------------------------------------------------
// Proje
// ---------------------------------------------------------------------------

export interface Proje {
  id: string;
  ad: string;
  /** Repo kök dizini (mutlak yol) */
  yol: string;
  aciklama: string;
  /** Kurulun seçtiği çalışma dalı: ajanlar buradan dallanır, onaylı birleştirmeler buraya girer */
  varsayilanDal: string;
  olusturma: Zaman;
  /** Uzak depo (origin) adresi; yoksa null */
  uzakAdres: string | null;
  /** Uzak depo GitHub'daysa "sahip/ad" */
  github: string | null;
  /** Onaylı birleştirmeden sonra çalışma dalını uzak depoya gönder */
  otomatikGonder: boolean;
  /** CEO ile hazırlık görüşmesi: amaç, ana yasa, ilk işe alımlar */
  hazirlik: HazirlikDurumu;
  /** Açıkken seçili türdeki onaylar kendiliğinden verilir (kayıt yine tutulur) */
  otomatikOnay: OtomatikOnay;
}

export interface OtomatikOnay {
  etkin: boolean;
  turler: OnayTuru[];
}

export type HazirlikDurumu = "bekliyor" | "suruyor" | "tamam" | "atlandi";

export interface ProjeOzeti extends Proje {
  ajanSayisi: number;
  aktifAjanSayisi: number;
  gorevSayilari: Record<GorevDurumu, number>;
  bekleyenOnay: number;
  /** Bugün işlenen token (tüm ajanlar) */
  bugunToken: number;
}

export interface ProjeOlusturIstegi {
  ad: string;
  /** Mutlak yol; verilmezse proje kökünde (~/ArnOrg/<ad>) açılır. olustur=true ise klasör yoksa açılır */
  yol?: string;
  /** true: yeni repo (git init + ilk commit); false: var olan repoyu bağla */
  olustur: boolean;
  aciklama?: string;
  /** Çalışma dalı; verilmezse reponun o anki dalı (yeni repoda main) */
  dal?: string;
  /** Yeni repo GitHub'da da açılsın (gh ile); sahip verilmezse giriş yapan hesap */
  github?: { ozel: boolean; sahip?: string } | null;
}

/** Proje ayarları (PATCH /api/projeler/:pid) */
export interface ProjeGuncelleIstegi {
  ad?: string;
  aciklama?: string;
  /** Çalışma dalını değiştirir: ana repo bu dala geçer (yoksa açılır) */
  varsayilanDal?: string;
  otomatikGonder?: boolean;
  hazirlik?: HazirlikDurumu;
  otomatikOnay?: OtomatikOnay;
}

/** GitHub'daki depoyu klonlayıp proje olarak açar (POST /api/github/klonla) */
export interface KlonlaIstegi {
  /** "sahip/ad" */
  depo: string;
  /** Çalışma dalı; verilmezse deponun varsayılan dalı */
  dal?: string;
  /** Hedef klasör; verilmezse proje kökünde (~/ArnOrg/<ad>) */
  yol?: string;
  /** Proje adı; verilmezse depo adı */
  ad?: string;
  aciklama?: string;
}

// ---------------------------------------------------------------------------
// Ekip
// ---------------------------------------------------------------------------

export interface Rol {
  kimlik: string;
  ad: string;
  aciklama: string;
  varsayilanModel: ModelAdi;
  /** Rolün sistem talimatına eklenen metin */
  talimat: string;
  /** CEO rolü plan yazar, işe alım teklif eder; kod yazmaz */
  yonetici: boolean;
  /** İngilizce ad, açıklama ve talimat (dil "en" iken kullanılır) */
  en?: { ad: string; aciklama: string; talimat: string };
}

/** Rolün seçilen dildeki adı, açıklaması ve talimatı */
export function rolMetni(rol: Rol, dil: Dil): { ad: string; aciklama: string; talimat: string } {
  return dil === "en" && rol.en ? rol.en : { ad: rol.ad, aciklama: rol.aciklama, talimat: rol.talimat };
}

export type AjanDurumu =
  | "kapali" // oturum yok
  | "bosta" // oturum açık, iş bekliyor
  | "calisiyor"
  | "karar_bekliyor" // bir araç çağrısı onay bekliyor
  | "duraklatildi"
  | "hata";

export const AJAN_DURUM_ADLARI: Record<AjanDurumu, string> = {
  kapali: "Kapalı",
  bosta: "Boşta",
  calisiyor: "Çalışıyor",
  karar_bekliyor: "Karar bekliyor",
  duraklatildi: "Duraklatıldı",
  hata: "Hata",
};

export interface Ajan {
  id: string;
  projeId: string;
  ad: string;
  /** Rol kimliği (ceo, cto, backend…) */
  rol: string;
  rolAdi: string;
  model: ModelAdi;
  yoneticiId: string | null;
  durum: AjanDurumu;
  /** Şu an ne yaptığının kısa açıklaması */
  isAciklamasi: string;
  gorevId: string | null;
  oturumId: string | null;
  /** Çalışma alanı (git worktree) mutlak yolu */
  calismaAlani: string | null;
  dal: string | null;
  izinModu: IzinModu;
  /** Bugün ve toplam işlenen token (girdi + çıktı + önbellek yazımı; önbellekten okuma hariç) */
  bugunToken: number;
  toplamToken: number;
  /** Kuruldan ya da CEO'dan gelen ek talimat */
  talimatEki: string;
  /** Ofis karakteri: hazır kütüphaneden "k07" ya da üretilmiş "u-<kimlik>"; boşsa ada göre seçilir */
  karakter: string | null;
  olusturma: Zaman;
}

export interface AjanIseAlIstegi {
  ad: string;
  rol: string;
  model?: ModelAdi;
  yoneticiId?: string | null;
  talimatEki?: string;
  karakter?: string | null;
}

export interface AjanGuncelleIstegi {
  model?: ModelAdi;
  izinModu?: IzinModu;
  yoneticiId?: string | null;
  talimatEki?: string;
  karakter?: string | null;
}

export interface AjanBaslatIstegi {
  /** İlk talimat; verilmezse atanmış görevden üretilir */
  talimat?: string;
  gorevId?: string;
}

export type MesajOnceligi = "next" | "now";

export interface AjanMesajIstegi {
  metin: string;
  /** next: araç turları arasında katılır; now: çalışan turu keser */
  oncelik?: MesajOnceligi;
}

/** Ajan oturumunun canlı akışındaki tek öğe */
export type AkisTuru =
  | "kullanici" // kuruldan ya da başka ajandan gelen mesaj
  | "asistan" // modelin metni
  | "dusunce" // düşünme özeti
  | "arac_cagrisi"
  | "arac_sonucu"
  | "sistem"
  | "sonuc"; // tur sonu

export interface AkisOgesi {
  id: string;
  ajanId: string;
  zaman: Zaman;
  tur: AkisTuru;
  metin?: string;
  arac?: string;
  aracKimligi?: string;
  girdi?: unknown;
  hata?: boolean;
  /** Alt ajandan geliyorsa onu başlatan araç çağrısı */
  ustAracKimligi?: string | null;
  /** Tur sonunda: bu turda işlenen token */
  token?: number;
}

// ---------------------------------------------------------------------------
// Görevler
// ---------------------------------------------------------------------------

export type GorevDurumu = "bekleyen" | "planlandi" | "calisiliyor" | "inceleme" | "tamam" | "iptal";

export const GOREV_DURUMLARI: GorevDurumu[] = ["bekleyen", "planlandi", "calisiliyor", "inceleme", "tamam", "iptal"];

export const GOREV_DURUM_ADLARI: Record<GorevDurumu, string> = {
  bekleyen: "Bekleyen",
  planlandi: "Planlandı",
  calisiliyor: "Çalışılıyor",
  inceleme: "İncelemede",
  tamam: "Tamam",
  iptal: "İptal",
};

/** İzin verilen durum geçişleri */
export const GOREV_GECISLERI: Record<GorevDurumu, GorevDurumu[]> = {
  bekleyen: ["planlandi", "calisiliyor", "iptal"],
  planlandi: ["bekleyen", "calisiliyor", "iptal"],
  calisiliyor: ["planlandi", "inceleme", "iptal"],
  inceleme: ["calisiliyor", "tamam", "iptal"],
  tamam: ["calisiliyor"],
  iptal: ["bekleyen"],
};

export interface Gorev {
  id: string;
  projeId: string;
  no: number;
  /** Görünen kod: T-12 */
  kod: string;
  baslik: string;
  aciklama: string;
  kabulOlcutu: string;
  durum: GorevDurumu;
  atananId: string | null;
  /** Bağımlı olunan görev kimlikleri */
  bagimliliklar: string[];
  etiket: string;
  olusturanId: string | null;
  olusturma: Zaman;
  guncelleme: Zaman;
}

export interface GorevOlusturIstegi {
  baslik: string;
  aciklama?: string;
  kabulOlcutu?: string;
  atananId?: string | null;
  bagimliliklar?: string[];
  etiket?: string;
  durum?: GorevDurumu;
}

export interface GorevGuncelleIstegi {
  baslik?: string;
  aciklama?: string;
  kabulOlcutu?: string;
  durum?: GorevDurumu;
  atananId?: string | null;
  bagimliliklar?: string[];
  etiket?: string;
}

// ---------------------------------------------------------------------------
// Kanallar
// ---------------------------------------------------------------------------

/** Kullanıcının (yönetim kurulu) gönderen kimliği */
export const KURUL = "kurul";
/** ArnOrg'un kendi mesajlarının gönderen kimliği */
export const ARNORG_GONDEREN = "arnorg";

/**
 * ArnOrg'un açtığı kanallar. Kimlikleri sabittir (dil değişse de proje verisi bozulmaz);
 * İngilizce arayüzde ve İngilizce konuşan ajanlarda görünen adlarıyla anılır.
 *  genel: şirketin ana kanalı · yonetim: kurul ile CEO'nun bire bir sohbeti · muhendislik: teknik konuşmalar · toplanti: toplantılar
 */
export const SISTEM_KANALLARI = ["genel", "yonetim", "muhendislik", "toplanti"] as const;
const KANAL_ADLARI_EN: Record<string, string> = { genel: "general", yonetim: "ceo", muhendislik: "engineering", toplanti: "meetings" };
const KANAL_ACIKLAMALARI: Record<Dil, Record<string, string>> = {
  tr: {
    genel: "Şirket geneli: brief, rapor, duyuru",
    yonetim: "Yönetim kurulu ile CEO'nun bire bir sohbeti",
    muhendislik: "Teknik konuşmalar ve kararlar",
    toplanti: "Toplantılar: gündem, görüşler, karar",
  },
  en: {
    genel: "Company-wide: brief, reports, announcements",
    yonetim: "One-on-one between the board and the CEO",
    muhendislik: "Technical discussions and decisions",
    toplanti: "Meetings: agenda, opinions, decision",
  },
};

/** Kanalın arayüzde görünen adı (# olmadan) */
export function kanalGorunenAdi(kanal: string, dil: Dil): string {
  return dil === "en" ? (KANAL_ADLARI_EN[kanal] ?? kanal) : kanal;
}

/** Sistem kanalının açıklaması seçilen dilde; diğer kanallarda kayıtlı açıklama */
export function kanalAciklamasi(kanal: string, kayitli: string, dil: Dil): string {
  return KANAL_ACIKLAMALARI[dil][kanal] ?? kayitli;
}

/** Görünen adı kanal kimliğine çevirir: "#general" → "genel"; bilinmeyen ad olduğu gibi kalır */
export function kanalKimligi(ad: string): string {
  const temiz = ad.trim().replace(/^#/, "").toLowerCase();
  return Object.entries(KANAL_ADLARI_EN).find(([, en]) => en === temiz)?.[0] ?? temiz;
}

export interface Kanal {
  ad: string;
  aciklama: string;
  mesajSayisi: number;
}

export interface Mesaj {
  id: string;
  projeId: string;
  kanal: string;
  /** Ajan kimliği ya da KURUL */
  gonderenId: string;
  gonderenAd: string;
  metin: string;
  /** Mesajda @ ile anılan ajan kimlikleri */
  anilanlar: string[];
  zaman: Zaman;
}

// ---------------------------------------------------------------------------
// Notlar
// ---------------------------------------------------------------------------

export interface NotDosyasi {
  /** .arnorg/notlar/ altındaki göreli yol */
  yol: string;
  baslik: string;
  guncelleme: Zaman;
}

export interface NotIcerigi {
  yol: string;
  icerik: string;
}

// ---------------------------------------------------------------------------
// Denetim ve onay
// ---------------------------------------------------------------------------

export type Karar = "izin" | "ret" | "sor" | "degisti";

export const KARAR_ADLARI: Record<Karar, string> = {
  izin: "İzin",
  ret: "Ret",
  sor: "Onaya sor",
  degisti: "Girdi değişti",
};

export type KuralHedefi = "komut" | "yol" | "url" | "arac";

export interface PolitikaKurali {
  id: string;
  ad: string;
  aciklama: string;
  /** Bu kural eşleşince verilecek karar */
  karar: "izin" | "ret" | "sor";
  hedef: KuralHedefi;
  /** Düzenli ifade desenleri (büyük/küçük harf duyarsız) */
  desenler: string[];
  /** Boşsa hedefe uyan tüm araçlar */
  araclar: string[];
  etkin: boolean;
}

export interface DenetimKaydi {
  id: string;
  projeId: string;
  ajanId: string;
  ajanAd: string;
  arac: string;
  girdiOzeti: string;
  karar: Karar;
  kural: string | null;
  neden: string | null;
  aracKimligi: string | null;
  zaman: Zaman;
}

export type OnayTuru = "arac" | "ise_alim" | "birlestirme" | "genel" | "anayasa" | "isten_cikarma" | "teslim";
export const ONAY_TURLERI: OnayTuru[] = ["arac", "ise_alim", "birlestirme", "genel", "anayasa", "isten_cikarma", "teslim"];
export type OnayDurumu = "bekliyor" | "onaylandi" | "reddedildi" | "zaman_asimi";

export const ONAY_TURU_ADLARI: Record<OnayTuru, string> = {
  arac: "Araç çağrısı",
  ise_alim: "İşe alım",
  birlestirme: "Birleştirme",
  genel: "Karar",
  anayasa: "Ana yasa",
  isten_cikarma: "İşten çıkarma",
  teslim: "Teslim",
};

export interface Onay {
  id: string;
  projeId: string;
  ajanId: string | null;
  tur: OnayTuru;
  baslik: string;
  ayrinti: string;
  /** Türe göre ek veri (ör. işe alımda AjanIseAlIstegi) */
  veri: unknown;
  durum: OnayDurumu;
  olusturma: Zaman;
  sonGecerlilik: Zaman | null;
  sonuclanma: Zaman | null;
  not: string | null;
}

export interface OnayKararIstegi {
  karar: "onayla" | "reddet";
  not?: string;
}

// ---------------------------------------------------------------------------
// Kod
// ---------------------------------------------------------------------------

export interface CalismaAlani {
  /** "ana" ya da ajan kimliği */
  kimlik: string;
  yol: string;
  dal: string;
  ajanId: string | null;
  ana: boolean;
}

export type DosyaDegisikligi = "M" | "A" | "D" | "?";

export interface DosyaDugumu {
  ad: string;
  /** Çalışma alanı köküne göre yol, / ayraçlı */
  yol: string;
  tur: "dosya" | "klasor";
  cocuklar?: DosyaDugumu[];
  degisiklik?: DosyaDegisikligi;
}

export interface DosyaIcerigi {
  yol: string;
  icerik: string;
  /** Monaco dil kimliği */
  dil: string;
  /** Bir ajan bu dosyayı düzenliyorsa kullanıcıya salt okunur */
  saltOkunur: boolean;
  duzenleyenAjanId: string | null;
}

export interface DosyaYazIstegi {
  alan: string;
  yol: string;
  icerik: string;
}

export interface AramaSonucu {
  yol: string;
  satir: number;
  metin: string;
}

export interface FarkSonucu {
  /** Birleşik fark (unified diff) */
  fark: string;
  dosyalar: { yol: string; degisiklik: DosyaDegisikligi; eklenen: number; silinen: number }[];
}

// ---------------------------------------------------------------------------
// Kullanım: ajanlar yalnız Claude aboneliğiyle (makinedeki Claude Code girişi) çalışır; token ve plan pencereleri sayılır
// ---------------------------------------------------------------------------

export interface KullanimOzeti {
  bugunToken: number;
  toplamToken: number;
  ajanlar: { ajanId: string; ad: string; bugunToken: number; toplamToken: number }[];
  /** Son bilinen abonelik penceresi olayı (Claude Code rate_limit_event) */
  pencere: { tur: string; durum: string; sifirlanma: Zaman | null } | null;
}

export type KullanimPenceresiTuru = "bes_saat" | "haftalik" | "haftalik_opus" | "haftalik_sonnet" | "model";

export interface KullanimPenceresi {
  tur: KullanimPenceresiTuru;
  /** Görünen ad: "5 saatlik pencere", "Haftalık", "Haftalık · Opus" */
  ad: string;
  /** Kullanılan yüzde (0–100); bilinmiyorsa null */
  yuzde: number | null;
  sifirlanma: Zaman | null;
}

/** Claude Code'un fiilen kullandığı giriş ve abonelik kullanım durumu (GET /api/hesap) */
export interface HesapDurumu {
  durum: "bilinmiyor" | "hazir" | "hata";
  /** Claude Code'un bildirdiği plan: Max, Pro, Team, Enterprise ya da API */
  plan: string | null;
  eposta: string | null;
  /** Kimlik bilgisinin kaynağı (ör. claude.ai, ANTHROPIC_API_KEY) */
  kaynak: string | null;
  /** firstParty, bedrock, vertex… */
  saglayici: string | null;
  /** Plan kullanım pencereleri bu girişte var mı (API anahtarında yok) */
  pencereVar: boolean;
  pencereler: KullanimPenceresi[];
  /** Ayardaki üst sınırlar (yüzde; 0 sınırsız) */
  sinirYuzdeleri: { besSaatlik: number; haftalik: number };
  /** Ayardaki üst sınır aşıldıysa: ajanlar yeni iş almaz, sıfırlanınca kaldıkları yerden sürer */
  sinir: { pencere: string; yuzde: number; sinirYuzde: number; sifirlanma: Zaman | null } | null;
  /** Claude Code abonelik dışı bir girişle (API anahtarı, bulut sağlayıcı) çalışıyorsa açıklama */
  uyari: string | null;
  guncelleme: Zaman | null;
  hata: string | null;
}

// ---------------------------------------------------------------------------
// Proje hafızası ve ajanlar arası sorular
// ---------------------------------------------------------------------------

/**
 * olgu: projeye dair doğru bilgi (sürüm, yapı, bağımlılık)
 * karar: alınmış karar ve gerekçesi
 * tercih: yönetim kurulunun isteği, üslup, yasak
 * ogrenilen: yaşanmış hata ve çözümü, püf noktası
 * uzmanlik: kim neyi biliyor, hangi alanın sahibi
 * ozet: tamamlanan iş, devir notu
 */
export type HafizaTuru = "olgu" | "karar" | "tercih" | "ogrenilen" | "uzmanlik" | "ozet";

export const HAFIZA_TURU_ADLARI: Record<HafizaTuru, string> = {
  olgu: "Olgu",
  karar: "Karar",
  tercih: "Kurul tercihi",
  ogrenilen: "Öğrenilen",
  uzmanlik: "Uzmanlık",
  ozet: "Özet",
};

/** Projenin kalıcı hafızasındaki bir kayıt; repo içinde .arnorg/hafiza altında sürümlü tutulur */
export interface HafizaKaydi {
  id: string;
  projeId: string;
  tur: HafizaTuru;
  baslik: string;
  metin: string;
  etiketler: string[];
  /** Kaydı yazan ajan; kurul ya da sistem için null */
  kaynakAjanId: string | null;
  kaynakAd: string;
  gorevId: string | null;
  /** 1 (ayrıntı) – 5 (her oturumda hatırlanmalı) */
  onem: number;
  /** Yerine geçen kaydın kimliği; eskimiş kayıt hatırlatılmaz */
  yerineGecen: string | null;
  olusturma: Zaman;
  guncelleme: Zaman;
}

export interface HafizaYazIstegi {
  tur: HafizaTuru;
  baslik: string;
  metin: string;
  etiketler?: string[];
  onem?: number;
  gorevId?: string | null;
  /** Bu kayıt eskisinin yerine geçiyorsa eskinin kimliği */
  yerineGectigi?: string | null;
}

/** Birbirini tekrar eden iki kayıt; kurul birini tutar ya da ayrı kalmalarına karar verir */
export interface HafizaBenzerCifti {
  a: HafizaKaydi;
  b: HafizaKaydi;
  /** 0–1 */
  benzerlik: number;
}

export type SoruDurumu = "bekliyor" | "yanitlandi" | "zaman_asimi";

/** Bir ajanın başka bir ajana sorduğu, yanıtını beklediği soru */
export interface AjanSorusu {
  id: string;
  projeId: string;
  soranId: string;
  soranAd: string;
  soruluId: string;
  soruluAd: string;
  soru: string;
  yanit: string | null;
  durum: SoruDurumu;
  olusturma: Zaman;
  yanitlanma: Zaman | null;
}

// ---------------------------------------------------------------------------
// Ana yasa: projenin kesin kuralları (.arnorg/anayasa.json + anayasa.md). CEO kurulla hazırlar,
// kurul onaylar; her ajanın talimatının başına girer, makine kuralı olan maddeler denetim kapısında uygulanır.
// ---------------------------------------------------------------------------

export interface AnayasaKurali {
  hedef: "komut" | "yol" | "url" | "arac";
  /** Düzenli ifadeler (büyük/küçük harf duyarsız) */
  desenler: string[];
  karar: "ret" | "sor";
}

export interface AnayasaMaddesi {
  no: number;
  baslik: string;
  metin: string;
  /** Denetim kapısında uygulanan makine kuralı; yoksa yalnız talimattır */
  kural: AnayasaKurali | null;
}

export interface Anayasa {
  /** Her onaylı değişiklikte artar; ajanlara yeni sürüm hatırlatılır */
  surum: number;
  guncelleme: Zaman | null;
  /** Son değişikliği onaylayan (Yönetim kurulu ya da otomatik onay) */
  onaylayan: string | null;
  maddeler: AnayasaMaddesi[];
}

// ---------------------------------------------------------------------------
// Ajan zekâsı: her çalışanın kendi kalıcı hafızası, sözleri, ekipçe öğrenilen beceriler
// ---------------------------------------------------------------------------

export type SozDurumu = "acik" | "tutuldu" | "iptal";

/** Bir çalışanın verdiği söz: tutulana kadar her turda kendisine, alana da hatırlatılır */
export interface Soz {
  id: string;
  projeId: string;
  verenId: string;
  verenAd: string;
  /** Söz verilen çalışan; kurula verildiyse null */
  aliciId: string | null;
  aliciAd: string;
  metin: string;
  sonTarih: Zaman | null;
  durum: SozDurumu;
  not: string | null;
  olusturma: Zaman;
  kapanis: Zaman | null;
}

/** Ekipçe öğrenilen yöntem (.arnorg/beceriler/<ad>.md) */
export interface Beceri {
  ad: string;
  aciklama: string;
  yazan: string;
  guncelleme: Zaman;
  kullanim: number;
}

export interface BeceriIcerigi extends Beceri {
  icerik: string;
}

/** GET /api/ajanlar/:aid/zeka */
export interface AjanZekasi {
  /** Kişisel hafıza maddeleri (oturum başında donmuş anlık görüntü olarak verilir) */
  kisisel: string[];
  /** Kişisel hafızanın karakter sınırı ve kullanılan */
  kisiselSinir: number;
  kisiselKullanim: number;
  defter: string;
  sozler: Soz[];
  /** Sözler: başkalarının bu çalışana verdiği açık sözler */
  alinanSozler: Soz[];
  beceriler: Beceri[];
  /** Ekip bağları (yönetici, bağlı görevler, sorular, sözler) metin olarak */
  baglar: string;
}

// ---------------------------------------------------------------------------
// Global zekâ: projelerden bağımsız, kendi kendine öğrenen standart kurallar (veri dizininde).
// Kurulun tercihleri, tekrar eden dersler ve düzeltmeler kurala dönüşür; her ajana rolü ve yetkisi kapsamında verilir.
// ---------------------------------------------------------------------------

export type KuralDurumu = "aday" | "etkin" | "emekli";
export type KuralKaynagi = "tercih" | "ogrenilen" | "duzeltme" | "ajan" | "kurul";

export interface KuralKaniti {
  projeId: string | null;
  projeAd: string | null;
  metin: string;
  zaman: Zaman;
}

export interface KureselKural {
  id: string;
  metin: string;
  /** Kimlere: boşsa herkes; "yonetici", "gelistirici" ya da rol kimlikleri (backend, frontend…) */
  kapsam: string[];
  kaynak: KuralKaynagi;
  kanitlar: KuralKaniti[];
  /** 0–1: kanıt ve geri bildirimle artar, ihlal ve ret ile azalır */
  guven: number;
  /** Ajan talimatına girdiği oturum sayısı */
  kullanim: number;
  yarar: number;
  ihlal: number;
  durum: KuralDurumu;
  olusturma: Zaman;
  guncelleme: Zaman;
}

export type ZekaGunlukTuru = "ogrendi" | "guclendi" | "birlestirdi" | "emekli" | "etkinlesti" | "duzenlendi" | "geri_bildirim";

export interface ZekaGunlukKaydi {
  id: string;
  zaman: Zaman;
  tur: ZekaGunlukTuru;
  metin: string;
  kuralId: string | null;
}

/** GET /api/zeka */
export interface ZekaDurumu {
  kurallar: KureselKural[];
  gunluk: ZekaGunlukKaydi[];
  sayilar: Record<KuralDurumu, number>;
}

// ---------------------------------------------------------------------------
// Kurula bildirim: önemli anlarda (onay, öneri, istek, yetki, teslim) her ekranda açılır pencere
// ---------------------------------------------------------------------------

export type KurulBildirimTuru = "onay" | "oneri" | "istek" | "yetki" | "teslim" | "bilgi" | "uyari";

export interface KurulBildirimi {
  id: string;
  projeId: string;
  ajanId: string | null;
  ajanAd: string;
  tur: KurulBildirimTuru;
  baslik: string;
  metin: string;
  zaman: Zaman;
  /** Bildirime bağlı onay (onaylanacaksa) */
  onayId: string | null;
}

// ---------------------------------------------------------------------------
// Kurulum: Claude Code, git ve GitHub (gh). Uçlar: /api/kurulum/* ve /api/github/*
// ---------------------------------------------------------------------------

/** Claude Code'un bu makinedeki durumu */
export interface ClaudeKurulumu {
  /** Kullanılan ikili: ayardaki yol, sistemdeki claude komutu ya da ArnOrg'la gelen kopya */
  kaynak: "ayar" | "sistem" | "paket" | null;
  yol: string | null;
  surum: string | null;
  /** Terminalde claude komutu var mı (yoksa ajanlar ArnOrg'la gelen kopyayla çalışır) */
  sistemde: boolean;
  girisYapildi: boolean;
  /** claude.ai aboneliğiyle giriş (API anahtarı ya da Console değil) */
  abonelik: boolean;
  /** claude auth status: authMethod */
  girisYontemi: string | null;
  saglayici: string | null;
  eposta: string | null;
  hata: string | null;
}

export interface GitKurulumu {
  kurulu: boolean;
  yol: string | null;
  surum: string | null;
  /** git config --global user.name ve user.email: ajan commit'leri bu kimlikle atılır */
  kullaniciAdi: string | null;
  eposta: string | null;
}

export interface GithubKurulumu {
  /** GitHub CLI (gh) */
  kurulu: boolean;
  /** sistem: PATH'teki gh · arnorg: ArnOrg'un veri dizinine indirdiği kopya · ayar: ayardaki yol */
  kaynak: "sistem" | "arnorg" | "ayar" | null;
  yol: string | null;
  surum: string | null;
  girisYapildi: boolean;
  /** GitHub kullanıcı adı (login) */
  kullanici: string | null;
  ad: string | null;
  /** git, GitHub kimliğini gh'den alıyor (gh auth setup-git) */
  gitYardimcisi: boolean;
  hata: string | null;
}

/** GET /api/kurulum */
export interface KurulumDurumu {
  claude: ClaudeKurulumu;
  git: GitKurulumu;
  github: GithubKurulumu;
  /** "win32-x64", "linux-arm64"… */
  platform: string;
  /** Yeni projelerin varsayılan kök dizini */
  projeKoku: string;
  /** Masaüstünde winget, Linux'ta paket yöneticisi gibi git kurulum yolu var mı */
  gitKurulabilir: boolean;
}

export type KurulumIslemTuru = "claude_giris" | "claude_kur" | "gh_kur" | "gh_giris" | "git_kur" | "klonla" | "github_olustur";
export type KurulumIslemDurumu = "calisiyor" | "tamam" | "hata" | "iptal";

/** Uzun süren kurulum işlemi; canlı çıktısı "kurulum.islem" olayıyla gelir */
export interface KurulumIslemi {
  id: string;
  tur: KurulumIslemTuru;
  durum: KurulumIslemDurumu;
  /** Son çıktı (renk kodları ayıklanmış, en çok ~8 KB) */
  cikti: string;
  /** Tarayıcıda açılacak adres (giriş sayfası) */
  adres: string | null;
  /** Kullanıcıya gösterilecek tek kullanımlık kod (GitHub cihaz kodu) */
  kod: string | null;
  /** Süreç kullanıcıdan girdi bekliyor (Claude girişinde tarayıcıdaki kodu yapıştırma) */
  girdiBekliyor: boolean;
  hata: string | null;
  baslangic: Zaman;
  bitis: Zaman | null;
  /** İş bitince dönen veri (ör. klonlanan projenin kimliği) */
  sonuc: Record<string, unknown> | null;
}

export interface GithubDeposu {
  ad: string;
  /** "sahip/ad" */
  tamAd: string;
  sahip: string;
  aciklama: string;
  ozel: boolean;
  /** Boş depoda null */
  varsayilanDal: string | null;
  guncelleme: Zaman;
  adres: string;
}

export interface GithubDali {
  ad: string;
  korumali: boolean;
}

/** Uzak depoyla eşitleme sonucu (POST /api/projeler/:pid/esitle) */
export interface EsitlemeSonucu {
  durum: "guncel" | "cekildi" | "gonderildi" | "ayrisik" | "kirli" | "uzak_yok" | "dal_farkli" | "hata";
  mesaj: string;
  /** Yerelde olup uzakta olmayan commit sayısı */
  onde: number;
  /** Uzakta olup yerelde olmayan commit sayısı */
  geride: number;
}

/** Projenin dalları: yerel ve uzak izleme dalları */
export interface ProjeDallari {
  mevcut: string;
  calisma: string;
  yerel: string[];
  uzak: string[];
}

/** GitHub hesabı ve üyesi olduğu kuruluşlar (depo açarken sahip seçimi) */
export interface GithubHesabi {
  kullanici: string;
  ad: string | null;
  eposta: string | null;
  kuruluslar: string[];
}

/** Dizin gezgini (GET /api/dizinler): masaüstünde sistemin klasör seçicisi, tarayıcıda bu uç kullanılır */
export interface DizinListesi {
  yol: string;
  ust: string | null;
  /** Ev dizini, masaüstü, belgeler, proje kökü, sürücüler */
  kisayollar: { ad: string; yol: string }[];
  dizinler: { ad: string; yol: string; repo: boolean }[];
  /** Bu dizin bir git deposu mu */
  repo: boolean;
}

// ---------------------------------------------------------------------------
// Canlı olaylar (WebSocket /ws)
// ---------------------------------------------------------------------------

export type SunucuOlayi =
  | { tur: "merhaba"; surum: string }
  | { tur: "proje.guncellendi"; proje: ProjeOzeti }
  | { tur: "ajan.guncellendi"; ajan: Ajan }
  | { tur: "ajan.silindi"; projeId: string; ajanId: string }
  | { tur: "ajan.akis"; projeId: string; oge: AkisOgesi }
  | { tur: "denetim.kaydi"; kayit: DenetimKaydi }
  | { tur: "onay.yeni"; onay: Onay }
  | { tur: "onay.sonuc"; onay: Onay }
  | { tur: "gorev.guncellendi"; gorev: Gorev }
  | { tur: "mesaj.yeni"; mesaj: Mesaj }
  | { tur: "kullanim"; projeId: string; ajanId: string; bugunToken: number; toplamToken: number }
  | { tur: "hesap.guncellendi"; hesap: HesapDurumu }
  | { tur: "hafiza.yeni"; kayit: HafizaKaydi }
  | { tur: "hafiza.silindi"; projeId: string; id: string }
  | { tur: "soru.guncellendi"; soru: AjanSorusu }
  | { tur: "dosya.degisti"; projeId: string; alan: string; yol: string; ajanId: string | null }
  | { tur: "kod.dizin"; projeId: string; durum: KodDizinDurumu }
  | { tur: "anayasa.guncellendi"; projeId: string; anayasa: Anayasa }
  | { tur: "soz.guncellendi"; soz: Soz }
  | { tur: "zeka.guncellendi"; kural: KureselKural | null; gunluk: ZekaGunlukKaydi }
  | { tur: "kurul.bildirimi"; projeId: string; bildirim: KurulBildirimi }
  | { tur: "kurulum.islem"; islem: KurulumIslemi }
  | { tur: "kurulum.durum"; durum: KurulumDurumu }
  /** Ajan bir kanaldaki mesaja yanıt hazırlıyor (yazıyor göstergesi); yaziyor=false ile biter */
  | { tur: "kanal.yaziyor"; projeId: string; kanal: string; ajanId: string; ad: string; yaziyor: boolean }
  | { tur: "bildirim"; seviye: "bilgi" | "uyari" | "hata"; metin: string; projeId?: string };

export type IstemciOlayi = { tur: "abone"; projeId: string | null } | { tur: "ping" };

/** Terminal WebSocket'i (/ws/terminal/:id) istemci mesajları */
export type TerminalIstemciMesaji = { tur: "girdi"; veri: string } | { tur: "boyut"; sutun: number; satir: number };

export interface TerminalAcIstegi {
  alan: string;
  sutun?: number;
  satir?: number;
}

/** Dönem durum raporu (GET/POST /api/projeler/:pid/rapor) */
export interface Rapor {
  baslik: string;
  /** Notlara kaydedilecek göreli yol (raporlar/AAAA-AA-GG.md) */
  yol: string;
  /** Dönemin başladığı an */
  baslangic: Zaman;
  markdown: string;
}

/** Masaüstü uygulamasının Stüdyo'ya açtığı köprü (window.arnorg); tarayıcıda yoktur */
export interface MasaustuKoprusu {
  platform: "win32" | "linux" | "darwin" | string;
  surum: string;
  /** http/https adresini sistem tarayıcısında açar */
  disaridaAc(url: string): Promise<boolean>;
  /** Sistemin klasör seçicisi; vazgeçilirse null. Eski masaüstü sürümlerinde yoktur */
  klasorSec?(secenek?: { baslik?: string; varsayilan?: string }): Promise<string | null>;
}

/** API hata gövdesi */
export interface ApiHatasi {
  hata: string;
}

// ---- Kod düzenleyici (VS Code tezgâhı) ----
// Uçlar: /api/projeler/:pid/fs/* ve /api/projeler/:pid/git/* (docs/API.md, "Kod düzenleyici")

/** Dosya sistemi girdisinin türü; "baglanti" hedefi çözülemeyen ya da alan dışını gösteren sembolik bağlantıdır */
export type FsTuru = "dosya" | "klasor" | "baglanti";

/** GET fs/stat yanıtı */
export interface FsDurumu {
  tur: FsTuru;
  /** Girdi sembolik bağlantı mı (tur hedefin türüdür) */
  baglanti: boolean;
  boyut: number;
  /** Son değişme anı (ms, Unix) */
  degisme: number;
  /** Oluşturma anı (ms, Unix) */
  olusturma: number;
  /** Bir ajan dosyayı düzenliyorsa ya da .git içindeyse kullanıcıya salt okunur */
  saltOkunur: boolean;
  duzenleyenAjanId: string | null;
}

/** GET fs/liste öğesi */
export interface FsGirdisi {
  ad: string;
  tur: FsTuru;
  baglanti: boolean;
}

export interface FsKlasorIstegi {
  alan: string;
  yol: string;
}

export interface FsTasiIstegi {
  alan: string;
  kaynak: string;
  hedef: string;
  ustune?: boolean;
}

/** POST fs/ara gövdesi: çalışma alanında metin araması */
export interface MetinAramaIstegi {
  alan: string;
  desen: string;
  regex?: boolean;
  harfDuyarli?: boolean;
  tamSozcuk?: boolean;
  /** Dahil edilecek dosyalar (glob, köke göre; boşsa hepsi) */
  dahil?: string[];
  /** Hariç tutulacak dosya ve klasörler (glob) */
  haric?: string[];
  /** En çok eşleşme sayısı (varsayılan 2000, üst sınır 20000) */
  sinir?: number;
  /** Bu boyuttan büyük dosyalar atlanır (bayt, varsayılan 4 MB) */
  enBuyukBoyut?: number;
}

export interface MetinAramaEslesmesi {
  /** 0 tabanlı başlangıç satırı ve sütunu (UTF-16) */
  satir: number;
  sutun: number;
  /** 0 tabanlı bitiş satırı ve sütunu (dışlayıcı) */
  sonSatir: number;
  sonSutun: number;
  /** Eşleşmenin geçtiği satır(lar); uzun satır eşleşme çevresinden kırpılır */
  onizleme: string;
  /** Önizlemenin ilk satırda başladığı sütun */
  onizlemeBaslangic: number;
}

export interface MetinAramaSonucu {
  dosyalar: { yol: string; eslesmeler: MetinAramaEslesmesi[] }[];
  /** Sınır doldu; sonuçlar eksik */
  sinirAsildi: boolean;
}

/** Git değişiklik türü: M değişti, A eklendi, D silindi, R yeniden adlandırıldı, C kopyalandı, U çakışma, ? izlenmiyor */
export type GitDegisiklikTuru = "M" | "A" | "D" | "R" | "C" | "U" | "?";

export interface GitDegisikligi {
  yol: string;
  /** Yeniden adlandırmada eski yol */
  eskiYol?: string;
  tur: GitDegisiklikTuru;
}

/** GET git/durum yanıtı */
export interface GitDurumu {
  alan: string;
  ana: boolean;
  /** Alan bir git deposu mu */
  repo: boolean;
  dal: string;
  /** Ajan alanlarının karşılaştırıldığı dal (projenin varsayılan dalı) */
  temelDal: string;
  /** Aşamaya alınmış değişiklikler */
  hazirlanan: GitDegisikligi[];
  /** Çalışma ağacı değişiklikleri (izlenmeyenler dahil) */
  degisen: GitDegisikligi[];
  /** Birleştirme çakışmaları */
  cakisan: GitDegisikligi[];
  /** Ajan alanında temel dala (ortak ata) göre tüm değişiklikler; ana repoda boş */
  temeleGore: GitDegisikligi[];
}

/** git/icerik için başvuru: HEAD, indeks (aşamadaki sürüm) ya da temel (ajan alanında temel dal ile ortak ata) */
export type GitBasvurusu = "HEAD" | "indeks" | "temel";

export interface GitYollarIstegi {
  alan: string;
  yollar: string[];
}

export interface GitCommitIstegi {
  alan: string;
  mesaj: string;
  /** Aşamada değişiklik yoksa önce tüm değişiklikleri aşamaya al */
  tumu?: boolean;
}

export interface GitCommitSonucu {
  commit: string;
}

// ---------------------------------------------------------------------------
// Kod zekâsı: kod tarayıcı, sembol ve bağımlılık haritası, anlamsal kod dizini
// Uçlar: /api/projeler/:pid/kod-zekasi/* (docs/API.md, "Kod zekâsı")
// ---------------------------------------------------------------------------

/** kaliteli: EmbeddingGemma 300M (çok dilli, kod); hizli: multilingual-e5-small; kapali: yalnız anahtar sözcük */
export type KodZekasiModeli = "kaliteli" | "hizli" | "kapali";

/** bos: hiç dizinlenmedi; taraniyor: dosyalar okunup sembol ve parçalara ayrılıyor; model-indiriliyor: gömme modeli ilk kez iniyor;
 * gomuluyor: parçaların vektörleri hesaplanıyor (anahtar sözcük araması bu sırada çalışır); hazir; hata */
export type KodDizinAsamasi = "bos" | "taraniyor" | "model-indiriliyor" | "gomuluyor" | "hazir" | "hata";

/** Bir çalışma alanının ("ana" ya da ajan kimliği) dizin durumu */
export interface KodDizinDurumu {
  alan: string;
  durum: KodDizinAsamasi;
  /** Dizindeki dosya, sembol ve parça sayıları */
  dosya: number;
  sembol: number;
  parca: number;
  /** Vektörü hesaplanmış parça sayısı (etkin model için) */
  gomulen: number;
  toplamParca: number;
  /** Etkin gömme modelinin kimliği; anahtar sözcük kipinde null */
  model: string | null;
  /** Model indirilirken 0–100 */
  indirmeYuzde: number | null;
  /** Taranırken: işlenen ve toplam dosya */
  taranan?: number;
  toplamDosya?: number;
  sonGuncelleme: Zaman | null;
  hata: string | null;
}

export type KodSembolTuru =
  | "fonksiyon"
  | "metod"
  | "sinif"
  | "arayuz"
  | "tur"
  | "enum"
  | "sabit"
  | "degisken"
  | "yapi"
  | "modul"
  | "baslik"
  | "secici"
  | "tablo";

/** Durum ve tür adlarının İngilizcesi; Türkçeleri yukarıdaki *_ADLARI sabitleridir */
export const AD_HARITALARI_EN = {
  ajanDurumu: { kapali: "Off", bosta: "Idle", calisiyor: "Working", karar_bekliyor: "Awaiting decision", duraklatildi: "Paused", hata: "Error" } as Record<AjanDurumu, string>,
  gorevDurumu: { bekleyen: "Backlog", planlandi: "Planned", calisiliyor: "In progress", inceleme: "In review", tamam: "Done", iptal: "Cancelled" } as Record<GorevDurumu, string>,
  karar: { izin: "Allowed", ret: "Denied", sor: "Ask for approval", degisti: "Input changed" } as Record<Karar, string>,
  onayTuru: { arac: "Tool call", ise_alim: "Hiring", birlestirme: "Merge", genel: "Decision", anayasa: "Constitution", isten_cikarma: "Dismissal", teslim: "Delivery" } as Record<OnayTuru, string>,
  hafizaTuru: { olgu: "Fact", karar: "Decision", tercih: "Board preference", ogrenilen: "Lesson", uzmanlik: "Expertise", ozet: "Summary" } as Record<HafizaTuru, string>,
};

export const KOD_SEMBOL_TURU_ADLARI: Record<KodSembolTuru, string> = {
  fonksiyon: "fonksiyon",
  metod: "metod",
  sinif: "sınıf",
  arayuz: "arayüz",
  tur: "tür",
  enum: "enum",
  sabit: "sabit",
  degisken: "değişken",
  yapi: "yapı",
  modul: "modül",
  baslik: "başlık",
  secici: "seçici",
  tablo: "tablo",
};

export interface KodSembolu {
  ad: string;
  tur: KodSembolTuru;
  /** Çalışma alanı köküne göre yol, / ayraçlı */
  yol: string;
  /** 1 tabanlı, kapsayıcı satır aralığı */
  bas: number;
  bit: number;
  disaAcik: boolean;
  /** Metodun sınıfı, iç içe sembolün kapsayıcısı */
  ust: string | null;
  /** Tanımın ilk satırı (kısaltılmış) */
  imza: string;
}

/** Arama sonucunu hangi yol buldu */
export type KodEslesmeTuru = "anlamsal" | "sozcuk" | "sembol" | "karma";

export interface KodAramaSonucu {
  yol: string;
  dil: string;
  /** Parçanın 1 tabanlı satır aralığı */
  bas: number;
  bit: number;
  sembol: string | null;
  sembolTuru: KodSembolTuru | null;
  /** 0–1; birden çok yöntemin üst sıralarında olan sonuç yüksek puan alır */
  puan: number;
  eslesme: KodEslesmeTuru;
  /** En çok ~20 satırlık kesit ve ilk satırının numarası */
  kesit: string;
  kesitBas: number;
}

export interface KodAramaYaniti {
  sonuclar: KodAramaSonucu[];
  durum: KodDizinDurumu;
  /** Anlamsal arama kullanılamadı (model kapalı, dizin hazır değil ya da zaman aşımı); yalnız anahtar sözcükle bulundu */
  yalnizSozcuk: boolean;
  /** Arama süresi (ms) */
  sureMs: number;
}

/** Harita düğümü: klasör ya da dosya */
export interface KodHaritaDugumu {
  ad: string;
  yol: string;
  tur: "klasor" | "dosya";
  dil?: string;
  /** Dosyanın ya da klasördeki tüm dosyaların satır sayısı */
  satir: number;
  /** Klasördeki dosya sayısı (alt klasörler dahil) */
  dosyaSayisi?: number;
  /** Dosyanın öne çıkan sembolleri (dışa açık ve büyük olanlar önce) */
  semboller?: Pick<KodSembolu, "ad" | "tur" | "bas" | "disaAcik">[];
  /** Bu dosyayı içe aktaran dosya sayısı */
  iceAktaran?: number;
  cocuklar?: KodHaritaDugumu[];
}

export interface KodIceAktarma {
  /** Çözülen dosya ya da klasör yolu; dış paketlerde null */
  yol: string | null;
  /** Koddaki belirteç: "./a.js", "react", "app.models" */
  kaynak: string;
  /** İçe aktaran dosyadaki satır */
  satir: number;
  /** İçe aktarılan adlar (biliniyorsa) */
  adlar: string[];
}

export interface KodBagimliliklari {
  yol: string;
  iceAktardiklari: KodIceAktarma[];
  iceAktaranlar: { yol: string; satir: number; adlar: string[] }[];
}

export interface KodGrafikDugumu {
  /** Düğüm kimliği: dosya ya da klasör yolu (kök klasör ".") */
  id: string;
  dil: string;
  satir: number;
  dosya: number;
}

export interface KodGrafikKenari {
  kaynak: string;
  hedef: string;
  /** İçe aktarma sayısı */
  agirlik: number;
}

export interface KodGrafigi {
  duzey: "klasor" | "dosya";
  dugumler: KodGrafikDugumu[];
  kenarlar: KodGrafikKenari[];
  /** Düğüm sınırı yüzünden dışarıda kalan düğüm sayısı */
  kirpilan: number;
}

/** Ayarlar ekranı için model bilgisi */
export interface KodZekasiModelBilgisi {
  secim: Exclude<KodZekasiModeli, "kapali">;
  kimlik: string;
  ad: string;
  aciklama: string;
  boyut: number;
  /** Yaklaşık indirme boyutu (MB) */
  indirmeMb: number;
  indirildi: boolean;
  /** Diskteki boyut (MB); indirilmediyse 0 */
  diskMb: number;
}
