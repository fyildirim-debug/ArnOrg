// Görev kaydı olayı (0.0.8): ortak projede bir görevin dosyaları çalışma dalına commit'lenince çekirdeğin yayınladığı
// gorev.kaydedildi (ortak tiplerde GorevKaydiOlayi). Ofis kaydedenin başında küçük bir onay işareti, Pano kartında kısa
// bir "kaydedildi" gösterir; ikisi de yalnız olayın kısa alanlarına bakar. Kaydın tamamı ve kalite denetimi Ekip'teki
// ortak çalışma panelindedir (durum/ortakCalisma.ts).
import type { SunucuOlayi } from "@arnorg/ortak";

/** Ofis ve Pano işaretinin okuduğu özet */
export interface KayitOzeti {
  projeId: string;
  gorevId: string | null;
  kod: string | null;
  /** Kaydeden çalışan */
  ajanId: string | null;
  /** Commit konusunun başlık kısmı (baştaki görev kodu atılır), tek satır */
  ozet: string | null;
  /** Commit'in kısa kimliği */
  kimlik: string;
}

/** Olay bir görevin kaydıysa özeti; değilse (ya da görevsiz kayıtsa) null */
export function gorevKaydiOku(olay: SunucuOlayi): KayitOzeti | null {
  if (olay.tur !== "gorev.kaydedildi" || (!olay.gorevId && !olay.gorevKodu)) return null;
  const kod = olay.gorevKodu;
  const satir = (olay.mesaj.split(/\r?\n/)[0] ?? "").trim();
  const ozet = kod && (satir === kod || satir.startsWith(`${kod} `)) ? satir.slice(kod.length).trim() : satir;
  return {
    projeId: olay.projeId,
    gorevId: olay.gorevId,
    kod,
    ajanId: olay.ajanId,
    ozet: ozet || null,
    kimlik: olay.commit.slice(0, 7),
  };
}
