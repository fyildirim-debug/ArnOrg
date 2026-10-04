// "Yazıyor" göstergesi: bir kanalda yanıt hazırlayan ajanlar (kanal.yaziyor olayı)
import { useSozluk } from "../dil";

export interface Yazan {
  ajanId: string;
  ad: string;
}

/** Değişmeyen boş liste: seçicilerde `?? []` her çizimde yeni dizi üretmesin */
export const KIMSE_YAZMIYOR: readonly Yazan[] = [];

/**
 * kisiler: yazanlar ("Ada yazıyor"); metinler verilirse her biri ayrı satır olur (ör. "Kerem #muhendislik kanalında yazıyor").
 * Bölge hep çizili kalır ki ekran okuyucu ilk "yazıyor"u da kibarca duyursun; kimse yazmıyorsa boş durur.
 */
export function YaziyorGostergesi({ kisiler, metinler, className }: { kisiler: readonly Yazan[]; metinler?: string[]; className?: string }) {
  const s = useSozluk();
  const satirlar = metinler ?? (kisiler.length ? [s.sohbet.yaziyor(kisiler.map((k) => k.ad))] : []);
  return (
    <div className={`yaziyor${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
      {satirlar.map((m, i) => (
        <span key={`${i}-${m}`} className="yaziyor-satir">
          <span className="yaziyor-nokta" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="yaziyor-metin tek-satir">{m}</span>
        </span>
      ))}
    </div>
  );
}
