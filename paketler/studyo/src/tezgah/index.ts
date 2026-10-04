// VS Code tezgâhının giriş noktası. Arayüz Türkçeyse Türkçe dil paketi tezgâhın hiçbir modülü yüklenmeden
// önce yüklenmeli; bu yüzden kurulum ayrı bir parça olarak dil paketinden sonra içe aktarılır. İngilizcede paket
// hiç yüklenmez, VS Code'un kendi İngilizcesi kalır. VS Code dili çalışırken değiştiremez: açılış dili saklanır,
// arayüz dili sonradan değişirse Kod ekranı yeniden yüklemeyi önerir.
import type { Dil } from "@arnorg/ortak";
import { sozluk, useDilDurumu } from "../dil";
import type { Konum } from "./adres";
import type { TezgahDenetimi } from "./kurulum";

export type { TezgahDenetimi };

let baslatma: Promise<TezgahDenetimi> | null = null;
let acilisDili: Dil | null = null;

/** Tezgâhı sayfa başına bir kez kurar; sonraki çağrılar aynı sözü döner */
export function tezgahiBaslat(kap: HTMLElement): Promise<TezgahDenetimi> {
  baslatma ??= (async () => {
    const dil = useDilDurumu.getState().dil;
    acilisDili = dil;
    if (dil === "tr") await import("@codingame/monaco-vscode-language-pack-tr");
    const { kur } = await import("./kurulum");
    return kur(kap, dil);
  })();
  return baslatma;
}

export function tezgahBasladiMi(): boolean {
  return baslatma !== null;
}

/** Tezgâhın açıldığı dil; henüz açılmadıysa null */
export function tezgahDili(): Dil | null {
  return acilisDili;
}

/**
 * Dosyayı Kod ekranının düzenleyicisinde (isteğe bağlı satırda) açar. Çağıran önce Kod ekranına geçer;
 * tezgâh henüz kurulmadıysa Kod ekranının kurmasını en çok 10 sn bekler.
 */
export async function tezgahtaAc(k: Konum, satir?: number): Promise<void> {
  for (let i = 0; i < 200 && !baslatma; i++) await new Promise((r) => setTimeout(r, 50));
  if (!baslatma) throw new Error(sozluk().kod.ekranAcilamadi);
  const t = await baslatma;
  await t.ac(k, satir);
}
