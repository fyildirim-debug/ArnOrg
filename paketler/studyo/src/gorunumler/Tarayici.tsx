// Tarayıcı: projenin çalışan sayfası uygulamanın içinde açılır; bir öğe seçilip "burası olmamış" notu bırakılır,
// notlar yanda birikir, "Hepsini yaptır" açık notları tek kurul mesajıyla CEO'ya (#yonetim) gönderir.
// Masaüstünde sayfa ana süreçteki bir WebContentsView'dır (window.arnorg.tarayici, bkz. MasaustuTarayici);
// tarayıcıdan açılan Stüdyo'da (web kipi) not elle eklenir. Notlar paneli iki kipte aynıdır.
// Sağ sütunun üstünde projenin Linkleri (ProjeAdresleri; her zaman görünür, CEO verir ve güncel tutar, kurul da ekler):
// tıklanan link masaüstünde uygulama içi tarayıcıda, web kipinde çerçevede açılır.
import "../stiller/tarayici.css";
import type { ProjeAdresi } from "@arnorg/ortak";
import { useEffect, useRef, useState } from "react";
import { useSozluk } from "../dil";
import { useAdresler } from "../durum/adresler";
import { hataBildir } from "../durum/arayuz";
import { duzeltmeleriYukle } from "../durum/duzeltmeler";
import { useVeri } from "../durum/veri";
import { tarayiciKoprusu } from "../bilesenler/tarayici/katman";
import { MasaustuTarayici } from "../bilesenler/tarayici/MasaustuTarayici";
import { NotlarPaneli } from "../bilesenler/tarayici/NotlarPaneli";
import { ProjeAdresleri } from "../bilesenler/tarayici/ProjeAdresleri";
import { WebKipi } from "../bilesenler/tarayici/WebKipi";
import { useMedya } from "../yardimcilar/kancalar";

/** Bu genişliğin altında notlar paneli alttan açılan çekmecedir: masaüstünde sayfaya yer kalsın diye daha erken */
const DAR_MASAUSTU = "(max-width: 1279px)";
const DAR_WEB = "(max-width: 1023px)";

export function Tarayici() {
  const s = useSozluk();
  const pid = useVeri((d) => d.aktifProjeId);
  const bagli = useVeri((d) => d.wsDurumu === "bagli");
  const [kopru] = useState(tarayiciKoprusu);
  const dar = useMedya(kopru ? DAR_MASAUSTU : DAR_WEB);
  const [notlarAcik, setNotlarAcik] = useState(false);
  /** Web kipinde çerçevede açık proje adresi; durumu listeden canlı okunur, listeden düşerse son hâli kalır */
  const [cerceve, setCerceve] = useState<ProjeAdresi | null>(null);
  const canliCerceve = useAdresler((d) => (cerceve ? d.liste.find((x) => x.id === cerceve.id) : undefined)) ?? cerceve;

  useEffect(() => {
    if (pid) void duzeltmeleriYukle(pid);
  }, [pid]);
  // Canlı bağlantı yeniden kurulunca notlar sessizce tazelenir (kopukken kaçan olaylar)
  const oncekiBagli = useRef(bagli);
  useEffect(() => {
    if (bagli && !oncekiBagli.current && pid) void duzeltmeleriYukle(pid, true);
    oncekiBagli.current = bagli;
  }, [bagli, pid]);

  useEffect(() => {
    if (!dar) setNotlarAcik(false);
  }, [dar]);
  useEffect(() => setCerceve(null), [pid]);

  /** Link: masaüstünde uygulama içi tarayıcıda, web kipinde çerçevede; dar ekranda notlar çekmecesi kapanır */
  const adresiAc = (a: ProjeAdresi) => {
    setNotlarAcik(false);
    if (!kopru) {
      setCerceve(a);
      return;
    }
    void kopru.git(a.adres).then((tamam) => {
      if (!tamam) hataBildir(new Error(s.tarayici.web.adresHata));
    });
  };

  return (
    <div className="tarayici" data-kip={kopru ? "masaustu" : "web"} data-dar={dar ? "" : undefined}>
      <section className="tarayici-ana" aria-label={s.tarayici.bolumEtiketi}>
        {kopru ? (
          <MasaustuTarayici kopru={kopru} pid={pid} ortuyor={dar && notlarAcik} />
        ) : (
          <WebKipi key={pid ?? ""} pid={pid} cerceve={canliCerceve} cerceveyiKapat={() => setCerceve(null)} />
        )}
      </section>
      <div className="tarayici-yan">
        <ProjeAdresleri pid={pid} secili={cerceve?.id ?? null} ac={adresiAc} />
        <NotlarPaneli pid={pid} kopru={kopru} dar={dar} acik={notlarAcik} setAcik={setNotlarAcik} />
      </div>
    </div>
  );
}
