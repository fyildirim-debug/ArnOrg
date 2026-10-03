// Tek onay satırı: tür, başlık, türe göre ek veri, karar düğmeleri
import { ONAY_TURU_ADLARI, type Onay, type OnayDurumu } from "@arnorg/ortak";
import { useState } from "react";
import { api } from "../api/uclar";
import { bildir, git } from "../durum/arayuz";
import { onayUygula, useVeri } from "../durum/veri";
import { akilliZaman } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";
import { modelAdi } from "./Kisi";

export const ONAY_DURUM_ADLARI: Record<OnayDurumu, string> = {
  bekliyor: "Bekliyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
  zaman_asimi: "Süre doldu",
};

const ALAN_ADLARI: Record<string, string> = {
  ad: "Ad",
  rol: "Rol",
  model: "Model",
  yoneticiId: "Yönetici",
  talimatEki: "Ek talimat",
  gerekce: "Gerekçe",
  ajanId: "Ajan",
  gorevId: "Görev",
  dal: "Dal",
  hedefDal: "Hedef dal",
  dosyaSayisi: "Dosya",
  eklenen: "Eklenen satır",
  silinen: "Silinen satır",
  testler: "Testler",
  arac: "Araç",
  girdi: "Girdi",
  kural: "Kural",
  aracKimligi: "Çağrı kimliği",
};

/** Onay verisini anahtar–değer olarak gösterir; bilinen alanları insanca biçimler */
export function OnayVerisi({ veri }: { veri: unknown }) {
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const roller = useVeri((d) => d.roller);
  if (!veri || typeof veri !== "object" || Array.isArray(veri)) return null;
  const satirlar = Object.entries(veri as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!satirlar.length) return null;

  const bicimle = (anahtar: string, v: unknown): React.ReactNode => {
    if ((anahtar === "yoneticiId" || anahtar === "ajanId") && typeof v === "string") {
      const a = ajanlar.find((x) => x.id === v);
      return a ? `${a.ad} · ${a.rolAdi}` : v;
    }
    if (anahtar === "gorevId" && typeof v === "string") {
      const g = gorevler.find((x) => x.id === v);
      return g ? `${g.kod} · ${g.baslik}` : v;
    }
    if (anahtar === "rol" && typeof v === "string") return roller.find((r) => r.kimlik === v)?.ad ?? v;
    if (anahtar === "model" && typeof v === "string") return modelAdi(v);
    if (anahtar === "dal" || anahtar === "hedefDal") return <code>{String(v)}</code>;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    if (anahtar === "girdi" && v && typeof v === "object" && "command" in v) return <pre className="komut">{String((v as { command: unknown }).command)}</pre>;
    return <code className="onay-json">{JSON.stringify(v)}</code>;
  };

  return (
    <dl className="kv onay-veri">
      {satirlar.map(([k, v]) => (
        <div key={k} className="kv-satir">
          <dt>{ALAN_ADLARI[k] ?? k}</dt>
          <dd>{bicimle(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OnayKararDugmeleri({ onay, onayMetni = "Onayla", retMetni = "Reddet" }: { onay: Onay; onayMetni?: string; retMetni?: string }) {
  const [not, setNot] = useState("");
  const [notAcik, setNotAcik] = useState(false);
  const { suruyor, calistir } = useIslem();

  const karar = (k: "onayla" | "reddet") =>
    calistir(k, async () => {
      const sonuc = await api.onayKarari(onay.id, { karar: k, not: not.trim() || undefined });
      onayUygula(sonuc);
      bildir(k === "onayla" ? "basari" : "bilgi", `${onay.baslik}: ${k === "onayla" ? "onaylandı" : "reddedildi"}.`);
    });

  return (
    <div className="onay-karar">
      <div className="dugme-satir">
        <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={() => void karar("onayla")} disabled={suruyor !== null}>
          {suruyor === "onayla" ? <span className="doner" aria-hidden="true" /> : null}
          {onayMetni}
        </button>
        <button type="button" className="dugme dugme-kucuk" onClick={() => void karar("reddet")} disabled={suruyor !== null}>
          {suruyor === "reddet" ? <span className="doner" aria-hidden="true" /> : null}
          {retMetni}
        </button>
        {!notAcik ? (
          <button type="button" className="metin-dugme" onClick={() => setNotAcik(true)}>
            Not ekle
          </button>
        ) : null}
      </div>
      {notAcik ? (
        <input
          className="girdi onay-not-girdi"
          aria-label="Karar notu (isteğe bağlı)"
          placeholder="Not (isteğe bağlı) · ajana iletilir"
          value={not}
          onChange={(e) => setNot(e.target.value)}
          autoFocus
        />
      ) : null}
    </div>
  );
}

export function OnayOgesi({ onay }: { onay: Onay }) {
  const ajanlar = useVeri((d) => d.ajanlar);
  const ajan = ajanlar.find((a) => a.id === onay.ajanId);
  return (
    <li className={`onay onay-${onay.durum}`}>
      <div className="onay-govde">
        <div className="onay-ust">
          <b>{onay.baslik}</b>
          <span className="etiket">{ONAY_TURU_ADLARI[onay.tur]}</span>
        </div>
        <small className="onay-kim">
          {ajan ? `${ajan.ad} · ${ajan.rolAdi}` : "ArnOrg"} · {akilliZaman(onay.olusturma)}
        </small>
        {onay.ayrinti ? <p>{onay.ayrinti}</p> : null}
        <OnayVerisi veri={onay.veri} />
        {onay.not ? <p className="onay-not">Not: {onay.not}</p> : null}
      </div>
      <div className="onay-sag">
        {onay.durum === "bekliyor" ? (
          onay.tur === "arac" ? (
            <button type="button" className="dugme dugme-kucuk" onClick={() => git("denetim")}>
              Denetimde karar ver
            </button>
          ) : (
            <OnayKararDugmeleri onay={onay} />
          )
        ) : (
          <span className="onay-sonuc">
            <span className={`hukum hukum-${onay.durum}`}>{ONAY_DURUM_ADLARI[onay.durum]}</span>
            {onay.sonuclanma ? <small>{akilliZaman(onay.sonuclanma)}</small> : null}
          </span>
        )}
      </div>
    </li>
  );
}
