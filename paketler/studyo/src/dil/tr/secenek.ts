// Seçenekli sorular (Türkçe): ajanın seçenekli sorusu, CEO'nun düz metindeki numaralı listesini seçerek yanıtlama ve
// kurula sorunun seçenekleri (Onaylar ve açılır pencere)
import { yonelme } from "../../yardimcilar/bicim";

export const secenek = {
  /** Seçenek grubunun ekran okuyucu adı */
  grup: (soru: string) => `Seçenekler: ${soru}`,
  grupAdsiz: "Seçenekler",
  tekSecim: "Birini seçin",
  cokluSecim: "Birden çok seçebilirsiniz",
  secildi: (n: number, toplam: number) => `${n}/${toplam} seçildi`,
  /** Seçenek çokken tek seçim açılır listeyle */
  acilirYer: "Bir seçenek seçin",
  notEtiketi: "Not",
  notYer: "Not ekleyin (isteğe bağlı)",
  serbestYer: "Not ekleyin ya da kendi yanıtınızı yazın",
  gonder: "Gönder",
  gonderIpucu: "Enter gönderir, Shift+Enter yeni satır",

  /** Yanıtlanınca kilitli görünüm */
  yanitlandi: "Yanıtlandı",
  yanitlandiZaman: (saat: string) => `Yanıtlandı · ${saat}`,
  seciminiz: "Seçiminiz",
  notunuz: "Not",
  yanitiniz: "Yanıtınız",
  secilmedi: "Seçilmedi",
  tumu: (n: number) => `Bütün seçenekler (${n})`,

  /** CEO'nun düz metindeki numaralı listesi */
  secerekYanitla: "Seçerek yanıtla",
  secerekYanitlaIpucu: (n: number) => `Listedeki ${n} maddeyi işaretleyip kısa bir notla yanıtlayın`,
  maddeSayisi: (n: number) => `${n} madde`,
  gitti: (ad: string) => `Seçiminiz ${yonelme(ad)} gitti.`,
  gittiAdsiz: "Seçiminiz iletildi.",

  /** Kurula soru (kurula_sor) seçenekleri: Onaylar ve açılır pencere */
  onay: {
    yanitla: "Yanıtla",
    reddet: "Reddet",
    ipucu: (ad: string | null) => `Seçtiğiniz seçenek ${ad ? yonelme(ad) : "soruyu sorana"} yanıt olarak gider; Reddet hayır demektir, notunuz gerekçe olur.`,
    /** Onayın notu: sorana yanıt olarak gider ("2) Seçenek — not") */
    yanit: (no: number, metin: string, not: string) => `${no}) ${metin}${not ? ` — ${not}` : ""}`,
    yanitlandi: (soru: string) => `Yanıtınız gitti: ${soru}`,
    reddedildi: (soru: string) => `Soru reddedildi: ${soru}`,
    secilen: "Seçilen",
  },
};
