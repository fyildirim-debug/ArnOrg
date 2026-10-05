// Tanıtım alanı: projenin kök README.md'si kurulun Stüdyo'nun Tanıtım alanında okuduğu vitrin sayfasıdır. Tanıtım
// uzmanı (rol tanitim) README.md'yi kendi çalışma alanında yazar ve birleştirme ister; birleşene dek o hâli taslak
// olarak görünür. Bu modül yayındaki ve taslak README'yi, son commit künyesini, uzmanı ve kurulun güncelleme isteğini
// derler; isteği uzmana, uzman yoksa işe alması için CEO'ya iletir; README değişince ve iş birleşince tanitim.degisti
// yayınlar. CEO talimatına giren satır da buradadır (talimat.ts).
// Yalnız alanın kökündeki README.md okunur: yol istekten gelmez, alanın dışını gösteren sembolik bağlantı okunmaz.
// Uçlar: tanitim-uclari.ts, sözleşme: docs/API.md "Tanıtım".
import fs from "node:fs";
import fsp, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { TANITIM_DOSYASI, type Ajan, type Dil, type Proje, type SunucuOlayi, type TanitimDurumu, type TanitimGuncellemeYaniti } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import * as gitIslemleri from "./git.js";
import { ArnorgHatasi, bulunamadi, simdi } from "./yardimci.js";

/** Okunan en büyük README (bayt); büyüğünün başı gösterilir */
export const TANITIM_SINIRI = 512 * 1024;
/** Kurulun güncelleme notunun en çok uzunluğu */
export const TANITIM_NOT_SINIRI = 2000;
/** Kurulun son güncelleme isteğinin anı (anahtar-değer kaydı, proje başına) */
export const TANITIM_ISTEK = "tanitim-istek:";
/** Aynı projenin art arda gelen değişiklikleri bu süre içinde tek olayla yayınlanır */
const YAYIN_GECIKMESI_MS = 300;

// ===================================================================
// README okuma
// ===================================================================

/** alt yolu ust yolunun içinde mi (kendisi değil) */
function icinde(ust: string, alt: string): boolean {
  const fark = path.relative(ust, alt);
  return fark !== "" && !fark.startsWith("..") && !path.isAbsolute(fark);
}

/**
 * README metni: BOM atılır, satır sonları LF olur (Windows'ta git core.autocrlf ile dosyayı CRLF çıkarır, git show ise
 * nesneyi LF verir; taslak karşılaştırması ikisini eşit görmeli). Sınırı aşan metnin ilk 512 KB'ı yarım kalan son satırı
 * atılarak, kısa bir notla verilir.
 */
export function readmeMetni(bas: Buffer, toplam: number): string {
  let metin = bas.subarray(0, TANITIM_SINIRI).toString("utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (toplam <= TANITIM_SINIRI) return metin;
  const son = metin.lastIndexOf("\n");
  if (son > 0) metin = metin.slice(0, son);
  return `${metin}\n\n${iki("*README.md 512 KB'tan büyük; ilk 512 KB gösteriliyor.*", "*README.md is larger than 512 KB; only the first 512 KB is shown.*")}\n`;
}

/** Alanın kökündeki README.md ve son değişme anı; yoksa, dosya değilse ya da bağlantı alanın dışını gösteriyorsa null */
export async function readmeOku(kok: string): Promise<{ icerik: string; zaman: string } | null> {
  let gercek: string;
  try {
    gercek = await fsp.realpath(path.join(kok, TANITIM_DOSYASI));
    if (!icinde(await fsp.realpath(kok), gercek)) return null;
  } catch {
    return null;
  }
  let dosya: FileHandle | null = null;
  try {
    dosya = await fsp.open(gercek, "r");
    const s = await dosya.stat();
    if (!s.isFile()) return null;
    const tampon = Buffer.alloc(Math.min(s.size, TANITIM_SINIRI));
    const { bytesRead } = await dosya.read(tampon, 0, tampon.length, 0);
    return { icerik: readmeMetni(tampon.subarray(0, bytesRead), s.size), zaman: s.mtime.toISOString() };
  } catch {
    return null;
  } finally {
    await dosya?.close().catch(() => undefined);
  }
}

/** Çalışma dalında README.md'ye dokunan son commit; repo, dal ya da böyle bir commit yoksa null */
export async function sonCommit(kok: string, dal: string): Promise<TanitimDurumu["son"]> {
  try {
    const cikti = await gitIslemleri.git(kok, ["log", "-1", "--format=%H%x1f%an%x1f%aI%x1f%s", `refs/heads/${dal}`, "--", TANITIM_DOSYASI]);
    const [commit, yazar = "", zaman, mesaj = ""] = cikti.trim().split("\x1f");
    if (!commit || !zaman) return null;
    return { commit, yazar, zaman: new Date(zaman).toISOString(), mesaj };
  } catch {
    return null;
  }
}

/** Alanın çalışma dalıyla ortak atasındaki README.md: orada yoksa null, ortak ata bulunamazsa undefined */
async function atadakiReadme(alan: string, dal: string): Promise<string | null | undefined> {
  let ata: string;
  try {
    ata = (await gitIslemleri.git(alan, ["merge-base", `refs/heads/${dal}`, "HEAD"])).trim();
  } catch {
    return undefined;
  }
  if (!ata) return undefined;
  try {
    const ham = Buffer.from(await gitIslemleri.git(alan, ["show", `${ata}:${TANITIM_DOSYASI}`]), "utf8");
    return readmeMetni(ham, ham.length);
  } catch {
    return null;
  }
}

/**
 * Uzmanın alanındaki README.md taslak mı: ana repodakinden farklı ve uzman ona dokunmuş. Alandaki hâl ortak atadaki
 * hâliyle aynıysa fark ana reponun ilerlemesindendir (alan geride kalmış), taslak sayılmaz.
 */
async function taslakBul(p: Proje, a: Ajan, ana: string | null): Promise<TanitimDurumu["taslak"]> {
  const alan = a.calismaAlani;
  if (!alan || !fs.existsSync(alan) || gitIslemleri.ayniYol(alan, p.yol)) return null;
  const oku = await readmeOku(alan);
  if (!oku || oku.icerik === ana) return null;
  if ((await atadakiReadme(alan, p.varsayilanDal)) === oku.icerik) return null;
  return { ajanId: a.id, ajanAd: a.ad, icerik: oku.icerik, zaman: oku.zaman };
}

/** Kurulun birleştirmesi kalite kapısını geçip ana dala girdi mi (onayın veri.kalite alanı) */
function birlestiMi(veri: unknown): boolean {
  const k = (veri as { kalite?: { durum?: unknown } } | null)?.kalite;
  return !!k && typeof k === "object" && k.durum === "birlesti";
}

/** Değişen yol kök README.md mi (Windows ve macOS'ta büyük/küçük harf duyarsız dosya sistemi) */
function readmeYoluMu(yol: string): boolean {
  return yol.replace(/\\/g, "/").toLowerCase() === TANITIM_DOSYASI.toLowerCase();
}

// ===================================================================
// Metinler
// ===================================================================

/** Kurulun isteği: uzmana giden mesaj */
export function uzmanaIstekMetni(not: string): string {
  return iki(
    [
      "Kurul Tanıtım alanındaki README.md'nin güncellenmesini istiyor.",
      ...(not ? [`Kurulun notu: ${not}`] : []),
      "README.md'yi projenin bugünkü hâline göre gözden geçir: son teslimleri, birleşen işleri, görevleri ve git geçmişini oku; yalnız gerçekte var olanı yaz, eskiyen yeri düzelt. Bitince commit'le ve birlestirme_iste ile kısa bir özetle birleştirme iste.",
    ].join("\n"),
    [
      "The board wants the README.md in the Showcase area updated.",
      ...(not ? [`The board's note: ${not}`] : []),
      "Review README.md against the project as it is today: read the latest deliveries, merged work, tasks and git history; write only what really exists and fix whatever has gone stale. When done, commit and ask for the merge with birlestirme_iste and a short summary.",
    ].join("\n"),
  );
}

/** Uzman yokken kurulun #yonetim'e (CEO'ya) yazdığı mesaj */
export function ceoyaIstekMetni(not: string): string {
  return iki(
    `Tanıtım alanında projenin README.md'sini görmek istiyorum. Ekipte tanıtım uzmanı yok: ise_al_teklif ile bir Tanıtım uzmanı (rol: tanitim) işe almayı öner; işe alınınca README.md'yi yazmasını ve birleştirme istemesini sağla.${not ? `\n\nNotum: ${not}` : ""}`,
    `I want to see the project's README.md in the Showcase area. There is no product marketer on the team: propose hiring a Product marketer (role: tanitim) with ise_al_teklif; once hired, have them write README.md and ask for the merge.${not ? `\n\nMy note: ${not}` : ""}`,
  );
}

/**
 * CEO talimatının ekip bölümüne giren satır: ekipte tanıtım uzmanı yoksa ilk işe alımlarla birlikte bir tane alması,
 * varsa her teslimden ve birleşen işten sonra ona README.md'yi güncelletmesi. CEO dışındaki rollerde boş.
 */
export function tanitimTalimati(ajan: Pick<Ajan, "rol">, ekip: Pick<Ajan, "ad" | "rol">[], dil: Dil): string[] {
  if (ajan.rol !== "ceo") return [];
  const uzman = ekip.find((a) => a.rol === "tanitim");
  if (dil === "en") {
    return [
      uzman
        ? `- ${uzman.ad} (Product marketer) owns the root README.md the board reads in the Showcase area. After every delivery and every merged piece of work, tell them with mesaj_gonder to update README.md.`
        : "- There is no Product marketer on the team. The board reads the project in the Showcase area of the Studio from the root README.md: together with the first hires, propose a Product marketer (role: tanitim) with ise_al_teklif; once hired, ask them to write README.md.",
    ];
  }
  return [
    uzman
      ? `- ${uzman.ad} (Tanıtım uzmanı) kurulun Tanıtım alanında okuduğu kök README.md'nin sahibidir. Her teslimden ve birleşen her işten sonra ona mesaj_gonder ile README.md'yi güncellemesini söyle.`
      : "- Ekipte Tanıtım uzmanı yok. Kurul projeyi Stüdyo'nun Tanıtım alanında kök README.md'den okur: ilk işe alımlarla birlikte ise_al_teklif ile bir Tanıtım uzmanı (rol: tanitim) öner; işe alınınca README.md'yi yazmasını iste.",
  ];
}

// ===================================================================
// Hizmet
// ===================================================================

export interface TanitimBaglami {
  depo: Pick<Depo, "proje" | "ajan" | "ajanlar" | "deger" | "degerYaz">;
  olaylar: { yayinla(o: SunucuOlayi): void; dinle(f: (o: SunucuOlayi) => void): () => void };
  /** Uzmanı kurul kaynağıyla uyandırır (eşzamanlı tavandan ve abonelik sınırından muaf); uyandırılamazsa fırlatır */
  uzmanaYaz(uzman: Ajan, metin: string): Promise<void>;
  /** Kurulun #yonetim'e yazdığı mesaj: CEO'ya gider ve onu uyandırır */
  ceoyaYaz(projeId: string, metin: string): Promise<void>;
  /** Olayların toplanma süresi (testlerde kısa verilir) */
  gecikmeMs?: number;
}

export class Tanitim {
  /** Proje → bekleyen tanitim.degisti yayını */
  private readonly bekleyenler = new Map<string, NodeJS.Timeout>();
  private birak: (() => void) | null;

  constructor(private readonly b: TanitimBaglami) {
    this.birak = b.olaylar.dinle((o) => this.olay(o));
  }

  /** README'yi etkileyen olaylar: ana repoda ya da bir tanıtım uzmanının alanında kök README.md değişti, iş birleşti */
  private olay(o: SunucuOlayi): void {
    if (o.tur === "dosya.degisti") {
      if (!readmeYoluMu(o.yol)) return;
      if (o.alan !== "ana" && this.b.depo.ajan(o.alan)?.rol !== "tanitim") return;
      this.yayinla(o.projeId);
    } else if (o.tur === "onay.sonuc" && o.onay.tur === "birlestirme" && birlestiMi(o.onay.veri)) {
      this.yayinla(o.onay.projeId);
    }
  }

  /** Art arda gelen değişiklikler tek olayla gider: ilk değişiklikten kısa süre sonra */
  private yayinla(projeId: string): void {
    if (this.bekleyenler.has(projeId)) return;
    const z = setTimeout(() => {
      this.bekleyenler.delete(projeId);
      this.b.olaylar.yayinla({ tur: "tanitim.degisti", projeId });
    }, this.b.gecikmeMs ?? YAYIN_GECIKMESI_MS);
    z.unref();
    this.bekleyenler.set(projeId, z);
  }

  /** GET /api/projeler/:pid/tanitim */
  async durum(projeId: string): Promise<TanitimDurumu> {
    const p = this.b.depo.proje(projeId);
    if (!p) throw bulunamadi("Proje", "Project");
    const uzmanlar = this.b.depo.ajanlar(projeId).filter((a) => a.rol === "tanitim");
    const ana = await readmeOku(p.yol);
    const son = await sonCommit(p.yol, p.varsayilanDal);
    let taslak: TanitimDurumu["taslak"] = null;
    for (const a of uzmanlar) {
      taslak = await taslakBul(p, a, ana?.icerik ?? null);
      if (taslak) break;
    }
    const uzman = uzmanlar[0] ?? null;
    return {
      dosya: TANITIM_DOSYASI,
      var: ana !== null,
      icerik: ana?.icerik ?? null,
      son,
      taslak,
      uzman: uzman ? { id: uzman.id, ad: uzman.ad, durum: uzman.durum } : null,
      guncellemeIstendi: this.b.depo.deger(TANITIM_ISTEK + projeId),
    };
  }

  /**
   * Kurul README.md'nin güncellenmesini istiyor: tanıtım uzmanı varsa o uyanır; yoksa istek #yonetim'e yazılır ve CEO
   * bir uzman işe alıp README.md'yi yazdırır. CEO da yoksa 409.
   */
  async guncelle(projeId: string, not?: string): Promise<TanitimGuncellemeYaniti> {
    if (!this.b.depo.proje(projeId)) throw bulunamadi("Proje", "Project");
    const temizNot = (not ?? "").trim().slice(0, TANITIM_NOT_SINIRI);
    const ajanlar = this.b.depo.ajanlar(projeId);
    const uzman = ajanlar.find((a) => a.rol === "tanitim");
    let yanit: TanitimGuncellemeYaniti;
    if (uzman) {
      await this.b.uzmanaYaz(uzman, uzmanaIstekMetni(temizNot));
      yanit = { kime: "uzman", ajanId: uzman.id, ajanAd: uzman.ad };
    } else {
      const ceo = ajanlar.find((a) => a.rol === "ceo");
      if (!ceo) throw new ArnorgHatasi(iki("Bu projede CEO yok; tanıtım uzmanını işe alması için önce bir CEO işe alın.", "This project has no CEO; hire a CEO first so they can hire a product marketer."), 409);
      await this.b.ceoyaYaz(projeId, ceoyaIstekMetni(temizNot));
      yanit = { kime: "ceo", ajanId: ceo.id, ajanAd: ceo.ad };
    }
    this.b.depo.degerYaz(TANITIM_ISTEK + projeId, simdi());
    this.yayinla(projeId);
    return yanit;
  }

  durdur(): void {
    for (const z of this.bekleyenler.values()) clearTimeout(z);
    this.bekleyenler.clear();
    this.birak?.();
    this.birak = null;
  }
}
