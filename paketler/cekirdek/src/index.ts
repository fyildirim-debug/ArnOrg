// ArnOrg çekirdeği: masaüstü uygulaması ve sunucu modu bu fonksiyonla başlatır
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Depo } from "./depo.js";
import { Gozetmen } from "./gozetmen.js";
import { DosyaIzleyici } from "./izleyici.js";
import { OlayYolu } from "./olaylar.js";
import { claudeYoluBul } from "./ortam.js";
import { Sirket } from "./sirket.js";
import { sunucuKur } from "./sunucu.js";
import { TerminalYoneticisi } from "./terminal.js";
import { Yapilandirma } from "./yapilandirma.js";

export interface BaslatSecenekleri {
  /** 0 = boş rastgele bağlantı noktası */
  port?: number;
  /** Varsayılan 127.0.0.1 */
  host?: string;
  veriDizini: string;
  /** Stüdyo derlemesinin dizini; verilmezse monorepo içindeki paketler/studyo/dist denenir */
  studyoDizini?: string;
  erisimAnahtari?: string;
  claudeYolu?: string | null;
  /** Sunucu modunda izin verilen Host başlıkları (ör. arnorg.ornek.com) */
  izinliHostlar?: string[];
}

export interface CalisanSunucu {
  adres: string;
  port: number;
  erisimAnahtari: string;
  kapat(): Promise<void>;
}

function varsayilanStudyoDizini(): string | null {
  const burasi = path.dirname(fileURLToPath(import.meta.url));
  for (const aday of [path.resolve(burasi, "../../studyo/dist"), path.resolve(burasi, "../studyo"), path.resolve(burasi, "studyo")]) {
    if (fs.existsSync(path.join(aday, "index.html"))) return aday;
  }
  return null;
}

export async function baslat(s: BaslatSecenekleri): Promise<CalisanSunucu> {
  const yapilandirma = new Yapilandirma(s.veriDizini);
  const depo = new Depo(path.join(s.veriDizini, "arnorg.db"));
  const olaylar = new OlayYolu();
  const sirket = new Sirket(depo, olaylar, yapilandirma, () => claudeYoluBul(s.claudeYolu ?? yapilandirma.ayarlar.claudeYolu));
  const terminaller = new TerminalYoneticisi();
  const gozetmen = new Gozetmen(sirket);
  gozetmen.baslat();
  sirket.hesap.baslat();
  // Uzak deposu olan projeler arada bir eşitlenir
  sirket.esitlemeBaslat();
  // Global zekânın bakımı (birleştirme, emekliye ayırma)
  sirket.kuresel.baslat();
  // Otomatik dizinleme açıksa projelerin ana reposu arka planda dizinlenir
  sirket.kodZekasi.baslat();
  const izleyici = new DosyaIzleyici(olaylar, (tam) => {
    const d = sirket.duzenlemeler.get(tam);
    return d && Date.now() - d.zaman < 15_000 ? d.ajanId : null;
  });

  // Var olan projelerin ana repoları ve ajan çalışma alanları izlenir
  for (const p of depo.projeler()) {
    if (fs.existsSync(p.yol)) izleyici.izle(p.id, "ana", p.yol);
    for (const a of depo.ajanlar(p.id)) if (a.calismaAlani && a.calismaAlani !== p.yol && fs.existsSync(a.calismaAlani)) izleyici.izle(p.id, a.id, a.calismaAlani);
  }
  olaylar.dinle((o) => {
    if (o.tur === "proje.guncellendi" && fs.existsSync(o.proje.yol)) izleyici.izle(o.proje.id, "ana", o.proje.yol);
    if (o.tur === "ajan.guncellendi" && o.ajan.calismaAlani && fs.existsSync(o.ajan.calismaAlani)) {
      const p = depo.proje(o.ajan.projeId);
      if (p && o.ajan.calismaAlani !== p.yol) izleyici.izle(p.id, o.ajan.id, o.ajan.calismaAlani);
    }
  });

  const erisimAnahtari = yapilandirma.erisimAnahtari(s.erisimAnahtari);
  const app = await sunucuKur({
    sirket,
    terminaller,
    erisimAnahtari,
    studyoDizini: s.studyoDizini ?? varsayilanStudyoDizini(),
    izinliHostlar: s.izinliHostlar ?? [],
  });
  const host = s.host ?? "127.0.0.1";
  await app.listen({ port: s.port ?? 47820, host });
  const port = (app.server.address() as AddressInfo).port;
  const gorunenHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;

  let kapandi = false;
  return {
    adres: `http://${gorunenHost}:${port}`,
    port,
    erisimAnahtari,
    async kapat() {
      if (kapandi) return;
      kapandi = true;
      gozetmen.durdur();
      await sirket.kodZekasi.kapat();
      sirket.kapat();
      terminaller.hepsiniKapat();
      await izleyici.kapat();
      await app.close();
      depo.kapat();
    },
  };
}

export { ARNORG_SURUMU } from "@arnorg/ortak";
