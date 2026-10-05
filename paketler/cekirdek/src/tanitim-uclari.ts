// Tanıtım alanının HTTP uçları: README.md vitrini ve kurulun güncelleme isteği. Sözleşme: docs/API.md "Tanıtım".
import { KURUL } from "@arnorg/ortak";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Sirket } from "./sirket.js";
import { Tanitim, TANITIM_NOT_SINIRI } from "./tanitim.js";

const guncelleSemasi = z.object({ not: z.string().max(TANITIM_NOT_SINIRI).optional() });

/** Uçları kurar; servis nesnesini döndürür (testler için). Sunucu kapanınca olay dinleyicisi bırakılır */
export function tanitimUclariniKur(app: FastifyInstance, sirket: Sirket): Tanitim {
  const tanitim = new Tanitim({
    depo: sirket.depo,
    olaylar: sirket.olaylar,
    // Kurulun isteği: uzman kurul kaynağıyla uyanır (eşzamanlı tavandan ve abonelik sınırından muaf)
    uzmanaYaz: (uzman, metin) => sirket.ajanaMesaj(uzman.id, metin, "next", { tur: "kurul" }),
    // Uzman yoksa istek kurulun mesajı olarak #yonetim'e yazılır; CEO uyanır
    ceoyaYaz: async (projeId, metin) => {
      await sirket.mesajGonder(projeId, "yonetim", KURUL, metin);
    },
  });
  const param = (i: FastifyRequest, ad: string): string => String((i.params as Record<string, string>)[ad] ?? "");

  app.get("/api/projeler/:pid/tanitim", async (i) => tanitim.durum(param(i, "pid")));
  app.post("/api/projeler/:pid/tanitim/guncelle", async (i) => tanitim.guncelle(param(i, "pid"), guncelleSemasi.parse(i.body ?? {}).not));
  app.addHook("onClose", async () => tanitim.durdur());
  return tanitim;
}
