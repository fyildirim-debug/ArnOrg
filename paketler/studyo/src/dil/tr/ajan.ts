// Ajan oturumu ve transkript (Türkçe)
import type { DosyaDegisikligi } from "@arnorg/ortak";

export const ajan = {
  bulunamadi: "Ajan bulunamadı",
  bulunamadiMetin: "Bu ajan işten çıkarılmış ya da başka bir projeye ait olabilir.",
  ekibeDon: "Ekibe dön",
  tokenIpucu: "Bugün ve toplam işlenen token",
  /** "<b>48 bin</b> token bugün · 1,7 milyon toplam" */
  tokenBugun: "token bugün",
  tokenToplam: "toplam",
  dokum: (ad: string) => `${ad} oturum dökümü`,
  yukleniyor: "Oturum yükleniyor",
  akisAlinamadi: "Oturum akışı alınamadı.",
  bosBaslik: "Oturumda henüz bir şey yok",
  bosKapali: "Oturum kapalı. Başlatın ya da aşağıdan mesaj yazın; mesaj oturumu açar.",
  bosAcik: "Ajan çalıştıkça mesajları, düşünceleri ve araç çağrıları burada akar.",
  dahaEski: (n: number) => `Daha eski ${n} öğeyi göster`,
  gizli: (n: number) => `${n} öğe gizli`,
  enYeni: (n: number) => `En yeniye in · ${n} yeni`,

  /** Oturum dökümü satırları */
  transkript: {
    hataCiktiYok: "Hata (çıktı yok)",
    ciktiYok: "Çıktı yok",
    hataCiktisi: "Hata çıktısı",
    cikti: "Çıktı",
    satir: (n: number) => `${n} satır`,
    duzenleme: (n: number) => `${n} düzenleme`,
    sonucBekleniyor: "Sonuç bekleniyor",
    gelenMesaj: "Gelen mesaj",
    dusunce: "Düşünce",
    sonuc: "sonuç",
    turHatayla: "Tur hatayla bitti",
    turBitti: "Tur bitti",
    token: (miktar: string) => `${miktar} token`,
  },

  /** Çalışma alanı dosya ağacı */
  dosyaAgaci: {
    dosyalar: "Dosyalar",
    degisiklikVar: "Değişiklik içeriyor",
    degisiklik: {
      M: "Değişti",
      A: "Eklendi",
      D: "Silindi",
      "?": "İzlenmiyor",
    } as Record<DosyaDegisikligi, string>,
  },
};
