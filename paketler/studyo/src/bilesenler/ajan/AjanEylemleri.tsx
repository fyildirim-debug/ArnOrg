// Ajan oturumu eylemleri: başlat, mesaj, kes, durdur. Ekip paneli ve oturum ekranı ortak kullanır.
import type { Ajan, MesajOnceligi } from "@arnorg/ortak";
import { useState, type FormEvent } from "react";
import { api } from "../../api/uclar";
import { bildir } from "../../durum/arayuz";
import { ajanUygula, useVeri } from "../../durum/veri";
import { belirtme, ilgi, yonelme } from "../../yardimcilar/bicim";
import { useIslem } from "../../yardimcilar/kancalar";
import { Simge } from "../Simge";

export function kesilebilirMi(a: Ajan) {
  return a.durum === "calisiyor" || a.durum === "karar_bekliyor";
}

/** Başlat / Kes / Durdur düğmeleri; başlatırken isteğe bağlı ilk talimat sorulur */
export function OturumDugmeleri({ ajan, kucuk }: { ajan: Ajan; kucuk?: boolean }) {
  const { suruyor, calistir } = useIslem();
  const [baslatAcik, setBaslatAcik] = useState(false);
  const boyut = kucuk ? " dugme-kucuk" : "";

  const kes = () =>
    calistir("kes", async () => {
      await api.ajanKes(ajan.id);
      bildir("bilgi", `${ilgi(ajan.ad)} turu kesildi.`);
    });
  const durdur = () =>
    calistir("durdur", async () => {
      ajanUygula(await api.ajanDurdur(ajan.id));
      bildir("bilgi", `${ilgi(ajan.ad)} oturumu kapatıldı.`);
    });

  return (
    <div className="oturum-dugmeleri">
      <div className="dugme-satir">
        {ajan.durum !== "calisiyor" && ajan.durum !== "karar_bekliyor" ? (
          <button type="button" className={`dugme dugme-ana${boyut}`} onClick={() => setBaslatAcik(!baslatAcik)} aria-expanded={baslatAcik}>
            <Simge ad="oynat" boyut={12} />
            {ajan.durum === "kapali" ? "Başlat" : "Devam ettir"}
          </button>
        ) : null}
        {kesilebilirMi(ajan) ? (
          <button
            type="button"
            className={`dugme${boyut}`}
            onClick={kes}
            disabled={suruyor !== null}
            title="Çalışan turu durdurur; oturum açık kalır"
          >
            {suruyor === "kes" ? <span className="doner" aria-hidden="true" /> : <Simge ad="kes" boyut={12} />}
            Kes
          </button>
        ) : null}
        {ajan.durum !== "kapali" ? (
          <button
            type="button"
            className={`dugme${boyut}`}
            onClick={durdur}
            disabled={suruyor !== null}
            title="Oturumu kapatır; oturum kimliği saklanır"
          >
            {suruyor === "durdur" ? <span className="doner" aria-hidden="true" /> : <Simge ad="dur" boyut={12} />}
            Durdur
          </button>
        ) : null}
      </div>
      {baslatAcik ? <BaslatFormu ajan={ajan} kapat={() => setBaslatAcik(false)} /> : null}
    </div>
  );
}

function BaslatFormu({ ajan, kapat }: { ajan: Ajan; kapat: () => void }) {
  const gorevler = useVeri((d) => d.gorevler);
  const [talimat, setTalimat] = useState("");
  const [gorevId, setGorevId] = useState(ajan.gorevId ?? "");
  const { suruyor, calistir } = useIslem();
  const atanmis = gorevler.filter((g) => g.atananId === ajan.id && g.durum !== "tamam" && g.durum !== "iptal");

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    void calistir("baslat", async () => {
      const a = await api.ajanBaslat(ajan.id, { talimat: talimat.trim() || undefined, gorevId: gorevId || undefined });
      ajanUygula(a);
      bildir("basari", `${ajan.ad} başladı.`);
      kapat();
    });
  };

  return (
    <form className="ic-form" onSubmit={gonder}>
      <div className="alan">
        <label htmlFor={`baslat-${ajan.id}`}>İlk talimat (isteğe bağlı)</label>
        <textarea
          id={`baslat-${ajan.id}`}
          className="metin-alani"
          rows={2}
          value={talimat}
          onChange={(e) => setTalimat(e.target.value)}
          placeholder="Boş bırakılırsa atanmış görevden üretilir"
          autoFocus
        />
      </div>
      {atanmis.length ? (
        <div className="alan">
          <label htmlFor={`baslat-gorev-${ajan.id}`}>Görev</label>
          <select id={`baslat-gorev-${ajan.id}`} className="secim" value={gorevId} onChange={(e) => setGorevId(e.target.value)}>
            <option value="">Seçilmedi</option>
            {atanmis.map((g) => (
              <option key={g.id} value={g.id}>
                {g.kod} · {g.baslik}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="dugme-satir">
        <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : null}
          {belirtme(ajan.ad)} başlat
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={kapat}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}

/** Ajana mesaj: next (araç turları arasında katılır) ya da now (turu keser) */
export function MesajFormu({ ajan, satirlar = 2, odakla }: { ajan: Ajan; satirlar?: number; odakla?: boolean }) {
  const [metin, setMetin] = useState("");
  const [hemen, setHemen] = useState(false);
  const { suruyor, calistir } = useIslem();

  const gonder = (e?: FormEvent) => {
    e?.preventDefault();
    const temiz = metin.trim();
    if (!temiz) return;
    const oncelik: MesajOnceligi = hemen ? "now" : "next";
    void calistir("mesaj", async () => {
      await api.ajanaMesaj(ajan.id, { metin: temiz, oncelik });
      setMetin("");
      setHemen(false);
      bildir("basari", hemen ? `${ilgi(ajan.ad)} turu kesildi; mesaj iletildi.` : `Mesaj ${yonelme(ajan.ad)} iletildi.`);
    });
  };

  return (
    <form className="mesaj-formu" onSubmit={gonder}>
      <label className="gizli" htmlFor={`mesaj-${ajan.id}`}>
        {yonelme(ajan.ad)} mesaj
      </label>
      <textarea
        id={`mesaj-${ajan.id}`}
        className="metin-alani"
        rows={satirlar}
        value={metin}
        autoFocus={odakla}
        onChange={(e) => setMetin(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            gonder();
          }
        }}
        placeholder={`${yonelme(ajan.ad)} yazın${ajan.durum === "kapali" ? " · oturum kapalıysa açılır" : ""}`}
      />
      <div className="mesaj-formu-alt">
        <label className="secenek" title="Çalışan turu keser ve mesajı hemen işletir">
          <input type="checkbox" checked={hemen} onChange={(e) => setHemen(e.target.checked)} />
          Hemen <small>(turu keser)</small>
        </label>
        <span className="alan-ipucu mesaj-ipucu">Enter gönderir · Shift+Enter yeni satır</span>
        <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={!metin.trim() || suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="gonder" boyut={12} />}
          Gönder
        </button>
      </div>
    </form>
  );
}
