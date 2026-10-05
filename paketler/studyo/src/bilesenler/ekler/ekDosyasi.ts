// Ekin baytları: görsellerin nesne adresleri (img Authorization başlığı gönderemez: baytlar anahtarlı istekle alınır,
// nesne adresiyle gösterilir; oturum boyunca en çok 120 görsel önbellekte), dosyayı yeni sekmede açma ve indirme.
// Nesne adresinin türü guvenliTur'dan gelir: HTML ve SVG asla çalışabilen türle açılmaz.
import type { MesajEki } from "@arnorg/ortak";
import { ekApi } from "../../api/ekler";
import { gorselMi, guvenliTur, sekmedeAcilir } from "../../yardimcilar/ekler";
import { blobuKaydet } from "../../yardimcilar/indirme";
import { masaustu } from "../kurulumYardimcilari";

const SINIR = 120;
const onbellek = new Map<string, Promise<string | null>>();
/** Çözülmüş adresler (önbellekten düşen bırakılır) */
const adresler = new Map<string, string>();

function koy(id: string, s: Promise<string | null>): void {
  onbellek.delete(id);
  onbellek.set(id, s);
  while (onbellek.size > SINIR) {
    const eski = onbellek.keys().next().value as string;
    onbellek.delete(eski);
    const a = adresler.get(eski);
    if (a) {
      URL.revokeObjectURL(a);
      adresler.delete(eski);
    }
  }
}

/** Görselin nesne adresi; alınamazsa null (sonraki istekte yeniden denenir) */
export function gorselAdresi(ek: MesajEki): Promise<string | null> {
  const var_ = onbellek.get(ek.id);
  if (var_) {
    // En son kullanılan sona taşınır
    onbellek.delete(ek.id);
    onbellek.set(ek.id, var_);
    return var_;
  }
  const s = ekApi.icerik(ek.id).then(
    ({ veri }) => {
      const adres = URL.createObjectURL(new Blob([veri], { type: guvenliTur(ek) }));
      adresler.set(ek.id, adres);
      return adres;
    },
    () => {
      onbellek.delete(ek.id);
      return null;
    },
  );
  koy(ek.id, s);
  return s;
}

/** Kurulun yüklediği görselin yerel adresi önbelleğe girer: gönderilen mesajdaki görsel yeniden indirilmez */
export function gorselOnbellegeKoy(ek: MesajEki, adres: string): void {
  if (!gorselMi(ek) || onbellek.has(ek.id)) {
    URL.revokeObjectURL(adres);
    return;
  }
  adresler.set(ek.id, adres);
  koy(ek.id, Promise.resolve(adres));
}

/** Eki indirir (masaüstünde kaydetme penceresi) */
export async function ekIndir(ek: MesajEki): Promise<void> {
  const { veri } = await ekApi.icerik(ek.id);
  blobuKaydet(new Blob([veri], { type: guvenliTur(ek) }), ek.ad);
}

/** Masaüstü uygulamasında yeni pencere açılmaz; dosya kaydedilir */
export const sekmeAcilabilir = () => !masaustu();

/** PDF ve metni yeni sekmede açar (metin, HTML ve SVG de düz metin olarak); masaüstünde ve görselde indirir */
export async function ekAc(ek: MesajEki): Promise<void> {
  if (!sekmeAcilabilir() || !sekmedeAcilir(ek)) return ekIndir(ek);
  // Sekme tıklamayla hemen açılır (açılır pencere engelleyicisi beklemeyi sevmez); içerik gelince oraya yönlenir
  const sekme = window.open("", "_blank");
  try {
    const { veri } = await ekApi.icerik(ek.id);
    const adres = URL.createObjectURL(new Blob([veri], { type: guvenliTur(ek) }));
    if (sekme) {
      sekme.opener = null;
      sekme.location.href = adres;
    } else window.open(adres, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(adres), 60_000);
  } catch (h) {
    sekme?.close();
    throw h;
  }
}
