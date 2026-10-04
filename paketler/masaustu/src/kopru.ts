// Ön yükleme köprülerinin sözleşmesi: açılış/hata penceresi (durum.html), ana pencere ve uygulama içi tarayıcı ile ana süreç arası
// IPC kanalları ve türler. Hem ana süreçte hem tarayıcı tarafında kullanılır; içe aktarma yapmaz.

export type DurumAsamasi = "baslatiliyor" | "hata";

export interface DurumBilgisi {
  asama: DurumAsamasi;
  baslik: string;
  aciklama: string;
  /** Hata durumunda kayıt dosyasının son satırları */
  kayitKuyrugu: string;
  kayitDosyasi: string;
  surum: string;
}

export type DurumEylemi = "yeniden-baslat" | "kayitlari-ac" | "cik";

export const DURUM_EYLEMLERI: readonly DurumEylemi[] = ["yeniden-baslat", "kayitlari-ac", "cik"];

export const DURUM_KANALLARI = {
  al: "arnorg-durum:al",
  guncelle: "arnorg-durum:guncelle",
  eylem: "arnorg-durum:eylem",
} as const;

/** Ana pencerenin ön yükleme köprüsü kanalı */
export const DISARIDA_AC_KANALI = "arnorg:disarida-ac";

/** Ana pencerenin sistem klasör seçicisi kanalı */
export const KLASOR_SEC_KANALI = "arnorg:klasor-sec";

/** Önemli anda dikkat: "cek" pencere arkadaysa görev çubuğunda yanıp söner, "one-getir" pencereyi öne alır */
export const DIKKAT_KANALI = "arnorg:dikkat";

export type DikkatIstegi = "cek" | "one-getir";

/**
 * Otomatik güncellemenin aşaması: yok (güncel ya da denetlenmedi), denetleniyor, iniyor (yeni sürüm bulundu),
 * hazir (indirildi; yeniden başlatınca kurulur), hata (denetim ya da indirme başarısız)
 */
export type GuncellemeAsamasi = "yok" | "denetleniyor" | "iniyor" | "hazir" | "hata";

/** Ana süreçten ana pencereye iletilen güncelleme durumu (Stüdyo'da @arnorg/ortak MasaustuGuncellemeDurumu ile aynı) */
export interface GuncellemeDurumu {
  asama: GuncellemeAsamasi;
  /** Bulunan yeni sürüm (ör. "0.0.5") */
  surum: string | null;
  /** İndirme ilerlemesi (0–100); bilinmiyorsa null */
  yuzde: number | null;
  hata: string | null;
}

/** Ana pencerenin güncelleme köprüsü kanalları */
export const GUNCELLEME_KANALLARI = {
  /** Anlık durum (invoke) */
  al: "arnorg-guncelleme:al",
  /** Durum değişti (ana süreçten ana pencereye send) */
  durum: "arnorg-guncelleme:durum",
  /** İndirilen güncellemeyi kur ve yeniden başlat (invoke) */
  kur: "arnorg-guncelleme:kur",
} as const;

// ---------------------------------------------------------------------------
// Uygulama içi tarayıcı (0.0.5): Stüdyo ↔ ana süreç (WebContentsView) ↔ sayfadaki öğe seçici
// Türler Stüdyo'daki @arnorg/ortak TarayiciDurumu, TarayiciSecimi, TarayiciOlayi ve Duzeltme* ile aynıdır.
// ---------------------------------------------------------------------------

export const TARAYICI_KANALLARI = {
  /** Stüdyo → ana süreç (invoke): TarayiciKomutu */
  komut: "arnorg-tarayici:komut",
  /** Ana süreç → Stüdyo (send): TarayiciOlayi */
  olay: "arnorg-tarayici:olay",
  /** Ana süreç → sayfanın ön yükleme betiği (send): SayfaKomutu */
  sayfaKomut: "arnorg-tarayici:sayfa-komut",
  /** Sayfa → ana süreç (send): seçilen öğe (SayfaSecimi) */
  sayfaSecim: "arnorg-tarayici:sayfa-secim",
  /** Sayfa → ana süreç (send): seçiciden Esc ile çıkıldı */
  sayfaCikis: "arnorg-tarayici:sayfa-cikis",
} as const;

export interface TarayiciSiniri {
  x: number;
  y: number;
  genislik: number;
  yukseklik: number;
}

export interface TarayiciDurumu {
  adres: string;
  baslik: string;
  yukleniyor: boolean;
  geriGidebilir: boolean;
  ileriGidebilir: boolean;
  secici: boolean;
  hata: string | null;
}

export interface SayfaStilleri {
  yaziTipi: string;
  boyut: string;
  renk: string;
  arkaPlan: string;
}

export interface SayfaKutusu {
  x: number;
  y: number;
  genislik: number;
  yukseklik: number;
  sayfaX: number;
  sayfaY: number;
}

/** Sayfadaki seçicinin topladığı öğe bilgisi; ekran görüntüsünü ana süreç ekler */
export interface SayfaSecimi {
  adres: string;
  sayfaBasligi: string;
  secici: string;
  ogeMetni: string;
  ogeHtml: string;
  stiller: SayfaStilleri;
  kutu: SayfaKutusu;
  gorunum: { genislik: number; yukseklik: number };
}

export interface TarayiciSecimi extends SayfaSecimi {
  /** data:image/png;base64,… ya da null */
  gorsel: string | null;
}

export type TarayiciOlayi =
  | { tur: "durum"; durum: TarayiciDurumu }
  | { tur: "secim"; secim: TarayiciSecimi }
  | { tur: "kisayol"; kisayol: TarayiciKisayolu };

/** Sayfa odaktayken yakalanan kısayollar: adres çubuğu (Ctrl/Cmd+L), öğe seçici (Ctrl/Cmd+Shift+C) */
export type TarayiciKisayolu = "adres" | "secici";

export type TarayiciKomutu =
  | { tur: "git"; adres: string }
  | { tur: "geri" }
  | { tur: "ileri" }
  | { tur: "yenile" }
  | { tur: "durdur" }
  | { tur: "yerlestir"; sinir: TarayiciSiniri | null }
  | { tur: "secici"; acik: boolean; ipucu: string }
  | { tur: "secimiBirak" }
  | { tur: "kare" }
  | { tur: "durum" };

/** Ana süreçten sayfadaki seçiciye: aç (üstte kısa yönergeyle), kapat, seçim çerçevesini kaldır */
export type SayfaKomutu = { tur: "ac"; ipucu: string } | { tur: "kapat" } | { tur: "birak" };
