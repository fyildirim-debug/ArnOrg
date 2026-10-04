// Kanal ve sohbet mesajlarındaki hafif biçimi çözen saf işlevler (ZenginMetin ve ZenginBlok bunları çizer).
// Satır içi: `kod`, [metin](https://…), **kalın**, http(s):// ve www. adresleri, @anma, T-12 görev kodu.
// Blok: başlık, madde ve sıralı liste, ``` kod bloğu, paragraf. Kod içindeki adresler bağlantıya çevrilmez.

export type ZenginParca =
  | { tur: "metin"; metin: string }
  | { tur: "kod"; metin: string }
  | { tur: "kalin"; metin: string }
  | { tur: "baglanti"; metin: string; adres: string }
  | { tur: "anma"; metin: string }
  | { tur: "gorev"; kod: string };

/** Adreste bulunabilen karakterler: boşluk, açılı ayraç, tırnak, ters tırnak ve yıldız adresi bitirir
 * (Türkçe ek kesme işaretiyle başlar: "ornek.com'a" → ornek.com) */
const ADRES_KARAKTERI = "[^\\s<>\"'`*’‘“”«»]";
/** Markdown bağlantısının adresi; tek düzey dengeli ayraç içerebilir (…/Ankara_(il)) */
const MD_ADRES = "https?:\\/\\/[^\\s()<>]+(?:\\([^\\s()<>]*\\)[^\\s()<>]*)*";

// Sıra önemli: aynı yerden başlayan eşleşmelerde önce yazılan seçenek kazanır.
// Satır içi kod en önde: içindeki adres, anma ve görev kodu düz kalır.
const DESEN = new RegExp(
  [
    "(`[^`\\n]+`)", // 1: satır içi kod
    `\\[([^\\]\\n]+)\\]\\((${MD_ADRES})\\)`, // 2: bağlantı metni, 3: adresi
    "(\\*\\*[^*\\n]+\\*\\*)", // 4: kalın
    `((?<![\\p{L}\\p{N}_.@/-])(?:https?:\\/\\/|www\\.)${ADRES_KARAKTERI}+)`, // 5: çıplak adres
    "(@[\\p{L}\\p{N}_-]+)", // 6: anma
    "(\\bT-\\d+\\b)", // 7: görev kodu
  ].join("|"),
  "gu",
);

function say(metin: string, karakter: string): number {
  let n = 0;
  for (const c of metin) if (c === karakter) n += 1;
  return n;
}

/** Cümle sonundaki noktalama adrese katılmaz; kapanan ayraç yalnız adreste açılmadıysa atılır */
export function sondakiNoktalamayiAt(adres: string): string {
  let a = adres;
  for (;;) {
    const son = a[a.length - 1];
    if (son === undefined) return a;
    if (".,:;!?…".includes(son)) a = a.slice(0, -1);
    else if (son === ")" && say(a, ")") > say(a, "(")) a = a.slice(0, -1);
    else if (son === "]" && say(a, "]") > say(a, "[")) a = a.slice(0, -1);
    else return a;
  }
}

/** Yalnız http ve https: www. ile başlayana https:// eklenir; geçersiz ya da başka şemadaki adres için null */
export function guvenliAdres(ham: string): string | null {
  const adres = ham.startsWith("www.") ? `https://${ham}` : ham;
  try {
    const u = new URL(adres);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
    return adres;
  } catch {
    return null;
  }
}

/** Düz metni parçalara ayırır; kalın parçanın içi çizilirken yeniden ayrıştırılır */
export function zenginParcala(metin: string): ZenginParca[] {
  const parcalar: ZenginParca[] = [];
  const metinEkle = (m: string) => {
    if (!m) return;
    const onceki = parcalar[parcalar.length - 1];
    if (onceki?.tur === "metin") onceki.metin += m;
    else parcalar.push({ tur: "metin", metin: m });
  };
  const desen = new RegExp(DESEN.source, DESEN.flags);
  let son = 0;
  for (let m = desen.exec(metin); m; m = desen.exec(metin)) {
    const bas = m.index;
    const [tum, kod, mdMetin, mdAdres, kalin, adres, anma, gorev] = m;
    let parca: ZenginParca | null = null;
    let uzunluk = tum.length;
    if (kod) parca = { tur: "kod", metin: kod.slice(1, -1) };
    else if (mdMetin !== undefined && mdAdres) {
      const a = guvenliAdres(mdAdres);
      if (a) parca = { tur: "baglanti", metin: mdMetin, adres: a };
    } else if (kalin) parca = { tur: "kalin", metin: kalin.slice(2, -2) };
    else if (adres) {
      const kirpik = sondakiNoktalamayiAt(adres);
      const a = guvenliAdres(kirpik);
      if (a) {
        parca = { tur: "baglanti", metin: kirpik, adres: a };
        uzunluk = kirpik.length;
      }
    } else if (anma) parca = { tur: "anma", metin: anma };
    else if (gorev) parca = { tur: "gorev", kod: gorev };

    metinEkle(metin.slice(son, bas));
    if (parca) parcalar.push(parca);
    else metinEkle(tum);
    son = bas + uzunluk;
    // Adresten atılan noktalama yeniden taranır
    desen.lastIndex = son;
  }
  metinEkle(metin.slice(son));
  return parcalar;
}

export type ZenginBlokTuru =
  | { tur: "paragraf"; satirlar: string[] }
  | { tur: "liste"; sirali: boolean; ogeler: string[] }
  | { tur: "baslik"; metin: string }
  | { tur: "kod"; metin: string };

/** Ajan mesajındaki hafif Markdown'ı bloklara ayırır; kod bloğunun içi olduğu gibi kalır */
export function bloklaraAyir(metin: string): ZenginBlokTuru[] {
  const bloklar: ZenginBlokTuru[] = [];
  let acik: ZenginBlokTuru | null = null;
  let kodSatirlari: string[] | null = null;
  const kapat = () => {
    if (acik) bloklar.push(acik);
    acik = null;
  };
  for (const satir of metin.replace(/\r\n/g, "\n").split("\n")) {
    if (kodSatirlari) {
      if (/^\s*```/.test(satir)) {
        bloklar.push({ tur: "kod", metin: kodSatirlari.join("\n") });
        kodSatirlari = null;
      } else kodSatirlari.push(satir);
      continue;
    }
    if (/^\s*```/.test(satir)) {
      kapat();
      kodSatirlari = [];
      continue;
    }
    const baslik = /^#{1,6}\s+(.+)$/.exec(satir);
    const madde = /^\s*[-*•]\s+(.+)$/.exec(satir);
    const sirali = /^\s*\d+[.)]\s+(.+)$/.exec(satir);
    if (!satir.trim()) {
      kapat();
    } else if (baslik) {
      kapat();
      bloklar.push({ tur: "baslik", metin: baslik[1]! });
    } else if (madde || sirali) {
      const sira = Boolean(sirali);
      const b = acik as ZenginBlokTuru | null;
      if (!(b && b.tur === "liste" && b.sirali === sira)) {
        kapat();
        acik = { tur: "liste", sirali: sira, ogeler: [] };
      }
      (acik as unknown as { ogeler: string[] }).ogeler.push((madde ?? sirali)![1]!);
    } else {
      const b = acik as ZenginBlokTuru | null;
      if (!(b && b.tur === "paragraf")) {
        kapat();
        acik = { tur: "paragraf", satirlar: [] };
      }
      (acik as unknown as { satirlar: string[] }).satirlar.push(satir);
    }
  }
  if (kodSatirlari) bloklar.push({ tur: "kod", metin: kodSatirlari.join("\n") });
  kapat();
  return bloklar;
}
