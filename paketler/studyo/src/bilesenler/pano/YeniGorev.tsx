// Yeni görev çekmecesi
import type { GorevDurumu } from "@arnorg/ortak";
import { useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { gorevUygula, useVeri } from "../../durum/veri";
import { useIslem } from "../../yardimcilar/kancalar";
import { Cekmece } from "../Cekmece";
import { HataKutu } from "../Durumlar";
import { GorevAlanlari, taslakOlustur } from "./GorevAlanlari";

const BASLANGIC: GorevDurumu[] = ["bekleyen", "planlandi"];

export function YeniGorev({ kapat, olustu }: { kapat: () => void; olustu: (id: string) => void }) {
  const s = useSozluk();
  const t = s.pano.yeni;
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
        bildir("basari", sozluk().pano.yeni.olusturuldu(g.kod));
        olustu(g.id);
      },
      true,
    );
  };

  return (
    <Cekmece
      baslik={s.pano.yeniGorev}
      kapat={kapat}
      alt={
        <>
          <button type="button" className="dugme dugme-ana" onClick={olustur} disabled={suruyor !== null}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            {t.olustur}
          </button>
          <button type="button" className="dugme dugme-sessiz" onClick={kapat}>
            {s.genel.vazgec}
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
            {t.baslangicDurumu}
          </span>
          <div className="bolumlu" role="group" aria-labelledby="yeni-gorev-durum">
            {BASLANGIC.map((d) => (
              <button key={d} type="button" aria-pressed={durum === d} onClick={() => setDurum(d)}>
                {s.genel.gorevDurumu[d]}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {hata ? <HataKutu baslik={t.olusturulamadi} metin={hata} /> : null}
    </Cekmece>
  );
}
