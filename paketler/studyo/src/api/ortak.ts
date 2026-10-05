// Ortak çalışma uçları (docs/API.md, "Ortak çalışma"): projenin dosya kiraları, ekip temposu, son görev kayıtları ve
// 0.0.8 geçişinde korunan eski alanlar; bir kaydın commit farkı; kaydın kalite denetimini yeniden koşma.
import type { FarkSonucu, GorevKaydi, OrtakCalismaDurumu } from "@arnorg/ortak";
import { istek } from "./istek";

const k = encodeURIComponent;

export const ortakApi = {
  durum: (pid: string, sinyal?: AbortSignal) => istek<OrtakCalismaDurumu>(`/api/projeler/${k(pid)}/ortak`, { sinyal }),
  /** Kaydın commit'inin farkı; yol verilirse yalnız o dosya */
  kayitFarki: (kid: string, yol?: string) => istek<FarkSonucu>(`/api/kayitlar/${k(kid)}/fark${yol ? `?yol=${k(yol)}` : ""}`),
  /** Bitmiş denetimi yeniden koşar; projede test komutu yoksa ya da denetim sürüyorsa 409 */
  kayitYeniden: (kid: string) => istek<GorevKaydi>(`/api/kayitlar/${k(kid)}/yeniden`, { method: "POST" }),
};
