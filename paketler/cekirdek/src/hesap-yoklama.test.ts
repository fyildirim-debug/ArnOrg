// Abonelik kullanımı yalnız gerektiğinde okunur (0.0.4): Stüdyo bağlıyken, ajan oturumu ya da sınırda bekleyen ajan
// varken, aşılan sınırın sıfırlanma anı geçince. Kimse yokken Claude Code süreci açılmaz. Gerektiğinde yarım dakikada
// bir okunur (0.0.9); okuma üst üste başarısız olursa aralık 1, 2 ve 5 dakikaya açılır.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { Depo } from "./depo.js";
import { HesapIzleyici, KULLANIM_ARALIGI_MS, type KullanimKaynagi } from "./hesap.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-hesap-yoklama-"));
});

afterAll(() => {
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("hesap izleyicisi: dönemsel okuma yalnız gerektiğinde", () => {
  let okuma: number;
  let istemci: number;
  let ajanBekliyor: boolean;
  /** Claude Code'un döndüreceği 5 saatlik pencere */
  let pencere: { utilization: number; resets_at: string | null };
  let izleyici: HesapIzleyici;
  let sinirOlaylari: unknown[];

  const kaynak: KullanimKaynagi = async () => {
    okuma++;
    return {
      hesap: { email: "kurul@ornek.com", subscriptionType: "max" } as never,
      kullanim: { rate_limits_available: true, subscription_type: "max", rate_limits: { five_hour: { ...pencere }, seven_day: null } } as never,
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    okuma = 0;
    istemci = 0;
    ajanBekliyor = false;
    sinirOlaylari = [];
    pencere = { utilization: 20, resets_at: new Date(Date.now() + 3 * 3_600_000).toISOString() };
    const yap = new Yapilandirma(fs.mkdtempSync(path.join(gecici, "veri-")));
    // yoklamaKapali: gerçek Claude Code açılmaz; okuma yalnız sahte kaynaktan
    izleyici = new HesapIzleyici(yap, new OlayYolu(), () => null, kaynak, true, () => ajanBekliyor);
    izleyici.istemciVar = () => istemci > 0;
    izleyici.sinirDegisti = (s) => sinirOlaylari.push(s);
  });

  afterEach(() => {
    izleyici.durdur();
    vi.useRealTimers();
  });

  it("Stüdyo bağlı değilken ve ajan beklemiyorken hiç okumaz", async () => {
    izleyici.istemciBaglandi(); // başlatılmadan önce bağlanma bir şey yapmaz
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(2 * 3_600_000);
    expect(okuma).toBe(0);
    expect(izleyici.yoklamaGerekli()).toBe(false);
  });

  it("Stüdyo bağlanınca bayatsa hemen okur; bağlıyken yarım dakikada bir okur; ayrılınca durur", async () => {
    expect(KULLANIM_ARALIGI_MS).toBe(30_000);
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(okuma).toBe(0);

    istemci = 1;
    izleyici.istemciBaglandi();
    await vi.advanceTimersByTimeAsync(0);
    expect(okuma).toBe(1);
    // Döngü yarım dakikada bir bakar; okuma birkaç saniye sürse de hiçbir bakış atlanmaz
    await vi.advanceTimersByTimeAsync(29_000);
    expect(okuma).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(okuma).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(okuma).toBe(3);
    // Okunan yüzde Stüdyo'ya hemen gider
    pencere = { ...pencere, utilization: 47 };
    await vi.advanceTimersByTimeAsync(30_000);
    expect(okuma).toBe(4);
    expect(izleyici.mevcut.pencereler[0]).toMatchObject({ tur: "bes_saat", yuzde: 47 });

    istemci = 0;
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(okuma).toBe(4);
  });

  it("taze okumadan hemen sonra bağlanan ikinci Stüdyo yeniden okutmaz", async () => {
    izleyici.baslat();
    istemci = 1;
    izleyici.istemciBaglandi();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(okuma).toBe(1);
    istemci = 2;
    izleyici.istemciBaglandi();
    await vi.advanceTimersByTimeAsync(0);
    expect(okuma).toBe(1);
  });

  it("açık ajan oturumu ya da sınırda bekleyen ajan varken Stüdyo olmadan da okur", async () => {
    ajanBekliyor = true;
    izleyici.baslat();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(okuma).toBe(1);
    // Döngü yarım dakikada bir bakar ve her bakışta yeniden okur
    await vi.advanceTimersByTimeAsync(30_000);
    expect(okuma).toBe(2);
    ajanBekliyor = false;
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(okuma).toBe(2);
  });

  it("sınır aşıkken kimse beklemiyorsa sıfırlanma anına kadar okumaz; o an geçince okur ve sınır kalkar", async () => {
    pencere = { utilization: 95, resets_at: new Date(Date.now() + 3_600_000).toISOString() };
    izleyici.baslat();
    istemci = 1;
    izleyici.istemciBaglandi();
    await vi.advanceTimersByTimeAsync(0);
    expect(izleyici.sinir).toMatchObject({ yuzde: 95, sinirYuzde: 90 });
    istemci = 0;

    await vi.advanceTimersByTimeAsync(50 * 60_000);
    expect(okuma).toBe(1);

    pencere = { utilization: 3, resets_at: new Date(Date.now() + 5 * 3_600_000).toISOString() };
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect(okuma).toBe(2);
    expect(izleyici.sinir).toBeNull();
    expect(sinirOlaylari.at(-1)).toBeNull();
    // Sınır kalktı, kimse yok: yine durur
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(okuma).toBe(2);
  });

  it("okuma üst üste başarısız olunca 1, 2 ve 5 dakikada bir dener; başarılı okumada yeniden yarım dakika", async () => {
    /** Açık ajan oturumu yok; yoklama oturumu sahte: hata ver dendikçe Claude Code yanıt vermiyor gibi */
    class DenemeIzleyici extends HesapIzleyici {
      hataVer = true;
      deneme = 0;
      protected override async yokla() {
        this.deneme++;
        if (this.hataVer) throw new Error("Claude Code yanıt vermedi (60 sn).");
        return {
          hesap: { email: "kurul@ornek.com", subscriptionType: "max" } as never,
          kullanim: { rate_limits_available: true, subscription_type: "max", rate_limits: { five_hour: { utilization: 12, resets_at: null }, seven_day: null } } as never,
        };
      }
    }
    const d = new DenemeIzleyici(new Yapilandirma(fs.mkdtempSync(path.join(gecici, "veri-"))), new OlayYolu(), () => null, async () => null, false);
    d.istemciVar = () => true;
    try {
      d.baslat();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(d.deneme).toBe(1);
      expect(d.mevcut).toMatchObject({ durum: "hata", hata: expect.stringMatching(/yanıt vermedi/) });
      // İlk hatadan sonra 1 dk beklenir (döngü yarım dakikada bir bakar)
      await vi.advanceTimersByTimeAsync(59_000);
      expect(d.deneme).toBe(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(d.deneme).toBe(2);
      // İkinciden sonra 2 dk
      await vi.advanceTimersByTimeAsync(90_000);
      expect(d.deneme).toBe(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(d.deneme).toBe(3);
      // Üçüncüden sonra 5 dk (en çok)
      await vi.advanceTimersByTimeAsync(270_000);
      expect(d.deneme).toBe(3);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(d.deneme).toBe(4);
      // Claude Code yeniden yanıt verir: sonraki denemede okunur, aralık yeniden yarım dakika
      d.hataVer = false;
      await vi.advanceTimersByTimeAsync(300_000);
      expect(d.deneme).toBe(5);
      expect(d.mevcut).toMatchObject({ durum: "hazir", hata: null });
      expect(d.mevcut.pencereler[0]).toMatchObject({ yuzde: 12 });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(d.deneme).toBe(6);
    } finally {
      d.durdur();
    }
  });
});

describe("sunucu: bağlı Stüdyo sayısı hesap izleyicisine yüklem olarak verilir", () => {
  const ANAHTAR = "hesap-yoklama-anahtari-0123456789";
  let depo: Depo;
  let sirket: Sirket;
  let app: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    const veri = path.join(gecici, "sunucu-veri");
    const yap = new Yapilandirma(veri);
    depo = new Depo(path.join(veri, "arnorg.db"));
    sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: ANAHTAR, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = (app.server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await app.close();
    sirket.kapat();
    depo.kapat();
  });

  /** /ws'e bağlanır, ilk "merhaba" mesajını bekler */
  async function baglan(): Promise<WebSocket> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?anahtar=${ANAHTAR}`);
    await new Promise<void>((coz, red) => {
      ws.addEventListener("message", () => coz(), { once: true });
      ws.addEventListener("error", () => red(new Error("WebSocket bağlanamadı")), { once: true });
    });
    return ws;
  }

  const bekle = async (kosul: () => boolean) => {
    for (let i = 0; i < 100 && !kosul(); i++) await new Promise((r) => setTimeout(r, 20));
    return kosul();
  };

  it("WebSocket istemcisi bağlanınca yüklem doğru olur, hepsi ayrılınca yanlış; her bağlanışta istemciBaglandi çağrılır", async () => {
    const baglanma = vi.spyOn(sirket.hesap, "istemciBaglandi");
    expect(sirket.hesap.istemciVar()).toBe(false);
    const ilk = await baglan();
    const ikinci = await baglan();
    expect(sirket.hesap.istemciVar()).toBe(true);
    expect(baglanma).toHaveBeenCalledTimes(2);
    ilk.close();
    expect(await bekle(() => ilk.readyState === WebSocket.CLOSED)).toBe(true);
    expect(sirket.hesap.istemciVar()).toBe(true);
    ikinci.close();
    expect(await bekle(() => !sirket.hesap.istemciVar())).toBe(true);
  });
});
