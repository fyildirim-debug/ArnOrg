// Çekirdekten gelen dosyayı kaydettirme: tarayıcıda indirme olarak, masaüstünde Electron'un kaydetme penceresiyle.
// Anahtar adres çubuğuna ya da indirme geçmişine düşmesin diye dosya fetch ile (Authorization başlığıyla) alınır,
// geçici bir blob adresinden indirilir.

/** Content-Disposition başlığındaki dosya adı: önce filename*=UTF-8''…, sonra filename="…"; klasör ayraçları atılır */
export function dosyaAdiOku(baslik: string | null | undefined): string | null {
  if (!baslik) return null;
  let ad: string | undefined;
  const utf = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(baslik)?.[1];
  if (utf) {
    try {
      ad = decodeURIComponent(utf.trim());
    } catch {
      // bozuk kodlama: düz ada bakılır
    }
  }
  if (!ad) {
    const duz = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(baslik);
    ad = (duz?.[1] ?? duz?.[2])?.trim();
  }
  const temiz = ad?.replace(/[\\/]+/g, "_").trim();
  return temiz || null;
}

/** Blob'u verilen adla indirir: gizli bir bağlantıya tıklanır, adres bir süre sonra bırakılır */
export function blobuKaydet(veri: Blob, ad: string): void {
  const adres = URL.createObjectURL(veri);
  const baglanti = document.createElement("a");
  baglanti.href = adres;
  baglanti.download = ad;
  baglanti.rel = "noopener";
  baglanti.hidden = true;
  document.body.append(baglanti);
  baglanti.click();
  baglanti.remove();
  // İndirme (ya da masaüstünde kaydetme penceresi) başlayana kadar adres geçerli kalmalı
  window.setTimeout(() => URL.revokeObjectURL(adres), 60_000);
}
