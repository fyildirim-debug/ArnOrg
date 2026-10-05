// Kod zekâsının dil kuralları: hangi dosya dizinlenir, hangi dil ailesinin sembol kurallarıyla okunur.
import { dilBul } from "../dosyalar.js";

/** Sembol ve içe aktarma kuralları aileye göre seçilir; "metin" ailesi yalnız kayan pencereyle parçalanır, "html"
 * (sayfalar ve sunucu şablonları) sembolsüz parçalanır ama betik, stil, sayfa ve şablon başvuruları okunur */
export type DilAilesi = "ts" | "py" | "go" | "rs" | "java" | "kt" | "cs" | "php" | "rb" | "swift" | "c" | "sql" | "md" | "css" | "html" | "metin";

const AILELER: Record<string, DilAilesi> = {
  ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts", vue: "ts", svelte: "ts", astro: "ts",
  py: "py", pyi: "py",
  go: "go",
  rs: "rs",
  java: "java",
  kt: "kt", kts: "kt",
  cs: "cs",
  php: "php",
  rb: "rb", rake: "rb",
  swift: "swift",
  c: "c", h: "c", cc: "c", cpp: "c", cxx: "c", hpp: "c", hh: "c", hxx: "c", ino: "c",
  sql: "sql",
  md: "md", markdown: "md", mdx: "md",
  css: "css", scss: "css", sass: "css", less: "css",
  html: "html", htm: "html", xhtml: "html",
  ejs: "html", hbs: "html", handlebars: "html", mustache: "html", njk: "html", twig: "html", liquid: "html", jinja: "html", j2: "html",
};

/** Sembol çıkarılmadan, metin olarak parçalanan dosyalar */
const METIN_UZANTILARI = new Set([
  "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "cfg", "conf", "properties",
  "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd",
  "xml", "graphql", "gql", "proto", "txt", "rst", "adoc", "pug", "jade",
  "lua", "dart", "scala", "sc", "ex", "exs", "erl", "hrl", "hs", "ml", "mli", "r", "jl", "zig", "nim", "clj", "cljs", "sol", "tf", "hcl",
  "gradle", "cmake", "mk", "dockerfile", "prisma", "tex",
]);

/** Uzantısız ama okunacak dosyalar */
const OZEL_ADLAR: Record<string, DilAilesi> = {
  dockerfile: "metin",
  makefile: "metin",
  gnumakefile: "metin",
  "cmakelists.txt": "metin",
  gemfile: "rb",
  rakefile: "rb",
  procfile: "metin",
  jenkinsfile: "metin",
};

/** Dizinlenmeyen dosya adları: kilit dosyaları ve üretilmiş içerik */
const KILIT_DOSYALARI = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "deno.lock",
  "cargo.lock", "poetry.lock", "pipfile.lock", "uv.lock", "composer.lock", "gemfile.lock", "go.sum", "go.work.sum",
  "flake.lock", "mix.lock", "podfile.lock", "packages.lock.json", "pubspec.lock",
]);

/** Yolunda bu klasörlerden biri geçen dosya dizinlenmez (git'e eklenmiş olsa da) */
export const ATLANAN_KLASORLER = new Set([
  ".git", "node_modules", "dist", "build", ".arnorg", ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache", "coverage",
  "__pycache__", ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache", "target", "vendor", "bower_components", ".yarn",
  ".pnpm-store", "Pods", ".gradle", ".idea", ".vscode-test",
]);

/** En büyük dosya: 512 KB; JSON ve benzeri veri dosyalarında 128 KB */
export const EN_BUYUK_DOSYA = 512 * 1024;
const EN_BUYUK_VERI = 128 * 1024;
const VERI_UZANTILARI = new Set(["json", "jsonc", "json5", "yaml", "yml", "xml", "txt", "csv", "toml"]);

export interface DilBilgisi {
  /** Monaco dil kimliği (typescript, python…) */
  dil: string;
  aile: DilAilesi;
  /** Bu dosya için izin verilen en büyük boyut */
  sinir: number;
}

function uzantiAl(ad: string): string {
  const i = ad.lastIndexOf(".");
  return i > 0 ? ad.slice(i + 1) : "";
}

/** Yol dizinlenecek bir dosyaysa dil bilgisi; değilse null. Yol / ayraçlı ve köke göre olmalı. */
export function dilTani(yol: string): DilBilgisi | null {
  const parcalar = yol.split("/");
  for (let i = 0; i < parcalar.length - 1; i++) if (ATLANAN_KLASORLER.has(parcalar[i]!)) return null;
  const ad = parcalar[parcalar.length - 1]!;
  const kucuk = ad.toLowerCase();
  if (KILIT_DOSYALARI.has(kucuk)) return null;
  // Küçültülmüş ve üretilmiş dosyalar: x.min.js, x.min.css, kaynak haritaları
  if (/\.min\.[a-z0-9]+$/.test(kucuk) || kucuk.endsWith(".map") || kucuk.endsWith(".snap")) return null;
  const ozel = OZEL_ADLAR[kucuk];
  if (ozel) return { dil: dilBul(ad), aile: ozel, sinir: EN_BUYUK_DOSYA };
  const uzanti = uzantiAl(kucuk);
  if (!uzanti) return null;
  const aile = AILELER[uzanti] ?? (METIN_UZANTILARI.has(uzanti) ? "metin" : null);
  if (!aile) return null;
  return { dil: dilBul(ad), aile, sinir: VERI_UZANTILARI.has(uzanti) ? EN_BUYUK_VERI : EN_BUYUK_DOSYA };
}
