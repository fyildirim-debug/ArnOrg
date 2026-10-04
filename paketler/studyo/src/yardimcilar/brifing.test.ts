// Brifing mesajının tanınması: başlık biçimleri, iki dil, en az üç bölüm kuralı, kod bloğu içindeki satırlar
import { describe, expect, it } from "vitest";
import type { Mesaj } from "@arnorg/ortak";
import { baslikSatiri, BRIFING_BEKLEME_MS, BRIFING_SESSIZLIK_MS, brifingAyir, brifingBittiMi } from "./brifing";

describe("brifing başlığı", () => {
  it("kalın, Markdown başlığı ve iki noktalı satır; aynı satırdaki metin bölüme girer", () => {
    expect(baslikSatiri("**Yaptıklarımız**")).toEqual({ tur: "yapilan", baslik: "Yaptıklarımız", kalan: "", dil: "tr" });
    expect(baslikSatiri("**Şu an:** T-24 sürüyor")).toEqual({ tur: "suan", baslik: "Şu an", kalan: "T-24 sürüyor", dil: "tr" });
    expect(baslikSatiri("**Sıradaki**: T-27")).toEqual({ tur: "siradaki", baslik: "Sıradaki", kalan: "T-27", dil: "tr" });
    expect(baslikSatiri("## Kararınızı bekleyen")).toEqual({ tur: "karar", baslik: "Kararınızı bekleyen", kalan: "", dil: "tr" });
    expect(baslikSatiri("Kararınızı bekleyenler: yok")).toEqual({ tur: "karar", baslik: "Kararınızı bekleyenler", kalan: "yok", dil: "tr" });
    expect(baslikSatiri("**Right now**")).toMatchObject({ tur: "suan", dil: "en" });
    expect(baslikSatiri("### Awaiting your decisions")).toMatchObject({ tur: "karar" });
  });

  it("cümle içindeki benzer sözler başlık sayılmaz", () => {
    expect(baslikSatiri("Şu an T-24 üzerinde çalışıyoruz.")).toBeNull();
    expect(baslikSatiri("Sıradaki iş için Kerem'le konuştum: yarın başlar.")).toBeNull();
    expect(baslikSatiri("- **Şu an** bir şey")).toBeNull();
    expect(baslikSatiri("**Yarım")).toBeNull();
  });
});

describe("brifing mesajı", () => {
  const brifing = [
    "Günlük brifing · 4 Ekim",
    "",
    "**Yaptıklarımız**",
    "- T-21 jeton yenileme bitti (Kerem)",
    "- T-24 incelemeye geçti",
    "",
    "**Şu an**",
    "- T-26 sipariş listesi (Ece), 3 sa",
    "",
    "**Sıradaki**",
    "- T-27 uçtan uca test",
    "",
    "**Kararınızı bekleyen**",
    "- Aras'ın işe alımı",
  ].join("\n");

  it("dört bölüm ve giriş satırı", () => {
    const b = brifingAyir(brifing)!;
    expect(b.dil).toBe("tr");
    expect(b.giris).toBe("Günlük brifing · 4 Ekim");
    expect(b.bolumler.map((x) => [x.tur, x.baslik])).toEqual([
      ["yapilan", "Yaptıklarımız"],
      ["suan", "Şu an"],
      ["siradaki", "Sıradaki"],
      ["karar", "Kararınızı bekleyen"],
    ]);
    expect(b.bolumler[0]!.govde).toBe("- T-21 jeton yenileme bitti (Kerem)\n- T-24 incelemeye geçti");
    expect(b.bolumler[3]!.govde).toBe("- Aras'ın işe alımı");
  });

  it("İngilizce brifing de tanınır; üç bölüm yeter, ikisi yetmez", () => {
    const en = "**What we did**\n- T-21 done\n**Right now**\n- T-26\n**Up next**\n- T-27";
    expect(brifingAyir(en)?.bolumler.map((x) => x.tur)).toEqual(["yapilan", "suan", "siradaki"]);
    expect(brifingAyir(en)?.dil).toBe("en");
    expect(brifingAyir("**Şu an**\n- T-26\n**Sıradaki**\n- T-27")).toBeNull();
    expect(brifingAyir("Not aldım, akşam rapor veririm.")).toBeNull();
    // Aynı bölüm iki kez yazılsa da üç ayrı bölüm gerekir
    expect(brifingAyir("**Şu an**\na\n**Şu an**\nb\n**Sıradaki**\nc")).toBeNull();
  });

  it("kod bloğu içindeki başlık benzeri satırlar bölüm açmaz; boş bölüm kalır", () => {
    const b = brifingAyir("**Yaptıklarımız**\n```\n**Şu an**\n```\n**Şu an**\n\n**Sıradaki**\n- T-27\n**Kararınızı bekleyen**")!;
    expect(b.bolumler.map((x) => x.tur)).toEqual(["yapilan", "suan", "siradaki", "karar"]);
    expect(b.bolumler[0]!.govde).toBe("```\n**Şu an**\n```");
    expect(b.bolumler[1]!.govde).toBe("");
    expect(b.bolumler[3]!.govde).toBe("");
  });
});

describe("Karargâh'taki brifing isteğinin bitişi", () => {
  const ORNEK = "**Yaptıklarımız**\n- T-21\n**Şu an**\n- T-26\n**Sıradaki**\n- T-27";
  const m = (id: string, gonderenId: string, metin = ORNEK) => ({ id, gonderenId, metin }) as Mesaj;
  const liste = [m("m1", "kurul"), m("m2", "ada"), m("m3", "kurul")];
  const istek = { zaman: 1000, sonMesajId: "m3", yaziyorGoruldu: false };
  /** CEO çalışıyor, yazmıyor */
  const calisiyor = { yaziyor: false, calisiyor: true };

  it("istekten sonra CEO #yonetim'e brifingi yazınca biter; öncekiler, başkaları ve ilgisiz mesajlar sayılmaz", () => {
    expect(brifingBittiMi(istek, liste, "ada", calisiyor, 2000)).toBe(false);
    expect(brifingBittiMi(istek, [...liste, m("m4", "kurul")], "ada", calisiyor, 2000)).toBe(false);
    expect(brifingBittiMi(istek, [...liste, m("m4", "ada", "Kargo anahtarı gerekiyor.")], "ada", calisiyor, 2000)).toBe(false);
    expect(brifingBittiMi(istek, [...liste, m("m4", "ada")], "ada", calisiyor, 2000)).toBe(true);
    // Kanal boşken istendiyse CEO'nun ilk brifingi
    expect(brifingBittiMi({ ...istek, sonMesajId: null }, [m("m1", "ada")], "ada", calisiyor, 2000)).toBe(true);
  });

  it("yazıyor görüldükten sonra biterse ya da süre dolarsa biter; son mesaj listede yoksa mesaja bakılmaz", () => {
    expect(brifingBittiMi({ ...istek, yaziyorGoruldu: true }, liste, "ada", { yaziyor: true, calisiyor: true }, 2000)).toBe(false);
    expect(brifingBittiMi({ ...istek, yaziyorGoruldu: true }, liste, "ada", calisiyor, 2000)).toBe(true);
    expect(brifingBittiMi(istek, liste, "ada", calisiyor, 1000 + BRIFING_BEKLEME_MS)).toBe(true);
    expect(brifingBittiMi({ ...istek, sonMesajId: "yok" }, [m("m9", "ada")], "ada", calisiyor, 2000)).toBe(false);
    expect(brifingBittiMi(istek, undefined, "ada", calisiyor, 2000)).toBe(false);
  });

  it("CEO bir süredir ne çalışıyor ne yazıyorsa biter (biçime uymayan yanıt); çalışırken ya da yazarken beklenir", () => {
    const sessiz = { yaziyor: false, calisiyor: false };
    expect(brifingBittiMi(istek, liste, "ada", sessiz, 1000 + BRIFING_SESSIZLIK_MS - 1)).toBe(false);
    expect(brifingBittiMi(istek, liste, "ada", sessiz, 1000 + BRIFING_SESSIZLIK_MS)).toBe(true);
    expect(brifingBittiMi(istek, liste, "ada", calisiyor, 1000 + BRIFING_SESSIZLIK_MS)).toBe(false);
    expect(brifingBittiMi(istek, liste, "ada", { yaziyor: true, calisiyor: false }, 1000 + BRIFING_SESSIZLIK_MS)).toBe(false);
  });
});
