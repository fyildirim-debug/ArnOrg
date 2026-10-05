// Karar yetkisi (0.0.7): tam otonomda kararları CEO verir, kurul sonuçları görür; kurul kipinde onaylar kurula gelir.
// Proje ayarlarındaki seçim, Onaylar ekranının başındaki şerit, sonuçlanan onayda kararı verenin etiketi ve CEO'yu
// bekleyen onayın durum satırı burada. Kip değişince çekirdek bekleyen onayları yeni muhataba yöneltir ve ekibe duyurur.
import type { KararVeren, Onay, ProjeOzeti } from "@arnorg/ortak";
import { api } from "../api/uclar";
import { sozluk, useSozluk } from "../dil";
import { bildir } from "../durum/arayuz";
import { projeUygula, useVeri } from "../durum/veri";
import { useIslem } from "../yardimcilar/kancalar";
import { kararKipi, kararVereni } from "./kararVeren";
import "../stiller/karar.css";

const KIPLER: KararVeren[] = ["ceo", "kurul"];

/** Etkin projede karar yetkisi CEO'da mı (tam otonom); kipe göre değişen metinler için */
export function useTamOtonom(): boolean {
  return useVeri((d) => kararKipi(d.projeler.find((p) => p.id === d.aktifProjeId)) === "ceo");
}

/** Projenin CEO'sunun adı; proje etkin değilse (ekip yüklü değil) null */
function useCeoAdi(projeId: string | undefined): string | null {
  return useVeri((d) => (projeId && d.aktifProjeId === projeId ? (d.ajanlar.find((a) => a.rol === "ceo")?.ad ?? null) : null));
}

/** Karar yetkisini değiştirir; çekirdek bekleyen onayları yeni muhataba yöneltir */
function useKipDegistir(proje: ProjeOzeti | undefined) {
  const ceoAdi = useCeoAdi(proje?.id);
  const { suruyor, calistir } = useIslem();
  const degistir = (kip: KararVeren) =>
    calistir(kip, async () => {
      if (!proje || kararKipi(proje) === kip) return;
      const p = await api.projeGuncelle(proje.id, { kararVeren: kip });
      projeUygula(p);
      const t = sozluk().karar;
      bildir("basari", kip === "ceo" ? t.ceoyaGecti(ceoAdi) : t.kurulaGecti);
    });
  return { degistir, suruyor };
}

/** Proje ayarları satırı: iki seçenek, altında kipin ne demek olduğu */
export function KararYetkisiAyari({ proje, k }: { proje: ProjeOzeti; k: string }) {
  const t = useSozluk().karar.ayar;
  const kip = kararKipi(proje);
  const { degistir, suruyor } = useKipDegistir(proje);
  // Ekip yüklüyse (etkin proje) CEO'nun olup olmadığı bilinir; değilse uyarı gösterilmez
  const ceoYok = useVeri((d) => d.aktifProjeId === proje.id && d.ajanlar.length > 0 && !d.ajanlar.some((a) => a.rol === "ceo"));
  return (
    <section className="proje-ayar-satir" aria-labelledby={`${k}-karar`}>
      <h3 id={`${k}-karar`}>{t.baslik}</h3>
      <div className="proje-ayar-icerik">
        <div className="karar-secim" role="radiogroup" aria-labelledby={`${k}-karar`}>
          {KIPLER.map((x) => (
            <label key={x} className={`karar-secenek${kip === x ? " karar-secenek-secili" : ""}`}>
              <input type="radio" name={`${k}-karar`} value={x} checked={kip === x} onChange={() => void degistir(x)} disabled={suruyor !== null} />
              <span className="karar-secenek-metin">
                <b>
                  {x === "ceo" ? t.ceo : t.kurul}
                  {suruyor === x ? <span className="doner" aria-hidden="true" /> : null}
                </b>
                <small>{x === "ceo" ? t.ceoAciklama : t.kurulAciklama}</small>
              </span>
            </label>
          ))}
        </div>
        {kip === "ceo" ? (
          <p className="alan-ipucu karar-ipucu">
            {t.ipucu} {t.otoNotu}
          </p>
        ) : null}
        {kip === "ceo" && ceoYok ? <p className="uyari-kutu">{t.ceoYok}</p> : null}
      </div>
    </section>
  );
}

/** Onaylar ekranının başındaki şerit: kimin karar verdiği ve kipi değiştiren düğme */
export function KararYetkisiSeridi() {
  const t = useSozluk().karar.serit;
  const proje = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId));
  const ceoAdi = useCeoAdi(proje?.id);
  const { degistir, suruyor } = useKipDegistir(proje);
  if (!proje) return null;
  const otonom = kararKipi(proje) === "ceo";
  return (
    <section className={`karar-serit${otonom ? " karar-serit-otonom" : ""}`} aria-label={t.etiket}>
      <div className="karar-serit-metin">
        <p className="karar-serit-baslik">
          <span className={`durum ${otonom ? "durum-calisiyor" : "durum-kapali"}`}>
            <i aria-hidden="true" />
            {otonom ? t.otonom : t.kurul}
          </span>
          <b>{otonom ? t.otonomBaslik(ceoAdi) : t.kurulBaslik}</b>
        </p>
        <p className="karar-serit-alt">{otonom ? t.otonomMetin : t.kurulMetin}</p>
      </div>
      <button type="button" className="dugme dugme-kucuk karar-serit-dugme" onClick={() => void degistir(otonom ? "kurul" : "ceo")} disabled={suruyor !== null}>
        {suruyor ? <span className="doner" aria-hidden="true" /> : null}
        {otonom ? t.kurulaAl : t.ceoyaBirak}
      </button>
    </section>
  );
}

/** Sonuçlanan onayda kararı veren: "CEO · Ada", "Kurul", "Otomatik", "Süre doldu" */
export function KararVerenEtiketi({ onay, className = "" }: { onay: Onay; className?: string }) {
  const t = useSozluk().karar.veren;
  const veren = kararVereni(onay);
  if (!veren) return null;
  const metin = veren === "ceo" ? t.ceo(onay.kararVerenAd) : veren === "kurul" ? t.kurul : veren === "otomatik" ? t.otomatik : t.zamanAsimi;
  return (
    <span className={`karar-veren karar-veren-${veren}${className ? ` ${className}` : ""}`} title={`${t.etiket}: ${metin}`}>
      <span className="gizli">{t.etiket}: </span>
      {metin}
    </span>
  );
}

/** Bekleyen onay CEO'nun kararında: durum ve (ipucu) kurulun yine de karar verebileceği; satır içi kullanılır */
export function CeoKararVeriyor({ ipucu = true }: { ipucu?: boolean }) {
  const t = useSozluk().karar;
  const ceoAdi = useVeri((d) => d.ajanlar.find((a) => a.rol === "ceo")?.ad ?? null);
  return (
    <span className="karar-ceo-bekliyor">
      <span className="durum durum-calisiyor">
        <i aria-hidden="true" />
        {t.bekliyor(ceoAdi)}
      </span>
      {ipucu ? <span className="karar-ceo-ipucu">{t.bekliyorIpucu}</span> : null}
    </span>
  );
}
