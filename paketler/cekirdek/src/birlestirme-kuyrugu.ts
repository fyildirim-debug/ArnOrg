// Kalite kapısının proje ayarları ve 0.0.7'den kalan birleştirme kayıtları. 0.0.8'de birleştirme ve birleştirme kuyruğu
// yoktur: ekip ortak projede çalışır, ArnOrg her görev kaydından sonra test komutunu arka planda koşar
// (ortak-calisma/kalite.ts). Burada kalan: proje ayarlarındaki test ve hazırlık komutunun doğrulanması, komut
// değişince ekibe giden duyuru ve eski birleştirme onaylarının okunması (veri.kalite, dalın farkı); eski geçmiş
// Onaylar'da okunur kalır.
import type { BirlestirmeKalitesi, FarkSonucu, Onay, Proje, ProjeGuncelleIstegi } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import { commitBul, dalFarki } from "./kalite-kapisi.js";
import { ArnorgHatasi, bulunamadi } from "./yardimci.js";

/** Eski birleştirme onayının verisi (0.0.7 birlestirme_iste yazardı; kalite kapısı kalite alanını eklerdi) */
export interface BirlestirmeVerisi {
  ajanId: string;
  dal: string;
  ozet: string;
  isteyenId?: string;
  kalite?: BirlestirmeKalitesi;
}

export function birlestirmeVerisi(veri: unknown): BirlestirmeVerisi | null {
  const v = veri as Partial<BirlestirmeVerisi> | null;
  return v && typeof v === "object" && typeof v.dal === "string" && typeof v.ajanId === "string" ? (v as BirlestirmeVerisi) : null;
}

/** Onayın kalite kapısı kaydı; kuyruğa hiç girmediyse null */
export function kaliteOku(onay: Onay): BirlestirmeKalitesi | null {
  return onay.tur === "birlestirme" ? (birlestirmeVerisi(onay.veri)?.kalite ?? null) : null;
}

/** Proje güncelleme isteğindeki kalite alanları: komut tek satır, boş metin kaldırır; süre sınırı 1–240 dk */
export function kaliteAyarlari(istek: ProjeGuncelleIstegi): Partial<Pick<Proje, "testKomutu" | "hazirlikKomutu" | "testZamanAsimiDk">> {
  const alanlar: Partial<Pick<Proje, "testKomutu" | "hazirlikKomutu" | "testZamanAsimiDk">> = {};
  const komut = (v: string | null, ad: [string, string]): string | null => {
    const t = (v ?? "").trim();
    if (!t) return null;
    if (/[\r\n]/.test(t)) throw new ArnorgHatasi(iki(`${ad[0]} tek satır olmalı.`, `The ${ad[1]} must be a single line.`));
    if (t.length > 2000) throw new ArnorgHatasi(iki(`${ad[0]} en çok 2000 karakter olabilir.`, `The ${ad[1]} can be at most 2000 characters.`));
    return t;
  };
  if (istek.testKomutu !== undefined) alanlar.testKomutu = komut(istek.testKomutu, ["Test komutu", "test command"]);
  if (istek.hazirlikKomutu !== undefined) alanlar.hazirlikKomutu = komut(istek.hazirlikKomutu, ["Hazırlık komutu", "preparation command"]);
  if (istek.testZamanAsimiDk !== undefined) {
    const dk = Math.round(Number(istek.testZamanAsimiDk));
    if (!Number.isFinite(dk) || dk < 1 || dk > 240) throw new ArnorgHatasi(iki("Test süre sınırı 1–240 dakika olmalı.", "The test time limit must be 1–240 minutes."));
    alanlar.testZamanAsimiDk = dk;
  }
  return alanlar;
}

/** Kalite komutları değişince ekibe gidecek duyuru; değişmediyse null */
export function kaliteDuyurusu(onceki: Proje, yeni: Proje): string | null {
  if (onceki.testKomutu === yeni.testKomutu && onceki.hazirlikKomutu === yeni.hazirlikKomutu) return null;
  if (!yeni.testKomutu) {
    return iki("Kurul test komutunu kaldırdı; görev kayıtlarından sonra test koşmayacak.", "The board removed the test command; saves will no longer be tested.");
  }
  const hazirlik = yeni.hazirlikKomutu ? iki(` (önce ${yeni.hazirlikKomutu})`, ` (after ${yeni.hazirlikKomutu})`) : "";
  return iki(
    `Kalite: her görev kaydından sonra ${yeni.testKomutu}${hazirlik} ${yeni.varsayilanDal} dalındaki o commit'te arka planda koşacak; geçmeyen görev çıktıyla sahibine döner. Görevi 'inceleme'ye almadan önce aynı komutu koşun.`,
    `Quality: after every task save ${yeni.testKomutu}${hazirlik} now runs in the background on that commit of ${yeni.varsayilanDal}; a task that fails goes back to its owner with the output. Run the same command before you move a task to 'inceleme'.`,
  );
}

/** Eski birleştirme onayının farkı: kuyruğa giren commit'in (yoksa dalın) birleşmeden önceki hedefe göre değişiklikleri */
export async function eskiBirlestirmeFarki(depo: Depo, onayId: string): Promise<FarkSonucu> {
  const onay = depo.onay(onayId);
  const veri = onay?.tur === "birlestirme" ? birlestirmeVerisi(onay.veri) : null;
  const proje = onay ? depo.proje(onay.projeId) : null;
  if (!onay || !veri || !proje) throw bulunamadi("Birleştirme", "Merge");
  const kaynak = veri.kalite?.dalCommit ?? (await commitBul(proje.yol, `refs/heads/${veri.dal}`));
  if (!kaynak) throw new ArnorgHatasi(iki(`${veri.dal} dalı bulunamadı.`, `Branch ${veri.dal} was not found.`), 404);
  const hedef = veri.kalite?.durum === "birlesti" && veri.kalite.hedefCommit ? veri.kalite.hedefCommit : proje.varsayilanDal;
  return dalFarki(proje.yol, hedef, kaynak);
}
