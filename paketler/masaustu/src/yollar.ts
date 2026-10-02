// Geliştirmede (monorepo) ve paketlenmiş uygulamada dosya yolları.
//
// Geliştirme (electron paketler/masaustu):
//   uygulama  paketler/masaustu
//   çekirdek  paketler/cekirdek/dist/index.js        (ARNORG_SAHTE_CEKIRDEK=1 ise gelistirme/sahte-cekirdek.mjs)
//   stüdyo    paketler/studyo/dist
//
// Paketlenmiş uygulama (electron-builder.yml):
//   uygulama  <resources>/app.asar                   (yalnız kabuğun dist/ ve kaynaklar/ dosyaları)
//   çekirdek  <resources>/app.asar.unpacked/cekirdek/index.js
//   bağımlılıklar <resources>/app.asar.unpacked/node_modules
//   stüdyo    <resources>/studyo
//
// Çekirdek ve çalışma zamanı bağımlılıkları asar dışında, aynı ağaçta durur. Böylece çekirdeğin ESM
// `import "fastify"` gibi çıplak içe aktarmaları Node'un olağan node_modules aramasıyla çözülür
// (ESM, NODE_PATH'i dikkate almaz), yerel modüller ve çalıştırılan ikililer (claude, node-pty)
// gerçek dosya yollarına sahip olur.

import { app } from "electron";
import { join, resolve } from "node:path";

export interface Yollar {
  /** utilityProcess ile çalıştırılan giriş betiği */
  cekirdekGiris: string;
  /** Çekirdek modülü (baslat() dışa aktarır) */
  cekirdek: string;
  /** Sahte çekirdek mi kullanılıyor (yalnız geliştirme ve denemeler) */
  sahteCekirdek: boolean;
  studyo: string;
  kullaniciVerisi: string;
  /** Çekirdeğin veri dizini */
  veri: string;
  kayitlar: string;
  simge: string;
  durumSayfasi: string;
  onyukleme: string;
  durumOnyukleme: string;
}

export function yollariBul(): Yollar {
  const uygulama = app.getAppPath();
  const dist = join(uygulama, "dist");
  const paketli = app.isPackaged;
  const sahteCekirdek = process.env.ARNORG_SAHTE_CEKIRDEK === "1";
  const kullaniciVerisi = app.getPath("userData");

  let cekirdek: string;
  if (sahteCekirdek) cekirdek = join(uygulama, "gelistirme", "sahte-cekirdek.mjs");
  else if (paketli) cekirdek = join(process.resourcesPath, "app.asar.unpacked", "cekirdek", "index.js");
  else cekirdek = resolve(uygulama, "..", "cekirdek", "dist", "index.js");

  return {
    cekirdekGiris: join(dist, "cekirdek-giris.js"),
    cekirdek,
    sahteCekirdek,
    studyo: paketli ? join(process.resourcesPath, "studyo") : resolve(uygulama, "..", "studyo", "dist"),
    kullaniciVerisi,
    veri: join(kullaniciVerisi, "veri"),
    kayitlar: join(kullaniciVerisi, "logs"),
    simge: join(uygulama, "kaynaklar", "simge.png"),
    durumSayfasi: join(dist, "durum.html"),
    onyukleme: join(dist, "onyukleme.cjs"),
    durumOnyukleme: join(dist, "durum-onyukleme.cjs"),
  };
}
