// Seçenekli sorular: yanıtlanan sorunun yeni hâli (mesaj.guncellendi olayı ve yanıt isteğinin sonucu) yüklü mesaj
// listesinde yerine konur; kanal yüklü değilse dokunulmaz (açılınca sunucudan güncel gelir)
import type { Mesaj } from "@arnorg/ortak";
import { useVeri } from "./veri";

export function mesajYerineKoy(mesaj: Mesaj) {
  useVeri.setState((d) => {
    if (mesaj.projeId !== d.aktifProjeId) return {};
    const yuklu = d.mesajlar[mesaj.kanal];
    if (!yuklu?.some((m) => m.id === mesaj.id)) return {};
    return { mesajlar: { ...d.mesajlar, [mesaj.kanal]: yuklu.map((m) => (m.id === mesaj.id ? mesaj : m)) } };
  });
}
