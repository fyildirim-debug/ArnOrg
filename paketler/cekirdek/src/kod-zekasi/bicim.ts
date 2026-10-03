// Kod zekâsı sonuçlarının ajanlara giden düz metin biçimi: kısa, satır numaralı, "yol:bas-bit" konumlu.
import { KOD_SEMBOL_TURU_ADLARI, type KodAramaYaniti, type KodBagimliliklari, type KodDizinDurumu, type KodSembolu } from "@arnorg/ortak";

const ESLESME_ADLARI = { anlamsal: "anlamsal", sozcuk: "anahtar sözcük", sembol: "sembol adı", karma: "birden çok yöntem" } as const;

/** Dizin hazır değilse ajana söylenecek not; hazırsa boş */
export function durumNotu(d: KodDizinDurumu): string {
  switch (d.durum) {
    case "bos":
      return "Dizin henüz kurulmadı; ilk tarama sürüyor. Az sonra yeniden dene ya da Grep kullan.";
    case "taraniyor":
      return `Dizin taranıyor (${d.taranan ?? 0}/${d.toplamDosya ?? "?"} dosya); sonuçlar eksik olabilir.`;
    case "model-indiriliyor":
      return `Anlamsal arama modeli iniyor (%${d.indirmeYuzde ?? 0}); şimdilik anahtar sözcükle arandı.`;
    case "gomuluyor":
      return `Anlamsal dizin kuruluyor (${d.gomulen}/${d.toplamParca} parça); sonuçlar eksik olabilir.`;
    case "hata":
      return `Dizin hatası: ${d.hata ?? "bilinmiyor"}. Anahtar sözcük araması çalışır.`;
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
  if (!y.sonuclar.length) return [s.baslik ?? "Sonuç yok.", not, "Başka sözcüklerle dene, sembol_bul ile tam adı ara ya da Grep kullan."].filter(Boolean).join("\n");
  const yontem = y.yalnizSozcuk ? "anahtar sözcük" : "anlamsal + anahtar sözcük";
  const ust = `${s.baslik ?? `${y.sonuclar.length} sonuç`} (${yontem}, ${y.sureMs} ms)${not ? `\n${not}` : ""}`;
  const govde = y.sonuclar.map((r, i) => {
    const sembol = r.sembol ? ` · ${r.sembol}${r.sembolTuru ? ` (${KOD_SEMBOL_TURU_ADLARI[r.sembolTuru]})` : ""}` : "";
    return `${i + 1}. ${r.yol}:${r.bas}-${r.bit}${sembol} · ${r.puan.toFixed(2)} ${ESLESME_ADLARI[r.eslesme]}\n${satirNumarali(r.kesit, r.kesitBas, s.kesitSatiri ?? 8)}`;
  });
  return `${ust}\n\n${govde.join("\n\n")}`;
}

/** Görev metnindeki "İlgili kod" listesi: yalnız konumlar */
export function konumListesi(y: KodAramaYaniti, sinir = 5): string {
  return y.sonuclar
    .slice(0, sinir)
    .map((r) => `- ${r.yol}:${r.bas}-${r.bit}${r.sembol ? ` ${r.sembol}${r.sembolTuru ? ` (${KOD_SEMBOL_TURU_ADLARI[r.sembolTuru]})` : ""}` : ""}`)
    .join("\n");
}

export function sembolMetni(ad: string, liste: KodSembolu[], durum: KodDizinDurumu): string {
  const not = durumNotu(durum);
  if (!liste.length) return [`"${ad}" adlı sembol bulunamadı.`, not, "Adın bir kısmıyla ya da kod_ara ile dene."].filter(Boolean).join("\n");
  const satirlar = liste.map((s) => {
    const ust = s.ust ? `${s.ust}.` : "";
    return `- ${ust}${s.ad} · ${KOD_SEMBOL_TURU_ADLARI[s.tur]}${s.disaAcik ? ", dışa açık" : ""} · ${s.yol}:${s.bas}-${s.bit}\n    ${s.imza}`;
  });
  return `${liste.length} tanım${not ? ` (${not})` : ""}:\n${satirlar.join("\n")}`;
}

export function bagimlilikMetni(b: KodBagimliliklari): string {
  const ice = b.iceAktardiklari.length
    ? b.iceAktardiklari.map((i) => `- ${i.yol ?? `${i.kaynak} (dış paket)`} · satır ${i.satir}${i.adlar.length ? ` · ${i.adlar.slice(0, 8).join(", ")}` : ""}`).join("\n")
    : "- yok";
  const disa = b.iceAktaranlar.length
    ? b.iceAktaranlar.map((i) => `- ${i.yol}:${i.satir}${i.adlar.length ? ` · ${i.adlar.slice(0, 8).join(", ")}` : ""}`).join("\n")
    : "- yok";
  return `${b.yol}\nİçe aktardıkları:\n${ice}\n\nOnu içe aktaranlar (${b.iceAktaranlar.length}):\n${disa}`;
}
