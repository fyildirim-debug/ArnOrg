// Üst çubuktaki bütçe panelinin açıklığı (0.0.10): gösterge tıklanınca açılır; kurul bildirimindeki "Bütçeyi artır"
// paneli artırma formu açık olarak açar (artir her istekte artar, panel formu yeniden açar)
import { create } from "zustand";

export const useButcePaneli = create<{ acik: boolean; artir: number }>()(() => ({ acik: false, artir: 0 }));

/** Paneli açar; artir: bütçeyi artırma formu da açık gelir */
export function butcePaneliniAc(artir = false) {
  useButcePaneli.setState((d) => ({ acik: true, artir: artir ? d.artir + 1 : d.artir }));
}

export function butcePaneliniKapat() {
  useButcePaneli.setState({ acik: false });
}

export function butcePaneliniDegistir() {
  useButcePaneli.setState((d) => ({ acik: !d.acik }));
}
