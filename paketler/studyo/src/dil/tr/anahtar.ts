// Erişim anahtarı ekranı (Türkçe)
export const anahtar = {
  baslik: "Bağlantı anahtarı gerekli",
  aciklama:
    "Çekirdek ilk açılışta bir erişim anahtarı üretir ve sunucu modunda bağlantı adresini terminale yazar. O adresi açın ya da anahtarı aşağıya yapıştırın. Anahtar yalnız bu sekmede tutulur; sekme kapanınca silinir.",
  etiket: "Erişim anahtarı ya da bağlantı adresi",
  baglan: "Bağlan",
  dosya: "Anahtar dosyası: <veri dizini>/erisim-anahtari",
  yapistirin: "Anahtarı yapıştırın.",
  gecersiz: "Anahtar geçersiz. Çekirdeğin yazdığı son bağlantıyı kullanın.",
  yanitYok: (durum: number) => `Çekirdek yanıt vermedi (${durum}).`,
  ulasilamadi: "Çekirdeğe ulaşılamadı. Sunucunun çalıştığını denetleyin.",
};
