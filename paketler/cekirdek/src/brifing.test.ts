// CEO brifingi: son brifingden bu yana olanların veri özeti, CEO'ya giden metin, aynı anda gelen ikinci isteğin yeni
// uyandırma açmaması, günlük zamanlayıcının kararı (saat, gün, hareket) ve API uçları. Claude Code oturumu açılmaz;
// zaman testlerde verilir.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ajan, AjanDurumu, Gorev, Mesaj, Onay, Proje, SunucuOlayi } from "@arnorg/ortak";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  Brifing,
  BRIFING_EKIP,
  BRIFING_GUNLUK,
  BRIFING_SON,
  BRIFING_YANIT,
  brifingGibiMi,
  brifingMetni,
  brifingVerisi,
  ekipIzi,
  gunlukBrifingAyari,
  gunlukKarar,
  HAZIRLANIYOR_MS,
  sureMetni,
  type BrifingBaglami,
} from "./brifing.js";
import { Depo } from "./depo.js";
import { dilKaynagi } from "./dil.js";
import { OlayYolu } from "./olaylar.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";
import { ArnorgHatasi, bugun } from "./yardimci.js";

/** Yerel saatle an (testler saat diliminden bağımsız) */
const yerel = (ay: number, gun: number, sa: number, dk = 0) => new Date(2026, ay - 1, gun, sa, dk);
const iso = (ay: number, gun: number, sa: number, dk = 0) => yerel(ay, gun, sa, dk).toISOString();

const PID = "p1";

function proje(p: Partial<Proje> = {}): Proje {
  return {
    id: PID,
    ad: "Sipariş Paneli",
    yol: "/tmp/siparis",
    aciklama: "",
    varsayilanDal: "main",
    olusturma: iso(9, 20, 10),
    uzakAdres: null,
    github: null,
    otomatikGonder: true,
    hazirlik: "tamam",
    otomatikOnay: { etkin: false, turler: [] },
    testKomutu: null,
    hazirlikKomutu: null,
    testZamanAsimiDk: 20,
    ...p,
  };
}

function ajan(a: Partial<Ajan> & Pick<Ajan, "id" | "ad" | "rol">): Ajan {
  return {
    projeId: PID,
    rolAdi: a.rol,
    model: "sonnet",
    yoneticiId: null,
    durum: "kapali",
    isAciklamasi: "",
    gorevId: null,
    oturumId: null,
    calismaAlani: null,
    dal: null,
    izinModu: "bypassPermissions",
    bugunToken: 0,
    toplamToken: 0,
    talimatEki: "",
    karakter: null,
    olusturma: iso(9, 20, 10),
    ...a,
  };
}

function gorev(no: number, g: Partial<Gorev> & Pick<Gorev, "durum">): Gorev {
  return {
    id: `g${no}`,
    projeId: PID,
    no,
    kod: `T-${no}`,
    baslik: `Görev ${no}`,
    aciklama: "",
    kabulOlcutu: "",
    atananId: null,
    bagimliliklar: [],
    etiket: "",
    olusturanId: null,
    olusturma: iso(9, 25, 10),
    guncelleme: iso(9, 25, 10),
    ...g,
  };
}

function onay(id: string, o: Partial<Onay> & Pick<Onay, "tur" | "durum">): Onay {
  return { id, projeId: PID, ajanId: null, baslik: id, ayrinti: "", veri: null, olusturma: iso(9, 25, 10), sonGecerlilik: null, sonuclanma: null, not: null, ...o };
}

let mesajSayaci = 0;
/** CEO'nun yazdığı biçimde kısa bir brifing */
const BRIFING_ORNEGI = "**Yaptıklarımız**\n- T-2 bitti\n\n**Şu an**\n- T-3 sürüyor\n\n**Sıradaki**\n- T-4\n\n**Kararınızı bekleyen**\n- Yok";

function mesaj(m: Partial<Mesaj> & Pick<Mesaj, "kanal" | "gonderenId" | "zaman">): Mesaj {
  return { id: `m${++mesajSayaci}`, projeId: PID, gonderenAd: m.gonderenId, metin: "…", anilanlar: [], ...m };
}

/** Bellekteki depo: brifingin okuduğu yöntemler */
function sahteDepo() {
  const kv = new Map<string, string>();
  const v = { projeler: [] as Proje[], ajanlar: [] as Ajan[], gorevler: [] as Gorev[], onaylar: [] as Onay[], mesajlar: [] as Mesaj[] };
  const depo: BrifingBaglami["depo"] = {
    deger: (a) => kv.get(a) ?? null,
    degerYaz: (a, d) => void kv.set(a, d),
    proje: (id) => v.projeler.find((p) => p.id === id) ?? null,
    projeler: () => v.projeler,
    ajanlar: (pid) => v.ajanlar.filter((a) => a.projeId === pid),
    gorevler: (pid) => v.gorevler.filter((g) => g.projeId === pid),
    onaylar: (pid, durum) => v.onaylar.filter((o) => o.projeId === pid && (!durum || o.durum === durum)),
    mesajAra: (pid, _q, sinir = 200) =>
      v.mesajlar
        .filter((m) => m.projeId === pid)
        .sort((a, b) => b.zaman.localeCompare(a.zaman))
        .slice(0, sinir),
  };
  return { depo, kv, ...v };
}

const HESAP = {
  pencereler: [
    { tur: "bes_saat" as const, ad: "5 saatlik pencere", yuzde: 42, sifirlanma: iso(10, 4, 14, 30) },
    { tur: "haftalik" as const, ad: "Haftalık", yuzde: 18, sifirlanma: null },
    { tur: "model" as const, ad: "Haftalık · Opus", yuzde: null, sifirlanma: null },
  ],
  sinir: null,
};

describe("brifing veri özeti", () => {
  /** Son brifing 3 Ekim 09:00'da; şimdi 4 Ekim 09:00 */
  function kur() {
    const d = sahteDepo();
    d.projeler.push(proje());
    d.ajanlar.push(
      ajan({ id: "ada", ad: "Ada", rol: "ceo", model: "fable" }),
      ajan({ id: "deniz", ad: "Deniz", rol: "backend" }),
      ajan({ id: "elif", ad: "Elif", rol: "frontend", durum: "duraklatildi" }),
      ajan({ id: "aras", ad: "Aras", rol: "guvenlik", olusturma: iso(10, 3, 11) }),
    );
    d.gorevler.push(
      gorev(1, { durum: "tamam", atananId: "deniz", guncelleme: iso(10, 3, 8) }),
      gorev(2, { durum: "tamam", atananId: "deniz", baslik: "Sipariş API'si", guncelleme: iso(10, 3, 15) }),
      gorev(3, { durum: "calisiliyor", atananId: "elif", guncelleme: iso(10, 4, 6) }),
      gorev(4, { durum: "inceleme", atananId: "deniz", guncelleme: iso(10, 4, 8, 30) }),
      gorev(5, { durum: "planlandi", atananId: "deniz", bagimliliklar: ["g3"] }),
      gorev(6, { durum: "bekleyen" }),
      gorev(7, { durum: "planlandi", atananId: "deniz", bagimliliklar: ["g1"] }),
      gorev(8, { durum: "iptal", guncelleme: iso(10, 3, 20) }),
    );
    const kalite = (durum: string, bitis: string | null, ek: Record<string, unknown> = {}) => ({ kalite: { durum, bitis, testsiz: false, testYok: false, komut: "npm test", sureMs: 102_000, mesaj: null, ...ek } });
    d.onaylar.push(
      onay("ise", { tur: "ise_alim", durum: "bekliyor", baslik: "İşe alım: Nil · Test mühendisi" }),
      onay("b1", { tur: "birlestirme", durum: "onaylandi", veri: { ajanId: "deniz", dal: "arnorg/deniz", ...kalite("birlesti", iso(10, 3, 16)) } }),
      onay("b2", { tur: "birlestirme", durum: "onaylandi", veri: { ajanId: "elif", dal: "arnorg/elif", ...kalite("test_basarisiz", iso(10, 4, 7), { mesaj: "Çıkış kodu 1" }) } }),
      onay("b3", { tur: "birlestirme", durum: "onaylandi", veri: { ajanId: "deniz", dal: "arnorg/eski", ...kalite("birlesti", iso(10, 2, 16)) } }),
      onay("b4", { tur: "birlestirme", durum: "reddedildi", sonuclanma: iso(10, 3, 12), not: "Önce testler", veri: { ajanId: "deniz", dal: "arnorg/red" } }),
      onay("b5", { tur: "birlestirme", durum: "onaylandi", veri: { ajanId: "deniz", dal: "arnorg/sirada", ...kalite("kuyrukta", null) } }),
    );
    const oncekiEkip = [
      ...ekipIzi(d.ajanlar.filter((a) => a.id !== "aras")).map((u) => (u.id === "ada" ? { ...u, model: "opus" } : u)),
      { id: "zeynep", ad: "Zeynep", rol: "yazar", rolAdi: "Teknik yazar", model: "haiku" },
    ];
    return { d, oncekiEkip };
  }

  it("son brifingden bu yana biten görevler, şu an sürenler, bekleyen ve bloklular, onaylar, birleşmeler, ekip ve abonelik", () => {
    const { d, oncekiEkip } = kur();
    const v = brifingVerisi({ depo: d.depo, projeId: PID, son: iso(10, 3, 9), kesim: yerel(10, 4, 9), oncekiEkip, hesap: HESAP });
    expect(v.ilk).toBe(false);
    expect(v.baslangic).toBe(iso(10, 3, 9));
    // T-1 son brifingden önce bitti; T-8 iptal
    expect(v.biten).toEqual([{ kod: "T-2", baslik: "Sipariş API'si", kim: "Deniz" }]);
    expect(v.suren).toEqual([
      { kod: "T-3", baslik: "Görev 3", kim: "Elif", durum: "calisiliyor", sureMs: 3 * 3_600_000, ajanDurumu: "duraklatildi" },
      { kod: "T-4", baslik: "Görev 4", kim: "Deniz", durum: "inceleme", sureMs: 30 * 60_000, ajanDurumu: "kapali" },
    ]);
    // Önce bloklu, sonra atanmamış, sonra kalanlar; bağımlılığı bitmiş görev bloklu sayılmaz
    expect(v.bekleyen.map((g) => [g.kod, g.kim, g.bekledigi])).toEqual([
      ["T-5", "Deniz", ["T-3"]],
      ["T-6", null, []],
      ["T-7", "Deniz", []],
    ]);
    expect(v.onaylar).toEqual([{ tur: "ise_alim", baslik: "İşe alım: Nil · Test mühendisi" }]);
    expect(v.birlesmeler.map((b) => [b.dal, b.durum])).toEqual([
      ["arnorg/deniz", "birlesti"],
      ["arnorg/elif", "test_basarisiz"],
      ["arnorg/red", "reddedildi"],
      ["arnorg/sirada", "kuyrukta"],
    ]);
    expect(v.ekip.katilan.map((u) => u.ad)).toEqual(["Aras"]);
    expect(v.ekip.ayrilan.map((u) => u.ad)).toEqual(["Zeynep"]);
    expect(v.ekip.modelDegisen).toEqual([{ ad: "Ada", eski: "opus", yeni: "fable" }]);
    // Yüzdesi bilinmeyen pencere düşer
    expect(v.pencereler.map((p) => p.ad)).toEqual(["5 saatlik pencere", "Haftalık"]);
  });

  it("CEO'ya giden metin: istek, dört bölümlü biçim ve veri; günlük kaynakta 'günlük brifing' denir", () => {
    const { d, oncekiEkip } = kur();
    const v = brifingVerisi({ depo: d.depo, projeId: PID, son: iso(10, 3, 9), kesim: yerel(10, 4, 9), oncekiEkip, hesap: HESAP });
    const m = brifingMetni("kurul", v);
    expect(m.startsWith("Kurul brifing istiyor. Aşağıdaki veriye ve kendi bildiklerine dayanarak kısa bir brifing yaz ve #yonetim kanalına mesaj_gonder ile gönder.")).toBe(true);
    expect(m).toContain("Biçim: **Yaptıklarımız** / **Şu an** / **Sıradaki** / **Kararınızı bekleyen** (her biri en çok 3–4 madde; görev kodlarını yaz; uydurma).");
    expect(m).toContain("[ArnOrg verisi · son brifingden bu yana:");
    expect(m).toContain("Biten görevler (1):\n- T-2 Sipariş API'si · Deniz");
    expect(m).toContain("- T-3 Görev 3 · Elif · çalışılıyor, 3 sa · ajan duraklatıldı");
    expect(m).toContain("- T-4 Görev 4 · Deniz · incelemede, 30 dk");
    expect(m).toContain("- T-5 Görev 5 · Deniz · bloklu: T-3");
    expect(m).toContain("- T-6 Görev 6 · atanmamış");
    expect(m).toContain("- İşe alım: İşe alım: Nil · Test mühendisi");
    expect(m).toContain("- arnorg/deniz birleşti · testler geçti (npm test, 1 dk)");
    expect(m).toContain("- arnorg/elif kalite kapısında kaldı: testler geçmedi (Çıkış kodu 1)");
    expect(m).toContain("- arnorg/red birleştirmesini kurul reddetti (Önce testler)");
    expect(m).toContain("Ekip: Aras (Güvenlik uzmanı) katıldı · Zeynep (Teknik yazar) ayrıldı · Ada: model opus → fable");
    expect(m).toMatch(/Abonelik: 5 saatlik pencere %42 \(sıfırlanma .+\) · Haftalık %18/);
    expect(brifingMetni("gunluk", v).startsWith("Kurul günlük brifing istiyor.")).toBe(true);
  });

  it("ilk brifing son 7 güne bakar; boş bölümler 'yok' der; İngilizce metin aynı veriyi taşır", () => {
    const d = sahteDepo();
    d.projeler.push(proje());
    d.ajanlar.push(ajan({ id: "ada", ad: "Ada", rol: "ceo", olusturma: iso(10, 1, 9) }), ajan({ id: "eski", ad: "Kaan", rol: "devops", olusturma: iso(9, 1, 9) }));
    const v = brifingVerisi({ depo: d.depo, projeId: PID, son: null, kesim: yerel(10, 4, 9), oncekiEkip: null, hesap: null });
    expect(v.ilk).toBe(true);
    expect(Date.parse(v.kesim) - Date.parse(v.baslangic)).toBe(7 * 86_400_000);
    // Önceki ekip kaydı yoksa aralıkta işe alınanlar katılmış sayılır
    expect(v.ekip.katilan.map((u) => u.ad)).toEqual(["Ada"]);
    const tr = brifingMetni("kurul", v);
    expect(tr).toContain("[ArnOrg verisi · ilk brifing, son 7 gün:");
    expect(tr).toContain("Biten görevler: yok");
    expect(tr).not.toContain("Abonelik:");
    dilKaynagi(() => "en");
    try {
      const en = brifingMetni("gunluk", v);
      expect(en.startsWith("The board is asking for the daily briefing. Using the data below")).toBe(true);
      expect(en).toContain("Format: **What we did** / **Right now** / **Up next** / **Awaiting your decision**");
      expect(en).toContain("Tasks done: none");
      expect(en).toContain("Team: Ada (CEO) joined");
      expect(sureMetni(3 * 3_600_000 + 20 * 60_000)).toBe("3 h 20 min");
    } finally {
      dilKaynagi(() => "tr");
    }
    expect(sureMetni(26 * 3_600_000)).toBe("1 gün 2 sa");
    expect(sureMetni(20_000)).toBe("20 sn");
  });
});

describe("brifing isteği", () => {
  function kur(uyandir: BrifingBaglami["uyandir"]) {
    const d = sahteDepo();
    d.projeler.push(proje());
    d.ajanlar.push(ajan({ id: "ada", ad: "Ada", rol: "ceo" }), ajan({ id: "deniz", ad: "Deniz", rol: "backend" }));
    const olaylar = new OlayYolu();
    let simdi = yerel(10, 4, 10);
    const b = new Brifing({ depo: d.depo, olaylar, gunluk: () => ({ acik: true, saat: "09:00" }), hesap: () => HESAP, uyandir, saat: () => simdi });
    return { d, olaylar, b, ileri: (ms: number) => (simdi = new Date(simdi.getTime() + ms)) };
  }
  const ceoYazdi = (olaylar: OlayYolu, m: Partial<Mesaj> = {}) => {
    const yanit = mesaj({ kanal: "yonetim", gonderenId: "ada", zaman: new Date().toISOString(), metin: BRIFING_ORNEGI, ...m });
    olaylar.yayinla({ tur: "mesaj.yeni", mesaj: yanit } as SunucuOlayi);
    return yanit;
  };

  it("aynı anda gelen ikinci istek yeni uyandırma açmaz; CEO #yonetim'e yazınca ya da 5 dakika geçince yeniden uyandırılır", async () => {
    const metinler: string[] = [];
    let coz: () => void = () => undefined;
    const { d, olaylar, b, ileri } = kur((ceo, metin) => {
      expect(ceo.ad).toBe("Ada");
      metinler.push(metin);
      return new Promise<void>((r) => (coz = r));
    });
    const ilk = b.iste(PID, "kurul");
    // Uyandırma sürerken ikinci istek
    expect(await b.iste(PID, "kurul")).toEqual({ durum: "hazirlaniyor" });
    coz();
    expect(await ilk).toEqual({ durum: "istendi" });
    expect(metinler).toHaveLength(1);
    expect(d.kv.get(BRIFING_SON + PID)).toBe(yerel(10, 4, 10).toISOString());
    expect(JSON.parse(d.kv.get(BRIFING_EKIP + PID)!).map((u: { ad: string }) => u.ad)).toEqual(["Ada", "Deniz"]);
    // CEO henüz yazmadı: yine hazırlanıyor; başka kanal ya da başka gönderen isteği kapatmaz
    expect(await b.iste(PID, "kurul")).toEqual({ durum: "hazirlaniyor" });
    ceoYazdi(olaylar, { kanal: "genel" });
    ceoYazdi(olaylar, { gonderenId: "deniz" });
    // CEO'nun brifingle ilgisiz mesajı da kapatmaz
    ceoYazdi(olaylar, { metin: "Kargo anahtarı gerekiyor; ortam değişkeni olarak tanımlar mısınız?" });
    expect(b.hazirlaniyor(PID)).toBe(true);
    // CEO #yonetim'e yazdı: brifing kapandı, yanıtın kimliği kaydedildi, yeni istek yeniden uyandırır
    const yanit = ceoYazdi(olaylar);
    expect(d.kv.get(BRIFING_YANIT + PID)).toBe(yanit.id);
    const ikinci = b.iste(PID, "kurul");
    coz();
    expect(await ikinci).toEqual({ durum: "istendi" });
    expect(metinler).toHaveLength(2);
    // CEO 5 dakika içinde yazmazsa yeni istek yeniden uyandırır
    ileri(HAZIRLANIYOR_MS - 1000);
    expect(await b.iste(PID, "kurul")).toEqual({ durum: "hazirlaniyor" });
    ileri(2000);
    const ucuncu = b.iste(PID, "kurul");
    coz();
    expect(await ucuncu).toEqual({ durum: "istendi" });
    expect(metinler).toHaveLength(3);
    b.durdur();
  });

  it("CEO boştayken uyandırıldıysa brifing turu bitince istek kapanır (biçime uymasa da); başka bir turun ortasındaysa yalnız brifing kapatır", async () => {
    const { d, olaylar, b } = kur(async () => undefined);
    const ada = () => d.ajanlar.find((a) => a.id === "ada")!;
    const durum = (durum: AjanDurumu) => olaylar.yayinla({ tur: "ajan.guncellendi", ajan: { ...ada(), durum } } as SunucuOlayi);
    // Boştaki CEO: çalışması görülmeden gelen "bosta" kapatmaz; çalışıp boşa düşünce kapanır, son mesajı yanıt sayılır
    expect(await b.iste(PID, "kurul")).toEqual({ durum: "istendi" });
    durum("bosta");
    expect(b.hazirlaniyor(PID)).toBe(true);
    durum("calisiyor");
    const yanit = ceoYazdi(olaylar, { metin: "Durum raporu: değişiklik yok." });
    expect(b.hazirlaniyor(PID)).toBe(true);
    durum("bosta");
    expect(b.hazirlaniyor(PID)).toBe(false);
    expect(d.kv.get(BRIFING_YANIT + PID)).toBe(yanit.id);
    // Başka bir turun ortasındaki CEO: o turun bitişi ve ilgisiz mesajı kapatmaz, brifing kapatır
    ada().durum = "calisiyor";
    expect(await b.iste(PID, "kurul")).toEqual({ durum: "istendi" });
    ceoYazdi(olaylar, { metin: "Kargo anahtarı gerekiyor." });
    durum("bosta");
    durum("calisiyor");
    expect(b.hazirlaniyor(PID)).toBe(true);
    const brifing = ceoYazdi(olaylar);
    expect(b.hazirlaniyor(PID)).toBe(false);
    expect(d.kv.get(BRIFING_YANIT + PID)).toBe(brifing.id);
    b.durdur();
  });

  it("brifing tanıma: dört bölümden en az üçü başlık satırı olmalı; iki dil ve başlık biçimleri", () => {
    expect(brifingGibiMi(BRIFING_ORNEGI)).toBe(true);
    expect(brifingGibiMi("## Şu an\n- T-3\n## Sıradaki\n- T-4\n1. Kararınızı bekleyenler: yok")).toBe(true);
    expect(brifingGibiMi("**What we did**\n- T-2\n**Right now:** T-3\n**Up next**\n- T-4")).toBe(true);
    // İki bölüm ya da cümle içinde geçen sözler brifing değildir
    expect(brifingGibiMi("**Şu an**\n- T-3\n**Sıradaki**\n- T-4")).toBe(false);
    expect(brifingGibiMi("Şu an T-3 üzerindeyiz. Sıradaki iş T-4. Yaptıklarımız iyi gidiyor.")).toBe(false);
  });

  it("CEO yoksa 409; uyandırılamazsa istek kapanır ve veri aralığı ilerlemez", async () => {
    let hata = true;
    const { d, b } = kur(async () => {
      if (hata) throw new ArnorgHatasi("Claude Code bulunamadı.", 500);
    });
    await expect(b.iste(PID, "kurul")).rejects.toThrow("Claude Code bulunamadı.");
    expect(b.hazirlaniyor(PID)).toBe(false);
    expect(d.kv.has(BRIFING_SON + PID)).toBe(false);
    hata = false;
    expect(await b.iste(PID, "kurul")).toEqual({ durum: "istendi" });
    d.ajanlar.splice(0, 1);
    const yok = await b.iste(PID, "kurul").catch((h: unknown) => h);
    expect(yok).toBeInstanceOf(ArnorgHatasi);
    expect((yok as ArnorgHatasi).durumKodu).toBe(409);
    expect((yok as Error).message).toBe("Bu projede CEO yok; brifing için önce bir CEO işe alın.");
    await expect(b.iste("yok", "kurul")).rejects.toThrow("Proje bulunamadı.");
    b.durdur();
  });
});

describe("günlük brifing", () => {
  const ayar = { acik: true, saat: "09:00" };

  it("karar: saat geçti mi, bugün verildi mi, hareket var mı", () => {
    const temel = { ayar, simdi: yerel(10, 4, 9, 30), verilenGun: "2026-10-03", olusturma: iso(9, 1, 10), hazir: true, hareketVar: true };
    expect(gunlukKarar(temel)).toBe("ver");
    expect(gunlukKarar({ ...temel, simdi: yerel(10, 4, 8, 59) })).toBe("bekle");
    expect(gunlukKarar({ ...temel, ayar: { acik: false, saat: "09:00" } })).toBe("bekle");
    expect(gunlukKarar({ ...temel, verilenGun: bugun(yerel(10, 4, 9, 30)) })).toBe("bekle");
    // Uygulama o saatte kapalıydı: açılınca aynı gün içinde verilir
    expect(gunlukKarar({ ...temel, simdi: yerel(10, 4, 23, 50), verilenGun: null })).toBe("ver");
    expect(gunlukKarar({ ...temel, hareketVar: false })).toBe("atla");
    expect(gunlukKarar({ ...temel, hazir: false })).toBe("atla");
    // Saatten sonra açılan proje bugünü atlar
    expect(gunlukKarar({ ...temel, olusturma: iso(10, 4, 9, 10) })).toBe("atla");
    // Hareket yalnız karar ona kalırsa hesaplanır
    const hesaplanmaz = () => {
      throw new Error("hesaplanmamalıydı");
    };
    expect(gunlukKarar({ ...temel, simdi: yerel(10, 4, 8), hareketVar: hesaplanmaz })).toBe("bekle");
    expect(gunlukKarar({ ...temel, ayar: { acik: true, saat: "18:45" }, simdi: yerel(10, 4, 18, 45), hareketVar: () => true })).toBe("ver");
  });

  it("ayar: bozuk alan yedeğe düşer", () => {
    expect(gunlukBrifingAyari(undefined)).toEqual({ acik: true, saat: "09:00" });
    expect(gunlukBrifingAyari({ acik: false, saat: "7:30" })).toEqual({ acik: false, saat: "09:00" });
    expect(gunlukBrifingAyari({ saat: "23:59" }, { acik: false, saat: "08:00" })).toEqual({ acik: false, saat: "23:59" });
    expect(gunlukBrifingAyari({ acik: "evet", saat: "24:00" }, { acik: false, saat: "08:00" })).toEqual({ acik: false, saat: "08:00" });
  });

  it("zamanlayıcı: saatte bir kez ister; ertesi gün hareket yoksa atlar (brifingin yanıtı hareket sayılmaz); sınırda bekler", async () => {
    const d = sahteDepo();
    d.projeler.push(proje(), proje({ id: "p2", ad: "Hazırlıkta", hazirlik: "suruyor" }), proje({ id: "p3", ad: "Erişilemez" }));
    d.ajanlar.push(ajan({ id: "ada", ad: "Ada", rol: "ceo" }), ajan({ id: "lale", ad: "Lale", rol: "ceo", projeId: "p2" }), ajan({ id: "can", ad: "Can", rol: "ceo", projeId: "p3" }));
    d.gorevler.push(gorev(1, { durum: "calisiliyor", guncelleme: iso(10, 3, 18) }));
    const olaylar = new OlayYolu();
    const istenen: string[] = [];
    let simdi = yerel(10, 4, 8, 59);
    let gunluk = { acik: true, saat: "09:00" };
    let sinir: { pencere: string; yuzde: number; sinirYuzde: number; sifirlanma: string | null } | null = null;
    const b = new Brifing({
      depo: d.depo,
      olaylar,
      gunluk: () => gunluk,
      hesap: () => ({ pencereler: [], sinir }),
      uyandir: async (ceo, metin) => void istenen.push(`${ceo.ad}: ${metin.split("\n")[0]}`),
      erisilebilir: (p) => p.id !== "p3",
      saat: () => simdi,
    });

    expect(await b.gunlukDenetle()).toEqual({ istenen: [], atlanan: [] });
    simdi = yerel(10, 4, 9, 1);
    expect(await b.gunlukDenetle()).toEqual({ istenen: [PID], atlanan: ["p2"] });
    expect(istenen).toEqual(["Ada: Kurul günlük brifing istiyor. Aşağıdaki veriye ve kendi bildiklerine dayanarak kısa bir brifing yaz ve #yonetim kanalına mesaj_gonder ile gönder. Biçim: **Yaptıklarımız** / **Şu an** / **Sıradaki** / **Kararınızı bekleyen** (her biri en çok 3–4 madde; görev kodlarını yaz; uydurma)."]);
    expect(d.kv.get(BRIFING_GUNLUK + PID)).toBe("2026-10-04");
    expect(d.kv.has(BRIFING_GUNLUK + "p3")).toBe(false);
    // Aynı gün yeniden istenmez
    simdi = yerel(10, 4, 9, 2);
    expect(await b.gunlukDenetle()).toEqual({ istenen: [], atlanan: [] });

    // CEO yanıtladı; ertesi gün başka hareket yok: brifingin yanıtı ve ArnOrg duyurusu hareket sayılmaz, gün atlanır
    const yanit = mesaj({ kanal: "yonetim", gonderenId: "ada", zaman: iso(10, 4, 9, 3), metin: BRIFING_ORNEGI });
    d.mesajlar.push(yanit, mesaj({ kanal: "genel", gonderenId: "arnorg", zaman: iso(10, 4, 12) }));
    olaylar.yayinla({ tur: "mesaj.yeni", mesaj: yanit } as SunucuOlayi);
    simdi = yerel(10, 5, 9, 0);
    // Hazırlık görüşmesi süren proje her gün atlanır
    expect(await b.gunlukDenetle()).toEqual({ istenen: [], atlanan: [PID, "p2"] });
    expect(istenen).toHaveLength(1);

    // Kurul #genel'e yazdı: ertesi gün brifing verilir; abonelik sınırında beklenir, açılınca aynı gün içinde verilir
    d.mesajlar.push(mesaj({ kanal: "genel", gonderenId: "kurul", zaman: iso(10, 5, 15) }));
    simdi = yerel(10, 6, 9, 0);
    sinir = { pencere: "Haftalık", yuzde: 96, sinirYuzde: 95, sifirlanma: null };
    expect(await b.gunlukDenetle()).toEqual({ istenen: [], atlanan: [] });
    sinir = null;
    simdi = yerel(10, 6, 13, 0);
    expect(await b.gunlukDenetle()).toEqual({ istenen: [PID], atlanan: ["p2"] });
    expect(istenen).toHaveLength(2);

    // Ayar kapalıysa hiç bakılmaz
    gunluk = { acik: false, saat: "09:00" };
    simdi = yerel(10, 7, 10);
    d.gorevler.push(gorev(2, { durum: "bekleyen", olusturma: iso(10, 6, 20), guncelleme: iso(10, 6, 20) }));
    expect(await b.gunlukDenetle()).toEqual({ istenen: [], atlanan: [] });
    b.durdur();
  });

  it("uyandırılamazsa kurul uyarılır ve aynı gün yeniden denenmez", async () => {
    const d = sahteDepo();
    d.projeler.push(proje());
    d.ajanlar.push(ajan({ id: "ada", ad: "Ada", rol: "ceo" }));
    d.gorevler.push(gorev(1, { durum: "bekleyen", olusturma: iso(10, 3, 18), guncelleme: iso(10, 3, 18) }));
    const hatalar: string[] = [];
    const uyandir = vi.fn(async () => {
      throw new Error("Oturumlar bu çalıştırmada kapalı.");
    });
    const b = new Brifing({ depo: d.depo, olaylar: new OlayYolu(), gunluk: () => ({ acik: true, saat: "09:00" }), hesap: () => HESAP, uyandir, hata: (p, h) => hatalar.push(`${p.ad}: ${h.message}`), saat: () => yerel(10, 4, 9, 5) });
    expect(await b.gunlukDenetle()).toEqual({ istenen: [], atlanan: [] });
    expect(await b.gunlukDenetle()).toEqual({ istenen: [], atlanan: [] });
    expect(uyandir).toHaveBeenCalledTimes(1);
    expect(hatalar).toEqual(["Sipariş Paneli: Oturumlar bu çalıştırmada kapalı."]);
    b.durdur();
  });
});

describe("Şirket ve API: brifing, günlük brifing ayarı, model kataloğu", () => {
  let gecici: string;
  let depo: Depo;
  let sirket: Sirket;
  let app: FastifyInstance;
  const olaylar = new OlayYolu();
  const gelenler: SunucuOlayi[] = [];
  const anahtar = "test-anahtari-0123456789abcdef";
  let h: Record<string, string>;
  let pid: string;
  let ceosuz: string;

  beforeAll(async () => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-brifing-"));
    const yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
    sirket = new Sirket(depo, olaylar, yap, () => null, true);
    olaylar.dinle((o) => gelenler.push(o));
    pid = depo.projeEkle({ ad: "Brifing", yol: path.join(gecici, "repo"), aciklama: "", varsayilanDal: "main" }).id;
    sirket.iseAl(pid, { ad: "Ada", rol: "ceo" });
    sirket.iseAl(pid, { ad: "Deniz", rol: "backend" });
    ceosuz = depo.projeEkle({ ad: "CEO'suz", yol: path.join(gecici, "ceosuz"), aciklama: "", varsayilanDal: "main" }).id;
    app = await sunucuKur({ sirket, terminaller: new TerminalYoneticisi(), erisimAnahtari: anahtar, studyoDizini: null, izinliHostlar: [] });
    await app.listen({ port: 0, host: "127.0.0.1" });
    h = { host: `127.0.0.1:${(app.server.address() as { port: number }).port}`, authorization: `Bearer ${anahtar}` };
  });

  afterAll(async () => {
    await app.close();
    sirket.kapat();
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true });
  });

  it("POST /brifing CEO'yu kurul kaynağıyla uyandırır, #yonetim'de yazıyor gösterir; ikinci istek hazırlanıyor döner", async () => {
    const ceo = depo.ajanAdla(pid, "Ada")!;
    const mesaj = vi.spyOn(sirket, "ajanaMesaj").mockImplementation(async (id) => {
      depo.ajanGuncelle(id, { durum: "calisiyor" });
    });
    try {
      const once = gelenler.length;
      const ilk = await app.inject({ method: "POST", url: `/api/projeler/${pid}/brifing`, headers: h });
      expect(ilk.statusCode).toBe(200);
      expect(ilk.json()).toEqual({ durum: "istendi" });
      expect(mesaj).toHaveBeenCalledTimes(1);
      expect(mesaj.mock.calls[0]![0]).toBe(ceo.id);
      expect(mesaj.mock.calls[0]![1]).toMatch(/^Kurul brifing istiyor\./);
      expect(mesaj.mock.calls[0]!.slice(2)).toEqual(["next", { tur: "kurul" }]);
      expect(gelenler.slice(once)).toContainEqual({ tur: "kanal.yaziyor", projeId: pid, kanal: "yonetim", ajanId: ceo.id, ad: "Ada", yaziyor: true });

      const ikinci = await app.inject({ method: "POST", url: `/api/projeler/${pid}/brifing`, headers: h });
      expect(ikinci.json()).toEqual({ durum: "hazirlaniyor" });
      expect(mesaj).toHaveBeenCalledTimes(1);

      // CEO brifingi #yonetim'e yazdı: yazıyor biter, sonraki istek yeniden uyandırır
      await sirket.mesajGonder(pid, "yonetim", ceo.id, BRIFING_ORNEGI);
      expect(gelenler.at(-2)).toMatchObject({ tur: "kanal.yaziyor", kanal: "yonetim", ajanId: ceo.id, yaziyor: false });
      expect((await app.inject({ method: "POST", url: `/api/projeler/${pid}/brifing`, headers: h })).json()).toEqual({ durum: "istendi" });
      expect(mesaj).toHaveBeenCalledTimes(2);
    } finally {
      mesaj.mockRestore();
    }
  });

  it("CEO yoksa 409; CEO uyandırılamazsa hata döner ve yazıyor biter", async () => {
    const yok = await app.inject({ method: "POST", url: `/api/projeler/${ceosuz}/brifing`, headers: h });
    expect(yok.statusCode).toBe(409);
    expect(yok.json()).toEqual({ hata: "Bu projede CEO yok; brifing için önce bir CEO işe alın." });
    // Oturumsuz kipte CEO uyandırılamaz (503): istek kapanır
    const s = sirket as unknown as { brifing: Brifing };
    await sirket.mesajGonder(pid, "yonetim", depo.ajanAdla(pid, "Ada")!.id, BRIFING_ORNEGI);
    expect(s.brifing.hazirlaniyor(pid)).toBe(false);
    const hatali = await app.inject({ method: "POST", url: `/api/projeler/${pid}/brifing`, headers: h });
    expect(hatali.statusCode).toBe(503);
    expect(s.brifing.hazirlaniyor(pid)).toBe(false);
    expect(gelenler.at(-1)).toMatchObject({ tur: "kanal.yaziyor", kanal: "yonetim", yaziyor: false });
  });

  it("günlük brifing ayarı ayarlar ucundan okunur ve yazılır; geçersiz saat reddedilir", async () => {
    const ayarlar = (await app.inject({ url: "/api/ayarlar", headers: h })).json() as { gunlukBrifing: unknown };
    expect(ayarlar.gunlukBrifing).toEqual({ acik: true, saat: "09:00" });
    const yaz = await app.inject({ method: "PUT", url: "/api/ayarlar", headers: h, payload: { gunlukBrifing: { acik: false, saat: "07:30" } } });
    expect(yaz.statusCode).toBe(200);
    expect(yaz.json()).toMatchObject({ gunlukBrifing: { acik: false, saat: "07:30" } });
    expect(sirket.yapilandirma.ayarlar.gunlukBrifing).toEqual({ acik: false, saat: "07:30" });
    const kotu = await app.inject({ method: "PUT", url: "/api/ayarlar", headers: h, payload: { gunlukBrifing: { acik: true, saat: "7:30" } } });
    expect(kotu.statusCode).toBe(400);
    expect(sirket.yapilandirma.ayarlar.gunlukBrifing).toEqual({ acik: false, saat: "07:30" });
    // Dosyaya yazılır: yeniden açılışta okunur
    expect(new Yapilandirma(path.join(gecici, "veri")).ayarlar.gunlukBrifing).toEqual({ acik: false, saat: "07:30" });
  });

  it("GET /api/modeller kataloğu döner (oturumsuz kipte sabit yedek)", async () => {
    const y = await app.inject({ url: "/api/modeller", headers: h });
    expect(y.statusCode).toBe(200);
    expect(y.json()).toMatchObject({ kaynak: "yedek", guncelleme: null, modeller: [{ deger: "sonnet", ad: "Sonnet 5.5" }, { deger: "fable", ad: "Fable 5.1", kimlik: "claude-fable-5-1" }, { deger: "opus" }, { deger: "haiku" }] });
  });
});
