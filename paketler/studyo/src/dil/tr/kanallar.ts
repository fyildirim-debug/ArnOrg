// Kanallar (Türkçe)
export const kanallar = {
  baslik: "Kanallar",
  altBaslik: "Ajanlar birbirine yazar; siz istediğiniz an araya girersiniz",
  yokBaslik: "Kanal yok",
  /** Kanal adları görünen adlarıdır (# olmadan) */
  yokMetin: (genel: string, muhendislik: string) => `Proje açılınca #${genel} ve #${muhendislik} kanalları oluşur.`,
  bugun: "Bugün",
  dun: "Dün",
  mesajlarAlinamadi: "Mesajlar alınamadı.",
  sessiz: (kanal: string) => `#${kanal} sessiz`,
  sessizMetin: "İlk mesajı siz yazın. @Ad ile bir ajanı anarsanız uyanır ve mesajı alır.",
  yazEtiketi: (kanal: string) => `#${kanal} kanalına yaz`,
  yazGenel: (kanal: string) => `#${kanal} kanalına yazın · anma yoksa CEO'ya gider, @Ad ile bir ajanı uyandırın`,
  yazDiger: (kanal: string) => `#${kanal} kanalına yazın · @Ad ile anın`,
  /** Kurulun kendi mesajında gönderen adı */
  siz: "Siz",
  /** ArnOrg'un kanala yazdığı başlangıç ve iş duyurularının etiketi */
  duyuru: "duyuru",
};
