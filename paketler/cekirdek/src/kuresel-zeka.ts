// Global zekâ: projelerden bağımsız, kendi kendine öğrenen standart kurallar (veri dizinindeki veritabanında).
// Öğrenme: kurulun genel tercihleri ve düzeltmeleri, ajanların dersleri ve önerileri gözlem olarak gelir; benzer kural
// varsa kanıt eklenip güven artar, yoksa yeni kural açılır. Aday kural başka projede de görülünce ya da güveni
// yükselince etkinleşir. Bakım: tekrar edenler birleşir, güveni düşenler emekliye ayrılır, etkin kural sayısı sınırlı tutulur.
// Etkin kurallar her ajana rolü ve yetkisi kapsamında (herkes, yönetici, geliştirici ya da rol kimliği) talimatla verilir.
// Damıtma: gözlem önce küçük bir modelle projeden bağımsız tek bir kurala çevrilir ya da projeye özgü diye elenir
// (damitici.ts); damıtılamayan ham gözlem tek başına standart olmaz, aday kalır.
import fs from "node:fs";
import path from "node:path";
import type { Ajan, KuralKaynagi, KureselKural, Rol, ZekaDurumu, ZekaGunlukTuru } from "@arnorg/ortak";
import type { Damitici, DamitmaSonucu } from "./damitici.js";
import type { Depo } from "./depo.js";
import { dil, iki } from "./dil.js";
import type { OlayYolu } from "./olaylar.js";
import { anlamliSozcukler, aramaMetni, ArnorgHatasi, kisalt, simdi } from "./yardimci.js";

const ETKIN_SINIRI = 60;
const BAGLAM_SINIRI = 2600;
const BENZERLIK_ESIGI = 0.5;
const KAPSAM_GRUPLARI = new Set(["yonetici", "gelistirici"]);
/** Günde en çok bu kadar gözlem modele damıtılır; fazlası ham (temkinli) işlenir */
const DAMITMA_GUNLUK = 80;
const DAMITMA_ONBELLEK = 300;

/** Metin bir projeye özgü mü (proje adı, dosya yolu, "bu projede")? Özgü olan global kural olmaz */
export function projeyeOzguMu(metin: string): boolean {
  const m = aramaMetni(metin);
  if (/\b(bu proje|bu projede|bu projenin|bu repo|bu depoda|this project|this repo|in this codebase)\b/.test(m)) return true;
  // dosya yolu ya da uzantılı dosya adı
  if (/(^|\s)[\w.-]+\/[\w./-]+/.test(metin) || /\b[\w-]+\.(ts|tsx|js|jsx|py|go|rs|java|vue|css|json|md|yml|yaml)\b/i.test(metin)) return true;
  return false;
}

/** Sözcük kökü: Türkçe ekler benzerliği bozmasın diye uzun sözcüklerin ilk 5 harfi (mesajları, mesajı → mesaj) */
function kok(s: string): string {
  return s.length > 5 ? s.slice(0, 5) : s;
}

/** İki metnin sözcük benzerliği (Jaccard; kısa olan uzunun içindeyse örtüşme oranı); köklerle karşılaştırılır */
export function benzerlik(a: string, b: string): number {
  const x = new Set(anlamliSozcukler(a, 40).map(kok));
  const y = new Set(anlamliSozcukler(b, 40).map(kok));
  if (!x.size || !y.size) return 0;
  let ortak = 0;
  for (const s of x) if (y.has(s)) ortak++;
  const jaccard = ortak / (x.size + y.size - ortak);
  const ortusme = ortak >= 3 ? ortak / Math.min(x.size, y.size) : 0;
  return Math.max(jaccard, ortusme * 0.85);
}

/** Kural ajana uyar mı: kapsam boşsa herkes; "yonetici"/"gelistirici" grupları; rol kimlikleri */
export function kapsamUyar(kapsam: string[], rol: Pick<Rol, "kimlik" | "yonetici"> | undefined): boolean {
  if (!kapsam.length || kapsam.includes("hepsi")) return true;
  if (!rol) return false;
  if (kapsam.includes(rol.kimlik)) return true;
  if (kapsam.includes("yonetici") && rol.yonetici) return true;
  if (kapsam.includes("gelistirici") && !rol.yonetici) return true;
  return false;
}

export interface Gozlem {
  metin: string;
  kaynak: KuralKaynagi;
  projeId: string | null;
  projeAd: string | null;
  kapsam?: string[];
  /** Önem 5 ders gibi güçlü işaret: aday yerine doğrudan etkin */
  guclu?: boolean;
  /** Damıtılamadı: tek başına standart olmaz, aday kalır */
  ham?: boolean;
  /** Damıtıldıysa gözlemin özgün metni (kanıt olarak saklanır) */
  hamMetin?: string;
}

export class KureselZeka {
  private zamanlayici: NodeJS.Timeout | null = null;
  private damitmaKuyrugu: Promise<unknown> = Promise.resolve();
  private readonly damitmaOnbellegi = new Map<string, Exclude<DamitmaSonucu, null>>();
  private damitmaSayaci = { gun: "", sayi: 0 };

  constructor(
    private readonly depo: Depo,
    private readonly olaylar: OlayYolu,
    private readonly veriDizini: string,
    private damitici: Damitici | null = null,
  ) {}

  damiticiAyarla(d: Damitici | null): void {
    this.damitici = d;
  }

  /**
   * Gözlemi damıtıp işler (sırayla; aynı metin için model bir kez çağrılır). Model kuralı genelleştirirse kural o
   * metinle açılır ya da güçlenir, özgün metin kanıt olarak kalır; projeye özgü bulursa elenir; ulaşılamazsa gözlem
   * ham işlenir. Damıtıcı yoksa (testler, oturumsuz kip) gözlem olduğu gibi işlenir.
   */
  gozlemDamit(g: Gozlem): Promise<KureselKural | null> {
    if (!this.damitici) return Promise.resolve(this.gozlem(g));
    const is = this.damitmaKuyrugu.then(() => this.damitVeIsle(g));
    this.damitmaKuyrugu = is.catch(() => undefined);
    return is;
  }

  private async damitVeIsle(g: Gozlem): Promise<KureselKural | null> {
    const ham = g.metin.replace(/\s+/g, " ").trim();
    if (ham.length < 8 || ham.length > 600) return null;
    const anahtar = aramaMetni(ham);
    let sonuc: DamitmaSonucu = this.damitmaOnbellegi.get(anahtar) ?? null;
    if (!sonuc && this.damitmaHakkiVar()) {
      sonuc = await this.damitici!(ham, { projeAd: g.projeAd, dil: dil() }).catch(() => null);
      if (sonuc) {
        this.damitmaOnbellegi.set(anahtar, sonuc);
        if (this.damitmaOnbellegi.size > DAMITMA_ONBELLEK) this.damitmaOnbellegi.delete(this.damitmaOnbellegi.keys().next().value!);
      }
    }
    if (sonuc?.tur === "ozgu") {
      this.gunluk("eledi", iki(`Projeye özgü bulundu, global kural olmadı${g.projeAd ? ` (${g.projeAd})` : ""}: ${kisalt(ham, 140)}`, `Project-specific, not made a global rule${g.projeAd ? ` (${g.projeAd})` : ""}: ${kisalt(ham, 140)}`), null);
      return null;
    }
    if (sonuc?.tur === "kural") return this.gozlem({ ...g, metin: sonuc.metin, hamMetin: ham, ham: false });
    return this.gozlem({ ...g, metin: ham, ham: true });
  }

  /** Günlük damıtma sınırı */
  private damitmaHakkiVar(): boolean {
    const gun = simdi().slice(0, 10);
    if (this.damitmaSayaci.gun !== gun) this.damitmaSayaci = { gun, sayi: 0 };
    if (this.damitmaSayaci.sayi >= DAMITMA_GUNLUK) return false;
    this.damitmaSayaci.sayi++;
    return true;
  }

  baslat(aralikMs = 6 * 3600_000): void {
    if (this.zamanlayici) return;
    setTimeout(() => this.bakim(), 30_000).unref();
    this.zamanlayici = setInterval(() => this.bakim(), aralikMs);
    this.zamanlayici.unref();
  }

  durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
  }

  private gunluk(tur: ZekaGunlukTuru, metin: string, kural: KureselKural | null, silinenId?: string): void {
    const g = this.depo.zekaGunluguEkle(tur, metin, kural?.id ?? null);
    this.olaylar.yayinla({ tur: "zeka.guncellendi", kural, gunluk: g, ...(silinenId ? { silinenId } : {}) });
  }

  private kapsamTemizle(kapsam: string[] | undefined): string[] {
    return [...new Set((kapsam ?? []).map((k) => k.trim().toLocaleLowerCase("tr")).filter((k) => k && k !== "hepsi" && (KAPSAM_GRUPLARI.has(k) || /^[a-z]{2,20}$/.test(k))))].slice(0, 8);
  }

  /**
   * Gözlemi işler. Projeye özgü metin global kural olmaz. Benzer kural varsa kanıt eklenir ve güven artar
   * (başka projeden gelen kanıt daha çok sayılır); yoksa kaynağa göre etkin ya da aday yeni kural açılır.
   */
  gozlem(g: Gozlem): KureselKural | null {
    const metin = g.metin.replace(/\s+/g, " ").trim();
    if (metin.length < 8 || metin.length > 600) return null;
    if (projeyeOzguMu(metin)) return null;
    const kanit = { projeId: g.projeId, projeAd: g.projeAd, metin: kisalt(g.hamMetin ?? metin, 300), zaman: simdi() };
    const adaylar = this.depo
      .kurallar()
      .map((k) => ({ k, b: benzerlik(k.metin, metin) }))
      .filter((x) => x.b >= BENZERLIK_ESIGI)
      .sort((a, b) => b.b - a.b);
    const var_ = adaylar[0]?.k;
    if (var_) {
      const ayniKanit = var_.kanitlar.some((x) => x.projeId === g.projeId && aramaMetni(x.metin) === aramaMetni(kanit.metin));
      if (ayniKanit) return var_;
      const baskaProje = Boolean(g.projeId) && !var_.kanitlar.some((x) => x.projeId === g.projeId);
      const artis = baskaProje ? 0.15 : 0.05;
      const kanitlar = [...var_.kanitlar, kanit].slice(-12);
      const projeler = new Set(kanitlar.map((x) => x.projeId).filter(Boolean));
      let durum = var_.durum;
      const guven = Math.min(0.97, var_.guven + artis + (g.kaynak === "kurul" || g.kaynak === "duzeltme" ? 0.1 : 0));
      if (durum === "aday" && (guven >= 0.65 || projeler.size >= 2)) durum = "etkin";
      if (durum === "emekli" && (g.kaynak === "kurul" || g.kaynak === "duzeltme")) durum = "etkin";
      const kapsam = var_.kapsam.length && g.kapsam?.length ? [...new Set([...var_.kapsam, ...this.kapsamTemizle(g.kapsam)])] : var_.kapsam.length ? var_.kapsam : [];
      const yeni = this.depo.kuralGuncelle(var_.id, { kanitlar, guven, durum, kapsam })!;
      if (durum !== var_.durum && durum === "etkin") this.gunluk("etkinlesti", iki(`Standart oldu: ${kisalt(yeni.metin, 160)}`, `Became a standard: ${kisalt(yeni.metin, 160)}`), yeni);
      else this.gunluk("guclendi", iki(`Güçlendi (${Math.round(guven * 100)}%): ${kisalt(yeni.metin, 160)}`, `Strengthened (${Math.round(guven * 100)}%): ${kisalt(yeni.metin, 160)}`), yeni);
      this.yansit();
      return yeni;
    }
    const kurulSozu = g.kaynak === "kurul" || g.kaynak === "tercih" || g.kaynak === "duzeltme";
    // Damıtılamayan ham gözlem projeye özgü olabilir: başka projede de görülene ya da kurul etkinleştirene kadar aday
    const durum = !g.ham && (kurulSozu || g.guclu) ? "etkin" : "aday";
    const guven = g.ham ? 0.5 : g.kaynak === "kurul" ? 0.85 : kurulSozu ? 0.72 : g.guclu ? 0.66 : 0.5;
    const kural = this.depo.kuralEkle({ metin, kapsam: this.kapsamTemizle(g.kapsam), kaynak: g.kaynak, kanitlar: [kanit], guven, durum });
    this.gunluk(
      "ogrendi",
      durum === "etkin"
        ? iki(`Yeni standart öğrendi${g.projeAd ? ` (${g.projeAd})` : ""}: ${kisalt(metin, 160)}`, `Learned a new standard${g.projeAd ? ` (${g.projeAd})` : ""}: ${kisalt(metin, 160)}`)
        : iki(`Aday kural${g.projeAd ? ` (${g.projeAd})` : ""}: ${kisalt(metin, 160)}`, `Candidate rule${g.projeAd ? ` (${g.projeAd})` : ""}: ${kisalt(metin, 160)}`),
      kural,
    );
    if (durum === "etkin") {
      this.olaylar.yayinla({ tur: "bildirim", seviye: "bilgi", metin: iki(`Global zekâ yeni bir standart öğrendi: ${kisalt(metin, 120)}`, `Global intelligence learned a new standard: ${kisalt(metin, 120)}`) });
    }
    this.sinirla();
    this.yansit();
    return kural;
  }

  /** Ajanın talimatına giren bölüm: kapsamına uyan etkin kurallar, güvene göre */
  baglam(ajan: Ajan, rol: Rol | undefined): { metin: string; idler: string[] } {
    const kurallar = this.depo.kurallar("etkin").filter((k) => kapsamUyar(k.kapsam, rol));
    if (!kurallar.length) return { metin: "", idler: [] };
    const satirlar: string[] = [
      iki("## ArnOrg standartları (global zekâ)", "## ArnOrg standards (global intelligence)"),
      iki(
        "ArnOrg'un bütün projelerden öğrendiği kurallar; yetkin ve rolün kapsamında uy. Ana yasa ve kurulun bu projedeki açık sözü bunların önündedir. Bir kural bu durumda yanlışsa kuresel_kural_degerlendir ile bildir; işe yarayanı da bildir.",
        "Rules ArnOrg learned across all projects; follow them within your authority and role. The constitution and the board's explicit word in this project come first. If a rule is wrong here, report it with kuresel_kural_degerlendir; report the ones that helped too.",
      ),
    ];
    const idler: string[] = [];
    let toplam = 0;
    for (const k of kurallar) {
      const satir = `- [${k.id.slice(0, 8)}] ${k.metin}${k.ihlal >= 2 ? iki(" (sık çiğneniyor; dikkat)", " (often broken; take care)") : ""}`;
      if (toplam + satir.length > BAGLAM_SINIRI) break;
      toplam += satir.length;
      satirlar.push(satir);
      idler.push(k.id);
    }
    return { metin: satirlar.join("\n"), idler };
  }

  /** Talimata giren kurallar kullanılmış sayılır */
  kullanildi(idler: string[]): void {
    if (idler.length) this.depo.kuralKullanildi(idler);
  }

  /** Ajan ya da kurul geri bildirimi: işe yaradı güveni artırır, yanlış azaltır, ihlal sayılır */
  geriBildirim(id: string, sonuc: "ise_yaradi" | "yanlis" | "ihlal", not: string | null, kim: string): KureselKural {
    const k = this.depo.kural(id) ?? this.depo.kurallar().find((x) => x.id.startsWith(id));
    if (!k) throw new ArnorgHatasi(iki("Kural bulunamadı.", "Rule not found."), 404);
    let alanlar: Partial<KureselKural>;
    if (sonuc === "ise_yaradi") alanlar = { yarar: k.yarar + 1, guven: Math.min(0.97, k.guven + 0.04) };
    else if (sonuc === "ihlal") alanlar = { ihlal: k.ihlal + 1 };
    else {
      const guven = Math.max(0, k.guven - 0.2);
      alanlar = { guven, durum: guven < 0.3 ? "emekli" : k.durum };
    }
    const yeni = this.depo.kuralGuncelle(k.id, alanlar)!;
    const ad = sonuc === "ise_yaradi" ? iki("işe yaradı", "helped") : sonuc === "ihlal" ? iki("çiğnendi", "was broken") : iki("yanlış bulundu", "was found wrong");
    this.gunluk("geri_bildirim", `${kim}: ${ad} — ${kisalt(k.metin, 120)}${not ? ` (${kisalt(not, 160)})` : ""}`, yeni);
    if (yeni.durum === "emekli" && k.durum !== "emekli") this.gunluk("emekli", iki(`Emekliye ayrıldı: ${kisalt(k.metin, 160)}`, `Retired: ${kisalt(k.metin, 160)}`), yeni);
    this.yansit();
    return yeni;
  }

  /** Kurulun doğrudan eklediği kural: etkin ve yüksek güvenli */
  kurulEkle(metin: string, kapsam: string[]): KureselKural {
    const temiz = metin.replace(/\s+/g, " ").trim();
    if (temiz.length < 5 || temiz.length > 600) throw new ArnorgHatasi(iki("Kural 5–600 karakter olmalı.", "A rule must be 5–600 characters."));
    const k = this.depo.kuralEkle({ metin: temiz, kapsam: this.kapsamTemizle(kapsam), kaynak: "kurul", kanitlar: [{ projeId: null, projeAd: null, metin: temiz, zaman: simdi() }], guven: 0.9, durum: "etkin" });
    this.gunluk("duzenlendi", iki(`Kurul ekledi: ${kisalt(temiz, 160)}`, `Added by the board: ${kisalt(temiz, 160)}`), k);
    this.yansit();
    return k;
  }

  duzenle(id: string, alanlar: { metin?: string; kapsam?: string[]; durum?: KureselKural["durum"] }): KureselKural {
    const k = this.depo.kural(id);
    if (!k) throw new ArnorgHatasi(iki("Kural bulunamadı.", "Rule not found."), 404);
    const degisiklik: Partial<KureselKural> = {};
    if (alanlar.metin !== undefined) {
      const t = alanlar.metin.replace(/\s+/g, " ").trim();
      if (t.length < 5 || t.length > 600) throw new ArnorgHatasi(iki("Kural 5–600 karakter olmalı.", "A rule must be 5–600 characters."));
      degisiklik.metin = t;
    }
    if (alanlar.kapsam !== undefined) degisiklik.kapsam = this.kapsamTemizle(alanlar.kapsam);
    if (alanlar.durum !== undefined) {
      degisiklik.durum = alanlar.durum;
      // Kurul etkinleştirdiyse güven en az 0.7
      if (alanlar.durum === "etkin" && k.guven < 0.7) degisiklik.guven = 0.7;
    }
    const yeni = this.depo.kuralGuncelle(id, degisiklik)!;
    this.gunluk("duzenlendi", iki(`Kurul düzenledi: ${kisalt(yeni.metin, 160)}`, `Edited by the board: ${kisalt(yeni.metin, 160)}`), yeni);
    this.yansit();
    return yeni;
  }

  sil(id: string): void {
    const k = this.depo.kural(id);
    if (!k) throw new ArnorgHatasi(iki("Kural bulunamadı.", "Rule not found."), 404);
    this.depo.kuralSil(id);
    this.gunluk("duzenlendi", iki(`Kurul sildi: ${kisalt(k.metin, 160)}`, `Deleted by the board: ${kisalt(k.metin, 160)}`), null, k.id);
    this.yansit();
  }

  durum(): ZekaDurumu {
    const kurallar = this.depo.kurallar();
    const sayilar = { aday: 0, etkin: 0, emekli: 0 };
    for (const k of kurallar) sayilar[k.durum]++;
    return { kurallar, gunluk: this.depo.zekaGunlugu(100), sayilar };
  }

  /**
   * Bakım: tekrar eden kuralları birleştirir, uzun süre kanıt gelmeyen adayları ve güveni düşenleri emekliye ayırır,
   * etkin kural sayısını sınırlar.
   */
  bakim(simdiMs = Date.now()): void {
    try {
      const hepsi = this.depo.kurallar().filter((k) => k.durum !== "emekli");
      const silinen = new Set<string>();
      for (let i = 0; i < hepsi.length; i++) {
        const a = hepsi[i]!;
        if (silinen.has(a.id)) continue;
        for (let j = i + 1; j < hepsi.length; j++) {
          const b = hepsi[j]!;
          if (silinen.has(b.id) || benzerlik(a.metin, b.metin) < 0.72) continue;
          const [tut, birak] = a.guven >= b.guven ? [a, b] : [b, a];
          const kanitlar = [...tut.kanitlar, ...birak.kanitlar].sort((x, y) => x.zaman.localeCompare(y.zaman)).slice(-12);
          this.depo.kuralGuncelle(tut.id, { kanitlar, guven: Math.min(0.97, Math.max(tut.guven, birak.guven) + 0.05), kullanim: tut.kullanim + birak.kullanim, yarar: tut.yarar + birak.yarar, ihlal: tut.ihlal + birak.ihlal, durum: "etkin" === birak.durum ? "etkin" : tut.durum });
          this.depo.kuralGuncelle(birak.id, { durum: "emekli" });
          silinen.add(birak.id);
          this.gunluk("birlestirdi", iki(`Birleştirdi: "${kisalt(birak.metin, 80)}" → "${kisalt(tut.metin, 80)}"`, `Merged: "${kisalt(birak.metin, 80)}" → "${kisalt(tut.metin, 80)}"`), this.depo.kural(tut.id));
          if (birak.id === a.id) break;
        }
      }
      const otuzGun = 30 * 86_400_000;
      for (const k of this.depo.kurallar()) {
        if (k.durum === "emekli") continue;
        const sonKanit = k.kanitlar.at(-1)?.zaman ?? k.olusturma;
        const eskiAday = k.durum === "aday" && simdiMs - Date.parse(sonKanit) > otuzGun;
        const zayif = k.guven < 0.3;
        const isesiz = k.durum === "etkin" && k.kullanim >= 80 && k.yarar === 0 && k.ihlal === 0 && k.kaynak === "ogrenilen" && k.guven < 0.6;
        if (eskiAday || zayif || isesiz) {
          const yeni = this.depo.kuralGuncelle(k.id, { durum: "emekli" });
          this.gunluk("emekli", iki(`Emekliye ayrıldı: ${kisalt(k.metin, 160)}`, `Retired: ${kisalt(k.metin, 160)}`), yeni);
        }
      }
      this.sinirla();
      this.yansit();
    } catch {
      // bakım bir sonraki döngüde yinelenir
    }
  }

  private sinirla(): void {
    const etkin = this.depo.kurallar("etkin");
    for (const k of etkin.slice(ETKIN_SINIRI)) {
      const yeni = this.depo.kuralGuncelle(k.id, { durum: "aday" });
      this.gunluk("emekli", iki(`Sınır nedeniyle adaya indi: ${kisalt(k.metin, 120)}`, `Moved back to candidate (limit): ${kisalt(k.metin, 120)}`), yeni);
    }
  }

  /** İnsanın okuyacağı kopya: <veri>/zeka/kurallar.md */
  private yansit(): void {
    try {
      const dizin = path.join(this.veriDizini, "zeka");
      fs.mkdirSync(dizin, { recursive: true });
      const kurallar = this.depo.kurallar();
      const bolum = (durum: KureselKural["durum"], baslik: string) => {
        const l = kurallar.filter((k) => k.durum === durum);
        return l.length ? ["", `## ${baslik}`, "", ...l.map((k) => `- ${k.metin} _(${Math.round(k.guven * 100)}%, ${k.kapsam.length ? k.kapsam.join(", ") : iki("herkes", "everyone")}, ${k.kanitlar.length} ${iki("kanıt", "evidence")})_`)] : [];
      };
      const md = [
        iki("# ArnOrg global zekâsı", "# ArnOrg global intelligence"),
        "",
        iki("ArnOrg bu dosyayı kendisi yazar. Kuralları Stüdyo'daki Zekâ ekranından yönetin.", "ArnOrg writes this file itself. Manage the rules from the Intelligence screen in Studio."),
        ...bolum("etkin", iki("Standartlar", "Standards")),
        ...bolum("aday", iki("Adaylar", "Candidates")),
        ...bolum("emekli", iki("Emekli", "Retired")),
      ];
      fs.writeFileSync(path.join(dizin, "kurallar.md"), md.join("\n") + "\n", "utf8");
    } catch {
      // veri dizini yazılamıyorsa veritabanı yeterli
    }
  }
}
