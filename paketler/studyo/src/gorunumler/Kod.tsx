// Kod: Stüdyo'nun içerik alanına gömülü VS Code tezgâhı. İlk açılışta tembel yüklenip kurulur;
// başka ekrana geçince DOM'dan atılmaz, gizlenir ve geri gelince aynen sürer. Dar ekranda tezgâh yerine
// kısa bir not ve çalışma alanının dosya listesi gösterilir. VS Code dili çalışırken değiştiremez: arayüz dili
// tezgâh açıldıktan sonra değişirse üstte yeniden yüklemeyi öneren ince bir not çıkar.
import type { CalismaAlani, Dil, DosyaDugumu } from "@arnorg/ortak";
import { useEffect, useRef, useState } from "react";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { baslangicKlasorleri, DosyaAgaci } from "../bilesenler/DosyaAgaci";
import { HataKutu, Iskelet } from "../bilesenler/Durumlar";
import { useDil, useSozluk } from "../dil";
import { useVeri } from "../durum/veri";
import type { TezgahDenetimi } from "../tezgah";
import { useMedya } from "../yardimcilar/kancalar";

const BOS: Set<string> = new Set();

export default function Kod({ gorunur }: { gorunur: boolean }) {
  const s = useSozluk();
  const dil = useDil();
  const projeId = useVeri((d) => d.aktifProjeId);
  const dar = useMedya("(max-width: 760px)");
  const kapRef = useRef<HTMLDivElement>(null);
  const denetim = useRef<TezgahDenetimi | null>(null);
  const [durum, setDurum] = useState<"bekliyor" | "yukleniyor" | "hazir" | "hata">("bekliyor");
  const [hata, setHata] = useState<string | null>(null);
  /** Tezgâhın açıldığı dil (VS Code çalışırken dil değiştiremez) */
  const [acilisDili, setAcilisDili] = useState<Dil | null>(null);

  // Tezgâh geniş ekranda, Kod ekranı ilk görünür olduğunda kurulur (büyük parça o an indirilir)
  useEffect(() => {
    const kap = kapRef.current;
    if (!gorunur || dar || !projeId || !kap || durum !== "bekliyor") return;
    setDurum("yukleniyor");
    void import("../tezgah")
      .then(async ({ tezgahiBaslat, tezgahDili }) => {
        const d = await tezgahiBaslat(kap);
        setAcilisDili(tezgahDili());
        return d;
      })
      .then(
        (d) => {
          denetim.current = d;
          setDurum("hazir");
        },
        (h: unknown) => {
          console.error("[tezgah] kurulamadı", h);
          setHata(hataMetni(h));
          setDurum("hata");
        },
      );
  }, [gorunur, dar, projeId, durum]);

  useEffect(() => {
    const d = denetim.current;
    if (!d) return;
    if (gorunur && !dar) d.goster();
    else d.gizle();
  }, [gorunur, dar, durum]);

  const tezgahAcik = durum === "hazir" && !dar;
  const dilFarkli = tezgahAcik && acilisDili !== null && acilisDili !== dil;
  return (
    <div className={`kod-ekrani${dilFarkli ? " kod-ekrani-notlu" : ""}`}>
      <h1 className="gizli">{s.kod.baslik}</h1>
      {dilFarkli ? (
        <div className="kod-dil-notu" role="status">
          <p>
            <b>{s.kod.dilNotu}</b>
            <span>{s.kod.dilNotuAyrinti}</span>
          </p>
          <button type="button" className="dugme dugme-kucuk" onClick={() => location.reload()}>
            {s.kod.yenidenYukle}
          </button>
        </div>
      ) : null}
      <div ref={kapRef} className={`tezgah-kabi${tezgahAcik ? "" : " tezgah-kabi-gizli"}`} />
      {durum === "yukleniyor" && !dar ? (
        <div className="tezgah-durum" role="status">
          <Iskelet satir={10} etiket={s.kod.yukleniyor} />
          <p>{s.kod.yukleniyorMetni}</p>
        </div>
      ) : null}
      {durum === "hata" && !dar ? (
        <div className="tezgah-durum">
          <HataKutu baslik={s.kod.acilamadi} metin={hata ?? `${s.genel.bilinmeyenHata}.`} yeniden={() => location.reload()} />
        </div>
      ) : null}
      {dar && projeId ? <DarEkran projeId={projeId} /> : null}
    </div>
  );
}

/** Telefon genişliğinde: tezgâh yerine not ve salt okunur dosya listesi */
function DarEkran({ projeId }: { projeId: string }) {
  const s = useSozluk();
  const ajanlar = useVeri((d) => d.ajanlar);
  const [alanlar, setAlanlar] = useState<CalismaAlani[] | null>(null);
  const [alan, setAlan] = useState("ana");
  const [agac, setAgac] = useState<DosyaDugumu | null>(null);
  const [acik, setAcik] = useState<Set<string>>(BOS);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    api.calismaAlanlari(projeId).then(setAlanlar, (h: unknown) => setHata(hataMetni(h)));
  }, [projeId]);

  useEffect(() => {
    setAgac(null);
    api.dosyalar(projeId, alan).then(
      (k) => {
        setAgac(k);
        setAcik(baslangicKlasorleri(k));
      },
      (h: unknown) => setHata(hataMetni(h)),
    );
  }, [projeId, alan]);

  const etiket = (a: CalismaAlani) => (a.ana ? s.kod.anaRepo(a.dal) : s.kod.ajanAlani(ajanlar.find((x) => x.id === a.ajanId)?.ad ?? s.kod.ajan, a.dal));

  return (
    <div className="kod-dar ana-ic">
      <div className="kod-dar-not">
        <b>{s.kod.genisEkranIster}</b>
        <p>{s.kod.genisEkranAyrinti}</p>
      </div>
      {alanlar && alanlar.length > 1 ? (
        <>
          <label className="gizli" htmlFor="kod-dar-alan">
            {s.kod.calismaAlani}
          </label>
          <select id="kod-dar-alan" className="secim" value={alan} onChange={(e) => setAlan(e.target.value)}>
            {alanlar.map((a) => (
              <option key={a.kimlik} value={a.kimlik}>
                {etiket(a)}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {hata ? <HataKutu metin={hata} /> : null}
      {!agac && !hata ? <Iskelet satir={8} etiket={s.kod.dosyalarYukleniyor} /> : null}
      {agac ? (
        <div className="kod-dar-agac">
          <DosyaAgaci
            kok={agac}
            aktifYol={null}
            ac={() => undefined}
            acikKlasorler={acik}
            klasorDegistir={(y) =>
              setAcik((k) => {
                const yeni = new Set(k);
                if (yeni.has(y)) yeni.delete(y);
                else yeni.add(y);
                return yeni;
              })
            }
            canliYollar={BOS}
          />
        </div>
      ) : null}
    </div>
  );
}
