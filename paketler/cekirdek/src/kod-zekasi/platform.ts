// Platformlar arası yol ve metin yardımcıları. Dizindeki yollar her zaman köke göre ve / ayraçlıdır; Windows'tan
// gelen ters eğik çizgiler, sürücü harfli ya da Git Bash biçimli (/c/Users/...) mutlak yollar ve kökteki büyük/küçük
// harf farkı burada düzelir. Windows PowerShell'in > ve Out-File ile yazdığı UTF-16 dosyalar ikili sayılmaz.
import path from "node:path";

/** Ters eğik çizgiler / olur; baştaki ./ ve sondaki / atılır, yinelenen ayraçlar teklenir */
export function yolSadelestir(yol: string): string {
  return yol
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/(.)\/+$/, "$1");
}

/**
 * Mutlak ya da göreli yolu çalışma alanı köküne göre / ayraçlı yola çevirir. Kökün içindeki mutlak yol göreli olur
 * (Windows'ta sürücü harfi ve klasör adları harf duyarsız karşılaştırılır; Git Bash'in /c/... biçimi de tanınır);
 * baştaki / atılır. p yalnız testlerde verilir (path.win32 ya da path.posix).
 */
export function kokeGoreli(kok: string, yol: string, p: path.PlatformPath = path): string {
  let y = yol.trim();
  if (p.sep === "\\") {
    // Git Bash ve MSYS: /c/Users/ada/proje → C:\Users\ada\proje (yalnız köke düşüyorsa)
    const msys = /^\/([a-zA-Z])(?:\/(.*))?$/.exec(y);
    if (msys) {
      const surucu = `${msys[1]!.toUpperCase()}:\\${(msys[2] ?? "").replace(/\//g, "\\")}`;
      if (icindeMi(kok, surucu, p)) y = surucu;
    }
  }
  if (kok && p.isAbsolute(y) && icindeMi(kok, y, p)) y = p.relative(kok, y);
  return yolSadelestir(y).replace(/^\/+/, "");
}

function icindeMi(kok: string, yol: string, p: path.PlatformPath): boolean {
  const fark = p.relative(kok, yol);
  return !fark.startsWith("..") && !p.isAbsolute(fark);
}

/** Dosya içeriğini metne çevirir: UTF-8 (BOM'lu ya da BOM'suz), BOM'lu UTF-16 LE ve BE; ikili dosyada null */
export function metneCevir(tampon: Buffer): string | null {
  if (tampon.length >= 2 && tampon[0] === 0xff && tampon[1] === 0xfe) return tampon.subarray(2, 2 + ((tampon.length - 2) & ~1)).toString("utf16le");
  if (tampon.length >= 2 && tampon[0] === 0xfe && tampon[1] === 0xff) {
    const ters = Buffer.from(tampon.subarray(2, 2 + ((tampon.length - 2) & ~1)));
    return ters.swap16().toString("utf16le");
  }
  // İlk 8 KB'ta NUL baytı olan dosya ikili sayılır
  if (tampon.subarray(0, 8192).includes(0)) return null;
  const metin = tampon.toString("utf8");
  return metin.charCodeAt(0) === 0xfeff ? metin.slice(1) : metin;
}
