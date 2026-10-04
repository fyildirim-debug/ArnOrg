// Çekirdeğin dili: ayardaki dil (Stüdyo ile aynı). Ajan talimatları, ArnOrg'un kanal mesajları, bildirimler
// ve hata metinleri bu dilde üretilir. Kayıtlı veri (mesaj, görev, hafıza) yazıldığı dilde kalır.
import type { Dil } from "@arnorg/ortak";

let kaynak: () => Dil = () => "tr";

/** Dilin okunacağı yer (Şirket kurulurken ayara bağlanır) */
export function dilKaynagi(f: () => Dil): void {
  kaynak = f;
}

export function dil(): Dil {
  return kaynak();
}

/** Geçerli dildeki metin: iki("Proje açıldı.", "Project opened.") */
export function iki(tr: string, en: string): string {
  return kaynak() === "en" ? en : tr;
}

/** Türkçe ya da İngilizce liste birleştirme: "Ada, Ece ve Kerem" / "Ada, Ece and Kerem" */
export function listele(ogeler: string[]): string {
  if (ogeler.length < 2) return ogeler.join("");
  return `${ogeler.slice(0, -1).join(", ")} ${iki("ve", "and")} ${ogeler.at(-1)}`;
}
