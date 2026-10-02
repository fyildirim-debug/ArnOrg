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
