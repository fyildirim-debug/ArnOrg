// Ad ile ofis karakterinin uyumu (0.0.8): işe alımda ve ekip dosyasından içe aktarmada karakter seçimi, eski
// çalışanların bir kez düzeltilmesi. Kurallar @arnorg/ortak'ta (cinsiyet.ts: adın cinsiyeti, karakterler.ts: seçim);
// Stüdyo'nun işe alım formu ve ofisteki otomatik atama aynı kuralı izler.
import type { Ajan } from "@arnorg/ortak";
import { adCinsiyeti, type Cinsiyet } from "@arnorg/ortak/cinsiyet";
import { bosKarakter, karakterCinsiyeti, karakterSec, KARAKTERLER } from "@arnorg/ortak/karakterler";
import type { Depo } from "./depo.js";

/** Bir kez çalışan düzeltmenin kaydı (depo değerleri); değeri çalıştığı an */
export const KARAKTER_UYUMU_GOCU = "karakter-cinsiyet-gocu";

/** Karakterin görünüşü adın bilinen cinsiyetine ters mi (ad ya da karakter bilinmiyorsa hayır) */
export function celisiyor(karakter: string | null | undefined, cinsiyet: Cinsiyet | null): boolean {
  const k = karakterCinsiyeti(karakter);
  return !!cinsiyet && !!k && k !== cinsiyet;
}

/**
 * İşe alımın karakteri: kurulun seçtiği korunur; seçilmediyse adın cinsiyetine ve role uyan boş karakter. Ekip
 * dosyasından içe aktarılan karakter (eski sürüm yalnız role bakıyordu) adla çelişiyorsa uyumlu boş karakterle değişir.
 */
export function iseAlimKarakteri(g: { ad: string; rol: string; secilen: string | null | undefined; kullanilan: string[]; tohum: string; iceAktarma: boolean }): string {
  const cinsiyet = adCinsiyeti(g.ad);
  if (g.secilen) {
    if (!g.iceAktarma || !celisiyor(g.secilen, cinsiyet)) return g.secilen;
    return bosKarakter(KARAKTERLER, g.rol, new Set(g.kullanilan), cinsiyet)?.id ?? g.secilen;
  }
  return karakterSec(g.rol, g.kullanilan, g.tohum, cinsiyet);
}

/**
 * 0.0.8 göçü, bir kez: adının cinsiyeti bilinen ve karakteri buna ters düşen çalışan aynı cinsiyetteki boş bir
 * karaktere geçer (önce role uyan). Yalnız görünüş (ve ona bağlı kişilik metni) değişir; ad, rol ve geçmiş aynı kalır.
 * Uygun boş karakter yoksa dokunulmaz. Değişen çalışanlar döner; ekip dosyalarını çağıran yazar.
 */
export function karakterUyumuGocu(depo: Pick<Depo, "deger" | "degerYaz" | "projeler" | "ajanlar" | "ajanGuncelle">): Ajan[] {
  if (depo.deger(KARAKTER_UYUMU_GOCU)) return [];
  const degisen: Ajan[] = [];
  for (const p of depo.projeler()) {
    // İşe alınış sırasıyla: önce gelen boş karakteri önce alır (karakterleriTamamla ile aynı sıra)
    const ajanlar = [...depo.ajanlar(p.id)].sort((a, b) => a.olusturma.localeCompare(b.olusturma) || a.id.localeCompare(b.id));
    const karakterler = new Map(ajanlar.map((a) => [a.id, a.karakter] as const));
    for (const a of ajanlar) {
      const cinsiyet = adCinsiyeti(a.ad);
      if (!celisiyor(a.karakter, cinsiyet)) continue;
      const dolu = new Set([...karakterler].filter(([id, k]) => id !== a.id && !!k).map(([, k]) => k!));
      const yeni = bosKarakter(KARAKTERLER, a.rol, dolu, cinsiyet);
      if (!yeni) continue;
      karakterler.set(a.id, yeni.id);
      degisen.push(depo.ajanGuncelle(a.id, { karakter: yeni.id }));
    }
  }
  depo.degerYaz(KARAKTER_UYUMU_GOCU, new Date().toISOString());
  return degisen;
}
