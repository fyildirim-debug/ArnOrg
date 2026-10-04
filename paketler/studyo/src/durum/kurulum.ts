// Kurulum durumu: Claude Code, git ve GitHub CLI; giriş ve kurulum işlemleri canlı çıktıyla ("kurulum.islem" olayı)
import type { GithubHesabi, KurulumDurumu, KurulumIslemi, KurulumIslemTuru } from "@arnorg/ortak";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { hataMetni } from "../api/istek";
import { api } from "../api/uclar";
import { useVeri, type Yukleme } from "./veri";

interface KurulumDeposu {
  durum: KurulumDurumu | null;
  yukleme: Yukleme;
  hata: string | null;
  /** Kimliğe göre son bilinen işlemler */
  islemler: Record<string, KurulumIslemi>;
  /** GitHub hesabı ve kuruluşları (depo sahibi seçimi, git kimliğini doldurma) */
  githubHesabi: GithubHesabi | null;
  githubHesabiYukleme: Yukleme;
  /** Claude Code giriş ve kurulum asistanının çekmecesi açık mı (her ekrandan açılır) */
  claudeAsistani: boolean;
  /** Son durum okuması (pencereye dönünce bayatsa yeniden okunur) */
  sonOkuma: number;
}

export const useKurulum = create<KurulumDeposu>()(() => ({
  durum: null,
  yukleme: "bos",
  hata: null,
  islemler: {},
  githubHesabi: null,
  githubHesabiYukleme: "bos",
  claudeAsistani: false,
  sonOkuma: 0,
}));

export { claudeEksigi, type ClaudeEksigi } from "../bilesenler/kurulumYardimcilari";

export function claudeAsistaniniAc() {
  useKurulum.setState({ claudeAsistani: true });
}

export function claudeAsistaniniKapat() {
  useKurulum.setState({ claudeAsistani: false });
}

const ayarla = useKurulum.setState;

/** Claude, git ve gh durumunu okur; tazele=true çekirdeğin önbelleğini atlar */
export async function kurulumuYukle(tazele = false): Promise<KurulumDurumu | null> {
  if (useKurulum.getState().yukleme !== "hazir") ayarla({ yukleme: "yukleniyor" });
  try {
    const durum = await api.kurulum(tazele);
    kurulumDurumuUygula(durum);
    return durum;
  } catch (e) {
    ayarla({ yukleme: "hata", hata: hataMetni(e) });
    return null;
  }
}

export function kurulumDurumuUygula(durum: KurulumDurumu) {
  const sonOkuma = Date.now();
  // GitHub girişi kapandıysa eski hesap bilgisi gösterilmesin
  if (!durum.github.girisYapildi) ayarla({ durum, yukleme: "hazir", hata: null, githubHesabi: null, githubHesabiYukleme: "bos", sonOkuma });
  else ayarla({ durum, yukleme: "hazir", hata: null, sonOkuma });
}

export function islemUygula(islem: KurulumIslemi) {
  ayarla((d) => ({ islemler: { ...d.islemler, [islem.id]: islem } }));
}

/** Süren ve son işlemleri bir kez çeker (sayfa yenilenince süren giriş ya da indirme kaybolmasın) */
export async function islemleriYukle(): Promise<void> {
  try {
    const liste = await api.kurulumIslemleri();
    // Bu arada olayla gelmiş daha yeni kopyalar korunur
    ayarla((d) => {
      const islemler = { ...d.islemler };
      for (const i of liste) if (!islemler[i.id]) islemler[i.id] = i;
      return { islemler };
    });
  } catch {
    // İşlem listesi isteğe bağlı; ekranlar yine durumdan çalışır
  }
}

/** İşlemi başlatır (API çağrısı) ve depoya yazar; süren aynı türde işlem varsa çekirdek onu döndürür */
export async function islemBaslat(baslat: () => Promise<KurulumIslemi>): Promise<KurulumIslemi> {
  const islem = await baslat();
  islemUygula(islem);
  return islem;
}

export async function islemIptal(id: string): Promise<KurulumIslemi> {
  const islem = await api.kurulumIptal(id);
  islemUygula(islem);
  return islem;
}

export async function islemeGirdi(id: string, metin: string): Promise<KurulumIslemi> {
  const islem = await api.kurulumGirdi(id, metin);
  islemUygula(islem);
  return islem;
}

/** Türün en son işlemi (ekranlar bunu gösterir) */
export function sonIslem(islemler: Record<string, KurulumIslemi>, tur: KurulumIslemTuru): KurulumIslemi | undefined {
  let son: KurulumIslemi | undefined;
  for (const i of Object.values(islemler)) if (i.tur === tur && (!son || i.baslangic > son.baslangic)) son = i;
  return son;
}

/** Bileşende: const islem = useSonIslem("claude_giris") */
export function useSonIslem(tur: KurulumIslemTuru): KurulumIslemi | undefined {
  return useKurulum((d) => sonIslem(d.islemler, tur));
}

/**
 * Bileşenin yürüttüğü işlem: bu ekrandan başlatılan ya da (sayfa yenilendiyse, başka sekmede başladıysa)
 * hâlâ süren aynı türdeki işlem. Bitince bir kez `bitince` çağrılır; canlı bağlantı yokken işlem yoklanır.
 */
export function useKurulumIslemi(tur: KurulumIslemTuru, bitince?: (islem: KurulumIslemi) => void) {
  const [id, setId] = useState<string | null>(null);
  const son = useSonIslem(tur);
  const islem = useKurulum((d) => (id ? d.islemler[id] : undefined));
  const wsBagli = useVeri((d) => d.wsDurumu === "bagli");
  const bitinceRef = useRef(bitince);
  bitinceRef.current = bitince;

  useEffect(() => {
    if (!id && son?.durum === "calisiyor") setId(son.id);
  }, [id, son]);

  const oncekiDurum = useRef<string | undefined>(undefined);
  useEffect(() => {
    const d = islem?.durum;
    if (islem && oncekiDurum.current === "calisiyor" && d !== "calisiyor") bitinceRef.current?.(islem);
    oncekiDurum.current = d;
  }, [islem]);

  const suruyor = islem?.durum === "calisiyor";
  useEffect(() => {
    if (!id || !suruyor || wsBagli) return;
    const z = setInterval(() => {
      api
        .kurulumIslemi(id)
        .then(islemUygula)
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(z);
  }, [id, suruyor, wsBagli]);

  const baslat = async (fn: () => Promise<KurulumIslemi>) => {
    const yeni = await islemBaslat(fn);
    setId(yeni.id);
    return yeni;
  };
  /** Biten işlemin panelini kapatır */
  const gizle = () => setId(null);
  return { islem, baslat, gizle };
}

// ---------------------------------------------------------------------------
// Türetilmiş durumlar
// ---------------------------------------------------------------------------

/** Ajanlar çalışabilir: Claude girişi abonelikle yapılmış */
export function claudeHazir(d: KurulumDurumu | null): boolean {
  return !!d && d.claude.girisYapildi && d.claude.abonelik;
}

/** gh kurulu ve GitHub'a giriş yapılmış: depo listesi, klonlama, depo açma kullanılabilir */
export function githubBagli(d: KurulumDurumu | null): boolean {
  return !!d && d.github.kurulu && d.github.girisYapildi;
}

/** GitHub adımı bitti: git, gh, giriş ve git kimliği */
export function githubHazir(d: KurulumDurumu | null): boolean {
  return githubBagli(d) && !!d && d.git.kurulu && !!d.git.kullaniciAdi && !!d.git.eposta;
}

/**
 * GitHub hesabı; yalnız giriş yapılmışken istenir. Çekirdek "GitHub girişi yok" için 401 döner, istek katmanı da
 * 401'de erişim anahtarını unutur: bu yüzden girişsiz hiçbir GitHub ucu çağrılmaz.
 */
export async function githubHesabiYukle(zorla = false): Promise<GithubHesabi | null> {
  const d = useKurulum.getState();
  if (!githubBagli(d.durum)) return null;
  if (!zorla && (d.githubHesabiYukleme === "hazir" || d.githubHesabiYukleme === "yukleniyor")) return d.githubHesabi;
  ayarla({ githubHesabiYukleme: "yukleniyor" });
  try {
    const hesap = await api.githubHesabi();
    ayarla({ githubHesabi: hesap, githubHesabiYukleme: "hazir" });
    return hesap;
  } catch {
    ayarla({ githubHesabiYukleme: "hata" });
    return null;
  }
}
