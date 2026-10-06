// Kurulun kurduğu kanallar: ad ve üye doğrulaması, kurma, güncelleme, silme, serbest konuşmanın başlatılıp durdurulması
// ve üyelerin söz sırası. Konuşmanın kuralları kanal-konusmasi.ts'te; Şirket'e ince bir bağlamla bağlanır.
import {
  KANAL_ADI_DESENI,
  KURUL,
  kanalAdiDuzelt,
  sistemKanaliMi,
  type Kanal,
  type KanalGuncelleIstegi,
  type KanalOlusturIstegi,
  type KonusmaIstegi,
  type Mesaj,
  type SunucuOlayi,
} from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import { KanalKonusmasi, type DurmaNedeni, type KonusmaBaglami } from "./kanal-konusmasi.js";
import type { OlayYolu } from "./olaylar.js";
import { ArnorgHatasi, bulunamadi } from "./yardimci.js";

/** Şirket'ten gelenler: uyandırma, yazıyor göstergesi, duyuru, abonelik sınırı, tavan sırası ve kurulun mesajı */
export type SirketBaglami = Pick<KonusmaBaglami, "uyandir" | "yaziyor" | "duyur" | "sinirda" | "butceDolu" | "siradaMi" | "bekleme"> & {
  /** Kurulun kanala yazdığı mesaj (Şirket.mesajGonder) */
  kurulMesaji(projeId: string, kanal: string, metin: string): Promise<Mesaj>;
};

export class OzelKanallar {
  /** Serbest konuşmanın sırası ve zamanlaması */
  readonly konusma: KanalKonusmasi;

  constructor(
    private readonly depo: Depo,
    private readonly olaylar: OlayYolu,
    private readonly s: SirketBaglami,
  ) {
    // Açılışta bütün konuşmalar durur: beklenmedik abonelik harcaması olmasın
    depo.konusmalariDurdur();
    this.konusma = new KanalKonusmasi({
      uyandir: (id, metin, kurul) => s.uyandir(id, metin, kurul),
      yaziyor: (id, pid, kanal, acik) => s.yaziyor(id, pid, kanal, acik),
      duyur: (pid, kanal, metin) => s.duyur(pid, kanal, metin),
      sinirda: () => s.sinirda(),
      butceDolu: (pid) => s.butceDolu?.(pid) ?? false,
      siradaMi: (id) => s.siradaMi(id),
      bekleme: s.bekleme ? () => s.bekleme!() : undefined,
      kanal: (pid, ad) => depo.kanal(pid, ad),
      durumYaz: (pid, ad, alanlar) => {
        depo.kanalGuncelle(pid, ad, alanlar);
        this.yayinla(pid, ad);
      },
      surenKonusmalar: (pid) => this.surenler(pid),
      ajan: (id) => depo.ajan(id),
      mesajlar: (pid, kanal, sinir) => depo.mesajlar(pid, kanal, sinir),
    });
  }

  /** Olay yolundan (Şirket dinler): kanal mesajları, ajan durumu, abonelik sınırı */
  olay(o: SunucuOlayi): void {
    this.konusma.olay(o);
  }

  olustur(projeId: string, istek: KanalOlusturIstegi): Kanal {
    this.projeGerekli(projeId);
    const ad = kanalAdiDuzelt(istek.ad ?? "");
    if (!KANAL_ADI_DESENI.test(ad)) {
      throw new ArnorgHatasi(iki("Kanal adı 1–40 karakter olmalı; yalnız harf, rakam, tire ve alt çizgi.", "Channel names must be 1–40 characters: letters, digits, hyphens and underscores only."));
    }
    // İngilizce görünen adlar (#general, #ceo…) mesaj gönderirken sistem kanalına çevrilir; kurulun kanalı bu adları alamaz
    if (sistemKanaliMi(ad)) throw new ArnorgHatasi(iki(`#${ad} ArnOrg'un kanallarından birine ayrılmış; başka bir ad seçin.`, `#${ad} is reserved for one of ArnOrg's channels; choose another name.`), 409);
    if (this.depo.kanal(projeId, ad)) throw new ArnorgHatasi(iki(`#${ad} adında bir kanal zaten var.`, `There is already a channel named #${ad}.`), 409);
    const kanal = this.depo.ozelKanalEkle({ projeId, ad, aciklama: (istek.aciklama ?? "").trim(), uyeler: this.uyeleriDogrula(projeId, istek.uyeler ?? []) });
    this.olaylar.yayinla({ tur: "kanal.guncellendi", projeId, kanal });
    return kanal;
  }

  guncelle(projeId: string, ad: string, istek: KanalGuncelleIstegi): Kanal {
    const k = this.ozelKanal(projeId, ad);
    const uyeler = istek.uyeler === undefined ? undefined : this.uyeleriDogrula(projeId, istek.uyeler);
    this.depo.kanalGuncelle(projeId, k.ad, { aciklama: istek.aciklama?.trim(), uyeler });
    // Sırası gelen üye çıkarıldıysa sıra bir sonrakine geçer (gerekirse konuşma durur)
    if (uyeler) this.konusma.uyelerDegisti(projeId, k.ad);
    return this.yayinla(projeId, k.ad)!;
  }

  /** Kanalı mesajlarıyla siler; yalnız kurulun kanalı */
  sil(projeId: string, ad: string): void {
    const k = this.ozelKanal(projeId, ad);
    this.konusma.kanalSilindi(projeId, k.ad);
    this.depo.kanalSil(projeId, k.ad);
    this.olaylar.yayinla({ tur: "kanal.silindi", projeId, kanal: k.ad });
  }

  /** Serbest konuşmayı başlatır ya da durdurur; konu verilirse kanala kurulun mesajı olarak yazılır ve ilk konuşmacıyı uyandırır */
  async konusmaIslemi(projeId: string, ad: string, istek: KonusmaIstegi): Promise<Kanal> {
    const k = this.ozelKanal(projeId, ad);
    if (istek.islem === "durdur") {
      this.konusma.durdur(projeId, k.ad, "kurul");
      return this.depo.kanal(projeId, k.ad)!;
    }
    const uygun = (k.uyeler ?? []).filter((id) => this.depo.ajan(id)?.projeId === projeId);
    if (uygun.length < 2) throw new ArnorgHatasi(iki("Serbest konuşma için kanalda en az iki üye olmalı.", "An open conversation needs at least two members in the channel."), 409);
    if (this.s.sinirda()) {
      throw new ArnorgHatasi(iki("Abonelik kullanımı sınırda; konuşmayı pencere açılınca başlatabilirsiniz.", "Subscription usage is at the limit; you can start the conversation when the window opens."), 429);
    }
    if (this.s.butceDolu?.(projeId)) {
      throw new ArnorgHatasi(iki("Proje token bütçesi doldu; konuşmayı bütçeyi artırınca başlatabilirsiniz.", "The project's token budget is used up; you can start the conversation once you raise the budget."), 429);
    }
    const konu = istek.konu?.trim() || null;
    this.konusma.baslat(projeId, k.ad, konu);
    if (konu) await this.s.kurulMesaji(projeId, k.ad, konu);
    return this.depo.kanal(projeId, k.ad)!;
  }

  /**
   * mesajGonder'in doğrudan uyandıracağı anılanlar. Kurulun kanalında kurulun ya da bir üyenin andığı üyeleri konuşma
   * motoru uyandırır (söz sırası; konuşma durmuşsa zincir sürmez); üye olmayanlar ve üye olmayan ajanın andıkları
   * her zamanki gibi uyanır.
   */
  dogrudanUyanacaklar<T extends { id: string }>(projeId: string, kanal: string, gonderenId: string, alicilar: T[]): T[] {
    if (!alicilar.length) return alicilar;
    const k = this.depo.kanal(projeId, kanal);
    if (!k?.ozel) return alicilar;
    const uyeler = k.uyeler ?? [];
    if (gonderenId !== KURUL && !uyeler.includes(gonderenId)) return alicilar;
    return alicilar.filter((a) => !uyeler.includes(a.id));
  }

  /** İşten çıkarılan ajan kurulun kanallarının üyeliğinden düşer */
  uyeAyrildi(projeId: string, ajanId: string): void {
    for (const ad of this.depo.kanalUyesiniCikar(projeId, ajanId)) {
      this.konusma.uyelerDegisti(projeId, ad);
      this.yayinla(projeId, ad);
    }
  }

  /** Mesai durdu (proje verilmezse bütün projeler): süren konuşmalar durur */
  konusmalariDurdur(projeId?: string, neden: DurmaNedeni = "mesai"): void {
    this.konusma.hepsiniDurdur(projeId, neden);
  }

  projeKaldir(projeId: string): void {
    this.konusma.projeKaldir(projeId);
  }

  kapat(): void {
    this.konusma.kapat();
  }

  // ------------------------------------------------------------------

  private projeGerekli(projeId: string): void {
    if (!this.depo.proje(projeId)) throw bulunamadi("Proje", "Project");
  }

  /** Kurulun kanalı; sistem kanalları ve ajanların açtığı kanallar değiştirilemez */
  private ozelKanal(projeId: string, ad: string): Kanal {
    this.projeGerekli(projeId);
    const k = this.depo.kanal(projeId, ad);
    if (!k) throw bulunamadi("Kanal", "Channel");
    if (!k.ozel) {
      throw new ArnorgHatasi(
        iki("Yalnız kurulun kurduğu kanallar düzenlenip silinebilir; ArnOrg'un ve ajanların kanalları olduğu gibi kalır.", "Only channels the board created can be edited or deleted; ArnOrg's and the agents' channels stay as they are."),
        409,
      );
    }
    return k;
  }

  /** Üyeler bu projenin çalışanları olmalı; yinelenenler bir kez sayılır, sıra korunur */
  private uyeleriDogrula(projeId: string, uyeler: string[]): string[] {
    const temiz = [...new Set(uyeler.map((u) => u.trim()).filter(Boolean))];
    if (!temiz.length) throw new ArnorgHatasi(iki("Kanala en az bir üye seçin.", "Choose at least one member for the channel."));
    for (const id of temiz) {
      if (this.depo.ajan(id)?.projeId !== projeId) throw new ArnorgHatasi(iki("Üyeler bu projenin çalışanlarından seçilmeli.", "Members must be employees of this project."));
    }
    return temiz;
  }

  private surenler(projeId?: string): { projeId: string; kanal: string }[] {
    const projeler = projeId ? [projeId] : this.depo.projeler().map((p) => p.id);
    return projeler.flatMap((pid) =>
      this.depo
        .kanallar(pid)
        .filter((k) => k.ozel && k.konusma === "suruyor")
        .map((k) => ({ projeId: pid, kanal: k.ad })),
    );
  }

  /** Kanalın son hâlini Stüdyo'ya yayınlar */
  private yayinla(projeId: string, ad: string): Kanal | null {
    const kanal = this.depo.kanal(projeId, ad);
    if (kanal) this.olaylar.yayinla({ tur: "kanal.guncellendi", projeId, kanal });
    return kanal;
  }
}
