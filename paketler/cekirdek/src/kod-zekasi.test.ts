// Kod zekâsının şirkete bağlanışı: ajan araçları, görev metnindeki "İlgili kod", dosya olayları, ayarlar ve proje silme
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arnorgAracListesi } from "./arnorg-araclari.js";
import { Depo } from "./depo.js";
import { OlayYolu } from "./olaylar.js";
import { rolBul } from "./roller.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

let gecici: string;
let depo: Depo;
let sirket: Sirket;
let pid: string;
let repo: string;
let eskiGomme: string | undefined;

function yaz(yol: string, icerik: string): void {
  const tam = path.join(repo, ...yol.split("/"));
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, icerik);
}

type Arac = { name: string; handler: (a: Record<string, unknown>, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
async function aracCagir(ajanId: string, ad: string, girdi: Record<string, unknown>): Promise<{ metin: string; hata: boolean }> {
  const arac = (arnorgAracListesi(sirket, ajanId) as unknown as Arac[]).find((a) => a.name === ad)!;
  const s = await arac.handler(girdi, {});
  return { metin: s.content.map((c) => c.text).join("\n"), hata: Boolean(s.isError) };
}

beforeAll(async () => {
  eskiGomme = process.env.ARNORG_GOMME;
  process.env.ARNORG_GOMME = "sahte";
  gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-kod-zekasi-"));
  const yap = new Yapilandirma(path.join(gecici, "veri"));
  depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  sirket = new Sirket(depo, new OlayYolu(), yap, () => null, true);
  repo = path.join(gecici, "repo");
  const p = await sirket.projeOlustur({ ad: "Mağaza", yol: repo, olustur: true });
  pid = p.id;
  yaz("src/odeme/fatura.ts", "// Fatura hesapları\nexport function faturaToplami(kalemler: Kalem[]): number {\n  return kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0);\n}\n");
  yaz("src/odeme/kdv.ts", 'import { faturaToplami } from "./fatura.js";\n\nexport function kdvEkle(kalemler: Kalem[], oran = 0.2): number {\n  return faturaToplami(kalemler) * (1 + oran);\n}\n');
  yaz("src/kullanici/giris.ts", "export async function oturumAc(eposta: string, parola: string) {\n  const kullanici = await kullaniciBul(eposta);\n  return parolaDogrula(kullanici, parola);\n}\n");
  sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
  await sirket.kodZekasi.dizinle(pid, "ana");
});

afterAll(async () => {
  await sirket.kodZekasi.kapat();
  sirket.kapat();
  depo.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
  if (eskiGomme === undefined) delete process.env.ARNORG_GOMME;
  else process.env.ARNORG_GOMME = eskiGomme;
});

describe("kod zekâsı ve şirket", () => {
  it("ajan araçları ajanın çalışma alanında arar; .arnorg dizine girmez", async () => {
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    expect(sirket.ajanAlani(deniz)).toBe("ana");
    const ara = await aracCagir(deniz.id, "kod_ara", { sorgu: "fatura toplamı nasıl hesaplanır" });
    expect(ara.hata).toBe(false);
    expect(ara.metin).toMatch(/^1\. src\/odeme\/fatura\.ts:\d+-\d+ · faturaToplami \(fonksiyon\)/m);
    expect(ara.metin).not.toMatch(/^\d+\. \.arnorg\//m);
    const sembol = await aracCagir(deniz.id, "sembol_bul", { ad: "kdvEkle" });
    expect(sembol.metin).toContain("kdvEkle · fonksiyon, dışa açık · src/odeme/kdv.ts:3-5");
    const harita = await aracCagir(deniz.id, "kod_haritasi", {});
    expect(harita.metin).toContain("src/odeme/");
    expect(harita.metin).toContain("fatura.ts [4]");
    const bag = await aracCagir(deniz.id, "bagimliliklar", { dosya: "src/odeme/fatura.ts" });
    expect(bag.metin).toContain("Onu içe aktaranlar (1):\n- src/odeme/kdv.ts:1");
    const benzer = await aracCagir(deniz.id, "benzer_kod", { dosya: "src/odeme/kdv.ts", satir: 4 });
    expect(benzer.hata).toBe(false);
    const yok = await aracCagir(deniz.id, "bagimliliklar", { dosya: "yok.ts" });
    expect(yok.hata).toBe(true);
    expect(yok.metin).toContain("dizinde yok");
  });

  it("görev metni, dizin hazırsa ilgili kod konumlarını ekler; dizin yoksa beklemeden boş geçer", async () => {
    const deniz = depo.ajanAdla(pid, "Deniz")!;
    const g = sirket.gorevOlustur(pid, { baslik: "Fatura toplamına indirim ekle", aciklama: "faturaToplami indirim oranını da hesaba katsın.", atananId: deniz.id });
    const ilgili = await sirket.ilgiliKod(g);
    expect(ilgili).toContain("İlgili kod");
    expect(ilgili).toContain("src/odeme/fatura.ts:");
    expect(sirket.gorevMetni(g, null, ilgili)).toContain(ilgili);

    const bos = await sirket.projeOlustur({ ad: "Boş", yol: path.join(gecici, "bos"), olustur: true });
    const g2 = sirket.gorevOlustur(bos.id, { baslik: "Fatura toplamı" });
    const once = Date.now();
    expect(await sirket.ilgiliKod(g2)).toBe("");
    expect(Date.now() - once).toBeLessThan(500);
  });

  it("talimatlar kod zekâsı araçlarını anar", () => {
    expect(rolBul("ceo")!.talimat).toContain("kod_haritasi");
  });

  it("dosya değişikliği olayı dizini artımlı günceller", async () => {
    yaz("src/odeme/iade.ts", "export function iadeTutari(fatura: Fatura): number {\n  return fatura.toplam * 0.9;\n}\n");
    sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: pid, alan: "ana", yol: "src/odeme/iade.ts", ajanId: null });
    await sirket.kodZekasi.bosta(pid);
    const s = await sirket.kodZekasi.semboller(pid, "ana", "iadeTutari");
    expect(s.map((x) => x.yol)).toEqual(["src/odeme/iade.ts"]);
  });

  it("model kapatılınca yalnız anahtar sözcükle arar", async () => {
    sirket.yapilandirma.guncelle({ kodZekasiModeli: "kapali" });
    sirket.kodZekasi.ayarlarDegisti();
    await sirket.kodZekasi.bosta(pid);
    expect(sirket.kodZekasi.durum(pid, "ana").model).toBeNull();
    const y = await sirket.kodZekasi.ara(pid, "ana", "oturum aç parola");
    expect(y.yalnizSozcuk).toBe(true);
    expect(y.sonuclar[0]!.yol).toBe("src/kullanici/giris.ts");
    sirket.yapilandirma.guncelle({ kodZekasiModeli: "kaliteli" });
    sirket.kodZekasi.ayarlarDegisti();
    await sirket.kodZekasi.bosta(pid);
    expect(sirket.kodZekasi.durum(pid, "ana").model).toBe("sahte-64");
  });

  it("proje ArnOrg'dan çıkarılınca dizin dosyası silinir", async () => {
    const p = await sirket.projeOlustur({ ad: "Geçici", yol: path.join(gecici, "gecici"), olustur: true });
    await sirket.kodZekasi.dizinle(p.id, "ana");
    const dosya = path.join(gecici, "veri", "kod-dizini", `${p.id}.db`);
    expect(fs.existsSync(dosya)).toBe(true);
    sirket.projeSil(p.id);
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(dosya)).toBe(false);
  });
});
