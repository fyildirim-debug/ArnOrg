// Şirket orkestratörü: projeler, ekip, ajan oturumları, denetim kapısı, onaylar, görev akışı ve kanallar
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { CanUseTool, HookJSONOutput, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import {
  AD_HARITALARI_EN,
  GOREV_DURUMLARI,
  GOREV_GECISLERI,
  ARNORG_GONDEREN,
  HAFIZA_TURU_ADLARI,
  ONAY_TURLERI,
  KURUL,
  kanalGorunenAdi,
  kanalKimligi,
  rolMetni,
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
  type Anayasa,
  type GorevOlusturIstegi,
  type HafizaKaydi,
  type HafizaYazIstegi,
  type HesapDurumu,
  type IzinModu,
  type Karar,
  type KararKaynagi,
  type KararVeren,
  type KullanimOzeti,
  type KurulBildirimi,
  type Mesaj,
  type MesajOnceligi,
  type Onay,
  type OnayTuru,
  type PolitikaKurali,
  type EsitlemeSonucu,
  type Proje,
  type ProjeDallari,
  type ProjeGuncelleIstegi,
  type ProjeOlusturIstegi,
  type ProjeOzeti,
} from "@arnorg/ortak";
import { AjanOturumu, type MesajKaynagi, type Toplam } from "./ajan-oturumu.js";
import { anayasaKisa, anayasaOku, anayasaPolitikasi, anayasaYaz, BOS_ANAYASA } from "./anayasa.js";
import { dil, dilKaynagi, iki } from "./dil.js";
import { claudeDamitici } from "./damitici.js";
import { KureselZeka, type Gozlem } from "./kuresel-zeka.js";
import type { KimlikSorunu } from "./kimlik-hatasi.js";
import { hatirlatmaMetni, talimatOlustur } from "./talimat.js";
import { AjanZekasiYoneticisi } from "./zeka.js";
import { GithubIslemleri, klasorAdiYap } from "./github.js";
import { HesapIzleyici } from "./hesap.js";
import { Kurulum } from "./kurulum.js";
import { ProjeHafizasi } from "./hafiza.js";
import { karakterBul, karakterMetni, karakterSec } from "@arnorg/ortak/karakterler";
import { Hatirlatici, oncekiYanit, tercihGibi, uzmanBul, uzmanlariSirala } from "./hatirlatici.js";
import { calisanMi, EsZamanlilik, siraAciklamasi, siraAciklamasiMi, type SiradakiMesaj } from "./es-zamanlilik.js";
import { GorevTavani } from "./gorev-tavani.js";
import {
  ceoKarari,
  ceoKendiNotu,
  ceoOnayListesi,
  ceoOnayMesaji,
  kararOznesi,
  kararSahibiEtiketi,
  kararVerenAdi,
  kipMesaji,
  kisaKimlik,
  KURUL_KARARI,
  notCumlesi,
  type KararSahibi,
} from "./karar-yetkisi.js";
import { MesaiyeDonus } from "./mesaiye-donus.js";
import { OzelKanallar } from "./ozel-kanallar.js";
import type { BrifingKaynagi, BrifingYaniti } from "@arnorg/ortak";
import { Brifing } from "./brifing.js";
import { ModelKataloguIzleyici, sdkModelOkuyucu } from "./model-katalogu.js";
import { aracAcik, kapaliClaudeAraclari, kapaliYetenekNedeni, yetenekleriDogrula } from "./yetenekler.js";
import { WebHizmeti } from "./web/index.js";
import { webDenetimGirdisi } from "./web/etiketler.js";

/** Ofis karakterinin kişiliği (talimat.ts) */
export { kisilikMetni } from "./talimat.js";

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
import { BirlestirmeKuyrugu, birlestirmeVerisi, kaliteAyarlari, kaliteDuyurusu, sureMetni } from "./birlestirme-kuyrugu.js";
import { KARAR_YETKISI_GOCU, type Depo } from "./depo.js";
import * as gitIslemleri from "./git.js";
import { KodZekasi, konumListesi } from "./kod-zekasi/index.js";
import type { OlayYolu } from "./olaylar.js";
import { degerlendir, girdiOzeti, imzaAyikla, varsayilanKurallar } from "./politika.js";
import { ekipDosyalariniOku, ekipDosyasiSil, ekipDosyasiYaz, iskeletOlustur } from "./proje-dosyalari.js";
import { rolAdiDilde, rolBul } from "./roller.js";
import type { Yapilandirma } from "./yapilandirma.js";
import { ArnorgHatasi, bugun, bulunamadi, bulunma, emojiAyikla, ilgi, kimlik, kisalt, sadelestir, simdi, yonelme } from "./yardimci.js";

const YAZMA_ARACLARI = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const SESSIZ_ARACLAR = new Set(["TodoWrite", "ToolSearch"]);
/** Boşta kalan oturum bu süre sonra kapatılır (kısa uyanış) */
const BOSTA_KAPATMA_MS = 10 * 60_000;
/** Ajanlardan gelen uyandırma sınırı (döngü koruması) */
const UYANDIRMA_PENCERESI_MS = 10 * 60_000;
const UYANDIRMA_SINIRI = 8;
/** Kurulun kaydettiği dosya bu süre ajanlara kilitli kalır */
const KULLANICI_KILIDI_MS = 30_000;
/** Dönemsel hatırlatma: bu kadar araç çağrısında ya da bu sürede bir */
const HATIRLATMA_ARAC_ARALIGI = 25;
const HATIRLATMA_SURE_MS = 30 * 60_000;

/** Kurulun (ya da tam otonom kipte CEO'nun) kararı; zamanAsimi: süre doldu (not metnine bakılmaz, not onayın açıldığı dilde yazılır) */
export interface KurulKarari {
  izin: boolean;
  not: string | null;
  zamanAsimi?: true;
  /** Kararı kim verdi: kurul, otomatik onay ya da CEO; süre dolunca ve kapanışta yok */
  kaynak?: KararKaynagi;
  /** Kararı verenin görünen adı (CEO'da ajanın adı) */
  verenAd?: string;
}

/** Tam otonom kipte CEO'nun kendi açtığı ve hemen geçerli olan onaylar (genel: kurula soru ve token tavanı kurula gider) */
const CEO_KENDI_KARARI: OnayTuru[] = ["ise_alim", "isten_cikarma", "anayasa", "birlestirme", "arac", "teslim"];
/** CEO bu durumdayken karar veremez; onaylar kurula düşer */
const CEO_KARAR_VEREMEZ: AjanDurumu[] = ["duraklatildi", "hata"];
/** CEO boşa çıkınca kendisini bu kadar süredir bekleyen onaylar (her biri bir kez) hatırlatılır */
const CEO_HATIRLATMA_MS = 2 * 60_000;

/** Denetim kaydında kararı veren (kural sütunu): "Yönetim kurulu", "Ada (CEO)", "Otomatik onay"; süre dolduysa "Süre doldu" */
function denetimKarari(k: KurulKarari): string {
  return k.zamanAsimi ? iki("Süre doldu", "Timed out") : kararSahibiEtiketi(k.kaynak, k.verenAd);
}

/** Ajana dönen ret metni: kim izin vermedi ve notu; süre dolduysa kimseyi anmaz */
function retMetni(k: KurulKarari): string {
  if (k.zamanAsimi) return iki("İzin verilmedi: karar süresi içinde gelmedi.", "Not allowed: no decision came in time.");
  const veren = kararVerenAdi(k.kaynak, k.verenAd);
  return iki(`${veren} izin vermedi.${k.not ? ` Not: ${k.not}` : ""}`, `${veren} did not allow it.${k.not ? ` Note: ${k.not}` : ""}`);
}

interface BekleyenKarar {
  coz: (sonuc: KurulKarari) => void;
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
  /** Yeni onayın ilk işlenişi (otomatik onay, CEO kararı ya da kurula bildirim); araç sonucunu bekleyebilsin diye */
  private readonly onayIsleri = new Map<string, Promise<void>>();
  /** CEO boşa çıkınca bir kez hatırlatılmış, onu bekleyen onaylar */
  private readonly ceoyaHatirlatilan = new Set<string>();
  private bostaZamanlayicilari = new Map<string, NodeJS.Timeout>();
  private uyandirmalar = new Map<string, number[]>();
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
  /** Kod tarayıcı, sembol ve bağımlılık haritası, anlamsal kod dizini */
  readonly kodZekasi: KodZekasi;
  /** Claude Code, git ve GitHub CLI kurulumu ve girişleri */
  readonly kurulum: Kurulum;
  /** GitHub depoları, klonlama ve uzak depoyla eşitleme */
  readonly github: GithubIslemleri;
  /** Her çalışanın kendi zekâsı: kişisel hafıza, sözler, beceriler, geçmiş, aktarım, bağlar */
  readonly zeka: AjanZekasiYoneticisi;
  /** Projelerden bağımsız, kendi kendine öğrenen standart kurallar */
  readonly kuresel: KureselZeka;
  /** Kimlik sorunu yüzünden duran ajanlar; Claude Code girişi hazır olunca sürdürülür */
  private readonly kimlikBekleyenler = new Set<string>();
  private sonKimlikBildirimi = 0;
  /** Ajanlar girişi beklerken durum arada bir okunur: terminalden yapılan giriş Stüdyo açık olmasa da yakalanır */
  private kimlikYoklayici: NodeJS.Timeout | null = null;
  /** Proje → ana yasa (dosyadan okunur, yazınca güncellenir) */
  private readonly anayasalar = new Map<string, Anayasa>();
  /** Ajan → talimatına giren ana yasa sürümü (değişince sonraki turda hatırlatılır) */
  private readonly anayasaSurumleri = new Map<string, number>();
  /** Dönemsel hatırlatma: ajan → araç sayısı ve son hatırlatma anı */
  private readonly hatirlatmaIzleri = new Map<string, { arac: number; son: number }>();
  /** Yazıyor göstergesi: ajan → kanal ve bitiş zamanlayıcısı */
  private readonly yaziyorlar = new Map<string, { projeId: string; kanal: string; zamanlayici: NodeJS.Timeout }>();
  private esitlemeZamanlayici: NodeJS.Timeout | null = null;
  /** Onaylanan birleştirmelerin proje başına sırası ve kalite kapısı (test geçerse ana repoda birleştirme) */
  readonly birlestirmeKuyrugu: BirlestirmeKuyrugu;
  /** Eşzamanlı ajan tavanı: tavan doluyken turu sürmeyen ajana gelen mesajların sırası (bütün projeler) */
  readonly esZamanlilik: EsZamanlilik<MesajKaynagi>;
  /** Görev token tavanı (aşınca ajan durur, kurula sorulur) ve tur tavanı bildirimi */
  readonly gorevTavani: GorevTavani;
  /** Açılışta mesaiye dönüş: kapanışta ya da çökmede çalışan ajanlar kaldıkları yerden sürer */
  readonly mesai: MesaiyeDonus;
  /** Kurulun kurduğu kanallar ve üyelerinin serbest konuşması (ozel-kanallar.ts, kanal-konusmasi.ts) */
  readonly kanallar: OzelKanallar;
  /** CEO brifingi: kurulun düğmesi ve her gün seçilen saatte otomatik brifing (brifing.ts) */
  readonly brifing: Brifing;
  /** Claude Code'un sunduğu modeller, sürümlü adlarıyla; rolün varsayılan modeli buna göre seçilir (model-katalogu.ts) */
  readonly modelKatalogu: ModelKataloguIzleyici;

  constructor(
    readonly depo: Depo,
    readonly olaylar: OlayYolu,
    readonly yapilandirma: Yapilandirma,
    private claudeYoluBulucu: () => string | null,
    /** Testlerde gerçek Claude Code oturumu açılmasını engeller */
    private readonly oturumlarKapali = false,
  ) {
    dilKaynagi(() => yapilandirma.ayarlar.dil);
    // Kapanış kaydı ve (çökmede) çalışan durumda kalan ajanlar durumlar sıfırlanmadan okunur
    this.mesai = new MesaiyeDonus(depo, depo.projeler().flatMap((p) => depo.ajanlar(p.id)));
    depo.ajanDurumlariniSifirla();
    depo.bekleyenAracOnaylariniKapat(iki("Uygulama yeniden başladı", "The app restarted"));
    depo.bekleyenSorulariKapat();
    this.hafiza = new ProjeHafizasi(depo, olaylar, (id) => this.proje(id), (pid) => this.arnorgCommitPlanla(pid));
    this.hatirlatici = new Hatirlatici(depo, this.hafiza);
    this.kodZekasi = new KodZekasi({
      veriDizini: yapilandirma.veriDizini,
      yayinla: (o) => olaylar.yayinla(o),
      alanYolu: (pid, alan) => this.alanYolu(pid, alan),
      projeler: () => depo.projeler().map((p) => ({ id: p.id, yol: p.yol })),
      ayarlar: () => yapilandirma.ayarlar,
    });
    // Dosya değişiklikleri dizini artımlı günceller; silinen ajanın alanı dizinden çıkar
    olaylar.dinle((o) => this.kodZekasi.olay(o));
    this.karakterleriTamamla();
    this.hesap = new HesapIzleyici(yapilandirma, olaylar, () => this.claudeYolu, () => this.acikOturumdanKullanim(), oturumlarKapali, () => this.hesabaAjanBekliyor());
    this.hesap.sinirDegisti = (sinir) => void this.kullanimSiniriDegisti(sinir);
    this.kurulum = new Kurulum(yapilandirma, olaylar, {
      claudeGirisiDegisti: () => void this.hesap.tazele().catch(() => undefined),
      // Giriş yeniden hazır (ArnOrg'dan ya da terminalden): kimlik sorunuyla duran ajanlar kaldıkları yerden sürer
      claudeHazir: () => this.kimlikSonrasiSurdur(),
    });
    this.github = new GithubIslemleri(this.kurulum, yapilandirma);
    this.zeka = new AjanZekasiYoneticisi(depo, olaylar, (id) => this.proje(id), (pid) => this.arnorgCommitPlanla(pid));
    // Gözlemler küçük modelle projeden bağımsız kurala damıtılır; testlerde ve oturumsuz kipte model çağrılmaz
    const damitici = oturumlarKapali ? null : claudeDamitici({ cwd: yapilandirma.veriDizini, claudeYolu: () => this.claudeYolu, izinli: () => !this.hesap.sinir });
    this.kuresel = new KureselZeka(depo, olaylar, yapilandirma.veriDizini, damitici);
    // Global zekâ gözlemleri: kurul tercihleri ve dersler kurala dönüşür
    olaylar.dinle((o) => this.zekaGozlemi(o));
    this.birlestirmeKuyrugu = new BirlestirmeKuyrugu({
      depo,
      olaylar,
      kaliteKoku: path.join(yapilandirma.veriDizini, "kalite"),
      arnorgCommitle: (pid) => this.arnorgCommitle(pid),
      birlesti: (onay) => this.birlesmeSonrasi(onay),
      sistemMesaji: (ajanId, metin) => this.sistemMesaji(ajanId, metin),
      duyur: (pid, metin) => this.duyur(pid, metin),
    });
    this.esZamanlilik = new EsZamanlilik<MesajKaynagi>({
      tavan: () => this.yapilandirma.ayarlar.esZamanliAjan,
      durum: (id) => this.depo.ajan(id)?.durum ?? null,
      calisanSayisi: () => this.depo.projeler().reduce((t, p) => t + this.depo.ajanlar(p.id).filter((a) => calisanMi(a.durum)).length, 0),
      teslimEt: (id, mesajlar) => this.siradanTeslim(id, mesajlar),
      siraDegisti: (id, sirada) => this.siraAciklamasiYaz(id, sirada),
    });
    // Kurulun kanalları: kurulun mesajına yanıt kurul kaynaklıdır (tavandan muaf); konuşma turu ArnOrg kaynaklıdır, tavana
    // ve abonelik sınırına uyar, döngü korumasına takılmaz
    this.kanallar = new OzelKanallar(depo, olaylar, {
      uyandir: (id, metin, kurul) =>
        kurul
          ? this.ajanaMesaj(id, metin, "next", { tur: "kurul" }).then(
              () => true,
              (h) => {
                this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: this.depo.ajan(id)?.projeId });
                return false;
              },
            )
          : this.uyandir(id, metin, null),
      // Turlar arası beklemede açılan gösterge uyandırmada yeniden açılmaz (söner-yanar titremesi olmasın)
      yaziyor: (id, _pid, kanal, acik) => {
        const a = this.depo.ajan(id);
        const y = this.yaziyorlar.get(id);
        if (acik && a && y?.kanal !== kanal) this.yaziyorBaslat(a, kanal);
        else if (!acik && y?.kanal === kanal) this.yaziyorBitir(id);
      },
      duyur: (pid, kanal, metin) => this.duyur(pid, metin, kanal),
      sinirda: () => Boolean(this.hesap.sinir),
      siradaMi: (id) => this.esZamanlilik.siradaMi(id),
      kurulMesaji: (pid, kanal, metin) => this.mesajGonder(pid, kanal, KURUL, metin),
    });
    olaylar.dinle((o) => this.kanallar.olay(o));
    this.gorevTavani = new GorevTavani({
      depo,
      temelTavan: () => this.yapilandirma.ayarlar.gorevTokenTavani,
      duraklat: (id, aciklama) => {
        const o = this.oturumlar.get(id);
        if (o?.acik) o.duraklat(aciklama);
        else this.durumDegisti(id, "duraklatildi", aciklama);
      },
      durumYaz: (id, durum, aciklama) => this.durumDegisti(id, durum, aciklama),
      onayAc: (ajan, baslik, ayrinti, veri) => this.teklifAc(ajan, "genel", baslik, ayrinti, veri),
      sistemMesaji: (id, metin) => void this.sistemMesaji(id, metin),
      akisNotu: (id, metin) => this.akisEkle(id, { id: kimlik(), ajanId: id, zaman: simdi(), tur: "sistem", metin }),
    });
    olaylar.dinle((o) => this.gorevTavani.olay(o));
    // Model kataloğu: testlerde ve oturumsuz kipte Claude Code açılmaz; liste önbellekten ya da sabit yedekten gelir
    this.modelKatalogu = new ModelKataloguIzleyici({
      depo,
      olaylar,
      okuyucu: oturumlarKapali ? null : sdkModelOkuyucu({ cwd: yapilandirma.veriDizini, claudeYolu: () => this.claudeYolu }),
    });
    this.brifing = new Brifing({
      depo,
      olaylar,
      gunluk: () => this.yapilandirma.ayarlar.gunlukBrifing,
      hesap: () => this.hesap.mevcut,
      // CEO kurul kaynağıyla uyanır (eşzamanlı tavandan muaf); #yonetim'de "yazıyor" görünür
      uyandir: async (ceo, metin) => {
        this.yaziyorBaslat(ceo, "yonetim");
        try {
          await this.ajanaMesaj(ceo.id, metin, "next", { tur: "kurul" });
        } catch (h) {
          this.yaziyorBitir(ceo.id);
          throw h;
        }
        if (!calisanMi(this.depo.ajan(ceo.id)?.durum)) this.yaziyorBitir(ceo.id);
      },
      erisilebilir: (p) => fs.existsSync(p.yol),
      hata: (p, h) =>
        this.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin: iki(`Günlük brifing istenemedi (${p.ad}): ${h.message}`, `Could not ask for the daily briefing (${p.ad}): ${h.message}`), projeId: p.id }),
    });
    if (!oturumlarKapali) {
      this.modelKatalogu.baslat();
      this.brifing.baslat();
    }
    // Yarım kalan ajanlar açılıştan ~30 sn sonra eşzamanlı tavana uyarak uyandırılır
    if (!oturumlarKapali) this.mesai.planla(() => void this.mesaiyeDon());
    this.kararYetkisiGocunuDuyur();
  }

  /** 0.0.7 güncellemesiyle karar yetkisi CEO'ya geçen projeler: #genel'e ve CEO sohbetine bir kez duyurulur */
  private kararYetkisiGocunuDuyur(): void {
    const kayit = this.depo.deger(KARAR_YETKISI_GOCU);
    if (!kayit) return;
    this.depo.degerYaz(KARAR_YETKISI_GOCU, "[]");
    let kimlikler: unknown = [];
    try {
      kimlikler = JSON.parse(kayit);
    } catch {
      return;
    }
    if (!Array.isArray(kimlikler)) return;
    for (const id of kimlikler) {
      const p = typeof id === "string" ? this.depo.proje(id) : null;
      if (!p || p.kararVeren !== "ceo") continue;
      const ceo = this.ceoBul(p.id);
      const metin = iki(
        `ArnOrg 0.0.7: karar yetkisi ${ceo ? `CEO ${yonelme(ceo.ad)}` : "CEO'ya"} geçti, şirket tam otonom. İzinler, birleştirmeler, işe alımlar ve öteki onaylar artık CEO'dan geçer; kurul sonuçları ve gerekçeleri Onaylar'da görür. Kararları yine siz vermek isterseniz: Proje ayarları → Karar yetkisi → Kurul karar verir.`,
        `ArnOrg 0.0.7: decision authority moved to ${ceo ? `CEO ${ceo.ad}` : "the CEO"}; the company is fully autonomous. Permissions, merges, hires and the other approvals now go through the CEO; the board sees the results and the reasons under Approvals. To keep deciding yourself: Project settings → Decision authority → The board decides.`,
      );
      this.duyur(p.id, metin);
      this.duyur(p.id, metin, "yonetim");
    }
  }

  /** Gözlemi arka planda damıtıp global zekâya işler; hata iş akışını etkilemez */
  private gozle(g: Gozlem): void {
    void this.kuresel.gozlemDamit(g).catch(() => undefined);
  }

  /** Olaylardan global zekâya giden gözlemler */
  private zekaGozlemi(o: Parameters<Parameters<OlayYolu["dinle"]>[0]>[0]): void {
    try {
      if (o.tur === "hafiza.yeni" && !o.kayit.yerineGecen) {
        const k = o.kayit;
        const projeAd = this.depo.proje(k.projeId)?.ad ?? null;
        const kurulYazdi = !k.kaynakAjanId;
        if (k.tur === "tercih" && (k.onem >= 4 || kurulYazdi)) {
          this.gozle({ metin: k.metin.length <= 220 ? `${k.baslik}: ${k.metin}` : k.baslik, kaynak: kurulYazdi ? "kurul" : "tercih", projeId: k.projeId, projeAd, kapsam: k.etiketler });
        } else if (k.tur === "ogrenilen" && k.onem >= 3) {
          this.gozle({ metin: k.metin.length <= 220 ? `${k.baslik}: ${k.metin}` : k.baslik, kaynak: "ogrenilen", projeId: k.projeId, projeAd, guclu: k.onem >= 5 });
        }
      } else if (o.tur === "onay.sonuc" && o.onay.durum === "reddedildi" && o.onay.not && tercihGibi(o.onay.not)) {
        // Kurulun gerekçeli reddi bir düzeltmedir
        this.gozle({ metin: o.onay.not, kaynak: "duzeltme", projeId: o.onay.projeId, projeAd: this.depo.proje(o.onay.projeId)?.ad ?? null });
      }
    } catch {
      // gözlem işlenemezse iş akışı etkilenmez
    }
  }

  /** Projenin ana yasası (önbellekli) */
  anayasa(projeId: string): Anayasa {
    let a = this.anayasalar.get(projeId);
    if (!a) {
      const p = this.depo.proje(projeId);
      a = p ? anayasaOku(p.yol) : { ...BOS_ANAYASA };
      this.anayasalar.set(projeId, a);
    }
    return a;
  }

  /** Ana yasayı yazar (kurul düzenlemesi ya da onaylanan CEO önerisi); ekibe duyurulur */
  anayasaGuncelle(projeId: string, maddeler: unknown, onaylayan: string): Anayasa {
    const p = this.proje(projeId);
    const yeni = anayasaYaz(p.yol, maddeler, onaylayan);
    this.anayasalar.set(projeId, yeni);
    this.arnorgCommitPlanla(projeId);
    this.olaylar.yayinla({ tur: "anayasa.guncellendi", projeId, anayasa: yeni });
    this.kanalMesaji(
      projeId,
      "genel",
      { id: ARNORG_GONDEREN, ad: "ArnOrg" },
      iki(
        `Ana yasa güncellendi (sürüm ${yeni.surum}, ${yeni.maddeler.length} madde, onaylayan: ${onaylayan}). Herkes uyar; ayrıntı .arnorg/anayasa.md.`,
        `The constitution was updated (version ${yeni.surum}, ${yeni.maddeler.length} articles, approved by: ${onaylayan}). Everyone follows it; details in .arnorg/anayasa.md.`,
      ),
    );
    return yeni;
  }

  /** Uzak deposu olan projeler arada bir eşitlenir (çekme; yerel dal geride ve temizse ileri sarma) */
  esitlemeBaslat(aralikMs = 10 * 60_000): void {
    if (this.esitlemeZamanlayici) return;
    this.esitlemeZamanlayici = setInterval(() => {
      for (const p of this.depo.projeler()) {
        if (p.uzakAdres && fs.existsSync(p.yol)) void this.esitle(p.id, false, true).catch(() => undefined);
      }
    }, aralikMs);
    this.esitlemeZamanlayici.unref();
  }

  private async acikOturumdanKullanim() {
    for (const o of this.oturumlar.values()) {
      if (!o.acik) continue;
      const k = await o.kullanimSor();
      if (k) return k;
    }
    return null;
  }

  /** Abonelik kullanımı ajanlar için okunmalı mı: açık ajan oturumu ya da sınırda (pencerenin açılmasını) bekleyen ajan var */
  private hesabaAjanBekliyor(): boolean {
    for (const o of this.oturumlar.values()) if (o.acik) return true;
    return this.sinirdaBekleyenler.size > 0;
  }

  /** Abonelik penceresi ayardaki sınırı aştı ya da sıfırlandı */
  private async kullanimSiniriDegisti(sinir: HesapDurumu["sinir"]): Promise<void> {
    if (sinir) {
      const saat = sinir.sifirlanma ? new Date(sinir.sifirlanma).toLocaleTimeString(iki("tr-TR", "en-US"), { hour: "2-digit", minute: "2-digit" }) : null;
      const metin = iki(
        `Abonelik ${sinir.pencere.toLocaleLowerCase("tr")} kullanımı %${sinir.yuzde} (sınır %${sinir.sinirYuzde}). Ajanlar durduruldu; ${saat ?? "pencere sıfırlanınca"} kaldıkları yerden sürecekler.`,
        `Subscription ${sinir.pencere.toLocaleLowerCase("en")} usage is at ${sinir.yuzde}% (limit ${sinir.sinirYuzde}%). Agents are paused; they will pick up where they left off ${saat ? `at ${saat}` : "when the window resets"}.`,
      );
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
      const ek = mesajlar.length ? `\n\n${iki("Bu sürede gelen mesajlar", "Messages that came in meanwhile")}:\n${mesajlar.map((m) => `- ${m}`).join("\n")}` : "";
      await this.uyandir(id, iki(`Abonelik kullanım penceresi açıldı. Kaldığın yerden devam et.${ek}`, `The subscription usage window is open again. Continue where you left off.${ek}`), null);
    }
    if (bekleyenler.length) this.olaylar.yayinla({ tur: "bildirim", seviye: "bilgi", metin: iki("Abonelik penceresi açıldı; ajanlar kaldıkları yerden sürüyor.", "The subscription window is open again; agents are picking up where they left off.") });
  }

  private webHizmeti: WebHizmeti | null = null;
  /** Yerleşik web araması, sayfa okuyucu, paket bilgisi ve GitHub araştırması (web/); ilk kullanımda kurulur */
  get web(): WebHizmeti {
    return (this.webHizmeti ??= new WebHizmeti({
      ayarlar: () => this.yapilandirma.ayarlar.web,
      dil: () => dil(),
      ghBul: () => {
        const gh = this.kurulum.ghYolu();
        return gh ? { yol: gh.yol, ortam: this.kurulum.ghOrtami() } : null;
      },
    }));
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
    if (!p) throw bulunamadi("Proje", "Project");
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
      // Kurulun kararını bekleyenler: tam otonomda CEO'nun kararındakiler kurulun işi değildir
      bekleyenOnay: this.depo.onaylar(id, "bekliyor").filter((o) => o.muhatap !== "ceo").length,
      bugunToken: this.depo.projeTokeni(id, bugun()),
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
    if (!ad) throw new ArnorgHatasi(iki("Proje adı gerekli.", "Project name is required."));
    if (!istek.olustur && !istek.yol?.trim()) throw new ArnorgHatasi(iki("Var olan repoyu bağlamak için klasörünü seçin.", "Choose the folder of the existing repository."));
    if (!this.kurulum.gitYolu() || !(await gitIslemleri.gitVarMi())) throw new ArnorgHatasi(iki("Sistemde git bulunamadı. Git kurulu olmalı.", "git was not found. Git must be installed."), 500);
    // Yol verilmezse proje kökünde (~/ArnOrg/<ad>) açılır
    let kok = path.resolve(istek.yol?.trim() || path.join(this.yapilandirma.projeKoku, klasorAdiYap(ad)));
    const istenenDal = istek.dal?.trim() || null;
    if (istenenDal && !(await gitIslemleri.gecerliDalMi(process.cwd(), istenenDal))) throw new ArnorgHatasi(iki(`Geçersiz dal adı: ${istenenDal}`, `Invalid branch name: ${istenenDal}`));
    let yeniRepo = false;
    if (istek.olustur) {
      fs.mkdirSync(kok, { recursive: true });
      if (!(await gitIslemleri.repoMu(kok))) {
        await gitIslemleri.repoBaslat(kok, istenenDal ?? "main");
        yeniRepo = true;
      } else {
        kok = await gitIslemleri.repoKoku(kok);
      }
    } else {
      if (!fs.existsSync(kok)) throw new ArnorgHatasi(iki("Klasör bulunamadı.", "Folder not found."), 404);
      if (!(await gitIslemleri.repoMu(kok))) throw new ArnorgHatasi(iki("Klasör bir git deposu değil. Yeni repo oluşturmayı seçin ya da git init çalıştırın.", "The folder is not a git repository. Choose to create a new repository or run git init."));
      kok = await gitIslemleri.repoKoku(kok);
    }
    kok = gitIslemleri.gercekYol(kok);
    if (this.depo.projeler().some((p) => gitIslemleri.ayniYol(p.yol, kok))) throw new ArnorgHatasi(iki("Bu repo zaten bir ArnOrg projesi.", "This repository is already an ArnOrg project."), 409);
    // Bağlanan repoda klasörü silinmiş eski worktree'lerin bayat kayıtları temizlenir
    await gitIslemleri.worktreeBuda(kok).catch(() => undefined);

    // Çalışma dalı: istenen dal (yoksa açılır), yoksa reponun o anki dalı
    if (istenenDal) await gitIslemleri.dalaGec(kok, istenenDal);
    let dal = await gitIslemleri.mevcutDal(kok);
    if (dal === "HEAD") dal = istenenDal ?? "main";
    const ilkCommitGerek = !(await gitIslemleri.commitVarMi(kok));
    iskeletOlustur(kok, ad, istek.aciklama?.trim() ?? "", dal, yeniRepo || ilkCommitGerek);
    if (yeniRepo || ilkCommitGerek) {
      await gitIslemleri.kimlikGuvenceAltinaAl(kok);
      await gitIslemleri.tumunuCommitle(kok, iki("ArnOrg: proje iskeleti", "ArnOrg: project scaffold"));
    }

    const proje = this.depo.projeEkle({
      ad,
      yol: kok,
      aciklama: istek.aciklama?.trim() ?? "",
      varsayilanDal: dal,
      uzakAdres: await gitIslemleri.uzakAdresi(kok),
      otomatikGonder: true,
      hazirlik: "bekliyor",
      kararVeren: istek.kararVeren === "kurul" ? "kurul" : "ceo",
    });
    this.depo.politikaYaz(proje.id, varsayilanKurallar());

    // Repo içinde kayıtlı ekip varsa geri yükle
    const kayitlar = ekipDosyalariniOku(kok);
    for (const k of kayitlar) {
      if (!rolBul(k.rol)) continue;
      this.iseAl(proje.id, { ad: k.ad, rol: k.rol, model: k.model, talimatEki: k.talimatEki, karakter: k.karakter }, false);
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
    this.zeka.iceAktar(proje, this.depo.ajanlar(proje.id));

    // GitHub'da yeni depo: iskelet commit'iyle birlikte gönderilir
    if (istek.github && !proje.uzakAdres) {
      try {
        const uzak = await this.github.depoOlustur(proje, { ozel: istek.github.ozel, sahip: istek.github.sahip, aciklama: proje.aciklama });
        this.depo.projeGuncelle(proje.id, { uzakAdres: uzak });
      } catch (h) {
        this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: iki(`GitHub deposu açılamadı: ${(h as Error).message}`, `Could not create the GitHub repository: ${(h as Error).message}`), projeId: proje.id });
      }
    }
    const son = this.proje(proje.id);
    this.kanalMesaji(
      proje.id,
      "genel",
      { id: ARNORG_GONDEREN, ad: "ArnOrg" },
      iki(
        `${ad} projesi açıldı. Çalışma dalı ${son.varsayilanDal}${son.github ? `, GitHub deposu ${son.github}` : ""}. CEO hazır: hazırlık görüşmesi için #yonetim kanalını kullanın ya da brief'inizi buraya yazın.`,
        `${ad} is open. Working branch ${son.varsayilanDal}${son.github ? `, GitHub repository ${son.github}` : ""}. The CEO is ready: use #ceo for the kickoff conversation or write your brief here.`,
      ),
    );
    this.projeYayinla(proje.id);
    return this.projeOzeti(proje.id);
  }

  /** Proje ayarları: ad, açıklama, çalışma dalı, otomatik gönderim, hazırlık durumu, otomatik onay, karar yetkisi */
  async projeGuncelle(id: string, istek: ProjeGuncelleIstegi): Promise<ProjeOzeti> {
    const p = this.proje(id);
    const alanlar: Parameters<Depo["projeGuncelle"]>[1] = {};
    if (istek.ad !== undefined) {
      const ad = istek.ad.trim();
      if (!ad || ad.length > 80) throw new ArnorgHatasi(iki("Proje adı 1–80 karakter olmalı.", "Project name must be 1–80 characters."));
      alanlar.ad = ad;
    }
    if (istek.aciklama !== undefined) alanlar.aciklama = istek.aciklama.trim().slice(0, 2000);
    if (istek.otomatikGonder !== undefined) alanlar.otomatikGonder = istek.otomatikGonder;
    if (istek.hazirlik !== undefined) alanlar.hazirlik = istek.hazirlik;
    // Kalite kapısı: test ve hazırlık komutu, süre sınırı (birlestirme-kuyrugu.ts)
    Object.assign(alanlar, kaliteAyarlari(istek));
    let bekleyenleriOnayla = false;
    if (istek.otomatikOnay !== undefined) {
      const turler = [...new Set(istek.otomatikOnay.turler.filter((t) => ONAY_TURLERI.includes(t)))];
      alanlar.otomatikOnay = { etkin: Boolean(istek.otomatikOnay.etkin), turler };
      bekleyenleriOnayla = alanlar.otomatikOnay.etkin;
      if (alanlar.otomatikOnay.etkin !== p.otomatikOnay.etkin) {
        this.duyur(id, alanlar.otomatikOnay.etkin ? iki("Kurul otomatik onayı açtı; seçili türdeki onaylar kendiliğinden verilecek.", "The board turned on auto-approval; approvals of the selected types will be granted automatically.") : iki("Kurul otomatik onayı kapattı.", "The board turned off auto-approval."));
      }
    }
    // Karar yetkisi: değişince bekleyen onaylar yeni muhataba yönelir (kararKipiDegisti)
    const kipDegisti = istek.kararVeren !== undefined && istek.kararVeren !== p.kararVeren;
    if (kipDegisti) alanlar.kararVeren = istek.kararVeren;
    if (istek.varsayilanDal !== undefined && istek.varsayilanDal.trim() !== p.varsayilanDal) {
      const dal = istek.varsayilanDal.trim();
      const kirli = (await gitIslemleri.git(p.yol, ["status", "--porcelain", "--untracked-files=no"])).trim();
      if (kirli) throw new ArnorgHatasi(iki("Ana repoda commit'lenmemiş değişiklik var; dal değiştirilmedi.", "The main repo has uncommitted changes; the branch was not changed."), 409);
      await this.arnorgCommitle(id).catch(() => false);
      await gitIslemleri.dalaGec(p.yol, dal);
      alanlar.varsayilanDal = dal;
      this.kanalMesaji(id, "genel", { id: ARNORG_GONDEREN, ad: "ArnOrg" }, iki(`Çalışma dalı ${dal} oldu. Yeni işler bu daldan açılır, onaylı birleştirmeler bu dala girer.`, `The working branch is now ${dal}. New work branches off it and approved merges go into it.`));
    }
    const yeni = this.depo.projeGuncelle(id, alanlar);
    const kalite = kaliteDuyurusu(p, yeni);
    if (kalite) this.duyur(id, kalite);
    if (kipDegisti) await this.kararKipiDegisti(id, yeni.kararVeren);
    // Otomatik onay (yalnız kurul kipinde) açıkken kurulu bekleyen uygun onaylar da verilir
    else if (bekleyenleriOnayla && alanlar.otomatikOnay && yeni.kararVeren === "kurul") {
      for (const o of this.depo.onaylar(id, "bekliyor")) {
        if (o.muhatap !== "ceo" && alanlar.otomatikOnay.turler.includes(o.tur)) await this.onayKarari(o.id, "onayla", undefined, { kaynak: "otomatik" }).catch(() => undefined);
      }
    }
    this.projeYayinla(id);
    return this.projeOzeti(id);
  }

  /** Var olan projeyi GitHub'da yeni depo olarak açar ve bağlar */
  async githubDeposuAc(id: string, secenek: { ozel: boolean; sahip?: string }): Promise<ProjeOzeti> {
    const p = this.proje(id);
    const uzak = await this.github.depoOlustur(p, { ...secenek, aciklama: p.aciklama });
    const yeni = this.depo.projeGuncelle(id, { uzakAdres: uzak });
    this.kanalMesaji(
      id,
      "genel",
      { id: ARNORG_GONDEREN, ad: "ArnOrg" },
      iki(
        `GitHub deposu açıldı: ${yeni.github ?? uzak}. Onaylı birleştirmeler ${yeni.varsayilanDal} dalıyla oraya gönderilecek.`,
        `GitHub repository created: ${yeni.github ?? uzak}. Approved merges will be pushed there on ${yeni.varsayilanDal}.`,
      ),
    );
    this.projeYayinla(id);
    return this.projeOzeti(id);
  }

  async projeDallari(id: string): Promise<ProjeDallari> {
    const p = this.proje(id);
    const d = await gitIslemleri.dallar(p.yol);
    return { mevcut: await gitIslemleri.mevcutDal(p.yol).catch(() => p.varsayilanDal), calisma: p.varsayilanDal, yerel: d.yerel, uzak: d.uzak.filter((u) => !d.yerel.includes(u)) };
  }

  /** Uzak depoyla eşitle; sessiz=true iken yalnız bir şey değiştiyse ya da sorun varsa bildirilir */
  async esitle(id: string, gonder = false, sessiz = false): Promise<EsitlemeSonucu> {
    let p = this.proje(id);
    if (!p.uzakAdres) {
      const uzak = await gitIslemleri.uzakAdresi(p.yol).catch(() => null);
      if (uzak) p = this.depo.projeGuncelle(id, { uzakAdres: uzak });
    }
    const sonuc = await this.github.esitle(p, gonder);
    const onemli = sonuc.durum === "cekildi" || sonuc.durum === "gonderildi" || sonuc.durum === "ayrisik" || sonuc.durum === "kirli" || sonuc.durum === "hata";
    if (!sessiz || onemli) {
      if (sonuc.durum === "cekildi" || sonuc.durum === "ayrisik") this.kanalMesaji(id, "genel", { id: ARNORG_GONDEREN, ad: "ArnOrg" }, sonuc.mesaj);
      if (onemli) this.olaylar.yayinla({ tur: "bildirim", seviye: sonuc.durum === "cekildi" || sonuc.durum === "gonderildi" ? "bilgi" : "uyari", metin: sonuc.mesaj, projeId: id });
    }
    if (sonuc.durum === "cekildi") this.projeYayinla(id);
    return sonuc;
  }

  projeSil(id: string): void {
    for (const a of this.depo.ajanlar(id)) this.oturumlar.get(a.id)?.kapat();
    this.kanallar.projeKaldir(id);
    this.kodZekasi.projeKaldir(id);
    const p = this.depo.proje(id);
    if (p) this.birlestirmeKuyrugu.projeKaldir(p);
    this.depo.projeSil(id);
    this.olaylar.yayinla({ tur: "bildirim", seviye: "bilgi", metin: iki("Proje ArnOrg listesinden çıkarıldı; dosyalara dokunulmadı.", "The project was removed from ArnOrg's list; its files were not touched.") });
  }

  // ===================================================================
  // Ekip
  // ===================================================================

  ajan(id: string): Ajan {
    const a = this.depo.ajan(id);
    if (!a) throw bulunamadi("Ajan", "Agent");
    return a;
  }

  private ajanYayinla(id: string): void {
    const a = this.depo.ajan(id);
    if (a) this.olaylar.yayinla({ tur: "ajan.guncellendi", ajan: a });
  }

  iseAl(projeId: string, istek: AjanIseAlIstegi, dosyaYaz = true): Ajan {
    const proje = this.proje(projeId);
    const ad = istek.ad?.trim();
    if (!ad || ad.length > 40) throw new ArnorgHatasi(iki("Ajan adı 1–40 karakter olmalı.", "Agent names must be 1–40 characters."));
    if (!/^[\p{L}\p{N} ._-]+$/u.test(ad)) throw new ArnorgHatasi(iki("Ajan adında yalnız harf, rakam, boşluk, nokta, tire ve alt çizgi olabilir.", "Agent names may only contain letters, digits, spaces, dots, hyphens and underscores."));
    if (this.depo.ajanAdla(projeId, ad)) throw new ArnorgHatasi(iki(`${ad} adında bir çalışan zaten var.`, `There is already an employee named ${ad}.`), 409);
    const rol = rolBul(istek.rol);
    if (!rol) throw new ArnorgHatasi(iki("Bilinmeyen rol.", "Unknown role."));
    const ceo = this.depo.ajanlar(projeId).find((a) => a.rol === "ceo");
    if (rol.kimlik === "ceo" && ceo) throw new ArnorgHatasi(iki("Projede zaten bir CEO var.", "The project already has a CEO."), 409);
    const yoneticiId = istek.yoneticiId === undefined ? (rol.kimlik === "ceo" ? null : (ceo?.id ?? null)) : istek.yoneticiId;
    const ajan = this.depo.ajanEkle({
      projeId,
      ad,
      rol: rol.kimlik,
      // Kayıtlı rol adı işe alındığı dildedir (talimat ve metinler rolü kimliğinden geçerli dilde anar)
      rolAdi: rolMetni(rol, dil()).ad,
      // Model verilmezse rolün varsayılanı; hesabın kataloğunda yoksa zincirde bir sonraki (CEO: fable yoksa opus)
      model: istek.model?.trim() || this.modelKatalogu.rolModeli(rol.varsayilanModel),
      yoneticiId,
      durum: "kapali",
      isAciklamasi: "",
      gorevId: null,
      oturumId: null,
      calismaAlani: null,
      dal: null,
      izinModu: this.yapilandirma.ayarlar.varsayilanIzinModu,
      talimatEki: istek.talimatEki?.trim() ?? "",
      // Karakter seçilmediyse role uyan boş karakter atanır; kişiliği talimata, görünüşü ofise yansır
      karakter: istek.karakter ?? karakterSec(rol.kimlik, this.kullanilanKarakterler(projeId), `${projeId}:${ad}`),
    });
    if (dosyaYaz) this.kimlikDosyasiYaz(ajan, proje);
    this.ajanYayinla(ajan.id);
    this.projeYayinla(projeId);
    return ajan;
  }

  private kullanilanKarakterler(projeId: string): string[] {
    return this.depo
      .ajanlar(projeId)
      .map((a) => a.karakter)
      .filter((k): k is string => !!k);
  }

  /** Karakteri olmayan eski ajanlara işe alınış sırasıyla karakter atanır (ofisteki otomatik atamayla aynı kural) */
  private karakterleriTamamla(): void {
    for (const p of this.depo.projeler()) {
      const ajanlar = [...this.depo.ajanlar(p.id)].sort((a, b) => a.olusturma.localeCompare(b.olusturma) || a.id.localeCompare(b.id));
      for (const a of ajanlar) {
        if (a.karakter) continue;
        this.depo.ajanGuncelle(a.id, { karakter: karakterSec(a.rol, this.kullanilanKarakterler(p.id), `${p.id}:${a.ad}`) });
      }
    }
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
    if (istek.izinModu) alanlar.izinModu = istek.izinModu;
    if (istek.yoneticiId !== undefined) {
      if (istek.yoneticiId === id) throw new ArnorgHatasi(iki("Ajan kendi yöneticisi olamaz.", "An agent cannot be their own manager."));
      alanlar.yoneticiId = istek.yoneticiId;
    }
    if (istek.talimatEki !== undefined) alanlar.talimatEki = istek.talimatEki;
    if (istek.karakter !== undefined) alanlar.karakter = istek.karakter;
    // Yetenekler bir sonraki oturumun araç listesine ve talimatına girer; kapanan yeteneğin aracı hemen kapıda reddedilir
    if (istek.yetenekler !== undefined) alanlar.yetenekler = yetenekleriDogrula(istek.yetenekler);
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

  /** Ajanı ekipten siler; dönen söz, git çalışma alanının temizliği (calismaAlaniniKaldir) bitince çözülür */
  ajanSil(id: string): Promise<void> {
    const a = this.ajan(id);
    if (a.rol === "ceo") throw new ArnorgHatasi(iki("CEO işten çıkarılamaz.", "The CEO cannot be dismissed."), 409);
    this.oturumlar.get(id)?.kapat();
    this.oturumlar.delete(id);
    for (const g of this.depo.gorevler(a.projeId)) {
      if (g.atananId === id && g.durum !== "tamam") this.depo.gorevGuncelle(g.id, { atananId: null, durum: g.durum === "calisiliyor" ? "planlandi" : g.durum });
    }
    for (const alt of this.depo.ajanlar(a.projeId)) if (alt.yoneticiId === id) this.depo.ajanGuncelle(alt.id, { yoneticiId: a.yoneticiId });
    this.depo.ajanSil(id);
    this.kanallar.uyeAyrildi(a.projeId, id);
    try {
      ekipDosyasiSil(this.proje(a.projeId).yol, a.ad);
    } catch {
      // yok sayılır
    }
    this.olaylar.yayinla({ tur: "ajan.silindi", projeId: a.projeId, ajanId: id });
    this.projeYayinla(a.projeId);
    return this.calismaAlaniniKaldir(a);
  }

  /**
   * Ayrılan ajanın git çalışma alanı: commit'lenmemiş değişiklik yoksa kaldırılır (dal ve commit'ler kalır). Varsa ya da
   * kaldırılamazsa dokunulmaz; #genel'e ve kurula kısa not düşülür. Hata fırlatmaz.
   */
  private async calismaAlaniniKaldir(a: Ajan): Promise<void> {
    const p = this.depo.proje(a.projeId);
    const yol = a.calismaAlani;
    if (!p || !yol || gitIslemleri.ayniYol(yol, p.yol) || !fs.existsSync(p.yol)) return;
    const dal = a.dal ?? "?";
    let not: string;
    try {
      const sonuc = await gitIslemleri.worktreeKaldir(p.yol, yol);
      if (sonuc.durum !== "kirli") return;
      not = iki(
        `${ilgi(a.ad)} çalışma alanında commit'lenmemiş ${sonuc.degisiklik} değişiklik var; worktree silinmedi: ${yol} (dal ${dal}). İnceleyip commit'leyin ya da git worktree remove --force ile silin.`,
        `${a.ad}'s workspace has ${sonuc.degisiklik} uncommitted change${sonuc.degisiklik === 1 ? "" : "s"}, so the worktree was kept: ${yol} (branch ${dal}). Review and commit them, or delete it with git worktree remove --force.`,
      );
    } catch (h) {
      not = iki(`${ilgi(a.ad)} çalışma alanı kaldırılamadı (${yol}): ${(h as Error).message}`, `Could not remove ${a.ad}'s workspace (${yol}): ${(h as Error).message}`);
    }
    this.duyur(a.projeId, not);
    this.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin: not, projeId: a.projeId });
  }

  /** Bayat worktree kayıtlarını budar (klasörü elle silinmiş ajan alanları); proje verilmezse bütün projeler */
  async calismaAlanlariniBuda(projeId?: string): Promise<void> {
    for (const p of projeId ? [this.proje(projeId)] : this.depo.projeler()) {
      if (fs.existsSync(p.yol)) await gitIslemleri.worktreeBuda(p.yol).catch(() => undefined);
    }
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
      await gitIslemleri.git(proje.yol, ["commit", "--allow-empty", "-m", iki("ArnOrg: başlangıç", "ArnOrg: initial commit")]);
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

  /** Ajanın kod zekâsı alanı: kendi worktree'si varsa ajan kimliği, yoksa (CEO, henüz başlamamış) "ana" */
  ajanAlani(ajan: Ajan): string {
    const p = this.depo.proje(ajan.projeId);
    return ajan.calismaAlani && p && ajan.calismaAlani !== p.yol && fs.existsSync(ajan.calismaAlani) ? ajan.id : "ana";
  }

  alanYolu(projeId: string, alan: string): string {
    const p = this.proje(projeId);
    if (!alan || alan === "ana") return p.yol;
    const a = this.depo.ajan(alan);
    if (!a || a.projeId !== projeId || !a.calismaAlani) throw bulunamadi("Çalışma alanı", "Workspace");
    return a.calismaAlani;
  }

  // ===================================================================
  // Oturumlar
  // ===================================================================

  private talimatOlustur(ajan: Ajan, cwd: string): string {
    const proje = this.proje(ajan.projeId);
    const rol = rolBul(ajan.rol) ?? undefined;
    const yonetici = ajan.yoneticiId ? this.depo.ajan(ajan.yoneticiId) : null;
    // Talimata giren hafıza kayıtları bu oturumda gösterilmiş sayılır; tur başında yinelenmez
    const gosterilen: string[] = [];
    const hafizaBaglami = this.hafiza.baglam(ajan, this.depo.sorular(ajan.projeId, { soruluId: ajan.id, durum: "bekliyor", sinir: 8 }), gosterilen);
    this.hatirlatici.oturumAcildi(ajan.id, gosterilen);
    const anayasa = this.anayasa(ajan.projeId);
    this.anayasaSurumleri.set(ajan.id, anayasa.surum);
    const kuresel = this.kuresel.baglam(ajan, rol);
    this.kuresel.kullanildi(kuresel.idler);
    this.hatirlatmaIzleri.set(ajan.id, { arac: 0, son: Date.now() });
    return talimatOlustur({
      ajan,
      proje,
      rol,
      yonetici,
      ekip: this.depo.ajanlar(ajan.projeId).filter((a) => a.id !== ajan.id),
      cwd,
      anayasa,
      kuresel: kuresel.metin,
      kisisel: this.zeka.kisisel(ajan),
      beceriler: this.zeka.beceriler(proje),
      baglar: this.zeka.baglar(ajan),
      hafizaBaglami,
      dil: dil(),
    });
  }

  /** Dönemsel hatırlatmanın metni: kimlik, açık işler, sözler, ana yasa; tam otonom kipte CEO'ya kararını bekleyen onaylar */
  private hatirlatma(ajan: Ajan): string {
    const k = karakterBul(ajan.karakter);
    const gorevler = this.depo
      .gorevler(ajan.projeId)
      .filter((g) => g.atananId === ajan.id && (g.durum === "calisiliyor" || g.durum === "planlandi" || g.durum === "inceleme"))
      .slice(0, 5)
      .map((g) => ({ kod: g.kod, baslik: g.baslik, durum: g.durum }));
    const sozler = this.depo.sozler(ajan.projeId, { verenId: ajan.id, durum: "acik", sinir: 5 }).map((s) => ({ kime: s.aliciAd, metin: s.metin }));
    // Süresi olmayan istekler (başkasının işe alım ve birleştirme isteği) unutulmasın
    const bekleyenOnaylar = ajan.rol === "ceo" ? this.ceoyuBekleyenler(ajan.projeId).map((o) => ({ kimlik: kisaKimlik(o.id), baslik: o.baslik })) : [];
    return hatirlatmaMetni({
      ajan,
      rol: rolBul(ajan.rol) ?? undefined,
      lakap: k ? karakterMetni(k, dil()).lakap : null,
      gorevler,
      sozler,
      anayasaKisa: anayasaKisa(this.anayasa(ajan.projeId)),
      dil: dil(),
      kisiselBos: this.zeka.kisisel(ajan).length === 0,
      bekleyenOnaylar,
    });
  }

  /** Tur başı: hafıza, ekipten haberler (bağ kancaları), ana yasa değiştiyse yeni hâli */
  private turBasiEki(ajan: Ajan, metin: string): string | null {
    const parcalar: string[] = [];
    const hafiza = this.hatirlatici.turBasi(ajan, metin, !/^\[[^\]\n]{1,60}\] /.test(metin));
    if (hafiza) parcalar.push(hafiza);
    const haberler = this.zeka.haberleriAl(ajan.id);
    if (haberler.length) parcalar.push([iki("[ArnOrg] Ekipten haberler:", "[ArnOrg] News from the team:"), ...haberler.map((h) => `- ${h}`)].join("\n"));
    const a = this.anayasa(ajan.projeId);
    const gordugu = this.anayasaSurumleri.get(ajan.id);
    if (gordugu !== undefined && gordugu !== a.surum) {
      this.anayasaSurumleri.set(ajan.id, a.surum);
      parcalar.push(
        [iki(`[ArnOrg] Ana yasa değişti (sürüm ${a.surum}). Bundan sonra şu maddelere uy:`, `[ArnOrg] The constitution changed (version ${a.surum}). From now on follow these articles:`), ...a.maddeler.map((m) => `${m.no}. ${m.baslik} — ${kisalt(m.metin, 300)}`)].join("\n"),
      );
    }
    return parcalar.length ? parcalar.join("\n\n") : null;
  }

  private oturumAl(ajan: Ajan, cwd: string): AjanOturumu {
    let oturum = this.oturumlar.get(ajan.id);
    if (oturum) return oturum;
    const id = ajan.id;
    const izinSor: CanUseTool = async (arac, girdi, s) => this.izinSor(id, arac, girdi, s.toolUseID, s.agentID);
    oturum = new AjanOturumu({
      ajan: () => this.ajan(id),
      cwd,
      claudeYolu: this.claudeYolu,
      talimat: () => this.talimatOlustur(this.ajan(id), cwd),
      araclar: () => arnorgAraclari(this, id),
      yasakAraclar: () => [...(rolBul(this.ajan(id).rol)?.kimlik === "ceo" ? ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "PowerShell", "Monitor", "Agent", "Task", "Skill"] : []), ...kapaliClaudeAraclari(this.ajan(id))],
      onaySuresiSn: () => this.yapilandirma.ayarlar.onaySuresiSn,
      kapi: (arac, girdi, aracKimligi, altAjan) => this.kapi(id, arac, girdi, aracKimligi, altAjan),
      izinSor,
      aracSonrasi: (arac, girdi) => this.aracSonrasi(id, arac, girdi),
      aracHatasi: (arac, girdi, hata) => this.hatirlatici.hataSonrasi(this.ajan(id), arac, girdi, hata),
      turBasi: (metin) => this.turBasiEki(this.ajan(id), metin),
      sikistirmaSonrasi: () => {
        const a = this.ajan(id);
        const hafiza = this.hatirlatici.sikistirmaSonrasi(a, this.depo.sorular(a.projeId, { soruluId: a.id, durum: "bekliyor", sinir: 6 }));
        this.hatirlatmaIzleri.set(a.id, { arac: 0, son: Date.now() });
        return [this.hatirlatma(a), hafiza].filter(Boolean).join("\n\n");
      },
      akis: (oge) => this.akisEkle(id, oge),
      durum: (d, aciklama) => this.durumDegisti(id, d, aciklama),
      oturumKimligi: (oid) => {
        this.depo.ajanGuncelle(id, { oturumId: oid || null });
      },
      kullanim: (delta) => this.kullanimEkle(id, delta),
      turKullanimi: (tahmin) => this.gorevTavani.turSuruyor(id, tahmin),
      turTavaniAsildi: (adim) => this.gorevTavani.turSiniri(id, adim),
      pencere: (p) => {
        this.pencere = { tur: p.tur, durum: p.durum, sifirlanma: p.sifirlanma };
        this.hesap.pencereOlayi(p);
      },
      oturumToplami: {
        oku: (oturumId) => {
          const d = this.depo.deger(`oturum-toplam:${oturumId}`);
          return d ? (JSON.parse(d) as Toplam) : null;
        },
        yaz: (oturumId, t) => this.depo.degerYaz(`oturum-toplam:${oturumId}`, JSON.stringify(t)),
      },
      girisKaynagi: (k) => this.hesap.girisKaynagi(k),
      kimlikSorunu: (sorun, ayrinti) => this.kimlikSorunuBildir(id, ajan.projeId, sorun, ayrinti),
      bitti: (hata) => {
        this.hatirlatici.oturumKapandi(id);
        if (hata) this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: `${this.depo.ajan(id)?.ad ?? iki("Ajan", "Agent")}: ${kisalt(hata, 200)}`, projeId: ajan.projeId });
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
      if (!g || g.projeId !== a.projeId) throw bulunamadi("Görev", "Task");
      if (g.atananId !== id) this.depo.gorevGuncelle(g.id, { atananId: id });
      this.depo.ajanGuncelle(id, { gorevId: g.id });
      metin = this.gorevMetni(g, null, await this.ilgiliKod(g)) + (metin ? `\n\n${iki("Ek not", "Additional note")}: ${metin}` : "");
    }
    if (!metin) {
      const benim = this.depo.gorevler(a.projeId).filter((g) => g.atananId === id && (g.durum === "calisiliyor" || g.durum === "planlandi"));
      const liste = benim.map((g) => `- ${g.kod} ${g.baslik} (${g.durum})`).join("\n");
      metin = benim.length
        ? iki(
            `Mesaine başla. Sana atanmış görevler:\n${liste}\nÖnce notları ve görev ayrıntılarını oku, sonra sıradaki işe başla.`,
            `Start your shift. Tasks assigned to you:\n${liste}\nFirst read the notes and the task details, then start on the next piece of work.`,
          )
        : rolBul(a.rol)?.yonetici
          ? iki("Mesaine başla. #genel kanalını, görevleri ve notları oku; durumu değerlendir ve gerekiyorsa plan yap.", "Start your shift. Read #general, the tasks and the notes; assess the situation and make a plan if needed.")
          : iki("Mesaine başla. Görevleri ve notları oku; sana atanmış iş yoksa yöneticine durumunu bildir.", "Start your shift. Read the tasks and the notes; if no work is assigned to you, tell your manager.");
    }
    await this.ajanaMesaj(id, metin, "next", { tur: "kurul" });
    return this.ajan(id);
  }

  async ajanaMesaj(id: string, metin: string, oncelik: MesajOnceligi = "next", kaynak: MesajKaynagi = { tur: "kurul" }): Promise<void> {
    if (!metin.trim()) throw new ArnorgHatasi(iki("Mesaj boş olamaz.", "The message cannot be empty."));
    const a = this.ajan(id);
    // Abonelik sınırında ajan uyandırılmaz; mesaj saklanır, pencere açılınca teslim edilir. Kurulun kendi mesajı geçer.
    const sinir = this.hesap.sinir;
    if (sinir && kaynak.tur !== "kurul") {
      this.sinirdaSakla(id, metin);
      throw new ArnorgHatasi(
        iki(`Abonelik kullanımı sınırda (${sinir.pencere} %${sinir.yuzde}); ${a.ad} pencere açılınca uyanacak.`, `Subscription usage is at the limit (${sinir.pencere} ${sinir.yuzde}%); ${a.ad} will wake up when the window opens.`),
        429,
      );
    }
    // Görev token tavanı aşıldı, kurul kararı bekleniyor: mesaj kararla birlikte iletilir (kurul ve soru yanıtı geçer)
    const muaf = this.tavandanMuaf(a, kaynak);
    if (!muaf && this.gorevTavani.tut(id, metin)) return;
    // Eşzamanlı ajan tavanı: turu sürmeyen ajana gelen mesaj tavan doluysa sıraya girer; çağıran hata almaz
    const oturum = this.oturumlar.get(id);
    if (!(oturum?.acik && calisanMi(a.durum)) && this.esZamanlilik.siraGerekli(muaf)) {
      this.esZamanlilik.ekle({ ajanId: id, metin, oncelik, kaynak });
      return;
    }
    // Sırada bekleyen önceki mesajları geliş sırasıyla bu mesajdan önce gider
    await this.teslimEt(a, [...this.esZamanlilik.ajaninkileriAl(id), { ajanId: id, metin, oncelik, kaynak }]);
  }

  /**
   * Kurulun mesajı ve bir ajanın sorusunu yanıtlamak için uyandırılan ajan tavanlardan muaftır: soran beklerken çalışan
   * sayılır, sorulan sırada kalırsa ikisi kilitlenir. Tam otonom kipte kararını bekleyen onay olan CEO da aynı nedenle muaftır.
   */
  private tavandanMuaf(a: Ajan, kaynak: MesajKaynagi): boolean {
    return (
      kaynak.tur === "kurul" ||
      this.depo.sorular(a.projeId, { soruluId: a.id, durum: "bekliyor", sinir: 1 }).length > 0 ||
      (a.rol === "ceo" && this.ceoyuBekleyenler(a.projeId).length > 0)
    );
  }

  /** Mesajları geliş sırasıyla ajana verir; oturum kapalıysa açar. Ajan hemen çalışan sayılır: tavandaki yeri çalışma alanı hazırlanırken de tutulur */
  private async teslimEt(a: Ajan, mesajlar: SiradakiMesaj<MesajKaynagi>[]): Promise<void> {
    const id = a.id;
    const [ilk, ...kalan] = mesajlar;
    if (!ilk) return;
    const oturum = this.oturumlar.get(id);
    if (oturum?.acik) {
      if (!calisanMi(this.depo.ajan(id)?.durum)) this.durumDegisti(id, "calisiyor", iki("Çalışıyor", "Working"));
      for (const m of mesajlar) oturum.gonder(m.metin, m.oncelik, m.kaynak);
      return;
    }
    if (this.oturumlarKapali) throw new ArnorgHatasi(iki("Oturumlar bu çalıştırmada kapalı.", "Sessions are disabled in this run."), 503);
    if (!this.claudeYolu && !this.sdkIkilisiVar()) {
      throw new ArnorgHatasi(iki("Claude Code bulunamadı. Ayarlar'dan Claude Code yolunu verin ya da Claude Code'u kurun.", "Claude Code was not found. Set the Claude Code path in Settings or install Claude Code."), 500);
    }
    this.durumDegisti(id, "calisiyor", iki("Oturum açılıyor", "Opening session"));
    let cwd: string;
    try {
      cwd = await this.calismaAlaniHazirla(a);
    } catch (h) {
      this.durumDegisti(id, "hata", iki(`Çalışma alanı açılamadı: ${(h as Error).message}`, `Could not open the workspace: ${(h as Error).message}`));
      throw h;
    }
    const yeni = this.oturumAl(this.ajan(id), cwd);
    yeni.baslat(ilk.metin, ilk.kaynak);
    for (const m of kalan) yeni.gonder(m.metin, m.oncelik, m.kaynak);
  }

  /** Sırası gelen ajanın mesajları; teslim anında abonelik sınırı varsa sınırda bekleyenlere sessizce eklenir */
  private siradanTeslim(ajanId: string, mesajlar: SiradakiMesaj<MesajKaynagi>[]): void {
    const a = this.depo.ajan(ajanId);
    if (!a) return;
    if (this.hesap.sinir) {
      for (const m of mesajlar) this.sinirdaSakla(ajanId, m.metin);
      return;
    }
    if (this.gorevTavani.duraklatmaAciklamasi(ajanId)) {
      for (const m of mesajlar) this.gorevTavani.tut(ajanId, m.metin);
      return;
    }
    void this.teslimEt(a, mesajlar).catch((h) =>
      this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: iki(`${a.ad} uyandırılamadı: ${(h as Error).message}`, `Could not wake ${a.ad}: ${(h as Error).message}`), projeId: a.projeId }),
    );
  }

  /** Abonelik sınırında ajana gelen mesaj saklanır; pencere açılınca uyandırılırken iletilir */
  private sinirdaSakla(ajanId: string, metin: string): void {
    const kuyruk = this.sinirdaBekleyenler.get(ajanId) ?? [];
    kuyruk.push(kisalt(metin, 1500));
    this.sinirdaBekleyenler.set(ajanId, kuyruk);
  }

  /** Sıraya giren ajanın iş açıklaması "Sırada…" olur; sırası düşünce (ajan başlamadıysa) temizlenir */
  private siraAciklamasiYaz(ajanId: string, sirada: boolean): void {
    const a = this.depo.ajan(ajanId);
    if (!a || calisanMi(a.durum)) return;
    if (sirada) this.depo.ajanGuncelle(ajanId, { isAciklamasi: siraAciklamasi(this.yapilandirma.ayarlar.esZamanliAjan) });
    else if (siraAciklamasiMi(a.isAciklamasi)) this.depo.ajanGuncelle(ajanId, { isAciklamasi: "" });
    else return;
    this.ajanYayinla(ajanId);
    this.projeYayinla(a.projeId);
  }

  /** Ajan eşzamanlı tavan yüzünden sırada mı (tıkanma koruması dürtmez) */
  siradaMi(ajanId: string): boolean {
    return this.esZamanlilik.siradaMi(ajanId);
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
    // Kurul durdurdu: sıradaki mesajları düşer, açılışta da uyanmaz
    this.esZamanlilik.dusur((x) => x === id);
    this.mesai.cikar((x) => x === id);
    return this.ajan(id);
  }

  async ajanMod(id: string, mod: IzinModu): Promise<Ajan> {
    return this.ajanGuncelle(id, { izinModu: mod });
  }

  async ajanModel(id: string, model: string): Promise<Ajan> {
    if (!model.trim()) throw new ArnorgHatasi(iki("Model adı gerekli.", "A model name is required."));
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
    // Mesai durdu: sıradaki mesajlar düşer, durdurulan ajanlar açılışta uyanmaz, kurul kanallarındaki konuşmalar durur
    const projede = (id: string) => !projeId || this.depo.ajan(id)?.projeId === projeId;
    this.esZamanlilik.dusur(projede);
    this.mesai.cikar(projede);
    this.kanallar.konusmalariDurdur(projeId);
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
    // Görev token tavanı aşıldı, kurul kararı bekleniyor: ajan iş bitince (soru yanıtı, kurul mesajı) duraklatılmış görünür
    const bosaCikti = durum === "bosta";
    const tavanAciklamasi = this.gorevTavani.duraklatmaAciklamasi(ajanId);
    if (tavanAciklamasi && !calisanMi(durum)) {
      durum = "duraklatildi";
      aciklama = tavanAciklamasi;
    }
    const alanlar: Partial<Ajan> = { durum };
    if (aciklama !== undefined) alanlar.isAciklamasi = aciklama;
    if (durum === "kapali") alanlar.isAciklamasi = "";
    // Sıradaki ajanın açıklaması sırası gelene dek "Sırada…" kalır; kendiliğinden çalışmaya başlayanınki temizlenir
    if (!calisanMi(durum) && this.esZamanlilik.siradaMi(ajanId)) alanlar.isAciklamasi = siraAciklamasi(this.yapilandirma.ayarlar.esZamanliAjan);
    else if (calisanMi(durum) && aciklama === undefined && siraAciklamasiMi(onceki.isAciklamasi)) alanlar.isAciklamasi = iki("Çalışıyor", "Working");
    this.depo.ajanGuncelle(ajanId, alanlar);
    if (durum === "bosta" || durum === "kapali" || durum === "hata" || durum === "duraklatildi") this.yaziyorBitir(ajanId);
    // CEO'nun projede ilk çalışması #genel'e duyurulur
    if (durum === "calisiyor" && onceki.rol === "ceo" && !this.depo.deger(`ceo-basladi:${onceki.projeId}`)) {
      this.depo.degerYaz(`ceo-basladi:${onceki.projeId}`, simdi());
      this.duyur(onceki.projeId, iki(`${onceki.ad} (CEO) işe başladı: brief'i okuyor, planı çıkaracak.`, `${onceki.ad} (CEO) started work: reading the brief and drafting the plan.`));
    }
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
          iki(
            "Turu kapatmadan defter_yaz ile defterini güncelle: ne yaptın, ne kaldı, kime ne söz verdin, sıradaki adım. Kalıcı bir karar ya da öğrenilen varsa hafiza_kaydet ile kaydet. Sonra dur.",
            "Before you end the turn, update your journal with defter_yaz: what you did, what is left, what you promised to whom, the next step. If there is a lasting decision or lesson, save it with hafiza_kaydet. Then stop.",
          ),
        ).catch(() => undefined);
      }
      // Tam otonom kipte süresi olmayan istekler (başkasının işe alım ve birleştirme isteği) unutulmasın
      if (onceki.rol === "ceo") this.ceoyaBekleyenleriHatirlat(onceki);
      this.bostaZamanlayicilari.set(
        ajanId,
        setTimeout(() => {
          if (this.depo.ajan(ajanId)?.durum === "bosta") this.oturumlar.get(ajanId)?.kapat();
        }, BOSTA_KAPATMA_MS),
      );
    } else if (tavanAciklamasi && bosaCikti) {
      // Kurul kararı bekleyen ajanın boşta kalan oturumu da bir süre sonra kapanır
      this.bostaZamanlayicilari.set(
        ajanId,
        setTimeout(() => this.oturumlar.get(ajanId)?.kapat(), BOSTA_KAPATMA_MS),
      );
    }
    this.ajanYayinla(ajanId);
    if (onceki.durum !== durum) this.projeYayinla(onceki.projeId);
    // Tam otonom kipte CEO karar veremez olunca (duraklatıldı, hatayla durdu) onu bekleyen onaylar kurula düşer
    if (onceki.rol === "ceo" && CEO_KARAR_VEREMEZ.includes(durum) && !CEO_KARAR_VEREMEZ.includes(onceki.durum)) this.ceoOnaylariniKurulaDevret(onceki.projeId);
    // Çalışan durumdan çıkan ajan tavanda yer açar: sıradakiler teslim edilir
    this.esZamanlilik.durumDegisti(ajanId, onceki.durum, durum);
  }

  private kullanimEkle(ajanId: string, delta: Toplam): void {
    const a = this.depo.ajan(ajanId);
    if (!a) return;
    this.depo.kullanimEkle(a.projeId, ajanId, delta.token);
    const y = this.depo.ajan(ajanId)!;
    this.olaylar.yayinla({ tur: "kullanim", projeId: a.projeId, ajanId, bugunToken: y.bugunToken, toplamToken: y.toplamToken });
    this.ajanYayinla(ajanId);
    // Görev token tavanı: token ajanın o anki görevine yazılır; aşıldıysa ajan durur, kurula sorulur
    this.gorevTavani.tokenEkle(ajanId, delta.token);
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
    if (!Array.isArray(kurallar)) throw new ArnorgHatasi(iki("Kurallar dizi olmalı.", "Rules must be an array."));
    for (const k of kurallar) {
      if (!k.id || !k.ad || !["izin", "ret", "sor"].includes(k.karar) || !["komut", "yol", "url", "arac"].includes(k.hedef)) {
        throw new ArnorgHatasi(iki(`Geçersiz kural: ${k.ad || k.id || "adsız"}`, `Invalid rule: ${k.ad || k.id || "unnamed"}`));
      }
      for (const d of k.desenler ?? []) {
        try {
          new RegExp(d, "i");
        } catch {
          throw new ArnorgHatasi(iki(`Geçersiz düzenli ifade (${k.ad}): ${d}`, `Invalid regular expression (${k.ad}): ${d}`));
        }
      }
    }
    this.depo.politikaYaz(projeId, kurallar);
    return kurallar;
  }

  /** altAjan: çağrıyı ajanın açtığı bir alt ajan yaptıysa onun kimliği (PreToolUse agent_id, canUseTool agentID) */
  private denetimKaydet(ajan: Ajan, arac: string, girdi: Record<string, unknown>, karar: Karar, kural: string | null, neden: string | null, aracKimligi?: string, altAjan?: string): void {
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
      altAjan: altAjan ?? null,
    });
    this.olaylar.yayinla({ tur: "denetim.kaydi", kayit });
  }

  private ret(neden: string): HookJSONOutput {
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: neden } };
  }

  /** PreToolUse: her araç çağrısı buradan geçer; altAjan, çağrıyı yapan alt ajanın kimliği (ana ajanın kendi çağrısında yok) */
  async kapi(ajanId: string, arac: string, girdi: Record<string, unknown>, aracKimligi?: string, altAjan?: string): Promise<HookJSONOutput> {
    const ajan = this.depo.ajan(ajanId);
    if (!ajan) return this.ret(iki("ArnOrg: ajan bulunamadı.", "ArnOrg: agent not found."));
    // Yetenekler: kapalı yeteneğin aracı (açık oturumda da) reddedilir; web araçları denetimden geçip kayda düşer
    const webGirdisi = webDenetimGirdisi(arac, girdi);
    if (!aracAcik(ajan, arac)) {
      const neden = kapaliYetenekNedeni(arac);
      this.denetimKaydet(ajan, arac, webGirdisi ?? girdi, "ret", iki("Yetenek kapalı", "Capability off"), neden, aracKimligi, altAjan);
      return this.ret(neden);
    }
    if (arac.startsWith("mcp__arnorg__") && !webGirdisi) return {};
    if (webGirdisi) girdi = webGirdisi;
    const proje = this.proje(ajan.projeId);
    const cwd = ajan.calismaAlani ?? proje.yol;

    // Abonelik kullanım sınırı: ajan işini bırakır, pencere açılınca ArnOrg uyandırır
    const sinir = this.hesap.sinir;
    if (sinir) {
      if (!this.sinirdaBekleyenler.has(ajanId)) this.sinirdaBekleyenler.set(ajanId, []);
      const neden = iki(
        `Abonelik ${sinir.pencere.toLocaleLowerCase("tr")} kullanımı %${sinir.yuzde} (kurulun sınırı %${sinir.sinirYuzde}). Başka araç çağırma; ne yaptığını ve sıradaki adımı iki cümleyle yaz ve dur. Pencere açılınca ArnOrg seni uyandıracak.`,
        `Subscription ${sinir.pencere.toLocaleLowerCase("en")} usage is at ${sinir.yuzde}% (the board's limit is ${sinir.sinirYuzde}%). Don't call any more tools; write what you did and your next step in two sentences, then stop. ArnOrg will wake you when the window opens.`,
      );
      this.denetimKaydet(ajan, arac, girdi, "ret", iki("Kullanım sınırı", "Usage limit"), neden, aracKimligi, altAjan);
      return this.ret(neden);
    }

    // Görev token tavanı aşıldı, kurul kararı bekleniyor: iş araçları kapalı (ArnOrg araçlarıyla soru yanıtlanabilir)
    const tavanNedeni = this.gorevTavani.kapiNedeni(ajanId);
    if (tavanNedeni) {
      this.denetimKaydet(ajan, arac, girdi, "ret", iki("Görev token tavanı", "Task token ceiling"), tavanNedeni, aracKimligi);
      return this.ret(tavanNedeni);
    }

    // Kurulun düzenlediği dosya
    if (YAZMA_ARACLARI.has(arac)) {
      const hedef = typeof girdi.file_path === "string" ? path.resolve(cwd, girdi.file_path) : null;
      const kilit = hedef ? this.kullaniciKilitleri.get(hedef) : undefined;
      if (hedef && kilit && kilit > Date.now()) {
        const neden = iki("Bu dosyayı şu an yönetim kurulu düzenliyor. Birkaç saniye sonra dosyayı yeniden oku ve sonra düzenle.", "The board is editing this file right now. Re-read the file in a few seconds, then edit it.");
        this.denetimKaydet(ajan, arac, girdi, "ret", iki("Kurul kilidi", "Board lock"), neden, aracKimligi, altAjan);
        return this.ret(neden);
      }
    }

    const sonuc = degerlendir([...anayasaPolitikasi(this.anayasa(proje.id)), ...this.politika(proje.id)], arac, girdi, { cwd, projeKoku: proje.yol, rol: ajan.rol });
    if (sonuc.karar === "ret") {
      this.denetimKaydet(ajan, arac, girdi, "ret", sonuc.kural, sonuc.neden, aracKimligi, altAjan);
      return this.ret(iki(`ArnOrg politikası reddetti. ${sonuc.neden ?? ""} Gerekliyse kurula_sor ile gerekçeli izin iste.`, `ArnOrg policy denied this. ${sonuc.neden ?? ""} If it is needed, ask the board for permission with reasons using kurula_sor.`));
    }
    if (sonuc.karar === "sor") {
      this.denetimKaydet(ajan, arac, girdi, "sor", sonuc.kural, sonuc.neden, aracKimligi, altAjan);
      const k = await this.kararBekle(ajan, "arac", `${ajan.ad} · ${arac}`, girdiOzeti(arac, girdi), { arac, girdi, kural: sonuc.kural, aracKimligi });
      this.denetimKaydet(ajan, arac, girdi, k.izin ? "izin" : "ret", denetimKarari(k), k.not, aracKimligi, altAjan);
      if (!k.izin) return this.ret(retMetni(k));
      this.yazmaKaydet(ajanId, cwd, arac, girdi);
      const veren = kararVerenAdi(k.kaynak, k.verenAd);
      return this.imzasiz(ajan, arac, girdi, aracKimligi, altAjan) ?? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: iki(`${veren} onayladı`, `${veren} approved`) } };
    }
    this.yazmaKaydet(ajanId, cwd, arac, girdi);
    const imzasiz = this.imzasiz(ajan, arac, girdi, aracKimligi, altAjan);
    if (imzasiz) return imzasiz;
    if (!SESSIZ_ARACLAR.has(arac)) this.denetimKaydet(ajan, arac, girdi, "izin", null, null, aracKimligi, altAjan);
    return {};
  }

  /** Commit komutundaki Claude imzasını siler ve çağrıyı değiştirilmiş girdiyle geçirir */
  private imzasiz(ajan: Ajan, arac: string, girdi: Record<string, unknown>, aracKimligi?: string, altAjan?: string): HookJSONOutput | null {
    const yeni = imzaAyikla(arac, girdi);
    if (!yeni) return null;
    const neden = iki("Commit mesajındaki Claude imzası çıkarıldı.", "The Claude signature was removed from the commit message.");
    this.denetimKaydet(ajan, arac, yeni, "degisti", iki("İmzasız commit", "Unsigned commit"), neden, aracKimligi, altAjan);
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
    const ekler = [this.hatirlatici.dosyaSonrasi(a, cwd, arac, girdi)];
    const y = typeof girdi.file_path === "string" ? girdi.file_path : null;
    if (y && YAZMA_ARACLARI.has(arac)) {
      const tam = path.resolve(cwd, y);
      const goreli = path.relative(cwd, tam).replace(/\\/g, "/");
      this.duzenlemeler.set(tam, { ajanId, zaman: Date.now() });
      this.olaylar.yayinla({ tur: "dosya.degisti", projeId: a.projeId, alan: a.calismaAlani ? a.id : "ana", yol: goreli, ajanId });
      ekler.push(this.hatirlatici.yazmaIzi(a, goreli));
    }
    if (!arac.startsWith("mcp__arnorg__")) {
      const iz = this.hatirlatmaIzleri.get(ajanId) ?? { arac: 0, son: Date.now() };
      iz.arac++;
      if (iz.arac >= HATIRLATMA_ARAC_ARALIGI || Date.now() - iz.son >= HATIRLATMA_SURE_MS) {
        iz.arac = 0;
        iz.son = Date.now();
        ekler.push(this.hatirlatma(a));
      }
      this.hatirlatmaIzleri.set(ajanId, iz);
    }
    const ek = ekler.filter(Boolean).join("\n\n");
    return ek || null;
  }

  /** Claude Code'un izin sorduğu çağrı (bypass dışı modlar, plan onayı) */
  private async izinSor(ajanId: string, arac: string, girdi: Record<string, unknown>, aracKimligi?: string, altAjan?: string): Promise<PermissionResult> {
    const ajan = this.depo.ajan(ajanId);
    if (!ajan) return { behavior: "deny", message: iki("Ajan bulunamadı.", "Agent not found.") };
    if (arac.startsWith("mcp__arnorg__")) return { behavior: "allow", updatedInput: girdi };
    const planMi = arac === "ExitPlanMode";
    const baslik = planMi ? iki(`${ajan.ad} · Plan onayı`, `${ajan.ad} · Plan approval`) : iki(`${ajan.ad} · ${arac} izni istiyor`, `${ajan.ad} · requests ${arac}`);
    const ayrinti = planMi ? String(girdi.plan ?? "") : girdiOzeti(arac, girdi);
    const k = await this.kararBekle(ajan, "arac", baslik, ayrinti, { arac, girdi, kural: iki("Claude Code izin sorusu", "Claude Code permission prompt"), aracKimligi });
    this.denetimKaydet(ajan, arac, girdi, k.izin ? "izin" : "ret", denetimKarari(k), k.not, aracKimligi, altAjan);
    return k.izin ? { behavior: "allow", updatedInput: girdi } : { behavior: "deny", message: retMetni(k) };
  }

  // ===================================================================
  // Onaylar ve karar yetkisi: tam otonom kipte (kararVeren "ceo") CEO karar verir, kurul kipinde kurul
  // ===================================================================

  /** Onay açar ve kararı bekler (kurul ya da tam otonom kipte CEO); süre dolarsa ret */
  kararBekle(ajan: Ajan | null, tur: OnayTuru, baslik: string, ayrinti: string, veri: unknown, projeId?: string): Promise<KurulKarari> {
    const sure = this.yapilandirma.ayarlar.onaySuresiSn;
    const pid = ajan?.projeId ?? projeId!;
    const onay = this.depo.onayEkle({
      projeId: pid,
      ajanId: ajan?.id ?? null,
      tur,
      baslik,
      ayrinti,
      veri,
      sonGecerlilik: new Date(Date.now() + sure * 1000).toISOString(),
      muhatap: this.muhatapBul(pid, ajan, tur),
    });
    this.olaylar.yayinla({ tur: "onay.yeni", onay });
    this.projeYayinla(onay.projeId);
    if (ajan) this.durumDegisti(ajan.id, "karar_bekliyor", iki(`Onay bekliyor: ${kisalt(baslik, 60)}`, `Awaiting approval: ${kisalt(baslik, 60)}`));
    const karar = new Promise<KurulKarari>((coz) => {
      const zamanlayici = setTimeout(() => {
        this.bekleyenKararlar.delete(onay.id);
        this.ceoyaHatirlatilan.delete(onay.id);
        const not = iki("Süre doldu", "Timed out");
        const son = this.depo.onaySonuclandir(onay.id, "zaman_asimi", not);
        this.olaylar.yayinla({ tur: "onay.sonuc", onay: son });
        this.projeYayinla(son.projeId);
        coz({ izin: false, not, zamanAsimi: true });
      }, sure * 1000);
      this.bekleyenKararlar.set(onay.id, {
        zamanlayici,
        coz: (s) => {
          clearTimeout(zamanlayici);
          this.bekleyenKararlar.delete(onay.id);
          if (ajan && this.depo.ajan(ajan.id)?.durum === "karar_bekliyor") this.durumDegisti(ajan.id, "calisiyor", iki("Devam ediyor", "Continuing"));
          coz(s);
        },
      });
    });
    // Bekleyen karar kaydedildikten sonra işlenir (otomatik onay ve CEO'nun kendi kararı hemen çözer)
    this.onayIsle(onay, ajan);
    return karar;
  }

  /** Beklemeden karar isteği açar (işe alım, birleştirme, ana yasa, teslim teklifleri) */
  teklifAc(ajan: Ajan, tur: OnayTuru, baslik: string, ayrinti: string, veri: unknown): Onay {
    const onay = this.depo.onayEkle({ projeId: ajan.projeId, ajanId: ajan.id, tur, baslik, ayrinti, veri, sonGecerlilik: null, muhatap: this.muhatapBul(ajan.projeId, ajan, tur) });
    this.olaylar.yayinla({ tur: "onay.yeni", onay });
    this.projeYayinla(ajan.projeId);
    this.onayIsle(onay, ajan);
    return onay;
  }

  /** Yeni onayın ilk işlenişi bir sonraki döngüde başlar; onayIslendi ile beklenebilir */
  private onayIsle(onay: Onay, ajan: Ajan | null): void {
    const is = new Promise<void>((coz) =>
      setImmediate(() => {
        this.onayGeldi(onay, ajan)
          .catch((h) => this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: onay.projeId }))
          .finally(() => {
            this.onayIsleri.delete(onay.id);
            coz();
          });
      }),
    );
    this.onayIsleri.set(onay.id, is);
  }

  /** Onayın ilk işlenişi (otomatik onay, CEO kararı ya da kurula bildirim) bitince son hâli; araçlar sonucu buna göre söyler */
  async onayIslendi(onayId: string): Promise<Onay | null> {
    await this.onayIsleri.get(onayId);
    return this.depo.onay(onayId);
  }

  /** Projenin CEO'su (karar verip veremediğine bakılmaz) */
  ceoBul(projeId: string): Ajan | null {
    return this.depo.ajanlar(projeId).find((a) => a.rol === "ceo") ?? null;
  }

  /** Tam otonom kipte karar verecek CEO: proje CEO kipinde, CEO var, duraklatılmamış ve hatayla durmamış; yoksa null (kurula düşer) */
  kararCeosu(projeId: string): Ajan | null {
    if (this.depo.proje(projeId)?.kararVeren !== "ceo") return null;
    const ceo = this.ceoBul(projeId);
    return ceo && !CEO_KARAR_VEREMEZ.includes(ceo.durum) ? ceo : null;
  }

  /** Tam otonom kipte CEO'nun kararını bekleyen onaylar, en eskisi önce */
  ceoyuBekleyenler(projeId: string): Onay[] {
    if (this.depo.proje(projeId)?.kararVeren !== "ceo") return [];
    return this.depo
      .onaylar(projeId, "bekliyor")
      .filter((o) => o.muhatap === "ceo")
      .reverse();
  }

  /** Onayın muhatabı: tam otonom kipte CEO (CEO'nun kendi kurula sorusu ve token tavanı hariç); CEO karar veremiyorsa ve kurul kipinde kurul */
  private muhatapBul(projeId: string, ajan: Ajan | null, tur: OnayTuru): KararVeren {
    const ceo = this.kararCeosu(projeId);
    if (!ceo || !ajan) return "kurul";
    return ajan.id === ceo.id && tur === "genel" ? "kurul" : "ceo";
  }

  /** Bekleyen onayın muhatabını yazar ve yayınlar; değişmediyse dokunmaz */
  private muhatapYaz(onay: Onay, muhatap: KararVeren): Onay {
    if (onay.muhatap === muhatap) return onay;
    const yeni = this.depo.onayMuhatabiYaz(onay.id, muhatap) ?? onay;
    this.olaylar.yayinla({ tur: "onay.sonuc", onay: yeni });
    return yeni;
  }

  /** Yeni onay: muhatabı CEO ise (karar verebiliyorsa) CEO'ya yönelir; değilse kurul akışı */
  private async onayGeldi(onay: Onay, ajan: Ajan | null): Promise<void> {
    const guncel = this.depo.onay(onay.id);
    if (!this.depo.proje(onay.projeId) || guncel?.durum !== "bekliyor") return;
    if (guncel.muhatap === "ceo") {
      const ceo = this.kararCeosu(onay.projeId);
      if (ceo) return this.ceoyaYonelt(guncel, ajan, ceo);
      // Bu arada CEO karar veremez oldu (duraklatıldı, hata, kip değişti): kurula düşer
      return this.kurulAkisi(this.muhatapYaz(guncel, "kurul"), ajan);
    }
    return this.kurulAkisi(guncel, ajan);
  }

  /** Kurul akışı: kurul kipinde otomatik onay kapsamındaysa hemen verilir; değilse kurula her ekranda açılır pencere gider */
  private async kurulAkisi(onay: Onay, ajan: Ajan | null): Promise<void> {
    const p = this.depo.proje(onay.projeId);
    if (!p) return;
    if (p.kararVeren === "kurul" && p.otomatikOnay.etkin && p.otomatikOnay.turler.includes(onay.tur)) {
      await this.onayKarari(onay.id, "onayla", undefined, { kaynak: "otomatik" }).catch((h) =>
        this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: onay.projeId }),
      );
      return;
    }
    const tur: KurulBildirimi["tur"] = onay.tur === "teslim" ? "teslim" : onay.tur === "arac" ? "yetki" : onay.tur === "genel" ? "istek" : "onay";
    this.kurulaBildir(ajan, onay.projeId, tur, onay.baslik, kisalt(onay.ayrinti, 800), onay.id);
  }

  /** Tam otonom kip: CEO'nun kendi teklifi hemen onun kararıyla geçer; başkasınınki CEO'ya mesaj olarak gider (kurula pencere açılmaz) */
  private async ceoyaYonelt(onay: Onay, ajan: Ajan | null, ceo: Ajan): Promise<void> {
    if (ajan?.id === ceo.id && CEO_KENDI_KARARI.includes(onay.tur)) {
      await this.onayKarari(onay.id, "onayla", ceoKendiNotu(), ceoKarari(ceo)).catch((h) =>
        this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: onay.projeId }),
      );
      return;
    }
    void this.sistemMesaji(ceo.id, ceoOnayMesaji(onay, ajan, (id) => this.depo.ajan(id)?.ad ?? null));
  }

  /** Karar yetkisi değişti: duyurulur, CEO'ya yetkisi söylenir, bekleyen onaylar yeni muhataplarına yönelir */
  private async kararKipiDegisti(projeId: string, kip: KararVeren): Promise<void> {
    const ceo = this.ceoBul(projeId);
    this.duyur(
      projeId,
      kip === "ceo"
        ? iki(
            `Kurul karar yetkisini ${ceo ? `CEO ${yonelme(ceo.ad)}` : "CEO'ya"} bıraktı: izinler, birleştirmeler, işe alımlar ve öteki onaylar artık CEO'dan geçer; kurul sonuçları görür.`,
            `The board handed decision authority to ${ceo ? `CEO ${ceo.ad}` : "the CEO"}: permissions, merges, hires and the other approvals now go through the CEO; the board sees the results.`,
          )
        : iki("Kurul karar yetkisini geri aldı: onaylar yeniden kurula gelir.", "The board took decision authority back: approvals come to the board again."),
    );
    const ceoya: Onay[] = [];
    for (const o of this.depo.onaylar(projeId, "bekliyor").reverse()) {
      const ajan = o.ajanId ? this.depo.ajan(o.ajanId) : null;
      const muhatap = this.muhatapBul(projeId, ajan, o.tur);
      // 0.0.7 öncesi bekleyen onaylar kurula açılmıştı
      if ((o.muhatap ?? "kurul") === muhatap) continue;
      const guncel = this.muhatapYaz(o, muhatap);
      if (muhatap === "kurul") await this.kurulAkisi(guncel, ajan);
      else if (ceo && ajan?.id === ceo.id) await this.ceoyaYonelt(guncel, ajan, ceo);
      else ceoya.push(guncel);
    }
    if (ceo) void this.sistemMesaji(ceo.id, [kipMesaji(kip), ...(ceoya.length ? [ceoOnayListesi(ceoya, (id) => (id ? this.depo.ajan(id) : null))] : [])].join("\n\n"));
  }

  /** CEO karar veremez oldu (duraklatıldı ya da hatayla durdu): onu bekleyen onaylar kurula düşer, pencereleri açılır */
  private ceoOnaylariniKurulaDevret(projeId: string): void {
    for (const o of this.ceoyuBekleyenler(projeId)) {
      const ajan = o.ajanId ? this.depo.ajan(o.ajanId) : null;
      void this.kurulAkisi(this.muhatapYaz(o, "kurul"), ajan);
    }
  }

  /** CEO boşa çıktı: onu bir süredir bekleyen ve henüz hatırlatılmamış onaylar bir kez hatırlatılır */
  private ceoyaBekleyenleriHatirlat(ceo: Ajan): void {
    const esik = Date.now() - CEO_HATIRLATMA_MS;
    const liste = this.ceoyuBekleyenler(ceo.projeId).filter((o) => !this.ceoyaHatirlatilan.has(o.id) && Date.parse(o.olusturma) <= esik);
    if (!liste.length) return;
    for (const o of liste) this.ceoyaHatirlatilan.add(o.id);
    void this.sistemMesaji(ceo.id, ceoOnayListesi(liste, (id) => (id ? this.depo.ajan(id) : null), true));
  }

  /** Onay kararı: kurul (Stüdyo; varsayılan), otomatik onay ya da tam otonom kipte CEO (onay_karari) */
  async onayKarari(onayId: string, karar: "onayla" | "reddet", not?: string, veren: KararSahibi = KURUL_KARARI): Promise<Onay> {
    const onay = this.depo.onay(onayId);
    if (!onay) throw bulunamadi("Onay", "Approval");
    if (onay.durum !== "bekliyor") throw new ArnorgHatasi(iki("Bu onay zaten sonuçlanmış.", "This approval has already been decided."), 409);
    const izin = karar === "onayla";
    const otomatik = veren.kaynak === "otomatik";
    const temizNot = not?.trim() || (otomatik ? iki("Otomatik onay", "Auto-approved") : null);
    const verenAd = veren.ad ?? kararSahibiEtiketi(veren.kaynak);
    const son = this.depo.onaySonuclandir(onayId, izin ? "onaylandi" : "reddedildi", temizNot, { kaynak: veren.kaynak, ad: verenAd });
    this.olaylar.yayinla({ tur: "onay.sonuc", onay: son });
    this.ceoyaHatirlatilan.delete(onayId);
    const bekleyen = this.bekleyenKararlar.get(onayId);
    if (bekleyen) bekleyen.coz({ izin, not: temizNot, kaynak: veren.kaynak, verenAd });

    const sahip: KararSahibi = { kaynak: veren.kaynak, ad: verenAd };
    try {
      if (onay.tur === "ise_alim") await this.iseAlimSonucu(onay, izin, temizNot, sahip);
      else if (onay.tur === "birlestirme") await this.birlestirmeSonucu(onay, izin, temizNot, sahip);
      else if (onay.tur === "anayasa") await this.anayasaSonucu(onay, izin, temizNot, sahip);
      else if (onay.tur === "isten_cikarma") await this.istenCikarmaSonucu(onay, izin, temizNot, sahip);
      else if (onay.tur === "teslim") await this.teslimSonucu(onay, izin, temizNot, sahip, !not?.trim() && otomatik);
    } catch (h) {
      this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: onay.projeId });
    }
    this.projeYayinla(onay.projeId);
    return this.depo.onay(onayId)!;
  }

  /** Tam otonom kipte CEO kendi teklifine karar verdi: sonucu aracın yanıtında görür, ayrıca mesaj gönderilmez */
  private kendiKarari(onay: Onay, veren: KararSahibi): boolean {
    return veren.kaynak === "ceo" && !!onay.ajanId && this.depo.ajan(onay.ajanId)?.rol === "ceo";
  }

  private async iseAlimSonucu(onay: Onay, izin: boolean, not: string | null, veren: KararSahibi): Promise<void> {
    const veri = onay.veri as AjanIseAlIstegi & { yoneticiAd?: string | null };
    const teklifEden = onay.ajanId ? this.depo.ajan(onay.ajanId) : null;
    const kendi = this.kendiKarari(onay, veren);
    if (!izin) {
      if (teklifEden && !kendi) {
        const notu = notCumlesi(veren, not);
        await this.sistemMesaji(teklifEden.id, iki(`İşe alım teklifin reddedildi: ${veri.ad} (${veri.rol}).${notu}`, `Your hiring proposal was rejected: ${veri.ad} (${veri.rol}).${notu}`));
      }
      return;
    }
    let yoneticiId = veri.yoneticiId ?? null;
    if (veri.yoneticiAd) yoneticiId = this.depo.ajanAdla(onay.projeId, veri.yoneticiAd)?.id ?? yoneticiId;
    const yeni = this.iseAl(onay.projeId, { ...veri, yoneticiId: yoneticiId ?? teklifEden?.id ?? null });
    const rolAdi = rolAdiDilde(yeni);
    this.kanalMesaji(onay.projeId, "genel", { id: "arnorg", ad: "ArnOrg" }, iki(`${yeni.ad} (${rolAdi}) ekibe katıldı.`, `${yeni.ad} (${rolAdi}) joined the team.`));
    this.hafiza.yaz(
      onay.projeId,
      { tur: "uzmanlik", baslik: `${yeni.ad} · ${rolAdi}`, metin: kisalt(onay.ayrinti.split("\n\n")[0] ?? onay.ayrinti, 600), etiketler: [yeni.rol], onem: 3 },
      { ajan: null, ad: "ArnOrg" },
    );
    if (teklifEden && !kendi) {
      const notu = notCumlesi(veren, not);
      await this.sistemMesaji(
        teklifEden.id,
        iki(
          `İşe alım onaylandı: ${yeni.ad} (${rolAdi}) ekipte.${notu} Görev atayıp 'calisiliyor' durumuna aldığında çalışmaya başlar.`,
          `Hire approved: ${yeni.ad} (${rolAdi}) is on the team.${notu} They start working once you assign them a task and move it to 'calisiliyor'.`,
        ),
      );
    }
  }

  private async anayasaSonucu(onay: Onay, izin: boolean, not: string | null, veren: KararSahibi): Promise<void> {
    const veri = onay.veri as { maddeler?: unknown };
    const oneren = onay.ajanId ? this.depo.ajan(onay.ajanId) : null;
    const kendi = this.kendiKarari(onay, veren);
    if (!izin) {
      if (oneren && !kendi) {
        const notu = notCumlesi(veren, not);
        await this.sistemMesaji(
          oneren.id,
          veren.kaynak === "ceo"
            ? iki(`Ana yasa önerin reddedildi.${notu} CEO ile konuşup düzelt ve yeniden öner.`, `Your constitution proposal was rejected.${notu} Discuss it with the CEO, fix it and propose again.`)
            : iki(`Ana yasa önerin reddedildi.${notu} Kurulla #yonetim kanalında konuşup düzelt ve yeniden öner.`, `Your constitution proposal was rejected.${notu} Discuss it with the board in #ceo, fix it and propose again.`),
        );
      }
      return;
    }
    const yeni = this.anayasaGuncelle(onay.projeId, veri.maddeler, kararSahibiEtiketi(veren.kaynak, veren.ad));
    if (oneren && !kendi) await this.sistemMesaji(oneren.id, iki(`Ana yasa onaylandı (sürüm ${yeni.surum}). Artık herkes uyuyor; ekibe kısaca duyur.`, `The constitution was approved (version ${yeni.surum}). Everyone follows it now; announce it briefly to the team.`));
  }

  /**
   * İşten çıkarma: çalışanın bildikleri (kişisel hafıza, defter, açık sözler) ve açık görevleri devralana geçer,
   * oturumu kapanır, kaydı silinir. Devralan verilmezse yöneticisi, o da yoksa CEO devralır.
   */
  async istenCikar(id: string, devralanId: string | null, kim: string): Promise<{ devralan: Ajan | null }> {
    const a = this.ajan(id);
    if (a.rol === "ceo") throw new ArnorgHatasi(iki("CEO işten çıkarılamaz.", "The CEO cannot be dismissed."), 409);
    const ekip = this.depo.ajanlar(a.projeId);
    const devralan = (devralanId ? ekip.find((x) => x.id === devralanId) : null) ?? (a.yoneticiId ? ekip.find((x) => x.id === a.yoneticiId) : null) ?? ekip.find((x) => x.rol === "ceo") ?? null;
    const aktarilan = devralan && devralan.id !== a.id ? devralan : null;
    if (aktarilan) {
      try {
        this.zeka.aktar(a, aktarilan, { sozler: true, not: iki(`${a.ad} ekipten ayrıldı (${kim}).`, `${a.ad} left the team (${kim}).`), defter: this.hafiza.defter(a), defterYaz: (x, icerik) => this.defterYaz(x.id, icerik) });
      } catch {
        // aktarım olmasa da görevler devredilir
      }
      for (const g of this.depo.gorevler(a.projeId)) {
        if (g.atananId === a.id && g.durum !== "tamam" && g.durum !== "iptal") {
          const gorev = this.depo.gorevGuncelle(g.id, { atananId: aktarilan.id, durum: g.durum === "calisiliyor" ? "planlandi" : g.durum });
          this.olaylar.yayinla({ tur: "gorev.guncellendi", gorev });
        }
      }
    }
    const temizlik = this.ajanSil(id);
    this.duyur(
      a.projeId,
      iki(
        `${a.ad} (${rolAdiDilde(a)}) ekipten ayrıldı${aktarilan ? `; açık işleri ve bildikleri ${yonelme(aktarilan.ad)} devredildi` : ""}.`,
        `${a.ad} (${rolAdiDilde(a)}) left the team${aktarilan ? `; open work and knowledge were handed over to ${aktarilan.ad}` : ""}.`,
      ),
    );
    // Çalışma alanı notu (kirliyse) ayrılık duyurusundan sonra gelir
    await temizlik;
    return { devralan: aktarilan };
  }

  private async istenCikarmaSonucu(onay: Onay, izin: boolean, not: string | null, veren: KararSahibi): Promise<void> {
    const veri = onay.veri as { ajanId: string; devralanId?: string | null; ad?: string };
    const oneren = onay.ajanId ? this.depo.ajan(onay.ajanId) : null;
    const kendi = this.kendiKarari(onay, veren);
    if (!izin) {
      if (oneren && !kendi) {
        const notu = notCumlesi(veren, not);
        await this.sistemMesaji(oneren.id, iki(`${veri.ad ?? "Çalışan"} için işten çıkarma teklifin reddedildi.${notu}`, `Your proposal to let ${veri.ad ?? "the employee"} go was rejected.${notu}`));
      }
      return;
    }
    if (!this.depo.ajan(veri.ajanId)) return;
    const { devralan } = await this.istenCikar(veri.ajanId, veri.devralanId ?? null, kararSahibiEtiketi(veren.kaynak, veren.ad));
    if (oneren && !kendi && this.depo.ajan(oneren.id)) {
      await this.sistemMesaji(oneren.id, iki(`${veri.ad ?? "Çalışan"} ekipten çıkarıldı.${devralan ? ` İşleri ${yonelme(devralan.ad)} devredildi.` : ""} Planı buna göre güncelle.`, `${veri.ad ?? "The employee"} was let go.${devralan ? ` Their work went to ${devralan.ad}.` : ""} Update the plan accordingly.`));
    }
  }

  /**
   * Teslimin sonucu. Kurul kipinde kurul dener; kabul ya da geri bildirim. Tam otonom kipte CEO'nun kabul ettiği teslim
   * kurula sonuç olarak iletilir (karar düğmesiz bilgi penceresi) ve CEO sıradaki hedefe geçer.
   * otomatikNot: not, kurulun yazdığı değil otomatik onayın notu (duyuruda gösterilmez)
   */
  private async teslimSonucu(onay: Onay, izin: boolean, not: string | null, veren: KararSahibi, otomatikNot = false): Promise<void> {
    const veri = onay.veri as { baslik?: string; ozet?: string };
    const oneren = onay.ajanId ? this.depo.ajan(onay.ajanId) : null;
    const baslik = veri.baslik ?? onay.baslik;
    const ceoVerdi = veren.kaynak === "ceo";
    if (izin) {
      const kurulNotu = otomatikNot ? null : not;
      this.duyur(
        onay.projeId,
        ceoVerdi
          ? iki(`Teslim: ${baslik} — sonuç kurula iletildi.`, `Delivery: ${baslik} — the result was passed to the board.`)
          : iki(`Kurul teslimi kabul etti: ${baslik}.${kurulNotu ? ` Not: ${kurulNotu}` : ""}`, `The board accepted the delivery: ${baslik}.${kurulNotu ? ` Note: ${kurulNotu}` : ""}`),
      );
      this.hafiza.yaz(onay.projeId, { tur: "ozet", baslik: iki(`Teslim: ${kisalt(baslik, 100)}`, `Delivery: ${kisalt(baslik, 100)}`), metin: kisalt(veri.ozet ?? onay.ayrinti, 800), etiketler: ["teslim"], onem: 3 }, { ajan: oneren, ad: "ArnOrg" });
      if (!ceoVerdi) {
        if (oneren) await this.sistemMesaji(oneren.id, iki(`Kurul teslimi kabul etti: ${baslik}.${not ? ` Not: ${not}` : ""} Sıradaki hedefi planla ya da kurula ne yapılacağını sor.`, `The board accepted the delivery: ${baslik}.${not ? ` Note: ${not}` : ""} Plan the next goal or ask the board what comes next.`));
        return;
      }
      // Kurul sonucu görür: özet, test adımları, çalıştırma komutu ve adres; onay sonuçlandığı için karar düğmesi yoktur
      this.kurulaBildir(oneren ?? this.ceoBul(onay.projeId), onay.projeId, "teslim", onay.baslik, onay.ayrinti, onay.id);
      if (oneren?.rol === "ceo") {
        await this.sistemMesaji(
          oneren.id,
          iki(
            `"${baslik}" teslimi kurula sonuç olarak iletildi. Kabul bekleme; sıradaki hedefe geç. Kurulun geri bildirimi olursa CEO sohbetinden sana iş olarak gelir.`,
            `The "${baslik}" delivery was passed to the board as a result. Don't wait for acceptance; move on to the next goal. If the board has feedback, it will come to you as work through the CEO chat.`,
          ),
        );
      } else if (oneren) {
        const notu = notCumlesi(veren, not);
        await this.sistemMesaji(oneren.id, iki(`CEO "${baslik}" teslimini kabul etti; sonuç kurula iletildi.${notu}`, `The CEO accepted the "${baslik}" delivery; the result was passed to the board.${notu}`));
      }
      return;
    }
    const ozne = kararOznesi(veren.kaynak, veren.ad);
    this.duyur(
      onay.projeId,
      ceoVerdi
        ? iki(`${ozne} teslimi değerlendirdi ve geri bildirim verdi: ${not ?? "ayrıntı yok"}`, `${ozne} reviewed the delivery and gave feedback: ${not ?? "no details"}`)
        : iki(`Kurul teslimi denedi ve geri bildirim verdi: ${not ?? "ayrıntı yok"}`, `The board tried the delivery and gave feedback: ${not ?? "no details"}`),
    );
    if (oneren) {
      await this.sistemMesaji(
        oneren.id,
        ceoVerdi
          ? iki(
              `${ozne} "${baslik}" teslimini değerlendirdi ve geri bildirim verdi:\n${not ?? "(not yok)"}\n\nGeri bildirimi görevlere çevir, ilgili kişilere ata; düzelince yeniden teslim_et ile sun.`,
              `${ozne} reviewed the "${baslik}" delivery and gave feedback:\n${not ?? "(no note)"}\n\nTurn the feedback into tasks and assign them; once fixed, submit again with teslim_et.`,
            )
          : iki(
              `Kurul "${baslik}" teslimini denedi ve geri bildirim verdi:\n${not ?? "(not yok)"}\n\nGeri bildirimi görevlere çevir, ilgili kişilere ata; düzelince yeniden teslim_et ile sun.`,
              `The board tried the "${baslik}" delivery and gave feedback:\n${not ?? "(no note)"}\n\nTurn the feedback into tasks and assign them; once fixed, submit again with teslim_et.`,
            ),
      );
    }
  }

  // ===================================================================
  // Hazırlık görüşmesi: CEO kurulla amaç, tercihler, ana yasa, ilk ekip ve ilk planı konuşur
  // ===================================================================

  async hazirlikBaslat(projeId: string): Promise<ProjeOzeti> {
    const p = this.proje(projeId);
    const ceo = this.depo.ajanlar(projeId).find((a) => a.rol === "ceo") ?? this.iseAl(projeId, { ad: "Ada", rol: "ceo" });
    this.depo.projeGuncelle(projeId, { hazirlik: "suruyor" });
    this.duyur(projeId, iki(`Hazırlık başladı: ${ceo.ad} (CEO) kurulla #yonetim kanalında projenin amacını, kurallarını ve ekibini konuşuyor.`, `Kickoff started: ${ceo.ad} (CEO) is discussing the project's goal, rules and team with the board in #ceo.`));
    this.yaziyorBaslat(ceo, "yonetim");
    await this.ajanaMesaj(ceo.id, hazirlikTalimati(p.ad), "next", { tur: "kurul" });
    this.projeYayinla(projeId);
    return this.projeOzeti(projeId);
  }

  hazirlikBitir(projeId: string, ozet: string, ajan: Ajan | null): ProjeOzeti {
    this.proje(projeId);
    this.depo.projeGuncelle(projeId, { hazirlik: "tamam" });
    this.duyur(projeId, iki(`Hazırlık tamamlandı. ${kisalt(ozet, 600)}`, `Kickoff complete. ${kisalt(ozet, 600)}`));
    this.kurulaBildir(ajan, projeId, "bilgi", iki("Hazırlık tamamlandı", "Kickoff complete"), ozet);
    this.projeYayinla(projeId);
    return this.projeOzeti(projeId);
  }

  /** CEO'dan brifing ister: Karargâh'taki düğme (kurul) ya da günlük zamanlayıcı; CEO yoksa 409 (brifing.ts) */
  brifingIste(projeId: string, kaynak: BrifingKaynagi): Promise<BrifingYaniti> {
    return this.brifing.iste(projeId, kaynak);
  }

  private async birlestirmeSonucu(onay: Onay, izin: boolean, not: string | null, veren: KararSahibi): Promise<void> {
    const veri = onay.veri as { ajanId: string; dal: string; ozet: string; isteyenId?: string };
    const sahip = this.depo.ajan(veri.ajanId);
    const isteyen = veri.isteyenId ? this.depo.ajan(veri.isteyenId) : sahip;
    if (!izin) {
      // Tam otonom kipte reddeden CEO anılır: "arnorg/deniz birleştirmesi reddedildi (CEO Ada)."
      const kim = veren.kaynak === "ceo" ? ` (${kararOznesi(veren.kaynak, veren.ad)})` : "";
      if (isteyen) await this.sistemMesaji(isteyen.id, iki(`${veri.dal} birleştirmesi reddedildi${kim}.${not ? ` Not: ${not}` : ""}`, `The merge of ${veri.dal} was rejected${kim}.${not ? ` Note: ${not}` : ""}`));
      return;
    }
    // Kalite kapısı: iş projenin birleştirme kuyruğuna girer; sırası gelince kalite çalışma alanında test edilir,
    // geçerse ana repoda birleştirilir, geçmezse dal sahibine düzeltmesi söylenir (birlestirme-kuyrugu.ts)
    this.birlestirmeKuyrugu.ekle(onay);
  }

  /** Kalite kapısını geçen iş ana repoda birleşti: görevler tamam, duyuru, uzak depoya gönderim, hafıza */
  private async birlesmeSonrasi(onay: Onay): Promise<void> {
    const veri = birlestirmeVerisi(onay.veri);
    const proje = this.depo.proje(onay.projeId);
    if (!veri || !proje) return;
    const sahip = this.depo.ajan(veri.ajanId);
    for (const g of this.depo.gorevler(proje.id)) {
      if (g.atananId === veri.ajanId && g.durum === "inceleme") await this.gorevGuncelle(g.id, { durum: "tamam" });
    }
    const k = veri.kalite;
    const kapi = k?.testsiz
      ? iki(" Kurul testsiz birleştirdi.", " The board merged it without tests.")
      : k && !k.testYok && k.komut
        ? iki(` Testler geçti (${k.komut}${k.sureMs ? `, ${sureMetni(k.sureMs)}` : ""}).`, ` Tests passed (${k.komut}${k.sureMs ? `, ${sureMetni(k.sureMs)}` : ""}).`)
        : "";
    this.kanalMesaji(proje.id, "genel", { id: ARNORG_GONDEREN, ad: "ArnOrg" }, iki(`${veri.dal} ${proje.varsayilanDal} dalına birleştirildi.${kapi} ${kisalt(veri.ozet, 200)}`, `${veri.dal} was merged into ${proje.varsayilanDal}.${kapi} ${kisalt(veri.ozet, 200)}`));
    // Uzak depo varsa ve otomatik gönderim açıksa çalışma dalı gönderilir
    if (proje.uzakAdres && proje.otomatikGonder) {
      void this.github
        .gonder(proje)
        .then((g) => {
          if (g.durum === "gonderildi") this.kanalMesaji(proje.id, "genel", { id: ARNORG_GONDEREN, ad: "ArnOrg" }, g.mesaj);
          else this.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin: g.mesaj, projeId: proje.id });
        })
        .catch((h) => this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId: proje.id }));
    }
    this.hafiza.yaz(
      proje.id,
      { tur: "ozet", baslik: `${veri.dal} → ${proje.varsayilanDal}`, metin: kisalt(veri.ozet, 800), etiketler: ["birlestirme"], onem: 2 },
      { ajan: sahip, ad: "ArnOrg" },
    );
    this.projeYayinla(proje.id);
  }

  // ===================================================================
  // Görevler
  // ===================================================================

  /** Görev metnine eklenen "İlgili kod": dizin hazırsa görev başlığı ve açıklamasıyla kod araması (en çok ~1,5 sn) */
  async ilgiliKod(g: Gorev): Promise<string> {
    try {
      const atanan = g.atananId ? this.depo.ajan(g.atananId) : null;
      const ajanAlani = atanan ? this.ajanAlani(atanan) : "ana";
      const alan = this.kodZekasi.hazirMi(g.projeId, ajanAlani) ? ajanAlani : this.kodZekasi.hazirMi(g.projeId, "ana") ? "ana" : null;
      if (!alan) return "";
      const sorgu = kisalt(`${g.baslik}\n${g.aciklama}`, 600);
      const arama = this.kodZekasi.ara(g.projeId, alan, sorgu, { sinir: 8, zamanAsimiMs: 1200, bekleMs: 0 });
      const y = await Promise.race([arama, new Promise<null>((coz) => setTimeout(() => coz(null), 1500).unref())]);
      if (!y) return "";
      const liste = konumListesi({ ...y, sonuclar: y.sonuclar.filter((r) => r.puan >= 0.25) }, 5);
      return liste ? iki(`İlgili kod (kod zekâsı önerisi; kod_ara ve Read ile doğrula):\n${liste}`, `Related code (code intelligence suggestion; verify with kod_ara and Read):\n${liste}`) : "";
    } catch {
      return "";
    }
  }

  /**
   * Görev mesajı: tanım, bağımlılıklar, göreve bağlı ve ilgili hafıza, görev hakkında sorulup yanıtlananlar.
   * Görev başka birinden devralınıyorsa önceki sahibin defteri de eklenir; iş kaldığı yerden sürer.
   */
  gorevMetni(g: Gorev, oncekiSahipId: string | null = null, ilgiliKod = ""): string {
    const bagimli = g.bagimliliklar
      .map((id) => this.depo.gorev(id))
      .filter(Boolean)
      .map((b) => `${b!.kod} ${b!.baslik} (${b!.durum})`);
    const bagli = this.depo.hafizaKayitlari(g.projeId, { sinir: 500 }).filter((k) => k.gorevId === g.id);
    const turAdi = (k: HafizaKaydi) => iki(HAFIZA_TURU_ADLARI[k.tur], AD_HARITALARI_EN.hafizaTuru[k.tur]);
    const bagliMetin = bagli.length
      ? [iki("\nBu görevle ilgili hafıza:", "\nMemory related to this task:"), ...bagli.slice(0, 6).map((k) => `- [${turAdi(k)}] ${k.baslik}: ${kisalt(k.metin, 260)} (${k.kaynakAd})`)].join("\n")
      : "";
    const ilgili = this.hafiza.ilgili(g.projeId, `${g.baslik} ${g.aciklama} ${g.etiket}`, 5, new Set(bagli.map((k) => k.id)));
    const kodDeseni = new RegExp(`\\b${g.kod}\\b`);
    const sorular = this.depo
      .sorular(g.projeId, { durum: "yanitlandi", sinir: 200 })
      .filter((x) => kodDeseni.test(x.soru) || kodDeseni.test(x.yanit ?? ""))
      .slice(0, 3);
    const onceki = oncekiSahipId && oncekiSahipId !== g.atananId ? this.depo.ajan(oncekiSahipId) : null;
    const defter = onceki ? this.hafiza.defter(onceki) : "";
    const devir = onceki
      ? iki(
          `\nDevir: bu görevde daha önce ${onceki.ad} (${rolAdiDilde(onceki)}) çalıştı${onceki.dal ? `, dalı ${onceki.dal}` : ""}. Kaldığı yerden sür; belirsiz bir şey olursa ajana_sor ile ona sor.${defter ? `\n${onceki.ad} defterinden:\n${kisalt(defter, 1500)}` : ""}`,
          `\nHandover: ${onceki.ad} (${rolAdiDilde(onceki)}) worked on this task before${onceki.dal ? `, on branch ${onceki.dal}` : ""}. Continue where they left off; if anything is unclear, ask them with ajana_sor.${defter ? `\nFrom ${onceki.ad}'s journal:\n${kisalt(defter, 1500)}` : ""}`,
        )
      : "";
    return [
      iki(`Görev ${g.kod}: ${g.baslik}`, `Task ${g.kod}: ${g.baslik}`),
      g.aciklama ? `\n${g.aciklama}` : "",
      g.kabulOlcutu ? `\n${iki("Kabul ölçütü", "Acceptance criteria")}:\n${g.kabulOlcutu}` : "",
      bagimli.length ? `\n${iki("Bağımlı olduğu görevler", "Depends on")}: ${bagimli.join(", ")}` : "",
      devir,
      bagliMetin,
      ilgili ? `\n${ilgili}` : "",
      sorular.length
        ? [iki("\nBu görev hakkında sorulup yanıtlananlar:", "\nAsked and answered about this task:"), ...sorular.map((x) => `- ${x.soranAd} → ${x.soruluAd}: ${kisalt(x.soru, 160)} | ${kisalt(x.yanit ?? "", 260)}`)].join("\n")
        : "",
      ilgiliKod ? `\n${ilgiliKod}` : "",
      iki(
        "\nİşe başlamadan ilgili notları oku. İş bitince testleri çalıştır, commit'le, gorev_guncelle ile görevi 'inceleme' durumuna al ve ne yaptığını kısaca yaz.",
        "\nRead the relevant notes before you start. When the work is done, run the tests, commit, move the task to 'inceleme' (review) with gorev_guncelle and briefly write what you did.",
      ),
    ].join("\n");
  }

  gorevOlustur(projeId: string, istek: GorevOlusturIstegi, olusturanId: string | null = null): Gorev {
    this.proje(projeId);
    const baslik = istek.baslik?.trim();
    if (!baslik) throw new ArnorgHatasi(iki("Görev başlığı gerekli.", "A task title is required."));
    if (istek.atananId) {
      const a = this.depo.ajan(istek.atananId);
      if (!a || a.projeId !== projeId) throw bulunamadi("Atanan ajan", "Assigned agent");
    }
    const bagimliliklar = (istek.bagimliliklar ?? []).map((b) => {
      const g = this.depo.gorevKoduyla(projeId, b);
      if (!g) throw new ArnorgHatasi(iki(`Bağımlı görev bulunamadı: ${b}`, `Dependency not found: ${b}`));
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
    if (!eski) throw bulunamadi("Görev", "Task");
    if (istek.atananId) {
      const a = this.depo.ajan(istek.atananId);
      if (!a || a.projeId !== eski.projeId) throw bulunamadi("Atanan ajan", "Assigned agent");
    }
    let bagimliliklar: string[] | undefined;
    if (istek.bagimliliklar) {
      bagimliliklar = istek.bagimliliklar.map((b) => {
        const g = this.depo.gorevKoduyla(eski.projeId, b);
        if (!g) throw new ArnorgHatasi(iki(`Bağımlı görev bulunamadı: ${b}`, `Dependency not found: ${b}`));
        if (g.id === id) throw new ArnorgHatasi(iki("Görev kendine bağımlı olamaz.", "A task cannot depend on itself."));
        return g.id;
      });
    }
    const yeniDurum = istek.durum;
    if (yeniDurum && yeniDurum !== eski.durum) {
      if (!GOREV_GECISLERI[eski.durum].includes(yeniDurum)) {
        throw new ArnorgHatasi(iki(`${eski.kod}: ${eski.durum} → ${yeniDurum} geçişine izin yok.`, `${eski.kod}: moving from ${eski.durum} to ${yeniDurum} is not allowed.`), 409);
      }
      if (yeniDurum === "calisiliyor") {
        const bitmemis = (bagimliliklar ?? eski.bagimliliklar).map((b) => this.depo.gorev(b)).filter((g) => g && g.durum !== "tamam");
        const kodlar = bitmemis.map((g) => g!.kod).join(", ");
        if (bitmemis.length) throw new ArnorgHatasi(iki(`${eski.kod} başlayamaz; bitmemiş bağımlılık: ${kodlar}`, `${eski.kod} cannot start; unfinished dependencies: ${kodlar}`), 409);
        if (!(istek.atananId ?? eski.atananId)) throw new ArnorgHatasi(iki(`${eski.kod} başlamadan önce bir çalışana atanmalı.`, `${eski.kod} must be assigned to an employee before it starts.`), 409);
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
      // İncelemeden aynı kişiye geri dönen görev yeniden başlatılır ama "geri döndü" diye duyurulur
      await this.gorevBaslat(gorev, atamaDegisti ? eski.atananId : null, !atamaDegisti && eski.durum === "inceleme").catch((h) =>
        this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: iki(`${gorev.kod} başlatılamadı: ${(h as Error).message}`, `${gorev.kod} could not be started: ${(h as Error).message}`), projeId: gorev.projeId }),
      );
    }
    if (durumDegisti && gorev.durum === "inceleme") await this.incelemeyeBildir(gorev).catch(() => undefined);
    if (durumDegisti && gorev.durum === "tamam") await this.gorevBitti(gorev).catch(() => undefined);
    return gorev;
  }

  private async gorevBaslat(g: Gorev, oncekiSahipId: string | null = null, geriDonus = false): Promise<void> {
    if (!g.atananId) return;
    this.depo.ajanGuncelle(g.atananId, { gorevId: g.id });
    const sahip = this.depo.ajan(g.atananId);
    if (sahip) {
      const baslik = kisalt(g.baslik, 80);
      this.duyur(
        g.projeId,
        geriDonus
          ? iki(`${sahip.ad}, ${g.kod} "${baslik}" görevine geri döndü (incelemede düzeltme istendi).`, `${sahip.ad} is back on ${g.kod} "${baslik}" (changes requested in review).`)
          : iki(`${sahip.ad}, ${g.kod} "${baslik}" görevine başladı.`, `${sahip.ad} started ${g.kod} "${baslik}".`),
      );
    }
    // Devralınan görevde önceki sahibin bildikleri yeni sahibe aktarılır
    if (oncekiSahipId && oncekiSahipId !== g.atananId && sahip) {
      const onceki = this.depo.ajan(oncekiSahipId);
      if (onceki) {
        try {
          this.zeka.aktar(onceki, sahip, { not: iki(`${g.kod} devri`, `${g.kod} handover`), defter: this.hafiza.defter(onceki), defterYaz: (a, icerik) => this.defterYaz(a.id, icerik) });
        } catch {
          // aktarım olmasa da görev metnindeki devir notu yeterli
        }
      }
    }
    const oturum = this.oturumlar.get(g.atananId);
    const gorevMetni = this.gorevMetni(g, oncekiSahipId, await this.ilgiliKod(g));
    const metin = oturum?.acik ? `${iki("Yeni görev atandı.", "New task assigned.")}\n\n${gorevMetni}` : gorevMetni;
    await this.ajanaMesaj(g.atananId, metin, "next", { tur: "sistem" });
  }

  private async incelemeyeBildir(g: Gorev): Promise<void> {
    const ajanlar = this.depo.ajanlar(g.projeId);
    const sahip = g.atananId ? this.depo.ajan(g.atananId) : null;
    this.duyur(g.projeId, iki(`${g.kod} "${kisalt(g.baslik, 80)}" incelemeye hazır${sahip ? ` (${sahip.ad})` : ""}.`, `${g.kod} "${kisalt(g.baslik, 80)}" is ready for review${sahip ? ` (${sahip.ad})` : ""}.`));
    const inceleyici = ajanlar.find((a) => a.rol === "inceleme" && a.id !== g.atananId);
    const hedef = inceleyici ?? ajanlar.find((a) => a.rol === "ceo");
    if (!hedef) return;
    const dal = sahip?.dal ? iki(` Dal: ${sahip.dal}.`, ` Branch: ${sahip.dal}.`) : "";
    // Tam otonom kipte birleştirmeye CEO karar verir: inceleyici CEO'ya sunar, CEO'nun kendi isteği hemen geçerli olur
    const otonom = Boolean(this.kararCeosu(g.projeId));
    // Sahibi birleştirmeyi zaten istediyse ve karar CEO'daysa yeniden sunulmaz: CEO bekleyen onayı onay_karari ile karara bağlar
    const istenen =
      otonom && !inceleyici && sahip?.dal
        ? this.depo.onaylar(g.projeId, "bekliyor").find((o) => o.tur === "birlestirme" && o.muhatap === "ceo" && (o.veri as { dal?: unknown } | null)?.dal === sahip.dal)
        : undefined;
    if (istenen && sahip) {
      const kimlik = kisaKimlik(istenen.id);
      await this.uyandir(
        hedef.id,
        iki(
          `${g.kod} "${g.baslik}" incelemeye hazır (${sahip.ad}).${dal} ${sahip.ad} birleştirmeyi zaten istedi (onay ${kimlik}): calisma_farki ile değişiklikleri incele ve onay_karari ile karar ver; reddedersen gerekçen ${yonelme(sahip.ad)} iletilir.`,
          `${g.kod} "${g.baslik}" is ready for review (${sahip.ad}).${dal} ${sahip.ad} has already asked for the merge (approval ${kimlik}): review the changes with calisma_farki and decide with onay_karari; if you reject it, your reasoning goes to ${sahip.ad}.`,
        ),
        null,
      );
      return;
    }
    const sun = otonom
      ? inceleyici
        ? iki("birlestirme_iste ile CEO'nun onayına sun", "submit it for the CEO's approval with birlestirme_iste")
        : iki("birlestirme_iste ile birleştir (karar yetkisi sende; hemen geçerli olur ve kalite kapısından geçer)", "merge it with birlestirme_iste (you have the decision authority: it takes effect immediately and goes through the quality gate)")
      : inceleyici
        ? iki("birlestirme_iste ile kurul onayına sun", "submit it for the board's approval with birlestirme_iste")
        : iki("birlestirme_iste ile kurula sun", "submit it to the board with birlestirme_iste");
    await this.uyandir(
      hedef.id,
      iki(
        `${g.kod} "${g.baslik}" incelemeye hazır (${sahip?.ad ?? "atanmamış"}).${dal} ${inceleyici ? `calisma_farki ile değişiklikleri, calisma_dosyasi ile dosyaları oku; sorun yoksa ${sun}, varsa görevi 'calisiliyor' durumuna geri al ve sahibine yaz.` : `calisma_farki ile değişiklikleri incele (gerekirse calisma_dosyasi ile dosya oku); uygunsa ${sun}, değilse görevi 'calisiliyor' durumuna geri al ve sahibine yaz. Sık inceleme gerekiyorsa bir kod inceleyici almayı değerlendir.`}`,
        `${g.kod} "${g.baslik}" is ready for review (${sahip?.ad ?? "unassigned"}).${dal} ${inceleyici ? `Read the changes with calisma_farki and the files with calisma_dosyasi; if all is well, ${sun}; if not, move the task back to 'calisiliyor' and write to its owner.` : `Review the changes with calisma_farki (read files with calisma_dosyasi if needed); if it is ready, ${sun}; if not, move the task back to 'calisiliyor' and write to its owner. If reviews come up often, consider hiring a code reviewer.`}`,
      ),
      null,
    );
  }

  private async gorevBitti(g: Gorev): Promise<void> {
    const sahip = g.atananId ? this.depo.ajan(g.atananId) : null;
    this.duyur(g.projeId, iki(`${g.kod} "${kisalt(g.baslik, 80)}" tamamlandı${sahip ? ` (${sahip.ad})` : ""}.`, `${g.kod} "${kisalt(g.baslik, 80)}" is done${sahip ? ` (${sahip.ad})` : ""}.`));
    // Bu göreve bağlı işlerin sahiplerine haber (bağ kancası)
    for (const d of this.depo.gorevler(g.projeId)) {
      if (d.bagimliliklar.includes(g.id) && d.atananId && d.atananId !== g.atananId) {
        this.zeka.haberEkle(d.atananId, iki(`${g.kod} tamamlandı${sahip ? ` (${sahip.ad})` : ""}; senin ${d.kod} işin buna bağlıydı.`, `${g.kod} is done${sahip ? ` (${sahip.ad})` : ""}; your ${d.kod} depended on it.`));
      }
    }
    this.hafiza.yaz(
      g.projeId,
      {
        tur: "ozet",
        baslik: `${g.kod} ${g.baslik}`,
        metin: [
          iki(`${sahip?.ad ?? "Ekip"} tamamladı.`, `Completed by ${sahip?.ad ?? "the team"}.`),
          g.kabulOlcutu ? `${iki("Kabul ölçütü", "Acceptance criteria")}: ${kisalt(g.kabulOlcutu, 300)}` : "",
          g.aciklama ? kisalt(g.aciklama, 300) : "",
        ]
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
      const kalan = gorevler.filter((x) => x.durum === "bekleyen" || x.durum === "planlandi").length;
      await this.uyandir(
        ceo.id,
        kalan
          ? iki(`${g.kod} tamamlandı ve şu an çalışılan görev yok. Durumu değerlendir: sıradaki işleri planla ve ata ya da kurula #genel'de rapor ver.`, `${g.kod} is done and nothing is in progress. Assess the situation: plan and assign the next work or report to the board in #general.`)
          : iki(
              `${g.kod} tamamlandı ve açık görev kalmadı. Kurulun deneyebileceği bir sonuç varsa teslim_et ile test adımları ve çalıştırma komutuyla kurula sun; yoksa sıradaki işi planla.`,
              `${g.kod} is done and no open tasks remain. If there is something the board can try, submit it with teslim_et including test steps and a run command; otherwise plan the next work.`,
            ),
        null,
      );
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
          metin: iki(
            `${alici.ad} son 10 dakikada çok sık uyandırıldı; ${ilgi(gonderen.ad)} mesajı kanalda bırakıldı, ajan uyandırılmadı.`,
            `${alici.ad} was woken too often in the last 10 minutes; ${gonderen.ad}'s message was left in the channel and the agent was not woken.`,
          ),
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
      this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: iki(`${alici.ad} uyandırılamadı: ${(h as Error).message}`, `Could not wake ${alici.ad}: ${(h as Error).message}`), projeId: alici.projeId });
      return false;
    }
  }

  private async sistemMesaji(ajanId: string, metin: string): Promise<void> {
    await this.uyandir(ajanId, metin, null);
  }

  kanalMesaji(projeId: string, kanal: string, gonderen: { id: string; ad: string }, metin: string, anilanlar: string[] = []): Mesaj {
    const mesaj = this.depo.mesajEkle({ projeId, kanal, gonderenId: gonderen.id, gonderenAd: gonderen.ad, metin, anilanlar });
    // Yanıtını yazan ajanın "yazıyor" göstergesi biter
    if (this.yaziyorlar.get(gonderen.id)?.kanal === kanal) this.yaziyorBitir(gonderen.id);
    this.olaylar.yayinla({ tur: "mesaj.yeni", mesaj });
    return mesaj;
  }

  /** Ajan bir kanaldaki mesaja yanıt hazırlıyor: kanalda "yazıyor" görünür; yanıt gelince, ajan durunca ya da 4 dk sonra biter */
  private yaziyorBaslat(ajan: Ajan, kanal: string): void {
    this.yaziyorBitir(ajan.id);
    const zamanlayici = setTimeout(() => this.yaziyorBitir(ajan.id), 4 * 60_000);
    zamanlayici.unref();
    this.yaziyorlar.set(ajan.id, { projeId: ajan.projeId, kanal, zamanlayici });
    this.olaylar.yayinla({ tur: "kanal.yaziyor", projeId: ajan.projeId, kanal, ajanId: ajan.id, ad: ajan.ad, yaziyor: true });
  }

  private yaziyorBitir(ajanId: string): void {
    const y = this.yaziyorlar.get(ajanId);
    if (!y) return;
    clearTimeout(y.zamanlayici);
    this.yaziyorlar.delete(ajanId);
    this.olaylar.yayinla({ tur: "kanal.yaziyor", projeId: y.projeId, kanal: y.kanal, ajanId, ad: this.depo.ajan(ajanId)?.ad ?? "", yaziyor: false });
  }

  /** Ajanın yanıt hazırladığı kanal (mesaj_gonder'in varsayılanı) */
  yazdigiKanal(ajanId: string): string | null {
    return this.yaziyorlar.get(ajanId)?.kanal ?? null;
  }

  /** ArnOrg'un #genel'e (ya da verilen kanala) yazdığı durum mesajı */
  duyur(projeId: string, metin: string, kanal = "genel"): void {
    try {
      this.kanalMesaji(projeId, kanal, { id: ARNORG_GONDEREN, ad: "ArnOrg" }, metin);
    } catch {
      // proje silinmiş olabilir
    }
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
    const proje = this.proje(projeId);
    // İngilizce görünen adlar (#general, #ceo) kanal kimliğine çevrilir
    const temizKanal = kanalKimligi(kanal);
    if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(temizKanal)) throw new ArnorgHatasi(iki("Geçersiz kanal adı.", "Invalid channel name."));
    const gonderenAjan = gonderenId === KURUL ? null : this.depo.ajan(gonderenId);
    const govde = (gonderenAjan ? emojiAyikla(metin) : metin).trim();
    if (!govde) throw new ArnorgHatasi(iki("Mesaj boş olamaz.", "The message cannot be empty."));
    if (gonderenId !== KURUL && !gonderenAjan) throw bulunamadi("Gönderen", "Sender");
    const ceo = this.depo.ajanlar(projeId).find((a) => a.rol === "ceo");
    if (temizKanal === "yonetim" && gonderenAjan && gonderenAjan.id !== ceo?.id) {
      throw new ArnorgHatasi(iki("#yonetim kanalı kurul ile CEO arasındadır; kurula iletilecek şeyi yöneticine ya da #genel kanalına yaz.", "#ceo is between the board and the CEO; send things for the board to your manager or #general."), 403);
    }
    const kurulAdi = iki("Yönetim kurulu", "Board");
    const anilanlar = this.anilanlariBul(projeId, govde).filter((a) => a.id !== gonderenId);
    const mesaj = this.kanalMesaji(projeId, temizKanal, { id: gonderenId, ad: gonderenAjan?.ad ?? kurulAdi }, govde, anilanlar.map((a) => a.id));
    let alicilar = anilanlar;
    // Kurulun #genel ve #yonetim mesajı (anma yoksa) CEO'ya gider
    if (!gonderenAjan && (temizKanal === "genel" || temizKanal === "yonetim") && !alicilar.length && ceo) alicilar = [ceo];
    // Kurulun kanalında üyeleri konuşma motoru uyandırır (söz sırası); burada yalnız üye olmayan anılanlar
    alicilar = this.kanallar.dogrudanUyanacaklar(projeId, temizKanal, gonderenId, alicilar);
    if (!gonderenAjan) {
      // Kurul kalıcı bir kural koyuyor gibiyse global zekâya gözlem olarak gider (projeye özgü değilse)
      if (govde.length <= 400 && tercihGibi(govde)) this.gozle({ metin: govde, kaynak: "tercih", projeId, projeAd: proje.ad });
      // İlk brief: ekip işe başlıyor
      if (ceo && alicilar.some((a) => a.id === ceo.id) && !this.depo.deger(`ilk-brief:${projeId}`)) {
        this.depo.degerYaz(`ilk-brief:${projeId}`, simdi());
        if (temizKanal !== "genel") this.duyur(projeId, iki(`Kurul ilk talimatını verdi; ${ceo.ad} (CEO) işe başlıyor.`, `The board gave its first instructions; ${ceo.ad} (CEO) is getting started.`));
      }
    }
    const etiket = `#${kanalGorunenAdi(temizKanal, dil())} · ${gonderenAjan?.ad ?? kurulAdi}: ${govde}`;
    for (const a of alicilar) {
      this.yaziyorBaslat(a, temizKanal);
      const uyandi = gonderenAjan
        ? await this.uyandir(a.id, etiket, gonderenAjan)
        : await this.ajanaMesaj(a.id, etiket, "next", { tur: "kurul" }).then(
            () => true,
            (h) => {
              this.olaylar.yayinla({ tur: "bildirim", seviye: "hata", metin: (h as Error).message, projeId });
              return false;
            },
          );
      // Uyanmadıysa ya da sıraya girdiyse / tavan kararını bekliyorsa (çalışmıyor) kanalda "yazıyor" görünmez
      if (!uyandi || !calisanMi(this.depo.ajan(a.id)?.durum)) this.yaziyorBitir(a.id);
    }
    return mesaj;
  }

  /**
   * Claude Code girişi düştü ya da abonelik sorunu var: kurulum ve hesap durumu tazelenip yayınlanır (Stüdyo her
   * ekranda giriş şeridini gösterir), ajan giriş yapılınca sürdürülmek üzere bekletilir ve kurula en çok 10 dakikada
   * bir "Giriş yap" eylemli pencere gider.
   */
  private kimlikSorunuBildir(ajanId: string, projeId: string, sorun: KimlikSorunu, ayrinti: string): void {
    this.kimlikBekleyenler.add(ajanId);
    void this.kimlikDurumunuOku();
    void this.hesap.tazele().catch(() => undefined);
    if (!this.kimlikYoklayici) {
      this.kimlikYoklayici = setInterval(() => void this.kimlikDurumunuOku(), 60_000);
      this.kimlikYoklayici.unref();
    }
    if (Date.now() - this.sonKimlikBildirimi < 10 * 60_000) return;
    this.sonKimlikBildirimi = Date.now();
    const giris = sorun === "giris";
    this.kurulaBildir(
      null,
      projeId,
      "uyari",
      giris ? iki("Claude Code girişi gerekiyor", "Claude Code needs you to sign in") : iki("Claude aboneliğinde bir sorun var", "There's a problem with the Claude subscription"),
      giris
        ? iki(
            "Ajanlar Claude Code'a giriş yapılmadığı ya da girişin süresi dolduğu için çalışamıyor. Giriş yapınca kaldıkları yerden sürerler.",
            "Agents can't work because Claude Code isn't signed in or the sign-in has expired. Once you sign in they pick up where they left off.",
          )
        : iki(`Claude Code abonelikle ilgili bir hata bildirdi: ${ayrinti}`, `Claude Code reported a subscription problem: ${ayrinti}`),
      null,
      "claude_giris",
    );
  }

  /**
   * Bekleyen varken Claude Code durumu okunup yayınlanır; girişsizden hazıra geçiş Kurulum'da yakalanır ve ajanlar
   * sürer. Durum girişli göründüğü hâlde ajan kimlik hatası aldıysa (sunucuda geçersizleşen giriş) yoklama bir işe
   * yaramaz ve durur; o zaman yeniden giriş beklenir.
   */
  private async kimlikDurumunuOku(): Promise<void> {
    try {
      const d = await this.kurulum.durumuYayinla();
      if (d.claude.girisYapildi && d.claude.abonelik) this.kimlikYoklamasiniDurdur();
    } catch {
      // Bir sonraki yoklamada yeniden denenir
    }
  }

  private kimlikYoklamasiniDurdur(): void {
    if (this.kimlikYoklayici) clearInterval(this.kimlikYoklayici);
    this.kimlikYoklayici = null;
  }

  /** Claude Code girişi yeniden hazır: kimlik sorunuyla duran ajanlar kaldıkları yerden sürer */
  private kimlikSonrasiSurdur(): void {
    const idler = [...this.kimlikBekleyenler];
    this.kimlikBekleyenler.clear();
    this.kimlikYoklamasiniDurdur();
    this.sonKimlikBildirimi = 0;
    for (const id of idler) {
      // Bu arada başka bir yoldan yeniden başlatıldıysa dokunulmaz
      if (!this.depo.ajan(id) || this.oturumlar.get(id)?.acik) continue;
      void this.uyandir(
        id,
        iki(
          "Claude Code girişi yenilendi; yarım kalan işine kaldığın yerden devam et. Gerekirse defterine ve kanallardaki son mesajlara bak.",
          "Claude Code is signed in again; pick up the work that was cut off where you left it. Check your journal and the latest channel messages if needed.",
        ),
        null,
      );
    }
    if (idler.length) this.olaylar.yayinla({ tur: "bildirim", seviye: "bilgi", metin: iki("Claude Code girişi tamam; duran ajanlar kaldıkları yerden sürüyor.", "Claude Code is signed in; paused agents are picking up where they left off.") });
  }

  /** CEO (ya da bir yönetici) kurula önemli bir şey bildirir: her ekranda açılır pencere; #yonetim'e de yazılır */
  kurulaBildir(ajan: Ajan | null, projeId: string, tur: KurulBildirimi["tur"], baslik: string, metin: string, onayId: string | null = null, eylem?: KurulBildirimi["eylem"]): KurulBildirimi {
    const bildirim: KurulBildirimi = {
      id: kimlik(),
      projeId,
      ajanId: ajan?.id ?? null,
      ajanAd: ajan?.ad ?? "ArnOrg",
      tur,
      baslik: kisalt(baslik.trim(), 160),
      metin: kisalt(metin.trim(), 4000),
      zaman: simdi(),
      onayId,
      ...(eylem ? { eylem } : {}),
    };
    this.olaylar.yayinla({ tur: "kurul.bildirimi", projeId, bildirim });
    if (ajan && !onayId) this.kanalMesaji(projeId, "yonetim", { id: ajan.id, ad: ajan.ad }, `${bildirim.baslik}\n\n${bildirim.metin}`);
    return bildirim;
  }

  // ===================================================================
  // Hafıza, defter ve ajanlar arası sorular
  // ===================================================================

  hafizaYaz(projeId: string, istek: HafizaYazIstegi, ajanId: string | null): HafizaKaydi {
    this.proje(projeId);
    const ajan = ajanId ? this.ajan(ajanId) : null;
    if (ajan && ajan.projeId !== projeId) throw new ArnorgHatasi(iki("Ajan bu projede değil.", "The agent is not in this project."), 403);
    return this.hafiza.yaz(projeId, istek, { ajan, ad: ajan ? undefined : iki("Yönetim kurulu", "Board") });
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
    if (metin.length < 5 || metin.length > 4000) throw new ArnorgHatasi(iki("Soru 5–4000 karakter olmalı.", "A question must be 5–4000 characters."));
    const ad = hedefAd?.replace(/^@/, "").trim() ?? "";
    const secim = ad ? { ajan: this.depo.ajanAdla(soran.projeId, ad), neden: undefined } : uzmanBul(this.depo, soran, metin);
    const hedef = secim?.ajan;
    const yonlendirme = secim?.neden;
    if (!hedef) throw new ArnorgHatasi(ad ? iki(`"${ad}" adında çalışan yok.`, `No employee named "${ad}".`) : iki("Projede soracak başka çalışan yok.", "There is no one else in the project to ask."), 404);
    if (hedef.id === soran.id) throw new ArnorgHatasi(iki("Kendine soru soramazsın.", "You cannot ask yourself a question."));
    if (!secenek.yeniden) {
      const onceki = oncekiYanit(this.depo, soran.projeId, metin);
      if (onceki) return { ...onceki, onceki: true };
    }
    const karsilikli = this.depo.sorular(soran.projeId, { soruluId: soran.id, durum: "bekliyor" }).some((s) => s.soranId === hedef.id);
    if (karsilikli) throw new ArnorgHatasi(iki(`${hedef.ad} şu an senden yanıt bekliyor; önce onun sorusunu soruyu_yanitla ile yanıtla.`, `${hedef.ad} is waiting for an answer from you right now; answer their question with soruyu_yanitla first.`), 409);
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
      iki(
        `${soran.ad} sana soruyor (soru ${kayit.id})${yonlendirme ? ` — ArnOrg soruyu sana yönlendirdi: ${yonlendirme}` : ""}:\n${metin}\n\nYanıtını mcp__arnorg__soruyu_yanitla ile ver (soru_id: ${kayit.id}). Bilmiyorsan bildiğin kadarını ve kimin bilebileceğini yaz. Yanıttan sonra üzerinde çalıştığın bir görev varsa ona dön; yoksa yeni iş açma, dur.`,
        `${soran.ad} asks you (question ${kayit.id})${yonlendirme ? ` — ArnOrg routed the question to you: ${yonlendirme}` : ""}:\n${metin}\n\nAnswer with mcp__arnorg__soruyu_yanitla (soru_id: ${kayit.id}). If you don't know, write what you do know and who might know. After answering, go back to the task you were working on, if any; otherwise don't open new work, stop.`,
      ),
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
    if (metin.length < 10 || metin.length > 3000) throw new ArnorgHatasi(iki("Gündem 10–3000 karakter olmalı.", "The agenda must be 10–3000 characters."));
    let katilimcilar: { ajan: Ajan; neden: string | null }[] = [];
    if (katilimciAdlari?.length) {
      for (const ham of katilimciAdlari) {
        const ad = ham.replace(/^@/, "").trim();
        const a = this.depo.ajanAdla(pid, ad);
        if (!a) throw new ArnorgHatasi(iki(`"${ad}" adında çalışan yok.`, `No employee named "${ad}".`), 404);
        if (a.id !== cagiran.id && !katilimcilar.some((k) => k.ajan.id === a.id)) katilimcilar.push({ ajan: a, neden: null });
      }
    } else {
      katilimcilar = uzmanlariSirala(this.depo, cagiran, metin)
        .filter((x) => x.puan >= 1)
        .slice(0, 3)
        .map((x) => ({ ajan: x.ajan, neden: x.neden }));
      if (!katilimcilar.length) {
        const yedek = this.depo.ajanlar(pid).filter((a) => a.id !== cagiran.id && a.durum !== "duraklatildi" && (a.rol === "cto" || a.id === cagiran.yoneticiId));
        katilimcilar = yedek.slice(0, 2).map((a) => ({ ajan: a, neden: iki("konuda belirgin bir uzman yok", "no clear expert on the topic") }));
      }
    }
    katilimcilar = katilimcilar.slice(0, 6);
    if (!katilimcilar.length) throw new ArnorgHatasi(iki("Toplantıya çağrılacak çalışan bulunamadı; katilimcilar alanında ad ver.", "No employee found to invite to the meeting; give names in katilimcilar."), 404);

    this.depo.kanalEkle(pid, "toplanti", iki("Toplantılar: gündem, görüşler, karar", "Meetings: agenda, opinions, decision"));
    // Biçim Stüdyo'nun Ofis ekranınca tanınır: duyuru "Toplantı: …\nKatılımcılar: @A" / "Meeting: …\nParticipants: @A",
    // soru "Toplantı (Ada çağırdı): …" / "Meeting (called by Ada): …"
    const anilanlar = katilimcilar.map((k) => `@${k.ajan.ad}`).join(" ");
    this.kanalMesaji(
      pid,
      "toplanti",
      { id: cagiran.id, ad: cagiran.ad },
      iki(`Toplantı: ${metin}\nKatılımcılar: ${anilanlar}`, `Meeting: ${metin}\nParticipants: ${anilanlar}`),
      katilimcilar.map((k) => k.ajan.id),
    );
    const soru = iki(
      `Toplantı (${cagiran.ad} çağırdı): ${metin}\n\nGörüşünü kısa ver: önerin, gerekçen, gördüğün risk. Başkalarının görüşünü bekleme; karar ${bulunma(cagiran.ad)}.`,
      `Meeting (called by ${cagiran.ad}): ${metin}\n\nGive your view briefly: your proposal, your reasoning, the risks you see. Don't wait for the others' views; ${cagiran.ad} makes the decision.`,
    );
    const gorusler = await Promise.all(
      katilimcilar.map(async ({ ajan, neden }): Promise<ToplantiGorusu> => {
        const temel = { ajanId: ajan.id, ad: ajan.ad, rolAdi: rolAdiDilde(ajan), neden };
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
    const ozet = gorusler
      .map((g) =>
        iki(
          `${g.ad} (${g.rolAdi}): ${g.gorus ? kisalt(g.gorus, 400) : g.durum === "zaman_asimi" ? "süre içinde yanıt vermedi" : `katılamadı (${g.hata ?? ""})`}`,
          `${g.ad} (${g.rolAdi}): ${g.gorus ? kisalt(g.gorus, 400) : g.durum === "zaman_asimi" ? "did not answer in time" : `could not take part (${g.hata ?? ""})`}`,
        ),
      )
      .join("\n");
    const kayit = this.hafiza.yaz(
      pid,
      { tur: "ozet", baslik: iki(`Toplantı: ${kisalt(metin, 120)}`, `Meeting: ${kisalt(metin, 120)}`), metin: iki(`Çağıran: ${cagiran.ad}\n${ozet}`, `Called by: ${cagiran.ad}\n${ozet}`), onem: 2 },
      { ajan: cagiran },
    );
    return { gundem: metin, gorusler, kayitId: kayit.id };
  }

  soruYanitla(ajanId: string, soruId: string, yanit: string): AjanSorusu {
    const a = this.ajan(ajanId);
    const soru = this.depo.soru(soruId);
    if (!soru || soru.projeId !== a.projeId) throw new ArnorgHatasi(iki("Soru bulunamadı.", "Question not found."), 404);
    if (soru.soruluId !== a.id) throw new ArnorgHatasi(iki(`Bu soru ${yonelme(soru.soruluAd)} soruldu.`, `This question was asked to ${soru.soruluAd}.`), 403);
    if (soru.durum !== "bekliyor") throw new ArnorgHatasi(iki("Bu soru artık yanıt beklemiyor (süre dolmuş olabilir). Yanıtı mesaj_gonder ile ilet.", "This question is no longer waiting for an answer (it may have timed out). Send your answer with mesaj_gonder."), 409);
    const metin = yanit.trim();
    if (!metin) throw new ArnorgHatasi(iki("Yanıt boş olamaz.", "The answer cannot be empty."));
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
    // Bekleyen hafıza yansıması önce yazılır; commit hafızanın son hâlini içerir
    this.hafiza.bekleyeniYansit(projeId);
    if ((await gitIslemleri.mevcutDal(proje.yol)) !== proje.varsayilanDal) return false;
    const durum = (await gitIslemleri.git(proje.yol, ["status", "--porcelain", "--", ".arnorg"])).trim();
    if (!durum) return false;
    await gitIslemleri.kimlikGuvenceAltinaAl(proje.yol);
    await gitIslemleri.git(proje.yol, ["add", "-A", "--", ".arnorg"]);
    await gitIslemleri.git(proje.yol, ["commit", "-m", iki("ArnOrg: ekip, hafıza ve not kayıtları", "ArnOrg: team, memory and note records"), "--", ".arnorg"]);
    return true;
  }

  // ===================================================================
  // Kullanım: yalnız Claude aboneliği; işlenen token ve plan pencereleri
  // ===================================================================

  kullanimOzeti(projeId: string): KullanimOzeti {
    this.proje(projeId);
    const ajanlar = this.depo.ajanlar(projeId);
    return {
      bugunToken: this.depo.projeTokeni(projeId, bugun()),
      toplamToken: this.depo.projeTokeni(projeId),
      ajanlar: ajanlar.map((a) => ({ ajanId: a.id, ad: a.ad, bugunToken: a.bugunToken, toplamToken: a.toplamToken })),
      pencere: this.pencere,
    };
  }

  // ===================================================================
  // Kapanış
  // ===================================================================

  /**
   * Açılışta mesaiye dönüş: kapanışta ya da çökmede yarım kalan ajanlar sırayla (eşzamanlı tavana uyarak) kaldıkları
   * yerden sürer; oturum kimliği saklı olduğundan aynı konuşma devam eder. Abonelik sınırındaysa ajan sınırda
   * bekleyenlere sessizce eklenir. Uyandırılanlar döner.
   */
  async mesaiyeDon(): Promise<string[]> {
    const idler = this.mesai.al();
    if (!this.yapilandirma.ayarlar.acilistaSurdur) return [];
    const metin = iki(
      "ArnOrg yeniden başlatıldı; yarım kalan işine kaldığın yerden devam et (görevlerine ve defterine bak).",
      "ArnOrg was restarted; continue your unfinished work where you left off (check your tasks and your journal).",
    );
    const uyanan: string[] = [];
    for (const id of idler) {
      // Bu arada kurul ya da başka bir mesaj başlattıysa ya da görev tavanında kurul kararı bekliyorsa dokunulmaz
      if (!this.depo.ajan(id) || this.oturumlar.get(id)?.acik || this.gorevTavani.duraklatmaAciklamasi(id)) continue;
      if (this.hesap.sinir) {
        this.sinirdaSakla(id, metin);
        continue;
      }
      try {
        await this.ajanaMesaj(id, metin, "next", { tur: "sistem" });
        uyanan.push(id);
      } catch {
        // Tek tek bildirilmez; ajan bir sonraki mesajda başlar
      }
    }
    if (uyanan.length) {
      this.olaylar.yayinla({
        tur: "bildirim",
        seviye: "bilgi",
        metin: iki(`ArnOrg yeniden açıldı; ${uyanan.length} ajan kaldığı yerden sürüyor.`, `ArnOrg reopened; ${uyanan.length === 1 ? "1 agent is" : `${uyanan.length} agents are`} picking up where they left off.`),
      });
    }
    return uyanan;
  }

  kapat(): void {
    // Oturumlar kapanmadan önce: çalışanlar (kurulun durdurduğu hariç), sıradakiler, abonelik ve giriş bekleyenler açılışta sürer
    try {
      this.mesai.kapanis(
        this.depo
          .projeler()
          .flatMap((p) => this.depo.ajanlar(p.id))
          .filter((a) => (calisanMi(a.durum) && !this.oturumlar.get(a.id)?.kapaniyor) || this.esZamanlilik.siradaMi(a.id) || this.sinirdaBekleyenler.has(a.id) || this.kimlikBekleyenler.has(a.id))
          .map((a) => a.id),
      );
    } catch {
      // Depo kapanmışsa kayıt yazılamaz; açılışta çalışan durumda kalanlar yine okunur
    }
    this.esZamanlilik.kapat();
    this.kanallar.kapat();
    this.birlestirmeKuyrugu.kapat();
    this.hesap.durdur();
    this.kurulum.kapat();
    this.kuresel.durdur();
    this.brifing.durdur();
    this.modelKatalogu.durdur();
    for (const y of this.yaziyorlar.values()) clearTimeout(y.zamanlayici);
    if (this.esitlemeZamanlayici) clearInterval(this.esitlemeZamanlayici);
    this.kimlikYoklamasiniDurdur();
    this.hafiza.kapat();
    void this.kodZekasi.kapat();
    for (const z of this.arnorgCommitZamanlayicilari.values()) clearTimeout(z);
    for (const b of this.bekleyenSorular.values()) clearTimeout(b.zamanlayici);
    for (const o of this.oturumlar.values()) o.kapat();
    for (const z of this.bostaZamanlayicilari.values()) clearTimeout(z);
    for (const b of this.bekleyenKararlar.values()) {
      clearTimeout(b.zamanlayici);
      b.coz({ izin: false, not: iki("ArnOrg kapanıyor", "ArnOrg is shutting down") });
    }
  }

  /** Başlangıç zamanı (sağlık kontrolü için) */
  readonly acilis = simdi();
}

/** CEO'ya hazırlık görüşmesini başlatan mesaj */
export function hazirlikTalimati(projeAd: string): string {
  return iki(
    [
      `Kurulla "${projeAd}" için hazırlık görüşmesi yapacaksın. Görüşme #yonetim kanalında canlı sohbet gibi geçer: her mesajında tek konu sor, kısa yaz ve kurulun yanıtını bekle (mesaj_gonder, kanal: yonetim).`,
      "Sıra:",
      "1. Projenin amacı, kullanıcısı ve ilk sürümün kapsamı.",
      "2. Teknoloji, kalite ve çalışma tercihleri. Her tercihi hafiza_kaydet ile tur: tercih, önem 5 olarak kaydet.",
      "3. Ana yasa: kurulla birlikte 5–12 kesin kural yaz (gizli bilgi, güvenlik, test, dal ve yayın, dil ve üslup gibi). Taslağı #yonetim'de göster; kurul uygun derse anayasa_oner ile onaya sun. Makineyle denetlenebilecek maddelere (yasak komut, yasak dosya yolu) kural alanı ekle.",
      "4. İlk ekip: gereken rolleri gerekçesiyle öner; kurul uygun derse ise_al_teklif ile teklif ver.",
      "   İlk ekibe bir Tanıtım uzmanı (rol: tanitim) da kat: kurulun Tanıtım alanında okuduğu kök README.md'yi yazar ve teslimlerden sonra güncel tutar.",
      "5. İlk plan: hedefleri yaz ve ilk görevleri aç.",
      "Bitince hazirlik_tamam ile kısa bir özet yaz. İlk mesajında kendini bir cümleyle tanıt ve ilk soruyu sor.",
    ].join("\n"),
    [
      `You will run a kickoff conversation with the board for "${projeAd}". It happens in #ceo like a live chat: one topic per message, keep it short and wait for the board's answer (mesaj_gonder, kanal: yonetim).`,
      "Order:",
      "1. The project's goal, its users and the scope of the first release.",
      "2. Technology, quality and working preferences. Save each preference with hafiza_kaydet as tur: tercih, importance 5.",
      "3. Constitution: write 5–12 binding rules with the board (secrets, security, testing, branches and releases, language and tone). Show the draft in #ceo; if the board agrees, submit it with anayasa_oner. Add a rule field to articles a machine can check (forbidden commands, forbidden file paths).",
      "4. First team: propose the roles needed with reasons; if the board agrees, submit them with ise_al_teklif.",
      "   Include a Product marketer (role: tanitim) in the first team: they write the root README.md the board reads in the Showcase area and keep it current after deliveries.",
      "5. First plan: write the goals and open the first tasks.",
      "When done, write a short summary with hazirlik_tamam. In your first message introduce yourself in one sentence and ask the first question.",
    ].join("\n"),
  );
}
