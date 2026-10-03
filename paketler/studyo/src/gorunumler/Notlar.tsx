// Notlar: .arnorg/notlar/ ağacı, markdown görüntüleme ve düzenleme
import type { NotDosyasi } from "@arnorg/ortak";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { Markdown } from "../bilesenler/Markdown";
import { OnaySor } from "../bilesenler/OnaySor";
import { Simge } from "../bilesenler/Simge";
import { bildir, useArayuz } from "../durum/arayuz";
import { useVeri } from "../durum/veri";
import { akilliZaman, dosyaAdi } from "../yardimcilar/bicim";
import { useIslem } from "../yardimcilar/kancalar";

interface Klasor {
  ad: string;
  yol: string;
  klasorler: Klasor[];
  notlar: NotDosyasi[];
}

function agacKur(notlar: NotDosyasi[]): Klasor {
  const kok: Klasor = { ad: "", yol: "", klasorler: [], notlar: [] };
  for (const n of notlar) {
    const parcalar = n.yol.split("/");
    let k = kok;
    for (let i = 0; i < parcalar.length - 1; i++) {
      const ad = parcalar[i]!;
      let alt = k.klasorler.find((x) => x.ad === ad);
      if (!alt) {
        alt = { ad, yol: parcalar.slice(0, i + 1).join("/"), klasorler: [], notlar: [] };
        k.klasorler.push(alt);
      }
      k = alt;
    }
    k.notlar.push(n);
  }
  const sirala = (k: Klasor) => {
    k.klasorler.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    k.notlar.sort((a, b) => a.yol.localeCompare(b.yol, "tr"));
    k.klasorler.forEach(sirala);
  };
  sirala(kok);
  return kok;
}

export function Notlar() {
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const seciliYol = useArayuz((d) => d.notYolu);
  const [notlar, setNotlar] = useState<NotDosyasi[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yeniAcik, setYeniAcik] = useState(false);
  const [kirli, setKirli] = useState(false);
  const [bekleyenYol, setBekleyenYol] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    if (!aktifProjeId) return;
    setHata(null);
    try {
      const n = await api.notlar(aktifProjeId);
      setNotlar(n);
      const s = useArayuz.getState().notYolu;
      if (!s || !n.some((x) => x.yol === s)) {
        const ilk = n.find((x) => x.yol === "vizyon.md") ?? n[0];
        if (ilk && !s) useArayuz.setState({ notYolu: ilk.yol });
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Notlar alınamadı.");
    }
  }, [aktifProjeId]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const agac = useMemo(() => agacKur(notlar ?? []), [notlar]);

  const sec = (yol: string) => {
    if (yol === seciliYol) return;
    if (kirli) setBekleyenYol(yol);
    else useArayuz.setState({ notYolu: yol });
  };

  const notDugmesi = (n: NotDosyasi, derinlik: number) => (
    <li key={n.yol}>
      <button
        type="button"
        className="not-dugme"
        style={{ paddingLeft: `${0.625 + derinlik * 0.875}rem` }}
        aria-current={n.yol === seciliYol ? "true" : undefined}
        onClick={() => sec(n.yol)}
        title={n.yol}
      >
        <Simge ad="dosya" boyut={13} />
        <span className="tek-satir">{n.baslik || dosyaAdi(n.yol)}</span>
      </button>
    </li>
  );

  const klasorCiz = (k: Klasor, derinlik: number): React.ReactNode => (
    <>
      {k.klasorler.map((alt) => (
        <li key={alt.yol}>
          <span className="not-klasor" style={{ paddingLeft: `${0.625 + derinlik * 0.875}rem` }}>
            <Simge ad="klasor" boyut={13} />
            {alt.ad}/
          </span>
          <ul>{klasorCiz(alt, derinlik + 1)}</ul>
        </li>
      ))}
      {k.notlar.map((n) => notDugmesi(n, derinlik))}
    </>
  );

  return (
    <>
      <div className="baslik">
        <div className="baslik-metin">
          <h1>Notlar</h1>
          <p>
            Proje belgeleri repo içinde yaşar: <code>.arnorg/notlar/</code> · vizyon, mimari, kararlar · her ajan okur, yazar, arar
          </p>
        </div>
        <div className="baslik-eylem">
          <button type="button" className="dugme" onClick={() => setYeniAcik(true)}>
            <Simge ad="arti" />
            Yeni not
          </button>
        </div>
      </div>

      {hata ? <HataKutu metin={hata} yeniden={() => void yukle()} /> : null}
      {!notlar && !hata ? <Iskelet satir={8} /> : null}

      {notlar ? (
        <div className="not-yerlesim">
          <nav className="not-agac" aria-label="Notlar">
            {yeniAcik ? (
              <YeniNot
                mevcut={notlar}
                kapat={() => setYeniAcik(false)}
                olustu={(n) => {
                  setNotlar((o) => [...(o ?? []).filter((x) => x.yol !== n.yol), n]);
                  setYeniAcik(false);
                  setKirli(false);
                  useArayuz.setState({ notYolu: n.yol });
                }}
              />
            ) : null}
            <p className="not-kok">.arnorg/notlar/</p>
            {notlar.length ? <ul>{klasorCiz(agac, 0)}</ul> : <p className="ray-bos">Henüz not yok.</p>}
          </nav>
          <div className="not-icerik">
            {bekleyenYol ? (
              <OnaySor
                uyari
                evetMetni="Değişiklikleri at"
                evet={() => {
                  setKirli(false);
                  useArayuz.setState({ notYolu: bekleyenYol });
                  setBekleyenYol(null);
                }}
                vazgec={() => setBekleyenYol(null)}
              >
                Bu notta kaydedilmemiş değişiklikler var. Başka nota geçerseniz kaybolur.
              </OnaySor>
            ) : null}
            {seciliYol && notlar.some((n) => n.yol === seciliYol) ? (
              <NotGorunumu
                key={seciliYol}
                yol={seciliYol}
                kirliDegisti={setKirli}
                kaydedildi={(n) => setNotlar((o) => (o ?? []).map((x) => (x.yol === n.yol ? n : x)))}
              />
            ) : notlar.length ? (
              <Bos kucuk baslik="Not seçin">Soldaki ağaçtan bir not açın.</Bos>
            ) : (
              <Bos kucuk baslik="Notlar boş">Vizyon ve mimari notları proje açılırken oluşur. Yeni not ile başlayın.</Bos>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function NotGorunumu({
  yol,
  kirliDegisti,
  kaydedildi,
}: {
  yol: string;
  kirliDegisti: (k: boolean) => void;
  kaydedildi: (n: NotDosyasi) => void;
}) {
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [icerik, setIcerik] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [guncelleme, setGuncelleme] = useState<string | null>(null);
  const { suruyor, calistir } = useIslem();
  const duzenleniyor = taslak !== null;
  const kirli = duzenleniyor && taslak !== icerik;

  useEffect(() => {
    if (!aktifProjeId) return;
    api
      .not(aktifProjeId, yol)
      .then((n) => {
        setIcerik(n.icerik);
        // Yeni oluşturulan boş not doğrudan düzenlemede açılır
        if (!n.icerik.trim()) setTaslak("");
      })
      .catch((e: unknown) => setHata(e instanceof Error ? e.message : "Not alınamadı."));
  }, [aktifProjeId, yol]);

  useEffect(() => kirliDegisti(kirli), [kirli, kirliDegisti]);

  const kaydet = useCallback(() => {
    if (!aktifProjeId || taslak === null) return;
    void calistir("kaydet", async () => {
      const n = await api.notKaydet(aktifProjeId, { yol, icerik: taslak });
      setIcerik(taslak);
      setTaslak(null);
      setGuncelleme(n.guncelleme);
      kaydedildi(n);
      bildir("basari", `${dosyaAdi(yol)} kaydedildi.`);
    });
  }, [aktifProjeId, taslak, yol, calistir, kaydedildi]);

  if (hata) return <HataKutu metin={hata} />;
  if (icerik === null) return <Iskelet satir={8} />;

  return (
    <article className="not-makale">
      <header className="not-ust">
        <code className="not-yol">{yol}</code>
        {guncelleme ? <small>kaydedildi {akilliZaman(guncelleme)}</small> : null}
        <div className="dugme-satir itele">
          {duzenleniyor ? (
            <>
              <span className="alan-ipucu">{kirli ? "Kaydedilmedi · Ctrl+S" : "Değişiklik yok"}</span>
              <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={kaydet} disabled={!kirli || suruyor !== null}>
                {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="kaydet" boyut={12} />}
                Kaydet
              </button>
              <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => setTaslak(null)}>
                {kirli ? "Vazgeç" : "Kapat"}
              </button>
            </>
          ) : (
            <button type="button" className="dugme dugme-kucuk" onClick={() => setTaslak(icerik)}>
              <Simge ad="duzenle" boyut={12} />
              Düzenle
            </button>
          )}
        </div>
      </header>
      {duzenleniyor ? (
        <div className="not-duzen">
          <label className="gizli" htmlFor="not-metin">
            {yol} içeriği
          </label>
          <textarea
            id="not-metin"
            className="metin-alani not-metin"
            value={taslak ?? ""}
            onChange={(e) => setTaslak(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                kaydet();
              }
            }}
            spellCheck={false}
            autoFocus
          />
          <div className="not-onizleme" aria-label="Önizleme">
            {taslak?.trim() ? <Markdown metin={taslak} /> : <p className="soluk">Önizleme burada görünür.</p>}
          </div>
        </div>
      ) : icerik.trim() ? (
        <Markdown metin={icerik} />
      ) : (
        <p className="soluk">Bu not boş.</p>
      )}
    </article>
  );
}

function YeniNot({ mevcut, kapat, olustu }: { mevcut: NotDosyasi[]; kapat: () => void; olustu: (n: NotDosyasi) => void }) {
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const [yol, setYol] = useState("kararlar/");
  const { suruyor, hata, setHata, calistir } = useIslem();

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    let temiz = yol.trim().replace(/^\/+/, "");
    if (!temiz || temiz.endsWith("/")) {
      setHata("Dosya adı yazın, ör. kararlar/ADR-006-onbellek.md");
      return;
    }
    if (temiz.split("/").includes("..")) {
      setHata("Yol .. içeremez.");
      return;
    }
    if (!/\.md$/i.test(temiz)) temiz += ".md";
    if (mevcut.some((n) => n.yol === temiz)) {
      setHata("Bu adda bir not zaten var.");
      return;
    }
    if (!aktifProjeId) return;
    const baslik = dosyaAdi(temiz).replace(/\.md$/i, "").replace(/[-_]+/g, " ");
    void calistir(
      "olustur",
      async () => {
        const n = await api.notKaydet(aktifProjeId, { yol: temiz, icerik: `# ${baslik}\n\n` });
        olustu(n);
      },
      true,
    );
  };

  return (
    <form className="yeni-not" onSubmit={gonder}>
      <label htmlFor="yeni-not-yol" className="alan-ipucu">
        Yeni notun yolu
      </label>
      <input
        id="yeni-not-yol"
        className="girdi"
        value={yol}
        onChange={(e) => setYol(e.target.value)}
        spellCheck={false}
        autoFocus
        aria-invalid={hata ? true : undefined}
      />
      {hata ? <span className="alan-hata">{hata}</span> : null}
      <div className="dugme-satir">
        <button type="submit" className="dugme dugme-ana dugme-kucuk" disabled={suruyor !== null}>
          Oluştur
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={kapat}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}
