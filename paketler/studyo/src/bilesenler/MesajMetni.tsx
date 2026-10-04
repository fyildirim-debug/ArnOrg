// Mesaj metni: baştaki alıntı (bir bildirime yanıtta konu) ayrı ve sakin, kalan metin hafif markdown ile;
// bağlantılar tıklanır, @anma ve görev kodu vurgulanır (ZenginBlok)
import { memo, useMemo } from "react";
import { alintiAyir } from "./mesajGruplari";
import { ZenginBlok, ZenginMetin } from "./ZenginMetin";

export const MesajMetni = memo(function MesajMetni({ metin }: { metin: string }) {
  const { alinti, govde } = useMemo(() => alintiAyir(metin), [metin]);
  return (
    <>
      {alinti ? (
        <p className="mesaj-alinti">
          <ZenginMetin metin={alinti} />
        </p>
      ) : null}
      {govde.trim() ? <ZenginBlok metin={govde} /> : null}
    </>
  );
});

/** Akış satırında düz metin: kalın ve kod işaretleri atılır, @anma vurgulanır (düğme içinde etkileşimli öğe olmaz) */
export function DuzMetin({ metin }: { metin: string }) {
  const parcalar = useMemo(() => {
    const temiz = alintiAyir(metin)
      .govde.replace(/```[\s\S]*?(```|$)/g, " ")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    return temiz.split(/(@[\p{L}\p{N}_-]+)/u);
  }, [metin]);
  return (
    <>
      {parcalar.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="anma">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
