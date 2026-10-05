// Proje adresleri: etkin projenin çalışan sunucuları (çekirdekte proje-adresleri.ts). Liste Tarayıcı açılınca
// istenir, sonra adresler.guncellendi olaylarıyla tam liste olarak değişir. Uç yoksa (eski çekirdek) ya da
// istek başarısızsa liste boş kalır: Tarayıcı'da bölüm görünmez.
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
