// Ofis (Türkçe): ekran, sahne yazıları, etkinlik metinleri, balonlar, akış satırları ve özet
import type { OdaKimligi } from "../../ofis/yerlesim";

export const ofis = {
  baslik: "Ofis",
  sahneEtiketi: "Ofis sahnesi",
  haritaEtiketi: "Ofis haritası. Yakınlaştırmak için + ve -, sığdırmak için 0, kaydırmak için ok tuşları",
  sayacEtiketi: "Durumlara göre çalışanlar",
  akisBaslik: "Ofiste şimdi",
  akisEtiketi: "Son sahneler",
  akisBos: "Sakin. Biri konuşunca, iş teslim edince ya da kapıdan girince burada görünür.",
  yakinlastirmaEtiketi: "Yakınlaştırma",
  yakinlastir: "Yakınlaştır",
  yakinlastirIpucu: "Yakınlaştır (+)",
  uzaklastir: "Uzaklaştır",
  uzaklastirIpucu: "Uzaklaştır (-)",
  sigdir: "Ofisi sığdır",
  sigdirIpucu: "Sığdır (0)",
  cizilemedi: "Ofis çizilemedi",
  projeVerisiAlinamadi: "Proje verisi alınamadı.",
  hazirlaniyor: "Ofis hazırlanıyor",
  varliklarAlinamadi: (durum: number) => `Ofis varlıkları alınamadı (${durum}).`,

  /** Duvar levhalarındaki ve zemindeki oda adları */
  odalar: {
    ceo: { ad: "CEO", alt: "yönetim" },
    cto: { ad: "CTO", alt: "teknik yönetim" },
    toplanti: { ad: "Toplantı", alt: "#toplanti" },
    arsiv: { ad: "Arşiv", alt: "hafıza · notlar" },
    sunucu: { ad: "Sunucu", alt: "main dalı" },
    muhendislik: { ad: "Mühendislik", alt: "açık ofis" },
    dinlenme: { ad: "Dinlenme", alt: "kahve · su · sohbet" },
    kurul: { ad: "Kurul", alt: "onay masası · giriş" },
  } as Record<OdaKimligi, { ad: string; alt: string }>,
  giris: "GİRİŞ",
  /** Levha yazılarını büyük harfe çevirirken kullanılan yerel ayar */
  yerel: "tr-TR",

  /** Tıklanınca başka ekrana götüren eşyalar */
  sicak: {
    kurul: "Kurul masası: onaylara git",
    pano: "Pano: görev panosuna git",
    sunucu: "Sunucu odası: koda git",
    arsiv: "Arşiv: notlara git",
    toplanti: "Toplantı odası: #toplanti kanalına git",
  },
  pano: {
    ad: "PANO",
    sutunlar: { bekleyen: "Bekleyen", suruyor: "Sürüyor", inceleme: "İnceleme", tamam: "Tamam" },
    etiket: (bekleyen: number, suren: number, incelemede: number, tamam: number) =>
      `Pano: ${bekleyen} bekleyen, ${suren} süren, ${incelemede} incelemede, ${tamam} tamam. Görev panosuna git`,
  },
  kurulAd: "Kurul",
  kurulMasasi: (n: number) => (n ? `Kurul masası: ${n} bekleyen onay. Onaylara git` : "Kurul masası: bekleyen onay yok. Onaylara git"),
  aday: "Aday",
  adayEtiketi: (ad: string) => `Aday: ${ad}. İşe alım teklifine git`,
  kararIsareti: (ad: string) => `${ad} kararınızı bekliyor: onaya git`,
  kararIsaretiIpucu: "Kararınızı bekliyor: onaya git",
  gozetmenHatirlatti: "Gözetmen hatırlattı",

  /** Karakterin erişilebilir adı */
  kisiEtiketi: (ad: string, rol: string, durum: string, etkinlik: string) => `${ad}, ${rol}, ${durum}: ${etkinlik}`,

  /** İpucunda ve erişilebilir adda görünen etkinlik */
  etkinlik: {
    yeniGeldi: "Ofise yeni geldi",
    yerlesiyor: "Masasına yerleşiyor",
    ayriliyor: "Ofisten ayrılıyor",
    tanisiyor: (ad: string) => `${ad} ile tanışıyor`,
    konusuyor: (ad: string) => `${ad} ile konuşuyor`,
    kanalaYaziyor: (kanal: string) => `#${kanal} kanalına yazıyor`,
    incelemeyeGoturuyor: (kod: string) => `${kod} incelemeye götürüyor`,
    birlesiyor: (kod: string) => `${kod} main'e birleşiyor`,
    arsiveNot: "Arşive not bırakıyor",
    soruSoruyor: (ad: string) => `${ad} ile soru soruyor`,
    toplantiyaGidiyor: "Toplantıya gidiyor",
    toplantida: "Toplantıda",
    masasindaCalisiyor: (is: string) => `Masasında çalışıyor${is ? ` · ${is}` : ""}`,
    masasinaGidiyor: "Masasına gidiyor",
    kurulBekliyor: "Kurul masasında kararınızı bekliyor",
    kahveIciyor: "Dinlenme alanında kahve içiyor",
    suIciyor: "Su içiyor",
    isBekliyor: "Dinlenme alanında, iş bekliyor",
    kapali: "Oturumu kapalı · masasında",
    duraklatildi: "Kurul tarafından duraklatıldı",
    hata: "Oturumda hata var",
    // İşe göre gidilen yerler
    panoda: "Görev panosunda",
    kisiyle: (ad: string) => `${ad} ile görüşüyor`,
    arsivde: "Arşivde notlara bakıyor",
    kurulda: "Kurul masasında",
    tahtada: "Beyaz tahtada rapor hazırlıyor",
    okumada: "Okuma köşesinde araştırıyor",
    sunucuda: "Sunucu odasında",
  },

  /** Konuşma balonları */
  balon: {
    hosGeldin: (ad: string) => `Hoş geldin, ${ad}! Masan hazır.`,
    tesekkurler: "Teşekkürler, başlıyorum.",
    incelemeyeHazir: (kod: string) => `${kod} incelemeye hazır`,
    bakiyorum: "Bakıyorum.",
    birlesti: (kod: string) => `${kod} main'e birleşti`,
    notAldi: (baslik: string) => `not aldı: ${baslik}`,
    yanitladim: "Yanıtladım.",
    yanitGelmedi: "Yanıt gelmedi.",
    tamam: (kod: string) => `${kod} tamam`,
    toplanti: (gundem: string) => `Toplantı: ${gundem}`,
    kurul: "Kurul",
    /** Balonda kod bloğunun yerine geçen kısa işaret */
    kod: "[kod]",
  },

  /** "Ofiste şimdi" satırları */
  akis: {
    yeniGorev: (kod: string, baslik: string) => `Yeni görev ${kod}: ${baslik}`,
    geldi: (ad: string, rol: string) => `${ad} ofise geldi · ${rol}`,
    kurulMasasinda: (ad: string) => `${ad} kurul masasında kararınızı bekliyor`,
    masasinaDondu: (ad: string) => `${ad} masasına döndü`,
    oturumHatasi: (ad: string) => `${ad}: oturumda hata`,
    ayrildi: (ad: string) => `${ad} ofisten ayrıldı`,
    kurulKanala: (kanal: string, metin: string) => `Kurul #${kanal}: ${metin}`,
    kuruldan: (adlar: string, metin: string) => `Kurul → ${adlar}: ${metin}`,
    toplanti: (ad: string, gundem: string, katilimcilar: string) => `Toplantı · ${ad}: ${gundem} · ${katilimcilar}`,
    toplantiMesaji: (ad: string, metin: string) => `Toplantı · ${ad}: ${metin}`,
    toplantiGorusYok: (ad: string) => `Toplantı · ${ad} görüş vermedi`,
    mesaj: (ad: string, alicilar: string, metin: string) => `${ad} → ${alicilar}: ${metin}`,
    kanalMesaji: (ad: string, kanal: string, metin: string) => `${ad} #${kanal}: ${metin}`,
    notAldi: (ad: string, baslik: string) => `${ad} not aldı: ${baslik}`,
    soru: (soran: string, sorulu: string, soru: string) => `${soran} → ${sorulu}: ${soru}`,
    yanitladi: (ad: string, yanit: string) => `${ad} yanıtladı: ${yanit}`,
    yanitVermedi: (soran: string, sorulu: string) => `${soran}: ${sorulu} yanıt vermedi`,
    gozetmen: (metin: string) => `Gözetmen: ${metin}`,
    incelemeyeHazir: (sahip: string, inceleyen: string, kod: string) => `${sahip} → ${inceleyen}: ${kod} incelemeye hazır`,
    incelemede: (kod: string) => `${kod} incelemede`,
    tamamlandi: (kod: string, ad: string | null) => `${kod} tamamlandı${ad ? ` · ${ad}` : ""}`,
    gorevDurumu: (kod: string, durum: string) => `${kod} → ${durum}`,
    adayKapida: (ad: string) => `Aday kapıda: ${ad}`,
    birlestirmeBekliyor: (baslik: string) => `${baslik}: kurul onayı bekliyor`,
    onay: (ad: string, baslik: string) => `${ad}: ${baslik}`,
    birlesti: (kod: string) => `${kod} main'e birleşti`,
    adayKabulEdilmedi: (ad: string) => (ad ? `Aday ${ad} kabul edilmedi` : "Aday kabul edilmedi"),
    onaylandi: (baslik: string) => `${baslik}: onaylandı`,
    reddedildi: (baslik: string) => `${baslik}: reddedildi`,
    suresiDoldu: (baslik: string) => `${baslik}: süresi doldu`,
  },
  /** Kaynağı belirsiz kayıtlarda */
  ekip: "Ekip",
  dal: "Dal",

  /** Ekran okuyucu özeti */
  ozet: (calisan: number, parcalar: string[], bekleyen: number) =>
    `Ofiste ${calisan} çalışan${parcalar.length ? `: ${parcalar.join(", ")}` : ""}. Kurul masasında ${bekleyen ? `${bekleyen} bekleyen onay` : "bekleyen onay yok"}.`,
};
