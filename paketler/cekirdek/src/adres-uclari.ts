// Proje adreslerinin HTTP ucu (0.0.8): Stüdyo'nun Tarayıcı ekranı listeyi buradan alır, sonra adresler.guncellendi
// olaylarıyla güncel tutar. Sözleşme: docs/API.md "Proje adresleri".
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ProjeAdresleri } from "./proje-adresleri.js";
import type { Sirket } from "./sirket.js";

/** Ucu kurar; izinli sunucular (--izinli-host) yerel ağ dışında olsa da yoklanır. Sunucu kapanınca yoklama durur */
export function adresUclariniKur(app: FastifyInstance, sirket: Sirket, izinliHostlar: string[] = []): ProjeAdresleri {
  const adresler = sirket.adresler;
  adresler.izinliHostlariAyarla(izinliHostlar);
  const param = (i: FastifyRequest, ad: string): string => String((i.params as Record<string, string>)[ad] ?? "");

  app.get("/api/projeler/:pid/adresler", async (i) => adresler.listele(sirket.proje(param(i, "pid")).id));
  app.addHook("onClose", async () => adresler.durdur());
  return adresler;
}
