// Kanal ve CEO sohbeti için saf yardımcılar: güne ayırma, ardışık mesajları birleştirme, alıntı ayırma,
// kanallardaki son mesajları tek akışta birleştirme
import type { Mesaj } from "@arnorg/ortak";

export interface MesajGrubu {
  gun: string;
  mesajlar: { m: Mesaj; devam: boolean }[];
}

/** Aynı göndericinin, başlıklı ilk mesajından bu süre içindeki ardışık mesajları tek başlık altında birleşir */
export const BIRLESME_MS = 5 * 60_000;

/**
 * Mesajları güne ayırır; aynı göndericinin ardışık mesajlarını birleştirir (devam). Süre başlıklı ilk mesajdan sayılır:
 * dakikada bir yazan biri saatlerce tek başlık altında kalmaz.
 * gunAnahtari: zaman damgasından gün etiketi (ör. "4 Ekim 2026")
 */
export function gunlereAyir(mesajlar: readonly Mesaj[], gunAnahtari: (zaman: string) => string): MesajGrubu[] {
  const gruplar: MesajGrubu[] = [];
  let bas: Mesaj | null = null;
  for (const m of mesajlar) {
    const gun = gunAnahtari(m.zaman);
    let g = gruplar[gruplar.length - 1];
    if (!g || g.gun !== gun) {
      g = { gun, mesajlar: [] };
      gruplar.push(g);
      bas = null;
    }
    const devam = !!bas && bas.gonderenId === m.gonderenId && Date.parse(m.zaman) - Date.parse(bas.zaman) < BIRLESME_MS;
    g.mesajlar.push({ m, devam });
    if (!devam) bas = m;
  }
  return gruplar;
}

/**
 * Gün ayracının etiketi: bugün ve dün adıyla, diğer günler tarihle.
 * tarihBicimi gün anahtarını üreten biçimdir (gunlereAyir'a verilenle aynı)
 */
export function gunEtiketi(gun: string, tarihBicimi: (zaman: string) => string, s: { bugun: string; dun: string }, simdi = Date.now()): string {
  if (gun === tarihBicimi(new Date(simdi).toISOString())) return s.bugun;
  if (gun === tarihBicimi(new Date(simdi - 86_400_000).toISOString())) return s.dun;
  return gun;
}

/**
 * Mesajın başındaki "> " ile başlayan satırlar (yanıtlanan konu) ve kalan metin.
 * CEO'ya bir bildirime yanıt yazılırken konu bu biçimde mesajın başına eklenir.
 */
export function alintiAyir(metin: string): { alinti: string | null; govde: string } {
  const satirlar = metin.replace(/\r\n/g, "\n").split("\n");
  const alinti: string[] = [];
  let i = 0;
  while (i < satirlar.length && /^>\s?/.test(satirlar[i]!)) {
    alinti.push(satirlar[i]!.replace(/^>\s?/, ""));
    i += 1;
  }
  if (!alinti.length) return { alinti: null, govde: metin };
  while (i < satirlar.length && !satirlar[i]!.trim()) i += 1;
  return { alinti: alinti.join("\n").trim() || null, govde: satirlar.slice(i).join("\n") };
}

/** Yanıtlanan konuyu mesajın başına alıntı olarak ekler */
export function alintiyla(alinti: string | null, metin: string): string {
  if (!alinti?.trim()) return metin;
  const satirlar = alinti
    .trim()
    .split("\n")
    .map((s) => `> ${s}`)
    .join("\n");
  return `${satirlar}\n\n${metin}`;
}

/**
 * Kanalların son mesajlarını zamana göre tek akışta birleştirir (eskiden yeniye); dışarıda bırakılan kanallar atlanır.
 * kanalBasina: her kanaldan en çok alınan son mesaj; sinir: akıştaki en çok mesaj
 */
export function akistaBirlestir(
  mesajlar: Readonly<Record<string, readonly Mesaj[] | undefined>>,
  kanallar: readonly string[],
  disarida: readonly string[],
  sinir = 40,
  kanalBasina = 30,
): Mesaj[] {
  const hepsi: Mesaj[] = [];
  for (const k of kanallar) {
    if (disarida.includes(k)) continue;
    const liste = mesajlar[k];
    if (liste?.length) hepsi.push(...liste.slice(-kanalBasina));
  }
  hepsi.sort((a, b) => a.zaman.localeCompare(b.zaman) || a.id.localeCompare(b.id));
  return hepsi.slice(-sinir);
}
