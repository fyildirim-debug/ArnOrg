// Tanıtım: projenin kök README.md'si, kurulun okuduğu vitrin sayfası; tanıtım uzmanı ve güncelleme isteği (Türkçe)
import { ilgi, yonelme } from "../../yardimcilar/bicim";

export const tanitim = {
  yukleniyor: "Tanıtım sayfası yükleniyor",
  alinamadi: "Tanıtım sayfası alınamadı.",
  /** Başlığın altındaki künye: README.md · son değişiklik · yazar · commit */
  commitYok: "henüz commit'lenmedi",
  taslakKunyesi: "taslak",
  commitBaslik: (commit: string, mesaj: string) => `Son commit ${commit}: ${mesaj}`,
  /** Yayında / Taslak seçici */
  surumEtiketi: "Gösterilen sürüm",
  yayinda: "Yayında",
  taslak: "Taslak",
  yayindaYok: "Henüz kaydedilmiş bir README.md yok",
  taslakHazir: (ad: string) => `${ilgi(ad)} taslağı hazır; henüz kaydedilmedi`,
  taslakNotu: (ad: string) => `${ad} ortak projede düzenliyor; görevi kaydedilince yayına geçer.`,
  koddaAc: "Kodda aç",
  koddaAcBaslik: "README.md'yi Kod ekranında aç",
  bosReadme: "README.md boş.",
  gorselYok: (alt: string) => (alt ? `Görsel açılamadı: ${alt}` : "Görsel açılamadı"),
  /** Künye sütunu: sahibi ve güncelleme isteği */
  kunyeEtiketi: "Sayfa künyesi",
  sahibi: "Sahibi",
  uzmanMetin: "README.md'yi yazar; teslimlerden ve kaydedilen işlerden sonra güncel tutar.",
  uzmanYok: "Henüz tanıtım uzmanı yok",
  /** Karar yetkisine göre: tam otonomda CEO uzmanı doğrudan işe alır, kurul kipinde teklif Onaylar'a düşer */
  uzmanYokMetin: (otonom: boolean): string =>
    otonom
      ? "İstek CEO'ya gider: CEO bir Tanıtım uzmanını doğrudan işe alır; uzman README.md'yi yazar."
      : "İstek CEO'ya gider: CEO bir Tanıtım uzmanı işe almayı önerir, teklif Onaylar'a düşer; uzman README.md'yi yazar.",
  guncellenmesiniIste: "Güncellenmesini iste",
  notEtiketi: "Not (isteğe bağlı)",
  notIpucu: "Ör. yeni sipariş ekranını ve ekran görüntüsünü ekle",
  kimeGidecek: (ad: string, uzman: boolean) => (uzman ? `${yonelme(ad)} iletilir.` : `Uzman yok; istek ${yonelme(ad)} (CEO) gider.`),
  gonder: "İsteği gönder",
  istendi: (zaman: string) => `Son istek · ${zaman}`,
  iletildi: (ad: string) => `${yonelme(ad)} iletildi`,
  istekGitti: (ad: string, uzman: boolean, otonom: boolean) =>
    uzman ? `İstek ${yonelme(ad)} iletildi.` : otonom ? `İstek ${yonelme(ad)} iletildi; bir tanıtım uzmanı işe alacak.` : `İstek ${yonelme(ad)} iletildi; tanıtım uzmanı işe almayı önerecek.`,
  /** README.md yokken */
  bosBaslik: "Tanıtım sayfası henüz yok",
  bosMetin:
    "Kurul projeyi burada, kök README.md'den okur: ne yaptığı, kimin için olduğu, öne çıkan özellikleri, kurulumu ve yol haritası. Sayfayı bir Tanıtım uzmanı yazar ve teslimlerden sonra güncel tutar.",
  ceodanIste: "CEO'dan tanıtım uzmanı iste",
  ceoIpucu: (ad: string, otonom: boolean) => (otonom ? `${ad} bir uzmanı doğrudan işe alır; karar yetkisi CEO'da.` : `${ad} bir uzman işe almayı önerir; teklif Onaylar'a düşer.`),
  uzmanaYazdir: (ad: string) => `README.md'yi ${yonelme(ad)} yazdır`,
  ceoYok: "Bu projede CEO yok; önce Ekip'ten bir CEO işe alın.",
};
