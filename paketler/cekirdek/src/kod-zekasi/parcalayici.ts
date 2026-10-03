// Dosyayı arama parçalarına böler: sembole dayalı (fonksiyon, sınıf, metot, başlık), ~40–80 satır, en çok ~1800 karakter.
// Büyük sınıflar metotlarına, uzun gövdeler küçük örtüşmeli pencerelere ayrılır; sembol dışındaki satırlar
// (içe aktarmalar, üst düzey kod) ve sembolü olmayan dosyalar kayan pencereyle parçalanır.
import type { KodSembolTuru } from "@arnorg/ortak";
import type { SembolBilgisi } from "./semboller.js";

export interface Parca {
  /** 1 tabanlı, kapsayıcı */
  bas: number;
  bit: number;
  /** Parçanın asıl sembolü (metotlarda "Sinif.metod") */
  sembol: string | null;
  sembolTuru: KodSembolTuru | null;
  /** Parçadaki diğer semboller (küçük tanımlar birleştirilince) */
  digerSemboller: string[];
  /** Kod satırları (uzun satırlar kırpılmış) */
  kod: string;
}

export const PARCA_HEDEF_SATIR = 60;
export const PARCA_EN_COK_SATIR = 80;
export const PARCA_EN_COK_KARAKTER = 1800;
const ORTUSME = 5;
const KUCUK_PARCA = 12;
const UZUN_SATIR = 400;

const KAPSAYICI_TURLER = new Set<KodSembolTuru>(["sinif", "arayuz", "yapi", "modul", "enum", "baslik", "secici"]);

interface Birim {
  bas: number;
  bit: number;
  sembol: string | null;
  tur: KodSembolTuru | null;
  diger: string[];
}

function satirMetni(satirlar: string[], bas: number, bit: number): string {
  const parcalar: string[] = [];
  for (let s = bas; s <= bit; s++) {
    const L = satirlar[s - 1] ?? "";
    parcalar.push(L.length > UZUN_SATIR ? `${L.slice(0, UZUN_SATIR)}…` : L);
  }
  return parcalar.join("\n");
}

function karakter(satirlar: string[], bas: number, bit: number): number {
  let n = 0;
  for (let s = bas; s <= bit; s++) n += Math.min(UZUN_SATIR, (satirlar[s - 1] ?? "").length) + 1;
  return n;
}

function bosMu(satirlar: string[], bas: number, bit: number): boolean {
  for (let s = bas; s <= bit; s++) if ((satirlar[s - 1] ?? "").trim()) return false;
  return true;
}

/** Aralığı satır ve karakter sınırına uyan, küçük örtüşmeli pencerelere böler */
function pencereler(satirlar: string[], bas: number, bit: number, b: Omit<Birim, "bas" | "bit">): Birim[] {
  const sonuc: Birim[] = [];
  let s = bas;
  while (s <= bit) {
    let son = Math.min(bit, s + PARCA_HEDEF_SATIR - 1);
    while (son > s && karakter(satirlar, s, son) > PARCA_EN_COK_KARAKTER) son = s + Math.floor((son - s) * 0.75);
    // Kalan kısa kuyruk ayrı parça olmasın
    if (bit - son < KUCUK_PARCA && bit - s + 1 <= PARCA_EN_COK_SATIR && karakter(satirlar, s, bit) <= PARCA_EN_COK_KARAKTER) son = bit;
    if (!bosMu(satirlar, s, son)) sonuc.push({ ...b, bas: s, bit: son });
    if (son >= bit) break;
    s = Math.max(s + 1, son + 1 - Math.min(ORTUSME, Math.floor((son - s + 1) / 4)));
  }
  return sonuc;
}

function sigarMi(satirlar: string[], bas: number, bit: number): boolean {
  return bit - bas + 1 <= PARCA_EN_COK_SATIR && karakter(satirlar, bas, bit) <= PARCA_EN_COK_KARAKTER;
}

/** Sembolü birimlere çevirir: sığarsa tek birim, sığmayan kapsayıcı üyelerine, sığmayan gövde pencerelere ayrılır */
function sembolBirimleri(satirlar: string[], s: SembolBilgisi, uyeler: SembolBilgisi[], ad: string): Birim[] {
  if (sigarMi(satirlar, s.bas, s.bit)) return [{ bas: s.bas, bit: s.bit, sembol: ad, tur: s.tur, diger: [] }];
  if (KAPSAYICI_TURLER.has(s.tur) && uyeler.length) {
    const sonuc: Birim[] = [];
    let imlec = s.bas;
    for (const u of uyeler) {
      if (u.bas < imlec) continue;
      // Kapsayıcının başlığı ve üyeler arasındaki alanlar
      if (u.bas > imlec && !bosMu(satirlar, imlec, u.bas - 1)) sonuc.push(...pencereler(satirlar, imlec, u.bas - 1, { sembol: ad, tur: s.tur, diger: [] }));
      const uyeAd = s.tur === "baslik" ? u.ad : `${ad}.${u.ad}`;
      sonuc.push(...(sigarMi(satirlar, u.bas, u.bit) ? [{ bas: u.bas, bit: u.bit, sembol: uyeAd, tur: u.tur, diger: [] }] : pencereler(satirlar, u.bas, u.bit, { sembol: uyeAd, tur: u.tur, diger: [] })));
      imlec = u.bit + 1;
    }
    if (imlec <= s.bit && !bosMu(satirlar, imlec, s.bit)) sonuc.push(...pencereler(satirlar, imlec, s.bit, { sembol: ad, tur: s.tur, diger: [] }));
    return sonuc;
  }
  return pencereler(satirlar, s.bas, s.bit, { sembol: ad, tur: s.tur, diger: [] });
}

/** Ardışık küçük birimleri sınırları aşmadan birleştirir */
function birlestir(satirlar: string[], birimler: Birim[]): Birim[] {
  const sonuc: Birim[] = [];
  for (const b of birimler) {
    const onceki = sonuc[sonuc.length - 1];
    const kucuk = (x: Birim) => x.bit - x.bas + 1 < KUCUK_PARCA;
    if (onceki && (kucuk(onceki) || kucuk(b)) && b.bas <= onceki.bit + 3 && b.bit - onceki.bas + 1 <= PARCA_HEDEF_SATIR && karakter(satirlar, onceki.bas, b.bit) <= PARCA_EN_COK_KARAKTER) {
      const ad = b.sembol;
      // Kapsayıcının üyeler arası boşluğu ("Sinif") üyeyle ("Sinif.metod") birleşince üye asıl sembol olur
      const kapsayicisi = (ust: string | null, alt: string | null) => Boolean(ust && alt && alt.startsWith(`${ust}.`));
      if (!onceki.sembol || kapsayicisi(onceki.sembol, ad)) {
        onceki.sembol = ad;
        onceki.tur = b.tur;
      } else if (ad && ad !== onceki.sembol && !kapsayicisi(ad, onceki.sembol) && !onceki.diger.includes(ad)) onceki.diger.push(ad);
      onceki.bit = Math.max(onceki.bit, b.bit);
      continue;
    }
    sonuc.push({ ...b, diger: [...b.diger] });
  }
  return sonuc;
}

export function parcala(metin: string, semboller: SembolBilgisi[]): Parca[] {
  const satirlar = metin.split("\n");
  const n = satirlar.length;
  if (!metin.trim()) return [];
  // Kapsayıcısının aralığında olmayan üyeler (Go alıcılı metotlar, Rust impl metotları) üst düzey sayılır
  const adla = new Map<string, SembolBilgisi[]>();
  for (const s of semboller) adla.set(s.ad, [...(adla.get(s.ad) ?? []), s]);
  const kapsanir = (u: SembolBilgisi) => Boolean(u.ust && adla.get(u.ust)?.some((s) => s !== u && s.bas <= u.bas && s.bit >= u.bit));
  const ustDuzey = semboller.filter((s) => !kapsanir(s)).sort((a, b) => a.bas - b.bas || b.bit - a.bit);
  const birimler: Birim[] = [];
  let imlec = 1;
  const bosluk = (bas: number, bit: number) => {
    if (bit >= bas && !bosMu(satirlar, bas, bit)) birimler.push(...pencereler(satirlar, bas, bit, { sembol: null, tur: null, diger: [] }));
  };
  for (const s of ustDuzey) {
    if (s.bit < imlec) continue;
    const bas = Math.max(s.bas, imlec);
    bosluk(imlec, bas - 1);
    const uyeler = semboller.filter((u) => u.ust === s.ad && u.bas > bas && u.bit <= s.bit).sort((a, b) => a.bas - b.bas);
    const ad = s.ust && s.tur === "metod" ? `${s.ust}.${s.ad}` : s.ad;
    birimler.push(...sembolBirimleri(satirlar, { ...s, bas }, uyeler, ad));
    imlec = s.bit + 1;
  }
  bosluk(imlec, n);
  return birlestir(satirlar, birimler).map((b) => ({
    bas: b.bas,
    bit: b.bit,
    sembol: b.sembol,
    sembolTuru: b.tur,
    digerSemboller: b.diger.slice(0, 12),
    kod: satirMetni(satirlar, b.bas, b.bit),
  }));
}

/** Gömme modeline giden metin: bağlam başlığı (yol, sembol, tür) ve kod. Aynı metin aynı vektörü verir; alanlar arasında paylaşılır. */
export function gommeMetni(yol: string, p: Pick<Parca, "sembol" | "sembolTuru" | "digerSemboller" | "kod">): string {
  const baslik = [yol, p.sembol ? `${p.sembol}${p.sembolTuru ? ` (${p.sembolTuru})` : ""}` : null, p.digerSemboller.length ? p.digerSemboller.join(", ") : null]
    .filter(Boolean)
    .join(" · ");
  return `${baslik}\n${p.kod}`;
}
