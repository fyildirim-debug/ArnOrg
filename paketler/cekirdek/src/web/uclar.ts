// Yetenek ve web uçları (docs/API.md, "Web ve araştırma"): yetenek kataloğu, motor durumu, kurulun deneme
// araması ve deneme okuması
import { WEB_ARAMA_KATEGORILERI, YETENEKLER } from "@arnorg/ortak";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sirket } from "../sirket.js";
import { ROL_YETENEKLERI } from "../yetenekler.js";

const aramaSemasi = z.object({
  sorgu: z.string().min(1).max(500),
  kategori: z.enum(WEB_ARAMA_KATEGORILERI as [string, ...string[]]).optional(),
  sayfa: z.number().int().min(1).max(10).optional(),
  dil: z.enum(["tr", "en"]).optional(),
});

const okumaSemasi = z.object({
  adres: z.string().min(1).max(4000),
  baslangic: z.number().int().min(0).optional(),
  uzunluk: z.number().int().min(500).max(60_000).optional(),
  baglantilar: z.boolean().optional(),
});

export function webUclariniKur(app: FastifyInstance, sirket: Sirket): void {
  app.get("/api/yetenekler", async () => YETENEKLER);
  /** Rollerin varsayılan yetenekleri (işe alımda ve göçte verilenler) */
  app.get("/api/yetenekler/roller", async () => ROL_YETENEKLERI);
  app.get("/api/web/durum", async () => sirket.web.durum());
  app.post("/api/web/ara", async (i) => {
    const g = aramaSemasi.parse(i.body ?? {});
    return sirket.web.arama.ara({ sorgu: g.sorgu, kategori: g.kategori as (typeof WEB_ARAMA_KATEGORILERI)[number] | undefined, sayfa: g.sayfa, dil: g.dil });
  });
  app.post("/api/web/oku", async (i) => sirket.web.okuyucu.oku(okumaSemasi.parse(i.body ?? {})));
  /** Askıları kaldırır: kurul motorları hemen yeniden denemek isterse */
  app.post("/api/web/askilari-kaldir", async () => {
    sirket.web.arama.askilariKaldir();
    return sirket.web.durum();
  });
}
