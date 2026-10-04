// İşe göre yer: ajanın o an ne yaptığına göre ofiste gideceği yer. Tek tablo (araç adı ya da deseni → yer türü)
// ve durgunluk kuralı burada; motor yalnız sonucu sahneye çevirir. Saf işlevler, DOM'a dokunmaz.
//
// Durgunluk: her araç çağrısında koşturulmaz. Bir yere varan en az EN_AZ_KALIS orada kalır; kısa okuma ve arama
// masadan kaldırmaz; bir yerin işi TAZE_SURE boyunca sürmezse kişi masasına döner. Başka bir yerin işi sürüp
// gidiyorsa (eşik kadar çağrı) yer değişir.
import type { AjanDurumu } from "@arnorg/ortak";

export type YerTuru =
  /** Kendi masası: kod yazma, düzenleme, test, derleme, kod okuma ve arama */
  | "masa"
  /** Duvardaki görev panosu */
  | "pano"
  /** Toplantı odası */
  | "toplanti"
  /** Bir iş arkadaşının masası ya da yanı (soru, anma, devir, inceleme) */
  | "kisi"
  /** Arşiv odası: notlar ve hafıza */
  | "arsiv"
  /** Kurul masası: kurula soru, birleştirme isteği, işe alım teklifi, karar bekleme */
  | "kurul"
  /** Toplantı odasındaki beyaz tahta: rapor */
  | "tahta"
  /** Okuma köşesi: web araştırması */
  | "okuma"
  /** Sunucu dolabı: git gönderme ve birleştirme, docker, yayın */
  | "sunucu"
  /** Boşta ya da duraklatılmış: sevdiği yer, mutfak, kanepe */
  | "dinlenme";

export interface YerKurali {
  /** Araç adı ya da deseni */
  arac: string | RegExp;
  /** Ek koşul: girdi (ör. Bash komutu) */
  girdi?: (g: Girdi) => boolean;
  yer: YerTuru;
  /** Kişi hedefli yerlerde hedefin adı */
  kisi?: (g: Girdi) => string | null;
  /** Yer değiştirmek için gereken, taze kalmış çağrı sayısı (varsayılan 1) */
  esik?: number;
  /** Kısa iş: tek başına yerinden kaldırmaz (masa işi) ya da başka sahne halleder (anma) */
  kisa?: boolean;
}

type Girdi = Record<string, unknown>;

export interface EtkinlikYeri {
  yer: YerTuru;
  /** Hedef kişinin adı (kisi yerinde) */
  kisiAdi?: string;
  esik: number;
  kisa: boolean;
}

const dize = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const komut = (g: Girdi) => dize(g.command) ?? "";
const mcp = (...adlar: string[]) => new RegExp(`^mcp__arnorg__(?:${adlar.join("|")})$`);

/** Sürüm ve dağıtım komutları: sunucu dolabına götürür */
export const SURUM_KOMUTU =
  /\bgit\s+(?:push|merge|rebase|tag|cherry-pick)\b|\bgh\s+(?:pr\s+merge|release)\b|\bdocker\b|\bdocker-compose\b|\bkubectl\b|\bhelm\b|\bdeploy\b|\b(?:npm|pnpm|yarn)\s+publish\b|\b(?:vercel|netlify|wrangler|flyctl|terraform)\b/i;

/** Metindeki ilk @anma */
function ilkAnma(metin: string | null): string | null {
  const m = metin ? /@([\p{L}\p{N}_.-]+)/u.exec(metin) : null;
  return m ? m[1]!.replace(/[.-]+$/, "") : null;
}

/**
 * Yer tablosu: ilk eşleşen kural geçer. Tabloda olmayan araç yer değiştirmez.
 * Claude Code araçları ve ArnOrg MCP araçları (mcp__arnorg__*) birlikte.
 */
export const YER_TABLOSU: readonly YerKurali[] = [
  // Kod yazma ve düzenleme: kendi masası, monitör açık
  { arac: /^(?:Edit|Write|MultiEdit|NotebookEdit)$/, yer: "masa" },
  // Sürüm ve dağıtım komutları: sunucu dolabı
  { arac: /^(?:Bash|PowerShell)$/, girdi: (g) => SURUM_KOMUTU.test(komut(g)), yer: "sunucu" },
  // Test, derleme ve diğer komutlar: masası
  { arac: /^(?:Bash|BashOutput|KillShell|KillBash|PowerShell)$/, yer: "masa" },
  // Kod okuma ve arama: masası; kısa iş, masadan kaldırmaz
  { arac: /^(?:Read|Grep|Glob|LS)$/, yer: "masa", kisa: true, esik: 3 },
  { arac: mcp("kod_ara", "kod_haritasi", "sembol_bul", "bagimliliklar", "benzer_kod"), yer: "masa", kisa: true, esik: 3 },
  { arac: /^(?:Task|Agent|TodoWrite|TodoRead|ExitPlanMode)$/, yer: "masa", kisa: true, esik: 3 },
  // Web araştırması: okuma köşesi (tek sayfa bakışı yetmez, iki çağrı ister)
  { arac: "WebSearch", yer: "okuma" },
  { arac: "WebFetch", yer: "okuma", esik: 2 },
  // Devir: görevi başkasına atamak o kişinin masasına götürür
  { arac: mcp("gorev_guncelle"), girdi: (g) => !!dize(g.atanan), yer: "kisi", kisi: (g) => dize(g.atanan) },
  // Görev panosu
  { arac: mcp("gorev_ac", "gorev_guncelle", "gorevleri_listele", "gorev_detay"), yer: "pano" },
  // Toplantı
  { arac: mcp("toplanti_yap"), yer: "toplanti" },
  // İş arkadaşına soru: onun masası (uzmanı ArnOrg seçecekse hedef belli değil, yer değişmez)
  { arac: mcp("ajana_sor"), girdi: (g) => !!dize(g.ajan), yer: "kisi", kisi: (g) => dize(g.ajan) },
  // Anmalı mesaj: konuşma sahnesi kişiyi yanına götürür
  { arac: mcp("mesaj_gonder"), girdi: (g) => !!(dize(g.alici) ?? ilkAnma(dize(g.metin))), yer: "kisi", kisi: (g) => dize(g.alici) ?? ilkAnma(dize(g.metin)), kisa: true },
  { arac: mcp("mesaj_gonder", "kanal_oku", "soruyu_yanitla", "ekip_listele", "defter_yaz", "defter_oku", "ajana_sor"), yer: "masa", kisa: true, esik: 3 },
  // İnceleme: incelenen işin sahibinin masası
  { arac: mcp("calisma_farki", "calisma_dosyasi"), girdi: (g) => !!dize(g.ajan), yer: "kisi", kisi: (g) => dize(g.ajan) },
  // Not ve hafıza: arşiv (yazmak hemen, okumak iki çağrıda)
  { arac: mcp("not_yaz", "hafiza_kaydet", "hafiza_birlestir", "hafiza_bakim"), yer: "arsiv" },
  { arac: mcp("not_oku", "notlari_listele", "hafiza_ara", "hafiza_listele"), yer: "arsiv", esik: 2 },
  // Kurul: soru, birleştirme isteği, işe alım teklifi
  { arac: mcp("kurula_sor", "birlestirme_iste", "ise_al_teklif"), yer: "kurul" },
  // Rapor: beyaz tahta
  { arac: mcp("rapor_hazirla"), yer: "tahta" },
];

/** Araç çağrısının götürdüğü yer; tabloda yoksa null */
export function aracYeri(arac: string | undefined, girdi?: unknown): EtkinlikYeri | null {
  if (!arac) return null;
  const g: Girdi = girdi && typeof girdi === "object" && !Array.isArray(girdi) ? (girdi as Girdi) : {};
  for (const k of YER_TABLOSU) {
    const ad = typeof k.arac === "string" ? k.arac === arac : k.arac.test(arac);
    if (!ad || (k.girdi && !k.girdi(g))) continue;
    const kisiAdi = k.kisi?.(g) ?? undefined;
    return { yer: k.yer, ...(kisiAdi ? { kisiAdi: kisiAdi.replace(/^@/, "") } : {}), esik: k.esik ?? 1, kisa: !!k.kisa };
  }
  return null;
}

/** Durumun kalıcı yeri: çalışan işine göre yer değiştirir, diğerleri durumlarının yerinde kalır */
export function durumYeri(durum: AjanDurumu): YerTuru {
  switch (durum) {
    case "karar_bekliyor":
      return "kurul";
    case "bosta":
    case "duraklatildi":
      return "dinlenme";
    default:
      // calisiyor (işine göre değişir), hata (masasında, belirgin işaretle), kapali (masasında uyur)
      return "masa";
  }
}

// ---------------------------------------------------------------------------
// Durgunluk
// ---------------------------------------------------------------------------

/** Bir yere varan en az bu kadar kalır */
export const EN_AZ_KALIS = 30_000;
/** Bir yerin işi bu kadar süre taze sayılır; ardından kişi masasına döner */
export const TAZE_SURE = 20_000;

export interface YerAdayi {
  yer: YerTuru;
  kisi?: string;
  ilk: number;
  son: number;
  sayi: number;
  esik: number;
}

export interface YerDurumu {
  /** Kişinin bulunduğu ya da gittiği yer */
  yer: YerTuru;
  /** kisi yerinde hedef kişinin kimliği */
  kisi?: string;
  /** Bu yere varış (yoldayken karar anı); -Infinity: henüz bir yere yerleşmedi, beklemeden gidebilir */
  varis: number;
  /** Bu yerle ilgili son iş */
  son: number;
  /** Henüz gidilmemiş yer önerisi */
  aday: YerAdayi | null;
}

export function yerDurumu(t: number, yer: YerTuru = "masa"): YerDurumu {
  return { yer, varis: -Infinity, son: t, aday: null };
}

/** Yeni iş: bulunduğu yerin işiyse yerinde kalır, başka yerin işiyse aday olarak birikir */
export function yerOlayi(d: YerDurumu, o: { yer: YerTuru; kisi?: string; esik?: number; kisa?: boolean }, t: number): void {
  if (o.yer === d.yer && o.kisi === d.kisi) {
    // Aynı iş sürüyor: yerinde kalır; bekleyen başka öneri bu işle geçersizleşir
    d.son = t;
    d.aday = null;
    return;
  }
  // Masadan başka bir yerin kısa işi (ör. anmalı mesaj) yer değiştirmez; onu sahnesi halleder
  if (o.kisa && o.yer !== "masa") return;
  const a = d.aday;
  if (a && a.yer === o.yer && a.kisi === o.kisi) {
    a.son = t;
    a.sayi++;
    a.esik = Math.min(a.esik, o.esik ?? 1);
    return;
  }
  d.aday = { yer: o.yer, ...(o.kisi ? { kisi: o.kisi } : {}), ilk: t, son: t, sayi: 1, esik: o.esik ?? 1 };
}

/** Kişi yerine vardı: en az kalış buradan sayılır */
export function yerVarisi(d: YerDurumu, t: number): void {
  d.varis = t;
}

/**
 * Zaman geçtikçe karar: aday yer yeterince sürdüyse oraya geçilir; bulunulan yerin işi bayatladıysa masaya
 * dönülür. En az kalış dolmadan yer değişmez. Yer değiştiyse true.
 */
export function yerKarari(d: YerDurumu, t: number): boolean {
  const kalis = t - d.varis;
  const bayat = t - d.son > TAZE_SURE;
  const a = d.aday;
  if (a && t - a.son > TAZE_SURE) d.aday = null;
  if (kalis < EN_AZ_KALIS) return false;
  if (d.aday) {
    const b = d.aday;
    // Masaya dönüş kısa işlerle de olur: bulunulan yerin işi bitmişse eşik beklenmez
    if (b.sayi >= b.esik || (b.yer === "masa" && d.yer !== "masa" && bayat)) {
      d.yer = b.yer;
      if (b.kisi) d.kisi = b.kisi;
      else delete d.kisi;
      d.varis = t;
      d.son = b.son;
      d.aday = null;
      return true;
    }
  }
  if (d.yer !== "masa" && bayat) {
    d.yer = "masa";
    delete d.kisi;
    d.varis = t;
    d.son = t;
    d.aday = null;
    return true;
  }
  return false;
}
