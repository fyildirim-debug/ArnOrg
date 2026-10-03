// VS Code tezgâhının giriş noktası. Türkçe dil paketi tezgâhın hiçbir modülü yüklenmeden önce yüklenmeli;
// bu yüzden kurulum ayrı bir parça olarak dil paketinden sonra içe aktarılır.
import type { Konum } from "./adres";
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

/**
 * Dosyayı Kod ekranının düzenleyicisinde (isteğe bağlı satırda) açar. Çağıran önce Kod ekranına geçer;
 * tezgâh henüz kurulmadıysa Kod ekranının kurmasını en çok 10 sn bekler.
 */
export async function tezgahtaAc(k: Konum, satir?: number): Promise<void> {
  for (let i = 0; i < 200 && !baslatma; i++) await new Promise((r) => setTimeout(r, 50));
  if (!baslatma) throw new Error("Kod ekranı açılamadı.");
  const t = await baslatma;
  await t.ac(k, satir);
}
