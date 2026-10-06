// GitHub: gh ile hesap, depo listesi, dallar, klonlama ve GitHub'da depo açma; uzak depoyla eşitleme.
// Çalışma dalını kurul seçer; onaylı birleştirmeler o dala girer ve (otomatikGonder açıksa) uzak depoya gönderilir.
// Proje açılınca ve arada bir uzak dal çekilir: yerel dal geride ve çalışma ağacı temizse ileri sarılır.
import fs from "node:fs";
import path from "node:path";
import type { EsitlemeSonucu, GithubDali, GithubDeposu, GithubHesabi, KlonlaIstegi, KurulumIslemi, Proje, ProjeOlusturIstegi, ProjeOzeti } from "@arnorg/ortak";
import { githubDeposu } from "./depo.js";
import { iki } from "./dil.js";
import * as gitIslemleri from "./git.js";
import { komut, type Kurulum } from "./kurulum.js";
import { temizOrtam } from "./ortam.js";
import type { Yapilandirma } from "./yapilandirma.js";
import { ArnorgHatasi } from "./yardimci.js";

const DEPO_DESENI = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

/** Proje adından GitHub depo adı: harf, rakam, tire, alt çizgi, nokta */
export function depoAdiYap(ad: string): string {
  const harfler: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  const sade = ad
    .trim()
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (h) => harfler[h] ?? h)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100);
  return sade || "arnorg-projesi";
}

/** Proje klasörü adı (depo adıyla aynı kural, küçük harf) */
export function klasorAdiYap(ad: string): string {
  return depoAdiYap(ad).toLowerCase();
}

interface HamDepo {
  name: string;
  full_name: string;
  owner?: { login?: string };
  description?: string | null;
  private?: boolean;
  default_branch?: string | null;
  pushed_at?: string | null;
  updated_at?: string | null;
  html_url?: string;
  archived?: boolean;
}

export function depoCevir(d: HamDepo): GithubDeposu {
  return {
    ad: d.name,
    tamAd: d.full_name,
    sahip: d.owner?.login ?? d.full_name.split("/")[0] ?? "",
    aciklama: d.description ?? "",
    ozel: Boolean(d.private),
    varsayilanDal: d.default_branch ?? null,
    guncelleme: d.pushed_at ?? d.updated_at ?? new Date(0).toISOString(),
    adres: d.html_url ?? `https://github.com/${d.full_name}`,
  };
}

export class GithubIslemleri {
  constructor(
    private readonly kurulum: Kurulum,
    private readonly yapilandirma: Yapilandirma,
  ) {}

  private gh(): string {
    const g = this.kurulum.ghYolu();
    if (!g) throw new ArnorgHatasi(iki("GitHub CLI (gh) kurulu değil. Kurulum adımından kurun.", "GitHub CLI (gh) is not installed. Install it from the setup step."), 412);
    return g.yol;
  }

  private async api<T>(yol: string): Promise<T> {
    const s = await komut(this.gh(), ["api", yol], { env: this.kurulum.ghOrtami(), zamanMs: 30_000 });
    if (s.kod !== 0) {
      const metin = (s.hata || s.cikti).trim();
      if (/auth login|not logged|authenticat|401/i.test(metin)) throw new ArnorgHatasi(iki("GitHub'a giriş yapılmamış.", "Not signed in to GitHub."), 412);
      throw new ArnorgHatasi(`GitHub: ${metin.slice(0, 300)}`, 502);
    }
    try {
      return JSON.parse(s.cikti) as T;
    } catch {
      throw new ArnorgHatasi(iki("GitHub yanıtı okunamadı.", "Could not read the GitHub response."), 502);
    }
  }

  async hesap(): Promise<GithubHesabi> {
    const [kullanici, kuruluslar] = await Promise.all([
      this.api<{ login: string; name?: string | null; email?: string | null; id?: number }>("user"),
      this.api<{ login: string }[]>("user/orgs?per_page=100").catch(() => []),
    ]);
    // Gizli e-postada GitHub'ın commit adresi: <id>+<kullanıcı>@users.noreply.github.com
    const eposta = kullanici.email ?? (kullanici.id ? `${kullanici.id}+${kullanici.login}@users.noreply.github.com` : null);
    return { kullanici: kullanici.login, ad: kullanici.name ?? null, eposta, kuruluslar: kuruluslar.map((k) => k.login) };
  }

  /** Erişilebilen depolar, son güncellenen önce (en çok 200); sorgu adı ve açıklamada aranır */
  async depolar(sorgu?: string): Promise<GithubDeposu[]> {
    const liste: GithubDeposu[] = [];
    for (let sayfa = 1; sayfa <= 2; sayfa++) {
      const parca = await this.api<HamDepo[]>(`user/repos?per_page=100&page=${sayfa}&sort=pushed&affiliation=owner,collaborator,organization_member`);
      liste.push(...parca.filter((d) => !d.archived).map(depoCevir));
      if (parca.length < 100) break;
    }
    const q = sorgu?.trim().toLocaleLowerCase();
    return q ? liste.filter((d) => d.tamAd.toLocaleLowerCase().includes(q) || d.aciklama.toLocaleLowerCase().includes(q)) : liste;
  }

  async dallar(depo: string): Promise<GithubDali[]> {
    if (!DEPO_DESENI.test(depo)) throw new ArnorgHatasi(iki("Geçersiz depo adı (sahip/ad).", "Invalid repository name (owner/name)."));
    const ham = await this.api<{ name: string; protected?: boolean }[]>(`repos/${depo}/branches?per_page=100`);
    return ham.map((d) => ({ ad: d.name, korumali: Boolean(d.protected) }));
  }

  /**
   * Depoyu klonlar ve proje olarak açar. Kurulum işlemi olarak yürür: git ilerlemesi canlı gelir,
   * iş bitince sonuc.projeId döner. Dal verildiyse ona geçilir (uzakta yoksa yeni dal açılır).
   */
  klonla(istek: KlonlaIstegi, projeyiAc: (p: ProjeOlusturIstegi) => Promise<ProjeOzeti>): KurulumIslemi {
    const depo = istek.depo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
    if (!DEPO_DESENI.test(depo)) throw new ArnorgHatasi(iki("Geçersiz depo adı (sahip/ad).", "Invalid repository name (owner/name)."));
    const gh = this.gh();
    const depoAdi = depo.split("/")[1]!;
    const ad = istek.ad?.trim() || depoAdi;
    const hedef = path.resolve(istek.yol?.trim() || path.join(this.yapilandirma.projeKoku, klasorAdiYap(depoAdi)));
    if (fs.existsSync(hedef) && fs.readdirSync(hedef).length > 0) {
      throw new ArnorgHatasi(iki(`Hedef klasör boş değil: ${hedef}`, `The target folder is not empty: ${hedef}`), 409);
    }
    const is = this.kurulum.disIslem("klonla");
    void (async () => {
      is.satir(`${depo} → ${hedef}`);
      fs.mkdirSync(path.dirname(hedef), { recursive: true });
      const s = await is.surec(gh, ["repo", "clone", depo, hedef, "--", "--progress"], { env: this.kurulum.ghOrtami() });
      if (s.kod !== 0) {
        const satir = s.hata.trim().split("\n").filter(Boolean).at(-1) ?? "";
        is.bitir("hata", satir || iki("Klonlanamadı.", "Clone failed."));
        return;
      }
      const proje = await projeyiAc({
        ad,
        yol: hedef,
        olustur: false,
        aciklama: istek.aciklama,
        dal: istek.dal?.trim() || undefined,
        // 0.0.10: klonlarken seçilen bütçe ve seviye
        butce: istek.butce,
        seviye: istek.seviye,
        otomatikKademe: istek.otomatikKademe,
      });
      is.satir(iki(`Proje açıldı: ${proje.ad} (dal ${proje.varsayilanDal})`, `Project opened: ${proje.ad} (branch ${proje.varsayilanDal})`));
      is.bitir("tamam", null, { projeId: proje.id });
    })().catch((h) => is.bitir("hata", (h as Error).message));
    return { ...is.kayit };
  }

  /** Var olan yerel projeyi GitHub'da yeni depo olarak açar, origin'e bağlar ve çalışma dalını gönderir */
  async depoOlustur(proje: Proje, secenek: { ozel: boolean; sahip?: string; aciklama?: string }): Promise<string> {
    if (await gitIslemleri.uzakAdresi(proje.yol)) throw new ArnorgHatasi(iki("Projenin zaten bir uzak deposu (origin) var.", "The project already has a remote (origin)."), 409);
    const ad = depoAdiYap(proje.ad);
    const hedef = secenek.sahip?.trim() ? `${secenek.sahip.trim()}/${ad}` : ad;
    const argumanlar = ["repo", "create", hedef, secenek.ozel ? "--private" : "--public", "--source", proje.yol, "--remote", "origin", "--push"];
    const aciklama = (secenek.aciklama ?? proje.aciklama).trim();
    if (aciklama) argumanlar.push("--description", aciklama.slice(0, 350));
    const s = await komut(this.gh(), argumanlar, { env: this.kurulum.ghOrtami(), cwd: proje.yol, zamanMs: 180_000 });
    if (s.kod !== 0) throw new ArnorgHatasi(`GitHub: ${(s.hata || s.cikti).trim().slice(0, 400)}`, 502);
    const uzak = await gitIslemleri.uzakAdresi(proje.yol);
    if (!uzak) throw new ArnorgHatasi(iki("Depo açıldı ama origin bağlanamadı.", "The repository was created but origin could not be set."), 500);
    return uzak;
  }

  /** git komutları için kimlik yardımcısı: GitHub uzaklarında gh (genel ayar yapılmamış olsa bile) */
  private gitSecenekleri(proje: Proje): string[] {
    const gh = this.kurulum.ghYolu();
    if (!gh || !githubDeposu(proje.uzakAdres)) return [];
    return ["-c", "credential.https://github.com.helper=", "-c", `credential.https://github.com.helper=!"${gh.yol.replace(/\\/g, "/")}" auth git-credential`];
  }

  private async git(proje: Proje, argumanlar: string[], zamanMs = 120_000) {
    const yol = this.kurulum.gitYolu();
    if (!yol) throw new ArnorgHatasi(iki("git bulunamadı.", "git was not found."), 412);
    return komut(yol, [...this.gitSecenekleri(proje), ...argumanlar], { cwd: proje.yol, env: temizOrtam({ GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" }), zamanMs });
  }

  private async farkSay(proje: Proje): Promise<{ onde: number; geride: number }> {
    const s = await this.git(proje, ["rev-list", "--left-right", "--count", `${proje.varsayilanDal}...origin/${proje.varsayilanDal}`], 20_000);
    const [onde, geride] = s.cikti.trim().split(/\s+/).map((n) => Number(n) || 0);
    return { onde: onde ?? 0, geride: geride ?? 0 };
  }

  /**
   * Uzak dalı çeker: geride ve çalışma ağacı temizse ileri sarar; ayrışmışsa dokunmaz ve bildirir.
   * gonder=true ise öndeki commit'ler de gönderilir.
   */
  async esitle(proje: Proje, gonder = false): Promise<EsitlemeSonucu> {
    if (!proje.uzakAdres) return { durum: "uzak_yok", mesaj: iki("Projenin uzak deposu yok.", "The project has no remote."), onde: 0, geride: 0 };
    const mevcut = await gitIslemleri.mevcutDal(proje.yol).catch(() => "HEAD");
    if (mevcut !== proje.varsayilanDal) {
      return { durum: "dal_farkli", mesaj: iki(`Ana repo ${mevcut} dalında; çalışma dalı ${proje.varsayilanDal}.`, `The main repo is on ${mevcut}; the working branch is ${proje.varsayilanDal}.`), onde: 0, geride: 0 };
    }
    const cek = await this.git(proje, ["fetch", "--quiet", "origin", proje.varsayilanDal]);
    if (cek.kod !== 0) {
      // Uzakta henüz bu dal yoksa (yeni dal) yalnız gönderim anlamlıdır
      if (/couldn't find remote ref|no such ref/i.test(cek.hata)) {
        if (gonder) return this.gonder(proje);
        return { durum: "guncel", mesaj: iki("Dal uzak depoda henüz yok.", "The branch does not exist on the remote yet."), onde: 0, geride: 0 };
      }
      return { durum: "hata", mesaj: `git fetch: ${cek.hata.trim().slice(0, 300)}`, onde: 0, geride: 0 };
    }
    const { onde, geride } = await this.farkSay(proje);
    if (geride > 0 && onde === 0) {
      // Ortak çalışma kopyasında çalışanların kaydedilmemiş işi olabilir (0.0.8): git ileri sarmayı yalnız o
      // dosyalara dokunmuyorsa yapar, dokunuyorsa hiçbir şeyi değiştirmeden reddeder
      const ileri = await this.git(proje, ["merge", "--ff-only", `origin/${proje.varsayilanDal}`]);
      if (ileri.kod !== 0) {
        if (/local changes|untracked working tree files|would be overwritten/i.test(ileri.hata)) {
          return {
            durum: "kirli",
            mesaj: iki(
              "Uzakta yeni commit var ama çalışma kopyasındaki kaydedilmemiş değişikliklerle aynı dosyalara dokunduğu için çekilmedi; o işler kaydedilince yeniden denenecek.",
              "There are new remote commits, but they touch files with unsaved changes in the working copy, so they were not pulled; it will try again once that work is saved.",
            ),
            onde,
            geride,
          };
        }
        return { durum: "hata", mesaj: `git merge --ff-only: ${ileri.hata.trim().slice(0, 300)}`, onde, geride };
      }
      return { durum: "cekildi", mesaj: iki(`Uzaktan ${geride} commit çekildi.`, `Pulled ${geride} commit(s) from the remote.`), onde: 0, geride: 0 };
    }
    if (geride > 0 && onde > 0) {
      return { durum: "ayrisik", mesaj: iki(`Yerel dal ile uzak dal ayrıştı (${onde} önde, ${geride} geride). Elle birleştirmek gerekiyor.`, `The local and remote branches diverged (${onde} ahead, ${geride} behind). A manual merge is needed.`), onde, geride };
    }
    if (onde > 0 && gonder) return this.gonder(proje);
    return { durum: "guncel", mesaj: onde > 0 ? iki(`${onde} commit gönderilmeyi bekliyor.`, `${onde} commit(s) waiting to be pushed.`) : iki("Uzak depoyla aynı.", "Up to date with the remote."), onde, geride };
  }

  /** Çalışma dalını uzak depoya gönderir; reddedilirse (uzakta yeni commit) önce ileri sarmayı dener */
  async gonder(proje: Proje): Promise<EsitlemeSonucu> {
    if (!proje.uzakAdres) return { durum: "uzak_yok", mesaj: iki("Projenin uzak deposu yok.", "The project has no remote."), onde: 0, geride: 0 };
    const it = await this.git(proje, ["push", "-u", "origin", proje.varsayilanDal]);
    if (it.kod === 0) return { durum: "gonderildi", mesaj: iki(`${proje.varsayilanDal} uzak depoya gönderildi.`, `${proje.varsayilanDal} was pushed to the remote.`), onde: 0, geride: 0 };
    if (/rejected|non-fast-forward|fetch first/i.test(it.hata)) {
      const sonuc = await this.esitle(proje, false);
      if (sonuc.durum === "cekildi") return this.gonder(proje);
      return { ...sonuc, mesaj: iki(`Gönderilemedi: uzak depoda yeni commit var. ${sonuc.mesaj}`, `Push rejected: the remote has new commits. ${sonuc.mesaj}`) };
    }
    return { durum: "hata", mesaj: `git push: ${it.hata.trim().slice(0, 300)}`, onde: 0, geride: 0 };
  }
}
