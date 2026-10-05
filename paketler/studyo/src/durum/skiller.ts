// Skill kütüphanesi: çekirdeğin GET /api/skiller kataloğu ilk kullanımda bir kez yüklenip saklanır (kütüphane uygulamayla
// gelir, çalışırken değişmez). Eski çekirdekte uç yoksa skill bölümleri gösterilmez; hata olursa yeniden denenebilir.
import type { SkillKatalogu, SkillKaydi } from "@arnorg/ortak";
import { useEffect } from "react";
import { create } from "zustand";
import { ApiHatasi, hataMetni } from "../api/istek";
import { skillApi } from "../api/skiller";

interface SkillDurumu {
  katalog: SkillKatalogu | null;
  /** Yükleme hatası (eski çekirdekte 404: yok sayılır, bölüm gizlenir) */
  hata: string | null;
  /** Çekirdekte uç yok */
  desteklenmiyor: boolean;
}

export const useSkiller = create<SkillDurumu>()(() => ({ katalog: null, hata: null, desteklenmiyor: false }));

let suren: Promise<void> | null = null;

export function skilleriYukle(zorla = false): Promise<void> {
  if (suren) return suren;
  const d = useSkiller.getState();
  if ((d.katalog || d.desteklenmiyor) && !zorla) return Promise.resolve();
  if (d.hata && !zorla) return Promise.resolve();
  useSkiller.setState({ hata: null });
  suren = skillApi
    .katalog()
    .then((katalog) => useSkiller.setState({ katalog, hata: null }))
    .catch((e: unknown) => {
      if (e instanceof ApiHatasi && e.durum === 404) useSkiller.setState({ desteklenmiyor: true });
      else useSkiller.setState({ hata: hataMetni(e) });
    })
    .finally(() => {
      suren = null;
    });
  return suren;
}

/** Bileşenlerde katalog: ilk kullanımda yüklenir */
export function useSkillKatalogu(): SkillDurumu {
  const durum = useSkiller();
  useEffect(() => {
    void skilleriYukle();
  }, []);
  return durum;
}

/** Katalog sırasında, tekil ve yalnız bilinen kimlikler */
export function skillSirala(katalog: SkillKatalogu, liste: Iterable<string>): string[] {
  const kume = new Set(liste);
  return katalog.skiller.map((s) => s.kimlik).filter((k) => kume.has(k));
}

export function skillBul(katalog: SkillKatalogu | null, kimlik: string): SkillKaydi | null {
  return katalog?.skiller.find((s) => s.kimlik === kimlik) ?? null;
}

/** Rolün varsayılan skilleri (CEO'nun yoktur) */
export function rolSkilleri(katalog: SkillKatalogu | null, rol: string): string[] {
  return katalog?.roller[rol] ?? [];
}
