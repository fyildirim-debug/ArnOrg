// Düz metinde @anma, T-12 görev kodu, **kalın**, `satır içi kod` ve bağlantı vurgulama;
// ZenginBlok ayrıca ajan mesajlarındaki hafif markdown'ı (liste, başlık, kod bloğu) çizer.
// Ayrıştırma yardimcilar/zenginMetin'de (birim testli); burada yalnız çizilir.
import { Fragment, memo, useMemo } from "react";
import { git } from "../durum/arayuz";
import { useVeri } from "../durum/veri";
import { bloklaraAyir, zenginParcala } from "../yardimcilar/zenginMetin";

export const ZenginMetin = memo(function ZenginMetin({ metin }: { metin: string }) {
  const gorevler = useVeri((d) => d.gorevler);
  const parcalar = useMemo(() => zenginParcala(metin), [metin]);
  return (
    <>
      {parcalar.map((p, i) => {
        switch (p.tur) {
          case "metin":
            return <Fragment key={i}>{p.metin}</Fragment>;
          case "kalin":
            return (
              <strong key={i}>
                <ZenginMetin metin={p.metin} />
              </strong>
            );
          case "kod":
            return (
              <code key={i} className="satir-ici-kod">
                {p.metin}
              </code>
            );
          case "anma":
            return (
              <span key={i} className="anma">
                {p.metin}
              </span>
            );
          case "baglanti":
            // Yalnız http(s); Electron'da yeni pencere istekleri sistem tarayıcısına gider
            return (
              <a key={i} className="baglanti" href={p.adres} target="_blank" rel="noreferrer noopener">
                {p.metin}
              </a>
            );
          case "gorev": {
            const gorev = gorevler.find((g) => g.kod === p.kod);
            return gorev ? (
              <button key={i} type="button" className="gorev-kodu" title={`${gorev.kod} · ${gorev.baslik}`} onClick={() => git("pano", { gorevId: gorev.id })}>
                {p.kod}
              </button>
            ) : (
              <code key={i} className="gorev-kodu">
                {p.kod}
              </code>
            );
          }
        }
      })}
    </>
  );
});

export const ZenginBlok = memo(function ZenginBlok({ metin }: { metin: string }) {
  const bloklar = useMemo(() => bloklaraAyir(metin), [metin]);
  return (
    <div className="zengin">
      {bloklar.map((b, i) => {
        if (b.tur === "baslik")
          return (
            <p key={i} className="zengin-baslik">
              <ZenginMetin metin={b.metin} />
            </p>
          );
        if (b.tur === "kod")
          return (
            <pre key={i}>
              <code>{b.metin}</code>
            </pre>
          );
        if (b.tur === "liste") {
          const Etiket = b.sirali ? "ol" : "ul";
          return (
            <Etiket key={i}>
              {b.ogeler.map((o, j) => (
                <li key={j}>
                  <ZenginMetin metin={o} />
                </li>
              ))}
            </Etiket>
          );
        }
        return (
          <p key={i}>
            {b.satirlar.map((s, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                <ZenginMetin metin={s} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
});
