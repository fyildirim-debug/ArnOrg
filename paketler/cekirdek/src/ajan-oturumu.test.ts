// Ajan oturumunun Claude Code kimlik sorunlarında duraklaması ve giriş sonrası sürmesi (SDK'nın query'si sahte)
import os from "node:os";
import type { Ajan, AjanDurumu } from "@arnorg/ortak";
import { describe, expect, it, vi } from "vitest";
import { AJAN_TUR_TAVANI, AjanOturumu, yedekModel, type OturumBaglami } from "./ajan-oturumu.js";

type Senaryo = (kapandi: Promise<void>) => AsyncGenerator<unknown>;

const sahte = vi.hoisted(() => ({
  senaryo: null as null | ((kapandi: Promise<void>) => AsyncGenerator<unknown>),
  secenekler: [] as Record<string, unknown>[],
  /** Turu kesme (interrupt) çağrılınca */
  kes: null as null | (() => void),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", async (asil) => {
  const gercek = await asil<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...gercek,
    query: ({ options }: { options: Record<string, unknown> }) => {
      sahte.secenekler.push(options);
      let kapat!: () => void;
      const kapandi = new Promise<void>((coz) => (kapat = coz));
      return Object.assign(sahte.senaryo!(kapandi), { close: () => kapat(), interrupt: async () => sahte.kes?.() });
    },
  };
});

const init = { type: "system", subtype: "init", session_id: "oturum-1", model: "haiku", permissionMode: "bypassPermissions", apiKeySource: "none" };
const sonuc = { type: "result", subtype: "success", result: "tamam", modelUsage: {} };

function baglam() {
  const durumlar: [AjanDurumu, string | undefined][] = [];
  const sorunlar: [string, string][] = [];
  const bittiler: (string | null)[] = [];
  const kullanimlar: number[] = [];
  const tahminler: number[] = [];
  const tavanlar: number[] = [];
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
    kullanim: (d) => kullanimlar.push(d.token),
    turKullanimi: (t) => tahminler.push(t),
    turTavaniAsildi: (n) => tavanlar.push(n),
    pencere: () => undefined,
    oturumToplami: { oku: () => null, yaz: () => undefined },
    girisKaynagi: () => undefined,
    kimlikSorunu: (s, a) => sorunlar.push([s, a]),
    bitti: (h) => bittiler.push(h),
  };
  return { b, ajan, durumlar, sorunlar, bittiler, kullanimlar, tahminler, tavanlar };
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

describe("tur tavanı, yedek model ve duraklatma", () => {
  it("yedek model: fable → opus, opus → sonnet, sonnet → haiku; haiku ve bilinmeyen için yok", () => {
    expect(yedekModel("fable")).toBe("opus");
    expect(yedekModel("claude-fable-5-1")).toBe("opus");
    expect(yedekModel("opus")).toBe("sonnet");
    expect(yedekModel("claude-opus-5-5")).toBe("sonnet");
    expect(yedekModel("claude-opus-4-5")).toBe("sonnet");
    expect(yedekModel("sonnet")).toBe("haiku");
    expect(yedekModel("claude-sonnet-4-5[1m]")).toBe("haiku");
    expect(yedekModel("haiku")).toBeNull();
    expect(yedekModel("claude-haiku-4-5")).toBeNull();
    expect(yedekModel("default")).toBeNull();
  });

  it("sorgu tur tavanıyla ve birincil modelin yedeğiyle açılır; zorlanan model de birincil sayılır", async () => {
    const acVeOku = async (model: string, zorla?: string) => {
      const { b, ajan, durumlar } = baglam();
      (ajan as { model: string }).model = model;
      const eski = process.env.ARNORG_MODEL_ZORLA;
      if (zorla) process.env.ARNORG_MODEL_ZORLA = zorla;
      else delete process.env.ARNORG_MODEL_ZORLA;
      senaryo(async function* (kapandi) {
        yield init;
        await kapandi;
      });
      const oturum = new AjanOturumu(b);
      try {
        oturum.baslat("Mesaine başla.");
        await bekle(() => durumlar.some(([, a]) => a === "Çalışıyor"));
      } finally {
        if (eski === undefined) delete process.env.ARNORG_MODEL_ZORLA;
        else process.env.ARNORG_MODEL_ZORLA = eski;
        oturum.kapat();
      }
      const s = sahte.secenekler.at(-1)!;
      return { model: s.model, yedek: s.fallbackModel, tur: s.maxTurns };
    };
    expect(await acVeOku("fable")).toEqual({ model: "fable", yedek: "opus", tur: AJAN_TUR_TAVANI });
    expect(await acVeOku("fable", "haiku")).toEqual({ model: "haiku", yedek: undefined, tur: 200 });
    expect(await acVeOku("opus")).toEqual({ model: "opus", yedek: "sonnet", tur: AJAN_TUR_TAVANI });
    expect(await acVeOku("sonnet")).toEqual({ model: "sonnet", yedek: "haiku", tur: 200 });
    expect(await acVeOku("haiku")).toEqual({ model: "haiku", yedek: undefined, tur: 200 });
    expect(await acVeOku("opus", "haiku")).toEqual({ model: "haiku", yedek: undefined, tur: 200 });
    expect(await acVeOku("haiku", "sonnet")).toEqual({ model: "sonnet", yedek: "haiku", tur: 200 });
  });

  it("tur tavanında biten tur ajanı boşa çıkarır ve Şirket'e bildirir; oturum açık kalır", async () => {
    const { b, durumlar, tavanlar } = baglam();
    senaryo(async function* (kapandi) {
      yield init;
      yield { type: "result", subtype: "error_max_turns", num_turns: 201, errors: ["Reached maximum number of turns (200)"], modelUsage: {} };
      await kapandi;
    });
    const oturum = new AjanOturumu(b);
    oturum.baslat("Mesaine başla.");
    await bekle(() => tavanlar.length === 1);
    expect(tavanlar).toEqual([AJAN_TUR_TAVANI]);
    expect(durumlar.at(-1)?.[0]).toBe("bosta");
    expect(oturum.acik).toBe(true);
    oturum.kapat();
  });

  it("asistan mesajlarındaki kullanım tur sürerken tahmin edilir: aynı API mesajı bir kez, önbellekten okuma hariç", async () => {
    const { b, tahminler, kullanimlar } = baglam();
    const parca = (id: string, girdi: number, cikti: number, yazim: number) => ({
      type: "assistant",
      parent_tool_use_id: null,
      message: { id, content: [], usage: { input_tokens: girdi, output_tokens: cikti, cache_creation_input_tokens: yazim, cache_read_input_tokens: 99_999 } },
    });
    senaryo(async function* (kapandi) {
      yield init;
      yield parca("m1", 1000, 10, 500);
      yield parca("m1", 1000, 50, 500);
      yield parca("m2", 200, 20, 0);
      yield { type: "result", subtype: "success", result: "tamam", modelUsage: { haiku: { inputTokens: 1200, outputTokens: 70, cacheCreationInputTokens: 500 } } };
      await kapandi;
    });
    const oturum = new AjanOturumu(b);
    oturum.baslat("Mesaine başla.");
    await bekle(() => kullanimlar.length === 1);
    expect(tahminler).toEqual([1510, 1550, 1770]);
    expect(kullanimlar).toEqual([1770]);
    oturum.kapat();
  });

  it("duraklatılan oturumda süren tur kesilir, kesilen turun kullanımı sayılır, oturum kapanır ve ajan duraklatılmış kalır", async () => {
    const { b, durumlar, bittiler, kullanimlar } = baglam();
    let kesildi!: () => void;
    const kesme = new Promise<void>((coz) => (kesildi = coz));
    sahte.kes = () => kesildi();
    senaryo(async function* (kapandi) {
      yield init;
      yield { type: "assistant", parent_tool_use_id: null, message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } }] } };
      await kesme;
      yield { type: "result", subtype: "error_during_execution", modelUsage: { haiku: { inputTokens: 30, outputTokens: 12 } } };
      await kapandi;
    });
    const oturum = new AjanOturumu(b);
    try {
      oturum.baslat("Mesaine başla.");
      await bekle(() => durumlar.some(([, a]) => a === "Komut: npm test"));
      const sinir = durumlar.length;
      oturum.duraklat("Görev token tavanı aşıldı");
      await bekle(() => bittiler.length === 1);
      expect(oturum.acik).toBe(false);
      expect(kullanimlar).toEqual([42]);
      // Duraklatmadan sonra ne tur sonu ne kapanış ajanı boşa ya da kapalıya çevirir
      expect(durumlar.slice(sinir).map(([d]) => d)).toEqual(["duraklatildi", "duraklatildi", "duraklatildi"]);
      expect(durumlar.at(-1)).toEqual(["duraklatildi", "Görev token tavanı aşıldı"]);
      expect(bittiler).toEqual([null]);
    } finally {
      sahte.kes = null;
    }
  });
  it("duraklatılan oturum, Claude Code kuyruğunda bekleyen tur varsa onu işleyip öyle kapanır (mesaj kaybolmaz)", async () => {
    const { b, durumlar, bittiler } = baglam();
    let kesildi!: () => void;
    const kesme = new Promise<void>((coz) => (kesildi = coz));
    let devam!: () => void;
    const ikinciTur = new Promise<void>((coz) => (devam = coz));
    sahte.kes = () => kesildi();
    senaryo(async function* (kapandi) {
      yield init;
      yield { type: "assistant", parent_tool_use_id: null, message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } }] } };
      await kesme;
      yield { type: "result", subtype: "error_during_execution", queued_turn_count: 1, modelUsage: {} };
      await ikinciTur;
      yield { type: "result", subtype: "success", result: "Soruyu yanıtladım.", queued_turn_count: 0, modelUsage: {} };
      await kapandi;
    });
    const oturum = new AjanOturumu(b);
    try {
      oturum.baslat("Mesaine başla.");
      await bekle(() => durumlar.some(([, a]) => a === "Komut: npm test"));
      oturum.duraklat("Görev token tavanı aşıldı");
      await bekle(() => durumlar.filter(([d]) => d === "duraklatildi").length >= 2);
      await new Promise((r) => setTimeout(r, 30));
      // Kesilen turun sonucu geldi ama kuyrukta tur var: oturum açık, ajan duraklatılmış görünür
      expect(oturum.acik).toBe(true);
      expect(durumlar.at(-1)?.[0]).toBe("duraklatildi");
      devam();
      await bekle(() => bittiler.length === 1);
      expect(oturum.acik).toBe(false);
      expect(durumlar.at(-1)).toEqual(["duraklatildi", "Görev token tavanı aşıldı"]);
    } finally {
      sahte.kes = null;
    }
  });
});
