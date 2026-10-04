// Depo haritası ve modül grafiği: klasör ağacı (dil, satır, öne çıkan semboller), içe aktarma grafiği ve
// ajanlar için karakter sınırlı metin haritası (aider repo map gibi: önemli dosyalar ve sembolleri önce).
import path from "node:path";
import type { KodGrafigi, KodGrafikDugumu, KodHaritaDugumu } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { sembolTuruAdi } from "./bicim.js";
import type { DosyaKaydi, IceAktarmaKaydi, SembolKaydi } from "./depo.js";

const posix = path.posix;

/** Dosya başına öne çıkan semboller: dışa açık, üst düzey ve büyük olanlar önce */
export function oneCikanlar(semboller: SembolKaydi[], sinir: number): SembolKaydi[] {
  return [...semboller]
    .filter((s) => s.tur !== "secici" || semboller.length < 8)
    .sort((a, b) => Number(b.disaAcik) - Number(a.disaAcik) || Number(!b.ust) - Number(!a.ust) || b.bit - b.bas - (a.bit - a.bas) || a.bas - b.bas)
    .slice(0, sinir);
}

function gruplaYola<T extends { yol: string }>(liste: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of liste) {
    const l = m.get(x.yol);
    if (l) l.push(x);
    else m.set(x.yol, [x]);
  }
  return m;
}

/** Klasör ağacı; yol verilirse o klasörün (ya da dosyanın) alt ağacı */
export function haritaAgaci(dosyalar: DosyaKaydi[], semboller: SembolKaydi[], iceAktarmalar: IceAktarmaKaydi[], kokYol = ""): KodHaritaDugumu {
  const kok = kokYol.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const sembolle = gruplaYola(semboller);
  const iceAktaran = new Map<string, Set<string>>();
  for (const i of iceAktarmalar) {
    if (!i.hedef || i.hedef === i.yol) continue;
    const s = iceAktaran.get(i.hedef) ?? new Set<string>();
    s.add(i.yol);
    iceAktaran.set(i.hedef, s);
  }
  const kokDugum: KodHaritaDugumu = { ad: kok ? posix.basename(kok) : "", yol: kok, tur: "klasor", satir: 0, dosyaSayisi: 0, cocuklar: [] };
  const klasorler = new Map<string, KodHaritaDugumu>([[kok, kokDugum]]);
  const klasor = (y: string): KodHaritaDugumu => {
    const var_ = klasorler.get(y);
    if (var_) return var_;
    const ust = klasor(y.includes("/") && posix.dirname(y) !== "." ? posix.dirname(y) : "");
    const d: KodHaritaDugumu = { ad: posix.basename(y), yol: y, tur: "klasor", satir: 0, dosyaSayisi: 0, cocuklar: [] };
    ust.cocuklar!.push(d);
    klasorler.set(y, d);
    return d;
  };
  for (const f of dosyalar) {
    if (kok && f.yol !== kok && !f.yol.startsWith(`${kok}/`)) continue;
    const dugum: KodHaritaDugumu = {
      ad: posix.basename(f.yol),
      yol: f.yol,
      tur: "dosya",
      dil: f.dil,
      satir: f.satir,
      semboller: oneCikanlar(sembolle.get(f.yol) ?? [], 6).map((s) => ({ ad: s.ust && s.tur === "metod" ? `${s.ust}.${s.ad}` : s.ad, tur: s.tur, bas: s.bas, disaAcik: s.disaAcik })),
      iceAktaran: iceAktaran.get(f.yol)?.size ?? 0,
    };
    if (f.yol === kok) return dugum;
    const ustYol = posix.dirname(f.yol) === "." ? "" : posix.dirname(f.yol);
    klasor(ustYol).cocuklar!.push(dugum);
  }
  // Satır ve dosya sayıları yukarı toplanır; klasörler önce, adlar Türkçe sırada
  const topla = (d: KodHaritaDugumu): { satir: number; dosya: number } => {
    if (d.tur === "dosya") return { satir: d.satir, dosya: 1 };
    let satir = 0;
    let dosya = 0;
    for (const c of d.cocuklar ?? []) {
      const t = topla(c);
      satir += t.satir;
      dosya += t.dosya;
    }
    d.satir = satir;
    d.dosyaSayisi = dosya;
    d.cocuklar?.sort((a, b) => (a.tur === b.tur ? a.ad.localeCompare(b.ad, "tr") : a.tur === "klasor" ? -1 : 1));
    return { satir, dosya };
  };
  topla(kokDugum);
  return kokDugum;
}

/** İçe aktarma grafiğinde PageRank: çok içe aktarılan ve önemli dosyalarca kullanılan dosyalar yüksek puan alır */
export function onemPuanlari(dosyalar: DosyaKaydi[], iceAktarmalar: IceAktarmaKaydi[]): Map<string, number> {
  const adlar = dosyalar.map((d) => d.yol);
  const indeks = new Map(adlar.map((y, i) => [y, i]));
  const n = adlar.length;
  const cikis: number[][] = Array.from({ length: n }, () => []);
  for (const i of iceAktarmalar) {
    const a = indeks.get(i.yol);
    const b = i.hedef ? indeks.get(i.hedef) : undefined;
    if (a !== undefined && b !== undefined && a !== b) cikis[a]!.push(b);
  }
  let puan = new Float64Array(n).fill(1 / Math.max(1, n));
  const d = 0.85;
  for (let tur = 0; tur < 30; tur++) {
    const yeni = new Float64Array(n).fill((1 - d) / Math.max(1, n));
    let sarkan = 0;
    for (let i = 0; i < n; i++) {
      const c = cikis[i]!;
      if (!c.length) sarkan += puan[i]!;
      else for (const j of c) yeni[j]! += (d * puan[i]!) / c.length;
    }
    for (let i = 0; i < n; i++) yeni[i]! += (d * sarkan) / Math.max(1, n);
    puan = yeni;
  }
  return new Map(adlar.map((y, i) => [y, puan[i]!]));
}

/** Ajanlar için karakter sınırlı depo haritası: önem sırasıyla dosyalar ve sembolleri, klasöre göre gruplanmış */
export function haritaMetni(dosyalar: DosyaKaydi[], semboller: SembolKaydi[], iceAktarmalar: IceAktarmaKaydi[], s: { yol?: string; sinir: number }): string {
  const kok = (s.yol ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const kapsam = dosyalar.filter((f) => !kok || f.yol === kok || f.yol.startsWith(`${kok}/`));
  if (!kapsam.length) return kok ? iki(`"${kok}" altında dizinlenmiş dosya yok.`, `No indexed files under "${kok}".`) : iki("Dizinde dosya yok.", "No files in the index.");
  const onem = onemPuanlari(dosyalar, iceAktarmalar);
  const sembolle = gruplaYola(semboller);
  const sirali = [...kapsam].sort((a, b) => (onem.get(b.yol) ?? 0) - (onem.get(a.yol) ?? 0) || b.satir - a.satir);
  const satirlar = new Map<string, string>();
  const toplamSatir = kapsam.reduce((t, f) => t + f.satir, 0);
  const baslik = iki(
    `${kok || "Kök"}: ${kapsam.length} dosya, ${toplamSatir} satır. Önemli dosyalar önce; sembol türleri parantezde.`,
    `${kok || "Root"}: ${kapsam.length} files, ${toplamSatir} lines. Important files first; symbol kinds in parentheses.`,
  );
  let kullanilan = baslik.length + 80;
  const klasorBasliklari = new Set<string>();
  for (const f of sirali) {
    const ss = oneCikanlar(sembolle.get(f.yol) ?? [], 8);
    const sembolMetni = ss.map((x) => `${x.ust && x.tur === "metod" ? `${x.ust}.` : ""}${x.ad}${x.tur === "metod" || x.tur === "fonksiyon" ? "()" : ` (${sembolTuruAdi(x.tur)})`}`).join(", ");
    const satir = `  ${posix.basename(f.yol)} [${f.satir}]${sembolMetni ? `: ${sembolMetni}` : ""}`;
    const klasor = posix.dirname(f.yol) === "." ? "./" : `${posix.dirname(f.yol)}/`;
    const ek = satir.length + 1 + (klasorBasliklari.has(klasor) ? 0 : klasor.length + 1);
    if (kullanilan + ek > s.sinir) continue;
    kullanilan += ek;
    klasorBasliklari.add(klasor);
    satirlar.set(f.yol, satir);
  }
  const gruplar = new Map<string, string[]>();
  for (const f of [...kapsam].sort((a, b) => a.yol.localeCompare(b.yol))) {
    const satir = satirlar.get(f.yol);
    if (!satir) continue;
    const klasor = posix.dirname(f.yol) === "." ? "./" : `${posix.dirname(f.yol)}/`;
    gruplar.set(klasor, [...(gruplar.get(klasor) ?? []), satir]);
  }
  const govde = [...gruplar].map(([k, l]) => `${k}\n${l.join("\n")}`).join("\n");
  const kalan = kapsam.length - satirlar.size;
  return `${baslik}\n${govde}${kalan > 0 ? iki(`\n(+${kalan} dosya daha; yol vererek daralt)`, `\n(+${kalan} more files; narrow it down with yol)`) : ""}`;
}

/** Modül grafiği: dosya ya da klasör düzeyinde içe aktarma kenarları (ağırlık: içe aktarma sayısı) */
export function grafikKur(dosyalar: DosyaKaydi[], iceAktarmalar: IceAktarmaKaydi[], duzey: "klasor" | "dosya", sinir = duzey === "dosya" ? 350 : 200): KodGrafigi {
  const klasorOf = (y: string) => {
    const d = posix.dirname(y);
    return d === "" ? "." : d;
  };
  const dosyaKumesi = new Map(dosyalar.map((d) => [d.yol, d]));
  const dugumler = new Map<string, KodGrafikDugumu>();
  if (duzey === "dosya") {
    for (const d of dosyalar) dugumler.set(d.yol, { id: d.yol, dil: d.dil, satir: d.satir, dosya: 1 });
  } else {
    const diller = new Map<string, Map<string, number>>();
    for (const d of dosyalar) {
      const k = klasorOf(d.yol);
      const x = dugumler.get(k) ?? { id: k, dil: "", satir: 0, dosya: 0 };
      x.satir += d.satir;
      x.dosya += 1;
      dugumler.set(k, x);
      const dl = diller.get(k) ?? new Map<string, number>();
      dl.set(d.dil, (dl.get(d.dil) ?? 0) + d.satir);
      diller.set(k, dl);
    }
    for (const [k, dl] of diller) dugumler.get(k)!.dil = [...dl].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }
  const kenarlar = new Map<string, { kaynak: string; hedef: string; agirlik: number }>();
  for (const i of iceAktarmalar) {
    if (!i.hedef) continue;
    let a = i.yol;
    let b = i.hedef;
    if (duzey === "klasor") {
      a = klasorOf(a);
      // Go içe aktarmaları klasöre çözülür
      b = dosyaKumesi.has(b) ? klasorOf(b) : b;
    }
    if (a === b || !dugumler.has(a) || !dugumler.has(b)) continue;
    const anahtar = `${a}\u0000${b}`;
    const k = kenarlar.get(anahtar) ?? { kaynak: a, hedef: b, agirlik: 0 };
    k.agirlik += 1;
    kenarlar.set(anahtar, k);
  }
  // Sınır aşılırsa en çok bağlı olanlar
  const derece = new Map<string, number>();
  for (const k of kenarlar.values()) {
    derece.set(k.kaynak, (derece.get(k.kaynak) ?? 0) + k.agirlik);
    derece.set(k.hedef, (derece.get(k.hedef) ?? 0) + k.agirlik);
  }
  let adaylar = [...dugumler.values()];
  // Bağlantısız düğümler (belge, görsel, tek başına betik klasörleri) grafiği dağıtır; kenar varsa gösterilmez
  if (duzey === "dosya" || derece.size) adaylar = adaylar.filter((d) => derece.has(d.id));
  adaylar.sort((a, b) => (derece.get(b.id) ?? 0) - (derece.get(a.id) ?? 0) || b.satir - a.satir);
  const secilen = adaylar.slice(0, sinir);
  const kume = new Set(secilen.map((d) => d.id));
  return {
    duzey,
    dugumler: secilen.sort((a, b) => a.id.localeCompare(b.id)),
    kenarlar: [...kenarlar.values()].filter((k) => kume.has(k.kaynak) && kume.has(k.hedef)),
    kirpilan: Math.max(0, adaylar.length - secilen.length),
  };
}
