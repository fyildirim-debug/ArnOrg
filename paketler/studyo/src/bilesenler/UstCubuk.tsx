// Üst çubuk: şirket / proje seçici, ekip sayacı, abonelik kullanımı, projenin bütçesi ve seviyesi (0.0.10), bağlantı
// durumu, mesaiyi durdur
import { useRef, useState } from "react";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir, git, hataBildir, yeniProjeIste } from "../durum/arayuz";
import { simdiYenidenBaglan } from "../durum/olaylar";
import { aktifMi, ajanUygula, oturumAcikMi, projeyiSec, useVeri } from "../durum/veri";
import { UstKullanim } from "./Kullanim";
import { ButceGostergesi } from "./butce/ButceGostergesi";
import { useDisariTik } from "../yardimcilar/kancalar";
import { useTercihler } from "../yardimcilar/tercihler";
import { OnaySor } from "./OnaySor";
import { Simge } from "./Simge";

export function UstCubuk({ rayDugmesi }: { rayDugmesi: React.ReactNode }) {
  const s = useSozluk();
  const u = s.gezinti.ust;
  const sirketAdi = useTercihler((t) => t.sirketAdi);
  const projeler = useVeri((d) => d.projeler);
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const ajanlar = useVeri((d) => d.ajanlar);
  const wsDurumu = useVeri((d) => d.wsDurumu);
  const proje = projeler.find((p) => p.id === aktifProjeId);

  const aktif = ajanlar.filter(aktifMi).length;

  return (
    <header className="ust">
      <div className="ust-sol">
        <span className="logo" aria-hidden="true">
          A
        </span>
        <span className="ust-sirket ust-gizle-dar">{sirketAdi || s.genel.arnorg}</span>
        <span className="ust-ayrac ust-gizle-dar" aria-hidden="true">
          /
        </span>
        <ProjeSecici adi={proje?.ad ?? (aktifProjeId ? u.proje : u.projeSecin)} />
      </div>
      <div className="ust-sag">
        {aktifProjeId ? (
          <>
            <span className="metre" title={u.aktifBaslik}>
              <b>{aktif}</b> {u.aktif} · <b>{ajanlar.length}</b> {u.calisan(ajanlar.length)}
            </span>
            <span className="metre-ayrac ust-gizle-dar" aria-hidden="true" />
            <UstKullanim />
            <ButceGostergesi />
          </>
        ) : null}
        {wsDurumu === "kopuk" ? (
          <button
            type="button"
            className="ws-durum ws-kopuk"
            onClick={simdiYenidenBaglan}
            title={u.wsKopukBaslik}
          >
            <i aria-hidden="true" />
            {u.ws.kopuk}
          </button>
        ) : (
          <span className={`ws-durum ws-${wsDurumu}`} title={u.wsBaslik} role="status">
            <i aria-hidden="true" />
            {u.ws[wsDurumu]}
          </span>
        )}
        {aktifProjeId ? <MesaiDugmesi /> : null}
        {rayDugmesi}
      </div>
    </header>
  );
}

function ProjeSecici({ adi }: { adi: string }) {
  const s = useSozluk();
  const [acik, setAcik] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const projeler = useVeri((d) => d.projeler);
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  useDisariTik(ref, acik, () => setAcik(false));

  return (
    <div className="proje-secici" ref={ref}>
      <button type="button" className="proje-dugme" aria-haspopup="menu" aria-expanded={acik} onClick={() => setAcik(!acik)}>
        <span className="tek-satir">{adi}</span>
        <Simge ad="asagi" />
      </button>
      {acik ? (
        <div className="acilir" role="menu">
          {projeler.length === 0 ? <p className="acilir-not">{s.gezinti.ust.projeYok}</p> : null}
          {projeler.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className="acilir-oge"
              aria-current={p.id === aktifProjeId ? "true" : undefined}
              onClick={() => {
                setAcik(false);
                if (p.id !== aktifProjeId) projeyiSec(p.id);
                git("karargah");
              }}
            >
              <span className="tek-satir">{p.ad}</span>
              <small>
                {p.aktifAjanSayisi}/{p.ajanSayisi}
              </small>
            </button>
          ))}
          <div className="acilir-ayrac" />
          <button
            type="button"
            role="menuitem"
            className="acilir-oge"
            onClick={() => {
              setAcik(false);
              git("projeler");
            }}
          >
            <Simge ad="projeler" boyut={14} />
            {s.gezinti.ust.tumProjeler}
          </button>
          <button
            type="button"
            role="menuitem"
            className="acilir-oge"
            onClick={() => {
              setAcik(false);
              yeniProjeIste();
            }}
          >
            <Simge ad="arti" boyut={14} />
            {s.gezinti.ust.yeniProje}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Eşzamanlı tavan yüzünden sırada bekleyen ajan (çekirdeğin iş açıklaması, iki dilde) */
const SIRADA = /^(Sırada|Queued): /;

/** Projedeki bütün açık oturumları kapatır; sırada bekleyen işler de düşer */
function MesaiDugmesi() {
  const u = useSozluk().gezinti.ust;
  const [acik, setAcik] = useState(false);
  const [suruyor, setSuruyor] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ajanlar = useVeri((d) => d.ajanlar);
  const projeId = useVeri((d) => d.aktifProjeId);
  const acikOlanlar = ajanlar.filter(oturumAcikMi);
  const siradakiler = ajanlar.filter((a) => !oturumAcikMi(a) && SIRADA.test(a.isAciklamasi));
  useDisariTik(ref, acik && !suruyor, () => setAcik(false));

  const durdur = async () => {
    setSuruyor(true);
    // Önce proje: sıradaki işler düşer (oturumlar kapanınca sıra kendiliğinden başlamaz), açılışta kimse uyanmaz
    if (projeId) await api.mesaiyiDurdur(projeId).catch(hataBildir);
    const sonuclar = await Promise.allSettled(acikOlanlar.map((a) => api.ajanDurdur(a.id)));
    let basarili = 0;
    sonuclar.forEach((s) => {
      if (s.status === "fulfilled") {
        basarili += 1;
        ajanUygula(s.value);
      } else hataBildir(s.reason);
    });
    setSuruyor(false);
    setAcik(false);
    if (basarili) bildir("basari", sozluk().gezinti.ust.mesaiDurdu(basarili));
  };

  return (
    <div className="proje-secici" ref={ref}>
      <button
        type="button"
        className="dugme dugme-kucuk"
        onClick={() => setAcik(!acik)}
        disabled={acikOlanlar.length === 0 && siradakiler.length === 0}
        aria-expanded={acik}
        title={acikOlanlar.length === 0 && siradakiler.length === 0 ? u.acikOturumYok : u.mesaiBaslik}
      >
        <Simge ad="dur" boyut={12} />
        {u.mesai}
      </button>
      {acik ? (
        <div className="acilir acilir-sag">
          <OnaySor evet={durdur} vazgec={() => setAcik(false)} evetMetni={u.hepsiniDurdur} suruyor={suruyor}>
            {[acikOlanlar.length ? u.mesaiOnay(acikOlanlar.length) : null, siradakiler.length ? u.siradakiler(siradakiler.length) : null].filter(Boolean).join(" ")}
          </OnaySor>
        </div>
      ) : null}
    </div>
  );
}
