// Kurulun kanalında serbest konuşma (oturumsuz, sahte bağlam ve sahte zamanlayıcı): sıradaki konuşmacı, tek bekleyen
// konuşmacı, durdurma, kurula tek yanıt, yanıt vermeyen üyenin atlanması, tavan sırası, abonelik sınırı
import { ARNORG_GONDEREN, KURUL, type AjanDurumu, type Kanal, type Mesaj } from "@arnorg/ortak";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dilKaynagi } from "./dil.js";
import { KanalKonusmasi, siradakiKonusmaci, uyandirmaMetni, YANIT_SURESI_MS, YANITSIZ_BITIS_MS, type KonusmaBaglami } from "./kanal-konusmasi.js";

const BEKLEME = 2000;

/** Bellekte tek kurul kanalı ve üç ajan; uyandırılan ajan çalışmaya başlar, yazınca boşa çıkar (Şirket'teki gibi) */
function sahne(uyeler = ["a", "b", "c"]) {
  const ajanlar = new Map<string, { id: string; ad: string; projeId: string; durum: AjanDurumu }>(
    [
      ["a", "Ada"],
      ["b", "Bora"],
      ["c", "Cem"],
      ["d", "Deniz"],
    ].map(([id, ad]) => [id!, { id: id!, ad: ad!, projeId: "p", durum: "bosta" as AjanDurumu }]),
  );
  const kanal: Kanal = { ad: "tasarim", aciklama: "", mesajSayisi: 0, ozel: true, uyeler, konusma: "durdu", konu: null, konusmaBaslangic: null, olusturma: "" };
  const mesajlar: Mesaj[] = [];
  const uyandirilan: { id: string; metin: string; kurul: boolean }[] = [];
  const duyurular: string[] = [];
  const yazanlar = new Set<string>();
  const sirada = new Set<string>();
  /** Uyanamayacak ajanlar (Claude Code yok, oturum açılamadı) */
  const uyanamaz = new Set<string>();
  const ayar = { sinir: false };
  let sayac = 0;

  const b: KonusmaBaglami = {
    kanal: (pid, ad) => (pid === "p" && ad === kanal.ad ? { ...kanal, uyeler: [...(kanal.uyeler ?? [])] } : null),
    durumYaz: (_pid, _ad, alanlar) => {
      Object.assign(kanal, alanlar);
    },
    surenKonusmalar: () => (kanal.konusma === "suruyor" ? [{ projeId: "p", kanal: kanal.ad }] : []),
    ajan: (id) => ajanlar.get(id) ?? null,
    mesajlar: (_pid, k, sinir) => mesajlar.filter((m) => m.kanal === k).slice(-sinir),
    sinirda: () => ayar.sinir,
    siradaMi: (id) => sirada.has(id),
    uyandir: async (id, metin, kurul) => {
      uyandirilan.push({ id, metin, kurul });
      if (uyanamaz.has(id)) return false;
      if (!sirada.has(id)) ajanlar.get(id)!.durum = "calisiyor";
      return true;
    },
    yaziyor: (id, _pid, _k, acik) => {
      if (acik) yazanlar.add(id);
      else yazanlar.delete(id);
    },
    duyur: (_pid, _k, metin) => {
      duyurular.push(metin);
    },
    bekleme: () => BEKLEME,
  };
  const motor = new KanalKonusmasi(b);

  /** Kanala mesaj düşer (mesaj.yeni olayı); yazan ajanın yazıyor göstergesi biter ve boşa çıkar */
  const yaz = async (gonderenId: string, metin: string, anilanlar: string[] = []) => {
    const m: Mesaj = {
      id: `m${++sayac}`,
      projeId: "p",
      kanal: kanal.ad,
      gonderenId,
      gonderenAd: gonderenId === KURUL ? "Yönetim kurulu" : gonderenId === ARNORG_GONDEREN ? "ArnOrg" : ajanlar.get(gonderenId)!.ad,
      metin,
      anilanlar,
      zaman: new Date().toISOString(),
    };
    mesajlar.push(m);
    yazanlar.delete(gonderenId);
    const a = ajanlar.get(gonderenId);
    if (a) a.durum = "bosta";
    motor.olay({ tur: "mesaj.yeni", mesaj: m });
    await vi.advanceTimersByTimeAsync(0);
    return m;
  };
  const gec = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  const kimler = () => uyandirilan.map((u) => u.id);
  const sira = () => motor.siradaki("p", kanal.ad);
  return { motor, kanal, ajanlar, mesajlar, uyandirilan, duyurular, yazanlar, sirada, uyanamaz, ayar, yaz, gec, kimler, sira };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  dilKaynagi(() => "tr");
});

describe("sıradaki konuşmacı", () => {
  const uyeler = ["a", "b", "c"];

  it("mesajda anılan üye önce gelir; gönderen, üye olmayan ve uygun olmayan anılan atlanır", () => {
    expect(siradakiKonusmaci({ uyeler, gonderen: "a", anilanlar: ["c"] })).toBe("c");
    expect(siradakiKonusmaci({ uyeler, gonderen: "a", anilanlar: ["a", "x", "c", "b"] })).toBe("c");
    expect(siradakiKonusmaci({ uyeler, gonderen: "a", anilanlar: ["c"], uygun: (id) => id !== "c" })).toBe("b");
  });

  it("anılan yoksa listede gönderenden sonraki üye (döngüsel); gönderen kendi ardından gelmez", () => {
    expect(siradakiKonusmaci({ uyeler, gonderen: "a" })).toBe("b");
    expect(siradakiKonusmaci({ uyeler, gonderen: "c" })).toBe("a");
    expect(siradakiKonusmaci({ uyeler, gonderen: "a", uygun: (id) => id !== "b" })).toBe("c");
    expect(siradakiKonusmaci({ uyeler: ["a"], gonderen: "a" })).toBeNull();
    expect(siradakiKonusmaci({ uyeler, gonderen: "a", uygun: () => false })).toBeNull();
  });

  it("kurulun mesajında son konuşan üyeden sonrası; kimse konuşmadıysa listenin başı; tek üye de yanıt verir", () => {
    expect(siradakiKonusmaci({ uyeler, gonderen: null, sonra: "b" })).toBe("c");
    expect(siradakiKonusmaci({ uyeler, gonderen: null, sonra: null })).toBe("a");
    expect(siradakiKonusmaci({ uyeler: ["a"], gonderen: null, sonra: "a" })).toBe("a");
    expect(siradakiKonusmaci({ uyeler, gonderen: KURUL, anilanlar: ["b"] })).toBe("b");
  });
});

describe("serbest konuşma", () => {
  it("sürerken her üye mesajından sonra kısa beklemeyle TEK sıradaki üye uyanır; zincir döngüsel sürer", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    expect(s.kanal.konusma).toBe("suruyor");
    expect(s.sira()).toEqual({ ajanId: "a", asama: "bekliyor" });
    // Bekleme süresince "yazıyor" görünür, uyandırma henüz yok
    expect(s.yazanlar.has("a")).toBe(true);
    expect(s.kimler()).toEqual([]);
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a"]);
    expect(s.uyandirilan[0]!.kurul).toBe(false);
    expect(s.sira()).toEqual({ ajanId: "a", asama: "yaziyor" });

    await s.yaz("a", "Renk paletini konuşalım.");
    expect(s.sira()).toEqual({ ajanId: "b", asama: "bekliyor" });
    await s.gec(BEKLEME);
    await s.yaz("b", "Mercan tek vurgu kalsın.");
    await s.gec(BEKLEME);
    await s.yaz("c", "Katılıyorum.");
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "b", "c", "a"]);
    // Uyandırma metni kanalı, son mesajları ve nasıl yanıt verileceğini anlatır
    const son = s.uyandirilan.at(-1)!.metin;
    expect(son).toContain("#tasarim kanalında serbest konuşma sürüyor; sıra sende.");
    expect(son).toContain("- Bora: Mercan tek vurgu kalsın.");
    expect(son).toContain("Son mesajlara kısa ve doğal bir yanıt ver; söyleneni tekrarlama, konuşmayı bir adım ileri taşı.");
    expect(son).toContain('Yanıtını mcp__arnorg__mesaj_gonder ile #tasarim kanalına yaz (kanal: "tasarim").');
    expect(son).toContain("@Ad ile an");
    expect(son).toContain("İşin varsa işine dönmeden önce yalnız bir mesaj yaz; işin yoksa yanıtını yazınca dur.");
  });

  it("@ ile anılan üye sıradakinin önüne geçer", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    await s.yaz("a", "@Cem sen ne dersin?", ["c"]);
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "c"]);
  });

  it("aynı anda en çok bir bekleyen konuşmacı: art arda gelen mesajlar bekleyeni yeniler, yanıt yazan varken yenisi eklenmez", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    // a yazdı, b beklerken c araya girdi: bekleyen b değil c'den sonraki a olur; tek uyandırma
    await s.yaz("a", "Başlıyorum.");
    await s.yaz("c", "Bir ekleme.");
    expect(s.sira()).toEqual({ ajanId: "a", asama: "bekliyor" });
    expect(s.yazanlar.has("b")).toBe(false);
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "a"]);
    // a yanıt yazarken b de yazdı: zincir a'nın mesajından sürer, ikinci bekleyen açılmaz
    await s.yaz("b", "Ben de buradayım.");
    expect(s.sira()).toEqual({ ajanId: "a", asama: "yaziyor" });
    await s.gec(BEKLEME * 3);
    expect(s.kimler()).toEqual(["a", "a"]);
    await s.yaz("a", "Tamam.");
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "a", "b"]);
  });

  it("durdurunca bekleyen uyandırma iptal olur; yanıt yazan üye bitirir ama zincir sürmez", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    await s.yaz("a", "İlk görüş.");
    expect(s.sira()?.asama).toBe("bekliyor");
    s.motor.durdur("p", "tasarim");
    expect(s.kanal.konusma).toBe("durdu");
    expect(s.sira()).toBeNull();
    expect(s.yazanlar.has("b")).toBe(false);
    await s.gec(YANIT_SURESI_MS);
    expect(s.kimler()).toEqual(["a"]);
    // Yeniden başlayınca son konuşandan sonraki üye sürdürür; yanıt yazarken durdurulursa mesajı gelir, zincir sürmez
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "b"]);
    s.motor.durdur("p", "tasarim");
    expect(s.sira()).toEqual({ ajanId: "b", asama: "yaziyor" });
    await s.yaz("b", "Son sözüm.");
    expect(s.sira()).toBeNull();
    await s.gec(YANIT_SURESI_MS * 2);
    expect(s.kimler()).toEqual(["a", "b"]);
    // Kurulun durdurmasında kanala duyuru düşmez
    expect(s.duyurular).toEqual([]);
  });

  it("konuşma durmuşken kurulun mesajına tek yanıt gelir: anma yoksa sıradaki üye, anılanlar varsa onlar", async () => {
    const s = sahne();
    await s.yaz(KURUL, "Ana sayfa nasıl olsun?");
    expect(s.kimler()).toEqual(["a"]);
    expect(s.uyandirilan[0]).toMatchObject({ kurul: true });
    expect(s.uyandirilan[0]!.metin).toContain("Yönetim kurulu #tasarim kanalına yazdı; yanıt sende.");
    expect(s.uyandirilan[0]!.metin).not.toContain("@Ad ile an");
    await s.yaz("a", "Sade bir giriş öneririm.");
    await s.gec(YANIT_SURESI_MS);
    expect(s.kimler()).toEqual(["a"]);
    // Sonraki kurul mesajında son konuşandan sonraki üye yanıt verir
    await s.yaz(KURUL, "Peki renkler?");
    expect(s.kimler()).toEqual(["a", "b"]);
    await s.yaz("b", "Mercan.");
    // Anılan üyeler yanıt verir; üye olmayan anılanı Şirket uyandırır (burada değil)
    await s.yaz(KURUL, "@Ada @Cem @Deniz siz?", ["a", "c", "d"]);
    expect(s.kimler()).toEqual(["a", "b", "a", "c"]);
    await s.yaz("a", "Bence koyu zemin.");
    await s.yaz("c", "Katılıyorum.");
    await s.gec(YANIT_SURESI_MS * 2);
    expect(s.kimler()).toEqual(["a", "b", "a", "c"]);
  });

  it("konuşma sürerken kurul yazarsa: bekleyen yerine sıradaki üye hemen yanıt verir ve zincir sürer", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    await s.yaz("a", "Görüşüm şu.");
    expect(s.sira()).toEqual({ ajanId: "b", asama: "bekliyor" });
    await s.yaz(KURUL, "Kısa tutun lütfen.");
    expect(s.kimler()).toEqual(["a", "b"]);
    expect(s.uyandirilan[1]!.kurul).toBe(true);
    expect(s.sira()).toEqual({ ajanId: "b", asama: "yaziyor" });
    await s.gec(BEKLEME * 2);
    expect(s.kimler()).toEqual(["a", "b"]);
    await s.yaz("b", "Tamam, kısa.");
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "b", "c"]);
    expect(s.uyandirilan[2]!.metin).toContain("- Yönetim kurulu: Kısa tutun lütfen.");
  });

  it("konuşma sürerken kurul yalnız üye olmayanı anarsa ve sırada kimse yoksa konuşma sıradaki üyeyle sürer", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", "Konu");
    await s.yaz(KURUL, "@Deniz sen de katıl", ["d"]);
    expect(s.kimler()).toEqual(["a"]);
    expect(s.sira()).toEqual({ ajanId: "a", asama: "yaziyor" });
    // Konuşma durmuşken yalnız anılan (üye olmayan) yanıt verir; burada kimse uyanmaz
    s.motor.durdur("p", "tasarim");
    await s.yaz("a", "Merhaba.");
    await s.yaz(KURUL, "@Deniz bir de sen?", ["d"]);
    expect(s.kimler()).toEqual(["a"]);
  });

  it("yanıt vermeyen üye atlanır; üyelerin hepsi art arda susarsa konuşma durur ve kanala duyuru düşer", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    await s.yaz("a", "Başlayalım.");
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "b"]);
    // b 4 dakika yazmadı: c'ye geçilir
    await s.gec(YANIT_SURESI_MS);
    expect(s.yazanlar.has("b")).toBe(false);
    expect(s.sira()).toEqual({ ajanId: "c", asama: "bekliyor" });
    await s.gec(BEKLEME);
    // c uyanır ve yazar: sayaç sıfırlanır
    await s.yaz("c", "Ben buradayım.");
    expect(s.sira()?.ajanId).toBe("a");
    // Uyanamayan üye (oturum açılamadı) beklemeden atlanır; üçü art arda susunca konuşma durur
    s.uyanamaz.add("a").add("b").add("c");
    await s.gec(BEKLEME * 3);
    expect(s.kimler()).toEqual(["a", "b", "c", "a", "b", "c"]);
    expect(s.kanal.konusma).toBe("durdu");
    expect(s.sira()).toBeNull();
    expect(s.duyurular).toEqual(["Üyeler art arda yanıt vermedi; konuşma durdu."]);
  });

  it("uyandırılan üyenin oturumu hata verirse sıradakine beklemeden geçilir", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    s.ajanlar.get("a")!.durum = "hata";
    s.motor.olay({ tur: "ajan.guncellendi", ajan: { ...s.ajanlar.get("a")!, durum: "hata" } as never });
    expect(s.sira()).toEqual({ ajanId: "b", asama: "bekliyor" });
  });

  it("turu kanala yazmadan biten üye kısa süre sonra atlanır; kuyruktaki turu başlarsa yanıtı beklenir", async () => {
    const s = sahne();
    const durum = (id: string, d: AjanDurumu) => {
      s.ajanlar.get(id)!.durum = d;
      s.motor.olay({ tur: "ajan.guncellendi", ajan: { ...s.ajanlar.get(id)! } as never });
    };
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    // a'nın önceki turu bitti, kuyruktaki tur (bu konuşma) hemen başladı: atlanmaz
    durum("a", "bosta");
    durum("a", "calisiyor");
    await s.gec(YANITSIZ_BITIS_MS * 2);
    expect(s.sira()).toEqual({ ajanId: "a", asama: "yaziyor" });
    // Tur kanala yazmadan bitti: kısa süre sonra b'ye geçilir
    durum("a", "bosta");
    await s.gec(YANITSIZ_BITIS_MS - 1);
    expect(s.sira()?.ajanId).toBe("a");
    await s.gec(1);
    expect(s.sira()).toEqual({ ajanId: "b", asama: "bekliyor" });
  });

  it("eşzamanlı tavan doluysa sıradaki konuşmacı sırada bekler: atlanmaz, sırası gelince yanıtı zinciri sürdürür", async () => {
    const s = sahne();
    s.sirada.add("a");
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a"]);
    // Sırada beklerken "kapalı" görünse de atlanmaz; süre dolsa da beklenir
    s.motor.olay({ tur: "ajan.guncellendi", ajan: { ...s.ajanlar.get("a")!, durum: "kapali" } as never });
    await s.gec(YANIT_SURESI_MS * 3);
    expect(s.sira()).toEqual({ ajanId: "a", asama: "yaziyor" });
    s.sirada.delete("a");
    await s.yaz("a", "Sıram geldi.");
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a", "b"]);
  });

  it("abonelik sınırına gelinince konuşma kendiliğinden durur ve duyurulur", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    await s.yaz("a", "Bir fikir.");
    s.ayar.sinir = true;
    await s.gec(BEKLEME);
    expect(s.kimler()).toEqual(["a"]);
    expect(s.kanal.konusma).toBe("durdu");
    expect(s.duyurular).toEqual(["Abonelik kullanım sınırına gelindi; konuşma durdu. Pencere açılınca yeniden başlatabilirsiniz."]);
    // Sınır olayı süren konuşmayı hemen durdurur
    s.ayar.sinir = false;
    s.motor.baslat("p", "tasarim", null);
    s.motor.olay({ tur: "hesap.guncellendi", hesap: { sinir: { pencere: "5 saat", yuzde: 91, sinirYuzde: 90, sifirlanma: null } } as never });
    expect(s.kanal.konusma).toBe("durdu");
    expect(s.sira()).toBeNull();
    expect(s.duyurular).toHaveLength(2);
  });

  it("sırası gelen üye çıkarılınca sıra geçer; iki üyeden aza düşünce konuşma durur", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    await s.yaz("a", "Merhaba.");
    expect(s.sira()?.ajanId).toBe("b");
    s.kanal.uyeler = ["a", "c"];
    s.motor.uyelerDegisti("p", "tasarim");
    expect(s.sira()).toEqual({ ajanId: "c", asama: "bekliyor" });
    s.kanal.uyeler = ["a"];
    s.motor.uyelerDegisti("p", "tasarim");
    expect(s.sira()).toBeNull();
    expect(s.kanal.konusma).toBe("durdu");
    expect(s.duyurular).toEqual(["Konuşmayı sürdürecek üye kalmadı; konuşma durdu."]);
  });

  it("ArnOrg duyurusu ve üye olmayan ajanın mesajı sırayı değiştirmez", async () => {
    const s = sahne();
    s.motor.baslat("p", "tasarim", null);
    await s.gec(BEKLEME);
    await s.yaz(ARNORG_GONDEREN, "Bilgi.");
    await s.yaz("d", "Ben de bir şey diyeyim.");
    expect(s.sira()).toEqual({ ajanId: "a", asama: "yaziyor" });
    expect(s.kimler()).toEqual(["a"]);
  });

  it("açık konuşma metni İngilizcede İngilizce", () => {
    dilKaynagi(() => "en");
    const m = uyandirmaMetni({ kanal: "design", konu: "Home page", uyeler: ["Ada", "Bora"], mesajlar: [{ ad: "Ada", metin: "Hi" }], kurul: false, suruyor: true });
    expect(m).toBe(
      [
        "An open conversation is going on in #design; it's your turn.",
        "Topic: Home page",
        "Channel members: Ada and Bora.",
        "Latest messages:\n- Ada: Hi",
        "Reply briefly and naturally to the latest messages; don't repeat what was said, move the conversation one step forward.",
        'Write your reply in #design with mcp__arnorg__mesaj_gonder (kanal: "design").',
        "To hand the floor to another member, @mention them; don't mention anyone outside the channel.",
        "If you have work in progress, write just one message before going back to it; if not, stop after your reply.",
      ].join("\n"),
    );
  });
});
