// Tek bir ajanın Claude Code oturumu (Claude Agent SDK).
// Oturum kısa uyanış modeliyle çalışır: mesaj gelince açılır, boşta kalınca kapatılır,
// sonraki mesajda aynı oturum kimliğiyle sürdürülür.
import {
  query,
  type CanUseTool,
  type HookCallback,
  type HookJSONOutput,
  type McpSdkServerConfigWithInstance,
  type PermissionMode,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Ajan, AjanDurumu, AkisOgesi, IzinModu, MesajOnceligi } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { ajanOrtami, rootMu } from "./ortam.js";
import { kimlikSorunuHatadan, kimlikSorunuMetinden, type KimlikSorunu } from "./kimlik-hatasi.js";
import { zincirdekiSonraki } from "./model-katalogu.js";
import { AkanKuyruk, kimlik, kisalt, simdi } from "./yardimci.js";

/** Duraklatılmış oturumda kuyruktaki tur beklenirken en çok bu kadar beklenir, sonra oturum kapanır */
const KUYRUK_TURU_BEKLEME_MS = 10 * 60_000;

/** Kimlik sorunuyla duran ajanın durum açıklaması (dil o anki ayardan) */
const KIMLIK_BEKLENIYOR = () => iki("Claude Code girişi bekleniyor", "Waiting for Claude Code sign-in");

/** Oturumun sürekli artan işlenen token toplamı (Claude Code sonuç mesajındaki modelUsage) */
export interface Toplam {
  token: number;
}

/** Asistan mesajındaki API kullanımının sayılan alanları (önbellekten okuma hariç) */
type Kullanim = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null };

/** Sonuç mesajındaki model başına kullanımdan işlenen token: girdi + çıktı + önbellek yazımı (önbellekten okuma hariç) */
export function islenenToken(modelKullanimi: Record<string, { inputTokens?: number; outputTokens?: number; cacheCreationInputTokens?: number }> | undefined): number {
  let t = 0;
  for (const k of Object.values(modelKullanimi ?? {})) t += (k.inputTokens ?? 0) + (k.outputTokens ?? 0) + (k.cacheCreationInputTokens ?? 0);
  return t;
}

/** Sürekli artan toplamdan bu turun payını çıkarır; toplam küçüldüyse (sıfırlanmış) yeni toplamın kendisi sayılır */
export function toplamFarki(onceki: Toplam, yeni: Toplam): Toplam {
  return yeni.token < onceki.token ? { token: yeni.token } : { token: yeni.token - onceki.token };
}

/**
 * Tur tavanı (SDK maxTurns): bir kullanıcı turundaki en çok API gidiş-dönüşü. Claude Code akış (streaming input)
 * kipinde sayaç her kullanıcı turunda yeniden başlar; uzun yaşayan oturumu değil, tek turda dönüp duran ajanı durdurur.
 */
export const AJAN_TUR_TAVANI = 200;

/**
 * Birincil model aşırı yüklü ya da erişilemezse geçilecek yedek model, model zincirinde bir sonraki: fable → opus,
 * opus → sonnet, sonnet → haiku; haiku ve bilinmeyen modeller için yok. SDK yedeğin birincil modelle aynı olmasını
 * kabul etmez (sorgu açılırken hata atar).
 */
export function yedekModel(model: string): string | null {
  const yedek = zincirdekiSonraki(model);
  return yedek && yedek !== model.toLowerCase() ? yedek : null;
}

export type MesajKaynagi = { tur: "kurul" } | { tur: "ajan"; ad: string; id: string } | { tur: "sistem" };

export interface OturumBaglami {
  ajan(): Ajan;
  cwd: string;
  claudeYolu: string | null;
  /** Rol metni + ArnOrg kuralları + proje bağlamı */
  talimat(): string;
  araclar(): McpSdkServerConfigWithInstance;
  /** Yazma araçları kapalı roller (CEO) */
  yasakAraclar(): string[];
  onaySuresiSn(): number;
  /** PreToolUse denetim kapısı */
  kapi(arac: string, girdi: Record<string, unknown>, aracKimligi: string | undefined, altAjan: string | undefined): Promise<HookJSONOutput>;
  /** Claude Code'un izin soracağı çağrı (bypass dışı modlar, plan onayı) */
  izinSor: CanUseTool;
  /** PostToolUse: dosya izi; dönen metin (ilgili hafıza) ajana ek bağlam olarak verilir */
  aracSonrasi(arac: string, girdi: Record<string, unknown>, aracKimligi: string | undefined): string | null;
  /** PostToolUseFailure: hatayla ilgili hafıza ya da kaydetme ipucu */
  aracHatasi(arac: string, girdi: Record<string, unknown>, hata: string): string | null;
  /** UserPromptSubmit: yeni mesajla birlikte verilecek hafıza (ekipten yeni kayıtlar, ilgili kayıtlar) */
  turBasi(metin: string): string | null;
  /** SessionStart (compact): sıkıştırmadan sonra unutulmaması gerekenler */
  sikistirmaSonrasi(): string | null;
  akis(oge: AkisOgesi): void;
  durum(durum: AjanDurumu, aciklama?: string): void;
  oturumKimligi(id: string): void;
  /** Bu turda işlenen token */
  kullanim(delta: Toplam): void;
  /** Tur sürerken bu turun tahmini işlenen tokenı (asistan mesajlarındaki kullanım); tur sonucu kesin sayıyı getirir */
  turKullanimi?(tahmin: number): void;
  /** Tur, tur tavanına (maxTurns) ulaşıp bitti; ajan boşa çıktı */
  turTavaniAsildi?(adim: number): void;
  pencere(bilgi: { tur: string; durum: string; sifirlanma: string | null; yuzde: number | null }): void;
  /** Oturumun Claude Code'a göre son toplamı; sürdürülen oturumda çift sayımı önler */
  oturumToplami: { oku(oturumId: string): Toplam | null; yaz(oturumId: string, t: Toplam): void };
  /** Claude Code'un kullandığı kimlik bilgisinin kaynağı (init mesajı) */
  girisKaynagi(kaynak: string): void;
  /** Claude Code girişi düştü ya da abonelik sorunu: kurula giriş asistanı gösterilir */
  kimlikSorunu(sorun: KimlikSorunu, ayrinti: string): void;
  bitti(hata: string | null): void;
}

// Ajanın o an ne yaptığı (isAciklamasi); metin çağrı anında geçerli dilde üretilir
const ARAC_ACIKLAMA: Record<string, (g: Record<string, unknown>) => string> = {
  Bash: (g) => `${iki("Komut", "Command")}: ${kisalt(String(g.command ?? ""), 60)}`,
  PowerShell: (g) => `${iki("Komut", "Command")}: ${kisalt(String(g.command ?? ""), 60)}`,
  Edit: (g) => `${iki("Düzenliyor", "Editing")}: ${dosyaAdi(g.file_path)}`,
  MultiEdit: (g) => `${iki("Düzenliyor", "Editing")}: ${dosyaAdi(g.file_path)}`,
  Write: (g) => `${iki("Yazıyor", "Writing")}: ${dosyaAdi(g.file_path)}`,
  Read: (g) => `${iki("Okuyor", "Reading")}: ${dosyaAdi(g.file_path)}`,
  Grep: (g) => `${iki("Arıyor", "Searching")}: ${kisalt(String(g.pattern ?? ""), 40)}`,
  Glob: (g) => `${iki("Dosya arıyor", "Finding files")}: ${kisalt(String(g.pattern ?? ""), 40)}`,
  WebFetch: (g) => `Web: ${kisalt(String(g.url ?? ""), 50)}`,
  WebSearch: (g) => `${iki("Web araması", "Web search")}: ${kisalt(String(g.query ?? ""), 40)}`,
  Agent: (g) => `${iki("Alt ajan", "Subagent")}: ${kisalt(String(g.description ?? ""), 40)}`,
  Task: (g) => `${iki("Alt ajan", "Subagent")}: ${kisalt(String(g.description ?? ""), 40)}`,
};

function dosyaAdi(y: unknown): string {
  return String(y ?? "").replace(/\\/g, "/").split("/").slice(-2).join("/");
}

function aracAciklamasi(arac: string, girdi: Record<string, unknown>): string {
  const f = ARAC_ACIKLAMA[arac];
  if (f) return f(girdi);
  if (arac.startsWith("mcp__arnorg__")) return `ArnOrg: ${arac.slice(13)}`;
  return arac;
}

function kaynakEtiketi(k: MesajKaynagi): string {
  if (k.tur === "kurul") return iki("Yönetim kurulu", "Board");
  if (k.tur === "ajan") return k.ad;
  return "ArnOrg";
}

export class AjanOturumu {
  private kuyruk: AkanKuyruk<SDKUserMessage> | null = null;
  private sorgu: Query | null = null;
  private sonToplam: Toplam = { token: 0 };
  private oturumNo: string | null = null;
  private stderrSon: string[] = [];
  private sonDurum: AjanDurumu = "kapali";
  private kapatiliyor = false;
  /** Claude Code girişi düştüğü için kapatıldı: oturum duraklar, giriş yapılınca Şirket sürdürür */
  private kimlikBekliyor = false;
  private devamDenemesi = true;
  private initGoruldu = false;
  /** Duraklatma açıklaması (görev token tavanı): tur kesilir, sonucu gelince oturum kapanır, durum "duraklatildi" kalır */
  private duraklatma: string | null = null;
  /** Duraklatılmış oturumun sonuç gelmezse kapanma zamanlayıcısı */
  private duraklatmaZamanlayici: NodeJS.Timeout | null = null;
  /** Süren turun tahmini kullanımı: API mesajı kimliği → işlenen token (aynı mesaj birkaç parça hâlinde gelir) */
  private turTahmini = new Map<string, number>();
  private turToplami = 0;

  constructor(private readonly b: OturumBaglami) {}

  get acik(): boolean {
    return this.sorgu !== null;
  }

  /** Açık oturum üzerinden plan kullanımını sorar (yeni süreç açmadan); oturum yoksa null */
  async kullanimSor(): Promise<{ hesap: Awaited<ReturnType<Query["accountInfo"]>>; kullanim: Awaited<ReturnType<Query["usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET"]>> } | null> {
    const q = this.sorgu;
    if (!q || !this.initGoruldu) return null;
    try {
      const [hesap, kullanim] = await Promise.all([q.accountInfo(), q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })]);
      return { hesap, kullanim };
    } catch {
      return null;
    }
  }

  get durum(): AjanDurumu {
    return this.sonDurum;
  }

  /** Oturumu açar (gerekirse önceki oturumu sürdürür) ve ilk mesajı verir */
  baslat(ilkMesaj: string, kaynak: MesajKaynagi = { tur: "kurul" }): void {
    this.gonder(ilkMesaj, "next", kaynak);
  }

  private sorguOlustur(ajan: Ajan, devam: string | null): Query {
    this.initGoruldu = false;
    const izinModu = ajan.izinModu as PermissionMode;
    const bypass = izinModu === "bypassPermissions";
    const kapiKancasi: HookCallback = async (girdi, aracKimligi) => {
      if (girdi.hook_event_name !== "PreToolUse") return {};
      return this.b.kapi(girdi.tool_name, (girdi.tool_input ?? {}) as Record<string, unknown>, aracKimligi ?? girdi.tool_use_id, girdi.agent_id);
    };
    // Hafıza kancaları ajanı asla durdurmaz: hata olursa ek bağlam verilmez
    const guvenli = (f: () => string | null): string | null => {
      try {
        return f();
      } catch {
        return null;
      }
    };
    const sonraKancasi: HookCallback = async (girdi, aracKimligi) => {
      if (girdi.hook_event_name !== "PostToolUse") return {};
      const ek = guvenli(() => this.b.aracSonrasi(girdi.tool_name, (girdi.tool_input ?? {}) as Record<string, unknown>, aracKimligi ?? girdi.tool_use_id));
      return ek ? { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: ek } } : {};
    };
    const hataKancasi: HookCallback = async (girdi) => {
      if (girdi.hook_event_name !== "PostToolUseFailure" || girdi.is_interrupt) return {};
      const ek = guvenli(() => this.b.aracHatasi(girdi.tool_name, (girdi.tool_input ?? {}) as Record<string, unknown>, girdi.error ?? ""));
      return ek ? { hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: ek } } : {};
    };
    const turKancasi: HookCallback = async (girdi) => {
      if (girdi.hook_event_name !== "UserPromptSubmit") return {};
      const ek = guvenli(() => this.b.turBasi(girdi.prompt));
      return ek ? { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: ek } } : {};
    };
    const acilisKancasi: HookCallback = async (girdi) => {
      if (girdi.hook_event_name !== "SessionStart" || girdi.source !== "compact") return {};
      const ek = guvenli(() => this.b.sikistirmaSonrasi());
      return ek ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ek } } : {};
    };
    // Zorlanan model (ARNORG_MODEL_ZORLA) de birincil sayılır; yedeği ondan seçilir
    const model = process.env.ARNORG_MODEL_ZORLA || ajan.model;
    const yedek = yedekModel(model);
    return query({
      prompt: this.kuyruk!,
      options: {
        cwd: this.b.cwd,
        model,
        ...(yedek && yedek !== model ? { fallbackModel: yedek } : {}),
        // Tek turda dönüp duran ajan pencereyi tüketmesin; sayaç her kullanıcı turunda sıfırlanır
        maxTurns: AJAN_TUR_TAVANI,
        permissionMode: izinModu,
        allowDangerouslySkipPermissions: bypass,
        ...(this.b.claudeYolu ? { pathToClaudeCodeExecutable: this.b.claudeYolu } : {}),
        env: ajanOrtami({
          IS_SANDBOX: rootMu() ? "1" : undefined,
          ARNORG_AJAN: ajan.id,
          CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1",
          ARNORG_PROJE: ajan.projeId,
          OTEL_RESOURCE_ATTRIBUTES: `arnorg.ajan=${ajan.id},arnorg.proje=${ajan.projeId}`,
        }),
        systemPrompt: { type: "preset", preset: "claude_code", append: this.b.talimat() },
        settingSources: ["project"],
        // Commit ve PR'lara Claude imzası (Co-Authored-By, oturum bağlantısı) eklenmez; repo sahibinin adı kalır.
        // Claude Code'un kendi otomatik hafızası kapalı: o, çalışma dizini başına ev dizininde ayrı ve görünmez bir hafıza tutar;
        // ArnOrg'da tek hafıza projenin ortak hafızasıdır (repo içinde, ekipçe ve kurulca görülür) ve ajanın defteridir.
        settings: { attribution: { commit: "", pr: "", sessionUrl: false }, includeCoAuthoredBy: false, autoMemoryEnabled: false, autoDreamEnabled: false },
        mcpServers: { arnorg: this.b.araclar() },
        disallowedTools: ["AskUserQuestion", ...this.b.yasakAraclar()],
        hooks: {
          PreToolUse: [{ hooks: [kapiKancasi], timeout: this.b.onaySuresiSn() + 60 }],
          PostToolUse: [{ hooks: [sonraKancasi] }],
          PostToolUseFailure: [{ hooks: [hataKancasi] }],
          UserPromptSubmit: [{ hooks: [turKancasi] }],
          SessionStart: [{ hooks: [acilisKancasi] }],
        },
        canUseTool: this.b.izinSor,
        ...(devam ? { resume: devam } : {}),
        stderr: (parca: string) => {
          this.stderrSon.push(...parca.split("\n").filter(Boolean));
          if (this.stderrSon.length > 40) this.stderrSon.splice(0, this.stderrSon.length - 40);
        },
      },
    });
  }

  /** Mesajı oturuma verir; oturum kapalıysa açar */
  gonder(metin: string, oncelik: MesajOnceligi = "next", kaynak: MesajKaynagi = { tur: "kurul" }): void {
    const etiketli = kaynak.tur === "kurul" ? metin : `[${kaynakEtiketi(kaynak)}] ${metin}`;
    this.akisYaz({ tur: "kullanici", metin: kaynak.tur === "kurul" ? metin : etiketli, arac: kaynakEtiketi(kaynak) });
    // Duraklatılmış oturuma gelen mesajı Şirket bilerek iletir (kurul, soru yanıtı): oturum kapanmaz, mesaj işlenir
    this.duraklatma = null;
    this.duraklatmaKapanisi(null);
    if (!this.kuyruk || this.kuyruk.kapandi) {
      this.kuyruk = null;
      this.baslatIcin(etiketli, oncelik, kaynak);
      return;
    }
    const mesaj: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: etiketli },
      parent_tool_use_id: null,
      priority: oncelik,
      ...(kaynak.tur === "kurul" ? { origin: { kind: "human" as const } } : {}),
    };
    this.kuyruk.ekle(mesaj);
  }

  private baslatIcin(metin: string, oncelik: MesajOnceligi, kaynak: MesajKaynagi): void {
    // gonder() akışa zaten yazdı; baslat() içindeki gonder yinelenmesin diye kuyruğa doğrudan ekle
    const ajan = this.b.ajan();
    this.kuyruk = new AkanKuyruk<SDKUserMessage>();
    this.kuyruk.ekle({
      type: "user",
      message: { role: "user", content: metin },
      parent_tool_use_id: null,
      priority: oncelik,
      ...(kaynak.tur === "kurul" ? { origin: { kind: "human" as const } } : {}),
    });
    this.sonToplam = { token: 0 };
    this.oturumNo = null;
    this.stderrSon = [];
    this.kapatiliyor = false;
    this.kimlikBekliyor = false;
    this.duraklatma = null;
    this.duraklatmaKapanisi(null);
    this.turTahmini.clear();
    this.turToplami = 0;
    this.sorgu = this.sorguOlustur(ajan, ajan.oturumId);
    this.durumYaz("calisiyor", iki("Oturum açılıyor", "Opening session"));
    void this.dongu(this.sorgu);
  }

  async kes(): Promise<void> {
    if (!this.sorgu) return;
    try {
      await this.sorgu.interrupt();
      this.akisYaz({ tur: "sistem", metin: iki("Yönetim kurulu turu kesti.", "The board interrupted the turn.") });
    } catch (h) {
      this.akisYaz({ tur: "sistem", metin: iki(`Kesme başarısız: ${(h as Error).message}`, `Interrupt failed: ${(h as Error).message}`), hata: true });
    }
  }

  async modDegistir(mod: IzinModu): Promise<void> {
    if (!this.sorgu) return;
    await this.sorgu.setPermissionMode(mod as PermissionMode);
    this.akisYaz({ tur: "sistem", metin: `${iki("İzin modu", "Permission mode")}: ${mod}` });
  }

  async modelDegistir(model: string): Promise<void> {
    if (!this.sorgu) return;
    await this.sorgu.setModel(model);
    this.akisYaz({ tur: "sistem", metin: `Model: ${model}` });
  }

  /** Oturumu kapatır; oturum kimliği saklanır, sonra sürdürülebilir */
  kapat(): void {
    if (!this.sorgu) return;
    this.kapatiliyor = true;
    this.kuyruk?.kapat();
    try {
      this.sorgu.close();
    } catch {
      // Süreç zaten kapanmış olabilir
    }
  }

  /** Kapanmak üzere mi (kurul durdurdu, boşta kapatma): açılışta sürdürülecekler sayılırken atlanır */
  get kapaniyor(): boolean {
    return this.kapatiliyor;
  }

  /**
   * Ajanı açıklamayla duraklatır (görev token tavanı): süren tur kesilir, kesilen turun sonucu (kullanımı) gelince oturum
   * kapanır; sonuç gelmezse kısa süre sonra yine kapanır. Durum "duraklatildi" kalır; konuşma kimliği saklanır.
   */
  duraklat(aciklama: string): void {
    const turSuruyor = this.sonDurum === "calisiyor" || this.sonDurum === "karar_bekliyor";
    this.duraklatma = aciklama;
    this.durumYaz("duraklatildi", aciklama);
    const sorgu = this.sorgu;
    if (!sorgu) return;
    if (!turSuruyor) {
      this.kapat();
      return;
    }
    void sorgu.interrupt().catch(() => undefined);
    this.duraklatmaKapanisi(15_000);
  }

  /** Duraklatılmış oturum ms içinde tur sonucu gelmezse kapanır; null zamanlayıcıyı kaldırır */
  private duraklatmaKapanisi(ms: number | null): void {
    if (this.duraklatmaZamanlayici) clearTimeout(this.duraklatmaZamanlayici);
    this.duraklatmaZamanlayici = null;
    const sorgu = this.sorgu;
    if (ms === null || !sorgu) return;
    this.duraklatmaZamanlayici = setTimeout(() => {
      this.duraklatmaZamanlayici = null;
      if (this.sorgu === sorgu && this.duraklatma) this.kapat();
    }, ms);
    this.duraklatmaZamanlayici.unref();
  }

  // ------------------------------------------------------------------

  private durumYaz(durum: AjanDurumu, aciklama?: string): void {
    // Duraklatılmış oturum kapanana dek ajan duraklatılmış görünür (tur sonu "boşta", kapanış "kapalı" yazmaz)
    if (this.duraklatma && durum !== "duraklatildi") {
      durum = "duraklatildi";
      aciklama = this.duraklatma;
    }
    this.sonDurum = durum;
    this.b.durum(durum, aciklama);
  }

  private akisYaz(o: Omit<AkisOgesi, "id" | "ajanId" | "zaman">): void {
    this.b.akis({ id: kimlik(), ajanId: this.b.ajan().id, zaman: simdi(), ...o });
  }

  /** Süren turun tahmini kullanımı: aynı API mesajı birkaç parça hâlinde gelir; her mesaj en büyük değeriyle bir kez sayılır */
  private tahminEkle(mesaj: { id?: string; usage?: Kullanim | null }): void {
    const u = mesaj.usage;
    if (!u || !mesaj.id || !this.b.turKullanimi) return;
    const islenen = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const onceki = this.turTahmini.get(mesaj.id) ?? 0;
    if (islenen <= onceki) return;
    this.turTahmini.set(mesaj.id, islenen);
    this.turToplami += islenen - onceki;
    this.b.turKullanimi(this.turToplami);
  }

  private async dongu(sorgu: Query): Promise<void> {
    let hata: string | null = null;
    try {
      for await (const m of sorgu) this.isle(m);
    } catch (h) {
      hata = (h as Error).message || String(h);
    }
    if (this.sorgu !== sorgu) return; // yeni oturum açılmış
    this.sorgu = null;
    this.kuyruk?.kapat();
    this.kuyruk = null;
    if (hata && !this.kapatiliyor) {
      const stderr = this.stderrSon.slice(-6).join(" | ");
      // Sürdürülecek oturum bulunamadıysa bir kez sıfırdan dene
      if (this.devamDenemesi && /no conversation found|session.*not found|--resume/i.test(hata + stderr) && this.b.ajan().oturumId) {
        this.devamDenemesi = false;
        this.b.oturumKimligi("");
        this.akisYaz({ tur: "sistem", metin: iki("Önceki oturum bulunamadı; yeni oturum açılıyor.", "The previous session was not found; opening a new one.") });
        this.baslatIcin(
          iki("Önceki oturumun bulunamadı. ArnOrg notlarını ve görevlerini okuyarak kaldığın yerden devam et.", "Your previous session was not found. Read your ArnOrg notes and tasks and continue where you left off."),
          "next",
          { tur: "sistem" },
        );
        return;
      }
      const ozet = kisalt(`${hata}${stderr ? ` · ${stderr}` : ""}`, 400);
      this.akisYaz({ tur: "sistem", metin: iki(`Oturum hatayla kapandı: ${ozet}`, `The session closed with an error: ${ozet}`), hata: true });
      const sorun = kimlikSorunuMetinden(`${hata} ${stderr}`);
      if (sorun) {
        // Hata değil, kurulun girişi bekleniyor: kurul açılır pencereyle uyarılır, giriş yapılınca oturum sürer
        this.durumYaz("duraklatildi", KIMLIK_BEKLENIYOR());
        this.b.kimlikSorunu(sorun, ozet);
        this.b.bitti(null);
        return;
      }
      this.durumYaz("hata", kisalt(hata, 120));
      this.b.bitti(ozet);
      return;
    }
    if (this.kimlikBekliyor) {
      this.durumYaz("duraklatildi", KIMLIK_BEKLENIYOR());
      this.b.bitti(null);
      return;
    }
    this.durumYaz("kapali", "");
    this.b.bitti(null);
  }

  private isle(m: SDKMessage): void {
    switch (m.type) {
      case "system": {
        if (m.subtype === "init") {
          this.b.oturumKimligi(m.session_id);
          if (this.oturumNo !== m.session_id) {
            // Sürdürülen oturumun ilk sonucu önceki turların toplamını taşır; kaldığımız yerden sayılır
            this.oturumNo = m.session_id;
            this.sonToplam = { token: this.b.oturumToplami.oku(m.session_id)?.token ?? 0 };
          }
          const kaynak = (m as { apiKeySource?: string }).apiKeySource;
          if (kaynak) this.b.girisKaynagi(kaynak);
          if (!this.initGoruldu) this.akisYaz({ tur: "sistem", metin: `${iki("Oturum açıldı", "Session opened")} · ${m.model} · ${m.permissionMode}` });
          this.initGoruldu = true;
          this.durumYaz("calisiyor", iki("Çalışıyor", "Working"));
        } else if (m.subtype === "session_state_changed") {
          const st = (m as { state?: string }).state;
          if (st === "running") this.durumYaz("calisiyor");
          else if (st === "requires_action") this.durumYaz("karar_bekliyor", iki("Karar bekliyor", "Awaiting decision"));
          else if (st === "idle") this.durumYaz("bosta", iki("İş bekliyor", "Waiting for work"));
        } else if (m.subtype === "task_started") {
          const t = m as { description?: string; task_type?: string; is_backgrounded?: boolean };
          const ne = t.description ?? t.task_type ?? "";
          this.akisYaz({ tur: "sistem", metin: iki(`${t.is_backgrounded ? "Arka plan görevi" : "Alt görev"} başladı: ${ne}`, `${t.is_backgrounded ? "Background task" : "Subtask"} started: ${ne}`) });
        } else if (m.subtype === "task_notification") {
          const t = m as { status?: string; summary?: string };
          this.akisYaz({ tur: "sistem", metin: iki(`Görev ${t.status ?? "bitti"}: ${kisalt(t.summary ?? "", 200)}`, `Task ${t.status ?? "done"}: ${kisalt(t.summary ?? "", 200)}`) });
        } else if (m.subtype === "compact_boundary") {
          this.akisYaz({ tur: "sistem", metin: iki("Bağlam sıkıştırıldı.", "Context compacted.") });
        } else if (m.subtype === "api_retry") {
          const r = m as { attempt?: number; max_retries?: number };
          this.akisYaz({ tur: "sistem", metin: `${iki("API yeniden deneniyor", "Retrying the API")} (${r.attempt ?? "?"}/${r.max_retries ?? "?"})` });
        }
        return;
      }
      case "assistant": {
        const ust = m.parent_tool_use_id;
        this.tahminEkle(m.message as { id?: string; usage?: Kullanim | null });
        // Giriş düştüyse ya da abonelik sorunluysa SDK bunu hata alanıyla bildirir. Süreç eski kimliği tuttuğundan
        // oturum kapatılır (konuşma kimliği saklanır); giriş yapılınca yeni süreç kaldığı yerden sürer.
        const sorun = kimlikSorunuHatadan(m.error);
        if (sorun && !this.kimlikBekliyor) {
          const ayrinti = m.message.content.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
          this.kimlikBekliyor = true;
          this.b.kimlikSorunu(sorun, kisalt(ayrinti || String(m.error), 300));
          queueMicrotask(() => this.kapat());
        }
        for (const parca of m.message.content) {
          if (parca.type === "text" && parca.text.trim()) {
            this.akisYaz({ tur: "asistan", metin: parca.text, ustAracKimligi: ust });
          } else if (parca.type === "thinking") {
            const t = (parca as { thinking?: string }).thinking ?? "";
            if (t.trim()) this.akisYaz({ tur: "dusunce", metin: t, ustAracKimligi: ust });
          } else if (parca.type === "tool_use") {
            const girdi = (parca.input ?? {}) as Record<string, unknown>;
            this.akisYaz({ tur: "arac_cagrisi", arac: parca.name, aracKimligi: parca.id, girdi, ustAracKimligi: ust });
            if (!ust) this.durumYaz("calisiyor", aracAciklamasi(parca.name, girdi));
          }
        }
        return;
      }
      case "user": {
        const icerik = m.message.content;
        if (!Array.isArray(icerik)) return;
        for (const parca of icerik) {
          if (typeof parca === "object" && parca && "type" in parca && parca.type === "tool_result") {
            const ic = (parca as { content?: unknown }).content;
            const metin = typeof ic === "string" ? ic : Array.isArray(ic) ? ic.map((x) => (x && typeof x === "object" && "text" in x ? String((x as { text: unknown }).text) : "")).join("\n") : "";
            this.akisYaz({
              tur: "arac_sonucu",
              aracKimligi: (parca as { tool_use_id?: string }).tool_use_id,
              metin: kisalt(metin, 4000),
              hata: Boolean((parca as { is_error?: boolean }).is_error),
              ustAracKimligi: m.parent_tool_use_id,
            });
          }
        }
        return;
      }
      case "result": {
        const yeni: Toplam = { token: islenenToken((m as { modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; cacheCreationInputTokens?: number }> }).modelUsage) };
        const fark = toplamFarki(this.sonToplam, yeni);
        this.sonToplam = yeni;
        if (this.oturumNo) this.b.oturumToplami.yaz(this.oturumNo, yeni);
        if (fark.token > 0) this.b.kullanim(fark);
        const metin =
          m.subtype === "success"
            ? kisalt(String((m as { result?: string }).result ?? ""), 600)
            : m.subtype === "error_max_turns"
              ? iki(`Tur sınırına ulaşıldı (${AJAN_TUR_TAVANI} adım).`, `Turn limit reached (${AJAN_TUR_TAVANI} steps).`)
              : iki("Tur hatayla ya da kesilerek bitti.", "The turn ended with an error or was interrupted.");
        this.akisYaz({ tur: "sonuc", metin, token: fark.token, hata: m.subtype !== "success" });
        this.devamDenemesi = true;
        this.turTahmini.clear();
        this.turToplami = 0;
        // Tur bitti; kuyrukta mesaj varsa yeni tur bunu hemen günceller
        this.durumYaz("bosta", iki("İş bekliyor", "Waiting for work"));
        // Tur tavanında ajan boşa çıkar; Şirket yöneticisine haber verir
        if (m.subtype === "error_max_turns") this.b.turTavaniAsildi?.(AJAN_TUR_TAVANI);
        // Duraklatılan oturum kesilen turun sonucu (kullanımı) gelince kapanır; Claude Code'un kuyruğunda işlenmemiş
        // mesaj varsa (queued_turn_count) önce o tur işlenir (iş araçları denetim kapısında kapalı), sonra kapanır
        const bekleyenTur = (m as { queued_turn_count?: number }).queued_turn_count ?? 0;
        if (this.duraklatma) {
          if (bekleyenTur > 0) this.duraklatmaKapanisi(KUYRUK_TURU_BEKLEME_MS);
          else {
            this.duraklatmaKapanisi(null);
            queueMicrotask(() => this.kapat());
          }
        }
        return;
      }
      case "rate_limit_event": {
        const r = (m as { rate_limit_info?: { status?: string; rateLimitType?: string; resetsAt?: number; utilization?: number } }).rate_limit_info;
        if (r) {
          this.b.pencere({
            tur: r.rateLimitType ?? "",
            durum: r.status ?? "",
            sifirlanma: r.resetsAt ? new Date(r.resetsAt * 1000).toISOString() : null,
            // utilization kesir (0–1) ya da yüzde olarak gelebilir
            yuzde: typeof r.utilization === "number" ? (r.utilization <= 1 ? r.utilization * 100 : r.utilization) : null,
          });
        }
        return;
      }
      default:
        return;
    }
  }
}
