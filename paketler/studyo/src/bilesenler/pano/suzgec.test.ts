// Pano süzgeci: kişi, rol, atanmamış; saklanan değerin çözümü ve ekiple geçerliliği
import { describe, expect, it } from "vitest";
import { gorevUyar, rolSecenekleri, suzgecCoz, suzgecDegeri, suzgecGecerli, type Suzgec } from "./suzgec";

const ajanlar = [
  { id: "deniz", rol: "backend", rolAdi: "Backend geliştirici" },
  { id: "ece", rol: "frontend", rolAdi: "Frontend geliştirici" },
  { id: "burak", rol: "devops", rolAdi: "DevOps" },
  { id: "aras", rol: "backend", rolAdi: "Backend geliştirici" },
];

describe("pano süzgeci", () => {
  it("değer çözülür ve geri yazılır", () => {
    const ornekler: Suzgec[] = [{ tur: "hepsi" }, { tur: "atanmamis" }, { tur: "kisi", id: "deniz" }, { tur: "rol", rol: "backend" }];
    for (const s of ornekler) expect(suzgecCoz(suzgecDegeri(s))).toEqual(s);
    expect(suzgecCoz(null)).toEqual({ tur: "hepsi" });
    expect(suzgecCoz("  ")).toEqual({ tur: "hepsi" });
  });

  it("0.0.7'nin yalın ajan kimliği kişi sayılır", () => {
    expect(suzgecCoz("ece")).toEqual({ tur: "kisi", id: "ece" });
  });

  it("rol süzgeci o roldeki herkesin görevlerini gösterir, atanmamışı göstermez", () => {
    const rol = suzgecCoz("r:backend");
    expect(gorevUyar({ atananId: "deniz" }, rol, ajanlar)).toBe(true);
    expect(gorevUyar({ atananId: "aras" }, rol, ajanlar)).toBe(true);
    expect(gorevUyar({ atananId: "ece" }, rol, ajanlar)).toBe(false);
    expect(gorevUyar({ atananId: null }, rol, ajanlar)).toBe(false);
    // Ekipten ayrılmış birinin görevi rolle eşleşmez
    expect(gorevUyar({ atananId: "eski" }, rol, ajanlar)).toBe(false);
  });

  it("kişi, atanmamış ve herkes", () => {
    expect(gorevUyar({ atananId: "ece" }, suzgecCoz("a:ece"), ajanlar)).toBe(true);
    expect(gorevUyar({ atananId: "deniz" }, suzgecCoz("a:ece"), ajanlar)).toBe(false);
    expect(gorevUyar({ atananId: null }, suzgecCoz("_yok"), ajanlar)).toBe(true);
    expect(gorevUyar({ atananId: "ece" }, suzgecCoz("_yok"), ajanlar)).toBe(false);
    expect(gorevUyar({ atananId: null }, suzgecCoz(""), ajanlar)).toBe(true);
  });

  it("ayrılan kişinin ya da kimsesi kalmayan rolün süzgeci geçersiz", () => {
    expect(suzgecGecerli(suzgecCoz("a:ece"), ajanlar)).toBe(true);
    expect(suzgecGecerli(suzgecCoz("a:nehir"), ajanlar)).toBe(false);
    expect(suzgecGecerli(suzgecCoz("r:tasarim"), ajanlar)).toBe(false);
    expect(suzgecGecerli(suzgecCoz("_yok"), [])).toBe(true);
  });

  it("roller birer kez, görünen adlarına göre sıralı", () => {
    expect(rolSecenekleri(ajanlar)).toEqual([
      { rol: "backend", ad: "Backend geliştirici" },
      { rol: "devops", ad: "DevOps" },
      { rol: "frontend", ad: "Frontend geliştirici" },
    ]);
    expect(rolSecenekleri([{ rol: "yazar", rolAdi: "" }])).toEqual([{ rol: "yazar", ad: "yazar" }]);
  });
});
