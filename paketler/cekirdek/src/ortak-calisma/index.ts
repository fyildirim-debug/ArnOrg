// Ortak çalışma (0.0.8): ekip tek projede, çalışma dalında, görev bazlı ve aynı anda çalışır; kişisel çalışma alanı,
// dal ve birleştirme yoktur. Bu sınıf Şirket'e bağlanır:
//   - Kapı: başkasının kiraladığı dosyaya yazma ve ortak projede yasak git komutları reddedilir; izin verilen yazma
//     dosyayı yazana kiralar. Komuttan sonra (salt okunur değilse) kirli dosyaların izi alınır, yeni değişen ve
//     kirasız dosyalar komutu çalıştırana yazılır.
//   - Kayıt: görev 'inceleme'ye ya da 'tamam'a geçince ya da isi_kaydet ile sahibinin o göreve ait kiralı dosyaları
//     git sırasında "<görev kodu> <başlık>" mesajıyla commit'lenir, kiralar biter, gorev.kaydedildi yayınlanır,
//     test komutu arka planda kalite alanında koşar (kalite.ts); geçmezse görev çıktıyla sahibine döner. Otomatik
//     gönderim açıksa çalışma dalı kısa gecikmeyle uzak depoya gönderilir.
//   - Kiralar sahibi durunca biter; sahibi çalışmıyor ve 30 dakikadır sessizse süresi dolar.
//   - Ekip temposu: tam otonom kipte CEO'nun seçimi (ekip_temposu) proje başına tavandır; kurulun üst sınırını geçemez.
//   - İş dağıtımı: boşa çıkan çalışana sıradaki işi (tempo izin verdikçe) ArnOrg başlatır ve CEO'ya kısaca söyler;
//     yapacak işi olmayan boştaki çalışanlar CEO'ya toplu söylenir. Kurulun durdurduğu proje ve çalışana iş başlamaz.
//   - Geçiş: açılışta eski worktree ve dallar ortak projeye alınır (gecis.ts).
import fs from "node:fs";
import path from "node:path";
import { gorevKaydiOlayi, type Ajan, type DosyaKirasi, type EkipTemposu, type Gorev, type GorevKaydi, type KayitNedeni, type OrtakCalismaDurumu, type Proje } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { calisanMi, tavanDegeri } from "../es-zamanlilik.js";
import * as gitIslemleri from "../git.js";
import { sonKisim } from "../kalite-kapisi.js";
import { rolAdiDilde } from "../roller.js";
import type { Sirket } from "../sirket.js";
import { ArnorgHatasi, ilgi, jsonOku, kimlik, kisalt, simdi, yonelme } from "../yardimci.js";
import { gecisOldu, kalanSatirlari, projeyiGecir, type GecisSonucu } from "./gecis.js";
import { degisenYollar, imzaZamani, kirliImzalar, yollariCommitle } from "./git-kayit.js";
import { eskiKilidiKaldir, GitSirasi, kilitliyseYinele } from "./git-sirasi.js";
import { komutuCoz, kokte, type GitKarari } from "./kabuk.js";
import { KaliteDenetimi, kaldiMi } from "./kalite.js";
import { bosKalite, KayitDefteri } from "./kayitlar.js";
import { kiraAnahtari, KiraDefteri } from "./kiralar.js";
import { gecerliTempo, siradakiIs, TEMPO_ONEKI, tempoKaydi } from "./tempo.js";
import { gitIciReddi, gitReddi, kiraReddi } from "./talimat.js";

const YAZMA_ARACLARI = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const KOMUT_ARACLARI = new Set(["Bash", "PowerShell"]);
/** Sahibi çalışmıyorsa ve bu kadar süredir sessizse kira biter */
export const KIRA_ZAMAN_ASIMI_MS = 30 * 60_000;
/** Kayıttan sonra uzak depoya gönderim bekler: art arda kayıtlar tek gönderimde gider */
const GONDERIM_GECIKMESI_MS = 20_000;
/** İş dağıtımı kısa bekleyip toplu çalışır (art arda gelen durum değişiklikleri tek turda) */
const DAGITIM_GECIKMESI_MS = 1500;
/** Kira süresi ve kaçan dağıtım için dönemsel bakış */
const SUPURME_MS = 60_000;
/** Yapacak işi olmayan boştaki çalışanlar CEO'ya bu kadar bekleyip toplu söylenir (art arda boşa çıkanlar tek notta) */
export const ISSIZ_BILDIRIM_MS = 90_000;
/** Boşta kalması olağan roller: yöneticiler, inceleyici ve tanıtım uzmanı (işleri onlara gelir); CEO'ya söylenmez */
const BOSTA_OLAGAN = new Set(["ceo", "cto", "inceleme", "tanitim"]);
/** Kurulun Stüdyo'da düzenlediği dosya bu süre içinde ize girmez (çalışana yazılmaz) */
const KURUL_IZI_MS = 60 * 60_000;
/** Anahtar-değer kayıtları */
const KIRA_ONEKI = "ortak-kiralar:";
const GECIS_ONEKI = "ortak-gecis:";
const KALANLAR_ONEKI = "ortak-kalanlar:";
const UST_SINIR_GOCU = "ortak-ust-sinir-008";
/** 0.0.8 öncesinin varsayılan üst sınırı; geçişte bir kez 8'e çıkar */
const ESKI_UST_SINIR = 3;
export const YENI_UST_SINIR = 8;

/** Denetim kaydındaki kural adları */
const kiraKurali = () => iki("Dosya kirası", "File lease");
const gitKurali = () => iki("Ortak proje: git", "Shared project: git");

export interface OrtakRet {
  kural: string;
  neden: string;
}

interface YazmaHedefi {
  /** Repo köküne göre, / ayraçlı */
  goreli: string;
  dizin: boolean;
}

/** Repo köküne göre / ayraçlı yol */
export function goreliYol(kok: string, tam: string): string {
  return path.relative(kok, tam).split(path.sep).join("/");
}

function tekSatir(metin: string): string {
  return metin.replace(/\s+/g, " ").trim();
}

/** Dosya sisteminin zaman çözünürlüğü ve saat kayması payı (iz penceresi) */
const IZ_PAYI_MS = 2000;

export class OrtakCalisma {
  readonly git = new GitSirasi();
  readonly kiralar: KiraDefteri;
  readonly defter: KayitDefteri;
  readonly kalite: KaliteDenetimi;
  /** Boşa çıkan çalışana sıradaki işi kendiliğinden başlatır; oturumsuz çalıştırmada (testler) kapalı */
  isDagitimi: boolean;
  private readonly kiraYazimlari = new Map<string, NodeJS.Timeout>();
  private readonly gonderimler = new Map<string, NodeJS.Timeout>();
  private readonly dagitimlar = new Map<string, NodeJS.Timeout>();
  private readonly tempoYayinlari = new Map<string, NodeJS.Timeout>();
  private readonly dagitiliyor = new Set<string>();
  /** Proje → CEO'ya işsiz diye söylenmiş çalışanlar (yeniden iş alana dek yinelenmez) */
  private readonly bildirilenIssizler = new Map<string, Set<string>>();
  private readonly issizZamanlayicilari = new Map<string, NodeJS.Timeout>();
  /** Proje → son izdeki kirli yolların imzası */
  private readonly bilinenKirli = new Map<string, Map<string, string>>();
  /** Proje → sıradaki iz işleri */
  private readonly izler = new Map<string, Promise<void>>();
  /** Çalışan → süren yazan komutları ve ilkinin başladığı an (iz yalnız bu pencerede değişen dosyayı ona yazar) */
  private readonly komutPencereleri = new Map<string, { sayi: number; bas: number }>();
  /** Gönderimi son başarısız olan projeler (başarı bir kez duyurulur) */
  private readonly gonderimHatasi = new Set<string>();
  private supurucu: NodeJS.Timeout | null = null;
  private birak: (() => void) | null = null;
  private kapali = false;

  constructor(
    private readonly s: Sirket,
    secenek: { kaliteKoku: string; isDagitimi: boolean },
  ) {
    this.isDagitimi = secenek.isDagitimi;
    this.kiralar = new KiraDefteri({ degisti: (pid) => this.kiralarDegisti(pid) });
    this.defter = new KayitDefteri(s.depo.db);
    this.kalite = new KaliteDenetimi({
      defter: this.defter,
      proje: (id) => s.depo.proje(id),
      kaliteKoku: secenek.kaliteKoku,
      git: this.git,
      yayinla: (k) => s.olaylar.yayinla({ tur: "kayit.guncellendi", projeId: k.projeId, kayit: k }),
      bitti: (k, onceki) => this.denetimBitti(k, onceki),
    });
    for (const p of s.depo.projeler()) this.kiralar.yukle(p.id, jsonOku<DosyaKirasi[]>(s.depo.deger(KIRA_ONEKI + p.id), []));
    this.ustSiniriYukselt();
    this.birak = s.olaylar.dinle((o) => {
      if (this.kapali) return;
      if (o.tur === "ajan.guncellendi") this.ajanGuncellendi(o.ajan);
      else if (o.tur === "gorev.guncellendi") this.dagitimPlanla(o.gorev.projeId);
      else if (o.tur === "proje.guncellendi") this.dagitimPlanla(o.proje.id);
    });
  }

  /** Açılış: yarım kalan kalite denetimleri sürer, izlerin tabanı alınır, kira süresi ve dağıtım dönemsel bakılır */
  baslat(): void {
    this.kalite.baslat();
    for (const p of this.s.depo.projeler()) void this.izTabani(p.id);
    if (this.supurucu) return;
    this.supurucu = setInterval(() => {
      this.kiralariSupur();
      for (const p of this.s.depo.projeler()) this.dagitimPlanla(p.id);
    }, SUPURME_MS);
    this.supurucu.unref();
  }

  kapat(): void {
    this.kapali = true;
    if (this.supurucu) clearInterval(this.supurucu);
    for (const z of [...this.gonderimler.values(), ...this.dagitimlar.values(), ...this.tempoYayinlari.values(), ...this.issizZamanlayicilari.values()]) clearTimeout(z);
    for (const [pid, z] of this.kiraYazimlari) {
      clearTimeout(z);
      this.kiralariYaz(pid);
    }
    this.kiraYazimlari.clear();
    this.kalite.kapat();
    this.birak?.();
    this.birak = null;
  }

  projeKaldir(p: Proje): void {
    this.kalite.projeKaldir(p);
    this.kiralar.projeKaldir(p.id);
    this.bilinenKirli.delete(p.id);
  }

  // ===================================================================
  // Kapı
  // ===================================================================

  /** Aracın ortak projede yazacağı yollar ve git kararları; çözülemeyen ya da proje dışı yazma sayılmaz */
  private hedefler(p: Proje, arac: string, girdi: Record<string, unknown>, cwd: string): { yollar: YazmaHedefi[]; git: GitKarari[] } {
    if (YAZMA_ARACLARI.has(arac)) {
      const y = typeof girdi.file_path === "string" ? girdi.file_path : typeof girdi.notebook_path === "string" ? girdi.notebook_path : null;
      if (!y) return { yollar: [], git: [] };
      const tam = path.resolve(cwd, y);
      if (!kokte(p.yol, tam)) return { yollar: [], git: [] };
      return { yollar: [{ goreli: goreliYol(p.yol, tam), dizin: false }], git: [] };
    }
    if (KOMUT_ARACLARI.has(arac) && typeof girdi.command === "string") {
      const c = komutuCoz(girdi.command, cwd, p.yol, { kabuk: arac === "PowerShell" ? "powershell" : "bash" });
      const yollar = c.hedefler.map((h) => ({ goreli: goreliYol(p.yol, h.yol), dizin: h.dizin }));
      for (const g of c.git) if (g.tur === "geri_al") yollar.push(...g.dosyalar.map((d) => ({ goreli: goreliYol(p.yol, d), dizin: false })));
      return { yollar, git: c.git };
    }
    return { yollar: [], git: [] };
  }

  /** PreToolUse: yasak git komutu, .git'e dokunma ya da başkasının kiraladığı dosya; ret ya da null */
  kapidan(ajan: Ajan, arac: string, girdi: Record<string, unknown>, cwd: string): OrtakRet | null {
    if (ajan.rol === "ceo" || (!YAZMA_ARACLARI.has(arac) && !KOMUT_ARACLARI.has(arac))) return null;
    const p = this.s.depo.proje(ajan.projeId);
    if (!p) return null;
    const h = this.hedefler(p, arac, girdi, cwd);
    for (const g of h.git) if (g.tur === "ret") return { kural: gitKurali(), neden: gitReddi(g, p.varsayilanDal) };
    return this.cakisma(ajan, p, h.yollar);
  }

  private cakisma(ajan: Ajan, p: Proje, yollar: YazmaHedefi[]): OrtakRet | null {
    for (const y of yollar) {
      if (y.goreli === ".git" || y.goreli.startsWith(".git/")) return { kural: gitKurali(), neden: gitIciReddi() };
      const c = this.kiralar.cakisan(p.id, ajan.id, y.goreli, y.dizin);
      if (c) return { kural: kiraKurali(), neden: kiraReddi(c, y.dizin ? y.goreli : c.yol, c.gorevId ? (this.s.depo.gorev(c.gorevId)?.baslik ?? null) : null) };
    }
    return null;
  }

  /** İzin verilen yazmanın hedeflerini yazana kiralar; arada başkası kiraladıysa ret */
  kirala(ajan: Ajan, arac: string, girdi: Record<string, unknown>, cwd: string): OrtakRet | null {
    if (ajan.rol === "ceo" || (!YAZMA_ARACLARI.has(arac) && !KOMUT_ARACLARI.has(arac))) return null;
    const p = this.s.depo.proje(ajan.projeId);
    if (!p) return null;
    const h = this.hedefler(p, arac, girdi, cwd);
    const ret = this.cakisma(ajan, p, h.yollar);
    if (ret) return ret;
    if (KOMUT_ARACLARI.has(arac)) this.pencereAc(ajan.id);
    const g = ajan.gorevId ? this.s.depo.gorev(ajan.gorevId) : null;
    for (const y of h.yollar) {
      if (y.dizin) continue;
      this.kiralar.al(p.id, { yol: y.goreli, ajanId: ajan.id, ajanAd: ajan.ad, gorevId: g?.id ?? null, gorevKodu: g?.kod ?? null, kaynak: arac.startsWith("Bash") || arac === "PowerShell" ? "kabuk" : "arac" });
    }
    return null;
  }

  /** PostToolUse: dosya aracında kira tazelenir; yazan komuttan sonra iz alınır */
  aracSonrasi(ajan: Ajan, arac: string, girdi: Record<string, unknown>, cwd: string): void {
    if (ajan.rol === "ceo") return;
    const p = this.s.depo.proje(ajan.projeId);
    if (!p) return;
    if (YAZMA_ARACLARI.has(arac)) {
      for (const y of this.hedefler(p, arac, girdi, cwd).yollar) this.kiralar.dokundu(p.id, ajan.id, y.goreli);
    } else if (KOMUT_ARACLARI.has(arac)) {
      const bas = this.pencereKapat(ajan.id);
      if (typeof girdi.command === "string" && !komutuCoz(girdi.command, cwd, p.yol, { kabuk: arac === "PowerShell" ? "powershell" : "bash" }).saltOkunur) {
        this.izPlanla(p.id, ajan.id, bas);
      }
    }
  }

  /** Bu kadar eski pencere kapanmamış sayılmaz (araç sonrası hiç gelmediyse) */
  private static readonly PENCERE_OMRU_MS = 30 * 60_000;

  private pencereAc(ajanId: string): void {
    const simdiMs = Date.now();
    const p = this.komutPencereleri.get(ajanId);
    if (p && simdiMs - p.bas < OrtakCalisma.PENCERE_OMRU_MS) p.sayi++;
    else this.komutPencereleri.set(ajanId, { sayi: 1, bas: simdiMs });
  }

  /** Komut bitti: penceresinin başlangıcı (paralel komutlarda ilkininki); kapanmamışsa undefined */
  private pencereKapat(ajanId: string): number | undefined {
    const p = this.komutPencereleri.get(ajanId);
    if (!p) return undefined;
    if (--p.sayi <= 0) this.komutPencereleri.delete(ajanId);
    return p.bas;
  }

  /** ArnOrg'un not_yaz'ı: not başkasının kirasındaysa (Edit ile düzenliyorsa) ret metni */
  notReddi(ajan: Ajan, notGoreli: string): string | null {
    const c = this.kiralar.cakisan(ajan.projeId, ajan.id, `.arnorg/notlar/${notGoreli.replace(/\\/g, "/").replace(/^\/+/, "")}`);
    return c ? kiraReddi(c, c.yol, c.gorevId ? (this.s.depo.gorev(c.gorevId)?.baslik ?? null) : null) : null;
  }

  // ===================================================================
  // İz: komuttan sonra değişen dosyalar
  // ===================================================================

  private izPlanla(projeId: string, ajanId: string, bas?: number): void {
    const onceki = this.izler.get(projeId) ?? Promise.resolve();
    const bu = onceki
      .then(() => this.izAl(projeId, ajanId, bas))
      .then(
        () => undefined,
        () => undefined,
      );
    this.izler.set(projeId, bu);
  }

  /** Sıradaki izler bitince çözülür (görev kaydından önce beklenir) */
  async izlerBitsin(projeId: string): Promise<void> {
    for (let i = this.izler.get(projeId); i; i = this.izler.get(projeId)) {
      await i;
      if (this.izler.get(projeId) === i) return;
    }
  }

  private async izTabani(projeId: string): Promise<void> {
    const p = this.s.depo.proje(projeId);
    if (!p || !fs.existsSync(p.yol) || this.bilinenKirli.has(projeId)) return;
    this.bilinenKirli.set(projeId, await kirliImzalar(p.yol).catch(() => new Map()));
  }

  /**
   * Kirli yolların yeni izi: öncekinden bu yana değişen ve kirası olmayan yollar komutu çalıştırana kiralanır. bas
   * verilirse (komutun başladığı an) yalnız o andan sonra değişen dosya ona yazılır; daha önce değişen (aynı anda
   * çalışan başka bir çalışanın komutu) izde bekler, kendi komutu bitince ona yazılır.
   */
  async izAl(projeId: string, ajanId: string, bas?: number): Promise<string[]> {
    const p = this.s.depo.proje(projeId);
    const ajan = this.s.depo.ajan(ajanId);
    if (!p || !ajan || !fs.existsSync(p.yol)) return [];
    const simdiki = await kirliImzalar(p.yol).catch(() => null);
    if (!simdiki) return [];
    const onceki = this.bilinenKirli.get(projeId) ?? new Map<string, string>();
    const taban = new Map(simdiki);
    this.bilinenKirli.set(projeId, taban);
    const g = ajan.gorevId ? this.s.depo.gorev(ajan.gorevId) : null;
    const alinan: string[] = [];
    const baskasinin: string[] = [];
    for (const [yol, imza] of simdiki) {
      if (yol.startsWith(".arnorg/") || onceki.get(yol) === imza || this.kurulunMu(p, yol)) continue;
      // Komuttan önce değişmiş: başka bir komutun işi olabilir; taban eski hâlde kalır ki sahibi sonra alabilsin
      const zaman = imzaZamani(imza);
      if (bas !== undefined && zaman !== null && zaman < bas - IZ_PAYI_MS && !this.kiralar.sahibi(projeId, yol)) {
        const eski = onceki.get(yol);
        if (eski === undefined) taban.delete(yol);
        else taban.set(yol, eski);
        continue;
      }
      const sahip = this.kiralar.sahibi(projeId, yol);
      if (sahip) {
        if (sahip.ajanId === ajanId) this.kiralar.dokundu(projeId, ajanId, yol);
        else baskasinin.push(`${yol} (${sahip.ajanAd})`);
        continue;
      }
      this.kiralar.al(projeId, { yol, ajanId, ajanAd: ajan.ad, gorevId: g?.id ?? null, gorevKodu: g?.kod ?? null, kaynak: "iz" });
      alinan.push(yol);
    }
    if (baskasinin.length) {
      this.s.olaylar.yayinla({
        tur: "bildirim",
        seviye: "uyari",
        metin: iki(
          `${ilgi(ajan.ad)} komutu başkalarının kiraladığı dosyaları da değiştirdi: ${kisalt(baskasinin.join(", "), 300)}`,
          `${ajan.ad}'s command also changed files leased to others: ${kisalt(baskasinin.join(", "), 300)}`,
        ),
        projeId,
      });
    }
    return alinan;
  }

  /** Kurul dosyayı Stüdyo'da yakın zamanda düzenledi mi (iz çalışana yazmaz) */
  private kurulunMu(p: Proje, goreli: string): boolean {
    const t = this.s.kullaniciKilitleri.get(path.resolve(p.yol, goreli));
    return t !== undefined && t > Date.now() - KURUL_IZI_MS;
  }

  // ===================================================================
  // Kiralar: yayın, kalıcı kayıt, bırakma, süre dolumu
  // ===================================================================

  private kiralarDegisti(projeId: string): void {
    if (this.kiraYazimlari.has(projeId) || this.kapali) return;
    const z = setTimeout(() => {
      this.kiraYazimlari.delete(projeId);
      this.kiralariYaz(projeId);
      this.s.olaylar.yayinla({ tur: "kira.guncellendi", projeId, kiralar: this.kiralar.liste(projeId) });
    }, 250);
    z.unref();
    this.kiraYazimlari.set(projeId, z);
  }

  private kiralariYaz(projeId: string): void {
    try {
      this.s.depo.degerYaz(KIRA_ONEKI + projeId, JSON.stringify(this.kiralar.liste(projeId)));
    } catch {
      // depo kapanmış olabilir
    }
  }

  /** Çalışan durdu (kurul durdurdu ya da hatayla durdu): kiraları biter; dosyalar çalışma kopyasında kalır */
  ajanDurdu(ajanId: string): void {
    this.komutPencereleri.delete(ajanId);
    for (const p of this.s.depo.projeler()) this.kiralar.birak(p.id, (k) => k.ajanId === ajanId);
  }

  /** Projede (verilmezse her yerde) mesai durdu: bütün kiralar biter */
  mesaiDurdu(projeId?: string): void {
    for (const p of projeId ? [projeId] : this.s.depo.projeler().map((x) => x.id)) {
      this.kiralar.birak(p, () => true);
      for (const a of this.s.depo.ajanlar(p)) this.komutPencereleri.delete(a.id);
    }
  }

  /** Çalışan ayrıldı: kiraları işlerini devralana geçer; devralan yoksa biter */
  ajanAyrildi(a: Ajan, devralan: Ajan | null): void {
    if (devralan) this.kiralar.devret(a.projeId, a.id, { ajanId: devralan.id, ajanAd: devralan.ad });
    else this.kiralar.birak(a.projeId, (k) => k.ajanId === a.id);
  }

  /** Görev değişti: iptalde kiraları biter, yeniden atamada yeni sahibine geçer */
  gorevDegisti(eski: Gorev, yeni: Gorev): void {
    if (yeni.durum === "iptal" && eski.durum !== "iptal" && eski.atananId) {
      this.kiralar.birak(yeni.projeId, (k) => k.ajanId === eski.atananId && k.gorevId === yeni.id);
    } else if (eski.atananId && yeni.atananId && eski.atananId !== yeni.atananId) {
      const ad = this.s.depo.ajan(yeni.atananId)?.ad;
      if (ad) this.kiralar.devret(yeni.projeId, eski.atananId, { ajanId: yeni.atananId, ajanAd: ad }, yeni.id);
    }
  }

  /** Sahibi yoksa ya da çalışmıyor ve uzun süredir sessizse kira biter */
  kiralariSupur(simdiMs = Date.now()): number {
    let n = 0;
    for (const p of this.s.depo.projeler()) {
      n += this.kiralar.birak(p.id, (k) => {
        const a = this.s.depo.ajan(k.ajanId);
        if (!a || a.projeId !== p.id) return true;
        if (calisanMi(a.durum)) return false;
        const son = Math.max(Date.parse(k.son) || 0, this.s.sonEtkinlik.get(a.id) ?? 0);
        return simdiMs - son > KIRA_ZAMAN_ASIMI_MS;
      }).length;
    }
    return n;
  }

  private ajanGuncellendi(a: Ajan): void {
    if (a.durum === "hata") {
      if (this.kiralar.ajaninkiler(a.id).length) this.ajanDurdu(a.id);
      return;
    }
    if (a.rol !== "ceo" && (a.durum === "bosta" || a.durum === "kapali")) this.dagitimPlanla(a.projeId);
  }

  // ===================================================================
  // Görev kaydı
  // ===================================================================

  /**
   * Görevin sahibinin o göreve (ya da görevsiz) kiraladığı dosyalardan değişenleri çalışma dalına commit'ler, kiraları
   * bırakır, kaydı yayınlar ve kalite denetimine verir. Kaydedilecek değişiklik yoksa kiralar yine biter, null döner.
   */
  async gorevKaydet(g: Gorev, neden: KayitNedeni, ozet?: string): Promise<GorevKaydi | null> {
    const p = this.s.depo.proje(g.projeId);
    const ajan = g.atananId ? this.s.depo.ajan(g.atananId) : null;
    if (!p || !ajan || !fs.existsSync(p.yol)) return null;
    await this.izlerBitsin(p.id);
    const kiralar = this.kiralar.liste(p.id).filter((k) => k.ajanId === ajan.id && (k.gorevId === g.id || !k.gorevId));
    if (!kiralar.length) return null;
    const anahtarlar = new Set(kiralar.map((k) => k.yol));
    const kayit = await this.git.calistir(p.id, async () => {
      const dal = await gitIslemleri.mevcutDal(p.yol);
      if (dal !== p.varsayilanDal) {
        throw new ArnorgHatasi(iki(`Ana repo ${p.varsayilanDal} dalında değil (${dal}); ${g.kod} kaydedilemedi.`, `The main repo is not on ${p.varsayilanDal} (${dal}); ${g.kod} could not be saved.`), 409);
      }
      const konu = `${g.kod} ${tekSatir(g.baslik)}`;
      await this.eskiKilit(p);
      const sonuc = await kilitliyseYinele(() => yollariCommitle(p.yol, [...anahtarlar], konu, ozet));
      this.kiralar.birak(p.id, (k) => k.ajanId === ajan.id && anahtarlar.has(k.yol));
      if (!sonuc) return null;
      const bilinen = this.bilinenKirli.get(p.id);
      for (const d of sonuc.dosyalar) bilinen?.delete(d);
      const k = this.defter.ekle({
        id: kimlik(),
        projeId: p.id,
        gorevId: g.id,
        gorevKodu: g.kod,
        baslik: konu,
        ajanId: ajan.id,
        ajanAd: ajan.ad,
        commit: sonuc.commit,
        dal: p.varsayilanDal,
        dosyalar: sonuc.dosyalar,
        eklenen: sonuc.eklenen,
        silinen: sonuc.silinen,
        neden,
        zaman: simdi(),
        kalite: bosKalite(p.testKomutu ? "kuyrukta" : "testsiz", p.testKomutu),
      });
      this.s.olaylar.yayinla(gorevKaydiOlayi(k));
      return k;
    });
    if (!kayit) return null;
    const son = this.kalite.ekle(kayit);
    this.gonderimPlanla(p.id);
    return son;
  }

  /** Çökmüş bir git sürecinden kalan eski index.lock kaldırılır ve kurula söylenir (git sırasının içinden) */
  async eskiKilit(p: Proje): Promise<void> {
    const yas = await eskiKilidiKaldir(p.yol);
    if (yas === null) return;
    const dk = Math.round(yas / 60_000);
    this.s.olaylar.yayinla({
      tur: "bildirim",
      seviye: "uyari",
      metin: iki(
        `${p.ad}: çökmüş bir git işleminden kalan kilit (.git/index.lock, ${dk} dk) kaldırıldı; kayıtlar sürüyor.`,
        `${p.ad}: a lock left by a crashed git process (.git/index.lock, ${dk} min) was removed; saves continue.`,
      ),
      projeId: p.id,
    });
  }

  /**
   * ArnOrg'un kendi kayıtlarından (.arnorg) commit'lenecek değişen yollar. Bir çalışanın kiraladığı not dışarıda kalır:
   * yarım düzenleme commit'lenmez, notu görevinin kaydına girer.
   */
  async arnorgYollari(projeId: string, repo: string): Promise<string[]> {
    const kirali = new Set(this.kiralar.liste(projeId).map((k) => k.yol));
    return [...(await degisenYollar(repo)).keys()].filter((y) => y.startsWith(".arnorg/") && !kirali.has(kiraAnahtari(y)));
  }

  /** isi_kaydet: çalışanın süren görevinin dosyalarını ara kayıt olarak commit'ler */
  async isiKaydet(ajan: Ajan, ozet?: string): Promise<{ gorev: Gorev; kayit: GorevKaydi | null }> {
    const gorevler = this.s.depo.gorevler(ajan.projeId);
    const g =
      (ajan.gorevId ? gorevler.find((x) => x.id === ajan.gorevId && x.atananId === ajan.id && (x.durum === "calisiliyor" || x.durum === "inceleme")) : undefined) ??
      gorevler.find((x) => x.atananId === ajan.id && x.durum === "calisiliyor");
    if (!g) throw new ArnorgHatasi(iki("Sana atanmış süren bir görev yok; kaydedilecek iş bir göreve bağlı olmalı.", "You have no task in progress; work is saved per task."), 409);
    return { gorev: g, kayit: await this.gorevKaydet(g, "ara", ozet) };
  }

  /** Kaydın kalite denetimi bitti: geçmediyse görev çıktıyla sahibine döner, CEO'ya kısa haber */
  private async denetimBitti(k: GorevKaydi, onceki: GorevKaydi | null): Promise<void> {
    const p = this.s.depo.proje(k.projeId);
    if (!p || this.kapali) return;
    const kod = k.gorevKodu ?? k.commit.slice(0, 7);
    if (k.kalite.durum === "gecti") {
      if (onceki && kaldiMi(onceki)) this.s.duyur(p.id, iki(`${kod} kaydından sonra testler yeniden geçiyor; ${p.varsayilanDal} yeşil.`, `The tests pass again after the ${kod} save; ${p.varsayilanDal} is green.`));
      return;
    }
    if (k.kalite.durum === "hata") {
      this.s.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: iki(`${kod} kaydının denetimi yapılamadı: ${k.kalite.mesaj ?? ""}`, `The check of the ${kod} save could not run: ${k.kalite.mesaj ?? ""}`), projeId: p.id });
      return;
    }
    if (!kaldiMi(k)) return;
    const g = k.gorevId ? this.s.depo.gorev(k.gorevId) : null;
    const sahip = k.ajanId ? this.s.depo.ajan(k.ajanId) : null;
    const ceo = this.s.ceoBul(p.id);
    const son = sonKisim(k.kalite.cikti, 40, 3000);
    const kisaSon = sonKisim(k.kalite.cikti, 12, 1200);
    const mesaj = k.kalite.mesaj ?? "";
    // Dal bu kayıttan önce de kırmızıydı: yeni kırılma sayılmaz, düzeltme ilk kıranın görevinde
    if (k.kalite.kirmiziKayit) {
      const ilk = this.defter.kayit(k.kalite.kirmiziKayit);
      if (sahip) {
        this.s.zeka.haberEkle(
          sahip.id,
          iki(
            `${kod} kaydın testten geçmedi ama ${p.varsayilanDal} ${ilk?.gorevKodu ?? "önceki bir"} kaydından beri kırmızı (${ilk?.ajanAd ?? "?"} düzeltiyor). Hata senin dosyalarındaysa düzelt; değilse işine devam et.`,
            `Your ${kod} save failed the tests, but ${p.varsayilanDal} has been red since the ${ilk?.gorevKodu ?? "earlier"} save (${ilk?.ajanAd ?? "?"} is fixing it). If the error is in your files, fix it; otherwise carry on.`,
          ),
        );
      }
      return;
    }
    const zamanAsimi = k.kalite.durum === "zaman_asimi";
    const nedenTr = zamanAsimi ? "testler zaman aşımına uğradı" : "testler geçmedi";
    const nedenEn = zamanAsimi ? "the tests timed out" : "the tests failed";
    const komut = k.kalite.komut ?? p.testKomutu ?? "";
    this.s.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin: iki(`${kod}: ${nedenTr}. ${mesaj}`, `${kod}: ${nedenEn}. ${mesaj}`), projeId: p.id });
    if (g && sahip && sahip.projeId === p.id) {
      const geriDondu = g.durum === "inceleme" || g.durum === "tamam";
      if (geriDondu) {
        const yeni = this.s.depo.gorevGuncelle(g.id, { durum: "calisiliyor" });
        this.s.depo.ajanGuncelle(sahip.id, { gorevId: g.id });
        this.s.olaylar.yayinla({ tur: "gorev.guncellendi", gorev: yeni });
      }
      this.s.duyur(
        p.id,
        iki(
          `${kod} "${kisalt(g.baslik, 80)}" kaydından sonra ${nedenTr}; ${geriDondu ? `görev ${yonelme(sahip.ad)} geri döndü` : `${sahip.ad} düzeltiyor`}.`,
          `After the ${kod} "${kisalt(g.baslik, 80)}" save ${nedenEn}; ${geriDondu ? `the task went back to ${sahip.ad}` : `${sahip.ad} is fixing it`}.`,
        ),
      );
      if (ceo && ceo.id !== sahip.id) {
        this.s.zeka.haberEkle(
          ceo.id,
          iki(
            `${kod} kaydında ${nedenTr} (${mesaj}); ${geriDondu ? `görev ${yonelme(sahip.ad)} geri döndü` : `${sahip.ad} düzeltiyor`}. Çıktının sonu:\n${kisaSon}`,
            `After the ${kod} save ${nedenEn} (${mesaj}); ${geriDondu ? `the task went back to ${sahip.ad}` : `${sahip.ad} is fixing it`}. End of the output:\n${kisaSon}`,
          ),
        );
      }
      const duzelt = iki(
        `${kod} "${g.baslik}" kaydından sonra ${nedenTr}: ${mesaj}${geriDondu ? " Görev sana geri döndü ('calisiliyor')." : ""}\n\nÇıktının sonu:\n\`\`\`\n${son}\n\`\`\`\n\nAynı komutu (${komut}) çalıştır, düzelt ve görevi yeniden 'inceleme' durumuna al. Ortak dal kırmızıyken herkesin denetimi kalır; bu işi öne al.`,
        `After the ${kod} "${g.baslik}" save ${nedenEn}: ${mesaj}${geriDondu ? " The task is back with you ('calisiliyor')." : ""}\n\nEnd of the output:\n\`\`\`\n${son}\n\`\`\`\n\nRun the same command (${komut}), fix it and move the task to 'inceleme' again. While the shared branch is red everyone's checks fail; do this first.`,
      );
      // Kurulun durdurduğu çalışan uyandırılmaz; düzeltme isteği kurul onu yeniden başlatınca önüne gelir
      if (this.s.kurulDurdurduMu(sahip.id)) this.s.zeka.haberEkle(sahip.id, duzelt);
      else await this.s.uyandir(sahip.id, duzelt, null).catch(() => false);
      return;
    }
    // Sahibi yok (ayrıldı): düzeltme görevi açılır, CEO'ya söylenir
    const duzeltme = this.s.gorevOlustur(
      p.id,
      {
        baslik: iki(`${kod} kaydının testlerini düzelt`, `Fix the tests broken by the ${kod} save`),
        aciklama: iki(`${k.baslik} kaydından (${k.commit.slice(0, 7)}) sonra ${nedenTr}: ${mesaj}\n\nÇıktının sonu:\n${son}`, `After the ${k.baslik} save (${k.commit.slice(0, 7)}) ${nedenEn}: ${mesaj}\n\nEnd of the output:\n${son}`),
        etiket: g?.etiket ?? "",
      },
      null,
    );
    this.s.duyur(p.id, iki(`${kod} kaydından sonra ${nedenTr}; ${duzeltme.kod} düzeltme görevi açıldı.`, `After the ${kod} save ${nedenEn}; fix task ${duzeltme.kod} was opened.`));
    if (ceo) {
      const ata = iki(
        `${kod} kaydından sonra ${nedenTr} ve sahibi artık ekipte değil. ${duzeltme.kod} düzeltme görevini açtım; uygun birine ata ve başlat. Çıktının sonu:\n${kisaSon}`,
        `After the ${kod} save ${nedenEn} and its owner is no longer on the team. I opened fix task ${duzeltme.kod}; assign it to someone suitable and start it. End of the output:\n${kisaSon}`,
      );
      if (this.s.kurulDurdurduMu(ceo.id)) this.s.zeka.haberEkle(ceo.id, ata);
      else await this.s.uyandir(ceo.id, ata, null).catch(() => false);
    }
  }

  /** Otomatik gönderim açıksa çalışma dalı kısa gecikmeyle (git sırasında) uzak depoya gönderilir */
  gonderimPlanla(projeId: string): void {
    const p = this.s.depo.proje(projeId);
    if (!p?.uzakAdres || !p.otomatikGonder || this.kapali) return;
    const z = this.gonderimler.get(projeId);
    if (z) clearTimeout(z);
    const yeni = setTimeout(() => {
      this.gonderimler.delete(projeId);
      void this.git
        .calistir(projeId, async () => {
          const guncel = this.s.depo.proje(projeId);
          return guncel ? this.s.github.gonder(guncel) : null;
        })
        .then((g) => {
          if (!g) return;
          if (g.durum === "gonderildi") {
            if (this.gonderimHatasi.delete(projeId)) this.s.duyur(projeId, g.mesaj);
          } else if (g.durum !== "uzak_yok") {
            if (!this.gonderimHatasi.has(projeId)) this.s.duyur(projeId, g.mesaj);
            this.gonderimHatasi.add(projeId);
            this.s.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin: g.mesaj, projeId });
          }
        })
        .catch((h) => this.s.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId }));
    }, GONDERIM_GECIKMESI_MS);
    yeni.unref();
    this.gonderimler.set(projeId, yeni);
  }

  // ===================================================================
  // Ekip temposu
  // ===================================================================

  /** Projenin karar kipinde tempoyu kim belirler: tam otonom ve CEO varsa CEO */
  private belirleyen(p: Proje): "ceo" | "kurul" {
    return p.kararVeren === "ceo" && this.s.ceoBul(p.id) ? "ceo" : "kurul";
  }

  /** Projenin tavanı (CEO'nun temposu); kurul kipinde, CEO seçmediyse ya da ajan CEO ise 0 (yalnız genel tavan) */
  projeTavani(ajanId: string): number {
    const a = this.s.depo.ajan(ajanId);
    if (!a || a.rol === "ceo") return 0;
    const p = this.s.depo.proje(a.projeId);
    if (!p || this.belirleyen(p) !== "ceo") return 0;
    const secim = tempoKaydi(this.s.depo.deger(TEMPO_ONEKI + p.id))?.esZamanli ?? null;
    return secim ? gecerliTempo(secim, tavanDegeri(this.s.yapilandirma.ayarlar.esZamanliAjan)) : 0;
  }

  /** Ajanın projesinde tempoya sayılan (CEO dışı) çalışan sayısı */
  projeCalisani(ajanId: string): number {
    const a = this.s.depo.ajan(ajanId);
    return a ? this.s.depo.ajanlar(a.projeId).filter((x) => x.rol !== "ceo" && calisanMi(x.durum)).length : 0;
  }

  /** "Sırada" açıklamasındaki sayı: projenin temposu varsa o, yoksa genel tavan */
  siraTavani(ajanId: string): number {
    return this.projeTavani(ajanId) || this.s.yapilandirma.ayarlar.esZamanliAjan;
  }

  tempo(projeId: string): EkipTemposu {
    const p = this.s.proje(projeId);
    const ust = tavanDegeri(this.s.yapilandirma.ayarlar.esZamanliAjan);
    const belirleyen = this.belirleyen(p);
    const kayit = belirleyen === "ceo" ? tempoKaydi(this.s.depo.deger(TEMPO_ONEKI + p.id)) : null;
    const ekip = this.s.depo.ajanlar(p.id).filter((a) => a.rol !== "ceo");
    return {
      secim: kayit?.esZamanli ?? null,
      gerekce: kayit?.gerekce || null,
      zaman: kayit?.zaman || null,
      ustSinir: ust,
      gecerli: gecerliTempo(kayit?.esZamanli ?? null, ust),
      calisan: ekip.filter((a) => calisanMi(a.durum)).length,
      sirada: ekip.filter((a) => this.s.siradaMi(a.id)).length,
      belirleyen,
    };
  }

  /** Sıradaki çalışan sayısı değişti: tempo kısa gecikmeyle yeniden yayınlanır (Stüdyo'nun tempo satırı canlı kalsın) */
  tempoBildir(projeId: string): void {
    if (this.kapali || this.tempoYayinlari.has(projeId)) return;
    const z = setTimeout(() => {
      this.tempoYayinlari.delete(projeId);
      if (!this.kapali && this.s.depo.proje(projeId)) this.s.olaylar.yayinla({ tur: "tempo.guncellendi", projeId, tempo: this.tempo(projeId) });
    }, 400);
    z.unref();
    this.tempoYayinlari.set(projeId, z);
  }

  /** CEO'nun ekip_temposu kararı: üst sınıra kırpılır, duyurulur, sıra ve iş dağıtımı hemen işlenir */
  tempoYaz(ceo: Ajan, sayi: number, gerekce: string): EkipTemposu {
    const p = this.s.proje(ceo.projeId);
    if (ceo.rol !== "ceo") throw new ArnorgHatasi(iki("Ekip temposunu yalnız CEO belirler.", "Only the CEO sets the team pace."), 403);
    if (p.kararVeren !== "ceo") {
      throw new ArnorgHatasi(iki("Karar yetkisi kurulda: aynı anda kaç kişinin çalışacağını kurul Ayarlar'dan belirler.", "Decision authority is with the board: the board sets how many people work at once in Settings."), 409);
    }
    const ust = tavanDegeri(this.s.yapilandirma.ayarlar.esZamanliAjan);
    const istenen = Math.max(1, Math.floor(sayi));
    const deger = ust ? Math.min(istenen, ust) : istenen;
    const onceki = this.tempo(p.id);
    this.s.depo.degerYaz(TEMPO_ONEKI + p.id, JSON.stringify({ esZamanli: deger, gerekce: tekSatir(gerekce).slice(0, 500), zaman: simdi(), ceo: ceo.ad }));
    const t = this.tempo(p.id);
    this.s.olaylar.yayinla({ tur: "tempo.guncellendi", projeId: p.id, tempo: t });
    if (onceki.gecerli !== t.gecerli || onceki.secim !== t.secim) {
      this.s.duyur(
        p.id,
        iki(
          `${ceo.ad} (CEO) ekip temposunu ${t.gecerli} kişi yaptı${ust ? ` (kurulun üst sınırı ${ust})` : ""}: ${tekSatir(gerekce)}`,
          `${ceo.ad} (CEO) set the team pace to ${t.gecerli}${ust ? ` (the board's ceiling is ${ust})` : ""}: ${tekSatir(gerekce)}`,
        ),
      );
    }
    this.s.esZamanlilik.planla();
    this.dagitimPlanla(p.id);
    return t;
  }

  /** Kurulun üst sınırı 0.0.8'de 3'ten 8'e çıktı: eski varsayılanda kalan kurulum bir kez yükseltilir */
  private ustSiniriYukselt(): void {
    if (this.s.depo.deger(UST_SINIR_GOCU)) return;
    this.s.depo.degerYaz(UST_SINIR_GOCU, simdi());
    if (this.s.yapilandirma.ayarlar.esZamanliAjan === ESKI_UST_SINIR) {
      try {
        this.s.yapilandirma.guncelle({ esZamanliAjan: YENI_UST_SINIR });
      } catch {
        // salt okunur veri dizini: eski değer kalır
      }
    }
  }

  // ===================================================================
  // İş dağıtımı: boşa çıkan çalışana sıradaki iş
  // ===================================================================

  dagitimPlanla(projeId: string): void {
    if (!this.isDagitimi || this.kapali || this.dagitimlar.has(projeId)) return;
    const z = setTimeout(() => {
      this.dagitimlar.delete(projeId);
      void this.isDagit(projeId).catch(() => undefined);
    }, DAGITIM_GECIKMESI_MS);
    z.unref();
    this.dagitimlar.set(projeId, z);
  }

  /**
   * Tempo ve genel tavan izin verdikçe boştaki (boşta ya da kapalı, sırada değil, süren görevi olmayan) çalışanlara
   * sıradaki işlerini başlatır: kendi planlı işi, yoksa rolüne uyan atanmamış iş. Başlatılan görev kodları döner.
   */
  async isDagit(projeId: string): Promise<string[]> {
    // Kurul mesaiyi durdurduysa ArnOrg işi kendiliğinden yeniden başlatmaz (kurul yazınca sürer); uykudaki proje de
    // kendiliğinden uyanmaz (açılışta, güncellemeden sonra)
    if (this.dagitiliyor.has(projeId) || this.kapali || this.s.hesap.sinir || this.s.mesaiDurduMu(projeId) || !this.s.projeEtkinMi(projeId)) return [];
    const p = this.s.depo.proje(projeId);
    if (!p || !fs.existsSync(p.yol)) return [];
    this.dagitiliyor.add(projeId);
    const baslatilan: string[] = [];
    try {
      const t = this.tempo(projeId);
      const ust = t.ustSinir;
      const genelCalisan = this.s.depo.projeler().reduce((n, x) => n + this.s.depo.ajanlar(x.id).filter((a) => calisanMi(a.durum)).length, 0);
      let yer = Math.min(t.gecerli > 0 ? t.gecerli - t.calisan - t.sirada : Number.POSITIVE_INFINITY, ust > 0 ? ust - genelCalisan : Number.POSITIVE_INFINITY);
      if (yer <= 0) return [];
      const gorevler = this.s.depo.gorevler(projeId);
      const mesgul = new Set(gorevler.filter((g) => g.durum === "calisiliyor" && g.atananId).map((g) => g.atananId!));
      const bostakiler = this.bostakiler(projeId, mesgul).sort((a, b) => (this.s.sonEtkinlik.get(a.id) ?? 0) - (this.s.sonEtkinlik.get(b.id) ?? 0));
      const alinan = new Set<string>();
      const ceo = this.s.ceoBul(projeId);
      for (const a of bostakiler) {
        if (yer <= 0) break;
        const g = siradakiIs(a, this.s.depo.gorevler(projeId), alinan);
        if (!g) continue;
        alinan.add(g.id);
        try {
          await this.s.gorevGuncelle(g.id, { atananId: a.id, durum: "calisiliyor" });
        } catch {
          continue;
        }
        yer--;
        baslatilan.push(g.kod);
        if (ceo) {
          this.s.zeka.haberEkle(
            ceo.id,
            iki(
              `${a.ad} boşa çıktı; ArnOrg ${g.atananId ? "planlı işini" : "rolüne uyan atanmamış işi"} başlattı: ${g.kod} "${kisalt(g.baslik, 80)}".`,
              `${a.ad} became idle; ArnOrg started ${g.atananId ? "their planned task" : "an unassigned task that fits their role"}: ${g.kod} "${kisalt(g.baslik, 80)}".`,
            ),
          );
        }
      }
      this.issizBildirimPlanla(projeId);
      return baslatilan;
    } finally {
      this.dagitiliyor.delete(projeId);
    }
  }

  /** Boştaki çalışanlar: boşta ya da kapalı, CEO değil, süren görevi yok, sırada, tavanda ya da kurulca durdurulmuş değil */
  private bostakiler(projeId: string, mesgul: Set<string>): Ajan[] {
    return this.s.depo
      .ajanlar(projeId)
      .filter(
        (a) =>
          a.rol !== "ceo" &&
          (a.durum === "bosta" || a.durum === "kapali") &&
          !mesgul.has(a.id) &&
          !this.s.siradaMi(a.id) &&
          !this.s.gorevTavani.duraklatmaAciklamasi(a.id) &&
          !this.s.kurulDurdurduMu(a.id),
      );
  }

  /** Boşta olup yapacak işi (kendi planlı işi ya da rolüne uyan atanmamış iş) olmayan çalışanlar */
  issizler(projeId: string): Ajan[] {
    const gorevler = this.s.depo.gorevler(projeId);
    const mesgul = new Set(gorevler.filter((g) => g.durum === "calisiliyor" && g.atananId).map((g) => g.atananId!));
    return this.bostakiler(projeId, mesgul).filter((a) => !BOSTA_OLAGAN.has(a.rol) && !siradakiIs(a, gorevler));
  }

  /**
   * Yapacak işi olmayan boştaki çalışanlar CEO'ya kısa bir beklemeden sonra toplu söylenir; her çalışan bir kez (yeniden
   * iş alana dek). CEO çalışıyorsa haber olarak sıradaki turuna eklenir, boştaysa uyandırılır.
   */
  private issizBildirimPlanla(projeId: string): void {
    const issizler = this.issizler(projeId);
    const bildirilen = this.bildirilenBuda(projeId, issizler);
    if (!issizler.some((a) => !bildirilen.has(a.id)) || this.issizZamanlayicilari.has(projeId)) return;
    const z = setTimeout(() => {
      this.issizZamanlayicilari.delete(projeId);
      void this.issizleriBildir(projeId).catch(() => undefined);
    }, ISSIZ_BILDIRIM_MS);
    z.unref();
    this.issizZamanlayicilari.set(projeId, z);
  }

  /** CEO'ya işsiz diye söylenmişlerden artık işsiz olmayanlar çıkar: iş alan, yeniden boşa çıkınca yine söylenir */
  private bildirilenBuda(projeId: string, issizler: Ajan[]): Set<string> {
    let bildirilen = this.bildirilenIssizler.get(projeId);
    if (!bildirilen) this.bildirilenIssizler.set(projeId, (bildirilen = new Set()));
    const simdiki = new Set(issizler.map((a) => a.id));
    for (const id of bildirilen) if (!simdiki.has(id)) bildirilen.delete(id);
    return bildirilen;
  }

  /** İşsiz çalışanları CEO'ya söyler; söylenenler döner (söylenmediyse boş) */
  async issizleriBildir(projeId: string): Promise<string[]> {
    if (this.kapali || !this.isDagitimi || this.s.hesap.sinir || this.s.mesaiDurduMu(projeId) || !this.s.projeEtkinMi(projeId)) return [];
    const ceo = this.s.ceoBul(projeId);
    if (!ceo || this.s.kurulDurdurduMu(ceo.id) || ceo.durum === "duraklatildi" || ceo.durum === "hata") return [];
    const issizler = this.issizler(projeId);
    const bildirilen = this.bildirilenBuda(projeId, issizler);
    if (!issizler.some((a) => !bildirilen.has(a.id))) return [];
    for (const a of issizler) bildirilen.add(a.id);
    const liste = issizler.map((a) => `${a.ad} (${rolAdiDilde(a)})`).join(", ");
    const metin = iki(
      `Boşta ve yapacak işi olmayan çalışanlar: ${liste}. Planda onlara uyan iş varsa görev aç ve ata (baslat=true; etikete rol kimliğini yaz ki boşa çıkınca kendiliğinden başlasın). İşler aynı dosyalarda toplanıyorsa ya da bilerek bekletiyorsan böyle kalabilir; bu not, bu kişiler yeniden iş alana dek yinelenmez.`,
      `Idle employees with nothing to do: ${liste}. If the plan has work that fits them, open a task and assign it (baslat=true; put the role id in the label so it starts by itself when they become idle). If the work is concentrated in the same files or you are holding them back on purpose, leave it; this note does not repeat for them until they get work again.`,
    );
    if (calisanMi(ceo.durum) || this.s.siradaMi(ceo.id)) this.s.zeka.haberEkle(ceo.id, metin);
    else await this.s.uyandir(ceo.id, metin, null);
    return issizler.map((a) => a.ad);
  }

  // ===================================================================
  // Durum ve geçiş
  // ===================================================================

  durum(projeId: string): OrtakCalismaDurumu {
    this.s.proje(projeId);
    return {
      kiralar: this.kiralar.liste(projeId),
      tempo: this.tempo(projeId),
      kayitlar: this.defter.liste(projeId, 60),
      kalanlar: jsonOku(this.s.depo.deger(KALANLAR_ONEKI + projeId), []),
    };
  }

  /**
   * Açılışta 0.0.8 geçişi: eski worktree ve dallar ortak projeye alınır (gecis.ts). Kalan varsa ya da bir şey
   * değiştiyse #genel'e ve CEO'ya (uyandırmadan, haber olarak) bir kez söylenir.
   */
  async gecis(): Promise<GecisSonucu[]> {
    const sonuclar: GecisSonucu[] = [];
    for (const p of this.s.depo.projeler()) {
      try {
        const s = await projeyiGecir({ depo: this.s.depo, git: this.git, arnorgCommitle: (pid) => this.s.arnorgCommitIs(pid) }, p);
        sonuclar.push(s);
        if (!gecisOldu(s)) continue;
        if (s.kalanlar.length) this.s.depo.degerYaz(KALANLAR_ONEKI + p.id, JSON.stringify(s.kalanlar));
        if (this.s.depo.deger(GECIS_ONEKI + p.id)) continue;
        this.s.depo.degerYaz(GECIS_ONEKI + p.id, simdi());
        this.gecisiDuyur(p, s);
      } catch (h) {
        this.s.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: iki(`0.0.8 geçişi yapılamadı (${p.ad}): ${(h as Error).message}`, `The 0.0.8 migration failed (${p.ad}): ${(h as Error).message}`), projeId: p.id });
      }
    }
    return sonuclar;
  }

  private gecisiDuyur(p: Proje, s: GecisSonucu): void {
    const alinan = s.alinan.map((x) => `${x.dal} (${x.ajanAd})`).join(", ");
    const satirlar = kalanSatirlari(s.kalanlar);
    const ozet = iki(
      `ArnOrg 0.0.8: ekip artık tek projede, ${p.varsayilanDal} dalında görev bazlı çalışıyor; kişisel dal ve birleştirme onayı yok. Görev 'inceleme'ye geçince ArnOrg dosyalarını commit'ler.${alinan ? ` Ortak projeye alınan dallar: ${alinan}.` : ""}${s.kaldirilan ? ` ${s.kaldirilan} eski çalışma alanı kaldırıldı.` : ""}`,
      `ArnOrg 0.0.8: the team now works task by task in one project on ${p.varsayilanDal}; there are no personal branches or merge approvals. When a task moves to 'inceleme', ArnOrg commits its files.${alinan ? ` Branches brought into the shared project: ${alinan}.` : ""}${s.kaldirilan ? ` ${s.kaldirilan} old workspace${s.kaldirilan === 1 ? " was" : "s were"} removed.` : ""}`,
    );
    const kalan = satirlar.length
      ? iki(
          `\nOrtak projeye alınamayıp korunanlar (hiçbir iş silinmedi):\n${satirlar.join("\n")}\nİçlerinden gerekeni ortak projeye elle taşıyın ya da işi yeniden planlayın.`,
          `\nKept because they could not be brought into the shared project (no work was deleted):\n${satirlar.join("\n")}\nMove what is needed into the shared project by hand, or re-plan the work.`,
        )
      : "";
    this.s.duyur(p.id, ozet + kalan);
    // Eski alanı korunan çalışana kendi işinin nerede durduğu söylenir (bir sonraki turunda)
    for (const k of s.kalanlar) {
      const a = this.s.depo.ajanAdla(p.id, k.ajanAd);
      if (!a || !k.yol) continue;
      this.s.zeka.haberEkle(
        a.id,
        iki(
          `0.0.8 geçişi: eski çalışma alanın ${k.yol}${k.dal ? ` (${k.dal})` : ""} korunuyor: ${k.ayrinti}. Artık ortak projede çalışıyorsun; oradaki işinden gerekeni dosyaları okuyup ortak projeye yazarak taşı, bitince CEO'ya söyle.`,
          `0.0.8 move: your old workspace ${k.yol}${k.dal ? ` (${k.dal})` : ""} is kept: ${k.ayrinti}. You now work in the shared project; move what you need from there by reading the files and writing them in the shared project, then tell the CEO.`,
        ),
      );
    }
    const ceo = this.s.ceoBul(p.id);
    if (!ceo) return;
    const ceoMetni = iki(
      `${ozet} birlestirme_iste artık yok; incelemede görevin kaydını calisma_farki ile oku ve uygunsa 'tamam' yap. Aynı anda kaç çalışanın çalışacağını ekip_temposu ile sen belirlersin.${kalan}`,
      `${ozet} birlestirme_iste no longer exists; in review read the task's save with calisma_farki and move it to 'tamam' if it is right. You decide how many employees work at once with ekip_temposu.${kalan}`,
    );
    // Uyandırmadan: güncellemeden sonra uykudaki projeler kendiliğinden çalışmaya başlamasın; CEO bir sonraki turunda
    // okur, kurul #genel'de ve Ekip'te görür
    this.s.zeka.haberEkle(ceo.id, ceoMetni);
  }
}

