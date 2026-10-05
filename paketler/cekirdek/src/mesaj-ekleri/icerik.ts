// Ajana giden kullanıcı mesajının içeriği (SDKUserMessage.message.content): metinde ters tırnak içinde mutlak yoluyla
// anılan ek görselleri (<proje>/.arnorg/ekler/<id>.png|jpg|jpeg|gif|webp) mesaja görsel bloğu olarak girer. Görseller önce,
// her biri adıyla; mesajın metni en sonda. Görsel yoksa metin olduğu gibi döner (davranış değişmez).
// Görsel diskten okunur ve yeniden denetlenir: imza baytları, piksel boyutu, bayt sınırı ve mesaj başına bütçe
// (SATIR_ICI_GORSEL). Uymayan atlanır; metinde yolu durduğundan ajan Read ile açabilir. ekMetni yalnız uyanların yolunu
// ters tırnağa alır.
import fs from "node:fs";
import path from "node:path";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { SATIR_ICI_GORSEL } from "./index.js";
import { gorselBoyutu, gorselImzasi, type GorselTuru } from "./tur.js";

/** SDK'nın kullanıcı mesajı içeriği: metin ya da içerik blokları (metin, görsel, …) */
export type MesajIcerigi = SDKUserMessage["message"]["content"];

/** Ters tırnak içinde, mutlak yoluyla anılan ek görseli */
const GORSEL_YOLU = /`([^`\r\n]*[\\/]\.arnorg[\\/]ekler[\\/][A-Za-z0-9_-]{8,64}\.(?:png|jpe?g|gif|webp))`/gi;
/** Ek listesi satırı: "1) ekran.png (görsel, …)"; görselin adı buradan okunur */
const LISTE_SATIRI = /^\s*\d{1,2}\)\s+(.+?)\s+\(/;

interface SatirIciGorsel {
  ad: string;
  mime: GorselTuru;
  veri: string;
  bayt: number;
}

/** Görsel diskten okunur ve denetlenir; satır içi sınırları ya da kalan bütçeyi aşarsa, okunamazsa null */
function gorselOku(yol: string, butce: number): Omit<SatirIciGorsel, "ad"> | null {
  try {
    const st = fs.statSync(yol);
    if (!st.isFile() || st.size === 0 || st.size > Math.min(SATIR_ICI_GORSEL.bayt, butce)) return null;
    const tampon = fs.readFileSync(yol);
    const mime = gorselImzasi(tampon);
    if (!mime) return null;
    const boyut = gorselBoyutu(tampon, mime);
    if (!boyut || Math.max(boyut.genislik, boyut.yukseklik) > SATIR_ICI_GORSEL.kenar) return null;
    return { mime, veri: tampon.toString("base64"), bayt: tampon.length };
  } catch {
    return null;
  }
}

/** Yolun anıldığı satırdaki ek adı; liste satırı değilse dosya adı */
function adBul(metin: string, konum: number, yol: string): string {
  const satirBasi = metin.lastIndexOf("\n", konum) + 1;
  const satir = metin.slice(satirBasi, konum);
  return LISTE_SATIRI.exec(satir)?.[1] ?? path.basename(yol);
}

/**
 * Kullanıcı mesajının içeriği: metinde anılan ek görselleri (yinelenen yol bir kez, en çok SATIR_ICI_GORSEL.adet ve
 * toplam bütçe içinde) görsel bloğu olur; her görselden önce adı yazılır, metin en sonda gelir. Görsel yoksa metnin kendisi.
 */
export function mesajIcerigi(metin: string): MesajIcerigi {
  if (!metin.includes(".arnorg") || !metin.includes("`")) return metin;
  const gorseller: SatirIciGorsel[] = [];
  const goruldu = new Set<string>();
  let butce: number = SATIR_ICI_GORSEL.toplamBayt;
  for (const m of metin.matchAll(GORSEL_YOLU)) {
    if (gorseller.length >= SATIR_ICI_GORSEL.adet) break;
    const yol = m[1]!.trim();
    if (!path.isAbsolute(yol) || goruldu.has(yol)) continue;
    goruldu.add(yol);
    const g = gorselOku(yol, butce);
    if (!g) continue;
    butce -= g.bayt;
    gorseller.push({ ad: adBul(metin, m.index, yol), ...g });
  }
  if (!gorseller.length) return metin;
  return [
    ...gorseller.flatMap((g) => [
      { type: "text" as const, text: g.ad },
      { type: "image" as const, source: { type: "base64" as const, media_type: g.mime, data: g.veri } },
    ]),
    { type: "text" as const, text: metin },
  ];
}
