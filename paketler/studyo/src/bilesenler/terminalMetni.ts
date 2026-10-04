// Terminal çıktısını okunur düz metne çevirir (Test paneli canlı çıktısı için).
// Renk ve imleç kodları ayıklanır; \r satır başına döner (ilerleme çubukları üzerine yazar), \b bir geri gider,
// ekranı temizleme kodu tamponu boşaltır. Parçalar arasında bölünen kaçış dizileri ve \r\n doğru birleşir.

const ESC = "\x1b";

/** Kaçış dizisinin bittiği yerin bir sonrası; dizi henüz tamamlanmadıysa -1 */
function kacisSonu(metin: string, bas: number): number {
  const ikinci = metin[bas + 1];
  if (ikinci === undefined) return -1;
  // CSI: ESC [ parametreler (0x30–0x3F) ara baytlar (0x20–0x2F) son bayt (0x40–0x7E)
  if (ikinci === "[") {
    for (let i = bas + 2; i < metin.length; i++) {
      const k = metin.charCodeAt(i);
      if (k >= 0x40 && k <= 0x7e) return i + 1;
      if (k >= 0x20 && k <= 0x3f) continue;
      // Geçersiz dizi: buraya kadarı atılır, kalan metin olduğu gibi işlenir
      return i;
    }
    return -1;
  }
  // OSC, DCS, SOS, PM, APC: BEL ya da ST (ESC \) ile biter
  if ("]PX^_".includes(ikinci)) {
    for (let i = bas + 2; i < metin.length; i++) {
      if (metin[i] === "\x07") return i + 1;
      if (metin[i] === ESC) {
        if (metin[i + 1] === undefined) return -1;
        if (metin[i + 1] === "\\") return i + 2;
      }
    }
    return -1;
  }
  // Karakter kümesi seçimi: ESC ( B gibi üç bayt
  if ("()*+".includes(ikinci)) return metin.length > bas + 2 ? bas + 3 : -1;
  // Diğerleri iki bayt: ESC c, ESC 7, ESC =, ESC M…
  return bas + 2;
}

export class TerminalMetni {
  private satirlar: string[] = [];
  private satir = "";
  private imlec = 0;
  /** Parça sonunda yarım kalan kaçış dizisi ya da \r (ardından \n gelebilir) */
  private bekleyen = "";

  /** sinir: tutulan en çok satır; eskiler baştan atılır */
  constructor(private readonly sinir = 2000) {}

  ekle(parca: string): void {
    const metin = this.bekleyen + parca;
    this.bekleyen = "";
    let i = 0;
    while (i < metin.length) {
      const c = metin[i]!;
      if (c === ESC) {
        const son = kacisSonu(metin, i);
        if (son === -1) {
          this.bekleyen = metin.slice(i);
          return;
        }
        this.kacisUygula(metin.slice(i, son));
        i = son;
        continue;
      }
      if (c === "\n") {
        this.satirBitir();
        i += 1;
        continue;
      }
      if (c === "\r") {
        if (i + 1 === metin.length) {
          this.bekleyen = "\r";
          return;
        }
        if (metin[i + 1] === "\n") {
          this.satirBitir();
          i += 2;
          continue;
        }
        this.imlec = 0;
        i += 1;
        continue;
      }
      if (c === "\b") {
        if (this.imlec > 0) this.imlec -= 1;
        i += 1;
        continue;
      }
      if (c === "\t") {
        const bosluk = 8 - (this.imlec % 8);
        for (let j = 0; j < bosluk; j++) this.yaz(" ");
        i += 1;
        continue;
      }
      // Zil ve diğer denetim karakterleri görünmez
      if (c < " " || c === "\x7f") {
        i += 1;
        continue;
      }
      this.yaz(c);
      i += 1;
    }
  }

  /** Görünen metin; satırlar \n ile ayrılır, son satır henüz bitmemiş olabilir */
  metin(): string {
    return this.satirlar.length ? `${this.satirlar.join("\n")}\n${this.satir}` : this.satir;
  }

  bosMu(): boolean {
    return !this.satirlar.length && !this.satir;
  }

  temizle(): void {
    this.satirlar = [];
    this.satir = "";
    this.imlec = 0;
  }

  private yaz(c: string) {
    if (this.imlec >= this.satir.length) {
      this.satir += " ".repeat(this.imlec - this.satir.length) + c;
    } else {
      this.satir = this.satir.slice(0, this.imlec) + c + this.satir.slice(this.imlec + 1);
    }
    this.imlec += 1;
  }

  private satirBitir() {
    this.satirlar.push(this.satir.replace(/\s+$/, ""));
    if (this.satirlar.length > this.sinir) this.satirlar.splice(0, this.satirlar.length - this.sinir);
    this.satir = "";
    this.imlec = 0;
  }

  private kacisUygula(dizi: string) {
    // Ekranı temizle (ESC [2J, ESC [3J) ve terminali sıfırla (ESC c)
    if (/^\x1b\[[23]J$/.test(dizi) || dizi === "\x1bc") {
      this.temizle();
      return;
    }
    // Satırı sil: K imleçten sona, 1K baştan imlece, 2K bütün satır
    const sil = /^\x1b\[([012]?)K$/.exec(dizi);
    if (sil) {
      const kip = sil[1] || "0";
      if (kip === "0") this.satir = this.satir.slice(0, this.imlec);
      else if (kip === "1") this.satir = " ".repeat(Math.min(this.imlec, this.satir.length)) + this.satir.slice(this.imlec);
      else this.satir = "";
      return;
    }
    // İmleci satır içinde taşı: G sütuna, C ileri, D geri
    const tasi = /^\x1b\[(\d*)([GCD])$/.exec(dizi);
    if (tasi) {
      const n = Number(tasi[1] || "1");
      if (tasi[2] === "G") this.imlec = Math.max(0, n - 1);
      else if (tasi[2] === "C") this.imlec += n;
      else this.imlec = Math.max(0, this.imlec - n);
    }
    // Renk, kalınlık ve diğer kodlar yalnız atılır
  }
}
