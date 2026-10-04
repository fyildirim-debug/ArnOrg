// Hafıza (Türkçe)
import type { HafizaTuru, SoruDurumu } from "@arnorg/ortak";

export const hafiza = {
  baslik: "Hafıza",
  /** Alt başlık iki parça: arada .arnorg/hafiza/ yolu kod olarak durur */
  altBaslikOnce: "Yalnız bu projeye ait ·",
  altBaslikSonra: "· ajanlar her oturumda okur, çalışırken hatırlar",
  kayitEkle: "Kayıt ekle",
  turAciklamalari: {
    tercih: "Kurulun isteği, üslup, yasak. Her ajan her oturumda uyar.",
    karar: "Alınan karar ve gerekçesi.",
    ogrenilen: "Yaşanmış hata ve çözümü; aynı hata tekrarlanmasın.",
    olgu: "Projeye dair doğru bilgi: sürüm, yapı, komut.",
    uzmanlik: "Kim neyi biliyor; sorular ona yönlendirilir.",
    ozet: "Biten iş, devir notu.",
  } as Record<HafizaTuru, string>,
  ozetEtiketi: "Hafıza özeti",
  soruIpucu: "Ajanların birbirine sorduğu sorular",
  soruYanit: "Soru · yanıt",
  yanitBekliyor: (n: number) => `${n} yanıt bekliyor`,
  bolum: "Hafıza bölümü",
  sekmeKayitlar: "Kayıtlar",
  sekmeDefterler: "Defterler",
  sekmeSorular: "Sorular",
  yukleniyor: "Hafıza yükleniyor",

  /** Kayıt listesi ve süzgeçler */
  kayitlar: {
    etiket: "Hafıza kayıtları",
    araEtiket: "Hafızada ara",
    araYer: "Ara: karar, hata, dosya, kişi",
    tureGore: "Türe göre süz",
    eskiyenler: "Eskiyenleri göster",
    araniyor: "Aranıyor…",
    sonuc: (n: number) => `${n} sonuç`,
    eslesenYok: "Eşleşen kayıt yok",
    eslesenYokMetin: "Aramayı ya da tür süzgecini gevşetin.",
    bosBaslik: "Hafıza boş",
    ilkTercih: "İlk tercihi yaz",
    bosMetin:
      "Ajanlar karar aldıkça, hata çözdükçe ve iş bitirdikçe buraya yazar. Ekibin her zaman uymasını istediğiniz bir kuralı kurul tercihi olarak ekleyin; her ajan her oturumda okur.",
  },

  /** Birbirini tekrar eden kayıtlar */
  tekrar: {
    ciftSayisi: (n: number) => `${n} kayıt çifti birbirini tekrar ediyor.`,
    aciklama: "Aynı bilgi iki kez yazılınca ajanların bağlamı şişer; birini tutun.",
    ceoDuzenlesin: (ad: string) => `${ad} düzenlesin`,
    gozdenGecir: "Gözden geçir",
    benzerlik: "Sözcük benzerliği",
    bunuTut: "Bunu tut",
    ikisiDe: "İkisi de kalsın",
    tutuldu: (baslik: string) => `"${baslik}" kaldı; öteki eskidi ve artık hatırlatılmaz.`,
    ceoDuzenleyecek: (ad: string) => `${ad} hafızayı düzenleyecek.`,
    /** CEO'ya giden iş tarifi; liste her satırda bir kayıt çifti */
    ceoMesaji: (liste: string) =>
      `Hafızada birbirini tekrar eden kayıtlar var. Her çifte bak: aynı bilgiyse hafiza_birlestir ile ikisini birleştiren tek kayda indir; farklıysa olduğu gibi bırak. Bitince kısa bir özet yaz.\n${liste}`,
  },

  /** Tek kayıt satırı */
  kayit: {
    onem: (n: number) => `Önem ${n}/5`,
    herOturumda: " · her oturumda hatırlanır",
    eskidi: "Eskidi",
    yerineGecen: "Yerine geçen:",
    zamanIpucu: (yazildi: string, guncellendi: string) => `Yazıldı ${yazildi} · güncellendi ${guncellendi}`,
    silindi: "Kayıt silindi.",
    /** Silme uyarısı iki parça: arada .arnorg/hafiza/ yolu kod olarak durur */
    silUyariOnce: "Bu kayıt hafızadan ve",
    silUyariSonra: "yansısından silinir; ajanlar bir daha hatırlamaz. Bilgi değiştiyse silmek yerine düzenleyin.",
    duzenleEtiketi: (baslik: string) => `${baslik} kaydını düzenle`,
    silEtiketi: (baslik: string) => `${baslik} kaydını sil`,
  },

  /** Kayıt ekleme ve düzenleme formu */
  form: {
    baslikHata: "Kısa bir başlık yazın.",
    metinHata: "Ne, neden, nasıl: bir iki cümle yazın.",
    guncellendi: "Kayıt güncellendi.",
    yazildi: "Hafızaya yazıldı; ajanlar bir sonraki turlarında görür.",
    duzenleEtiketi: "Kaydı düzenle",
    yeniEtiketi: "Yeni hafıza kaydı",
    tur: "Kayıt türü",
    baslik: "Başlık",
    baslikOrnekTercih: "ör. Commit mesajları Türkçe",
    baslikOrnekOgrenilen: "ör. better-sqlite3 derleme hatası",
    baslikOrnek: "Kısa, aranabilir başlık",
    metin: "Metin",
    metinOrnekOgrenilen: "Belirti, neden, çözüm.",
    metinOrnek: "Ne, neden, nasıl. Ajanlar bunu her oturumda okur.",
    etiketler: "Etiketler",
    etiketlerOrnek: "virgülle: api, src/sunucu.ts",
    onem: "Önem",
    onemEnYuksek: "Her oturumda hatırlanır",
    onemEnDusuk: "Ayrıntı",
    hafizayaYaz: "Hafızaya yaz",
  },

  /** Ajan defterleri */
  defter: {
    ekipYok: "Ekip yok",
    ekipYokMetin: "İlk çalışan işe alınınca defteri burada görünür.",
    calisanlar: "Çalışanlar",
    ipucu: "Her çalışan turunun sonunda defterine ne yaptığını, ne kaldığını ve kime ne söz verdiğini yazar.",
    alinamadi: "Defter alınamadı.",
    kaydedildi: (ad: string) => `${ad} defteri kaydedildi.`,
    baslik: (ad: string) => `${ad} · defter`,
    guncellendi: (zaman: string) => `güncellendi ${zaman}`,
    etiket: (ad: string) => `${ad} defteri`,
    sayac: (n: number) => `${n} / 6000 · ajan bir sonraki oturumunda bu hâliyle okur`,
    bosBaslik: "Defter boş",
    bosMetin: (ad: string) => `${ad} ilk turunun sonunda açık işlerini ve verdiği sözleri buraya yazar.`,
  },

  /** Ajanlar arası sorular */
  soru: {
    suzgec: { bekliyor: "Bekleyen", yanitlandi: "Yanıtlanan", zaman_asimi: "Yanıtsız" } as Record<SoruDurumu, string>,
    durum: { bekliyor: "Bekliyor", yanitlandi: "Yanıtlandı", zaman_asimi: "Yanıtsız" } as Record<SoruDurumu, string>,
    saniye: (n: number) => `${n} sn`,
    dakika: (n: number) => `${n} dk`,
    saat: (n: number) => `${n} sa`,
    yokBaslik: "Henüz soru yok",
    yokMetin:
      "Bir çalışan bilmediği bir şeyi ekip arkadaşına ajana_sor ile sorduğunda soru ve yanıt burada görünür. Kime soracağını bilmeyenin sorusunu ArnOrg hafızaya ve geçmiş işlere bakıp uzmana yönlendirir; aynı soru yeniden sorulursa önceki yanıt hemen verilir.",
    etiket: "Ajanlar arası sorular",
    durumaGore: "Duruma göre süz",
    yanitladi: (sure: string) => `${sure} içinde yanıtladı`,
    yanitliyor: (sorulan: string, soran: string) => `${sorulan} yanıtlıyor; ${soran} bekliyor`,
    yanitsiz: (soran: string) => `Süre içinde yanıt gelmedi; ${soran} güvenli yolla devam etti.`,
  },
};
