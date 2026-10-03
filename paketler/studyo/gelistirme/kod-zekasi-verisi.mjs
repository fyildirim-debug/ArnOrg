// Sahte çekirdeğin kod zekâsı: örnek repodaki dosyalardan basit sembol, içe aktarma ve parça dizini.
// Gerçek çekirdekteki (paketler/cekirdek/src/kod-zekasi) gömme ve FTS yoktur; anahtar sözcük puanı,
// sembol adı eşleşmesi ve sözcük örtüşmesiyle "anlamsal" görünümlü bir sıralama ekranı denemeye yeter.

const UZANTI_DIL = { ts: "typescript", tsx: "typescriptreact", js: "javascript", mjs: "javascript", json: "json", md: "markdown", css: "css", yaml: "yaml", yml: "yaml" };
const ATLANAN = [".arnorg/", "node_modules/", "dist/"];
const DURAK = new Set("ve veya ile icin bu su bir ne nasil nerede neden hangi gibi daha en de da ki olan var yok the of to in is and or for on with how where what".split(" "));

export const MODELLER = [
  {
    secim: "kaliteli",
    kimlik: "onnx-community/embeddinggemma-300m-ONNX",
    ad: "EmbeddingGemma 300M",
    aciklama: "Çok dilli ve kodda güçlü; Türkçe soruyla İngilizce ya da Türkçe adlı kodu bulur. İlk dizinleme yavaştır (4 çekirdekte parça başına ~0,5 sn; çok kullanılan kod önce gömülür), sonra yalnız değişen parçalar gömülür.",
    boyut: 768,
    indirmeMb: 310,
    indirildi: true,
    diskMb: 309,
  },
  {
    secim: "hizli",
    kimlik: "Xenova/multilingual-e5-small",
    ad: "Multilingual E5 Small",
    aciklama: "Daha küçük ve birkaç kat hızlı; kod aramasında biraz daha zayıf. Büyük projelerde ilk dizinleme için uygun.",
    boyut: 384,
    indirmeMb: 130,
    indirildi: false,
    diskMb: 0,
  },
];

export const sade = (m) => m.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");

function dil(yol) {
  const u = yol.slice(yol.lastIndexOf(".") + 1).toLowerCase();
  return UZANTI_DIL[u] ?? "plaintext";
}

/** camelCase ve snake_case parçaları */
function parcala(ad) {
  return ad
    .replace(/([a-zçğıöşü0-9])([A-ZÇĞİÖŞÜ])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(sade);
}

function sozcukler(metin) {
  const s = new Set();
  for (const m of metin.matchAll(/[\p{L}_$][\p{L}\p{N}_$]*/gu)) {
    for (const p of parcala(m[0])) if (p.length >= 2 && !DURAK.has(p)) s.add(p);
  }
  return s;
}

/** Süslü parantez dengesiyle bloğun son satırı (1 tabanlı) */
function blokSonu(satirlar, bas) {
  let derinlik = 0;
  let acildi = false;
  for (let i = bas - 1; i < satirlar.length; i++) {
    for (const c of satirlar[i]) {
      if (c === "{") {
        derinlik++;
        acildi = true;
      } else if (c === "}") derinlik--;
    }
    if (acildi && derinlik <= 0) return i + 1;
    if (!acildi && /;\s*$/.test(satirlar[i])) return i + 1;
  }
  return Math.min(satirlar.length, bas + 10);
}

const KURALLAR = [
  [/^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/, "fonksiyon", true],
  [/^(?:async\s+)?function\s+(\w+)/, "fonksiyon", false],
  [/^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/, "fonksiyon", true],
  [/^export\s+(?:const|let)\s+(\w+)/, "sabit", true],
  [/^const\s+(\w+)\s*=/, "sabit", false],
  [/^export\s+(?:default\s+)?class\s+(\w+)/, "sinif", true],
  [/^export\s+interface\s+(\w+)/, "arayuz", true],
  [/^export\s+type\s+(\w+)/, "tur", true],
  [/^\s{2}(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{\s*$/, "metod", true],
];

/** Dosya kümesinden dizin: dosyalar, semboller, içe aktarmalar, parçalar */
export function dizinKur(dosyalar) {
  const kayitlar = [];
  const semboller = [];
  const iceAktarmalar = [];
  const parcalar = [];
  const yollar = Object.keys(dosyalar)
    .filter((y) => !ATLANAN.some((a) => y.startsWith(a)) && y !== ".gitignore")
    .sort();
  const kume = new Set(yollar);
  const coz = (kaynak, yol) => {
    if (!kaynak.startsWith(".")) return null;
    const parca = yol.split("/").slice(0, -1);
    for (const p of kaynak.split("/")) {
      if (p === "..") parca.pop();
      else if (p !== ".") parca.push(p);
    }
    const taban = parca.join("/").replace(/\.js$/, "");
    for (const u of ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]) if (kume.has(taban + u)) return taban + u;
    return null;
  };

  for (const yol of yollar) {
    const icerik = dosyalar[yol];
    const satirlar = icerik.split("\n");
    const d = dil(yol);
    kayitlar.push({ yol, dil: d, satir: satirlar.length });
    const dosyaSembolleri = [];
    let sinif = null;
    satirlar.forEach((s, i) => {
      const n = i + 1;
      const ice = /^import\s+(?:type\s+)?(?:(.+?)\s+from\s+)?["']([^"']+)["']/.exec(s);
      if (ice) {
        const adlar = (ice[1] ?? "").replace(/[{}]/g, "").split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter((x) => x && !x.startsWith("type ") && x !== "*");
        iceAktarmalar.push({ yol, kaynak: ice[2], hedef: coz(ice[2], yol), satir: n, adlar });
        return;
      }
      if (d === "markdown") {
        const b = /^(#{1,3})\s+(.+)/.exec(s);
        if (b) dosyaSembolleri.push({ yol, ad: b[2].trim(), tur: "baslik", bas: n, bit: n, disaAcik: false, ust: null, imza: s.trim() });
        return;
      }
      if (sinif && n > sinif.bit) sinif = null;
      for (const [desen, tur, disa] of KURALLAR) {
        const m = desen.exec(s);
        if (!m) continue;
        if (tur === "metod" && !sinif) break;
        if (tur === "metod" && ["if", "for", "while", "switch", "catch"].includes(m[1])) break;
        const bit = blokSonu(satirlar, n);
        const k = { yol, ad: m[1], tur, bas: n, bit, disaAcik: tur === "metod" ? !/^\s{2}private\b/.test(s) : disa, ust: tur === "metod" ? sinif.ad : null, imza: s.trim().slice(0, 160) };
        dosyaSembolleri.push(k);
        if (tur === "sinif") sinif = k;
        break;
      }
    });
    // Markdown başlıkları bir sonraki başlığa kadar sürer
    if (d === "markdown") dosyaSembolleri.forEach((b, i) => (b.bit = (dosyaSembolleri[i + 1]?.bas ?? satirlar.length + 1) - 1));
    semboller.push(...dosyaSembolleri);

    // Parçalar: üst düzey semboller (metotlu büyük sınıflar metotlarına), kalan satırlar pencereyle
    const ust = dosyaSembolleri.filter((s) => !s.ust);
    let imlec = 1;
    const ekle = (bas, bit, sembol, sembolTuru) => {
      if (bit < bas) return;
      const metin = satirlar.slice(bas - 1, bit).join("\n");
      if (!metin.trim()) return;
      parcalar.push({ id: parcalar.length + 1, yol, bas, bit, sembol, sembolTuru, metin, sozcukler: sozcukler(`${yol} ${sembol ?? ""} ${metin}`) });
    };
    const pencere = (bas, bit) => {
      for (let s = bas; s <= bit; s += 40) ekle(s, Math.min(bit, s + 39), null, null);
    };
    for (const s of ust) {
      if (s.bas < imlec) continue;
      pencere(imlec, s.bas - 1);
      const uyeler = dosyaSembolleri.filter((u) => u.ust === s.ad);
      if (s.bit - s.bas > 60 && uyeler.length) {
        ekle(s.bas, uyeler[0].bas - 1, s.ad, s.tur);
        for (const u of uyeler) ekle(u.bas, u.bit, `${s.ad}.${u.ad}`, u.tur);
      } else ekle(s.bas, s.bit, s.ad, s.tur);
      imlec = s.bit + 1;
    }
    pencere(imlec, satirlar.length);
  }
  return { kayitlar, semboller, iceAktarmalar, parcalar };
}

function kesit(dosyalar, p, terimler) {
  const satirlar = (dosyalar[p.yol] ?? p.metin).split("\n");
  let bas = p.bas;
  if (terimler.length && p.bit - p.bas > 18) {
    const i = satirlar.slice(p.bas - 1, p.bit).findIndex((s) => terimler.some((t) => sade(s).includes(t)));
    if (i > 2) bas = Math.min(p.bas + i - 2, Math.max(p.bas, p.bit - 19));
  }
  return { kesit: satirlar.slice(bas - 1, Math.min(p.bit, bas + 19)).join("\n"), kesitBas: bas };
}

function sonuc(d, dosyalar, p, puan, eslesme, terimler) {
  const k = kesit(dosyalar, p, terimler);
  return { yol: p.yol, dil: d.kayitlar.find((x) => x.yol === p.yol)?.dil ?? "plaintext", bas: p.bas, bit: p.bit, sembol: p.sembol, sembolTuru: p.sembolTuru, puan, eslesme, ...k };
}

/** Anahtar sözcük + sembol adı puanı; sözcük örtüşmesi yüksekse "karma" sayılır */
export function ara(d, dosyalar, q, { sinir = 20, yol = "" } = {}) {
  const terimler = [...sozcukler(q)].map((t) => (t.length > 6 ? t.slice(0, Math.max(4, Math.ceil(t.length * 0.6))) : t));
  const yolSuz = yol.replace(/\*\*\/?/g, "").replace(/\*.*$/, "");
  const adaylar = d.parcalar
    .filter((p) => !yolSuz || p.yol.startsWith(yolSuz) || p.yol.endsWith(yolSuz.replace(/^\./, "")))
    .map((p) => {
      const govde = sade(`${p.yol} ${p.sembol ?? ""} ${p.metin}`);
      let puan = 0;
      let isabet = 0;
      for (const t of terimler) {
        const n = govde.split(t).length - 1;
        if (n) isabet++;
        puan += Math.min(4, n) * (sade(p.sembol ?? "").includes(t) ? 3 : 1);
      }
      return { p, puan: puan * (0.5 + isabet / Math.max(1, terimler.length)), isabet, sembol: terimler.some((t) => sade(p.sembol ?? "").includes(t)) };
    })
    .filter((x) => x.puan > 0)
    .sort((a, b) => b.puan - a.puan);
  const enCok = adaylar[0]?.puan ?? 1;
  const dosyaSayisi = new Map();
  const secilen = [];
  for (const a of adaylar) {
    const n = dosyaSayisi.get(a.p.yol) ?? 0;
    if (n >= 3) continue;
    dosyaSayisi.set(a.p.yol, n + 1);
    secilen.push(a);
    if (secilen.length >= sinir) break;
  }
  return secilen.map((a, i) =>
    sonuc(d, dosyalar, a.p, Math.round((0.35 + 0.6 * (a.puan / enCok)) * 1000) / 1000, a.sembol && a.isabet > 1 ? "karma" : a.sembol ? "sembol" : i % 3 === 1 ? "anlamsal" : a.isabet > 1 ? "karma" : "sozcuk", terimler),
  );
}

export function benzer(d, dosyalar, yol, satir, sinir = 8) {
  const kaynak = d.parcalar.filter((p) => p.yol === yol && p.bas <= satir && p.bit >= satir).sort((a, b) => a.bit - a.bas - (b.bit - b.bas))[0];
  if (!kaynak) return null;
  const adaylar = d.parcalar
    .filter((p) => p !== kaynak && !(p.yol === kaynak.yol && p.bas <= kaynak.bit && p.bit >= kaynak.bas))
    .map((p) => {
      let ortak = 0;
      for (const s of p.sozcukler) if (kaynak.sozcukler.has(s)) ortak++;
      return { p, benzerlik: ortak / (p.sozcukler.size + kaynak.sozcukler.size - ortak || 1) };
    })
    .filter((x) => x.benzerlik > 0)
    .sort((a, b) => b.benzerlik - a.benzerlik)
    .slice(0, sinir);
  return adaylar.map((a) => sonuc(d, dosyalar, a.p, Math.round(Math.min(1, 0.3 + a.benzerlik) * 1000) / 1000, "anlamsal", []));
}

export function sembolAra(d, q, tur, sinir = 200) {
  const s = sade(q.trim());
  const liste = d.semboller.filter((x) => (!tur || x.tur === tur) && (!s || sade(x.ad).includes(s)));
  const sira = (x) => (!s ? 0 : sade(x.ad) === s ? 0 : sade(x.ad).startsWith(s) ? 1 : 2);
  return liste.sort((a, b) => sira(a) - sira(b) || Number(b.disaAcik) - Number(a.disaAcik) || b.bit - b.bas - (a.bit - a.bas)).slice(0, sinir);
}

export function harita(d) {
  const kok = { ad: "", yol: "", tur: "klasor", satir: 0, dosyaSayisi: 0, cocuklar: [] };
  const klasorler = new Map([["", kok]]);
  const klasor = (y) => {
    if (klasorler.has(y)) return klasorler.get(y);
    const i = y.lastIndexOf("/");
    const ust = klasor(i < 0 ? "" : y.slice(0, i));
    const k = { ad: y.slice(i + 1), yol: y, tur: "klasor", satir: 0, dosyaSayisi: 0, cocuklar: [] };
    ust.cocuklar.push(k);
    klasorler.set(y, k);
    return k;
  };
  for (const f of d.kayitlar) {
    const i = f.yol.lastIndexOf("/");
    const ss = d.semboller.filter((s) => s.yol === f.yol && !s.ust).slice(0, 6);
    klasor(i < 0 ? "" : f.yol.slice(0, i)).cocuklar.push({
      ad: f.yol.slice(i + 1),
      yol: f.yol,
      tur: "dosya",
      dil: f.dil,
      satir: f.satir,
      semboller: ss.map((s) => ({ ad: s.ad, tur: s.tur, bas: s.bas, disaAcik: s.disaAcik })),
      iceAktaran: new Set(d.iceAktarmalar.filter((x) => x.hedef === f.yol).map((x) => x.yol)).size,
    });
  }
  const topla = (k) => {
    if (k.tur === "dosya") return [k.satir, 1];
    let s = 0;
    let n = 0;
    for (const c of k.cocuklar) {
      const [a, b] = topla(c);
      s += a;
      n += b;
    }
    k.satir = s;
    k.dosyaSayisi = n;
    k.cocuklar.sort((a, b) => (a.tur === b.tur ? a.ad.localeCompare(b.ad, "tr") : a.tur === "klasor" ? -1 : 1));
    return [s, n];
  };
  topla(kok);
  return kok;
}

export function bagimliliklar(d, yol) {
  if (!d.kayitlar.some((f) => f.yol === yol)) return null;
  return {
    yol,
    iceAktardiklari: d.iceAktarmalar.filter((x) => x.yol === yol).map((x) => ({ yol: x.hedef, kaynak: x.kaynak, satir: x.satir, adlar: x.adlar })),
    iceAktaranlar: d.iceAktarmalar.filter((x) => x.hedef === yol).map((x) => ({ yol: x.yol, satir: x.satir, adlar: x.adlar })),
  };
}

export function grafik(d, duzey) {
  const klasorOf = (y) => (y.includes("/") ? y.slice(0, y.lastIndexOf("/")) : ".");
  const dugumler = new Map();
  for (const f of d.kayitlar) {
    const id = duzey === "dosya" ? f.yol : klasorOf(f.yol);
    const x = dugumler.get(id) ?? { id, dil: f.dil, satir: 0, dosya: 0 };
    x.satir += f.satir;
    x.dosya += 1;
    dugumler.set(id, x);
  }
  const kenarlar = new Map();
  for (const i of d.iceAktarmalar) {
    if (!i.hedef) continue;
    const a = duzey === "dosya" ? i.yol : klasorOf(i.yol);
    const b = duzey === "dosya" ? i.hedef : klasorOf(i.hedef);
    if (a === b) continue;
    const k = kenarlar.get(`${a}>${b}`) ?? { kaynak: a, hedef: b, agirlik: 0 };
    k.agirlik++;
    kenarlar.set(`${a}>${b}`, k);
  }
  const bagli = new Set([...kenarlar.values()].flatMap((k) => [k.kaynak, k.hedef]));
  return {
    duzey,
    dugumler: [...dugumler.values()].filter((x) => duzey === "klasor" || bagli.has(x.id)).sort((a, b) => a.id.localeCompare(b.id)),
    kenarlar: [...kenarlar.values()],
    kirpilan: 0,
  };
}
