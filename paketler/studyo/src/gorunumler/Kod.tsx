// Kod: çalışma alanı seçici, dosya ağacı, sekmeler, Monaco editör, main ile fark, arama, alt panel
import type { CalismaAlani, DosyaDugumu } from "@arnorg/ortak";
import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { olaylariDinle } from "../api/canli";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { Bos, HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { AltPanel, type AltSekme, type CiktiSatiri } from "../bilesenler/kod/AltPanel";
import { AramaPaneli } from "../bilesenler/kod/AramaPaneli";
import { baslangicKlasorleri, DosyaAgaci } from "../bilesenler/kod/DosyaAgaci";
import { FarkGorunumu } from "../bilesenler/kod/FarkGorunumu";
import { dilAdi, EDITOR_SECENEKLERI, modelAdresi, monaco, TEMA } from "../bilesenler/kod/monacoKurulum";
import { useSekmeler } from "../bilesenler/kod/useSekmeler";
import { OnaySor } from "../bilesenler/OnaySor";
import { Simge } from "../bilesenler/Simge";
import { bildir, hataBildir } from "../durum/arayuz";
import { useVeri } from "../durum/veri";
import { belirtme, dosyaAdi, goreli, ilgi } from "../yardimcilar/bicim";
import { useMedya, useSimdi } from "../yardimcilar/kancalar";

const DEPO = { alan: "arnorg.kod.alan", alt: "arnorg.kod.alt" };
const BOS_ADRES = monaco.Uri.from({ scheme: "file", path: "/__arnorg_bos__" });

function oku(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function yaz(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // depolama kapalı
  }
}

export default function Kod() {
  const projeId = useVeri((d) => d.aktifProjeId);
  const [alanlar, setAlanlar] = useState<CalismaAlani[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [alan, setAlan] = useState<string>(() => oku(DEPO.alan) ?? "ana");

  useEffect(() => {
    if (!projeId) return;
    setHata(null);
    api
      .calismaAlanlari(projeId)
      .then((l) => {
        setAlanlar(l);
        setAlan((a) => (l.some((x) => x.kimlik === a) ? a : (l[0]?.kimlik ?? "ana")));
      })
      .catch((e: unknown) => setHata(hataMetni(e)));
  }, [projeId]);

  if (!projeId) return null;
  if (hata) {
    return (
      <div className="ana-ic">
        <HataKutu metin={hata} />
      </div>
    );
  }
  if (!alanlar) {
    return (
      <div className="ana-ic">
        <Iskelet satir={10} etiket="Çalışma alanları yükleniyor" />
      </div>
    );
  }
  const secili = alanlar.find((a) => a.kimlik === alan) ?? alanlar[0];
  if (!secili) {
    return (
      <div className="ana-ic">
        <Bos baslik="Çalışma alanı yok">Proje reposu okunamadı.</Bos>
      </div>
    );
  }
  return (
    <KodCalismaAlani
      key={`${projeId}:${secili.kimlik}`}
      projeId={projeId}
      alanlar={alanlar}
      alan={secili}
      alanSec={(k) => {
        setAlan(k);
        yaz(DEPO.alan, k);
      }}
    />
  );
}

function KodCalismaAlani({
  projeId,
  alanlar,
  alan,
  alanSec,
}: {
  projeId: string;
  alanlar: CalismaAlani[];
  alan: CalismaAlani;
  alanSec: (k: string) => void;
}) {
  const ajanlar = useVeri((d) => d.ajanlar);
  const proje = useVeri((d) => d.projeler.find((p) => p.id === projeId));
  const varsayilanDal = proje?.varsayilanDal ?? "main";
  const [kip, setKip] = useState<"duzenle" | "fark">("duzenle");
  const [yanPanel, setYanPanel] = useState<"dosyalar" | "ara">("dosyalar");
  const [agac, setAgac] = useState<DosyaDugumu | null>(null);
  const [agacHata, setAgacHata] = useState<string | null>(null);
  const [acikKlasorler, setAcikKlasorler] = useState<Set<string>>(new Set());
  const [altSekme, setAltSekme] = useState<AltSekme>("terminal");
  // Dar ekranda alt panel kapalı başlar; editöre yer kalsın
  const [altAcik, setAltAcik] = useState(() => !window.matchMedia("(max-width: 760px)").matches);
  const [altYukseklik, setAltYukseklikHam] = useState(() => Number(oku(DEPO.alt)) || 220);
  const [cikti, setCikti] = useState<CiktiSatiri[]>([]);
  const [sorunlar, setSorunlar] = useState<monaco.editor.IMarker[]>([]);
  const [imlec, setImlec] = useState({ satir: 1, sutun: 1 });
  const [farkYenile, setFarkYenile] = useState(0);
  const [canliYollar, setCanliYollar] = useState<Set<string>>(new Set());
  const [kapatilacak, setKapatilacak] = useState<string | null>(null);
  const [duraklatiyor, setDuraklatiyor] = useState(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const bekleyenSatir = useRef<{ yol: string; satir: number } | null>(null);
  const ciktiNo = useRef(0);
  const dar = useMedya("(max-width: 760px)");
  const simdi = useSimdi(5000);

  const gunluk = useCallback((metin: string) => {
    setCikti((c) => [...c.slice(-299), { id: ++ciktiNo.current, zaman: new Date().toISOString(), metin }]);
  }, []);
  const setAltYukseklik = (y: number) => {
    setAltYukseklikHam(y);
    yaz(DEPO.alt, String(Math.round(y)));
  };

  const s = useSekmeler(projeId, alan.kimlik, gunluk, () => editorRef.current);
  const aktifSekme = s.sekmeler.find((x) => x.yol === s.aktif) ?? null;
  const duzenleyen = ajanlar.find((a) => a.id === aktifSekme?.duzenleyenAjanId);
  const alanAjani = ajanlar.find((a) => a.id === alan.ajanId);

  // Dosya ağacı
  const agaciYukle = useCallback(
    (ilk = false) => {
      api
        .dosyalar(projeId, alan.kimlik)
        .then((k) => {
          setAgac(k);
          setAgacHata(null);
          if (ilk) setAcikKlasorler(baslangicKlasorleri(k));
        })
        .catch((e: unknown) => setAgacHata(hataMetni(e)));
    },
    [projeId, alan.kimlik],
  );
  useEffect(() => agaciYukle(true), [agaciYukle]);

  // Kaydet kısayolu her zaman en güncel kaydetme işlevini çağırır
  const kaydetRef = useRef<() => void>(() => undefined);
  kaydetRef.current = () => {
    if (!s.aktif) return;
    if (aktifSekme?.saltOkunur) {
      bildir("uyari", `${duzenleyen?.ad ?? "Bir ajan"} bu dosyayı düzenliyor; önce duraklatın.`);
      return;
    }
    void s.kaydet(s.aktif).then((ok) => ok && bildir("basari", `${dosyaAdi(s.aktif!)} kaydedildi.`));
  };

  // Ajanların dosya değişiklikleri
  const agacZamanlayici = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    return olaylariDinle((o) => {
      if (o.tur !== "dosya.degisti" || o.projeId !== projeId || o.alan !== alan.kimlik) return;
      const ajanAd = ajanlar.find((a) => a.id === o.ajanId)?.ad ?? (o.ajanId ? "Bir ajan" : "Siz");
      if (o.ajanId) gunluk(`${ajanAd} · ${o.yol} değiştirdi`);
      setCanliYollar((c) => new Set(c).add(o.yol));
      setTimeout(
        () =>
          setCanliYollar((c) => {
            const y = new Set(c);
            y.delete(o.yol);
            return y;
          }),
        4000,
      );
      if (o.ajanId) void s.disaridanDegisti(o.yol, ajanAd);
      clearTimeout(agacZamanlayici.current);
      agacZamanlayici.current = setTimeout(() => {
        agaciYukle();
        setFarkYenile((n) => n + 1);
      }, 700);
    });
  }, [projeId, alan.kimlik, ajanlar, gunluk, s.disaridanDegisti, agaciYukle]);

  // Sorunlar: etkin modelin işaretleri
  useEffect(() => {
    const guncelle = () => {
      const m = s.aktif ? s.model(s.aktif) : null;
      setSorunlar(m ? monaco.editor.getModelMarkers({ resource: m.uri }) : []);
    };
    guncelle();
    const d = monaco.editor.onDidChangeMarkers(guncelle);
    return () => d.dispose();
  }, [s.aktif, s.model, aktifSekme?.yukleniyor]);

  // Satıra git (arama sonucundan ya da sorunlardan)
  const satiraGit = useCallback((satir: number, sutun = 1) => {
    const e = editorRef.current;
    if (!e) return;
    e.revealLineInCenter(satir);
    e.setPosition({ lineNumber: satir, column: sutun });
    e.focus();
  }, []);

  useEffect(() => {
    const b = bekleyenSatir.current;
    if (b && aktifSekme && aktifSekme.yol === b.yol && !aktifSekme.yukleniyor) {
      bekleyenSatir.current = null;
      requestAnimationFrame(() => satiraGit(b.satir));
    }
  }, [aktifSekme, satiraGit]);

  const dosyaAc = (yol: string, satir?: number) => {
    setKip("duzenle");
    if (satir) bekleyenSatir.current = { yol, satir };
    void s.ac(yol);
    if (dar) setYanPanel("dosyalar");
  };

  const duraklatVeDuzenle = async () => {
    if (!aktifSekme?.duzenleyenAjanId) return;
    setDuraklatiyor(true);
    try {
      await api.ajanKes(aktifSekme.duzenleyenAjanId);
      gunluk(`${duzenleyen?.ad ?? "Ajan"} duraklatıldı; düzenleme sizde`);
      await s.yenidenYukle(aktifSekme.yol);
      bildir("bilgi", `${belirtme(duzenleyen?.ad ?? "Ajan")} duraklattınız. Kaydettiğinizde değişiklik notu ajana gider.`);
    } catch (e) {
      hataBildir(e);
    } finally {
      setDuraklatiyor(false);
    }
  };

  const alanEtiketi = (a: CalismaAlani) => {
    if (a.ana) return `${a.dal} · ana repo`;
    const ajan = ajanlar.find((x) => x.id === a.ajanId);
    return `${a.dal}${ajan ? ` · ${ajan.ad}` : ""}`;
  };

  const kapatIste = (yol: string) => {
    const sekme = s.sekmeler.find((x) => x.yol === yol);
    if (sekme?.kirli) setKapatilacak(yol);
    else s.kapat(yol);
  };

  const editorAdresi = useMemo(
    () => (aktifSekme && !aktifSekme.yukleniyor && !aktifSekme.hata ? modelAdresi(alan.kimlik, aktifSekme.yol) : BOS_ADRES).toString(),
    [aktifSekme, alan.kimlik],
  );
  const flasYeni = aktifSekme?.flas && simdi - aktifSekme.flas.zaman < 60_000 ? aktifSekme.flas : null;

  return (
    <div className="kod">
      <div className="kod-cubuk">
        <h1 className="gizli">Kod</h1>
        <label className="gizli" htmlFor="kod-alan">
          Çalışma alanı
        </label>
        <select id="kod-alan" className="secim kod-alan" value={alan.kimlik} onChange={(e) => alanSec(e.target.value)}>
          {alanlar.map((a) => (
            <option key={a.kimlik} value={a.kimlik}>
              {alanEtiketi(a)}
            </option>
          ))}
        </select>
        <div className="bolumlu" role="group" aria-label="Görünüm">
          <button type="button" aria-pressed={kip === "duzenle"} onClick={() => setKip("duzenle")}>
            Düzenle
          </button>
          <button type="button" aria-pressed={kip === "fark"} onClick={() => setKip("fark")}>
            {varsayilanDal} ile fark
          </button>
        </div>
        {alanAjani ? (
          <span className="kod-alan-ajan">
            <i className={`nokta nokta-${alanAjani.durum}`} aria-hidden="true" />
            {alanAjani.ad} · {alanAjani.isAciklamasi || alanAjani.rolAdi}
          </span>
        ) : null}
        <button
          type="button"
          className="dugme dugme-kucuk kod-dis"
          onClick={() =>
            void api
              .disaridaAc(projeId, alan.kimlik, s.aktif ?? undefined)
              .then(() => {
                gunluk(`Dış editörde açıldı: ${s.aktif ?? alan.yol}`);
                bildir("bilgi", "Dış editörde açıldı.");
              })
              .catch(hataBildir)
          }
          title={alan.yol}
        >
          <Simge ad="dis" boyut={12} />
          Dışarıda aç
        </button>
      </div>

      <div className="kod-govde">
        <aside className="e-yan" aria-label="Gezgin">
          <div className="e-yan-sekmeler" role="tablist">
            <button type="button" role="tab" aria-selected={yanPanel === "dosyalar"} onClick={() => setYanPanel("dosyalar")}>
              Dosyalar
            </button>
            <button type="button" role="tab" aria-selected={yanPanel === "ara"} onClick={() => setYanPanel("ara")}>
              <Simge ad="ara" boyut={12} />
              Ara
            </button>
          </div>
          {yanPanel === "dosyalar" ? (
            <div className="e-agac">
              <p className="e-agac-baslik" title={alan.yol}>
                {alan.dal}
              </p>
              {agacHata ? <HataKutu metin={agacHata} yeniden={() => agaciYukle(true)} /> : null}
              {!agac && !agacHata ? <Iskelet satir={8} /> : null}
              {agac ? (
                <DosyaAgaci
                  kok={agac}
                  aktifYol={kip === "duzenle" ? s.aktif : null}
                  ac={(y) => dosyaAc(y)}
                  acikKlasorler={acikKlasorler}
                  klasorDegistir={(y) =>
                    setAcikKlasorler((k) => {
                      const yeni = new Set(k);
                      if (yeni.has(y)) yeni.delete(y);
                      else yeni.add(y);
                      return yeni;
                    })
                  }
                  canliYollar={canliYollar}
                />
              ) : null}
            </div>
          ) : (
            <AramaPaneli projeId={projeId} alan={alan.kimlik} ac={(y, satir) => dosyaAc(y, satir)} />
          )}
        </aside>

        <section className="e-ana" aria-label="Editör">
          {kip === "fark" ? (
            <FarkGorunumu
              projeId={projeId}
              alan={alan.kimlik}
              anaMi={alan.ana}
              varsayilanDal={varsayilanDal}
              aktifYol={s.aktif}
              ac={(y) => dosyaAc(y)}
              yenile={farkYenile}
            />
          ) : (
            <>
              <div className="e-sekmeler" role="tablist" aria-label="Açık dosyalar">
                {s.sekmeler.map((x) => (
                  <div key={x.yol} className={`e-sekme${x.yol === s.aktif ? " e-sekme-aktif" : ""}`} title={x.yol}>
                    <button type="button" role="tab" aria-selected={x.yol === s.aktif} className="e-sekme-ad" onClick={() => s.setAktif(x.yol)}>
                      {x.saltOkunur ? <Simge ad="kilit" boyut={11} /> : null}
                      {dosyaAdi(x.yol)}
                      {canliYollar.has(x.yol) ? <i className="e-canli-nokta" title="Ajan yazıyor" /> : null}
                    </button>
                    <button
                      type="button"
                      className={`e-sekme-kapat${x.kirli ? " e-sekme-kirli" : ""}`}
                      onClick={() => kapatIste(x.yol)}
                      aria-label={`${dosyaAdi(x.yol)} sekmesini kapat${x.kirli ? " (kaydedilmedi)" : ""}`}
                    >
                      <Simge ad="kapat" boyut={10} />
                    </button>
                  </div>
                ))}
              </div>

              {kapatilacak ? (
                <div className="e-cubuk-bilgi">
                  <OnaySor
                    uyari
                    evetMetni="Kaydetmeden kapat"
                    evet={() => {
                      s.kapat(kapatilacak);
                      setKapatilacak(null);
                    }}
                    vazgec={() => setKapatilacak(null)}
                  >
                    {dosyaAdi(kapatilacak)} dosyasında kaydedilmemiş değişiklikler var.
                  </OnaySor>
                </div>
              ) : null}

              {aktifSekme?.saltOkunur ? (
                <div className="e-kilit-cubugu" role="status">
                  <Simge ad="kilit" boyut={12} />
                  <span>{duzenleyen?.ad ?? "Bir ajan"} bu dosyayı düzenliyor · salt okunur</span>
                  {aktifSekme.duzenleyenAjanId ? (
                    <button type="button" className="dugme dugme-kucuk" onClick={() => void duraklatVeDuzenle()} disabled={duraklatiyor}>
                      {duraklatiyor ? <span className="doner" aria-hidden="true" /> : null}
                      Duraklat ve düzenle
                    </button>
                  ) : null}
                </div>
              ) : null}

              {aktifSekme?.cakisma ? (
                <div className="e-cakisma" role="alert">
                  <span>
                    {aktifSekme.cakisma.ajanAd} bu dosyayı değiştirdi; sizde kaydedilmemiş değişiklikler var.
                  </span>
                  <button type="button" className="dugme dugme-kucuk" onClick={() => void s.yenidenYukle(aktifSekme.yol)}>
                    Onun sürümünü yükle
                  </button>
                  <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => s.cakismayiBirak(aktifSekme.yol)}>
                    Benimkiyle devam et
                  </button>
                </div>
              ) : null}

              <div className="e-editor">
                {!aktifSekme ? (
                  <div className="e-karsilama">
                    <Bos kucuk baslik={alanAjani ? `${ilgi(alanAjani.ad)} çalışma alanı` : "Ana repo"}>
                      Soldan bir dosya açın. Ajanın düzenlediği dosya size salt okunur gelir; "Duraklat ve düzenle" ile kontrolü alırsınız. Ctrl+S
                      kaydeder.
                    </Bos>
                  </div>
                ) : null}
                {aktifSekme?.yukleniyor ? (
                  <div className="e-karsilama">
                    <Iskelet satir={10} etiket="Dosya yükleniyor" />
                  </div>
                ) : null}
                {aktifSekme?.hata ? (
                  <div className="e-karsilama">
                    <HataKutu baslik={`${dosyaAdi(aktifSekme.yol)} açılamadı`} metin={aktifSekme.hata} />
                  </div>
                ) : null}
                <div className="e-monaco" hidden={!aktifSekme || aktifSekme.yukleniyor || !!aktifSekme.hata}>
                  <Editor
                    theme={TEMA}
                    path={editorAdresi}
                    defaultValue=""
                    keepCurrentModel
                    options={{
                      ...EDITOR_SECENEKLERI,
                      readOnly: !!aktifSekme?.saltOkunur,
                      readOnlyMessage: { value: `${duzenleyen?.ad ?? "Bir ajan"} bu dosyayı düzenliyor. Önce duraklatın.` },
                    }}
                    loading={<Iskelet satir={10} etiket="Editör yükleniyor" />}
                    onMount={(e) => {
                      editorRef.current = e;
                      e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => kaydetRef.current());
                      e.onDidChangeCursorPosition((c) => setImlec({ satir: c.position.lineNumber, sutun: c.position.column }));
                    }}
                    onChange={() => s.kirliGuncelle()}
                  />
                </div>
              </div>

              <div className="e-durum">
                {aktifSekme ? (
                  <>
                    {aktifSekme.kirli ? (
                      <button type="button" className="e-durum-dugme e-durum-kirli" onClick={() => kaydetRef.current()}>
                        <Simge ad="kaydet" boyut={11} />
                        Kaydedilmedi · Ctrl+S
                      </button>
                    ) : (
                      <span>Kaydedildi</span>
                    )}
                    {flasYeni ? (
                      <span className="e-durum-flas" key={flasYeni.zaman}>
                        {flasYeni.ajanAd} değiştirdi · {goreli(new Date(flasYeni.zaman).toISOString(), simdi)}
                      </span>
                    ) : null}
                    <span className="e-durum-sag">
                      Sa {imlec.satir}, Sü {imlec.sutun} · {dilAdi(aktifSekme.dil)} · UTF-8
                    </span>
                  </>
                ) : (
                  <span className="e-durum-sag">{alan.yol}</span>
                )}
              </div>
            </>
          )}

          <AltPanel
            projeId={projeId}
            alan={alan.kimlik}
            sekme={altSekme}
            setSekme={setAltSekme}
            acik={altAcik}
            setAcik={setAltAcik}
            yukseklik={altYukseklik}
            setYukseklik={setAltYukseklik}
            sorunlar={sorunlar}
            sorunAc={(m) => {
              setKip("duzenle");
              satiraGit(m.startLineNumber, m.startColumn);
            }}
            cikti={cikti}
            gunluk={gunluk}
            dosyaAdi={s.aktif ? dosyaAdi(s.aktif) : null}
          />
        </section>
      </div>
    </div>
  );
}
