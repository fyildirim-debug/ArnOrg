// Ortak çalışma uçları (docs/API.md, "Ortak çalışma"): projenin kiraları, temposu, son kayıtları ve geçişte korunan
// eski alanlar; bir kaydın commit farkı; kaydın kalite denetimini yeniden koşma.
import type { FastifyInstance } from "fastify";
import { bulunamadi } from "../yardimci.js";
import type { Sirket } from "../sirket.js";
import { commitFarki } from "./git-kayit.js";

export function ortakUclariniKur(app: FastifyInstance, sirket: Sirket): void {
  const param = (i: { params: unknown }, ad: string) => String((i.params as Record<string, string>)[ad] ?? "");
  app.get("/api/projeler/:pid/ortak", async (i) => sirket.ortak.durum(param(i, "pid")));
  app.get("/api/kayitlar/:kid/fark", async (i) => {
    const k = sirket.ortak.defter.kayit(param(i, "kid"));
    if (!k) throw bulunamadi("Kayıt", "Save");
    const yol = (i.query as Record<string, string | undefined>).yol;
    return commitFarki(sirket.proje(k.projeId).yol, k.commit, yol || undefined);
  });
  app.post("/api/kayitlar/:kid/yeniden", async (i) => sirket.ortak.kalite.yeniden(param(i, "kid")));
}
