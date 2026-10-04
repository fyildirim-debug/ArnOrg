// Kalite kapısı (Türkçe): onaylı birleştirmenin sırası, testi ve sonucu; dalın farkı; proje ayarlarındaki komutlar
import type { BirlestirmeDurumu, DosyaDegisikligi } from "@arnorg/ortak";

/** "1 dk 42 sn" */
function sure(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  const dk = Math.floor(sn / 60);
  if (!dk) return `${sn} sn`;
  return sn % 60 ? `${dk} dk ${sn % 60} sn` : `${dk} dk`;
}

export const kalite = {
  /** Onaylanmış birleştirmenin durum satırı */
  durum: {
    kuyrukta: "Kuyrukta",
    hazirlik: "Hazırlanıyor",
    test: "Testler çalışıyor",
    birlesti: "Birleşti",
    cakisma: "Çakışma",
    test_basarisiz: "Testler geçmedi",
    zaman_asimi: "Zaman aşımı",
    hata: "Birleştirilemedi",
  } as Record<BirlestirmeDurumu, string>,
  sirada: (n: number) => `${n}. sırada`,
  testsizSirada: "testsiz birleştirilecek",
  denetleniyor: "dal ana dalla deneniyor",
  testGecti: (ms: number | null) => `testler geçti${ms ? ` · ${sure(ms)}` : ""}`,
  testYok: "test komutu yok, yalnız çakışma denetlendi",
  testsiz: "testsiz · kurul kararı",
  birlesmedi: "birleştirilmedi",
  sure,
  /** Başarısız işte dal sahibinin bilgilendirildiği */
  sahibeIletildi: (ad: string) => `${ad} çıktıyla birlikte uyarıldı; düzeltip yeniden isteyecek.`,
  deneme: (n: number) => `${n}. deneme`,

  cikti: "Test çıktısı",
  ciktiEtiket: (komut: string) => `${komut} çıktısının son satırları`,
  ciktiYok: "Henüz çıktı yok.",
  farkAc: "Farkı aç",
  yenidenDene: "Yeniden dene",
  yenidenDeneIpucu: "Kalite kapısından baştan geçirir",
  yineDeBirlestir: "Yine de birleştir",
  testsizUyari: (hedef: string) => `Testler geçmeden ${hedef} dalına girer ve kayda testsiz birleştirme olarak geçer. Kalite kapısı bu iş için atlanır.`,
  testsizBirlestir: "Testsiz birleştir",
  testsizBildirim: (dal: string) => `${dal} testsiz birleştirme için sıraya girdi.`,
  yenidenBildirim: (dal: string) => `${dal} kalite kapısından yeniden geçiyor.`,

  /** Bekleyen birleştirme onaylanırsa */
  etkiTestli: (dal: string, hedef: string, komut: string) =>
    `Sıraya girer; ${dal} temiz bir kopyada ${hedef} ile birleştirilip ${komut} koşar. Geçerse ${hedef} dalına birleştirilir ve incelemedeki görevler Tamam'a geçer; geçmezse birleşmez, dal sahibi uyarılır.`,
  etkiTestsiz: (dal: string, hedef: string) =>
    `Sıraya girer; çakışma yoksa ${dal} dalı ${hedef} dalına birleştirilir ve incelemedeki görevler Tamam'a geçer. Projede test komutu tanımlı değil; Projeler'deki ayarlardan eklenebilir.`,

  /** Dalın hedefe göre farkı (çekmece) */
  fark: {
    baslik: (dal: string, hedef: string) => `Fark · ${dal} → ${hedef}`,
    alinamadi: "Fark alınamadı",
    yok: "Fark yok",
    yokMetin: "Dal hedefle aynı; birleştirilecek değişiklik yok.",
    dosya: (n: number) => `${n} dosya`,
    kisaltildi: (n: number) => `Fark uzun; ilk ${n} satır gösteriliyor.`,
    degisiklik: { A: "eklendi", D: "silindi", M: "değişti", "?": "değişti" } as Record<DosyaDegisikligi, string>,
    dosyalar: "Değişen dosyalar",
  },

  /** Proje ayarları: kalite kapısının komutları */
  ayar: {
    baslik: "Kalite kapısı",
    test: "Test komutu",
    testYer: "npm test",
    hazirlik: "Hazırlık komutu",
    hazirlikYer: "npm ci",
    sure: "Süre sınırı",
    dk: "dk",
    ipucu:
      "Onaylı her birleştirme önce ana dalla birleşmiş temiz bir kopyada denenir: hazırlık, sonra test. Geçmeyen iş birleşmez. Test komutu boşsa yalnız çakışma denetlenir.",
    sureIpucu: "Hazırlık ve test bu sürede bitmezse süreç durdurulur. node_modules gibi yoksayılan dosyalar çalıştırmalar arasında korunur.",
    oneri: "package.json'da test betiği var:",
    oneriHazirlik: (komut: string) => `hazırlık ${komut}`,
    oneriKullan: "Doldur",
    sureGecersiz: "1 ile 240 dakika arasında bir tam sayı girin.",
    tekSatir: "Komut tek satır olmalı.",
    kaydedildi: (komut: string | null) => (komut ? `Kalite kapısı kaydedildi: birleştirmelerden önce ${komut} koşacak.` : "Kalite kapısı kaydedildi: test komutu yok, yalnız çakışma denetlenecek."),
  },
};
