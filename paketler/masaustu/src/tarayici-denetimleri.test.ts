import { describe, expect, it } from "vitest";
import {
  cerceveAdresiMi,
  gorunumDikdortgeni,
  indirmeAdi,
  kirpmaAlani,
  kisayolKarari,
  secimAyristir,
  sinirAyristir,
  TARAYICI_BOLUMU,
  tarayiciAdresiMi,
  tarayiciIzniVerilirMi,
  tarayiciKomutunuAyristir,
  tarayiciKullaniciAjani,
  tarayiciYeniPencereKarari,
  webviewEklemeKarari,
} from "./tarayici-denetimleri.js";

describe("tarayıcı: adresler ve gezinme", () => {
  it("ana çerçeve yalnız http, https ve boş sayfaya gider", () => {
    expect(tarayiciAdresiMi("http://localhost:5173/sepet")).toBe(true);
    expect(tarayiciAdresiMi("https://ornek.com/")).toBe(true);
    expect(tarayiciAdresiMi("about:blank")).toBe(true);
    for (const adres of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<b>x</b>", "chrome://settings", "devtools://devtools", "view-source:https://a.b", "about:config", "ftp://a.b/", "bozuk"]) {
      expect(tarayiciAdresiMi(adres), adres).toBe(false);
    }
  });

  it("iframe web adreslerine gider, yerel ve iç protokollere gidemez", () => {
    expect(cerceveAdresiMi("https://www.youtube.com/embed/x")).toBe(true);
    expect(cerceveAdresiMi("about:srcdoc")).toBe(true);
    expect(cerceveAdresiMi("data:text/html,merhaba")).toBe(true);
    expect(cerceveAdresiMi("blob:https://a.b/1")).toBe(true);
    expect(cerceveAdresiMi("file:///C:/Windows/win.ini")).toBe(false);
    expect(cerceveAdresiMi("chrome://gpu")).toBe(false);
    expect(cerceveAdresiMi("devtools://devtools/bundled/x.html")).toBe(false);
  });
});

describe("tarayıcı: yeni pencere, izin ve <webview> kuralları", () => {
  it("window.open ve target=_blank http(s) ise aynı görünümde açılır, gerisi reddedilir", () => {
    expect(tarayiciYeniPencereKarari("https://ornek.com/yeni")).toEqual({ tur: "ayni-gorunum", adres: "https://ornek.com/yeni" });
    expect(tarayiciYeniPencereKarari("http://localhost:3000/")).toEqual({ tur: "ayni-gorunum", adres: "http://localhost:3000/" });
    expect(tarayiciYeniPencereKarari("about:blank")).toEqual({ tur: "ret" });
    expect(tarayiciYeniPencereKarari("file:///etc/hosts")).toEqual({ tur: "ret" });
    expect(tarayiciYeniPencereKarari("javascript:void(0)")).toEqual({ tur: "ret" });
    expect(tarayiciYeniPencereKarari("mailto:a@b.c")).toEqual({ tur: "ret" });
  });

  it("tarayıcıda hiçbir izin verilmez", () => {
    for (const izin of ["media", "geolocation", "notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "midi", "midiSysex", "display-capture", "hid", "serial", "usb", "local-network-access", "openExternal", "pointerLock", "unknown"]) {
      expect(tarayiciIzniVerilirMi(izin), izin).toBe(false);
    }
  });

  it("<webview> hiçbir koşulda eklenemez (tarayıcı WebContentsView'dır)", () => {
    expect(webviewEklemeKarari()).toBe("ret");
    expect(webviewEklemeKarari({ src: "https://ornek.com", webPreferences: { partition: TARAYICI_BOLUMU, sandbox: true, contextIsolation: true } })).toBe("ret");
  });

  it("tarayıcının oturumu kalıcı ve ana oturumdan ayrı bir bölümdür", () => {
    expect(TARAYICI_BOLUMU).toBe("persist:arnorg-tarayici");
  });

  it("kullanıcı aracısından Electron ve uygulama adı çıkar", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ArnOrg/0.0.5 Chrome/146.0.7000.0 Electron/44.5.1 Safari/537.36";
    expect(tarayiciKullaniciAjani(ua)).toBe("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7000.0 Safari/537.36");
  });

  it("indirme adı yol içeremez", () => {
    expect(indirmeAdi("../../.bashrc")).toBe("bashrc");
    expect(indirmeAdi("C:\\Windows\\rapor.pdf")).toBe("rapor.pdf");
    expect(indirmeAdi("fatura 2026.pdf")).toBe("fatura 2026.pdf");
    expect(indirmeAdi('a:b*c?"d"<e>|f.txt')).toBe("a_b_c_d_e_f.txt");
    expect(indirmeAdi("...")).toBe("indirme");
  });
});

describe("tarayıcı: IPC doğrulaması", () => {
  it("Stüdyo'nun komutlarını tanır, bozukları reddeder", () => {
    expect(tarayiciKomutunuAyristir({ tur: "git", adres: "http://localhost:5173" })).toEqual({ tur: "git", adres: "http://localhost:5173" });
    expect(tarayiciKomutunuAyristir({ tur: "geri" })).toEqual({ tur: "geri" });
    expect(tarayiciKomutunuAyristir({ tur: "kare", fazla: 1 })).toEqual({ tur: "kare" });
    expect(tarayiciKomutunuAyristir({ tur: "yerlestir", sinir: null })).toEqual({ tur: "yerlestir", sinir: null });
    expect(tarayiciKomutunuAyristir({ tur: "yerlestir", sinir: { x: 10, y: 20, genislik: 800, yukseklik: 600 } })).toEqual({
      tur: "yerlestir",
      sinir: { x: 10, y: 20, genislik: 800, yukseklik: 600 },
    });
    expect(tarayiciKomutunuAyristir({ tur: "secici", acik: true, ipucu: "x".repeat(400) })).toEqual({ tur: "secici", acik: true, ipucu: "x".repeat(160) });
    expect(tarayiciKomutunuAyristir({ tur: "secici", acik: "evet" })).toBeNull();
    expect(tarayiciKomutunuAyristir({ tur: "git", adres: 42 })).toBeNull();
    expect(tarayiciKomutunuAyristir({ tur: "git", adres: "x".repeat(9000) })).toBeNull();
    expect(tarayiciKomutunuAyristir({ tur: "yerlestir", sinir: { x: Number.NaN, y: 0, genislik: 1, yukseklik: 1 } })).toBeNull();
    expect(tarayiciKomutunuAyristir({ tur: "calistir", kod: "process.exit()" })).toBeNull();
    expect(tarayiciKomutunuAyristir("git")).toBeNull();
    expect(tarayiciKomutunuAyristir(null)).toBeNull();
  });

  it("görünüm yeri sınırları", () => {
    expect(sinirAyristir({ x: -5, y: 0, genislik: 0, yukseklik: 0 })).toEqual({ x: -5, y: 0, genislik: 0, yukseklik: 0 });
    expect(sinirAyristir({ x: 0, y: 0, genislik: -1, yukseklik: 10 })).toBeNull();
    expect(sinirAyristir({ x: 0, y: 0, genislik: 1e9, yukseklik: 10 })).toBeNull();
    expect(sinirAyristir({ x: "0", y: 0, genislik: 1, yukseklik: 1 })).toBeNull();
  });

  const secim = {
    adres: "http://localhost:5173/sepet",
    sayfaBasligi: "Sepet",
    secici: "main > button.odeme",
    ogeMetni: "Ödemeye geç",
    ogeHtml: '<button class="odeme">Ödemeye geç</button>',
    stiller: { yaziTipi: "Inter", boyut: "15px", renk: "rgb(0, 0, 0)", arkaPlan: "rgb(255, 255, 255)" },
    kutu: { x: 10, y: 20, genislik: 100, yukseklik: 40, sayfaX: 10, sayfaY: 820 },
    gorunum: { genislik: 390, yukseklik: 844 },
  };

  it("sayfadan gelen seçimi sınırlar", () => {
    expect(secimAyristir(secim)).toEqual(secim);
    const uzun = secimAyristir({ ...secim, ogeHtml: "<p>".padEnd(9000, "x"), ogeMetni: "y".repeat(2000), gorunum: { genislik: 389.6, yukseklik: 844.2 } });
    expect(uzun?.ogeHtml.length).toBe(2000);
    expect(uzun?.ogeMetni.length).toBe(500);
    expect(uzun?.gorunum).toEqual({ genislik: 390, yukseklik: 844 });
    expect(secimAyristir({ ...secim, stiller: undefined })?.stiller).toEqual({ yaziTipi: "", boyut: "", renk: "", arkaPlan: "" });
  });

  it("bozuk ya da web dışı seçimi reddeder", () => {
    expect(secimAyristir({ ...secim, adres: "file:///etc/passwd" })).toBeNull();
    expect(secimAyristir({ ...secim, adres: "about:blank" })).toBeNull();
    expect(secimAyristir({ ...secim, secici: "  " })).toBeNull();
    expect(secimAyristir({ ...secim, kutu: { ...secim.kutu, x: Number.POSITIVE_INFINITY } })).toBeNull();
    expect(secimAyristir({ ...secim, kutu: { ...secim.kutu, genislik: -3 } })).toBeNull();
    expect(secimAyristir({ ...secim, gorunum: { genislik: 0, yukseklik: 844 } })).toBeNull();
    expect(secimAyristir({ ...secim, kutu: null })).toBeNull();
    expect(secimAyristir("secim")).toBeNull();
  });
});

describe("tarayıcı: yer, ekran görüntüsü alanı ve kısayollar", () => {
  it("Stüdyo'nun CSS pikseli yakınlaştırmayla DIP'e çevrilir", () => {
    expect(gorunumDikdortgeni({ x: 200, y: 96, genislik: 800, yukseklik: 600 }, 1)).toEqual({ x: 200, y: 96, width: 800, height: 600 });
    expect(gorunumDikdortgeni({ x: 200.4, y: 96, genislik: 800.3, yukseklik: 600 }, 1.25)).toEqual({ x: 251, y: 120, width: 1000, height: 750 });
  });

  it("öğe kutusu payla genişler, görünüme kırpılır, sayfa yakınlaştırmasıyla ölçeklenir", () => {
    const gorunum = { genislik: 390, yukseklik: 844 };
    expect(kirpmaAlani({ x: 100, y: 200, genislik: 50, yukseklik: 20 }, gorunum, 16, 1)).toEqual({ x: 84, y: 184, width: 82, height: 52 });
    // Kenardaki öğe görünümün içine kırpılır
    expect(kirpmaAlani({ x: 2, y: 830, genislik: 500, yukseklik: 40 }, gorunum, 16, 1)).toEqual({ x: 0, y: 814, width: 390, height: 30 });
    expect(kirpmaAlani({ x: 100, y: 200, genislik: 50, yukseklik: 20 }, gorunum, 16, 2)).toEqual({ x: 168, y: 368, width: 164, height: 104 });
    // Görünümün dışındaki öğe
    expect(kirpmaAlani({ x: 10, y: 2000, genislik: 50, yukseklik: 20 }, gorunum, 16, 1)).toBeNull();
  });

  const tus = (key: string, ek: Partial<{ control: boolean; meta: boolean; shift: boolean; alt: boolean; type: string; code: string }> = {}) => ({
    type: "keyDown",
    key,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...ek,
  });

  it("Ctrl+L adres çubuğu, Ctrl+Shift+C öğe seçici; macOS'ta Cmd", () => {
    expect(kisayolKarari(tus("l", { control: true }), "win32")).toBe("adres");
    expect(kisayolKarari(tus("L", { control: true }), "linux")).toBe("adres");
    expect(kisayolKarari(tus("C", { control: true, shift: true }), "linux")).toBe("secici");
    expect(kisayolKarari(tus("l", { meta: true }), "darwin")).toBe("adres");
    expect(kisayolKarari(tus("l", { control: true }), "darwin")).toBeNull();
    expect(kisayolKarari(tus("l", { meta: true }), "linux")).toBeNull();
    expect(kisayolKarari(tus("l"), "linux")).toBeNull();
    expect(kisayolKarari(tus("c", { control: true }), "linux")).toBeNull();
    expect(kisayolKarari(tus("l", { control: true, alt: true }), "linux")).toBeNull();
    expect(kisayolKarari(tus("l", { control: true, type: "keyUp" }), "linux")).toBeNull();
    // Düzenden bağımsız fiziksel tuş
    expect(kisayolKarari(tus("ş", { control: true, code: "KeyL" }), "linux")).toBe("adres");
  });
});
