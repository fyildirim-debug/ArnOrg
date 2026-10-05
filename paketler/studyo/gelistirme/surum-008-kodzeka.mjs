// Sahte çekirdeğin 0.0.8 "kod zekâsı bağları" davranışları: grafik ucunda türlü kenarlar (ithal ve anlam) ve anlam
// durumu (GET /api/projeler/:pid/kod-zekasi/grafik), ilgili dosyalar ucu (GET .../kod-zekasi/ilgili).
//
//   kur(c): sahte-sunucu.mjs'teki rota, rotalar ve kod zekâsı yardımcılarıyla çağrılır (surum-007-*.mjs deseni)
//
// Gerçek çekirdek anlam bağlarını gömmelerden kurar (paketler/cekirdek/src/kod-zekasi/anlam.ts); burada dosyaların
// kod sözcüklerinden (yol adları hariç, eş anlamlılar tek kavrama indirgenmiş) TF-IDF kosinüsüyle benzer bir sıralama
// yapılır: her dosya için eşiği geçen en yakın üç dosya, çiftler tekil, içe aktarmayla da bağlı çiftler işaretli. Sipariş Paneli'nde istemci (src/api/istemci.ts) ile
// sunucu rotaları ve testleri içe aktarma olmadan anlamca bağlanır. Dizin gömülürken durum "hazirlaniyor" olur, son
// hesaplanan bağlar gelir; model kapalıyken "kapali" ve yalnız içe aktarma bağları.

import * as KZ from "./kod-zekasi-verisi.mjs";

/** Dosya başına aday ve bağ sınırı (çekirdekteki ANLAM_K ve derece sınırı) */
const K = 3;
const EN_COK_DERECE = 6;
const UYGUN = /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|html?)$/i;
/** Gömme modelinin "anlam" yakınlığını taklit eden küçük kavram sözlüğü: aynı işi anlatan sözcükler tek kavram */
const KAVRAM = {
  getir: "liste", listele: "liste", liste: "liste", listesi: "liste", listeyi: "liste",
  imlec: "sayfa", sayfa: "sayfa", sayfalama: "sayfa", limit: "sayfa", ofset: "sayfa", sonraki: "sayfa",
  jeton: "oturum", token: "oturum", yenile: "oturum",
  fetch: "http", get: "http", post: "http", query: "http", istek: "http", yanit: "http", inject: "http",
  siparisler: "siparis", siparisleri: "siparis", app: "uygulama",
};
const DURAK = new Set("import export from const let return function async await type interface new true false null as default number string void if else for of in".split(" "));

/** Dosyaların sözcük torbaları (TF-IDF, birim uzunlukta) ve parçaları */
function dosyaVektorleri(dizin) {
  const torbalar = new Map();
  const parcalar = new Map();
  for (const p of dizin.parcalar) {
    if (!UYGUN.test(p.yol)) continue;
    const t = torbalar.get(p.yol) ?? new Map();
    const yolSozcukleri = new Set(p.yol.split(/[/._-]+/).map(KZ.sade));
    for (const ham of p.sozcukler) {
      const s = KAVRAM[ham] ?? ham;
      if (!yolSozcukleri.has(ham) && !DURAK.has(s)) t.set(s, (t.get(s) ?? 0) + 1);
    }
    torbalar.set(p.yol, t);
    parcalar.set(p.yol, [...(parcalar.get(p.yol) ?? []), p]);
  }
  const df = new Map();
  for (const t of torbalar.values()) for (const s of t.keys()) df.set(s, (df.get(s) ?? 0) + 1);
  const n = torbalar.size;
  const vektorler = new Map();
  for (const [yol, t] of torbalar) {
    const v = new Map();
    let kare = 0;
    for (const [s, sayi] of t) {
      const w = (1 + Math.log(sayi)) * Math.log((n + 1) / (df.get(s) ?? 1));
      if (w > 0) {
        v.set(s, w);
        kare += w * w;
      }
    }
    const boy = Math.sqrt(kare) || 1;
    for (const [s, w] of v) v.set(s, w / boy);
    vektorler.set(yol, v);
  }
  return { vektorler, parcalar };
}

function kosinus(a, b) {
  let t = 0;
  const [kucuk, buyuk] = a.size < b.size ? [a, b] : [b, a];
  for (const [s, w] of kucuk) t += w * (buyuk.get(s) ?? 0);
  return t;
}

/** Anlam bağları: dosya başına en yakın K, uyarlanan eşik (ortalama + yarım sapma), derece sınırı. Benzerlik gerçek
 * modellerin aralığına (0,5–0,95) taşınır ki ekran gerçekçi görünsün. */
function anlamHesapla(dosyalar) {
  const { vektorler, parcalar } = dosyaVektorleri(KZ.dizinKur(dosyalar));
  const yollar = [...vektorler.keys()].sort();
  const benzerlik = new Map();
  const tum = [];
  for (let i = 0; i < yollar.length; i++)
    for (let j = i + 1; j < yollar.length; j++) {
      const b = kosinus(vektorler.get(yollar[i]), vektorler.get(yollar[j]));
      benzerlik.set(`${yollar[i]}\u0000${yollar[j]}`, b);
      tum.push(b);
    }
  if (tum.length < 3) return { kenarlar: [], esik: null, olcek: (b) => b, vektorler, parcalar, benzerlik };
  const ort = tum.reduce((t, x) => t + x, 0) / tum.length;
  const sapma = Math.sqrt(tum.reduce((t, x) => t + (x - ort) ** 2, 0) / tum.length);
  const esik = ort + 0.5 * sapma;
  const enCok = Math.max(...tum) || 1;
  const olcek = (b) => Math.round((0.5 + 0.45 * (b / enCok)) * 100) / 100;
  const b = (x, y) => benzerlik.get(x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`) ?? 0;
  const ciftler = new Map();
  for (const x of yollar) {
    const adaylar = yollar.filter((y) => y !== x && b(x, y) >= esik).sort((p, q) => b(x, q) - b(x, p)).slice(0, K);
    for (const y of adaylar) ciftler.set(x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`, b(x, y));
  }
  const derece = new Map();
  const kenarlar = [];
  for (const [anahtar, s] of [...ciftler].sort((p, q) => q[1] - p[1])) {
    const [x, y] = anahtar.split("\u0000");
    if ((derece.get(x) ?? 0) >= EN_COK_DERECE || (derece.get(y) ?? 0) >= EN_COK_DERECE) continue;
    derece.set(x, (derece.get(x) ?? 0) + 1);
    derece.set(y, (derece.get(y) ?? 0) + 1);
    kenarlar.push({ a: x, b: y, benzerlik: olcek(s) });
  }
  return { kenarlar, esik: olcek(esik), olcek, vektorler, parcalar, benzerlik };
}

/** İki dosyanın en yakın parça çifti: ortak sözcük oranı (Jaccard) */
function enYakinCift(parcalarA, parcalarB) {
  let en = null;
  for (const x of parcalarA)
    for (const y of parcalarB) {
      let ortak = 0;
      for (const s of x.sozcukler) if (y.sozcukler.has(s)) ortak++;
      const j = ortak / (x.sozcukler.size + y.sozcukler.size - ortak || 1);
      if (!en || j > en.j) en = { x, y, j };
    }
  return en;
}

export function kur(c) {
  const { rota, rotalar, kodDurumu, alanDosyalari } = c;
  /** Alan × proje: son hesaplanan anlam bağları (gömme sürerken bunlar verilir) */
  const onbellek = new Map();

  function anlamDurumu(pid, alan) {
    const d = kodDurumu(pid, alan);
    const temel = { gomulen: d.gomulen, toplamParca: d.toplamParca, esik: null, kirpilan: 0 };
    if (!d.model) return { durum: { ...temel, durum: "kapali" }, sonuc: null };
    const anahtar = `${pid}:${alan}`;
    const hazir = d.durum === "hazir" && d.gomulen >= d.toplamParca;
    if (hazir) onbellek.set(anahtar, anlamHesapla(alanDosyalari(alan)));
    const sonuc = onbellek.get(anahtar) ?? null;
    return { durum: { ...temel, durum: hazir ? "hazir" : "hazirlaniyor", esik: sonuc?.esik ?? null }, sonuc };
  }

  // Grafik: asıl uç (alanı doğrular, gerekirse dizinlemeyi başlatır) içe aktarma kenarlarını verir; türler ve anlam
  // kenarları burada eklenir
  const grafikRotasi = rotalar.find((r) => r.yontem === "GET" && r.desen.test("/api/projeler/x/kod-zekasi/grafik"));
  const asilGrafik = grafikRotasi.isleyici;
  grafikRotasi.isleyici = (i) => {
    const g = asilGrafik(i);
    const ithal = g.kenarlar.map((k) => ({ ...k, tur: "ithal" }));
    if (i.q.get("anlam") === "0") return { ...g, kenarlar: ithal };
    const alan = i.q.get("alan") || "ana";
    const { durum, sonuc } = anlamDurumu(i.p.pid, alan);
    const klasorOf = (y) => (y.includes("/") ? y.slice(0, y.lastIndexOf("/")) : ".");
    const ithalVar = new Set(ithal.flatMap((k) => [`${k.kaynak}\u0000${k.hedef}`, `${k.hedef}\u0000${k.kaynak}`]));
    const anlam = new Map();
    for (const k of sonuc?.kenarlar ?? []) {
      const a = g.duzey === "klasor" ? klasorOf(k.a) : k.a;
      const b = g.duzey === "klasor" ? klasorOf(k.b) : k.b;
      if (a === b) continue;
      const [x, y] = a < b ? [a, b] : [b, a];
      const var_ = anlam.get(`${x}\u0000${y}`);
      if (!var_ || var_.agirlik < k.benzerlik) anlam.set(`${x}\u0000${y}`, { kaynak: x, hedef: y, agirlik: k.benzerlik, tur: "anlam", ithalIle: ithalVar.has(`${x}\u0000${y}`) });
    }
    // Dosya düzeyinde yalnız anlamca bağlı dosyalar da düğüm olur
    const dugumler = [...g.dugumler];
    if (g.duzey === "dosya") {
      const kayitlar = KZ.dizinKur(alanDosyalari(alan)).kayitlar;
      for (const k of anlam.values())
        for (const id of [k.kaynak, k.hedef]) {
          const f = kayitlar.find((x) => x.yol === id);
          if (f && !dugumler.some((d) => d.id === id)) dugumler.push({ id, dil: f.dil, satir: f.satir, dosya: 1 });
        }
      dugumler.sort((a, b) => a.id.localeCompare(b.id));
    }
    return { ...g, dugumler, kenarlar: [...ithal, ...anlam.values()], anlam: durum };
  };

  // İlgili dosyalar: asıl bağımlılık ucu yolu doğrular (dizinde yoksa 404); anlam komşuları ve en yakın parça eklenir
  const bagRotasi = rotalar.find((r) => r.yontem === "GET" && r.desen.test("/api/projeler/x/kod-zekasi/bagimliliklar"));
  rota("GET", "/api/projeler/:pid/kod-zekasi/ilgili", (i) => {
    const b = bagRotasi.isleyici(i);
    const alan = i.q.get("alan") || "ana";
    const yol = b.yol;
    const sinir = Math.min(40, Math.max(1, Number(i.q.get("sinir") ?? 12) || 12));
    const kayitlar = KZ.dizinKur(alanDosyalari(alan)).kayitlar;
    const dosyalar = new Map();
    const al = (y) => {
      if (!dosyalar.has(y)) dosyalar.set(y, { yol: y, dil: kayitlar.find((x) => x.yol === y)?.dil ?? "", giden: [], gelen: [], benzerlik: null, enYakin: null });
      return dosyalar.get(y);
    };
    for (const x of b.iceAktardiklari) if (x.yol && x.yol !== yol) al(x.yol).giden.push({ kaynak: x.kaynak, satir: x.satir, adlar: x.adlar });
    for (const x of b.iceAktaranlar) al(x.yol).gelen.push({ satir: x.satir, adlar: x.adlar });
    const { durum, sonuc } = anlamDurumu(i.p.pid, alan);
    if (sonuc && sonuc.vektorler.has(yol)) {
      const yakinlar = [...sonuc.vektorler.keys()]
        .filter((y) => y !== yol)
        .map((y) => ({ y, s: sonuc.olcek(kosinus(sonuc.vektorler.get(yol), sonuc.vektorler.get(y))) }))
        .filter((x) => sonuc.esik !== null && x.s >= sonuc.esik)
        .sort((p, q) => q.s - p.s)
        .slice(0, sinir);
      for (const { y, s } of yakinlar) {
        const d = al(y);
        d.benzerlik = s;
        const cift = enYakinCift(sonuc.parcalar.get(yol) ?? [], sonuc.parcalar.get(y) ?? []);
        if (cift)
          d.enYakin = {
            bu: { bas: cift.x.bas, bit: cift.x.bit, sembol: cift.x.sembol },
            o: { bas: cift.y.bas, bit: cift.y.bit, sembol: cift.y.sembol },
            benzerlik: Math.min(0.99, Math.round((s + 0.04) * 100) / 100),
          };
      }
    }
    const sira = (d) => (d.benzerlik !== null && d.giden.length + d.gelen.length ? 0 : d.benzerlik === null ? 1 : 2);
    const liste = [...dosyalar.values()].sort((p, q) => sira(p) - sira(q) || (q.benzerlik ?? 0) - (p.benzerlik ?? 0) || p.yol.localeCompare(q.yol));
    return { yol, dosyalar: liste.slice(0, sinir), anlam: durum };
  });
}
