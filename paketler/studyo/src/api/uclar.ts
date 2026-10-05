// docs/API.md'deki her uç nokta için tipli işlevler
import type {
  Ajan,
  AjanZekasi,
  Anayasa,
  AnayasaMaddesi,
  Beceri,
  BeceriIcerigi,
  DizinListesi,
  EsitlemeSonucu,
  GitKurulumu,
  GithubDali,
  GithubDeposu,
  GithubHesabi,
  GithubKurulumu,
  KaliteOnerisi,
  KlonlaIstegi,
  KuralDurumu,
  KureselKural,
  KurulumDurumu,
  KurulumIslemi,
  ProjeDallari,
  ProjeGuncelleIstegi,
  Soz,
  ZekaDurumu,
  AjanBaslatIstegi,
  AjanGuncelleIstegi,
  AjanIseAlIstegi,
  AjanMesajIstegi,
  AjanSorusu,
  AkisOgesi,
  AramaSonucu,
  Ayarlar,
  BrifingYaniti,
  CalismaAlani,
  DenetimKaydi,
  DosyaDugumu,
  DosyaIcerigi,
  DosyaYazIstegi,
  FarkSonucu,
  Gorev,
  GorevGuncelleIstegi,
  GorevOlusturIstegi,
  HafizaBenzerCifti,
  HafizaKaydi,
  HafizaTuru,
  HafizaYazIstegi,
  HesapDurumu,
  IzinModu,
  KodAramaYaniti,
  KodBagimliliklari,
  KodDizinDurumu,
  KodGrafigi,
  KodHaritaDugumu,
  KodIlgiliDosyalar,
  KodSembolTuru,
  KodSembolu,
  KodZekasiModelBilgisi,
  Kanal,
  KanalGuncelleIstegi,
  KanalOlusturIstegi,
  KonusmaIstegi,
  KullanimOzeti,
  Mesaj,
  ModelAdi,
  ModelKatalogu,
  NotDosyasi,
  NotIcerigi,
  Onay,
  OnayDurumu,
  OnayKararIstegi,
  PolitikaKurali,
  ProjeOlusturIstegi,
  ProjeOzeti,
  Rapor,
  Rol,
  Saglik,
  TerminalAcIstegi,
} from "@arnorg/ortak";
import type { Duzeltme, DuzeltmeDurumu, DuzeltmeEkleIstegi, DuzeltmeGonderimi } from "@arnorg/ortak";
import type { TanitimDurumu, TanitimGuncellemeYaniti } from "@arnorg/ortak";
import { indir, istek, sorgu } from "./istek";

type Tamam = { tamam: true };

const k = encodeURIComponent;
const proje = (pid: string) => `/api/projeler/${k(pid)}`;
const ajan = (aid: string) => `/api/ajanlar/${k(aid)}`;

export const api = {
  // Genel
  saglik: () => istek<Saglik>("/api/saglik"),
  ayarlar: () => istek<Ayarlar>("/api/ayarlar"),
  ayarlariKaydet: (a: Partial<Ayarlar>) => istek<Ayarlar>("/api/ayarlar", { method: "PUT", govde: a }),
  hesap: (tazele = false) => istek<HesapDurumu>(`/api/hesap${tazele ? "?tazele=1" : ""}`),
  roller: () => istek<Rol[]>("/api/roller"),
  /** Claude Code'un sunduğu modeller, sürümlü adlarıyla */
  modeller: () => istek<ModelKatalogu>("/api/modeller"),

  // Projeler
  projeler: () => istek<ProjeOzeti[]>("/api/projeler"),
  projeOlustur: (i: ProjeOlusturIstegi) => istek<ProjeOzeti>("/api/projeler", { method: "POST", govde: i }),
  proje: (pid: string) => istek<ProjeOzeti>(proje(pid)),
  projeCikar: (pid: string) => istek<Tamam>(proje(pid), { method: "DELETE" }),

  // Ekip ve ajan oturumları
  ajanlar: (pid: string) => istek<Ajan[]>(`${proje(pid)}/ajanlar`),
  iseAl: (pid: string, i: AjanIseAlIstegi) => istek<Ajan>(`${proje(pid)}/ajanlar`, { method: "POST", govde: i }),
  ajanGuncelle: (aid: string, i: AjanGuncelleIstegi) => istek<Ajan>(ajan(aid), { method: "PATCH", govde: i }),
  istenCikar: (aid: string) => istek<Tamam>(ajan(aid), { method: "DELETE" }),
  ajanBaslat: (aid: string, i: AjanBaslatIstegi = {}) => istek<Ajan>(`${ajan(aid)}/baslat`, { method: "POST", govde: i }),
  ajanaMesaj: (aid: string, i: AjanMesajIstegi) => istek<Tamam>(`${ajan(aid)}/mesaj`, { method: "POST", govde: i }),
  ajanKes: (aid: string) => istek<Tamam>(`${ajan(aid)}/kes`, { method: "POST" }),
  ajanDurdur: (aid: string) => istek<Ajan>(`${ajan(aid)}/durdur`, { method: "POST" }),
  /** Mesaiyi durdur: projenin oturumları kapanır, sıradaki işler düşer, açılışta kimse uyanmaz */
  mesaiyiDurdur: (pid: string) => istek<Tamam>(`${proje(pid)}/durdur`, { method: "POST" }),
  ajanMod: (aid: string, mod: IzinModu) => istek<Ajan>(`${ajan(aid)}/mod`, { method: "POST", govde: { mod } }),
  ajanModel: (aid: string, model: ModelAdi) => istek<Ajan>(`${ajan(aid)}/model`, { method: "POST", govde: { model } }),
  ajanAkis: (aid: string, sinir = 300) => istek<AkisOgesi[]>(`${ajan(aid)}/akis${sorgu({ sinir })}`),

  // Görevler
  gorevler: (pid: string) => istek<Gorev[]>(`${proje(pid)}/gorevler`),
  gorevOlustur: (pid: string, i: GorevOlusturIstegi) => istek<Gorev>(`${proje(pid)}/gorevler`, { method: "POST", govde: i }),
  gorevGuncelle: (gid: string, i: GorevGuncelleIstegi) =>
    istek<Gorev>(`/api/gorevler/${k(gid)}`, { method: "PATCH", govde: i }),

  // Kanallar
  kanallar: (pid: string) => istek<Kanal[]>(`${proje(pid)}/kanallar`),
  mesajlar: (pid: string, kanal: string, sinir = 200) =>
    istek<Mesaj[]>(`${proje(pid)}/kanallar/${k(kanal)}/mesajlar${sorgu({ sinir })}`),
  mesajGonder: (pid: string, kanal: string, metin: string) =>
    istek<Mesaj>(`${proje(pid)}/kanallar/${k(kanal)}/mesajlar`, { method: "POST", govde: { metin } }),
  /** Kurulun kanalı: kurma, açıklama ve üyeler, silme (mesajlarıyla), serbest konuşmayı başlatma ve durdurma */
  kanalKur: (pid: string, i: KanalOlusturIstegi) => istek<Kanal>(`${proje(pid)}/kanallar`, { method: "POST", govde: i }),
  kanalGuncelle: (pid: string, kanal: string, i: KanalGuncelleIstegi) =>
    istek<Kanal>(`${proje(pid)}/kanallar/${k(kanal)}`, { method: "PATCH", govde: i }),
  kanalSil: (pid: string, kanal: string) => istek<Tamam>(`${proje(pid)}/kanallar/${k(kanal)}`, { method: "DELETE" }),
  konusma: (pid: string, kanal: string, i: KonusmaIstegi) => istek<Kanal>(`${proje(pid)}/kanallar/${k(kanal)}/konusma`, { method: "POST", govde: i }),

  // Notlar
  notlar: (pid: string) => istek<NotDosyasi[]>(`${proje(pid)}/notlar`),
  not: (pid: string, yol: string) => istek<NotIcerigi>(`${proje(pid)}/not${sorgu({ yol })}`),
  notKaydet: (pid: string, n: NotIcerigi) => istek<NotDosyasi>(`${proje(pid)}/not`, { method: "PUT", govde: n }),

  // Tarayıcı: düzeltme notları ("Hepsini yaptır" açık notları tek kurul mesajıyla #yonetim'e yazar)
  duzeltmeler: (pid: string, durum?: DuzeltmeDurumu) => istek<Duzeltme[]>(`${proje(pid)}/duzeltmeler${sorgu({ durum })}`),
  duzeltmeEkle: (pid: string, i: DuzeltmeEkleIstegi) => istek<Duzeltme>(`${proje(pid)}/duzeltmeler`, { method: "POST", govde: i }),
  duzeltmeGuncelle: (id: string, not: string) => istek<Duzeltme>(`/api/duzeltmeler/${k(id)}`, { method: "PATCH", govde: { not } }),
  duzeltmeSil: (id: string) => istek<Tamam>(`/api/duzeltmeler/${k(id)}`, { method: "DELETE" }),
  duzeltmeleriGonder: (pid: string) => istek<DuzeltmeGonderimi>(`${proje(pid)}/duzeltmeler/gonder`, { method: "POST" }),
  /** Öğenin ekran görüntüsü (PNG); anahtar başlıkla gider, görüntü nesne adresiyle gösterilir */
  duzeltmeGorseli: (id: string, sinyal?: AbortSignal) => indir(`/api/duzeltmeler/${k(id)}/gorsel`, sinyal),

  // Proje hafızası, defterler, ajanlar arası sorular
  hafiza: (pid: string, p: { q?: string; tur?: HafizaTuru; eskiler?: boolean } = {}, sinyal?: AbortSignal) =>
    istek<HafizaKaydi[]>(`${proje(pid)}/hafiza${sorgu({ q: p.q, tur: p.tur, eskiler: p.eskiler ? 1 : undefined })}`, { sinyal }),
  hafizaYaz: (pid: string, i: HafizaYazIstegi) => istek<HafizaKaydi>(`${proje(pid)}/hafiza`, { method: "POST", govde: i }),
  hafizaGuncelle: (hid: string, i: Partial<Pick<HafizaKaydi, "tur" | "baslik" | "metin" | "etiketler" | "onem">>) =>
    istek<HafizaKaydi>(`/api/hafiza/${k(hid)}`, { method: "PATCH", govde: i }),
  hafizaSil: (hid: string) => istek<Tamam>(`/api/hafiza/${k(hid)}`, { method: "DELETE" }),
  hafizaBenzerler: (pid: string) => istek<HafizaBenzerCifti[]>(`${proje(pid)}/hafiza/benzerler`),
  hafizaAyriTut: (pid: string, a: string, b: string) => istek<Tamam>(`${proje(pid)}/hafiza/ayri`, { method: "POST", govde: { a, b } }),
  hafizaBirlestir: (tutulan: string, eskiyen: string, metin?: string) =>
    istek<HafizaKaydi>(`/api/hafiza/${k(tutulan)}/birlestir`, { method: "POST", govde: { eskiyen, metin } }),
  sorular: (pid: string, sinir = 300) => istek<AjanSorusu[]>(`${proje(pid)}/sorular${sorgu({ sinir })}`),
  defter: (aid: string) => istek<{ icerik: string; guncelleme: string | null }>(`${ajan(aid)}/defter`),
  defterYaz: (aid: string, icerik: string) => istek<Tamam>(`${ajan(aid)}/defter`, { method: "PUT", govde: { icerik } }),

  // Denetim ve onaylar
  denetim: (pid: string, sinir = 300) => istek<DenetimKaydi[]>(`${proje(pid)}/denetim${sorgu({ sinir })}`),
  /** Denetim kaydı JSONL olarak; süzgeç Denetim ekranınınkiyle aynı (karar, ajan kimliği, arama) */
  denetimDisaAktar: (pid: string, suzgec: { karar?: string; ajan?: string; q?: string }) => indir(`${proje(pid)}/denetim/disa-aktar${sorgu(suzgec)}`),
  politika: (pid: string) => istek<PolitikaKurali[]>(`${proje(pid)}/politika`),
  politikaKaydet: (pid: string, kurallar: PolitikaKurali[]) =>
    istek<PolitikaKurali[]>(`${proje(pid)}/politika`, { method: "PUT", govde: kurallar }),
  onaylar: (pid: string, durum?: OnayDurumu) => istek<Onay[]>(`${proje(pid)}/onaylar${sorgu({ durum })}`),
  onayKarari: (oid: string, i: OnayKararIstegi) => istek<Onay>(`/api/onaylar/${k(oid)}`, { method: "POST", govde: i }),
  // Kalite: 0.0.7'den kalan birleştirmede dalın hedefe göre farkı; komut önerisi. Görev kayıtları: api/ortak.ts
  onayFarki: (oid: string) => istek<FarkSonucu>(`/api/onaylar/${k(oid)}/fark`),
  kaliteOnerisi: (pid: string) => istek<KaliteOnerisi>(`${proje(pid)}/kalite-onerisi`),

  // Kod
  calismaAlanlari: (pid: string) => istek<CalismaAlani[]>(`${proje(pid)}/calisma-alanlari`),
  dosyalar: (pid: string, alan: string) => istek<DosyaDugumu>(`${proje(pid)}/dosyalar${sorgu({ alan })}`),
  dosya: (pid: string, alan: string, yol: string) => istek<DosyaIcerigi>(`${proje(pid)}/dosya${sorgu({ alan, yol })}`),
  dosyaYaz: (pid: string, i: DosyaYazIstegi) => istek<Tamam>(`${proje(pid)}/dosya`, { method: "PUT", govde: i }),
  fark: (pid: string, alan: string, yol?: string) => istek<FarkSonucu>(`${proje(pid)}/fark${sorgu({ alan, yol })}`),
  ara: (pid: string, alan: string, q: string, sinyal?: AbortSignal) =>
    istek<AramaSonucu[]>(`${proje(pid)}/ara${sorgu({ alan, q })}`, { sinyal }),
  disaridaAc: (pid: string, alan: string, yol?: string) =>
    istek<Tamam>(`${proje(pid)}/disarida-ac`, { method: "POST", govde: { alan, yol } }),

  // Kod zekâsı: alan "ana" ya da ajan kimliği
  kodModelleri: () => istek<KodZekasiModelBilgisi[]>("/api/kod-zekasi/modeller"),
  kodDurumlari: (pid: string) => istek<KodDizinDurumu[]>(`${proje(pid)}/kod-zekasi`),
  kodDizinle: (pid: string, alan: string, sifirdan = false) =>
    istek<KodDizinDurumu>(`${proje(pid)}/kod-zekasi/dizinle`, { method: "POST", govde: { alan, sifirdan } }),
  kodAra: (pid: string, alan: string, q: string, p: { sinir?: number; yol?: string } = {}, sinyal?: AbortSignal) =>
    istek<KodAramaYaniti>(`${proje(pid)}/kod-zekasi/ara${sorgu({ alan, q, sinir: p.sinir, yol: p.yol })}`, { sinyal }),
  kodBenzer: (pid: string, alan: string, yol: string, satir: number, sinyal?: AbortSignal) =>
    istek<KodAramaYaniti>(`${proje(pid)}/kod-zekasi/benzer${sorgu({ alan, yol, satir, sinir: 10 })}`, { sinyal }),
  kodSemboller: (pid: string, alan: string, q: string, tur?: KodSembolTuru, sinyal?: AbortSignal) =>
    istek<KodSembolu[]>(`${proje(pid)}/kod-zekasi/semboller${sorgu({ alan, q, tur, sinir: 200 })}`, { sinyal }),
  kodHaritasi: (pid: string, alan: string, yol?: string) => istek<KodHaritaDugumu>(`${proje(pid)}/kod-zekasi/harita${sorgu({ alan, yol })}`),
  kodBagimliliklari: (pid: string, alan: string, yol: string) =>
    istek<KodBagimliliklari>(`${proje(pid)}/kod-zekasi/bagimliliklar${sorgu({ alan, yol })}`),
  kodGrafigi: (pid: string, alan: string, duzey: "klasor" | "dosya") => istek<KodGrafigi>(`${proje(pid)}/kod-zekasi/grafik${sorgu({ alan, duzey })}`),
  kodIlgili: (pid: string, alan: string, yol: string, sinyal?: AbortSignal) => istek<KodIlgiliDosyalar>(`${proje(pid)}/kod-zekasi/ilgili${sorgu({ alan, yol })}`, { sinyal }),

  // Terminal
  terminalAc: (pid: string, i: TerminalAcIstegi) => istek<{ id: string }>(`${proje(pid)}/terminaller`, { method: "POST", govde: i }),
  terminalKapat: (tid: string) => istek<Tamam>(`/api/terminaller/${k(tid)}`, { method: "DELETE" }),

  // Kurulum: Claude Code, git, GitHub CLI; uzun işlemler "kurulum.islem" olayıyla akar
  kurulum: (tazele = false) => istek<KurulumDurumu>(`/api/kurulum${tazele ? "?tazele=1" : ""}`),
  kurulumIslemleri: () => istek<KurulumIslemi[]>("/api/kurulum/islemler"),
  kurulumIslemi: (id: string) => istek<KurulumIslemi>(`/api/kurulum/islemler/${k(id)}`),
  kurulumGirdi: (id: string, metin: string) => istek<KurulumIslemi>(`/api/kurulum/islemler/${k(id)}/girdi`, { method: "POST", govde: { metin } }),
  kurulumIptal: (id: string) => istek<KurulumIslemi>(`/api/kurulum/islemler/${k(id)}`, { method: "DELETE" }),
  claudeGiris: () => istek<KurulumIslemi>("/api/kurulum/claude/giris", { method: "POST" }),
  claudeKur: () => istek<KurulumIslemi>("/api/kurulum/claude/kur", { method: "POST" }),
  ghKur: () => istek<KurulumIslemi>("/api/kurulum/gh/kur", { method: "POST" }),
  ghGiris: () => istek<KurulumIslemi>("/api/kurulum/gh/giris", { method: "POST" }),
  gitYardimcisi: () => istek<GithubKurulumu>("/api/kurulum/gh/git-yardimcisi", { method: "POST" }),
  gitKur: () => istek<KurulumIslemi>("/api/kurulum/git/kur", { method: "POST" }),
  gitKimligi: (ad: string, eposta: string) => istek<GitKurulumu>("/api/kurulum/git/kimlik", { method: "PUT", govde: { ad, eposta } }),

  // GitHub
  githubHesabi: () => istek<GithubHesabi>("/api/github/hesap"),
  githubDepolari: (q?: string, sinyal?: AbortSignal) => istek<GithubDeposu[]>(`/api/github/depolar${sorgu({ q })}`, { sinyal }),
  githubDallari: (depo: string) => istek<GithubDali[]>(`/api/github/dallar${sorgu({ depo })}`),
  klonla: (i: KlonlaIstegi) => istek<KurulumIslemi>("/api/github/klonla", { method: "POST", govde: i }),

  // Dizin gezgini (tarayıcıdan klasör seçimi; masaüstünde sistemin seçicisi kullanılır)
  dizinler: (yol?: string) => istek<DizinListesi>(`/api/dizinler${sorgu({ yol })}`),
  dizinOlustur: (ust: string, ad: string) => istek<{ yol: string }>("/api/dizinler", { method: "POST", govde: { ust, ad } }),

  // Proje ayarları, dallar, uzak depo, hazırlık
  projeGuncelle: (pid: string, i: ProjeGuncelleIstegi) => istek<ProjeOzeti>(proje(pid), { method: "PATCH", govde: i }),
  projeDallari: (pid: string) => istek<ProjeDallari>(`${proje(pid)}/dallar`),
  esitle: (pid: string, gonder = false) => istek<EsitlemeSonucu>(`${proje(pid)}/esitle`, { method: "POST", govde: { gonder } }),
  githubDeposuAc: (pid: string, i: { ozel: boolean; sahip?: string }) => istek<ProjeOzeti>(`${proje(pid)}/github`, { method: "POST", govde: i }),
  hazirlik: (pid: string, islem: "baslat" | "atla") => istek<ProjeOzeti>(`${proje(pid)}/hazirlik`, { method: "POST", govde: { islem } }),
  /** CEO'dan brifing: CEO #yonetim'e kısa durum özeti yazar; önceki istek hazırlanıyorsa "hazirlaniyor" */
  brifingIste: (pid: string) => istek<BrifingYaniti>(`${proje(pid)}/brifing`, { method: "POST" }),

  // Tanıtım: kök README.md (yayındaki ve uzmanın taslağı), güncelleme isteği; README'nin göreli görselleri dosya ucundan
  tanitim: (pid: string, sinyal?: AbortSignal) => istek<TanitimDurumu>(`${proje(pid)}/tanitim`, { sinyal }),
  tanitimGuncelle: (pid: string, not?: string) => istek<TanitimGuncellemeYaniti>(`${proje(pid)}/tanitim/guncelle`, { method: "POST", govde: { not } }),
  /** Alandaki bir dosyanın ham baytları (anahtar başlıkla gider; görüntü nesne adresiyle gösterilir) */
  tanitimGorseli: (pid: string, alan: string, yol: string, sinyal?: AbortSignal) => indir(`${proje(pid)}/fs/icerik${sorgu({ alan, yol })}`, sinyal),

  // Ana yasa
  anayasa: (pid: string) => istek<Anayasa>(`${proje(pid)}/anayasa`),
  anayasaKaydet: (pid: string, maddeler: Omit<AnayasaMaddesi, "no">[]) => istek<Anayasa>(`${proje(pid)}/anayasa`, { method: "PUT", govde: { maddeler } }),

  // Ajan zekâsı: kişisel hafıza, sözler, beceriler
  ajanZekasi: (aid: string) => istek<AjanZekasi>(`${ajan(aid)}/zeka`),
  hafizaAktar: (aid: string, kime: string, p: { sozler?: boolean; not?: string } = {}) =>
    istek<{ mesaj: string }>(`${ajan(aid)}/aktar`, { method: "POST", govde: { kime, ...p } }),
  istenCikarDevrederek: (aid: string, devralan?: string) => istek<Tamam>(`${ajan(aid)}${sorgu({ devralan })}`, { method: "DELETE" }),
  sozler: (pid: string, durum?: "acik" | "tutuldu" | "iptal") => istek<Soz[]>(`${proje(pid)}/sozler${sorgu({ durum })}`),
  beceriler: (pid: string) => istek<Beceri[]>(`${proje(pid)}/beceriler`),
  beceri: (pid: string, ad: string) => istek<BeceriIcerigi>(`${proje(pid)}/beceriler/${k(ad)}`),

  // Global zekâ
  zeka: () => istek<ZekaDurumu>("/api/zeka"),
  zekaKuralEkle: (metin: string, kapsam: string[] = []) => istek<KureselKural>("/api/zeka/kurallar", { method: "POST", govde: { metin, kapsam } }),
  zekaKuralGuncelle: (id: string, i: { metin?: string; kapsam?: string[]; durum?: KuralDurumu }) =>
    istek<KureselKural>(`/api/zeka/kurallar/${k(id)}`, { method: "PATCH", govde: i }),
  zekaGeriBildirim: (id: string, sonuc: "ise_yaradi" | "yanlis" | "ihlal", not?: string) =>
    istek<KureselKural>(`/api/zeka/kurallar/${k(id)}/geri-bildirim`, { method: "POST", govde: { sonuc, not } }),
  zekaKuralSil: (id: string) => istek<Tamam>(`/api/zeka/kurallar/${k(id)}`, { method: "DELETE" }),

  // Kullanım ve rapor
  kullanim: (pid: string) => istek<KullanimOzeti>(`${proje(pid)}/kullanim`),
  rapor: (pid: string, gun = 7) => istek<Rapor>(`${proje(pid)}/rapor${sorgu({ gun })}`),
  raporKaydet: (pid: string, gun = 7) => istek<Rapor>(`${proje(pid)}/rapor${sorgu({ gun })}`, { method: "POST" }),
};
