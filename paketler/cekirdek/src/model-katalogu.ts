// Model kataloğu: Claude Code'un bu hesapta sunduğu modeller (SDK supportedModels), sürümlü adlarıyla.
// Liste mesaj göndermeyen kısa bir Claude Code yoklamasıyla okunur (token harcanmaz): açılıştan kısa süre sonra arka
// planda ve Claude Code kurulumu, girişi ya da abonelik planı değişince. Okunan liste anahtar-değer deposunda
// önbelleklenir; hiç okunamadıysa ArnOrg'un bildiği sabit liste kullanılır. Rolün varsayılan modeli katalogda yoksa
// zincirde bir sonrakine geçilir (fable → opus → sonnet → haiku); var olan ajanların modeli kendiliğinden değişmez.
import { query, type ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import type { ModelBilgisi, ModelKatalogu, SunucuOlayi } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { ajanOrtami, rootMu } from "./ortam.js";
import { simdi } from "./yardimci.js";

/** Anahtar-değer önbelleği: Claude Code'dan son okunan ham liste ve okunma anı (JSON) */
export const KATALOG_ANAHTARI = "model-katalogu";

/** Claude Code'un model satırının kullanılan alanları (SDK ModelInfo) */
export type HamModel = Pick<ModelInfo, "value" | "displayName" | "description" | "resolvedModel">;

/** Liste okunamazsa kullanılan sabit liste: Agent SDK 0.3.287'nin girişsiz de döndürdüğü satırlar */
export const YEDEK_MODELLER: readonly HamModel[] = [
  { value: "default", resolvedModel: "claude-sonnet-5-5", displayName: "Default (recommended)", description: "Sonnet 5.5 · Efficient for routine tasks" },
  { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet", description: "Sonnet 5.5 · Efficient for routine tasks" },
  { value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable", description: "Fable 5.1 · Most capable for your hardest and longest-running tasks" },
  { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus", description: "Opus 5.5 · Best for everyday, complex tasks" },
  { value: "haiku", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku", description: "Haiku 4.5 · Fastest for quick answers" },
];

/**
 * Model zinciri, güçlüden hafife. Birincil model erişilemezse yedeği (ajan-oturumu.ts yedekModel) ve rolün varsayılan
 * modeli katalogda yoksa seçilecek olan (rolModeliSec) zincirdeki bir sonrakidir.
 */
export const MODEL_ZINCIRI = ["fable", "opus", "sonnet", "haiku"] as const;

/** Zincirdeki bir sonraki model: fable → opus → sonnet → haiku; haiku ve zincir dışı modeller için null. Tam kimlik ailesinden tanınır (claude-opus-5-5 → sonnet) */
export function zincirdekiSonraki(model: string): string | null {
  const m = model.trim().toLowerCase();
  const i = MODEL_ZINCIRI.findIndex((z) => m === z || m.includes(z));
  return i >= 0 ? (MODEL_ZINCIRI[i + 1] ?? null) : null;
}

/** Tam kimlikteki sürüm: claude-opus-5-5 → "5.5", claude-haiku-4-5-20251001 → "4.5", claude-opus-5 → "5"; tanınmazsa null */
export function kimliktenSurum(kimlik: string | null | undefined): string | null {
  const m = /^claude-[a-z]+-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/i.exec(kimlik?.trim() ?? "");
  if (!m) return null;
  return m[2] ? `${m[1]}.${m[2]}` : m[1]!;
}

/** Satır geçerli mi: değer, görünen ad ve açıklama metin olmalı (önbellekten okunan bozuk kayıt elenir) */
function gecerliHam(h: unknown): h is HamModel {
  if (!h || typeof h !== "object") return false;
  const x = h as Record<string, unknown>;
  return typeof x.value === "string" && typeof x.displayName === "string" && typeof x.description === "string" && (x.resolvedModel === undefined || typeof x.resolvedModel === "string");
}

/**
 * Satırdan katalog öğesi. Görünen ad açıklamanın " · " öncesidir ("Opus 5.5 · Best for…" → "Opus 5.5"); açıklamada
 * ayraç yoksa görünen ada tam kimlikteki sürüm eklenir ("Opus" + claude-opus-5-5 → "Opus 5.5"). Kısa açıklama " · "
 * sonrasıdır; ayraç yoksa açıklamanın tamamı.
 */
export function modelAyristir(h: HamModel): ModelBilgisi | null {
  const deger = h.value.trim();
  if (!deger) return null;
  const aciklama = h.description.trim();
  const kimlik = h.resolvedModel?.trim() || (/^claude-/i.test(deger) ? deger : null);
  const ayrac = aciklama.indexOf(" · ");
  if (ayrac > 0) return { deger, ad: aciklama.slice(0, ayrac).trim(), kimlik, aciklama: aciklama.slice(ayrac + 3).trim() };
  const temel = h.displayName.trim() || deger;
  const surum = kimliktenSurum(kimlik);
  return { deger, ad: surum && !/\d/.test(temel) ? `${temel} ${surum}` : temel, kimlik, aciklama };
}

/** Claude Code listesinden seçilebilir modeller: "default" satırı çıkar, bozuk satır atlanır, aynı değer bir kez */
export function modelleriAyristir(liste: readonly unknown[]): ModelBilgisi[] {
  const sonuc: ModelBilgisi[] = [];
  for (const h of liste) {
    if (!gecerliHam(h) || h.value.trim().toLowerCase() === "default") continue;
    const m = modelAyristir(h);
    if (m && !sonuc.some((x) => x.deger === m.deger)) sonuc.push(m);
  }
  return sonuc;
}

/** Sabit listeden katalog */
export function yedekKatalog(): ModelKatalogu {
  return { modeller: modelleriAyristir(YEDEK_MODELLER), kaynak: "yedek", guncelleme: null };
}

/** Önbellekteki kayıttan katalog; kayıt yoksa ya da bozuksa null */
export function onbellektenKatalog(ham: string | null): ModelKatalogu | null {
  if (!ham) return null;
  try {
    const v = JSON.parse(ham) as { modeller?: unknown; guncelleme?: unknown } | null;
    if (!v || !Array.isArray(v.modeller)) return null;
    const modeller = modelleriAyristir(v.modeller);
    return modeller.length ? { modeller, kaynak: "onbellek", guncelleme: typeof v.guncelleme === "string" ? v.guncelleme : null } : null;
  } catch {
    return null;
  }
}

/** Model katalogda var mı: değer ya da tam kimlik; takma ad için ailesinden bir kimlik de sayılır (fable ↔ claude-fable-5-1) */
export function katalogdaVarMi(modeller: readonly ModelBilgisi[], model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return false;
  const aile = (MODEL_ZINCIRI as readonly string[]).includes(m) ? `claude-${m}-` : null;
  return modeller.some((x) => {
    const deger = x.deger.toLowerCase();
    const kimlik = x.kimlik?.toLowerCase() ?? "";
    return deger === m || kimlik === m || (aile !== null && (deger.startsWith(aile) || kimlik.startsWith(aile)));
  });
}

/**
 * Rolün varsayılan modeli bu katalogda yoksa zincirde bir sonraki (CEO: fable yoksa opus). Zincir dışı model ve boş
 * katalog olduğu gibi kalır; zincirin hiçbir halkası yoksa da varsayılan döner.
 */
export function rolModeliSec(varsayilan: string, modeller: readonly ModelBilgisi[]): string {
  const i = (MODEL_ZINCIRI as readonly string[]).indexOf(varsayilan.trim().toLowerCase());
  if (i < 0 || !modeller.length) return varsayilan;
  return MODEL_ZINCIRI.slice(i).find((m) => katalogdaVarMi(modeller, m)) ?? varsayilan;
}

/**
 * Okumayı tetikleyen iz: Claude Code kurulumu ve girişi (kurulum.durum), abonelik planı ve hesabı (hesap.guncellendi).
 * İz değişince liste yeniden okunur; hesap okunamadığında (durum hazır değil) iz yoktur.
 */
export function olayIzi(o: SunucuOlayi): { tur: "kurulum" | "hesap"; deger: string } | null {
  if (o.tur === "kurulum.durum") {
    const c = o.durum.claude;
    return { tur: "kurulum", deger: JSON.stringify([c.yol, c.surum, c.girisYapildi, c.abonelik, c.girisYontemi, c.eposta]) };
  }
  if (o.tur === "hesap.guncellendi" && o.hesap.durum === "hazir") return { tur: "hesap", deger: JSON.stringify([o.hesap.plan, o.hesap.eposta]) };
  return null;
}

export interface OkuyucuSecenekleri {
  /** Claude Code'un açılacağı dizin (veri dizini) */
  cwd: string;
  claudeYolu: () => string | null;
  /** Yanıt bu süreyi aşarsa okuma bırakılır ve süreç kapanır */
  zamanAsimiMs?: number;
}

/** Mesaj göndermeden Claude Code'u açar, model listesini sorar ve kapatır (token harcanmaz; ajanlarla aynı ortam) */
export function sdkModelOkuyucu(s: OkuyucuSecenekleri): () => Promise<HamModel[]> {
  return async () => {
    let birak: () => void = () => undefined;
    const bekle = new Promise<void>((coz) => {
      birak = coz;
    });
    async function* hicMesajYok() {
      await bekle;
    }
    const yol = s.claudeYolu();
    const q = query({
      prompt: hicMesajYok(),
      options: {
        cwd: s.cwd,
        settingSources: [],
        ...(yol ? { pathToClaudeCodeExecutable: yol } : {}),
        env: ajanOrtami({ IS_SANDBOX: rootMu() ? "1" : undefined }),
      },
    });
    const sure = s.zamanAsimiMs ?? 30_000;
    let zamanlayici: NodeJS.Timeout | undefined;
    const zaman = new Promise<never>((_, red) => {
      zamanlayici = setTimeout(() => red(new Error(iki(`Claude Code model listesini vermedi (${Math.round(sure / 1000)} sn).`, `Claude Code did not return the model list (${Math.round(sure / 1000)} s).`))), sure);
      zamanlayici.unref();
    });
    try {
      return await Promise.race([q.supportedModels(), zaman]);
    } finally {
      clearTimeout(zamanlayici);
      birak();
      try {
        q.close();
      } catch {
        // süreç zaten kapandı
      }
    }
  };
}

export interface KatalogBaglami {
  depo: { deger(anahtar: string): string | null; degerYaz(anahtar: string, deger: string): void };
  olaylar: { yayinla(o: SunucuOlayi): void; dinle(f: (o: SunucuOlayi) => void): () => void };
  /** Listeyi Claude Code'dan okur; null ise hiç okunmaz (testler, oturumsuz kip) */
  okuyucu: (() => Promise<readonly unknown[]>) | null;
  /** Giriş ya da kurulum değişince okumadan önce beklenen süre (art arda gelen olaylar tek okumaya iner) */
  yenidenOkumaMs?: number;
}

export class ModelKataloguIzleyici {
  private katalog: ModelKatalogu;
  private suren: Promise<ModelKatalogu> | null = null;
  private zamanlayici: NodeJS.Timeout | null = null;
  private birak: (() => void) | null = null;
  /** Son görülen kurulum ve hesap izleri; ilk görülen iz de (girişten sonra gelir) okumayı tetikler */
  private readonly izler = new Map<string, string>();

  constructor(private readonly b: KatalogBaglami) {
    this.katalog = onbellektenKatalog(b.depo.deger(KATALOG_ANAHTARI)) ?? yedekKatalog();
  }

  /** Geçerli katalog (GET /api/modeller) */
  get mevcut(): ModelKatalogu {
    return this.katalog;
  }

  /** Rolün varsayılan modeli bu katalogda yoksa zincirde bir sonraki (işe alım ve ilk kurulum) */
  rolModeli(varsayilan: string): string {
    return rolModeliSec(varsayilan, this.katalog.modeller);
  }

  /** Açılıştan gecikmeMs sonra okur; sonra Claude Code kurulumu, girişi ya da abonelik planı değiştikçe yeniden okur */
  baslat(gecikmeMs = 4000): void {
    if (!this.b.okuyucu || this.birak) return;
    this.planla(gecikmeMs);
    this.birak = this.b.olaylar.dinle((o) => this.olay(o));
  }

  private olay(o: SunucuOlayi): void {
    const iz = olayIzi(o);
    if (!iz || this.izler.get(iz.tur) === iz.deger) return;
    this.izler.set(iz.tur, iz.deger);
    this.planla(this.b.yenidenOkumaMs ?? 2000);
  }

  private planla(ms: number): void {
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.zamanlayici = setTimeout(() => {
      this.zamanlayici = null;
      void this.tazele();
    }, ms);
    this.zamanlayici.unref();
  }

  /** Listeyi Claude Code'dan yeniden okur; aynı anda tek okuma. Hata ya da zaman aşımında eldeki liste kalır */
  tazele(): Promise<ModelKatalogu> {
    const okuyucu = this.b.okuyucu;
    if (!okuyucu) return Promise.resolve(this.katalog);
    this.suren ??= this.oku(okuyucu).finally(() => {
      this.suren = null;
    });
    return this.suren;
  }

  private async oku(okuyucu: () => Promise<readonly unknown[]>): Promise<ModelKatalogu> {
    try {
      const ham = await okuyucu();
      const modeller = modelleriAyristir(ham);
      // Boş liste anlamlı değil: eldeki liste kalır
      if (!modeller.length) return this.katalog;
      const yeni: ModelKatalogu = { modeller, kaynak: "claude", guncelleme: simdi() };
      const degisti = this.katalog.kaynak !== "claude" || JSON.stringify(this.katalog.modeller) !== JSON.stringify(modeller);
      this.katalog = yeni;
      try {
        this.b.depo.degerYaz(KATALOG_ANAHTARI, JSON.stringify({ modeller: ham.filter(gecerliHam), guncelleme: yeni.guncelleme }));
      } catch {
        // Depo kapanmışsa (kapanış sırası) önbellek yazılmaz; liste bellekte geçerlidir
      }
      if (degisti) this.b.olaylar.yayinla({ tur: "modeller.guncellendi", katalog: yeni });
    } catch {
      // Claude Code bulunamadı, açılamadı ya da yanıt vermedi: eldeki liste (önbellek ya da yedek) kalır
    }
    return this.katalog;
  }

  durdur(): void {
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
    this.birak?.();
    this.birak = null;
  }
}
