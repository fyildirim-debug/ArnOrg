// Skill kütüphanesinin ajan araçları (mcp__arnorg__*): skilleri_listele, skill_ata (0.0.8). İşe alımda skill atama
// ise_al_teklif'in skiller alanıdır (arnorg-araclari.ts); burası kütüphaneyi gösterir ve var olan çalışanın skillerini
// değiştirir. Değişiklik çalışanın bir sonraki oturumunda gelir (skill-eklentisi.ts).
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { skillMetni } from "@arnorg/ortak";
import { z } from "zod";
import { dil, iki } from "./dil.js";
import { rolBul } from "./roller.js";
import type { Sirket } from "./sirket.js";
import { kimlik, simdi } from "./yardimci.js";
import { ajanSkilleri, rolSkilleri, skillKatalogu, skillListesiSemasi } from "./skiller.js";

type Sonuc = { content: { type: "text"; text: string }[]; isError?: boolean };

function metin(t: string): Sonuc {
  return { content: [{ type: "text", text: t }] };
}

async function guvenli(f: () => Promise<Sonuc> | Sonuc): Promise<Sonuc> {
  try {
    return await f();
  } catch (h) {
    return { content: [{ type: "text", text: (h as Error).message }], isError: true };
  }
}

export function skillAraclari(sirket: Sirket, ajanId: string) {
  const ben = () => sirket.ajan(ajanId);
  return [
    tool(
      "skilleri_listele",
      iki(
        "ArnOrg'un skill kütüphanesini listeler: kimlik, ad, açıklama, uyduğu roller. rol verilirse o role uyanlar ve rolün varsayılanları gelir. İşe alımda ise_al_teklif'in skiller alanına buradaki kimlikleri yaz.",
        "Lists ArnOrg's skill library: id, name, description and the roles it fits. With rol, only the skills that fit that role and the role's defaults. Use these ids in ise_al_teklif's skiller field when hiring.",
      ),
      { rol: z.string().optional().describe(iki("Rol kimliği, ör. backend", "Role id, e.g. backend")) },
      (a) =>
        guvenli(() => {
          const rol = a.rol?.trim() || null;
          if (rol && !rolBul(rol)) return { ...metin(iki(`Bilinmeyen rol: ${rol}.`, `Unknown role: ${rol}.`)), isError: true };
          const varsayilan = new Set(rol ? rolSkilleri(rol) : []);
          const liste = skillKatalogu().skiller.filter((s) => !rol || s.roller.includes(rol));
          if (!liste.length) return metin(iki("Bu role uyan skill yok.", "No skill fits this role."));
          const satirlar = liste.map((s) => {
            const m = skillMetni(s, dil());
            const isaret = varsayilan.has(s.kimlik) ? iki(" (varsayılan)", " (default)") : "";
            return `- ${s.kimlik}${isaret}: ${m.ad}. ${m.aciklama}${m.gereksinim ? ` ${m.gereksinim}` : ""} [${s.roller.join(", ")}]`;
          });
          const baslik = rol
            ? iki(`${rol} rolüne uyan skiller (${liste.length}):`, `Skills that fit the ${rol} role (${liste.length}):`)
            : iki(`Skill kütüphanesi (${liste.length}):`, `Skill library (${liste.length}):`);
          return metin([baslik, ...satirlar].join("\n"));
        }),
    ),
    tool(
      "skill_ata",
      iki(
        "Var olan bir çalışanın skillerini değiştirir (yalnız yöneticiler). skiller tam listedir: verilmeyen çıkar. Değişiklik çalışanın bir sonraki oturumunda gelir.",
        "Changes an existing employee's skills (managers only). skiller is the full list: anything left out is removed. The change applies from the employee's next session.",
      ),
      {
        ad: z.string().min(1).describe(iki("Çalışanın adı", "The employee's name")),
        skiller: skillListesiSemasi.describe(iki("Skill kimlikleri (skilleri_listele)", "Skill ids (skilleri_listele)")),
      },
      (a) =>
        guvenli(async () => {
          if (!rolBul(ben().rol)?.yonetici) return { ...metin(iki("Skilleri yalnız CEO ve CTO atayabilir.", "Only the CEO and the CTO can assign skills.")), isError: true };
          const hedef = sirket.depo.ajanAdla(ben().projeId, a.ad.replace(/^@/, "").trim());
          if (!hedef) return { ...metin(iki(`"${a.ad}" adında çalışan yok.`, `No employee named "${a.ad}".`)), isError: true };
          const yeni = await sirket.ajanGuncelle(hedef.id, { skiller: a.skiller });
          const liste = ajanSkilleri(yeni);
          const ozet = liste.join(", ") || iki("yok", "none");
          // Çalışanın akışına not: kurul oturum ekranında kimin neyi değiştirdiğini görür
          const oge = {
            id: kimlik(),
            ajanId: hedef.id,
            zaman: simdi(),
            tur: "sistem" as const,
            metin: iki(`${ben().ad} skillerini değiştirdi: ${ozet}. Bir sonraki oturumda yüklenir.`, `${ben().ad} changed the skills: ${ozet}. They load from the next session.`),
          };
          sirket.depo.akisEkle(hedef.projeId, oge);
          sirket.olaylar.yayinla({ tur: "ajan.akis", projeId: hedef.projeId, oge });
          return metin(iki(`${hedef.ad} için skiller: ${ozet}. Çalışanın bir sonraki oturumunda yüklenir.`, `Skills for ${hedef.ad}: ${ozet}. They load from the employee's next session.`));
        }),
    ),
  ];
}
