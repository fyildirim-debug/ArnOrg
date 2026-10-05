// Proje adresleri (0.0.8), Tarayıcı'da "Linkler" (0.0.9): projenin açılabilen adresleri (geliştirme sunucusu, API,
// önizleme, test ya da canlı yayın, yönetim paneli).
//
// - CEO projenin linklerini, çalışanlar başlattıkları sunucuların adresini mcp__arnorg__adres_bildir ve adres_kaldir
//   ile tutar (adres-araclari.ts); kurul Tarayıcı'dan elle ekler ve kaldırır (adres-uclari.ts).
// - ArnOrg çalışanların kabuk çıktısındaki "Local: http://localhost:5173", "listening on http://…", "Server running
//   at …" gibi satırları araç sonrası kancasında yakalar (yalnız yerel makine ve yerel ağ adresleri).
// - Yerel, yerel ağ ve çekirdeğin izinli sunucusundaki adresler ara ara yoklanır: yalnız TCP bağlantısı kurulur, HTTP
//   isteği atılmaz. Kalıcı link kaldırılana dek durur. Kalıcı olmayan adres uzun süre kapalı kalınca düşer; yoklanmayanı
//   bir gün yenilenmezse düşer.
// - Adres kuralları web/adres.ts ve masaüstü tarayıcısınınkiyle aynı: yalnız http ve https, kullanıcı adı ya da
//   parola taşıyan adres reddedilir.
// Liste proje başına depo değerinde saklanır; her değişiklikte adresler.guncellendi (tam liste) yayınlanır.
// Uç: GET /api/projeler/:pid/adresler (adres-uclari.ts).
import crypto from "node:crypto";
import net from "node:net";
import type { Ajan, ProjeAdresi, SunucuOlayi } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import { httpAdresi, yerelAdresMi } from "./web/adres.js";
import { ArnorgHatasi, simdi } from "./yardimci.js";

/** Proje başına en çok adres */
export const ADRES_SINIRI = 20;
/** Yoklama aralığı ve tek yoklamanın süresi */
export const YOKLAMA_ARALIGI_MS = 20_000;
export const YOKLAMA_SURESI_MS = 2_000;
/** Bu kadar süre kapalı kalan adres düşer */
export const KAPALI_DUSME_MS = 5 * 60_000;
/** Yoklanmayan (uzak) adres bu kadar süre yenilenmezse düşer */
export const YOKLANMAYAN_DUSME_MS = 24 * 60 * 60_000;
/** Kabuk çıktısından taranan en çok karakter */
const TARAMA_SINIRI = 200_000;
const AD_SINIRI = 60;

/** Sunucuya TCP bağlantısı kurulabiliyor mu; testler kendi yoklayıcısını verir */
export type Yoklayici = (sunucu: string, port: number, sureMs: number) => Promise<boolean>;

export const tcpYoklayici: Yoklayici = (sunucu, port, sureMs) =>
  new Promise((coz) => {
    // localhost hem ::1 hem 127.0.0.1 olabilir; autoSelectFamily ikisini de dener
    const soket = net.connect({ host: sunucu, port, autoSelectFamily: true });
    const zamanlayici = setTimeout(() => bitir(false), sureMs);
    function bitir(sonuc: boolean) {
      clearTimeout(zamanlayici);
      soket.destroy();
      coz(sonuc);
    }
    soket.once("connect", () => bitir(true));
    soket.once("error", () => bitir(false));
  });

export interface AdresBildirimi {
  adres: string;
  ad?: string | null;
  /** Bildiren ajan; kurulun eklediği linkte null. Rol, kalıcılığın varsayılanını belirler (CEO'nunki kalıcı) */
  bildiren: (Pick<Ajan, "id" | "ad"> & { rol?: Ajan["rol"] }) | null;
  kaynak: ProjeAdresi["kaynak"];
  /**
   * Kalıcı mı. Verilmezse yeni adreste: kurulun ve CEO'nun eklediği ve yerel ağ dışındaki adres kalıcı, çalışanın
   * yerel sunucusu ve çıktıdan yakalanan kalıcı değil; var olan adreste değişmez
   */
  kalici?: boolean;
}

/** Yeni adresin kalıcılığı: verildiyse o; yoksa kurulun, CEO'nun ve yerel ağ dışındaki bildirim kalıcıdır */
function varsayilanKalici(g: AdresBildirimi, u: URL): boolean {
  if (g.kalici !== undefined) return g.kalici;
  if (g.kaynak === "cikti") return false;
  return g.kaynak === "kurul" || g.bildiren?.rol === "ceo" || !yerelAdresMi(u);
}

/** Bildirenin görünen adı: ajanın adı; kurulun eklediğinde "Kurul" */
function bildirenAdi(g: AdresBildirimi): string {
  return g.bildiren?.ad ?? (g.kaynak === "kurul" ? iki("Kurul", "Board") : "ArnOrg");
}

export interface AdresBaglami {
  depo: Pick<Depo, "deger" | "degerYaz" | "projeler" | "ajan">;
  olaylar: { yayinla(o: SunucuOlayi): void };
  yoklayici?: Yoklayici;
  /** Testlerde saat */
  saat?: () => number;
}

// ---------------------------------------------------------------------------
// Adresin normal biçimi
// ---------------------------------------------------------------------------

/** Doğrulanmış ve normal biçime getirilmiş adres: http(s), kimlik bilgisi yok, 0.0.0.0 ve :: yerine localhost */
export function adresiNormallestir(girdi: string): URL {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(girdi.trim()) && !/^https?:\/\//i.test(girdi.trim())) {
    throw new ArnorgHatasi(iki("Proje adresi http ya da https olmalı.", "A project address must be http or https."));
  }
  const u = httpAdresi(girdi);
  if (u.username || u.password) throw new ArnorgHatasi(iki("Adreste kullanıcı adı ya da parola olmasın.", "The address must not contain a user name or password."));
  const sunucu = u.hostname.replace(/^\[|\]$/g, "");
  if (sunucu === "0.0.0.0" || sunucu === "::") u.hostname = "localhost";
  u.hash = "";
  return u;
}

/** Aynı adres sayılanların anahtarı: sondaki "/" ve parça kimliği yok sayılır */
function anahtar(u: URL): string {
  return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
}

export function adresKimligi(u: URL): string {
  return crypto.createHash("sha1").update(anahtar(u)).digest("hex").slice(0, 12);
}

function portu(u: URL): number {
  return u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
}

function adTemizle(ad: string | null | undefined): string | null {
  const t = (ad ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, AD_SINIRI) : null;
}

// ---------------------------------------------------------------------------
// Kabuk çıktısında sunucu adresi
// ---------------------------------------------------------------------------

/** Sunucunun açıldığını söyleyen satır: "Local:", "listening on", "Server running at", "ready on", "url:" … */
const SUNUCU_SATIRI = [
  /\b(local|loopback|url|address|adres)\s*:/i,
  /\blisten(ing|s)?\b/i,
  /\b(running|started|ready|serving|available|waiting|live|up)\s+(at|on|in)\b/i,
  /\bserver\s+(is\s+)?(running|started|listening|ready|at|on)\b/i,
  /\bopen\s+(your\s+browser\s+(on|at|to)|http)/i,
];
/** Aynı sunucunun ağdaki ikinci adresi (Vite "Network:"); yerel adresi yeter */
const AG_SATIRI = /\b(network|on your network)\s*:/i;
/** http(s) adresi; IPv6 sunucu köşeli parantezle ([::1]:5173) */
const ADRES_DESENI = /https?:\/\/(?:\[[0-9a-f:.]+\](?::\d+)?|[^\s"'`<>()[\]{}|\\^/]+)(?:\/[^\s"'`<>()[\]{}|\\^]*)?/gi;
// eslint-disable-next-line no-control-regex
const RENK_KODU = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Yakalanan sunucunun adı: satırda ya da komutta geçen araç; bilinmiyorsa null (varsayılan ad verilir) */
const SUNUCU_ADLARI: [RegExp, string][] = [
  [/storybook/i, "Storybook"],
  [/vitepress/i, "VitePress"],
  [/vitest/i, "Vitest UI"],
  [/\bvite\b/i, "Vite"],
  [/next\.js|\bnext\s+(dev|start)\b/i, "Next.js"],
  [/\bnuxt\b/i, "Nuxt"],
  [/\bastro\b/i, "Astro"],
  [/\bangular\b|\bng\s+serve\b/i, "Angular"],
  [/\bremix\b/i, "Remix"],
  [/sveltekit|svelte-kit/i, "SvelteKit"],
  [/docusaurus/i, "Docusaurus"],
  [/\bgatsby\b/i, "Gatsby"],
  [/webpack/i, "webpack"],
  [/\bparcel\b/i, "Parcel"],
  [/\bexpo\b/i, "Expo"],
  [/\bhugo\b/i, "Hugo"],
  [/\bjekyll\b/i, "Jekyll"],
  [/\bdjango\b|manage\.py\s+runserver/i, "Django"],
  [/\bflask\b/i, "Flask"],
  [/\buvicorn\b|\bfastapi\b/i, "FastAPI"],
  [/\brails\b|\bpuma\b/i, "Rails"],
  [/\bwrangler\b/i, "Wrangler"],
  [/\bapi\b/i, "API"],
];

export interface YakalananAdres {
  adres: string;
  /** Satırdan ya da komuttan tanınan ad; yoksa null */
  ad: string | null;
}

/** Sunucunun adı: önce adresin satırı, sonra komut, sonra çıktının başındaki karşılama ("VITE v5 ready", "▲ Next.js") */
function sunucuAdi(satir: string, komut: string, bas: string): string | null {
  const bul = (m: string, apiDahil: boolean) => SUNUCU_ADLARI.find(([d, ad]) => (apiDahil || ad !== "API") && d.test(m))?.[1] ?? null;
  return bul(satir, true) ?? bul(komut, true) ?? bul(bas, false);
}

/** Kabuk çıktısındaki yerel sunucu adresleri (renk kodları atılır, aynı adres bir kez) */
export function sunucuAdresleri(cikti: string, komut = ""): YakalananAdres[] {
  const sonuc = new Map<string, YakalananAdres>();
  const metin = cikti.slice(0, TARAMA_SINIRI).replace(RENK_KODU, "");
  const bas = metin.slice(0, 2000);
  for (const satir of metin.split(/\r?\n/)) {
    if (!satir.includes("http") || AG_SATIRI.test(satir) || !SUNUCU_SATIRI.some((d) => d.test(satir))) continue;
    for (const ham of satir.match(ADRES_DESENI) ?? []) {
      let u: URL;
      try {
        u = adresiNormallestir(ham.replace(/[.,;:!?'")\]]+$/, ""));
      } catch {
        continue;
      }
      // Yalnız bu makinedeki ya da yerel ağdaki sunucular; dışarıdaki adresi çalışan kendisi bildirir
      if (!yerelAdresMi(u)) continue;
      const k = anahtar(u);
      if (sonuc.has(k)) continue;
      sonuc.set(k, { adres: u.href, ad: sunucuAdi(satir, komut, bas) });
    }
  }
  return [...sonuc.values()];
}

const KABUK_ARACLARI = new Set(["Bash", "PowerShell", "BashOutput"]);
/** Okunan günlük dosyası: arka planda başlatılan sunucunun çıktısı çoğu zaman böyle okunur */
const GUNLUK_DOSYASI = /\.(log|out|output|txt)$/i;

/** Araç yanıtındaki taranacak metin: kabuk çıktısı ya da okunan günlük dosyası; yoksa null */
export function taranacakMetin(arac: string, girdi: Record<string, unknown>, yanit: unknown): string | null {
  const metinler: string[] = [];
  const topla = (d: unknown) => {
    if (typeof d === "string") metinler.push(d);
  };
  if (KABUK_ARACLARI.has(arac)) {
    if (typeof yanit === "string") topla(yanit);
    else if (yanit && typeof yanit === "object") for (const k of ["stdout", "stderr", "output"]) topla((yanit as Record<string, unknown>)[k]);
  } else if (arac === "Read" && typeof girdi.file_path === "string" && GUNLUK_DOSYASI.test(girdi.file_path)) {
    const dosya = yanit && typeof yanit === "object" ? (yanit as { file?: { content?: unknown } }).file : undefined;
    topla(dosya?.content);
  }
  const metin = metinler.join("\n");
  return metin.trim() ? metin : null;
}

// ---------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------

const depoAnahtari = (projeId: string) => `proje-adresleri:${projeId}`;

/** Depodan okunan listeyi doğrular; bozuk kayıt atlanır */
function oku(ham: string | null, projeId: string): ProjeAdresi[] {
  if (!ham) return [];
  let veri: unknown;
  try {
    veri = JSON.parse(ham);
  } catch {
    return [];
  }
  if (!Array.isArray(veri)) return [];
  const liste: ProjeAdresi[] = [];
  for (const x of veri as Partial<ProjeAdresi>[]) {
    if (!x || typeof x.adres !== "string" || typeof x.ad !== "string" || typeof x.guncelleme !== "string") continue;
    let u: URL;
    try {
      u = adresiNormallestir(x.adres);
    } catch {
      continue;
    }
    const kaynak = x.kaynak === "cikti" || x.kaynak === "kurul" ? x.kaynak : "arac";
    liste.push({
      id: adresKimligi(u),
      projeId,
      adres: u.href,
      ad: x.ad,
      bildirenId: typeof x.bildirenId === "string" ? x.bildirenId : null,
      bildirenAd: typeof x.bildirenAd === "string" ? x.bildirenAd : "ArnOrg",
      kaynak,
      // 0.0.8 kaydında alan yok: çalışanın bildirdiği yerel ağ dışındaki adres kalıcı sayılır (eskiden bir günde düşerdi)
      kalici: typeof x.kalici === "boolean" ? x.kalici : kaynak !== "cikti" && !yerelAdresMi(u),
      guncelleme: x.guncelleme,
      durum: x.durum === "acik" || x.durum === "kapali" ? x.durum : "bilinmiyor",
      denetim: typeof x.denetim === "string" ? x.denetim : null,
      yoklanir: false,
    });
  }
  return liste;
}

export class ProjeAdresleri {
  private readonly listeler = new Map<string, ProjeAdresi[]>();
  /** "proje:adres kimliği" → kapalı görüldüğü ilk an; açık görülünce silinir */
  private readonly kapanmalar = new Map<string, number>();
  private izinli: string[] = [];
  private zamanlayici: NodeJS.Timeout | null = null;
  private yoklaniyor: Promise<void> | null = null;
  private baslatildi = false;
  private durdu = false;
  private readonly yoklayici: Yoklayici;
  private readonly saat: () => number;

  constructor(private readonly b: AdresBaglami) {
    this.yoklayici = b.yoklayici ?? tcpYoklayici;
    this.saat = b.saat ?? Date.now;
  }

  /** Çekirdeğin izinli sunucuları (--izinli-host): yerel ağ dışında olsalar da yoklanır */
  izinliHostlariAyarla(hostlar: string[]): void {
    this.izinli = hostlar.map((h) => h.trim().toLowerCase()).filter(Boolean);
    for (const liste of this.listeler.values()) for (const a of liste) a.yoklanir = this.yoklanirMi(a.adres);
  }

  /** Yalnız yerel makine, yerel ağ ve izinli sunucular yoklanır (masaüstü tarayıcısının ve web okuyucunun kuralı) */
  yoklanirMi(adres: string | URL): boolean {
    let u: URL;
    try {
      u = typeof adres === "string" ? new URL(adres) : adres;
    } catch {
      return false;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (yerelAdresMi(u)) return true;
    const sunucu = u.hostname.toLowerCase();
    return this.izinli.some((h) => h === u.host.toLowerCase() || (!h.includes(":") && h === sunucu));
  }

  /** Projenin adresleri, eklenme sırasıyla */
  listele(projeId: string): ProjeAdresi[] {
    this.baslat();
    return this.liste(projeId).map((a) => ({ ...a }));
  }

  /**
   * Adresi ekler ya da yeniler. Bildirilen ya da kurulun eklediği adresin adı ve bildireni, çıktıdan yakalanan aynı
   * adresle ezilmez. Yoklanan adres hemen yoklanır; bekle ise sonucu bekler (aracın yanıtı durumu söyler).
   */
  async bildir(projeId: string, g: AdresBildirimi, bekle = true): Promise<ProjeAdresi> {
    const { adres, yoklama } = this.ekle(projeId, g);
    if (yoklama && bekle) await yoklama;
    return { ...(this.liste(projeId).find((x) => x.id === adres.id) ?? adres) };
  }

  /** Adresi (tam adres, adı ya da kimliği) kaldırır; kaldırılanlar döner */
  kaldir(projeId: string, aranan: string): ProjeAdresi[] {
    this.baslat();
    const t = aranan.trim();
    if (!t) return [];
    let id: string | null = null;
    try {
      id = adresKimligi(adresiNormallestir(t));
    } catch {
      // ad ya da kimlik
    }
    const kucuk = t.toLocaleLowerCase("tr-TR");
    const liste = this.liste(projeId);
    const giden = liste.filter((a) => a.id === id || a.id === t || a.ad.toLocaleLowerCase("tr-TR") === kucuk);
    if (!giden.length) return [];
    this.listeler.set(
      projeId,
      liste.filter((a) => !giden.includes(a)),
    );
    for (const a of giden) this.kapanmalar.delete(`${projeId}:${a.id}`);
    this.degisti(projeId);
    return giden.map((a) => ({ ...a }));
  }

  /**
   * Araç sonrası kancası: çalışanın kabuk çıktısındaki yerel sunucu adreslerini ekler. Yeni adres eklendiyse
   * çalışana kısa bir not döner (sunucuyu kapatınca kaldırsın); yoksa null.
   */
  ciktidanYakala(ajanId: string, arac: string, girdi: Record<string, unknown>, yanit: unknown): string | null {
    const metin = taranacakMetin(arac, girdi, yanit);
    if (!metin) return null;
    const ajan = this.b.depo.ajan(ajanId);
    if (!ajan) return null;
    const bulunan = sunucuAdresleri(metin, typeof girdi.command === "string" ? girdi.command : "");
    if (!bulunan.length) return null;
    const yeniler: string[] = [];
    for (const b of bulunan) {
      try {
        const vardi = this.liste(ajan.projeId).some((x) => x.id === adresKimligi(new URL(b.adres)));
        this.ekle(ajan.projeId, { adres: b.adres, ad: b.ad, bildiren: ajan, kaynak: "cikti" });
        if (!vardi) yeniler.push(b.adres);
      } catch {
        // Sınır dolu: çıktıdan gelen adres eklenmez
      }
    }
    if (!yeniler.length) return null;
    const liste = yeniler.join(", ");
    return iki(
      `[ArnOrg] Çıktındaki ${liste} adresini Tarayıcı'daki Linkler'e ekledim; kurul tek tıkla açar. Adı yanlışsa adres_bildir ile düzelt; sunucuyu kapatınca adres_kaldir ile kaldır.`,
      `[ArnOrg] I added ${liste} from your output to the Links in the Browser; the board opens it with one click. If the name is wrong, fix it with adres_bildir; when you stop the server, remove it with adres_kaldir.`,
    );
  }

  /** Projelerin (verilmezse hepsinin) yoklanan adreslerini yoklar; uzun süre kapalı ya da bayat olanları düşürür */
  async yokla(projeId?: string, kimlikler?: string[]): Promise<void> {
    const projeler = projeId ? [projeId] : [...this.listeler.keys()];
    await Promise.all(projeler.map((pid) => this.projeyiYokla(pid, kimlikler)));
  }

  durdur(): void {
    this.durdu = true;
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
  }

  // -------------------------------------------------------------------------

  /** Eşzamanlı ekleme ya da yenileme (sınır doluysa hata); yoklanan adresin yoklaması başlar */
  private ekle(projeId: string, g: AdresBildirimi): { adres: ProjeAdresi; yoklama: Promise<void> | null } {
    this.baslat();
    const u = adresiNormallestir(g.adres);
    const id = adresKimligi(u);
    const zaman = simdi();
    const ad = adTemizle(g.ad);
    let a = this.liste(projeId).find((x) => x.id === id);
    if (a) {
      if (g.kaynak !== "cikti" || a.kaynak === "cikti") {
        a.ad = ad ?? a.ad;
        a.bildirenId = g.bildiren?.id ?? null;
        a.bildirenAd = bildirenAdi(g);
        a.kaynak = g.kaynak;
      }
      if (g.kalici !== undefined) a.kalici = g.kalici;
      a.guncelleme = zaman;
    } else {
      if (this.liste(projeId).length >= ADRES_SINIRI && !this.yerAc(projeId)) {
        throw new ArnorgHatasi(
          iki(`Projede en çok ${ADRES_SINIRI} link tutulur; kullanılmayanları kaldırın (adres_kaldir).`, `A project keeps at most ${ADRES_SINIRI} links; remove unused ones (adres_kaldir).`),
          409,
        );
      }
      a = {
        id,
        projeId,
        adres: u.href,
        ad: ad ?? iki("Geliştirme sunucusu", "Dev server"),
        bildirenId: g.bildiren?.id ?? null,
        bildirenAd: bildirenAdi(g),
        kaynak: g.kaynak,
        kalici: varsayilanKalici(g, u),
        guncelleme: zaman,
        durum: "bilinmiyor",
        denetim: null,
        yoklanir: this.yoklanirMi(u),
      };
      this.liste(projeId).push(a);
    }
    this.degisti(projeId);
    const yoklama = a.yoklanir ? this.yokla(projeId, [a.id]).catch(() => undefined) : null;
    this.planla();
    return { adres: a, yoklama };
  }

  /** İlk kullanımda bütün projelerin kayıtlı adresleri okunur; yoklanacak adres varsa yoklama başlar */
  private baslat(): void {
    if (this.baslatildi) return;
    this.baslatildi = true;
    for (const p of this.b.depo.projeler()) this.liste(p.id);
    this.planla();
  }

  private liste(projeId: string): ProjeAdresi[] {
    let l = this.listeler.get(projeId);
    if (!l) {
      l = oku(this.b.depo.deger(depoAnahtari(projeId)), projeId);
      for (const a of l) a.yoklanir = this.yoklanirMi(a.adres);
      this.listeler.set(projeId, l);
    }
    return l;
  }

  /** Sınır doluyken kalıcı olmayan en eski kapalı ya da yoklanmayan adres yer açar; kalıcı link yer açmaz */
  private yerAc(projeId: string): boolean {
    const liste = this.liste(projeId);
    const aday = liste.filter((a) => !a.kalici && a.durum !== "acik").sort((x, y) => x.guncelleme.localeCompare(y.guncelleme))[0];
    if (!aday) return false;
    this.listeler.set(
      projeId,
      liste.filter((a) => a !== aday),
    );
    this.kapanmalar.delete(`${projeId}:${aday.id}`);
    return true;
  }

  private degisti(projeId: string): void {
    const liste = this.liste(projeId);
    const kayit = liste.map(({ yoklanir: _y, ...a }) => a);
    try {
      this.b.depo.degerYaz(depoAnahtari(projeId), JSON.stringify(kayit));
    } catch {
      // Depo kapandıysa liste bellekte kalır
    }
    this.b.olaylar.yayinla({ tur: "adresler.guncellendi", projeId, adresler: liste.map((a) => ({ ...a })) });
  }

  private async projeyiYokla(projeId: string, kimlikler?: string[]): Promise<void> {
    const liste = this.liste(projeId);
    const simdiMs = this.saat();
    let degisti = false;
    const sonuclar = await Promise.all(
      liste.map(async (a) => {
        if (kimlikler && !kimlikler.includes(a.id)) return null;
        if (!a.yoklanir) return null;
        const u = new URL(a.adres);
        const acik = await this.yoklayici(u.hostname.replace(/^\[|\]$/g, ""), portu(u), YOKLAMA_SURESI_MS).catch(() => false);
        return { a, acik };
      }),
    );
    const zaman = simdi();
    for (const s of sonuclar) {
      if (!s) continue;
      const durum = s.acik ? "acik" : "kapali";
      const k = `${projeId}:${s.a.id}`;
      if (durum === "acik") this.kapanmalar.delete(k);
      else if (!this.kapanmalar.has(k)) this.kapanmalar.set(k, simdiMs);
      if (s.a.durum !== durum) degisti = true;
      s.a.durum = durum;
      s.a.denetim = zaman;
    }
    // Kalıcı olmayan adreslerden uzun süre kapalı kalan ve yenilenmeyen yoklanmayan düşer (kimlikler verildiyse yalnız
    // tek yoklama: düşürme yok). Kalıcı link yalnız kaldırılınca gider
    if (!kimlikler) {
      const kalan = this.liste(projeId).filter((a) => {
        if (a.kalici) return true;
        if (a.yoklanir) return a.durum !== "kapali" || simdiMs - (this.kapanmalar.get(`${projeId}:${a.id}`) ?? simdiMs) < KAPALI_DUSME_MS;
        return simdiMs - Date.parse(a.guncelleme) < YOKLANMAYAN_DUSME_MS;
      });
      if (kalan.length !== this.liste(projeId).length) {
        for (const a of this.liste(projeId)) if (!kalan.includes(a)) this.kapanmalar.delete(`${projeId}:${a.id}`);
        this.listeler.set(projeId, kalan);
        degisti = true;
      }
    }
    if (degisti) this.degisti(projeId);
  }

  /** Listede adres kaldıkça dönemsel yoklama (süreci ayakta tutmaz) */
  private planla(): void {
    if (this.durdu || this.zamanlayici) return;
    const varMi = [...this.listeler.values()].some((l) => l.length > 0);
    if (!varMi) return;
    this.zamanlayici = setTimeout(() => {
      this.zamanlayici = null;
      this.yoklaniyor ??= this.yokla()
        .catch(() => undefined)
        .finally(() => {
          this.yoklaniyor = null;
          this.planla();
        });
    }, YOKLAMA_ARALIGI_MS);
    this.zamanlayici.unref();
  }
}
