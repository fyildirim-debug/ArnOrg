// Açılışta mesaiye dönüş: ArnOrg kapanırken ya da çökerken çalışan ajanlar yeniden açılışta kaldıkları yerden sürer.
// Kapanışta (oturumlar kapanmadan önce) çalışanların kimlikleri anahtar-değer deposuna yazılır. Çökmede bu kayıt
// güncellenmez ama veritabanında çalışan durumda kalmış ajanlar vardır; açılış kümesi ikisinin birleşimidir ve durumlar
// sıfırlanmadan okunur. Kurulun durdurduğu (Mesaiyi durdur) ajan kümeden ve kayıttan çıkar.
import type { Ajan } from "@arnorg/ortak";
import { calisanMi } from "./es-zamanlilik.js";

/** Anahtar-değer kaydı: açılışta sürdürülecek ajan kimlikleri (JSON dizi) */
export const SURDURME_ANAHTARI = "mesai:surdurulecek";
/** Açılıştan bu kadar sonra ajanlar uyandırılır (hesap ve kurulum durumu yerleşsin) */
export const SURDURME_GECIKMESI_MS = 30_000;

/** Kayıttaki kimlikler; bozuk ya da eski biçimli kayıt boş sayılır */
export function kayitOku(ham: string | null): string[] {
  try {
    const v: unknown = JSON.parse(ham ?? "[]");
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
  } catch {
    return [];
  }
}

/** Açılış kümesi: kapanış kaydı ∪ veritabanında çalışan durumda kalmış ajanlar (çökme); yalnız var olan ajanlar */
export function acilisKumesi(kayit: string[], ajanlar: Pick<Ajan, "id" | "durum">[]): string[] {
  const varOlan = new Set(ajanlar.map((a) => a.id));
  const kume = new Set(kayit.filter((id) => varOlan.has(id)));
  for (const a of ajanlar) if (calisanMi(a.durum)) kume.add(a.id);
  return [...kume];
}

export interface MesaiDeposu {
  deger(anahtar: string): string | null;
  degerYaz(anahtar: string, deger: string): void;
}

export class MesaiyeDonus {
  private bekleyen: string[];
  private zamanlayici: NodeJS.Timeout | null = null;

  /** Ajan durumları sıfırlanmadan önce kurulur (çökmede çalışan durumda kalanlar okunsun) */
  constructor(
    private readonly depo: MesaiDeposu,
    ajanlar: Pick<Ajan, "id" | "durum">[],
  ) {
    this.bekleyen = acilisKumesi(kayitOku(depo.deger(SURDURME_ANAHTARI)), ajanlar);
    // Kayıt sürdürme anına dek kalır: açılıştan hemen sonra yine kapanır ya da çökerse küme kaybolmaz
    this.yaz(this.bekleyen);
  }

  /** Açılışta sürdürülmeyi bekleyenler */
  get bekleyenler(): string[] {
    return [...this.bekleyen];
  }

  /** Bekleyen varsa sürdürmeyi gecikmeyle planlar */
  planla(surdur: () => void, ms = SURDURME_GECIKMESI_MS): void {
    this.durdur();
    if (!this.bekleyen.length) return;
    this.zamanlayici = setTimeout(() => {
      this.zamanlayici = null;
      surdur();
    }, ms);
    this.zamanlayici.unref();
  }

  /** Sürdürme anı: bekleyenler alınır, kayıt temizlenir */
  al(): string[] {
    const kume = this.bekleyen;
    this.bekleyen = [];
    this.yaz([]);
    return kume;
  }

  /** Kurul durdurdu: seçilen ajanlar açılışta uyanmaz (bekleyenlerden ve kayıttan çıkar) */
  cikar(secici: (ajanId: string) => boolean): void {
    this.bekleyen = this.bekleyen.filter((id) => !secici(id));
    this.yaz(kayitOku(this.depo.deger(SURDURME_ANAHTARI)).filter((id) => !secici(id)));
  }

  /** Kapanış (oturumlar kapanmadan önce): çalışanlar ve henüz sürdürülmemiş açılış kümesi kaydedilir */
  kapanis(calisanlar: string[]): string[] {
    this.durdur();
    const kume = [...new Set([...this.bekleyen, ...calisanlar])];
    this.yaz(kume);
    return kume;
  }

  durdur(): void {
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
  }

  private yaz(idler: string[]): void {
    try {
      this.depo.degerYaz(SURDURME_ANAHTARI, JSON.stringify(idler));
    } catch {
      // Depo kapanmışsa (testlerde kapanış sırası) kayıt yazılmaz
    }
  }
}
