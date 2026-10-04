// CEO brifingini tanıyan saf işlevler (BrifingMesaji bunları çizer). Mesaj dört bölümün (ortak BRIFING_BOLUMLERI)
// en az üçünü başlık satırı olarak taşıyorsa brifingdir. Başlık kalın (**Şu an**), Markdown başlığı (## Şu an) ya da
// iki noktalı düz satır (Şu an: …) olabilir; başlıktan sonra aynı satırda kalan metin bölümün ilk satırıdır. Bölümler
// yazıldığı dilde tanınır: arayüz dili sonradan değişse de eski brifingler brifing olarak görünür.
import { BRIFING_BOLUMLERI, type Dil, type Mesaj } from "@arnorg/ortak";

export type BrifingBolumTuru = "yapilan" | "suan" | "siradaki" | "karar";
const TURLER: readonly BrifingBolumTuru[] = ["yapilan", "suan", "siradaki", "karar"];

export interface BrifingBolumu {
  tur: BrifingBolumTuru;
  /** Başlık, CEO'nun yazdığı gibi (iki nokta ve işaretler atılmış) */
  baslik: string;
  /** Bölümün gövdesi (hafif Markdown); boş olabilir */
  govde: string;
}

export interface AyrilmisBrifing {
  /** Başlıkların yazıldığı dil (büyük harfe çevirme ve okuma için öğenin lang değeri) */
  dil: Dil;
  /** İlk başlıktan önceki metin (ör. "Günlük brifing · 4 Ekim"); yoksa boş */
  giris: string;
  bolumler: BrifingBolumu[];
}

/** Karşılaştırma için: Türkçe küçük harf, boşluklar tek */
const sade = (m: string) => m.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

const BASLIKLAR = (Object.entries(BRIFING_BOLUMLERI) as [Dil, readonly string[]][]).flatMap(([dil, basliklar]) =>
  basliklar.map((b, i) => ({ baslik: sade(b), tur: TURLER[i]!, dil })),
);

/** Başlığın türü ve dili; esnekse küçük ekler de kabul edilir ("Kararınızı bekleyenler", "Şu anda", "Awaiting your decisions") */
function basliktanTur(aday: string, esnek: boolean): { tur: BrifingBolumTuru; dil: Dil } | null {
  const m = sade(aday);
  return BASLIKLAR.find((b) => m === b.baslik || (esnek && m.startsWith(b.baslik) && m.length - b.baslik.length <= 4)) ?? null;
}

/** Satır bir bölüm başlığıysa türü, başlığı ve aynı satırdaki kalan metin; değilse null */
export function baslikSatiri(satir: string): { tur: BrifingBolumTuru; baslik: string; kalan: string; dil: Dil } | null {
  const basliktan = /^\s*#{1,6}\s+/.test(satir);
  const govde = satir.trim().replace(/^#{1,6}\s+/, "");
  let aday: string;
  let kalan = "";
  let esnek: boolean;
  const isaret = /^(\*\*|__)/.exec(govde)?.[1];
  if (isaret) {
    // **Şu an**, **Şu an:** kalan, **Şu an**: kalan
    const son = govde.indexOf(isaret, 2);
    if (son < 0) return null;
    aday = govde.slice(2, son);
    kalan = govde.slice(son + 2);
    esnek = true;
  } else {
    // "## Şu an", "Şu an: T-24 sürüyor" ya da yalnız "Şu an"; işaretsiz ve iki noktasız satır tam eşleşmeli
    const iki = govde.indexOf(":");
    aday = iki >= 0 ? govde.slice(0, iki) : govde;
    kalan = iki >= 0 ? govde.slice(iki + 1) : "";
    esnek = basliktan || iki >= 0;
  }
  aday = aday.trim().replace(/:$/, "").trim();
  const b = basliktanTur(aday, esnek);
  if (!b) return null;
  return { tur: b.tur, baslik: aday, kalan: kalan.replace(/^\s*:\s*/, "").trim(), dil: b.dil };
}

/** Mesajı bölümlerine ayırır; dört bölümden en az üçü yoksa brifing değildir (null) */
export function brifingAyir(metin: string): AyrilmisBrifing | null {
  const satirlar = metin.replace(/\r\n/g, "\n").split("\n");
  const giris: string[] = [];
  const bolumler: { tur: BrifingBolumTuru; baslik: string; dil: Dil; satirlar: string[] }[] = [];
  let kodda = false;
  for (const satir of satirlar) {
    if (/^\s*```/.test(satir)) kodda = !kodda;
    const b = kodda ? null : baslikSatiri(satir);
    if (b) {
      bolumler.push({ tur: b.tur, baslik: b.baslik, dil: b.dil, satirlar: b.kalan ? [b.kalan] : [] });
      continue;
    }
    const son = bolumler.at(-1);
    if (son) son.satirlar.push(satir);
    else giris.push(satir);
  }
  if (new Set(bolumler.map((b) => b.tur)).size < 3) return null;
  const turkce = bolumler.filter((b) => b.dil === "tr").length;
  return {
    dil: turkce * 2 >= bolumler.length ? "tr" : "en",
    giris: giris.join("\n").trim(),
    bolumler: bolumler.map((b) => ({ tur: b.tur, baslik: b.baslik, govde: b.satirlar.join("\n").trim() })),
  };
}

/** Karargâh'taki brifing isteği: istek anında #yonetim'deki son mesaj ve CEO'nun "yazıyor" göstergesinin görülüp görülmediği */
export interface BrifingIstegi {
  /** İstek anı (bu tarayıcının saati) */
  zaman: number;
  /** İstek anında #yonetim'deki son mesajın kimliği; ondan sonra CEO'dan gelen brifing yanıttır */
  sonMesajId: string | null;
  /** CEO'nun "yazıyor" göstergesi görüldü; bitince istek de biter */
  yaziyorGoruldu: boolean;
}

/** Çekirdekteki HAZIRLANIYOR_MS ile aynı: CEO bu sürede yazmazsa düğme yeniden açılır */
export const BRIFING_BEKLEME_MS = 5 * 60_000;
/** İstekten bu kadar sonra CEO ne çalışıyor ne yazıyorsa istek biter (çekirdek de tur bitince kapatır) */
export const BRIFING_SESSIZLIK_MS = 15_000;

/** CEO'nun o anki hâli: #yonetim'de yazıyor mu, bir tur işliyor mu */
export interface CeoHali {
  yaziyor: boolean;
  calisiyor: boolean;
}

/**
 * İstek bitti mi: istekten sonra CEO #yonetim'e brifingi yazdı, "yazıyor" görüldükten sonra bitti, CEO bir süredir ne
 * çalışıyor ne yazıyor (biçime uymayan yanıt; çekirdek isteği tur sonunda kapatır) ya da süre doldu. CEO'nun
 * brifingle ilgisiz mesajı isteği bitirmez (çekirdek de öyle). Saat karşılaştırması yerine son mesajın kimliğine
 * bakılır (çekirdek başka makinede olsa da doğru).
 */
export function brifingBittiMi(istek: BrifingIstegi, mesajlar: readonly Mesaj[] | undefined, ceoId: string, ceo: CeoHali, simdi: number): boolean {
  if (simdi - istek.zaman >= BRIFING_BEKLEME_MS) return true;
  if (istek.yaziyorGoruldu && !ceo.yaziyor) return true;
  if (!ceo.calisiyor && !ceo.yaziyor && simdi - istek.zaman >= BRIFING_SESSIZLIK_MS) return true;
  const liste = mesajlar ?? [];
  const i = istek.sonMesajId ? liste.findIndex((m) => m.id === istek.sonMesajId) : -1;
  // Son mesaj listede yoksa (liste yeniden yüklendi) zamana bakılmaz; yalnız gösterge ve süre karar verir
  if (istek.sonMesajId && i < 0) return false;
  return liste.slice(i + 1).some((m) => m.gonderenId === ceoId && brifingAyir(m.metin) !== null);
}
