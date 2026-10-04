// Ajan oturumunun Claude Code kimlik sorunlarında duraklaması ve giriş sonrası sürmesi (SDK'nın query'si sahte)
import os from "node:os";
import type { Ajan, AjanDurumu } from "@arnorg/ortak";
import { describe, expect, it, vi } from "vitest";
import { AjanOturumu, type OturumBaglami } from "./ajan-oturumu.js";

type Senaryo = (kapandi: Promise<void>) => AsyncGenerator<unknown>;

const sahte = vi.hoisted(() => ({
  senaryo: null as null | ((kapandi: Promise<void>) => AsyncGenerator<unknown>),
  secenekler: [] as Record<string, unknown>[],
}));

vi.mock("@anthropic-ai/claude-agent-sdk", async (asil) => {
  const gercek = await asil<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...gercek,
    query: ({ options }: { options: Record<string, unknown> }) => {
      sahte.secenekler.push(options);
      let kapat!: () => void;
      const kapandi = new Promise<void>((coz) => (kapat = coz));
      return Object.assign(sahte.senaryo!(kapandi), { close: () => kapat(), interrupt: async () => undefined });
    },
  };
});

const init = { type: "system", subtype: "init", session_id: "oturum-1", model: "haiku", permissionMode: "bypassPermissions", apiKeySource: "none" };
const sonuc = { type: "result", subtype: "success", result: "tamam", modelUsage: {} };

function baglam() {
  const durumlar: [AjanDurumu, string | undefined][] = [];
  const sorunlar: [string, string][] = [];
  const bittiler: (string | null)[] = [];
  const ajan = {
    id: "a1",
    ad: "Ada",
    rol: "ceo",
    projeId: "p1",
    model: "haiku",
    izinModu: "bypassPermissions",
    oturumId: null as string | null,
  } as unknown as Ajan;
  const b: OturumBaglami = {
    ajan: () => ajan,
    cwd: os.tmpdir(),
    claudeYolu: null,
    talimat: () => "",
    araclar: () => ({}) as ReturnType<OturumBaglami["araclar"]>,
    yasakAraclar: () => [],
    onaySuresiSn: () => 60,
    kapi: async () => ({}),
    izinSor: async (_arac, girdi) => ({ behavior: "allow", updatedInput: girdi }),
    aracSonrasi: () => null,
    aracHatasi: () => null,
    turBasi: () => null,
    sikistirmaSonrasi: () => null,
    akis: () => undefined,
    durum: (d, a) => durumlar.push([d, a]),
    oturumKimligi: (id) => (ajan.oturumId = id || null),
    kullanim: () => undefined,
    pencere: () => undefined,
    oturumToplami: { oku: () => null, yaz: () => undefined },
    girisKaynagi: () => undefined,
    kimlikSorunu: (s, a) => sorunlar.push([s, a]),
    bitti: (h) => bittiler.push(h),
  };
  return { b, durumlar, sorunlar, bittiler };
}

async function bekle(kosul: () => boolean) {
  for (let i = 0; i < 200 && !kosul(); i++) await new Promise((coz) => setTimeout(coz, 5));
  expect(kosul()).toBe(true);
}

function senaryo(f: Senaryo) {
  sahte.senaryo = f;
}

describe("ajan oturumu ve Claude Code kimlik sorunları", () => {
  it("asistan mesajındaki giriş hatasında oturum kapanır ve giriş beklenerek duraklar; sonra kaldığı yerden sürer", async () => {
    const { b, durumlar, sorunlar, bittiler } = baglam();
    senaryo(async function* (kapandi) {
      yield init;
      yield {
        type: "assistant",
        parent_tool_use_id: null,
        error: "authentication_failed",
        message: { content: [{ type: "text", text: "Invalid API key · Please run /login" }] },
      };
      yield sonuc;
      await kapandi;
    });
    const oturum = new AjanOturumu(b);
    oturum.baslat("Mesaine başla.");
    await bekle(() => bittiler.length === 1);
    expect(oturum.acik).toBe(false);
    expect(sorunlar).toEqual([["giris", "Invalid API key · Please run /login"]]);
    expect(bittiler).toEqual([null]);
    const son = durumlar.at(-1)!;
    expect(son[0]).toBe("duraklatildi");
    expect(son[1]).toMatch(/Claude Code girişi bekleniyor|Waiting for Claude Code sign-in/);

    // Giriş yapıldı: yeni süreç aynı konuşmayı sürdürür, olağan kapanış yine "kapalı" yazar
    senaryo(async function* (kapandi) {
      yield init;
      yield sonuc;
      await kapandi;
    });
    oturum.gonder("Claude Code girişi yenilendi; devam et.", "next", { tur: "sistem" });
    await bekle(() => durumlar.at(-1)?.[0] === "bosta");
    expect(sahte.secenekler.at(-1)?.resume).toBe("oturum-1");
    oturum.kapat();
    await bekle(() => bittiler.length === 2);
    expect(durumlar.at(-1)?.[0]).toBe("kapali");
    expect(sorunlar).toHaveLength(1);
  });

  it("giriş hatasıyla çöken oturum hata değil, giriş bekleyen duraklama olur", async () => {
    const { b, durumlar, sorunlar, bittiler } = baglam();
    senaryo(async function* () {
      yield init;
      throw new Error("Claude Code process exited with code 1 · Not logged in · Please run /login");
    });
    new AjanOturumu(b).baslat("Mesaine başla.");
    await bekle(() => bittiler.length === 1);
    expect(sorunlar.map((s) => s[0])).toEqual(["giris"]);
    expect(durumlar.at(-1)?.[0]).toBe("duraklatildi");
    expect(bittiler).toEqual([null]);
  });

  it("kimlikle ilgisiz çökme eskisi gibi hata olarak kalır", async () => {
    const { b, durumlar, sorunlar, bittiler } = baglam();
    senaryo(async function* () {
      yield init;
      throw new Error("Claude Code process exited with code 1 · spawn git ENOENT");
    });
    new AjanOturumu(b).baslat("Mesaine başla.");
    await bekle(() => bittiler.length === 1);
    expect(sorunlar).toHaveLength(0);
    expect(durumlar.at(-1)?.[0]).toBe("hata");
    expect(bittiler[0]).toContain("spawn git ENOENT");
  });
});
