// Görev durum geçişleri ve bağımlılık yardımcıları
import { GOREV_GECISLERI, type Gorev, type GorevDurumu } from "@arnorg/ortak";
import { api } from "../../api/uclar";
import { sozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { gorevUygula } from "../../durum/veri";

/** Panodaki doğal ilerleme sırası */
const ILERI: Partial<Record<GorevDurumu, GorevDurumu>> = {
  bekleyen: "planlandi",
  planlandi: "calisiliyor",
  calisiliyor: "inceleme",
  inceleme: "tamam",
};

export function sonrakiDurum(d: GorevDurumu): GorevDurumu | null {
  const s = ILERI[d];
  return s && GOREV_GECISLERI[d].includes(s) ? s : null;
}

export function gecisVarMi(den: GorevDurumu, ye: GorevDurumu): boolean {
  return GOREV_GECISLERI[den].includes(ye);
}

/** Bitmemiş bağımlılıklar */
export function acikBagimliliklar(g: Gorev, tumu: Gorev[]): Gorev[] {
  return g.bagimliliklar
    .map((id) => tumu.find((x) => x.id === id))
    .filter((x): x is Gorev => !!x && x.durum !== "tamam" && x.durum !== "iptal");
}

/** Durum değiştirir; 409 gibi hatalarda sunucunun açıklaması fırlatılır */
export async function durumDegistir(g: Gorev, durum: GorevDurumu): Promise<Gorev> {
  const yeni = await api.gorevGuncelle(g.id, { durum });
  gorevUygula(yeni);
  bildir("basari", `${g.kod} → ${sozluk().genel.gorevDurumu[durum]}`);
  return yeni;
}
