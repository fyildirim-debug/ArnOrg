// Yeni görev çekmecesi
import { GOREV_DURUM_ADLARI, type GorevDurumu } from "@arnorg/ortak";
import { useState } from "react";
import { api } from "../../api/uclar";
import { bildir } from "../../durum/arayuz";
import { gorevUygula, useVeri } from "../../durum/veri";
import { useIslem } from "../../yardimcilar/kancalar";
import { Cekmece } from "../Cekmece";
import { HataKutu } from "../Durumlar";
import { GorevAlanlari, taslakOlustur } from "./GorevAlanlari";

const BASLANGIC: GorevDurumu[] = ["bekleyen", "planlandi"];

export function YeniGorev({ kapat, olustu }: { kapat: () => void; olustu: (id: string) => void }) {
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [taslak, setTaslak] = useState(() => taslakOlustur());
  const [durum, setDurum] = useState<GorevDurumu>("bekleyen");
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();

  const olustur = () => {
    setDenendi(true);
    if (!taslak.baslik.trim() || !aktifProjeId) return;
    void calistir(
      "olustur",
      async () => {
        const g = await api.gorevOlustur(aktifProjeId, {
          baslik: taslak.baslik.trim(),
          aciklama: taslak.aciklama || undefined,
          kabulOlcutu: taslak.kabulOlcutu || undefined,
          etiket: taslak.etiket.trim() || undefined,
          atananId: taslak.atananId || null,
          bagimliliklar: taslak.bagimliliklar,
          durum,
        });
        gorevUygula(g);
        bildir("basari", `${g.kod} oluşturuldu.`);
        olustu(g.id);
      },
      true,
    );
  };

  return (
    <Cekmece
      baslik="Yeni görev"
      kapat={kapat}
      alt={
        <>
          <button type="button" className="dugme dugme-ana" onClick={olustur} disabled={suruyor !== null}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            Görevi oluştur
          </button>
          <button type="button" className="dugme dugme-sessiz" onClick={kapat}>
            Vazgeç
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          olustur();
        }}
        className="yeni-gorev-form"
      >
        <GorevAlanlari taslak={taslak} degistir={(t) => setTaslak((o) => ({ ...o, ...t }))} denendi={denendi} />
        <div className="alan">
          <span className="alan-ad" id="yeni-gorev-durum">
            Başlangıç durumu
          </span>
          <div className="bolumlu" role="group" aria-labelledby="yeni-gorev-durum">
            {BASLANGIC.map((d) => (
              <button key={d} type="button" aria-pressed={durum === d} onClick={() => setDurum(d)}>
                {GOREV_DURUM_ADLARI[d]}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {hata ? <HataKutu baslik="Görev oluşturulamadı" metin={hata} /> : null}
    </Cekmece>
  );
}
