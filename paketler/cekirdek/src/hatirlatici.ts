// Hatırlatıcı: ajan çalışırken projenin hafızasını doğru anda önüne getirir.
// - Her yeni turda: başka ajanların son turundan beri yazdığı kayıtlar ve mesajla ilgili kayıtlar
// - Bir araç hata verince: aynı hataya dair öğrenilen kayıt
// - Bir dosyaya dokununca: o dosyayı anan kayıtlar
// - Bağlam sıkıştırılınca: defter ve oturum boyunca ekipten gelen kayıtlar
// Aynı kayıt bir oturumda aynı amaçla bir kez hatırlatılır; hepsi yalnız ajanın kendi projesinden gelir.
import path from "node:path";
import { AD_HARITALARI_EN, HAFIZA_TURU_ADLARI, type Ajan, type AjanSorusu, type Gorev, type HafizaKaydi } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { dil, iki } from "./dil.js";
import type { ProjeHafizasi } from "./hafiza.js";
import { anlamliSozcukler, aramaMetni, kisalt } from "./yardimci.js";

export { anlamliSozcukler };

function kayitMetni(k: HafizaKaydi): string {
  return aramaMetni(`${k.baslik} ${k.metin} ${k.etiketler.join(" ")}`);
}

/** Kayıt sözcüklerden en az `enAz` tanesini içeriyor mu (gevşek eşleşmeyi eler) */
function eslesir(k: HafizaKaydi, sozcukler: string[], enAz: number): boolean {
  const m = kayitMetni(k);
  let adet = 0;
  for (const s of sozcukler) if (m.includes(s) && ++adet >= enAz) return true;
  return false;
}

/** Uzun hata çıktısından ayırt edici satırlar: hata anahtar sözcüğü geçenler, yoksa son satırlar */
export function hataOzu(hata: string): string {
  const satirlar = hata.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const anlamli = satirlar.filter((s) => /error|hata|fail|cannot|not found|denied|refused|missing|undefined|unexpected/i.test(s) || /\b(ERR|E[A-Z]{3,}|TS\d{3,})\b/.test(s));
  return (anlamli.length ? anlamli.slice(0, 6) : satirlar.slice(-6)).join("\n").slice(0, 1200);
}

function satir(k: HafizaKaydi, uzunluk = 260): string {
  return `- [${dil() === "en" ? AD_HARITALARI_EN.hafizaTuru[k.tur] : HAFIZA_TURU_ADLARI[k.tur]}] ${k.baslik}: ${kisalt(k.metin, uzunluk)} (${k.kaynakAd})`;
}

/** Mesaj kalıcı bir tercih ya da kural bildiriyor gibi mi ("bundan sonra", "her zaman", "asla" ...) */
export function tercihGibi(mesaj: string): boolean {
  const m = aramaMetni(mesaj);
  return /\b(bundan sonra|her zaman|hep boyle|hep (sunu|bunu)|asla|kesinlikle|hicbir zaman|daima|kural olarak|unutma|tercihim|istemiyorum|yasak)\b/.test(m);
}

const DOSYA_ARACLARI = new Set(["Read", "Edit", "MultiEdit", "Write", "NotebookEdit"]);
const HATA_ARACLARI = new Set(["Bash", "PowerShell"]);
const TUR_SINIRI = 3000;

interface Iz {
  acilis: string;
  sonBakis: string;
  /** Talimatta ya da tur başında gösterilenler */
  gosterilen: Set<string>;
  /** Hata ve dosya anında hatırlatılanlar */
  anlik: Set<string>;
  hataIpucu: boolean;
  tercihIpucu: number;
}

/** Aynı dosyayı başka dalda değiştiren ajan bu süre içindeyse uyarılır */
const CAKISMA_SURESI_MS = 6 * 3600_000;

export class Hatirlatici {
  private izler = new Map<string, Iz>();
  /** proje → göreli yol → ajan → son yazma anı */
  private yazmalar = new Map<string, Map<string, Map<string, number>>>();
  /** Bir oturumda aynı dosya ve kişi için bir kez uyarılır: ajan → "yol|öteki" */
  private cakismaUyarilari = new Map<string, Set<string>>();

  constructor(
    private readonly depo: Depo,
    private readonly hafiza: ProjeHafizasi,
  ) {}

  private iz(ajanId: string): Iz {
    let iz = this.izler.get(ajanId);
    if (!iz) {
      const simdi = new Date().toISOString();
      iz = { acilis: simdi, sonBakis: simdi, gosterilen: new Set(), anlik: new Set(), hataIpucu: false, tercihIpucu: 0 };
      this.izler.set(ajanId, iz);
    }
    return iz;
  }

  /** Oturum açılırken talimata giren kayıtlar gösterilmiş sayılır */
  oturumAcildi(ajanId: string, talimattakiler: string[]): void {
    const simdi = new Date().toISOString();
    this.izler.set(ajanId, { acilis: simdi, sonBakis: simdi, gosterilen: new Set(talimattakiler), anlik: new Set(), hataIpucu: false, tercihIpucu: 0 });
  }

  oturumKapandi(ajanId: string): void {
    this.izler.delete(ajanId);
    this.cakismaUyarilari.delete(ajanId);
  }

  /**
   * Ajan bir dosyaya yazdı. Aynı dosyayı yakın zamanda başka bir ajan kendi dalında değiştirdiyse
   * (birleştirmede çakışma çıkabilir) ajana bir kez haber verilir.
   */
  yazmaIzi(ajan: Ajan, goreli: string, simdiMs = Date.now()): string | null {
    if (!goreli || goreli.startsWith("..") || goreli.startsWith(".arnorg/")) return null;
    let proje = this.yazmalar.get(ajan.projeId);
    if (!proje) this.yazmalar.set(ajan.projeId, (proje = new Map()));
    let dosya = proje.get(goreli);
    if (!dosya) proje.set(goreli, (dosya = new Map()));
    dosya.set(ajan.id, simdiMs);
    const uyarilan = this.cakismaUyarilari.get(ajan.id) ?? new Set<string>();
    const digerleri: string[] = [];
    for (const [digerId, zaman] of dosya) {
      if (digerId === ajan.id || simdiMs - zaman > CAKISMA_SURESI_MS || uyarilan.has(`${goreli}|${digerId}`)) continue;
      const diger = this.depo.ajan(digerId);
      if (!diger || diger.projeId !== ajan.projeId) continue;
      uyarilan.add(`${goreli}|${digerId}`);
      const gorev = diger.gorevId ? this.depo.gorev(diger.gorevId) : null;
      const dk = Math.max(1, Math.round((simdiMs - zaman) / 60_000));
      digerleri.push(`${diger.ad} (${iki(`${dk} dk önce`, `${dk} min ago`)}${gorev ? `, ${gorev.kod} ${kisalt(gorev.baslik, 50)}` : ""}${diger.dal ? `, ${iki("dal", "branch")} ${diger.dal}` : ""})`);
    }
    this.cakismaUyarilari.set(ajan.id, uyarilan);
    if (!digerleri.length) return null;
    return iki(
      `[ArnOrg] Dikkat: ${goreli} dosyasını ${digerleri.join(" ve ")} de kendi dalında değiştirdi. Birleştirmede çakışma çıkabilir; değişikliğin onunkini etkiliyorsa ajana_sor ile sor ya da mesaj_gonder ile haber ver, aynı satırları ikiniz birden değiştirmeyin.`,
      `[ArnOrg] Heads up: ${digerleri.join(" and ")} also changed ${goreli} on their own branch. The merge may conflict; if your change affects theirs, ask with ajana_sor or let them know with mesaj_gonder, and don't both change the same lines.`,
    );
  }

  /**
   * Ajana yeni bir mesaj ulaşırken eklenecek bağlam: ekipten yeni kayıtlar ve mesajla ilgili kayıtlar.
   * Kurul kalıcı bir tercih bildiriyor gibiyse kaydetmesi hatırlatılır.
   */
  turBasi(ajan: Ajan, mesaj: string, kurulMu: boolean): string | null {
    const iz = this.iz(ajan.id);
    const bolumler: string[] = [];
    let kalan = TUR_SINIRI;
    const ekle = (baslik: string, kayitlar: HafizaKaydi[]) => {
      const satirlar: string[] = [];
      for (const k of kayitlar) {
        const s = satir(k);
        if (s.length > kalan) break;
        kalan -= s.length;
        satirlar.push(s);
        iz.gosterilen.add(k.id);
      }
      if (satirlar.length) bolumler.push(baslik, ...satirlar);
    };
    // Mesajda zaten satır olarak geçen kayıtlar (görev metnindeki "İlgili hafıza: - [Tür] başlık: ...") yeniden yazılmaz
    const mesajMetni = aramaMetni(mesaj);
    const mesajdaVar = (k: HafizaKaydi) => mesajMetni.includes(`] ${aramaMetni(k.baslik)}: `);

    const yeniler = this.depo
      .hafizaKayitlari(ajan.projeId, { sonra: iz.sonBakis, sinir: 40 })
      .filter((k) => k.kaynakAjanId !== ajan.id && !iz.gosterilen.has(k.id) && !mesajdaVar(k))
      .slice(0, 6);
    iz.sonBakis = new Date().toISOString();
    ekle(iki("Ekipten yeni hafıza (son turundan beri yazıldı):", "New team memory (written since your last turn):"), yeniler);

    const sozcukler = anlamliSozcukler(mesaj, 12);
    if (sozcukler.length) {
      const ilgili = this.hafiza
        .ara(ajan.projeId, sozcukler.join(" "), undefined, 10)
        .filter((k) => !iz.gosterilen.has(k.id) && !mesajdaVar(k) && eslesir(k, sozcukler, Math.min(2, sozcukler.length)))
        .slice(0, 3);
      ekle(iki("Bu mesajla ilgili hafıza:", "Memory related to this message:"), ilgili);
    }

    if (kurulMu && iz.tercihIpucu < 3 && tercihGibi(mesaj)) {
      iz.tercihIpucu++;
      bolumler.push(
        iki(
          "Kurul kalıcı bir tercih ya da kural bildirmiş olabilir. Öyleyse mcp__arnorg__hafiza_kaydet ile tur: tercih, önem 5 olarak kaydet ki tüm ekip her oturumda uysun. Bu yalnız bu projeye değil her projeye uyan bir kuralsa ArnOrg onu global zekâya da işler.",
          "The board may have stated a lasting preference or rule. If so, save it with mcp__arnorg__hafiza_kaydet as tur: tercih, importance 5 so the whole team follows it every session. If it applies to every project, not just this one, ArnOrg also records it in global intelligence.",
        ),
      );
    }
    return bolumler.length ? `${iki("[ArnOrg hafızası]", "[ArnOrg memory]")}\n${bolumler.join("\n")}` : null;
  }

  /** Bir komut hata verince: aynı hataya dair kayıt varsa onu, yoksa (oturumda bir kez) kaydetme ipucunu döner */
  hataSonrasi(ajan: Ajan, arac: string, girdi: Record<string, unknown>, hata: string): string | null {
    const iz = this.iz(ajan.id);
    const komut = typeof girdi.command === "string" ? girdi.command : typeof girdi.file_path === "string" ? girdi.file_path : "";
    const sozcukler = anlamliSozcukler(`${hataOzu(hata)}\n${komut}`, 14);
    if (!sozcukler.length) return null;
    const oncelik: Record<string, number> = { ogrenilen: 0, tercih: 1, karar: 2, olgu: 3, uzmanlik: 4, ozet: 5 };
    const adaylar = this.hafiza
      .ara(ajan.projeId, sozcukler.join(" "), undefined, 12)
      .filter((k) => k.tur !== "ozet" && !iz.anlik.has(k.id) && eslesir(k, sozcukler, Math.min(2, sozcukler.length)))
      .sort((a, b) => (oncelik[a.tur] ?? 9) - (oncelik[b.tur] ?? 9))
      .slice(0, 2);
    if (adaylar.length) {
      for (const k of adaylar) iz.anlik.add(k.id);
      return [iki("[ArnOrg hafızası] Bu hataya benzer bir durum hafızada var; aynı yoldan gitmeden önce bak:", "[ArnOrg memory] Memory has something similar to this error; look before going the same way:"), ...adaylar.map((k) => satir(k, 600))].join("\n");
    }
    if (!iz.hataIpucu && HATA_ARACLARI.has(arac)) {
      iz.hataIpucu = true;
      return iki(
        "[ArnOrg hafızası] Bu hata için hafızada kayıt yok. Nedenini bulup çözersen mcp__arnorg__hafiza_kaydet ile tur: ogrenilen olarak kısa bir kayıt bırak (belirti, neden, çözüm); ekipten kimse aynı hatayla yeniden uğraşmasın.",
        "[ArnOrg memory] Nothing in memory for this error. If you find the cause and fix it, leave a short record with mcp__arnorg__hafiza_kaydet as tur: ogrenilen (symptom, cause, fix) so nobody on the team fights the same error again.",
      );
    }
    return null;
  }

  /** Bir dosya okunur ya da yazılırken o dosyayı açıkça anan kayıtlar */
  dosyaSonrasi(ajan: Ajan, cwd: string, arac: string, girdi: Record<string, unknown>): string | null {
    if (!DOSYA_ARACLARI.has(arac)) return null;
    const y = typeof girdi.file_path === "string" ? girdi.file_path : typeof girdi.notebook_path === "string" ? girdi.notebook_path : null;
    if (!y) return null;
    const goreli = path.relative(cwd, path.resolve(cwd, y)).replace(/\\/g, "/");
    if (!goreli || goreli.startsWith("..") || goreli.startsWith(".arnorg/") || path.isAbsolute(goreli)) return null;
    const ad = path.posix.basename(goreli);
    const govde = ad.replace(/\.[^.]+$/, "");
    if (govde.length < 3) return null;
    const iz = this.iz(ajan.id);
    const tamAnahtar = aramaMetni(goreli);
    const adAnahtar = aramaMetni(ad);
    const adaylar = this.hafiza
      .ara(ajan.projeId, govde, undefined, 12)
      .filter((k) => {
        if (iz.anlik.has(k.id) || k.tur === "ozet") return false;
        const m = kayitMetni(k);
        return m.includes(tamAnahtar) || m.includes(adAnahtar);
      })
      .slice(0, 2);
    if (!adaylar.length) return null;
    for (const k of adaylar) iz.anlik.add(k.id);
    return [iki(`[ArnOrg hafızası] ${goreli} hakkında:`, `[ArnOrg memory] About ${goreli}:`), ...adaylar.map((k) => satir(k, 400))].join("\n");
  }

  /** Bağlam sıkıştırılınca: defter ve oturum açıldığından beri ekipten gelen kayıtlar */
  sikistirmaSonrasi(ajan: Ajan, bekleyenSorular: AjanSorusu[]): string | null {
    const iz = this.iz(ajan.id);
    const bolumler: string[] = [iki("[ArnOrg hafızası] Bağlam sıkıştırıldı; unutmaman gerekenler:", "[ArnOrg memory] Context was compacted; what you must not forget:")];
    const defter = this.hafiza.defter(ajan);
    if (defter) bolumler.push(iki("Defterin:", "Your journal:"), kisalt(defter, 2500));
    const yeniler = this.depo
      .hafizaKayitlari(ajan.projeId, { sonra: iz.acilis, sinir: 30 })
      .filter((k) => k.kaynakAjanId !== ajan.id)
      .slice(0, 8);
    if (yeniler.length) bolumler.push(iki("Bu oturumda ekipten gelen kayıtlar:", "Records from the team this session:"), ...yeniler.map((k) => satir(k)));
    if (bekleyenSorular.length) {
      bolumler.push(iki("Yanıt bekleyen soruların:", "Questions waiting for your answer:"), ...bekleyenSorular.slice(0, 6).map((s) => `- (${iki("soru", "question")} ${s.id}) ${s.soranAd}: ${kisalt(s.soru, 200)}`));
    }
    return bolumler.length > 1 ? bolumler.join("\n") : null;
  }
}

// ---------------------------------------------------------------------------
// Uzman bulma: soruyu kime soracağını bilmeyen ajan için en uygun çalışan
// ---------------------------------------------------------------------------

/** Rol başına konu sözcükleri (sadeleştirilmiş, önek olarak aranır) */
const ROL_KONULARI: Record<string, string[]> = {
  backend: ["api", "sunucu", "server", "veritaban", "database", "sql", "endpoint", "servis", "node", "auth", "kimlik dogrul", "kuyruk", "orm", "migration", "goc"],
  frontend: ["arayuz", "react", "css", "bilesen", "component", "sayfa", "ekran", "tarayici", "browser", "vite", "html", "stil", "tasarim sistemi", "erisilebilir"],
  fullstack: ["api", "arayuz", "react", "sunucu", "uctan uca", "entegrasyon", "endpoint", "form"],
  test: ["test", "vitest", "jest", "playwright", "e2e", "kapsam", "coverage", "regresyon", "senaryo", "dogrula"],
  inceleme: ["inceleme", "review", "kalite", "standart", "kod stili", "refactor", "okunabilir"],
  guvenlik: ["guvenlik", "security", "xss", "csrf", "injection", "sifre", "parola", "yetki", "cve", "zafiyet", "sizinti", "secret", "sifrele"],
  devops: ["docker", "deploy", "dagitim", "pipeline", "kubernetes", "actions", "build", "yayin", "nginx", "ortam", "sunucu kur", "release", "surum"],
  tasarim: ["tasarim", "renk", "tipografi", "yerlesim", "figma", "ikon", "gorsel", "logo", "kullanici deneyimi"],
  yazar: ["dokuman", "readme", "belge", "kilavuz", "metin", "yazi", "aciklama", "changelog"],
  arastirmaci: ["arastir", "karsilastir", "kutuphane", "secenek", "alternatif", "benchmark", "rakip", "olcum"],
  cto: ["mimari", "architecture", "teknoloji", "olcek", "performans", "altyapi", "teknik borc"],
  ceo: ["oncelik", "plan", "hedef", "kurul", "ise alim", "takvim", "kapsam"],
};

function sozcukGecer(metin: string, sozcuk: string): boolean {
  const kacis = sozcuk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${kacis}([^a-z0-9]|$)`).test(metin);
}

export interface UzmanSonucu {
  ajan: Ajan;
  neden: string;
}

/**
 * Soruyu en iyi yanıtlayabilecek çalışanı seçer: hafızada o konuda yazdıkları (uzmanlık kaydı ağır basar),
 * üzerinde çalıştıkları görevler ve rolleri. Hiçbir işaret yoksa soranın yöneticisine, o da yoksa CEO'ya gider.
 */
export function uzmanBul(depo: Depo, soran: Ajan, soru: string): UzmanSonucu | null {
  const adaylar = depo.ajanlar(soran.projeId).filter((a) => a.id !== soran.id && a.durum !== "duraklatildi");
  if (!adaylar.length) return null;
  const en = uzmanlariSirala(depo, soran, soru)[0];
  if (en && en.puan >= 1) return { ajan: en.ajan, neden: en.neden };
  const yonetici = soran.yoneticiId ? adaylar.find((a) => a.id === soran.yoneticiId) : undefined;
  if (yonetici) return { ajan: yonetici, neden: "konuda belirgin bir uzman yok; yöneticin" };
  const ceo = adaylar.find((a) => a.rol === "ceo");
  return ceo ? { ajan: ceo, neden: "konuda belirgin bir uzman yok; CEO" } : null;
}

/** Konuya göre puanlanmış çalışanlar (en uygun önce); soran hariç, duraklatılmışlar hariç */
export function uzmanlariSirala(depo: Depo, soran: Ajan, soru: string): (UzmanSonucu & { puan: number })[] {
  const adaylar = depo.ajanlar(soran.projeId).filter((a) => a.id !== soran.id && a.durum !== "duraklatildi");
  if (!adaylar.length) return [];
  const sozcukler = anlamliSozcukler(soru, 12);
  const puan = new Map<string, number>();
  const nedenler = new Map<string, string[]>();
  const ver = (ajanId: string, p: number, neden?: string) => {
    if (!adaylar.some((a) => a.id === ajanId)) return;
    puan.set(ajanId, (puan.get(ajanId) ?? 0) + p);
    if (neden) {
      const l = nedenler.get(ajanId) ?? [];
      if (l.length < 2 && !l.includes(neden)) l.push(neden);
      nedenler.set(ajanId, l);
    }
  };

  if (sozcukler.length) {
    const kayitlar = depo.hafizaAra(soran.projeId, sozcukler.join(" "), 20).filter((k) => eslesir(k, sozcukler, Math.min(2, sozcukler.length)));
    kayitlar.forEach((k, i) => {
      const agirlik = ((20 - i) / 20) * (k.tur === "uzmanlik" ? 3 : k.tur === "ozet" ? 2 : 1);
      if (k.kaynakAjanId) ver(k.kaynakAjanId, agirlik, `hafızada "${kisalt(k.baslik, 50)}" kaydı`);
      // Uzmanlık kaydı başka birini anıyorsa (ör. CEO "veritabanını Deniz bilir" yazdıysa) anılana gider
      if (k.tur === "uzmanlik") {
        const m = kayitMetni(k);
        for (const a of adaylar) if (a.id !== k.kaynakAjanId && sozcukGecer(m, aramaMetni(a.ad))) ver(a.id, agirlik + 1, `uzmanlık kaydı: "${kisalt(k.baslik, 50)}"`);
      }
    });

    const gorevler: Gorev[] = depo.gorevler(soran.projeId).filter((g) => g.atananId && g.durum !== "iptal");
    for (const g of gorevler) {
      const m = aramaMetni(`${g.baslik} ${g.etiket} ${g.aciklama.slice(0, 400)}`);
      const ortak = sozcukler.filter((s) => m.includes(s)).length;
      if (ortak >= Math.min(2, sozcukler.length)) ver(g.atananId!, Math.min(ortak * 0.6, 2.4), `${g.kod} "${kisalt(g.baslik, 40)}"`);
    }
  }

  // Benzer soruları daha önce yanıtlamış olan, o konuyu biliyordur
  if (sozcukler.length >= 2) {
    for (const s of depo.sorular(soran.projeId, { durum: "yanitlandi", sinir: 200 })) {
      const m = aramaMetni(s.soru);
      const ortak = sozcukler.filter((x) => m.includes(x)).length;
      if (ortak >= 2) ver(s.soruluId, Math.min(ortak * 0.5, 2), "benzer bir soruyu yanıtlamıştı");
    }
  }

  const soruMetni = aramaMetni(soru);
  for (const a of adaylar) {
    const konular = ROL_KONULARI[a.rol] ?? [];
    const isabet = konular.filter((k) => soruMetni.includes(k)).length;
    if (isabet) ver(a.id, Math.min(isabet * 1.2, 3), `rolü ${a.rolAdi}`);
  }

  // CEO yalnız öncelik ve plan sorularında öne çıksın
  for (const a of adaylar) if (a.rol === "ceo" && puan.has(a.id)) puan.set(a.id, puan.get(a.id)! * 0.6);

  return [...puan.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, p]) => ({ ajan: adaylar.find((a) => a.id === id)!, puan: p, neden: (nedenler.get(id) ?? []).join(", ") || "konuya en yakın çalışan" }));
}

/**
 * Daha önce sorulup yanıtlanmış benzer soru (son 30 gün). Sözcük örtüşmesi yüksekse
 * aynı soru için meslektaşı yeniden uyandırmaya gerek kalmaz.
 */
export function oncekiYanit(depo: Depo, projeId: string, soru: string, simdiMs = Date.now()): AjanSorusu | null {
  const a = new Set(anlamliSozcukler(soru, 20));
  if (a.size < 2) return null;
  let en: { s: AjanSorusu; benzerlik: number } | null = null;
  for (const s of depo.sorular(projeId, { durum: "yanitlandi", sinir: 300 })) {
    if (!s.yanit || simdiMs - Date.parse(s.olusturma) > 30 * 86_400_000) continue;
    const b = new Set(anlamliSozcukler(s.soru, 20));
    let ortak = 0;
    for (const x of a) if (b.has(x)) ortak++;
    const benzerlik = ortak / (a.size + b.size - ortak);
    if (benzerlik >= 0.6 && (!en || benzerlik > en.benzerlik)) en = { s, benzerlik };
  }
  return en?.s ?? null;
}

/** Yanıtlanmış sorularda arama (hafiza_ara için): soru ve yanıtta geçen sözcük sayısına göre */
export function sorulardaAra(depo: Depo, projeId: string, sorgu: string, sinir = 5): AjanSorusu[] {
  const sozcukler = anlamliSozcukler(sorgu, 10);
  if (!sozcukler.length) return [];
  const enAz = Math.min(2, sozcukler.length);
  return depo
    .sorular(projeId, { durum: "yanitlandi", sinir: 400 })
    .map((s) => {
      const m = aramaMetni(`${s.soru} ${s.yanit ?? ""}`);
      return { s, ortak: sozcukler.filter((x) => m.includes(x)).length };
    })
    .filter((x) => x.ortak >= enAz)
    .sort((a, b) => b.ortak - a.ortak)
    .slice(0, sinir)
    .map((x) => x.s);
}
