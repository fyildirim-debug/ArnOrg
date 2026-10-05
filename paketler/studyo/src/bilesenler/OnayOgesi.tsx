// Tek onay. Bekleyende: ne isteniyor (tür + başlık), kim istiyor, ne zaman, ne kadar süresi kaldı; gerekçe,
// türe göre ayrıntı, onaylanırsa ne olacağı ve karar düğmeleri. Sonuçlananda: sakin, açılır bir geçmiş satırı.
// Ekip ekranı işe alım tekliflerini de bununla gösterir; dar kapta (container query) tek sütuna iner.
// Ana yasa önerisinde maddeler ve makine kuralları, işten çıkarmada kim ve devralan, teslimde özet, test adımları,
// çalıştır komutu, adres ve "Test et" aynı defter düzeninde çizilir. 0.0.7'den kalan birleştirme onayı geçmişte okunur
// kalır: altında kalite kapısı satırı (KaliteKapisi.tsx) durur, dalın farkı açılabilir. Tam otonomda CEO'yu bekleyen onayda kurulun
// düğmeleri ikincildir; sonuçlananda kararı veren (CEO, kurul, otomatik) ve gerekçesi görünür (KararYetkisi.tsx).
import { rolMetni, type Ajan, type AnayasaMaddesi, type Dil, type Gorev, type Onay, type Rol } from "@arnorg/ortak";
import { karakterBul, karakterMetni } from "@arnorg/ortak/karakterler";
import { useId, useState, type ReactNode } from "react";
import { api } from "../api/uclar";
import { sozluk, useDil, useSozluk, type Sozluk } from "../dil";
import { ajanaGit, bildir, git } from "../durum/arayuz";
import { testiAc, useSohbet } from "../durum/sohbet";
import { rolModeli, useModelKatalogu } from "../durum/modeller";
import { calismaKoku } from "../durum/ortakCalisma";
import { ceoBul, onayUygula, useVeri } from "../durum/veri";
import type { Varliklar } from "../ofis/varliklar";
import { aracAdi, aracSinifi, girdiOzeti } from "../yardimcilar/arac";
import { akilliZaman, goreli, kalanSure, sayi } from "../yardimcilar/bicim";
import { useIslem, useSimdi } from "../yardimcilar/kancalar";
import { FarkAc, KaliteDurumu, kaliteKaydi } from "./KaliteKapisi";
import { CeoKararVeriyor, KararVerenEtiketi } from "./KararYetkisi";
import { ceoyuBekliyor, kararGerekcesi, kararVereni } from "./kararVeren";
import { KarakterPortresi, useKarakterKatalogu } from "./KarakterSecici";
import { AjanAvatar, modelAdi } from "./Kisi";
import { anayasaVerisi, ilkParagraf, istenCikarmaVerisi, TESLIM_ALANLARI, teslimVerisi } from "./onayVerisi";
import { OnaySecenekListesi, OnaySecimi } from "./secenek/OnaySecimi";
import { onaySecenekleri } from "../yardimcilar/secenek";
import { Simge } from "./Simge";
import { TeslimKarari } from "./TestPaneli";
import { kisaToken, TavanOlcer, TOKEN_TAVANI_ALANLARI, tokenTavaniVerisi } from "./TokenTavani";

/** Kalan süre bunun altına inince öğe acil görünür */
const ACIL_MS = 60_000;

// ---------------------------------------------------------------------------
// Onay verisi: sözleşme `veri` alanını tiplemiyor; bilinen alanlar türe göre okunur, kalanlar olduğu gibi gösterilir
// ---------------------------------------------------------------------------

type Kayit = Record<string, unknown>;

function kayit(v: unknown): Kayit {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Kayit) : {};
}

function dize(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function sayiMi(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bosMu(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
}

/** Ayrıntı listesindeki bir satır */
interface Alan {
  /** Onay verisindeki alan adı; React anahtarı */
  k: string;
  etiket: string;
  deger: ReactNode;
  /** Satırın tamamını kaplar: komut, talimat, seçenekler */
  genis?: boolean;
}

interface Baglam {
  s: Sozluk;
  dil: Dil;
  ajanlar: Ajan[];
  gorevler: Gorev[];
  roller: Rol[];
  /** Projenin varsayılan dalı: eski birleştirmenin hedefi veride yoksa */
  anaDal: string | null;
}

function useBaglam(): Baglam {
  const s = useSozluk();
  const dil = useDil();
  const ajanlar = useVeri((d) => d.ajanlar);
  const gorevler = useVeri((d) => d.gorevler);
  const roller = useVeri((d) => d.roller);
  const anaDal = useVeri((d) => d.projeler.find((p) => p.id === d.aktifProjeId)?.varsayilanDal ?? null);
  // İşe alım teklifindeki model sürümlü adıyla görünür; katalog gelince yeniden çizilir
  useModelKatalogu();
  return { s, dil, ajanlar, gorevler, roller, anaDal };
}

function ajanEtiketi(a: Ajan): string {
  return `${a.ad} · ${a.rolAdi}`;
}

function GorevBagi({ id, gorevler }: { id: string; gorevler: Gorev[] }) {
  const g = gorevler.find((x) => x.id === id);
  if (!g) return <code>{id}</code>;
  return (
    <span>
      <button type="button" className="gorev-kodu" onClick={() => git("pano", { gorevId: g.id })}>
        {g.kod}
      </button>{" "}
      {g.baslik}
    </span>
  );
}

/** Türe özgü okunmayan alanlar: bilinenler insanca, kalanlar ham biçimde */
function genelAlanlar(v: Kayit, kullanilan: Set<string>, b: Baglam): Alan[] {
  const etiketler = b.s.onaylar.alan as Record<string, string>;
  const alanlar: Alan[] = [];
  for (const [k, deger] of Object.entries(v)) {
    if (kullanilan.has(k) || bosMu(deger)) continue;
    const etiket = etiketler[k] ?? k;
    if ((k === "yoneticiId" || k === "ajanId" || k === "isteyenId") && typeof deger === "string") {
      const a = b.ajanlar.find((x) => x.id === deger);
      alanlar.push({ k, etiket, deger: a ? ajanEtiketi(a) : deger });
    } else if (k === "gorevId" && typeof deger === "string") {
      alanlar.push({ k, etiket, deger: <GorevBagi id={deger} gorevler={b.gorevler} />, genis: true });
    } else if (k === "rol" && typeof deger === "string") {
      const r = b.roller.find((x) => x.kimlik === deger);
      alanlar.push({ k, etiket, deger: r ? rolMetni(r, b.dil).ad : deger });
    } else if (k === "model" && typeof deger === "string") {
      alanlar.push({ k, etiket, deger: modelAdi(deger) });
    } else if ((k === "dal" || k === "hedefDal") && typeof deger === "string") {
      alanlar.push({ k, etiket, deger: <code>{deger}</code> });
    } else if (typeof deger === "string") {
      alanlar.push({ k, etiket, deger: <span className="onay-metin">{deger}</span>, genis: deger.length > 48 || deger.includes("\n") });
    } else if (typeof deger === "number" || typeof deger === "boolean") {
      alanlar.push({ k, etiket, deger: typeof deger === "number" ? sayi(deger) : String(deger) });
    } else if (Array.isArray(deger) && deger.every((x) => typeof x === "string")) {
      alanlar.push({ k, etiket, deger: deger.join(", "), genis: true });
    } else if (deger && typeof deger === "object" && typeof (deger as Kayit).command === "string") {
      alanlar.push({ k, etiket, deger: <pre className="komut">{String((deger as Kayit).command)}</pre>, genis: true });
    } else {
      alanlar.push({ k, etiket, deger: <code className="onay-json">{JSON.stringify(deger)}</code>, genis: true });
    }
  }
  return alanlar;
}

/** Bir onayın okunur hâli: gerekçe, türe göre ayrıntı ve onaylanırsa ne olacağı */
interface OnayGorunumu {
  gerekce: string | null;
  alanlar: Alan[];
  etki: string;
}

function gorunumKur(onay: Onay, ajan: Ajan | undefined, b: Baglam, katalog: Varliklar | null): OnayGorunumu {
  const { s } = b;
  const t = s.onaylar;
  const v = kayit(onay.veri);
  const kullanilan = new Set<string>();
  const alanlar: Alan[] = [];
  const ekle = (alan: Alan, ...anahtarlar: string[]) => {
    alanlar.push(alan);
    for (const k of anahtarlar.length ? anahtarlar : [alan.k]) kullanilan.add(k);
  };
  const kisi = ajan?.ad ?? (onay.ajanId ? t.bilinmeyenAjan : s.genel.arnorg);
  let gerekce = dize(onay.ayrinti);
  let etki = "";

  switch (onay.tur) {
    case "ise_alim": {
      const ad = dize(v.ad) ?? "?";
      const rolKimligi = dize(v.rol);
      const rol = rolKimligi ? b.roller.find((r) => r.kimlik === rolKimligi) : undefined;
      const rolAdi = rol ? rolMetni(rol, b.dil).ad : (rolKimligi ?? "?");
      ekle({ k: "ad", etiket: t.alan.aday, deger: <b>{ad}</b> });
      ekle({ k: "rol", etiket: t.alan.rol, deger: rolAdi });

      const model = dize(v.model);
      if (model) ekle({ k: "model", etiket: t.alan.model, deger: modelAdi(model) });
      else if (rol) ekle({ k: "model", etiket: t.alan.model, deger: `${modelAdi(rolModeli(rol.varsayilanModel))} · ${t.rolVarsayilani}` });

      // Yönetici: kimlik, ad ya da açıkça null (kurul); hiç yoksa sunucu teklif edeni bağlar
      let yonetici: Ajan | undefined;
      let yoneticiAdi: string | null;
      if (typeof v.yoneticiId === "string") {
        const id = v.yoneticiId;
        yonetici = b.ajanlar.find((a) => a.id === id);
        yoneticiAdi = yonetici?.ad ?? id;
      } else if (dize(v.yoneticiAd)) {
        const yAd = dize(v.yoneticiAd)!;
        yonetici = b.ajanlar.find((a) => a.ad === yAd);
        yoneticiAdi = yAd;
      } else if ("yoneticiId" in v) {
        yoneticiAdi = null;
      } else {
        yonetici = ajan;
        yoneticiAdi = ajan?.ad ?? null;
      }
      ekle(
        { k: "yoneticiId", etiket: t.alan.yoneticiId, deger: yonetici ? ajanEtiketi(yonetici) : (yoneticiAdi ?? s.genel.kurul) },
        "yoneticiId",
        "yoneticiAd",
      );

      const karakterId = dize(v.karakter);
      if (karakterId) {
        const varlik = katalog?.karakterler.find((k) => k.id === karakterId);
        const tanim = karakterBul(karakterId);
        ekle({
          k: "karakter",
          etiket: t.alan.karakter,
          deger: (
            <span className="onay-karakter">
              {varlik ? (
                <span className="av av-s av-portre" aria-hidden="true">
                  <KarakterPortresi karakter={varlik} />
                </span>
              ) : null}
              {tanim ? karakterMetni(tanim, b.dil).lakap : karakterId}
            </span>
          ),
        });
      } else {
        ekle({ k: "karakter", etiket: t.alan.karakter, deger: <span className="soluk">{t.karakterOtomatik}</span> });
      }

      const talimat = dize(v.talimatEki);
      if (talimat) ekle({ k: "talimatEki", etiket: t.alan.talimatEki, deger: <span className="onay-metin">{talimat}</span>, genis: true });
      else kullanilan.add("talimatEki");

      etki = t.etki.iseAlim(ad, rolAdi, yoneticiAdi);
      break;
    }

    case "birlestirme": {
      const dal = dize(v.dal);
      const hedef = dize(v.hedefDal) ?? b.anaDal ?? "main";
      if (dal) {
        ekle(
          {
            k: "dal",
            etiket: t.alan.dal,
            deger: (
              <span className="onay-dal">
                <code>{dal}</code>
                <span className="onay-ok">→</span>
                <code>{hedef}</code>
                {/* Kalite kapısı satırı olan onayda fark oradan açılır */}
                {onay.durum === "onaylandi" && kaliteKaydi(onay) ? null : <FarkAc onay={onay} metin />}
              </span>
            ),
            genis: true,
          },
          "dal",
          "hedefDal",
        );
      }
      const dosya = sayiMi(v.dosyaSayisi);
      const eklenen = sayiMi(v.eklenen);
      const silinen = sayiMi(v.silinen);
      if (dosya !== null || eklenen !== null || silinen !== null) {
        ekle(
          {
            k: "degisiklik",
            etiket: t.alan.degisiklik,
            deger: (
              <span className="onay-fark">
                {dosya !== null ? <span>{t.dosya(dosya)}</span> : null}
                {eklenen !== null ? <span className="onay-eklenen">+{sayi(eklenen)}</span> : null}
                {silinen !== null ? <span className="onay-silinen">−{sayi(silinen)}</span> : null}
              </span>
            ),
          },
          "dosyaSayisi",
          "eklenen",
          "silinen",
        );
      }
      const testler = dize(v.testler);
      if (testler) ekle({ k: "testler", etiket: t.alan.testler, deger: testler });
      if (typeof v.gorevId === "string") ekle({ k: "gorevId", etiket: t.alan.gorevId, deger: <GorevBagi id={v.gorevId} gorevler={b.gorevler} /> });
      // Dalın sahibi isteyenden farklıysa (inceleyici başkasının dalını önerdiyse) ayrıca anılır
      if (typeof v.ajanId === "string") {
        const sahipId = v.ajanId;
        const sahip = b.ajanlar.find((a) => a.id === sahipId);
        if (sahipId !== onay.ajanId) ekle({ k: "ajanId", etiket: t.alan.dalSahibi, deger: sahip ? ajanEtiketi(sahip) : sahipId });
        else kullanilan.add("ajanId");
      }
      // Sunucu özeti hem ayrıntıya hem veriye yazar; aynıysa bir kez gösterilir
      if (dize(v.ozet)?.trim() === gerekce?.trim()) kullanilan.add("ozet");
      kullanilan.add("isteyenId");
      // Kalite kapısının kaydı kartın altındaki durum satırında gösterilir
      kullanilan.add("kalite");
      // 0.0.8'de birleştirme yok: eski isteğe verilen karar yalnız kayda geçer
      etki = s.kalite.etkiEski;
      break;
    }

    case "genel": {
      // Görev token tavanı: ajan durdu; kullanım ölçeri, görev ve iki kararın sonucu
      const tavan = tokenTavaniVerisi(onay.veri);
      if (tavan) {
        gerekce = onay.durum === "bekliyor" ? t.tokenTavani.gerekce(kisi, tavan.gorevKodu) : null;
        ekle({ k: "toplam", etiket: t.tokenTavani.kullanim, deger: <TavanOlcer veri={tavan} />, genis: true }, ...TOKEN_TAVANI_ALANLARI);
        if (tavan.gorevId) ekle({ k: "gorevId", etiket: t.alan.gorevId, deger: <GorevBagi id={tavan.gorevId} gorevler={b.gorevler} />, genis: true });
        const yonetici = ajan ? (b.ajanlar.find((x) => x.id === ajan.yoneticiId && x.id !== ajan.id) ?? b.ajanlar.find((x) => x.rol === "ceo" && x.id !== ajan.id)) : undefined;
        etki = t.tokenTavani.etki(kisi, kisaToken(tavan.yeniTavan, b.dil), yonetici?.ad ?? null);
        break;
      }
      // Kurula soru: ayrıntı soru ile seçeneklerden kurulur; soru ve seçenekler ayrı gösterilir
      const soru = dize(v.soru);
      if (soru) gerekce = soru;
      kullanilan.add("soru");
      const secenekler = Array.isArray(v.secenekler) ? v.secenekler.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
      if (secenekler.length) {
        // Bekleyen soruda seçenekler karar alanında seçilir (secenek/OnaySecimi); sonuçlananda seçilen işaretli
        if (onay.durum === "bekliyor") kullanilan.add("secenekler");
        else ekle({ k: "secenekler", etiket: t.alan.secenekler, deger: <OnaySecenekListesi onay={onay} secenekler={secenekler} />, genis: true });
      } else kullanilan.add("secenekler");
      if (typeof v.gorevId === "string") {
        ekle({ k: "gorevId", etiket: t.alan.gorevId, deger: <GorevBagi id={v.gorevId} gorevler={b.gorevler} />, genis: true });
      }
      if (v.ajanId === onay.ajanId) kullanilan.add("ajanId");
      etki = t.etki.genel(kisi);
      break;
    }

    case "arac": {
      const arac = dize(v.arac) ?? undefined;
      const ozet = girdiOzeti(arac, v.girdi, calismaKoku(ajan));
      const komut = ozet.kod || ozet.metin || (v.girdi !== undefined ? JSON.stringify(v.girdi, null, 2) : "");
      const aciklama = ozet.kod && ozet.metin && ozet.metin !== ozet.kod ? ozet.metin : null;
      // Plan onayında plan ayrıntıdadır; girdi tekrar edilmez
      if (komut && arac !== "ExitPlanMode") {
        ekle({
          k: "girdi",
          etiket: ozet.kod ? t.alan.komut : t.alan.girdi,
          deger: (
            <>
              <pre className="komut onay-komut">{komut}</pre>
              {aciklama ? <small className="onay-ipucu">{aciklama}</small> : null}
            </>
          ),
          genis: true,
        });
      } else kullanilan.add("girdi");
      if (arac) ekle({ k: "arac", etiket: t.alan.arac, deger: <span className={`arac arac-${aracSinifi(arac)}`}>{aracAdi(arac)}</span> });
      const kural = dize(v.kural);
      if (kural) ekle({ k: "kural", etiket: t.alan.kural, deger: kural });
      const kimlik = dize(v.aracKimligi);
      if (kimlik) ekle({ k: "aracKimligi", etiket: t.alan.aracKimligi, deger: <code className="onay-kimlik">{kimlik}</code> });
      // Sunucu ayrıntıya girdinin özetini yazar; komutla ya da açıklamayla aynıysa gösterilmez
      if (gerekce && (gerekce === komut || gerekce === aciklama || gerekce === ozet.metin)) gerekce = null;
      etki = t.etki.arac(kisi, aracAdi(arac));
      break;
    }

    case "anayasa": {
      // Sunucu ayrıntıya maddeleri de yazar; gerekçe veride ya da ayrıntının ilk paragrafında
      const a = anayasaVerisi(onay.veri);
      if (a.maddeler.length) {
        gerekce = a.gerekce ?? ilkParagraf(onay.ayrinti);
        ekle({ k: "maddeler", etiket: t.alan.maddeler, deger: <AnayasaMaddeleri maddeler={a.maddeler} />, genis: true }, "maddeler", "gerekce");
      } else if (a.gerekce) {
        gerekce = gerekce ?? a.gerekce;
        kullanilan.add("gerekce");
      }
      etki = t.etki.anayasa(a.maddeler.length);
      break;
    }

    case "isten_cikarma": {
      const v2 = istenCikarmaVerisi(onay.veri);
      const ayrilan = v2.ajanId ? b.ajanlar.find((a) => a.id === v2.ajanId) : undefined;
      const ad = ayrilan?.ad ?? v2.ad ?? v2.ajanId ?? "?";
      ekle(
        {
          k: "ajanId",
          etiket: t.alan.ayrilan,
          deger: ayrilan ? (
            <span className="onay-karakter">
              <AjanAvatar ajan={ayrilan} boyut="xs" />
              {ajanEtiketi(ayrilan)}
            </span>
          ) : (
            <b>{ad}</b>
          ),
        },
        "ajanId",
        "ad",
      );
      const devralan = v2.devralanId ? b.ajanlar.find((a) => a.id === v2.devralanId) : undefined;
      const devralanAdi = devralan?.ad ?? v2.devralanId;
      ekle(
        {
          k: "devralanId",
          etiket: t.alan.devralanId,
          deger: devralan ? ajanEtiketi(devralan) : devralanAdi ? devralanAdi : <span className="soluk">{t.devralanYok}</span>,
        },
        "devralanId",
      );
      // Gerekçe veride ve ayrıntıda olabilir; aynıysa bir kez gösterilir
      if (v2.gerekce) {
        if (!gerekce || gerekce.trim() === v2.gerekce) gerekce = v2.gerekce;
        else ekle({ k: "gerekce", etiket: t.alan.gerekce, deger: <span className="onay-metin">{v2.gerekce}</span>, genis: true });
      }
      kullanilan.add("gerekce");
      etki = t.etki.istenCikarma(ad, devralanAdi ?? null);
      break;
    }

    case "teslim": {
      // Özet veride; yoksa ayrıntının ilk paragrafı (ayrıntı test adımlarını da metin olarak taşır)
      const tv = teslimVerisi(onay.veri);
      gerekce = tv.ozet ?? ilkParagraf(gerekce) ?? gerekce;
      if (tv.baslik && !onay.baslik.includes(tv.baslik)) ekle({ k: "baslik", etiket: t.alan.baslik, deger: tv.baslik, genis: true });
      if (tv.testAdimlari.length) {
        ekle({
          k: "testAdimlari",
          etiket: t.alan.testAdimlari,
          deger: (
            <ol className="onay-secenekler onay-adimlar">
              {tv.testAdimlari.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          ),
          genis: true,
        });
      }
      if (tv.calistir) ekle({ k: "calistir", etiket: t.alan.calistir, deger: <pre className="komut onay-komut">{tv.calistir}</pre>, genis: true });
      if (tv.adres) {
        ekle({
          k: "adres",
          etiket: t.alan.adres,
          deger: (
            <a className="baglanti" href={tv.adres} target="_blank" rel="noreferrer noopener">
              {tv.adres}
            </a>
          ),
        });
      }
      if (tv.dal) ekle({ k: "dal", etiket: t.alan.dal, deger: <code>{tv.dal}</code> });
      for (const k of TESLIM_ALANLARI) kullanilan.add(k);
      // Ret notu CEO'ya geri bildirim olarak gider
      etki = t.etki.teslim(ceoBul(b.ajanlar)?.ad ?? kisi);
      break;
    }
  }

  return { gerekce, alanlar: [...alanlar, ...genelAlanlar(v, kullanilan, b)], etki };
}

function useOnayGorunumu(onay: Onay, ajan: Ajan | undefined): OnayGorunumu {
  const b = useBaglam();
  const katalog = useKarakterKatalogu();
  return gorunumKur(onay, ajan, b, katalog);
}

/** Ana yasa önerisinin maddeleri; makine kuralı olanlarda hedef, desen ve karar */
function AnayasaMaddeleri({ maddeler }: { maddeler: AnayasaMaddesi[] }) {
  const t = useSozluk().onaylar.anayasa;
  return (
    <ol className="anayasa-maddeler">
      {maddeler.map((m) => (
        <li key={`${m.no}-${m.baslik}`} className="anayasa-madde">
          <span className="anayasa-no sayi" aria-hidden="true">
            {m.no}
          </span>
          <div className="anayasa-icerik">
            {m.baslik ? <b className="anayasa-baslik">{m.baslik}</b> : null}
            {m.metin ? <p className="anayasa-metin">{m.metin}</p> : null}
            {m.kural ? (
              <div className="anayasa-kural">
                <span className="anayasa-kural-ad">{t.kural}</span>
                <dl>
                  <div>
                    <dt>{t.hedefEtiketi}</dt>
                    <dd>{t.hedef[m.kural.hedef]}</dd>
                  </div>
                  <div>
                    <dt>{t.desen(m.kural.desenler.length)}</dt>
                    <dd className="anayasa-desenler">
                      {m.kural.desenler.map((d) => (
                        <code key={d}>{d}</code>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>{t.kararEtiketi}</dt>
                    <dd className={`anayasa-karar anayasa-karar-${m.kural.karar}`}>{t.karar[m.kural.karar]}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <span className="anayasa-talimat">{t.yalnizTalimat}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function AlanListesi({ alanlar }: { alanlar: Alan[] }) {
  if (!alanlar.length) return null;
  return (
    <dl className="onay-ayrinti">
      {alanlar.map((a) => (
        <div key={a.k} className={`onay-alan${a.genis ? " onay-alan-genis" : ""}`}>
          <dt>{a.etiket}</dt>
          <dd>{a.deger}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Onay verisini anahtar–değer olarak gösterir; bilinen alanları insanca biçimler */
export function OnayVerisi({ veri }: { veri: unknown }) {
  const b = useBaglam();
  return <AlanListesi alanlar={genelAlanlar(kayit(veri), new Set(), b)} />;
}

// ---------------------------------------------------------------------------
// Karar
// ---------------------------------------------------------------------------

/**
 * Onayla / Reddet ve isteğe bağlı not. Not alanı açılınca düğmelerin önüne gelir: yazıp Tab ile karara geçilir.
 * aciklayan: düğmelerin hangi onaya ait olduğunu söyleyen başlığın kimliği; kilitli: süre doldu, karar verilemez
 */
export function OnayKararDugmeleri({
  onay,
  onayMetni,
  retMetni,
  aciklayan,
  kilitli,
  tehlikeli,
  ikincil,
}: {
  onay: Onay;
  onayMetni?: string;
  retMetni?: string;
  aciklayan?: string;
  kilitli?: boolean;
  /** Onay geri alınamaz bir iş yapıyor (işten çıkarma): onay düğmesi tehlike görünümünde */
  tehlikeli?: boolean;
  /** Karar CEO'da (tam otonom): kurulun düğmeleri ikincil görünür */
  ikincil?: boolean;
}) {
  const s = useSozluk();
  const [not, setNot] = useState("");
  const [notAcik, setNotAcik] = useState(false);
  const { suruyor, calistir } = useIslem();

  const karar = (k: "onayla" | "reddet") =>
    calistir(k, async () => {
      const sonuc = await api.onayKarari(onay.id, { karar: k, not: not.trim() || undefined });
      onayUygula(sonuc);
      bildir(k === "onayla" ? "basari" : "bilgi", sozluk().onaylar.kararBildirimi(onay.baslik, k === "onayla"));
    });

  const kapali = suruyor !== null || !!kilitli;
  return (
    <div className="onay-karar">
      {notAcik ? (
        <input
          className="girdi onay-not-girdi"
          aria-label={s.onaylar.notEtiketi}
          placeholder={s.onaylar.notYer}
          value={not}
          onChange={(e) => setNot(e.target.value)}
          autoFocus
        />
      ) : null}
      <div className="onay-karar-dugmeler">
        <button
          type="button"
          className={`dugme onay-dugme${tehlikeli ? " dugme-tehlike" : ikincil ? "" : " dugme-ana"}`}
          onClick={() => void karar("onayla")}
          disabled={kapali}
          aria-describedby={aciklayan}
        >
          {suruyor === "onayla" ? <span className="doner" aria-hidden="true" /> : null}
          {onayMetni ?? s.genel.onayla}
        </button>
        <button type="button" className="dugme onay-dugme" onClick={() => void karar("reddet")} disabled={kapali} aria-describedby={aciklayan}>
          {suruyor === "reddet" ? <span className="doner" aria-hidden="true" /> : null}
          {retMetni ?? s.genel.reddet}
        </button>
        {!notAcik ? (
          <button type="button" className="metin-dugme onay-not-ac" onClick={() => setNotAcik(true)} aria-describedby={aciklayan}>
            {s.onaylar.notEkle}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Öğe
// ---------------------------------------------------------------------------

export function OnayOgesi({ onay }: { onay: Onay }) {
  return onay.durum === "bekliyor" ? <BekleyenOnay onay={onay} /> : <SonuclananOnay onay={onay} />;
}

/** İsteyen ajan: oturumunu açan küçük bağlantı; ajan yoksa ArnOrg */
function Isteyen({ onay, ajan }: { onay: Onay; ajan: Ajan | undefined }) {
  const s = useSozluk();
  if (!ajan) return <b className="onay-kisi">{onay.ajanId ? s.onaylar.bilinmeyenAjan : s.genel.arnorg}</b>;
  return (
    <button type="button" className="onay-kisi" onClick={() => ajanaGit(ajan.id)} title={s.onaylar.oturumunuAc(ajan.ad)}>
      <AjanAvatar ajan={ajan} boyut="xs" />
      <b>{ajan.ad}</b>
      <span className="onay-rol">{ajan.rolAdi}</span>
    </button>
  );
}

function BekleyenOnay({ onay }: { onay: Onay }) {
  const s = useSozluk();
  const t = s.onaylar;
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === onay.ajanId));
  const g = useOnayGorunumu(onay, ajan);
  const baslikId = useId();

  const bitis = onay.sonGecerlilik ? Date.parse(onay.sonGecerlilik) : NaN;
  const sureli = !Number.isNaN(bitis);
  const simdi = useSimdi(sureli ? 1000 : 30_000);
  const kalan = sureli ? bitis - simdi : null;
  const doldu = kalan !== null && kalan <= 0;
  const acil = kalan !== null && kalan < ACIL_MS;
  const baslangic = Date.parse(onay.olusturma);
  const oran = sureli && bitis > baslangic ? Math.max(0, Math.min(1, (bitis - simdi) / (bitis - baslangic))) : null;
  const vurgulu = useSohbet((d) => d.vurguluOnayId === onay.id);
  const ceoAdi = useVeri((d) => ceoBul(d.ajanlar)?.ad) ?? ajan?.ad ?? s.genel.arnorg;
  // Görev token tavanı onayı: tür, kim ve karar düğmeleri kendi adlarıyla
  const ozel = onay.tur === "genel" && tokenTavaniVerisi(onay.veri) ? t.tokenTavani : null;
  // Tam otonom: karar CEO'da; kurul yine karar verebilir, düğmeleri ikincil
  const ceoda = ceoyuBekliyor(onay);

  return (
    <li id={`onay-${onay.id}`} className={`onay onay-bekliyor${acil ? " onay-acil" : ""}${vurgulu ? " onay-vurgulu" : ""}${ceoda ? " onay-ceoda" : ""}`} data-tur={onay.tur}>
      <span className="onay-tur">{ozel?.tur ?? s.genel.onayTuru[onay.tur]}</span>
      <h3 className="onay-baslik" id={baslikId}>
        {onay.baslik}
      </h3>
      <span className={`onay-sure${sureli ? "" : " onay-sure-yok"}`} role={sureli ? "timer" : undefined} title={sureli ? t.sureIpucu : undefined}>
        <span>{kalan === null ? t.sureYok : doldu ? t.sureDoldu : t.kaldi(kalanSure(kalan))}</span>
        {oran !== null ? (
          <span className="onay-sure-cubuk" aria-hidden="true">
            <span style={{ transform: `scaleX(${oran})` }} />
          </span>
        ) : null}
      </span>
      <p className="onay-kim">
        <span className="onay-kim-etiket">{ozel?.kim ?? t.kim[onay.tur]}</span>
        <Isteyen onay={onay} ajan={ajan} />
        <span aria-hidden="true">·</span>
        <time dateTime={onay.olusturma} title={akilliZaman(onay.olusturma)}>
          {goreli(onay.olusturma, simdi)}
        </time>
        {ceoda ? (
          <>
            <span aria-hidden="true">·</span>
            <CeoKararVeriyor ipucu={false} />
          </>
        ) : null}
      </p>
      <div className="onay-icerik">
        {g.gerekce ? <p className="onay-gerekce">{g.gerekce}</p> : null}
        <AlanListesi alanlar={g.alanlar} />
        <p className="onay-etki">
          <span className="onay-etki-ad">{ozel?.sonra ?? t.sonra[onay.tur]}</span> {g.etki}
          {sureli ? ` ${t.etki.sureli}` : ""}
        </p>
        {ceoda ? <p className="karar-ceo-ipucu">{s.karar.bekliyorIpucu}</p> : null}
        {onay.tur === "arac" ? (
          // Araç çağrısının kararı, geri sayımı ve notuyla Denetim'de verilir
          <div className="onay-karar">
            <div className="onay-karar-dugmeler">
              <button type="button" className="dugme onay-dugme" onClick={() => git("denetim")} aria-describedby={baslikId}>
                {t.denetimdeKararVer}
                <Simge ad="sag" boyut={12} />
              </button>
            </div>
          </div>
        ) : onay.tur === "teslim" ? (
          // Teslim önce denenir: Test et ana düğme; geri bildirimin notu zorunlu ve CEO'ya iş olarak gider
          <TeslimKarari
            onay={onay}
            ceoAdi={ceoAdi}
            kabulAna={false}
            aciklayan={baslikId}
            kilitli={doldu}
            onDugme={
              <button type="button" className={`dugme onay-dugme${ceoda ? "" : " dugme-ana"}`} onClick={() => testiAc(onay.id)} aria-describedby={baslikId}>
                <Simge ad="oynat" boyut={12} />
                {s.sohbet.bildirim.testEt}
              </button>
            }
          />
        ) : onaySecenekleri(onay).length ? (
          // Kurula sorunun seçenekleri: seçilen seçenek soran çalışana yanıt olarak gider
          <OnaySecimi onay={onay} aciklayan={baslikId} kilitli={doldu} ikincil={ceoda} />
        ) : (
          <OnayKararDugmeleri
            onay={onay}
            onayMetni={ozel?.surdur ?? t.fiil[onay.tur]}
            retMetni={ozel?.durdur}
            aciklayan={baslikId}
            kilitli={doldu}
            tehlikeli={onay.tur === "isten_cikarma"}
            ikincil={ceoda}
          />
        )}
      </div>
    </li>
  );
}

/** Geçmiş satırı: sonuç, kararı veren, başlık, tür · isteyen · karar anı ve kararın notu ya da gerekçesi; açılınca ayrıntı */
function SonuclananOnay({ onay }: { onay: Onay }) {
  const s = useSozluk();
  const t = s.onaylar;
  const ajan = useVeri((d) => d.ajanlar.find((a) => a.id === onay.ajanId));
  const ceoId = useVeri((d) => d.ajanlar.find((a) => a.rol === "ceo")?.id ?? null);
  const veren = kararVereni(onay);
  // Süre dolması hükümde yazılı; not aynı şeyi söylüyorsa tekrar edilmez
  const gerekce = veren === "zaman_asimi" ? null : kararGerekcesi(onay, ceoId);
  const [acik, setAcik] = useState(false);
  const zaman = onay.sonuclanma ?? onay.olusturma;
  const kisi = ajan?.ad ?? (onay.ajanId ? t.bilinmeyenAjan : s.genel.arnorg);
  const vurgulu = useSohbet((d) => d.vurguluOnayId === onay.id);
  // Onaylanmış birleştirme kalite kapısından geçer: sırası, testi ve sonucu satırın altında
  const kalite = onay.durum === "onaylandi" ? kaliteKaydi(onay) : null;

  return (
    <li id={`onay-${onay.id}`} className={`onay onay-sonuclandi onay-${onay.durum}${vurgulu ? " onay-vurgulu" : ""}`} data-tur={onay.tur}>
      <details onToggle={(e) => setAcik(e.currentTarget.open)}>
        <summary>
          <span className="onay-hukum">{t.durum[onay.durum]}</span>
          <span className="onay-gecmis-baslik">{onay.baslik}</span>
          {veren && veren !== "zaman_asimi" ? <KararVerenEtiketi onay={onay} /> : null}
          <span className="onay-gecmis-meta">
            {s.genel.onayTuru[onay.tur]} · {kisi} · <time dateTime={zaman}>{akilliZaman(zaman)}</time>
          </span>
          {gerekce ? <span className="onay-gecmis-not">{veren === "ceo" ? s.karar.gerekce(gerekce) : t.not(gerekce)}</span> : null}
          <Simge ad="sag" boyut={12} className="onay-isaret" />
        </summary>
        {acik ? <SonucAyrintisi onay={onay} ajan={ajan} /> : null}
      </details>
      {kalite ? <KaliteDurumu onay={onay} kalite={kalite} /> : null}
    </li>
  );
}

function SonucAyrintisi({ onay, ajan }: { onay: Onay; ajan: Ajan | undefined }) {
  const s = useSozluk();
  const g = useOnayGorunumu(onay, ajan);
  // Kararı veren ayrıntının başında; süre dolduysa da ("Süre doldu") görünür
  const alanlar: Alan[] = kararVereni(onay) ? [{ k: "kararVeren", etiket: s.karar.veren.etiket, deger: <KararVerenEtiketi onay={onay} /> }, ...g.alanlar] : g.alanlar;
  if (!g.gerekce && !alanlar.length) return null;
  return (
    <div className="onay-gecmis-ic">
      {g.gerekce ? <p className="onay-gerekce">{g.gerekce}</p> : null}
      <AlanListesi alanlar={alanlar} />
    </div>
  );
}
