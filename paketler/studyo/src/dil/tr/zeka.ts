// Zekâ ekranı: ana yasa, global zekâ, beceriler, sözler ve ajan zekâsı (Türkçe)
import type { AnayasaKurali, KuralDurumu, KuralKaynagi, SozDurumu, ZekaGunlukTuru } from "@arnorg/ortak";
import { yonelme } from "../../yardimcilar/bicim";

export const zeka = {
  altBaslik: "Ajanların unutmadığı her şey: projenin ana yasası, ArnOrg'un global zekâsı, ekip becerileri ve verilen sözler",
  bolumler: "Zekâ bölümleri",
  sekme: {
    anayasa: "Ana yasa",
    kuresel: "Global zekâ",
    beceriler: "Beceriler",
    sozler: "Sözler",
  },
  sekmeIpucu: {
    anayasa: "Projenin kesin kuralları; CEO dahil herkes uyar",
    kuresel: "ArnOrg'un bütün projelerden öğrendiği standartlar",
    beceriler: "Ekibin bu projede öğrendiği yöntemler",
    sozler: "Çalışanların birbirine ve kurula verdiği açık sözler",
  },

  /** Projenin ana yasası */
  anayasa: {
    yukleniyor: "Ana yasa yükleniyor",
    alinamadi: "Ana yasa alınamadı.",
    belgeAdi: (proje: string) => `${proje} ana yasası`,
    surum: (n: number) => `Sürüm ${n}`,
    guncellendi: (zaman: string) => `${zaman} güncellendi`,
    onaylayan: (kim: string) => `Onaylayan: ${kim}`,
    maddeSayisi: (n: number) => `${n} madde`,
    kapidaSayisi: (n: number) => `${n} tanesi denetim kapısında`,
    aciklama:
      "Her ajanın talimatının en başında durur; CEO dahil herkes uyar. Makine kuralı olan maddeler denetim kapısında uygulanır: eşleşen komut, dosya yolu ya da adres durdurulur. Ana yasa değiştiğinde bütün ekibe hatırlatılır.",
    maddeler: "Maddeler",
    kapi: "Denetim kapısı",
    kapiIpucu: "Bu madde denetim kapısında makine kuralı olarak da uygulanır",
    kararSonuc: { ret: "reddedilir", sor: "kurula sorulur" } as Record<AnayasaKurali["karar"], string>,
    desenler: "Desenler",
    oneriBekliyor: "CEO'nun ana yasa önerisi onayınızı bekliyor",
    oneriyiIncele: "Onaylar'da incele",
    bosBaslik: "Bu projenin henüz ana yasası yok",
    /** Karar yetkisine göre: tam otonomda CEO maddeleri kendisi yürürlüğe koyar */
    bosMetin: (otonom: boolean): string =>
      otonom
        ? "Ana yasa CEO ile birlikte hazırlanır: Karargâh'ta hazırlık görüşmesini başlatın ya da CEO'ya yazın. CEO maddeleri yazar ve yürürlüğe koyar; değişmesini istediğiniz bir şey olursa CEO'ya söyleyin. Maddeler CEO dahil her ajanın talimatının başına girer ve projede kesinlikle uyulur."
        : "Ana yasa CEO ile birlikte hazırlanır: Karargâh'ta hazırlık görüşmesini başlatın ya da CEO'ya yazın. CEO maddeleri önerir, siz onaylarsınız. Onaylanan maddeler CEO dahil her ajanın talimatının başına girer ve projede kesinlikle uyulur.",
    karargah: "Karargâh'ta hazırla",
    ceoyaYaz: (ceo: string) => `${yonelme(ceo)} yaz`,
    kendimYazayim: "Kendim yazayım",

    // düzenleme
    duzenBaslik: "Ana yasayı düzenliyorsunuz",
    duzenAciklama: (surum: number) =>
      `Kaydedince sürüm ${surum} yürürlüğe girer, bütün ekibe duyurulur ve her ajana bir sonraki turunda hatırlatılır.`,
    maddeEtiketi: (no: number) => `${no}. madde`,
    baslik: "Başlık",
    baslikOrnek: "Örn. Gizli bilgi",
    metin: "Metin",
    metinOrnek: "Örn. .env dosyaları ve anahtarlar okunmaz, commit'lenmez, kanala yazılmaz.",
    kuralEkle: "Makine kuralı ekle",
    kuralEkleIpucu: "Madde yalnız talimatta kalmasın; denetim kapısı eşleşen çağrıyı da durdursun",
    kuralBaslik: "Makine kuralı",
    kuralAciklama: "Denetim kapısında her araç çağrısında ilk önce denenir.",
    kuralKaldir: "Kuralı kaldır",
    hedef: "Neye bakılır",
    kararAdi: "Eşleşince",
    kararSecenek: { ret: "Reddet", sor: "Kurula sor" } as Record<AnayasaKurali["karar"], string>,
    desenlerIpucu: "Her satıra bir düzenli ifade; büyük/küçük harf duyarsız.",
    desenOrnek: "Örn. \\bgit\\s+push\\b",
    gecersizDesen: (neden: string) => `geçersiz düzenli ifade${neden ? ` (${neden})` : ""}`,
    yukari: (no: number) => `${no}. maddeyi yukarı taşı`,
    asagi: (no: number) => `${no}. maddeyi aşağı taşı`,
    sil: (no: number) => `${no}. maddeyi sil`,
    maddeEkle: "Madde ekle",
    maddeSiniri: "Ana yasa en çok 40 madde olabilir.",
    kaydet: "Kaydet ve yürürlüğe koy",
    degisiklikYok: "Henüz değişiklik yok.",
    kaydedilmemis: "Kaydedilmemiş değişiklikler",
    yururlukte: (surum: number) =>
      `Ana yasa sürüm ${surum} yürürlükte. Bütün ekibe duyuruldu; her ajana bir sonraki turunda hatırlatılacak.`,
    kaydedilemedi: "Ana yasa kaydedilemedi",
    vazgecSor: "Taslaktaki değişiklikler silinsin mi?",
    vazgecEvet: "Evet, taslağı sil",
    surumDegisti: (surum: number) =>
      `Siz düzenlerken ana yasa güncellendi (sürüm ${surum}). Kaydederseniz bu taslak onun yerine geçer.`,
    yeniSurumdenBasla: "Yeni sürümden başla",
    hata: {
      baslik: "Başlık gerekli.",
      metin: "Metin gerekli.",
      desenYok: "En az bir desen yazın ya da makine kuralını kaldırın.",
      maddeYok: "En az bir madde gerekli.",
      ozet: (n: number) => `${n} maddede düzeltilecek alan var`,
    },
  },

  /** ArnOrg'un global zekâsı */
  kuresel: {
    aciklama:
      "ArnOrg'un bütün projelerden öğrendiği standartlar. Her ajana rolü ve yetkisi kapsamında verilir ve kendini sürekli günceller: kurulun tercihleri, dersler ve düzeltmeler kendiliğinden kurala dönüşür; başka projede de görülen aday standart olur; tekrar edenler birleşir, zayıflayanlar emekliye ayrılır.",
    yukleniyor: "Global zekâ yükleniyor",
    alinamadi: "Global zekâ alınamadı.",
    durumAdi: { etkin: "Standart", aday: "Aday", emekli: "Emekli" } as Record<KuralDurumu, string>,
    grupBaslik: { etkin: "Standartlar", aday: "Adaylar", emekli: "Emekliler" } as Record<KuralDurumu, string>,
    grupAciklama: {
      etkin: "Her ajana kapsamı içinde verilir.",
      aday: "Başka bir projede de görülünce ya da güveni %65'e çıkınca standart olur.",
      emekli: "Artık ajanlara verilmez: zayıfladı, birleşti ya da kurul emekliye ayırdı.",
    } as Record<KuralDurumu, string>,
    ozetEtiketi: "Kural sayıları; duruma göre süzmek için seçin",
    duruma: (durum: string, n: number) => `${durum}: ${n} kural. Yalnız bunları göster`,
    sonOgrenme: "Son öğrenme",
    henuzOgrenmedi: "Henüz yok",
    kapsamSuzgeci: "Kapsama göre süz",
    tumKapsamlar: "Bütün kapsamlar",
    araEtiket: "Kurallarda ara",
    araYer: "Ara: commit, test, şema…",
    kuralEkle: "Kural ekle",
    suzgecleriTemizle: "Süzgeçleri temizle",
    sonuc: (n: number) => `${n} kural`,
    eslesenYok: "Eşleşen kural yok",
    eslesenYokMetin: "Süzgeçleri gevşetin ya da aramayı değiştirin.",
    grupBos: "Bu grupta kural yok.",
    bosBaslik: "Global zekâ henüz boş",
    bosMetin:
      "Kurulun genel tercihleri, ajanların dersleri ve düzeltmeler burada kurala dönüşür. İsterseniz ilk kuralı kendiniz yazın; bütün projelerde standart olur.",
    ilkKural: "İlk kuralı yaz",

    /** Kapsam: boş liste herkes demektir */
    kapsam: { herkes: "Herkes", yonetici: "Yöneticiler", gelistirici: "Geliştiriciler" },
    kapsamEtiketi: "Kime verilir",
    kapsamIpucu: "Hiçbiri seçilmezse herkese verilir. Yöneticiler CEO gibi yönetici rolleri, geliştiriciler diğer bütün rolleri kapsar.",
    kaynak: {
      kurul: "Kurul",
      tercih: "Kurul tercihi",
      ogrenilen: "Ders",
      duzeltme: "Düzeltme",
      ajan: "Ajan önerisi",
    } as Record<KuralKaynagi, string>,
    kaynakIpucu: "Kuralın nereden öğrenildiği",

    // ölçüler
    guven: "güven",
    guvenIpucu:
      "Güven: kanıt ve olumlu geri bildirimle artar, yanlış bildirimiyle düşer. Aday %65'te standart olur; %30'un altına inen kural emekliye ayrılır.",
    esikStandart: "Standart eşiği %65",
    esikEmekli: "Emeklilik eşiği %30",
    kanit: "Kanıt",
    kanitIpucu: "Kuralı doğrulayan gözlemler; aç ya da kapat",
    kullanim: "Kullanım",
    kullanimIpucu: "Ajan talimatına girdiği oturum sayısı",
    yarar: "Yarar",
    yararIpucu: "İşe yaradı bildirimleri",
    ihlal: "İhlal",
    ihlalIpucu: "Çiğnendiği kez",
    kurulKaniti: "Kurul",
    guncellendi: (zaman: string) => `${zaman} güncellendi`,
    kanitlarEtiketi: "Kanıtlar",

    // eylemler
    eylemler: "Kural eylemleri",
    iseYaradi: "İşe yaradı",
    iseYaradiIpucu: "Bu kural işe yaradı: güveni artar",
    yanlis: "Yanlış",
    yanlisIpucu: "Bu kural yanlış ya da zararlı: güveni düşer, %30'un altına inerse emekliye ayrılır",
    durumaAl: { etkin: "Standart yap", aday: "Adaya al", emekli: "Emekliye ayır" } as Record<KuralDurumu, string>,
    duzenleEtiketi: (kisa: string) => `Kuralı düzenle: ${kisa}`,
    silEtiketi: (kisa: string) => `Kuralı sil: ${kisa}`,
    silUyari:
      "Bu kural bütün projelerden kalıcı olarak silinir. Kanıtlarıyla birlikte saklamak isterseniz emekliye ayırın; emekli kural ajanlara verilmez.",
    silindi: "Kural silindi.",
    durumBildirimi: {
      etkin: "Kural standart oldu; bütün projelerde kapsamındaki ajanlara verilecek.",
      aday: "Kural adaya alındı; yeniden kanıt toplayacak.",
      emekli: "Kural emekliye ayrıldı; artık ajanlara verilmeyecek.",
    } as Record<KuralDurumu, string>,
    geriBildirimAlindi: (guven: string) => `Geri bildirim kaydedildi. Güven şimdi ${guven}.`,
    emekliyeAyrildi: "Güveni %30'un altına indi; kural emekliye ayrıldı.",
    vurgulandi: "Kural vurgulandı",

    /** Kural ekleme ve düzenleme formu */
    form: {
      yeniEtiketi: "Yeni global kural",
      duzenleEtiketi: "Global kuralı düzenle",
      metin: "Kural",
      metinOrnek: "Örn. Bağımlılık eklemeden önce lisansını ve son güncellemesini kontrol et.",
      sayac: (n: number) => `${n} / 600`,
      kisa: "Kural en az 5 karakter olmalı.",
      kurulKurali: "Kurulun yazdığı kural doğrudan standart olur ve bütün projelerde seçtiğiniz kapsamdaki ajanlara verilir.",
      ekle: "Kuralı ekle",
      eklendi: "Kural eklendi; bütün projelerde standart.",
      guncellendi: "Kural güncellendi.",
    },

    /** Öğrenme günlüğü */
    gunluk: {
      baslik: "Öğrenme günlüğü",
      etiket: "Öğrenme günlüğü, en yenisi üstte",
      canli: "Canlı",
      kopuk: "Bağlantı yok",
      tur: {
        ogrendi: "Öğrendi",
        guclendi: "Güçlendi",
        etkinlesti: "Standart oldu",
        birlestirdi: "Birleştirdi",
        emekli: "Emekliye ayrıldı",
        duzenlendi: "Düzenlendi",
        geri_bildirim: "Geri bildirim",
        eledi: "Projeye özgü, elendi",
      } satisfies Record<ZekaGunlukTuru, string>,
      bos: "Henüz bir şey öğrenmedi. Kurul tercih bildirdikçe ve ajanlar ders çıkardıkça burada belirir.",
      dahaEski: (n: number) => `Daha eski ${n} kaydı göster`,
      kurala: (kisa: string) => `Kurala git: ${kisa}`,
    },
  },

  /** Ekip becerileri */
  beceriler: {
    aciklama:
      "Ekibin bu projede öğrendiği yöntemler. Ajanlar talimatlarında beceri dizinini görür, gerektiğinde tam metni okur; işe yarayan bir yöntemi tekrar kullanan ajan onu beceri olarak yazar.",
    yukleniyor: "Beceriler yükleniyor",
    alinamadi: "Beceriler alınamadı.",
    icerikAlinamadi: "Beceri okunamadı.",
    icerikYukleniyor: "Beceri yükleniyor",
    bosBaslik: "Henüz beceri yok",
    bosMetin: "Bir ajan işe yarayan bir yöntemi tekrar kullandığında onu beceri olarak yazar; ekip sonraki işlerde aynı yolu izler.",
    yazan: (ad: string) => `${ad} yazdı`,
    kullanim: (n: number) => (n ? `${n} kez kullanıldı` : "Henüz kullanılmadı"),
    guncellendi: (zaman: string) => `${zaman} güncellendi`,
    kullanimNotu: "Okunan beceri kullanılmış sayılır.",
  },

  /** Sözler */
  sozler: {
    aciklama:
      "Çalışanların birbirine ve kurula verdiği sözler. Açık söz tutulana kadar her turda verene, söz verilene de hatırlatılır.",
    yukleniyor: "Sözler yükleniyor",
    alinamadi: "Sözler alınamadı.",
    acik: "Açık sözler",
    kapanan: "Kapananlar",
    bosBaslik: "Henüz söz verilmedi",
    bosMetin: "Bir ajan başka birine ya da kurula iş sözü verdiğinde burada görünür; tutulana kadar ikisine de hatırlatılır.",
    acikYok: "Açık söz yok; verilen bütün sözler kapandı.",
    durum: { acik: "Açık", tutuldu: "Tutuldu", iptal: "İptal" } as Record<SozDurumu, string>,
    sonTarih: "Son tarih",
    sonTarihYok: "Son tarih yok",
    gecikti: (goreli: string) => `süresi geçti · ${goreli}`,
    verildi: (zaman: string) => `${zaman} verildi`,
    kapandi: (zaman: string) => `${zaman} kapandı`,
    kime: (veren: string, alan: string) => `${veren}, ${yonelme(alan)} söz verdi`,
    not: "Not",
  },

  /** Ekip ve Ofis'teki ajan ayrıntısında zekâ bölümü */
  ajan: {
    aciklama: "Kendine ait kalıcı zekâsı: kim olduğunu, kendisine verilen işleri ve sözlerini unutmaz.",
    yukleniyor: "Zekâsı yükleniyor",
    alinamadi: "Ajanın zekâsı alınamadı.",
    kisisel: "Kişisel hafıza",
    kisiselKullanim: (kullanilan: string, sinir: string) => `${kullanilan} / ${sinir} karakter`,
    kisiselIpucu: "Oturum başında donmuş görüntü olarak talimatına girer; oturum içindeki değişiklik bir sonraki oturumda geçerli olur.",
    kisiselBos: "Henüz kişisel hafızası yok. Çalıştıkça kendisi için önemli olanları buraya yazar.",
    kisiselDolu: "Sınıra yaklaştı; ajan benzer maddeleri birleştirecek.",
    baglar: "Ekip bağları",
    baglarIpucu: "Her turda talimatına giren bağlar; kancalar bunları çalışırken ara ara kendisine hatırlatır.",
    baglarBos: "Henüz bir bağı yok.",
    verdigi: "Verdiği sözler",
    aldigi: "Ona verilen sözler",
    sozYok: "Yok.",
    defter: "Defter",
    defterIpucu: "Her turun sonunda yazdığı çalışma notları; Hafıza ekranındaki Defterler bölümünden düzenlenir.",
    defterBos: "Defteri boş.",
    tamaminiGoster: "Tamamını göster",
    kisalt: "Kısalt",
    beceriler: "Bildiği ekip becerileri",
    beceriAc: (ad: string) => `${ad} becerisini Zekâ ekranında aç`,
    aktar: "Hafızasını aktar",
    aktarAciklama:
      "Devirde bilgi kaybolmasın: kişisel hafızası ve defteri seçtiğiniz çalışanın defterine “Devir” bölümü olarak yazılır, onun kişisel hafızasına da kısa bir not düşer. Kendi hafızası yerinde kalır.",
    aktarAc: "Hafızasını aktar…",
    kime: "Kime",
    yoneticisi: "yöneticisi",
    not: "Not (isteğe bağlı)",
    notOrnek: "Örn. T-24'ün kalan işleri sende; kargo API'sinin zaman aşımına dikkat.",
    sozleriDevret: "Açık sözlerini de devret",
    sozleriDevretIpucu: (n: number) => (n ? `${n} açık söz alanın adına yeniden verilir.` : "Şu an açık sözü yok."),
    aktarDugme: "Aktar",
    kimseYok: "Aktaracak başka çalışan yok.",
  },
};
