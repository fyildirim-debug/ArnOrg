// Görev kaydı olayı (gorev.kaydedildi): Ofis ve Pano işaretinin okuduğu özet
import { gorevKaydiOlayi, type GorevKaydi, type SunucuOlayi } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";
import { gorevKaydiOku } from "./gorevKaydi";

const SHA = "9f3d7aa4be1c02d1e5f6a7b8c9d0e1f2a3b4c5d6";

function kayit(alanlar: Partial<GorevKaydi> = {}): GorevKaydi {
  return {
    id: "k1",
    projeId: "siparis",
    gorevId: "g24",
    gorevKodu: "T-24",
    baslik: "T-24 Sipariş durumu: geçersiz geçişte 422",
    ajanId: "deniz",
    ajanAd: "Deniz",
    commit: SHA,
    dal: "main",
    dosyalar: ["src/api/durum.ts", "src/api/durum.test.ts"],
    eklenen: 42,
    silinen: 3,
    neden: "inceleme",
    zaman: "2026-10-05T10:00:00.000Z",
    kalite: { durum: "kuyrukta", komut: "npm test", sira: 1, baslangic: null, adimBaslangic: null, bitis: null, sureMs: null, cikti: "", mesaj: null, kirmiziKayit: null },
    ...alanlar,
  };
}

describe("görev kaydı olayı", () => {
  it("olay kaydın kısa alanlarını taşır", () => {
    const k = kayit();
    expect(gorevKaydiOlayi(k)).toEqual({
      tur: "gorev.kaydedildi",
      projeId: "siparis",
      gorevId: "g24",
      gorevKodu: "T-24",
      ajanId: "deniz",
      mesaj: k.baslik,
      commit: SHA,
      dosyalar: k.dosyalar,
      kayit: k,
    });
  });

  it("görev kaydı özete döner: baştaki kod atılır, commit kısalır", () => {
    expect(gorevKaydiOku(gorevKaydiOlayi(kayit()))).toEqual({
      projeId: "siparis",
      gorevId: "g24",
      kod: "T-24",
      ajanId: "deniz",
      ozet: "Sipariş durumu: geçersiz geçişte 422",
      kimlik: "9f3d7aa",
    });
  });

  it("başka olaylar ve görevsiz kayıt (0.0.8 geçişi) işaret açmaz", () => {
    const k = kayit();
    const baska: SunucuOlayi[] = [
      { tur: "kayit.guncellendi", projeId: "siparis", kayit: k },
      { tur: "kira.guncellendi", projeId: "siparis", kiralar: [] },
    ];
    for (const o of baska) expect(gorevKaydiOku(o)).toBeNull();
    expect(gorevKaydiOku(gorevKaydiOlayi(kayit({ gorevId: null, gorevKodu: null, baslik: "ArnOrg 0.0.8: arnorg/selin ortak projeye alındı", neden: "gecis" })))).toBeNull();
  });

  it("kodla başlamayan ya da çok satırlı konu: ilk satır olduğu gibi; yalnız kod kalırsa özet yok", () => {
    expect(gorevKaydiOku(gorevKaydiOlayi(kayit({ baslik: "Sayfalama\n\nAyrıntı" })))?.ozet).toBe("Sayfalama");
    expect(gorevKaydiOku(gorevKaydiOlayi(kayit({ baslik: "T-24" })))?.ozet).toBeNull();
    // Kod yoksa kimlikle tanınır
    expect(gorevKaydiOku(gorevKaydiOlayi(kayit({ gorevKodu: null, baslik: "Liste" })))).toMatchObject({ gorevId: "g24", kod: null, ozet: "Liste" });
  });
});
