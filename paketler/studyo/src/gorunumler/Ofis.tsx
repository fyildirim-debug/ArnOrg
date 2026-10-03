// Ofis: ajanların yaşadığı canlı 2D çalışma ortamı. Sahne React dışında (src/ofis) çalışır;
// bu bileşen motoru kurar, depo ve olay akışını ona iletir, çekmece ve başlık katmanlarını çizer.
import { AJAN_DURUM_ADLARI, type AjanDurumu } from "@arnorg/ortak";
import { useEffect, useId, useRef, useState } from "react";
import { hataMetni } from "../api/istek";
import { AjanAyrinti } from "../bilesenler/ajan/AjanAyrinti";
import { MesajFormu } from "../bilesenler/ajan/AjanEylemleri";
import { Cekmece } from "../bilesenler/Cekmece";
import { HataKutu } from "../bilesenler/Durumlar";
import { Simge } from "../bilesenler/Simge";
import { git } from "../durum/arayuz";
import { ofisOlayDinle } from "../durum/olaylar";
import { projeVerisiniYukle, useVeri, type VeriDurumu } from "../durum/veri";
import { OfisMotoru, type AkisSatiri } from "../ofis/motor";
import { gorselleriIsit, varliklariYukle, type Varliklar } from "../ofis/varliklar";
import { useMedya } from "../yardimcilar/kancalar";

const AKIS_SINIRI = 5;
const SAYAC_SIRASI: AjanDurumu[] = ["calisiyor", "karar_bekliyor", "bosta", "duraklatildi", "hata", "kapali"];

const saatBicimi = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function Ofis() {
  const aktifProjeId = useVeri((d) => d.aktifProjeId);
  const proje = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId));
  const ajanlar = useVeri((d) => d.ajanlar);
  const yukleme = useVeri((d) => d.projeYukleme);
  const projeHatasi = useVeri((d) => d.projeHatasi);
  const [varliklar, setVarliklar] = useState<Varliklar | null>(null);
  const [varlikHatasi, setVarlikHatasi] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [akis, setAkis] = useState<AkisSatiri[]>([]);
  const [ozet, setOzet] = useState("");
  const alanRef = useRef<HTMLDivElement>(null);
  const ekranRef = useRef<HTMLDivElement>(null);
  const basRef = useRef<HTMLDivElement>(null);
  const motorRef = useRef<OfisMotoru | null>(null);
  const ozetId = useId();
  const dar = useMedya("(max-width: 640px)");

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

  // Motor: proje başına bir kez kurulur; depo değişiklikleri ve canlı olaylar doğrudan iletilir
  useEffect(() => {
    const alan = alanRef.current;
    const ekran = ekranRef.current;
    if (!varliklar || !aktifProjeId || !alan || !ekran) return;
    const motor = new OfisMotoru({
      alan,
      ekran,
      varliklar,
      projeId: aktifProjeId,
      ustPay: () => (basRef.current?.offsetHeight ?? 56) + 6,
      cagrilar: {
        ajanSec: (id) => setSeciliId(id),
        git: (hedef, p) => git(hedef, p?.kanal ? { kanal: p.kanal } : {}),
        akis: (satir) => setAkis((a) => [satir, ...a].slice(0, AKIS_SINIRI)),
        ozet: setOzet,
      },
    });
    motorRef.current = motor;
    // Başlık (akış satırları) büyüyüp küçülünce sahne yeniden sığsın
    let sonYukseklik = basRef.current?.offsetHeight ?? 0;
    const basGozlemci = new ResizeObserver(() => {
      const h = basRef.current?.offsetHeight ?? 0;
      if (Math.abs(h - sonYukseklik) < 2) return;
      sonYukseklik = h;
      motor.ustDegisti();
    });
    if (basRef.current) basGozlemci.observe(basRef.current);
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
      }
    });
    return () => {
      basGozlemci.disconnect();
      depoBirak();
      olayBirak();
      motor.yokEt();
      motorRef.current = null;
      setAkis([]);
      setSeciliId(null);
    };
  }, [varliklar, aktifProjeId]);

  const secili = ajanlar.find((a) => a.id === seciliId);
  const sayac = new Map<AjanDurumu, number>();
  for (const a of ajanlar) sayac.set(a.durum, (sayac.get(a.durum) ?? 0) + 1);
  const gosterilenAkis = akis.slice(0, dar ? 3 : AKIS_SINIRI);

  return (
    <section className="ofis" aria-label="Ofis sahnesi" aria-describedby={ozetId}>
      <p className="gizli" id={ozetId}>
        {ozet}
      </p>
      <div className="ofis-alan" ref={alanRef} tabIndex={0} role="group" aria-label="Ofis haritası. Yakınlaştırmak için + ve -, sığdırmak için 0, kaydırmak için ok tuşları" />
      <div className="ofis-ekran" ref={ekranRef}>
        <div className="ofis-bas" ref={basRef}>
          <div className="ofis-baslik" data-kamera-disi>
            <h1>Ofis</h1>
            <p className="ofis-proje">{proje?.ad ?? ""}</p>
            <ul className="ofis-sayac" aria-label="Durumlara göre çalışanlar">
              {SAYAC_SIRASI.filter((d) => sayac.get(d)).map((d) => (
                <li key={d} data-durum={d}>
                  <i aria-hidden="true" />
                  <b>{sayac.get(d)}</b> {AJAN_DURUM_ADLARI[d].toLocaleLowerCase("tr-TR")}
                </li>
              ))}
            </ul>
          </div>
          <div className="ofis-akis" data-kamera-disi>
            <h2>
              <i aria-hidden="true" />
              Ofiste şimdi
            </h2>
            <ol aria-label="Son sahneler" style={{ minHeight: `${(dar ? 3 : AKIS_SINIRI) * 1.125}rem` }}>
              {gosterilenAkis.length ? (
                gosterilenAkis.map((s) => (
                  <li key={s.id} data-tur={s.tur}>
                    <time>{saatBicimi.format(s.zaman)}</time>
                    <span className="tek-satir">{s.metin}</span>
                  </li>
                ))
              ) : (
                <li className="ofis-akis-bos">Sakin. Biri konuşunca, iş teslim edince ya da kapıdan girince burada görünür.</li>
              )}
            </ol>
          </div>
        </div>

        <div className="ofis-kontrol" data-kamera-disi role="group" aria-label="Yakınlaştırma">
          <button type="button" className="dugme dugme-simge" onClick={() => motorRef.current?.yakinlastir(1.3)} aria-label="Yakınlaştır" title="Yakınlaştır (+)">
            <Simge ad="arti" />
          </button>
          <button type="button" className="dugme dugme-simge" onClick={() => motorRef.current?.yakinlastir(1 / 1.3)} aria-label="Uzaklaştır" title="Uzaklaştır (-)">
            <Simge ad="eksi" />
          </button>
          <button type="button" className="dugme dugme-simge" onClick={() => motorRef.current?.sigdir()} aria-label="Ofisi sığdır" title="Sığdır (0)">
            <Simge ad="sigdir" />
          </button>
        </div>

        {varlikHatasi ? (
          <div className="ofis-hata" data-kamera-disi>
            <HataKutu baslik="Ofis çizilemedi" metin={varlikHatasi} yeniden={() => setDeneme((n) => n + 1)} />
          </div>
        ) : yukleme === "hata" && !ajanlar.length ? (
          <div className="ofis-hata" data-kamera-disi>
            <HataKutu metin={projeHatasi ?? "Proje verisi alınamadı."} yeniden={() => void projeVerisiniYukle()} />
          </div>
        ) : !varliklar || (yukleme === "yukleniyor" && !ajanlar.length) ? (
          <div className="ofis-yukleniyor" role="status">
            <span className="doner" aria-hidden="true" />
            Ofis hazırlanıyor
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
          kapat={() => setSeciliId(null)}
          alt={
            <div className="ofis-hizli-mesaj">
              <MesajFormu key={secili.id} ajan={secili} satirlar={2} />
            </div>
          }
        >
          <AjanAyrinti ajan={secili} mesaj={false} />
        </Cekmece>
      ) : null}
    </section>
  );
}
