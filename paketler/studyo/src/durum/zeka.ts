// Zekâ: ArnOrg'un global zekâsı (projelerden bağımsız, kendi kendine öğrenen standart kurallar ve öğrenme günlüğü),
// etkin projenin becerileri ve sözleri, ana yasa taslağı ve Zekâ ekranının seçimleri
import type { AnayasaKurali, Beceri, KureselKural, Soz, ZekaDurumu, ZekaGunlukKaydi } from "@arnorg/ortak";
import { create } from "zustand";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import type { Yukleme } from "./veri";

// ---------------------------------------------------------------------------
// Global zekâ
// ---------------------------------------------------------------------------

interface ZekaDeposu {
  durum: ZekaDurumu | null;
  yukleme: Yukleme;
  hata: string | null;
}

export const useZeka = create<ZekaDeposu>()(() => ({ durum: null, yukleme: "bos", hata: null }));

export async function zekaYukle(): Promise<void> {
  if (useZeka.getState().yukleme !== "hazir") useZeka.setState({ yukleme: "yukleniyor" });
  try {
    useZeka.setState({ durum: await api.zeka(), yukleme: "hazir", hata: null });
  } catch (e) {
    useZeka.setState({ yukleme: "hata", hata: hataMetni(e) });
  }
}

function sayilar(kurallar: KureselKural[]): ZekaDurumu["sayilar"] {
  const s = { aday: 0, etkin: 0, emekli: 0 };
  for (const k of kurallar) s[k.durum]++;
  return s;
}

/** "zeka.guncellendi" olayı ya da API yanıtı: kural güncellenir, günlüğe satır eklenir */
export function zekaOlayiUygula(kural: KureselKural | null, gunluk: ZekaGunlukKaydi | null, silinenId?: string) {
  useZeka.setState((d) => {
    if (!d.durum) return {};
    let kurallar = d.durum.kurallar;
    if (kural) {
      const i = kurallar.findIndex((k) => k.id === kural.id);
      kurallar = i === -1 ? [kural, ...kurallar] : kurallar.map((k) => (k.id === kural.id ? kural : k));
    }
    if (silinenId) kurallar = kurallar.filter((k) => k.id !== silinenId);
    const gunlukListe = gunluk && !d.durum.gunluk.some((g) => g.id === gunluk.id) ? [gunluk, ...d.durum.gunluk].slice(0, 200) : d.durum.gunluk;
    return { durum: { kurallar, gunluk: gunlukListe, sayilar: sayilar(kurallar) } };
  });
}

// ---------------------------------------------------------------------------
// Zekâ ekranının seçimleri: sekme, açık beceri, ajan ayrıntısındaki bölüm
// ---------------------------------------------------------------------------

export type ZekaSekmesi = "anayasa" | "kuresel" | "beceriler" | "sozler";
export type AjanSekmesi = "genel" | "zeka";

export const ZEKA_SEKMELERI: ZekaSekmesi[] = ["anayasa", "kuresel", "beceriler", "sozler"];
const SEKME_ANAHTARI = "arnorg.zekaSekmesi";

function kayitliSekme(): ZekaSekmesi {
  try {
    const s = localStorage.getItem(SEKME_ANAHTARI) as ZekaSekmesi | null;
    return s && ZEKA_SEKMELERI.includes(s) ? s : "anayasa";
  } catch {
    return "anayasa";
  }
}

interface ZekaArayuzu {
  sekme: ZekaSekmesi;
  /** Beceriler sekmesinde açılacak beceri (ajan ayrıntısından gelinince) */
  acikBeceri: string | null;
  /** Ekip ve Ofis'teki ajan ayrıntısında seçili bölüm; başka ajan seçilince korunur */
  ajanSekmesi: AjanSekmesi;
}

export const useZekaArayuz = create<ZekaArayuzu>()(() => ({ sekme: kayitliSekme(), acikBeceri: null, ajanSekmesi: "genel" }));

export function zekaSekmesiSec(sekme: ZekaSekmesi, acikBeceri: string | null = null) {
  useZekaArayuz.setState({ sekme, acikBeceri });
  try {
    localStorage.setItem(SEKME_ANAHTARI, sekme);
  } catch {
    // depolama kapalı: seçim yalnız bu oturumda kalır
  }
}

export function ajanSekmesiSec(ajanSekmesi: AjanSekmesi) {
  useZekaArayuz.setState({ ajanSekmesi });
}

// ---------------------------------------------------------------------------
// Etkin projenin becerileri ve sözleri
// ---------------------------------------------------------------------------

interface ProjeZekasi {
  projeId: string | null;
  beceriler: Beceri[];
  becerilerYukleme: Yukleme;
  becerilerHata: string | null;
  sozler: Soz[];
  sozlerYukleme: Yukleme;
  sozlerHata: string | null;
}

const projeZekasiBos = (projeId: string | null): ProjeZekasi => ({
  projeId,
  beceriler: [],
  becerilerYukleme: "bos",
  becerilerHata: null,
  sozler: [],
  sozlerYukleme: "bos",
  sozlerHata: null,
});

export const useProjeZekasi = create<ProjeZekasi>()(() => projeZekasiBos(null));

/** Başka projeye geçilince eski projenin verisi gösterilmesin */
function projeyeGec(pid: string) {
  if (useProjeZekasi.getState().projeId !== pid) useProjeZekasi.setState(projeZekasiBos(pid));
}

export async function becerileriYukle(pid: string): Promise<void> {
  projeyeGec(pid);
  if (useProjeZekasi.getState().becerilerYukleme !== "hazir") useProjeZekasi.setState({ becerilerYukleme: "yukleniyor" });
  try {
    const beceriler = await api.beceriler(pid);
    if (useProjeZekasi.getState().projeId === pid) useProjeZekasi.setState({ beceriler, becerilerYukleme: "hazir", becerilerHata: null });
  } catch (e) {
    if (useProjeZekasi.getState().projeId === pid) useProjeZekasi.setState({ becerilerYukleme: "hata", becerilerHata: hataMetni(e) });
  }
}

/** Beceri okununca çekirdek kullanım sayısını artırır; listedeki sayı da güncellenir */
export function beceriUygula(b: Beceri) {
  useProjeZekasi.setState((d) => ({ beceriler: d.beceriler.map((x) => (x.ad === b.ad ? { ...x, kullanim: b.kullanim } : x)) }));
}

export async function sozleriYukle(pid: string): Promise<void> {
  projeyeGec(pid);
  if (useProjeZekasi.getState().sozlerYukleme !== "hazir") useProjeZekasi.setState({ sozlerYukleme: "yukleniyor" });
  try {
    const sozler = await api.sozler(pid);
    if (useProjeZekasi.getState().projeId === pid) useProjeZekasi.setState({ sozler, sozlerYukleme: "hazir", sozlerHata: null });
  } catch (e) {
    if (useProjeZekasi.getState().projeId === pid) useProjeZekasi.setState({ sozlerYukleme: "hata", sozlerHata: hataMetni(e) });
  }
}

/** "soz.guncellendi" olayı: söz eklenir ya da güncellenir */
export function sozUygula(soz: Soz) {
  useProjeZekasi.setState((d) => {
    if (d.projeId !== soz.projeId || d.sozlerYukleme !== "hazir") return {};
    const i = d.sozler.findIndex((x) => x.id === soz.id);
    return { sozler: i === -1 ? [soz, ...d.sozler] : d.sozler.map((x) => (x.id === soz.id ? soz : x)) };
  });
}

// ---------------------------------------------------------------------------
// Ana yasa taslağı: düzenleme sekme ya da ekran değişince kaybolmaz
// ---------------------------------------------------------------------------

export interface TaslakMadde {
  /** Liste anahtarı; madde numarası sıradan gelir */
  anahtar: string;
  baslik: string;
  metin: string;
  /** Makine kuralı; desenler kaydederken desenMetni'nden ayrılır */
  kural: Omit<AnayasaKurali, "desenler"> | null;
  /** Desenler, her satıra bir düzenli ifade (yazarken boş satırlar korunur) */
  desenMetni: string;
}

export interface AnayasaTaslagi {
  projeId: string;
  /** Düzenlemeye başlarken yürürlükteki sürüm; arada yeni sürüm gelirse uyarılır */
  tabanSurum: number;
  maddeler: TaslakMadde[];
}

export const useAnayasaTaslagi = create<{ taslak: AnayasaTaslagi | null }>()(() => ({ taslak: null }));

let maddeSayaci = 0;

export function yeniTaslakMadde(m?: { baslik: string; metin: string; kural: AnayasaKurali | null }): TaslakMadde {
  return {
    anahtar: `m${++maddeSayaci}`,
    baslik: m?.baslik ?? "",
    metin: m?.metin ?? "",
    kural: m?.kural ? { hedef: m.kural.hedef, karar: m.kural.karar } : null,
    desenMetni: m?.kural?.desenler.join("\n") ?? "",
  };
}

/** Düzenlemeyi başlatır; madde yoksa boş bir maddeyle */
export function anayasaTaslagiBaslat(projeId: string, tabanSurum: number, maddeler: { baslik: string; metin: string; kural: AnayasaKurali | null }[]) {
  const liste = maddeler.map((m) => yeniTaslakMadde(m));
  useAnayasaTaslagi.setState({ taslak: { projeId, tabanSurum, maddeler: liste.length ? liste : [yeniTaslakMadde()] } });
}

export function anayasaTaslagiKapat() {
  useAnayasaTaslagi.setState({ taslak: null });
}

export function taslakMaddeleriniAyarla(degistir: (m: TaslakMadde[]) => TaslakMadde[]) {
  useAnayasaTaslagi.setState((d) => (d.taslak ? { taslak: { ...d.taslak, maddeler: degistir(d.taslak.maddeler) } } : {}));
}

/** Desen metnini düzenli ifadelere ayırır: boş satırlar atılır */
export function desenleriAyir(metin: string): string[] {
  return metin
    .split("\n")
    .map((d) => d.trim())
    .filter(Boolean);
}
