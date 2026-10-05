// Seçenekli soruların HTTP ucu: kurulun seçimi (araçla sorulan soru ve #yonetim'deki düz metin liste). Sözleşme:
// docs/API.md "Seçenekli sorular".
import { SECENEK_SINIRLARI } from "@arnorg/ortak";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Sirket } from "../sirket.js";
import { secimYanitla } from "./index.js";

const yanitSemasi = z.object({
  secilenler: z.array(z.number().int().min(1).max(SECENEK_SINIRLARI.enCok)).max(SECENEK_SINIRLARI.enCok).default([]),
  not: z.string().max(SECENEK_SINIRLARI.not).optional(),
});

export function secenekUclariniKur(app: FastifyInstance, sirket: Sirket): void {
  const param = (i: FastifyRequest, ad: string): string => String((i.params as Record<string, string>)[ad] ?? "");
  // Soru kilitlenir, seçim soran ajana kurul mesajı olarak gider (ajan uyanır); yanıt: SecimYanitSonucu
  app.post("/api/mesajlar/:mid/secim", async (i) => secimYanitla(sirket, param(i, "mid"), yanitSemasi.parse(i.body ?? {})));
}
