// Ortak çalışma (Türkçe, 0.0.8): ekip temposu, kim ne üzerinde, dosya kiraları, görev kayıtları ve kalite denetimi,
// geçişten kalan eski alanlar
import type { EskiCalismaAlani, KayitKaliteDurumu, KayitNedeni } from "@arnorg/ortak";
import { yonelme } from "../../yardimcilar/bicim";

/** "1 dk 42 sn" */
function sure(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  const dk = Math.floor(sn / 60);
  if (!dk) return `${sn} sn`;
  return sn % 60 ? `${dk} dk ${sn % 60} sn` : `${dk} dk`;
}

export const ortakCalisma = {
  baslik: "Ortak çalışma",
  /** Başlığın yanındaki özet: "main dalı · 3 çalışıyor · 1 sırada" */
  ozet: (dal: string, calisan: number, sirada: number) => `${dal} dalı · ${calisan} çalışıyor${sirada ? ` · ${sirada} sırada` : ""}`,
  alinamadi: "Ortak çalışma bilgisi alınamadı.",

  /** Ekip temposu: aynı anda kaç çalışan çalışır */
  tempo: {
    etiket: "Ekip temposu",
    sinirsiz: "Sınırsız",
    ustSinir: (n: number) => `üst sınır ${n}`,
    /** 0.0.10 · Projenin kullanım seviyesinin sınırı (Normal 6, Tasarruflu 3) */
    seviyeSiniri: (n: number) => `seviye sınırı ${n}`,
    /** Sayının yanındaki birim */
    birim: (_n: number) => "kişi",
    ceoBelirledi: (ad: string, zaman: string) => `${ad} belirledi · ${zaman}`,
    ceoBelirlemedi: (ad: string) => `${ad} henüz belirlemedi; kurulun üst sınırı geçerli`,
    ceoYok: "CEO yok; kurulun üst sınırı geçerli",
    kurulda: "Karar yetkisi kurulda; kurulun üst sınırı geçerli",
    /** Yuvaların erişilebilir açıklaması */
    yuvalar: (calisan: number, tempo: number, ust: number) =>
      `${calisan} çalışan; tempo ${tempo} kişi${ust ? `, kurulun üst sınırı ${ust}` : ""}`,
    aciklamaCeo: "Aynı anda kaç çalışanın çalışacağına CEO karar verir; kurulun üst sınırını geçemez. CEO bu sayıya girmez.",
    aciklamaKurul: "Aynı anda en çok bu kadar çalışan çalışır; CEO bu sayıya girmez.",
    ustSiniriDegistir: "Üst sınırı değiştir",
  },

  /** Kim ne üzerinde: görev ve kiralanan dosyalar */
  ekip: {
    baslik: "Kim ne üzerinde",
    bos: "Ekipte CEO'dan başka çalışan yok.",
    kira: (n: number) => `${n} dosya kirada`,
    /** Satırdaki kısa hâli */
    kiraKisa: (n: number) => `${n} dosya`,
    kiraYok: "Kirada dosya yok",
    kiraIpucu: "Görevi kaydedilene dek bu dosyaları başkası düzenleyemez",
    dosyalar: (ad: string) => `${ad} kiraladığı dosyalar`,
    sonDokunus: (zaman: string) => `son dokunuş ${zaman}`,
  },

  /** 0.0.8 geçişinde ortak projeye alınamayıp korunan eski alanlar */
  kalanlar: {
    baslik: (n: number) => `0.0.8 geçişinden kalan ${n} eski çalışma alanı`,
    aciklama:
      "Bu alanlar ortak projeye kendiliğinden alınamadı; içlerindeki iş korunuyor, hiçbir şey silinmedi. Gerekeni ortak projeye elle taşıyın ya da işi yeniden planlayın.",
    neden: { kirli: "Kaydedilmemiş değişiklik", cakisma: "Çakışma", hata: "Alınamadı" } as Record<EskiCalismaAlani["neden"], string>,
  },

  /** Görev kayıtları: ArnOrg'un görev başına commit'leri ve kalite denetimi */
  kayit: {
    baslik: "Son kayıtlar",
    aciklama: "ArnOrg her görevin dosyalarını çalışma dalına ayrı bir commit olarak kaydeder; testler o commit'te arka planda koşar.",
    yok: "Henüz kayıt yok",
    yokMetin: "Bir görev 'inceleme'ye geçince ya da çalışan isi_kaydet deyince ArnOrg görevin dosyalarını commit'ler; kayıt burada görünür.",
    dosya: (n: number) => `${n} dosya`,
    neden: { inceleme: "incelemeye alındı", tamam: "tamamlandı", ara: "ara kayıt", gecis: "0.0.8 geçişi" } as Record<KayitNedeni, string>,
    fark: "Fark",
    farkBaslik: (kod: string, commit: string) => `Fark · ${kod} · ${commit}`,
    farkYok: "Bu kayıtta değişiklik yok.",
    cikti: "Çıktı",
    ciktiEtiket: (komut: string) => `${komut} çıktısının son satırları`,
    yenidenDene: "Yeniden dene",
    yenidenDeneIpucu: "Bu kaydın testlerini yeniden koşar",
    yenidenBildirim: (kod: string) => `${kod} kaydının testleri yeniden koşuyor.`,
    dahaGoster: (n: number) => `${n} kayıt daha`,
    sirada: (n: number) => `${n}. sırada`,
    gecti: (ms: number | null) => `testler geçti${ms ? ` · ${sure(ms)}` : ""}`,
    testsiz: "projede test komutu yok",
    atlandi: "daha yeni kayıtların denetimi bunu da kapsıyor",
    sahibeIletildi: (ad: string) => `Çıktı ${yonelme(ad)} iletildi; düzeltme onun görevinde.`,
    kirmizi: (kod: string | null) => `Dal ${kod ? `${kod} kaydından` : "önceki bir kayıttan"} beri kırmızı; düzeltme orada sürüyor.`,
  },

  /** Kaydın kalite denetimi durumları */
  kalite: {
    kuyrukta: "Kuyrukta",
    hazirlik: "Hazırlanıyor",
    test: "Testler çalışıyor",
    gecti: "Geçti",
    kaldi: "Geçmedi",
    zaman_asimi: "Zaman aşımı",
    hata: "Denetlenemedi",
    testsiz: "Testsiz",
    atlandi: "Atlandı",
  } as Record<KayitKaliteDurumu, string>,

  /** Görev çekmecesindeki kayıtlar */
  gorev: {
    baslik: "Kayıtlar",
    yok: "Bu görev henüz kaydedilmedi; 'inceleme'ye geçince ArnOrg dosyalarını commit'ler.",
  },

  /** Ajan ayrıntısındaki satırlar */
  ajan: {
    calistigiYer: "Çalıştığı yer",
    ortakProje: "Ortak proje",
    kiraladigi: "Kiraladığı dosyalar",
    yok: "Yok",
    dahaFazla: (n: number) => `ve ${n} dosya daha`,
    eskiAlan: "Eski çalışma alanı",
  },

  /** Ofis sahnesi: kaydın kalite denetimi laboratuvarda (kayıt anı canli.ofis.akis.kaydedildi) */
  ofis: {
    testKosuyor: (kod: string) => `${kod} kaydı: testler koşuyor`,
    testGecmedi: (kod: string) => `${kod} kaydı testten geçmedi`,
  },
  /** Canlı akış rayı */
  ray: {
    kaydedildi: "Görev kaydedildi",
    gecmedi: "Testler geçmedi",
  },
};
