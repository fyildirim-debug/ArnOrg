// Ajan araçlarının girdisini onarır. Küçük modeller ara sıra araç çağrısının biçimini bir metin alanının içine
// sızdırır: `"ozet": "Hazır.</ozet>\n<parameter name=\"calistir\">npm test"` gibi. Sızan parça kesilir; adı geçen
// alan boşsa ve metin bekliyorsa değeriyle doldurulur. Böylece kurulun gördüğü teslim, onay ve mesaj metinleri temiz kalır.

/** Sızıntının başladığı yer: kapanan etiket ardından parametre açılışı ya da çıplak parametre açılışı */
const SIZINTI = /\s*(?:<\/[\w-]+>\s*)?<parameter name="([\w-]+)">/;
const PARAMETRE = /<parameter name="([\w-]+)">([\s\S]*?)(?=<parameter name="|$)/g;
/** Değerin sonunda kalan kapanış etiketleri (</parameter>, </invoke>, </invoke> …) */
const SONDAKI_ETIKETLER = /(?:\s*<\/[\w:-]+>)+\s*$/;

function temizDeger(v: string): string {
  return v.replace(SONDAKI_ETIKETLER, "").trim();
}

function bosMu(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/**
 * Girdinin metin alanlarındaki sızıntıyı ayıklar. `metinAlanlari` verilirse yalnız bu adlardaki boş alanlar sızan
 * değerle doldurulur (dizi ya da sayı bekleyen alanlar metinle bozulmasın diye); verilmezse girdide metin olarak
 * duran ya da hiç olmayan alanlar doldurulabilir. Sızıntı yoksa girdi aynen döner.
 */
export function aracGirdisiniOnar<T extends Record<string, unknown>>(girdi: T, metinAlanlari?: readonly string[]): T {
  let degisti = false;
  const sonuc: Record<string, unknown> = { ...girdi };
  const doldurulacak: [string, string][] = [];
  for (const [ad, deger] of Object.entries(girdi)) {
    if (typeof deger !== "string") continue;
    const m = SIZINTI.exec(deger);
    if (!m) continue;
    degisti = true;
    sonuc[ad] = temizDeger(deger.slice(0, m.index));
    for (const p of deger.slice(m.index).matchAll(PARAMETRE)) doldurulacak.push([p[1]!, temizDeger(p[2] ?? "")]);
  }
  if (!degisti) return girdi;
  for (const [ad, deger] of doldurulacak) {
    if (!deger || !bosMu(sonuc[ad])) continue;
    const metinBekler = metinAlanlari ? metinAlanlari.includes(ad) : sonuc[ad] === undefined || typeof sonuc[ad] === "string" || sonuc[ad] === null;
    if (metinBekler) sonuc[ad] = deger;
  }
  return sonuc as T;
}
