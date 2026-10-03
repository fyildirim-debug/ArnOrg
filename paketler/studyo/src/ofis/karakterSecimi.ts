// Ajanlara ofis karakteri atama: kayıtlı karakter > önceki atama > role uyan boş > ilk boş > kimlik özeti.
// Proje içinde kararlıdır: aynı ajan, ekip değişse de aynı karakterde kalır.

export interface KarakterAdayi {
  id: string;
  roller: string[];
}

export interface SecimAjani {
  id: string;
  rol: string;
  karakter: string | null;
  olusturma: string;
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

/**
 * Her ajana bir karakter kimliği atar.
 * onceki: daha önce yapılmış atamalar (kalıcılık için); kayıtlı karakteri olan ajanın seçimi her zaman öndedir.
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
  // 2) Önceki atama, başkası almadıysa
  for (const a of sirali) {
    if (sonuc.has(a.id)) continue;
    const k = onceki[a.id];
    if (k && gecerli.has(k) && !kullanilan.has(k)) {
      sonuc.set(a.id, k);
      kullanilan.add(k);
    }
  }
  // 3) Kurallar: role uyan ilk boş, yoksa ilk boş, o da yoksa kimlik özeti
  for (const a of sirali) {
    if (sonuc.has(a.id)) continue;
    const bos = katalog.filter((k) => !kullanilan.has(k.id));
    const secilen = bos.find((k) => k.roller.includes(a.rol)) ?? bos[0] ?? katalog[ozet(a.id) % katalog.length]!;
    sonuc.set(a.id, secilen.id);
    kullanilan.add(secilen.id);
  }
  return sonuc;
}

/** Henüz işe alınmamış bir aday için (siluet) role uyan boş karakter */
export function adayKarakteri(rol: string, katalog: KarakterAdayi[], kullanilan: Iterable<string>, tohum: string): string | null {
  if (!katalog.length) return null;
  const dolu = new Set(kullanilan);
  const bos = katalog.filter((k) => !dolu.has(k.id));
  return (bos.find((k) => k.roller.includes(rol)) ?? bos[0] ?? katalog[ozet(tohum) % katalog.length]!).id;
}
