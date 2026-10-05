// Ofisin 0.0.8 canlılığı: gerçek olaylara bağlı, sakin davranışların saf mantığı. Motor (motor.ts) sonucu sahneye
// çevirir; burada DOM yoktur.
//
//   Yazma temposu: her araç çağrısı ölçüye bir pay ekler, ölçü yarı ömürle söner. Masadaki yazma kıpırtısı ve
//   monitörün titreşimi bu ölçünün düzeyiyle (0-3) hızlanır ya da sakinleşir.
//   Mola: boştaki çalışan masasında oturur; uzun bir boşluktan sonra kısa bir molaya çıkar (kahve, su, sevdiği köşe
//   ya da kanepe) ve masasına döner. Molanın yeri karakterin kişiliğinden; çok uzun boşlukta kanepede kısa şekerleme.
//   Karar bekleme: çalışanın beklediği kararı kim verecek. Tam otonomda CEO'ya yönelen onayda çalışan CEO'nun
//   yanında, kurula yönelende kurul masasında bekler.
//   Soru: ajana_sor ile soran, yanıtı bir süre sorulanın yanında bekler; gelmezse masasına döner.
import type { OfisYeri } from "@arnorg/ortak/karakterler";

// ---------------------------------------------------------------------------
// Yazma temposu
// ---------------------------------------------------------------------------

/** Üstel sönen etkinlik ölçüsü (0-1) ve son güncellendiği an */
export interface Tempo {
  deger: number;
  an: number;
}

/** Bu kadar sürede yeni iş gelmezse ölçü yarıya iner */
export const TEMPO_YARI_OMUR = 7000;
/** Model metni yazıyor (asistan çıktısı): yazmaya yakın, araçtan hafif */
export const METIN_PAYI = 0.16;

export type TempoDuzeyi = 0 | 1 | 2 | 3;

export function yeniTempo(an = 0): Tempo {
  return { deger: 0, an };
}

/** O andaki (sönmüş) ölçü */
export function tempoOku(t: Tempo, an: number): number {
  const gecen = Math.max(0, an - t.an);
  return t.deger * 0.5 ** (gecen / TEMPO_YARI_OMUR);
}

/** Yeni iş: pay eklenir, ölçü 1'de doyar */
export function tempoEkle(t: Tempo, pay: number, an: number): Tempo {
  return { deger: Math.min(1, tempoOku(t, an) + Math.max(0, pay)), an };
}

/** Ölçünün düzeyi: 0 durgun, 1 sakin, 2 yoğun, 3 çok yoğun */
export function tempoDuzeyi(deger: number): TempoDuzeyi {
  if (deger < 0.08) return 0;
  if (deger < 0.3) return 1;
  if (deger < 0.62) return 2;
  return 3;
}

/** Aracın tempoya payı: dosya yazmak en çok, komut orta, okuma ve arama az */
export function aracPayi(arac: string | undefined): number {
  if (!arac) return 0.1;
  if (/^(?:Edit|Write|MultiEdit|NotebookEdit)$/.test(arac)) return 0.34;
  if (/^(?:Bash|PowerShell|BashOutput)$/.test(arac)) return 0.2;
  if (/^(?:Read|Grep|Glob|LS)$/.test(arac)) return 0.12;
  if (arac.startsWith("mcp__")) return 0.14;
  return 0.1;
}

/** Masada yazarken klavye kıpırtısı: vuruş sıklığı (radyan/ms) ve genliği (piksel); tempo arttıkça sıklaşır */
export function yazmaKipirtisi(duzey: TempoDuzeyi): { siklik: number; genlik: number } {
  return [
    { siklik: 0.032, genlik: 0.6 },
    { siklik: 0.038, genlik: 0.75 },
    { siklik: 0.046, genlik: 0.9 },
    { siklik: 0.058, genlik: 1.15 },
  ][duzey]!;
}

/** Bir yazma işinin monitörü titrettiği süre: tempo yüksekse yazma neredeyse kesintisiz sürer */
export function yazmaSuresi(duzey: TempoDuzeyi): number {
  return 2000 + duzey * 900;
}

// ---------------------------------------------------------------------------
// Mola
// ---------------------------------------------------------------------------

export type MolaTuru = "kahve" | "su" | "sevdigi" | "kanepe" | "sekerleme";

export interface Mola {
  tur: MolaTuru;
  /** Varınca orada geçen süre (ms; yürüyüş hariç) */
  sure: number;
}

/** İşi biten çalışanın ilk molası bu aralıkta (ms): önce masasında oturur */
export const ILK_MOLA: readonly [number, number] = [40_000, 80_000];
/** Sonraki molalar arasındaki masa süresi */
export const MOLA_ARASI: readonly [number, number] = [100_000, 200_000];
/** Ekran açılırken masasında bulunan boştaki çalışan: uzun boşluk çoktan geçmiş olabilir, ilk molası yakın */
export const ACILIS_MOLASI: readonly [number, number] = [12_000, 70_000];
/** Bu kadar uzun boşluktan sonra mola ara sıra kanepede kısa bir şekerlemedir */
export const SEKERLEME_ESIGI = 8 * 60_000;

const SURELER: Record<MolaTuru, readonly [number, number]> = {
  kahve: [9000, 15_000],
  su: [5000, 8000],
  sevdigi: [8000, 14_000],
  kanepe: [8000, 14_000],
  sekerleme: [30_000, 55_000],
};

const aradan = (a: readonly [number, number], r: () => number) => Math.round(a[0] + r() * (a[1] - a[0]));

/** Masada geçecek süre: işi yeni biten için ilk mola, sonrakiler daha seyrek, ekran açılırken yakın */
export function molaGecikmesi(kip: "ilk" | "sonraki" | "acilis", rastgele: () => number = Math.random): number {
  return aradan(kip === "ilk" ? ILK_MOLA : kip === "acilis" ? ACILIS_MOLASI : MOLA_ARASI, rastgele);
}

/**
 * Molanın yeri ve süresi: kişiliğin sevdiği yere göre ağırlıklı seçim (kahve sever çoğunlukla kahveye, kitap sever
 * kendi köşesine). bosta: kesintisiz boşta geçen süre; çok uzunsa mola ara sıra kanepede şekerleme olur.
 */
export function molaSec(sevdigi: OfisYeri | undefined, bosta: number, rastgele: () => number = Math.random): Mola {
  if (bosta >= SEKERLEME_ESIGI && rastgele() < 0.35) return { tur: "sekerleme", sure: aradan(SURELER.sekerleme, rastgele) };
  const agirliklar = molaAgirliklari(sevdigi);
  const toplam = agirliklar.reduce((t, [, a]) => t + a, 0);
  let zar = rastgele() * toplam;
  let tur: MolaTuru = agirliklar[0]![0];
  for (const [t, a] of agirliklar) {
    if (zar < a) {
      tur = t;
      break;
    }
    zar -= a;
  }
  return { tur, sure: aradan(SURELER[tur], rastgele) };
}

/** Kişiliğe göre mola ağırlıkları (toplamı 100) */
export function molaAgirliklari(sevdigi: OfisYeri | undefined): [MolaTuru, number][] {
  switch (sevdigi) {
    case "kahve":
    case "otomat":
      return [
        ["kahve", 65],
        ["su", 15],
        ["kanepe", 20],
      ];
    case "su":
      return [
        ["su", 60],
        ["kahve", 25],
        ["kanepe", 15],
      ];
    case "kanepe":
    case "masa-tenisi":
      return [
        ["kanepe", 55],
        ["kahve", 30],
        ["su", 15],
      ];
    case "kitaplik":
    case "sunucu":
    case "beyaz-tahta":
    case "bitki":
    case "pencere":
      return [
        ["sevdigi", 55],
        ["kahve", 30],
        ["su", 15],
      ];
    default:
      return [
        ["kahve", 50],
        ["su", 25],
        ["kanepe", 25],
      ];
  }
}

// ---------------------------------------------------------------------------
// Karar bekleme ve soru
// ---------------------------------------------------------------------------

export type KararMuhatabi = "ceo" | "kurul";

interface BekleyenOnay {
  ajanId: string | null;
  durum: string;
  muhatap?: string | null;
}

/**
 * Çalışanın beklediği kararı kim verecek: bekleyen onaylarından biri kurula yöneldiyse (ya da muhatabı yoksa, 0.0.7
 * öncesi) kurul; hepsi CEO'ya yöneldiyse CEO. Bekleyen onayı görünmüyorsa kurul (kurula soru gibi).
 */
export function kararMuhatabi(onaylar: readonly BekleyenOnay[], ajanId: string): KararMuhatabi {
  const bekleyen = onaylar.filter((o) => o.ajanId === ajanId && o.durum === "bekliyor");
  if (!bekleyen.length) return "kurul";
  return bekleyen.every((o) => o.muhatap === "ceo") ? "ceo" : "kurul";
}

/** Soran, yanıtı en çok bu kadar sorulanın yanında bekler; gelmezse masasına döner (yanıt gelince ışık iziyle ulaşır) */
export const YANINDA_BEKLEME = 16_000;
