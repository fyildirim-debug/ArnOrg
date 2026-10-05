// Ortak çalışma (0.0.8): etkin projenin dosya kiraları, ekip temposu, son görev kayıtları (kalite denetimiyle) ve
// geçişte korunan eski çalışma alanları. Gösteren bileşen useOrtakCalisma ile yükler; canlı olaylar (kayıt, denetim,
// kira, tempo) listeyi güncel tutar. Kayıt ve geçmeyen denetim canlı akış rayına da düşer.
import { KAYIT_SON_DURUMLARI, type Ajan, type DosyaKirasi, type EkipTemposu, type EskiCalismaAlani, type GorevKaydi, type OrtakCalismaOlayi } from "@arnorg/ortak";
import { useEffect } from "react";
import { create } from "zustand";
import { ortakApi } from "../api/ortak";
import { canliEkle, useVeri, type Yukleme } from "./veri";

interface OrtakCalismaDurumu {
  projeId: string | null;
  yukleme: Yukleme;
  kiralar: DosyaKirasi[];
  tempo: EkipTemposu | null;
  /** Son kayıtlar, yeni önce */
  kayitlar: GorevKaydi[];
  kalanlar: EskiCalismaAlani[];
}

/** Bellekte tutulan en çok kayıt (çekirdek de son 60'ı verir) */
const KAYIT_SINIRI = 60;
const bos = { yukleme: "bos" as Yukleme, kiralar: [], tempo: null, kayitlar: [], kalanlar: [] };

export const useOrtak = create<OrtakCalismaDurumu>()(() => ({ projeId: null, ...bos }));

let istekSayaci = 0;
/** Süren yükleme: aynı anda açılan iki bileşen (panel ve ajan ayrıntısı) tek istek yapar */
let suren: { projeId: string; is: Promise<void> } | null = null;

/** Projenin ortak çalışma durumu; aynı proje yeniden yüklenirken var olan veri gösterilmeye devam eder */
export function ortakDurumuYukle(projeId: string): Promise<void> {
  if (suren?.projeId === projeId) return suren.is;
  const is = yukle(projeId).finally(() => {
    if (suren?.is === is) suren = null;
  });
  suren = { projeId, is };
  return is;
}

async function yukle(projeId: string): Promise<void> {
  const sayac = ++istekSayaci;
  if (useOrtak.getState().projeId !== projeId) useOrtak.setState({ projeId, ...bos });
  if (useOrtak.getState().yukleme !== "hazir") useOrtak.setState({ yukleme: "yukleniyor" });
  try {
    const d = await ortakApi.durum(projeId);
    if (sayac !== istekSayaci || useOrtak.getState().projeId !== projeId) return;
    useOrtak.setState({ kiralar: d.kiralar, tempo: d.tempo, kayitlar: d.kayitlar.slice(0, KAYIT_SINIRI), kalanlar: d.kalanlar, yukleme: "hazir" });
  } catch {
    if (sayac === istekSayaci && useOrtak.getState().projeId === projeId && useOrtak.getState().yukleme !== "hazir") useOrtak.setState({ yukleme: "hata" });
  }
}

/** Gösteren bileşenlerde: etkin projenin durumunu yükler, canlı bağlantı yeniden kurulunca tazeler */
export function useOrtakCalisma(): OrtakCalismaDurumu {
  const pid = useVeri((d) => d.aktifProjeId);
  const bagli = useVeri((d) => d.wsDurumu === "bagli");
  useEffect(() => {
    if (pid && bagli) void ortakDurumuYukle(pid);
  }, [pid, bagli]);
  return useOrtak();
}

/** Kaydı listeye ekler ya da günceller (yeni önce) */
export function kayitUygula(k: GorevKaydi): void {
  useOrtak.setState((d) => {
    if (d.projeId !== k.projeId) return {};
    const i = d.kayitlar.findIndex((x) => x.id === k.id);
    if (i === -1) return { kayitlar: [k, ...d.kayitlar].sort((a, b) => b.zaman.localeCompare(a.zaman)).slice(0, KAYIT_SINIRI) };
    const kayitlar = d.kayitlar.slice();
    kayitlar[i] = k;
    return { kayitlar };
  });
}

const kaldiMi = (k: GorevKaydi) => k.kalite.durum === "kaldi" || k.kalite.durum === "zaman_asimi";
const kisaKod = (k: GorevKaydi) => k.gorevKodu ?? k.commit.slice(0, 7);

/** Canlı olay (olaylar.ts): liste yüklüyse güncellenir; etkin projenin kaydı rayda da görünür */
export function ortakOlayUygula(olay: OrtakCalismaOlayi, aktifProjeId: string | null): void {
  const yuklu = useOrtak.getState().projeId === olay.projeId;
  switch (olay.tur) {
    case "kira.guncellendi":
      if (yuklu) useOrtak.setState({ kiralar: olay.kiralar });
      return;
    case "tempo.guncellendi":
      if (yuklu) useOrtak.setState({ tempo: olay.tempo });
      return;
    case "gorev.kaydedildi": {
      const k = olay.kayit;
      if (yuklu) kayitUygula(k);
      if (olay.projeId !== aktifProjeId) return;
      canliEkle({
        id: `k-${k.id}`,
        zaman: k.zaman,
        ajanId: k.ajanId,
        ajanAd: k.ajanAd,
        etiket: (sz) => sz.ortakCalisma.ray.kaydedildi,
        sinif: "ok",
        hedef: (sz) => `${kisaKod(k)} · ${sz.ortakCalisma.kayit.dosya(k.dosyalar.length)}`,
      });
      return;
    }
    case "kayit.guncellendi": {
      const k = olay.kayit;
      const once = useOrtak.getState().kayitlar.find((x) => x.id === k.id);
      if (yuklu) kayitUygula(k);
      if (olay.projeId !== aktifProjeId || !KAYIT_SON_DURUMLARI.includes(k.kalite.durum) || once?.kalite.durum === k.kalite.durum) return;
      // Geçmeyen denetim ve kırmızıdan dönüş rayda görünür; olağan geçiş sessizdir
      if (kaldiMi(k) && !k.kalite.kirmiziKayit) {
        canliEkle({
          id: `kd-${k.id}-${k.kalite.bitis ?? k.kalite.durum}`,
          zaman: k.kalite.bitis ?? k.zaman,
          ajanId: k.ajanId,
          ajanAd: k.ajanAd,
          etiket: (sz) => sz.ortakCalisma.ray.gecmedi,
          sinif: "ret",
          hedef: (sz) => `${kisaKod(k)} · ${k.kalite.mesaj ?? sz.ortakCalisma.kalite[k.kalite.durum]}`,
        });
      }
      return;
    }
  }
}

/** Ajanın araç yollarının kökü: 0.0.8'de herkes ortak projede çalışır (geçişten kalan kişisel alan varsa o) */
export function calismaKoku(ajan: Pick<Ajan, "calismaAlani"> | null | undefined): string | null {
  const d = useVeri.getState();
  return ajan?.calismaAlani ?? d.projeler.find((p) => p.id === d.aktifProjeId)?.yol ?? null;
}
