// ArnOrg ortak sözleşmesi
// Çekirdek (arnorg-server) ile Stüdyo (arayüz) arasında paylaşılan tipler ve sabitler.
// Bu dosya tek başına durur; başka dosyaya göreli import yapmaz.

export const ARNORG_SURUMU = "0.1.0";

// ---------------------------------------------------------------------------
// Genel
// ---------------------------------------------------------------------------

/** ISO 8601 zaman damgası */
export type Zaman = string;

export type IzinModu = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto";

/** Claude model takma adı ya da tam model kimliği */
export type ModelAdi = "opus" | "sonnet" | "haiku" | (string & {});

export interface Saglik {
  surum: string;
  platform: string;
  claudeBulundu: boolean;
  claudeYolu: string | null;
  claudeSurumu: string | null;
  sdkSurumu: string;
  veriDizini: string;
}

export interface Ayarlar {
  /** Kurulu Claude Code yolu; boşsa önce PATH, sonra SDK ile gelen ikili denenir */
  claudeYolu: string | null;
  /** Ajanların varsayılan izin modu */
  varsayilanIzinModu: IzinModu;
  /** Karar bekleyen araç çağrısı için süre (saniye); dolunca reddedilir */
  onaySuresiSn: number;
  /** Şirket geneli günlük bütçe (USD) */
  gunlukButceUsd: number;
  /** Dış editör komutu (codium, code, cursor) */
  disEditor: string;
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
  varsayilanDal: string;
  olusturma: Zaman;
}

export interface ProjeOzeti extends Proje {
  ajanSayisi: number;
  aktifAjanSayisi: number;
  gorevSayilari: Record<GorevDurumu, number>;
  bekleyenOnay: number;
  bugunMaliyetUsd: number;
}

export interface ProjeOlusturIstegi {
  ad: string;
  /** Mutlak yol. olustur=true ise klasör yoksa açılır */
  yol: string;
  /** true: yeni repo (git init + ilk commit); false: var olan repoyu bağla */
  olustur: boolean;
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
  gunlukButceUsd: number;
  bugunHarcananUsd: number;
  toplamHarcananUsd: number;
  /** Kuruldan ya da CEO'dan gelen ek talimat */
  talimatEki: string;
  olusturma: Zaman;
}

export interface AjanIseAlIstegi {
  ad: string;
  rol: string;
  model?: ModelAdi;
  yoneticiId?: string | null;
  gunlukButceUsd?: number;
  talimatEki?: string;
}

export interface AjanGuncelleIstegi {
  model?: ModelAdi;
  gunlukButceUsd?: number;
  izinModu?: IzinModu;
  yoneticiId?: string | null;
  talimatEki?: string;
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
  maliyetUsd?: number;
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

export type OnayTuru = "arac" | "ise_alim" | "butce" | "birlestirme" | "genel";
export type OnayDurumu = "bekliyor" | "onaylandi" | "reddedildi" | "zaman_asimi";

export const ONAY_TURU_ADLARI: Record<OnayTuru, string> = {
  arac: "Araç çağrısı",
  ise_alim: "İşe alım",
  butce: "Bütçe",
  birlestirme: "main'e birleştirme",
  genel: "Karar",
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
// Maliyet
// ---------------------------------------------------------------------------

export interface MaliyetOzeti {
  bugunUsd: number;
  toplamUsd: number;
  gunlukButceUsd: number;
  ajanlar: { ajanId: string; ad: string; bugunUsd: number; toplamUsd: number }[];
  /** Abonelik penceresi bilgisi (Claude Code rate_limit_event) */
  pencere: { tur: string; durum: string; sifirlanma: Zaman | null } | null;
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
  | { tur: "maliyet"; projeId: string; ajanId: string; bugunUsd: number; toplamUsd: number }
  | { tur: "dosya.degisti"; projeId: string; alan: string; yol: string; ajanId: string | null }
  | { tur: "bildirim"; seviye: "bilgi" | "uyari" | "hata"; metin: string; projeId?: string };

export type IstemciOlayi = { tur: "abone"; projeId: string | null } | { tur: "ping" };

/** Terminal WebSocket'i (/ws/terminal/:id) istemci mesajları */
export type TerminalIstemciMesaji = { tur: "girdi"; veri: string } | { tur: "boyut"; sutun: number; satir: number };

export interface TerminalAcIstegi {
  alan: string;
  sutun?: number;
  satir?: number;
}

/** API hata gövdesi */
export interface ApiHatasi {
  hata: string;
}
