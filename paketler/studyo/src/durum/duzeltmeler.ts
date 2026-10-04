// Tarayıcının düzeltme notları: etkin projenin notları (açık ve gönderilmiş). Olaylar (duzeltme.guncellendi,
// duzeltme.silindi) ve API yanıtları aynı yoldan uygulanır; liste eklenme sırasıyla durur.
import type { Duzeltme, DuzeltmeEkleIstegi, DuzeltmeGonderimi } from "@arnorg/ortak";
import { create } from "zustand";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import type { Yukleme } from "./veri";

interface DuzeltmeDurumu {
  projeId: string | null;
  liste: Duzeltme[];
  yukleme: Yukleme;
  hata: string | null;
}

export const useDuzeltmeler = create<DuzeltmeDurumu>()(() => ({ projeId: null, liste: [], yukleme: "bos", hata: null }));

const ayarla = useDuzeltmeler.setState;
const al = useDuzeltmeler.getState;

const sirala = (a: Duzeltme, b: Duzeltme) => a.zaman.localeCompare(b.zaman);

/** Etkin projenin notları; proje değişince liste boşalıp yeniden yüklenir */
export async function duzeltmeleriYukle(pid: string, sessiz = false): Promise<void> {
  if (al().projeId !== pid) ayarla({ projeId: pid, liste: [], yukleme: "yukleniyor", hata: null });
  else if (!sessiz) ayarla({ yukleme: al().yukleme === "hazir" ? "hazir" : "yukleniyor", hata: null });
  try {
    const liste = await api.duzeltmeler(pid);
    if (al().projeId !== pid) return;
    ayarla({ liste: liste.slice().sort(sirala), yukleme: "hazir", hata: null });
  } catch (e) {
    if (al().projeId === pid) ayarla({ yukleme: "hata", hata: hataMetni(e) });
  }
}

/** Gelen notu ekler ya da değiştirir (olay ya da API yanıtı) */
export function duzeltmeUygula(d: Duzeltme): void {
  if (d.projeId !== al().projeId) return;
  ayarla((s) => {
    const i = s.liste.findIndex((x) => x.id === d.id);
    if (i === -1) return { liste: [...s.liste, d].sort(sirala) };
    const liste = s.liste.slice();
    liste[i] = d;
    return { liste };
  });
}

export function duzeltmeKaldir(projeId: string, id: string): void {
  if (projeId !== al().projeId) return;
  ayarla((s) => ({ liste: s.liste.filter((x) => x.id !== id) }));
}

export async function duzeltmeEkle(pid: string, istek: DuzeltmeEkleIstegi): Promise<Duzeltme> {
  const d = await api.duzeltmeEkle(pid, istek);
  duzeltmeUygula(d);
  return d;
}

export async function duzeltmeNotunuDuzelt(id: string, not: string): Promise<Duzeltme> {
  const d = await api.duzeltmeGuncelle(id, not);
  duzeltmeUygula(d);
  return d;
}

export async function duzeltmeSil(d: Duzeltme): Promise<void> {
  await api.duzeltmeSil(d.id);
  duzeltmeKaldir(d.projeId, d.id);
}

/** "Hepsini yaptır": açık notlar tek kurul mesajıyla CEO'ya gider */
export async function duzeltmeleriGonder(pid: string): Promise<DuzeltmeGonderimi> {
  const g = await api.duzeltmeleriGonder(pid);
  for (const d of g.gonderilen) duzeltmeUygula(d);
  return g;
}
