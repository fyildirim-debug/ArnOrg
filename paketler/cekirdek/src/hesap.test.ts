// Abonelik: token sayımı, kullanım pencereleri, sınır ve ajan ortamı (ArnOrg yalnız Claude aboneliğiyle çalışır)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SunucuOlayi } from "@arnorg/ortak";
import { islenenToken, toplamFarki } from "./ajan-oturumu.js";
import { Depo } from "./depo.js";
import { tokenMetni } from "./gozetmen.js";
import { pencereleriCikar, sinirAsimi } from "./hesap.js";
import { OlayYolu } from "./olaylar.js";
import { ajanOrtami } from "./ortam.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

describe("token ve toplam", () => {
  it("model başına kullanımdan işlenen tokeni toplar, önbellekten okumayı saymaz", () => {
    expect(
      islenenToken({
        "claude-haiku": { inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 10, cacheReadInputTokens: 5000 } as never,
        "claude-opus": { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 0 },
      }),
    ).toBe(163);
    expect(islenenToken(undefined)).toBe(0);
  });

  it("sürdürülen oturumda önceki toplamı çıkarır, sıfırlanmış toplamı kendisi sayar", () => {
    expect(toplamFarki({ token: 1000 }, { token: 1600 })).toEqual({ token: 600 });
    expect(toplamFarki({ token: 1000 }, { token: 200 })).toEqual({ token: 200 });
  });

  it("token sayısını Türkçe kısaltır", () => {
    expect(tokenMetni(950)).toBe("950");
    expect(tokenMetni(48_200)).toBe("48 bin");
    expect(tokenMetni(1_250_000)).toBe("1,3 milyon");
  });
});

describe("kullanım pencereleri", () => {
  const ham = {
    five_hour: { utilization: 91.5, resets_at: "2099-01-01T12:00:00Z" },
    seven_day: { utilization: 40, resets_at: "2099-01-05T00:00:00Z" },
    seven_day_opus: null,
    model_scoped: [{ display_name: "Fable", utilization: 12, resets_at: null }],
  };

  it("usage cevabını pencere listesine çevirir", () => {
    expect(pencereleriCikar(ham).map((p) => [p.tur, p.ad, p.yuzde])).toEqual([
      ["bes_saat", "5 saatlik pencere", 91.5],
      ["haftalik", "Haftalık", 40],
      ["model", "Haftalık · Fable", 12],
    ]);
    expect(pencereleriCikar(null)).toEqual([]);
  });

  it("sınırı aşan pencereyi bulur; sıfırlanmış pencereyi ve 0 sınırı yok sayar", () => {
    const p = pencereleriCikar(ham);
    expect(sinirAsimi(p, 90, 95)).toMatchObject({ pencere: "5 saatlik pencere", yuzde: 92, sinirYuzde: 90 });
    expect(sinirAsimi(p, 95, 95)).toBeNull();
    expect(sinirAsimi(p, 0, 0)).toBeNull();
    expect(sinirAsimi(p, 90, 95, Date.parse("2099-01-02T00:00:00Z"))).toBeNull();
  });
});

describe("ajan ortamı", () => {
  const kaynak = { ANTHROPIC_API_KEY: "x", ANTHROPIC_AUTH_TOKEN: "y", CLAUDE_CODE_USE_BEDROCK: "1", ANTHROPIC_BASE_URL: "https://ag", HOME: "/home/f" };
  it("API anahtarı ve bulut sağlayıcı değişkenleri ajana hiç geçmez", () => {
    expect(ajanOrtami({ EK: "1" }, kaynak)).toEqual({ ANTHROPIC_BASE_URL: "https://ag", HOME: "/home/f", EK: "1" });
    expect(ajanOrtami({}, kaynak)).not.toHaveProperty("ANTHROPIC_API_KEY");
    // Çağıran açıkça verse bile geçmez
    expect(ajanOrtami({ ANTHROPIC_API_KEY: "z", CLAUDE_CODE_USE_VERTEX: "1" }, kaynak)).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(ajanOrtami({ ANTHROPIC_API_KEY: "z", CLAUDE_CODE_USE_VERTEX: "1" }, kaynak)).not.toHaveProperty("CLAUDE_CODE_USE_VERTEX");
  });
});

describe("şirket: abonelik sınırı ve kullanım", () => {
  let gecici: string;
  let depo: Depo;
  let sirket: Sirket;
  const olaylar = new OlayYolu();
  const gelenler: SunucuOlayi[] = [];

  beforeAll(async () => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-hesap-"));
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    sirket = new Sirket(depo, olaylar, yap, () => null, true);
    olaylar.dinle((o) => gelenler.push(o));
    await sirket.projeOlustur({ ad: "Abonelik", yol: path.join(gecici, "repo"), olustur: true });
  });

  afterAll(() => {
    sirket.kapat();
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true });
  });

  it("kullanım yalnız token olarak sayılır; dolar alanı yok, proje bütçesi token cinsinden", async () => {
    const p = depo.projeler()[0]!;
    const ceo = depo.ajanlar(p.id)[0]!;
    depo.kullanimEkle(p.id, ceo.id, 12_000);
    const sonuc = await sirket.kapi(ceo.id, "Read", { file_path: "README.md" });
    expect(sonuc).toEqual({});
    const ajan = depo.ajan(ceo.id)!;
    expect(ajan).toMatchObject({ bugunToken: 12_000, toplamToken: 12_000 });
    expect(Object.keys(ajan).some((k) => /usd|butce/i.test(k))).toBe(false);
    const ozet = sirket.kullanimOzeti(p.id);
    expect(ozet).toMatchObject({ bugunToken: 12_000, toplamToken: 12_000 });
    expect(JSON.stringify(ozet)).not.toMatch(/usd|dolar/i);
    // 0.0.10: bütçe token cinsindendir; verilmediyse sınırsız
    expect(ozet.butce).toMatchObject({ toplam: null, gunluk: null, durum: "normal" });
    expect(Object.keys(sirket.yapilandirma.ayarlar).some((k) => /usd|butce|giris/i.test(k))).toBe(false);
  });

  it("5 saatlik pencere sınırı aşınca araç reddedilir, ajan mesajı saklanır; açılınca teslim edilmeye çalışılır", async () => {
    const p = depo.projeler()[0]!;
    const ceo = depo.ajanlar(p.id)[0]!;
    sirket.hesap.pencereOlayi({ tur: "five_hour", durum: "allowed_warning", sifirlanma: "2099-01-01T12:00:00Z", yuzde: 93 });
    expect(sirket.hesap.sinir).toMatchObject({ yuzde: 93, sinirYuzde: 90 });
    expect(gelenler.some((o) => o.tur === "hesap.guncellendi")).toBe(true);
    expect(depo.mesajlar(p.id, "genel").some((m) => m.gonderenAd === "ArnOrg" && m.metin.includes("%93"))).toBe(true);

    const ret = await sirket.kapi(ceo.id, "Bash", { command: "npm test" });
    expect(ret).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    expect(depo.denetimKayitlari(p.id, 3).some((k) => k.kural === "Kullanım sınırı")).toBe(true);
    // ArnOrg araçları sınırda da çalışır (ajan durumunu yazabilsin)
    await expect(sirket.kapi(ceo.id, "mcp__arnorg__mesaj_gonder", {})).resolves.toEqual({});
    await expect(sirket.ajanaMesaj(ceo.id, "T-1 incelemeye hazır", "next", { tur: "sistem" })).rejects.toThrow(/sınırda/);

    // Kurul sınırı yükseltirse pencere açılır; saklanan mesajla uyandırma denenir (testte oturumlar kapalı)
    const once = gelenler.length;
    sirket.yapilandirma.guncelle({ besSaatlikSinirYuzde: 95 });
    sirket.hesap.ayarlarDegisti();
    expect(sirket.hesap.sinir).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    const sonraki = gelenler.slice(once);
    expect(sonraki.some((o) => o.tur === "bildirim" && /uyandırılamadı/.test(o.metin))).toBe(true);
  });

  it("dönem raporu abonelikte dolar değil token yazar", async () => {
    const { raporOlustur } = await import("./gozetmen.js");
    const r = raporOlustur(sirket, depo.projeler()[0]!.id, 7);
    expect(r.markdown).toContain("12 bin token");
    expect(r.markdown).not.toMatch(/\$|ücret|harcama|bütçe/i);
  });
});
