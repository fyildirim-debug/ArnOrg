// Skill kütüphanesi (0.0.8): katalog bütünlüğü (her kayıtta geçerli SKILL.md, lisans ve kaynak), rol varsayılanları,
// işe alımda ve sonradan skill atama, ajan araçları ve talimat. Claude Code oturumu açılmaz.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as yamlOku } from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ajan, SkillKaydi } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { ROLLER } from "./roller.js";
import { Sirket } from "./sirket.js";
import { rolSkilleri, skillKatalogu, skillKoku, skilleriDogrula, skillListesi } from "./skiller.js";
import { Yapilandirma } from "./yapilandirma.js";

const kok = skillKoku()!;
const ham = JSON.parse(fs.readFileSync(path.join(kok, "katalog.json"), "utf8")) as { kategoriler: string[]; skiller: SkillKaydi[] };
const ROL_KIMLIKLERI = ROLLER.map((r) => r.kimlik);
/** Kütüphanede bulunmaması gereken işletim sistemine bağlı betikler */
const OS_BETIGI = /\.(sh|bash|zsh|ps1|bat|cmd|applescript|scpt)$/i;

function dosyalar(dizin: string): string[] {
  return fs.readdirSync(dizin, { withFileTypes: true }).flatMap((g) => (g.isDirectory() ? dosyalar(path.join(dizin, g.name)) : [path.join(dizin, g.name)]));
}

/** SKILL.md'nin ön bilgisi (--- arası YAML); Windows'ta çalışma ağacı CRLF olabilir */
function onBilgi(dosya: string): Record<string, unknown> {
  const metin = fs.readFileSync(dosya, "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n/.exec(metin);
  if (!m) throw new Error(`${dosya}: ön bilgi yok`);
  const veri: unknown = yamlOku(m[1]!);
  if (!veri || typeof veri !== "object" || Array.isArray(veri)) throw new Error(`${dosya}: ön bilgi YAML eşlemesi değil`);
  return veri as Record<string, unknown>;
}

describe("katalog bütünlüğü", () => {
  it("kütüphane kaynaktan bulunur; 20–40 skill, kimlikler tekil", () => {
    expect(kok.replace(/\\/g, "/")).toMatch(/paketler\/cekirdek\/skiller$/);
    expect(ham.skiller.length).toBeGreaterThanOrEqual(20);
    expect(ham.skiller.length).toBeLessThanOrEqual(40);
    expect(new Set(ham.skiller.map((s) => s.kimlik)).size).toBe(ham.skiller.length);
    // Kütüphanede katalogda olmayan klasör yok
    const klasorler = fs.readdirSync(kok, { withFileTypes: true }).filter((g) => g.isDirectory()).map((g) => g.name).sort();
    expect(klasorler).toEqual(ham.skiller.map((s) => s.kimlik).sort());
    expect(skillKatalogu().skiller).toHaveLength(ham.skiller.length);
  });

  for (const s of ham.skiller) {
    it(`${s.kimlik}: geçerli SKILL.md, lisans ve kaynak`, () => {
      const dizin = path.join(kok, s.kimlik);
      // Claude Code skilli: ön bilgide klasör adıyla aynı name ve dolu bir description
      expect(s.kimlik).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
      const fm = onBilgi(path.join(dizin, "SKILL.md"));
      expect(fm.name).toBe(s.kimlik);
      expect(typeof fm.description).toBe("string");
      expect((fm.description as string).trim().length).toBeGreaterThan(20);
      expect((fm.description as string).length).toBeLessThanOrEqual(1024);
      // Lisans: yeniden dağıtıma izin veren bir lisans ve klasördeki metni
      expect(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC-BY-4.0"]).toContain(s.lisans);
      const lisans = fs.readFileSync(path.join(dizin, s.lisansDosyasi), "utf8");
      if (s.lisans === "MIT") expect(lisans).toMatch(/Permission is hereby granted, free of charge/);
      if (s.lisans === "Apache-2.0") expect(lisans).toMatch(/Apache License\s+Version 2\.0/);
      expect(s.telif).toMatch(/^Copyright \(c\) /);
      // Kaynak: depo, adres, depo içi yol ve tam commit
      expect(s.kaynak.depo).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(s.kaynak.adres).toBe(`https://github.com/${s.kaynak.depo}`);
      expect(s.kaynak.yol.length).toBeGreaterThan(0);
      expect(s.kaynak.commit).toMatch(/^[0-9a-f]{40}$/);
      // İki dilli ad ve açıklama, bilinen kategori ve roller; CEO'ya skill düşmez
      for (const m of [s, s.en]) {
        expect(m.ad.trim()).not.toBe("");
        expect(m.aciklama.trim()).not.toBe("");
      }
      expect(Boolean(s.gereksinim)).toBe(Boolean(s.en.gereksinim));
      expect(ham.kategoriler).toContain(s.kategori);
      expect(s.roller.length).toBeGreaterThan(0);
      for (const r of s.roller) expect(ROL_KIMLIKLERI).toContain(r);
      expect(s.roller).not.toContain("ceo");
      for (const r of s.varsayilan) expect(s.roller).toContain(r);
      // Tam uyum: işletim sistemine bağlı betik yok, çıkarılan dosya gerçekten yok
      for (const f of dosyalar(dizin)) expect(path.basename(f)).not.toMatch(OS_BETIGI);
      for (const c of s.cikarilan ?? []) expect(fs.existsSync(path.join(dizin, c))).toBe(false);
    });
  }

  it("hiçbir skill push, yayın ya da Claude imzası istemez", () => {
    for (const f of dosyalar(kok).filter((x) => /\.(md|txt|py|json|ya?ml)$/i.test(x))) {
      const metin = fs.readFileSync(f, "utf8");
      expect(metin, f).not.toMatch(/Co-Authored-By|Generated with \[?Claude|git push|gh pr create|npm publish/i);
    }
  });

  it("NOTICE.md her skilli kaynağı ve lisansıyla anar", () => {
    const notice = fs.readFileSync(path.join(kok, "NOTICE.md"), "utf8");
    for (const s of ham.skiller) {
      const satir = notice.split("\n").find((x) => x.startsWith(`| \`${s.kimlik}\` |`));
      expect(satir, s.kimlik).toBeTruthy();
      expect(satir).toContain(s.kaynak.depo);
      expect(satir).toContain(s.kaynak.commit.slice(0, 12));
      expect(satir).toContain(s.lisans);
    }
  });

  it("CEO dışındaki her rolün varsayılan skilleri var; katalog sırasıyla", () => {
    for (const r of ROL_KIMLIKLERI.filter((x) => x !== "ceo")) expect(rolSkilleri(r).length, r).toBeGreaterThan(0);
    expect(rolSkilleri("ceo")).toEqual([]);
    expect(rolSkilleri("backend")).toEqual(["systematic-debugging", "verification-before-completion", "test-driven-development", "api-design-principles", "error-handling-patterns"]);
    expect(skillKatalogu().roller.tanitim).toEqual(["crafting-effective-readmes", "humanizer", "copywriting"]);
  });
});

describe("doğrulama ve kayıt", () => {
  it("bilinmeyen skill reddedilir, tekrarlar ayıklanır, sıra katalogdan gelir", () => {
    expect(() => skilleriDogrula(["humanizer", "yok-boyle-skill"], "yazar")).toThrow("Bilinmeyen skill: yok-boyle-skill");
    expect(() => skilleriDogrula("humanizer", "yazar")).toThrow("Skiller kimlik listesi olmalı.");
    expect(skilleriDogrula(["humanizer", "mermaid-diagrams", "humanizer"], "yazar")).toEqual(["mermaid-diagrams", "humanizer"]);
    // Uyduğu rol dışında da atanabilir (öneridir, sınır değil)
    expect(skilleriDogrula(["copywriting"], "backend")).toEqual(["copywriting"]);
  });

  it("CEO'ya skill atanmaz; boş liste geçer", () => {
    expect(() => skilleriDogrula(["humanizer"], "ceo")).toThrow("CEO skill kullanmaz");
    expect(skilleriDogrula([], "ceo")).toEqual([]);
  });

  it("veritabanı kaydı: NULL rolün varsayılanları, bilinmeyen kimlik atlanır, boş dizi boş kalır", () => {
    expect(skillListesi(null, "yazar")).toEqual(rolSkilleri("yazar"));
    expect(skillListesi('["humanizer","kaldirilmis-skill"]', "yazar")).toEqual(["humanizer"]);
    expect(skillListesi("[]", "yazar")).toEqual([]);
    expect(skillListesi("bozuk", "yazar")).toEqual(rolSkilleri("yazar"));
  });
});

describe("işe alım ve atama", () => {
  let gecici: string;
  let depo: Depo;
  let sirket: Sirket;
  let pid: string;
  const ceo = (): Ajan => depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
  type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
  async function arac(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
    const a = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((x) => x.name === ad);
    if (!a) throw new Error(`araç yok: ${ad}`);
    const s = await a.handler(girdi, {});
    return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
  }
  const talimat = (a: Ajan) => (sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string }).talimatOlustur(a, gecici);

  beforeAll(async () => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-skiller-"));
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    pid = (await sirket.projeOlustur({ ad: "Skilli", yol: path.join(gecici, "repo"), olustur: true })).id;
  });

  afterAll(() => {
    sirket.kapat();
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true });
  });

  it("kurulun işe alımı: verilen skiller saklanır; verilmezse rolün varsayılanları", () => {
    const deniz = sirket.iseAl(pid, { ad: "Deniz", rol: "backend", skiller: ["sql-optimization-patterns", "api-design-principles"] });
    expect(deniz.skiller).toEqual(["api-design-principles", "sql-optimization-patterns"]);
    expect(depo.ajan(deniz.id)!.skiller).toEqual(["api-design-principles", "sql-optimization-patterns"]);
    const ece = sirket.iseAl(pid, { ad: "Ece", rol: "frontend" });
    expect(ece.skiller).toEqual(rolSkilleri("frontend"));
    expect(ceo().skiller).toEqual([]);
  });

  it("geçersiz skill işe alımı durdurur; çalışan eklenmez", () => {
    expect(() => sirket.iseAl(pid, { ad: "Mert", rol: "test", skiller: ["uydurma"] })).toThrow("Bilinmeyen skill: uydurma");
    expect(depo.ajanAdla(pid, "Mert")).toBeNull();
  });

  it("çalışan panelinden değişir; null rolün varsayılanlarına döndürür", async () => {
    const ece = depo.ajanAdla(pid, "Ece")!;
    expect((await sirket.ajanGuncelle(ece.id, { skiller: ["vercel-react-best-practices", "accessibility"] })).skiller).toEqual(["vercel-react-best-practices", "accessibility"]);
    expect((await sirket.ajanGuncelle(ece.id, { skiller: [] })).skiller).toEqual([]);
    expect((await sirket.ajanGuncelle(ece.id, { skiller: null })).skiller).toEqual(rolSkilleri("frontend"));
    await expect(sirket.ajanGuncelle(ceo().id, { skiller: ["humanizer"] })).rejects.toThrow("CEO skill kullanmaz");
  });

  it("CEO ise_al_teklif ile skilleri verir; tam otonomda hemen geçerli, onay ayrıntısında görünür", async () => {
    const r = await arac(ceo().id, "ise_al_teklif", { ad: "Selin", rol: "tasarim", gerekce: "Tasarım sistemi gerekiyor", skiller: ["frontend-design", "copywriting"] });
    expect(r.hata).toBe(false);
    expect(depo.ajanAdla(pid, "Selin")!.skiller).toEqual(["frontend-design", "copywriting"]);
    const onay = depo.onaylar(pid).find((o) => o.tur === "ise_alim" && (o.veri as { ad?: string }).ad === "Selin")!;
    expect(onay.ayrinti).toContain("Skiller: frontend-design, copywriting");
    // Skiller verilmezse rolün varsayılanları; ayrıntı bunları anar
    await arac(ceo().id, "ise_al_teklif", { ad: "Nehir", rol: "yazar", gerekce: "Belgeler birikti" });
    expect(depo.ajanAdla(pid, "Nehir")!.skiller).toEqual(rolSkilleri("yazar"));
    // Bilinmeyen skill teklifi açmaz
    const hatali = await arac(ceo().id, "ise_al_teklif", { ad: "Kaan", rol: "devops", gerekce: "CI kurulacak", skiller: ["uydurma"] });
    expect(hatali.hata).toBe(true);
    expect(hatali.metin).toContain("Bilinmeyen skill: uydurma");
    expect(depo.ajanAdla(pid, "Kaan")).toBeNull();
  });

  it("skilleri_listele role göre süzer; skill_ata yalnız yöneticinin", async () => {
    const liste = await arac(ceo().id, "skilleri_listele", { rol: "devops" });
    expect(liste.metin).toContain("devops rolüne uyan skiller");
    expect(liste.metin).toContain("- github-actions-templates (varsayılan): GitHub Actions iş akışları.");
    expect(liste.metin).not.toContain("copywriting");
    const hepsi = await arac(ceo().id, "skilleri_listele", {});
    expect(hepsi.metin).toContain(`Skill kütüphanesi (${ham.skiller.length}):`);
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const yetkisiz = await arac(deniz.id, "skill_ata", { ad: "Ece", skiller: ["humanizer"] });
    expect(yetkisiz).toMatchObject({ hata: true, metin: "Skilleri yalnız CEO ve CTO atayabilir." });
    const ata = await arac(ceo().id, "skill_ata", { ad: "Deniz", skiller: ["supabase-postgres-best-practices"] });
    expect(ata.metin).toBe("Deniz için skiller: supabase-postgres-best-practices. Çalışanın bir sonraki oturumunda yüklenir.");
    expect(depo.ajanAdla(pid, "Deniz")!.skiller).toEqual(["supabase-postgres-best-practices"]);
    expect(depo.akis(deniz.id, 10).some((o) => o.metin?.startsWith("Ada skillerini değiştirdi"))).toBe(true);
  });

  it("talimat: çalışana kendi skilleri, yöneticiye işe alım rehberi; CEO'nun kendi skili yok", () => {
    const selin = talimat(depo.ajanAdla(pid, "Selin")!);
    expect(selin).toContain("## Skillerin");
    expect(selin).toContain("- arnorg:frontend-design — Özgün arayüz tasarımı");
    expect(selin).not.toContain("## İşe alımda skiller");
    const ada = talimat(ceo());
    expect(ada).toContain("## İşe alımda skiller");
    expect(ada).toContain(`- backend: ${rolSkilleri("backend").join(", ")}`);
    expect(ada).not.toContain("## Skillerin");
  });
});
