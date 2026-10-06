// Kurulun kanalında serbest konuşma: üyeler sırayla birbirine yanıt verir, kurul durdurana dek sürer (tur sınırı yok).
// Konuşma tek konuşmacılıdır: her mesajdan sonra sıradaki TEK üye kısa bir beklemeyle uyandırılır; mesaj sayısı doğrusal
// büyür ve kanalda aynı anda en çok bir bekleyen konuşmacı olur. Sıradaki üye: mesajda @ ile anılan üye (gönderen
// hariç), yoksa üye listesinde gönderenden sonraki üye (döngüsel). Kurulun mesajına anılan üyeler, anılan yoksa sıradaki
// üye yanıt verir; konuşma durmuşsa yalnız bu yanıt gelir, zincir sürmez. Yanıt vermeyen üye (uyanamadı, oturumu
// hata verdi, 4 dk sessiz) atlanır; üyelerin hepsi art arda susarsa, üye kalmazsa ya da abonelik sınırına gelinirse
// konuşma kendiliğinden durur ve kanala ArnOrg duyurusu düşer. Oturumdan bağımsızdır: kanal, mesajlar, ajan durumu ve
// uyandırma bağlamdan gelir; Claude Code oturumu açmadan test edilir.
import { ARNORG_GONDEREN, KURUL, kanalGorunenAdi, type Ajan, type Kanal, type KonusmaDurumu, type Mesaj, type SunucuOlayi } from "@arnorg/ortak";
import { dil, iki, listele } from "./dil.js";
import { calisanMi } from "./es-zamanlilik.js";
import { ekAdlari, ekMetni } from "./mesaj-ekleri/index.js";
import { kisalt } from "./yardimci.js";

/** İki tur arasındaki bekleme (ms): arayüzde "yazıyor" görünür, mesajlar tek seferde yığılmaz */
export const TUR_BEKLEMESI_MS = { en: 1500, cok: 3000 } as const;
/** Sırası gelen üye bu sürede kanala yazmazsa sıradakine geçilir; eşzamanlı tavan yüzünden sıradaysa beklenir */
export const YANIT_SURESI_MS = 4 * 60_000;
/**
 * Uyandırılan üyenin turu kanala yazmadan bitti (boşa çıktı): kuyrukta başka tur yoksa bu kadar sonra sıradakine geçilir.
 * Kuyruktaki tur başlarsa (oturum tur arasında kısa süre boşta görünür) yanıt süresi yeniden başlar.
 */
export const YANITSIZ_BITIS_MS = 15_000;
/** Uyandırma metnine giren son mesaj sayısı */
const SON_MESAJ = 10;

/** kurul ve mesai: kurulun eylemi (duyuru yok); diğerleri kendiliğinden durmadır ve kanala duyurulur */
export type DurmaNedeni = "kurul" | "mesai" | "sinir" | "butce" | "uye_yok" | "sessiz";

export interface KonusmaBaglami {
  kanal(projeId: string, ad: string): Kanal | null;
  /** Konuşmanın durumunu kalıcı yazar ve Stüdyo'ya yayınlar */
  durumYaz(projeId: string, ad: string, alanlar: { konusma: KonusmaDurumu; konu?: string | null; konusmaBaslangic?: string }): void;
  /** Konuşması süren kurul kanalları (proje verilmezse bütün projeler) */
  surenKonusmalar(projeId?: string): { projeId: string; kanal: string }[];
  ajan(ajanId: string): Pick<Ajan, "id" | "ad" | "projeId" | "durum"> | null;
  /** Kanalın son mesajları (eskiden yeniye) */
  mesajlar(projeId: string, kanal: string, sinir: number): Mesaj[];
  /** Abonelik kullanım sınırı aşıldı mı */
  sinirda(): boolean;
  /** 0.0.10 · Projenin token bütçesi doldu mu */
  butceDolu?(projeId: string): boolean;
  /** Ajan eşzamanlı tavan yüzünden sırada mı */
  siradaMi(ajanId: string): boolean;
  /** Ajanı uyandırır: kurul=true kurulun mesajına yanıttır (tavandan muaf), değilse ArnOrg kaynaklıdır ve tavana uyar; uyanamazsa false */
  uyandir(ajanId: string, metin: string, kurul: boolean): Promise<boolean>;
  /** Kanaldaki "yazıyor" göstergesi */
  yaziyor(ajanId: string, projeId: string, kanal: string, acik: boolean): void;
  /** Kanala ArnOrg duyurusu */
  duyur(projeId: string, kanal: string, metin: string): void;
  /** İki tur arası bekleme; verilmezse 1,5–3 sn arası */
  bekleme?(): number;
}

/**
 * Sıradaki konuşmacı: mesajda @ ile anılan ilk uygun üye (gönderen hariç); anılan yoksa üye listesinde `sonra`dan sonraki
 * ilk uygun üye (döngüsel, gönderen hariç). `sonra` verilmezse gönderenden sonrası; üye değilse listenin başından
 * başlanır. Uygun üye yoksa null.
 */
export function siradakiKonusmaci(o: {
  uyeler: readonly string[];
  gonderen: string | null;
  anilanlar?: readonly string[];
  sonra?: string | null;
  uygun?: (ajanId: string) => boolean;
}): string | null {
  const aday = (id: string) => id !== o.gonderen && o.uyeler.includes(id) && (o.uygun?.(id) ?? true);
  const anilan = o.anilanlar?.find(aday);
  if (anilan) return anilan;
  const ref = o.sonra !== undefined ? o.sonra : o.gonderen;
  const i = ref ? o.uyeler.indexOf(ref) : -1;
  for (let adim = 1; adim <= o.uyeler.length; adim++) {
    const id = o.uyeler[(i + adim) % o.uyeler.length]!;
    if (aday(id)) return id;
  }
  return null;
}

/** Sırası gelen üyeye giden metin (geçerli dilde): kanal, konu, son mesajlar ve nasıl yanıt vereceği */
export function uyandirmaMetni(b: { kanal: string; konu: string | null; uyeler: string[]; mesajlar: { ad: string; metin: string }[]; kurul: boolean; suruyor: boolean }): string {
  const ad = `#${kanalGorunenAdi(b.kanal, dil())}`;
  const gecmis = b.mesajlar.map((m) => `- ${m.ad}: ${kisalt(m.metin, 280)}`).join("\n");
  const satirlar = dilde(
    [
      b.kurul ? `Yönetim kurulu ${ad} kanalına yazdı; yanıt sende.` : `${ad} kanalında serbest konuşma sürüyor; sıra sende.`,
      b.konu ? `Konu: ${kisalt(b.konu, 400)}` : "",
      `Kanalın üyeleri: ${listele(b.uyeler)}.`,
      gecmis ? `Son mesajlar:\n${gecmis}` : "",
      b.kurul ? "Kurulun mesajına kısa ve doğal bir yanıt ver." : "Son mesajlara kısa ve doğal bir yanıt ver; söyleneni tekrarlama, konuşmayı bir adım ileri taşı.",
      `Yanıtını mcp__arnorg__mesaj_gonder ile ${ad} kanalına yaz (kanal: "${b.kanal}").`,
      b.suruyor ? "Başka bir üyeye söz vermek istersen @Ad ile an; kanalda olmayanları anma." : "",
      "İşin varsa işine dönmeden önce yalnız bir mesaj yaz; işin yoksa yanıtını yazınca dur.",
    ],
    [
      b.kurul ? `The board wrote in ${ad}; it's your reply.` : `An open conversation is going on in ${ad}; it's your turn.`,
      b.konu ? `Topic: ${kisalt(b.konu, 400)}` : "",
      `Channel members: ${listele(b.uyeler)}.`,
      gecmis ? `Latest messages:\n${gecmis}` : "",
      b.kurul ? "Give the board a short, natural reply." : "Reply briefly and naturally to the latest messages; don't repeat what was said, move the conversation one step forward.",
      `Write your reply in ${ad} with mcp__arnorg__mesaj_gonder (kanal: "${b.kanal}").`,
      b.suruyor ? "To hand the floor to another member, @mention them; don't mention anyone outside the channel." : "",
      "If you have work in progress, write just one message before going back to it; if not, stop after your reply.",
    ],
  );
  return satirlar.filter(Boolean).join("\n");
}

/** Kendiliğinden duran konuşmanın kanala düşen duyurusu; kurulun durdurmasında yok */
function durmaDuyurusu(neden: DurmaNedeni): string | null {
  switch (neden) {
    case "sinir":
      return iki("Abonelik kullanım sınırına gelindi; konuşma durdu. Pencere açılınca yeniden başlatabilirsiniz.", "The subscription usage limit was reached, so the conversation stopped. You can start it again when the window opens.");
    case "butce":
      return iki("Proje token bütçesi doldu; konuşma durdu. Bütçe artınca yeniden başlatabilirsiniz.", "The project's token budget is used up, so the conversation stopped. You can start it again once the budget is raised.");
    case "uye_yok":
      return iki("Konuşmayı sürdürecek üye kalmadı; konuşma durdu.", "No member is left to carry on, so the conversation stopped.");
    case "sessiz":
      return iki("Üyeler art arda yanıt vermedi; konuşma durdu.", "Members stopped answering one after another, so the conversation stopped.");
    default:
      return null;
  }
}

/** Satır dizisinin geçerli dildeki hâli (iki() metin alır) */
function dilde<T>(tr: T, en: T): T {
  return dil() === "en" ? en : tr;
}

interface Sira {
  ajanId: string;
  /** bekliyor: turlar arası bekleme, henüz uyandırılmadı · yaziyor: uyandırıldı, yanıtı bekleniyor */
  asama: "bekliyor" | "yaziyor";
  /** Uyandırma tamamlandı: ajan çalışıyor ya da eşzamanlı tavan sırasında */
  uyandi: boolean;
  /** Uyandırılan üyenin turu kanala yazmadan bitti; kısa süre içinde yeni tur başlamazsa atlanır */
  bosta: boolean;
  zamanlayici: NodeJS.Timeout | null;
}

interface KanalIzi {
  projeId: string;
  kanal: string;
  /** Sırası gelen tek üye; kanalda aynı anda en çok bir bekleyen konuşmacı olur */
  sira: Sira | null;
  /** Art arda yanıt vermeyen üye sayısı; bir üye yazınca sıfırlanır */
  sessiz: number;
}

const uyelerOf = (k: Kanal): string[] => k.uyeler ?? [];

export class KanalKonusmasi {
  private readonly izler = new Map<string, KanalIzi>();

  constructor(private readonly b: KonusmaBaglami) {}

  /** Kanalda sırası gelen üye: bekleme (bekliyor) ya da yanıt yazma (yaziyor) aşamasında; yoksa null */
  siradaki(projeId: string, kanal: string): { ajanId: string; asama: Sira["asama"] } | null {
    const s = this.izler.get(anahtar(projeId, kanal))?.sira;
    return s ? { ajanId: s.ajanId, asama: s.asama } : null;
  }

  /**
   * Konuşmayı başlatır. Konu verildiyse çağıran onu kanala kurulun mesajı olarak yazar ve ilk konuşmacı o mesajla uyanır;
   * konu yoksa son mesajlardan devam edilir (son konuşan üyeden sonraki üye). Önceki konu, yenisi verilmedikçe kalır.
   */
  baslat(projeId: string, kanal: string, konu: string | null): void {
    const k = this.b.kanal(projeId, kanal);
    if (!k?.ozel) return;
    const iz = this.iz(projeId, kanal);
    iz.sessiz = 0;
    this.b.durumYaz(projeId, kanal, { konusma: "suruyor", konusmaBaslangic: new Date().toISOString(), ...(konu ? { konu } : {}) });
    if (konu) return;
    // Yanıt yazan üye varsa zincir onun mesajından sürer
    if (iz.sira?.asama === "yaziyor") return;
    this.sonrakiniPlanla(iz, { ...k, konusma: "suruyor" }, { gonderen: null, sonra: this.sonKonusan(iz, k) });
  }

  /** Konuşmayı durdurur: bekleyen uyandırma iptal olur; o an yanıt yazan üye mesajını bitirir ama zincir sürmez */
  durdur(projeId: string, kanal: string, neden: DurmaNedeni = "kurul"): void {
    const iz = this.izler.get(anahtar(projeId, kanal));
    if (iz?.sira?.asama === "bekliyor") this.siraBitir(iz);
    const k = this.b.kanal(projeId, kanal);
    if (!k?.ozel || k.konusma !== "suruyor") return;
    this.b.durumYaz(projeId, kanal, { konusma: "durdu" });
    const duyuru = durmaDuyurusu(neden);
    if (duyuru) this.b.duyur(projeId, kanal, duyuru);
  }

  /** Projenin (verilmezse bütün projelerin) süren konuşmaları durur */
  hepsiniDurdur(projeId: string | undefined, neden: DurmaNedeni): void {
    for (const s of this.b.surenKonusmalar(projeId)) this.durdur(s.projeId, s.kanal, neden);
  }

  /** Üyelik değişti: sırası gelen üye artık üye değilse (çıkarıldı, işten ayrıldı) sıra bir sonrakine geçer */
  uyelerDegisti(projeId: string, kanal: string): void {
    const iz = this.izler.get(anahtar(projeId, kanal));
    const s = iz?.sira;
    if (!iz || !s) return;
    const k = this.b.kanal(projeId, kanal);
    if (k?.ozel && uyelerOf(k).includes(s.ajanId) && this.uygun(iz, s.ajanId)) return;
    this.siraBitir(iz);
    if (k?.ozel && k.konusma === "suruyor") this.sonrakiniPlanla(iz, k, { gonderen: null, sonra: this.sonKonusan(iz, k) });
  }

  kanalSilindi(projeId: string, kanal: string): void {
    const iz = this.izler.get(anahtar(projeId, kanal));
    if (iz) this.siraBitir(iz);
    this.izler.delete(anahtar(projeId, kanal));
  }

  projeKaldir(projeId: string): void {
    for (const iz of [...this.izler.values()]) if (iz.projeId === projeId) this.kanalSilindi(projeId, iz.kanal);
  }

  /** Kapanış: zamanlayıcılar durur, süren uyandırmaların devamı boşa düşer (açılışta bütün konuşmalar "durdu" başlar) */
  kapat(): void {
    for (const iz of this.izler.values()) {
      if (iz.sira?.zamanlayici) clearTimeout(iz.sira.zamanlayici);
      iz.sira = null;
    }
    this.izler.clear();
  }

  /** Olay yolundan: kanal mesajı, uyandırılan konuşmacının durumu, abonelik sınırı */
  olay(o: SunucuOlayi): void {
    if (o.tur === "mesaj.yeni") {
      // Mesajın olayı bütün dinleyicilere ulaştıktan sonra işlenir (Stüdyo önce mesajı, sonra sıradakini görür)
      const m = o.mesaj;
      queueMicrotask(() => {
        try {
          this.mesajGeldi(m);
        } catch {
          // proje silinmiş ya da ArnOrg kapanıyor olabilir
        }
      });
    } else if (o.tur === "ajan.guncellendi") {
      this.ajanDegisti(o.ajan);
    } else if (o.tur === "hesap.guncellendi" && o.hesap.sinir) {
      this.hepsiniDurdur(undefined, "sinir");
    }
  }

  // ------------------------------------------------------------------

  private iz(projeId: string, kanal: string): KanalIzi {
    const a = anahtar(projeId, kanal);
    let iz = this.izler.get(a);
    if (!iz) {
      iz = { projeId, kanal, sira: null, sessiz: 0 };
      this.izler.set(a, iz);
    }
    return iz;
  }

  /** Ajan hâlâ ekipte ve bu projede mi */
  private uygun(iz: KanalIzi, ajanId: string): boolean {
    return this.b.ajan(ajanId)?.projeId === iz.projeId;
  }

  /** Kanalda en son yazan üye */
  private sonKonusan(iz: KanalIzi, k: Kanal): string | null {
    const uyeler = uyelerOf(k);
    return [...this.b.mesajlar(iz.projeId, iz.kanal, 50)].reverse().find((m) => uyeler.includes(m.gonderenId))?.gonderenId ?? null;
  }

  private mesajGeldi(m: Mesaj): void {
    if (m.gonderenId === ARNORG_GONDEREN) return;
    const k = this.b.kanal(m.projeId, m.kanal);
    if (!k?.ozel) return;
    const iz = this.iz(m.projeId, m.kanal);
    if (m.gonderenId === KURUL) return this.kurulYazdi(iz, k, m);
    // Üye olmayan ajan da yazabilir; konuşma sırası yalnız üyeler arasında döner
    if (!uyelerOf(k).includes(m.gonderenId)) return;
    iz.sessiz = 0;
    if (iz.sira?.ajanId === m.gonderenId) this.siraBitir(iz);
    if (k.konusma !== "suruyor") return;
    // Başka bir üye yanıt yazıyorsa zincir onun mesajından sürer (aynı anda tek bekleyen konuşmacı)
    if (iz.sira?.asama === "yaziyor") return;
    this.sonrakiniPlanla(iz, k, { gonderen: m.gonderenId, anilanlar: m.anilanlar });
  }

  /**
   * Kurulun mesajı: anılan üyeler (üye olmayan anılanları Şirket uyandırır), anılan yoksa sıradaki üye yanıt verir. Konuşma
   * sürerken bir üye zaten yanıt yazıyorsa kurulun mesajı ondan sonraki konuşmacının önüne düşer; kurul yalnız üye
   * olmayanları andıysa ve sırada kimse yoksa konuşma sıradaki üyeyle sürer.
   */
  private kurulYazdi(iz: KanalIzi, k: Kanal, m: Mesaj): void {
    const uyeler = uyelerOf(k);
    const uygun = (id: string) => this.uygun(iz, id);
    let yanitlayanlar = m.anilanlar.filter((id) => uyeler.includes(id) && uygun(id));
    if (!m.anilanlar.length || (!yanitlayanlar.length && k.konusma === "suruyor" && !iz.sira)) {
      if (k.konusma === "suruyor" && iz.sira?.asama === "yaziyor") return;
      const s = siradakiKonusmaci({ uyeler, gonderen: null, sonra: this.sonKonusan(iz, k), uygun });
      yanitlayanlar = s ? [s] : [];
    }
    if (!yanitlayanlar.length) return;
    // Henüz uyandırılmamış konuşmacının yerini kurulun mesajına yanıt verecek üye alır
    if (iz.sira?.asama === "bekliyor") this.siraBitir(iz);
    const metin = this.metin(iz, k, true);
    for (const id of yanitlayanlar) void this.kurulaYanit(iz, id, metin).catch(() => undefined);
  }

  private async kurulaYanit(iz: KanalIzi, ajanId: string, metin: string): Promise<void> {
    // İlk yanıtlayan sırayı tutar (yanıt yazan yoksa): yanıtı gelince konuşma sürüyorsa zincir ondan sürer
    const sira = iz.sira ? null : this.siraKur(iz, ajanId, "yaziyor");
    if (sira) this.yanitBekle(iz, sira);
    this.b.yaziyor(ajanId, iz.projeId, iz.kanal, true);
    const uyandi = await this.b.uyandir(ajanId, metin, true);
    if (sira) this.uyandirmaSonucu(iz, sira, uyandi);
    else if (!uyandi) this.b.yaziyor(ajanId, iz.projeId, iz.kanal, false);
  }

  private sonrakiniPlanla(iz: KanalIzi, k: Kanal, secim: { gonderen: string | null; anilanlar?: readonly string[]; sonra?: string | null }): void {
    const uygun = (id: string) => this.uygun(iz, id);
    // Konuşma en az iki üyeyle sürer; tek üye kendi kendine yanıt vermez
    const sonraki = uyelerOf(k).filter(uygun).length >= 2 ? siradakiKonusmaci({ uyeler: uyelerOf(k), ...secim, uygun }) : null;
    if (!sonraki) {
      this.siraBitir(iz);
      this.durdur(iz.projeId, iz.kanal, "uye_yok");
      return;
    }
    // Bekleyen konuşmacının yerini yenisi alır; "yazıyor" turlar arası beklemede de görünür
    const sira = this.siraKur(iz, sonraki, "bekliyor");
    this.b.yaziyor(sonraki, iz.projeId, iz.kanal, true);
    this.zamanla(sira, this.b.bekleme?.() ?? TUR_BEKLEMESI_MS.en + Math.random() * (TUR_BEKLEMESI_MS.cok - TUR_BEKLEMESI_MS.en), () => void this.sirasiGeldi(iz, sira).catch(() => undefined));
  }

  /** Bekleme bitti: konuşma hâlâ sürüyorsa sıradaki üye uyandırılır */
  private async sirasiGeldi(iz: KanalIzi, sira: Sira): Promise<void> {
    if (iz.sira !== sira) return;
    const k = this.b.kanal(iz.projeId, iz.kanal);
    if (!k?.ozel || k.konusma !== "suruyor") return this.siraBitir(iz);
    if (this.b.sinirda()) return this.durdur(iz.projeId, iz.kanal, "sinir");
    if (this.b.butceDolu?.(iz.projeId)) return this.durdur(iz.projeId, iz.kanal, "butce");
    if (!uyelerOf(k).includes(sira.ajanId) || !this.uygun(iz, sira.ajanId)) return this.uyelerDegisti(iz.projeId, iz.kanal);
    this.yanitBekle(iz, sira);
    this.b.yaziyor(sira.ajanId, iz.projeId, iz.kanal, true);
    const uyandi = await this.b.uyandir(sira.ajanId, this.metin(iz, k, false), false);
    this.uyandirmaSonucu(iz, sira, uyandi);
  }

  /** Uyandırma bitti: çalışmaya başlayan ya da tavan sırasına giren üyenin yanıtı beklenir; uyanamadıysa atlanır */
  private uyandirmaSonucu(iz: KanalIzi, sira: Sira, uyandi: boolean): void {
    if (iz.sira !== sira) return;
    if (uyandi && (calisanMi(this.b.ajan(sira.ajanId)?.durum) || this.b.siradaMi(sira.ajanId))) {
      sira.uyandi = true;
      return;
    }
    this.atla(iz, sira);
  }

  private zamanAsimi(iz: KanalIzi, sira: Sira): void {
    if (iz.sira !== sira) return;
    // Eşzamanlı tavan yüzünden sırada bekleyen konuşmacı beklenir (sırası gelince yanıt verir)
    if (this.b.siradaMi(sira.ajanId)) return this.zamanla(sira, YANIT_SURESI_MS, () => this.zamanAsimi(iz, sira));
    this.atla(iz, sira);
  }

  /**
   * Uyandırılan konuşmacının durumu: oturumu hata verdi, duraklatıldı ya da kapandıysa yanıtı beklenmez; turu kanala
   * yazmadan bittiyse kısa süre sonra sıradakine geçilir, bu arada kuyruktaki turu başlarsa yanıtı yine beklenir.
   */
  private ajanDegisti(a: Pick<Ajan, "id" | "durum">): void {
    for (const iz of this.izler.values()) {
      const s = iz.sira;
      if (s?.ajanId !== a.id || !s.uyandi || this.b.siradaMi(a.id)) continue;
      if (a.durum === "hata" || a.durum === "duraklatildi" || a.durum === "kapali") {
        this.atla(iz, s);
      } else if (a.durum === "bosta" && !s.bosta) {
        s.bosta = true;
        this.zamanla(s, YANITSIZ_BITIS_MS, () => this.zamanAsimi(iz, s));
      } else if (calisanMi(a.durum) && s.bosta) {
        s.bosta = false;
        this.zamanla(s, YANIT_SURESI_MS, () => this.zamanAsimi(iz, s));
      }
    }
  }

  /** Sırası gelen üye yanıt vermedi: sıradakine geçilir; uygun üyelerin hepsi art arda susarsa konuşma durur */
  private atla(iz: KanalIzi, sira: Sira): void {
    if (iz.sira !== sira) return;
    this.siraBitir(iz);
    const k = this.b.kanal(iz.projeId, iz.kanal);
    if (!k?.ozel || k.konusma !== "suruyor") return;
    iz.sessiz++;
    const uygunlar = uyelerOf(k).filter((id) => this.uygun(iz, id)).length;
    if (!uygunlar) return this.durdur(iz.projeId, iz.kanal, "uye_yok");
    if (iz.sessiz >= uygunlar) return this.durdur(iz.projeId, iz.kanal, "sessiz");
    this.sonrakiniPlanla(iz, k, { gonderen: sira.ajanId });
  }

  private siraKur(iz: KanalIzi, ajanId: string, asama: Sira["asama"]): Sira {
    this.siraBitir(iz);
    const sira: Sira = { ajanId, asama, uyandi: false, bosta: false, zamanlayici: null };
    iz.sira = sira;
    return sira;
  }

  /** Uyandırılan üyenin yanıtı beklenir; süre dolarsa atlanır */
  private yanitBekle(iz: KanalIzi, sira: Sira): void {
    sira.asama = "yaziyor";
    this.zamanla(sira, YANIT_SURESI_MS, () => this.zamanAsimi(iz, sira));
  }

  /** Sıra boşalır: zamanlayıcı durur, "yazıyor" söner (yanıtını yazanınki zaten bitmiştir) */
  private siraBitir(iz: KanalIzi): void {
    const s = iz.sira;
    if (!s) return;
    iz.sira = null;
    if (s.zamanlayici) clearTimeout(s.zamanlayici);
    this.b.yaziyor(s.ajanId, iz.projeId, iz.kanal, false);
  }

  private zamanla(sira: Sira, ms: number, is: () => void): void {
    if (sira.zamanlayici) clearTimeout(sira.zamanlayici);
    sira.zamanlayici = setTimeout(() => {
      try {
        is();
      } catch {
        // proje silinmiş ya da ArnOrg kapanıyor olabilir
      }
    }, ms);
    sira.zamanlayici.unref?.();
  }

  private metin(iz: KanalIzi, k: Kanal, kurul: boolean): string {
    const adlar = uyelerOf(k)
      .map((id) => this.b.ajan(id)?.ad)
      .filter((x): x is string => Boolean(x));
    const son = this.b
      .mesajlar(iz.projeId, iz.kanal, SON_MESAJ + 5)
      .filter((m) => m.gonderenId !== ARNORG_GONDEREN)
      .slice(-SON_MESAJ);
    // 0.0.8: geçmişte eklerin yalnız adları; yanıt verilen en son mesajın ekleri (yolları, görselleri) metnin sonunda
    const mesajlar = son.map((m) => ({ ad: m.gonderenAd, metin: `${ekAdlari(m.ekler)}${m.metin}` }));
    return uyandirmaMetni({ kanal: iz.kanal, konu: k.konu ?? null, uyeler: adlar, mesajlar, kurul, suruyor: k.konusma === "suruyor" }) + ekMetni(son.at(-1)?.ekler);
  }
}

function anahtar(projeId: string, kanal: string): string {
  return `${projeId}\n${kanal}`;
}
