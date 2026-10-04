// Model kataloğu: Claude Code listesinin ayrıştırılması, sabit yedek ve önbellek, rol modeli seçimi (Fable yoksa Opus),
// okuma zamanlaması ve zaman aşımı. SDK'nın query'si sahte: Claude Code açılmaz, token harcanmaz.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SunucuOlayi } from "@arnorg/ortak";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Depo } from "./depo.js";
import {
  katalogdaVarMi,
  KATALOG_ANAHTARI,
  kimliktenSurum,
  ModelKataloguIzleyici,
  modelleriAyristir,
  onbellektenKatalog,
  rolModeliSec,
  sdkModelOkuyucu,
  YEDEK_MODELLER,
  yedekKatalog,
  zincirdekiSonraki,
} from "./model-katalogu.js";
import { OlayYolu } from "./olaylar.js";
import { rolBul } from "./roller.js";
import { Sirket } from "./sirket.js";
import { Yapilandirma } from "./yapilandirma.js";

const sahte = vi.hoisted(() => ({
  modeller: null as null | (() => Promise<unknown[]>),
  kapatilan: 0,
  secenekler: [] as Record<string, unknown>[],
}));

vi.mock("@anthropic-ai/claude-agent-sdk", async (asil) => {
  const gercek = await asil<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...gercek,
    query: ({ options }: { options: Record<string, unknown> }) => {
      sahte.secenekler.push(options);
      return { supportedModels: () => sahte.modeller!(), close: () => void sahte.kapatilan++ };
    },
  };
});

const uyu = (ms: number) => new Promise((coz) => setTimeout(coz, ms));
async function bekle(kosul: () => boolean) {
  for (let i = 0; i < 200 && !kosul(); i++) await uyu(5);
  expect(kosul()).toBe(true);
}

/** Bellekte anahtar-değer deposu */
function kv() {
  const m = new Map<string, string>();
  return { deger: (a: string) => m.get(a) ?? null, degerYaz: (a: string, d: string) => void m.set(a, d) };
}

const FABLESIZ = YEDEK_MODELLER.filter((m) => m.value !== "fable");

describe("Claude Code listesinin ayrıştırılması", () => {
  it("default satırı çıkar; ad açıklamanın ' · ' öncesi, kısa açıklama sonrası, tam kimlik resolvedModel", () => {
    expect(modelleriAyristir(YEDEK_MODELLER)).toEqual([
      { deger: "sonnet", ad: "Sonnet 5.5", kimlik: "claude-sonnet-5-5", aciklama: "Efficient for routine tasks" },
      { deger: "fable", ad: "Fable 5.1", kimlik: "claude-fable-5-1", aciklama: "Most capable for your hardest and longest-running tasks" },
      { deger: "opus", ad: "Opus 5.5", kimlik: "claude-opus-5-5", aciklama: "Best for everyday, complex tasks" },
      { deger: "haiku", ad: "Haiku 4.5", kimlik: "claude-haiku-4-5-20251001", aciklama: "Fastest for quick answers" },
    ]);
  });

  it("açıklamada ayraç yoksa sürüm tam kimlikten çıkar; bozuk ve yinelenen satırlar atlanır", () => {
    expect(
      modelleriAyristir([
        { value: "opus", displayName: "Opus", resolvedModel: "claude-opus-5-5", description: "Best for everyday, complex tasks" },
        { value: "opus", displayName: "Opus", description: "Opus 5.5 · ikinci satır" },
        { value: "claude-haiku-4-5-20251001", displayName: "Haiku", description: "" },
        { value: "deneme", displayName: "Deneme 2", description: "Kendi adı sürümlü" },
        { value: "", displayName: "Boş", description: "x" },
        { value: 3, displayName: "Sayı", description: "x" },
        null,
        "metin",
      ]),
    ).toEqual([
      { deger: "opus", ad: "Opus 5.5", kimlik: "claude-opus-5-5", aciklama: "Best for everyday, complex tasks" },
      { deger: "claude-haiku-4-5-20251001", ad: "Haiku 4.5", kimlik: "claude-haiku-4-5-20251001", aciklama: "" },
      { deger: "deneme", ad: "Deneme 2", kimlik: null, aciklama: "Kendi adı sürümlü" },
    ]);
    expect(kimliktenSurum("claude-opus-5")).toBe("5");
    expect(kimliktenSurum("claude-sonnet-4-5[1m]")).toBe("4.5");
    expect(kimliktenSurum("gpt-4")).toBeNull();
  });

  it("sabit yedek ve önbellek; bozuk önbellek yok sayılır", () => {
    const y = yedekKatalog();
    expect(y).toMatchObject({ kaynak: "yedek", guncelleme: null });
    expect(y.modeller.map((m) => m.deger)).toEqual(["sonnet", "fable", "opus", "haiku"]);
    expect(onbellektenKatalog(null)).toBeNull();
    expect(onbellektenKatalog("{bozuk")).toBeNull();
    expect(onbellektenKatalog(JSON.stringify({ modeller: [] }))).toBeNull();
    expect(onbellektenKatalog(JSON.stringify({ modeller: YEDEK_MODELLER.slice(0, 2), guncelleme: "2026-10-04T08:00:00.000Z" }))).toEqual({
      modeller: [{ deger: "sonnet", ad: "Sonnet 5.5", kimlik: "claude-sonnet-5-5", aciklama: "Efficient for routine tasks" }],
      kaynak: "onbellek",
      guncelleme: "2026-10-04T08:00:00.000Z",
    });
  });
});

describe("rol modeli ve model zinciri", () => {
  const katalog = (degerler: string[]) => modelleriAyristir(YEDEK_MODELLER).filter((m) => degerler.includes(m.deger));

  it("CEO rolünün varsayılanı Fable", () => {
    expect(rolBul("ceo")?.varsayilanModel).toBe("fable");
  });

  it("rolün varsayılanı katalogda yoksa zincirde bir sonraki: Fable yoksa Opus", () => {
    expect(rolModeliSec("fable", katalog(["fable", "opus", "sonnet", "haiku"]))).toBe("fable");
    expect(rolModeliSec("fable", katalog(["opus", "sonnet", "haiku"]))).toBe("opus");
    expect(rolModeliSec("fable", katalog(["sonnet", "haiku"]))).toBe("sonnet");
    expect(rolModeliSec("opus", katalog(["sonnet", "haiku"]))).toBe("sonnet");
    expect(rolModeliSec("sonnet", katalog(["haiku"]))).toBe("haiku");
    // Zincirin hiçbir halkası yoksa, zincir dışı model ve boş katalogda varsayılan kalır
    expect(rolModeliSec("haiku", katalog(["opus"]))).toBe("haiku");
    expect(rolModeliSec("claude-ozel-1", katalog(["opus"]))).toBe("claude-ozel-1");
    expect(rolModeliSec("fable", [])).toBe("fable");
  });

  it("takma ad, tam kimlikli satırda da tanınır; yedek zinciri fable → opus → sonnet → haiku", () => {
    const tamKimlikli = modelleriAyristir([{ value: "claude-fable-5-1", displayName: "Fable", description: "Fable 5.1 · Most capable" }]);
    expect(katalogdaVarMi(tamKimlikli, "fable")).toBe(true);
    expect(katalogdaVarMi(tamKimlikli, "claude-fable-5-1")).toBe(true);
    expect(katalogdaVarMi(tamKimlikli, "opus")).toBe(false);
    expect(rolModeliSec("fable", tamKimlikli)).toBe("fable");
    expect(zincirdekiSonraki("fable")).toBe("opus");
    expect(zincirdekiSonraki("claude-opus-5-5")).toBe("sonnet");
    expect(zincirdekiSonraki("sonnet")).toBe("haiku");
    expect(zincirdekiSonraki("haiku")).toBeNull();
    expect(zincirdekiSonraki("default")).toBeNull();
  });
});

describe("katalog izleyicisi", () => {
  const kurulumOlayi = (girisYapildi: boolean) =>
    ({
      tur: "kurulum.durum",
      durum: { claude: { kaynak: "sistem", yol: "/usr/bin/claude", surum: "2.1.287", sistemde: true, girisYapildi, abonelik: girisYapildi, girisYontemi: null, saglayici: null, eposta: null, hata: null } },
    }) as unknown as SunucuOlayi;
  const hesapOlayi = (plan: string) => ({ tur: "hesap.guncellendi", hesap: { durum: "hazir", plan, eposta: "kurul@ornek.com" } }) as unknown as SunucuOlayi;

  it("açılışta önbellekten okur; tazele listeyi alır, önbelleğe yazar, değişince yayınlar", async () => {
    const depo = kv();
    depo.degerYaz(KATALOG_ANAHTARI, JSON.stringify({ modeller: FABLESIZ, guncelleme: "2026-10-01T00:00:00.000Z" }));
    const olaylar = new OlayYolu();
    const gelen: SunucuOlayi[] = [];
    olaylar.dinle((o) => gelen.push(o));
    let cagri = 0;
    const iz = new ModelKataloguIzleyici({ depo, olaylar, okuyucu: async () => (cagri++, YEDEK_MODELLER) });
    expect(iz.mevcut.kaynak).toBe("onbellek");
    expect(iz.rolModeli("fable")).toBe("opus");

    const k = await iz.tazele();
    expect(cagri).toBe(1);
    expect(k.kaynak).toBe("claude");
    expect(iz.rolModeli("fable")).toBe("fable");
    const yayinlanan = gelen.filter((o) => o.tur === "modeller.guncellendi");
    expect(yayinlanan).toHaveLength(1);
    expect(yayinlanan[0]).toMatchObject({ katalog: { kaynak: "claude", modeller: [{ deger: "sonnet" }, { deger: "fable" }, { deger: "opus" }, { deger: "haiku" }] } });
    expect(onbellektenKatalog(depo.deger(KATALOG_ANAHTARI))?.modeller.map((m) => m.ad)).toEqual(["Sonnet 5.5", "Fable 5.1", "Opus 5.5", "Haiku 4.5"]);
    // Aynı liste yeniden okununca olay yayınlanmaz
    await iz.tazele();
    expect(gelen.filter((o) => o.tur === "modeller.guncellendi")).toHaveLength(1);
  });

  it("okunamazsa ya da liste boşsa eldeki liste kalır; okuyucu yoksa hiç okunmaz; aynı anda tek okuma", async () => {
    const olaylar = new OlayYolu();
    const hatali = new ModelKataloguIzleyici({ depo: kv(), olaylar, okuyucu: async () => Promise.reject(new Error("Claude Code yok")) });
    expect((await hatali.tazele()).kaynak).toBe("yedek");
    const bos = new ModelKataloguIzleyici({ depo: kv(), olaylar, okuyucu: async () => [] });
    expect((await bos.tazele()).kaynak).toBe("yedek");
    const kapali = new ModelKataloguIzleyici({ depo: kv(), olaylar, okuyucu: null });
    kapali.baslat(0);
    expect((await kapali.tazele()).kaynak).toBe("yedek");
    let cagri = 0;
    const tek = new ModelKataloguIzleyici({ depo: kv(), olaylar, okuyucu: async () => (cagri++, await uyu(10), YEDEK_MODELLER) });
    await Promise.all([tek.tazele(), tek.tazele(), tek.tazele()]);
    expect(cagri).toBe(1);
  });

  it("açılıştan kısa süre sonra okur; Claude Code girişi, kurulumu ya da planı değişince yeniden okur", async () => {
    const olaylar = new OlayYolu();
    let cagri = 0;
    const iz = new ModelKataloguIzleyici({ depo: kv(), olaylar, okuyucu: async () => (cagri++, YEDEK_MODELLER), yenidenOkumaMs: 5 });
    iz.baslat(5);
    await bekle(() => cagri === 1);
    // Giriş yapıldı (kurulum durumu yayınlandı): yeniden okunur; aynı durum yinelenince okunmaz
    olaylar.yayinla(kurulumOlayi(true));
    await bekle(() => cagri === 2);
    olaylar.yayinla(kurulumOlayi(true));
    await uyu(40);
    expect(cagri).toBe(2);
    // Abonelik planı okundu ve sonra değişti
    olaylar.yayinla(hesapOlayi("Pro"));
    await bekle(() => cagri === 3);
    olaylar.yayinla(hesapOlayi("Max"));
    await bekle(() => cagri === 4);
    // Durdurulunca dinlemez
    iz.durdur();
    olaylar.yayinla(kurulumOlayi(false));
    await uyu(40);
    expect(cagri).toBe(4);
  });
});

describe("Claude Code yoklaması (sahte SDK)", () => {
  it("listeyi döndürür ve süreci kapatır; ayarlar okunmaz, ajanların Claude Code yolu kullanılır", async () => {
    sahte.modeller = async () => [...YEDEK_MODELLER];
    const once = sahte.kapatilan;
    const oku = sdkModelOkuyucu({ cwd: os.tmpdir(), claudeYolu: () => "/opt/claude", zamanAsimiMs: 1000 });
    expect(modelleriAyristir(await oku()).map((m) => m.ad)).toEqual(["Sonnet 5.5", "Fable 5.1", "Opus 5.5", "Haiku 4.5"]);
    expect(sahte.kapatilan).toBe(once + 1);
    expect(sahte.secenekler.at(-1)).toMatchObject({ cwd: os.tmpdir(), settingSources: [], pathToClaudeCodeExecutable: "/opt/claude" });
  });

  it("yanıt gelmezse zaman aşımıyla hata verir ve süreci kapatır", async () => {
    sahte.modeller = () => new Promise(() => undefined);
    const once = sahte.kapatilan;
    const oku = sdkModelOkuyucu({ cwd: os.tmpdir(), claudeYolu: () => null, zamanAsimiMs: 30 });
    await expect(oku()).rejects.toThrow(/model listesini vermedi/);
    expect(sahte.kapatilan).toBe(once + 1);
    expect(sahte.secenekler.at(-1)).not.toHaveProperty("pathToClaudeCodeExecutable");
  });
});

describe("Şirket: işe alımda rol modeli", () => {
  let gecici: string;
  let yap: Yapilandirma;
  let depo: Depo;
  const acik: Sirket[] = [];
  const ac = () => {
    const s = new Sirket(depo, new OlayYolu(), yap, () => null, true);
    acik.push(s);
    return s;
  };

  beforeAll(() => {
    gecici = fs.mkdtempSync(path.join(os.tmpdir(), "arnorg-model-"));
    yap = new Yapilandirma(path.join(gecici, "veri"));
    depo = new Depo(path.join(gecici, "veri", "arnorg.db"));
  });

  afterAll(() => {
    for (const s of acik) s.kapat();
    depo.kapat();
    fs.rmSync(gecici, { recursive: true, force: true });
  });

  it("CEO Fable'la işe alınır; hesabın kataloğunda Fable yoksa Opus'la; var olan ajanın modeli değişmez", () => {
    const s = ac();
    expect(s.modelKatalogu.mevcut.kaynak).toBe("yedek");
    const p1 = depo.projeEkle({ ad: "Bir", yol: path.join(gecici, "bir"), aciklama: "", varsayilanDal: "main" }).id;
    expect(s.iseAl(p1, { ad: "Ada", rol: "ceo" }).model).toBe("fable");
    expect(s.iseAl(p1, { ad: "Deniz", rol: "backend" }).model).toBe("sonnet");
    expect(s.iseAl(p1, { ad: "Onur", rol: "inceleme", model: "haiku" }).model).toBe("haiku");

    // Hesabın planı Fable sunmuyor (son okunan liste): yeni CEO Opus'la başlar, eski CEO Fable'da kalır
    depo.degerYaz(KATALOG_ANAHTARI, JSON.stringify({ modeller: FABLESIZ, guncelleme: new Date().toISOString() }));
    const yeni = ac();
    expect(yeni.modelKatalogu.mevcut.kaynak).toBe("onbellek");
    const p2 = depo.projeEkle({ ad: "İki", yol: path.join(gecici, "iki"), aciklama: "", varsayilanDal: "main" }).id;
    expect(yeni.iseAl(p2, { ad: "Ada", rol: "ceo" }).model).toBe("opus");
    expect(yeni.iseAl(p2, { ad: "Kerem", rol: "cto" }).model).toBe("opus");
    expect(depo.ajanAdla(p1, "Ada")?.model).toBe("fable");
  });

  it("zorlanan model (ARNORG_MODEL_ZORLA) kayıtlı modeli değiştirmez: ajan rolün modeliyle kaydedilir", () => {
    depo.degerYaz(KATALOG_ANAHTARI, JSON.stringify({ modeller: YEDEK_MODELLER, guncelleme: new Date().toISOString() }));
    const eski = process.env.ARNORG_MODEL_ZORLA;
    process.env.ARNORG_MODEL_ZORLA = "haiku";
    try {
      const s = ac();
      const p = depo.projeEkle({ ad: "Üç", yol: path.join(gecici, "uc"), aciklama: "", varsayilanDal: "main" }).id;
      expect(s.iseAl(p, { ad: "Ada", rol: "ceo" }).model).toBe("fable");
    } finally {
      if (eski === undefined) delete process.env.ARNORG_MODEL_ZORLA;
      else process.env.ARNORG_MODEL_ZORLA = eski;
    }
  });
});
