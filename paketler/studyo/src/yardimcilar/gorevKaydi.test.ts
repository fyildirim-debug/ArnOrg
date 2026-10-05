// Görev kaydı olayı (gorev.kaydedildi) tipe bağlanmadan, biçimine bakarak okunur
import { describe, expect, it } from "vitest";
import { GOREV_KAYDI_OLAYI, gorevKaydiOku } from "./gorevKaydi";

describe("görev kaydı olayı", () => {
  it("başka olaylar ve bozuk girdiler kayıt sayılmaz", () => {
    expect(gorevKaydiOku(null)).toBeNull();
    expect(gorevKaydiOku("gorev.kaydedildi")).toBeNull();
    expect(gorevKaydiOku({ tur: "gorev.guncellendi", gorev: { id: "g1", kod: "T-1" } })).toBeNull();
    // Görev kimliği de kodu da yoksa kayıt değil
    expect(gorevKaydiOku({ tur: GOREV_KAYDI_OLAYI, projeId: "p", ajanId: "deniz" })).toBeNull();
  });

  it("görev nesnesiyle gelen kayıt: kimlik, kod, proje ve (kaydeden yoksa) atanan", () => {
    const k = gorevKaydiOku({ tur: "gorev.kaydedildi", gorev: { id: "g24", kod: "T-24", projeId: "siparis", atananId: "deniz" } });
    expect(k).toEqual({ projeId: "siparis", gorevId: "g24", kod: "T-24", ajanId: "deniz", ozet: null, kimlik: null });
  });

  it("yalın alanlar önce gelir; kaydeden atanandan önce", () => {
    const k = gorevKaydiOku({
      tur: "gorev.kaydedildi",
      projeId: "p1",
      gorevId: "g1",
      gorevKodu: "T-1",
      kaydedenId: "ece",
      gorev: { id: "eski", kod: "T-0", projeId: "p0", atananId: "deniz" },
      mesaj: "Liste: boş durum\n\nAyrıntılı açıklama",
      kimlik: "a1b2c3d",
    });
    expect(k).toEqual({ projeId: "p1", gorevId: "g1", kod: "T-1", ajanId: "ece", ozet: "Liste: boş durum", kimlik: "a1b2c3d" });
  });

  it("commit ya da kayit alt nesnesi de okunur; uzun sha kısalır", () => {
    const sha = "9f3d7aa4be1c02d1e5f6a7b8c9d0e1f2a3b4c5d6";
    const k = gorevKaydiOku({ tur: "gorev.kaydedildi", kod: "T-26", ajan: { id: "ece" }, commit: { message: "Sayfalama", sha } });
    expect(k).toMatchObject({ gorevId: null, kod: "T-26", ajanId: "ece", ozet: "Sayfalama", kimlik: "9f3d7aa" });
    const k2 = gorevKaydiOku({ tur: "gorev.kaydedildi", kayit: { gorevId: "g9", ozet: "  Kısa not  ", hash: "deadbeefcafe0123" } });
    expect(k2).toMatchObject({ gorevId: "g9", ozet: "Kısa not", kimlik: "deadbee" });
  });

  it("boş metinler yok sayılır, kısa kimlik olduğu gibi kalır", () => {
    const k = gorevKaydiOku({ tur: "gorev.kaydedildi", gorevId: "g1", mesaj: "   ", ozet: "", kimlik: "v12" });
    expect(k).toMatchObject({ ozet: null, kimlik: "v12", projeId: null, ajanId: null });
  });
});
