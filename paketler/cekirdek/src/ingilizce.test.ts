// İngilizce kip: çekirdeğin ürettiği metinler (araç açıklamaları ve sonuçları, hatalar, toplantı, kalıcı kayıtlar)
// seçili dilde. Claude Code oturumu açılmaz; dil dil.ts'teki kaynakla değiştirilir, her testten sonra Türkçeye döner.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Ajan, Mesaj } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { dilKaynagi } from "./dil.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

const TURKCE_HARF = /[çğıöşüÇĞİÖŞÜ]/;

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
const olaylar = new OlayYolu();

type Arac = {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodType>;
  handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
};
const araclar = (ajanId: string) => arnorgAracListesi(sirket, ajanId) as unknown as Arac[];
async function arac(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const a = araclar(ajanId).find((x) => x.name === ad);
  if (!a) throw new Error(`araç yok: ${ad}`);
  const s = await a.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}
const ajan = (ad: string): Ajan => depo.ajanAdla(pid, ad)!;
const ceo = (): Ajan => depo.ajanlar(pid).find((a) => a.rol === "ceo")!;
const bekle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ingilizce = () => dilKaynagi(() => "en");
const turkce = () => dilKaynagi(() => "tr");

/** JSON şemasındaki bütün açıklamalar (iç içe nesne ve diziler dahil) */
function aciklamalar(d: unknown, yol: string, sonuc: { yol: string; metin: string }[] = []): { yol: string; metin: string }[] {
  if (Array.isArray(d)) d.forEach((x, i) => aciklamalar(x, `${yol}[${i}]`, sonuc));
  else if (d && typeof d === "object") {
    for (const [k, v] of Object.entries(d)) {
      if (k === "description" && typeof v === "string") sonuc.push({ yol, metin: v });
      else aciklamalar(v, `${yol}.${k}`, sonuc);
    }
  }
  return sonuc;
}

beforeAll(async () => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-ingilizce-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  // Şirket dili ayardan okur (testlerde ARNORG_DIL=tr); proje de İngilizcede açılır ki kalıcı kayıtlar denetlenebilsin
  ingilizce();
  const p = await sirket.projeOlustur({ ad: "Shop", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  sirket.iseAl(pid, { ad: "Ece", rol: "frontend" });
});

beforeEach(ingilizce);
afterEach(turkce);

afterAll(() => {
  turkce();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("araç açıklamaları", () => {
  it("araçların ve şema alanlarının açıklamalarında Türkçe harf yok", () => {
    const liste = araclar(ceo().id);
    expect(liste.length).toBeGreaterThan(40);
    const turkceler: string[] = [];
    for (const t of liste) {
      expect(t.description.trim(), t.name).not.toBe("");
      if (TURKCE_HARF.test(t.description)) turkceler.push(`${t.name}: ${t.description}`);
      const sema = z.toJSONSchema(z.object(t.inputSchema));
      for (const a of aciklamalar(sema, t.name)) if (TURKCE_HARF.test(a.metin)) turkceler.push(`${a.yol}: ${a.metin}`);
    }
    expect(turkceler).toEqual([]);
  });

  it("açıklamalar araçlar kurulurken geçerli dilde üretilir (modül yüklenirken donmaz)", () => {
    const en = araclar(ceo().id).find((t) => t.name === "ise_al_teklif")!;
    expect(en.description).toMatch(/^Proposes hiring a new employee/);
    expect(z.toJSONSchema(z.object(en.inputSchema))).toMatchObject({ properties: { ad: { description: "A first name, e.g. Ada" } } });
    turkce();
    const tr = araclar(ceo().id).find((t) => t.name === "ise_al_teklif")!;
    expect(tr.description).toMatch(/^Yeni çalışan için gerekçeli işe alım teklifi/);
    expect(z.toJSONSchema(z.object(tr.inputSchema))).toMatchObject({ properties: { ad: { description: "Türkçe bir ad, ör. Deniz" } } });
  });
});

describe("toplantı", () => {
  it("duyuru 'Meeting: …\\nParticipants: @A @B', katılımcı sorusu 'Meeting (called by …): …' biçiminde", async () => {
    const c = ceo();
    const s = sirket as unknown as { uyandir: (id: string, metin: string, gonderen: Ajan | null) => Promise<boolean> };
    const asil = s.uyandir;
    const uyandirmalar: string[] = [];
    s.uyandir = async (_id, metin) => {
      uyandirmalar.push(metin);
      return true;
    };
    try {
      const gundem = "Should the first release use SQLite or Postgres?";
      const sonuc = arac(c.id, "toplanti_yap", { gundem, katilimcilar: ["Deniz", "Ece"], bekle_dk: 1 });
      await bekle();
      const kanal = depo.mesajlar(pid, "toplanti");
      expect(kanal.find((m) => m.gonderenAd === c.ad)?.metin).toBe(`Meeting: ${gundem}\nParticipants: @Deniz @Ece`);
      const sorular = depo.sorular(pid, { durum: "bekliyor" });
      expect(sorular.map((x) => x.soruluAd).sort()).toEqual(["Deniz", "Ece"]);
      for (const soru of sorular) {
        expect(soru.soru).toMatch(new RegExp(`^Meeting \\(called by ${c.ad}\\): ${gundem.replace("?", "\\?")}\\n\\nGive your view briefly`));
        expect(soru.soru).not.toMatch(TURKCE_HARF);
      }
      // Katılımcıya giden uyandırma metni de İngilizce
      expect(uyandirmalar.some((m) => m.startsWith(`${c.ad} asks you (question `) && m.includes("Answer with mcp__arnorg__soruyu_yanitla"))).toBe(true);
      for (const soru of sorular) sirket.soruYanitla(soru.soruluId, soru.id, `${soru.soruluAd}: SQLite is enough for now.`);
      const r = await sonuc;
      expect(r.hata).toBe(false);
      expect(r.metin).toMatch(/^Meeting done\. Views:\n- (Deniz|Ece) \((Backend|Frontend) developer\): /);
      expect(r.metin).toContain("Now decide: save the decision with hafiza_kaydet");
      expect(r.metin).not.toMatch(TURKCE_HARF);
      const ozet = depo.hafizaKayitlari(pid, { tur: "ozet" }).find((k) => k.baslik.startsWith("Meeting: "))!;
      expect(ozet.metin).toMatch(new RegExp(`^Called by: ${c.ad}\\n`));
    } finally {
      s.uyandir = asil;
    }
  });

  it("katılımcı bulunamayınca İngilizce hata verir", async () => {
    await expect(sirket.toplantiYap(ajan("Ece").id, "Should we change the theme colors?", ["Nobody"], 1)).rejects.toThrow('No employee named "Nobody".');
  });
});

describe("hatalar ve sonuçlar", () => {
  it("ArnorgHatasi metinleri İngilizce", async () => {
    expect(() => sirket.iseAl(pid, { ad: "deniz", rol: "test" })).toThrow("There is already an employee named deniz.");
    expect(() => sirket.iseAl(pid, { ad: "Kerem", rol: "yok" })).toThrow("Unknown role.");
    expect(() => sirket.iseAl(pid, { ad: "Second", rol: "ceo" })).toThrow("The project already has a CEO.");
    expect(() => sirket.ajan("yok")).toThrow("Agent not found.");
    expect(() => sirket.proje("yok")).toThrow("Project not found.");
    await expect(sirket.ajanaMesaj(ceo().id, "   ")).rejects.toThrow("The message cannot be empty.");
    await expect(sirket.mesajGonder(pid, "yonetim", ajan("Deniz").id, "hello")).rejects.toThrow(/^#ceo is between the board and the CEO/);
    expect(() => sirket.soruYanitla(ajan("Deniz").id, "yok", "x")).toThrow("Question not found.");
    const t1 = sirket.gorevOlustur(pid, { baslik: "Schema" });
    await expect(sirket.gorevGuncelle(t1.id, { durum: "tamam" })).rejects.toThrow(`${t1.kod}: moving from bekleyen to tamam is not allowed.`);
    await expect(sirket.gorevGuncelle(t1.id, { durum: "calisiliyor" })).rejects.toThrow(`${t1.kod} must be assigned to an employee before it starts.`);
    expect(() => sirket.politikaYaz(pid, [{ id: "x", ad: "Bad", aciklama: "", karar: "ret", hedef: "komut", desenler: ["("], araclar: [], etkin: true }])).toThrow(
      "Invalid regular expression (Bad): (",
    );
  });

  it("araç sonuçları ve hataları İngilizce", async () => {
    const c = ceo();
    expect(await arac(c.id, "gorev_ac", { baslik: "Login API", atanan: "Deniz" })).toEqual({ metin: expect.stringMatching(/^T-\d+ opened \(assigned to Deniz, planned\)\.$/), hata: false });
    const kod = depo.gorevler(pid).find((g) => g.baslik === "Login API")!.kod;
    const detay = await arac(c.id, "gorev_detay", { gorev: kod });
    expect(detay.metin).toMatch(new RegExp(`^Task ${kod}: Login API\\n`));
    expect(detay.metin).toContain("\nStatus: planlandi");
    expect(detay.metin).not.toMatch(TURKCE_HARF);
    expect(await arac(c.id, "gorev_detay", { gorev: "T-999" })).toEqual({ metin: "Task not found.", hata: true });
    expect((await arac(c.id, "kanal_oku", { kanal: "muhendislik" })).metin).toBe("No messages in #engineering.");
    expect((await arac(c.id, "mesaj_gonder", { metin: "Status update: planning is done.", kanal: "genel" })).metin).toBe("Message posted to #general.");
    expect((await arac(c.id, "mesaj_gonder", { metin: "Please take the login API.", alici: "Kimse" })).metin).toBe('No employee named "Kimse". See the team with ekip_listele.');

    const ekip = (await arac(c.id, "ekip_listele", {})).metin;
    // 0.0.10: en üstte bütçe ve kullanım seviyesi
    expect(ekip).toMatch(/^Project: no budget limit · level Normal\n\nTeam:\n/);
    expect(ekip).not.toMatch(TURKCE_HARF);
    expect(ekip).toContain("Deniz · Backend developer (backend)");
    expect(ekip).toContain("today 0 tokens");
    expect(ekip).toContain("Roles you can hire: every role except ceo — cto, backend,");

    const kayit = await arac(c.id, "hafiza_kaydet", { tur: "karar", baslik: "Database: SQLite", metin: "SQLite for the first release; revisit at 10k users." });
    expect(kayit.metin).toMatch(/^Saved to memory \(karar, id [0-9a-f]{8}\): Database: SQLite$/);
    const ara = (await arac(c.id, "hafiza_ara", { sorgu: "SQLite release" })).metin;
    expect(ara).toMatch(/^Memory:\n/);
    expect(ara).toMatch(/\n- \[karar\] Database: SQLite \(Ada, \d{4}-\d{2}-\d{2}, id [0-9a-f]{8}\): /);

    expect(await arac(ajan("Deniz").id, "rapor_hazirla", { gun: 7 })).toEqual({ metin: "Only the CEO and CTO can prepare the report.", hata: true });
    const rapor = (await arac(c.id, "rapor_hazirla", { gun: 7 })).metin;
    expect(rapor).toMatch(/^Report saved: raporlar\/\d{4}-\d{2}-\d{2}\.md\. Write a short summary for the board in #general\.\n\n# Status report · /);
    expect(rapor).toContain("## Summary");
    expect(rapor).toContain("| Employee | Role | Status | Period usage |");
    expect(rapor).not.toMatch(TURKCE_HARF);
  });

  it("kurula_sor: süre dolması metinden değil karardan anlaşılır", async () => {
    const c = ceo();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // İşleyici doğrudan çağrılır; şema varsayılanları uygulanmaz
      const sonuc = arac(c.id, "kurula_sor", { soru: "Can we use a paid email API?", secenekler: [] });
      await vi.advanceTimersByTimeAsync(sirket.yapilandirma.ayarlar.onaySuresiSn * 1000 + 10);
      expect(await sonuc).toEqual({ metin: "The board did not answer in time. Carry on the default, safe way.", hata: false });
    } finally {
      vi.useRealTimers();
    }
    const onay = depo.onaylar(pid).find((o) => o.baslik === `${c.ad} asks: Can we use a paid email API?`)!;
    expect(onay).toMatchObject({ durum: "zaman_asimi", not: "Timed out" });
    // Kurulun notu süre dolması notuyla aynı metin olsa da ret olarak kalır
    const ikinci = arac(c.id, "kurula_sor", { soru: "Can we also use a paid SMS API?", secenekler: [] });
    await bekle();
    const bekleyen = depo.onaylar(pid, "bekliyor").find((o) => o.tur === "genel")!;
    await sirket.onayKarari(bekleyen.id, "reddet", "Timed out");
    expect(await ikinci).toEqual({ metin: "The board rejected. Answer: Timed out", hata: false });
  });

  it("otomatik onaylanan teslimin duyurusunda otomatik onay notu yazılmaz", async () => {
    // Otomatik onay kurul kipinde geçerlidir
    await sirket.projeGuncelle(pid, { kararVeren: "kurul", otomatikOnay: { etkin: true, turler: ["teslim"] } });
    const r = await arac(ceo().id, "teslim_et", { baslik: "Login page", ozet: "Users can sign in with email.", test_adimlari: ["Open /login", "Sign in"] });
    expect(r.metin).toMatch(/^The delivery went to the board \(approval [0-9a-f]{8}\)\./);
    await bekle(50);
    const genel = depo.mesajlar(pid, "genel").map((m: Mesaj) => m.metin);
    expect(genel).toContain("The board turned on auto-approval; approvals of the selected types will be granted automatically.");
    expect(genel).toContain("The board accepted the delivery: Login page.");
    expect(genel.some((m) => m.includes("Auto-approved"))).toBe(false);
    expect(depo.onaylar(pid).find((o) => o.tur === "teslim")).toMatchObject({ baslik: "Delivery: Login page", durum: "onaylandi", not: "Auto-approved" });
    await sirket.projeGuncelle(pid, { kararVeren: "ceo", otomatikOnay: { etkin: false, turler: [] } });
  });
});

describe("kalıcı kayıtlar", () => {
  it("İngilizce açılan projede kanal açıklamaları, rol adları ve varsayılan kurallar İngilizce", () => {
    expect(depo.kanallar(pid).find((k) => k.ad === "genel")?.aciklama).toBe("Company-wide: brief, reports, announcements");
    expect(ajan("Deniz").rolAdi).toBe("Backend developer");
    expect(sirket.politika(pid).map((k) => k.ad)).toContain("Pushing and publishing");
    const acilis = depo.mesajlar(pid, "genel").find((m) => m.metin.startsWith("Shop is open."));
    expect(acilis?.metin).toContain("use #ceo for the kickoff conversation");
  });

  it("Türkçede işe alınan çalışanın rolü İngilizce metinlerde İngilizce anılır", async () => {
    turkce();
    const mert = sirket.iseAl(pid, { ad: "Mert", rol: "test" });
    expect(mert.rolAdi).toBe("Test mühendisi");
    ingilizce();
    expect((await arac(ceo().id, "ekip_listele", {})).metin).toContain("Mert · Test engineer (test)");
  });
});

describe("API", () => {
  let app: FastifyInstance;
  const anahtar = "test-anahtari-0123456789abcdef";
  beforeAll(async () => {
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => {
    await app.close();
  });
  const basliklar = () => ({ host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` });

  it("hata gövdeleri ve sistem kanallarının açıklamaları İngilizce", async () => {
    expect((await app.inject({ url: "/api/projeler/yok", headers: basliklar() })).json()).toEqual({ hata: "Project not found." });
    const kotu = await app.inject({ method: "PATCH", url: `/api/ajanlar/${ajan("Deniz").id}`, headers: basliklar(), payload: { karakter: "x" } });
    expect(kotu.statusCode).toBe(400);
    expect(kotu.json()).toEqual({ hata: "Invalid request: karakter — Invalid character id." });
    const kanallar = (await app.inject({ url: `/api/projeler/${pid}/kanallar`, headers: basliklar() })).json() as { ad: string; aciklama: string }[];
    expect(kanallar.find((k) => k.ad === "toplanti")?.aciklama).toBe("Meetings: agenda, opinions, decision");
    expect(kanallar.find((k) => k.ad === "yonetim")?.aciklama).toBe("One-on-one between the board and the CEO");
    expect((await app.inject({ url: "/api/saglik", headers: { host: basliklar().host } })).json()).toEqual({ hata: "The access key is missing or wrong." });
  });
});
