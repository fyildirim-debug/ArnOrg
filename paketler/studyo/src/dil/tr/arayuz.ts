// 0.0.8 arayüz: Tarayıcı'da proje adresleri ve web kipindeki çerçeve, üst çubukta açık projenin toplam tokenı,
// işe alım formunda adla uyumlu karakter önerisi
export const arayuz = {
  adresler: {
    baslik: "Proje adresleri",
    /** Başlığın yanındaki sayaç: yanıt veren adresler */
    sayac: (acik: number, toplam: number) => (acik === toplam ? `${acik} açık` : `${acik}/${toplam} açık`),
    durum: {
      acik: "Açık",
      kapali: "Yanıt vermiyor",
      bilinmiyor: "Yoklanmadı",
    },
    /** Yerel ağ dışındaki adres yoklanmaz */
    yoklanmaz: "Yerel ağ dışında, yoklanmaz",
    /** Çalışanın kabuk çıktısında yakalanan adres */
    cikti: "çıktıdan",
    /** Kartın erişilebilir adı */
    ac: (ad: string, durum: string, adres: string) => `${ad}, ${durum}: ${adres} adresini aç`,
    acBaslik: (adres: string) => `${adres} · tarayıcıda aç`,
  },
  cerceve: {
    etiket: (ad: string) => `${ad}: projenin sayfası`,
    arac: "Çerçeve araç çubuğu",
    yenile: "Yenile",
    yeniSekme: "Yeni sekmede aç",
    notEkle: "Not ekle",
    kapat: "Çerçeveyi kapat",
    ipucu: "Sayfa açılmazsa sunucu çerçevede gösterilmeyi reddediyor olabilir; yeni sekmede açın.",
  },
  toplam: {
    etiket: "Toplam",
    birim: "token",
    baslik: (toplam: string, bugun: string) => `Açık projede bütün çalışanların harcadığı toplam token: ${toplam}. Bugün: ${bugun}. Ayrıntı Karargâh'ta.`,
  },
  karakter: {
    digerleri: "Diğer karakterler",
    adlaIpucu: (ad: string, karakter: string | null) =>
      `Otomatik: ${ad} adına ve role uyan boş karakter${karakter ? ` (şimdilik ${karakter})` : ""}. Adla uyumlu karakterler önde.`,
  },
};
