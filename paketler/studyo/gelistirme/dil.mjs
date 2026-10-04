// Sahte çekirdeğin dili: ARNORG_DIL=en ile tohum verisi ve canlı metinler İngilizce; verilmezse ya da "tr" ise Türkçe.
// Dil açılışta seçilir; Ayarlar'dan dil değişse de veri ve canlı metinler açılıştaki dilde kalır.

export const DIL = process.env.ARNORG_DIL === "en" ? "en" : "tr";

/** Canlı metnin açılış dilindeki hâli; Türkçesi ve İngilizcesi yan yana yazılır: ceviri("Görev bulunamadı.", "Task not found.") */
export const ceviri = (tr, en) => (DIL === "en" ? en : tr);

/** Sistem kanallarının İngilizce görünen adları (ortak: kanalGorunenAdi); kimlikleri iki dilde aynıdır */
const KANAL_ADLARI_EN = { genel: "general", yonetim: "ceo", toplanti: "meetings" };

/** Kanalın metinde anılan adı (# olmadan) */
export const kanalGorunenAdi = (kanal) => (DIL === "en" ? (KANAL_ADLARI_EN[kanal] ?? kanal) : kanal);

/** Türkçe yönelme eki (ünlü uyumu): Ada'ya, Kerem'e; İngilizce metinlerde kullanılmaz */
export function yonelme(ad) {
  const k = String(ad).toLocaleLowerCase("tr-TR");
  const unlu = [...k].reverse().find((c) => "aıoueiöü".includes(c)) ?? "e";
  return `${ad}'${"aıoueiöü".includes(k.at(-1) ?? "") ? "y" : ""}${"aıou".includes(unlu) ? "a" : "e"}`;
}

/** Türkçe ayrılma eki (ünlü ve ünsüz uyumu): Ada'dan, Kerem'den, Mert'ten */
export function ayrilma(ad) {
  const k = String(ad).toLocaleLowerCase("tr-TR");
  const unlu = [...k].reverse().find((c) => "aıoueiöü".includes(c)) ?? "e";
  return `${ad}'${"çfhkpsşt".includes(k.at(-1) ?? "") ? "t" : "d"}${"aıou".includes(unlu) ? "an" : "en"}`;
}

/** Otomatik onayın varsayılan türleri (ortak'taki VARSAYILAN_OTOMATIK_ONAY_TURLERI ile aynı) */
export const VARSAYILAN_OTOMATIK_ONAY_TURLERI = ["arac", "ise_alim", "birlestirme", "anayasa", "isten_cikarma"];
