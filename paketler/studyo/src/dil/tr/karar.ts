// Karar yetkisi (Türkçe): tam otonomda kararları CEO verir, kurul sonuçları görür; kurul kipinde onaylar kurula gelir
import { yonelme } from "../../yardimcilar/bicim";

/** "CEO Ada" ya da yalnız "CEO" */
const ceoAdi = (ad: string | null) => (ad ? `CEO ${ad}` : "CEO");

export const karar = {
  /** Proje ayarlarındaki seçim */
  ayar: {
    baslik: "Karar yetkisi",
    ceo: "CEO karar verir · tam otonom",
    ceoAciklama: "İzinler, birleştirmeler ve işe alımlar CEO'dan geçer; siz sonuçları görürsünüz.",
    kurul: "Kurul karar verir",
    kurulAciklama: "Onaylar size gelir; otomatik onayda seçtiğiniz türler kendiliğinden verilir.",
    ipucu: "CEO size yalnız insanın yapabileceği şeyler için sorar: giriş bilgisi, ödeme, dış hesap, geri alınamaz işler. Bekleyen bir onaya her zaman siz de karar verebilirsiniz.",
    otoNotu: "Otomatik onay bu kipte kullanılmaz; kurul karar verince yeniden geçerli olur.",
    ceoYok: "Projede CEO yok; onaylar yine size gelir.",
  },
  /** Kip değişince kısa bildirim */
  ceoyaGecti: (ceo: string | null) => `Karar yetkisi ${ceo ? `CEO ${yonelme(ceo)}` : "CEO'ya"} geçti: şirket tam otonom.`,
  kurulaGecti: "Karar yetkisi sizde: onaylar size gelecek.",

  /** Onaylar ekranının başındaki şerit */
  serit: {
    etiket: "Karar yetkisi",
    otonom: "Tam otonom",
    otonomBaslik: (ceo: string | null) => `Kararları ${ceoAdi(ceo)} veriyor`,
    otonomMetin: "İzinler, birleştirmeler, işe alımlar ve teslimler CEO'dan geçer; her karar gerekçesiyle aşağıda. Bekleyen bir onaya siz de karar verebilirsiniz.",
    kurul: "Kurul",
    kurulBaslik: "Kararları siz veriyorsunuz",
    kurulMetin: "Onaylar size gelir. CEO'ya bırakırsanız şirket tam otonom ilerler, siz sonuçları görürsünüz.",
    kurulaAl: "Kararları ben vereyim",
    ceoyaBirak: "CEO'ya bırak",
  },
  /** Tam otonomda Onaylar ekranının alt başlığı ve boş durumları */
  altBaslik: "Şirketin kararları ve gerekçeleri",
  bekleyenYokMetin: "Çalışanların istekleri CEO'ya gider; CEO karar verirken burada görünür.",
  gecmisYokMetin: "CEO'nun ve sizin kararlarınız gerekçeleriyle burada birikir.",

  /** Sonuçlanan onayda kararı veren */
  veren: {
    etiket: "Kararı veren",
    ceo: (ad: string | null) => (ad ? `CEO · ${ad}` : "CEO"),
    kurul: "Kurul",
    otomatik: "Otomatik",
    zamanAsimi: "Süre doldu",
  },
  gerekce: (metin: string) => `Gerekçe: ${metin}`,

  /** Bekleyen onay CEO'nun kararında */
  bekliyor: (ceo: string | null) => `${ceoAdi(ceo)} karar veriyor`,
  bekliyorIpucu: "Gerekirse siz karar verin; kararınız CEO'nunkinin yerine geçer.",
  /** Karargâh: kurulu bekleyen onay yokken */
  ceoKararVeriyor: (n: number) => `CEO ${n} onaya karar veriyor`,

  /** CEO'nun kabul ettiği teslim: bilgi penceresi ve test paneli */
  teslimSonucu: (ceo: string | null) => `${ceoAdi(ceo)} kabul etti; sonuç olarak size iletildi.`,
  geriBildirimYaz: "Geri bildirim yaz",
};
