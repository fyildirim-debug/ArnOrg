// Sahte çekirdeğin tohum verisi, açılış diline göre (dil.mjs).
// Türkçede veri modülleri olduğu gibi kullanılır. İngilizcede aynı kayıtların üzerine *.en.mjs metinleri işlenir:
// kimlikler, zamanlar, sayılar ve ilişkiler Türkçe veriden gelir, böylece veri şekli iki dilde aynı kalır.
// İngilizcede eşleşmeyen çeviri ve veride kalan Türkçe metin açılışta uyarılır.
import { DIL } from "./dil.mjs";
import * as enD from "./dosyalar.en.mjs";
import * as trD from "./dosyalar.mjs";
import * as enH from "./hafiza-verisi.en.mjs";
import * as trH from "./hafiza-verisi.mjs";
import * as enKZ from "./kod-zekasi-verisi.en.mjs";
import * as trKZ from "./kod-zekasi-verisi.mjs";
import * as enV from "./veri.en.mjs";
import * as trV from "./veri.mjs";

/** Kurulun (kullanıcının) İngilizce adı; Türkçe veride "Yönetim kurulu" */
const KURUL_EN = "Board";

const uyarilar = [];
const uyar = (m) => uyarilar.push(m);
const duzNesne = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/** Ajanların açtığı kanalın açılış dilindeki adı; sistem kanalları (genel, toplanti) iki dilde kimliğiyle kalır */
export const kanalAdi = (ad) => (DIL === "en" ? (enV.kanalAdlari[ad] ?? ad) : ad);

/** ek'teki alanları hedefe derinlemesine işler; dizi ve metin olduğu gibi yer değiştirir */
function birlestir(hedef, ek, yol) {
  for (const [k, v] of Object.entries(ek)) {
    if (!(k in hedef)) uyar(`${yol}.${k}: Türkçe veride böyle bir alan yok`);
    hedef[k] = duzNesne(v) && duzNesne(hedef[k]) ? birlestir(hedef[k], v, `${yol}.${k}`) : structuredClone(v);
  }
  return hedef;
}

/** Kimlikli kayıt listesine çevirileri işler */
function kayitlaraIsle(ad, kayitlar, ekler, anahtar = "id") {
  for (const k of Object.keys(ekler)) if (!kayitlar.some((x) => x[anahtar] === k)) uyar(`${ad}.${k}: Türkçe veride böyle bir kayıt yok`);
  return kayitlar.map((x) => birlestir(structuredClone(x), ekler[x[anahtar]] ?? {}, `${ad}.${x[anahtar]}`));
}

/** Kimliksiz listeye çevirileri sırayla işler */
function siraylaIsle(ad, kayitlar, ekler) {
  if (ekler.length !== kayitlar.length) uyar(`${ad}: ${kayitlar.length} kayıt, ${ekler.length} çeviri`);
  return kayitlar.map((x, i) => birlestir(structuredClone(x), ekler[i] ?? {}, `${ad}[${i}]`));
}

/** Anahtarlı metinler (not yolu → içerik, ajan → defter); anahtarlar Türkçe veriyle aynı */
function anahtarlaIsle(ad, tr, en) {
  for (const k of Object.keys(en)) if (!(k in tr)) uyar(`${ad}["${k}"]: Türkçe veride böyle bir anahtar yok`);
  return Object.fromEntries(Object.entries(tr).map(([k, v]) => [k, en[k] ?? v]));
}

/** Akış adımları: yapı (kimlik, zaman, araç, dosya yolu) Türkçe adımdan, metin ve girdideki açıklamalar İngilizce adımdan */
function akislariIsle(tr, en) {
  for (const k of Object.keys(en)) if (!(k in tr)) uyar(`akislar.${k}: Türkçe veride böyle bir akış yok`);
  return Object.fromEntries(
    Object.entries(tr).map(([ajanId, ogeler]) => {
      const adimlar = en[ajanId] ?? [];
      if (adimlar.length !== ogeler.length) uyar(`akislar.${ajanId}: ${ogeler.length} adım, ${adimlar.length} çeviri`);
      const yeni = ogeler.map((o, i) => {
        const kopya = structuredClone(o);
        if (!adimlar[i]) return kopya;
        const [dakika, tur, alanlar = {}] = adimlar[i];
        if (trV.once(dakika) !== o.zaman || tur !== o.tur || (alanlar.arac && alanlar.arac !== o.arac)) uyar(`akislar.${o.id}: adım Türkçesiyle eşleşmiyor (${dakika}, ${tur})`);
        if (alanlar.metin !== undefined) kopya.metin = alanlar.metin;
        if (alanlar.girdi) birlestir((kopya.girdi ??= {}), alanlar.girdi, `akislar.${o.id}.girdi`);
        return kopya;
      });
      return [ajanId, yeni];
    }),
  );
}

function ingilizceVeri() {
  const roller = kayitlaraIsle("roller", trV.roller, enV.roller, "kimlik");
  const rolAdi = (rol) => roller.find((r) => r.kimlik === rol)?.ad ?? rol;
  const mesajMetinleri = Object.fromEntries(Object.entries(enV.mesajlar).map(([id, metin]) => [id, { metin }]));
  return {
    ...trV,
    roller,
    projeler: kayitlaraIsle("projeler", trV.projeler, enV.projeler),
    ajanlar: kayitlaraIsle("ajanlar", trV.ajanlar, enV.ajanlar).map((a) => ({ ...a, rolAdi: rolAdi(a.rol) })),
    gorevler: kayitlaraIsle("gorevler", trV.gorevler, enV.gorevler),
    kanallar: Object.fromEntries(
      Object.entries(trV.kanallar).map(([pid, liste]) => [pid, liste.map((k) => ({ ...k, ad: kanalAdi(k.ad), aciklama: enV.kanallar[pid]?.[k.ad] ?? k.aciklama }))]),
    ),
    mesajlar: kayitlaraIsle("mesajlar", trV.mesajlar, mesajMetinleri).map((m) => ({ ...m, kanal: kanalAdi(m.kanal), gonderenAd: m.gonderenId === "kurul" ? KURUL_EN : m.gonderenAd })),
    notlar: anahtarlaIsle("notlar", trV.notlar, enV.notlar),
    politika: kayitlaraIsle("politika", trV.politika, enV.politika),
    denetim: kayitlaraIsle("denetim", trV.denetim, enV.denetim),
    onaylar: kayitlaraIsle("onaylar", trV.onaylar, enV.onaylar),
    akislar: akislariIsle(trV.akislar, enV.akislar),
  };
}

function ingilizceHafiza() {
  return {
    ...trH,
    hafiza: kayitlaraIsle("hafiza", trH.hafiza, enH.hafiza).map((k) => (k.kaynakAjanId === null ? { ...k, kaynakAd: KURUL_EN } : k)),
    defterler: anahtarlaIsle("defterler", trH.defterler, enH.defterler),
    sorular: kayitlaraIsle("sorular", trH.sorular, enH.sorular),
    demoSorular: siraylaIsle("demoSorular", trH.demoSorular, enH.demoSorular),
    demoKayitlar: siraylaIsle("demoKayitlar", trH.demoKayitlar, enH.demoKayitlar),
  };
}

function ingilizceDosyalar() {
  const uygulanan = new Set();
  const cevir = (icerik) => {
    if (icerik === null) return null;
    let s = icerik;
    for (const [tr, en] of enD.ceviriler) {
      if (!s.includes(tr)) continue;
      s = s.split(tr).join(en);
      uygulanan.add(tr);
    }
    return s;
  };
  for (const yol of Object.keys(enD.metinler)) if (!(yol in trD.ana)) uyar(`dosyalar["${yol}"]: main dalında böyle bir dosya yok`);
  const ana = Object.fromEntries(Object.entries(trD.ana).map(([yol, icerik]) => [yol, enD.metinler[yol] ?? cevir(icerik)]));
  const katmanlar = Object.fromEntries(
    Object.entries(trD.katmanlar).map(([alan, dosyalar]) => [alan, Object.fromEntries(Object.entries(dosyalar).map(([yol, icerik]) => [yol, cevir(icerik)]))]),
  );
  const listeSurumleri = trD.listeSurumleri.map(cevir);
  for (const [tr] of enD.ceviriler) if (!uygulanan.has(tr)) uyar(`dosyalar: "${tr}" hiçbir dosyada geçmiyor`);
  return { ana, katmanlar, listeSurumleri };
}

export const V = DIL === "en" ? ingilizceVeri() : trV;
export const H = DIL === "en" ? ingilizceHafiza() : trH;
/** Sahte repo: main dalı, ajan çalışma alanlarındaki farklar ve Ece'nin canlı düzenlemesinin sürümleri */
export const D = DIL === "en" ? ingilizceDosyalar() : trD;
export const { ana, katmanlar, listeSurumleri } = D;
export const MODELLER = DIL === "en" ? kayitlaraIsle("MODELLER", trKZ.MODELLER, enKZ.MODELLER, "secim") : trKZ.MODELLER;

// İngilizce veride Türkçe metin kalmasın (kişi adlarında Türkçe harf yok; kod tanımlayıcıları ASCII)
const TURKCE_HARF = /[çğıöşüÇĞİÖŞÜ]/;
function turkceKalanlar(x, yol, sonuc = []) {
  if (typeof x === "string") {
    if (TURKCE_HARF.test(x)) sonuc.push(`${yol}: ${JSON.stringify(x.length > 70 ? `${x.slice(0, 70)}…` : x)}`);
  } else if (Array.isArray(x)) x.forEach((v, i) => turkceKalanlar(v, `${yol}[${i}]`, sonuc));
  else if (duzNesne(x)) for (const [k, v] of Object.entries(x)) turkceKalanlar(v, `${yol}.${k}`, sonuc);
  return sonuc;
}

if (DIL === "en") {
  for (const m of turkceKalanlar({ V, H, D, MODELLER }, "tohum")) uyar(`Türkçe metin kaldı · ${m}`);
  if (uyarilar.length) console.warn(`İngilizce tohum verisinde ${uyarilar.length} uyarı:\n${uyarilar.map((u) => `  - ${u}`).join("\n")}`);
}
