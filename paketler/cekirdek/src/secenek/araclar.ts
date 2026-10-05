// Seçenekli soru aracı (mcp__arnorg__secenekli_sor): ajan kurula seçenek sunarken numaralı liste yazmak yerine bununla
// sorar. Yanıt beklemez; kurulun seçimi ajana kurul mesajı olarak döner. Mantık index.ts'te; arnorg-araclari.ts listesine
// tek satırla eklenir (girdi onarıcısı oradan sarar).
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { SECENEK_SINIRLARI, kanalGorunenAdi } from "@arnorg/ortak";
import { z } from "zod";
import { dil, iki } from "../dil.js";
import type { Sirket } from "../sirket.js";
import { secenekliSor } from "./index.js";

type Sonuc = { content: { type: "text"; text: string }[]; isError?: boolean };

export function secenekAraclari(sirket: Sirket, ajanId: string) {
  // Seçenek: kısa metin ya da metin ve açıklama (küçük modeller çoğu zaman düz metin listesi verir). Açıklamalar araç
  // kurulurken geçerli dilde üretilir
  const secenekSemasi = z.union([
    z.string().min(1).max(SECENEK_SINIRLARI.metin),
    z.object({
      metin: z.string().min(1).max(SECENEK_SINIRLARI.metin).describe(iki("Seçeneğin kısa metni", "The option's short text")),
      aciklama: z.string().max(SECENEK_SINIRLARI.aciklama).optional().describe(iki("İsteğe bağlı kısa açıklama", "Optional short description")),
    }),
  ]);
  return [
    tool(
      "secenekli_sor",
      iki(
        'Kurula seçenekli soru sorar: soru seçenekleriyle kurulun bulunduğu kanala yazılır (CEO için #yonetim), kurul işaretleyip gönderir. Kapsam, yol, öncelik ya da teknoloji gibi seçenek sunduğun her soruda numaralı liste yazmak yerine bunu kullan; birden çok seçilebiliyorsa coklu: true. Yanıt beklemez: kurulun seçimi sana o kanaldan kurul mesajı olarak gelir ("Kurulun seçimi: 1) …; 3) … · Not: …"). Soruyu ayrıca mesaj_gonder ile yazma.',
        "Asks the board a multiple-choice question: the question and its options are posted to a channel the board is in (#ceo for the CEO) and the board ticks and sends. Use it instead of a numbered list whenever you offer choices such as scope, approach, priority or technology; set coklu: true when several can be chosen. It does not wait: the board's choice comes back to you from that channel as a board message (\"Board's choice: 1) …; 3) … · Note: …\"). Don't also post the question with mesaj_gonder.",
      ),
      {
        soru: z.string().min(3).max(SECENEK_SINIRLARI.soru).describe(iki("Soru; seçenekleri buraya yazma", "The question; don't list the options in it")),
        secenekler: z
          .array(secenekSemasi)
          .min(SECENEK_SINIRLARI.enAz)
          .max(SECENEK_SINIRLARI.enCok)
          .describe(iki("2–12 seçenek, sırasıyla; kısa metin, gerekirse kısa açıklama", "2–12 options in order; a short text, with a short aciklama (description) if needed")),
        coklu: z.boolean().default(false).describe(iki("Birden çok seçenek seçilebilir (ör. kapsam maddeleri)", "Several options can be chosen (e.g. scope items)")),
        serbest_yanit: z.boolean().default(true).describe(iki("Kurul seçmeden kendi yanıtını da yazabilir", "The board may also answer in its own words without choosing")),
        kanal: z
          .string()
          .max(60)
          .optional()
          .describe(
            iki(
              "Kurulun bulunduğu kanal; boşsa CEO için yonetim, ötekiler için yanıt yazdığın kurul kanalı ya da genel",
              "A channel the board is in; if empty, yonetim (#ceo) for the CEO, otherwise the board channel you are replying in or general",
            ),
          ),
      },
      async (a): Promise<Sonuc> => {
        try {
          const ajan = sirket.ajan(ajanId);
          const secenekler = a.secenekler.map((x) => (typeof x === "string" ? { metin: x } : x));
          const s = secenekliSor(sirket, ajan, { soru: a.soru, secenekler, coklu: a.coklu, serbestYanit: a.serbest_yanit, kanal: a.kanal });
          const kanal = `#${kanalGorunenAdi(s.kanal, dil())}`;
          const kimlik = s.mesaj.id.slice(0, 8);
          if (s.onceki) {
            return metin(
              iki(
                `Bu soru ${kanal} kanalında zaten kurulun yanıtını bekliyor (mesaj ${kimlik}); yenisini açmadım. Yanıt gelince sana kurul mesajı olarak ulaşacak.`,
                `This question is already waiting for the board's answer in ${kanal} (message ${kimlik}); I didn't post it again. The answer will reach you as a board message.`,
              ),
            );
          }
          const n = s.mesaj.secim?.secenekler.length ?? a.secenekler.length;
          return metin(
            iki(
              `Seçenekli soru ${kanal} kanalına bırakıldı (mesaj ${kimlik}): ${n} seçenek, ${s.mesaj.secim?.coklu ? "birden çok seçilebilir" : "tek seçim"}. Kurulun seçimi sana bu kanaldan kurul mesajı olarak gelecek ("Kurulun seçimi: …"; numaralar seçeneklerin sırası). Aynı soruyu mesaj_gonder ile yeniden yazma; yanıtı beklerken başka işin varsa sürdür, yoksa turunu bitir.`,
              `Multiple-choice question posted to ${kanal} (message ${kimlik}): ${n} options, ${s.mesaj.secim?.coklu ? "several can be chosen" : "single choice"}. The board's choice will come back to you from this channel as a board message ("Board's choice: …"; the numbers are the options' order). Don't post the question again with mesaj_gonder; carry on with other work while you wait, or end your turn if there is none.`,
            ),
          );
        } catch (h) {
          return { content: [{ type: "text", text: (h as Error).message }], isError: true };
        }
      },
    ),
  ];
}

function metin(t: string): Sonuc {
  return { content: [{ type: "text", text: t }] };
}
