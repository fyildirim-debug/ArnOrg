// Çekirdeği esbuild ile paketler: dist/index.js (kitaplık), dist/cli.js (komut satırı) ve
// dist/gomme-calisani.js (kod zekâsının gömme iş parçacığı; worker_threads ile ayrı yüklenir).
// Skill kütüphanesi (skiller/) dist/skiller'e kopyalanır: masaüstü paketi dist'i olduğu gibi taşır, çekirdek onu
// kendi yanında bulur (src/skiller.ts)
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paket = JSON.parse(fs.readFileSync(path.join(kok, "package.json"), "utf8"));
// Çalışma zamanı bağımlılıkları paketlenmez; node_modules'tan yüklenir
const dislar = Object.keys(paket.dependencies ?? {});

fs.rmSync(path.join(kok, "dist"), { recursive: true, force: true });
await build({
  entryPoints: {
    index: path.join(kok, "src/index.ts"),
    cli: path.join(kok, "src/cli.ts"),
    "gomme-calisani": path.join(kok, "src/kod-zekasi/gomme-calisani.ts"),
  },
  outdir: path.join(kok, "dist"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  splitting: true,
  external: dislar.flatMap((d) => [d, `${d}/*`]),
  banner: { js: "import { createRequire as __arnorgRequire } from 'node:module'; const require = __arnorgRequire(import.meta.url);" },
  logLevel: "warning",
});
fs.chmodSync(path.join(kok, "dist/cli.js"), 0o755);
fs.cpSync(path.join(kok, "skiller"), path.join(kok, "dist", "skiller"), { recursive: true });
console.log("Çekirdek derlendi: dist/index.js, dist/cli.js, dist/gomme-calisani.js, dist/skiller/");
