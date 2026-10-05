// Atanan skillerin oturuma yüklenmesi (0.0.8): veri dizininde çalışan başına yerel eklenti, SDK'nın plugins seçeneği ve
// Şirket'in oturum bağlamı. SDK'nın query'si sahte; Claude Code açılmaz.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ajan } from "@arnorg/ortak";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AjanOturumu, type OturumBaglami } from "./ajan-oturumu.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { skillEklentiKoku, skillEklentileri, skillEklentisiHazirla } from "./skill-eklentisi.js";
import { rolSkilleri, skillKoku } from "./skiller.js";
import { Yapilandirma } from "./yapilandirma.js";

const sahte = vi.hoisted(() => ({ secenekler: [] as Record<string, unknown>[] }));

vi.mock("@anthropic-ai/claude-agent-sdk", async (asil) => {
  const gercek = await asil<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...gercek,
    query: ({ options }: { options: Record<string, unknown> }) => {
      sahte.secenekler.push(options);
      async function* bos() {
        yield { type: "system", subtype: "init", session_id: "o1", model: "haiku", permissionMode: "default" };
        yield { type: "result", subtype: "success", result: "tamam", modelUsage: {} };
      }
      return Object.assign(bos(), { close: () => undefined, interrupt: async () => undefined });
    },
  };
});

let gecici: string;
const veri = () => path.join(gecici, "veri");
const ajan = (skiller: string[] | undefined, rol = "backend", id = "a1"): Pick<Ajan, "id" | "rol" | "skiller"> => ({ id, rol, skiller });

/** Eklentinin skills/ altındaki klasörler */
const skillKlasorleri = (yol: string) => fs.readdirSync(path.join(yol, "skills")).sort();

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-eklenti-"));
});

afterAll(() => {
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("çalışanın skill eklentisi", () => {
  it("veri dizininde yalnız atanan skillerle kurulur; manifest arnorg adını taşır", () => {
    const yol = skillEklentisiHazirla(veri(), ajan(["humanizer", "test-driven-development"]))!;
    expect(path.dirname(yol)).toBe(skillEklentiKoku(veri(), "a1"));
    expect(path.relative(veri(), yol).split(path.sep).slice(0, 2)).toEqual(["skiller", "a1"]);
    const manifest = JSON.parse(fs.readFileSync(path.join(yol, ".claude-plugin", "plugin.json"), "utf8")) as { name: string };
    expect(manifest.name).toBe("arnorg");
    expect(skillKlasorleri(yol)).toEqual(["humanizer", "test-driven-development"]);
    // Skill klasörü kütüphanedekiyle aynı (lisans dosyası dahil)
    const kaynak = path.join(skillKoku()!, "humanizer");
    expect(fs.readFileSync(path.join(yol, "skills", "humanizer", "SKILL.md"), "utf8")).toBe(fs.readFileSync(path.join(kaynak, "SKILL.md"), "utf8"));
    expect(fs.existsSync(path.join(yol, "skills", "humanizer", "LICENSE"))).toBe(true);
  });

  it("atama değişmedikçe aynı klasör kullanılır; değişince yenisi kurulur, eskisi silinir", () => {
    const ilk = skillEklentisiHazirla(veri(), ajan(["humanizer", "test-driven-development"]))!;
    const isaret = path.join(ilk, "skills", "humanizer", "isaret");
    fs.writeFileSync(isaret, "");
    expect(skillEklentisiHazirla(veri(), ajan(["test-driven-development", "humanizer"]))).toBe(ilk);
    expect(fs.existsSync(isaret)).toBe(true);
    const ikinci = skillEklentisiHazirla(veri(), ajan(["mermaid-diagrams"]))!;
    expect(ikinci).not.toBe(ilk);
    expect(fs.existsSync(ilk)).toBe(false);
    expect(skillKlasorleri(ikinci)).toEqual(["mermaid-diagrams"]);
    expect(fs.readdirSync(skillEklentiKoku(veri(), "a1"))).toEqual([path.basename(ikinci)]);
  });

  it("skili olmayan ve CEO eklenti almaz; eski klasör temizlenir", () => {
    expect(skillEklentisiHazirla(veri(), ajan([]))).toBeNull();
    expect(fs.readdirSync(skillEklentiKoku(veri(), "a1"))).toEqual([]);
    expect(skillEklentisiHazirla(veri(), ajan(undefined, "ceo", "c1"))).toBeNull();
    expect(skillEklentileri(veri(), ajan([]))).toEqual([]);
  });

  it("alan yoksa rolün varsayılanları yüklenir; plugins seçeneği MCP aramadan yerel eklenti verir", () => {
    const [eklenti] = skillEklentileri(veri(), ajan(undefined, "tanitim", "t1"));
    expect(eklenti).toMatchObject({ type: "local", skipMcpDiscovery: true });
    expect(skillKlasorleri(eklenti!.path)).toEqual([...rolSkilleri("tanitim")].sort());
  });

  it("kurulum hatası oturumu durdurmaz: çalışan skillsiz açılır, hata bildirilir", () => {
    const dosya = path.join(gecici, "dosya-olan-veri");
    fs.writeFileSync(dosya, "");
    const hatalar: string[] = [];
    expect(skillEklentileri(dosya, ajan(["humanizer"]), (h) => hatalar.push(h.message))).toEqual([]);
    expect(hatalar).toHaveLength(1);
  });
});

describe("oturum seçenekleri", () => {
  it("AjanOturumu eklentileri SDK'nın plugins seçeneğiyle verir", async () => {
    const eklentiler = skillEklentileri(veri(), ajan(["systematic-debugging"], "backend", "o1"));
    let bitti = false;
    const b = {
      ajan: () => ({ id: "o1", ad: "Deniz", rol: "backend", projeId: "p1", model: "haiku", izinModu: "default", oturumId: null }) as unknown as Ajan,
      cwd: gecici,
      claudeYolu: null,
      talimat: () => "",
      araclar: () => ({}) as ReturnType<OturumBaglami["araclar"]>,
      yasakAraclar: () => [],
      eklentiler: () => eklentiler,
      onaySuresiSn: () => 60,
      kapi: async () => ({}),
      izinSor: async (_arac: string, girdi: Record<string, unknown>) => ({ behavior: "allow" as const, updatedInput: girdi }),
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
      bitti: () => {
        bitti = true;
      },
    } satisfies OturumBaglami;
    sahte.secenekler.length = 0;
    const oturum = new AjanOturumu(b);
    oturum.baslat("merhaba");
    oturum.kapat();
    for (let i = 0; i < 100 && !bitti; i++) await new Promise((r) => setTimeout(r, 5));
    expect(sahte.secenekler).toHaveLength(1);
    expect(sahte.secenekler[0]!.plugins).toEqual(eklentiler);
    // Proje ayarları yine okunur; kullanıcı ayarları (ev dizinindeki skiller) okunmaz
    expect(sahte.secenekler[0]!.settingSources).toEqual(["project"]);
  });

  it("Şirket çalışanın oturumuna kendi eklentisini bağlar; CEO'ya bağlamaz", async () => {
    const yap = new Yapilandirma(path.join(gecici, "sirket-veri"));
    const depo = new Depo(path.join(gecici, "sirket-veri", "arnorg.db"));
    const sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    try {
      const pid = (await sirket.projeOlustur({ ad: "Eklenti", yol: path.join(gecici, "repo"), olustur: true })).id;
      const deniz = sirket.iseAl(pid, { ad: "Deniz", rol: "backend", skiller: ["api-design-principles"] });
      const ceo = depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
      const baglam = (a: Ajan) =>
        (
          (sirket as unknown as { oturumAl(a: Ajan, cwd: string): AjanOturumu }).oturumAl(a, gecici) as unknown as { b: OturumBaglami }
        ).b;
      const [eklenti] = baglam(deniz).eklentiler!();
      expect(eklenti!.path.startsWith(path.join(yap.veriDizini, "skiller", deniz.id))).toBe(true);
      expect(skillKlasorleri(eklenti!.path)).toEqual(["api-design-principles"]);
      expect(baglam(ceo).eklentiler!()).toEqual([]);
      // Kullanıcının reposuna skill yazılmaz
      expect(fs.existsSync(path.join(gecici, "repo", ".claude", "skills"))).toBe(false);
    } finally {
      sirket.kapat();
      depo.kapat();
    }
  });
});
