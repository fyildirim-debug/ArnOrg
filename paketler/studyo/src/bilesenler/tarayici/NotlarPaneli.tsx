// Notlar paneli: açık düzeltme notları (küçük görüntü, sayfa, not; düzenle ve sil), sayaç, "Hepsini yaptır"
// (onaylı; notlar tek kurul mesajıyla CEO'ya gider, ardından Karargâh'a geçmek önerilir) ve soluk duran
// "Gönderildi" listesi. Geniş ekranda sağda sütun, dar ekranda alttan açılan çekmecedir.
import type { Duzeltme, MasaustuTarayicisi } from "@arnorg/ortak";
import { useId, useMemo, useState } from "react";
import { useSozluk } from "../../dil";
import { git as ekranaGit } from "../../durum/arayuz";
import { duzeltmeleriGonder, duzeltmeleriYukle, duzeltmeNotunuDuzelt, duzeltmeSil, useDuzeltmeler } from "../../durum/duzeltmeler";
import { goreli } from "../../yardimcilar/bicim";
import { useIslem } from "../../yardimcilar/kancalar";
import { kisaAdres } from "../../yardimcilar/tarayiciAdresi";
import { Bos, DugmeYukleniyor, HataKutu, Iskelet } from "../Durumlar";
import { OnaySor } from "../OnaySor";
import { Simge } from "../Simge";
import { DuzeltmeGorseli } from "./DuzeltmeGorseli";

export function NotlarPaneli({
  pid,
  kopru,
  dar,
  acik,
  setAcik,
}: {
  pid: string | null;
  /** Masaüstünde not sayfasını görünümde açmak için */
  kopru: MasaustuTarayicisi | null;
  dar: boolean;
  acik: boolean;
  setAcik: (acik: boolean) => void;
}) {
  const s = useSozluk();
  const t = s.tarayici.panel;
  const govdeId = useId();
  const liste = useDuzeltmeler((d) => (d.projeId === pid ? d.liste : null));
  const yukleme = useDuzeltmeler((d) => d.yukleme);
  const hata = useDuzeltmeler((d) => d.hata);
  const [onay, setOnay] = useState(false);
  const [sonGonderim, setSonGonderim] = useState<number | null>(null);
  const { suruyor, calistir } = useIslem();

  const acikNotlar = useMemo(() => (liste ?? []).filter((d) => d.durum === "acik"), [liste]);
  const gonderilenler = useMemo(
    () =>
      (liste ?? [])
        .filter((d) => d.durum === "gonderildi")
        .sort((a, b) => (b.gonderimZamani ?? b.zaman).localeCompare(a.gonderimZamani ?? a.zaman)),
    [liste],
  );
  const govdeGorunur = !dar || acik;

  const gonder = () => {
    if (!pid) return;
    void calistir("gonder", async () => {
      const g = await duzeltmeleriGonder(pid);
      setOnay(false);
      setSonGonderim(g.gonderilen.length);
    });
  };

  return (
    <aside className="tarayici-notlar" data-acik={dar && acik ? "" : undefined} aria-label={t.baslik}>
      <div className="tarayici-notlar-ust">
        <h2>{t.baslik}</h2>
        <span className="tarayici-notlar-sayac sayi" aria-live="polite">
          {t.sayac(acikNotlar.length)}
        </span>
        {dar ? (
          <button
            type="button"
            className="dugme dugme-sessiz dugme-kucuk dugme-simge tarayici-notlar-ac"
            aria-expanded={acik}
            aria-controls={govdeId}
            aria-label={acik ? t.kapat : t.ac}
            onClick={() => setAcik(!acik)}
          >
            <Simge ad="asagi" />
          </button>
        ) : null}
      </div>

      <div className="tarayici-notlar-govde" id={govdeId} hidden={!govdeGorunur}>
        {liste === null || (yukleme === "yukleniyor" && !liste.length) ? <Iskelet satir={3} /> : null}
        {yukleme === "hata" && hata ? <HataKutu metin={hata} yeniden={pid ? () => void duzeltmeleriYukle(pid) : undefined} /> : null}
        {liste && yukleme === "hazir" && !acikNotlar.length && !sonGonderim ? (
          <Bos baslik={t.bosBaslik} kucuk>
            {kopru ? t.bosMasaustu : t.bosWeb}
          </Bos>
        ) : null}

        {sonGonderim ? (
          <div className="tarayici-gonderildi" role="status">
            <p>
              <b>{t.gonderildi(sonGonderim)}</b> {t.karargahIpucu}
            </p>
            <div className="dugme-satir">
              <button type="button" className="dugme dugme-kucuk" onClick={() => ekranaGit("karargah")}>
                {t.karargahaGec}
                <Simge ad="gonder" />
              </button>
              <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={() => setSonGonderim(null)}>
                {s.genel.kapat}
              </button>
            </div>
          </div>
        ) : null}

        {acikNotlar.length ? (
          <ol className="tarayici-not-liste">
            {acikNotlar.map((d) => (
              <NotOgesi key={d.id} duzeltme={d} kopru={kopru} />
            ))}
          </ol>
        ) : null}

        {gonderilenler.length ? (
          <details className="tarayici-gonderilenler">
            <summary>
              <Simge ad="sag" boyut={12} />
              {t.gonderilenler(gonderilenler.length)}
            </summary>
            <ol className="tarayici-not-liste">
              {gonderilenler.map((d) => (
                <NotOgesi key={d.id} duzeltme={d} kopru={null} />
              ))}
            </ol>
          </details>
        ) : null}
      </div>

      <div className="tarayici-notlar-alt" hidden={!govdeGorunur}>
        {onay ? (
          <OnaySor uyari evet={gonder} vazgec={() => setOnay(false)} evetMetni={t.gonder} suruyor={!!suruyor}>
            {t.gonderOnay(acikNotlar.length)}
          </OnaySor>
        ) : (
          <button type="button" className="dugme dugme-ana tarayici-yaptir" disabled={!acikNotlar.length || !pid} onClick={() => setOnay(true)}>
            <DugmeYukleniyor suruyor={!!suruyor}>{t.hepsiniYaptir}</DugmeYukleniyor>
            {acikNotlar.length ? <span className="tarayici-yaptir-sayi sayi">{acikNotlar.length}</span> : null}
          </button>
        )}
        <p className="tarayici-notlar-ipucu">{t.hepsiniYaptirAlt}</p>
      </div>
    </aside>
  );
}

function NotOgesi({ duzeltme: d, kopru }: { duzeltme: Duzeltme; kopru: MasaustuTarayicisi | null }) {
  const s = useSozluk();
  const t = s.tarayici.panel;
  const [duzenliyor, setDuzenliyor] = useState(false);
  const [metin, setMetin] = useState(d.not);
  const [silOnay, setSilOnay] = useState(false);
  const { suruyor, calistir } = useIslem();
  const kisa = kisaAdres(d.adres);
  const acik = d.durum === "acik";

  const kaydet = () => {
    const temiz = metin.trim();
    if (!temiz) return;
    if (temiz === d.not) {
      setDuzenliyor(false);
      return;
    }
    void calistir("kaydet", async () => {
      await duzeltmeNotunuDuzelt(d.id, temiz);
      setDuzenliyor(false);
    });
  };

  return (
    <li className="tarayici-not" data-durum={d.durum}>
      <DuzeltmeGorseli duzeltme={d} />
      <div className="tarayici-not-icerik">
        <div className="tarayici-not-sayfa">
          {kopru && acik ? (
            <button type="button" className="metin-dugme tek-satir" title={t.sayfayaGit(kisa)} onClick={() => void kopru.git(d.adres)}>
              {kisa}
            </button>
          ) : (
            <span className="tek-satir" title={d.adres}>
              {kisa}
            </span>
          )}
        </div>
        {duzenliyor ? (
          <div className="tarayici-not-duzenle">
            <textarea
              className="metin-alani"
              rows={3}
              maxLength={4000}
              aria-label={t.duzenle}
              value={metin}
              autoFocus
              onChange={(e) => setMetin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setMetin(d.not);
                  setDuzenliyor(false);
                } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  kaydet();
                }
              }}
            />
            <div className="dugme-satir">
              <button type="button" className="dugme dugme-kucuk dugme-ana" disabled={!metin.trim() || !!suruyor} onClick={kaydet}>
                <DugmeYukleniyor suruyor={!!suruyor}>{s.genel.kaydet}</DugmeYukleniyor>
              </button>
              <button
                type="button"
                className="dugme dugme-kucuk dugme-sessiz"
                onClick={() => {
                  setMetin(d.not);
                  setDuzenliyor(false);
                }}
              >
                {s.genel.vazgec}
              </button>
            </div>
          </div>
        ) : (
          <p className="tarayici-not-yazi">{d.not}</p>
        )}
        <div className="tarayici-not-alt">
          {d.secici ? (
            <code className="tek-satir" title={d.secici}>
              {d.secici}
            </code>
          ) : (
            <span>{t.elle}</span>
          )}
          {!acik && d.gonderimZamani ? <span className="tarayici-not-zaman">{t.gonderimZamani(goreli(d.gonderimZamani))}</span> : null}
        </div>
      </div>
      {!duzenliyor ? (
        <div className="tarayici-not-eylem">
          {acik ? (
            <button
              type="button"
              className="dugme dugme-sessiz dugme-kucuk dugme-simge"
              aria-label={t.duzenle}
              title={t.duzenle}
              onClick={() => {
                setMetin(d.not);
                setDuzenliyor(true);
              }}
            >
              <Simge ad="duzenle" />
            </button>
          ) : null}
          <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={t.sil} title={t.sil} onClick={() => setSilOnay(true)}>
            <Simge ad="cop" />
          </button>
        </div>
      ) : null}
      {silOnay ? (
        <div className="tarayici-not-onay">
          <OnaySor evet={() => void calistir("sil", () => duzeltmeSil(d))} vazgec={() => setSilOnay(false)} evetMetni={s.genel.sil} suruyor={suruyor === "sil"}>
            {acik ? t.silOnay : t.silOnayGonderilmis}
          </OnaySor>
        </div>
      ) : null}
    </li>
  );
}
