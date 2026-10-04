// Kod zekâsı sonuçlarının ajanlara giden düz metin biçimi: kısa, satır numaralı, "yol:bas-bit" konumlu.
import { KOD_SEMBOL_TURU_ADLARI, type KodAramaYaniti, type KodBagimliliklari, type KodDizinDurumu, type KodEslesmeTuru, type KodSembolTuru, type KodSembolu } from "@arnorg/ortak";
import { iki } from "../dil.js";

const ESLESME_ADLARI: Record<KodEslesmeTuru, [string, string]> = {
  anlamsal: ["anlamsal", "semantic"],
  sozcuk: ["anahtar sözcük", "keyword"],
  sembol: ["sembol adı", "symbol name"],
  karma: ["birden çok yöntem", "several methods"],
};
const SEMBOL_TURU_ADLARI_EN: Record<KodSembolTuru, string> = {
  fonksiyon: "function",
  metod: "method",
  sinif: "class",
  arayuz: "interface",
  tur: "type",
  enum: "enum",
  sabit: "constant",
  degisken: "variable",
  yapi: "struct",
  modul: "module",
  baslik: "heading",
  secici: "selector",
  tablo: "table",
};

/** Eşleşme yolunun geçerli dildeki adı */
function eslesmeAdi(e: KodEslesmeTuru): string {
  return iki(ESLESME_ADLARI[e][0], ESLESME_ADLARI[e][1]);
}

/** Sembol türünün geçerli dildeki adı (sınıf / class) */
export function sembolTuruAdi(t: KodSembolTuru): string {
  return iki(KOD_SEMBOL_TURU_ADLARI[t], SEMBOL_TURU_ADLARI_EN[t]);
}

/** Dizin hazır değilse ajana söylenecek not; hazırsa boş */
export function durumNotu(d: KodDizinDurumu): string {
  switch (d.durum) {
    case "bos":
      return iki("Dizin henüz kurulmadı; ilk tarama sürüyor. Az sonra yeniden dene ya da Grep kullan.", "The index isn't built yet; the first scan is running. Try again shortly or use Grep.");
    case "taraniyor":
      return iki(
        `Dizin taranıyor (${d.taranan ?? 0}/${d.toplamDosya ?? "?"} dosya); sonuçlar eksik olabilir.`,
        `Scanning the workspace (${d.taranan ?? 0}/${d.toplamDosya ?? "?"} files); results may be incomplete.`,
      );
    case "model-indiriliyor":
      return iki(`Anlamsal arama modeli iniyor (%${d.indirmeYuzde ?? 0}); şimdilik anahtar sözcükle arandı.`, `Downloading the semantic search model (${d.indirmeYuzde ?? 0}%); searched by keyword for now.`);
    case "gomuluyor":
      return iki(`Anlamsal dizin kuruluyor (${d.gomulen}/${d.toplamParca} parça); sonuçlar eksik olabilir.`, `Building the semantic index (${d.gomulen}/${d.toplamParca} chunks); results may be incomplete.`);
    case "hata":
      return iki(`Dizin hatası: ${d.hata ?? "bilinmiyor"}. Anahtar sözcük araması çalışır.`, `Index error: ${d.hata ?? "unknown"}. Keyword search still works.`);
    default:
      return "";
  }
}

function satirNumarali(kesit: string, bas: number, enCok: number): string {
  const satirlar = kesit.split("\n");
  const secilen = satirlar.slice(0, enCok);
  const genislik = String(bas + secilen.length - 1).length;
  const govde = secilen.map((s, i) => `    ${String(bas + i).padStart(genislik)}  ${s}`).join("\n");
  return satirlar.length > enCok ? `${govde}\n    …` : govde;
}

/** kod_ara ve benzer_kod yanıtı */
export function aramaMetni(y: KodAramaYaniti, s: { kesitSatiri?: number; baslik?: string } = {}): string {
  const not = durumNotu(y.durum);
  if (!y.sonuclar.length)
    return [s.baslik ?? iki("Sonuç yok.", "No results."), not, iki("Başka sözcüklerle dene, sembol_bul ile tam adı ara ya da Grep kullan.", "Try other words, search the exact name with sembol_bul or use Grep.")].filter(Boolean).join("\n");
  const yontem = y.yalnizSozcuk ? iki("anahtar sözcük", "keyword") : iki("anlamsal + anahtar sözcük", "semantic + keyword");
  const ust = `${s.baslik ?? iki(`${y.sonuclar.length} sonuç`, `${y.sonuclar.length} results`)} (${yontem}, ${y.sureMs} ms)${not ? `\n${not}` : ""}`;
  const govde = y.sonuclar.map((r, i) => {
    const sembol = r.sembol ? ` · ${r.sembol}${r.sembolTuru ? ` (${sembolTuruAdi(r.sembolTuru)})` : ""}` : "";
    return `${i + 1}. ${r.yol}:${r.bas}-${r.bit}${sembol} · ${r.puan.toFixed(2)} ${eslesmeAdi(r.eslesme)}\n${satirNumarali(r.kesit, r.kesitBas, s.kesitSatiri ?? 8)}`;
  });
  return `${ust}\n\n${govde.join("\n\n")}`;
}

/** Görev metnindeki "İlgili kod" listesi: yalnız konumlar */
export function konumListesi(y: KodAramaYaniti, sinir = 5): string {
  return y.sonuclar
    .slice(0, sinir)
    .map((r) => `- ${r.yol}:${r.bas}-${r.bit}${r.sembol ? ` ${r.sembol}${r.sembolTuru ? ` (${sembolTuruAdi(r.sembolTuru)})` : ""}` : ""}`)
    .join("\n");
}

export function sembolMetni(ad: string, liste: KodSembolu[], durum: KodDizinDurumu): string {
  const not = durumNotu(durum);
  if (!liste.length) return [iki(`"${ad}" adlı sembol bulunamadı.`, `No symbol named "${ad}".`), not, iki("Adın bir kısmıyla ya da kod_ara ile dene.", "Try part of the name or kod_ara.")].filter(Boolean).join("\n");
  const satirlar = liste.map((s) => {
    const ust = s.ust ? `${s.ust}.` : "";
    return `- ${ust}${s.ad} · ${sembolTuruAdi(s.tur)}${s.disaAcik ? iki(", dışa açık", ", exported") : ""} · ${s.yol}:${s.bas}-${s.bit}\n    ${s.imza}`;
  });
  return `${iki(`${liste.length} tanım`, `${liste.length} definitions`)}${not ? ` (${not})` : ""}:\n${satirlar.join("\n")}`;
}

export function bagimlilikMetni(b: KodBagimliliklari): string {
  const yok = iki("- yok", "- none");
  const ice = b.iceAktardiklari.length
    ? b.iceAktardiklari.map((i) => `- ${i.yol ?? `${i.kaynak} (${iki("dış paket", "external package")})`} · ${iki("satır", "line")} ${i.satir}${i.adlar.length ? ` · ${i.adlar.slice(0, 8).join(", ")}` : ""}`).join("\n")
    : yok;
  const disa = b.iceAktaranlar.length
    ? b.iceAktaranlar.map((i) => `- ${i.yol}:${i.satir}${i.adlar.length ? ` · ${i.adlar.slice(0, 8).join(", ")}` : ""}`).join("\n")
    : yok;
  return iki(`${b.yol}\nİçe aktardıkları:\n${ice}\n\nOnu içe aktaranlar (${b.iceAktaranlar.length}):\n${disa}`, `${b.yol}\nImports:\n${ice}\n\nImported by (${b.iceAktaranlar.length}):\n${disa}`);
}
