// Canlı yayın yönetmeni: kamera kendiliğinden çalışanlar ve olaylar arasında dolaşır. Saf mantık: motor her karede
// adayları (ilginçlik puanıyla) verir; yönetmen hangi çekimde kalınacağına ya da hangisine geçileceğine karar verir.
//
// Olay (kutlama, birleşme, işe alım, onay) taze ise hemen ona kesilir ve kısa kalınır. Yoksa çekim süresi dolunca
// en ilginç ve yakında gösterilmemiş kişiye geçilir. Hedef kaybolursa (ayrıldı) beklemeden yenisi seçilir.

export interface YayinAdayi {
  /** Kişi kimliği ya da olay anahtarı ("olay:3") */
  id: string;
  /** İlginçlik: yürüyen, konuşan, toplantıdaki, kanat odalarında çalışan öne çıkar */
  puan: number;
  /** Olaysa doğduğu an */
  olay?: number;
}

export interface Cekim {
  hedef: string | null;
  bas: number;
  /** Bu çekimde en az kalınacak süre */
  sure: number;
  /** Son gösterilenler (tekrar etmesin) */
  gecmis: string[];
}

/** Kişi çekimi ve olay çekimi süreleri (ms) */
export const KISI_CEKIMI = 9000;
export const OLAY_CEKIMI = 6500;
/** Olay bu kadar taze ise kesilir */
const OLAY_TAZE = 5000;
/** Bir olay çekimi sürerken yeni olay en erken bu kadar sonra keser */
const OLAY_ARASI = 3000;

export function yeniCekim(): Cekim {
  return { hedef: null, bas: -Infinity, sure: 0, gecmis: [] };
}

/**
 * Sıradaki çekim. rastgele: eşit puanlılar arasında seçim (test için verilebilir). Değişmediyse aynı nesne döner.
 */
export function sonrakiCekim(adaylar: readonly YayinAdayi[], c: Cekim, simdi: number, rastgele: () => number = Math.random): Cekim {
  const mevcut = c.hedef ? adaylar.find((a) => a.id === c.hedef) : undefined;
  const gecti = simdi - c.bas;
  // Taze olay: en yenisi; yürüyen olay çekimi çok yeni değilse keser
  const olaylar = adaylar.filter((a) => a.olay !== undefined && simdi - a.olay <= OLAY_TAZE && a.id !== c.hedef);
  const olayCekiminde = !!mevcut && mevcut.olay !== undefined;
  if (olaylar.length && !(olayCekiminde && gecti < OLAY_ARASI)) {
    const en = olaylar.reduce((a, b) => ((b.olay ?? 0) > (a.olay ?? 0) ? b : a));
    return cekimeGec(c, en.id, simdi, OLAY_CEKIMI);
  }
  if (mevcut && gecti < c.sure) return c;
  // Süre doldu ya da hedef yok: yakında gösterilmeyenlerden en ilginci (olay çekimi bittiyse olay seçilmez)
  const kisiler = adaylar.filter((a) => a.olay === undefined && a.puan > 0);
  if (!kisiler.length) return c.hedef === null ? c : { ...c, hedef: null, bas: simdi, sure: 0 };
  const yeni = kisiler.filter((a) => !c.gecmis.includes(a.id) && a.id !== c.hedef);
  const havuz = yeni.length ? yeni : kisiler.filter((a) => a.id !== c.hedef).length ? kisiler.filter((a) => a.id !== c.hedef) : kisiler;
  const enYuksek = Math.max(...havuz.map((a) => a.puan));
  // En yüksek puanın yakınındakiler arasından seç: hep aynı kişi seçilmesin
  const secenek = havuz.filter((a) => a.puan >= enYuksek - 10);
  const secilen = secenek[Math.min(secenek.length - 1, Math.floor(rastgele() * secenek.length))]!;
  if (mevcut && secilen.id === c.hedef) return { ...c, bas: simdi, sure: KISI_CEKIMI };
  return cekimeGec(c, secilen.id, simdi, KISI_CEKIMI);
}

function cekimeGec(c: Cekim, hedef: string, simdi: number, sure: number): Cekim {
  const gecmis = [hedef, ...c.gecmis.filter((g) => g !== hedef)].slice(0, 3);
  return { hedef, bas: simdi, sure, gecmis };
}
