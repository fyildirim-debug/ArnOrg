// Kanallar ekranının kuralları. Kurul ile CEO'nun bire bir sohbeti (#yonetim) Karargâh'taki CEO sohbetinde görünür;
// Kanallar ekranının listesinde, içeriğinde ve rozetinde, Karargâh'ın canlı akışında yoktur. Ona giden bağlantılar
// Karargâh'a açılır. Liste ArnOrg'un ve ajanların kanallarıyla kurulun kurduğu kanalları ayrı gösterir.
import { ARNORG_GONDEREN, KANAL_ADI_DESENI, kanalAdiDuzelt, sistemKanaliMi, type Kanal, type Mesaj } from "@arnorg/ortak";

/** Kurul ile CEO'nun bire bir kanalı */
export const CEO_KANALI = "yonetim";

/** Kanallar ekranında (liste, içerik, okunmamış rozeti) ve Karargâh'ın canlı akışında gösterilmeyen kanallar */
export const KANALLARDA_YOK: readonly string[] = [CEO_KANALI];

export function kanallardaGorunur(ad: string): boolean {
  return !KANALLARDA_YOK.includes(ad);
}

/** Kanallar ekranının listesi: CEO sohbeti çıkar; ArnOrg'un ve ajanların kanalları ile kurulun kurdukları ayrılır */
export function kanalGruplari<T extends Pick<Kanal, "ad" | "ozel">>(kanallar: readonly T[]): { sirket: T[]; kurulun: T[] } {
  const gorunen = kanallar.filter((k) => kanallardaGorunur(k.ad));
  return { sirket: gorunen.filter((k) => !k.ozel), kurulun: gorunen.filter((k) => k.ozel) };
}

/** Kanallar rozetine sayılan okunmamış mesajlar (CEO sohbetininkiler sayılmaz) */
export function kanallarOkunmamis(okunmamis: Readonly<Record<string, number>>): number {
  return Object.entries(okunmamis).reduce((t, [kanal, n]) => (kanallardaGorunur(kanal) ? t + n : t), 0);
}

/** Bir kanala giden bağlantının açacağı ekran: CEO sohbeti Karargâh'ta, diğerleri Kanallar'da */
export function kanalEkrani(kanal: string | undefined): "karargah" | "kanallar" {
  return kanal && !kanallardaGorunur(kanal) ? "karargah" : "kanallar";
}

/** Konuşmanın son başlangıcından beri kanala düşen mesajlar (ArnOrg duyuruları hariç); başlangıç yoksa null */
export function konusmaMesajSayisi(kanal: Pick<Kanal, "konusmaBaslangic">, mesajlar: readonly Mesaj[] | undefined): number | null {
  const bas = kanal.konusmaBaslangic;
  if (!bas || !mesajlar) return null;
  return mesajlar.filter((m) => m.zaman >= bas && m.gonderenId !== ARNORG_GONDEREN).length;
}

export type KanalAdiSorunu = "bos" | "gecersiz" | "sistem" | "var";

/** Kanal kurarken yazılan adın kimliği ve (varsa) sorunu; çekirdeğin denetimiyle aynı kurallar */
export function kanalAdiDenetle(ham: string, kanallar: readonly Pick<Kanal, "ad">[]): { ad: string; sorun: KanalAdiSorunu | null } {
  const ad = kanalAdiDuzelt(ham);
  if (!ad) return { ad, sorun: "bos" };
  if (!KANAL_ADI_DESENI.test(ad)) return { ad, sorun: "gecersiz" };
  if (sistemKanaliMi(ad)) return { ad, sorun: "sistem" };
  if (kanallar.some((k) => k.ad === ad)) return { ad, sorun: "var" };
  return { ad, sorun: null };
}
