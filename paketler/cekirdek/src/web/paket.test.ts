// Paket bilgisi: npm, PyPI ve crates.io registry yanıtları (bilinen biçimlerden), ad doğrulama ve depo adresi
import { describe, expect, it } from "vitest";
import { yanitYap, type Getirici } from "./http.js";
import { depoAdresi, paketBilgisi, paketMetni } from "./paket.js";

function ag(yanitlar: Record<string, unknown>): { getir: Getirici; istenenler: string[] } {
  const istenenler: string[] = [];
  return {
    istenenler,
    getir: async (adres) => {
      istenenler.push(adres);
      const v = yanitlar[adres];
      return v === undefined ? yanitYap(404, JSON.stringify({ error: "Not found" }), { "content-type": "application/json" }, adres) : yanitYap(200, JSON.stringify(v), { "content-type": "application/json" }, adres);
    },
  };
}

describe("depo adresi", () => {
  it("git biçimleri https adresine çevrilir", () => {
    expect(depoAdresi("git+https://github.com/electron-userland/electron-builder.git")).toBe("https://github.com/electron-userland/electron-builder");
    expect(depoAdresi("git://github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(depoAdresi("git@github.com:a/b.git")).toBe("https://github.com/a/b");
    expect(depoAdresi("github:a/b")).toBe("https://github.com/a/b");
    expect(depoAdresi("https://gitlab.com/a/b#readme")).toBe("https://gitlab.com/a/b");
    expect(depoAdresi(null)).toBeNull();
  });
});

describe("paket bilgisi", () => {
  it("npm: son sürüm, lisans, haftalık indirme, depo ve son yayın", async () => {
    const { getir, istenenler } = ag({
      "https://registry.npmjs.org/electron-updater/latest": { name: "electron-updater", version: "6.8.9", license: "MIT", description: "Cross platform updater for electron applications", homepage: "https://github.com/electron-userland/electron-builder", repository: { type: "git", url: "git+https://github.com/electron-userland/electron-builder.git" } },
      "https://api.npmjs.org/downloads/point/last-week/electron-updater": { downloads: 4422781, package: "electron-updater" },
      "https://registry.npmjs.org/-/v1/search?text=electron-updater&size=5": { objects: [{ package: { name: "electron-updater-yaml", date: "2023-06-07T19:48:35.875Z" } }, { package: { name: "electron-updater", date: "2026-06-05T06:18:09.685Z" } }] },
    });
    const p = await paketBilgisi("electron-updater", "npm", getir);
    expect(istenenler).toHaveLength(3);
    expect(p).toMatchObject({
      surum: "6.8.9",
      lisans: "MIT",
      haftalikIndirme: 4422781,
      depo: "https://github.com/electron-userland/electron-builder",
      sonYayin: "2026-06-05T06:18:09.685Z",
      adres: "https://www.npmjs.com/package/electron-updater",
    });
    const m = paketMetni(p);
    expect(m).toContain("electron-updater (npm)");
    expect(m).toContain("Son sürüm: 6.8.9 · yayın 2026-06-05");
    expect(m).toContain("Haftalık indirme: 4.422.781");
    // Ana sayfa depoyla aynıysa tekrar yazılmaz
    expect(m).not.toContain("Ana sayfa:");
  });

  it("npm: kapsamlı ad kodlanır; olmayan paket anlaşılır hatadır", async () => {
    const { getir, istenenler } = ag({ "https://registry.npmjs.org/@scope%2Fad/latest": { version: "1.0.0", license: { type: "Apache-2.0" } } });
    const p = await paketBilgisi("@scope/ad", "npm", getir);
    expect(istenenler[0]).toBe("https://registry.npmjs.org/@scope%2Fad/latest");
    expect(p).toMatchObject({ surum: "1.0.0", lisans: "Apache-2.0", haftalikIndirme: null, sonYayin: null });
    await expect(paketBilgisi("olmayan-paket-xyz", "npm", getir)).rejects.toThrow('npm üzerinde "olmayan-paket-xyz" adında paket yok.');
    await expect(paketBilgisi("../etc", "npm", getir)).rejects.toThrow(/Geçersiz paket adı/);
  });

  it("PyPI: lisans sınıflandırıcıdan, depo proje adreslerinden, haftalık indirme pypistats'tan", async () => {
    const { getir } = ag({
      "https://pypi.org/pypi/requests/json": {
        info: {
          name: "requests",
          version: "2.32.5",
          summary: "Python HTTP for Humans.",
          license: "Apache-2.0 License\n\n Copyright 2019 Kenneth Reitz\n uzun lisans metni",
          classifiers: ["License :: OSI Approved :: Apache Software License", "Programming Language :: Python :: 3"],
          project_urls: { Documentation: "https://requests.readthedocs.io", Source: "https://github.com/psf/requests" },
          home_page: "https://requests.readthedocs.io",
        },
        urls: [{ upload_time_iso_8601: "2025-08-18T20:46:00.542304Z" }],
      },
      "https://pypistats.org/api/packages/requests/recent": { data: { last_day: 1, last_month: 2, last_week: 301219220 } },
    });
    const p = await paketBilgisi("requests", "pypi", getir);
    expect(p).toMatchObject({ ad: "requests", surum: "2.32.5", lisans: "Apache Software License", depo: "https://github.com/psf/requests", haftalikIndirme: 301219220, sonYayin: "2025-08-18T20:46:00.542304Z", adres: "https://pypi.org/project/requests/" });
  });

  it("crates.io: kararlı sürümün lisansı ve tarihi, son 90 günlük indirme", async () => {
    const { getir } = ag({
      "https://crates.io/api/v1/crates/serde": {
        crate: { name: "serde", description: "A generic serialization/deserialization framework", homepage: "https://serde.rs", repository: "https://github.com/serde-rs/serde", max_stable_version: "1.0.228", newest_version: "1.0.228", updated_at: "2025-09-27T16:51:35Z", recent_downloads: 112345678 },
        versions: [
          { num: "1.0.229-beta", license: "MIT OR Apache-2.0", created_at: "2025-10-01T00:00:00Z" },
          { num: "1.0.228", license: "MIT OR Apache-2.0", created_at: "2025-09-27T16:51:35Z" },
        ],
      },
    });
    const p = await paketBilgisi("serde", "crates", getir);
    expect(p).toMatchObject({ surum: "1.0.228", lisans: "MIT OR Apache-2.0", sonYayin: "2025-09-27T16:51:35Z", yakinIndirme: 112345678, depo: "https://github.com/serde-rs/serde" });
    expect(paketMetni(p)).toContain("Son 90 günde indirme: 112.345.678");
  });
});
