// Kurulum: ayrıştırıcılar, sahte claude ve gh ile giriş akışları, dizin gezgini, GitHub yardımcıları
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { KurulumIslemi, SunucuOlayi } from "@arnorg/ortak";
import { githubDeposu } from "./depo.js";
import { dizinListesi, dizinOlustur } from "./dizinler.js";
import { depoAdiYap, depoCevir, klasorAdiYap } from "./github.js";
import { ansiAyikla, claudeGirisiniYorumla, ghCihazKodu, ghKullanicisi, ghPaketAdi, Kurulum } from "./kurulum.js";
import { OlayYolu } from "./olaylar.js";
import { Yapilandirma } from "./yapilandirma.js";

const windows = process.platform === "win32";
let gecici: string;

beforeAll(() => {
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-kurulum-"));
});

afterAll(() => {
  fs.rmSync(gecici, { recursive: true, force: true });
});

describe("ayrıştırıcılar", () => {
  it("renk ve OSC 8 bağlantı kodlarını ayıklar", () => {
    const ham = "If the browser didn't open, visit: \u001b]8;;https://ornek.com/a?b=1\u0007\u001b[94mhttps://ornek.com/a?b=1\u001b[39m\u001b]8;;\u0007\r\nPaste code here if prompted > ";
    expect(ansiAyikla(ham)).toBe("If the browser didn't open, visit: https://ornek.com/a?b=1\nPaste code here if prompted > ");
  });

  it("Claude giriş durumunu yorumlar: abonelik claude.ai ya da abonelik jetonu", () => {
    expect(claudeGirisiniYorumla('{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","email":"a@b.c"}')).toMatchObject({ girisYapildi: true, abonelik: true, eposta: "a@b.c" });
    expect(claudeGirisiniYorumla('{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}').abonelik).toBe(true);
    expect(claudeGirisiniYorumla('{"loggedIn":true,"authMethod":"api_key","apiProvider":"firstParty"}')).toMatchObject({ girisYapildi: true, abonelik: false });
    expect(claudeGirisiniYorumla('{"loggedIn":true,"authMethod":"third_party","apiProvider":"bedrock"}').abonelik).toBe(false);
    expect(claudeGirisiniYorumla('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}')).toMatchObject({ girisYapildi: false, girisYontemi: null });
    expect(claudeGirisiniYorumla("bozuk").hata).toBeTruthy();
  });

  it("gh paket adı, cihaz kodu ve kullanıcı adı", () => {
    expect(ghPaketAdi("2.89.0", "linux", "x64")).toEqual({ ad: "gh_2.89.0_linux_amd64.tar.gz", zip: false });
    expect(ghPaketAdi("2.89.0", "darwin", "arm64")).toEqual({ ad: "gh_2.89.0_macOS_arm64.zip", zip: true });
    expect(ghPaketAdi("2.89.0", "win32", "x64")).toEqual({ ad: "gh_2.89.0_windows_amd64.zip", zip: true });
    expect(ghPaketAdi("2.89.0", "linux", "ia32")).toBeNull();
    expect(ghCihazKodu("! First copy your one-time code: AB12-CD34\nOpen this URL to continue in your web browser: https://github.com/login/device")).toEqual({ kod: "AB12-CD34", adres: "https://github.com/login/device" });
    expect(ghCihazKodu("! One-time code (WXYZ-9876) copied to clipboard").kod).toBe("WXYZ-9876");
    expect(ghKullanicisi("  ✓ Logged in to github.com account furkan-y (keyring)")).toBe("furkan-y");
    expect(ghKullanicisi("✓ Logged in to github.com as eski-bicim (oauth_token)")).toBe("eski-bicim");
  });

  it("GitHub depo adresleri ve adları", () => {
    expect(githubDeposu("https://github.com/fyildirim-debug/ArnOrg.git")).toBe("fyildirim-debug/ArnOrg");
    expect(githubDeposu("git@github.com:a-b/c.d.git")).toBe("a-b/c.d");
    expect(githubDeposu("ssh://git@github.com/a/b")).toBe("a/b");
    expect(githubDeposu("https://gitlab.com/a/b.git")).toBeNull();
    expect(githubDeposu(null)).toBeNull();
    expect(depoAdiYap("Sipariş Paneli · v2")).toBe("Siparis-Paneli-v2");
    expect(klasorAdiYap("Çağrı Merkezi")).toBe("cagri-merkezi");
    expect(depoCevir({ name: "x", full_name: "o/x", private: true, default_branch: "main", pushed_at: "2026-01-01T00:00:00Z" })).toMatchObject({ sahip: "o", ozel: true, varsayilanDal: "main", adres: "https://github.com/o/x" });
  });
});

describe("dizin gezgini", () => {
  it("alt dizinleri, git depolarını ve kısayolları listeler; gizlileri atlar", () => {
    const kok = path.join(gecici, "gezgin");
    fs.mkdirSync(path.join(kok, "b-repo", ".git"), { recursive: true });
    fs.mkdirSync(path.join(kok, "a-klasor"));
    fs.mkdirSync(path.join(kok, ".gizli"));
    fs.writeFileSync(path.join(kok, "dosya.txt"), "x");
    const l = dizinListesi(kok, path.join(gecici, "projeler"));
    expect(l.dizinler.map((d) => d.ad)).toEqual(["a-klasor", "b-repo"]);
    expect(l.dizinler.find((d) => d.ad === "b-repo")?.repo).toBe(true);
    expect(l.ust).toBe(gecici);
    expect(l.kisayollar.some((k) => k.yol === path.join(gecici, "projeler"))).toBe(true);
    expect(() => dizinListesi(path.join(kok, "yok"), kok)).toThrow();
  });

  it("yeni klasör açar; geçersiz ve var olan adı reddeder", () => {
    const kok = path.join(gecici, "gezgin");
    expect(fs.existsSync(dizinOlustur(kok, "yeni proje"))).toBe(true);
    expect(() => dizinOlustur(kok, "yeni proje")).toThrow();
    expect(() => dizinOlustur(kok, "../kacis")).toThrow();
    expect(() => dizinOlustur(kok, "")).toThrow();
  });
});

/** İşlem belirli bir koşula gelene kadar bekler */
async function bekle(kurulum: Kurulum, id: string, kosul: (i: KurulumIslemi) => boolean, sureMs = 8000): Promise<KurulumIslemi> {
  const son = Date.now() + sureMs;
  for (;;) {
    const i = kurulum.islem(id);
    if (kosul(i)) return i;
    if (Date.now() > son) throw new Error(`Koşul gelmedi: ${JSON.stringify(i)}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.skipIf(windows)("sahte claude ve gh ile giriş akışları", () => {
  let kurulum: Kurulum;
  const olaylar = new OlayYolu();
  const gelenler: SunucuOlayi[] = [];
  let girisDegisti = 0;

  beforeAll(() => {
    const bin = path.join(gecici, "bin");
    fs.mkdirSync(bin, { recursive: true });
    const claude = path.join(bin, "claude");
    fs.writeFileSync(
      claude,
      `#!/bin/sh
case "$1" in
  --version) echo "9.9.9 (Claude Code)" ;;
  auth)
    case "$2" in
      status)
        if [ -f "$ARNORG_SAHTE_DURUM" ]; then cat "$ARNORG_SAHTE_DURUM"; exit 0; fi
        echo '{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}'; exit 1 ;;
      login)
        echo "Opening browser to sign in…"
        printf 'If the browser did not open, visit: \\033]8;;https://claude.com/cai/oauth/authorize?code=true&x=1\\007\\033[94mhttps://claude.com/cai/oauth/authorize?code=true&x=1\\033[39m\\033]8;;\\007\\r\\n'
        printf "Paste code here if prompted > "
        read kod
        if [ "$kod" = "dogru-kod" ]; then
          echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","email":"kurul@ornek.com"}' > "$ARNORG_SAHTE_DURUM"
          echo "Login successful."; exit 0
        fi
        echo "Login failed: invalid code"; exit 1 ;;
    esac ;;
esac
`,
      { mode: 0o755 },
    );
    const gh = path.join(bin, "gh");
    fs.writeFileSync(
      gh,
      `#!/bin/sh
case "$1" in
  --version) echo "gh version 2.89.0 (2026-03-26)" ;;
  auth)
    case "$2" in
      status)
        if [ -f "$ARNORG_SAHTE_GH" ]; then echo "github.com"; echo "  ✓ Logged in to github.com account deneme-kisi (keyring)"; exit 0; fi
        echo "You are not logged into any GitHub hosts." >&2; exit 1 ;;
      login)
        echo "! First copy your one-time code: ABCD-1234" >&2
        echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2
        sleep 1; touch "$ARNORG_SAHTE_GH"; echo "✓ Authentication complete." >&2; exit 0 ;;
      setup-git) exit 0 ;;
    esac ;;
esac
`,
      { mode: 0o755 },
    );
    process.env.ARNORG_SAHTE_DURUM = path.join(gecici, "claude-durum.json");
    process.env.ARNORG_SAHTE_GH = path.join(gecici, "gh-durum");
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    kurulum = new Kurulum(yap, olaylar, { claudeYoluZorla: claude, ghYoluZorla: gh, claudeGirisiDegisti: () => girisDegisti++ });
    olaylar.dinle((o) => gelenler.push(o));
  });

  afterAll(() => {
    kurulum.kapat();
    delete process.env.ARNORG_SAHTE_DURUM;
    delete process.env.ARNORG_SAHTE_GH;
  });

  it("Claude: girişsiz durum, tarayıcı adresi, kod yapıştırma ve abonelikli giriş", async () => {
    const once = await kurulum.claude();
    expect(once).toMatchObject({ surum: "9.9.9", girisYapildi: false, sistemde: true });
    const baslat = kurulum.claudeGirisBaslat();
    // Aynı türden ikinci istek yeni süreç açmaz
    expect(kurulum.claudeGirisBaslat().id).toBe(baslat.id);
    const hazir = await bekle(kurulum, baslat.id, (i) => i.girdiBekliyor && Boolean(i.adres));
    expect(hazir.adres).toBe("https://claude.com/cai/oauth/authorize?code=true&x=1");
    expect(hazir.cikti).not.toMatch(/\u001b/);
    kurulum.girdi(baslat.id, "dogru-kod");
    const son = await bekle(kurulum, baslat.id, (i) => i.durum !== "calisiyor");
    expect(son.durum).toBe("tamam");
    expect(girisDegisti).toBe(1);
    expect(await kurulum.claude()).toMatchObject({ girisYapildi: true, abonelik: true, eposta: "kurul@ornek.com" });
    expect(gelenler.some((o) => o.tur === "kurulum.islem" && o.islem.id === baslat.id && o.islem.durum === "tamam")).toBe(true);
  });

  it("Claude: yanlış kod hatayla biter; iptal süreci durdurur", async () => {
    fs.rmSync(process.env.ARNORG_SAHTE_DURUM!, { force: true });
    const a = kurulum.claudeGirisBaslat();
    await bekle(kurulum, a.id, (i) => i.girdiBekliyor);
    kurulum.girdi(a.id, "yanlis");
    const son = await bekle(kurulum, a.id, (i) => i.durum !== "calisiyor");
    expect(son.durum).toBe("hata");
    expect(son.hata).toMatch(/invalid code/);
    const b = kurulum.claudeGirisBaslat();
    await bekle(kurulum, b.id, (i) => i.girdiBekliyor);
    expect(kurulum.iptal(b.id).durum).toBe("iptal");
    expect(() => kurulum.girdi(b.id, "x")).toThrow();
  });

  it("GitHub: cihaz kodu ve adres gösterilir, giriş biter, kullanıcı okunur", async () => {
    expect((await kurulum.github()).girisYapildi).toBe(false);
    const g = kurulum.ghGirisBaslat();
    const kodlu = await bekle(kurulum, g.id, (i) => Boolean(i.kod));
    expect(kodlu).toMatchObject({ kod: "ABCD-1234", adres: "https://github.com/login/device" });
    const son = await bekle(kurulum, g.id, (i) => i.durum !== "calisiyor");
    expect(son.durum).toBe("tamam");
    expect(await kurulum.github()).toMatchObject({ kurulu: true, surum: "2.89.0", girisYapildi: true, kullanici: "deneme-kisi" });
  });

  it("toplu durum: platform ve proje kökü", async () => {
    const d = await kurulum.durum(true);
    expect(d.platform).toBe(`${process.platform}-${process.arch}`);
    expect(d.projeKoku).toBe(path.join(os.homedir(), "ArnOrg"));
    expect(d.claude.girisYapildi).toBe(false);
  });
});
