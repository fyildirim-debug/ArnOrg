// Kanallar ekranının kuralları: CEO ile bire bir sohbet (#yonetim) listede, rozette ve canlı akışta yok, bağlantısı
// Karargâh'a açılır; kurulun kanalları ayrı grupta; konuşma mesaj sayısı; kanal adı denetimi
import type { Kanal, Mesaj } from "@arnorg/ortak";
import { describe, expect, it } from "vitest";
import { git, useArayuz } from "../durum/arayuz";
import { akistaBirlestir } from "../bilesenler/mesajGruplari";
import { CEO_KANALI, kanalAdiDenetle, kanalEkrani, kanalGruplari, KANALLARDA_YOK, kanallardaGorunur, kanallarOkunmamis, konusmaMesajSayisi } from "./kanallar";

const kanal = (ad: string, ozel = false): Kanal => ({ ad, aciklama: "", mesajSayisi: 0, ...(ozel ? { ozel: true, uyeler: [], konusma: "durdu" as const } : {}) });
const mesaj = (id: string, kanalAdi: string, gonderenId: string, zaman: string): Mesaj => ({ id, projeId: "p", kanal: kanalAdi, gonderenId, gonderenAd: gonderenId, metin: id, anilanlar: [], zaman });

describe("CEO ile bire bir sohbet Kanallar'da görünmez", () => {
  it("liste: #yonetim süzülür; ArnOrg'un ve ajanların kanalları ile kurulun kanalları ayrılır, sıra korunur", () => {
    const g = kanalGruplari([kanal("genel"), kanal("muhendislik"), kanal(CEO_KANALI), kanal("tasarim", true), kanal("toplanti"), kanal("ajanlarin"), kanal("sprint", true)]);
    expect(g.sirket.map((k) => k.ad)).toEqual(["genel", "muhendislik", "toplanti", "ajanlarin"]);
    expect(g.kurulun.map((k) => k.ad)).toEqual(["tasarim", "sprint"]);
    expect(kanallardaGorunur("yonetim")).toBe(false);
    expect(kanallardaGorunur("genel")).toBe(true);
  });

  it("okunmamış rozeti: #yonetim'deki CEO yanıtları Kanallar'a sayılmaz", () => {
    expect(kanallarOkunmamis({ genel: 2, yonetim: 5, tasarim: 1 })).toBe(3);
    expect(kanallarOkunmamis({ yonetim: 4 })).toBe(0);
    expect(kanallarOkunmamis({})).toBe(0);
  });

  it("canlı akış aynı kuralı kullanır", () => {
    const akis = akistaBirlestir(
      { genel: [mesaj("g1", "genel", "ada", "2026-10-04T08:00:00.000Z")], yonetim: [mesaj("y1", "yonetim", "kurul", "2026-10-04T08:01:00.000Z")] },
      ["genel", "yonetim"],
      KANALLARDA_YOK,
    );
    expect(akis.map((m) => m.id)).toEqual(["g1"]);
  });

  it("#yonetim'e giden bağlantı Karargâh'taki CEO sohbetine açılır", () => {
    expect(kanalEkrani("yonetim")).toBe("karargah");
    expect(kanalEkrani("genel")).toBe("kanallar");
    expect(kanalEkrani(undefined)).toBe("kanallar");
    useArayuz.setState({ gorunum: "pano", kanal: "genel" });
    git("kanallar", { kanal: "yonetim" });
    expect(useArayuz.getState()).toMatchObject({ gorunum: "karargah", kanal: "genel" });
    git("kanallar", { kanal: "toplanti" });
    expect(useArayuz.getState()).toMatchObject({ gorunum: "kanallar", kanal: "toplanti" });
  });
});

describe("kurulun kanalı", () => {
  it("konuşma mesaj sayısı son başlangıçtan beri; ArnOrg duyuruları sayılmaz", () => {
    const k = { konusmaBaslangic: "2026-10-04T09:00:00.000Z" };
    const liste = [
      mesaj("1", "tasarim", "ada", "2026-10-04T08:59:00.000Z"),
      mesaj("2", "tasarim", "kurul", "2026-10-04T09:00:00.000Z"),
      mesaj("3", "tasarim", "ece", "2026-10-04T09:00:05.000Z"),
      mesaj("4", "tasarim", "arnorg", "2026-10-04T09:01:00.000Z"),
    ];
    expect(konusmaMesajSayisi(k, liste)).toBe(2);
    expect(konusmaMesajSayisi({ konusmaBaslangic: null }, liste)).toBeNull();
    expect(konusmaMesajSayisi(k, undefined)).toBeNull();
  });

  it("kanal adı çekirdekle aynı kurallarla denetlenir", () => {
    const var_ = [kanal("genel"), kanal("tasarim", true)];
    expect(kanalAdiDenetle(" #Tasarım Ekibi ", var_)).toEqual({ ad: "tasarım-ekibi", sorun: null });
    expect(kanalAdiDenetle("İnceleme", var_)).toEqual({ ad: "inceleme", sorun: null });
    expect(kanalAdiDenetle("   ", var_).sorun).toBe("bos");
    expect(kanalAdiDenetle("a/b", var_).sorun).toBe("gecersiz");
    expect(kanalAdiDenetle("x".repeat(41), var_).sorun).toBe("gecersiz");
    expect(kanalAdiDenetle("General", var_).sorun).toBe("sistem");
    expect(kanalAdiDenetle("ceo", var_).sorun).toBe("sistem");
    expect(kanalAdiDenetle("toplanti", var_).sorun).toBe("sistem");
    expect(kanalAdiDenetle("Tasarim", var_).sorun).toBe("var");
  });
});
