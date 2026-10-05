// Ofis: ajanların yaşadığı canlı 2D çalışma ortamı. Sahne React dışında (src/ofis) çalışır;
// bu bileşen projenin motorunu bellekten alıp sahneye takar, depo ve olay akışını ona iletir, çekmece ve
// başlık katmanlarını çizer. Ekrandan çıkınca motor yok edilmez, ayrılır: geri gelince ofis aynı hâldedir.
//
// Üstte kamera kipleri (canlı yayın, takip edilen kişi), altta olay şeridi: son olaylar soldan akar; birine
// basınca kamera o kişiye gidip onu takip eder (kişisi yoksa olayın yerine gider).
//
// 0.0.8: çalışana basınca yanında kişi kartı açılır (takip, mesaj, görevi açma; ayrıntılar çekmecede); tek tuşlu
// kısayollar harita odakta değilken de çalışır ("?" penceresi); görev kaydı (gorev.kaydedildi) sahneye iletilir.
import type { AjanDurumu } from "@arnorg/ortak";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { hataMetni } from "../api/istek";
import { AjanAyrinti } from "../bilesenler/ajan/AjanAyrinti";
import { MesajFormu } from "../bilesenler/ajan/AjanEylemleri";
import { Cekmece } from "../bilesenler/Cekmece";
import { HataKutu } from "../bilesenler/Durumlar";
import { KisayolPenceresi } from "../bilesenler/KisayolPenceresi";
import { KisiKarti, TakipSimgesi } from "../bilesenler/ofis/KisiKarti";
import { Simge } from "../bilesenler/Simge";
import { useSozluk } from "../dil";
import { git } from "../durum/arayuz";
import { ofisOlayDinle } from "../durum/olaylar";
import { projeVerisiniYukle, useVeri, type VeriDurumu } from "../durum/veri";
import { ofisMotoru } from "../ofis/bellek";
import type { AkisSatiri, KameraModu, OfisMotoru } from "../ofis/motor";
import { gorselleriIsit, varliklariYukle, yukluVarliklar, type Varliklar } from "../ofis/varliklar";
import { saat } from "../yardimcilar/bicim";
import { gorevKaydiOku } from "../yardimcilar/gorevKaydi";
import { useKisayollar } from "../yardimcilar/kisayol";

/** Şeritte tutulan son olay sayısı */
const SERIT_SINIRI = 10;
const SAYAC_SIRASI: AjanDurumu[] = ["calisiyor", "karar_bekliyor", "bosta", "duraklatildi", "hata", "kapali"];
const BOS_KIP: KameraModu = { yayin: false, takip: null, yayinda: null, azHareket: false };
/** Ok tuşlarıyla kaydırma adımı (piksel; haritanın kendi tuşlarıyla aynı) */
const KAYDIRMA = 80;

export function Ofis() {
  const s = useSozluk();
  const so = s.ofis;
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const proje = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId));
  const ajanlar = useVeri((d) => d.ajanlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const projeHatasi = useVeri((d) => d.projeHatasi);
  // Varlıklar bir kez yüklenir; ekran yeniden açılınca boş bir kare bile çizilmeden hazırdır
  const [varliklar, setVarliklar] = useState<Varliklar | null>(() => yukluVarliklar());
  const [varlikHatasi, setVarlikHatasi] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  /** Kişi kartı açık olan çalışan; ayrıntı çekmecesi karttan açılır */
  const [kartId, setKartId] = useState<string | null>(null);
  const [cekmeceId, setCekmeceId] = useState<string | null>(null);
  const [kisayolAcik, setKisayolAcik] = useState(false);
  const [akis, setAkis] = useState<AkisSatiri[]>([]);
  const [ozet, setOzet] = useState("");
  const [kip, setKip] = useState<KameraModu>(BOS_KIP);
  const alanRef = useRef<HTMLDivElement>(null);
  const ekranRef = useRef<HTMLDivElement>(null);
  const basRef = useRef<HTMLDivElement>(null);
  const seritRef = useRef<HTMLDivElement>(null);
  const motorRef = useRef<OfisMotoru | null>(null);
  const kartRef = useRef<HTMLDivElement>(null);
  /** Başlık ve şeridin yüksekliği: kamera her karede sorar; okumak yerleşimi zorlamasın diye önbellekte */
  const olcu = useRef({ ust: 0, alt: 0 });
  const ozetId = useId();
  const seritId = useId();
  const seritAciklamaId = useId();

  useEffect(() => {
    let iptal = false;
    setVarlikHatasi(null);
    varliklariYukle()
      .then((v) => {
        if (iptal) return;
        gorselleriIsit(v);
        setVarliklar(v);
      })
      .catch((e: unknown) => !iptal && setVarlikHatasi(hataMetni(e)));
    return () => {
      iptal = true;
    };
  }, [deneme]);

  // Motor: proje başına bir kez kurulur ve bellekte kalır; ekran açıkken takılı durur. Depo değişiklikleri ve
  // canlı olaylar doğrudan iletilir.
  useEffect(() => {
    const alan = alanRef.current;
    const ekran = ekranRef.current;
    if (!varliklar || !aktifProjeId || !alan || !ekran) return;
    const motor = ofisMotoru(aktifProjeId, varliklar);
    const olc = () => {
      olcu.current = { ust: basRef.current?.offsetHeight ?? 56, alt: seritRef.current?.offsetHeight ?? 0 };
    };
    olc();
    motor.bagla({
      alan,
      ekran,
      ustPay: () => olcu.current.ust + 6,
      altPay: () => olcu.current.alt + 4,
      cagrilar: {
        // Aynı kişiye yeniden basınca kart kapanır
        ajanSec: (id) => setKartId((k) => (k === id ? null : id)),
        git: (hedef, p) => git(hedef, p?.kanal ? { kanal: p.kanal } : {}),
        akis: (satir) => setAkis((a) => [satir, ...a].slice(0, SERIT_SINIRI)),
        ozet: setOzet,
        kamera: setKip,
      },
    });
    setAkis(motor.sonAkislar().slice(0, SERIT_SINIRI));
    setKip(motor.kameraModu());
    motorRef.current = motor;
    // Başlık ya da şerit büyüyüp küçülünce (dar ekranda satır kayınca) sahne yeniden sığsın
    const basGozlemci = new ResizeObserver(() => {
      const once = olcu.current;
      olc();
      if (Math.abs(olcu.current.ust - once.ust) < 2 && Math.abs(olcu.current.alt - once.alt) < 2) return;
      motor.ustDegisti();
    });
    if (basRef.current) basGozlemci.observe(basRef.current);
    if (seritRef.current) basGozlemci.observe(seritRef.current);
    const ilet = (d: VeriDurumu) => {
      if (d.aktifProjeId !== aktifProjeId) return;
      // Yükleme sürerken boş liste "herkes gitti" sayılmasın
      if (!d.ajanlar.length && d.projeYukleme !== "hazir") return;
      motor.veriGuncelle({ ajanlar: d.ajanlar, gorevler: d.gorevler, onaylar: d.onaylar });
    };
    ilet(useVeri.getState());
    const depoBirak = useVeri.subscribe((d, o) => {
      if (d.ajanlar !== o.ajanlar || d.gorevler !== o.gorevler || d.onaylar !== o.onaylar || d.projeYukleme !== o.projeYukleme) ilet(d);
    });
    const olayBirak = ofisOlayDinle((olay) => {
      switch (olay.tur) {
        case "mesaj.yeni":
          motor.mesajGeldi(olay.mesaj);
          break;
        case "hafiza.yeni":
          motor.hafizaGeldi(olay.kayit);
          break;
        case "soru.guncellendi":
          motor.soruGeldi(olay.soru);
          break;
        case "ajan.akis":
          motor.akisOgesi(olay.projeId, olay.oge);
          break;
        case "bildirim":
          motor.bildirimGeldi(olay.metin, olay.projeId);
          break;
        // 0.0.8 · Ortak çalışma: kayıt anı kaydedenin başında ve sunucu odasında, kalite denetimi laboratuvarda oynar
        case "gorev.kaydedildi": {
          const ozet = gorevKaydiOku(olay);
          if (ozet) motor.gorevKaydedildi(ozet);
          motor.kayitGeldi(olay.kayit);
          break;
        }
        case "kayit.guncellendi":
          motor.kayitGeldi(olay.kayit);
          break;
      }
    });
    // Haritada boş yere basınca kart kapanır (sürükleme tıklama sayılmaz: kamera yutar)
    const bosTik = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".ofis-kisi, [data-sicak], [data-onay-ajan]")) setKartId(null);
    };
    alan.addEventListener("click", bosTik);
    return () => {
      alan.removeEventListener("click", bosTik);
      basGozlemci.disconnect();
      depoBirak();
      olayBirak();
      motor.kartBagla(null, null);
      motor.ayir();
      motorRef.current = null;
      setAkis([]);
      setKartId(null);
      setCekmeceId(null);
      setKip(BOS_KIP);
    };
  }, [varliklar, aktifProjeId]);

  const kartAjan = ajanlar.find((a) => a.id === kartId);
  const secili = ajanlar.find((a) => a.id === cekmeceId);

  // Kart, seçili çalışanın yanında durur: konumunu motor yazar; çalışan ayrılınca kart kalkar
  useLayoutEffect(() => {
    motorRef.current?.kartBagla(kartAjan ? kartRef.current : null, kartAjan?.id ?? null);
  }, [kartAjan?.id, varliklar, aktifProjeId]);

  const kartiKapat = (odak = true) => {
    const id = kartId;
    setKartId(null);
    if (odak && id) motorRef.current?.kisiyeOdaklan(id);
  };

  // Tek tuşlu kısayollar: haritanın kendi tuşları (odaktayken) önce işler, burada harita odakta değilken de çalışır
  const m = () => motorRef.current;
  useKisayollar(
    {
      "?": () => setKisayolAcik(true),
      [s.canli.kisayol.yayinTusu]: () => {
        if (!kip.azHareket) m()?.yayinAc(!kip.yayin);
      },
      Escape: () => {
        if (kartId) kartiKapat();
        else if (kip.takip) m()?.takipEt(null);
        else if (kip.yayin) m()?.yayinAc(false);
      },
      "+": () => m()?.yakinlastir(1.3),
      "=": () => m()?.yakinlastir(1.3),
      "-": () => m()?.yakinlastir(1 / 1.3),
      _: () => m()?.yakinlastir(1 / 1.3),
      "0": () => m()?.sigdir(),
      ArrowLeft: () => m()?.kaydir(KAYDIRMA, 0),
      ArrowRight: () => m()?.kaydir(-KAYDIRMA, 0),
      ArrowUp: () => m()?.kaydir(0, KAYDIRMA),
      ArrowDown: () => m()?.kaydir(0, -KAYDIRMA),
    },
    !kisayolAcik && !cekmeceId,
  );
  const sayac = new Map<AjanDurumu, number>();
  for (const a of ajanlar) sayac.set(a.durum, (sayac.get(a.durum) ?? 0) + 1);

  return (
    <section className="ofis" aria-label={so.sahneEtiketi} aria-describedby={ozetId}>
      <p className="gizli" id={ozetId}>
        {ozet}
      </p>
      <div className="ofis-alan" ref={alanRef} tabIndex={0} role="group" aria-label={so.haritaEtiketi} />
      <div className="ofis-ekran" ref={ekranRef}>
        <div className="ofis-bas" ref={basRef}>
          <div className="ofis-baslik" data-kamera-disi>
            <h1>{so.baslik}</h1>
            <p className="ofis-proje">{proje?.ad ?? ""}</p>
            <ul className="ofis-sayac" aria-label={so.sayacEtiketi}>
              {SAYAC_SIRASI.filter((d) => sayac.get(d)).map((d) => (
                <li key={d} data-durum={d}>
                  <i aria-hidden="true" />
                  <b data-sayi>{sayac.get(d)}</b> {s.genel.ajanDurumu[d].toLocaleLowerCase(so.yerel)}
                </li>
              ))}
            </ul>
            <div className="ofis-mod" role="group" aria-label={so.kameraEtiketi}>
              <button
                type="button"
                className="dugme dugme-kucuk ofis-yayin-dugme"
                aria-pressed={kip.yayin}
                disabled={kip.azHareket}
                title={kip.azHareket ? so.yayinKapali : so.yayinIpucu}
                onClick={() => motorRef.current?.yayinAc(!kip.yayin)}
              >
                <i aria-hidden="true" />
                {so.yayin}
              </button>
              {kip.yayin ? <span className="ofis-yayinda tek-satir">{kip.yayinda ? so.yayinda(kip.yayinda) : so.yayinAriyor}</span> : null}
              {kip.takip ? (
                <span className="ofis-takip">
                  <TakipSimgesi />
                  <span className="tek-satir">{so.takipte(kip.takip.ad)}</span>
                  <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge" onClick={() => motorRef.current?.takipEt(null)} aria-label={so.takipBirak} title={so.takipBirak}>
                    <Simge ad="kapat" />
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="ofis-serit" ref={seritRef} data-kamera-disi>
          <h2 id={seritId}>
            <i aria-hidden="true" />
            {so.akisBaslik}
          </h2>
          <p className="gizli" id={seritAciklamaId}>
            {so.seritEtiketi}
          </p>
          <ol aria-labelledby={seritId} aria-describedby={seritAciklamaId}>
            {akis.length ? (
              akis.map((a) => {
                const ic = (
                  <>
                    <time dateTime={new Date(a.zaman).toISOString()}>{saat(new Date(a.zaman).toISOString())}</time>
                    <span className="tek-satir">{a.metin}</span>
                  </>
                );
                return (
                  <li key={a.id} data-tur={a.tur}>
                    {a.ajanId || a.nokta ? (
                      <button type="button" onClick={() => motorRef.current?.olayaGit(a)} aria-label={so.olayaGit(a.metin)} title={a.metin}>
                        {ic}
                      </button>
                    ) : (
                      <span className="ofis-serit-satir">{ic}</span>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="ofis-serit-bos">{so.akisBos}</li>
            )}
          </ol>
        </div>

        <div className="ofis-kontrol" data-kamera-disi role="group" aria-label={so.yakinlastirmaEtiketi}>
          <button type="button" className="dugme dugme-simge" onClick={() => motorRef.current?.yakinlastir(1.3)} aria-label={so.yakinlastir} title={so.yakinlastirIpucu}>
            <Simge ad="arti" />
          </button>
          <button type="button" className="dugme dugme-simge" onClick={() => motorRef.current?.yakinlastir(1 / 1.3)} aria-label={so.uzaklastir} title={so.uzaklastirIpucu}>
            <Simge ad="eksi" />
          </button>
          <button type="button" className="dugme dugme-simge" onClick={() => motorRef.current?.sigdir()} aria-label={so.sigdir} title={so.sigdirIpucu}>
            <Simge ad="sigdir" />
          </button>
          <button type="button" className="dugme dugme-simge kisayol-dugme" onClick={() => setKisayolAcik(true)} aria-label={s.canli.kisayol.ac} title={s.canli.kisayol.ac}>
            ?
          </button>
        </div>

        {kartAjan ? (
          <KisiKarti
            ajan={kartAjan}
            kokRef={kartRef}
            etkinlik={() => motorRef.current?.kisiEtkinligi(kartAjan.id) ?? ""}
            takipte={kip.takip?.id === kartAjan.id}
            takip={() => motorRef.current?.takipEt(kip.takip?.id === kartAjan.id ? null : kartAjan.id)}
            ayrinti={() => setCekmeceId(kartAjan.id)}
            kapat={() => kartiKapat()}
          />
        ) : null}

        {varlikHatasi ? (
          <div className="ofis-hata" data-kamera-disi>
            <HataKutu baslik={so.cizilemedi} metin={varlikHatasi} yeniden={() => setDeneme((n) => n + 1)} />
          </div>
        ) : yukleme === "hata" && !ajanlar.length ? (
          <div className="ofis-hata" data-kamera-disi>
            <HataKutu metin={projeHatasi ?? so.projeVerisiAlinamadi} yeniden={() => void projeVerisiniYukle()} />
          </div>
        ) : !varliklar || (yukleme === "yukleniyor" && !ajanlar.length) ? (
          <div className="ofis-yukleniyor" role="status">
            <span className="doner" aria-hidden="true" />
            {so.hazirlaniyor}
          </div>
        ) : null}
      </div>

      {secili ? (
        <Cekmece
          baslik={
            <>
              {secili.ad} <span className="soluk">· {secili.rolAdi}</span>
            </>
          }
          ust={
            <button
              type="button"
              className="dugme dugme-kucuk ofis-takip-dugme"
              title={so.takipEtIpucu(secili.ad)}
              onClick={() => {
                motorRef.current?.takipEt(secili.id);
                setCekmeceId(null);
              }}
            >
              <TakipSimgesi />
              {so.takipEt}
            </button>
          }
          kapat={() => setCekmeceId(null)}
          alt={
            <div className="ofis-hizli-mesaj">
              <MesajFormu key={secili.id} ajan={secili} satirlar={2} />
            </div>
          }
        >
          <AjanAyrinti ajan={secili} mesaj={false} />
        </Cekmece>
      ) : null}
      {kisayolAcik ? (
        <KisayolPenceresi
          baslik={s.canli.kisayol.ofisBaslik}
          kapat={() => setKisayolAcik(false)}
          satirlar={[
            { tuslar: ["+", "−"], aciklama: s.canli.kisayol.ofis.yakinlastir },
            { tuslar: ["0"], aciklama: s.canli.kisayol.ofis.sigdir },
            { tuslar: [s.canli.kisayol.oklar], aciklama: s.canli.kisayol.ofis.kaydir },
            { tuslar: [s.canli.kisayol.yayinTusu.toLocaleUpperCase(so.yerel)], aciklama: s.canli.kisayol.ofis.yayin },
            { tuslar: ["Esc"], aciklama: s.canli.kisayol.ofis.kapat },
            { tuslar: ["?"], aciklama: s.canli.kisayol.ofis.pencere },
          ]}
        />
      ) : null}
    </section>
  );
}
