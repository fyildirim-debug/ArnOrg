// Onaylar: otomatik onay kutusu ve kapsamı. İşaretlenince kapsamdaki türlerin onayları kendiliğinden verilir
// (kayıt yine tutulur) ve bekleyen uygun onaylar da hemen verilir; bu, işaretlemeden önce söylenir.
// Açıkken ekranın üstünde sakin ama açık bir uyarı satırı durur.
import { ONAY_TURLERI, VARSAYILAN_OTOMATIK_ONAY_TURLERI, type OnayTuru, type OtomatikOnay } from "@arnorg/ortak";
import { useId, useMemo, useRef, useState } from "react";
import { api } from "../api/uclar";
import { useDil, useSozluk } from "../dil";
import { bildir } from "../durum/arayuz";
import { projeUygula, useVeri } from "../durum/veri";
import { useDisariTik, useIslem } from "../yardimcilar/kancalar";
import { Simge } from "./Simge";

// Hiç ayarlanmamış projenin kapsamı ortak sabitte (VARSAYILAN_OTOMATIK_ONAY_TURLERI): soru (genel) ve teslim kurula kalır

const KAPALI: OtomatikOnay = { etkin: false, turler: [] };

/** Etkin projenin otomatik onay ayarı ve kaydetme */
function useOtomatikOnay() {
  const proje = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId));
  const onaylar = useVeri((d) => d.onaylar);
  const ayar = proje?.otomatikOnay ?? KAPALI;
  // Kapalıyken boş liste "hiç ayarlanmadı" demektir: işaretlenince varsayılan türler gider
  const kapsam = ayar.turler.length || ayar.etkin ? ayar.turler : VARSAYILAN_OTOMATIK_ONAY_TURLERI;
  const { suruyor, calistir } = useIslem();

  const bekleyenUygun = (turler: OnayTuru[]) => onaylar.filter((o) => o.durum === "bekliyor" && turler.includes(o.tur)).length;

  const kaydet = (yeni: OtomatikOnay, mesaj?: string) =>
    calistir("kaydet", async () => {
      if (!proje) return;
      const p = await api.projeGuncelle(proje.id, { otomatikOnay: yeni });
      projeUygula(p);
      if (mesaj) bildir("basari", mesaj);
    });

  return { proje, ayar, kapsam, bekleyenUygun, kaydet, kaydediliyor: suruyor !== null };
}

/** Ekran başlığının yanındaki kutu: işaretle, kapsamı seç */
export function OtomatikOnayKutusu() {
  const s = useSozluk();
  const t = s.onaylar.oto;
  const { proje, ayar, kapsam, bekleyenUygun, kaydet, kaydediliyor } = useOtomatikOnay();
  const ipucuId = useId();
  // Yanıt gelene kadar kutu tıklanan hâlde görünür
  const [hedef, setHedef] = useState<boolean | null>(null);
  if (!proje) return null;

  const etkin = hedef ?? ayar.etkin;
  const uygun = bekleyenUygun(kapsam);
  const degistir = (yeni: boolean) => {
    // İşaretlenirken liste boşsa (hiç ayarlanmamış proje) varsayılan türler gönderilir
    const turler = yeni && !ayar.turler.length ? VARSAYILAN_OTOMATIK_ONAY_TURLERI : kapsam;
    setHedef(yeni);
    void kaydet({ etkin: yeni, turler }, yeni ? t.acildi(bekleyenUygun(turler)) : t.kapandi).finally(() => setHedef(null));
  };

  return (
    <div className={`oto-onay${etkin ? " oto-onay-acik" : ""}`}>
      <div className="oto-onay-satir">
        <label className="oto-onay-kutu">
          <input type="checkbox" checked={etkin} onChange={(e) => degistir(e.target.checked)} disabled={kaydediliyor} aria-describedby={ipucuId} />
          <span>{t.etiket}</span>
          {kaydediliyor ? <span className="doner" aria-hidden="true" /> : null}
        </label>
        <KapsamSecici />
      </div>
      <small className="oto-onay-ipucu" id={ipucuId}>
        {etkin ? t.ipucuAcik : t.ipucuKapali(uygun)}
      </small>
    </div>
  );
}

function KapsamSecici() {
  const s = useSozluk();
  const t = s.onaylar.oto;
  const { ayar, kapsam: kayitli, kaydet, kaydediliyor } = useOtomatikOnay();
  const [acik, setAcik] = useState(false);
  // Yanıt gelene kadar seçim tıklanan hâlde görünür (kutular bu sırada kilitli)
  const [yerel, setYerel] = useState<OnayTuru[] | null>(null);
  const kapsam = yerel ?? kayitli;
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useDisariTik(ref, acik, () => setAcik(false));

  const varsayilanda = kapsam.length === VARSAYILAN_OTOMATIK_ONAY_TURLERI.length && VARSAYILAN_OTOMATIK_ONAY_TURLERI.every((x) => kapsam.includes(x));
  const kaydetYerel = (turler: OnayTuru[], mesaj?: string) => {
    setYerel(turler);
    void kaydet({ etkin: ayar.etkin, turler }, mesaj).finally(() => setYerel(null));
  };
  const degistir = (tur: OnayTuru) => kaydetYerel(ONAY_TURLERI.filter((x) => (x === tur ? !kapsam.includes(x) : kapsam.includes(x))));

  return (
    <div className="oto-kapsam" ref={ref}>
      <button
        type="button"
        className="dugme dugme-sessiz dugme-kucuk oto-kapsam-dugme"
        aria-expanded={acik}
        aria-controls={acik ? panelId : undefined}
        onClick={() => setAcik(!acik)}
      >
        {t.kapsam}
        <span className="sayi">{t.kapsamSayisi(kapsam.length, ONAY_TURLERI.length)}</span>
        <Simge ad="asagi" boyut={12} />
      </button>
      {acik ? (
        <div className="acilir acilir-sag oto-kapsam-panel" id={panelId} role="group" aria-label={t.kapsamEtiketi}>
          <p className="oto-kapsam-baslik">{t.kapsamEtiketi}</p>
          <ul>
            {ONAY_TURLERI.map((tur) => (
              <li key={tur}>
                <label className="oto-tur">
                  <input type="checkbox" checked={kapsam.includes(tur)} onChange={() => degistir(tur)} disabled={kaydediliyor} />
                  <span className="oto-tur-metin">
                    <b>{s.genel.onayTuru[tur]}</b>
                    <small>{t.turAciklama[tur]}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="oto-kapsam-aciklama">{t.aciklama}</p>
          <button
            type="button"
            className="metin-dugme"
            onClick={() => kaydetYerel(VARSAYILAN_OTOMATIK_ONAY_TURLERI, t.kapsamGuncellendi)}
            disabled={varsayilanda || kaydediliyor}
          >
            {t.varsayilan}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Açıkken başlığın altında: onaylar kendiliğinden veriliyor, kayıt tutuluyor */
export function OtomatikOnayUyarisi() {
  const s = useSozluk();
  const t = s.onaylar.oto;
  const dil = useDil();
  const { ayar, kaydet, kaydediliyor } = useOtomatikOnay();
  const adlar = useMemo(() => {
    const sirali = ONAY_TURLERI.filter((x) => ayar.turler.includes(x)).map((x) => s.genel.onayTuru[x]);
    try {
      return new Intl.ListFormat(dil, { style: "long", type: "conjunction" }).format(sirali);
    } catch {
      return sirali.join(", ");
    }
  }, [ayar.turler, dil, s]);
  if (!ayar.etkin) return null;

  return (
    <div className="oto-uyari" role="status">
      <i className="oto-isik" aria-hidden="true" />
      <p>{ayar.turler.length ? t.uyari(adlar) : t.uyariBos}</p>
      <button type="button" className="dugme dugme-kucuk" onClick={() => void kaydet({ etkin: false, turler: ayar.turler }, t.kapandi)} disabled={kaydediliyor}>
        {kaydediliyor ? <span className="doner" aria-hidden="true" /> : null}
        {t.kapat}
      </button>
    </div>
  );
}
