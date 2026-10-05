// Atanan skillerin oturuma yüklenmesi (0.0.8): çalışan başına ArnOrg'un veri dizininde yerel bir Claude Code eklentisi
//   <veri>/skiller/<ajan>/<imza>/.claude-plugin/plugin.json
//   <veri>/skiller/<ajan>/<imza>/skills/<kimlik>/SKILL.md ...
// Eklenti SDK'nın plugins seçeneğiyle (--plugin-dir) verilir; skiller oturumda arnorg:<kimlik> adıyla görünür. Kullanıcının
// reposuna ve çalışma dizinine hiçbir şey yazılmaz; atanmamış skill eklentide olmadığından çalışan onu göremez.
// Klasör adı (imza) atanan skillerden ve katalogdan türetilir: atama ya da kütüphane değişince yeni klasör kurulur, eskisi
// silinir. Açık oturum kendi klasörünü kullanmayı sürdürür; değişiklik bir sonraki oturumda gelir.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SdkPluginConfig } from "@anthropic-ai/claude-agent-sdk";
import { ARNORG_SURUMU, type Ajan } from "@arnorg/ortak";
import { ajanSkilleri, SKILL_EKLENTISI, skillKutuphanesi } from "./skiller.js";

/** Çalışanın eklenti klasörlerinin kökü */
export function skillEklentiKoku(veriDizini: string, ajanId: string): string {
  return path.join(veriDizini, "skiller", ajanId);
}

/**
 * Çalışanın atanmış skillerini içeren eklentiyi kurar (varsa yeniden kullanır) ve yolunu döndürür. Skili yoksa, CEO ise
 * ya da kütüphane bulunamazsa null; eski klasörler silinir.
 */
export function skillEklentisiHazirla(veriDizini: string, ajan: Pick<Ajan, "id" | "rol" | "skiller">): string | null {
  const kok = skillEklentiKoku(veriDizini, ajan.id);
  const kutuphane = skillKutuphanesi();
  const skiller = ajan.rol === "ceo" ? [] : ajanSkilleri(ajan);
  if (!kutuphane.kok || !skiller.length) {
    eskileriSil(kok, null);
    return null;
  }
  const imza = crypto.createHash("sha1").update(`${kutuphane.imza}|${skiller.join(",")}`).digest("hex").slice(0, 12);
  const hedef = path.join(kok, imza);
  if (!fs.existsSync(path.join(hedef, ".claude-plugin", "plugin.json"))) {
    // Yarım kalmış kurulum görünmesin: geçici klasörde kurulur, bitince adı verilir
    const gecici = path.join(kok, `${imza}.${process.pid}.${Date.now()}.kuruluyor`);
    fs.mkdirSync(path.join(gecici, ".claude-plugin"), { recursive: true });
    const manifest = {
      name: SKILL_EKLENTISI,
      version: ARNORG_SURUMU,
      description: "ArnOrg skill library: the Claude Code skills assigned to this employee",
      author: { name: "ArnOrg" },
    };
    fs.writeFileSync(path.join(gecici, ".claude-plugin", "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    for (const k of skiller) fs.cpSync(path.join(kutuphane.kok, k), path.join(gecici, "skills", k), { recursive: true });
    fs.rmSync(hedef, { recursive: true, force: true });
    fs.renameSync(gecici, hedef);
  }
  eskileriSil(kok, imza);
  return hedef;
}

/** Kullanılmayan eklenti klasörleri; silinemeyen (Windows'ta açık bir süreç tutuyorsa) sonraki açılışta yeniden denenir */
function eskileriSil(kok: string, kalan: string | null): void {
  let adlar: string[] = [];
  try {
    adlar = fs.readdirSync(kok);
  } catch {
    return;
  }
  for (const ad of adlar) {
    if (ad === kalan) continue;
    try {
      fs.rmSync(path.join(kok, ad), { recursive: true, force: true });
    } catch {
      // sonra yeniden denenir
    }
  }
}

/** Oturumun plugins seçeneği (ajan-oturumu.ts); kurulum hata verirse çalışan skillsiz açılır, oturum durmaz */
export function skillEklentileri(veriDizini: string, ajan: Pick<Ajan, "id" | "rol" | "skiller">, hataBildir?: (h: Error) => void): SdkPluginConfig[] {
  try {
    const yol = skillEklentisiHazirla(veriDizini, ajan);
    // Eklentinin MCP sunucusu yok; ArnOrg'un araçları ayrı (mcpServers)
    return yol ? [{ type: "local", path: yol, skipMcpDiscovery: true }] : [];
  } catch (h) {
    hataBildir?.(h as Error);
    return [];
  }
}
