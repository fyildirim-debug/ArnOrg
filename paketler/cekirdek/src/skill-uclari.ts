// Skill kütüphanesinin HTTP ucu (0.0.8): katalog ve rol varsayılanları. Sözleşme: docs/API.md "Skiller".
// Çalışanın skilleri işe alımda (POST /api/projeler/:pid/ajanlar) ve PATCH /api/ajanlar/:aid ile değişir.
import type { SkillKatalogu } from "@arnorg/ortak";
import type { FastifyInstance } from "fastify";
import { skillKatalogu } from "./skiller.js";

export function skillUclariniKur(app: FastifyInstance): void {
  app.get("/api/skiller", async (): Promise<SkillKatalogu> => skillKatalogu());
}
