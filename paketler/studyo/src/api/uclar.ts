// docs/API.md'deki her uç nokta için tipli işlevler
import type {
  Ajan,
  AjanBaslatIstegi,
  AjanGuncelleIstegi,
  AjanIseAlIstegi,
  AjanMesajIstegi,
  AjanSorusu,
  AkisOgesi,
  AramaSonucu,
  Ayarlar,
  CalismaAlani,
  DenetimKaydi,
  DosyaDugumu,
  DosyaIcerigi,
  DosyaYazIstegi,
  FarkSonucu,
  Gorev,
  GorevGuncelleIstegi,
  GorevOlusturIstegi,
  HafizaKaydi,
  HafizaTuru,
  HafizaYazIstegi,
  HesapDurumu,
  IzinModu,
  Kanal,
  MaliyetOzeti,
  Mesaj,
  ModelAdi,
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
import { istek, sorgu } from "./istek";

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

  // Notlar
  notlar: (pid: string) => istek<NotDosyasi[]>(`${proje(pid)}/notlar`),
  not: (pid: string, yol: string) => istek<NotIcerigi>(`${proje(pid)}/not${sorgu({ yol })}`),
  notKaydet: (pid: string, n: NotIcerigi) => istek<NotDosyasi>(`${proje(pid)}/not`, { method: "PUT", govde: n }),

  // Proje hafızası, defterler, ajanlar arası sorular
  hafiza: (pid: string, p: { q?: string; tur?: HafizaTuru; eskiler?: boolean } = {}, sinyal?: AbortSignal) =>
    istek<HafizaKaydi[]>(`${proje(pid)}/hafiza${sorgu({ q: p.q, tur: p.tur, eskiler: p.eskiler ? 1 : undefined })}`, { sinyal }),
  hafizaYaz: (pid: string, i: HafizaYazIstegi) => istek<HafizaKaydi>(`${proje(pid)}/hafiza`, { method: "POST", govde: i }),
  hafizaGuncelle: (hid: string, i: Partial<Pick<HafizaKaydi, "tur" | "baslik" | "metin" | "etiketler" | "onem">>) =>
    istek<HafizaKaydi>(`/api/hafiza/${k(hid)}`, { method: "PATCH", govde: i }),
  hafizaSil: (hid: string) => istek<Tamam>(`/api/hafiza/${k(hid)}`, { method: "DELETE" }),
  sorular: (pid: string, sinir = 300) => istek<AjanSorusu[]>(`${proje(pid)}/sorular${sorgu({ sinir })}`),
  defter: (aid: string) => istek<{ icerik: string; guncelleme: string | null }>(`${ajan(aid)}/defter`),
  defterYaz: (aid: string, icerik: string) => istek<Tamam>(`${ajan(aid)}/defter`, { method: "PUT", govde: { icerik } }),

  // Denetim ve onaylar
  denetim: (pid: string, sinir = 300) => istek<DenetimKaydi[]>(`${proje(pid)}/denetim${sorgu({ sinir })}`),
  politika: (pid: string) => istek<PolitikaKurali[]>(`${proje(pid)}/politika`),
  politikaKaydet: (pid: string, kurallar: PolitikaKurali[]) =>
    istek<PolitikaKurali[]>(`${proje(pid)}/politika`, { method: "PUT", govde: kurallar }),
  onaylar: (pid: string, durum?: OnayDurumu) => istek<Onay[]>(`${proje(pid)}/onaylar${sorgu({ durum })}`),
  onayKarari: (oid: string, i: OnayKararIstegi) => istek<Onay>(`/api/onaylar/${k(oid)}`, { method: "POST", govde: i }),

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

  // Terminal
  terminalAc: (pid: string, i: TerminalAcIstegi) => istek<{ id: string }>(`${proje(pid)}/terminaller`, { method: "POST", govde: i }),
  terminalKapat: (tid: string) => istek<Tamam>(`/api/terminaller/${k(tid)}`, { method: "DELETE" }),

  // Maliyet
  maliyet: (pid: string) => istek<MaliyetOzeti>(`${proje(pid)}/maliyet`),
  rapor: (pid: string, gun = 7) => istek<Rapor>(`${proje(pid)}/rapor${sorgu({ gun })}`),
  raporKaydet: (pid: string, gun = 7) => istek<Rapor>(`${proje(pid)}/rapor${sorgu({ gun })}`, { method: "POST" }),
};
