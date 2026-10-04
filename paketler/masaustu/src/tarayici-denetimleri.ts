// Uygulama içi tarayıcının Electron'a bağımlı olmayan kuralları: adres, gezinme, yeni pencere, izin ve <webview>
// kararları; Stüdyo'dan ve sayfadan gelen IPC verisinin doğrulanması; ekran görüntüsü alanı; kısayollar.
// Birim testleri: tarayici-denetimleri.test.ts

import type { SayfaSecimi, TarayiciKisayolu, TarayiciKomutu, TarayiciSiniri } from "./kopru.js";

/** Tarayıcının oturum bölümü: çerezleri ve depolaması ana uygulamanınkinden ayrıdır, diske yazılır */
export const TARAYICI_BOLUMU = "persist:arnorg-tarayici";

function protokol(adres: string): string | null {
  try {
    return new URL(adres).protocol;
  } catch {
    return null;
  }
}

/** Tarayıcı görünümünün (ana çerçeve) gidebileceği adres: yalnız http, https ve boş sayfa */
export function tarayiciAdresiMi(adres: string): boolean {
  const p = protokol(adres);
  return p === "http:" || p === "https:" || adres === "about:blank";
}

/**
 * Sayfadaki alt çerçevelerin (iframe) gidebileceği adres: web adresleri, about:blank/srcdoc, data: ve blob:.
 * file:, chrome:, devtools: gibi yerel ve iç protokoller reddedilir.
 */
export function cerceveAdresiMi(adres: string): boolean {
  const p = protokol(adres);
  return p === "http:" || p === "https:" || p === "about:" || p === "data:" || p === "blob:";
}

export type YeniPencereKarari = { tur: "ayni-gorunum"; adres: string } | { tur: "ret" };

/** Tarayıcıdaki window.open ve target=_blank: http(s) adresi aynı görünümde açılır, gerisi reddedilir */
export function tarayiciYeniPencereKarari(adres: string): YeniPencereKarari {
  const p = protokol(adres);
  return p === "http:" || p === "https:" ? { tur: "ayni-gorunum", adres } : { tur: "ret" };
}

/**
 * Tarayıcının izin istekleri ve denetimleri: hepsi reddedilir (kamera, mikrofon, konum, bildirim, pano okuma,
 * tam ekran, MIDI, USB/HID/seri aygıt, ekran paylaşımı, yerel ağ erişimi …).
 */
export function tarayiciIzniVerilirMi(_izin: string): boolean {
  return false;
}

/**
 * <webview> eklenmek istendiğinde: hiçbir içerikte izin verilmez. Uygulama içi tarayıcı ana süreçte yönetilen bir
 * WebContentsView'dır; ana pencerede webviewTag kapalı kalır, sayfanın ayarlarını Stüdyo belirleyemez.
 */
export function webviewEklemeKarari(_ayrinti?: unknown): "ret" {
  return "ret";
}

/** Tarayıcı oturumunun kullanıcı aracısı: Electron ve uygulama adı çıkarılır (siteler sıradan Chromium görür) */
export function tarayiciKullaniciAjani(ua: string): string {
  return ua
    .replace(/\s(Electron|ArnOrg|arnorg|@arnorg\/masaustu)\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** İndirilen dosyanın kaydetme penceresinde önerilecek adı: yalnız son parça; yasak ve denetim karakterleri atılır */
export function indirmeAdi(ad: string): string {
  const temiz = (ad.split(/[\\/]/).pop() ?? "")
    .replace(/[:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  return temiz || "indirme";
}

const sayiMi = (d: unknown): d is number => typeof d === "number" && Number.isFinite(d);
const SINIR = 100_000;

/** Stüdyo'dan gelen görünüm yeri (CSS piksel); bozuksa null */
export function sinirAyristir(veri: unknown): TarayiciSiniri | null {
  if (!veri || typeof veri !== "object") return null;
  const v = veri as Record<string, unknown>;
  const { x, y, genislik, yukseklik } = v;
  if (!sayiMi(x) || !sayiMi(y) || !sayiMi(genislik) || !sayiMi(yukseklik)) return null;
  if (Math.abs(x) > SINIR || Math.abs(y) > SINIR || genislik < 0 || yukseklik < 0 || genislik > SINIR || yukseklik > SINIR) return null;
  return { x, y, genislik, yukseklik };
}

/** Stüdyo'dan gelen komut; tanınmayan ya da bozuk komut null */
export function tarayiciKomutunuAyristir(veri: unknown): TarayiciKomutu | null {
  if (!veri || typeof veri !== "object") return null;
  const v = veri as Record<string, unknown>;
  switch (v.tur) {
    case "git":
      return typeof v.adres === "string" && v.adres.length <= 8192 ? { tur: "git", adres: v.adres } : null;
    case "geri":
    case "ileri":
    case "yenile":
    case "durdur":
    case "secimiBirak":
    case "kare":
    case "durum":
      return { tur: v.tur };
    case "yerlestir": {
      if (v.sinir === null) return { tur: "yerlestir", sinir: null };
      const sinir = sinirAyristir(v.sinir);
      return sinir ? { tur: "yerlestir", sinir } : null;
    }
    case "secici":
      return typeof v.acik === "boolean" ? { tur: "secici", acik: v.acik, ipucu: typeof v.ipucu === "string" ? v.ipucu.slice(0, 160) : "" } : null;
    default:
      return null;
  }
}

function metin(d: unknown, sinir: number): string | null {
  return typeof d === "string" ? d.slice(0, sinir) : null;
}

/**
 * Sayfadan gelen seçim (sayfa betiği değiştirilebilir sayılır): türler denetlenir, metinler sınırlanır. Adres
 * http(s) olmalı; seçici boş olamaz. Bozuksa null.
 */
export function secimAyristir(veri: unknown): SayfaSecimi | null {
  if (!veri || typeof veri !== "object") return null;
  const v = veri as Record<string, unknown>;
  const adres = metin(v.adres, 4000);
  const secici = metin(v.secici, 2000);
  if (!adres || !secici?.trim() || !tarayiciAdresiMi(adres) || adres === "about:blank") return null;
  const st = (v.stiller && typeof v.stiller === "object" ? v.stiller : {}) as Record<string, unknown>;
  const k = (v.kutu && typeof v.kutu === "object" ? v.kutu : null) as Record<string, unknown> | null;
  const g = (v.gorunum && typeof v.gorunum === "object" ? v.gorunum : null) as Record<string, unknown> | null;
  if (!k || !g) return null;
  const kutu = [k.x, k.y, k.genislik, k.yukseklik, k.sayfaX, k.sayfaY];
  if (!kutu.every((n) => sayiMi(n) && Math.abs(n) <= 1_000_000) || (k.genislik as number) < 0 || (k.yukseklik as number) < 0) return null;
  if (!sayiMi(g.genislik) || !sayiMi(g.yukseklik) || g.genislik < 1 || g.yukseklik < 1 || g.genislik > SINIR || g.yukseklik > SINIR) return null;
  return {
    adres,
    sayfaBasligi: metin(v.sayfaBasligi, 500) ?? "",
    secici,
    ogeMetni: metin(v.ogeMetni, 500) ?? "",
    ogeHtml: metin(v.ogeHtml, 2000) ?? "",
    stiller: {
      yaziTipi: metin(st.yaziTipi, 300) ?? "",
      boyut: metin(st.boyut, 40) ?? "",
      renk: metin(st.renk, 100) ?? "",
      arkaPlan: metin(st.arkaPlan, 100) ?? "",
    },
    kutu: { x: k.x as number, y: k.y as number, genislik: k.genislik as number, yukseklik: k.yukseklik as number, sayfaX: k.sayfaX as number, sayfaY: k.sayfaY as number },
    gorunum: { genislik: Math.round(g.genislik), yukseklik: Math.round(g.yukseklik) },
  };
}

export interface Dikdortgen {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Stüdyo'nun CSS pikselindeki yeri pencere içi DIP'e çevirir (Stüdyo'nun yakınlaştırması: olcek) */
export function gorunumDikdortgeni(sinir: TarayiciSiniri, olcek: number): Dikdortgen {
  const x = Math.round(sinir.x * olcek);
  const y = Math.round(sinir.y * olcek);
  return { x, y, width: Math.max(0, Math.round((sinir.x + sinir.genislik) * olcek) - x), height: Math.max(0, Math.round((sinir.y + sinir.yukseklik) * olcek) - y) };
}

/**
 * Öğe ekran görüntüsünün alanı: öğenin kutusu ve çevresinde pay, görünümün içine kırpılır, sayfanın
 * yakınlaştırmasıyla (olcek) DIP'e çevrilir. Öğe görünümün dışındaysa null.
 */
export function kirpmaAlani(
  kutu: { x: number; y: number; genislik: number; yukseklik: number },
  gorunum: { genislik: number; yukseklik: number },
  pay: number,
  olcek: number,
): Dikdortgen | null {
  const x0 = Math.max(0, kutu.x - pay);
  const y0 = Math.max(0, kutu.y - pay);
  const x1 = Math.min(gorunum.genislik, kutu.x + kutu.genislik + pay);
  const y1 = Math.min(gorunum.yukseklik, kutu.y + kutu.yukseklik + pay);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  const x = Math.floor(x0 * olcek);
  const y = Math.floor(y0 * olcek);
  return { x, y, width: Math.ceil(x1 * olcek) - x, height: Math.ceil(y1 * olcek) - y };
}

export interface KlavyeGirdisi {
  type: string;
  key: string;
  code?: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/** Sayfa odaktayken Stüdyo'ya giden kısayollar: Ctrl/Cmd+L adres çubuğu, Ctrl/Cmd+Shift+C öğe seçici */
export function kisayolKarari(g: KlavyeGirdisi, platform: string): TarayiciKisayolu | null {
  if (g.type !== "keyDown" || g.alt) return null;
  const ana = platform === "darwin" ? g.meta && !g.control : g.control && !g.meta;
  if (!ana) return null;
  const tus = g.key.toLowerCase();
  if (!g.shift && (tus === "l" || g.code === "KeyL")) return "adres";
  if (g.shift && (tus === "c" || g.code === "KeyC")) return "secici";
  return null;
}
