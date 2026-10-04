// Arayüz durumu: etkin ekran, seçimler, canlı akış rayı, bildirimler
import { create } from "zustand";
import { hataMetni } from "../api/istek";
import { kanalEkrani } from "../yardimcilar/kanallar";

export type Gorunum =
  | "projeler"
  | "karargah"
  | "ofis"
  | "ekip"
  | "ajan"
  | "pano"
  | "kanallar"
  | "notlar"
  | "hafiza"
  | "kod"
  | "kod-zekasi"
  | "denetim"
  | "onaylar"
  | "zeka"
  | "ayarlar";

/** Proje açık olmadan da gösterilebilen ekranlar */
export const PROJESIZ_GORUNUMLER: Gorunum[] = ["projeler", "ayarlar"];

export type BildirimSeviyesi = "bilgi" | "uyari" | "hata" | "basari";

export interface Bildirim {
  id: number;
  seviye: BildirimSeviyesi;
  metin: string;
}

interface ArayuzDurumu {
  gorunum: Gorunum;
  /** Ajan oturumu ekranında ve Ekip'te seçili ajan */
  ajanId: string | null;
  /** Pano çekmecesinde açık görev */
  gorevId: string | null;
  kanal: string;
  notYolu: string | null;
  rayAcik: boolean;
  bildirimler: Bildirim[];
  /** Üst çubuktan "Yeni proje" istenince artar; Projeler ekranı formu açar */
  yeniProjeIstegi: number;
}

const DEPO = { gorunum: "arnorg.gorunum", ray: "arnorg.ray" };

function oku(anahtar: string): string | null {
  try {
    return localStorage.getItem(anahtar);
  } catch {
    return null;
  }
}

function yaz(anahtar: string, deger: string) {
  try {
    localStorage.setItem(anahtar, deger);
  } catch {
    // Depolama kapalı: tercih yalnız bu oturumda kalır
  }
}

const GECERLI: Gorunum[] = ["projeler", "karargah", "ofis", "ekip", "ajan", "pano", "kanallar", "notlar", "hafiza", "kod", "kod-zekasi", "denetim", "onaylar", "zeka", "ayarlar"];
const kayitli = oku(DEPO.gorunum) as Gorunum | null;

export const useArayuz = create<ArayuzDurumu>()(() => ({
  // Ajan oturumu kimlik ister; yeniden açılışta Ekip'e döner
  gorunum: kayitli && GECERLI.includes(kayitli) ? (kayitli === "ajan" ? "ekip" : kayitli) : "karargah",
  ajanId: null,
  gorevId: null,
  kanal: "genel",
  notYolu: null,
  rayAcik: oku(DEPO.ray) !== "0",
  bildirimler: [],
  yeniProjeIstegi: 0,
}));

export interface GitParametreleri {
  ajanId?: string | null;
  gorevId?: string | null;
  kanal?: string;
  notYolu?: string | null;
}

export function git(gorunum: Gorunum, p: GitParametreleri = {}) {
  // CEO ile bire bir sohbet Kanallar'da değil Karargâh'ta (yardimcilar/kanallar.ts)
  if (gorunum === "kanallar" && kanalEkrani(p.kanal) === "karargah") {
    gorunum = "karargah";
    p = { ...p, kanal: undefined };
  }
  useArayuz.setState((d) => ({
    gorunum,
    ajanId: p.ajanId !== undefined ? p.ajanId : d.ajanId,
    gorevId: p.gorevId !== undefined ? p.gorevId : gorunum === "pano" ? d.gorevId : null,
    kanal: p.kanal ?? d.kanal,
    notYolu: p.notYolu !== undefined ? p.notYolu : d.notYolu,
  }));
  yaz(DEPO.gorunum, gorunum);
}

export function ajanaGit(ajanId: string) {
  git("ajan", { ajanId });
}

export function rayiDegistir(acik?: boolean) {
  const yeni = acik ?? !useArayuz.getState().rayAcik;
  useArayuz.setState({ rayAcik: yeni });
  yaz(DEPO.ray, yeni ? "1" : "0");
}

let sonBildirim = 0;
const SURELER: Record<BildirimSeviyesi, number> = { bilgi: 4500, basari: 3500, uyari: 7000, hata: 8000 };

export function bildir(seviye: BildirimSeviyesi, metin: string) {
  const id = ++sonBildirim;
  useArayuz.setState((d) => {
    // Aynı metin üst üste gelirse yinelenmesin
    const liste = d.bildirimler.filter((b) => b.metin !== metin);
    return { bildirimler: [...liste, { id, seviye, metin }].slice(-5) };
  });
  setTimeout(() => bildirimKapat(id), SURELER[seviye]);
}

export function hataBildir(hata: unknown) {
  if (hata instanceof DOMException && hata.name === "AbortError") return;
  bildir("hata", hataMetni(hata));
}

export function bildirimKapat(id: number) {
  useArayuz.setState((d) => ({ bildirimler: d.bildirimler.filter((b) => b.id !== id) }));
}

export function yeniProjeIste() {
  useArayuz.setState((d) => ({ yeniProjeIstegi: d.yeniProjeIstegi + 1 }));
  git("projeler");
}
