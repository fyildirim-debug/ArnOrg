// Gönderilmeyi bekleyen ekler (yazma alanının çipleri): dosya eklenir eklenmez çekirdeğe yüklenir (ilerlemesiyle);
// kaldırılan ya da gönderilmeden bırakılan taslak çekirdekten de silinir. Görsellerin önizlemesi yerel nesne adresidir;
// mesaj gönderilince bu adresler görsel önbelleğine geçer (mesajdaki görsel yeniden indirilmez).
import { EK_SINIRLARI, type MesajEki } from "@arnorg/ortak";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ekApi } from "../../api/ekler";
import { ApiHatasi, hataMetni } from "../../api/istek";
import { sozluk } from "../../dil";
import { bildir } from "../../durum/arayuz";
import { EK_MB, yapistirilanAd, yerelDenetim } from "../../yardimcilar/ekler";
import { gorselOnbellegeKoy } from "./ekDosyasi";

export type TaslakDurumu = "yukleniyor" | "hazir" | "hata";

export interface Taslak {
  anahtar: string;
  ad: string;
  boyut: number;
  /** Tarayıcının bildirdiği tür (önizleme için); asıl türü çekirdek içerikten tanır */
  tur: string;
  /** Görselin yerel önizleme adresi */
  onizleme: string | null;
  durum: TaslakDurumu;
  /** Yükleme oranı 0–1 */
  oran: number;
  ek: MesajEki | null;
  hata: string | null;
  /** Hata yeniden denemekle geçmez (çekirdek dosyayı reddetti ya da dosya yerelde sınırı aşıyor) */
  kalici?: boolean;
}

const ONIZLENEN = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
let sayac = 0;

export interface EkTaslagi {
  liste: Taslak[];
  ekle: (dosyalar: File[]) => void;
  kaldir: (anahtar: string) => void;
  yenidenDene: (anahtar: string) => void;
  /** Mesaj gönderildi: çipler temizlenir, görsel önizlemeleri önbelleğe geçer */
  gonderildi: () => void;
  /** Gönderilecek eklerin kimlikleri */
  idler: string[];
  yukleniyor: boolean;
  hataVar: boolean;
}

export function useEkTaslagi(pid: string | null): EkTaslagi {
  const [liste, setListe] = useState<Taslak[]>([]);
  const listeRef = useRef<Taslak[]>([]);
  listeRef.current = liste;
  const dosyalar = useRef(new Map<string, File>());
  const iptaller = useRef(new Map<string, AbortController>());
  const pidRef = useRef(pid);
  pidRef.current = pid;

  const guncelle = useCallback((anahtar: string, alanlar: Partial<Taslak>) => {
    setListe((l) => l.map((t) => (t.anahtar === anahtar ? { ...t, ...alanlar } : t)));
  }, []);

  const yukle = useCallback(
    (anahtar: string) => {
      const dosya = dosyalar.current.get(anahtar);
      const proje = pidRef.current;
      if (!dosya || !proje) return;
      iptaller.current.get(anahtar)?.abort();
      const iptal = new AbortController();
      iptaller.current.set(anahtar, iptal);
      guncelle(anahtar, { durum: "yukleniyor", oran: 0, hata: null, kalici: false });
      ekApi
        .yukle(proje, dosya, (oran) => guncelle(anahtar, { oran }), iptal.signal)
        .then(
          (ek) => {
            if (iptal.signal.aborted) return;
            // Bu arada kaldırıldıysa (ya da proje değiştiyse) taslak çekirdekten de silinir
            if (!listeRef.current.some((t) => t.anahtar === anahtar)) {
              void ekApi.sil(ek.id).catch(() => undefined);
              return;
            }
            guncelle(anahtar, { durum: "hazir", oran: 1, ek, ad: ek.ad });
          },
          (h: unknown) => {
            if (h instanceof DOMException && h.name === "AbortError") return;
            // 4xx: çekirdek dosyayı reddetti (tür, boyut); yeniden denemek değiştirmez
            const kalici = h instanceof ApiHatasi && h.durum >= 400 && h.durum < 500;
            guncelle(anahtar, { durum: "hata", hata: hataMetni(h), kalici });
          },
        )
        .finally(() => {
          if (iptaller.current.get(anahtar) === iptal) iptaller.current.delete(anahtar);
        });
    },
    [guncelle],
  );

  const birak = useCallback((t: Taslak, onizlemeyiBirak = true) => {
    iptaller.current.get(t.anahtar)?.abort();
    iptaller.current.delete(t.anahtar);
    dosyalar.current.delete(t.anahtar);
    if (onizlemeyiBirak && t.onizleme) URL.revokeObjectURL(t.onizleme);
    // Yüklenmiş ama gönderilmemiş taslak çekirdekten silinir
    if (t.ek) void ekApi.sil(t.ek.id).catch(() => undefined);
  }, []);

  const ekle = useCallback(
    (gelen: File[]) => {
      if (!gelen.length || !pidRef.current) return;
      const s = sozluk().ekler;
      const yer = EK_SINIRLARI.mesajBasina - listeRef.current.length;
      if (yer <= 0 || gelen.length > yer) bildir("uyari", s.enCok(EK_SINIRLARI.mesajBasina));
      const yeni: Taslak[] = gelen.slice(0, Math.max(0, yer)).map((ham) => {
        // Panodan gelen adsız görsel saatle adlanır
        const ad = yapistirilanAd(ham, s.yapistirilan);
        const dosya = ad === ham.name ? ham : new File([ham], ad, { type: ham.type });
        const anahtar = `t${++sayac}`;
        dosyalar.current.set(anahtar, dosya);
        const denetim = yerelDenetim(dosya);
        return {
          anahtar,
          ad,
          boyut: dosya.size,
          tur: dosya.type,
          onizleme: ONIZLENEN.has(dosya.type) && !denetim ? URL.createObjectURL(dosya) : null,
          durum: denetim ? "hata" : "yukleniyor",
          oran: 0,
          ek: null,
          hata: denetim === "buyuk" ? s.cokBuyuk(EK_MB) : denetim === "bos" ? s.bos : null,
          kalici: !!denetim,
        };
      });
      if (!yeni.length) return;
      listeRef.current = [...listeRef.current, ...yeni];
      setListe(listeRef.current);
      for (const t of yeni) if (t.durum === "yukleniyor") yukle(t.anahtar);
    },
    [yukle],
  );

  const kaldir = useCallback(
    (anahtar: string) => {
      const t = listeRef.current.find((x) => x.anahtar === anahtar);
      if (!t) return;
      birak(t);
      listeRef.current = listeRef.current.filter((x) => x.anahtar !== anahtar);
      setListe(listeRef.current);
    },
    [birak],
  );

  const yenidenDene = useCallback(
    (anahtar: string) => {
      const t = listeRef.current.find((x) => x.anahtar === anahtar);
      if (!t || t.durum !== "hata" || t.kalici) return;
      yukle(anahtar);
    },
    [yukle],
  );

  const gonderildi = useCallback(() => {
    for (const t of listeRef.current) {
      iptaller.current.get(t.anahtar)?.abort();
      dosyalar.current.delete(t.anahtar);
      if (t.ek && t.onizleme) gorselOnbellegeKoy(t.ek, t.onizleme);
      else if (t.onizleme) URL.revokeObjectURL(t.onizleme);
    }
    iptaller.current.clear();
    listeRef.current = [];
    setListe([]);
  }, []);

  // Proje değişince ve yazma alanı kapanınca gönderilmemiş taslaklar bırakılır (çekirdekten de silinir)
  useEffect(
    () => () => {
      for (const t of listeRef.current) birak(t);
      listeRef.current = [];
      setListe([]);
    },
    [pid, birak],
  );

  const idler = useMemo(() => liste.flatMap((t) => (t.durum === "hazir" && t.ek ? [t.ek.id] : [])), [liste]);
  return {
    liste,
    ekle,
    kaldir,
    yenidenDene,
    gonderildi,
    idler,
    yukleniyor: liste.some((t) => t.durum === "yukleniyor"),
    hataVar: liste.some((t) => t.durum === "hata"),
  };
}

/** Yükleme hatası bildirimi gerekmez: çipte görünür. Bu yardımcı yalnız dışarıdan çağrılan eylemlerin hatasını gösterir */
export function ekHatasi(h: unknown): void {
  if (h instanceof DOMException && h.name === "AbortError") return;
  bildir("hata", hataMetni(h) || sozluk().ekler.acilamadi);
}
