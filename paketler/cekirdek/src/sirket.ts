// Şirket orkestratörü: projeler, ekip, ajan oturumları, denetim kapısı, onaylar, görev akışı ve kanallar
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { CanUseTool, HookJSONOutput, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import {
  GOREV_DURUMLARI,
  GOREV_GECISLERI,
  HAFIZA_TURU_ADLARI,
  KURUL,
  type Ajan,
  type AjanBaslatIstegi,
  type AjanDurumu,
  type AjanGuncelleIstegi,
  type AjanIseAlIstegi,
  type AkisOgesi,
  type CalismaAlani,
  type Gorev,
  type GorevDurumu,
  type GorevGuncelleIstegi,
  type AjanSorusu,
  type GorevOlusturIstegi,
  type HafizaKaydi,
  type HafizaYazIstegi,
  type HesapDurumu,
  type IzinModu,
  type Karar,
  type MaliyetOzeti,
  type Mesaj,
  type MesajOnceligi,
  type Onay,
  type OnayTuru,
  type PolitikaKurali,
  type Proje,
  type ProjeOlusturIstegi,
  type ProjeOzeti,
} from "@arnorg/ortak";
import { AjanOturumu, type MesajKaynagi, type Toplam } from "./ajan-oturumu.js";
import { HesapIzleyici } from "./hesap.js";
import { ProjeHafizasi } from "./hafiza.js";
import { Hatirlatici, oncekiYanit, uzmanBul, uzmanlariSirala } from "./hatirlatici.js";

/** Toplantıda bir katılımcının görüşü */
export interface ToplantiGorusu {
  ajanId: string;
  ad: string;
  rolAdi: string;
  /** ArnOrg seçtiyse neden */
  neden: string | null;
  gorus: string | null;
  durum: "yanitlandi" | "zaman_asimi" | "katilamadi";
  hata?: string;
}

export interface ToplantiSonucu {
  gundem: string;
  gorusler: ToplantiGorusu[];
  /** Hafızaya yazılan toplantı özeti */
  kayitId: string;
}

/** ajana_sor sonucu: yakın zamanda yanıtlanmış aynı soru ya da ArnOrg'un seçtiği uzman bilgisiyle */
export type SoruSonucu = AjanSorusu & { onceki?: boolean; yonlendirme?: string };
import { arnorgAraclari } from "./arnorg-araclari.js";
import type { Depo } from "./depo.js";
import * as gitIslemleri from "./git.js";
import type { OlayYolu } from "./olaylar.js";
import { degerlendir, girdiOzeti, imzaAyikla, varsayilanKurallar } from "./politika.js";
import { ekipDosyalariniOku, ekipDosyasiSil, ekipDosyasiYaz, iskeletOlustur } from "./proje-dosyalari.js";
import { rolBul } from "./roller.js";
import type { Yapilandirma } from "./yapilandirma.js";
import { ArnorgHatasi, bugun, bulunamadi, emojiAyikla, kisalt, sadelestir, simdi } from "./yardimci.js";

const YAZMA_ARACLARI = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const SESSIZ_ARACLAR = new Set(["TodoWrite", "ToolSearch"]);
/** Boşta kalan oturum bu süre sonra kapatılır (kısa uyanış) */
const BOSTA_KAPATMA_MS = 10 * 60_000;
/** Ajanlardan gelen uyandırma sınırı (döngü koruması) */
const UYANDIRMA_PENCERESI_MS = 10 * 60_000;
const UYANDIRMA_SINIRI = 8;
/** Kurulun kaydettiği dosya bu süre ajanlara kilitli kalır */
const KULLANICI_KILIDI_MS = 30_000;

interface BekleyenKarar {
  coz: (sonuc: { izin: boolean; not: string | null }) => void;
  zamanlayici: NodeJS.Timeout;
}

export interface Pencere {
  tur: string;
  durum: string;
  sifirlanma: string | null;
}

export class Sirket {
  private oturumlar = new Map<string, AjanOturumu>();
  private bekleyenKararlar = new Map<string, BekleyenKarar>();
  private bostaZamanlayicilari = new Map<string, NodeJS.Timeout>();
  private uyandirmalar = new Map<string, number[]>();
  private butceOnayiIstendi = new Set<string>();
  private akisSayaci = 0;
  /** Mutlak dosya yolu → son düzenleyen ajan */
  readonly duzenlemeler = new Map<string, { ajanId: string; zaman: number }>();
  /** Mutlak dosya yolu → kilidin bittiği an */
  readonly kullaniciKilitleri = new Map<string, number>();
  /** Ajan kimliği → son akış ya da çalışma anı (tıkanma koruması için) */
  readonly sonEtkinlik = new Map<string, number>();
  pencere: Pencere | null = null;
  /** Claude girişi ve abonelik kullanım pencereleri */
  readonly hesap: HesapIzleyici;
  /** Abonelik sınırı yüzünden durdurulan ajanlar ve bu sürede onlara gelen mesajlar; sıfırlanınca teslim edilir */
  private readonly sinirdaBekleyenler = new Map<string, string[]>();
  /** Proje bazlı kalıcı hafıza ve ajan defterleri */
  readonly hafiza: ProjeHafizasi;
  /** Hafızayı doğru anda ajanın önüne getirir (yeni tur, hata, dosya, sıkıştırma) */
  readonly hatirlatici: Hatirlatici;
  /** Yanıt bekleyen ajanlar arası sorular */
  private readonly bekleyenSorular = new Map<string, { coz: (s: AjanSorusu) => void; zamanlayici: NodeJS.Timeout }>();
  /** Defter hatırlatması: oturumdaki araç sayısı ve defterin güncellenip güncellenmediği */
  private readonly defterIzleri = new Map<string, { arac: number; yazildi: boolean }>();
  /** .arnorg değişikliklerinin gecikmeli commit'i */
  private readonly arnorgCommitZamanlayicilari = new Map<string, NodeJS.Timeout>();

  constructor(
    readonly depo: Depo,
    readonly olaylar: OlayYolu,
    readonly yapilandirma: Yapilandirma,
    private claudeYoluBulucu: () => string | null,
    /** Testlerde gerçek Claude Code oturumu açılmasını engeller */
    private readonly oturumlarKapali = false,
  ) {
    depo.ajanDurumlariniSifirla();
    depo.bekleyenAracOnaylariniKapat();
    depo.bekleyenSorulariKapat();
    this.hafiza = new ProjeHafizasi(depo, olaylar, (id) => this.proje(id), (pid) => this.arnorgCommitPlanla(pid));
    this.hatirlatici = new Hatirlatici(depo, this.hafiza);
    this.hesap = new HesapIzleyici(yapilandirma, olaylar, () => this.claudeYolu, () => this.acikOturumdanKullanim(), oturumlarKapali);
    this.hesap.sinirDegisti = (sinir) => void this.kullanimSiniriDegisti(sinir);
  }

  /** Abonelikte dolar bütçeleri uygulanmaz; ücret alınmaz */
  get abonelik(): boolean {
    return this.yapilandirma.ayarlar.girisYontemi === "abonelik";
  }

  private async acikOturumdanKullanim() {
    for (const o of this.oturumlar.values()) {
      if (!o.acik) continue;
      const k = await o.kullanimSor();
      if (k) return k;
    }
    return null;
  }

  /** Abonelik penceresi ayardaki sınırı aştı ya da sıfırlandı */
  private async kullanimSiniriDegisti(sinir: HesapDurumu["sinir"]): Promise<void> {
    if (sinir) {
      const sifirlanma = sinir.sifirlanma ? new Date(sinir.sifirlanma).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "pencere sıfırlanınca";
      const metin = `Abonelik ${sinir.pencere.toLocaleLowerCase("tr")} kullanımı %${sinir.yuzde} (sınır %${sinir.sinirYuzde}). Ajanlar durduruldu; ${sifirlanma} kaldıkları yerden sürecekler.`;
      for (const [id, o] of this.oturumlar) {
        const a = this.depo.ajan(id);
        if (!o.acik || !a) continue;
        if (!this.sinirdaBekleyenler.has(id)) this.sinirdaBekleyenler.set(id, []);
        if (a.durum === "calisiyor" || a.durum === "karar_bekliyor") await o.kes().catch(() => undefined);
      }
      for (const p of this.depo.projeler()) {
        this.kanalMesaji(p.id, "genel", { id: "arnorg", ad: "ArnOrg" }, metin);
        this.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin, projeId: p.id });
      }
      return;
    }
    // Sınır açıldı: duran ajanlar kuyruktaki mesajlarla uyanır
    const bekleyenler = [...this.sinirdaBekleyenler.entries()];
    this.sinirdaBekleyenler.clear();
    for (const [id, mesajlar] of bekleyenler) {
      const a = this.depo.ajan(id);
      if (!a) continue;
      const ek = mesajlar.length ? `\n\nBu sürede gelen mesajlar:\n${mesajlar.map((m) => `- ${m}`).join("\n")}` : "";
      await this.uyandir(id, `Abonelik kullanım penceresi açıldı. Kaldığın yerden devam et.${ek}`, null);
    }
    if (bekleyenler.length) this.olaylar.yayinla({ tur: "bildirim", seviye: "bilgi", metin: "Abonelik penceresi açıldı; ajanlar kaldıkları yerden sürüyor." });
  }

  get claudeYolu(): string | null {
    return this.claudeYoluBulucu();
  }

  /** Testlerde ve geliştirmede tüm modelleri tek modele çevirir (ör. haiku) */
  private modelSec(model: string): string {
    return process.env.ARNORG_MODEL_ZORLA || model;
  }

  // ===================================================================
  // Projeler
  // ===================================================================

  proje(id: string): Proje {
    const p = this.depo.proje(id);
    if (!p) throw bulunamadi("Proje");
    return p;
  }

  projeOzeti(id: string): ProjeOzeti {
    const p = this.proje(id);
    const ajanlar = this.depo.ajanlar(id);
    const sayilar = Object.fromEntries(GOREV_DURUMLARI.map((d) => [d, 0])) as Record<GorevDurumu, number>;
    for (const g of this.depo.gorevler(id)) sayilar[g.durum]++;
    return {
      ...p,
      ajanSayisi: ajanlar.length,
      aktifAjanSayisi: ajanlar.filter((a) => a.durum === "calisiyor" || a.durum === "karar_bekliyor").length,
      gorevSayilari: sayilar,
      bekleyenOnay: this.depo.onaylar(id, "bekliyor").length,
      bugunMaliyetUsd: this.depo.projeMaliyeti(id, bugun()),
    };
  }

  projeler(): ProjeOzeti[] {
    return this.depo.projeler().map((p) => this.projeOzeti(p.id));
  }

  private projeYayinla(id: string): void {
    try {
      this.olaylar.yayinla({ tur: "proje.guncellendi", proje: this.projeOzeti(id) });
    } catch {
      // proje silinmiş olabilir
    }
  }

  async projeOlustur(istek: ProjeOlusturIstegi): Promise<ProjeOzeti> {
    const ad = istek.ad?.trim();
    if (!ad) throw new ArnorgHatasi("Proje adı gerekli.");
    if (!istek.yol?.trim()) throw new ArnorgHatasi("Proje yolu gerekli.");
    if (!(await gitIslemleri.gitVarMi())) throw new ArnorgHatasi("Sistemde git bulunamadı. Git kurulu olmalı.", 500);
    let kok = path.resolve(istek.yol.trim());
    let yeniRepo = false;
    if (istek.olustur) {
      fs.mkdirSync(kok, { recursive: true });
      if (!(await gitIslemleri.repoMu(kok))) {
        await gitIslemleri.repoBaslat(kok, "main");
        yeniRepo = true;
      } else {
        kok = await gitIslemleri.repoKoku(kok);
      }
    } else {
      if (!fs.existsSync(kok)) throw new ArnorgHatasi("Klasör bulunamadı.", 404);
      if (!(await gitIslemleri.repoMu(kok))) throw new ArnorgHatasi("Klasör bir git deposu değil. Yeni repo oluşturmayı seçin ya da git init çalıştırın.");
      kok = await gitIslemleri.repoKoku(kok);
    }
    kok = gitIslemleri.gercekYol(kok);
    if (this.depo.projeler().some((p) => gitIslemleri.ayniYol(p.yol, kok))) throw new ArnorgHatasi("Bu repo zaten bir ArnOrg projesi.", 409);

    const ilkCommitGerek = !(await gitIslemleri.commitVarMi(kok));
    iskeletOlustur(kok, ad, istek.aciklama?.trim() ?? "", "main", yeniRepo || ilkCommitGerek);
    if (yeniRepo || ilkCommitGerek) {
      await gitIslemleri.kimlikGuvenceAltinaAl(kok);
      await gitIslemleri.tumunuCommitle(kok, "ArnOrg: proje iskeleti");
    }
    let dal = await gitIslemleri.mevcutDal(kok);
    if (dal === "HEAD") dal = "main";

    const proje = this.depo.projeEkle({ ad, yol: kok, aciklama: istek.aciklama?.trim() ?? "", varsayilanDal: dal });
    this.depo.politikaYaz(proje.id, varsayilanKurallar());

    // Repo içinde kayıtlı ekip varsa geri yükle
    const kayitlar = ekipDosyalariniOku(kok);
    for (const k of kayitlar) {
      if (!rolBul(k.rol)) continue;
      this.iseAl(proje.id, { ad: k.ad, rol: k.rol, model: k.model, gunlukButceUsd: k.gunlukButceUsd, talimatEki: k.talimatEki, karakter: k.karakter }, false);
    }
    for (const k of kayitlar) {
      if (!k.yonetici) continue;
      const a = this.depo.ajanAdla(proje.id, k.ad);
      const y = this.depo.ajanAdla(proje.id, k.yonetici);
      if (a && y) this.depo.ajanGuncelle(a.id, { yoneticiId: y.id });
    }
    if (!this.depo.ajanlar(proje.id).some((a) => a.rol === "ceo")) {
      this.iseAl(proje.id, { ad: "Ada", rol: "ceo" });
    }
    this.hafiza.iceAktar(proje, this.depo.ajanlar(proje.id));
    this.depo.mesajEkle({
      projeId: proje.id,
      kanal: "genel",
      gonderenId: "arnorg",
      gonderenAd: "ArnOrg",
      metin: `${ad} projesi açıldı. CEO hazır; brief'inizi bu kanala yazın.`,
      anilanlar: [],
    });
    this.projeYayinla(proje.id);
    return this.projeOzeti(proje.id);
  }

  projeSil(id: string): void {
    for (const a of this.depo.ajanlar(id)) this.oturumlar.get(a.id)?.kapat();
    this.depo.projeSil(id);
    this.olaylar.yayinla({ tur: "bildirim", seviye: "bilgi", metin: "Proje ArnOrg listesinden çıkarıldı; dosyalara dokunulmadı." });
  }

  // ===================================================================
  // Ekip
  // ===================================================================

  ajan(id: string): Ajan {
    const a = this.depo.ajan(id);
    if (!a) throw bulunamadi("Ajan");
    return a;
  }

  private ajanYayinla(id: string): void {
    const a = this.depo.ajan(id);
    if (a) this.olaylar.yayinla({ tur: "ajan.guncellendi", ajan: a });
  }

  iseAl(projeId: string, istek: AjanIseAlIstegi, dosyaYaz = true): Ajan {
    const proje = this.proje(projeId);
    const ad = istek.ad?.trim();
    if (!ad || ad.length > 40) throw new ArnorgHatasi("Ajan adı 1–40 karakter olmalı.");
    if (!/^[\p{L}\p{N} ._-]+$/u.test(ad)) throw new ArnorgHatasi("Ajan adında yalnız harf, rakam, boşluk, nokta, tire ve alt çizgi olabilir.");
    if (this.depo.ajanAdla(projeId, ad)) throw new ArnorgHatasi(`${ad} adında bir çalışan zaten var.`, 409);
    const rol = rolBul(istek.rol);
    if (!rol) throw new ArnorgHatasi("Bilinmeyen rol.");
    const ceo = this.depo.ajanlar(projeId).find((a) => a.rol === "ceo");
    if (rol.kimlik === "ceo" && ceo) throw new ArnorgHatasi("Projede zaten bir CEO var.", 409);
    const yoneticiId = istek.yoneticiId === undefined ? (rol.kimlik === "ceo" ? null : (ceo?.id ?? null)) : istek.yoneticiId;
    const ajan = this.depo.ajanEkle({
      projeId,
      ad,
      rol: rol.kimlik,
      rolAdi: rol.ad,
      model: istek.model?.trim() || rol.varsayilanModel,
      yoneticiId,
      durum: "kapali",
      isAciklamasi: "",
      gorevId: null,
      oturumId: null,
      calismaAlani: null,
      dal: null,
      izinModu: this.yapilandirma.ayarlar.varsayilanIzinModu,
      gunlukButceUsd: typeof istek.gunlukButceUsd === "number" ? Math.max(0, istek.gunlukButceUsd) : rol.yonetici ? 10 : 5,
      talimatEki: istek.talimatEki?.trim() ?? "",
      karakter: istek.karakter ?? null,
    });
    if (dosyaYaz) this.kimlikDosyasiYaz(ajan, proje);
    this.ajanYayinla(ajan.id);
    this.projeYayinla(projeId);
    return ajan;
  }

  private kimlikDosyasiYaz(ajan: Ajan, proje: Proje): void {
    try {
      const yonetici = ajan.yoneticiId ? this.depo.ajan(ajan.yoneticiId) : null;
      ekipDosyasiYaz(proje.yol, ajan, yonetici?.ad ?? null);
    } catch {
      // Repo salt okunursa kimlik dosyası yazılamaz; veritabanı kaydı yeterli
    }
  }

  async ajanGuncelle(id: string, istek: AjanGuncelleIstegi): Promise<Ajan> {
    const a = this.ajan(id);
    const alanlar: Partial<Ajan> = {};
    if (istek.model) alanlar.model = istek.model;
    if (typeof istek.gunlukButceUsd === "number") alanlar.gunlukButceUsd = Math.max(0, istek.gunlukButceUsd);
    if (istek.izinModu) alanlar.izinModu = istek.izinModu;
    if (istek.yoneticiId !== undefined) {
      if (istek.yoneticiId === id) throw new ArnorgHatasi("Ajan kendi yöneticisi olamaz.");
      alanlar.yoneticiId = istek.yoneticiId;
    }
    if (istek.talimatEki !== undefined) alanlar.talimatEki = istek.talimatEki;
    if (istek.karakter !== undefined) alanlar.karakter = istek.karakter;
    const yeni = this.depo.ajanGuncelle(id, alanlar);
    const oturum = this.oturumlar.get(id);
    if (oturum?.acik) {
      if (istek.model && istek.model !== a.model) await oturum.modelDegistir(this.modelSec(istek.model));
      if (istek.izinModu && istek.izinModu !== a.izinModu) await oturum.modDegistir(istek.izinModu);
    }
    this.kimlikDosyasiYaz(yeni, this.proje(yeni.projeId));
    this.ajanYayinla(id);
    return this.ajan(id);
  }

  ajanSil(id: string): void {
    const a = this.ajan(id);
    if (a.rol === "ceo") throw new ArnorgHatasi("CEO işten çıkarılamaz.", 409);
    this.oturumlar.get(id)?.kapat();
    this.oturumlar.delete(id);
    for (const g of this.depo.gorevler(a.projeId)) {
      if (g.atananId === id && g.durum !== "tamam") this.depo.gorevGuncelle(g.id, { atananId: null, durum: g.durum === "calisiliyor" ? "planlandi" : g.durum });
    }
    for (const alt of this.depo.ajanlar(a.projeId)) if (alt.yoneticiId === id) this.depo.ajanGuncelle(alt.id, { yoneticiId: a.yoneticiId });
    this.depo.ajanSil(id);
    try {
      ekipDosyasiSil(this.proje(a.projeId).yol, a.ad);
    } catch {
      // yok sayılır
    }
    this.olaylar.yayinla({ tur: "ajan.silindi", projeId: a.projeId, ajanId: id });
    this.projeYayinla(a.projeId);
  }

  // ===================================================================
  // Çalışma alanları
  // ===================================================================

  private async calismaAlaniHazirla(ajan: Ajan): Promise<string> {
    const proje = this.proje(ajan.projeId);
    if (rolBul(ajan.rol)?.kimlik === "ceo") return proje.yol;
    if (ajan.calismaAlani && fs.existsSync(ajan.calismaAlani)) return ajan.calismaAlani;
    if (!(await gitIslemleri.commitVarMi(proje.yol))) {
      await gitIslemleri.kimlikGuvenceAltinaAl(proje.yol);
      await gitIslemleri.git(proje.yol, ["commit", "--allow-empty", "-m", "ArnOrg: başlangıç"]);
    }
    const slug = sadelestir(ajan.ad);
    const hedef = path.join(this.yapilandirma.calismaKoku, `${sadelestir(proje.ad)}-${proje.id.slice(0, 8)}`, slug);
    const dal = `arnorg/${slug}`;
    await gitIslemleri.worktreeAc(proje.yol, hedef, dal, proje.varsayilanDal);
    const yeni = this.depo.ajanGuncelle(ajan.id, { calismaAlani: hedef, dal });
    this.kimlikDosyasiYaz(yeni, proje);
    this.ajanYayinla(ajan.id);
    return hedef;
  }

  async calismaAlanlari(projeId: string): Promise<CalismaAlani[]> {
    const p = this.proje(projeId);
    const anaDal = await gitIslemleri.mevcutDal(p.yol).catch(() => p.varsayilanDal);
    const liste: CalismaAlani[] = [{ kimlik: "ana", yol: p.yol, dal: anaDal, ajanId: null, ana: true }];
    for (const a of this.depo.ajanlar(projeId)) {
      if (a.calismaAlani && a.calismaAlani !== p.yol && fs.existsSync(a.calismaAlani)) {
        liste.push({ kimlik: a.id, yol: a.calismaAlani, dal: a.dal ?? "", ajanId: a.id, ana: false });
      }
    }
    return liste;
  }

  alanYolu(projeId: string, alan: string): string {
    const p = this.proje(projeId);
    if (!alan || alan === "ana") return p.yol;
    const a = this.depo.ajan(alan);
    if (!a || a.projeId !== projeId || !a.calismaAlani) throw bulunamadi("Çalışma alanı");
    return a.calismaAlani;
  }

  // ===================================================================
  // Oturumlar
  // ===================================================================

  private talimatOlustur(ajan: Ajan, cwd: string): string {
    const proje = this.proje(ajan.projeId);
    const rol = rolBul(ajan.rol);
    const yonetici = ajan.yoneticiId ? this.depo.ajan(ajan.yoneticiId) : null;
    const ekip = this.depo
      .ajanlar(ajan.projeId)
      .filter((a) => a.id !== ajan.id)
      .map((a) => `- ${a.ad} (${a.rolAdi})`)
      .join("\n");
    // Talimata giren hafıza kayıtları bu oturumda gösterilmiş sayılır; tur başında yinelenmez
    const gosterilen: string[] = [];
    const hafizaBaglami = this.hafiza.baglam(ajan, this.depo.sorular(ajan.projeId, { soruluId: ajan.id, durum: "bekliyor", sinir: 8 }), gosterilen);
    this.hatirlatici.oturumAcildi(ajan.id, gosterilen);
    return [
      "# ArnOrg",
      `Sen ArnOrg yazılım şirketinde ${ajan.rolAdi} olarak çalışan ${ajan.ad}'sın. Yöneticin: ${yonetici ? `${yonetici.ad} (${yonetici.rolAdi})` : "Yönetim kurulu"}.`,
      `Proje: ${proje.ad}${proje.aciklama ? ` — ${proje.aciklama}` : ""}`,
      `Ana repo: ${proje.yol} (varsayılan dal ${proje.varsayilanDal}). Çalışma dizinin: ${cwd}${ajan.dal ? ` (dal ${ajan.dal})` : ""}.`,
      "",
      rol?.talimat ?? "",
      "",
      "## Ekip",
      ekip || "- Henüz başka çalışan yok.",
      "",
      "## Ortak kurallar",
      "- Türkçe yaz. Kısa ve net ol. Emoji, onay işareti ya da süsleme simgesi kullanma; düz metin yaz.",
      "- Ekiple yalnız mcp__arnorg__mesaj_gonder ile konuş; @Ad ile andığın kişi uyarılır. Kanalları mcp__arnorg__kanal_oku ile oku.",
      "- İşe başlamadan mcp__arnorg__notlari_listele ve not_oku ile ilgili notları oku. Kararları not_yaz ile notlar/kararlar/ altına yaz.",
      "- Görevin durumunu mcp__arnorg__gorev_guncelle ile güncel tut. İş bitince 'inceleme' durumuna al ve ne yaptığını özetle.",
      "- Yönetim kuruluna soru gerekiyorsa mcp__arnorg__kurula_sor kullan.",
      "- Her araç çağrın ArnOrg denetiminden geçer. Reddedilen bir çağrıyı başka yoldan zorlamaya çalışma; nedeni oku, gerekiyorsa kurula_sor ile izin iste.",
      "- Yalnız kendi çalışma dizinine yaz. Uzak depoya push, yayın ve dağıtım kurul onayı ister.",
      "- Kodu commit'le; mesajlar Türkçe ve ne değiştiğini söyler. Commit mesajına Co-Authored-By, \"Generated with Claude Code\" ya da başka bir Claude imzası ekleme.",
      "",
      "## Unutmamak ve birlikte düşünmek",
      "- Bu projenin hafızası kalıcıdır ve yalnız bu projeye aittir. Aşağıdaki hafıza her oturumda sana verilir; başka projelerin bilgisini karıştırma.",
      "- Kalıcı bir karar alındığında, kurul bir tercih bildirdiğinde, bir hatanın nedenini ve çözümünü bulduğunda ya da projeye dair önemli bir olgu öğrendiğinde hemen mcp__arnorg__hafiza_kaydet ile kaydet. Bilgi değişirse yerine_gecen ile eskisini işaretle; aynı başlık güncellenir, tekrar yazılmaz.",
      "- Bilmediğin bir şeyi önce hafiza_ara ile ara. Bilen bir çalışan varsa ajana_sor ile kısa ve net sor; kimin bildiğinden emin değilsen kime alanını boş bırak, ArnOrg hafızaya ve geçmiş işlere bakıp uzmanı bulur. Yanıt gelene kadar beklersin. Sana soru gelirse işini kısa bir an bırakıp soruyu_yanitla ile yanıtla.",
      "- Çalışırken mesajlarına, hata çıktılarına ve dokunduğun dosyalara [ArnOrg hafızası] notları eklenebilir: ekip arkadaşlarının yeni kayıtları ve geçmişte öğrenilenler. Bunları dikkate al; çelişen bir şey görürsen kaydı güncelle.",
      "- Başkasının işine dokunmadan önce defter_oku ile onun defterine ve gorev_detay ile görevine bak.",
      "- Her turun sonunda defter_yaz ile defterini güncelle: ne yaptın, ne kaldı, kime ne söz verdin, sıradaki adım. Kısa maddeler; eskiyenleri çıkar.",
      "",
      hafizaBaglami,
      ajan.talimatEki ? `\n## Ek talimat\n${ajan.talimatEki}` : "",
    ].join("\n");
  }

  private oturumAl(ajan: Ajan, cwd: string): AjanOturumu {
    let oturum = this.oturumlar.get(ajan.id);
    if (oturum) return oturum;
    const id = ajan.id;
    const izinSor: CanUseTool = async (arac, girdi, s) => this.izinSor(id, arac, girdi, s.toolUseID);
    oturum = new AjanOturumu({
      ajan: () => this.ajan(id),
      cwd,
      claudeYolu: this.claudeYolu,
      talimat: () => this.talimatOlustur(this.ajan(id), cwd),
      araclar: () => arnorgAraclari(this, id),
      yasakAraclar: () => (rolBul(this.ajan(id).rol)?.kimlik === "ceo" ? ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "PowerShell", "Monitor", "Agent", "Task", "Skill"] : []),
      kalanButceUsd: () => {
        if (this.abonelik) return 0;
        const a = this.ajan(id);
        return a.gunlukButceUsd > 0 ? Math.max(0.05, a.gunlukButceUsd - a.bugunHarcananUsd) : 0;
      },
      onaySuresiSn: () => this.yapilandirma.ayarlar.onaySuresiSn,
      kapi: (arac, girdi, aracKimligi) => this.kapi(id, arac, girdi, aracKimligi),
      izinSor,
      aracSonrasi: (arac, girdi) => this.aracSonrasi(id, arac, girdi),
      aracHatasi: (arac, girdi, hata) => this.hatirlatici.hataSonrasi(this.ajan(id), arac, girdi, hata),
      turBasi: (metin) => this.hatirlatici.turBasi(this.ajan(id), metin, !/^\[[^\]\n]{1,60}\] /.test(metin)),
      sikistirmaSonrasi: () => {
        const a = this.ajan(id);
        return this.hatirlatici.sikistirmaSonrasi(a, this.depo.sorular(a.projeId, { soruluId: a.id, durum: "bekliyor", sinir: 6 }));
      },
      akis: (oge) => this.akisEkle(id, oge),
      durum: (d, aciklama) => this.durumDegisti(id, d, aciklama),
      oturumKimligi: (oid) => {
        this.depo.ajanGuncelle(id, { oturumId: oid || null });
      },
      kullanim: (delta) => this.kullanimEkle(id, delta),
      pencere: (p) => {
        this.pencere = { tur: p.tur, durum: p.durum, sifirlanma: p.sifirlanma };
        this.hesap.pencereOlayi(p);
      },
      girisYontemi: () => this.yapilandirma.ayarlar.girisYontemi,
      oturumToplami: {
        oku: (oturumId) => {
          const d = this.depo.deger(`oturum-toplam:${oturumId}`);
          return d ? (JSON.parse(d) as Toplam) : null;
        },
        yaz: (oturumId, t) => this.depo.degerYaz(`oturum-toplam:${oturumId}`, JSON.stringify(t)),
      },
      girisKaynagi: (k) => this.hesap.girisKaynagi(k),
      bitti: (hata) => {
        this.hatirlatici.oturumKapandi(id);
        if (hata) this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: `${this.depo.ajan(id)?.ad ?? "Ajan"}: ${kisalt(hata, 200)}`, projeId: ajan.projeId });
      },
    });
    this.oturumlar.set(ajan.id, oturum);
    return oturum;
  }

  async ajanBaslat(id: string, istek: AjanBaslatIstegi = {}): Promise<Ajan> {
    const a = this.ajan(id);
    let metin = istek.talimat?.trim() ?? "";
    if (istek.gorevId) {
      const g = this.depo.gorev(istek.gorevId);
      if (!g || g.projeId !== a.projeId) throw bulunamadi("Görev");
      if (g.atananId !== id) this.depo.gorevGuncelle(g.id, { atananId: id });
      this.depo.ajanGuncelle(id, { gorevId: g.id });
      metin = this.gorevMetni(g) + (metin ? `\n\nEk not: ${metin}` : "");
    }
    if (!metin) {
      const benim = this.depo.gorevler(a.projeId).filter((g) => g.atananId === id && (g.durum === "calisiliyor" || g.durum === "planlandi"));
      metin = benim.length
        ? `Mesaine başla. Sana atanmış görevler:\n${benim.map((g) => `- ${g.kod} ${g.baslik} (${g.durum})`).join("\n")}\nÖnce notları ve görev ayrıntılarını oku, sonra sıradaki işe başla.`
        : rolBul(a.rol)?.yonetici
          ? "Mesaine başla. #genel kanalını, görevleri ve notları oku; durumu değerlendir ve gerekiyorsa plan yap."
          : "Mesaine başla. Görevleri ve notları oku; sana atanmış iş yoksa yöneticine durumunu bildir.";
    }
    await this.ajanaMesaj(id, metin, "next", { tur: "kurul" });
    return this.ajan(id);
  }

  async ajanaMesaj(id: string, metin: string, oncelik: MesajOnceligi = "next", kaynak: MesajKaynagi = { tur: "kurul" }): Promise<void> {
    if (!metin.trim()) throw new ArnorgHatasi("Mesaj boş olamaz.");
    const a = this.ajan(id);
    // Abonelik sınırında ajan uyandırılmaz; mesaj saklanır, pencere açılınca teslim edilir. Kurulun kendi mesajı geçer.
    const sinir = this.hesap.sinir;
    if (sinir && kaynak.tur !== "kurul") {
      const kuyruk = this.sinirdaBekleyenler.get(id) ?? [];
      kuyruk.push(kisalt(metin, 1500));
      this.sinirdaBekleyenler.set(id, kuyruk);
      throw new ArnorgHatasi(`Abonelik kullanımı sınırda (${sinir.pencere} %${sinir.yuzde}); ${a.ad} pencere açılınca uyanacak.`, 429);
    }
    const oturum = this.oturumlar.get(id);
    if (oturum?.acik) {
      oturum.gonder(metin, oncelik, kaynak);
      return;
    }
    if (this.oturumlarKapali) throw new ArnorgHatasi("Oturumlar bu çalıştırmada kapalı.", 503);
    if (!this.claudeYolu && !this.sdkIkilisiVar()) {
      throw new ArnorgHatasi("Claude Code bulunamadı. Ayarlar'dan Claude Code yolunu verin ya da Claude Code'u kurun.", 500);
    }
    let cwd: string;
    try {
      cwd = await this.calismaAlaniHazirla(a);
    } catch (h) {
      this.durumDegisti(id, "hata", `Çalışma alanı açılamadı: ${(h as Error).message}`);
      throw h;
    }
    this.oturumAl(this.ajan(id), cwd).baslat(metin, kaynak);
  }

  private sdkIkilisiVar(): boolean {
    // SDK'nın platform paketi kuruluysa kendi Claude Code ikilisini kullanır
    try {
      createRequire(import.meta.url).resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
      return true;
    } catch {
      return false;
    }
  }

  async ajanKes(id: string): Promise<void> {
    this.ajan(id);
    await this.oturumlar.get(id)?.kes();
  }

  ajanDurdur(id: string): Ajan {
    this.ajan(id);
    this.oturumlar.get(id)?.kapat();
    return this.ajan(id);
  }

  async ajanMod(id: string, mod: IzinModu): Promise<Ajan> {
    return this.ajanGuncelle(id, { izinModu: mod });
  }

  async ajanModel(id: string, model: string): Promise<Ajan> {
    if (!model.trim()) throw new ArnorgHatasi("Model adı gerekli.");
    return this.ajanGuncelle(id, { model: model.trim() });
  }

  akis(id: string, sinir = 300): AkisOgesi[] {
    this.ajan(id);
    return this.depo.akis(id, Math.min(Math.max(1, sinir), 2000));
  }

  tumunuDurdur(projeId?: string): void {
    for (const [id, o] of this.oturumlar) {
      const a = this.depo.ajan(id);
      if (!projeId || a?.projeId === projeId) o.kapat();
    }
  }

  private akisEkle(ajanId: string, oge: AkisOgesi): void {
    const a = this.depo.ajan(ajanId);
    if (!a) return;
    this.depo.akisEkle(a.projeId, oge);
    this.sonEtkinlik.set(ajanId, Date.now());
    if (++this.akisSayaci % 200 === 0) this.depo.akisBuda(ajanId);
    this.olaylar.yayinla({ tur: "ajan.akis", projeId: a.projeId, oge });
  }

  private durumDegisti(ajanId: string, durum: AjanDurumu, aciklama?: string): void {
    const onceki = this.depo.ajan(ajanId);
    if (!onceki) return;
    const alanlar: Partial<Ajan> = { durum };
    if (aciklama !== undefined) alanlar.isAciklamasi = aciklama;
    if (durum === "kapali") alanlar.isAciklamasi = "";
    this.depo.ajanGuncelle(ajanId, alanlar);
    // Kısa uyanış: boşta kalan oturum bir süre sonra kapanır, oturum kimliği saklanır
    const z = this.bostaZamanlayicilari.get(ajanId);
    if (z) clearTimeout(z);
    this.bostaZamanlayicilari.delete(ajanId);
    if (durum === "calisiyor" || onceki.durum === "calisiyor") this.sonEtkinlik.set(ajanId, Date.now());
    if (durum === "bosta") {
      // Unutmamak için: çok iş yapıp defterini yazmadan duran ajana bir kez hatırlatılır
      const iz = this.defterIzleri.get(ajanId);
      if (iz && iz.arac >= 6 && !iz.yazildi) {
        this.defterIzleri.set(ajanId, { arac: 0, yazildi: false });
        void this.sistemMesaji(
          ajanId,
          "Turu kapatmadan defter_yaz ile defterini güncelle: ne yaptın, ne kaldı, kime ne söz verdin, sıradaki adım. Kalıcı bir karar ya da öğrenilen varsa hafiza_kaydet ile kaydet. Sonra dur.",
        ).catch(() => undefined);
      }
      this.bostaZamanlayicilari.set(
        ajanId,
        setTimeout(() => {
          if (this.depo.ajan(ajanId)?.durum === "bosta") this.oturumlar.get(ajanId)?.kapat();
        }, BOSTA_KAPATMA_MS),
      );
    }
    this.ajanYayinla(ajanId);
    if (onceki.durum !== durum) this.projeYayinla(onceki.projeId);
  }

  private kullanimEkle(ajanId: string, delta: Toplam): void {
    const a = this.depo.ajan(ajanId);
    if (!a) return;
    this.depo.maliyetEkle(a.projeId, ajanId, delta.usd, delta.token);
    const y = this.depo.ajan(ajanId)!;
    this.olaylar.yayinla({
      tur: "maliyet",
      projeId: a.projeId,
      ajanId,
      bugunUsd: y.bugunHarcananUsd,
      toplamUsd: y.toplamHarcananUsd,
      bugunToken: y.bugunToken,
      toplamToken: y.toplamToken,
    });
    this.ajanYayinla(ajanId);
  }

  // ===================================================================
  // Denetim kapısı
  // ===================================================================

  politika(projeId: string): PolitikaKurali[] {
    this.proje(projeId);
    return this.depo.politika(projeId) ?? varsayilanKurallar();
  }

  politikaYaz(projeId: string, kurallar: PolitikaKurali[]): PolitikaKurali[] {
    this.proje(projeId);
    if (!Array.isArray(kurallar)) throw new ArnorgHatasi("Kurallar dizi olmalı.");
    for (const k of kurallar) {
      if (!k.id || !k.ad || !["izin", "ret", "sor"].includes(k.karar) || !["komut", "yol", "url", "arac"].includes(k.hedef)) {
        throw new ArnorgHatasi(`Geçersiz kural: ${k.ad || k.id || "adsız"}`);
      }
      for (const d of k.desenler ?? []) {
        try {
          new RegExp(d, "i");
        } catch {
          throw new ArnorgHatasi(`Geçersiz düzenli ifade (${k.ad}): ${d}`);
        }
      }
    }
    this.depo.politikaYaz(projeId, kurallar);
    return kurallar;
  }

  private denetimKaydet(ajan: Ajan, arac: string, girdi: Record<string, unknown>, karar: Karar, kural: string | null, neden: string | null, aracKimligi?: string): void {
    const kayit = this.depo.denetimEkle({
      projeId: ajan.projeId,
      ajanId: ajan.id,
      ajanAd: ajan.ad,
      arac,
      girdiOzeti: girdiOzeti(arac, girdi),
      karar,
      kural,
      neden,
      aracKimligi: aracKimligi ?? null,
    });
    this.olaylar.yayinla({ tur: "denetim.kaydi", kayit });
  }

  private ret(neden: string): HookJSONOutput {
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: neden } };
  }

  /** PreToolUse: her araç çağrısı buradan geçer */
  async kapi(ajanId: string, arac: string, girdi: Record<string, unknown>, aracKimligi?: string): Promise<HookJSONOutput> {
    const ajan = this.depo.ajan(ajanId);
    if (!ajan) return this.ret("ArnOrg: ajan bulunamadı.");
    if (arac.startsWith("mcp__arnorg__")) return {};
    const proje = this.proje(ajan.projeId);
    const cwd = ajan.calismaAlani ?? proje.yol;

    // Abonelik kullanım sınırı: ajan işini bırakır, pencere açılınca ArnOrg uyandırır
    const sinir = this.hesap.sinir;
    if (sinir) {
      if (!this.sinirdaBekleyenler.has(ajanId)) this.sinirdaBekleyenler.set(ajanId, []);
      const neden = `Abonelik ${sinir.pencere.toLocaleLowerCase("tr")} kullanımı %${sinir.yuzde} (kurulun sınırı %${sinir.sinirYuzde}). Başka araç çağırma; ne yaptığını ve sıradaki adımı iki cümleyle yaz ve dur. Pencere açılınca ArnOrg seni uyandıracak.`;
      this.denetimKaydet(ajan, arac, girdi, "ret", "Kullanım sınırı", neden, aracKimligi);
      return this.ret(neden);
    }

    // Bütçe (yalnız API girişinde; abonelikte ücret alınmaz)
    if (!this.abonelik && ajan.gunlukButceUsd > 0 && ajan.bugunHarcananUsd >= ajan.gunlukButceUsd) {
      this.butceOnayiIste(ajan);
      const neden = `Günlük bütçen doldu ($${ajan.bugunHarcananUsd.toFixed(2)} / $${ajan.gunlukButceUsd.toFixed(2)}). Yönetim kurulu onayı bekleniyor; işini özetleyip dur.`;
      this.denetimKaydet(ajan, arac, girdi, "ret", "Bütçe", neden, aracKimligi);
      return this.ret(neden);
    }
    const sirketButcesi = this.yapilandirma.ayarlar.gunlukButceUsd;
    if (!this.abonelik && sirketButcesi > 0 && this.depo.sirketMaliyeti(bugun()) >= sirketButcesi) {
      const neden = `Şirketin günlük bütçesi ($${sirketButcesi.toFixed(2)}) doldu. Yarın ya da kurul bütçeyi artırınca devam edilir.`;
      this.denetimKaydet(ajan, arac, girdi, "ret", "Şirket bütçesi", neden, aracKimligi);
      return this.ret(neden);
    }

    // Kurulun düzenlediği dosya
    if (YAZMA_ARACLARI.has(arac)) {
      const hedef = typeof girdi.file_path === "string" ? path.resolve(cwd, girdi.file_path) : null;
      const kilit = hedef ? this.kullaniciKilitleri.get(hedef) : undefined;
      if (hedef && kilit && kilit > Date.now()) {
        const neden = "Bu dosyayı şu an yönetim kurulu düzenliyor. Birkaç saniye sonra dosyayı yeniden oku ve sonra düzenle.";
        this.denetimKaydet(ajan, arac, girdi, "ret", "Kurul kilidi", neden, aracKimligi);
        return this.ret(neden);
      }
    }

    const sonuc = degerlendir(this.politika(proje.id), arac, girdi, { cwd, projeKoku: proje.yol, rol: ajan.rol });
    if (sonuc.karar === "ret") {
      this.denetimKaydet(ajan, arac, girdi, "ret", sonuc.kural, sonuc.neden, aracKimligi);
      return this.ret(`ArnOrg politikası reddetti. ${sonuc.neden ?? ""} Gerekliyse kurula_sor ile gerekçeli izin iste.`);
    }
    if (sonuc.karar === "sor") {
      this.denetimKaydet(ajan, arac, girdi, "sor", sonuc.kural, sonuc.neden, aracKimligi);
      const k = await this.kararBekle(ajan, "arac", `${ajan.ad} · ${arac}`, girdiOzeti(arac, girdi), { arac, girdi, kural: sonuc.kural, aracKimligi });
      this.denetimKaydet(ajan, arac, girdi, k.izin ? "izin" : "ret", "Yönetim kurulu", k.not, aracKimligi);
      if (!k.izin) return this.ret(`Yönetim kurulu izin vermedi.${k.not ? ` Not: ${k.not}` : ""}`);
      this.yazmaKaydet(ajanId, cwd, arac, girdi);
      return this.imzasiz(ajan, arac, girdi, aracKimligi) ?? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "Yönetim kurulu onayladı" } };
    }
    this.yazmaKaydet(ajanId, cwd, arac, girdi);
    const imzasiz = this.imzasiz(ajan, arac, girdi, aracKimligi);
    if (imzasiz) return imzasiz;
    if (!SESSIZ_ARACLAR.has(arac)) this.denetimKaydet(ajan, arac, girdi, "izin", null, null, aracKimligi);
    return {};
  }

  /** Commit komutundaki Claude imzasını siler ve çağrıyı değiştirilmiş girdiyle geçirir */
  private imzasiz(ajan: Ajan, arac: string, girdi: Record<string, unknown>, aracKimligi?: string): HookJSONOutput | null {
    const yeni = imzaAyikla(arac, girdi);
    if (!yeni) return null;
    const neden = "Commit mesajındaki Claude imzası çıkarıldı.";
    this.denetimKaydet(ajan, arac, yeni, "degisti", "İmzasız commit", neden, aracKimligi);
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: `ArnOrg: ${neden}`, updatedInput: yeni } };
  }

  private yazmaKaydet(ajanId: string, cwd: string, arac: string, girdi: Record<string, unknown>): void {
    if (!YAZMA_ARACLARI.has(arac)) return;
    const y = typeof girdi.file_path === "string" ? girdi.file_path : typeof girdi.notebook_path === "string" ? girdi.notebook_path : null;
    if (y) this.duzenlemeler.set(path.resolve(cwd, y), { ajanId, zaman: Date.now() });
  }

  /** Araç sonrası: defter sayacı, düzenleme izi; dokunulan dosyayla ilgili hafıza ek bağlam olarak döner */
  private aracSonrasi(ajanId: string, arac: string, girdi: Record<string, unknown>): string | null {
    if (!arac.startsWith("mcp__arnorg__")) {
      const iz = this.defterIzleri.get(ajanId) ?? { arac: 0, yazildi: false };
      iz.arac++;
      this.defterIzleri.set(ajanId, iz);
    }
    const a = this.depo.ajan(ajanId);
    if (!a) return null;
    const cwd = a.calismaAlani ?? this.proje(a.projeId).yol;
    const ek = this.hatirlatici.dosyaSonrasi(a, cwd, arac, girdi);
    const y = typeof girdi.file_path === "string" ? girdi.file_path : null;
    if (y && YAZMA_ARACLARI.has(arac)) {
      const tam = path.resolve(cwd, y);
      this.duzenlemeler.set(tam, { ajanId, zaman: Date.now() });
      this.olaylar.yayinla({ tur: "dosya.degisti", projeId: a.projeId, alan: a.calismaAlani ? a.id : "ana", yol: path.relative(cwd, tam).replace(/\\/g, "/"), ajanId });
    }
    return ek;
  }

  /** Claude Code'un izin sorduğu çağrı (bypass dışı modlar, plan onayı) */
  private async izinSor(ajanId: string, arac: string, girdi: Record<string, unknown>, aracKimligi?: string): Promise<PermissionResult> {
    const ajan = this.depo.ajan(ajanId);
    if (!ajan) return { behavior: "deny", message: "Ajan bulunamadı." };
    if (arac.startsWith("mcp__arnorg__")) return { behavior: "allow", updatedInput: girdi };
    const planMi = arac === "ExitPlanMode";
    const baslik = planMi ? `${ajan.ad} · Plan onayı` : `${ajan.ad} · ${arac} izni istiyor`;
    const ayrinti = planMi ? String(girdi.plan ?? "") : girdiOzeti(arac, girdi);
    const k = await this.kararBekle(ajan, "arac", baslik, ayrinti, { arac, girdi, kural: "Claude Code izin sorusu", aracKimligi });
    this.denetimKaydet(ajan, arac, girdi, k.izin ? "izin" : "ret", "Yönetim kurulu", k.not, aracKimligi);
    return k.izin ? { behavior: "allow", updatedInput: girdi } : { behavior: "deny", message: `Yönetim kurulu izin vermedi.${k.not ? ` Not: ${k.not}` : ""}` };
  }

  /** Onay açar ve kurulun kararını bekler; süre dolarsa ret */
  kararBekle(ajan: Ajan | null, tur: OnayTuru, baslik: string, ayrinti: string, veri: unknown, projeId?: string): Promise<{ izin: boolean; not: string | null }> {
    const sure = this.yapilandirma.ayarlar.onaySuresiSn;
    const onay = this.depo.onayEkle({
      projeId: ajan?.projeId ?? projeId!,
      ajanId: ajan?.id ?? null,
      tur,
      baslik,
      ayrinti,
      veri,
      sonGecerlilik: new Date(Date.now() + sure * 1000).toISOString(),
    });
    this.olaylar.yayinla({ tur: "onay.yeni", onay });
    this.projeYayinla(onay.projeId);
    if (ajan) this.durumDegisti(ajan.id, "karar_bekliyor", `Onay bekliyor: ${kisalt(baslik, 60)}`);
    return new Promise((coz) => {
      const zamanlayici = setTimeout(() => {
        this.bekleyenKararlar.delete(onay.id);
        const son = this.depo.onaySonuclandir(onay.id, "zaman_asimi", "Süre doldu");
        this.olaylar.yayinla({ tur: "onay.sonuc", onay: son });
        this.projeYayinla(son.projeId);
        coz({ izin: false, not: "Süre doldu" });
      }, sure * 1000);
      this.bekleyenKararlar.set(onay.id, {
        zamanlayici,
        coz: (s) => {
          clearTimeout(zamanlayici);
          this.bekleyenKararlar.delete(onay.id);
          if (ajan && this.depo.ajan(ajan.id)?.durum === "karar_bekliyor") this.durumDegisti(ajan.id, "calisiyor", "Devam ediyor");
          coz(s);
        },
      });
    });
  }

  /** Beklemeden karar isteği açar (işe alım, birleştirme teklifleri) */
  teklifAc(ajan: Ajan, tur: OnayTuru, baslik: string, ayrinti: string, veri: unknown): Onay {
    const onay = this.depo.onayEkle({ projeId: ajan.projeId, ajanId: ajan.id, tur, baslik, ayrinti, veri, sonGecerlilik: null });
    this.olaylar.yayinla({ tur: "onay.yeni", onay });
    this.projeYayinla(ajan.projeId);
    return onay;
  }

  private butceOnayiIste(ajan: Ajan): void {
    const anahtar = `${ajan.id}:${bugun()}`;
    if (this.butceOnayiIstendi.has(anahtar)) return;
    this.butceOnayiIstendi.add(anahtar);
    const onay = this.depo.onayEkle({
      projeId: ajan.projeId,
      ajanId: ajan.id,
      tur: "butce",
      baslik: `${ajan.ad} · günlük bütçe doldu`,
      ayrinti: `Bugün $${ajan.bugunHarcananUsd.toFixed(2)} harcandı, sınır $${ajan.gunlukButceUsd.toFixed(2)}. Onaylarsanız sınır %50 artar.`,
      veri: { ajanId: ajan.id, eskiSinir: ajan.gunlukButceUsd },
      sonGecerlilik: null,
    });
    this.olaylar.yayinla({ tur: "onay.yeni", onay });
    this.projeYayinla(ajan.projeId);
  }

  /** Kurulun onay kararı */
  async onayKarari(onayId: string, karar: "onayla" | "reddet", not?: string): Promise<Onay> {
    const onay = this.depo.onay(onayId);
    if (!onay) throw bulunamadi("Onay");
    if (onay.durum !== "bekliyor") throw new ArnorgHatasi("Bu onay zaten sonuçlanmış.", 409);
    const izin = karar === "onayla";
    const temizNot = not?.trim() || null;
    const son = this.depo.onaySonuclandir(onayId, izin ? "onaylandi" : "reddedildi", temizNot);
    this.olaylar.yayinla({ tur: "onay.sonuc", onay: son });
    const bekleyen = this.bekleyenKararlar.get(onayId);
    if (bekleyen) bekleyen.coz({ izin, not: temizNot });

    try {
      if (onay.tur === "ise_alim") await this.iseAlimSonucu(onay, izin, temizNot);
      else if (onay.tur === "butce" && izin) this.butceArtir(onay);
      else if (onay.tur === "birlestirme") await this.birlestirmeSonucu(onay, izin, temizNot);
    } catch (h) {
      this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: onay.projeId });
    }
    this.projeYayinla(onay.projeId);
    return this.depo.onay(onayId)!;
  }

  private async iseAlimSonucu(onay: Onay, izin: boolean, not: string | null): Promise<void> {
    const veri = onay.veri as AjanIseAlIstegi & { yoneticiAd?: string | null };
    const teklifEden = onay.ajanId ? this.depo.ajan(onay.ajanId) : null;
    if (!izin) {
      if (teklifEden) await this.sistemMesaji(teklifEden.id, `İşe alım teklifin reddedildi: ${veri.ad} (${veri.rol}).${not ? ` Kurulun notu: ${not}` : ""}`);
      return;
    }
    let yoneticiId = veri.yoneticiId ?? null;
    if (veri.yoneticiAd) yoneticiId = this.depo.ajanAdla(onay.projeId, veri.yoneticiAd)?.id ?? yoneticiId;
    const yeni = this.iseAl(onay.projeId, { ...veri, yoneticiId: yoneticiId ?? teklifEden?.id ?? null });
    this.kanalMesaji(onay.projeId, "genel", { id: "arnorg", ad: "ArnOrg" }, `${yeni.ad} (${yeni.rolAdi}) ekibe katıldı.`);
    this.hafiza.yaz(
      onay.projeId,
      { tur: "uzmanlik", baslik: `${yeni.ad} · ${yeni.rolAdi}`, metin: kisalt(onay.ayrinti.split("\n\n")[0] ?? onay.ayrinti, 600), etiketler: [yeni.rol], onem: 3 },
      { ajan: null, ad: "ArnOrg" },
    );
    if (teklifEden) await this.sistemMesaji(teklifEden.id, `İşe alım onaylandı: ${yeni.ad} (${yeni.rolAdi}) ekipte.${not ? ` Kurulun notu: ${not}` : ""} Görev atayıp 'calisiliyor' durumuna aldığında çalışmaya başlar.`);
  }

  private butceArtir(onay: Onay): void {
    const veri = onay.veri as { ajanId: string; eskiSinir: number };
    const a = this.depo.ajan(veri.ajanId);
    if (!a) return;
    const yeni = Math.max(a.gunlukButceUsd * 1.5, a.bugunHarcananUsd + 1);
    this.depo.ajanGuncelle(a.id, { gunlukButceUsd: Math.round(yeni * 100) / 100 });
    this.butceOnayiIstendi.delete(`${a.id}:${bugun()}`);
    this.ajanYayinla(a.id);
    void this.sistemMesaji(a.id, `Günlük bütçen $${yeni.toFixed(2)} oldu. Kaldığın yerden devam et.`).catch(() => undefined);
  }

  private async birlestirmeSonucu(onay: Onay, izin: boolean, not: string | null): Promise<void> {
    const veri = onay.veri as { ajanId: string; dal: string; ozet: string; isteyenId?: string };
    const sahip = this.depo.ajan(veri.ajanId);
    const isteyen = veri.isteyenId ? this.depo.ajan(veri.isteyenId) : sahip;
    if (!izin) {
      if (isteyen) await this.sistemMesaji(isteyen.id, `${veri.dal} birleştirmesi reddedildi.${not ? ` Not: ${not}` : ""}`);
      return;
    }
    const proje = this.proje(onay.projeId);
    const mevcut = await gitIslemleri.mevcutDal(proje.yol);
    if (mevcut !== proje.varsayilanDal) throw new ArnorgHatasi(`Ana repo ${proje.varsayilanDal} dalında değil (${mevcut}). Birleştirme yapılmadı.`, 409);
    // ArnOrg'un kendi kayıtları (.arnorg) birleştirmeyi engellemesin
    await this.arnorgCommitle(proje.id).catch(() => false);
    const kirli = (await gitIslemleri.git(proje.yol, ["status", "--porcelain", "--untracked-files=no"])).trim();
    if (kirli) throw new ArnorgHatasi("Ana repoda commit'lenmemiş değişiklik var; birleştirme yapılmadı.", 409);
    const sonuc = await gitIslemleri.birlestir(proje.yol, veri.dal, `ArnOrg: ${veri.dal} birleştirildi\n\n${veri.ozet}`);
    if (sonuc.basarili) {
      for (const g of this.depo.gorevler(proje.id)) {
        if (g.atananId === veri.ajanId && g.durum === "inceleme") await this.gorevGuncelle(g.id, { durum: "tamam" });
      }
      this.kanalMesaji(proje.id, "genel", { id: "arnorg", ad: "ArnOrg" }, `${veri.dal} ${proje.varsayilanDal} dalına birleştirildi. ${kisalt(veri.ozet, 200)}`);
      this.hafiza.yaz(
        proje.id,
        { tur: "ozet", baslik: `${veri.dal} → ${proje.varsayilanDal}`, metin: kisalt(veri.ozet, 800), etiketler: ["birlestirme"], onem: 2 },
        { ajan: sahip, ad: "ArnOrg" },
      );
    } else if (sahip) {
      await this.sistemMesaji(
        sahip.id,
        `${veri.dal} dalı ${proje.varsayilanDal} ile çakıştı ve birleştirilemedi. Dalına ${proje.varsayilanDal}'i al (git merge ${proje.varsayilanDal}), çakışmaları çöz, testleri çalıştır, commit'le ve yeniden birlestirme_iste.`,
      );
    }
  }

  // ===================================================================
  // Görevler
  // ===================================================================

  /**
   * Görev mesajı: tanım, bağımlılıklar, göreve bağlı ve ilgili hafıza, görev hakkında sorulup yanıtlananlar.
   * Görev başka birinden devralınıyorsa önceki sahibin defteri de eklenir; iş kaldığı yerden sürer.
   */
  gorevMetni(g: Gorev, oncekiSahipId: string | null = null): string {
    const bagimli = g.bagimliliklar
      .map((id) => this.depo.gorev(id))
      .filter(Boolean)
      .map((b) => `${b!.kod} ${b!.baslik} (${b!.durum})`);
    const bagli = this.depo.hafizaKayitlari(g.projeId, { sinir: 500 }).filter((k) => k.gorevId === g.id);
    const bagliMetin = bagli.length
      ? ["\nBu görevle ilgili hafıza:", ...bagli.slice(0, 6).map((k) => `- [${HAFIZA_TURU_ADLARI[k.tur]}] ${k.baslik}: ${kisalt(k.metin, 260)} (${k.kaynakAd})`)].join("\n")
      : "";
    const ilgili = this.hafiza.ilgili(g.projeId, `${g.baslik} ${g.aciklama} ${g.etiket}`, 5, new Set(bagli.map((k) => k.id)));
    const kodDeseni = new RegExp(`\\b${g.kod}\\b`);
    const sorular = this.depo
      .sorular(g.projeId, { durum: "yanitlandi", sinir: 200 })
      .filter((x) => kodDeseni.test(x.soru) || kodDeseni.test(x.yanit ?? ""))
      .slice(0, 3);
    const onceki = oncekiSahipId && oncekiSahipId !== g.atananId ? this.depo.ajan(oncekiSahipId) : null;
    const defter = onceki ? this.hafiza.defter(onceki) : "";
    return [
      `Görev ${g.kod}: ${g.baslik}`,
      g.aciklama ? `\n${g.aciklama}` : "",
      g.kabulOlcutu ? `\nKabul ölçütü:\n${g.kabulOlcutu}` : "",
      bagimli.length ? `\nBağımlı olduğu görevler: ${bagimli.join(", ")}` : "",
      onceki
        ? `\nDevir: bu görevde daha önce ${onceki.ad} (${onceki.rolAdi}) çalıştı${onceki.dal ? `, dalı ${onceki.dal}` : ""}. Kaldığı yerden sür; belirsiz bir şey olursa ajana_sor ile ona sor.${defter ? `\n${onceki.ad} defterinden:\n${kisalt(defter, 1500)}` : ""}`
        : "",
      bagliMetin,
      ilgili ? `\n${ilgili}` : "",
      sorular.length ? ["\nBu görev hakkında sorulup yanıtlananlar:", ...sorular.map((x) => `- ${x.soranAd} → ${x.soruluAd}: ${kisalt(x.soru, 160)} | ${kisalt(x.yanit ?? "", 260)}`)].join("\n") : "",
      "\nİşe başlamadan ilgili notları oku. İş bitince testleri çalıştır, commit'le, gorev_guncelle ile görevi 'inceleme' durumuna al ve ne yaptığını kısaca yaz.",
    ].join("\n");
  }

  gorevOlustur(projeId: string, istek: GorevOlusturIstegi, olusturanId: string | null = null): Gorev {
    this.proje(projeId);
    const baslik = istek.baslik?.trim();
    if (!baslik) throw new ArnorgHatasi("Görev başlığı gerekli.");
    if (istek.atananId) {
      const a = this.depo.ajan(istek.atananId);
      if (!a || a.projeId !== projeId) throw bulunamadi("Atanan ajan");
    }
    const bagimliliklar = (istek.bagimliliklar ?? []).map((b) => {
      const g = this.depo.gorevKoduyla(projeId, b);
      if (!g) throw new ArnorgHatasi(`Bağımlı görev bulunamadı: ${b}`);
      return g.id;
    });
    const durum = istek.durum && istek.durum !== "calisiliyor" ? istek.durum : "bekleyen";
    const gorev = this.depo.gorevEkle({
      projeId,
      baslik,
      aciklama: istek.aciklama?.trim() ?? "",
      kabulOlcutu: istek.kabulOlcutu?.trim() ?? "",
      durum,
      atananId: istek.atananId ?? null,
      bagimliliklar,
      etiket: istek.etiket?.trim() ?? "",
      olusturanId,
    });
    this.olaylar.yayinla({ tur: "gorev.guncellendi", gorev });
    this.projeYayinla(projeId);
    return gorev;
  }

  async gorevGuncelle(id: string, istek: GorevGuncelleIstegi, kaynakAjanId: string | null = null): Promise<Gorev> {
    const eski = this.depo.gorev(id);
    if (!eski) throw bulunamadi("Görev");
    if (istek.atananId) {
      const a = this.depo.ajan(istek.atananId);
      if (!a || a.projeId !== eski.projeId) throw bulunamadi("Atanan ajan");
    }
    let bagimliliklar: string[] | undefined;
    if (istek.bagimliliklar) {
      bagimliliklar = istek.bagimliliklar.map((b) => {
        const g = this.depo.gorevKoduyla(eski.projeId, b);
        if (!g) throw new ArnorgHatasi(`Bağımlı görev bulunamadı: ${b}`);
        if (g.id === id) throw new ArnorgHatasi("Görev kendine bağımlı olamaz.");
        return g.id;
      });
    }
    const yeniDurum = istek.durum;
    if (yeniDurum && yeniDurum !== eski.durum) {
      if (!GOREV_GECISLERI[eski.durum].includes(yeniDurum)) {
        throw new ArnorgHatasi(`${eski.kod}: ${eski.durum} → ${yeniDurum} geçişine izin yok.`, 409);
      }
      if (yeniDurum === "calisiliyor") {
        const bitmemis = (bagimliliklar ?? eski.bagimliliklar).map((b) => this.depo.gorev(b)).filter((g) => g && g.durum !== "tamam");
        if (bitmemis.length) throw new ArnorgHatasi(`${eski.kod} başlayamaz; bitmemiş bağımlılık: ${bitmemis.map((g) => g!.kod).join(", ")}`, 409);
        if (!(istek.atananId ?? eski.atananId)) throw new ArnorgHatasi(`${eski.kod} başlamadan önce bir çalışana atanmalı.`, 409);
      }
    }
    const gorev = this.depo.gorevGuncelle(id, {
      baslik: istek.baslik?.trim() || undefined,
      aciklama: istek.aciklama,
      kabulOlcutu: istek.kabulOlcutu,
      durum: yeniDurum,
      atananId: istek.atananId,
      bagimliliklar,
      etiket: istek.etiket,
    });
    this.olaylar.yayinla({ tur: "gorev.guncellendi", gorev });
    this.projeYayinla(gorev.projeId);

    const durumDegisti = yeniDurum && yeniDurum !== eski.durum;
    const atamaDegisti = istek.atananId !== undefined && istek.atananId !== eski.atananId;
    if (gorev.durum === "calisiliyor" && gorev.atananId && (durumDegisti || atamaDegisti) && gorev.atananId !== kaynakAjanId) {
      await this.gorevBaslat(gorev, atamaDegisti ? eski.atananId : null).catch((h) =>
        this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: `${gorev.kod} başlatılamadı: ${(h as Error).message}`, projeId: gorev.projeId }),
      );
    }
    if (durumDegisti && gorev.durum === "inceleme") await this.incelemeyeBildir(gorev).catch(() => undefined);
    if (durumDegisti && gorev.durum === "tamam") await this.gorevBitti(gorev).catch(() => undefined);
    return gorev;
  }

  private async gorevBaslat(g: Gorev, oncekiSahipId: string | null = null): Promise<void> {
    if (!g.atananId) return;
    this.depo.ajanGuncelle(g.atananId, { gorevId: g.id });
    const oturum = this.oturumlar.get(g.atananId);
    const metin = oturum?.acik ? `Yeni görev atandı.\n\n${this.gorevMetni(g, oncekiSahipId)}` : this.gorevMetni(g, oncekiSahipId);
    await this.ajanaMesaj(g.atananId, metin, "next", { tur: "sistem" });
  }

  private async incelemeyeBildir(g: Gorev): Promise<void> {
    const ajanlar = this.depo.ajanlar(g.projeId);
    const sahip = g.atananId ? this.depo.ajan(g.atananId) : null;
    const inceleyici = ajanlar.find((a) => a.rol === "inceleme" && a.id !== g.atananId);
    const hedef = inceleyici ?? ajanlar.find((a) => a.rol === "ceo");
    if (!hedef) return;
    const dal = sahip?.dal ? ` Dal: ${sahip.dal}.` : "";
    await this.uyandir(hedef.id, `${g.kod} "${g.baslik}" incelemeye hazır (${sahip?.ad ?? "atanmamış"}).${dal} ${inceleyici ? "calisma_farki ile değişiklikleri, calisma_dosyasi ile dosyaları oku; sorun yoksa birlestirme_iste ile kurul onayına sun, varsa görevi 'calisiliyor' durumuna geri al ve sahibine yaz." : "calisma_farki ile değişiklikleri incele (gerekirse calisma_dosyasi ile dosya oku); uygunsa birlestirme_iste ile kurula sun, değilse görevi 'calisiliyor' durumuna geri al ve sahibine yaz. Sık inceleme gerekiyorsa bir kod inceleyici almayı değerlendir."}`, null);
  }

  private async gorevBitti(g: Gorev): Promise<void> {
    const sahip = g.atananId ? this.depo.ajan(g.atananId) : null;
    this.hafiza.yaz(
      g.projeId,
      {
        tur: "ozet",
        baslik: `${g.kod} ${g.baslik}`,
        metin: [`${sahip?.ad ?? "Ekip"} tamamladı.`, g.kabulOlcutu ? `Kabul ölçütü: ${kisalt(g.kabulOlcutu, 300)}` : "", g.aciklama ? kisalt(g.aciklama, 300) : ""]
          .filter(Boolean)
          .join(" "),
        gorevId: g.id,
        etiketler: g.etiket ? [g.etiket] : [],
        onem: 2,
      },
      { ajan: sahip, ad: "ArnOrg" },
    );
    // Bağımlılığı tamamlanan ve atanmış görevleri otomatik başlat
    for (const d of this.depo.gorevler(g.projeId)) {
      if (!d.bagimliliklar.includes(g.id) || !d.atananId) continue;
      if (d.durum !== "planlandi" && d.durum !== "bekleyen") continue;
      const hazir = d.bagimliliklar.every((b) => this.depo.gorev(b)?.durum === "tamam");
      if (hazir) await this.gorevGuncelle(d.id, { durum: "calisiliyor" });
    }
    // Ekip boşa düştüyse CEO'yu uyandır
    const gorevler = this.depo.gorevler(g.projeId);
    const suren = gorevler.some((x) => x.durum === "calisiliyor" || x.durum === "inceleme");
    const ceo = this.depo.ajanlar(g.projeId).find((a) => a.rol === "ceo");
    if (!suren && ceo) {
      await this.uyandir(ceo.id, `${g.kod} tamamlandı ve şu an çalışılan görev yok. Durumu değerlendir: sıradaki işleri planla ve ata ya da kurula #genel'de rapor ver.`, null);
    }
  }

  // ===================================================================
  // Kanallar ve uyandırma
  // ===================================================================

  /** Ajan ya da sistemden gelen uyandırma; döngü koruması uygular */
  async uyandir(aliciId: string, metin: string, gonderen: Ajan | null): Promise<boolean> {
    const alici = this.depo.ajan(aliciId);
    if (!alici) return false;
    if (gonderen) {
      const simdiMs = Date.now();
      const liste = (this.uyandirmalar.get(aliciId) ?? []).filter((t) => simdiMs - t < UYANDIRMA_PENCERESI_MS);
      if (liste.length >= UYANDIRMA_SINIRI && !this.oturumlar.get(aliciId)?.acik) {
        this.olaylar.yayinla({
          tur: "bildirim",
          seviye: "uyari",
          metin: `${alici.ad} son 10 dakikada çok sık uyandırıldı; ${gonderen.ad}'in mesajı kanalda bırakıldı, ajan uyandırılmadı.`,
          projeId: alici.projeId,
        });
        return false;
      }
      liste.push(simdiMs);
      this.uyandirmalar.set(aliciId, liste);
    }
    const kaynak: MesajKaynagi = gonderen ? { tur: "ajan", ad: gonderen.ad, id: gonderen.id } : { tur: "sistem" };
    try {
      await this.ajanaMesaj(aliciId, metin, "next", kaynak);
      return true;
    } catch (h) {
      this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: `${alici.ad} uyandırılamadı: ${(h as Error).message}`, projeId: alici.projeId });
      return false;
    }
  }

  private async sistemMesaji(ajanId: string, metin: string): Promise<void> {
    await this.uyandir(ajanId, metin, null);
  }

  kanalMesaji(projeId: string, kanal: string, gonderen: { id: string; ad: string }, metin: string, anilanlar: string[] = []): Mesaj {
    const mesaj = this.depo.mesajEkle({ projeId, kanal, gonderenId: gonderen.id, gonderenAd: gonderen.ad, metin, anilanlar });
    this.olaylar.yayinla({ tur: "mesaj.yeni", mesaj });
    return mesaj;
  }

  anilanlariBul(projeId: string, metin: string): Ajan[] {
    const sonuc: Ajan[] = [];
    for (const m of metin.matchAll(/@([\p{L}\p{N}_.-]+)/gu)) {
      const a = this.depo.ajanAdla(projeId, m[1]!);
      if (a && !sonuc.some((x) => x.id === a.id)) sonuc.push(a);
    }
    return sonuc;
  }

  /** Kurulun ya da bir ajanın kanala yazdığı mesaj; anılanlar uyanır */
  async mesajGonder(projeId: string, kanal: string, gonderenId: string, metin: string): Promise<Mesaj> {
    this.proje(projeId);
    const temizKanal = kanal.trim().replace(/^#/, "").toLowerCase();
    if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(temizKanal)) throw new ArnorgHatasi("Geçersiz kanal adı.");
    const gonderenAjan = gonderenId === KURUL ? null : this.depo.ajan(gonderenId);
    const govde = (gonderenAjan ? emojiAyikla(metin) : metin).trim();
    if (!govde) throw new ArnorgHatasi("Mesaj boş olamaz.");
    if (gonderenId !== KURUL && !gonderenAjan) throw bulunamadi("Gönderen");
    const anilanlar = this.anilanlariBul(projeId, govde).filter((a) => a.id !== gonderenId);
    const mesaj = this.kanalMesaji(
      projeId,
      temizKanal,
      { id: gonderenId, ad: gonderenAjan?.ad ?? "Yönetim kurulu" },
      govde,
      anilanlar.map((a) => a.id),
    );
    let alicilar = anilanlar;
    if (!gonderenAjan && temizKanal === "genel" && !alicilar.length) {
      const ceo = this.depo.ajanlar(projeId).find((a) => a.rol === "ceo");
      if (ceo) alicilar = [ceo];
    }
    const etiket = `#${temizKanal} · ${gonderenAjan?.ad ?? "Yönetim kurulu"}: ${govde}`;
    for (const a of alicilar) {
      if (gonderenAjan) await this.uyandir(a.id, etiket, gonderenAjan);
      else await this.ajanaMesaj(a.id, etiket, "next", { tur: "kurul" }).catch((h) => this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId }));
    }
    return mesaj;
  }

  // ===================================================================
  // Hafıza, defter ve ajanlar arası sorular
  // ===================================================================

  hafizaYaz(projeId: string, istek: HafizaYazIstegi, ajanId: string | null): HafizaKaydi {
    this.proje(projeId);
    const ajan = ajanId ? this.ajan(ajanId) : null;
    if (ajan && ajan.projeId !== projeId) throw new ArnorgHatasi("Ajan bu projede değil.", 403);
    return this.hafiza.yaz(projeId, istek, { ajan, ad: ajan ? undefined : "Yönetim kurulu" });
  }

  defterYaz(ajanId: string, icerik: string): void {
    const a = this.ajan(ajanId);
    this.hafiza.defterYaz(a, icerik);
    const iz = this.defterIzleri.get(ajanId) ?? { arac: 0, yazildi: false };
    this.defterIzleri.set(ajanId, { arac: iz.arac, yazildi: true });
  }

  /**
   * Bir ajan diğerine soru sorar ve yanıtı bekler. Sorulan ajan soruyu_yanitla ile yanıtlar.
   * Hedef verilmezse ArnOrg hafızaya, görevlere, geçmiş yanıtlara ve rollere bakıp uzmanı seçer.
   * Aynı soru son 30 günde yanıtlandıysa meslektaş yeniden uyandırılmaz (yeniden: true ile zorlanır).
   * Karşılıklı bekleme (A, B'yi beklerken B'nin A'ya sorması) hemen reddedilir.
   */
  async ajanaSor(soranId: string, hedefAd: string | null, soru: string, bekleDk = 10, secenek: { yeniden?: boolean } = {}): Promise<SoruSonucu> {
    const soran = this.ajan(soranId);
    const metin = soru.trim();
    if (metin.length < 5 || metin.length > 4000) throw new ArnorgHatasi("Soru 5–4000 karakter olmalı.");
    const ad = hedefAd?.replace(/^@/, "").trim() ?? "";
    const secim = ad ? { ajan: this.depo.ajanAdla(soran.projeId, ad), neden: undefined } : uzmanBul(this.depo, soran, metin);
    const hedef = secim?.ajan;
    const yonlendirme = secim?.neden;
    if (!hedef) throw new ArnorgHatasi(ad ? `"${ad}" adında çalışan yok.` : "Projede soracak başka çalışan yok.", 404);
    if (hedef.id === soran.id) throw new ArnorgHatasi("Kendine soru soramazsın.");
    if (!secenek.yeniden) {
      const onceki = oncekiYanit(this.depo, soran.projeId, metin);
      if (onceki) return { ...onceki, onceki: true };
    }
    const karsilikli = this.depo.sorular(soran.projeId, { soruluId: soran.id, durum: "bekliyor" }).some((s) => s.soranId === hedef.id);
    if (karsilikli) throw new ArnorgHatasi(`${hedef.ad} şu an senden yanıt bekliyor; önce onun sorusunu soruyu_yanitla ile yanıtla.`, 409);
    const kayit = this.depo.soruEkle({ projeId: soran.projeId, soranId: soran.id, soranAd: soran.ad, soruluId: hedef.id, soruluAd: hedef.ad, soru: metin });
    this.olaylar.yayinla({ tur: "soru.guncellendi", soru: kayit });
    const sure = Math.min(Math.max(bekleDk, 1), 30) * 60_000;
    const yanit = new Promise<AjanSorusu>((coz) => {
      const zamanlayici = setTimeout(() => {
        this.bekleyenSorular.delete(kayit.id);
        const son = this.depo.soruSonuclandir(kayit.id, "zaman_asimi", null) ?? kayit;
        this.olaylar.yayinla({ tur: "soru.guncellendi", soru: son });
        coz(son);
      }, sure);
      zamanlayici.unref();
      this.bekleyenSorular.set(kayit.id, { coz, zamanlayici });
    });
    const uyandi = await this.uyandir(
      hedef.id,
      `${soran.ad} sana soruyor (soru ${kayit.id})${yonlendirme ? ` — ArnOrg soruyu sana yönlendirdi: ${yonlendirme}` : ""}:\n${metin}\n\nYanıtını mcp__arnorg__soruyu_yanitla ile ver (soru_id: ${kayit.id}). Bilmiyorsan bildiğin kadarını ve kimin bilebileceğini yaz. Yanıttan sonra üzerinde çalıştığın bir görev varsa ona dön; yoksa yeni iş açma, dur.`,
      soran,
    );
    if (!uyandi) {
      const b = this.bekleyenSorular.get(kayit.id);
      if (b) {
        clearTimeout(b.zamanlayici);
        this.bekleyenSorular.delete(kayit.id);
      }
      const son = this.depo.soruSonuclandir(kayit.id, "zaman_asimi", null) ?? kayit;
      this.olaylar.yayinla({ tur: "soru.guncellendi", soru: son });
      return { ...son, yonlendirme };
    }
    return { ...(await yanit), yonlendirme };
  }

  /**
   * Toplantı: çağıran gündemi verir, katılımcıların görüşü paralel toplanır (ajanlar arası soru olarak),
   * konuşma #toplanti kanalına yazılır, özet hafızaya düşer. Katılımcı verilmezse ArnOrg konuya en yakın
   * en çok üç çalışanı seçer. Kararı çağıran verir.
   */
  async toplantiYap(cagiranId: string, gundem: string, katilimciAdlari: string[] | null, bekleDk = 8): Promise<ToplantiSonucu> {
    const cagiran = this.ajan(cagiranId);
    const pid = cagiran.projeId;
    const metin = gundem.trim();
    if (metin.length < 10 || metin.length > 3000) throw new ArnorgHatasi("Gündem 10–3000 karakter olmalı.");
    let katilimcilar: { ajan: Ajan; neden: string | null }[] = [];
    if (katilimciAdlari?.length) {
      for (const ham of katilimciAdlari) {
        const ad = ham.replace(/^@/, "").trim();
        const a = this.depo.ajanAdla(pid, ad);
        if (!a) throw new ArnorgHatasi(`"${ad}" adında çalışan yok.`, 404);
        if (a.id !== cagiran.id && !katilimcilar.some((k) => k.ajan.id === a.id)) katilimcilar.push({ ajan: a, neden: null });
      }
    } else {
      katilimcilar = uzmanlariSirala(this.depo, cagiran, metin)
        .filter((x) => x.puan >= 1)
        .slice(0, 3)
        .map((x) => ({ ajan: x.ajan, neden: x.neden }));
      if (!katilimcilar.length) {
        const yedek = this.depo.ajanlar(pid).filter((a) => a.id !== cagiran.id && a.durum !== "duraklatildi" && (a.rol === "cto" || a.id === cagiran.yoneticiId));
        katilimcilar = yedek.slice(0, 2).map((a) => ({ ajan: a, neden: "konuda belirgin bir uzman yok" }));
      }
    }
    katilimcilar = katilimcilar.slice(0, 6);
    if (!katilimcilar.length) throw new ArnorgHatasi("Toplantıya çağrılacak çalışan bulunamadı; katilimcilar alanında ad ver.", 404);

    this.kanalMesaji(
      pid,
      "toplanti",
      { id: cagiran.id, ad: cagiran.ad },
      `Toplantı: ${metin}\nKatılımcılar: ${katilimcilar.map((k) => `@${k.ajan.ad}`).join(" ")}`,
      katilimcilar.map((k) => k.ajan.id),
    );
    const soru = `Toplantı (${cagiran.ad} çağırdı): ${metin}\n\nGörüşünü kısa ver: önerin, gerekçen, gördüğün risk. Başkalarının görüşünü bekleme; karar ${cagiran.ad}'da.`;
    const gorusler = await Promise.all(
      katilimcilar.map(async ({ ajan, neden }): Promise<ToplantiGorusu> => {
        const temel = { ajanId: ajan.id, ad: ajan.ad, rolAdi: ajan.rolAdi, neden };
        try {
          const s = await this.ajanaSor(cagiran.id, ajan.ad, soru, bekleDk, { yeniden: true });
          if (s.durum === "yanitlandi" && s.yanit) {
            this.kanalMesaji(pid, "toplanti", { id: ajan.id, ad: ajan.ad }, s.yanit);
            return { ...temel, gorus: s.yanit, durum: "yanitlandi" };
          }
          return { ...temel, gorus: null, durum: "zaman_asimi" };
        } catch (h) {
          return { ...temel, gorus: null, durum: "katilamadi", hata: (h as Error).message };
        }
      }),
    );
    const ozet = gorusler.map((g) => `${g.ad} (${g.rolAdi}): ${g.gorus ? kisalt(g.gorus, 400) : g.durum === "zaman_asimi" ? "süre içinde yanıt vermedi" : `katılamadı (${g.hata ?? ""})`}`).join("\n");
    const kayit = this.hafiza.yaz(pid, { tur: "ozet", baslik: `Toplantı: ${kisalt(metin, 120)}`, metin: `Çağıran: ${cagiran.ad}\n${ozet}`, onem: 2 }, { ajan: cagiran });
    return { gundem: metin, gorusler, kayitId: kayit.id };
  }

  soruYanitla(ajanId: string, soruId: string, yanit: string): AjanSorusu {
    const a = this.ajan(ajanId);
    const soru = this.depo.soru(soruId);
    if (!soru || soru.projeId !== a.projeId) throw new ArnorgHatasi("Soru bulunamadı.", 404);
    if (soru.soruluId !== a.id) throw new ArnorgHatasi(`Bu soru ${soru.soruluAd}'a soruldu.`, 403);
    if (soru.durum !== "bekliyor") throw new ArnorgHatasi("Bu soru artık yanıt beklemiyor (süre dolmuş olabilir). Yanıtı mesaj_gonder ile ilet.", 409);
    const metin = yanit.trim();
    if (!metin) throw new ArnorgHatasi("Yanıt boş olamaz.");
    const son = this.depo.soruSonuclandir(soru.id, "yanitlandi", kisalt(metin, 6000))!;
    const b = this.bekleyenSorular.get(soru.id);
    if (b) {
      clearTimeout(b.zamanlayici);
      this.bekleyenSorular.delete(soru.id);
      b.coz(son);
    }
    this.olaylar.yayinla({ tur: "soru.guncellendi", soru: son });
    return son;
  }

  /** ArnOrg'un kendi kayıtlarının (.arnorg) gecikmeli commit'i; ana repoyu temiz tutar */
  private arnorgCommitPlanla(projeId: string): void {
    const z = this.arnorgCommitZamanlayicilari.get(projeId);
    if (z) clearTimeout(z);
    const yeni = setTimeout(() => {
      this.arnorgCommitZamanlayicilari.delete(projeId);
      void this.arnorgCommitle(projeId).catch(() => undefined);
    }, 90_000);
    yeni.unref();
    this.arnorgCommitZamanlayicilari.set(projeId, yeni);
  }

  /** Yalnız .arnorg yolunu commit'ler; kullanıcının diğer değişikliklerine dokunmaz */
  async arnorgCommitle(projeId: string): Promise<boolean> {
    const proje = this.depo.proje(projeId);
    if (!proje || !fs.existsSync(path.join(proje.yol, ".arnorg"))) return false;
    if ((await gitIslemleri.mevcutDal(proje.yol)) !== proje.varsayilanDal) return false;
    const durum = (await gitIslemleri.git(proje.yol, ["status", "--porcelain", "--", ".arnorg"])).trim();
    if (!durum) return false;
    await gitIslemleri.kimlikGuvenceAltinaAl(proje.yol);
    await gitIslemleri.git(proje.yol, ["add", "-A", "--", ".arnorg"]);
    await gitIslemleri.git(proje.yol, ["commit", "-m", "ArnOrg: ekip, hafıza ve not kayıtları", "--", ".arnorg"]);
    return true;
  }

  // ===================================================================
  // Maliyet
  // ===================================================================

  maliyetOzeti(projeId: string): MaliyetOzeti {
    this.proje(projeId);
    const ajanlar = this.depo.ajanlar(projeId);
    return {
      girisYontemi: this.yapilandirma.ayarlar.girisYontemi,
      bugunUsd: this.depo.projeMaliyeti(projeId, bugun()),
      toplamUsd: this.depo.projeMaliyeti(projeId),
      gunlukButceUsd: this.yapilandirma.ayarlar.gunlukButceUsd,
      bugunToken: this.depo.projeTokeni(projeId, bugun()),
      toplamToken: this.depo.projeTokeni(projeId),
      ajanlar: ajanlar.map((a) => ({
        ajanId: a.id,
        ad: a.ad,
        bugunUsd: a.bugunHarcananUsd,
        toplamUsd: a.toplamHarcananUsd,
        bugunToken: a.bugunToken,
        toplamToken: a.toplamToken,
      })),
      pencere: this.pencere,
    };
  }

  // ===================================================================
  // Kapanış
  // ===================================================================

  kapat(): void {
    this.hesap.durdur();
    this.hafiza.kapat();
    for (const z of this.arnorgCommitZamanlayicilari.values()) clearTimeout(z);
    for (const b of this.bekleyenSorular.values()) clearTimeout(b.zamanlayici);
    for (const o of this.oturumlar.values()) o.kapat();
    for (const z of this.bostaZamanlayicilari.values()) clearTimeout(z);
    for (const b of this.bekleyenKararlar.values()) {
      clearTimeout(b.zamanlayici);
      b.coz({ izin: false, not: "ArnOrg kapanıyor" });
    }
  }

  /** Başlangıç zamanı (sağlık kontrolü için) */
  readonly acilis = simdi();
}
