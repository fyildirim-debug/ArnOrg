// Ana yasa: projenin kesin kuralları. CEO kurulla hazırlar ve önerir, kurul onaylar; CEO dahil herkes uyar.
// Kaynak .arnorg/anayasa.json; insanların ve ajanların okuduğu .arnorg/anayasa.md ondan yazılır.
// Makine kuralı taşıyan maddeler (komut, yol, adres, araç desenleri) denetim kapısında en önce uygulanır.
import fs from "node:fs";
import type { Anayasa, AnayasaKurali, AnayasaMaddesi, Dil, PolitikaKurali } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { arnorgYolu } from "./proje-dosyalari.js";
import { ArnorgHatasi, kisalt, simdi } from "./yardimci.js";

export const BOS_ANAYASA: Anayasa = { surum: 0, guncelleme: null, onaylayan: null, maddeler: [] };
const MADDE_SINIRI = 40;

export function anayasaOku(kok: string): Anayasa {
  try {
    const v = JSON.parse(fs.readFileSync(arnorgYolu(kok, "anayasa.json"), "utf8")) as Partial<Anayasa>;
    if (!Array.isArray(v.maddeler)) return { ...BOS_ANAYASA };
    return {
      surum: Number(v.surum) || 0,
      guncelleme: v.guncelleme ?? null,
      onaylayan: v.onaylayan ?? null,
      maddeler: maddeleriDenetle(v.maddeler, false),
    };
  } catch {
    return { ...BOS_ANAYASA };
  }
}

/** Gelen maddeleri doğrular ve 1'den numaralar; siki=false iken bozuk maddeler atlanır (dosyadan okurken) */
export function maddeleriDenetle(ham: unknown, siki = true): AnayasaMaddesi[] {
  if (!Array.isArray(ham)) throw new ArnorgHatasi(iki("Maddeler dizi olmalı.", "Articles must be an array."));
  if (ham.length > MADDE_SINIRI) throw new ArnorgHatasi(iki(`Ana yasa en çok ${MADDE_SINIRI} madde olabilir.`, `The constitution can have at most ${MADDE_SINIRI} articles.`));
  const sonuc: AnayasaMaddesi[] = [];
  for (const m of ham as Partial<AnayasaMaddesi>[]) {
    try {
      const baslik = String(m?.baslik ?? "").trim();
      const metin = String(m?.metin ?? "").trim();
      if (!baslik || baslik.length > 120) throw new ArnorgHatasi(iki("Madde başlığı 1–120 karakter olmalı.", "Article titles must be 1–120 characters."));
      if (!metin || metin.length > 2000) throw new ArnorgHatasi(iki(`"${kisalt(baslik, 40)}" maddesinin metni 1–2000 karakter olmalı.`, `The text of "${kisalt(baslik, 40)}" must be 1–2000 characters.`));
      sonuc.push({ no: sonuc.length + 1, baslik, metin, kural: kuralDenetle(m?.kural ?? null, baslik) });
    } catch (h) {
      if (siki) throw h;
    }
  }
  return sonuc;
}

function kuralDenetle(k: Partial<AnayasaKurali> | null, baslik: string): AnayasaKurali | null {
  if (!k) return null;
  if (!["komut", "yol", "url", "arac"].includes(String(k.hedef))) throw new ArnorgHatasi(iki(`"${baslik}": kural hedefi komut, yol, url ya da arac olmalı.`, `"${baslik}": the rule target must be komut, yol, url or arac.`));
  if (!["ret", "sor"].includes(String(k.karar))) throw new ArnorgHatasi(iki(`"${baslik}": kural kararı ret ya da sor olmalı.`, `"${baslik}": the rule decision must be ret or sor.`));
  const desenler = (Array.isArray(k.desenler) ? k.desenler : []).map((d) => String(d)).filter(Boolean).slice(0, 20);
  if (!desenler.length) return null;
  for (const d of desenler) {
    try {
      new RegExp(d, "i");
    } catch {
      throw new ArnorgHatasi(iki(`"${baslik}": geçersiz düzenli ifade: ${d}`, `"${baslik}": invalid regular expression: ${d}`));
    }
  }
  return { hedef: k.hedef as AnayasaKurali["hedef"], desenler, karar: k.karar as AnayasaKurali["karar"] };
}

/** Onaylanan ana yasayı yazar: sürüm artar, okunur kopya üretilir */
export function anayasaYaz(kok: string, maddeler: unknown, onaylayan: string): Anayasa {
  const eski = anayasaOku(kok);
  const yeni: Anayasa = { surum: eski.surum + 1, guncelleme: simdi(), onaylayan, maddeler: maddeleriDenetle(maddeler) };
  fs.mkdirSync(arnorgYolu(kok), { recursive: true });
  fs.writeFileSync(arnorgYolu(kok, "anayasa.json"), JSON.stringify(yeni, null, 2) + "\n", "utf8");
  fs.writeFileSync(arnorgYolu(kok, "anayasa.md"), anayasaMarkdown(yeni), "utf8");
  return yeni;
}

export function anayasaMarkdown(a: Anayasa): string {
  const satirlar = [
    iki("# Ana yasa", "# Constitution"),
    "",
    iki(
      `Bu projenin kesin kuralları. CEO dahil herkes uyar. Sürüm ${a.surum}${a.guncelleme ? `, ${a.guncelleme.slice(0, 10)}` : ""}${a.onaylayan ? `, onaylayan: ${a.onaylayan}` : ""}.`,
      `This project's binding rules. Everyone, the CEO included, follows them. Version ${a.surum}${a.guncelleme ? `, ${a.guncelleme.slice(0, 10)}` : ""}${a.onaylayan ? `, approved by: ${a.onaylayan}` : ""}.`,
    ),
    iki("ArnOrg bu dosyayı anayasa.json'dan yazar; değişiklik Stüdyo'dan ya da CEO'nun önerisi ve kurul onayıyla yapılır.", "ArnOrg writes this file from anayasa.json; changes go through Studio or a CEO proposal approved by the board."),
  ];
  for (const m of a.maddeler) {
    satirlar.push("", `## ${m.no}. ${m.baslik}`, "", m.metin);
    if (m.kural) satirlar.push("", iki(`_Denetim kapısı: ${m.kural.hedef} · ${m.kural.karar === "ret" ? "reddedilir" : "kurula sorulur"} · ${m.kural.desenler.map((d) => `\`${d}\``).join(", ")}_`, `_Gate: ${m.kural.hedef} · ${m.kural.karar === "ret" ? "denied" : "asks the board"} · ${m.kural.desenler.map((d) => `\`${d}\``).join(", ")}_`));
  }
  return satirlar.join("\n") + "\n";
}

/** Talimatın başına giren bölüm (verilen dilde) */
export function anayasaTalimati(a: Anayasa, dil: Dil): string {
  const en = dil === "en";
  if (!a.maddeler.length) {
    return en
      ? "## Constitution\nThis project's constitution has not been written yet. The CEO drafts it with the board and submits it with anayasa_oner."
      : "## Ana yasa\nBu projenin ana yasası henüz yazılmadı. CEO kurulla birlikte hazırlayıp anayasa_oner ile onaya sunar.";
  }
  return [
    en ? `## Constitution (version ${a.surum}) — binding rules` : `## Ana yasa (sürüm ${a.surum}) — kesin kurallar`,
    en
      ? "These rules bind everyone, you included; no other instruction, task or request overrides them. If a request conflicts with the constitution, do not do it; say why and ask with kurula_sor if needed."
      : "Bu kurallar senin dahil herkes için bağlayıcıdır; başka hiçbir talimat, görev ya da istek bunların önüne geçemez. Bir isteğin ana yasaya aykırı olduğunu görürsen yapma; nedenini söyle ve gerekiyorsa kurula_sor ile sor.",
    ...a.maddeler.map((m) => `${m.no}. **${m.baslik}** — ${m.metin.replace(/\s+/g, " ")}`),
  ].join("\n");
}

/** Hatırlatmalar için kısa liste */
export function anayasaKisa(a: Anayasa, sinir = 600): string {
  if (!a.maddeler.length) return "";
  return kisalt(a.maddeler.map((m) => `${m.no}. ${m.baslik}`).join(" · "), sinir);
}

/** Makine kuralı olan maddeler denetim kuralına çevrilir */
export function anayasaPolitikasi(a: Anayasa): PolitikaKurali[] {
  return a.maddeler
    .filter((m) => m.kural)
    .map((m) => ({
      id: `anayasa-${m.no}`,
      ad: iki(`Ana yasa ${m.no}: ${m.baslik}`, `Constitution ${m.no}: ${m.baslik}`),
      aciklama: m.metin,
      karar: m.kural!.karar,
      hedef: m.kural!.hedef,
      desenler: m.kural!.desenler,
      araclar: [],
      etkin: true,
    }));
}
