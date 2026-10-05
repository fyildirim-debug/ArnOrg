// Tanıtım görünümünün saf yardımcıları: README'deki bağlantı ve görsel adreslerinin anlamı (dış adres, başlık çapası,
// repo içi dosya), görselin türü, başlık çapaları, gösterilen sürüm ve kurulun isteğinin hâlâ bekleyip beklemediği.
// DOM'a dokunmaz.
import type { TanitimDurumu } from "@arnorg/ortak";

/** README'deki bir adresin anlamı: dış adres olduğu gibi kalır; çapa başlığa, yerel yol repo kökündeki dosyaya gider */
export type ReadmeAdresi = { tur: "dis" } | { tur: "capa"; capa: string } | { tur: "yerel"; yol: string } | { tur: "gecersiz" };

function coz(metin: string): string {
  try {
    return decodeURIComponent(metin);
  } catch {
    return metin;
  }
}

/** Başlık çapası (GitHub'daki gibi): küçük harf, noktalama atılır, her boşluk tire olur */
export function capa(metin: string): string {
  return metin
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Aynı başlık ikinci kez geçerse çapası -1, -2 ekiyle ayrılır */
export function benzersizCapa(aday: string, kullanilan: Map<string, number>): string {
  const sayi = kullanilan.get(aday);
  kullanilan.set(aday, (sayi ?? -1) + 1);
  return sayi === undefined ? aday : `${aday}-${sayi + 1}`;
}

/**
 * Adres README'ye göre çözülür (README repo kökündedir): "docs/a.png", "./docs/a.png" ve "/docs/a.png" aynı dosyadır.
 * Şemalı (https:, mailto:, data:) ve protokolsüz (//ornek.com) adres dıştır; kökün dışına çıkan yol geçersizdir.
 */
export function readmeAdresi(ham: string): ReadmeAdresi {
  const adres = ham.trim();
  if (!adres) return { tur: "gecersiz" };
  if (adres.startsWith("#")) return { tur: "capa", capa: capa(coz(adres.slice(1))) };
  // Windows sürücü yolu (C:\…) şema sanılmasın
  if (/^[a-z]:[\\/]/i.test(adres)) return { tur: "gecersiz" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(adres) || adres.startsWith("//")) return { tur: "dis" };
  const parcalar: string[] = [];
  for (const p of coz(adres.split(/[?#]/)[0]!).replace(/\\/g, "/").split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") {
      if (!parcalar.length) return { tur: "gecersiz" };
      parcalar.pop();
      continue;
    }
    parcalar.push(p);
  }
  return parcalar.length ? { tur: "yerel", yol: parcalar.join("/") } : { tur: "gecersiz" };
}

const GORSEL_TURLERI: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

/** Görselin türü uzantısından (çekirdek ham bayt gönderir); görsel değilse null */
export function gorselTuru(yol: string): string | null {
  const uzanti = /\.([a-z0-9]+)$/i.exec(yol)?.[1]?.toLowerCase();
  return (uzanti && GORSEL_TURLERI[uzanti]) || null;
}

export type Surum = "yayinda" | "taslak";

/** Gösterilecek sürüm: seçilen taslak varsa o; yoksa yayındaki, o da yoksa taslak; ikisi de yoksa null */
export function gosterilenSurum(d: Pick<TanitimDurumu, "var" | "taslak">, secim: Surum): Surum | null {
  if (secim === "taslak" && d.taslak) return "taslak";
  if (d.var) return "yayinda";
  return d.taslak ? "taslak" : null;
}

/** Kurulun son güncelleme isteği hâlâ bekliyor mu: istekten sonra README ne yayında ne taslakta değişti */
export function istekBekliyor(d: Pick<TanitimDurumu, "guncellemeIstendi" | "son" | "taslak">): boolean {
  if (!d.guncellemeIstendi) return false;
  const istek = Date.parse(d.guncellemeIstendi);
  const son = Math.max(d.son ? Date.parse(d.son.zaman) : 0, d.taslak ? Date.parse(d.taslak.zaman) : 0);
  return son < istek;
}
