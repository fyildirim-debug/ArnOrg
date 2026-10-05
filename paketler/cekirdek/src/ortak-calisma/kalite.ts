// Kaydın kalite denetimi (0.0.8): her görev kaydından sonra projenin test komutu (varsa önce hazırlık komutu) projenin
// kalite çalışma alanında, kaydın commit'inde arka planda koşar. Proje başına sırayla (FIFO) ve aynı anda tek denetim;
// kimseyi bekletmez, çalışanlar ortak projede işine devam eder. Kuyruk uzarsa en eski bekleyenler atlanır (daha yeni
// kayıtlar onları da içerir). Denetim bitince sonuç index.ts'e bildirilir: geçmeyen kaydın görevi sahibine döner.
// Araçlar kalite-kapisi.ts'ten: kalite alanı, süre sınırlı komut, çıktının son kısmı.
import { KAYIT_SON_DURUMLARI, type GorevKaydi, type KayitKalitesi, type Proje } from "@arnorg/ortak";
import { iki } from "../dil.js";
import { CiktiKuyrugu, kaliteAlaniHazirla, kaliteAlaniniBirak, kaliteAlaniniSil, kaliteYolu, komutCalistir, type KomutSonucu } from "../kalite-kapisi.js";
import { ArnorgHatasi, bulunamadi, kisalt, simdi } from "../yardimci.js";
import type { GitSirasi } from "./git-sirasi.js";
import { bosKalite, type KayitDefteri } from "./kayitlar.js";

/** Projede bundan fazla bekleyen denetim olursa en eskisi atlanır */
export const EN_COK_BEKLEYEN = 6;
/** Süren komutun çıktısı en sık bu aralıkla yayınlanır */
const CANLI_ARALIK_MS = 2000;

/** "1 dk 42 sn" / "1 min 42 s" */
export function sureMetni(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  const dk = Math.floor(sn / 60);
  if (!dk) return iki(`${sn} sn`, `${sn} s`);
  return sn % 60 ? iki(`${dk} dk ${sn % 60} sn`, `${dk} min ${sn % 60} s`) : iki(`${dk} dk`, `${dk} min`);
}

/** Kaydın denetimi geçmedi mi (zaman aşımı dahil) */
export function kaldiMi(k: Pick<GorevKaydi, "kalite">): boolean {
  return k.kalite.durum === "kaldi" || k.kalite.durum === "zaman_asimi";
}

export interface KaliteDenetimiBaglami {
  defter: KayitDefteri;
  proje(id: string): Proje | null;
  /** Kalite çalışma alanlarının kökü (<veri>/kalite) */
  kaliteKoku: string;
  git: GitSirasi;
  /** Kaydın kalitesi değişti (kayit.guncellendi) */
  yayinla(k: GorevKaydi): void;
  /** Denetim bitti; onceki: projede sonucu bilinen bir önceki denetim (dal zaten kırmızı mıydı) */
  bitti(k: GorevKaydi, onceki: GorevKaydi | null): Promise<void>;
}

/** Uygulama kapanıyor: süren denetim sessizce bırakılır, açılışta yeniden kuyruğa girer */
class Kapandi extends Error {}

export class KaliteDenetimi {
  /** Proje → sırasını bekleyen kayıtlar */
  private readonly bekleyenler = new Map<string, string[]>();
  /** Proje → süren denetim */
  private readonly calisanlar = new Map<string, { id: string; iptal: AbortController }>();
  private kapali = false;

  constructor(private readonly b: KaliteDenetimiBaglami) {}

  /** Açılışta bitmemiş denetimler kayıt sırasıyla yeniden kuyruğa girer */
  baslat(): void {
    for (const k of this.b.defter.denetimiSurenler()) {
      if (this.varMi(k.id)) continue;
      this.kaydet(k.id, { durum: "kuyrukta", adimBaslangic: null });
      this.kuyrugaKoy(k.projeId, k.id);
    }
    for (const pid of this.bekleyenler.keys()) {
      this.siralariYaz(pid);
      this.isle(pid);
    }
  }

  /** Yeni kaydı denetime alır; test komutu yoksa hemen "testsiz" biter */
  ekle(k: GorevKaydi): GorevKaydi {
    const p = this.b.proje(k.projeId);
    if (!p?.testKomutu) return this.kaydet(k.id, { ...bosKalite("testsiz"), bitis: simdi() }) ?? k;
    const son = this.kaydet(k.id, bosKalite("kuyrukta", p.testKomutu)) ?? k;
    this.kuyrugaKoy(k.projeId, k.id);
    this.siralariYaz(k.projeId);
    this.isle(k.projeId);
    return this.b.defter.kayit(k.id) ?? son;
  }

  /** Bitmiş denetimi yeniden koşar (kurulun "Yeniden dene"si) */
  yeniden(id: string): GorevKaydi {
    const k = this.b.defter.kayit(id);
    if (!k) throw bulunamadi("Kayıt", "Save");
    if (!KAYIT_SON_DURUMLARI.includes(k.kalite.durum) || this.varMi(id)) throw new ArnorgHatasi(iki("Bu kaydın denetimi zaten sürüyor.", "This save is already being checked."), 409);
    const p = this.b.proje(k.projeId);
    if (!p?.testKomutu) throw new ArnorgHatasi(iki("Projede test komutu yok; Projeler'deki ayarlardan ekleyin.", "The project has no test command; add one in the project settings."), 409);
    this.kaydet(id, bosKalite("kuyrukta", p.testKomutu));
    this.kuyrugaKoy(k.projeId, id);
    this.siralariYaz(k.projeId);
    this.isle(k.projeId);
    return this.b.defter.kayit(id)!;
  }

  /** Projede süren ya da bekleyen denetim var mı */
  suruyorMu(projeId: string): boolean {
    return this.calisanlar.has(projeId) || (this.bekleyenler.get(projeId)?.length ?? 0) > 0;
  }

  projeKaldir(proje: Proje): void {
    this.bekleyenler.delete(proje.id);
    const c = this.calisanlar.get(proje.id);
    c?.iptal.abort();
    const sil = () => void kaliteAlaniniSil(proje.yol, kaliteYolu(this.b.kaliteKoku, proje));
    if (c) setTimeout(sil, 3000).unref();
    else sil();
  }

  kapat(): void {
    this.kapali = true;
    for (const c of this.calisanlar.values()) c.iptal.abort();
    this.bekleyenler.clear();
  }

  // -------------------------------------------------------------------------

  private varMi(id: string): boolean {
    for (const c of this.calisanlar.values()) if (c.id === id) return true;
    for (const l of this.bekleyenler.values()) if (l.includes(id)) return true;
    return false;
  }

  private kuyrugaKoy(projeId: string, id: string): void {
    const l = this.bekleyenler.get(projeId) ?? [];
    l.push(id);
    // Kuyruk uzadıysa en eski bekleyenler atlanır: sonraki commit'ler onların değişikliklerini de içerir
    while (l.length > EN_COK_BEKLEYEN) {
      const atlanan = l.shift()!;
      this.kaydet(atlanan, {
        durum: "atlandi",
        sira: null,
        bitis: simdi(),
        mesaj: iki("Sırada çok kayıt birikti; daha yeni kayıtların denetimi bunu da kapsıyor.", "Too many saves were queued; the checks of later saves cover this one too."),
      });
    }
    this.bekleyenler.set(projeId, l);
  }

  private siralariYaz(projeId: string): void {
    const onde = this.calisanlar.has(projeId) ? 1 : 0;
    (this.bekleyenler.get(projeId) ?? []).forEach((id, i) => {
      const sira = i + 1 + onde;
      if (this.b.defter.kayit(id)?.kalite.sira !== sira) this.kaydet(id, { sira });
    });
  }

  private isle(projeId: string): void {
    if (this.kapali || this.calisanlar.has(projeId)) return;
    const id = this.bekleyenler.get(projeId)?.shift();
    if (!id) {
      this.bekleyenler.delete(projeId);
      return;
    }
    const iptal = new AbortController();
    this.calisanlar.set(projeId, { id, iptal });
    this.siralariYaz(projeId);
    void this.calistir(id, iptal.signal)
      .catch(() => undefined)
      .finally(() => {
        this.calisanlar.delete(projeId);
        this.isle(projeId);
      });
  }

  private dur(): void {
    if (this.kapali) throw new Kapandi();
  }

  private async calistir(id: string, iptal: AbortSignal): Promise<void> {
    const k = this.b.defter.kayit(id);
    const p = k ? this.b.proje(k.projeId) : null;
    if (!k || !p) return;
    const testKomutu = p.testKomutu;
    if (!testKomutu) {
      await this.sonuclandir(k, { durum: "testsiz", mesaj: null });
      return;
    }
    const hazirlik = p.hazirlikKomutu;
    const yol = kaliteYolu(this.b.kaliteKoku, p);
    const cikti = new CiktiKuyrugu();
    const baslangic = simdi();
    this.kaydet(id, { durum: "hazirlik", komut: hazirlik ?? testKomutu, sira: null, baslangic, adimBaslangic: baslangic, bitis: null, sureMs: null, cikti: "", mesaj: null });
    try {
      // Kalite alanı ana repoya bağlı bir worktree'dir: hazırlığı git sırasından geçer (komutlar sıranın dışında koşar)
      await this.b.git.calistir(p.id, () => kaliteAlaniHazirla(p.yol, yol, k.commit));
      this.dur();
      const bitisMs = Date.now() + p.testZamanAsimiDk * 60_000;
      if (hazirlik) {
        const r = await this.komut(id, hazirlik, yol, bitisMs, cikti, iptal);
        if (r.durum !== "gecti") {
          await this.gecmedi(k, hazirlik, r, cikti, true, p.testZamanAsimiDk);
          return;
        }
      }
      this.kaydet(id, { durum: "test", komut: testKomutu, adimBaslangic: simdi(), cikti: cikti.metin() });
      const r = await this.komut(id, testKomutu, yol, bitisMs, cikti, iptal);
      if (r.durum !== "gecti") {
        await this.gecmedi(k, testKomutu, r, cikti, false, p.testZamanAsimiDk);
        return;
      }
      await this.sonuclandir(k, { durum: "gecti", komut: testKomutu, cikti: cikti.metin(), mesaj: null });
    } catch (h) {
      if (h instanceof Kapandi) return;
      await this.sonuclandir(k, { durum: "hata", mesaj: kisalt((h as Error).message, 600), cikti: cikti.metin() });
    } finally {
      if (!this.kapali) await kaliteAlaniniBirak(yol);
    }
  }

  private async komut(id: string, komut: string, cwd: string, bitisMs: number, cikti: CiktiKuyrugu, iptal: AbortSignal): Promise<KomutSonucu> {
    cikti.ekle(`${cikti.degisim ? "\n" : ""}$ ${komut}\n`);
    let yayinlanan = cikti.degisim;
    const canli = setInterval(() => {
      if (cikti.degisim === yayinlanan) return;
      yayinlanan = cikti.degisim;
      this.kaydet(id, { cikti: cikti.metin() });
    }, CANLI_ARALIK_MS);
    canli.unref();
    try {
      const r = await komutCalistir(komut, { cwd, zamanAsimiMs: Math.max(1000, bitisMs - Date.now()), cikti, iptal });
      if (r.durum === "iptal") throw new Kapandi();
      return r;
    } finally {
      clearInterval(canli);
    }
  }

  private async gecmedi(k: GorevKaydi, komut: string, r: KomutSonucu, cikti: CiktiKuyrugu, hazirlik: boolean, sureDk: number): Promise<void> {
    const zamanAsimi = r.durum === "zaman_asimi";
    const kod = r.kod ?? "?";
    const mesaj = zamanAsimi
      ? iki(`${komut} ${sureMetni(sureDk * 60_000)} içinde bitmedi; süreç durduruldu.`, `${komut} did not finish within ${sureMetni(sureDk * 60_000)}; the process was stopped.`)
      : hazirlik
        ? iki(`Hazırlık komutu başarısız: ${komut} (çıkış kodu ${kod}).`, `The preparation command failed: ${komut} (exit code ${kod}).`)
        : iki(`${komut} başarısız (çıkış kodu ${kod}).`, `${komut} failed (exit code ${kod}).`);
    await this.sonuclandir(k, { durum: zamanAsimi ? "zaman_asimi" : "kaldi", komut, cikti: cikti.metin(), mesaj });
  }

  /** Son durumu yazar (süre, bitiş, kırmızının başladığı kayıt) ve sonucu bildirir */
  private async sonuclandir(k: GorevKaydi, d: Partial<KayitKalitesi> & Pick<KayitKalitesi, "durum">): Promise<void> {
    if (this.kapali) return;
    const onceki = this.b.defter.sonSonuclu(k.projeId, k.id);
    const simdiki = this.b.defter.kayit(k.id);
    const bas = simdiki?.kalite.baslangic ? Date.parse(simdiki.kalite.baslangic) : NaN;
    const bitis = simdi();
    const kaldi = d.durum === "kaldi" || d.durum === "zaman_asimi";
    const kirmiziKayit = kaldi && onceki && kaldiMi(onceki) ? (onceki.kalite.kirmiziKayit ?? onceki.id) : null;
    const son = this.kaydet(k.id, { sira: null, adimBaslangic: null, bitis, sureMs: Number.isNaN(bas) ? null : Date.parse(bitis) - bas, kirmiziKayit, ...d });
    if (son) await this.b.bitti(son, onceki);
  }

  private kaydet(id: string, d: Partial<KayitKalitesi>): GorevKaydi | null {
    if (this.kapali) return null;
    const k = this.b.defter.kaliteYaz(id, d);
    if (k) this.b.yayinla(k);
    return k;
  }
}
