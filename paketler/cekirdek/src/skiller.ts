// Skill kütüphanesi (0.0.8): depoda duran seçilmiş Claude Code skilleri (paketler/cekirdek/skiller; kaynaklar ve
// lisanslar NOTICE.md). Katalog katalog.json'dan okunur. Burada rol varsayılanları, doğrulama, veritabanı göçü ve
// talimat satırları durur; skillerin oturuma yüklenmesi skill-eklentisi.ts'te, ajan araçları skill-araclari.ts'te.
// Ekipçe öğrenilen yöntemler (beceriler: beceri_oku, beceri_yaz) ayrı bir şeydir.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillMetni, type Ajan, type Dil, type Rol, type SkillKatalogu, type SkillKaydi } from "@arnorg/ortak";
import type Database from "better-sqlite3";
import { z } from "zod";
import { iki } from "./dil.js";
import { ROLLER } from "./roller.js";
import { ArnorgHatasi } from "./yardimci.js";

/** Oturumda skillerin ad alanı (eklenti adı): arnorg:<kimlik> */
export const SKILL_EKLENTISI = "arnorg";

/** Bir çalışana atanabilecek en çok skill */
export const SKILL_SINIRI = 24;

/** API ve araç girdisindeki skill listesi (kimlikler katalogla ayrıca doğrulanır) */
export const skillListesiSemasi = z.array(z.string().min(1).max(80)).max(SKILL_SINIRI * 2);

/**
 * Kütüphane klasörü: derlenmiş çekirdekte dist/skiller (paketlenmiş uygulamada resources/app.asar.unpacked/cekirdek/skiller;
 * betikler/derle.mjs kopyalar), kaynaktan çalışırken (geliştirme, testler) paketler/cekirdek/skiller
 */
export function skillKoku(): string | null {
  const burasi = path.dirname(fileURLToPath(import.meta.url));
  for (const aday of [path.join(burasi, "skiller"), path.join(burasi, "..", "skiller")]) {
    if (fs.existsSync(path.join(aday, "katalog.json"))) return aday;
  }
  return null;
}

interface YukluKatalog {
  kok: string | null;
  katalog: SkillKatalogu;
  /** Katalog dosyasının özeti: kütüphane değişince çalışanların eklenti klasörü yeniden kurulur */
  imza: string;
}

let yuklu: YukluKatalog | null = null;

/** Katalog bir kez okunur; klasörü ya da SKILL.md'si olmayan kayıt atlanır. Okunamazsa kütüphane boş sayılır */
function katalogYukle(): YukluKatalog {
  if (yuklu) return yuklu;
  const kok = skillKoku();
  let skiller: SkillKaydi[] = [];
  let imza = "bos";
  if (kok) {
    try {
      // Windows'ta çalışma ağacı CRLF olabilir; özet satır sonundan bağımsız kalır
      const metin = fs.readFileSync(path.join(kok, "katalog.json"), "utf8").replace(/\r\n/g, "\n");
      const ham = JSON.parse(metin) as { skiller?: SkillKaydi[] };
      skiller = (ham.skiller ?? []).filter((s) => fs.existsSync(path.join(kok, s.kimlik, "SKILL.md")));
      imza = crypto.createHash("sha1").update(metin).digest("hex").slice(0, 12);
    } catch {
      skiller = [];
    }
  }
  const roller: Record<string, string[]> = {};
  for (const s of skiller) for (const r of s.varsayilan) (roller[r] ??= []).push(s.kimlik);
  yuklu = { kok, katalog: { skiller, roller }, imza };
  return yuklu;
}

export function skillKatalogu(): SkillKatalogu {
  return katalogYukle().katalog;
}

/** Kütüphanenin klasörü ve katalog özeti (eklenti kurulumu için) */
export function skillKutuphanesi(): { kok: string | null; imza: string } {
  const k = katalogYukle();
  return { kok: k.kok, imza: k.imza };
}

export function skillBul(kimlik: string): SkillKaydi | null {
  return katalogYukle().katalog.skiller.find((s) => s.kimlik === kimlik) ?? null;
}

/** Katalog sırasında, tekil ve yalnız bilinen kimlikler */
function sirala(liste: Iterable<string>): string[] {
  const kume = new Set(liste);
  return katalogYukle()
    .katalog.skiller.map((s) => s.kimlik)
    .filter((k) => kume.has(k));
}

/** Rolün işe alımda varsayılan skilleri; CEO'nun yoktur (Skill aracı CEO'ya kapalı) */
export function rolSkilleri(rol: string): string[] {
  return [...(katalogYukle().katalog.roller[rol] ?? [])];
}

/** Role uyan skiller (katalogdaki roller alanı) */
export function roleUyanSkiller(rol: string): SkillKaydi[] {
  return katalogYukle().katalog.skiller.filter((s) => s.roller.includes(rol));
}

/** Veritabanındaki kayıttan çalışanın skilleri: kayıt yoksa (NULL) rolün varsayılanları, kütüphanede olmayan kimlik atlanır */
export function skillListesi(ham: string | null | undefined, rol: string): string[] {
  if (ham === null || ham === undefined) return rolSkilleri(rol);
  try {
    const liste: unknown = JSON.parse(ham);
    return Array.isArray(liste) ? sirala(liste.filter((k): k is string => typeof k === "string")) : rolSkilleri(rol);
  } catch {
    return rolSkilleri(rol);
  }
}

/** Çalışanın skilleri (alanı olmayan eski kayıtta rolün varsayılanları) */
export function ajanSkilleri(ajan: Pick<Ajan, "rol" | "skiller">): string[] {
  return ajan.skiller ? sirala(ajan.skiller) : rolSkilleri(ajan.rol);
}

/** API'den ve araçtan gelen listeyi doğrular: bilinmeyen kimlik reddedilir, tekrarlar ayıklanır; CEO'ya skill atanmaz */
export function skilleriDogrula(liste: unknown, rol: string): string[] {
  if (!Array.isArray(liste) || liste.some((k) => typeof k !== "string")) {
    throw new ArnorgHatasi(iki("Skiller kimlik listesi olmalı.", "Skills must be a list of ids."));
  }
  const kimlikler = (liste as string[]).map((k) => k.trim()).filter(Boolean);
  const bilinmeyen = [...new Set(kimlikler.filter((k) => !skillBul(k)))];
  if (bilinmeyen.length) {
    throw new ArnorgHatasi(
      iki(
        `Bilinmeyen skill: ${bilinmeyen.join(", ")}. Kütüphanedeki skilleri skilleri_listele ile gör.`,
        `Unknown skill: ${bilinmeyen.join(", ")}. See the skills in the library with skilleri_listele.`,
      ),
    );
  }
  const temiz = sirala(kimlikler);
  if (rol === "ceo" && temiz.length) {
    throw new ArnorgHatasi(iki("CEO skill kullanmaz; skilleri işe aldığı çalışanlara atar.", "The CEO does not use skills; they assign them to the people they hire."));
  }
  if (temiz.length > SKILL_SINIRI) throw new ArnorgHatasi(iki(`Bir çalışana en çok ${SKILL_SINIRI} skill atanabilir.`, `At most ${SKILL_SINIRI} skills can be assigned to one employee.`));
  return temiz;
}

/**
 * 0.0.8 göçü: ajanlar tablosuna skiller sütunu (JSON dizi). NULL hiç seçilmemiş demektir ve rolün varsayılanlarını
 * verir; böylece eski çalışanlar da kütüphaneden rollerine uyan skilleri alır, kurul panelden değiştirebilir.
 */
export function skillGocu(db: Database.Database): void {
  const sutunlar = (db.prepare("PRAGMA table_info(ajanlar)").all() as { name: string }[]).map((s) => s.name);
  if (!sutunlar.includes("skiller")) db.exec("ALTER TABLE ajanlar ADD COLUMN skiller TEXT");
}

/**
 * Talimata giren skill satırları (talimat.ts tek satırla çağırır). Skill sahibi çalışana kendi skilleri ve ArnOrg
 * kurallarının önceliği; yöneticiye (CEO, CTO) işe alımda rollere uyan skiller. CEO'nun kendi skili olmaz.
 */
export function skillTalimati(b: { ajan: Pick<Ajan, "rol" | "skiller">; rol: Rol | undefined; dil: Dil }): string[] {
  const en = b.dil === "en";
  const satirlar: string[] = [];
  const kendi = b.ajan.rol === "ceo" ? [] : ajanSkilleri(b.ajan).map((k) => skillBul(k)).filter((s): s is SkillKaydi => !!s);
  if (kendi.length) {
    satirlar.push(
      "",
      en ? "## Your skills" : "## Skillerin",
      en
        ? `These Claude Code skills from ArnOrg's library are assigned to you; load one with the Skill tool (for example ${SKILL_EKLENTISI}:${kendi[0]!.kimlik}). When your work matches a skill, load it before you start and follow its steps:`
        : `ArnOrg'un kütüphanesinden sana atanmış Claude Code skilleri; Skill aracıyla yüklenir (ör. ${SKILL_EKLENTISI}:${kendi[0]!.kimlik}). İşin bir skille örtüşüyorsa başlamadan önce o skili yükle ve adımlarını izle:`,
      ...kendi.map((s) => `- ${SKILL_EKLENTISI}:${s.kimlik} — ${skillMetni(s, b.dil).ad}`),
      en
        ? "- These are different from the team's methods (beceri_oku, beceri_yaz). If a skill mentions another one as superpowers:<name>, use the ArnOrg skill of the same name if it is assigned to you."
        : "- Bunlar ekibin öğrendiği yöntemlerden (beceri_oku, beceri_yaz) ayrıdır. Bir skill başka bir skili superpowers:<ad> diye anıyorsa, sana atanmışsa aynı adlı ArnOrg skilini kullan.",
      en
        ? "- ArnOrg's rules come first: if a skill tells you to ask the user, ask your manager or use kurula_sor; follow the common rules on commits, pushes and signatures, and keep writing only inside your working directory."
        : "- ArnOrg kuralları önce gelir: bir skill kullanıcıya sormanı isterse yöneticine sor ya da kurula_sor kullan; commit, push ve imza konusunda ortak kurallara uy, yalnız çalışma dizinine yaz.",
    );
  }
  if (b.rol?.yonetici) {
    // Kısa tutulur: rolün varsayılanları ve role uyan öteki skillerin sayısı; açıklamalar skilleri_listele'de
    const rolSatirlari = ROLLER.filter((r) => roleUyanSkiller(r.kimlik).length).map((r) => {
      const varsayilan = rolSkilleri(r.kimlik);
      const diger = roleUyanSkiller(r.kimlik).length - varsayilan.length;
      return `- ${r.kimlik}: ${varsayilan.join(", ") || "-"}${diger > 0 ? ` (+${diger})` : ""}`;
    });
    if (rolSatirlari.length) {
      satirlar.push(
        "",
        en ? "## Skills when hiring" : "## İşe alımda skiller",
        en
          ? "ArnOrg keeps a library of Claude Code skills. When you hire with ise_al_teklif, pick the skills that fit the work and give them in skiller (a list of ids); if you leave it empty the employee gets the role's defaults below. skilleri_listele with rol lists every skill that fits a role, with descriptions (+N: how many more fit). Change an existing employee's skills with skill_ata. The CEO does not use skills. Defaults by role:"
          : "ArnOrg'un bir Claude Code skill kütüphanesi var. ise_al_teklif ile işe alırken işe uyan skilleri seç ve skiller alanında ver (kimlik listesi); boş bırakırsan çalışan aşağıdaki rol varsayılanlarını alır. skilleri_listele rol ile o role uyan bütün skilleri açıklamalarıyla verir (+N: role uyan öteki skill sayısı). Var olan çalışanın skillerini skill_ata ile değiştir. CEO skill kullanmaz. Rollere göre varsayılanlar:",
        ...rolSatirlari,
      );
    }
  }
  return satirlar;
}
