// Karargâh: CEO ile bire bir sohbet, kanallardan canlı akış, kurula açılır pencereler, teslim testi (Türkçe)
import type { KurulBildirimTuru } from "@arnorg/ortak";
import { yonelme } from "../../yardimcilar/bicim";

export const sohbet = {
  /** Yanıt hazırlayanlar: "Ada yazıyor", "Ada ve Kerem yazıyor", "Ada, Kerem ve 2 kişi daha yazıyor" */
  yaziyor: (adlar: string[]) =>
    adlar.length <= 1
      ? `${adlar[0] ?? "Biri"} yazıyor`
      : adlar.length === 2
        ? `${adlar[0]} ve ${adlar[1]} yazıyor`
        : `${adlar[0]}, ${adlar[1]} ve ${adlar.length - 2} kişi daha yazıyor`,
  /** Kanal akışında; kanal görünen adıyla (# olmadan) */
  kanaldaYaziyor: (ad: string, kanal: string) => `${ad} #${kanal} kanalında yazıyor`,
  yeniMesaj: (n: number) => `${n} yeni mesaj`,
  enAlta: "En yeni mesaja in",

  ceo: {
    baslik: "CEO ile",
    etiket: "CEO ile bire bir sohbet",
    /** Kanal görünen adıyla: "#yonetim · bire bir" */
    kanal: (kanal: string) => `#${kanal} · bire bir`,
    yer: (ad: string) => `${yonelme(ad)} yazın…`,
    yazEtiketi: (ad: string) => `${yonelme(ad)} mesaj yazın`,
    ipucu: "Enter gönderir · Shift+Enter yeni satır",
    bos: (ad: string) => `${ad} ile henüz konuşmadınız`,
    bosMetin:
      "Burası yalnız sizinle CEO arasında. Hedefi, önceliği ya da sorunuzu düz metinle yazın; CEO yanıtını buraya yazar, işi kanallardan ekibe dağıtır.",
    ceoYok: "CEO yok",
    ceoYokMetin: "Bu projede CEO ajanı yok. Ekip ekranından CEO rolüyle birini işe alın; sohbet burada açılır.",
    alinamadi: "Sohbet alınamadı.",
    siz: "Siz",
    yanit: (baslik: string) => `Yanıtlanıyor · ${baslik}`,
    yanitKaldir: "Yanıtlanan konuyu kaldır",
  },

  hazirlik: {
    etiket: "Hazırlık",
    baslik: "Hazırlık görüşmesi bekliyor",
    metin: (ad: string) =>
      `${ad} işe başlamadan önce projenin amacını, kurallarını ve ilk ekibi sizinle konuşmak istiyor. Görüşme bu sohbette, her seferinde tek soruyla olur; sonunda ana yasa önerisi onayınıza gelir.`,
    baslat: "Hazırlık görüşmesini başlat",
    atla: "Atla",
    atlaIpucu: "Görüşmeden işe başlanır; CEO'ya istediğiniz an buradan yazabilirsiniz.",
    suruyor: (ad: string) => `Hazırlık görüşmesi sürüyor: ${ad} soruyor, siz yanıtlıyorsunuz. Sonunda ana yasa önerisi onayınıza gelir.`,
    atlandi: "Hazırlık atlandı. CEO'ya istediğiniz an bu sohbetten yazabilirsiniz.",
  },

  akis: {
    baslik: "Kanallardan canlı",
    etiket: "Kanallardaki son mesajlar",
    baglanti: { bagli: "canlı", baglaniyor: "bağlanıyor", kopuk: "bağlantı yok" },
    bos: "Kanallar sessiz",
    bosMetin: "Ajanlar birbirine yazdıkça ve ArnOrg işlerin başladığını duyurdukça mesajlar burada akar.",
    alinamadi: "Kanal mesajları alınamadı.",
    /** Kanal görünen adıyla */
    kanalaGit: (kanal: string) => `#${kanal} kanalını aç`,
    tumu: "Kanallara git",
  },

  /** Önemli anlarda her ekranda açılan pencereler */
  bildirim: {
    etiket: "Önemli anlar",
    tur: {
      onay: "Onay",
      oneri: "Öneri",
      istek: "İstek",
      yetki: "Yetki",
      teslim: "Teslim",
      bilgi: "Bilgi",
      uyari: "Uyarı",
    } as Record<KurulBildirimTuru, string>,
    devami: "Devamı",
    kisalt: "Kısalt",
    onaylardaAc: "Onaylar'da aç",
    denetimdeAc: "Denetim'de karar ver",
    testEt: "Test et",
    yanitYaz: "CEO'ya yanıt yaz",
    kapat: "Bildirimi kapat",
    hepsiniKapat: "Hepsini kapat",
    daha: (n: number) => `+${n} bildirim daha`,
    daralt: "Daralt",
    retNotu: "Ret notu",
    retYer: "Neden? İsteğe bağlı; ajana iletilir",
    /** Karar başka yerde verildiyse: "Onaylandı · 10:42" */
    sonuc: (durum: string, saat: string) => `${durum} · ${saat}`,
    masaustu: {
      soru: "Pencere arkadayken de haber vereyim mi?",
      izinVer: "Masaüstü bildirimlerine izin ver",
      simdiDegil: "Şimdi değil",
      acildi: "Masaüstü bildirimleri açık. Pencere arkadayken önemli anlar sistem bildirimi olarak da gelir.",
      reddedildi: "Masaüstü bildirimlerine izin verilmedi. Tarayıcının ya da sistemin ayarlarından açabilirsiniz.",
    },
  },

  /** Teslim testi: adımlar, komut ve canlı çıktı, kabul ya da geri bildirim */
  test: {
    baslik: "Teslimi test et",
    teslimEden: "Teslim eden",
    dal: "Dal",
    ozet: "Özet",
    adimlar: "Test adımları",
    adimSayisi: (bitti: number, toplam: number) => `${bitti}/${toplam} adım`,
    adimYok: "Teslimde test adımı yazılmamış; aşağıdaki komutla deneyin.",
    komut: "Komut",
    komutYok: "Teslimde çalıştırılacak komut yok.",
    calistir: "Çalıştır",
    yenidenCalistir: "Yeniden çalıştır",
    calistirIpucu: "Ana repoda terminal açılır ve komut çalışır",
    durdur: "Durdur",
    durdurIpucu: "Çalışan komutu keser (Ctrl+C)",
    terminaliKapat: "Terminali kapat",
    cikti: "Çıktı",
    ciktiBos: "Çalıştır'a basınca komutun çıktısı burada akar.",
    terminal: {
      kapali: "Terminal kapalı",
      aciliyor: "Terminal açılıyor…",
      acik: "Terminal açık · ana repo",
      kapandi: "Terminal kapandı",
    },
    terminalHata: (hata: string) => `Terminal açılamadı: ${hata}`,
    girdi: "Terminale yaz",
    girdiYer: "Komut ya da yanıt · Enter gönderir",
    adres: "Adres",
    ac: "Tarayıcıda aç",
    kabul: "Kabul et",
    geriBildirim: "Geri bildirim gönder",
    notEtiketi: "Geri bildirim",
    notYer: (ad: string) => `Ne çalışmadı, ne bekliyordunuz? Notunuz ${yonelme(ad)} iş olarak gider.`,
    notGerekli: "Geri bildirim için neyin çalışmadığını yazın.",
    isaretsiz: (n: number) => `${n} adım işaretlenmedi.`,
    kabulEdildi: (baslik: string) => `${baslik}: teslim kabul edildi.`,
    geriBildirimGitti: (ad: string) => `Geri bildiriminiz ${yonelme(ad)} iş olarak gitti.`,
    bulunamadi: "Teslim bulunamadı",
    bulunamadiMetin: "Bu teslim listede yok. Proje değiştiyse ya da karar verildiyse Onaylar'dan bakın.",
    /** durum: "Onaylandı" gibi */
    sonuclandi: (durum: string) => `Bu teslimin kararı verildi: ${durum}.`,
  },
};
