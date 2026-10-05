// Eşzamanlı ajan tavanı: aynı anda tur işleyen ajan sayısı bütün projelerde sınırlıdır. Tavan doluyken turu sürmeyen
// ajana gelen mesaj sıraya girer (FIFO; aynı ajanın mesajları geliş sırasıyla teslim edilir); bir ajan çalışan durumdan
// çıkınca sıradakiler tavan izin verdikçe teslim edilir. 0.0.8: ajanın projesinin de tavanı olabilir (tam otonom kipte
// CEO'nun ekip temposu); temposu dolan projenin sıradakileri bekler, başka projelerinkiler önlerinden geçebilir.
// Oturumdan bağımsızdır: durum, sayım ve teslim bağlamdan gelir, böylece Claude Code oturumu açmadan test edilir.
import type { AjanDurumu, MesajOnceligi } from "@arnorg/ortak";
import { iki } from "./dil.js";

/** Tavana sayılan durumlar: turu süren ya da kurul kararı bekleyen ajan */
export function calisanMi(durum: AjanDurumu | null | undefined): boolean {
  return durum === "calisiyor" || durum === "karar_bekliyor";
}

/** Ayardaki tavan: pozitif tam sayı; 0, eksi ya da geçersiz değer sınırsız demektir (0 döner) */
export function tavanDegeri(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
  return n > 0 ? n : 0;
}

/** Sıradaki ajanın iş açıklaması (geçerli dilde) */
export function siraAciklamasi(tavan: number): string {
  return iki(`Sırada: aynı anda en çok ${tavan} ajan çalışır`, `Queued: at most ${tavan} ${tavan === 1 ? "agent works" : "agents work"} at the same time`);
}

/** İş açıklaması sıra metni mi (dil değişmiş olsa da) */
export function siraAciklamasiMi(metin: string | null | undefined): boolean {
  return /^(Sırada|Queued): /.test(metin ?? "");
}

export interface SiradakiMesaj<K = unknown> {
  ajanId: string;
  metin: string;
  oncelik: MesajOnceligi;
  kaynak: K;
}

export interface EsZamanlilikBaglami<K> {
  /** Ayardaki tavan; 0 sınırsız */
  tavan(): number;
  /** Ajanın şu anki durumu; ajan yoksa (silinmiş) null */
  durum(ajanId: string): AjanDurumu | null;
  /** Bütün projelerde çalışan ajan sayısı */
  calisanSayisi(): number;
  /** Ajanın projesinin tavanı (ekip temposu); 0 ya da verilmezse yalnız genel tavan */
  projeTavani?(ajanId: string): number;
  /** Ajanın projesinde tempoya sayılan çalışan sayısı */
  projeCalisani?(ajanId: string): number;
  /** Ajanın projesi (proje içinde FIFO korunur); verilmezse bütün ajanlar tek proje sayılır */
  proje?(ajanId: string): string | null;
  /** Ajanın mesajlarını geliş sırasıyla teslim eder; eşzamanlı kısmı ajanı çalışan duruma alır (tavanda yer tutar) */
  teslimEt(ajanId: string, mesajlar: SiradakiMesaj<K>[]): void;
  /** Ajan sıraya girdi (iş açıklaması "Sırada…") ya da sırası düştü */
  siraDegisti(ajanId: string, sirada: boolean): void;
  /** Sıranın işlenmesini erteler (varsayılan setImmediate); testlerde eşzamanlı verilebilir */
  zamanla?(is: () => void): void;
}

export class EsZamanlilik<K = unknown> {
  private kuyruk: SiradakiMesaj<K>[] = [];
  private planli = false;
  private yoklayici: NodeJS.Timeout | null = null;

  /** yoklamaMs: sıra doluyken arada bir yeniden bakılır (ayar değişti, kaçan durum geçişi); 0 kapalı */
  constructor(
    private readonly b: EsZamanlilikBaglami<K>,
    private readonly yoklamaMs = 10_000,
  ) {}

  /** Sıradaki mesaj sayısı */
  get uzunluk(): number {
    return this.kuyruk.length;
  }

  siradaMi(ajanId: string): boolean {
    return this.kuyruk.some((m) => m.ajanId === ajanId);
  }

  /** Sıradaki ajanlar, sıra düzeninde (her ajan bir kez) */
  siradakiler(): string[] {
    return [...new Set(this.kuyruk.map((m) => m.ajanId))];
  }

  /**
   * Turu sürmeyen ajana gelen mesaj sıraya girmeli mi? Muaf mesaj (kurul, soru yanıtı) hiç beklemez. Genel tavan ya da
   * ajanın projesinin temposu doluysa, ya da önünde bekleyen varsa (FIFO: yer açılınca önce sıradakiler gider) sıraya
   * girer. Başka projenin kendi temposu yüzünden bekleyeni önünde sayılmaz.
   */
  siraGerekli(muaf: boolean, ajanId?: string): boolean {
    if (muaf) return false;
    const tavan = tavanDegeri(this.b.tavan());
    const pt = ajanId ? this.projeTavani(ajanId) : 0;
    if (!tavan && !pt) return false;
    if (tavan && this.b.calisanSayisi() >= tavan) return true;
    if (pt && this.projeCalisani(ajanId!) >= pt) return true;
    const proje = ajanId ? this.projesi(ajanId) : null;
    return this.kuyruk.some((m) => (proje !== null && this.projesi(m.ajanId) === proje) || (tavan > 0 && !this.projeDolu(m.ajanId)));
  }

  private projeTavani(ajanId: string): number {
    return tavanDegeri(this.b.projeTavani?.(ajanId) ?? 0);
  }

  private projeCalisani(ajanId: string): number {
    return this.b.projeCalisani?.(ajanId) ?? 0;
  }

  private projesi(ajanId: string): string | null {
    return this.b.proje ? this.b.proje(ajanId) : "";
  }

  /** Ajanın projesinin temposu dolu mu (tavanı yoksa hiç dolmaz) */
  private projeDolu(ajanId: string): boolean {
    const pt = this.projeTavani(ajanId);
    return pt > 0 && this.projeCalisani(ajanId) >= pt;
  }

  ekle(m: SiradakiMesaj<K>): void {
    const yeni = !this.siradaMi(m.ajanId);
    this.kuyruk.push(m);
    if (yeni) this.b.siraDegisti(m.ajanId, true);
    this.yoklamaBaslat();
  }

  /** Ajanın sıradaki mesajlarını geliş sırasıyla sıradan alır; doğrudan teslimde bunlar yeni mesajdan önce gider */
  ajaninkileriAl(ajanId: string): SiradakiMesaj<K>[] {
    const alinan = this.kuyruk.filter((m) => m.ajanId === ajanId);
    if (alinan.length) this.kuyruk = this.kuyruk.filter((m) => m.ajanId !== ajanId);
    if (!this.kuyruk.length) this.yoklamaDurdur();
    return alinan;
  }

  /** Sıradan düşürür (kurul durdurdu, mesai durdu); düşen ajanlar */
  dusur(secici: (ajanId: string) => boolean): string[] {
    const dusen = this.siradakiler().filter(secici);
    for (const id of dusen) {
      this.ajaninkileriAl(id);
      this.b.siraDegisti(id, false);
    }
    return dusen;
  }

  /**
   * Durum değişti: çalışan durumdan çıkan ajan tavanda yer açmıştır; sıradaki bir ajan kendiliğinden çalışmaya
   * başladıysa (oturumu açık ajanın arka plan işi) mesajları yer tutmadan gider. İkisinde de sıra işlenir.
   */
  durumDegisti(ajanId: string, onceki: AjanDurumu, yeni: AjanDurumu): void {
    if (!this.kuyruk.length) return;
    if ((calisanMi(onceki) && !calisanMi(yeni)) || (calisanMi(yeni) && this.siradaMi(ajanId))) this.planla();
  }

  /** Sıranın işlenmesini bir sonraki döngüye erteler; art arda gelen durum değişiklikleri tek işlemde toplanır */
  planla(): void {
    if (this.planli) return;
    this.planli = true;
    (this.b.zamanla ?? setImmediate)(() => {
      this.planli = false;
      this.isle();
    });
  }

  /** Tavan izin verdikçe sıradakileri geliş sırasıyla teslim eder; teslim edilen ajanlar */
  isle(): string[] {
    const teslim: string[] = [];
    // Silinen ajanın mesajları düşer; kendiliğinden çalışmaya başlamış ajanın mesajları tavanda yer tutmadan gider
    for (const id of this.siradakiler()) {
      const d = this.b.durum(id);
      if (d === null) this.ajaninkileriAl(id);
      else if (calisanMi(d)) this.gonder(id, teslim);
    }
    const tavan = tavanDegeri(this.b.tavan());
    let calisan = this.b.calisanSayisi();
    /** Proje → bu turda teslim edilen; projenin çalışanı turun başındaki sayıya eklenerek bakılır */
    const projeTeslim = new Map<string, { baslangic: number; ek: number }>();
    for (const id of this.siradakiler()) {
      if (tavan && calisan >= tavan) break;
      const pt = this.projeTavani(id);
      if (pt) {
        const anahtar = this.projesi(id) ?? id;
        const p = projeTeslim.get(anahtar) ?? { baslangic: this.projeCalisani(id), ek: 0 };
        projeTeslim.set(anahtar, p);
        // Temposu dolu proje bekler; sıradaki başka projeler geçebilir
        if (p.baslangic + p.ek >= pt) continue;
        p.ek++;
      }
      this.gonder(id, teslim);
      // Teslim ajanı hemen çalışan duruma alır; alamadıysa (hata) yine de bir yer sayılır, sonraki yoklamada düzelir
      calisan = Math.max(calisan + 1, this.b.calisanSayisi());
    }
    return teslim;
  }

  /** Kapanış: yoklama durur (sıradakileri açılışta mesaiye dönüş uyandırır) */
  kapat(): void {
    this.yoklamaDurdur();
  }

  private gonder(ajanId: string, teslim: string[]): void {
    const mesajlar = this.ajaninkileriAl(ajanId);
    if (!mesajlar.length) return;
    teslim.push(ajanId);
    try {
      this.b.teslimEt(ajanId, mesajlar);
    } catch {
      // Teslim hatasını bağlam bildirir; sıra işlemeyi sürdürür
    }
    // Ajan başlamadıysa (abonelik sınırında bekletildi, hata) "Sırada" açıklaması kalmaz
    if (!calisanMi(this.b.durum(ajanId)) && !this.siradaMi(ajanId)) this.b.siraDegisti(ajanId, false);
  }

  private yoklamaBaslat(): void {
    if (this.yoklayici || !this.yoklamaMs) return;
    this.yoklayici = setInterval(() => this.isle(), this.yoklamaMs);
    this.yoklayici.unref();
  }

  private yoklamaDurdur(): void {
    if (this.yoklayici) clearInterval(this.yoklayici);
    this.yoklayici = null;
  }
}
