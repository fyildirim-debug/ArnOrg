// Sahte çekirdeğin dili: ARNORG_DIL=en ile tohum verisi ve canlı metinler İngilizce; verilmezse ya da "tr" ise Türkçe.
// Dil açılışta seçilir; Ayarlar'dan dil değişse de veri ve canlı metinler açılıştaki dilde kalır.

export const DIL = process.env.ARNORG_DIL === "en" ? "en" : "tr";

/** Canlı metnin açılış dilindeki hâli; Türkçesi ve İngilizcesi yan yana yazılır: ceviri("Görev bulunamadı.", "Task not found.") */
export const ceviri = (tr, en) => (DIL === "en" ? en : tr);

/** Sistem kanallarının İngilizce görünen adları (ortak: kanalGorunenAdi); kimlikleri iki dilde aynıdır */
const KANAL_ADLARI_EN = { genel: "general", yonetim: "ceo", toplanti: "meetings" };

/** Kanalın metinde anılan adı (# olmadan) */
export const kanalGorunenAdi = (kanal) => (DIL === "en" ? (KANAL_ADLARI_EN[kanal] ?? kanal) : kanal);
