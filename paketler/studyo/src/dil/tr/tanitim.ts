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
  yayindaYok: "Henüz birleşmiş bir README.md yok",
  taslakHazir: (ad: string) => `${ilgi(ad)} taslağı hazır; henüz birleşmedi`,
  taslakNotu: (ad: string) => `${ilgi(ad)} çalışma alanında; henüz birleşmedi, birleşince yayına geçer.`,
  koddaAc: "Kodda aç",
  koddaAcBaslik: "README.md'yi Kod ekranında aç",
  bosReadme: "README.md boş.",
  gorselYok: (alt: string) => (alt ? `Görsel açılamadı: ${alt}` : "Görsel açılamadı"),
  /** Künye sütunu: sahibi ve güncelleme isteği */
  kunyeEtiketi: "Sayfa künyesi",
  sahibi: "Sahibi",
  uzmanMetin: "README.md'yi yazar; teslimlerden ve birleşen işlerden sonra güncel tutar.",
  uzmanYok: "Henüz tanıtım uzmanı yok",
  uzmanYokMetin: "İstek CEO'ya gider: CEO bir Tanıtım uzmanı işe almayı önerir, teklif Onaylar'a düşer; uzman README.md'yi yazar.",
  guncellenmesiniIste: "Güncellenmesini iste",
  notEtiketi: "Not (isteğe bağlı)",
  notIpucu: "Ör. yeni sipariş ekranını ve ekran görüntüsünü ekle",
  kimeGidecek: (ad: string, uzman: boolean) => (uzman ? `${yonelme(ad)} iletilir.` : `Uzman yok; istek ${yonelme(ad)} (CEO) gider.`),
  gonder: "İsteği gönder",
  istendi: (zaman: string) => `Son istek · ${zaman}`,
  iletildi: (ad: string) => `${yonelme(ad)} iletildi`,
  istekGitti: (ad: string, uzman: boolean) => (uzman ? `İstek ${yonelme(ad)} iletildi.` : `İstek ${yonelme(ad)} iletildi; tanıtım uzmanı işe almayı önerecek.`),
  /** README.md yokken */
  bosBaslik: "Tanıtım sayfası henüz yok",
  bosMetin:
    "Kurul projeyi burada, kök README.md'den okur: ne yaptığı, kimin için olduğu, öne çıkan özellikleri, kurulumu ve yol haritası. Sayfayı bir Tanıtım uzmanı yazar ve teslimlerden sonra güncel tutar.",
  ceodanIste: "CEO'dan tanıtım uzmanı iste",
  ceoIpucu: (ad: string) => `${ad} bir uzman işe almayı önerir; teklif Onaylar'a düşer.`,
  uzmanaYazdir: (ad: string) => `README.md'yi ${yonelme(ad)} yazdır`,
  ceoYok: "Bu projede CEO yok; önce Ekip'ten bir CEO işe alın.",
};
