// HTTP + WebSocket sunucusu (Fastify). Sözleşme: docs/API.md
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { createRequire } from "node:module";
import {
  ARNORG_SURUMU,
  EK_SINIRLARI,
  KOD_SEMBOL_TURU_ADLARI,
  KURUL,
  kanalAciklamasi,
  type HafizaTuru,
  type IstemciOlayi,
  type Karar,
  type KodSembolTuru,
  type OnayDurumu,
  type Saglik,
  type SunucuOlayi,
  type TerminalIstemciMesaji,
} from "@arnorg/ortak";
import { z, ZodError } from "zod";
import { jsonlSatiri, suzgeceUyar, type DenetimSuzgeci } from "./denetim-arsivi.js";
import type { DenetimImleci } from "./depo.js";
import { dil, iki } from "./dil.js";
import { dizinListesi, dizinOlustur } from "./dizinler.js";
import { dosyaAgaci, dosyaOku, dosyaYaz, ara } from "./dosyalar.js";
import { adresUclariniKur } from "./adres-uclari.js";
import { duzeltmeUclariniKur } from "./duzeltme-uclari.js";
import { ekUclariniKur } from "./mesaj-ekleri/uclar.js";
import { fsUclariniKur } from "./fs-api.js";
import * as gitIslemleri from "./git.js";
import { olayProjesi } from "./olaylar.js";
import { claudeSurumu, temizOrtam } from "./ortam.js";
import { raporOlustur } from "./gozetmen.js";
import { HAFIZA_TURLERI } from "./hafiza.js";
import { kaliteOnerisi } from "./kalite-kapisi.js";
import { eskiBirlestirmeFarki } from "./birlestirme-kuyrugu.js";
import { ortakUclariniKur } from "./ortak-calisma/uclar.js";
import { notlariListele, notOku, notYaz } from "./proje-dosyalari.js";
import { ROLLER } from "./roller.js";
import { secenekUclariniKur } from "./secenek/uclar.js";
import type { Sirket } from "./sirket.js";
import { tanitimUclariniKur } from "./tanitim-uclari.js";
import type { TerminalYoneticisi } from "./terminal.js";
import { ArnorgHatasi, bugun, bulunamadi, sadelestir } from "./yardimci.js";
import { webAyarSemasi } from "./web/ayarlar.js";
import { webUclariniKur } from "./web/uclar.js";
import { yetenekListesiSemasi } from "./yetenekler.js";
import { skillListesiSemasi } from "./skiller.js";
import { skillUclariniKur } from "./skill-uclari.js";

export interface SunucuSecenekleri {
  sirket: Sirket;
  terminaller: TerminalYoneticisi;
  erisimAnahtari: string;
  studyoDizini: string | null;
  izinliHostlar: string[];
}

const izinModu = z.enum(["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk", "auto"]);
const gorevDurumu = z.enum(["bekleyen", "planlandi", "calisiliyor", "inceleme", "tamam", "iptal"]);

const hafizaTuru = z.enum(["olgu", "karar", "tercih", "ogrenilen", "uzmanlik", "ozet"]);

/** Ofis karakteri: hazır kütüphane (k01) ya da üretilmiş (u-<kimlik>) */
const karakterSemasi = z.string().regex(/^(k\d{2}|u-[a-z0-9-]{4,64})$/, { error: () => iki("Geçersiz karakter kimliği.", "Invalid character id.") });

/** 0.0.10 · Proje token bütçesi (0 ya da null sınırsız) ve kullanım seviyesi */
const butceSemasi = z.object({ toplam: z.number().int().min(0).max(1_000_000_000_000).nullable(), gunluk: z.number().int().min(0).max(1_000_000_000_000).nullable() });
const seviyeSemasi = z.enum(["zeki", "normal", "tasarruflu"]);

const semalar = {
  hafizaYaz: z.object({
    tur: hafizaTuru,
    baslik: z.string().min(1).max(160),
    metin: z.string().min(1).max(8000),
    etiketler: z.array(z.string().max(40)).max(12).optional(),
    onem: z.number().int().min(1).max(5).optional(),
    gorevId: z.string().nullable().optional(),
    yerineGectigi: z.string().nullable().optional(),
  }),
  hafizaGuncelle: z.object({
    tur: hafizaTuru.optional(),
    baslik: z.string().min(1).max(160).optional(),
    metin: z.string().min(1).max(8000).optional(),
    etiketler: z.array(z.string().max(40)).max(12).optional(),
    onem: z.number().int().min(1).max(5).optional(),
  }),
  proje: z.object({
    ad: z.string().min(1).max(80),
    // 0.0.10: açılışta bütçe ve kullanım seviyesi
    butce: butceSemasi.optional(),
    seviye: seviyeSemasi.optional(),
    otomatikKademe: z.boolean().optional(),
    yol: z.string().max(1000).optional(),
    olustur: z.boolean(),
    aciklama: z.string().max(2000).optional(),
    dal: z.string().max(200).optional(),
    github: z.object({ ozel: z.boolean(), sahip: z.string().max(100).optional() }).nullable().optional(),
    kararVeren: z.enum(["ceo", "kurul"]).optional(),
  }),
  projeGuncelle: z.object({
    ad: z.string().min(1).max(80).optional(),
    aciklama: z.string().max(2000).optional(),
    varsayilanDal: z.string().min(1).max(200).optional(),
    otomatikGonder: z.boolean().optional(),
    hazirlik: z.enum(["bekliyor", "suruyor", "tamam", "atlandi"]).optional(),
    otomatikOnay: z.object({ etkin: z.boolean(), turler: z.array(z.enum(["arac", "ise_alim", "birlestirme", "genel", "anayasa", "isten_cikarma", "teslim"])) }).optional(),
    // Karar yetkisi: ceo (tam otonom) ya da kurul
    kararVeren: z.enum(["ceo", "kurul"]).optional(),
    testKomutu: z.string().max(2000).nullable().optional(),
    hazirlikKomutu: z.string().max(2000).nullable().optional(),
    testZamanAsimiDk: z.number().int().min(1).max(240).optional(),
    butce: butceSemasi.optional(),
    seviye: seviyeSemasi.optional(),
    otomatikKademe: z.boolean().optional(),
  }),
  klonla: z.object({
    depo: z.string().min(3).max(220),
    dal: z.string().max(200).optional(),
    yol: z.string().max(1000).optional(),
    ad: z.string().min(1).max(80).optional(),
    aciklama: z.string().max(2000).optional(),
    butce: butceSemasi.optional(),
    seviye: seviyeSemasi.optional(),
    otomatikKademe: z.boolean().optional(),
  }),
  githubDeposu: z.object({ ozel: z.boolean(), sahip: z.string().max(100).optional() }),
  iseAl: z.object({
    ad: z.string().min(1).max(40),
    rol: z.string().min(1),
    model: z.string().max(80).optional(),
    yoneticiId: z.string().nullable().optional(),
    talimatEki: z.string().max(8000).optional(),
    karakter: karakterSemasi.nullable().optional(),
    skiller: skillListesiSemasi.nullable().optional(),
  }),
  ajanGuncelle: z.object({
    // 0.0.10: null modeli projenin kullanım seviyesine bağlar
    model: z.string().max(80).nullable().optional(),
    izinModu: izinModu.optional(),
    yoneticiId: z.string().nullable().optional(),
    talimatEki: z.string().max(8000).optional(),
    karakter: karakterSemasi.nullable().optional(),
    yetenekler: yetenekListesiSemasi.optional(),
    skiller: skillListesiSemasi.nullable().optional(),
  }),
  baslat: z.object({ talimat: z.string().max(20_000).optional(), gorevId: z.string().optional() }),
  mesaj: z.object({ metin: z.string().min(1).max(20_000), oncelik: z.enum(["next", "now"]).optional() }),
  gorev: z.object({
    baslik: z.string().min(1).max(200),
    aciklama: z.string().max(20_000).optional(),
    kabulOlcutu: z.string().max(8000).optional(),
    atananId: z.string().nullable().optional(),
    bagimliliklar: z.array(z.string()).optional(),
    etiket: z.string().max(40).optional(),
    durum: gorevDurumu.optional(),
  }),
  gorevGuncelle: z.object({
    baslik: z.string().min(1).max(200).optional(),
    aciklama: z.string().max(20_000).optional(),
    kabulOlcutu: z.string().max(8000).optional(),
    atananId: z.string().nullable().optional(),
    bagimliliklar: z.array(z.string()).optional(),
    etiket: z.string().max(40).optional(),
    durum: gorevDurumu.optional(),
  }),
  // 0.0.8: ekli mesajın metni boş olabilir (boşluk denetimi Şirket'te); ekler yüklenmiş eklerin kimlikleri
  kanalMesaji: z.object({ metin: z.string().max(20_000), ekler: z.array(z.string().min(1).max(100)).max(EK_SINIRLARI.mesajBasina).optional() }),
  not: z.object({ yol: z.string().min(1).max(300), icerik: z.string().max(2_000_000) }),
  onay: z.object({ karar: z.enum(["onayla", "reddet"]), not: z.string().max(4000).optional() }),
  dosyaYaz: z.object({ alan: z.string(), yol: z.string().min(1), icerik: z.string() }),
  terminal: z.object({ alan: z.string(), sutun: z.number().int().optional(), satir: z.number().int().optional() }),
  ayarlar: z.object({
    dil: z.enum(["tr", "en"]).optional(),
    claudeYolu: z.string().nullable().optional(),
    varsayilanIzinModu: izinModu.optional(),
    onaySuresiSn: z.number().optional(),
    denetimSaklamaGun: z.number().int().min(0).max(3650).optional(),
    disEditor: z.string().max(200).optional(),
    tikanmaDakika: z.number().optional(),
    esZamanliAjan: z.number().int().min(0).max(50).optional(),
    acilistaSurdur: z.boolean().optional(),
    gorevTokenTavani: z.number().min(0).max(1_000_000_000).optional(),
    besSaatlikSinirYuzde: z.number().min(0).max(100).optional(),
    haftalikSinirYuzde: z.number().min(0).max(100).optional(),
    kodZekasiModeli: z.enum(["kaliteli", "hizli", "kapali"]).optional(),
    kodZekasiOtomatik: z.boolean().optional(),
    ghYolu: z.string().max(1000).nullable().optional(),
    projeKoku: z.string().max(1000).nullable().optional(),
    kurulumTamam: z.boolean().optional(),
    gunlukBrifing: z.object({ acik: z.boolean(), saat: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: () => iki("Saat SS:DD biçiminde olmalı.", "The time must be in HH:MM format.") }) }).optional(),
    web: webAyarSemasi.optional(),
  }),
  politika: z.array(
    z.object({
      id: z.string().min(1),
      ad: z.string().min(1),
      aciklama: z.string(),
      karar: z.enum(["izin", "ret", "sor"]),
      hedef: z.enum(["komut", "yol", "url", "arac"]),
      desenler: z.array(z.string()),
      araclar: z.array(z.string()),
      etkin: z.boolean(),
    }),
  ),
};

function anahtarEsit(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function sdkSurumu(): string {
  try {
    const giris = createRequire(import.meta.url).resolve("@anthropic-ai/claude-agent-sdk");
    let dizin = path.dirname(giris);
    for (let i = 0; i < 4; i++) {
      const aday = path.join(dizin, "package.json");
      if (fs.existsSync(aday)) {
        const p = JSON.parse(fs.readFileSync(aday, "utf8")) as { name?: string; version?: string };
        if (p.name === "@anthropic-ai/claude-agent-sdk" && p.version) return p.version;
      }
      dizin = path.dirname(dizin);
    }
  } catch {
    // bulunamadı
  }
  return iki("bilinmiyor", "unknown");
}

export async function sunucuKur(s: SunucuSecenekleri): Promise<FastifyInstance> {
  const { sirket, terminaller } = s;
  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });

  const hostIzinli = (host: string | undefined): boolean => {
    if (!host) return false;
    const adres = app.server.address();
    const gercekPort = adres && typeof adres === "object" ? adres.port : 0;
    const h = host.toLowerCase();
    const izinli = [`127.0.0.1:${gercekPort}`, `localhost:${gercekPort}`, `[::1]:${gercekPort}`, ...s.izinliHostlar.map((x) => x.toLowerCase())];
    return izinli.includes(h) || s.izinliHostlar.some((x) => !x.includes(":") && h.split(":")[0] === x.toLowerCase());
  };

  // Erişim denetimi: API ve WebSocket anahtar ister; Host ve Origin doğrulanır
  app.addHook("onRequest", async (istek, yanit) => {
    const yol = istek.url.split("?")[0] ?? "";
    if (!yol.startsWith("/api/") && !yol.startsWith("/ws")) return;
    if (!hostIzinli(istek.headers.host)) return yanit.code(403).send({ hata: iki("İzin verilmeyen Host başlığı.", "Host header not allowed.") });
    const koken = istek.headers.origin;
    if (koken) {
      let kokenHost = "";
      try {
        kokenHost = new URL(koken).host;
      } catch {
        // geçersiz origin
      }
      if (kokenHost.toLowerCase() !== String(istek.headers.host).toLowerCase()) return yanit.code(403).send({ hata: iki("İzin verilmeyen kaynak (Origin).", "Origin not allowed.") });
    }
    const baslik = istek.headers.authorization;
    const sorgu = (istek.query as Record<string, string | undefined>)?.anahtar;
    const verilen = baslik?.startsWith("Bearer ") ? baslik.slice(7) : sorgu;
    if (!verilen || !anahtarEsit(verilen, s.erisimAnahtari)) return yanit.code(401).send({ hata: iki("Erişim anahtarı gerekli ya da hatalı.", "The access key is missing or wrong.") });
  });

  app.setErrorHandler((hata, _istek, yanit) => {
    if (hata instanceof ArnorgHatasi) return yanit.code(hata.durumKodu).send({ hata: hata.message });
    if (hata instanceof ZodError) {
      const ilk = hata.issues[0];
      return yanit.code(400).send({
        hata: iki(`Geçersiz istek: ${ilk ? `${ilk.path.join(".") || "gövde"} — ${ilk.message}` : "doğrulama hatası"}`, `Invalid request: ${ilk ? `${ilk.path.join(".") || "body"} — ${ilk.message}` : "validation error"}`),
      });
    }
    const kod = (hata as { statusCode?: number }).statusCode;
    if (kod && kod < 500) return yanit.code(kod).send({ hata: (hata as Error).message });
    console.error("[arnorg] iç hata:", hata);
    return yanit.code(500).send({ hata: iki(`İç hata: ${(hata as Error).message}`, `Internal error: ${(hata as Error).message}`) });
  });

  const govde = <T>(sema: z.ZodType<T>, istek: FastifyRequest): T => sema.parse(istek.body ?? {});
  const param = (istek: FastifyRequest, ad: string): string => String((istek.params as Record<string, string>)[ad] ?? "");
  const sorgu = (istek: FastifyRequest, ad: string): string | undefined => (istek.query as Record<string, string | undefined>)[ad];
  const sayi = (deger: string | undefined, varsayilan: number) => {
    const n = Number(deger);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : varsayilan;
  };
  const tamam = { tamam: true };

  // ---------------- genel ----------------
  app.get("/api/saglik", async (): Promise<Saglik> => {
    const yol = sirket.claudeYolu;
    return {
      surum: ARNORG_SURUMU,
      dil: sirket.yapilandirma.ayarlar.dil,
      platform: `${process.platform}-${process.arch}`,
      claudeBulundu: Boolean(yol),
      claudeYolu: yol,
      claudeSurumu: await claudeSurumu(yol),
      sdkSurumu: sdkSurumu(),
      veriDizini: sirket.yapilandirma.veriDizini,
    };
  });
  app.get("/api/ayarlar", async () => sirket.yapilandirma.ayarlar);
  app.put("/api/ayarlar", async (i) => {
    const a = sirket.yapilandirma.guncelle(govde(semalar.ayarlar, i));
    sirket.hesap.ayarlarDegisti();
    sirket.kodZekasi.ayarlarDegisti();
    return a;
  });
  // Claude girişi ve abonelik kullanımı; ?tazele=1 Claude Code'a yeniden sorar
  app.get("/api/hesap", async (i) => (sorgu(i, "tazele") === "1" ? sirket.hesap.tazele() : sirket.hesap.mevcut));
  app.get("/api/roller", async () => ROLLER);
  // Claude Code'un sunduğu modeller sürümlü adlarıyla; değişince "modeller.guncellendi" yayınlanır
  app.get("/api/modeller", async () => sirket.modelKatalogu.mevcut);
  // Yetenek kataloğu, web motorlarının durumu, kurulun deneme araması ve okuması (web/uclar.ts)
  webUclariniKur(app, sirket);
  // Skill kütüphanesi: katalog ve rol varsayılanları (skill-uclari.ts)
  skillUclariniKur(app);

  // ---------------- kurulum: Claude Code, git, GitHub CLI ----------------
  app.get("/api/kurulum", async (i) => sirket.kurulum.durum(sorgu(i, "tazele") === "1"));
  app.get("/api/kurulum/islemler", async () => sirket.kurulum.islemListesi());
  app.get("/api/kurulum/islemler/:id", async (i) => sirket.kurulum.islem(param(i, "id")));
  app.post("/api/kurulum/islemler/:id/girdi", async (i) => sirket.kurulum.girdi(param(i, "id"), z.object({ metin: z.string().min(1).max(2000) }).parse(i.body ?? {}).metin));
  app.delete("/api/kurulum/islemler/:id", async (i) => sirket.kurulum.iptal(param(i, "id")));
  app.post("/api/kurulum/claude/giris", async () => sirket.kurulum.claudeGirisBaslat());
  app.post("/api/kurulum/claude/kur", async () => sirket.kurulum.claudeKur());
  app.post("/api/kurulum/gh/kur", async () => sirket.kurulum.ghKur());
  app.post("/api/kurulum/gh/giris", async () => sirket.kurulum.ghGirisBaslat());
  app.post("/api/kurulum/gh/git-yardimcisi", async () => sirket.kurulum.gitYardimcisiAyarla());
  app.post("/api/kurulum/git/kur", async () => sirket.kurulum.gitKur());
  app.put("/api/kurulum/git/kimlik", async (i) => {
    const g = z.object({ ad: z.string().max(100), eposta: z.string().max(200) }).parse(i.body ?? {});
    return sirket.kurulum.gitKimligiAyarla(g.ad, g.eposta);
  });

  // ---------------- GitHub ----------------
  app.get("/api/github/hesap", async () => sirket.github.hesap());
  app.get("/api/github/depolar", async (i) => sirket.github.depolar(sorgu(i, "q")));
  app.get("/api/github/dallar", async (i) => sirket.github.dallar(sorgu(i, "depo") ?? ""));
  app.post("/api/github/klonla", async (i) => sirket.github.klonla(govde(semalar.klonla, i), (p) => sirket.projeOlustur(p)));

  // ---------------- dizin gezgini (tarayıcıdaki Stüdyo için klasör seçimi) ----------------
  app.get("/api/dizinler", async (i) => dizinListesi(sorgu(i, "yol"), sirket.yapilandirma.projeKoku));
  app.post("/api/dizinler", async (i) => {
    const g = z.object({ ust: z.string().min(1).max(1000), ad: z.string().min(1).max(120) }).parse(i.body ?? {});
    return { yol: dizinOlustur(g.ust, g.ad) };
  });

  // ---------------- projeler ----------------
  app.get("/api/projeler", async () => sirket.projeler());
  app.post("/api/projeler", async (i) => sirket.projeOlustur(govde(semalar.proje, i)));
  app.get("/api/projeler/:pid", async (i) => sirket.projeOzeti(param(i, "pid")));
  app.patch("/api/projeler/:pid", async (i) => sirket.projeGuncelle(param(i, "pid"), govde(semalar.projeGuncelle, i)));
  app.get("/api/projeler/:pid/dallar", async (i) => sirket.projeDallari(param(i, "pid")));
  app.post("/api/projeler/:pid/esitle", async (i) => sirket.esitle(param(i, "pid"), z.object({ gonder: z.boolean().optional() }).parse(i.body ?? {}).gonder ?? false));
  app.post("/api/projeler/:pid/github", async (i) => sirket.githubDeposuAc(param(i, "pid"), govde(semalar.githubDeposu, i)));
  // Kalite kapısı için tek tıklık öneri (proje kökündeki package.json'da gerçek test betiği varsa npm test)
  app.get("/api/projeler/:pid/kalite-onerisi", async (i) => kaliteOnerisi(sirket.proje(param(i, "pid")).yol));
  app.post("/api/projeler/:pid/hazirlik", async (i) => {
    const pid = param(i, "pid");
    const islem = z.object({ islem: z.enum(["baslat", "atla"]) }).parse(i.body ?? {}).islem;
    return islem === "baslat" ? sirket.hazirlikBaslat(pid) : sirket.projeGuncelle(pid, { hazirlik: "atlandi" });
  });
  // CEO brifingi: CEO #yonetim'e kısa durum özeti yazar; önceki istek hazırlanıyorsa yeni uyandırma açılmaz
  app.post("/api/projeler/:pid/brifing", async (i) => sirket.brifingIste(param(i, "pid"), "kurul"));

  // ---------------- ana yasa ----------------
  app.get("/api/projeler/:pid/anayasa", async (i) => {
    sirket.proje(param(i, "pid"));
    return sirket.anayasa(param(i, "pid"));
  });
  app.put("/api/projeler/:pid/anayasa", async (i) => {
    const g = z.object({ maddeler: z.array(z.unknown()).max(40) }).parse(i.body ?? {});
    return sirket.anayasaGuncelle(param(i, "pid"), g.maddeler, iki("Yönetim kurulu", "The board"));
  });

  // ---------------- ajan zekâsı: sözler, beceriler ----------------
  app.get("/api/projeler/:pid/sozler", async (i) => {
    sirket.proje(param(i, "pid"));
    const durum = sorgu(i, "durum");
    return sirket.depo.sozler(param(i, "pid"), { durum: durum === "acik" || durum === "tutuldu" || durum === "iptal" ? durum : undefined, sinir: 300 });
  });
  app.get("/api/projeler/:pid/beceriler", async (i) => sirket.zeka.beceriler(sirket.proje(param(i, "pid"))));
  app.get("/api/projeler/:pid/beceriler/:ad", async (i) => sirket.zeka.beceriOku(sirket.proje(param(i, "pid")), param(i, "ad"), { kullanimSay: false }));

  // ---------------- global zekâ ----------------
  app.get("/api/zeka", async () => sirket.kuresel.durum());
  app.post("/api/zeka/kurallar", async (i) => {
    const g = z.object({ metin: z.string().min(5).max(600), kapsam: z.array(z.string().max(20)).max(8).optional() }).parse(i.body ?? {});
    return sirket.kuresel.kurulEkle(g.metin, g.kapsam ?? []);
  });
  app.patch("/api/zeka/kurallar/:id", async (i) => {
    const g = z.object({ metin: z.string().min(5).max(600).optional(), kapsam: z.array(z.string().max(20)).max(8).optional(), durum: z.enum(["aday", "etkin", "emekli"]).optional() }).parse(i.body ?? {});
    return sirket.kuresel.duzenle(param(i, "id"), g);
  });
  app.post("/api/zeka/kurallar/:id/geri-bildirim", async (i) => {
    const g = z.object({ sonuc: z.enum(["ise_yaradi", "yanlis", "ihlal"]), not: z.string().max(500).optional() }).parse(i.body ?? {});
    return sirket.kuresel.geriBildirim(param(i, "id"), g.sonuc, g.not ?? null, iki("Yönetim kurulu", "The board"));
  });
  app.delete("/api/zeka/kurallar/:id", async (i) => {
    sirket.kuresel.sil(param(i, "id"));
    return tamam;
  });
  app.delete("/api/projeler/:pid", async (i) => {
    sirket.projeSil(param(i, "pid"));
    return tamam;
  });

  // ---------------- ekip ----------------
  app.get("/api/projeler/:pid/ajanlar", async (i) => {
    sirket.proje(param(i, "pid"));
    return sirket.depo.ajanlar(param(i, "pid"));
  });
  app.post("/api/projeler/:pid/ajanlar", async (i) => sirket.iseAl(param(i, "pid"), govde(semalar.iseAl, i)));
  app.patch("/api/ajanlar/:aid", async (i) => sirket.ajanGuncelle(param(i, "aid"), govde(semalar.ajanGuncelle, i)));
  // İşten çıkarma: açık işleri ve bildikleri devralana (verilmezse yöneticisine) geçer
  app.delete("/api/ajanlar/:aid", async (i) => {
    await sirket.istenCikar(param(i, "aid"), sorgu(i, "devralan") ?? null, iki("Yönetim kurulu", "The board"));
    return tamam;
  });
  app.get("/api/ajanlar/:aid/zeka", async (i) => {
    const a = sirket.ajan(param(i, "aid"));
    return sirket.zeka.ozet(a, sirket.hafiza.defter(a));
  });
  app.post("/api/ajanlar/:aid/aktar", async (i) => {
    const g = z.object({ kime: z.string().min(1), sozler: z.boolean().optional(), not: z.string().max(1000).optional() }).parse(i.body ?? {});
    const veren = sirket.ajan(param(i, "aid"));
    const alan = sirket.ajan(g.kime);
    return { mesaj: sirket.zeka.aktar(veren, alan, { sozler: g.sozler, not: g.not, defter: sirket.hafiza.defter(veren), defterYaz: (x, icerik) => sirket.defterYaz(x.id, icerik) }) };
  });
  app.post("/api/ajanlar/:aid/baslat", async (i) => sirket.ajanBaslat(param(i, "aid"), govde(semalar.baslat, i)));
  app.post("/api/ajanlar/:aid/mesaj", async (i) => {
    const g = govde(semalar.mesaj, i);
    // Kurul çalışana yazdı: kurulun durdurduğu çalışan ve projesi sürer
    const a = sirket.ajan(param(i, "aid"));
    sirket.kurulDevamEtti(a.projeId, [a.id]);
    await sirket.ajanaMesaj(a.id, g.metin, g.oncelik ?? "next", { tur: "kurul" });
    return tamam;
  });
  app.post("/api/ajanlar/:aid/kes", async (i) => {
    await sirket.ajanKes(param(i, "aid"));
    return tamam;
  });
  app.post("/api/ajanlar/:aid/durdur", async (i) => sirket.ajanDurdur(param(i, "aid")));
  // Mesaiyi durdur: projenin bütün oturumları kapanır, sıradaki mesajlar düşer, açılışta kimse uyanmaz
  app.post("/api/projeler/:pid/durdur", async (i) => {
    sirket.tumunuDurdur(sirket.proje(param(i, "pid")).id);
    return tamam;
  });
  app.post("/api/ajanlar/:aid/mod", async (i) => sirket.ajanMod(param(i, "aid"), z.object({ mod: izinModu }).parse(i.body ?? {}).mod));
  // Modeli sabitler; model: null projenin kullanım seviyesine bağlar (0.0.10)
  app.post("/api/ajanlar/:aid/model", async (i) => sirket.ajanModel(param(i, "aid"), z.object({ model: z.string().min(1).nullable() }).parse(i.body ?? {}).model));
  app.get("/api/ajanlar/:aid/akis", async (i) => sirket.akis(param(i, "aid"), sayi(sorgu(i, "sinir"), 300)));

  // ---------------- görevler ----------------
  app.get("/api/projeler/:pid/gorevler", async (i) => {
    sirket.proje(param(i, "pid"));
    return sirket.depo.gorevler(param(i, "pid"));
  });
  app.post("/api/projeler/:pid/gorevler", async (i) => {
    const g = govde(semalar.gorev, i);
    const gorev = sirket.gorevOlustur(param(i, "pid"), { ...g, durum: g.durum === "calisiliyor" ? "planlandi" : g.durum });
    return g.durum === "calisiliyor" ? sirket.gorevGuncelle(gorev.id, { durum: "calisiliyor" }) : gorev;
  });
  app.patch("/api/gorevler/:gid", async (i) => sirket.gorevGuncelle(param(i, "gid"), govde(semalar.gorevGuncelle, i)));

  // ---------------- kanallar ----------------
  app.get("/api/projeler/:pid/kanallar", async (i) => {
    sirket.proje(param(i, "pid"));
    // Sistem kanallarının açıklaması geçerli dilde; diğerlerinde kayıtlı açıklama
    return sirket.depo.kanallar(param(i, "pid")).map((k) => ({ ...k, aciklama: kanalAciklamasi(k.ad, k.aciklama, dil()) }));
  });
  app.get("/api/projeler/:pid/kanallar/:kanal/mesajlar", async (i) => {
    sirket.proje(param(i, "pid"));
    return sirket.depo.mesajlar(param(i, "pid"), param(i, "kanal"), Math.min(sayi(sorgu(i, "sinir"), 200), 1000));
  });
  app.post("/api/projeler/:pid/kanallar/:kanal/mesajlar", async (i) => {
    const g = govde(semalar.kanalMesaji, i);
    return sirket.mesajGonder(param(i, "pid"), param(i, "kanal"), KURUL, g.metin, g.ekler);
  });
  // Kurulun kurduğu kanallar: üyeler ve serbest konuşma (ozel-kanallar.ts)
  const kanalUyeleri = z.array(z.string().min(1).max(100)).max(50);
  app.post("/api/projeler/:pid/kanallar", async (i) => {
    const g = z.object({ ad: z.string().min(1).max(60), aciklama: z.string().max(300).optional(), uyeler: kanalUyeleri }).parse(i.body ?? {});
    return sirket.kanallar.olustur(param(i, "pid"), g);
  });
  app.patch("/api/projeler/:pid/kanallar/:kanal", async (i) => {
    const g = z.object({ aciklama: z.string().max(300).optional(), uyeler: kanalUyeleri.optional() }).parse(i.body ?? {});
    return sirket.kanallar.guncelle(param(i, "pid"), param(i, "kanal"), g);
  });
  app.delete("/api/projeler/:pid/kanallar/:kanal", async (i) => {
    sirket.kanallar.sil(param(i, "pid"), param(i, "kanal"));
    return tamam;
  });
  app.post("/api/projeler/:pid/kanallar/:kanal/konusma", async (i) => {
    const g = z.object({ islem: z.enum(["baslat", "durdur"]), konu: z.string().max(2000).optional() }).parse(i.body ?? {});
    return sirket.kanallar.konusmaIslemi(param(i, "pid"), param(i, "kanal"), g);
  });
  // Seçenekli sorular: kurulun seçimi soran ajana kurul mesajı olarak gider (secenek/uclar.ts)
  secenekUclariniKur(app, sirket);

  // ---------------- notlar ----------------
  app.get("/api/projeler/:pid/notlar", async (i) => notlariListele(sirket.proje(param(i, "pid")).yol));
  app.get("/api/projeler/:pid/not", async (i) => notOku(sirket.proje(param(i, "pid")).yol, sorgu(i, "yol") ?? ""));
  app.put("/api/projeler/:pid/not", async (i) => {
    const g = govde(semalar.not, i);
    const p = sirket.proje(param(i, "pid"));
    const n = notYaz(p.yol, g.yol, g.icerik);
    sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: p.id, alan: "ana", yol: `.arnorg/notlar/${n.yol}`, ajanId: null });
    return n;
  });

  // ---------------- tarayıcı: düzeltme notları (duzeltme-uclari.ts) ----------------
  duzeltmeUclariniKur(app, sirket);

  // ---------------- mesaj ekleri: yükleme, taslak silme, sunum (mesaj-ekleri/uclar.ts) ----------------
  ekUclariniKur(app, sirket);

  // ---------------- tanıtım: README.md vitrini ve güncelleme isteği (tanitim-uclari.ts) ----------------
  tanitimUclariniKur(app, sirket);

  // ---------------- proje adresleri: çalışan sunucular (adres-uclari.ts) ----------------
  adresUclariniKur(app, sirket, s.izinliHostlar);

  // ---------------- proje hafızası ----------------
  app.get("/api/projeler/:pid/hafiza", async (i) => {
    const pid = param(i, "pid");
    sirket.proje(pid);
    const q = sorgu(i, "q")?.trim();
    const tur = sorgu(i, "tur") as HafizaTuru | undefined;
    if (tur && !HAFIZA_TURLERI.includes(tur)) throw new ArnorgHatasi(iki("Geçersiz hafıza türü.", "Invalid memory type."));
    if (q) return sirket.hafiza.ara(pid, q, tur, 50);
    return sirket.depo.hafizaKayitlari(pid, { tur, eskilerDahil: sorgu(i, "eskiler") === "1", sinir: 500 });
  });
  app.post("/api/projeler/:pid/hafiza", async (i) => {
    const g = govde(semalar.hafizaYaz, i);
    return sirket.hafizaYaz(param(i, "pid"), { ...g, gorevId: g.gorevId ?? null, yerineGectigi: g.yerineGectigi ?? null }, null);
  });
  app.patch("/api/hafiza/:hid", async (i) => sirket.hafiza.guncelle(param(i, "hid"), govde(semalar.hafizaGuncelle, i)));
  app.get("/api/projeler/:pid/hafiza/benzerler", async (i) => {
    const pid = param(i, "pid");
    sirket.proje(pid);
    return sirket.hafiza.benzerler(pid);
  });
  app.post("/api/projeler/:pid/hafiza/ayri", async (i) => {
    const pid = param(i, "pid");
    sirket.proje(pid);
    const g = govde(z.object({ a: z.string().min(1), b: z.string().min(1) }), i);
    sirket.hafiza.ayriTut(pid, g.a, g.b);
    return { tamam: true };
  });
  app.post("/api/hafiza/:hid/birlestir", async (i) => {
    const g = govde(z.object({ eskiyen: z.string().min(1), metin: z.string().max(8000).optional() }), i);
    return sirket.hafiza.birlestir(param(i, "hid"), g.eskiyen, g.metin);
  });
  app.delete("/api/hafiza/:hid", async (i) => {
    sirket.hafiza.sil(param(i, "hid"));
    return { tamam: true };
  });
  app.get("/api/projeler/:pid/sorular", async (i) => {
    const pid = param(i, "pid");
    sirket.proje(pid);
    return sirket.depo.sorular(pid, { sinir: Math.min(sayi(sorgu(i, "sinir"), 100), 500) });
  });
  app.get("/api/ajanlar/:aid/defter", async (i) => {
    const a = sirket.ajan(param(i, "aid"));
    return { icerik: sirket.hafiza.defter(a), guncelleme: sirket.depo.defter(a.id)?.guncelleme ?? null };
  });
  app.put("/api/ajanlar/:aid/defter", async (i) => {
    const g = govde(z.object({ icerik: z.string().max(6000) }), i);
    sirket.defterYaz(param(i, "aid"), g.icerik);
    return { tamam: true };
  });

  // ---------------- kod zekâsı ----------------
  // Alan: "ana" (proje reposu) ya da ajan kimliği (ajanın worktree'si). Dizinlenmemiş alanda ilk sorgu taramayı başlatır.
  const kodAlani = (i: FastifyRequest) => {
    const pid = param(i, "pid");
    sirket.proje(pid);
    return { pid, alan: sorgu(i, "alan")?.trim() || "ana" };
  };
  const kodYolu = (i: FastifyRequest, gerekli: boolean) => {
    const yol = sorgu(i, "yol")?.trim() ?? "";
    if (gerekli && !yol) throw new ArnorgHatasi(iki("Dosya yolu (yol) gerekli.", "A file path (yol) is required."));
    if (yol.length > 1000) throw new ArnorgHatasi(iki("Yol çok uzun.", "The path is too long."));
    return yol;
  };
  app.get("/api/kod-zekasi/modeller", async () => sirket.kodZekasi.modeller());
  app.get("/api/projeler/:pid/kod-zekasi", async (i) => {
    const { pid } = kodAlani(i);
    const alan = sorgu(i, "alan")?.trim();
    return alan ? [sirket.kodZekasi.durum(pid, alan)] : sirket.kodZekasi.durumlar(pid);
  });
  app.post("/api/projeler/:pid/kod-zekasi/dizinle", async (i) => {
    const pid = param(i, "pid");
    sirket.proje(pid);
    const g = govde(z.object({ alan: z.string().max(100).optional(), sifirdan: z.boolean().optional() }), i);
    const alan = g.alan?.trim() || "ana";
    const durum = sirket.kodZekasi.durum(pid, alan);
    // İş arka planda sürer; ilerleme kod.dizin olaylarıyla gelir
    void sirket.kodZekasi.dizinle(pid, alan, { sifirdan: g.sifirdan }).catch(() => undefined);
    return durum;
  });
  app.get("/api/projeler/:pid/kod-zekasi/ara", async (i) => {
    const { pid, alan } = kodAlani(i);
    const q = sorgu(i, "q")?.trim() ?? "";
    if (!q) throw new ArnorgHatasi(iki("Arama metni (q) gerekli.", "Search text (q) is required."));
    if (q.length > 2000) throw new ArnorgHatasi(iki("Arama metni çok uzun.", "The search text is too long."));
    return sirket.kodZekasi.ara(pid, alan, q, { sinir: Math.min(sayi(sorgu(i, "sinir"), 20), 50), yol: kodYolu(i, false) || undefined });
  });
  app.get("/api/projeler/:pid/kod-zekasi/semboller", async (i) => {
    const { pid, alan } = kodAlani(i);
    const tur = sorgu(i, "tur") as KodSembolTuru | undefined;
    if (tur && !(tur in KOD_SEMBOL_TURU_ADLARI)) throw new ArnorgHatasi(iki("Geçersiz sembol türü.", "Invalid symbol kind."));
    return sirket.kodZekasi.semboller(pid, alan, (sorgu(i, "q") ?? "").slice(0, 200), { tur, sinir: Math.min(sayi(sorgu(i, "sinir"), 100), 500) });
  });
  app.get("/api/projeler/:pid/kod-zekasi/harita", async (i) => {
    const { pid, alan } = kodAlani(i);
    return sirket.kodZekasi.harita(pid, alan, kodYolu(i, false));
  });
  app.get("/api/projeler/:pid/kod-zekasi/bagimliliklar", async (i) => {
    const { pid, alan } = kodAlani(i);
    return sirket.kodZekasi.bagimliliklar(pid, alan, kodYolu(i, true));
  });
  app.get("/api/projeler/:pid/kod-zekasi/grafik", async (i) => {
    const { pid, alan } = kodAlani(i);
    const duzey = sorgu(i, "duzey") === "dosya" ? "dosya" : "klasor";
    return sirket.kodZekasi.grafik(pid, alan, duzey, { anlam: sorgu(i, "anlam") !== "0" });
  });
  app.get("/api/projeler/:pid/kod-zekasi/ilgili", async (i) => {
    const { pid, alan } = kodAlani(i);
    return sirket.kodZekasi.ilgili(pid, alan, kodYolu(i, true), { sinir: Math.min(sayi(sorgu(i, "sinir"), 12), 40) });
  });
  app.get("/api/projeler/:pid/kod-zekasi/benzer", async (i) => {
    const { pid, alan } = kodAlani(i);
    return sirket.kodZekasi.benzer(pid, alan, kodYolu(i, true), sayi(sorgu(i, "satir"), 1), Math.min(sayi(sorgu(i, "sinir"), 8), 30));
  });

  // ---------------- rapor ----------------
  app.get("/api/projeler/:pid/rapor", async (i) => raporOlustur(sirket, param(i, "pid"), sayi(sorgu(i, "gun"), 7)));
  app.post("/api/projeler/:pid/rapor", async (i) => {
    const p = sirket.proje(param(i, "pid"));
    const r = raporOlustur(sirket, p.id, sayi(sorgu(i, "gun"), 7));
    notYaz(p.yol, r.yol, r.markdown);
    sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: p.id, alan: "ana", yol: `.arnorg/notlar/${r.yol}`, ajanId: null });
    return r;
  });

  // ---------------- denetim ve onaylar ----------------
  app.get("/api/projeler/:pid/denetim", async (i) => {
    sirket.proje(param(i, "pid"));
    return sirket.depo.denetimKayitlari(param(i, "pid"), Math.min(sayi(sorgu(i, "sinir"), 300), 2000));
  });
  // Dışa aktarım: Denetim ekranının süzgeciyle (karar, ajan, q) tablodaki kayıtlar JSONL olarak, eskiden yeniye.
  // Sayfa sayfa okunup akıtılır; saklama süresi dolup arşive taşınanlar <veri>/arsiv altındadır.
  app.get("/api/projeler/:pid/denetim/disa-aktar", async (i, yanit) => {
    const p = sirket.proje(param(i, "pid"));
    const karar = sorgu(i, "karar") || null;
    if (karar && !["izin", "ret", "sor", "degisti"].includes(karar)) throw new ArnorgHatasi(iki("Geçersiz karar.", "Invalid decision."));
    const suzgec: DenetimSuzgeci = { karar: karar as Karar | null, ajanId: sorgu(i, "ajan") || null, q: sorgu(i, "q")?.slice(0, 500) || null };
    const dosyaAdi = `arnorg-denetim-${sadelestir(p.ad)}-${bugun()}.jsonl`;
    async function* satirlar() {
      let imlec: DenetimImleci | null = null;
      do {
        const sayfa = sirket.depo.denetimSayfasi(p.id, imlec);
        imlec = sayfa.imlec;
        const metin = sayfa.kayitlar.filter((k) => suzgeceUyar(k, suzgec)).map(jsonlSatiri).join("");
        if (metin) yield metin;
      } while (imlec);
    }
    return yanit
      .header("Content-Type", "application/x-ndjson; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${dosyaAdi}"`)
      .header("Cache-Control", "no-store")
      .send(Readable.from(satirlar()));
  });
  app.get("/api/projeler/:pid/politika", async (i) => sirket.politika(param(i, "pid")));
  app.put("/api/projeler/:pid/politika", async (i) => sirket.politikaYaz(param(i, "pid"), govde(semalar.politika, i)));
  app.get("/api/projeler/:pid/onaylar", async (i) => {
    sirket.proje(param(i, "pid"));
    const durum = sorgu(i, "durum") as OnayDurumu | undefined;
    if (durum && !["bekliyor", "onaylandi", "reddedildi", "zaman_asimi"].includes(durum)) throw new ArnorgHatasi(iki("Geçersiz durum.", "Invalid status."));
    return sirket.depo.onaylar(param(i, "pid"), durum);
  });
  // Kurulun kararı: tam otonom kipte CEO'yu bekleyen onaya da kurul karar verebilir (kararı veren "kurul" yazılır)
  app.post("/api/onaylar/:oid", async (i) => {
    const g = govde(semalar.onay, i);
    return sirket.onayKarari(param(i, "oid"), g.karar, g.not);
  });
  // 0.0.8: birleştirme yok; eski birleştirme onayının farkı geçmişte okunur kalır
  app.post("/api/onaylar/:oid/birlestir", async () => {
    throw new ArnorgHatasi(
      iki(
        "ArnOrg 0.0.8'de birleştirme yok: ekip ortak projede çalışır, görev kayıtları çalışma dalına commit'lenir ve her kayıttan sonra testler arka planda koşar.",
        "There are no merges in ArnOrg 0.0.8: the team works in the shared project, task saves are committed to the working branch and the tests run in the background after every save.",
      ),
      410,
    );
  });
  app.get("/api/onaylar/:oid/fark", async (i) => eskiBirlestirmeFarki(sirket.depo, param(i, "oid")));
  // 0.0.8 ortak çalışma: kiralar, tempo, görev kayıtları ve kayıtların kalite denetimi (ortak-calisma/uclar.ts)
  ortakUclariniKur(app, sirket);

  // ---------------- kod ----------------
  const duzenleyen = (tam: string): string | null => {
    const d = sirket.duzenlemeler.get(tam);
    if (!d) return null;
    const a = sirket.depo.ajan(d.ajanId);
    const aktif = a && (a.durum === "calisiyor" || a.durum === "karar_bekliyor");
    return aktif && Date.now() - d.zaman < 5 * 60_000 ? d.ajanId : null;
  };
  app.get("/api/projeler/:pid/calisma-alanlari", async (i) => sirket.calismaAlanlari(param(i, "pid")));
  fsUclariniKur(app, sirket);
  app.get("/api/projeler/:pid/dosyalar", async (i) => dosyaAgaci(sirket.alanYolu(param(i, "pid"), sorgu(i, "alan") ?? "ana")));
  app.get("/api/projeler/:pid/dosya", async (i) => {
    const kok = sirket.alanYolu(param(i, "pid"), sorgu(i, "alan") ?? "ana");
    const yol = sorgu(i, "yol") ?? "";
    return dosyaOku(kok, yol, duzenleyen(path.resolve(kok, yol)));
  });
  app.put("/api/projeler/:pid/dosya", async (i) => {
    const g = govde(semalar.dosyaYaz, i);
    const pid = param(i, "pid");
    const kok = sirket.alanYolu(pid, g.alan);
    const tam = path.resolve(kok, g.yol);
    const d = duzenleyen(tam);
    if (d) throw new ArnorgHatasi(iki(`${sirket.depo.ajan(d)?.ad ?? "Bir ajan"} bu dosyayı düzenliyor. Önce ajanı duraklatın.`, `${sirket.depo.ajan(d)?.ad ?? "An agent"} is editing this file. Pause the agent first.`), 409);
    sirket.kullaniciKilitleri.set(tam, Date.now() + 30_000);
    dosyaYaz(kok, g.yol, g.icerik);
    // Dosya bir ajanın çalışma alanındaysa ajana not düşülür
    const alanAjan = g.alan !== "ana" ? sirket.depo.ajan(g.alan) : null;
    if (alanAjan && (alanAjan.durum === "calisiyor" || alanAjan.durum === "bosta")) {
      void sirket
        .ajanaMesaj(alanAjan.id, iki(`Yönetim kurulu ${g.yol} dosyasını düzenledi. Bu dosyaya dokunmadan önce yeniden oku.`, `The board edited ${g.yol}. Re-read it before you touch it.`), "next", { tur: "sistem" })
        .catch(() => undefined);
    }
    sirket.olaylar.yayinla({ tur: "dosya.degisti", projeId: pid, alan: g.alan, yol: g.yol.replace(/\\/g, "/"), ajanId: null });
    return tamam;
  });
  app.get("/api/projeler/:pid/fark", async (i) => {
    const p = sirket.proje(param(i, "pid"));
    const kok = sirket.alanYolu(p.id, sorgu(i, "alan") ?? "ana");
    const yol = sorgu(i, "yol");
    const f = await gitIslemleri.fark(kok, p.varsayilanDal, yol || undefined);
    const durumlar = await gitIslemleri.degisiklikler(kok);
    const dosyalar = f.sayilar.map((x) => ({ yol: x.yol, degisiklik: durumlar.get(x.yol) ?? ("M" as const), eklenen: x.eklenen, silinen: x.silinen }));
    for (const [y, d] of durumlar) if (d === "A" && !dosyalar.some((x) => x.yol === y) && (!yol || y === yol)) dosyalar.push({ yol: y, degisiklik: "A", eklenen: 0, silinen: 0 });
    return { fark: f.fark, dosyalar };
  });
  app.get("/api/projeler/:pid/ara", async (i) => ara(sirket.alanYolu(param(i, "pid"), sorgu(i, "alan") ?? "ana"), sorgu(i, "q") ?? ""));
  app.post("/api/projeler/:pid/disarida-ac", async (i) => {
    const g = z.object({ alan: z.string(), yol: z.string().optional() }).parse(i.body ?? {});
    const kok = sirket.alanYolu(param(i, "pid"), g.alan);
    const hedef = g.yol ? path.resolve(kok, g.yol) : kok;
    if (!hedef.startsWith(path.resolve(kok))) throw new ArnorgHatasi(iki("Geçersiz yol.", "Invalid path."));
    const editor = sirket.yapilandirma.ayarlar.disEditor || "code";
    const cocuk = spawn(editor, [hedef], { detached: true, stdio: "ignore", windowsHide: true, shell: process.platform === "win32", env: temizOrtam() });
    cocuk.on("error", () =>
      sirket.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: iki(`"${editor}" çalıştırılamadı. Ayarlar'dan dış editör komutunu değiştirin.`, `Could not run "${editor}". Change the external editor command in Settings.`) }),
    );
    cocuk.unref();
    return tamam;
  });

  // ---------------- terminal ----------------
  app.post("/api/projeler/:pid/terminaller", async (i) => {
    const g = govde(semalar.terminal, i);
    const pid = param(i, "pid");
    return { id: terminaller.ac(pid, sirket.alanYolu(pid, g.alan), g.sutun, g.satir) };
  });
  app.delete("/api/terminaller/:tid", async (i) => {
    terminaller.kapat(param(i, "tid"));
    return tamam;
  });

  // ---------------- kullanım (token ve abonelik penceresi) ----------------
  app.get("/api/projeler/:pid/kullanim", async (i) => sirket.kullanimOzeti(param(i, "pid")));

  // ---------------- WebSocket: canlı olaylar ----------------
  // Bağlı Stüdyo sayısı: abonelik kullanımı yalnız biri bağlıyken (ya da ajanlar beklerken) dönemsel okunur
  let studyoIstemcisi = 0;
  sirket.hesap.istemciVar = () => studyoIstemcisi > 0;
  app.get("/ws", { websocket: true }, (soket) => {
    let abone: string | null = null;
    studyoIstemcisi++;
    // Stüdyo bağlandı: kullanım bayatsa hemen okunur
    sirket.hesap.istemciBaglandi();
    const gonder = (o: SunucuOlayi) => {
      if (soket.readyState === soket.OPEN) soket.send(JSON.stringify(o));
    };
    gonder({ tur: "merhaba", surum: ARNORG_SURUMU });
    const birak = sirket.olaylar.dinle((o) => {
      const p = olayProjesi(o);
      if (p === null || abone === null || p === abone) gonder(o);
    });
    const nabiz = setInterval(() => soket.ping(), 30_000);
    soket.on("message", (ham: Buffer) => {
      try {
        const m = JSON.parse(ham.toString()) as IstemciOlayi;
        if (m.tur === "abone") abone = m.projeId;
      } catch {
        // bozuk mesaj yok sayılır
      }
    });
    soket.on("close", () => {
      studyoIstemcisi--;
      clearInterval(nabiz);
      birak();
    });
  });

  // ---------------- WebSocket: terminal ----------------
  app.get("/ws/terminal/:tid", { websocket: true }, (soket, istek) => {
    const tid = param(istek, "tid");
    let birak: () => void = () => undefined;
    try {
      birak = terminaller.bagla(
        tid,
        (veri) => {
          if (soket.readyState === soket.OPEN) soket.send(veri);
        },
        () => soket.close(1000, iki("Terminal kapandı", "Terminal closed")),
      );
    } catch {
      soket.close(4404, iki("Terminal bulunamadı", "Terminal not found"));
      return;
    }
    soket.on("message", (ham: Buffer) => {
      try {
        const m = JSON.parse(ham.toString()) as TerminalIstemciMesaji;
        if (m.tur === "girdi" && typeof m.veri === "string") terminaller.yaz(tid, m.veri);
        else if (m.tur === "boyut") terminaller.boyutla(tid, m.sutun, m.satir);
      } catch {
        // bozuk mesaj yok sayılır
      }
    });
    soket.on("close", () => birak());
  });

  // ---------------- Stüdyo (statik) ----------------
  if (s.studyoDizini && fs.existsSync(path.join(s.studyoDizini, "index.html"))) {
    // wildcard: dosyalar istek anında çözülür; Stüdyo yeniden derlenince yeni dosyalar yeniden başlatmadan görünür
    await app.register(fastifyStatic, {
      root: s.studyoDizini,
      wildcard: true,
      index: ["index.html"],
      cacheControl: false,
      setHeaders: (yanit, yol) => {
        // Adı içerik özetli dosyalar kalıcı önbelleğe, index.html her açılışta tazelenir
        yanit.header("Cache-Control", /[\\/]assets[\\/]/.test(yol) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    app.setNotFoundHandler((istek: FastifyRequest, yanit: FastifyReply) => {
      const yol = istek.url.split("?")[0] ?? "";
      // Uzantılı istek (eksik derleme dosyası) index.html'e düşmez; tarayıcıda boş sayfa yerine açık 404 görünür
      const dosyaIstegi = /\.[a-z0-9]{1,8}$/i.test(yol);
      if (istek.method === "GET" && !dosyaIstegi && !yol.startsWith("/api/") && !yol.startsWith("/ws")) {
        return yanit.header("Cache-Control", "no-cache").sendFile("index.html");
      }
      return yanit.code(404).send({ hata: iki("Bulunamadı.", "Not found.") });
    });
  } else {
    app.get("/", async (_i, yanit) =>
      yanit
        .type("text/html; charset=utf-8")
        .send(
          iki(
            "<!doctype html><meta charset=utf-8><title>ArnOrg</title><body style='background:#0a0a0b;color:#f2f0ec;font-family:monospace;padding:40px'>ArnOrg çekirdeği çalışıyor. Stüdyo derlemesi bulunamadı: <code>npm run build -w @arnorg/studyo</code></body>",
            "<!doctype html><meta charset=utf-8><title>ArnOrg</title><body style='background:#0a0a0b;color:#f2f0ec;font-family:monospace;padding:40px'>The ArnOrg core is running. No Studio build was found: <code>npm run build -w @arnorg/studyo</code></body>",
          ),
        ),
    );
    app.setNotFoundHandler((_i, yanit) => yanit.code(404).send({ hata: iki("Bulunamadı.", "Not found.") }));
  }

  void bulunamadi;
  return app;
}
