// Proje adresleri ucu (docs/API.md, "Proje adresleri"): Tarayıcı'daki Linkler. Değişiklikler adresler.guncellendi
// olayıyla gelir (durum/olaylar.ts). Kurul link ekler ve kaldırır; "CEO'dan iste" CEO'ya linkleri güncellemesini
// #yonetim'den kurul mesajıyla söyler (0.0.9).
import type { Mesaj, ProjeAdresi } from "@arnorg/ortak";
import { istek } from "./istek";

const yol = (pid: string) => `/api/projeler/${encodeURIComponent(pid)}/adresler`;

export const adresApi = {
  liste: (pid: string, sinyal?: AbortSignal) => istek<ProjeAdresi[]>(yol(pid), { sinyal }),
  ekle: (pid: string, govde: { adres: string; ad: string }) => istek<ProjeAdresi>(yol(pid), { method: "POST", govde }),
  sil: (pid: string, id: string) => istek<{ tamam: true }>(`${yol(pid)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  iste: (pid: string) => istek<{ mesaj: Mesaj }>(`${yol(pid)}/iste`, { method: "POST" }),
};
