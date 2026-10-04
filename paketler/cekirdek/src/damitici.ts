// Global zekânın damıtıcısı: ham gözlemi (kurul tercihi, ders, düzeltme, ajan önerisi) projeden bağımsız, kısa ve
// uygulanabilir tek bir kurala çevirir ya da yalnız o projeye özgü olduğu için eler. Claude Code üzerinden (abonelikle)
// küçük modelle tek seferlik çağrı yapılır; araç verilmez, oturum kaydı tutulmaz. Ulaşılamazsa null döner ve gözlem
// sezgisel yoldan, temkinli işlenir (tek projeden gelen ham gözlem doğrudan standart olmaz).
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Dil } from "@arnorg/ortak";
import { ajanOrtami, rootMu } from "./ortam.js";

export type DamitmaSonucu = { tur: "kural"; metin: string } | { tur: "ozgu" } | null;

export interface DamitmaBaglami {
  projeAd: string | null;
  dil: Dil;
}

export type Damitici = (metin: string, baglam: DamitmaBaglami) => Promise<DamitmaSonucu>;

/** Kural metninin üst sınırı (talimata kısa ve okunur girsin) */
export const DAMITILMIS_SINIR = 200;

export const DAMITMA_SISTEMI =
  "You maintain the global rulebook of an AI software company whose employees are coding agents. " +
  "You turn one observation from a project into at most one reusable, project-independent working rule. " +
  "Answer with a single line and nothing else.";

/** Modele giden istem; çıktı dili kurulun seçtiği dildir */
export function damitmaIstemi(metin: string, b: DamitmaBaglami): string {
  const dilAdi = b.dil === "en" ? "English" : "Turkish";
  return [
    `Observation${b.projeAd ? ` from the project "${b.projeAd}"` : ""}:`,
    '"""',
    metin,
    '"""',
    "",
    `If it expresses a working rule or preference that would also help in other software projects (engineering practice, quality, process, communication, safety), rewrite it as ONE short imperative rule of at most 160 characters in ${dilAdi}. Leave out project names, product features, file names, versions, people and one-off details. Answer exactly: RULE: <rule>`,
    "",
    "If it only makes sense for this project (a product decision, a feature list, a technology choice made for this product), answer exactly: PROJECT",
  ].join("\n");
}

/** Model yanıtını çözer: "RULE: …" kural, "PROJECT" projeye özgü, başka her şey belirsiz (null) */
export function damitmaYanitiniCoz(yanit: string): DamitmaSonucu {
  const satir = yanit
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  if (!satir) return null;
  if (/^\**PROJECT\b/i.test(satir)) return { tur: "ozgu" };
  const m = /^\**RULE\**:\s*(.+)$/i.exec(satir);
  if (!m) return null;
  const metin = m[1]!.replace(/^["'“”‘’`*]+|["'“”‘’`*]+$/g, "").replace(/\s+/g, " ").trim();
  if (metin.length < 8 || metin.length > DAMITILMIS_SINIR) return null;
  return { tur: "kural", metin };
}

export interface ClaudeDamiticiSecenekleri {
  /** Claude Code'un çalışacağı dizin (veri dizini; proje değil) */
  cwd: string;
  claudeYolu: () => string | null;
  /** false dönerse çağrı yapılmaz (ör. abonelik penceresi kurulun sınırında) */
  izinli?: () => boolean;
  zamanAsimiMs?: number;
}

/** Claude Code (haiku) ile damıtır; hata, zaman aşımı ya da izin yoksa null */
export function claudeDamitici(s: ClaudeDamiticiSecenekleri): Damitici {
  return async (metin, b) => {
    if (s.izinli && !s.izinli()) return null;
    const yol = s.claudeYolu();
    const q = query({
      prompt: damitmaIstemi(metin, b),
      options: {
        cwd: s.cwd,
        model: "haiku",
        maxTurns: 1,
        tools: [],
        systemPrompt: DAMITMA_SISTEMI,
        settingSources: [],
        persistSession: false,
        ...(yol ? { pathToClaudeCodeExecutable: yol } : {}),
        env: ajanOrtami({ IS_SANDBOX: rootMu() ? "1" : undefined }),
      },
    });
    const zaman = setTimeout(() => {
      try {
        q.close();
      } catch {
        // zaten kapandı
      }
    }, s.zamanAsimiMs ?? 45_000);
    zaman.unref?.();
    try {
      for await (const m of q) {
        if (m.type === "result") return m.subtype === "success" ? damitmaYanitiniCoz(m.result) : null;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(zaman);
      try {
        q.close();
      } catch {
        // zaten kapandı
      }
    }
  };
}
