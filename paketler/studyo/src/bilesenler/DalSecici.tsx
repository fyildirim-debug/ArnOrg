// Çalışma dalı seçici: listeden dal (varsayılan ve korumalı işaretli, yerel ve uzak gruplu) ya da yeni dal adı.
// GitHub'dan klonlarken ve Proje ayarları'nda kullanılır.
import { useEffect, useState } from "react";
import { useSozluk } from "../dil";
import { HataKutu, Yukleniyor } from "./Durumlar";

export interface DalSecenegi {
  ad: string;
  varsayilan?: boolean;
  korumali?: boolean;
  grup?: "yerel" | "uzak";
}

/** Dal adında olamayacak bir değer: "Yeni dal…" seçeneği */
const YENI = "\u0000yeni";

export function DalSecici({
  id,
  etiket,
  secenekler,
  deger,
  degisti,
  yukleniyor,
  hata,
  yeniden,
  ipucu,
  dogrulama,
  kilitli,
  bosDepo,
  etiketGizli,
}: {
  id: string;
  etiket: string;
  /** Etiket yalnız ekran okuyucuya (satır başlığı başka yerde) */
  etiketGizli?: boolean;
  secenekler: DalSecenegi[];
  deger: string;
  degisti: (dal: string) => void;
  yukleniyor?: boolean;
  hata?: string | null;
  yeniden?: () => void;
  ipucu?: string;
  /** Yazılan yeni dal adı geçersizse hata metni */
  dogrulama?: string | null;
  kilitli?: boolean;
  /** Seçenek yoksa (boş depo) gösterilecek açıklama */
  bosDepo?: boolean;
}) {
  const s = useSozluk();
  const t = s.kurulum.dal;
  const [yeniMod, setYeniMod] = useState(false);
  const listede = secenekler.some((o) => o.ad === deger);
  const yaziyla = yeniMod || (!yukleniyor && !hata && secenekler.length === 0);
  const varsayilanDal = secenekler.find((o) => o.varsayilan)?.ad ?? secenekler[0]?.ad ?? "main";

  // Liste değişince (başka depo) yeni dal kipinden çık
  const anahtar = secenekler.map((o) => o.ad).join("\n");
  useEffect(() => {
    setYeniMod(false);
  }, [anahtar]);

  const etiketi = (o: DalSecenegi) => `${o.ad}${o.varsayilan ? ` · ${t.varsayilan}` : ""}${o.korumali ? ` · ${t.korumali}` : ""}`;
  const gruplu = secenekler.some((o) => o.grup);

  return (
    <div className="alan dal-secici">
      <label htmlFor={id} className={etiketGizli ? "gizli" : undefined}>
        {etiket}
      </label>
      {yukleniyor ? (
        <Yukleniyor metin={t.yukleniyor} />
      ) : hata ? (
        <HataKutu baslik={s.kurulum.depo.dallarAlinamadi} metin={hata} yeniden={yeniden} />
      ) : yaziyla ? (
        <div className="dal-yeni">
          <input
            id={id}
            className="girdi"
            value={deger}
            onChange={(e) => degisti(e.target.value)}
            placeholder={t.yeniOrnek}
            spellCheck={false}
            autoComplete="off"
            disabled={kilitli}
            autoFocus={yeniMod}
            aria-invalid={dogrulama ? true : undefined}
            aria-label={secenekler.length ? `${etiket}: ${t.yeniAd}` : undefined}
          />
          {secenekler.length ? (
            <button
              type="button"
              className="metin-dugme"
              disabled={kilitli}
              onClick={() => {
                setYeniMod(false);
                degisti(varsayilanDal);
              }}
            >
              {t.listeyeDon}
            </button>
          ) : null}
        </div>
      ) : (
        <select
          id={id}
          className="secim"
          value={listede ? deger : varsayilanDal}
          disabled={kilitli}
          onChange={(e) => {
            if (e.target.value === YENI) {
              setYeniMod(true);
              degisti("");
            } else degisti(e.target.value);
          }}
        >
          {gruplu ? (
            (["yerel", "uzak"] as const).map((g) => {
              const grup = secenekler.filter((o) => (o.grup ?? "yerel") === g);
              return grup.length ? (
                <optgroup key={g} label={t[g]}>
                  {grup.map((o) => (
                    <option key={`${g}-${o.ad}`} value={o.ad}>
                      {etiketi(o)}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })
          ) : (
            secenekler.map((o) => (
              <option key={o.ad} value={o.ad}>
                {etiketi(o)}
              </option>
            ))
          )}
          <option value={YENI}>{t.yeni}</option>
        </select>
      )}
      {dogrulama ? <span className="alan-hata">{dogrulama}</span> : null}
      {!yukleniyor && !hata && bosDepo && secenekler.length === 0 ? (
        <span className="alan-ipucu">{t.bosDepo}</span>
      ) : ipucu ? (
        <span className="alan-ipucu">{ipucu}</span>
      ) : null}
    </div>
  );
}
