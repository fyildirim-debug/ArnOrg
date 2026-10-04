// Uygulama kabuğu ve ekran yönlendirmesi
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { anahtar, anahtarDinle } from "./api/anahtar";
import { useDil, useSozluk } from "./dil";
import { Bildirimler } from "./bilesenler/Bildirimler";
import { KurulBildirimleri } from "./bilesenler/KurulBildirimleri";
import { ClaudeAsistaniCekmecesi, ClaudeUyariSeridi } from "./bilesenler/ClaudeAsistani";
import { CanliRay } from "./bilesenler/CanliRay";
import { Iskelet } from "./bilesenler/Durumlar";
import { Gezinti } from "./bilesenler/Gezinti";
import { Simge } from "./bilesenler/Simge";
import { UstCubuk } from "./bilesenler/UstCubuk";
import { git, hataBildir, PROJESIZ_GORUNUMLER, rayiDegistir, useArayuz, type Gorunum } from "./durum/arayuz";
import { canliBaglantiyiBaslat, canliBaglantiyiKapat } from "./durum/olaylar";
import { ayarlariYukle, projeleriYukle, projeVerisiniYukle, sagligiYukle, useVeri } from "./durum/veri";
import { AjanOturumu } from "./gorunumler/AjanOturumu";
import { AnahtarGerekli } from "./gorunumler/AnahtarGerekli";
import { Ayarlar } from "./gorunumler/Ayarlar";
import { Denetim } from "./gorunumler/Denetim";
import { Ekip } from "./gorunumler/Ekip";
import { Hafiza } from "./gorunumler/Hafiza";
import { IlkKurulum } from "./gorunumler/IlkKurulum";
import { Kanallar } from "./gorunumler/Kanallar";
import { Karargah } from "./gorunumler/Karargah";
import { Notlar } from "./gorunumler/Notlar";
import { Ofis } from "./gorunumler/Ofis";
import { Onaylar } from "./gorunumler/Onaylar";
import { Pano } from "./gorunumler/Pano";
import { Projeler } from "./gorunumler/Projeler";
import { Zeka } from "./gorunumler/Zeka";
import { useMedya } from "./yardimcilar/kancalar";

// Kod ekranı (VS Code tezgâhı) büyük; yalnız ilk açılışta yüklenir
const Kod = lazy(() => import("./gorunumler/Kod"));
// Kod zekâsı (d3-force grafiği) yalnız açılınca yüklenir
const KodZekasi = lazy(() => import("./gorunumler/KodZekasi").then((m) => ({ default: m.KodZekasi })));

function useAnahtar(): string | null {
  return useSyncExternalStore(anahtarDinle, anahtar, anahtar);
}

export function App() {
  const a = useAnahtar();
  if (!a) return <AnahtarGerekli />;
  return <Studyo />;
}

/** Rayın gösterilmediği ekranlar */
const RAYSIZ: Gorunum[] = ["kod", "projeler", "ayarlar", "ofis"];
/** Kendi kaydırma alanını yöneten, ana alanı tam yükseklikte kullanan ekranlar */
const TAM_YUKSEKLIK: Gorunum[] = ["kod", "ajan", "kanallar", "ofis"];
/** Kenar boşluğu olmadan bütün ana alanı kullanan ekranlar */
const KENARSIZ: Gorunum[] = ["ofis"];

function Studyo() {
  // Dil değişince bütün ağaç yeni sözlük ve biçimlerle yeniden çizilir
  useDil();
  const s = useSozluk();
  const gorunum = useArayuz((d) => d.gorunum);
  const rayAcik = useArayuz((d) => d.rayAcik);
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const projelerYukleme = useVeri((d) => d.projelerYukleme);
  const projeSayisi = useVeri((d) => d.projeler.length);
  const genis = useMedya("(min-width: 1181px)");
  // Dar ekranda ray katman olarak açılır; tercih kalıcı tutulmaz
  const [rayKatman, setRayKatman] = useState(false);
  // Kod ekranı bir kez açılınca tezgâh DOM'da kalır; başka ekranda gizlenir
  const [kodAcildi, setKodAcildi] = useState(false);
  const anaRef = useRef<HTMLElement>(null);

  const ayarlar = useVeri((d) => d.ayarlar);
  const [ayarlarDenendi, setAyarlarDenendi] = useState(false);

  useEffect(() => {
    canliBaglantiyiBaslat();
    void sagligiYukle();
    void ayarlariYukle().finally(() => setAyarlarDenendi(true));
    projeleriYukle().catch(hataBildir);
    if (useVeri.getState().aktifProjeId) void projeVerisiniYukle();
    return () => canliBaglantiyiKapat();
  }, []);

  // Ekran değişince ana alan başa döner
  useEffect(() => {
    anaRef.current?.scrollTo({ top: 0 });
    setRayKatman(false);
  }, [gorunum]);

  const projeYok = !aktifProjeId || (projelerYukleme === "hazir" && projeSayisi === 0);
  const etkin: Gorunum = projeYok && !PROJESIZ_GORUNUMLER.includes(gorunum) ? "projeler" : gorunum;

  // Proje yokken menü de Projeler'i etkin göstersin
  useEffect(() => {
    if (etkin !== gorunum) git(etkin);
  }, [etkin, gorunum]);
  useEffect(() => {
    if (etkin === "kod") setKodAcildi(true);
  }, [etkin]);
  const rayUygun = !projeYok && !RAYSIZ.includes(etkin);
  const rayGorunur = rayUygun && (genis ? rayAcik : rayKatman);
  const tam = TAM_YUKSEKLIK.includes(etkin);

  const rayDugmesi = rayUygun ? (
    <button
      type="button"
      className="dugme dugme-sessiz dugme-kucuk dugme-simge"
      aria-pressed={rayGorunur}
      aria-label={rayGorunur ? s.gezinti.ray.gizle : s.gezinti.ray.goster}
      title={s.gezinti.ray.baslik}
      onClick={() => (genis ? rayiDegistir() : setRayKatman(!rayKatman))}
    >
      <Simge ad="ray" />
    </button>
  ) : null;

  // Ayarlar gelmeden kabuk çizilmez: ilk açılışta kabuk bir an görünüp sihirbaza dönmesin
  if (!ayarlar && !ayarlarDenendi) return <Bildirimler />;

  // İlk açılış hazırlığı bitmeden (ya da atlanmadan) kabuk gösterilmez
  if (ayarlar && !ayarlar.kurulumTamam) {
    return (
      <>
        <IlkKurulum />
        <Bildirimler />
      </>
    );
  }

  return (
    <div className="kabuk">
      <UstCubuk rayDugmesi={rayDugmesi} />
      <ClaudeUyariSeridi />
      <div className="govde">
        <Gezinti />
        <main className={`ana${tam ? " ana-tam" : ""}`} ref={anaRef} id="ana-icerik">
          {kodAcildi ? (
            <div className="kod-katmani" data-gorunur={etkin === "kod"} inert={etkin !== "kod"}>
              <Suspense
                fallback={
                  <div className="ana-ic">
                    <Iskelet satir={8} etiket={s.gezinti.kodYukleniyor} />
                  </div>
                }
              >
                <Kod gorunur={etkin === "kod"} />
              </Suspense>
            </div>
          ) : null}
          {etkin === "kod" ? null : tam ? (
            <div className={`ana-ic ana-ic-tam${KENARSIZ.includes(etkin) ? " ana-ic-kenarsiz" : ""}`}>
              <Ekran gorunum={etkin} />
            </div>
          ) : (
            <div className="ana-ic">
              <Ekran gorunum={etkin} />
            </div>
          )}
        </main>
        {rayGorunur ? <CanliRay kapat={() => (genis ? rayiDegistir(false) : setRayKatman(false))} /> : null}
      </div>
      <KurulBildirimleri />
      <ClaudeAsistaniCekmecesi />
      <Bildirimler />
    </div>
  );
}

function Ekran({ gorunum }: { gorunum: Gorunum }) {
  const s = useSozluk();
  switch (gorunum) {
    case "projeler":
      return <Projeler />;
    case "karargah":
      return <Karargah />;
    case "ofis":
      return <Ofis />;
    case "ekip":
      return <Ekip />;
    case "ajan":
      return <AjanOturumu />;
    case "pano":
      return <Pano />;
    case "kanallar":
      return <Kanallar />;
    case "notlar":
      return <Notlar />;
    case "hafiza":
      return <Hafiza />;
    case "kod-zekasi":
      return (
        <Suspense fallback={<Iskelet satir={6} etiket={s.gezinti.kodZekasiYukleniyor} />}>
          <KodZekasi />
        </Suspense>
      );
    case "denetim":
      return <Denetim />;
    case "onaylar":
      return <Onaylar />;
    case "zeka":
      return <Zeka />;
    case "ayarlar":
      return <Ayarlar />;
    case "kod":
      return null;
  }
}
