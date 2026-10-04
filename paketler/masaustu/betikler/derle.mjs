// Masaüstü kabuğunu esbuild ile dist/ altına derler.
//
// Çıktılar:
//   dist/ana.js              Electron ana süreci (ESM; Electron 44 ESM ana süreci destekler)
//   dist/cekirdek-giris.js   utilityProcess içinde çalışan çekirdek girişi (ESM)
//   dist/onyukleme.cjs       ana pencerenin ön yükleme betiği (CJS: sandbox'lı ön yükleme ESM olamaz)
//   dist/durum-onyukleme.cjs açılış/hata penceresinin ön yükleme betiği (CJS)
//   dist/tarayici-onyukleme.cjs uygulama içi tarayıcının sayfaya yüklenen betiği: öğe seçici (CJS)
//   dist/durum.js            açılış/hata sayfasının betiği (tarayıcı, IIFE)
//   dist/durum.html          açılış/hata sayfası
//
// Kullanım: node betikler/derle.mjs

import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(KOK, "dist");
const paket = JSON.parse(readFileSync(join(KOK, "package.json"), "utf8"));

// Çekirdeğin çalışma zamanı bağımlılıkları paketlenmez; çekirdek bunları uygulamanın node_modules'undan yükler.
const DISARIDA = ["electron", "electron-updater", ...Object.keys(paket.dependencies ?? {})];

const ortak = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  legalComments: "none",
  define: {
    __ARNORG_SURUMU__: JSON.stringify(paket.version),
  },
};

/** @type {import("esbuild").BuildOptions[]} */
const yapilandirmalar = [
  {
    ...ortak,
    entryPoints: { ana: join(KOK, "src/ana.ts"), "cekirdek-giris": join(KOK, "src/cekirdek-giris.ts") },
    outdir: DIST,
    platform: "node",
    format: "esm",
    target: "node22",
    external: DISARIDA,
  },
  {
    ...ortak,
    entryPoints: {
      onyukleme: join(KOK, "src/onyukleme.ts"),
      "durum-onyukleme": join(KOK, "src/durum-onyukleme.ts"),
      "tarayici-onyukleme": join(KOK, "src/arayuz/tarayici-onyukleme.ts"),
    },
    outdir: DIST,
    outExtension: { ".js": ".cjs" },
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
  },
  {
    ...ortak,
    entryPoints: { durum: join(KOK, "src/arayuz/durum.ts") },
    outdir: DIST,
    platform: "browser",
    format: "iife",
    target: "chrome140",
  },
];

function statikleriKopyala() {
  copyFileSync(join(KOK, "src/arayuz/durum.html"), join(DIST, "durum.html"));
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

await Promise.all(yapilandirmalar.map((y) => build(y)));
statikleriKopyala();
