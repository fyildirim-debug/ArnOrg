// Ortak bileşenler: durumlar, çekmece, kullanım, kişi, karakter seçici, görev dağılımı, ekip tablosu (Türkçe)
export const bilesenler = {
  durumlar: {
    /** İskeletin ekran okuyucu etiketi */
    yukleniyor: "Yükleniyor",
    yuklenemedi: "Yüklenemedi",
  },
  kisi: {
    /** Kurulun (kullanıcının) avatarında baş harfi kullanılır */
    siz: "Siz",
  },
  anmaOneri: "Anılacak ajan",
  gorevDagilimi: (ozet: string) => `Görev dağılımı: ${ozet}`,
  ekipTablosu: {
    calisan: "Çalışan",
    durum: "Durum",
    suAn: "Şu an",
    bugunkuKullanim: "Bugünkü kullanım",
    pay: (oran: number) => `Ekipte en çok kullananın yüzde ${oran} kadarı`,
  },
  kullanim: {
    /** Pencere adları türe göre; model pencereleri "Haftalık · <model>" */
    pencere: {
      bes_saat: "5 saatlik pencere",
      haftalik: "Haftalık",
      haftalik_opus: "Haftalık · Opus",
      haftalik_sonnet: "Haftalık · Sonnet",
    },
    haftalikModel: (model: string) => `Haftalık · ${model}`,
    besSaatKisa: "5 sa",
    haftaKisa: "Hafta",
    sinirBaslik: (pencere: string, yuzde: string, saat: string | null) =>
      `Kullanım sınırda: ${pencere} ${yuzde}. Ajanlar ${saat ?? "pencere açılınca"} sürecek.`,
    abonelikBaslik: "Claude aboneliği: planın 5 saatlik ve haftalık pencereleri sayılır",
    cubuk: (pencere: string, yuzde: number) => `${pencere} yüzde ${yuzde}`,
    bugun: "Bugün",
    toplam: "Toplam",
    girisUyarisi: "Giriş uyarısı",
    claudeAboneligi: "Claude aboneliği",
    yenidenSor: "Claude Code'a yeniden sor",
    sinirUyari: (pencere: string, yuzde: string, sinir: string, zaman: string | null) =>
      `${pencere} ${yuzde}, sınır ${sinir}. Ajanlar durdu; ${zaman ? `${zaman} sürecekler` : "pencere açılınca sürecekler"}.`,
    sifirlanma: (zaman: string) => `Sıfırlanma ${zaman}`,
    okunamadi: (hata: string | null) => `Kullanım okunamadı: ${hata ?? "bilinmeyen hata"}`,
    pencereYok: "Bu girişte plan pencereleri yok.",
    pencereBekleniyor: "Pencereler ilk ajan çalışınca ya da Yenile ile okunur.",
    ajanBasina: "Bugün ajan başına token",
    not: "Ajanlar Claude aboneliğinizle çalışır. Token; girdi, çıktı ve önbelleğe yazılanın toplamıdır (önbellekten okuma hariç).",
  },
  karakter: {
    yukleniyor: "Karakterler yükleniyor…",
    otomatik: "Otomatik",
    otomatikSecim: "otomatik seçim",
    kullaniyor: (kim: string) => `${kim} kullanıyor`,
    suAnKullaniyor: (kim: string) => `şu an ${kim} kullanıyor`,
    /** Otomatik düğmesindeki iki satır */
    otoKisa: "Oto",
    rolKisa: "rol",
    otomatikIpucu: (karakter: string | null) => `Otomatik: role uyan boş karakter${karakter ? ` (şimdilik ${karakter})` : ""}`,
    kisilik: (lakap: string) => `${lakap} kişiliği`,
    uslup: "Üslup",
    calisma: "Çalışma",
    ofiste: "Ofiste",
    enCok: (yer: string) => `En çok ${yer}`,
    yerler: {
      kahve: "kahve makinesinin başı",
      kanepe: "kanepe",
      kitaplik: "kitaplık",
      bitki: "bitkilerin yanı",
      "beyaz-tahta": "beyaz tahta",
      sunucu: "sunucu odası",
      su: "su sebili",
      pencere: "pencere önü",
      "masa-tenisi": "masa tenisi",
      otomat: "atıştırmalık otomatı",
    },
  },
  /** Araç çağrısı özetleri (yardimcilar/arac) */
  arac: {
    arac: "araç",
    yapilacaklar: (n: number) => `${n} maddelik yapılacaklar listesi`,
    uzman: "uzman",
    defterGuncellendi: "defterini güncelledi",
    defteri: (ajan: string) => `${ajan} defteri`,
    kendiDefteri: "kendi defteri",
    gecersizDesen: "Geçersiz düzenli ifade",
  },
};
