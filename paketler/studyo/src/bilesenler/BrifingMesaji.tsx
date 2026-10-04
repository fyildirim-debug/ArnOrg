// Sohbette CEO'nun brifingi: dört bölüm defter düzeninde, solda bölüm adı ve sağda maddeler; dar kapta alt alta.
// "Kararınızı bekleyen" kurulun eylemini taşıdığından tek vurgu rengini alır. Maddeler sohbetin hafif Markdown'ıyla
// (ZenginBlok) çizilir: görev kodu tıklanır, @anma ve bağlantı vurgulanır.
import { memo } from "react";
import type { AyrilmisBrifing } from "../yardimcilar/brifing";
import { ZenginBlok } from "./ZenginMetin";

export const BrifingMesaji = memo(function BrifingMesaji({ brifing }: { brifing: AyrilmisBrifing }) {
  return (
    <div className="brifing" lang={brifing.dil}>
      {brifing.giris ? (
        <div className="brifing-giris">
          <ZenginBlok metin={brifing.giris} />
        </div>
      ) : null}
      <dl className="brifing-bolumler">
        {brifing.bolumler.map((b, i) => (
          <div key={i} className={`brifing-bolum brifing-${b.tur}`}>
            <dt>{b.baslik}</dt>
            <dd>{b.govde ? <ZenginBlok metin={b.govde} /> : <span className="brifing-bos">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
});
