// Ekip: organizasyon şeması, seçili ajanın ayrıntısı, CEO'nun işe alım teklifleri, işe al
import { useEffect, useState } from "react";
import { AjanAyrinti } from "../bilesenler/ajan/AjanAyrinti";
import { IseAlFormu } from "../bilesenler/ajan/IseAlFormu";
import { OrgSemasi } from "../bilesenler/ajan/OrgSemasi";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { OnayOgesi } from "../bilesenler/OnayOgesi";
import { Simge } from "../bilesenler/Simge";
import { useArayuz } from "../durum/arayuz";
import { ceoBul, projeVerisiniYukle, rolleriYukle, useVeri } from "../durum/veri";

const LEJANT = [
  ["calisiyor", "Çalışıyor"],
  ["karar_bekliyor", "Karar bekliyor"],
  ["bosta", "Boşta"],
  ["duraklatildi", "Duraklatıldı"],
  ["kapali", "Kapalı"],
] as const;

export function Ekip() {
  const ajanlar = useVeri((d) => d.ajanlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const projeHatasi = useVeri((d) => d.projeHatasi);
  const onaylar = useVeri((d) => d.onaylar);
  const seciliId = useArayuz((d) => d.ajanId);
  const [iseAlAcik, setIseAlAcik] = useState(false);

  const secili = ajanlar.find((a) => a.id === seciliId) ?? ceoBul(ajanlar) ?? ajanlar[0];
  const teklifler = onaylar.filter((o) => o.tur === "ise_alim" && o.durum === "bekliyor");
  const sec = (id: string) => useArayuz.setState({ ajanId: id });

  useEffect(() => {
    // Teklif verisindeki rol adları için
    rolleriYukle().catch(() => undefined);
  }, []);

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>Ekip</h1>
          <p>Organizasyon şeması · CEO işe alım teklif eder, siz onaylarsınız</p>
        </div>
        <div className="baslik-eylem">
          <button type="button" className="dugme" onClick={() => setIseAlAcik(true)}>
            <Simge ad="arti" />
            İşe al
          </button>
        </div>
      </div>

      {yukleme === "yukleniyor" && !ajanlar.length ? <Iskelet satir={8} /> : null}
      {yukleme === "hata" && !ajanlar.length ? (
        <HataKutu metin={projeHatasi ?? "Ekip alınamadı."} yeniden={() => void projeVerisiniYukle()} />
      ) : null}
      {yukleme === "hazir" && !ajanlar.length ? (
        <Bos
          baslik="Henüz kimse yok"
          eylem={
            <button type="button" className="dugme dugme-ana" onClick={() => setIseAlAcik(true)}>
              İlk çalışanı işe al
            </button>
          }
        >
          Her projede bir CEO otomatik işe alınır. CEO brief'i aldıktan sonra gereken rolleri teklif eder; isterseniz doğrudan da işe alabilirsiniz.
        </Bos>
      ) : null}

      {ajanlar.length ? (
        <div className="ekip-yerlesim">
          <div className="ekip-sol">
            <ul className="lejant org-lejant" aria-label="Durum renkleri">
              {LEJANT.map(([d, ad]) => (
                <li key={d}>
                  <i className={`nokta nokta-${d}`} aria-hidden="true" />
                  {ad}
                </li>
              ))}
            </ul>
            <OrgSemasi ajanlar={ajanlar} secili={secili?.id ?? null} sec={sec} />

            {teklifler.length ? (
              <section aria-labelledby="teklif-baslik">
                <h2 className="ara-baslik" id="teklif-baslik">
                  İşe alım teklifleri <small>{teklifler.length} bekliyor</small>
                </h2>
                <ul className="onay-liste">
                  {teklifler.map((o) => (
                    <OnayOgesi key={o.id} onay={o} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          {secili ? (
            <aside className="ekip-sag" aria-label={`${secili.ad} ayrıntıları`}>
              <AjanAyrinti ajan={secili} />
            </aside>
          ) : null}
        </div>
      ) : null}

      {iseAlAcik ? <IseAlFormu kapat={() => setIseAlAcik(false)} alindi={sec} /> : null}
    </>
  );
}
