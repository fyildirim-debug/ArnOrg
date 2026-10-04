// Claude girişi ve abonelik kullanımı: plan (Pro/Max), 5 saatlik ve haftalık pencere yüzdeleri, ayardaki üst sınır.
// Bilgi önce açık bir ajan oturumundan, yoksa mesaj göndermeyen kısa bir Claude Code yoklamasından alınır (token harcanmaz).
// Dönemsel okuma yalnız gerektiğinde yapılır: Stüdyo bağlıyken, açık ajan oturumu ya da abonelik sınırında bekleyen ajan
// varken; kimse beklemese de aşılan sınırın sıfırlanma anı geçince bir kez (bilinmiyorsa sınır sürdükçe). Stüdyo
// bağlanınca son okuma bayatsa hemen okunur.
import { query, type AccountInfo, type SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
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

  /** Son okuma bayat mı: sınır aşıkken 2, değilken 5 dakikadan eski (hiç okunmadıysa bayat) */
  private bayat(): boolean {
    const son = this.durum.guncelleme ? Date.parse(this.durum.guncelleme) : 0;
    return Date.now() - son >= (this.durum.sinir ? 2 * 60_000 : 5 * 60_000);
  }

  baslat(): void {
    if (this.zamanlayici) return;
    const dongu = () => {
      if (this.yoklamaGerekli() && this.bayat()) void this.tazele().catch(() => undefined);
    };
    // İlk okuma da yalnız gerekiyorsa; Stüdyo sonradan bağlanırsa istemciBaglandi okur
    setTimeout(dongu, 1500).unref();
    // Sınır aşıldıysa sıfırlanmayı yakalamak için daha sık bakılır (bayat sınırı 2 dk)
    this.zamanlayici = setInterval(dongu, 30_000);
    this.zamanlayici.unref();
  }

  /** Stüdyo bağlandı: dönemsel okuma açıksa ve son okuma bayatsa hemen bir kez okunur */
  istemciBaglandi(): void {
    if (this.zamanlayici && this.bayat()) void this.tazele().catch(() => undefined);
  }

  durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
  }

  /** Ayar değişince (giriş yöntemi, sınırlar, dil) durum yeniden hesaplanır; pencere adları ve uyarı geçerli dilde yazılır */
  ayarlarDegisti(): void {
    const pencereler = this.durum.pencereler.map(adiYenile);
    this.yayinla({ ...this.durum, pencereler, sinir: this.sinirHesapla(pencereler), uyari: this.uyariHesapla(this.durum) });
    void this.tazele().catch(() => undefined);
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
    let sonuc = await this.oturumdanSor().catch(() => null);
    if (!sonuc && !this.yoklamaKapali) {
      try {
        sonuc = await this.yokla();
      } catch (h) {
        this.yayinla({ ...this.durum, durum: "hata", hata: (h as Error).message, guncelleme: simdi() });
        return this.mevcut;
      }
    }
    if (!sonuc) return this.mevcut;
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

  /** Mesaj göndermeden Claude Code'u başlatır, hesap ve kullanımı sorar, kapatır */
  private async yokla(): Promise<{ hesap: AccountInfo; kullanim: SDKControlGetUsageResponse }> {
    let birak: () => void = () => undefined;
    const bekle = new Promise<void>((coz) => {
      birak = coz;
    });
    async function* hicMesajYok() {
      await bekle;
    }
    const yol = this.claudeYolu();
    const q = query({
      prompt: hicMesajYok(),
      options: {
        cwd: this.yapilandirma.veriDizini,
        settingSources: [],
        ...(yol ? { pathToClaudeCodeExecutable: yol } : {}),
        env: ajanOrtami({ IS_SANDBOX: rootMu() ? "1" : undefined }),
      },
    });
    const zaman = new Promise<never>((_, red) => setTimeout(() => red(new Error(iki("Claude Code yanıt vermedi (60 sn).", "Claude Code did not respond (60 s)."))), 60_000).unref());
    try {
      const [hesap, kullanim] = await Promise.race([
        Promise.all([q.accountInfo(), q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })]),
        zaman,
      ]);
      return { hesap, kullanim };
    } finally {
      birak();
      try {
        q.close();
      } catch {
        // zaten kapandı
      }
    }
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
