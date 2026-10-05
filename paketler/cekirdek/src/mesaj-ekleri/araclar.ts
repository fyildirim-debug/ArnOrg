// Dosya paylaşma aracı (mcp__arnorg__dosya_paylas) ve talimattaki satırlar. Ajan bir görseli ya da dosyayı (kendi aldığı
// ekran görüntüsü, diyagram, rapor) sohbete ek olarak paylaşır: dosya .arnorg/ekler'e kopyalanır, kanala ekli mesaj
// olarak yazılır. CEO'nun varsayılanı kurulla sohbeti (#yonetim), ötekilerin yanıt yazdığı kanal, yoksa #genel.
// Yalnız proje (ekibin çalışma alanları dahil) ve ArnOrg'un geçici klasöründeki dosyalar; gizli dosyalar reddedilir.
// arnorg-araclari.ts listesine tek satırla eklenir (girdi onarıcısı oradan sarar); talimat satırları talimat.ts'ten.
import fs from "node:fs";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { kanalGorunenAdi, kanalKimligi, type Dil } from "@arnorg/ortak";
import { z } from "zod";
import { dil, iki } from "../dil.js";
import { rolBul } from "../roller.js";
import type { Sirket } from "../sirket.js";
import { ArnorgHatasi } from "../yardimci.js";
import { ekGeciciDizini } from "./index.js";
import { boyutMetni } from "./tur.js";

type Sonuc = { content: { type: "text"; text: string }[]; isError?: boolean };

function metin(t: string): Sonuc {
  return { content: [{ type: "text", text: t }] };
}

/** Ajanın ek araçları (arnorg-araclari.ts listesine eklenir) */
export function ekAraclari(sirket: Sirket, ajanId: string) {
  return [
    tool(
      "dosya_paylas",
      iki(
        "Bir görseli ya da dosyayı sohbete ek olarak paylaşır: kurul görseli sohbette görür, dosyayı açar ya da indirir. Ekran görüntüsü, diyagram, rapor gibi kurula ya da ekibe gösterilmesi yararlı olanlar için kullan. Görsel (PNG, JPEG, GIF, WebP), PDF ya da metin ve kod dosyası olabilir, en çok 10 MB. Dosya proje içinde ya da ArnOrg'un geçici klasöründe olmalı; gizli dosyalar paylaşılamaz. Varsayılan kanal: CEO için kurulla sohbet (yonetim), ötekiler için yanıt yazdığın kanal, yoksa genel. Açıklamada @Ad ile andığın çalışan uyarılır ve eki alır.",
        "Shares an image or a file in the conversation as an attachment: the board sees the image in the chat and opens or downloads the file. Use it for what is worth showing the board or the team, such as a screenshot, a diagram or a report. It can be an image (PNG, JPEG, GIF, WebP), a PDF or a text or code file, up to 10 MB. The file must be inside the project or in ArnOrg's temp folder; secret files can't be shared. Default channel: the chat with the board (yonetim) for the CEO, otherwise the channel you are replying in, or general. Employees you @mention in the description are notified and receive the attachment.",
      ),
      {
        yol: z.string().min(1).max(2000).describe(iki("Dosyanın yolu (mutlak ya da çalışma dizinine göre)", "The file's path (absolute or relative to your working directory)")),
        aciklama: z.string().max(4000).optional().describe(iki("Ekle giden kısa mesaj: ne gösterdiği, neye bakılmalı", "A short message sent with it: what it shows, what to look at")),
        kanal: z
          .string()
          .max(60)
          .optional()
          .describe(iki("Kanal; boşsa CEO için yonetim, ötekiler için yanıt yazdığın kanal ya da genel", "Channel; if empty, yonetim (#ceo) for the CEO, otherwise the channel you are replying in or general")),
      },
      async (a): Promise<Sonuc> => {
        try {
          const ajan = sirket.ajan(ajanId);
          const proje = sirket.proje(ajan.projeId);
          const ceo = rolBul(ajan.rol)?.kimlik === "ceo";
          const kanal = a.kanal?.trim() ? kanalKimligi(a.kanal) : ceo ? "yonetim" : (sirket.yazdigiKanal(ajanId) ?? "genel");
          if (kanal === "yonetim" && !ceo) {
            throw new ArnorgHatasi(
              iki("#yonetim kanalı kurul ile CEO arasındadır; kurula göstereceğin şeyi #genel ya da yanıt yazdığın kanalda paylaş.", "#ceo is between the board and the CEO; share what the board should see in #general or the channel you are replying in."),
              403,
            );
          }
          // Göreli yol ajanın çalışma dizinine göre; paylaşılabilen kökler: proje, ekibin çalışma alanları, ArnOrg'un geçici klasörü
          const cwd = ajan.calismaAlani && fs.existsSync(ajan.calismaAlani) ? ajan.calismaAlani : proje.yol;
          const alanlar = sirket.depo.ajanlar(proje.id).flatMap((x) => (x.calismaAlani ? [x.calismaAlani] : []));
          const ek = sirket.ekler.paylas(proje, ajanId, a.yol, { cwd, kokler: [proje.yol, ...alanlar, ekGeciciDizini()] });
          let mesajKanali: string;
          try {
            mesajKanali = (await sirket.mesajGonder(proje.id, kanal, ajanId, a.aciklama ?? "", [ek.id])).kanal;
          } catch (h) {
            // Mesaj yazılamadıysa kopya kalmaz
            sirket.ekler.sil(ek.id, ajanId);
            throw h;
          }
          const ad = `#${kanalGorunenAdi(mesajKanali, dil())}`;
          const tur = ek.tur === "gorsel" ? iki("görsel", "image") : ek.tur === "pdf" ? "PDF" : iki("metin", "text");
          return metin(
            iki(
              `${ek.ad} (${tur}, ${boyutMetni(ek.boyut)}) ${ad} kanalında paylaşıldı; ${mesajKanali === "yonetim" ? "kurul sohbette görüyor" : "kanaldakiler görüyor"}. Ekin kopyası: ${ek.yol}`,
              `${ek.ad} (${tur}, ${boyutMetni(ek.boyut)}) was shared in ${ad}; ${mesajKanali === "yonetim" ? "the board sees it in the chat" : "the channel sees it"}. The attachment's copy: ${ek.yol}`,
            ),
          );
        } catch (h) {
          return { content: [{ type: "text", text: (h as Error).message }], isError: true };
        }
      },
    ),
  ];
}

/**
 * Talimatın kanallar bölümüne giren satırlar: gelen mesajdaki ekler (görsel mesajda, öteki ekler Read ile) ve görsel ya da
 * dosya paylaşmak (teslimden sonra çalışan uygulamanın ekran görüntüsü gibi).
 */
export function ekTalimati(ceo: boolean, d: Dil): string[] {
  const gecici = ekGeciciDizini();
  if (d === "en") {
    return [
      '- Messages can carry attachments: the "Attachments" list at the end gives each name and absolute path. Images within the limits arrive in the message itself; open PDFs, text and code files and large images with Read.',
      `- When a visual helps the board or the team, share it with mcp__arnorg__dosya_paylas (path and a short description): for example a screenshot of the running app after a delivery, a diagram or a report. ${ceo ? "By default it goes to your chat with the board." : "By default it goes to the channel you are replying in, or #general."} Files in the project can be shared as they are; save screenshots you take only to share under ${gecici} so they stay out of the repository. Secret files (.env, keys, certificates) can't be shared.`,
    ];
  }
  return [
    '- Mesajlarda ek olabilir: sondaki "Ekler" listesi her ekin adını ve mutlak yolunu verir. Sınırlar içindeki görseller mesajın içinde gelir; PDF\'yi, metin ve kod dosyasını, büyük görseli Read ile aç.',
    `- Bir görsel kurula ya da ekibe yardımcı olacaksa mcp__arnorg__dosya_paylas ile paylaş (yol ve kısa açıklama): ör. teslimden sonra çalışan uygulamanın ekran görüntüsü, bir diyagram ya da rapor. ${ceo ? "Varsayılan olarak kurulla sohbetine gider." : "Varsayılan olarak yanıt yazdığın kanala, yoksa #genel'e gider."} Projedeki dosyalar olduğu gibi paylaşılır; yalnız paylaşmak için aldığın ekran görüntüsünü repoya girmesin diye ${gecici} altına kaydet. Gizli dosyalar (.env, anahtarlar, sertifikalar) paylaşılamaz.`,
  ];
}
