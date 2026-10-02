// Çekirdekten gelen veri: projeler ve etkin projenin ekip, görev, kanal, onay, denetim, maliyet ve akış verisi
import type {
  Ajan,
  AkisOgesi,
  DenetimKaydi,
  Gorev,
  Kanal,
  MaliyetOzeti,
  Mesaj,
  Onay,
  ProjeOzeti,
  Rol,
  Saglik,
} from "@arnorg/ortak";
import { create } from "zustand";
import type { WsDurumu } from "../api/canli";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import type { AracSinifi } from "../yardimcilar/arac";

export type Yukleme = "bos" | "yukleniyor" | "hazir" | "hata";

/** Canlı akış rayındaki tek satır */
export interface CanliOlay {
  id: string;
  zaman: string;
  ajanId: string | null;
  ajanAd: string;
  etiket: string;
  sinif: AracSinifi | "ret" | "sor" | "ok" | "bilgi";
  hedef: string;
}

export interface VeriDurumu {
  saglik: Saglik | null;
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
  maliyet: MaliyetOzeti | null;
  akislar: Record<string, AkisOgesi[]>;
  akisYukleme: Record<string, Yukleme>;
  canli: CanliOlay[];
  roller: Rol[];
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
  maliyet: null,
  akislar: {},
  akisYukleme: {},
  canli: [],
} satisfies Partial<VeriDurumu>;

export const useVeri = create<VeriDurumu>()(() => ({
  saglik: null,
  wsDurumu: "baglaniyor",
  projeler: [],
  projelerYukleme: "bos",
  aktifProjeId: kayitliProje(),
  roller: [],
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
    ayarla({ saglik: await api.saglik() });
  } catch {
    // Sağlık bilgisi isteğe bağlı; Ayarlar ekranı kendi hatasını gösterir
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
    api.maliyet(pid),
  ]);
  if (!gecerli()) return;
  const [ajanlar, gorevler, kanallar, onaylar, denetim, maliyet] = sonuclar;
  const hata = sonuclar.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;

  const yeni: Partial<VeriDurumu> = {};
  if (ajanlar.status === "fulfilled") yeni.ajanlar = ajanlar.value;
  if (gorevler.status === "fulfilled") yeni.gorevler = gorevler.value;
  if (kanallar.status === "fulfilled") yeni.kanallar = kanallar.value;
  if (onaylar.status === "fulfilled") yeni.onaylar = onaylar.value.slice().sort(onayZamaniSirala);
  if (denetim.status === "fulfilled") yeni.denetim = denetim.value;
  if (maliyet.status === "fulfilled") yeni.maliyet = maliyet.value;
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
    etiket: k.karar === "izin" ? k.arac.replace(/^mcp__[^_]+__/, "") : `${k.arac} · ${kararKisa(k.karar)}`,
    sinif: sinif ?? aracSinifiCanli(k.arac),
    hedef: k.girdiOzeti,
  };
}

function kararKisa(k: DenetimKaydi["karar"]): string {
  return k === "ret" ? "reddedildi" : k === "sor" ? "onaya soruldu" : k === "degisti" ? "girdi değişti" : "izin";
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
