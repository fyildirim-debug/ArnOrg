// Proje adresleri, Tarayıcı'da Linkler: etkin projenin açılabilen adresleri (çekirdekte proje-adresleri.ts). Liste
// Tarayıcı açılınca istenir, sonra adresler.guncellendi olaylarıyla tam liste olarak değişir. Uç yoksa (eski çekirdek)
// ya da istek başarısızsa liste boş kalır. Kurulun eklediği ve kaldırdığı link yanıtla da uygulanır (bağlantı kopuksa
// olay gelmez).
import type { ProjeAdresi } from "@arnorg/ortak";
import { create } from "zustand";
import { adresApi } from "../api/adresler";

interface AdresDurumu {
  projeId: string | null;
  liste: ProjeAdresi[];
}

export const useAdresler = create<AdresDurumu>()(() => ({ projeId: null, liste: [] }));

const ayarla = useAdresler.setState;
const al = useAdresler.getState;

/** Etkin projenin adresleri; proje değişince liste boşalıp yeniden istenir */
export async function adresleriYukle(pid: string): Promise<void> {
  if (al().projeId !== pid) ayarla({ projeId: pid, liste: [] });
  try {
    const liste = await adresApi.liste(pid);
    if (al().projeId === pid) ayarla({ liste });
  } catch {
    // Bölüm isteğe bağlı: hata gösterilmez, sonraki olay ya da yeniden bağlanma listeyi getirir
  }
}

/** adresler.guncellendi: olaydaki tam liste */
export function adresleriUygula(projeId: string, liste: ProjeAdresi[]): void {
  if (projeId === al().projeId) ayarla({ liste });
}

/** Kurul link ekler (kalıcı); aynı adres yeniden eklenirse adı güncellenir */
export async function linkEkle(pid: string, govde: { adres: string; ad: string }): Promise<ProjeAdresi> {
  const a = await adresApi.ekle(pid, govde);
  if (al().projeId === pid) {
    const liste = al().liste;
    ayarla({ liste: liste.some((x) => x.id === a.id) ? liste.map((x) => (x.id === a.id ? a : x)) : [...liste, a] });
  }
  return a;
}

/** Kurul linki kaldırır */
export async function linkSil(pid: string, id: string): Promise<void> {
  await adresApi.sil(pid, id);
  if (al().projeId === pid) ayarla({ liste: al().liste.filter((x) => x.id !== id) });
}

/** "CEO'dan iste": CEO'ya linkleri eklemesini ve güncel tutmasını söyleyen kurul mesajı (#yonetim) */
export async function linkleriIste(pid: string): Promise<void> {
  await adresApi.iste(pid);
}
