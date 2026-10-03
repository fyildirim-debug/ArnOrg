// VS Code tezgâhının giriş noktası. Türkçe dil paketi tezgâhın hiçbir modülü yüklenmeden önce yüklenmeli;
// bu yüzden kurulum ayrı bir parça olarak dil paketinden sonra içe aktarılır.
import type { TezgahDenetimi } from "./kurulum";

export type { TezgahDenetimi };

let baslatma: Promise<TezgahDenetimi> | null = null;

/** Tezgâhı sayfa başına bir kez kurar; sonraki çağrılar aynı sözü döner */
export function tezgahiBaslat(kap: HTMLElement): Promise<TezgahDenetimi> {
  baslatma ??= (async () => {
    await import("@codingame/monaco-vscode-language-pack-tr");
    const { kur } = await import("./kurulum");
    return kur(kap);
  })();
  return baslatma;
}

export function tezgahBasladiMi(): boolean {
  return baslatma !== null;
}
