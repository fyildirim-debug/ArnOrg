// Web kipi: Stüdyo tarayıcıdan açıldığında uygulama içi tarayıcı yoktur. Kısa açıklama ve elle not formu
// (sayfanın adresi ve not); notlar paneli ve "Hepsini yaptır" aynı biçimde çalışır.
import { useId, useState } from "react";
import { useSozluk } from "../../dil";
import { duzeltmeEkle } from "../../durum/duzeltmeler";
import { useIslem } from "../../yardimcilar/kancalar";
import { adresMi } from "../../yardimcilar/tarayiciAdresi";
import { sonAdres, sonAdresiYaz } from "../../yardimcilar/tercihler";
import { DugmeYukleniyor } from "../Durumlar";

export function WebKipi({ pid }: { pid: string | null }) {
  const s = useSozluk();
  const t = s.tarayici.web;
  const adresId = useId();
  const notId = useId();
  const hataId = useId();
  const [adres, setAdres] = useState(() => (pid ? (sonAdres(pid) ?? "") : ""));
  const [not, setNot] = useState("");
  const [adresHatali, setAdresHatali] = useState(false);
  const { suruyor, calistir } = useIslem();

  const ekle = () => {
    if (!pid) return;
    const tam = adresMi(adres);
    if (!tam) {
      setAdresHatali(true);
      return;
    }
    const temiz = not.trim();
    if (!temiz) return;
    void calistir("ekle", async () => {
      await duzeltmeEkle(pid, { adres: tam, not: temiz });
      sonAdresiYaz(pid, tam);
      setAdres(tam);
      setNot("");
    });
  };

  return (
    <div className="tarayici-web">
      <div className="tarayici-web-ic">
        <h1>{s.tarayici.baslik}</h1>
        <p className="tarayici-web-baslik">{t.baslik}</p>
        <p className="tarayici-web-metin">{t.metin}</p>
        <form
          className="tarayici-elle"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            ekle();
          }}
        >
          <h2>{t.formBaslik}</h2>
          <div className="alan">
            <label htmlFor={adresId}>{t.adres}</label>
            <input
              id={adresId}
              className="girdi"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={t.adresIpucu}
              value={adres}
              aria-invalid={adresHatali || undefined}
              aria-describedby={adresHatali ? hataId : undefined}
              onChange={(e) => {
                setAdres(e.target.value);
                setAdresHatali(false);
              }}
            />
            {adresHatali ? (
              <span className="alan-hata" id={hataId}>
                {t.adresHata}
              </span>
            ) : null}
          </div>
          <div className="alan">
            <label htmlFor={notId}>{t.not}</label>
            <textarea
              id={notId}
              className="metin-alani"
              rows={4}
              maxLength={4000}
              placeholder={s.tarayici.not.ipucu}
              value={not}
              onChange={(e) => setNot(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  ekle();
                }
              }}
            />
          </div>
          <div className="dugme-satir">
            <button type="submit" className="dugme dugme-ana" disabled={!pid || !adres.trim() || !not.trim() || !!suruyor}>
              <DugmeYukleniyor suruyor={!!suruyor}>{t.ekle}</DugmeYukleniyor>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
