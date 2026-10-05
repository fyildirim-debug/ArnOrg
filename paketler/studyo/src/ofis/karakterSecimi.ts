// Ajanlara ofis karakteri atama: kayıtlı karakter > önceki atama > ada ve role uyan boş > ilk boş > kimlik özeti.
// Proje içinde kararlıdır: aynı ajan, ekip değişse de aynı karakterde kalır. Adın cinsiyeti biliniyorsa yalnız o
// cinsiyetteki karakterler aday olur (çekirdekteki karakterSec ile aynı kural, @arnorg/ortak).
import { adCinsiyeti, type Cinsiyet } from "@arnorg/ortak/cinsiyet";
import { bosKarakter, karakterCinsiyeti } from "@arnorg/ortak/karakterler";

export interface KarakterAdayi {
  id: string;
  roller: string[];
}

export interface SecimAjani {
  id: string;
  rol: string;
  karakter: string | null;
  olusturma: string;
  /** Ajanın adı: ilk adın cinsiyetine uyan karakter seçilir */
  ad?: string;
}

/** FNV-1a 32 bit özet */
export function ozet(metin: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < metin.length; i++) {
    h ^= metin.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Boş uygun karakter yoksa kimlikten kararlı seçim; cinsiyet biliniyorsa o cinsiyetteki karakterlerden */
function ozettenSec<T extends KarakterAdayi>(katalog: readonly T[], cinsiyet: Cinsiyet | null, tohum: string): T {
  const uyan = cinsiyet ? katalog.filter((k) => karakterCinsiyeti(k.id) === cinsiyet) : [];
  const havuz = uyan.length ? uyan : katalog;
  return havuz[ozet(tohum) % havuz.length]!;
}

/** Karakterin görünüşü adın bilinen cinsiyetine ters mi */
function celisir(karakter: string, ad: string | undefined): boolean {
  const c = adCinsiyeti(ad);
  const k = karakterCinsiyeti(karakter);
  return !!c && !!k && k !== c;
}

/**
 * Her ajana bir karakter kimliği atar.
 * onceki: daha önce yapılmış atamalar (kalıcılık için); kayıtlı karakteri olan ajanın seçimi her zaman öndedir.
 * Önceki otomatik atama ajanın adıyla çelişiyorsa (eski sürüm yalnız role bakıyordu) yeniden seçilir.
 */
export function karakterleriAta(ajanlar: SecimAjani[], katalog: KarakterAdayi[], onceki: Record<string, string> = {}): Map<string, string> {
  const sonuc = new Map<string, string>();
  if (!katalog.length) return sonuc;
  const gecerli = new Set(katalog.map((k) => k.id));
  const kullanilan = new Set<string>();
  const sirali = [...ajanlar].sort((a, b) => a.olusturma.localeCompare(b.olusturma) || a.id.localeCompare(b.id));

  // 1) Ajanın kendi kaydındaki karakter
  for (const a of sirali) {
    if (a.karakter && gecerli.has(a.karakter)) {
      sonuc.set(a.id, a.karakter);
      kullanilan.add(a.karakter);
    }
  }
  // 2) Önceki atama, başkası almadıysa ve adla çelişmiyorsa
  for (const a of sirali) {
    if (sonuc.has(a.id)) continue;
    const k = onceki[a.id];
    if (k && gecerli.has(k) && !kullanilan.has(k) && !celisir(k, a.ad)) {
      sonuc.set(a.id, k);
      kullanilan.add(k);
    }
  }
  // 3) Kurallar: adın cinsiyetine ve role uyan ilk boş, yoksa o cinsiyette ilk boş, o da yoksa kimlik özeti
  for (const a of sirali) {
    if (sonuc.has(a.id)) continue;
    const cinsiyet = adCinsiyeti(a.ad);
    const secilen = bosKarakter(katalog, a.rol, kullanilan, cinsiyet) ?? ozettenSec(katalog, cinsiyet, a.id);
    sonuc.set(a.id, secilen.id);
    kullanilan.add(secilen.id);
  }
  return sonuc;
}

/** Henüz işe alınmamış bir aday için (siluet, işe alım formu) adına ve role uyan boş karakter */
export function adayKarakteri(rol: string, katalog: KarakterAdayi[], kullanilan: Iterable<string>, tohum: string, ad?: string | null): string | null {
  if (!katalog.length) return null;
  const cinsiyet = adCinsiyeti(ad);
  return (bosKarakter(katalog, rol, new Set(kullanilan), cinsiyet) ?? ozettenSec(katalog, cinsiyet, tohum)).id;
}
