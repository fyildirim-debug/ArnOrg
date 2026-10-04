// Ayarlar › Web ve araştırma: yerleşik arama motorlarının durumu ve aç/kapa anahtarları, isteğe bağlı dış SearXNG
// adresi, r.jina.ai yedeği ve kurulun deneme araması. Her değişiklik hemen kaydedilir (PUT /api/ayarlar web);
// kaydedilen web ayarı Ayarlar ekranının kopyalarına da yazılır (kaydedildi), formun Kaydet'i eski değeri geri yazmasın.
import { WEB_ARAMA_KATEGORILERI, type Ayarlar, type WebAramaKategorisi, type WebAramaYaniti, type WebAyarlari, type WebDurumu, type WebMotorDurumu } from "@arnorg/ortak";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { yetenekApi } from "../api/yetenek";
import { sozluk, useSozluk, type Sozluk } from "../dil";
import { bildir, hataBildir } from "../durum/arayuz";
import { useIslem, useSimdi } from "../yardimcilar/kancalar";
import { DisBaglanti } from "./DisBaglanti";
import { Bos, HataKutu, Iskelet } from "./Durumlar";
import "../stiller/yetenek.css";

const DURUM_YENILEME_MS = 30_000;
const GOSTERILEN_SONUC = 5;

type MotorSinifi = "ok" | "aski" | "hata" | "bekliyor" | "kapali";

/** Motorun anlık durumu: nokta sınıfı, kısa metin, hata ayrıntısı */
function motorDurumu(m: WebMotorDurumu, simdi: number, t: Sozluk["yetenek"]["web"]): { sinif: MotorSinifi; metin: string; ayrinti: string | null } {
  if (!m.etkin) return { sinif: "kapali", metin: t.durum.kapali, ayrinti: null };
  if (m.askida && m.askiBitis) return { sinif: "aski", metin: t.durum.askida(Date.parse(m.askiBitis) - simdi), ayrinti: m.sonHata };
  const sonHata = m.sonHataZamani ? Date.parse(m.sonHataZamani) : 0;
  const sonBasari = m.sonBasari ? Date.parse(m.sonBasari) : 0;
  if (sonHata && sonHata >= sonBasari) return { sinif: "hata", metin: t.durum.hatali, ayrinti: m.sonHata };
  if (sonBasari) return { sinif: "ok", metin: t.durum.calisiyor, ayrinti: null };
  return { sinif: "bekliyor", metin: t.durum.bekliyor, ayrinti: null };
}

/** https://www.ornek.com/yol/uzun → ornek.com/yol/uzun (kısaltılmış) */
function kisaAdres(adres: string): string {
  try {
    const u = new URL(adres);
    const yol = decodeURIComponent(u.pathname).replace(/\/$/, "");
    const tam = `${u.hostname.replace(/^www\./, "")}${yol}`;
    return tam.length > 64 ? `${tam.slice(0, 63)}…` : tam;
  } catch {
    return adres;
  }
}

export function WebArastirma({ ayarlar, kaydedildi }: { ayarlar: Ayarlar | null; kaydedildi: (web: WebAyarlari) => void }) {
  const s = useSozluk();
  const t = s.yetenek.web;
  const k = useId();
  const [durum, setDurum] = useState<WebDurumu | null>(null);
  const [durumHatasi, setDurumHatasi] = useState<string | null>(null);
  const simdi = useSimdi(15_000);
  const { suruyor, calistir } = useIslem();
  const web = ayarlar?.web;

  const durumYukle = useCallback(async () => {
    try {
      setDurum(await yetenekApi.webDurum());
      setDurumHatasi(null);
    } catch (e) {
      setDurumHatasi(hataMetni(e));
    }
  }, []);
  useEffect(() => {
    void durumYukle();
    const z = setInterval(() => void durumYukle(), DURUM_YENILEME_MS);
    return () => clearInterval(z);
  }, [durumYukle]);

  /** Web ayarını kaydeder; ekranın kopyaları ve motor durumu tazelenir */
  const webKaydet = (ad: string, yeni: WebAyarlari, bildirim: () => string) =>
    calistir(ad, async () => {
      const a = await api.ayarlariKaydet({ web: yeni });
      kaydedildi(a.web);
      bildir("basari", bildirim());
      await durumYukle();
    });

  // Eski çekirdekte (web ayarı yok) bölüm gösterilmez
  if (ayarlar && !web) return null;

  const motorlar = (durum?.motorlar ?? []).filter((m) => m.tur !== "dis");
  const calisan = motorlar.filter((m) => m.etkin && !m.askida).length;
  const askidaVar = motorlar.some((m) => m.etkin && m.askida);
  const gruplar = [
    { baslik: t.genel, liste: motorlar.filter((m) => m.tur === "genel") },
    { baslik: t.teknik, liste: motorlar.filter((m) => m.tur === "teknik") },
  ];

  const motorDegistir = (m: WebMotorDurumu) => {
    if (!web) return;
    const kapali = new Set(web.kapaliMotorlar);
    if (m.etkin) kapali.add(m.kimlik);
    else kapali.delete(m.kimlik);
    void webKaydet(`motor-${m.kimlik}`, { ...web, kapaliMotorlar: [...kapali] }, () => (m.etkin ? sozluk().yetenek.web.motorKapandi(m.ad) : sozluk().yetenek.web.motorAcildi(m.ad)));
  };

  const askilariKaldir = () =>
    calistir("aski", async () => {
      setDurum(await yetenekApi.askilariKaldir());
      bildir("bilgi", sozluk().yetenek.web.askilarKalkti);
    });

  return (
    <section className="ayar-bolum web-arastirma" aria-labelledby={`${k}-baslik`}>
      <h2 className="ara-baslik" id={`${k}-baslik`}>
        {t.baslik}
        {durum ? <small className="web-ozet">{t.ozet(calisan, motorlar.length)}</small> : null}
      </h2>
      <p className="alan-ipucu web-aciklama">{t.aciklama}</p>

      {durumHatasi && !durum ? <HataKutu baslik={t.alinamadi} metin={durumHatasi} yeniden={() => void durumYukle()} /> : null}
      {!durum && !durumHatasi ? <Iskelet satir={6} /> : null}

      {durum ? (
        <div className="web-motorlar">
          {gruplar.map((g) => (
            <div key={g.baslik} className="web-motor-grup">
              <h3 className="web-alt-baslik">{g.baslik}</h3>
              <ul className="web-motor-liste">
                {g.liste.map((m) => {
                  const d = motorDurumu(m, simdi, t);
                  return (
                    <li key={m.kimlik} className={`web-motor web-motor-${d.sinif}`}>
                      <button
                        type="button"
                        role="switch"
                        className="anahtar-dugme"
                        aria-checked={m.etkin}
                        aria-label={t.motorAnahtari(m.ad, m.etkin)}
                        disabled={!web || suruyor !== null}
                        onClick={() => motorDegistir(m)}
                      />
                      <div className="web-motor-metin">
                        <span className="web-motor-ad">
                          <b>{m.ad}</b>
                          <code>{m.kategoriler.map((x) => t.kategoriler[x]).join(" · ")}</code>
                        </span>
                        <span className="web-motor-durum">
                          <i className={`web-nokta web-nokta-${d.sinif}`} aria-hidden="true" />
                          {d.metin}
                        </span>
                        {d.ayrinti ? (
                          <small className="web-motor-sonhata" title={d.ayrinti}>
                            {d.ayrinti}
                          </small>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {durum ? (
        <div className="web-aski">
          <p className="alan-ipucu">{t.askiIpucu}</p>
          {askidaVar ? (
            <button type="button" className="dugme dugme-kucuk" onClick={() => void askilariKaldir()} disabled={suruyor !== null}>
              {suruyor === "aski" ? <span className="doner" aria-hidden="true" /> : null}
              {t.askilariKaldir}
            </button>
          ) : null}
        </div>
      ) : null}

      {web ? <DisKaynaklar web={web} suruyor={suruyor} kaydet={webKaydet} /> : null}
      <DenemeAramasi aramaBitti={() => void durumYukle()} />
    </section>
  );
}

/** Dış SearXNG adresi ve r.jina.ai yedeği */
function DisKaynaklar({ web, suruyor, kaydet }: { web: WebAyarlari; suruyor: string | null; kaydet: (ad: string, yeni: WebAyarlari, bildirim: () => string) => Promise<void | undefined> }) {
  const s = useSozluk();
  const t = s.yetenek.web;
  const k = useId();
  const [taslak, setTaslak] = useState(web.searxngAdresi ?? "");
  useEffect(() => setTaslak(web.searxngAdresi ?? ""), [web.searxngAdresi]);
  const degisti = taslak.trim() !== (web.searxngAdresi ?? "");

  const searxngKaydet = (e: FormEvent) => {
    e.preventDefault();
    const adres = taslak.trim() || null;
    void kaydet("searxng", { ...web, searxngAdresi: adres }, () => (adres ? sozluk().yetenek.web.searxngKaydedildi : sozluk().yetenek.web.searxngKaldirildi));
  };

  return (
    <div className="web-dis">
      <h3 className="web-alt-baslik">{t.dis}</h3>
      <form className="alan" onSubmit={searxngKaydet} noValidate>
        <label htmlFor={`${k}-searxng`}>{t.searxng}</label>
        <div className="web-searxng-satir">
          <input
            id={`${k}-searxng`}
            className="girdi"
            type="url"
            inputMode="url"
            value={taslak}
            onChange={(e) => setTaslak(e.target.value)}
            placeholder={t.searxngOrnek}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="dugme dugme-kucuk" disabled={!degisti || suruyor !== null}>
            {suruyor === "searxng" ? <span className="doner" aria-hidden="true" /> : null}
            {s.genel.kaydet}
          </button>
          {web.searxngAdresi && !degisti ? (
            <button
              type="button"
              className="dugme dugme-kucuk dugme-sessiz"
              disabled={suruyor !== null}
              onClick={() => void kaydet("searxng", { ...web, searxngAdresi: null }, () => sozluk().yetenek.web.searxngKaldirildi)}
            >
              {t.kaldir}
            </button>
          ) : null}
        </div>
        <span className="alan-ipucu">{t.searxngIpucu}</span>
      </form>
      <div className="alan">
        <label className="secenek web-jina">
          <button
            type="button"
            role="switch"
            className="anahtar-dugme"
            aria-checked={web.disOkuyucu}
            disabled={suruyor !== null}
            onClick={() => void kaydet("jina", { ...web, disOkuyucu: !web.disOkuyucu }, () => (web.disOkuyucu ? sozluk().yetenek.web.jinaKapandi : sozluk().yetenek.web.jinaAcildi))}
          />
          {t.jina}
        </label>
        <span className="alan-ipucu">{t.jinaIpucu}</span>
      </div>
    </div>
  );
}

/** Kurulun deneme araması: sonuçların ilk birkaçı, yanıt veren ve vermeyen motorlar */
function DenemeAramasi({ aramaBitti }: { aramaBitti: () => void }) {
  const s = useSozluk();
  const t = s.yetenek.web;
  const k = useId();
  const [sorgu, setSorgu] = useState("");
  const [kategori, setKategori] = useState<WebAramaKategorisi>("genel");
  const [yanit, setYanit] = useState<WebAramaYaniti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [araniyor, setAraniyor] = useState(false);
  const iptal = useRef<AbortController | null>(null);
  useEffect(() => () => iptal.current?.abort(), []);

  const ara = (e: FormEvent) => {
    e.preventDefault();
    const q = sorgu.trim();
    if (!q) return;
    iptal.current?.abort();
    const d = new AbortController();
    iptal.current = d;
    setAraniyor(true);
    setHata(null);
    yetenekApi
      .webAra({ sorgu: q, kategori }, d.signal)
      .then((y) => {
        setYanit(y);
        aramaBitti();
      })
      .catch((h: unknown) => {
        if (h instanceof DOMException && h.name === "AbortError") return;
        setHata(hataMetni(h));
        hataBildir(h);
      })
      .finally(() => {
        if (iptal.current === d) setAraniyor(false);
      });
  };

  const sorgulanan = yanit ? yanit.yanitVerenler.length + yanit.hatalar.length : 0;

  return (
    <div className="web-deneme">
      <h3 className="web-alt-baslik" id={`${k}-baslik`}>
        {t.deneme}
      </h3>
      <form className="web-deneme-form" role="search" aria-labelledby={`${k}-baslik`} onSubmit={ara}>
        <input
          className="girdi"
          type="search"
          aria-label={t.deneme}
          value={sorgu}
          onChange={(e) => setSorgu(e.target.value)}
          placeholder={t.denemeOrnek}
          spellCheck={false}
          maxLength={500}
        />
        <div className="bolumlu" role="group" aria-label={t.kategori}>
          {WEB_ARAMA_KATEGORILERI.map((x) => (
            <button key={x} type="button" aria-pressed={kategori === x} onClick={() => setKategori(x)}>
              {t.kategoriler[x]}
            </button>
          ))}
        </div>
        <button type="submit" className="dugme" disabled={!sorgu.trim() || araniyor}>
          {araniyor ? <span className="doner" aria-hidden="true" /> : null}
          {araniyor ? t.araniyor : t.ara}
        </button>
      </form>
      <p className="alan-ipucu">{t.denemeIpucu}</p>

      <div className="web-deneme-sonuc" aria-live="polite" aria-busy={araniyor}>
        {hata && !araniyor ? <p className="alan-hata">{hata}</p> : null}
        {yanit && !hata ? (
          <>
            <p className="web-deneme-ozet">
              {t.denemeOzet(yanit.yanitVerenler.length, sorgulanan, t.sure(yanit.sureMs))}
              {yanit.onbellekten ? ` · ${t.onbellekten}` : ""}
              {yanit.yanitVerenler.length ? <span className="web-motorlar-adi"> · {yanit.yanitVerenler.join(", ")}</span> : null}
            </p>
            {yanit.hatalar.length || yanit.askidakiler.length ? (
              <p className="alan-ipucu web-deneme-hatalar">
                {yanit.hatalar.length ? `${t.yanitVermeyen}: ${yanit.hatalar.map((h) => `${h.motor} (${h.hata})`).join("; ")}` : ""}
                {yanit.hatalar.length && yanit.askidakiler.length ? " · " : ""}
                {yanit.askidakiler.length ? `${t.askida}: ${yanit.askidakiler.join(", ")}` : ""}
              </p>
            ) : null}
            {yanit.sonuclar.length ? (
              <ol className="web-sonuclar">
                {yanit.sonuclar.slice(0, GOSTERILEN_SONUC).map((r) => (
                  <li key={r.adres} className="web-sonuc">
                    <DisBaglanti href={r.adres} className="web-sonuc-baslik">
                      {r.baslik}
                    </DisBaglanti>
                    <span className="web-sonuc-adres">
                      <code>{kisaAdres(r.adres)}</code>
                      <span className="web-sonuc-motorlar">{r.motorlar.join(" · ")}</span>
                    </span>
                    {r.ozet ? <p>{r.ozet}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <Bos kucuk baslik={t.sonucYok}>
                {t.sonucYokMetin}
              </Bos>
            )}
            {yanit.sonuclar.length > GOSTERILEN_SONUC ? <p className="alan-ipucu">{t.dahaFazla(yanit.sonuclar.length - GOSTERILEN_SONUC)}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
