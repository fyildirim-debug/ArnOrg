// Yetenek ve web uçları (docs/API.md, "Web ve araştırma"): yetenek kataloğu, rol varsayılanları, motor durumu,
// kurulun deneme araması ve okuması. Ajanın yetenekleri api.ajanGuncelle ile, web ayarları api.ayarlariKaydet ile değişir.
import type { Yetenek, YetenekKimligi, WebAramaIstegi, WebAramaYaniti, WebDurumu, WebOkumaIstegi, WebOkumaSonucu } from "@arnorg/ortak";
import { istek } from "./istek";

let rolVarsayilanlari: Promise<Record<string, YetenekKimligi[]>> | null = null;

export const yetenekApi = {
  yetenekler: () => istek<Yetenek[]>("/api/yetenekler"),
  /** Rol → varsayılan yetenekler; bir kez istenir, sonra bellekten gelir */
  rolVarsayilanlari: () => {
    rolVarsayilanlari ??= istek<Record<string, YetenekKimligi[]>>("/api/yetenekler/roller").catch((e: unknown) => {
      rolVarsayilanlari = null;
      throw e;
    });
    return rolVarsayilanlari;
  },
  webDurum: (sinyal?: AbortSignal) => istek<WebDurumu>("/api/web/durum", { sinyal }),
  webAra: (i: WebAramaIstegi, sinyal?: AbortSignal) => istek<WebAramaYaniti>("/api/web/ara", { method: "POST", govde: i, sinyal }),
  webOku: (i: WebOkumaIstegi, sinyal?: AbortSignal) => istek<WebOkumaSonucu>("/api/web/oku", { method: "POST", govde: i, sinyal }),
  /** Askıdaki motorlar bir sonraki aramada yeniden denenir */
  askilariKaldir: () => istek<WebDurumu>("/api/web/askilari-kaldir", { method: "POST" }),
};
