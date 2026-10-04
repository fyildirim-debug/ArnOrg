// Hafıza: projenin kalıcı hafızası, ajan defterleri ve ajanlar arası soru-yanıtlar.
// Kayıtlar yalnız bu projeye aittir; ajanlar her oturumda okur, çalışırken doğru anda hatırlar.
import type { Ajan, AjanSorusu, HafizaBenzerCifti, HafizaKaydi, HafizaTuru } from "@arnorg/ortak";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { AjanAvatar, Avatar } from "../bilesenler/Kisi";
import { Markdown } from "../bilesenler/Markdown";
import { OnaySor } from "../bilesenler/OnaySor";
import { Simge } from "../bilesenler/Simge";
import { ZenginBlok } from "../bilesenler/ZenginMetin";
import { sozluk, useSozluk, type Sozluk } from "../dil";
import { en } from "../dil/en";
import { tr } from "../dil/tr";
import { bildir, git } from "../durum/arayuz";
import { hafizaKaydiKaldir, hafizaKaydiUygula, hafizayiYukle, useHafiza } from "../durum/hafiza";
import { useVeri } from "../durum/veri";
import { akilliZaman, goreli, yuzde } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

/** Ekranda gösterim sırası: kurulun sözü önce gelir */
const TURLER: HafizaTuru[] = ["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"];

/** Kurulun yazdığı kayıtta kaynak adı (sunucu hangi dilde yazdıysa); arayüzde s.genel.kurul gösterilir */
const KURUL_ADLARI = new Set([tr.genel.kurul, en.genel.kurul]);

function kurulKaydi(k: HafizaKaydi): boolean {
  return !k.kaynakAjanId && KURUL_ADLARI.has(k.kaynakAd);
}

function kaynakAdi(k: HafizaKaydi, s: Sozluk): string {
  return kurulKaydi(k) ? s.genel.kurul : k.kaynakAd;
}

type Sekme = "kayitlar" | "defterler" | "sorular";

export function Hafiza() {
  const s = useSozluk();
  const t = s.hafiza;
  const pid = useVeri((d) => d.aktifProjeId);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const sorular = useHafiza((d) => d.sorular);
  const yukleme = useHafiza((d) => d.yukleme);
  const hata = useHafiza((d) => d.hata);
  const [sekme, setSekme] = useState<Sekme>("kayitlar");
  const [yeniAcik, setYeniAcik] = useState(false);

  useEffect(() => {
    if (pid) void hafizayiYukle(pid, useHafiza.getState().projeId === pid);
  }, [pid]);

  const gecerli = useMemo(() => kayitlar.filter((k) => !k.yerineGecen), [kayitlar]);
  const turSayilari = useMemo(() => {
    const s: Partial<Record<HafizaTuru, number>> = {};
    for (const k of gecerli) s[k.tur] = (s[k.tur] ?? 0) + 1;
    return s;
  }, [gecerli]);
  const bekleyenSoru = sorular.filter((s) => s.durum === "bekliyor").length;
  const yanitlanan = sorular.filter((s) => s.durum === "yanitlandi").length;

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{t.baslik}</h1>
          <p>
            {t.altBaslikOnce} <code>.arnorg/hafiza/</code> {t.altBaslikSonra}
          </p>
        </div>
        <div className="baslik-eylem">
          <button
            type="button"
            className="dugme dugme-ana"
            onClick={() => {
              setSekme("kayitlar");
              setYeniAcik(true);
            }}
          >
            <Simge ad="arti" />
            {t.kayitEkle}
          </button>
        </div>
      </div>

      <dl className="hafiza-ozet" aria-label={t.ozetEtiketi}>
        {TURLER.map((tur) => (
          <div key={tur} data-tur={tur} title={t.turAciklamalari[tur]}>
            <dt>{s.genel.hafizaTuru[tur]}</dt>
            <dd className="sayi">{turSayilari[tur] ?? 0}</dd>
          </div>
        ))}
        <div className="hafiza-ozet-soru" title={t.soruIpucu}>
          <dt>{t.soruYanit}</dt>
          <dd className="sayi">
            {yanitlanan}
            {bekleyenSoru ? <small>{t.yanitBekliyor(bekleyenSoru)}</small> : null}
          </dd>
        </div>
      </dl>

      <div className="bolumlu hafiza-sekmeler" role="group" aria-label={t.bolum}>
        <button type="button" aria-pressed={sekme === "kayitlar"} onClick={() => setSekme("kayitlar")}>
          {t.sekmeKayitlar} <span className="soluk sayi">{gecerli.length}</span>
        </button>
        <button type="button" aria-pressed={sekme === "defterler"} onClick={() => setSekme("defterler")}>
          {t.sekmeDefterler}
        </button>
        <button type="button" aria-pressed={sekme === "sorular"} onClick={() => setSekme("sorular")}>
          {t.sekmeSorular} <span className="soluk sayi">{sorular.length}</span>
          {bekleyenSoru ? <span className="rozet hafiza-rozet">{bekleyenSoru}</span> : null}
        </button>
      </div>

      {hata ? <HataKutu metin={hata} yeniden={() => pid && void hafizayiYukle(pid)} /> : null}
      {yukleme === "yukleniyor" && !kayitlar.length && !hata ? <Iskelet satir={6} etiket={t.yukleniyor} /> : null}

      {yukleme === "hazir" || kayitlar.length ? (
        sekme === "kayitlar" ? (
          <Kayitlar yeniAcik={yeniAcik} setYeniAcik={setYeniAcik} />
        ) : sekme === "defterler" ? (
          <Defterler />
        ) : (
          <Sorular />
        )
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kayıtlar
// ---------------------------------------------------------------------------

function Kayitlar({ yeniAcik, setYeniAcik }: { yeniAcik: boolean; setYeniAcik: (a: boolean) => void }) {
  const s = useSozluk();
  const t = s.hafiza.kayitlar;
  const pid = useVeri((d) => d.aktifProjeId);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const [tur, setTur] = useState<HafizaTuru | "tumu">("tumu");
  const [arama, setArama] = useState("");
  const [eskiler, setEskiler] = useState(false);
  const [bulunan, setBulunan] = useState<string[] | null>(null);
  const [araniyor, setAraniyor] = useState(false);

  // Arama sunucudaki tam metin dizininde yapılır (Türkçe harfsiz, önekli, önem ve tazelik puanlı)
  useEffect(() => {
    const q = arama.trim();
    if (!pid || q.length < 2) {
      setBulunan(null);
      setAraniyor(false);
      return;
    }
    const iptal = new AbortController();
    setAraniyor(true);
    const z = setTimeout(() => {
      api
        .hafiza(pid, { q }, iptal.signal)
        .then((s) => setBulunan(s.map((k) => k.id)))
        .catch(() => undefined)
        .finally(() => !iptal.signal.aborted && setAraniyor(false));
    }, 220);
    return () => {
      clearTimeout(z);
      iptal.abort();
    };
  }, [arama, pid]);

  const gorunen = useMemo(() => {
    const kaynak = bulunan ? bulunan.map((id) => kayitlar.find((k) => k.id === id)).filter((k): k is HafizaKaydi => !!k) : kayitlar;
    return kaynak.filter((k) => (tur === "tumu" || k.tur === tur) && (eskiler || !k.yerineGecen));
  }, [kayitlar, bulunan, tur, eskiler]);
  const eskiSayisi = kayitlar.filter((k) => k.yerineGecen).length;

  return (
    <section aria-label={t.etiket}>
      {yeniAcik ? <KayitFormu kapat={() => setYeniAcik(false)} /> : null}
      <Tekrarlar />

      <div className="suzgec">
        <div className="arama-kutu">
          <Simge ad="ara" boyut={13} />
          <input
            className="girdi"
            type="search"
            aria-label={t.araEtiket}
            placeholder={t.araYer}
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </div>
        <div className="bolumlu" role="group" aria-label={t.tureGore}>
          <button type="button" aria-pressed={tur === "tumu"} onClick={() => setTur("tumu")}>
            {s.genel.tumu}
          </button>
          {TURLER.map((x) => (
            <button key={x} type="button" aria-pressed={tur === x} onClick={() => setTur(x)} title={s.hafiza.turAciklamalari[x]}>
              {s.genel.hafizaTuru[x]}
            </button>
          ))}
        </div>
        {eskiSayisi ? (
          <label className="secenek">
            <input type="checkbox" checked={eskiler} onChange={(e) => setEskiler(e.target.checked)} />
            {t.eskiyenler} <small>{eskiSayisi}</small>
          </label>
        ) : null}
        {bulunan ? (
          <span className="alan-ipucu" role="status">
            {araniyor ? t.araniyor : t.sonuc(gorunen.length)}
          </span>
        ) : null}
      </div>

      {gorunen.length ? (
        <ol className="hafiza-liste">
          {gorunen.map((k) => (
            <KayitSatiri key={k.id} kayit={k} />
          ))}
        </ol>
      ) : kayitlar.length ? (
        <Bos kucuk baslik={t.eslesenYok}>
          {t.eslesenYokMetin}
        </Bos>
      ) : (
        <Bos
          baslik={t.bosBaslik}
          eylem={
            <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={() => setYeniAcik(true)}>
              {t.ilkTercih}
            </button>
          }
        >
          {t.bosMetin}
        </Bos>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bakım: birbirini tekrar eden kayıtlar
// ---------------------------------------------------------------------------

function Tekrarlar() {
  const s = useSozluk();
  const t = s.hafiza.tekrar;
  const pid = useVeri((d) => d.aktifProjeId);
  const ajanlar = useVeri((d) => d.ajanlar);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const [ciftler, setCiftler] = useState<HafizaBenzerCifti[]>([]);
  const [acik, setAcik] = useState(false);
  const { suruyor, calistir } = useIslem();

  // Kayıtlar değiştikçe (canlı olaylar dahil) sessizce yeniden hesaplanır
  const imza = useMemo(() => kayitlar.map((k) => `${k.id}:${k.guncelleme}:${k.yerineGecen ?? ""}`).join(","), [kayitlar]);
  useEffect(() => {
    if (!pid) return;
    const z = setTimeout(() => {
      api
        .hafizaBenzerler(pid)
        .then(setCiftler)
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(z);
  }, [pid, imza]);

  if (!ciftler.length) return null;
  const ceo = ajanlar.find((a) => a.rol === "ceo");
  const anahtar = (c: HafizaBenzerCifti) => `${c.a.id}|${c.b.id}`;
  const cikar = (c: HafizaBenzerCifti) => setCiftler((l) => l.filter((x) => anahtar(x) !== anahtar(c)));

  const tut = (c: HafizaBenzerCifti, tutulan: HafizaKaydi, eskiyen: HafizaKaydi) =>
    void calistir(anahtar(c), async () => {
      const k = await api.hafizaBirlestir(tutulan.id, eskiyen.id);
      hafizaKaydiUygula(k);
      hafizaKaydiUygula({ ...eskiyen, yerineGecen: tutulan.id });
      cikar(c);
      bildir("basari", sozluk().hafiza.tekrar.tutuldu(tutulan.baslik));
    });

  const ceoyaVer = () =>
    ceo &&
    void calistir("ceo", async () => {
      const liste = ciftler
        .slice(0, 10)
        .map((c) => `- ${c.a.id.slice(0, 8)} "${c.a.baslik}" ↔ ${c.b.id.slice(0, 8)} "${c.b.baslik}"`)
        .join("\n");
      await api.ajanaMesaj(ceo.id, { metin: sozluk().hafiza.tekrar.ceoMesaji(liste) });
      bildir("basari", sozluk().hafiza.tekrar.ceoDuzenleyecek(ceo.ad));
      setAcik(false);
    });

  return (
    <div className="tekrar" data-acik={acik || undefined}>
      <div className="tekrar-ust">
        <span className="tekrar-isaret" aria-hidden="true" />
        <p>
          <b>{t.ciftSayisi(ciftler.length)}</b> {t.aciklama}
        </p>
        <div className="dugme-satir">
          {ceo ? (
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={ceoyaVer} disabled={suruyor !== null}>
              {t.ceoDuzenlesin(ceo.ad)}
            </button>
          ) : null}
          <button type="button" className="dugme dugme-kucuk" aria-expanded={acik} onClick={() => setAcik(!acik)}>
            {acik ? s.genel.kapat : t.gozdenGecir}
          </button>
        </div>
      </div>
      {acik ? (
        <ul className="tekrar-liste">
          {ciftler.map((c) => (
            <li key={anahtar(c)} className="tekrar-cift">
              <span className="tekrar-oran" title={t.benzerlik}>
                {yuzde(c.benzerlik * 100)}
              </span>
              {[c.a, c.b].map((k, i) => {
                const oteki = i === 0 ? c.b : c.a;
                return (
                  <div key={k.id} className="tekrar-kayit">
                    <span className="hk-tur">
                      {s.genel.hafizaTuru[k.tur]} · {kaynakAdi(k, s)} · {goreli(k.guncelleme)}
                    </span>
                    <b>{k.baslik}</b>
                    <div className="tekrar-metin">
                      <ZenginBlok metin={k.metin} />
                    </div>
                    <button type="button" className="dugme dugme-kucuk" disabled={suruyor !== null} onClick={() => tut(c, k, oteki)}>
                      {t.bunuTut}
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="metin-dugme tekrar-ayri"
                disabled={suruyor !== null}
                onClick={() =>
                  pid &&
                  void calistir(anahtar(c), async () => {
                    await api.hafizaAyriTut(pid, c.a.id, c.b.id);
                    cikar(c);
                  })
                }
              >
                {t.ikisiDe}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OnemGostergesi({ onem }: { onem: number }) {
  const t = useSozluk().hafiza.kayit;
  return (
    <span className="onem" role="img" aria-label={t.onem(onem)} title={`${t.onem(onem)}${onem >= 5 ? t.herOturumda : ""}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} data-dolu={i <= onem || undefined} />
      ))}
    </span>
  );
}

function KayitSatiri({ kayit }: { kayit: HafizaKaydi }) {
  const s = useSozluk();
  const t = s.hafiza.kayit;
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const kayitlar = useHafiza((d) => d.kayitlar);
  const [duzenle, setDuzenle] = useState(false);
  const [silSor, setSilSor] = useState(false);
  const { suruyor, calistir } = useIslem();
  const ajan = kayit.kaynakAjanId ? ajanlar.find((a) => a.id === kayit.kaynakAjanId) : undefined;
  const gorev = kayit.gorevId ? gorevler.find((g) => g.id === kayit.gorevId) : undefined;
  const yenisi = kayit.yerineGecen ? kayitlar.find((k) => k.id === kayit.yerineGecen) : undefined;

  if (duzenle) {
    return (
      <li className="hafiza-kayit" data-tur={kayit.tur}>
        <KayitFormu kayit={kayit} kapat={() => setDuzenle(false)} />
      </li>
    );
  }

  return (
    <li className={`hafiza-kayit${kayit.yerineGecen ? " hafiza-eski" : ""}`} data-tur={kayit.tur} id={`hafiza-${kayit.id}`}>
      <div className="hk-yan">
        <span className="hk-tur">{s.genel.hafizaTuru[kayit.tur]}</span>
        <OnemGostergesi onem={kayit.onem} />
      </div>
      <div className="hk-govde">
        <h3 className="hk-baslik">
          {kayit.baslik}
          {kayit.yerineGecen ? <span className="etiket">{t.eskidi}</span> : null}
        </h3>
        <div className="hk-metin">
          <ZenginBlok metin={kayit.metin} />
        </div>
        {yenisi ? (
          <p className="hk-yerine">
            {t.yerineGecen}{" "}
            <button
              type="button"
              className="metin-dugme"
              onClick={() => document.getElementById(`hafiza-${yenisi.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              {yenisi.baslik}
            </button>
          </p>
        ) : null}
        <div className="hk-alt">
          <span className="hk-kaynak">
            {ajan ? <AjanAvatar ajan={ajan} boyut="xs" /> : <Avatar ad={kayit.kaynakAd} siz={kurulKaydi(kayit)} boyut="xs" />}
            {kaynakAdi(kayit, s)}
          </span>
          <time dateTime={kayit.guncelleme} title={t.zamanIpucu(akilliZaman(kayit.olusturma), akilliZaman(kayit.guncelleme))}>
            {goreli(kayit.guncelleme)}
          </time>
          {gorev ? (
            <button type="button" className="gorev-kodu" onClick={() => git("pano", { gorevId: gorev.id })} title={gorev.baslik}>
              {gorev.kod}
            </button>
          ) : null}
          {kayit.etiketler.map((e) => (
            <span key={e} className="hk-etiket">
              #{e}
            </span>
          ))}
        </div>
        {silSor ? (
          <OnaySor
            evetMetni={s.genel.sil}
            suruyor={suruyor !== null}
            evet={() =>
              void calistir("sil", async () => {
                await api.hafizaSil(kayit.id);
                hafizaKaydiKaldir(kayit.projeId, kayit.id);
                setSilSor(false);
                bildir("basari", sozluk().hafiza.kayit.silindi);
              })
            }
            vazgec={() => setSilSor(false)}
          >
            {t.silUyariOnce} <code>.arnorg/hafiza/</code> {t.silUyariSonra}
          </OnaySor>
        ) : null}
      </div>
      <div className="hk-eylem">
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={t.duzenleEtiketi(kayit.baslik)} title={s.genel.duzenle} onClick={() => setDuzenle(true)}>
          <Simge ad="duzenle" boyut={12} />
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" aria-label={t.silEtiketi(kayit.baslik)} title={s.genel.sil} onClick={() => setSilSor(true)}>
          <Simge ad="kapat" boyut={12} />
        </button>
      </div>
    </li>
  );
}

function KayitFormu({ kayit, kapat }: { kayit?: HafizaKaydi; kapat: () => void }) {
  const s = useSozluk();
  const t = s.hafiza.form;
  const pid = useVeri((d) => d.aktifProjeId);
  const [tur, setTur] = useState<HafizaTuru>(kayit?.tur ?? "tercih");
  const [baslik, setBaslik] = useState(kayit?.baslik ?? "");
  const [metin, setMetin] = useState(kayit?.metin ?? "");
  const [etiketler, setEtiketler] = useState(kayit?.etiketler.join(", ") ?? "");
  const [onem, setOnem] = useState(kayit?.onem ?? 5);
  const [onemDegisti, setOnemDegisti] = useState(!!kayit);
  const { suruyor, hata, setHata, calistir } = useIslem();
  const kimlik = kayit?.id ?? "yeni";

  // Yeni kayıtta önem türe göre önerilir: kurul tercihi her oturumda hatırlanır
  const turSec = (t: HafizaTuru) => {
    setTur(t);
    if (!onemDegisti) setOnem(t === "tercih" ? 5 : t === "ozet" ? 2 : 3);
  };

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    if (!pid) return;
    if (!baslik.trim()) return setHata(t.baslikHata);
    if (!metin.trim()) return setHata(t.metinHata);
    const liste = etiketler
      .split(",")
      .map((x) => x.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 12);
    void calistir(
      "kaydet",
      async () => {
        const k = kayit
          ? await api.hafizaGuncelle(kayit.id, { tur, baslik: baslik.trim(), metin: metin.trim(), etiketler: liste, onem })
          : await api.hafizaYaz(pid, { tur, baslik: baslik.trim(), metin: metin.trim(), etiketler: liste, onem });
        hafizaKaydiUygula(k);
        bildir("basari", kayit ? sozluk().hafiza.form.guncellendi : sozluk().hafiza.form.yazildi);
        kapat();
      },
      true,
    );
  };

  return (
    <form className="hafiza-form" onSubmit={gonder} aria-label={kayit ? t.duzenleEtiketi : t.yeniEtiketi}>
      <div className="hf-ust">
        <div className="bolumlu" role="group" aria-label={t.tur}>
          {TURLER.map((x) => (
            <button key={x} type="button" aria-pressed={tur === x} onClick={() => turSec(x)}>
              {s.genel.hafizaTuru[x]}
            </button>
          ))}
        </div>
        <span className="alan-ipucu">{s.hafiza.turAciklamalari[tur]}</span>
      </div>
      <div className="alan">
        <label htmlFor={`hf-baslik-${kimlik}`}>{t.baslik}</label>
        <input
          id={`hf-baslik-${kimlik}`}
          className="girdi"
          value={baslik}
          maxLength={160}
          onChange={(e) => setBaslik(e.target.value)}
          placeholder={tur === "tercih" ? t.baslikOrnekTercih : tur === "ogrenilen" ? t.baslikOrnekOgrenilen : t.baslikOrnek}
          autoFocus
        />
      </div>
      <div className="alan">
        <label htmlFor={`hf-metin-${kimlik}`}>{t.metin}</label>
        <textarea
          id={`hf-metin-${kimlik}`}
          className="metin-alani"
          rows={4}
          value={metin}
          maxLength={8000}
          onChange={(e) => setMetin(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") gonder(e);
          }}
          placeholder={tur === "ogrenilen" ? t.metinOrnekOgrenilen : t.metinOrnek}
        />
      </div>
      <div className="hf-alt">
        <div className="alan hf-etiket">
          <label htmlFor={`hf-etiket-${kimlik}`}>{t.etiketler}</label>
          <input
            id={`hf-etiket-${kimlik}`}
            className="girdi"
            value={etiketler}
            onChange={(e) => setEtiketler(e.target.value)}
            placeholder={t.etiketlerOrnek}
            spellCheck={false}
          />
        </div>
        <div className="alan">
          <span className="alan-ad" id={`hf-onem-${kimlik}`}>
            {t.onem}
          </span>
          <div className="bolumlu" role="group" aria-labelledby={`hf-onem-${kimlik}`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={onem === i}
                onClick={() => {
                  setOnem(i);
                  setOnemDegisti(true);
                }}
                title={i === 5 ? t.onemEnYuksek : i === 1 ? t.onemEnDusuk : undefined}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>
      {hata ? <span className="alan-hata">{hata}</span> : null}
      <div className="dugme-satir">
        <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="kaydet" boyut={12} />}
          {kayit ? s.genel.kaydet : t.hafizayaYaz}
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={kapat}>
          {s.genel.vazgec}
        </button>
        <span className="alan-ipucu itele">Ctrl+Enter</span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Defterler
// ---------------------------------------------------------------------------

function Defterler() {
  const s = useSozluk();
  const t = s.hafiza.defter;
  const ajanlar = useVeri((d) => d.ajanlar);
  const [secili, setSecili] = useState<string | null>(null);
  const ajan = ajanlar.find((a) => a.id === secili) ?? ajanlar[0];

  if (!ajanlar.length)
    return (
      <Bos kucuk baslik={t.ekipYok}>
        {t.ekipYokMetin}
      </Bos>
    );

  return (
    <div className="defter-yerlesim">
      <nav className="defter-liste" aria-label={t.calisanlar}>
        <p className="alan-ipucu">{t.ipucu}</p>
        <ul>
          {ajanlar.map((a) => (
            <li key={a.id}>
              <button type="button" className="defter-dugme" aria-current={a.id === ajan?.id ? "true" : undefined} onClick={() => setSecili(a.id)}>
                <AjanAvatar ajan={a} boyut="s" />
                <span className="kisi-metin">
                  <b className="tek-satir">{a.ad}</b>
                  <small className="tek-satir">{a.rolAdi}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {ajan ? <Defter key={ajan.id} ajan={ajan} /> : null}
    </div>
  );
}

function Defter({ ajan }: { ajan: Ajan }) {
  const s = useSozluk();
  const t = s.hafiza.defter;
  const [veri, setVeri] = useState<{ icerik: string; guncelleme: string | null } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();

  const yukle = () => {
    setHata(null);
    api
      .defter(ajan.id)
      .then(setVeri)
      .catch((e: unknown) => setHata(e instanceof Error ? e.message : sozluk().hafiza.defter.alinamadi));
  };
  useEffect(yukle, [ajan.id]);

  const kaydet = () => {
    if (taslak === null) return;
    void calistir("kaydet", async () => {
      await api.defterYaz(ajan.id, taslak);
      setVeri({ icerik: taslak.trim(), guncelleme: new Date().toISOString() });
      setTaslak(null);
      bildir("basari", sozluk().hafiza.defter.kaydedildi(ajan.ad));
    });
  };

  return (
    <article className="defter">
      <header className="not-ust">
        <h2 className="defter-baslik">{t.baslik(ajan.ad)}</h2>
        {veri?.guncelleme ? <small>{t.guncellendi(goreli(veri.guncelleme))}</small> : null}
        <div className="dugme-satir itele">
          {taslak !== null ? (
            <>
              <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={kaydet} disabled={suruyor !== null || taslak.length > 6000}>
                {s.genel.kaydet}
              </button>
              <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setTaslak(null)}>
                {s.genel.vazgec}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={yukle}>
                {s.genel.yenile}
              </button>
              <button type="button" className="dugme dugme-kucuk" onClick={() => setTaslak(veri?.icerik ?? "")} disabled={!veri}>
                <Simge ad="duzenle" boyut={12} />
                {s.genel.duzenle}
              </button>
            </>
          )}
        </div>
      </header>
      {hata ? <HataKutu metin={hata} yeniden={yukle} /> : null}
      {!veri && !hata ? <Iskelet satir={5} /> : null}
      {taslak !== null ? (
        <div className="alan">
          <label className="gizli" htmlFor="defter-metin">
            {t.etiket(ajan.ad)}
          </label>
          <textarea id="defter-metin" className="metin-alani defter-metin" value={taslak} onChange={(e) => setTaslak(e.target.value)} spellCheck={false} autoFocus />
          <span className={taslak.length > 6000 ? "alan-hata" : "alan-ipucu"}>
            {t.sayac(taslak.length)}
          </span>
        </div>
      ) : veri ? (
        veri.icerik.trim() ? (
          <Markdown metin={veri.icerik} />
        ) : (
          <Bos kucuk baslik={t.bosBaslik}>
            {t.bosMetin(ajan.ad)}
          </Bos>
        )
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sorular
// ---------------------------------------------------------------------------

type SoruSuzgeci = "tumu" | AjanSorusu["durum"];
const SORU_SUZGECLERI: SoruSuzgeci[] = ["tumu", "bekliyor", "yanitlandi", "zaman_asimi"];

function sureMetni(baslangic: string, bitis: string, t: Sozluk["hafiza"]["soru"]): string {
  const sn = Math.max(0, Math.round((Date.parse(bitis) - Date.parse(baslangic)) / 1000));
  if (sn < 60) return t.saniye(sn);
  if (sn < 3600) return t.dakika(Math.round(sn / 60));
  return t.saat(Math.round(sn / 3600));
}

function Sorular() {
  const s = useSozluk();
  const t = s.hafiza.soru;
  const sorular = useHafiza((d) => d.sorular);
  const ajanlar = useVeri((d) => d.ajanlar);
  const [suzgec, setSuzgec] = useState<SoruSuzgeci>("tumu");
  const gorunen = sorular.filter((s) => suzgec === "tumu" || s.durum === suzgec);

  if (!sorular.length)
    return (
      <Bos kucuk baslik={t.yokBaslik}>
        {t.yokMetin}
      </Bos>
    );

  return (
    <section aria-label={t.etiket}>
      <div className="suzgec">
        <div className="bolumlu" role="group" aria-label={t.durumaGore}>
          {SORU_SUZGECLERI.map((k) => (
            <button key={k} type="button" aria-pressed={suzgec === k} onClick={() => setSuzgec(k)}>
              {k === "tumu" ? s.genel.tumu : t.suzgec[k]}{" "}
              <span className="soluk sayi">{k === "tumu" ? sorular.length : sorular.filter((x) => x.durum === k).length}</span>
            </button>
          ))}
        </div>
      </div>
      <ol className="soru-liste">
        {gorunen.map((soru) => {
          const soran = ajanlar.find((a) => a.id === soru.soranId);
          const sorulan = ajanlar.find((a) => a.id === soru.soruluId);
          return (
            <li key={soru.id} className="soru-kayit" data-durum={soru.durum}>
              <header className="sk-ust">
                <span className="sk-kisi">
                  {soran ? <AjanAvatar ajan={soran} boyut="xs" /> : <Avatar ad={soru.soranAd} boyut="xs" />}
                  <b>{soru.soranAd}</b>
                </span>
                <Simge ad="sag" boyut={12} />
                <span className="sk-kisi">
                  {sorulan ? <AjanAvatar ajan={sorulan} boyut="xs" /> : <Avatar ad={soru.soruluAd} boyut="xs" />}
                  <b>{soru.soruluAd}</b>
                </span>
                <span className={`hukum hukum-${soru.durum}`}>{t.durum[soru.durum]}</span>
                <time className="itele" dateTime={soru.olusturma}>
                  {akilliZaman(soru.olusturma)}
                </time>
              </header>
              <div className="sk-soru">
                <ZenginBlok metin={soru.soru} />
              </div>
              {soru.yanit ? (
                <div className="sk-yanit">
                  <ZenginBlok metin={soru.yanit} />
                  {soru.yanitlanma ? <small>{t.yanitladi(sureMetni(soru.olusturma, soru.yanitlanma, t))}</small> : null}
                </div>
              ) : soru.durum === "bekliyor" ? (
                <p className="sk-bekliyor">
                  <span className="nokta nokta-calisiyor" aria-hidden="true" />
                  {t.yanitliyor(soru.soruluAd, soru.soranAd)}
                </p>
              ) : (
                <p className="sk-bekliyor soluk">{t.yanitsiz(soru.soranAd)}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
