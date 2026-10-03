// Kurulun doğrudan işe alımı: ad, rol, model, yönetici, karakter, ek talimat
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api/uclar";
import { bildir } from "../../durum/arayuz";
import { ajanUygula, ceoBul, rolleriYukle, useVeri } from "../../durum/veri";
import { useIslem } from "../../yardimcilar/kancalar";
import { Cekmece } from "../Cekmece";
import { HataKutu, Yukleniyor } from "../Durumlar";
import { KarakterSecici } from "../KarakterSecici";
import { modelAdi } from "../Kisi";

export function IseAlFormu({ kapat, alindi }: { kapat: () => void; alindi: (id: string) => void }) {
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const roller = useVeri((d) => d.roller);
  const ajanlar = useVeri((d) => d.ajanlar);
  const [rollerHata, setRollerHata] = useState<string | null>(null);
  const [ad, setAd] = useState("");
  const [rol, setRol] = useState("");
  const [model, setModel] = useState("");
  const [yoneticiId, setYoneticiId] = useState(() => ceoBul(useVeri.getState().ajanlar)?.id ?? "");
  const [talimat, setTalimat] = useState("");
  const [karakter, setKarakter] = useState<string | null>(null);
  const [denendi, setDenendi] = useState(false);
  const { suruyor, hata, calistir } = useIslem();

  useEffect(() => {
    rolleriYukle()
      .then((r) => {
        const ilk = r.find((x) => !x.yonetici) ?? r[0];
        if (ilk) {
          setRol((o) => o || ilk.kimlik);
          setModel((o) => o || ilk.varsayilanModel);
        }
      })
      .catch((e: unknown) => setRollerHata(e instanceof Error ? e.message : "Roller alınamadı."));
  }, []);

  const secilenRol = roller.find((r) => r.kimlik === rol);
  const adHata = !ad.trim()
    ? "Ad gerekli."
    : ajanlar.some((a) => a.ad.toLocaleLowerCase("tr-TR") === ad.trim().toLocaleLowerCase("tr-TR"))
      ? "Bu adda bir çalışan zaten var."
      : null;

  const gonder = (e?: FormEvent) => {
    e?.preventDefault();
    setDenendi(true);
    if (adHata || !rol || !aktifProjeId) return;
    void calistir(
      "iseal",
      async () => {
        const a = await api.iseAl(aktifProjeId, {
          ad: ad.trim(),
          rol,
          model: model || undefined,
          yoneticiId: yoneticiId || null,
          talimatEki: talimat.trim() || undefined,
          karakter,
        });
        ajanUygula(a);
        bildir("basari", `${a.ad} işe alındı. Çalışma alanı hazırlanıyor.`);
        alindi(a.id);
        kapat();
      },
      true,
    );
  };

  return (
    <Cekmece
      baslik="İşe al"
      kapat={kapat}
      alt={
        <>
          <button type="submit" form="ise-al-formu" className="dugme dugme-ana" disabled={suruyor !== null || !roller.length}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            İşe al
          </button>
          <button type="button" className="dugme dugme-sessiz" onClick={kapat}>
            Vazgeç
          </button>
          <span className="alan-ipucu itele">CEO'nun teklifleri Onaylar'a düşer</span>
        </>
      }
    >
      {rollerHata ? <HataKutu metin={rollerHata} /> : null}
      {!roller.length && !rollerHata ? <Yukleniyor metin="Roller yükleniyor…" /> : null}
      <form id="ise-al-formu" className="form-izgara" onSubmit={gonder} noValidate>
        <div className="alan">
          <label htmlFor="ise-ad">Ad</label>
          <input
            id="ise-ad"
            className="girdi"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Aras"
            data-ilk-odak
            aria-invalid={denendi && adHata ? true : undefined}
          />
          {denendi && adHata ? <span className="alan-hata">{adHata}</span> : null}
        </div>
        <div className="alan">
          <label htmlFor="ise-rol">Rol</label>
          <select
            id="ise-rol"
            className="secim"
            value={rol}
            onChange={(e) => {
              setRol(e.target.value);
              const r = roller.find((x) => x.kimlik === e.target.value);
              if (r) setModel(r.varsayilanModel);
            }}
          >
            {roller.map((r) => (
              <option key={r.kimlik} value={r.kimlik}>
                {r.ad}
              </option>
            ))}
          </select>
        </div>
        {secilenRol ? <p className="alan-ipucu tam rol-aciklama">{secilenRol.aciklama}</p> : null}
        <div className="alan">
          <label htmlFor="ise-model">Model</label>
          <select id="ise-model" className="secim" value={model} onChange={(e) => setModel(e.target.value)}>
            {["opus", "sonnet", "haiku"].map((m) => (
              <option key={m} value={m}>
                {modelAdi(m)}
                {secilenRol?.varsayilanModel === m ? " · rol önerisi" : ""}
              </option>
            ))}
            {model && !["opus", "sonnet", "haiku"].includes(model) ? <option value={model}>{model}</option> : null}
          </select>
        </div>
        <div className="alan">
          <label htmlFor="ise-yonetici">Yönetici</label>
          <select id="ise-yonetici" className="secim" value={yoneticiId} onChange={(e) => setYoneticiId(e.target.value)}>
            <option value="">Yönetim kurulu</option>
            {ajanlar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad} · {a.rolAdi}
              </option>
            ))}
          </select>
        </div>
        <div className="alan tam">
          <span className="alan-ad" id="ise-karakter-etiket">
            Karakter
          </span>
          <KarakterSecici deger={karakter} degisti={setKarakter} rol={rol} etiketId="ise-karakter-etiket" />
        </div>
        <div className="alan tam">
          <label htmlFor="ise-talimat">Ek talimat (isteğe bağlı)</label>
          <textarea
            id="ise-talimat"
            className="metin-alani"
            rows={4}
            value={talimat}
            onChange={(e) => setTalimat(e.target.value)}
            placeholder="Rol talimatına eklenir. Örn. Ödeme entegrasyonundan önce OWASP denetimi yap."
          />
        </div>
        {hata ? (
          <div className="tam">
            <HataKutu baslik="İşe alınamadı" metin={hata} />
          </div>
        ) : null}
      </form>
    </Cekmece>
  );
}
