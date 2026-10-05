// Claude girişi ve abonelik kullanımı: plan (Pro/Max), 5 saatlik ve haftalık pencere yüzdeleri, ayardaki üst sınır.
// Bilgi önce açık bir ajan oturumundan, yoksa mesaj göndermeyen bir Claude Code yoklama oturumundan alınır (token
// harcanmaz). Yoklama oturumu okumalar arasında açık kalır (her okumada yeni süreç açılmaz); iki dakika kullanılmazsa,
// Claude girişi ya da Claude Code'un yolu değişince kapanır.
// Dönemsel okuma yarım dakikada bir ve yalnız gerektiğinde yapılır: Stüdyo bağlıyken, açık ajan oturumu ya da abonelik
// sınırında bekleyen ajan varken; kimse beklemese de aşılan sınırın sıfırlanma anı geçince bir kez (bilinmiyorsa sınır
// sürdükçe). Stüdyo bağlanınca son okuma bayatsa hemen okunur. Okuma üst üste başarısız olursa aralık 1, 2 ve 5 dakikaya
// açılır; ilk başarılı okumada yeniden yarım dakikadır.
import { query, type AccountInfo, type Query, type SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import type { HesapDurumu, KullanimPenceresi, KullanimPenceresiTuru } from "@arnorg/ortak";
import { iki } from "./dil.js";
import type { OlayYolu } from "./olaylar.js";
import { ajanOrtami, rootMu } from "./ortam.js";
import type { Yapilandirma } from "./yapilandirma.js";
import { simdi } from "./yardimci.js";

const PLAN_ADLARI: Record<string, string> = { pro: "Pro", max: "Max", team: "Team", enterprise: "Enterprise" };
const PENCERE_ADLARI: Record<Exclude<KullanimPenceresiTuru, "model">, [string, string]> = {
  bes_saat: ["5 saatlik pencere", "5-hour window"],
  haftalik: ["Haftalık", "Weekly"],
  haftalik_opus: ["Haftalık · Opus", "Weekly · Opus"],
  haftalik_sonnet: ["Haftalık · Sonnet", "Weekly · Sonnet"],
};
/** Pencerenin geçerli dildeki adı. Model pencereleri "Haftalık · <model>" biçimindedir; Stüdyo model adını " · " sonrasından alır */
function pencereAdi(tur: Exclude<KullanimPenceresiTuru, "model">): string {
  return iki(PENCERE_ADLARI[tur][0], PENCERE_ADLARI[tur][1]);
}
function modelPenceresiAdi(model: string): string {
  return iki(`Haftalık · ${model}`, `Weekly · ${model}`);
}
/** Kayıtlı pencerenin adını geçerli dile çevirir (dil değişince) */
function adiYenile(p: KullanimPenceresi): KullanimPenceresi {
  if (p.tur !== "model") return { ...p, ad: pencereAdi(p.tur) };
  const model = p.ad.split(" · ").slice(1).join(" · ");
  return model ? { ...p, ad: modelPenceresiAdi(model) } : p;
}
/** rate_limit_event türü → pencere türü */
const OLAY_TURLERI: Record<string, Exclude<KullanimPenceresiTuru, "model">> = {
  five_hour: "bes_saat",
  seven_day: "haftalik",
  seven_day_opus: "haftalik_opus",
  seven_day_sonnet: "haftalik_sonnet",
};
const API_KAYNAKLARI = new Set(["ANTHROPIC_API_KEY", "apiKeyHelper", "ANTHROPIC_AUTH_TOKEN"]);

/** Gerektiğinde kullanım bu aralıkla okunur: üst çubuktaki yüzdeler yarım dakikada bir tazelenir */
export const KULLANIM_ARALIGI_MS = 30_000;
/** Döngü kayması: okuma birkaç saniye sürdüğünden son okuma aralıktan bu kadar genç olsa da bayat sayılır */
const KAYMA_PAYI_MS = 5_000;
/** Okuma üst üste başarısız olunca sonraki denemeye kadar beklenen süreler */
export const HATA_BEKLEMELERI_MS = [60_000, 2 * 60_000, 5 * 60_000];
/** Mesaj göndermeyen yoklama oturumu bu kadar kullanılmazsa kapanır */
export const YOKLAMA_OTURUMU_BOSTA_MS = 2 * 60_000;

export type KullanimKaynagi = () => Promise<{ hesap: AccountInfo; kullanim: SDKControlGetUsageResponse } | null>;

function planAdi(ham: string | null | undefined): string | null {
  if (!ham) return null;
  const k = ham.toLowerCase();
  for (const [anahtar, ad] of Object.entries(PLAN_ADLARI)) if (k.includes(anahtar)) return ad;
  if (k.includes("api")) return "API";
  return ham;
}

/** Usage cevabından pencere listesi */
export function pencereleriCikar(k: SDKControlGetUsageResponse["rate_limits"]): KullanimPenceresi[] {
  if (!k) return [];
  const liste: KullanimPenceresi[] = [];
  const ekle = (tur: Exclude<KullanimPenceresiTuru, "model">, p: { utilization: number | null; resets_at: string | null } | null | undefined) => {
    if (p) liste.push({ tur, ad: pencereAdi(tur), yuzde: p.utilization, sifirlanma: p.resets_at });
  };
  ekle("bes_saat", k.five_hour);
  ekle("haftalik", k.seven_day);
  ekle("haftalik_opus", k.seven_day_opus);
  ekle("haftalik_sonnet", k.seven_day_sonnet);
  for (const m of k.model_scoped ?? []) liste.push({ tur: "model", ad: modelPenceresiAdi(m.display_name), yuzde: m.utilization, sifirlanma: m.resets_at });
  return liste;
}

/** Ayardaki üst sınırı aşan ilk pencere; sıfırlanma anı geçmiş pencere sayılmaz */
export function sinirAsimi(
  pencereler: KullanimPenceresi[],
  besSaatlik: number,
  haftalik: number,
  simdiMs = Date.now(),
): HesapDurumu["sinir"] {
  for (const p of pencereler) {
    if (p.yuzde === null) continue;
    if (p.sifirlanma && Date.parse(p.sifirlanma) <= simdiMs) continue;
    const sinirYuzde = p.tur === "bes_saat" ? besSaatlik : haftalik;
    if (sinirYuzde > 0 && p.yuzde >= sinirYuzde) return { pencere: p.ad, yuzde: Math.round(p.yuzde), sinirYuzde, sifirlanma: p.sifirlanma };
  }
  return null;
}

export class HesapIzleyici {
  private durum: HesapDurumu;
  private zamanlayici: NodeJS.Timeout | null = null;
  private suren: Promise<HesapDurumu> | null = null;
  private sonGirisKaynagi: string | null = null;
  /** Üst üste başarısız okuma sayısı; başarılı okumada sıfırlanır */
  private ardisikHata = 0;
  /** Giriş ya da ayar değişince artar: o andan önce başlamış okumanın sonucu (ve hatası) yayınlanmaz */
  private nesil = 0;
  /** Okumalar arasında açık kalan, mesaj göndermeyen Claude Code oturumu */
  private yoklamaOturumu: { q: Query; birak: () => void; sonKullanim: number; yol: string | null } | null = null;
  /** Sınır durumu değişince (aşıldı ↔ açıldı) çağrılır */
  sinirDegisti: ((sinir: HesapDurumu["sinir"]) => void) | null = null;

  constructor(
    private readonly yapilandirma: Yapilandirma,
    private readonly olaylar: OlayYolu,
    private readonly claudeYolu: () => string | null,
    /** Açık bir ajan oturumu varsa onun üzerinden sorar */
    private readonly oturumdanSor: KullanimKaynagi,
    /** Testlerde gerçek Claude Code süreci açılmaz */
    private readonly yoklamaKapali = false,
    /** Ajan tarafındaki gerekçe: açık ajan oturumu ya da abonelik sınırında bekleyen ajan var mı */
    private readonly ajanlarBekliyor: () => boolean = () => false,
  ) {
    this.durum = this.bos();
  }

  /** Stüdyo'ya bağlı WebSocket istemcisi var mı; sunucu verir (sunucusuz kullanımda hep yok) */
  istemciVar: () => boolean = () => false;

  private bos(): HesapDurumu {
    return {
      durum: "bilinmiyor",
      plan: null,
      eposta: null,
      kaynak: null,
      saglayici: null,
      pencereVar: false,
      pencereler: [],
      sinirYuzdeleri: { besSaatlik: 0, haftalik: 0 },
      sinir: null,
      uyari: null,
      guncelleme: null,
      hata: null,
    };
  }

  get mevcut(): HesapDurumu {
    const a = this.yapilandirma.ayarlar;
    return { ...this.durum, sinirYuzdeleri: { besSaatlik: a.besSaatlikSinirYuzde, haftalik: a.haftalikSinirYuzde } };
  }

  /** Ajanlar abonelik sınırı yüzünden durmalı mı */
  get sinir(): HesapDurumu["sinir"] {
    return this.durum.sinir;
  }

  /**
   * Dönemsel okuma gerekli mi: Stüdyo bağlı, açık ajan oturumu var ya da abonelik sınırında bekleyen ajan var. Kimse
   * beklemiyorsa aşılan sınır, sıfırlanma anı geçince (bilinmiyorsa hemen) yine okunur: eski sınır kalıp gözetmeni
   * ve sonraki işleri boşuna durdurmasın.
   */
  yoklamaGerekli(): boolean {
    if (this.istemciVar() || this.ajanlarBekliyor()) return true;
    const s = this.durum.sinir;
    return !!s && (!s.sifirlanma || Date.parse(s.sifirlanma) <= Date.now());
  }

  /**
   * Son okuma bayat mı (hiç okunmadıysa bayat): yarım dakikadan eski; okuma üst üste başarısız olduysa sırasıyla 1, 2
   * ve 5 dakikadan eski
   */
  private bayat(): boolean {
    const son = this.durum.guncelleme ? Date.parse(this.durum.guncelleme) : 0;
    const bekleme = this.ardisikHata > 0 ? HATA_BEKLEMELERI_MS[Math.min(this.ardisikHata, HATA_BEKLEMELERI_MS.length) - 1]! : KULLANIM_ARALIGI_MS - KAYMA_PAYI_MS;
    return Date.now() - son >= bekleme;
  }

  baslat(): void {
    if (this.zamanlayici) return;
    const dongu = () => {
      this.bostaYoklamayiKapat();
      if (this.yoklamaGerekli() && this.bayat()) void this.tazele().catch(() => undefined);
    };
    // İlk okuma da yalnız gerekiyorsa; Stüdyo sonradan bağlanırsa istemciBaglandi okur
    setTimeout(dongu, 1500).unref();
    this.zamanlayici = setInterval(dongu, KULLANIM_ARALIGI_MS);
    this.zamanlayici.unref();
  }

  /** Stüdyo bağlandı: dönemsel okuma açıksa ve son okuma bayatsa hemen bir kez okunur */
  istemciBaglandi(): void {
    if (this.zamanlayici && this.bayat()) void this.tazele().catch(() => undefined);
  }

  durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
    this.yoklamaOturumunuKapat();
  }

  /** Ayar değişince (giriş yöntemi, sınırlar, dil) durum yeniden hesaplanır; pencere adları ve uyarı geçerli dilde yazılır */
  ayarlarDegisti(): void {
    const pencereler = this.durum.pencereler.map(adiYenile);
    this.yayinla({ ...this.durum, pencereler, sinir: this.sinirHesapla(pencereler), uyari: this.uyariHesapla(this.durum) });
    void this.tazele().catch(() => undefined);
  }

  /**
   * Claude girişi değişti (giriş, çıkış, başka hesap): eski girişle açılmış yoklama oturumu kapanır, hata beklemesi
   * sıfırlanır; süren okuma bitince (sonucu yayınlanmadan) yeni oturumla yeniden okunur
   */
  girisDegisti(): void {
    this.nesil++;
    this.yoklamaOturumunuKapat();
    this.ardisikHata = 0;
    const suren = this.suren;
    if (suren) void suren.catch(() => undefined).then(() => this.tazele().catch(() => undefined));
    else void this.tazele().catch(() => undefined);
  }

  /** Ajan oturumunun init mesajındaki apiKeySource */
  girisKaynagi(kaynak: string): void {
    if (this.sonGirisKaynagi === kaynak) return;
    this.sonGirisKaynagi = kaynak;
    const yeni = { ...this.durum, kaynak: kaynak === "none" ? this.durum.kaynak : kaynak };
    this.yayinla({ ...yeni, uyari: this.uyariHesapla(yeni) });
  }

  /** Ajan oturumlarından gelen rate_limit_event */
  pencereOlayi(olay: { tur: string; durum: string; sifirlanma: string | null; yuzde: number | null }): void {
    const tur = OLAY_TURLERI[olay.tur];
    if (!tur) return;
    const pencereler = [...this.durum.pencereler];
    const i = pencereler.findIndex((p) => p.tur === tur);
    const eski = i >= 0 ? pencereler[i]! : { tur, ad: pencereAdi(tur), yuzde: null, sifirlanma: null };
    // Claude Code "rejected" dediyse pencere fiilen dolmuştur
    const yuzde = olay.durum === "rejected" ? 100 : (olay.yuzde ?? eski.yuzde);
    const yeni: KullanimPenceresi = { ...eski, yuzde, sifirlanma: olay.sifirlanma ?? eski.sifirlanma };
    if (i >= 0) pencereler[i] = yeni;
    else pencereler.push(yeni);
    this.yayinla({ ...this.durum, pencereVar: true, pencereler, sinir: this.sinirHesapla(pencereler), guncelleme: simdi() });
  }

  /** Hesap ve kullanımı yeniden okur; aynı anda tek yoklama çalışır */
  tazele(): Promise<HesapDurumu> {
    if (this.suren) return this.suren;
    this.suren = this.oku().finally(() => {
      this.suren = null;
    });
    return this.suren;
  }

  private async oku(): Promise<HesapDurumu> {
    const nesil = this.nesil;
    let sonuc = await this.oturumdanSor().catch(() => null);
    if (!sonuc && !this.yoklamaKapali) {
      try {
        sonuc = await this.yokla();
      } catch (h) {
        // Oturum bilerek kapatıldıysa (giriş ya da ayar değişti) hata sayılmaz; ardından yeniden okunur
        if (nesil !== this.nesil) return this.mevcut;
        this.ardisikHata++;
        this.yayinla({ ...this.durum, durum: "hata", hata: (h as Error).message, guncelleme: simdi() });
        return this.mevcut;
      }
    }
    // Eski girişle başlamış okumanın sonucu yayınlanmaz
    if (!sonuc || nesil !== this.nesil) return this.mevcut;
    this.ardisikHata = 0;
    const { hesap, kullanim } = sonuc;
    const pencereler = kullanim.rate_limits_available ? pencereleriCikar(kullanim.rate_limits) : [];
    const yeni: HesapDurumu = {
      durum: "hazir",
      plan: planAdi(kullanim.subscription_type ?? hesap.subscriptionType),
      eposta: hesap.email ?? null,
      kaynak: hesap.apiKeySource ?? hesap.tokenSource ?? this.sonGirisKaynagi,
      saglayici: hesap.apiProvider ?? null,
      pencereVar: kullanim.rate_limits_available,
      pencereler,
      sinirYuzdeleri: this.mevcut.sinirYuzdeleri,
      sinir: this.sinirHesapla(pencereler),
      uyari: null,
      guncelleme: simdi(),
      hata: null,
    };
    yeni.uyari = this.uyariHesapla(yeni);
    this.yayinla(yeni);
    return this.mevcut;
  }

  /**
   * Mesaj göndermeyen yoklama oturumundan hesap ve kullanımı sorar; oturum yoksa açar, okumadan sonra açık bırakır.
   * Okuma başarısız olursa (süreç kapandı, yanıt gelmedi) oturum kapanır, sonraki okuma yenisini açar.
   */
  protected async yokla(): Promise<{ hesap: AccountInfo; kullanim: SDKControlGetUsageResponse }> {
    const q = this.yoklamaOturumunuAl();
    let zamanlayici: NodeJS.Timeout | undefined;
    const zaman = new Promise<never>((_, red) => {
      zamanlayici = setTimeout(() => red(new Error(iki("Claude Code yanıt vermedi (60 sn).", "Claude Code did not respond (60 s)."))), 60_000);
      zamanlayici.unref();
    });
    try {
      const [hesap, kullanim] = await Promise.race([
        Promise.all([q.accountInfo(), q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })]),
        zaman,
      ]);
      return { hesap, kullanim };
    } catch (h) {
      if (this.yoklamaOturumu?.q === q) this.yoklamaOturumunuKapat();
      throw h;
    } finally {
      clearTimeout(zamanlayici);
    }
  }

  /** Açık yoklama oturumu; yoksa (ya da Claude Code'un yolu değiştiyse) Claude Code mesaj beklemeden başlatılır */
  private yoklamaOturumunuAl(): Query {
    const yol = this.claudeYolu();
    if (this.yoklamaOturumu?.yol === yol) {
      this.yoklamaOturumu.sonKullanim = Date.now();
      return this.yoklamaOturumu.q;
    }
    this.yoklamaOturumunuKapat();
    let birak: () => void = () => undefined;
    const bekle = new Promise<void>((coz) => {
      birak = coz;
    });
    async function* hicMesajYok() {
      await bekle;
    }
    const q = query({
      prompt: hicMesajYok(),
      options: {
        cwd: this.yapilandirma.veriDizini,
        settingSources: [],
        ...(yol ? { pathToClaudeCodeExecutable: yol } : {}),
        env: ajanOrtami({ IS_SANDBOX: rootMu() ? "1" : undefined }),
      },
    });
    this.yoklamaOturumu = { q, birak, sonKullanim: Date.now(), yol };
    return q;
  }

  private yoklamaOturumunuKapat(): void {
    const o = this.yoklamaOturumu;
    if (!o) return;
    this.yoklamaOturumu = null;
    o.birak();
    try {
      o.q.close();
    } catch {
      // zaten kapandı
    }
  }

  /** İki dakikadır kullanılmayan yoklama oturumu kapanır (Stüdyo ayrıldı ya da okumalar ajan oturumundan geliyor) */
  private bostaYoklamayiKapat(): void {
    if (this.yoklamaOturumu && Date.now() - this.yoklamaOturumu.sonKullanim >= YOKLAMA_OTURUMU_BOSTA_MS) this.yoklamaOturumunuKapat();
  }

  private sinirHesapla(pencereler: KullanimPenceresi[]): HesapDurumu["sinir"] {
    const a = this.yapilandirma.ayarlar;
    return sinirAsimi(pencereler, a.besSaatlikSinirYuzde, a.haftalikSinirYuzde);
  }

  private uyariHesapla(d: HesapDurumu): string | null {
    const apiAnahtari = (d.kaynak && API_KAYNAKLARI.has(d.kaynak)) || d.plan === "API";
    if (d.durum === "hazir" && apiAnahtari) {
      return iki(
        "ArnOrg yalnız Claude aboneliğiyle çalışır ama Claude Code bu makinede bir API anahtarıyla giriş yapmış. Terminalde `claude` açıp /login ile claude.ai hesabınızla (Pro, Max ya da Team) giriş yapın.",
        "ArnOrg only works with a Claude subscription, but Claude Code on this machine is signed in with an API key. Open `claude` in a terminal and sign in with /login using your claude.ai account (Pro, Max or Team).",
      );
    }
    if (d.durum === "hazir" && d.saglayici && d.saglayici !== "firstParty") {
      return iki(
        `Claude Code ${d.saglayici} sağlayıcısı üzerinden çalışıyor; ArnOrg yalnız Claude aboneliğiyle çalışır. /login ile claude.ai hesabınızla giriş yapın.`,
        `Claude Code is running through the ${d.saglayici} provider; ArnOrg only works with a Claude subscription. Sign in with /login using your claude.ai account.`,
      );
    }
    return null;
  }

  private yayinla(yeni: HesapDurumu): void {
    const oncekiSinir = this.durum.sinir;
    this.durum = yeni;
    this.olaylar.yayinla({ tur: "hesap.guncellendi", hesap: this.mevcut });
    const simdikiSinir = this.sinir;
    if (Boolean(oncekiSinir) !== Boolean(simdikiSinir)) this.sinirDegisti?.(simdikiSinir);
  }
}
