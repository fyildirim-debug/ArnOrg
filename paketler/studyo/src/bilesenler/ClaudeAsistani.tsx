// Her ekranda Claude Code giriş ve kurulum asistanı. Sihirbaz atlandıysa ya da giriş sonradan düştüyse (süresi dolan
// oturum, çıkış, abonelik dışı giriş) üst çubuğun altında ince bir uyarı şeridi çıkar; "Giriş yap" ya da "Kur" sihirbazdaki
// Claude Code adımını sağdan açılan çekmecede açar. Çekirdek bir ajanın kimlik hatasını bildirince durum kendiliğinden
// tazelenir; pencereye dönülünce de bayatsa yeniden okunur (terminalden giriş yapılmış olabilir).
import { useEffect, useRef, useState } from "react";
import { useSozluk } from "../dil";
import { claudeAsistaniniAc, claudeAsistaniniKapat, claudeEksigi, kurulumuYukle, useKurulum } from "../durum/kurulum";
import { Cekmece } from "./Cekmece";
import { ClaudeKurulumu } from "./ClaudeKurulumu";

/** Pencereye dönülünce durum bundan eskiyse yeniden okunur */
const BAYAT_MS = 2 * 60_000;

/** Üst çubuğun altında: Claude Code'da eksik varsa uyarı şeridi */
export function ClaudeUyariSeridi() {
  const t = useSozluk().kurulum.uyari;
  const eksik = claudeEksigi(useKurulum((d) => d.durum?.claude));
  const [gizli, setGizli] = useState(false);
  const seritRef = useRef<HTMLDivElement>(null);
  const gorunur = !!eksik && !gizli;

  useEffect(() => {
    if (useKurulum.getState().yukleme === "bos") void kurulumuYukle();
    const donus = () => {
      if (document.hidden) return;
      if (Date.now() - useKurulum.getState().sonOkuma > BAYAT_MS) void kurulumuYukle(true);
    };
    window.addEventListener("focus", donus);
    document.addEventListener("visibilitychange", donus);
    return () => {
      window.removeEventListener("focus", donus);
      document.removeEventListener("visibilitychange", donus);
    };
  }, []);

  // "Sonra" yalnız bu sorun için: çözülüp yeniden çıkarsa şerit yine görünür
  useEffect(() => {
    if (!eksik) setGizli(false);
  }, [eksik]);

  // Açılır pencereler ve kayan ray şeridin altından başlasın: yüksekliği --serit-yukseklik olarak yazılır
  useEffect(() => {
    const serit = seritRef.current;
    if (!gorunur || !serit) return;
    const kok = document.documentElement.style;
    const yaz = () => kok.setProperty("--serit-yukseklik", `${serit.offsetHeight}px`);
    yaz();
    const gozlemci = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(yaz);
    gozlemci?.observe(serit);
    return () => {
      gozlemci?.disconnect();
      kok.removeProperty("--serit-yukseklik");
    };
  }, [gorunur]);

  if (!eksik || !gorunur) return null;
  const metin = eksik === "kurulu_degil" ? t.kuruluDegil : eksik === "giris" ? t.giris : t.abonelik;
  const eylem = eksik === "kurulu_degil" ? t.kur : eksik === "giris" ? t.girisYap : t.abonelikleGir;
  return (
    <div className="claude-serit" role="status" aria-label={t.etiket} ref={seritRef}>
      <span className="claude-serit-isaret" aria-hidden="true" />
      <p>{metin}</p>
      <div className="claude-serit-eylem">
        <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={claudeAsistaniniAc}>
          {eylem}
        </button>
        <button type="button" className="metin-dugme" onClick={() => setGizli(true)}>
          {t.sonra}
        </button>
      </div>
    </div>
  );
}

/** Her ekrandan açılan giriş ve kurulum çekmecesi; eksik giderilince kısa bir an sonra kendiliğinden kapanır */
export function ClaudeAsistaniCekmecesi() {
  const t = useSozluk().kurulum.uyari;
  const acik = useKurulum((d) => d.claudeAsistani);
  const eksik = claudeEksigi(useKurulum((d) => d.durum?.claude));
  const onceki = useRef(eksik);

  useEffect(() => {
    const vardi = onceki.current;
    onceki.current = eksik;
    if (!acik || !vardi || eksik) return;
    // Yeşile dönen listeyi görebilsin diye hemen kapanmaz
    const zaman = window.setTimeout(claudeAsistaniniKapat, 1400);
    return () => window.clearTimeout(zaman);
  }, [acik, eksik]);

  if (!acik) return null;
  return (
    <Cekmece baslik={t.cekmeceBaslik} kapat={claudeAsistaniniKapat}>
      <p className="claude-cekmece-aciklama">{t.cekmeceAciklama}</p>
      <ClaudeKurulumu />
    </Cekmece>
  );
}
