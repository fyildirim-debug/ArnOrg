// 0.0.8 arayüz: Tarayıcı'da proje adresleri (0.0.9'da Linkler) ve web kipindeki çerçeve, üst çubukta açık projenin
// toplam tokenı, işe alım formunda adla uyumlu karakter önerisi
export const arayuz = {
  adresler: {
    baslik: "Linkler",
    /** Başlığın yanındaki sayaç */
    sayac: (toplam: number) => `${toplam} link`,
    durum: {
      acik: "Açık",
      kapali: "Yanıt vermiyor",
      bilinmiyor: "Yoklanmadı",
    },
    /** Yerel ağ dışındaki adres yoklanmaz */
    yoklanmaz: "Yerel ağ dışında, yoklanmaz",
    /** Çalışanın kabuk çıktısında yakalanan adres */
    cikti: "çıktıdan",
    /** Kurulun eklediği linkin sahibi */
    kurul: "Kurul",
    /** Kartın erişilebilir adı */
    ac: (ad: string, durum: string, adres: string) => `${ad}, ${durum}: ${adres} adresini aç`,
    acBaslik: (adres: string) => `${adres} · tarayıcıda aç`,
    bos: "Henüz link yok. CEO projenin linklerini buraya ekler (geliştirme sunucusu, API, önizleme, test ya da canlı yayın), çalışanlar başlattıkları sunucuların adresini bildirir. Tıklayınca burada açılır.",
    iste: "CEO'dan iste",
    isteBaslik: "CEO'ya projenin linklerini eklemesini ve güncel tutmasını söyle (#yonetim)",
    istendi: "CEO'ya iletildi; linkler eklendikçe burada görünür.",
    ekle: "Link ekle",
    sil: (ad: string) => `${ad} linkini kaldır`,
    silOnay: (ad: string) => `${ad} Linkler'den kaldırılsın mı?`,
    kaldir: "Kaldır",
    form: {
      ad: "Ad",
      adIpucu: "Test ortamı",
      adres: "Adres",
      adresIpucu: "localhost:5173 ya da https://…",
      ekle: "Ekle",
      adresHata: "Geçerli bir adres yazın; ör. localhost:5173 ya da https://ornek.com.",
    },
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
