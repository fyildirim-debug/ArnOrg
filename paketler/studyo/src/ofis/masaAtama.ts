// Masa ataması: CEO ve CTO kendi odalarında, diğerleri açık ofiste. Atama ajan kimliğine göre kararlıdır:
// önceki atama korunur (kimse yer değiştirmez), yeni gelen işe alınma sırasıyla ilk boş masayı alır.
// Atamalar proje başına tarayıcıda saklanır; sayfa yeniden yüklenince herkes aynı masada oturur.

export interface MasaAdayi {
  id: string;
  rol: string;
  /** İşe alınma zamanı (ISO); sıralama anahtarı */
  olusturma: string;
}

export interface MasaYeri {
  kimlik: string;
  oda: "ceo" | "cto" | "muhendislik";
}

/** Açık ofis masalarının kimliği: m0, m1, … */
export function masaNo(kimlik: string): number | null {
  const m = /^m(\d+)$/.exec(kimlik);
  return m ? Number(m[1]) : null;
}

/**
 * Ajan → masa kimliği. onceki: daha önce yapılmış atama (bellek ya da depolama).
 * Sonuç girdi sırasından bağımsızdır: aynı ekip ve aynı önceki atama hep aynı sonucu verir.
 */
export function masalariAta(ajanlar: readonly MasaAdayi[], masalar: readonly MasaYeri[], onceki: Readonly<Record<string, string>> = {}): Map<string, string> {
  const sirali = [...ajanlar].sort((a, b) => a.olusturma.localeCompare(b.olusturma) || a.id.localeCompare(b.id));
  const varOlan = new Set(masalar.map((m) => m.kimlik));
  const sonuc = new Map<string, string>();
  const dolu = new Set<string>();
  const ata = (id: string, masa: string) => {
    sonuc.set(id, masa);
    dolu.add(masa);
  };
  // Yönetici odaları: ilk CEO ve ilk CTO
  for (const rol of ["ceo", "cto"] as const) {
    const sahip = sirali.find((a) => a.rol === rol && !sonuc.has(a.id));
    if (sahip && varOlan.has(rol)) ata(sahip.id, rol);
  }
  // Önceki açık ofis masası korunur (başkası almadıysa)
  for (const a of sirali) {
    if (sonuc.has(a.id)) continue;
    const m = onceki[a.id];
    if (m && masaNo(m) !== null && varOlan.has(m) && !dolu.has(m)) ata(a.id, m);
  }
  // Yeni gelenler: ilk boş masa
  const bos = masalar.filter((m) => m.oda === "muhendislik" && !dolu.has(m.kimlik));
  for (const a of sirali) {
    if (sonuc.has(a.id)) continue;
    const m = bos.shift();
    if (m) ata(a.id, m.kimlik);
  }
  return sonuc;
}

/** Önceki atamaya göre gereken açık ofis masa sayısı (en büyük masa numarası + 1) */
export function gerekenMasa(ajanlar: readonly { id: string }[], onceki: Readonly<Record<string, string>>): number {
  let enBuyuk = -1;
  for (const a of ajanlar) {
    const no = onceki[a.id] ? masaNo(onceki[a.id]!) : null;
    if (no !== null && no > enBuyuk) enBuyuk = no;
  }
  return enBuyuk + 1;
}

const anahtar = (pid: string) => `arnorg.ofis.masa.${pid}`;

export function masaAtamasiOku(pid: string): Record<string, string> {
  try {
    const ham = localStorage.getItem(anahtar(pid));
    const d = ham ? (JSON.parse(ham) as unknown) : null;
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    return Object.fromEntries(Object.entries(d as Record<string, unknown>).filter((g): g is [string, string] => typeof g[1] === "string"));
  } catch {
    return {};
  }
}

export function masaAtamasiYaz(pid: string, atama: ReadonlyMap<string, string>) {
  try {
    const metin = JSON.stringify(Object.fromEntries([...atama].sort(([a], [b]) => a.localeCompare(b))));
    if (localStorage.getItem(anahtar(pid)) !== metin) localStorage.setItem(anahtar(pid), metin);
  } catch {
    // depolama kapalı: atama yalnız bu oturumda kararlı kalır
  }
}
