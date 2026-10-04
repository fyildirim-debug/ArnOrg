// Kurulun kanalının başlık şeridi: üyelerin küçük avatarları (tıklayınca üye düzenleme), serbest konuşmanın durumu
// (sürerken mercan nokta ve "Sürüyor · N mesaj"), Konuşmayı başlat (isteğe bağlı konuyla) / Durdur ve onaylı silme.
import type { Kanal } from "@arnorg/ortak";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir, useArayuz } from "../../durum/arayuz";
import { kanalKaldir, kanalMesajlariniYukle, kanalUygula, useVeri } from "../../durum/veri";
import { konusmaMesajSayisi } from "../../yardimcilar/kanallar";
import { useIslem } from "../../yardimcilar/kancalar";
import { AjanAvatar } from "../Kisi";
import { OnaySor } from "../OnaySor";
import { Simge } from "../Simge";
import { KanalCekmecesi } from "./KanalCekmecesi";

/** Şeritte görünen en çok avatar; fazlası "+N" */
const AVATAR = 4;

export function KonusmaSeridi({ kanal }: { kanal: Kanal }) {
  const s = useSozluk();
  const t = s.kanallar.konusma;
  const pid = useVeri((d) => d.aktifProjeId);
  const ajanlar = useVeri((d) => d.ajanlar);
  const mesajlar = useVeri((d) => d.mesajlar[kanal.ad]);
  const [panel, setPanel] = useState<"baslat" | "sil" | null>(null);
  const [duzenle, setDuzenle] = useState(false);
  const [konu, setKonu] = useState("");
  const { suruyor, calistir } = useIslem();
  const baslatRef = useRef<HTMLButtonElement>(null);
  const konuRef = useRef<HTMLTextAreaElement>(null);
  const id = useId().replace(/[^\w-]/g, "");

  const uyeler = (kanal.uyeler ?? []).map((u) => ajanlar.find((a) => a.id === u)).filter((a) => a !== undefined);
  const canli = kanal.konusma === "suruyor";
  const sayi = canli ? konusmaMesajSayisi(kanal, mesajlar) : null;
  const yetersiz = uyeler.length < 2;

  // Başlatma alanı açılınca konu alanı odaklanır
  useEffect(() => {
    if (panel === "baslat") konuRef.current?.focus();
  }, [panel]);

  const kapatPanel = () => {
    setPanel(null);
    requestAnimationFrame(() => baslatRef.current?.focus());
  };

  const baslat = () => {
    if (!pid) return;
    const temiz = konu.trim();
    void calistir("baslat", async () => {
      kanalUygula(pid, await api.konusma(pid, kanal.ad, { islem: "baslat", konu: temiz || undefined }));
      // Konu kanala kurulun mesajı olarak düşer; canlı bağlantı koptuysa da görünsün
      if (temiz) void kanalMesajlariniYukle(kanal.ad, true).catch(() => undefined);
      setKonu("");
      setPanel(null);
    });
  };

  const durdur = () => {
    if (!pid) return;
    void calistir("durdur", async () => {
      kanalUygula(pid, await api.konusma(pid, kanal.ad, { islem: "durdur" }));
    });
  };

  const sil = () => {
    if (!pid) return;
    void calistir("sil", async () => {
      await api.kanalSil(pid, kanal.ad);
      kanalKaldir(pid, kanal.ad);
      useArayuz.setState({ kanal: "genel" });
      bildir("basari", sozluk().kanallar.konusma.silindi(kanal.ad));
    });
  };

  return (
    <>
      <div className="konusma-serit" role="group" aria-label={t.etiket}>
        <button type="button" className="uye-yigin" onClick={() => setDuzenle(true)} title={t.uyeleriDuzenle} aria-label={`${t.uyeleriDuzenle} · ${t.uyeler(uyeler.length)}`}>
          <span className="uye-yuzler" aria-hidden="true">
            {uyeler.slice(0, AVATAR).map((a) => (
              <AjanAvatar key={a.id} ajan={a} boyut="xs" />
            ))}
            {uyeler.length > AVATAR ? <span className="uye-fazla">+{uyeler.length - AVATAR}</span> : null}
          </span>
          <span className="uye-sayi">{t.uyeler(uyeler.length)}</span>
        </button>
        <span className={`konusma-durum${canli ? " konusma-suruyor" : ""}`} role="status">
          <i aria-hidden="true" />
          {canli ? t.suruyor(sayi) : t.durdu}
        </span>
        <span className="konusma-eylem">
          {canli ? (
            <button type="button" className="dugme dugme-kucuk" onClick={durdur} disabled={suruyor !== null}>
              {suruyor === "durdur" ? <span className="doner" aria-hidden="true" /> : <Simge ad="dur" boyut={11} />}
              {t.durdur}
            </button>
          ) : (
            <button
              type="button"
              ref={baslatRef}
              className="dugme dugme-kucuk"
              onClick={() => {
                // Odaklanabilir kalır ki neden kapalı olduğu okunabilsin
                if (yetersiz) bildir("bilgi", t.ikiUyeGerekir);
                else setPanel(panel === "baslat" ? null : "baslat");
              }}
              aria-expanded={yetersiz ? undefined : panel === "baslat"}
              aria-controls={yetersiz ? undefined : `${id}-baslat`}
              aria-disabled={yetersiz || undefined}
              title={yetersiz ? t.ikiUyeGerekir : undefined}
            >
              <Simge ad="oynat" boyut={11} />
              {t.baslat}
            </button>
          )}
          <button
            type="button"
            className="dugme dugme-kucuk dugme-sessiz dugme-simge"
            onClick={() => setPanel(panel === "sil" ? null : "sil")}
            aria-label={t.sil}
            title={t.sil}
            aria-expanded={panel === "sil"}
          >
            <Simge ad="cop" boyut={12} />
          </button>
        </span>
      </div>
      {kanal.konu ? (
        <p className="konusma-konu tek-satir" title={kanal.konu}>
          {t.konu(kanal.konu)}
        </p>
      ) : null}
      {panel === "baslat" && !canli ? (
        <form
          id={`${id}-baslat`}
          className="konusma-baslat"
          onSubmit={(e) => {
            e.preventDefault();
            baslat();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              kapatPanel();
            }
          }}
        >
          <label htmlFor={`${id}-konu`} className="alan-ad">
            {t.konuEtiketi}
          </label>
          <textarea
            id={`${id}-konu`}
            ref={konuRef}
            className="metin-alani"
            rows={2}
            maxLength={2000}
            value={konu}
            onChange={(e) => setKonu(e.target.value)}
            placeholder={t.konuYer}
            aria-describedby={`${id}-konu-ipucu`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                baslat();
              }
            }}
          />
          <p id={`${id}-konu-ipucu`} className="alan-ipucu">
            {t.konuIpucu}
          </p>
          <div className="dugme-satir">
            <button type="submit" className="dugme dugme-kucuk dugme-ana" disabled={suruyor !== null}>
              {suruyor === "baslat" ? <span className="doner" aria-hidden="true" /> : <Simge ad="oynat" boyut={11} />}
              {t.baslatOnay}
            </button>
            <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={kapatPanel}>
              {s.genel.vazgec}
            </button>
          </div>
        </form>
      ) : null}
      {panel === "sil" ? (
        <OnaySor evet={sil} vazgec={() => setPanel(null)} evetMetni={t.sil} suruyor={suruyor === "sil"}>
          {t.silSoru(kanal.ad, kanal.mesajSayisi)}
        </OnaySor>
      ) : null}
      {duzenle ? <KanalCekmecesi kanal={kanal} kapat={() => setDuzenle(false)} /> : null}
    </>
  );
}
