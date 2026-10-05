// Araç sonrası kancası ve proje adresleri (0.0.8): Claude Code'un PostToolUse girdisindeki araç yanıtı oturumdan
// şirkete, şirketten adres kaydına ulaşır (SDK'nın query'si sahte; oturum açılmaz)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { Ajan } from "@arnorg/ortak";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AjanOturumu, type OturumBaglami } from "./ajan-oturumu.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

const sahte = vi.hoisted(() => ({ secenekler: [] as Record<string, unknown>[] }));

vi.mock("@anthropic-ai/claude-agent-sdk", async (asil) => {
  const gercek = await asil<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...gercek,
    query: ({ options }: { options: Record<string, unknown> }) => {
      sahte.secenekler.push(options);
      // Hemen biten akış: yalnız seçenekler (kancalar) görülür
      return Object.assign((async function* () {})(), { close: () => undefined, interrupt: async () => undefined });
    },
  };
});

const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-adres-kancasi-"));
afterAll(() => fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const VITE = "  VITE v8.3.2  ready in 432 ms\n\n  ➜  Local:   http://localhost:5299/\n  ➜  Network: use --host to expose\n";

describe("araç sonrası kancası", () => {
  it("oturum PostToolUse yanıtını aracSonrasi'na iletir, dönen notu ek bağlam yapar", async () => {
    const cagrilar: unknown[][] = [];
    const ajan = { id: "a1", ad: "Ece", rol: "frontend", projeId: "p1", model: "haiku", izinModu: "bypassPermissions", oturumId: null } as unknown as Ajan;
    const b = {
      ajan: () => ajan,
      cwd: os.tmpdir(),
      claudeYolu: null,
      talimat: () => "",
      araclar: () => ({}),
      yasakAraclar: () => [],
      onaySuresiSn: () => 60,
      kapi: async () => ({}),
      izinSor: async (_a: string, girdi: Record<string, unknown>) => ({ behavior: "allow", updatedInput: girdi }),
      aracSonrasi: (...a: unknown[]) => {
        cagrilar.push(a);
        return "[ArnOrg] not";
      },
      aracHatasi: () => null,
      turBasi: () => null,
      sikistirmaSonrasi: () => null,
      akis: () => undefined,
      durum: () => undefined,
      oturumKimligi: () => undefined,
      kullanim: () => undefined,
      pencere: () => undefined,
      oturumToplami: { oku: () => null, yaz: () => undefined },
      girisKaynagi: () => undefined,
      kimlikSorunu: () => undefined,
      bitti: () => undefined,
    } as unknown as OturumBaglami;
    const oturum = new AjanOturumu(b);
    oturum.baslat("Geliştirme sunucusunu aç.");
    for (let i = 0; i < 100 && !sahte.secenekler.length; i++) await new Promise((coz) => setTimeout(coz, 5));
    const kancalar = sahte.secenekler.at(-1)?.hooks as Record<string, { hooks: HookCallback[] }[]>;
    const sonra = kancalar.PostToolUse![0]!.hooks[0]!;
    const yanit = { stdout: VITE, stderr: "", interrupted: false };
    const cikti = await sonra({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npx vite" }, tool_response: yanit, tool_use_id: "toolu_1", session_id: "s", transcript_path: "", cwd: "" } as never, "toolu_1", {
      signal: new AbortController().signal,
    });
    expect(cagrilar).toEqual([["Bash", { command: "npx vite" }, "toolu_1", yanit]]);
    expect(cikti).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "[ArnOrg] not" } });
    oturum.kapat();
  });

  it("şirketin kancası kabuk çıktısındaki adresi proje adreslerine ekler ve çalışana not düşer", async () => {
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    const depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    const sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    const p = await sirket.projeOlustur({ ad: "Kanca", yol: path.join(gecici, "repo"), olustur: true });
    const ece = sirket.iseAl(p.id, { ad: "Ece", rol: "frontend" });
    const oturum = (sirket as unknown as { oturumAl(a: Ajan, cwd: string): AjanOturumu }).oturumAl(ece, p.yol);
    const b = (oturum as unknown as { b: OturumBaglami }).b;
    const not = b.aracSonrasi("Bash", { command: "npx vite --port 5299" }, "toolu_2", { stdout: VITE, stderr: "", interrupted: false });
    expect(not).toContain("http://localhost:5299/");
    expect(sirket.adresler.listele(p.id)).toMatchObject([{ adres: "http://localhost:5299/", ad: "Vite", bildirenAd: "Ece", kaynak: "cikti", kalici: false }]);
    // Çıktısında sunucu olmayan araç: not yok, liste aynı
    expect(b.aracSonrasi("Bash", { command: "ls" }, "toolu_3", { stdout: "README.md\n", stderr: "", interrupted: false })).toBeNull();
    expect(sirket.adresler.listele(p.id)).toHaveLength(1);
    sirket.kapat();
    depo.kapat();
  });
});
