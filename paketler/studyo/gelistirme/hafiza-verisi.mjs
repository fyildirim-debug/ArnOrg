// Sahte çekirdek için proje hafızası, ajan defterleri ve ajanlar arası sorular (Sipariş Paneli örneği)
import { once } from "./veri.mjs";

const P = "siparis-paneli";
let n = 0;
const kayit = (tur, baslik, metin, kaynakAjanId, kaynakAd, dk, ek = {}) => ({
  id: `h${++n}`,
  projeId: P,
  tur,
  baslik,
  metin,
  etiketler: [],
  kaynakAjanId,
  kaynakAd,
  gorevId: null,
  onem: tur === "tercih" ? 5 : 3,
  yerineGecen: null,
  olusturma: once(dk),
  guncelleme: once(dk),
  ...ek,
});

export const hafiza = [
  kayit("tercih", "Commit mesajları Türkçe", "Commit mesajları Türkçe yazılır ve ne değiştiğini söyler. Co-Authored-By ya da araç imzası eklenmez.", null, "Yönetim kurulu", 60 * 30),
  kayit("tercih", "Para birimi kuruş olarak saklanır", "Tutarlar veritabanında tamsayı kuruş olarak tutulur; arayüzde `Intl.NumberFormat('tr-TR')` ile TL gösterilir. Kayan nokta kullanılmaz.", null, "Yönetim kurulu", 60 * 26, { etiketler: ["para", "veritabani"] }),
  kayit("tercih", "Mobilde tek sütun", "Sipariş listesi 520 piksel altında tek sütuna iner; yatay kaydırma olmaz.", "ada", "Ada", 60 * 20, { onem: 4, etiketler: ["arayuz"] }),
  kayit("karar", "Kimlik doğrulama: kısa ömürlü erişim + dönen yenileme jetonu", "Erişim jetonu 15 dakika, yenileme jetonu 30 gün ve her kullanımda döner. Çalınan yenileme jetonu ikinci kez kullanılırsa aile iptal edilir. Ayrıntı: `notlar/kararlar/ADR-004-jeton.md`.", "kerem", "Kerem", 60 * 22, { onem: 5, etiketler: ["auth", "T-21"], gorevId: "g21" }),
  kayit("karar", "API sürümü yolda: /api/v1", "Tüm uçlar `/api/v1` altında. Kırıcı değişiklikte `/api/v2` açılır, eskisi 90 gün yaşar.", "kerem", "Kerem", 60 * 40, { etiketler: ["api"] }),
  kayit("karar", "Sipariş durumları sonlu durum makinesi", "beklemede → hazirlaniyor → kargoda → teslim; iptal yalnız kargodan önce. Geçişler `src/siparis/durum.ts` içinde, başka yerde durum yazılmaz.", "deniz", "Deniz", 60 * 9, { onem: 4, etiketler: ["src/siparis/durum.ts", "siparis"], gorevId: "g24" }),
  kayit("ogrenilen", "better-sqlite3 NODE_MODULE_VERSION hatası", "Belirti: testler `was compiled against a different Node.js version` ile düşer. Neden: Node sürümü değişti. Çözüm: `npm rebuild better-sqlite3`.", "mert", "Mert", 60 * 7, { onem: 4, etiketler: ["test", "sqlite"] }),
  kayit("ogrenilen", "Vite önbelleği eski bileşeni gösteriyor", "Dal değişince `node_modules/.vite` silinmeli; yoksa eski SiparisListesi derlemesi gelir.", "ece", "Ece", 60 * 3, { etiketler: ["vite", "src/ekranlar/SiparisListesi.tsx"] }),
  kayit("olgu", "Node 22 ve npm çalışma alanları", "Repo npm workspaces kullanır; Node 22 gerekir. Testler `npm test`, tür denetimi `npm run typecheck`.", "kerem", "Kerem", 60 * 48, { onem: 4 }),
  kayit("olgu", "Ödeme sağlayıcı test anahtarı Kasa'da", "Iyzico sandbox anahtarı Kasa: siparis-paneli/iyzico-sandbox. Koda ya da nota yazılmaz.", "deniz", "Deniz", 60 * 12, { etiketler: ["odeme", "gizli"] }),
  kayit("uzmanlik", "Ödeme ve webhook imzası: Deniz", "Iyzico ödeme akışını ve webhook HMAC doğrulamasını Deniz kurdu; bu konudaki sorular ona.", "ada", "Ada", 60 * 11, { etiketler: ["odeme"] }),
  kayit("uzmanlik", "Erişilebilirlik ve klavye gezintisi: Ece", "Tablo klavye gezintisini ve odak halkalarını Ece yazdı.", "ada", "Ada", 60 * 5, { etiketler: ["erisilebilirlik"] }),
  kayit("tercih", "Tutarlar kuruş, kayan nokta yok", "Tutarlar kuruş cinsinden tamsayı saklanır; kayan nokta kullanılmaz.", "deniz", "Deniz", 60 * 4, { onem: 4, etiketler: ["para"] }),
  kayit("ozet", "T-19 sipariş filtreleri birleştirildi", "Tarih ve durum filtreleri ana dala alındı; URL sorgusunda saklanıyor. Kalan: kayıtlı filtreler (T-31).", "onur", "Onur", 60 * 2, { onem: 2, gorevId: "g19" }),
];

// Eskimiş bir kayıt: yerine yenisi geçti
hafiza.push(kayit("olgu", "Node 20 kullanılıyor", "Proje Node 20 ile çalışır.", "kerem", "Kerem", 60 * 24 * 6, { yerineGecen: "h9" }));

export const defterler = {
  ada: "## Açık işler\n- Sprint 3 raporu cuma 17:00'de kurula\n- T-31 için tasarımcı alımı önerisi\n\n## Sözler\n- Kerem'e: ADR-004 incelemesi bugün\n\n## Sıradaki\n- Onur'un T-19 notlarını özetle",
  kerem: "## Açık işler\n- T-21 jeton yenileme: aile iptali kaldı\n\n## Dikkat\n- Deniz'in T-24 dalı /api/v1 önekini kullanmalı\n\n## Sıradaki\n- ADR-004'ü notlara taşı",
  deniz: "## Açık işler\n- T-24 sipariş uçları: PATCH durum geçişi testsiz\n- git push için kurul onayı bekleniyor\n\n## Sözler\n- Mert'e: test verisi `test/veri/siparisler.json` bugün\n\n## Sıradaki\n- Webhook tekrar denemesi (idempotent anahtar)",
  ece: "## Açık işler\n- T-26 liste ekranı: boş durum ve yükleniyor iskeleti\n\n## Dikkat\n- 520 px altında tek sütun (kurul tercihi)",
  mert: "## Bekliyor\n- T-27 için T-24'ün birleşmesi\n\n## Hazır\n- e2e iskeleti: sipariş oluştur → listede gör",
};

export const sorular = [
  {
    id: "s1",
    projeId: P,
    soranId: "ece",
    soranAd: "Ece",
    soruluId: "deniz",
    soruluAd: "Deniz",
    soru: "Sipariş listesi için sayfalama imleç tabanlı mı, sayfa numaralı mı? Uç hangi alanı döndürüyor?",
    yanit: "İmleç tabanlı. `GET /api/v1/siparisler?imlec=...&sinir=50` döner; yanıtta `sonrakiImlec` alanı var, null ise son sayfa.",
    durum: "yanitlandi",
    olusturma: once(95),
    yanitlanma: once(93),
  },
  {
    id: "s2",
    projeId: P,
    soranId: "mert",
    soranAd: "Mert",
    soruluId: "kerem",
    soruluAd: "Kerem",
    soru: "Yenileme jetonu testinde saat oynatmak için hangi yardımcıyı kullanalım?",
    yanit: "`vi.useFakeTimers()` yeterli; jeton süresi `src/auth/sure.ts` içindeki `simdi()` üzerinden okunuyor, onu taklit et.",
    durum: "yanitlandi",
    olusturma: once(50),
    yanitlanma: once(47),
  },
  {
    id: "s3",
    projeId: P,
    soranId: "onur",
    soranAd: "Onur",
    soruluId: "ada",
    soruluAd: "Ada",
    soru: "T-19 filtrelerinde kayıtlı filtre kapsam dışı mı?",
    yanit: null,
    durum: "zaman_asimi",
    olusturma: once(30),
    yanitlanma: null,
  },
];

/** Canlı demo: sırayla sorulup yanıtlanan sorular ve yazılan kayıtlar */
export const demoSorular = [
  {
    soranId: "mert",
    soranAd: "Mert",
    soruluId: "deniz",
    soruluAd: "Deniz",
    soru: "PATCH /siparisler/:id/durum iptal edilmiş siparişi kargoya alırsa hangi hata kodu dönmeli?",
    yanit: "409 dönmeli, gövdede `{ kod: 'GECERSIZ_GECIS', mevcut, istenen }`. Geçiş kuralları src/siparis/durum.ts içinde.",
  },
  {
    soranId: "ece",
    soranAd: "Ece",
    soruluId: "kerem",
    soruluAd: "Kerem",
    soru: "Tutarları arayüzde kuruştan TL'ye nerede çevirelim, ortak bir yardımcı var mı?",
    yanit: "`src/ortak/para.ts` içindeki `tl(kurus)` kullanılır; kendi biçimlendiricini yazma.",
  },
];

export const demoKayitlar = [
  { tur: "ogrenilen", baslik: "Playwright tarayıcıyı bulamıyor", metin: "CI'da `PLAYWRIGHT_BROWSERS_PATH` boşsa tarayıcı inmez; önbellek adımı `~/.cache/ms-playwright` yolunu korumalı.", kaynakAjanId: "mert", kaynakAd: "Mert", etiketler: ["ci", "e2e"] },
  { tur: "karar", baslik: "Sipariş listesi sanal kaydırma", metin: "500'den fazla satırda `@tanstack/react-virtual` ile sanal kaydırma; altında düz tablo.", kaynakAjanId: "ece", kaynakAd: "Ece", etiketler: ["arayuz", "performans"] },
  { tur: "olgu", baslik: "Webhook tekrar denemesi idempotent", metin: "Webhook işleyicisi `Idempotency-Key` başlığına bakar; aynı anahtar ikinci kez 200 döner, işlem yapmaz.", kaynakAjanId: "deniz", kaynakAd: "Deniz", etiketler: ["odeme", "webhook"] },
];
