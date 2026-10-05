// İşe alım formunun skill alanı (0.0.8): seçici rolün varsayılanlarıyla başlar; kurul değiştirmedikçe değer null kalır
// ve çekirdek rolün varsayılanlarını atar. Rol değişince seçim yeni rolün varsayılanlarına döner (IseAlFormu).
import { useId } from "react";
import { useSozluk } from "../../dil";
import { rolSkilleri, skilleriYukle, useSkillKatalogu } from "../../durum/skiller";
import { SkillSecici } from "./SkillSecici";
import "../../stiller/skiller.css";

export function IseAlimSkilleri({ rol, deger, degisti }: { rol: string; deger: string[] | null; degisti: (yeni: string[] | null) => void }) {
  const t = useSozluk().skiller;
  const kimlik = useId();
  const { katalog, hata, desteklenmiyor } = useSkillKatalogu();
  // Uç olmayan (eski) çekirdekte alan gösterilmez
  if (desteklenmiyor || !rol) return null;

  return (
    <div className="alan tam skill-alan">
      <span className="alan-ad" id={`${kimlik}-etiket`}>
        {t.baslik}
      </span>
      {rol === "ceo" ? (
        <p className="alan-ipucu">{t.ceo}</p>
      ) : katalog ? (
        <>
          <SkillSecici
            katalog={katalog}
            deger={deger ?? rolSkilleri(katalog, rol)}
            // Rol varsayılanına dönüş dokunulmamış hâle döner: çekirdek rolün varsayılanlarını atar
            degisti={(yeni, ne) => degisti(ne.tur === "varsayilan" ? null : yeni)}
            rol={rol}
            etiketId={`${kimlik}-etiket`}
          />
          <p className="alan-ipucu">{t.iseAlimIpucu}</p>
        </>
      ) : hata ? (
        <p className="skill-durum skill-durum-hata">
          {t.alinamadi}{" "}
          <button type="button" className="metin-dugme" onClick={() => void skilleriYukle(true)}>
            {t.yenidenDene}
          </button>
        </p>
      ) : (
        <p className="skill-durum">
          <span className="doner" aria-hidden="true" /> {t.yukleniyor}
        </p>
      )}
    </div>
  );
}
