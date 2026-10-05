// Ana yasa: projenin kesin kuralları. Okunur belge görünümü, CEO ile hazırlanmamışsa boş hâl ve kurulun düzenleyicisi.
// Kaydedilen her sürüm her ajanın talimatının başına girer; makine kurallı maddeler denetim kapısında uygulanır.
import type { Anayasa, AnayasaKurali, AnayasaMaddesi } from "@arnorg/ortak";
import { useEffect, useMemo, useState } from "react";
import { hataMetni } from "../../api/istek";
import { api } from "../../api/uclar";
import { sozluk, useSozluk } from "../../dil";
import { ajanaGit, bildir, git } from "../../durum/arayuz";
import { anayasayiYukle, ceoBul, useVeri } from "../../durum/veri";
import {
  anayasaTaslagiBaslat,
  anayasaTaslagiKapat,
  desenleriAyir,
  taslakMaddeleriniAyarla,
  useAnayasaTaslagi,
  yeniTaslakMadde,
  type AnayasaTaslagi,
  type TaslakMadde,
} from "../../durum/zeka";
import { desenHatasi } from "../../yardimcilar/arac";
import { goreli, tarih } from "../../yardimcilar/bicim";
import { useIslem } from "../../yardimcilar/kancalar";
import { Bos, HataKutu, Iskelet } from "../Durumlar";
import { useTamOtonom } from "../KararYetkisi";
import { OnaySor } from "../OnaySor";
import { Simge } from "../Simge";

const HEDEFLER: AnayasaKurali["hedef"][] = ["komut", "yol", "url", "arac"];
const KARARLAR: AnayasaKurali["karar"][] = ["ret", "sor"];
/** Çekirdeğin sınırları */
const MADDE_SINIRI = 40;
const BASLIK_SINIRI = 120;
const METIN_SINIRI = 2000;

export function AnaYasa() {
  const t = useSozluk().zeka.anayasa;
  const pid = useVeri((d) => d.aktifProjeId);
  const anayasa = useVeri((d) => d.anayasa);
  const taslak = useAnayasaTaslagi((d) => (d.taslak && d.taslak.projeId === pid ? d.taslak : null));
  const [hata, setHata] = useState<string | null>(null);

  // Ekran her açılışta tazelenir; "anayasa.guncellendi" olayı da depoyu canlı günceller
  const yukle = () => {
    setHata(null);
    anayasayiYukle().catch((e: unknown) => setHata(hataMetni(e)));
  };
  useEffect(yukle, [pid]);

  if (taslak && pid) return <AnaYasaDuzenleyici pid={pid} taslak={taslak} anayasa={anayasa} />;
  if (!anayasa) return hata ? <HataKutu metin={hata} yeniden={yukle} /> : <Iskelet satir={8} etiket={t.yukleniyor} />;
  return <AnaYasaBelgesi anayasa={anayasa} />;
}

// ---------------------------------------------------------------------------
// Belge görünümü
// ---------------------------------------------------------------------------

function AnaYasaBelgesi({ anayasa }: { anayasa: Anayasa }) {
  const s = useSozluk();
  const t = s.zeka.anayasa;
  const otonom = useTamOtonom();
  const pid = useVeri((d) => d.aktifProjeId);
  const projeAd = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId)?.ad);
  const ajanlar = useVeri((d) => d.ajanlar);
  const oneri = useVeri((d) => d.onaylar.find((o) => o.tur === "anayasa" && o.durum === "bekliyor"));
  const ceo = ceoBul(ajanlar);
  const duzenle = () => pid && anayasaTaslagiBaslat(pid, anayasa.surum, anayasa.maddeler);
  const kapida = anayasa.maddeler.filter((m) => m.kural).length;

  const oneriKutusu = oneri ? (
    <div className="uyari-kutu anayasa-oneri" role="status">
      <span>
        {t.oneriBekliyor}: <b>{oneri.baslik}</b>
      </span>
      <button type="button" className="dugme dugme-kucuk itele" onClick={() => git("onaylar")}>
        {t.oneriyiIncele}
      </button>
    </div>
  ) : null;

  if (!anayasa.maddeler.length) {
    return (
      <section className="anayasa" aria-label={s.zeka.sekme.anayasa}>
        {oneriKutusu}
        <Bos
          baslik={t.bosBaslik}
          eylem={
            <>
              <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={() => git("karargah")}>
                <Simge ad="karargah" boyut={12} />
                {t.karargah}
              </button>
              {ceo ? (
                <button type="button" className="dugme dugme-kucuk" onClick={() => ajanaGit(ceo.id)}>
                  <Simge ad="mesaj" boyut={12} />
                  {t.ceoyaYaz(ceo.ad)}
                </button>
              ) : null}
              <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={duzenle}>
                <Simge ad="duzenle" boyut={12} />
                {t.kendimYazayim}
              </button>
            </>
          }
        >
          {t.bosMetin(otonom)}
        </Bos>
      </section>
    );
  }

  return (
    <article className="anayasa" aria-labelledby="anayasa-baslik">
      {oneriKutusu}
      <header className="anayasa-ust">
        <div className="anayasa-kimlik">
          <h2 className="anayasa-baslik" id="anayasa-baslik">
            {projeAd ? t.belgeAdi(projeAd) : s.zeka.sekme.anayasa}
          </h2>
          <p className="anayasa-kunye">
            <span className="anayasa-surum">{t.surum(anayasa.surum)}</span>
            {anayasa.guncelleme ? (
              <time dateTime={anayasa.guncelleme} title={tarih(anayasa.guncelleme)}>
                {t.guncellendi(goreli(anayasa.guncelleme))}
              </time>
            ) : null}
            {anayasa.onaylayan ? <span>{t.onaylayan(anayasa.onaylayan)}</span> : null}
            <span>
              {t.maddeSayisi(anayasa.maddeler.length)}
              {kapida ? ` · ${t.kapidaSayisi(kapida)}` : ""}
            </span>
          </p>
        </div>
        <button type="button" className="dugme dugme-kucuk" onClick={duzenle}>
          <Simge ad="duzenle" boyut={12} />
          {s.genel.duzenle}
        </button>
      </header>
      <p className="anayasa-aciklama">{t.aciklama}</p>
      <ol className="madde-liste" aria-label={t.maddeler}>
        {anayasa.maddeler.map((m) => (
          <Madde key={m.no} madde={m} />
        ))}
      </ol>
    </article>
  );
}

function Madde({ madde }: { madde: AnayasaMaddesi }) {
  const t = useSozluk().zeka.anayasa;
  return (
    <li className="madde" id={`madde-${madde.no}`}>
      <span className="madde-no" aria-hidden="true">
        {madde.no}
      </span>
      <div className="madde-govde">
        <h3 className="madde-baslik">
          <span className="gizli">{t.maddeEtiketi(madde.no)}: </span>
          {madde.baslik}
        </h3>
        <p className="madde-metin">{madde.metin}</p>
        {madde.kural ? <KapiSatiri kural={madde.kural} /> : null}
      </div>
    </li>
  );
}

/** Makine kuralı: denetim kapısında neye bakılır, eşleşince ne olur, hangi desenler */
function KapiSatiri({ kural }: { kural: AnayasaKurali }) {
  const s = useSozluk();
  const t = s.zeka.anayasa;
  return (
    <div className="kapi" title={t.kapiIpucu}>
      <p className="kapi-ust">
        <span className="kapi-ad">
          <Simge ad="kilit" boyut={12} />
          {t.kapi}
        </span>
        <span className="kapi-hedef">{s.denetim.kural.hedefler[kural.hedef]}</span>
        <Simge ad="sag" boyut={10} className="kapi-ok" />
        <span className={`kapi-karar kapi-karar-${kural.karar}`}>{t.kararSonuc[kural.karar]}</span>
      </p>
      <ul className="kapi-desenler" aria-label={t.desenler}>
        {kural.desenler.map((d, i) => (
          <li key={`${i}-${d}`}>
            <code>{d}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Düzenleyici
// ---------------------------------------------------------------------------

interface MaddeHatalari {
  baslik: boolean;
  metin: boolean;
  desenYok: boolean;
  /** Geçersiz düzenli ifadeler: desen ve tarayıcının verdiği neden */
  desenler: { desen: string; neden: string }[];
}

/** Tarayıcının iletisinden yalnız neden: "Invalid regular expression: /(abc/i: Unterminated group" → "Unterminated group" */
function desenNedeni(ileti: string): string {
  const i = ileti.lastIndexOf(": ");
  return i >= 0 ? ileti.slice(i + 2) : ileti;
}

function maddeHatalari(m: TaslakMadde): MaddeHatalari {
  const desenler = m.kural ? desenleriAyir(m.desenMetni) : [];
  return {
    baslik: !m.baslik.trim(),
    metin: !m.metin.trim(),
    desenYok: !!m.kural && desenler.length === 0,
    desenler: desenler.flatMap((d) => {
      const h = desenHatasi(d);
      return h === null ? [] : [{ desen: d, neden: desenNedeni(h) }];
    }),
  };
}

/** Hiç dokunulmamış madde (başlık, metin, kural yok): kaydederken atılır, hata sayılmaz */
function bosMadde(m: TaslakMadde): boolean {
  return !m.baslik.trim() && !m.metin.trim() && !m.kural;
}

const HATASIZ: MaddeHatalari = { baslik: false, metin: false, desenYok: false, desenler: [] };

/** Kaydedilecek biçim; değişiklik denetimi de bununla yapılır */
function govde(maddeler: TaslakMadde[]): Omit<AnayasaMaddesi, "no">[] {
  return maddeler.map((m) => ({
    baslik: m.baslik.trim(),
    metin: m.metin.trim(),
    kural: m.kural ? { hedef: m.kural.hedef, desenler: desenleriAyir(m.desenMetni), karar: m.kural.karar } : null,
  }));
}

function anayasaGovdesi(a: Anayasa | null): Omit<AnayasaMaddesi, "no">[] {
  return (a?.maddeler ?? []).map((m) => ({ baslik: m.baslik, metin: m.metin, kural: m.kural ? { hedef: m.kural.hedef, desenler: m.kural.desenler, karar: m.kural.karar } : null }));
}

function AnaYasaDuzenleyici({ pid, taslak, anayasa }: { pid: string; taslak: AnayasaTaslagi; anayasa: Anayasa | null }) {
  const s = useSozluk();
  const t = s.zeka.anayasa;
  const [denendi, setDenendi] = useState(false);
  const [vazgecSor, setVazgecSor] = useState(false);
  const [yeniAnahtar, setYeniAnahtar] = useState<string | null>(null);
  const { suruyor, hata, calistir } = useIslem();
  const maddeler = taslak.maddeler;

  // Dokunulmamış boş maddeler kaydedilmez; değişiklik ve hata sayılmaz
  const dolu = useMemo(() => maddeler.filter((m) => !bosMadde(m)), [maddeler]);
  const hatalar = useMemo(() => maddeler.map((m) => (bosMadde(m) ? HATASIZ : maddeHatalari(m))), [maddeler]);
  // Desen hataları hemen, boş alanlar ilk kayıt denemesinden sonra gösterilir; ikisi de kaydı durdurur
  const hataliMadde = hatalar.filter((h) => h.desenler.length || h.baslik || h.metin || h.desenYok).length;
  const kirli = useMemo(() => JSON.stringify(govde(dolu)) !== JSON.stringify(anayasaGovdesi(anayasa)), [dolu, anayasa]);
  const surumDegisti = anayasa !== null && anayasa.surum !== taslak.tabanSurum;
  const yeniSurum = (anayasa?.surum ?? taslak.tabanSurum) + 1;

  const guncelle = (anahtar: string, d: Partial<TaslakMadde>) => taslakMaddeleriniAyarla((l) => l.map((m) => (m.anahtar === anahtar ? { ...m, ...d } : m)));
  const tasi = (i: number, yon: -1 | 1) =>
    taslakMaddeleriniAyarla((l) => {
      const j = i + yon;
      if (j < 0 || j >= l.length) return l;
      const k = l.slice();
      [k[i], k[j]] = [k[j]!, k[i]!];
      return k;
    });
  const ekle = () => {
    const m = yeniTaslakMadde();
    setYeniAnahtar(m.anahtar);
    taslakMaddeleriniAyarla((l) => [...l, m]);
  };

  const kapat = () => {
    anayasaTaslagiKapat();
    document.getElementById("ana-icerik")?.scrollTo({ top: 0 });
  };

  const kaydet = () => {
    setDenendi(true);
    if (!dolu.length || hataliMadde) return;
    void calistir(
      "kaydet",
      async () => {
        const yeni = await api.anayasaKaydet(pid, govde(dolu));
        if (useVeri.getState().aktifProjeId === pid) useVeri.setState({ anayasa: yeni });
        kapat();
        bildir("basari", sozluk().zeka.anayasa.yururlukte(yeni.surum));
      },
      true,
    );
  };

  const durumMetni =
    denendi && hataliMadde ? t.hata.ozet(hataliMadde) : !dolu.length && (kirli || denendi) ? t.hata.maddeYok : kirli ? t.kaydedilmemis : t.degisiklikYok;

  return (
    <section className="anayasa anayasa-duzen" aria-labelledby="anayasa-duzen-baslik">
      <header className="anayasa-ust">
        <div className="anayasa-kimlik">
          <h2 className="anayasa-baslik" id="anayasa-duzen-baslik">
            {t.duzenBaslik}
          </h2>
          <p className="anayasa-kunye">{t.duzenAciklama(yeniSurum)}</p>
        </div>
      </header>

      {surumDegisti && anayasa ? (
        <div className="uyari-kutu" role="status">
          <span>{t.surumDegisti(anayasa.surum)}</span>
          <button type="button" className="dugme dugme-kucuk itele" onClick={() => anayasaTaslagiBaslat(pid, anayasa.surum, anayasa.maddeler)}>
            {t.yeniSurumdenBasla}
          </button>
        </div>
      ) : null}

      <ol className="madde-liste madde-liste-duzen">
        {maddeler.map((m, i) => (
          <MaddeDuzen
            key={m.anahtar}
            madde={m}
            no={i + 1}
            toplam={maddeler.length}
            hatalar={hatalar[i]!}
            denendi={denendi}
            odakla={m.anahtar === yeniAnahtar}
            guncelle={(d) => guncelle(m.anahtar, d)}
            tasi={(yon) => tasi(i, yon)}
            sil={() => taslakMaddeleriniAyarla((l) => l.filter((x) => x.anahtar !== m.anahtar))}
          />
        ))}
      </ol>

      <div className="anayasa-ekle">
        <button type="button" className="dugme dugme-kucuk" onClick={ekle} disabled={maddeler.length >= MADDE_SINIRI}>
          <Simge ad="arti" boyut={12} />
          {t.maddeEkle}
        </button>
        {maddeler.length >= MADDE_SINIRI ? <span className="alan-ipucu">{t.maddeSiniri}</span> : null}
      </div>

      {hata ? <HataKutu baslik={t.kaydedilemedi} metin={hata} /> : null}

      <div className="anayasa-alt">
        {vazgecSor ? (
          <OnaySor evetMetni={t.vazgecEvet} evet={kapat} vazgec={() => setVazgecSor(false)}>
            {t.vazgecSor}
          </OnaySor>
        ) : (
          <>
            <span className="anayasa-alt-durum" role="status" data-hata={(denendi && hataliMadde > 0) || undefined}>
              {durumMetni}
            </span>
            <div className="dugme-satir itele">
              <button type="button" className="dugme dugme-sessiz dugme-kucuk" onClick={() => (kirli ? setVazgecSor(true) : kapat())}>
                {s.genel.vazgec}
              </button>
              <button type="button" className="dugme dugme-ana dugme-kucuk" onClick={kaydet} disabled={suruyor !== null || !kirli || !dolu.length}>
                {suruyor ? <span className="doner" aria-hidden="true" /> : <Simge ad="kaydet" boyut={12} />}
                {t.kaydet}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MaddeDuzen({
  madde,
  no,
  toplam,
  hatalar,
  denendi,
  odakla,
  guncelle,
  tasi,
  sil,
}: {
  madde: TaslakMadde;
  no: number;
  toplam: number;
  hatalar: MaddeHatalari;
  denendi: boolean;
  odakla: boolean;
  guncelle: (d: Partial<TaslakMadde>) => void;
  tasi: (yon: -1 | 1) => void;
  sil: () => void;
}) {
  const s = useSozluk();
  const t = s.zeka.anayasa;
  const id = madde.anahtar;
  const ilk = no === 1;
  const son = no === toplam;
  const baslikHatasi = denendi && hatalar.baslik;
  const metinHatasi = denendi && hatalar.metin;

  return (
    <li className="madde madde-duzen" aria-label={t.maddeEtiketi(no)}>
      <span className="madde-no" aria-hidden="true">
        {no}
      </span>
      <div className="madde-govde">
        <div className="alan">
          <label htmlFor={`mb-${id}`}>{t.baslik}</label>
          <input
            id={`mb-${id}`}
            className="girdi madde-baslik-girdi"
            value={madde.baslik}
            maxLength={BASLIK_SINIRI}
            placeholder={t.baslikOrnek}
            autoFocus={odakla}
            aria-invalid={baslikHatasi || undefined}
            onChange={(e) => guncelle({ baslik: e.target.value })}
          />
          {baslikHatasi ? <span className="alan-hata">{t.hata.baslik}</span> : null}
        </div>
        <div className="alan">
          <label htmlFor={`mm-${id}`}>{t.metin}</label>
          <textarea
            id={`mm-${id}`}
            className="metin-alani"
            rows={3}
            value={madde.metin}
            maxLength={METIN_SINIRI}
            placeholder={t.metinOrnek}
            aria-invalid={metinHatasi || undefined}
            onChange={(e) => guncelle({ metin: e.target.value })}
          />
          {metinHatasi ? <span className="alan-hata">{t.hata.metin}</span> : null}
        </div>
        {madde.kural ? (
          <KuralDuzen madde={madde} hatalar={hatalar} denendi={denendi} guncelle={guncelle} />
        ) : (
          <button type="button" className="metin-dugme madde-kural-ekle" title={t.kuralEkleIpucu} onClick={() => guncelle({ kural: { hedef: "komut", karar: "ret" } })}>
            <Simge ad="kilit" boyut={12} />
            {t.kuralEkle}
          </button>
        )}
      </div>
      <div className="madde-eylem">
        <button
          type="button"
          className="dugme dugme-sessiz dugme-kucuk dugme-simge"
          aria-label={t.yukari(no)}
          title={t.yukari(no)}
          aria-disabled={ilk || undefined}
          onClick={() => !ilk && tasi(-1)}
        >
          <Simge ad="asagi" boyut={12} className="simge-ters" />
        </button>
        <button
          type="button"
          className="dugme dugme-sessiz dugme-kucuk dugme-simge"
          aria-label={t.asagi(no)}
          title={t.asagi(no)}
          aria-disabled={son || undefined}
          onClick={() => !son && tasi(1)}
        >
          <Simge ad="asagi" boyut={12} />
        </button>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk dugme-simge madde-sil" aria-label={t.sil(no)} title={t.sil(no)} onClick={sil}>
          <Simge ad="cop" boyut={12} />
        </button>
      </div>
    </li>
  );
}

function KuralDuzen({
  madde,
  hatalar,
  denendi,
  guncelle,
}: {
  madde: TaslakMadde;
  hatalar: MaddeHatalari;
  denendi: boolean;
  guncelle: (d: Partial<TaslakMadde>) => void;
}) {
  const s = useSozluk();
  const t = s.zeka.anayasa;
  const kural = madde.kural!;
  const id = madde.anahtar;
  const satirSayisi = madde.desenMetni.split("\n").length;
  const desenHatali = hatalar.desenler.length > 0 || (denendi && hatalar.desenYok);

  return (
    <fieldset className="kural-alan">
      <legend>
        <Simge ad="kilit" boyut={12} />
        {t.kuralBaslik}
      </legend>
      <p className="alan-ipucu kural-alan-aciklama">{t.kuralAciklama}</p>
      <div className="kural-alan-ust">
        <div className="alan">
          <label htmlFor={`kh-${id}`}>{t.hedef}</label>
          <select id={`kh-${id}`} className="secim" value={kural.hedef} onChange={(e) => guncelle({ kural: { ...kural, hedef: e.target.value as AnayasaKurali["hedef"] } })}>
            {HEDEFLER.map((h) => (
              <option key={h} value={h}>
                {s.denetim.kural.hedefler[h]}
              </option>
            ))}
          </select>
        </div>
        <div className="alan">
          <span className="alan-ad" id={`kk-${id}`}>
            {t.kararAdi}
          </span>
          <div className="bolumlu" role="group" aria-labelledby={`kk-${id}`}>
            {KARARLAR.map((k) => (
              <button key={k} type="button" aria-pressed={kural.karar === k} onClick={() => guncelle({ kural: { ...kural, karar: k } })} data-karar={k}>
                {t.kararSecenek[k]}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="dugme dugme-sessiz dugme-kucuk kural-alan-kaldir" onClick={() => guncelle({ kural: null })}>
          {t.kuralKaldir}
        </button>
      </div>
      <div className="alan">
        <label htmlFor={`kd-${id}`}>{t.desenler}</label>
        <textarea
          id={`kd-${id}`}
          className="metin-alani kod-alani"
          rows={Math.min(8, Math.max(2, satirSayisi + 1))}
          value={madde.desenMetni}
          spellCheck={false}
          placeholder={t.desenOrnek}
          aria-invalid={desenHatali || undefined}
          aria-describedby={`kdi-${id}`}
          onChange={(e) => guncelle({ desenMetni: e.target.value })}
        />
        <span className="alan-ipucu" id={`kdi-${id}`}>
          {t.desenlerIpucu}
        </span>
        {hatalar.desenler.map((h, i) => (
          <span key={`${i}-${h.desen}`} className="alan-hata desen-hata">
            <code>{h.desen}</code> {t.gecersizDesen(h.neden)}
          </span>
        ))}
        {denendi && hatalar.desenYok ? <span className="alan-hata">{t.hata.desenYok}</span> : null}
      </div>
    </fieldset>
  );
}
