// Açılışta mesaiye dönüş: kapanış kaydı, çökmede çalışan durumda kalanlar, Mesaiyi durdur'un temizlemesi ve uyandırma
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ajan, HesapDurumu, SunucuOlayi } from "@arnorg/ortak";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Depo } from "./depo.js";
import { acilisKumesi, kayitOku, MesaiyeDonus, SURDURME_ANAHTARI } from "./mesaiye-donus.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

describe("açılış kümesi", () => {
  it("kayıt bozuksa boş sayılır, yinelenen kimlik bir kez okunur", () => {
    expect(kayitOku(null)).toEqual([]);
    expect(kayitOku("{bozuk")).toEqual([]);
    expect(kayitOku('{"a":1}')).toEqual([]);
    expect(kayitOku('["a","b","a",3,""]')).toEqual(["a", "b"]);
  });

  it("kapanış kaydı ile çalışan durumda kalanların birleşimi; silinen ajan düşer", () => {
    const ajanlar = [
      { id: "a", durum: "kapali" },
      { id: "b", durum: "calisiyor" },
      { id: "c", durum: "karar_bekliyor" },
      { id: "d", durum: "bosta" },
      { id: "e", durum: "duraklatildi" },
    ] as Pick<Ajan, "id" | "durum">[];
    expect(acilisKumesi(["a", "silinmis"], ajanlar)).toEqual(["a", "b", "c"]);
  });

  it("kayıt sürdürme anına dek kalır; kurulun durdurduğu çıkar; kapanışta bekleyenler korunur", () => {
    const kv = new Map<string, string>([[SURDURME_ANAHTARI, '["a","b"]']]);
    const depo = { deger: (k: string) => kv.get(k) ?? null, degerYaz: (k: string, v: string) => void kv.set(k, v) };
    const m = new MesaiyeDonus(depo, [
      { id: "a", durum: "kapali" },
      { id: "b", durum: "kapali" },
      { id: "c", durum: "calisiyor" },
    ]);
    expect(m.bekleyenler).toEqual(["a", "b", "c"]);
    expect(kayitOku(kv.get(SURDURME_ANAHTARI)!)).toEqual(["a", "b", "c"]);
    m.cikar((id) => id === "b");
    expect(m.bekleyenler).toEqual(["a", "c"]);
    expect(kayitOku(kv.get(SURDURME_ANAHTARI)!)).toEqual(["a", "c"]);
    // Sürdürme olmadan kapanırsa açılış kümesi kaybolmaz
    expect(m.kapanis(["d"])).toEqual(["a", "c", "d"]);
    expect(m.al()).toEqual(["a", "c"]);
    expect(kv.get(SURDURME_ANAHTARI)).toBe("[]");
  });
});

describe("Şirket: açılışta mesaiye dönüş", () => {
  let gecici: string;
  let yap: Yapilandirma;
  let depo: Depo;
  let pid: string;
  const id: Record<string, string> = {};
  const acik = new Set<Sirket>();
  const kayit = () => kayitOku(depo.deger(SURDURME_ANAHTARI));
  /** Uygulamanın yeniden açılışı: aynı veritabanıyla yeni Şirket (oturumsuz) */
  const ac = () => {
    const s = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    acik.add(s);
    return s;
  };
  /** Uygulamanın kapanışı */
  const kapat = (s: Sirket) => {
    acik.delete(s);
    s.kapat();
  };
  const durumYaz = (ad: string, durum: Ajan["durum"]) => depo.ajanGuncelle(id[ad]!, { durum });

  beforeAll(() => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-mesai-"));
    yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    const s = ac();
    pid = depo.projeEkle({ ad: "Mesai", yol: path.join(gecici, "repo"), aciklama: "", varsayilanDal: "main" }).id;
    for (const [ad, rol] of [
      ["Ada", "ceo"],
      ["Deniz", "backend"],
      ["Elif", "frontend"],
      ["Mert", "test"],
    ] as const) {
      id[ad] = s.iseAl(pid, { ad, rol }).id;
    }
    kapat(s);
  });

  afterAll(() => {
    for (const s of [...acik]) kapat(s);
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true });
  });

  it("kapanışta çalışan ve karar bekleyen ajanlar kaydedilir; boşta olan kaydedilmez", () => {
    const s = ac();
    durumYaz("Deniz", "calisiyor");
    durumYaz("Elif", "karar_bekliyor");
    durumYaz("Mert", "bosta");
    kapat(s);
    expect(kayit()).toEqual([id.Deniz, id.Elif]);
  });

  it("çökmede kayıt eski kalır; çalışan durumda kalan ajanlar da açılış kümesine girer ve durumlar sıfırlanır", () => {
    // Önceki temiz kapanışın kaydı duruyor; bu çalıştırmada Mert çalışırken uygulama çöktü (kapat çağrılmadı)
    durumYaz("Deniz", "kapali");
    durumYaz("Elif", "kapali");
    durumYaz("Mert", "calisiyor");
    const s = ac();
    expect(s.mesai.bekleyenler).toEqual([id.Deniz, id.Elif, id.Mert]);
    expect(depo.ajan(id.Mert!)?.durum).toBe("kapali");
    // Sürdürme anına dek kayıt da kümeyi taşır (yine çökerse kaybolmaz)
    expect(kayit()).toEqual([id.Deniz, id.Elif, id.Mert]);
  });

  it("Mesaiyi durdur kaydı temizler: durdurulan ajanlar açılışta uyanmaz", () => {
    const s = [...acik].at(-1)!;
    s.tumunuDurdur(pid);
    expect(s.mesai.bekleyenler).toEqual([]);
    expect(kayit()).toEqual([]);
    kapat(s);
    expect(kayit()).toEqual([]);
    expect(ac().mesai.bekleyenler).toEqual([]);
  });

  it("kurulun tek ajanı durdurması yalnız onu kümeden çıkarır; kapanmakta olan oturum kaydedilmez", () => {
    depo.degerYaz(SURDURME_ANAHTARI, JSON.stringify([id.Deniz, id.Elif]));
    const s = ac();
    s.ajanDurdur(id.Deniz!);
    expect(s.mesai.bekleyenler).toEqual([id.Elif]);
    expect(kayit()).toEqual([id.Elif]);
    // Kurulun durdurduğu oturum kapanırken (durum henüz "çalışıyor") uygulama kapanırsa ajan sürdürülmez
    durumYaz("Deniz", "calisiyor");
    durumYaz("Mert", "calisiyor");
    (s as unknown as { oturumlar: Map<string, unknown> }).oturumlar.set(id.Deniz!, { kapaniyor: true, acik: true, kapat: () => undefined });
    kapat(s);
    expect(kayit()).toEqual([id.Elif, id.Mert]);
    durumYaz("Deniz", "kapali");
    durumYaz("Mert", "kapali");
  });

  it("açılışta yarım kalanlar ArnOrg mesajıyla sırayla uyandırılır; kayıt temizlenir", async () => {
    depo.degerYaz(SURDURME_ANAHTARI, JSON.stringify([id.Deniz, id.Elif]));
    const olaylar: SunucuOlayi[] = [];
    const s = ac();
    s.olaylar.dinle((o) => olaylar.push(o));
    const mesaj = vi.spyOn(s, "ajanaMesaj").mockResolvedValue(undefined);
    expect(await s.mesaiyeDon()).toEqual([id.Deniz, id.Elif]);
    expect(mesaj.mock.calls.map((c) => [c[0], c[3]])).toEqual([
      [id.Deniz, { tur: "sistem" }],
      [id.Elif, { tur: "sistem" }],
    ]);
    expect(mesaj.mock.calls[0]![1]).toBe("ArnOrg yeniden başlatıldı; yarım kalan işine kaldığın yerden devam et (görevlerine ve defterine bak).");
    expect(kayit()).toEqual([]);
    expect(olaylar.some((o) => o.tur === "bildirim" && o.metin.includes("2 ajan kaldığı yerden sürüyor"))).toBe(true);
  });

  it("ayar kapalıysa kimse uyandırılmaz, kayıt yine temizlenir", async () => {
    depo.degerYaz(SURDURME_ANAHTARI, JSON.stringify([id.Deniz]));
    yap.guncelle({ acilistaSurdur: false });
    const s = ac();
    const mesaj = vi.spyOn(s, "ajanaMesaj").mockResolvedValue(undefined);
    expect(await s.mesaiyeDon()).toEqual([]);
    expect(mesaj).not.toHaveBeenCalled();
    expect(kayit()).toEqual([]);
    yap.guncelle({ acilistaSurdur: true });
  });

  it("abonelik sınırındaysa ajan sınırda bekleyenlere sessizce eklenir; pencere açılınca uyanır", async () => {
    depo.degerYaz(SURDURME_ANAHTARI, JSON.stringify([id.Deniz]));
    const s = ac();
    const olaylar: SunucuOlayi[] = [];
    s.olaylar.dinle((o) => olaylar.push(o));
    const sinir: HesapDurumu["sinir"] = { pencere: "5 saatlik pencere", yuzde: 93, sinirYuzde: 90, sifirlanma: null };
    const sinirOku = vi.spyOn(s.hesap, "sinir", "get").mockReturnValue(sinir);
    const uyandir = vi.spyOn(s, "uyandir").mockResolvedValue(true);
    const mesaj = vi.spyOn(s, "ajanaMesaj");
    expect(await s.mesaiyeDon()).toEqual([]);
    expect(mesaj).not.toHaveBeenCalled();
    expect(olaylar.some((o) => o.tur === "bildirim" && o.seviye === "hata")).toBe(false);
    // Pencere açıldı: saklanan ArnOrg mesajıyla uyanır
    sinirOku.mockReturnValue(null);
    await (s as unknown as { kullanimSiniriDegisti(x: null): Promise<void> }).kullanimSiniriDegisti(null);
    expect(uyandir).toHaveBeenCalledTimes(1);
    expect(uyandir.mock.calls[0]![0]).toBe(id.Deniz);
    expect(uyandir.mock.calls[0]![1]).toContain("ArnOrg yeniden başlatıldı");
  });
});
