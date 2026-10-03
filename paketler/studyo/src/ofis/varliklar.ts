// Ofis varlıkları: public/ofis/varliklar.json bildirimi, görsel adresleri ve oranları.
// Boyutlar sabit varsayılmaz: bildirimdeki en/boy kullanılır, görsel yüklenince gerçek boyutla düzeltilir.
import { VARSAYILAN_ORANLAR, type EsyaAdi, type EsyaOranlari } from "./yerlesim";

export interface KarakterVarligi {
  id: string;
  ad: string;
  roller: string[];
  dosya: string;
  en: number;
  boy: number;
  /** Arkadan görünüş: karakter uzaklaşırken kullanılır; yoksa önden görünüş aynalanır */
  arka?: { dosya: string; en: number; boy: number };
  /** Tekerlekli sandalye kullanan karakter adım sallanması yapmaz */
  hareket?: "yuruyen" | "tekerlekli";
}

export interface EsyaVarligi {
  dosya: string;
  en: number;
  boy: number;
}

export interface Varliklar {
  karakterler: KarakterVarligi[];
  esyalar: Partial<Record<EsyaAdi, EsyaVarligi>>;
}

const KOK = `${import.meta.env.BASE_URL}ofis/`;

export function varlikAdresi(dosya: string): string {
  return `${KOK}${dosya.replace(/^\/+/, "")}`;
}

function sayiMi(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function arkaCoz(ham: unknown): Pick<KarakterVarligi, "arka"> {
  const a = (ham ?? null) as Record<string, unknown> | null;
  if (!a || typeof a.dosya !== "string") return {};
  return { arka: { dosya: a.dosya, en: sayiMi(a.en) ? a.en : 160, boy: sayiMi(a.boy) ? a.boy : 480 } };
}

/** Bildirimi doğrular; bozuk girdileri atar */
export function bildirimiCoz(ham: unknown): Varliklar {
  const kayit = (ham ?? {}) as { karakterler?: unknown; esyalar?: unknown };
  const karakterler: KarakterVarligi[] = [];
  if (Array.isArray(kayit.karakterler)) {
    for (const k of kayit.karakterler as Record<string, unknown>[]) {
      if (typeof k?.id !== "string" || typeof k.dosya !== "string") continue;
      karakterler.push({
        id: k.id,
        ad: typeof k.ad === "string" ? k.ad : k.id,
        roller: Array.isArray(k.roller) ? k.roller.filter((r): r is string => typeof r === "string") : [],
        dosya: k.dosya,
        en: sayiMi(k.en) ? k.en : 128,
        boy: sayiMi(k.boy) ? k.boy : 360,
        ...arkaCoz(k.arka),
        ...(k.hareket === "tekerlekli" ? { hareket: "tekerlekli" as const } : {}),
      });
    }
  }
  const esyalar: Varliklar["esyalar"] = {};
  if (kayit.esyalar && typeof kayit.esyalar === "object") {
    for (const [ad, e] of Object.entries(kayit.esyalar as Record<string, Record<string, unknown>>)) {
      if (!(ad in VARSAYILAN_ORANLAR) || typeof e?.dosya !== "string") continue;
      esyalar[ad as EsyaAdi] = { dosya: e.dosya, en: sayiMi(e.en) ? e.en : 1, boy: sayiMi(e.boy) ? e.boy : 1 };
    }
  }
  return { karakterler, esyalar };
}

let yukleme: Promise<Varliklar> | null = null;

/** Bildirimi bir kez yükler; hata olursa sonraki çağrı yeniden dener */
export function varliklariYukle(): Promise<Varliklar> {
  yukleme ??= fetch(varlikAdresi("varliklar.json"), { cache: "no-cache" })
    .then((y) => {
      if (!y.ok) throw new Error(`Ofis varlıkları alınamadı (${y.status}).`);
      return y.json() as Promise<unknown>;
    })
    .then(bildirimiCoz)
    .catch((e: unknown) => {
      yukleme = null;
      throw e;
    });
  return yukleme;
}

/** Eşya oranları: bildirimde olan eşya için onun boyutu, yoksa varsayılan */
export function esyaOranlari(v: Varliklar): EsyaOranlari {
  const o = { ...VARSAYILAN_ORANLAR };
  for (const [ad, e] of Object.entries(v.esyalar)) if (e) o[ad as EsyaAdi] = e.boy / e.en;
  return o;
}

/** Görseller önceden yüklenir; ilk çizimde boş kutu kalmasın */
export function gorselleriIsit(v: Varliklar) {
  const adresler = [...v.karakterler.map((k) => k.dosya), ...Object.values(v.esyalar).map((e) => e!.dosya)];
  for (const a of adresler) {
    const img = new Image();
    img.decoding = "async";
    img.src = varlikAdresi(a);
  }
}
