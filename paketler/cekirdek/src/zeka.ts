// Ajan zekâsı (Hermes benzeri): her çalışanın kendine ait, kalıcı zekâsı.
// - Kişisel hafıza: sınırlı (2200 karakter) maddeler; oturum başında donmuş anlık görüntü olarak talimata girer,
//   oturum ortasındaki değişiklik bir sonraki oturumda görünür (önbellek bozulmaz, ajan dağılmaz)
// - Sözler: verilen söz tutulana kadar her turda verene, söz verilene de hatırlatılır
// - Beceriler: ekipçe öğrenilen yöntemler (.arnorg/beceriler); talimatta dizin, gerekince tam metin
// - Geçmişte arama: ajan konuşmaları, araç çağrıları ve kanal mesajları
// - Hafıza aktarımı: devirde ya da işten çıkarmada bilgi kaybolmaz
// - Ekip bağları ve haberler: kim kimi bekliyor, kim neye söz verdi; ekipten gelen haberler sonraki turda verilir
import fs from "node:fs";
import path from "node:path";
import type { Ajan, AjanZekasi, AkisOgesi, Beceri, BeceriIcerigi, Gorev, Proje, Soz } from "@arnorg/ortak";
import YAML from "yaml";
import type { Depo } from "./depo.js";
import { iki } from "./dil.js";
import type { OlayYolu } from "./olaylar.js";
import { arnorgYolu } from "./proje-dosyalari.js";
import { rolAdiDilde } from "./roller.js";
import { anlamliSozcukler, aramaMetni, ArnorgHatasi, ayrilma, ilgi, jsonOku, kisalt, sadelestir, simdi, yonelme } from "./yardimci.js";

export const KISISEL_SINIR = 2200;
const MADDE_SINIRI = 600;
const HABER_SINIRI = 12;

function kisiselYolu(proje: Proje, ajanAd: string): string {
  return arnorgYolu(proje.yol, "hafiza", "ajanlar", `${sadelestir(ajanAd)}.kisisel.md`);
}

function beceriDizini(proje: Proje): string {
  return arnorgYolu(proje.yol, "beceriler");
}

/** Beceri dosyası: YAML ön bilgi (ad, açıklama, yazan, güncelleme) ve Markdown gövde */
function beceriAyristir(metin: string, dosyaAdi: string): BeceriIcerigi | null {
  const m = metin.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const on = (YAML.parse(m[1]!) ?? {}) as Partial<Beceri>;
  return {
    ad: String(on.ad ?? dosyaAdi.replace(/\.md$/, "")),
    aciklama: String(on.aciklama ?? ""),
    yazan: String(on.yazan ?? "ArnOrg"),
    guncelleme: String(on.guncelleme ?? ""),
    kullanim: 0,
    icerik: m[2]!.trim(),
  };
}

export class AjanZekasiYoneticisi {
  /** Ajan kimliği → sonraki turda verilecek haberler (ekipten, bağlardan) */
  private haberler = new Map<string, string[]>();

  constructor(
    private readonly depo: Depo,
    private readonly olaylar: OlayYolu,
    private readonly proje: (id: string) => Proje,
    /** .arnorg değişince (gecikmeli commit) */
    private readonly degisti: (projeId: string) => void,
  ) {}

  // ---------------------------------------------------------------------------
  // Kişisel hafıza
  // ---------------------------------------------------------------------------

  kisisel(ajan: Ajan): string[] {
    return jsonOku<string[]>(this.depo.deger(`kisisel:${ajan.id}`), []);
  }

  /**
   * Kişisel hafızayı değiştirir. ekle: yeni madde; degistir: "eski" parçasını içeren maddeyi metinle değiştirir;
   * sil: "eski" parçasını içeren maddeyi siler. Sınır aşılırsa ajandan maddeleri birleştirmesi istenir.
   */
  kisiselYaz(ajan: Ajan, islem: "ekle" | "degistir" | "sil", metin?: string, eski?: string): { maddeler: string[]; kullanim: number } {
    const maddeler = this.kisisel(ajan);
    const temiz = metin?.replace(/\s+/g, " ").trim() ?? "";
    const bul = () => {
      const parca = aramaMetni(eski?.trim() ?? "");
      if (!parca) throw new ArnorgHatasi(iki("Hangi maddeyi kastettiğini 'eski' alanında bir parçasıyla yaz.", "Identify the entry with a fragment of it in 'eski'."));
      const eslesen = maddeler.map((m, i) => ({ m, i })).filter((x) => aramaMetni(x.m).includes(parca));
      if (!eslesen.length) throw new ArnorgHatasi(iki("Bu parçayı içeren madde yok.", "No entry contains that fragment."));
      if (eslesen.length > 1) throw new ArnorgHatasi(iki("Bu parça birden çok maddede geçiyor; daha uzun bir parça ver.", "That fragment matches several entries; give a longer one."));
      return eslesen[0]!.i;
    };
    if (islem === "ekle") {
      if (!temiz) throw new ArnorgHatasi(iki("Madde boş olamaz.", "The entry cannot be empty."));
      if (temiz.length > MADDE_SINIRI) throw new ArnorgHatasi(iki(`Bir madde en çok ${MADDE_SINIRI} karakter olabilir.`, `An entry can be at most ${MADDE_SINIRI} characters.`));
      if (maddeler.some((m) => aramaMetni(m) === aramaMetni(temiz))) return { maddeler, kullanim: maddeler.join("\n").length };
      maddeler.push(temiz);
    } else if (islem === "degistir") {
      if (!temiz) throw new ArnorgHatasi(iki("Yeni metin boş olamaz.", "The new text cannot be empty."));
      maddeler[bul()] = temiz.slice(0, MADDE_SINIRI);
    } else {
      maddeler.splice(bul(), 1);
    }
    const kullanim = maddeler.join("\n").length;
    if (kullanim > KISISEL_SINIR) {
      throw new ArnorgHatasi(
        iki(
          `Kişisel hafıza sınırı ${KISISEL_SINIR} karakter (şu an ${kullanim} olurdu). Önce benzer maddeleri degistir ile birleştir ya da eskiyenleri sil.`,
          `Personal memory is limited to ${KISISEL_SINIR} characters (this would make ${kullanim}). Merge similar entries with degistir or remove stale ones first.`,
        ),
      );
    }
    this.kisiselKaydet(ajan, maddeler);
    return { maddeler, kullanim };
  }

  private kisiselKaydet(ajan: Ajan, maddeler: string[]): void {
    this.depo.degerYaz(`kisisel:${ajan.id}`, JSON.stringify(maddeler));
    try {
      const dosya = kisiselYolu(this.proje(ajan.projeId), ajan.ad);
      fs.mkdirSync(path.dirname(dosya), { recursive: true });
      fs.writeFileSync(dosya, `# ${ajan.ad} · ${iki("kişisel hafıza", "personal memory")}\n\n${maddeler.map((m) => `- ${m}`).join("\n")}\n`, "utf8");
      this.degisti(ajan.projeId);
    } catch {
      // Repo yazılamıyorsa veritabanı yeterli
    }
  }

  /** Var olan repo bağlanınca kişisel hafızalar dosyadan geri yüklenir */
  iceAktar(proje: Proje, ajanlar: Ajan[]): void {
    for (const a of ajanlar) {
      if (this.kisisel(a).length) continue;
      try {
        const metin = fs.readFileSync(kisiselYolu(proje, a.ad), "utf8");
        const maddeler = metin
          .split("\n")
          .filter((s) => s.startsWith("- "))
          .map((s) => s.slice(2).trim())
          .filter(Boolean);
        if (maddeler.length) this.depo.degerYaz(`kisisel:${a.id}`, JSON.stringify(maddeler));
      } catch {
        // dosya yok
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Beceriler
  // ---------------------------------------------------------------------------

  beceriler(proje: Proje): Beceri[] {
    const dizin = beceriDizini(proje);
    let dosyalar: string[] = [];
    try {
      dosyalar = fs.readdirSync(dizin).filter((d) => d.endsWith(".md"));
    } catch {
      return [];
    }
    const kullanim = jsonOku<Record<string, number>>(this.depo.deger(`beceri-kullanim:${proje.id}`), {});
    return dosyalar
      .map((d) => {
        try {
          const b = beceriAyristir(fs.readFileSync(path.join(dizin, d), "utf8"), d);
          return b ? { ad: b.ad, aciklama: b.aciklama, yazan: b.yazan, guncelleme: b.guncelleme, kullanim: kullanim[sadelestir(b.ad)] ?? 0 } : null;
        } catch {
          return null;
        }
      })
      .filter((b): b is Beceri => b !== null)
      .sort((a, b) => b.kullanim - a.kullanim || a.ad.localeCompare(b.ad));
  }

  /** Beceriyi okur; ajan okuyunca kullanım sayılır, kurulun Stüdyo'da açması sayılmaz (kullanimSay: false) */
  beceriOku(proje: Proje, ad: string, secenek: { kullanimSay?: boolean } = {}): BeceriIcerigi {
    const anahtar = sadelestir(ad);
    const dosya = path.join(beceriDizini(proje), `${anahtar}.md`);
    let b: BeceriIcerigi | null = null;
    try {
      b = beceriAyristir(fs.readFileSync(dosya, "utf8"), `${anahtar}.md`);
    } catch {
      b = null;
    }
    if (!b) throw new ArnorgHatasi(iki(`"${ad}" adında beceri yok. Becerileri beceri_listele ile gör.`, `No skill named "${ad}". List skills with beceri_listele.`), 404);
    const kullanim = jsonOku<Record<string, number>>(this.depo.deger(`beceri-kullanim:${proje.id}`), {});
    if (secenek.kullanimSay !== false) {
      kullanim[anahtar] = (kullanim[anahtar] ?? 0) + 1;
      this.depo.degerYaz(`beceri-kullanim:${proje.id}`, JSON.stringify(kullanim));
    }
    return { ...b, kullanim: kullanim[anahtar] ?? 0 };
  }

  /** Beceri yazar ya da günceller; aynı ad aynı dosyadır */
  beceriYaz(proje: Proje, yazan: string, ad: string, aciklama: string, icerik: string): Beceri {
    const temizAd = ad.trim();
    if (!temizAd || temizAd.length > 80) throw new ArnorgHatasi(iki("Beceri adı 1–80 karakter olmalı.", "Skill names must be 1–80 characters."));
    if (!aciklama.trim() || aciklama.length > 300) throw new ArnorgHatasi(iki("Açıklama 1–300 karakter olmalı (ne zaman kullanılır).", "The description must be 1–300 characters (when to use it)."));
    if (!icerik.trim() || icerik.length > 12_000) throw new ArnorgHatasi(iki("İçerik 1–12000 karakter olmalı.", "The content must be 1–12000 characters."));
    const anahtar = sadelestir(temizAd);
    if (!anahtar) throw new ArnorgHatasi(iki("Geçersiz beceri adı.", "Invalid skill name."));
    const dizin = beceriDizini(proje);
    fs.mkdirSync(dizin, { recursive: true });
    const guncelleme = simdi();
    const on = YAML.stringify({ ad: temizAd, aciklama: aciklama.trim(), yazan, guncelleme }).trim();
    fs.writeFileSync(path.join(dizin, `${anahtar}.md`), `---\n${on}\n---\n\n${icerik.trim()}\n`, "utf8");
    this.degisti(proje.id);
    return { ad: temizAd, aciklama: aciklama.trim(), yazan, guncelleme, kullanim: 0 };
  }

  // ---------------------------------------------------------------------------
  // Sözler
  // ---------------------------------------------------------------------------

  sozVer(veren: Ajan, alici: Ajan | null, metin: string, sonTarih: string | null): Soz {
    const temiz = metin.replace(/\s+/g, " ").trim();
    if (temiz.length < 5 || temiz.length > 500) throw new ArnorgHatasi(iki("Söz 5–500 karakter olmalı.", "A promise must be 5–500 characters."));
    if (alici && alici.id === veren.id) throw new ArnorgHatasi(iki("Kendine söz veremezsin; kişisel hafızana not yaz.", "You cannot promise yourself; write a personal note instead."));
    if (sonTarih && Number.isNaN(Date.parse(sonTarih))) throw new ArnorgHatasi(iki("son_tarih geçerli bir tarih olmalı (ör. 2026-10-05T17:00).", "son_tarih must be a valid date (e.g. 2026-10-05T17:00)."));
    const acik = this.depo.sozler(veren.projeId, { verenId: veren.id, durum: "acik" });
    if (acik.length >= 20) throw new ArnorgHatasi(iki("20 açık sözün var; önce tuttuklarını soz_tut ile kapat.", "You have 20 open promises; close the ones you kept with soz_tut first."));
    const soz = this.depo.sozEkle({
      projeId: veren.projeId,
      verenId: veren.id,
      verenAd: veren.ad,
      aliciId: alici?.id ?? null,
      aliciAd: alici?.ad ?? iki("Yönetim kurulu", "The board"),
      metin: temiz,
      sonTarih: sonTarih ? new Date(sonTarih).toISOString() : null,
    });
    this.olaylar.yayinla({ tur: "soz.guncellendi", soz });
    if (alici) this.haberEkle(alici.id, iki(`${veren.ad} sana söz verdi: ${temiz}`, `${veren.ad} promised you: ${temiz}`));
    return soz;
  }

  sozKapat(ajan: Ajan, sozId: string, durum: "tutuldu" | "iptal", not: string | null): Soz {
    const soz = this.depo.soz(sozId);
    if (!soz || soz.projeId !== ajan.projeId) throw new ArnorgHatasi(iki("Söz bulunamadı.", "Promise not found."), 404);
    if (soz.verenId !== ajan.id) throw new ArnorgHatasi(iki(`Bu sözü ${soz.verenAd} verdi; yalnız o kapatabilir.`, `${soz.verenAd} made this promise; only they can close it.`), 403);
    if (soz.durum !== "acik") throw new ArnorgHatasi(iki("Bu söz zaten kapandı.", "This promise is already closed."), 409);
    const son = this.depo.sozKapat(soz.id, durum, not?.trim() || null)!;
    this.olaylar.yayinla({ tur: "soz.guncellendi", soz: son });
    if (soz.aliciId) {
      this.haberEkle(
        soz.aliciId,
        durum === "tutuldu"
          ? iki(`${ajan.ad} sana verdiği sözü tuttu: ${soz.metin}${son.not ? ` (${son.not})` : ""}`, `${ajan.ad} kept a promise to you: ${soz.metin}${son.not ? ` (${son.not})` : ""}`)
          : iki(`${ajan.ad} sana verdiği sözü geri aldı: ${soz.metin}${son.not ? ` (${son.not})` : ""}`, `${ajan.ad} withdrew a promise to you: ${soz.metin}${son.not ? ` (${son.not})` : ""}`),
      );
    }
    return son;
  }

  /** Ayrılan çalışanın açık sözleri devralana geçer */
  sozleriDevret(veren: Ajan, alan: Ajan): number {
    const acik = this.depo.sozler(veren.projeId, { verenId: veren.id, durum: "acik" });
    for (const s of acik) {
      this.depo.sozKapat(s.id, "iptal", iki(`${alan.ad} devraldı`, `taken over by ${alan.ad}`));
      const yeni = this.depo.sozEkle({ projeId: s.projeId, verenId: alan.id, verenAd: alan.ad, aliciId: s.aliciId, aliciAd: s.aliciAd, metin: s.metin, sonTarih: s.sonTarih });
      this.olaylar.yayinla({ tur: "soz.guncellendi", soz: yeni });
    }
    return acik.length;
  }

  // ---------------------------------------------------------------------------
  // Geçmişte arama
  // ---------------------------------------------------------------------------

  /** Geçmiş konuşmalarda arar: ajanın (ya da ekibin) akışı ve kanal mesajları; en yeni önce */
  gecmisteAra(ajan: Ajan, sorgu: string, kapsam: "ben" | "ekip", sinir = 8): string {
    const sozcukler = anlamliSozcukler(sorgu, 8);
    if (!sozcukler.length) throw new ArnorgHatasi(iki("Aranacak anlamlı bir sözcük yok.", "No meaningful word to search for."));
    // SQL'de ön süzme yalnız ASCII sözcükle yapılır (kayıtlar Türkçe harfleriyle durur, LIKE harf katlamaz);
    // ASCII sözcük yoksa son kayıtlar taranır. Sonra en az iki sözcüğün geçtiği kayıtlar tutulur.
    const hamSozcukler = sorgu.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    const anahtar = [...sozcukler].filter((s) => hamSozcukler.includes(s)).sort((a, b) => b.length - a.length)[0] ?? "";
    const enAz = Math.min(2, sozcukler.length);
    const uyar = (m: string) => {
      const t = aramaMetni(m);
      return sozcukler.filter((s) => t.includes(s)).length >= enAz;
    };
    const ajanAdi = new Map(this.depo.ajanlar(ajan.projeId).map((a) => [a.id, a.ad]));
    const sonuclar: { zaman: string; satir: string }[] = [];
    for (const o of this.depo.akisAra(ajan.projeId, kapsam === "ben" ? ajan.id : null, anahtar)) {
      const govde = akisMetni(o);
      if (!govde || !uyar(govde)) continue;
      sonuclar.push({ zaman: o.zaman, satir: `${o.zaman.slice(0, 16).replace("T", " ")} · ${ajanAdi.get(o.ajanId) ?? "?"} · ${o.tur}${o.arac ? ` ${o.arac}` : ""}: ${kisalt(govde.replace(/\s+/g, " "), 280)}` });
      if (sonuclar.length >= sinir * 2) break;
    }
    for (const m of this.depo.mesajAra(ajan.projeId, anahtar)) {
      if (!uyar(m.metin)) continue;
      if (kapsam === "ben" && m.gonderenId !== ajan.id && !m.anilanlar.includes(ajan.id)) continue;
      sonuclar.push({ zaman: m.zaman, satir: `${m.zaman.slice(0, 16).replace("T", " ")} · #${m.kanal} · ${m.gonderenAd}: ${kisalt(m.metin.replace(/\s+/g, " "), 280)}` });
    }
    const secilen = sonuclar.sort((a, b) => b.zaman.localeCompare(a.zaman)).slice(0, sinir);
    if (!secilen.length) return iki(`"${sorgu}" için geçmişte bir şey bulunamadı.`, `Nothing found in the past for "${sorgu}".`);
    return [iki(`Geçmişte "${sorgu}" (en yeni önce):`, `Past results for "${sorgu}" (newest first):`), ...secilen.map((s) => `- ${s.satir}`)].join("\n");
  }

  // ---------------------------------------------------------------------------
  // Hafıza aktarımı
  // ---------------------------------------------------------------------------

  /**
   * Bir çalışanın bildiklerini ötekine aktarır: kişisel hafızası ve defteri alanın defterine "devir" bölümü olarak,
   * özeti alanın kişisel hafızasına (sığdığı kadar) yazılır. İstenirse açık sözleri de devredilir.
   */
  aktar(veren: Ajan, alan: Ajan, secenek: { sozler?: boolean; not?: string; defter: string; defterYaz: (a: Ajan, icerik: string) => void }): string {
    if (veren.id === alan.id) throw new ArnorgHatasi(iki("Kendine aktarım yapamazsın.", "You cannot transfer to yourself."));
    if (veren.projeId !== alan.projeId) throw new ArnorgHatasi(iki("Aktarım yalnız aynı projede yapılır.", "Transfers only work within the same project."));
    const kisisel = this.kisisel(veren);
    const parcalar = [
      iki(`## Devir: ${veren.ad} (${rolAdiDilde(veren)}) → ${alan.ad}, ${simdi().slice(0, 10)}`, `## Handover: ${veren.ad} (${rolAdiDilde(veren)}) → ${alan.ad}, ${simdi().slice(0, 10)}`),
      secenek.not?.trim() ? `${iki("Not", "Note")}: ${secenek.not.trim()}` : "",
      kisisel.length ? `${iki(`${ilgi(veren.ad)} kişisel hafızası`, `${veren.ad}'s personal memory`)}:\n${kisisel.map((m) => `- ${m}`).join("\n")}` : "",
      secenek.defter.trim() ? `${iki(`${ilgi(veren.ad)} defteri`, `${veren.ad}'s journal`)}:\n${kisalt(secenek.defter.trim(), 2500)}` : "",
    ].filter(Boolean);
    const mevcutDefter = this.depo.defter(alan.id)?.icerik ?? "";
    const yeniDefter = `${mevcutDefter ? `${mevcutDefter}\n\n` : ""}${parcalar.join("\n\n")}`;
    // Defter sınırı 6000: eskisi kırpılır, devir bölümü korunur
    secenek.defterYaz(alan, yeniDefter.length > 6000 ? yeniDefter.slice(-6000) : yeniDefter);
    const onEk = iki(`${ayrilma(veren.ad)} devir aldım (${simdi().slice(0, 10)})`, `I took over from ${veren.ad} (${simdi().slice(0, 10)})`);
    const ozet = iki(
      `${onEk}: defterimde "Devir" bölümüne bak.${secenek.not?.trim() ? ` ${kisalt(secenek.not.trim(), 160)}` : ""}`,
      `${onEk}: see the "Handover" section in my journal.${secenek.not?.trim() ? ` ${kisalt(secenek.not.trim(), 160)}` : ""}`,
    );
    try {
      // Aynı kişiden aynı gün ikinci devir (ör. aktarımın ardından işten çıkarma) yeni madde açmaz, eskisini günceller
      const varMi = this.kisisel(alan).some((m) => aramaMetni(m).startsWith(aramaMetni(onEk)));
      if (varMi) this.kisiselYaz(alan, "degistir", ozet, onEk);
      else this.kisiselYaz(alan, "ekle", ozet);
    } catch {
      // Kişisel hafıza doluysa defterdeki devir bölümü yeterli
    }
    const devredilen = secenek.sozler ? this.sozleriDevret(veren, alan) : 0;
    this.haberEkle(alan.id, iki(`${veren.ad} sana hafızasını aktardı; defterindeki "Devir" bölümünü oku.`, `${veren.ad} transferred their memory to you; read the "Handover" section in your journal.`));
    return iki(
      `${yonelme(alan.ad)} aktarıldı: ${kisisel.length} kişisel madde, defter${devredilen ? `, ${devredilen} açık söz` : ""}.`,
      `Transferred to ${alan.ad}: ${kisisel.length} personal entries, journal${devredilen ? `, ${devredilen} open promises` : ""}.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Ekip bağları ve haberler
  // ---------------------------------------------------------------------------

  haberEkle(ajanId: string, metin: string): void {
    const liste = this.haberler.get(ajanId) ?? [];
    liste.push(metin);
    this.haberler.set(ajanId, liste.slice(-HABER_SINIRI));
  }

  /** Sonraki turda verilecek haberleri alır ve kuyruğu boşaltır */
  haberleriAl(ajanId: string): string[] {
    const l = this.haberler.get(ajanId) ?? [];
    this.haberler.delete(ajanId);
    return l;
  }

  /** Kim kime bağlı: yönetici, ekip, görev bağımlılıkları, son sorular, sözler */
  baglar(ajan: Ajan): string {
    const ekip = this.depo.ajanlar(ajan.projeId);
    const ad = (id: string | null) => (id ? (ekip.find((a) => a.id === id)?.ad ?? "?") : "?");
    const satirlar: string[] = [];
    const yonetici = ajan.yoneticiId ? ekip.find((a) => a.id === ajan.yoneticiId) : null;
    satirlar.push(`- ${iki("Yöneticin", "Your manager")}: ${yonetici ? `${yonetici.ad} (${rolAdiDilde(yonetici)})` : iki("Yönetim kurulu", "the board")}`);
    const bagli = ekip.filter((a) => a.yoneticiId === ajan.id);
    if (bagli.length) satirlar.push(`- ${iki("Sana bağlı", "Reporting to you")}: ${bagli.map((a) => `${a.ad} (${rolAdiDilde(a)})`).join(", ")}`);
    const gorevler = this.depo.gorevler(ajan.projeId);
    const benim = gorevler.filter((g) => g.atananId === ajan.id && g.durum !== "tamam" && g.durum !== "iptal");
    for (const g of benim) {
      const bekledigim = g.bagimliliklar.map((id) => gorevler.find((x) => x.id === id)).filter((x): x is Gorev => Boolean(x) && x!.durum !== "tamam");
      if (bekledigim.length) satirlar.push(`- ${g.kod} ${iki("için beklediğin", "is waiting on")}: ${bekledigim.map((x) => `${x.kod} (${ad(x.atananId)}, ${x.durum})`).join(", ")}`);
      const bekleyenler = gorevler.filter((x) => x.bagimliliklar.includes(g.id) && x.durum !== "tamam" && x.durum !== "iptal");
      if (bekleyenler.length) satirlar.push(`- ${iki(`${g.kod} işini bekleyenler`, `Waiting on your ${g.kod}`)}: ${bekleyenler.map((x) => `${x.kod} (${ad(x.atananId)})`).join(", ")}`);
    }
    const yediGun = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const sorular = this.depo.sorular(ajan.projeId, { sinir: 60 }).filter((s) => s.olusturma >= yediGun && (s.soranId === ajan.id || s.soruluId === ajan.id));
    const kisiler = new Map<string, number>();
    for (const s of sorular) {
      const diger = s.soranId === ajan.id ? s.soruluAd : s.soranAd;
      kisiler.set(diger, (kisiler.get(diger) ?? 0) + 1);
    }
    if (kisiler.size) satirlar.push(`- ${iki("Son haftada soru alışverişi yaptıkların", "People you exchanged questions with this week")}: ${[...kisiler.entries()].map(([k, n]) => `${k} (${n})`).join(", ")}`);
    const verdigim = this.depo.sozler(ajan.projeId, { verenId: ajan.id, durum: "acik", sinir: 10 });
    if (verdigim.length) satirlar.push(`- ${iki("Açık sözlerin", "Your open promises")}: ${verdigim.map((s) => `[${s.id.slice(0, 8)}] ${s.aliciAd}: ${kisalt(s.metin, 90)}${s.sonTarih ? ` (${s.sonTarih.slice(0, 16).replace("T", " ")})` : ""}`).join("; ")}`);
    const aldigim = this.depo.sozler(ajan.projeId, { aliciId: ajan.id, durum: "acik", sinir: 10 });
    if (aldigim.length) satirlar.push(`- ${iki("Sana verilen sözler", "Promises made to you")}: ${aldigim.map((s) => `${s.verenAd}: ${kisalt(s.metin, 90)}`).join("; ")}`);
    return satirlar.join("\n");
  }

  /** Stüdyo için ajanın zekâ özeti */
  ozet(ajan: Ajan, defter: string): AjanZekasi {
    const kisisel = this.kisisel(ajan);
    return {
      kisisel,
      kisiselSinir: KISISEL_SINIR,
      kisiselKullanim: kisisel.join("\n").length,
      defter,
      sozler: this.depo.sozler(ajan.projeId, { verenId: ajan.id, sinir: 50 }),
      alinanSozler: this.depo.sozler(ajan.projeId, { aliciId: ajan.id, durum: "acik", sinir: 50 }),
      beceriler: this.beceriler(this.proje(ajan.projeId)),
      baglar: this.baglar(ajan),
    };
  }
}

/** Akış öğesinin aranabilir metni */
function akisMetni(o: AkisOgesi): string {
  const girdi = o.girdi && typeof o.girdi === "object" ? Object.values(o.girdi as Record<string, unknown>).filter((v) => typeof v === "string").join(" ") : "";
  return [o.metin ?? "", girdi].join(" ").trim();
}
