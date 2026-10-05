// Seçenek seçici: tek seçimde radyo düğmeleri (seçenek çoksa açılır liste), çoklu seçimde onay kutuları; isteğe bağlı
// not ve Gönder. Seçenekli soru, CEO'nun düz metindeki listesi ve kurula sorunun seçenekleri bunu kullanır.
// Klavye: radyo grubunda oklar, kutularda Boşluk; notta Enter gönderir, Shift+Enter yeni satır; vazgeçilebiliyorsa Escape
// kapatır. Gönderim hata verirse seçim ve not yerinde kalır.
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useSozluk } from "../../dil";
import { useIslem } from "../../yardimcilar/kancalar";
import { Simge } from "../Simge";
import "../../stiller/secenek.css";

/** Tek seçimde bundan çok seçenek açılır listeyle seçilir */
export const ACILIR_LISTE_ESIGI = 6;

export interface SecenekOgesi {
  metin: string;
  aciklama?: string | null;
}

export function SecenekSecici({
  secenekler,
  coklu,
  serbestYanit,
  etiket,
  gonder,
  gonderMetni,
  ikincil,
  reddet,
  vazgec,
  kilitli,
  sikisik,
  otomatikOdak,
  aciklayan,
}: {
  secenekler: SecenekOgesi[];
  coklu: boolean;
  /** Seçmeden yalnız yazıyla da yanıt verilebilir */
  serbestYanit: boolean;
  /** Grubun ekran okuyucu adı (soru) */
  etiket: string;
  /** Seçilen 1 tabanlı numaralar ve not */
  gonder: (secilenler: number[], not: string) => Promise<unknown>;
  gonderMetni?: string;
  /** Karar başkasındayken (tam otonomda CEO) Gönder ikincil görünür */
  ikincil?: boolean;
  /** Kurula soruda Reddet: not gerekçe olur */
  reddet?: (not: string) => Promise<unknown>;
  vazgec?: () => void;
  kilitli?: boolean;
  /** Açılır pencere: sıkı aralıklar */
  sikisik?: boolean;
  otomatikOdak?: boolean;
  /** Düğmelerin hangi soruya ait olduğunu söyleyen başlığın kimliği */
  aciklayan?: string;
}) {
  const s = useSozluk();
  const t = s.secenek;
  const kimlik = useId().replace(/[^\w-]/g, "");
  const [secilen, setSecilen] = useState<number[]>([]);
  const [not, setNot] = useState("");
  const { suruyor, calistir } = useIslem();
  const ilkRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const acilir = !coklu && secenekler.length > ACILIR_LISTE_ESIGI;
  const gecerli = secilen.length > 0 || (serbestYanit && not.trim().length > 0);
  const kapali = Boolean(kilitli) || suruyor !== null;
  const durumId = `${kimlik}-durum`;
  const notId = `${kimlik}-not`;

  useEffect(() => {
    if (otomatikOdak) ilkRef.current?.focus();
  }, [otomatikOdak]);

  const sec = (n: number, acik: boolean) => setSecilen((onceki) => (coklu ? (acik ? [...onceki.filter((x) => x !== n), n].sort((a, b) => a - b) : onceki.filter((x) => x !== n)) : acik ? [n] : []));

  const gonderIs = (e?: FormEvent) => {
    e?.preventDefault();
    if (!gecerli || kapali) return;
    void calistir("gonder", () => gonder(secilen, not.trim()));
  };

  const notTusu = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      gonderIs();
    }
  };

  // Durum satırı seçimin kipini söyler; çoklu seçimde kaç seçildiği de görünür
  const durum = coklu ? `${t.cokluSecim} · ${t.secildi(secilen.length, secenekler.length)}` : t.tekSecim;
  const seciliAciklama = acilir && secilen[0] ? secenekler[secilen[0] - 1]?.aciklama : null;

  return (
    <form
      className={`secenek-secici${sikisik ? " secenek-sikisik" : ""}`}
      onSubmit={gonderIs}
      onKeyDown={(e) => {
        if (e.key === "Escape" && vazgec) {
          e.stopPropagation();
          vazgec();
        }
      }}
    >
      {/* Gönderilirken alanlar açık kalır (odak yerinde durur); ikinci gönderimi useIslem engeller */}
      <fieldset className="secenek-grup" disabled={Boolean(kilitli)}>
        <legend className="gizli">{etiket}</legend>
        {acilir ? (
          <div className="secenek-acilir">
            <select ref={ilkRef} className="secim" value={secilen[0] ?? ""} onChange={(e) => sec(Number(e.target.value), e.target.value !== "")} aria-label={etiket} aria-describedby={durumId}>
              <option value="">{t.acilirYer}</option>
              {secenekler.map((x, i) => (
                <option key={i} value={i + 1}>
                  {`${i + 1}. ${x.metin}`}
                </option>
              ))}
            </select>
            {seciliAciklama ? <p className="secenek-aciklama">{seciliAciklama}</p> : null}
          </div>
        ) : (
          <ol className="secenek-liste">
            {secenekler.map((x, i) => {
              const n = i + 1;
              const secili = secilen.includes(n);
              const aciklamaId = x.aciklama ? `${kimlik}-a${n}` : undefined;
              return (
                <li key={n}>
                  <label className={`secenek-satir${secili ? " secenek-secili" : ""}`}>
                    <input
                      ref={i === 0 ? ilkRef : undefined}
                      type={coklu ? "checkbox" : "radio"}
                      name={`${kimlik}-secim`}
                      value={n}
                      checked={secili}
                      onChange={(e) => sec(n, e.target.checked)}
                      aria-describedby={aciklamaId}
                    />
                    <span className="secenek-no sayi" aria-hidden="true">
                      {n}
                    </span>
                    <span className="secenek-metin">
                      {x.metin}
                      {x.aciklama ? (
                        <small id={aciklamaId} className="secenek-aciklama">
                          {x.aciklama}
                        </small>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
        )}
        <label htmlFor={notId} className="gizli">
          {t.notEtiketi}
        </label>
        <textarea
          id={notId}
          className="metin-alani secenek-not"
          rows={1}
          value={not}
          maxLength={4000}
          onChange={(e) => setNot(e.target.value)}
          onKeyDown={notTusu}
          placeholder={serbestYanit ? t.serbestYer : t.notYer}
          title={t.gonderIpucu}
        />
      </fieldset>
      <div className="secenek-alt">
        <p className="secenek-durum" id={durumId}>
          {durum}
        </p>
        {/* Düğmeler birlikte kayar: dar kapta durumun altına sağa iner */}
        <div className="secenek-dugmeler">
          {vazgec ? (
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={vazgec} disabled={suruyor !== null}>
              {s.genel.vazgec}
            </button>
          ) : null}
          {reddet ? (
            <button type="button" className="dugme dugme-kucuk" onClick={() => void calistir("reddet", () => reddet(not.trim()))} disabled={kapali} aria-describedby={aciklayan}>
              {suruyor === "reddet" ? <span className="doner" aria-hidden="true" /> : null}
              {t.onay.reddet}
            </button>
          ) : null}
          <button type="submit" className={`dugme dugme-kucuk${ikincil ? "" : " dugme-ana"}`} disabled={!gecerli || kapali} aria-describedby={aciklayan ? `${aciklayan} ${durumId}` : durumId}>
            {suruyor === "gonder" ? <span className="doner" aria-hidden="true" /> : <Simge ad="gonder" boyut={12} />}
            {gonderMetni ?? t.gonder}
          </button>
        </div>
      </div>
    </form>
  );
}
