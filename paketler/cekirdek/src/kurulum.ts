// Kurulum: Claude Code, git ve GitHub CLI (gh). Durum yoklaması, giriş ve kurulum işlemleri.
// Uzun işlemler (Claude girişi, Claude kurulumu, gh indirme, gh girişi, git kurulumu) canlı çıktıyla yürür:
// her değişiklik "kurulum.islem" olayıyla Stüdyo'ya gider; ilk açılış hazırlığı ve Ayarlar bunları gösterir.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn as ptyBaslat } from "@lydell/node-pty";
import type { ClaudeKurulumu, GitKurulumu, GithubKurulumu, KurulumDurumu, KurulumIslemi, KurulumIslemTuru } from "@arnorg/ortak";
import { iki } from "./dil.js";
import type { OlayYolu } from "./olaylar.js";
import { ajanOrtami, claudeYoluBul, pathIcindeBul, temizOrtam } from "./ortam.js";
import type { Yapilandirma } from "./yapilandirma.js";
import { ArnorgHatasi, kimlik, simdi } from "./yardimci.js";

const CIKTI_SINIRI = 8 * 1024;
const HAM_SINIR = 64 * 1024;
/** Vekil ya da GitHub API'si erişilemezse indirilecek bilinen gh sürümü */
export const BILINEN_GH_SURUMU = "2.89.0";
/** Bitmiş işlemler bu süre sonra bellekten silinir */
const ISLEM_OMRU_MS = 30 * 60_000;
/** Kullanıcı beklemesi olan işlemler (giriş) en çok bu kadar sürer */
const ISLEM_ZAMAN_ASIMI_MS = 20 * 60_000;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Renk, imleç ve OSC (8 bağlantı, pencere başlığı) kodlarını ayıklar; tek başına satır başı dönüşünü satıra çevirir */
export function ansiAyikla(m: string): string {
  return (
    m
      // OSC: ESC ] ... BEL ya da ESC \
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
      // CSI: ESC [ parametreler son bayt
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
      // Diğer iki baytlık kaçışlar
      .replace(/\u001b[@-Z\\-_]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  );
}

/** Çıktının son kısmı; boş satır yığınları teke iner */
function sonKisim(m: string, sinir = CIKTI_SINIRI): string {
  const temiz = m.replace(/\n{3,}/g, "\n\n");
  return temiz.length > sinir ? temiz.slice(-sinir) : temiz;
}

function calistirilabilirMi(yol: string): boolean {
  try {
    if (!fs.statSync(yol).isFile()) return false;
    if (process.platform === "win32") return true;
    fs.accessSync(yol, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface KomutSonucu {
  kod: number | null;
  cikti: string;
  hata: string;
}

/** Komutu çalıştırır; çıkış kodu sıfır değilse fırlatmaz, sonucu döndürür */
export function komut(yol: string, argumanlar: string[], secenek: { cwd?: string; env?: Record<string, string>; zamanMs?: number; girdi?: string } = {}): Promise<KomutSonucu> {
  return new Promise((coz) => {
    const surec = execFile(
      yol,
      argumanlar,
      { cwd: secenek.cwd, env: secenek.env ?? temizOrtam(), timeout: secenek.zamanMs ?? 20_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (h, stdout, stderr) => {
        const kod = h ? (typeof (h as { code?: unknown }).code === "number" ? ((h as { code: number }).code) : null) : 0;
        coz({ kod, cikti: String(stdout ?? ""), hata: String(stderr ?? "") || (h && kod === null ? h.message : "") });
      },
    );
    if (secenek.girdi !== undefined) surec.stdin?.end(secenek.girdi);
  });
}

/** Çalışan süreçteki PATH'e dizin ekler (kurulumdan sonra git ve gh, uygulamayı yeniden açmadan bulunur) */
export function yolaEkle(dizin: string): void {
  const ayrac = path.delimiter;
  const anahtar = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const mevcut = (process.env[anahtar] ?? "").split(ayrac).filter(Boolean);
  if (mevcut.some((d) => path.resolve(d) === path.resolve(dizin))) return;
  process.env[anahtar] = [dizin, ...mevcut].join(ayrac);
}

/** ArnOrg'la (Claude Agent SDK'nın platform paketiyle) gelen Claude Code ikilisi */
export function gomuluClaudeYolu(): string | null {
  const gerekli = createRequire(import.meta.url);
  const uzanti = process.platform === "win32" ? ".exe" : "";
  const adaylar = process.platform === "linux" ? [`linux-${process.arch}`, `linux-${process.arch}-musl`] : [`${process.platform}-${process.arch}`];
  for (const a of adaylar) {
    try {
      const yol = gerekli.resolve(`@anthropic-ai/claude-agent-sdk-${a}/claude${uzanti}`);
      if (calistirilabilirMi(yol)) return yol;
    } catch {
      // bu platform paketi kurulu değil
    }
  }
  return null;
}

/** `claude auth status --json` çıktısı */
export interface ClaudeGirisDurumu {
  girisYapildi: boolean;
  abonelik: boolean;
  girisYontemi: string | null;
  saglayici: string | null;
  eposta: string | null;
  hata: string | null;
}

/** auth status JSON'unu yorumlar. claude.ai ve uzun ömürlü abonelik jetonu (oauth_token) aboneliktir; API anahtarı ve bulut sağlayıcı değildir */
export function claudeGirisiniYorumla(cikti: string): ClaudeGirisDurumu {
  const bas = cikti.indexOf("{");
  const son = cikti.lastIndexOf("}");
  if (bas < 0 || son <= bas) return { girisYapildi: false, abonelik: false, girisYontemi: null, saglayici: null, eposta: null, hata: iki("Claude Code giriş durumu okunamadı.", "Could not read Claude Code sign-in status.") };
  try {
    const j = JSON.parse(cikti.slice(bas, son + 1)) as { loggedIn?: boolean; authMethod?: string; apiProvider?: string; email?: string | null };
    const yontem = j.authMethod && j.authMethod !== "none" ? j.authMethod : null;
    const saglayici = j.apiProvider ?? null;
    const girisYapildi = j.loggedIn === true;
    const abonelik = girisYapildi && (yontem === "claude.ai" || yontem === "oauth_token") && (saglayici === null || saglayici === "firstParty");
    return { girisYapildi, abonelik, girisYontemi: yontem, saglayici, eposta: j.email ?? null, hata: null };
  } catch {
    return { girisYapildi: false, abonelik: false, girisYontemi: null, saglayici: null, eposta: null, hata: iki("Claude Code giriş durumu okunamadı.", "Could not read Claude Code sign-in status.") };
  }
}

/** gh sürüm dosyası adı: gh_2.89.0_linux_amd64.tar.gz */
export function ghPaketAdi(surum: string, platform: NodeJS.Platform = process.platform, mimari: string = process.arch): { ad: string; zip: boolean } | null {
  const m = mimari === "arm64" ? "arm64" : mimari === "x64" ? "amd64" : null;
  if (!m) return null;
  if (platform === "linux") return { ad: `gh_${surum}_linux_${m}.tar.gz`, zip: false };
  if (platform === "darwin") return { ad: `gh_${surum}_macOS_${m}.zip`, zip: true };
  if (platform === "win32") return { ad: `gh_${surum}_windows_${m}.zip`, zip: true };
  return null;
}

/** `gh auth status` metninden kullanıcı adı (eski ve yeni gh biçimleri) */
export function ghKullanicisi(metin: string): string | null {
  return metin.match(/Logged in to github\.com (?:account|as) ([A-Za-z0-9-]+)/)?.[1] ?? null;
}

/** Çıktıdaki GitHub cihaz kodu ve adresi */
export function ghCihazKodu(metin: string): { kod: string | null; adres: string | null } {
  return {
    kod: metin.match(/one-time code(?: \(([A-Z0-9]{4}-[A-Z0-9]{4})\)|:\s*([A-Z0-9]{4}-[A-Z0-9]{4}))/i)?.slice(1).find(Boolean)?.toUpperCase() ?? null,
    adres: metin.match(/https:\/\/github\.com\/login\/device\S*/)?.[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Kurulum yöneticisi
// ---------------------------------------------------------------------------

interface Islem {
  kayit: KurulumIslemi;
  yaz: ((veri: string) => void) | null;
  durdur: (() => void) | null;
  yayinZamanlayici: NodeJS.Timeout | null;
}

export interface KurulumSecenekleri {
  /** Claude girişi değişince (hesap ve kullanım yeniden okunur) */
  claudeGirisiDegisti?: () => void;
  /** Testlerde komut yolları */
  ghYoluZorla?: string | null;
  gitYoluZorla?: string | null;
  claudeYoluZorla?: string | null;
}

export class Kurulum {
  private islemler = new Map<string, Islem>();
  private onbellek: { zaman: number; durum: KurulumDurumu } | null = null;
  private suren: Promise<KurulumDurumu> | null = null;

  constructor(
    private readonly yapilandirma: Yapilandirma,
    private readonly olaylar: OlayYolu,
    private readonly secenek: KurulumSecenekleri = {},
  ) {}

  // ----------------------------- durum -----------------------------

  /** Claude, git ve gh durumu; 5 sn önbellekli, tazele ile yeniden yoklanır */
  async durum(tazele = false): Promise<KurulumDurumu> {
    if (!tazele && this.onbellek && Date.now() - this.onbellek.zaman < 5000) return this.onbellek.durum;
    if (this.suren) return this.suren;
    this.suren = (async () => {
      const [claude, git, github] = await Promise.all([this.claude(), this.git(), this.github()]);
      const durum: KurulumDurumu = {
        claude,
        git,
        github,
        platform: `${process.platform}-${process.arch}`,
        projeKoku: this.yapilandirma.projeKoku,
        gitKurulabilir: process.platform === "win32" || process.platform === "darwin",
      };
      this.onbellek = { zaman: Date.now(), durum };
      return durum;
    })().finally(() => {
      this.suren = null;
    });
    return this.suren;
  }

  /** Durumu yeniden okuyup Stüdyo'ya yayınlar */
  async durumuYayinla(): Promise<KurulumDurumu> {
    const durum = await this.durum(true);
    this.olaylar.yayinla({ tur: "kurulum.durum", durum });
    return durum;
  }

  /** Ajanların kullanacağı Claude Code: ayardaki yol, sistemdeki claude ya da ArnOrg'la gelen kopya */
  claudeIkilisi(): { yol: string; kaynak: ClaudeKurulumu["kaynak"] } | null {
    if (this.secenek.claudeYoluZorla !== undefined) return this.secenek.claudeYoluZorla ? { yol: this.secenek.claudeYoluZorla, kaynak: "sistem" } : null;
    const ayardaki = this.yapilandirma.ayarlar.claudeYolu;
    const sistem = claudeYoluBul(ayardaki);
    if (sistem) return { yol: sistem, kaynak: ayardaki && path.resolve(ayardaki) === path.resolve(sistem) ? "ayar" : "sistem" };
    const paket = gomuluClaudeYolu();
    return paket ? { yol: paket, kaynak: "paket" } : null;
  }

  async claude(): Promise<ClaudeKurulumu> {
    const ikili = this.claudeIkilisi();
    if (!ikili) {
      return {
        kaynak: null,
        yol: null,
        surum: null,
        sistemde: false,
        girisYapildi: false,
        abonelik: false,
        girisYontemi: null,
        saglayici: null,
        eposta: null,
        hata: iki("Claude Code bulunamadı.", "Claude Code was not found."),
      };
    }
    const [surumSonucu, giris] = await Promise.all([komut(ikili.yol, ["--version"], { zamanMs: 15_000 }), this.claudeGirisi(ikili.yol)]);
    return {
      kaynak: ikili.kaynak,
      yol: ikili.yol,
      surum: surumSonucu.kod === 0 ? (surumSonucu.cikti.trim().split(/\s+/)[0] ?? null) : null,
      sistemde: ikili.kaynak !== "paket",
      ...giris,
    };
  }

  /** API anahtarları ajan ortamından silinir; bu yüzden durum da aynı ortamla okunur */
  private async claudeGirisi(yol: string): Promise<ClaudeGirisDurumu> {
    const s = await komut(yol, ["auth", "status", "--json"], { env: ajanOrtami(), zamanMs: 20_000 });
    return claudeGirisiniYorumla(s.cikti);
  }

  /** git: PATH, sonra bilinen yerler (Windows'ta yeni kurulan Git for Windows PATH'e henüz girmemiş olabilir) */
  gitYolu(): string | null {
    if (this.secenek.gitYoluZorla !== undefined) return this.secenek.gitYoluZorla;
    const p = pathIcindeBul("git");
    if (p) return p;
    const adaylar =
      process.platform === "win32"
        ? [path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "cmd", "git.exe"), path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "cmd", "git.exe")]
        : ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];
    for (const a of adaylar) {
      if (calistirilabilirMi(a)) {
        yolaEkle(path.dirname(a));
        return a;
      }
    }
    return null;
  }

  async git(): Promise<GitKurulumu> {
    const yol = this.gitYolu();
    if (!yol) return { kurulu: false, yol: null, surum: null, kullaniciAdi: null, eposta: null };
    const [surum, ad, eposta] = await Promise.all([
      komut(yol, ["--version"]),
      komut(yol, ["config", "--global", "--get", "user.name"]),
      komut(yol, ["config", "--global", "--get", "user.email"]),
    ]);
    return {
      kurulu: surum.kod === 0,
      yol,
      surum: surum.cikti.match(/git version (\S+)/)?.[1] ?? null,
      kullaniciAdi: ad.cikti.trim() || null,
      eposta: eposta.cikti.trim() || null,
    };
  }

  /** git kullanıcı adı ve e-postası (ajan commit'leri bu kimlikle atılır) */
  async gitKimligiAyarla(ad: string, eposta: string): Promise<GitKurulumu> {
    const yol = this.gitYolu();
    if (!yol) throw new ArnorgHatasi(iki("git bulunamadı.", "git was not found."), 404);
    const temizAd = ad.trim();
    const temizEposta = eposta.trim();
    if (!temizAd || temizAd.length > 100) throw new ArnorgHatasi(iki("Ad 1–100 karakter olmalı.", "Name must be 1–100 characters."));
    if (!/^[^\s@]+@[^\s@]+$/.test(temizEposta)) throw new ArnorgHatasi(iki("Geçerli bir e-posta adresi girin.", "Enter a valid email address."));
    for (const [anahtar, deger] of [
      ["user.name", temizAd],
      ["user.email", temizEposta],
    ] as const) {
      const s = await komut(yol, ["config", "--global", anahtar, deger]);
      if (s.kod !== 0) throw new ArnorgHatasi(`git config: ${s.hata.trim() || s.kod}`, 500);
    }
    void this.durumuYayinla();
    return this.git();
  }

  /** gh: ayardaki yol → PATH → ArnOrg'un indirdiği kopya → bilinen kurulum yerleri */
  ghYolu(): { yol: string; kaynak: GithubKurulumu["kaynak"] } | null {
    if (this.secenek.ghYoluZorla !== undefined) return this.secenek.ghYoluZorla ? { yol: this.secenek.ghYoluZorla, kaynak: "sistem" } : null;
    const ayardaki = this.yapilandirma.ayarlar.ghYolu;
    if (ayardaki && calistirilabilirMi(ayardaki)) return { yol: ayardaki, kaynak: "ayar" };
    const p = pathIcindeBul("gh");
    if (p) return { yol: p, kaynak: "sistem" };
    const kendi = this.arnorgGhYolu();
    if (calistirilabilirMi(kendi)) return { yol: kendi, kaynak: "arnorg" };
    const adaylar =
      process.platform === "win32"
        ? [path.join(process.env.ProgramFiles ?? "C:\\Program Files", "GitHub CLI", "gh.exe"), path.join(process.env.LOCALAPPDATA ?? "", "Programs", "GitHub CLI", "gh.exe")]
        : ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh", path.join(os.homedir(), ".local", "bin", "gh")];
    for (const a of adaylar) if (calistirilabilirMi(a)) return { yol: a, kaynak: "sistem" };
    return null;
  }

  private arnorgGhYolu(): string {
    return path.join(this.yapilandirma.araclarDizini, "gh", "bin", process.platform === "win32" ? "gh.exe" : "gh");
  }

  /** gh komutlarının ortamı: etkileşim kapalı, renk yok, sürüm uyarısı yok */
  ghOrtami(): Record<string, string> {
    return temizOrtam({ GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1", GH_SPINNER_DISABLED: "1", CLICOLOR: "0" });
  }

  async github(): Promise<GithubKurulumu> {
    const gh = this.ghYolu();
    if (!gh) return { kurulu: false, kaynak: null, yol: null, surum: null, girisYapildi: false, kullanici: null, ad: null, gitYardimcisi: false, hata: null };
    const ortam = this.ghOrtami();
    const [surum, durum] = await Promise.all([komut(gh.yol, ["--version"], { env: ortam }), komut(gh.yol, ["auth", "status", "--hostname", "github.com"], { env: ortam, zamanMs: 20_000 })]);
    const metin = `${durum.cikti}\n${durum.hata}`;
    const girisYapildi = durum.kod === 0;
    return {
      kurulu: surum.kod === 0,
      kaynak: gh.kaynak,
      yol: gh.yol,
      surum: surum.cikti.match(/gh version (\S+)/)?.[1] ?? null,
      girisYapildi,
      kullanici: girisYapildi ? ghKullanicisi(metin) : null,
      ad: null,
      gitYardimcisi: await this.gitYardimcisiVarMi(),
      hata: surum.kod === 0 ? null : surum.hata.trim().slice(0, 300) || null,
    };
  }

  private async gitYardimcisiVarMi(): Promise<boolean> {
    const git = this.gitYolu();
    if (!git) return false;
    const s = await komut(git, ["config", "--global", "--get-regexp", "^credential\\..*helper$"]);
    return /gh(\.exe)?["']? auth git-credential/.test(s.cikti);
  }

  // ----------------------------- işlemler -----------------------------

  islem(id: string): KurulumIslemi {
    const i = this.islemler.get(id);
    if (!i) throw new ArnorgHatasi(iki("İşlem bulunamadı.", "Operation not found."), 404);
    return { ...i.kayit };
  }

  islemListesi(): KurulumIslemi[] {
    return [...this.islemler.values()].map((i) => ({ ...i.kayit })).sort((a, b) => b.baslangic.localeCompare(a.baslangic));
  }

  /** Süren işleme girdi gönderir (Claude girişinde tarayıcıdaki kod) */
  girdi(id: string, metin: string): KurulumIslemi {
    const i = this.islemler.get(id);
    if (!i || i.kayit.durum !== "calisiyor" || !i.yaz) throw new ArnorgHatasi(iki("Bu işlem girdi beklemiyor.", "This operation is not waiting for input."), 409);
    const temiz = metin.replace(/[\r\n]+/g, "").trim();
    if (!temiz || temiz.length > 2000) throw new ArnorgHatasi(iki("Kod boş olamaz.", "The code cannot be empty."));
    i.yaz(`${temiz}\r`);
    i.kayit.girdiBekliyor = false;
    this.yayinla(i, true);
    return { ...i.kayit };
  }

  iptal(id: string): KurulumIslemi {
    const i = this.islemler.get(id);
    if (!i) throw new ArnorgHatasi(iki("İşlem bulunamadı.", "Operation not found."), 404);
    if (i.kayit.durum === "calisiyor") {
      i.kayit.durum = "iptal";
      i.kayit.bitis = simdi();
      i.kayit.girdiBekliyor = false;
      try {
        i.durdur?.();
      } catch {
        // süreç zaten kapandı
      }
      this.yayinla(i, true);
    }
    return { ...i.kayit };
  }

  /** Aynı türden süren işlem varsa onu döndürür (çift tıklama iki giriş başlatmaz) */
  private suregelen(tur: KurulumIslemTuru): KurulumIslemi | null {
    for (const i of this.islemler.values()) if (i.kayit.tur === tur && i.kayit.durum === "calisiyor") return { ...i.kayit };
    return null;
  }

  private yeniIslem(tur: KurulumIslemTuru): Islem {
    this.budama();
    const i: Islem = {
      kayit: { id: kimlik(), tur, durum: "calisiyor", cikti: "", adres: null, kod: null, girdiBekliyor: false, hata: null, baslangic: simdi(), bitis: null, sonuc: null },
      yaz: null,
      durdur: null,
      yayinZamanlayici: null,
    };
    this.islemler.set(i.kayit.id, i);
    return i;
  }

  private budama(): void {
    const sinir = Date.now() - ISLEM_OMRU_MS;
    for (const [id, i] of this.islemler) if (i.kayit.bitis && Date.parse(i.kayit.bitis) < sinir) this.islemler.delete(id);
  }

  /** İlerleme olayları en çok 150 ms'de bir; bitiş hemen yayınlanır */
  private yayinla(i: Islem, hemen = false): void {
    if (hemen || i.kayit.durum !== "calisiyor") {
      if (i.yayinZamanlayici) clearTimeout(i.yayinZamanlayici);
      i.yayinZamanlayici = null;
      this.olaylar.yayinla({ tur: "kurulum.islem", islem: { ...i.kayit } });
      return;
    }
    if (i.yayinZamanlayici) return;
    i.yayinZamanlayici = setTimeout(() => {
      i.yayinZamanlayici = null;
      this.olaylar.yayinla({ tur: "kurulum.islem", islem: { ...i.kayit } });
    }, 150);
  }

  private satirEkle(i: Islem, satir: string): void {
    i.kayit.cikti = sonKisim(`${i.kayit.cikti}${i.kayit.cikti && !i.kayit.cikti.endsWith("\n") ? "\n" : ""}${satir}\n`);
    this.yayinla(i);
  }

  private bitir(i: Islem, durum: "tamam" | "hata", hata: string | null = null): void {
    if (i.kayit.durum !== "calisiyor") return;
    i.kayit.durum = durum;
    i.kayit.hata = hata;
    i.kayit.bitis = simdi();
    i.kayit.girdiBekliyor = false;
    this.yayinla(i, true);
  }

  /**
   * Süreç işlemi: PTY (etkileşimli araçlar) ya da boru. Ham çıktı biriktirilir, her parçada ayıklanıp
   * ayristir'a verilir; süreç bitince bitince() sonucu belirler.
   */
  private surecIslemi(
    tur: KurulumIslemTuru,
    yol: string,
    argumanlar: string[],
    s: {
      pty: boolean;
      env: Record<string, string>;
      cwd?: string;
      ayristir?: (i: Islem, temiz: string, yaz: (v: string) => void) => void;
      bitince: (kod: number | null, temiz: string, i: Islem) => Promise<void> | void;
    },
  ): KurulumIslemi {
    const i = this.yeniIslem(tur);
    let ham = "";
    const veri = (parca: string) => {
      ham += parca;
      if (ham.length > HAM_SINIR) ham = ham.slice(-HAM_SINIR);
      const temiz = ansiAyikla(ham);
      i.kayit.cikti = sonKisim(temiz);
      if (i.yaz) s.ayristir?.(i, temiz, i.yaz);
      this.yayinla(i);
    };
    let bitti = false;
    const sonlandi = (kod: number | null) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zaman);
      i.yaz = null;
      i.durdur = null;
      if (i.kayit.durum !== "calisiyor") return;
      Promise.resolve(s.bitince(kod, ansiAyikla(ham), i))
        .catch((h) => this.bitir(i, "hata", (h as Error).message))
        .finally(() => {
          if (i.kayit.durum === "calisiyor") this.bitir(i, kod === 0 ? "tamam" : "hata", kod === 0 ? null : iki(`İşlem ${kod ?? "?"} koduyla bitti.`, `The process exited with code ${kod ?? "?"}.`));
        });
    };
    const zaman = setTimeout(() => {
      if (i.kayit.durum === "calisiyor") {
        i.durdur?.();
        this.bitir(i, "hata", iki("İşlem zaman aşımına uğradı.", "The operation timed out."));
      }
    }, ISLEM_ZAMAN_ASIMI_MS);
    zaman.unref();
    try {
      if (s.pty) {
        const p = ptyBaslat(yol, argumanlar, { name: "xterm-256color", cols: 400, rows: 40, cwd: s.cwd ?? os.homedir(), env: s.env });
        i.yaz = (v) => p.write(v);
        i.durdur = () => p.kill();
        p.onData(veri);
        p.onExit(({ exitCode }) => sonlandi(exitCode));
      } else {
        const p = spawn(yol, argumanlar, { cwd: s.cwd ?? os.homedir(), env: s.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        i.yaz = (v) => p.stdin.write(v.replace(/\r$/, "\n"));
        i.durdur = () => p.kill();
        p.stdout.setEncoding("utf8").on("data", veri);
        p.stderr.setEncoding("utf8").on("data", veri);
        p.on("error", (h) => {
          veri(`\n${h.message}\n`);
          sonlandi(null);
        });
        p.on("close", (kod) => sonlandi(kod));
      }
    } catch (h) {
      clearTimeout(zaman);
      this.bitir(i, "hata", (h as Error).message);
    }
    this.yayinla(i, true);
    return { ...i.kayit };
  }

  // ----------------------------- Claude Code -----------------------------

  /** claude auth login --claudeai: Claude Code tarayıcıyı kendisi açar; açamazsa adres ve kod yapıştırma alanı gösterilir */
  claudeGirisBaslat(): KurulumIslemi {
    const suren = this.suregelen("claude_giris");
    if (suren) return suren;
    const ikili = this.claudeIkilisi();
    if (!ikili) throw new ArnorgHatasi(iki("Claude Code bulunamadı; önce kurun.", "Claude Code was not found; install it first."), 404);
    return this.surecIslemi("claude_giris", ikili.yol, ["auth", "login", "--claudeai"], {
      pty: true,
      env: ajanOrtami({ TERM: "xterm-256color" }),
      ayristir: (i, temiz) => {
        const adres = temiz.match(/https:\/\/\S*oauth\/authorize\S*/)?.[0];
        if (adres) i.kayit.adres = adres;
        const son = temiz.slice(-200);
        i.kayit.girdiBekliyor = /paste code here/i.test(son) && !/successful|başarılı/i.test(son);
      },
      bitince: async (kod, temiz, i) => {
        const giris = await this.claudeGirisi(ikili.yol);
        if (giris.girisYapildi && giris.abonelik) {
          this.bitir(i, "tamam");
        } else if (giris.girisYapildi) {
          this.bitir(i, "hata", iki("Giriş yapıldı ama abonelikle değil. Claude hesabınızla (Pro, Max ya da Team) yeniden giriş yapın.", "Signed in, but not with a subscription. Sign in again with your Claude account (Pro, Max or Team)."));
        } else {
          const neden = temiz.match(/Login failed:\s*(.+)/)?.[1]?.trim();
          this.bitir(i, "hata", neden ?? (kod === 0 ? iki("Giriş tamamlanmadı.", "Sign-in was not completed.") : iki(`Giriş ${kod ?? "?"} koduyla bitti.`, `Sign-in exited with code ${kod ?? "?"}.`)));
        }
        this.secenek.claudeGirisiDegisti?.();
        void this.durumuYayinla();
      },
    });
  }

  /** claude install: Claude Code'un yerel sürümünü kurar (terminalde claude komutu); ArnOrg'la gelen kopya kurar */
  claudeKur(): KurulumIslemi {
    const suren = this.suregelen("claude_kur");
    if (suren) return suren;
    const ikili = this.claudeIkilisi() ?? (gomuluClaudeYolu() ? { yol: gomuluClaudeYolu()!, kaynak: "paket" as const } : null);
    if (!ikili) throw new ArnorgHatasi(iki("Kurulum için Claude Code kopyası bulunamadı.", "No Claude Code copy was found to run the installer."), 404);
    return this.surecIslemi("claude_kur", ikili.yol, ["install"], {
      pty: true,
      env: temizOrtam({ TERM: "xterm-256color" }),
      bitince: async (kod, _temiz, i) => {
        if (kod === 0) {
          // Yerel kurulum ~/.local/bin altına iner; uygulama yeniden açılmadan bulunsun
          yolaEkle(path.join(os.homedir(), ".local", "bin"));
          const yeni = this.claudeIkilisi();
          if (yeni && yeni.kaynak !== "paket") {
            yolaEkle(path.dirname(yeni.yol));
            this.bitir(i, "tamam");
          } else {
            this.bitir(i, "hata", iki("Kurulum bitti ama claude komutu bulunamadı.", "Installation finished but the claude command was not found."));
          }
        }
        void this.durumuYayinla();
      },
    });
  }

  // ----------------------------- GitHub CLI -----------------------------

  /** gh'yi GitHub'dan indirip ArnOrg'un veri dizinine açar (yönetici izni gerekmez) */
  ghKur(): KurulumIslemi {
    const suren = this.suregelen("gh_kur");
    if (suren) return suren;
    const i = this.yeniIslem("gh_kur");
    this.yayinla(i, true);
    void this.ghIndir(i).catch((h) => {
      this.satirEkle(i, (h as Error).message);
      this.bitir(i, "hata", (h as Error).message);
    });
    return { ...i.kayit };
  }

  private async ghIndir(i: Islem): Promise<void> {
    this.satirEkle(i, iki("GitHub CLI'ın son sürümü aranıyor…", "Looking up the latest GitHub CLI release…"));
    const surum = (await sonGhSurumu()) ?? BILINEN_GH_SURUMU;
    const paket = ghPaketAdi(surum);
    if (!paket) throw new ArnorgHatasi(iki(`Bu platform için gh paketi yok (${process.platform}-${process.arch}).`, `No gh package for this platform (${process.platform}-${process.arch}).`));
    const adres = `https://github.com/cli/cli/releases/download/v${surum}/${paket.ad}`;
    const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-gh-"));
    const dosya = path.join(gecici, paket.ad);
    try {
      this.satirEkle(i, iki(`İndiriliyor: ${paket.ad}`, `Downloading: ${paket.ad}`));
      await indir(adres, dosya, (alinan, toplam) => {
        const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
        const satir = toplam ? `${mb(alinan)} / ${mb(toplam)} MB` : `${mb(alinan)} MB`;
        i.kayit.cikti = sonKisim(i.kayit.cikti.replace(/\n[\d.]+(?: \/ [\d.]+)? MB\n$/, "\n") + `${satir}\n`);
        this.yayinla(i);
      });
      if (i.kayit.durum !== "calisiyor") return;
      this.satirEkle(i, iki("Açılıyor…", "Extracting…"));
      const acilan = path.join(gecici, "acilan");
      fs.mkdirSync(acilan);
      await arsivAc(dosya, acilan, paket.zip);
      const ikili = ikiliBul(acilan, process.platform === "win32" ? "gh.exe" : "gh");
      if (!ikili) throw new ArnorgHatasi(iki("İndirilen pakette gh bulunamadı.", "gh was not found in the downloaded package."));
      // Paketin kökü (bin/, share/ …) araclar/gh altına taşınır
      const hedef = path.join(this.yapilandirma.araclarDizini, "gh");
      fs.rmSync(hedef, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(hedef), { recursive: true });
      fs.cpSync(path.dirname(path.dirname(ikili)), hedef, { recursive: true });
      const son = this.arnorgGhYolu();
      if (process.platform !== "win32") fs.chmodSync(son, 0o755);
      fs.writeFileSync(path.join(hedef, "SURUM"), surum, "utf8");
      const dogrula = await komut(son, ["--version"], { env: this.ghOrtami() });
      if (dogrula.kod !== 0) throw new ArnorgHatasi(iki(`gh çalıştırılamadı: ${dogrula.hata.trim()}`, `Could not run gh: ${dogrula.hata.trim()}`));
      this.satirEkle(i, iki(`Hazır: gh ${surum}`, `Ready: gh ${surum}`));
      this.bitir(i, "tamam");
      void this.durumuYayinla();
    } finally {
      fs.rmSync(gecici, { recursive: true, force: true });
    }
  }

  /**
   * gh auth login (tarayıcı, cihaz kodu): etkileşimsiz çalışır; kod ve adres çıktıdan okunup gösterilir.
   * Giriş bitince git'in GitHub kimliğini gh'den alması ayarlanır (gh auth setup-git).
   */
  ghGirisBaslat(): KurulumIslemi {
    const suren = this.suregelen("gh_giris");
    if (suren) return suren;
    const gh = this.ghYolu();
    if (!gh) throw new ArnorgHatasi(iki("GitHub CLI (gh) kurulu değil; önce kurun.", "GitHub CLI (gh) is not installed; install it first."), 404);
    return this.surecIslemi("gh_giris", gh.yol, ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--skip-ssh-key"], {
      pty: false,
      env: this.ghOrtami(),
      ayristir: (i, temiz, yaz) => {
        const { kod, adres } = ghCihazKodu(temiz);
        if (kod) i.kayit.kod = kod;
        if (adres) i.kayit.adres = adres;
        // Eski gh sürümleri etkileşimsizde de Enter bekleyebilir
        if (/Press Enter to open/i.test(temiz.slice(-200)) && !i.kayit.sonuc?.enter) {
          i.kayit.sonuc = { ...(i.kayit.sonuc ?? {}), enter: true };
          yaz("\n");
        }
      },
      bitince: async (kod, temiz, i) => {
        if (kod !== 0) {
          const satir = temiz.trim().split("\n").filter(Boolean).at(-1) ?? "";
          this.bitir(i, "hata", satir || iki("GitHub girişi tamamlanmadı.", "GitHub sign-in was not completed."));
          return;
        }
        const ayar = await komut(gh.yol, ["auth", "setup-git", "--hostname", "github.com"], { env: this.ghOrtami() });
        this.satirEkle(i, ayar.kod === 0 ? iki("git, GitHub kimliğini gh'den alacak şekilde ayarlandı.", "git now uses gh for GitHub credentials.") : `gh auth setup-git: ${ayar.hata.trim()}`);
        this.bitir(i, "tamam");
        void this.durumuYayinla();
      },
    });
  }

  /** gh auth setup-git (girişi önceden yapılmışsa ayrıca) */
  async gitYardimcisiAyarla(): Promise<GithubKurulumu> {
    const gh = this.ghYolu();
    if (!gh) throw new ArnorgHatasi(iki("GitHub CLI (gh) kurulu değil.", "GitHub CLI (gh) is not installed."), 404);
    const s = await komut(gh.yol, ["auth", "setup-git", "--hostname", "github.com"], { env: this.ghOrtami() });
    if (s.kod !== 0) throw new ArnorgHatasi(`gh auth setup-git: ${(s.hata || s.cikti).trim().slice(0, 300)}`, 500);
    void this.durumuYayinla();
    return this.github();
  }

  // ----------------------------- git -----------------------------

  /** Windows'ta winget ile Git for Windows, macOS'ta Xcode komut satırı araçları */
  gitKur(): KurulumIslemi {
    const suren = this.suregelen("git_kur");
    if (suren) return suren;
    if (process.platform === "win32") {
      const winget = pathIcindeBul("winget") ?? path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps", "winget.exe");
      if (!calistirilabilirMi(winget)) throw new ArnorgHatasi(iki("winget bulunamadı. Git'i https://git-scm.com/download/win adresinden kurun.", "winget was not found. Install Git from https://git-scm.com/download/win."), 404);
      return this.surecIslemi("git_kur", winget, ["install", "--id", "Git.Git", "-e", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements", "--silent"], {
        pty: true,
        env: temizOrtam(),
        bitince: async (kod, _t, i) => {
          if (kod === 0 && this.gitYolu()) this.bitir(i, "tamam");
          void this.durumuYayinla();
        },
      });
    }
    if (process.platform === "darwin") {
      return this.surecIslemi("git_kur", "/usr/bin/xcode-select", ["--install"], {
        pty: false,
        env: temizOrtam(),
        bitince: (_kod, _t, i) => {
          // Kurulum macOS'un kendi penceresinde sürer; bitince durum yeniden yoklanır
          this.satirEkle(i, iki("macOS kurulum penceresini tamamlayın, sonra durumu yenileyin.", "Finish the macOS installer window, then refresh the status."));
          this.bitir(i, "tamam");
        },
      });
    }
    throw new ArnorgHatasi(iki("git'i paket yöneticinizle kurun: sudo apt install git (Debian, Ubuntu), sudo dnf install git (Fedora).", "Install git with your package manager: sudo apt install git (Debian, Ubuntu), sudo dnf install git (Fedora)."), 400);
  }

  // ----------------------------- diğer -----------------------------

  /** Başka modüllerin (klonlama, depo açma) kurulum işlemi olarak yürüttüğü iş */
  disIslem(tur: KurulumIslemTuru): { kayit: KurulumIslemi; satir: (m: string) => void; bitir: (durum: "tamam" | "hata", hata?: string | null, sonuc?: Record<string, unknown> | null) => void; surec: (yol: string, argumanlar: string[], s: { env: Record<string, string>; cwd?: string }) => Promise<KomutSonucu> } {
    const i = this.yeniIslem(tur);
    this.yayinla(i, true);
    return {
      kayit: i.kayit,
      satir: (m) => this.satirEkle(i, m),
      bitir: (durum, hata = null, sonuc = null) => {
        if (sonuc) i.kayit.sonuc = sonuc;
        this.bitir(i, durum, hata);
      },
      surec: (yol, argumanlar, s) =>
        new Promise((coz) => {
          const p = spawn(yol, argumanlar, { cwd: s.cwd, env: s.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
          let cikti = "";
          let hata = "";
          const ekle = (parca: string, akis: "o" | "e") => {
            if (akis === "o") cikti += parca;
            else hata += parca;
            const temiz = ansiAyikla(parca);
            i.kayit.cikti = sonKisim(i.kayit.cikti + temiz);
            this.yayinla(i);
          };
          i.durdur = () => p.kill();
          p.stdout.setEncoding("utf8").on("data", (d: string) => ekle(d, "o"));
          p.stderr.setEncoding("utf8").on("data", (d: string) => ekle(d, "e"));
          p.on("error", (h) => coz({ kod: null, cikti, hata: hata + h.message }));
          p.on("close", (kod) => {
            i.durdur = null;
            coz({ kod, cikti, hata });
          });
        }),
    };
  }

  kapat(): void {
    for (const i of this.islemler.values()) {
      if (i.kayit.durum === "calisiyor") {
        try {
          i.durdur?.();
        } catch {
          // kapanmış
        }
      }
      if (i.yayinZamanlayici) clearTimeout(i.yayinZamanlayici);
    }
  }
}

// ---------------------------------------------------------------------------
// İndirme ve arşiv
// ---------------------------------------------------------------------------

/** GitHub CLI'ın son sürümü: önce API, olmazsa sürüm sayfasının yönlendirmesi */
async function sonGhSurumu(): Promise<string | null> {
  const basliklar = { "user-agent": "ArnOrg", accept: "application/vnd.github+json" };
  try {
    const r = await fetch("https://api.github.com/repos/cli/cli/releases/latest", { headers: basliklar, signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const j = (await r.json()) as { tag_name?: string };
      const s = j.tag_name?.replace(/^v/, "");
      if (s && /^\d+\.\d+\.\d+$/.test(s)) return s;
    }
  } catch {
    // ağ yok ya da vekil engelliyor
  }
  try {
    const r = await fetch("https://github.com/cli/cli/releases/latest", { redirect: "manual", headers: { "user-agent": "ArnOrg" }, signal: AbortSignal.timeout(10_000) });
    const s = r.headers.get("location")?.match(/\/tag\/v(\d+\.\d+\.\d+)/)?.[1];
    if (s) return s;
  } catch {
    // yok sayılır
  }
  return null;
}

/** Dosya indirir; Node'un fetch'i olmazsa (vekil, eski sistem) curl denenir */
async function indir(adres: string, hedef: string, ilerleme: (alinan: number, toplam: number | null) => void): Promise<void> {
  try {
    const r = await fetch(adres, { headers: { "user-agent": "ArnOrg" }, redirect: "follow", signal: AbortSignal.timeout(10 * 60_000) });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const toplam = Number(r.headers.get("content-length")) || null;
    let alinan = 0;
    let son = 0;
    const akis = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream<Uint8Array>);
    akis.on("data", (parca: Buffer) => {
      alinan += parca.length;
      if (Date.now() - son > 200) {
        son = Date.now();
        ilerleme(alinan, toplam);
      }
    });
    await pipeline(akis, fs.createWriteStream(hedef));
    ilerleme(alinan, toplam);
    return;
  } catch (h) {
    const curl = pathIcindeBul("curl");
    if (!curl) throw new ArnorgHatasi(iki(`İndirilemedi: ${(h as Error).message}`, `Download failed: ${(h as Error).message}`), 502);
    const s = await komut(curl, ["-fsSL", "--retry", "2", "-o", hedef, adres], { zamanMs: 10 * 60_000 });
    if (s.kod !== 0) throw new ArnorgHatasi(iki(`İndirilemedi: ${s.hata.trim() || (h as Error).message}`, `Download failed: ${s.hata.trim() || (h as Error).message}`), 502);
    ilerleme(fs.statSync(hedef).size, fs.statSync(hedef).size);
  }
}

/** tar.gz ve zip açar: tar (Windows 10+ tar.exe zip'i de açar), macOS'ta ditto */
async function arsivAc(dosya: string, hedef: string, zip: boolean): Promise<void> {
  let s: KomutSonucu;
  if (zip && process.platform === "darwin") s = await komut("/usr/bin/ditto", ["-x", "-k", dosya, hedef], { zamanMs: 120_000 });
  else if (zip && process.platform !== "win32" && pathIcindeBul("unzip")) s = await komut("unzip", ["-q", dosya, "-d", hedef], { zamanMs: 120_000 });
  else s = await komut(process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar", [zip ? "-xf" : "-xzf", dosya, "-C", hedef], { zamanMs: 120_000 });
  if (s.kod !== 0) throw new ArnorgHatasi(iki(`Arşiv açılamadı: ${s.hata.trim()}`, `Could not extract the archive: ${s.hata.trim()}`), 500);
}

/** Dizinde bin/<ad> ikilisini arar */
function ikiliBul(kok: string, ad: string, derinlik = 4): string | null {
  if (derinlik < 0) return null;
  let girdiler: fs.Dirent[];
  try {
    girdiler = fs.readdirSync(kok, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const g of girdiler) if (g.isFile() && g.name === ad && path.basename(kok) === "bin") return path.join(kok, g.name);
  for (const g of girdiler) {
    if (!g.isDirectory()) continue;
    const bulunan = ikiliBul(path.join(kok, g.name), ad, derinlik - 1);
    if (bulunan) return bulunan;
  }
  return null;
}
