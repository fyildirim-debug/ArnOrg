// Repo içindeki .arnorg/ dizini: proje ayarları, ekip kimlikleri, notlar ve hafıza
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { iki } from "./dil.js";
import type { Ajan, NotDosyasi, NotIcerigi } from "@arnorg/ortak";
import { ArnorgHatasi, sadelestir } from "./yardimci.js";

export const ARNORG_DIZINI = ".arnorg";

export function arnorgYolu(proje: string, ...parcalar: string[]): string {
  return path.join(proje, ARNORG_DIZINI, ...parcalar);
}

function yazYoksa(dosya: string, icerik: string): void {
  if (fs.existsSync(dosya)) return;
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, icerik, "utf8");
}

/** .arnorg/ iskeletini oluşturur; var olan dosyalara dokunmaz */
export function iskeletOlustur(kok: string, ad: string, aciklama: string, varsayilanDal: string, yeniRepo: boolean): void {
  yazYoksa(
    arnorgYolu(kok, "proje.yaml"),
    YAML.stringify({
      ad,
      aciklama,
      varsayilan_dal: varsayilanDal,
      calisma: "ortak",
      not: iki(
        "ArnOrg proje ayarları. Ekip kimlikleri ekip/, proje hafızası notlar/ altında tutulur.",
        "ArnOrg project settings. Team identities live in ekip/, project memory in notlar/.",
      ),
    }),
  );
  yazYoksa(
    arnorgYolu(kok, "notlar", "vizyon.md"),
    iki(
      `# Vizyon\n\n${aciklama || "Projenin amacı, kullanıcısı ve ilk sürümün kapsamı buraya yazılır."}\n`,
      `# Vision\n\n${aciklama || "The purpose of the project, its users and the scope of the first release go here."}\n`,
    ),
  );
  yazYoksa(arnorgYolu(kok, "notlar", "mimari.md"), iki("# Mimari\n\nKatmanlar, teknoloji seçimleri ve aralarındaki sınırlar.\n", "# Architecture\n\nLayers, technology choices and the boundaries between them.\n"));
  yazYoksa(arnorgYolu(kok, "notlar", "sozluk.md"), iki("# Sözlük\n\nProjeye özgü terimler ve anlamları.\n", "# Glossary\n\nProject-specific terms and their meanings.\n"));
  yazYoksa(
    arnorgYolu(kok, "notlar", "kararlar", "ADR-001-arnorg.md"),
    iki(
      `# ADR-001 · Proje ArnOrg ile yönetilir\n\n**Durum:** Kabul edildi\n\n**Bağlam.** Proje Claude Code ajanlarından oluşan bir ekiple geliştirilecek.\n\n**Karar.** Görevler, notlar ve ekip kimlikleri \`.arnorg/\` altında tutulur; ekip bu repoda, ${varsayilanDal} dalında görev bazlı ve aynı anda çalışır; ArnOrg her görevin dosyalarını görev bitince commit'ler.\n\n**Sonuçlar.** Kararlar bu klasörde ADR olarak birikir; ajanlar işe başlamadan notları okur.\n`,
      `# ADR-001 · The project is run with ArnOrg\n\n**Status:** Accepted\n\n**Context.** The project will be built by a team of Claude Code agents.\n\n**Decision.** Tasks, notes and team identities live under \`.arnorg/\`; the team works task by task, at the same time, in this repository on ${varsayilanDal}; ArnOrg commits each task's files when the task is done.\n\n**Consequences.** Decisions accumulate here as ADRs; agents read the notes before they start.\n`,
    ),
  );
  yazYoksa(arnorgYolu(kok, "hafiza", "README.md"), iki("# Hafıza\n\nAjanların öğrendiği dersler ve günlükleri.\n", "# Memory\n\nLessons the agents learned and their journals.\n"));
  fs.mkdirSync(arnorgYolu(kok, "ekip"), { recursive: true });
  if (yeniRepo) {
    yazYoksa(
      path.join(kok, "CLAUDE.md"),
      iki(
        `# ${ad}\n\n${aciklama}\n\n## Çalışma kuralları\n\n- Bu proje ArnOrg ile yönetilir. Proje notları \`.arnorg/notlar/\`, kararlar \`.arnorg/notlar/kararlar/\` altındadır; işe başlamadan ilgili notları oku.\n- Projenin ana yasası \`.arnorg/anayasa.md\` dosyasındadır; herkes uyar.\n- Ekip bu repoda, ${varsayilanDal} dalında görev bazlı çalışır; herkes yalnız kendi görevinin dosyalarına dokunur. Commit'leri ArnOrg atar ("<görev kodu> <başlık>").\n- Testler geçmeden iş 'inceleme' durumuna alınmaz.\n`,
        `# ${ad}\n\n${aciklama}\n\n## Working rules\n\n- This project is run with ArnOrg. Project notes live in \`.arnorg/notlar/\`, decisions in \`.arnorg/notlar/kararlar/\`; read the relevant notes before you start.\n- The project's constitution is in \`.arnorg/anayasa.md\`; everyone follows it.\n- The team works task by task in this repository on ${varsayilanDal}; everyone touches only their own task's files. ArnOrg makes the commits ("<task code> <title>").\n- Work does not move to 'inceleme' (review) until the tests pass.\n`,
      ),
    );
    yazYoksa(path.join(kok, ".gitignore"), "node_modules/\ndist/\nbuild/\ncoverage/\n.env\n.env.local\n*.log\n");
  }
}

// ---------------- ekip kimlik dosyaları ----------------

export function ekipDosyasi(kok: string, ad: string): string {
  return arnorgYolu(kok, "ekip", `${sadelestir(ad)}.md`);
}

export function ekipDosyasiYaz(kok: string, ajan: Ajan, yoneticiAd: string | null): void {
  const on = {
    ad: ajan.ad,
    rol: ajan.rol,
    model: ajan.model,
    // 0.0.10: false ise model projenin kullanım seviyesine bağlıdır (model satırı yazıldığı anki modeldir)
    model_sabit: ajan.modelSabit,
    yonetici: yoneticiAd,
    izin_modu: ajan.izinModu,
    dal: ajan.dal,
    karakter: ajan.karakter,
  };
  const govde = ajan.talimatEki.trim() ? `\n${ajan.talimatEki.trim()}\n` : "\n";
  const dosya = ekipDosyasi(kok, ajan.ad);
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, `---\n${YAML.stringify(on)}---\n${govde}`, "utf8");
}

export function ekipDosyasiSil(kok: string, ad: string): void {
  fs.rmSync(ekipDosyasi(kok, ad), { force: true });
}

export interface EkipKaydi {
  ad: string;
  rol: string;
  model: string;
  /** 0.0.10 · Model sabit mi; 0.0.10 öncesinin dosyasında null */
  modelSabit: boolean | null;
  yonetici: string | null;
  talimatEki: string;
  karakter: string | null;
}

export function ekipDosyalariniOku(kok: string): EkipKaydi[] {
  const dizin = arnorgYolu(kok, "ekip");
  if (!fs.existsSync(dizin)) return [];
  const sonuc: EkipKaydi[] = [];
  for (const ad of fs.readdirSync(dizin)) {
    if (!ad.endsWith(".md")) continue;
    const metin = fs.readFileSync(path.join(dizin, ad), "utf8");
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(metin);
    if (!m) continue;
    try {
      const on = YAML.parse(m[1]!) as Record<string, unknown>;
      if (typeof on.ad !== "string" || typeof on.rol !== "string") continue;
      sonuc.push({
        ad: on.ad,
        rol: on.rol,
        model: typeof on.model === "string" ? on.model : "sonnet",
        modelSabit: typeof on.model_sabit === "boolean" ? on.model_sabit : null,
        yonetici: typeof on.yonetici === "string" ? on.yonetici : null,
        talimatEki: (m[2] ?? "").trim(),
        karakter: typeof on.karakter === "string" && /^(k\d{2}|u-[a-z0-9-]{4,64})$/.test(on.karakter) ? on.karakter : null,
      });
    } catch {
      // Bozuk kimlik dosyası atlanır
    }
  }
  return sonuc;
}

// ---------------- notlar ----------------

function notKoku(kok: string): string {
  return arnorgYolu(kok, "notlar");
}

/** Göreli not yolunu doğrular; dizin dışına çıkışı engeller */
export function notYoluCoz(kok: string, goreli: string): string {
  const temiz = goreli.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!temiz || temiz.split("/").some((p) => p === ".." || p === "")) throw new ArnorgHatasi(iki("Geçersiz not yolu.", "Invalid note path."));
  if (!/\.(md|markdown|txt)$/i.test(temiz)) throw new ArnorgHatasi(iki("Notlar .md, .markdown ya da .txt olmalı.", "Notes must be .md, .markdown or .txt files."));
  return path.join(notKoku(kok), ...temiz.split("/"));
}

function baslikBul(icerik: string, yedek: string): string {
  const m = /^#\s+(.+)$/m.exec(icerik);
  return m ? m[1]!.trim() : yedek;
}

export function notlariListele(kok: string): NotDosyasi[] {
  const sonuc: NotDosyasi[] = [];
  const dolas = (dizin: string, onek: string) => {
    if (!fs.existsSync(dizin)) return;
    for (const g of fs.readdirSync(dizin, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
      const goreli = onek ? `${onek}/${g.name}` : g.name;
      const tam = path.join(dizin, g.name);
      if (g.isDirectory()) dolas(tam, goreli);
      else if (/\.(md|markdown|txt)$/i.test(g.name)) {
        const icerik = fs.readFileSync(tam, "utf8");
        sonuc.push({ yol: goreli, baslik: baslikBul(icerik, g.name), guncelleme: fs.statSync(tam).mtime.toISOString() });
      }
    }
  };
  dolas(notKoku(kok), "");
  return sonuc;
}

export function notOku(kok: string, goreli: string): NotIcerigi {
  const dosya = notYoluCoz(kok, goreli);
  if (!fs.existsSync(dosya)) throw new ArnorgHatasi(iki("Not bulunamadı.", "Note not found."), 404);
  return { yol: goreli, icerik: fs.readFileSync(dosya, "utf8") };
}

export function notYaz(kok: string, goreli: string, icerik: string): NotDosyasi {
  const dosya = notYoluCoz(kok, goreli);
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, icerik, "utf8");
  return { yol: goreli, baslik: baslikBul(icerik, path.basename(dosya)), guncelleme: new Date().toISOString() };
}

/** Notlarda basit metin araması (hafiza_ara aracı için) */
export function notlardaAra(kok: string, sorgu: string, sinir = 20): { yol: string; satir: number; metin: string }[] {
  const terimler = sorgu.toLocaleLowerCase("tr").split(/\s+/).filter(Boolean);
  if (!terimler.length) return [];
  const sonuc: { yol: string; satir: number; metin: string }[] = [];
  for (const n of notlariListele(kok)) {
    const satirlar = fs.readFileSync(notYoluCoz(kok, n.yol), "utf8").split("\n");
    satirlar.forEach((s, i) => {
      const kucuk = s.toLocaleLowerCase("tr");
      if (sonuc.length < sinir && terimler.every((t) => kucuk.includes(t))) sonuc.push({ yol: n.yol, satir: i + 1, metin: s.trim().slice(0, 240) });
    });
  }
  return sonuc;
}
