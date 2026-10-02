// electron-builder beforePack kancası: paketlemeden önce eksikleri açık bir Türkçe hatayla durdurur.
//
// - Çekirdek (paketler/cekirdek/dist/index.js) ve Stüdyo (paketler/studyo/dist/index.html) derlenmiş mi?
// - Hedef platform ve mimari için yerel paketler kurulu mu? npm yalnız çalışılan makinenin
//   platform/mimari paketlerini kurar (@lydell/node-pty-<p>-<a>, @anthropic-ai/claude-agent-sdk-<p>-<a>).
//   Bu yüzden her mimari kendi makinesinde (CI'da o mimarinin koşucusunda) paketlenmelidir.

const { existsSync } = require("node:fs");
const { dirname, join } = require("node:path");

const MIMARILER = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" };

/** Paketi Node'un yaptığı gibi üst dizinlerdeki node_modules'ta arar ("exports" alanına takılmadan). */
function paketDizini(ad, kok) {
  for (let dizin = kok; ; dizin = dirname(dizin)) {
    const aday = join(dizin, "node_modules", ad);
    if (existsSync(join(aday, "package.json"))) return aday;
    if (dirname(dizin) === dizin) return null;
  }
}

exports.default = async function paketOncesi(baglam) {
  const kok = baglam.packager.projectDir;
  const platform = baglam.electronPlatformName;
  const mimari = MIMARILER[baglam.arch] ?? String(baglam.arch);
  const eksikler = [];

  const cekirdek = join(kok, "..", "cekirdek", "dist", "index.js");
  if (!existsSync(cekirdek)) eksikler.push(`Çekirdek derlemesi yok: ${cekirdek} (kökte "npm run build" çalıştırın)`);
  const studyo = join(kok, "..", "studyo", "dist", "index.html");
  if (!existsSync(studyo)) eksikler.push(`Stüdyo derlemesi yok: ${studyo} (kökte "npm run build" çalıştırın)`);

  for (const ad of [`@lydell/node-pty-${platform}-${mimari}`, `@anthropic-ai/claude-agent-sdk-${platform}-${mimari}`]) {
    if (!paketDizini(ad, kok)) {
      eksikler.push(`${ad} kurulu değil: ${platform}-${mimari} paketi bu mimarinin kendi makinesinde hazırlanmalı`);
    }
  }
  const sqlite = paketDizini("better-sqlite3", kok);
  if (!sqlite || !existsSync(join(sqlite, "prebuilds", `${platform}-${mimari}.node`))) {
    eksikler.push(`better-sqlite3 için ${platform}-${mimari} hazır derlemesi bulunamadı`);
  }

  if (eksikler.length > 0) {
    throw new Error(`Paketleme durduruldu (${platform}-${mimari}):\n  - ${eksikler.join("\n  - ")}`);
  }
  console.log(`  • paket öncesi denetim tamam (${platform}-${mimari})`);
};
