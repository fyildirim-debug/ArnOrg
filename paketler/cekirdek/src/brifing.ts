// CEO brifingi: kurul Karargâh'taki "Brifing ver" düğmesiyle ya da her gün seçtiği saatte CEO'dan #yonetim'e kısa bir
// durum özeti ister. Son brifingden bu yana olanlar depodan derlenir, model çağrılmaz: biten, süren, bekleyen ve bloklu
// görevler, bekleyen onaylar, birleşen dallar ve kalite kapısı sonuçları, ekipteki değişiklikler, abonelik penceresi.
// CEO bu veriyle kurul kaynağıyla uyandırılır (eşzamanlı tavandan muaf); #yonetim'de "yazıyor" görünür, CEO brifingi
// mesaj_gonder ile oraya yazar. CEO brifingi yazana ya da brifing turu bitene dek (en çok 5 dakika) aynı projede ikinci
// istek yeni uyandırma açmaz.
// Günlük zamanlayıcı dakikada bir bakar: saat geçtiyse ve o gün verilmediyse uygun her projede brifing ister; son
// brifingden bu yana görev, onay ya da mesaj hareketi yoksa o günü atlar (abonelik boşa harcanmaz).
import {
  AD_HARITALARI_EN,
  ARNORG_GONDEREN,
  BIRLESTIRME_SON_DURUMLARI,
  BRIFING_BOLUMLERI,
  GOREV_DURUM_ADLARI,
  ONAY_TURU_ADLARI,
  rolMetni,
  type Ajan,
  type AjanDurumu,
  type BirlestirmeDurumu,
  type BirlestirmeKalitesi,
  type BrifingKaynagi,
  type BrifingYaniti,
  type Gorev,
  type GunlukBrifingAyari,
  type HesapDurumu,
  type Onay,
  type OnayTuru,
  type Proje,
  type SunucuOlayi,
} from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { dil, iki } from "./dil.js";
import { rolBul } from "./roller.js";
import { ArnorgHatasi, bugun, bulunamadi, kisalt } from "./yardimci.js";

/** Son brifingin istendiği an (ISO, proje başına): verinin başı */
export const BRIFING_SON = "brifing-son:";
/** Otomatik brifingin verildiği ya da atlandığı gün (YYYY-AA-GG, proje başına) */
export const BRIFING_GUNLUK = "brifing-gunluk:";
/** Son brifingteki ekip (JSON): ekip değişiklikleri bununla karşılaştırılır */
export const BRIFING_EKIP = "brifing-ekip:";
/** Son brifingi yanıtlayan CEO mesajının kimliği: sonraki günün hareketi sayılmaz */
export const BRIFING_YANIT = "brifing-yanit:";

/** CEO bu süre içinde #yonetim'e yazmazsa yeni istek yeniden uyandırır */
export const HAZIRLANIYOR_MS = 5 * 60_000;
/** Hiç brifing verilmemiş projede veri bu kadar geriye bakar */
export const ILK_PENCERE_MS = 7 * 86_400_000;
/** Veride bölüm başına en çok satır; kalanı sayıyla anılır */
const SATIR_SINIRI = 12;

export const VARSAYILAN_GUNLUK_BRIFING: GunlukBrifingAyari = { acik: true, saat: "09:00" };
const SAAT_DESENI = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Günlük brifing ayarı: bozuk alan yedekteki değeri alır (yedek verilmezse açık, 09:00) */
export function gunlukBrifingAyari(v: unknown, yedek: GunlukBrifingAyari = VARSAYILAN_GUNLUK_BRIFING): GunlukBrifingAyari {
  const a = v && typeof v === "object" ? (v as Partial<Record<keyof GunlukBrifingAyari, unknown>>) : {};
  return {
    acik: typeof a.acik === "boolean" ? a.acik : yedek.acik,
    saat: typeof a.saat === "string" && SAAT_DESENI.test(a.saat) ? a.saat : yedek.saat,
  };
}

// ===================================================================
// Veri özeti
// ===================================================================

export interface BrifingGorevi {
  kod: string;
  baslik: string;
  /** Atanan çalışanın adı; atanmamışsa null */
  kim: string | null;
}

/** Son brifingteki ekipten bir kişi (değişiklikler bununla bulunur) */
export interface EkipUyesi {
  id: string;
  ad: string;
  rol: string;
  rolAdi: string;
  model: string;
}

export interface BrifingBirlesmesi {
  dal: string;
  /** Kalite kapısının durumu; kurul onay vermediyse "reddedildi" */
  durum: BirlestirmeDurumu | "reddedildi";
  testsiz: boolean;
  testYok: boolean;
  komut: string | null;
  sureMs: number | null;
  mesaj: string | null;
}

export interface BrifingVerisi {
  /** Verinin başı: son brifing; hiç brifing yoksa kesimden 7 gün önce */
  baslangic: string;
  /** Projede ilk brifing */
  ilk: boolean;
  /** Brifingin istendiği an */
  kesim: string;
  /** Bu aralıkta biten görevler */
  biten: BrifingGorevi[];
  /** Şu an çalışılan ve incelemedeki görevler; süre son durum değişikliğinden bu yana */
  suren: (BrifingGorevi & { durum: "calisiliyor" | "inceleme"; sureMs: number; ajanDurumu: AjanDurumu | null })[];
  /** Bekleyen ve planlanmış görevler; önce bloklular (bitmemiş bağımlılık), sonra atanmamışlar */
  bekleyen: (BrifingGorevi & { bekledigi: string[] })[];
  /** Kurulun kararını bekleyen onaylar */
  onaylar: { tur: OnayTuru; baslik: string }[];
  /** Bu aralıkta kalite kapısından geçen ya da kalan, reddedilen ve şu an kapıda olan birleştirmeler (yeni önce) */
  birlesmeler: BrifingBirlesmesi[];
  ekip: { katilan: EkipUyesi[]; ayrilan: EkipUyesi[]; modelDegisen: { ad: string; eski: string; yeni: string }[] };
  /** Abonelik pencereleri (okunduysa) ve ayardaki sınırın aşılması */
  pencereler: { ad: string; yuzde: number | null; sifirlanma: string | null }[];
  sinir: HesapDurumu["sinir"];
}

export interface VeriGirdisi {
  depo: Pick<Depo, "ajanlar" | "gorevler" | "onaylar">;
  projeId: string;
  /** Son brifingin anı; hiç yoksa null */
  son: string | null;
  kesim: Date;
  /** Son brifingteki ekip; hiç yoksa null */
  oncekiEkip: EkipUyesi[] | null;
  hesap: Pick<HesapDurumu, "pencereler" | "sinir"> | null;
}

export function ekipIzi(ajanlar: Ajan[]): EkipUyesi[] {
  return ajanlar.map((a) => ({ id: a.id, ad: a.ad, rol: a.rol, rolAdi: a.rolAdi, model: a.model }));
}

/** Kayıtlı ekip; yoksa ya da bozuksa null */
export function ekipOku(ham: string | null): EkipUyesi[] | null {
  if (!ham) return null;
  try {
    const v: unknown = JSON.parse(ham);
    if (!Array.isArray(v)) return null;
    return v.filter((x): x is EkipUyesi => !!x && typeof x === "object" && typeof (x as EkipUyesi).id === "string" && typeof (x as EkipUyesi).ad === "string");
  } catch {
    return null;
  }
}

/** Ekip değişikliği: son brifingteki ekiple karşılaştırılır; o kayıt yoksa aralıkta işe alınanlar */
export function ekipDegisimi(onceki: EkipUyesi[] | null, simdiki: Ajan[], baslangic: string): BrifingVerisi["ekip"] {
  if (!onceki) return { katilan: ekipIzi(simdiki.filter((a) => a.olusturma > baslangic)), ayrilan: [], modelDegisen: [] };
  const eski = new Map(onceki.map((a) => [a.id, a]));
  const yeni = new Set(simdiki.map((a) => a.id));
  return {
    katilan: ekipIzi(simdiki.filter((a) => !eski.has(a.id))),
    ayrilan: onceki.filter((a) => !yeni.has(a.id)),
    modelDegisen: simdiki.flatMap((a) => {
      const o = eski.get(a.id);
      return o && typeof o.model === "string" && o.model !== a.model ? [{ ad: a.ad, eski: o.model, yeni: a.model }] : [];
    }),
  };
}

function kaliteOku(o: Onay): BirlestirmeKalitesi | null {
  const v = o.veri as { kalite?: BirlestirmeKalitesi } | null;
  return o.tur === "birlestirme" && v && typeof v === "object" && v.kalite && typeof v.kalite === "object" ? v.kalite : null;
}

/** Son brifingden (hiç yoksa son 7 günden) bu yana olanların derli toplu verisi; yalnız depodan okunur */
export function brifingVerisi(g: VeriGirdisi): BrifingVerisi {
  const kesimMs = g.kesim.getTime();
  const kesim = g.kesim.toISOString();
  const baslangic = g.son ?? new Date(kesimMs - ILK_PENCERE_MS).toISOString();
  const araliktaMi = (z: string | null | undefined) => !!z && z > baslangic && z <= kesim;
  const ajanlar = g.depo.ajanlar(g.projeId);
  const gorevler = g.depo.gorevler(g.projeId);
  const ajanBul = (id: string | null) => (id ? ajanlar.find((a) => a.id === id) : undefined);
  const ozet = (x: Gorev): BrifingGorevi => ({ kod: x.kod, baslik: x.baslik, kim: ajanBul(x.atananId)?.ad ?? null });

  const biten = gorevler.filter((x) => x.durum === "tamam" && araliktaMi(x.guncelleme)).map(ozet);
  const suren = gorevler
    .filter((x) => x.durum === "calisiliyor" || x.durum === "inceleme")
    .map((x) => ({
      ...ozet(x),
      durum: x.durum as "calisiliyor" | "inceleme",
      sureMs: Math.max(0, kesimMs - (Date.parse(x.guncelleme) || kesimMs)),
      ajanDurumu: ajanBul(x.atananId)?.durum ?? null,
    }));
  const sira = (x: { bekledigi: string[]; kim: string | null }) => (x.bekledigi.length ? 0 : x.kim === null ? 1 : 2);
  const bekleyen = gorevler
    .filter((x) => x.durum === "bekleyen" || x.durum === "planlandi")
    .map((x) => ({
      ...ozet(x),
      bekledigi: x.bagimliliklar
        .map((b) => gorevler.find((y) => y.id === b))
        .filter((y): y is Gorev => !!y && y.durum !== "tamam")
        .map((y) => y.kod),
    }))
    .sort((a, b) => sira(a) - sira(b));

  const birlesmeler = g.depo
    .onaylar(g.projeId)
    .filter((o) => o.tur === "birlestirme")
    .flatMap((o): BrifingBirlesmesi[] => {
      const v = o.veri as { dal?: unknown } | null;
      const dal = v && typeof v.dal === "string" ? v.dal : o.baslik;
      if (o.durum === "reddedildi") return araliktaMi(o.sonuclanma) ? [{ dal, durum: "reddedildi", testsiz: false, testYok: false, komut: null, sureMs: null, mesaj: o.not }] : [];
      const k = kaliteOku(o);
      if (!k) return [];
      // Kapıda süren iş her brifingte görünür; biten iş yalnız aralıkta bittiyse
      if (BIRLESTIRME_SON_DURUMLARI.includes(k.durum) && !araliktaMi(k.bitis)) return [];
      return [{ dal, durum: k.durum, testsiz: k.testsiz, testYok: k.testYok, komut: k.komut, sureMs: k.sureMs, mesaj: k.mesaj }];
    });

  return {
    baslangic,
    ilk: g.son === null,
    kesim,
    biten,
    suren,
    bekleyen,
    onaylar: g.depo.onaylar(g.projeId, "bekliyor").map((o) => ({ tur: o.tur, baslik: o.baslik })),
    birlesmeler,
    ekip: ekipDegisimi(g.oncekiEkip, ajanlar, baslangic),
    pencereler: (g.hesap?.pencereler ?? []).filter((p) => p.yuzde !== null).map((p) => ({ ad: p.ad, yuzde: p.yuzde, sifirlanma: p.sifirlanma })),
    sinir: g.hesap?.sinir ?? null,
  };
}

// ===================================================================
// CEO'ya giden metin
// ===================================================================

const kucuk = (m: string) => m.toLocaleLowerCase(iki("tr", "en"));
const gorevDurumAdi = (d: "calisiliyor" | "inceleme") => kucuk(iki(GOREV_DURUM_ADLARI[d], AD_HARITALARI_EN.gorevDurumu[d]));
const onayTuruAdi = (t: OnayTuru) => iki(ONAY_TURU_ADLARI[t], AD_HARITALARI_EN.onayTuru[t]);

/** "45 sn", "12 dk", "3 sa 20 dk", "2 gün 4 sa" (İngilizce: 45 s, 12 min, 3 h 20 min, 2 d 4 h) */
export function sureMetni(ms: number): string {
  const dk = Math.floor(Math.max(0, ms) / 60_000);
  if (dk < 1) return iki(`${Math.max(1, Math.round(ms / 1000))} sn`, `${Math.max(1, Math.round(ms / 1000))} s`);
  if (dk < 60) return iki(`${dk} dk`, `${dk} min`);
  const sa = Math.floor(dk / 60);
  if (sa < 24) return dk % 60 ? iki(`${sa} sa ${dk % 60} dk`, `${sa} h ${dk % 60} min`) : iki(`${sa} sa`, `${sa} h`);
  const gun = Math.floor(sa / 24);
  return sa % 24 ? iki(`${gun} gün ${sa % 24} sa`, `${gun} d ${sa % 24} h`) : iki(`${gun} gün`, `${gun} d`);
}

/** 4 Eki 09:00 (İngilizce: Oct 4, 09:00) */
function an(iso: string): string {
  return new Date(iso).toLocaleString(iki("tr-TR", "en-US"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

const yuzdeMetni = (n: number) => iki(`%${Math.round(n)}`, `${Math.round(n)}%`);

function ajanNotu(d: AjanDurumu | null): string {
  if (d === "duraklatildi") return iki(" · ajan duraklatıldı", " · agent paused");
  if (d === "karar_bekliyor") return iki(" · ajan kurul kararı bekliyor", " · agent awaiting a board decision");
  if (d === "hata") return iki(" · ajan hata verdi", " · agent hit an error");
  return "";
}

function birlesmeMetni(b: BrifingBirlesmesi): string {
  const ek = b.mesaj ? ` (${kisalt(b.mesaj, 140)})` : "";
  switch (b.durum) {
    case "birlesti":
      if (b.testsiz) return iki(`${b.dal} birleşti; kurul testsiz birleştirdi`, `${b.dal} merged; the board merged it without tests`);
      if (b.testYok || !b.komut) return iki(`${b.dal} birleşti (test komutu yok)`, `${b.dal} merged (no test command)`);
      return iki(`${b.dal} birleşti · testler geçti (${b.komut}${b.sureMs ? `, ${sureMetni(b.sureMs)}` : ""})`, `${b.dal} merged · tests passed (${b.komut}${b.sureMs ? `, ${sureMetni(b.sureMs)}` : ""})`);
    case "test_basarisiz":
      return iki(`${b.dal} kalite kapısında kaldı: testler geçmedi${ek}`, `${b.dal} stopped at the quality gate: tests failed${ek}`);
    case "cakisma":
      return iki(`${b.dal} kalite kapısında kaldı: çakışma${ek}`, `${b.dal} stopped at the quality gate: merge conflict${ek}`);
    case "zaman_asimi":
      return iki(`${b.dal} kalite kapısında kaldı: süre doldu${ek}`, `${b.dal} stopped at the quality gate: timed out${ek}`);
    case "hata":
      return iki(`${b.dal} kalite kapısında kaldı: hata${ek}`, `${b.dal} stopped at the quality gate: error${ek}`);
    case "reddedildi":
      return iki(`${b.dal} birleştirmesini kurul reddetti${ek}`, `The board rejected merging ${b.dal}${ek}`);
    default:
      return iki(`${b.dal} kalite kapısında (sırada ya da testte)`, `${b.dal} is at the quality gate (queued or testing)`);
  }
}

/** Rolün geçerli dildeki adı; katalogda yoksa kayıtlı ad */
function rolAdi(u: EkipUyesi): string {
  const r = rolBul(u.rol);
  return r ? rolMetni(r, dil()).ad : u.rolAdi;
}

/** Verinin satırları (geçerli dilde) */
export function veriSatirlari(v: BrifingVerisi): string[] {
  const satirlar = [
    v.ilk
      ? iki(`[ArnOrg verisi · ilk brifing, son 7 gün: ${an(v.baslangic)} → ${an(v.kesim)}]`, `[ArnOrg data · first briefing, last 7 days: ${an(v.baslangic)} → ${an(v.kesim)}]`)
      : iki(`[ArnOrg verisi · son brifingden bu yana: ${an(v.baslangic)} → ${an(v.kesim)}]`, `[ArnOrg data · since the last briefing: ${an(v.baslangic)} → ${an(v.kesim)}]`),
  ];
  const bolum = (baslik: string, ogeler: string[]) => {
    if (!ogeler.length) {
      satirlar.push(`${baslik}: ${iki("yok", "none")}`);
      return;
    }
    satirlar.push(`${baslik} (${ogeler.length}):`, ...ogeler.slice(0, SATIR_SINIRI).map((o) => `- ${o}`));
    if (ogeler.length > SATIR_SINIRI) satirlar.push(iki(`- … ve ${ogeler.length - SATIR_SINIRI} tane daha`, `- … and ${ogeler.length - SATIR_SINIRI} more`));
  };
  const kim = (g: BrifingGorevi) => g.kim ?? iki("atanmamış", "unassigned");
  const gorev = (g: BrifingGorevi) => `${g.kod} ${kisalt(g.baslik, 90)} · ${kim(g)}`;

  bolum(iki("Biten görevler", "Tasks done"), v.biten.map(gorev));
  bolum(iki("Süren görevler", "Tasks in progress"), v.suren.map((g) => `${gorev(g)} · ${gorevDurumAdi(g.durum)}, ${sureMetni(g.sureMs)}${ajanNotu(g.ajanDurumu)}`));
  bolum(
    iki("Bekleyen ve bloklu görevler", "Waiting and blocked tasks"),
    v.bekleyen.map((g) => `${gorev(g)}${g.bekledigi.length ? ` · ${iki("bloklu", "blocked")}: ${g.bekledigi.join(", ")}` : ""}`),
  );
  bolum(iki("Kurulun kararını bekleyen onaylar", "Approvals awaiting the board"), v.onaylar.map((o) => `${onayTuruAdi(o.tur)}: ${kisalt(o.baslik, 140)}`));
  bolum(iki("Birleşen dallar ve kalite kapısı", "Merges and the quality gate"), v.birlesmeler.map(birlesmeMetni));

  const e = v.ekip;
  const ekip = [
    ...e.katilan.map((u) => iki(`${u.ad} (${rolAdi(u)}) katıldı`, `${u.ad} (${rolAdi(u)}) joined`)),
    ...e.ayrilan.map((u) => iki(`${u.ad} (${rolAdi(u)}) ayrıldı`, `${u.ad} (${rolAdi(u)}) left`)),
    ...e.modelDegisen.map((m) => `${m.ad}: model ${m.eski} → ${m.yeni}`),
  ];
  satirlar.push(`${iki("Ekip", "Team")}: ${ekip.length ? ekip.join(" · ") : iki("değişiklik yok", "no changes")}`);

  if (v.pencereler.length || v.sinir) {
    const pencereler = v.pencereler.map((p) => `${p.ad} ${yuzdeMetni(p.yuzde ?? 0)}${p.sifirlanma ? iki(` (sıfırlanma ${an(p.sifirlanma)})`, ` (resets ${an(p.sifirlanma)})`) : ""}`);
    if (v.sinir) pencereler.push(iki(`kurulun sınırı aşıldı (${v.sinir.pencere} ${yuzdeMetni(v.sinir.yuzde)}); ajanlar duruyor`, `the board's limit is reached (${v.sinir.pencere} ${yuzdeMetni(v.sinir.yuzde)}); agents are paused`));
    satirlar.push(`${iki("Abonelik", "Subscription")}: ${pencereler.join(" · ")}`);
  }
  return satirlar;
}

/** CEO'ya giden metin: istek, biçim ve veri. Günlük kaynakta "günlük brifing" denir */
export function brifingMetni(kaynak: BrifingKaynagi, v: BrifingVerisi): string {
  const [yapilan, suan, siradaki, karar] = BRIFING_BOLUMLERI[dil()];
  const istek = kaynak === "gunluk" ? iki("Kurul günlük brifing istiyor.", "The board is asking for the daily briefing.") : iki("Kurul brifing istiyor.", "The board is asking for a briefing.");
  const bicim = iki(
    `${istek} Aşağıdaki veriye ve kendi bildiklerine dayanarak kısa bir brifing yaz ve #yonetim kanalına mesaj_gonder ile gönder. Biçim: **${yapilan}** / **${suan}** / **${siradaki}** / **${karar}** (her biri en çok 3–4 madde; görev kodlarını yaz; uydurma).`,
    `${istek} Using the data below and what you know yourself, write a short briefing and send it to #ceo with mesaj_gonder. Format: **${yapilan}** / **${suan}** / **${siradaki}** / **${karar}** (at most 3–4 bullets each; include task codes; don't make anything up).`,
  );
  return [bicim, "", ...veriSatirlari(v)].join("\n");
}

/** Karşılaştırma için: Türkçe küçük harf, boşluklar tek */
const sade = (m: string) => m.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
const BOLUM_ADLARI = Object.values(BRIFING_BOLUMLERI).map((adlar) => adlar.map(sade));

/** Satır bir bölüm başlığıysa bölümün sırası (0–3): "**Şu an**", "## Şu an", "1. Şu an:", "Kararınızı bekleyenler: yok" */
function bolumSirasi(satir: string): number | null {
  const govde = satir.trim().replace(/^#{1,6}\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/^(\*\*|__)/, "");
  const son = govde.search(/\*\*|__|:/);
  const aday = sade(son >= 0 ? govde.slice(0, son) : govde);
  for (const adlar of BOLUM_ADLARI) {
    const i = adlar.findIndex((b) => aday === b || (aday.startsWith(b) && aday.length - b.length <= 4));
    if (i >= 0) return i;
  }
  return null;
}

/** Mesaj brifing mi: dört bölümden en az üçü başlık satırı olarak var (Stüdyo'daki brifing görünümüyle aynı ölçüt) */
export function brifingGibiMi(metin: string): boolean {
  const bolumler = new Set<number>();
  for (const satir of metin.split("\n")) {
    const i = bolumSirasi(satir);
    if (i !== null) bolumler.add(i);
  }
  return bolumler.size >= 3;
}

// ===================================================================
// Günlük brifing kararı
// ===================================================================

/** Son brifingden (hiç yoksa proje açılışından) bu yana görev, onay ya da mesaj hareketi; ArnOrg duyuruları ve son brifingin yanıtı sayılmaz */
export function hareketVar(depo: Pick<Depo, "gorevler" | "onaylar" | "mesajAra">, projeId: string, esik: string, yanitId: string | null): boolean {
  if (depo.gorevler(projeId).some((g) => g.olusturma > esik || g.guncelleme > esik)) return true;
  if (depo.onaylar(projeId).some((o) => o.olusturma > esik || (o.sonuclanma ?? "") > esik || (kaliteOku(o)?.bitis ?? "") > esik)) return true;
  return depo.mesajAra(projeId, "", 200).some((m) => m.zaman > esik && m.gonderenId !== ARNORG_GONDEREN && m.id !== yanitId);
}

export interface GunlukGirdi {
  ayar: GunlukBrifingAyari;
  simdi: Date;
  /** Bu projede otomatik brifingin en son verildiği ya da atlandığı gün */
  verilenGun: string | null;
  /** Projenin açıldığı an (ISO) */
  olusturma: string;
  /** Projede CEO var ve hazırlık görüşmesi bitti (ya da atlandı) */
  hazir: boolean;
  /** Son brifingden bu yana hareket; gerekirse (karar ona kalırsa) hesaplanır */
  hareketVar: boolean | (() => boolean);
}

/**
 * bekle: henüz değil (kapalı, saat gelmedi ya da bugün verildi) · ver: brifing iste · atla: bugün verme. Saatten sonra
 * açılan, CEO'su ya da hazırlığı olmayan ve son brifingden bu yana hareketi olmayan proje bugünü atlar.
 */
export function gunlukKarar(g: GunlukGirdi): "bekle" | "ver" | "atla" {
  if (!g.ayar.acik || g.verilenGun === bugun(g.simdi)) return "bekle";
  const [sa, dk] = g.ayar.saat.split(":").map(Number);
  const vakit = new Date(g.simdi.getFullYear(), g.simdi.getMonth(), g.simdi.getDate(), sa ?? 9, dk ?? 0);
  if (g.simdi.getTime() < vakit.getTime()) return "bekle";
  if (!g.hazir || (Date.parse(g.olusturma) || 0) > vakit.getTime()) return "atla";
  return (typeof g.hareketVar === "function" ? g.hareketVar() : g.hareketVar) ? "ver" : "atla";
}

// ===================================================================
// Brifing yöneticisi
// ===================================================================

export interface BrifingBaglami {
  depo: Pick<Depo, "deger" | "degerYaz" | "proje" | "projeler" | "ajanlar" | "gorevler" | "onaylar" | "mesajAra">;
  olaylar: { dinle(f: (o: SunucuOlayi) => void): () => void };
  /** Ayardaki günlük brifing */
  gunluk(): GunlukBrifingAyari;
  /** Abonelik pencereleri ve ayardaki sınır */
  hesap(): Pick<HesapDurumu, "pencereler" | "sinir">;
  /** CEO'yu kurul kaynağıyla uyandırır ve #yonetim'de "yazıyor" gösterir; uyandırılamazsa fırlatır */
  uyandir(ceo: Ajan, metin: string): Promise<void>;
  /** Günlük brifing yalnız klasörü erişilebilir projelerde (verilmezse hepsi) */
  erisilebilir?(p: Proje): boolean;
  /** Günlük brifing istenemedi (CEO uyandırılamadı) */
  hata?(p: Proje, h: Error): void;
  /** Şimdiki an (testlerde verilir) */
  saat?(): Date;
}

/** Hazırlanan brifing */
interface BekleyenBrifing {
  ceoId: string;
  /** İstek anı */
  zaman: number;
  /** CEO istek anında başka bir tur işlemiyordu: uyandırılan tur brifingin turudur, bitince istek de kapanır */
  turSonuylaBiter: boolean;
  /** İstekten sonra CEO'nun çalıştığı görüldü */
  calisti: boolean;
  /** CEO'nun istekten sonra #yonetim'e yazdığı, brifing biçiminde olmayan son mesaj */
  yanitId: string | null;
}

export class Brifing {
  /** Proje → hazırlanan brifing */
  private readonly bekleyenler = new Map<string, BekleyenBrifing>();
  private zamanlayici: NodeJS.Timeout | null = null;
  private birak: (() => void) | null;
  private denetleniyor = false;

  constructor(private readonly b: BrifingBaglami) {
    // CEO brifingi #yonetim'e yazınca ya da brifing için uyandırıldığı tur bitince istek kapanır
    this.birak = b.olaylar.dinle((o) => this.olay(o));
  }

  private simdi(): Date {
    return this.b.saat?.() ?? new Date();
  }

  private olay(o: SunucuOlayi): void {
    if (o.tur === "mesaj.yeni") {
      const m = o.mesaj;
      const bekleyen = this.bekleyenler.get(m.projeId);
      if (!bekleyen || m.kanal !== "yonetim" || m.gonderenId !== bekleyen.ceoId) return;
      // Brifing biçimindeki mesaj isteği kapatır. Başka bir mesaj (ör. sürmekte olan işten bir soru) kapatmaz; tur
      // sonunda kapanırsa yanıt o sayılır
      if (brifingGibiMi(m.metin)) this.kapat(m.projeId, m.id);
      else bekleyen.yanitId = m.id;
    } else if (o.tur === "ajan.guncellendi") {
      const a = o.ajan;
      const bekleyen = this.bekleyenler.get(a.projeId);
      if (!bekleyen || a.id !== bekleyen.ceoId) return;
      if (a.durum === "calisiyor" || a.durum === "karar_bekliyor") bekleyen.calisti = true;
      // CEO boştayken uyandırıldıysa bu tur brifingin turudur: biçime uymasa da tur bitince istek kapanır
      else if (bekleyen.calisti && bekleyen.turSonuylaBiter) this.kapat(a.projeId, bekleyen.yanitId);
    }
  }

  /** İstek kapanır; yanıtın kimliği günlük brifingin hareket denetiminde sayılmamak üzere saklanır */
  private kapat(projeId: string, yanitId: string | null): void {
    this.bekleyenler.delete(projeId);
    if (!yanitId) return;
    try {
      this.b.depo.degerYaz(BRIFING_YANIT + projeId, yanitId);
    } catch {
      // Depo kapanmışsa (kapanış sırası) kayıt yazılmaz
    }
  }

  /** Projede brifing hazırlanıyor mu: CEO uyandırıldı, brifingi henüz #yonetim'e yazmadı, turu bitmedi ve süre dolmadı */
  hazirlaniyor(projeId: string): boolean {
    const b = this.bekleyenler.get(projeId);
    if (!b) return false;
    if (this.simdi().getTime() - b.zaman < HAZIRLANIYOR_MS) return true;
    this.bekleyenler.delete(projeId);
    return false;
  }

  /** CEO'dan brifing ister. CEO yoksa 409; aynı projede brifing hazırlanıyorsa yeni uyandırma açılmaz */
  async iste(projeId: string, kaynak: BrifingKaynagi): Promise<BrifingYaniti> {
    if (!this.b.depo.proje(projeId)) throw bulunamadi("Proje", "Project");
    const ajanlar = this.b.depo.ajanlar(projeId);
    const ceo = ajanlar.find((a) => a.rol === "ceo");
    if (!ceo) throw new ArnorgHatasi(iki("Bu projede CEO yok; brifing için önce bir CEO işe alın.", "This project has no CEO; hire a CEO before asking for a briefing."), 409);
    if (this.hazirlaniyor(projeId)) return { durum: "hazirlaniyor" };
    const kesim = this.simdi();
    const veri = brifingVerisi({
      depo: this.b.depo,
      projeId,
      son: this.b.depo.deger(BRIFING_SON + projeId),
      kesim,
      oncekiEkip: ekipOku(this.b.depo.deger(BRIFING_EKIP + projeId)),
      hesap: this.b.hesap(),
    });
    // Uyandırma sürerken gelen ikinci istek de "hazırlanıyor" alır
    const mesgul = ceo.durum === "calisiyor" || ceo.durum === "karar_bekliyor";
    this.bekleyenler.set(projeId, { ceoId: ceo.id, zaman: kesim.getTime(), turSonuylaBiter: !mesgul, calisti: false, yanitId: null });
    try {
      await this.b.uyandir(ceo, brifingMetni(kaynak, veri));
    } catch (h) {
      this.bekleyenler.delete(projeId);
      throw h;
    }
    // Veri aralığı ancak CEO uyandırılınca ilerler: uyandırılamadıysa sonraki brifing aynı yerden başlar
    this.b.depo.degerYaz(BRIFING_SON + projeId, veri.kesim);
    this.b.depo.degerYaz(BRIFING_EKIP + projeId, JSON.stringify(ekipIzi(ajanlar)));
    return { durum: "istendi" };
  }

  /** Günlük brifing yoklaması dakikada bir (unref'li) */
  baslat(aralikMs = 60_000): void {
    if (this.zamanlayici) return;
    this.zamanlayici = setInterval(() => void this.gunlukDenetle().catch(() => undefined), aralikMs);
    this.zamanlayici.unref();
  }

  /** Saat geçtiyse ve bugün verilmediyse uygun her projede günlük brifing ister; istenen ve bugün atlanan projeler döner */
  async gunlukDenetle(): Promise<{ istenen: string[]; atlanan: string[] }> {
    const sonuc = { istenen: [] as string[], atlanan: [] as string[] };
    const ayar = gunlukBrifingAyari(this.b.gunluk());
    // Abonelik sınırındayken beklenir: pencere açılınca aynı gün içinde verilir
    if (!ayar.acik || this.denetleniyor || this.b.hesap().sinir) return sonuc;
    this.denetleniyor = true;
    try {
      const simdi = this.simdi();
      for (const p of this.b.depo.projeler()) {
        if (this.b.erisilebilir && !this.b.erisilebilir(p)) continue;
        const ceoVar = this.b.depo.ajanlar(p.id).some((a) => a.rol === "ceo");
        const karar = gunlukKarar({
          ayar,
          simdi,
          verilenGun: this.b.depo.deger(BRIFING_GUNLUK + p.id),
          olusturma: p.olusturma,
          hazir: ceoVar && (p.hazirlik === "tamam" || p.hazirlik === "atlandi"),
          hareketVar: () => hareketVar(this.b.depo, p.id, this.b.depo.deger(BRIFING_SON + p.id) ?? p.olusturma, this.b.depo.deger(BRIFING_YANIT + p.id)),
        });
        if (karar === "bekle") continue;
        // Gün, denemeden önce işaretlenir: uyandırma başarısız olsa da her dakika yeniden denenmez
        this.b.depo.degerYaz(BRIFING_GUNLUK + p.id, bugun(simdi));
        if (karar === "atla") {
          sonuc.atlanan.push(p.id);
          continue;
        }
        try {
          await this.iste(p.id, "gunluk");
          sonuc.istenen.push(p.id);
        } catch (h) {
          this.b.hata?.(p, h as Error);
        }
      }
    } finally {
      this.denetleniyor = false;
    }
    return sonuc;
  }

  durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
    this.birak?.();
    this.birak = null;
  }
}
