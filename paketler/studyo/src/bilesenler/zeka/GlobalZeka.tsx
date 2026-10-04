// Global zekâ: ArnOrg'un projelerden bağımsız öğrendiği standart kurallar, kanıtları, kurulun eylemleri ve
// canlı öğrenme günlüğü. Kurallar duruma göre (standart, aday, emekli) gruplanır; sıra sunucunun verdiği gibi kalır,
// geri bildirimle güven değişince satırlar yer değiştirmez.
import type { KuralDurumu, KureselKural, ZekaGunlukKaydi } from "@arnorg/ortak";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../../api/uclar";
import { sozluk, useDil, useSozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { useVeri } from "../../durum/veri";
import { useZeka, zekaOlayiUygula, zekaYukle } from "../../durum/zeka";
import { akilliZaman, goreli, kisalt, sayi, yuzde } from "../../yardimcilar/bicim";
import { useIslem, useSimdi } from "../../yardimcilar/kancalar";
import { Bos, HataKutu, Iskelet } from "../Durumlar";
import { OnaySor } from "../OnaySor";
import { Simge } from "../Simge";
import { GuvenOlcusu, KapsamEtiketleri, KapsamSecici, kapsamAdi, useRoller } from "./ortak";

const DURUMLAR: KuralDurumu[] = ["etkin", "aday", "emekli"];
/** Kapsam süzgecinde "kapsamı boş, herkese verilen" kurallar */
const HERKES = "*";

function sade(metin: string, dil: string): string {
  return metin.replace(/\s+/g, " ").trim().toLocaleLowerCase(dil === "tr" ? "tr-TR" : "en-US");
}

export function GlobalZeka() {
  const s = useSozluk();
  const t = s.zeka.kuresel;
  const dil = useDil();
  const roller = useRoller();
  const durum = useZeka((d) => d.durum);
  const yukleme = useZeka((d) => d.yukleme);
  const hata = useZeka((d) => d.hata);
  const [durumSuzgeci, setDurumSuzgeci] = useState<KuralDurumu | null>(null);
  const [kapsam, setKapsam] = useState("");
  const [arama, setArama] = useState("");
  const [ekleAcik, setEkleAcik] = useState(false);
  const [vurgu, setVurgu] = useState<string | null>(null);
  useSimdi(30_000);

  const kurallar = durum?.kurallar;
  const etiketler = useMemo(() => {
    const hepsi = new Set((kurallar ?? []).flatMap((k) => k.kapsam));
    const gruplar = ["yonetici", "gelistirici"].filter((k) => hepsi.has(k));
    return [...gruplar, ...[...hepsi].filter((k) => !gruplar.includes(k)).sort()];
  }, [kurallar]);

  const q = sade(arama, dil);
  const suzulen = useMemo(
    () =>
      (kurallar ?? []).filter(
        (k) =>
          (!durumSuzgeci || k.durum === durumSuzgeci) &&
          (!kapsam || (kapsam === HERKES ? k.kapsam.length === 0 : k.kapsam.includes(kapsam))) &&
          (!q || sade(k.metin, dil).includes(q)),
      ),
    [kurallar, durumSuzgeci, kapsam, q, dil],
  );

  // Günlükten bir kurala gidilince satır görünür kılınır ve kısa süre vurgulanır
  useEffect(() => {
    if (!vurgu) return;
    const z = requestAnimationFrame(() => document.getElementById(`kural-${vurgu}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    const bitir = setTimeout(() => setVurgu(null), 2600);
    return () => {
      cancelAnimationFrame(z);
      clearTimeout(bitir);
    };
  }, [vurgu]);

  if (!durum) {
    return yukleme === "hata" ? (
      <HataKutu metin={hata ?? t.alinamadi} yeniden={() => void zekaYukle()} />
    ) : (
      <Iskelet satir={8} etiket={t.yukleniyor} />
    );
  }

  const suzgecVar = Boolean(durumSuzgeci || kapsam || q);
  const temizle = () => {
    setDurumSuzgeci(null);
    setKapsam("");
    setArama("");
  };
  const kuralaGit = (id: string) => {
    temizle();
    setVurgu(id);
  };
  const son = durum.gunluk[0];
  const gruplar = DURUMLAR.filter((d) => !durumSuzgeci || d === durumSuzgeci).map((d) => ({ durum: d, kurallar: suzulen.filter((k) => k.durum === d) }));

  return (
    <section className="kuresel" aria-label={s.zeka.sekme.kuresel}>
      <p className="zeka-aciklama">{t.aciklama}</p>

      <div className="kuresel-ozet" role="group" aria-label={t.ozetEtiketi}>
        {DURUMLAR.map((d) => (
          <button
            key={d}
            type="button"
            className="ko-hucre"
            data-durum={d}
            aria-pressed={durumSuzgeci === d}
            title={t.duruma(t.durumAdi[d], durum.sayilar[d])}
            onClick={() => setDurumSuzgeci(durumSuzgeci === d ? null : d)}
          >
            <span className="ko-ad">{t.durumAdi[d]}</span>
            <span className="ko-sayi sayi">{durum.sayilar[d]}</span>
          </button>
        ))}
        <div className="ko-hucre ko-son">
          <span className="ko-ad">{t.sonOgrenme}</span>
          {son ? (
            <>
              <time className="ko-zaman" dateTime={son.zaman} title={akilliZaman(son.zaman)}>
                {goreli(son.zaman)}
              </time>
              <span className="ko-metin" title={son.metin}>
                {son.metin}
              </span>
            </>
          ) : (
            <span className="ko-metin">{t.henuzOgrenmedi}</span>
          )}
        </div>
      </div>

      <div className="suzgec kuresel-suzgec">
        <div className="arama-kutu">
          <Simge ad="ara" boyut={13} />
          <input className="girdi" type="search" aria-label={t.araEtiket} placeholder={t.araYer} value={arama} onChange={(e) => setArama(e.target.value)} />
        </div>
        <select className="secim suzgec-secim" aria-label={t.kapsamSuzgeci} value={kapsam} onChange={(e) => setKapsam(e.target.value)}>
          <option value="">{t.tumKapsamlar}</option>
          <option value={HERKES}>{t.kapsam.herkes}</option>
          {etiketler.map((k) => (
            <option key={k} value={k}>
              {kapsamAdi(k, s, roller, dil)}
            </option>
          ))}
        </select>
        {suzgecVar ? (
          <>
            <span className="alan-ipucu" role="status">
              {t.sonuc(suzulen.length)}
            </span>
            <button type="button" className="metin-dugme" onClick={temizle}>
              {t.suzgecleriTemizle}
            </button>
          </>
        ) : null}
        <button type="button" className="dugme dugme-ana dugme-kucuk itele" onClick={() => setEkleAcik(true)} aria-expanded={ekleAcik}>
          <Simge ad="arti" boyut={12} />
          {t.kuralEkle}
        </button>
      </div>

      <div className="kuresel-yerlesim">
        <div className="kural-gruplari">
          {ekleAcik ? <KuralFormu kapat={() => setEkleAcik(false)} /> : null}

          {!durum.kurallar.length ? (
            ekleAcik ? null : (
              <Bos
                baslik={t.bosBaslik}
                eylem={
                  <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={() => setEkleAcik(true)}>
                    {t.ilkKural}
                  </button>
                }
              >
                {t.bosMetin}
              </Bos>
            )
          ) : !suzulen.length ? (
            <Bos kucuk baslik={t.eslesenYok}>
              {t.eslesenYokMetin}
            </Bos>
          ) : (
            gruplar.map((g) =>
              g.kurallar.length ? (
                <section key={g.durum} className="kural-grup" data-durum={g.durum} aria-labelledby={`grup-${g.durum}`}>
                  <h2 className="ara-baslik kural-grup-baslik" id={`grup-${g.durum}`}>
                    {t.grupBaslik[g.durum]} <small className="sayi">{g.kurallar.length}</small>
                    <span className="kural-grup-aciklama">{t.grupAciklama[g.durum]}</span>
                  </h2>
                  <ol className="kural-liste">
                    {g.kurallar.map((k) => (
                      <KuralSatiri key={k.id} kural={k} vurgulu={vurgu === k.id} />
                    ))}
                  </ol>
                </section>
              ) : null,
            )
          )}
        </div>
        <OgrenmeGunlugu gunluk={durum.gunluk} kurallar={durum.kurallar} kuralaGit={kuralaGit} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Kural satırı
// ---------------------------------------------------------------------------

function KuralSatiri({ kural, vurgulu }: { kural: KureselKural; vurgulu: boolean }) {
  const s = useSozluk();
  const t = s.zeka.kuresel;
  const dil = useDil();
  const [duzenle, setDuzenle] = useState(false);
  const [silSor, setSilSor] = useState(false);
  const [kanitAcik, setKanitAcik] = useState(false);
  const { suruyor, calistir } = useIslem();
  const kisa = kisalt(kural.metin, 60);
  const projeler = [...new Set(kural.kanitlar.map((k) => k.projeAd ?? t.kurulKaniti))];
  const kanitlar = useMemo(() => kural.kanitlar.slice().sort((a, b) => b.zaman.localeCompare(a.zaman)), [kural.kanitlar]);

  if (duzenle) {
    return (
      <li className="kural-satir kural-satir-duzen" id={`kural-${kural.id}`} data-durum={kural.durum}>
        <KuralFormu kural={kural} kapat={() => setDuzenle(false)} />
      </li>
    );
  }

  const durumDegistir = (d: KuralDurumu) =>
    void calistir(`durum-${d}`, async () => {
      const k = await api.zekaKuralGuncelle(kural.id, { durum: d });
      zekaOlayiUygula(k, null);
      bildir("basari", sozluk().zeka.kuresel.durumBildirimi[d]);
    });

  const geriBildirim = (sonuc: "ise_yaradi" | "yanlis") =>
    void calistir(sonuc, async () => {
      const k = await api.zekaGeriBildirim(kural.id, sonuc);
      zekaOlayiUygula(k, null);
      const sz = sozluk().zeka.kuresel;
      bildir("basari", k.durum === "emekli" && kural.durum !== "emekli" ? sz.emekliyeAyrildi : sz.geriBildirimAlindi(yuzde(k.guven * 100)));
    });

  const sil = () =>
    void calistir("sil", async () => {
      await api.zekaKuralSil(kural.id);
      zekaOlayiUygula(null, null, kural.id);
      bildir("basari", sozluk().zeka.kuresel.silindi);
    });

  const mesgul = suruyor !== null;

  return (
    <li className="kural-satir" id={`kural-${kural.id}`} data-durum={kural.durum} data-vurgu={vurgulu || undefined}>
      <div className="ks-guven" title={t.guvenIpucu}>
        <span className="ks-yuzde sayi">{yuzde(kural.guven * 100)}</span>
        <GuvenOlcusu deger={kural.guven} />
        <span className="ks-guven-ad">{t.guven}</span>
      </div>
      <div className="ks-govde">
        <p className="ks-metin">{kural.metin}</p>
        <div className="ks-bilgi">
          <KapsamEtiketleri kapsam={kural.kapsam} />
          <span className="ks-kaynak" title={t.kaynakIpucu}>
            {t.kaynak[kural.kaynak]}
          </span>
          <time dateTime={kural.guncelleme} title={akilliZaman(kural.guncelleme)}>
            {t.guncellendi(goreli(kural.guncelleme))}
          </time>
        </div>
        <dl className="ks-olcu">
          <div title={t.kullanimIpucu}>
            <dt>{t.kullanim}</dt>
            <dd className="sayi">{sayi(kural.kullanim)}</dd>
          </div>
          <div title={t.yararIpucu}>
            <dt>{t.yarar}</dt>
            <dd className="sayi">{sayi(kural.yarar)}</dd>
          </div>
          <div title={t.ihlalIpucu} data-uyari={kural.ihlal > 0 || undefined}>
            <dt>{t.ihlal}</dt>
            <dd className="sayi">{sayi(kural.ihlal)}</dd>
          </div>
          <div className="ks-kanit">
            <dt>{t.kanit}</dt>
            <dd>
              <button
                type="button"
                className="ks-kanit-dugme"
                aria-expanded={kanitAcik}
                aria-controls={`kanit-${kural.id}`}
                title={t.kanitIpucu}
                onClick={() => setKanitAcik(!kanitAcik)}
              >
                <b className="sayi">{kural.kanitlar.length}</b>
                <span className="ks-projeler">{projeler.join(", ")}</span>
                <Simge ad="asagi" boyut={10} className={kanitAcik ? "simge-ters" : undefined} />
              </button>
            </dd>
          </div>
        </dl>
        {kanitAcik ? (
          <ol className="kanitlar" id={`kanit-${kural.id}`} aria-label={t.kanitlarEtiketi}>
            {kanitlar.map((k, i) => (
              <li key={`${k.zaman}-${i}`}>
                <span className="kanit-proje">{k.projeAd ?? t.kurulKaniti}</span>
                <time dateTime={k.zaman} title={akilliZaman(k.zaman)}>
                  {goreli(k.zaman)}
                </time>
                {sade(k.metin, dil) !== sade(kural.metin, dil) ? <q className="kanit-metin">{k.metin}</q> : null}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="ks-eylem" role="group" aria-label={t.eylemler}>
          <span className="ks-eylem-grup">
            <button type="button" className="dugme dugme-sessiz dugme-kucuk ks-olumlu" title={t.iseYaradiIpucu} disabled={mesgul} onClick={() => geriBildirim("ise_yaradi")}>
              {suruyor === "ise_yaradi" ? <span className="doner" aria-hidden="true" /> : <Simge ad="arti" boyut={11} />}
              {t.iseYaradi}
            </button>
            <button type="button" className="dugme dugme-sessiz dugme-kucuk ks-olumsuz" title={t.yanlisIpucu} disabled={mesgul} onClick={() => geriBildirim("yanlis")}>
              {suruyor === "yanlis" ? <span className="doner" aria-hidden="true" /> : <Simge ad="eksi" boyut={11} />}
              {t.yanlis}
            </button>
          </span>
          <span className="ks-ayrac" aria-hidden="true" />
          <span className="ks-eylem-grup">
            {DURUMLAR.filter((d) => d !== kural.durum).map((d) => (
              <button key={d} type="button" className="dugme dugme-sessiz dugme-kucuk" data-hedef={d} disabled={mesgul} onClick={() => durumDegistir(d)}>
                {suruyor === `durum-${d}` ? <span className="doner" aria-hidden="true" /> : null}
                {t.durumaAl[d]}
              </button>
            ))}
          </span>
          <span className="ks-eylem-grup ks-eylem-sag">
            <button
              type="button"
              className="dugme dugme-sessiz dugme-kucuk dugme-simge"
              aria-label={t.duzenleEtiketi(kisa)}
              title={s.genel.duzenle}
              disabled={mesgul}
              onClick={() => setDuzenle(true)}
            >
              <Simge ad="duzenle" boyut={12} />
            </button>
            <button
              type="button"
              className="dugme dugme-sessiz dugme-kucuk dugme-simge ks-sil"
              aria-label={t.silEtiketi(kisa)}
              title={s.genel.sil}
              disabled={mesgul}
              onClick={() => setSilSor(true)}
            >
              <Simge ad="cop" boyut={12} />
            </button>
          </span>
        </div>
        {silSor ? (
          <OnaySor evetMetni={s.genel.sil} suruyor={suruyor === "sil"} evet={sil} vazgec={() => setSilSor(false)}>
            {t.silUyari}
          </OnaySor>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Kural ekleme ve düzenleme formu
// ---------------------------------------------------------------------------

function KuralFormu({ kural, kapat }: { kural?: KureselKural; kapat: () => void }) {
  const s = useSozluk();
  const t = s.zeka.kuresel.form;
  const [metin, setMetin] = useState(kural?.metin ?? "");
  const [kapsam, setKapsam] = useState<string[]>(kural?.kapsam ?? []);
  const { suruyor, hata, setHata, calistir } = useIslem();
  const kimlik = kural?.id ?? "yeni";

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const temiz = metin.replace(/\s+/g, " ").trim();
    if (temiz.length < 5) return setHata(t.kisa);
    void calistir(
      "kaydet",
      async () => {
        const k = kural ? await api.zekaKuralGuncelle(kural.id, { metin: temiz, kapsam }) : await api.zekaKuralEkle(temiz, kapsam);
        zekaOlayiUygula(k, null);
        bildir("basari", kural ? sozluk().zeka.kuresel.form.guncellendi : sozluk().zeka.kuresel.form.eklendi);
        kapat();
      },
      true,
    );
  };

  return (
    <form
      className="kural-form"
      onSubmit={gonder}
      aria-label={kural ? t.duzenleEtiketi : t.yeniEtiketi}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          kapat();
        }
      }}
    >
      <div className="alan">
        <label htmlFor={`kf-metin-${kimlik}`}>{t.metin}</label>
        <textarea
          id={`kf-metin-${kimlik}`}
          className="metin-alani"
          rows={3}
          maxLength={600}
          value={metin}
          autoFocus
          placeholder={t.metinOrnek}
          aria-invalid={hata ? true : undefined}
          onChange={(e) => {
            setMetin(e.target.value);
            if (hata) setHata(null);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") gonder(e);
          }}
        />
        <span className="alan-ipucu sayi kural-form-sayac">{t.sayac(metin.length)}</span>
      </div>
      <div className="alan">
        <span className="alan-ad" id={`kf-kapsam-${kimlik}`}>
          {s.zeka.kuresel.kapsamEtiketi}
        </span>
        <KapsamSecici deger={kapsam} degisti={setKapsam} etiketId={`kf-kapsam-${kimlik}`} />
        <span className="alan-ipucu">{s.zeka.kuresel.kapsamIpucu}</span>
      </div>
      {!kural ? <p className="alan-ipucu kural-form-not">{t.kurulKurali}</p> : null}
      {hata ? (
        <span className="alan-hata" role="alert">
          {hata}
        </span>
      ) : null}
      <div className="dugme-satir">
        <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={suruyor !== null}>
          {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="kaydet" boyut={12} />}
          {kural ? s.genel.kaydet : t.ekle}
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={kapat}>
          {s.genel.vazgec}
        </button>
        <span className="alan-ipucu itele kural-form-kisayol">Ctrl+Enter</span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Öğrenme günlüğü: canlı; ekran açıkken gelen kayıt yumuşakça belirir
// ---------------------------------------------------------------------------

const GUNLUK_ADIMI = 30;

function OgrenmeGunlugu({ gunluk, kurallar, kuralaGit }: { gunluk: ZekaGunlukKaydi[]; kurallar: KureselKural[]; kuralaGit: (id: string) => void }) {
  const s = useSozluk();
  const t = s.zeka.kuresel.gunluk;
  const ws = useVeri((d) => d.wsDurumu);
  const [sinir, setSinir] = useState(GUNLUK_ADIMI);
  // Bileşen açıldığında var olan kayıtlar; sonradan gelenler bir kez canlandırılır (anahtar değişmediği için tekrar etmez)
  const ilk = useRef<Set<string> | null>(null);
  if (ilk.current === null) ilk.current = new Set(gunluk.map((g) => g.id));
  const kuralVar = useMemo(() => new Set(kurallar.map((k) => k.id)), [kurallar]);
  const gorunen = gunluk.slice(0, sinir);
  // Ekran okuyucuya yalnız açıkken gelen en yeni kayıt okunur
  const sonYeni = gunluk.find((g) => !ilk.current!.has(g.id));

  return (
    <aside className="ogrenme" aria-labelledby="ogrenme-baslik">
      <header className="ogrenme-ust">
        <h2 id="ogrenme-baslik">{t.baslik}</h2>
        <span className="ogrenme-canli" data-ws={ws}>
          <i aria-hidden="true" />
          {ws === "bagli" ? t.canli : ws === "kopuk" ? t.kopuk : s.gezinti.ust.ws.baglaniyor}
        </span>
      </header>
      <p className="gizli" role="status">
        {sonYeni ? `${t.tur[sonYeni.tur]}: ${sonYeni.metin}` : ""}
      </p>
      {gunluk.length ? (
        <ol className="gunluk" aria-label={t.etiket}>
          {gorunen.map((g) => {
            const hedef = g.kuralId && kuralVar.has(g.kuralId) ? g.kuralId : null;
            return (
              <li key={g.id} className="gunluk-satir" data-tur={g.tur} data-yeni={!ilk.current!.has(g.id) || undefined}>
                <span className="gunluk-isaret" aria-hidden="true" />
                <div className="gunluk-ic">
                  {hedef ? (
                    <button type="button" className="gunluk-metin gunluk-baglanti" title={t.kurala(kisalt(g.metin, 48))} onClick={() => kuralaGit(hedef)}>
                      {g.metin}
                    </button>
                  ) : (
                    <p className="gunluk-metin">{g.metin}</p>
                  )}
                  <span className="gunluk-alt">
                    <span className="gunluk-tur">{t.tur[g.tur]}</span>
                    <time dateTime={g.zaman} title={akilliZaman(g.zaman)}>
                      {goreli(g.zaman)}
                    </time>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="ogrenme-bos">{t.bos}</p>
      )}
      {gunluk.length > sinir ? (
        <button type="button" className="metin-dugme ogrenme-daha" onClick={() => setSinir(sinir + GUNLUK_ADIMI)}>
          {t.dahaEski(gunluk.length - sinir)}
        </button>
      ) : null}
    </aside>
  );
}
