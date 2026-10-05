// Karar yetkisi (0.0.7): onayı kimin karara bağladığı, gösterilecek gerekçesi ve bekleyen onayın CEO'yu bekleyip
// beklemediği. Sözleşmenin yeni alanlarını bilmeyen eski çekirdekte de anlamlı sonuç verir.
import type { KararKaynagi, KararVeren, Onay, OnayTuru, ProjeOzeti } from "@arnorg/ortak";
import { anayasaVerisi, ilkParagraf, istenCikarmaVerisi, teslimVerisi } from "./onayVerisi";

/** Kararı veren ya da süre dolduysa "zaman_asimi" */
export type KararEtiketi = KararKaynagi | "zaman_asimi";

/** Otomatik onayın çekirdekte yazdığı not (iki dilde) */
const OTOMATIK_NOTLARI = ["Otomatik onay", "Auto-approved"];

/** Sonuçlanan onayı kim karara bağladı; 0.0.7 öncesi kayıtta nottan çıkarılır (otomatik onay notu yoksa kurul) */
export function kararVereni(onay: Onay): KararEtiketi | null {
  if (onay.durum === "bekliyor") return null;
  if (onay.durum === "zaman_asimi") return "zaman_asimi";
  if (onay.kararKaynagi) return onay.kararKaynagi;
  return onay.not && OTOMATIK_NOTLARI.includes(onay.not.trim()) ? "otomatik" : "kurul";
}

/** Projenin karar yetkisi; alanı bilmeyen eski çekirdek kurul kipindedir */
export function kararKipi(proje: Pick<ProjeOzeti, "kararVeren"> | null | undefined): KararVeren {
  return proje?.kararVeren === "ceo" ? "ceo" : "kurul";
}

/** Bekleyen onay CEO'nun kararında (tam otonom kipte CEO'ya yönelmiş); kurulun penceresi açılmamıştır */
export function ceoyuBekliyor(onay: Onay): boolean {
  return onay.durum === "bekliyor" && onay.muhatap === "ceo";
}

/** Kurulun karar beklediği onaylar (rozetler, Karargâh); CEO'yu bekleyenler sayılmaz */
export function kuruluBekleyen(onaylar: Onay[], tur?: (t: OnayTuru) => boolean): number {
  return onaylar.filter((o) => o.durum === "bekliyor" && o.muhatap !== "ceo" && (!tur || tur(o.tur))).length;
}

/** Gerekçeli teklifler: CEO kendi teklifine karar verince gerekçe teklifin içindedir */
const GEREKCELI: OnayTuru[] = ["ise_alim", "isten_cikarma", "anayasa", "birlestirme", "teslim"];

/**
 * Sonuçlanan onayın gösterilecek gerekçesi. CEO kendi teklifine karar verdiyse notu yalnız "CEO kararı"dır; asıl
 * gerekçe teklifin içindedir (teslimde özet, ana yasa ve işten çıkarmada gerekçe, ötekilerde ayrıntının ilk paragrafı).
 */
export function kararGerekcesi(onay: Onay, ceoId: string | null | undefined): string | null {
  if (onay.kararKaynagi === "ceo" && ceoId && onay.ajanId === ceoId && GEREKCELI.includes(onay.tur)) {
    const teklif =
      onay.tur === "teslim"
        ? teslimVerisi(onay.veri).ozet
        : onay.tur === "anayasa"
          ? anayasaVerisi(onay.veri).gerekce
          : onay.tur === "isten_cikarma"
            ? istenCikarmaVerisi(onay.veri).gerekce
            : null;
    return teklif ?? ilkParagraf(onay.ayrinti) ?? onay.not;
  }
  return onay.not;
}
