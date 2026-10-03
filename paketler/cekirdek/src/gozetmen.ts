// Gözetmen: tıkanma koruması (ilerlemeyen görevi hatırlatma ve yükseltme) ve dönem raporu
import { GOREV_DURUM_ADLARI, KARAR_ADLARI, ONAY_TURU_ADLARI, type Ajan, type Gorev, type Karar, type Rapor } from "@arnorg/ortak";
import { rolBul } from "./roller.js";
import type { Sirket } from "./sirket.js";
import { bugun } from "./yardimci.js";

/** Aynı görev için yükseltmeden önce sorumluya gönderilen hatırlatma sayısı */
const HATIRLATMA_SINIRI = 2;
const GUN_MS = 86_400_000;

// ===================================================================
// Dönem raporu
// ===================================================================

/** 1234567 → "1,2 milyon", 48200 → "48 bin" */
export function tokenMetni(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} milyon`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString("tr-TR")} bin`;
  return String(Math.round(n));
}
const tarih = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function raporOlustur(sirket: Sirket, projeId: string, gun = 7): Rapor {
  const proje = sirket.proje(projeId);
  const donem = Math.min(Math.max(1, Math.round(gun)), 90);
  const baslangicTarihi = new Date(Date.now() - (donem - 1) * GUN_MS);
  const baslangicGun = bugun(baslangicTarihi);
  const baslangicAni = new Date(baslangicTarihi.getFullYear(), baslangicTarihi.getMonth(), baslangicTarihi.getDate()).toISOString();
  const ajanlar = sirket.depo.ajanlar(projeId);
  const ad = (id: string | null) => (id ? (ajanlar.find((a) => a.id === id)?.ad ?? "ayrılmış çalışan") : "atanmamış");
  const gorevler = sirket.depo.gorevler(projeId);
  const kod = (id: string) => gorevler.find((g) => g.id === id)?.kod ?? "?";
  const satir = (g: Gorev, ek = "") => `- ${g.kod} ${g.baslik} · ${ad(g.atananId)}${ek}`;

  const tamamlanan = gorevler.filter((g) => g.durum === "tamam" && g.guncelleme >= baslangicAni);
  const suren = gorevler.filter((g) => g.durum === "calisiliyor");
  const incelemede = gorevler.filter((g) => g.durum === "inceleme");
  const acik = gorevler.filter((g) => g.durum === "bekleyen" || g.durum === "planlandi");
  const tikanan = acik.flatMap((g) => {
    const bitmemis = g.bagimliliklar.filter((b) => gorevler.find((x) => x.id === b)?.durum !== "tamam");
    if (bitmemis.length) return [satir(g, ` · bekliyor: ${bitmemis.map(kod).join(", ")}`)];
    if (!g.atananId) return [satir(g)];
    return [];
  });

  const kullanimlar = sirket.depo.donemKullanimi(projeId, baslangicGun);
  const donemTokeni = kullanimlar.reduce((t, m) => t + m.token, 0);
  const denetim = sirket.depo.denetimSayilari(projeId, baslangicAni);
  const bekleyenOnaylar = sirket.depo.onaylar(projeId, "bekliyor");
  const sonuclananlar = sirket.depo.onaylar(projeId).filter((o) => o.durum !== "bekliyor" && (o.sonuclanma ?? "") >= baslangicAni);
  const birlesenler = sonuclananlar.filter((o) => o.tur === "birlestirme" && o.durum === "onaylandi");
  const iseAlinanlar = sonuclananlar.filter((o) => o.tur === "ise_alim" && o.durum === "onaylandi");

  const baslik = `Durum raporu · ${bugun()}`;
  const b: string[] = [];
  b.push(`# ${baslik}`, "");
  b.push(`${proje.ad} · ${donem === 1 ? "bugün" : `son ${donem} gün (${baslangicGun} itibarıyla)`}`, "");
  b.push("## Özet", "");
  b.push(`- Tamamlanan görev: ${tamamlanan.length} · süren: ${suren.length} · incelemede: ${incelemede.length} · açık: ${acik.length}`);
  b.push(`- Kullanım: ${tokenMetni(donemTokeni)} token (bugün ${tokenMetni(sirket.depo.projeTokeni(projeId, bugun()))})`);
  const pencereler = sirket.hesap.mevcut.pencereler.filter((p) => p.tur === "bes_saat" || p.tur === "haftalik");
  if (pencereler.length) b.push(`- Abonelik: ${pencereler.map((p) => `${p.ad.toLocaleLowerCase("tr")} %${Math.round(p.yuzde ?? 0)}`).join(", ")}`);
  const denetimOzeti = (Object.keys(KARAR_ADLARI) as Karar[]).filter((k) => denetim[k]).map((k) => `${KARAR_ADLARI[k].toLocaleLowerCase("tr")} ${denetim[k]}`);
  b.push(`- Denetim: ${denetimOzeti.length ? denetimOzeti.join(", ") : "kayıt yok"}`);
  b.push(`- Birleştirme: ${birlesenler.length} · işe alım: ${iseAlinanlar.length} · bekleyen onay: ${bekleyenOnaylar.length}`, "");

  const bolum = (ad: string, satirlar: string[]) => {
    if (!satirlar.length) return;
    b.push(`## ${ad}`, "", ...satirlar, "");
  };
  bolum("Tamamlananlar", tamamlanan.map((g) => satir(g, ` · ${tarih(g.guncelleme)}`)));
  bolum("Sürenler", suren.map((g) => satir(g)));
  bolum("İncelemede", incelemede.map((g) => satir(g)));
  bolum("Tıkananlar", tikanan);
  bolum(
    "Bekleyen onaylar",
    bekleyenOnaylar.map((o) => `- ${ONAY_TURU_ADLARI[o.tur]}: ${o.baslik}${o.ajanId ? ` · ${ad(o.ajanId)}` : ""}`),
  );
  bolum("Birleştirilenler", birlesenler.map((o) => `- ${o.baslik} · ${tarih(o.sonuclanma ?? o.olusturma)}`));

  b.push("## Ekip", "", "| Çalışan | Rol | Durum | Dönem kullanımı |", "|---|---|---|---|");
  for (const a of ajanlar) {
    const m = kullanimlar.find((x) => x.ajanId === a.id);
    const kullanim = `${tokenMetni(m?.token ?? 0)} token`;
    const gorev = a.gorevId ? gorevler.find((g) => g.id === a.gorevId) : null;
    const durum = gorev && gorev.durum !== "tamam" ? `${gorev.kod} ${GOREV_DURUM_ADLARI[gorev.durum].toLocaleLowerCase("tr")}` : "görevsiz";
    b.push(`| ${a.ad} | ${a.rolAdi} | ${durum} | ${kullanim} |`);
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
        const ajanlar = this.sirket.depo.ajanlar(proje.id);
        const bekleyenBirlestirmeler = this.sirket.depo
          .onaylar(proje.id, "bekliyor")
          .filter((o) => o.tur === "birlestirme")
          .map((o) => (o.veri as { ajanId?: string } | null)?.ajanId);
        for (const g of this.sirket.depo.gorevler(proje.id)) {
          if (g.durum !== "calisiliyor" && g.durum !== "inceleme") continue;
          // Birleştirme kurul onayındaysa sıra kurulda; ajan dürtülmez
          if (g.durum === "inceleme" && g.atananId && bekleyenBirlestirmeler.includes(g.atananId)) continue;
          const sorumlu = this.sorumluBul(g, ajanlar);
          if (!sorumlu) continue;
          gorulen.add(g.id);
          let t = this.takip.get(g.id);
          if (!t || t.surum !== g.guncelleme || t.sorumluId !== sorumlu.id) {
            t = { surum: g.guncelleme, sorumluId: sorumlu.id, hatirlatma: 0, sonEylem: 0, yukseltildi: false, kurulaBildirildi: false };
            this.takip.set(g.id, t);
          }
          // Çalışan, kurul kararı bekleyen ya da kurulca duraklatılan ajan tıkanmış sayılmaz
          if (sorumlu.durum === "calisiyor" || sorumlu.durum === "karar_bekliyor" || sorumlu.durum === "duraklatildi") continue;
          const sonHareket = Math.max(Date.parse(g.guncelleme) || 0, this.sirket.sonEtkinlik.get(sorumlu.id) ?? 0, this.acilisMs, t.sonEylem);
          if (simdiMs - sonHareket < esik) continue;
          const dk = Math.round((simdiMs - Math.max(Date.parse(g.guncelleme) || 0, this.acilisMs)) / 60_000);
          t.sonEylem = simdiMs;
          if (t.hatirlatma < HATIRLATMA_SINIRI) {
            t.hatirlatma++;
            await this.sirket.uyandir(sorumlu.id, this.hatirlatmaMetni(g, dk), null);
            eylemler.push({ tur: "hatirlatma", gorevKodu: g.kod, ajanAd: sorumlu.ad });
            continue;
          }
          const yonetici = this.yoneticiBul(sorumlu, ajanlar);
          if (!t.yukseltildi && yonetici) {
            t.yukseltildi = true;
            await this.sirket.uyandir(
              yonetici.id,
              `${g.kod} "${g.baslik}" ${dk} dakikadır ilerlemiyor; ${sorumlu.ad} iki hatırlatmaya karşın görevi ilerletmedi. Durumu incele (ekip_listele, gorev_detay, kanal_oku): engeli kaldır, görevi böl ya da başka birine ata; çözemiyorsan kurula #genel'de yaz.`,
              null,
            );
            eylemler.push({ tur: "yukseltme", gorevKodu: g.kod, ajanAd: yonetici.ad });
            continue;
          }
          if (!t.kurulaBildirildi) {
            t.kurulaBildirildi = true;
            const metin = `${g.kod} "${g.baslik}" ${dk} dakikadır ilerlemiyor (${GOREV_DURUM_ADLARI[g.durum].toLocaleLowerCase("tr")}, sorumlu ${sorumlu.ad}). Hatırlatma ve yükseltme sonuç vermedi; kurulun bakması gerekiyor.`;
            this.sirket.kanalMesaji(proje.id, "genel", { id: "arnorg", ad: "ArnOrg" }, metin);
            this.sirket.olaylar.yayinla({ tur: "bildirim", seviye: "uyari", metin, projeId: proje.id });
            eylemler.push({ tur: "kurul", gorevKodu: g.kod, ajanAd: sorumlu.ad });
          }
        }
      }
      for (const id of this.takip.keys()) if (!gorulen.has(id)) this.takip.delete(id);
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

  private hatirlatmaMetni(g: Gorev, dk: number): string {
    if (g.durum === "inceleme") {
      return `${g.kod} "${g.baslik}" ${dk} dakikadır incelemede bekliyor. calisma_farki ile değişiklikleri incele; uygunsa birlestirme_iste ile kurula sun, değilse görevi 'calisiliyor' durumuna geri al ve sahibine yaz.`;
    }
    return `${g.kod} "${g.baslik}" ${dk} dakikadır ilerlemiyor görünüyor. İş bittiyse testleri çalıştırıp commit'le ve görevi 'inceleme' durumuna al; sürüyorsa kaldığın yerden devam et; tıkandıysan nedenini mesaj_gonder ile yöneticine yaz.`;
  }
}
