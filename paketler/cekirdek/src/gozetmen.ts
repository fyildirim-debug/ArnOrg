// Gözetmen: tıkanma koruması (ilerlemeyen görevi hatırlatma ve yükseltme) ve dönem raporu
import { AD_HARITALARI_EN, GOREV_DURUM_ADLARI, KARAR_ADLARI, ONAY_TURU_ADLARI, type Ajan, type Gorev, type GorevDurumu, type Karar, type OnayTuru, type Rapor } from "@arnorg/ortak";
import { iki } from "./dil.js";
import { rolAdiDilde, rolBul } from "./roller.js";
import type { Sirket } from "./sirket.js";
import { bugun } from "./yardimci.js";

/** Aynı görev için yükseltmeden önce sorumluya gönderilen hatırlatma sayısı */
const HATIRLATMA_SINIRI = 2;
/**
 * Turu biten (boşta ya da oturumu kapanmış) ama görevi hâlâ süren çalışana ilk hatırlatma bu kadar sessizlikten sonra
 * gider (ekip boş beklemesin); görev başına bir saatte en çok HIZLI_SINIR kez. Sonrakiler kurulun tıkanma eşiğiyle.
 */
export const HIZLI_HATIRLATMA_MS = 3 * 60_000;
const HIZLI_SINIR = 2;
const HIZLI_PENCERE_MS = 60 * 60_000;
const GUN_MS = 86_400_000;

// ===================================================================
// Dönem raporu
// ===================================================================

/** 1234567 → "1,2 milyon", 48200 → "48 bin" (İngilizce: "1.2M", "48k"; Stüdyo ile aynı) */
export function tokenMetni(n: number): string {
  const yerel = iki("tr-TR", "en-US");
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(yerel, { maximumFractionDigits: 1 })}${iki(" milyon", "M")}`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString(yerel)}${iki(" bin", "k")}`;
  return String(Math.round(n));
}
/** 04.10 (İngilizce: Oct 4) */
const tarih = (iso: string) => {
  const d = new Date(iso);
  return iki(`${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`, d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
};
/** Durum ve tür adları geçerli dilde, küçük harfle (Türkçe yerel kurallarıyla) */
const kucuk = (metin: string) => metin.toLocaleLowerCase(iki("tr", "en"));
const gorevDurumAdi = (d: GorevDurumu) => iki(GOREV_DURUM_ADLARI[d], AD_HARITALARI_EN.gorevDurumu[d]);
const kararAdi = (k: Karar) => iki(KARAR_ADLARI[k], AD_HARITALARI_EN.karar[k]);
const onayTuruAdi = (t: OnayTuru) => iki(ONAY_TURU_ADLARI[t], AD_HARITALARI_EN.onayTuru[t]);

export function raporOlustur(sirket: Sirket, projeId: string, gun = 7): Rapor {
  const proje = sirket.proje(projeId);
  const donem = Math.min(Math.max(1, Math.round(gun)), 90);
  const baslangicTarihi = new Date(Date.now() - (donem - 1) * GUN_MS);
  const baslangicGun = bugun(baslangicTarihi);
  const baslangicAni = new Date(baslangicTarihi.getFullYear(), baslangicTarihi.getMonth(), baslangicTarihi.getDate()).toISOString();
  const ajanlar = sirket.depo.ajanlar(projeId);
  const ad = (id: string | null) => (id ? (ajanlar.find((a) => a.id === id)?.ad ?? iki("ayrılmış çalışan", "former employee")) : iki("atanmamış", "unassigned"));
  const gorevler = sirket.depo.gorevler(projeId);
  const kod = (id: string) => gorevler.find((g) => g.id === id)?.kod ?? "?";
  const satir = (g: Gorev, ek = "") => `- ${g.kod} ${g.baslik} · ${ad(g.atananId)}${ek}`;

  const tamamlanan = gorevler.filter((g) => g.durum === "tamam" && g.guncelleme >= baslangicAni);
  const suren = gorevler.filter((g) => g.durum === "calisiliyor");
  const incelemede = gorevler.filter((g) => g.durum === "inceleme");
  const acik = gorevler.filter((g) => g.durum === "bekleyen" || g.durum === "planlandi");
  const tikanan = acik.flatMap((g) => {
    const bitmemis = g.bagimliliklar.filter((b) => gorevler.find((x) => x.id === b)?.durum !== "tamam");
    if (bitmemis.length) return [satir(g, ` · ${iki("bekliyor", "waiting on")}: ${bitmemis.map(kod).join(", ")}`)];
    if (!g.atananId) return [satir(g)];
    return [];
  });

  const kullanimlar = sirket.depo.donemKullanimi(projeId, baslangicGun);
  const donemTokeni = kullanimlar.reduce((t, m) => t + m.token, 0);
  const denetim = sirket.depo.denetimSayilari(projeId, baslangicAni);
  const bekleyenOnaylar = sirket.depo.onaylar(projeId, "bekliyor");
  const sonuclananlar = sirket.depo.onaylar(projeId).filter((o) => o.durum !== "bekliyor" && (o.sonuclanma ?? "") >= baslangicAni);
  // 0.0.8: işler ortak projede görev kaydı olarak çalışma dalına girer (ortak-calisma/)
  const kayitlar = sirket.ortak.defter.aralikta(projeId, baslangicAni);
  const kalanKayit = kayitlar.filter((k) => k.kalite.durum === "kaldi" || k.kalite.durum === "zaman_asimi").length;
  const iseAlinanlar = sonuclananlar.filter((o) => o.tur === "ise_alim" && o.durum === "onaylandi");

  const baslik = iki(`Durum raporu · ${bugun()}`, `Status report · ${bugun()}`);
  const b: string[] = [];
  b.push(`# ${baslik}`, "");
  b.push(`${proje.ad} · ${donem === 1 ? iki("bugün", "today") : iki(`son ${donem} gün (${baslangicGun} itibarıyla)`, `last ${donem} days (since ${baslangicGun})`)}`, "");
  b.push(iki("## Özet", "## Summary"), "");
  b.push(
    iki(
      `- Tamamlanan görev: ${tamamlanan.length} · süren: ${suren.length} · incelemede: ${incelemede.length} · açık: ${acik.length}`,
      `- Tasks done: ${tamamlanan.length} · in progress: ${suren.length} · in review: ${incelemede.length} · open: ${acik.length}`,
    ),
  );
  const bugunku = tokenMetni(sirket.depo.projeTokeni(projeId, bugun()));
  b.push(iki(`- Kullanım: ${tokenMetni(donemTokeni)} token (bugün ${bugunku})`, `- Usage: ${tokenMetni(donemTokeni)} tokens (today ${bugunku})`));
  const pencereler = sirket.hesap.mevcut.pencereler.filter((p) => p.tur === "bes_saat" || p.tur === "haftalik");
  if (pencereler.length)
    b.push(`${iki("- Abonelik", "- Subscription")}: ${pencereler.map((p) => iki(`${kucuk(p.ad)} %${Math.round(p.yuzde ?? 0)}`, `${kucuk(p.ad)} ${Math.round(p.yuzde ?? 0)}%`)).join(", ")}`);
  const denetimOzeti = (Object.keys(KARAR_ADLARI) as Karar[]).filter((k) => denetim[k]).map((k) => `${kucuk(kararAdi(k))} ${denetim[k]}`);
  b.push(`${iki("- Denetim", "- Audit")}: ${denetimOzeti.length ? denetimOzeti.join(", ") : iki("kayıt yok", "no records")}`);
  b.push(
    iki(
      `- Görev kaydı: ${kayitlar.length}${kalanKayit ? ` (${kalanKayit} testten geçmedi)` : ""} · işe alım: ${iseAlinanlar.length} · bekleyen onay: ${bekleyenOnaylar.length}`,
      `- Task saves: ${kayitlar.length}${kalanKayit ? ` (${kalanKayit} failed the tests)` : ""} · hires: ${iseAlinanlar.length} · pending approvals: ${bekleyenOnaylar.length}`,
    ),
    "",
  );

  const bolum = (ad: string, satirlar: string[]) => {
    if (!satirlar.length) return;
    b.push(`## ${ad}`, "", ...satirlar, "");
  };
  bolum(iki("Tamamlananlar", "Done"), tamamlanan.map((g) => satir(g, ` · ${tarih(g.guncelleme)}`)));
  bolum(iki("Sürenler", "In progress"), suren.map((g) => satir(g)));
  bolum(iki("İncelemede", "In review"), incelemede.map((g) => satir(g)));
  bolum(iki("Tıkananlar", "Blocked"), tikanan);
  bolum(
    iki("Bekleyen onaylar", "Pending approvals"),
    bekleyenOnaylar.map((o) => `- ${onayTuruAdi(o.tur)}: ${o.baslik}${o.ajanId ? ` · ${ad(o.ajanId)}` : ""}`),
  );
  bolum(
    iki("Kaydedilen işler", "Saved work"),
    kayitlar.map((k) => `- ${k.baslik} · ${k.ajanAd} · ${k.commit.slice(0, 7)} · ${tarih(k.zaman)}${k.kalite.durum === "kaldi" || k.kalite.durum === "zaman_asimi" ? iki(" · testler geçmedi", " · tests failed") : ""}`),
  );

  b.push(iki("## Ekip", "## Team"), "", iki("| Çalışan | Rol | Durum | Dönem kullanımı |", "| Employee | Role | Status | Period usage |"), "|---|---|---|---|");
  for (const a of ajanlar) {
    const m = kullanimlar.find((x) => x.ajanId === a.id);
    const kullanim = `${tokenMetni(m?.token ?? 0)} ${iki("token", "tokens")}`;
    const gorev = a.gorevId ? gorevler.find((g) => g.id === a.gorevId) : null;
    const durum = gorev && gorev.durum !== "tamam" ? `${gorev.kod} ${kucuk(gorevDurumAdi(gorev.durum))}` : iki("görevsiz", "no task");
    b.push(`| ${a.ad} | ${rolAdiDilde(a)} | ${durum} | ${kullanim} |`);
  }
  b.push("");
  return { baslik, yol: `raporlar/${bugun()}.md`, baslangic: baslangicAni, markdown: b.join("\n") };
}

// ===================================================================
// Tıkanma koruması
// ===================================================================

interface Takip {
  /** Görevin son güncellenme anı; değişirse takip sıfırlanır */
  surum: string;
  sorumluId: string;
  hatirlatma: number;
  sonEylem: number;
  yukseltildi: boolean;
  kurulaBildirildi: boolean;
}

export interface GozetmenEylemi {
  tur: "hatirlatma" | "yukseltme" | "kurul";
  gorevKodu: string;
  ajanAd: string;
}

export class Gozetmen {
  private takip = new Map<string, Takip>();
  /** Görev → hızlı hatırlatma anları (görev sürümü değişse de sayılır; döngüye girmesin) */
  private hizli = new Map<string, number[]>();
  private zamanlayici: NodeJS.Timeout | null = null;
  private calisiyor = false;
  /** Yeniden başlatmadan hemen sonra herkesi dürtmemek için başlangıç anı */
  private readonly acilisMs = Date.now();

  constructor(private readonly sirket: Sirket) {}

  baslat(aralikMs = 60_000): void {
    if (this.zamanlayici) return;
    this.zamanlayici = setInterval(() => {
      void this.denetle().catch(() => undefined);
    }, aralikMs);
    this.zamanlayici.unref();
  }

  durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
  }

  /** Tüm projelerdeki süren ve incelemedeki görevleri denetler; yapılan eylemleri döner */
  async denetle(simdiMs = Date.now()): Promise<GozetmenEylemi[]> {
    const esikDk = this.sirket.yapilandirma.ayarlar.tikanmaDakika;
    // Abonelik sınırındayken kimse dürtülmez; pencere açılınca şirket ajanları kendisi uyandırır
    if (!(esikDk > 0) || this.calisiyor || this.sirket.hesap.sinir) return [];
    this.calisiyor = true;
    const eylemler: GozetmenEylemi[] = [];
    try {
      const esik = esikDk * 60_000;
      const gorulen = new Set<string>();
      for (const proje of this.sirket.depo.projeler()) {
        // Bütçesi dolan projede kimse dürtülmez; bütçe açılınca ekip kendiliğinden sürer (0.0.10)
        if (this.sirket.butce.doluMu(proje.id)) continue;
        const ajanlar = this.sirket.depo.ajanlar(proje.id);
        for (const g of this.sirket.depo.gorevler(proje.id)) {
          if (g.durum !== "calisiliyor" && g.durum !== "inceleme") continue;
          const sorumlu = this.sorumluBul(g, ajanlar);
          if (!sorumlu) continue;
          gorulen.add(g.id);
          let t = this.takip.get(g.id);
          if (!t || t.surum !== g.guncelleme || t.sorumluId !== sorumlu.id) {
            t = { surum: g.guncelleme, sorumluId: sorumlu.id, hatirlatma: 0, sonEylem: 0, yukseltildi: false, kurulaBildirildi: false };
            this.takip.set(g.id, t);
          }
          // Çalışan, kurul kararı bekleyen, kurulca duraklatılan ya da durdurulan, eşzamanlı tavan yüzünden sırada bekleyen
          // ajan tıkanmış sayılmaz
          if (sorumlu.durum === "calisiyor" || sorumlu.durum === "karar_bekliyor" || sorumlu.durum === "duraklatildi" || this.sirket.siradaMi(sorumlu.id)) continue;
          if (this.sirket.kurulDurdurduMu(sorumlu.id)) continue;
          const sonHareket = Math.max(Date.parse(g.guncelleme) || 0, this.sirket.sonEtkinlik.get(sorumlu.id) ?? 0, this.acilisMs, t.sonEylem);
          // Turu biten ama görevi süren çalışan: etkin projede ilk hatırlatma kısa sessizlikten sonra (görev başına saatte
          // sınırlı); uykudaki projede kurulun eşiğiyle
          const hizliAnlar = (this.hizli.get(g.id) ?? []).filter((z) => simdiMs - z < HIZLI_PENCERE_MS);
          const hizli =
            g.durum === "calisiliyor" && t.hatirlatma === 0 && hizliAnlar.length < HIZLI_SINIR && HIZLI_HATIRLATMA_MS < esik && this.sirket.projeEtkinMi(proje.id, simdiMs);
          if (simdiMs - sonHareket < (hizli ? HIZLI_HATIRLATMA_MS : esik)) continue;
          const dk = Math.round((simdiMs - Math.max(Date.parse(g.guncelleme) || 0, this.acilisMs)) / 60_000);
          t.sonEylem = simdiMs;
          if (hizli) this.hizli.set(g.id, [...hizliAnlar, simdiMs]);
          if (t.hatirlatma < HATIRLATMA_SINIRI) {
            t.hatirlatma++;
            await this.sirket.uyandir(sorumlu.id, this.hatirlatmaMetni(g, dk, hizli), null);
            eylemler.push({ tur: "hatirlatma", gorevKodu: g.kod, ajanAd: sorumlu.ad });
            continue;
          }
          const yonetici = this.yoneticiBul(sorumlu, ajanlar);
          if (!t.yukseltildi && yonetici && !this.sirket.kurulDurdurduMu(yonetici.id)) {
            t.yukseltildi = true;
            await this.sirket.uyandir(
              yonetici.id,
              iki(
                `${g.kod} "${g.baslik}" ${dk} dakikadır ilerlemiyor; ${sorumlu.ad} iki hatırlatmaya karşın görevi ilerletmedi. Durumu incele (ekip_listele, gorev_detay, kanal_oku): engeli kaldır, görevi böl ya da başka birine ata; çözemiyorsan kurula #genel'de yaz.`,
                `${g.kod} "${g.baslik}" has not moved for ${dk} minutes; ${sorumlu.ad} did not move it forward despite two reminders. Look into it (ekip_listele, gorev_detay, kanal_oku): remove the blocker, split the task or assign it to someone else; if you can't solve it, write to the board in #general.`,
              ),
              null,
            );
            eylemler.push({ tur: "yukseltme", gorevKodu: g.kod, ajanAd: yonetici.ad });
            continue;
          }
          if (!t.kurulaBildirildi) {
            t.kurulaBildirildi = true;
            const metin = iki(
              `${g.kod} "${g.baslik}" ${dk} dakikadır ilerlemiyor (${kucuk(gorevDurumAdi(g.durum))}, sorumlu ${sorumlu.ad}). Hatırlatma ve yükseltme sonuç vermedi; kurulun bakması gerekiyor.`,
              `${g.kod} "${g.baslik}" has not moved for ${dk} minutes (${kucuk(gorevDurumAdi(g.durum))}, owner ${sorumlu.ad}). Reminders and escalation did not help; the board needs to take a look.`,
            );
            this.sirket.kanalMesaji(proje.id, "genel", { id: "arnorg", ad: "ArnOrg" }, metin);
            this.sirket.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin, projeId: proje.id });
            eylemler.push({ tur: "kurul", gorevKodu: g.kod, ajanAd: sorumlu.ad });
          }
        }
      }
      for (const id of this.takip.keys()) if (!gorulen.has(id)) this.takip.delete(id);
      for (const [id, anlar] of this.hizli) if (!gorulen.has(id) || anlar.every((z) => simdiMs - z >= HIZLI_PENCERE_MS)) this.hizli.delete(id);
    } finally {
      this.calisiyor = false;
    }
    return eylemler;
  }

  private sorumluBul(g: Gorev, ajanlar: Ajan[]): Ajan | null {
    if (g.durum === "calisiliyor") return ajanlar.find((a) => a.id === g.atananId) ?? null;
    return ajanlar.find((a) => a.rol === "inceleme" && a.id !== g.atananId) ?? ajanlar.find((a) => a.rol === "ceo") ?? null;
  }

  private yoneticiBul(sorumlu: Ajan, ajanlar: Ajan[]): Ajan | null {
    const y = sorumlu.yoneticiId ? ajanlar.find((a) => a.id === sorumlu.yoneticiId) : null;
    if (y && y.id !== sorumlu.id) return y;
    const ceo = ajanlar.find((a) => rolBul(a.rol)?.kimlik === "ceo");
    return ceo && ceo.id !== sorumlu.id ? ceo : null;
  }

  private hatirlatmaMetni(g: Gorev, dk: number, turBitti = false): string {
    if (g.durum === "inceleme") {
      // 0.0.8: birleştirme yok; inceleme görevin kaydını okuyup tamamlamak ya da geri göndermektir
      return iki(
        `${g.kod} "${g.baslik}" ${dk} dakikadır incelemede bekliyor. Kaydını calisma_farki ile (gorev: ${g.kod}) incele; uygunsa görevi 'tamam' durumuna al, değilse 'calisiliyor' durumuna geri al ve sahibine yaz.`,
        `${g.kod} "${g.baslik}" has been waiting in review for ${dk} minutes. Review its save with calisma_farki (gorev: ${g.kod}); if it is right, move the task to 'tamam' (done); if not, move it back to 'calisiliyor' and write to its owner.`,
      );
    }
    if (turBitti) {
      return iki(
        `Turun bitti ama ${g.kod} "${g.baslik}" hâlâ 'calisiliyor' durumunda. İş bittiyse testleri çalıştır ve görevi 'inceleme' durumuna al (ArnOrg dosyalarını kaydeder). Sürüyorsa kaldığın yerden devam et. Başkasının kirasındaki bir dosyayı bekliyorsan yeniden dene ya da görevinin başka bir parçasına geç; tıkandıysan nedenini mesaj_gonder ile yöneticine yaz.`,
        `Your turn ended but ${g.kod} "${g.baslik}" is still 'calisiliyor'. If the work is done, run the tests and move the task to 'inceleme' (review); ArnOrg saves its files. If it is ongoing, continue where you left off. If you are waiting for a file leased to someone else, try again or move to another part of your task; if you are stuck, tell your manager why with mesaj_gonder.`,
      );
    }
    return iki(
      `${g.kod} "${g.baslik}" ${dk} dakikadır ilerlemiyor görünüyor. İş bittiyse testleri çalıştır ve görevi 'inceleme' durumuna al (ArnOrg dosyalarını kaydeder); sürüyorsa kaldığın yerden devam et; tıkandıysan nedenini mesaj_gonder ile yöneticine yaz.`,
      `${g.kod} "${g.baslik}" seems not to have moved for ${dk} minutes. If the work is done, run the tests and move the task to 'inceleme' (review); ArnOrg saves its files. If it is ongoing, continue where you left off; if you are stuck, tell your manager why with mesaj_gonder.`,
    );
  }
}
