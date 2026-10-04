// Karargâh sohbeti ve önemli an pencereleri için arayüz durumu: teslim test paneli, CEO'ya yanıt isteği,
// Onaylar'da vurgulanacak onay, masaüstü bildirim izni sorusu, test adımlarının işaretleri
import { create } from "zustand";
import { git } from "./arayuz";

interface SohbetDurumu {
  /** Test paneli açık olan teslim onayı (panel her ekranda açılabilir) */
  testOnayId: string | null;
  /** "CEO'ya yanıt yaz": Karargâh sohbetinin yazma alanı odaklanır; alıntı yanıtlanan konudur */
  yanitIstegi: { no: number; alinti: string | null } | null;
  /** Onaylar ekranında görünür kılınıp kısa süre vurgulanacak onay */
  vurguluOnayId: string | null;
  /** Masaüstü bildirim izni bu tarayıcıda soruldu ya da "Şimdi değil" dendi */
  masaustuSoruldu: boolean;
}

const MASAUSTU = "arnorg.masaustuBildirimSorusu";
const TEST_ADIMLARI = "arnorg.testAdimlari.";

function oku(anahtar: string): string | null {
  try {
    return localStorage.getItem(anahtar);
  } catch {
    return null;
  }
}

function yaz(anahtar: string, deger: string | null) {
  try {
    if (deger === null) localStorage.removeItem(anahtar);
    else localStorage.setItem(anahtar, deger);
  } catch {
    // Depolama kapalı: tercih yalnız bu oturumda kalır
  }
}

export const useSohbet = create<SohbetDurumu>()(() => ({
  testOnayId: null,
  yanitIstegi: null,
  vurguluOnayId: null,
  masaustuSoruldu: oku(MASAUSTU) === "1",
}));

// ---------------------------------------------------------------------------
// Teslim testi
// ---------------------------------------------------------------------------

export function testiAc(onayId: string) {
  useSohbet.setState({ testOnayId: onayId });
}

export function testiKapat() {
  useSohbet.setState({ testOnayId: null });
}

/** Bu tarayıcıda işaretlenen test adımları (sıra numaraları) */
export function testAdimlariniOku(onayId: string): number[] {
  try {
    const ham = JSON.parse(oku(TEST_ADIMLARI + onayId) ?? "[]") as unknown;
    return Array.isArray(ham) ? ham.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

export function testAdimlariniYaz(onayId: string, isaretli: number[]) {
  yaz(TEST_ADIMLARI + onayId, isaretli.length ? JSON.stringify(isaretli) : null);
}

// ---------------------------------------------------------------------------
// CEO'ya yanıt ve Onaylar'a geçiş
// ---------------------------------------------------------------------------

/** Karargâh'a geçer; CEO sohbetinin yazma alanı odaklanır ve yanıtlanan konu alıntılanır */
export function ceoyaYanitYaz(alinti: string | null) {
  useSohbet.setState((d) => ({ yanitIstegi: { no: (d.yanitIstegi?.no ?? 0) + 1, alinti } }));
  git("karargah");
}

export function yanitIstegiAlindi() {
  useSohbet.setState({ yanitIstegi: null });
}

/** Onaylar ekranına geçer; onay görünür kılınır ve kısa süre vurgulanır */
export function onaylardaAc(onayId: string | null) {
  useSohbet.setState({ vurguluOnayId: onayId });
  git("onaylar");
}

export function vurguyuBitir() {
  useSohbet.setState({ vurguluOnayId: null });
}

// ---------------------------------------------------------------------------
// Masaüstü bildirimi: pencere arkadayken önemli anlar işletim sisteminin bildirimiyle de gelir (durum/olaylar.ts)
// ---------------------------------------------------------------------------

export type MasaustuIzni = "verildi" | "reddedildi" | "sorulmadi" | "yok";

export function masaustuIzni(): MasaustuIzni {
  if (typeof Notification === "undefined") return "yok";
  if (Notification.permission === "granted") return "verildi";
  if (Notification.permission === "denied") return "reddedildi";
  return "sorulmadi";
}

/** İzin istenir; tarayıcı (ya da Electron) kararını döndürür. Soru bir daha gösterilmez */
export async function masaustuIzniIste(): Promise<MasaustuIzni> {
  masaustuSorusunuKapat();
  if (typeof Notification === "undefined") return "yok";
  try {
    const sonuc = await Notification.requestPermission();
    return sonuc === "granted" ? "verildi" : sonuc === "denied" ? "reddedildi" : "sorulmadi";
  } catch {
    return masaustuIzni();
  }
}

export function masaustuSorusunuKapat() {
  yaz(MASAUSTU, "1");
  useSohbet.setState({ masaustuSoruldu: true });
}
