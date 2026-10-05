// Tanıtım: projenin kök README.md'si, kurulun okuduğu vitrin sayfası. Tanıtım uzmanının henüz birleşmemiş taslağı
// "Taslak" ile okunur; kurul güncelleme isteyebilir (uzman yoksa istek CEO'ya gider, CEO bir uzman işe alır: tam otonomda
// doğrudan, kurul kipinde teklif Onaylar'a düşer).
// README'deki göreli görseller çekirdeğin dosya ucundan anahtarlı istekle alınır; göreli bağlantılar Kod ekranında,
// çapalar sayfa içinde açılır. tanitim.degisti olayında, proje ya da ekipteki tanıtım uzmanı değişince yeniden okunur.
import type { Ajan, TanitimDurumu } from "@arnorg/ortak";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { useTamOtonom } from "../bilesenler/KararYetkisi";
import { gorunumAdi } from "../bilesenler/Gezinti";
import { AjanDurum, AjanKisi } from "../bilesenler/Kisi";
import { markdownHtml } from "../bilesenler/Markdown";
import { Simge } from "../bilesenler/Simge";
import { useSozluk } from "../dil";
import { bildir, git, hataBildir } from "../durum/arayuz";
import { ofisOlayDinle } from "../durum/olaylar";
import { useVeri } from "../durum/veri";
import { tezgahtaAc } from "../tezgah";
import { akilliZaman, saat, tarih } from "../yardimcilar/bicim";
import { useIslem, useMedya, useOnceki } from "../yardimcilar/kancalar";
import { benzersizCapa, capa, gorselTuru, gosterilenSurum, istekBekliyor, readmeAdresi, type Surum } from "../yardimcilar/tanitim";
import "../stiller/tanitim.css";

/** Notun en çok uzunluğu (çekirdekteki TANITIM_NOT_SINIRI) */
const NOT_SINIRI = 2000;
const DOSYA = "README.md";

export function Tanitim() {
  const s = useSozluk();
  const t = s.tanitim;
  const pid = useVeri((d) => d.aktifProjeId);
  const ws = useVeri((d) => d.wsDurumu);
  const oncekiWs = useOnceki(ws);
  // Ekipteki tanıtım uzmanları değişince (işe alım, ayrılma) yeniden okunur
  const uzmanImzasi = useVeri((d) =>
    d.ajanlar
      .filter((a) => a.rol === "tanitim")
      .map((a) => a.id)
      .join(","),
  );
  const genis = !useMedya("(max-width: 760px)");
  const [durum, setDurum] = useState<TanitimDurumu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [secim, setSecim] = useState<Surum>("yayinda");
  const istekNo = useRef(0);

  const yukle = useCallback(async () => {
    if (!pid) return;
    const no = ++istekNo.current;
    try {
      const d = await api.tanitim(pid);
      if (no !== istekNo.current) return;
      setDurum(d);
      setHata(null);
    } catch (e) {
      if (no === istekNo.current) setHata(hataMetni(e));
    }
  }, [pid]);

  // Proje değişince sıfırdan
  useEffect(() => {
    setDurum(null);
    setHata(null);
    setSecim("yayinda");
  }, [pid]);

  useEffect(() => {
    void yukle();
  }, [yukle, uzmanImzasi]);

  // Canlı: README değişti, iş birleşti ya da güncelleme istendi
  useEffect(
    () =>
      ofisOlayDinle((o) => {
        if (o.tur === "tanitim.degisti" && o.projeId === useVeri.getState().aktifProjeId) void yukle();
      }),
    [yukle],
  );

  // Bağlantı koptuysa kaçan olaylar için tazele
  useEffect(() => {
    if (oncekiWs === "kopuk" && ws === "bagli") void yukle();
  }, [ws, oncekiWs, yukle]);

  // Taslak birleşince seçim yayındakine döner (sonraki taslak kendiliğinden açılmasın)
  useEffect(() => {
    if (durum && !durum.taslak && secim === "taslak") setSecim("yayinda");
  }, [durum, secim]);

  if (!pid) return null;
  const gosterilen = durum ? gosterilenSurum(durum, secim) : null;
  const taslakta = gosterilen === "taslak" && !!durum?.taslak;
  const alan = taslakta && durum?.taslak ? durum.taslak.ajanId : "ana";

  const dosyaAc = (yol: string) => {
    if (!genis) {
      bildir("bilgi", s.kod.genisEkranIster);
      return;
    }
    git("kod");
    tezgahtaAc({ projeId: pid, alan, yol }).catch(hataBildir);
  };

  return (
    <div className="tanitim">
      <div className="baslik">
        <div className="baslik-metin">
          <h1>{gorunumAdi(s, "tanitim")}</h1>
          {durum ? <Kunye durum={durum} taslakta={taslakta} /> : null}
        </div>
        {durum && gosterilen ? (
          <div className="baslik-eylem">
            {durum.taslak ? (
              <div className="bolumlu" role="group" aria-label={t.surumEtiketi}>
                <button type="button" aria-pressed={!taslakta} disabled={!durum.var} title={durum.var ? undefined : t.yayindaYok} onClick={() => setSecim("yayinda")}>
                  {t.yayinda}
                </button>
                <button type="button" aria-pressed={taslakta} title={t.taslakHazir(durum.taslak.ajanAd)} onClick={() => setSecim("taslak")}>
                  {taslakta ? null : <i className="tanitim-yeni" aria-hidden="true" />}
                  {t.taslak}
                </button>
              </div>
            ) : null}
            {genis ? (
              <button type="button" className="dugme" title={t.koddaAcBaslik} onClick={() => dosyaAc(DOSYA)}>
                <Simge ad="kod" />
                {t.koddaAc}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {hata && !durum ? <HataKutu baslik={t.alinamadi} metin={hata} yeniden={() => void yukle()} /> : null}
      {!durum && !hata ? <Iskelet satir={10} etiket={t.yukleniyor} /> : null}

      {durum && gosterilen ? (
        <div className="tanitim-yerlesim">
          <article className="tanitim-sayfa" aria-label={DOSYA}>
            {taslakta && durum.taslak ? (
              <p className="tanitim-taslak-notu">
                <span className="etiket etiket-vurgu">{t.taslak}</span>
                <span>{t.taslakNotu(durum.taslak.ajanAd)}</span>
              </p>
            ) : null}
            <ReadmeIcerigi metin={(taslakta ? durum.taslak?.icerik : durum.icerik) ?? ""} projeId={pid} alan={alan} dosyaAc={dosyaAc} />
          </article>
          <aside className="tanitim-yan" aria-label={t.kunyeEtiketi}>
            <Sahibi uzman={durum.uzman} />
            <GuncellemeIstegi projeId={pid} durum={durum} yenile={yukle} />
          </aside>
        </div>
      ) : null}

      {durum && !gosterilen ? <BosDurum projeId={pid} durum={durum} yenile={yukle} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Künye: README.md · son değişiklik · yazar · commit (taslakta: taslak · zaman · uzman)
// ---------------------------------------------------------------------------

function Zaman({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={`${tarih(iso)} ${saat(iso)}`}>
      {akilliZaman(iso)}
    </time>
  );
}

function Kunye({ durum, taslakta }: { durum: TanitimDurumu; taslakta: boolean }) {
  const t = useSozluk().tanitim;
  const parcalar: ReactNode[] = [<span key="dosya">{DOSYA}</span>];
  if (taslakta && durum.taslak) {
    parcalar.push(
      <span key="taslak" className="tanitim-kunye-taslak">
        {t.taslakKunyesi}
      </span>,
      <Zaman key="zaman" iso={durum.taslak.zaman} />,
      <span key="kim">{durum.taslak.ajanAd}</span>,
    );
  } else if (durum.son) {
    const kisa = durum.son.commit.slice(0, 7);
    parcalar.push(
      <Zaman key="zaman" iso={durum.son.zaman} />,
      <span key="kim">{durum.son.yazar}</span>,
      <code key="commit" title={t.commitBaslik(kisa, durum.son.mesaj)}>
        {kisa}
      </code>,
    );
  } else if (durum.var) {
    parcalar.push(<span key="yok">{t.commitYok}</span>);
  }
  return (
    <p className="tanitim-kunye">
      {parcalar.map((p, i) => (
        <Fragment key={i}>
          {i ? (
            <span className="tanitim-ayrac" aria-hidden="true">
              ·
            </span>
          ) : null}
          {p}
        </Fragment>
      ))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// README: marked + DOMPurify (bilesenler/Markdown); ardından çapa, görsel ve bağlantı işaretleri
// ---------------------------------------------------------------------------

/** Alt metinli yer tutucu: görsel alınamadı ya da repo dışını gösteriyor */
function gorselYerTutucu(belge: Document, alt: string, metin: (alt: string) => string): HTMLSpanElement {
  const yer = belge.createElement("span");
  yer.className = "tanitim-gorsel-yok";
  yer.textContent = metin(alt.trim());
  return yer;
}

/**
 * Temizlenmiş README HTML'i: başlıklar çapa alır; göreli görseller çekirdekten alınmak üzere işaretlenir (adresleri
 * kaldırılır, tarayıcı sayfanın kökeninden yüklemeye çalışmaz); göreli bağlantılar Kod ekranında, çapalar sayfa içinde
 * açılır; dış adresler olduğu gibi kalır (yeni pencerede).
 */
function readmeHtml(metin: string, gorselYok: (alt: string) => string): string {
  const sablon = document.createElement("template");
  sablon.innerHTML = markdownHtml(metin);
  const kok = sablon.content;
  const kullanilan = new Map<string, number>();
  for (const h of kok.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const c = capa(h.textContent ?? "");
    if (c) h.id = `tanitim-${benzersizCapa(c, kullanilan)}`;
  }
  for (const img of kok.querySelectorAll("img")) {
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    const a = readmeAdresi(img.getAttribute("src") ?? "");
    if (a.tur === "dis") continue;
    if (a.tur === "yerel" && gorselTuru(a.yol)) {
      img.removeAttribute("src");
      img.dataset.tanitimGorsel = a.yol;
    } else img.replaceWith(gorselYerTutucu(document, img.getAttribute("alt") ?? "", gorselYok));
  }
  for (const el of kok.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const a = readmeAdresi(el.getAttribute("href") ?? "");
    if (a.tur === "dis") continue;
    el.removeAttribute("target");
    el.removeAttribute("rel");
    if (a.tur === "capa") {
      el.setAttribute("href", `#tanitim-${a.capa}`);
      el.dataset.tanitimCapa = a.capa;
    } else if (a.tur === "yerel") {
      el.dataset.tanitimDosya = a.yol;
      el.title = a.yol;
    } else el.removeAttribute("href");
  }
  return sablon.innerHTML;
}

const ReadmeIcerigi = memo(function ReadmeIcerigi({ metin, projeId, alan, dosyaAc }: { metin: string; projeId: string; alan: string; dosyaAc: (yol: string) => void }) {
  const t = useSozluk().tanitim;
  const gorselYok = t.gorselYok;
  const azHareket = useMedya("(prefers-reduced-motion: reduce)");
  const html = useMemo(() => readmeHtml(metin, gorselYok), [metin, gorselYok]);
  const kap = useRef<HTMLDivElement>(null);
  const dosyaAcRef = useRef(dosyaAc);
  dosyaAcRef.current = dosyaAc;

  // Göreli görseller anahtarlı istekle alınır, nesne adresiyle gösterilir; alınamayan ya da çözülemeyen görselin
  // yerine alt metni geçer
  useEffect(() => {
    const el = kap.current;
    if (!el) return;
    const ac = new AbortController();
    const adresler: string[] = [];
    const yerTut = (img: HTMLImageElement) => {
      if (img.isConnected) img.replaceWith(gorselYerTutucu(document, img.alt, gorselYok));
    };
    const hatada = (e: Event) => {
      if (e.target instanceof HTMLImageElement && el.contains(e.target)) yerTut(e.target);
    };
    el.addEventListener("error", hatada, true);
    for (const img of el.querySelectorAll<HTMLImageElement>("img[data-tanitim-gorsel]")) {
      const yol = img.dataset.tanitimGorsel ?? "";
      api.tanitimGorseli(projeId, alan, yol, ac.signal).then(
        ({ veri }) => {
          if (ac.signal.aborted) return;
          const adres = URL.createObjectURL(new Blob([veri], { type: gorselTuru(yol) ?? "" }));
          adresler.push(adres);
          img.src = adres;
        },
        () => {
          if (!ac.signal.aborted) yerTut(img);
        },
      );
    }
    return () => {
      ac.abort();
      el.removeEventListener("error", hatada, true);
      for (const a of adresler) URL.revokeObjectURL(a);
    };
  }, [html, projeId, alan, gorselYok]);

  const tikla = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>("a[data-tanitim-capa], a[data-tanitim-dosya]");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.tanitimCapa !== undefined) {
      document.getElementById(`tanitim-${a.dataset.tanitimCapa}`)?.scrollIntoView({ behavior: azHareket ? "auto" : "smooth", block: "start" });
      return;
    }
    if (a.dataset.tanitimDosya) dosyaAcRef.current(a.dataset.tanitimDosya);
  };

  if (!metin.trim()) return <p className="soluk">{t.bosReadme}</p>;
  return <div ref={kap} className="yazi tanitim-yazi" onClick={tikla} dangerouslySetInnerHTML={{ __html: html }} />;
});

// ---------------------------------------------------------------------------
// Künye sütunu: sahibi (tanıtım uzmanı) ve güncelleme isteği
// ---------------------------------------------------------------------------

function Sahibi({ uzman }: { uzman: TanitimDurumu["uzman"] }) {
  const t = useSozluk().tanitim;
  const otonom = useTamOtonom();
  // Durum canlı: ajan.guncellendi olaylarıyla güncellenen ekip verisinden
  const ajan = useVeri((d) => (uzman ? d.ajanlar.find((a) => a.id === uzman.id) : undefined));
  return (
    <dl className="tanitim-sahibi">
      <dt>{t.sahibi}</dt>
      {uzman ? (
        <dd>
          {ajan ? <AjanKisi ajan={ajan} alt={ajan.rolAdi} /> : <b>{uzman.ad}</b>}
          <AjanDurum durum={ajan?.durum ?? uzman.durum} />
          <p className="tanitim-yan-not">{t.uzmanMetin}</p>
        </dd>
      ) : (
        <dd>
          <b className="tanitim-sahipsiz">{t.uzmanYok}</b>
          <p className="tanitim-yan-not">{t.uzmanYokMetin(otonom)}</p>
        </dd>
      )}
    </dl>
  );
}

function GuncellemeIstegi({ projeId, durum, yenile }: { projeId: string; durum: TanitimDurumu; yenile: () => Promise<void> }) {
  const s = useSozluk();
  const t = s.tanitim;
  const ceo = useVeri((d) => d.ajanlar.find((a) => a.rol === "ceo"));
  const otonom = useTamOtonom();
  const [acik, setAcik] = useState(false);
  const [not, setNot] = useState("");
  const [iletilen, setIletilen] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();
  const hedef = durum.uzman?.ad ?? ceo?.ad ?? null;

  const gonder = (e?: FormEvent) => {
    e?.preventDefault();
    void calistir("iste", async () => {
      const y = await api.tanitimGuncelle(projeId, not.trim() || undefined);
      setIletilen(y.ajanAd);
      setNot("");
      setAcik(false);
      bildir("basari", t.istekGitti(y.ajanAd, y.kime === "uzman", otonom));
      await yenile();
    });
  };

  return (
    <div className="tanitim-istek">
      {acik ? (
        <form className="tanitim-istek-formu" onSubmit={gonder}>
          <label htmlFor="tanitim-not" className="alan-ipucu">
            {t.notEtiketi}
          </label>
          <textarea
            id="tanitim-not"
            className="metin-alani"
            rows={3}
            maxLength={NOT_SINIRI}
            value={not}
            placeholder={t.notIpucu}
            onChange={(e) => setNot(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") gonder();
              else if (e.key === "Escape") setAcik(false);
            }}
            autoFocus
          />
          {hedef ? <p className="alan-ipucu">{t.kimeGidecek(hedef, !!durum.uzman)}</p> : null}
          <div className="dugme-satir">
            <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={suruyor !== null}>
              {suruyor ? <span className="doner" aria-hidden="true" /> : null}
              {t.gonder}
            </button>
            <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setAcik(false)}>
              {s.genel.vazgec}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="dugme" disabled={!hedef} title={hedef ? undefined : t.ceoYok} onClick={() => setAcik(true)}>
          <Simge ad="mesaj" />
          {t.guncellenmesiniIste}
        </button>
      )}
      <IstekNotu durum={durum} iletilen={iletilen} />
    </div>
  );
}

/** İstek, sonrasında README değişene dek "Son istek" olarak görünür */
function IstekNotu({ durum, iletilen }: { durum: TanitimDurumu; iletilen: string | null }) {
  const t = useSozluk().tanitim;
  if (!durum.guncellemeIstendi || !istekBekliyor(durum)) return null;
  return (
    <p className="tanitim-istendi" role="status">
      {t.istendi(akilliZaman(durum.guncellemeIstendi))}
      {iletilen ? ` · ${t.iletildi(iletilen)}` : ""}
    </p>
  );
}

// ---------------------------------------------------------------------------
// README.md henüz yok: alanın ne olduğu ve tek adımlık istek
// ---------------------------------------------------------------------------

function BosDurum({ projeId, durum, yenile }: { projeId: string; durum: TanitimDurumu; yenile: () => Promise<void> }) {
  const t = useSozluk().tanitim;
  const ceo: Ajan | undefined = useVeri((d) => d.ajanlar.find((a) => a.rol === "ceo"));
  const otonom = useTamOtonom();
  const [iletilen, setIletilen] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();
  const uzman = durum.uzman;
  const iste = () =>
    void calistir("iste", async () => {
      const y = await api.tanitimGuncelle(projeId);
      setIletilen(y.ajanAd);
      bildir("basari", t.istekGitti(y.ajanAd, y.kime === "uzman", otonom));
      await yenile();
    });

  return (
    <div className="tanitim-bos">
      <div className="bos">
        <span className="tanitim-bos-dosya" aria-hidden="true">
          {DOSYA}
        </span>
        <b>{t.bosBaslik}</b>
        <p>{t.bosMetin}</p>
        <div className="dugme-satir">
          <button type="button" className="dugme dugme-ana" disabled={suruyor !== null || (!uzman && !ceo)} onClick={iste}>
            {suruyor ? <span className="doner" aria-hidden="true" /> : null}
            {uzman ? t.uzmanaYazdir(uzman.ad) : t.ceodanIste}
          </button>
        </div>
        {uzman ? null : <p className="alan-ipucu">{ceo ? t.ceoIpucu(ceo.ad, otonom) : t.ceoYok}</p>}
        <IstekNotu durum={durum} iletilen={iletilen} />
      </div>
      {uzman ? (
        <aside className="tanitim-yan" aria-label={t.kunyeEtiketi}>
          <Sahibi uzman={uzman} />
        </aside>
      ) : null}
    </div>
  );
}
