// Kod düzenleyici (Stüdyo'daki VS Code tezgâhı) için dosya sistemi, arama ve git uçları.
// Sözleşme: docs/API.md, "Kod düzenleyici". Stüdyo bu uçları "arnorg:" şemalı bir dosya sistemi
// sağlayıcısına bağlar: arnorg:/<projeId>/<alan>/<yol>.
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { FsDurumu, FsGirdisi, FsTuru, GitBasvurusu, GitCommitSonucu, GitDegisikligi, GitDegisiklikTuru, GitDurumu } from "@arnorg/ortak";
import { z } from "zod";
import { guvenliYol } from "./dosyalar.js";
import * as gitIslemleri from "./git.js";
import { dosyaListesi, metinAra } from "./kod-arama.js";
import { temizOrtam } from "./ortam.js";
import type { Sirket } from "./sirket.js";
import { ArnorgHatasi } from "./yardimci.js";

/** Okunup yazılabilecek en büyük dosya */
export const ICERIK_SINIRI = 50 * 1024 * 1024;
/** Kurulun kaydettiği dosya bu süre ajanlara kilitli kalır (sirket.ts ile aynı) */
const KULLANICI_KILIDI_MS = 30_000;
/** Bir ajanın son düzenlemesi bu süre "düzenliyor" sayılır (PUT /dosya ile aynı) */
const DUZENLEME_SURESI_MS = 5 * 60_000;

const execFileP = promisify(execFile);

/** Dosyayı şu an düzenleyen ajan: son 5 dakikada yazmış ve hâlâ çalışıyor ya da karar bekliyor */
export function duzenleyenAjan(sirket: Sirket, tam: string): string | null {
  const d = sirket.duzenlemeler.get(tam);
  if (!d) return null;
  const a = sirket.depo.ajan(d.ajanId);
  const aktif = a && (a.durum === "calisiyor" || a.durum === "karar_bekliyor");
  return aktif && Date.now() - d.zaman < DUZENLEME_SURESI_MS ? d.ajanId : null;
}

/** Göreli yol .git içinde mi (worktree'lerde .git bir dosyadır; o da korunur) */
export function gitIcindeMi(goreli: string): boolean {
  const parcalar = goreli.replace(/\\/g, "/").split("/");
  return parcalar.some((p) => (process.platform === "win32" ? p.toLowerCase() : p) === ".git");
}

/** alt yolu ust yolunun içinde ya da ona eşit mi */
function icinde(ust: string, alt: string): boolean {
  const fark = path.relative(ust, alt);
  return fark === "" || (!fark.startsWith("..") && !path.isAbsolute(fark));
}

function gercek(yol: string): string | null {
  try {
    return fs.realpathSync.native(yol);
  } catch {
    return null;
  }
}

/** Sembolik bağlantılar çözüldüğünde yol hâlâ çalışma alanında mı; olmayan yolda en yakın var olan üst klasöre bakılır */
function gercekteIcinde(kok: string, tam: string): boolean {
  const kokGercek = gercek(kok) ?? path.resolve(kok);
  let aday = tam;
  for (;;) {
    const g = gercek(aday);
    if (g) return icinde(kokGercek, g);
    const ust = path.dirname(aday);
    if (ust === aday) return false;
    aday = ust;
  }
}

function hataKodu(h: unknown): string | undefined {
  return (h as NodeJS.ErrnoException)?.code;
}

/** Düğüm hata kodunu API hatasına çevirir */
function fsHatasi(h: unknown, yol: string): ArnorgHatasi {
  switch (hataKodu(h)) {
    case "ENOENT":
      return new ArnorgHatasi(`Bulunamadı: ${yol}`, 404);
    case "EEXIST":
      return new ArnorgHatasi(`Zaten var: ${yol}`, 409);
    case "ENOTEMPTY":
      return new ArnorgHatasi(`Klasör boş değil: ${yol}`, 409);
    case "EISDIR":
      return new ArnorgHatasi(`Bu bir klasör: ${yol}`, 400);
    case "ENOTDIR":
      return new ArnorgHatasi(`Bu bir klasör değil: ${yol}`, 400);
    case "EACCES":
    case "EPERM":
      return new ArnorgHatasi(`Erişim izni yok: ${yol}`, 403);
    default:
      return h instanceof ArnorgHatasi ? h : new ArnorgHatasi(`Dosya işlemi başarısız: ${(h as Error).message}`, 500);
  }
}

/** Git çıktısını ham bayt olarak alır (ikili dosyalar için) */
async function gitHam(dizin: string, argumanlar: string[]): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileP("git", argumanlar, {
      cwd: dizin,
      encoding: "buffer",
      maxBuffer: ICERIK_SINIRI,
      windowsHide: true,
      env: temizOrtam({ GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" }),
    });
    return stdout;
  } catch {
    return null;
  }
}

/** git status --porcelain=v1 -z çıktısını gruplara ayırır */
export function durumAyristir(cikti: string): Pick<GitDurumu, "hazirlanan" | "degisen" | "cakisan"> {
  const hazirlanan: GitDegisikligi[] = [];
  const degisen: GitDegisikligi[] = [];
  const cakisan: GitDegisikligi[] = [];
  const parcalar = cikti.split("\0");
  const tur = (k: string): GitDegisiklikTuru => (k === "T" ? "M" : (k as GitDegisiklikTuru));
  for (let i = 0; i < parcalar.length; i++) {
    const p = parcalar[i]!;
    if (p.length < 4) continue;
    const x = p[0]!;
    const y = p[1]!;
    const yol = p.slice(3);
    let eskiYol: string | undefined;
    if (x === "R" || x === "C" || y === "R" || y === "C") eskiYol = parcalar[++i];
    if (x === "?" && y === "?") {
      degisen.push({ yol, tur: "?" });
      continue;
    }
    if (x === "!") continue;
    if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      cakisan.push({ yol, tur: "U" });
      continue;
    }
    if ("MTADRC".includes(x)) hazirlanan.push({ yol, tur: tur(x), ...(eskiYol && (x === "R" || x === "C") ? { eskiYol } : {}) });
    if ("MTADRC".includes(y)) degisen.push({ yol, tur: tur(y), ...(eskiYol && (y === "R" || y === "C") ? { eskiYol } : {}) });
  }
  return { hazirlanan, degisen, cakisan };
}

/** git diff --name-status -z çıktısı */
function adDurumuAyristir(cikti: string): GitDegisikligi[] {
  const sonuc: GitDegisikligi[] = [];
  const p = cikti.split("\0");
  for (let i = 0; i < p.length; i++) {
    const kod = p[i];
    if (!kod) continue;
    const k = kod[0]!;
    if (k === "R" || k === "C") {
      const eski = p[++i] ?? "";
      const yeni = p[++i] ?? "";
      sonuc.push({ yol: yeni, eskiYol: eski, tur: k });
    } else {
      const yol = p[++i] ?? "";
      sonuc.push({ yol, tur: k === "T" ? "M" : (k as GitDegisiklikTuru) });
    }
  }
  return sonuc;
}

/** Ajan alanının temel dalla ortak atası; bulunamazsa temel dalın kendisi */
async function temelBasvurusu(kok: string, temelDal: string): Promise<string> {
  try {
    return (await gitIslemleri.git(kok, ["merge-base", temelDal, "HEAD"])).trim() || temelDal;
  } catch {
    return temelDal;
  }
}

/** Git yol belirteci: yol olduğu gibi yorumlanır (glob değil) */
const birebir = (y: string) => `:(literal)${y.replace(/\\/g, "/")}`;

const semalar = {
  klasor: z.object({ alan: z.string().min(1), yol: z.string().min(1) }),
  tasi: z.object({ alan: z.string().min(1), kaynak: z.string().min(1), hedef: z.string().min(1), ustune: z.boolean().optional() }),
  ara: z.object({
    alan: z.string().min(1),
    desen: z.string().min(1).max(10_000),
    regex: z.boolean().optional(),
    harfDuyarli: z.boolean().optional(),
    tamSozcuk: z.boolean().optional(),
    dahil: z.array(z.string().max(2000)).max(500).optional(),
    haric: z.array(z.string().max(2000)).max(500).optional(),
    sinir: z.number().int().positive().optional(),
    enBuyukBoyut: z.number().int().positive().optional(),
  }),
  yollar: z.object({ alan: z.string().min(1), yollar: z.array(z.string().min(1)).min(1).max(5000) }),
  commit: z.object({ alan: z.string().min(1), mesaj: z.string().max(20_000), tumu: z.boolean().optional() }),
};

export function fsUclariniKur(app: FastifyInstance, sirket: Sirket): void {
  // Ham bayt gövdesi (dosya yazma); JSON uçları etkilenmez
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: ICERIK_SINIRI }, (_istek, govde, bitti) => bitti(null, govde));

  // Stüdyo sayfası çapraz köken yalıtımıyla sunulur: tezgâhtaki TypeScript dil sunucusu proje çapında
  // IntelliSense için SharedArrayBuffer ister. "credentialless" dış kaynakları kimliksiz yükler, engellemez.
  app.addHook("onSend", async (istek, yanit, yuk) => {
    const yol = istek.url.split("?")[0] ?? "";
    if (!yol.startsWith("/api/") && !yol.startsWith("/ws")) {
      yanit.header("Cross-Origin-Opener-Policy", "same-origin");
      yanit.header("Cross-Origin-Embedder-Policy", "credentialless");
    }
    return yuk;
  });

  const param = (i: FastifyRequest, ad: string) => String((i.params as Record<string, string>)[ad] ?? "");
  const sorgu = (i: FastifyRequest, ad: string) => (i.query as Record<string, string | undefined>)[ad];
  const evet = (d: string | undefined) => d === "1" || d === "true";

  /** İstekten alan kökü ve dosya yolu */
  const konum = (pid: string, alan: string, yol: string) => {
    const kok = sirket.alanYolu(pid, alan || "ana");
    const goreli = yol.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    const tam = goreli ? guvenliYol(kok, goreli) : path.resolve(kok);
    if (!gercekteIcinde(kok, tam)) throw new ArnorgHatasi("Çalışma alanının dışını gösteren bağlantı açılamaz.", 403);
    return { kok, goreli, tam };
  };
  const sorgudanKonum = (i: FastifyRequest) => konum(param(i, "pid"), sorgu(i, "alan") ?? "ana", sorgu(i, "yol") ?? "");
  const yazilabilir = (goreli: string) => {
    if (!goreli) throw new ArnorgHatasi("Çalışma alanının kökü değiştirilemez.", 403);
    if (gitIcindeMi(goreli)) throw new ArnorgHatasi(".git içindeki dosyalar düzenleyiciden değiştirilemez.", 403);
  };
  const ajanKilidi = (tam: string) => {
    const d = duzenleyenAjan(sirket, tam);
    if (d) throw new ArnorgHatasi(`${sirket.depo.ajan(d)?.ad ?? "Bir ajan"} bu dosyayı düzenliyor. Önce ajanı duraklatın.`, 409);
  };
  const degisti = (pid: string, alan: string, goreli: string) =>
    sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: pid, alan, yol: goreli, ajanId: null });

  async function durum(kok: string, goreli: string, tam: string): Promise<FsDurumu> {
    let l: fs.Stats;
    try {
      l = await fsp.lstat(tam);
    } catch (h) {
      throw fsHatasi(h, goreli || ".");
    }
    let s = l;
    let tur: FsTuru;
    const baglanti = l.isSymbolicLink();
    if (baglanti) {
      const g = gercek(tam);
      const k = gercek(kok) ?? kok;
      if (g && icinde(k, g)) {
        s = await fsp.stat(tam);
        tur = s.isDirectory() ? "klasor" : "dosya";
      } else tur = "baglanti";
    } else tur = l.isDirectory() ? "klasor" : l.isFile() ? "dosya" : "baglanti";
    const duzenleyen = tur === "dosya" ? duzenleyenAjan(sirket, tam) : null;
    return {
      tur,
      baglanti,
      boyut: tur === "klasor" ? 0 : s.size,
      degisme: Math.floor(s.mtimeMs),
      olusturma: Math.floor(s.birthtimeMs || s.ctimeMs),
      saltOkunur: Boolean(duzenleyen) || gitIcindeMi(goreli),
      duzenleyenAjanId: duzenleyen,
    };
  }

  // ---------------- dosya sistemi ----------------
  // yoksa=bos: olmayan yolda 404 yerine 200 ve null (düzenleyici .vscode/settings.json gibi dosyaları sürekli
  // yoklar; tarayıcı konsolu her 404'ü hata olarak yazar)
  app.get("/api/projeler/:pid/fs/stat", async (i): Promise<FsDurumu | null> => {
    const { kok, goreli, tam } = sorgudanKonum(i);
    if (sorgu(i, "yoksa") === "bos" && !fs.existsSync(tam)) return null;
    return durum(kok, goreli, tam);
  });

  app.get("/api/projeler/:pid/fs/liste", async (i): Promise<FsGirdisi[]> => {
    const { kok, goreli, tam } = sorgudanKonum(i);
    let girdiler: fs.Dirent[];
    try {
      girdiler = await fsp.readdir(tam, { withFileTypes: true });
    } catch (h) {
      throw fsHatasi(h, goreli || ".");
    }
    const kokGercek = gercek(kok) ?? kok;
    return girdiler.map((g): FsGirdisi => {
      if (g.isSymbolicLink()) {
        const hedef = gercek(path.join(tam, g.name));
        if (!hedef || !icinde(kokGercek, hedef)) return { ad: g.name, tur: "baglanti", baglanti: true };
        try {
          return { ad: g.name, tur: fs.statSync(hedef).isDirectory() ? "klasor" : "dosya", baglanti: true };
        } catch {
          return { ad: g.name, tur: "baglanti", baglanti: true };
        }
      }
      return { ad: g.name, tur: g.isDirectory() ? "klasor" : g.isFile() ? "dosya" : "baglanti", baglanti: false };
    });
  });

  app.get("/api/projeler/:pid/fs/icerik", async (i, yanit: FastifyReply) => {
    const { goreli, tam } = sorgudanKonum(i);
    // yoksa=bos: olmayan dosyada 404 yerine 204 (boş dosya 200 ve boş gövdedir)
    if (sorgu(i, "yoksa") === "bos" && !fs.existsSync(tam)) return yanit.code(204).send();
    let s: fs.Stats;
    try {
      s = await fsp.stat(tam);
    } catch (h) {
      throw fsHatasi(h, goreli);
    }
    if (s.isDirectory()) throw new ArnorgHatasi(`Bu bir klasör: ${goreli}`, 400);
    if (s.size > ICERIK_SINIRI) throw new ArnorgHatasi("Dosya 50 MB'tan büyük; düzenleyicide açılamaz.", 413);
    const tampon = await fsp.readFile(tam).catch((h: unknown) => {
      throw fsHatasi(h, goreli);
    });
    return yanit.type("application/octet-stream").header("Cache-Control", "no-store").send(tampon);
  });

  app.put("/api/projeler/:pid/fs/icerik", { bodyLimit: ICERIK_SINIRI }, async (i): Promise<FsDurumu> => {
    const pid = param(i, "pid");
    const alan = sorgu(i, "alan") ?? "ana";
    const { kok, goreli, tam } = sorgudanKonum(i);
    yazilabilir(goreli);
    const govde = Buffer.isBuffer(i.body) ? i.body : Buffer.alloc(0);
    let var_ = false;
    try {
      const s = await fsp.stat(tam);
      if (s.isDirectory()) throw new ArnorgHatasi(`Bu bir klasör: ${goreli}`, 400);
      var_ = true;
    } catch (h) {
      if (h instanceof ArnorgHatasi) throw h;
      if (hataKodu(h) !== "ENOENT") throw fsHatasi(h, goreli);
    }
    if (!var_ && !evet(sorgu(i, "olustur"))) throw new ArnorgHatasi(`Bulunamadı: ${goreli}`, 404);
    if (var_ && !evet(sorgu(i, "ustune"))) throw new ArnorgHatasi(`Zaten var: ${goreli}`, 409);
    ajanKilidi(tam);
    // Kaydedilen dosya bir süre ajanlara kilitlenir (denetim kapısı bu haritaya bakar)
    sirket.kullaniciKilitleri.set(tam, Date.now() + KULLANICI_KILIDI_MS);
    try {
      await fsp.mkdir(path.dirname(tam), { recursive: true });
      await fsp.writeFile(tam, govde);
    } catch (h) {
      throw fsHatasi(h, goreli);
    }
    // Dosya bir ajanın çalışma alanındaysa ajana "yeniden oku" notu düşülür
    const alanAjan = alan !== "ana" ? sirket.depo.ajan(alan) : null;
    if (alanAjan && (alanAjan.durum === "calisiyor" || alanAjan.durum === "bosta")) {
      void sirket.ajanaMesaj(alanAjan.id, `Yönetim kurulu ${goreli} dosyasını düzenledi. Bu dosyaya dokunmadan önce yeniden oku.`, "next", { tur: "sistem" }).catch(() => undefined);
    }
    degisti(pid, alan, goreli);
    return durum(kok, goreli, tam);
  });

  app.post("/api/projeler/:pid/fs/klasor", async (i) => {
    const g = semalar.klasor.parse(i.body ?? {});
    const pid = param(i, "pid");
    const { goreli, tam } = konum(pid, g.alan, g.yol);
    yazilabilir(goreli);
    try {
      await fsp.mkdir(tam);
    } catch (h) {
      throw fsHatasi(h, goreli);
    }
    degisti(pid, g.alan, goreli);
    return { tamam: true };
  });

  app.delete("/api/projeler/:pid/fs", async (i) => {
    const pid = param(i, "pid");
    const alan = sorgu(i, "alan") ?? "ana";
    const { goreli, tam } = sorgudanKonum(i);
    yazilabilir(goreli);
    let s: fs.Stats;
    try {
      s = await fsp.lstat(tam);
    } catch (h) {
      throw fsHatasi(h, goreli);
    }
    try {
      if (s.isDirectory()) {
        if (evet(sorgu(i, "ozyinelemeli"))) await fsp.rm(tam, { recursive: true });
        else await fsp.rmdir(tam);
      } else {
        ajanKilidi(tam);
        sirket.kullaniciKilitleri.set(tam, Date.now() + KULLANICI_KILIDI_MS);
        await fsp.unlink(tam);
      }
    } catch (h) {
      throw fsHatasi(h, goreli);
    }
    degisti(pid, alan, goreli);
    return { tamam: true };
  });

  app.post("/api/projeler/:pid/fs/tasi", async (i) => {
    const g = semalar.tasi.parse(i.body ?? {});
    const pid = param(i, "pid");
    const kaynak = konum(pid, g.alan, g.kaynak);
    const hedef = konum(pid, g.alan, g.hedef);
    yazilabilir(kaynak.goreli);
    yazilabilir(hedef.goreli);
    try {
      await fsp.lstat(kaynak.tam);
    } catch (h) {
      throw fsHatasi(h, kaynak.goreli);
    }
    ajanKilidi(kaynak.tam);
    // Yalnız büyük/küçük harf değişen ad (Windows ve macOS'ta aynı dosya)
    const ayni = process.platform !== "linux" && kaynak.tam.toLowerCase() === hedef.tam.toLowerCase();
    if (!ayni && fs.existsSync(hedef.tam)) {
      if (!g.ustune) throw new ArnorgHatasi(`Zaten var: ${hedef.goreli}`, 409);
      ajanKilidi(hedef.tam);
      await fsp.rm(hedef.tam, { recursive: true, force: true });
    }
    try {
      await fsp.mkdir(path.dirname(hedef.tam), { recursive: true });
      await fsp.rename(kaynak.tam, hedef.tam);
    } catch (h) {
      throw fsHatasi(h, kaynak.goreli);
    }
    degisti(pid, g.alan, kaynak.goreli);
    degisti(pid, g.alan, hedef.goreli);
    return { tamam: true };
  });

  // ---------------- hızlı açma ve arama ----------------
  app.get("/api/projeler/:pid/fs/dosyalar", async (i): Promise<string[]> => {
    const kok = sirket.alanYolu(param(i, "pid"), sorgu(i, "alan") ?? "ana");
    return dosyaListesi(kok);
  });

  app.post("/api/projeler/:pid/fs/ara", async (i) => {
    const g = semalar.ara.parse(i.body ?? {});
    const kok = sirket.alanYolu(param(i, "pid"), g.alan);
    const soket = i.raw.socket;
    return metinAra(kok, { ...g, iptalMi: () => soket.destroyed });
  });

  // ---------------- git ----------------
  const yalnizAna = (alan: string) => {
    if (alan !== "ana") throw new ArnorgHatasi("Ajan çalışma alanları kaynak denetiminde salt okunurdur; git işlemleri yalnız ana repoda yapılır.", 403);
  };
  const yollariDenetle = (kok: string, yollar: string[]) =>
    yollar.map((y) => {
      const goreli = y.replace(/\\/g, "/").replace(/^\/+/, "");
      guvenliYol(kok, goreli);
      if (!goreli || gitIcindeMi(goreli)) throw new ArnorgHatasi(`Geçersiz yol: ${y}`);
      return goreli;
    });

  app.get("/api/projeler/:pid/git/durum", async (i): Promise<GitDurumu> => {
    const p = sirket.proje(param(i, "pid"));
    const alan = sorgu(i, "alan") ?? "ana";
    const kok = sirket.alanYolu(p.id, alan);
    const bos: GitDurumu = { alan, ana: alan === "ana", repo: false, dal: "", temelDal: p.varsayilanDal, hazirlanan: [], degisen: [], cakisan: [], temeleGore: [] };
    if (!(await gitIslemleri.repoMu(kok))) return bos;
    const [dal, cikti] = await Promise.all([
      gitIslemleri.mevcutDal(kok).catch(() => "HEAD"),
      gitIslemleri.git(kok, ["-c", "core.quotePath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    ]);
    const sonuc: GitDurumu = { ...bos, repo: true, dal, ...durumAyristir(cikti) };
    if (alan !== "ana" && (await gitIslemleri.commitVarMi(kok))) {
      const temel = await temelBasvurusu(kok, p.varsayilanDal);
      const [fark, izlenmeyen] = await Promise.all([
        gitIslemleri.git(kok, ["-c", "core.quotePath=false", "diff", "--name-status", "-z", "-M", temel, "--"]).catch(() => ""),
        gitIslemleri.git(kok, ["-c", "core.quotePath=false", "ls-files", "-z", "--others", "--exclude-standard"]).catch(() => ""),
      ]);
      sonuc.temeleGore = adDurumuAyristir(fark);
      for (const y of izlenmeyen.split("\0")) if (y && !sonuc.temeleGore.some((x) => x.yol === y)) sonuc.temeleGore.push({ yol: y, tur: "A" });
      sonuc.temeleGore.sort((a, b) => a.yol.localeCompare(b.yol));
    }
    return sonuc;
  });

  app.get("/api/projeler/:pid/git/icerik", async (i, yanit: FastifyReply) => {
    const p = sirket.proje(param(i, "pid"));
    const alan = sorgu(i, "alan") ?? "ana";
    const kok = sirket.alanYolu(p.id, alan);
    const goreli = (sorgu(i, "yol") ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!goreli) throw new ArnorgHatasi("Yol gerekli.");
    guvenliYol(kok, goreli);
    const ref = (sorgu(i, "ref") ?? "HEAD") as GitBasvurusu;
    let nesne: string;
    if (ref === "indeks") nesne = `:${goreli}`;
    else if (ref === "temel") nesne = `${await temelBasvurusu(kok, p.varsayilanDal)}:${goreli}`;
    else if (ref === "HEAD") nesne = `HEAD:${goreli}`;
    else throw new ArnorgHatasi("Geçersiz başvuru; HEAD, indeks ya da temel olmalı.");
    const tampon = await gitHam(kok, ["show", nesne]);
    if (!tampon) {
      // yoksa=bos: yeni dosyanın eski sürümü yoktur; 404 yerine 204 (satır içi fark her yeni dosyada sorar)
      if (sorgu(i, "yoksa") === "bos") return yanit.code(204).send();
      throw new ArnorgHatasi(`Bu sürümde dosya yok: ${goreli}`, 404);
    }
    return yanit.type("application/octet-stream").header("Cache-Control", "no-store").send(tampon);
  });

  app.post("/api/projeler/:pid/git/hazirla", async (i) => {
    const g = semalar.yollar.parse(i.body ?? {});
    yalnizAna(g.alan);
    const kok = sirket.alanYolu(param(i, "pid"), g.alan);
    const yollar = yollariDenetle(kok, g.yollar);
    await gitIslemleri.git(kok, ["add", "-A", "--", ...yollar.map(birebir)]);
    return { tamam: true };
  });

  app.post("/api/projeler/:pid/git/hazirlamayi-geri-al", async (i) => {
    const g = semalar.yollar.parse(i.body ?? {});
    yalnizAna(g.alan);
    const kok = sirket.alanYolu(param(i, "pid"), g.alan);
    const yollar = yollariDenetle(kok, g.yollar).map(birebir);
    if (await gitIslemleri.commitVarMi(kok)) await gitIslemleri.git(kok, ["reset", "-q", "HEAD", "--", ...yollar]);
    else await gitIslemleri.git(kok, ["rm", "--cached", "-r", "-q", "--", ...yollar]);
    return { tamam: true };
  });

  app.post("/api/projeler/:pid/git/degisiklikleri-at", async (i) => {
    const g = semalar.yollar.parse(i.body ?? {});
    yalnizAna(g.alan);
    const pid = param(i, "pid");
    const kok = sirket.alanYolu(pid, g.alan);
    const yollar = yollariDenetle(kok, g.yollar);
    const izlenmeyen = new Set(
      (await gitIslemleri.git(kok, ["-c", "core.quotePath=false", "ls-files", "-z", "--others", "--exclude-standard", "--", ...yollar.map(birebir)])).split("\0").filter(Boolean),
    );
    const izlenen = yollar.filter((y) => !izlenmeyen.has(y));
    for (const y of izlenmeyen) {
      const tam = guvenliYol(kok, y);
      ajanKilidi(tam);
      await fsp.rm(tam, { force: true });
    }
    if (izlenen.length) {
      for (const y of izlenen) ajanKilidi(guvenliYol(kok, y));
      await gitIslemleri.git(kok, ["checkout", "-q", "--", ...izlenen.map(birebir)]);
    }
    for (const y of yollar) degisti(pid, g.alan, y);
    return { tamam: true };
  });

  app.post("/api/projeler/:pid/git/commit", async (i): Promise<GitCommitSonucu> => {
    const g = semalar.commit.parse(i.body ?? {});
    yalnizAna(g.alan);
    const kok = sirket.alanYolu(param(i, "pid"), g.alan);
    const mesaj = g.mesaj.trim();
    if (!mesaj) throw new ArnorgHatasi("Commit mesajı boş olamaz.");
    if (g.tumu) await gitIslemleri.git(kok, ["add", "-A"]);
    // Aşamada değişiklik var mı: diff --cached --quiet değişiklik varsa 1 döner
    const bos = await execFileP("git", ["diff", "--cached", "--quiet"], { cwd: kok, windowsHide: true, env: temizOrtam({ GIT_TERMINAL_PROMPT: "0" }) }).then(
      () => true,
      (h: { code?: number }) => {
        if (h.code === 1) return false;
        throw new ArnorgHatasi("git diff başarısız.", 500);
      },
    );
    if (bos && (await gitIslemleri.commitVarMi(kok))) throw new ArnorgHatasi("Commit'lenecek aşamaya alınmış değişiklik yok.", 409);
    // Kimlik makinedeki git yapılandırmasından gelir; mesaja imza ya da Co-Authored-By eklenmez
    await gitIslemleri.git(kok, ["commit", "-q", "-m", mesaj]);
    const commit = (await gitIslemleri.git(kok, ["rev-parse", "HEAD"])).trim();
    return { commit };
  });

}
