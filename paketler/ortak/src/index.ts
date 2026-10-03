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
  /** Görev bu kadar dakika ilerlemezse sorumlu hatırlatılır, sonra yöneticiye ve kurula yükseltilir; 0 kapalı */
  tikanmaDakika: number;
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
