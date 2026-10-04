// Politika kuralları: aç/kapa, karar, desenler, hedef; tüm liste PUT ile kaydedilir
import type { KuralHedefi, PolitikaKurali } from "@arnorg/ortak";
import { useEffect, useState } from "react";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { useVeri } from "../../durum/veri";
import { desenHatasi } from "../../yardimcilar/arac";
import { useIslem } from "../../yardimcilar/kancalar";
import { Bos, HataKutu, Iskelet } from "../Durumlar";
import { Simge } from "../Simge";

/** Hedef sırası; adları sözlükte (s.denetim.kural.hedefler) */
const HEDEFLER: KuralHedefi[] = ["komut", "yol", "url", "arac"];
const KARARLAR: PolitikaKurali["karar"][] = ["izin", "ret", "sor"];

function yeniKural(): PolitikaKurali {
  return {
    id: `kural-${Date.now().toString(36)}`,
    ad: sozluk().denetim.kural.yeniKural,
    aciklama: "",
    karar: "sor",
    hedef: "komut",
    desenler: [],
    araclar: [],
    etkin: true,
  };
}

export function PolitikaDuzenleyici() {
  const s = useSozluk();
  const t = s.denetim.kural;
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [kayitli, setKayitli] = useState<PolitikaKurali[] | null>(null);
  const [taslak, setTaslak] = useState<PolitikaKurali[]>([]);
  const [acikId, setAcikId] = useState<string | null>(null);
  const [yuklemeHata, setYuklemeHata] = useState<string | null>(null);
  const { suruyor, hata, calistir } = useIslem();

  const yukle = () => {
    if (!aktifProjeId) return;
    setYuklemeHata(null);
    api
      .politika(aktifProjeId)
      .then((k) => {
        setKayitli(k);
        setTaslak(k);
      })
      .catch((e: unknown) => setYuklemeHata(e instanceof Error ? e.message : sozluk().denetim.kural.alinamadi));
  };
  useEffect(yukle, [aktifProjeId]);

  const kirli = kayitli !== null && JSON.stringify(kayitli) !== JSON.stringify(taslak);
  const desenHatalari = taslak.flatMap((k) => k.desenler.map((d) => ({ id: k.id, d, h: desenHatasi(d) }))).filter((x) => x.h);
  const guncelle = (id: string, d: Partial<PolitikaKurali>) => setTaslak((t) => t.map((k) => (k.id === id ? { ...k, ...d } : k)));
  const tasi = (id: string, yon: -1 | 1) =>
    setTaslak((t) => {
      const i = t.findIndex((k) => k.id === id);
      const j = i + yon;
      if (i < 0 || j < 0 || j >= t.length) return t;
      const kopya = t.slice();
      [kopya[i], kopya[j]] = [kopya[j]!, kopya[i]!];
      return kopya;
    });

  const kaydet = () => {
    if (!aktifProjeId || desenHatalari.length) return;
    void calistir(
      "kaydet",
      async () => {
        const k = await api.politikaKaydet(aktifProjeId, taslak);
        setKayitli(k);
        setTaslak(k);
        bildir("basari", sozluk().denetim.kural.kaydedildi);
      },
      true,
    );
  };

  if (yuklemeHata) return <HataKutu metin={yuklemeHata} yeniden={yukle} />;
  if (!kayitli) return <Iskelet satir={5} />;

  return (
    <div className="politika">
      {taslak.length === 0 ? (
        <Bos kucuk baslik={t.yokBaslik}>
          {t.yokMetin}
        </Bos>
      ) : (
        <ol className="kurallar">
          {taslak.map((k, i) => {
            const acik = acikId === k.id;
            return (
              <li key={k.id} className={`kural${k.etkin ? "" : " kural-kapali"}`}>
                <div className="kural-ust">
                  <button
                    type="button"
                    role="switch"
                    className="anahtar-dugme"
                    aria-checked={k.etkin}
                    aria-label={t.anahtar(k.ad, k.etkin)}
                    onClick={() => guncelle(k.id, { etkin: !k.etkin })}
                  />
                  <button type="button" className="kural-ad" onClick={() => setAcikId(acik ? null : k.id)} aria-expanded={acik}>
                    <b>{k.ad}</b>
                    <small className="tek-satir">
                      {t.hedefler[k.hedef]}
                      {k.desenler.length ? ` · ${k.desenler.join(", ")}` : t.desenYok}
                    </small>
                  </button>
                  <label className="gizli" htmlFor={`karar-${k.id}`}>
                    {t.karari(k.ad)}
                  </label>
                  <select
                    id={`karar-${k.id}`}
                    className={`secim kural-karar hukum-${k.karar}`}
                    value={k.karar}
                    onChange={(e) => guncelle(k.id, { karar: e.target.value as PolitikaKurali["karar"] })}
                  >
                    {KARARLAR.map((x) => (
                      <option key={x} value={x}>
                        {s.genel.karar[x]}
                      </option>
                    ))}
                  </select>
                </div>
                {acik ? (
                  <div className="kural-duzen form-izgara">
                    <div className="alan">
                      <label htmlFor={`kad-${k.id}`}>{t.ad}</label>
                      <input id={`kad-${k.id}`} className="girdi" value={k.ad} onChange={(e) => guncelle(k.id, { ad: e.target.value })} />
                    </div>
                    <div className="alan">
                      <label htmlFor={`khedef-${k.id}`}>{t.hedef}</label>
                      <select
                        id={`khedef-${k.id}`}
                        className="secim"
                        value={k.hedef}
                        onChange={(e) => guncelle(k.id, { hedef: e.target.value as KuralHedefi })}
                      >
                        {HEDEFLER.map((h) => (
                          <option key={h} value={h}>
                            {t.hedefler[h]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="alan tam">
                      <label htmlFor={`kacik-${k.id}`}>{t.aciklama}</label>
                      <input id={`kacik-${k.id}`} className="girdi" value={k.aciklama} onChange={(e) => guncelle(k.id, { aciklama: e.target.value })} />
                    </div>
                    <div className="alan tam">
                      <label htmlFor={`kdesen-${k.id}`}>{t.desenler}</label>
                      <textarea
                        id={`kdesen-${k.id}`}
                        className="metin-alani kod-alani"
                        rows={Math.max(2, k.desenler.length + 1)}
                        value={k.desenler.join("\n")}
                        spellCheck={false}
                        onChange={(e) => guncelle(k.id, { desenler: e.target.value.split("\n").filter((x, j, a) => x.trim() || j < a.length - 1) })}
                        aria-invalid={desenHatalari.some((x) => x.id === k.id) ? true : undefined}
                      />
                      {desenHatalari
                        .filter((x) => x.id === k.id)
                        .map((x) => (
                          <span key={x.d} className="alan-hata">
                            {x.d}: {x.h}
                          </span>
                        ))}
                    </div>
                    <div className="alan tam">
                      <label htmlFor={`karac-${k.id}`}>{t.araclar}</label>
                      <input
                        id={`karac-${k.id}`}
                        className="girdi"
                        value={k.araclar.join(", ")}
                        placeholder="Bash, Write"
                        spellCheck={false}
                        onChange={(e) =>
                          guncelle(k.id, {
                            araclar: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                    <div className="tam dugme-satir">
                      <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={() => tasi(k.id, -1)} disabled={i === 0}>
                        {t.yukari}
                      </button>
                      <button type="button" className="dugme dugme-kucuk dugme-sessiz" onClick={() => tasi(k.id, 1)} disabled={i === taslak.length - 1}>
                        {t.asagi}
                      </button>
                      <button
                        type="button"
                        className="dugme dugme-kucuk dugme-tehlike itele"
                        onClick={() => {
                          setTaslak((t) => t.filter((x) => x.id !== k.id));
                          setAcikId(null);
                        }}
                      >
                        <Simge ad="cop" boyut={12} />
                        {t.sil}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <div className="politika-alt">
        <button
          type="button"
          className="dugme dugme-kucuk"
          onClick={() => {
            const k = yeniKural();
            setTaslak((t) => [...t, k]);
            setAcikId(k.id);
          }}
        >
          <Simge ad="arti" boyut={12} />
          {t.ekle}
        </button>
        {kirli ? (
          <div className="politika-kaydet" role="status">
            <span className="alan-ipucu">{t.kaydedilmemis}</span>
            <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={kaydet} disabled={suruyor !== null || desenHatalari.length > 0}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : null}
              {t.kaydet}
            </button>
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setTaslak(kayitli)}>
              {s.genel.vazgec}
            </button>
          </div>
        ) : null}
      </div>
      {hata ? <HataKutu baslik={t.kaydedilemedi} metin={hata} /> : null}
      <p className="alan-ipucu">{t.ipucu}</p>
    </div>
  );
}
