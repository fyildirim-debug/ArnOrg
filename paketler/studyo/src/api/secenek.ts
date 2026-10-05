// Seçenekli sorular (docs/API.md, "Seçenekli sorular"): kurulun seçimi. Ajanın secenekli_sor ile sorduğu soru ve
// CEO'nun #yonetim'deki düz metin listesi aynı uçla yanıtlanır; kurula sorunun (kurula_sor) seçimi api.onayKarari ile gider.
import type { SecimYanitIstegi, SecimYanitSonucu } from "@arnorg/ortak";
import { istek } from "./istek";

export const secenekApi = {
  /** Soru kilitlenir; seçim soran ajana kurul mesajı olarak gider */
  yanitla: (mid: string, i: SecimYanitIstegi) => istek<SecimYanitSonucu>(`/api/mesajlar/${encodeURIComponent(mid)}/secim`, { method: "POST", govde: i }),
};
