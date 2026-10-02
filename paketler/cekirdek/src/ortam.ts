// Ajan süreçleri için temiz ortam ve Claude Code ikilisinin bulunması
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Üst Claude Code oturumundan sızmaması gereken değişkenler dışında korunacaklar */
const KORUNAN = new Set([
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_GIT_BASH_PATH",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
]);

/**
 * Üst oturumun kimliğini (CLAUDECODE, CLAUDE_CODE_SESSION_ID…) siler.
 * Aksi halde alt ajan üst oturumun kimliğiyle çalışır (deneyle doğrulandı).
 */
export function temizOrtam(ek: Record<string, string | undefined> = {}): Record<string, string> {
  const ortam: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if ((k === "CLAUDECODE" || k.startsWith("CLAUDE_")) && !KORUNAN.has(k)) continue;
    if (k === "NODE_OPTIONS" || k === "ELECTRON_RUN_AS_NODE") continue;
    ortam[k] = v;
  }
  for (const [k, v] of Object.entries(ek)) if (v !== undefined) ortam[k] = v;
  return ortam;
}

/** Linux/macOS'ta root mu çalışıyoruz (bypass modu için IS_SANDBOX gerekir) */
export function rootMu(): boolean {
  return process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0;
}

function calistirilabilirMi(yol: string): boolean {
  try {
    const d = fs.statSync(yol);
    if (!d.isFile()) return false;
    if (process.platform === "win32") return true;
    fs.accessSync(yol, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** PATH içinde ikili arar; Windows'ta .exe öncelikli (.cmd sarmalayıcıları SDK ile başlatılamaz) */
export function pathIcindeBul(ad: string): string | null {
  const dizinler = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const uzantilar = process.platform === "win32" ? [".exe"] : [""];
  for (const d of dizinler) {
    for (const u of uzantilar) {
      const aday = path.join(d, ad + u);
      if (calistirilabilirMi(aday)) return aday;
    }
  }
  return null;
}

/** Bilinen kurulum yerleri: yerel yükleyici, npm, winget */
function bilinenYerler(): string[] {
  const ev = os.homedir();
  if (process.platform === "win32") {
    const yerel = process.env.LOCALAPPDATA ?? path.join(ev, "AppData", "Local");
    return [path.join(ev, ".local", "bin", "claude.exe"), path.join(yerel, "Programs", "claude", "claude.exe"), path.join(yerel, "AnthropicClaude", "claude.exe")];
  }
  return [path.join(ev, ".local", "bin", "claude"), path.join(ev, ".claude", "local", "claude"), "/usr/local/bin/claude", "/opt/claude-code/bin/claude"];
}

/** Ayardaki yol → PATH → bilinen yerler. Bulunamazsa null: SDK kendi ikilisini kullanır. */
export function claudeYoluBul(ayardaki: string | null): string | null {
  if (ayardaki && calistirilabilirMi(ayardaki)) return ayardaki;
  const p = pathIcindeBul("claude");
  if (p) {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  }
  for (const y of bilinenYerler()) if (calistirilabilirMi(y)) return y;
  return null;
}

export async function claudeSurumu(yol: string | null): Promise<string | null> {
  if (!yol) return null;
  try {
    const { stdout } = await execFileP(yol, ["--version"], { timeout: 10_000, windowsHide: true, env: temizOrtam() });
    return stdout.trim().split(/\s+/)[0] ?? null;
  } catch {
    return null;
  }
}
