// Proje adresleri: projenin çalışan sunucuları (çalışanların adres_bildir ile bildirdiği ve kabuk çıktılarında
// yakalanan adresler). Kart tıklanınca adres uygulama içi tarayıcıda (masaüstü) ya da web kipinin çerçevesinde açılır.
// Adres yokken bölüm hiç görünmez. Geniş ekranda sağ sütunun üst yarısıdır, notlar altta; dar ekranda notlar
// çekmecesinin üstünde yatay kayan şerittir.
import "../../stiller/adresler.css";
import type { ProjeAdresi } from "@arnorg/ortak";
import { useEffect, useId, useRef } from "react";
import { useSozluk } from "../../dil";
import { adresleriYukle, useAdresler } from "../../durum/adresler";
import { useVeri } from "../../durum/veri";
import { goreli } from "../../yardimcilar/bicim";
import { useSimdi } from "../../yardimcilar/kancalar";
import { kisaAdres } from "../../yardimcilar/tarayiciAdresi";
import { Simge } from "../Simge";

export function ProjeAdresleri({ pid, secili, ac }: { pid: string | null; secili: string | null; ac: (a: ProjeAdresi) => void }) {
  const t = useSozluk().arayuz.adresler;
  const baslikId = useId();
  const liste = useAdresler((d) => (d.projeId === pid ? d.liste : null));
  const bagli = useVeri((d) => d.wsDurumu === "bagli");
  // Göreli zamanlar ("3 dk önce") yarım dakikada bir tazelenir
  const simdi = useSimdi(30_000);

  useEffect(() => {
    if (pid) void adresleriYukle(pid);
  }, [pid]);
  // Bağlantı yeniden kurulunca kopukken kaçan değişiklikler için liste yeniden istenir
  const oncekiBagli = useRef(bagli);
  useEffect(() => {
    if (bagli && !oncekiBagli.current && pid) void adresleriYukle(pid);
    oncekiBagli.current = bagli;
  }, [bagli, pid]);

  if (!liste?.length) return null;
  const acik = liste.filter((a) => a.durum === "acik").length;

  return (
    <section className="adresler" aria-labelledby={baslikId}>
      <div className="adresler-ust">
        <h2 id={baslikId}>{t.baslik}</h2>
        <span className="adresler-sayac sayi" aria-live="polite">
          {t.sayac(acik, liste.length)}
        </span>
      </div>
      <ul className="adres-liste">
        {liste.map((a) => (
          <li key={a.id}>
            <AdresKarti adres={a} secili={a.id === secili} ac={ac} simdi={simdi} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdresKarti({ adres: a, secili, ac, simdi }: { adres: ProjeAdresi; secili: boolean; ac: (a: ProjeAdresi) => void; simdi: number }) {
  const t = useSozluk().arayuz.adresler;
  const durum = a.durum === "bilinmiyor" && !a.yoklanir ? t.yoklanmaz : t.durum[a.durum];
  return (
    <button
      type="button"
      className="adres-kart"
      data-durum={a.durum}
      aria-current={secili ? "true" : undefined}
      aria-label={t.ac(a.ad, durum, a.adres)}
      title={t.acBaslik(a.adres)}
      onClick={() => ac(a)}
    >
      <span className="adres-nokta" aria-hidden="true" />
      <span className="adres-ad tek-satir">{a.ad}</span>
      <span className="adres-git" aria-hidden="true">
        <Simge ad="gonder" boyut={12} />
      </span>
      <span className="adres-url tek-satir">{kisaAdres(a.adres)}</span>
      <span className="adres-alt tek-satir">
        {a.durum !== "acik" ? <span className="adres-durum">{durum}</span> : null}
        <span>{a.bildirenAd}</span>
        <span>{goreli(a.guncelleme, simdi)}</span>
        {a.kaynak === "cikti" ? <span>{t.cikti}</span> : null}
      </span>
    </button>
  );
}
