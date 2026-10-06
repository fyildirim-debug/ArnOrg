// Kullanım ve bütçe (0.0.10): proje açılışındaki alan (seviye, bütçe, otomatik kademe; değer formda tutulur ve
// açılış isteğiyle gider) ve Proje ayarlarındaki satır (seviye ve kademe hemen kaydedilir, bütçe Kaydet ile).
import "../../stiller/butce.css";
import type { ButceDurumu, KullanimSeviyesi, ProjeOzeti } from "@arnorg/ortak";
import { useEffect, useId, useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { projeUygula } from "../../durum/veri";
import { kisaToken } from "../../yardimcilar/bicim";
import { useIslem } from "../../yardimcilar/kancalar";
import { ButceAlanlari } from "./ButceAlanlari";
import { ayniButce, butceGirdisi, girdidenButce, type AcilisKullanimi } from "./butceYardimcilari";
import { SeviyeSecici } from "./SeviyeSecici";

/** Proje açma formlarındaki alan: form-izgara içinde tam satır */
export function AcilisKullanimAlani({ deger, degisti, kilitli = false }: { deger: AcilisKullanimi; degisti: (d: AcilisKullanimi) => void; kilitli?: boolean }) {
  const t = useSozluk().butce;
  const id = useId();
  const { hatali } = girdidenButce(deger.butce);
  return (
    <fieldset className="alan tam kullanim-acilis" disabled={kilitli}>
      <legend className="kullanim-acilis-baslik">{t.acilis.baslik}</legend>
      <p className="alan-ipucu">{t.acilis.aciklama}</p>
      <SeviyeSecici ad={`${id}-seviye`} deger={deger.seviye} degisti={(seviye) => degisti({ ...deger, seviye })} kilitli={kilitli} />
      <ButceAlanlari id={`${id}-butce`} deger={deger.butce} degisti={(butce) => degisti({ ...deger, butce })} hatali={hatali} kilitli={kilitli} />
      <label className="secenek kullanim-kademe">
        <input type="checkbox" checked={deger.otomatikKademe} onChange={(e) => degisti({ ...deger, otomatikKademe: e.target.checked })} />
        <span>
          {t.kademe.etiket}
          <small className="alan-ipucu">{t.kademe.ipucu}</small>
        </span>
      </label>
    </fieldset>
  );
}

/** Kademe düşürmenin nedeni (geçerli dilde) */
export function kademeNedeni(d: ButceDurumu): string {
  const t = sozluk().butce.ayar.nedenler;
  return d.kademe?.neden === "pencere" ? t.pencere(d.kademe.pencere ?? "") : t.butce;
}

/** Proje ayarları satırı */
export function KullanimAyari({ proje, k }: { proje: ProjeOzeti; k: string }) {
  const s = useSozluk();
  const t = s.butce;
  const d = proje.butceDurumu;
  const [girdi, setGirdi] = useState(() => butceGirdisi(proje.butce));
  const { suruyor, calistir } = useIslem();
  // Bütçe başka yerden (üst çubuk, başka sekme) değişince alanlar tazelenir
  useEffect(() => setGirdi(butceGirdisi(proje.butce)), [proje.butce.toplam, proje.butce.gunluk]);
  const { butce, hatali } = girdidenButce(girdi);
  const butceDegisti = Boolean(butce && !ayniButce(butce, proje.butce));

  const seviyeSec = (x: KullanimSeviyesi) =>
    void calistir(x, async () => {
      if (x === proje.seviye) return;
      projeUygula(await api.projeGuncelle(proje.id, { seviye: x }));
      const m = sozluk().butce.seviye;
      bildir("basari", m.degisti(m.adlar[x]));
    });
  const kademe = (acik: boolean) =>
    void calistir("kademe", async () => {
      projeUygula(await api.projeGuncelle(proje.id, { otomatikKademe: acik }));
      const m = sozluk().butce.kademe;
      bildir("bilgi", acik ? m.acildi : m.kapandi);
    });
  const kaydet = () => {
    if (!butce) return;
    void calistir("butce", async () => {
      projeUygula(await api.projeGuncelle(proje.id, { butce }));
      bildir("basari", sozluk().butce.butce.kaydedildi);
    });
  };

  return (
    <section className="proje-ayar-satir" aria-labelledby={`${k}-kullanim`}>
      <h3 id={`${k}-kullanim`}>{t.ayar.baslik}</h3>
      <div className="proje-ayar-icerik kullanim-ayar">
        <SeviyeSecici
          ad={`${k}-seviye`}
          deger={proje.seviye}
          degisti={seviyeSec}
          kilitli={suruyor !== null}
          suruyor={suruyor && suruyor !== "kademe" && suruyor !== "butce" ? (suruyor as KullanimSeviyesi) : null}
          etiketId={`${k}-kullanim`}
        />
        {d && d.etkinSeviye !== proje.seviye ? (
          <p className="uyari-kutu" role="status">
            {t.ayar.kademede(t.seviye.adlar[d.etkinSeviye], t.seviye.adlar[proje.seviye], kademeNedeni(d))}
          </p>
        ) : null}
        <p className="alan-ipucu">{t.ayar.elleNotu}</p>
        <label className="secenek proje-ayar-anahtar">
          <button
            type="button"
            role="switch"
            className="anahtar-dugme"
            aria-checked={proje.otomatikKademe}
            onClick={() => kademe(!proje.otomatikKademe)}
            disabled={suruyor === "kademe"}
          />
          {t.kademe.etiket}
        </label>
        <p className="alan-ipucu">{t.kademe.ipucu}</p>
        <ButceAlanlari id={`${k}-butce`} deger={girdi} degisti={setGirdi} hatali={hatali} kilitli={suruyor === "butce"} />
        <div className="kullanim-ayar-alt">
          <span className="alan-ipucu">{t.butce.harcanan(kisaToken(proje.toplamToken), kisaToken(proje.bugunToken))}</span>
          <button type="button" className="dugme" onClick={kaydet} disabled={!butceDegisti || suruyor !== null}>
            {suruyor === "butce" ? <span className="doner" aria-hidden="true" /> : null}
            {t.butce.kaydet}
          </button>
        </div>
      </div>
    </section>
  );
}
