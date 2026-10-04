// Onaylar (Türkçe)
import type { OnayDurumu, OnayTuru } from "@arnorg/ortak";
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
    birlestirme: (dal: string, hedef: string) => `${dal} dalı ${hedef} dalına birleştirilir; incelemedeki görevler Tamam'a geçer.`,
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
  },
  dosya: (n: number) => `${n} dosya`,
  rolVarsayilani: "rol varsayılanı",
  karakterOtomatik: "Otomatik · role göre seçilir",
  secenekIpucu: "Seçiminizi nota yazın; not ajana yanıt olarak gider.",
};
