// Çekirdek giriş noktası: Electron utilityProcess içinde çalışır (ana süreç dist/cekirdek-giris.js'i fork eder).
//
// Akış:
//   ana süreç  → {tur:"baslat", cekirdekYolu, secenekler}
//   bu süreç   → çekirdeği içe aktarır, baslat(secenekler) çağırır → {tur:"hazir", adres, erisimAnahtari}
//   ana süreç  → {tur:"kapat"}  (uygulama kapanırken)
//   bu süreç   → sunucu.kapat() → {tur:"kapandi"} ve çıkış
//
// stdout/stderr ana süreçte kayıt dosyasına yazılır.

import { pathToFileURL } from "node:url";
import type { AnaMesaji, BaslatSecenekleri, CalisanSunucu, CekirdekMesaji, CekirdekModulu } from "./mesajlar.js";

const ebeveyn = process.parentPort;
let sunucu: CalisanSunucu | null = null;
let kapaniyor = false;

function gonder(mesaj: CekirdekMesaji): void {
  ebeveyn.postMessage(mesaj);
}

function hataMetni(hata: unknown): string {
  return hata instanceof Error ? (hata.stack ?? hata.message) : String(hata);
}

/** stdout boru hattı boşalsın diye çıkışı kısa süre geciktirir. */
function cik(kod: number): void {
  setTimeout(() => process.exit(kod), 100);
}

async function baslat(cekirdekYolu: string, secenekler: BaslatSecenekleri): Promise<void> {
  try {
    const modul = (await import(pathToFileURL(cekirdekYolu).href)) as Partial<CekirdekModulu>;
    if (typeof modul.baslat !== "function") {
      throw new Error(`${cekirdekYolu} bir baslat() işlevi dışa aktarmıyor`);
    }
    sunucu = await modul.baslat(secenekler);
    console.log(`[cekirdek-giris] çekirdek hazır: ${sunucu.adres}`);
    gonder({ tur: "hazir", adres: sunucu.adres, erisimAnahtari: sunucu.erisimAnahtari });
  } catch (hata) {
    console.error(`[cekirdek-giris] çekirdek başlatılamadı:\n${hataMetni(hata)}`);
    gonder({ tur: "hata", mesaj: hata instanceof Error ? hata.message : String(hata) });
    cik(1);
  }
}

async function kapat(): Promise<void> {
  if (kapaniyor) return;
  kapaniyor = true;
  try {
    await sunucu?.kapat();
  } catch (hata) {
    console.error(`[cekirdek-giris] çekirdek kapatılırken hata:\n${hataMetni(hata)}`);
  }
  gonder({ tur: "kapandi" });
  cik(0);
}

ebeveyn.on("message", (olay) => {
  const mesaj = olay.data as AnaMesaji | undefined;
  if (mesaj?.tur === "baslat") void baslat(mesaj.cekirdekYolu, mesaj.secenekler);
  else if (mesaj?.tur === "kapat") void kapat();
});

// Oturum kapanışı ya da terminalde Ctrl+C sinyali süreç grubuna doğrudan gelebilir: yine nazikçe kapan.
for (const sinyal of ["SIGINT", "SIGTERM"] as const) process.on(sinyal, () => void kapat());
