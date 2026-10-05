// Tanıtım alanı: projenin kök README.md'si kurulun Stüdyo'nun Tanıtım alanında okuduğu vitrin sayfasıdır. Tanıtım
// uzmanı (rol tanitim) README.md'yi ortak projede yazar (0.0.8); çalışma dalına commit'lenmiş hâli yayındadır, çalışma
// kopyasında ondan farklı (henüz kaydedilmemiş) hâli taslak olarak görünür. Bu modül yayındaki ve taslak README'yi, son
// commit künyesini, uzmanı ve kurulun güncelleme isteğini derler; isteği uzmana, uzman yoksa işe alması için CEO'ya
// iletir; README değişince ve README'li bir görev kaydedilince tanitim.degisti yayınlar. CEO talimatına giren satır da
// buradadır (talimat.ts).
// Yalnız alanın kökündeki README.md okunur: yol istekten gelmez, alanın dışını gösteren sembolik bağlantı okunmaz.
// Uçlar: tanitim-uclari.ts, sözleşme: docs/API.md "Tanıtım".
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

/** Çalışma dalına commit'lenmiş README.md; dal ya da dosya yoksa null */
async function kayitliReadme(kok: string, dal: string): Promise<string | null> {
  try {
    const ham = Buffer.from(await gitIslemleri.git(kok, ["show", `refs/heads/${dal}:${TANITIM_DOSYASI}`]), "utf8");
    return readmeMetni(ham, ham.length);
  } catch {
    return null;
  }
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
      "README.md'yi projenin bugünkü hâline göre gözden geçir: son teslimleri, kaydedilen işleri, görevleri ve git geçmişini oku; yalnız gerçekte var olanı yaz, eskiyen yeri düzelt. Bitince isi_kaydet ile kısa bir özetle kaydet ya da görevini 'inceleme'ye al; ArnOrg commit'ler.",
    ].join("\n"),
    [
      "The board wants the README.md in the Showcase area updated.",
      ...(not ? [`The board's note: ${not}`] : []),
      "Review README.md against the project as it is today: read the latest deliveries, saved work, tasks and git history; write only what really exists and fix whatever has gone stale. When done, save it with isi_kaydet and a short summary or move your task to 'inceleme'; ArnOrg commits it.",
    ].join("\n"),
  );
}

/** Uzman yokken kurulun #yonetim'e (CEO'ya) yazdığı mesaj */
export function ceoyaIstekMetni(not: string): string {
  return iki(
    `Tanıtım alanında projenin README.md'sini görmek istiyorum. Ekipte tanıtım uzmanı yok: ise_al_teklif ile bir Tanıtım uzmanı (rol: tanitim) işe almayı öner; işe alınınca README.md'yi yazıp kaydetmesi için ona bir görev ver.${not ? `\n\nNotum: ${not}` : ""}`,
    `I want to see the project's README.md in the Showcase area. There is no product marketer on the team: propose hiring a Product marketer (role: tanitim) with ise_al_teklif; once hired, give them a task to write and save README.md.${not ? `\n\nMy note: ${not}` : ""}`,
  );
}

/**
 * CEO talimatının ekip bölümüne giren satır: ekipte tanıtım uzmanı yoksa ilk işe alımlarla birlikte bir tane alması,
 * varsa her teslimden ve önemli bir iş kaydedildikten sonra ona README.md'yi güncelletmesi. CEO dışındaki rollerde boş.
 */
export function tanitimTalimati(ajan: Pick<Ajan, "rol">, ekip: Pick<Ajan, "ad" | "rol">[], dil: Dil): string[] {
  if (ajan.rol !== "ceo") return [];
  const uzman = ekip.find((a) => a.rol === "tanitim");
  if (dil === "en") {
    return [
      uzman
        ? `- ${uzman.ad} (Product marketer) owns the root README.md the board reads in the Showcase area. After every delivery and after important work is saved, tell them with mesaj_gonder to update README.md.`
        : "- There is no Product marketer on the team. The board reads the project in the Showcase area of the Studio from the root README.md: together with the first hires, propose a Product marketer (role: tanitim) with ise_al_teklif; once hired, ask them to write README.md.",
    ];
  }
  return [
    uzman
      ? `- ${uzman.ad} (Tanıtım uzmanı) kurulun Tanıtım alanında okuduğu kök README.md'nin sahibidir. Her teslimden ve önemli bir iş kaydedildikten sonra ona mesaj_gonder ile README.md'yi güncellemesini söyle.`
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
  /** README.md'yi şu an düzenleyen (kiralayan) çalışan; taslak ona yazılır, yoksa tanıtım uzmanına */
  readmeKiracisi?(projeId: string): { ajanId: string; ajanAd: string } | null;
}

export class Tanitim {
  /** Proje → bekleyen tanitim.degisti yayını */
  private readonly bekleyenler = new Map<string, NodeJS.Timeout>();
  private birak: (() => void) | null;

  constructor(private readonly b: TanitimBaglami) {
    this.birak = b.olaylar.dinle((o) => this.olay(o));
  }

  /** README'yi etkileyen olaylar: ortak projede kök README.md değişti ya da README'li bir görev kaydedildi */
  private olay(o: SunucuOlayi): void {
    if (o.tur === "dosya.degisti") {
      if (!readmeYoluMu(o.yol) || o.alan !== "ana") return;
      this.yayinla(o.projeId);
    } else if (o.tur === "gorev.kaydedildi" && o.kayit.dosyalar.some(readmeYoluMu)) {
      this.yayinla(o.projeId);
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
    const uzman = uzmanlar[0] ?? null;
    // Yayındaki hâl çalışma dalına commit'lenmiş olandır; çalışma kopyasındaki farklı hâl kaydedilmemiş taslaktır
    const yayinda = await kayitliReadme(p.yol, p.varsayilanDal);
    const calisma = await readmeOku(p.yol);
    const son = await sonCommit(p.yol, p.varsayilanDal);
    let taslak: TanitimDurumu["taslak"] = null;
    if (calisma && calisma.icerik !== yayinda) {
      const yazan = this.b.readmeKiracisi?.(projeId) ?? (uzman ? { ajanId: uzman.id, ajanAd: uzman.ad } : null);
      if (yazan) taslak = { ...yazan, icerik: calisma.icerik, zaman: calisma.zaman };
    }
    const ana = taslak ? (yayinda !== null ? { icerik: yayinda } : null) : calisma ? { icerik: calisma.icerik } : yayinda !== null ? { icerik: yayinda } : null;
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
