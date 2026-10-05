// Ortak çalışma (0.0.8): kiralar ve kapı, yasak git komutları, görev kaydı (commit), git sırası, kaydın kalite
// denetimi, eski worktree'lerin geçişi, CEO'nun ekip temposu ve boşa çıkana iş dağıtımı. Gerçek geçici git depolarıyla;
// Claude Code oturumu açılmaz (ajana giden mesajlar casusla okunur). Komutlar Windows'ta da çalışsın diye node betikleri.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KAYIT_SON_DURUMLARI, KURUL, type Ajan, type Gorev, type GorevKaydi, type SunucuOlayi } from "@arnorg/ortak";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import * as gitIslemleri from "./git.js";
import { OlayYolu } from "./olaylar.js";
import { GitSirasi, kilitliyseYinele } from "./ortak-calisma/git-sirasi.js";
import { KIRA_ZAMAN_ASIMI_MS, YENI_UST_SINIR } from "./ortak-calisma/index.js";
import { bosKalite } from "./ortak-calisma/kayitlar.js";
import { rolUyumu, siradakiIs } from "./ortak-calisma/tempo.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";
import { bekle, kimlik, simdi } from "./yardimci.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
let repo: string;
const olaylar = new OlayYolu();
const gelenler: SunucuOlayi[] = [];

const git = (dizin: string, ...arg: string[]) => gitIslemleri.git(dizin, arg);
const oku = (dosya: string) => fs.readFileSync(path.join(repo, dosya), "utf8").replace(/\r\n/g, "\n");
const ajan = (ad: string, projeId = pid): Ajan => depo.ajanAdla(projeId, ad)!;
const ceo = (projeId = pid): Ajan => depo.ajanlar(projeId).find((a) => a.rol === "ceo")!;
const genel = (projeId = pid) => depo.mesajlar(projeId, "genel").map((m) => m.metin);

/** Ana dalda duran betikler: kontrol deger.txt'yi denetler; uzun hiç bitmez */
const BETIKLER: Record<string, string> = {
  ".gitignore": "node_modules/\n",
  "deger.txt": "ilk\n",
  "src/eski.ts": "export const eski = 1;\n",
  "kontrol.cjs": 'const fs = require("node:fs");\nconst d = fs.readFileSync("deger.txt", "utf8");\nif (d.includes("BOZUK")) { console.log("deger.txt bozuk: " + d.trim()); process.exit(1); }\nconsole.log("kontrol tamam");\n',
  "uzun.cjs": [
    'const { spawn } = require("node:child_process");',
    "const hedef = process.argv[2];",
    'spawn(process.execPath, ["-e", `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(hedef)}, "x"), 2500)`], { stdio: "ignore" });',
    'console.log("uzun basladi");',
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"),
};

type Kanca = HookJSONOutput & { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
const reddedildi = (k: HookJSONOutput) => (k as Kanca).hookSpecificOutput?.permissionDecision === "deny";
const neden = (k: HookJSONOutput) => (k as Kanca).hookSpecificOutput?.permissionDecisionReason ?? "";

/** Çalışan dosyayı Write ile yazar: kapıdan geçerse diske yazılır ve araç sonrası işlenir */
async function yaz(a: Ajan, goreli: string, icerik: string): Promise<HookJSONOutput> {
  const tam = path.join(repo, goreli);
  const k = await sirket.kapi(a.id, "Write", { file_path: tam, content: icerik });
  if (reddedildi(k)) return k;
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, icerik);
  sirket.ortak.aracSonrasi(depo.ajan(a.id)!, "Write", { file_path: tam }, repo);
  return k;
}

/** Çalışanın kabuk komutu kapıdan geçer mi */
const komut = (a: Ajan, command: string) => sirket.kapi(a.id, "Bash", { command });

/** Görev açar, çalışana atar ve başlatır (oturum açılmaz) */
async function gorevAc(baslik: string, a: Ajan, ek: Partial<Pick<Gorev, "etiket" | "aciklama">> = {}): Promise<Gorev> {
  const g = sirket.gorevOlustur(a.projeId, { baslik, atananId: a.id, ...ek });
  await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" });
  return depo.gorev(g.id)!;
}

/** Kaydın kalite denetimi bitene dek bekler */
async function denetimBekle(kayitId: string, sureMs = 30_000): Promise<GorevKaydi> {
  const sinir = Date.now() + sureMs;
  for (;;) {
    const k = sirket.ortak.defter.kayit(kayitId)!;
    if (KAYIT_SON_DURUMLARI.includes(k.kalite.durum) && !sirket.ortak.kalite.suruyorMu(k.projeId)) return k;
    if (Date.now() > sinir) throw new Error(`Denetim bitmedi: ${JSON.stringify(k.kalite)}`);
    await bekle(40);
  }
}

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
async function arac(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const a = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((x) => x.name === ad);
  if (!a) throw new Error(`araç yok: ${ad}`);
  const s = await a.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}

/** uyandir casusu: alıcıya giden mesajlar */
function casus() {
  const uyandir = vi.spyOn(sirket, "uyandir").mockResolvedValue(true);
  return { uyandir, mesajlar: (alici: string) => uyandir.mock.calls.filter(([a]) => a === alici).map(([, metin]) => metin) };
}

beforeAll(async () => {
  gecici = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-ortak-")));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, olaylar, yap, () => null, true);
  olaylar.dinle((o) => gelenler.push(o));
  const p = await sirket.projeOlustur({ ad: "Ortak", yol: path.join(gecici, "repo"), olustur: true });
  pid = p.id;
  repo = p.yol;
  for (const [ad, icerik] of Object.entries(BETIKLER)) {
    fs.mkdirSync(path.dirname(path.join(repo, ad)), { recursive: true });
    fs.writeFileSync(path.join(repo, ad), icerik);
  }
  await git(repo, "add", "-A");
  await git(repo, "commit", "-q", "-m", "Betikler");
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  sirket.iseAl(pid, { ad: "Elif", rol: "frontend" });
  sirket.iseAl(pid, { ad: "Mert", rol: "test" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("kiralar ve kapı", () => {
  it("çalışanın yazdığı dosya ona kiralanır; başkası düzenleyemez ama okuyabilir", async () => {
    const deniz = ajan("Deniz");
    const elif = ajan("Elif");
    const g = await gorevAc("Menü API'si", deniz);
    expect(reddedildi(await yaz(depo.ajan(deniz.id)!, "src/menu.ts", "export const menu = [];\n"))).toBe(false);
    expect(sirket.ortak.kiralar.sahibi(pid, "src/menu.ts")).toMatchObject({ ajanAd: "Deniz", gorevKodu: g.kod, kaynak: "arac" });

    const r = await sirket.kapi(elif.id, "Edit", { file_path: path.join(repo, "src/menu.ts"), old_string: "[]", new_string: "[1]" });
    expect(reddedildi(r)).toBe(true);
    expect(neden(r)).toContain("src/menu.ts şu an Deniz tarafından");
    expect(neden(r)).toContain(`${g.kod} "Menü API'si" görevi için`);
    expect(neden(r)).toContain("ajana_sor");
    // Okuma hiç engellenmez; kabukla yazma da kira denetiminden geçer
    expect(reddedildi(await sirket.kapi(elif.id, "Read", { file_path: path.join(repo, "src/menu.ts") }))).toBe(false);
    expect(reddedildi(await komut(elif, "cat src/menu.ts | wc -l"))).toBe(false);
    for (const k of ["sed -i 's/a/b/' src/menu.ts", "echo x >> src/menu.ts", "rm -rf src", "mv src/menu.ts src/m.ts", "git restore src/menu.ts"]) {
      expect(reddedildi(await komut(elif, k)), k).toBe(true);
    }
    // Kendi dosyası serbest; denetim kaydında kural "Dosya kirası"
    expect(reddedildi(await komut(deniz, "git restore src/menu.ts"))).toBe(false);
    expect(depo.denetimKayitlari(pid, 50).some((d) => d.ajanAd === "Elif" && d.karar === "ret" && d.kural === "Dosya kirası")).toBe(true);
    await bekle(300);
    const kira = gelenler.filter((o) => o.tur === "kira.guncellendi").at(-1);
    expect(kira).toMatchObject({ tur: "kira.guncellendi", projeId: pid });
    expect(kira?.tur === "kira.guncellendi" && kira.kiralar.map((k) => k.yol)).toEqual(["src/menu.ts"]);
  });

  it("ortak projede index'e, değişikliklere ve geçmişe dokunan git komutları gerekçeyle reddedilir; okuyan git serbest", async () => {
    const deniz = ajan("Deniz");
    const index = await komut(deniz, "git add -A && git commit -m 'Menü'");
    expect(reddedildi(index)).toBe(true);
    expect(neden(index)).toContain("Ortak projede git add kullanılmaz");
    expect(neden(index)).toContain("ArnOrg görevinin dosyalarını, görevi 'inceleme' durumuna aldığında ya da isi_kaydet çağırdığında");
    expect(neden(await komut(deniz, "git stash"))).toContain("başkalarının yarım işi de gider");
    expect(neden(await komut(deniz, "git reset --hard"))).toContain("başkalarının yarım işi de gider");
    expect(neden(await komut(deniz, "git checkout -- ."))).toContain("git restore -- <dosya>");
    expect(neden(await komut(deniz, "git clean -fd"))).toContain("başkalarının yarım işi de gider");
    for (const k of ["git switch -c deniz", "git checkout main", "git merge x", "git rebase main", "git pull"]) {
      const r = await komut(deniz, k);
      expect(reddedildi(r), k).toBe(true);
      expect(neden(r), k).toContain("herkes main dalında çalışır");
    }
    // push ortak çalışma kopyasına dokunmaz: bu kural geçirir, uzak depoya gönderimi denetimin onay kuralı sorar
    expect(sirket.ortak.kapidan(depo.ajan(deniz.id)!, "Bash", { command: "git push origin main" }, repo)).toBeNull();
    expect(neden(await komut(deniz, "rm -f .git/index.lock"))).toContain(".git klasörüne dokunma");
    for (const k of ["git status", "git diff", "git log --oneline -3", "git show HEAD --stat", "git blame deger.txt"]) {
      expect(reddedildi(await komut(deniz, k)), k).toBe(false);
    }
    expect(depo.denetimKayitlari(pid, 80).filter((d) => d.kural === "Ortak proje: git").length).toBeGreaterThanOrEqual(11);
  });

  it("komuttan sonra değişen kirasız dosya komutu çalıştırana yazılır; kurulun düzenlediği yazılmaz", async () => {
    const elif = ajan("Elif");
    await gorevAc("Menü sayfası", elif, { etiket: "frontend" });
    await sirket.ortak.izAl(pid, elif.id);
    fs.writeFileSync(path.join(repo, "src", "uretilen.ts"), "export const x = 1;\n");
    const kurulun = path.join(repo, "kurul-notu.md");
    fs.writeFileSync(kurulun, "# Not\n");
    sirket.kullaniciKilitleri.set(kurulun, Date.now() + 30_000);
    expect(await sirket.ortak.izAl(pid, elif.id)).toEqual(["src/uretilen.ts"]);
    expect(sirket.ortak.kiralar.sahibi(pid, "src/uretilen.ts")).toMatchObject({ ajanAd: "Elif", kaynak: "iz" });
    expect(sirket.ortak.kiralar.sahibi(pid, "kurul-notu.md")).toBeNull();
    fs.rmSync(kurulun);
  });
});

describe("görev kaydı", () => {
  it("incelemeden geri dönen görev sahibine inceleyenin notuyla 'geri döndü' diye gider; yeni iş gibi gitmez", async () => {
    const mert = ajan("Mert");
    const g = await gorevAc("Geri dönen iş", mert);
    depo.gorevGuncelle(g.id, { durum: "inceleme" });
    const giden = vi.spyOn(sirket, "ajanaMesaj").mockResolvedValue(undefined);
    try {
      await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" }, ceo().id, "Doğrulama testi eksik");
      const metin = giden.mock.calls.filter(([a]) => a === mert.id).map(([, m]) => m).join("\n");
      expect(metin).toContain(`${g.kod} incelemeden sana geri döndü: düzeltme istendi.`);
      expect(metin).toContain("İnceleyenin notu: Doğrulama testi eksik");
      expect(metin).toContain("yeniden 'inceleme' durumuna al");
      expect(metin).not.toContain("Yeni görev atandı");
      // Notsuz geri çevirmede de düzeltme isteği olarak gider
      depo.gorevGuncelle(g.id, { durum: "inceleme" });
      giden.mockClear();
      await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" }, ceo().id);
      const ikinci = giden.mock.calls.filter(([a]) => a === mert.id).map(([, m]) => m).join("\n");
      expect(ikinci).toContain(`${g.kod} incelemeden sana geri döndü`);
      expect(ikinci).not.toContain("İnceleyenin notu");
    } finally {
      giden.mockRestore();
      depo.gorevGuncelle(g.id, { durum: "iptal" });
    }
  });

  it("görev incelemeye geçince yalnız sahibinin o göreve ait dosyaları '<kod> <başlık>' ile commit'lenir", async () => {
    const deniz = ajan("Deniz");
    const g = depo.gorevler(pid).find((x) => x.baslik === "Menü API'si")!;
    await yaz(deniz, "src/menu.ts", "export const menu = ['çorba'];\n");
    // Silme de kayda girer (rm kiralanır)
    expect(reddedildi(await komut(deniz, "rm src/eski.ts"))).toBe(false);
    fs.rmSync(path.join(repo, "src", "eski.ts"));
    const { mesajlar } = casus();
    const once = gelenler.length;
    await sirket.gorevGuncelle(g.id, { durum: "inceleme" });

    expect((await git(repo, "log", "-1", "--format=%s")).trim()).toBe(`${g.kod} Menü API'si`);
    expect(await git(repo, "log", "-1", "--format=%B")).not.toMatch(/Co-Authored-By|Claude|Generated/i);
    expect((await git(repo, "log", "-1", "--format=%an")).trim()).toBe((await git(repo, "config", "user.name")).trim());
    const dosyalar = (await git(repo, "show", "--name-status", "--format=", "HEAD")).trim().split("\n").sort();
    expect(dosyalar).toEqual(["A\tsrc/menu.ts", "D\tsrc/eski.ts"].sort());
    // Elif'in dosyası çalışma kopyasında kalır, kirası sürer
    expect(await git(repo, "status", "--porcelain")).toContain("src/uretilen.ts");
    expect(sirket.ortak.kiralar.liste(pid).map((k) => `${k.ajanAd}:${k.yol}`)).toEqual(["Elif:src/uretilen.ts"]);

    const kayit = gelenler.slice(once).find((o) => o.tur === "gorev.kaydedildi");
    expect(kayit).toMatchObject({ tur: "gorev.kaydedildi", projeId: pid, kayit: { gorevKodu: g.kod, ajanAd: "Deniz", neden: "inceleme", dal: "main", kalite: { durum: "testsiz" } } });
    expect(kayit?.tur === "gorev.kaydedildi" && kayit.kayit.commit).toBe((await git(repo, "rev-parse", "HEAD")).trim());
    // Ofis ve Pano'nun baktığı kısa alanlar kayıttakilerin aynısı
    if (kayit?.tur !== "gorev.kaydedildi") throw new Error("kayıt olayı yok");
    expect(kayit).toMatchObject({ gorevId: g.id, gorevKodu: g.kod, ajanId: deniz.id, mesaj: `${g.kod} Menü API'si`, commit: kayit.kayit.commit });
    expect([...kayit.dosyalar].sort()).toEqual(["src/eski.ts", "src/menu.ts"]);
    expect(sirket.ortak.defter.gorevin(g.id)).toHaveLength(1);
    // İnceleme çağrısı kaydı anar; birleştirmeden söz etmez
    const cagri = mesajlar(ceo().id).find((m) => m.includes(`${g.kod} "Menü API'si" incelemeye hazır`)) ?? "";
    expect(cagri).toContain("Kaydı: ");
    expect(cagri).toContain("2 dosya");
    expect(cagri).toContain(`calisma_farki ile (gorev: ${g.kod})`);
    expect(cagri).not.toMatch(/birle[sş]tir/i);
  });

  it("isi_kaydet ara kayıt atar; kaydedilecek değişiklik yoksa söyler; calisma_farki görevin kayıtlarını gösterir", async () => {
    const elif = ajan("Elif");
    const g = depo.gorevler(pid).find((x) => x.baslik === "Menü sayfası")!;
    await yaz(elif, "src/sayfa.tsx", "export const Sayfa = () => null;\n");
    const r = await arac(elif.id, "isi_kaydet", { ozet: "İskelet hazır" });
    expect(r.hata).toBe(false);
    expect(r.metin).toMatch(new RegExp(`^${g.kod} kaydedildi: [0-9a-f]{7} · 2 dosya \\(src/sayfa.tsx, src/uretilen.ts\\)`));
    expect((await git(repo, "log", "-1", "--format=%B")).trim()).toBe(`${g.kod} Menü sayfası\n\nİskelet hazır`);
    expect((await arac(elif.id, "isi_kaydet", {})).metin).toBe(`${g.kod} için kaydedilecek değişiklik yok.`);
    await yaz(elif, "src/sayfa.tsx", "export const Sayfa = () => 'menü';\n");
    const fark = await arac(ceo().id, "calisma_farki", { gorev: g.kod });
    expect(fark.metin).toContain(`Görev ${g.kod} "Menü sayfası" · Elif · calisiliyor · 1 kayıt`);
    expect(fark.metin).toContain("+export const Sayfa = () => null;");
    expect(fark.metin).toContain("kaydedilmemiş: src/sayfa.tsx +1 -1");
    expect((await arac(ajan("Mert").id, "calisma_farki", { ajan: "Elif" })).metin).toContain("Menü sayfası");
    expect((await arac(elif.id, "calisma_farki", { gorev: g.kod })).hata).toBe(true);
  });

  it("git işlemleri proje başına sırayla yapılır: aynı anda gelen kayıtlar index.lock yarışına girmez", async () => {
    const sira = new GitSirasi();
    const iz: string[] = [];
    const is = (ad: string, ms: number) => async () => {
      iz.push(`${ad}+`);
      await bekle(ms);
      iz.push(`${ad}-`);
      return ad;
    };
    const sonuc = await Promise.all([sira.calistir("p", is("a", 30)), sira.calistir("p", is("b", 5)), sira.calistir("q", is("c", 5)), sira.calistir("p", async () => Promise.reject(new Error("x"))).catch(() => "hata"), sira.calistir("p", is("d", 1))]);
    expect(sonuc).toEqual(["a", "b", "c", "hata", "d"]);
    // p'nin işleri üst üste binmez; q ayrı sıradadır
    const p = iz.filter((x) => x[0] !== "c");
    expect(p).toEqual(["a+", "a-", "b+", "b-", "d+", "d-"]);
    expect(sira.bekleyen("p")).toBe(0);
    // Kilit hatası yeniden denenir, başka hata hemen fırlar
    let deneme = 0;
    expect(await kilitliyseYinele(async () => (++deneme < 3 ? Promise.reject(new Error("fatal: Unable to create '/r/.git/index.lock': File exists.")) : "tamam"), 5, 1)).toBe("tamam");
    await expect(kilitliyseYinele(async () => Promise.reject(new Error("başka")), 5, 1)).rejects.toThrow("başka");

    // İki çalışan aynı anda kaydeder: iki commit de çalışma dalına girer
    const deniz = ajan("Deniz");
    const mert = ajan("Mert");
    const g1 = await gorevAc("Sipariş uç noktası", deniz);
    const g2 = await gorevAc("Sipariş testi", mert);
    await yaz(depo.ajan(deniz.id)!, "src/siparis.ts", "export const s = 1;\n");
    await yaz(depo.ajan(mert.id)!, "test/siparis.test.ts", "// test\n");
    casus();
    const [k1, k2] = await Promise.all([sirket.ortak.gorevKaydet(depo.gorev(g1.id)!, "ara"), sirket.ortak.gorevKaydet(depo.gorev(g2.id)!, "ara")]);
    expect(k1?.dosyalar).toEqual(["src/siparis.ts"]);
    expect(k2?.dosyalar).toEqual(["test/siparis.test.ts"]);
    const log = (await git(repo, "log", "-2", "--format=%s")).trim().split("\n").sort();
    expect(log).toEqual([`${g1.kod} Sipariş uç noktası`, `${g2.kod} Sipariş testi`].sort());
  });
});

describe("kaydın kalite denetimi", () => {
  it("kayıttan sonra test arka planda o commit'te koşar; geçerse 'gecti'", async () => {
    await sirket.projeGuncelle(pid, { testKomutu: "node kontrol.cjs" });
    expect(genel().at(-1)).toMatch(/^Kalite: her görev kaydından sonra node kontrol\.cjs main dalındaki o commit'te arka planda koşacak/);
    const deniz = ajan("Deniz");
    const g = depo.gorevler(pid).find((x) => x.baslik === "Sipariş uç noktası")!;
    await yaz(deniz, "deger.txt", "iyi\n");
    casus();
    await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
    const kayit = sirket.ortak.defter.gorevin(g.id).at(-1)!;
    const k = await denetimBekle(kayit.id);
    expect(k.kalite).toMatchObject({ durum: "gecti", komut: "node kontrol.cjs", kirmiziKayit: null });
    expect(k.kalite.cikti).toContain("kontrol tamam");
    const durumlar = gelenler.flatMap((o) => (o.tur === "kayit.guncellendi" && o.kayit.id === kayit.id ? [o.kayit.kalite.durum] : [])).filter((d, i, l) => l[i - 1] !== d);
    expect(durumlar).toEqual(["kuyrukta", "hazirlik", "test", "gecti"]);
    expect(depo.gorev(g.id)?.durum).toBe("inceleme");
  }, 40_000);

  it("geçmeyen kayıtta görev çıktıyla sahibine döner, CEO'ya haber gider; dal zaten kırmızıysa sonraki kayıt geri açılmaz", async () => {
    const deniz = ajan("Deniz");
    const mert = ajan("Mert");
    const g = await gorevAc("Değeri boz", deniz);
    await yaz(depo.ajan(deniz.id)!, "deger.txt", "BOZUK\n");
    const { mesajlar } = casus();
    await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
    const k = await denetimBekle(sirket.ortak.defter.gorevin(g.id).at(-1)!.id);
    expect(k.kalite).toMatchObject({ durum: "kaldi", kirmiziKayit: null });
    expect(k.kalite.mesaj).toContain("çıkış kodu 1");
    expect(depo.gorev(g.id)?.durum).toBe("calisiliyor");
    const sahibe = mesajlar(deniz.id).find((m) => m.includes("testler geçmedi")) ?? "";
    expect(sahibe).toContain("deger.txt bozuk: BOZUK");
    expect(sahibe).toContain("Görev sana geri döndü");
    expect(genel().some((m) => m.startsWith(`${g.kod} "Değeri boz" kaydından sonra testler geçmedi; görev Deniz'e geri döndü.`))).toBe(true);
    const haber = sirket.zeka.haberleriAl(ceo().id).join("\n");
    expect(haber).toContain(`${g.kod} kaydında testler geçmedi`);
    expect(haber).toContain("deger.txt bozuk");

    // Dal kırmızıyken gelen başka bir kayıt da geçmez ama yeni kırılma sayılmaz: görevi geri açılmaz
    const g2 = depo.gorevler(pid).find((x) => x.baslik === "Sipariş testi")!;
    await yaz(mert, "test/ikinci.test.ts", "// ikinci\n");
    await sirket.gorevGuncelle(g2.id, { durum: "inceleme" });
    const k2 = await denetimBekle(sirket.ortak.defter.gorevin(g2.id).at(-1)!.id);
    expect(k2.kalite).toMatchObject({ durum: "kaldi", kirmiziKayit: k.id });
    expect(depo.gorev(g2.id)?.durum).toBe("inceleme");
    expect(sirket.zeka.haberleriAl(mert.id).join("\n")).toContain("kaydından beri kırmızı");

    // Düzeltme geçince dal yeniden yeşil duyurulur
    await yaz(depo.ajan(deniz.id)!, "deger.txt", "duzeldi\n");
    await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
    expect((await denetimBekle(sirket.ortak.defter.gorevin(g.id).at(-1)!.id)).kalite.durum).toBe("gecti");
    expect(genel().some((m) => m.includes("testler yeniden geçiyor; main yeşil"))).toBe(true);
  }, 60_000);

  it("zaman aşımında süreç ağacı öldürülür; açılışta yarım kalan denetim sürer; test komutu yoksa 'testsiz'", async () => {
    const torun = path.join(gecici, "torun.txt");
    depo.projeGuncelle(pid, { testKomutu: `node uzun.cjs "${torun}"`, testZamanAsimiDk: 0.02 });
    const g = depo.gorevler(pid).find((x) => x.baslik === "Menü sayfası")!;
    casus();
    await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
    const k = await denetimBekle(sirket.ortak.defter.gorevin(g.id).at(-1)!.id);
    expect(k.kalite.durum).toBe("zaman_asimi");
    expect(k.kalite.cikti).toContain("uzun basladi");
    await bekle(3200);
    expect(fs.existsSync(torun)).toBe(false);

    // Uygulama test sırasında kapanmış gibi: kayıt "test" durumunda kalmış
    depo.projeGuncelle(pid, { testKomutu: "node kontrol.cjs", testZamanAsimiDk: 5 });
    const commit = (await git(repo, "rev-parse", "HEAD")).trim();
    const yarim = sirket.ortak.defter.ekle({
      id: kimlik(), projeId: pid, gorevId: null, gorevKodu: null, baslik: "Yarım kalan", ajanId: null, ajanAd: "ArnOrg", commit, dal: "main",
      dosyalar: [], eklenen: 0, silinen: 0, neden: "ara", zaman: simdi(), kalite: { ...bosKalite("test", "node kontrol.cjs"), baslangic: simdi() },
    });
    sirket.ortak.kalite.baslat();
    expect((await denetimBekle(yarim.id)).kalite.durum).toBe("gecti");

    depo.projeGuncelle(pid, { testKomutu: null });
    const deniz = ajan("Deniz");
    const g2 = await gorevAc("Testsiz iş", deniz);
    await yaz(depo.ajan(deniz.id)!, "src/testsiz.ts", "export {};\n");
    const kayit = await sirket.ortak.gorevKaydet(depo.gorev(g2.id)!, "ara");
    expect(kayit?.kalite.durum).toBe("testsiz");
  }, 60_000);
});

describe("ortak çalışma API'si", () => {
  let app: FastifyInstance;
  const anahtar = "ortak-anahtari-0123456789abcdef";
  let h: Record<string, string>;
  beforeAll(async () => {
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
    h = { host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` };
  });
  afterAll(async () => {
    await app.close();
  });

  it("durum, kaydın farkı, denetimi yeniden koşma; eski birleştirme ucu 410", async () => {
    const d = (await app.inject({ url: `/api/projeler/${pid}/ortak`, headers: h })).json();
    expect(d.tempo).toMatchObject({ ustSinir: YENI_UST_SINIR, belirleyen: "ceo" });
    expect(d.kayitlar.length).toBeGreaterThan(3);
    expect(d.kiralar.every((k: { yol: string }) => typeof k.yol === "string")).toBe(true);
    const ilk = d.kayitlar.find((k: GorevKaydi) => k.baslik.endsWith("Menü API'si")) as GorevKaydi;
    const fark = (await app.inject({ url: `/api/kayitlar/${ilk.id}/fark`, headers: h })).json();
    expect(fark.dosyalar.map((x: { yol: string; degisiklik: string }) => `${x.degisiklik} ${x.yol}`).sort()).toEqual(["A src/menu.ts", "D src/eski.ts"]);
    expect((await app.inject({ url: `/api/kayitlar/yok/fark`, headers: h })).statusCode).toBe(404);
    // Test komutu yokken yeniden denenemez; varken kuyruğa girer
    expect((await app.inject({ method: "POST", url: `/api/kayitlar/${ilk.id}/yeniden`, headers: h })).statusCode).toBe(409);
    depo.projeGuncelle(pid, { testKomutu: "node kontrol.cjs" });
    const yeniden = await app.inject({ method: "POST", url: `/api/kayitlar/${ilk.id}/yeniden`, headers: h });
    expect(yeniden.statusCode).toBe(200);
    expect((await denetimBekle(ilk.id)).kalite.durum).toBe("gecti");
    const eski = await app.inject({ method: "POST", url: `/api/onaylar/x/birlestir`, headers: h, payload: { testsiz: true } });
    expect(eski.statusCode).toBe(410);
    expect(eski.json().hata).toContain("ArnOrg 0.0.8'de birleştirme yok");
    depo.projeGuncelle(pid, { testKomutu: null });
  }, 40_000);
});

describe("yaşam döngüsü", () => {
  it("kira sahibi durdurulunca biter, devredilen görevle yeni sahibine geçer, sahibi uzun süre sessizse süresi dolar", async () => {
    const deniz = ajan("Deniz");
    const mert = ajan("Mert");
    const g = await gorevAc("Kira döngüsü", deniz);
    await yaz(depo.ajan(deniz.id)!, "src/dongu.ts", "1\n");
    await sirket.gorevGuncelle(g.id, { atananId: mert.id });
    expect(sirket.ortak.kiralar.sahibi(pid, "src/dongu.ts")?.ajanAd).toBe("Mert");
    sirket.ajanDurdur(mert.id);
    expect(sirket.ortak.kiralar.sahibi(pid, "src/dongu.ts")).toBeNull();

    await yaz(depo.ajan(deniz.id)!, "src/sessiz.ts", "1\n");
    depo.ajanGuncelle(deniz.id, { durum: "bosta" });
    expect(sirket.ortak.kiralariSupur(Date.now() + 5 * 60_000)).toBe(0);
    sirket.sonEtkinlik.set(deniz.id, 0);
    expect(sirket.ortak.kiralariSupur(Date.now() + KIRA_ZAMAN_ASIMI_MS + 60_000)).toBe(1);
    expect(sirket.ortak.kiralar.sahibi(pid, "src/sessiz.ts")).toBeNull();
    depo.gorevGuncelle(g.id, { durum: "iptal" });
  });

  it("not_yaz: notu başka bir çalışan düzenliyorsa beklenir", async () => {
    const deniz = ajan("Deniz");
    const elif = ajan("Elif");
    const g = await gorevAc("Karar notu", deniz);
    await yaz(depo.ajan(deniz.id)!, ".arnorg/notlar/kararlar/ADR-002-api.md", "# ADR-002\n");
    const r = await arac(elif.id, "not_yaz", { yol: "kararlar/ADR-002-api.md", icerik: "# Benim notum\n" });
    expect(r.hata).toBe(true);
    expect(r.metin).toContain("Deniz tarafından");
    expect((await arac(elif.id, "not_yaz", { yol: "kararlar/ADR-003-arayuz.md", icerik: "# ADR-003\n" })).hata).toBe(false);
    depo.gorevGuncelle(g.id, { durum: "iptal" });
    sirket.ortak.ajanDurdu(deniz.id);
  });

  it("araçlar ve talimat: birlestirme_iste yok; isi_kaydet, calisma_durumu herkese, ekip_temposu yalnız CEO'ya", () => {
    const adlar = (id: string) => (arnorgAracListesi(sirket, id) as unknown as Arac[]).map((a) => a.name);
    const calisan = adlar(ajan("Deniz").id);
    expect(calisan).toEqual(expect.arrayContaining(["isi_kaydet", "calisma_farki", "calisma_durumu"]));
    expect(calisan).not.toEqual(expect.arrayContaining(["birlestirme_iste"]));
    expect(calisan).not.toContain("calisma_dosyasi");
    expect(calisan).not.toContain("ekip_temposu");
    expect(adlar(ceo().id)).toContain("ekip_temposu");
    const ic = sirket as unknown as { talimatOlustur(a: Ajan, cwd: string): string };
    const t = ic.talimatOlustur(ajan("Deniz"), repo);
    expect(t).toContain(`Ortak proje: ${repo} (çalışma dalı main)`);
    expect(t).toContain("Düzenlediğin dosya görevin kaydedilene dek sana kiralanır");
    expect(t).not.toMatch(/birlestirme_iste|worktree'n|kendi çalışma dizinine/);
    const c = ic.talimatOlustur(ceo(), repo);
    expect(c).toContain("## Ortak çalışma ve ekip temposu");
    expect(c).toContain("ekip_temposu ile sen karar verirsin (kurulun üst sınırı: 8");
    expect(c).not.toContain("birlestirme_iste");
  });
});

describe("ekip temposu", () => {
  it("CEO ekip_temposu ile aynı anda kaç çalışanın çalışacağını belirler; üst sınırı geçemez; kurul kipinde kurulun ayarı geçerli", async () => {
    const yuksek = await arac(ceo().id, "ekip_temposu", { es_zamanli: 12, gerekce: "Bağımsız iş çok" });
    expect(yuksek.metin).toContain("Ekip temposu 8 oldu (kurulun üst sınırı 8; daha fazlası için kurula sor)");
    const r = await arac(ceo().id, "ekip_temposu", { es_zamanli: 2, gerekce: "İşler aynı dosyalarda" });
    expect(r.metin).toMatch(/^Ekip temposu 2 oldu \(kurulun üst sınırı 8\)/);
    expect(genel().at(-1)).toBe("Ada (CEO) ekip temposunu 2 kişi yaptı (kurulun üst sınırı 8): İşler aynı dosyalarda");
    expect(gelenler.filter((o) => o.tur === "tempo.guncellendi").at(-1)).toMatchObject({ tempo: { secim: 2, gecerli: 2, ustSinir: 8, belirleyen: "ceo" } });
    expect(sirket.ortak.tempo(pid)).toMatchObject({ secim: 2, gerekce: "İşler aynı dosyalarda" });

    // İki çalışan çalışırken üçüncüsü sıraya girer; CEO tempoya sayılmaz; başka projenin çalışanı etkilenmez
    const [d, e, m] = ["Deniz", "Elif", "Mert"].map((ad) => ajan(ad));
    depo.ajanGuncelle(d!.id, { durum: "calisiyor" });
    depo.ajanGuncelle(e!.id, { durum: "calisiyor" });
    expect(sirket.esZamanlilik.siraGerekli(false, m!.id)).toBe(true);
    expect(sirket.esZamanlilik.siraGerekli(false, ceo().id)).toBe(false);
    const p2 = await sirket.projeOlustur({ ad: "Ikinci", yol: path.join(gecici, "ikinci"), olustur: true });
    const zeynep = sirket.iseAl(p2.id, { ad: "Zeynep", rol: "backend" });
    expect(sirket.esZamanlilik.siraGerekli(false, zeynep.id)).toBe(false);
    expect(sirket.ortak.tempo(pid)).toMatchObject({ calisan: 2 });

    // Kurul kipinde temposu kurulun ayarıdır; CEO'nun aracı reddeder
    await sirket.projeGuncelle(pid, { kararVeren: "kurul" });
    expect(sirket.ortak.tempo(pid)).toMatchObject({ belirleyen: "kurul", gecerli: 8 });
    expect(sirket.esZamanlilik.siraGerekli(false, m!.id)).toBe(false);
    const kurulda = await arac(ceo().id, "ekip_temposu", { es_zamanli: 3, gerekce: "Deneme yazısı" });
    expect(kurulda).toMatchObject({ hata: true });
    expect(kurulda.metin).toContain("kurul Ayarlar'dan belirler");
    await sirket.projeGuncelle(pid, { kararVeren: "ceo" });
    depo.ajanGuncelle(d!.id, { durum: "bosta" });
    depo.ajanGuncelle(e!.id, { durum: "bosta" });
  });

  it("0.0.7'nin varsayılan üst sınırı (3) açılışta bir kez 8'e çıkar", () => {
    const dizin = path.join(gecici, "eski-veri");
    fs.mkdirSync(dizin, { recursive: true });
    fs.writeFileSync(path.join(dizin, "ayarlar.json"), JSON.stringify({ esZamanliAjan: 3, dil: "tr" }));
    const yap = new Yapilandirma(dizin);
    const d = new Depo(path.join(dizin, "arnorg.db"));
    const s = new Sirket(d, new OlayYolu(), yap, () => null, true);
    try {
      expect(yap.ayarlar.esZamanliAjan).toBe(8);
      // Kurul sonra 3 seçerse yeniden açılışta dokunulmaz
      yap.guncelle({ esZamanliAjan: 3 });
      const s2 = new Sirket(d, new OlayYolu(), yap, () => null, true);
      expect(yap.ayarlar.esZamanliAjan).toBe(3);
      s2.kapat();
    } finally {
      s.kapat();
      d.kapat();
    }
  });
});

describe("iş dağıtımı", () => {
  it("rol uyumu: etiket, metindeki işaretler; işaretsiz işi yalnız geliştiriciler alır", () => {
    const g = (baslik: string, etiket = "", aciklama = "") => ({ baslik, aciklama, etiket });
    expect(rolUyumu(g("Menü API uç noktaları"), "backend")).toBeGreaterThan(0);
    expect(rolUyumu(g("Menü API uç noktaları"), "frontend")).toBe(0);
    expect(rolUyumu(g("Yönetim sayfası arayüzü"), "frontend")).toBeGreaterThan(0);
    expect(rolUyumu(g("Yönetim sayfası arayüzü"), "fullstack")).toBeGreaterThan(0);
    expect(rolUyumu(g("Herhangi bir iş", "test"), "test")).toBeGreaterThan(0);
    expect(rolUyumu(g("README yaz"), "yazar")).toBeGreaterThan(0);
    expect(rolUyumu(g("Fiyat hesaplama"), "backend")).toBe(1);
    expect(rolUyumu(g("Fiyat hesaplama"), "yazar")).toBe(0);
    expect(rolUyumu(g("Menü API"), "cto")).toBe(0);
  });

  it("boşa çıkana önce kendi planlı işi, yoksa rolüne uyan atanmamış iş başlar; bağımlılık ve tempo gözetilir; CEO'ya haber gider", async () => {
    const p = await sirket.projeOlustur({ ad: "Dagitim", yol: path.join(gecici, "dagitim"), olustur: true });
    const ali = sirket.iseAl(p.id, { ad: "Ali", rol: "backend" });
    const ayse = sirket.iseAl(p.id, { ad: "Ayse", rol: "frontend" });
    const yazar = sirket.iseAl(p.id, { ad: "Nil", rol: "yazar" });
    const t = (baslik: string, ek: { atananId?: string; etiket?: string; bagimliliklar?: string[]; durum?: "planlandi" | "bekleyen" } = {}) =>
      sirket.gorevOlustur(p.id, { baslik, durum: ek.atananId ? "planlandi" : "bekleyen", ...ek });
    const bitmemis = t("Veritabanı şeması", { etiket: "backend" });
    const kendi = t("Sipariş API'si", { atananId: ali.id });
    t("Ödeme ekranı", { bagimliliklar: [bitmemis.kod], etiket: "frontend" });
    const arayuz = t("Yönetim sayfası arayüzü", { etiket: "frontend" });
    t("Mimari karar", {});
    const mesaj = vi.spyOn(sirket, "ajanaMesaj").mockResolvedValue(undefined);
    sirket.ortak.isDagitimi = true;
    try {
      const baslayan = await sirket.ortak.isDagit(p.id);
      expect(baslayan.sort()).toEqual([kendi.kod, arayuz.kod].sort());
      expect(depo.gorev(kendi.id)).toMatchObject({ durum: "calisiliyor", atananId: ali.id });
      expect(depo.gorev(arayuz.id)).toMatchObject({ durum: "calisiliyor", atananId: ayse.id });
      expect(mesaj.mock.calls.map(([id]) => id).sort()).toEqual([ali.id, ayse.id].sort());
      // Yazar'a uyan iş yok; bağımlılığı bitmemiş iş başlamaz
      expect(depo.gorevler(p.id).filter((g) => g.atananId === yazar.id)).toEqual([]);
      const haber = sirket.zeka.haberleriAl(ceo(p.id).id).join("\n");
      expect(haber).toContain(`Ali boşa çıktı; ArnOrg planlı işini başlattı: ${kendi.kod}`);
      expect(haber).toContain(`Ayse boşa çıktı; ArnOrg rolüne uyan atanmamış işi başlattı: ${arayuz.kod}`);
      // Görevi süren çalışana yeni iş verilmez
      expect(await sirket.ortak.isDagit(p.id)).toEqual([]);

      // Tempo doluyken başlatılmaz
      depo.degerYaz(`ekip-temposu:${p.id}`, JSON.stringify({ esZamanli: 1, gerekce: "tek", zaman: simdi(), ceo: "Ada" }));
      depo.gorevGuncelle(kendi.id, { durum: "inceleme" });
      depo.ajanGuncelle(ayse.id, { durum: "calisiyor" });
      t("İkinci API", { atananId: ali.id });
      expect(await sirket.ortak.isDagit(p.id)).toEqual([]);
      depo.ajanGuncelle(ayse.id, { durum: "bosta" });
      expect(siradakiIs(ali, depo.gorevler(p.id))?.baslik).toBe("İkinci API");
    } finally {
      sirket.ortak.isDagitimi = false;
    }
  });
});

describe("kurulun durdurması ve işsiz çalışanlar", () => {
  it("Mesaiyi durdur ve Durdur'dan sonra ArnOrg iş başlatmaz; kurul yazınca ya da başlatınca sürer; durdurma kalıcıdır", async () => {
    const p = await sirket.projeOlustur({ ad: "Durdurma", yol: path.join(gecici, "durdurma"), olustur: true });
    const ali = sirket.iseAl(p.id, { ad: "Ali", rol: "backend" });
    const ayse = sirket.iseAl(p.id, { ad: "Ayse", rol: "frontend" });
    const g1 = sirket.gorevOlustur(p.id, { baslik: "Sipariş API'si", atananId: ali.id, durum: "planlandi" });
    const mesaj = vi.spyOn(sirket, "ajanaMesaj").mockResolvedValue(undefined);
    sirket.ortak.isDagitimi = true;
    try {
      // Mesaiyi durdur: boşa çıkan çalışana iş başlamaz, durdurma veri dizininde saklanır
      sirket.tumunuDurdur(p.id);
      expect(sirket.mesaiDurduMu(p.id)).toBe(true);
      expect(sirket.kurulDurdurduMu(ali.id)).toBe(true);
      expect(await sirket.ortak.isDagit(p.id)).toEqual([]);
      expect(depo.gorev(g1.id)?.durum).toBe("planlandi");
      expect(JSON.parse(depo.deger("kurul-durdurdu") ?? "{}").projeler).toContain(p.id);

      // Kurul CEO'ya yazdı: mesai sürer, planlı iş başlar
      await sirket.mesajGonder(p.id, "yonetim", KURUL, "Devam edin, plana göre ilerleyin.");
      expect(sirket.mesaiDurduMu(p.id)).toBe(false);
      expect(await sirket.ortak.isDagit(p.id)).toEqual([g1.kod]);
      expect(depo.gorev(g1.id)).toMatchObject({ durum: "calisiliyor", atananId: ali.id });

      // Durdur (tek çalışan): ona yeni iş başlamaz; anmasız bir kurul mesajı onu sürdürmez
      sirket.ajanDurdur(ayse.id);
      const g2 = sirket.gorevOlustur(p.id, { baslik: "Yönetim sayfası arayüzü", atananId: ayse.id, durum: "planlandi" });
      expect(await sirket.ortak.isDagit(p.id)).toEqual([]);
      await sirket.mesajGonder(p.id, "genel", KURUL, "Herkese kolay gelsin.");
      expect(sirket.kurulDurdurduMu(ayse.id)).toBe(true);
      expect(await sirket.ortak.isDagit(p.id)).toEqual([]);
      // Kurul onu başlattı: sürer
      await sirket.ajanBaslat(ayse.id);
      expect(sirket.kurulDurdurduMu(ayse.id)).toBe(false);
      expect(await sirket.ortak.isDagit(p.id)).toEqual([g2.kod]);
      expect(mesaj).toHaveBeenCalled();
    } finally {
      sirket.ortak.isDagitimi = false;
    }
  });

  it("yapacak işi olmayan boştaki çalışanlar CEO'ya bir kez ve toplu söylenir; iş alıp yeniden boşa çıkan yine söylenir", async () => {
    const p = await sirket.projeOlustur({ ad: "Issiz", yol: path.join(gecici, "issiz"), olustur: true });
    const ali = sirket.iseAl(p.id, { ad: "Ali", rol: "backend" });
    sirket.iseAl(p.id, { ad: "Nil", rol: "yazar" });
    sirket.iseAl(p.id, { ad: "Cem", rol: "cto" });
    const patron = ceo(p.id);
    const { mesajlar } = casus();
    sirket.ortak.isDagitimi = true;
    try {
      // CTO'nun boşta olması olağandır; CEO boşta: uyandırılır
      expect(await sirket.ortak.issizleriBildir(p.id)).toEqual(["Ali", "Nil"]);
      const not = mesajlar(patron.id).at(-1) ?? "";
      expect(not).toContain("Boşta ve yapacak işi olmayan çalışanlar: Ali (");
      expect(not).toContain("Nil (");
      expect(not).not.toContain("Cem");
      // Aynı kişiler için yinelenmez
      expect(await sirket.ortak.issizleriBildir(p.id)).toEqual([]);

      // Ali'ye iş verildi: işsiz değil; iş bitip yeniden boşa çıkınca yine söylenir. CEO çalışıyorsa haber olarak
      const g = sirket.gorevOlustur(p.id, { baslik: "Sipariş API'si", atananId: ali.id, durum: "planlandi" });
      expect(sirket.ortak.issizler(p.id).map((a) => a.ad)).toEqual(["Nil"]);
      expect(await sirket.ortak.issizleriBildir(p.id)).toEqual([]);
      depo.gorevGuncelle(g.id, { durum: "tamam" });
      depo.ajanGuncelle(patron.id, { durum: "calisiyor" });
      expect(await sirket.ortak.issizleriBildir(p.id)).toEqual(["Ali", "Nil"]);
      expect(sirket.zeka.haberleriAl(patron.id).join("\n")).toContain("Boşta ve yapacak işi olmayan çalışanlar: Ali (");

      // Mesai durduysa söylenmez
      depo.ajanGuncelle(patron.id, { durum: "bosta" });
      depo.ajanGuncelle(ali.id, { durum: "calisiyor" });
      expect(await sirket.ortak.issizleriBildir(p.id)).toEqual([]);
      depo.ajanGuncelle(ali.id, { durum: "bosta" });
      sirket.tumunuDurdur(p.id);
      expect(await sirket.ortak.issizleriBildir(p.id)).toEqual([]);
      expect(sirket.ortak.issizler(p.id)).toEqual([]);
      sirket.kurulDevamEtti(p.id);
    } finally {
      sirket.ortak.isDagitimi = false;
    }
  });

  it("kurulun durdurduğu çalışanın testten geçmeyen kaydı onu uyandırmaz, haber olarak bekler", async () => {
    depo.projeGuncelle(pid, { testKomutu: "node kontrol.cjs", testZamanAsimiDk: 5 });
    const deniz = ajan("Deniz");
    const g = await gorevAc("Durdurulmuşken boz", deniz);
    const { mesajlar } = casus();
    try {
      // Dal yeşil başlasın: kırılma bu kayda yazılsın
      await yaz(depo.ajan(deniz.id)!, "deger.txt", "yesil\n");
      await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara");
      expect((await denetimBekle(sirket.ortak.defter.gorevin(g.id).at(-1)!.id)).kalite.durum).toBe("gecti");
      await yaz(depo.ajan(deniz.id)!, "deger.txt", "BOZUK\n");
      await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
      sirket.ajanDurdur(deniz.id);
      const k = await denetimBekle(sirket.ortak.defter.gorevin(g.id).at(-1)!.id);
      expect(k.kalite).toMatchObject({ durum: "kaldi", kirmiziKayit: null });
      expect(depo.gorev(g.id)?.durum).toBe("calisiliyor");
      expect(mesajlar(deniz.id).filter((m) => m.includes("testler geçmedi"))).toEqual([]);
      expect(sirket.zeka.haberleriAl(deniz.id).join("\n")).toContain(`${g.kod} "Durdurulmuşken boz" kaydından sonra testler geçmedi`);
    } finally {
      sirket.kurulDevamEtti(pid, [deniz.id]);
      // Dal yeniden yeşil, görev kapalı: sonraki testler etkilenmesin
      await yaz(depo.ajan(deniz.id)!, "deger.txt", "duzeldi\n");
      await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara");
      await denetimBekle(sirket.ortak.defter.gorevin(g.id).at(-1)!.id);
      await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
      await sirket.gorevGuncelle(g.id, { durum: "tamam" });
      depo.projeGuncelle(pid, { testKomutu: null });
    }
  }, 60_000);
});

describe("kenar durumları", () => {
  it("yeniden adlandırma: mv'nin iki ucu kiralanır, kayıt ikisini commit'ler; başkasının dosyasını ya da klasörünü taşıyan, joker ile düzenleyen reddedilir", async () => {
    const deniz = ajan("Deniz");
    const elif = ajan("Elif");
    casus();
    const g = await gorevAc("Adlandırma", deniz);
    await yaz(depo.ajan(deniz.id)!, "lib/eski-ad.ts", "export const x = 1;\n");
    await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara");
    expect(reddedildi(await komut(deniz, "mv lib/eski-ad.ts lib/yeni-ad.ts"))).toBe(false);
    fs.renameSync(path.join(repo, "lib", "eski-ad.ts"), path.join(repo, "lib", "yeni-ad.ts"));
    expect(sirket.ortak.kiralar.liste(pid).filter((k) => k.ajanAd === "Deniz").map((k) => k.yol)).toEqual(["lib/eski-ad.ts", "lib/yeni-ad.ts"]);
    // Elif ne dosyayı ne içinde bulunduğu klasörü taşıyabilir; joker de kiradaki dosyaya açılır
    expect(neden(await komut(elif, "mv lib/yeni-ad.ts lib/baska.ts"))).toContain("lib/yeni-ad.ts şu an Deniz tarafından");
    expect(neden(await komut(elif, "mv lib arsiv"))).toContain("Deniz tarafından");
    expect(reddedildi(await komut(elif, "sed -i 's/x/y/' lib/*.ts"))).toBe(true);
    expect(reddedildi(await komut(elif, "rm -r lib"))).toBe(true);
    const k = await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara");
    expect(k?.dosyalar.slice().sort()).toEqual(["lib/eski-ad.ts", "lib/yeni-ad.ts"]);
    expect((await git(repo, "show", "--name-status", "--no-renames", "--format=", "HEAD")).trim().split("\n").sort()).toEqual(["A\tlib/yeni-ad.ts", "D\tlib/eski-ad.ts"]);
    depo.gorevGuncelle(g.id, { durum: "iptal" });
  });

  it("proje dışına yazma ve proje dışındaki git kiralanmaz, ortak kurallara takılmaz", async () => {
    const elif = ajan("Elif");
    const disari = path.join(gecici, "disari", "not.txt");
    const r = await sirket.kapi(elif.id, "Write", { file_path: disari, content: "x" });
    expect(neden(r)).not.toMatch(/kiral|Ortak projede/);
    expect(sirket.ortak.kapidan(depo.ajan(elif.id)!, "Bash", { command: `echo x > "${disari}" && git -C "${path.dirname(disari)}" init -q && git -C "${path.dirname(disari)}" add -A` }, repo)).toBeNull();
    expect(sirket.ortak.kiralar.liste(pid).some((k) => k.yol.includes("disari") || k.yol.startsWith(".."))).toBe(false);
  });

  it("aynı anda gelen altı görev kaydı, ArnOrg commit'i ve dışarıdan tutulan index.lock: her commit yalnız kendi dosyalarını taşır", async () => {
    const p = await sirket.projeOlustur({ ad: "Paralel", yol: path.join(gecici, "paralel"), olustur: true });
    const kok = p.yol;
    const ekip = Array.from({ length: 6 }, (_, i) => sirket.iseAl(p.id, { ad: `Calisan${i + 1}`, rol: "backend" }));
    const gorevler = ekip.map((a, i) => sirket.gorevOlustur(p.id, { baslik: `Paralel iş ${i + 1}`, atananId: a.id }));
    casus();
    for (const g of gorevler) await sirket.gorevGuncelle(g.id, { durum: "calisiliyor" });
    for (const [i, a] of ekip.entries()) {
      for (const d of ["a", "b", "c"]) {
        const tam = path.join(kok, `modul${i + 1}`, `${d}.ts`);
        await sirket.kapi(a.id, "Write", { file_path: tam, content: d });
        fs.mkdirSync(path.dirname(tam), { recursive: true });
        fs.writeFileSync(tam, `export const ${d} = ${i};\n`);
      }
    }
    // ArnOrg'un kendi kaydı (.arnorg) ve kısa süre kilidi tutan başka bir git süreci
    fs.writeFileSync(path.join(kok, ".arnorg", "notlar", "paralel.md"), "# Paralel\n");
    const kilit = path.join(kok, ".git", "index.lock");
    fs.writeFileSync(kilit, "");
    setTimeout(() => fs.rmSync(kilit, { force: true }), 700);
    const sonuc = await Promise.all([...gorevler.map((g) => sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara")), sirket.arnorgCommitle(p.id)]);
    const kayitlar = sonuc.slice(0, 6) as (GorevKaydi | null)[];
    expect(sonuc[6]).toBe(true);
    for (const [i, k] of kayitlar.entries()) {
      expect(k?.dosyalar).toEqual([`modul${i + 1}/a.ts`, `modul${i + 1}/b.ts`, `modul${i + 1}/c.ts`]);
      const dosyalar = (await git(kok, "show", "--name-only", "--format=", k!.commit)).trim().split("\n");
      expect(dosyalar).toEqual(k!.dosyalar);
      expect((await git(kok, "log", "-1", "--format=%s", k!.commit)).trim()).toBe(`${gorevler[i]!.kod} Paralel iş ${i + 1}`);
    }
    expect((await git(kok, "log", "--format=%s", "-7")).split("\n").filter((x) => x.startsWith("ArnOrg: ekip, hafıza ve not kayıtları"))).toHaveLength(1);
    expect((await git(kok, "status", "--porcelain")).trim()).toBe("");
    expect(sirket.ortak.kiralar.liste(p.id)).toEqual([]);
  }, 30_000);

  it("çökmüş bir git sürecinden kalan eski index.lock kaldırılır ve kurula söylenir; taze kilit beklenir", async () => {
    const deniz = ajan("Deniz");
    casus();
    const g = await gorevAc("Kilit", deniz);
    await yaz(depo.ajan(deniz.id)!, "kilit.ts", "1\n");
    const kilit = path.join(repo, ".git", "index.lock");
    fs.writeFileSync(kilit, "");
    const eski = new Date(Date.now() - 20 * 60_000);
    fs.utimesSync(kilit, eski, eski);
    const once = gelenler.length;
    const k = await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara");
    expect(k?.dosyalar).toEqual(["kilit.ts"]);
    expect(fs.existsSync(kilit)).toBe(false);
    expect(gelenler.slice(once).some((o) => o.tur === "bildirim" && o.metin.includes(".git/index.lock, 20 dk"))).toBe(true);
    depo.gorevGuncelle(g.id, { durum: "iptal" });
  });

  it("iz penceresi: başka bir çalışanın daha önce başlayan komutunun değiştirdiği dosya, ondan sonra başlayan komutun sahibine yazılmaz", async () => {
    const deniz = ajan("Deniz");
    const elif = ajan("Elif");
    // Önceki testlerde kapıdan geçip araç sonrası gelmeyen komutların pencereleri kapanır
    sirket.ortak.ajanDurdu(deniz.id);
    sirket.ortak.ajanDurdu(elif.id);
    const gd = await gorevAc("Lint", deniz);
    const ge = await gorevAc("Üretici", elif);
    await sirket.ortak.izAl(pid, deniz.id);
    // Elif'in üreticisi başlar ve dosya yazar; Deniz'in komutu sonra başlar, önce biter
    await komut(elif, "node uret.js");
    fs.mkdirSync(path.join(repo, "uretilen"), { recursive: true });
    fs.writeFileSync(path.join(repo, "uretilen", "tip.ts"), "export type T = 1;\n");
    await bekle(2300);
    await komut(deniz, "npm run lint");
    sirket.ortak.aracSonrasi(depo.ajan(deniz.id)!, "Bash", { command: "npm run lint" }, repo);
    await sirket.ortak.izlerBitsin(pid);
    expect(sirket.ortak.kiralar.sahibi(pid, "uretilen/tip.ts")).toBeNull();
    sirket.ortak.aracSonrasi(depo.ajan(elif.id)!, "Bash", { command: "node uret.js" }, repo);
    await sirket.ortak.izlerBitsin(pid);
    expect(sirket.ortak.kiralar.sahibi(pid, "uretilen/tip.ts")).toMatchObject({ ajanAd: "Elif", gorevKodu: ge.kod, kaynak: "iz" });
    depo.gorevGuncelle(gd.id, { durum: "iptal" });
    sirket.ortak.ajanDurdu(elif.id);
    depo.gorevGuncelle(ge.id, { durum: "iptal" });
  }, 20_000);

  it("kayıt yapılamazsa inceleyiciye değişiklik yok denmez: hata ve kiranın sürdüğü söylenir", async () => {
    const mert = ajan("Mert");
    const { mesajlar } = casus();
    const g = await gorevAc("Kaydedilemeyen", mert);
    await yaz(depo.ajan(mert.id)!, "kaydedilemeyen.ts", "1\n");
    await git(repo, "checkout", "-q", "-b", "baska-dal");
    try {
      await sirket.gorevGuncelle(g.id, { durum: "inceleme" });
    } finally {
      await git(repo, "checkout", "-q", "main");
    }
    const cagri = mesajlar(ceo().id).find((m) => m.includes(`${g.kod} "Kaydedilemeyen" incelemeye hazır`)) ?? "";
    expect(cagri).toContain("Kaydedilemedi (Ana repo main dalında değil (baska-dal)");
    expect(cagri).toContain("dosyalar Mert adına kiralı kaldı");
    expect(sirket.ortak.kiralar.sahibi(pid, "kaydedilemeyen.ts")?.ajanAd).toBe("Mert");
    // Dal düzelince bir sonraki kayıt dosyaları alır
    expect((await sirket.ortak.gorevKaydet(depo.gorev(g.id)!, "ara"))?.dosyalar).toEqual(["kaydedilemeyen.ts"]);
    depo.gorevGuncelle(g.id, { durum: "iptal" });
  });
});

describe("0.0.8 geçişi", () => {
  it("eski worktree ve dallar ortak projeye alınır; kirli ve çakışan korunur; CEO'ya ve #genel'e bir kez söylenir", async () => {
    const p = await sirket.projeOlustur({ ad: "Gecis", yol: path.join(gecici, "gecis"), olustur: true });
    const r = p.yol;
    fs.writeFileSync(path.join(r, "ortak.txt"), "satır\n");
    fs.writeFileSync(path.join(r, ".gitignore"), ".env.local\nnode_modules/\n*.log\n");
    await git(r, "add", "-A");
    await git(r, "commit", "-q", "-m", "Ortak");
    const alan = (ad: string) => path.join(gecici, "eski-alanlar", ad);
    const eski = async (ad: string, dosyalar: Record<string, string> | null) => {
      const a = sirket.iseAl(p.id, { ad, rol: "backend" });
      const dal = `arnorg/${ad.toLowerCase()}`;
      await gitIslemleri.worktreeAc(r, alan(ad), dal, "main");
      if (dosyalar) {
        for (const [y, icerik] of Object.entries(dosyalar)) fs.writeFileSync(path.join(alan(ad), y), icerik);
        await git(alan(ad), "add", "-A");
        await git(alan(ad), "commit", "-q", "-m", `${ad} işi`);
      }
      depo.ajanGuncelle(a.id, { calismaAlani: alan(ad), dal, oturumId: `oturum-${ad}` });
      return { a, dal };
    };
    const ali = await eski("Ali", null);
    const berk = await eski("Berk", { "berk.txt": "berk\n" });
    const can = await eski("Can", { "can.txt": "can\n" });
    fs.writeFileSync(path.join(alan("Can"), "yarim.txt"), "yarım\n");
    const duru = await eski("Duru", { "ortak.txt": "duru\n" });
    // Temiz alanlar: birinde yeniden üretilemeyen yok sayılan dosya (.env.local) var, ötekinde yalnız üretilenler
    const ece = await eski("Ece", null);
    fs.writeFileSync(path.join(alan("Ece"), ".env.local"), "GIZLI=1\n");
    const firat = await eski("Firat", null);
    fs.mkdirSync(path.join(alan("Firat"), "node_modules", "paket"), { recursive: true });
    fs.writeFileSync(path.join(alan("Firat"), "node_modules", "paket", "index.js"), "1\n");
    fs.writeFileSync(path.join(alan("Firat"), "hata.log"), "x\n");
    // Ana dal ilerler: Duru'nun dalı artık çakışır
    fs.writeFileSync(path.join(r, "ortak.txt"), "ana\n");
    await git(r, "commit", "-q", "-am", "Ana dalda değişiklik");
    const bekleyen = (ajanId: string, dal: string) => sirket.teklifAc(depo.ajan(ajanId)!, "birlestirme", `${dal} → main`, "Özet", { ajanId, dal, ozet: "Özet", isteyenId: ajanId });
    const oBerk = bekleyen(berk.a.id, berk.dal);
    const oDuru = bekleyen(duru.a.id, duru.dal);
    // Açılışta eski onaylar zaten CEO'ya iletilmiştir; sayılan yalnız geçişin mesajı
    await sirket.onayIslendi(oBerk.id);
    await sirket.onayIslendi(oDuru.id);
    const { mesajlar } = casus();

    const sonuc = (await sirket.ortak.gecis()).find((s) => s.projeId === p.id)!;
    expect(sonuc.alinan).toEqual([{ ajanAd: "Berk", dal: berk.dal, commit: 1 }]);
    expect(sonuc.kaldirilan).toBe(3);
    expect(sonuc.kalanlar.map((k) => [k.ajanAd, k.neden, k.dal, k.yol])).toEqual([
      ["Can", "kirli", can.dal, alan("Can")],
      ["Duru", "cakisma", duru.dal, alan("Duru")],
      ["Ece", "kirli", ece.dal, alan("Ece")],
    ]);
    expect(sonuc.kalanlar[1]!.ayrinti).toContain("ortak.txt");
    expect(sonuc.kalanlar[2]!.ayrinti).toContain("git'in yok saydığı 1 dosya (.env.local) worktree'yle silinirdi");
    expect(fs.readFileSync(path.join(alan("Ece"), ".env.local"), "utf8")).toBe("GIZLI=1\n");
    expect(fs.existsSync(alan("Firat"))).toBe(false);
    expect(await gitIslemleri.dalVarMi(r, firat.dal)).toBe(false);
    // Berk'in işi çalışma dalında; çakışan birleştirme yarım kalmadı
    expect(fs.readFileSync(path.join(r, "berk.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("berk\n");
    expect(fs.readFileSync(path.join(r, "ortak.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("ana\n");
    expect((await git(r, "rev-parse", "-q", "--verify", "MERGE_HEAD").catch(() => "")).trim()).toBe("");
    expect((await git(r, "status", "--porcelain", "--untracked-files=no")).trim()).toBe("");
    // Temiz alanlar ve birleşmiş dallar kaldırıldı; korunanlar duruyor
    expect(fs.existsSync(alan("Ali"))).toBe(false);
    expect(fs.existsSync(alan("Berk"))).toBe(false);
    expect(await gitIslemleri.dalVarMi(r, ali.dal)).toBe(false);
    expect(await gitIslemleri.dalVarMi(r, berk.dal)).toBe(false);
    expect(fs.readFileSync(path.join(alan("Can"), "yarim.txt"), "utf8")).toBe("yarım\n");
    expect(fs.existsSync(alan("Duru"))).toBe(true);
    expect(await gitIslemleri.dalVarMi(r, duru.dal)).toBe(true);
    // Çalışanlar ortak projede; worktree'de açılan konuşma sürdürülmez
    for (const ad of ["Ali", "Berk", "Can", "Duru", "Ece", "Firat"]) expect(depo.ajanAdla(p.id, ad)).toMatchObject({ calismaAlani: null, dal: null, oturumId: null });
    // Eski alanı korunanlara kendi işlerinin yeri söylenir
    expect(sirket.zeka.haberleriAl(can.a.id).join("\n")).toContain(`eski çalışma alanın ${alan("Can")} (${can.dal}) korunuyor`);
    expect(sirket.zeka.haberleriAl(ali.a.id).join("\n")).not.toContain("eski çalışma alanın");
    // Eski birleştirme onayları kapandı
    expect(depo.onay(oBerk.id)).toMatchObject({ durum: "onaylandi", not: "ArnOrg 0.0.8: birleştirme onayı kalktı; dal ortak projeye alındı.", kararKaynagi: "otomatik", kararVerenAd: "ArnOrg" });
    expect(depo.onay(oDuru.id)).toMatchObject({ durum: "reddedildi" });
    // #genel ve CEO'ya bir kez
    const duyuru = genel(p.id).filter((m) => m.startsWith("ArnOrg 0.0.8:"));
    expect(duyuru).toHaveLength(1);
    expect(duyuru[0]).toContain(`Ortak projeye alınan dallar: ${berk.dal} (Berk).`);
    expect(duyuru[0]).toContain(`- Can · ${can.dal} · ${alan("Can")} (1 commit'lenmemiş değişiklik)`);
    expect(duyuru[0]).toContain(`- Duru · ${duru.dal} · ${alan("Duru")}`);
    expect(duyuru[0]).toContain(`- Ece · ${ece.dal} · ${alan("Ece")}`);
    expect(mesajlar(ceo(p.id).id)).toHaveLength(1);
    expect(mesajlar(ceo(p.id).id)[0]).toContain("birlestirme_iste artık yok");
    expect(sirket.ortak.durum(p.id).kalanlar).toHaveLength(3);
    await sirket.ortak.gecis();
    expect(genel(p.id).filter((m) => m.startsWith("ArnOrg 0.0.8:"))).toHaveLength(1);
    expect(mesajlar(ceo(p.id).id)).toHaveLength(1);
  }, 40_000);
});
