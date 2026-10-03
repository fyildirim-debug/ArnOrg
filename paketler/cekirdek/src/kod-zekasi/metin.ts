// Kod zekâsının metin yardımcıları: tanımlayıcı bölme, tam metin dizinine giren metin, sorgu ifadesi, kesit seçimi.
import { createHash } from "node:crypto";
import { aramaMetni } from "../yardimci.js";

export function ozet(metin: string): string {
  return createHash("sha1").update(metin).digest("hex");
}

/**
 * Tanımlayıcıyı sadeleştirilmiş küçük harfli sözcüklerine böler: camelCase, PascalCase, snake_case, kebab-case,
 * kısaltma ve sayı geçişleri. "hafizaAra" → ["hafiza", "ara"], "HTTPSunucusu" → ["http", "sunucusu"], "kod_ara" → ["kod", "ara"]
 */
export function tanimlayiciParcala(ad: string): string[] {
  return ad
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(aramaMetni);
}

const TANIMLAYICI = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

/** Metindeki birden çok parçalı tanımlayıcıların parçaları (tekrarsız) */
export function tanimlayiciParcalari(metin: string, sinir = 4000): string[] {
  const goruldu = new Set<string>();
  const parcalar: string[] = [];
  for (const m of metin.matchAll(TANIMLAYICI)) {
    const ad = m[0];
    if (ad.length < 4 || goruldu.has(ad)) continue;
    goruldu.add(ad);
    const p = tanimlayiciParcala(ad);
    if (p.length < 2) continue;
    for (const s of p) if (s.length >= 2) parcalar.push(s);
    if (parcalar.length >= sinir) break;
  }
  return parcalar;
}

/** Tam metin dizinine giren metin: yol, sembol, kod ve tanımlayıcı parçaları; Türkçe harfler sadeleşir */
export function aramaMetniOlustur(kod: string, yol: string, sembol: string | null): string {
  const yolSozcukleri = yol.split(/[/._-]+/).flatMap(tanimlayiciParcala).join(" ");
  const ek = tanimlayiciParcalari(`${sembol ?? ""} ${kod}`);
  return aramaMetni(`${yol} ${yolSozcukleri}\n${sembol ?? ""}\n${kod}\n${ek.join(" ")}`);
}

/** Kod aramasında anlam taşımayan sözcükler (Türkçe harfleri sadeleştirilmiş); "hata", "error" gibi kodda anlamlı sözcükler kalır */
const DURAK = new Set(
  (
    "ve veya ile icin bu su o bir ne mi mu mi nasil nerede neden niye hangi hangisi gibi daha en de da ki ama ya olarak olan var yok " +
    "sen ben biz siz onu bunu sunu kadar sonra once her hep hic cok az bana sana ona bize size yani sey nedir midir mudur olur olsun " +
    "yapilir yapiyor ediliyor oluyor nereden nereye kim kimin icinde uzerinde arasi tarafindan " +
    "the an of to in is are was be and or for on with it this that how where what which who why does do did can could should would " +
    "from by at as into using use used get set"
  ).split(/\s+/),
);

/** Uzun sözcüğün kısaltılmış öneki: Türkçe ekleri ve İngilizce çekimleri tolere eder ("yonlendiriliyor" → "yonlendi") */
export function onek(sozcuk: string): string | null {
  if (sozcuk.length <= 5) return null;
  return sozcuk.slice(0, Math.min(8, Math.max(4, Math.ceil(sozcuk.length / 2))));
}

export interface SorguTerimleri {
  /** FTS5 MATCH ifadesi; anlamlı sözcük yoksa null */
  ifade: string | null;
  /** Kesit seçimi ve vurgu için sadeleştirilmiş terimler (önekler dahil) */
  terimler: string[];
  /** Sorgunun anlamlı sözcükleri olduğu gibi (sembol adı eşleşmesi için) */
  adlar: string[];
}

/** Doğal dil ya da tanımlayıcı sorgusundan tam metin ifadesi */
export function sorguTerimleri(sorgu: string): SorguTerimleri {
  const terimler: string[] = [];
  const ekle = (t: string | null) => {
    if (t && t.length >= 2 && !terimler.includes(t)) terimler.push(t);
  };
  const adlar: string[] = [];
  for (const m of sorgu.matchAll(TANIMLAYICI)) {
    const ham = m[0];
    const sade = aramaMetni(ham).replace(/[^a-z0-9_$]/g, "");
    if (!sade || DURAK.has(sade)) continue;
    const parcalar = tanimlayiciParcala(ham);
    if (ham.length >= 3 && !adlar.includes(ham)) adlar.push(ham);
    if (parcalar.length > 1) {
      ekle(sade.replace(/[_$]/g, ""));
      for (const p of parcalar) if (!DURAK.has(p)) ekle(p.length > 6 ? onek(p) : p);
    } else {
      ekle(sade);
      ekle(onek(sade));
    }
  }
  const secilen = terimler.slice(0, 20);
  const ifade = secilen.length ? secilen.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ") : null;
  return { ifade, terimler: secilen, adlar };
}

/**
 * Parçadan en çok `enCok` satırlık kesit: sorgu terimlerinin en yoğun geçtiği pencere, ilk isabetin iki satır
 * öncesinden başlar. Terim yoksa ya da hiç geçmiyorsa parçanın ilk anlamlı satırından (yalnız "});" gibi
 * kapanışlar atlanarak) başlar. satirlar dosyanın tüm satırlarıdır; bas ve bit 1 tabanlıdır.
 */
export function kesitSec(satirlar: string[], bas: number, bit: number, terimler: string[], enCok = 20): { kesit: string; kesitBas: number } {
  const ilk = Math.max(1, bas);
  const son = Math.min(satirlar.length, Math.max(ilk, bit));
  const sec = (b: number) => {
    const s = Math.min(son, b + enCok - 1);
    return { kesit: satirlar.slice(b - 1, s).map((x) => (x.length > 400 ? `${x.slice(0, 399)}…` : x)).join("\n"), kesitBas: b };
  };
  let anlamliIlk = ilk;
  while (anlamliIlk < son && !/[\p{L}\p{N}]/u.test(satirlar[anlamliIlk - 1] ?? "")) anlamliIlk++;
  if (son - ilk + 1 <= enCok || !terimler.length) return sec(anlamliIlk);
  const isabet = (satir: string) => {
    const s = aramaMetni(satir);
    let n = 0;
    for (const t of terimler) if (s.includes(t)) n++;
    return n;
  };
  const puanlar = Array.from({ length: son - ilk + 1 }, (_, i) => isabet(satirlar[ilk - 1 + i] ?? ""));
  let toplam = puanlar.slice(0, enCok).reduce((a, b) => a + b, 0);
  let enIyi = toplam;
  let enIyiBas = 0;
  for (let i = 1; i + enCok <= puanlar.length; i++) {
    toplam += puanlar[i + enCok - 1]! - puanlar[i - 1]!;
    if (toplam > enIyi) {
      enIyi = toplam;
      enIyiBas = i;
    }
  }
  if (enIyi <= 0) return sec(anlamliIlk);
  let ilkIsabet = enIyiBas;
  while (ilkIsabet < puanlar.length && puanlar[ilkIsabet] === 0) ilkIsabet++;
  return sec(ilk + Math.min(Math.max(0, ilkIsabet - 2), Math.max(0, puanlar.length - enCok)));
}
