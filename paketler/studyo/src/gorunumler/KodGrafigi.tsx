// Kod zekâsı grafiği: içe aktarma bağları (düz, yönlü) ve anlam bağları (kesikli mercan; kodları anlamca yakın
// dosyalar, arama dizinindeki gömmelerden). d3-force yerleşimi, SVG. Bağ türleri gösterge düğmeleriyle açılıp kapanır;
// üzerine gelinen düğümün komşuları vurgulanır, tıklanan düğümün bağları yan panelde nedenleriyle listelenir.
// Ajanlar aynı bağları ilgili_dosyalar aracıyla okur.
import type { KodDizinDurumu, KodGrafigi, KodGrafikKenarTuru, KodIlgiliDosya } from "@arnorg/ortak";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { Simge } from "../bilesenler/Simge";
import { useSozluk } from "../dil";
import { git, hataBildir } from "../durum/arayuz";
import { DOSYA_DUZEYI_SINIRI, grafikTercihi, useKodZekasi } from "../durum/kodZekasi";
import { tezgahtaAc } from "../tezgah";
import { sayi, yuzde } from "../yardimcilar/bicim";

interface Dugum extends SimulationNodeDatum {
  id: string;
  dil: string;
  satir: number;
  dosya: number;
  r: number;
}

interface Kenar extends SimulationLinkDatum<Dugum> {
  agirlik: number;
  tur: KodGrafikKenarTuru;
}

/** Dosyayı Kod ekranının düzenleyicisinde açar (satır verilirse orada) */
function koddaAc(projeId: string, alan: string, yol: string, satir?: number) {
  git("kod");
  tezgahtaAc({ projeId, alan, yol }, satir).catch(hataBildir);
}

function etiket(id: string, duzey: "klasor" | "dosya", kok: string): string {
  if (id === ".") return kok;
  const p = id.split("/");
  return duzey === "dosya" ? p[p.length - 1]! : p.slice(-2).join("/");
}

/** Kenar türü: eski yanıtlarda tür yoksa içe aktarmadır */
const turu = (k: { tur?: KodGrafikKenarTuru }): KodGrafikKenarTuru => k.tur ?? "ithal";

export function Grafik({ pid, alan, durum }: { pid: string; alan: string; durum: KodDizinDurumu | undefined }) {
  const z = useSozluk().kodZekasi;
  const tercih = useKodZekasi((d) => d.grafik);
  const surum = durum?.sonGuncelleme ?? null;
  // Küçük projede klasör düzeyi aynı klasördeki bağları yutar: seçim yapılmadıysa dosya düzeyi
  const duzey = tercih.duzey ?? (durum ? (durum.dosya <= DOSYA_DUZEYI_SINIRI ? "dosya" : "klasor") : null);
  const [grafik, setGrafik] = useState<KodGrafigi | null>(null);
  const grafikRef = useRef(grafik);
  grafikRef.current = grafik;
  const [hata, setHata] = useState<string | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [uzerinde, setUzerinde] = useState<string | null>(null);
  const [, setKare] = useState(0);
  const [boyut, setBoyut] = useState({ en: 800, boy: 560 });
  const [gorunum, setGorunum] = useState({ x: 0, y: 0, k: 1 });
  const kapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<Dugum, Kenar> | null>(null);
  const veriRef = useRef<{ dugumler: Dugum[]; kenarlar: Kenar[] }>({ dugumler: [], kenarlar: [] });
  /** Son yerleşimdeki konumlar: bağ türü açılıp kapanınca ve sessiz tazelemede düğümler yerinde kalır */
  const konumRef = useRef(new Map<string, { x: number; y: number }>());
  const surukleRef = useRef<{ tur: "dugum"; dugum: Dugum; id: number; x: number; y: number } | { tur: "kaydir"; x: number; y: number; gx: number; gy: number; id: number } | null>(null);
  /** Kullanıcı kaydırdı ya da yakınlaştırdıysa kap boyu değişince yeniden sığdırılmaz */
  const elleRef = useRef(false);
  const boyutRef = useRef(boyut);
  boyutRef.current = boyut;

  /** Bütün düğümler ve etiketleri kaba sığacak biçimde ortalar */
  const sigdir = () => {
    const { dugumler } = veriRef.current;
    if (!dugumler.length) return;
    const { en, boy } = boyutRef.current;
    // Etiket düğümün altında ortalıdır: yatayda yarı genişliği kadar taşar (11 px eşaralıklı yazı, ~6,6 px/karakter)
    const yari = (d: Dugum) => Math.max(d.r, etiket(d.id, grafikRef.current?.duzey ?? "dosya", "kök").length * 3.4);
    const pay = 24;
    const minX = Math.min(...dugumler.map((d) => (d.x ?? 0) - yari(d))) - pay;
    const maxX = Math.max(...dugumler.map((d) => (d.x ?? 0) + yari(d))) + pay;
    const minY = Math.min(...dugumler.map((d) => (d.y ?? 0) - d.r)) - pay;
    const maxY = Math.max(...dugumler.map((d) => (d.y ?? 0) + d.r)) + pay + 18;
    const k = Math.min(1.6, Math.max(0.15, Math.min(en / Math.max(1, maxX - minX), boy / Math.max(1, maxY - minY))));
    setGorunum({ k, x: en / 2 - ((minX + maxX) / 2) * k, y: boy / 2 - ((minY + maxY) / 2) * k });
  };

  // Alan ya da düzey değişince grafik ve konumlar sıfırlanır; dizin güncellenince (surum) sessizce tazelenir
  const anahtar = `${pid}\u0000${alan}\u0000${duzey}`;
  const anahtarRef = useRef(anahtar);
  useEffect(() => {
    if (!duzey) return;
    let iptal = false;
    if (anahtarRef.current !== anahtar) {
      anahtarRef.current = anahtar;
      konumRef.current.clear();
      setGrafik(null);
      setSecili(null);
    }
    api
      .kodGrafigi(pid, alan, duzey)
      .then((g) => {
        if (iptal) return;
        setGrafik(g);
        setHata(null);
        setSecili((s) => (s && g.dugumler.some((d) => d.id === s) ? s : null));
      })
      .catch((e) => !iptal && setHata(hataMetni(e)));
    return () => {
      iptal = true;
    };
  }, [pid, alan, duzey, surum, anahtar]);

  // Görünen bağlar: kapalı türler çıkar; içe aktarma görünürken onunla da bağlı anlam çifti ikinci kez çizilmez.
  // Görünen bağı olmayan düğüm gösterilmez.
  const gorunen = useMemo(() => {
    if (!grafik) return null;
    const kenarlar = grafik.kenarlar
      .filter((k) => (turu(k) === "ithal" ? tercih.ithal : tercih.anlam && !(tercih.ithal && k.ithalIle)))
      // Anlam bağları alta çizilir
      .sort((a, b) => Number(turu(a) === "ithal") - Number(turu(b) === "ithal"));
    const bagli = new Set(kenarlar.flatMap((k) => [k.kaynak, k.hedef]));
    return { dugumler: grafik.dugumler.filter((d) => bagli.has(d.id)), kenarlar };
  }, [grafik, tercih.ithal, tercih.anlam]);

  // Kap genişliği: dar ekranda grafik de daralır
  const cizilecek = Boolean(gorunen?.dugumler.length);
  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return;
    const gozlemci = new ResizeObserver(() => {
      const en = Math.max(280, kap.clientWidth);
      setBoyut({ en, boy: Math.round(Math.min(640, Math.max(360, en * 0.62))) });
    });
    gozlemci.observe(kap);
    return () => gozlemci.disconnect();
  }, [cizilecek]);

  // Kuvvet yerleşimi: önce eşzamanlı ısınma, sonra sürüklemede canlı. Bilinen konumlar korunur.
  useEffect(() => {
    simRef.current?.stop();
    if (!gorunen || !grafik) return;
    const eski = konumRef.current;
    const enCokSatir = Math.max(1, ...gorunen.dugumler.map((d) => d.satir));
    let bilinen = 0;
    const dugumler: Dugum[] = gorunen.dugumler.map((d, i) => {
      const k = eski.get(d.id);
      if (k) bilinen++;
      const aci = (i / Math.max(1, gorunen.dugumler.length)) * Math.PI * 2;
      return { ...d, r: 4 + Math.sqrt(d.satir / enCokSatir) * 20, x: k?.x ?? Math.cos(aci) * 150, y: k?.y ?? Math.sin(aci) * 150 };
    });
    const indeks = new Map(dugumler.map((d) => [d.id, d]));
    const kenarlar: Kenar[] = gorunen.kenarlar
      .filter((k) => indeks.has(k.kaynak) && indeks.has(k.hedef))
      .map((k) => ({ source: indeks.get(k.kaynak)!, target: indeks.get(k.hedef)!, agirlik: k.agirlik, tur: turu(k) }));
    veriRef.current = { dugumler, kenarlar };
    const sim = forceSimulation<Dugum, Kenar>(dugumler)
      .force(
        "baglanti",
        forceLink<Dugum, Kenar>(kenarlar)
          // Anlam bağı daha gevşek çeker: içe aktarma iskeleti okunur kalsın
          .distance((k) => (k.tur === "anlam" ? 95 : 70) + (k.source as Dugum).r + (k.target as Dugum).r)
          .strength((k) => (k.tur === "anlam" ? 0.08 : 0.25)),
      )
      .force("itme", forceManyBody<Dugum>().strength((d) => -160 - d.r * 10))
      // Çarpışma yarıçapı etiketi de kapsar: yan yana düşen dosya adları üst üste binmesin
      .force("carpisma", forceCollide<Dugum>().radius((d) => Math.max(d.r + 10, Math.min(66, etiket(d.id, grafik.duzey, "kök").length * 3.4))))
      .force("x", forceX<Dugum>(0).strength(0.04))
      .force("y", forceY<Dugum>(0).strength(0.06))
      .stop();
    const tanidik = dugumler.length > 0 && bilinen / dugumler.length >= 0.6;
    if (tanidik) sim.alpha(0.3);
    sim.tick(tanidik ? 140 : Math.min(500, 200 + dugumler.length));
    const kaydet = () => {
      for (const d of dugumler) eski.set(d.id, { x: d.x ?? 0, y: d.y ?? 0 });
    };
    kaydet();
    let bekleyen = 0;
    sim.on("tick", () => {
      if (bekleyen) return;
      bekleyen = requestAnimationFrame(() => {
        bekleyen = 0;
        kaydet();
        setKare((k) => k + 1);
      });
    });
    simRef.current = sim;
    if (!tanidik || !elleRef.current) {
      elleRef.current = false;
      sigdir();
    }
    setKare((x) => x + 1);
    return () => {
      sim.stop();
      if (bekleyen) cancelAnimationFrame(bekleyen);
    };
  }, [gorunen]);

  // Kap boyu değişince (pencere, ray, dar ekran) kullanıcı dokunmadıysa yeniden sığdırılır
  useEffect(() => {
    if (!elleRef.current) sigdir();
  }, [boyut.en, boyut.boy]);

  const komsular = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const k of gorunen?.kenarlar ?? []) {
      if (!m.has(k.kaynak)) m.set(k.kaynak, new Set());
      if (!m.has(k.hedef)) m.set(k.hedef, new Set());
      m.get(k.kaynak)!.add(k.hedef);
      m.get(k.hedef)!.add(k.kaynak);
    }
    return m;
  }, [gorunen]);

  const svgNoktasi = (e: ReactPointerEvent | WheelEvent) => {
    const kutu = kapRef.current!.querySelector("svg")!.getBoundingClientRect();
    return { x: e.clientX - kutu.left, y: e.clientY - kutu.top };
  };

  // Tekerlekle yakınlaştırma (imlecin altındaki nokta yerinde kalır); sayfa kaymasın diye pasif olmayan dinleyici
  useEffect(() => {
    const svg = kapRef.current?.querySelector("svg");
    if (!svg) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      elleRef.current = true;
      const p = svgNoktasi(e);
      setGorunum((g) => {
        const k = Math.min(4, Math.max(0.15, g.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: p.x - ((p.x - g.x) / g.k) * k, y: p.y - ((p.y - g.y) / g.k) * k };
      });
    };
    svg.addEventListener("wheel", tekerlek, { passive: false });
    return () => svg.removeEventListener("wheel", tekerlek);
  }, [cizilecek, boyut.en]);

  const asagi = (e: ReactPointerEvent<SVGSVGElement>) => {
    const hedef = (e.target as Element).closest("[data-dugum]");
    const p = svgNoktasi(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (hedef) {
      const dugum = veriRef.current.dugumler.find((d) => d.id === hedef.getAttribute("data-dugum"));
      if (!dugum) return;
      surukleRef.current = { tur: "dugum", dugum, id: e.pointerId, x: p.x, y: p.y };
      dugum.fx = dugum.x;
      dugum.fy = dugum.y;
      simRef.current?.alphaTarget(0.25).restart();
    } else surukleRef.current = { tur: "kaydir", x: p.x, y: p.y, gx: gorunum.x, gy: gorunum.y, id: e.pointerId };
  };
  const hareket = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = surukleRef.current;
    if (!s || s.id !== e.pointerId) return;
    const p = svgNoktasi(e);
    if (s.tur === "dugum") {
      s.dugum.fx = (p.x - gorunum.x) / gorunum.k;
      s.dugum.fy = (p.y - gorunum.y) / gorunum.k;
    } else {
      if (Math.hypot(p.x - s.x, p.y - s.y) > 3) elleRef.current = true;
      setGorunum((g) => ({ ...g, x: s.gx + p.x - s.x, y: s.gy + p.y - s.y }));
    }
  };
  const yukari = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = surukleRef.current;
    if (!s || s.id !== e.pointerId) return;
    surukleRef.current = null;
    // İşaretçi yakalandığından tıklama hedefi hep svg'dir: kısa hareket tıklama sayılır
    const tiklama = Math.hypot(svgNoktasi(e).x - s.x, svgNoktasi(e).y - s.y) < 4;
    if (s.tur === "dugum") {
      s.dugum.fx = null;
      s.dugum.fy = null;
      simRef.current?.alphaTarget(0);
      if (tiklama) setSecili(s.dugum.id);
    } else if (tiklama) setSecili(null);
  };

  if (hata) return <HataKutu metin={hata} />;
  const { dugumler, kenarlar } = veriRef.current;
  // Üzerine gelinen düğüm seçiliden önce vurgulanır
  const vurgulu = uzerinde ?? secili;
  const yakinlar = vurgulu ? (komsular.get(vurgulu) ?? new Set<string>()) : null;
  const enBuyuk = [...dugumler].sort((a, b) => b.r - a.r).slice(0, 14);
  const etiketli = new Set(enBuyuk.map((d) => d.id));
  const ithalSayisi = grafik?.kenarlar.filter((k) => turu(k) === "ithal").length ?? 0;
  const anlamSayisi = grafik?.kenarlar.filter((k) => turu(k) === "anlam").length ?? 0;

  // Anlam bağlarının durumu: ilerleme canlı dizin durumundan
  const a = grafik?.anlam;
  const gomulen = durum?.gomulen ?? a?.gomulen ?? 0;
  const toplam = durum?.toplamParca ?? a?.toplamParca ?? 0;
  const anlamNotu = !a
    ? null
    : a.durum === "kapali"
      ? z.anlamKapali
      : a.durum === "hazirlaniyor"
        ? anlamSayisi
          ? z.anlamGuncelleniyor(gomulen, toplam)
          : z.anlamHazirlaniyor(gomulen, toplam)
        : a.kirpilan
          ? z.anlamKirpildi(a.kirpilan)
          : null;

  return (
    <section aria-label={z.grafikEtiketi}>
      <div className="suzgec">
        <div className="bolumlu" role="group" aria-label={z.grafikDuzeyi}>
          <button type="button" aria-pressed={duzey === "klasor"} onClick={() => grafikTercihi({ duzey: "klasor" })}>
            {z.klasorler}
          </button>
          <button type="button" aria-pressed={duzey === "dosya"} onClick={() => grafikTercihi({ duzey: "dosya" })}>
            {z.dosyalar}
          </button>
        </div>
        <div className="kz-katmanlar" role="group" aria-label={z.bagTurleri}>
          <button type="button" className="kz-katman" aria-pressed={tercih.ithal} title={z.iceAktarmaIpucu} onClick={() => grafikTercihi({ ithal: !tercih.ithal })}>
            <svg className="kz-ornek kz-ornek-ithal" viewBox="0 0 24 8" aria-hidden="true">
              <line x1="1" y1="4" x2="18" y2="4" />
              <path d="M17 1 23 4 17 7z" />
            </svg>
            {z.iceAktarma}
            {grafik ? <span className="kz-katman-sayi">{sayi(ithalSayisi)}</span> : null}
          </button>
          <button type="button" className="kz-katman" aria-pressed={tercih.anlam} title={z.anlamIpucu} onClick={() => grafikTercihi({ anlam: !tercih.anlam })}>
            <svg className="kz-ornek kz-ornek-anlam" viewBox="0 0 24 8" aria-hidden="true">
              <line x1="1" y1="4" x2="23" y2="4" />
            </svg>
            {z.anlam}
            {grafik ? <span className="kz-katman-sayi">{sayi(anlamSayisi)}</span> : null}
          </button>
        </div>
        {dugumler.length && cizilecek ? (
          <button
            type="button"
            className="dugme dugme-sessiz dugme-kucuk"
            onClick={() => {
              elleRef.current = false;
              sigdir();
            }}
          >
            <Simge ad="sigdir" />
            {z.sigdir}
          </button>
        ) : null}
        {gorunen && cizilecek ? <span className="alan-ipucu">{z.grafikBilgi(gorunen.dugumler.length, gorunen.kenarlar.length, grafik?.kirpilan ?? 0)}</span> : null}
      </div>
      {anlamNotu ? (
        <p className="kz-grafik-not" role="status">
          {anlamNotu}
        </p>
      ) : null}
      {!grafik || !gorunen ? (
        <Iskelet satir={6} etiket={z.grafikHazirlaniyor} />
      ) : !cizilecek ? (
        !tercih.ithal && !tercih.anlam ? (
          <Bos kucuk baslik={z.bagGizli}>
            {z.bagGizliAyrinti}
          </Bos>
        ) : (
          <Bos kucuk baslik={z.bagimlilikYok}>
            {z.bagimlilikYokAyrinti}
          </Bos>
        )
      ) : (
        <div className="kz-iki-sutun kz-grafik-duzen">
          <div className="kz-grafik" ref={kapRef}>
            <svg
              width={boyut.en}
              height={boyut.boy}
              viewBox={`0 0 ${boyut.en} ${boyut.boy}`}
              role="img"
              aria-label={z.grafikResmi(gorunen.dugumler.length)}
              onPointerDown={asagi}
              onPointerMove={hareket}
              onPointerUp={yukari}
              onPointerCancel={yukari}
            >
              <defs>
                <marker id="kz-ok" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0 8 4 0 8z" className="kz-ok-ucu" />
                </marker>
                <marker id="kz-ok-vurgu" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0 8 4 0 8z" className="kz-ok-ucu-vurgu" />
                </marker>
              </defs>
              <g transform={`translate(${gorunum.x} ${gorunum.y}) scale(${gorunum.k})`}>
                {kenarlar.map((k) => {
                  const a = k.source as Dugum;
                  const b = k.target as Dugum;
                  const dx = (b.x ?? 0) - (a.x ?? 0);
                  const dy = (b.y ?? 0) - (a.y ?? 0);
                  const u = Math.hypot(dx, dy) || 1;
                  const ilgili = vurgulu !== null && (a.id === vurgulu || b.id === vurgulu);
                  const durumSinifi = ilgili ? " kz-kenar-vurgu" : vurgulu ? " kz-kenar-soluk" : "";
                  if (k.tur === "anlam")
                    return (
                      <line
                        key={`a\u0000${a.id}\u0000${b.id}`}
                        className={`kz-kenar-anlam${durumSinifi}`}
                        x1={(a.x ?? 0) + (dx / u) * a.r}
                        y1={(a.y ?? 0) + (dy / u) * a.r}
                        x2={(b.x ?? 0) - (dx / u) * b.r}
                        y2={(b.y ?? 0) - (dy / u) * b.r}
                      />
                    );
                  return (
                    <line
                      key={`i\u0000${a.id}\u0000${b.id}`}
                      className={`kz-kenar${durumSinifi}`}
                      x1={(a.x ?? 0) + (dx / u) * a.r}
                      y1={(a.y ?? 0) + (dy / u) * a.r}
                      x2={(b.x ?? 0) - (dx / u) * (b.r + 2)}
                      y2={(b.y ?? 0) - (dy / u) * (b.r + 2)}
                      strokeWidth={Math.min(4, 0.6 + Math.log2(1 + k.agirlik)) / Math.sqrt(gorunum.k)}
                      markerEnd={`url(#${ilgili ? "kz-ok-vurgu" : "kz-ok"})`}
                    />
                  );
                })}
                {dugumler.map((d) => {
                  const durumSinifi = d.id === secili ? " kz-dugum-secili" : vurgulu && (d.id === vurgulu || yakinlar?.has(d.id)) ? " kz-dugum-yakin" : vurgulu ? " kz-dugum-soluk" : "";
                  const yazi = d.id === vurgulu || yakinlar?.has(d.id) || (etiketli.has(d.id) && !vurgulu);
                  return (
                    <g key={d.id} data-dugum={d.id} className={`kz-dugum${durumSinifi}`} transform={`translate(${d.x ?? 0} ${d.y ?? 0})`} onPointerEnter={() => setUzerinde(d.id)} onPointerLeave={() => setUzerinde(null)}>
                      <circle r={d.r} />
                      <title>{z.dugumBilgi(d.id, d.dosya, d.satir)}</title>
                      {yazi ? (
                        <text y={d.r + 11 / gorunum.k} style={{ fontSize: `${11 / gorunum.k}px` }}>
                          {etiket(d.id, grafik.duzey, z.kok)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          <GrafikPaneli pid={pid} alan={alan} grafik={grafik} secili={secili} sec={setSecili} />
        </div>
      )}
    </section>
  );
}

function GrafikPaneli({ pid, alan, grafik, secili, sec }: { pid: string; alan: string; grafik: KodGrafigi; secili: string | null; sec: (id: string) => void }) {
  const z = useSozluk().kodZekasi;
  // Dosya düzeyinde anlam komşularının en yakın kod parçası (ilgili dosyalar ucundan)
  const [ilgili, setIlgili] = useState<Map<string, KodIlgiliDosya> | null>(null);
  useEffect(() => {
    setIlgili(null);
    if (!secili || grafik.duzey !== "dosya" || !grafik.kenarlar.some((k) => turu(k) === "anlam" && (k.kaynak === secili || k.hedef === secili))) return;
    const iptal = new AbortController();
    api
      .kodIlgili(pid, alan, secili, iptal.signal)
      .then((y) => setIlgili(new Map(y.dosyalar.map((d) => [d.yol, d]))))
      .catch(() => undefined);
    return () => iptal.abort();
  }, [pid, alan, secili, grafik]);

  if (!secili)
    return (
      <aside className="kz-panel kz-panel-bos" aria-label={z.dugumAyrintisi}>
        <p className="soluk">{z.dugumSecin}</p>
      </aside>
    );
  const d = grafik.dugumler.find((x) => x.id === secili);
  const ithal = grafik.kenarlar.filter((k) => turu(k) === "ithal");
  const giden = ithal.filter((k) => k.kaynak === secili).sort((a, b) => b.agirlik - a.agirlik);
  const gelen = ithal.filter((k) => k.hedef === secili).sort((a, b) => b.agirlik - a.agirlik);
  const anlam = grafik.kenarlar
    .filter((k) => turu(k) === "anlam" && (k.kaynak === secili || k.hedef === secili))
    .map((k) => ({ yol: k.kaynak === secili ? k.hedef : k.kaynak, benzerlik: k.agirlik, ithalIle: Boolean(k.ithalIle) }))
    .sort((a, b) => b.benzerlik - a.benzerlik);
  return (
    <aside className="kz-panel" aria-label={z.dugumAyrintisi}>
      <div className="kz-panel-baslik">
        <b className="kz-panel-yol">{secili === "." ? z.kokKlasor : secili}</b>
        {d ? <span className="soluk">{z.dugumOzeti(d.dil || z.karisik, d.dosya, d.satir)}</span> : null}
        {grafik.duzey === "dosya" ? (
          <button type="button" className="dugme dugme-kucuk" onClick={() => koddaAc(pid, alan, secili)}>
            {z.koddaAcKisa}
          </button>
        ) : null}
      </div>
      <h3 className="kz-panel-alt">{z.kullandiklari(giden.length)}</h3>
      {giden.length ? (
        <ul className="kz-panel-liste">
          {giden.map((k) => (
            <li key={k.hedef}>
              <button type="button" onClick={() => sec(k.hedef)}>
                {k.hedef} <span className="soluk">×{k.agirlik}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soluk kz-panel-not">{z.yok}</p>
      )}
      <h3 className="kz-panel-alt">{z.onuKullananlar(gelen.length)}</h3>
      {gelen.length ? (
        <ul className="kz-panel-liste">
          {gelen.map((k) => (
            <li key={k.kaynak}>
              <button type="button" onClick={() => sec(k.kaynak)}>
                {k.kaynak} <span className="soluk">×{k.agirlik}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="soluk kz-panel-not">{z.yok}</p>
      )}
      <h3 className="kz-panel-alt kz-panel-alt-anlam">{z.anlamcaYakin(anlam.length)}</h3>
      {anlam.length ? (
        <ul className="kz-panel-liste">
          {anlam.map((k) => {
            const yakin = ilgili?.get(k.yol)?.enYakin;
            return (
              <li key={k.yol} className="kz-anlam-satir">
                <button type="button" onClick={() => sec(k.yol)}>
                  {k.yol}{" "}
                  <span className="kz-benzerlik" title={z.benzerlik}>
                    {yuzde(k.benzerlik * 100)}
                  </span>
                </button>
                {yakin || k.ithalIle ? (
                  <div className="kz-anlam-alt">
                    {yakin ? (
                      <button type="button" className="kz-yakin-kod" title={z.enYakinKod} onClick={() => koddaAc(pid, alan, k.yol, yakin.o.bas)}>
                        {z.parcaAdi(yakin.bu.sembol, yakin.bu.bas)} ↔ {z.parcaAdi(yakin.o.sembol, yakin.o.bas)}
                      </button>
                    ) : null}
                    {k.ithalIle ? <span>{z.ithalIle}</span> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="soluk kz-panel-not">{z.yok}</p>
      )}
    </aside>
  );
}
