// Mesaj ekleri (Türkçe): yazma alanında ekle düğmesi, sürükle-bırak ve yapıştırma, gönderilmeden önceki ek çipleri,
// mesajdaki görseller (ızgara, ışık kutusu) ve dosya kartları
export const ekler = {
  /** Yazma alanı */
  ekle: "Dosya ekle",
  ekleIpucu: "Görsel, PDF ya da metin dosyası ekleyin; panodan görsel yapıştırabilir, sürükleyip bırakabilirsiniz",
  /** Yazma alanının altındaki kısa ipucu (Enter ipucunun yanında) */
  ipucu: "görsel yapıştırın ya da dosya sürükleyin",
  birak: "Bırakın, mesaja eklensin",
  birakAlt: (mb: number) => `Görsel, PDF, metin ve kod · dosya başına en çok ${mb} MB`,
  ciplerEtiketi: "Gönderilecek ekler",
  kaldir: (ad: string) => `${ad} ekini kaldır`,
  yenidenDene: (ad: string) => `${ad} dosyasını yeniden yükle`,
  yukleniyor: "Yükleniyor",
  yuklemeOrani: (ad: string, yuzde: number) => `${ad} yükleniyor: %${yuzde}`,
  yuklenemedi: "Yüklenemedi",
  cokBuyuk: (mb: number) => `${mb} MB'tan büyük`,
  bos: "Dosya boş",
  enCok: (n: number) => `Bir mesaja en çok ${n} ek eklenebilir.`,
  bekliyor: "Ekler yüklenince gönderebilirsiniz",
  hataliVar: "Yüklenemeyen eki kaldırın ya da yeniden deneyin",
  /** Panodan yapıştırılan adsız görselin adı (uzantısız): ekran-goruntusu-14-32-05 */
  yapistirilan: "ekran-goruntusu",

  /** Mesajdaki ekler */
  etiket: "Ekler",
  gorselAc: (ad: string) => `${ad} görselini büyüt`,
  gorselAlinamadi: "Görsel alınamadı",
  yenidenAl: "Yeniden dene",
  dahaFazla: (n: number) => `+${n}`,
  dahaFazlaEtiket: (n: number) => `${n} görsel daha`,
  ac: "Aç",
  acIpucu: (ad: string) => `${ad} dosyasını yeni sekmede aç`,
  indir: "İndir",
  indirIpucu: (ad: string) => `${ad} dosyasını indir`,
  kaydet: "Kaydet",
  kaydetIpucu: (ad: string) => `${ad} dosyasını kaydet`,
  acilamadi: "Dosya açılamadı.",
  /** Kart ve akıştaki tür adları */
  turler: { gorsel: "Görsel", pdf: "PDF", metin: "Metin", kod: "Kod", veri: "Veri" },
  /** Karargâh akışında ekin özeti: "ekran.png", "ekran.png +2" */
  ozet: (ad: string, kalan: number) => (kalan > 0 ? `${ad} +${kalan}` : ad),
  ekSayisi: (n: number) => `${n} ek`,

  /** Işık kutusu */
  isik: {
    etiket: (ad: string) => `Görsel: ${ad}`,
    kapat: "Kapat (Esc)",
    onceki: "Önceki görsel (←)",
    sonraki: "Sonraki görsel (→)",
    sira: (i: number, n: number) => `${i} / ${n}`,
    gercekBoyut: "Gerçek boyut",
    sigdir: "Ekrana sığdır",
    indir: "İndir",
  },
};
