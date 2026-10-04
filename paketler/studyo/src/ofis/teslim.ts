// Stüdyonun sunum ekranı: teslim onaylarından ve teslim_et çağrısından ekranda ne görüneceği (saf mantık).
// Çekirdek teslim onayının verisi {baslik, ozet, testAdimlari[], ...}; teslim_et girdisi {baslik, ozet, test_adimlari[], ...};
// onayın kendi başlığı "Teslim: X" ya da "Delivery: X".

/** Ekrana giden kısım: başlık ve en çok dört test adımı */
export interface TeslimVerisi {
  baslik: string;
  adimlar: string[];
}

/** Ekrandaki teslim; an: sıralama anı (bekleyende oluşturulma, kararda sonuçlanma, çağrıda çağrı anı) */
export interface SunumSecimi extends TeslimVerisi {
  durum: string;
  an: number;
}

/** Karara bağlanan teslim (ve onayı görünmeyen çağrı) ekranda bu kadar kalır */
export const KARAR_EKRANDA = 180_000;

/** Onay başlığının "Teslim: " / "Delivery: " öneki */
const ONEK = /^[^:]{2,12}:\s*/;

/** Teslim onayının ya da teslim_et girdisinin başlığı ve adımları; veride başlık yoksa onay başlığı öneksiz */
export function teslimVerisi(o: { veri?: unknown; baslik?: string }): TeslimVerisi {
  const v = (o.veri && typeof o.veri === "object" ? o.veri : {}) as { baslik?: unknown; testAdimlari?: unknown; test_adimlari?: unknown };
  const liste: unknown[] = Array.isArray(v.testAdimlari) ? v.testAdimlari : Array.isArray(v.test_adimlari) ? v.test_adimlari : [];
  const baslik = typeof v.baslik === "string" && v.baslik.trim() ? v.baslik.trim() : (o.baslik ?? "").replace(ONEK, "").trim();
  return {
    baslik,
    adimlar: liste.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 4),
  };
}

interface TeslimOnayi {
  tur: string;
  durum: string;
  baslik: string;
  olusturma: string;
  sonuclanma: string | null;
  veri?: unknown;
}

/**
 * En son hareket gören teslim. Bekleyen teslimler oluşturulma anıyla, son üç dakikada karara bağlananlar karar anıyla,
 * onayı henüz görünmeyen son teslim_et çağrısı çağrı anıyla yarışır; en yenisi kazanır. Böylece kabul anı, daha
 * eski bekleyen bir teslimin arkasında kalmaz. Gösterilecek bir şey yoksa null.
 */
export function sunumSec(onaylar: readonly TeslimOnayi[], cagri: (TeslimVerisi & { an: number }) | null, simdi: number): SunumSecimi | null {
  const adaylar: SunumSecimi[] = [];
  const basliklar = new Set<string>();
  for (const o of onaylar) {
    if (o.tur !== "teslim") continue;
    const v = teslimVerisi(o);
    basliklar.add(v.baslik);
    if (o.durum === "bekliyor") adaylar.push({ ...v, durum: o.durum, an: Date.parse(o.olusturma) });
    else if (o.sonuclanma) {
      const an = Date.parse(o.sonuclanma);
      if (simdi - an < KARAR_EKRANDA) adaylar.push({ ...v, durum: o.durum, an });
    }
  }
  if (cagri && simdi - cagri.an < KARAR_EKRANDA && !basliklar.has(cagri.baslik)) adaylar.push({ ...cagri, durum: "bekliyor" });
  return adaylar.filter((a) => a.baslik && Number.isFinite(a.an)).sort((a, b) => b.an - a.an)[0] ?? null;
}
