// Sunucu olaylarını (WS /ws) depoya artımlı uygular
import { GOREV_DURUM_ADLARI, HAFIZA_TURU_ADLARI, KURUL, ONAY_TURU_ADLARI, type SunucuOlayi } from "@arnorg/ortak";
import { CanliBaglanti } from "../api/canli";
import { aracAdi, aracSinifi, girdiOzeti } from "../yardimcilar/arac";
import { kisalt } from "../yardimcilar/bicim";
import { bildir, useArayuz } from "./arayuz";
import { hafizaKaydiKaldir, hafizaKaydiUygula, soruUygula, useHafiza } from "./hafiza";
import { kodDurumuUygula } from "./kodZekasi";
import {
  ajanBul,
  ajanKaldir,
  ajanUygula,
  akisOgesiEkle,
  canliEkle,
  denetimdenCanli,
  gorevUygula,
  mesajUygula,
  onayUygula,
  projeUygula,
  projeVerisiniYukle,
  projeleriYukle,
  useVeri,
  type VeriDurumu,
} from "./veri";

const ONAY_DURUM_METNI = {
  bekliyor: "Onay bekliyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
  zaman_asimi: "Süre doldu",
} as const;

/** Ofis sahnesi gibi olayları ayrıca canlandıran dinleyiciler; olay depoya uygulandıktan sonra çağrılır */
export type OfisOlayDinleyicisi = (olay: SunucuOlayi, onceki: VeriDurumu) => void;
const ofisDinleyicileri = new Set<OfisOlayDinleyicisi>();

export function ofisOlayDinle(dinleyici: OfisOlayDinleyicisi): () => void {
  ofisDinleyicileri.add(dinleyici);
  return () => ofisDinleyicileri.delete(dinleyici);
}

export function olayUygula(olay: SunucuOlayi) {
  const onceki = useVeri.getState();
  depoyaUygula(olay);
  for (const d of ofisDinleyicileri) {
    try {
      d(olay, onceki);
    } catch (e) {
      console.error("Ofis olay dinleyicisi hata verdi", e);
    }
  }
}

function depoyaUygula(olay: SunucuOlayi) {
  const d = useVeri.getState();
  const pid = d.aktifProjeId;

  switch (olay.tur) {
    case "merhaba":
      return;

    case "proje.guncellendi":
      projeUygula(olay.proje);
      return;

    case "hesap.guncellendi":
      useVeri.setState({ hesap: olay.hesap });
      return;

    case "ajan.guncellendi":
      ajanUygula(olay.ajan);
      return;

    case "ajan.silindi":
      if (olay.projeId === pid) ajanKaldir(olay.ajanId);
      return;

    case "ajan.akis": {
      if (olay.projeId !== pid) return;
      const oge = olay.oge;
      akisOgesiEkle(oge);
      if (oge.tur === "arac_cagrisi") {
        const ajan = ajanBul(oge.ajanId);
        const ozet = girdiOzeti(oge.arac, oge.girdi, ajan?.calismaAlani);
        canliEkle({
          id: `a-${oge.id}`,
          zaman: oge.zaman,
          ajanId: oge.ajanId,
          ajanAd: ajan?.ad ?? oge.ajanId,
          etiket: aracAdi(oge.arac),
          sinif: aracSinifi(oge.arac),
          hedef: ozet.kod ?? ozet.metin,
        });
      }
      return;
    }

    case "denetim.kaydi": {
      if (olay.kayit.projeId !== pid) return;
      useVeri.setState((s) => {
        if (s.denetim.some((k) => k.id === olay.kayit.id)) return {};
        return { denetim: [olay.kayit, ...s.denetim].slice(0, 2000) };
      });
      // İzin verilen çağrı zaten araç olarak rayda; yalnız ret/sor/değişiklik ayrıca düşer
      if (olay.kayit.karar !== "izin") canliEkle(denetimdenCanli(olay.kayit));
      return;
    }

    case "onay.yeni":
    case "onay.sonuc": {
      const o = olay.onay;
      if (o.projeId !== pid) return;
      onayUygula(o);
      const ajan = ajanBul(o.ajanId);
      canliEkle({
        id: `o-${o.id}-${o.durum}`,
        zaman: o.sonuclanma ?? o.olusturma,
        ajanId: o.ajanId,
        ajanAd: ajan?.ad ?? "ArnOrg",
        etiket: ONAY_DURUM_METNI[o.durum],
        sinif: o.durum === "bekliyor" ? "sor" : o.durum === "onaylandi" ? "ok" : "ret",
        hedef: `${ONAY_TURU_ADLARI[o.tur]} · ${o.baslik}`,
      });
      if (olay.tur === "onay.yeni" && o.durum === "bekliyor" && o.tur === "arac") {
        bildir("uyari", `${ajan?.ad ?? "Bir ajan"} kararınızı bekliyor: ${kisalt(o.baslik, 60)}`);
      }
      return;
    }

    case "gorev.guncellendi": {
      const g = olay.gorev;
      if (g.projeId !== pid) return;
      const eski = d.gorevler.find((x) => x.id === g.id);
      gorevUygula(g);
      if (!eski || eski.durum !== g.durum) {
        const ajan = ajanBul(g.atananId);
        canliEkle({
          id: `g-${g.id}-${g.durum}-${g.guncelleme}`,
          zaman: g.guncelleme,
          ajanId: g.atananId,
          ajanAd: ajan?.ad ?? "Pano",
          etiket: "görev",
          sinif: g.durum === "tamam" ? "ok" : g.durum === "iptal" ? "ret" : "bilgi",
          hedef: `${g.kod} → ${GOREV_DURUM_ADLARI[g.durum]}`,
        });
      }
      return;
    }

    case "mesaj.yeni": {
      const m = olay.mesaj;
      if (m.projeId !== pid) return;
      mesajUygula(m);
      const ui = useArayuz.getState();
      // Kurulun kendi mesajı okunmamış sayılmaz
      if (m.gonderenId !== KURUL && !(ui.gorunum === "kanallar" && ui.kanal === m.kanal)) {
        useVeri.setState((s) => ({ okunmamis: { ...s.okunmamis, [m.kanal]: (s.okunmamis[m.kanal] ?? 0) + 1 } }));
      }
      return;
    }

    case "maliyet": {
      if (olay.projeId !== pid) return;
      // Olaydaki değerler ajanın kendi bugünkü ve toplam kullanımıdır; proje toplamı farkla güncellenir
      useVeri.setState((s) => {
        const ajan = s.ajanlar.find((a) => a.id === olay.ajanId);
        const fark = {
          bugunUsd: ajan ? olay.bugunUsd - ajan.bugunHarcananUsd : 0,
          toplamUsd: ajan ? olay.toplamUsd - ajan.toplamHarcananUsd : 0,
          bugunToken: ajan ? olay.bugunToken - ajan.bugunToken : 0,
          toplamToken: ajan ? olay.toplamToken - ajan.toplamToken : 0,
        };
        const ajanlar = ajan
          ? s.ajanlar.map((a) =>
              a.id === olay.ajanId
                ? { ...a, bugunHarcananUsd: olay.bugunUsd, toplamHarcananUsd: olay.toplamUsd, bugunToken: olay.bugunToken, toplamToken: olay.toplamToken }
                : a,
            )
          : s.ajanlar;
        const maliyet = s.maliyet
          ? {
              ...s.maliyet,
              bugunUsd: Math.max(0, s.maliyet.bugunUsd + fark.bugunUsd),
              toplamUsd: Math.max(0, s.maliyet.toplamUsd + fark.toplamUsd),
              bugunToken: Math.max(0, s.maliyet.bugunToken + fark.bugunToken),
              toplamToken: Math.max(0, s.maliyet.toplamToken + fark.toplamToken),
              ajanlar: s.maliyet.ajanlar.map((x) =>
                x.ajanId === olay.ajanId
                  ? { ...x, bugunUsd: olay.bugunUsd, toplamUsd: olay.toplamUsd, bugunToken: olay.bugunToken, toplamToken: olay.toplamToken }
                  : x,
              ),
            }
          : s.maliyet;
        return { ajanlar, maliyet };
      });
      return;
    }

    case "hafiza.yeni": {
      const k = olay.kayit;
      if (k.projeId !== pid) return;
      const yeni = !useHafiza.getState().kayitlar.some((x) => x.id === k.id);
      hafizaKaydiUygula(k);
      // Eskiyen kaydın güncellemesi akışa ayrıca düşmez; yenisi zaten düştü
      if (!k.yerineGecen) {
        canliEkle({
          id: `h-${k.id}-${k.guncelleme}`,
          zaman: k.guncelleme,
          ajanId: k.kaynakAjanId,
          ajanAd: k.kaynakAd,
          etiket: yeni ? "hafıza" : "hafıza güncel",
          sinif: k.tur === "tercih" ? "sor" : k.tur === "ogrenilen" ? "ok" : "bilgi",
          hedef: `${HAFIZA_TURU_ADLARI[k.tur]} · ${k.baslik}`,
        });
      }
      return;
    }

    case "hafiza.silindi":
      if (olay.projeId === pid) hafizaKaydiKaldir(olay.projeId, olay.id);
      return;

    case "soru.guncellendi": {
      const s = olay.soru;
      if (s.projeId !== pid) return;
      soruUygula(s);
      canliEkle({
        id: `s-${s.id}-${s.durum}`,
        zaman: s.yanitlanma ?? s.olusturma,
        ajanId: s.durum === "yanitlandi" ? s.soruluId : s.soranId,
        ajanAd: s.durum === "yanitlandi" ? s.soruluAd : s.soranAd,
        etiket: s.durum === "bekliyor" ? "soru" : s.durum === "yanitlandi" ? "yanıt" : "yanıtsız",
        sinif: s.durum === "bekliyor" ? "sor" : s.durum === "yanitlandi" ? "ok" : "ret",
        hedef: s.durum === "bekliyor" ? `→ ${s.soruluAd}: ${kisalt(s.soru, 70)}` : `→ ${s.soranAd}: ${kisalt(s.yanit ?? s.soru, 70)}`,
      });
      return;
    }

    case "dosya.degisti":
      // Kod ekranı olaylariDinle ile kendisi işler
      return;

    case "kod.dizin":
      if (olay.projeId === pid) kodDurumuUygula(olay.projeId, olay.durum);
      return;

    case "bildirim":
      bildir(olay.seviye, olay.metin);
      return;
  }
}

// ---------------------------------------------------------------------------
// Tekil bağlantı
// ---------------------------------------------------------------------------

let baglanti: CanliBaglanti | null = null;

export function canliBaglantiyiBaslat() {
  if (baglanti) return baglanti;
  baglanti = new CanliBaglanti({
    olay: olayUygula,
    durum: (wsDurumu) => useVeri.setState({ wsDurumu }),
    yenidenBaglandi: () => {
      // Kopukken kaçan olaylar için veriyi sessizce tazele
      void projeleriYukle().catch(() => undefined);
      void projeVerisiniYukle(true);
    },
  });
  baglanti.abone(useVeri.getState().aktifProjeId);
  baglanti.baslat();
  // Etkin proje değişince aboneliği güncelle
  abonelikIptal = useVeri.subscribe((s, once) => {
    if (s.aktifProjeId !== once.aktifProjeId) baglanti?.abone(s.aktifProjeId);
  });
  return baglanti;
}

let abonelikIptal: (() => void) | null = null;

export function canliBaglantiyiKapat() {
  abonelikIptal?.();
  abonelikIptal = null;
  baglanti?.kapat();
  baglanti = null;
}

export function simdiYenidenBaglan() {
  baglanti?.simdiDene();
}
