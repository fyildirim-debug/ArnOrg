// Birleştirme kuyruğu ve kalite kapısı. Onaylanan birleştirmeler proje başına sırayla (FIFO) işlenir; aynı anda tek
// birleştirme. Her iş projenin kalite çalışma alanında hedef dalın son commit'ine commit'lenmeden birleştirilir;
// çakışma yoksa hazırlık ve test komutu koşar. Geçen iş ana repoda bugünkü gibi birleştirilir (ana repo hedef dalda ve
// temiz olmalı); test ile birleştirme arasında hedef dal ilerlediyse iş yeniden test edilir. Durum onayın veri.kalite
// alanında tutulur ve her adımda onay.sonuc olayıyla yayınlanır; uygulama yeniden açılınca yarım kalan işler sürer.
import {
  BIRLESTIRME_SON_DURUMLARI,
  YENIDEN_BIRLESTIRILEBILIR,
  type BirlestirmeKalitesi,
  type FarkSonucu,
  type Onay,
  type Proje,
  type ProjeGuncelleIstegi,
} from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import * as gitIslemleri from "./git.js";
import {
  CiktiKuyrugu,
  commitBul,
  dalFarki,
  degisenYollar,
  denemeBirlestir,
  kaliteAlaniHazirla,
  kaliteAlaniniBirak,
  kaliteAlaniniSil,
  kaliteYolu,
  komutCalistir,
  sonKisim,
  type KomutSonucu,
} from "./kalite-kapisi.js";
import type { OlayYolu } from "./olaylar.js";
import { ArnorgHatasi, belirtme, bulunamadi, kisalt, simdi } from "./yardimci.js";

/** Hedef dal ilerledikçe iş en çok bu kadar kez test edilir; sonra hata */
const EN_COK_DENEME = 3;
/** Süren komutun çıktısı en sık bu aralıkla yayınlanır */
const CANLI_ARALIK_MS = 2000;
/** Ajana giden mesajdaki çıktı: son satırlar */
const MESAJ_SATIRI = 40;
const MESAJ_BAYTI = 3000;

/** Birleştirme onayının verisi (birlestirme_iste yazar; kalite kapısı kalite alanını ekler) */
export interface BirlestirmeVerisi {
  ajanId: string;
  dal: string;
  ozet: string;
  isteyenId?: string;
  kalite?: BirlestirmeKalitesi;
}

export function birlestirmeVerisi(veri: unknown): BirlestirmeVerisi | null {
  const v = veri as Partial<BirlestirmeVerisi> | null;
  return v && typeof v === "object" && typeof v.dal === "string" && typeof v.ajanId === "string" ? (v as BirlestirmeVerisi) : null;
}

/** Onayın kalite kapısı kaydı; kuyruğa hiç girmediyse null */
export function kaliteOku(onay: Onay): BirlestirmeKalitesi | null {
  return onay.tur === "birlestirme" ? (birlestirmeVerisi(onay.veri)?.kalite ?? null) : null;
}

/** "1 dk 42 sn" / "1 min 42 s" */
export function sureMetni(ms: number): string {
  const sn = Math.max(0, Math.round(ms / 1000));
  const dk = Math.floor(sn / 60);
  if (!dk) return iki(`${sn} sn`, `${sn} s`);
  return sn % 60 ? iki(`${dk} dk ${sn % 60} sn`, `${dk} min ${sn % 60} s`) : iki(`${dk} dk`, `${dk} min`);
}

/** Proje güncelleme isteğindeki kalite kapısı alanları: komut tek satır, boş metin kaldırır; süre sınırı 1–240 dk */
export function kaliteAyarlari(istek: ProjeGuncelleIstegi): Partial<Pick<Proje, "testKomutu" | "hazirlikKomutu" | "testZamanAsimiDk">> {
  const alanlar: Partial<Pick<Proje, "testKomutu" | "hazirlikKomutu" | "testZamanAsimiDk">> = {};
  const komut = (v: string | null, ad: [string, string]): string | null => {
    const t = (v ?? "").trim();
    if (!t) return null;
    if (/[\r\n]/.test(t)) throw new ArnorgHatasi(iki(`${ad[0]} tek satır olmalı.`, `The ${ad[1]} must be a single line.`));
    if (t.length > 2000) throw new ArnorgHatasi(iki(`${ad[0]} en çok 2000 karakter olabilir.`, `The ${ad[1]} can be at most 2000 characters.`));
    return t;
  };
  if (istek.testKomutu !== undefined) alanlar.testKomutu = komut(istek.testKomutu, ["Test komutu", "test command"]);
  if (istek.hazirlikKomutu !== undefined) alanlar.hazirlikKomutu = komut(istek.hazirlikKomutu, ["Hazırlık komutu", "preparation command"]);
  if (istek.testZamanAsimiDk !== undefined) {
    const dk = Math.round(Number(istek.testZamanAsimiDk));
    if (!Number.isFinite(dk) || dk < 1 || dk > 240) throw new ArnorgHatasi(iki("Test süre sınırı 1–240 dakika olmalı.", "The test time limit must be 1–240 minutes."));
    alanlar.testZamanAsimiDk = dk;
  }
  return alanlar;
}

/** Kalite kapısının komutları değişince ekibe gidecek duyuru; değişmediyse null */
export function kaliteDuyurusu(onceki: Proje, yeni: Proje): string | null {
  if (onceki.testKomutu === yeni.testKomutu && onceki.hazirlikKomutu === yeni.hazirlikKomutu) return null;
  if (!yeni.testKomutu) {
    return iki("Kurul test komutunu kaldırdı; onaylı birleştirmelerde yalnız çakışma denetlenecek.", "The board removed the test command; approved merges will only be checked for conflicts.");
  }
  const hazirlik = yeni.hazirlikKomutu ? iki(` (önce ${yeni.hazirlikKomutu})`, ` (after ${yeni.hazirlikKomutu})`) : "";
  return iki(
    `Kalite kapısı: onaylı her birleştirmeden önce ${yeni.testKomutu}${hazirlik} koşacak; geçmeyen iş ${yeni.varsayilanDal} dalına girmez. birlestirme_iste'den önce aynı komutu kendi çalışma alanınızda koşun.`,
    `Quality gate: ${yeni.testKomutu}${hazirlik} now runs before every approved merge; work that fails stays out of ${yeni.varsayilanDal}. Run the same command in your own working directory before birlestirme_iste.`,
  );
}

export interface KuyrukBaglami {
  depo: Depo;
  olaylar: OlayYolu;
  /** Kalite çalışma alanlarının kökü (<veri>/kalite) */
  kaliteKoku: string;
  /** ArnOrg'un .arnorg kayıtlarını commit'ler; ana repo temiz kalır */
  arnorgCommitle(projeId: string): Promise<boolean>;
  /** İş ana repoda birleşti: görevler, duyuru, uzak depoya gönderim, hafıza */
  birlesti(onay: Onay, kalite: BirlestirmeKalitesi): Promise<void>;
  sistemMesaji(ajanId: string, metin: string): Promise<void>;
  duyur(projeId: string, metin: string): void;
}

interface Is {
  onayId: string;
  projeId: string;
  testsiz: boolean;
  /** Kuyruğa girdiği andaki dal commit'i: bekleyen işte dal sonradan ilerlese de test edilen ve birleştirilen budur */
  dalCommit: Promise<string | null>;
}

/** Uygulama kapanıyor: süren iş sessizce bırakılır, açılışta yeniden kuyruğa girer */
class Kapandi extends Error {}

export class BirlestirmeKuyrugu {
  /** Proje → sırasını bekleyen işler */
  private readonly bekleyenler = new Map<string, Is[]>();
  /** Proje → işlenen iş ve komutunun iptali */
  private readonly calisanlar = new Map<string, { is: Is; iptal: AbortController }>();
  private kapali = false;

  constructor(private readonly b: KuyrukBaglami) {}

  /** Açılışta yarım kalan işler (kuyrukta, hazırlık, test) kuyruğa giriş sırasıyla geri alınır */
  baslat(): void {
    for (const p of this.b.depo.projeler()) {
      const yarim = this.b.depo
        .onaylar(p.id, "onaylandi")
        .map((o) => ({ o, k: kaliteOku(o) }))
        .filter((x): x is { o: Onay; k: BirlestirmeKalitesi } => !!x.k && !BIRLESTIRME_SON_DURUMLARI.includes(x.k.durum))
        .sort((a, b) => a.k.kuyrugaGiris.localeCompare(b.k.kuyrugaGiris));
      for (const { o, k } of yarim) {
        if (this.isVar(o.id)) continue;
        this.kaydet(o.id, { durum: "kuyrukta", adimBaslangic: null });
        this.kuyrugaKoy({ onayId: o.id, projeId: p.id, testsiz: k.testsiz, dalCommit: Promise.resolve(k.dalCommit) });
      }
      this.siralariYaz(p.id);
      this.isle(p.id);
    }
  }

  /** Onaylanan birleştirmeyi projenin kuyruğuna ekler; dalın o anki commit'i sabitlenir */
  ekle(onay: Onay, testsiz = false): Onay {
    const veri = birlestirmeVerisi(onay.veri);
    const proje = this.b.depo.proje(onay.projeId);
    if (!veri || !proje) throw new ArnorgHatasi(iki("Birleştirme verisi eksik.", "The merge data is missing."));
    if (this.isVar(onay.id)) throw new ArnorgHatasi(iki("Bu birleştirme zaten kuyrukta.", "This merge is already in the queue."), 409);
    const onceki = veri.kalite;
    const kalite: BirlestirmeKalitesi = {
      durum: "kuyrukta",
      sira: null,
      dalCommit: onceki?.dalCommit ?? null,
      hedefCommit: onceki?.hedefCommit ?? null,
      testYok: !proje.testKomutu,
      testsiz,
      komut: null,
      deneme: onceki?.deneme ?? 0,
      kuyrugaGiris: simdi(),
      baslangic: null,
      adimBaslangic: null,
      bitis: null,
      sureMs: null,
      // Testsiz birleştirmede geçmeyen testin çıktısı bağlam olarak kalır
      cikti: testsiz ? (onceki?.cikti ?? "") : "",
      mesaj: null,
    };
    const yazilan = this.b.depo.onayVerisiYaz(onay.id, { ...(onay.veri as object), kalite });
    if (yazilan) this.b.olaylar.yayinla({ tur: "onay.sonuc", onay: yazilan });
    const dalCommit = kalite.dalCommit ? Promise.resolve(kalite.dalCommit) : commitBul(proje.yol, `refs/heads/${veri.dal}`).catch(() => null);
    if (!kalite.dalCommit) {
      void dalCommit.then((c) => {
        if (c) this.kaydet(onay.id, { dalCommit: c });
      });
    }
    this.kuyrugaKoy({ onayId: onay.id, projeId: proje.id, testsiz, dalCommit });
    this.siralariYaz(proje.id);
    this.isle(proje.id);
    return this.b.depo.onay(onay.id) ?? onay;
  }

  /** Kurulun kararı: kalite kapısında kalan işi testsiz birleştirir ya da kapıdan yeniden geçirir */
  yeniden(onayId: string, testsiz: boolean): Onay {
    const onay = this.b.depo.onay(onayId);
    if (!onay || onay.tur !== "birlestirme") throw bulunamadi("Birleştirme", "Merge");
    if (onay.durum !== "onaylandi") throw new ArnorgHatasi(iki("Yalnız onaylanmış birleştirme yeniden işlenebilir.", "Only an approved merge can be processed again."), 409);
    const k = kaliteOku(onay);
    if (!k || !YENIDEN_BIRLESTIRILEBILIR.includes(k.durum)) {
      throw new ArnorgHatasi(
        iki(
          "Bu birleştirme kalite kapısında kalmadı. Testsiz birleştirme ve yeniden deneme yalnız testler geçmediğinde, zaman aşımında ya da hatada yapılabilir.",
          "This merge is not stuck at the quality gate. Merging without tests and retrying are only possible after failed tests, a timeout or an error.",
        ),
        409,
      );
    }
    return this.ekle(onay, testsiz);
  }

  /** Dalın hedefe göre farkı: kuyruğa giren commit'in (yoksa dalın) ortak atadan bu yana değişiklikleri */
  async fark(onayId: string): Promise<FarkSonucu> {
    const onay = this.b.depo.onay(onayId);
    const veri = onay?.tur === "birlestirme" ? birlestirmeVerisi(onay.veri) : null;
    const proje = onay ? this.b.depo.proje(onay.projeId) : null;
    if (!onay || !veri || !proje) throw bulunamadi("Birleştirme", "Merge");
    const kaynak = veri.kalite?.dalCommit ?? (await commitBul(proje.yol, `refs/heads/${veri.dal}`));
    if (!kaynak) throw new ArnorgHatasi(iki(`${veri.dal} dalı bulunamadı.`, `Branch ${veri.dal} was not found.`), 404);
    // Birleştikten sonra hedef dal kaynağı içerir; fark birleşmeden önceki hedefe göre alınır
    const hedef = veri.kalite?.durum === "birlesti" && veri.kalite.hedefCommit ? veri.kalite.hedefCommit : proje.varsayilanDal;
    return dalFarki(proje.yol, hedef, kaynak);
  }

  /** Bu dal için kuyrukta ya da kapıda süren bir iş var mı */
  suruyorMu(projeId: string, dal: string): boolean {
    return this.isler(projeId).some((is) => birlestirmeVerisi(this.b.depo.onay(is.onayId)?.veri)?.dal === dal);
  }

  /** İşi kuyrukta ya da kapıda olan dalların sahipleri (tıkanma koruması dürtmesin) */
  surenSahipler(projeId: string): string[] {
    return this.isler(projeId)
      .map((is) => birlestirmeVerisi(this.b.depo.onay(is.onayId)?.veri)?.ajanId)
      .filter((x): x is string => !!x);
  }

  /** Proje ArnOrg'dan çıkarıldı: bekleyen işleri düşer, süren komut durur, kalite alanı silinir */
  projeKaldir(proje: Proje): void {
    this.bekleyenler.delete(proje.id);
    const c = this.calisanlar.get(proje.id);
    c?.iptal.abort();
    const sil = () => void kaliteAlaniniSil(proje.yol, kaliteYolu(this.b.kaliteKoku, proje));
    // Süren iş önce bıraksın (komutu öldürülür); alan sonra silinir
    if (c) setTimeout(sil, 3000).unref();
    else sil();
  }

  kapat(): void {
    this.kapali = true;
    for (const c of this.calisanlar.values()) c.iptal.abort();
    this.bekleyenler.clear();
  }

  // -------------------------------------------------------------------------
  // Sıra
  // -------------------------------------------------------------------------

  private isler(projeId: string): Is[] {
    const calisan = this.calisanlar.get(projeId)?.is;
    return [...(calisan ? [calisan] : []), ...(this.bekleyenler.get(projeId) ?? [])];
  }

  /** Onay kuyrukta ya da kapıda mı; sonucu yazılmış ama henüz kapanmamış iş (mesajları gidiyor) sayılmaz */
  private isVar(onayId: string): boolean {
    for (const c of this.calisanlar.values()) {
      const durum = this.kalite(onayId)?.durum;
      if (c.is.onayId === onayId && (!durum || !BIRLESTIRME_SON_DURUMLARI.includes(durum))) return true;
    }
    for (const l of this.bekleyenler.values()) if (l.some((is) => is.onayId === onayId)) return true;
    return false;
  }

  private kuyrugaKoy(is: Is): void {
    const l = this.bekleyenler.get(is.projeId) ?? [];
    l.push(is);
    this.bekleyenler.set(is.projeId, l);
  }

  /** Bekleyenlerin sırası: işlenen iş 1. sıradadır */
  private siralariYaz(projeId: string): void {
    const onde = this.calisanlar.has(projeId) ? 1 : 0;
    (this.bekleyenler.get(projeId) ?? []).forEach((is, i) => {
      const sira = i + 1 + onde;
      if (this.kalite(is.onayId)?.sira !== sira) this.kaydet(is.onayId, { sira });
    });
  }

  /** Projenin sıradaki işini başlatır; aynı anda tek iş */
  private isle(projeId: string): void {
    if (this.kapali || this.calisanlar.has(projeId)) return;
    const is = this.bekleyenler.get(projeId)?.shift();
    if (!is) {
      this.bekleyenler.delete(projeId);
      return;
    }
    const iptal = new AbortController();
    this.calisanlar.set(projeId, { is, iptal });
    this.siralariYaz(projeId);
    void this.calistir(is, iptal.signal)
      .catch(() => undefined)
      .finally(() => {
        this.calisanlar.delete(projeId);
        this.isle(projeId);
      });
  }

  // -------------------------------------------------------------------------
  // İş
  // -------------------------------------------------------------------------

  private dur(): void {
    if (this.kapali) throw new Kapandi();
  }

  private async calistir(is: Is, iptal: AbortSignal): Promise<void> {
    const proje = this.b.depo.proje(is.projeId);
    const veri = birlestirmeVerisi(this.b.depo.onay(is.onayId)?.veri);
    if (!proje || !veri) return;
    const yol = kaliteYolu(this.b.kaliteKoku, proje);
    this.kaydet(is.onayId, { durum: is.testsiz ? "kuyrukta" : "hazirlik", sira: null, baslangic: simdi(), adimBaslangic: simdi(), bitis: null, sureMs: null, mesaj: null });
    const cikti = new CiktiKuyrugu();
    try {
      const dalCommit = (await is.dalCommit) ?? (await commitBul(proje.yol, `refs/heads/${veri.dal}`));
      this.dur();
      if (!dalCommit) {
        this.bitir(is, { durum: "hata", mesaj: iki(`${veri.dal} dalı bulunamadı; birleştirme yapılmadı.`, `Branch ${veri.dal} was not found; nothing was merged.`) });
        return;
      }
      if (dalCommit !== this.kalite(is.onayId)?.dalCommit) this.kaydet(is.onayId, { dalCommit });
      if (is.testsiz) {
        await this.anaRepoyaBirlestir(is, veri, dalCommit);
        return;
      }
      for (let deneme = 1; ; deneme++) {
        const p = this.b.depo.proje(is.projeId);
        if (!p) return;
        // ArnOrg'un kayıtları önce commit'lenir: test edilen hedef, birleştirilecek hedefle aynı olsun
        await this.b.arnorgCommitle(p.id).catch(() => false);
        this.dur();
        const hedefCommit = await commitBul(p.yol, `refs/heads/${p.varsayilanDal}`);
        this.dur();
        if (!hedefCommit) {
          this.bitir(is, { durum: "hata", mesaj: iki(`${p.varsayilanDal} dalı bulunamadı; birleştirme yapılmadı.`, `Branch ${p.varsayilanDal} was not found; nothing was merged.`) });
          return;
        }
        if (!(await this.kapidanGecir(is, p, veri, dalCommit, hedefCommit, yol, cikti, iptal))) return;
        // Test ile birleştirme arasında hedef dal (ArnOrg kayıtları dışında) ilerlediyse iş yeniden test edilir
        await this.b.arnorgCommitle(p.id).catch(() => false);
        this.dur();
        const simdiki = await commitBul(p.yol, `refs/heads/${p.varsayilanDal}`);
        if (p.testKomutu && simdiki && simdiki !== hedefCommit) {
          const yollar = await degisenYollar(p.yol, hedefCommit, simdiki).catch(() => ["?"]);
          this.dur();
          if (yollar.some((y) => !y.startsWith(".arnorg/"))) {
            if (deneme >= EN_COK_DENEME) {
              this.bitir(is, {
                durum: "hata",
                mesaj: iki(
                  `${p.varsayilanDal} dalı testler sürerken ${deneme} kez ilerledi; birleştirme yapılmadı. Yeniden deneyin.`,
                  `${p.varsayilanDal} moved ${deneme} times while the tests ran; nothing was merged. Try again.`,
                ),
                cikti: cikti.metin(),
              });
              return;
            }
            cikti.ekle(iki(`\n— ${p.varsayilanDal} dalı ilerledi; iş yeniden test ediliyor —\n`, `\n— ${p.varsayilanDal} moved; testing again —\n`));
            continue;
          }
        }
        await this.anaRepoyaBirlestir(is, veri, dalCommit, cikti);
        return;
      }
    } catch (h) {
      if (h instanceof Kapandi) return;
      this.bitir(is, { durum: "hata", mesaj: kisalt((h as Error).message, 600), cikti: cikti.degisim ? cikti.metin() : undefined });
    } finally {
      if (!this.kapali && !is.testsiz) await kaliteAlaniniBirak(yol);
    }
  }

  /**
   * Bir deneme: kalite alanı hedefe getirilir, dal commit'lenmeden birleştirilir, hazırlık ve test koşar.
   * Geçerse true; geçmezse iş sonuçlanır (çakışma, test başarısız, zaman aşımı) ve false döner.
   */
  private async kapidanGecir(
    is: Is,
    proje: Proje,
    veri: BirlestirmeVerisi,
    dalCommit: string,
    hedefCommit: string,
    yol: string,
    cikti: CiktiKuyrugu,
    iptal: AbortSignal,
  ): Promise<boolean> {
    const testKomutu = proje.testKomutu;
    const hazirlikKomutu = testKomutu ? proje.hazirlikKomutu : null;
    this.kaydet(is.onayId, {
      durum: "hazirlik",
      hedefCommit,
      testYok: !testKomutu,
      komut: hazirlikKomutu,
      deneme: (this.kalite(is.onayId)?.deneme ?? 0) + 1,
      adimBaslangic: simdi(),
      cikti: cikti.metin(),
    });
    await kaliteAlaniHazirla(proje.yol, yol, hedefCommit);
    this.dur();
    const deneme = await denemeBirlestir(yol, dalCommit);
    this.dur();
    if (deneme.tur === "cakisma") {
      await this.cakisti(is, veri, proje, deneme.dosyalar);
      return false;
    }
    if (deneme.tur === "hata") {
      this.bitir(is, { durum: "hata", mesaj: kisalt(deneme.mesaj, 600) });
      return false;
    }
    // Test komutu yoksa yalnız birleşebilirlik denetlenir
    if (!testKomutu) return true;
    const bitisMs = Date.now() + proje.testZamanAsimiDk * 60_000;
    if (hazirlikKomutu) {
      const r = await this.komut(is, hazirlikKomutu, yol, bitisMs, cikti, iptal);
      if (r.durum !== "gecti") {
        await this.gecmedi(is, veri, proje, hazirlikKomutu, r, cikti, true);
        return false;
      }
    }
    this.kaydet(is.onayId, { durum: "test", komut: testKomutu, adimBaslangic: simdi(), cikti: cikti.metin() });
    const r = await this.komut(is, testKomutu, yol, bitisMs, cikti, iptal);
    if (r.durum !== "gecti") {
      await this.gecmedi(is, veri, proje, testKomutu, r, cikti, false);
      return false;
    }
    return true;
  }

  /** Komutu kalite alanında koşar; çıktı aralıklarla canlı yayınlanır */
  private async komut(is: Is, komut: string, cwd: string, bitisMs: number, cikti: CiktiKuyrugu, iptal: AbortSignal): Promise<KomutSonucu> {
    cikti.ekle(`${cikti.degisim ? "\n" : ""}$ ${komut}\n`);
    let yayinlanan = cikti.degisim;
    const canli = setInterval(() => {
      if (cikti.degisim === yayinlanan) return;
      yayinlanan = cikti.degisim;
      this.kaydet(is.onayId, { cikti: cikti.metin() });
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

  /** Test (ya da hazırlık) geçmedi: birleştirilmez; dal sahibine (yoksa isteyene) çıktının sonuyla düzelt mesajı gider */
  private async gecmedi(is: Is, veri: BirlestirmeVerisi, proje: Proje, komut: string, r: KomutSonucu, cikti: CiktiKuyrugu, hazirlik: boolean): Promise<void> {
    const zamanAsimi = r.durum === "zaman_asimi";
    const sinir = sureMetni(proje.testZamanAsimiDk * 60_000);
    const kod = r.kod ?? "?";
    const mesaj = zamanAsimi
      ? iki(`${komut} ${sinir} içinde bitmedi; süreç durduruldu.`, `${komut} did not finish within ${sinir}; the process was stopped.`)
      : hazirlik
        ? iki(`Hazırlık komutu başarısız: ${komut} (çıkış kodu ${kod}).`, `The preparation command failed: ${komut} (exit code ${kod}).`)
        : iki(`${komut} başarısız (çıkış kodu ${kod}).`, `${komut} failed (exit code ${kod}).`);
    const metin = cikti.metin();
    this.bitir(is, { durum: zamanAsimi ? "zaman_asimi" : "test_basarisiz", mesaj, cikti: metin });
    this.dur();
    const sahip = this.b.depo.ajan(veri.ajanId);
    const isteyen = veri.isteyenId ? this.b.depo.ajan(veri.isteyenId) : null;
    const son = sonKisim(metin, MESAJ_SATIRI, MESAJ_BAYTI);
    const neden = zamanAsimi ? iki("testler zaman aşımına uğradı", "the tests timed out") : iki("testler geçmedi", "the tests failed");
    this.b.duyur(proje.id, iki(`${veri.dal} kalite kapısında kaldı: ${neden}; ${proje.varsayilanDal} dalına birleştirilmedi.`, `${veri.dal} was stopped at the quality gate: ${neden}; it was not merged into ${proje.varsayilanDal}.`));
    this.b.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin: iki(`${veri.dal}: ${neden}, birleştirilmedi. ${mesaj}`, `${veri.dal}: ${neden}, not merged. ${mesaj}`), projeId: proje.id });
    const alici = sahip ?? isteyen;
    if (!alici) return;
    await this.mesajla(
      alici.id,
      iki(
        `${veri.dal} dalı kalite kapısından geçmedi, ${proje.varsayilanDal} dalına birleştirilmedi: ${mesaj}${zamanAsimi ? " Testin neden uzadığını bul (bekleyen süreç, izleme kipi, ağ)." : ""}\n\nÇıktının sonu:\n\`\`\`\n${son}\n\`\`\`\n\nKendi çalışma alanında aynı komutu koş, testleri düzelt, commit'le ve yeniden birlestirme_iste.`,
        `Branch ${veri.dal} did not pass the quality gate and was not merged into ${proje.varsayilanDal}: ${mesaj}${zamanAsimi ? " Find out why the test ran long (a waiting process, watch mode, the network)." : ""}\n\nEnd of the output:\n\`\`\`\n${son}\n\`\`\`\n\nRun the same command in your working directory, fix the tests, commit and call birlestirme_iste again.`,
      ),
    );
    // Başkasının dalını önerdiyse (inceleyici) isteyen de haberdar olur
    if (isteyen && sahip && isteyen.id !== sahip.id) {
      await this.mesajla(isteyen.id, iki(`${veri.dal} kalite kapısında kaldı (${neden}); ${sahip.ad} düzeltmesi için uyarıldı.`, `${veri.dal} was stopped at the quality gate (${neden}); ${sahip.ad} was told to fix it.`));
    }
  }

  /** Ajana sistem mesajı; gönderilemezse (oturum açılamadı) iş sonucu değişmez */
  private async mesajla(ajanId: string, metin: string): Promise<void> {
    await this.b.sistemMesaji(ajanId, metin).catch(() => undefined);
  }

  /** Çakışma: birleştirilmez, bugünkü çakışma mesajı dal sahibine gider */
  private async cakisti(is: Is, veri: BirlestirmeVerisi, proje: Proje, dosyalar: string[]): Promise<void> {
    const liste = dosyalar.slice(0, 12).join(", ") + (dosyalar.length > 12 ? " …" : "");
    this.bitir(is, { durum: "cakisma", mesaj: dosyalar.length ? iki(`Çakışan dosyalar: ${liste}`, `Conflicting files: ${liste}`) : null });
    this.dur();
    this.b.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin: iki(`${veri.dal} ${proje.varsayilanDal} ile çakıştı; birleştirilmedi.`, `${veri.dal} conflicts with ${proje.varsayilanDal}; it was not merged.`), projeId: proje.id });
    const sahip = this.b.depo.ajan(veri.ajanId);
    if (!sahip) return;
    await this.mesajla(
      sahip.id,
      iki(
        `${veri.dal} dalı ${proje.varsayilanDal} ile çakıştı ve birleştirilemedi. Dalına ${belirtme(proje.varsayilanDal)} al (git merge ${proje.varsayilanDal}), çakışmaları çöz, testleri çalıştır, commit'le ve yeniden birlestirme_iste.`,
        `Branch ${veri.dal} conflicts with ${proje.varsayilanDal} and could not be merged. Bring ${proje.varsayilanDal} into your branch (git merge ${proje.varsayilanDal}), resolve the conflicts, run the tests, commit and call birlestirme_iste again.`,
      ),
    );
  }

  /** Gerçek birleştirme ana repoda, bugünkü denetimlerle: ana repo hedef dalda ve temiz olmalı */
  private async anaRepoyaBirlestir(is: Is, veri: BirlestirmeVerisi, dalCommit: string, cikti?: CiktiKuyrugu): Promise<void> {
    const proje = this.b.depo.proje(is.projeId);
    if (!proje) return;
    const mevcut = await gitIslemleri.mevcutDal(proje.yol);
    this.dur();
    if (mevcut !== proje.varsayilanDal) {
      this.bitir(is, { durum: "hata", mesaj: iki(`Ana repo ${proje.varsayilanDal} dalında değil (${mevcut}). Birleştirme yapılmadı.`, `The main repo is not on ${proje.varsayilanDal} (${mevcut}). Nothing was merged.`) });
      return;
    }
    // ArnOrg'un kendi kayıtları (.arnorg) birleştirmeyi engellemesin
    await this.b.arnorgCommitle(proje.id).catch(() => false);
    this.dur();
    const kirli = (await gitIslemleri.git(proje.yol, ["status", "--porcelain", "--untracked-files=no"])).trim();
    this.dur();
    if (kirli) {
      this.bitir(is, { durum: "hata", mesaj: iki("Ana repoda commit'lenmemiş değişiklik var; birleştirme yapılmadı.", "The main repo has uncommitted changes; nothing was merged.") });
      return;
    }
    const hedefCommit = await commitBul(proje.yol, "HEAD");
    const sonuc = await gitIslemleri.birlestir(proje.yol, dalCommit, iki(`ArnOrg: ${veri.dal} birleştirildi\n\n${veri.ozet}`, `ArnOrg: merged ${veri.dal}\n\n${veri.ozet}`));
    this.dur();
    if (!sonuc.basarili) {
      await this.cakisti(is, veri, proje, []);
      return;
    }
    const kalite = this.bitir(is, { durum: "birlesti", hedefCommit, ...(cikti?.degisim ? { cikti: cikti.metin() } : {}) });
    const onay = this.b.depo.onay(is.onayId);
    // Birleştirme yapıldı; sonrasındaki bir hata (görev, duyuru) sonucu değiştirmez, kurula bildirilir
    if (onay && kalite) await this.b.birlesti(onay, kalite).catch((h) => this.b.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: is.projeId }));
  }

  // -------------------------------------------------------------------------
  // Kayıt
  // -------------------------------------------------------------------------

  private kalite(onayId: string): BirlestirmeKalitesi | null {
    if (this.kapali) return null;
    const onay = this.b.depo.onay(onayId);
    return onay ? kaliteOku(onay) : null;
  }

  /** Kalite kaydını günceller ve onayı onay.sonuc ile yeniden yayınlar */
  private kaydet(onayId: string, d: Partial<BirlestirmeKalitesi>): BirlestirmeKalitesi | null {
    if (this.kapali) return null;
    const onay = this.b.depo.onay(onayId);
    const onceki = onay ? kaliteOku(onay) : null;
    if (!onay || !onceki) return null;
    const kalite: BirlestirmeKalitesi = { ...onceki, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
    const son = this.b.depo.onayVerisiYaz(onayId, { ...(onay.veri as object), kalite });
    if (son) this.b.olaylar.yayinla({ tur: "onay.sonuc", onay: son });
    return kalite;
  }

  /** İşin son durumu: bitiş, süre; hatada kurula bildirim */
  private bitir(is: Is, d: Partial<BirlestirmeKalitesi> & Pick<BirlestirmeKalitesi, "durum">): BirlestirmeKalitesi | null {
    const onceki = this.kalite(is.onayId);
    const bitis = simdi();
    const baslangic = onceki?.baslangic ? Date.parse(onceki.baslangic) : NaN;
    const kalite = this.kaydet(is.onayId, { sira: null, adimBaslangic: null, bitis, sureMs: Number.isNaN(baslangic) ? null : Date.parse(bitis) - baslangic, ...d });
    if (d.durum === "hata" && d.mesaj && !this.kapali) this.b.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: d.mesaj, projeId: is.projeId });
    return kalite;
  }
}
