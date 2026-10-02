// Ana süreç ile çekirdek süreci (utilityProcess) arasındaki mesajlar ve çekirdek sözleşmesi.
// Bu dosya Electron'a bağımlı değildir; birim testlerinde de kullanılır.

/** Çekirdeğin `baslat()` işlevine verilen seçenekler (paketler/cekirdek sözleşmesi) */
export interface BaslatSecenekleri {
  /** 0 = boş rastgele port */
  port?: number;
  /** Varsayılan 127.0.0.1 */
  host?: string;
  veriDizini: string;
  /** Stüdyo derlemesinin (statik arayüz) dizini */
  studyoDizini?: string;
  erisimAnahtari?: string;
  claudeYolu?: string | null;
}

/** Çekirdeğin `baslat()` işlevinin döndürdüğü çalışan sunucu */
export interface CalisanSunucu {
  /** http://127.0.0.1:<port> */
  adres: string;
  port: number;
  erisimAnahtari: string;
  kapat(): Promise<void>;
}

/** Çekirdek modülünün dışa aktarması beklenen biçim */
export interface CekirdekModulu {
  baslat(s: BaslatSecenekleri): Promise<CalisanSunucu>;
}

/** Ana süreçten çekirdek sürecine */
export type AnaMesaji =
  | { tur: "baslat"; cekirdekYolu: string; secenekler: BaslatSecenekleri }
  | { tur: "kapat" };

/** Çekirdek sürecinden ana sürece */
export type CekirdekMesaji =
  | { tur: "hazir"; adres: string; erisimAnahtari: string }
  | { tur: "hata"; mesaj: string }
  | { tur: "kapandi" };

/** Gelen verinin geçerli bir çekirdek mesajı olup olmadığını denetler. */
export function cekirdekMesajiMi(veri: unknown): veri is CekirdekMesaji {
  if (typeof veri !== "object" || veri === null) return false;
  const m = veri as Record<string, unknown>;
  switch (m.tur) {
    case "hazir":
      return typeof m.adres === "string" && typeof m.erisimAnahtari === "string";
    case "hata":
      return typeof m.mesaj === "string";
    case "kapandi":
      return true;
    default:
      return false;
  }
}
