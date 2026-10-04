// Yetenekler ve web araştırması (Türkçe): ajan panelindeki yetenek anahtarları, Ayarlar › Web ve araştırma,
// akıştaki web aracı etiketleri. Yeteneklerin ad ve açıklaması ortak katalogdan (YETENEKLER) gelir.
import type { WebAramaKategorisi } from "@arnorg/ortak";

/** "52 dk", "1 sa 5 dk", "40 sn" */
function kalan(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  if (sn < 60) return `${sn} sn`;
  const dk = Math.round(sn / 60);
  if (dk < 60) return `${dk} dk`;
  return dk % 60 ? `${Math.floor(dk / 60)} sa ${dk % 60} dk` : `${dk / 60} sa`;
}

export const yetenek = {
  /** Ekip › ajan ayrıntısı */
  ajan: {
    baslik: "Yetenekler",
    sayac: (acik: number, toplam: number) => `${acik}/${toplam} açık`,
    ipucu: "Kapatılan yeteneğin aracı hemen kapanır; açılan yetenek çalışanın bir sonraki oturumunda gelir.",
    varsayilan: "Rol varsayılanına dön",
    anahtar: (ad: string, acik: boolean) => `${ad}: ${acik ? "açık" : "kapalı"}`,
    acildi: (ajan: string, ad: string) => `${ajan}: ${ad} açıldı.`,
    kapandi: (ajan: string, ad: string) => `${ajan}: ${ad} kapatıldı.`,
    varsayilanaDondu: (ajan: string) => `${ajan}: yetenekler rol varsayılanına döndü.`,
  },
  /** Ayarlar › Web ve araştırma */
  web: {
    baslik: "Web ve araştırma",
    ozet: (calisan: number, toplam: number) => `${calisan}/${toplam} motor çalışıyor`,
    aciklama: "Çalışanların web araması ve sayfa okuması ArnOrg'un içinde çalışır; ayrı bir sunucu ya da API anahtarı gerekmez. Motorlar birlikte sorgulanır, sonuçlar birleştirilip sıralanır.",
    alinamadi: "Motor durumu alınamadı",
    genel: "Web motorları",
    teknik: "Teknik kaynaklar",
    durum: {
      calisiyor: "Çalışıyor",
      askida: (ms: number) => `Askıda · ${kalan(ms)}`,
      hatali: "Son deneme hatalı",
      bekliyor: "Henüz sorgulanmadı",
      kapali: "Kapalı",
    },
    kategoriler: { genel: "genel", kod: "kod", haber: "haber", bilim: "bilim" } as Record<WebAramaKategorisi, string>,
    motorAnahtari: (ad: string, acik: boolean) => `${ad}: ${acik ? "açık" : "kapalı"}`,
    motorAcildi: (ad: string) => `${ad} açıldı.`,
    motorKapandi: (ad: string) => `${ad} kapatıldı; aramalarda sorgulanmayacak.`,
    askiIpucu: "Çok fazla istek (429) alan motor 10 dakika; erişimi reddeden, CAPTCHA ya da bot doğrulaması isteyen motor 1 saat sorgulanmaz. Bir motorun düşmesi aramayı bozmaz.",
    askilariKaldir: "Askıları kaldır",
    askilarKalkti: "Askıdaki motorlar bir sonraki aramada yeniden denenecek.",
    dis: "Dış kaynaklar",
    searxng: "Dış SearXNG adresi",
    searxngOrnek: "https://searx.ornek.org",
    searxngIpucu: "İsteğe bağlı. Doluysa <adres>/search?format=json de sorgulanır ve sonuçları yerleşik motorlarla birleşir. SearXNG'nin settings.yml dosyasında json biçimi açık olmalı.",
    searxngKaydedildi: "SearXNG adresi kaydedildi.",
    searxngKaldirildi: "SearXNG adresi kaldırıldı.",
    kaldir: "Kaldır",
    jina: "Okunamayan sayfaları r.jina.ai ile oku",
    jinaIpucu: "Yerelde çok az metin çıkan (JS ile çizilen) ya da bot korumasına takılan sayfa r.jina.ai'ye gönderilir. localhost ve yerel ağ adresleri hiç gönderilmez.",
    jinaAcildi: "r.jina.ai yedeği açıldı.",
    jinaKapandi: "r.jina.ai yedeği kapatıldı; sayfalar yalnız yerelde okunacak.",
    deneme: "Deneme araması",
    denemeIpucu: "Çalışanların web_ara aracıyla aynı arama. Sonuçlar 10 dakika önbellekte kalır.",
    denemeOrnek: "ör. electron-updater özel depo",
    kategori: "Kategori",
    ara: "Ara",
    araniyor: "Aranıyor",
    denemeOzet: (veren: number, sorgulanan: number, sure: string) => `${veren}/${sorgulanan} motor yanıt verdi · ${sure}`,
    sure: (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn`),
    onbellekten: "önbellekten",
    yanitVermeyen: "Yanıt vermeyen",
    askida: "Askıda",
    sonucYok: "Sonuç yok",
    sonucYokMetin: "Hiçbir motor sonuç döndürmedi. Başka sözcüklerle ya da başka bir kategoriyle dene.",
    dahaFazla: (n: number) => `ve ${n} sonuç daha`,
  },
  /** Akışta web araçlarının okunur adları (Transkript, canlı akış, denetim) */
  araclar: {
    web_ara: "Web araması",
    web_oku: "Sayfa okuma",
    arastirma_kaydet: "Araştırma notu",
    paket_bilgisi: "Paket bilgisi",
    github_ara: "GitHub araması",
  } as Record<string, string>,
  githubTurleri: { repo: "depo", issue: "issue", kod: "kod" } as Record<string, string>,
  kaynak: (n: number) => `${n} kaynak`,
  parca: (bas: number) => `${bas}. karakterden`,
};
