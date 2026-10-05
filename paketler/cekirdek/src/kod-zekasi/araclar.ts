// İlgili dosyalar aracı (mcp__arnorg__ilgili_dosyalar): bir dosyanın içe aktarma komşuları ve kodu anlamca yakın
// dosyalar, nedenleri ve en yakın kod parçasıyla. arnorg-araclari.ts listeye tek satırla yayar; talimat satırı
// talimat.ts'te kod araçlarının yanına girer. Ajanın çalıştığı yerde (0.0.8'de ekibin ortak projesi) çalışır.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { Dil, KodIlgiliDosya, KodIlgiliDosyalar, KodParcaKonumu } from "@arnorg/ortak";
import { z } from "zod";
import { iki } from "../dil.js";
import type { Sirket } from "../sirket.js";

type Sonuc = { content: { type: "text"; text: string }[]; isError?: boolean };

function metin(t: string): Sonuc {
  return { content: [{ type: "text", text: t }] };
}

async function guvenli(f: () => Promise<Sonuc>): Promise<Sonuc> {
  try {
    return await f();
  } catch (h) {
    return { content: [{ type: "text", text: (h as Error).message }], isError: true };
  }
}

function konum(yol: string, p: KodParcaKonumu): string {
  return `${yol}:${p.bas}-${p.bit}${p.sembol ? ` ${p.sembol}` : ""}`;
}

function satirlar(liste: { satir: number }[]): string {
  return [...new Set(liste.map((x) => x.satir))].slice(0, 6).join(", ");
}

/** Bir ilgili dosyanın nedenleri: içe aktarma yönü ve satırları, anlam benzerliği ve en yakın parça çifti */
function nedenler(yol: string, d: KodIlgiliDosya): string[] {
  const n: string[] = [];
  if (d.giden.length) {
    const adlar = [...new Set(d.giden.flatMap((g) => g.adlar))].slice(0, 6).join(", ");
    n.push(iki(`bu dosya onu içe aktarıyor (satır ${satirlar(d.giden)}${adlar ? `; ${adlar}` : ""})`, `this file imports it (line ${satirlar(d.giden)}${adlar ? `; ${adlar}` : ""})`));
  }
  if (d.gelen.length) n.push(iki(`o bu dosyayı içe aktarıyor (satır ${satirlar(d.gelen)})`, `it imports this file (line ${satirlar(d.gelen)})`));
  if (d.benzerlik !== null) {
    const yuzde = Math.round(d.benzerlik * 100);
    const parca = d.enYakin ? iki(`; en yakın kod: ${konum(yol, d.enYakin.bu)} ↔ ${konum(d.yol, d.enYakin.o)}`, `; closest code: ${konum(yol, d.enYakin.bu)} ↔ ${konum(d.yol, d.enYakin.o)}`) : "";
    n.push(iki(`anlamca yakın %${yuzde}${parca}`, `semantically close ${yuzde}%${parca}`));
  }
  return n;
}

/** ilgili_dosyalar yanıtı: numaralı liste, her satırda nedenler; anlam bağları hazır değilse not */
export function ilgiliMetni(y: KodIlgiliDosyalar): string {
  const a = y.anlam;
  const not =
    a.durum === "kapali"
      ? iki("Anlam bağları kapalı (gömme modeli seçilmemiş); yalnız içe aktarma bağları.", "Meaning links are off (no embedding model selected); import links only.")
      : a.durum === "hazirlaniyor"
        ? y.dosyalar.some((d) => d.benzerlik !== null)
          ? iki(`Anlam bağları güncelleniyor (${a.gomulen}/${a.toplamParca} parça gömüldü); son hesaplananlar gösterildi.`, `Meaning links are being updated (${a.gomulen}/${a.toplamParca} chunks embedded); showing the last computed ones.`)
          : iki(`Anlam bağları hazırlanıyor (${a.gomulen}/${a.toplamParca} parça gömüldü); şimdilik yalnız içe aktarma bağları.`, `Meaning links are being prepared (${a.gomulen}/${a.toplamParca} chunks embedded); import links only for now.`)
        : "";
  if (!y.dosyalar.length)
    return [
      iki(`${y.yol}: ilgili dosya bulunamadı (içe aktarma bağı yok, anlamca yakın dosya da yok).`, `${y.yol}: no related files (no import links and no semantically close files).`),
      not,
      iki("kod_ara ile doğal dille ara.", "Search in plain language with kod_ara."),
    ]
      .filter(Boolean)
      .join("\n");
  const ithal = y.dosyalar.filter((d) => d.giden.length + d.gelen.length > 0).length;
  const anlam = y.dosyalar.filter((d) => d.benzerlik !== null).length;
  const baslik = iki(`${y.yol} · ${y.dosyalar.length} ilgili dosya (${ithal} içe aktarma, ${anlam} anlam bağı)`, `${y.yol} · ${y.dosyalar.length} related files (${ithal} import, ${anlam} meaning links)`);
  const govde = y.dosyalar.map((d, i) => `${i + 1}. ${d.yol} · ${nedenler(y.yol, d).join(" · ")}`);
  const son = anlam ? iki("Anlam bağları kodun gömmelerinden gelir; değiştirmeden önce Read ile doğrula.", "Meaning links come from code embeddings; verify with Read before changing anything.") : "";
  return [baslik, ...(not ? [not] : []), "", ...govde, ...(son ? ["", son] : [])].join("\n");
}

/** Talimatın ortak kurallarındaki satır (kod araçları satırının hemen ardından) */
export function ilgiliDosyalarTalimati(dil: Dil): string {
  return dil === "en"
    ? "- Before changing a file, look at its related files with mcp__arnorg__ilgili_dosyalar: import links and semantically close files (code doing the same job, even without an import) come with reasons and the closest code, so you reach everything a change touches fast."
    : "- Bir dosyayı değiştirmeden önce mcp__arnorg__ilgili_dosyalar ile ilgili dosyalarına bak: içe aktarma bağları ve kodu anlamca yakın dosyalar (içe aktarma olmasa da aynı işi yapan kod) nedenleri ve en yakın kodla gelir; değişikliğin dokunduğu her yere hızla ulaşırsın.";
}

/** Kod zekâsı araçları (şimdilik ilgili_dosyalar); arnorg-araclari.ts listeye yayar */
export function kodZekasiAraclari(sirket: Sirket, ajanId: string) {
  const ben = () => sirket.ajan(ajanId);
  return [
    tool(
      "ilgili_dosyalar",
      iki(
        "Bir dosyanın ilgili dosyaları: içe aktardıkları, onu içe aktaranlar ve kodu anlamca yakın dosyalar (gömmelerden; içe aktarma olmasa da aynı işi yapan kod). Her biri nedeni ve en yakın kod parçasıyla gelir. Bir dosyayı değiştirmeden ya da yeni koda başlamadan önce ilgili koda hızla ulaşmak için; ekibin ortak projesinde çalışır.",
        "A file's related files: what it imports, what imports it, and files whose code is semantically close (from embeddings; code doing the same job even without an import). Each comes with its reason and the closest code chunk. Use it to reach related code fast before changing a file or starting new code; it works in the project the team shares.",
      ),
      {
        dosya: z.string().min(1).max(500).describe(iki("Çalışma alanı köküne göre yol (ör. src/depo.ts)", "Path relative to the workspace root (e.g. src/store.ts)")),
        sinir: z.number().int().min(1).max(30).optional().describe(iki("En çok kaç dosya (varsayılan 12)", "At most this many files (default 12)")),
      },
      (a) =>
        guvenli(async () => {
          const y = await sirket.kodZekasi.ilgili(ben().projeId, sirket.ajanAlani(ben()), a.dosya, { sinir: a.sinir });
          return metin(ilgiliMetni(y));
        }),
    ),
  ];
}
