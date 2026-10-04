// Karargâh (Türkçe)
import { yonelme } from "../../yardimcilar/bicim";

export const karargah = {
  baslik: "Karargâh",
  veriAlinamadi: "Proje verisi alınamadı.",
  ozet: "Özet",
  onayBekleyen: (n: number) => `Onay bekleyen ${n} karar`,
  onayYok: "Bekleyen onay yok",
  aracBekliyor: (n: number) => `${n} araç çağrısı bekliyor`,
  gorevler: "Görevler",
  panoyaGit: "Panoya git",
  ekip: "Ekip",
  orgSemasi: "Organizasyon şeması",
  ekipBos: "Ekip boş",
  ekipBosAciklama: "CEO işe alım teklif edince ekip burada görünür.",
  rapor: {
    etiket: "CEO raporu",
    zaman: (zaman: string) => `CEO raporu · ${zaman}`,
    ceoYok: "CEO yok",
    ceoYokAciklama: "Bu projede CEO ajanı bulunamadı. Ekip ekranından CEO rolüyle birini işe alın.",
    henuzYok: "CEO henüz rapor yazmadı. Aşağıdan bir brief verin; planı ve ekip önerisini burada okursunuz.",
    kisalt: "Kısalt",
    tamami: "Tamamını oku",
    donem: "Dönem raporu",
    donemBaslik: "Son 7 günün raporunu notlara yazar",
    hazirlaniyor: "Hazırlanıyor",
    kaydedildi: (yol: string) => `Dönem raporu notlara kaydedildi: ${yol}`,
  },
  /** kanal: "#genel" gibi, dile göre görünen adıyla */
  brief: {
    baslik: "Brief ver",
    nereye: (kanal: string) => `${kanal} kanalına yazılır; anma yoksa CEO'ya gider`,
    yer: "Ne istediğinizi düz metinle yazın. Örn. Sipariş listesine CSV dışa aktarma ekleyin; ay sonuna kadar canlıda olsun.",
    kisayol: "Ctrl+Enter ile gönderin",
    kime: (ad: string) => `${yonelme(ad)} gönder`,
    gonderildi: (kanal: string, ceo: string | null) => `Brief ${kanal} kanalına yazıldı${ceo ? `; ${ceo} aldı` : ""}.`,
  },
  hafiza: {
    baslik: "Hafıza",
    son24: (n: number) => `son 24 saatte ${n}`,
    soruBekliyor: (n: number) => `${n} soru yanıt bekliyor`,
    git: "Hafızaya git",
    bos: "Hafıza boş",
    bosAciklama: "Ajanlar karar aldıkça, hata çözdükçe ve iş bitirdikçe buraya yazar.",
    soru: "Soru",
  },
};
