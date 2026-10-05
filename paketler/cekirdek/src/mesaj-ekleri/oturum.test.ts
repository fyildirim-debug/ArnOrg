// Ajan oturumuna giden kullanıcı mesajı (SDK'nın query'si sahte): metinde ters tırnakla anılan ek görseli
// SDKUserMessage içeriğine görsel bloğu olarak girer; eksiz mesaj düz metin kalır. Oturum ilk mesajla açılırken de,
// açık oturumun kuyruğuna eklenirken de aynı.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ajan } from "@arnorg/ortak";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AjanOturumu, type OturumBaglami } from "../ajan-oturumu.js";
import { ekMetni } from "./index.js";

const sahte = vi.hoisted(() => ({ mesajlar: [] as { message: { content: unknown }; origin?: unknown }[] }));

vi.mock("@anthropic-ai/claude-agent-sdk", async (asil) => {
  const gercek = await asil<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...gercek,
    query: ({ prompt }: { prompt: AsyncIterable<{ message: { content: unknown } }> }) => {
      let kapat!: () => void;
      const kapandi = new Promise<void>((coz) => (kapat = coz));
      void (async () => {
        for await (const m of prompt) sahte.mesajlar.push(m);
      })();
      async function* akis() {
        yield { type: "system", subtype: "init", session_id: "oturum-ek", model: "haiku", permissionMode: "bypassPermissions", apiKeySource: "none" };
        await kapandi;
      }
      return Object.assign(akis(), { close: () => kapat(), interrupt: async () => undefined });
    },
  };
});

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-ek-oturum-"));

afterAll(() => {
  fs.rmSync(gecici, { recursive: true, force: true });
});

function baglam(): OturumBaglami {
  const ajan = { id: "a1", ad: "Ada", rol: "ceo", projeId: "p1", model: "haiku", izinModu: "bypassPermissions", oturumId: null } as unknown as Ajan;
  return {
    ajan: () => ajan,
    cwd: gecici,
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
    durum: () => undefined,
    oturumKimligi: () => undefined,
    kullanim: () => undefined,
    pencere: () => undefined,
    oturumToplami: { oku: () => null, yaz: () => undefined },
    girisKaynagi: () => undefined,
    kimlikSorunu: () => undefined,
    bitti: () => undefined,
  };
}

async function bekle(kosul: () => boolean) {
  for (let i = 0; i < 200 && !kosul(); i++) await new Promise((coz) => setTimeout(coz, 5));
  expect(kosul()).toBe(true);
}

describe("ajan oturumunda ek görselleri", () => {
  it("kurulun ekli mesajı görsel bloğuyla gider; sonraki eksiz mesaj düz metin kalır", async () => {
    const dizin = path.join(gecici, "proje", ".arnorg", "ekler");
    fs.mkdirSync(dizin, { recursive: true });
    const yol = path.join(dizin, "3f2a9c1e-0d4b-4e5f-9a8b-7c6d5e4f3a2b.png");
    fs.writeFileSync(yol, PNG_1X1);
    const metin = `#yonetim · Yönetim kurulu: Bu ekranda ne var?${ekMetni([{ id: "3f2a9c1e", ad: "ekran.png", tur: "gorsel", mime: "image/png", boyut: PNG_1X1.length, genislik: 1, yukseklik: 1, yol }])}`;

    const oturum = new AjanOturumu(baglam());
    oturum.baslat(metin);
    await bekle(() => sahte.mesajlar.length === 1);
    expect(sahte.mesajlar[0]!.message.content).toEqual([
      { type: "text", text: "ekran.png" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_1X1.toString("base64") } },
      { type: "text", text: metin },
    ]);
    expect(sahte.mesajlar[0]!.origin).toEqual({ kind: "human" });

    // Açık oturumun kuyruğu: ajandan gelen ekli mesaj da görselle, eksiz mesaj düz metin
    oturum.gonder(`Şuna da bak: \`${yol}\``, "next", { tur: "ajan", ad: "Deniz", id: "a2" });
    oturum.gonder("Teşekkürler.", "next", { tur: "kurul" });
    await bekle(() => sahte.mesajlar.length === 3);
    const ikinci = sahte.mesajlar[1]!.message.content as { type: string; text?: string }[];
    expect(ikinci.map((b) => b.type)).toEqual(["text", "image", "text"]);
    expect(ikinci.at(-1)?.text).toBe(`[Deniz] Şuna da bak: \`${yol}\``);
    expect(sahte.mesajlar[2]!.message.content).toBe("Teşekkürler.");
    oturum.kapat();
  });
});
