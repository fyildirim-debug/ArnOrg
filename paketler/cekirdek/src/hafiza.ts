// Proje hafızası: ajanların unutmaması için projeye özgü kalıcı bilgi.
// Kayıtlar veritabanında aranır, repo içinde .arnorg/hafiza altında okunur biçimde ve geri yüklenebilir JSON olarak tutulur.
import fs from "node:fs";
import path from "node:path";
import { HAFIZA_TURU_ADLARI, type Ajan, type AjanSorusu, type HafizaKaydi, type HafizaTuru, type HafizaYazIstegi, type Proje } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import type { OlayYolu } from "./olaylar.js";
import { aramaMetni, ArnorgHatasi, kisalt, sadelestir } from "./yardimci.js";

export const HAFIZA_TURLERI: HafizaTuru[] = ["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"];
const HAFIZA_DIZINI = [".arnorg", "hafiza"];
/** Oturum bağlamına girecek bölüm başına en çok kayıt */
const BAGLAM_SINIRI: Record<HafizaTuru, number> = { tercih: 15, karar: 10, ogrenilen: 10, olgu: 8, uzmanlik: 10, ozet: 6 };
const BAGLAM_BASLIKLARI: Record<HafizaTuru, string> = {
  tercih: "Kurul tercihleri (her zaman uy)",
  karar: "Kararlar",
  ogrenilen: "Öğrenilenler (aynı hatayı tekrarlama)",
  olgu: "Proje olguları",
  uzmanlik: "Kim neyi biliyor",
  ozet: "Son tamamlananlar",
};

export interface Kaynak {
  ajan: Ajan | null;
  /** Ajan yoksa görünen ad (Yönetim kurulu, ArnOrg) */
  ad?: string;
}

function hafizaKoku(proje: Proje): string {
  return path.join(proje.yol, ...HAFIZA_DIZINI);
}

function defterYolu(proje: Proje, ajanAd: string): string {
  return path.join(hafizaKoku(proje), "ajanlar", `${sadelestir(ajanAd)}.md`);
}

function denetle(istek: HafizaYazIstegi): void {
  if (!HAFIZA_TURLERI.includes(istek.tur)) throw new ArnorgHatasi("Geçersiz hafıza türü.");
  if (!istek.baslik?.trim() || istek.baslik.trim().length > 160) throw new ArnorgHatasi("Başlık 1–160 karakter olmalı.");
  if (!istek.metin?.trim() || istek.metin.length > 8000) throw new ArnorgHatasi("Metin 1–8000 karakter olmalı.");
}

export class ProjeHafizasi {
  private yansitmaZamanlayicilari = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly depo: Depo,
    private readonly olaylar: OlayYolu,
    private readonly proje: (id: string) => Proje,
    /** .arnorg değişince çağrılır (gecikmeli commit için) */
    private readonly degisti: (projeId: string) => void = () => undefined,
  ) {}

  /** Kayıt yazar; aynı tür ve başlıkta geçerli kayıt varsa onu günceller (tekrar birikmez) */
  yaz(projeId: string, istek: HafizaYazIstegi, kaynak: Kaynak): HafizaKaydi {
    denetle(istek);
    const baslik = istek.baslik.trim();
    const onem = Math.min(Math.max(Math.round(istek.onem ?? 3), 1), 5);
    const etiketler = [...new Set((istek.etiketler ?? []).map((e) => e.trim().toLocaleLowerCase("tr")).filter(Boolean))].slice(0, 12);
    const anahtar = aramaMetni(baslik);
    const ayni = this.depo.hafizaKayitlari(projeId, { tur: istek.tur }).find((k) => aramaMetni(k.baslik) === anahtar);
    let kayit: HafizaKaydi;
    if (ayni && !istek.yerineGectigi) {
      kayit = this.depo.hafizaGuncelle(ayni.id, { metin: istek.metin.trim(), etiketler, onem: Math.max(onem, ayni.onem), gorevId: istek.gorevId ?? ayni.gorevId })!;
    } else {
      kayit = this.depo.hafizaEkle({
        projeId,
        tur: istek.tur,
        baslik,
        metin: istek.metin.trim(),
        etiketler,
        kaynakAjanId: kaynak.ajan?.id ?? null,
        kaynakAd: kaynak.ajan?.ad ?? kaynak.ad ?? "ArnOrg",
        gorevId: istek.gorevId ?? null,
        onem,
      });
      if (istek.yerineGectigi) {
        const eski = this.depo.hafizaKaydi(istek.yerineGectigi);
        if (!eski || eski.projeId !== projeId) throw new ArnorgHatasi("Yerine geçilecek kayıt bulunamadı.", 404);
        this.depo.hafizaGuncelle(eski.id, { yerineGecen: kayit.id });
      }
    }
    this.olaylar.yayinla({ tur: "hafiza.yeni", kayit });
    this.yansitPlanla(projeId);
    return kayit;
  }

  guncelle(id: string, alanlar: Partial<Pick<HafizaKaydi, "tur" | "baslik" | "metin" | "etiketler" | "onem">>): HafizaKaydi {
    const eski = this.depo.hafizaKaydi(id);
    if (!eski) throw new ArnorgHatasi("Hafıza kaydı bulunamadı.", 404);
    denetle({ tur: alanlar.tur ?? eski.tur, baslik: alanlar.baslik ?? eski.baslik, metin: alanlar.metin ?? eski.metin });
    const kayit = this.depo.hafizaGuncelle(id, alanlar)!;
    this.olaylar.yayinla({ tur: "hafiza.yeni", kayit });
    this.yansitPlanla(kayit.projeId);
    return kayit;
  }

  sil(id: string): void {
    const eski = this.depo.hafizaKaydi(id);
    if (!eski) throw new ArnorgHatasi("Hafıza kaydı bulunamadı.", 404);
    this.depo.hafizaSil(id);
    this.yansitPlanla(eski.projeId);
  }

  ara(projeId: string, sorgu: string, tur?: HafizaTuru, sinir = 15): HafizaKaydi[] {
    const sonuc = this.depo.hafizaAra(projeId, sorgu, sinir * 2);
    return (tur ? sonuc.filter((k) => k.tur === tur) : sonuc).slice(0, sinir);
  }

  // ---------------- defter ----------------

  defter(ajan: Ajan): string {
    return this.depo.defter(ajan.id)?.icerik ?? "";
  }

  defterYaz(ajan: Ajan, icerik: string): void {
    const temiz = icerik.trim();
    if (temiz.length > 6000) throw new ArnorgHatasi("Defter en çok 6000 karakter olabilir; eskiyen maddeleri çıkar.");
    this.depo.defterYaz(ajan.id, ajan.projeId, temiz);
    try {
      const dosya = defterYolu(this.proje(ajan.projeId), ajan.ad);
      fs.mkdirSync(path.dirname(dosya), { recursive: true });
      fs.writeFileSync(dosya, `# ${ajan.ad} · defter\n\n${temiz}\n`, "utf8");
      this.degisti(ajan.projeId);
    } catch {
      // Repo yazılamıyorsa veritabanı yeterli
    }
  }

  // ---------------- bağlam ----------------

  /** Oturum başında ajanın talimatına eklenen hafıza: kurul tercihleri, kararlar, öğrenilenler, uzmanlıklar, defter, bekleyen sorular */
  baglam(ajan: Ajan, bekleyenSorular: AjanSorusu[]): string {
    const satirlar: string[] = ["## Proje hafızası"];
    satirlar.push(
      "Bu projede ekipçe öğrendiklerimiz. Kurul tercihlerine her zaman uy. Bir karar değişirse ya da yeni bir şey öğrenirsen mcp__arnorg__hafiza_kaydet ile kaydet; eskiyen kaydı yerine_gecen ile işaretle.",
    );
    let toplam = 0;
    const butce = 7000;
    for (const tur of HAFIZA_TURLERI) {
      const kayitlar = this.depo.hafizaKayitlari(ajan.projeId, { tur, sinir: BAGLAM_SINIRI[tur] });
      if (!kayitlar.length) continue;
      satirlar.push("", `### ${BAGLAM_BASLIKLARI[tur]}`);
      for (const k of kayitlar) {
        const satir = `- ${k.baslik}: ${kisalt(k.metin.replace(/\s+/g, " "), 220)} (${k.kaynakAd}, kimlik ${k.id.slice(0, 8)})`;
        toplam += satir.length;
        if (toplam > butce) break;
        satirlar.push(satir);
      }
      if (toplam > butce) break;
    }
    if (satirlar.length === 2) satirlar.push("", "Henüz kayıt yok. İlk kararları ve kurulun tercihlerini sen kaydet.");
    const defter = this.defter(ajan);
    satirlar.push("", "## Defterin", defter ? kisalt(defter, 2500) : "Boş. İlk turunun sonunda defter_yaz ile açık işlerini ve sözlerini yaz.");
    if (bekleyenSorular.length) {
      satirlar.push("", "## Sana sorulan, yanıt bekleyen sorular");
      for (const s of bekleyenSorular.slice(0, 8)) satirlar.push(`- (soru ${s.id}) ${s.soranAd}: ${kisalt(s.soru, 300)}`);
      satirlar.push("Bunları soruyu_yanitla ile yanıtla.");
    }
    return satirlar.join("\n");
  }

  /** Bir iş metniyle ilgili en fazla birkaç kayıt; görev verilirken mesaja eklenir */
  ilgili(projeId: string, metin: string, sinir = 5): string {
    const kayitlar = this.ara(projeId, metin, undefined, sinir);
    if (!kayitlar.length) return "";
    return ["İlgili hafıza:", ...kayitlar.map((k) => `- [${HAFIZA_TURU_ADLARI[k.tur]}] ${k.baslik}: ${kisalt(k.metin.replace(/\s+/g, " "), 200)}`)].join("\n");
  }

  // ---------------- repo yansıması ----------------

  private yansitPlanla(projeId: string): void {
    const z = this.yansitmaZamanlayicilari.get(projeId);
    if (z) clearTimeout(z);
    const yeni = setTimeout(() => {
      this.yansitmaZamanlayicilari.delete(projeId);
      try {
        this.yansit(projeId);
      } catch {
        // Repo yazılamıyorsa veritabanı yeterli
      }
    }, 800);
    yeni.unref();
    this.yansitmaZamanlayicilari.set(projeId, yeni);
  }

  /** .arnorg/hafiza/hafiza.md (okunur) ve kayitlar.json (geri yükleme) */
  yansit(projeId: string): void {
    const proje = this.proje(projeId);
    const kok = hafizaKoku(proje);
    fs.mkdirSync(kok, { recursive: true });
    const hepsi = this.depo.hafizaKayitlari(projeId, { eskilerDahil: true, sinir: 5000 });
    const gecerli = hepsi.filter((k) => !k.yerineGecen);
    const md: string[] = [
      "# Proje hafızası",
      "",
      "ArnOrg bu dosyayı kendisi yazar. Kayıtları Stüdyo'nun Hafıza ekranından ya da ajan araçlarıyla değiştirin; elle yapılan değişiklik bir sonraki yazımda kaybolur.",
    ];
    for (const tur of HAFIZA_TURLERI) {
      const liste = gecerli.filter((k) => k.tur === tur);
      if (!liste.length) continue;
      md.push("", `## ${BAGLAM_BASLIKLARI[tur].replace(/ \(.*\)$/, "")}`, "");
      for (const k of liste) md.push(`- **${k.baslik}** — ${k.metin.replace(/\n+/g, " ")} _(${k.kaynakAd}, ${k.guncelleme.slice(0, 10)})_`);
    }
    fs.writeFileSync(path.join(kok, "hafiza.md"), md.join("\n") + "\n", "utf8");
    fs.writeFileSync(path.join(kok, "kayitlar.json"), JSON.stringify({ surum: 1, kayitlar: hepsi.reverse() }, null, 1) + "\n", "utf8");
    this.degisti(projeId);
  }

  /** Var olan repo bağlanınca hafıza ve defterler geri yüklenir (veritabanında kayıt yoksa) */
  iceAktar(proje: Proje, ajanlar: Ajan[]): number {
    if (this.depo.hafizaKayitlari(proje.id, { eskilerDahil: true, sinir: 1 }).length) return 0;
    const kok = hafizaKoku(proje);
    let adet = 0;
    try {
      const veri = JSON.parse(fs.readFileSync(path.join(kok, "kayitlar.json"), "utf8")) as { kayitlar?: HafizaKaydi[] };
      const eslesme = new Map<string, string>();
      for (const k of veri.kayitlar ?? []) {
        if (!HAFIZA_TURLERI.includes(k.tur) || !k.baslik || !k.metin) continue;
        const ajan = ajanlar.find((a) => a.ad === k.kaynakAd) ?? null;
        const yeni = this.depo.hafizaEkle({
          projeId: proje.id,
          tur: k.tur,
          baslik: k.baslik,
          metin: k.metin,
          etiketler: Array.isArray(k.etiketler) ? k.etiketler : [],
          kaynakAjanId: ajan?.id ?? null,
          kaynakAd: k.kaynakAd || "ArnOrg",
          gorevId: null,
          onem: Number(k.onem) || 3,
          olusturma: k.olusturma,
        });
        eslesme.set(k.id, yeni.id);
        adet++;
      }
      for (const k of veri.kayitlar ?? []) {
        const yeni = eslesme.get(k.id);
        const yerine = k.yerineGecen ? eslesme.get(k.yerineGecen) : undefined;
        if (yeni && yerine) this.depo.hafizaGuncelle(yeni, { yerineGecen: yerine });
      }
    } catch {
      // kayitlar.json yok ya da bozuk
    }
    for (const a of ajanlar) {
      try {
        const metin = fs.readFileSync(defterYolu(proje, a.ad), "utf8").replace(/^# .*\n+/, "").trim();
        if (metin) this.depo.defterYaz(a.id, proje.id, metin);
      } catch {
        // defter yok
      }
    }
    return adet;
  }

  kapat(): void {
    for (const z of this.yansitmaZamanlayicilari.values()) clearTimeout(z);
  }
}
