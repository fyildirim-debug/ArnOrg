// Anahtar yokken ya da geçersizken gösterilen bağlantı ekranı
import { useState, type FormEvent } from "react";
import { anahtarAyarla } from "../api/anahtar";
import { hataMetni } from "../api/istek";
import type { Saglik } from "@arnorg/ortak";

export function AnahtarGerekli() {
  const [deger, setDeger] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [suruyor, setSuruyor] = useState(false);

  const gonder = async (e: FormEvent) => {
    e.preventDefault();
    // Bağlantı adresinin tamamı yapıştırılırsa anahtarı içinden al
    const ham = deger.trim();
    const eslesme = /anahtar=([^&\s]+)/.exec(ham);
    const anahtar = eslesme?.[1] ? decodeURIComponent(eslesme[1]) : ham;
    if (!anahtar) {
      setHata("Anahtarı yapıştırın.");
      return;
    }
    setSuruyor(true);
    setHata(null);
    try {
      // Anahtar sağlık ucuyla doğrulanır; geçersizse 401 döner.
      // istek() kullanılmaz: o, 401'de anahtarı siler ve genel hata metni verir
      const yanit = await fetch("/api/saglik", { headers: { Authorization: `Bearer ${anahtar}` } });
      if (yanit.status === 401) throw new Error("Anahtar geçersiz. Çekirdeğin yazdığı son bağlantıyı kullanın.");
      if (!yanit.ok) throw new Error(`Çekirdek yanıt vermedi (${yanit.status}).`);
      (await yanit.json()) as Saglik;
      anahtarAyarla(anahtar);
    } catch (e) {
      setHata(e instanceof TypeError ? "Çekirdeğe ulaşılamadı. Sunucunun çalıştığını denetleyin." : hataMetni(e));
    } finally {
      setSuruyor(false);
    }
  };

  return (
    <main className="giris">
      <div className="giris-ic">
        <p className="giris-marka" aria-label="ArnOrg">
          Arn<span>Org</span>
        </p>
        <h1>Bağlantı anahtarı gerekli</h1>
        <p>
          Çekirdek ilk açılışta bir erişim anahtarı üretir ve sunucu modunda bağlantı adresini terminale yazar. O adresi açın ya da anahtarı aşağıya
          yapıştırın. Anahtar yalnız bu sekmede tutulur; sekme kapanınca silinir.
        </p>
        <form onSubmit={gonder} noValidate>
          <div className="alan">
            <label htmlFor="anahtar-girdi">Erişim anahtarı ya da bağlantı adresi</label>
            <div className="giris-satir">
              <input
                id="anahtar-girdi"
                className="girdi"
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                value={deger}
                onChange={(e) => setDeger(e.target.value)}
                aria-invalid={hata ? true : undefined}
                aria-describedby={hata ? "anahtar-hata" : "anahtar-ipucu"}
                placeholder="http://127.0.0.1:47820/#anahtar=…"
              />
              <button type="submit" className="dugme dugme-ana" disabled={suruyor}>
                {suruyor ? <span className="doner" aria-hidden="true" /> : null}
                Bağlan
              </button>
            </div>
            {hata ? (
              <span id="anahtar-hata" className="alan-hata" role="alert">
                {hata}
              </span>
            ) : (
              <span id="anahtar-ipucu" className="alan-ipucu">
                Anahtar dosyası: &lt;veri dizini&gt;/erisim-anahtari
              </span>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
