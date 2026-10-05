// Görev token tavanı: ajanın işlediği token o anki görevine (ajan.gorevId) yazılır ve görev başına tutulur. Görevin
// toplamı tavanı (kurulun yükselttiği görev tavanı, yoksa Ayarlar.gorevTokenTavani) aşınca ajanın turu kesilir, ajan
// "duraklatildi" olur ve `genel` onay (alt tür gorev_token_tavani) açılır; kurul karar verir, tam otonom kipte çalışanınkine
// CEO (CEO'nun kendi tavanı yine kurula gider). Onaylanırsa görevin tavanı bir kat artar
// ve ajan kaldığı yerden sürer; reddedilirse ajan durur, yöneticisine görevi bölmesi ya da yeniden planlaması için sistem
// mesajı gider. Karar beklerken ajana gelen mesajlar tutulur (kurul ve soru yanıtı geçer) ve iş araçları kapalıdır.
// Tek turda tur sınırına (maxTurns) ulaşan ajanın yöneticisine de buradan haber verilir.
import { GOREV_TAVANI_ALT_TURU, type Ajan, type AjanDurumu, type GorevTavaniOnayVerisi, type Onay, type SunucuOlayi } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import { kararOznesi } from "./karar-yetkisi.js";
import { ilgi, kisalt } from "./yardimci.js";

/** Anahtar-değer kaydı: görev başına işlenen token ve yükseltilmiş tavan */
const KAYIT_ONEKI = "gorev-token:";

export interface GorevTokenKaydi {
  token: number;
  /** Kurulun onayıyla yükseltilen tavan; yoksa ayardaki geçerlidir */
  tavan: number | null;
}

/** 2_100_000 → "2,1 M" (İngilizce "2.1M"), 850_000 → "850 bin" ("850k") */
export function kisaToken(n: number): string {
  const yerel = iki("tr-TR", "en-US");
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(yerel, { maximumFractionDigits: 1 })}${iki(" M", "M")}`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString(yerel)}${iki(" bin", "k")}`;
  return String(Math.round(n));
}

/** Görevin geçerli tavanı: ayar 0 ise kapalı (0); değilse görevin yükseltilmiş tavanıyla ayardakinin büyüğü */
export function gecerliTavan(kayit: GorevTokenKaydi, temel: number): number {
  if (!(temel > 0)) return 0;
  return Math.max(kayit.tavan ?? 0, temel);
}

/** Onayda tavan bir kat artar (mevcut + ayardaki tavan); toplam bunu da aşmışsa toplamın bir kat üstü */
export function yukseltilmisTavan(mevcut: number, temel: number, toplam: number): number {
  const kat = temel > 0 ? temel : mevcut;
  const yeni = mevcut + kat;
  return yeni > toplam ? yeni : toplam + kat;
}

/** Onay verisi görev token tavanı onayı mı */
export function tavanOnayiMi(veri: unknown): veri is GorevTavaniOnayVerisi {
  return !!veri && typeof veri === "object" && (veri as { altTur?: unknown }).altTur === GOREV_TAVANI_ALT_TURU;
}

/** Ajanın yöneticisi; yoksa (ya da kendisiyse) CEO; CEO'nun kendisi için null */
export function yoneticisi(a: Ajan, ekip: Ajan[]): Ajan | null {
  const y = a.yoneticiId ? ekip.find((x) => x.id === a.yoneticiId) : undefined;
  if (y && y.id !== a.id) return y;
  const ceo = ekip.find((x) => x.rol === "ceo");
  return ceo && ceo.id !== a.id ? ceo : null;
}

export interface GorevTavaniBaglami {
  depo: Pick<Depo, "deger" | "degerYaz" | "ajan" | "ajanlar" | "ajanGuncelle" | "gorev" | "projeler" | "onaylar">;
  /** Ayardaki tavan; 0 kapalı */
  temelTavan(): number;
  /** Süren turu keser, oturumu kapatır ve ajanı açıklamayla duraklatır (oturum yoksa yalnız durum yazılır) */
  duraklat(ajanId: string, aciklama: string): void;
  /** Ajanın durumunu yazar ve yayınlar */
  durumYaz(ajanId: string, durum: AjanDurumu, aciklama: string): void;
  /** Kurula beklemeden onay açar */
  onayAc(ajan: Ajan, baslik: string, ayrinti: string, veri: GorevTavaniOnayVerisi): Onay;
  /** Ajana ArnOrg'dan mesaj (eşzamanlı tavana uyar) */
  sistemMesaji(ajanId: string, metin: string): void;
  /** Ajanın akışına ArnOrg notu */
  akisNotu(ajanId: string, metin: string): void;
}

interface Duraklatma {
  gorevId: string;
  onayId: string;
  /** Karar beklerken gelen mesajlar; karar çıkınca iletilir */
  tutulan: string[];
}

/** Karar beklerken ajanın iş açıklaması */
const DURAKLATMA_ACIKLAMASI = () => iki("Görev token tavanı aşıldı", "Task token ceiling exceeded");

export class GorevTavani {
  /** Tavanı aşınca durdurulan, kurul kararı bekleyen ajanlar */
  private readonly durdurulanlar = new Map<string, Duraklatma>();
  private readonly kayitlar = new Map<string, GorevTokenKaydi>();

  constructor(private readonly b: GorevTavaniBaglami) {
    // Yeniden açılışta karar bekleyen tavan onayları: ajanları duraklatılmış kalır
    for (const p of b.depo.projeler()) {
      for (const o of b.depo.onaylar(p.id, "bekliyor")) {
        if (o.tur !== "genel" || !tavanOnayiMi(o.veri) || !b.depo.ajan(o.veri.ajanId)) continue;
        this.durdurulanlar.set(o.veri.ajanId, { gorevId: o.veri.gorevId, onayId: o.id, tutulan: [] });
        b.depo.ajanGuncelle(o.veri.ajanId, { durum: "duraklatildi", isAciklamasi: DURAKLATMA_ACIKLAMASI() });
      }
    }
  }

  /** Görevin sayacı (önbellekli) */
  kayit(gorevId: string): GorevTokenKaydi {
    let k = this.kayitlar.get(gorevId);
    if (!k) {
      k = { token: 0, tavan: null };
      try {
        const v = JSON.parse(this.b.depo.deger(KAYIT_ONEKI + gorevId) ?? "null") as Partial<GorevTokenKaydi> | null;
        if (v && typeof v.token === "number") k = { token: v.token, tavan: typeof v.tavan === "number" ? v.tavan : null };
      } catch {
        // bozuk kayıt sıfırdan sayılır
      }
      this.kayitlar.set(gorevId, k);
    }
    return k;
  }

  /** Görevin geçerli tavanı (0 kapalı) */
  tavan(gorevId: string): number {
    return gecerliTavan(this.kayit(gorevId), this.b.temelTavan());
  }

  /** Kurul kararı bekliyorsa ajanın iş açıklaması; beklemiyorsa null */
  duraklatmaAciklamasi(ajanId: string): string | null {
    return this.durdurulanlar.has(ajanId) ? DURAKLATMA_ACIKLAMASI() : null;
  }

  /** Tur sonucu: işlenen token ajanın görevine yazılır; tavan aşıldıysa ajan durur ve kurula sorulur */
  tokenEkle(ajanId: string, token: number): void {
    if (!(token > 0)) return;
    const a = this.b.depo.ajan(ajanId);
    const gorevId = a ? this.sayilanGorev(a) : null;
    if (!a || !gorevId) return;
    const k = this.kayit(gorevId);
    k.token += Math.round(token);
    this.b.depo.degerYaz(KAYIT_ONEKI + gorevId, JSON.stringify(k));
    this.denetle(a, gorevId, k.token);
  }

  /** Tur sürerken: görevin toplamı ve bu turun tahmini tavanı aşıyorsa tur sonucunu beklemeden kesilir */
  turSuruyor(ajanId: string, tahmin: number): void {
    if (!(tahmin > 0) || this.durdurulanlar.has(ajanId)) return;
    const a = this.b.depo.ajan(ajanId);
    const gorevId = a ? this.sayilanGorev(a) : null;
    if (a && gorevId) this.denetle(a, gorevId, this.kayit(gorevId).token + tahmin);
  }

  /** Karar beklerken ajana gelen mesaj tutulur ve kararla birlikte iletilir; tutulduysa true */
  tut(ajanId: string, metin: string): boolean {
    const d = this.durdurulanlar.get(ajanId);
    if (!d) return false;
    d.tutulan.push(kisalt(metin, 1500));
    if (d.tutulan.length > 20) d.tutulan.splice(0, d.tutulan.length - 20);
    return true;
  }

  /** Karar beklerken iş araçları kapalı: denetim kapısının ret nedeni (ArnOrg araçları açık kalır) */
  kapiNedeni(ajanId: string): string | null {
    const d = this.durdurulanlar.get(ajanId);
    if (!d) return null;
    const kod = this.b.depo.gorev(d.gorevId)?.kod;
    if (this.ceodaMi(ajanId, d.onayId)) {
      return iki(
        `${kod ?? "Görevin"} token tavanını aştı; CEO'nun kararı bekleniyor. Başka iş aracı çağırma: gelen bir soruyu ArnOrg araçlarıyla yanıtlayabilirsin, sonra dur. CEO onaylarsa ArnOrg seni kaldığın yerden uyandıracak.`,
        `${kod ?? "Your task"} went over its token ceiling; the CEO's decision is pending. Don't call any other work tools: you may answer a question with the ArnOrg tools, then stop. If the CEO approves, ArnOrg will wake you where you left off.`,
      );
    }
    return iki(
      `${kod ?? "Görevin"} token tavanını aştı; kurulun kararı bekleniyor. Başka iş aracı çağırma: gelen bir soruyu ArnOrg araçlarıyla yanıtlayabilirsin, sonra dur. Kurul onaylarsa ArnOrg seni kaldığın yerden uyandıracak.`,
      `${kod ?? "Your task"} went over its token ceiling; the board's decision is pending. Don't call any other work tools: you may answer a question with the ArnOrg tools, then stop. If the board approves, ArnOrg will wake you where you left off.`,
    );
  }

  /** Tavan onayı tam otonom kipte CEO'nun kararında mı (CEO'nun kendi tavanı ve CEO karar veremezken kurulda) */
  private ceodaMi(ajanId: string, onayId: string): boolean {
    const a = this.b.depo.ajan(ajanId);
    return !!a && this.b.depo.onaylar(a.projeId).some((o) => o.id === onayId && o.durum === "bekliyor" && o.muhatap === "ceo");
  }

  /** Olay yolu: görev tavanı onayının sonucu */
  olay(o: SunucuOlayi): void {
    if (o.tur !== "onay.sonuc" || o.onay.tur !== "genel" || o.onay.durum === "bekliyor" || !tavanOnayiMi(o.onay.veri)) return;
    this.sonuc(o.onay, o.onay.veri);
  }

  /** Tek turda tur sınırına ulaşan ajan boşa çıktı: akışa not düşülür, yöneticisine haber verilir */
  turSiniri(ajanId: string, adim: number): void {
    const a = this.b.depo.ajan(ajanId);
    if (!a) return;
    const yonetici = yoneticisi(a, this.b.depo.ajanlar(a.projeId));
    const g = a.gorevId ? this.b.depo.gorev(a.gorevId) : null;
    const gorev = g && g.durum !== "tamam" && g.durum !== "iptal" ? ` (${g.kod} "${kisalt(g.baslik, 80)}")` : "";
    this.b.akisNotu(
      a.id,
      iki(
        `Tek turda ${adim} adım sınırına ulaşıldı; ajan boşa çıktı.${yonetici ? ` ${yonetici.ad} haberdar edildi.` : ""}`,
        `Reached the ${adim}-step limit in a single turn; the agent is idle now.${yonetici ? ` ${yonetici.ad} has been told.` : ""}`,
      ),
    );
    if (!yonetici) return;
    this.b.sistemMesaji(
      yonetici.id,
      iki(
        `${a.ad} tek turda ${adim} adım sınırına ulaştı ve durdu${gorev}. Son çalışmasına ve mesajlarına bak: döngüye girdiyse yönlendir, iş büyükse böl; doğru yoldaysa kaldığı yerden sürmesini söyle.`,
        `${a.ad} hit the ${adim}-step limit in a single turn and stopped${gorev}. Look at their recent work and messages: if they are going in circles, redirect them; if the work is too big, split it; if they are on the right track, tell them to continue.`,
      ),
    );
  }

  /** Token ajanın o anki görevine sayılır: ajana atanmış, bitmemiş görev */
  private sayilanGorev(a: Ajan): string | null {
    if (!a.gorevId) return null;
    const g = this.b.depo.gorev(a.gorevId);
    if (!g || g.projeId !== a.projeId || g.atananId !== a.id || g.durum === "tamam" || g.durum === "iptal") return null;
    return g.id;
  }

  private denetle(a: Ajan, gorevId: string, toplam: number): void {
    const tavan = this.tavan(gorevId);
    if (!tavan || toplam <= tavan || this.durdurulanlar.has(a.id)) return;
    // Aynı görev için karar zaten bekleniyorsa (görev başkasına geçtiyse bile) ikinci onay açılmaz
    for (const d of this.durdurulanlar.values()) if (d.gorevId === gorevId) return;
    this.durdur(a, gorevId, toplam, tavan);
  }

  private durdur(a: Ajan, gorevId: string, toplam: number, tavan: number): void {
    const g = this.b.depo.gorev(gorevId);
    if (!g) return;
    const yeniTavan = yukseltilmisTavan(tavan, this.b.temelTavan(), toplam);
    // Önce kayıt: duraklatma sırasındaki durum değişiklikleri ajanı duraklatılmış tutar, gelen mesajlar tutulur
    const d: Duraklatma = { gorevId, onayId: "", tutulan: [] };
    this.durdurulanlar.set(a.id, d);
    this.b.duraklat(a.id, DURAKLATMA_ACIKLAMASI());
    const yonetici = yoneticisi(a, this.b.depo.ajanlar(a.projeId));
    const oran = `${kisaToken(toplam)} / ${kisaToken(tavan)}`;
    const baslik = iki(`${g.kod} görevi token tavanını aştı (${oran}). Sürsün mü?`, `${g.kod} went over its token ceiling (${oran}). Keep going?`);
    const ayrinti = iki(
      `${a.ad}, ${g.kod} "${kisalt(g.baslik, 120)}" görevinde ${kisaToken(toplam)} token işledi; görevin tavanı ${kisaToken(tavan)}. Ajan durdu ve kararınızı bekliyor. Onaylarsanız tavan ${kisaToken(yeniTavan)} olur ve ${a.ad} kaldığı yerden sürer. Reddederseniz ${a.ad} durur${yonetici ? `; ${yonetici.ad} görevi bölmesi ya da yeniden planlaması için uyarılır` : ""}.`,
      `${a.ad} has processed ${kisaToken(toplam)} tokens on ${g.kod} "${kisalt(g.baslik, 120)}"; the task's ceiling is ${kisaToken(tavan)}. The agent has stopped and is waiting for your decision. If you approve, the ceiling becomes ${kisaToken(yeniTavan)} and ${a.ad} picks up where they left off. If you reject, ${a.ad} stays stopped${yonetici ? ` and ${yonetici.ad} is asked to split or re-plan the task` : ""}.`,
    );
    const veri: GorevTavaniOnayVerisi = { altTur: GOREV_TAVANI_ALT_TURU, ajanId: a.id, gorevId, gorevKodu: g.kod, toplam: Math.round(toplam), tavan, yeniTavan };
    const onay = this.b.onayAc(a, baslik, ayrinti, veri);
    d.onayId = onay.id;
    this.b.akisNotu(
      a.id,
      onay.muhatap === "ceo"
        ? iki(`${g.kod} görevinin token tavanı aşıldı (${oran}); tur kesildi, CEO'nun kararı bekleniyor.`, `${g.kod} went over its token ceiling (${oran}); the turn was cut and the CEO's decision is pending.`)
        : iki(`${g.kod} görevinin token tavanı aşıldı (${oran}); tur kesildi, kurulun kararı bekleniyor.`, `${g.kod} went over its token ceiling (${oran}); the turn was cut and the board's decision is pending.`),
    );
  }

  private sonuc(onay: Onay, v: GorevTavaniOnayVerisi): void {
    const d = this.durdurulanlar.get(v.ajanId);
    const bu = !!d && d.onayId === onay.id;
    if (bu) this.durdurulanlar.delete(v.ajanId);
    const tutulan = bu ? d.tutulan : [];
    const ek = (baslik: string) => (tutulan.length ? `\n\n${baslik}:\n${tutulan.map((m) => `- ${m}`).join("\n")}` : "");
    const a = this.b.depo.ajan(v.ajanId);
    // Kararı veren: kurul ya da tam otonom kipte CEO (karar-yetkisi.ts)
    const ceo = onay.kararKaynagi === "ceo";
    const ozne = kararOznesi(onay.kararKaynagi, onay.kararVerenAd);
    if (onay.durum === "onaylandi") {
      const k = this.kayit(v.gorevId);
      const temel = this.b.temelTavan();
      const yeni = yukseltilmisTavan(Math.max(gecerliTavan(k, temel), v.tavan), temel, k.token);
      k.tavan = yeni;
      this.b.depo.degerYaz(KAYIT_ONEKI + v.gorevId, JSON.stringify(k));
      if (!a) return;
      this.b.durumYaz(a.id, "kapali", "");
      this.b.sistemMesaji(
        a.id,
        iki(
          `${ozne} ${v.gorevKodu} görevinin token tavanını ${kisaToken(yeni)} yaptı. Kaldığın yerden devam et.${ek("Bu sürede gelen mesajlar")}`,
          `${ozne} raised the token ceiling of ${v.gorevKodu} to ${kisaToken(yeni)}. Continue where you left off.${ek("Messages that came in meanwhile")}`,
        ),
      );
      return;
    }
    // Reddedildi: ajan durur; görevi bölmek ya da yeniden planlamak yöneticisine düşer
    if (!a) return;
    this.b.durumYaz(a.id, "duraklatildi", ceo ? iki("Görev token tavanı aşıldı; CEO sürdürmedi", "Task token ceiling exceeded; the CEO stopped it") : iki("Görev token tavanı aşıldı; kurul sürdürmedi", "Task token ceiling exceeded; the board stopped it"));
    const yonetici = yoneticisi(a, this.b.depo.ajanlar(a.projeId));
    if (!yonetici) return;
    const g = this.b.depo.gorev(v.gorevId);
    const baslik = g ? `${g.kod} "${kisalt(g.baslik, 80)}"` : v.gorevKodu;
    const oran = `${kisaToken(v.toplam)} / ${kisaToken(v.tavan)}`;
    const kararNotu = kisalt(onay.not?.trim() ?? "", 400);
    const ceoAdi = onay.kararVerenAd ?? "CEO";
    const not = !kararNotu ? "" : ceo ? iki(` (CEO ${ilgi(ceoAdi)} notu: ${kararNotu})`, ` (CEO ${ceoAdi}'s note: ${kararNotu})`) : iki(` (kurulun notu: ${kararNotu})`, ` (the board's note: ${kararNotu})`);
    const reddeden = ceo ? ozne : iki("kurul", "the board");
    this.b.sistemMesaji(
      yonetici.id,
      iki(
        `${a.ad}, ${baslik} görevinde token tavanını aştı (${oran}); ${reddeden} sürdürmeyi onaylamadı${not} ve ${a.ad} durdu. Görevi daha küçük görevlere böl ya da yeniden planla (gorev_olustur, gorev_guncelle); ${a.ad} yeni bir iş atanınca yeniden başlar.${ek(`${a.ad} durmuşken ona gelen mesajlar`)}`,
        `${a.ad} went over the token ceiling on ${baslik} (${oran}); ${reddeden} did not approve going on${not} and ${a.ad} has stopped. Split the task into smaller ones or re-plan it (gorev_olustur, gorev_guncelle); ${a.ad} starts again once new work is assigned.${ek(`Messages sent to ${a.ad} while stopped`)}`,
      ),
    );
  }
}
