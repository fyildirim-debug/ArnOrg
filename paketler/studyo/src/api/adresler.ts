// Proje adresleri ucu (docs/API.md, "Proje adresleri"): projenin çalışan sunucuları. Değişiklikler
// adresler.guncellendi olayıyla gelir (durum/olaylar.ts).
import type { ProjeAdresi } from "@arnorg/ortak";
import { istek } from "./istek";

export const adresApi = {
  liste: (pid: string, sinyal?: AbortSignal) => istek<ProjeAdresi[]>(`/api/projeler/${encodeURIComponent(pid)}/adresler`, { sinyal }),
};
