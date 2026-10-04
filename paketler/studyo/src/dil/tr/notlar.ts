// Notlar (Türkçe)
export const notlar = {
  baslik: "Notlar",
  /** Alt başlık iki parça: arada .arnorg/notlar/ yolu kod olarak durur */
  altBaslikOnce: "Proje belgeleri repo içinde yaşar:",
  altBaslikSonra: "· vizyon, mimari, kararlar · her ajan okur, yazar, arar",
  yeniNot: "Yeni not",
  alinamadi: "Notlar alınamadı.",
  henuzYok: "Henüz not yok.",
  degisiklikleriAt: "Değişiklikleri at",
  kaydedilmemisUyari: "Bu notta kaydedilmemiş değişiklikler var. Başka nota geçerseniz kaybolur.",
  notSecin: "Not seçin",
  notSecinMetin: "Soldaki ağaçtan bir not açın.",
  bosBaslik: "Notlar boş",
  bosMetin: "Vizyon ve mimari notları proje açılırken oluşur. Yeni not ile başlayın.",

  /** Not görünümü ve düzenleme */
  notAlinamadi: "Not alınamadı.",
  kaydedildi: (dosya: string) => `${dosya} kaydedildi.`,
  kaydedildiZaman: (zaman: string) => `kaydedildi ${zaman}`,
  kaydedilmedi: "Kaydedilmedi · Ctrl+S",
  degisiklikYok: "Değişiklik yok",
  icerik: (yol: string) => `${yol} içeriği`,
  onizleme: "Önizleme",
  onizlemeBos: "Önizleme burada görünür.",
  notBos: "Bu not boş.",

  /** Yeni not formu */
  dosyaAdiYazin: "Dosya adı yazın, ör. kararlar/ADR-006-onbellek.md",
  yolHatasi: "Yol .. içeremez.",
  notVar: "Bu adda bir not zaten var.",
  yeniYol: "Yeni notun yolu",
  olustur: "Oluştur",
};
