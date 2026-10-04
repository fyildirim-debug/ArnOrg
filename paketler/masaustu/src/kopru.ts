// Ön yükleme köprülerinin sözleşmesi: açılış/hata penceresi (durum.html) ve ana pencere ile ana süreç arası
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
