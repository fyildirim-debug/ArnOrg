// 0.0.8 geçişi: kişisel worktree ve dallardan ortak projeye. Açılışta her projede, eski çalışma alanı ya da dalı
// olan çalışanlar için (git sırasında):
//   - Çalışma alanında commit'lenmemiş değişiklik varsa worktree ve dal korunur (kalan: kirli).
//   - Dalda çalışma dalında olmayan commit'ler varsa çalışma dalına birleştirilir; temiz birleşmezse geri alınır,
//     worktree ve dal korunur (kalan: cakisma). Ana repo çalışma dalında değilse ya da birleştirme başka bir nedenle
//     yapılamazsa da korunur (kalan: hata).
//   - Temiz ve tamamen birleşmiş worktree kaldırılır, birleşmiş dal güvenle (-d) silinir. git worktree remove yok
//     sayılan dosyaları da siler: yeniden üretilemeyen yok sayılan dosya (.env, yerel ayar, veritabanı…) varsa
//     worktree korunur (kalan: kirli); bağımlılık, derleme çıktısı ve önbellek gibi üretilenler sorun değildir.
//   - Çalışanın kaydı ortak projeye çevrilir (çalışma alanı ve dal boşalır; worktree'de açılan konuşma sürdürülmez).
// Bekleyen eski birleştirme onayları kapanır, kalite kapısında yarım kalanların kaydı sonuçlanır. Hiçbir iş silinmez.
import fs from "node:fs";
import { BIRLESTIRME_SON_DURUMLARI, type EskiCalismaAlani, type Proje } from "@arnorg/ortak";
import { birlestirmeVerisi, kaliteOku } from "../birlestirme-kuyrugu.js";
import type { Depo } from "../depo.js";
import { iki } from "../dil.js";
import * as gitIslemleri from "../git.js";
import { kisalt, simdi } from "../yardimci.js";
import type { GitSirasi } from "./git-sirasi.js";

export interface GecisBaglami {
  depo: Depo;
  git: GitSirasi;
  /** .arnorg değişikliklerini commit'ler (git sırasının içinden çağrılır) */
  arnorgCommitle(projeId: string): Promise<boolean>;
}

export interface GecisSonucu {
  projeId: string;
  /** Ortak projeye alınan dallar */
  alinan: { ajanAd: string; dal: string; commit: number }[];
  /** Kaldırılan temiz worktree sayısı */
  kaldirilan: number;
  kalanlar: EskiCalismaAlani[];
  /** Kapatılan ya da sonuçlandırılan eski birleştirme onayları */
  onaylar: number;
  /** Kaydı ortak projeye çevrilen çalışanlar */
  ajanlar: number;
}

/** Yeniden üretilebilen yok sayılan yollar (bağımlılık, derleme çıktısı, önbellek, günlük): worktree'yle silinebilir */
const URETILEN =
  /(^|\/)(node_modules|bower_components|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.output|\.turbo|\.cache|\.parcel-cache|\.vite|coverage|\.nyc_output|target|bin|obj|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.venv|venv|\.gradle|\.dart_tool|\.angular|\.expo)(\/|$)|\.(log|pyc|pyo|class|o|tsbuildinfo)$|(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\.eslintcache|\.stylelintcache)$/i;

/** Worktree kaldırılınca kaybolacak, yeniden üretilemeyen yok sayılan yollar; okunamazsa null */
export async function korunacakYoksayilanlar(dizin: string): Promise<string[] | null> {
  const c = await gitIslemleri.git(dizin, ["-c", "core.quotePath=false", "status", "--porcelain=v1", "-z", "--ignored=matching", "--untracked-files=all"]).catch(() => null);
  if (c === null) return null;
  return c
    .split("\0")
    .filter((x) => x.startsWith("!! "))
    .map((x) => x.slice(3).replace(/\/$/, ""))
    .filter((y) => y && !URETILEN.test(y));
}

/** Birleştirmenin ana repoda geri alınması (yarım kaldıysa) */
async function birlestirmeyiBirak(repo: string): Promise<void> {
  const yarim = (await gitIslemleri.git(repo, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { izinVerilenKodlar: [1] }).catch(() => "")).trim();
  if (yarim) await gitIslemleri.git(repo, ["merge", "--abort"]).catch(() => undefined);
}

/** Dal çalışma dalına göre kaç commit önde (çalışma dalında olmayan commit sayısı) */
async function ondeki(repo: string, anaDal: string, dal: string): Promise<number> {
  const c = await gitIslemleri.git(repo, ["rev-list", "--count", `refs/heads/${anaDal}..refs/heads/${dal}`]).catch(() => "0");
  return Number(c.trim()) || 0;
}

export async function projeyiGecir(b: GecisBaglami, p: Proje): Promise<GecisSonucu> {
  const sonuc: GecisSonucu = { projeId: p.id, alinan: [], kaldirilan: 0, kalanlar: [], onaylar: 0, ajanlar: 0 };
  const eskiler = b.depo.ajanlar(p.id).filter((a) => (a.calismaAlani && !gitIslemleri.ayniYol(a.calismaAlani, p.yol)) || a.dal);
  const eskiOnaylar = b.depo.onaylar(p.id).filter((o) => {
    if (o.tur !== "birlestirme") return false;
    if (o.durum === "bekliyor") return true;
    const k = kaliteOku(o);
    return o.durum === "onaylandi" && !!k && !BIRLESTIRME_SON_DURUMLARI.includes(k.durum);
  });
  if (!eskiler.length && !eskiOnaylar.length) return sonuc;
  const repoVar = fs.existsSync(p.yol) && (await gitIslemleri.repoMu(p.yol));
  if (!repoVar) return sonuc;

  return b.git.calistir(p.id, async () => {
    await gitIslemleri.worktreeBuda(p.yol).catch(() => undefined);
    await b.arnorgCommitle(p.id).catch(() => false);
    const mevcut = await gitIslemleri.mevcutDal(p.yol).catch(() => "HEAD");
    const anaDalda = mevcut === p.varsayilanDal;
    const kayitlilar = await gitIslemleri.worktreeler(p.yol).catch(() => []);
    /** Çalışma dalının artık içerdiği dallar: birleştirilen ya da zaten birleşmiş */
    const icerilen = new Set<string>();

    for (const a of eskiler) {
      const yol = a.calismaAlani && !gitIslemleri.ayniYol(a.calismaAlani, p.yol) ? a.calismaAlani : null;
      const kayitli = !!yol && fs.existsSync(yol) && kayitlilar.some((w) => gitIslemleri.ayniYol(w.yol, yol));
      const dal = a.dal && (await gitIslemleri.dalVarMi(p.yol, a.dal)) ? a.dal : null;
      let kalan: Omit<EskiCalismaAlani, "ajanAd" | "dal" | "yol"> | null = null;
      if (kayitli) {
        const degisiklik = await gitIslemleri.commitlenmemisSayisi(yol!).catch(() => -1);
        const korunacak = degisiklik === 0 ? await korunacakYoksayilanlar(yol!) : [];
        if (degisiklik !== 0 || korunacak === null) {
          kalan =
            degisiklik > 0
              ? { neden: "kirli", ayrinti: iki(`${degisiklik} commit'lenmemiş değişiklik`, `${degisiklik} uncommitted change${degisiklik === 1 ? "" : "s"}`) }
              : { neden: "hata", ayrinti: iki("çalışma alanının durumu okunamadı", "could not read the workspace status") };
        } else if (korunacak.length) {
          const ornek = korunacak.slice(0, 3).join(", ") + (korunacak.length > 3 ? ", …" : "");
          kalan = {
            neden: "kirli",
            ayrinti: iki(`git'in yok saydığı ${korunacak.length} dosya (${ornek}) worktree'yle silinirdi`, `${korunacak.length} git-ignored file${korunacak.length === 1 ? "" : "s"} (${ornek}) would be deleted with the worktree`),
          };
        }
      }
      if (!kalan && dal) {
        const onde = await ondeki(p.yol, p.varsayilanDal, dal);
        if (onde === 0) icerilen.add(dal);
        else if (!anaDalda) kalan = { neden: "hata", ayrinti: iki(`ana repo ${p.varsayilanDal} dalında değil (${mevcut})`, `the main repo is not on ${p.varsayilanDal} (${mevcut})`) };
        else {
          try {
            await gitIslemleri.kimlikGuvenceAltinaAl(p.yol);
            await gitIslemleri.git(p.yol, ["merge", "--no-ff", "--no-edit", "-m", iki(`ArnOrg 0.0.8: ${dal} ortak projeye alındı`, `ArnOrg 0.0.8: ${dal} brought into the shared project`), `refs/heads/${dal}`]);
            sonuc.alinan.push({ ajanAd: a.ad, dal, commit: onde });
            icerilen.add(dal);
          } catch (h) {
            const ileti = (h as Error).message;
            const cakisan = (await gitIslemleri.git(p.yol, ["diff", "--name-only", "--diff-filter=U"]).catch(() => ""))
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            await birlestirmeyiBirak(p.yol);
            kalan = cakisan.length
              ? { neden: "cakisma", ayrinti: iki(`çakışan dosyalar: ${cakisan.slice(0, 8).join(", ")}`, `conflicting files: ${cakisan.slice(0, 8).join(", ")}`) }
              : /local changes|untracked working tree files/i.test(ileti)
                ? { neden: "hata", ayrinti: iki("ana repodaki commit'lenmemiş değişiklikler birleştirmeyi engelledi", "uncommitted changes in the main repo blocked the merge") }
                : { neden: "cakisma", ayrinti: kisalt(ileti, 200) };
          }
        }
      }
      if (kalan) sonuc.kalanlar.push({ ajanAd: a.ad, dal, yol: kayitli ? yol : null, ...kalan });
      else {
        if (kayitli) {
          const r = await gitIslemleri.worktreeKaldir(p.yol, yol!).catch(() => null);
          if (r?.durum === "kaldirildi") sonuc.kaldirilan++;
        }
        // Birleşmiş dal güvenle silinir (-d birleşmemişse reddeder)
        if (dal && icerilen.has(dal)) await gitIslemleri.git(p.yol, ["branch", "-d", dal]).catch(() => undefined);
      }
      b.depo.ajanGuncelle(a.id, { calismaAlani: null, dal: null, ...(yol ? { oturumId: null } : {}) });
      sonuc.ajanlar++;
    }

    // Eski birleştirme onayları: dal ortak projeye alındıysa onaylanmış, alınamadıysa reddedilmiş olarak kapanır
    for (const o of eskiOnaylar) {
      const v = birlestirmeVerisi(o.veri);
      const alindi = !!v && (icerilen.has(v.dal) || !(await gitIslemleri.dalVarMi(p.yol, v.dal)) || (await ondeki(p.yol, p.varsayilanDal, v.dal)) === 0);
      const not = alindi
        ? iki("ArnOrg 0.0.8: birleştirme onayı kalktı; dal ortak projeye alındı.", "ArnOrg 0.0.8: merge approvals are gone; the branch was brought into the shared project.")
        : iki("ArnOrg 0.0.8: birleştirme onayı kalktı; dal ortak projeye alınamadı, korunuyor.", "ArnOrg 0.0.8: merge approvals are gone; the branch could not be brought into the shared project and is kept.");
      // Karar ArnOrg'un kendiliğinden kapatması olarak kayda geçer (kurul ya da CEO karar vermiş görünmesin)
      if (o.durum === "bekliyor") b.depo.onaySonuclandir(o.id, alindi ? "onaylandi" : "reddedildi", not, { kaynak: "otomatik", ad: "ArnOrg" });
      else {
        const k = kaliteOku(o)!;
        b.depo.onayVerisiYaz(o.id, { ...(o.veri as object), kalite: { ...k, durum: alindi ? "birlesti" : "hata", sira: null, adimBaslangic: null, bitis: simdi(), mesaj: not } });
      }
      sonuc.onaylar++;
    }
    return sonuc;
  });
}

/** Geçişte bir şey oldu mu (duyurulacak) */
export function gecisOldu(s: GecisSonucu): boolean {
  return s.alinan.length > 0 || s.kaldirilan > 0 || s.kalanlar.length > 0 || s.onaylar > 0 || s.ajanlar > 0;
}

/** Kalanların satırları: "Berk · arnorg/berk · /yol (çakışan dosyalar: …)" */
export function kalanSatirlari(kalanlar: EskiCalismaAlani[]): string[] {
  return kalanlar.map((k) => `- ${k.ajanAd}${k.dal ? ` · ${k.dal}` : ""}${k.yol ? ` · ${k.yol}` : ""} (${k.ayrinti})`);
}
