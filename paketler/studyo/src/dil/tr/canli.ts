// 0.0.8 canlılık (Türkçe): ofiste kişi kartı ve gerçek olaylara bağlı davranışların yazıları, ekran kısayolları,
// pano süzgeci ve kayıt işareti
import { ilgi } from "../../yardimcilar/bicim";

export const canli = {
  /** Ofiste çalışana basınca yanında açılan kart */
  kart: {
    etiket: (ad: string) => `${ad}: hızlı eylemler`,
    kapat: "Kartı kapat (Esc)",
    takipEt: "Takip et",
    takibiBirak: "Takibi bırak",
    mesaj: "Mesaj",
    gorevAc: (kod: string, baslik: string) => `${kod} ${baslik}: panoda aç`,
    gorevYok: "Üzerinde görev yok",
    ayrintilar: "Ayrıntılar",
    ayrintiIpucu: "Oturum, ayarlar ve zekâ",
  },

  /** Ofis sahnesi: ipucu ve erişilebilir addaki etkinlik, balonlar, akış satırları */
  ofis: {
    etkinlik: {
      masasindaBekliyor: "Masasında, iş bekliyor",
      molada: "Kısa molada",
      ceoKarariniBekliyor: (ceo: string) => `${ilgi(ceo)} kararını bekliyor`,
      yanitBekliyor: (ad: string) => `${ilgi(ad)} yanıtını bekliyor`,
    },
    balon: {
      onayladim: "Onayladım.",
      reddettim: "Reddettim.",
    },
    akis: {
      ceoKarariniBekliyor: (ad: string, ceo: string) => `${ad}, ${ilgi(ceo)} kararını bekliyor`,
      kaydedildi: (kod: string, ad: string | null, ozet: string) => `${kod} kaydedildi${ad ? ` · ${ad}` : ""}${ozet ? `: ${ozet}` : ""}`,
    },
    kararIsareti: (ad: string, ceo: string) => `${ad}, ${ilgi(ceo)} kararını bekliyor: onaya git`,
    kararIsaretiIpucu: (ceo: string) => `${ilgi(ceo)} kararını bekliyor: onaya git`,
  },

  /** Ekran kısayolları: "?" penceresi */
  kisayol: {
    ac: "Kısayollar (?)",
    ofisBaslik: "Ofis kısayolları",
    panoBaslik: "Pano kısayolları",
    oklar: "Oklar",
    ofis: {
      yakinlastir: "Yakınlaştır, uzaklaştır",
      sigdir: "Ofisi sığdır",
      kaydir: "Kamerayı kaydır",
      yayin: "Canlı yayını aç ya da kapat",
      kapat: "Kartı kapat, takibi bırak",
      pencere: "Bu pencereyi aç ya da kapat",
    },
    /** Canlı yayının harf kısayolu */
    yayinTusu: "c",
    pano: {
      ara: "Görevlerde ara",
      yeni: "Yeni görev",
      kapat: "Açık çekmeceyi kapat",
      pencere: "Bu pencereyi aç ya da kapat",
    },
    /** Yeni görevin harf kısayolu */
    yeniTusu: "y",
  },

  /** Pano: kişi ve rol süzgeci, kayıt işareti, yükleme iskeleti */
  pano: {
    kisiYaDaRol: "Kişiye ya da role göre süz",
    kisiler: "Kişiler",
    roller: "Roller",
    temizle: "Süzgeci temizle",
    sonuc: (n: number, toplam: number) => `${n} / ${toplam} görev`,
    kaydedildi: "Kaydedildi",
    kaydedildiIpucu: (kod: string, ozet: string | null) => `${kod} az önce kaydedildi${ozet ? `: ${ozet}` : ""}`,
    yukleniyor: "Görevler yükleniyor",
  },
};
