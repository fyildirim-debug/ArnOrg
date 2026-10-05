// Arayüz hareketinin ortak ayarı: süreler, eğriler ve hareket azaltma. Bütün geçişler 150-250 ms aralığında ve aynı
// eğriyle: girişte ve yer değiştirmede yumuşak duruş (expo-out), çıkışta daha kısa ve hızlanan (expo-in).
// CSS karşılıkları stiller/hareket.css'te (--sure-hizli, --sure, --sure-yavas, --egri, --egri-cik).

export const SURE = {
  /** Çıkış ve anlık geri bildirim */
  hizli: 160,
  /** Giriş, sayı tıkı, bildirim */
  orta: 200,
  /** Yer değiştirme (FLIP) ve ekran girişi */
  yavas: 240,
} as const;

export const EGRI = "cubic-bezier(0.16, 1, 0.3, 1)";
export const EGRI_CIK = "cubic-bezier(0.7, 0, 0.84, 0)";

/**
 * Sayaç tıkının yönü: eski ve yeni metindeki ilk tamsayı karşılaştırılır (binlik ayırıcılar atılır, "(3)" ve "3 görev"
 * okunur). Biri okunamazsa ya da eşitse null: yalnız renk vurgusu, kayma yok.
 */
export function sayiYonu(eski: string | null | undefined, yeni: string | null | undefined): "artti" | "azaldi" | null {
  const oku = (m: string | null | undefined): number | null => {
    const e = /-?\d+(?:[.,   ]\d{3})*/.exec(m ?? "");
    if (!e) return null;
    const n = Number(e[0].replace(/[.,   ]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const a = oku(eski);
  const b = oku(yeni);
  if (a === null || b === null || a === b) return null;
  return b > a ? "artti" : "azaldi";
}

/** Kullanıcı hareketin azaltılmasını istiyor mu (her çağrıda güncel; tarayıcı dışında false) */
export function hareketAzaltildi(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
