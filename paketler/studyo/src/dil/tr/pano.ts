// Görev panosu (Türkçe)
export const pano = {
  baslik: "Pano",
  altBaslik: "Hedef → epik → görev · bağımlılığı bitmeyen görev başlayamaz",
  yeniGorev: "Yeni görev",
  araEtiket: "Görevlerde ara",
  araYer: "Ara: kod, başlık, etiket",
  atananaGore: "Atanana göre süz",
  herkes: "Herkes",
  atanmamis: "Atanmamış",
  iptalleriGoster: "İptalleri göster",
  alinamadi: "Görevler alınamadı.",
  bosBaslik: "Pano boş",
  ilkGorev: "İlk görevi oluştur",
  bosMetin: "CEO brief'i görevlere böldüğünde kartlar burada belirir. Siz de doğrudan görev açabilirsiniz.",
  eslesenYok: "Eşleşen yok",
  kolonBos: "Boş",
  atanmadi: "Atanmadı",

  /** Pano kartı */
  kart: {
    ayrintiAc: (kod: string, baslik: string) => `${kod} ${baslik} ayrıntılarını aç`,
    bagliIpucu: "Bu görev, bağımlılıkları bitmeden Çalışılıyor'a geçemez",
    bagli: (kodlar: string) => `Bağlı: ${kodlar}`,
    tasi: (kod: string, durum: string) => `${kod} görevini ${durum} durumuna taşı`,
  },

  /** Görev ayrıntısı çekmecesi */
  cekmece: {
    kaydedildi: (kod: string) => `${kod} kaydedildi.`,
    geriAl: "Değişiklikleri geri al",
    guncellendi: (zaman: string) => `Güncellendi ${zaman}`,
    durum: "Durum",
    bagimliliklarBitmedi: (kodlar: string) => `Bağımlılıklar bitmedi: ${kodlar}`,
    bagliUyari: (liste: string) => `Bağlı: ${liste}. Bunlar bitmeden Çalışılıyor'a geçilemez.`,
    islemYapilamadi: "İşlem yapılamadı",
    olusturan: "Oluşturan",
    olusturma: "Oluşturma",
    bunuBekleyen: "Bunu bekleyen",
  },

  /** Görev formu alanları */
  alanlar: {
    baslik: "Başlık",
    baslikGerekli: "Başlık gerekli.",
    atanan: "Atanan",
    etiket: "Etiket",
    etiketOrnek: "backend",
    aciklama: "Açıklama",
    kabulOlcutu: "Kabul ölçütü",
    kabulOrnek: "İş ne zaman bitmiş sayılır? Ölçülebilir yazın.",
    bagimliliklar: "Bağımlılıklar",
    bilinmeyenGorev: "Bilinmeyen görev",
    bagimlilikKaldir: (kod: string) => `${kod} bağımlılığını kaldır`,
    bagimlilikYok: "Bağımlılık yok. Bağımlılığı bitmemiş görev Çalışılıyor'a geçemez.",
    bagimlilikEkle: "Bağımlılık ekle",
    bagimlilikEkleSecenek: "Bağımlılık ekle…",
  },

  /** Yeni görev çekmecesi */
  yeni: {
    olusturuldu: (kod: string) => `${kod} oluşturuldu.`,
    olustur: "Görevi oluştur",
    baslangicDurumu: "Başlangıç durumu",
    olusturulamadi: "Görev oluşturulamadı",
  },
};
