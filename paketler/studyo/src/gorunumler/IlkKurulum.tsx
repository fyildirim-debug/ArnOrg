// İlk açılış hazırlığı: dil, Claude Code, GitHub, ilk proje ve CEO ile hazırlık görüşmesi
import { ayarlariKaydet } from "../durum/veri";
import { useSozluk } from "../dil";

export function IlkKurulum() {
  const s = useSozluk();
  return (
    <div className="ilk-kurulum">
      <button type="button" className="dugme" onClick={() => void ayarlariKaydet({ kurulumTamam: true })}>
        {s.genel.atla}
      </button>
    </div>
  );
}
