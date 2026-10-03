// Konuşma balonları için metin hazırlama: Markdown işaretlerini temizler, kısaltır

/** Markdown biçimini düz metne indirir: kod blokları, başlık, liste, bağlantı, vurgu işaretleri */
export function markdownTemizle(metin: string): string {
  return (
    metin
      // Kod blokları: içerik yerine kısa işaret
      .replace(/```[\s\S]*?```/g, " [kod] ")
      .replace(/`([^`]*)`/g, "$1")
      // Görsel ve bağlantı: yalnız metin
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Başlık, alıntı, liste işaretleri
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "· ")
      .replace(/^\s*\d+[.)]\s+/gm, "· ")
      // Tablo çizgileri
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
      .replace(/\|/g, " ")
      // Vurgu
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
      .replace(/(^|[^\w_])_(?!\s)([^_\n]+?)_(?!\w)/g, "$1$2")
      .replace(/~~(.+?)~~/g, "$1")
      // Yatay çizgi
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Sözcük ortasından kesmeden kısaltır */
export function balonMetni(metin: string, sinir = 120): string {
  const temiz = markdownTemizle(metin);
  if (temiz.length <= sinir) return temiz;
  const kesik = temiz.slice(0, sinir - 1);
  const bosluk = kesik.lastIndexOf(" ");
  return `${(bosluk > sinir * 0.6 ? kesik.slice(0, bosluk) : kesik).replace(/[\s,.;:·-]+$/, "")}…`;
}

/** Metinde geçen ajan adlarını bulur (Türkçe büyük/küçük harf duyarsız, sözcük sınırıyla) */
export function adlariBul<T extends { ad: string }>(metin: string, ajanlar: T[]): T[] {
  const kucuk = metin.toLocaleLowerCase("tr-TR");
  return ajanlar.filter((a) => {
    const ad = a.ad.toLocaleLowerCase("tr-TR");
    if (!ad) return false;
    let i = kucuk.indexOf(ad);
    while (i !== -1) {
      const once = i === 0 ? "" : kucuk[i - 1]!;
      const sonra = kucuk[i + ad.length] ?? "";
      if (!/[\p{L}\p{N}]/u.test(once) && !/[\p{L}\p{N}]/u.test(sonra === "'" || sonra === "’" ? "" : sonra)) return true;
      i = kucuk.indexOf(ad, i + 1);
    }
    return false;
  });
}
