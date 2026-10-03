// Abonelik muhasebesi: token sayımı, kullanım pencereleri, sınır ve ajan ortamı
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
    expect(toplamFarki({ usd: 1, token: 1000 }, { usd: 1.25, token: 1600 })).toEqual({ usd: 0.25, token: 600 });
    expect(toplamFarki({ usd: 1, token: 1000 }, { usd: 0.1, token: 200 })).toEqual({ usd: 0.1, token: 200 });
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
  it("abonelikte API anahtarı ve bulut sağlayıcı ajana geçmez", () => {
    expect(ajanOrtami("abonelik", { EK: "1" }, kaynak)).toEqual({ ANTHROPIC_BASE_URL: "https://ag", HOME: "/home/f", EK: "1" });
  });
  it("API girişinde anahtar korunur", () => {
    expect(ajanOrtami("api", {}, kaynak)).toMatchObject({ ANTHROPIC_API_KEY: "x" });
  });
});

describe("şirket: abonelik sınırı ve bütçe", () => {
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

  it("varsayılan giriş abonelik; dolar bütçesi dolsa da araç çağrısı reddedilmez", async () => {
    expect(sirket.abonelik).toBe(true);
    const p = depo.projeler()[0]!;
    const ceo = depo.ajanlar(p.id)[0]!;
    depo.ajanGuncelle(ceo.id, { gunlukButceUsd: 1 });
    depo.maliyetEkle(p.id, ceo.id, 5, 12_000);
    const sonuc = await sirket.kapi(ceo.id, "Read", { file_path: "README.md" });
    expect(sonuc).toEqual({});
    expect(depo.ajan(ceo.id)).toMatchObject({ bugunToken: 12_000, toplamToken: 12_000 });
    expect(sirket.maliyetOzeti(p.id)).toMatchObject({ girisYontemi: "abonelik", bugunToken: 12_000 });
  });

  it("API girişinde aynı durum bütçe reddi verir", async () => {
    const p = depo.projeler()[0]!;
    const ceo = depo.ajanlar(p.id)[0]!;
    sirket.yapilandirma.guncelle({ girisYontemi: "api" });
    const sonuc = await sirket.kapi(ceo.id, "Read", { file_path: "README.md" });
    expect(sonuc).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    sirket.yapilandirma.guncelle({ girisYontemi: "abonelik" });
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
    expect(r.markdown).toContain("ücret alınmadı");
    expect(r.markdown).not.toMatch(/Harcama: \$/);
  });
});
