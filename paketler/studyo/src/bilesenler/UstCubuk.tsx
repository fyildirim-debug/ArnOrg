// Üst çubuk: şirket / proje seçici, ekip sayacı, abonelik kullanımı, bağlantı durumu, mesaiyi durdur
import { useRef, useState } from "react";
import { api } from "../api/uclar";
import { bildir, git, hataBildir, yeniProjeIste } from "../durum/arayuz";
import { simdiYenidenBaglan } from "../durum/olaylar";
import { aktifMi, ajanUygula, oturumAcikMi, projeyiSec, useVeri } from "../durum/veri";
import { UstKullanim } from "./Kullanim";
import { useDisariTik } from "../yardimcilar/kancalar";
import { useTercihler } from "../yardimcilar/tercihler";
import { OnaySor } from "./OnaySor";
import { Simge } from "./Simge";

const WS_METNI = { bagli: "Canlı", baglaniyor: "Bağlanıyor", kopuk: "Bağlantı yok" } as const;

export function UstCubuk({ rayDugmesi }: { rayDugmesi: React.ReactNode }) {
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
        <span className="ust-sirket ust-gizle-dar">{sirketAdi || "ArnOrg"}</span>
        <span className="ust-ayrac ust-gizle-dar" aria-hidden="true">
          /
        </span>
        <ProjeSecici adi={proje?.ad ?? (aktifProjeId ? "Proje" : "Proje seçin")} />
      </div>
      <div className="ust-sag">
        {aktifProjeId ? (
          <>
            <span className="metre" title="Çalışan ya da karar bekleyen ajan sayısı">
              <b>{aktif}</b> aktif · <b>{ajanlar.length}</b> çalışan
            </span>
            <span className="metre-ayrac ust-gizle-dar" aria-hidden="true" />
            <UstKullanim />
          </>
        ) : null}
        {wsDurumu === "kopuk" ? (
          <button
            type="button"
            className="ws-durum ws-kopuk"
            onClick={simdiYenidenBaglan}
            title="Canlı bağlantı koptu; arka planda yeniden deneniyor. Hemen denemek için tıklayın."
          >
            <i aria-hidden="true" />
            {WS_METNI.kopuk}
          </button>
        ) : (
          <span className={`ws-durum ws-${wsDurumu}`} title="Canlı olay bağlantısı" role="status">
            <i aria-hidden="true" />
            {WS_METNI[wsDurumu]}
          </span>
        )}
        {aktifProjeId ? <MesaiDugmesi /> : null}
        {rayDugmesi}
      </div>
    </header>
  );
}

function ProjeSecici({ adi }: { adi: string }) {
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
          {projeler.length === 0 ? <p className="acilir-not">Henüz proje yok.</p> : null}
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
            Tüm projeler
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
            Yeni proje
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Projedeki bütün açık oturumları kapatır */
function MesaiDugmesi() {
  const [acik, setAcik] = useState(false);
  const [suruyor, setSuruyor] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ajanlar = useVeri((d) => d.ajanlar);
  const acikOlanlar = ajanlar.filter(oturumAcikMi);
  useDisariTik(ref, acik && !suruyor, () => setAcik(false));

  const durdur = async () => {
    setSuruyor(true);
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
    if (basarili) bildir("basari", `${basarili} ajanın oturumu kapatıldı. Mesai durdu.`);
  };

  return (
    <div className="proje-secici" ref={ref}>
      <button
        type="button"
        className="dugme dugme-kucuk"
        onClick={() => setAcik(!acik)}
        disabled={acikOlanlar.length === 0}
        aria-expanded={acik}
        title={acikOlanlar.length === 0 ? "Açık oturum yok" : "Projedeki bütün ajan oturumlarını kapat"}
      >
        <Simge ad="dur" boyut={12} />
        Mesaiyi durdur
      </button>
      {acik ? (
        <div className="acilir acilir-sag">
          <OnaySor evet={durdur} vazgec={() => setAcik(false)} evetMetni="Hepsini durdur" suruyor={suruyor}>
            {acikOlanlar.length} ajanın oturumu kapanır. Çalışan turlar kesilir; oturum kimlikleri saklanır, ajanlar sonra kaldığı yerden
            başlatılabilir.
          </OnaySor>
        </div>
      ) : null}
    </div>
  );
}
