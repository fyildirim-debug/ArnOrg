// Proje içinde ajan → karakter atamaları: Ofis sahnesi, avatarlar ve karakter seçici aynı sonucu görür.
// Kurallar karakterSecimi.ts'te; burada tarayıcıda saklanan önceki atamalar ve tek girdili önbellek var.
import { karakterleriAta, type SecimAjani } from "./karakterSecimi";
import type { KarakterVarligi } from "./varliklar";

const anahtar = (pid: string) => `arnorg.ofis.karakter.${pid}`;

function oku(pid: string): Record<string, string> {
  try {
    const ham = localStorage.getItem(anahtar(pid));
    return ham ? (JSON.parse(ham) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function yaz(pid: string, atamalar: Map<string, string>, onceki: Record<string, string>) {
  // Ayrılan ajanların eski ataması da kalır: geri gelirse aynı karakteri alır
  const birlesik = { ...onceki, ...Object.fromEntries(atamalar) };
  const metin = JSON.stringify(birlesik);
  try {
    if (localStorage.getItem(anahtar(pid)) !== metin) localStorage.setItem(anahtar(pid), metin);
  } catch {
    // depolama kapalı: atama yalnız bu oturumda kararlı kalır
  }
}

let onbellek: { pid: string; ajanlar: readonly SecimAjani[]; katalog: readonly KarakterVarligi[]; sonuc: Map<string, string> } | null = null;

/**
 * Projedeki ajanların karakter kimlikleri. bellek: çağıranın elindeki son atamalar (motor), saklananla birleşir.
 * Aynı ajan listesi ve katalogla tekrar çağrılınca önbellekten döner.
 */
export function projeAtamalari(pid: string, ajanlar: readonly SecimAjani[], katalog: readonly KarakterVarligi[], bellek?: Map<string, string>): Map<string, string> {
  if (!bellek && onbellek && onbellek.pid === pid && onbellek.ajanlar === ajanlar && onbellek.katalog === katalog) return onbellek.sonuc;
  const onceki = oku(pid);
  const birlesik = bellek ? { ...onceki, ...Object.fromEntries(bellek) } : onceki;
  const sonuc = karakterleriAta([...ajanlar], [...katalog], birlesik);
  yaz(pid, sonuc, onceki);
  onbellek = { pid, ajanlar, katalog, sonuc };
  return sonuc;
}
