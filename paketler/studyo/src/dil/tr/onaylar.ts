// Onaylar (Türkçe)
import type { AnayasaKurali, OnayDurumu, OnayTuru } from "@arnorg/ortak";
import { yonelme } from "../../yardimcilar/bicim";

export const onaylar = {
  baslik: "Onaylar",
  altBaslik: "İşe alım, main'e birleştirme ve geri alınamaz kararlar sizden geçer",
  tureGore: "Türe göre süz",
  butunTurler: "Bütün türler",
  durum: {
    bekliyor: "Bekliyor",
    onaylandi: "Onaylandı",
    reddedildi: "Reddedildi",
    zaman_asimi: "Süre doldu",
  } as Record<OnayDurumu, string>,
  alinamadi: "Onaylar alınamadı.",

  /** Bekleyenler bölümü */
  bekleyenler: "Bekleyen kararlar",
  bekleyenYok: "Bekleyen karar yok",
  bekleyenYokMetin: "CEO işe alım teklif ettiğinde, bir iş main'e girmeye hazır olduğunda burada karar verirsiniz.",
  turdeBekleyenYok: "Bu türde bekleyen karar yok",

  /** Geçmiş bölümü */
  gecmis: "Geçmiş",
  sonucaGore: "Sonuca göre süz",
  gecmisYok: "Henüz sonuçlanan onay yok",
  gecmisYokMetin: "Verdiğiniz kararlar notlarınızla birlikte burada birikir.",
  suzgecteYok: "Bu süzgeçte onay yok",
  suzgeciDegistirin: "Süzgeci değiştirin.",
  dahaGoster: (n: number) => `${n} onay daha göster`,

  /** Tek onay: kim istiyor, ne kadar süresi kaldı */
  kim: {
    ise_alim: "Teklif eden",
    birlestirme: "İsteyen",
    genel: "Soran",
    arac: "İsteyen",
    anayasa: "Öneren",
    isten_cikarma: "Teklif eden",
    teslim: "Teslim eden",
  } as Record<OnayTuru, string>,
  bilinmeyenAjan: "Bilinmeyen ajan",
  oturumunuAc: (ad: string) => `${ad} oturumunu aç`,
  sureYok: "Süre sınırı yok",
  kaldi: (sure: string) => `${sure} kaldı`,
  sureDoldu: "Süre doldu · reddedilecek",
  sureIpucu: "Süre dolunca kendiliğinden reddedilir",

  /** Karar verilince ne olur */
  sonra: {
    ise_alim: "Onaylanırsa",
    birlestirme: "Onaylanırsa",
    genel: "Onaylanırsa",
    arac: "İzin verilirse",
    anayasa: "Onaylanırsa",
    isten_cikarma: "Onaylanırsa",
    teslim: "Kabul edilirse",
  } as Record<OnayTuru, string>,
  etki: {
    /** yonetici null: doğrudan kurula bağlanır */
    iseAlim: (ad: string, rol: string, yonetici: string | null) =>
      `${ad}, ${rol} olarak ekibe katılır ve ${yonetici ? yonelme(yonetici) : "doğrudan kurula"} bağlanır; çalışma alanı hazırlanır.`,
    genel: (ajan: string) => `${ajan} kararınızı alır ve buna göre ilerler; notunuz yanıt olarak iletilir.`,
    arac: (ajan: string, arac: string) => `${ajan} bu ${arac} çağrısını çalıştırır.`,
    anayasa: (madde: number) => `Ana yasa ${madde} maddeyle yürürlüğe girer; CEO dahil herkes uyar, makine kuralları denetim kapısında uygulanır.`,
    istenCikarma: (ad: string, devralan: string | null) =>
      `${ad} ekipten ayrılır; açık işleri ve bildikleri ${devralan ? yonelme(devralan) : "yöneticisine"} devredilir.`,
    teslim: (ajan: string) => `Teslim kabul edilir ve hafızaya yazılır. Reddedip not yazarsanız notunuz ${yonelme(ajan)} iş olarak döner.`,
    sureli: "Süre dolarsa kendiliğinden reddedilir.",
  },

  /** Karar düğmeleri: onay düğmesi yaptığı işi adlandırır */
  fiil: {
    ise_alim: "İşe al",
    birlestirme: "Birleştir",
    genel: "Onayla",
    arac: "İzin ver",
    anayasa: "Yürürlüğe koy",
    isten_cikarma: "İşten çıkar",
    teslim: "Kabul et",
  } as Record<OnayTuru, string>,
  notEkle: "Not ekle",
  notEtiketi: "Karar notu (isteğe bağlı)",
  notYer: "Not (isteğe bağlı) · ajana iletilir",
  kararBildirimi: (baslik: string, onaylandi: boolean) => `${baslik}: ${onaylandi ? "onaylandı" : "reddedildi"}.`,
  denetimdeKararVer: "Denetimde karar ver",
  not: (not: string) => `Not: ${not}`,

  /** Türe göre ayrıntı alanları; anahtarlar onay verisinin alanlarıdır */
  alan: {
    ad: "Ad",
    aday: "Aday",
    rol: "Rol",
    model: "Model",
    yoneticiId: "Yönetici",
    yoneticiAd: "Yönetici",
    karakter: "Karakter",
    talimatEki: "Ek talimat",
    gerekce: "Gerekçe",
    ajanId: "Ajan",
    isteyenId: "İsteyen",
    dalSahibi: "Dal sahibi",
    gorevId: "Görev",
    dal: "Dal",
    hedefDal: "Hedef dal",
    degisiklik: "Değişiklik",
    dosyaSayisi: "Dosya",
    eklenen: "Eklenen satır",
    silinen: "Silinen satır",
    testler: "Testler",
    ozet: "Özet",
    soru: "Soru",
    secenekler: "Seçenekler",
    arac: "Araç",
    komut: "Komut",
    girdi: "Girdi",
    kural: "Kural",
    aracKimligi: "Çağrı kimliği",
    maddeler: "Maddeler",
    ayrilan: "Ayrılacak",
    devralanId: "Devralan",
    testAdimlari: "Test adımları",
    calistir: "Çalıştır",
    adres: "Adres",
    baslik: "Başlık",
  },
  dosya: (n: number) => `${n} dosya`,
  rolVarsayilani: "rol varsayılanı",
  karakterOtomatik: "Otomatik · role göre seçilir",

  /** Ana yasa önerisi: maddeler ve denetim kapısında uygulanan makine kuralları */
  anayasa: {
    kural: "Makine kuralı",
    hedefEtiketi: "Hedef",
    hedef: { komut: "Komut", yol: "Dosya yolu", url: "Adres", arac: "Araç" } as Record<AnayasaKurali["hedef"], string>,
    desen: (_n: number) => "Desen",
    kararEtiketi: "Karar",
    karar: { ret: "Reddedilir", sor: "Kurula sorulur" } as Record<AnayasaKurali["karar"], string>,
    yalnizTalimat: "Talimat · makine kuralı yok",
  },
  /** İşten çıkarma: devralan belirtilmemişse */
  devralanYok: "Yöneticisi devralır",

  /** Görev token tavanı (Karar türünün alt türü): görev tavanı aştı, ajan durdu; sürmesi kurula soruluyor */
  tokenTavani: {
    tur: "Token tavanı",
    kim: "Durdurulan",
    kullanim: "Kullanım",
    gerekce: (ajan: string, gorev: string | null) => `${ajan}${gorev ? `, ${gorev} görevinde` : ""} token tavanını aştı ve durdu; sürmesi için kararınızı bekliyor.`,
    yeniTavan: (n: string) => `sürerse yeni tavan ${n}`,
    olcer: (islenen: string, tavan: string, yeni: string) => `${islenen} işlendi, tavan ${tavan}; sürerse yeni tavan ${yeni}`,
    sonra: "Sürdürürseniz",
    etki: (ajan: string, yeni: string, yonetici: string | null) =>
      `Görevin tavanı ${yeni} olur ve ${ajan} kaldığı yerden sürer. Durdurursanız ${ajan} durur${yonetici ? `; ${yonetici} görevi bölmesi ya da yeniden planlaması için uyarılır` : ""}.`,
    surdur: "Sürdür",
    durdur: "Durdur",
  },

  /** Otomatik onay: seçili türdeki onaylar kendiliğinden verilir, kayıt yine tutulur */
  oto: {
    etiket: "Otomatik onay",
    ipucuKapali: (n: number) =>
      n ? `İşaretlerseniz kapsamdaki ${n} bekleyen onay hemen verilir.` : "İşaretlerseniz kapsamdaki onaylar kendiliğinden verilir.",
    ipucuAcik: "Kapsamdaki onaylar kendiliğinden veriliyor.",
    kapsam: "Kapsam",
    kapsamSayisi: (n: number, toplam: number) => `${n}/${toplam}`,
    kapsamEtiketi: "Kendiliğinden onaylanacak türler",
    turAciklama: {
      arac: "Komut, dosya ve ağ çağrıları",
      ise_alim: "CEO'nun kadro teklifleri",
      birlestirme: "İncelenmiş dalın çalışma dalına girmesi",
      genel: "Kurula sorulan sorular",
      anayasa: "Ana yasa önerileri",
      isten_cikarma: "Ekipten çıkarma teklifleri",
      teslim: "Biten işin kabulü",
    } as Record<OnayTuru, string>,
    aciklama: "Birleştirme, soru ve teslim sizin kararınızı ister; bu yüzden varsayılan olarak kapsam dışıdır.",
    varsayilan: "Varsayılana dön",
    /** turler: dile göre birleştirilmiş tür adları ("İşe alım, Birleştirme ve Ana yasa") */
    uyari: (turler: string) => `Otomatik onay açık: ${turler} onayları kendiliğinden veriliyor. Her biri Geçmiş'te kayıtlı.`,
    uyariBos: "Otomatik onay açık ama kapsam boş; hiçbir onay kendiliğinden verilmiyor.",
    kapat: "Otomatik onayı kapat",
    acildi: (n: number) =>
      n ? `Otomatik onay açık. Kapsamdaki ${n} bekleyen onay hemen veriliyor.` : "Otomatik onay açık. Kapsamdaki yeni onaylar kendiliğinden verilecek.",
    kapandi: "Otomatik onay kapandı. Onaylar yine sizi bekler.",
    kapsamGuncellendi: "Otomatik onay kapsamı güncellendi.",
  },
};
