// Sahne efektlerinin yaşam döngüsü ve bütçesi: kutlama kâğıtları, vurgu halkaları, ışık izleri, oda flaşları.
// Her efektin bir bitişi ve ağırlığı (parçacık sayısı) vardır; süresi dolan efekt havuzdan atılır ve öğesi kaldırılır.
// Bütçe karakter sayısı arttıkça ve düşük güçte küçülür: kalabalık ofiste ya da yavaş makinede süs azalır, iş
// görünür kalır. Saf mantık; DOM'u yalnız verilen atma işleviyle bilir.

export type EfektTuru = "konfeti" | "halka" | "iz" | "flas" | "kivilcim";

export interface Efekt<T> {
  id: number;
  tur: EfektTuru;
  bas: number;
  bitis: number;
  /** Bütçeden düşülen pay (parçacık sayısı) */
  agirlik: number;
  veri: T;
  /** Her karede ilerleme (0-1) ile çağrılır; yoksa efekt kendi kendine (CSS ile) oynar */
  adim?: (u: number) => void;
}

/** Karakter sayısına ve güce göre aynı anda oynayabilecek parçacık bütçesi */
export function efektButcesi(kisiSayisi: number, dusukGuc = false): number {
  const taban = Math.max(48, 180 - Math.max(0, kisiSayisi) * 6);
  return dusukGuc ? Math.round(taban / 3) : taban;
}

export class EfektHavuzu<T> {
  /** Aynı anda en çok bu kadar ağırlık */
  butce: number;
  private liste: Efekt<T>[] = [];
  private no = 0;
  private at: (e: Efekt<T>) => void;

  constructor(at: (e: Efekt<T>) => void, butce = efektButcesi(0)) {
    this.at = at;
    this.butce = butce;
  }

  get sayi(): number {
    return this.liste.length;
  }

  /** Oynayan efektlerin toplam ağırlığı */
  get yuk(): number {
    let t = 0;
    for (const e of this.liste) t += e.agirlik;
    return t;
  }

  /** Bütçede kalan pay */
  kalan(): number {
    return Math.max(0, this.butce - this.yuk);
  }

  /**
   * Efekti ekler; bütçe yetmezse eklemez (null) ve verisini hemen atar. Ağırlığı sıfır olan efekt (halka, flaş)
   * her zaman eklenir: olayın kendisini gösterir, süs değildir.
   */
  ekle(e: { tur: EfektTuru; simdi: number; sure: number; agirlik?: number; veri: T; adim?: (u: number) => void }): Efekt<T> | null {
    const agirlik = Math.max(0, e.agirlik ?? 0);
    const kayit: Efekt<T> = { id: ++this.no, tur: e.tur, bas: e.simdi, bitis: e.simdi + Math.max(0, e.sure), agirlik, veri: e.veri, adim: e.adim };
    if (agirlik > 0 && agirlik > this.kalan()) {
      this.at(kayit);
      return null;
    }
    this.liste.push(kayit);
    return kayit;
  }

  /** Süresi dolanları atar, kalanları ilerletir; atılan sayısını döner */
  ilerlet(simdi: number): number {
    let atilan = 0;
    const kalan: Efekt<T>[] = [];
    for (const e of this.liste) {
      if (simdi >= e.bitis) {
        this.at(e);
        atilan++;
        continue;
      }
      if (e.adim) e.adim(Math.min(1, Math.max(0, (simdi - e.bas) / Math.max(1, e.bitis - e.bas))));
      kalan.push(e);
    }
    this.liste = kalan;
    return atilan;
  }

  /** Hepsini atar (sahne söküldü ya da hareket azaltıldı) */
  temizle(): void {
    for (const e of this.liste.splice(0)) this.at(e);
  }
}

export interface KonfetiParcasi {
  /** Yatay savrulma ve yükselme, düşüş (piksel) */
  dx: number;
  yukari: number;
  asagi: number;
  /** Dönüş (derece) */
  don: number;
  /** 0: mercan, 1: kemik */
  renk: 0 | 1;
  gecikme: number;
  /** Parçanın en/boy oranı: ince şerit ya da kare */
  serit: boolean;
}

/** Kutlama kâğıtları: mercan ve kemik, yukarı savrulup düşer; rastgele kaynağı verilebilir (test) */
export function konfeti(sayi: number, rastgele: () => number = Math.random): KonfetiParcasi[] {
  const n = Math.max(0, Math.floor(sayi));
  return Array.from({ length: n }, (_, i) => {
    const aci = (i / Math.max(1, n)) * Math.PI * 2 + rastgele() * 0.6;
    const guc = 18 + rastgele() * 26;
    return {
      dx: Math.round(Math.cos(aci) * guc),
      yukari: Math.round(26 + rastgele() * 30),
      asagi: Math.round(18 + rastgele() * 34),
      don: Math.round((rastgele() - 0.5) * 720),
      renk: (i % 2) as 0 | 1,
      gecikme: Math.round(rastgele() * 90),
      serit: rastgele() < 0.55,
    };
  });
}

/** İkinci derece Bézier üzerindeki nokta (ışık izi ve uçan zarf) */
export function egriNoktasi(a: { x: number; y: number }, k: { x: number; y: number }, b: { x: number; y: number }, u: number) {
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * k.x + u * u * b.x, y: v * v * a.y + 2 * v * u * k.y + u * u * b.y };
}

/** İki nokta arasındaki yayın kontrol noktası: ortanın üstünde, uzaklıkla yükselir */
export function yayKontrolu(a: { x: number; y: number }, b: { x: number; y: number }) {
  const uz = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - Math.min(160, 30 + uz * 0.28) };
}
