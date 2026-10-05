// Anlam bağları: dosya vektörleri, uyarlanan eşik, dosya başına en yakın k, tekilleşme, derece ve dosya sınırları,
// en yakın parça çifti ve matris parmak izi. Vektörler elle kurulur (sahte gömücü yerine; sonuç belirlenimci).
import { describe, expect, it } from "vitest";
import { anlamaUygun, anlamBaglari, dosyaSatirlari, dosyaVektoru, enYakinDosyalar, enYakinParcaCifti, matrisIzi, type ParcaMatrisi } from "./anlam.js";

const BOYUT = 8;

/** Birim vektör: verilen eksenlerde ağırlıklar, diğerlerinde küçük gürültü (dosyaya özgü, belirlenimci) */
function vektor(agirliklar: Record<number, number>, tohum: number, taban = 0): number[] {
  const v = Array.from({ length: BOYUT }, (_, i) => (agirliklar[i] ?? 0) + 0.05 * Math.sin(tohum * 7.1 + i * 3.3) + taban);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

/** Dosya → parça vektörleri listesinden matris */
function matris(dosyalar: Record<string, number[][]>, ilkId = 1): ParcaMatrisi {
  const idler: number[] = [];
  const yollar: string[] = [];
  const satirlar: number[][] = [];
  let id = ilkId;
  for (const [y, parcalar] of Object.entries(dosyalar)) {
    for (const p of parcalar) {
      idler.push(id++);
      yollar.push(y);
      satirlar.push(p);
    }
  }
  return { boyut: BOYUT, idler, yollar, veri: Float32Array.from(satirlar.flat()) };
}

/** İki küme (sipariş ve kimlik doğrulama) ve kümesiz bir yardımcı; tabanla bütün benzerlikler yükselir (e5 gibi) */
function ornek(taban = 0): ParcaMatrisi {
  return matris({
    "src/siparis/liste.ts": [vektor({ 0: 1 }, 1, taban), vektor({ 0: 1, 1: 0.2 }, 2, taban)],
    "src/siparis/rotalar.ts": [vektor({ 0: 1, 1: 0.1 }, 3, taban)],
    "src/siparis/veritabani.ts": [vektor({ 0: 0.9, 1: 0.3 }, 4, taban)],
    "src/auth/oturum.ts": [vektor({ 2: 1 }, 5, taban)],
    "src/auth/jeton.ts": [vektor({ 2: 1, 3: 0.2 }, 6, taban), vektor({ 2: 0.8, 3: 0.4 }, 7, taban)],
    "src/auth/parola.ts": [vektor({ 2: 0.9, 3: 0.1 }, 8, taban)],
    "src/yardimci/tarih.ts": [vektor({ 5: 1 }, 9, taban)],
    "README.md": [vektor({ 0: 1 }, 10, taban)],
    "package.json": [vektor({ 2: 1 }, 11, taban)],
  });
}

const ciftler = (s: { kenarlar: { a: string; b: string }[] }) => s.kenarlar.map((k) => [k.a, k.b].sort().join(" ~ ")).sort();

describe("anlam bağları", () => {
  it("aynı işi yapan dosyalar bağlanır; kümeler arası ve kendine bağ yok; belgeler ve veri dosyaları girmez", async () => {
    const s = await anlamBaglari(ornek());
    const c = ciftler(s);
    expect(c.length).toBeGreaterThanOrEqual(4);
    for (const x of c) {
      const [a, b] = x.split(" ~ ");
      expect(a).not.toBe(b);
      expect(a!.split("/")[1]).toBe(b!.split("/")[1]);
    }
    expect(c.join("\n")).not.toMatch(/README|package\.json|tarih/);
    // Tekil: her çift bir kez
    expect(new Set(c).size).toBe(c.length);
    expect(s.dosya).toBe(7);
    expect(s.esik).toBeGreaterThan(0.2);
    for (const k of s.kenarlar) expect(k.benzerlik).toBeGreaterThanOrEqual(s.esik!);
  });

  it("eşik modelin taban benzerliğine uyar: bütün benzerlikler yüksekken de aynı bağlar çıkar", async () => {
    const dusuk = await anlamBaglari(ornek());
    const yuksek = await anlamBaglari(ornek(0.9));
    expect(yuksek.esik!).toBeGreaterThan(dusuk.esik!);
    expect(ciftler(yuksek)).toEqual(ciftler(dusuk));
  });

  it("dosya başına en çok k aday, derece sınırı; sınırı aşan depoda en çok parçası olan dosyalar alınır", async () => {
    // Herkese benzeyen merkez dosya: bağ sayısı derece sınırını aşmaz
    const dosyalar: Record<string, number[][]> = { "src/merkez.ts": [vektor({ 0: 1, 1: 1, 2: 1, 3: 1 }, 1)] };
    for (let i = 0; i < 12; i++) dosyalar[`src/d${i}.ts`] = [vektor({ [i % 4]: 1, 4: 0.3 }, i + 2)];
    const s = await anlamBaglari(matris(dosyalar), { k: 2 });
    const derece = new Map<string, number>();
    for (const k of s.kenarlar) for (const y of [k.a, k.b]) derece.set(y, (derece.get(y) ?? 0) + 1);
    expect(Math.max(...derece.values())).toBeLessThanOrEqual(6);
    const sinirli = await anlamBaglari(matris({ ...dosyalar, "src/buyuk.ts": [vektor({ 0: 1 }, 40), vektor({ 0: 1 }, 41), vektor({ 0: 1 }, 42)] }), { enCokDosya: 5 });
    expect(sinirli.dosya).toBe(5);
    expect(sinirli.kirpilan).toBe(9);
    expect(sinirli.vektorler.has("src/buyuk.ts")).toBe(true);
  });

  it("üçten az dosyada bağ ve eşik yok; olay döngüsüne nefes verilir", async () => {
    const az = await anlamBaglari(matris({ "a.ts": [vektor({ 0: 1 }, 1)], "b.ts": [vektor({ 0: 1 }, 2)] }));
    expect(az).toMatchObject({ kenarlar: [], esik: null, dosya: 2 });
    // 300 dosya × 768 boyut: ~35 milyon çarpma; hesap en az bir kez olay döngüsüne bırakılır
    const boyut = 768;
    const n = 300;
    const veri = new Float32Array(n * boyut);
    for (let i = 0; i < n; i++) for (let j = 0; j < boyut; j++) veri[i * boyut + j] = Math.sin(i * 0.37 + j * 0.11) / Math.sqrt(boyut / 2);
    let nefes = 0;
    const s = await anlamBaglari(
      { boyut, idler: Array.from({ length: n }, (_, i) => i + 1), yollar: Array.from({ length: n }, (_, i) => `src/f${i}.ts`), veri },
      {
        nefes: async () => {
          nefes++;
        },
      },
    );
    expect(nefes).toBeGreaterThan(0);
    expect(s.kenarlar.length).toBeLessThanOrEqual(n * 2);
  });

  it("tek dosyanın komşuları ve en yakın parça çifti", () => {
    const m = ornek();
    const satirlar = dosyaSatirlari(m);
    const vektorler = new Map([...satirlar].filter(([y]) => anlamaUygun(y)).map(([y, r]) => [y, dosyaVektoru(m, r)]));
    const yakin = enYakinDosyalar(vektorler.get("src/auth/jeton.ts")!, vektorler, { haric: "src/auth/jeton.ts", esik: 0.5, sinir: 2 });
    expect(yakin.map((x) => x.b)).toEqual(expect.arrayContaining(["src/auth/oturum.ts", "src/auth/parola.ts"]));
    expect(yakin.every((x) => x.b !== "src/auth/jeton.ts")).toBe(true);
    const cift = enYakinParcaCifti(m, satirlar.get("src/auth/jeton.ts")!, satirlar.get("src/auth/oturum.ts")!)!;
    // jeton.ts'nin ilk parçası ({2:1, 3:0.2}) oturum.ts'ye ({2:1}) ikincisinden yakındır
    expect(m.idler[cift.i]).toBe(m.idler[satirlar.get("src/auth/jeton.ts")![0]!]);
    expect(cift.benzerlik).toBeGreaterThan(0.9);
  });

  it("matris parmak izi parça kümesine bağlıdır", () => {
    expect(matrisIzi(ornek())).toBe(matrisIzi(ornek(0.5)));
    expect(matrisIzi(ornek())).not.toBe(matrisIzi(matris({ "a.ts": [vektor({ 0: 1 }, 1)] }, 100)));
  });

  it("uygun dosyalar: kod, stil ve şablonlar; belge ve yapılandırma değil", () => {
    expect(["src/a.ts", "app/x.py", "public/index.html", "views/menu.ejs", "stil/ana.css"].every(anlamaUygun)).toBe(true);
    expect(["README.md", "package.json", "tsconfig.json", "veri.yaml", "notlar.txt"].some(anlamaUygun)).toBe(false);
  });
});
