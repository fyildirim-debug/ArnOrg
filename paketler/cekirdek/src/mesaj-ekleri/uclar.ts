// Mesaj eklerinin HTTP uçları: kurulun yüklemesi (base64 JSON), taslağın silinmesi ve ekin sunulması. Ek mesaja kanal
// mesajı ucunun ekler alanıyla bağlanır (sunucu.ts). Sözleşme: docs/API.md "Mesaj ekleri".
// Sunum: doğru içerik türü, nosniff, Content-Disposition (görsel ve PDF satır içi, metin indirme) ve CSP sandbox. Metin
// (SVG ve HTML de) yalnız text/plain sunulur, tarayıcıda çalışmaz. Erişim öteki API uçları gibi anahtarla.
import fs from "node:fs";
import { EK_SINIRLARI, KURUL, type MesajEki } from "@arnorg/ortak";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Sirket } from "../sirket.js";

/** Yükleme gövdesinin sınırı: base64 (4/3 kat) ve ad sığar */
export const EK_GOVDE_SINIRI = Math.ceil((EK_SINIRLARI.boyut * 4) / 3) + 64 * 1024;

const yukleSemasi = z.object({ ad: z.string().min(1).max(1000), veri: z.string().min(1).max(EK_GOVDE_SINIRI) });

/** Content-Disposition: ASCII yedek ad ve UTF-8 ad (RFC 6266) */
export function icerikYerlesimi(ek: Pick<MesajEki, "ad" | "tur">, indir: boolean): string {
  const yedek = ek.ad.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%;]/g, "_") || "ek";
  const kip = indir || ek.tur === "metin" ? "attachment" : "inline";
  return `${kip}; filename="${yedek}"; filename*=UTF-8''${encodeURIComponent(ek.ad)}`;
}

export function ekUclariniKur(app: FastifyInstance, sirket: Sirket): void {
  const param = (i: FastifyRequest, ad: string): string => String((i.params as Record<string, string>)[ad] ?? "");

  // Dosya base64 gelir: genel 4 MB gövde sınırı bu uçta genişler, dosyanın kendisi 10 MB ile sınırlıdır
  app.post("/api/projeler/:pid/ekler", { bodyLimit: EK_GOVDE_SINIRI }, async (i) => {
    const g = yukleSemasi.parse(i.body ?? {});
    return sirket.ekler.yukle(sirket.proje(param(i, "pid")), g.ad, g.veri, KURUL);
  });
  app.delete("/api/ekler/:id", async (i) => {
    sirket.ekler.sil(param(i, "id"), KURUL);
    return { tamam: true };
  });
  app.get("/api/ekler/:id", async (i, yanit) => {
    const ek = sirket.ekler.bul(param(i, "id"));
    const indir = (i.query as Record<string, string | undefined>).indir === "1";
    yanit
      .header("Content-Type", ek.mime)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Disposition", icerikYerlesimi(ek, indir))
      // Ek bir kez yazılır, değişmez
      .header("Cache-Control", "private, max-age=86400");
    // Görsel ve metin hiçbir betik çalıştıramaz; PDF görüntüleyicisi sandbox'ta açılmadığından onda yok
    if (ek.tur !== "pdf") yanit.header("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    return yanit.send(fs.createReadStream(ek.yol));
  });
}
