// Kalite denetimi (Türkçe): 0.0.7'den kalan birleştirmelerin kalite kapısı satırı (geçmişte okunur), fark çekmecesi,
// proje ayarlarındaki komutlar. Görev kayıtlarının denetimi ortakCalisma.ts'te
import type { BirlestirmeDurumu, DosyaDegisikligi } from "@arnorg/ortak";

/** "1 dk 42 sn" */
function sure(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  const dk = Math.floor(sn / 60);
  if (!dk) return `${sn} sn`;
  return sn % 60 ? `${dk} dk ${sn % 60} sn` : `${dk} dk`;
}

export const kalite = {
  /** Eski birleştirmenin kalite kapısı satırı */
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
  deneme: (n: number) => `${n}. deneme`,

  cikti: "Test çıktısı",
  ciktiEtiket: (komut: string) => `${komut} çıktısının son satırları`,
  ciktiYok: "Henüz çıktı yok.",
  farkAc: "Farkı aç",

  /** 0.0.7'den kalan bekleyen birleştirme isteği */
  etkiEski:
    "0.0.7'den kalan bir birleştirme isteği. ArnOrg 0.0.8'de birleştirme yok: ekip ortak projede çalışır, görev 'inceleme'ye geçince ArnOrg dosyalarını commit'ler. Kararınız yalnız kayda geçer.",

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

  /** Proje ayarları: görev kayıtlarının kalite denetimi */
  ayar: {
    baslik: "Kalite denetimi",
    test: "Test komutu",
    testYer: "npm test",
    hazirlik: "Hazırlık komutu",
    hazirlikYer: "npm ci",
    sure: "Süre sınırı",
    dk: "dk",
    ipucu:
      "ArnOrg her görev kaydından sonra o commit'i ayrı, temiz bir kopyada arka planda dener: önce hazırlık, sonra test. Ekip beklemez; geçmeyen görev çıktıyla sahibine döner. Test komutu boşsa kayıtlar testsiz kalır.",
    sureIpucu: "Hazırlık ve test bu sürede bitmezse süreç durdurulur. node_modules gibi yoksayılan dosyalar çalıştırmalar arasında korunur.",
    oneri: "package.json'da test betiği var:",
    oneriHazirlik: (komut: string) => `hazırlık ${komut}`,
    oneriKullan: "Doldur",
    sureGecersiz: "1 ile 240 dakika arasında bir tam sayı girin.",
    tekSatir: "Komut tek satır olmalı.",
    kaydedildi: (komut: string | null) =>
      komut ? `Kalite denetimi kaydedildi: her görev kaydından sonra ${komut} koşacak.` : "Kalite denetimi kaydedildi: test komutu yok, kayıtlar testsiz kalacak.",
  },
};
