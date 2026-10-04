// Ortam: yerel saate göre gün ışığı ve döngünün güç durumu. Saf işlevler; motor sonucu CSS değişkenlerine yazar.

export interface GunIsigi {
  /** 0 gündüz, 1 gece: sahnenin kararması ve lambaların parlaklığı */
  gece: number;
  /** 0-1: alacakaranlığın ılık tonu (akşamüstü ve şafak) */
  ilik: number;
}

const yumusak = (u: number) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

/**
 * Saat (0-24, ondalıklı) → gün ışığı. 07:30-17:00 gündüz, 17:00-20:30 akşam (ılık, yavaş kararır),
 * 20:30-05:30 gece, 05:30-07:30 şafak.
 */
export function gunIsigi(saat: number): GunIsigi {
  const s = ((saat % 24) + 24) % 24;
  if (s >= 7.5 && s < 17) return { gece: 0, ilik: 0 };
  if (s >= 17 && s < 20.5) {
    const u = (s - 17) / 3.5;
    return { gece: yumusak(u), ilik: Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.9 };
  }
  if (s >= 5.5 && s < 7.5) {
    const u = (s - 5.5) / 2;
    return { gece: 1 - yumusak(u), ilik: Math.sin(u * Math.PI) * 0.7 };
  }
  return { gece: 1, ilik: 0 };
}

/**
 * Kare ölçer: son karelerin süresinin hareketli ortalaması. Ortalama 3 sn boyunca 24 ms'yi aşarsa (40 fps altı)
 * düşük güce geçilir; geri dönüş için 18 ms'nin altında bir dakika gerekir (düşük güçte iş yarıya indiği için
 * kareler hızlanır; kısa bir hızlanma kipi yeniden açıp kapatmasın). Gizli sekmeden dönüşteki uzun kare sayılmaz.
 */
export class KareOlcer {
  ortalama = 16.7;
  dusukGuc = false;
  private yavasSure = 0;
  private hizliSure = 0;

  /** Kare süresini ekler; güç durumu değiştiyse true */
  ekle(dt: number): boolean {
    if (!(dt > 0) || dt > 250) return false;
    this.ortalama += (dt - this.ortalama) * 0.06;
    if (!this.dusukGuc) {
      this.yavasSure = this.ortalama > 24 ? this.yavasSure + dt : 0;
      if (this.yavasSure > 3000) {
        this.dusukGuc = true;
        this.yavasSure = 0;
        this.hizliSure = 0;
        return true;
      }
    } else {
      this.hizliSure = this.ortalama < 18 ? this.hizliSure + dt : 0;
      if (this.hizliSure > 60000) {
        this.dusukGuc = false;
        this.hizliSure = 0;
        return true;
      }
    }
    return false;
  }
}
