// Kod editörü için dosya hizmetleri: ağaç, okuma, yazma, arama
import fs from "node:fs";
import path from "node:path";
import type { AramaSonucu, DosyaDugumu, DosyaIcerigi } from "@arnorg/ortak";
import { degisiklikler } from "./git.js";
import { ArnorgHatasi } from "./yardimci.js";

export const YOK_SAYILAN = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".next", ".nuxt", "dist", "build", "target", ".turbo", ".cache", "coverage", ".idea", ".DS_Store"]);
const AGAC_SINIRI = 8000;
const BUYUK_DOSYA = 2 * 1024 * 1024;

const DILLER: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json", md: "markdown", markdown: "markdown",
  css: "css", scss: "scss", less: "less", html: "html", htm: "html", vue: "html", svelte: "html",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cs: "csharp", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", ps1: "powershell", psm1: "powershell",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", env: "ini", sql: "sql",
  xml: "xml", svg: "xml", dockerfile: "dockerfile", graphql: "graphql", gql: "graphql", lua: "lua", dart: "dart",
};

export function dilBul(dosya: string): string {
  const ad = path.basename(dosya).toLowerCase();
  if (ad === "dockerfile") return "dockerfile";
  if (ad === "makefile") return "makefile";
  const uzanti = ad.includes(".") ? ad.split(".").pop()! : "";
  return DILLER[uzanti] ?? "plaintext";
}

/** Göreli yolu doğrular ve kökün içinde kalan mutlak yola çevirir */
export function guvenliYol(kok: string, goreli: string): string {
  const temiz = goreli.replace(/\\/g, "/").replace(/^\/+/, "");
  if (temiz.split("/").some((p) => p === "..")) throw new ArnorgHatasi("Geçersiz dosya yolu.");
  const tam = path.resolve(kok, temiz);
  const fark = path.relative(path.resolve(kok), tam);
  if (fark.startsWith("..") || path.isAbsolute(fark)) throw new ArnorgHatasi("Yol çalışma alanının dışında.");
  return tam;
}

export async function dosyaAgaci(kok: string): Promise<DosyaDugumu> {
  const durumlar = await degisiklikler(kok);
  let sayac = 0;
  const dolas = (dizin: string, goreli: string): DosyaDugumu[] => {
    let girdiler: fs.Dirent[];
    try {
      girdiler = fs.readdirSync(dizin, { withFileTypes: true });
    } catch {
      return [];
    }
    girdiler.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name, "tr") : a.isDirectory() ? -1 : 1));
    const sonuc: DosyaDugumu[] = [];
    for (const g of girdiler) {
      if (sayac > AGAC_SINIRI) break;
      if (YOK_SAYILAN.has(g.name)) continue;
      const y = goreli ? `${goreli}/${g.name}` : g.name;
      sayac++;
      if (g.isDirectory()) {
        sonuc.push({ ad: g.name, yol: y, tur: "klasor", cocuklar: dolas(path.join(dizin, g.name), y) });
      } else if (g.isFile() || g.isSymbolicLink()) {
        const d = durumlar.get(y);
        sonuc.push({ ad: g.name, yol: y, tur: "dosya", ...(d ? { degisiklik: d } : {}) });
      }
    }
    return sonuc;
  };
  return { ad: path.basename(kok), yol: "", tur: "klasor", cocuklar: dolas(kok, "") };
}

function ikiliMi(tampon: Buffer): boolean {
  const ornek = tampon.subarray(0, 8000);
  return ornek.includes(0);
}

export function dosyaOku(kok: string, goreli: string, duzenleyen: string | null): DosyaIcerigi {
  const tam = guvenliYol(kok, goreli);
  let bilgi: fs.Stats;
  try {
    bilgi = fs.statSync(tam);
  } catch {
    throw new ArnorgHatasi("Dosya bulunamadı.", 404);
  }
  if (!bilgi.isFile()) throw new ArnorgHatasi("Bu bir dosya değil.");
  if (bilgi.size > BUYUK_DOSYA) throw new ArnorgHatasi("Dosya 2 MB'tan büyük; editörde açılamaz.", 413);
  const tampon = fs.readFileSync(tam);
  if (ikiliMi(tampon)) throw new ArnorgHatasi("İkili dosya editörde açılamaz.", 415);
  return { yol: goreli, icerik: tampon.toString("utf8"), dil: dilBul(tam), saltOkunur: Boolean(duzenleyen), duzenleyenAjanId: duzenleyen };
}

export function dosyaYaz(kok: string, goreli: string, icerik: string): string {
  const tam = guvenliYol(kok, goreli);
  if (Buffer.byteLength(icerik, "utf8") > BUYUK_DOSYA) throw new ArnorgHatasi("İçerik 2 MB'tan büyük.", 413);
  // Var olan dosyanın satır sonu biçimi korunur
  let yazilacak = icerik;
  try {
    const eski = fs.readFileSync(tam, "utf8");
    if (eski.includes("\r\n") && !icerik.includes("\r\n")) yazilacak = icerik.replace(/\n/g, "\r\n");
  } catch {
    fs.mkdirSync(path.dirname(tam), { recursive: true });
  }
  fs.writeFileSync(tam, yazilacak, "utf8");
  return tam;
}

/** Proje içinde metin araması (büyük/küçük harf duyarsız, düz metin) */
export function ara(kok: string, sorgu: string, sinir = 500): AramaSonucu[] {
  const q = sorgu.trim();
  if (q.length < 2) throw new ArnorgHatasi("Arama en az 2 karakter olmalı.");
  const kucuk = q.toLocaleLowerCase("tr");
  const sonuc: AramaSonucu[] = [];
  const dolas = (dizin: string, goreli: string) => {
    if (sonuc.length >= sinir) return;
    let girdiler: fs.Dirent[];
    try {
      girdiler = fs.readdirSync(dizin, { withFileTypes: true });
    } catch {
      return;
    }
    for (const g of girdiler) {
      if (sonuc.length >= sinir) return;
      if (YOK_SAYILAN.has(g.name)) continue;
      const tam = path.join(dizin, g.name);
      const y = goreli ? `${goreli}/${g.name}` : g.name;
      if (g.isDirectory()) dolas(tam, y);
      else if (g.isFile()) {
        let tampon: Buffer;
        try {
          if (fs.statSync(tam).size > 1024 * 1024) continue;
          tampon = fs.readFileSync(tam);
        } catch {
          continue;
        }
        if (ikiliMi(tampon)) continue;
        const satirlar = tampon.toString("utf8").split("\n");
        for (let i = 0; i < satirlar.length && sonuc.length < sinir; i++) {
          if (satirlar[i]!.toLocaleLowerCase("tr").includes(kucuk)) sonuc.push({ yol: y, satir: i + 1, metin: satirlar[i]!.trim().slice(0, 300) });
        }
      }
    }
  };
  dolas(kok, "");
  return sonuc;
}
