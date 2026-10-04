// Çekirdekten gelen veri: projeler ve etkin projenin ekip, görev, kanal, onay, denetim, kullanım ve akış verisi
import type {
  Ajan,
  AkisOgesi,
  Anayasa,
  Ayarlar,
  KurulBildirimi,
  DenetimKaydi,
  Gorev,
  HesapDurumu,
  Kanal,
  KullanimOzeti,
  Mesaj,
  Onay,
  ProjeOzeti,
  Rol,
  Saglik,
} from "@arnorg/ortak";
import { diliAyarla, type Sozluk } from "../dil";
import { create } from "zustand";
import type { WsDurumu } from "../api/canli";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import type { AracSinifi } from "../yardimcilar/arac";

export type Yukleme = "bos" | "yukleniyor" | "hazir" | "hata";

/** Düz metin ya da geçerli sözlükten üreten işlev; rayda saklanan metin dil değişince yeniden çevrilsin diye */
export type CevrilenMetin = string | ((s: Sozluk) => string);

export function metinCevir(m: CevrilenMetin, s: Sozluk): string {
  return typeof m === "function" ? m(s) : m;
}

/** Canlı akış rayındaki tek satır */
export interface CanliOlay {
  id: string;
  zaman: string;
  ajanId: string | null;
  ajanAd: CevrilenMetin;
  etiket: CevrilenMetin;
  sinif: AracSinifi | "ret" | "sor" | "ok" | "bilgi";
  hedef: CevrilenMetin;
}

export interface VeriDurumu {
  saglik: Saglik | null;
  /** Claude girişi ve abonelik kullanım pencereleri */
  hesap: HesapDurumu | null;
  wsDurumu: WsDurumu;
  projeler: ProjeOzeti[];
  projelerYukleme: Yukleme;
  aktifProjeId: string | null;
  projeYukleme: Yukleme;
  projeHatasi: string | null;
  ajanlar: Ajan[];
  gorevler: Gorev[];
  kanallar: Kanal[];
  mesajlar: Record<string, Mesaj[]>;
  mesajYukleme: Record<string, Yukleme>;
  okunmamis: Record<string, number>;
  onaylar: Onay[];
  denetim: DenetimKaydi[];
  /** Etkin projenin token kullanımı (bugün ve toplam, ajan başına) */
  kullanim: KullanimOzeti | null;
  akislar: Record<string, AkisOgesi[]>;
  akisYukleme: Record<string, Yukleme>;
  canli: CanliOlay[];
  roller: Rol[];
  /** Çekirdek ayarları (ilk kurulum sihirbazı kurulumTamam'a bakar) */
  ayarlar: Ayarlar | null;
  /** Kanal → yanıt hazırlayan ajanlar ("yazıyor" göstergesi) */
  yaziyorlar: Record<string, { ajanId: string; ad: string }[]>;
  /** Önemli anlarda kurula açılır pencereler (onay, öneri, istek, yetki, teslim); en yeni sonda */
  kurulBildirimleri: KurulBildirimi[];
  /** Etkin projenin ana yasası (yüklenince) */
  anayasa: Anayasa | null;
}

const AKTIF_PROJE = "arnorg.aktifProje";

function kayitliProje(): string | null {
  try {
    return localStorage.getItem(AKTIF_PROJE);
  } catch {
    return null;
  }
}

const projeVerisiBos = {
  projeYukleme: "bos" as Yukleme,
  projeHatasi: null,
  ajanlar: [],
  gorevler: [],
  kanallar: [],
  mesajlar: {},
  mesajYukleme: {},
  okunmamis: {},
  onaylar: [],
  denetim: [],
  kullanim: null,
  akislar: {},
  akisYukleme: {},
  canli: [],
  yaziyorlar: {},
  anayasa: null,
} satisfies Partial<VeriDurumu>;

export const useVeri = create<VeriDurumu>()(() => ({
  saglik: null,
  hesap: null,
  wsDurumu: "baglaniyor",
  projeler: [],
  projelerYukleme: "bos",
  aktifProjeId: kayitliProje(),
  roller: [],
  ayarlar: null,
  kurulBildirimleri: [],
  ...projeVerisiBos,
}));

const ayarla = useVeri.setState;
const al = useVeri.getState;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Kimliğe göre ekler ya da değiştirir */
export function guncelleYaEkle<T extends { id: string }>(liste: T[], oge: T, basa = false): T[] {
  const i = liste.findIndex((x) => x.id === oge.id);
  if (i === -1) return basa ? [oge, ...liste] : [...liste, oge];
  const kopya = liste.slice();
  kopya[i] = oge;
  return kopya;
}

export function ajanBul(id: string | null | undefined): Ajan | undefined {
  if (!id) return undefined;
  return al().ajanlar.find((a) => a.id === id);
}

export function aktifMi(a: Ajan): boolean {
  return a.durum === "calisiyor" || a.durum === "karar_bekliyor";
}

/** Oturumu açık olan (durdurulabilir) ajan */
export function oturumAcikMi(a: Ajan): boolean {
  return a.durum !== "kapali";
}

export function ceoBul(ajanlar: Ajan[]): Ajan | undefined {
  return ajanlar.find((a) => a.rol === "ceo") ?? ajanlar.find((a) => a.yoneticiId === null);
}

const onayZamaniSirala = (a: Onay, b: Onay) => b.olusturma.localeCompare(a.olusturma);

// ---------------------------------------------------------------------------
// Yükleme eylemleri
// ---------------------------------------------------------------------------

export async function sagligiYukle() {
  try {
    const saglik = await api.saglik();
    ayarla({ saglik });
    // Dil çekirdek ayarıdır (ajanlar da o dilde konuşur); arayüz ona uyar
    if (saglik.dil) diliAyarla(saglik.dil);
  } catch {
    // Sağlık bilgisi isteğe bağlı; Ayarlar ekranı kendi hatasını gösterir
  }
  void hesabiYukle();
}

/** Çekirdek ayarları; ilk kurulum sihirbazı ve Ayarlar kullanır */
export async function ayarlariYukle(): Promise<Ayarlar | null> {
  try {
    const ayarlar = await api.ayarlar();
    ayarla({ ayarlar });
    return ayarlar;
  } catch {
    return null;
  }
}

/** Ayarları kaydeder ve depodaki kopyayı günceller */
export async function ayarlariKaydet(degisiklik: Partial<Ayarlar>): Promise<Ayarlar> {
  const ayarlar = await api.ayarlariKaydet(degisiklik);
  ayarla({ ayarlar });
  return ayarlar;
}

/** Etkin projenin ana yasası */
export async function anayasayiYukle(): Promise<Anayasa | null> {
  const pid = al().aktifProjeId;
  if (!pid) return null;
  const anayasa = await api.anayasa(pid);
  if (al().aktifProjeId === pid) ayarla({ anayasa });
  return anayasa;
}

/** Kurula açılır pencere kuyruğu: aynı kimlik bir kez; en çok 6 açık pencere */
export function kurulBildirimiEkle(b: KurulBildirimi) {
  ayarla((d) => (d.kurulBildirimleri.some((x) => x.id === b.id) ? {} : { kurulBildirimleri: [...d.kurulBildirimleri, b].slice(-6) }));
}

export function kurulBildirimiKapat(id: string) {
  ayarla((d) => ({ kurulBildirimleri: d.kurulBildirimleri.filter((b) => b.id !== id) }));
}

/** Kanal "yazıyor" göstergesi */
export function yaziyorUygula(kanal: string, ajanId: string, ad: string, yaziyor: boolean) {
  ayarla((d) => {
    const liste = (d.yaziyorlar[kanal] ?? []).filter((x) => x.ajanId !== ajanId);
    return { yaziyorlar: { ...d.yaziyorlar, [kanal]: yaziyor ? [...liste, { ajanId, ad }] : liste } };
  });
}

/** Claude girişi ve abonelik kullanımı; tazele=true Claude Code'a yeniden sorar */
export async function hesabiYukle(tazele = false) {
  try {
    ayarla({ hesap: await api.hesap(tazele) });
  } catch {
    // Hesap bilgisi isteğe bağlı; üst çubuk yalnız gizlenir
  }
}

export async function projeleriYukle() {
  if (al().projelerYukleme !== "hazir") ayarla({ projelerYukleme: "yukleniyor" });
  try {
    const projeler = await api.projeler();
    ayarla({ projeler, projelerYukleme: "hazir" });
    const aktif = al().aktifProjeId;
    if (aktif && !projeler.some((p) => p.id === aktif)) projeyiSec(null);
  } catch (e) {
    ayarla({ projelerYukleme: "hata" });
    throw e;
  }
}

export async function rolleriYukle() {
  if (al().roller.length) return al().roller;
  const roller = await api.roller();
  ayarla({ roller });
  return roller;
}

let projeIstekSayaci = 0;

/** Etkin projeyi değiştirir; veriyi sıfırlar ve yeniden yükler */
export function projeyiSec(pid: string | null) {
  try {
    if (pid) localStorage.setItem(AKTIF_PROJE, pid);
    else localStorage.removeItem(AKTIF_PROJE);
  } catch {
    // depolama kapalı
  }
  ayarla({ aktifProjeId: pid, ...projeVerisiBos });
  if (pid) void projeVerisiniYukle();
}

/** Etkin projenin bütün temel verisini paralel yükler. sessiz: var olan veri gösterilirken tazeler */
export async function projeVerisiniYukle(sessiz = false) {
  const pid = al().aktifProjeId;
  if (!pid) return;
  const sayac = ++projeIstekSayaci;
  if (!sessiz) ayarla({ projeYukleme: "yukleniyor", projeHatasi: null });
  const gecerli = () => sayac === projeIstekSayaci && al().aktifProjeId === pid;

  const sonuclar = await Promise.allSettled([
    api.ajanlar(pid),
    api.gorevler(pid),
    api.kanallar(pid),
    api.onaylar(pid),
    api.denetim(pid, 300),
    api.kullanim(pid),
  ]);
  if (!gecerli()) return;
  const [ajanlar, gorevler, kanallar, onaylar, denetim, kullanim] = sonuclar;
  const hata = sonuclar.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;

  const yeni: Partial<VeriDurumu> = {};
  if (ajanlar.status === "fulfilled") yeni.ajanlar = ajanlar.value;
  if (gorevler.status === "fulfilled") yeni.gorevler = gorevler.value;
  if (kanallar.status === "fulfilled") yeni.kanallar = kanallar.value;
  if (onaylar.status === "fulfilled") yeni.onaylar = onaylar.value.slice().sort(onayZamaniSirala);
  if (denetim.status === "fulfilled") yeni.denetim = denetim.value;
  if (kullanim.status === "fulfilled") yeni.kullanim = kullanim.value;
  ayarla({
    ...yeni,
    projeYukleme: ajanlar.status === "fulfilled" ? "hazir" : "hata",
    projeHatasi: hata ? hataMetni(hata.reason) : null,
  });
  // Ray boş başlamasın: son denetim kayıtlarından tohumla
  if (!sessiz && denetim.status === "fulfilled") {
    ayarla({ canli: denetim.value.slice(0, 16).map(denetimdenCanli) });
  }
  // Yükleme sırasında açık kalan kanal ve akışları da tazele
  if (sessiz) {
    for (const kanal of Object.keys(al().mesajlar)) void kanalMesajlariniYukle(kanal, true);
    for (const aid of Object.keys(al().akislar)) void ajanAkisiniYukle(aid, true);
  }
}

export async function kanalMesajlariniYukle(kanal: string, zorla = false) {
  const pid = al().aktifProjeId;
  if (!pid) return;
  const durum = al().mesajYukleme[kanal];
  if (!zorla && (durum === "hazir" || durum === "yukleniyor")) return;
  ayarla((d) => ({ mesajYukleme: { ...d.mesajYukleme, [kanal]: durum === "hazir" ? "hazir" : "yukleniyor" } }));
  try {
    const mesajlar = await api.mesajlar(pid, kanal, 200);
    if (al().aktifProjeId !== pid) return;
    ayarla((d) => ({
      mesajlar: { ...d.mesajlar, [kanal]: mesajlar },
      mesajYukleme: { ...d.mesajYukleme, [kanal]: "hazir" },
    }));
  } catch (e) {
    ayarla((d) => ({ mesajYukleme: { ...d.mesajYukleme, [kanal]: "hata" } }));
    throw e;
  }
}

export function kanalOkundu(kanal: string) {
  if (!al().okunmamis[kanal]) return;
  ayarla((d) => ({ okunmamis: { ...d.okunmamis, [kanal]: 0 } }));
}

const AKIS_SINIRI = 1000;

export async function ajanAkisiniYukle(aid: string, zorla = false) {
  const durum = al().akisYukleme[aid];
  if (!zorla && (durum === "hazir" || durum === "yukleniyor")) return;
  ayarla((d) => ({ akisYukleme: { ...d.akisYukleme, [aid]: durum === "hazir" ? "hazir" : "yukleniyor" } }));
  try {
    const ogeler = await api.ajanAkis(aid, AKIS_SINIRI);
    ayarla((d) => {
      // Yükleme sürerken ws ile gelenleri koru
      const gelen = d.akislar[aid] ?? [];
      const kimlikler = new Set(ogeler.map((o) => o.id));
      const ek = gelen.filter((o) => !kimlikler.has(o.id));
      return {
        akislar: { ...d.akislar, [aid]: [...ogeler, ...ek] },
        akisYukleme: { ...d.akisYukleme, [aid]: "hazir" },
      };
    });
  } catch (e) {
    ayarla((d) => ({ akisYukleme: { ...d.akisYukleme, [aid]: "hata" } }));
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Canlı akış rayı
// ---------------------------------------------------------------------------

const CANLI_SINIRI = 80;

export function canliEkle(olay: CanliOlay) {
  ayarla((d) => {
    if (d.canli.some((o) => o.id === olay.id)) return {};
    return { canli: [olay, ...d.canli].slice(0, CANLI_SINIRI) };
  });
}

export function denetimdenCanli(k: DenetimKaydi): CanliOlay {
  const sinif = k.karar === "ret" ? "ret" : k.karar === "sor" ? "sor" : k.karar === "degisti" ? "sor" : undefined;
  return {
    id: `d-${k.id}`,
    zaman: k.zaman,
    ajanId: k.ajanId,
    ajanAd: k.ajanAd,
    etiket: k.karar === "izin" ? k.arac.replace(/^mcp__[^_]+__/, "") : (s) => `${k.arac} · ${s.gezinti.ray.karar[k.karar]}`,
    sinif: sinif ?? aracSinifiCanli(k.arac),
    hedef: k.girdiOzeti,
  };
}

function aracSinifiCanli(arac: string): CanliOlay["sinif"] {
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(arac)) return "yaz";
  if (/^(Bash|PowerShell)$/.test(arac)) return "kabuk";
  if (arac.startsWith("mcp__")) return "mcp";
  if (/^(Task|Agent)$/.test(arac)) return "alt";
  return "oku";
}

// ---------------------------------------------------------------------------
// Doğrudan değişiklikler (API yanıtlarını beklemeden ws gelmeden uygulamak için)
// ---------------------------------------------------------------------------

export function ajanUygula(ajan: Ajan) {
  if (ajan.projeId !== al().aktifProjeId) return;
  ayarla((d) => ({ ajanlar: guncelleYaEkle(d.ajanlar, ajan) }));
}

export function ajanKaldir(ajanId: string) {
  ayarla((d) => ({ ajanlar: d.ajanlar.filter((a) => a.id !== ajanId) }));
}

export function gorevUygula(gorev: Gorev) {
  if (gorev.projeId !== al().aktifProjeId) return;
  ayarla((d) => ({ gorevler: guncelleYaEkle(d.gorevler, gorev) }));
}

export function onayUygula(onay: Onay) {
  if (onay.projeId !== al().aktifProjeId) return;
  ayarla((d) => ({ onaylar: guncelleYaEkle(d.onaylar, onay, true).sort(onayZamaniSirala) }));
}

export function mesajUygula(mesaj: Mesaj) {
  if (mesaj.projeId !== al().aktifProjeId) return;
  ayarla((d) => {
    const yuklu = d.mesajlar[mesaj.kanal];
    const varMi = yuklu?.some((m) => m.id === mesaj.id);
    const kanallar = d.kanallar.some((k) => k.ad === mesaj.kanal)
      ? d.kanallar.map((k) => (k.ad === mesaj.kanal && !varMi ? { ...k, mesajSayisi: k.mesajSayisi + 1 } : k))
      : [...d.kanallar, { ad: mesaj.kanal, aciklama: "", mesajSayisi: 1 }];
    return {
      kanallar,
      mesajlar: yuklu && !varMi ? { ...d.mesajlar, [mesaj.kanal]: [...yuklu, mesaj] } : d.mesajlar,
    };
  });
}

export function projeUygula(proje: ProjeOzeti) {
  ayarla((d) => ({ projeler: guncelleYaEkle(d.projeler, proje) }));
}

export function akisOgesiEkle(oge: AkisOgesi) {
  ayarla((d) => {
    const liste = d.akislar[oge.ajanId];
    // Akış hiç açılmadıysa biriktirmeye gerek yok; açılınca sunucudan yüklenir
    if (!liste) return {};
    if (liste.some((o) => o.id === oge.id)) return {};
    const yeni = liste.length >= AKIS_SINIRI * 5 ? [...liste.slice(-AKIS_SINIRI * 4), oge] : [...liste, oge];
    return { akislar: { ...d.akislar, [oge.ajanId]: yeni } };
  });
}
