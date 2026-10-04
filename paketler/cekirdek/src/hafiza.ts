// Proje hafızası: ajanların unutmaması için projeye özgü kalıcı bilgi.
// Kayıtlar veritabanında aranır, repo içinde .arnorg/hafiza altında okunur biçimde ve geri yüklenebilir JSON olarak tutulur.
import fs from "node:fs";
import path from "node:path";
import { HAFIZA_TURU_ADLARI, type Ajan, type AjanSorusu, type HafizaBenzerCifti, type HafizaKaydi, type HafizaTuru, type HafizaYazIstegi, type Proje } from "@arnorg/ortak";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import type { OlayYolu } from "./olaylar.js";
import { anlamliSozcukler, aramaMetni, ArnorgHatasi, jsonOku, kisalt, sadelestir } from "./yardimci.js";

export const HAFIZA_TURLERI: HafizaTuru[] = ["tercih", "karar", "ogrenilen", "olgu", "uzmanlik", "ozet"];
const HAFIZA_DIZINI = [".arnorg", "hafiza"];
/** Oturum bağlamına girecek bölüm başına en çok kayıt */
const BAGLAM_SINIRI: Record<HafizaTuru, number> = { tercih: 15, karar: 10, ogrenilen: 10, olgu: 8, uzmanlik: 10, ozet: 6 };
function baglamBasligi(tur: HafizaTuru): string {
  const b: Record<HafizaTuru, [string, string]> = {
    tercih: ["Kurul tercihleri (her zaman uy)", "Board preferences (always follow)"],
    karar: ["Kararlar", "Decisions"],
    ogrenilen: ["Öğrenilenler (aynı hatayı tekrarlama)", "Lessons (do not repeat the same mistake)"],
    olgu: ["Proje olguları", "Project facts"],
    uzmanlik: ["Kim neyi biliyor", "Who knows what"],
    ozet: ["Son tamamlananlar", "Recently completed"],
  };
  return iki(b[tur][0], b[tur][1]);
}

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

function ciftAnahtari(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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
        const eskimis = this.depo.hafizaGuncelle(eski.id, { yerineGecen: kayit.id });
        if (eskimis) this.olaylar.yayinla({ tur: "hafiza.yeni", kayit: eskimis });
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
    this.olaylar.yayinla({ tur: "hafiza.silindi", projeId: eski.projeId, id });
    this.yansitPlanla(eski.projeId);
  }

  ara(projeId: string, sorgu: string, tur?: HafizaTuru, sinir = 15): HafizaKaydi[] {
    const sonuc = this.depo.hafizaAra(projeId, sorgu, sinir * 2);
    return (tur ? sonuc.filter((k) => k.tur === tur) : sonuc).slice(0, sinir);
  }

  // ---------------- bakım: tekrar eden kayıtlar ----------------

  /**
   * Aynı türde birbirini tekrar eden geçerli kayıt çiftleri. Benzerlik: sözcük kümelerinin Jaccard oranı;
   * kısa kayıt uzun olanın içinde kalıyorsa örtüşme oranı da sayılır (en az 3 ortak sözcükle).
   */
  benzerler(projeId: string, esik = 0.45): HafizaBenzerCifti[] {
    const ayrik = new Set(jsonOku<string[]>(this.depo.deger(`hafiza-ayrik:${projeId}`), []));
    const kumeler = this.depo.hafizaKayitlari(projeId, { sinir: 500 }).map((k) => ({ k, s: new Set(anlamliSozcukler(`${k.baslik} ${k.metin}`, 60)) }));
    const sonuc: HafizaBenzerCifti[] = [];
    for (let i = 0; i < kumeler.length; i++) {
      for (let j = i + 1; j < kumeler.length; j++) {
        const x = kumeler[i]!;
        const y = kumeler[j]!;
        if (x.k.tur !== y.k.tur || !x.s.size || !y.s.size || ayrik.has(ciftAnahtari(x.k.id, y.k.id))) continue;
        let ortak = 0;
        for (const s of x.s) if (y.s.has(s)) ortak++;
        const jaccard = ortak / (x.s.size + y.s.size - ortak);
        const ortusme = ortak >= 3 ? ortak / Math.min(x.s.size, y.s.size) : 0;
        const benzerlik = Math.max(jaccard, ortusme * 0.8);
        if (benzerlik >= esik) sonuc.push({ a: x.k, b: y.k, benzerlik: Math.round(benzerlik * 100) / 100 });
      }
    }
    return sonuc.sort((a, b) => b.benzerlik - a.benzerlik).slice(0, 30);
  }

  /** Kurul iki kaydın ayrı kalmasına karar verdi; çift bir daha önerilmez */
  ayriTut(projeId: string, aId: string, bId: string): void {
    const liste = jsonOku<string[]>(this.depo.deger(`hafiza-ayrik:${projeId}`), []);
    const anahtar = ciftAnahtari(aId, bId);
    if (!liste.includes(anahtar)) this.depo.degerYaz(`hafiza-ayrik:${projeId}`, JSON.stringify([...liste, anahtar].slice(-500)));
  }

  /** Tutulan kayıt kalır (istenirse metni birleşik hâliyle güncellenir), öteki onun yerine geçmiş sayılır */
  birlestir(tutulanId: string, eskiyenId: string, metin?: string): HafizaKaydi {
    const tutulan = this.depo.hafizaKaydi(tutulanId);
    const eskiyen = this.depo.hafizaKaydi(eskiyenId);
    if (!tutulan || !eskiyen || tutulan.projeId !== eskiyen.projeId) throw new ArnorgHatasi("Birleştirilecek kayıtlar bulunamadı.", 404);
    if (tutulan.id === eskiyen.id) throw new ArnorgHatasi("Kayıt kendisiyle birleştirilemez.");
    if (tutulan.yerineGecen) throw new ArnorgHatasi("Tutulacak kayıt zaten eskimiş.", 409);
    const yeniMetin = metin?.trim();
    if (yeniMetin !== undefined && (!yeniMetin || yeniMetin.length > 8000)) throw new ArnorgHatasi("Metin 1–8000 karakter olmalı.");
    const etiketler = [...new Set([...tutulan.etiketler, ...eskiyen.etiketler])].slice(0, 12);
    const kayit = this.depo.hafizaGuncelle(tutulan.id, { metin: yeniMetin ?? tutulan.metin, etiketler, onem: Math.max(tutulan.onem, eskiyen.onem) })!;
    const eskimis = this.depo.hafizaGuncelle(eskiyen.id, { yerineGecen: tutulan.id })!;
    this.olaylar.yayinla({ tur: "hafiza.yeni", kayit });
    this.olaylar.yayinla({ tur: "hafiza.yeni", kayit: eskimis });
    this.yansitPlanla(kayit.projeId);
    return kayit;
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
  baglam(ajan: Ajan, bekleyenSorular: AjanSorusu[], gosterilen?: string[]): string {
    const satirlar: string[] = [iki("## Proje hafızası", "## Project memory")];
    satirlar.push(
      iki(
        "Bu projede ekipçe öğrendiklerimiz. Kurul tercihlerine her zaman uy. Bir karar değişirse ya da yeni bir şey öğrenirsen mcp__arnorg__hafiza_kaydet ile kaydet; eskiyen kaydı yerine_gecen ile işaretle.",
        "What we have learned as a team in this project. Always follow the board's preferences. If a decision changes or you learn something new, save it with mcp__arnorg__hafiza_kaydet; mark the replaced record with yerine_gecen.",
      ),
    );
    let toplam = 0;
    const karakterSiniri = 7000;
    for (const tur of HAFIZA_TURLERI) {
      const kayitlar = this.depo.hafizaKayitlari(ajan.projeId, { tur, sinir: BAGLAM_SINIRI[tur] });
      if (!kayitlar.length) continue;
      satirlar.push("", `### ${baglamBasligi(tur)}`);
      for (const k of kayitlar) {
        const satir = `- ${k.baslik}: ${kisalt(k.metin.replace(/\s+/g, " "), 220)} (${k.kaynakAd}, kimlik ${k.id.slice(0, 8)})`;
        toplam += satir.length;
        if (toplam > karakterSiniri) break;
        satirlar.push(satir);
        gosterilen?.push(k.id);
      }
      if (toplam > karakterSiniri) break;
    }
    if (satirlar.length === 2) satirlar.push("", iki("Henüz kayıt yok. İlk kararları ve kurulun tercihlerini sen kaydet.", "No records yet. Save the first decisions and the board's preferences yourself."));
    const defter = this.defter(ajan);
    satirlar.push("", iki("## Defterin", "## Your journal"), defter ? kisalt(defter, 2500) : iki("Boş. İlk turunun sonunda defter_yaz ile açık işlerini ve sözlerini yaz.", "Empty. At the end of your first turn write your open work and promises with defter_yaz."));
    if (bekleyenSorular.length) {
      satirlar.push("", iki("## Sana sorulan, yanıt bekleyen sorular", "## Questions waiting for your answer"));
      for (const s of bekleyenSorular.slice(0, 8)) satirlar.push(`- (${iki("soru", "question")} ${s.id}) ${s.soranAd}: ${kisalt(s.soru, 300)}`);
      satirlar.push(iki("Bunları soruyu_yanitla ile yanıtla.", "Answer them with soruyu_yanitla."));
    }
    return satirlar.join("\n");
  }

  /** Bir iş metniyle ilgili en fazla birkaç kayıt; görev verilirken mesaja eklenir */
  ilgili(projeId: string, metin: string, sinir = 5, haric?: Set<string>): string {
    const kayitlar = this.ara(projeId, metin, undefined, sinir + (haric?.size ?? 0))
      .filter((k) => !haric?.has(k.id))
      .slice(0, sinir);
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

  /** Gecikmeli yansıma bekliyorsa hemen yazar (commit öncesi) */
  bekleyeniYansit(projeId: string): void {
    const z = this.yansitmaZamanlayicilari.get(projeId);
    if (!z) return;
    clearTimeout(z);
    this.yansitmaZamanlayicilari.delete(projeId);
    try {
      this.yansit(projeId);
    } catch {
      // Repo yazılamıyorsa veritabanı yeterli
    }
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
      md.push("", `## ${baglamBasligi(tur).replace(/ \(.*\)$/, "")}`, "");
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
