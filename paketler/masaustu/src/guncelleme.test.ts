// Otomatik güncelleme durumu: electron-updater olayları → ana pencereye giden durum; 6 saatte bir yeniden denetim;
// "hazir" aynı sürümün yeniden denetiminde sönmez; kur() yalnız indirilmiş sürümle quitAndInstall çağırır.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuncellemeDurumu } from "./kopru.js";

const { guncelleyici, olayVer, dinleyicileriTemizle } = vi.hoisted(() => {
  const dinleyiciler = new Map<string, ((...a: unknown[]) => void)[]>();
  const guncelleyici = {
    logger: null as unknown,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on(olay: string, f: (...a: unknown[]) => void) {
      dinleyiciler.set(olay, [...(dinleyiciler.get(olay) ?? []), f]);
      return guncelleyici;
    },
    checkForUpdates: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
  };
  const olayVer = (olay: string, ...a: unknown[]) => (dinleyiciler.get(olay) ?? []).forEach((f) => f(...a));
  return { guncelleyici, olayVer, dinleyicileriTemizle: () => dinleyiciler.clear() };
});

vi.mock("electron", () => ({ app: { isPackaged: true, relaunch: vi.fn(), quit: vi.fn() } }));
vi.mock("electron-updater", () => ({ autoUpdater: guncelleyici }));

const { DENETIM_ARALIGI_MS, Guncelleme } = await import("./guncelleme.js");

describe("masaüstü otomatik güncelleme", () => {
  let gelenler: GuncellemeDurumu[];
  let g: InstanceType<typeof Guncelleme>;

  beforeEach(async () => {
    vi.useFakeTimers();
    dinleyicileriTemizle();
    guncelleyici.checkForUpdates.mockClear();
    guncelleyici.quitAndInstall.mockClear();
    gelenler = [];
    g = new Guncelleme({ kabuk: () => undefined } as never, (d) => gelenler.push(d));
    await g.baslat();
  });

  afterEach(() => {
    g.durdur();
    vi.useRealTimers();
  });

  it("açılışta bildirimsiz denetler (checkForUpdates), arka planda indirir, kapanışta kurar", () => {
    expect(guncelleyici.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(guncelleyici.autoDownload).toBe(true);
    expect(guncelleyici.autoInstallOnAppQuit).toBe(true);
  });

  it("olayları duruma çevirir: bulundu → iniyor (yüzde) → hazir", () => {
    olayVer("checking-for-update");
    olayVer("update-available", { version: "0.0.5" });
    olayVer("download-progress", { percent: 42.4 });
    olayVer("download-progress", { percent: 42.45 }); // aynı yüzde yeniden gönderilmez
    olayVer("update-downloaded", { version: "0.0.5" });
    expect(gelenler.map((d) => [d.asama, d.surum, d.yuzde])).toEqual([
      ["denetleniyor", null, null],
      ["iniyor", "0.0.5", 0],
      ["iniyor", "0.0.5", 42],
      ["hazir", "0.0.5", 100],
    ]);
    expect(g.durum).toEqual({ asama: "hazir", surum: "0.0.5", yuzde: 100, hata: null });
  });

  it("indirilmiş sürüm aynı sürümün yeniden denetiminde ve hatada sönmez; daha yeni sürüm gelince yeniden iner", () => {
    olayVer("update-downloaded", { version: "0.0.5" });
    const sayi = gelenler.length;
    olayVer("checking-for-update");
    olayVer("update-available", { version: "0.0.5" });
    olayVer("download-progress", { percent: 10 });
    olayVer("error", new Error("ağ yok"));
    olayVer("update-not-available", { version: "0.0.5" });
    expect(gelenler.length).toBe(sayi);
    expect(g.durum.asama).toBe("hazir");
    olayVer("update-available", { version: "0.0.6" });
    expect(g.durum).toMatchObject({ asama: "iniyor", surum: "0.0.6", yuzde: 0 });
  });

  it("hata durumu iletilir", () => {
    olayVer("error", new Error("imza doğrulanamadı"));
    expect(g.durum).toMatchObject({ asama: "hata", hata: "imza doğrulanamadı" });
  });

  it("uygulama açıkken 6 saatte bir yeniden denetler", async () => {
    await vi.advanceTimersByTimeAsync(DENETIM_ARALIGI_MS - 1000);
    expect(guncelleyici.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(guncelleyici.checkForUpdates).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(DENETIM_ARALIGI_MS);
    expect(guncelleyici.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it("kur() yalnız indirilmiş sürümle quitAndInstall çağırır", () => {
    expect(g.kur()).toBe(false);
    expect(guncelleyici.quitAndInstall).not.toHaveBeenCalled();
    olayVer("update-downloaded", { version: "0.0.5" });
    expect(g.kur()).toBe(true);
    expect(guncelleyici.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
