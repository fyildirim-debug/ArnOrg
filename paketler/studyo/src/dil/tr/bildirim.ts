// Durum depolarındaki bildirim ve hata metinleri (Türkçe)
export const bildirim = {
  kararBekliyor: (ajan: string | null, baslik: string) => `${ajan ?? "Bir ajan"} kararınızı bekliyor: ${baslik}`,
  /** api/: arayüzün kendi ürettiği hata metinleri; çekirdeğin gönderdiği hata metni olduğu gibi gösterilir */
  api: {
    gecersizIstek: "Geçersiz istek.",
    anahtarGecersiz: "Erişim anahtarı geçersiz.",
    bulunamadi: "Bulunamadı.",
    yapilamiyor: "İşlem şu an yapılamıyor.",
    cokBuyuk: "Dosya çok büyük.",
    cekirdekHatasi: "Çekirdekte bir hata oluştu.",
    beklenmeyen: (durum: number) => `Beklenmeyen yanıt (${durum}).`,
    ulasilamadi: "Çekirdeğe ulaşılamadı. Bağlantıyı denetleyin.",
    bilinmeyen: "Bilinmeyen bir hata oluştu.",
    terminalKapandi: "Terminal oturumu kapandı.",
  },
};
