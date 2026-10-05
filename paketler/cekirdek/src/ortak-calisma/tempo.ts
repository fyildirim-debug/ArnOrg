// Ekip temposu ve iş dağıtımı (0.0.8). Tempo: tam otonom kipte aynı anda kaç çalışanın çalışacağına CEO karar verir
// (ekip_temposu), kurulun Ayarlar.esZamanliAjan değeri üst sınırdır; kurul kipinde kurulun ayarı geçerlidir. CEO
// tempoya sayılmaz. İş dağıtımı: boşa çıkan çalışana sıradaki işi seçilir: kendisine atanmış planlı iş, yoksa rolüne
// uyan atanmamış iş; bağımlılıkları bitmiş olmalı.
import type { Ajan, Gorev } from "@arnorg/ortak";

/** Anahtar-değer kaydı: CEO'nun tempo seçimi (proje başına) */
export const TEMPO_ONEKI = "ekip-temposu:";

export interface TempoKaydi {
  esZamanli: number;
  gerekce: string;
  zaman: string;
  ceo: string;
}

export function tempoKaydi(deger: string | null): TempoKaydi | null {
  try {
    const v = JSON.parse(deger ?? "null") as Partial<TempoKaydi> | null;
    if (!v || typeof v.esZamanli !== "number" || !(v.esZamanli > 0)) return null;
    return { esZamanli: Math.floor(v.esZamanli), gerekce: String(v.gerekce ?? ""), zaman: String(v.zaman ?? ""), ceo: String(v.ceo ?? "") };
  } catch {
    return null;
  }
}

/** Geçerli tempo: CEO'nun seçimi üst sınırı geçemez; 0 sınırsız demektir */
export function gecerliTempo(secim: number | null, ustSinir: number): number {
  if (!secim) return ustSinir;
  return ustSinir > 0 ? Math.min(secim, ustSinir) : secim;
}

// ---------------------------------------------------------------------------
// Rol uyumu
// ---------------------------------------------------------------------------

/** Rolün görev metinlerinde aranan sözcük başları (Türkçe ve İngilizce) */
const ROL_SOZCUKLERI: Record<string, string[]> = {
  backend: ["api", "backend", "sunucu", "server", "veritaban", "database", "db", "endpoint", "uç", "servis", "service", "sql", "şema", "schema", "migration", "göç", "auth", "kimlik", "express", "fastify", "rest", "model"],
  frontend: ["frontend", "arayüz", "ui", "sayfa", "page", "bileşen", "component", "css", "html", "react", "vue", "svelte", "ekran", "screen", "form", "stil", "style", "görünüm", "view", "panel"],
  test: ["test", "e2e", "uçtan", "kabul", "qa", "doğrula", "verify", "senaryo", "scenario"],
  yazar: ["readme", "belge", "doküman", "docs", "dokümantasyon", "kılavuz", "guide", "documentation", "kullanım"],
  tanitim: ["readme", "tanıtım", "vitrin", "showcase", "landing"],
  devops: ["ci", "cd", "deploy", "dağıtım", "docker", "pipeline", "paketle", "workflow", "github actions", "yayın", "release"],
  guvenlik: ["güvenlik", "security", "owasp", "zafiyet", "vulnerab", "tehdit", "threat", "xss", "csrf", "yetkilendirme"],
  tasarim: ["tasarım", "design", "figma", "renk", "tipografi", "typography", "wireframe", "palet"],
  arastirmaci: ["araştır", "research", "karşılaştır", "compare", "değerlendir", "evaluate", "kıyas"],
};

/** Kod yazan roller: işaret taşımayan genel görevleri de alabilir */
const GELISTIRICI = new Set(["backend", "frontend", "fullstack"]);
/** Atanmamış iş almayan roller: yöneticiler ve inceleyici (işleri onlara gelir) */
const IS_ALMAYAN = new Set(["ceo", "cto", "inceleme"]);

function sozcukleri(metin: string): string[] {
  return metin
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Görevin her role puanı: etiket rol kimliğiyse 10, metinde rol sözcüğü geçtikçe 2 (en çok 6) */
export function rolPuanlari(g: Pick<Gorev, "baslik" | "aciklama" | "etiket">): Record<string, number> {
  const etiket = g.etiket.trim().toLocaleLowerCase("tr");
  const sozcukler = sozcukleri(`${g.baslik} ${g.aciklama}`);
  const metin = sozcukler.join(" ");
  const puan: Record<string, number> = {};
  for (const [rol, isaretler] of Object.entries(ROL_SOZCUKLERI)) {
    let p = 0;
    for (const i of isaretler) {
      if (i.includes(" ") ? metin.includes(i) : sozcukler.some((s) => s === i || (i.length >= 4 && s.startsWith(i)))) p += 2;
    }
    puan[rol] = Math.min(6, p) + (etiket === rol ? 10 : 0);
  }
  puan.fullstack = Math.max(puan.backend ?? 0, puan.frontend ?? 0) + (etiket === "fullstack" ? 10 : 0);
  return puan;
}

/**
 * Rolün göreve uyumu: 0 uymaz. Rol görevin en yüksek puanlı rolüyse uyar; hiçbir role işaret yoksa yalnız kod yazan
 * roller alır (düşük puanla). fullstack, backend ve frontend işlerine de uyar.
 */
export function rolUyumu(g: Pick<Gorev, "baslik" | "aciklama" | "etiket">, rol: string): number {
  if (IS_ALMAYAN.has(rol)) return 0;
  const puan = rolPuanlari(g);
  const enYuksek = Math.max(...Object.entries(puan).filter(([r]) => r !== "fullstack").map(([, p]) => p));
  if (enYuksek <= 0) return GELISTIRICI.has(rol) ? 1 : 0;
  const benim = puan[rol] ?? 0;
  if (benim <= 0) return 0;
  // fullstack, en yüksek puanı backend ya da frontend alan işe uyar
  if (rol === "fullstack") return (puan.backend ?? 0) === enYuksek || (puan.frontend ?? 0) === enYuksek || benim >= enYuksek ? benim : 0;
  return benim >= enYuksek ? benim : 0;
}

/** Görevin bağımlılıkları bitti mi */
export function hazirMi(g: Gorev, gorevler: Gorev[]): boolean {
  return g.bagimliliklar.every((b) => gorevler.find((x) => x.id === b)?.durum === "tamam");
}

/**
 * Boştaki çalışanın sıradaki işi: önce kendisine atanmış, bağımlılıkları bitmiş planlı (sonra bekleyen) işler; yoksa
 * rolüne en çok uyan atanmamış iş. alinanlar: aynı turda başkasına verilen işler.
 */
export function siradakiIs(ajan: Pick<Ajan, "id" | "rol">, gorevler: Gorev[], alinanlar: Set<string> = new Set()): Gorev | null {
  const acik = (g: Gorev) => (g.durum === "planlandi" || g.durum === "bekleyen") && !alinanlar.has(g.id) && hazirMi(g, gorevler);
  const sira = (a: Gorev, b: Gorev) => (a.durum === b.durum ? a.no - b.no : a.durum === "planlandi" ? -1 : 1);
  const kendi = gorevler.filter((g) => g.atananId === ajan.id && acik(g)).sort(sira);
  if (kendi[0]) return kendi[0];
  if (IS_ALMAYAN.has(ajan.rol)) return null;
  const uyan = gorevler
    .filter((g) => !g.atananId && acik(g))
    .map((g) => ({ g, p: rolUyumu(g, ajan.rol) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || sira(a.g, b.g));
  return uyan[0]?.g ?? null;
}
