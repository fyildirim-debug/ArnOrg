// Kurulum ve proje açma yardımcıları: masaüstü köprüsü, klasör adı ve yol işleri, işlem çıktısından ilerleme okuma
import type { KurulumIslemi, MasaustuKoprusu } from "@arnorg/ortak";

/** Masaüstü uygulamasının köprüsü (window.arnorg); tarayıcıda yoktur */
export function masaustu(): MasaustuKoprusu | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { arnorg?: MasaustuKoprusu }).arnorg;
}

/** Adresi masaüstünde sistem tarayıcısında, tarayıcıda yeni sekmede açar */
export function disaridaAc(url: string): void {
  const k = masaustu();
  const sekmede = () => void window.open(url, "_blank", "noopener,noreferrer");
  if (k?.disaridaAc) {
    k.disaridaAc(url).then(
      (acildi) => {
        if (!acildi) sekmede();
      },
      () => sekmede(),
    );
    return;
  }
  sekmede();
}

const TURKCE_HARFLER: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };

/** Çekirdekle aynı kural: proje adından klasör adı (harf, rakam, tire, alt çizgi, nokta; küçük harf) */
export function klasorAdiYap(ad: string): string {
  const sade = ad
    .trim()
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (h) => TURKCE_HARFLER[h] ?? h)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100);
  return (sade || "arnorg-projesi").toLowerCase();
}

/** Yolun ayracı: Windows yollarında ters bölü */
export function yolAyraci(yol: string): "/" | "\\" {
  if (/^[a-zA-Z]:[\\/]?/.test(yol) || yol.startsWith("\\\\")) return "\\";
  return yol.includes("\\") && !yol.includes("/") ? "\\" : "/";
}

export function yolBirlestir(ust: string, ad: string): string {
  const a = yolAyraci(ust);
  return ust.endsWith("/") || ust.endsWith("\\") ? `${ust}${ad}` : `${ust}${a}${ad}`;
}

/** Yolun son parçası (iki ayraçla da) */
export function yolAdi(yol: string): string {
  const parcalar = yol.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parcalar[parcalar.length - 1] || yol;
}

export function mutlakMi(yol: string): boolean {
  return yol.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(yol) || yol.startsWith("\\\\");
}

/** Gezginin konum çubuğu: kökten bu klasöre kadar her parça */
export function yolParcalari(yol: string): { ad: string; yol: string }[] {
  const a = yolAyraci(yol);
  if (a === "/") {
    const parcalar = yol.split("/").filter(Boolean);
    const sonuc = [{ ad: "/", yol: "/" }];
    let birikim = "";
    for (const p of parcalar) {
      birikim += `/${p}`;
      sonuc.push({ ad: p, yol: birikim });
    }
    return sonuc;
  }
  // Windows: "C:" sürücüsü ya da "\\sunucu\paylasim" kökü
  const unc = yol.startsWith("\\\\");
  const parcalar = yol.split(/[\\/]/).filter(Boolean);
  if (!parcalar.length) return [{ ad: yol, yol }];
  const kokParcalari = parcalar.slice(0, unc ? 2 : 1);
  const kokAdi = unc ? `\\\\${kokParcalari.join("\\")}` : kokParcalari.join("");
  const kok = `${kokAdi}\\`;
  const sonuc = [{ ad: kokAdi, yol: kok }];
  let birikim = kok;
  for (const p of parcalar.slice(kokParcalari.length)) {
    birikim = birikim.endsWith("\\") ? `${birikim}${p}` : `${birikim}\\${p}`;
    sonuc.push({ ad: p, yol: birikim });
  }
  return sonuc;
}

/** git check-ref-format'ın sade karşılığı: yaygın geçersiz dal adlarını yakalar */
export function dalAdiGecerliMi(ad: string): boolean {
  const d = ad.trim();
  if (!d || d.length > 200 || d === "@" || d === "HEAD") return false;
  if (/[\s~^:?*[\\\u0000-\u001f\u007f]/.test(d)) return false;
  if (d.includes("..") || d.includes("@{") || d.includes("//")) return false;
  if (d.startsWith("/") || d.endsWith("/") || d.startsWith("-") || d.endsWith(".") || d.endsWith(".lock")) return false;
  return !d.split("/").some((p) => p.startsWith("."));
}

export function epostaGecerliMi(eposta: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(eposta.trim());
}

export type IlerlemeAsamasi = "indirme" | "alma" | "cozme";

export interface IslemIlerlemesi {
  asama: IlerlemeAsamasi;
  /** 0–1; toplam bilinmiyorsa null */
  oran: number | null;
  /** Aşamanın kendi yüzdesi ya da "9.4 / 14.6 MB" gibi ölçü */
  olcu: string;
}

/** Uzun işlemlerin çıktısından ilerleme: gh indirmesinde MB, klonlamada git'in yüzdeleri */
export function ilerlemeOku(islem: Pick<KurulumIslemi, "tur" | "cikti" | "durum">): IslemIlerlemesi | null {
  const c = islem.cikti;
  if (islem.tur === "gh_kur") {
    const toplamli = [...c.matchAll(/([\d.]+) \/ ([\d.]+) MB/g)].pop();
    if (toplamli) {
      const alinan = Number(toplamli[1]);
      const toplam = Number(toplamli[2]);
      return { asama: "indirme", oran: toplam > 0 ? Math.min(1, alinan / toplam) : null, olcu: `${toplamli[1]} / ${toplamli[2]} MB` };
    }
    const tek = [...c.matchAll(/(?:^|\n)([\d.]+) MB\n/g)].pop();
    if (tek) return { asama: "indirme", oran: null, olcu: `${tek[1]} MB` };
    return null;
  }
  if (islem.tur === "klonla") {
    const son = [...c.matchAll(/(Receiving objects|Resolving deltas):\s+(\d+)%/g)].pop();
    if (!son) return null;
    const yuzde = Math.min(100, Number(son[2]));
    const cozme = son[1] === "Resolving deltas";
    // Nesneleri almak işin çoğu; değişiklikleri çözümlemek son onda bir
    return { asama: cozme ? "cozme" : "alma", oran: cozme ? 0.9 + yuzde / 1000 : (yuzde / 100) * 0.9, olcu: `${yuzde}%` };
  }
  return null;
}

/** Çıktının boş olmayan son satırı */
export function sonSatir(cikti: string): string {
  const satirlar = cikti.split("\n").map((s) => s.trim()).filter(Boolean);
  return satirlar[satirlar.length - 1] ?? "";
}
