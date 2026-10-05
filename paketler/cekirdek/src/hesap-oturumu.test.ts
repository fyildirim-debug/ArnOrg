// Kullanımın yoklama oturumu (0.0.9): açık ajan oturumu yokken kullanım, mesaj göndermeyen bir Claude Code oturumundan
// okunur. Oturum okumalar arasında açık kalır (yarım dakikalık okumalar tek süreçle yapılır); iki dakika kullanılmazsa,
// okuma hata verince ya da Claude girişi değişince kapanır. Claude Code burada sahtedir: süreç açılmaz.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HesapIzleyici, YOKLAMA_OTURUMU_BOSTA_MS } from "./hesap.js";
import { OlayYolu } from "./olaylar.js";
import { Yapilandirma } from "./yapilandirma.js";

const sahte = vi.hoisted(() => ({
  /** Açılan her sahte oturum: kaç okuma yaptı, kapandı mı */
  oturumlar: [] as { okuma: number; kapandi: boolean; yol: string | undefined }[],
  /** Sıradaki okuma hata versin */
  hataVer: false,
  /** Okunacak 5 saatlik yüzde */
  yuzde: 30,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ options }: { options: { pathToClaudeCodeExecutable?: string } }) => {
    const o = { okuma: 0, kapandi: false, yol: options.pathToClaudeCodeExecutable };
    sahte.oturumlar.push(o);
    return {
      accountInfo: async () => ({ email: "kurul@ornek.com", subscriptionType: "max" }),
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => {
        if (o.kapandi) throw new Error("Oturum kapandı");
        if (sahte.hataVer) throw new Error("Claude Code yanıt vermedi");
        o.okuma++;
        return { rate_limits_available: true, subscription_type: "max", rate_limits: { five_hour: { utilization: sahte.yuzde, resets_at: null }, seven_day: null } };
      },
      close: () => {
        o.kapandi = true;
      },
    };
  },
}));

let gecici: string;

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-hesap-oturumu-"));
});

afterAll(() => {
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("kullanımın yoklama oturumu", () => {
  let izleyici: HesapIzleyici;
  let istemci: boolean;
  let claudeYolu: string | null;

  beforeEach(() => {
    vi.useFakeTimers();
    sahte.oturumlar.length = 0;
    sahte.hataVer = false;
    sahte.yuzde = 30;
    istemci = true;
    claudeYolu = "/usr/local/bin/claude";
    // Açık ajan oturumu yok: her okuma yoklama oturumundan
    izleyici = new HesapIzleyici(new Yapilandirma(fs.mkdtempSync(path.join(gecici, "veri-"))), new OlayYolu(), () => claudeYolu, async () => null, false);
    izleyici.istemciVar = () => istemci;
  });

  afterEach(() => {
    izleyici.durdur();
    vi.useRealTimers();
  });

  it("okumalar arasında açık kalır: yarım dakikalık okumalar tek Claude Code süreciyle yapılır", async () => {
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sahte.oturumlar).toHaveLength(1);
    expect(izleyici.mevcut.pencereler[0]).toMatchObject({ yuzde: 30 });

    sahte.yuzde = 31;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sahte.oturumlar).toHaveLength(1);
    expect(sahte.oturumlar[0]).toMatchObject({ okuma: 11, kapandi: false, yol: "/usr/local/bin/claude" });
    expect(izleyici.mevcut.pencereler[0]).toMatchObject({ yuzde: 31 });
  });

  it("Stüdyo ayrılınca iki dakika sonra kapanır; Stüdyo yeniden bağlanınca yenisi açılır", async () => {
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(2_000);
    istemci = false;
    await vi.advanceTimersByTimeAsync(YOKLAMA_OTURUMU_BOSTA_MS - 30_000);
    expect(sahte.oturumlar[0]!.kapandi).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sahte.oturumlar[0]!.kapandi).toBe(true);

    istemci = true;
    izleyici.istemciBaglandi();
    await vi.advanceTimersByTimeAsync(0);
    expect(sahte.oturumlar).toHaveLength(2);
    expect(sahte.oturumlar[1]).toMatchObject({ okuma: 1, kapandi: false });
  });

  it("okuma hata verince oturum kapanır; sonraki okuma yeni oturumla yapılır", async () => {
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(2_000);
    sahte.hataVer = true;
    await vi.advanceTimersByTimeAsync(30_000);
    // İkinci okuma hata verdi: oturum kapandı, yenisi henüz açılmadı
    expect(sahte.oturumlar).toHaveLength(1);
    expect(sahte.oturumlar[0]!.kapandi).toBe(true);
    expect(izleyici.mevcut.durum).toBe("hata");

    // Hatadan bir dakika sonra yeni oturumla okunur
    sahte.hataVer = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(izleyici.mevcut.durum).toBe("hazir");
    expect(sahte.oturumlar).toHaveLength(2);
    expect(sahte.oturumlar[1]).toMatchObject({ okuma: 1, kapandi: false });
  });

  it("Claude girişi değişince eski oturum kapanır, yeni oturumla hemen okunur; Claude Code'un yolu değişince de yenisi açılır", async () => {
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sahte.oturumlar).toHaveLength(1);

    izleyici.girisDegisti();
    await vi.advanceTimersByTimeAsync(0);
    expect(sahte.oturumlar[0]!.kapandi).toBe(true);
    expect(sahte.oturumlar).toHaveLength(2);
    expect(sahte.oturumlar[1]).toMatchObject({ okuma: 1, kapandi: false });

    claudeYolu = "/opt/claude/bin/claude";
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sahte.oturumlar[1]!.kapandi).toBe(true);
    expect(sahte.oturumlar[2]).toMatchObject({ okuma: 1, kapandi: false, yol: "/opt/claude/bin/claude" });
  });

  it("durdurulunca oturum kapanır", async () => {
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(2_000);
    izleyici.durdur();
    expect(sahte.oturumlar[0]!.kapandi).toBe(true);
  });
});
