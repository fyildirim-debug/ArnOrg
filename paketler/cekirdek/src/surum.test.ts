// Sürüm tutarlılığı: kök paket, çalışma alanı paketleri, kilit dosyası ve ARNORG_SURUMU aynı sürümü taşır.
// Sürüm değiştirmek için: npm run surum -- <sürüm> (betikler/surum.mjs)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARNORG_SURUMU } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const json = (yol: string) => JSON.parse(fs.readFileSync(path.join(KOK, yol), "utf8")) as Record<string, unknown>;

describe("sürüm", () => {
  it("kök, çalışma alanları, kilit dosyası ve ARNORG_SURUMU aynı sürümdedir", () => {
    const kok = json("package.json") as { version: string; workspaces: string[] };
    expect(ARNORG_SURUMU).toBe(kok.version);
    for (const w of kok.workspaces) expect((json(`${w}/package.json`) as { version: string }).version, w).toBe(kok.version);
    const kilit = json("package-lock.json") as { version: string; packages: Record<string, { version?: string }> };
    expect(kilit.version).toBe(kok.version);
    expect(kilit.packages[""]?.version).toBe(kok.version);
    for (const w of kok.workspaces) expect(kilit.packages[w]?.version, `package-lock.json → ${w}`).toBe(kok.version);
  });

  it("sürüm betiği uyuşmayan etiketi reddeder", () => {
    const calistir = (...a: string[]) => execFileSync(process.execPath, [path.join(KOK, "betikler/surum.mjs"), ...a], { cwd: KOK, stdio: "pipe" });
    expect(() => calistir("--denetle", "v9.9.9")).toThrow(/uyuşmuyor/);
    expect(() => calistir("--denetle", "surum-1")).toThrow(/sürüm etiketi değil/);
  });
});
