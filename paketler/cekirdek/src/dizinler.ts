// Dizin gezgini: masaüstünde sistemin klasör seçicisi kullanılır; tarayıcıdan açılan Stüdyo bu uçla klasör seçer.
// Yalnız dizin adları döner, dosya içeriği okunmaz.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DizinListesi } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { ArnorgHatasi } from "./yardimci.js";

const LISTE_SINIRI = 500;

function dizinMi(yol: string): boolean {
  try {
    return fs.statSync(yol).isDirectory();
  } catch {
    return false;
  }
}

function repoMu(yol: string): boolean {
  return fs.existsSync(path.join(yol, ".git"));
}

/** Ev, masaüstü, belgeler, proje kökü; Windows'ta sürücüler, macOS'ta birimler */
export function kisayollar(projeKoku: string): DizinListesi["kisayollar"] {
  const ev = os.homedir();
  const liste: DizinListesi["kisayollar"] = [{ ad: iki("Ev", "Home"), yol: ev }];
  for (const [ad, alt] of [
    [iki("Masaüstü", "Desktop"), "Desktop"],
    [iki("Belgeler", "Documents"), "Documents"],
  ] as const) {
    const y = path.join(ev, alt);
    if (dizinMi(y)) liste.push({ ad, yol: y });
  }
  liste.push({ ad: iki("ArnOrg projeleri", "ArnOrg projects"), yol: projeKoku });
  if (process.platform === "win32") {
    for (const harf of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
      const kok = `${harf}:\\`;
      if (dizinMi(kok)) liste.push({ ad: `${harf}:`, yol: kok });
    }
  } else {
    liste.push({ ad: "/", yol: "/" });
    if (process.platform === "darwin" && dizinMi("/Volumes")) liste.push({ ad: iki("Birimler", "Volumes"), yol: "/Volumes" });
  }
  return liste;
}

/** Bir dizinin alt dizinleri; gizli dizinler (nokta ile başlayan) ve erişilemeyenler atlanır */
export function dizinListesi(istenen: string | undefined, projeKoku: string): DizinListesi {
  const yol = path.resolve(istenen?.trim() || os.homedir());
  if (!dizinMi(yol)) throw new ArnorgHatasi(iki("Klasör bulunamadı.", "Folder not found."), 404);
  let girdiler: fs.Dirent[] = [];
  try {
    girdiler = fs.readdirSync(yol, { withFileTypes: true });
  } catch {
    throw new ArnorgHatasi(iki("Bu klasör okunamıyor (izin yok).", "This folder cannot be read (permission denied)."), 403);
  }
  const dizinler = girdiler
    .filter((g) => !g.name.startsWith(".") && (g.isDirectory() || (g.isSymbolicLink() && dizinMi(path.join(yol, g.name)))))
    .filter((g) => !(process.platform === "win32" && /^(\$Recycle\.Bin|System Volume Information)$/i.test(g.name)))
    .map((g) => ({ ad: g.name, yol: path.join(yol, g.name) }))
    .sort((a, b) => a.ad.localeCompare(b.ad, undefined, { sensitivity: "base", numeric: true }))
    .slice(0, LISTE_SINIRI)
    .map((d) => ({ ...d, repo: repoMu(d.yol) }));
  const ust = path.dirname(yol);
  return { yol, ust: ust === yol ? null : ust, kisayollar: kisayollar(projeKoku), dizinler, repo: repoMu(yol) };
}

/** Gezginden yeni klasör */
export function dizinOlustur(ust: string, ad: string): string {
  const temiz = ad.trim();
  if (!temiz || temiz.length > 120 || /[\\/:*?"<>|\u0000-\u001f]/.test(temiz) || temiz === "." || temiz === "..") {
    throw new ArnorgHatasi(iki("Geçersiz klasör adı.", "Invalid folder name."));
  }
  const kok = path.resolve(ust);
  if (!dizinMi(kok)) throw new ArnorgHatasi(iki("Üst klasör bulunamadı.", "Parent folder not found."), 404);
  const yeni = path.join(kok, temiz);
  if (fs.existsSync(yeni)) throw new ArnorgHatasi(iki("Bu adda bir klasör zaten var.", "A folder with this name already exists."), 409);
  fs.mkdirSync(yeni);
  return yeni;
}
