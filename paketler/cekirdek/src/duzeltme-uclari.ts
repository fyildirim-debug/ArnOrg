// Düzeltme notlarının HTTP uçları (uygulama içi tarayıcı). Sözleşme: docs/API.md "Düzeltme notları".
import fs from "node:fs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { DUZELTME_GOVDE_SINIRI, Duzeltmeler, HTML_SINIRI } from "./duzeltmeler.js";
import type { Sirket } from "./sirket.js";

const sayi = z.number().min(-1_000_000).max(1_000_000);

const semalar = {
  ekle: z.object({
    adres: z.string().min(1).max(4000),
    sayfaBasligi: z.string().max(2000).optional(),
    secici: z.string().max(4000).nullable().optional(),
    ogeMetni: z.string().max(4000).nullable().optional(),
    ogeHtml: z.string().max(HTML_SINIRI).nullable().optional(),
    stiller: z
      .object({ yaziTipi: z.string().max(400), boyut: z.string().max(60), renk: z.string().max(120), arkaPlan: z.string().max(120) })
      .nullable()
      .optional(),
    kutu: z
      .object({ x: sayi, y: sayi, genislik: z.number().min(0).max(1_000_000), yukseklik: z.number().min(0).max(1_000_000), sayfaX: sayi, sayfaY: sayi })
      .nullable()
      .optional(),
    gorunum: z
      .object({ genislik: z.number().int().min(1).max(100_000), yukseklik: z.number().int().min(1).max(100_000) })
      .nullable()
      .optional(),
    not: z.string().min(1).max(4000),
    gorsel: z.string().max(DUZELTME_GOVDE_SINIRI).nullable().optional(),
  }),
  not: z.object({ not: z.string().min(1).max(4000) }),
};

/** Uçları kurar; servis nesnesini döndürür (testler için) */
export function duzeltmeUclariniKur(app: FastifyInstance, sirket: Sirket): Duzeltmeler {
  const duzeltmeler = new Duzeltmeler(sirket);
  const param = (i: FastifyRequest, ad: string): string => String((i.params as Record<string, string>)[ad] ?? "");

  app.get("/api/projeler/:pid/duzeltmeler", async (i) => {
    const durum = (i.query as Record<string, string | undefined>).durum;
    return duzeltmeler.listele(param(i, "pid"), durum === "acik" || durum === "gonderildi" ? durum : undefined);
  });
  // Görsel base64 gelir: genel 4 MB gövde sınırı bu uçta genişler, görselin kendisi 4 MB ile sınırlıdır
  app.post("/api/projeler/:pid/duzeltmeler", { bodyLimit: DUZELTME_GOVDE_SINIRI }, async (i) => duzeltmeler.ekle(param(i, "pid"), semalar.ekle.parse(i.body ?? {})));
  app.post("/api/projeler/:pid/duzeltmeler/gonder", async (i) => duzeltmeler.gonder(param(i, "pid")));
  app.patch("/api/duzeltmeler/:id", async (i) => duzeltmeler.notuDuzelt(param(i, "id"), semalar.not.parse(i.body ?? {}).not));
  app.delete("/api/duzeltmeler/:id", async (i) => {
    duzeltmeler.sil(param(i, "id"));
    return { tamam: true };
  });
  app.get("/api/duzeltmeler/:id/gorsel", async (i, yanit) => {
    const dosya = duzeltmeler.gorselYolu(param(i, "id"));
    // Görüntü bir kez yazılır, değişmez
    return yanit.header("Content-Type", "image/png").header("Cache-Control", "private, max-age=86400").send(fs.createReadStream(dosya));
  });
  return duzeltmeler;
}
