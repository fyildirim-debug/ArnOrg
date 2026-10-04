// Kanal kurma ve üye düzenleme çekmecesi: ad (kurarken), açıklama ve ekipten çoklu üye seçimi. Seçim sırası serbest
// konuşmanın söz sırasıdır; seçili üyenin yanında sırası görünür. Ad çekirdekle aynı kurallarla anında denetlenir.
import type { Kanal } from "@arnorg/ortak";
import { useId, useMemo, useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { kanalUygula, useVeri } from "../../durum/veri";
import { kanalAdiDenetle } from "../../yardimcilar/kanallar";
import { useIslem } from "../../yardimcilar/kancalar";
import { Cekmece } from "../Cekmece";
import { HataKutu } from "../Durumlar";
import { AjanAvatar } from "../Kisi";

/** kanal verilirse düzenleme (açıklama ve üyeler), verilmezse yeni kanal */
export function KanalCekmecesi({ kanal, kapat, kuruldu }: { kanal?: Kanal; kapat: () => void; kuruldu?: (ad: string) => void }) {
  const s = useSozluk();
  const t = s.kanallar.cekmece;
  const pid = useVeri((d) => d.aktifProjeId);
  const ajanlar = useVeri((d) => d.ajanlar);
  const kanallar = useVeri((d) => d.kanallar);
  const [ad, setAd] = useState("");
  const [aciklama, setAciklama] = useState(kanal?.aciklama ?? "");
  const [uyeler, setUyeler] = useState<string[]>(() => (kanal?.uyeler ?? []).filter((id) => ajanlar.some((a) => a.id === id)));
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();
  const id = useId().replace(/[^\w-]/g, "");
  const duzenleme = Boolean(kanal);

  const adDenetimi = useMemo(() => kanalAdiDenetle(ad, kanallar), [ad, kanallar]);
  // Boş ad uyarısı ilk denemeden sonra; diğer sorunlar yazarken görünür
  const adSorunu = duzenleme || !adDenetimi.sorun || (adDenetimi.sorun === "bos" && !denendi) ? null : t.adSorunu[adDenetimi.sorun];
  const uyeSorunu = denendi && !uyeler.length ? t.uyeSecin : null;

  const degistir = (ajanId: string) => setUyeler((u) => (u.includes(ajanId) ? u.filter((x) => x !== ajanId) : [...u, ajanId]));

  const kaydet = () => {
    setDenendi(true);
    if (!pid || !uyeler.length || (!duzenleme && adDenetimi.sorun)) return;
    void calistir(
      "kaydet",
      async () => {
        if (kanal) {
          const yeni = await api.kanalGuncelle(pid, kanal.ad, { aciklama: aciklama.trim(), uyeler });
          kanalUygula(pid, yeni);
          bildir("basari", sozluk().kanallar.cekmece.kaydedildi(yeni.ad));
          kapat();
          return;
        }
        const yeni = await api.kanalKur(pid, { ad, aciklama: aciklama.trim() || undefined, uyeler });
        kanalUygula(pid, yeni);
        bildir("basari", sozluk().kanallar.cekmece.kuruldu(yeni.ad));
        kuruldu?.(yeni.ad);
        kapat();
      },
      true,
    );
  };

  return (
    <Cekmece
      baslik={kanal ? t.duzenleBaslik(kanal.ad) : t.kurBaslik}
      kapat={kapat}
      alt={
        <>
          <button type="button" className="dugme dugme-ana" onClick={kaydet} disabled={suruyor !== null}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            {duzenleme ? s.genel.kaydet : t.kur}
          </button>
          <button type="button" className="dugme dugme-sessiz" onClick={kapat}>
            {s.genel.vazgec}
          </button>
        </>
      }
    >
      <form
        className="kanal-form"
        onSubmit={(e) => {
          e.preventDefault();
          kaydet();
        }}
      >
        {duzenleme ? null : (
          <div className="alan">
            <label htmlFor={`${id}-ad`}>{t.ad}</label>
            <div className="kanal-ad-girdi">
              <span aria-hidden="true">#</span>
              <input
                id={`${id}-ad`}
                className="girdi"
                value={ad}
                onChange={(e) => setAd(e.target.value)}
                placeholder={t.adYer}
                maxLength={60}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={adSorunu ? true : undefined}
                aria-describedby={`${id}-ad-ipucu`}
                data-ilk-odak
              />
            </div>
            <span id={`${id}-ad-ipucu`} className={adSorunu ? "alan-hata" : "alan-ipucu"}>
              {adSorunu ?? (adDenetimi.ad && adDenetimi.ad !== ad.trim() ? t.adOlarak(adDenetimi.ad) : t.adIpucu)}
            </span>
          </div>
        )}
        <div className="alan">
          <label htmlFor={`${id}-aciklama`}>{t.aciklama}</label>
          <input
            id={`${id}-aciklama`}
            className="girdi"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder={t.aciklamaYer}
            maxLength={300}
            data-ilk-odak={duzenleme ? true : undefined}
          />
        </div>
        <fieldset className="uye-secim" aria-describedby={`${id}-uye-ipucu`}>
          <legend className="alan-ad">{t.uyeler}</legend>
          <p id={`${id}-uye-ipucu`} className={uyeSorunu ? "alan-hata" : "alan-ipucu"}>
            {uyeSorunu ?? t.uyeIpucu}
          </p>
          {ajanlar.length ? (
            <ul className="uye-liste">
              {ajanlar.map((a) => {
                const sira = uyeler.indexOf(a.id);
                return (
                  <li key={a.id}>
                    <label className="uye-satir" data-secili={sira >= 0 || undefined}>
                      <input type="checkbox" checked={sira >= 0} onChange={() => degistir(a.id)} />
                      <AjanAvatar ajan={a} boyut="s" />
                      <span className="kisi-metin">
                        <b className="tek-satir">{a.ad}</b>
                        <small className="tek-satir">{a.rolAdi}</small>
                      </span>
                      {sira >= 0 ? <span className="uye-sira">{t.siraEtiketi(sira + 1)}</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="alan-ipucu">{t.ekipBos}</p>
          )}
        </fieldset>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {hata ? <HataKutu baslik={duzenleme ? t.kaydedilemedi : t.kurulamadi} metin={hata} /> : null}
    </Cekmece>
  );
}
